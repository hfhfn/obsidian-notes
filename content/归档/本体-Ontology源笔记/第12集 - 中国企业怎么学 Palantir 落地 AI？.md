---
created: '2026-09-17T16:18:05+08:00'
modified: '2026-09-17T16:18:05+08:00'
---

# 第12集 | 中国企业怎么学 Palantir 落地 AI？

很多中国企业做了不少 AI Demo，却迟迟进不了生产。本期把 Palantir 的企业 AI 架构画成一张图，重点不是记住 Gotham、Foundry、AIP、Apollo 这些产品名，而是看懂它的落地顺序：从一个具体的业务决定出发，只连接需要的数据；用 Ontology 定义对象、规则、动作和权限；再让 Agent 调用受控工具，把结果写回 ERP、MES 等业务系统；最后补齐评测、监控、发布和回滚。

**两个容易理解错的地方：**
- **Ontology 不只是知识图谱**，更像一份可以运行的业务契约
- **Apollo 管的是软件持续交付**，不是 GPU 或模型训练调度

**判断一套企业 AI 是否真正属于自己，可以问一个问题：**如果明天更换大模型，业务对象、规则、动作、权限和历史还能不能留下？如果不能，可能只是一个更贵的 Demo。

---

## 时间轴·画面与讲解

### [00:00] 架构总览与核心理念
**画面要点：**
- 架构图来源：Architecture Center 2026，官方口径解释性重绘
- 标准架构由三套集成平台组成：AIP、Foundry、Apollo
- 九组能力围绕 Ontology，六个横向类别贯穿两侧
- 常见误区：只记产品名（Gotham、Foundry、AIP、Apollo），不看依赖关系

**讲解要点：**
- 中国企业可以先学会它做事的顺序，不买也可以借鉴
- 看完整结构，从下往上最底层是 Rubix（硬化 Kubernetes 底座）
- 中间层是 Ontology（决策内核）
- 上面是应用层（Workshop、AIP Logic、OSDK）
- 六个横向类别：Data、Logic、Workflow、Services、Analytics & Automations、Product Delivery
- Apollo 在最底部托住整层，常被漏掉

---

### [01:00] Rubix：整套架构的底座
**画面要点：**
- 官方定义：硬化的、自动扩缩容的、高可用的 Kubernetes 实现
- 合规标准：FedRAMP High、DOD DISA IL-5/IL-6、CMMC
- 安全措施：强制加密、workload 隔离、48 小时节点生命周期上限
- 用途：部署到"世界上最受限、最复杂的环境"

**讲解要点：**
- Rubix 原本为跑 Palantir 自己的软件而做，现在也提供给其他软件公司
- 国内谈私有化、气隙、边缘、等保、信创，对照物就在这一层
- Palantir 能进最封闭的环境，不是因为模型好，是因为有这一层
- 很多企业方案讲了三页模型能力，部署环境只有一句话"支持私有化"，这就是差距所在

**中国企业学习要点：**
- 不用先做一个 Rubix，但要回答：Agent 的提示、工具、规则有没有版本？升级失败能不能回退？离线或边缘环境怎么运行？

---

### [02:00] Apollo：持续交付平台
**画面要点：**
- 官方定义：一个可扩展的用于管理和部署软件的平台
- 每天在几百个服务器和资产上编排数千次零停机升级
- 管理内容：发布、升级、监控、回滚、零停机

**讲解要点：**
- **Apollo 管软件，不管 GPU**
- 不管模型训练、不管算力调度——算力属于横向类别里的 Compute，底座是 Rubix
- 很多中文解读把 Apollo 写成"私有算力/模型训练调度底座"，这是错误的
- Apollo 管的是：版本怎么进入云/本地/边缘和隔离环境、怎么灰度、出问题怎么回滚

**中国企业学习要点：**
- 不用先做一个 Apollo，先回答几个朴素的问题：
  - Agent 的提示、工具和规则有没有版本？
  - 测试通过后用什么发布？
  - 模型换了要不要重考评测？
  - 一个工厂升级失败，能不能回退？
  - 离线或边缘环境怎么运行？
- AI 系统每次每改一次都是一次冒险

---

