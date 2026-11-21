/**
 * GET /login?redirect=/my/bookmarks  → 邮箱验证码登录页
 *
 * 两步式单页：
 *   1. 输邮箱 → POST /api/auth/request-code
 *   2. 输 6 位码 → POST /api/auth/verify-code → 成功后跳转
 *
 * 纯手写，不引入前端框架，保持和其他 /my/* 页面一致的体量。
 */
import { SHELL, html, esc } from "../my/_shared.js"

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const redirect = safeRedirect(url.searchParams.get("redirect"))
  const siteName = env?.MAIL_FROM_NAME || "HFH 的笔记"

  const body = `
<h1>登录</h1>
<p class="sub">输入邮箱，我们会发一个 6 位验证码给你。无需密码、无需注册。</p>

<form id="step1" class="auth-form">
  <label for="email">邮箱</label>
  <input id="email" type="email" name="email" required
         placeholder="you@example.com" autocomplete="email"
         autocapitalize="none" spellcheck="false">
  <button class="btn primary" type="submit" id="sendBtn">发送验证码</button>
</form>

<form id="step2" class="auth-form" hidden>
  <label for="code">验证码</label>
  <input id="code" type="text" name="code" required inputmode="numeric"
         pattern="[0-9]{6}" maxlength="6" placeholder="000000"
         autocomplete="one-time-code"
         style="letter-spacing:.3em;font-family:ui-monospace,Menlo,monospace;font-size:1.3rem">
  <p class="hint" id="sentHint"></p>
  <button class="btn primary" type="submit" id="verifyBtn">登录</button>
  <div class="row">
    <button class="btn link" type="button" id="resendBtn">重新发送</button>
    <button class="btn link" type="button" id="backBtn">换个邮箱</button>
  </div>
</form>

<p class="msg" id="msg" role="status" aria-live="polite"></p>

<p class="foot">
  登录后即可收藏笔记、查看浏览足迹。我们只用你的邮箱区分身份，不发任何推广邮件。
</p>

<style>
  .auth-form { display:flex; flex-direction:column; gap:.55rem; margin:0 0 1.2rem; }
  .auth-form[hidden] { display:none; }
  .auth-form label { font-size:.82rem; color:var(--gray); }
  .auth-form input {
    padding:.62rem .75rem; border:1px solid var(--lightgray); border-radius:9px;
    background:transparent; color:var(--darkgray); font-size:.95rem;
    font-family:var(--bodyFont); outline:none; transition:.15s;
  }
  .auth-form input:focus { border-color:var(--secondary); box-shadow:0 0 0 3px var(--highlight); }
  .btn.primary {
    margin-top:.35rem; padding:.6rem 1rem; border-radius:9px;
    border:1px solid var(--secondary); background:var(--secondary);
    color:#fff; font-size:.92rem; cursor:pointer; font-family:var(--bodyFont);
    transition:.15s;
  }
  .btn.primary:hover:not(:disabled) { filter:brightness(1.08); }
  .btn.primary:disabled { opacity:.55; cursor:default; }
  .btn.link {
    background:none; border:none; padding:.2rem 0; color:var(--secondary);
    font-size:.84rem; cursor:pointer; font-family:var(--bodyFont);
  }
  .btn.link:hover { text-decoration:underline; }
  .row { display:flex; gap:1.1rem; margin-top:.2rem; }
  .hint { font-size:.8rem; color:var(--gray); margin:0; }
  .msg { font-size:.87rem; min-height:1.4em; margin:.4rem 0 1.4rem; }
  .msg.err { color:#c0392b; }
  .msg.ok { color:var(--tertiary); }
  .foot { font-size:.8rem; color:var(--gray); border-top:1px solid var(--lightgray); padding-top:1rem; }
</style>

<script>
(function () {
  var REDIRECT = ${JSON.stringify(redirect)};
  var step1 = document.getElementById("step1");
  var step2 = document.getElementById("step2");
  var emailEl = document.getElementById("email");
  var codeEl = document.getElementById("code");
  var msg = document.getElementById("msg");
  var sentHint = document.getElementById("sentHint");
  var sendBtn = document.getElementById("sendBtn");
  var verifyBtn = document.getElementById("verifyBtn");
  var currentEmail = "";

  function say(text, kind) {
    msg.textContent = text || "";
    msg.className = "msg" + (kind ? " " + kind : "");
  }

  async function post(url, data) {
    var r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data)
    });
    var j = {};
    try { j = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, body: j };
  }

  async function requestCode(email) {
    sendBtn.disabled = true;
    sendBtn.textContent = "发送中…";
    say("");
    try {
      var res = await post("/api/auth/request-code", { email: email });
      if (!res.ok) {
        say(res.body.message || "发送失败，请稍后再试", "err");
        return false;
      }
      currentEmail = email;
      sentHint.textContent = "验证码已发往 " + email + "，10 分钟内有效。没收到就看看垃圾邮件。";
      step1.hidden = true;
      step2.hidden = false;
      codeEl.value = "";
      codeEl.focus();
      say("如果这个邮箱可以登录，验证码已发出。", "ok");
      return true;
    } catch (e) {
      say("网络异常，请检查连接后重试", "err");
      return false;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "发送验证码";
    }
  }

  step1.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = emailEl.value.trim();
    if (!email) { say("请填写邮箱", "err"); return; }
    requestCode(email);
  });

  step2.addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = codeEl.value.trim();
    if (!/^[0-9]{6}$/.test(code)) { say("请输入 6 位数字验证码", "err"); return; }
    verifyBtn.disabled = true;
    verifyBtn.textContent = "验证中…";
    say("");
    try {
      var res = await post("/api/auth/verify-code", { email: currentEmail, code: code });
      if (res.ok) {
        say("登录成功，正在跳转…", "ok");
        location.href = REDIRECT;
        return;
      }
      say(res.body.message || "验证失败", "err");
      codeEl.select();
    } catch (e) {
      say("网络异常，请重试", "err");
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "登录";
    }
  });

  document.getElementById("resendBtn").addEventListener("click", function () {
    if (currentEmail) requestCode(currentEmail);
  });

  document.getElementById("backBtn").addEventListener("click", function () {
    step2.hidden = true;
    step1.hidden = false;
    say("");
    emailEl.focus();
  });

  emailEl.focus();
})();
</script>`

  return html(SHELL("登录", body))
}

/** 只允许站内相对路径，防止开放重定向 */
function safeRedirect(raw) {
  const fallback = "/my/bookmarks"
  if (!raw) return fallback
  const s = String(raw)
  if (!s.startsWith("/") || s.startsWith("//")) return fallback
  return s
}
