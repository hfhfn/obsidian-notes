---
title: LangChain 1.0 迁移总纲
tags:
- LangChain
- LangChain1.0
- 迁移
- Agent
- RAG
status: 已消化
source: DeepSeek-LangChain 1.0 系列对话（Ollama 调用 / OllamaEmbeddings / Agent 迁移 / 记忆迁移
  / 文档加载与分割 / Supervisor，共 8 篇 HTML）
created: 2026-10-02
modified: '2026-11-06T06:36:58+08:00'
---

> [!abstract] 一句话
> LangChain 1.0 的核心变化是 **包结构重组 + 重心转向 Agent**：`langchain` 主包被精简为「只管 Agent 构建」，旧的链式 API / Memory / 传统 Retriever 移入 `langchain-classic`，各类集成（Ollama、Chroma、OpenAI…）拆成独立合作伙伴包，`langchain-community` 正式停维。**底层 `langchain-core` 的 Runnable 协议（`invoke` / `stream`）没变**，变的是上层如何组织这些组件。

> [!note] 一句话记忆
> **协议不变，组织方式大变。** 你的 `llm.invoke()` 能一直用，是因为 `langchain_core` 的 Runnable 接口还在；你感受到的「变化」几乎全部来自上层包的拆分与 Agent 化。

---

## 0. 一张表看懂包结构（迁移的地基）

| 包 | 状态 | 角色 | RAG / 组件去哪了 |
|------|------|------|------|
| `langchain` | ✅ 核心 | Agent 构建：`create_agent`、中间件 | 只保留建 Agent 的核心导出 |
| `langchain-core` | ✅ 稳定基座（自动依赖） | 基础抽象、Runnable、消息、Prompt | 所有组件的底层接口 |
| `langchain-text-splitters` | ✅ 活跃 | 文本分割器 | `CharacterTextSplitter` 等 |
| `langchain-ollama` / `langchain-openai` / `langchain-chroma` / `langchain-unstructured` … | ✅ 活跃 | 各提供商 / 集成的独立包 | 模型、Embedding、向量库、加载器 |
| `langchain-community` | ⛔ 已日落（2026-05-22 宣布 sunset；2026-06-19 仓库归档只读；末版 `0.4.2`） | 曾经的社区集成大杂烩 | 停止更新，新项目不要依赖 |
| `langchain-classic` | ⚠️ 临时过渡 / 兼容包 | 旧版 Chains / Retrievers / Memory + community re-exports | 只为让老代码能跑，官方不推荐新项目用 |

**关键澄清**：`langchain-classic` 与 `langchain-community` 是**并列**关系，不是包含关系。`classic` 只是把 `community` 里的一部分旧组件 **re-export（转发）** 出来维持兼容。

---

## 1. LLM / Chat Model

> [!warning] 迁移要点
> `langchain_community.llms.Ollama` 在 0.3.1 已废弃、1.0 被移除 → 迁到独立包 `langchain-ollama`，类名变为 `OllamaLLM`（文本补全）或 `ChatOllama`（对话，**推荐**）。

| 方面 | 旧写法 | 1.0 推荐 |
|------|--------|----------|
| 包来源 | `langchain_community.llms` | `langchain_ollama` |
| 类名 | `Ollama` | `OllamaLLM` / `ChatOllama` |
| 返回类型 | 字符串 | `ChatOllama` 返回消息对象，取 `.content` |
| 状态 | 已废弃/移除 | 当前标准 |

```python
# pip install -qU langchain-ollama

# 旧：from langchain_community.llms import Ollama
from langchain_ollama import OllamaLLM

llm = OllamaLLM(base_url="http://localhost:11434", model="qwen2.5:7b", temperature=0)
print(llm.invoke("你是谁"))          # 纯文本补全，返回 str
```

```python
# 更推荐：ChatOllama（对话模型）
from langchain_ollama import ChatOllama

llm = ChatOllama(base_url="http://localhost:11434", model="qwen2.5:7b", temperature=0)
print(llm.invoke("你是谁").content)   # 返回 AIMessage，需取 .content
```

**`ChatOllama` vs `OllamaLLM` 怎么选？**

| 维度 | ChatOllama | OllamaLLM |
|------|-----------|-----------|
| 接口类型 | Chat Model（对话） | LLM（文本补全） |
| 底层端点 | `/api/chat` | `/api/generate` |
| 输入 | 支持消息列表（`HumanMessage`…） | 纯文本字符串 |
| 输出 | `AIMessage`（取 `.content`） | 纯文本字符串 |
| 对话历史 | 原生支持多轮 | 每次独立，无历史 |
| 工具调用 / 结构化输出 | 支持 `bind_tools` / `with_structured_output` | 不支持 |
| 定位 | **当前推荐，绝大多数场景** | Legacy，官方建议不要用 |

> [!tip] 为什么两者 `invoke("你好")` 看起来一样？
> 给 `ChatOllama` 传字符串时，LangChain 会自动包成 `HumanMessage` 再走 `/api/chat`。写法相同，但底层端点与返回类型不同——`ChatOllama` 才能无缝接入 Agent / Memory / 工具调用等高层组件。

**`langchain_core` 不变的是什么？** 它仍是整个生态的协议层：模型、工具、消息、Runnable 的抽象定义都在这里，`invoke()` / `stream()` 仍是统一执行入口。1.0 只是给它增强了表达能力（新增 `.content_blocks` 归一化推理过程/引用/工具调用，老的 `.content` 保留，向后兼容）。**注意消息级也有破坏性变更**：聊天模型返回类型从 `BaseMessage` 收窄为 `AIMessage`，`.text()` 方法改为 `.text` 属性。

---

## 2. Embedding

> [!warning] 迁移要点
> `langchain_community.embeddings.OllamaEmbeddings` 自 0.3.1 起弃用 → 迁到 `langchain_ollama`。**核心 API（`embed_query` / `embed_documents`）不变**，只换导入路径。

```python
# 旧：from langchain_community.embeddings import OllamaEmbeddings
from langchain_ollama import OllamaEmbeddings   # pip install -qU langchain-ollama

embeddings = OllamaEmbeddings(model="mxbai-embed-large")
single_vector = embeddings.embed_query("你的查询文本")
vectors = embeddings.embed_documents(["文档1", "文档2"])
```

**其他 Embedding 的去向：**

| 集成 | 新导入路径 | 状态 |
|------|-----------|------|
| OpenAI / AzureOpenAI | `langchain_openai`（`OpenAIEmbeddings` / `AzureOpenAIEmbeddings`） | 已迁独立包 |
| Hugging Face Hub | `langchain_huggingface`（`HuggingFaceEmbeddings`） | 已迁独立包 |
| SentenceTransformers | 不直接导入，由 `HuggingFaceEmbeddings` 底层调用 | — |
| Baidu Qianfan | 仍在 `langchain_community.embeddings`（`QianfanEmbeddingsEndpoint`） | 无独立包 |
| Llama-cpp | 仍在 `langchain_community.embeddings`（`LlamaCppEmbeddings`） | 无独立包 |

