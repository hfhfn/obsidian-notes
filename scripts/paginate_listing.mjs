/**
 * 文件夹笔记列表分页
 *
 * Quartz 的 folder-page 会把该目录下所有笔记平铺成 ul.section-ul，
 * 视频与专题有 40 条，一屏拉不完。这里在构建后加分页：
 *   - 每页 20 条
 *   - 顶部和底部各一组翻页按钮
 *   - 同时把「此文件夹下有 N 条笔记」改写为「共 N 条，第 x/y 页」
 *
 * 只处理条目数超过阈值的页面，其他页面不动。
 *
 * 用法: node scripts/paginate_listing.mjs dist-public [--per 20]
 */
import fs from "node:fs"
import { inlineScript } from "./_inline.mjs"
import path from "node:path"

const MARKER = "<!--LISTING_PAGER-->"
const DEFAULT_PER = 20
const MIN_ITEMS = 25 // 少于此数不分页

const CSS = `
.pl-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  margin: 1.1rem 0;
}
.pl-pbtn {
  padding: 0.26rem 0.75rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: none;
  color: var(--darkgray) !important;
  font-family: var(--bodyFont);
  font-size: 0.78rem !important;
  cursor: pointer;
  transition: all 0.15s;
}
.pl-pbtn:hover:not(:disabled) {
  border-color: var(--secondary);
  color: var(--secondary) !important;
}
.pl-pbtn:disabled { opacity: 0.35; cursor: default; }
.pl-pinfo { color: var(--gray); font-size: 0.76rem; }
`

const RUNTIME = `
(function(){
  function bind(){
    document.querySelectorAll('.page-listing').forEach(function(listing){
      if (listing.dataset.plBound) return;
      var ul = listing.querySelector('ul.section-ul');
      if (!ul) return;
      var items = Array.from(ul.children);
      if (items.length <= 1) return;
      var per = Number(listing.getAttribute('data-per')) || 20;
      var pages = Math.max(1, Math.ceil(items.length / per));
      if (pages <= 1) return;

      listing.dataset.plBound = '1';
      var pagers = Array.from(listing.querySelectorAll('.pl-pager'));
      var cur = 1;

      function render(n){
        cur = Math.max(1, Math.min(n, pages));
        items.forEach(function(li, i){
          var show = i >= (cur - 1) * per && i < cur * per;
          li.style.display = show ? '' : 'none';
        });
        pagers.forEach(function(p){
          var info = p.querySelector('.pl-pinfo');
          var prev = p.querySelector('[data-prev]');
          var next = p.querySelector('[data-next]');
          if (info) info.textContent = '第 ' + cur + ' / ' + pages + ' 页（共 ' + items.length + ' 条）';
          if (prev) prev.disabled = cur === 1;
          if (next) next.disabled = cur === pages;
        });
      }

      pagers.forEach(function(p){
        var prev = p.querySelector('[data-prev]');
        var next = p.querySelector('[data-next]');
        if (prev) prev.addEventListener('click', function(){ render(cur - 1); });
        if (next) next.addEventListener('click', function(){ render(cur + 1); });
      });

      render(1);
    });
  }
  // 自己管自己的初始化。
  //
  // 为什么不用全局调度器：paginate 的脚本是内联在页面里的普通 <script>，
  // 执行时机早于 body 末尾注入的调度器（window.__nxOnReinit 还不存在），
  // 走调度器分支会静默跳过。这里用「立即跑 + 定时重试 + nav 重跑」三保险，
  // 不依赖任何外部注入顺序。
  var tries = 0;
  function bindUntil(){
    bind();
    var lists = document.querySelectorAll('.page-listing');
    var done = lists.length > 0 && Array.prototype.every.call(lists, function(l){
      return l.dataset.plBound === '1'
        || l.querySelectorAll('ul.section-ul > li').length <= 1;
    });
    if (done || ++tries > 40) return;   // 最多约 4 秒
    setTimeout(bindUntil, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUntil);
  } else {
    bindUntil();
  }
  // nav 触发时 Quartz 可能还没把新 article 插进 DOM，
  // 延迟一拍再跑，并给足重试次数。
  document.addEventListener('nav', function(){
    tries = 0;
    setTimeout(bindUntil, 60);
    setTimeout(bindUntil, 300);
    setTimeout(bindUntil, 800);
  });
  window.addEventListener('popstate', function(){
    tries = 0;
    setTimeout(bindUntil, 60);
    setTimeout(bindUntil, 300);
  });

  // 如果调度器后来才就绪，也接上（双保险，bind 内部有 plBound 幂等）
  if (window.__nxOnReinit) {
    window.__nxOnReinit(function(){ tries = 0; bindUntil(); });
  } else {
    var waitReinit = setInterval(function(){
      if (window.__nxOnReinit) {
        window.__nxOnReinit(function(){ tries = 0; bindUntil(); });
        clearInterval(waitReinit);
      }
    }, 100);
    setTimeout(function(){ clearInterval(waitReinit); }, 5000);
  }
})();
`;

