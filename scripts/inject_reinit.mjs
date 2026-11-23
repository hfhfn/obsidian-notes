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

    // ⚠️ 绝对不要在这里派发 Quartz 的 render 事件。
    //
    // 曾经试过「补发 render 让组件重新初始化」，结果页面 OOM 崩溃：
    //   run() → dispatch render → graph 组件收到后重建整个 PIXI 应用
    //   → DOM 变化 → MutationObserver → run() → dispatch render → ...
    // 无限循环，每轮 new 一个 WebGL 上下文，几十秒就 out of memory。
    //
    // 需要首次绑定的事件（日夜切换等）改用「直接绑定元素」的方式，
    // 见 scripts/inject_theme_button.mjs。
  }
  window.__nxReinit = run;

  // 1) DOM 就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ run('domcontentloaded'); });
  } else {
    run('immediate');
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
