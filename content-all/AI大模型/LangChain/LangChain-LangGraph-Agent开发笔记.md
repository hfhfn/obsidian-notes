---
title: LangChain / LangGraph Agent 开发笔记
tags:
- LangChain
- LangGraph
- Agent
- 中间件
- 流式输出
status: 已消化
created: 2026-11-05
modified: '2026-11-14T23:35:23+08:00'
---

# LangChain / LangGraph Agent 开发笔记

> [!abstract] 摘要
> 围绕 `create_react_agent` → `create_agent` 迁移、原生工具调用、中间件、状态图与上下文传递、流式输出的问答整理，附中间件执行顺序、`add_messages` 行为与速查表。

> 本文整理自关于 `create_react_agent` 迁移、`create_agent` 用法、中间件机制、状态图与上下文传递的一系列问答，按主题归纳。最终版补充了中间件执行顺序、流式事件细节、`add_messages` 归约器行为、`context` 的依赖注入定位、结构化输出策略以及 `MessageGraph` 弃用信息。

---

## 一、两代 `create_react_agent` 的区别

| 对比维度     | `langchain.agents.create_react_agent`                        | `langgraph.prebuilt.create_react_agent`                      |
| :----------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| 底层架构     | 旧的 `AgentExecutor`（LCEL 时代遗留）                        | 基于 LangGraph `StateGraph`                                  |
| 工具调用机制 | 文本解析（解析 ReAct 格式文本）                              | 模型原生工具调用（Native Tool Calling）                      |
| Prompt 参数  | 必须传 `PromptTemplate`，含 `{tools}`、`{agent_scratchpad}` 等占位符 | `prompt` 关键字参数，接受字符串 / SystemMessage / 可调用对象 |
| 流式输出     | 支持差，按步骤缓冲                                           | 支持好，`astream(stream_mode="messages")` 可逐 Token         |
| 当前状态     | 维护中，但非官方推荐                                         | **已弃用**，建议迁移至 `langchain.agents.create_agent`       |

**关键结论**：
- 两者都已不是最新推荐。新项目应使用 `langchain.agents.create_agent`。
- 维护旧代码时，不要为了消除弃用警告而盲目从 `langgraph.prebuilt` 迁到 `langchain.agents.create_react_agent`，否则可能导致流式输出失效。
- 官方推荐迁移路径：`langgraph.prebuilt.create_react_agent` → `langchain.agents.create_agent`。

### `langgraph.prebuilt` 模块整体弃用了吗？

**没有。** 只有 `create_react_agent` 这一个函数被弃用。`ToolNode`、`tools_condition` 等组件在 v1 中仍可用（有社区推测它们可能在 2.0 移除，但非官方事实）。

---

## 二、`create_agent` 能否平替 `create_react_agent`

**可以，且功能更强。** `create_agent` 是官方指定的替代品。

主要改进：
- **中间件系统（Middleware）**：可在模型调用、工具执行等关键节点插入自定义逻辑（动态提示词、对话摘要、人工审批、PII 脱敏等）。
- **结构化输出整合进主循环**：不再额外调用一次 LLM，降低延迟和成本。v1 提供两种策略：`ToolStrategy`（用人工工具调用生成结构化输出）和 `ProviderStrategy`（用提供商原生能力）。
- **内置 LangGraph 运行时能力**：持久化、流式、人工介入、时间旅行等。

迁移注意点：
- `prompt` → `system_prompt`
- `config["configurable"]` 传上下文 → 推荐用 `context` 参数
- 流式节点名 `"agent"` → `"model"`

---

## 三、文本解析 vs 原生工具调用（Native Tool Calling）

本质区别：**由谁负责把模型意图翻译成可执行代码。**

**旧版（文本解析）**：模型在自由文本里按 ReAct 格式写 `Thought/Action/Action Input`，框架用正则或字符串规则解析。脆弱——格式一变、JSON 写错就解析失败，参数类型无法严格校验。

**新版（原生工具调用）**：把工具的 JSON Schema 发给模型，模型返回结构化的 `tool_calls` 字段。框架拿到的是对象，可直接按名字找工具、按 Schema 校验参数、执行。参数错误会作为工具结果返回给模型自我修正，且支持**并行调用多个工具**。

### `tool_calls` 很早就存在，为什么 ReAct 在 1.0 才用它？

