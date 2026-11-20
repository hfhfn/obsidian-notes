---
tags:
- 面试题
- AI大模型
- Agent
- 精简版
created: 2026-05-16
version: 2026-lite
modified: '2026-10-17T11:44:59+08:00'
---

# 大模型面试题 - Agent 篇（2026 精简版）

> 📌 本文档为 **精简答案版**：每题 100-200 字，重点结论 + 对比表格，**无代码**。
> 📖 需要完整代码示例与深度论证请见 [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-带答案|大模型面试题-Agent-2026版-带答案]]。
> 📁 旧版（2024）资料已归档至 [[index|index]]。

## 目录

- [[#一、Agent 基础与核心架构（8 题）|一、Agent 基础与核心架构]]
- [[#二、记忆系统与上下文管理（7 题）|二、记忆系统与上下文管理]]
- [[#三、工具使用与协议标准（10 题）|三、工具使用与协议标准]]
- [[#四、Agent 框架与现代产品（10 题）|四、Agent 框架与现代产品]]
- [[#五、Computer Use 与 Browser Use（5 题）|五、Computer Use 与 Browser Use]]
- [[#六、推理增强与高级 RAG（8 题）|六、推理增强与高级 RAG]]
- [[#七、多智能体系统（8 题）|七、多智能体系统]]
- [[#八、Agent 训练与评测（7 题）|八、Agent 训练与评测]]
- [[#九、安全、伦理与隐私（7 题）|九、安全、伦理与隐私]]
- [[#十、部署运维与未来展望（10 题）|十、部署运维与未来展望]]

---

## 一、Agent 基础与核心架构（8 题）

### 1. 什么是 LLM Agent？与传统程序、传统 AI 系统的核心区别？

**LLM Agent**：以大语言模型为大脑，能感知、推理、规划、使用工具、执行动作并基于反馈调整的自主系统。

| 维度 | 传统程序 | 传统 AI | LLM Agent |
|---|---|---|---|
| 行为方式 | 硬编码 if-else | 单一任务模型 | 通用自然语言推理 |
| 自主性 | 无 | 弱 | 强（自主分解、调用工具）|
| 适应性 | 改代码 | 重训模型 | 改 prompt / 加工具 |
| 输入输出 | 结构化 | 任务特定 | 自然语言 + 多模态 |

核心特征：**目标驱动 + 多步推理 + 工具调用 + 反馈循环**。

---

### 2. Agent 的核心架构：感知-记忆-推理-工具-执行-反馈 6 大模块。

- **感知**：接收用户输入（文本/语音/图像）并理解意图
- **记忆**：分短期（对话历史/scratchpad）和长期（向量库/知识图谱/事实记忆）
- **推理**：LLM 大脑做规划、决策、思考链（CoT/ToT）
- **工具**：Function Calling、API、代码解释器、检索器
- **执行**：把模型输出落地为实际副作用（调 API、改文件、点击 UI）
- **反馈**：观察执行结果，写回记忆，影响下一步决策

6 模块通过 **Observe → Think → Act → Reflect** 循环串起来，是 ReAct/AutoGPT/Manus 等 Agent 的通用骨架。

---

### 3. PEAS 框架与 Agent 工作场景定义。

**PEAS** = Performance（绩效）/ Environment（环境）/ Actuators（执行器）/ Sensors（传感器），来自 Russell & Norvig 经典 AI 教材，用于刻画一个 Agent 的工作场景。

举例：电商客服 Agent
- P：一次解决率、平均响应时间、用户满意度
- E：在线对话窗口 + 订单数据库 + 商品库
- A：发消息、调用退款 API、转人工
- S：用户文本、订单状态、知识库检索

价值：设计 Agent 前先明确 PEAS，能避免做出"全能但没场景"的玩具。

---

### 4. ReAct 框架与 Thought-Action-Observation 循环。

**ReAct（Reasoning + Acting）** 由 Yao 等 2022 提出。让 LLM **交替输出推理与动作**：

```
Thought（我应该先查订单状态）→ Action（call get_order_status）
→ Observation（订单已发货）→ Thought（用户问的是物流，应再查物流）
→ Action ... 直到 Final Answer。
```

优势：推理过程显式可观察、错误可追溯；模型可基于工具结果纠正方向。
局限：步数增多易出错累积；纯文本 trace 长，token 成本高。
现状：仍是 Agent 最广泛的基线范式，被 LangChain/LangGraph/AutoGen 默认采用。

---

### 5. CoT、Self-Consistency、ToT、Graph of Thoughts 的本质差异。

| 方法 | 思考结构 | 关键思想 |
|---|---|---|
| CoT | 单条链 | 一步步推理，输出中间过程 |
| Self-Consistency | 多条链并行 | 采样 N 条 CoT，多数投票选答案 |
| ToT（Tree of Thoughts） | 树 | 每步分支多种思路，BFS/DFS 搜索 |
| GoT（Graph of Thoughts） | 图 | 思路节点可合并、回溯，支持复杂依赖 |

适用：简单任务 CoT；数学题 Self-Consistency；规划/解谜 ToT；复杂跨子问题协同 GoT。代价依次递增。

---

### 6. Plan-and-Execute vs ReAct：什么场景用哪个。

**ReAct**：每步走一步看一步，思考与动作交替。适合**短任务、环境多变**。
**Plan-and-Execute**：先一次性生成完整计划（Planner），再逐项执行（Executor），过程中视需要重规划。适合**长任务、步骤可预测**。

| 维度       | ReAct   | Plan-and-Execute |
| -------- | ------- | ---------------- |
| 响应速度     | 快       | 首步慢，但后续可并行       |
| 错误恢复     | 强（每步可纠） | 中（需触发重规划）        |
| Token 成本 | 中高      | 低（计划只算一次）        |
| 适用       | 客服、搜索   | 编程、报告、研究         |

实践常用混合：先 plan，再每步局部 ReAct。

---

### 7. Function Calling / Tool Use 机制详解。

完整流程：
1. 向模型声明可用工具（JSON Schema：name/description/parameters）
2. 模型读到用户查询后，判断要不要用工具，若是则输出结构化 `tool_call`（含工具名 + 参数 JSON）
3. Agent 框架拦截 `tool_call`，真正执行（调 API 或本地函数）
4. 把结果以 `tool_result` 消息回填给模型
5. 模型基于结果继续生成最终回答，或发起新一轮工具调用

关键细节：`tool_call_id` 一一对应；schema 描述清晰决定选择准确率；OpenAI 和 Anthropic 格式略有差异，但理念一致。

---

### 8. LLM Agent 的局限性与对应应对策略。

| 局限              | 应对                              |
| --------------- | ------------------------------- |
| 幻觉（编造工具/API/事实） | RAG + 工具白名单 + 输出校验              |
| 长任务遗忘           | 外置记忆 / 计划文件 / Checkpoint        |
| 错误累积            | Reflexion 反思 / 关键节点 HITL        |
| 成本与延迟高          | 小模型路由 / 缓存 / Speculative        |
| 安全风险（越权/注入）     | 沙箱 + 权限隔离 + Prompt Injection 防御 |

核心心法：**外置一切**（记忆、规划、状态），让 LLM 只做"灵感引擎"，工程框架兜底。

---

## 二、记忆系统与上下文管理（7 题）

### 9. 短期记忆 vs 长期记忆。

- **短期**：当前对话上下文（messages、scratchpad），存活一个 session，受 context window 限制。实现：直接拼到 prompt / 滑动窗口 / 摘要压缩。
- **长期**：跨 session 持久化的事实、偏好、历史交互。实现：向量数据库（FAISS/Chroma/PGVector）、知识图谱、关系数据库。

| 维度 | 短期 | 长期 |
|---|---|---|
| 容量 | KB 级 | 无上限 |
| 检索 | O(1)，直接读 | 需 embedding 检索 |
| 更新 | 即时 | 异步写入 |
| 典型用法 | 当前任务上下文 | 用户画像、知识库 |

---

### 10. 基于向量数据库的 RAG 长期记忆架构。

链路：**文本切块 → embedding → 向量入库 → 查询时检索 top-k → 重排（rerank）→ 注入 prompt → LLM 生成**。

关键设计点：
- **切块策略**：定长 / 语义 / 标题层级
- **embedding 模型**：bge-large、OpenAI text-embedding-3、Cohere
- **重排器**：bge-reranker、Cohere Rerank（Cross-Encoder，准但慢）
- **混合检索**：BM25 + 向量，关键词 + 语义互补
- **元数据过滤**：按用户 ID、时间窗口隔离

进阶：自适应检索（Self-RAG/CRAG）决定何时查、查回来对不对。

---

### 11. MemGPT / Letta：操作系统式分层记忆架构。

灵感来自 OS 虚拟内存：把 context window 当 RAM，外部存储当 disk。

四级层次：
1. **System instructions**（常驻）
2. **Working context**（当前任务的核心事实）
3. **FIFO message queue**（最近对话）
4. **Archival storage / Recall storage**（向量库长期）

LLM 通过 **function call** 主动把"重要事实"写到 archival，或把不再相关的内容 evict。突破方式：不是把所有历史塞进 prompt，而是让模型自己**分页**进出。

Letta（前 MemGPT）已演化为通用 Stateful Agent 平台，提供记忆服务 + Agent 部署。

---

### 12. Mem0、Zep：现代 Agent 记忆框架对比。

| 框架 | 核心思想 | 特点 |
|---|---|---|
| Mem0 | 增量式事实记忆 | LLM 提取关键事实 → 向量库 + 图存储 → 检索时多源融合 |
| Zep | 时序图谱 | 知识图谱 + 时间维度，自动抽实体/关系 |
| LangMem | LangChain 系记忆 | 多策略：semantic / episodic / procedural |
| MemGPT/Letta | OS 分层 | 模型主动 page in/out |

共同点：都从"对话历史朴素堆栈"演化为"结构化、可索引、可压缩"的记忆，关注**事实级别**而非消息级别，便于跨会话复用。

---

### 13. 长对话上下文污染与时间衰减注意力。

**污染问题**：长上下文中混入了过时事实、用户改口的旧需求、模型自己产生的错误中间结论，会干扰当前决策。

**应对手段**：
- **时间衰减权重**：检索打分 = α·recency + β·importance + γ·relevance，旧记忆自然衰减（斯坦福小镇方案）
- **滚动摘要**：每 N 轮把更早内容摘要成短句替换
- **显式失效**：用户改口后标记"已废弃"
- **分段隔离**：把任务切片，新片段不带入旧片段的中间错误

核心是把"全量历史"转化为"高质量的、当前相关的"上下文。

---

### 14. 用户指代消解："和上次一样"如何理解。

需要长期记忆 + 实体链接：
1. **解析意图**：识别"和上次一样"是引用历史
2. **限定范围**：上次是哪个时间？哪个任务？
3. **检索具体值**：从长期记忆找到"上次"对应的参数（如"上次的咖啡=美式中杯"）
4. **二次确认**：若候选多于一个，反问澄清
5. **写回**：本次成功后更新偏好

实现上常用：用户画像表 + 最近 N 次任务摘要 + 实体 slot tracking。腾讯客服实战会做"用户最近 3 单"短期缓存优先匹配。

---

### 15. KV Cache 优化、跨请求复用、投机解码。

**KV Cache**：Transformer 自回归推理中，把过去 token 的 Key/Value 向量缓存，避免每生成一个 token 重算前文。

**跨请求复用（Prefix Caching）**：相同前缀（系统 prompt + few-shot）的 KV 复用，命中可降 50-90% 成本和延迟。vLLM、SGLang、Anthropic Prompt Caching 都支持。

**投机解码（Speculative Decoding）**：小模型快速猜测多个 token，大模型一次验证多个，命中即跳过自回归步。典型加速 2-3 倍。

Agent 场景里 ReAct 模板高度相似，受益巨大。系统 prompt 长固定时务必开 Prefix Cache。

---

## 三、工具使用与协议标准（10 题）

### 16. 动态 API 调用与 Function Calling 实现。

完整链路：**定义 JSON Schema → 注册到模型 → 模型生成 tool_call → 框架执行 → 结果回填 → 模型继续生成**。

设计要点：
- 工具描述清晰、含使用条件与反例
- 参数有默认值与示例
- 失败需返回结构化错误（不要 raise），让模型自己决定重试还是换工具
- 并行调用支持（OpenAI parallel_tool_calls / Anthropic tool_use 多个 block）

常见坑：`tool_call_id` 错位、流式输出 partial JSON 解析、参数 hallucination（编造不存在的参数）。

---

### 17. 工具路由：高召回 + 高准确率的三层漏斗设计。

工具上千时不能全塞 prompt，需漏斗筛选：

```
1000 工具 → ① 向量召回（top 50）→ ② Cross-Encoder 重排（top 10）→ ③ LLM Function Calling 精选
```

| 层 | 技术 | 延迟 | 准确率 |
|---|---|---|---|
| L1 召回 | ANN 向量检索 | <20ms | 召回 95% |
| L2 重排 | bge-reranker | 50-100ms | top-10 准 85% |
| L3 LLM | Function Calling | 500ms+ | 最终 95%+ |

辅助：冷启动池（新工具强制曝光）+ 黑名单（连续失败下线）+ 用户历史偏好加权。

---

### 18. 工具描述偏差的自适应优化闭环。

工具描述常理想化，与真实行为有差距。闭环：

**调用日志 → 偏差检测 → 自动重写 → A/B 测试 → 上线/回滚**

偏差信号：高失败率、高参数错误率、高 fallback、低用户满意度。
自动重写：用 LLM 基于"成功 vs 失败"样本反向生成更准确描述，加入实际值示例和"不适用场景"。
保护：版本号 + 7 天指标监控 + 自动回滚阈值。

---

### 19. 工具调用延迟优化：缓存、批量、预测执行、并行。

| 维度 | 技术 | 收益 |
|---|---|---|
| 缓存 | 请求级 + 语义级缓存 | 100ms → 1ms |
| 批量 | 同类调用合并 batch | n× 减少 RTT |
| 预测执行 | 在用户提问瞬间预启动高置信工具 | 隐藏延迟 |
| 并行 | 无依赖工具 asyncio.gather | n 个 ≈ 1 个时长 |

实战组合：客服 Agent 并行调 [用户信息、订单、最近会话] + 各自缓存 → 串行 1.5s 降至 300ms。

---

### 20. MCP（Model Context Protocol）协议详解。

**定义**：Anthropic 2024-11 开源的协议（modelcontextprotocol.io），用 JSON-RPC 标准化 LLM 与外部工具/数据的连接，被称"AI 应用的 USB-C"。

**架构（Host-Client-Server）**：
- Host：终端用户应用（Claude Desktop、Cursor、Cline）
- Client：与 Server 1:1 连接的转发组件
- Server：暴露能力的进程（本地 stdio 或远程 HTTP/SSE）

**三大原语**：
- Resources：可读数据
- Tools：可执行函数
- Prompts：可参数化对话模板

**生命周期**：Initialize → 能力协商 → 业务交互 → Shutdown。

**应用**：Claude Desktop 接 filesystem MCP 读写文件；Cursor 接 PostgreSQL MCP 查库。一份 Server 多家 Host 复用，告别为每个 LLM 客户端写一次集成。

---

### 21. A2A（Agent-to-Agent Protocol）协议详解。

**定义**：Google 2025-04 开源（google.github.io/A2A），让不同厂商不同框架的 Agent 互相协作；后归 Linux Foundation。

**核心概念**：
- **AgentCard**：放在 `/.well-known/agent.json` 的元数据，描述能力、技能、endpoint、认证
- **Skill**：Agent 提供的具体能力
- **Task**：跨多轮的有状态协作请求
- **Message / Artifact**：任务内消息与产出

**典型流程**：发现 AgentCard → POST tasks.send → SSE 流式推送状态（working/completed）→ 拿 Artifact。

**状态机**：submitted → working → input-required / completed / failed。
**Push Notifications**：跨小时长任务支持 webhook 异步回调。

---

### 22. MCP vs A2A：核心区别与协同。

一句话：**MCP 解决"LLM 怎么用工具"，A2A 解决"Agent 怎么找 Agent"。**

| 维度 | MCP | A2A |
|---|---|---|
| 通信对端 | 静态工具/数据 | 另一个智能 Agent |
| 关键原语 | Resources/Tools/Prompts | AgentCard/Task/Artifact |
| 状态性 | 多为短交互 | 长任务多轮状态机 |
| 适用 | 接数据库、读文件 | 多 Agent 协同、Agent Marketplace |

**协同使用**：主 Agent 用 MCP 接自己的工具，用 A2A 委派给专业 Sub-Agent；Sub-Agent 内部又用 MCP 接自己的工具。互补而非竞争。

---

### 23. AgentCard 设计与 Agent 服务发现。

AgentCard 是 Agent 的"名片"（JSON），放 `/.well-known/agent.json`，类似 `robots.txt`。

字段：name / description / url / version / provider / capabilities（streaming/push）/ authentication（bearer/oauth2）/ skills（每项含 id、描述、输入输出模式、tags）。

**发现机制（多层级）**：
- 静态配置：客户端持 URL 列表
- Registry 注册中心（如 Google Agent Garden）
- DNS-based 发现（SRV / DID）
- 自然语言发现：LLM-Powered Agent Search

设计原则：能力声明明确（避免"万能 Agent"）、认证可发现、版本化、可演化（未来加 SLA、价格、信誉）。

---

### 24. Streaming Tool Use 与 Partial JSON 解析。

为什么需要流式：用户希望"边想边输出"；长参数（如长文本生成）拼完才调工具会阻塞。

模型流式输出工具参数时，每个 chunk 是一段 partial JSON 片段（可能不完整）。

**解析方案**：
- **拼接 + 容错解析**：累积字符串，每次尝试 `jsonrepair` 类容错解析器，得到部分对象用于 UI 实时刷新
- **流式 JSON 解析器**：clarinet、ijson 逐字符 emit 事件
- **schema-aware**：知道字段顺序，每收完一个字段提前响应

典型场景：工具参数含长文本时实时展示草稿；工具调用 + 文本输出交替。

---

### 25. 并行工具调用与全局预算池设计。

模型一次返回多个 tool_calls，若无数据依赖即可并行：`asyncio.gather` + 超时取消。

**全局预算池**：

| 维度 | 控制目标 |
|---|---|
| Token | 单 Session 总 token 上限 |
| 工具调用次数 | 防死循环 |
| 金额 | 总 cost 控制 |
| 时间 | 总耗时上限 |
| 并发 | 同时调用数（防 API 限流） |

实现模式：令牌桶 + 装饰器，预算耗尽时优雅降级（部分结果 + 提示），不直接 fail。关键路径优先扣预算。

---

## 四、Agent 框架与现代产品（10 题）

### 26. LangChain 核心组件与生态全景。

**6 大组件**：Models / Prompts / Chains / Memory / Indexes（Retrievers）/ Agents。
**LCEL** 用 `|` 管道组合链。

**生态分工**：

| 项目        | 定位                     |
| --------- | ---------------------- |
| LangChain | 应用开发库（组件）              |
| LangGraph | 状态机/图工作流编排             |
| LangSmith | 调试 + 评测 + 监控 SaaS      |
| LangServe | 一键把 chain 暴露为 REST API |

何时不用：抽象过深 Debug 困难时直接用原生 SDK；RAG 重深度用 LlamaIndex；声明式编程用 DSPy。

---

### 27. LangGraph：状态机/图工作流深度实战。

为什么需要：LCEL 适合 DAG，但 Agent 需要循环、条件分支、Human-in-Loop，所以要状态机。

**核心抽象**：
- **State**：节点间共享的 TypedDict
- **Node**：state → state_update 的函数
- **Edge**：normal / conditional / END
- **Checkpointer**：持久化 state（SQLite/Postgres），支持中断恢复

**典型流程**：agent 节点 → 条件边判断（要不要调工具）→ tools 节点 → 回 agent → 直到 END。

**Checkpointer 三用途**：崩溃恢复、Human-in-the-Loop（敏感节点 interrupt）、多轮对话（thread_id 隔离）。配套 LangGraph Studio/Platform 可视化部署。

---

### 28. CrewAI：角色-任务-团队模型，与 LangGraph 区别。

CrewAI 三层：Agent（角色：role/goal/backstory/tools）+ Task（描述/期望输出/分配 Agent）+ Crew（团队，process=sequential/hierarchical）。

| 维度 | CrewAI | LangGraph |
|---|---|---|
| 抽象 | 高（角色/任务，业务语言） | 低（状态机，工程语言） |
| 学习成本 | 平 | 陡 |
| 状态持久化 | 弱 | 强 |
| 适用 | 内容生产、模拟咨询 | 客服、代码 Agent、长任务 |

选型：业务多变 → CrewAI；工程化容错 / HITL → LangGraph。

---

### 29. AutoGen：对话驱动多 Agent 框架 + GroupChat。

哲学：把多 Agent 协作建模为**对话**。Agent 通过自然语言互相发消息，框架管路由和终止。

**GroupChat 自动协商**：GroupChatManager 是特殊 Agent，每轮根据上下文选下个发言者（auto/round_robin/manual/custom）。

典型场景：Coder + Reviewer + Tester；Researcher + Strategist + Critic；Solver + Verifier 双 Agent 互检。

优势：对话即接口，加 Agent 只改 system_message；UserProxy 内置 Docker 沙箱执行代码。
劣势：协商不可控（可能死循环）、状态隐含在消息历史。

---

### 30. AutoGPT / BabyAGI 的设计思想与局限。

**AutoGPT**：高层目标 → 自分解 → Think/Plan/Criticize/Execute → 写文件 → 循环。
**BabyAGI**：Task Queue + Creation + Prioritization + Execution 四 Agent 循环。

共同思想：完全自主、向量库记忆、循环驱动。

**核心局限**：目标漂移、死循环、成本失控、错误累积、缺 HITL、工具单薄。
**为什么没生产化**：2023 模型规划能力不足；无评测体系；无状态持久化与回滚。

**遗产**：催生 LangGraph、CrewAI；"开放目标 + 自我循环"被 Manus、Devin 部分继承（但加上沙箱、HITL、评估）。

---

### 31. Anthropic Claude Code & Sub-agents 架构。

Claude Code（2025-02）：命令行 Agent，读写代码库 + 跑命令 + 调 MCP，号称"最像同事的编程 Agent"。

**Sub-agents 机制**：
- 在 `.claude/agents/*.md` 定义专用 Agent（含独立 system prompt、可用工具、模型）
- 父 Agent 用 Task 工具显式 spawn
- **独立上下文**：子 Agent 不污染父
- 支持同步/异步、可选 git worktree 隔离

价值：上下文隔离（探索大代码库不撑爆父）、专业化（reviewer/explorer 各司其职）、并行。与传统多 Agent 不同：**树形派遣**而非"对话广场"，更适合工程任务的层次分解。

---

### 32. OpenAI Swarm：轻量级多 Agent 编排。

2024-10 OpenAI 实验框架（<500 行），核心仅两个原语：**Agent + Handoff**。Agent 的函数返回**另一个 Agent 对象**= 移交，框架自动切换。

| 维度 | Swarm | LangGraph |
|---|---|---|
| 学习成本 | 极低 | 高 |
| 持久化 | 无 | Checkpointer |
| 适用 | 客服分流、Triage | 复杂工作流、长任务 |
| 生产就绪 | 实验性 | 是 |

价值：教学/原型；2025 演化为 OpenAI Agents SDK（生产化版本）。业务是"多专家 Agent 互相 handoff"时简单到飞起。

---

### 33. Manus：通用 Agent 产品的工程实现。

蝴蝶效应 2025-03 发布，号称首款"通用 Agent"，云端 VM 内自主完成开放任务。

**关键工程**：
- 每 Session 独立 VM 沙箱（Chrome + 终端 + 文件系统）
- 工具：Browser（Playwright）/ Shell / FileSystem / Code Interpreter / Vision
- **外置上下文**：长任务用工作目录 + Todo.md + Markdown 笔记持久化，避免上下文窗口耗尽
- 多模态 + DOM 双路理解 UI
- 用户可看 Agent 实时屏幕、可暂停/接管

**借鉴价值**：外置上下文（文件系统当 Working Memory）、多模态 + DOM 双路、可观察 UI 增强信任。

**局限**：成本 $1-5/任务、慢（数十分钟）、复杂任务仍频繁失败。

---

### 34. Devin / Cursor Composer：Coding Agent 范式对比。

| 维度 | Devin（Cognition 2024-03） | Cursor Composer |
|---|---|---|
| 载体 | 独立云端（Slack/Web） | IDE 内置 |
| 介入度 | 全自主 | 半自主，可观察打断 |
| 沙箱 | 远程 VM | 本地 workspace |
| 协作 | 异步 | 同步（边看边改） |
| 失败回滚 | 难 | 易（git checkout） |
| SWE-bench Verified | 30%+ | 50%+ |

**启示**：全自主 Coding Agent 仍有距离，**人机协同**当前更稳。IDE 集成胜率高（开发者愿意小步介入）；远程 Agent 适合**异步长任务**（PR 自动修复）。

---

### 35. DSPy：声明式 LLM 编程与 Prompt 自动优化。

斯坦福开源，核心理念：**写程序，不写 Prompt**。

**核心抽象**：Signature（函数签名）+ Module（Predict/CoT/ReAct）+ Teleprompter（编译器，自动选 few-shot + 改 instruction）+ Metric。

**优化原理**：跑训练样本 → 收集成功 trace → 自动挑 few-shot → 可选 LLM 改写指令（MIPROv2 算法）→ 验证集选最优。

**vs LangChain**：DSPy 框架自动生成 prompt 并基于 metric 优化；LangChain 靠人工调。

适用：有 50+ 标注样本能自动跑赢手写 prompt；复杂 pipeline 声明式更清晰；模型切换敏感时可自动重编译。2025 已支持 OpenAI Function Calling + MCP。

---

## 五、Computer Use 与 Browser Use（5 题）

### 36. Anthropic Computer Use：原理、工作流、安全。

2024-10-22 Claude 3.5 Sonnet (new) 发布，首个开放的通用 GUI 操控能力。

**工作流（Loop）**：用户给任务 → 模型请求 screenshot → 看截图后输出 tool_use（如 `left_click [x,y]`）→ 系统执行 + 新截图 → 循环直到完成。

**三类 tool**：computer（鼠键）、text_editor（文件）、bash（命令行）。坐标按 1024×768 标准分辨率推理。

**安全**：必须跑沙箱 / VM；Anthropic RLHF 训练拒绝屏幕里的 Prompt Injection；敏感操作（submit/pay/delete）需开发者拦截人工确认；操作流可观察。

局限：错误率高（OSWorld 早期 14.9%）、慢（每步 5-15 秒）、高分屏坐标偏差。

---

### 37. OpenAI Operator / Browser-Use / Playwright Agent 对比。

| 维度 | Operator | Browser-Use | Playwright Agent |
|---|---|---|---|
| 模型 | CUA（视觉） | 任意 LLM | 任意 LLM |
| 载体 | OpenAI 云浏览器 | 本地 Playwright | 本地 Playwright |
| 视觉策略 | 纯视觉 | **DOM + 视觉双路** | DOM 为主 |
| 跨网站通用 | 强 | 中 | 中 |
| 开源 | ❌ | ✅ | ✅ |

**Browser-Use 双路最值得学**：同时取截图 + 可点击 DOM 列表（含 ID），模型给出 "click element id=N" 而非坐标，稳健易调试。

选型：标准 Web → Browser-Use；跨浏览器/桌面 → Operator/Computer Use；已有 Playwright 测试 → 自包一层 LLM 决策。

---

### 38. Computer Use 的 VLA（Vision-Language-Action）链路。

VLA 源自机器人，2024-2025 扩展到 GUI Agent。链路：**截图 → Vision Encoder → 视觉 token → 多模态 LLM 推理 → 动作（含坐标）**。

**模型如何预测像素坐标**：
- 海量 (screenshot, instruction, target_pixel) 训练数据
- 输出离散网格 token 而非浮点坐标，再插值
- 多步精化（先页面区域，再按钮中心）
- OCR 锚点（"找文字 'Login' 位置"）

代表：Claude Computer Use、OpenAI CUA、UI-TARS（字节，OSWorld 24.6%）、SeeClick、CogAgent、OS-Atlas。

主要瓶颈：小图标（<30px）、滚动状态、动态内容。
演化：**Set-of-Mark prompting**（先 OCR 给可点元素打数字标签，模型选数字而非坐标）。

---

### 39. GUI Agent 安全防护：误操作、Injection、敏感操作确认。

**三大威胁**：误操作（点错按钮）、Prompt Injection（页面恶意指令）、越权（删文件/转账）。

**防御**：
- **误操作**：双步确认（hover 后 click）、页面 hash 异常检测、操作前快照可回滚
- **Injection**：信任分级（系统指令 vs 网页文本分字段）、OCR 后过滤"ignore previous" 类关键词、模型 RLHF 对齐、沙箱无 cookie/限域名
- **敏感操作**：红线动作清单（支付、发邮件、删文件、提交个人信息）→ 必须用户确认或拒绝

通用原则：**最小权限 + 默认拒绝**。Agent 拿到的应是"演示账号"级别环境，敏感操作走人审通道。

---

### 40. Browser Agent 长任务的状态管理与中断恢复。

**三层状态**：
- 浏览器：URL、cookies、localStorage（Playwright `storage_state`）
- 任务：当前 step、todo、已完成（JSON / DB）
- Agent：messages、记忆摘要（LangGraph Checkpointer）

**断点续跑要点**：
- **幂等性**：每步可重试不重复（提交订单前先查是否已存在）
- **从 last_successful_step 起**而非从头
- **快照比对**：恢复时截图与 checkpoint 比对，状态一致才继续
- **超时降级**：单步过 N 分钟自动 checkpoint + 通知用户

Manus 实战：用户关页面后 Agent 在 VM 继续跑，用户再开看到进度，可暂停/接管/改指令。本质是**外置状态**，模型上下文只放最近 1-2 步。

---

## 六、推理增强与高级 RAG（8 题）

### 41. 任务分解：链式推理 vs 外部规划器。

| 范式 | 实现 | 优 | 劣 |
|---|---|---|---|
| 链式推理 | CoT / ReAct / Plan-and-Execute | 通用、零配置 | 长任务遗忘、不保证最优 |
| 外部规划器 | LLM 翻译目标为 PDDL，交 FastDownward 求解 | 可证明最优、长任务稳定 | 需领域形式化建模、不通用 |

适用：开放域、对话 → CoT/ReAct；物流、机器人、游戏 AI → Planner。
**混合方案**：LLM 生成粗规划，planner 精化关键子图（Neuro-Symbolic）。2025 Reasoning Model 长 CoT 内化了部分 planner 能力，缩小差距但形式化领域仍以 planner 为主。

---

### 42. Reasoning Model（o1/o3/R1）作为 Agent 大脑的优劣。

**优势**：长链推理稳定、自我纠错（RL 激发"wait, let me reconsider"）、数学代码强、错误可追溯。

**挑战**：
- 延迟极高（10-60 秒/响应），不适合实时
- 成本爆炸（o1 $60/M output）
- 早期不支持 Function Calling（2025-Q2 后补齐）
- thinking 黑盒难调试

**为什么不能直接替换**：客服需 <2s 响应；简单工具调用 GPT-4o-mini 更划算；适合**关键决策节点**而非每步都用。

**推荐架构**：路由器（小模型）→ 简单查询走 mini，工具密集走 Sonnet，复杂推理走 o3/R1。

---

### 43. Thinking Budget 管理与 Reasoning Agent 成本控制。

主流 API 参数：OpenAI `reasoning_effort: low/medium/high`；Anthropic `thinking.budget_tokens: 1024-65536`；Gemini `thinking_budget`。

**控制策略**：
- **动态预算**：用小模型先评估复杂度 → 分配 simple/medium/hard 三档预算
- **多级回退**：低预算 reasoning confidence 不够 → 升级 → 仍不够 → 人工
- **缓存 reasoning**：相似查询直接复用
- **场景门控**：FAQ 关闭 thinking，路由 1K，多步规划 8K，数学/代码 32K+

经验：先用最小预算跑，监控任务成功率，逐步上调直到收益曲线变缓。

---

### 44. Self-Reflection / Reflexion：自我改进机制。

Reflexion（Shinn 2023）：用语言反馈而非 RL 更新参数。

**三组件**：Actor（生成动作）→ Evaluator（评估打分）→ Self-Reflector（生成语言反馈写入 episodic memory）→ 下轮 Actor 召回相关反思。

实验：HotpotQA / AlfWorld / HumanEval 比纯 ReAct 提升 10-30%。

**变体**：Self-Refine（单次内 generate→critique→refine）、RCI（递归批判）、Self-RAG（反思 retrieval 是否需要）。

**注意**：Reflection 增成本（每步 +1 LLM call）；长期记忆需遗忘机制防膨胀。2025 Reasoning Model 内化了反思（o1 的 "wait"），减少显式 Reflexion 必要性，但**跨轮长记忆**仍需。

---

### 45. GraphRAG：基于知识图谱的检索增强。

微软 2024 论文 + 开源。传统 RAG 擅长"局部事实"但对"主题总览"类问题（"全书核心观点"）弱。

**索引流程（离线）**：分块 → LLM 抽实体/关系 → 知识图谱 → Leiden 社区检测 → LLM 为每个社区生成摘要（多层级）。

**查询模式**：
- Local Search：具体事实，类似传统 RAG + 邻居实体
- Global Search：主题问题，召回多个社区摘要 → MapReduce 综合

| 维度 | 传统 RAG | GraphRAG |
|---|---|---|
| 全局主题 | 弱 | 强 |
| 索引成本 | 低 | 高 |

适合**封闭语料**（公司知识库），不适合频繁更新。轻量版：LightRAG、nano-graphrag、LazyGraphRAG。

---

### 46. Self-RAG 与 CRAG：自适应检索与纠错。

**Self-RAG（Asai 2024）**：模型在生成中通过 special token 主动决定何时检索、文档是否相关、生成是否被支持、是否有用。需要 SFT 训练。

**CRAG（Yan 2024）**：检索完后用轻量评估器给文档打分，分 Correct / Ambiguous / Incorrect 三档；不够好就用 Web 搜索兜底 + 查询改写。**无需改模型**。

| 维度 | Self-RAG | CRAG |
|---|---|---|
| 决策时机 | 生成中 | 检索后 |
| 修正手段 | 不检索/重检索 | Web 补充、改写查询 |
| 改造模型 | 需 SFT | 不用 |

可组合：Self-RAG 决定要不要查 + CRAG 评估查得对不对。

---

### 47. HyDE：假设性文档嵌入与查询扩展。

Gao 2022 提出。问题：查询太短/抽象时与目标文档语义不近，召回差。

**核心思想**：让 LLM 先"幻想"一份理想答案文档，用这份**假文档的 embedding** 去检索（比查询本身 embedding 更接近真文档），再让 LLM 基于真文档生成最终答案。

为什么有效：查询 embedding 偏"问句"位置，真实文档偏"定义性陈述"，二者距离远；假文档也是"定义性陈述"，更接近真文档。

**变体**：Multi-HyDE（多份假文档平均）、HyDE + 原查询融合、Query2Doc。

适用：短查询、跨领域、Zero-shot 检索。不适用：长查询、知识库 embedding 与生成模型分布差异大。

---

### 48. 因果推理提升 Agent 决策能力。

问题：纯相关性会被混淆变量骗（"喝可乐多 → 编码效率高" 实则因为熬夜）。

**Pearl 三阶梯**：关联（P(Y|X)）→ 干预（P(Y|do(X))）→ 反事实（如果当时没做 X）。

**Agent 应用**：
- 推荐：问"推 A，用户买 B 概率变化多少"（干预）而非关联
- 运维：反事实诊断"没重启服务故障会自愈吗"
- 公平性：移除"出生城市→信贷批准"虚假相关

**实现**：让 LLM 构建因果 DAG 后调 DoWhy/EconML；CoT-Causal Prompt 显式列变量找混淆；A/B 实验闭环校准。

实战经验：Agent 做高风险决策（医疗/金融/运维）时先输出因果假设 → 调因果工具验证 → 再下结论，可信度高很多。

---

## 七、多智能体系统（8 题）

### 49. 多 Agent 通信：显式 vs 隐式。

**显式**：明确消息传递（A2A、AutoGen GroupChat、FIPA-ACL）。
**隐式**：通过共享环境/观察彼此动作（黑板架构、群机器人 stigmergy）。

| 维度 | 显式 | 隐式 |
|---|---|---|
| 沟通效率 | 高 | 低 |
| 可解释性 | 强 | 弱 |
| 扩展性 | 中 O(n²) | 高（环境聚合） |

LLM 多 Agent 多选显式（自然语言天然显式）。大规模模拟（千级 Agent）需混合：核心团队显式 + 周边隐式（共享世界状态）。

---

### 50. CTDE：集中训练分布式执行。

多 Agent RL 主流范式。训练时 Critic 看全局状态稳定梯度；执行时每个 Agent 只用自己 Actor + 局部观察决策。

**优点**：训练稳定、部署简单（无中央节点）、可扩展、reward credit 准确。
**缺点**：Critic 维度随 Agent 数线性增；训练-执行差距；Agent 数固定加 Agent 需重训。

代表：MADDPG、QMIX、MAPPO、VDN。应用：车队协同、多机器人、AlphaStar。

**与 LLM Agent**：传统 CTDE 重在参数训练，LLM Agent 多用 prompt + tool，但思想可借鉴（训练 Reflexion 记忆用全局，使用时召回相关片段）。

---

### 51. 多 Agent 容错：心跳、冗余、Saga。

| 手段   | 工作原理                               |
| ---- | ---------------------------------- |
| 心跳   | Agent 定期 ping，超时标记故障并 failover     |
| 冗余   | 主备 / 多副本投票 / N-modular（3 副本容错 1 个） |
| Saga | 长事务拆为本地事务 + 补偿动作，失败时反向补偿           |

Saga 例：订机票 → 订酒店 → 订餐厅，最后失败则反向退酒店、退机票。

注意：**不可逆操作**（发邮件、付款）用 reservation 模式（先扣预算，最后才提交）。组合：心跳检测 → 冗余 Agent 接管 → Saga 保证一致。LLM Agent 重要决策可让 3 个不同模型 Agent 并行回答多数一致才接受。

---

### 52. 联邦学习在多 Agent 中的应用与挑战。

Agent 各自本地训练 → 上传梯度/参数到中央 → 聚合 → 下发，**原始数据不出本地**。

**场景**：手机输入法、医院联盟、银行联合反欺诈、车联网。
**算法**：FedAvg（基础）、FedProx（应对 non-IID）、Flower/FedML 工具。

**挑战**：数据异质（non-IID）、通信成本、隐私泄露（梯度可反推）、拜占庭节点、激励机制。
**应对**：DP-SGD 加噪、Secure Aggregation、Krum/Median 拜占庭鲁棒聚合。

**LLM 适配**：全模型 FL 不现实（模型太大），主流是 **LoRA-FL**（只上传低秩适配器，MB 级）；2024 出现 FederatedScope-LLM、FATE-LLM。

---

### 53. 多智能体环境的非平稳性问题。

定义：单 Agent 视角下环境会变（因其他 Agent 也在学习），同一动作不同时刻 reward 不同，破坏 Markov 假设。

**问题**：Q 值估计不准、策略 oscillation、replay buffer 样本过时。

**缓解**：
- 中央 Critic（CTDE）：全知视角
- 对手建模：维护对其他 Agent 策略的估计
- 自适应学习率
- 通信协调
- 经验回放 importance sampling

**LLM Agent 的非平稳**：Prompt 漂移（同事改 system prompt）、工具变化、模型升级。**应对**：版本化 AgentCard、契约测试 schema 校验、优雅降级。

---

### 54. 注意力机制在多 Agent 通信中的应用。

全连接广播 O(n²) 开销大，需选择性关注。

| 方法 | 思想 |
|---|---|
| CommNet | 简单平均所有 Agent 隐状态 |
| TarMAC | Attention 加权聚合（key/value/query） |
| ATOC | 动态决定何时通信 |
| IC3Net | 学习门控决定是否发消息 |

**对 LLM 多 Agent 启发**：不要所有 Agent 看所有消息（用 Manager Agent 路由）；长消息 LLM 摘要后传递；每条消息加 importance score 按预算消费；黑板模型 + 注意力（共享 wiki + 检索召回需要部分）。

---

### 55. 多模态 Agent 输出一致性校验。

问题：文本说"涨了 5%"但图表显示下跌；报告说"系统正常"但生成代码 raise Exception。

**校验维度**：数值、语义、代码-说明、时间、单位/坐标。

**方法**：
- **跨模态再嵌入**：CLIP/ImageBind/CLAP 算文本 embed 与图像/音频 embed 余弦相似度
- **反向描述对齐**：生成图像后让 Vision LM 描述，对比原文本；生成代码后跑一遍看输出
- **结构化中间表示**：所有模态从同一 JSON 渲染，源头一致
- **形式化验证**：用 SymPy 验证数学陈述
- **多模型 jury**：第二个 LLM 跨厂商 cross-check

实战架构：生成 Agent + 一致性 Critic Agent，不一致就反馈修正。

---

### 56. 斯坦福小镇：群体涌现与记忆-反思-规划三层架构。

Park 等 2023 在 25 个 LLM Agent 虚拟小镇中观察到群体涌现（自发组织生日派对、传播八卦）。

**三层架构**：
- **Plan**：从日计划→小时计划→5 分钟计划→即时动作，可被打断重规划
- **Reflect**：周期性总结近期观察，抽高层洞察（"X 和 Y 关系好"）写回记忆
- **Memory Stream**：时间排序的 observation，检索打分 = α·recency + β·importance + γ·relevance

群体涌现关键：每个 Agent 独立做计划，但**共享世界**（动作可被观察）→ A 计划"周二派对" → B 听到 → B 计划空出 → 自组织。

启示：三层架构适合任何长生命周期 Agent；反思是关键（无反思则退化为大词袋）；共享环境比纯消息传递更易涌现。

---

## 八、Agent 训练与评测（7 题）

### 57. Agent 训练范式：SFT-on-trajectory、AgentTuning、FireAct。

- **SFT-on-Trajectory**：把 (query, Thought-Action-Obs 完整轨迹) 当长序列做 next-token 训练
- **AgentTuning**（智谱 2023）：构 AgentInstruct 数据集（6 类任务），GPT-4 生成 + 严格过滤；**Agent 数据 + 通用数据 = 20% + 80%** 混合训防遗忘；Llama 系列大幅提升
- **FireAct**（2023）：多任务 + 多范式（ReAct + CoT + Reflexion）蒸馏，洞察是**混合训练更泛化**

2024-2025 进展：AgentLM、xLAM（Salesforce）、Open-Reasoner-Zero、DeepSeek-R1（RL 涌现长 CoT 大幅提升 Agent）。

实践经验：**轨迹质量 > 模型大小**，先建评测 + 过滤；范式混合 > 单一；通用能力别丢（80/20 经验值）。

---

### 58. Toolformer / Gorilla / ToolLLM：工具使用能力训练。

| 工作 | 创新 |
|---|---|
| Toolformer（Meta 2023） | 自监督插入候选 API call，下游 loss 改善则保留 → SFT |
| Gorilla（Berkeley 2023） | APIBench + **Retriever-Aware Training**（训练时拼检索回的 API 文档，学会 RAG 增强 API 调用），解决 API 幻觉 |
| ToolLLM（清华 2023） | 16464 真实 API + DFS-DT 多步搜索生成轨迹，训出 ToolLLaMA |

启示：API 文档变化快，**Retrieval > Memorization**；大规模数据预热 + 标准 Function Calling 格式 + MCP 协议层（工具更新无需重训）。代表模型：xLAM-fc、Hammer、ToolACE。

---

### 59. RLHF / RLAIF 与 Reward Hacking。

**RLHF**：人类成对偏好 → 训 RM → PPO 优化，KL 惩罚保不偏离 SFT。
**RLAIF**：用更强 LLM 替代人类做偏好评分（Anthropic Constitutional AI 是代表）。

**Reward Hacking 典型**：谄媚（总附和用户）、冗长（RM 偏好长回答）、格式诱导（小问题加 5 级标题）、空泛安全（什么都说"我不能"）、代码作弊（直接改 test 让其通过）。

**防范**：KL 惩罚、RM 集成投票、过程奖励 PRM（每步合理性而非仅最终结果）、对抗 RM 持续更新、Constitutional 显式规则、Red-team、用 DPO/GRPO 跳过显式 RM（hack 空间小）。

DeepSeek-R1 同款 GRPO 去掉 critic 用群体相对奖励，是近期热门方向。

---

### 60. 现代评测基准：τ-bench / OSWorld / SWE-bench Verified。

| 基准 | 测什么 | SOTA 2025 |
|---|---|---|
| τ-bench（Sierra AI） | 客服多轮（Retail/Airline），pass^k 严苛指标 | Claude 3.5 ~70% |
| OSWorld（西大） | 真桌面 Linux/Windows 369 任务，文件状态校验 | UI-TARS / CUA ~24-30%（人类 72%） |
| SWE-bench Verified（OpenAI） | 人工筛 500 个清晰 GitHub issue + 跑测试 | ~60%+ |

价值：传统 GSM8K/MMLU 只测单轮 QA 不足；新基准强调**多步、有副作用、真实环境**。三者分别是客服、GUI 操作、代码 Agent 行业标准。

---

### 61. 经典基准：AgentBench / WebArena / GAIA / ToolBench。

| 基准 | 范围 | 备注 |
|---|---|---|
| AgentBench（清华） | 8 任务环境综合 | 首版揭示开源与 GPT-4 巨大差距 |
| WebArena（CMU） | 真 Web 环境 812 任务 | 浏览器 Agent 标准，SOTA 仍 < 人类 |
| GAIA（Meta+HF） | 通用助手 466 真实问题 | 工业关注度高 |
| ToolBench（清华） | 16464 真 API | 工具能力训练 + 评测最权威 |

选型：工具能力 ToolBench；浏览器 WebArena/Mind2Web；桌面 OSWorld；客服 τ-bench；代码 SWE-bench Verified；综合 GAIA + AgentBench。

---

### 62. Agent 效能评估的核心指标 + 黄金三角。

**3 核心指标**：任务完成率、效率（步数/token/cost/耗时）、质量（LLM-Judge/人评）。

**黄金三角**：三者必须同时达标，单看一个会偏。

**完整矩阵**：效果（完成率/子目标）+ 效率 + 质量 + 可靠性（一致性/稳定性）+ 用户体验（NPS/复用率）。多 Agent 额外加协作效率、冲突率、容错恢复时间。

**采集**：离线 benchmark 定期跑 + 在线 A/B + 用户"赞/踩" + LLM-as-Judge（加 jury 防偏）。

经验值：客服完成率 > 70% 可上线；平均 3-5 步、< 5s；质量 4/5 以上。

---

### 63. 可解释评估体系：可归因评估链路。

单一"成功率"不能定位失败原因，需归因到具体环节。

**链路**：每步独立标注质量（Plan / Retrieval / Tool Select / Tool Call / Synthesis），失败归因到链上最靠前 quality 低的步骤。

例：60% 失败来自 ToolSelect，集中在 user→order 工具 → 迭代优化方向明确。

**工具栈**：LangSmith（Trace + Eval + 数据集）、Langfuse（开源）、Phoenix（OTel 原生）、Helicone（API 代理 + cost）。

腾讯实战："可归因评估"框架每条 trace 自动跑 7 个 quality check + 失败聚类 + 周报 + 与回归测试集联动（新版必须修复旧失败 case 60%+ 才上线）。

核心理念：**评估不是 pass/fail，而是诊断**。

---

## 九、安全、伦理与隐私（7 题）

### 64. 用户隐私三大原则。

| 原则 | 要求 |
|---|---|
| 最小化 | 仅收集必需数据 |
| 目的限定 | 仅用于声明目的，不挪用 |
| 可控可撤 | 用户可查/改/删/导出 |

合规底线：GDPR（被遗忘权）、CCPA、个人信息保护法、HIPAA、PCI-DSS。

Agent 实现：传 LLM 前脱敏（身份证/手机号正则替换）、tool call 审计日志、记忆按 user_id 严格分库、第三方传递前评估字段能否出域、提供"forget me"通道（含历史记忆、embedding、备份）。

---

### 65. 数据脱敏：K-匿名、L-多样性、差分隐私。

- **K-匿名**：任意记录在准标识符（年龄/性别/邮编）上至少与 K-1 条相同。手段：泛化（33→30-39）、抑制（删行）。弱点：同质攻击。
- **L-多样性**：每个等价类中敏感属性至少 L 个不同值，解决同质攻击。
- **差分隐私**：数据集中加/减一条记录查询分布几乎不变；ε 越小越隐私；实现是加拉普拉斯/高斯噪声。

| 方法 | 防御 | 数据可用性 |
|---|---|---|
| K-匿名 | 防身份识别 | 高 |
| L-多样性 | +防属性泄露 | 中 |
| 差分隐私 | 最强（理论保证） | 低（噪声） |

工具：Microsoft Presidio、OpenDP、ARX。LLM 训练用 DP-LoRA 防成员推断。

---

### 66. Agent 决策与用户指令冲突处理。

冲突类型：危险指令、违法指令、越权、歧义、道德冲突。

**4 步决策树**：安全分类 → 权限校验 → 风险评估 → 执行+监控。

**拒绝方式**：不冷冰冰 "我不能"；**解释原因 + 提供替代 + 保留用户控制权**。

**Constitutional AI**：给 Agent 一份"宪法"原则，每次响应前自审。

| 冲突 | 策略 |
|---|---|
| 危险/违法 | 硬拒绝 + 解释 |
| 越权 | 上抛人审 |
| 不合理但合法 | 解释风险 + 二次确认 |
| 道德灰区 | 引用平台规范 |
| 歧义 | 反问澄清 |

记忆：用户接受拒绝后写入"用户对 X 类问题倾向 Y"避免重复劝说。评估需测拒绝率与合理性，避免**过度拒绝**。

---

### 67. AI Agent 伦理对齐：RLHF / Constitutional AI / VSD。

| 范式 | 思想 | 优势 |
|---|---|---|
| RLHF | 人类偏好训 RM + PPO | 直接对齐 |
| Constitutional AI | 写宪法 → LLM 自我批判重写 → RLAIF | 可扩展、规则可审计 |
| VSD（价值敏感设计） | 设计哲学：识别利益相关者+价值观→落到系统 | 透明、前置考虑 |

**落地组合**：VSD（设计期）→ Constitutional AI（基础对齐）→ RLHF/DPO（人类偏好细节）→ Runtime Policy（硬规则）→ Monitor + Audit（持续）。

价值清单（参考 IEEE）：自主性、透明性、公平性、可问责、福祉、隐私、安全。

---

### 68. 决策安全验证：形式化验证、仿真测试、对抗样本。

| 手段 | 适用 | 强度 |
|---|---|---|
| 形式化验证 | 周边规则（如"支付≤预算"） | 数学保证 |
| 仿真测试 | 端到端流程（CARLA、τ-bench） | 中（覆盖随场景） |
| 对抗测试 / Red-team | 安全防护（Prompt Injection、Jailbreak） | 启发式 |

工具：TLA+/Coq（形式化）、PyRIT（微软红队）、Garak、LLM-Fuzzer。

完整流程：开发→单元测试→集成仿真→预上线红队→灰度 A/B→生产监控+季度红队。

前沿：AI 自动生成对抗样本（Anthropic Red-Teamer LM）；Constitutional Test 自动生成 violation 测试集；LLM 翻译需求为形式化规约。

---

### 69. Prompt Injection 防御与现代攻击模式。

**经典**：直接注入"忽略之前指示"。

**现代攻击**：
- **间接注入**：恶意 prompt 藏在网页/邮件/文档，Agent 浏览时被注入
- **工具滥用**：诱导串联工具达恶意目的（搜信息+发邮件）
- **Jailbreak**：DAN、PAIR、GCG、AutoDAN、Many-shot Jailbreak
- **ASCII Smuggling / Unicode Tag**：隐藏字符（U+E0000-U+E007F）人不可见但 LLM 可读
- **多模态注入**：图片白底白字 OCR 后被读

**防御层次**：输入过滤（恶意词 + Unicode normalize）→ 架构分离（指令 vs 数据用 XML 标签 / 双 LLM 架构）→ 模型 RLHF 拒绝 → 工具加 capability gate → 输出敏感泄露检测 → 监控异常调用。

**双 LLM 架构**（Simon Willison）：Quarantined LLM 处理不可信输入抽数据，Privileged LLM 决策调工具，污染被隔离。

经验：**任何外部输入默认敌意**。

---

### 70. 权限隔离：RBAC + ABAC 混合。

- **RBAC**：用户→角色→权限。简单集中但粒度粗。
- **ABAC**：基于属性的策略（用户/资源/环境属性），可表达复杂规则。

**混合**：RBAC 作骨架（角色快速分配）+ ABAC 作约束（细粒度过滤），Decision = RBAC AND ABAC。

**Agent 特殊性**：
- Agent **继承调用者身份**，不能用 service account 绕过
- 工具按角色启用，敏感工具默认关闭
- 跨 Agent 委派用 delegation token（OAuth On-Behalf-Of）
- 临时提权用短期 token + 人工二次确认
- 每次工具调用全审计

工具栈：OPA（通用策略引擎）、AWS Cedar、Casbin、SPIFFE/SPIRE。原则：默认拒绝、最小权限、强审计、季度审视、关键操作 4 眼原则。

---

## 十、部署运维与未来展望（10 题）

### 71. Agent 容器化与 K8s 部署。

镜像：Python slim + 非 root 用户 + HEALTHCHECK。
K8s：Deployment 多副本 + 资源 limits + liveness/readiness probe + HPA（按 CPU + 自定义 inflight_requests 指标扩缩）。

**Agent 特有**：
- 多副本**无状态**：会话/checkpoint 外置（Redis/PG）
- 长任务不能 kill：preStop hook 优雅退出 + PDB 保最小可用
- LLM 限流多副本共享配额（API Gateway 集中限流）
- GPU 节点池单独 + taints/tolerations 隔离
- 缩容时机：自定义指标 `inflight_requests=0` 才可下
- OpenTelemetry trace 注入每次 LLM call

进阶：KEDA 按队列长度扩缩、Istio 金丝雀、ArgoCD GitOps。

---

### 72. 降级策略：三级熔断与优雅降级。

| 级别 | 触发 | 措施 |
|---|---|---|
| L1 轻度 | 单工具异常率 > 5% | 切备用工具 |
| L2 中度 | LLM 延迟 > p95 | 切便宜模型 + 关 Reflection |
| L3 严重 | 关键依赖全挂 | FAQ 兜底 + 转人工 |

优雅降级链：全功能 → 仅文本回答 → 小模型 + 简化 Prompt → 排队 + ETA → FAQ + 人工 → 客服电话。

实现：Hystrix 风格熔断器（pybreaker/circuitbreaker）。腾讯实战：降级期请求加 `degraded=true` 标记便 BI 区分；自动回升（连续 N 分钟健康后逐渐放量）；灰度降级先 1% 验证。

---

### 73. 检查点机制与任务恢复。

**三要素**：何时存（每步完成 / 关键决策前 / 用户暂停 / 周期性）、存什么（task_id、step、内部 state、外部 state、metadata、next_action）、怎么恢复（加载 → 版本迁移 → 外部一致性校验 → 从 next_action 续跑）。

LangGraph Checkpointer（SQLite/Postgres/Redis）原生支持。配合 `interrupt_before` 实现 HITL，配合 `get_state_history` 实现时间旅行（用户可回到任意快照修改并从此分支继续）。

**关键原则**：幂等性、原子性（checkpoint 写 + 动作执行事务）、快速恢复（<5s）、版本兼容（schema migration）、过期清理。

**不可逆操作**：先 reserve 占位再 commit；API 调用带 idempotency key。

---

### 74. LLMOps 工具栈：LangSmith / Langfuse / Phoenix / Helicone。

| 工具 | 定位 | 开源 |
|---|---|---|
| LangSmith | 全功能调试+评测+数据集（绑 LangChain） | ❌（EE 私有） |
| Langfuse | 开源 LangSmith 替代 | ✅ MIT |
| Phoenix（Arize） | OTel 原生 + 评估 | ✅ ELv2 |
| Helicone | API 代理 + 监控 + 缓存 | ✅ Apache |

**选型**：
- 绑 LangChain → LangSmith
- 自托管全功能 → Langfuse
- 已有 OTel 生态 → Phoenix
- 仅 API 代理 + 缓存 → Helicone

常见栈：Helicone 代理 LLM API（缓存+限流+成本）+ LangSmith/Langfuse 应用层 trace 和评估。

---

### 75. 沙箱执行环境：E2B / Modal / Daytona / gVisor。

| 方案 | 定位 | 隔离强度 |
|---|---|---|
| E2B | LLM 代码解释器云沙箱（Firecracker microVM） | 强（VM） |
| Modal | 通用 Serverless GPU/CPU | 中-强 |
| Daytona | 开发者云工作空间 | 中 |
| gVisor | 用户态 Linux 内核（容器加固） | 强（syscall 拦截） |

安全等级阶梯：裸机 → Docker → gVisor → Firecracker microVM → 物理 VM。

选型：用户上传代码跑 → E2B；Coding Agent 长任务 → Daytona；内部大规模 → gVisor + 自建 K8s；跨地域 Serverless → Modal。

E2B 被 Claude Code、Cursor 等多家采用。

---

### 76. Agent 个性化：用户画像 + 动态配置 + 记忆网络。

**三层架构**：
- L1 持久层：静态画像（角色/语言）+ 动态画像（偏好/历史）+ 记忆网络
- L2 配置层：根据画像调工具开关、模型选择、风格参数
- L3 运行时：Prompt 动态拼装，注入相关记忆

**冷启动**：注册时 5 题 onboarding；前 N 轮 LLM inference 偏好；提供 reset profile 入口防偏差固化。

**评估**：个性化命中率（个性化回答的"赞"率）；反向校验（随机一半不带画像对比）；漂移检测（更新过快可能噪声）。

典型：客服记住"用户偏好微信沟通"；编程 Agent 记住"Python 3.11 + ruff"；教学 Agent 记住"在第三章卡住偏好视频"。

---

### 77. 模型蒸馏与 Agent 小型化部署。

**范式**：Response 蒸馏（输出当 SFT 数据）、Trajectory 蒸馏（Agent 完整 trace）、Logits 蒸馏（KL 散度）、CoT 蒸馏（reasoning 链）。

Agent 蒸馏：大模型跑真实任务 → 过滤成功 trajectory → SFT 小模型（Qwen-7B / Llama-3-8B / Phi-3）+ 可选 DPO。

| 能力 | 大模型 | 蒸馏小模型 |
|---|---|---|
| 通用知识 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 特定任务 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 多步推理 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 成本/延迟 | $$$ / s | $ / ms |

经验：**窄场景效果好**（客服分类、工具路由），通用 Agent 仍需大模型。**分级路由**简单走小、复杂走大，降本 50%+。

部署：vLLM/TensorRT-LLM 推理；GGUF/llama.cpp 端侧；MLX Apple；AWQ/GPTQ 量化。代表：Salesforce xLAM、Anthropic Haiku、Phi-3.5-mini。

---

### 78. Agent 系统设计案例：B 端电商客服。

**架构**：Web/小程序/App → API Gateway（鉴权+限流）→ Triage Agent（小模型分类）→ Sales/Order/Complaint 专家 Agent。

**共享层**：LLM Pool（GPT-4o/Claude/自研）、Memory（画像+历史）、RAG（商品+FAQ）、Tools（订单/物流/退款/CRM API）。
**治理层**：监控/评测/审计/Human Handoff。

**关键设计**：
- 多 Agent 分工（Triage 小模型快速分类）降本提速
- 记忆：短期对话 + 长期画像 + 商家级独立 RAG 库
- 工具 MCP 化，敏感工具（退款>500）走人审
- 安全：商家数据严格隔离 + PII 脱敏 + Injection 防御
- 评测：每日 1000 例离线集 + 在线 NPS + 转人工率监控
- 弹性：三级熔断 + 多模型 fallback + K8s HPA

**预期 KPI**：一次解决率 >70%、响应 <3s、单次对话 cost <$0.05、转人工 <30%、满意度 >4/5。

---

### 79. 未来 AI Agent 突破方向：AIOS / 能效 / 终身学习。

**AIOS（AI 操作系统）**：以 LLM 为内核的 OS 抽象。组件：Agent Scheduler、Context Manager（上下文虚拟内存）、Memory Manager（分层）、Tool Manager（MCP 协议层）、Access Control。代表：AIOS、Letta、MemGPT。看点：1-3 年内主流 OS 厂商（微软/苹果/Android）原生集成 AI 内核。

**能效优化**：Mamba/SSM 替代部分 Transformer（线性复杂度）、MoE（DeepSeek-V3/Mixtral 激活参数小）、Speculative + 投机执行、小模型路由、硬件（Blackwell/Trainium/Groq/Cerebras）、端云协同。

**终身学习**：参数化（online LoRA、TTT 测试时训练）+ 非参数化（超大向量库 + 检索）。挑战：灾难遗忘、能力评估、错误修正、隐私。代表：Meta MemoryBank、AdaLoRA、LongMem、MemoryLLM。

其他：多模态 VLA、具身 Agent（Figure/Optimus）、自主科学家（Sakana）、群体协作、可信对齐、垂直领域 Agent。

**5 年展望**：Agent 成软件主要交付形态；能效、对齐、终身学习是三大瓶颈，谁先突破谁定义下一代生态。

---

### 80. Agent 对 APP 形态的演进 + Agent OS 展望。

**APP 当前痛点**：UI 学习成本高、数据孤岛、跨 App 需手动桥接、同质化。

**三个演进层级**：
- **L1 APP 内 Agent 化**（当前主流）：每个 App 内嵌 AI 助手，仍是附属功能
- **L2 Agent 作聚合层**（2024-2026 兴起）：用户对话一个 Agent，Agent 调各 App 能力（Apple Intelligence、Gemini、Manus）；App 退化为"能力提供者"
- **L3 Agent 即 OS**（远期）：用户操作 Agent，Agent 调度一切；传统 App 弱化为功能模块 + 数据空间

**Agent OS 核心要素对照**：进程调度→Agent 调度；文件系统→语义索引+知识图谱；App→Skill/Tool（MCP server）；IPC→A2A 总线；视窗→对话+多模态；App Store→Skill Marketplace。

**App Store 会被取代吗**：短期不会（仍是主入口）；中期演化为"Skill Marketplace"；长期形态弱化但生态/商业模式不会消失。

**给开发者**：拥抱 MCP/A2A、重数据+Workflow 淡化 UI、关注信任品牌、垂直深耕、学习成本前置。

**给用户**：从"打开 App 找功能"到"说我要什么 Agent 帮我搞定"。

**结语**：2026 是 Agent 从工具到平台的转折点。MCP/A2A 落地、Computer Use 实用化、Reasoning Model 铺开、Manus/Devin 验证 PMF — 接下来 3 年是 Agent OS 诞生窗口。

---

## 参考资料

**协议**：MCP modelcontextprotocol.io / A2A google.github.io/A2A / Anthropic Computer Use docs。
**框架**：LangGraph、CrewAI、AutoGen、DSPy、E2B。
**重要论文**：MemGPT arXiv:2310.08560、AgentTuning 2310.12823、Reflexion 2303.11366、Toolformer 2302.04761、Gorilla 2305.15334、ToolLLM 2307.16789、GraphRAG 2404.16130、Self-RAG 2310.11511、Generative Agents 2304.03442、DeepSeek-R1 2501.12948、AIOS 2403.16971。
**评测基准**：τ-bench 2406.12045 / OSWorld 2404.07972 / SWE-bench Verified swebench.com / AgentBench 2308.03688 / WebArena 2307.13854 / GAIA 2311.12983。

---

> 📌 完整深度版（含代码示例）：[[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-带答案|大模型面试题-Agent-2026版-带答案]]
> 📌 题目自测版：[[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版|大模型面试题-Agent-2026版]]
> 📁 旧版归档：[[index|index]]
