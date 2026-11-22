/**
 * 藏书馆 / 观影库 页面渲染
 *
 * 在 Quartz 构建后，把 `<目录>/index.html` 里的占位符替换成卡片网格。
 * 数据来自 scripts/build_library.py 生成的 `_books.json` / `_movies.json`。
 *
 * 为什么在构建后处理而不是写 Quartz 插件：
 * 卡片网格是纯静态展示，不需要交互；用后处理脚本最简单，
 * 也不用担心 Quartz 的 React hydration 把 DOM 覆盖掉。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// 两类媒体的差异集中在这张表，渲染逻辑共用
const KINDS = {
  book: {
    dir: "藏书馆",
    json: "_books.json",
    label: "本书",
    tabs: [
      { key: "在读", label: "在读" },
      { key: "已读", label: "已读" },
      { key: "想读", label: "想读" },
      { key: "未读完", label: "未读完" },
      { key: "全部", label: "全部" },
    ],
    // 卡片上的信息行顺序（与 build_library.py 的 info_fields 对应）
    infoOrder: ["页数", "开始", "读完"],
  },
  movie: {
    dir: "观影库",
    json: "_movies.json",
    label: "部",
    tabs: [
      { key: "在看", label: "在看" },
      { key: "已看", label: "已看" },
      { key: "想看", label: "想看" },
      { key: "弃剧", label: "弃剧" },
      { key: "全部", label: "全部" },
    ],
    infoOrder: ["年份", "导演", "片长", "集数", "开始", "看完"],
  },
  video: {
    dir: "视频与专题",
    json: "_videos.json",
    label: "条",
    // 视频缩略图是 16:9 横版，和书影的 2:3 竖版不同
    coverRatio: "16 / 9",
    tabs: [
      { key: "已整理", label: "已整理" },
      { key: "整理中", label: "整理中" },
      { key: "待整理", label: "待整理" },
      { key: "全部", label: "全部" },
    ],
    infoOrder: ["时长", "频道", "平台", "整理"],
    // 视频类特有：卡片上显示「看原视频」和衍生笔记角标
    showSourceLink: true,
    showDerived: true,
  },
}

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
        empty.textContent = '这个分类下还没有内容。';
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

function coverSrc(item, depth) {
  const rel = item.cover_local || ""
  if (!rel) return ""
  const up = "../".repeat(depth)
  return up + rel.split("/").map(encodeURIComponent).join("/")
}

function noteHref(item, depth) {
  if (!item.slug) return ""
  const up = "../".repeat(depth)
  const parts = item.slug.split("/")
  const last = parts.pop().toLowerCase().replace(/\s+/g, "-")
  return up + [...parts, last].map(encodeURIComponent).join("/")
}

function renderCard(item, cfg, depth) {
  const cover = coverSrc(item, depth)
  const href = noteHref(item, depth)
  const hasNote = Boolean(item.slug)
  // 视频类：缩略图占满整卡宽度（16:9），不走左侧小图布局
  const wide = Boolean(cfg.coverRatio)
  // 封面点击优先跳数据源（豆瓣/OpenLibrary/TVMaze 原页面），没有才跳笔记
  const coverHref = item.source_url || href
  const coverIsExternal = Boolean(item.source_url)

  const coverInner = cover
    ? `<img src="${cover}" alt="${esc(item.title)}" class="book-cover" loading="lazy">`
    : `<div class="book-cover book-cover-empty">无封面</div>`

  const coverBadge = hasNote ? `<span class="note-badge">笔记</span>` : ""
  // 视频类缩略图是 16:9 横版，书影是 2:3 竖版，用内联样式覆盖
  const ratioStyle = cfg.coverRatio ? ` style="aspect-ratio:${cfg.coverRatio}"` : ""
  const coverBlock = coverHref
    ? `<a href="${esc(coverHref)}" class="book-cover-link"${ratioStyle} title="${esc(item.title)}${
        coverIsExternal ? "（打开数据源）" : ""
      }"${coverIsExternal ? ' target="_blank" rel="noopener"' : ""}>${coverInner}${coverBadge}</a>`
    : `<span class="book-cover-link"${ratioStyle} title="${esc(item.title)}">${coverInner}${coverBadge}</span>`

  const titleBlock = hasNote
    ? `<a href="${href}" title="${esc(item.title)}">${esc(item.title)}</a>`
    : esc(item.title)

  const rating = item.stars
    ? `<div class="book-rating"><span class="stars">${item.stars}</span>${item.rating ? `<span class="score">${esc(item.rating)}</span>` : ""}</div>`
    : ""

  // info 是 {标签: 值} 的字典，按 cfg.infoOrder 排序输出
  const info = item.info || {}
  const infoRows = []
  for (const label of cfg.infoOrder) {
    const val = info[label]
    if (val) {
      infoRows.push(
        `<div class="info-row"><span class="label">${esc(label)}:</span><span>${esc(val)}</span></div>`,
      )
    }
  }

  let progress = ""
  const p = Number(item.progress)
  if (item.progress !== "" && !Number.isNaN(p)) {
    progress = `
      <div class="book-progress"><div class="book-progress-bar" style="width:${Math.max(0, Math.min(100, p))}%"></div></div>
      <div class="book-progress-text">${p}%</div>`
  }

  // 视频类：原视频链接
  let sourceLink = ""
  if (cfg.showSourceLink && item.source_url) {
    const platformLabel =
      item.platform === "bilibili"
        ? "看 B 站"
        : item.platform === "youtube"
          ? "看 YouTube"
          : "看原视频"
    sourceLink = `<a class="book-source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(platformLabel)}</a>`
  }

  // 视频类：衍生笔记角标（思维导图 / 演示文稿 / 信息图）
  const DERIVED_LABELS = {
    mindmap: "思维导图",
    slides: "演示文稿",
    infographic: "信息图",
    audio: "音频概览",
    report: "报告",
    flashcards: "闪卡",
    quiz: "测验",
  }
  let derivedBadges = ""
  if (cfg.showDerived && Array.isArray(item.derived) && item.derived.length) {
    derivedBadges =
      `<div class="derived-badges">` +
      item.derived
        .map((d) => `<span class="derived-badge">${esc(DERIVED_LABELS[d] || d)}</span>`)
        .join("") +
      `</div>`
  }

  // 视频类走宽图布局：缩略图占满整卡宽度，标题信息在下方
  const cardBody = wide
    ? `
      <div class="book-cover-wide">${coverBlock}</div>
      <div class="book-body">
        <h3 class="book-title">${titleBlock}</h3>
        <div class="book-subtitle" title="${esc(item.creator)}">${esc(item.creator)}</div>
        ${rating}
        ${infoRows.length ? `<div class="book-info">${infoRows.join("")}</div>` : ""}
        ${derivedBadges}
        ${progress}
        ${sourceLink}
      </div>`
    : `
      <div class="book-header">
        <div class="book-cover-wrapper">${coverBlock}</div>
        <div class="book-title-section">
          <h3 class="book-title">${titleBlock}</h3>
          <div class="book-subtitle" title="${esc(item.creator)}">${esc(item.creator)}</div>
        </div>
      </div>
      ${rating}
      ${infoRows.length ? `<div class="book-info">${infoRows.join("")}</div>` : ""}
      ${derivedBadges}
      ${progress}
      ${sourceLink}`

  return `
    <div class="book-card${hasNote ? " has-note" : ""}${wide ? " book-card-wide" : ""}" data-status="${esc(item.status)}">
      ${cardBody}
    </div>`
}

function renderTabs(cfg, active) {
  return cfg.tabs
    .map(
      (t) =>
        `<button type="button" role="tab" data-target="${esc(t.key)}" aria-selected="${t.key === active}">${esc(t.label)}</button>`,
    )
    .join("")
}

/**
 * 把封面图从 content 目录复制到构建产物。
 *
 * 为什么需要手动复制：Quartz 只复制被 Markdown 引用的附件，
 * 而封面是我们在构建后注入的 <img> 里用的，Quartz 不知道它的存在。
 */