### [03:00] Multimodal Data Plane（MMDP）
**画面要点：**
- 官方哲学四个词：**Any Data · Any Compute · Any Model · + Anywhere**
- "Anywhere" 是最常被漏掉的第四个词，把前三个和部署能力连起来
- 数据类型：表格数据、媒体、流式、地理空间
- 计算引擎：单节点引擎、流式计算、批量计算、BYO Compute（自带计算引擎）
- 模型策略：Anthropic、OpenAI、Google、Meta、xAI 等
- 底部标签：BigQuery、Snowflake、Databricks、Postgres、S3、Iceberg、Delta、Trino、DuckDB、Polars、SAP

**讲解要点：**
- **不是默认把所有数据复制进一座新数据库**
- 数据以原始格式存储（如 CSV、Parquet），通过 REST、JDBC、S3 兼容接口访问
- 转换后的数据默认也是开放格式

---

### [04:00] Services：Ontology 之下的三类服务
**画面要点：**
- **Data**：批量、流式、CDC
- **Logic**：规则、优化器、LLM
- **Workflow**：Action、审批、写回

**讲解要点：**
- 连接七件套：Batch、Streaming、CDC、Virtual Tables、Media Connection、Agent-based Connection、Credential Management
- **关键洞察**：2026 年 MMDP 页面全文 CDC 零命中，这和国内先做两年全域治理的习惯刚好相反
- **只接这一个决定需要的数据**
  - 缺料场景可能只要 ERP 订单采购单、MES 工单产线状态、WMS 库存，加供应商交期
  - 其他二百张表先别碰
- Pioneer 的路径更像一条垂直切片：为了做成一个决定，只接这个决定需要的数据

---

### [05:00] Ontology：决策内核
**画面要点：**
- 官方定义原文：**Ontology 用来表达企业彼此关联的复杂决定，而不只是数据**
- "决定"二字在官方文档里是斜体，是自己强调的
- 整合四维：Data · Logic · Action · Security
- 三层结构：Language / Engine / Toolchain
- 三层状态：Semantic（语义）、Kinetic（动能）、Dynamic（动态）

**讲解要点：**
- 很多人把它理解成知识图谱——这个说法不能算错，但少了一半
- 少的是：动作、状态、权限和审计
- **Kinetic（动能）**：动作是本体的一部分，不是外挂上去的
  - 订单、物料、供应商、库存、工单、产线都挂有 Function 和 Action
  - OSDK 从底层伸上来
  - 例子：库存不足时能不能发起调拨？采购金额超过多少必须二次审批？某种替代物能不能用于这张订单？排产被修改后哪些下游对象必须一起更新？
- **关键结论**：只统一名词、不定义状态变化、权限和写回，你得到的是更漂亮的标签，不是 Ontology
- 它更接近一份**可以运行的业务契约**：
  - 世界里有什么？
  - 现在是什么状态？
  - 人和 Agent 分别可以做什么？

**中国企业学习要点：**
- 不一定要做一个 Palantir 的大平台
- 可以在现有数仓、主数据、数据库、AIP 和工作流引擎上，补一个薄但稳定的业务对象层
- 但要守住一条线：**对象定义必须和动作一起做**

---

### [07:00] Logic Service 与 K-LLM 范式
**画面要点：**
- 官方给了名字：**K-LLM**
- AIP Logic 每个 block 可指定不同模型
- Workflow Lineage 支持跨函数批量替换模型
- Evals 框架做同题多模型对比

**讲解要点：**
- Palantir 没有把所有智能都压在大模型上
- 一个决定可以同时调用：业务规则、预测模型、优化器、LLM Function
  - 库存计算和约束优化可能主要靠传统模型
  - 读供应商邮件、解读方案、把异常翻译成业务人员能看懂的理由——大模型更适合这些
- CTO 原话：**能用 K 模型的时候，不要只用一个**
- 这不是口号，是产品里比较实在的东西

**正确理解不是"先别接模型"，而是：**
- 从第一天就假设你会**同时用多个模型**
- 并且**随时能替换任何一个**
- 这个假设会改变架构——逼你把业务规则、动作边界放在模型外面
- 企业级平台接模型永远是慢于模型发布的，所以架构不能假设永远用最新模型，只能假设随时能换

---

