---
title: 多Agent编排-LangGraph原生Supervisor与Swarm实现
tags:
- Agent
- LangGraph
- Supervisor
- Swarm
- 多Agent
- EduAgent
created: '2026-09-04T14:09:44+08:00'
modified: '2026-09-04T14:09:44+08:00'
---

# 多 Agent 编排：LangGraph 原生 Supervisor 与 Swarm 实现

> 📌 **本回顾干什么**：第 8 章的手写 `orchestrator.py`（自定义 Python 编排器）功能没问题，但它**不是 LangGraph 的图**，而是普通 Python 类在四张独立图之上 `ainvoke`。本回顾用它**等价重写一遍**——用 LangGraph 框架**自带的** `create_supervisor` + 子图嵌套来实现同一套业务（简历/问答/批改/面试四 Agent + 求职全链路 Pipeline），并逐段讲清楚。**业务不改，实现方式换成"图内编排"**。

- 配套阅读：[[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]]（第8章 vs A2A + 七种协作方式全景）
- 所属总览：[[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]]（08章综合笔记）
- 前置：`pip install langgraph langgraph-supervisor langchain-openai`

---

## 1. 先看清：第8章手写 Orchestrator vs LangGraph 原生 Supervisor

同一个「中心化编排」范式，两种实现：

| 维度 | 第8章 `orchestrator.py`（自定义） | 本回顾 `create_supervisor`（框架内置） |
| --- | --- | --- |
| 编排载体 | **普通 Python 类**（`handle()`→`_run_single_agent`/`_run_pipeline`） | **一张 LangGraph 图**（Supervisor 图） |
| 调度决策 | 手写 `_llm_route`（DeepSeek 判 6 类 label）+ 硬编码 `_pipelines` 字典 | Supervisor 节点内置 LLM，**在图上**决定下一步调哪个 worker |
| 路由方式 | 查 `_LABEL_TO_AGENT` 映射表 | **Tool-based handoff**：supervisor 把任务作为 tool 调用交给对应 worker |
| Agent 接入 | `graph.ainvoke(initial_state, config)` 手动翻译 State | 每个 Agent 是一张**编译好的子图**，作为 supervisor 的 worker 节点 |
| 状态传递 | `context` 字典手动平铺（`**request.context`） | 父子图**共享 state 键**（`messages`、业务键） |
| Pipeline | `_run_pipeline` for 循环 + `current_context` 注入 | **子图嵌套**：把「简历→面试」也画成一张子图 |
| 统一入口状态 | SSE 事件 8 种 | 保留（见 §5），但路由判断交给 supervisor |

> 💡 **一句话**：第8章把编排写在「图外面」；本回顾把编排也「画进图里」。业务逻辑不变，架构从"Python 代码调度图"变成"图调度图"。

---

## 2. 三个核心概念（先懂再写）

### 2.1 子图（Subgraph）—— 小图当大图的一个节点

LangGraph 里，**一个编译好的图可以作为另一个图的节点**。这就是「子图嵌套」的地基。
```
父图（Supervisor）                 
┌──────────────────────────────┐
│  nodeA → nodeB → nodeC      │
│     ↑ 其中某个 node 可以是    │
│        一张编译好的子图       │
└──────────────────────────────┘
```

父子图**共享 state**：子图只读写它声明过的键，其余键原样透传。

### 2.2 `create_supervisor` —— 一键生成 Supervisor 图
`langgraph-supervisor` 包提供的 helper，收一堆 worker（子图），自动生成一张「总调度图」：
```python
supervisor_graph = create_supervisor(
    agents=[resume_agent, qa_agent, exam_agent, interview_agent],
    model=model,
    prompt="你是总调度，判断意图后分派给合适的 Agent...",
    supervisor_name="chief",
)
app = supervisor_graph.compile(checkpointer=MemorySaver())
```

它内部做的三件事：
1. 建一个 `supervisor` 节点（一个 LLM，配了 delegate 工具）；
2. 把每个 worker 注册成 supervisor 可调用的 tool；
3. supervisor 循环：「判断 → 调某个 worker → 看结果 → 再判断 → 直到完成」。

### 2.3 Handoff —— supervisor 怎么"派活"（内部时序）

Supervisor 不是直接调函数，而是**把"请某 Agent 干活"当成一次 tool call**。`create_supervisor` 内部为每个 worker 自动生成一个 **handoff tool**（默认名 `transfer_to_<worker名>`），其触发体就是 worker 的编译子图——调用它 = 把控制权 + 对话历史交给那个子图去跑，子图跑完把最后一条消息回传。supervisor 节点本身是一个 **ReAct 式的 LLM + tools 循环**：
```
用户: 帮我审查简历
  └ supervisor 节点（LLM，绑定了 5 个 transfer_to_* 工具）
      ① LLM 读输入 + supervisor 系统提示 → 决定调 transfer_to_resume_agent   ← 动态路由
      ② 工具执行 resume 子图 → 返回"简历审查完成…"
      ③ LLM 看到结果 → 决定再调 transfer_to_interview_agent                  ← handoff 串链路
      ④ 工具执行 interview 子图 → 返回"面试开始…"
      ⑤ LLM 看到结果 → 不再调工具 → 生成最终回复给用户                       ← 循环终止
  └ 结束
```

