/**
 * 给含思维导图的页面注入 markmap 运行环境
 *
 * 只在真的用到 mind map 的页面注入（检测 .mm-wrap），
 * 不给全站加 350KB 的 d3 + markmap。
 */
import fs from "node:fs"
import path from "node:path"

const VENDOR = ["vendor/markmap/d3.min.js", "vendor/markmap/markmap-view.min.js"]

const CSS = `
.mm-wrap{position:relative;margin:1.2rem 0;border:1px solid var(--lightgray);border-radius:10px;background:var(--light);overflow:hidden}
.mm-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.5rem .7rem;border-bottom:1px solid var(--lightgray);background:var(--lightgray)}
.mm-toolbar button{padding:.2rem .55rem;border:1px solid var(--gray);border-radius:5px;background:var(--light);color:var(--darkgray)!important;font-family:var(--bodyFont);font-size:.74rem!important;cursor:pointer;line-height:1.4}
.mm-toolbar button:hover{border-color:var(--secondary);color:var(--secondary)!important}
.mm-toolbar .mm-sep{width:1px;height:1rem;background:var(--gray);opacity:.4;margin:0 .15rem}
.mm-toolbar label{display:inline-flex;align-items:center;gap:.3rem;font-size:.74rem;color:var(--gray)}
.mm-toolbar input[type=range]{width:68px;accent-color:var(--secondary)}
.mm-canvas{width:100%;height:620px;display:block;cursor:grab;touch-action:none}
/* markmap 默认用浅色主题的深灰文字（#333），暗色模式下和深色背景撞色，
   文字几乎看不见。这里强制节点文字跟随主题前景色。 */
.mm-wrap .markmap-foreign > div > div{color:var(--dark) !important}
.mm-wrap .markmap-node circle,.mm-wrap .markmap-node line{stroke:var(--gray)}
/* 暗色模式下给节点文字加一点底衬，避免与连线重叠时看不清 */
[saved-theme="dark"] .mm-wrap .markmap-foreign > div > div{color:#e8e8ea !important}
.mm-canvas:active{cursor:grabbing}
.mm-wrap:fullscreen{border-radius:0;border:none;background:var(--light)}
.mm-wrap:fullscreen .mm-canvas{height:100vh}
.mm-hint{padding:.35rem .7rem .5rem;font-size:.7rem;color:var(--gray);border-top:1px solid var(--lightgray)}
.mm-export-hint{position:absolute;left:50%;bottom:3.2rem;transform:translateX(-50%);padding:.4rem .8rem;border-radius:6px;background:rgba(0,0,0,.8);color:#fff;font-size:.76rem;z-index:20;pointer-events:none}
/* 信息图灯箱 */
.nlm-zoomable{cursor:zoom-in;transition:opacity .15s}
.nlm-zoomable:hover{opacity:.92}
.nlm-lightbox{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88);cursor:zoom-out;padding:2vh 2vw}
.nlm-lightbox img{max-width:96vw;max-height:96vh;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.6);border-radius:4px}
.nlm-lightbox-close{position:fixed;top:1rem;right:1.4rem;width:2.2rem;height:2.2rem;border:none;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:1.4rem;line-height:1;cursor:pointer}
.nlm-lightbox-close:hover{background:rgba(255,255,255,.28)}
`

