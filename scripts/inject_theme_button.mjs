/**
 * 给日夜切换按钮绑定点击处理。
 *
 * 背景：Quartz 的 darkmode 初始化写成
 *   document.addEventListener("nav", init)
 *   document.addEventListener("render", init)
 * 首次直接打开某个页面时这两个事件都不发，按钮就没绑定 —— 点不动。
 *
 * ❌ 错误修法 1：在全局调度器里补发 render 事件
 *   → graph 组件监听 render，收到后重建整个 PIXI 应用
 *   → DOM 变化 → MutationObserver → 又补发 render → 无限重建
 *   → 每轮新建 WebGL 上下文，几十秒就 out of memory。
 *
 * ❌ 错误修法 2：普通 addEventListener('click')
 *   SPA 导航后 Quartz 自己的监听也绑上了，两个 handler 都执行，
 *   各切一次 → 净效果为零（表现为「首页能切，其他页点了没反应」）。
 *
 * ✅ 现在的做法：捕获阶段接管
 *   用 capture: true 抢在 Quartz 的冒泡监听之前执行，
 *   再 stopImmediatePropagation() 阻止它继续处理。
 *   这样无论 Quartz 有没有绑上，结果都是「只切一次」。
 */

export const RUNTIME = String.raw`
(function(){
  function applyTheme(mode){
    var root = document.documentElement;
    root.setAttribute('saved-theme', mode);
    try { localStorage.setItem('theme', mode); } catch (e) {}
    // Quartz 的配色靠 [saved-theme="dark"] 选择器，属性一改就生效。
    var dark = mode === 'dark';
    root.classList.toggle('theme-dark', dark);
    root.classList.toggle('theme-light', !dark);
  }

  function currentTheme(){
    return document.documentElement.getAttribute('saved-theme') === 'dark' ? 'dark' : 'light';
  }

  // 在 document 上用捕获阶段监听，比绑在每个按钮上更可靠：
  // SPA 导航换掉整个 body 后，按钮是新的 DOM，
  // 但 document 上的委托监听依然有效，不需要重新绑定。
  if (!window.__nxThemeCapture) {
    window.__nxThemeCapture = true;
    document.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.darkmode');
      if (!btn) return;
      // 抢在 Quartz 自己的 handler 之前，并阻止它继续执行，
      // 否则两边各切一次等于没切。
      ev.preventDefault();
      ev.stopImmediatePropagation();
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    }, true);  // ← capture: true 是关键
  }
})();
`