function copyCovers(distDir, items) {
  let copied = 0
  for (const it of items) {
    const rel = it.cover_local
    if (!rel) continue
    const dest = path.join(distDir, rel)
    if (fs.existsSync(dest)) continue
    // 封面源在 content-all（build_library.py 下载到这里）
    const candidates = [
      path.join(distDir, "..", "content-all", rel),
      path.join(distDir, "..", "content-public", rel),
    ]
    const src = candidates.find((p) => fs.existsSync(p))
    if (!src) continue
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    copied++
  }
  return copied
}

/**
 * 把某一类媒体注入到它的页面。
 * @returns {number} 注入的条目数，跳过时返回 0
 */
export function injectKind(distDir, kind) {
  const cfg = KINDS[kind]
  if (!cfg) {
    console.error(`[library] 未知类别: ${kind}`)
    return 0
  }

  const pagePath = path.join(distDir, cfg.dir, "index.html")
  const dataPath = path.join(distDir, cfg.dir, cfg.json)

  if (!fs.existsSync(pagePath)) {
    console.log(`[${kind}] 跳过：${pagePath} 不存在`)
    return 0
  }
  if (!fs.existsSync(dataPath)) {
    console.log(`[${kind}] 跳过：${dataPath} 不存在`)
    return 0
  }

  let items
  try {
    items = JSON.parse(fs.readFileSync(dataPath, "utf-8"))
  } catch (e) {
    console.error(`[${kind}] JSON 解析失败: ${e.message}`)
    return 0
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.log(`[${kind}] 没有数据，跳过`)
    return 0
  }

  // 页面在 dist/<目录>/index.html。目录可能是 探索/藏书馆 这样的多层，
  // 所以层数要按 cfg.dir 里的路径段数算，不能硬编码。
  const depth = cfg.dir.split("/").length
  const cards = items.map((it) => renderCard(it, cfg, depth)).join("")
  const tabs = renderTabs(cfg, "全部")

  const block = `
    <div class="library-tabs" data-for="${kind}" role="tablist">${tabs}</div>
    <div class="book-grid" data-for="${kind}" data-active="全部">${cards}</div>
    <script>${FILTER_JS}</script>
  `

  let html = fs.readFileSync(pagePath, "utf-8")

  // 给 body 打标记：三个库的索引页要隐藏阅读时间、收藏点赞分享行、Properties
  if (!html.includes('class="library-page"')) {
    html = html.replace(/<body([^>]*)>/, '<body$1 class="library-page">')
  }

  // 幂等：重复运行时先清掉上一次注入的块（含内联脚本）
  const INJECTED_RE =
    /<div class="library-tabs"[\s\S]*?<div class="book-grid"[\s\S]*?<\/div>\s*<script>[\s\S]*?<\/script>/g
  const hadInjected = INJECTED_RE.test(html)
  if (hadInjected) {
    html = html.replace(INJECTED_RE, "")
  }

  if (html.includes(PLACEHOLDER)) {
    html = html.replace(PLACEHOLDER, block)
  } else {
    // 占位符已被上次注入消耗掉，或笔记里本来就没写占位符。
    // 优先插到 <article> 里第一个 </h1> 之后；
    // 但索引页可能没有正文 H1（标题由 frontmatter 的 title 渲染），
    // 这时退化为插到 <article ...> 开标签之后。
    const m = html.match(/<article[^>]*>[\s\S]*?<\/h1>/)
    if (m) {
      html = html.replace(m[0], m[0] + block)
    } else {
      const m2 = html.match(/<article[^>]*>/)
      if (!m2) {
        console.log(`[${kind}] 找不到 <article>，跳过`)
        return html
      }
      html = html.replace(m2[0], m2[0] + block)
    }
  }

  fs.writeFileSync(pagePath, html, "utf-8")

  // 封面图不在 Markdown 里引用，Quartz 不会复制，必须手动搬过去
  const covers = copyCovers(distDir, items)

  console.log(
    `[${kind}] 已注入 ${items.length} ${cfg.label}到 ${cfg.dir}/index.html` +
      (covers ? `（复制封面 ${covers} 张）` : ""),
  )
  return items.length
}

/** 注入所有类别。 */
export function injectLibrary(distDir) {
  let total = 0
  for (const kind of Object.keys(KINDS)) {
    total += injectKind(distDir, kind)
  }
  return total
}

// 直接运行时：node scripts/inject_library.mjs dist-public [kind]
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
  const kind = process.argv[3]
  if (!target) {
    console.error("用法: node scripts/inject_library.mjs <dist-dir> [book|movie]")
    process.exit(1)
  }
  if (kind) {
    injectKind(path.resolve(target), kind)
  } else {
    injectLibrary(path.resolve(target))
  }
}
