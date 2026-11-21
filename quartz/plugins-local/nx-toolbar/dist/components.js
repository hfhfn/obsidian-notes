/**
 * Notes Toolbar — 收藏 / 分享 / 浏览记录 / 主题切换
 * 纯 preact h()，无 JSX 构建依赖。
 */
import { h } from "preact"

const SHARED_CSS = `
.nx-toolbar {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 0.25rem;
  margin: 0.3rem 0 0.1rem;
}
/* 窄屏才换行 */
@media all and (max-width: 1200px) {
  .nx-toolbar { flex-wrap: wrap; }
}
.nx-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.26rem 0.42rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: transparent;
  color: var(--darkgray);
  font-size: 0.76rem;
  line-height: 1.2;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
  font-family: var(--bodyFont);
}
.nx-btn:hover { border-color: var(--secondary); color: var(--secondary); background: var(--highlight); }
.nx-btn.is-on { border-color: var(--secondary); color: var(--secondary); background: var(--highlight); }
.nx-btn svg { width: 13px; height: 13px; flex: 0 0 auto; }

.nx-pop {
  position: absolute;
  z-index: 60;
  min-width: 13rem;
  max-width: 21rem;
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background: var(--light);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  font-size: 0.82rem;
}
.nx-pop[hidden] { display: none; }
.nx-pop ul { list-style: none; margin: 0; padding: 0; }
.nx-pop li { margin: 0; }
.nx-pop li a, .nx-pop li button.nx-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.3rem 0.4rem;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--darkgray);
  font-size: 0.82rem;
  font-family: var(--bodyFont);
  cursor: pointer;
  text-decoration: none;
}
.nx-pop li a:hover, .nx-pop li button.nx-link:hover { background: var(--highlight); color: var(--secondary); }
.nx-pop .nx-empty { padding: 0.4rem; color: var(--gray); font-size: 0.8rem; }
.nx-pop .nx-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.1rem 0.3rem 0.35rem; border-bottom: 1px solid var(--lightgray);
  margin-bottom: 0.3rem; color: var(--gray); font-size: 0.75rem;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.nx-wrap { position: relative; display: inline-block; }
`

const THEMES = {
  default: {
    label: "默认",
    light: {
      light: "#fdfdfb", lightgray: "#e8e6e1", gray: "#a3a19b",
      darkgray: "#3c3c39", dark: "#1b1b19", secondary: "#1f5f8b",
      tertiary: "#0d7d74", highlight: "rgba(31,95,139,0.08)",
      textHighlight: "rgba(255,213,79,0.42)",
    },
    dark: {
      light: "#14151a", lightgray: "#2a2c34", gray: "#6b6f7a",
      darkgray: "#c6c9d1", dark: "#f1f2f5", secondary: "#6aa9d8",
      tertiary: "#4fc3b8", highlight: "rgba(106,169,216,0.12)",
      textHighlight: "rgba(255,213,79,0.28)",
    },
  },
  nord: {
    label: "北欧",
    light: {
      light: "#f9fafb", lightgray: "#e5e9f0", gray: "#9aa5b8",
      darkgray: "#3b4252", dark: "#2e3440", secondary: "#5e81ac",
      tertiary: "#8fbcbb", highlight: "rgba(94,129,172,0.10)",
      textHighlight: "rgba(235,203,139,0.45)",
    },
    dark: {
      light: "#2e3440", lightgray: "#3b4252", gray: "#6d7a8c",
      darkgray: "#d8dee9", dark: "#eceff4", secondary: "#88c0d0",
      tertiary: "#8fbcbb", highlight: "rgba(136,192,208,0.12)",
      textHighlight: "rgba(235,203,139,0.30)",
    },
  },
  sepia: {
    label: "纸黄",
    light: {
      light: "#faf3e3", lightgray: "#e6dbc4", gray: "#a89878",
      darkgray: "#4a3f2f", dark: "#2b241a", secondary: "#8c5a2b",
      tertiary: "#5f7a4e", highlight: "rgba(140,90,43,0.09)",
      textHighlight: "rgba(240,190,90,0.45)",
    },
    dark: {
      light: "#221d15", lightgray: "#332c21", gray: "#8a7c63",
      darkgray: "#e0d5c0", dark: "#f5efe2", secondary: "#c9a06a",
      tertiary: "#9ab37f", highlight: "rgba(201,160,106,0.13)",
      textHighlight: "rgba(240,190,90,0.28)",
    },
  },
  solarized: {
    label: "琥珀",
    light: {
      light: "#fdf6e3", lightgray: "#eee8d5", gray: "#93a1a1",
      darkgray: "#586e75", dark: "#073642", secondary: "#268bd2",
      tertiary: "#2aa198", highlight: "rgba(38,139,210,0.09)",
      textHighlight: "rgba(181,137,0,0.38)",
    },
    dark: {
      light: "#002b36", lightgray: "#073642", gray: "#586e75",
      darkgray: "#93a1a1", dark: "#fdf6e3", secondary: "#268bd2",
      tertiary: "#2aa198", highlight: "rgba(38,139,210,0.14)",
      textHighlight: "rgba(181,137,0,0.32)",
    },
  },
}

