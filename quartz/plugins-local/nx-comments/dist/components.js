/**
 * 自建评论区
 *
 * 为什么不用 giscus：giscus 只能用 GitHub 账号登录，而站点已有自己的登录
 * （邮箱验证码 / Google / GitHub），读者不该为了评论再注册一个 GitHub。
 * 这里直接复用站点的 notes_session Cookie，登录态天然统一。
 *
 * 数据流：
 *   GET  /api/comments?slug=xxx        拉评论树
 *   POST /api/comments                 发评论 / 表情回应（action=reaction）
 *   DELETE /api/comments               删评论（本人或管理员）
 */
import { h } from "preact"

const CSS = `
.nc-wrap {
  margin: 2rem 0 1rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--lightgray);
}
.nc-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.nc-title {
  margin: 0 !important;
  font-size: 1.05rem !important;
  font-weight: 600;
}
.nc-count {
  color: var(--gray);
  font-size: 0.82rem !important;
}
.nc-login-hint {
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  color: var(--darkgray);
  font-size: 0.85rem !important;
  line-height: 1.6;
}
.nc-login-hint a {
  color: var(--secondary) !important;
  font-weight: 600;
}
.nc-form {
  margin-bottom: 1.6rem;
}
.nc-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 84px;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background: var(--light);
  color: var(--dark);
  font-family: var(--bodyFont);
  font-size: 0.88rem !important;
  line-height: 1.6;
  resize: vertical;
}
.nc-textarea:focus {
  outline: none;
  border-color: var(--secondary);
}
.nc-form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: 0.5rem;
}
.nc-who {
  color: var(--gray);
  font-size: 0.78rem !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nc-btn {
  padding: 0.36rem 0.9rem;
  border: 1px solid var(--lightgray);
  border-radius: 7px;
  background: var(--light);
  color: var(--darkgray) !important;
  font-family: var(--bodyFont);
  font-size: 0.82rem !important;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.nc-btn:hover:not(:disabled) {
  border-color: var(--secondary);
  color: var(--secondary) !important;
}
.nc-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.nc-btn-primary {
  border-color: var(--secondary);
  color: var(--secondary) !important;
  font-weight: 600;
}
.nc-list {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.nc-item {
  display: flex;
  gap: 0.65rem;
}
.nc-avatar {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--lightgray);
  object-fit: cover;
}
.nc-body-wrap {
  flex: 1 1 auto;
  min-width: 0;
}
.nc-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}
.nc-name {
  font-size: 0.85rem !important;
  font-weight: 600;
  color: var(--dark);
}
.nc-time {
  color: var(--gray);
  font-size: 0.74rem !important;
}
.nc-text {
  font-size: 0.87rem !important;
  line-height: 1.65;
  color: var(--darkgray);
  word-break: break-word;
  white-space: pre-wrap;
}
.nc-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}
.nc-react {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid transparent;
  border-radius: 12px;
  background: none;
  font-size: 0.76rem !important;
  line-height: 1.5;
  cursor: pointer;
  color: var(--gray) !important;
  transition: border-color 0.12s, background-color 0.12s;
}
.nc-react:hover {
  border-color: var(--lightgray);
}
.nc-react.on {
  border-color: var(--secondary);
  background: var(--highlight);
  color: var(--secondary) !important;
}
.nc-link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--gray) !important;
  font-family: var(--bodyFont);
  font-size: 0.74rem !important;
  cursor: pointer;
}
.nc-link-btn:hover {
  color: var(--secondary) !important;
}
.nc-replies {
  margin: 0.7rem 0 0 0;
  padding-left: 0.9rem;
  border-left: 2px solid var(--lightgray);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.nc-empty {
  color: var(--gray);
  font-size: 0.84rem !important;
  padding: 0.6rem 0;
}
.nc-error {
  color: #e05252;
  font-size: 0.8rem !important;
  margin-top: 0.4rem;
}
`

const API = "/api"

