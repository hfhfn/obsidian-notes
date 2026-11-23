/**
 * Sidebar Tabs — 把「目录」和「漫步笔记」合并成标签页。
 *
 * 这两个组件由 Quartz 自身渲染，本组件只负责在其外层套标签按钮，
 * 并通过 afterDOMLoaded 脚本切换显示。
 */
import { h } from "preact"

const CSS = `
.nx-tabs-host { display: block; }
.nx-tabs {
  display: flex;
  gap: 0.25rem;
  margin: 0 0 0.5rem;
  border-bottom: 1px solid var(--lightgray);
}
.nx-tab {
  padding: 0.3rem 0.55rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--gray);
  font-size: 0.85rem;
  font-family: var(--headerFont);
  font-weight: 600;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.nx-tab:hover { color: var(--secondary); }
.nx-tab.is-active { color: var(--secondary); border-bottom-color: var(--secondary); }

/* 关键：.toc 自带 display:flex，会覆盖 hidden 属性的 UA 样式，
   必须显式声明，否则切换标签时目录不会真正隐藏。 */
.nx-tabs-host ~ .toc[hidden],
.nx-tabs-host ~ .backlinks[hidden] { display: none !important; }

/* 标签页已经提供了标题，隐藏各组件自带的重复标题 */
.nx-tabs-host ~ .toc > button.toc-header > h3,
.nx-tabs-host ~ .backlinks > h3 { display: none; }
/* 目录折叠按钮保留箭头，只藏文字 */
.nx-tabs-host ~ .toc > button.toc-header { padding-top: 0.15rem; }
`

const RUNTIME = `
(function () {
  window.__nxTab = function (name) {
    document.querySelectorAll("[data-nx-tab]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-nx-tab") === name);
    });
    var toc = document.querySelector(".toc");
    var bl = document.querySelector(".backlinks");
    if (toc) toc.hidden = name !== "toc";
    if (bl) bl.hidden = name !== "backlinks";
  };

  function init() {
    if (!document.querySelector(".nx-tabs")) return;
    // 默认显示目录；若该页没有目录则显示漫步笔记
    var hasToc = !!document.querySelector(".toc");
    window.__nxTab(hasToc ? "toc" : "backlinks");
  }

  document.addEventListener("nav", init);
  document.addEventListener("render", init);
  if (window.__nxOnReinit) window.__nxOnReinit(init);
  else if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
`

export function SidebarTabs() {
  const Tabs = () =>
    h("div", { class: "nx-tabs-host" },
      h("div", { class: "nx-tabs", role: "tablist" },
        h("button", {
          class: "nx-tab is-active", role: "tab", "data-nx-tab": "toc",
          onclick: "window.__nxTab('toc')",
        }, "目录"),
        h("button", {
          class: "nx-tab", role: "tab", "data-nx-tab": "backlinks",
          onclick: "window.__nxTab('backlinks')",
        }, "漫步笔记"),
      ),
    )

  Tabs.css = CSS
  Tabs.afterDOMLoaded = RUNTIME
  return Tabs
}

export default SidebarTabs
