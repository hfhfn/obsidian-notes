---
title: 多Agent协作范式七种与A2A协议
tags:
- Agent
- 多Agent
- A2A
- MCP
- Supervisor
- EduAgent
created: '2026-09-04T14:10:24+08:00'
modified: '2026-09-04T14:10:24+08:00'
---

# 多 Agent 智能体分析：本章实现 vs A2A 协议 vs 业界主流协作方式

> 本文是 **08章综合笔记** 的概念侧子文档（对应另一子文档 [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] 讲 LangGraph 落地）。配套定位图见总览 [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]]。

## 学习目标

* 用第 8 章思维导图为骨架，系统梳理「多 Agent 智能体」的完整图景
* 把本章的 Orchestrator 模式放到行业坐标系里，看清它是多智能体协作的**哪一种**形态
* 深入理解 A2A（Agent2Agent）开放协议：它解决了本章没有解决的问题，二者如何互补
* 掌握 A2A 的代码写法（Agent Card + JSON-RPC wire 协议 + 官方 SDK），并逐段讲解
* 盘点业界除「Orchestrator」和「A2A」之外的成熟多智能体协作方式
* 弄清当前最流行的协作方式是什么——用 AI-Coding 的多 Agent 实现（Claude Code / Codex / OpenCode 等）佐证

> 📌 **本文定位**：补充篇。第 8 章正文（8.1–8.7）讲的是「怎么在 EduAgent 内部把四个 Agent 拧成一个系统」；本篇跳出应用，回答三个更宏观的问题——(1) 多智能体到底是什么、有哪几种协作范式；(2) 本章的 Orchestrator 与 Google 的 A2A 协议如何对比、如何互补；(3) 业界现在最流行哪种多智能体协作方式，为什么。**不新增任何代码到项目**，是纯分析文档。

---

## 8.8.1 多 Agent 智能体：一个问题，多种解法

### 为什么需要多个 Agent 而不是一个

单个 Agent 有硬边界：**上下文窗口有限**（塞不下完整知识库）、**心智单一**（一个角色一种能力）、**串行低效**（无法并行）、**职责纠缠**（改一处动全身）。多 Agent 把一个大任务拆给多个「专职 Agent」分头做，换来：

| 收益 | 说明 |
| --- | --- |
| **专业化** | 每个 Agent 只精通一件事（检索、批改、面试），Prompt 更聚焦、更准 |
| **并行** | 独立子任务可同时跑，缩短墙钟时间 |
| **上下文隔离** | 每个 Agent 只看到自己需要的上下文，不互相污染、不超窗 |
| **可分工/可演化** | 增删能力 = 增删 Agent，不重写整个系统 |
| **可观测** | 谁来做的、做了什么一目了然，便于审计与定位 |

### 多 Agent 协作的四个关键维度

判断一个多 Agent 系统「长什么样」，看四个维度即可：

1. **通信方式**：Agent 之间怎么传递信息？直接函数调用（进程内）、消息/事件总线、还是**开放网络协议**（如 A2A）？
2. **控制/编排方式**：谁决定「下一个该谁干活」？中心化调度器、协商式群聊、还是图/流水线的编译期决定？
3. **发现方式**：A 怎么知道「该找谁」？硬编码、注册表、还是动态目录（Agent Card / Directory）？
4. **耦合度 / 开放度**：是**应用内**（intra‑application，同框架同进程）还是**跨应用**（inter‑application，不同厂商不同框架）？

> 💡 **这四个维度是全文的标尺**。第 8 章的实现、A2A、以及后面所有业界方式，本质上都是这四个维度上的不同取值。

---

## 8.8.2 第 8 章实现的多 Agent 模型：应用内 Orchestrator（中心化编排队）

### 一句话概括

第 8 章在四个 Agent 前面架了**统一入口**（`unified_chat.py`，听懂意图）+ **编排器**（`orchestrator.py`，派活），把「用户只说一句话」变成「系统自动路由、串联、返回」。这是经典的 **Orchestrator / Supervisor（中心化编排队，hub-and-spoke）** 模式。

### 用思维导图还原整个模型

```
                           用户一句话
                                │
              ┌─────────────────▼─────────────────┐
              │ 统一入口 unified_chat.py（接待员）│
              │ ① 规则前置拦截 _pre_filter（五类零Token秒回）│
              │ ② LLM 路由 _llm_route（DeepSeek 6类意图）│
              └─────────────────┬─────────────────┘
                                │ routing_decision
              ┌──────┬──────────┴──────────┬───────────┐
             qa      exam/resume/         multi_agent   clarify
         SINGLE流式  interview 引导        PIPELINE     追问
              │        │                   │
              ▼        ▼                   ▼
        Orchestrator（调度台）◄──────── 获取 Agent 图
        ┌──────────────────────────────────────────┐
        │  _agent_graphs 懒加载缓存（QA/EXAM/RESUME/INTERVIEW）│
        │  handle()  ── pipeline_mode? ──┐          │
        │   单Agent: _run_single_agent   │          │
        │   串联:    _run_pipeline       │          │
        │            （前序 structured 注入后序 context）│
        │            _aggregate_pipeline（聚合）      │
        └──────────────────────────────────────────┘
```