const RUNTIME = `
(function(){
  // SPA 导航时 Quartz 只替换 #quartz-body 里的内容，
  // <head> 里的 markmap <script> 不会重新执行。
  // 如果用户第一次是从首页/列表点进详情页（没刷新），
  // window.markmap 就是 undefined —— 这就是「首次进入不显示、
  // 刷新一次才正常」的根因。这里手动补一次脚本注入。
  var vendorState = 0;   // 0=未开始 1=加载中 2=完成

  function ensureVendor(){
    if (window.markmap && window.markmap.Markmap) { vendorState = 2; return true; }
    if (vendorState === 1) return false;   // 正在加载，等 onload 回调再 boot
    vendorState = 1;

    // vendor 在站点根目录 /vendor/markmap/，用绝对路径，不管页面在第几层。
    // 必须严格串行：markmap-view 是 UMD，依赖全局 d3 已就绪。
    var load = function(src, cb){
      var s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      s.onerror = function(){ vendorState = 0; };
      document.head.appendChild(s);
    };

    load('/vendor/markmap/d3.min.js', function(){
      load('/vendor/markmap/markmap-view.min.js', function(){
        vendorState = 2;
        boot();   // 加载完立刻重跑，别等轮询
      });
    });
    return false;
  }

  function boot(){
    // markmap 通过 <script defer> 加载，执行顺序不保证。
    // SPA 导航后 <head> 里的脚本不会重跑，必须手动补注入。
    if (!window.markmap || !window.markmap.Markmap) {
      ensureVendor();
      boot._tries = (boot._tries || 0) + 1;
      if (boot._tries < 120) setTimeout(boot, 150);
      return;
    }
    boot._tries = 0;
    document.querySelectorAll('.mm-wrap[data-mm]').forEach(function(wrap){
      if (wrap.dataset.mmBound === '1') return;
      wrap.dataset.mmBound = '1';

      if (!wrap.getAttribute('data-mm-uid')) {
        wrap.setAttribute('data-mm-uid', 'mm' + Math.random().toString(36).slice(2, 9));
      }
      var dataEl = wrap.querySelector('script.mm-data');
      var canvas = wrap.querySelector('.mm-canvas');
      if (!dataEl || !canvas) return;

      // 首次加载时容器可能还没完成布局（宽高为 0），
      // markmap 在 0×0 的 svg 上渲染会得到空白图，刷新后才正常。
      // 这里等容器有实际尺寸再渲染，最多等 3 秒。
      if (!canvas.clientWidth || !canvas.clientHeight) {
        delete wrap.dataset.mmBound;   // 允许下一轮重试
        wrap._wait = (wrap._wait || 0) + 1;
        if (wrap._wait < 30) setTimeout(boot, 100);
        return;
      }
      wrap._wait = 0;

      var tree;
      try { tree = JSON.parse(dataEl.textContent); } catch (e) { return; }

      function conv(n){
        return { content: String(n.name || ''), children: (n.children || []).map(conv) };
      }
      var root = conv(tree);

      // initialExpandLevel: 只展开 2 层。
      // 96 个节点全展开时 autoFit 会把缩放压到 0.19，字全糊成一团；
      // 展开 2 层后首屏可读，用户点节点自己往下钻。
      var mm = window.markmap.Markmap.create(canvas, {
        autoFit: true, duration: 260,
        spacingVertical: 14, spacingHorizontal: 100,
        paddingX: 14, initialExpandLevel: 2,
        colorFreezeLevel: 2, maxWidth: 220
      }, root);

      var fsInput = wrap.querySelector('.mm-font');
      var spInput = wrap.querySelector('.mm-space');

      // 字号：markmap 的节点文字在 foreignObject > div > div 里，
      // 且宽度是渲染时算好的。改字号后必须重新 renderData 才会重新排版，
      // 光改 CSS 会文字溢出框外。这里用一个专用 <style> 控制。
      var styleEl = document.createElement('style');
      styleEl.className = 'mm-dyn-style';
      wrap.appendChild(styleEl);

      function applyStyle(){
        var fs = fsInput ? Number(fsInput.value) : 15;
        var sp = spInput ? Number(spInput.value) : 12;
        var uid = wrap.getAttribute('data-mm-uid') || '';
        styleEl.textContent =
          '[data-mm-uid="' + uid + '"] .markmap-foreign > div > div {' +
          ' font-size: ' + fs + 'px !important;' +
          ' line-height: 1.35;' +
          ' color: var(--dark) !important;' +
          ' }';

        mm.setOptions({ spacingVertical: sp });
        mm.renderData(root, mm.state.data);
        mm.fit();
      }
      if (fsInput) fsInput.addEventListener('input', applyStyle);
      if (spInput) spInput.addEventListener('input', applyStyle);

      // 导出 PNG：SVG 里的文字在 <foreignObject> 里，
      // 直接序列化 SVG 下载后很多看图工具不渲染文字（等于导出一堆空框）。
      // 用 canvas 画一遍最稳。另外 revokeObjectURL 不能紧跟在 click() 后面，
      // 浏览器还没开始读就被撤销，下载会静默失败。
      // 导出 SVG。
      // 为什么不做 PNG：markmap 的文字在 <foreignObject> 里，
      // 把 SVG 画进 canvas 时 foreignObject 不会渲染（浏览器安全限制），
      // 导出的 PNG 只有线和圆点、没有文字。SVG 本身能完整保留文字。
      // 为了脱离页面也能看，把关键样式内联进去。
      function exportSvg(){
        // canvas 本身就是 <svg class="mm-canvas">，不是它的子元素。
        // 之前写 canvas.querySelector('svg') 拿到 null，导出静默失败。
        var svg = canvas.tagName && canvas.tagName.toLowerCase() === 'svg'
          ? canvas
          : canvas.querySelector('svg');
        if (!svg) { alert('找不到思维导图，请刷新页面'); return; }

        var bb;
        try { bb = svg.getBBox(); } catch (e) { bb = null; }
        if (!bb || bb.width < 1) bb = { x: 0, y: 0, width: svg.clientWidth || 1200, height: svg.clientHeight || 800 };

        var clone = svg.cloneNode(true);
        var pad = 16;
        clone.setAttribute('width', Math.round(bb.width + pad * 2));
        clone.setAttribute('height', Math.round(bb.height + pad * 2));
        clone.setAttribute('viewBox',
          (bb.x - pad) + ' ' + (bb.y - pad) + ' ' + (bb.width + pad * 2) + ' ' + (bb.height + pad * 2));
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.removeAttribute('class');
        clone.removeAttribute('style');

        // 内联一份最小样式：节点文字颜色、字号、字体
        var fsEl = wrap.querySelector('.mm-font');
        var fs = fsEl ? fsEl.value : 15;
        var isDark = document.documentElement.getAttribute('saved-theme') === 'dark';
        var fg = isDark ? '#e8e8ea' : '#222';
        var bg = isDark ? '#2a2c34' : '#ffffff';

        var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent =
          '.markmap-foreign > div > div{color:' + fg + ' !important;font-size:' + fs + 'px !important;' +
          'font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.35}' +
          '.markmap-node circle{stroke:#888}';

        var bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', bb.x - pad);
        bgRect.setAttribute('y', bb.y - pad);
        bgRect.setAttribute('width', bb.width + pad * 2);
        bgRect.setAttribute('height', bb.height + pad * 2);
        bgRect.setAttribute('fill', bg);

        clone.insertBefore(style, clone.firstChild);
        clone.insertBefore(bgRect, clone.firstChild);

        var data = new XMLSerializer().serializeToString(clone);
        // 文件名要去掉非法字符，且必须带 .svg 后缀 ——
        // 之前用 application/octet-stream 时浏览器忽略 download 属性，
        // 存下来是「无后缀」的文件（用户反馈没有 svg 后缀）。
        var rawName = (wrap.getAttribute('data-mm-title') || 'mindmap')
          .replace(/[\\/:*?"<>|]/g, '_')
          .trim() || 'mindmap';
        var fname = rawName + '.svg';

        var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
        var objUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = objUrl;
        a.download = fname;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // 延迟清理，并给用户一个可见的反馈（否则不知道有没有成功）
        setTimeout(function(){
          document.body.removeChild(a);
          URL.revokeObjectURL(objUrl);
        }, 4000);

        var hint = document.createElement('div');
        hint.className = 'mm-export-hint';
        hint.textContent = '已导出 ' + fname + '（若未开始下载，请检查浏览器下载设置）';
        wrap.appendChild(hint);
        setTimeout(function(){ hint.remove(); }, 4000);
      }

      wrap.querySelectorAll('[data-mm-act]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var act = btn.getAttribute('data-mm-act');
          if (act === 'fit') mm.fit();
          else if (act === 'expand') {
            (function walk(n){ n.payload = { fold: 0 }; (n.children||[]).forEach(walk); })(mm.state.data);
            mm.renderData(root, mm.state.data);
            // 全展开后节点太多，fit 会缩得很小；只保证不溢出，允许用户自己缩放
            mm.setOptions({ autoFit: false });
            mm.fit();
          } else if (act === 'collapse') {
            (function walk(n, d){ if (d >= 2) n.payload = { fold: 1 }; (n.children||[]).forEach(function(c){ walk(c, d+1); }); })(mm.state.data, 0);
            mm.renderData(root, mm.state.data); mm.fit();
          } else if (act === 'full') {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (wrap.requestFullscreen) wrap.requestFullscreen();
          } else if (act === 'svg') {
            exportSvg();
          }
        });
      });

      if (window.ResizeObserver) new ResizeObserver(function(){ mm.fit(); }).observe(canvas);

      // markmap 的 fit() 在容器刚插入时算错尺寸（布局还没完成），
      // 导致根节点靠左、子节点跑到视口外看不见。延迟几次再 fit。
      function refit(){ try { mm.fit(); } catch (e) {} }
      setTimeout(refit, 60);
      setTimeout(refit, 350);
      setTimeout(refit, 900);
    });
  }
  // ---- 信息图灯箱 ----
  // 之前点图是 target="_blank" 开新标签，看完得点浏览器回退，
  // 回到页面滚动位置也丢了。改成页内遮罩，ESC / 点空白 / 点 × 都能关。
  var lbOpen = false;

  function closeLightbox(){
    var lb = document.querySelector('.nlm-lightbox');
    if (lb) lb.remove();
    lbOpen = false;
    document.body.style.overflow = '';
  }

  function openLightbox(src, alt){
    closeLightbox();
    var lb = document.createElement('div');
    lb.className = 'nlm-lightbox';
    lb.innerHTML =
      '<button class="nlm-lightbox-close" aria-label="关闭">×</button>' +
      '<img src="' + src + '" alt="' + (alt || '') + '">';
    lb.addEventListener('click', function(ev){
      // 点图片本身不关闭，点遮罩或 × 关闭
      if (ev.target.tagName === 'IMG' && !ev.target.classList.contains('nlm-lightbox-close')) return;
      closeLightbox();
    });
    document.body.appendChild(lb);
    document.body.style.overflow = 'hidden';
    lbOpen = true;
  }

  function bindZoom(){
    document.querySelectorAll('.nlm-zoomable').forEach(function(img){
      if (img.dataset.zoomBound) return;
      img.dataset.zoomBound = '1';
      img.addEventListener('click', function(){
        openLightbox(img.getAttribute('src'), img.getAttribute('alt'));
      });
    });
  }

  document.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape' && lbOpen) {
      ev.preventDefault();
      closeLightbox();
    }
  });

  function bootAll(){ boot(); bindZoom(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAll);
  else bootAll();
  document.addEventListener('nav', bootAll);
})();
`

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith(".html")) out.push(p)
  }
  return out
}

