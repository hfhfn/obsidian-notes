# 定时自动发布
#
# 在 D:\private\obsidian-site 下注册一个 Windows 计划任务，按固定时间自动跑
# publish.ps1：同步笔记 → 推送 GitHub → CI 构建部署。
#
# 用法：
#   .\setup-schedule.ps1                    # 默认每天 23:30
#   .\setup-schedule.ps1 -Time 08:00        # 自定义时间
#   .\setup-schedule.ps1 -Time 08:00 -Daily # 每天（默认）
#   .\setup-schedule.ps1 -Remove            # 删除任务
#   .\setup-schedule.ps1 -RunNow            # 立即执行一次测试
#
# 注意：任务只在你登录 Windows 时运行（不需要保持某个窗口开着，但电脑要开机）。

param(
    [string]$Time = "23:30",
    [switch]$Remove,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$taskName = "ObsidianSiteAutoPublish"
# 本脚本在 scripts/ 下，仓库根是上一级
$site = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$script = Join-Path $site "scripts\publish.ps1"

if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "已删除计划任务：$taskName" -ForegroundColor Green
    } else {
        Write-Host "任务不存在：$taskName" -ForegroundColor Yellow
    }
    exit 0
}

if ($RunNow) {
    Write-Host "立即执行一次发布..." -ForegroundColor Cyan
    & $script
    exit $LASTEXITCODE
}

if (-not (Test-Path $script)) { throw "找不到 publish.ps1：$script" }

# 解析时间
try {
    $ts = [TimeSpan]::Parse($Time)
} catch {
    throw "时间格式无效：$Time（应为 HH:mm，例如 23:30）"
}
$at = (Get-Date).Date.Add($ts)

# 用 pwsh 或 powershell 执行，路径带引号以支持空格
$psExe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $psExe) { $psExe = (Get-Command powershell).Source }

$action = New-ScheduledTaskAction `
    -Execute $psExe `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $site

$trigger = New-ScheduledTaskTrigger -Daily -At $at

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

# 仅在用户登录时运行：不需要管理员密码，也不需要存凭据
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "自动把 Obsidian 笔记发布到 hfhfn-notes.pages.dev" | Out-Null

Write-Host ""
Write-Host "已注册计划任务 ✅" -ForegroundColor Green
Write-Host "  名称：$taskName"
Write-Host "  时间：每天 $($at.ToString('HH:mm'))"
Write-Host "  脚本：$script"
Write-Host ""
Write-Host "常用操作：" -ForegroundColor Cyan
Write-Host "  立即测试   .\setup-schedule.ps1 -RunNow"
Write-Host "  改时间     .\setup-schedule.ps1 -Time 08:00"
Write-Host "  查看状态   Get-ScheduledTask -TaskName $taskName"
Write-Host "  查看历史   Get-ScheduledTaskInfo -TaskName $taskName"
Write-Host "  删除任务   .\setup-schedule.ps1 -Remove"
Write-Host ""
Write-Host "提示：任务在登录状态下运行，电脑需开机；休眠时会在唤醒后补跑。" -ForegroundColor Yellow
