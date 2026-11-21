/**
 * /my/bookmarks 与 /my/history —— 独立的「我的」页面
 *
 * 不用弹窗：收藏/足迹是成百条的列表，弹窗里翻起来很难受，
 * 也无法分享链接、无法刷新。做成独立页面更合理。
 *
 * 这些页面同样受 Cloudflare Access 保护（与私有站一致）。
 */

const SHELL = (title, body) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · HFH 的笔记</title>
<style>
  :root {
    --light:#fdfdfb; --lightgray:#e8e6e1; --gray:#a3a19b;
    --darkgray:#3c3c39; --dark:#1b1b19; --secondary:#1f5f8b;
    --tertiary:#0d7d74; --highlight:rgba(31,95,139,.08);
    --bodyFont:"Source Sans Pro",-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --light:#14151a; --lightgray:#2a2c34; --gray:#6b6f7a;
      --darkgray:#c6c9d1; --dark:#f1f2f5; --secondary:#6aa9d8;
      --tertiary:#4fc3b8; --highlight:rgba(106,169,216,.12);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:2.5rem 1.25rem 4rem;
    background:var(--light); color:var(--darkgray);
    font-family:var(--bodyFont); line-height:1.7;
  }
  .wrap { max-width: 46rem; margin: 0 auto; }
  .crumb { font-size:.82rem; color:var(--gray); margin-bottom:1.4rem; }
  .crumb a { color:var(--secondary); text-decoration:none; }
  .crumb a:hover { text-decoration:underline; }
  h1 { font-size:1.6rem; margin:0 0 .35rem; color:var(--dark); letter-spacing:-.01em; }
  .sub { color:var(--gray); font-size:.88rem; margin-bottom:1.8rem; }
  ul.list { list-style:none; margin:0; padding:0; }
  ul.list li {
    display:flex; align-items:baseline; gap:.6rem;
    padding:.62rem .3rem; border-bottom:1px solid var(--lightgray);
  }
  ul.list li:last-child { border-bottom:none; }
  ul.list a {
    color:var(--darkgray); text-decoration:none; font-size:.95rem;
    flex:1 1 auto; min-width:0;
  }
  ul.list a:hover { color:var(--secondary); }
  .meta { color:var(--gray); font-size:.76rem; white-space:nowrap; flex:0 0 auto; }
  .empty {
    padding:3rem 1rem; text-align:center; color:var(--gray);
    border:1px dashed var(--lightgray); border-radius:12px;
  }
  .empty a { color:var(--secondary); }
  .actions { margin-top:2rem; display:flex; gap:.6rem; flex-wrap:wrap; }
  button.btn {
    padding:.42rem .85rem; border:1px solid var(--lightgray); border-radius:8px;
    background:transparent; color:var(--darkgray); font-size:.84rem;
    font-family:var(--bodyFont); cursor:pointer; transition:.15s;
  }
  button.btn:hover { border-color:var(--secondary); color:var(--secondary); background:var(--highlight); }
  button.btn.danger:hover { border-color:#c0392b; color:#c0392b; }
</style>
</head>
<body>
<div class="wrap">
  <div class="crumb"><a href="/">首页</a> › ${title}</div>
  ${body}
</div>
</body>
</html>`

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c])
}

function getUser(request) {
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("CF_Authorization="))
      ?.slice("CF_Authorization=".length)
  if (!token) return null
  try {
    const [, payload] = token.split(".")
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const data = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))
    const email = data.email || data.sub
    return email ? { email: String(email).toLowerCase() } : null
  } catch {
    return null
  }
}

const LOGIN_EMPTY = (path) => `<div class="empty">
  这个页面需要登录才能查看。<br><br>
  <a href="/cdn-cgi/access/login?redirect_url=${encodeURIComponent(path)}">点此登录</a>
</div>`

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, "")
  const page = params.page
  const isBookmarks = page === "bookmarks"
  const isHistory = page === "history"

  if (!isBookmarks && !isHistory) {
    return html(`<!doctype html><html><head><meta charset="utf-8"><title>未找到</title></head>
      <body style="font-family:sans-serif;padding:4rem;text-align:center">
      <h1>404</h1><p>没有这个页面。</p><p><a href="/">回首页</a></p></body></html>`, 404)
  }

  const title = isBookmarks ? "我的收藏" : "我的足迹"
  const user = getUser(request)

  if (!user) return html(SHELL(title, LOGIN_EMPTY(path)))

  if (isBookmarks) {
    const rows = await env.DB.prepare(
      `SELECT slug, title, created_at FROM bookmarks
       WHERE email = ? ORDER BY created_at DESC LIMIT 1000`,
    ).bind(user.email).all()
    return html(SHELL(title, renderBookmarks(rows.results ?? [])))
  }

  const rows = await env.DB.prepare(
    `SELECT slug, title, visits, last_seen FROM history
     WHERE email = ? ORDER BY last_seen DESC LIMIT 500`,
  ).bind(user.email).all()
  return html(SHELL(title, renderHistory(rows.results ?? [])))
}

function renderBookmarks(items) {
  const head = `<h1>我的收藏</h1>
    <p class="sub">共 ${items.length} 条${items.length ? "，按收藏时间倒序" : ""}</p>`
  if (!items.length) {
    return head + `<div class="empty">还没有收藏任何笔记。<br><br>
      <a href="/">去逛逛 →</a></div>`
  }
  const lis = items.map((it) => `<li>
      <a href="/${esc(it.slug)}">${esc(it.title || it.slug)}</a>
      <span class="meta">${esc((it.created_at || "").slice(0, 10))}</span>
    </li>`).join("")
  return head + `<ul class="list">${lis}</ul>`
}

function renderHistory(items) {
  const head = `<h1>我的足迹</h1>
    <p class="sub">最近 ${items.length} 篇${items.length ? "，按访问时间倒序" : ""}</p>`
  if (!items.length) {
    return head + `<div class="empty">还没有浏览记录。<br><br>
      <a href="/">去逛逛 →</a></div>`
  }
  const lis = items.map((it) => {
    const when = (it.last_seen || "").slice(0, 16).replace("T", " ")
    const visits = it.visits > 1 ? ` · ${it.visits} 次` : ""
    return `<li>
      <a href="/${esc(it.slug)}">${esc(it.title || it.slug)}</a>
      <span class="meta">${esc(when)}${visits}</span>
    </li>`
  }).join("")
  return head + `<ul class="list">${lis}</ul>
    <div class="actions">
      <button class="btn danger" onclick="clearHistory()">清空足迹</button>
    </div>
    <script>
      async function clearHistory() {
        if (!confirm("确定清空全部浏览足迹？")) return;
        var r = await fetch("/api/history", { method: "DELETE", credentials: "include" });
        if (r.ok) location.reload();
        else alert("清空失败，请稍后再试");
      }
    </script>`
}
