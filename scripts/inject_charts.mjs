/**
 * 榜单渲染：三个标签页 + 每页分页
 *
 * 布局：推荐 / 月度热书（片）/ 年度热书（片）做成三个标签页，
 * 点标签切换，不再上下平铺。每个标签页内部再分页（每页 12 条）。
 *
 * 封面必须用下载到本地的路径（cover_local）：豆瓣图床有防盗链，
 * 浏览器 <img> 不带 Referer 会拿到 418，图全部裂开。
 *
 * 用法: node scripts/inject_charts.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import { inlineScript } from "./_inline.mjs"
import { fileURLToPath } from "node:url"

// 用真实元素而不是 HTML 注释：Quartz 渲染 md 时会把裸注释挪到 body 末尾，
// 导致榜单被插到 footer 后面（用户反馈「推荐热榜都没了」）。
const PLACEHOLDER = '<div id="library-charts-slot"></div>'
const PLACEHOLDER_ALT = "<!-- LIBRARY_CHARTS -->"

const KINDS = {
  book: {
    dir: "藏书馆",
    labels: { recommend: "推荐", monthly: "月度热书", yearly: "年度热书" },
    // 「我的」标签跟随登录用户，数据来自 /api/collections
    mine: {
      wish: "想读",
      doing: "在读",
      done: "读过",
    },
    // 榜单网格 .lc-grid 默认 6 列 → 每页 6 × 2 = 12 条（两整行）
    perPage: 12,
  },
  movie: {
    dir: "观影库",
    labels: { recommend: "推荐", monthly: "月度热片", yearly: "年度热片" },
    mine: {
      wish: "想看",
      doing: "在看",
      done: "看过",
    },
    perPage: 12,
  },
}

const CSS = `
.lc-wrap { margin: 1.6rem 0 2.2rem; }
.lc-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.1rem;
  border-bottom: 1px solid var(--lightgray);
  padding-bottom: 0.5rem;
}
.lc-tab {
  padding: 0.3rem 0.85rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: none;
  color: var(--darkgray) !important;
  font-family: var(--bodyFont);
  font-size: 0.82rem !important;
  cursor: pointer;
  transition: all 0.15s;
}
.lc-tab:hover { border-color: var(--secondary); color: var(--secondary) !important; }
.lc-tab[aria-selected="true"] {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--light) !important;
  font-weight: 600;
}
.lc-panel[hidden] { display: none; }
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
/* 星级行：和笔记卡的 book-rating 视觉一致 */
.lc-rating {
  margin-top: 0.18rem;
  font-size: 0.72rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lc-rating .lc-score {
  color: var(--gray);
  font-size: 0.68rem;
  margin-left: 0.15rem;
}
.lc-sub {
  margin-top: 0.1rem;
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
.lc-link { color: var(--secondary) !important; text-decoration: none !important; }
.lc-link:hover { text-decoration: underline !important; }
.lc-nolink { color: var(--gray); }

/* 标记按钮 */
.lc-mark {
  display: block;
  width: 100%;
  margin-bottom: 0.35rem;
  padding: 0.22rem 0.4rem;
  border: 1px dashed var(--lightgray);
  border-radius: 5px;
  background: none;
  color: var(--gray) !important;
  font-family: var(--bodyFont);
  font-size: 0.68rem !important;
  cursor: pointer;
  transition: all 0.15s;
}
.lc-mark:hover {
  border-color: var(--secondary);
  color: var(--secondary) !important;
  border-style: solid;
}
.lc-mark[data-status] {
  border-style: solid;
  font-weight: 600;
}
/* 标记按钮上移后，未标记时留一条虚线占位，避免有无标记的卡片错位 */
.lc-mark:not([data-status]) {
  opacity: 0.55;
}
.lc-mark[data-status="wish"]  { border-color: #6aa9d8; color: #6aa9d8 !important; }
.lc-mark[data-status="doing"] { border-color: #e8a33d; color: #e8a33d !important; }
.lc-mark[data-status="done"]  { border-color: #0d7d74; color: #0d7d74 !important; }
.lc-mark:disabled { opacity: 0.5; cursor: default; }

/* 「我的」书架 */
.lc-mine-status {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1rem;
}
.lc-mine-tab {
  padding: 0.24rem 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: none;
  color: var(--darkgray) !important;
  font-family: var(--bodyFont);
  font-size: 0.78rem !important;
  cursor: pointer;
}
.lc-mine-tab:hover { border-color: var(--secondary); color: var(--secondary) !important; }
.lc-mine-tab[aria-selected="true"] {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--light) !important;
  font-weight: 600;
}
.lc-mine-list {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1.2rem 1rem;
}
.lc-mine-empty {
  grid-column: 1 / -1;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--gray);
  font-size: 0.88rem;
  border: 1px dashed var(--lightgray);
  border-radius: 8px;
}
.lc-mine-empty a { color: var(--secondary) !important; }
.lc-cell-remove {
  display: block;
  width: 100%;
  margin-top: 0.3rem;
  padding: 0.18rem 0.4rem;
  border: 1px solid transparent;
  border-radius: 5px;
  background: none;
  color: var(--gray) !important;
  font-family: var(--bodyFont);
  font-size: 0.66rem !important;
  cursor: pointer;
}
.lc-cell-remove:hover {
  border-color: #d9534f;
  color: #d9534f !important;
}

/* 书架卡片移除：封面右上角的圆形 ×，默认半透明，
   悬停才明显 —— 不占版面、不打断卡片信息流。 */
.book-card { position: relative; }
.shelf-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 3;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff !important;
  font-size: 0.95rem !important;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.book-card:hover .shelf-remove { opacity: 0.75; }
.shelf-remove:hover { opacity: 1 !important; background: #d9534f; }
.shelf-remove:disabled { opacity: 0.4; cursor: default; }

/* 页内提示条：替代 alert/confirm。
   alert 会阻塞页面、部分浏览器静默拦截，用户看不到任何反馈。 */
#site-toast {
  position: fixed;
  left: 50%;
  bottom: 2rem;
  transform: translateX(-50%) translateY(1rem);
  z-index: 99999;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(90vw, 28rem);
  padding: 0.7rem 1rem;
  border-radius: 10px;
  background: #1f2430;
  color: #f2f2f4;
  font-size: 0.85rem;
  line-height: 1.5;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
}
#site-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
#site-toast .t-msg { flex: 1; }
#site-toast .t-act {
  flex: none;
  padding: 0.2rem 0.7rem;
  border: 1px solid rgba(255,255,255,0.35);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}
#site-toast .t-act:hover { background: rgba(255,255,255,0.14); }
#site-toast.is-error { background: #7a2e2e; }
#site-toast.is-ok { background: #1e5f4f; }

/* 视频卡「公开站隐藏」按钮：和 shelf-remove 同位置同形态 */
.vid-hide {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 3;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff !important;
  font-size: 0.78rem !important;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.book-card:hover .vid-hide { opacity: 0.75; }
.vid-hide:hover { opacity: 1 !important; background: #e8a33d; }
.vid-hide[data-hidden="1"] { opacity: 0.85; background: #d9534f; }
.vid-hide:disabled { opacity: 0.4; cursor: default; }

/* 公开站已隐藏的卡片：加一层淡红描边提示管理员 */
.book-card.is-hidden-public { outline: 2px dashed #d9534f; outline-offset: 2px; }
.book-card.is-hidden-public .book-cover { opacity: 0.55; }

/* 进度条 */
.lc-prog {
  height: 3px;
  margin-top: 0.22rem;
  border-radius: 2px;
  background: var(--lightgray);
  overflow: hidden;
}
.lc-prog-bar {
  height: 100%;
  background: #e8a33d;
  transition: width 0.2s;
}
.lc-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  margin-top: 1.2rem;
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
.lc-pbtn:hover:not(:disabled) { border-color: var(--secondary); color: var(--secondary) !important; }
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

function relPrefix(kind) {
  const depth = KINDS[kind].dir.split("/").length
  return "../".repeat(depth)
}

function renderCell(it, kind, prefix) {
  const name = esc(it.title)
  const url = esc(it.url || "#")

  const local = it.cover_local || ""
  const cover = local
    ? `<img class="lc-cover" src="${esc(prefix + local)}" alt="${name}" loading="lazy">`
    : `<div class="lc-cover-empty">无封面</div>`

  // 星级串：豆瓣 10 分制 → 5 星（和笔记卡 book-rating 一致）
  const starStr = (score) => {
    const s = parseFloat(score)
    if (!s || isNaN(s)) return ""
    const n = Math.round(s / 2)
    const full = "⭐".repeat(Math.max(1, Math.min(5, n)))
    return full
  }

  // 榜单卡统一两行：
  //   第 1 行 rating —— ⭐⭐⭐⭐⭐ 9.7（有评分才有）
  //   第 2 行 meta   —— 作者 / 类型 · 地区 · 年份（缺失自动跳过）
  // 之前全挤在一行，书籍和影视字段顺序还不一致，看起来乱。
  const ratingBits = []
  if (it.score)
    ratingBits.push(`${starStr(it.score)} <span class="lc-score">${esc(it.score)}</span>`)

  const metaBits = []
  if (kind === "book") {
    if (it.author) metaBits.push(esc(it.author))
  } else {
    // 豆瓣第一个类型几乎都是「剧情」，信息量低 —— 取前两个
    if (it.types && it.types.length) {
      metaBits.push(esc(it.types.slice(0, 2).join(" / ")))
    }
    if (it.regions && it.regions.length) metaBits.push(esc(it.regions[0]))
  }
  if (it.year) metaBits.push(esc(it.year))

  const rating = ratingBits.join(" ")
  const sub = metaBits.join(" · ")

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

  // item_key 用豆瓣 id，和 collections 表对上
  const did = it.douban_id || ""
  const itemKey = did ? `${kind}:${did}` : ""

  // data-cover 必须带 ../ 前缀：不带的话插到书架里 img src 是
  // attachments/... 而页面在 /观影库/，路径少一层 → 全部裂图。
  // data-meta 把卡片要展示的元信息一起带上，书架卡才能渲染得和笔记卡一致。
  const meta = {
    score: it.score || "",
    types: it.types || [],
    regions: it.regions || [],
    actors: it.actors || [],
    author: it.author || "",
    year: it.year || "",
    duration: it.duration || "",
    weread: it.weread || "",
    playable: Boolean(it.playable),
  }

  const markBtn = itemKey
    ? `<button class="lc-mark" data-item="${itemKey}" data-kind="${kind}"
         data-title="${name}" data-cover="${esc(prefix + local)}" data-url="${url}"
         data-meta="${esc(JSON.stringify(meta))}">+ 标记</button>`
    : ""

  // 标记按钮放封面之上：放在下方时每张卡片高度不一，整排参差不齐；
  // 提到上方后与封面顶部对齐，视觉更整齐。
  return `<div class="lc-cell" data-item="${itemKey}">
      ${markBtn}
      <a class="lc-cover-link" href="${url}" target="_blank" rel="noopener">${cover}</a>
      <a class="lc-title" href="${url}" target="_blank" rel="noopener">${name}</a>
      ${rating ? `<div class="lc-rating">${rating}</div>` : ""}
      ${sub ? `<div class="lc-sub">${sub}</div>` : ""}
      <div class="lc-links">${links}</div>
    </div>`
}

function renderCharts(data, kind) {
  const cfg = KINDS[kind]
  const prefix = relPrefix(kind)
  const keys = ["recommend", "monthly", "yearly"].filter((k) => (data[k] || []).length)

  // 不再单独加「我的」标签：页面顶部那排（在读/已读/想读/全部）
  // 本身就是「我的」书架，两个入口会让人困惑。
  const tabs = keys
    .map(
      (k, i) =>
        `<button class="lc-tab" role="tab" data-tab="${i}" aria-selected="${i === 0 ? "true" : "false"}">${cfg.labels[k]}</button>`,
    )
    .join("")

  const panels = keys
    .map((key, si) => {
      const items = data[key] || []
      const per = cfg.perPage
      const pages = Math.max(1, Math.ceil(items.length / per))

      const pageBlocks = []
      for (let p = 0; p < pages; p++) {
        const slice = items.slice(p * per, (p + 1) * per)
        const cells = slice.map((it) => renderCell(it, kind, prefix)).join("")
        pageBlocks.push(
          `<div class="lc-grid" data-page="${p + 1}" style="${p === 0 ? "" : "display:none"}">${cells}</div>`,
        )
      }

      const pager =
        pages > 1
          ? `<div class="lc-pager" data-tab="${si}" data-pages="${pages}">
              <button class="lc-pbtn" data-first="${si}" disabled title="第一页">« 首页</button>
              <button class="lc-pbtn" data-prev="${si}" disabled>← 上一页</button>
              <span class="lc-pinfo" data-info="${si}">第 1 / ${pages} 页</span>
              <button class="lc-pbtn" data-next="${si}">下一页 →</button>
              <button class="lc-pbtn" data-last="${si}" title="最后一页">末页 »</button>
              <span class="lc-jump">跳至 <input class="lc-jump-input" type="number" min="1" max="${pages}" value="1" inputmode="numeric" data-jump="${si}"> 页</span>
            </div>`
          : ""

      return `<div class="lc-panel" role="tabpanel" data-panel="${si}"${si === 0 ? "" : " hidden"}>
        ${pageBlocks.join("")}
        ${pager}
      </div>`
    })
    .join("")

  return `<style>${CSS}</style><div class="lc-wrap" data-kind="${kind}">
    <div class="lc-tabs" role="tablist">${tabs}</div>
    ${panels}
  </div><!--/lc-wrap-->`
}

/** 标签切换 + 分页的运行时（幂等） */
const RUNTIME = `
(function(){
  function bind(){
    document.querySelectorAll('.lc-wrap').forEach(function(wrap){
      if (wrap.dataset.bound) return;
      wrap.dataset.bound = '1';

      // 标签切换
      var tabs = Array.from(wrap.querySelectorAll('.lc-tab'));
      var panels = Array.from(wrap.querySelectorAll('.lc-panel'));
      tabs.forEach(function(tab){
        tab.addEventListener('click', function(){
          var idx = Number(tab.dataset.tab);
          tabs.forEach(function(t){ t.setAttribute('aria-selected', String(t === tab)); });
          panels.forEach(function(p, i){ p.hidden = (i !== idx); });
        });
      });

      // 每个面板内部分页
      panels.forEach(function(panel){
        var grids = Array.from(panel.querySelectorAll('.lc-grid'));
        if (grids.length <= 1) return;
        var prev = panel.querySelector('[data-prev]');
        var next = panel.querySelector('[data-next]');
        var first = panel.querySelector('[data-first]');
        var last = panel.querySelector('[data-last]');
        var info = panel.querySelector('[data-info]');
        var jump = panel.querySelector('.lc-jump-input');
        var cur = 1;
        function show(n){
          cur = Math.max(1, Math.min(n, grids.length));
          grids.forEach(function(g, i){ g.style.display = (i === cur - 1) ? '' : 'none'; });
          if (info) info.textContent = '第 ' + cur + ' / ' + grids.length + ' 页';
          if (prev) prev.disabled = cur === 1;
          if (next) next.disabled = cur === grids.length;
          if (first) first.disabled = cur === 1;
          if (last) last.disabled = cur === grids.length;
          if (jump && String(jump.value) !== String(cur)) jump.value = cur;
        }
        if (prev) prev.addEventListener('click', function(){ show(cur - 1); });
        if (next) next.addEventListener('click', function(){ show(cur + 1); });
        if (first) first.addEventListener('click', function(){ show(1); });
        if (last) last.addEventListener('click', function(){ show(grids.length); });
        if (jump) {
          function commit(){
            var v = parseInt(jump.value, 10);
            if (!isNaN(v)) show(v);
            else jump.value = cur;
          }
          jump.addEventListener('keydown', function(ev){
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); jump.blur(); }
          });
          jump.addEventListener('blur', commit);
          jump.addEventListener('click', function(ev){ ev.stopPropagation(); });
        }
        show(1);
      });
    });
  }
  // ---- 站内标记 ----
  //
  // 两套文案必须严格对应 inject_library.mjs 里 KINDS[*].tabs 的 key，
  // 否则卡片 data-status 和标签 data-target 匹配不上，标记完不会出现在
  // 对应标签页（用户反馈「观影库想看没出现在想看标签」就是这个问题：
  // 原来 done 写「看过」，而标签 key 是「已看」）。
  var LABELS = {
    book:  { wish: '想读', doing: '在读', done: '已读' },
    movie: { wish: '想看', doing: '在看', done: '已看' }
  };

  // data-status 一律存英文 key（wish / doing / done）：
  //   - CSS 高亮用 [data-status="wish"] 匹配
  //   - cycle() 直接 indexOf 推进
  //   - 中文文案只在 textContent 和书架卡 data-status 上出现
  // 上一轮把它改成中文，导致高亮 CSS 全部失配（用户反馈「不高亮了」）。
  function paint(btn, status, progress){
    var kind = btn.getAttribute('data-kind');
    var lb = LABELS[kind] || LABELS.book;
    if (status) {
      btn.setAttribute('data-status', status);
      btn.textContent = (status === 'done' ? '✓ ' : '● ') + (lb[status] || status);
      if (progress > 0 && progress < 100) btn.textContent += ' ' + progress + '%';
    } else {
      btn.removeAttribute('data-status');
      btn.textContent = '+ 标记';
    }
  }

  function cycle(btn){
    var order = ['wish', 'doing', 'done'];
    var cur = btn.getAttribute('data-status');
    var idx = order.indexOf(cur);
    // 未标记 → wish → doing → done → 移除
    if (idx === -1) return { status: 'wish', progress: 0 };
    if (idx < order.length - 1) return { status: order[idx + 1], progress: 0 };
    return null;  // 已到 done，再点就是移除
  }

  async function save(btn, status, progress){
    var payload = {
      itemKey: btn.getAttribute('data-item'),
      kind: btn.getAttribute('data-kind'),
      title: btn.getAttribute('data-title'),
      cover: btn.getAttribute('data-cover') || '',
      url: btn.getAttribute('data-url') || '',
      status: status,
      progress: progress || 0
    };
    var r;
    try {
      r = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
    } catch (e) {
      window.__lastMark = { stage: 'fetch-threw', error: String(e), payload: payload };
      return { ok: false, error: 'fetch_failed' };
    }

    // 401 也要把 body 读出来（含 login_required），否则无法区分
    // 「未登录」和「网络失败」，用户只看到按钮没反应。
    var body = null;
    try { body = await r.json(); } catch (e) { body = { ok: false, error: 'http_' + r.status }; }

    // 诊断：把这次请求的完整结果留在 window 上，方便排查
    window.__lastMark = {
      stage: 'done',
      httpStatus: r.status,
      ok: r.ok,
      requestPayload: payload,
      response: body
    };
    return body;
  }

  async function remove(btn){
    var key = btn.getAttribute('data-item');
    var r = await fetch('/api/collections?itemKey=' + encodeURIComponent(key), {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    return r.ok;
  }

  function bindMarks(){
    document.querySelectorAll('.lc-mark').forEach(function(btn){
      if (btn.dataset.mkBound) return;
      btn.dataset.mkBound = '1';
      btn.addEventListener('click', async function(ev){
        ev.preventDefault();
        ev.stopPropagation();

        var next = cycle(btn);
        btn.disabled = true;
        try {
          if (next === null) {
            var ok = await remove(btn);
            if (ok) {
              paint(btn, null, 0);
              syncToShelf(btn, null);
            } else toast('移除失败，请先登录', { actionLabel: '去登录', onAction: function(){ gotoLogin(); }, duration: 8000 });
          } else {
            var res = await save(btn, next.status, next.progress);
            if (res && res.ok) {
              paint(btn, next.status, next.progress);
              syncToShelf(btn, next.status);
            } else if (res && res.error === 'login_required') {
              // 未登录：给页内提示 + 可点的「去登录」，不用 confirm 阻塞页面
              toast('标记需要先登录', {
                actionLabel: '去登录',
                onAction: function(){ gotoLogin(); },
                duration: 8000
              });
            } else {
              toast('标记失败：' + ((res && res.error) || '未知错误'), { kind: 'error' });
            }
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // 页面加载后拉一次用户已有标记，回填按钮状态
  async function loadMarks(){
    var btns = document.querySelectorAll('.lc-mark');
    if (!btns.length) return;
    var kind = btns[0].getAttribute('data-kind');
    try {
      var r = await fetch('/api/collections?kind=' + kind, { credentials: 'same-origin' });
      if (!r.ok) return;
      var d = await r.json();
      if (!d.authed) return;
      var map = {};
      (d.items || []).forEach(function(it){ map[it.item_key] = it; });
      btns.forEach(function(btn){
        var it = map[btn.getAttribute('data-item')];
        if (it) paint(btn, it.status, it.progress);
      });
    } catch (e) { /* 未登录静默 */ }
  }

  function initMarks(){
    bindMarks();
    loadMarks();
  }

  // ---- 标记联动顶部书架 ----
  // 页面顶部那排（在读/已读/想读/全部）就是「我的」书架，
  // 标记后把卡片插进对应分区，用户切过去就能看到，不用另开标签。
  // 状态 → 标签文案，必须按 kind 分开。
  // 之前只有一套书籍文案，电影也套用它 —— 电影标记后 data-status 写成
  // 「想读」，而观影库标签是「想看」，永远匹配不上，标记完不出现。
  var STATUS_TO_TAB = {
    book:  { wish: '想读', doing: '在读', done: '已读' },
    movie: { wish: '想看', doing: '在看', done: '已看' },
  };
  var STATUS_TO_TAB_VIDEO = { wish: '待整理', doing: '整理中', done: '已整理' };

  function bookGridFor(kind){
    // 页面上可能有多个 book-grid，取属于本库的那个
    var grids = Array.from(document.querySelectorAll('.book-grid'));
    return grids.find(function(g){ return g.getAttribute('data-for') === kind; }) || grids[0] || null;
  }

  // 标记变化后，把这张卡同步进顶部书架
  // 书架卡片的 HTML：结构和笔记卡片一致（封面 + 标题 + 作者/评分 + 信息行 + 进度），
  // 否则新标记的卡片只有标题和状态，和已有笔记卡长得完全不一样（用户截图反馈）。
  function shelfCardHtml(btn, tab){
    var kind = btn.getAttribute('data-kind');
    var title = btn.getAttribute('data-title') || '';
    var cover = btn.getAttribute('data-cover') || '';
    var url = btn.getAttribute('data-url') || '#';
    var itemKey = btn.getAttribute('data-item');

    var meta = {};
    try { meta = JSON.parse(btn.getAttribute('data-meta') || '{}'); } catch (e) {}

    var coverHtml = cover
      ? '<img class="book-cover" src="' + cover + '" alt="" loading="lazy">'
      : '<div class="book-cover book-cover-empty">无封面</div>';

    // 评分统一用 ⭐ 星星串（用户要求保留 ⭐ 显示，和笔记卡一致）
    function starStr(score){
      var s = parseFloat(score);
      if (!s || isNaN(s)) return '';
      var n = Math.round(s / 2);   // 豆瓣 10 分制 → 5 星
      return '⭐'.repeat(Math.max(1, Math.min(5, n)));
    }

    // 副标题：书 = 作者 · ⭐评分，影视 = ⭐评分 · 类型 · 地区
    var sub = '';
    if (kind === 'book') {
      var b = [];
      if (meta.author) b.push(meta.author);
      if (meta.score) b.push(starStr(meta.score) + ' ' + meta.score);
      sub = b.join(' · ');
    } else {
      var bits = [];
      if (meta.score) bits.push(starStr(meta.score) + ' ' + meta.score);
      if (meta.types && meta.types.length) bits.push(meta.types[0]);
      if (meta.regions && meta.regions.length) bits.push(meta.regions[0]);
      sub = bits.join(' · ');
    }

    // 信息行：顺序和笔记卡完全一致（同一套字段名），缺失的自动跳过。
    // 用户要求「统一显示一样的字段」，所以这里不能各写一套。
    var rows = [];
    function row(label, val){
      if (val) rows.push('<div class="info-row"><span class="label">' + label + ':</span><span>' + val + '</span></div>');
    }
    function joinArr(a){ return (a && a.length) ? a.join(' / ') : ''; }

    // 不显示「状态」行：状态由顶部标签页表达，卡片上重复是噪音。
    // 「评分」也不在这显示 —— 已用 ⭐ 放在副标题里，和笔记卡一致。
    row('年份', meta.year);
    if (kind === 'book') {
      row('作者', meta.author);
    } else {
      row('类型', joinArr(meta.types));
      row('地区', joinArr(meta.regions));
    }

    var infoHtml = rows.length ? '<div class="book-info">' + rows.join('') + '</div>' : '';

    return '<button class="shelf-remove" data-item="' + itemKey + '" title="从书架移除" aria-label="移除">×</button>' +
      '<a class="book-cover-link" href="' + url + '" target="_blank" rel="noopener">' + coverHtml + '</a>' +
      '<h3 class="book-title">' + title + '</h3>' +
      (sub ? '<div class="book-subtitle">' + sub + '</div>' : '') +
      infoHtml;
  }

  function syncToShelf(btn, status){
    var kind = btn.getAttribute('data-kind');
    var grid = bookGridFor(kind);
    if (!grid) return;

    var itemKey = btn.getAttribute('data-item');
    var map = STATUS_TO_TAB[kind] || STATUS_TO_TAB.book;
    var tab = map[status] || map.wish;

    // 先移除这个条目在书架里的旧卡（可能改过状态）
    grid.querySelectorAll('[data-shelf-item]').forEach(function(el){
      if (el.getAttribute('data-shelf-item') === itemKey) el.remove();
    });

    if (!status) return;  // 移除标记就不插

    var cell = document.createElement('div');
    cell.className = 'book-card';
    cell.setAttribute('data-status', tab);
    cell.setAttribute('data-shelf-item', itemKey);
    cell.setAttribute('data-item', itemKey);
    cell.innerHTML = shelfCardHtml(btn, tab);

    // 移除：点角落的 ×
    cell.querySelector('.shelf-remove').addEventListener('click', async function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      var rm = ev.currentTarget;
      rm.disabled = true;
      try {
        var r = await fetch('/api/collections?itemKey=' + encodeURIComponent(itemKey), {
          method: 'DELETE', credentials: 'same-origin'
        });
        if (r.ok) {
          cell.remove();
          document.querySelectorAll('.lc-mark[data-item="' + itemKey + '"]').forEach(function(b){
            paint(b, null, 0);
          });
        } else {
          toast('移除失败，请先登录', { actionLabel: '去登录', onAction: function(){ gotoLogin(); }, duration: 8000 });
          rm.disabled = false;
        }
      } catch (e) {
        toast('移除失败：' + e, { kind: 'error' });
        rm.disabled = false;
      }
    });

    grid.appendChild(cell);

    // 通知顶部书架重新筛选/分页
    grid.dispatchEvent(new CustomEvent('shelf-changed', { bubbles: true }));
  }

  // 页面加载后，把用户已有的标记回填到按钮，并同步到书架
  // 带重试的 fetch：登录跳转刚完成时，cookie 可能有几十毫秒的延迟，
  // 第一次请求会拿到 authed:false。之前直接 continue 不重试，
  // 导致「登录后必须手动刷新才看到已标记的书」。
  async function fetchWithRetry(url, opts, tries){
    tries = tries || 3;
    for (var i = 0; i < tries; i++) {
      try {
        var r = await fetch(url, opts);
        if (r.ok) {
          var d = await r.json();
          if (d && d.authed === false && i < tries - 1) {
            // 可能是 cookie 还没就绪，等一会儿重试
            await new Promise(function(res){ setTimeout(res, 300); });
            continue;
          }
          return d;
        }
        if (r.status === 401 && i < tries - 1) {
          await new Promise(function(res){ setTimeout(res, 300); });
          continue;
        }
        try { return await r.json(); } catch (e) { return null; }
      } catch (e) {
        if (i === tries - 1) return null;
        await new Promise(function(res){ setTimeout(res, 300); });
      }
    }
    return null;
  }

  async function hydrateMarks(){
    var btns = Array.from(document.querySelectorAll('.lc-mark'));
    if (!btns.length) return;

    // 书架页数据灌入。
    //
    // 关键认知：静态卡片（3 本书 / 2 部电影）不是「初始化占位数据」，
    // 它们是**这个站真实拥有笔记页的书**。未登录时看到它们是对的，
    // 登录后它们也应该在 —— 除非用户明确移除过（status=hidden）。
    //
    // 所以正确逻辑不是「隐藏 → 等 → 换成用户数据」，而是：
    //   静态卡原地不动 + 用户标记的卡叠加进来
    // 这样无论登录与否都不需要隐藏任何东西，自然没有闪烁。
    //
    // 之前的错误做法（已回滚）：
    //   ① 给网格加 .is-hydrating 藏起来，等数据到了再显示
    //      → 等待期间一片空白，且 hydrateMarks 被 MutationObserver
    //        反复触发，每次都藏一次，就是用户看到的「一直在闪」
    //   ② 登录后把静态卡整体清掉，只留用户数据
    //      → 那 3 本有笔记页的书会凭空消失，反而丢了内容
    //
    // 唯一需要处理的：同一本书如果既是静态卡又在用户书架里，
    // 只更新它的状态，不要插第二张（见下面 existing 判断）。
    await hydrateMarksData(btns);
  }

  // 真正的数据灌入逻辑。首屏和后续刷新共用。
  async function hydrateMarksData(btns){

    var byKind = {};
    btns.forEach(function(b){
      var k = b.getAttribute('data-kind');
      (byKind[k] = byKind[k] || []).push(b);
    });

    for (var kind of Object.keys(byKind)) {
      try {
          var d = await fetchWithRetry('/api/collections?kind=' + kind, { credentials: 'same-origin' });

          // 未登录：什么都不做。静态卡片就是最终内容，不隐藏、不替换。
          if (!d || !d.authed) continue;

          var map = {};
          (d.items || []).forEach(function(it){ map[it.item_key] = it; });

          byKind[kind].forEach(function(btn){
            var key = btn.getAttribute('data-item');
            var it = map[key];
            if (!it) return;

            paint(btn, it.status, it.progress);

            // status=hidden 表示用户移除过这条，不插卡。
            if (it.status === 'hidden') return;

            // 同一本书如果已经有静态卡（来自笔记 frontmatter），
            // 只更新它的状态，不要再插一张 —— 否则同一本书会出现两张卡，
            // 分别落在不同标签里（用户反馈「同时出现在想读和已读」）。
            var existing = document.querySelector(
              '.book-grid .book-card[data-item="' + key + '"]'
            );
            if (existing) {
              var map2 = STATUS_TO_TAB[kind] || STATUS_TO_TAB.book;
              existing.setAttribute('data-status', map2[it.status] || map2.wish);
              var g2 = existing.closest('.book-grid');
              if (g2) g2.dispatchEvent(new CustomEvent('shelf-changed', { bubbles: true }));
              return;
            }

            syncToShelf(btn, it.status);
          });

          // 移除用户删掉过的卡片（status=hidden）。
          //
          // 两类卡都要处理：
          //   ① 静态卡（笔记 frontmatter）—— 服务端每次都渲染，必须前端过滤
          //   ② 用户卡（syncToShelf 插的）—— 一般不会带 hidden，
          //      但用户可能在别的设备删过，保险起见一起扫
          //
          // 用属性选择器一次匹配所有 hidden 的 key，避免逐个 querySelectorAll。
          var hiddenKeys = (d.items || [])
            .filter(function(it){ return it.status === 'hidden'; })
            .map(function(it){ return it.item_key; });
          var removedAny = false;
          if (hiddenKeys.length) {
            var sel = hiddenKeys.map(function(k){
              return '.book-card[data-item="' + k.replace(/"/g, '\\"') + '"]';
            }).join(',');
            document.querySelectorAll(sel).forEach(function(card){
              card.remove();
              removedAny = true;
            });
          }
          if (removedAny) {
            document.querySelectorAll('.book-grid').forEach(function(g){
              g.dispatchEvent(new CustomEvent('shelf-changed', { bubbles: true }));
            });
          }
        } catch (e) { /* 未登录静默 */ }
      }
  }

  // 首次加载必须显式调用：'nav' 只在 Quartz 的 SPA 导航时触发，
  // 直接打开页面不会触发，之前漏了这行导致标记按钮完全没绑定。
  // 笔记卡上的移除按钮：始终显示。
  // 原有书籍来自笔记 frontmatter，不是用户标记加的，
  // 所以「移除」= 写一条 hidden 记录，前端把它过滤掉（跨设备生效）。
  function bindShelfRemoves(){
    document.querySelectorAll('.book-grid .shelf-remove').forEach(function(btn){
      if (btn.dataset.rmBound) return;
      btn.dataset.rmBound = '1';

      btn.addEventListener('click', async function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var key = btn.getAttribute('data-item');
        var card = btn.closest('.book-card');
        btn.disabled = true;

        try {
          // 先尝试删除（用户自己标记的那条）
          await fetch('/api/collections?itemKey=' + encodeURIComponent(key), {
            method: 'DELETE', credentials: 'same-origin'
          });

          // 再写一条 hidden，让笔记卡本身也不显示
          var r = await fetch('/api/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              itemKey: key,
              // kind 必须准确：shelf-remove 按钮本身没有 data-kind，
              // 之前回退成 'book'，导致电影被存成 kind='book'，
              // hydrate 时按 kind 拉数据拉不到，卡片刷新后又出现。
              // 从 item_key 前缀推断最可靠（movie:xxx / book:xxx / video:xxx）。
              kind: (function(){
                var k = btn.getAttribute('data-kind');
                if (k) return k;
                var m = /^(book|movie|video):/.exec(key || '');
                if (m) return m[1];
                if (card && card.classList.contains('book-card-wide')) return 'video';
                return 'book';
              })(),
              title: (card && card.querySelector('.book-title') || {}).textContent || '',
              status: 'hidden',
              progress: 0
            })
          });

          // 响应不是 JSON 说明被中间层拦了（Access 302 跳登录页 / 网关错误页），
          // 明确告诉用户，不要静默失败。
          var d = null;
          try {
            d = await r.json();
          } catch (e) {
            toast('操作失败：服务端返回的不是 JSON（HTTP ' + r.status + '）', { kind: 'error' });
            return;
          }

          if (d && d.ok) {
            if (card) card.remove();
            document.querySelectorAll('.lc-mark[data-item="' + key + '"]').forEach(function(b){
              paint(b, null, 0);
            });
          } else if (d && d.error === 'login_required') {
            // 只弹提示，不自动跳转 —— 自动跳走会让用户以为什么都没发生
            toast('移除需要先登录', { actionLabel: '去登录', onAction: function(){ gotoLogin(); }, duration: 8000 });
          } else {
            toast('移除失败：' + ((d && d.error) || '未知错误'), { kind: 'error' });
            btn.disabled = false;
          }
        } catch (e) {
          toast('移除失败：' + e, { kind: 'error' });
          btn.disabled = false;
        }
      });
    });
  }

  // 视频卡的「👁 隐藏」：只在公开站隐藏，私有站不受影响。
  // 需要管理员权限（这个开关改的是公开站，不是个人书架）。
  function bindVideoHide(){
    document.querySelectorAll('.vid-hide').forEach(function(btn){
      if (btn.dataset.hideBound) return;
      btn.dataset.hideBound = '1';

      btn.addEventListener('click', async function(ev){
        ev.preventDefault();
        ev.stopPropagation();

        var slug = btn.getAttribute('data-slug');
        if (!slug) return;

        var nowHidden = btn.getAttribute('data-hidden') === '1';
        var next = !nowHidden;
        var card = btn.closest('.book-card');
        var titleEl = card ? card.querySelector('.book-title') : null;
        var cardTitle = titleEl ? (titleEl.textContent || '').trim() : '';

        // 直接执行，不经过确认弹层。
        // 之前用 toast + onAction 两步确认，但 toast 在部分路径下没渲染出来
        // （用户反馈「点了没反应」），操作根本没机会发出。
        // 隐藏是可逆的（再点一次恢复），不需要二次确认。
        applyVisibility(btn, slug, next, cardTitle);
      });
    });
  }

  async function applyVisibility(btn, slug, next, cardTitle){
        btn.disabled = true;
        try {
          var r = await fetch('/api/video-visibility', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ slug: slug, hidden: next })
          });
          // 响应不是 JSON 说明被中间层拦了（Access 302 跳登录页 / 网关错误页），
          // 明确告诉用户，不要静默失败。
          var d = null;
          try {
            d = await r.json();
          } catch (e) {
            toast('操作失败：服务端返回的不是 JSON（HTTP ' + r.status + '）', { kind: 'error' });
            return;
          }

          if (d && d.ok) {
            btn.setAttribute('data-hidden', next ? '1' : '0');
            btn.textContent = next ? '🚫' : '👁';
            btn.title = next ? '已在公开站隐藏（点击恢复）' : '在公开站隐藏这条';
            var card2 = btn.closest('.book-card');
            if (card2) card2.classList.toggle('is-hidden-public', next);
            toast(
              next
                ? '已在公开站隐藏' + (cardTitle ? '《' + cardTitle + '》' : '')
                : '已恢复公开显示' + (cardTitle ? '《' + cardTitle + '》' : '')
            );
          } else if (d && d.code === 'forbidden') {
            toast('只有管理员能设置公开/隐藏', { kind: 'error' });
          } else if (d && d.error === 'login_required') {
            toast('请先登录（需要管理员账号）', { actionLabel: '去登录', onAction: function(){ gotoLogin(); }, duration: 8000 });
          } else {
            toast('操作失败：' + ((d && d.error) || '未知错误'), { kind: 'error' });
          }
        } catch (e) {
          toast('操作失败：' + e, { kind: 'error' });
        } finally {
          btn.disabled = false;
        }
  }

  // 页面加载后处理隐藏状态。
  //
  // 两个站职责不同（构建时就决定了，见 inject_library 的 IS_PRIVATE）：
  //   公开站：不渲染隐藏按钮 → 这里只做「按隐藏列表过滤卡片」，
  //           让管理员刚隐藏的条目对普通读者立即消失，无需重新构建。
  //   私有站：渲染隐藏按钮 → 这里回填每个按钮的状态（🚫/👁），不过滤卡片，
  //           因为私有站就是要看全部。
  async function hydrateVideoHide(){
    var btns = document.querySelectorAll('.vid-hide');
    var isPrivate = /^private\./.test(location.hostname);

    // 公开站即使没有按钮也要拉名单 —— 过滤靠它，不靠按钮。
    if (!btns.length && isPrivate) return;

    try {
      var r = await fetch('/api/video-visibility', { credentials: 'same-origin' });
      if (!r.ok) {
        console.warn('[vid-hide] GET', r.status, '（Access 拦截？）');
        return;
      }

      // 只读一次 body —— 之前 r.json() 调了两次，第二次必然抛
      // "body already read"，整个 hydrate 静默失败，按钮状态不回填。
      var d = await r.json().catch(function(){ return null; });
      if (!d) {
        console.warn('[vid-hide] 响应不是 JSON（可能被 Access 拦截）');
        return;
      }

      var hidden = d.hidden || [];

      // 公开站：只过滤，不管按钮（本来就没渲染）。
      if (!isPrivate) {
        filterHiddenCards(hidden);
        return;
      }

      // 私有站：回填按钮状态。非管理员不显示按钮（后端 POST 也会拦）。
      if (!d.isAdmin) {
        btns.forEach(function(b){ b.style.display = 'none'; });
        return;
      }

      btns.forEach(function(b){ b.style.display = ''; });

      var set = {};
      hidden.forEach(function(s){ set[s] = 1; });
      btns.forEach(function(btn){
        var slug = btn.getAttribute('data-slug');
        if (set[slug]) {
          btn.setAttribute('data-hidden', '1');
          btn.textContent = '🚫';
          btn.title = '已在公开站隐藏（点击恢复）';
          var card = btn.closest('.book-card');
          if (card) card.classList.add('is-hidden-public');
        } else {
          btn.setAttribute('data-hidden', '0');
          btn.textContent = '👁';
        }
      });
    } catch (e) {
      console.warn('[vid-hide] hydrate failed', e);
    }
  }

  // 普通读者视角：把隐藏的卡片从网格里移除，并重算分页。
  //
  // 为什么必须重算分页：卡片数变了（比如 37 → 35），
  // 不重算就会出现「最后一页只剩空行」或「页码显示 5 页但只有 4 页内容」。
  //
  // 为什么用 remove() 而不是 display:none：
  // display:none 的卡片仍会被 inject_library 的 visibleCards() 数进去，
  // 分页按 show.length 算就会多算。直接从 DOM 移除最干净。
  function filterHiddenCards(hiddenList){
    if (!hiddenList.length) return;

    var removed = 0;
    document.querySelectorAll('.book-card').forEach(function(card){
      var link = card.querySelector('a[href]');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      // 卡片链接形如 ../视频与专题/xxx 或 /视频与专题/xxx，取末两段比对 slug
      var decoded = href;
      try { decoded = decodeURIComponent(href); } catch (e) {}
      // 不用正则去尾斜杠：本文件导出的是模板字符串，里面的 \/ 会被
      // JS 当成无效转义吃掉，replace(/\/+$/) 会变成 replace(//+$/)
      // 而 // 是注释开头 —— 整段运行时语法错误、静默失效。
      var segs = decoded.split("?")[0].split("#")[0].split("/").filter(Boolean);
      var tail = segs.slice(-2).join("/");
      var hit = hiddenList.some(function(s){
        return tail === s || decoded.indexOf(s) !== -1;
      });
      if (hit) {
        card.remove();
        removed++;
      }
    });

    if (removed && typeof window.__nxRepaginate === 'function') {
      // inject_library 暴露的重算入口。传 video 只重算视频库。
      window.__nxRepaginate('video');
    }
    if (removed) {
      console.info('[vid-hide] 普通读者视角已隐藏 ' + removed + ' 条');
    }
  }

  // 页内提示条。替代 alert/confirm —— 原生弹窗会阻塞页面，
  // 有些浏览器还会静默拦截，用户点了按钮完全看不到反应。
  // 跳登录页并记住当前位置 —— 登录后回到原来的页面，
  // 而不是固定跳到 /my/bookmarks（用户反馈「在足迹页登录，结果跳到收藏页」）。
  function gotoLogin(){
    location.href = '/login?redirect=' + encodeURIComponent(location.pathname + location.search);
  }

  function toast(msg, opts){
    opts = opts || {};
    var el = document.getElementById('site-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'site-toast';
      document.body.appendChild(el);
    }
    el.className = (opts.kind === 'error' ? 'is-error' : opts.kind === 'ok' ? 'is-ok' : '');
    el.innerHTML = '';

    var span = document.createElement('span');
    span.className = 't-msg';
    span.textContent = msg;
    el.appendChild(span);

    if (opts.actionLabel && typeof opts.onAction === 'function') {
      var btn = document.createElement('button');
      btn.className = 't-act';
      btn.textContent = opts.actionLabel;
      btn.onclick = function(){ hide(); opts.onAction(); };
      el.appendChild(btn);
    }

    var x = document.createElement('button');
    x.className = 't-act';
    x.textContent = '×';
    x.setAttribute('aria-label', '关闭');
    x.onclick = hide;
    el.appendChild(x);

    function hide(){ el.classList.remove('show'); }
    requestAnimationFrame(function(){ el.classList.add('show'); });
    clearTimeout(el._timer);
    el._timer = setTimeout(hide, opts.duration || 5000);
    return el;
  }

  function init(){
    bind();
    bindMarks();
    bindShelfRemoves();
    bindVideoHide();
    hydrateMarks();
    hydrateVideoHide();
  }
  // Quartz 是 SPA：点导航只替换 body，不重新加载页面。
  //
  // 之前只监听 'nav' 事件 —— 实测从首页点进藏书馆时按钮 0 绑定，
  // 必须手动刷新。原因是 nav 事件在新 DOM 就绪前后触发时机不稳，
  // 且监听器在某些路径下失效。
  //
  // 现在用三层保障，任一层命中都能让按钮立即可用：
  //   1. MutationObserver 盯 body —— DOM 一变就补 init（主力）
  //   2. nav / popstate 事件
  //   3. 定时轮询兜底（每 800ms，最多 12 次）
  var moTimer = null;
  var lastInitAt = 0;

  // 检查是否有任何「未绑定」的交互元素。
  // 之前只检查 .lc-mark —— 视频列表页（私有站）只有 .vid-hide
  // 没有标记按钮，导致 init() 永远不触发，可见按钮点了没反应。
  function needsInit(){
    var sels = [
      ['.lc-mark', 'mkBound'],
      ['.shelf-remove', 'rmBound'],
      ['.vid-hide', 'hideBound'],
    ];
    for (var s = 0; s < sels.length; s++) {
      var nodes = document.querySelectorAll(sels[s][0]);
      var attr = sels[s][1];
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].dataset[attr]) return true;
      }
    }
    return false;
  }

  function safeInit(){
    var now = Date.now();
    if (now - lastInitAt < 200) return;
    lastInitAt = now;
    try { init(); } catch (e) { console.error('[charts] init failed', e); }
  }

  function watchDom(){
    if (window.__chartsMO) return;
    window.__chartsMO = new MutationObserver(function(){
      clearTimeout(moTimer);
      moTimer = setTimeout(function(){
        if (needsInit()) safeInit();
      }, 150);
    });
    window.__chartsMO.observe(document.body, { childList: true, subtree: true });
  }

  function boot(){
    safeInit();
    watchDom();
    setTimeout(function(){ if (needsInit()) safeInit(); }, 150);
    setTimeout(function(){ if (needsInit()) safeInit(); }, 600);
  }

  // 接全局调度器（scripts/inject_reinit.mjs）。
  // 之前自己写 MutationObserver + 轮询，重复且易漏。
  if (window.__nxOnReinit) {
    window.__nxOnReinit(function(){ if (needsInit()) safeInit(); });
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
    document.addEventListener('nav', boot);
    window.addEventListener('popstate', boot);
  }
})();
`

export const CHARTS_RUNTIME = RUNTIME

// RUNTIME 的注入已统一由 scripts/bundle_runtime.mjs 处理（全站单文件，可缓存）。

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

    // 幂等：清掉上次注入的 style + lc-wrap。
    // 用「从 <style> 到 lc-wrap 结束」的锚定匹配，结尾用注释标记定位，
    // 不靠数嵌套 div（之前非贪婪匹配只吃到第一个 </div>，清理不干净）。
    html = html.replace(
      /<style>\s*\n\.lc-wrap[\s\S]*?<\/style>\s*<div class="lc-wrap"[\s\S]*?<!--\/lc-wrap-->/g,
      "",
    )

    // 只插数据渲染，RUNTIME 由 injectRuntimeEverywhere 统一注入全站
    const block = renderCharts(data, kind)

    if (html.includes(PLACEHOLDER)) {
      html = html.replace(PLACEHOLDER, block)
    } else if (html.includes(PLACEHOLDER_ALT)) {
      html = html.replace(PLACEHOLDER_ALT, block)
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
    console.log(
      `[charts:${kind}] ${total} 条（本地封面 ${withCover}）→ 标签页 ${cfg.dir}/index.html`,
    )
    n++
  }

  return n
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  inject(process.argv[2] || "dist-public")
}

export { inject, renderCharts }
