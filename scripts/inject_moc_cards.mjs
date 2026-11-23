#!/usr/bin/env node
/**
 * 在目录索引页顶部插入该目录的 MOC（内容地图）卡片。
 *
 * 问题：
 *   点开 /AI/、/工作/ 这类目录页，正文是空的，只有 Quartz 自动生成的
 *   文件夹列表。用户要的是「先看到这个目录的导航」——也就是 MOC。
 *
 * 做法：
 *   构建后扫描 dist，对每个目录 index.html：
 *     1. 找出该目录（含子目录）里文件名带 -MOC 的页面
 *     2. 取它的一级/二级标题作为目录大纲
 *     3. 在 <article> 开头插入一张「本目录导航」卡片，链到 MOC 全文
 *
 * 为什么不在构建前改 markdown：
 *   目录 index.md 是 Quartz 自动生成的，没有实体文件；
 *   而且 MOC 本身已经是一个独立页面，这里只是做「入口聚合」。
 *
 * 幂等：已有 data-moc-card 就跳过。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const MARKER = "data-moc-card"

/** 从 MOC 页面的 HTML 里抽标题大纲 */
function extractOutline(html) {
  const items = []
  // 只取 article 内的 h2/h3，避免把侧边栏、页脚算进来
  const artStart = html.indexOf("<article")
  const artEnd = html.indexOf("</article>", artStart)
  const art = artStart >= 0 ? html.slice(artStart, artEnd) : html

  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/g
  let m
  while ((m = re.exec(art))) {
    const level = Number(m[1])
    // 去掉锚点链接图标等
    let text = m[2]
      .replace(/<a[^>]*class="[^"]*anchor[^"]*"[^>]*>[\s\S]*?<\/a>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
    if (!text) continue
    // 跳过「说明」「关于」这类非导航标题
    if (/^(说明|关于|关于这个|前言|目录)$/.test(text)) continue
    items.push({ level, text })
    if (items.length >= 40) break
  }
  return items
}

/** 找目录下（含子目录）的 MOC 页面 */
function findMocFile(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  // 优先当前目录
  for (const e of entries) {
    if (e.isFile() && /-MOC\.html$/i.test(e.name)) return path.join(dir, e.name)
  }
  return null
}

function relHref(fromDir, toFile, distRoot) {
  let rel = path.relative(fromDir, toFile).split(path.sep).join("/")
  if (!rel.startsWith(".")) rel = "./" + rel
  return rel
}

function buildCard(outline, mocHref, dirName) {
  if (!outline.length) return ""
  const lis = outline
    .map(
      (o) =>
        `<li class="moc-item moc-l${o.level}"><span class="moc-dot"></span>${o.text}</li>`,
    )
    .join("")
  return (
    `<div class="moc-card" ${MARKER}="1">` +
    `<div class="moc-card-head">` +
    `<span class="moc-card-title">📑 本目录导航</span>` +
    `<a class="moc-card-link" href="${mocHref}">查看完整 MOC →</a>` +
    `</div>` +
    `<ul class="moc-outline">${lis}</ul>` +
    `</div>`
  )
}

const CSS = `
.moc-card{margin:0 0 1.6rem;padding:1rem 1.15rem;border:1px solid var(--lightgray);border-radius:10px;background:var(--light)}
.moc-card-head{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-bottom:.7rem;flex-wrap:wrap}
.moc-card-title{font-weight:600;font-size:.95rem;color:var(--dark)}
.moc-card-link{font-size:.82rem;color:var(--secondary);text-decoration:none;white-space:nowrap}
.moc-card-link:hover{text-decoration:underline}
.moc-outline{list-style:none;margin:0;padding:0;columns:2;column-gap:1.6rem}
@media (max-width:800px){.moc-outline{columns:1}}
.moc-item{break-inside:avoid;display:flex;align-items:baseline;gap:.45rem;padding:.16rem 0;font-size:.84rem;color:var(--darkgray);line-height:1.45}
.moc-l3{padding-left:1rem;font-size:.8rem;opacity:.85}
.moc-dot{flex:0 0 auto;width:4px;height:4px;border-radius:50%;background:var(--secondary);opacity:.55;transform:translateY(-2px)}
`

function walk(dir, distRoot, touched) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "static" || e.name === "vendor" || e.name === "tags") continue
      walk(full, distRoot, touched)
    }
  }
  // 处理当前目录的 index.html
  const idx = path.join(dir, "index.html")
  if (!fs.existsSync(idx)) return
  let html = fs.readFileSync(idx, "utf-8")
  if (html.includes(MARKER)) return

  const moc = findMocFile(dir)
  if (!moc) return

  const mocHtml = fs.readFileSync(moc, "utf-8")
  const outline = extractOutline(mocHtml)
  if (!outline.length) return

  const card = buildCard(outline, relHref(dir, moc, distRoot), path.basename(dir))
  if (!card) return

  // 插到 <article> 开头
  const artOpen = html.indexOf("<article")
  if (artOpen < 0) return
  const gt = html.indexOf(">", artOpen)
  if (gt < 0) return
  html = html.slice(0, gt + 1) + card + html.slice(gt + 1)

  // 注入样式（只一次）
  if (!html.includes("/* moc-card */")) {
    const headEnd = html.indexOf("</head>")
    if (headEnd > 0) {
      html = html.slice(0, headEnd) + `<style>/* moc-card */${CSS}</style>` + html.slice(headEnd)
    }
  }

  fs.writeFileSync(idx, html)
  touched.push(path.relative(distRoot, dir) || ".")
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
  if (!target) {
    console.error("用法: node scripts/inject_moc_cards.mjs <dist-dir>")
    process.exit(1)
  }
  const distRoot = path.resolve(target)
  const touched = []
  walk(distRoot, distRoot, touched)
  console.log(`[moc] 注入 ${touched.length} 个目录页: ${touched.join(", ")}`)
}

export { walk as injectMocCards }
