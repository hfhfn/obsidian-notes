#!/usr/bin/env node
/**
 * Explorer 增强：首次渲染 + 点目录名切换展开/折叠。
 *
 * 背景（踩过的坑，按时间顺序）：
 *
 *   1. Quartz 原版：afterDOMLoaded 只注册 nav/render 监听，首次加载不渲染，
 *      探索列表是空的 → 我写 patch_explorer_init.mjs 直接改 node_modules，
 *      补一次「DOM 就绪就立即 W()」。
 *
 *   2. 那个补丁带来两个新问题：
 *      - 补丁把 W() 挂在 __nxOnReinit 上，每次 DOM 变化都重渲染，
 *        用户折叠「探索」后又被展开 → 「探索不能折叠」
 *      - 改成只跑一次后，W() 执行时折叠按钮还没插入 DOM，
 *        按钮的 click 没绑上 → 「点了完全没反应」
 *
 *   3. 结论：不该去 patch 第三方组件。Quartz 自己会在 nav/render 时处理，
 *      我们只需要在「DOM 确实就绪」时手动触发一次 render 事件，
 *      让它自己的 W() 跑一遍 —— 不重写它的逻辑，也不重复调用。
 *
 * 本脚本做两件事：
 *   A. 首次加载后触发一次 `render` 事件（Quartz 监听这个事件来渲染 explorer）
 *   B. 给 a.folder-button 绑 click：toggle 展开状态 + 放行跳转
 *
 * 关键约束：
 *   - A 只做一次（用 window.__nxExplorerRendered 标记）
 *   - 不在 DOM 变化时反复触发 A，否则会重置用户的折叠状态
 *   - B 幂等，靠 data-nx-toggle 标记
 */