### 本章的关键设计（与 A2A 对比时的锚点）

| 设计 | 实现 | 本质 |
| --- | --- | --- |
| **统一 Schema** | `AgentRequest` / `AgentResponse` / `PipelineResult` | 给上层一个框架内统一的「协议」 |
| **图懒加载** | `_get_agent_graph` 用到才 build + 缓存 | 进程内资源优化 |
| **context 注入** | `current_context[f"{agent_type}_result"] = structured` | 前序输出 → 后序输入，是「串联」的灵魂 |
| **单例** | `get_orchestrator()` | 全应用共享一个调度台 |
| **SSE 分发** | 8 种事件类型（routing_decision / progress / token / meta / guidance / pipeline_plan / done / error） | 面向**前端**的流式协议 |
| **Pipeline 定义** | `{"job_preparation": [RESUME, INTERVIEW]}` | **编译期写死**的编排顺序 |

> ⚠️ **划重点（为 8.8.3 埋伏笔）**：注意最后一行的「Pipeline 定义是编译期写死的」。第 8 章的编排**是硬编码的**——`job_preparation` 固定先简历后面试，`_llm_route` 的 6 类 label 固定映射。这是本章和一切「动态编排 / 开放协议」的本质区别。

### 本章模型在四个维度上的取值

| 维度 | 第 8 章的取值 |
| --- | --- |
| 通信 | **进程内直接调用**（`await graph.ainvoke(...)`），无网络协议 |
| 编排 | **中心化 Orchestrator**，硬编码 Pipeline + LLM 意图路由 |
| 发现 | **硬编码**：`_pipelines` 字典 + `_LABEL_TO_AGENT` 映射表 |
| 开放度 | **应用内、同框架（LangGraph）、单进程**，不跨厂商 |

一句话：**第 8 章是一个「自包含的、框架内、写死的」多智能体系统**。它把「多 Agent」这件事做对了（分工、串联、统一入口），但它是**封闭的**。

---

## 8.8.3 第 8 章实现 vs A2A：一个「导演」，一个「外交协议」

### 先厘清前提：A2A 是什么

**A2A（Agent2Agent）** 是 Google 于 **2025 年 4 月**发起、现已捐给 **Linux Foundation** 的**开放协议**，目标是让**不同厂商、不同框架、不同进程**的 AI Agent 之间能互相发现、通信、协作。它解决的是「**互操作**（interoperability）」问题——我的 Agent 是你的 Agent 的「外部伙伴」。

> 🔑 **A2A 与 MCP 的关系（一句话）**：**MCP** 是「Agent ↔ 工具/数据」的接线标准（把工具接到 Agent 上）；**A2A** 是「Agent ↔ Agent」的接线标准（把 Agent 连到 Agent 上）。二者**互补**，不是替代。

### 逐维度对比

| 维度 | 第 8 章 Orchestrator | A2A 协议 |
| --- | --- | --- |
| **通信机制** | 进程内函数调用（`graph.ainvoke`） | 开放的 JSON-RPC 2.0，走 HTTP/SSE/WebSocket |
| **编排控制** | 中心化调度器 + 硬编码 Pipeline | 无中心：任何 Agent 都能给任何 Agent 派任务 |
| **发现方式** | 硬编码映射表 / Pipeline 字典 | 动态：`Agent Card`（Well‑Known URL）+ Agent Directory |
| **松耦合** | 紧耦合（同进程、共享 MemorySaver 检查点） | 松耦合（跨进程、跨厂商，只认协议不认实现） |
| **跨框架** | ❌ 只认 LangGraph | ✅ 框架无关、语言无关 |
| **状态** | 共享 MemorySaver 检查点（`thread_id`） | 任务级状态机（`submitted/working/input-required/completed/failed/canceled`） |
| **结果传递** | `context` 平铺进 `initial_state`（内存） | 结构化 `Artifact`（文件/数据）随任务返回 |
| **流式** | SSE 事件（面向前端） | SSE 流式事件（面向对端 Agent） |
| **安全/鉴权** | FastAPI 依赖注入（`get_current_user`） | 协议内置 `security / authenticationSchemes` |
| **开放性** | 封闭、单应用 | 开放、跨生态 |

### 直观比喻

* **第 8 章的 Orchestrator = 剧组的「导演」**：他坐在片场里，认识每一个演员（Agent），手上有剧本（Pipeline），喊谁谁上。高效、可控，但**只在这个剧组内有效**。
* **A2A = 国家之间的「外交协议」**：它不规定谁是谁的领导，只规定「国与国见面怎么递名片（Agent Card）、怎么谈事（Task）、怎么回话（Message）」。任何国家（厂商）遵守协议就能互通，哪怕语言文化（框架）完全不同。

### 二者不是二选一，而是互补

真正成熟的生产系统**两者都要**：

