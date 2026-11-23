#!/usr/bin/env node
/**
 * 全局「组件重初始化」调度器 —— 只提供 RUNTIME 源码。
 *
 * 实际注入由 scripts/bundle_runtime.mjs 统一完成：
 * 所有全站运行时被打包成一个外部 JS，每页只放一行 <script src>。
 *
 * 为什么改：之前每个注入脚本各自往 689 个页面内联同一段代码，
 * 单页 53.5KB、合计 35.2MB 完全重复，浏览器无法跨页缓存。
 *
 * 本文件的职责：导出 REINIT_RUNTIME 供 bundle_runtime 打包。
 * 不再自己写文件。
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inlineScript } from "./_inline.mjs"

const RUNTIME = `
(function(){
  /* nx-reinit-dispatcher */
  if (window.__nxReinitInstalled) return;
  window.__nxReinitInstalled = true;

  var handlers = [];
  var lastRun = 0;
  var timer = null;

  /**
   * 注册一个重初始化回调。
   * 回调应当自己判断「当前页面有没有我要处理的容器」，
   * 没有就立即返回 —— 这样在任意页面调用都是安全的。
   */
  window.__nxOnReinit = function(fn){
    if (typeof fn === 'function' && handlers.indexOf(fn) === -1) {
      handlers.push(fn);
      // 注册时先跑一次，覆盖「脚本晚于 DOM 就绪」的情况
      try { fn(); } catch (e) { console.error('[nx] reinit handler failed', e); }
    }
  };

  function run(reason){
    // 节流：50ms 内不重复跑，避免 MutationObserver 抖动
    var now = Date.now();
    if (now - lastRun < 50) return;
    lastRun = now;

    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](reason); }
      catch (e) { console.error('[nx] reinit handler failed', e); }
    }
    try { document.dispatchEvent(new CustomEvent('nx:reinit', { detail: { reason: reason } })); } catch (e) {}

    // 派发 Quartz 自己的 render 事件。
    //
    // 为什么需要：Quartz 很多组件的初始化都写成
    //   document.addEventListener("nav", init)
    //   document.addEventListener("render", init)
    // 首次加载这两个事件都不发 —— 组件（日夜切换按钮等）就不会绑定。
    // 之前 explorer 也是同一个坑，当时单独打了补丁；这里统一解决：
    // 调度器每次 run() 都补发一次 render，让所有监听 render 的组件
    // 自己重新初始化（它们的 init 都是幂等的）。
    try {
      document.dispatchEvent(new CustomEvent('render', { detail: { url: location.pathname } }));
    } catch (e) {}
  }
  window.__nxReinit = run;

  // 1) DOM 就绪
  //
  // 额外：多次延迟补发 render。
  // Quartz 的组件在 afterDOMLoaded 里注册 nav/render 监听，
  // 但首次加载不会自动触发。run() 里有 50ms 节流，单次调用可能被吞，
  // 所以这里分几拍补发，确保按钮（日夜切换等）一定绑上。
  function bootRender(){
    try {
      document.dispatchEvent(new CustomEvent('render', { detail: { url: location.pathname } }));
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ run('domcontentloaded'); });
  } else {
    run('immediate');
  }
  [0, 80, 300, 900].forEach(function(ms){ setTimeout(bootRender, ms); });
  if (document.readyState !== 'complete') {
    window.addEventListener('load', bootRender, { once: true });
  }

  // 2) Quartz SPA 导航
  document.addEventListener('nav', function(){ run('nav'); });
  window.addEventListener('popstate', function(){ run('popstate'); });

  // 3) DOM 变化兜底 —— 覆盖「nav 之后异步插入内容」的情况。
  // 调度器注入在 <head>，此时 document.body 还不存在，要等它出现再挂。
  function watchBody(){
    if (!document.body) {
      setTimeout(watchBody, 20);
      return;
    }
    var mo = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(function(){ run('mutation'); }, 120);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  watchBody();

  // 4) 多轮补跑，覆盖首屏资源陆续加载完的情况
  [150, 500, 1200, 2500].forEach(function(ms){
    setTimeout(function(){ run('delayed-' + ms); }, ms);
  });
})();
`

export const REINIT_RUNTIME = RUNTIME
