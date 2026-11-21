/**
 * Personal Bar — 个人记录入口（左栏）
 *
 * 收藏 / 足迹 是独立页面（/my/bookmarks、/my/history），不是弹窗：
 * 列表可能上百条，弹窗里翻不方便，也无法收藏链接。
 * 主题是轻量切换，仍用弹层。
 */
import { h } from "preact"

const CSS = `
.pb-bar {
  display: flex;
  flex-direction: row;
  gap: 0.3rem;
  margin: 0.45rem 0 0.1rem;
}
.pb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.34rem 0.5rem;
  border: 1px solid var(--lightgray);
  border-radius: 7px;
  background: transparent;
  color: var(--darkgray);
  font-size: 0.76rem;
  font-family: var(--bodyFont);
  cursor: pointer;
  text-decoration: none;
  transition: border-color .15s, color .15s, background-color .15s;
  flex: 1 1 0;
  min-width: 0;
}
.pb-btn:hover { border-color: var(--secondary); color: var(--secondary); background: var(--highlight); }
.pb-btn svg { width: 13px; height: 13px; flex: 0 0 auto; }
.pb-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 主题弹层 */
.pb-pop {
  position: absolute; z-index: 70;
  width: 12rem; padding: .4rem;
  border: 1px solid var(--lightgray); border-radius: 9px;
  background: var(--light); box-shadow: 0 10px 30px rgba(0,0,0,.14);
}
.pb-pop[hidden] { display: none; }
.pb-pop .pb-head {
  padding: .1rem .35rem .4rem; margin-bottom: .25rem;
  border-bottom: 1px solid var(--lightgray);
  color: var(--gray); font-size: .7rem;
  text-transform: uppercase; letter-spacing: .06em;
}
.pb-theme {
  display: block; width: 100%; text-align: left;
  padding: .34rem .45rem; margin: .08rem 0;
  border: none; border-radius: 6px; background: none;
  color: var(--darkgray); font-size: .82rem;
  font-family: var(--bodyFont); cursor: pointer;
  transition: background-color .15s, color .15s;
}
.pb-theme:hover { background: var(--highlight); color: var(--secondary); }
.pb-theme.is-on { color: var(--secondary); font-weight: 600; }
.pb-theme.is-on::after { content: " ✓"; }
.pb-wrap { position: relative; display: flex; flex: 1 1 0; }
.pb-wrap > .pb-btn { width: 100%; }
`

const THEMES = {
  default: {
    label: "默认",
    light: { light:"#fdfdfb", lightgray:"#e8e6e1", gray:"#a3a19b", darkgray:"#3c3c39", dark:"#1b1b19", secondary:"#1f5f8b", tertiary:"#0d7d74", highlight:"rgba(31,95,139,0.08)", textHighlight:"rgba(255,213,79,0.42)" },
    dark:  { light:"#14151a", lightgray:"#2a2c34", gray:"#6b6f7a", darkgray:"#c6c9d1", dark:"#f1f2f5", secondary:"#6aa9d8", tertiary:"#4fc3b8", highlight:"rgba(106,169,216,0.12)", textHighlight:"rgba(255,213,79,0.28)" },
  },
  nord: {
    label: "北欧",
    light: { light:"#f9fafb", lightgray:"#e5e9f0", gray:"#9aa5b8", darkgray:"#3b4252", dark:"#2e3440", secondary:"#5e81ac", tertiary:"#8fbcbb", highlight:"rgba(94,129,172,0.10)", textHighlight:"rgba(235,203,139,0.45)" },
    dark:  { light:"#2e3440", lightgray:"#3b4252", gray:"#6d7a8c", darkgray:"#d8dee9", dark:"#eceff4", secondary:"#88c0d0", tertiary:"#8fbcbb", highlight:"rgba(136,192,208,0.12)", textHighlight:"rgba(235,203,139,0.30)" },
  },
  sepia: {
    label: "纸黄",
    light: { light:"#faf3e3", lightgray:"#e6dbc4", gray:"#a89878", darkgray:"#4a3f2f", dark:"#2b241a", secondary:"#8c5a2b", tertiary:"#5f7a4e", highlight:"rgba(140,90,43,0.09)", textHighlight:"rgba(240,190,90,0.45)" },
    dark:  { light:"#221d15", lightgray:"#332c21", gray:"#8a7c63", darkgray:"#e0d5c0", dark:"#f5efe2", secondary:"#c9a06a", tertiary:"#9ab37f", highlight:"rgba(201,160,106,0.13)", textHighlight:"rgba(240,190,90,0.28)" },
  },
  solarized: {
    label: "琥珀",
    light: { light:"#fdf6e3", lightgray:"#eee8d5", gray:"#93a1a1", darkgray:"#586e75", dark:"#073642", secondary:"#268bd2", tertiary:"#2aa198", highlight:"rgba(38,139,210,0.09)", textHighlight:"rgba(181,137,0,0.38)" },
    dark:  { light:"#002b36", lightgray:"#073642", gray:"#586e75", darkgray:"#93a1a1", dark:"#fdf6e3", secondary:"#268bd2", tertiary:"#2aa198", highlight:"rgba(38,139,210,0.14)", textHighlight:"rgba(181,137,0,0.32)" },
  },
}

