---
created: '2026-02-28T18:34:09+08:00'
modified: '2026-02-28T18:34:09+08:00'
---

# OpenClaw 基本操作指南 🦞

> OpenClaw（龙虾智能体）常用命令速查手册

---

## 1. 初始化与重置

```bash
openclaw onboard
```

重新走一遍初始设置流程，适用于首次配置或重置账号信息。

---

## 2. 配置管理

```bash
openclaw config
```

| 子命令 | 说明 |
|--------|------|
| `openclaw config model` | 独立设置使用的 AI 模型 |
| `openclaw config channels` | 配置聊天渠道（如 Slack、Discord 等） |
| `openclaw config list` | 查看当前所有配置项 |
| `openclaw config reset` | 重置为默认配置 |

---

## 3. 运行状态检查

```bash
openclaw status
```

查看运行状态与错误信息，快速确认服务是否正常。

---

## 4. Gateway 服务控制

```bash
# 前台运行（调试时使用，实时看日志）
openclaw gateway

# 后台服务安装（注册为系统服务，开机自启）
openclaw gateway install

# 后台启动
openclaw gateway start

# 停止服务
openclaw gateway stop

# 重启服务（更新配置后使用）
openclaw gateway restart
```

---

## 5. 快捷访问 Dashboard

```bash
openclaw dashboard
```

自动携带 Token 打开 Web 管理界面，无需手动登录。

---

## 6. 故障排查

```bash
# 实时查看运行日志（跟踪模式）
openclaw logs --follow

# 查看最近 N 行日志
openclaw logs --tail 100

# 导出日志到文件
openclaw logs > openclaw_debug.log
```

常用于排查 API Key 失效、认证错误、网络连接问题等。

---

## 7. 系统更新

```bash
openclaw update
```

修复 Bug 并提升安全性，建议定期执行保持版本最新。

---

## 8. 补充实用命令

### 版本信息

```bash
openclaw version
# 或
openclaw --version
```

查看当前安装版本，便于排查兼容性问题。

---

### 帮助文档

```bash
# 查看所有命令
openclaw help

# 查看某个子命令的帮助
openclaw help gateway
openclaw help config
```

---

### 快速重启（一键操作）

```bash
openclaw gateway restart && openclaw status
```

重启服务后立即检查状态，确保恢复正常。

---

### 清理与维护

```bash
# 清理缓存
openclaw cache clear

# 诊断环境问题（网络、权限、依赖等）
openclaw doctor
```

`openclaw doctor` 会自动检测常见配置问题并给出修复建议，是遇到奇怪问题时的首选排查工具。

---

### 会话与上下文管理

```bash
# 查看当前活跃会话
openclaw sessions list

# 清除历史会话
openclaw sessions clear
```

---

### 多环境/多账号切换

```bash
# 查看所有 profile
openclaw profile list

# 切换到指定 profile
openclaw profile use <profile-name>

# 新建 profile
openclaw profile create <profile-name>
```

适合同时管理多个 OpenClaw 账号或不同用途的配置环境。

---

## 💡 常用操作组合速查

| 场景 | 命令 |
|------|------|
| 首次安装配置 | `openclaw onboard` |
| 更新后重启 | `openclaw update && openclaw gateway restart` |
| 出现问题先诊断 | `openclaw doctor` |
| 看实时日志排查 | `openclaw logs --follow` |
| 打开管理界面 | `openclaw dashboard` |
| 切换模型 | `openclaw config model` |
| 检查服务是否正常 | `openclaw status` |

---

*如有命令不适用于你的版本，可运行 `openclaw help` 查看本地支持的完整命令列表。*
