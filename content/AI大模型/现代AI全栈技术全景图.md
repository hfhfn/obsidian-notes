---
created: '2026-08-30T22:35:22+08:00'
modified: '2026-08-30T22:35:22+08:00'
---

# 现代 AI 全栈技术全景图

> **来源**：抖音图文作品 @全栈道（粉丝276/获赞2630）
> **发布**：2026-08-24 22:04:49
> **类型**：单张竖版全景海报（864×1821）
> **说明**：内容由本机 RapidOCR 从海报图片逐块识别整理，层级结构按图版式还原，个别 OCR 错字已人工校对修正。

## 总览

一张覆盖「访问 → 客户端 → API → 应用服务 → AI 应用 → 模型 → 数据 → 基础设施/运维 → 安全」完整链路的现代 AI 全栈技术全景图，把互联网应用从用户触达到底层算力的技术选型一次铺开。

![[AI大模型/现代AI全栈技术全景图.webp]]

---

## 一、访问层

**用户/终端接入**
- 用户、PC 浏览器、移动设备、平板设备、桌面应用、小程序、第三方应用、IoT 设备

**网络与边缘层**
- DNS 解析、CDN 加速、边缘计算、全局负载均衡（GLB）、WAF 防火墙、DDoS 防护、SSL/TLS 证书 / 安全组 / ACL

---

## 二、客户端层

**Web 技术栈（响应式 Web / SPA / SSR）**
- HTML5、CSS3、JavaScript、TypeScript
- 框架：Vue.js、React、Angular、Next.js、Nuxt.js
- 样式：TailwindCSS / Sass / Less
- 状态管理：Pinia / Redux / Zustand
- UI 组件库：Element Plus / AntD / Arco / Naive UI
- 测试：Vitest / Jest / Cypress / Playwright
- 工程化 & 生态：构建工具 / 打包 / 性能监控

**移动端技术栈**
- Flutter（Dart）、Kotlin（Android）、Swift（iOS）、React Native（TypeScript）、uni-app、Taro、微信小程序
- 移动端工程化 & 工具：UI 组件库 / 设备能力 / 推送 / 登录分享 / 构建打包

---

## 三、API 接入层

- API 网关（Gateway）：路由转发、协议转换、负载均衡、鉴权认证、限流、黑白名单、API 版本、监控告警
- BFF（Backend For Frontend）：WebBFF / MobileBFF / AIBFF / OpenAPI BFF
- 认证与授权：OAuth2.0 / OIDC、JWT / Token、SSO 单点登录、RBAC / ABAC、多租户隔离、API Key 管理

---

## 四、应用服务层

**后端语言 & 框架**
- Java / Kotlin（Spring Boot / Spring Cloud / Quarkus）
- Node.js / TypeScript（NestJS / Express / Fastify）
- Python（FastAPI / Django）
- Go（Gin / Go-Zero / Fiber）
- Rust（Axum / Actix）

**核心业务服务（微服务）**
- 用户、认证、权限、组织、商品、订单、支付、库存、内容、搜索、通知、文件、评价、报表服务等

**基础服务**
- 配置服务、任务调度、工作流引擎、文件存储服务、邮件/短信/日志/审计服务、代码生成、温测（灰度发布）

**服务治理与微服务能力**
- 服务发现/注册（Nacos / Consul / Eureka）
- 配置中心（Nacos / Apollo / Consul）
- 熔断降级（Sentinel / Resilience4j）
- 分布式事务 / 分布式锁
- 服务网格（Istio / Envoy）、服务可观测性

---

## 五、AI 应用层

**LLM 应用能力**
- RAG（检索增强生成）、Agent 能力、AI 工作流、AI 工程化、Prompt 管理
- 文档解析（OCR / PDF / Office / Web）、向量化（Embedding）、向量检索（Vector Search）、混合检索（Hybrid Search）、重排（Rerank）
- RAG 子能力：文本切分（Chunking）、模型路由（Model Routing）、记忆（Memory）、上下文组装（Context Assemble）

**Agent 子能力**
- 单体（Agent）、多智能体（Multi-Agent）、工具（Tools）、Function Calling、Tool Calling
- 工作流编排（Workflow）、条件分支、并行执行、定时任务、计划（Planning）、执行（Execution）、反思（Reflection）
- AI 评估（Evaluation）、Guardrails / 护栏、人工介入（Human-in-the-loop）

**AI 工程化平台**
- 多模态（Text / Image / Audio）、Streaming、成本监控（Cost Monitor）、实验管理（Experiment）、AI 可观测性（AI Observability）

---

## 六、模型能力 / 模型基础设施

**大模型（商业 API + 开源自托管）**
- OpenAI、Claude、Gemini、DeepSeek、通义千问（Qwen）、智谱清言（GLM）、讯飞星火、百川（Baichuan）
- 开源 / 自托管：Ollama、LLM / TGI / vLLM、LM Gateway（代理网关）
- 模型路由（Model Router）

**能力分类**
- 文本生成（Agent）、图像理解（Vision）、图像生成（Image）、语音（Speech）、代码生成（Code）、视频理解（Video）、向量（Embedding）

**模型基础设施**
- 推理服务（Inference Service）
- GPU 集群 / AI 算力
- 缓存（KVCache / Redis）
- 量化 / 微调 / 部署工具
- 重排服务（Rerank）
- 其他开源模型

---

## 七、数据层

