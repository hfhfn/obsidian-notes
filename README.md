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

两个子域需要手动在 Cloudflare 面板配置（API 凭据没有 DNS / Zero Trust 权限）：

1. **DNS** → 加两条 CNAME，都开橙色云代理：
   - `notes` → `hfhfn-notes.pages.dev`
   - `private` → `hfhfn-notes-private.pages.dev`
2. **Zero Trust → Access → Applications** → 建 Self-hosted 应用，
   域名 `private.hfhfn.dpdns.org`，策略 Include = 你的邮箱。

> 根域 `hfhfn.dpdns.org` 已被 `substracker` Worker 占用，所以用子域。



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

> ⚠️ **变量必须建成 Secret（加密）类型**，不要用 Plain text。
> `wrangler pages deploy`（Direct Upload）每次部署都会把 Plain text 变量清空，
> 只有 Secret 类型能保留。加完变量**必须重新部署一次**才生效。

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
- **大 PDF 不发布**：`>5MB` 的 PDF 只在本地可见（当前 11 个，含 77MB 的 StatQuest）。
- **LaTeX 警告**：少数笔记把中文写进了 `$...$`，KaTeX 会告警但不影响页面。
- **关系图谱只含已发布笔记**，`工作` 之外未发布的目录不出现。
