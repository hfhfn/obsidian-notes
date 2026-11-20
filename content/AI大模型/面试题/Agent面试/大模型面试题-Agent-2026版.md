---
tags:
- 面试题
- AI大模型
- Agent
created: 2026-05-15
version: 2026
modified: '2026-05-15T21:18:33+08:00'
---

# 大模型面试题 - Agent 篇（2026 版）

> 📌 本文档为 **题目自测版**，共 80 题，覆盖 LLM Agent 从基础架构到 2025-2026 最新协议、产品、训练范式的高频考点。
> 📖 答案请见 [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-带答案|大模型面试题-Agent-2026版-带答案]]。
> 📁 旧版（2024）资料已归档至 [[index|index]]。

## 目录

- [[#一、Agent 基础与核心架构（8 题）|一、Agent 基础与核心架构（8 题）]]
- [[#二、记忆系统与上下文管理（7 题）|二、记忆系统与上下文管理（7 题）]]
- [[#三、工具使用与协议标准（10 题）|三、工具使用与协议标准（10 题）]]
- [[#四、Agent 框架与现代产品（10 题）|四、Agent 框架与现代产品（10 题）]]
- [[#五、Computer Use 与 Browser Use（5 题）|五、Computer Use 与 Browser Use（5 题）]]
- [[#六、推理增强与高级 RAG（8 题）|六、推理增强与高级 RAG（8 题）]]
- [[#七、多智能体系统（8 题）|七、多智能体系统（8 题）]]
- [[#八、Agent 训练与评测（7 题）|八、Agent 训练与评测（7 题）]]
- [[#九、安全、伦理与隐私（7 题）|九、安全、伦理与隐私（7 题）]]
- [[#十、部署运维与未来展望（10 题）|十、部署运维与未来展望（10 题）]]

---

## 一、Agent 基础与核心架构（8 题）

### 1. 什么是 LLM Agent？与传统程序、传统 AI 系统的核心区别是什么？



### 2. Agent 的核心架构是怎样的？请详细说明感知-记忆-推理-工具-执行-反馈 6 大模块的职责与协作方式。



### 3. PEAS 框架是什么？请用 PEAS 描述一个 Agent 的工作场景。



### 4. ReAct 框架的工作原理是什么？Thought-Action-Observation 循环如何驱动 Agent 决策？



### 5. CoT、Self-Consistency、ToT（Tree of Thoughts）、GoT（Graph of Thoughts）的本质差异与适用场景？



### 6. Plan-and-Execute 与 ReAct 的区别是什么？什么场景下分别选用哪一个？



### 7. Function Calling / Tool Use 的机制是怎样的？请说明 OpenAI Function Calling 的完整调用流程。



### 8. LLM Agent 当前最主要的 5 个局限性是什么？分别有哪些应对策略？



---

## 二、记忆系统与上下文管理（7 题）

### 9. Agent 的短期记忆与长期记忆有什么区别？分别如何实现？



### 10. 基于向量数据库的 RAG 长期记忆架构是怎样的？请说明检索、重排、上下文注入的完整链路。



### 11. MemGPT / Letta 的"操作系统式分层记忆"架构是什么？它如何突破上下文窗口限制？



### 12. Mem0、Zep 等现代 Agent 记忆框架是什么？与传统 RAG 记忆相比有什么优势？



### 13. 长对话中的"上下文污染"是什么？时间衰减注意力如何缓解这个问题？



### 14. 用户说"和上次一样"，Agent 如何理解这个指代？请说明指代消解的实现方案。



### 15. KV Cache 的工作原理是什么？如何实现跨请求复用？投机解码（Speculative Decoding）又是怎么回事？



---

## 三、工具使用与协议标准（10 题）

### 16. 动态 API 调用与 Function Calling 如何实现？请给出一个完整的工具调用 demo（含 schema 定义、模型调用、结果回填）。



### 17. 当工具库扩展到 1000+ 个工具时，如何设计高召回 + 高准确率的工具路由？请阐述三层漏斗设计。



### 18. 工具描述偏差（描述与实际行为不符）如何检测与修正？请说明工具描述的自适应优化闭环。



### 19. 工具调用频繁导致延迟过高时，有哪些优化手段？请从缓存、批量、预测执行、并行四个维度展开。



### 20. MCP（Model Context Protocol）协议是什么？请详细说明它的架构、生命周期、Server/Client 分工与典型应用场景。



### 21. A2A（Agent-to-Agent Protocol）协议是什么？请说明 AgentCard、Task、Streaming 等核心概念与协议交互流程。



### 22. MCP 与 A2A 的核心区别是什么？两者的适用场景是什么？是否可以协同使用？



### 23. AgentCard 是什么？Agent 服务发现机制如何设计？



### 24. Streaming Tool Use 是什么？模型在流式输出工具参数时，如何做 Partial JSON 解析？



### 25. 并行工具调用如何设计全局预算池？避免单 Agent 占用过多计算资源或耗尽 API 配额。



---

## 四、Agent 框架与现代产品（10 题）

### 26. LangChain 的核心组件有哪些？请描述 LangChain 完整生态（LangChain / LangGraph / LangSmith / LangServe）的分工。



### 27. LangGraph 的状态机/图工作流是怎么设计的？请用一个多步骤 Agent 实战例子说明 Node、Edge、State、Checkpointer 的协同。



### 28. CrewAI 的多 Agent 协作模型（Agent-Task-Crew）是怎样的？与 LangGraph 的区别是什么？



### 29. AutoGen 的对话驱动多 Agent 框架是什么？它的 GroupChat 机制如何实现自动协商？



### 30. AutoGPT 与 BabyAGI 的设计思想是什么？各自的局限性在哪？为什么它们没能成为生产级方案？



### 31. Anthropic Claude Code 的架构是什么？Sub-agents 机制如何工作？



### 32. OpenAI Swarm 是什么？轻量级多 Agent 编排相比 LangGraph 有什么优势？



### 33. Manus（通用 Agent 产品）的工程实现是怎么拆解的？它的虚拟机沙箱、工具体系、上下文工程有哪些值得借鉴？



### 34. Devin 与 Cursor Composer 的 Coding Agent 设计范式有什么区别？SWE-bench 上的表现差异说明了什么？



### 35. DSPy 是什么？声明式 LLM 编程范式与 Prompt 自动优化的工作原理是什么？



---

## 五、Computer Use 与 Browser Use（5 题）

### 36. Anthropic Computer Use 是什么？请说明它的原理、工作流（截图→决策→操作→反馈）、以及安全防护机制。



### 37. OpenAI Operator、Browser-Use、Playwright Agent 三种 Browser Agent 方案的核心区别是什么？



### 38. Computer Use 背后的视觉-语言-行动（VLA, Vision-Language-Action）链路是怎样的？模型如何从屏幕截图推理出鼠标坐标？



### 39. GUI Agent 的安全防护怎么做？请从误操作防止、Prompt Injection 防御、敏感操作确认三个角度展开。



### 40. Browser Agent 长任务执行中，状态管理、检查点（Checkpoint）、中断恢复怎么实现？



---

## 六、推理增强与高级 RAG（8 题）

### 41. 任务分解：链式推理（CoT 分解）与外部规划器（如 LLM+PDDL）各有什么优劣？什么场景适合哪种？



### 42. Reasoning Model（o1/o3/DeepSeek-R1）作为 Agent 大脑相比传统 LLM 有什么优势与挑战？为什么不能直接替换？



### 43. Reasoning Model 的 Thinking Budget（思考预算）如何管理？如何控制 Reasoning Agent 的成本？



### 44. Self-Reflection / Reflexion 是什么？Agent 如何通过反思自我改进？



### 45. GraphRAG（基于知识图谱的检索增强，微软方案）是什么？相比传统 RAG 在哪些场景有优势？



### 46. Self-RAG 与 CRAG（Corrective RAG）的自适应检索机制是怎样的？模型如何决定"何时检索"与"如何纠错"？



### 47. HyDE（Hypothetical Document Embeddings）是什么？它如何提升查询召回率？



### 48. 如何把因果推理（Causal Inference）引入 Agent 决策？相比相关性推理有什么优势？



---

## 七、多智能体系统（8 题）

### 49. 多 Agent 通信协议的显式（Explicit）与隐式（Implicit）方式分别是什么？各自的优缺点？



### 50. CTDE（Centralized Training Decentralized Execution）训练范式是什么？它的优缺点是什么？



### 51. 多 Agent 系统中，如何实现容错？请说明心跳、冗余、Saga 模式三种机制的工作原理。



### 52. 联邦学习（Federated Learning）在多 Agent 系统中的应用与挑战是什么？



### 53. 多智能体环境的"非平稳性"（Non-stationarity）问题是什么？有哪些缓解思路？



### 54. 注意力机制（Attention）如何应用于多 Agent 通信？请说明 CommNet、TarMAC 等方案的核心思想。



### 55. 多模态 Agent（同时处理文本/图像/音频）的输出一致性如何校验？



### 56. 斯坦福小镇（Generative Agents）项目中，群体涌现是怎么发生的？记忆-反思-规划三层架构怎么设计？



---

## 八、Agent 训练与评测（7 题）

### 57. Agent 训练范式有哪些？请重点说明 SFT-on-trajectory、AgentTuning、FireAct 各自的核心思想。



### 58. Toolformer、Gorilla、ToolLLM 是怎么训练大模型使用工具能力的？三者方法有什么区别？



### 59. RLHF 与 RLAIF 的区别是什么？什么是 Reward Hacking？如何防范？



### 60. 现代 Agent 评测基准 τ-bench、OSWorld、SWE-bench Verified 分别考察什么能力？



### 61. 经典 Agent 评测基准 AgentBench、WebArena、GAIA、ToolBench 的定位与典型任务是什么？



### 62. Agent 效能评估的 3 个核心指标是什么？"黄金三角"评估法是什么？



### 63. 如何构建可解释的评估体系？请说明"可归因评估链路"的设计思路。



---

## 九、安全、伦理与隐私（7 题）

### 64. 用户隐私数据处理的三大原则是什么？请结合 Agent 调用工具/API 的实际场景说明。



### 65. 数据脱敏与匿名化的实践方法有哪些？请说明 K-匿名、L-多样性、差分隐私的核心思想。



### 66. 当 Agent 决策与用户指令冲突时（如用户要求 Agent 执行不安全操作），应该如何处理？



### 67. AI Agent 的伦理对齐有哪些方案？请对比 RLHF、Constitutional AI、价值敏感设计（VSD）。



### 68. Agent 决策的安全验证有哪些手段？请说明形式化验证、仿真测试、对抗样本测试的应用。



### 69. Prompt Injection 是什么？现代攻击模式（间接注入、工具滥用、Jailbreak、ASCII 走私）有哪些？如何防御？



### 70. Agent 系统的权限隔离与访问控制怎么做？请说明 RBAC + ABAC 混合方案。



---

## 十、部署运维与未来展望（10 题）

### 71. Agent 容器化部署与 K8s 实践是怎样的？请说明镜像设计、健康检查、HPA 弹性扩缩的关键点。



### 72. Agent 系统的降级策略怎么设计？请说明三级熔断与优雅降级（Graceful Degradation）的实现。



### 73. Agent 长任务的检查点（Checkpoint）机制与任务恢复如何实现？



### 74. 现代 LLMOps 工具栈（LangSmith、Langfuse、Phoenix、Helicone）各自的定位是什么？怎么选型？



### 75. Agent 沙箱执行环境（E2B、Modal、Daytona、gVisor）的工作原理与对比？



### 76. Agent 个性化适配怎么做？请说明用户画像 + 动态配置 + 记忆网络三层架构。



### 77. 模型蒸馏（Distillation）如何用于 Agent 小型化部署？小模型 Agent 的取舍是什么？



### 78. 请深度展开一个 Agent 系统设计案例（B 端客服 / 电商导购 / 医疗助手 三选一），覆盖架构、记忆、工具、安全、部署。



### 79. 未来 AI Agent 的核心技术突破方向有哪些？请重点谈 AIOS（AI 操作系统）、能效优化、终身学习。



### 80. Agent 技术对 APP 形态会产生什么影响？"Agent 操作系统"会取代传统 App Store 吗？



---

## 附录：来源说明

本 80 题精选自旧版 4 份资料（已归档至 [[index|index]]）+ 新增 2025-2026 关键主题约 30 题。

来源映射详见配套答案版 [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-带答案|大模型面试题-Agent-2026版-带答案]] 章节首部。