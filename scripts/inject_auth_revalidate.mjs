/**
 * 登出后按浏览器后退，不能回到「已登录」的旧页面。
 *
 * 问题：用户登出 → 跳到登录页 → 按后退 → 看到之前的页面，
 * 而且侧边栏还是账号名、数据还能看。用户反馈
 * 「退出后，浏览器后退，不用登录直接就是登录状态」。
 *
 * 为什么 Cache-Control: no-store 拦不住：
 *   浏览器后退优先走 **bfcache**（back-forward cache），
 *   它把整个页面（含 JS 堆内存、DOM、滚动位置）冻结在内存里，
 *   恢复时不发任何网络请求 —— 服务器设什么头都没用。
 *
 * 正确做法：监听 pageshow，event.persisted === true 表示
 * 这一页是从 bfcache 恢复的（而不是新加载）。此时重新问一次
 * /api/whoami：
 *   - 已经登出 → 立刻 reload（会拿到未登录版本的页面）
 *   - 还登录着 → 什么都不做
 *
 * 为什么 reload 而不是原地改 DOM：
 *   服务端渲染的页面里带的是登录态数据（收藏列表、足迹、账号名），
 *   原地改 DOM 要改十几处且容易漏。reload 一次最简单可靠。
 */

export const RUNTIME = String.raw`
(function(){
  // 防止 reload 后再次触发导致死循环
  var RELOAD_KEY = 'nx-auth-checked';

  function revalidate(reason){
    fetch('/api/whoami', { credentials: 'include', cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        var authed = Boolean(d && d.authed);
        // 页面是从 bfcache 恢复的，且现在未登录 → 说明登出过，必须重载
        if (!authed) {
          // 用 sessionStorage 防止极端情况下反复 reload
          var last = 0;
          try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch (e) {}
          var now = Date.now();
          if (now - last > 2000) {
            try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch (e) {}
            location.reload();
          }
        }
      })
      .catch(function(){ /* 网络问题就别折腾用户 */ });
  }

  window.addEventListener('pageshow', function(ev){
    // persisted === true：从 bfcache 恢复（后退/前进）
    if (ev.persisted) revalidate('bfcache');
  });

  // 部分浏览器后退不走 pageshow 的 persisted 分支，
  // 额外用 visibilitychange 兜一层：从别的标签切回来时校验。
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible') {
      // 只在校验过一次之后才启用，避免正常浏览时反复请求
      try {
        if (sessionStorage.getItem('nx-had-session') === '1') revalidate('visible');
      } catch (e) {}
    }
  });
})();
`
