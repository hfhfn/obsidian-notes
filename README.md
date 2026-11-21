# Obsidian 笔记发布站

把 `D:\private\obsidian` 笔记库构建成**两个站**（Quartz 5 + Cloudflare Pages）：

| 站点 | 地址 | 内容 | 访问控制 |
|---|---|---|---|
| 公开站 | `notes.hfhfn.dpdns.org` | 白名单目录（246 篇） | 任何人 |
| 私有站 | `private.hfhfn.dpdns.org` | 全部（291 篇） | Cloudflare Access |

> ⚠️ 这个仓库**只包含可公开内容**。原始私有库（含 `private/` 密钥文件）不在本仓库，也永远不会被同步。

---

## 目录结构

```
obsidian-site/
├─ content-all/              # ← 自动生成：完整内容（私有站）
├─ content-public/           # ← 自动生成：白名单子集（公开站）
├─ dist-all/                 # ← 构建产物：私有站，不入库
├─ dist-public/              # ← 构建产物：公开站，不入库
├─ scripts/
│  ├─ sync_content.py        # 同步脚本：白名单复制 + 清洗 + WebP 转换
│  ├─ make_public_subset.py  # 从 content 抽出可公开子集
│  ├─ inject_analytics.py    # 构建后注入 Cloudflare 统计信标
│  └─ preview_server.py      # 本地预览服务器（模拟 Cloudflare 的 URL 规则）
├─ quartz.config.yaml        # 站点配置（标题、语言、主题、插件）
├─ publish.ps1               # 一键：同步 → 推送（CI 构建并部署两站）
└─ .github/workflows/        # 推送到 GitHub 后的自动部署
```

## 常用命令

```powershell
.\publish.ps1         # 日常发布：同步 + 推送，CI 构建部署两站
.\publish.ps1 -Check  # 同步 + 本地构建两站校验，不推送
.\publish.ps1 -DryRun # 只看同步报告，不改文件
.\publish.ps1 -LocalDeploy  # 本地构建并直接部署两站

npm run sync          # 只同步笔记到 content-all/
npm run subset        # 只生成公开子集 content-public/
npm run build         # 构建完整站 → dist-all/
npm run build:public  # 构建公开站 → dist-public/
npm run preview       # 本地预览（默认预览完整站）
```

## 公开范围

编辑 `scripts/make_public_subset.py` 顶部的 `PUBLIC_DIRS`：

```python
PUBLIC_DIRS = ["AI", "AI大模型", "AIGC", "工作", "应用&工具笔记"]
```

未列出的目录只出现在私有站。指向私有笔记的链接会自动降级为纯文本，
避免标题泄漏进公开站的搜索索引。

## 定时自动发布

```powershell
.\setup-schedule.ps1              # 注册每天 23:30 的 Windows 计划任务
.\setup-schedule.ps1 -Time 08:00  # 改时间
.\setup-schedule.ps1 -RunNow      # 立即跑一次
.\setup-schedule.ps1 -Remove      # 取消
```

任务在登录状态下运行（电脑需开机），错过的时间开机后补跑。

## 自动发布

推送 `main` 分支即触发 `.github/workflows/deploy.yml`：构建 → 部署到 Cloudflare Pages。

需要的两个仓库 Secret（Settings → Secrets and variables → Actions）：

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare 面板 → My Profile → API Tokens → 用 **Edit Cloudflare Workers** 模板创建 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 首页右侧 Account ID：`20265cf496a87fcaafdaa97937089998` |
| `CF_ANALYTICS_TOKEN`（可选） | Web Analytics 信标 token；不填则跳过统计注入 |

未配置 `CLOUDFLARE_API_TOKEN` 时，CI 只构建不部署并给出一条 warning，不会报红。

## 域名与访问控制

### DNS

在 Cloudflare → DNS 加两条 CNAME，都开橙色云代理：

- `notes` → `hfhfn-notes.pages.dev`
- `private` → `hfhfn-notes-private.pages.dev`

