/**
 * GET /login?redirect=/my/bookmarks  → 邮箱验证码登录页
 *
 * 两步式单页：
 *   1. 输邮箱 → POST /api/auth/request-code
 *   2. 输 6 位码 → POST /api/auth/verify-code → 成功后跳转
 *
 * 纯手写，不引入前端框架，保持和其他 /my/* 页面一致的体量。
 */
import { SHELL, html, esc } from "../my/_shared.js"
import { providerConfigured } from "../api/auth/_oauth.js"

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const redirect = safeRedirect(url.searchParams.get("redirect"))
  const siteName = env?.MAIL_FROM_NAME || "HFH 的笔记"

  // 只有配置了凭据的 OAuth 才显示按钮，避免点了报错
  const providers = []
  if (providerConfigured(env, "google")) providers.push("google")
  if (providerConfigured(env, "github")) providers.push("github")

  const oauthBlock = providers.length
    ? `<div class="oauth">
    <div class="oauth-sep"><span>或</span></div>
    ${providers
      .map((p) => {
        const label = p === "google" ? "使用 Google 登录" : "使用 GitHub 登录"
        const icon = p === "google" ? GOOGLE_ICON : GITHUB_ICON
        return `<a class="oauth-btn oauth-${p}"
             href="/api/auth/oauth/${p}?redirect=${encodeURIComponent(redirect)}">
          ${icon}<span>${label}</span>
        </a>`
      })
      .join("\n    ")}
  </div>`
    : ""

  const body = `
<h1>登录</h1>
<p class="sub">输入邮箱，我们会发一个 6 位验证码给你。无需密码、无需注册。</p>

<form id="step1" class="auth-form">
  <label for="email">邮箱</label>
  <input id="email" type="email" name="email" required
         placeholder="you@example.com" autocomplete="email"
         autocapitalize="none" spellcheck="false">
  <button class="btn primary" type="submit" id="sendBtn">发送验证码</button>
</form>

<details class="pwd-block">
  <summary>用密码登录</summary>
  <form id="pwdForm" class="auth-form">
    <label for="pwdEmail">邮箱</label>
    <input id="pwdEmail" type="email" name="email" required
           placeholder="you@example.com" autocomplete="username"
           autocapitalize="none" spellcheck="false">
    <label for="pwdPass">密码</label>
    <input id="pwdPass" type="password" name="password" required
           placeholder="••••••••" autocomplete="current-password">
    <button class="btn primary" type="submit" id="pwdBtn">登录</button>
    <p class="hint" id="pwdHint"></p>
  </form>
</details>

<form id="step2" class="auth-form" hidden>
  <label for="code">验证码</label>
  <input id="code" type="text" name="code" required inputmode="numeric"
         pattern="[0-9]{6}" maxlength="6" placeholder="000000"
         autocomplete="one-time-code"
         style="letter-spacing:.3em;font-family:ui-monospace,Menlo,monospace;font-size:1.3rem">
  <p class="hint" id="sentHint"></p>
  <button class="btn primary" type="submit" id="verifyBtn">登录</button>
  <div class="row">
    <button class="btn link" type="button" id="resendBtn">重新发送</button>
    <button class="btn link" type="button" id="backBtn">换个邮箱</button>
  </div>
</form>

<p class="msg" id="msg" role="status" aria-live="polite"></p>

${oauthBlock}

<p class="foot">
  登录后即可收藏笔记、查看浏览足迹。我们只用你的邮箱区分身份，不发任何推广邮件。
</p>

<style>
  .auth-form { display:flex; flex-direction:column; gap:.55rem; margin:0 0 1.2rem; }
  .auth-form[hidden] { display:none; }
  .auth-form label { font-size:.82rem; color:var(--gray); }
  .auth-form input {
    padding:.62rem .75rem; border:1px solid var(--lightgray); border-radius:9px;
    background:transparent; color:var(--darkgray); font-size:.95rem;
    font-family:var(--bodyFont); outline:none; transition:.15s;
  }
  .auth-form input:focus { border-color:var(--secondary); box-shadow:0 0 0 3px var(--highlight); }
  .btn.primary {
    margin-top:.35rem; padding:.6rem 1rem; border-radius:9px;
    border:1px solid var(--secondary); background:var(--secondary);
    color:#fff; font-size:.92rem; cursor:pointer; font-family:var(--bodyFont);
    transition:.15s;
  }
  .btn.primary:hover:not(:disabled) { filter:brightness(1.08); }
  .btn.primary:disabled { opacity:.55; cursor:default; }
  .btn.link {
    background:none; border:none; padding:.2rem 0; color:var(--secondary);
    font-size:.84rem; cursor:pointer; font-family:var(--bodyFont);
  }
  .btn.link:hover { text-decoration:underline; }
  .row { display:flex; gap:1.1rem; margin-top:.2rem; }
  .hint { font-size:.8rem; color:var(--gray); margin:0; }
  .msg { font-size:.87rem; min-height:1.4em; margin:.4rem 0 1.4rem; }
  .msg.err { color:#c0392b; }
  .msg.ok { color:var(--tertiary); }
  .foot { font-size:.8rem; color:var(--gray); border-top:1px solid var(--lightgray); padding-top:1rem; }

  /* OAuth 区块 */
  .oauth { display:flex; flex-direction:column; gap:.5rem; margin:0 0 1.4rem; }
  .oauth-sep {
    display:flex; align-items:center; gap:.75rem;
    color:var(--gray); font-size:.78rem; margin:.2rem 0 .5rem;
  }
  .oauth-sep::before, .oauth-sep::after {
    content:""; flex:1; height:1px; background:var(--lightgray);
  }
  .oauth-btn {
    display:flex; align-items:center; justify-content:center; gap:.55rem;
    padding:.58rem .9rem; border:1px solid var(--lightgray); border-radius:9px;
    background:transparent; color:var(--darkgray); text-decoration:none;
    font-size:.9rem; font-family:var(--bodyFont); transition:.15s;
  }
  .oauth-btn:hover { border-color:var(--secondary); color:var(--secondary); background:var(--highlight); }
  .oauth-btn svg { width:17px; height:17px; flex:0 0 auto; }
</style>

<script>
(function () {
  var REDIRECT = ${JSON.stringify(redirect)};
  var step1 = document.getElementById("step1");
  var step2 = document.getElementById("step2");
  var emailEl = document.getElementById("email");
  var codeEl = document.getElementById("code");
  var msg = document.getElementById("msg");
  var sentHint = document.getElementById("sentHint");
  var sendBtn = document.getElementById("sendBtn");
  var verifyBtn = document.getElementById("verifyBtn");
  var currentEmail = "";

  function say(text, kind) {
    msg.textContent = text || "";
    msg.className = "msg" + (kind ? " " + kind : "");
  }

  async function post(url, data) {
    var r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data)
    });
    var j = {};
    try { j = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, body: j };
  }

  async function requestCode(email) {
    sendBtn.disabled = true;
    sendBtn.textContent = "发送中…";
    say("");
    try {
      var res = await post("/api/auth/request-code", { email: email });
      if (!res.ok) {
        say(res.body.message || "发送失败，请稍后再试", "err");
        return false;
      }
      currentEmail = email;
      sentHint.textContent = "验证码已发往 " + email + "，10 分钟内有效。没收到就看看垃圾邮件。";
      step1.hidden = true;
      step2.hidden = false;
      codeEl.value = "";
      codeEl.focus();
      say("如果这个邮箱可以登录，验证码已发出。", "ok");
      return true;
    } catch (e) {
      say("网络异常，请检查连接后重试", "err");
      return false;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "发送验证码";
    }
  }

  step1.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = emailEl.value.trim();
    if (!email) { say("请填写邮箱", "err"); return; }
    requestCode(email);
  });

  step2.addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = codeEl.value.trim();
    if (!/^[0-9]{6}$/.test(code)) { say("请输入 6 位数字验证码", "err"); return; }
    verifyBtn.disabled = true;
    verifyBtn.textContent = "验证中…";
    say("");
    try {
      var res = await post("/api/auth/verify-code", { email: currentEmail, code: code });
      if (res.ok) {
        say("登录成功，正在跳转…", "ok");
        location.href = REDIRECT;
        return;
      }
      say(res.body.message || "验证失败", "err");
      codeEl.select();
    } catch (e) {
      say("网络异常，请重试", "err");
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "登录";
    }
  });

  // 密码登录
  var pwdForm = document.getElementById("pwdForm");
  if (pwdForm) {
    pwdForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var pe = document.getElementById("pwdEmail");
      var pp = document.getElementById("pwdPass");
      var pb = document.getElementById("pwdBtn");
      var ph = document.getElementById("pwdHint");
      ph.textContent = "";
      pb.disabled = true;
      pb.textContent = "登录中…";
      try {
        var res = await post("/api/auth/login-password", {
          email: pe.value.trim(),
          password: pp.value,
        });
        if (res.ok) {
          ph.textContent = "登录成功，正在跳转…";
          location.href = REDIRECT;
          return;
        }
        ph.textContent = res.body.message || "登录失败";
        ph.className = "hint err";
      } catch (err) {
        ph.textContent = "网络异常，请重试";
        ph.className = "hint err";
      } finally {
        pb.disabled = false;
        pb.textContent = "登录";
      }
    });
  }

  document.getElementById("resendBtn").addEventListener("click", function () {
    if (currentEmail) requestCode(currentEmail);
  });

  document.getElementById("backBtn").addEventListener("click", function () {
    step2.hidden = true;
    step1.hidden = false;
    say("");
    emailEl.focus();
  });

  emailEl.focus();
})();
</script>`

  return html(SHELL("登录", body))
}

/** 只允许站内相对路径，防止开放重定向 */
function safeRedirect(raw) {
  const fallback = "/my/bookmarks"
  if (!raw) return fallback
  const s = String(raw)
  if (!s.startsWith("/") || s.startsWith("//")) return fallback
  return s
}

/* Google 官方多色 G 标 */
const GOOGLE_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.6 5.1.5.1c4.2-3.9 6.5-9.6 6.5-15.8z"/>
  <path fill="#34A853" d="M24 46c5.9 0 10.9-1.9 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.8 5.3-.1.3C7.9 41.1 15.3 46 24 46z"/>
  <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.8-2.9-.8-4.4s.3-3 .7-4.4l-.1-.3-6.9-5.4-.2.1C2.8 16.6 2 20.2 2 24s.8 7.4 2.2 10.6l7.3-6.2z"/>
  <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.2 29.9 1 24 1 15.3 1 7.9 5.9 4.2 13.4l7.2 5.6C13.2 13.7 18.1 9.5 24 9.5z"/>
</svg>`

/* GitHub 官方 mark */
const GITHUB_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
</svg>`