**「动态路由」的本质**：到底调哪个工具、调几个、怎么串，由 supervisor 的 **LLM 在运行时现场决定**（读用户输入 + 前序 worker 结果）——这正是第8章 `_llm_route` + `_LABEL_TO_AGENT` 映射表做的事，只是从"手写 label 分发"换成了"图内 LLM 自主挑工具"。循环终止条件 = supervisor LLM 决定不再调工具、输出最终答案。另有 `create_forward_message_tool` 能让 supervisor 直接把某 worker 的最后一条消息透传为最终输出，免去再现成。

这就是「工具型 handoff」——和 OpenAI Swarm 的 `handoffs`、第8章的 `_LABEL_TO_AGENT` 映射是同一件事，只是做进了图里。

### 2.4 子图状态互通 —— 「交集即通信口，非交集即隔离墙」

子图之间怎么互传数据？**靠「父子图共享的重叠 state 键」**，这是 LangGraph 子图通信的唯一通道。

规则：**父图把 state 传给子图，子图只读它 schema 里声明的键；子图跑完，只有「子图 schema 与父图 schema 都有的键」才合并回父图。**

以三个 State 对照（`messages`/`response`/`resume_result`/`resume_review_id` 四个键）：

| 键 | AgentState（父图/面试） | ResumeState（简历） | QAState（问答） |
| --- | :---: | :---: | :---: |
| `messages` | ✅ | ✅ **共享** | ✅ **共享** |
| `response` | ✅ | ✅ **共享** | ✅ **共享** |
| `resume_result` | ✅ | ✅ **共享** | ❌ 不声明 |
| `resume_review_id` | ✅ | ✅ **共享** | ❌ 不声明 |

- **简历 → 面试**：`review_resume` 写 `resume_result` / `resume_review_id`，这两个键在 ResumeState 和父 AgentState 里**都有** → 合并回父图 → `interview_agent`（用 AgentState）就读到 `resume_review_id`。**这就是"传递"**，不需要 `context` 字典。
- **问答 Agent 被天然隔离**：QAState 只声明 `messages`/`response`，所以它**看不到** `resume_result`，也不会把它透传出去——不串数据。

> ⚠️ **一个注意点**：在 `create_supervisor` 里，supervisor 与 worker 默认共享的主要是 `messages`（`mode="history"`）。要让业务键（`resume_result` 等）在 supervisor ↔ worker 之间共享，得把它们加进 `create_supervisor` 的 `state_schema` 参数；否则只靠子图自身声明共享（如上面直接子图节点的场景）。

**一句话**：各写各的 schema，交集即通信口，非交集即隔离墙。

---

## 3. 完整实现（分步 + 讲解）

### 3.0 统一 State —— 父子图共享的键
```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """Supervisor 与四个子图共享的状态（只列出要共享的键）"""
    messages: Annotated[list, add_messages]   # 对话消息（reducer 追加）
    resume_result: dict                       # 简历审查结果（Pipeline 传递）
    resume_review_id: str                     # 面试 Agent 要查的 review_id
    response: str                             # 最终对外文本回复
```

> 💡 和 `AgentRequest`/`AgentResponse` 的对应：`messages`+`response` ≈ 统一入参/出参；`resume_result`/`resume_review_id` ≈ 第8章 `context` 里注入的 `{agent}_result` 与 `resume_review_id`。**只是从"Python dict 手动平铺"变成"图上共享 state 键"。**

### 3.1 四个 Worker 子图（复用第4~7章 Agent 的骨架）

