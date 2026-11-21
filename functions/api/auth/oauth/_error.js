/**
 * OAuth 错误页（Google / GitHub 共用）
 */
export function oauthError(title, detail, status = 400) {
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    )

  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
     <title>${esc(title)}</title>
     <style>body{font-family:-apple-system,"PingFang SC",sans-serif;
       max-width:32rem;margin:5rem auto;padding:0 1.25rem;line-height:1.7;color:#333}
       h1{font-size:1.3rem}a{color:#1f5f8b}</style></head>
     <body><h1>${esc(title)}</h1><p>${esc(detail)}</p>
     <p><a href="/login">← 回到登录页</a></p></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  )
}
