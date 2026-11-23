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
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.34rem 0.5rem;
  border: 1px solid var(--lightgray);
  border-radius: 7px;
  background: transparent;
  color: var(--darkgray);
  /* 必须 !important：Quartz 把组件样式打进 @layer quartz-base，
     而 CSS 规范里未分层样式永远优先于 @layer 内的样式（与特异性无关）。
     浏览器扩展注入一条普通的 button { font-size: 16px } 就能压掉这里，
     导致「主题」（<button>）变成 16px，而「收藏/足迹」（<a>）不受影响，
     三个按钮看起来一大两小。用 !important 让字号不受任何外部规则影响。 */
  font-size: 0.76rem !important;
  /* 显式统一字重：Quartz 全局给 a 设了 600，而 button 默认 400，
     不写会导致「收藏/足迹」比「主题」看起来更粗更大。 */
  font-weight: 400;
  font-family: var(--bodyFont);
  cursor: pointer;
  text-decoration: none;
  transition: border-color .15s, color .15s, background-color .15s;
  flex: 1 1 0;
  min-width: 0;
}
.pb-btn:hover { border-color: var(--secondary); color: var(--secondary); background: var(--highlight); }
.pb-btn svg { width: 13px; height: 13px; flex: 0 0 auto; }
/* span 也锁定字号：即使外部规则命中 button 的后代，也不会放大文字 */
.pb-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: inherit !important; }

/* 主题弹层 */
.pb-pop {
  position: fixed; z-index: 70;
  width: 16rem; padding: .45rem;
  border: 1px solid var(--lightgray); border-radius: 9px;
  background: var(--light); box-shadow: 0 10px 30px rgba(0,0,0,.14);
}
.pb-pop[hidden] { display: none; }
.pb-pop .pb-head {
  padding: .1rem .35rem .4rem; margin-bottom: .25rem;
  border-bottom: 1px solid var(--lightgray);
  color: var(--gray); font-size: .7rem !important;
  text-transform: uppercase; letter-spacing: .06em;
}
.pb-pop .pb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .15rem; }
/* 主题弹层里的每个主题名。
   字号必须 !important —— 同 .pb-btn 的原因：Quartz 的组件样式在
   @layer quartz-base 里，任何未分层的 button{font-size:16px} 都能压掉它。
   （用户反馈过「主题点开里面具体主题名称的字体大小也有同样问题」。）
   为了不再一处一处补，见文件末尾的「字体锁定」区块。 */
.pb-theme {
  display: block; width: 100%; text-align: left;
  padding: .34rem .45rem; margin: 0;
  border: none; border-radius: 6px; background: none;
  color: var(--darkgray); font-size: 0.76rem !important;
  font-family: var(--bodyFont); cursor: pointer;
  transition: background-color .15s, color .15s;
}
.pb-theme span, .pb-theme * { font-size: inherit !important; }
.pb-theme:hover { background: var(--highlight); color: var(--secondary); }
.pb-theme.is-on { color: var(--secondary); font-weight: 600; }
.pb-theme.is-on::after { content: " ✓"; }
.pb-wrap { position: relative; display: flex; flex: 1 1 0; min-width: 0; }

