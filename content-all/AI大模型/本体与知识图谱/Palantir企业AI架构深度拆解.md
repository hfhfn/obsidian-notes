---
title: Palantir 企业 AI 架构深度拆解（Foundry · Ontology · AIP）
tags:
- Palantir
- Ontology
- Foundry
- AIP
- 企业AI
- FDE
- 架构
status: 已消化
source: Palantir-Foundry-AIP-深度拆解.pdf（13页）+ Palantir企业AI架构-分享版.pdf（18页）
created: 2026-10-21
modified: '2026-10-21T15:25:03+08:00'
---

# 🏛️ Palantir 企业 AI 架构深度拆解（Foundry · Ontology · AIP）

> [!abstract] 一句话总结
> Palantir 卖的不是模型或 API，而是一整套**让 AI 在企业里安全落地的操作系统**：Apollo 托住交付底座，Foundry 负责数据与 Ontology，AIP 把模型接到受控的业务动作上。真正值钱的不是产品名，而是它**从业务决定出发、用 Ontology 定义可执行契约、再写回业务系统**的顺序。

> [!info] 原始素材
> - 原版 PDF 已归档：
>   - [打开 PDF](/attachments/pdf/Palantir-Foundry-AIP-%E6%B7%B1%E5%BA%A6%E6%8B%86%E8%A7%A3.pdf)（13 页 · 3000AI / Tricia · Series 03）
>   - [打开 PDF](/attachments/pdf/Palantir%E4%BC%81%E4%B8%9AAI%E6%9E%B6%E6%9E%84-%E5%88%86%E4%BA%AB%E7%89%88.pdf)（18 页 · 心晴九天 · 2026.08 · 中国企业的落地顺序）
> - 本主题总纲：[[AI大模型/本体与知识图谱/本体 Ontology 全景（概念·标准·构建·落地）|本体 Ontology 全景（概念·标准·构建·落地）]]

> [!note] 两篇 PDF 的分工
> - **Series 03（13 页）** 拆「引擎盖下」：产品结构、Ontology 怎么建、Action Type、OAG、Workshop / Chatbot、前 FDE 的大实话。
> - **分享版（18 页）** 拆「中国企业怎么学」：官方架构的南北分层、从业务决定出发的 8 步落地、两轮 90 天。
> 本笔记把两者合并为「结构 → 机制 → 落地 → 批判」一条线。

---

## 一、先看结构，不要先背产品名

Palantir 的当前架构不是「四个平台平行摆放」。AIP 和 Foundry 共享能力网格，Ontology 位于决策中间层，Apollo 托住软件交付。

```
┌────────────────────── 业务结果层 · NORTH OF ONTOLOGY ──────────────────────┐
│ 分析与应用            Agents 与自动化            产品交付                  │
│ Workshop · Gotham     AIP Logic · Evals          行业产品 · SDK            │
├──────────────────────────── Ontology（决策内核）───────────────────────────┤
│ NOUNS 对象/关系      LOGIC 规则/模型      VERBS Actions/工作流   POLICY 权限/审计 │
│            —— 人和 Agent 的共同操作面 ——                                  │
├──────────────────── 能力服务层 · SOUTH OF ONTOLOGY ───────────────────────┤
│ Data Services（批量/流式/CDC/虚拟表/血缘）                                  │
│ Logic Services（规则/优化器/ML·LLM Functions）                              │
│ Workflow Services（事件/定时/API/审批/写回）                                │
├───────────────────────────────────────────────────────────────────────────┤
│ Apollo：发布、升级、监控、回滚；覆盖云 / 本地 / 边缘 / 气隙环境              │
│ MMDP：Any Data · Any Compute · Any Model；连接既有系统，不重做一遍           │
│ Infra / IT                                                                │
└───────────────────────────────────────────────────────────────────────────┘
```

### 三层产品的关系

| 层 | 角色 | 关键组件 | 一句话 |
|---|---|---|---|
| **AIP** | AI 层，依附 Foundry | AIP Logic / Chatbot / Assist / Agent Studio | LLM 永远不直接碰数据和工具，只通过 Ontology 的 Action Type 操作业务 |
| **Foundry** | 数据操作系统 + Ontology | Data Connection / Pipeline Builder / Ontology Manager / Workshop / Quiver | 数据接入、清洗、建模、Ontology 构建、权限、应用开发都在这一层 |
| **Apollo** | 部署 / CI-CD 底座 | 发布、升级、监控、回滚、气隙部署 | **管软件，不管 GPU**；支持完全离线网络是它能做国防/情报客户的技术前提 |