每个 Agent 画成一张小 `StateGraph` 并 `.compile()`，成为 supervisor 的 worker。这里给出**示意实现**（真实 Agent 节点更多，见各章 `build_*_graph`）：
```python
from langgraph.graph import StateGraph, START, END

# ── Worker①：简历审查（第4章：六维度评分）──
class ResumeState(TypedDict):
    messages: Annotated[list, add_messages]
    resume_result: dict
    resume_review_id: str
    response: str

def review_resume(state: ResumeState) -> dict:
    # 真实：六维度 fan-out/fan-in 评分（第4章）
    result = {
        "review_id": "uuid-123",
        "weighted_score": 78,
        "projects": ["RAG 系统", "LoRA 微调"],
        "skills": ["Python", "LangChain"],
    }
    return {
        "resume_result": result,          # 供 Pipeline 传递
        "resume_review_id": result["review_id"],  # 面试 Agent 要的键
        "response": "简历审查完成：总分78分。量化成果偏少，建议补强。",
    }

resume_graph = StateGraph(ResumeState)
resume_graph.add_node("review", review_resume)
resume_graph.add_edge(START, "review")
resume_graph.add_edge("review", END)
resume_agent = resume_graph.compile()
```
```python
# ── Worker②：RAG 问答（第5章：检索+生成）──
class QAState(TypedDict):
    messages: Annotated[list, add_messages]
    response: str

def answer_qa(state: QAState) -> dict:
    # 真实：HyDE → 检索 → 精排 → 生成（第5章）
    return {"response": "RAG 是检索增强生成，先召回再作答……"}

qa_graph = StateGraph(QAState)
qa_graph.add_node("rag", answer_qa)
qa_graph.add_edge(START, "rag")
qa_graph.add_edge("rag", END)
qa_agent = qa_graph.compile()
```
```python
# ── Worker③：试卷批改（第6章：三轨并行）──
def grade_exam(state) -> dict:
    # 真实：asyncio.gather 三轨（规则/LLM/代码）+ HITL（第6章）
    return {"response": "试卷批改完成：客观题全对，简答题需复核2题。"}

# ── Worker④：模拟面试（第7章：状态机，读 resume_review_id）──
def run_interview(state) -> dict:
    review_id = state.get("resume_review_id")   # ← 用到 Pipeline 注入的键
    # 真实：多轮状态机 + SSE（第7章）
    return {"response": f"面试开始，已基于简历({review_id})针对性提问……"}

interview_graph = StateGraph(AgentState)
interview_graph.add_node("interview", run_interview)
interview_graph.add_edge(START, "interview")
interview_graph.add_edge("interview", END)
interview_agent = interview_graph.compile()
```

> 🔑 **子图共享 state 的威力**：`review_resume` 写入 `resume_review_id`，`run_interview` 读它——**不需要任何 `context` 字典手动传递**，state 键自动透传。这正是 LangGraph 子图相对第8章手写 `current_context` 注入的简化点。

### 3.2 求职全链路 Pipeline —— 用子图嵌套实现「简历→面试」

第8章 `_run_pipeline` 的 `job_preparation`（简历审查 → 模拟面试），在 LangGraph 里就是**一张把两个子图当节点按序连起来的图**：
```python
# ── Pipeline 子图：求职全链路（嵌套在顶层 supervisor 之下）──
job_prep_graph = StateGraph(AgentState)
job_prep_graph.add_node("resume", resume_agent)       # 子图作为节点
job_prep_graph.add_node("interview", interview_agent) # 子图作为节点
job_prep_graph.add_edge(START, "resume")              # 先审简历
job_prep_graph.add_edge("resume", "interview")        # 再把简历结果喂给面试
job_prep_graph.add_edge("interview", END)
job_prep_agent = job_prep_graph.compile()
```

> 🔑 **对照第8章 §8.3**：`add_edge("resume", "interview")` 就是 `_run_pipeline` 里那行 `current_context[f"{agent_type}_result"] = ...` 的**声明式等价物**——顺序、数据流都写在图上，不用 for 循环手推。
>
> ⚠️ **若想复刻第8章「`weighted_score < 60` 就 break 不进面试」**：**条件边必须取代上面的普通边，而不是叠加**。一个节点不能同时有普通出边和条件出边（LangGraph 会抛 `ValueError: Cannot add a conditional edge from node "resume" that already has an outgoing edge`）。正确写法是把 `add_edge("resume", "interview")` **删掉**，改用从 `resume` 出发的条件边：
> ```python
> def should_interview(state):
>     return "interview" if state.get("resume_result", {}).get("weighted_score", 0) >= 60 else END
>
> job_prep_graph.add_edge(START, "resume")
> # 条件边定义在「源节点 resume」上，决定 resume 跑完去 interview 还是 END
> job_prep_graph.add_conditional_edges(
>     "resume",
>     should_interview,
>     {"interview": "interview", END: END},   # 返回键 → 目标节点映射
> )
> job_prep_graph.add_edge("interview", END)
> ```

### 3.3 顶层 Supervisor —— 用 create_supervisor 把一切接起来
```python
from langchain_openai import ChatOpenAI
from langgraph_supervisor import create_supervisor
from langgraph.checkpoint.memory import MemorySaver

model = ChatOpenAI(model="deepseek-chat", temperature=0)   # 复用 LLM 工厂 get_llm（3.4）

supervisor_graph = create_supervisor(
    agents=[resume_agent, qa_agent, exam_agent, interview_agent, job_prep_agent],
    model=model,
    prompt=(
        "你是 EduAgent 的总调度（chief）。根据用户意图，把任务分派给合适的 Agent：\n"
        "- 要审查简历 → resume\n"
        "- 技术知识问答 → qa\n"
        "- 试卷/作业批改 → exam\n"
        "- 模拟面试 → interview\n"
        "- 求职全链路（简历+面试，如'帮我准备求职'）→ job_prep\n"
        "分派后，把 Agent 的结果整理成一句回复给用户。"
    ),
    supervisor_name="chief",
)
app = supervisor_graph.compile(checkpointer=MemorySaver())
```
`create_supervisor` 自动完成：
- 建 `chief` 节点（一个带 delegate 工具的 LLM）；
- 把 5 个 worker（含 `job_prep_agent` 这个子图）注册成可调用的 tool；
- **路由判断内置**——不再需要第8章的 `_llm_route` + `_LABEL_TO_AGENT` 映射表，supervisor 自己用 LLM 判断意图。这正好对应第8章 §8.4「为什么路由用 LLM」的结论，只是省掉了手写的 label 分发。