const ICONS = {
  bookmark: "M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M12 3l-4 4M12 3l4 4",
  palette: "M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a1 1 0 0 1 0-2h4a4 4 0 0 0 4-4c0-4-4-8-9-8z",
  history: "M12 8v5l3 2M3.05 11a9 9 0 1 1 .5 4",
}

function icon(path) {
  return h(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    h("path", { d: path }),
  )
}

const RUNTIME = `
(function () {
  var THEMES = __THEMES__;
  var TKEY = "nx-theme", BK = "nx-bookmarks", HI = "nx-history";
  var root = document.documentElement;

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function isDark() { return root.getAttribute("saved-theme") === "dark"; }

  function applyTheme(name) {
    var t = THEMES[name] || THEMES.default;
    var vars = isDark() ? t.dark : t.light;
    Object.keys(vars).forEach(function (k) { root.style.setProperty("--" + k, vars[k]); });
    root.setAttribute("data-nx-theme", name);
  }

  window.__nxSetTheme = function (name) {
    localStorage.setItem(TKEY, name);
    applyTheme(name);
    document.querySelectorAll("[data-nx-theme-btn]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-nx-theme-btn") === name);
    });
  };

  function syncTheme() {
    var cur = localStorage.getItem(TKEY) || "default";
    applyTheme(cur);
    document.querySelectorAll("[data-nx-theme-btn]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-nx-theme-btn") === cur);
    });
  }

  function pageInfo() {
    var a = document.querySelector("h1.article-title, article h1");
    return { url: location.pathname, title: a ? a.textContent.trim() : document.title, at: Date.now() };
  }

  window.__nxBookmark = {
    has: function () { return read(BK).some(function (b) { return b.url === location.pathname; }); },
    toggle: function () {
      var list = read(BK);
      var i = list.findIndex(function (b) { return b.url === location.pathname; });
      if (i >= 0) list.splice(i, 1); else list.unshift(pageInfo());
      write(BK, list.slice(0, 100));
      return i < 0;
    },
    list: function () { return read(BK); }
  };

  window.__nxHistory = {
    record: function () {
      var p = pageInfo();
      if (p.url === "/" || !p.url) return;
      var list = read(HI).filter(function (x) { return x.url !== p.url; });
      list.unshift(p);
      write(HI, list.slice(0, 60));
    },
    list: function () { return read(HI); }
  };

  window.__nxClosePops = function () {
    document.querySelectorAll("[data-nx-panel]").forEach(function (p) { p.hidden = true; });
  };

  window.__nxTogglePop = function (name, btn) {
    var panel = document.querySelector('[data-nx-panel="' + name + '"]');
    if (!panel) return;
    var willOpen = panel.hidden;
    window.__nxClosePops();
    if (!willOpen) return;
    panel.hidden = false;
    var r = btn.getBoundingClientRect();
    panel.style.top = (r.bottom + window.scrollY + 6) + "px";
    panel.style.left = (r.left + window.scrollX) + "px";
    if (name === "history" || name === "bookmarks") window.__nxRenderList(panel, name);
  };

  window.__nxRenderList = function (panel, kind) {
    var list = kind === "bookmarks" ? window.__nxBookmark.list() : window.__nxHistory.list();
    var ul = panel.querySelector("ul");
    if (!ul) { ul = document.createElement("ul"); panel.appendChild(ul); }
    ul.innerHTML = "";
    if (!list.length) {
      var e = document.createElement("div");
      e.className = "nx-empty";
      e.textContent = kind === "bookmarks" ? "还没有收藏" : "还没有浏览记录";
      ul.appendChild(e);
      return;
    }
    list.slice(0, 30).forEach(function (it) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = it.url;
      a.textContent = it.title || it.url;
      li.appendChild(a);
      ul.appendChild(li);
    });
  };

  function refreshBookmarkBtn() {
    document.querySelectorAll("[data-nx-bookmark]").forEach(function (b) {
      b.classList.toggle("is-on", window.__nxBookmark.has());
    });
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".nx-wrap")) window.__nxClosePops();
  });
  document.addEventListener("nav", function () {
    window.__nxHistory.record();
    refreshBookmarkBtn();
    syncTheme();
  });
  document.addEventListener("themechange", function () { applyTheme(localStorage.getItem(TKEY) || "default"); });
  new MutationObserver(function () { applyTheme(localStorage.getItem(TKEY) || "default"); })
    .observe(root, { attributes: true, attributeFilter: ["saved-theme"] });

  syncTheme();
  window.__nxHistory.record();
  refreshBookmarkBtn();
})();
`

