/**
 * Personal Bar — 个人记录入口（左栏）
 *
 * 只放「我的」内容：我的收藏、我的足迹、主题切换。
 * 每篇笔记的收藏/点赞按钮在 nx-actions 里，不在这里。
 */
import { h } from "preact"

const CSS = `
.pb-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 0.3rem;
  margin: 0.45rem 0 0.1rem;
}
.pb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--lightgray);
  border-radius: 7px;
  background: transparent;
  color: var(--darkgray);
  font-size: 0.76rem;
  font-family: var(--bodyFont);
  cursor: pointer;
  transition: border-color .15s, color .15s, background-color .15s;
  flex: 1 1 0;
  min-width: 0;
}
.pb-btn:hover { border-color: var(--secondary); color: var(--secondary); background: var(--highlight); }
.pb-btn svg { width: 13px; height: 13px; flex: 0 0 auto; }
.pb-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pb-pop {
  position: absolute; z-index: 70;
  width: 20rem; max-width: calc(100vw - 2rem); max-height: 62vh; overflow-y: auto;
  padding: 0.55rem;
  border: 1px solid var(--lightgray); border-radius: 9px;
  background: var(--light); box-shadow: 0 10px 30px rgba(0,0,0,.14);
  font-size: .82rem;
}
.pb-pop[hidden] { display: none; }
.pb-pop .pb-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: .1rem .3rem .45rem; margin-bottom: .3rem;
  border-bottom: 1px solid var(--lightgray);
  color: var(--gray); font-size: .72rem;
  text-transform: uppercase; letter-spacing: .06em;
}
.pb-pop .pb-head button {
  border: none; background: none; color: var(--gray);
  font-size: .72rem; cursor: pointer; padding: 0 .2rem;
}
.pb-pop .pb-head button:hover { color: var(--secondary); }
.pb-pop ul { list-style: none; margin: 0; padding: 0; }
.pb-pop li a {
  display: block; padding: .34rem .4rem; border-radius: 6px;
  color: var(--darkgray); text-decoration: none; font-size: .82rem;
  line-height: 1.4;
}
.pb-pop li a:hover { background: var(--highlight); color: var(--secondary); }
.pb-pop .pb-sub { display: block; color: var(--gray); font-size: .72rem; margin-top: .1rem; }
.pb-pop .pb-empty { padding: .7rem .4rem; color: var(--gray); text-align: center; font-size: .8rem; }
.pb-pop .pb-empty a { color: var(--secondary); }
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

  window.__pbClose = function () {
    document.querySelectorAll("[data-pb-panel]").forEach(function (p) { p.hidden = true; });
  };

  window.__pbOpen = function (name, btn) {
    var panel = document.querySelector('[data-pb-panel="' + name + '"]');
    if (!panel) return;
    var willOpen = panel.hidden;
    window.__pbClose();
    if (!willOpen) return;
    panel.hidden = false;
    var r = btn.getBoundingClientRect();
    panel.style.top = (r.bottom + window.scrollY + 6) + "px";
    panel.style.left = Math.max(8, r.left + window.scrollX) + "px";
    if (name === "bookmarks" || name === "history") renderList(panel, name);
  };

  async function renderList(panel, kind) {
    var ul = panel.querySelector("ul");
    if (!ul) { ul = document.createElement("ul"); panel.appendChild(ul); }
    ul.innerHTML = '<li class="pb-empty">加载中…</li>';
    var url = kind === "bookmarks" ? "/api/bookmarks" : "/api/history";
    try {
      var r = await fetch(url, { credentials: "include" });
      if (r.status === 401) {
        ul.innerHTML = '<li class="pb-empty">' +
          '登录后才能保存' + (kind === "bookmarks" ? "收藏" : "足迹") +
          '。<br><a href="/cdn-cgi/access/login?redirect_url=' +
          encodeURIComponent(location.pathname) + '">点此登录</a></li>';
        return;
      }
      var d = await r.json();
      var items = d.items || [];
      if (!items.length) {
        ul.innerHTML = '<li class="pb-empty">还没有' +
          (kind === "bookmarks" ? "收藏" : "浏览记录") + '</li>';
        return;
      }
      ul.innerHTML = "";
      items.forEach(function (it) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "/" + it.slug;
        a.textContent = it.title || it.slug;
        if (kind === "history" && it.last_seen) {
          var s = document.createElement("span");
          s.className = "pb-sub";
          s.textContent = (it.visits > 1 ? "访问 " + it.visits + " 次 · " : "") + it.last_seen.slice(0, 10);
          a.appendChild(s);
        }
        li.appendChild(a);
        ul.appendChild(li);
      });
    } catch (e) {
      ul.innerHTML = '<li class="pb-empty">加载失败</li>';
    }
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".pb-wrap")) window.__pbClose();
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
      h("div", { class: "pb-wrap" },
        h("button", {
          class: "pb-btn", title: "我的收藏",
          onclick: "window.__pbOpen('bookmarks', this)",
        }, icon(ICONS.bookmark), h("span", {}, "收藏")),
        h("div", { class: "pb-pop", "data-pb-panel": "bookmarks", hidden: true },
          h("div", { class: "pb-head" }, "我的收藏"),
          h("ul", {})),
      ),
      h("div", { class: "pb-wrap" },
        h("button", {
          class: "pb-btn", title: "浏览足迹",
          onclick: "window.__pbOpen('history', this)",
        }, icon(ICONS.history), h("span", {}, "足迹")),
        h("div", { class: "pb-pop", "data-pb-panel": "history", hidden: true },
          h("div", { class: "pb-head" }, "浏览足迹"),
          h("ul", {})),
      ),
      h("div", { class: "pb-wrap" },
        h("button", {
          class: "pb-btn", title: "切换主题",
          onclick: "window.__pbOpen('theme', this)",
        }, icon(ICONS.palette), h("span", {}, "主题")),
        h("div", { class: "pb-pop", "data-pb-panel": "theme", hidden: true },
          h("div", { class: "pb-head" }, "主题"),
          h("ul", {}, Object.keys(THEMES).map((name) =>
            h("li", {},
              h("button", {
                class: "pb-btn", "data-pb-theme": name,
                style: "width:100%;justify-content:flex-start;margin:.12rem 0;",
                onclick: `window.__pbSetTheme('${name}');window.__pbClose();`,
              }, THEMES[name].label)))),
        ),
      ),
    )

  Bar.css = CSS
  Bar.afterDOMLoaded = RUNTIME.replace("__THEMES__", JSON.stringify(THEMES))
  return Bar
}

export default PersonalBar