> [!quote] Palantir 内部工程文档
> AIP sits on top of Foundry, which sits on top of Apollo. You cannot have AIP without Foundry. You cannot have Foundry without Apollo. This is a full operating system, not a feature.

### 官方架构的 9 组能力 / 6 个横向类别

2026 Palantir Architecture Center 的官方口径是 **9 组能力、6 个横向类别**，Apollo 位于底部：

- **9 组能力**：Data Services、Logic Services、Workflow Services、Ontology Language、Ontology Engine、Ontology Toolchain、Analytics、Agents & Automations、Product Delivery
- **6 个横向类别**：Data、Logic、Workflow、Services、Analytics & Automations、Product Delivery
- **更底层**：Rubix（硬化的高可用 K8s 底座）、MMDP（Any Data / Any Compute / Any Model）

> [!tip] 看图顺序
> 先看 **North / Ontology / South** 三段，再看 Apollo 和 MMDP 两条底座。只记 Gotham、Foundry、AIP、Apollo 四个名字，会把依赖关系看反。

---

## 二、Foundry：数据操作系统 + Ontology

Foundry 是 Palantir 的核心。把它理解为「企业级数据操作系统」——数据接入、清洗、建模、Ontology 构建、权限管理、应用开发都在这一层完成。

**Ontology 不是数据库**，而是一层覆盖在所有数据源之上的「业务语义层」。每个 Object Type 都有属性、关系、动作的严格定义。

### 建 Object Type 的四步向导

| 步骤 | 做什么 | 要点 |
|---|---|---|
| ① 选数据源 | 选择底层数据集作为 Object Type 的数据来源 | 支持 CSV、Parquet、数据库直连、API；一个 Object Type 可关联多个数据集，**物理分散、逻辑统一** |
| ② 填元数据 | 填名称、描述、所属领域（Domain） | 定义「业务含义」；好的元数据是可搜索、可治理的前提，Foundry **强制要求** |
| ③ 映射属性 | 把数据列映射为 Property | 可做类型转换、字段重命名、计算派生属性 |
| ④ 设主键 | 为 Object Type 设置 Primary Key | 系统校验唯一性；主键设好后才能被其他 Object Type 引用，建立 Link Type |

### Object Type 长什么样

```
OBJECT TYPE  Customer
  customer_id   string   PK
  name          string
  region        string
  tier          enum [Gold, Silver, Bronze]
  orders        Order[]  LINK
  upgrade_tier  Action
```

### 传统数据表 vs Ontology Object Type

| 维度 | 数据表 | Object Type |
|---|---|---|
| **语义** | 列名是代号，含义靠猜 | 每个属性有业务定义 |
| **关系** | JOIN 写在 SQL 里，隐式 | Link Type 显式声明 |
| **操作** | 任何 SQL 都能跑 | 只有 Action Type 定义的操作 |
| **权限** | 表级或行级 | 对象级 + 属性级 + 操作级 |
| **版本** | 靠 migration 脚本 | 内置版本控制和审计 |

> [!important] 不是「另一层语义标签」
> 对象只是起点。还要定义对象之间的关系、状态怎么变化、什么规则参与计算、谁能执行哪一个 Action，以及结果如何记录。**没有 Verbs 和 Policy，就只是另一层语义标签。**

---

## 三、Action Type：Palantir 安全模型的基石

LLM 不能「自由发挥」，只能调用预定义好的操作。Action Type 是整套安全模型的关键。

### 五步配置

| 步骤 | 内容 |
|---|---|
| ① 选操作类型 | 创建、修改、删除、自定义逻辑；不同操作对应不同安全等级和审批流（创建最宽、删除最严） |
| ② 定义参数 | 每个输入参数预定义类型、是否必填、取值范围。例如「修改客户等级」只能传 `target_tier: enum` |
| ③ 设前置条件 | Precondition：什么情况下可执行。例如客户近 12 个月消费超过 10 万，才允许升级到 Gold Tier；条件不满足直接拦截 |
| ④ 配权限 | 谁能触发：人类用户、特定 Agent、自动化流程；可精细到「只有华北区经理能批准华北客户的等级升级」（Role-Based + Object-Scoped） |
| ⑤ 加 Side Effects | 执行后的联动：发通知、更新 CRM、触发下游工作流；Side Effects 也预定义，不是 LLM 即兴发挥 |

### 安全模型对比

