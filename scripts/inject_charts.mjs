/**
 * 榜单渲染：上下分栏 + 每栏独立翻页
 *
 * 布局：不是三列并排，而是「推荐 / 月度热书（片）/ 年度热书（片）」三个
 * 区块上下排列，每个区块内部是网格，底部有翻页控件。
 *
 * 封面必须用下载到本地的路径（cover_local）：豆瓣图床有防盗链，
 * 浏览器 <img> 不带 Referer 会拿到 418，图全部裂开。
 *
 * 用法: node scripts/inject_charts.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PLACEHOLDER = "<!-- LIBRARY_CHARTS -->"

const KINDS = {
  book: {
    dir: "藏书馆",
    labels: { recommend: "推荐", monthly: "月度热书", yearly: "年度热书" },
    perPage: 12,
    cols: 6,
  },
  movie: {
    dir: "观影库",
    labels: { recommend: "推荐", monthly: "月度热片", yearly: "年度热片" },
    perPage: 12,
    cols: 6,
  },
}

const CSS = `
.lc-wrap { margin: 1.6rem 0 2.2rem; }
.lc-section {
  margin-bottom: 2.2rem;
}
.lc-sec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--lightgray);
}
.lc-sec-title {
  margin: 0 !important;
  font-size: 1rem !important;
  font-weight: 600;
  color: var(--dark);
}
.lc-sec-count {
  color: var(--gray);
  font-size: 0.76rem;
  flex: 0 0 auto;
}
.lc-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1.2rem 1rem;
}
.lc-cell { min-width: 0; }
.lc-cover-link {
  display: block;
  width: 100%;
  aspect-ratio: 5 / 7;
  overflow: hidden;
  border-radius: 4px;
  background: var(--lightgray);
  line-height: 0;
}
.lc-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  margin: 0 !important;
  border-radius: 0 !important;
}
.lc-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--gray);
  font-size: 0.66rem;
  text-align: center;
  padding: 0.3rem;
  box-sizing: border-box;
}
.lc-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dark) !important;
  text-decoration: none !important;
}
.lc-title:hover { color: var(--secondary) !important; }
.lc-sub {
  margin-top: 0.12rem;
  color: var(--gray);
  font-size: 0.68rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.2rem;
  font-size: 0.68rem;
}
.lc-link {
  color: var(--secondary) !important;
  text-decoration: none !important;
}
.lc-link:hover { text-decoration: underline !important; }
.lc-nolink { color: var(--gray); }
.lc-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  margin-top: 1rem;
}
.lc-pbtn {
  padding: 0.24rem 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: none;
  color: var(--darkgray) !important;
  font-family: var(--bodyFont);
  font-size: 0.76rem !important;
  cursor: pointer;
}
.lc-pbtn:hover:not(:disabled) {
  border-color: var(--secondary);
  color: var(--secondary) !important;
}
.lc-pbtn:disabled { opacity: 0.35; cursor: default; }
.lc-pinfo { color: var(--gray); font-size: 0.74rem; }
@media (max-width: 1200px) { .lc-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@media (max-width: 900px)  { .lc-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 640px)  { .lc-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 420px)  { .lc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 深度：从页面位置算相对前缀（/藏书馆/ 是 1 层） */
function relPrefix(kind) {
  const depth = KINDS[kind].dir.split("/").length
  return "../".repeat(depth)
}

function renderCell(it, kind, idx, prefix) {
  const name = esc(it.title)
  const url = esc(it.url || "#")

  // 关键：用下载到本地的封面，不用豆瓣远程 URL
  const local = it.cover_local || ""
  const cover = local
    ? `<img class="lc-cover" src="${esc(prefix + local)}" alt="${name}" loading="lazy">`
    : `<div class="lc-cover-empty">无封面</div>`

  let sub = ""
  if (kind === "book") {
    sub = it.author ? esc(it.author) : ""
  } else {
    const bits = []
    if (it.score) bits.push(`★${it.score}`)
    if (it.types && it.types.length) bits.push(esc(it.types[0]))
    if (it.regions && it.regions.length) bits.push(esc(it.regions[0]))
    sub = bits.join(" · ")
  }

  let links = `<a class="lc-link" href="${url}" target="_blank" rel="noopener">豆瓣</a>`
  if (kind === "book") {
    links += it.weread
      ? `<a class="lc-link" href="${esc(it.weread)}" target="_blank" rel="noopener">微信读书</a>`
      : `<span class="lc-nolink">无电子版</span>`
  } else {
    links += it.playable
      ? `<a class="lc-link" href="${url}" target="_blank" rel="noopener">有正版源</a>`
      : `<span class="lc-nolink">暂无正版源</span>`
  }

  return `<div class="lc-cell">
      <a class="lc-cover-link" href="${url}" target="_blank" rel="noopener">${cover}</a>
      <a class="lc-title" href="${url}" target="_blank" rel="noopener">${name}</a>
      ${sub ? `<div class="lc-sub">${sub}</div>` : ""}
      <div class="lc-links">${links}</div>
    </div>`
}