### [08:30] SuperRepo 与模型接入定位
**画面要点：**
- Ontology 定义、Functions、React 前端打包成一个 Pro Code Model Package
- AIP Invol 进入 Beta，主要是协调 AIFDE Agent
- 官方 AIP 架构图编号十二类能力，**第 1 类才是安全 LLM 接入**，其余类都在它外面

**讲解要点：**
- 模型接入只占十二分之一
- Ontology 是更根本的东西：业务对象、规则、动作、权限的定义
- SuperRepo 把 Ontology 定义作为一个单一版本化的 artifact，这是 Ontology 版本化的答案

---

## 核心总结

### Palantir 企业 AI 落地顺序

```
1. 从具体业务决定出发 → 只连接需要的数据（垂直切片，非全域治理）
2. Ontology 定义对象、规则、动作、权限（四维集成：Data·Logic·Action·Security）
3. K-LLM 范式 → 同时用多个模型，随时可替换
4. Agent 调用受控工具，结果写回 ERP/MES 等业务系统
5. 补齐评测、监控、发布和回滚（Apollo）
```

### 两个常见误解

| 误解 | 正解 |
|------|------|
| Ontology = 知识图谱 | Ontology = 可以运行的业务契约（含动作、权限、写回） |
| Apollo = 算力/模型调度 | Apollo = 软件持续交付（发布、升级、监控、回滚） |

### 自测：这套企业 AI 是否真正属于你？

> 如果明天更换大模型，业务对象、规则、动作、权限和历史还能不能留下？
> 
> 如果不能，可能只是一个更贵的 Demo。

---

**标签：** #Palantir #Ontology #Foundry #企业AI #ai实战技巧

---

### 08:50
**讲解**：去改进方锐里面的 AI 系统，自动优化成本、性能和模型选择。还有 Object Timeline 追踪 agent 和人工的编辑。

**画面**：
```
PALANTIR 官方原图
同月还有：SuperRepo · AlPEvolve · ObjectTimeline
Multimodal Data Plane: Any Data · Any Compute · Any Model
Kimi-K3 七月已发、GLM-5.2 六月已发，AIP 上是上一代一企业平台接模型永远慢于发布，所
以架构只能假设自己随时能换。SuperRepo（Beta）把 Ontology 定义、Functions、React 前端
打成一个 pro-code monorepo 的单一版本化 artifact。
palantir.com/docs/foundry/announcements/2026-08
还有 ObjectTimeline 追踪
```

---

### 09:00
**讲解**：带 token 用量、运行时长和 Agentic Coverage 指标。这是把 agent 的可观测性落到对象级别。然后再说 AIP 整体啊，Palantir 2026 年的 AIP 架构图列了 12 类能力。

**画面**：
```
PALANTIR 官方原图
同月还有：SuperRepo · AlPEvolve · ObjectTimeline
Multimodal Data Plane: Any Data · Any Compute · Any Model
Kimi-K3 七月已发、GLM-5.2 六月已发，AIP 上是上一代一企业平台接模型永远慢于发布，所
以架构只能假设自己随时能换。SuperRepo（Beta）把 Ontology 定义、Functions、React 前端
打成一个 pro-code monorepo 的单一版本化 artifact。
palantir.com/docs/foundry/announcements/2026-08
然后再说 AIP 整体啊
```

---

### 09:08
**讲解**：编号特别清楚。第一个呢是安全的 LLM 接入。

**画面**：
```
官方口径
2026.08
同月还有：SuperRepo · AlPEvolve · ObjectTimeline
解读性重绘
中国企业怎么学
Multimodal Data Plane
0099159
Data · Logic · Workflow · Aatran · MMDP · Aovoaony
10 七上个月，中国开源模型进了 AIP
Functions · Penu
打成一个 pro-code monorepo v3.2 GLM5、Kimi 2.5 经 AWS Bedrock 接入
orAIPry
是安全的 LLM 外接入
```

---

### 09:20
**讲解**：接下来呢第二类呢是端到端可观测、Context Engineering、Ontology System、安全与治理、Agent 的生命周期、运营自动化、开发环境、人机系统应用。