```
┌────────────────────────────────────────────────────┐
│       你的应用（EduAgent）                          │
│   ┌──────────────┐   ┌──────────────┐              │
│   │  Resume Agent │   │ Interview Agent│ ...       │   ← 应用内：用第8章 Orchestrator 编排
│   └──────┬───────┘   └──────┬───────┘              │
│          └────────┬─────────┘                       │
│            第8章 Orchestrator（导演）               │
└──────────────────┼─────────────────────────────────┘
                   │  用 A2A 协议「对外」协作
       ┌───────────▼────────────┐
       │ 外部 Agent（别的厂商/别的系统）│    ← 应用间：用 A2A 协议互操作
       │  Agent Card + JSON-RPC │
       └────────────────────────┘
```

**分工**：**对内**（同框架同进程）用第 8 章的 Orchestrator——快、省、可控；**对外**（跨系统互操作）用 A2A——开放、标准、可扩展。这也是 Google 官方的主张：**MCP 负责「接工具」，A2A 负责「接 Agent」，具体应用内部怎么编排是你自己的事**。

---

## 8.8.4 A2A 协议详解 + 代码示例

### 四个核心概念（记住这四个单词就抓住了 A2A）

| 概念 | 作用 | 类比 |
| --- | --- | --- |
| **Agent Card** | Agent 的「名片」：描述它是谁、能干什么、在哪、怎么鉴权；通过 `/.well-known/agent.json` 或目录服务发现 | 餐馆门口的菜单 |
| **Task** | 一次「任务」：有唯一 `id` 和状态机（submitted → working → …） | 一单外卖 |
| **Message** | 一次「对话消息」：`role`（user/agent）+ `parts`（TextPart / FilePart / DataPart） | 一张纸条 |
| **Artifact** | 任务产出的「文件/结构化数据」，随任务返回 | 外卖送到的东西 |

### 示例 ①：Agent Card（发现机制，Well-Known URL）

A2A 里的 Agent 先宣告自己的能力，别人才知道「找谁能干什么」。发布在 `https://<agent-host>/.well-known/agent.json`：

```json
{
  "name": "EduAgent-ResumeReviewer",
  "description": "对简历做六维度质量评分并输出改进建议",
  "url": "http://edukb.example.com/resume_agent",
  "version": "1.0.0",
  "provider": { "organisation": "EduAgent-Corp" },
  "documentationUrl": "http://edukb.example.com/docs",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "resume_review",
      "name": "简历审查",
      "description": "六维度评分：整体结构/项目经历/技能匹配/量化成果…",
      "tags": ["resume", "hr", "recruiting"]
    },
    {
      "id": "interview_simulation",
      "name": "模拟面试",
      "description": "针对简历项目做技术+项目双轨深挖",
      "tags": ["interview", "technical"]
    }
  ],
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain", "application/json"],
  "security": {
    "authenticationSchemes": [
      { "scheme": "bearer", "credentials": "${RESUME_AGENT_TOKEN}" }
    ]
  }
}
```

**讲解**：
* `skills` 是能力清单——调用方据此判断「这个 Agent 能不能干我想要的活」，这是 A2A 动态发现的核心。
* `url` 是对端发 JSON-RPC 的入口；`security` 声明鉴权方式，保证跨系统调用安全。
* 第 8 章的「路由到哪个 Agent」是**写死在 `_LABEL_TO_AGENT` 里的**；A2A 的「路由到哪个 Agent」是**读这份 Card 动态决定的**——这就是开放 vs 封闭的分水岭。

### 示例 ②：Wire 协议（一次真实的对话，JSON-RPC 2.0）

这是 A2A 在「线上真正传的东西」，最稳定、最该看懂。客户端（可能是另一个 Agent，也可能是带 LLM 的编排器）向 Resume Agent 的 `url` 发 `message/send`：

```json
// 请求（客户端 → Resume Agent）
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "message/send",
  "params": {
    "task": {
      "id": "task_resume_001"
    },
    "message": {
      "role": "user",
      "parts": [
        { "kind": "text", "text": "请审查这份简历，给出六维度评分。" },
        { "kind": "file", "file": { "name": "liming_resume.pdf", "mimeType": "application/pdf", "bytes": "JVBERi0xLjQ..." } }
      ]
    },
    "acceptedOutputModes": ["application/json"]
  }
}
```

```json
// 响应（Resume Agent → 客户端，同步完成）
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "id": "task_resume_001",
    "status": {
      "state": "completed",
      "message": {
        "role": "agent",
        "parts": [
          { "kind": "text", "text": "简历总体评分 78 分，项目经验有量化缺口。" }
        ]
      }
    },
    "artifacts": [
      {
        "kind": "file",
        "file": {
          "name": "resume_assessment.json",
          "mimeType": "application/json",
          "bytes": "eyJvdmVyYWxsX3Njb3JlIjo3OH0="
        }
      }
    ]
  }
}
```

**讲解**：
* `message.parts` 支持 `text` / `file` / `data` 三种部分——所以 A2A 既能传纯文本，也能传 PDF 简历（`file`）、结构化 JSON（`data`）。这比第 8 章单纯靠 `context` 传文本更通用。
* `result.status.state = completed` 是任务状态机的一种。A2A 的状态机天然支持 `input-required`（需要用户补充）和持续的 `working`（配合 SSE 流式推送）——这正好对应第 8 章 `clarify`（追问）和 QA 的 `progress` 流式，只是 A2A 把它做成了**标准**。
* `artifacts` 是任务产出，像第 8 章 `_run_single_agent` 返回的 `structured`，但跨系统可交换、可持久化。

