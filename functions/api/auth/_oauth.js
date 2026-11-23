/**
 * OAuth 登录（Google / GitHub）公共逻辑。
 *
 * 流程：
 *   GET /api/auth/oauth/<provider>            → 302 跳到授权页
 *   GET /api/auth/oauth/<provider>/callback   → 换 token、取邮箱、签发会话
 *
 * 状态防护用签名 Cookie（SameSite=Lax + HttpOnly）：
 *   oauth_state = base64url(payload).hmac
 * payload 里带随机 nonce、provider 和回跳地址，回调时校验签名，
 * 这样不需要服务端存 state 表，也没有开放重定向风险。
 */
import { signSession, verifySession, sessionCookie } from "../_session.js"
import { touchUser } from "../_auth.js"
import { resolveAccount } from "../_account.js"

export const STATE_COOKIE = "oauth_state"
const STATE_TTL_SECONDS = 600

/** provider 配置：授权地址、token 地址、用户信息地址、scope */
export const PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    emailsUrl: "https://api.github.com/user/emails",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
}

export function providerConfigured(env, name) {
  const p = PROVIDERS[name]
  if (!p) return false
  return Boolean(env[p.clientIdEnv] && env[p.clientSecretEnv])
}

export function redirectUri(origin, name) {
  return `${origin}/api/auth/oauth/${name}/callback`
}

/** 只允许站内相对路径 */
export function safeRedirect(raw) {
  const fallback = "/my/bookmarks"
  if (!raw) return fallback
  const s = String(raw)
  if (!s.startsWith("/") || s.startsWith("//")) return fallback
  return s
}