| 传统模式 | Palantir 模式 |
|---|---|
| AI 自由操作 | 只有预定义的门存在 |
| 操作后审核 | 其他地方全是墙 |
| 出事了再回滚 | 每扇门都有锁和日志 |
| 先进门，后装摄像头 | 建筑设计阶段就定好通道 |

> [!quote] Palantir AIP 文档
> Action Types on the Ontology.

### Ontology 的四维与三层

| 维度 | 内容 |
|---|---|
| **Data** | 数据源与对象属性 |
| **Logic** | 规则、模型、函数 |
| **Action** | 可执行的操作与工作流 |
| **Security** | 权限、审批、审计 |

| 三层 | 内容 |
|---|---|
| **Language** | 用什么表达对象、关系、动作 |
| **Engine** | 如何执行、推理、计算 |
| **Toolchain** | 如何开发、版本化、发布 |

| 三种状态 | 含义 |
|---|---|
| **Semantic（语义）** | 世界有什么、怎么定义 |
| **Kinetic（动能）** | 动作内嵌为本体的一部分，不是外挂 |
| **Dynamic（动态）** | 状态变化、写回、闭环 |

---

## 四、OAG vs RAG：Palantir 为什么不走 RAG

Palantir 选择了 **OAG（Ontology-Augmented Generation）**，差异不只是技术路径，而是哲学。

| RAG | OAG |
|---|---|
| 文档 | Ontology |
| 切块（Chunking） | 定位业务对象 |
| 向量搜索 | 带定义 / 口径 / 权限 |
| 拼给模型 | 结构化上下文 |
| 生成回答 | 精确回答 + 可审计 |
| 非结构化 / 无权限 / 难审计 | 结构化 / 精确 / 可审计 |

> [!example] 同一个问题
> **问：Q3 华北家电渠道毛利率是多少？**
>
> **RAG 回答**：搜到三份包含「毛利率」的文档；两份口径不同（含/不含退货）；取了置信度最高的 chunk；结果可能是过期数据。
>
> **OAG 回答**：定位 Object：华北 · 家电 · Q3；口径：含退货、含促销折让；数据源：ERP + CRM 实时；结果：42.3%，↓3.1pp YoY。

> [!important] OAG 的隐藏能力
> 不只查数据，还能调**确定性工具**。Ontology 里的 Action Type 可以触发优化器、计算器、审批流——这是 RAG 做不到的。

> [!caution] 别把 OAG 当万能药
> OAG > RAG 的前提是**你已经有结构化语义**。如果业务知识还是一堆非结构化文档，先做结构化；如果你的场景本来就是开放域问答，RAG 仍然合理。两者不是替代关系，而是不同前提下的选择。

---

## 五、应用层：Workshop + AIP Chatbot

Ontology 建好了，谁来消费它？

### Workshop：Ontology 的消费层

```
Workshop（拖拽式应用构建器）
   ↓ 消费
Ontology（Object Types + Link Types + Action Types）
   ↓ 连接
Data（ERP / CRM / IoT / 第三方 API）
```

- 不写代码：业务人员把 Object Type 的属性拖到仪表盘，把 Action Type 绑到按钮
- **Ontology 变了，Workshop 应用自动更新**——因为引用的是语义层，不是底层表

### AIP Chatbot Studio：三要素

| 要素 | 作用 |
|---|---|
| **Context Sources** | 选哪些 Object Type 作为上下文；LLM 只能「看到」你选定的对象，看不到的就等于不存在 |
| **Tools** | 绑定哪些 Action Type 给 Chatbot；可调用的操作 = 可开的门 |
| **Model** | 选用哪个 LLM 后端；Palantir 不绑模型，GPT-4o、Claude、Llama 都行，模型是可替换的零件 |

> [!quote] 「透明窗户」比喻
> AIP Chatbot 是一扇透明的窗户，不是一道打开的门。用户能看到 Ontology 的信息，能通过 Action Type 做操作——但看到什么、能操作什么，全由配置决定，不由模型决定。

---

## 六、中国企业的落地顺序：从业务决定出发（8 步）

这部分来自「Palantir 企业 AI 架构 · 中国 playbook」，是把官方架构翻译成可执行顺序。

### 8 步与交付物