**画面**：
```
Palantir AIP Architecture Overview
AIP / 4 / CONTEXT ENGINEERING / [DATA, LOGIC, ACTIONS] / MMDP, Real-Time & No-Code
AIP Architecture
Contextual Data
Secure LLM Integration & Access
External Logic / Building Functions
2 / End-to-end Observability
Contextual Logic
Context Engineering
The Ontology System
Event-driven, Str / Edge integration
5 / Vector, Compute, Tool Services
6 / Security & Governance
Systems of Action
7 / Agent Lifecycle
8 / Operational Automation
9 / Development Environments
11 / 6 / 10 / Human+AI Applications
PACKAGE, RELEASE, DEPLOY
SE / 11 / Package Release & Deploy
& / 12 Enterprise Automation
Product Packaging
Dependency Management
Environment Management
Release Channels...
AC / DEVELOPMENT ENVIRONMENTS
Integrated VS Code
Integrated Jupyter
Compute Modules
10 / HUMAN+AI APPLICATIONS
No/low-code App Building
Object-oriented Analytics
Real-time Analytics
Workflow Management
Resource Management
12 / ENTERPRISE AUTOMATION
AIFDE, AIPA assist
生命周期运营
Code Assist PSDK
AI-enabled Pipeline
OPalantir
```

---

### 09:30
**讲解**：打包发布部署企业自动化。那模型接入呢只是 12 分之 1。如果一个企业 AI 平台只有模型网关、RAG 和 Agent 编排，它离生产系统还差得很远。

**画面**：
```
Palantir AIP Architecture Overview
RAIP?
CONTEXT ENGINEERING
[DATA, LOGIC, ACTIONS]
MMDP, Real-Time, Pro-Code &
Contextual Data
AIP Architecture
External Logic, Model Building Functions
Secure LLM Integration & Access
2 / End-to-end Observability
Contextual Logic
3 / Context Engineering
4 / The Ontology System
Event-driven, Streaming, Edge Integration
5 / Vector, Compute, Tool Services
6 / Security & Governance
Systems of Action
7 / Agent Lifecycle
8 / Operational Automation
9 / Development Environments
11 / 10 / Human+AI Applications
PACKAGE, RELEASE, DEPLOY
11 / Package, Release, & Deploy
12 Enterprise Automation
Product Packaging
Dependency Management
Environment Management
Release Channels...
DEVELOPMENT ENVIRONMENTS
Integrated VS Code
Integrated Jupyter
Compute Modules
MCP, IDE Extensions
10 / HUMAN+AI APPLICATIONS
No/Low-code App Building
Object-oriented Analytics
Real-time Analytics
Workflow Management
12 / ENTERPRISE AUTOMATION
```

---

### 09:40
**讲解**：那现在回到刚才的缺料场景啊，讲写回。

**画面**：
```
Architecture Overview
CONTEXT ENGINEERING
ONTOLOGY
[DATA, LOGIC, ACTIONS]
MMDP, Real-Time, Pro-Code & No-Code
Ontology Core
Contextual Data
--
External Logic Model Building Functions
Access
Contextual Logic
Semantic
Event-driven, Streaming, Edge Integration
Tool Services
sa
Systems of Action
Data
Logic
11 / 6
PACKAGE, RELEASE, DEPLOY
SECURITY & GOVERNANCE
Product Packaging
Dependency Management
Environment Management
Release Channels...
AGENT LIFECYCLE
9 / Agent
DEVELOPMENT ENVIRONMENTS
Build
Integrated Jupyter
Integrated VS Code
Compute Modules
Agent
MCP, IDE Extensions
Orc
10 / Evaluate
HUMAN+AI APPLICATIONS
Suite
No/low-code App Building
Object-oriented Analytics
Real-time Analytics
Workflow Management
高风险订单
12 / End-to-end
ENTERPRISE AUTOMATION
Observa
```

---

### 09:55
**讲解**：找到 3 张高风险订单，生成两个调拨方案。那采购经理呢选第二个，系统写回 ERP，同时修改对应工单。嗯，仓库实际只调出了 8 成，呃，只调出八成库存，对吧？原因也被记录下来。那到这里呢，闭环才开始有价值啊。

**画面**：
```
Overview：12 类能力
VIEW
ONTOLOGY
AGENTs
SECURITY
AUTOMATIONS +
RELEASE, DEPLOY
& GOVERNANCE
SECURE LLM INTEGRATION
A
```

---