/** 生成 state 并返回 Set-Cookie 值 */
export async function makeStateCookie(secret, provider, redirect) {
  const payload = {
    n: crypto.randomUUID(),
    p: provider,
    r: safeRedirect(redirect),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  }
  const token = await signSession(secret, { ...payload, email: "__state__" })
  return [
    `${STATE_COOKIE}=${token}`,
    "Path=/api/auth/oauth",
    `Max-Age=${STATE_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ")
}

export async function readState(secret, request, provider) {
  const header = request.headers.get("Cookie") || ""
  let raw = null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === STATE_COOKIE) raw = rest.join("=")
  }
  if (!raw) return null
  const payload = await verifySession(secret, raw)
  if (!payload) return null
  if (payload.email !== "__state__") return null
  if (payload.p !== provider) return null
  return payload
}

export function clearStateCookie() {
  return `${STATE_COOKIE}=; Path=/api/auth/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

/** 交换 code → access_token */
export async function exchangeCode(env, name, code, redirect) {
  const p = PROVIDERS[name]
  const body = new URLSearchParams({
    client_id: env[p.clientIdEnv],
    client_secret: env[p.clientSecretEnv],
    code,
    grant_type: "authorization_code",
    redirect_uri: redirect,
  })

  const headers = { "content-type": "application/x-www-form-urlencoded" }
  // GitHub 默认返回 form-encoded，显式要 JSON
  if (name === "github") headers.accept = "application/json"

  const r = await fetch(p.tokenUrl, { method: "POST", headers, body })
  if (!r.ok) {
    const detail = await r.text().catch(() => "")
    console.error(`[oauth:${name}] token failed`, r.status, detail.slice(0, 300))
    return null
  }
  const data = await r.json().catch(() => null)
  return data?.access_token || null
}

/**
 * 取用户邮箱。
 * Google 的 userinfo 直接带 email。
 * GitHub 的 /user 可能没有公开 email，要再查 /user/emails 取 primary+verified。
 */
export async function fetchEmail(name, accessToken) {
  const p = PROVIDERS[name]
  const auth = { authorization: `Bearer ${accessToken}` }

  const r = await fetch(p.userUrl, { headers: { ...auth, accept: "application/json" } })
  if (!r.ok) {
    console.error(`[oauth:${name}] userinfo failed`, r.status)
    return null
  }
  const user = await r.json().catch(() => null)
  if (!user) return null

  if (name === "google") {
    const email = user.email
    if (!email) return null
    // 未验证的 Google 邮箱不可信
    if (user.email_verified === false) return null
    return {
      email: String(email).toLowerCase(),
      name: user.name || null,
      providerUid: String(user.sub || email),
    }
  }

  if (name === "github") {
    // 诊断：把 /user 的关键字段记下来，便于排查「拿不到邮箱」
    console.log(
      "[oauth:github] /user =",
      JSON.stringify({
        login: user.login,
        id: user.id,
        email: user.email,
        hasId: Boolean(user.id),
      }),
    )

    // 先查 /user/emails —— 它比 /user.email 更全，且带 verified 标记。
    // 之前优先用 user.email：那个字段可能是未验证的公开邮箱，
    // 也可能为空（用户设置了隐私），两种情况都会导致登录失败。
    const er = await fetch(p.emailsUrl, {
      headers: { ...auth, accept: "application/json" },
    })
    console.log("[oauth:github] /user/emails status =", er.status)
    if (!er.ok) {
      const body = await er.text().catch(() => "")
      console.log("[oauth:github] /user/emails body =", body.slice(0, 200))
    }
    if (er.ok) {
      const list = await er.json().catch(() => null)
      if (Array.isArray(list) && list.length) {
        // 诊断：把真实情况记到日志，便于排查「拿不到邮箱」
        console.log(
          `[oauth:github] emails=${JSON.stringify(
            list.map((e) => ({ e: e.email, p: e.primary, v: e.verified, vis: e.visibility })),
          )}`,
        )
        // 优先 primary+verified，其次任意 verified
        const pick =
          list.find((e) => e.primary && e.verified) ||
          list.find((e) => e.verified) ||
          null
        if (pick?.email) {
          return {
            email: String(pick.email).toLowerCase(),
            name: user.name || user.login || null,
            providerUid: String(user.id || user.login || pick.email),
          }
        }
        // 一个 verified 都没有。
        //
        // 这里不能直接拒绝登录 —— 用户反馈过「GitHub 登录一直失败」，
        // 而他的账号是正常的，只是没把邮箱设为 primary+verified，
        // 或者 GitHub App 的授权没带 user:email scope（旧授权会复用）。
        //
        // GitHub 给每个账号都提供一个稳定的 noreply 地址：
        //   <id>+<login>@users.noreply.github.com
        // 用它做身份标识是安全的：唯一、稳定、不可伪造，
        // 只是不能用来发信 —— 而登录本来也不需要发信。
        //
        // 用 noreply 登录的账号，之后可以在账号页绑定真实邮箱，
        // resolveAccount 会把它们合并成同一个账号。
        const uid = user.id || user.login
        const login = user.login || "user"
        if (uid) {
          return {
            email: `${uid}+${login}@users.noreply.github.com`.toLowerCase(),
            name: user.name || login,
            providerUid: String(uid),
            needsEmailBind: true,
          }
        }
        return {
          error: "你的 GitHub 账号没有可用邮箱，也没拿到账号 ID。请稍后重试。",
        }
      }
    }

    // 兜底 1：/user.email（公开邮箱）
    if (user.email) {
      return {
        email: String(user.email).toLowerCase(),
        name: user.name || user.login || null,
        providerUid: String(user.id || user.login || user.email),
      }
    }

    // 兜底 2：noreply 地址。
    // 走到这里说明 /user/emails 不可用（常见原因：GitHub App 授权时
    // 用户没同意 user:email scope，而 GitHub 对已授权 App 不会重新询问），
    // 且 /user.email 为空（用户设置了隐私）。
    // 直接拒绝会让登录彻底不可用，用 noreply 兜底保证能登进来。
    const uid = user.id || user.login
    if (uid) {
      return {
        email: `${uid}+${user.login || "user"}@users.noreply.github.com`.toLowerCase(),
        name: user.name || user.login || null,
        providerUid: String(uid),
        needsEmailBind: true,
      }
    }
    return null
  }

  return null
}

/** 登录成功后统一签发会话 */
export async function finishLogin(env, user, redirect) {
  await touchUser(env.DB, user)

  // 解析统一账号：同一个人的 Google / GitHub / 两个邮箱都归到同一个 userId。
  // 失败不阻断登录（退化成按 email 处理），但要记日志。
  let userId = null
  try {
    const acc = await resolveAccount(env.DB, env, {
      provider: user.provider || "email",
      providerUid: user.providerUid || user.email,
      email: user.email,
      name: user.name,
    })
    userId = acc.userId
  } catch (e) {
    console.error("[account] resolveAccount failed", e)
  }

  const days = 30
  const exp = Math.floor(Date.now() / 1000) + days * 86400
  const token = await signSession(env.SESSION_SECRET, {
    email: user.email,
    uid: userId,
    exp,
  })
  return new Response(null, {
    status: 302,
    headers: {
      location: safeRedirect(redirect),
      "cache-control": "no-store",
      "set-cookie": sessionCookie(token, days * 86400),
    },
  })
}