| # | 步骤 | 交付物 |
|---|---|---|
| 01 | **先看结构，不要先背产品名** | 一张图：业务应用、决策内核、能力服务、交付底座、横向治理 |
| 02 | **从一个业务决定开始** | 一个决策、一个业务负责人、一个损失指标、一个可执行动作 |
| 03 | **只接这一条决定需要的数据** | 一条最小数据链；不是新建一座没人敢用的数据湖 |
| 04 | **Ontology 建的不是词典，是决定** | 对象、关系、状态机、Function、Action、权限和审计 |
| 05 | **大模型最后接** | 模型网关、受控工具、测试集、轨迹、成本与效果监控 |
| 06 | **动作必须能写回，失败必须能对账** | Action Type、审批、幂等键、回执、补偿和决策历史 |
| 07 | **Apollo 管软件，不管 GPU** | 发布通道、环境策略、监控、回滚和离线/边缘运行方案 |
| 08 | **中国企业分两轮九十天做** | 前 90 天跑通一个有人审批的垂直闭环；后 90 天再接 Agent、评测、模型替换和部署治理 |

> [!example] 第 02 步的例子
> 不要先建「企业级 AI 中台」。选一个每天都在发生、结果可以衡量、动作能够写回系统的决定：
> **未来七天哪些订单会因缺料停线？谁可以调拨库存或批准加急采购？**

### 两轮 90 天

| 阶段 | 目标 | 验收 |
|---|---|---|
| **前 90 天** | 选一个高价值决定 → 接最小数据 → 定义对象/关系/状态 → 做出一个有人审批、能写回、结果可追踪的 **Action 闭环** | 不看模型多聪明，只看业务有没有真的改变 |
| **后 90 天** | 再加 Agent，按 K-LLM 假设接入至少两种可替换模型 | 能写回、能追责、能换模型，再复制到第二个决定 |

> [!tip] 与「第 12 集」的关系
> 落地顺序、K-LLM、Read-Write Loop 的更细讲解见已归档的 [[归档/本体-Ontology源笔记/第12集 - 中国企业怎么学 Palantir 落地 AI？|第12集 - 中国企业怎么学 Palantir 落地 AI]]；本笔记补充的是产品内部机制与中国 playbook 的 8 步交付物。

---

## 七、前 FDE 的三个大实话

FDE = Forward Deployed Engineer，Palantir 派驻客户现场的工程师。这部分是公开资料与前 FDE 分享，作者与 Palantir 无利益关系。

| # | 真相 | 含义 |
|---|---|---|
| 01 | **极其昂贵，很多项目失败** | 合同动辄千万美金起，但高价不保证成功。很多客户买了 Foundry 才发现：自己的数据治理根本没到能用 Ontology 的程度。FDE 的存在就是为了弥补这个 gap——交付极度依赖人，不是纯产品驱动 |
| 02 | **大量重复浪费** | 每个客户的 Ontology 都从零建。医药行业 A 公司建了一套药品 Object Type，B 公司到了再建一遍。行业知识没有跨客户复用机制——这是定制化高客单价与边际成本降不下来的内在矛盾 |
| 03 | **产品是踩坑提炼出来的** | Foundry 的很多最佳实践不是产品团队设计的，是 FDE 在客户现场踩了无数坑后抽象出来的。Action Type 的安全模型、Ontology 的版本控制、Workshop 的构建范式，全是血泪经验。护城河不只是代码，而是 20 年积累的「企业数据怎么治理」的 know-how |

> [!quote] Alex Karp 对大模型公司 FDE 模式的批评
> 大模型公司组建 FDE 团队深入企业一线，表面帮客户找场景，实际是找高消耗场景来锁死迁移成本。服务行业必须 vendor agnostic。大模型厂商搞咨询，就像药厂自己组建医生团队——医生卖药，商业伦理天然矛盾。

---

## 八、四个可执行 Takeaway

| # | Takeaway | 解释 |
|---|---|---|
| 01 | **先治数据，再谈 Ontology** | Palantir 项目失败率高的核心原因：客户数据质量不到位。先确保核心业务数据是干净的、有唯一主键的、有明确 owner 的 |
| 02 | **Action Type 思维比 Ontology 更紧迫** | 大多数企业最缺的不是知识图谱，而是「AI 能干什么」的边界定义。先定义 10 个最高频的业务操作，把参数、前置条件、权限想清楚 |
| 03 | **OAG > RAG，前提是你有结构化语义** | 如果业务知识已经结构化（哪怕 Excel + 数据字典），就不要走 RAG 的弯路。把它建成 Object Type，带上口径和权限，效果远超向量搜索 + chunk 拼接 |
| 04 | **模型可换，语义层不可换** | Palantir 不绑模型，GPT / Claude / Llama 随时切换。模型是消耗品，语义层才是资产 |