`tool_calls` 字段早在 **2024 年 4 月**就已引入 LangChain，为不同模型提供商的原生工具调用提供统一接口（此前工具调用信息散落在 `additional_kwargs` 或 `content` 里，格式因提供商而异）。但它不是 1.0 才有的。

那为什么 `create_react_agent` 长期走文本解析？核心原因是**兼容性**：文本解析不依赖模型是否支持原生函数调用，任何 LLM（包括开源离线小模型）都能用；原生工具调用需要模型 API 层面支持 `bind_tools`，当时并非所有模型具备。

LangChain 1.0 让 `create_agent` 默认走原生工具调用，本质是一次**架构决断**：放弃“不支持工具调用模型”的兼容包袱，换取更可靠、更结构化的执行方式。`create_react_agent` 被弃用正是这个决断的体现。

---

## 四、动态提示词与上下文传递

### 示例：用中间件实现动态 System Prompt

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest

@dataclass
class UserContext:
    user_name: str
    user_expertise: str  # "beginner" 或 "expert"

@dynamic_prompt
def personalize_prompt(request: ModelRequest) -> str:
    ctx: UserContext = request.runtime.context
    if ctx.user_expertise == "expert":
        return f"你是资深技术顾问。用户 {ctx.user_name} 是领域专家，请直接给出深度分析。"
    return f"你是耐心的助教。用户 {ctx.user_name} 是初学者，请用通俗比喻解释。"

agent = create_agent(
    model="gpt-5-nano",
    tools=[],
    middleware=[personalize_prompt],
    context_schema=UserContext,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "解释一下向量数据库"}]},
    context=UserContext(user_name="小明", user_expertise="beginner"),
)
```

**要点**：上下文（`context`）传递静态依赖，中间件在调用模型前读取它并动态改写提示词。

### `context` 的官方定位：依赖注入

官方文档将 `context` 描述为**依赖注入（dependency injection）**机制：把数据库连接、用户 ID、配置等注入到工具和中间件中，让它们通过 `runtime.context` 访问，而不是硬编码值或使用全局状态。这使工具更可测试、可复用、灵活。在工具内部通过 `ToolRuntime[Context]` 参数访问 `runtime.context`。

### `context` vs 旧 `config["configurable"]`

```python
# 旧模式（仍向后兼容，但不推荐新项目使用）
agent.invoke({"messages": [...]}, config={"configurable": {"user_id": "user_123"}})

# 新模式（v1 推荐）
agent.invoke({"messages": [...]}, context=UserContext(user_name="小明", user_expertise="beginner"))
```

官方迁移指南确认：旧 `config["configurable"]` 模式仍可工作，但新应用或迁移到 v1 的应用推荐使用 `context` 参数。

- `context_schema` **不是必须**定义的；不传上下文时可省略。定义它能让类型检查生效。
- `@dataclass` 只是简洁声明上下文结构的工具，不是强制要求，普通类 / `TypedDict` / Pydantic 均可。

---

## 五、`create_agent` 基于 Graph 的构建

`create_agent` 返回的是一个**已编译的 LangGraph 图**，核心是循环：模型节点 → 判断是否有工具调用 → 执行工具节点 → 回到模型节点 → 无工具调用则结束。

**“基于 Graph”的意义在可组合性**：返回的 Agent 可作为普通节点嵌入更大的 `StateGraph`。中间件钩子直接运行在这个编译图内部，当 Agent 作为节点放入父图时，中间件随节点一起生效。

```python
from langgraph.graph import StateGraph, START
from langchain.agents import create_agent, AgentState

email_agent = create_agent(model=..., tools=[read_email, send_email], middleware=[...])
code_agent = create_agent(model=..., tools=[run_code, search_docs], middleware=[...])

