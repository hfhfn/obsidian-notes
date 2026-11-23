#!/usr/bin/env node
/**
 * 全局「组件重初始化」调度器。
 *
 * 问题根源（多个 bug 都是同一个病）：
 *   Quartz 是 SPA，点导航只替换 body，不重新加载页面。
 *   组件的 afterDOMLoaded 脚本**只在首次加载执行一次**，
 *   于是任何「把内容渲染进某个容器」的组件都会出问题：
 *
 *     - explorer：首次加载空列表，要手动触发 nav 才渲染
 *     - 评论区：从首页进文章页，容器有了但脚本不再跑，永远空白
 *     - 分页/标签页：SPA 导航后新 DOM 没人绑事件
 *     - 思维导图：首次进详情页空白，刷新才显示
 *
 *   我之前的做法是给每个组件单独打补丁（各自的 MutationObserver +
 *   多轮 setTimeout），重复、易漏、还互相干扰（__ncInit 这种一次性
 *   守卫反而把功能锁死了）。
 *
 * 本脚本的做法：
 *   在站内所有页面注入一个调度器，统一在
 *     DOMContentLoaded / nav / popstate / DOM 变化（防抖）
 *   时广播一个 `nx:reinit` 事件。
 *
 *   组件只要这样写一次：
 *     window.__nxOnReinit(function(){ if (容器存在) 渲染(); });
 *   就自动在所有时机被重新调用，不需要各自实现重试逻辑。
 *
 * 幂等：调度器本身用 window.__nxReinitInstalled 防重复安装。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inlineScript } from "./_inline.mjs"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const MARKER = "/* nx-reinit-dispatcher */"

const RUNTIME = `
(function(){
  ${MARKER}
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
`;

function injectEverywhere(distDir) {
  let touched = 0
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === "vendor" || e.name === "static") continue
        walk(full)
      } else if (e.name.endsWith(".html")) {
        let h = fs.readFileSync(full, "utf-8")
        if (h.includes(MARKER)) continue
        if (!h.includes("</body>")) continue
        // 注入到 <head> 里，且**尽早**。
        //
        // 为什么不能放 </body> 前：组件的 afterDOMLoaded 脚本是 ES module，
        // 通过 postscript 的 import() 加载，执行时机可能早于 body 末尾的
        // 内联脚本。放最后会导致组件里 `if (window.__nxOnReinit)` 判断
        // 失败，退回到各自的老逻辑（而老逻辑有各种一次性守卫的坑）。
        //
        // 放在 </head> 前可以保证：所有组件脚本执行时调度器已就绪。
        const at = h.indexOf("</head>")
        if (at < 0) continue
        h = h.slice(0, at) + inlineScript(RUNTIME) + h.slice(at)
        fs.writeFileSync(full, h)
        touched++
      }
    }
  }
  walk(distDir)
  return touched
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
  if (!target) {
    console.error("用法: node scripts/inject_reinit.mjs <dist-dir>")
    process.exit(1)
  }
  const n = injectEverywhere(path.resolve(target))
  console.log(`[reinit] 注入 ${n} 个页面`)
}

export { injectEverywhere as injectReinit }