> 根域 `hfhfn.dpdns.org` 已被 `substracker` Worker 占用，所以用子域。

### 访问控制

| 站点 | 保护方式 |
|---|---|
| 公开站 `notes.hfhfn.dpdns.org` | **无 Access**。全站匿名可读；收藏/足迹走自建登录（见下节） |
| 私有站 `private.hfhfn.dpdns.org` | **Cloudflare Access**，应用名 `Notes Owner`，策略 Include = 站主邮箱 |

> ⚠️ **公开站不要再挂 Access 应用**。早期用 `Notes Personal` 保护 `/api/*` 和 `/my/*`，
> 结果撞上 Zero Trust 免费版 50 席位上限，且 Access 策略配错时会**静默不发验证码**
> （页面照样显示"已发送"）。现已改为自建登录，`Notes Personal` 应用应删除。
> 若 Access 应用未删，`/api/*` 与 `/my/*` 会被 302 拦到 Access 登录页，自建登录无法生效。



## 同步时做了什么

| 处理 | 说明 |
|---|---|
| 图片 → WebP | 只转站点副本，原图不动；最长边 2400px、质量 85（PNG 88）；GIF/SVG 原样复制；转完更大就保留原图 |
| 双链改写 | `[[笔记]]` → 带完整路径 + 标题别名，保证站内可点 |
| 失效链接 | 指向未发布目录的链接降级为纯文本；断链计入报告 |
| Dataview | 13 处查询在同步时执行，写成静态表格（`-MOC` 文件不进列表） |
| 交互 HTML | 复制到 `attachments/html/`，正文变成"打开交互图"链接（`.htm` 后缀，避免 Quartz 去掉扩展名） |
| PDF | 只发布 ≤ 5MB 的；超限的改为提示框 |
| Canvas | `.canvas` 复制后由 Quartz 原生渲染 |
| Frontmatter | 保留 title/tags/aliases/description；去掉 `banner`、`cssclasses`、`null` 值 |
| 密钥打码 | GitHub token / `sk-` / AWS key / Bearer / `api_key=` 一律替换为 `***REDACTED***` 并写进报告 |
| 本地路径 | `file:///C:/Users/...` 之类的绝对路径降级为"（本地文件）" |

## 站点功能

首页导航 · 文件夹树 · 全文搜索（`/` 键） · 关系图谱 · 悬浮预览 · Canvas 交互渲染 ·
页内目录与「漫步笔记」标签页 · 明暗主题 · 中文界面 · RSS + 邮件订阅 · sitemap · 移动端适配。

自建插件（`quartz/plugins-local/`）：

| 插件 | 位置 | 功能 |
|---|---|---|
| `nx-actions` | 标题下方 | 收藏 / 点赞 / 分享 + 阅读数 |
| `nx-personal` | 左栏 | 收藏 / 足迹（独立页） / 4 套主题 |
| `nx-tabs` | 右栏 | 目录与漫步笔记合并为标签页 |
| `nx-subscribe` | 页尾 | 邮箱订阅表单（`/api/public/subscribe`） |

收藏和足迹是独立页面：`/my/bookmarks`、`/my/history`，由 Functions 服务端渲染。

## 互动数据（D1）

收藏、点赞、足迹、阅读数存在 Cloudflare D1，由 Pages Functions 提供接口。

| 动作 | 需登录 | 说明 |
|---|---|---|
| 阅读 / 阅读数 +1 | ❌ | 公开 |
| 点赞 / 取消赞 | ✅ | 按 Access 邮箱，可取消 |
| 收藏 | ✅ | 跨设备 |
| 足迹 | ✅ | 跨设备 |

```
functions/api/       Pages Functions（_auth / stats / bookmarks / history）
functions/api/public/  免登录接口（stats / subscribe）
db/schema.sql      建表脚本（唯一入库的数据库文件）
wrangler.jsonc     D1 绑定声明
```

页面路由（服务端渲染）：`/my/bookmarks`、`/my/history`、`/login`

## 登录（自建邮箱验证码）