### 10:10
**讲解**：官方有一张图专门讲这个事儿叫 Read-Write Loops。图里人和 agent 通过同一套 interface 进 Ontology。那每个对象都带 properties、actions、automations 自来。左边呢写回外部系统，右边读取外部系统。那下面还有一条 external write。

**画面**：
```
PALANTIR 官方原图
AIP Architecture Overview：12 类能力
Palantir AIP Architecture Overview
AIP
QPalantir
还包括端到端可观测、Context Engineering、Agent 生命周期、Evals、运营自动化、发布部署。
如果一个企业 AI 平台只有模型网关、RAG 和 Agent 编排，它离生产系统还差十一类。
palantir.com/docs/foundry/architecture/
architecture
```

---

### 10:20
**讲解**：那下面还有一条 external write。注意人和 agent 是并排的，走同一套接口，收同一套权限，这是整张图最重要的细节哈。那下一次系统就可以知道了，哪个建议是可以被接受的，执行到哪儿？

**画面**：
```
PALANTIR 官方原图
Ontology System: Read-Write Loops
Palantir
重试会不会调两次库存？ERP 成功但 Agent 超时怎么对账？所以 Action 旁边必须有幂等键、回
执、补偿、审计和人工接管。闭环不是把聊天记录塞回向量库，是把决定和结果放
进对象的历史里。
paLant1r
那下面还有一条 external writes
可以被接受
```

---

### 10:30
**讲解**：发生了什么偏差？不是把聊天记录塞回向量库，而是把决定和结果放回业务对象的历史。但写回一定要注意处理。

**画面**：
```
Loops
Agent / Human / Agent / Human / Agent / Human / Agent / Human
Interfaces
Ontology
.Write
Object / Object / Object
Properties / Link
Functions / Properties / Link
.Properties
x Functions
Fun
.Write
本
Actions
pRead
Object / Object / Object
Link / 二 Properties / Link
.Properties
e.Write
f:Fun
pRead
Object / Object
Link
Properties
e.Write
f:Fun
pRead
Object / Object
Link
Properties
e.Write
ExternalWrites
助力处理
```

---

### 10:47
**讲解**：麻烦的这个现实，同一条请求重试，然后会不会调两次库存呀？然后 ERP 已经成功了，Agent 超时了，怎么对账呀？然后审批以后，供应商状态变了，要不要重新计算？

**画面**：
```
PALANTIR 官方原图
Ontology System: Read-Write Loops
Ontology System Read-Write Loops
重试会不会调两次库存？ERP 成功但 Agent 超时怎么对账？所以
ion 旁边必须有幂等键、回执、补偿、审计和人工接管。闭环不是把聊天记录塞回向量库，是把决定和结果放
进对象的历史里。
供应商状态变了
```

---

### 11:00
**讲解**：所以 action 旁边呢还要有幂等键、回执、补偿、审计和人工接管，没有这些呢所谓闭环，就是 demo 顺利时看起来比较完整啊。最上面一层呢，我们要纠正一个常见的画法，就是 Gotham 其实不在应用层里。

**画面**：
```
PALANTIR 官方原图
Ontology System: Read-Write Loops
Ontology System Read-Write Loops
QPalantir
重试会不会调两次库存？ERP 成功但 Agent 超时怎么对账？所以 Action 旁边必须有幂等键、回
执、补偿、审计和人工接管。闭环不是把聊天记录塞回向量库，是把决定和结果放回业务对象的历
史里。
```

---

### 11:10
**讲解**：那 Gotham 它最早的组件呢是在标准的 AIP 和 Foundry 加 Apollo 架构之前开发的。

**画面**：
```
PALANTIR 官方原图
Interoperability: Palantir Provided vs Bring Your Own
Interoperability Data Flow Security
原图左右分两栏。BYO 那栏写着：自带业务规则、自带 ML 模型、自带优化器、自带 GenAI 模
型，实时 ERP 同步，实时 MES 与 PLM 集成，边缘上的对象和函数。它把保留现有 IT 的一句主张变成一张清单。
palantir.com/docs/foundry/architecture
Apollo 架构之前开发的
```

---

### 11:20
**讲解**：那现在我们所有 offering 都已经完整集成进标准架构。那 Gotham 那套多模态应用和工具呢，是由 Foundry 管理的 Ontology 驱动。