function renderCharts(data, kind) {
  const cfg = KINDS[kind]
  const prefix = relPrefix(kind)
  const keys = ["recommend", "monthly", "yearly"]

  const sections = keys
    .map((key, si) => {
      const items = data[key] || []
      if (!items.length) return ""

      const per = cfg.perPage
      const pages = Math.max(1, Math.ceil(items.length / per))

      // 每栏独立翻页：所有页都渲染出来，靠 CSS/JS 切换
      const pageBlocks = []
      for (let p = 0; p < pages; p++) {
        const slice = items.slice(p * per, (p + 1) * per)
        const cells = slice.map((it, i) => renderCell(it, kind, p * per + i, prefix)).join("")
        pageBlocks.push(
          `<div class="lc-grid" data-page="${p + 1}" style="${p === 0 ? "" : "display:none"}">${cells}</div>`,
        )
      }

      const pager =
        pages > 1
          ? `<div class="lc-pager" data-pager="${si}">
              <button class="lc-pbtn" data-prev="${si}" disabled>← 上一页</button>
              <span class="lc-pinfo" data-info="${si}">第 1 / ${pages} 页</span>
              <button class="lc-pbtn" data-next="${si}">下一页 →</button>
            </div>`
          : ""

      return `<section class="lc-section" data-sec="${si}">
        <div class="lc-sec-head">
          <h4 class="lc-sec-title">${cfg.labels[key]}</h4>
          <span class="lc-sec-count">${items.length} 部</span>
        </div>
        ${pageBlocks.join("")}
        ${pager}
      </section>`
    })
    .join("")

  return `<style>${CSS}</style><div class="lc-wrap">${sections}</div>`
}

/** 每栏翻页的运行时（幂等，重复注入不会重复绑定） */
const RUNTIME = `
(function(){
  function bind(){
    document.querySelectorAll('.lc-section').forEach(function(sec){
      if (sec.dataset.bound) return;
      sec.dataset.bound = '1';
      var grids = Array.from(sec.querySelectorAll('.lc-grid'));
      if (grids.length <= 1) return;
      var prev = sec.querySelector('[data-prev]');
      var next = sec.querySelector('[data-next]');
      var info = sec.querySelector('[data-info]');
      var cur = 1;
      function show(n){
        cur = Math.max(1, Math.min(n, grids.length));
        grids.forEach(function(g, i){ g.style.display = (i === cur - 1) ? '' : 'none'; });
        if (info) info.textContent = '第 ' + cur + ' / ' + grids.length + ' 页';
        if (prev) prev.disabled = cur === 1;
        if (next) next.disabled = cur === grids.length;
      }
      if (prev) prev.addEventListener('click', function(){ show(cur - 1); });
      if (next) next.addEventListener('click', function(){ show(cur + 1); });
      show(1);
    });
  }
  bind();
  document.addEventListener('nav', bind);
})();
`

function inject(distDir) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const candDir = path.join(root, "scripts", "candidates")

  let n = 0
  for (const [kind, cfg] of Object.entries(KINDS)) {
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

    // 幂等：清掉上次注入（含 style + wrap + runtime script）
    html = html.replace(
      /<style>[\s\S]*?\.lc-wrap[\s\S]*?<\/style>\s*<div class="lc-wrap">[\s\S]*?<\/div>\s*(?:<script>[\s\S]*?lc-section[\s\S]*?<\/script>)?/g,
      "",
    )

    const block = renderCharts(data, kind) + `<script>${RUNTIME}</script>`

    if (html.includes(PLACEHOLDER)) {
      html = html.replace(PLACEHOLDER, block)
    } else {
      const m = html.match(/<div class="book-grid"[\s\S]*?<\/div>\s*<script>[\s\S]*?<\/script>/)
      if (m) html = html.replace(m[0], m[0] + block)
      else {
        console.log(`[charts:${kind}] 找不到插入点，跳过`)
        continue
      }
    }

    fs.writeFileSync(pagePath, html, "utf-8")
    const total = Object.values(data).reduce((s, v) => s + v.length, 0)
    const withCover = Object.values(data)
      .flat()
      .filter((x) => x.cover_local).length
    console.log(`[charts:${kind}] ${total} 条（本地封面 ${withCover}）→ ${cfg.dir}/index.html`)
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