### 示例 ③：官方 Python SDK（`a2a-sdk` v1.x，Starlette + Agent Executor）

> ✅ **本节已按官方 `a2a-sdk`（PyPI 包名 `a2a-sdk`，实现 A2A 规范 **1.0**）hello-world 示例核实**。需要说明：SDK 在 **v0.3 → v1.0** 做过一次大改——旧版用 `A2AJsonrpcServer` / `AgentHandler` / `A2APartner`，新版换成了 `AgentExecutor` + Starlette 路由。**以下为 v1.x 的正确写法**。

> ⚠️ **包名澄清（2026-09 已上 PyPI 核实）**：Google 官方 Python SDK 的 PyPI 包名就是 **`a2a-sdk`**（发布方 `googleapis-packages@google.com`，仓库 `a2aproject/a2a-python`，最新 v1.1.2）。**`python-a2a` 是另一个人（Manoj Desai）做的第三方社区库，不是官方包**——装的时候务必 `pip install a2a-sdk`，别装成 `python-a2a`。

用官方 SDK 写一个「回声」Agent 服务端——收到什么回什么：

```python
# server.py —— 用 a2a-sdk (v1.x) 起一个 A2A Agent 服务
# 安装：pip install a2a-sdk
import uvicorn
from starlette.applications import Starlette

from a2a.helpers import (
    get_message_text, new_task_from_user_message,
    new_text_message, new_text_part,
)
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import (
    AgentCapabilities, AgentCard, AgentInterface, AgentSkill, TaskState,
)


# 1. 业务逻辑：一个普通类，接到用户请求就返回结果
class EchoAgent:
    async def invoke(self, user_request: str) -> str:
        return f"Echo: {user_request}"


# 2. 用 AgentExecutor 把业务逻辑接入 A2A 协议（负责 Task 状态机 / 事件推送）
class EchoAgentExecutor(AgentExecutor):
    def __init__(self) -> None:
        self.agent = EchoAgent()

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        # 取用户消息；没有 task 就新建一个并入队（类似第8章给每个请求开一个 thread_id）
        task = context.current_task
        if task is None:
            task = new_task_from_user_message(context.message)
            await event_queue.enqueue_event(task)

        updater = TaskUpdater(event_queue=event_queue, task_id=task.id, context_id=task.context_id)
        # 3. 报告"工作中"，让对端流式感知进度（类似第8章 progress 事件）
        await updater.update_status(
            state=TaskState.TASK_STATE_WORKING,
            message=new_text_message("处理中..."),
        )

        query = get_message_text(context.message)
        result = await self.agent.invoke(user_request=query)

        # 4. 把结果作为 Artifact 挂到任务上，并置为 completed
        await updater.add_artifact(parts=[new_text_part(text=result, media_type="text/plain")])
        await updater.update_status(state=TaskState.TASK_STATE_COMPLETED, message=new_text_message("完成"))


# 5. Agent Card：对外发布的"名片"（动态发现）
def build_card() -> AgentCard:
    skill = AgentSkill(
        id="echo", name="Echo",
        description="原样回显收到的文本",
        input_modes=["text/plain"], output_modes=["text/plain"],
    )
    return AgentCard(
        name="Echo Agent", description="原样回显收到的文本", version="1.0.0",
        default_input_modes=["text/plain"], default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        supported_interfaces=[
            AgentInterface(protocol_binding="JSONRPC", url="http://127.0.0.1:9999", protocol_version="1.0")
        ],
        skills=[skill],
    )


# 6. 组装 Starlette 应用：Agent Card 路由 + JSON-RPC 路由
def create_app() -> Starlette:
    store = InMemoryTaskStore()                       # 内存任务存储（生产可换 PostgreSQL）
    executor = EchoAgentExecutor()
    handler = DefaultRequestHandler(executor=executor, task_store=store)
    routes  = create_agent_card_routes(agent_card=build_card())   # 暴露 Agent Card
    routes += create_jsonrpc_routes(handler=handler, task_store=store)  # 暴露 message/send 等
    return Starlette(routes=routes)


if __name__ == "__main__":
    uvicorn.run(create_app(), host="127.0.0.1", port=9999)
```

```python
# client.py —— 另一个 Agent（或编排器）通过 A2A 调用上面的服务
import asyncio

from a2a.client import ClientConfig, create_client
from a2a.helpers import new_text_message
from a2a.types import Role, SendMessageRequest


async def main():
    # 1. 建客户端（非流式）
    config = ClientConfig(streaming=False)
    client = await create_client(base_url="http://127.0.0.1:9999", config=config)

    # 2. 读对端 Agent Card（动态发现：它在哪、能干什么）
    public_card = await client.get_agent_card()
    print(f"对端 Agent: {public_card.name} —— {public_card.description}")

    # 3. 派一个任务（等价于第8章 Orchestrator 把活派给某个 Agent）
    response = await client.send_message(
        SendMessageRequest(role=Role.USER, message=new_text_message("你好，A2A！"))
    )

    # 4. 取对端回复（Task 里 message 各 part 的文本）
    for part in response.result.message.parts:
        print("对端回复:", part.text)


asyncio.run(main())
```

