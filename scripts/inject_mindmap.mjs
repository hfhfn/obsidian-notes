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
`

const RUNTIME = `
(function(){
  function boot(){
    if (!window.markmap || !window.markmap.Markmap) return;
    document.querySelectorAll('.mm-wrap[data-mm]').forEach(function(wrap){
      if (wrap.dataset.mmBound === '1') return;
      wrap.dataset.mmBound = '1';

      if (!wrap.getAttribute('data-mm-uid')) {
        wrap.setAttribute('data-mm-uid', 'mm' + Math.random().toString(36).slice(2, 9));
      }
      var dataEl = wrap.querySelector('script.mm-data');
      var canvas = wrap.querySelector('.mm-canvas');
      if (!dataEl || !canvas) return;

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
            var svg = canvas.querySelector('svg');
            if (!svg) return;
            var s = new XMLSerializer().serializeToString(svg);
            var blob = new Blob([s], { type: 'image/svg+xml' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (wrap.getAttribute('data-mm-title') || 'mindmap') + '.svg';
            a.click();
            URL.revokeObjectURL(a.href);
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('nav', boot);
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
    if (!h.includes('class="mm-wrap"')) continue
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