**画面**：
```
ARCHITECTURE CENTER · 2026
核验 2026.08
Palantir 企业 AI 架构
官方口径
解读性重绘
中国企业怎么学
OFFERINGS 交付形态
Gotham
Hospitals · Warp Speed · Skywise
追 alpha
可以自建自己的 offering
不是买 beta
APPLICATIONS ONTOLOGY 之上
分析与应用
Agent 与自动化
产品交付
Workshop · 对象型分析
AIP Logic · Evals
OSDK · SuperRepo
ONTOLOGY 决策内核
LANGUAGE · ENGINE · TOOLCHAIN
Ontology
对象 · 链接 · 属性 | 读写 · 事务
企业的决定，不只是数据
四维集成
人 + Agent 的共同操作面
Data · Logic · Action · Security
13 / Gotham 不在应用层，它是 offering
官方：Gotham 那套多模态应用由 Foundry 管理的 Ontology 驱动。并列
的有 Hospitals、Skywise、RaceOS。
```

---

### 11:30
**讲解**：和 Gotham 并列的呢还有 Palantir for Hospitals、Warp Speed、RaceOS 以及客户自己造的。比如空客用 Skywise 撑起整个航空的这个生态哈。富士通建了一套专门的。

**画面**：
```
PALANTIR 官方原图
官方自己的反 SaaS 论证：alpha vs beta
Enterprise OS Products for Alpha
HYBRID
Analytics
Automations
Agents &
Product
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Workflow
QPalantir
成功的部署是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology。beta 是
追唾手可得的果实，比如一刀切 SaaS 里的基础方案。所以 offering 是可以自己造的，Airbus 和
Andretti 就自己造了。
富士通呢建了一套
```

---

### 11:40
**讲解**：把这套应用啊，iRobot Racing 呢做了一个 RaceOS，把实时赛车数据接入 AI 的应用。那这个修正呢对我们企业有实际的意义，就是 offering 是可以自己造的。

**画面**：
```
PALANTIR 官方原图
官方自己的反 SaaS 论证：alpha vs beta
Enterprise OS Products for Alpha
HYBRID PRODUCTS
CUSTOMER
Analytics
Automations
Agents &
Product
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Workflow
Services
QPalantir
成功的部署是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology。beta 是
追唾手可得的果实，比如一刀切 SaaS 里的基础方案。所以 offering 是可以自己造的，Airbus 和
Andretti 就自己造了。
修正呢
的行业交付形态
```

---

### 11:50
**讲解**：你不需要买一个叫 Gotham 的东西，你需要基于自己的对象层，到一个只有你能造的行业交互形态。

**画面**：
```
PALANTIR 官方原图
官方自己的反 SaaS 论证：alpha vs beta
Enterprise OS Products for Alpha
HYBRID PRODUCTS
CUSTOMER
Analytics
Automations
Agents &
Product
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Workflow
Services
QPalantir
成功的部署是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology。beta 是
追唾手可得的果实，比如一刀切 SaaS 里的基础方案。所以 offering 是可以自己造的，Airbus 和
Andretti 就自己造了。
```

---

### 12:00
**讲解**：那 Palantir 也是这么说的哈，官方用了一个比喻：一次成功的 Palantir 部署呢是企业在追 alpha，围绕自己差异化去建设，把自己的特殊性注入 ontology。

**画面**：
```
PALANTIR 官方原图
官方自己的反 SaaS 论证：alpha vs beta
Enterprise OS Products for Alpha
HYBRID PRODUCTS
CUSTOMER
Analytics
Automations
Agents &
Product
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Workflow
Services
QPalantir
成功的部署是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology。beta 是
追唾手可得的果实，比如一刀切 SaaS 里的基础方案。所以 offering 是可以自己造的，Airbus 和
Andretti 就自己造了。
palantir.com/docs/foundry/architecture-center/platforms
把自己的特殊性注入 ontology
```

---

### 12:10
**讲解**：那 beta 是什么呢？是追唾手可得的果实，比如一套一刀切的 SaaS 里的基础方案。那这套架构你能支撑这类的用例啊，但理想情况下，它们是只追 alpha 的副产品。

