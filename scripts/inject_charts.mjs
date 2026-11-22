/**
 * 榜单三栏渲染
 *
 * 把 fetch_douban_charts.py 抓到的 book_charts.json / movie_charts.json
 * 注入到藏书馆、观影库的 <!-- LIBRARY_CHARTS --> 占位符。
 *
 * 三栏：推荐 / 月度热书（片） / 年度热书（片）
 * 每张卡片带两个链接：豆瓣页（元数据）+ 微信读书（书）或在线观看标记（片）
 *
 * 用法: node scripts/inject_charts.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PLACEHOLDER = "<!-- LIBRARY_CHARTS -->"

const TITLES = {
  book: {
    recommend: "推荐",
    monthly: "月度热书",
    yearly: "年度热书",
    dir: "藏书馆",
  },
  movie: {
    recommend: "推荐",
    monthly: "月度热片",
    yearly: "年度热片",
    dir: "观影库",
  },
}

const CSS = `
.lc-wrap {
  margin: 1.4rem 0 2rem;
}
.lc-cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.6rem 1.4rem;
}
.lc-col-title {
  margin: 0 0 0.7rem !important;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--lightgray);
  font-size: 0.95rem !important;
  font-weight: 600;
  color: var(--dark);
}
.lc-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.lc-item {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
.lc-rank {
  flex: 0 0 auto;
  width: 1.1rem;
  color: var(--gray);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  text-align: right;
}
.lc-thumb {
  flex: 0 0 auto;
  width: 34px;
  height: 48px;
  border-radius: 3px;
  object-fit: cover;
  background: var(--lightgray);
  display: block;
}
.lc-thumb-wide {
  width: 48px;
  height: 34px;
}
.lc-info {
  flex: 1 1 auto;
  min-width: 0;
}
.lc-name {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dark) !important;
  text-decoration: none !important;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.lc-name:hover {
  color: var(--secondary) !important;
}
.lc-meta {
  margin-top: 0.1rem;
  color: var(--gray);
  font-size: 0.7rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-links {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.15rem;
  font-size: 0.7rem;
}
.lc-link {
  color: var(--secondary) !important;
  text-decoration: none !important;
}
.lc-link:hover {
  text-decoration: underline !important;
}
.lc-nolink {
  color: var(--gray);
  font-size: 0.7rem;
}
@media (max-width: 900px) {
  .lc-cols {
    grid-template-columns: 1fr;
  }
}
`

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderItem(it, kind, idx) {
  const name = esc(it.title)
  const url = it.url || "#"
  const cover = it.cover || ""

  // 影视封面是竖版海报，书也是竖版；统一 34×48
  const thumb = cover
    ? `<img class="lc-thumb" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="lc-thumb"></span>`

  let meta = ""
  if (kind === "book") {
    meta = it.author ? esc(it.author) : ""
  } else {
    const bits = []
    if (it.score) bits.push(`★ ${it.score}`)
    if (it.types && it.types.length) bits.push(esc(it.types.slice(0, 2).join("/")))
    if (it.regions && it.regions.length) bits.push(esc(it.regions[0]))
    meta = bits.join(" · ")
  }

  let links = `<a class="lc-link" href="${esc(url)}" target="_blank" rel="noopener">豆瓣</a>`
  if (kind === "book") {
    if (it.weread) {
      links += `<a class="lc-link" href="${esc(it.weread)}" target="_blank" rel="noopener">微信读书</a>`
    } else {
      links += `<span class="lc-nolink">无电子版</span>`
    }
  } else {
    if (it.playable) {
      links += `<a class="lc-link" href="${esc(url)}" target="_blank" rel="noopener">有正版源</a>`
    } else {
      links += `<span class="lc-nolink">暂无正版源</span>`
    }
  }

  return `<li class="lc-item">
      <span class="lc-rank">${idx + 1}</span>
      ${thumb}
      <div class="lc-info">
        <a class="lc-name" href="${esc(url)}" target="_blank" rel="noopener">${name}</a>
        ${meta ? `<div class="lc-meta">${meta}</div>` : ""}
        <div class="lc-links">${links}</div>
      </div>
    </li>`
}

function renderCharts(data, kind) {
  const cfg = TITLES[kind]
  const cols = ["recommend", "monthly", "yearly"]
    .map((key) => {
      const items = data[key] || []
      if (!items.length) return ""
      const lis = items.map((it, i) => renderItem(it, kind, i)).join("")
      return `<div class="lc-col">
        <h4 class="lc-col-title">${cfg[key]}</h4>
        <ul class="lc-list">${lis}</ul>
      </div>`
    })
    .join("")
  return `<style>${CSS}</style><div class="lc-wrap"><div class="lc-cols">${cols}</div></div>`
}

function inject(distDir) {
  const candDir = path.join(
    path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    "scripts",
    "candidates",
  )

  let n = 0
  for (const [kind, cfg] of Object.entries(TITLES)) {
    const jsonPath = path.join(candDir, `${kind}_charts.json`)
    if (!fs.existsSync(jsonPath)) {
      console.log(`[charts:${kind}] 缺少 ${kind}_charts.json，跳过`)
      continue
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))

    const pagePath = path.join(distDir, cfg.dir, "index.html")
    if (!fs.existsSync(pagePath)) {
      console.log(`[charts:${kind}] 页面不存在 ${cfg.dir}/index.html`)
      continue
    }

    let html = fs.readFileSync(pagePath, "utf-8")

    // 幂等：先清掉上次注入的块
    html = html.replace(
      /<style>[\s\S]*?\.lc-wrap[\s\S]*?<\/style>\s*<div class="lc-wrap">[\s\S]*?<\/div>\s*<\/div>/g,
      "",
    )

    const block = renderCharts(data, kind)

    if (html.includes(PLACEHOLDER)) {
      html = html.replace(PLACEHOLDER, block)
    } else {
      // 没有占位符就插到卡片网格之后
      const m = html.match(/<div class="book-grid"[\s\S]*?<\/div>\s*<script>[\s\S]*?<\/script>/)
      if (m) {
        html = html.replace(m[0], m[0] + block)
      } else {
        console.log(`[charts:${kind}] 找不到插入点，跳过`)
        continue
      }
    }

    fs.writeFileSync(pagePath, html, "utf-8")
    const total = Object.values(data).reduce((s, v) => s + v.length, 0)
    console.log(`[charts:${kind}] 已注入 ${total} 条到 ${cfg.dir}/index.html`)
    n++
  }
  return n
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  inject(process.argv[2] || "dist-public")
}

export { inject, renderCharts }