> [!note] 通用入口
> `init_embeddings(model="llama3", provider="ollama")` 是通用初始化函数（自 `langchain` 0.3.9 起就有，非 1.0 新增），底层仍走对应独立包。**为了明确性和可维护性，建议直接导入提供商类。**
>
> 补充：Baidu Qianfan / LlamaCpp 无官方第一方独立包（PyPI 上有个陈旧的第三方 `langchain-qianfan` 0.1.1，2024-10，非官方）。

---

## 3. Prompt

> [!warning] 迁移要点
> 核心组件（`PromptTemplate` / `FewShotPromptTemplate`）早已在 `langchain-core`。旧路径 `from langchain import PromptTemplate` 在 1.0 会**直接 `ImportError`**——主包 `__init__.py` 只保留 `__version__`，既没有 re-export，也没有兼容垫片，必须改。

| 组件 | 旧 | 新 |
|------|----|----|
| PromptTemplate | `from langchain import PromptTemplate` | `from langchain_core.prompts import PromptTemplate` |
| FewShotPromptTemplate | `from langchain import FewShotPromptTemplate` | `from langchain_core.prompts import FewShotPromptTemplate` |
| ChatPromptTemplate | — | `from langchain_core.prompts import ChatPromptTemplate` |

```python
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
```

### 3.1 ChatPromptTemplate 的几种创建方式

- **多角色（最常用）**：`ChatPromptTemplate.from_messages([("system", "..."), ("human", "{question}")])`
- **单消息快捷**：`ChatPromptTemplate.from_template("你好，{name}")`（等价于只有 Human 角色）
- **直接构造**：传 `input_variables` + `promptMessages` 列表（底层控制）
- **元组简写**：`from_messages` 里除 `("role", "content")`，也可直接传 `SystemMessage(...)` / `MessagePromptTemplate` 实例

```python
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个问答助手。只根据以下上下文回答：\n\n{context}"),
    ("human", "{question}"),
])
```

### 3.2 内部属性与 `format_messages`

- `prompt.input_variables` → 模板期待的变量名列表（如 `['input', 'chat_history', 'agent_scratchpad']`）
- `prompt.promptMessages` → 你定义的消息模板对象列表（调试用）
- `format_messages()` → **只在直接走 LCEL 管道时才需要手动调用**；交给 Agent / AgentExecutor 时会自动完成

```python
# 仅当自己拼 LCEL 链时，才需要手动 format
chain = prompt | model
messages = prompt.format_messages(context="...", question="...")
response = chain.invoke(messages)
```

### 3.3 动态提示词 → Middleware

「动态提示词」指根据运行时状态（用户等级、画像、轮次）实时改变提示词。1.0 首选 **Middleware**：

```python
from langchain.agents.middleware import dynamic_prompt, ModelRequest

@dynamic_prompt
def personalized_prompt(request: ModelRequest) -> str:
    user_name = request.runtime.context.user_name
    return f"你是一个助手，请称呼用户为 {user_name}。"
```

> [!important] Prompt 到底还需不需要？
> - **`create_agent` 场景**：不用 `ChatPromptTemplate`。`create_agent` 原生对接 **Message Array（消息列表）**，静态部分用 `system_prompt`，动态部分用 `@dynamic_prompt` 中间件。强行塞模板进去反而会报 `Unsupported message type`。
> - **LCEL 场景（RAG / 翻译 / 摘要 / Few-shot / 结构化输出）**：`ChatPromptTemplate` 依然是核心起点，不可替代。
>
> 一句话：**Agent 里跳过它，但别从工具箱里扔掉。**

---

## 4. Agent

> [!warning] 迁移要点
> `initialize_agent` + `AgentType` + `load_tools` 整套旧模式 → 统一为 `create_agent`。旧的 `AgentType` 枚举（含 `STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION`、`CONVERSATIONAL_REACT_DESCRIPTION`）已从主包移除，其能力被整合进 `create_agent`。

| 旧方式（0.x） | 新方式（1.0） |
|------|------|
| `initialize_agent(tools, llm, agent=AgentType.XXX)` | `create_agent(model=llm, tools=tools, ...)` |
| `AgentType.STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION` | `create_agent` 默认支持多参数工具，无需特殊类型 |
| `AgentType.CONVERSATIONAL_REACT_DESCRIPTION` + `ConversationBufferMemory` | `create_agent(checkpointer=InMemorySaver())` + `thread_id` |
| `agent.run("字符串提示")` | `agent.invoke({"messages": [{"role": "user", "content": "..."}]})` |

```python
from langchain.agents import create_agent
from langchain_ollama import ChatOllama
from langchain.tools import tool          # 注意：1.0 从 langchain.tools 导入 tool

@tool
def calculate(expression: str) -> str:
    """计算数学表达式，例如 '3*3+4'。"""
    return str(eval(expression))   # ⚠️ 仅演示：生产环境不要把用户输入直接交给 eval

model = ChatOllama(model="qwen2.5:7b")
agent = create_agent(
    model=model,
    tools=[calculate],
    system_prompt="你是一个数学助手，使用工具进行计算。",
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "解方程：3x + 4(x + 2) - 84 = y; 其中 x=3"}]
})
print(result["messages"][-1].content)
```

### 4.1 `create_agent` 内部：它就是 ReAct

> [!question] 它是「靠提示词构建 ReAct」还是「一套 workflow 判断」？
> 都不是——它**把标准 ReAct 循环编译成了一张 LangGraph 状态图**。判断逻辑由图边（edge）强制执行，而非提示词约定。

**旧 ReAct 提示词方案 vs `create_agent`：**

| | 旧 ReAct 提示词 | `create_agent` |
|---|---|---|
| 模型输出 | 纯文本 `Thought/Action/Observation` | 原生结构化 `tool_calls` |
| 识别工具调用 | 正则解析文本 | 直接读 `AIMessage.tool_calls` 字段 |
| 循环控制 | 提示词 + 解析器 | 状态图的边判断 |

```text
START
  ▼
[before_agent 钩子]        ← 每次 invoke 只执行一次
  ▼
┌─────────────────────────────┐
│ [before_model 钩子]          │
│      ▼                       │
│ 调用 LLM (bind_tools)        │
│      ▼                       │
│ [after_model 钩子]           │
│      ▼                       │
│ LLM 返回 tool_calls?         │
│  ├─ 是 → [wrap_tool_call]    │
│  │       执行工具、追加 ToolMessage
│  │       回到循环顶部 ─────────┘
│  └─ 否 → 结束循环
└─────────────────────────────┘
  ▼
[after_agent 钩子]         ← 每次 invoke 只执行一次
  ▼
 END
```