const ICONS = {
  bookmark: "M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z",
  history: "M12 8v5l3 2M3.05 11a9 9 0 1 1 .5 4",
  palette: "M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a1 1 0 0 1 0-2h4a4 4 0 0 0 4-4c0-4-4-8-9-8z",
}

function icon(path) {
  return h("svg", {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
  }, h("path", { d: path }))
}

const RUNTIME = `
(function () {
  var THEMES = __THEMES__;
  var TKEY = "nx-theme";
  var root = document.documentElement;

  function isDark() { return root.getAttribute("saved-theme") === "dark"; }
  function applyTheme(name) {
    var t = THEMES[name] || THEMES.default;
    var vars = isDark() ? t.dark : t.light;
    Object.keys(vars).forEach(function (k) { root.style.setProperty("--" + k, vars[k]); });
    root.setAttribute("data-nx-theme", name);
  }
  window.__pbSetTheme = function (name) {
    localStorage.setItem(TKEY, name);
    applyTheme(name);
    document.querySelectorAll("[data-pb-theme]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-pb-theme") === name);
    });
  };
  function syncTheme() {
    var cur = localStorage.getItem(TKEY) || "default";
    applyTheme(cur);
    document.querySelectorAll("[data-pb-theme]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-pb-theme") === cur);
    });
  }
  window.__pbCloseTheme = function () {
    var p = document.querySelector("[data-pb-theme-panel]");
    if (p) p.hidden = true;
  };
  window.__pbToggleTheme = function (btn) {
    var p = document.querySelector("[data-pb-theme-panel]");
    if (!p) return;
    var willOpen = p.hidden;
    p.hidden = !willOpen;
    if (willOpen) {
      var r = btn.getBoundingClientRect();
      p.style.top = (r.bottom + window.scrollY + 6) + "px";
      p.style.left = Math.max(8, r.left + window.scrollX) + "px";
    }
  };
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".pb-wrap")) window.__pbCloseTheme();
  });
  document.addEventListener("nav", syncTheme);
  document.addEventListener("themechange", function () {
    applyTheme(localStorage.getItem(TKEY) || "default");
  });
  new MutationObserver(function () {
    applyTheme(localStorage.getItem(TKEY) || "default");
  }).observe(root, { attributes: true, attributeFilter: ["saved-theme"] });
  syncTheme();
})();
`

export function PersonalBar() {
  const Bar = () =>
    h("div", { class: "pb-bar" },
      h("a", {
        class: "pb-btn", href: "/my/bookmarks", title: "我的收藏",
      }, icon(ICONS.bookmark), h("span", {}, "收藏")),

      h("a", {
        class: "pb-btn", href: "/my/history", title: "浏览足迹",
      }, icon(ICONS.history), h("span", {}, "足迹")),

      h("div", { class: "pb-wrap" },
        h("button", {
          class: "pb-btn", title: "切换主题",
          onclick: "window.__pbToggleTheme(this)",
        }, icon(ICONS.palette), h("span", {}, "主题")),
        h("div", { class: "pb-pop", "data-pb-theme-panel": "", hidden: true },
          h("div", { class: "pb-head" }, "主题"),
          Object.keys(THEMES).map((name) =>
            h("button", {
              class: "pb-theme", "data-pb-theme": name,
              onclick: `window.__pbSetTheme('${name}');window.__pbCloseTheme();`,
            }, THEMES[name].label)),
        ),
      ),
    )

  Bar.css = CSS
  Bar.afterDOMLoaded = RUNTIME.replace("__THEMES__", JSON.stringify(THEMES))
  return Bar
}

export default PersonalBar