graph = (
    StateGraph(AgentState)
    .add_node("classify", classify_node)
    .add_node("email_agent", email_agent)
    .add_node("code_agent", code_agent)
    .add_edge(START, "classify")
    .add_conditional_edges("classify", route_function, {"email": "email_agent", "code": "code_agent"})
    .compile()
)
```

---

## 六、状态（State）相关

### `AgentState` 里有什么

`langchain.agents.AgentState` 是 `create_agent` 内部使用的状态，核心字段包括：
- `messages`：消息列表，使用 `add_messages` 归约器
- `jump_to`：Agent 内部控制字段，服务于中间件体系的流程跳转（普通 `StateGraph` 不会因该字段自动跳转）
- `structured_response`：结构化输出结果（使用 `response_format` 时生成）

### `MessagesState` vs `AgentState`

| 状态类                          | 说明                                                         | 建议                                       |
| :------------------------------ | :----------------------------------------------------------- | :----------------------------------------- |
| `MessagesState`                 | LangGraph 通用最小状态，只有 `messages` 字段，内置 `add_messages` 归约器 | **自定义对话图的首选**                     |
| `langchain.agents.AgentState`   | `create_agent` 内部使用的状态，含 `jump_to`、`structured_response` 等 Agent 控制字段 | 仅在需与 `create_agent` 运行时深度配合时用 |
| `langgraph.prebuilt.AgentState` | 已弃用                                                       | 应迁移                                     |

两者**都可以直接传给 `StateGraph`**，但手动构建图时 `MessagesState` 更干净。普通自定义 LangGraph 项目一般不建议直接基于 `AgentState` 扩展图状态。

### `MessagesState` 可以直接执行吗？不需要 `StateGraph` 构建？

**不能直接执行。** `MessagesState` 只是一个**状态模式定义**（一个 `TypedDict`），本身不具备任何执行能力。

它必须作为 `StateGraph` 的 `state_schema` 参数传入，再通过 `.compile()` 编译成可执行图，之后才能 `invoke()` / `stream()`。官方文档明确：`StateGraph` 是构建器类，不能直接执行，必须先 `.compile()`。

流程是：**定义状态模式 → 构建 `StateGraph` → 编译 → 执行**。`MessagesState` 只负责第一步。

### `add_messages` 归约器的非显而易见行为

`add_messages` **不只是追加**。它按消息 ID 匹配并**更新已有消息**，只有 ID 不存在时才追加。这意味着：
- 同一个消息（相同 ID）再次出现时是**更新（覆盖）**，不是产生两条。
- 手动构造消息时**务必带上稳定 ID**，否则每个节点返回都会追加新条目，历史无限增长。

```python
existing = [HumanMessage("hi", id="1"), AIMessage("hello", id="2")]
new = [AIMessage("hello there", id="2")]  # 相同 ID
merged = add_messages(existing, new)
# 结果：HumanMessage("hi", id="1") + AIMessage("hello there", id="2")
```

### `MessageGraph` 已弃用

`MessageGraph` 在 LangGraph v1.0.0 中已弃用，将在 v2.0.0 移除。官方建议使用 `StateGraph` + `messages` key（即 `MessagesState` 或自定义包含 `messages` 字段的状态）替代。

### 如何给 `StateGraph` 添加 `messages` 之外的状态

定义 `TypedDict`，需要**累积**的字段用 `Annotated` 指定**归约器（reducer）**：

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class CustomState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]  # 追加 + 按 ID 更新
    user_id: str                                           # 默认覆盖
    history: Annotated[list[str], lambda old, new: old + [new]]  # 追加合并
```

**归约器解释**：默认节点返回 `{"history": ["新值"]}` 会**覆盖**旧值；加归约器后，LangGraph 用 `old + [new]` 把新值追加到旧列表末尾。连续执行两次，`history` 从 `[]` → `["A"]` → `["A", "B"]`。

**两种场景**：
- 构建独立图 → `StateGraph(CustomState)` 直接用。
- 想扩展 `create_agent` 内部 Agent 的状态 → 用中间件的 `state_schema` 追加字段。

---

## 七、中间件（Middleware）机制

### 钩子（Hook）是什么

框架在特定执行点**预留的插口**。`create_agent` 内部循环（调用模型 → 判断工具 → 执行工具 → 回到模型）的每个步骤前后都有钩子，可插入自定义代码。钩子直接运行在 `create_agent` 返回的编译图内部。

### 两条实现路径

1. **装饰器写法**（适合简单逻辑）：`@before_agent`、`@before_model`、`@after_model`、`@after_agent`、`@wrap_model_call`、`@wrap_tool_call`、`@dynamic_prompt`。
2. **类继承写法**（适合复杂逻辑）：继承 `AgentMiddleware`，重写对应方法。**不是必须继承**——装饰器与类写法底层功能等价。

### 多个中间件的执行顺序（补充）

官方文档明确定义了多个中间件时的执行顺序：