### 3.4 嵌套 Supervisor —— 分层（可选，⑧档进阶）

LangGraph 子图能嵌套 supervisor，做出「分层调度树」（对应图谱 ⑥ 分层 Supervisor）：
```python
# 子层：求职域 supervisor（只管简历/面试两条线）
hiring_supervisor = create_supervisor(
    agents=[resume_agent, interview_agent, job_prep_agent],
    model=model, prompt="你是求职域调度，处理简历/面试相关任务。",
    supervisor_name="hiring_chief",
)

# 顶层：把子层 supervisor 也当 worker 接进来
top_supervisor = create_supervisor(
    agents=[hiring_supervisor, qa_agent, exam_agent],   # ← 一个 worker 是 supervisor
    model=model, prompt="你是总调度，求职类找 hiring_chief，其余找对应 Agent。",
    supervisor_name="top_chief",
)
```

> 🔑 这就是「嵌套子图」：`hiring_supervisor` 本身是一张图，被 `top_supervisor` 当作一个 worker 节点。调度从"一层手写"变成"树状图"，职能分层更清晰。

### 3.5 统一入口保留（SSE 分发不变，路由判断换人）

第8章 `unified_chat.py` 的 SSE 端点和 8 种事件**可以原样保留**；唯一变化是 `_stream_qa_agent` 里那段「手动 `_get_agent_graph` + `astream_events`」可以直接换成调 `app.astream_events(...)`，让 supervisor 图在图上完成路由：
```python
# 统一入口（示意）：把原来调 orchestrator.handle() 换成调 supervisor 图
async def serve(request):
    async for ev in app.astream_events(
        {"messages": [HumanMessage(content=request.message)]},
        config={"configurable": {"thread_id": request.thread_id}},
        version="v2",
    ):
        # 复用第8章：on_chain_start → progress / on_chat_model_stream → token ...
        yield sse_pack(ev)
```

> 💡 第8章的 `_pre_filter`（五类零 Token 模板回复）是**业务优化**，与编排方式无关，**照旧保留**在前置拦截处即可。

---

## 4. 一句话对照：第8章代码 → 本回顾代码

| 第8章（自定义） | 本回顾（框架内置） | 说明 |
| --- | --- | --- |
| `AgentType`/`ExecutionMode` 枚举 | worker 子图的 `name` + 图结构 | 类型由「图」表达 |
| `AgentRequest`/`AgentResponse`/`PipelineResult` | 共享 `AgentState` 键（messages/response/resume_*） | 统一 Schema → 共享 state |
| `_get_agent_graph()` 懒加载 | worker 子图即编译图，直接作为节点 | 图本身可复用 |
| `_run_single_agent` + `with_retry` | worker 子图节点 | 重试仍可包（`with_retry` 装饰器照用） |
| `_run_pipeline` + `current_context` 注入 | `job_prep_graph` 子图 + 共享 state 键 | 顺序/数据流画在图上 |
| `_aggregate_pipeline` 聚合 | supervisor 最后把 worker 结果整理成回复 | 汇总交给 supervisor LLM |
| `_llm_route` + `_LABEL_TO_AGENT` | supervisor 节点内置 LLM + handoff | 路由判断进图 |
| `get_orchestrator()` 单例 | `app = supervisor_graph.compile()` 一次编译复用 | 编译一次，全局用 |

---

## 5. 三种写法的取舍（什么时候用哪个）

| 场景 | 推荐 | 原因 |
| --- | --- | --- |
| 教学 / 理解编排原理 / Agent State 差异大 | **第8章手写 Orchestrator** | 解耦各 Agent 独立 State，App 层控制力强，逻辑透明 |
| Agent 数量多、要动态路由、想少写胶水代码 | **`create_supervisor` + 子图** | 路由/交接/状态共享全框架化，几行拼好 |
| 贴近 AI-Coding 的「主Agent+子Agent池」形态、子 Agent 当作工具按需调 | **`create_subagent`** | 更轻，主 Agent 即调度者，无独立路由节点 |
| 深层分工、跨域协作、要可观测图 | **嵌套 Supervisor** | 树状分层，顶层看战略、底层看执行 |
| 工程上可混用 | 三者结合 | 如：内部用 supervisor / subagent 子图，对外仍用统一 SSE 入口 + MCP/A2A（见对比文档） |

