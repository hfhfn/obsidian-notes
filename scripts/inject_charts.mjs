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
import { fileURLToPath } from "node:url"

const PLACEHOLDER = "<!-- LIBRARY_CHARTS -->"

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

  // item_key 用豆瓣 id，和 collections 表对上
  const did = it.douban_id || ""
  const itemKey = did ? `${kind}:${did}` : ""

  const markBtn = itemKey
    ? `<button class="lc-mark" data-item="${itemKey}" data-kind="${kind}"
         data-title="${name}" data-cover="${esc(local)}" data-url="${url}">+ 标记</button>`
    : ""

  // 标记按钮放封面之上：放在下方时每张卡片高度不一，整排参差不齐；
  // 提到上方后与封面顶部对齐，视觉更整齐。
  return `<div class="lc-cell" data-item="${itemKey}">
      ${markBtn}
      <a class="lc-cover-link" href="${url}" target="_blank" rel="noopener">${cover}</a>
      <a class="lc-title" href="${url}" target="_blank" rel="noopener">${name}</a>
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
          ? `<div class="lc-pager">
              <button class="lc-pbtn" data-prev="${si}" disabled>← 上一页</button>
              <span class="lc-pinfo" data-info="${si}">第 1 / ${pages} 页</span>
              <button class="lc-pbtn" data-next="${si}">下一页 →</button>
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
  </div>`
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
        var info = panel.querySelector('[data-info]');
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
    });
  }
  // ---- 站内标记 ----
  var LABELS = {
    book:  { wish: '想读', doing: '在读', done: '读过' },
    movie: { wish: '想看', doing: '在看', done: '看过' }
  };

  function paint(btn, status, progress){
    var kind = btn.getAttribute('data-kind');
    var lb = LABELS[kind] || LABELS.book;
    if (status) {
      btn.setAttribute('data-status', status);
      btn.textContent = (status === 'done' ? '✓ ' : '● ') + lb[status];
      if (progress > 0 && progress < 100) btn.textContent += ' ' + progress + '%';
    } else {
      btn.removeAttribute('data-status');
      btn.textContent = '+ 标记';
    }
  }

  function cycle(btn){
    var kind = btn.getAttribute('data-kind');
    var lb = LABELS[kind] || LABELS.book;
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
    var r = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    return r.ok ? await r.json() : null;
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
            } else alert('移除失败，请先登录');
          } else {
            var res = await save(btn, next.status, next.progress);
            if (res) {
              paint(btn, next.status, next.progress);
              syncToShelf(btn, next.status);
            } else alert('请先登录后再标记');
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
  var STATUS_TO_TAB = { wish: '想读', doing: '在读', done: '已读' };

  function bookGridFor(kind){
    // 页面上可能有多个 book-grid，取属于本库的那个
    var grids = Array.from(document.querySelectorAll('.book-grid'));
    return grids.find(function(g){ return g.getAttribute('data-for') === kind; }) || grids[0] || null;
  }

  // 标记变化后，把这张卡同步进顶部书架
  function syncToShelf(btn, status){
    var kind = btn.getAttribute('data-kind');
    var grid = bookGridFor(kind);
    if (!grid) return;

    var itemKey = btn.getAttribute('data-item');
    var tab = STATUS_TO_TAB[status] || '想读';

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
    cell.innerHTML =
      '<a class="book-cover-link" href="' + (btn.getAttribute('data-url') || '#') + '" target="_blank" rel="noopener">' +
        '<img class="book-cover" src="' + (btn.getAttribute('data-cover') || '') + '" alt="" loading="lazy">' +
      '</a>' +
      '<h3 class="book-title">' + (btn.getAttribute('data-title') || '') + '</h3>' +
      '<div class="book-meta"><span class="book-badge">' + tab + '</span></div>';
    grid.appendChild(cell);

    // 通知顶部书架重新筛选/分页
    grid.dispatchEvent(new CustomEvent('shelf-changed', { bubbles: true }));
  }

  // 页面加载后，把用户已有的标记回填到按钮，并同步到书架
  async function hydrateMarks(){
    var btns = Array.from(document.querySelectorAll('.lc-mark'));
    if (!btns.length) return;

    var byKind = {};
    btns.forEach(function(b){
      var k = b.getAttribute('data-kind');
      (byKind[k] = byKind[k] || []).push(b);
    });

    for (var kind of Object.keys(byKind)) {
      try {
        var r = await fetch('/api/collections?kind=' + kind, { credentials: 'same-origin' });
        if (!r.ok) continue;
        var d = await r.json();
        if (!d.authed) continue;

        var map = {};
        (d.items || []).forEach(function(it){ map[it.item_key] = it; });

        byKind[kind].forEach(function(btn){
          var it = map[btn.getAttribute('data-item')];
          if (it) {
            paint(btn, it.status, it.progress);
            syncToShelf(btn, it.status);
          }
        });
      } catch (e) { /* 未登录静默 */ }
    }
  }

  document.addEventListener('nav', function(){ bind(); hydrateMarks(); });
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

    // 幂等：清掉上次注入
    html = html.replace(
      /<style>[\s\S]*?\.lc-wrap[\s\S]*?<\/style>\s*<div class="lc-wrap">[\s\S]*?<\/div>\s*(?:<script>[\s\S]*?lc-wrap[\s\S]*?<\/script>)?/g,
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
    console.log(`[charts:${kind}] ${total} 条（本地封面 ${withCover}）→ 标签页 ${cfg.dir}/index.html`)
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
