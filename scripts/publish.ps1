# 一键发布：同步笔记 → 推送 GitHub（CI 自动构建并部署到 Cloudflare）
#
# 用法（在 D:\private\obsidian-site 下）：
#   .\publish.ps1                # 同步 + 推送，CI 构建部署（日常用这个）
#   .\publish.ps1 -Check         # 同步 + 本地构建校验，但不推送（发布前自检）
#   .\publish.ps1 -DryRun        # 只看同步报告，不改任何文件
#   .\publish.ps1 -LocalDeploy   # 同步 + 本地构建 + 直接部署（CI 不可用时兜底）
#
# 日常发布不需要本地构建：构建由 GitHub Actions 完成，本脚本只负责
# 把笔记同步成可公开副本并推上去。

param(
    [switch]$DryRun,
    [switch]$Check,
    [switch]$LocalDeploy
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

# 本脚本在 scripts/ 下，仓库根是上一级
# （2026-11 从根目录移进 scripts/，所以要多退一层）
$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $site

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }

Step 1 "同步 Obsidian 笔记到 content/"
if ($DryRun) {
    python scripts/sync_content.py --dry-run
    exit 0
}
python scripts/sync_content.py
if ($LASTEXITCODE -ne 0) { throw "同步失败" }

# -Check 与 -LocalDeploy 才需要本地构建；日常发布交给 CI。
if ($Check) {
    Step 2 "本地构建校验（公开站 + 完整站）"
    npm run build:public
    if ($LASTEXITCODE -ne 0) { throw "公开站构建失败" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "完整站构建失败" }
    Step 3 "仅校验，不推送。本地预览：npm run preview"
    exit 0
}

if ($LocalDeploy) {
    Step 2 "构建公开站"
    npm run build:public
    if ($LASTEXITCODE -ne 0) { throw "公开站构建失败" }

    Step 3 "构建完整站"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "完整站构建失败" }

    Step 4 "部署公开站"
    npx wrangler pages deploy dist-public --project-name hfhfn-notes --branch main
    if ($LASTEXITCODE -ne 0) { throw "公开站部署失败" }

    Step 5 "部署完整站（需 Cloudflare Access 保护）"
    npx wrangler pages deploy dist-all --project-name hfhfn-notes-private --branch main
    if ($LASTEXITCODE -ne 0) { throw "完整站部署失败" }

    Write-Host "`n完成 ✅" -ForegroundColor Green
    Write-Host "  公开站：https://notes.hfhfn.dpdns.org" -ForegroundColor Green
    Write-Host "  私有站：https://private.hfhfn.dpdns.org（需登录）" -ForegroundColor Green
    exit 0
}

Step 2 "提交并推送到 GitHub"
# 不要用 git add -A：它会把根目录一切照单全收。
# 2026-11-22 那次自动发布就是这样把三个 nul 文件（误重定向产物，
# 共 19MB）和 8 个迁移备份 JSON 提交进仓库的。
# 只加明确需要发布的路径。
git add content-all/ content-public/ modules/ scripts/ quartz/ functions/ db/ \
        quartz.config.yaml package.json package-lock.json README.md \
        requirements.txt wrangler.jsonc .gitignore 2>$null

$changed = git status --porcelain
if (-not $changed) {
    Write-Host "内容无变化，无需发布" -ForegroundColor Yellow
    exit 0
}

# 提交前检查：有没有不该进仓库的垃圾
$junk = git diff --cached --name-only | Select-String -Pattern '^(nul|backup-.*\.json|qa-.*\.png)$'
if ($junk) {
    Write-Host "检测到可疑文件，已中止：" -ForegroundColor Red
    $junk | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    git reset
    throw "提交内容含垃圾文件"
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "publish: $stamp"
if ($LASTEXITCODE -ne 0) { throw "提交失败" }

git push
if ($LASTEXITCODE -ne 0) { throw "推送失败" }

Write-Host "`n已推送，GitHub Actions 正在构建部署（约 2 分钟）" -ForegroundColor Green
Write-Host "进度：https://github.com/hfhfn/obsidian-site/actions" -ForegroundColor Green
Write-Host "站点：https://hfhfn-notes.pages.dev" -ForegroundColor Green
