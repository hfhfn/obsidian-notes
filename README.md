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
├─ content/                  # ← 自动生成，勿手改（每次同步会重建）
├─ content-public/           # ← 自动生成，公开站用的白名单子集
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

npm run sync          # 只同步笔记到 content/
npm run subset        # 只生成公开子集 content-public/
npm run build         # 构建完整站 → public/
npm run build:public  # 构建公开站 → public-public/
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

首页导航 · 文件夹树 · 全文搜索（`/` 键） · 关系图谱 · 反向链接 · 悬浮预览 ·
页内目录 · 明暗主题 · 中文界面 · RSS · sitemap · Canvas 交互渲染 · 移动端适配。

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