**逐段讲解**：

| 代码 | 对应第 8 章的概念 | 差异点 |
| --- | --- | --- |
| `AgentExecutor.execute` | `_run_single_agent` 里调 Agent 图 | 这里描述的是「**如何响应远程请求**」，不是「如何调图」；且要自己维护 Task 状态机 |
| `TaskUpdater.update_status(WORKING)` | `_pre_filter` 后推 `progress` 事件 | 进度上报被做成**协议级**能力，对端可实时感知 |
| `updater.add_artifact(...)` | `_run_single_agent` 返回 `structured` | 结果以**结构化 Artifact** 挂到任务上，跨系统可交换 |
| `AgentCard(...)` + `create_agent_card_routes` | `AgentType` 枚举 + `_AGENT_DISPLAY` 中文名 | 这里生成的是**公开可发现的 Agent Card**，走 Well-Known 路由 |
| `create_client(...).get_agent_card()` | `_LABEL_TO_AGENT` 硬编码映射 | 这里是**运行时动态发现**，不用写死 |
| `client.send_message(SendMessageRequest)` | `orchestrator.handle(request)` | 把「同一进程内」的派活，变成「跨进程/跨厂商」的派活 |

> 💡 **SDK 说明**：`a2a-sdk` 官方包在 **v0.3 → v1.0** 做过迁移（旧 `A2AJsonrpcServer`/`AgentHandler` 已换成 `AgentExecutor` + Starlette 模式），且有官方迁移指南。**硬要理解 A2A，看示例 ②（wire 协议）就够，它永不变化；示例 ③ 是「怎么在工程里落地」的当前参考**——若你装到的 SDK 版本更晚，以官方文档为准。

---

## 8.8.5 业界除 Orchestrator 和 A2A 之外的成熟多智能体协作方式

前面说过，多 Agent 系统就是在「通信 / 编排 / 发现 / 开放度」四个维度上取值。业界成熟的协作方式可按「**谁来决定下一个谁干活**」分成几大类：

### ① Orchestrator / Supervisor（中心化编排队，hub-and-spoke）—— 第 8 章即此

* **模式**：一个中央调度器读意图/任务，派给一批专职 Worker Agent，汇总结果。
* **代表**：第 8 章 `orchestrator.py`、LangGraph `supervisor`/`create_router`、CrewAI `Crew` + 层级 `Manager Agent`、Amazon Bedrock multi-agent collaboration、LangChain Orchestrator。
* **优点**：可控、可预期、易审计；**缺点**：中心是瓶颈，Pipeline 多为硬编码。

### ② 单一主 Agent + 动态子 Agent 池（single‑driver spawning sub‑agents）—— **AI-Coding 主流，见 8.8.6**

* **模式**：**一个**主 Agent 全权驱动，运行中按需 `spawn` 出一批**临时子 Agent**（探索 / 规划 / 实现 / 评审），子 Agent 共享主 Agent 的上下文，干完即回收，控制权始终在主 Agent 手里。
* **代表**：Claude Code 的 `Agent` 工具与 /agents、OpenAI Codex 的 Tasks、OpenCode 的 subagents、Cursor、Gemini CLI、Devin。
* **优点**：**动态**（主 Agent 用 LLM 决定要不要派活、派给谁）、上下文共享、成本可控、可打断；这本质是①的「运行时动态版」。

### ③ Handoff / 委派（对等移交，peer‑to‑peer delegation）

* **模式**：Agent 之间**互相移交控制权**，没有固定中心；A 觉得该 B 干了就把话柄交给 B。
* **代表**：OpenAI Swarm 的 `agent.handoffs`、OpenAI AgentKit、Claude Code 里子 Agent 之间的交接。
* **优点**：灵活、接近人类团队协作；**缺点**：无中心时流程难全局可控。

### ④ 图 / DAG 流水线（编译期编排）

* **模式**：把任务建模成一张**有向无环图**，节点是 Agent，边是条件/数据流；一次完整执行 = 沿图走一遍。第 8 章每个 Agent 本身（8-node / 12-node 图）就是这种，但**跨 Agent** 的编排是硬编码顺序。
* **代表**：LangGraph（本章用的框架）、LangGraph Studio、Temporal / Prefect（把 DAG 搬进 durable execution）。
* **优点**：确定、可重放、可测试；**缺点**：图结构一旦画死，动态性弱。

### ⑤ 群聊 / 黑板 / 事件总线（协商式，多对多）

* **模式**：多个 Agent 在一个**共享空间**里互相看消息、发言、投票或按需响应，没有单一调度者。
* **代表**：AutoGen / AG2 的 `GroupChat`（带 round‑robin / manager 调度）、CrewAI 的协作式 `Process`、开源的「多 Agent 辩论 / 评审面板」。
* **优点**：适合开放讨论、头脑风暴、交叉评审；**缺点**：可能发散、token 消耗大、收敛难控。

