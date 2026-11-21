/**
 * GET /privacy → 隐私政策
 *
 * Google OAuth 发布应用时要求：
 *   1. 首页必须包含指向隐私政策的链接
 *   2. 隐私政策必须托管在首页同一域名下
 *   3. Cloud Console 里填的链接必须与首页上的链接完全一致
 *
 * 所以这个页面必须挂在 notes.hfhfn.dpdns.org 上，路径固定为 /privacy，
 * 且首页页脚要有指向 /privacy 的链接。
 */
import { SHELL, html } from "../my/_shared.js"

const UPDATED = "2026-11-22"

const body = `
<div class="wrap">
  <p class="crumb"><a href="/">← 返回首页</a></p>

  <h1>隐私政策</h1>
  <p class="meta">最后更新：${UPDATED}</p>

  <p>
    本站（<strong>HFH 的笔记</strong>，域名 <code>notes.hfhfn.dpdns.org</code>）是一个个人
    技术笔记站点。我尽量只收集让功能正常运转所必需的最少信息，并在这里把每一类都写清楚。
  </p>

  <h2>1. 收集哪些信息</h2>

  <h3>1.1 登录邮箱</h3>
  <p>
    当你选择登录以使用「收藏」「足迹」功能时，我会记录你的<strong>邮箱地址</strong>。
    获取方式有两种：
  </p>
  <ul>
    <li><strong>邮箱验证码</strong>：你主动填写邮箱，我向该地址发送一次性 6 位验证码。</li>
    <li><strong>Google / GitHub 登录</strong>：经你授权后，我只读取该账号的
        <strong>邮箱地址</strong>和（可选的）显示名称，不会读取联系人、文件、
        日历、仓库或任何其他数据，也不会获得代表你发帖、改文件的权限。</li>
  </ul>
  <p>邮箱仅用于识别你的身份，让你在换设备后仍能看到自己的收藏和足迹。</p>

  <h3>1.2 收藏与浏览足迹</h3>
  <p>
    登录后，你收藏的页面和浏览过的页面标题会与你的邮箱关联并存储，
    用于在「我的收藏」「浏览足迹」页面中展示。这些数据只有你自己登录后可见。
  </p>

  <h3>1.3 页面阅读量</h3>
  <p>
    每篇文章会记录一个<strong>累计阅读次数</strong>。这是聚合计数，
    不关联到具体个人，也不用于追踪你的浏览路径。
  </p>

  <h3>1.4 邮件订阅</h3>
  <p>
    如果你在首页填写邮箱订阅，我会保存该邮箱，用于在新笔记发布时通知你。
    每封订阅邮件都带退订链接，点击即从名单中移除。
  </p>

  <h2>2. 不收集什么</h2>
  <ul>
    <li>不收集你的真实姓名、电话、地址、身份证件等身份信息</li>
    <li>不收集精确地理位置</li>
    <li>不使用广告追踪、不接入第三方广告网络</li>
    <li>不把你的邮箱出售、出租或以任何形式提供给第三方做营销</li>
    <li>不读取你在 Google / GitHub 上的任何非邮箱数据</li>
  </ul>

  <h2>3. Cookie 与本地存储</h2>
  <p>本站使用极少量浏览器存储，都是功能性的：</p>
  <ul>
    <li><code>notes_session</code>：登录凭证，HttpOnly + Secure，
        有效期 30 天。用于识别你已登录，不含任何敏感信息，JavaScript 无法读取。</li>
    <li><code>localStorage</code>：仅保存你的主题偏好（如深色/浅色）和
        已访问节点，用于界面展示，不上传服务器。</li>
  </ul>
  <p>本站不使用第三方广告或跨站追踪 Cookie。</p>

  <h2>4. 第三方服务</h2>
  <p>为了让功能运转，少量数据会经过以下服务商：</p>
  <ul>
    <li><strong>Cloudflare</strong>（Pages / D1 / Workers）：站点托管、数据库与边缘计算。
        所有页面请求都会经过 Cloudflare 网络。</li>
    <li><strong>Brevo</strong>：发送登录验证码和订阅邮件。仅传递收件邮箱与邮件正文。</li>
    <li><strong>Google</strong>：仅当你选择「使用 Google 登录」时，用于验证你的身份并
        返回邮箱地址。</li>
    <li><strong>GitHub</strong>：仅当你选择「使用 GitHub 登录」时，用途同上。</li>
  </ul>
  <p>
    这些服务商各自有其隐私政策。我不会向它们提供超出上述用途所需的信息。
  </p>

  <h2>5. 数据保留与删除</h2>
  <p>
    登录邮箱、收藏与足迹会一直保留，直到你要求删除。你可以随时发邮件到
    <a href="mailto:me@hfhfn.dpdns.org">me@hfhfn.dpdns.org</a>
    要求删除你的全部数据，我会在 30 天内处理完毕。
  </p>
  <p>
    登录验证码在 10 分钟后失效、1 小时内自动清理，不会长期留存。
  </p>

  <h2>6. 数据安全</h2>
  <ul>
    <li>全站强制 HTTPS</li>
    <li>登录凭证使用 HMAC-SHA256 签名，密钥保存在服务端，不随页面下发</li>
    <li>验证码只存 SHA-256 哈希，数据库里看不到明文</li>
    <li>登录接口有频率限制（每邮箱每小时 5 次）</li>
  </ul>
  <p>但请理解：没有任何系统能保证绝对安全，本站也不承载敏感信息。</p>

  <h2>7. 未成年人</h2>
  <p>本站内容面向成年人。若你未满 14 周岁，请在监护人指导下使用。</p>

  <h2>8. 政策变更</h2>
  <p>
    若本政策有实质变更，我会更新本页顶部的「最后更新」日期。
    继续使用本站即视为接受更新后的政策。
  </p>

  <h2>9. 联系方式</h2>
  <p>
    任何隐私相关问题，可发邮件至
    <a href="mailto:me@hfhfn.dpdns.org">me@hfhfn.dpdns.org</a>。
  </p>

  <p class="foot"><a href="/">返回首页</a> · <a href="/terms">服务条款</a></p>
</div>
`

export async function onRequestGet() {
  return html(SHELL("隐私政策", body))
}
