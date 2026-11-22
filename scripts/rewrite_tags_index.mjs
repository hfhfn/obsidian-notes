/**
 * 标签索引页重写
 *
 * Quartz 的 tag-page 会把「每个标签 + 该标签下所有笔记」全部平铺在一页，
 * 当前站点 320 个标签 → 417KB HTML、3113 个链接，既慢又没法看。
 *
 * 这里在构建后重写 tags/index.html：
 * - 只显示标签名 + 笔记数（不展开笔记列表）
 * - 按笔记数降序
 * - 每页 100 个标签，底部翻页
 *
 * 用法: node scripts/rewrite_tags_index.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PER_PAGE = 100

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * 从原始 HTML 里抽出所有 (标签名, 链接, 笔记数)。
 * Quartz 的输出形如：
 *   <h2><a class="internal tag-link" href="../tags/安全">安全</a></h2>
 *   <div class="page-listing"><p>此标签下有2条笔记。</p>
 */
function extractTags(html) {
  const out = []
  const re =
    /<h2><a class="internal tag-link" href="([^"]+)">([^<]+)<\/a><\/h2>\s*<div class="page-listing"><p>此标签下有(\d+)条笔记。/g
  let m
  while ((m = re.exec(html)) !== null) {
    out.push({ href: m[1], name: m[2], count: Number(m[3]) })
  }
  return out
}

function renderPage(tags, page, totalPages, basePrefix) {
  const start = (page - 1) * PER_PAGE
  const slice = tags.slice(start, start + PER_PAGE)

  const cards = slice
    .map(
      (t) => `
      <a class="tag-card" href="${esc(t.href)}">
        <span class="tag-name">${esc(t.name)}</span>
        <span class="tag-count">${t.count}</span>
      </a>`,
    )
    .join("")

  let pager = ""
  if (totalPages > 1) {
    const prev =
      page > 1
        ? `<a class="tag-page-btn" href="${page === 2 ? "./" : `?page=${page - 1}`}">← 上一页</a>`
        : `<span class="tag-page-btn disabled">← 上一页</span>`
    const next =
      page < totalPages
        ? `<a class="tag-page-btn" href="?page=${page + 1}">下一页 →</a>`
        : `<span class="tag-page-btn disabled">下一页 →</span>`
    pager = `
      <nav class="tag-pager">
        ${prev}
        <span class="tag-page-info">第 ${page} / ${totalPages} 页</span>
        ${next}
      </nav>`
  }

  return `
    <div class="tag-index-head">
      <p class="tag-index-total">共 ${tags.length} 个标签</p>
    </div>
    <div class="tag-cloud">${cards}</div>
    ${pager}
  `
}

const TAG_CSS = `
/* 标签索引页是检索工具，不是文章：隐藏收藏/点赞/分享行和阅读数 */
body.tag-index-page .na-bar,
body.tag-index-page .content-meta,
body.tag-index-page .note-properties,
body.tag-index-page .giscus,
body.tag-index-page iframe.giscus-frame,
body.tag-index-page .comments {
  display: none !important;
}
.tag-index-head { margin: 0.6rem 0 1rem; }
.tag-index-total { color: var(--gray); font-size: 0.85rem; margin: 0; }
.tag-cloud {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1.6rem;
}
.tag-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.42rem 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 7px;
  background: none !important;
  color: var(--darkgray) !important;
  font-size: 0.82rem !important;
  text-decoration: none !important;
  transition: border-color 0.12s, color 0.12s;
}
.tag-card:hover {
  border-color: var(--secondary);
  color: var(--secondary) !important;
}
.tag-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-count {
  flex: 0 0 auto;
  color: var(--gray);
  font-size: 0.72rem;
}
.tag-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 1.5rem 0;
}
.tag-pager-top {
  margin: 0 0 1rem;
  justify-content: flex-start;
}
.tag-pager-bottom {
  margin: 1.5rem 0 0;
}
/* 顶部返回入口：静态页也能一键回首页，不依赖浏览器后退 */
.tag-crumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.9rem;
  font-size: 0.82rem;
  line-height: 1.5;
}
.tag-crumb a {
  color: var(--secondary) !important;
  text-decoration: none !important;
  background: none !important;
}
.tag-crumb a:hover {
  text-decoration: underline !important;
}
.tag-crumb-sep {
  color: var(--gray);
  font-size: 0.75rem;
}
.tag-crumb-cur {
  color: var(--darkgray);
}
.tag-page-btn {
  padding: 0.32rem 0.8rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  color: var(--darkgray) !important;
  font-size: 0.82rem !important;
  text-decoration: none !important;
  background: none !important;
}
.tag-page-btn:hover:not(.disabled) {
  border-color: var(--secondary);
  color: var(--secondary) !important;
}
.tag-page-btn.disabled {
  opacity: 0.4;
  cursor: default;
}
.tag-page-info {
  color: var(--gray);
  font-size: 0.8rem;
}
`