| 钩子类型   | 执行顺序                       | 说明                                                         |
| :--------- | :----------------------------- | :----------------------------------------------------------- |
| `before_*` | **正序**（第一个 → 最后一个）  | `middleware1.before_model()` → `middleware2.before_model()` → `middleware3.before_model()` |
| `after_*`  | **逆序**（最后一个 → 第一个）  | `middleware3.after_model()` → `middleware2.after_model()` → `middleware1.after_model()` |
| `wrap_*`   | **嵌套**（第一个包裹所有后续） | `middleware1.wrap_model_call()` → `middleware2.wrap_model_call()` → `middleware3.wrap_model_call()` → model |

关键规则：`before_*` 正序，`after_*` 逆序，`wrap_*` 嵌套（第一个中间件包裹所有其他中间件和模型调用）。

### 两种 `before_model` 写法等价

你写的类方法：

```python
class StateMiddleware(AgentMiddleware):
    state_schema = MyState

    def before_model(self, state: MyState, runtime):
        count = state.get("call_count", 0)
        return {"call_count": count + 1}
```

和用 `@before_model` 装饰的函数，**在功能上完全等价**。官方文档明确将中间件创建方式分为装饰器方式和类继承方式：装饰器适合单一简单逻辑，类继承适合多钩子或复杂配置。

类方法能被识别，是因为 `AgentMiddleware` 基类内部定义了钩子协议。继承并覆盖 `before_model` 时，`create_agent` 组装执行流程会扫描中间件实例上是否存在这个方法，并把它注册到“模型调用前”的执行队列。装饰器 `@before_model` 本质也是把函数标记为这个钩子，再包装成中间件对象。

所以**“识别”不依赖写法，而依赖 LangChain 对钩子方法的约定**。多个中间件的 `before_model` 按列表顺序依次执行。

### 内置中间件

`SummarizationMiddleware`（对话摘要）、`HumanInTheLoopMiddleware`（人工审批）、`ToolRetryMiddleware` / `ModelRetryMiddleware`（自动重试）、`ToolErrorMiddleware`（工具错误处理）等。

### 不用装饰器的类写法示例

```python
from langchain.agents.middleware import AgentMiddleware
from typing import Callable

class ToolLoggerMiddleware(AgentMiddleware):
    def wrap_tool_call(self, request, handler: Callable):
        print(f"正在执行工具：{request.tool_call['name']}")
        print(f"参数：{request.tool_call['args']}")
        try:
            result = handler(request)
            print("工具执行成功")
            return result
        except Exception as e:
            print(f"工具执行失败：{e}")
            raise
```

### `@wrap_model_call` 示例（动态切换模型）

```python
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from typing import Callable

@wrap_model_call
def dynamic_model(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    model = complex_model if len(request.messages) > 10 else simple_model
    return handler(request.override(model=model))
```

### `@wrap_tool_call` 示例（业务校验 + 拦截短路）

```python
from langchain.agents.middleware import wrap_tool_call
from langchain_core.messages import ToolMessage

@wrap_tool_call
async def enforce_business_rules(request, handler):
    args = request.tool_call["args"]
    if "checkin_date" in args and "checkout_date" in args:
        # ... 计算天数，超过 14 天则直接返回错误，不执行工具 ...
        if duration > 14:
            return ToolMessage(
                content="Error: Maximum stay duration is 14 days.",
                tool_call_id=request.tool_call["id"],
            )
    return await handler(request)
```

### 通过 `state_schema` 扩展状态示例

```python
from langchain.agents.middleware import AgentMiddleware
from langchain.agents import AgentState

class MyState(AgentState):
    user_id: str
    call_count: int

class StateMiddleware(AgentMiddleware):
    state_schema = MyState

    def before_model(self, state: MyState, runtime):
        count = state.get("call_count", 0)
        return {"call_count": count + 1}
```

放进 `create_agent(middleware=[StateMiddleware()])` 后，图状态就包含这些额外字段。**`before_model` 钩子的设计目的就是在每次模型调用之前执行**；`before_*` 类型钩子按中间件在列表中的**正序**执行（第一个中间件的 `before_model` 最先跑）。返回的状态更新字典会被 LangGraph 合并到当前状态，后续节点（包括模型节点）能读到更新后的值。

### 同步 vs 异步

- 用 `invoke()` / `stream()` → 实现同步钩子（如 `wrap_tool_call`）。
- 用 `ainvoke()` / `astream()` → **必须**实现异步钩子（如 `awrap_tool_call`、`awrap_model_call`），否则抛 `NotImplementedError`。
- 推荐同时实现同步与异步版本以保证兼容。

### 必须返回 `handler(request)` 吗