**关系型 / 分布式数据库**
- MySQL、PostgreSQL、MariaDB、TiDB、OceanBase、CockroachDB

**NoSQL / 缓存 / KV**
- Redis、Memcached、HBase、Cassandra、Mongo（推断）、ArangoDB

**向量数据库**
- Milvus、Qdrant、Weaviate、pgvector、ES Vector

**图数据库**
- Neo4j、NebulaGraph

**搜索 / OLAP / 分析**
- Elasticsearch、OpenSearch、ClickHouse、Doris、StarRocks、Kafka / Fink（Flink）

**时序数据库**
- InfluxDB、TDengine、Prometheus（指标）

**消息队列 / 流处理**
- Kafka、RocketMQ、Pulsar、RabbitMQ、ActiveMQ

**数据集成 / 仓库**
- Flink、Spark、Canal、Airbyte、DataX
- 数据湖 / 湖仓：Iceberg、Hudi、Delta Lake、ClickHouse Lake

**对象存储 / 云存储**
- MinIO、阿里云 OSS、腾讯云 COS、AWS S3

---

## 八、基础设施层（云原生 / IaaS）

**计算 & 容器**
- 云服务器 ECS、弹性伸缩 AS、Serverless 函数、GPU 实例、GPU 集群、NVIDIA 驱动
- Docker、containerd、Kubernetes（K8s）、K8s 集群

**网络 / 中间件**
- VPC、负载均衡 SLB、Nginx / OpenResty、Envoy、内网 / 专线、RDMA / 高性能网络

**存储**
- 云盘 / 块存储、文件存储 NAS、对象存储 OSS、备份 / 快照

**集群 / 网格**
- Redis 集群、Kafka 集群、K8s 集群、服务网格（Consul Connect / Linkerd）

---

## 九、研发运维层（DevOps / CI-CD）

**代码管理**
- Git、GitHub、GitLab、Gitee、GitHub Actions、GitLab CI、Jenkins、Drone

**构建 & 测试**
- Maven / Gradle、Docker / Image、Helm、Kubernetes
- npm / pnpm、单元测试 / 集成测试

**质量与安全**
- ESLint / Prettier、SonarQube、SAST / SCA / DAST、静态代码检查、依赖 / 漏洞扫描

**制品管理**
- Docker Registry、npm Registry、Maven Repository、制品库（Nexus / Artifactory）

**CD / 环境管理**
- 持续部署、开发环境、测试环境、预生产环境、生产环境

---

## 十、可观测性层

**日志 / 指标 / 链路**
- ELK（Elastic / Logstash / Kibana）、Loki、Fluentd / Filebeat
- Prometheus、Grafana
- SkyWalking、Jaeger、Zipkin、Pinpoint、健康追踪
- APM（应用性能监控）

**告警通知**
- AlertManager、ARMS、Datadog、Webhook、短信、企业微信、钉钉、飞书

---

## 十一、安全层

**网络安全**
- 防火墙、WAF、DDoS 防护、入侵检测 / 防御

**身份与访问安全**
- SSO / IAM、MFA 多因素认证、RBAC / ABAC、工具权限控制、审计

**应用安全**
- SQL 注入防护、XSS 防护、CSRF 防护、SSRF 防护、API 安全

**数据安全**
- 数据加密（传输 / 存储）、数据脱敏 / Masking、DLP 防护、数据泄漏防护、备份与恢复、密钥管理 KMS、Secret 扫描

**DevSecOps / AI 安全 / 合规**
- SAST、SCA、DAST、镜像 / 容器扫描
- Prompt 注入防护、AI 输出内容安全（过滤器）、越权访问防护
- 审计与合规（等保 / GDPR）

---

## 关键要点

1. **分层清晰**：从用户触达（访问层）一路到云原生底层（基础设施层）+ 贯穿全程的可观测性与安全防护，共 11 大板块。
2. **客户端双端覆盖**：Web（Vue / React / Next / Nuxt + 状态管理 + UI 组件库 + 测试）与移动端（Flutter / Kotlin / Swift / RN / uni-app / 小程序）并举。
3. **微服务 + 多语言**：后端 Java / Node / Python / Go / Rust 五大语言栈，配合微服务治理（Nacos / Consul / Sentinel / Istio）。
4. **AI 全栈是核心亮点**：RAG（解析 → 切分 → 向量化 → 检索 → 重排）、Agent（单体 / 多智能体 / Tool Calling / Planning / 反思）、模型路由与多模态能力、GPU 算力与推理服务。
5. **数据全类型**：关系型、NoSQL、向量、图、搜索、OLAP、时序、消息队列、湖仓一应俱全，向量库（Milvus / Qdrant / pgvector）尤其贴合 AI 场景。
6. **工程化闭环**：DevOps（代码管理 → CI → 构建测试 → 制品 → CD → 多环境）+ 可观测性（日志 / 指标 / APM / 告警）+ 全栈安全（网安 / 身份 / 应用 / 数据 / AI 安全 / 合规）。

> **Note**：此作品为纯图文（单张海报），无音频/语音，故以 OCR 画面文字提取为主。

---

## 相关笔记

- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] — 本库 AI 大模型内容地图
- [[AI大模型/rag/RAG 企业级架构实战：从事故到生产级防御|RAG 企业级架构实战：从事故到生产级防御]] — RAG 企业级实战（AI 应用层纵深）
- [[AI大模型/2026后端转型AI大模型开发|2026后端转型AI大模型开发]] — 全栈 → AI 的转型学习路径