- **循环条件**：LLM 被 `bind_tools` 绑定后，每次返回检查 `AIMessage.tool_calls` 是否为空。
- **`before_model` / `after_model`** 包裹每次 LLM 调用（调 3 次模型就执行 3 次）；**`before_agent` / `after_agent`** 包裹整个 Agent 调用（一次 `invoke` 只一次）。
- **`wrap_tool_call`**：包装器，`handler(request)` 才是真正执行工具，可在前后加逻辑 / 重试 / 返回自定义错误。
- 多个 middleware：`before_*` 按列表顺序正序执行，`after_*` 逆序执行。
- `create_agent` 返回的是**已编译的状态机**（`CompiledStateGraph`），可直接 `.invoke()`；要改循环「形状」需作为子图嵌入你自己的 `StateGraph`。

### 4.2 动态提示词 + 工具（静态 + 动态拆分）

```python
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langchain.tools import tool
from dataclasses import dataclass

@tool
def calculate(expression: str) -> str:
    """计算数学表达式，例如 '3*3+4'。"""
    return str(eval(expression))   # ⚠️ 仅演示：生产环境不要把用户输入直接交给 eval

@dataclass
class Context:
    user_level: str = "beginner"

@dynamic_prompt
def level_based_prompt(request: ModelRequest) -> str:
    level = request.runtime.context.user_level
    if level == "expert":
        return "你是一个数学专家，请给出简洁推导，并使用工具计算。"
    return "你是一个耐心的数学老师，请一步步解释，并使用工具计算。"

agent = create_agent(
    model=model,
    tools=[calculate],
    middleware=[level_based_prompt],   # 动态提示词在这里
    context_schema=Context,
)

agent.invoke(
    {"messages": [{"role": "user", "content": "计算 3x + 4，其中 x=3"}]},
    context=Context(user_level="beginner"),
)
```

> [!note] `@dataclass` 与 `context_schema`
> `@dataclass` 是 Python 标准库（与 LangChain 无关），自动生成 `__init__`/`__repr__`。`context_schema=Context` 只是告诉 Agent 运行时上下文的类型，提供类型安全与结构化传参；不写也行（直接传字典），但写出来更规范。

### 4.3 工具的三种来源（取代 `load_tools`）

| 方式                      | 适用场景                 | 示例导入                                                                      |
| ----------------------- | -------------------- | ------------------------------------------------------------------------- |
| 直接导入社区工具类               | 现成外部服务集成（搜索、维基）      | `from langchain_community.tools.tavily_search import TavilySearchResults` |
| Toolkit（工具包）            | 一组协同工具（SQL、代码沙箱）     | `toolkit.get_tools()`                                                     |
| 普通函数（带类型注解 + docstring） | 快速定义简单工具，不想写 `@tool` | `def my_tool(x: str) -> str: ...`                                         |
| MCP                     | 连接 MCP 服务器获取工具       | `langchain_mcp_adapters` / `MCPAdapter`                                   |

> [!info] `load_tools` 并没有让工具消失
> 只是从「字符串别名加载」变成「显式导入类」。1.0 还新增了**模型厂商原生内置工具**（OpenAI/Anthropic 的网页搜索、代码解释器），以字典形式传入 `tools`，由提供商直接执行。

### 4.4 循环上限：`recursion_limit`

> [!note] 它限的是「超步」，不是「工具轮次」
> `create_agent` 的循环上限实际是底层 LangGraph 的 `recursion_limit`，统计图执行的 **superstep（超步）** 数量：一次模型调用算一步，一轮工具执行也算一步。所以 `recursion_limit=25` 大约只够 **12 轮**「模型 → 工具 → 模型」。

**方式一：创建时绑定（推荐，作为该 Agent 的默认值）**

```python
agent = create_agent(
    model=model,
    tools=tools,
).with_config({"recursion_limit": 50})   # 对该 Agent 的所有调用生效
```

**方式二：调用时传入（覆盖默认值，仅本次生效）**

```python
agent.invoke(
    {"messages": [{"role": "user", "content": "..."}]},
    config={"recursion_limit": 50},
)
```

**超限时会抛异常，建议在调用边界捕获：**

```python
from langgraph.errors import GraphRecursionError

try:
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "..."}]},
        config={"recursion_limit": 25},
    )
except GraphRecursionError:
    print("任务步数超限：请拆分问题，或调大 recursion_limit。")
```

| 注意点 | 说明 |
|---|---|
| **默认值** | 版本间有差异：有反馈称较新版本默认高达 9999，并非文档常写的 25 → **显式设置，别依赖默认** |
| **传参位置** | `recursion_limit` 是**顶层 config 键**，放进 `configurable` 内部会被**静默忽略** |
| **按业务语义限流** | 想要「最多调用 5 次搜索工具」，用中间件 `ToolCallLimitMiddleware`（`from langchain.agents.middleware import ToolCallLimitMiddleware`），而不是调 `recursion_limit` |
| **异常处理** | `GraphRecursionError` 别直接暴露给用户，转成可读提示 |

---

## 5. Memory（记忆）

> [!warning] 迁移要点
> 记忆从「独立 Memory 对象」重构为 **`checkpointer`（短期，会话级）+ `store`（长期，应用级）**。`ConversationChain` / 手动 `ChatMessageHistory` / `messages_to_dict` 全部不再是标准做法。

| 旧模式 | 1.0 替代 |
|--------|---------|
| `ConversationChain` + 隐式记忆 | `create_agent` + `checkpointer` |
| 手动维护 `ChatMessageHistory` | `checkpointer` 自动持久化（以 `thread_id` 隔离） |
| `messages_to_dict` / `messages_from_dict` | 不再需要，`checkpointer` 底层处理序列化 |
| `memory_key="history"` 等配置 | 通过 `state_schema` 扩展自定义记忆字段 |

### 5.1 短期记忆：`checkpointer` + `thread_id`

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()   # 开发用；生产换 SqliteSaver / PostgresSaver
agent = create_agent(
    model="ollama:qwen2.5:7b",
    tools=[],
    system_prompt="你是一个乐于助人的助手，用中文回答。",
    checkpointer=checkpointer,
)

config = {"configurable": {"thread_id": "user-123-session-1"}}   # 同一会话复用
agent.invoke({"messages": [{"role": "user", "content": "小明有1只猫"}]}, config)
agent.invoke({"messages": [{"role": "user", "content": "小刚有2只狗"}]}, config)
r = agent.invoke({"messages": [{"role": "user", "content": "小明和小刚一共有几只宠物?"}]}, config)
print(r["messages"][-1].content)   # 正确回答 3 只
```

### 5.2 长期记忆：`store` + `ToolRuntime`

```python
from dataclasses import dataclass
from typing import TypedDict
from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

@dataclass
class UserContext:
    user_id: str

class UserProfile(TypedDict):
    name: str
    city: str

store = InMemoryStore()          # 生产换 PostgresStore
checkpointer = InMemorySaver()