export function NotesToolbar(opts = {}) {
  const themes = opts.themes ?? Object.keys(THEMES)
  const enableBookmarks = opts.enableBookmarks !== false
  const enableShare = opts.enableShare !== false
  const enableHistory = opts.enableHistory !== false

  const Toolbar = (props) => {
    const kids = []

    if (enableBookmarks) {
      kids.push(
        h("div", { class: "nx-wrap" },
          h("button", {
            class: "nx-btn", "data-nx-bookmark": "1", title: "收藏此页",
            onclick: "var on=window.__nxBookmark.toggle();this.classList.toggle('is-on',on);",
          }, icon(ICONS.bookmark), "收藏"),
          h("div", { class: "nx-pop", "data-nx-panel": "bookmarks", hidden: true },
            h("div", { class: "nx-head" }, "收藏"),
            h("ul", {})),
        ),
      )
    }

    if (enableShare) {
      kids.push(
        h("button", {
          class: "nx-btn", title: "分享此页",
          onclick: `(function(){var u=location.href,t=document.title;
            if(navigator.share){navigator.share({title:t,url:u}).catch(function(){});return;}
            if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){
              var b=event.target.closest('button');var o=b.getAttribute('data-old')||b.textContent;
              b.setAttribute('data-old',o);b.textContent='已复制';
              setTimeout(function(){b.textContent=o;},1200);});return;}
            prompt('复制链接',u);})()`,
        }, icon(ICONS.share), "分享"),
      )
    }

    if (enableHistory) {
      kids.push(
        h("div", { class: "nx-wrap" },
          h("button", {
            class: "nx-btn", "data-nx-pop": "history", title: "浏览记录",
            onclick: "window.__nxTogglePop('history',this)",
          }, icon(ICONS.history), "足迹"),
          h("div", { class: "nx-pop", "data-nx-panel": "history", hidden: true },
            h("div", { class: "nx-head" }, "浏览记录"),
            h("ul", {})),
        ),
      )
    }

    kids.push(
      h("div", { class: "nx-wrap" },
        h("button", {
          class: "nx-btn", "data-nx-pop": "theme", title: "切换主题",
          onclick: "window.__nxTogglePop('theme',this)",
        }, icon(ICONS.palette), "主题"),
        h("div", { class: "nx-pop", "data-nx-panel": "theme", hidden: true },
          h("div", { class: "nx-head" }, "主题"),
          h("ul", {}, themes.map((name) =>
            h("li", {},
              h("button", {
                class: "nx-link", "data-nx-theme-btn": name,
                onclick: `window.__nxSetTheme('${name}');window.__nxClosePops();`,
              }, THEMES[name]?.label ?? name)))),
        ),
      ),
    )

    return h("div", { class: `${props.displayClass ?? ""} nx-toolbar` }, kids)
  }

  Toolbar.css = SHARED_CSS
  Toolbar.afterDOMLoaded = RUNTIME.replace("__THEMES__", JSON.stringify(THEMES))
  return Toolbar
}

export default NotesToolbar