> 🆕 **2026 框架生态重大变化（已核实）**：本框架表里多个「代表」在 2025 底发生了整合——
> * **AutoGen + Semantic Kernel 已合并为「Microsoft Agent Framework」**（2025‑10‑01 公开预览，企业级多 Agent 统一框架，AutoGen / Semantic Kernel 两仓库进入维护模式）；
> * **Anthropic 发布官方「Claude Agent SDK」**，原生支持多 Agent 编排；
> * 其它活跃框架：**CrewAI**（角色化、快速原型）、**Mastra**、**Pydantic AI**、**OpenAI Agents SDK**（handoff 模型）。
> 综合「生产环境落地量」看，**LangGraph 仍是当前生产足迹最大的通用编排框架**（多份 2026 调查一致结论）。

### ⑥ 分层 Supervisor（hierarchical）

* **模式**：Supervisor 下面还可以有 Supervisor，形成树，顶层管战略、底层管执行。
* **代表**：LangGraph 的 nested supervisor 模式、Amazon Bedrock 的多级编排。
* **优点**：适合超大复杂任务；**缺点**：层级深了延迟和协调成本上升。

### ⑦ 联邦 / 开放协议（interop，A2A 一族）

* **模式**：不同厂商的 Agent 通过**标准化协议**互操作，不关心对方内部实现。
* **代表**：**A2A**（Agent↔Agent）+ **MCP**（Agent↔Tool）双协议联用。
* **优点**：跨生态、可扩展、供应商中立；**缺点**：协议本身不解决「怎么编排」，内部怎么协作还得自己定。

### 一张表总览

| 协作方式 | 谁来调度 | 耦合/开放 | 动态性 | 代表 |
| --- | --- | --- | --- | --- |
| ① Orchestrator/Supervisor | 中心调度器 | 应用内 | 低（多硬编码） | 第8章、LangGraph supervisor、CrewAI |
| ② 主Agent+子Agent池 | 一个主Agent | 应用内 | **高**（运行时spawn） | Claude Code、Codex、OpenCode |
| ③ Handoff/委派 | 对等移交 | 应用内 | 中 | OpenAI Swarm、OpenAI Agents SDK |
| ④ 图/DAG流水线 | 编译期图 | 应用内 | 低 | LangGraph、Temporal |
| ⑤ 群聊/黑板 | 协商式 | 应用内 | 中 | Microsoft Agent Framework（原AutoGen GroupChat） |
| ⑥ 分层Supervisor | 层级树 | 应用内 | 中 | Bedrock、LangGraph嵌套、Claude Agent SDK |
| ⑦ 联邦/开放协议 | 去中心/协议 | **跨应用** | 高 | A2A + MCP |

---

## 8.8.6 最流行的是哪种？—— AI-Coding 的多 Agent 实现给出答案

### 直接结论

> **当前最流行的多 Agent 协作方式，是「单一主 Agent + 动态子 Agent 池」（即 ② = ① 的运行时动态版）**。这一点在 AI-Coding 领域体现得最充分——因为 AI-Coding 是「多 Agent」落地最成熟、被验证最多的场景。

### 为什么是 AI-Coding 最能说明问题

AI 编程是**重交互、重多步、重并行、重成本**的场景：一个任务要读代码、做规划、写实现、跑测试、评审改错。它天然逼着工具开发者把「多 Agent」做到极致——所以今天最强的多 Agent 实践几乎都出自这里。

### 逐工具拆解（四个维度上的既定事实）

| 工具 | 多 Agent 形态 | 协作方式 |
| --- | --- | --- |
| **Claude Code** | 主 Agent + `Agent` 工具/子 Agent（Explore、Plan、general‑purpose…）+ 步骤内并行；2026 新增内置「**Agent Teams**」多 Agent 编排器（尚实验性、默认关闭） | ② 主Agent+子Agent池；子 Agent 共享会话上下文，结果回传给主 Agent |
| **OpenAI Codex** | 主 Agent + Tasks 并行拆解 + 子 Agent（/agents、`send_message`/`followup_task` 结构化交接）；生态还有「**Symphony**」（把 Linear 看板变成 Codex 一族 Agent 的控制平面）与「Project Manager」模式 | ②（也含③的交接感） |
| **OpenCode** | 子 Agent 用 `.md` 定义（`agent`/`subagent` 概念），可编排多个子 Agent | ②，且支持跨 Agent 交接 |
| **Hermes**（Nous Research 开源编码 Agent） | 开源自主编码 Agent（hermes-agent.org / `github.com/nousresearch/hermes-agent`），TUI + 持久记忆；常见用法是「一个子 Agent 搜资料、一个改文件、一个跑测试」协同 | ② 主Agent+子Agent池 |
| **Cursor / Windsurf / Gemini CLI** | 一个主 Agent 内部按需并行子任务 | ② 的单主+并行子任务 |
| **Devin** | 一个「软件工程师」Agent 内部分工（浏览器/终端/代码） | 单 Agent 内多能力，近似② |