@tool
def save_user_profile(profile: UserProfile, runtime: ToolRuntime[UserContext]) -> str:
    """保存用户信息（姓名、城市）到长期记忆。"""
    user_id = runtime.context.user_id
    runtime.store.put(("users", user_id), "profile", dict(profile))   # 命名空间 + 键
    return f"已保存 {user_id} 的信息。"

@tool
def get_user_profile(runtime: ToolRuntime[UserContext]) -> str:
    """查找当前用户的个人信息。"""
    item = runtime.store.get(("users", runtime.context.user_id), "profile")
    if item:
        info = item.value
        return f"用户姓名：{info.get('name')}，所在城市：{info.get('city')}"
    return "暂无该用户的信息。"

agent = create_agent(
    model="ollama:qwen2.5:7b",
    tools=[save_user_profile, get_user_profile],
    store=store,
    checkpointer=checkpointer,
    context_schema=UserContext,
)
```

> [!note] checkpointer vs store
> | 维度 | Checkpointer（短期） | Store（长期） |
> |------|------|------|
> | 作用域 | 单个 thread（会话级） | 跨所有 thread（应用级） |
> | 内容 | 完整对话状态快照 | 用户偏好、事实、知识等 |
> | API | 框架自动管理 | 工具内显式读写 `runtime.store` |
> | 键 | `thread_id` 自动隔离 | 命名空间元组 + 键（如 `("users", user_id)` / `"profile"`） |

### 5.3 跨会话持久化：把 InMemory 换成落盘 Store

> [!warning] 为什么 `InMemoryStore` / `InMemorySaver` 不算「记忆」
> 二者都只活在**当前进程**里：进程一退，长期记忆和会话历史一起没了。真正的「跨会话」需要把 `store` 和 `checkpointer` **都**换成落盘实现。好在接口完全不变——`put` / `get` / `search` 照旧，只需改构造方式。

| 用途                 | 开发期             | 持久化（单机）       | 持久化（生产 / 多实例）   |
| ------------------ | --------------- | ------------- | --------------- |
| `store`（长期）        | `InMemoryStore` | `SqliteStore` | `PostgresStore` |
| `checkpointer`（短期） | `InMemorySaver` | `SqliteSaver` | `PostgresSaver` |

### 5.3.1 先装包：SQLite / Postgres 实现来自两个独立发行包

> [!warning] 这些类**不在** `langgraph` 主包里
> `langgraph` 只提供 `langgraph.checkpoint.base` / `langgraph.store.base` 这些抽象基类。只装 `langgraph` 时，`from langgraph.checkpoint.sqlite import SqliteSaver` 会直接 `ModuleNotFoundError`——具体实现要另装下面两个包。

```bash
# 单机 / 开发期：SQLite
pip install langgraph-checkpoint-sqlite

# 生产 / 多实例：Postgres（psycopg 必须带 binary，见下）
pip install "psycopg[binary,pool]" langgraph-checkpoint-postgres
```

**导入路径 → 提供它的包**

| 导入                                     | 所在包                             | 额外运行时依赖                   |
| -------------------------------------- | ------------------------------- | ------------------------- |
| `langgraph.checkpoint.sqlite.SqliteSaver` | `langgraph-checkpoint-sqlite`   | `sqlite3`（标准库，免装）          |
| `langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver` | 同上                              | `aiosqlite`               |
| `langgraph.store.sqlite.SqliteStore` / `.aio.AsyncSqliteStore` | 同上                              | `sqlite-vec`（仅启用向量索引时加载）   |
| `langgraph.cache.sqlite.SqliteCache`   | 同上（3.x 起新增缓存模块）                 | —                         |
| `langgraph.checkpoint.postgres.PostgresSaver` | `langgraph-checkpoint-postgres` | `psycopg` **v3**          |
| `langgraph.checkpoint.postgres.aio.AsyncPostgresSaver` | 同上                              | `psycopg` v3              |
| `langgraph.store.postgres.PostgresStore` / `.aio.AsyncPostgresStore` | 同上                              | `psycopg` v3 + `psycopg-pool` |

装包时会自动拉进来的（截至 2026-11 的元数据）：

- `langgraph-checkpoint-sqlite` → `aiosqlite`、`sqlite-vec`、`langgraph-checkpoint`
- `langgraph-checkpoint-postgres` → `psycopg`、`psycopg-pool`、`orjson`、`langgraph-checkpoint`

> [!important] `psycopg` 3 ≠ `psycopg2`，且 Windows 上要装 `[binary]`
> 纯 Python 版 `psycopg` 启动时要去磁盘找 `libpq.dll`，找不到就抛 `ImportError: no pq wrapper available`。`psycopg[binary]` 自带 libpq，**Windows 必装**。旧文档里 extras 写的 `pool` 现在已是硬依赖，写不写都会装上，写上只是兼容旧命令。

**版本兼容（对照本机现状）**

| 你的 `langgraph`      | 可用 `langgraph-checkpoint` | SQLite 实现包                                              | Postgres 实现包   |
| ------------------ | ------------------------ | ------------------------------------------------------- | -------------- |
| 1.0.x（本机：1.0.1）    | 2.1.x ~ 3.x              | `3.0.3`（保守可留在 `2.0.11`，要求 checkpoint 2.x）                | `3.0.5`        |
| 1.2.x（当前最新 1.2.20） | 4.3.x                    | `3.1.3`                                                 | `3.2.0`        |

> [!warning] 裸装最新版会依赖冲突
> 2026-11 的最新实现包都要求 `langgraph-checkpoint>=4.3`，而 `langgraph 1.0.1` 把上限锁在 `<4.0.0` → 直接 `pip install langgraph-checkpoint-sqlite`（或带 `-U`）会报 `ResolutionImpossible`。二选一：

```bash
# A. 保留现有 langgraph 1.0.x：钉住实现包版本
pip install "langgraph-checkpoint-sqlite==3.0.3"
pip install "langgraph-checkpoint-postgres==3.0.5"