function relTime(iso) {
  // D1 返回 "YYYY-MM-DD HH:MM:SS"（UTC），补成 ISO
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z")
  if (Number.isNaN(t)) return iso
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60) return "刚刚"
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function avatarFor(emailHash) {
  // 与服务端一致的派生方式：SHA-256 前 32 hex
  // 前端没有同步 digest，这里退化为直接用 email 的稳定哈希（简单 djb2），
  // 保证同一邮箱同一头像即可。
  let hash = 5381
  const s = String(emailHash || "").toLowerCase()
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0
  const hex = (hash >>> 0).toString(16).padStart(8, "0").repeat(4).slice(0, 32)
  return `https://www.gravatar.com/avatar/${hex}?s=64&d=identicon&r=pg`
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function slugFromPath() {
  // 与 Quartz 的 pathname mapping 对齐：去掉开头的 /，去掉结尾的 /
  let p = decodeURIComponent(location.pathname)
  p = p.replace(/^\/+/, "").replace(/\/+$/, "")
  return p || "index"
}

// 注意：afterDOMLoaded 必须是模块级常量。
// 如果写成组件函数内部的 Root.afterDOMLoaded = `...`，Quartz 在注册组件时
// 就会读取这个属性（那时函数还没被调用），拿到 undefined，脚本不会被打包。
const RUNTIME = `
(function(){

  var API = ${JSON.stringify(API)};
  var EMOJIS = ${JSON.stringify(["👍", "❤️", "🎉", "🤔", "👀"])};

  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function relTime(iso){
    var t = Date.parse(iso.indexOf('T') >= 0 ? iso : iso.replace(' ','T') + 'Z');
    if (isNaN(t)) return iso;
    var d = Math.floor((Date.now()-t)/1000);
    if (d < 60) return '刚刚';
    if (d < 3600) return Math.floor(d/60)+' 分钟前';
    if (d < 86400) return Math.floor(d/3600)+' 小时前';
    if (d < 86400*30) return Math.floor(d/86400)+' 天前';
    var dt = new Date(t);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  }
  function avatarFor(email){
    var hash = 5381, s = String(email||'').toLowerCase();
    for (var i=0;i<s.length;i++) hash = ((hash<<5)+hash+s.charCodeAt(i))|0;
    var hex = (hash>>>0).toString(16).padStart(8,'0');
    hex = (hex+hex+hex+hex).slice(0,32);
    return 'https://www.gravatar.com/avatar/'+hex+'?s=64&d=identicon&r=pg';
  }
  function slugFromPath(){
    var p = decodeURIComponent(location.pathname);
    p = p.replace(/^\\/+/, '').replace(/\\/+$/, '');
    return p || 'index';
  }

  var state = { items: [], me: null, loading: false, error: '', replyTo: null };

  function findRoot(){ return document.querySelector('.nc-wrap'); }

  function renderItem(c, isReply){
    var reacts = EMOJIS.map(function(e){
      var r = (c.reactions && c.reactions[e]) || {count:0, mine:false};
      if (!r.count && !state.me) return '';
      return '<button class="nc-react'+(r.mine?' on':'')+'" data-react="'+esc(e)+'" data-cid="'+c.id+'">'
        + e + (r.count ? ' <span>'+r.count+'</span>' : '') + '</button>';
    }).join('');

    return '<div class="nc-item" data-cid="'+c.id+'">'
      + '<img class="nc-avatar" src="'+avatarFor(c.emailHash)+'" alt="" loading="lazy">'
      + '<div class="nc-body-wrap">'
      +   '<div class="nc-meta"><span class="nc-name">'+esc(c.name)+'</span>'
      +     '<span class="nc-time">'+relTime(c.createdAt)+'</span></div>'
      +   '<div class="nc-text">'+esc(c.body)+'</div>'
      +   '<div class="nc-actions">'
      +     reacts
      +     (state.me ? '<button class="nc-link-btn" data-reply="'+c.id+'">回复</button>' : '')
      +     (c.canDelete ? '<button class="nc-link-btn" data-del="'+c.id+'">删除</button>' : '')
      +   '</div>'
      +   (state.replyTo === c.id ? replyForm(c.id) : '')
      + '</div></div>';
  }

  function replyForm(parentId){
    return '<div class="nc-form" style="margin-top:0.6rem">'
      + '<textarea class="nc-textarea" data-reply-input="'+parentId+'" placeholder="写下你的回复…" style="min-height:60px"></textarea>'
      + '<div class="nc-form-row"><span class="nc-who">以 '+esc(state.me||'')+' 身份回复</span>'
      + '<span><button class="nc-btn" data-reply-cancel="1">取消</button> '
      + '<button class="nc-btn nc-btn-primary" data-reply-send="'+parentId+'">发送</button></span></div>'
      + '</div>';
  }

  function render(){
    var root = findRoot();
    if (!root) return;

    if (state.loading && !state.items.length) {
      root.innerHTML = '<div class="nc-empty">加载评论…</div>';
      return;
    }

    var tops = state.items.filter(function(c){ return !c.parentId; });
    var byParent = {};
    state.items.forEach(function(c){
      if (c.parentId) {
        (byParent[c.parentId] = byParent[c.parentId] || []).push(c);
      }
    });

    var listHtml = tops.map(function(c){
      var replies = (byParent[c.id] || []).map(function(r){ return renderItem(r, true); }).join('');
      return renderItem(c, false) + (replies ? '<div class="nc-replies">'+replies+'</div>' : '');
    }).join('');

    var head = '<div class="nc-head"><h3 class="nc-title">评论</h3>'
      + '<span class="nc-count">'+(state.items.length ? state.items.length + ' 条' : '暂无')+'</span></div>';

    var hint = state.me
      ? ''
      : '<div class="nc-login-hint">登录后即可评论、回应表情。'
        + '支持邮箱验证码 / Google / GitHub，'
      + '<a href="/login?redirect=' + encodeURIComponent(location.pathname) + '">去登录 →</a></div>';

    var form = state.me
      ? '<div class="nc-form">'
        + '<textarea class="nc-textarea" data-main-input placeholder="说点什么…（支持纯文本，换行会保留）"></textarea>'
        + '<div class="nc-form-row"><span class="nc-who">以 '+esc(state.me)+' 身份发表</span>'
        + '<button class="nc-btn nc-btn-primary" data-send>发表</button></div>'
        + (state.error ? '<div class="nc-error">'+esc(state.error)+'</div>' : '')
        + '</div>'
      : '';

    var empty = (!state.items.length && !state.loading)
      ? '<div class="nc-empty">还没有评论，来说第一句吧。</div>'
      : '';

    root.innerHTML = head + hint + form + '<div class="nc-list">'+listHtml+'</div>' + empty;
  }

  async function load(){
    state.loading = true;
    render();
    try {
      var r = await fetch(API + '/comments?slug=' + encodeURIComponent(slugFromPath()), { credentials: 'include' });
      var d = await r.json();
      if (d && d.ok) {
        state.items = d.items || [];
        state.me = d.me || null;
        state.error = '';
      } else {
        state.error = (d && d.error) || '加载失败';
      }
    } catch (e) {
      state.error = '网络错误';
    }
    state.loading = false;
    render();
  }

  async function post(body){
    var r = await fetch(API + '/comments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    var d = await r.json().catch(function(){ return {}; });
    if (r.status === 401) {
      location.href = '/login?redirect=' + encodeURIComponent(location.pathname + location.search);
      return false;
    }
    if (!d.ok) {
      state.error = d.error === 'rate_limited' ? '发得太快了，稍等一下' : (d.error || '发送失败');
      render();
      return false;
    }
    state.error = '';
    return true;
  }

  document.addEventListener('click', async function(ev){
    var t = ev.target;
    if (!t.closest) return;

    var react = t.closest('[data-react]');
    if (react) {
      if (!state.me) { location.href = '/login?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      await post({ action: 'reaction', commentId: Number(react.dataset.cid), emoji: react.dataset.react });
      await load();
      return;
    }

    var replyBtn = t.closest('[data-reply]');
    if (replyBtn) {
      state.replyTo = Number(replyBtn.dataset.reply);
      render();
      return;
    }

    if (t.closest('[data-reply-cancel]')) {
      state.replyTo = null;
      render();
      return;
    }

    var replySend = t.closest('[data-reply-send]');
    if (replySend) {
      var pid = Number(replySend.dataset.replySend);
      var ta = document.querySelector('[data-reply-input="'+pid+'"]');
      var txt = ta ? ta.value.trim() : '';
      if (!txt) return;
      var ok = await post({ slug: slugFromPath(), body: txt, parentId: pid });
      if (ok) { state.replyTo = null; await load(); }
      return;
    }

    var del = t.closest('[data-del]');
    if (del) {
      if (!confirm('确定删除这条评论？')) return;
      var r = await fetch(API + '/comments', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: Number(del.dataset.del) })
      });
      if (r.status === 401) { location.href = '/login?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      await load();
      return;
    }

    if (t.closest('[data-send]')) {
      var main = document.querySelector('[data-main-input]');
      var text = main ? main.value.trim() : '';
      if (!text) return;
      var ok2 = await post({ slug: slugFromPath(), body: text });
      if (ok2) { main.value = ''; await load(); }
      return;
    }
  });

  // 初次加载 + SPA 切页后重新加载。
  //
  // 不再自己写重试逻辑 —— 统一交给 scripts/inject_reinit.mjs 注入的
  // 全局调度器（window.__nxOnReinit）。它会覆盖
  // DOMContentLoaded / nav / popstate / DOM 变化 / 多轮延迟。
  //
  // 之前踩的坑：用 window.__ncInit 做一次性守卫，首页执行时
  // .nc-wrap 还不存在，守卫已置 true，之后从首页点进文章页
  // 评论区永远是空的。
  function boot(){
    var root = findRoot();
    if (!root) return;                 // 当前页没有评论区，安全返回
    if (root.dataset.ncLoaded === '1') return;   // 已经渲染过
    root.dataset.ncLoaded = '1';
    load();
  }

  if (window.__nxOnReinit) {
    window.__nxOnReinit(boot);
  } else {
    // 调度器还没注入（极早期），退回监听 nav
    boot();
    document.addEventListener('nav', function(){
      var r = findRoot();
      if (r) delete r.dataset.ncLoaded;
      boot();
    });
  }
})();
`

export function Comments() {
  const Root = () => h("div", { class: "nc-wrap", "data-nc": "1" })
  Root.css = CSS
  Root.afterDOMLoaded = RUNTIME
  return Root
}

export default Comments