export const EXPLORER_EXPAND_RUNTIME = `
(function(){
  /* explorer-enhance */

  // ===== A. 首次渲染 =====
  //
  // Quartz 的 explorer 在 afterDOMLoaded 里注册了：
  //   document.addEventListener("nav", W)
  //   document.addEventListener("render", W)
  // 但首次加载这两个事件都不发，所以列表是空的。
  // 这里等 DOM 里真的出现 .explorer-ul 之后，派发一次 render 事件。
  function triggerInitialRender(){
    if (window.__nxExplorerRendered) return;
    var ul = document.querySelector('.explorer-ul');
    if (!ul) return;                       // 还没渲染出来，等下一轮
    window.__nxExplorerRendered = 1;
    // 派发 Quartz 自己监听的 render 事件，让它按原生逻辑渲染一次
    document.dispatchEvent(new CustomEvent('render', { detail: { url: location.pathname } }));
  }

  // ===== A2. 「探索」标题折叠 =====
  //
  // 为什么不能依赖 Quartz 自己的绑定：
  //   它的绑定代码在 W() 里，而且要等 trie 数据异步加载完才执行。
  //   我们的 __nxBoot 轮询到「列表有内容」就停了，可能正好错过
  //   绑定那一刻；而且 SPA 导航后新按钮需要重新绑。
  //   这里自己绑一份，逻辑与 Quartz 完全一致（toggle .collapsed
  //   + 同步 aria-expanded），只是保证一定会绑上。
  // 用 document 捕获阶段接管，而不是逐个绑元素。
  //
  // 为什么：Quartz 自己在 W() 里也绑了 .explorer-toggle。如果它绑上了
  // （时机取决于 trie 异步加载，不稳定），两个 handler 各 toggle 一次
  // → 净效果为零，表现就是「点了没反应」。日夜按钮踩过同一个坑。
  // 捕获阶段先执行 + stopImmediatePropagation 挡住它，保证只切一次。
  function bindExplorerToggle(){
    if (window.__nxExplorerCapture) return;
    window.__nxExplorerCapture = true;
    document.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.explorer-toggle');
      if (!btn) return;
      var ex = btn.closest('.explorer');
      if (!ex) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      var collapsed = ex.classList.toggle('collapsed');
      ex.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }, true);
    // 打标记，让 __nxBoot 的完成判定能识别
    var all = document.querySelectorAll('.explorer-toggle');
    for (var i = 0; i < all.length; i++) all[i].dataset.nxCollapse = '1';
  }

  // ===== B. 点目录名：toggle + 跳转 =====
  //
  // 展开状态要写进 localStorage 的 fileTree，和 Quartz 用同一份数据。
  // 为什么必须写：点击后页面会跳转（SPA），explorer 整体重渲染，
  // Quartz 按 fileTree 里的 collapsed 恢复每个目录的展开状态。
  // 我们不写 → 它按旧状态重建 → 看起来「刚展开又被折叠」，
  // 就是用户说的「折叠展开行为不太正常」。
  function toggleFolder(a){
    var li = a.closest('li');
    if (!li) return;
    var outer = li.querySelector(':scope > .folder-outer');
    if (!outer) return;                    // 叶子节点没有子项

    var willOpen = !outer.classList.contains('open');
    outer.classList.toggle('open', willOpen);

    var fc = a.closest('.folder-container');
    if (fc) fc.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    li.classList.toggle('open', willOpen);

    // 同步到 Quartz 的 fileTree：collapsed 与 open 相反
    var folderPath = fc && fc.dataset ? fc.dataset.folderpath : null;
    if (folderPath) {
      try {
        var tree = JSON.parse(localStorage.getItem('fileTree') || '[]');
        var idx = -1;
        for (var i = 0; i < tree.length; i++) {
          if (tree[i] && tree[i].path === folderPath) { idx = i; break; }
        }
        var collapsed = !willOpen;
        if (idx >= 0) tree[idx].collapsed = collapsed;
        else tree.push({ path: folderPath, collapsed: collapsed });
        localStorage.setItem('fileTree', JSON.stringify(tree));
      } catch (e) {}
    }
  }

  // 目录名点击：只补一个「展开子项」的动作，**绝不拦截事件**。
  //
  // 用户要求「点目录名既展开又跳转」。查 Quartz 源码
  // (@quartz-community/explorer)：
  //
  //   let A = n.dataset.behavior || "collapse"
  //   if (A !== "link") { C.stopPropagation(); ...toggle... }
  //
  // 我们的配置是 folderClickBehavior: "link"，所以 Quartz 对
  // folder-button **什么都不做**，只是让浏览器正常跳转（由它自己的
  // 全局 link 拦截器接管，走 SPA 导航）。
  //
  // ❌ 之前用 stopImmediatePropagation 想「挡住 Quartz 的 toggle」，
  //    结果把 Quartz 的 SPA 路由拦截器一起挡了 → 退化成整页刷新，
  //    用户看到「点一下整个页面都闪一下」。
  //
  // ✅ 现在：不 stop、不 preventDefault，只在冒泡阶段补做展开。
  //    事件继续往下走，SPA 导航照常工作，页面不闪。
  function bind(){
    if (!window.__nxFolderCapture) {
      window.__nxFolderCapture = true;
      document.addEventListener('click', function(ev){
        var t = ev.target;
        if (!t || !t.closest) return;
        var a = t.closest('.explorer-ul a.folder-button');
        if (!a) return;
        // 只展开，不干预事件流
        toggleFolder(a);
      });   // ← 冒泡阶段，不 capture、不 stop
    }
    // 标记每次都要补 —— 导航后是新 DOM，旧标记随旧节点一起没了
    var all = document.querySelectorAll('.explorer-ul a.folder-button');
    for (var i = 0; i < all.length; i++) all[i].dataset.nxToggle = '1';
  }

  // ===== 调度 =====
  //
  // 用短间隔轮询代替 MutationObserver：
  // explorer 的 DOM 在 SPA 导航后会整体替换，轮询更容易覆盖到
  // 「新节点已插入但还没绑事件」的窗口。
  var tries = 0;
  function tick(){
    triggerInitialRender();
    bindExplorerToggle();
    bind();

    var ul = document.querySelector('.explorer-ul');
    var btns = document.querySelectorAll('.explorer-ul a.folder-button');
    var allBound = btns.length > 0 && Array.prototype.every.call(
      btns, function(a){ return a.dataset.nxToggle === '1'; }
    );
    var togglesBound = document.querySelectorAll('.explorer-toggle[data-nx-collapse]').length > 0;
    // 渲染完成 + 全部绑定完成就停
    if (ul && ul.children.length > 1 && allBound && togglesBound) return;

    if (++tries > 50) return;              // 最多约 5 秒
    setTimeout(tick, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ tries = 0; tick(); });
  } else {
    tick();
  }

  // SPA 导航后重跑（新的 DOM 需要重新绑）
  document.addEventListener('nav', function(){
    tries = 0;
    // 导航后 explorer 会自己重渲染，不用再派发 render 事件
    setTimeout(tick, 80);
  });
  window.addEventListener('popstate', function(){ tries = 0; setTimeout(tick, 80); });
})();
`;