# B. 整体升级：实现包会把 langgraph 带到 1.2.x 线
pip install -U langgraph langgraph-checkpoint-sqlite langgraph-checkpoint-postgres "psycopg[binary]"
```

**Postgres 服务端侧还需要什么**

- `setup()` 负责建表 + 跑迁移，**幂等**，首次调用一次即可；连接账号需要 `CREATE TABLE` 权限。
- `PostgresStore` **只在传了 `index=` 配置时才需要 pgvector**（迁移里会 `CREATE EXTENSION vector`）；不做向量检索就不必装扩展。
- `from_conn_string(...)` 内部已设好 `autocommit=True` / `row_factory=dict_row`；如果你自己传 `Connection` 对象，这些参数要自己设，否则 `setup()` 建完表也可能不生效。

**常见报错对照**

| 报错                                                | 原因                        | 处理                                         |
| ------------------------------------------------- | ------------------------- | ------------------------------------------ |
| `ModuleNotFoundError: langgraph.checkpoint.sqlite` | 没装实现包                     | `pip install langgraph-checkpoint-sqlite`  |
| `ModuleNotFoundError: aiosqlite`                  | 用了 `AsyncSqliteSaver`      | 补 `aiosqlite`                              |
| `ModuleNotFoundError: psycopg` / `psycopg_pool`   | 驱动缺失                      | `pip install "psycopg[binary,pool]"`       |
| `ImportError: no pq wrapper available`            | psycopg 找不到 libpq          | 改装 `psycopg[binary]`，别只装纯 `psycopg`          |
| `extension "vector" is not available`             | Store 配了向量索引但库没有 pgvector | `CREATE EXTENSION vector;`（需管理员）           |
| `sqlite3.OperationalError: not authorized`        | 该解释器的 `sqlite3` 禁用了扩展加载     | 换 python.org 官方 Python，或干脆不用向量索引          |
| 类型/属性报错，提示 `psycopg2`                              | 混装了 psycopg2               | 卸载 `psycopg2` / `psycopg2-binary`，统一用 psycopg 3 |

**一行自检**

```bash
pip show langgraph langgraph-checkpoint langgraph-checkpoint-sqlite langgraph-checkpoint-postgres psycopg psycopg-pool aiosqlite sqlite-vec
python -c "import langgraph.checkpoint.sqlite, langgraph.store.sqlite; print('sqlite ok')"
python -c "import langgraph.checkpoint.postgres, langgraph.store.postgres; print('pg ok')"
```

```python
# pip install langgraph-checkpoint-sqlite（含 aiosqlite / sqlite-vec，版本见 5.3.1）
from dataclasses import dataclass
from typing import TypedDict

from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.store.sqlite import SqliteStore

STORE_DB = "agent_store.db"              # 长期记忆：用户画像、事实
CHECKPOINT_DB = "agent_checkpoints.db"   # 短期记忆：每个 thread 的对话状态

@dataclass
class UserContext:
    user_id: str

class UserProfile(TypedDict):
    name: str
    city: str

@tool
def save_user_profile(profile: UserProfile, runtime: ToolRuntime[UserContext]) -> str:
    """保存用户信息（姓名、城市）到长期记忆。"""
    runtime.store.put(("users", runtime.context.user_id), "profile", dict(profile))
    return f"已保存 {runtime.context.user_id} 的信息。"

@tool
def get_user_profile(runtime: ToolRuntime[UserContext]) -> str:
    """查找当前用户的个人信息。"""
    item = runtime.store.get(("users", runtime.context.user_id), "profile")
    if item:
        return f"用户姓名：{item.value.get('name')}，所在城市：{item.value.get('city')}"
    return "暂无该用户的信息。"

with (
    SqliteStore.from_conn_string(STORE_DB) as store,
    SqliteSaver.from_conn_string(CHECKPOINT_DB) as checkpointer,
):
    store.setup()          # 建表 / 跑迁移，幂等，只在首次真正执行
    checkpointer.setup()

    agent = create_agent(
        model="ollama:qwen2.5:7b",
        tools=[save_user_profile, get_user_profile],
        store=store,
        checkpointer=checkpointer,
        context_schema=UserContext,
    )

    # 会话 1：写入长期记忆
    agent.invoke(
        {"messages": [{"role": "user", "content": "帮我记一下：我叫小明，住在杭州"}]},
        config={"configurable": {"thread_id": "session-1"}},
        context=UserContext(user_id="u-001"),
    )

    # 会话 2：换成全新 thread（等价于换会话，甚至重启进程后再来）
    # 短期对话历史是空的，但 store 里的画像还在
    r = agent.invoke(
        {"messages": [{"role": "user", "content": "我叫什么？住在哪？"}]},
        config={"configurable": {"thread_id": "session-2"}},
        context=UserContext(user_id="u-001"),
    )
    print(r["messages"][-1].content)   # 仍能答出：小明 / 杭州
```

> [!important] 关键点
> - **两个库分工不同**：`store` 存「跨会话的事实」，`checkpointer` 存「某个 thread 的对话状态」。想让**新会话记得你**靠 `store`；想让**同一会话接着聊**靠 `checkpointer`。
> - **换掉 `thread_id` 就是新会话**，而 `user_id` 不变 → 长期记忆仍能命中。这正是「持久化」的意义。
> - `namespace` 是**元组**：`("users", user_id)`。多租户再往前加一段 → `(tenant_id, "users", user_id)`。
> - 两个库可以放同一个 SQLite 文件（表名不冲突），但示例刻意分成两个文件，避免 SQLite 写锁互相干扰。

**换成 Postgres（生产 / 多实例）：**

```python
# pip install "psycopg[binary,pool]" langgraph-checkpoint-postgres（版本见 5.3.1）
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.postgres import PostgresStore

DB_URI = "postgresql://user:pass@localhost:5432/langgraph"

with (
    PostgresStore.from_conn_string(DB_URI) as store,
    PostgresSaver.from_conn_string(DB_URI) as checkpointer,
):
    store.setup()
    checkpointer.setup()
    # 其余代码与 SQLite 版完全一致
