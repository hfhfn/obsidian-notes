#!/usr/bin/env node
/**
 * 点目录名：切换展开/折叠 + 跳转到目录页（MOC）。
 *
 * 用户要求：
 *   「点击目录名跳转到 MOC 页面，并且可以展开或折叠，
 *     不要只能点箭头，不友好」
 *
 * Quartz 原生行为（folderClickBehavior: "link"）：
 *   点目录名 → 只跳转
 *   点左侧箭头 → 只展开/折叠
 *   两个操作分散在两个小目标上，箭头只有 12×12px，很难点。
 *
 * 本脚本把两个操作合到目录名上：
 *   点目录名 → 切换展开状态 + 跳转
 *
 * 实现要点：
 *   1. 绑在 a.folder-button 上（真正带 href 的元素）
 *   2. 先 toggle 再放行跳转 —— 不要 preventDefault，
 *      用户要的是「既展开又进页面」
 *   3. 展开状态由 .folder-outer 的 .open class 控制，
 *      同时同步 .folder-container 的 aria-expanded 供读屏使用
 *   4. 幂等：用 data-nx-expand 标记，避免 SPA 导航后重复绑定
 *
 * 这段逻辑由 scripts/bundle_runtime.mjs 打进全站运行时。
 */

export const EXPLORER_EXPAND_RUNTIME = `
(function(){
  /* explorer-expand-toggle */
  if (window.__nxExplorerToggle) return;
  window.__nxExplorerToggle = true;

  function toggleFolder(a){
    var li = a.closest('li');
    if (!li) return;
    var outer = li.querySelector(':scope > .folder-outer');
    if (!outer) return;                 // 叶子节点（普通笔记），没有子项

    var willOpen = !outer.classList.contains('open');
    outer.classList.toggle('open', willOpen);

    // 同步 aria 与箭头朝向，读屏和视觉都要对
    var fc = a.closest('.folder-container');
    if (fc) fc.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    li.classList.toggle('open', willOpen);
  }

  function bind(){
    document.querySelectorAll('.explorer-ul a.folder-button').forEach(function(a){
      if (a.dataset.nxToggle) return;
      a.dataset.nxToggle = '1';

      a.addEventListener('click', function(){
        // 先切换，再让浏览器正常跳转。
        // 顺序很重要：如果先跳转，SPA 会换掉整个 body，
        // 旧 DOM 上的 toggle 就白做了。
        toggleFolder(a);
        // 不 preventDefault —— 保留「跳到目录页看 MOC」的行为
      });
    });
  }

  // 立刻试 + 定时重试 + nav 重跑，覆盖 Quartz 换 DOM 的各种时机
  var tries = 0;
  function bindUntil(){
    bind();
    var ok = document.querySelectorAll('.explorer-ul a.folder-button').length > 0
      && Array.prototype.every.call(
           document.querySelectorAll('.explorer-ul a.folder-button'),
           function(a){ return a.dataset.nxToggle === '1'; }
         );
    if (ok || ++tries > 40) return;
    setTimeout(bindUntil, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUntil);
  } else {
    bindUntil();
  }
  document.addEventListener('nav', function(){ tries = 0; bindUntil(); });
  window.addEventListener('popstate', function(){ tries = 0; bindUntil(); });
})();
`;
