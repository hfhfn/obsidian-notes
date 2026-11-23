/**
 * Note Actions — 每篇笔记自己的操作条
 *
 * 位置：笔记标题下方。包含 收藏 / 点赞 / 分享，以及阅读数。
 * 收藏与点赞需要登录；未登录时点击会跳转 Access 登录页。
 */
import { h } from "preact"

const CSS = `
.na-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.55rem 0 1.1rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 9px;
  background: color-mix(in srgb, var(--lightgray) 22%, transparent);
  font-size: 0.84rem !important;
}
.na-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--darkgray);
  font-size: 0.84rem !important;
  font-family: var(--bodyFont);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}
.na-btn:hover { background: var(--highlight); color: var(--secondary); }
.na-btn svg { width: 15px; height: 15px; flex: 0 0 auto; }
.na-btn.is-on { color: var(--secondary); background: var(--highlight); }
.na-btn.is-on svg { fill: currentColor; }
.na-btn[disabled] { opacity: .45; cursor: default; }

.na-count { font-variant-numeric: tabular-nums; }
.na-sep { width: 1px; height: 1.1em; background: var(--lightgray); }
.na-meta {
  display: inline-flex; align-items: center; gap: .3rem;
  color: var(--gray); font-size: .78rem !important; margin-left: auto;
}
.na-meta svg { width: 14px; height: 14px; }

/* 登录提示气泡 */
.na-toast {
  position: fixed; left: 50%; bottom: 2rem; transform: translateX(-50%);
  z-index: 999; padding: .6rem 1rem; border-radius: 9px;
  background: var(--dark); color: var(--light);
  font-size: .84rem !important; font-family: var(--bodyFont);
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
  opacity: 0; transition: opacity .2s ease; pointer-events: none;
}
.na-toast.show { opacity: 1; }
`

const ICONS = {
  bookmark: "M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M12 3l-4 4M12 3l4 4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
}

function icon(path) {
  return h("svg", {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
  }, h("path", { d: path }))
}

const RUNTIME = `
(function () {
  var API = "/api";
  var state = { slug: null, liked: false, bookmarked: false, views: 0, likes: 0 };

  function toast(msg) {
    var el = document.querySelector(".na-toast");
    if (!el) { el = document.createElement("div"); el.className = "na-toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function needLogin() {
    toast("收藏和点赞需要登录，正在跳转…");
    setTimeout(function () {
      location.href = "/cdn-cgi/access/login?redirect_url=" + encodeURIComponent(location.pathname);
    }, 700);
  }

  function slugOf() {
    return document.body.getAttribute("data-slug") || location.pathname;
  }

  function paint() {
    var b = document.querySelector("[data-na-bookmark]");
    if (b) b.classList.toggle("is-on", state.bookmarked);
    var l = document.querySelector("[data-na-like]");
    if (l) l.classList.toggle("is-on", state.liked);
    var lc = document.querySelector("[data-na-like-count]");
    if (lc) lc.textContent = state.likes > 0 ? state.likes : "";
    var vc = document.querySelector("[data-na-views]");
    if (vc) vc.textContent = state.views > 0 ? state.views + " 次阅读" : "";
  }

  async function load() {
    state.slug = slugOf();
    var slug = encodeURIComponent(state.slug);

    // 1) 公开计数：无需登录，访客也能看到
    try {
      var r0 = await fetch(API + "/public/stats?slug=" + slug);
      if (r0.ok) {
        var d0 = await r0.json();
        state.likes = d0.likes || 0;
        state.views = d0.views || 0;
      }
    } catch (e) {}
    paint();

    // 2) 个人状态：需要登录，未登录时静默跳过（不打扰访客）
    try {
      var r = await fetch(API + "/stats?slug=" + slug, { credentials: "include" });
      if (r.ok) {
        var d = await r.json();
        state.liked = !!d.liked;
        if (d.likes != null) state.likes = d.likes;
        if (d.views != null) state.views = d.views;
      }
    } catch (e) {}

    // 3) 收藏状态
    try {
      var r2 = await fetch(API + "/bookmarks", { credentials: "include" });
      if (r2.ok) {
        var d2 = await r2.json();
        state.bookmarked = (d2.items || []).some(function (x) { return x.slug === state.slug; });
      }
    } catch (e) {}
    paint();
  }

  async function countView() {
    try {
      await fetch(API + "/stats", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slugOf(), action: "view" }),
      });
    } catch (e) {}
  }

  // 记录浏览足迹（未登录会 401，静默忽略）
  async function recordHistory() {
    var slug = slugOf();
    if (slug === "/" || !slug) return;
    var title = (document.querySelector("h1.article-title") || {}).textContent || document.title;
    try {
      await fetch(API + "/history", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slug, title: title.trim() }),
      });
    } catch (e) {}
  }

  window.__naToggleBookmark = async function () {
    var slug = slugOf();
    var title = (document.querySelector("h1.article-title") || {}).textContent || document.title;
    try {
      var r = await fetch(API + "/bookmarks", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slug, title: title.trim() }),
      });
      if (r.status === 401) return needLogin();
      if (r.ok) {
        var d = await r.json();
        state.bookmarked = !!d.bookmarked;
        paint();
        toast(d.bookmarked ? "已收藏" : "已取消收藏");
      }
    } catch (e) { toast("操作失败，请稍后再试"); }
  };

  window.__naToggleLike = async function () {
    var slug = slugOf();
    try {
      var r = await fetch(API + "/stats", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slug, action: state.liked ? "unlike" : "like" }),
      });
      if (r.status === 401) return needLogin();
      if (r.ok) {
        var d = await r.json();
        state.likes = d.likes || 0;
        state.liked = !!d.liked;
        paint();
      }
    } catch (e) { toast("操作失败，请稍后再试"); }
  };

  window.__naShare = function () {
    var u = location.href, t = document.title;
    if (navigator.share) { navigator.share({ title: t, url: u }).catch(function(){}); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(u).then(function () { toast("链接已复制"); });
      return;
    }
    prompt("复制链接", u);
  };

  var lastSlug = null;
  function init() {
    var slug = slugOf();
    if (slug === lastSlug) return;
    lastSlug = slug;
    load();
    countView();
    recordHistory();
  }

  document.addEventListener("nav", init);
  if (window.__nxOnReinit) window.__nxOnReinit(init);
  else if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
`

export function NoteActions() {
  const Bar = () =>
    h("div", { class: "na-bar" },
      h("button", {
        class: "na-btn", "data-na-bookmark": "1",
        onclick: "window.__naToggleBookmark()", title: "收藏（需登录）",
      }, icon(ICONS.bookmark), h("span", {}, "收藏")),

      h("button", {
        class: "na-btn", "data-na-like": "1",
        onclick: "window.__naToggleLike()", title: "点赞（需登录）",
      }, icon(ICONS.heart), h("span", { "data-na-like-count": "1" })),
      h("span", { class: "na-sep" }),

      h("button", {
        class: "na-btn", onclick: "window.__naShare()", title: "分享",
      }, icon(ICONS.share), h("span", {}, "分享")),

      h("span", { class: "na-meta" },
        icon(ICONS.eye),
        h("span", { "data-na-views": "1" }),
      ),
    )

  Bar.css = CSS
  Bar.afterDOMLoaded = RUNTIME
  return Bar
}

export default NoteActions
