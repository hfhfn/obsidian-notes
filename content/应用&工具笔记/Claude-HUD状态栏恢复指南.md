---
title: Claude HUD 自定义状态栏：安装、恢复与排错指南
tags:
- Claude Code
- 状态栏
- 排错
status: 已消化
created: '2026-08-28T12:48:34+08:00'
modified: '2026-08-28T12:48:34+08:00'
---

# Claude HUD 自定义状态栏：安装、恢复与排错指南

> 本文记录本机 Claude Code 的 Claude HUD 状态栏配置。适用于 Windows 11 + Git Bash/MSYS 风格的 Claude Code 命令环境。
>
> **核心结论**：Claude HUD 的显示配置和 Claude Code 的 `statusLine` 启动配置是两件事；两者任一缺失，HUD 都不会显示。

---

## 1. 当前已确认的配置组成

### 1.1 Claude Code 的状态栏启动入口（最重要）

**文件**：`C:\Users\hfhfn\.claude\settings.json`

Claude Code 只会从该全局配置中的 `statusLine` 字段启动自定义状态栏。当前应保留以下对象：
```json
"statusLine": {
  "command": "cols=${COLUMNS:-}; case \"$cols\" in \"\"|*[!0-9]*) cols=$(stty size </dev/tty 2>/dev/null | awk '{print $2}');; esac; case \"$cols\" in \"\"|*[!0-9]*) cols=120;; esac; export COLUMNS=$(( cols > 4 ? cols - 4 : 1 )); plugin_dir=$(ls -1d \"${CLAUDE_CONFIG_DIR:-$HOME/.claude}\"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1); exec \"C:/nvm4w/nodejs/node.exe\" \"${plugin_dir}dist/index.js\"",
  "type": "command"
}
```

说明：

- 这是 **Windows + Git Bash/MSYS** 对应的命令格式，不是 PowerShell 格式。
- `C:/nvm4w/nodejs/node.exe` 是当前本机可用的 Node.js 运行时。
- 命令会从插件缓存中自动找出最新版本的 `claude-hud`，因此插件升级后通常不需手工改版本号。
- `COLUMNS` 处理用于让 HUD 获得正确的终端宽度并预留 Claude Code 输入区域的边距。

### 1.2 HUD 的显示偏好

**文件**：`C:\Users\hfhfn\.claude\plugins\claude-hud\config.json`

该文件控制 HUD **显示什么、怎样显示**，但不能启动 HUD。当前配置摘要：

- 布局：`compact`
- 分隔线：开启
- 标签语言：英文（`en`）
- Git 状态：开启；显示未提交修改；不显示 ahead/behind 与文件统计
- 已开启的显示项：模型、上下文条、工具、Skills、MCP、Agent、Todo、项目路径、额外目录、配置计数、Token 明细、速度、费用、用量、会话名、会话时长、会话 Token、最后响应时间、压缩次数、推理强度、输出风格、内存、Prompt Cache、Claude Code 版本、Advisor。

当前完整配置备份如下，可在配置丢失时覆盖回 `config.json`：
```json
{
  "lineLayout": "compact",
  "showSeparators": true,
  "language": "en",
  "display": {
    "showModel": true,
    "showContextBar": true,
    "showTools": true,
    "showSkills": true,
    "showMcp": true,
    "showAgents": true,
    "showTodos": true,
    "showProject": true,
    "showAddedDirs": true,
    "showConfigCounts": true,
    "showTokenBreakdown": true,
    "showSpeed": true,
    "showCost": true,
    "showUsage": true,
    "usageBarEnabled": true,
    "usageCompact": false,
    "showResetLabel": true,
    "showSessionName": true,
    "showDuration": true,
    "showSessionTokens": true,
    "showLastResponseAt": true,
    "showCompactions": true,
    "showEffortLevel": true,
    "showOutputStyle": true,
    "showMemoryUsage": true,
    "showPromptCache": true,
    "showClaudeCodeVersion": true,
    "showAdvisor": true
  },
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": false,
    "showFileStats": false
  }
}
```

### 1.3 插件、市场与运行文件

| 用途 | 当前路径 / 值 | 说明 |
|---|---|---|
| 已安装插件注册表 | `C:\Users\hfhfn\.claude\plugins\installed_plugins.json` | 注册 `claude-hud@claude-hud`，当前版本 `0.2.1`。 |
| 市场注册表 | `C:\Users\hfhfn\.claude\plugins\known_marketplaces.json` | 市场来源为 `jarrodwatts/claude-hud`。 |
| 插件缓存（实际运行文件） | `C:\Users\hfhfn\.claude\plugins\cache\claude-hud\claude-hud\0.2.1` | 插件的当前安装位置。升级后版本目录可能变化。 |
| HUD 程序入口 | `...\0.2.1\dist\index.js` | `statusLine.command` 最终启动的 Node.js 文件。 |
| 插件命令 | `...\0.2.1\commands\setup.md`、`configure.md` | 分别对应 `/claude-hud:setup` 与 `/claude-hud:configure`。 |
| Node.js | `C:\nvm4w\nodejs\node.exe` | Windows Git Bash 配置中所用运行时。 |
| 插件项目主页 | <https://github.com/jarrodwatts/claude-hud> | 官方源码、更新和问题排查。 |