const SRC_VENDOR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../quartz/static/vendor/markmap",
)

function copyVendor(root) {
  const dst = path.join(root, "vendor", "markmap")
  fs.mkdirSync(dst, { recursive: true })
  let n = 0
  for (const f of ["d3.min.js", "markmap-view.min.js"]) {
    const src = path.join(SRC_VENDOR, f)
    if (!fs.existsSync(src)) {
      console.error(`[mindmap] 缺少 ${src}`)
      continue
    }
    fs.copyFileSync(src, path.join(dst, f))
    n++
  }
  return n
}

function inject(distDir) {
  const root = path.resolve(distDir)
  const copied = copyVendor(root)
  const files = walk(root)

  // vendor 脚本从 dist 根开始算，页面在不同层级，用相对路径
  let touched = 0
  for (const f of files) {
    let h = fs.readFileSync(f, "utf8")
    // 只在含思维导图的页面注入，但「视频与专题」列表页也要注入：
    // Quartz 是 SPA，从列表点进详情页不会重新执行 head 里的脚本，
    // 列表页带 vendor 才能保证进入详情页时 window.markmap 已就绪。
    const isListPage = f.includes("视频与专题") && f.endsWith("index.html")
    if (!h.includes('class="mm-wrap"') && !isListPage) continue
    if (h.includes("markmap-view.min.js")) continue

    const depth = path.relative(root, path.dirname(f)).split(path.sep).filter(Boolean).length
    const up = depth === 0 ? "." : Array(depth).fill("..").join("/")
    const tags = VENDOR.map(
      (v) => `<script src="${up}/${v}" defer></script>`,
    ).join("")

    h = h.replace("</head>", `<style>${CSS}</style>${tags}</head>`)
    h = h.replace("</body>", `<script>${RUNTIME}</script></body>`)
    fs.writeFileSync(f, h)
    touched++
  }
  console.log(`[mindmap] vendor ${copied} 个文件，注入 ${touched} 个页面`)
}

const target = process.argv[2]
if (!target) {
  console.error("用法: node scripts/inject_mindmap.mjs <dist-dir>")
  process.exit(1)
}
inject(target)