**本回顾的结论**：第8章手写是**教学上更清晰**的选择（它把"编排"显式教给你）；`create_supervisor` / `create_subagent` 是**工程上更省事**的选择（编排藏进框架）。同一套业务，三套都能实现，只是"编排逻辑写在 Python 里"还是"画在图上/封装成工具"的区别。

---

## 6. 运行与验证
```bash
conda activate edu_agent
pip install langgraph-supervisor langchain-openai
# 把上面各段拼成 backend/core/supervisor_chat.py，然后：
uvicorn backend.main:app --reload --port 8000
```

**验证五句话**（对照第8章 §8.7 李明用例）：

| 用户输入 | 期望路由 | 验证点 |
| --- | --- | --- |
| 什么是 RAG 的核心原理？ | → qa | supervisor 把任务交给 qa 子图 |
| 帮我看看简历 | → resume | supervisor 调 resume 子图 |
| 我要模拟面试 | → interview | 读 resume_review_id（若走 Pipeline） |
| 帮我准备求职 | → job_prep | 子图内 resume → interview 串联 |
| 提交试卷批改 | → exam | supervisor 调 exam 子图 |

日志关键字：`supervisor`、`handoff`、`resume`、`interview` 等（supervisor 图的节点名）。

---

## 7. 补充：`create_subagent` —— 把子图变成"可调用"的子 Agent，及与 `create_supervisor` 的对比
`create_supervisor` 不是 LangGraph 唯一的「图内多 Agent」方式。在 LangChain/LangGraph 1.0 的 Agent 框架（`langchain` 包，`create_agent` / `create_subagent`）里，还有另一种更贴近「主 Agent + 子 Agent 池」的写法。三种方式其实都是**同一个地基（子图作为节点）**上长出来的，区别只在"谁驱动、怎么分工"：

### 7.1 三种「图内多 Agent」方式速览

| 方式 | 谁在驱动 | 多 Agent 语义 | 对应图谱 ①/② |
| --- | --- | --- | --- |
| **子图作为节点**（§3.2） | 父图结构写死 | 只是"图里嵌图"，无 Agent 智能 | ④ 图/DAG |
| **`create_subagent`** | 一个**主 Agent**（LLM） | 主 Agent 把子 Agent **当普通工具**调用，自己决定何时用 | ② 主Agent+子Agent池 |
| **`create_supervisor`**（§3.3） | 一个**专职 supervisor 节点** | supervisor 在多个 worker 之间**专职路由** | ① Orchestrator/Supervisor |

> 💡 **关键区分**：`create_subagent` 没有独立的"调度节点"——**主 Agent 就是调度者**，子 Agent 只是它众多工具里的一个；而 `create_supervisor` 会额外造一个 supervisor 节点来专职派活。前者更轻、更贴近 Claude Code / Codex 那种"一个主 Agent 动态叫子 Agent"的形态。

### 7.2 代码示意（`create_agent` + `create_subagent`）
```python
from langchain.agents import create_agent, create_subagent

# ① 把第4章的简历子图包装成一个"可调用"的子 Agent（名字+描述，父 Agent 靠它判断何时用）
#    注意：create_subagent 不配模型——它用 resume_graph 编译时内置的那个 LLM（在主 Agent 的图里，模型跟着"图"走）
resume_subagent = create_subagent(
    resume_graph,                       # 上面 §3.1 编译好的子图（自带它自己的模型）
    name="resume_agent",
    description="审查简历并给出六维度评分与改进建议",
)

# ② 主 Agent：四个 Agent 都用 subagents 封装（它们各有自己的模型/循环），
#    而 tools 放的是"无状态的普通函数"（主 Agent 直接调、拿结果就走，没有 LLM）
main_agent = create_agent(
    model=model,                        # 这个 model 只配主 Agent 自己的推理循环
    tools=[
        search_knowledge_base,          # 示例工具：检索知识库（普通函数）
        calc_average_score,             # 示例工具：算平均分（普通函数）
    ],
    subagents=[resume_subagent, qa_subagent, exam_subagent, interview_subagent],  # 四个完整 Agent
    prompt=(
        "你是 EduAgent 主 Agent。需要审查简历时用 resume_agent，"
        "需要模拟面试时用 interview_agent，其余直接问答。"
    ),
)
app = main_agent.compile(checkpointer=MemorySaver())
```

> 🔑 **`tools` vs `subagents` + 模型归属（本§重点）**：
> - **`tools`** = 无状态函数（检索、计算），主 Agent 直接调，**无 LLM**；
> - **`subagents`** = 完整 Agent（有自己的模型/循环/状态），主 Agent "委派"它跑一套自己的推理；
> - **模型跟"图"走**：`create_agent(model=...)` 的 `model` 只配主 Agent；`create_subagent(图)` 用**被包装图里已编译的模型**。`create_supervisor(model=...)` 同理，只配调度节点，worker 各自用自己的模型。

