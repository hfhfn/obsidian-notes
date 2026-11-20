---
created: '2026-08-05T09:56:14+08:00'
modified: '2026-08-05T09:56:14+08:00'
---

> **切记: 重置docker网络后, 所有容器必须重启, 不然网络无法连接**
---
## 错误信息```
Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:8880 -> 127.0.0.1:0: listen tcp 0.0.0.0:8880: bind: An attempt was made to access a socket in a way forbidden by its access permissions.
```

## 原因
Docker Desktop 后台服务 (`com.docker.service`) 状态异常，导致端口映射失败。

## 解决方案（按推荐顺序）

### ✅ 方案一：图形界面重启（最推荐）
系统托盘 → 右键 Docker 鲸鱼图标 → 点击 **Restart**

### ✅ 方案二：命令行重启（管理员 PowerShell）```powershell
Restart-Service com.docker.service
```

### 方案三：重启 Windows NAT 驱动（备选，仅在方案一二无效时使用）```powershell
# 管理员 PowerShell
net stop winnat
net start winnat
Restart-Service com.docker.service
```

### 方案四：终极方案
重启电脑

## 排查命令参考

### 查看端口占用```cmd
netstat -ano | findstr :8880
```

### 查看 Hyper-V 保留端口范围```cmd
netsh int ipv4 show excludedportrange protocol=tcp
```

### 结束占用端口的进程```cmd
taskkill /PID <PID> /F
```

## 避坑提醒

| ❌ 错误命令 | ✅ 正确命令 | 说明 |
|------------|------------|------|
| `Restart-Service docker` | `Restart-Service com.docker.service` | Docker Desktop 的服务名是 `com.docker.service` |

## 核心要点
- Docker Desktop 在 Windows 上的服务名是 **`com.docker.service`**，不是 `docker`
- 优先使用图形界面重启，简单有效
- 端口被占用 ≠ 一定是其他程序占用，也可能是 Docker 自身服务异常
- 换端口（如 `-p 8881:80`）可临时绕过问题

---
## 相关笔记
- [[应用&工具笔记/docker安装mysql/mysql终端powershell中文显示乱码的问题|MySQL 终端乱码解决]]
- [[Clippings/Windows Docker Desktop占用C盘空间过大解决办法|Docker Desktop 占用 C 盘过大]]
- [[工作/使用到的docker命令收集|Docker 命令收集]]