公开站的收藏 / 足迹用**自建邮箱验证码登录**，不依赖 Cloudflare Access：

```
functions/api/auth/request-code.js   发 6 位验证码
functions/api/auth/verify-code.js    校验并下发会话 Cookie
functions/api/auth/logout.js         登出
functions/api/_session.js            HMAC-SHA256 自签会话
functions/api/_mail.js               发信（Brevo 优先，Resend 回退）
functions/login/index.js            /login 登录页
```

设计要点：

| 项 | 做法 |
|---|---|
| 会话 | HMAC-SHA256 签名的 `notes_session` Cookie，30 天，HttpOnly + Secure + SameSite=Lax |
| 验证码 | 只存 SHA-256 哈希；10 分钟过期；一码一用；最多试 5 次后作废 |
| 限流 | 每邮箱每小时 5 次；超限仍返回同样的成功文案 |
| 防枚举 | 无论邮箱是否存在、是否发信成功，响应完全一致 |
| 身份兼容 | `_auth.getUser` 先认自建会话，再认 Access JWT，私有站仍可交给 Access |

> 为什么不直接用 Access：Zero Trust Free 只有 **50 个席位**，每个登录过的人占一个，
> 公开站读者会很快撞墙；而且 Access 策略配错时会静默不发信，很难排查。

邮件订阅：`/api/public/subscribe` 把邮箱存入 D1；配了任一邮件后端就会发确认信。

在 Cloudflare 面板 → Workers & Pages → `hfhfn-notes` → Settings →
Environment variables 里加（Production 与 Preview 都要）：

| 变量 | 说明 |
|---|---|
| `BREVO_API_KEY` | brevo.com 的 API Key（**优先使用**，免费 300 封/天） |
| `RESEND_API_KEY` | resend.com 的 API Key（Brevo 不可用时的回退） |
| `SESSION_SECRET` | 会话签名密钥，随便一串长随机字符串（如 `openssl rand -base64 48`） |
| `SITE_ORIGIN` | `https://notes.hfhfn.dpdns.org` |
| `MAIL_FROM` | 发件邮箱，必须是已验证域名的地址，如 `noreply@hfhfn.dpdns.org` |
| `MAIL_FROM_NAME` | 发件人显示名，如 `HFH 的笔记` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 可选。Google OAuth 凭据，配了才显示「使用 Google 登录」 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 可选。GitHub OAuth 凭据，配了才显示「使用 GitHub 登录」 |

> ⚠️ **变量必须建成 Secret（加密）类型**，不要用 Plain text。
> `wrangler pages deploy`（Direct Upload）每次部署都会把 Plain text 变量清空，
> 只有 Secret 类型能保留。加完变量**必须重新部署一次**才生效。

### Google / GitHub 登录（可选）

除邮箱验证码外，还可以接第三方登录。两者都**免费、无用户数限制**，
同样不经过 Cloudflare Access。

**Google**（https://console.cloud.google.com/apis/credentials）

1. 创建项目 → 创建凭据 → OAuth 客户端 ID → 类型选「Web 应用」
2. 已获授权的重定向 URI：
   `https://notes.hfhfn.dpdns.org/api/auth/oauth/google/callback`
3. 拿到 Client ID / Secret 填进 Pages 环境变量

> 只请求 `openid email profile` 时**不需要 Google 审核**，可直接在
> 「OAuth 同意屏幕」点「发布应用」开放给所有用户。未发布时只有你手动
> 添加的测试账号（上限 100）能登录。

**GitHub**（https://github.com/settings/developers → New OAuth App）

1. Homepage URL：`https://notes.hfhfn.dpdns.org`
2. Authorization callback URL：
   `https://notes.hfhfn.dpdns.org/api/auth/oauth/github/callback`
3. 拿到 Client ID / Secret 填进 Pages 环境变量