> 📌 **关于你提到的「Hermes」（已核实）**：经过搜索确认，它指 **Nous Research 的开源自主编码 Agent「Hermes Agent」**（`hermes-agent.org`，与同名的 Hermes 模型家族同源）。它正是「主 Agent + 子 Agent 池」这条 AI-Coding 主线的又一实例——社区里甚至还有「opencode-hermes-multiagent」（为 OpenCode 定制的 17 个专职子 Agent 编排系统），进一步印证了这一模式是当前事实标准。你列的 Claude Code / Codex / OpenCode / Hermes 四个，**全部落在 ② 主Agent+子Agent池 这一种协作方式上**。

### 为什么「主 Agent + 子 Agent 池」胜出，而不是「中心化硬编排队」或「开放协议」

| 与其它方式的对比 | 主 Agent + 子 Agent 池胜出的原因 |
| --- | --- |
| **vs ① 中心化硬编排队（第8章式）** | ① 的 Pipeline 是写死的，换需求要改代码；② 由主 Agent 用 LLM **动态决策**要不要派活、派几个、派给谁——更灵活，且只有一个主 Agent 意味着**上下文、记忆、控制权都集中在一处**，行为可解释、可打断 |
| **vs ⑤ 群聊/黑板** | 群聊会发散、token 浪费大、收敛难；② 的**主 Agent 始终是单一决策者**，子 Agent 是「临时工」，干完回收，成本可控 |
| **vs ⑦ 开放协议（A2A）** | A2A 解决的是**跨系统互操作**，但**不解决「内部怎么编排」**；AI-Coding 工具是**单应用内**协作，用不上跨厂商 —— 所以它们内部用②，对外（若要接外部服务）才可能用 MCP/A2A |
| **共享上下文** | 子 Agent 与主 Agent 共享同一份会话/上下文，不重复加载、不丢脉络，这是图/流水线式（每步独立上下文）难以做到的 |

### 一句话升华

> AI-Coding 用实践证明了：**多 Agent 的最高价值不在「有多少个 Agent」，而在「有一个聪明的调度者（主 Agent）能动态地、按需地把活分给一批临时子 Agent」。** 第 8 章的 Orchestrator 是这个思想的「静态版」——它把「动态决策」降到了「写死的 label 映射 + 硬编码 Pipeline」。

---

## 8.8.7 总结与实践建议

### 本章模型在整个多 Agent 坐标系中的位置

```
          开放度（Coupling）
  跨应用/开放   ★⑦ A2A+MCP （互操作层，对接外部）
              │
  应用内/框架内 │  ★② 主Agent+子Agent池  ← 当前AI-Coding最流行
              │  ★① Orchestrator        ← 第8章所在
              │  ★④ 图/DAG   ★③ Handoff  ★⑤群聊 ★⑥分层
              └───────────────────────────────► 编排重心
              静态/硬编码          动态/协商
```

第 8 章落在「应用内、偏静态中心化」这一格——它是对的、务实的、适合教学与中小系统；但它不是「最前沿的编排形态」。

### 给 EduAgent 的演进建议（三档）

1. **今天（第 8 章已够）**：应用内四个 Agent，用 Orchestrator 统一入口 + 一条硬编码 `job_preparation` Pipeline。**适合**：功能确定、Agent 数量少、都在一个后端里。
2. **明天（动态化）**：把「硬编码 Pipeline」升级为「**主 Agent 动态编排**」——让 LLM 在运行时决定子 Agent 的组成与顺序（即②），新增能力不用改 `_pipelines` 字典。**适合**：Agent 增多、需求多变。
3. **后天（对外开放）**：当需要接入**第三方 Agent / 被第三方接入**时，用 **A2A + MCP** 把 EduAgent 的能力以 `Agent Card` 暴露出去（简历审查、模拟面试、RAG 问答各发一张 Card），实现跨系统互操作。**适合**：平台化、生态化。

### 关于「最流行」的最终答案

* **在 AI-Coding / 通用单应用内**：**主 Agent + 动态子 Agent 池**（Claude Code / Codex / OpenCode / Hermes 的形态）最流行、最被验证。
* **在跨系统互操作**：**A2A + MCP** 是 2025 年以来确立的标准组合，趋势明确。
* **在框架生态**：**LangGraph**（图/状态机，本书所用，当前生产足迹最大）、**CrewAI**（角色化原型快）、**Microsoft Agent Framework**（原 AutoGen + Semantic Kernel 合并，企业级）是最常用的通用编排框架。

---

## 章节总结