```

> [!tip] 迁移成本几乎为零
> `BaseStore` / `BaseCheckpointSaver` 是同一套接口，换实现只改两行 import + 构造。要接 Redis / DynamoDB 等自定义后端，实现 `BaseStore` 的 `put` / `get` / `search` 即可。

### 5.4 `ToolRuntime` 里有什么 / `context` 里放什么

| `ToolRuntime` 属性 | 说明                                 |
| ---------------- | ---------------------------------- |
| `state`          | 当前图状态（消息历史 + 自定义字段）                |
| `context`        | 静态运行时上下文（user_id、DB 连接等）           |
| `store`          | 长期记忆存储实例（`BaseStore`）              |
| `stream_writer`  | 向自定义流写进度/中间结果                      |
| `tool_call_id`   | 当前工具调用唯一 ID                        |
| `config`         | 当前 `RunnableConfig`                |
| `execution_info` | 执行身份（`thread_id`、`run_id` 等，需较新版本） |
| `server_info`    | 服务端元数据（仅 LangGraph Server 有值）      |

**`context` 里通常放**（单次运行内不变的静态依赖）：用户身份（`user_id`/角色/权限）、连接与凭证（DB 连接、API Key、服务地址）、环境配置（`session_id`、功能开关、租户 ID）。

> [!tip] 三种 Runtime 入口
> 1. **工具内**：`ToolRuntime`（统一入口，取代旧的 `InjectedState`/`InjectedStore`/`get_runtime`）
> 2. **中间件**：node-style hook 直接声明 `runtime: Runtime`；wrap-style hook 用 `request.runtime`
> 3. **LangGraph 图节点**：`runtime: Runtime[ContextSchema]`（底层能力，`ToolRuntime` 是它在工具场景的封装）

> [!note] `thread_id` / `session_id` / `tenant_id` / `user_id`
> - `thread_id` 就是 LangGraph 用来定位检查点的键；应用层的 `session_id` 常被拿来填 `thread_id`。
> - 多租户生产建议：`thread_id = f"{tenant_id}:{user_id}:{session_id}"`，防止会话 ID 碰撞导致状态串扰。
> - `tenant_id` 与 `user_id` 是**包含关系**：一个租户下有多个 user，前者是更高层级的隔离边界。

---

## 6. Indexes（RAG 基础组件）

> [!note] Retriever 属于 Indexing 体系
> 早期文档中 Indexing 是顶层概念，含四个子组件：**Document Loaders / Text Splitters / VectorStores / Retrievers**。1.0 里这个模块的边界被打散，分散到各独立包中，传统 Retriever 类定义移入 `langchain-classic`。

### 6.1 Loader（文档加载）

| 格式 | 推荐加载器 | 位置 / 状态 |
|------|-----------|------------|
| 通用（txt/Word/PDF/PPT/Excel…） | `UnstructuredLoader` | `langchain-unstructured` ✅ 独立包 |
| txt | `TextLoader` | `langchain_community` ⛔ 停维，无独立包 |
| Word | `UnstructuredWordDocumentLoader` / `Docx2txtLoader` | `langchain_community` ⛔ |
| PDF | `PyMuPDFLoader` / `PDFPlumberLoader` | `langchain_community` ⛔ |
| PDF（更快的替代） | `PyPDFium2Loader`（基于 pypdfium2，速度快、图像提取好；与 `PyPDFLoader` **并存**，并非弃用关系） | `langchain_community` ⛔ |
| PPT | `UnstructuredPowerPointLoader` | `langchain_community` ⛔ |
| Excel | `UnstructuredExcelLoader` | `langchain_community` ⛔ |
| CSV | `CSVLoader`（`document_loaders.csv_loader`） | `langchain_community` ⛔ 停维，无独立包 |
| PDF/网页（高保真） | `DoclingLoader` / `MinerULoader` | `langchain-docling` / `langchain-mineru` ✅ 独立包 |

```python
# 旧：from langchain_community.document_loaders import UnstructuredFileLoader
from langchain_unstructured import UnstructuredLoader   # pip install langchain-unstructured

loader = UnstructuredLoader("衣服属性.txt", encoding="utf8")
docs = loader.load()
print(docs[0].page_content[:200], docs[0].metadata)
```

> [!warning] `UnstructuredFileLoader` → `UnstructuredLoader` 参数变化
> - `mode`（`"elements"` / `"paged"`）**被移除** → 改用 `chunking_strategy`（如 `"by_title"` / `"basic"`）。
> - `url` 参数含义**变为 API 服务器地址**（加载远程文档需另找方式）。
> - API 模式：`UnstructuredLoader(file_path=..., api_key=..., partition_via_api=True)`。
> - 本地运行需系统依赖（`poppler-utils`、`libreoffice`、`libmagic` 等），官方推荐 Docker。

### 6.2 Splitter（文本分割）

```python
# 旧：from langchain.text_splitter import CharacterTextSplitter
from langchain_text_splitters import CharacterTextSplitter   # pip install langchain-text-splitters

splitter = CharacterTextSplitter(separator=" ", chunk_size=100, chunk_overlap=0)
```

> [!important] `split_text` vs `split_documents`（本质区别：是否携带 metadata）
> - `split_text(text)`：输入纯字符串 → 输出 `List[str]`，**丢失所有元数据**。
> - `split_documents(documents)`：输入 `Document` 列表 → 输出 `Document` 列表，**保留并透传 `metadata`（source/page 等）到每个子块**。
> - 选择：来自加载器的文档（要追踪来源）→ `split_documents`；临时字符串 → `split_text`。

### 6.3 VectorStore（向量库）

| 向量库 | 新导入路径 | 状态 |
|--------|-----------|------|
| Chroma | `from langchain_chroma import Chroma` | ✅ 独立包 |
| Milvus | `from langchain_milvus import Milvus` | ✅ 独立包 |
| FAISS | 仍 `from langchain_community.vectorstores import FAISS` | 通常可用 |
| AstraDB | `langchain-astradb` | ✅ 独立包 |

```python
# 旧：from langchain_community.vectorstores import Chroma
from langchain_chroma import Chroma          # pip install langchain-chroma
from langchain_ollama import OllamaEmbeddings

embeddings = OllamaEmbeddings(model="mxbai-embed-large")
docsearch = Chroma.from_texts(texts, embeddings)      # 用法不变
docs = docsearch.similarity_search("1937年北京大学发生了什么？")
```

> [!note] 没有统一的「store 包」
> 每个向量库各有自己的 `langchain-` 独立包（`langchain-chroma`、`langchain-milvus`…），不存在一个统一的「langchain-store」。

### 6.4 Retriever（检索器）

> [!important] Retriever 从「类」变成「模式」
> 大部分检索器不是独立类，而是向量库的方法——`vectorstore.as_retriever()` 返回的 `VectorStoreRetriever` 就来自向量库包本身，无需额外「retriever 包」。

| 检索器 | 现状 / 正确做法 |
|--------|----------------|
| VectorStore Retriever / Pinecone·Weaviate Hybrid | 就是向量库自带方法，`vectorstore.as_retriever()` 即可 |
| ElasticSearch BM25 | 迁到 `langchain_elasticsearch`，用 `BM25RetrievalStrategy` |
| Wikipedia | ❌ 不是向量库，是外部数据源 → 用 `WikipediaQueryRun` **工具**让 Agent 调用 |
| SVM / TF-IDF Retriever | ❌ 底层是 sklearn 算法，非存储 → 自定义 `BaseRetriever` 调 sklearn，或改用 BM25 |
| ChatGPT Plugin Retriever / Databerry | 已废弃 / 淘汰 |
| 传统检索器（BM25 等） | 移入 `langchain-classic` / 仍在 `langchain-community`（停维） |

```python
# FAISS 没有独立包，仍在 langchain_community
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings

embeddings = OllamaEmbeddings(model="mxbai-embed-large")
texts = ["北京大学创办于 1898 年。", "1937 年因抗战南迁长沙、昆明。"]