### 1.4 不需要备份的缓存
`C:\Users\hfhfn\.claude\plugins\claude-hud\transcript-cache\`、`speed-cache\`、`config-cache\` 是运行缓存；删掉后 HUD 会重新生成。它们不属于个性化配置，也不需要作为恢复材料保存。

---

## 2. cc-switch：覆盖原因与已验证的持久方案

### 2.1 为什么曾经丢失

cc-switch 会生成同一个 Claude Code 全局文件：
`C:\Users\hfhfn\.claude\settings.json`

Provider 的 `env`（Base URL、认证 Token、模型映射）和 cc-switch 的 Claude 通用配置会被合并后写入该文件。若 `statusLine` 仅手工存在于 `settings.json`，而没有存到 cc-switch 的通用配置中，后续切换 Provider/代理/模型时就可能被覆盖删除；但 HUD 插件本体和 `config.json` 通常仍在。

### 2.2 当前已配置的正确位置（重建时优先恢复这里）

**Claude HUD 的 `statusLine` 已持久保存到 cc-switch 的 Claude 通用配置（Common Config）中。**

| 项目 | 值 |
|---|---|
| cc-switch 数据库 | `C:\Users\hfhfn\.cc-switch\cc-switch.db` |
| 表 | `settings` |
| 键 | `common_config_claude` |
| Provider 要求 | 当前/目标 Claude Provider 的 `meta.commonConfigEnabled` 必须为 `true` |
| 本机当前 Provider | 云豆（`commonConfigEnabled: true`） |
`common_config_claude` 当前同时保存：`allowed_openai_params`、`statusLine`、`litellm_settings` 与 `model`。cc-switch 在切换 Provider 时会将这份通用配置和 Provider 的 `env` 一起写回 `~/.claude/settings.json`，所以 HUD 状态栏不会再因正常切换而丢失。

> 重建 cc-switch 或迁移到新电脑时，优先在 cc-switch 的 **Claude 通用配置 / Common Config** 中恢复本文 1.1 的 `statusLine` 对象；不要只手工修改 `~/.claude/settings.json`。

### 2.3 重要原则

> [!tip] 一句话总结
> 状态栏被重置 = cc-switch 覆盖了 `settings.json`。根治 = 把 `statusLine` 放进 **cc-switch 公共配置（Common Config）**，而不是只靠 `/claude-hud:setup`。

- **不要**用旧版 `settings.json` 整份覆盖新的文件：那会丢掉 cc-switch 刚设置的 Provider、代理和模型配置。
- 如需临时修复，只合并恢复 `statusLine` 对象；随后应把它同步回 cc-switch 的 `common_config_claude`。
- **不要把 `settings.json` 设为只读**：cc-switch 将无法正常切换配置。
- `statusLine` 只能有一个。若另一个状态栏工具也写入该字段，需要选择其一。

---

## 3. 最快恢复：HUD 已安装，但状态栏消失

### 方法 A：在 Claude Code 中重新执行官方设置（推荐）

1. 打开 Claude Code。
2. 输入：

   ```text
   /claude-hud:setup
   ```

3. 该命令会重新检测 Node.js 和插件目录，并写入 `settings.json` 的 `statusLine`。
4. 完整重启 Claude Code。

如果想修改显示内容，再输入：
```text
/claude-hud:configure
```

### 方法 B：手动恢复 `statusLine`

当插件还在但 `/claude-hud:setup` 不可用时，编辑：
`C:\Users\hfhfn\.claude\settings.json`

在根对象中加入本文 **1.1** 的 `statusLine` 对象。JSON 前一个字段末尾需要保留逗号；不要删除或修改现有 `env`、`model`、`litellm_settings` 等 cc-switch 字段。

完成后重启 Claude Code。

### 恢复来源

此前可用的配置仍保存在：
`C:\Users\hfhfn\.claude\settings.json.bak.proxy`

其中第 22–25 行包含 HUD 的 `statusLine`。该备份只可作为恢复 `statusLine` 的参考，不能在 cc-switch 切换后整份覆盖回当前配置。

---

## 4. 从零重新安装

在 Claude Code 中按顺序执行：
```text
/plugin marketplace add jarrodwatts/claude-hud
/plugin install claude-hud
/reload-plugins
/claude-hud:setup
```

然后**完整重启 Claude Code**。

如要恢复本文记录的显示偏好：

1. 确认 `C:\Users\hfhfn\.claude\plugins\claude-hud\` 目录存在。
2. 用本文 **1.2** 的完整 JSON 覆盖 `config.json`。
3. 再次重启 Claude Code。

如果 `/claude-hud:setup` 报找不到 JavaScript 运行时，请确保 Node.js LTS 已安装；本机原配置使用 `C:\nvm4w\nodejs\node.exe`。可在 PowerShell 中检查：
```powershell
Test-Path 'C:\nvm4w\nodejs\node.exe'
```

若不存在，可安装 Node.js LTS：
```powershell
winget install OpenJS.NodeJS.LTS
```

安装后关闭并重新打开终端/Claude Code，再运行 `/claude-hud:setup`。

---

## 5. 快速诊断清单

### 5.1 检查 `statusLine` 是否仍存在

在 PowerShell 运行：
```powershell
$settings = Get-Content -Raw "$HOME\.claude\settings.json" | ConvertFrom-Json
$settings.statusLine
```

预期结果：`type` 为 `command`，且 `command` 中含有 `claude-hud`。

### 5.2 检查 Node.js、插件注册表与 HUD 入口
```powershell
$claudeDir = Join-Path $HOME '.claude'
$node = 'C:\nvm4w\nodejs\node.exe'
$hud = Get-ChildItem "$claudeDir\plugins\cache\claude-hud\claude-hud" -Directory -ErrorAction SilentlyContinue |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1

