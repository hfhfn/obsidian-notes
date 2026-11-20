---
title: WSL 安装 Ubuntu + NVM + Node.js + Claude Code
source: https://blog.csdn.net/xhp312098226/article/details/131247719
author:
- 成就一亿技术人!
created: 2025-07-09
tags:
- WSL
- Ubuntu
- nvm
- Node.js
- ClaudeCode
- 环境搭建
- 已消化
status: 已消化
modified: '2026-08-05T11:03:22+08:00'
---

> [!info] 摘录来源
> - **来源**：[CSDN](https://blog.csdn.net/xhp312098226/article/details/131247719)
> - **剪藏时间**：2025-07-09

---

## 📌 摘录（核心步骤）

### 1. WSL 安装/重装 Ubuntu
```bash
# 彻底卸载旧实例
wsl --unregister Ubuntu
wsl --shutdown
# 安装
wsl --install
```

### 2. git 手动安装 nvm
```bash
sudo apt install git
git clone https://github.com/nvm-sh/nvm.git ~/.nvm
cd ~/.nvm && git checkout v0.39.3
chmod +x nvm.sh && ./nvm.sh
# 写入环境变量（否则重启失效）
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
source ~/.bashrc
```

### 3. 装 Node + Claude Code
```bash
nvm install --lts && nvm use 22
npm install -g @anthropic-ai/claude-code
# 配置 API（anyrouter 示例）
echo 'export ANTHROPIC_AUTH_TOKEN=sk-...' >> ~/.bashrc
echo 'export ANTHROPIC_BASE_URL=https://anyrouter.top' >> ~/.bashrc
```

---

## 💭 我的想法 / 关联

- **为什么存**：本地 WSL 环境搭建的完整链路，未来重装系统/换机器可复用。
- **启发点**：nvm 用 git clone 装比 apt 装更可控；`wsl --unregister` 是重装的干净入口。
- **注意**：文中 API 用的是 anyrouter 第三方代理，与官方环境变量一致（`ANTHROPIC_*`）。

---

## 🔗 相关笔记

- [[应用&工具笔记/Windows配置PowerShell的初始化启动文件（初始化oh-my-posh和conda）|PowerShell 环境初始化]]
- [[工作/Docker 端口绑定错误|Docker 端口问题]]
- [[AI大模型/AI-Coding/claude code相关命令&插件&设置|Claude Code 命令与设置]]
