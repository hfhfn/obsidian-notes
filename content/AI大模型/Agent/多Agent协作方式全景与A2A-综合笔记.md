---
title: 多Agent协作方式全景与A2A-综合笔记
tags:
- Agent
- 多Agent
- A2A
- Supervisor
- LangGraph
- EduAgent
created: '2026-09-04T14:10:49+08:00'
modified: '2026-09-04T14:10:49+08:00'
---

# 多 Agent 协作方式全景与 A2A · 综合笔记（08章）

> [!note] 这是 08章 的**综合笔记**（总览/枢纽）
> 第 8 章（EduAgent 把简历/问答/批改/面试四个 Agent 拧成一个系统）的全部回顾，以此篇为总入口。它回答三个宏观问题：**(1)** 多智能体有哪些协作范式？**(2)** 本章的 Orchestrator 与 Google A2A 协议如何对比、互补？**(3)** 业界现在最流行哪种、为什么？
>
> **本篇 = 提炼 + 导航**：厚度在两个子文档里，这里给定位图 + 主线 + 结论。

- **姊妹【概念侧】**：[[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]]（七种范式 + A2A 协议详解 + 业界生态）
- **姊妹【实现侧】**：[[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]]（LangGraph `create_supervisor` / 子图 / Command / Swarm 落地）
- 燕头定位图：[打开交互图](/attachments/html/%E5%A4%9AAgent%E5%8D%8F%E4%BD%9C%E6%96%B9%E5%BC%8F%E5%85%A8%E6%99%AF%E5%9B%BE.htm)

---

## 1. 多 Agent 协作的四个标尺

判断任何多 Agent 系统「长什么样」，看四个维度即可（全文标尺）：

| 维度 | 问题 | 取值例子 |
| --- | --- | --- |
| **通信方式** | Agent 之间怎么传信息？ | 进程内函数调用 / 消息总线 / 开放网络协议（A2A） |
| **编排方式** | 谁决定「下一个该谁干活」？ | 中心调度器 / 协商群聊 / 编译期图 |
| **发现方式** | A 怎么知道「该找谁」？ | 硬编码映射 / 注册表 / 动态目录（Agent Card） |
| **开放度** | 应用内 vs 跨应用？ | 同框架同进程 / 不同厂商不同框架 |

> 💡 第 8 章、A2A、以及全部七种业界范式，本质都是这四个维度上的不同取值。

---

## 2. 一张定位图看懂七种协作方式

下面是整章的「坐标系」：**横轴 = 编排重心（静态/硬编码 → 动态/协商），纵轴 = 开放度（应用内 → 跨应用）**。三个 ★ 是 8 章重点对比对象。

[打开交互图](/attachments/html/%E5%A4%9AAgent%E5%8D%8F%E4%BD%9C%E6%96%B9%E5%BC%8F%E5%85%A8%E6%99%AF%E5%9B%BE.htm)

| # | 协作方式 | 谁来调度 | 开放度 | 动态性 | 代表 |
| --- | --- | --- | --- | --- | --- |
| ① | Orchestrator / Supervisor | 中心调度器 | 应用内 | 低（多硬编码） | **第8章、** LangGraph supervisor、CrewAI |
| ② | 主 Agent + 子 Agent 池 | 一个主 Agent | 应用内 | **高**（运行时 spawn） | **Claude Code、Codex、OpenCode** |
| ③ | Swarm / Handoff（对等移交） | 对等移交 | 应用内 | 中 | OpenAI Swarm、langgraph-swarm |
| ④ | 图 / DAG 流水线 | 编译期图 | 应用内 | 低 | LangGraph、Temporal |
| ⑤ | 群聊 / 黑板 | 协商式 | 应用内 | 中 | Microsoft Agent Framework（原 AutoGen GroupChat） |
| ⑥ | 分层 Supervisor | 层级树 | 应用内 | 中 | Bedrock、LangGraph 嵌套、Claude Agent SDK |
| ⑦ | 联邦 / 开放协议 | 去中心 / 协议 | **跨应用** | 高 | **A2A + MCP** |

---

## 3. 主线对照：一个「导演」，一个「外交协议」

**本章实现 = 应用内 Orchestrator（中心化编排队，hub-and-spoke）**
- 统一入口 `unified_chat.py`（`_pre_filter` 零 Token 拦截 + `_llm_route` 判 6 类意图）+ 编排器 `orchestrator.py`（中心派活、`_run_pipeline` 串联、8 种 SSE 事件对前端分发）。
- **封闭、自包含、写死**：Pipeline 定义（`{"job_preparation":[RESUME,INTERVIEW]}`）和 label 映射表都是硬编码——高效、可控、省，但只在「这个剧组」内有效。

