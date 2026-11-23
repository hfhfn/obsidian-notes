#!/usr/bin/env node
/**
 * 让「点击目录名」同时做到：展开子项 + 跳转到目录页（MOC）。
 *
 * 问题：
 *   Quartz 的 folderClickBehavior 只能二选一：
 *     "link"     → 点击跳转，只有点左侧小箭头才展开
 *     "collapse" → 点击只展开，永远进不到目录页（看不到 MOC 导航）
 *
 *   用户要两者都要：点目录名 → 进目录页看 MOC，同时侧边栏展开子项。
 *
 * 做法：
 *   不依赖 Quartz 的配置（改配置会二选一地牺牲一个），
 *   而是在 bundle 里加一小段逻辑：
 *     拦截 folder 链接的点击 →
 *       1) 先触发一次左侧箭头的 click（展开）
 *       2) 再让链接正常跳转
 *
 *   只对「有子项的目录」生效；叶子节点（普通笔记）不受影响。
 *
 * 这段逻辑被 bundle_runtime.mjs 打进全站运行时，不需要每页注入。
 */

export const EXPLORER_EXPAND_RUNTIME = `
(function(){
  /* explorer-expand */
  if (window.__nxExplorerExpand) return;
  window.__nxExplorerExpand = true;

  /**
   * 绑在真正的链接 a.folder-button 上。
   *
   * Quartz 的结构是：
   *   div.folder-container
   *     svg.folder-icon        ← 点这个只展开/收起
   *     div
   *       a.folder-button      ← 点这个跳转到目录页（href="/工作/"）
   *
   * 之前绑在外层 div 上，点击只展开了没跳转。
   */
  function bind(){
    document.querySelectorAll('.explorer-ul a.folder-button').forEach(function(a){
      if (a.dataset.nxExpand) return;
      a.dataset.nxExpand = '1';

      a.addEventListener('click', function(){
        // 点目录名：先把子项展开，再让链接正常跳转。
        // 不 preventDefault —— 用户要的是「进目录页看 MOC」。
        var li = a.closest('li');
        var outer = li ? li.querySelector(':scope > .folder-outer') : null;
        if (outer && !outer.classList.contains('open')) {
          outer.classList.add('open');
          var fc = a.closest('.folder-container');
          if (fc) fc.setAttribute('aria-expanded', 'true');
          li.classList.add('open');
        }
      });
    });
  }

  // 立刻试 + 交给全局调度器
  bind();
  if (window.__nxOnReinit) window.__nxOnReinit(bind);
  else {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    document.addEventListener('nav', bind);
  }
})();
`;
