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

$site = Split-Path -Parent $MyInvocation.MyCommand.Path
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
if ($Check -or $LocalDeploy) {
    Step 2 "本地构建校验"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "构建失败" }
}

if ($Check) {
    Step 3 "仅校验，不推送。本地预览：npm run preview"
    exit 0
}

if ($LocalDeploy) {
    Step 3 "直接部署到 Cloudflare Pages"
    npx wrangler pages deploy public --project-name hfhfn-notes --branch main
    if ($LASTEXITCODE -ne 0) { throw "部署失败" }
    Write-Host "`n完成 ✅  https://hfhfn-notes.pages.dev" -ForegroundColor Green
    exit 0
}

Step 2 "提交并推送到 GitHub"
git add -A
$changed = git status --porcelain
if (-not $changed) {
    Write-Host "内容无变化，无需发布" -ForegroundColor Yellow
    exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "publish: $stamp"
if ($LASTEXITCODE -ne 0) { throw "提交失败" }

git push
if ($LASTEXITCODE -ne 0) { throw "推送失败" }

Write-Host "`n已推送，GitHub Actions 正在构建部署（约 2 分钟）" -ForegroundColor Green
Write-Host "进度：https://github.com/hfhfn/obsidian-notes/actions" -ForegroundColor Green
Write-Host "站点：https://hfhfn-notes.pages.dev" -ForegroundColor Green