### 7.3 内部怎么工作（和 supervisor 的 handoff 对比）

- `create_subagent` 把子图封装成一个**带名字+描述的 tool**，注册进主 Agent 的工具列表；
- 主 Agent 的 LLM 在它的**普通 ReAct 循环**里，和调其他工具一样决定要不要调子 Agent——**没有独立的 handoff 工具、没有专职路由节点**；
- 子 Agent 跑完把结果消息返回，主 Agent 继续判断下一步。

对比 `create_supervisor`：supervisor 是"专门一个 LLM 在所有 worker 之间选人派活"；`create_subagent` 是"主 Agent 自己顺手把某个子 Agent 当工具用"。**业务上都能实现第8章**，只是 `create_subagent` 更轻、更接近当前 AI-Coding 最流行的「主Agent + 子Agent池」形态（见对比文档 §8.8.6）。

> ⚠️ **版本注意**：`create_agent` / `create_subagent` 是 LangChain 1.0 引入的新 API（`langchain` / `langchain-agents` 包），具体参数名（如 `tools` vs `subagents`、`prompt` 命名）随版本有微调，以上示意以你安装版本官方文档为准。若只想在核心 `langgraph` 里做，则用 §3.2 的子图节点 + §3.3 的 `create_supervisor` 即可，无需此包。

### 7.4 create_supervisor vs create_agent(subagents)：五维度对比

两种都是"一个 LLM 把子 Agent 当工具调、靠 tool-call 决定调谁"，**小规模扁平路由下几乎可互换**。但有五点实质差异，尤其「路由角色是否独立」和「控制权流」。

| 维度 | `create_supervisor` | `create_agent` + `subagents` |
| --- | --- | --- |
| **路由角色** | **独立的 `supervisor` 节点**专职派活，自己不干活 | **主 Agent 既是路由者又是主 worker**，路由与干活合一 |
| **控制权流** | 子 Agent 跑完**回到 supervisor 节点**，supervisor 再决定调下一个（`supervisor→worker→supervisor→worker…`） | 控制权**始终在主 Agent 手里**，subagent 只是主 Agent 循环里的一次 tool call，跑完直接回主 Agent |
| **交接语义** | 专用 **handoff 工具**（`transfer_to_<worker>`），传**完整消息历史**，可 `create_forward_message_tool` 透传 | subagent 是**普通 tool**，调用/返回走 ToolMessage，无"移交"语义 |
| **模型归属** | `model=` 只配 supervisor（调度 LLM）；**每个 worker 用各自图里的模型**（可混搭大小模型） | 主 Agent 的 `model=` 只配主 Agent；**每个 subagent 用各自被包装图的模型** |
| **结构** | 图里多一个"纯调度"节点 + N 个 worker | 只有一个主 Agent 节点，subagent 注册进它工具列表 |

### 7.5 时机怎么选

| 场景 | 推荐 |
| --- | --- |
| N 个专职 worker、要**显式"由调度员选人派活"**、路由角色清晰 | `create_supervisor` |
| 一个主 Agent **偶尔委派**、想和普通工具混用、子 Agent 各用不同小模型 | `create_agent + subagents` |
| 简单、worker 少、无多步串行 | 两者皆可（几乎等价） |

### 7.6 对应图谱与第8章

- `create_supervisor` → 图谱 **① Orchestrator/Supervisor**（第8章手写就属于这一类）；
- `create_agent + subagents` → 图谱 **② 主Agent+子Agent池**（Claude Code / Codex 的形态）。

**一句话**：`create_supervisor` 是"我（调度员）在你们之间选人派活"；`create_agent+subagents` 是"我（主 Agent）自己也干活，偶尔叫个帮手"。前者多一个专职调度节点，后者更轻。

---

## 8. 补充：LangGraph 的 `Command` —— 交接与中断的基础
`Command` 是 LangGraph 里**一个类、两副面孔**：既能做 Agent 间交接，也能做人工中断/恢复。它是手里「下一步去哪 + 改什么状态」的**一次返回**。
```python
from langgraph.types import Command
```

### 8.1 面孔一：`Command(goto=...)` —— Agent 间交接（③ Handoff 的落地）

一个节点返回 `Command`，**一步同时**完成两件事：控制去哪个节点（`goto`）+ 更新哪些 state（`update`）。这正是"Agent 把控制权交给另一个 Agent"的机制。
```python
def handoff_node(state):
    # 判断下一步去哪，并带上要传递的状态
    if state["intent"] == "interview":
        return Command(
            goto="interview",                       # 控制权交给 interview 节点/子图
            update={"resume_review_id": state["resume_result"]["review_id"]},  # 顺带传状态
        )
    return Command(goto=END)                        # 否则结束
```