export const PAGER_RUNTIME = RUNTIME

function pagerHtml() {
  return `<div class="pl-pager">
    <button class="pl-pbtn" data-prev disabled>← 上一页</button>
    <span class="pl-pinfo">第 1 页</span>
    <button class="pl-pbtn" data-next>下一页 →</button>
  </div>`
}

function paginateOne(html, per) {
  // 找到 .page-listing 块
  const m = html.match(/<div class="page-listing">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)
  if (!m) return null

  // 统计条目数
  const itemCount = (html.match(/<li class="section-li">/g) || []).length
  if (itemCount < MIN_ITEMS) return null

  // 给 .page-listing 加 data-per
  let out = html.replace(
    /<div class="page-listing">/,
    `<div class="page-listing" data-per="${per}">`,
  )

  // 顶部翻页器：紧跟「此文件夹下有 N 条笔记」那段
  out = out.replace(
    /(<p>此文件夹下有\d+条笔记。<\/p>)/,
    `$1${pagerHtml()}`,
  )

  // 底部翻页器：必须精确锚定 section-ul 的闭合标签。
  // 原来用 /<\/ul>\s*<\/div>\s*<\/div>\s*<\/div>/ 会匹配到页面末尾
  // （页脚那个 ul），结果把 footer 和右侧栏都吞进了 .page-listing，
  // 造成评论区下方 638px 空白。
  // 这里改成「从 section-ul 开始，找到与它配对的 </ul>」。
  const startIdx = out.indexOf('<ul class="section-ul">')
  if (startIdx >= 0) {
    // 从 section-ul 起点往后，数 <ul>/</ul> 配对，找到最外层闭合
    let depth = 0
    let i = startIdx
    let closeEnd = -1
    const re = /<ul\b|>\s*<\/ul>/g
    re.lastIndex = startIdx
    let mm
    while ((mm = re.exec(out)) !== null) {
      if (mm[0].startsWith("<ul")) {
        depth++
      } else {
        depth--
        if (depth === 0) {
          closeEnd = mm.index + mm[0].length
          break
        }
      }
    }
    if (closeEnd > 0) {
      out = out.slice(0, closeEnd) + pagerHtml() + out.slice(closeEnd)
    }
  }

  return { html: out, itemCount }
}

function inject(distDir, per = DEFAULT_PER) {
  let files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === "_assets" || e.name === "static" || e.name === "tags") continue
        walk(p)
      } else if (e.name.endsWith(".html")) {
        // 全站注入需要所有页面，不只是 index.html ——
        // Quartz 的普通页是 <slug>.html，占了绝大多数。
        files.push(p)
      }
    }
  }
  walk(distDir)

  let n = 0
  let scriptInjected = 0

  for (const f of files) {
    let html = fs.readFileSync(f, "utf-8")

    // --- 第一步：给含 page-listing 的页面插入分页器 DOM ---
    if (html.includes('class="page-listing"') && !html.includes('class="pl-pager"')) {
      const r = paginateOne(html, per)
      if (r) {
        html = r.html
        const rel = path.relative(distDir, f).replace(/\\/g, "/")
        console.log(`[listing-pager] ${rel}  ${r.itemCount} 条 → 分页`)
        n++
      }
    }

    // 运行时注入已统一由 scripts/bundle_runtime.mjs 处理。
    // 这里只负责插入分页器 DOM。

    if (html !== fs.readFileSync(f, "utf-8")) {
      fs.writeFileSync(f, html, "utf-8")
    }
  }
  if (scriptInjected) console.log(`[listing-pager] runtime 注入 ${scriptInjected} 个页面`)
  return n
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename
if (isMain) {
  const dist = process.argv[2] || "dist-public"
  const perArg = process.argv.indexOf("--per")
  const per = perArg > 0 ? Number(process.argv[perArg + 1]) : DEFAULT_PER
  const n = inject(dist, per)
  if (n === 0) console.log("[listing-pager] 没有需要分页的列表页")
}

export { inject }