function rewrite(distDir) {
  const pagePath = path.join(distDir, "tags", "index.html")
  if (!fs.existsSync(pagePath)) {
    console.log("[tags] tags/index.html 不存在，跳过")
    return 0
  }

  const html = fs.readFileSync(pagePath, "utf-8")
  const tags = extractTags(html)
  if (tags.length === 0) {
    console.log("[tags] 未解析到标签，跳过（可能是 Quartz 版本变化）")
    return 0
  }

  // 按笔记数降序，同数量按名称
  tags.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"))

  const totalPages = Math.max(1, Math.ceil(tags.length / PER_PAGE))

  // 分页用 query string 在同一个静态页里切换，靠内联脚本按 ?page= 渲染。
  // 纯静态站点没法服务端分页，所以把全量数据塞进 JSON 让前端切。
  const payload = JSON.stringify(tags.map((t) => ({ n: t.name, h: t.href, c: t.count })))

  const injected = `
    <style>${TAG_CSS}</style>
    <div id="tag-index-root"></div>
    <script>
    (function(){
      var ALL = ${payload};
      var PER = ${PER_PAGE};
      function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
      function param(k){
        var m = new RegExp('[?&]'+k+'=([^&]*)').exec(location.search);
        return m ? parseInt(decodeURIComponent(m[1]),10) : 1;
      }
      function pagerHTML(page, total, cls){
        if(total<=1) return '';
        var prev = page>1 ? '<a class="tag-page-btn" href="?page='+(page-1)+'">← 上一页</a>' : '<span class="tag-page-btn disabled">← 上一页</span>';
        var next = page<total ? '<a class="tag-page-btn" href="?page='+(page+1)+'">下一页 →</a>' : '<span class="tag-page-btn disabled">下一页 →</span>';
        return '<nav class="tag-pager '+(cls||'')+'">'+prev+'<span class="tag-page-info">第 '+page+' / '+total+' 页</span>'+next+'</nav>';
      }
      function render(){
        // 标记本页，让 CSS 隐藏收藏/点赞行
        document.body.classList.add('tag-index-page');

        var total = Math.max(1, Math.ceil(ALL.length/PER));
        var page = Math.min(Math.max(param('page')||1,1), total);
        var start = (page-1)*PER;
        var slice = ALL.slice(start, start+PER);
        var root = document.getElementById('tag-index-root');
        if(!root) return;
        var cards = slice.map(function(t){
          return '<a class="tag-card" href="'+esc(t.h)+'"><span class="tag-name">'+esc(t.n)+'</span><span class="tag-count">'+t.c+'</span></a>';
        }).join('');
        // 顶部和底部都有翻页：页面很长时不用滚到底才能翻
        var bp = (document.body && document.body.dataset && document.body.dataset.basepath) || '';
        // 与三个卡片库页面的面包屑保持一致：Home ❯ 标签索引
        var back = '<nav class="tag-crumb" aria-label="breadcrumbs">'
          + '<a href="'+bp+'/">Home</a>'
          + '<span class="tag-crumb-sep">❯</span>'
          + '<span class="tag-crumb-cur">标签索引</span>'
          + '</nav>';
        root.innerHTML = back
          + '<div class="tag-index-head"><p class="tag-index-total">共 '+ALL.length+' 个标签</p></div>'
          + pagerHTML(page, total, 'tag-pager-top')
          + '<div class="tag-cloud">'+cards+'</div>'
          + pagerHTML(page, total, 'tag-pager-bottom');
      }
      render();
      document.addEventListener('nav', render);
    })();
    </script>
  `

  // 把 tag-page 生成的整块替换成我们的版本
  // 原块从 <div class="popover-hint" data-quartz-plugin="tag-page" 开始，
  // 到 </article> 之后的标签列表结束。这里直接重建整个 body 的 main 内容更稳。
  const marker = '<div class="popover-hint" data-quartz-plugin="tag-page"'
  const idx = html.indexOf(marker)
  if (idx === -1) {
    console.log("[tags] 未找到 tag-page 容器，跳过")
    return 0
  }

  // 找到该容器对应的结束：Quartz 把标签列表放在同一容器内，
  // 直到下一个 popover-hint 或 </body>。用 body 尾部结构判断。
  const afterMarker = html.slice(idx)
  // 结束标记：footer 之前的 contentinfo 或 </body>
  const endCandidates = [afterMarker.indexOf("<footer"), afterMarker.indexOf("</body>")].filter(
    (n) => n > 0,
  )
  const endRel = endCandidates.length ? Math.min(...endCandidates) : -1
  if (endRel === -1) {
    console.log("[tags] 无法定位容器结束位置，跳过")
    return 0
  }

  const before = html.slice(0, idx)
  const after = html.slice(idx + endRel)
  const newHtml = before + injected + after

  fs.writeFileSync(pagePath, newHtml, "utf-8")
  console.log(`[tags] 已重写 tags/index.html：${tags.length} 个标签，${totalPages} 页`)
  return tags.length
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2] || "dist-public"
  const n = rewrite(target)
  process.exit(n >= 0 ? 0 : 1)
}

export { rewrite, extractTags }