**和第8章的对应**：这里 `Command(goto="interview")` 等价于第8章 `_run_pipeline` 里"下一步跑 interview"的指令；`update={...}` 等价于 `current_context[f"interview_result"]=...` 的 context 注入。只是从"外部 Python 循环"搬进了"图内节点返回"。

> 💡 `Command(goto=...)` 甚至能**并行**派活：`goto=["resume", "interview"]` 表示同时去两个节点（对应第6章 asyncio.gather 三轨并行的图内写法）。

### 8.2 面孔二：`interrupt()` + `Command(resume=...)` —— 人工中断/恢复（第6章 HITL）

另一个用法是**暂停等用户**（Human-in-the-Loop），这正是第6章试卷批改 `interrupt/resume` 的引擎。
```python
from langgraph.types import Command, interrupt

def hitl_node(state):
    # interrupt() 暂停图，把问题抛给用户，并返回用户这次给的输入
    user_input = interrupt("试卷批改完成，是否确认发布成绩？")
    return {"confirmed": user_input}   # resume 后继续，把用户输入写进 state

# 运行：第一次 invoke 会在 hitl_node 处暂停
app.invoke(initial_state, config)
# 恢复：用 Command(resume=...) 把用户输入喂回去
app.invoke(config, Command(resume="yes"))
```

### 8.3 两副面孔对照（别混）

| | 交接（goto） | 中断（resume） |
| --- | --- | --- |
| 作用 | 把控制权交给**另一个 Agent/节点** | 暂停等**用户**输入 |
| 触发 | 节点返回 `Command(goto=..., update=...)` | 节点里 `interrupt(value)` |
| 恢复 | 由被 goto 的节点继续 | 外部 `Command(resume=输入)` 喂回 |
| 对应图谱 | ③ Handoff | 第6章 HITL / 第8章 clarify |
| 对应第8章 | `_run_pipeline` 下一步 / `_aggregate_pipeline` | 第6章 interrupt/resume 检查点 |

**一句话**：`Command` 是 LangGraph 的「控制流 + 状态更新」统一返回对象——`goto` 管"下一个 Agent 是谁"，`resume` 管"用户回来那一下"。多 Agent 图、HITL、Pipeline 都建立在它之上。

---

## 9. 补充：Swarm（群组）架构 —— 没有监督者的对等移交

前面 §3.3 的 `create_supervisor` 是有"总调度"的；而 **Swarm 是另一种思路：把监督者去掉，让一群对等 Agent 靠 handoff 互相移交控制权**。这是 LangGraph 官方 companion 包 `langgraph-swarm` 实现的模式，也是 OpenAI Swarm 的核心思想。

> 📌 **对应图解 ③ Handoff/委派**：Swarm 和图谱里的 ③ 是**同一族**——"Agent 间对等移交、无固定中心"。图解里 ③ 卡片现改名为「Swarm / Handoff」以显式点出。

### 9.1 核心机制：Agent 自己决定"把活交给谁"

**先看整体结构**——Swarm 本质上是一张"父图"，每个 Agent 是父图里的一个节点（子图），彼此之间用 `Command(goto=…)` 直接连线跳转：
```
            父图（swarm）
   ┌──────────────────────────────────────────────┐
   │   START ──► [active_agent 路由] ──┬─────────── │   ← 多轮：记住上次是哪个 Agent
   │                                    ▼            │
   │   ┌──────────┐  Command(goto, PARENT)  ┌────────┐ │
   │   │ resume  │ ───────────────────────► │ qa     │ │
   │   │ (子图)   │ ◄─────────────────────── │ (子图)  │ │
   │   └──────────┘  Command(goto, PARENT)  └────────┘ │
   │        │  ▲                                   │   │
   │        ▼  │                                   ▼   │
   │   ┌──────────┐  ◄──Command(goto, PARENT)──  ┌────────┐ │
   │   │ interview│                               │ exam   │ │
   │   │ (子图)   │ ────────────────────────────► │ (子图)  │ │
   │   └──────────┘  Command(goto, PARENT)       └────────┘ │
   └──────────────────────────────────────────────────────┘
```

核心机制分三步：

1. **每个 Agent 手上挂一个 handoff 工具**（`create_handoff_tool(agent_name=...)`），它其实是一个"伪工具"——调用它不干活，而是**产生一次跳转命令**；
2. **Agent 判断"该别人干了" → 调 handoff 工具 → 底层返回**：
   ```python
   return Command(
       goto=agent_name,          # 下一站：哪个 Agent
       graph=Command.PARENT,     # 关键：goto 在"父图"里找节点
       update={ "messages": [...完整历史...] },   # 把对话带给下一个 Agent
   )
   ```
3. **`graph=Command.PARENT` 为什么必须**：因为 `goto` 的目标 Agent（如 `qa_agent`）是**父 swarm 图里的一个节点**，不是当前 Agent 子图内部的节点。标了 `PARENT`，LangGraph 才会到【父图】层面去解析这个跳转，把执行从"当前 Agent 节点"切到"目标 Agent 节点"。**这正是"对等移交"的落点——控制权在 Agent 的返回里直接交给了下一个 Agent，不经任何调度节点。**

