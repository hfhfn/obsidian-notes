/**
 * GET /terms → 服务条款
 */
import { SHELL, html } from "../my/_shared.js"

const UPDATED = "2026-11-22"

const body = `
<div class="wrap">
  <p class="crumb"><a href="/">← 返回首页</a></p>

  <h1>服务条款</h1>
  <p class="meta">最后更新：${UPDATED}</p>

  <p>
    欢迎访问 <strong>HFH 的笔记</strong>（<code>notes.hfhfn.dpdns.org</code>）。
    访问或使用本站即表示你同意以下条款。若不同意，请停止使用。
  </p>

  <h2>1. 站点性质</h2>
  <p>
    本站是个人技术笔记的公开镜像，内容由我本人撰写整理，使用 Quartz 静态生成，
    托管在 Cloudflare Pages 上。除「收藏」「足迹」「邮件订阅」需要登录或填写邮箱外，
    所有内容均可匿名免费阅读。
  </p>

  <h2>2. 内容使用</h2>
  <ul>
    <li>你可以自由阅读、引用、分享本站内容，转载时请注明来源链接。</li>
    <li>不得将本站内容整体抓取后用于商业再发布。</li>
    <li>文中代码片段可自由用于你的项目，但请自行承担使用风险。</li>
  </ul>

  <h2>3. 账号与登录</h2>
  <ul>
    <li>登录仅用于「收藏」和「浏览足迹」，不提供评论、发帖等社交功能。</li>
    <li>请使用你本人有权使用的邮箱登录，不要冒用他人身份。</li>
    <li>登录会话有效期为 30 天，你可以随时通过登出立即失效。</li>
  </ul>

  <h2>4. 免责声明</h2>
  <p>
    本站内容按「现状」提供，不附带任何明示或暗示的保证。技术笔记可能包含过时信息或错误，
    请独立验证后再用于生产环境。因参考本站内容导致的任何直接或间接损失，我不承担责任。
  </p>

  <h2>5. 服务可用性</h2>
  <p>
    本站为个人项目，不承诺 100% 可用性。我可能在不预先通知的情况下调整内容、
    修改功能或暂停服务。
  </p>

  <h2>6. 条款变更</h2>
  <p>
    条款若有更新，会修改本页顶部的「最后更新」日期。继续使用即视为接受新条款。
  </p>

  <h2>7. 联系方式</h2>
  <p>
    相关疑问可发邮件至
    <a href="mailto:me@hfhfn.dpdns.org">me@hfhfn.dpdns.org</a>。
  </p>

  <p class="foot"><a href="/">返回首页</a> · <a href="/privacy">隐私政策</a></p>
</div>
`

export async function onRequestGet() {
  return html(SHELL("服务条款", body))
}