### 两个常见误解

| 误解 | 正解 |
|---|---|
| Ontology = 知识图谱 | Ontology = 可以运行的业务契约（含动作、权限、写回） |
| Apollo = 算力 / 模型调度 | Apollo = 软件持续交付（发布、升级、监控、回滚，**不管 GPU**） |

> [!question] 自测：这套企业 AI 是否真正属于你？
> **如果明天更换大模型，业务对象、规则、动作、权限和历史还能不能留下？**
> 如果不能，可能只是一个更贵的 Demo。
>
> 配套两问：① 模型明天换掉，对象/规则/动作/权限/历史还在不在？② 能不能进我的隔离环境、升级失败能不能回滚？

---

## 九、速查表

| 术语 | 含义 | 一句话 |
|---|---|---|
| **Foundry** | 数据操作系统 + Ontology | 数据、建模、语义、权限、应用的底座 |
| **AIP** | Foundry 的 AI 扩展层 | LLM 通过 Action Type 操作业务，不直接碰数据 |
| **Apollo** | 软件持续交付平台 | 发布、升级、监控、回滚；支持气隙网络，不管 GPU |
| **Object Type** | 业务对象类型 | 有属性、主键、关系、动作的「活的表」 |
| **Link Type** | 对象关系 | 显式声明方向、基数、时间窗口 |
| **Action Type** | 受控操作 | 参数 + 前置条件 + 权限 + Side Effects，LLM 只能走门 |
| **OAG** | Ontology-Augmented Generation | 用结构化语义定位对象，而非向量搜 chunk |
| **Kinetic** | 本体的动能 | 动作内嵌为本体的一部分，不是外挂 |
| **K-LLM** | 多模型协作 | 一个决定同时调用规则、预测模型、优化器、LLM，随时可替换 |
| **FDE** | Forward Deployed Engineer | 派驻客户现场的工程师，既是交付也是踩坑来源 |
| **MMDP** | Multimodal Data Plane | Any Data / Any Compute / Any Model，连接既有系统 |
| **Rubix** | 硬化 K8s 底座 | 高可用、合规、可部署到受限环境 |

---

## 📚 相关笔记

- [[AI大模型/本体与知识图谱/本体 Ontology 全景（概念·标准·构建·落地）|本体 Ontology 全景（概念·标准·构建·落地）]] — 本主题总纲（概念、标准、构建方法、Oxygen 案例）
- [[AI大模型/本体与知识图谱/本体论落地实践-从数据中台到智能中台|本体论落地实践：从数据中台到智能中台]] — 语义层 / 工具层 / 记忆层，中国企业的最小升级路径
- [[AI大模型/本体与知识图谱/本体建模自检清单|本体建模自检清单]] — 上线前的检查项，可与本文的 Action Type 五步配置配合使用
- [[AI大模型/本体与知识图谱/AI数据价值重估-Trace-Eval-Governance|AI 数据价值重估：Trace · Eval · Governance]] — 上线后的轨迹、评测与治理
- [[归档/本体-Ontology源笔记/第12集 - 中国企业怎么学 Palantir 落地 AI？|第12集 - 中国企业怎么学 Palantir 落地 AI]] — 已归档的落地顺序详解
- [[归档/本体-Ontology源笔记/拆解 Oxygen 本体落地架构，打通 TBox-ABox 核心概念，详解 ItemTunnel 数据总线工业价值|拆解 Oxygen 本体落地架构]] — 京东 Oxygen 的三层架构对照

## 来源与边界

- 原版 PDF：[打开 PDF](/attachments/pdf/Palantir-Foundry-AIP-%E6%B7%B1%E5%BA%A6%E6%8B%86%E8%A7%A3.pdf)、[打开 PDF](/attachments/pdf/Palantir%E4%BC%81%E4%B8%9AAI%E6%9E%B6%E6%9E%84-%E5%88%86%E4%BA%AB%E7%89%88.pdf)
- 官方资料：palantir.com/docs/foundry/architecture-center（Platforms / Ontology System / AIP Architecture / Multimodal Data Plane）、Apollo Core Concepts、Palantir 2025 Form 10-K
- **阅读边界**：中文架构图是基于官方资料的解释性重绘，不是 Palantir 官方原图；制造业缺料案例与两轮 90 天是面向中国企业的实施建议，不是 Palantir 客户成绩或官方交付承诺。
