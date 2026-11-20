# Obsidian 笔记发布站

把 `D:\private\obsidian` 笔记库中的指定目录，构建成可公开访问的静态网站（Quartz 5 + Cloudflare Pages）。

> ⚠️ 这个仓库**只包含可公开内容**。原始私有库（含 `private/` 密钥文件）不在本仓库，也永远不会被同步。

---

## 目录结构

```
obsidian-site/
├─ content/                  # ← 自动生成，勿手改（每次同步会重建）
├─ scripts/
│  ├─ sync_content.py        # 同步脚本：白名单复制 + 清洗 + WebP 转换
│  └─ preview_server.py      # 本地预览服务器（模拟 Cloudflare 的 URL 规则）
├─ quartz.config.yaml        # 站点配置（标题、语言、主题、插件）
├─ publish.ps1               # 一键：同步 → 构建 → 部署
└─ .github/workflows/        # 推送到 GitHub 后的自动部署
```

## 常用命令

```powershell
npm run sync:dry     # 只看报告：会发什么、多大、哪些链接坏了
npm run sync         # 同步笔记到 content/
npm run build        # 构建到 public/
npm run preview      # 本地预览 http://127.0.0.1:8080
npm run deploy       # 部署到 Cloudflare Pages
.\publish.ps1        # 一条命令走完：同步 + 构建 + 部署
```

## 发布范围

**会发布**：`AI`、`AI大模型`、`AIGC`、`CS(计科)`、`应用&工具笔记`、`文学&认知`、
`问题&资料收集`、`归档`、`Clippings`、`工作`，以及根目录 `README.md`（作为首页）。

**永不发布**：`private/`（密钥、密码）、`00_Inbox/`、`00_系统/`、`template/`、
`00_附件/HTML源码/`（源文件目录）、`.obsidian/`、`.claudian/`。

调整范围请改 `scripts/sync_content.py` 顶部的 `INCLUDE_DIRS`。

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
