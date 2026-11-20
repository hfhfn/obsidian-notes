# 一键发布：同步笔记 → 构建 → 部署到 Cloudflare Pages
# 用法：在 D:\private\obsidian-site 下执行
#   .\publish.ps1              # 同步 + 构建 + 部署
#   .\publish.ps1 -DryRun      # 只看同步报告，不改文件
#   .\publish.ps1 -SkipDeploy  # 只同步 + 构建，本地预览

param(
    [switch]$DryRun,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
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
npx quartz build
if ($LASTEXITCODE -ne 0) { throw "构建失败" }

if ($SkipDeploy) {
    Step 3 "跳过部署，本地预览：npm run preview"
    exit 0
}

Step 3 "部署到 Cloudflare Pages"
npx wrangler pages deploy public --project-name hfhfn-notes --branch main
if ($LASTEXITCODE -ne 0) { throw "部署失败" }

Write-Host "`n完成 ✅  站点：https://hfhfn-notes.pages.dev" -ForegroundColor Green