* **多 Agent 的四个标尺**：通信方式、编排方式、发现方式、开放度——所有协作范式都是这四个维度上的取值。
* **第 8 章 = 应用内 Orchestrator**：统一入口 + 中心编排 + 硬编码 Pipeline + 进程内直调，封闭、自包含、写死。
* **A2A = 跨应用互操作协议**：Agent Card 动态发现 + JSON-RPC Task/Message/Artifact，开放、标准、框架无关；与 MCP 互补（MCP 管 Agent↔Tool，A2A 管 Agent↔Agent）。
* **第 8 章 vs A2A**：一个「导演」一个「外交协议」，不是替代而是互补——对内用 Orchestrator，对外用 A2A。
* **业界成熟方式有七类**：Orchestrator / 主Agent+子Agent池 / Handoff / 图DAG / 群聊黑板 / 分层Supervisor / 联邦开放协议。
* **最流行的是「主 Agent + 动态子 Agent 池」**：AI-Coding（Claude Code / Codex / OpenCode）用实践证明了它是当前最被验证、最灵活的形态；第 8 章 Orchestrator 是它的「静态版」。

---

## 📋 附录：事实核对记录（已联网核实）

> 本文初稿基于既有知识写成；随后**通过本地代理（Clash `127.0.0.1:7890`）用 Brave Search 联网核实**，并据实修订。下表记录核实结果与出处，方便你溯源：

| # | 待核实点 | 核实结果 | 状态 |
| --- | --- | --- | --- |
| 1 | **A2A 版本 / 治理** | A2A 规范 **v1.0**；Google 于 **2025‑04** 发起、捐给 **Linux Foundation**，TSC 含 AWS/Cisco/Google/IBM/Microsoft/Salesforce/SAP/ServiceNow，Apache 2.0 | ✅ 已核实 |
| 2 | **a2a 官方 Python SDK** | PyPI 包名 **`a2a-sdk`**（实现规范 1.0，兼容 0.3）；**v0.3→v1.0 大改**——旧 `A2AJsonrpcServer`/`AgentHandler` 已换成 **`AgentExecutor` + Starlette 路由**（见示例③，已按官方 hello-world 改写） | ✅ 已核实（示例已更新） |
| 3 | **「Hermes」指什么** | 指 **Nous Research 开源的自主编码 Agent「Hermes Agent」**（`hermes-agent.org`）；社区还有为 OpenCode 定制的多 Agent 编排（opencode-hermes-multiagent） | ✅ 已核实（8.8.6 已更新） |
| 4 | **Codex / OpenCode 2026 现状** | Codex 已支持子 Agent（/agents、send_message 结构化交接），生态有 Symphony（Linear→Codex 控制平面）与 Project Manager 模式 | ✅ 已核实（8.8.6 已更新） |
| 5 | **框架生态 2026** | **AutoGen + Semantic Kernel 已合并为 Microsoft Agent Framework**（2025‑10 公开预览）；Anthropic 发布 Claude Agent SDK；LangGraph 为当前生产足迹最大的通用编排框架 | ✅ 已核实（8.8.5 已更新） |

> 💡 **本次联网方式**：本环境默认无外网，但配置了本地 Clash 代理。核实命令为
> `curl -s -x http://127.0.0.1:7890 "https://api.search.brave.com/res/v1/web/search?q=..." -H "X-Subscription-Token: $BRAVE_SEARCH_API_KEY"`，
> 并抓取了官方 hello-world 源码核对 SDK API。**若检索到的信息在将来又更新，以上表为准重新修订即可。**

> **一句话记忆**：第 8 章教你「怎么在一个应用里把多个 Agent 拧成一股绳」（Orchestrator）；A2A 教你「怎么让不同应用的 Agent 互相握手」（协议）；而 Claude Code 们告诉你——**最流行的是让一个聪明的 Agent 动态地指挥一群临时 Agent**。

---

## 📚 参考来源（本次联网核实）

* [Agent to Agent (A2A) 官方文档与规范 v1.0](https://a2a-protocol.org/latest/) —— 版本、治理、MCP 互补关系
* [A2A 官方仓库 a2aproject/A2A](https://github.com/a2aproject/A2A) 与 [a2a-python SDK](https://github.com/a2aproject/a2a-python) —— 协议与 SDK 源码
* [a2a-samples hello-world 示例](https://github.com/a2aproject/a2a-samples/tree/main/samples/python/agents/helloworld) —— 示例③ 的 SDK 写法依据
* [Announcing the A2A Protocol — Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) —— 协议发起背景
* [Claude Code 多 Agent 文档](https://code.claude.com/docs/en/agent-teams) —— Agent Teams / 子 Agent 编排
* [OpenAI Codex 子 Agent 文档](https://developers.openai.com/codex/subagents) —— Codex 多 Agent 形态
* [Hermes Agent（Nous Research）](https://hermes-agent.org/) —— 你提到的 Hermes 编码 Agent
* [Microsoft Agent Framework 概述](https://learn.microsoft.com/en-us/agent-framework/overview/) —— AutoGen + Semantic Kernel 合并
* [Best Multi-Agent Frameworks 2026（LangGraph/CrewAI/AutoGen 对比）](https://www.langchain.com/resources/ai-agent-frameworks) —— 框架生态现状
## 相关笔记

- [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]] — 08章综合笔记（总览 + 全景图，本子文档的父入口）
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — 同一章的实现侧子文档（LangGraph 落地）
- [[AI大模型/Agent/多Agent协作系统面试与架构解析|多Agent协作系统面试与架构解析]] — 面试向的多 Agent 落地
- [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]] — 同书的 HITL 拆解