**画面**：
```
己的反 SaaS 论证：alpha vs beta
Enterprise OS Products for Alpha
HYBRID PRODUCTS
CUSTOMER
ENTERPRISE
AGENTS & AUTOMATIONS
MOBILE
S
EDGE
Analytics
Agents &
Product
Automations
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Logic
Workflow
Services
Services
Services
部署是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology。beta 是
追唾手可得的果实，比如一刀切 SaaS 里的基础方案。所以 offering 是可以自己造的
就自己造了。
/docs/foundry
也能支撑这类的用例啊
```

---

### 12:20
**讲解**：所以我们可以直接回答我们现在的一些老问题，就是为什么我买了一样的产品就做不出一样的效果？因为你买的是 beta。

**画面**：
```
Enterprise OS Products for Alpha
HYBRID
PRODUCTS
CUSTOMER
ENTERPRISE
AGENTS & AUTOMATIONS
MOBILE
S
EDGE
Analytics
Agents &
Product
Automations
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Logic
Workflow
Services
Services
Services
就做不出一样的效果
是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology
```

---

### 12:30
**讲解**：还有一层呢比较容易被忽略，就是它不在软件里。就是 FDE。他现在比较热啊，他其实是工程师被深入嵌入到全球的关键环境里。

**画面**：
```
PALANTIR 官方原图
官方自己的反 SaaS 论证：alpha vs beta
Enterprise OS Products for Alpha
HYBRID PRODUCTS
CUSTOMER
Analytics
Automations
Agents &
Product
Delivery
Ontology
Ontology
Ontology
Language
Engine
Toolchain
Data
Workflow
QPalantir
成功的部署是企业在追 alpha——围绕自己的差异化建设，把自身特殊性注入 ontology。beta 是
追唾手可得的果实，比如一刀切 SaaS 里的基础方案。所以 offering 是可以自己造的，Airbus 和
Andretti 就自己造了。
它其实是工程师被深入
```

---

### 12:40
**讲解**：从战区到工厂车间，跟客户一起走很多路，不停地进和发新功能。那这一层呢在我们企业里其实是容易复制的，也是比较少的企业来做的。

**画面**：
```
ARCHITECTURE CENTER · 2026
核验 2026.08
Palantir 企业 AI 架构
官方口径
解读性重绘
中国企业怎么学
OFFERINGS 交付形态
Gotham
Hospitals · Warp Speed · Skywise
追 alpha
可以自建自己的 offering
不是买 beta
APPLICATIONS ONTOLOGY 之上
分析与应用
Agent 与自动化
产品交付
Workshop · 对象型分析
AIP Logic · Evals
OSDK · SuperRepo
ONTOLOGY 决策内核
LANGUAGE · ENGINE · TOOLCHAIN
Ontology
对象 · 链接 · 属性 | 读写 · 事务
企业的决定，不只是数据
四维集成
人 + Agent 的共同操作面
Data · Logic · Action · Security
SECURITY
SERVICES ONTOLOGY 之下
Data
Logic
Workflow
批量 · 流式 · CDC
规则 · 优化器 · LLM
Action · 审批 · 写回
MULTIMODAL DATA PLANE
MMDP
Any Data · Any Compute · Any Model
+ Anywhere ← 常被漏掉的第四个词
APOLLO 持续交付
Apollo
发布 · 升级 · 监控 · 回滚 · 零停机
不管 GPU
RUBIX
整套架构的底座
Rubix
硬化 · 高可用 Kubernetes · FedRAMP High
14
两轮九十天，和两个验收问题
/14
前九十天：一个决定、最小数据链、一个有人审批能写回可追踪的 Action 闭环。后九十天再加 Agent。
在我们企业里
```

---

### 12:50
**讲解**：它不太用于采购哈，就是只要决定说让你的工程师去到线产线上去待着就行了。

