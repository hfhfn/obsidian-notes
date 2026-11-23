/**
 * GET /bind-email?need=bind&provider=github&puid=...&name=...
 *
 * GitHub 没返回真实邮箱时的绑定页。
 *
 * 为什么需要这一页：
 *   GitHub 账号可以完全不公开邮箱（或只返回 noreply 地址）。
 *   如果拿 noreply 直接建号，用户就有了一个「影子账号」——
 *   永远收不到信、也没法和 Gmail 账号归并，换个登录方式就是另一个人。
 *   所以这里拦一下，要求绑一个真实邮箱再继续。
 *
 * 流程：
 *   1. 输邮箱 → POST /api/auth/request-code（复用登录的验证码）
 *   2. 输 6 位码 → POST /api/auth/bind-email（带上 provider + puid）
 *   3. 成功后该邮箱并入当前账号，签发会话，跳首页
 */
import { SHELL, html, esc } from "../my/_shared.js"

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const provider = String(url.searchParams.get("provider") || "github")
  const puid = String(url.searchParams.get("puid") || "")
  const name = String(url.searchParams.get("name") || "")

  const providerLabel = provider === "github" ? "GitHub" : provider === "google" ? "Google" : provider

  const body = `
<h1>绑定邮箱</h1>
<p class="sub">
  你的 ${esc(providerLabel)} 账号没有返回可用的邮箱地址。
  为了让你以后用任意方式登录都能看到同一份数据，请绑定一个真实邮箱。
</p>

${name ? `<p class="bind-who">当前身份：<strong>${esc(name)}</strong></p>` : ""}

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
         pattern="[0-9]{6}" maxlength="6" placeholder="6 位数字"
         autocomplete="one-time-code">
  <button class="btn primary" type="submit" id="bindBtn">绑定并继续</button>
  <button class="btn" type="button" id="backBtn">换个邮箱</button>
</form>

<p id="msg" class="msg" role="status"></p>

<details class="why">
  <summary>为什么要绑邮箱？</summary>
  <p>
    站点用邮箱作为账号的唯一标识。${esc(providerLabel)} 只给了我们一个
    不能收信的内部地址，如果直接用它建账号，你以后用别的邮箱登录时
    会被当成另一个人，收藏和足迹都不共通。
  </p>
  <p>
    绑定之后，这个邮箱和你的 ${esc(providerLabel)} 账号就是同一个账号，
    两种方式登录看到的内容完全一致。
  </p>
</details>

<script>
(function(){
  var PROVIDER = ${JSON.stringify(provider)};
  var PUID = ${JSON.stringify(puid)};

  var step1 = document.getElementById('step1');
  var step2 = document.getElementById('step2');
  var emailEl = document.getElementById('email');
  var codeEl = document.getElementById('code');
  var msg = document.getElementById('msg');
  var sendBtn = document.getElementById('sendBtn');
  var bindBtn = document.getElementById('bindBtn');

  function say(text, kind){
    msg.textContent = text || '';
    msg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function post(url, data){
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data || {})
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        return { ok: r.ok && j.ok !== false, status: r.status, data: j };
      });
    });
  }

  step1.addEventListener('submit', function(e){
    e.preventDefault();
    var email = (emailEl.value || '').trim().toLowerCase();
    if (!email) return;
    sendBtn.disabled = true;
    say('发送中…');
    post('/api/auth/request-code', { email: email }).then(function(res){
      sendBtn.disabled = false;
      if (!res.ok) {
        say(res.data.message || '发送失败，请稍后重试', 'bad');
        return;
      }
      step1.hidden = true;
      step2.hidden = false;
      codeEl.focus();
      say('验证码已发送到 ' + email + '，请查看邮箱', 'good');
    }).catch(function(){
      sendBtn.disabled = false;
      say('网络异常，请稍后重试', 'bad');
    });
  });

  step2.addEventListener('submit', function(e){
    e.preventDefault();
    var email = (emailEl.value || '').trim().toLowerCase();
    var code = (codeEl.value || '').trim();
    if (!/^\\d{6}$/.test(code)) { say('请输入 6 位数字验证码', 'bad'); return; }
    bindBtn.disabled = true;
    say('绑定中…');
    post('/api/auth/bind-email', {
      email: email, code: code, provider: PROVIDER, providerUid: PUID
    }).then(function(res){
      bindBtn.disabled = false;
      if (!res.ok) {
        say(res.data.message || '绑定失败，请稍后重试', 'bad');
        return;
      }
      say('绑定成功，正在跳转…', 'good');
      location.href = '/my/bookmarks';
    }).catch(function(){
      bindBtn.disabled = false;
      say('网络异常，请稍后重试', 'bad');
    });
  });

  document.getElementById('backBtn').addEventListener('click', function(){
    step2.hidden = true;
    step1.hidden = false;
    codeEl.value = '';
    say('');
    emailEl.focus();
  });
})();
</script>
`

  return html(SHELL("绑定邮箱", body))
}