[pscustomobject]@{
  NodeExists = Test-Path $node
  PluginRegistered = (Get-Content "$claudeDir\plugins\installed_plugins.json" -Raw) -match 'claude-hud'
  HudDirectory = $hud.FullName
  RendererExists = $hud -and (Test-Path (Join-Path $hud.FullName 'dist\index.js'))
}
```

预期：`NodeExists`、`PluginRegistered`、`RendererExists` 都是 `True`。

### 5.3 常见现象对应处理

| 现象 | 可能原因 | 处理 |
|---|---|---|
| Claude Code 重启后变回默认状态栏 | `settings.json` 的 `statusLine` 被 cc-switch 覆盖 | 运行 `/claude-hud:setup` 或只合并恢复 `statusLine`。 |
| `statusLine` 存在但不显示 HUD | Node 路径失效、插件缓存被清理，或 Git Bash 命令格式被替换 | 运行 5.2 检查；再执行 `/claude-hud:setup`。 |
| HUD 显示了但样式不是原来的 | `plugins\claude-hud\config.json` 被重置/删除 | 用本文 1.2 的 JSON 恢复，或运行 `/claude-hud:configure`。 |
| `/claude-hud:setup` 找不到命令 | 插件未安装或未重载 | 执行第 4 节安装步骤。 |
| 修改后仍未生效 | Claude Code 已加载旧配置 | 完整关闭所有 Claude Code 进程后重新启动。 |

---

## 6. 后续保护与恢复优先级

**当前方案已实施：**HUD 的启动配置已保存在 cc-switch 的 `common_config_claude`，而不是仅保存在容易被覆盖的 `~/.claude/settings.json`。只要所选 Claude Provider 启用通用配置（`commonConfigEnabled: true`），正常切换不需要额外保护脚本。

如果未来 HUD 又消失，按以下顺序排查：

1. 检查 cc-switch 当前 Provider 是否启用 **Common Config / 通用配置**。
2. 检查 cc-switch 数据库 `settings.common_config_claude` 是否仍含有 `statusLine`；若重建或迁移，优先恢复此处。
3. 再检查生成的 `~/.claude/settings.json` 是否带有 `statusLine`。
4. 只有 cc-switch 本身无法使用时，才临时按第 3 节的方法合并写回 `settings.json`；之后仍应把同一对象恢复到 cc-switch 通用配置。

不要把保护 Hook 仅写在 `settings.json`：若 cc-switch 整体覆盖该文件，Hook 本身也会一起丢失。也不要把文件设为只读，否则 cc-switch 无法切换 Provider。

---

## 7. 本机操作历史（便于追溯）

Claude Code 历史中记录了以下关键操作：

- 曾执行 `/statusline clear`。
- 随后执行 `/claude-hud:setup` 和 `/claude-hud:configure`。
- 后续多次在重启或切换配置后发生状态栏恢复默认的问题。
- **2026-06-23（首次根治）**：定位为 cc-switch 覆盖 `settings.json`，首次把 `statusLine` 写入 cc-switch 公共配置 `common_config_claude`，并当场写回当前 `settings.json` 立即生效；改前数据库备份在 `C:\Users\hfhfn\.cc-switch\cc-switch.db.bak-before-hud`。
- 2026-08-19：确认 cc-switch 修改后的 `settings.json` 缺少 `statusLine`，随后已将 Claude HUD 启动对象合并恢复。

> 补充：cc-switch 公共配置存于 `~/.cc-switch/cc-switch.db`（用户数据），**正常重装 cc-switch 不会丢**；只有彻底清数据才会丢，此时按第 3 节在 Common Config → Claude 里重新粘入 1.1 的 `statusLine` 恢复即可。

历史记录文件：`C:\Users\hfhfn\.claude\history.jsonl`。

---

## 相关笔记

- [[AI大模型/AI-Coding/claude code相关命令&插件&设置|claude code相关命令&插件&设置]] — Claude Code 命令、插件与设置清单