**A2A 协议 = 跨应用互操作协议（外交规则）**
- Google 2025-04 发起、捐给 Linux Foundation；开放 JSON-RPC 2.0（HTTP/SSE/WS）+ Agent Card 动态发现 + Task/Message/Artifact 状态机。
- **开放、标准、框架无关**，但不解决「内部怎么编排」。

**二者互补，不是二选一**：**对内**（同框架同进程）用 Orchestrator；**对外**（跨系统互操作）用 A2A。一句话——
> **MCP 管「Agent↔工具」，A2A 管「Agent↔Agent」，应用内部怎么编排是你自己的事。**

---

## 4. A2A 四概念 + 安装（速记）

| 概念 | 一句话 | 类比 |
| --- | --- | --- |
| **Agent Card** | Agent 的名片：能力清单 + 入口 + 鉴权；`/.well-known/agent.json` 发现 | 餐馆菜单 |
| **Task** | 一次任务：`id` + 状态机（submitted→working→…） | 一单外卖 |
| **Message** | 一次对话：`role` + `parts`（Text/File/Data） | 一张纸条 |
| **Artifact** | 任务产出的文件/结构化数据 | 外卖送到的东西 |

- **安装**：`pip install a2a-sdk`（官方包；**别装成 `python-a2a`**，那是第三方社区库——已在 PyPI 核实，见姊妹文档示例③）。
- **最该学会看的是 wire 协议**（JSON-RPC `message/send`）：它永不变化，是理解 A2A 的地基。

---

## 5. 业界最流行的是哪种？（结论）

> 当前最流行的是 **② 单一主 Agent + 动态子 Agent 池**——AI-Coding（Claude Code / Codex / OpenCode）用实践证明了它是「最被验证、最灵活」的形态；第 8 章的 Orchestrator 是它的「静态版」。

- **单应用内** → 主 Agent + 子 Agent 池最流行；
- **跨系统** → A2A + MCP（2025 以来确立的标准组合）；
- **框架生态** → LangGraph（当前生产足迹最大）、CrewAI、Microsoft Agent Framework。

**升华一句**：多 Agent 的最高价值不在「有多少个 Agent」，而在「有一个聪明的调度者，能动态地、按需地把活分给一批临时子 Agent」。

---

## 6. 给 EduAgent 的三档演进建议

1. **今天（第8章已够）**：应用内四 Agent + Orchestrator + 一条硬编码 `job_preparation` Pipeline。→ 功能确定、Agent 少、一个后端。
2. **明天（动态化）**：把硬编码 Pipeline 升级为「主 Agent 动态编排」（运行时决定子 Agent 组成与顺序），新增能力不用改 `_pipelines`。→ Agent 增多、需求多变。
3. **后天（对外开放）**：用 A2A + MCP 把每个能力（简历审查/模拟面试/QA 问答）发成 Agent Card，实现跨系统互操作。→ 平台化、生态化。

---

## 章节回顾

- **四标尺**：通信 / 编排 / 发现 / 开放度——一切协作范式都是这四个维度上的取值。
- **第 8 章 = 应用内 Orchestrator**：封闭、自包含、写死；但又对又务实，适合教学与中小系统。
- **A2A = 跨应用互操作协议**：Agent Card 动态发现 + JSON-RPC 状态机；与 MCP 互补（MCP 管 Agent↔Tool，A2A 管 Agent↔Agent）。
- **七种范式**：Orchestrator / 主Agent+子Agent池 / Handoff / 图DAG / 群聊黑板 / 分层Supervisor / 联邦开放协议。
- **最流行 = 主 Agent + 子 Agent 池**：AI-Coding 用实践验证；第 8 章是它的静态版。

## 子文档导航（本篇的两个「深度文档」）

- ➡️ 想看**七种范式逐类详解 + A2A 协议代码 + 业界生态** → [[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]]
- ➡️ 想看**用 LangGraph 原生 Supervisor / 子图 / Command / Swarm 落地同一套业务** → [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]]

## 相关笔记

- [[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]] — 概念侧子文档
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — 实现侧子文档
- [[AI大模型/Agent/多Agent协作系统面试与架构解析|多Agent协作系统面试与架构解析]] — 面试向的多 Agent 落地
- [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]] — 同书第 6 章 HITL 拆解