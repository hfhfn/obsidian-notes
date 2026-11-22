/**
 * 标签详情页后处理
 *
 * Quartz 的 tag 页（/tags/<tag>）没有面包屑，也没有返回入口，
 * 用户点进去只能靠浏览器后退。
 *
 * 这里给每个 tags/*.html 注入：
 * - 面包屑：Home ❯ 标签索引 ❯ <标签名>（前两级可点）
 * - 隐藏收藏/点赞/分享行与阅读数（检索页不需要）
 *
 * 用法: node scripts/fix_tag_pages.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CSS = `
body.tag-detail-page .na-bar,
body.tag-detail-page .content-meta,
body.tag-detail-page .giscus,
body.tag-detail-page iframe.giscus-frame,
body.tag-detail-page .comments {
  display: none !important;
}
.td-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.9rem;
  font-size: 0.82rem;
  line-height: 1.5;
}
.td-breadcrumb a {
  color: var(--secondary) !important;
  text-decoration: none !important;
  background: none !important;
}
.td-breadcrumb a:hover {
  text-decoration: underline !important;
}
.td-breadcrumb .td-sep {
  color: var(--gray);
  font-size: 0.75rem;
}
.td-breadcrumb .td-current {
  color: var(--darkgray);
}
`

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 从 <h1 class="article-title" ...>xxx</h1> 里取标签名 */
function tagNameFrom(html) {
  const m = /<h1 class="article-title"[^>]*>([\s\S]*?)<\/h1>/.exec(html)
  if (!m) return null
  return m[1].replace(/<[^>]+>/g, "").trim()
}

function fixOne(file) {
  let html = fs.readFileSync(file, "utf-8")

  // 已经处理过就跳过（幂等）
  if (html.includes("td-breadcrumb")) return false

  const name = tagNameFrom(html)
  if (!name) return false

  // 1) 隐藏收藏行：给 body 加类
  // 注意 body 可能没有 class 属性（<body data-slug="tags/agent" data-basepath>），
  // 所以不能只匹配带 class 的情况。
  if (!html.includes("tag-detail-page")) {
    if (/<body[^>]*\sclass="/.test(html)) {
      html = html.replace(/<body([^>]*\sclass=")([^"]*)"/, (m, p1, p2) => {
        return `<body${p1}${p2} tag-detail-page"`
      })
    } else {
      html = html.replace(/<body/, `<body class="tag-detail-page"`)
    }
  }

  // 2) 注入 CSS（只插一次）
  if (!html.includes("td-breadcrumb {")) {
    html = html.replace("</head>", `<style>${CSS}</style></head>`)
  }

  // 3) 在 <h1 class="article-title"> 前插入面包屑
  const crumb =
    `<nav class="td-breadcrumb" aria-label="breadcrumbs">` +
    `<a href="/">Home</a>` +
    `<span class="td-sep">❯</span>` +
    `<a href="/tags">标签索引</a>` +
    `<span class="td-sep">❯</span>` +
    `<span class="td-current">${esc(name)}</span>` +
    `</nav>`

  html = html.replace(/(<h1 class="article-title")/, (m) => crumb + m)

  fs.writeFileSync(file, html, "utf-8")
  return true
}

function run(distDir) {
  const dir = path.join(distDir, "tags")
  if (!fs.existsSync(dir)) {
    console.log("[tag-pages] tags/ 不存在，跳过")
    return 0
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html") && f !== "index.html")

  let n = 0
  for (const f of files) {
    if (fixOne(path.join(dir, f))) n++
  }
  console.log(`[tag-pages] 已为 ${n}/${files.length} 个标签页注入面包屑`)
  return n
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2] || "dist-public"
  run(target)
}

export { run, fixOne }
