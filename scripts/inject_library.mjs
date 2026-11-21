/**
 * 藏书馆页面渲染
 *
 * 在 Quartz 构建后，把 `藏书馆/index.html` 里的占位符替换成卡片网格。
 * 数据来自 scripts/build_library.py 生成的 `_books.json`。
 *
 * 为什么在构建后处理而不是写 Quartz 插件：
 * 卡片网格是纯静态展示，不需要交互；用后处理脚本最简单，
 * 也不用担心 Quartz 的 React hydration 把 DOM 覆盖掉。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const STATUS_TABS = [
  { key: "在读", label: "在读" },
  { key: "已读", label: "已读" },
  { key: "想读", label: "想读" },
  { key: "未读完", label: "未读完" },
  { key: "全部", label: "全部" },
]

const PLACEHOLDER = "<!-- LIBRARY_GRID -->"

// 标签页筛选逻辑。内联进页面，避免 Quartz 不复制 quartz/static 下的文件。
const FILTER_JS = `
(function(){
  function apply(tabs, grid, key){
    grid.querySelectorAll('.book-card').forEach(function(c){
      var st = c.getAttribute('data-status') || '';
      c.style.display = (key === '全部' || st === key) ? '' : 'none';
    });
    var wrap = grid.parentElement;
    var empty = wrap.querySelector('.library-empty');
    var visible = [].filter.call(grid.querySelectorAll('.book-card'), function(c){
      return c.style.display !== 'none';
    }).length;
    if (visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'library-empty';
        empty.textContent = '这个分类下还没有书。';
        grid.parentNode.insertBefore(empty, grid.nextSibling);
      }
      empty.style.display = '';
    } else if (empty) {
      empty.style.display = 'none';
    }
  }
  function setup(){
    document.querySelectorAll('.library-tabs').forEach(function(tabs){
      var grid = tabs.nextElementSibling;
      while (grid && !grid.classList.contains('book-grid')) grid = grid.nextElementSibling;
      if (!grid) return;
      if (tabs.dataset.bound === '1') return;
      tabs.dataset.bound = '1';
      tabs.querySelectorAll('button').forEach(function(btn){
        btn.addEventListener('click', function(){
          tabs.querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-selected','false'); });
          btn.setAttribute('aria-selected','true');
          apply(tabs, grid, btn.getAttribute('data-target') || '全部');
        });
      });
      var active = tabs.querySelector('button[aria-selected="true"]');
      if (active) apply(tabs, grid, active.getAttribute('data-target') || '全部');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
  document.addEventListener('nav', setup);
})();
`

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function coverSrc(book, depth) {
  const rel = book.cover_local || ""
  if (!rel) return ""
  // 从当前页面到站点根的相对路径
  const up = "../".repeat(depth)
  return up + rel.split("/").map(encodeURIComponent).join("/")
}

function noteHref(book, depth) {
  if (!book.slug) return ""
  const up = "../".repeat(depth)
  // slug 形如 "藏书馆/如何阅读一本书"
  const parts = book.slug.split("/")
  // 最后一段是文件名，需要小写化（Quartz 的 slug 规则）
  const last = parts.pop().toLowerCase().replace(/\s+/g, "-")
  return up + [...parts, last].map(encodeURIComponent).join("/")
}

function renderCard(book, depth) {
  const cover = coverSrc(book, depth)
  const href = noteHref(book, depth)
  const hasNote = Boolean(book.slug)

  const coverInner = cover
    ? `<img src="${cover}" alt="${esc(book.title)}" class="book-cover" loading="lazy">`
    : `<div class="book-cover" style="display:flex;align-items:center;justify-content:center;color:var(--gray);font-size:.7rem">无封面</div>`

  const coverBlock = hasNote
    ? `<a href="${href}" class="book-cover-link" title="${esc(book.title)}">${coverInner}${hasNote ? '<span class="note-badge">笔记</span>' : ""}</a>`
    : `<span class="book-cover-link" title="${esc(book.title)}">${coverInner}</span>`

  const titleBlock = hasNote
    ? `<a href="${href}" title="${esc(book.title)}">${esc(book.title)}</a>`
    : esc(book.title)

  const rating = book.stars
    ? `<div class="book-rating"><span class="stars">${book.stars}</span>${book.rating ? `<span class="score">${esc(book.rating)}</span>` : ""}</div>`
    : ""

  const infoRows = []
  if (book.pages) infoRows.push(`<div class="info-row"><span class="label">页数:</span><span>${esc(book.pages)}</span></div>`)
  if (book.started) infoRows.push(`<div class="info-row"><span class="label">开始:</span><span>${esc(book.started)}</span></div>`)
  if (book.finished) infoRows.push(`<div class="info-row"><span class="label">读完:</span><span>${esc(book.finished)}</span></div>`)

  let progress = ""
  const p = Number(book.progress)
  if (book.progress !== "" && !Number.isNaN(p)) {
    progress = `
      <div class="book-progress"><div class="book-progress-bar" style="width:${Math.max(0, Math.min(100, p))}%"></div></div>
      <div class="book-progress-text">${p}%</div>`
  }

  return `
    <div class="book-card${hasNote ? " has-note" : ""}" data-status="${esc(book.status)}">
      <div class="book-header">
        <div class="book-cover-wrapper">${coverBlock}</div>
        <div class="book-title-section">
          <h3 class="book-title">${titleBlock}</h3>
          <div class="book-subtitle" title="${esc(book.author)}">${esc(book.author)}</div>
        </div>
      </div>
      ${rating}
      ${infoRows.length ? `<div class="book-info">${infoRows.join("")}</div>` : ""}
      ${progress}
    </div>`
}

function renderTabs(active) {
  return STATUS_TABS.map(
    (t) =>
      `<button type="button" role="tab" data-target="${esc(t.key)}" aria-selected="${t.key === active}">${esc(t.label)}</button>`,
  ).join("")
}

export function injectLibrary(dir) {
  const pagePath = path.join(dir, "藏书馆", "index.html")
  const dataPath = path.join(dir, "藏书馆", "_books.json")

  if (!fs.existsSync(pagePath)) {
    console.log(`[library] 跳过：${pagePath} 不存在`)
    return 0
  }
  if (!fs.existsSync(dataPath)) {
    console.log(`[library] 跳过：${dataPath} 不存在`)
    return 0
  }

  let books
  try {
    books = JSON.parse(fs.readFileSync(dataPath, "utf-8"))
  } catch (e) {
    console.error(`[library] JSON 解析失败: ${e.message}`)
    return 0
  }

  if (!Array.isArray(books) || books.length === 0) {
    console.log("[library] 没有书籍数据，跳过")
    return 0
  }

  // 页面在 dist/藏书馆/index.html，到站点根是 1 层
  const depth = 1

  const cards = books.map((b) => renderCard(b, depth)).join("")
  const tabs = renderTabs("全部")

  const block = `
    <div class="library-tabs" data-for="book" role="tablist">${tabs}</div>
    <div class="book-grid" data-active="全部">${cards}</div>
    <script>${FILTER_JS}</script>
  `

  let html = fs.readFileSync(pagePath, "utf-8")

  // 幂等：重复运行时先清掉上一次注入的块（含内联脚本）
  const INJECTED_RE =
    /<div class="library-tabs"[\s\S]*?<div class="book-grid"[\s\S]*?<\/div>\s*<script>[\s\S]*?<\/script>/g
  const hadInjected = INJECTED_RE.test(html)
  if (hadInjected) {
    html = html.replace(INJECTED_RE, "")
  }

  if (html.includes(PLACEHOLDER)) {
    html = html.replace(PLACEHOLDER, block)
  } else if (hadInjected) {
    // 占位符已被上次注入消耗掉，插回原来的位置：找到正文里第一个 <hr/> 或 article 末尾
    const m = html.match(/<article[^>]*>[\s\S]*?<\/h1>/)
    if (m) {
      html = html.replace(m[0], m[0] + block)
    } else {
      console.log("[library] 找不到插入点，跳过")
      return 0
    }
  } else {
    // 没有占位符时，插到 <article> 的第一个 h1 之后
    const m = html.match(/<article[^>]*>[\s\S]*?<\/h1>/)
    if (!m) {
      console.log("[library] 找不到插入点，跳过")
      return 0
    }
    html = html.replace(m[0], m[0] + block)
  }

  fs.writeFileSync(pagePath, html, "utf-8")
  console.log(`[library] 已注入 ${books.length} 本书到 藏书馆/index.html`)
  return books.length
}

// 直接运行时：node scripts/inject_library.mjs dist-public
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
  if (!target) {
    console.error("用法: node scripts/inject_library.mjs <dist-dir>")
    process.exit(1)
  }
  injectLibrary(path.resolve(target))
}