**多轮记忆**：`create_swarm` 内部用 `add_active_agent_router` 加了一条 `START → route_to_active_agent` 路由，用 `active_agent` 状态记住"上次是哪个 Agent 在干活"，下次对话从这里继续（首次用 `default_active_agent`）。
```python
# pip install langgraph-swarm
from langchain.agents import create_agent
from langgraph_swarm import create_handoff_tool, create_swarm

# 每个 Agent 手上有"把控制权交给别人"的 handoff 工具
transfer_to_qa   = create_handoff_tool(agent_name="qa_agent",      description="把问题交给智能问答")
transfer_to_interview = create_handoff_tool(agent_name="interview_agent", description="带去模拟面试")

resume_agent = create_agent(
    model=model,
    tools=[handle_resume, transfer_to_qa, transfer_to_interview],  # 干活工具 + 移交工具
    name="resume_agent",
    prompt="你是简历审查 Agent；用户要问答就调用 transfer_to_qa。",
)
# 同理建 qa / exam / interview_agent（各自带各自能移交的 handoff 工具）

# 组装 swarm：一群对等 Agent，没有 supervisor
swarm = create_swarm(
    agents=[resume_agent, qa_agent, exam_agent, interview_agent],
    default_agent="qa_agent",        # 用户进来先落在这个 Agent
)
app = swarm.compile(checkpointer=MemorySaver())
```

### 9.2 和三种「有中心」的对比

| | `create_supervisor`（①） | `create_agent+subagents`（②） | **Swarm（③）** |
| --- | --- | --- | --- |
| 有没有调度/主干 | 有，专职 supervisor 节点 | 有，主 Agent 兼任 | **无，全对等** |
| 控制权去向 | 每步回 supervisor | 始终在主 Agent | **Agent 直接交给下一个 Agent** |
| 谁决定"下一步归谁" | supervisor LLM | 主 Agent LLM | **每个 Agent 自己（靠 handoff 工具）** |
| 适合 | 明确分工、要可控调度 | 一个主线偶尔委派 | 大量对等 Agent、要自主交接 |

### 9.3 什么时候用 Swarm

- **适合**：Agent 量大且地位对等、希望各自能自主决定移交、交互是"多轮接力"（可以记住"上次到哪个 Agent"继续）。
- **不适合**：需要强中央控制、流程可预期、审计要求高的场景——Swarm 是去中心的，流程不如 supervisor 好把控。

**一句话**：supervisor 是"有导演的剧组"，Swarm 是"没有导演、演员自己递话的一群人"。

---

## 章节回顾

* **子图**：一张编译图可当另一张图的节点，父子共享 state 键——这是全部能力的地基。
* **`create_supervisor`**：一键生成「总调度图」，worker 子图注册成 tool，靠 LLM + handoff 动态路由。
* **`create_subagent`**：把子图封装成带名字/描述的"可调用子 Agent"，主 Agent 当工具按需调——对应图谱 ② 主Agent+子Agent池。
* **Pipeline = 子图嵌套**：`job_prep_graph` 把 resume/interview 两个子图按序连起来，等价第8章 `_run_pipeline` + `current_context` 注入。
* **嵌套 Supervisor**：supervisor 也能当 worker，做出树状分层调度。
* **`Command` 一叉二用**：`Command(goto=...)` 做 Agent 间交接（③），`interrupt()`+`Command(resume=...)` 做人工中断（第6章 HITL）——多 Agent 图、HITL、Pipeline 都建立在它之上。
* **supervisor vs subagent**：`create_supervisor` 有独立调度节点、每步回 supervisor（①）；`create_agent+subagents` 主 Agent 兼任调度、更轻（②）；模型跟"图"走，supervisor/主 Agent 的 `model` 只管调度/主循环。
* **Swarm（③）**：`langgraph-swarm`，去掉监督者、Agent 靠 `Command(goto, PARENT)` 对等移交——适合大量对等 Agent，但流程不如 supervisor 可控。
* **业务不变，载体换**：同样是"中心化编排"，第8章写在 Python 类里，本回顾画进 LangGraph 图里（supervisor / subagent 两种皆可）。
## 相关笔记

- [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]] — 08章综合笔记（总览 + 全景图）
- [[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]] — 概念范式 + A2A 协议对比
- [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]] — Command/interrupt 的双面孔（goto=交接 / resume=人工恢复）
- [[AI大模型/Agent/asyncio协程调度与6.12回调逻辑|asyncio 协程调度与 6.12 回调逻辑]] — 同书第 6 章异步落地
- [[AI大模型/Agent/多Agent协作系统面试与架构解析|多Agent协作系统面试与架构解析]] — 面试向的多 Agent 落地