db = FAISS.from_documents(texts, embeddings)
retriever = db.as_retriever(search_kwargs={"k": 1})
docs = retriever.invoke("北京大学什么时候成立的")     # 注意：旧版 get_relevant_documents 已不推荐
```

> [!warning] `get_relevant_documents` → `invoke`
> 检索器现在也是 Runnable，统一用 `.invoke(query)`。旧的 `get_relevant_documents()` 属于旧接口。

---

## 7. 旧链式 API（Chains）

> [!warning] 迁移要点
> `LLMChain`、`SimpleSequentialChain`、`create_retrieval_chain` 等**已从 `langchain` 主包移除**——`from langchain.chains import LLMChain` 会直接 `ImportError`。但它们**并未消失**：被移入了 `langchain-classic`，如 `from langchain_classic.chains import LLMChain` 仍可导入。新项目官方推荐用 **LCEL 管道**替代。

| 旧版 | 新版 LCEL |
|------|-----------|
| `LLMChain(llm=llm, prompt=prompt)` | `prompt \| llm \| StrOutputParser()` |
| `chain.run(question="...")` | `chain.invoke({"question": "..."})` |
| 返回 `dict`（`{"text": ...}`） | 直接返回字符串（配 `StrOutputParser`） |
| `SimpleSequentialChain([c1, c2])` | `c1 \| (lambda x: {...}) \| c2` |

```python
from langchain_core.prompts import PromptTemplate
from langchain_ollama import OllamaLLM
from langchain_core.output_parsers import StrOutputParser

llm = OllamaLLM(model="qwen2.5:7b")

first_chain  = PromptTemplate.from_template("我的邻居姓{lastname}，他生了个儿子，给他儿子起个名字") | llm | StrOutputParser()
second_chain = PromptTemplate.from_template("邻居的儿子名字叫{child_name}，给他起一个小名") | llm | StrOutputParser()

# 关键：中间用 lambda 把「字符串输出」包成下一条链需要的「字典输入」
overall_chain = first_chain | (lambda name: {"child_name": name}) | second_chain
print(overall_chain.invoke({"lastname": "王"}))
```

> [!tip] 迁移最易忽略点
> `SimpleSequentialChain` 会把上一条链的输出字符串**直接**喂给下一条；而 LCEL 每条链期望**字典**输入（因为 `PromptTemplate` 要按变量名填充）。中间必须加 `lambda name: {"child_name": name}` 做字段名转换。

### 7.1 查看链的中间结果

> [!tip] 三种粒度，按需要选
> - **`.stream()`**：只吐**最终输出**的增量，适合打字机效果，看不到中间步骤。
> - **`.astream_events(version="v2")`**：吐**每个 Runnable** 的 start / end + token 级事件，调试中间步骤用它。
> - **`RunnableLambda` 插桩**：最轻量，只在你自己指定的点上打印，不影响返回值。

```python
import asyncio

async def debug_chain():
    # 事件类型：on_chain_start / on_chain_end（每个 Runnable 都会触发）
    #           on_llm_*（OllamaLLM）/ on_chat_model_*（ChatOllama）
    async for event in overall_chain.astream_events({"lastname": "王"}, version="v2"):
        kind = event["event"]

        if kind == "on_chain_start":
            print(f"\n▶ 开始 {event['name']}")
        elif kind == "on_chain_end":
            print(f"■ 结束 {event['name']} → {event['data'].get('output')!r}")
        elif kind in ("on_llm_stream", "on_chat_model_stream"):
            chunk = event["data"].get("chunk")
            text = chunk.content if hasattr(chunk, "content") else chunk   # 兼容 LLM / ChatModel
            print(text or "", end="", flush=True)

asyncio.run(debug_chain())
```

典型输出（能看到「生成名字 → 字典转换 → 起小名」每一步的进出）：

```text
▶ 开始 RunnableSequence
▶ 开始 PromptTemplate
■ 结束 PromptTemplate → PromptValue(...)
▶ 开始 OllamaLLM
小明的邻居家的儿子叫王小明……■ 结束 OllamaLLM → '王小明'
▶ 开始 <lambda>
■ 结束 <lambda> → {'child_name': '王小明'}
▶ 开始 RunnableSequence
...
```

**只要最终结果，不需要中间步骤时，用 `.stream()`：**

```python
for chunk in overall_chain.stream({"lastname": "王"}):
    print(chunk, end="", flush=True)     # 逐 token 输出最终答案
```

**想在任意位置精确插桩，用 `RunnableLambda`：**

```python
from langchain_core.runnables import RunnableLambda

def debug_print(x):
    print(f"[中间结果] {x!r}")     # 想看什么就打印什么
    return x                       # 必须原样返回，否则会改变链的语义

overall_chain = (
    first_chain
    | RunnableLambda(debug_print)          # 截获 first_chain 的输出
    | (lambda name: {"child_name": name})
    | second_chain
)
```

> [!note] 三个容易踩的点
> - `astream_log` 是旧方案（基于 JSON Patch），1.x 推荐 `astream_events`。
> - `on_chain_end` 的 `data["output"]` 是**该步骤的真实返回值**——`PromptTemplate` 返回 `PromptValue`，`StrOutputParser` 之后才是 `str`。
> - Agent 是图而不是 Runnable 链，用它自己的流式接口：`agent.stream(input, config, stream_mode=["updates", "messages"])`；1.0 里「模型节点」的名字已从 `"agent"` 改为 `"model"`。

**RAG 类 Chain 的替代路径：**
1. **简单 Python 函数（推荐）**：`docs = retriever.invoke(q)` → 拼 context → `llm.invoke(...)`
2. **Agent + Middleware**：在 `dynamic_prompt` / `before_model` 钩子里检索并拼进系统提示词

> 核心思路：**去抽象化**——提供稳定的基础组件，鼓励你用原生 Python 控制流或 LangGraph 组装，而非依赖庞大的 Chain 类。

---

## 8. 追踪（LangSmith / Langfuse）

| 特性 | LangSmith | Langfuse |
|------|-----------|----------|
| 接入 | 环境变量为主，几乎零代码 | 实例化 `CallbackHandler` 并传入 `config` |
| 场景 | 深度集成 LangChain，调试体验好 | 开源可自托管，数据隐私友好 |
| 前缀 | `LANGSMITH_*` | `LANGFUSE_*` |

```bash
# LangSmith：设完环境变量，所有调用自动被追踪
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY="..."
export LANGSMITH_PROJECT="my-project"
```

```python
# Langfuse：通过回调处理器接入
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

Langfuse(public_key="...", secret_key="...")
langfuse_handler = CallbackHandler()
result = overall_chain.invoke({"lastname": "王"}, config={"callbacks": [langfuse_handler]})
```

> [!note] 版本提示
> Langfuse ≥ 3.0 的 `CallbackHandler` **不再接受构造参数**，配置放到 `Langfuse()` 初始化或环境变量；短生命周期脚本结束记得 `langfuse.flush()`。

**Langfuse ≥ 3.0 的完整写法（推荐环境变量 + 全局单例）：**

```python
import os
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

# 1) 配置放在环境变量里（密钥不落代码），也可直接传给 Langfuse()
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-..."
os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-..."
os.environ["LANGFUSE_HOST"] = "https://cloud.langfuse.com"   # 自托管改成自己的地址

# 2) 初始化全局单例；CallbackHandler 在 ≥3.0 不接受任何构造参数
langfuse = Langfuse()
langfuse_handler = CallbackHandler()