**实现说明**：`functions/api/auth/_oauth.js` 统一处理授权跳转与回调；
state 用 HMAC 签名 Cookie 承载，回调时校验签名与 provider，不需要
服务端存 state 表。Google 会拒绝 `email_verified=false` 的地址，
GitHub 在 `/user` 无公开邮箱时回退查 `/user/emails` 取 primary+verified。
拿到邮箱后复用同一套 `signSession`，因此 `bookmarks` / `history`
（以 email 为主键）无需任何改动。

**关于微信登录**：微信开放平台的「网站应用」扫码登录要求
**企业/个体工商户主体 + 300 元/年认证费**，个人主体无法申请，故未实现。

> 注意：`/my/[page].js` 这类动态路由线上会 404，必须用 `my/bookmarks/index.js`
> 这样的静态目录。

数据库本体在 Cloudflare，不进仓库。改表结构后：

```powershell
npx wrangler d1 execute notes-db --remote --file=db/schema.sql
```

## 部署

### 方式一：本地手动（最快）

```powershell
npx wrangler login      # 只需一次
.\publish.ps1
```

### 方式二：GitHub Actions（推荐长期用）

1. 新建 GitHub 仓库，推上去：
   ```powershell
   git init; git add -A; git commit -m "init"; git remote add origin <repo>; git push -u origin main
   ```
2. Cloudflare Dashboard → My Profile → API Tokens → 创建模板 `Edit Cloudflare Workers`
   的 Token（权限含 `Cloudflare Pages: Edit`）。
