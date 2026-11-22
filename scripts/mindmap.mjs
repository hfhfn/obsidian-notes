/**
 * 思维导图渲染：NotebookLM JSON → 可交互 mind map
 *
 * 为什么换掉 Mermaid：
 *   Mermaid mindmap 是静态 SVG，不能拖动节点、不能调布局、不能调字号，
 *   大图还挤成一团。用户明确要求「可拖动、可调布局、可调字号」。
 *
 * 方案：markmap-view（d3 驱动）
 *   - 拖动平移、滚轮缩放、节点折叠
 *   - 字号 / 间距 / 配色可运行时调整
 *   - 全屏、适应窗口、导出 SVG
 *
 * 数据来源：modules/视频与专题/_assets/<名>/mind-map.json
 * 页面里以 <script type="application/json" class="mm-data"> 内嵌树结构，
 * 前端用 markmap 的 Transformer 转成节点树再渲染。
 */

const CSS = `
.mm-wrap {
  position: relative;
  margin: 1.2rem 0;
  border: 1px solid var(--lightgray);
  border-radius: 10px;
  background: var(--light);
  overflow: hidden;
}
.mm-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--lightgray);
  background: var(--lightgray);
}
.mm-toolbar button {
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--gray);
  border-radius: 5px;
  background: var(--light);
  color: var(--darkgray) !important;
  font-family: var(--bodyFont);
  font-size: 0.74rem !important;
  cursor: pointer;
  line-height: 1.4;
}
.mm-toolbar button:hover {
  border-color: var(--secondary);
  color: var(--secondary) !important;
}
.mm-toolbar .mm-sep {
  width: 1px;
  height: 1rem;
  background: var(--gray);
  opacity: 0.4;
  margin: 0 0.15rem;
}
.mm-toolbar label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.74rem;
  color: var(--gray);
}
.mm-toolbar input[type="range"] {
  width: 68px;
  accent-color: var(--secondary);
}
.mm-canvas {
  width: 100%;
  height: 520px;
  display: block;
  cursor: grab;
  touch-action: none;
}
.mm-canvas:active { cursor: grabbing; }
.mm-wrap:fullscreen { border-radius: 0; border: none; }
.mm-wrap:fullscreen .mm-canvas { height: 100vh; }
.mm-hint {
  padding: 0.35rem 0.7rem 0.5rem;
  font-size: 0.7rem;
  color: var(--gray);
  border-top: 1px solid var(--lightgray);
}
.mm-fallback {
  padding: 1rem;
  font-size: 0.82rem;
  color: var(--gray);
}
`

const JS = `
(function(){
  function boot(){
    if (!window.markmap || !window.markmap.Markmap) return;
    document.querySelectorAll('.mm-wrap[data-mm]').forEach(function(wrap){
      if (wrap.dataset.mmBound === '1') return;
      wrap.dataset.mmBound = '1';

      var dataEl = wrap.querySelector('script.mm-data');
      var canvas = wrap.querySelector('.mm-canvas');
      if (!dataEl || !canvas) return;

      var tree;
      try { tree = JSON.parse(dataEl.textContent); }
      catch (e) { return; }

      // NotebookLM 的 {name, children} → markmap 的 {content, children}
      function conv(n){
        return {
          content: String(n.name || ''),
          children: (n.children || []).map(conv)
        };
      }
      var root = conv(tree);

      var mm = window.markmap.Markmap.create(canvas, {
        autoFit: true,
        duration: 260,
        spacingVertical: 12,
        spacingHorizontal: 90,
        paddingX: 12,
        initialExpandLevel: -1,
        colorFreezeLevel: 2,
        maxWidth: 260
      }, root);

      // ---- 工具栏 ----
      var fsInput = wrap.querySelector('.mm-font');
      var spInput = wrap.querySelector('.mm-space');
      var dirSel  = wrap.querySelector('.mm-dir');

      function applyStyle(){
        var fs = fsInput ? Number(fsInput.value) : 15;
        var sp = spInput ? Number(spInput.value) : 12;
        mm.setOptions({
          style: function(id){
            return [
              '.markmap-node > g > foreignObject > div { font-size: ' + fs + 'px !important; }',
              '.markmap-node > g > foreignObject { width: auto; }'
            ].join('\\n');
          },
          spacingVertical: sp
        });
        mm.renderData(root, mm.state.data);
      }

      if (fsInput) fsInput.addEventListener('input', applyStyle);
      if (spInput) spInput.addEventListener('input', applyStyle);

      // 方向：右/左/下（markmap 用 initialExpandLevel + 布局方向不易切，
      // 这里用 CSS 旋转容器近似「横向/纵向」两种视角）
      if (dirSel) {
        dirSel.addEventListener('change', function(){
          canvas.style.transform = dirSel.value === 'v' ? 'rotate(90deg)' : '';
          canvas.style.transformOrigin = 'center center';
          mm.fit();
        });
      }

      wrap.querySelectorAll('[data-mm-act]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var act = btn.getAttribute('data-mm-act');
          if (act === 'fit') mm.fit();
          else if (act === 'expand') {
            (function walk(n){ n.payload = { fold: 0 }; (n.children||[]).forEach(walk); })(mm.state.data);
            mm.renderData(root, mm.state.data);
          }
          else if (act === 'collapse') {
            (function walk(n, d){ if (d >= 1) n.payload = { fold: 1 }; (n.children||[]).forEach(function(c){ walk(c, d+1); }); })(mm.state.data, 0);
            mm.renderData(root, mm.state.data);
          }
          else if (act === 'full') {
            if (document.fullscreenElement) document.exitFullscreen();
            else wrap.requestFullscreen && wrap.requestFullscreen();
          }
          else if (act === 'svg') {
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

      // 容器尺寸变化后重新适配（侧栏展开/收起、全屏切换）
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function(){ mm.fit(); });
        ro.observe(canvas);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('nav', boot);
})();
`

/**
 * 把 NotebookLM 的脑图 JSON 渲染成可交互 mind map 容器。
 *
 * @param {object} tree  {name, children:[{name, children:[]}]}
 * @param {string} title 用于导出文件名
 * @returns {string} HTML
 */
export function renderMindmap(tree, title = "mindmap") {
  const json = JSON.stringify(tree).replace(/<\/script/gi, "<\\/script")
  return `<div class="mm-wrap" data-mm="1" data-mm-title="${title.replace(/"/g, "&quot;")}">
  <div class="mm-toolbar">
    <button data-mm-act="fit" title="缩放到刚好铺满">适应窗口</button>
    <button data-mm-act="expand" title="展开所有分支">全部展开</button>
    <button data-mm-act="collapse" title="只保留第一层">折叠到底</button>
    <span class="mm-sep"></span>
    <label>字号 <input class="mm-font" type="range" min="11" max="24" value="15"></label>
    <label>间距 <input class="mm-space" type="range" min="4" max="40" value="12"></label>
    <span class="mm-sep"></span>
    <button data-mm-act="full" title="全屏查看">全屏</button>
    <button data-mm-act="svg" title="导出 SVG">导出</button>
  </div>
  <svg class="mm-canvas"></svg>
  <div class="mm-hint">拖动平移 · 滚轮缩放 · 点击节点折叠</div>
  <script type="application/json" class="mm-data">${json}</script>
</div>`
}

export { CSS, JS }