# 3) 通过 config 里的 callbacks 接入（Chain 和 Agent 都一样）
result = overall_chain.invoke(
    {"lastname": "王"},
    config={"callbacks": [langfuse_handler]},
)

# 4) 短生命周期脚本：结束前必须 flush，否则后台队列里的 trace 会丢
langfuse.flush()
```

> [!tip] 给 Agent 用时可以顺带把 `thread_id` 传进去，同一会话的多次调用会归到同一条 trace 会话里
>
 ```python
> agent.invoke(
>     {"messages": [{"role": "user", "content": "..."}]},
>     config={
>         "callbacks": [langfuse_handler],
>         "configurable": {"thread_id": "demo-1"},
>     },
> )
>
 ```
> 常驻服务（FastAPI / 长跑进程）无需手动 `flush()`，退出时 SDK 会自动回落；只有在「跑完就结束」的脚本里才必须显式调用。

---

## 9. 多 Agent（Supervisor → Subagents）

> [!warning] 迁移要点
> `langgraph-supervisor`（2025-02 首次发布，PyPI `0.0.1` 于 2025-02-07）**现已归档停维**（仓库 `archived: true`，README 明确推荐改用工具化的 supervisor；官方迁移指南 2026-06 加入文档）→ 推荐 **subagents pattern**：用 `langchain` 主库的 `create_agent`，把子 Agent 包装成**工具**挂到主控 Agent 上。
> 另外 `create_react_agent`（来自 `langgraph.prebuilt`）也已被标记 deprecated → 用 `langchain.agents.create_agent` 替代。

| 维度         | langgraph-supervisor        | Subagents 模式   |
| ---------- | --------------------------- | -------------- |
| 子 Agent 角色 | 图中的节点                       | 主 Agent 的工具    |
| 路由机制       | 自动生成的 handoff 工具            | 手动定义的工具描述      |
| 消息历史       | 可用 `output_mode` 控制         | 由工具函数内决定返回什么   |
| 安装         | 需单独装 `langgraph-supervisor` | 仅需 `langchain` |
| 维护状态       | 已停止维护                       | 官方推荐           |

```python
# Subagents：把子 Agent 包装成工具
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_ollama import ChatOllama

model = ChatOllama(model="qwen2.5:7b")

@tool
def add(a: int, b: int) -> int:
    """两数相加。"""
    return a + b

@tool
def web_search(query: str) -> str:
    """搜索网页（此处为占位实现）。"""
    return f"（模拟搜索结果）{query}"

math_agent     = create_agent(model=model, tools=[add],        system_prompt="You are a math expert.")
research_agent = create_agent(model=model, tools=[web_search], system_prompt="You are a researcher.")

@tool("math_expert", description="Math expert for arithmetic and algebra.")
def call_math_agent(query: str) -> str:
    """Delegate math tasks to the math expert."""
    result = math_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return result["messages"][-1].content     # 只返回最终结果，中间消息不进主 Agent 上下文

@tool("research_expert", description="Research expert for current events and web lookups.")
def call_research_agent(query: str) -> str:
    """Delegate research tasks to the research expert."""
    result = research_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return result["messages"][-1].content     # 只返回最终结果，中间消息不进主 Agent 上下文

supervisor = create_agent(
    model=model,
    tools=[call_research_agent, call_math_agent],
    system_prompt="Route research to research_expert and math to math_expert.",
)
```

> [!note] handoff 工具与 output_mode（旧 Supervisor 机制，理解用）
> - **自动 handoff**：本质是一个返回 `Command(goto=agent_name, graph=Command.PARENT, ...)` 的 `@tool`，让父图控制流跳转到目标子 Agent 节点。
> - **`output_mode`**：`full_history`（默认，追加子 Agent 全部消息）vs `last_message`（只追加最终回复，保持上下文简洁）。

---

## 10. 速查总表

| 组件          | 旧写法（0.x）                                                      | 1.0 新写法                                                     |
| ----------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| LLM         | `langchain_community.llms.Ollama`                             | `langchain_ollama.OllamaLLM` / `ChatOllama`                 |
| Embedding   | `langchain_community.embeddings.OllamaEmbeddings`             | `langchain_ollama.OllamaEmbeddings`                         |
| Prompt      | `from langchain import PromptTemplate`                        | `from langchain_core.prompts import ...`                    |
| Agent       | `initialize_agent` + `AgentType`                              | `langchain.agents.create_agent`                             |
| 工具定义        | `load_tools([...])`                                           | `@tool` / 直接导入 / Toolkit / MCP                              |
| 记忆          | `ConversationChain` + `ChatMessageHistory`                    | `checkpointer`（短期）+ `store`（长期）                             |
| Loader      | `langchain_community.document_loaders.UnstructuredFileLoader` | `langchain_unstructured.UnstructuredLoader`                 |
| Splitter    | `langchain.text_splitter.CharacterTextSplitter`               | `langchain_text_splitters.CharacterTextSplitter`            |
| VectorStore | `langchain_community.vectorstores.Chroma`                     | `langchain_chroma.Chroma`                                   |
| Retriever   | `db.as_retriever().get_relevant_documents()`                  | `db.as_retriever().invoke()`                                |
| Chain       | `from langchain.chains import LLMChain`                       | 移入 `langchain-classic`；新项目推荐 LCEL `prompt \| llm \| parser` |
| 多 Agent     | `langgraph_supervisor.create_supervisor`                      | subagents pattern（子 Agent 作工具）                              |

---

> [!success] 版本依据（已核实）
> 本笔记的迁移结论已对照 LangChain 官方文档、LangGraph 官方迁移指南、官方 GitHub 仓库与 PyPI 元数据核实。`langchain-community` 的 sunset issue 创建于 2026-05-22；`langgraph-supervisor` 仓库已归档，官方迁移指南于 2026-06-25 加入文档。示例使用 LangChain 1.x 当前推荐 API；具体补丁版本仍以本机 `pip show` 与官方文档为准。

## 相关笔记
- [[AI大模型/LangChain/LangChain1.0-课堂讲义|LangChain 1.0 课堂讲义]] — 面向初学者的 3 课时教学版（本笔记是它的技术底稿）
- [[AI大模型/LangChain/LangChain1.0-RAG+Agent综合示例|LangChain 1.0 RAG+Agent 综合示例]] — 配套综合示例（每段代码前注明迁移说明）
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]] — AgentExecutor / create_agent / LangGraph 三种建 Agent 对比
- [[AI大模型/Agent/LangChain-Loop-Engineering四层架构|LangChain Loop Engineering 四层架构]] — 1.0 Agent 原语与循环工程
- [[AI大模型/Agent/循环工程的艺术（LangChain Loop Engineering 原文）|循环工程的艺术（LangChain Loop Engineering 原文）]] — create_agent / RubricMiddleware / Engine
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — Supervisor 落地实现侧
- [[AI大模型/Agent/Agent主流架构对比与选型|Agent主流架构对比与选型]] — 架构选型