**画面**：
```
ARCHITECTURE CENTER · 2026
核验 2026.08
Palantir 企业 AI 架构
官方口径
解读性重绘
中国企业怎么学
OFFERINGS 交付形态
Gotham
Hospitals · Warp Speed · Skywise
追 alpha
可以自建自己的 offering
不是买 beta
APPLICATIONS ONTOLOGY 之上
分析与应用
Agent 与自动化
产品交付
Workshop · 对象型分析
AIP Logic · Evals
OSDK · SuperRepo
ONTOLOGY 决策内核
LANGUAGE · ENGINE · TOOLCHAIN
Ontology
对象 · 链接 · 属性 | 读写 · 事务
企业的决定，不只是数据
四维集成
人 + Agent 的共同操作面
Data · Logic · Action · Security
SERVICES ONTOLOGY 之下
Data
Logic
Workflow
批量 · 流式 · CDC
规则 · 优化器 · LLM
Action · 审批 · 写回
MULTIMODAL DATA PLANE
MMDP
Any Data · Any Compute · Any Model
+ Anywhere ← 常被漏掉的第四个词
APOLLO 持续交付
Apollo
发布 · 升级 · 监控 · 回滚 · 零停机
不管 GPU
RUBIX
整套架构的底座
Rubix
硬化 · 高可用 Kubernetes · FedRAMP High
14
两轮九十天，和两个验收问题
/14
前九十天：一个决定、最小数据链、一个有人审批能写回可追踪的 Action 闭环。后九十天再加 Agent。
产线上去待着就行啊
```

---

### 13:00
**讲解**：所以如果让我给中国的企业排一个落地的顺序呢，我大概会分为两轮吧。那前三个月呢不追求自制哈。

**画面**：
```
ARCHITECTURE CENTER · 2026
核验 2026.08
Palantir 企业 AI 架构
官方口径
解读性重绘
中国企业怎么学
OFFERINGS 交付形态
Gotham
Hospitals · Warp Speed · Skywise
追 alpha
可以自建自己的 offering
不是买 beta
APPLICATIONS ONTOLOGY 之上
分析与应用
Agent 与自动化
产品交付
Workshop · 对象型分析
AIP Logic · Evals
OSDK · SuperRepo
ONTOLOGY 决策内核
LANGUAGE · ENGINE · TOOLCHAIN
Ontology
对象 · 链接 · 属性 | 读写 · 事务
企业的决定，不只是数据
四维集成
人 + Agent 的共同操作面
Data · Logic · Action · Security
A
SERVICES ONTOLOGY 之下
Data
Logic
Workflow
批量 · 流式 · CDC
规则 · 优化器 · LLM
Action · 审批 · 写回
MULTIMODAL DATA PLANE
MMDP
Any Data · Any Compute · Any Model
+ Anywhere ← 常被漏掉的第四个词
APOLLO 持续交付
Apollo
发布 · 升级 · 监控 · 回滚 · 零停机
不管 GPU
RUBIX
整套架构的底座
Rubix
硬化 · 高可用 Kubernetes · FedRAMP High
14
两轮九十天，和两个验收问题
/14
前九十天：一个决定、最小数据链、一个有人审批能写回可追踪的 Action 闭环。后九十天再加 Agent。
不追求资质哈
```

---

### 13:10
**讲解**：选一个高价值的决定，接通最小数据点。定义对象关系和状态，做出一个有人审批能写回结果可追踪的 action 闭环。那这轮验收呢，我们不看模型有多聪明，只看业务有没有真的改变。

**画面**：
```
PALANTIR 官方原图
Enterprise Operating System
AIP, Foundry, and Apollo: The Enterprise Operating System
Foundry
RAIP
Apollo
QPalantir
问供应商两句：一、模型明天换掉，业务对象、规则、动作、权限和历史还在不在？二、能不能进
我的隔离环境，升级失败能不能回滚？第一句查 Ontology 和 kLLM，第二句查 Apollo 和
Rubix。
palantir.com/docs/foundry/a/
```

---

### 13:20
**讲解**：错误能不能发现、失败能不能恢复？那后三个月呢，我们再加上 agent。按 kLLM 的这个假设介入至少两种可替换的模型。

**画面**：
```
PALANTIR 官方原图
Enterprise Operating System
AIP, Foundry, and Apollo: The Enterprise Operating System
Foundry
RAIP
Apollo
问供应商两句：一、模型明天换掉，业务对象、规则、动作、权限和历史还在不在？二、能不能进
我的隔离环境，升级失败能不能回滚？第一句查 Ontology 和 kLLM，第二句查 Apollo 和
Rubix。
com/docs/foundry/a/
按 kLLM 的这个假设
```

---

### 13: