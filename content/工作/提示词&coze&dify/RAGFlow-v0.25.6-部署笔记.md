---
created: '2026-08-05T09:58:42+08:00'
modified: '2026-08-05T09:58:42+08:00'
---

# RAGFlow v0.25.6 部署笔记

> **部署RAGFlow只需要修改以下配置:**
>
> 修改 .env 文件中, WEB端口 8880, 4443;  mysql对外端口5455;  redis对外端口7379
>
> 注释掉 docker-compose.yaml 文件启动命令command中 `--init-model-provider-tables` 

- 注意: dify和ragflow等工具容器启动文件夹名称都是docker, 同时启动时会造成容器的stack都是docker会产生冲突

> 1. 一劳永逸解决办法: 修改配置文件
>    - 在 docker-compose.yaml 文件的顶部配置stack名称:  `name: ragflow` 或者 `name: dify`
> 2. 临时解决办法: 启动容器时设置临时参数
>    - 指定 -p 参数: `docker compose -p dify up -d` 或者 `docker compose -p ragflow up -d`



## 一、文件结构

新版部署需要以下文件，均位于 `docker/` 目录下：
```
docker/
├── .env                          # 环境变量配置
├── docker-compose.yml            # 主服务配置
├── docker-compose-base.yml       # 基础服务配置（MySQL、Redis、MinIO、ES 等）
├── service_conf.yaml.template    # 服务配置模板（可选挂载）
└── entrypoint.sh                 # 启动脚本（可选挂载）
```

---

## 二、.env 关键配置

> 除了 WEB端口 8880, 4443, 和mysql对外端口5455, redis对外端口7379 做修改外, 其他都是默认值

### 镜像版本
```env
RAGFLOW_IMAGE=infiniflow/ragflow:v0.25.6
```

### 运行模式（CPU/GPU）```env
DEVICE=cpu   # 默认 CPU，改为 gpu 则启用 GPU 模式
````COMPOSE_PROFILES` 会自动根据 `DOC_ENGINE` 和 `DEVICE` 组合：```env
COMPOSE_PROFILES=${DOC_ENGINE},${DEVICE}
# 默认结果：elasticsearch,cpu
```

### 对外端口```env
SVR_WEB_HTTP_PORT=8880     # Web 访问端口（容器内 nginx 监听 80）
SVR_WEB_HTTPS_PORT=4443    # HTTPS 端口
SVR_HTTP_PORT=9380         # RAGFlow API 端口
ADMIN_SVR_HTTP_PORT=9381   # Admin 管理后台端口
SVR_MCP_PORT=9382          # MCP 端口
GO_HTTP_PORT=9384          # Go server 端口
GO_ADMIN_PORT=9383         # Go admin 端口
```

### 数据库与中间件```env
MYSQL_PORT=3306
EXPOSE_MYSQL_PORT=5455     # MySQL 对外暴露端口

REDIS_HOST=redis           # Redis 容器名，与 docker-compose-base.yml 保持一致
REDIS_PORT=7379            # Redis 对外暴露端口（容器内固定 6379）
REDIS_PASSWORD=infini_rag_flow
```

### 时区```env
TZ=Asia/Shanghai
```

### API 路由模式```env
API_PROXY_SCHEME=python    # 使用纯 Python server，不启用 Go server
```

---

## 三、docker-compose.yml 关键配置

> 除了启动命令中 `--init-model-provider-tables` 报错, 需要注释外, 其他配置保持默认就行

### 服务结构

新版使用 **CPU/GPU 双 profile** 结构，通过 `DEVICE` 变量自动选择：

- `ragflow-cpu`：profiles: `[cpu]`
- `ragflow-gpu`：profiles: `[gpu]`，额外包含 nvidia GPU 资源配置

### 启动命令```yaml
command:
  - --enable-adminserver
```

> 不要加 `--init-model-provider-tables`，会报错, 该参数在 v0.25.6 中不存在。

### volumes 配置

> `service_conf.yaml.template` 和 `entrypoint.sh` 默认**挂载**，如果有路由异常问题, 可以考虑注释挂载, 直接使用镜像内置版本，避免版本不匹配导致路由异常。
```yaml
volumes:
  - ./ragflow-logs:/ragflow/logs
  # 不挂载 nginx 配置，使用镜像内置
  # - ./nginx/ragflow.conf:/etc/nginx/conf.d/ragflow.conf
  # - ./nginx/proxy.conf:/etc/nginx/proxy.conf
  # - ./nginx/nginx.conf:/etc/nginx/nginx.conf
  # 默认挂载启动脚本，注释后使用镜像内置
  - ./entrypoint.sh:/ragflow/entrypoint.sh
  # 默认挂载服务配置模板，注释后使用镜像内置
  - ./service_conf.yaml.template:/ragflow/conf/service_conf.yaml.template
```

### envionment```yaml
environment:
  - TZ=${TZ}
  - HF_ENDPOINT=${HF_ENDPOINT}
  - MACOS=${MACOS}
```

### restart 策略```yaml
restart: unless-stopped
```

---

## 四、启动命令
```bash
# CPU 模式（默认）
docker compose -f docker-compose.yml up -d

# GPU 模式
# 先在 .env 中设置 DEVICE=gpu，或：
DEVICE=gpu docker compose -f docker-compose.yml up -d
```

---

## 五、访问地址

| 服务 | 地址 |
|------|------|
| Web UI | `http://服务器IP:8880` |
| RAGFlow API | `http://服务器IP:9380` |
| Admin 后台 | `http://服务器IP:9381` |

> 首次访问建议使用**无痕/隐身模式**，避免浏览器缓存旧版前端导致的异常提示。

---

## 六、启动日志确认

正常启动后日志应包含以下关键信息：
```
Applied nginx config: ragflow.conf.python   ✅ nginx 配置正确
Database tables initialized.               ✅ 数据库初始化完成
RAGFlow data sync is ready after Xs         ✅ 数据同步服务就绪
RAGFlow admin is ready after Xs             ✅ Admin 服务就绪
RAGFlow server is ready after Xs            ✅ 主服务就绪
RAGFlow ingestion is ready after Xs         ✅ 任务执行器就绪
Running on http://0.0.0.0:9380             ✅ API 服务监听正常
```

以下为正常的 WARNING，**不影响使用**：

- `Load term.freq FAIL!` — 旧版词频文件，新版不依赖
- `Unknown configuration key: os/oceanbase/seekdb` — 未启用的引擎配置，可忽略
- `can't import package 'torch'` — CPU 模式下正常，无 GPU 支持

---

## 七、常见问题

### 1. nginx 报 `pread() failed (21: Is a directory)`
原因：挂载了旧版 nginx 配置文件，路径冲突。  
解决：注释掉 volumes 中所有 nginx 相关挂载。

### 2. 所有 `/v1/` 接口返回 404
原因：挂载了旧版 `entrypoint.sh`，导致 nginx 路由配置错误。  
解决：注释掉 `entrypoint.sh` 的 volume 挂载，使用镜像内置版本。

### 3. 页面提示"网络异常，无法连接服务器"
可能原因：
- 服务尚未完全启动（约需 25 秒），等待后刷新
- 浏览器缓存了旧版前端

解决：使用无痕模式访问，或按 `Ctrl+Shift+R` 强制刷新。

---

## 相关笔记
- [[工作/提示词&coze&dify/Dify异常问题或额外配置操作|Dify异常问题或额外配置操作]] — Dify 接入 RAGFlow 的踩坑记录
- [[AI大模型/rag/分块策略/RAG中的分块策略|RAG 中的分块策略]] — RAG 分块策略（RAGFlow 知识库切分背后原理）
- [[AI大模型/rag/RAG系统核心技术与实现|RAG系统核心技术与实现]] — RAG 系统实现