**不是。** `handler(request)` 是“放行”：
- 调用它 → 原流程继续，可处理返回值再返回。
- 不调用、直接返回自定义结果 → **拦截并短路**本次调用（如参数不合规直接返回 `ToolMessage` 错误）。

### 参数与注解

- **Node-style 钩子**（`before_model`、`after_model` 等）：接收 `state` 和 `runtime`；返回值可为状态更新字典。`runtime` **不是必须**——不需要上下文时可只接收 `state`。
- **Wrap-style 钩子**（`wrap_model_call`、`wrap_tool_call`）：接收 `request` 和 `handler`（**必须**，固定签名）。`runtime` 封装在 `request` 内（`request.runtime`），无需单独声明。
- `ModelRequest` 上还有 `system_message`、`messages`、`model_settings` 等可读写字段。
- **类型注解不是强制**，但建议保留：提供类型安全、IDE 提示，且是官方标准写法。

### `handler` 与 `request.override()` 的区别

- `handler(request)`：原封不动放行。
- `handler(request.override(model=model))`：**先改参数再放行**。`override` 可改 `model`、`system_message`、`tools` 等。

### 只有 `@before_model` 才能识别为“模型调用前执行”吗？

**不是。** `before_model` 只是命名上最直观的一个，还有 **`wrap_model_call`** 同样在模型调用前生效。

| 钩子              | 执行时机                | 能力                                           |
| :---------------- | :---------------------- | :--------------------------------------------- |
| `before_model`    | 在**每次** LLM 调用之前 | 修改状态、更新提示词、裁剪消息                 |
| `wrap_model_call` | **包裹**每次 LLM 调用   | 拦截、修改请求（换模型、换工具），决定是否放行 |

`before_model` 适合“改状态/提示词后让流程继续”；`wrap_model_call` 适合“根据条件决定这次调用用什么模型、或拦截”。两者都能在模型调用前生效，设计意图不同。

---

## 八、流式输出（Streaming）

### `invoke()`、`stream()` 在 1.0 之前都有吗？

**都有。** 这两个方法是 LangChain Runnable 接口的基础能力，早在 1.0 之前就存在。旧版 `AgentExecutor` 同样支持 `invoke()` 和 `stream()`。

但 `AgentExecutor.stream()` 的“流式”质量很差：内部循环需要拿到**完整解析结果**（调用工具还是结束）才能决定下一步，模型调用走的是 `ainvoke()` 而非 `astream()`，导致 token 级流式回调无法正常触发。它所谓的“流式”更多是按步骤缓冲输出，而非逐 Token 实时输出。

`create_agent` 基于 LangGraph 运行时，`stream()` 才能真正做到 token 级流式。这是迁移到 1.0 后流式体验改善的根本原因，而不是 `stream()` 这个方法本身是新的。

### 基于 LangGraph 运行时，`stream()` 如何做到 token 级流式？

关键不在 `stream()` 方法本身，而在底层 **LangGraph 运行时**和 `stream_mode="messages"` 参数。

调用 `agent.stream(..., stream_mode="messages")` 时，LangGraph 的 Pregel 引擎在模型节点执行期间，**每生成一个 token（或内容块增量），就立即向上层发射一个事件**。流式输出是一个元组 `(message_chunk, metadata)`，其中 `message_chunk` 是 token 或消息片段，`metadata` 包含图节点和 LLM 调用信息。

内部有一套**流转换器**机制：运行时把模型调用产生的原始输出片段规范化为协议事件，最终以 `AIMessageChunk` 形式逐个交给你迭代。你拿到的每个 `chunk` 就是一个增量（delta），而非完整消息。

完整的 content block 生命周期事件包括：`message-start`、`content-block-start`、`content-block-delta`、`content-block-finish`、`message-finish`。delta 类型包括 `text-delta`、`reasoning-delta`、`tool-call-delta` 等。其中 `tool-call-delta` 只携带参数的新增部分，而不是重复所有累积参数（旧版 `block-delta` 会重复）。

旧版 `AgentExecutor` 做不到这一点，是因为内部循环需要完整模型解析结果才能决定下一步，模型调用走非流式路径，token 在底层就被吞掉了。`create_agent` 基于 LangGraph 图执行模型，天然支持节点内部向外发射中间事件，这才是 token 级流式实现的根本原因。

**注意**：若 `create_agent` 被嵌入更大的父图，父图的 `stream_mode="messages"` **默认不会**透传子图（Agent）内部 token 流，需额外设置 `subgraphs=True`。

