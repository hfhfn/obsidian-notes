# 一键发布：同步笔记 → 构建 → 推送 GitHub（CI 自动部署到 Cloudflare）
#
# 用法（在 D:\private\obsidian-site 下）：
#   .\publish.ps1                # 同步 + 构建 + 推送（CI 会部署）
#   .\publish.ps1 -LocalDeploy   # 同步 + 构建 + 直接部署（不推送）
#   .\publish.ps1 -DryRun        # 只看同步报告，不改文件
#   .\publish.ps1 -SkipDeploy    # 只同步 + 构建，本地预览
#
# 需要：Obsidian 笔记库路径见 scripts/sync_content.py 顶部的 VAULT。

param(
    [switch]$DryRun,
    [switch]$SkipDeploy,
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

Step 2 "构建站点"
npm run build
if ($LASTEXITCODE -ne 0) { throw "构建失败" }

if ($SkipDeploy) {
    Step 3 "跳过部署，本地预览：npm run preview"
    exit 0
}

if ($LocalDeploy) {
    Step 3 "直接部署到 Cloudflare Pages"
    npx wrangler pages deploy public --project-name hfhfn-notes --branch main
    if ($LASTEXITCODE -ne 0) { throw "部署失败" }
    Write-Host "`n完成 ✅  https://hfhfn-notes.pages.dev" -ForegroundColor Green
    exit 0
}

Step 3 "提交并推送到 GitHub（CI 自动部署）"
git add -A
$changed = git status --porcelain
if (-not $changed) {
    Write-Host "内容无变化，跳过提交" -ForegroundColor Yellow
    exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "publish: $stamp"
if ($LASTEXITCODE -ne 0) { throw "提交失败" }

git push
if ($LASTEXITCODE -ne 0) { throw "推送失败" }

Write-Host "`n已推送，GitHub Actions 正在构建部署" -ForegroundColor Green
Write-Host "进度：https://github.com/hfhfn/obsidian-notes/actions" -ForegroundColor Green
Write-Host "站点：https://hfhfn-notes.pages.dev" -ForegroundColor Green