3. 仓库 Settings → Secrets and variables → Actions，添加：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`（Cloudflare 首页右侧 Account ID）
4. 之后每次 `git push` 自动构建部署。

## 已知限制

- **Dataview 是快照**：站上的"最近更新"是发布那一刻的结果，重新发布才更新。
- **大 PDF 走 R2**：`>5MB` 的 PDF 不塞进 Pages（单文件上限 25MB），改传 Cloudflare R2，站内直接链接打开。未配置 R2 时降级为「暂未发布」提示。
- **LaTeX 警告**：少数笔记把中文写进了 `$...$`，KaTeX 会告警但不影响页面。
- **关系图谱只含已发布笔记**，`工作` 之外未发布的目录不出现。

---

## 运维踩坑记录

这些都是实际踩过、排查了很久才定位的问题，改配置前先读一遍。

### 1. `wrangler pages deploy` 会清空 Plain text 环境变量

**现象**：面板里配好的环境变量，本地部署一次后全部消失，接口报"未配置"。

**原因**：Direct Upload（`wrangler pages deploy`）会把项目的 `deployment_configs`
按当前 CLI 环境重写，**`plain_text` 类型的变量被清空，只有 `secret_text` 保留**。

**规则**：所有变量一律建成 **Secret（加密）类型**，即使 `MAIL_FROM` 这种非敏感值也一样。
用 API 写入时 `"type": "secret_text"`。

**副作用**：环境变量是**部署时快照**的。在面板加完变量，必须**重新部署一次**才生效。

### 2. CSS Cascade Layers：未分层样式永远赢

**现象**：同一页面三个按钮，两个 12px、一个 16px。无痕模式正常，硬刷新无效。

**原因**：Quartz 把组件样式打包进 `@layer quartz-base { ... }`。CSS 规范规定
**未分层（unlayered）样式优先于任何 `@layer` 内的样式，与选择器特异性无关**。
浏览器扩展注入一条普通 `button { font-size: 16px }` 就能压掉 `.pb-btn` 的字号。
因为「收藏/足迹」是 `<a>`、「主题」是 `<button>`，只有后者被命中 → 一大两小。

**规则**：本地插件里凡是必须固定的关键属性（字号、尺寸），加 `!important`。
已应用于 `.pb-btn` 和 `.pb-btn span`。

### 3. Access 策略配错时静默不发验证码

**现象**：登录页显示"验证码已发送"，邮箱永远收不到，也没有任何报错。

**原因**：Cloudflare Access 只给**策略允许的邮箱**发 OTP。策略不匹配时按设计
静默丢弃，但页面文案不变。典型错误：Include 选择器选「电子邮件」却填了字符串
`Everyone`（不是合法邮箱）→ 零匹配。

**规则**：这是放弃 Access、改自建登录的主因之一。若仍要用 Access，
「所有人」必须用 `Include: Everyone` 选择器，不能用「电子邮件」手填。

### 4. `rem` 字号会被浏览器字体设置放大

**现象**：用户反馈"字比无痕模式大"，但 CSS 里写的是固定 `rem`。

**原因**：`rem` 基于 `html` 根字号，用户把 Chrome 字体调大后根字号变化，
所有 `rem` 等比放大。无痕模式用默认设置所以正常。

**规则**：诊断时先查 `getComputedStyle(document.documentElement).fontSize`
是否为 `16px`。若不是，说明是浏览器设置，不是站点 bug。

### 5. HTML 附件标签不闭合会让 `npm run check` 失败

**现象**：`npm run check` 退出码 2，报
`SyntaxError: Unexpected closing tag "div"`。

**原因**：`content-*/attachments/html/*.htm` 来自笔记里的交互式 HTML，
Prettier 会解析它们。一个多余的 `</div>` 就报错。

**规则**：修**源文件**（`D:\private\obsidian` 里的 `.html`），不要改 `content-*`
里的副本——下次 `sync_content.py` 会覆盖。定位方法：

```python
# 用栈逐行跟踪 div 开闭，栈空时遇到 </div> 就是多余的
```

### 6. `/my/[page].js` 动态路由线上 404

静态目录 `my/bookmarks/index.js` 正常，`[param].js` 形式本地能跑但线上 404。
新增服务端页面一律用显式目录。

### 7. `npm test` 的 2 个 gitLoader 失败是环境问题

`gitLoader.peers.test.ts` 的两个测试会真跑 `npm install`，与全局 `~/.npmrc` 里的
`allow-scripts` 配置冲突（npm 12 起不允许在 project-scoped install 里使用）。
换台机器或 npm 10/11 就会通过，**与站点代码无关**，不用修。

---

## 大 PDF 发布（Cloudflare R2）

Pages 单文件上限 25MB，且带宽计入 100GB/月。vault 里 16 个 PDF 合计 299MB，
最大的 77MB，直接发布既超限又吃带宽。改用 R2。

### 当前配置（已完成）

| 项目 | 值 |
|---|---|
| 桶 | `obsidian-pdf` |
| 公开域名 | `https://pdf.hfhfn.dpdns.org` |
| 凭据位置 | `obsidian-site/.env`（已 gitignore） |
| 已上传 | 16 个 PDF / 299MB |

### 日常使用

```powershell
python scripts/upload_pdfs.py --dry-run   # 看会传哪些
python scripts/upload_pdfs.py             # 上传 + 重新生成 pdf_manifest.json
python scripts/sync_content.py            # 同步时自动把大 PDF 换成 R2 链接
```

`pdf_manifest.json`（文件名 → R2 公网 URL）**会提交进仓库**——它只有 URL 没有凭据，
这样 GitHub Actions 构建时也能拿到链接。

### 关键坑：URL 必须百分号编码

R2 公开域名**不做自动解码**。对象键含中文、空格、括号时，未编码的 URL 返回 **400**。
`write_manifest` 里逐段 `urllib.parse.quote(seg, safe="")` 再拼接，
保留 `/` 作路径分隔符。改了编码逻辑后务必抽查一个中文文件名的 URL。

### 若要换桶或域名

1. 改 `.env` 里的 `R2_BUCKET` / `R2_PUBLIC_BASE`
2. 重跑 `python scripts/upload_pdfs.py`

### 若 Token 权限不足

`wrangler login` 拿到的 OAuth token **没有 R2 权限**（403），必须单独建
API Token，权限选 `Account > Workers R2 Storage > Edit`。
另外只给「Object Read & Write」的 Token **不能列桶**（`ListBuckets` 会 AccessDenied），
这是正常的——直接按已知桶名操作即可。