/* ===== 账号入口（第二行） ===== */
.pb-personal { display: flex; flex-direction: column; gap: .4rem; margin: .6rem 0 1rem; }
.pb-account-row { position: relative; display: flex; }
.pb-account-btn {
  display: flex; align-items: center; gap: .4rem;
  width: 100%; padding: .38rem .6rem;
  border: 1px solid var(--lightgray); border-radius: 7px;
  background: transparent; color: var(--darkgray);
  font-size: 0.76rem !important;
  font-weight: 400;
  font-family: var(--bodyFont);
  text-decoration: none;
  cursor: pointer;
  transition: border-color .15s, color .15s, background-color .15s;
}
.pb-account-btn:hover { border-color: var(--secondary); color: var(--secondary); background: var(--highlight); }
.pb-account-btn svg { width: 13px; height: 13px; flex: 0 0 auto; }
.pb-account-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: inherit !important;
}
.pb-account-pop { width: 15rem; padding: .5rem; }
.pb-account-info { padding: .15rem .45rem .5rem; border-bottom: 1px solid var(--lightgray); margin-bottom: .35rem; }
.pb-account-name { font-size: 0.82rem !important; font-weight: 600; color: var(--dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-account-mail { font-size: 0.7rem !important; color: var(--gray); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: .1rem; }
.pb-account-links { display: flex; flex-direction: column; gap: .05rem; }
.pb-account-link {
  display: block; padding: .34rem .45rem; border-radius: 6px;
  color: var(--darkgray) !important; text-decoration: none !important;
  font-size: 0.78rem !important; font-weight: 400 !important;
}
.pb-account-link:hover { background: var(--highlight); color: var(--secondary) !important; }
.pb-account-logout {
  display: block; width: 100%; text-align: left;
  margin-top: .3rem; padding: .34rem .45rem;
  border: none; border-radius: 6px; background: none;
  color: #c0392b !important; font-size: 0.78rem !important;
  font-family: var(--bodyFont); cursor: pointer;
}
.pb-account-logout:hover { background: var(--highlight); }
.pb-account-btn.is-authed svg { display: none; }
.pb-account-avatar {
  width: 15px; height: 15px; border-radius: 50%; flex: 0 0 auto;
  background: var(--secondary); color: var(--light);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px !important; font-weight: 600; line-height: 1;
}

/* 主题弹层 */
.pb-pop {
  position: fixed; z-index: 70;
  width: 16rem; padding: .45rem;
  border: 1px solid var(--lightgray); border-radius: 9px;
  background: var(--light); box-shadow: 0 10px 30px rgba(0,0,0,.14);
}
.pb-pop[hidden] { display: none; }
.pb-pop .pb-head {
  padding: .1rem .35rem .4rem; margin-bottom: .25rem;
  border-bottom: 1px solid var(--lightgray);
  color: var(--gray); font-size: .7rem !important;
  text-transform: uppercase; letter-spacing: .06em;
}
.pb-pop .pb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .15rem; }
/* 主题弹层里的每个主题名。
   字号必须 !important —— 同 .pb-btn 的原因：Quartz 的组件样式在
   @layer quartz-base 里，任何未分层的 button{font-size:16px} 都能压掉它。
   （用户反馈过「主题点开里面具体主题名称的字体大小也有同样问题」。）
   为了不再一处一处补，见文件末尾的「字体锁定」区块。 */
.pb-theme {
  display: block; width: 100%; text-align: left;
  padding: .34rem .45rem; margin: 0;
  border: none; border-radius: 6px; background: none;
  color: var(--darkgray); font-size: 0.76rem !important;
  font-family: var(--bodyFont); cursor: pointer;
  transition: background-color .15s, color .15s;
}
.pb-theme span, .pb-theme * { font-size: inherit !important; }
.pb-theme:hover { background: var(--highlight); color: var(--secondary); }
.pb-theme.is-on { color: var(--secondary); font-weight: 600; }
.pb-theme.is-on::after { content: " ✓"; }
.pb-wrap { position: relative; display: flex; flex: 1 1 0; min-width: 0; }

/* 账号入口 */
.pb-account-wrap { position: relative; }
.pb-account-pop { width: 14rem; padding: .5rem; }
.pb-account-info { padding: .15rem .45rem .5rem; border-bottom: 1px solid var(--lightgray); margin-bottom: .35rem; }
.pb-account-name { font-size: 0.82rem !important; font-weight: 600; color: var(--dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-account-mail { font-size: 0.7rem !important; color: var(--gray); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: .1rem; }
.pb-account-links { display: flex; flex-direction: column; gap: .05rem; }
.pb-account-link {
  display: block; padding: .34rem .45rem; border-radius: 6px;
  color: var(--darkgray) !important; text-decoration: none !important;
  font-size: 0.78rem !important; font-weight: 400 !important;
}
.pb-account-link:hover { background: var(--highlight); color: var(--secondary) !important; }
.pb-account-logout {
  display: block; width: 100%; text-align: left;
  margin-top: .3rem; padding: .34rem .45rem;
  border: none; border-radius: 6px; background: none;
  color: #c0392b !important; font-size: 0.78rem !important;
  font-family: var(--bodyFont); cursor: pointer;
}
.pb-account-logout:hover { background: var(--highlight); }
/* 已登录时按钮上显示头像圆圈 */
.pb-account-btn.is-authed svg { display: none; }
.pb-account-avatar {
  width: 15px; height: 15px; border-radius: 50%; flex: 0 0 auto;
  background: var(--secondary); color: var(--light);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px !important; font-weight: 600; line-height: 1;
}
.pb-wrap > .pb-btn { width: 100%; }

/* 三个入口平分宽度。直接按百分比分配，避免 <a> 与 <div> 在 flex 收缩
   上的细微差异导致「主题」比其他两个窄、字显得更大。 */
.pb-bar > .pb-btn,
.pb-bar > .pb-wrap {
  flex: 0 0 calc((100% - 0.6rem) / 3);
  width: calc((100% - 0.6rem) / 3);
}
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
  // —— 以下四套白天模式差异明显 ——
  mint: {
    label: "薄荷",
    light: { light:"#f2fbf7", lightgray:"#cfe9de", gray:"#8fae9f", darkgray:"#2f4a3f", dark:"#12332a", secondary:"#0f8a5f", tertiary:"#1aa3a3", highlight:"rgba(15,138,95,0.10)", textHighlight:"rgba(120,220,180,0.45)" },
    dark:  { light:"#0e1f1a", lightgray:"#1d3a30", gray:"#5f8478", darkgray:"#c3ded3", dark:"#e8f5ef", secondary:"#4fd1a5", tertiary:"#5ecfcf", highlight:"rgba(79,209,165,0.13)", textHighlight:"rgba(120,220,180,0.26)" },
  },
  rose: {
    label: "玫瑰",
    light: { light:"#fff7f9", lightgray:"#f0dae0", gray:"#b99aa4", darkgray:"#4a2f38", dark:"#2e1520", secondary:"#b83b5e", tertiary:"#d4778c", highlight:"rgba(184,59,94,0.09)", textHighlight:"rgba(255,170,190,0.45)" },
    dark:  { light:"#1e1116", lightgray:"#37202a", gray:"#8a6373", darkgray:"#e0c4ce", dark:"#f7eaf0", secondary:"#e8799a", tertiary:"#d99cb0", highlight:"rgba(232,121,154,0.13)", textHighlight:"rgba(255,170,190,0.26)" },
  },
  midnight: {
    label: "深海",
    light: { light:"#f5f8fc", lightgray:"#d8e2ef", gray:"#93a3b8", darkgray:"#2a3a52", dark:"#0f1a2b", secondary:"#2a5fa8", tertiary:"#3f8fbf", highlight:"rgba(42,95,168,0.10)", textHighlight:"rgba(140,190,255,0.42)" },
    dark:  { light:"#0a1220", lightgray:"#1a2536", gray:"#5a6b85", darkgray:"#c0cfe0", dark:"#e8f0fa", secondary:"#5b9de8", tertiary:"#4fc3d9", highlight:"rgba(91,157,232,0.14)", textHighlight:"rgba(140,190,255,0.26)" },
  },
  forest: {
    label: "森林",
    light: { light:"#f7f8f2", lightgray:"#dfe3d0", gray:"#9aa384", darkgray:"#38402a", dark:"#1c2415", secondary:"#4d6b2f", tertiary:"#7a9440", highlight:"rgba(77,107,47,0.10)", textHighlight:"rgba(190,220,120,0.45)" },
    dark:  { light:"#141a10", lightgray:"#28331f", gray:"#6b7a5a", darkgray:"#ccd6bd", dark:"#f0f5e8", secondary:"#93b862", tertiary:"#a8c47a", highlight:"rgba(147,184,98,0.14)", textHighlight:"rgba(190,220,120,0.26)" },
  },
}


const ICONS = {
  bookmark: "M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z",
  history: "M12 8v5l3 2M3.05 11a9 9 0 1 1 .5 4",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  palette: "M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a1 1 0 0 1 0-2h4a4 4 0 0 0 4-4c0-4-4-8-9-8z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
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
      p.style.top = (r.bottom + 6) + "px";
      p.style.left = Math.max(8, r.left) + "px";
      // 防止超出视口右边
      var w = p.offsetWidth || 192;
      if (r.left + w > window.innerWidth - 8) {
        p.style.left = Math.max(8, window.innerWidth - w - 8) + "px";
      }
    }
  };
  document.addEventListener("click", function (e) {
    // 点在账号按钮/面板上时不要关闭 —— 否则按钮的 click 先触发打开，
    // 紧接着冒泡到 document 又被这里关掉，表现成「点了没反应」。
    if (!e.target.closest(".pb-wrap")) {
      window.__pbCloseTheme();
    }
    // 注意选择器必须和实际 DOM 一致：账号入口的外层是 .pb-account-row，
    // 不是 .pb-account-wrap（那个类在重构时去掉了）。
    // 写成不存在的类会导致判断永远为真 —— 每次点击都把刚打开的面板关掉，
    // 表现成「点了没反应」。
    if (!e.target.closest(".pb-account-row")) {
      window.__pbCloseAccount();
    }
  });

  // ===== 账号入口 =====
  //
  // 静态站不知道访客是谁，所以服务端只渲染「登录」，
  // 前端查 /api/whoami 后按结果切换。
  //
  // 缓存策略：结果记在内存（不是 localStorage）——
  // 用户退出后不该残留已登录态，但同一页面内切来切去不必反复请求。
  var acctState = null;
  var acctFetching = false;

  window.__pbCloseAccount = function () {
    var p = document.querySelector("[data-pb-account-panel]");
    if (p) p.hidden = true;
  };

  window.__pbToggleAccount = function (btn) {
    var p = document.querySelector("[data-pb-account-panel]");
    if (!p) return;
    // 用 DOM 上的标记判断，不用闭包变量 ——
    // RUNTIME 在 SPA 导航后可能被重新执行，闭包里的 acctState 会丢，
    // 导致「已登录但点不开菜单」。
    var authed = btn && btn.classList.contains("is-authed");
    if (!authed) {
      location.href = "/login?redirect=" + encodeURIComponent(location.pathname + location.search);
      return;
    }
    var willOpen = p.hidden;

    if (willOpen) {
      // 必须先取消 hidden 再量尺寸 —— hidden 状态下 offsetWidth 是 0，
      // 之前用它算位置会让面板跑到 (0,0) 或者宽度算错，
      // 表现成「点了没反应 / 面板看不见」。
      p.hidden = false;
      p.style.visibility = "hidden";
      var r = btn.getBoundingClientRect();
      var w = p.offsetWidth || 224;
      var left = Math.max(8, r.left);
      if (left + w > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - w - 8);
      }
      p.style.top = (r.bottom + 6) + "px";
      p.style.left = left + "px";
      p.style.visibility = "";
    } else {
      p.hidden = true;
    }
  };

  window.__pbLogout = function () {
    // 私有站的登录态是 Cloudflare Access 签发的，光清 notes_session
    // 等于没退（刷新后 Access 还认得你）。后端会返回 accessLogoutUrl，
    // 跳过去才算真正登出。
    fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        acctState = null;
        if (d && d.accessLogoutUrl) {
          location.href = d.accessLogoutUrl;
        } else {
          location.href = "/";
        }
      })
      .catch(function () {
        acctState = null;
        location.href = "/";
      });
  };

  function renderAccount(me) {
    acctState = me;
    var btn = document.querySelector(".pb-account-btn");
    if (!btn) return;
    var panel = document.querySelector("[data-pb-account-panel]");
    var label = btn.querySelector(".pb-account-label") || btn.querySelector("span");

    if (me && me.authed) {
      btn.classList.add("is-authed");
      // 不能设 href="#" —— 点击会触发 hash 导航，页面跳走，
      // 面板刚打开就没了（用户反馈「点了没反应」）。
      // 用 button 语义：移除 href，交给 onclick 处理。
      btn.removeAttribute("href");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.setAttribute("title", me.email || "我的账号");
      // 头像：邮箱首字母
      var initial = (me.name || me.email || "?").trim().charAt(0).toUpperCase();
      if (!btn.querySelector(".pb-account-avatar")) {
        var av = document.createElement("span");
        av.className = "pb-account-avatar";
        av.textContent = initial;
        btn.insertBefore(av, label);
      }
      if (label) label.textContent = (me.name || me.email || "").split("@")[0] || "账号";
      if (panel) {
        var nm = panel.querySelector("[data-pb-account-name]");
        var ml = panel.querySelector("[data-pb-account-mail]");
        if (nm) nm.textContent = me.name || "（未设置昵称）";
        if (ml) ml.textContent = me.email || "";
      }
      btn.onclick = function (e) {
        e.preventDefault();
        window.__pbToggleAccount(btn);
      };
    } else {
      btn.classList.remove("is-authed");
      btn.setAttribute("href", "/login?redirect=" + encodeURIComponent(location.pathname + location.search));
      btn.setAttribute("title", "登录");
      if (label) label.textContent = "登录";
      var old = btn.querySelector(".pb-account-avatar");
      if (old) old.remove();
      btn.onclick = null;
      if (panel) panel.hidden = true;
    }
  }

  // 渲染账号按钮。
  //
  // 踩过的坑：这里原来只在脚本执行时调一次 loadAccount()。
  // 但这段脚本可能在 .pb-account-btn 还没进 DOM 时执行 ——
  // renderAccount 里 if (!btn) return 会直接退出，之后再也不重试，
  // 表现成「明明登录了，侧边栏还是显示登录按钮」。
  // 所以：拿到 whoami 结果后，如果按钮还不存在就轮询等它出现。
  var pendingAccount = null;

  function applyAccount(me) {
    acctState = me;
    var tries = 0;
    (function tryRender() {
      var btn = document.querySelector(".pb-account-btn");
      if (btn) {
        renderAccount(me);
        pendingAccount = null;
        return;
      }
      if (++tries > 60) { pendingAccount = me; return; }  // 约 6 秒后放弃
      setTimeout(tryRender, 100);
    })();
  }

  function loadAccount(force) {
    if (acctFetching) return;
    if (acctState && !force) { applyAccount(acctState); return; }
    acctFetching = true;
    fetch("/api/whoami", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { applyAccount(d || { authed: false }); })
      .catch(function () { applyAccount({ authed: false }); })
      .then(function () { acctFetching = false; });
  }

  // SPA 导航后按钮是新 DOM，重新渲染一次（不重新请求，用缓存状态）
  document.addEventListener("nav", function () {
    if (acctState) applyAccount(acctState);
    else loadAccount(false);
  });

  document.addEventListener("nav", syncTheme);
  loadAccount(false);
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
    h("div", { class: "pb-personal" },
      // 第一行：收藏 / 足迹 / 主题
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
            h("div", { class: "pb-grid" },
              Object.keys(THEMES).map((name) =>
                h("button", {
                  class: "pb-theme", "data-pb-theme": name,
                  onclick: `window.__pbSetTheme('${name}');window.__pbCloseTheme();`,
                }, THEMES[name].label))),
          ),
        ),
      ),

      // 第二行：账号入口
      //
      // 为什么不跟上面三个挤一排：侧边栏内容宽度约 260-320px，
      // 四个按钮平分后每个只剩 ~70px，文字被截断还会溢出。
      // 账号单独一行给足宽度，也符合主流做法。
      h("div", { class: "pb-account-row" },
        h("a", {
          class: "pb-account-btn",
          href: "/login?redirect=" + encodeURIComponent("/"),
          title: "登录",
          "data-pb-account": "guest",
        }, icon(ICONS.user), h("span", { class: "pb-account-label" }, "登录")),

        h("div", { class: "pb-pop pb-account-pop", "data-pb-account-panel": "", hidden: true },
          h("div", { class: "pb-head" }, "我的账号"),
          h("div", { class: "pb-account-info" },
            h("div", { class: "pb-account-name", "data-pb-account-name": "" }, ""),
            h("div", { class: "pb-account-mail", "data-pb-account-mail": "" }, ""),
          ),
          h("div", { class: "pb-account-links" },
            h("a", { class: "pb-account-link", href: "/my/bookmarks" }, "我的收藏"),
            h("a", { class: "pb-account-link", href: "/my/history" }, "浏览足迹"),
            // 绑定其他邮箱：把第二个登录方式并入当前账号。
            // 系统无法自动判断「a@gmail.com 和 b@qq.com 是同一个人」，
            // 只能让用户自己声明。
            h("a", { class: "pb-account-link", href: "/bind-email?mode=add" }, "绑定其他邮箱"),
          ),
          h("button", {
            class: "pb-account-logout",
            onclick: "window.__pbLogout()",
          }, "退出登录"),
        ),
      ),
    )

  Bar.css = CSS
  Bar.afterDOMLoaded = RUNTIME.replace("__THEMES__", JSON.stringify(THEMES))
  return Bar
}

export default PersonalBar