---

## 九、其他概念

### `add_conditional_edges` 的第二个参数

**不是节点名**，而是一个**路由函数**：接收当前状态、返回路由决策。默认返回值即目标节点名；也可传第三个参数（字典）做映射。

```python
graph.add_conditional_edges("classify", route_function, {"email": "email_agent", "code": "code_agent"})
```

### 状态图只有 `StateGraph` 一种构建方式吗

**不是。** `StateGraph` 是最常用高层抽象，编译后返回 `CompiledGraph`（本质是 `Pregel` 实例）。官方还提供 **Functional API**（`@entrypoint` + `@task` 装饰器），最终也返回 `Pregel` 实例。多数 Agent 场景首选 `StateGraph`。

### `@dataclass` 为什么把类属性转成对象属性

类属性**所有实例共享**，而上下文数据需**每次调用独立**。`@dataclass` 根据带类型注解的类属性自动生成 `__init__`，把字段赋值到 `self` 成为**实例属性**。这样 `Context(user_name="A")` 与 `Context(user_name="B")` 互不干扰，并发场景不会串数据。

### `from __future__ import annotations` 是什么

Python 的**未来导入语句**，让类型注解**延迟求值**（注解被当作字符串保存，需要时才解析），从而允许前向引用——在类定义完成前就引用它。Python 3.7 起可用，**Python 3.14 起成为默认行为**，届时不再需要手写。

---

## 十、速查表

| 问题                                  | 结论                                                         |
| :------------------------------------ | :----------------------------------------------------------- |
| `langgraph.prebuilt` 整体弃用？       | 否，仅 `create_react_agent` 弃用                             |
| `create_agent` 能平替？               | 能，且功能更强（中间件、结构化输出、Graph 运行时）           |
| 新项目推荐                            | `langchain.agents.create_agent`                              |
| `tool_calls` 何时引入                 | 2024 年 4 月，早于 1.0                                       |
| ReAct 为何 1.0 才用原生工具调用       | 兼容性包袱 vs 可靠性取舍，1.0 做了架构决断                   |
| 自定义对话图状态                      | `MessagesState` 或自定义 `TypedDict`                         |
| `MessagesState` 能直接执行？          | 不能，只是状态模式定义，需经 `StateGraph` 编译               |
| 扩展 `create_agent` 状态              | 中间件 `state_schema`                                        |
| 中间件实现方式                        | 装饰器 或 继承 `AgentMiddleware`（等价）                     |
| 两种 `before_model` 是否等价          | 是，识别依赖钩子约定而非写法                                 |
| 模型调用前执行的钩子                  | `before_model` 和 `wrap_model_call` 都可以                   |
| 多个中间件执行顺序                    | `before_*` 正序，`after_*` 逆序，`wrap_*` 嵌套               |
| 异步调用                              | 必须实现 `awrap_*` 异步钩子                                  |
| 拦截工具调用                          | 不调 `handler`，直接返回自定义结果                           |
| 修改请求参数                          | `request.override(...)` 后再 `handler(...)`                  |
| 上下文传递                            | `context=` + `context_schema`（依赖注入，推荐替代 `config["configurable"]`） |
| `invoke()` / `stream()` 是 1.0 新增？ | 否，早已存在；token 级流式靠 LangGraph 运行时实现            |
| 父图透传子图 token 流                 | 需设置 `subgraphs=True`                                      |
| `add_messages` 归约器行为             | 追加 + 按 ID 更新（不是单纯追加）                            |
| `MessageGraph` 状态                   | v1.0.0 已弃用，用 `StateGraph` + `messages` key 替代         |
| 结构化输出策略                        | `ToolStrategy` 和 `ProviderStrategy`                         |

---

## 相关笔记

- [[AI大模型/LangChain/LangChain1.0迁移总纲|LangChain 1.0 迁移总纲]] — 1.0 包结构与组件「旧 → 新」对照
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]] — AgentExecutor / create_agent / LangGraph 三种建 Agent 对比
- [[AI大模型/Agent/LangChain-Loop-Engineering四层架构|LangChain Loop Engineering 四层架构]] — create_agent 之上的循环工程
- [[AI大模型/LangChain/LangChain1.0-课堂讲义|LangChain 1.0 课堂讲义]] — 面向初学者的入门教学版
- [[AI大模型/LangChain/LangChain-MOC|LangChain MOC]] — 返回 LangChain 内容地图
