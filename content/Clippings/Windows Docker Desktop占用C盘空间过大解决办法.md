---
title: Windows Docker Desktop 占用 C 盘空间过大解决办法
source: https://zhuanlan.zhihu.com/p/708740826
author:
- Junge
created: 2025-07-04
tags:
- Docker
- Windows
- 磁盘空间
- WSL2
- 已消化
status: 已消化
modified: '2026-08-05T10:55:44+08:00'
---

> [!info] 摘录来源
> - **来源**：[知乎专栏](https://zhuanlan.zhihu.com/p/708740826)
> - **作者**：Junge
> - **剪藏时间**：2025-07-04

---

## 📌 摘录（核心观点）

**问题本质**：Docker Desktop 基于 WSL2 运行，数据都存在 `docker_data.vhdx` 虚拟磁盘里。vhdx 是**动态磁盘**——数据删除后空间不会自动释放，导致 C 盘被占满。

**两个解决办法**：

### 方案 A：把 Docker 数据盘迁到其他盘（治本）
```powershell
# 1. 退出 Docker Desktop
# 2. 移动 C:\Users\<用户名>\AppData\Local\Docker 到其他盘
# 3. 在 cmd（非 powershell）中建立链接
mklink /j "C:\Users\<用户名>\AppData\Local\Docker" "<目标位置>"
```
> 本质：在 C 盘原位置建目录联接（junction），实际数据存新盘。

### 方案 B：压缩 vhdx 空洞（治标）
```powershell
wsl --shutdown          # 先关 WSL
diskpart
DISKPART> select vdisk file="<vhdx路径>"
DISKPART> detach vdisk
DISKPART> compact vdisk
# 或 PowerShell 版
Optimize-VHD -Path "D:\docker\Docker\wsl\disk\docker_data.vhdx" -Mode Full
```

---

## 💭 我的想法 / 关联

- **为什么存这篇**：自己电脑 Docker 放 C 盘，迟早会遇到这个问题。
- **启发/可用点**：方案 A（junction 迁移）最彻底；方案 B 适合已堆积后的补救。
- **存疑/待验证**：Optimize-VHD 需要 Hyper-V 模块，非管理员可能失败；diskpart 更通用。

---

## 🔗 相关笔记

- [[工作/Docker 端口绑定错误|Docker 端口绑定错误]]
- [[工作/使用到的docker命令收集|Docker 命令收集]]
- [[应用&工具笔记/docker安装mysql/mysql终端powershell中文显示乱码的问题|MySQL 终端乱码]]
