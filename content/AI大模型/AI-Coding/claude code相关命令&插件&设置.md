---
created: '2026-08-28T12:48:54+08:00'
modified: '2026-08-28T12:48:54+08:00'
---

### 设置状态栏```shell
/plugin marketplace add jarrodwatts/claude-hud
/plugin install claude-hud
/claude-hud:setup
/claude-hud:configure
```

> 状态栏配置被覆盖问题, 参考: [[应用&工具笔记/Claude-HUD状态栏恢复指南|Claude HUD 状态栏恢复指南]]

### 设置流量记录和分析工具```shell
pip install claude-tap
# 基于claude-tap启动claude
claude-tap --tap-live
```