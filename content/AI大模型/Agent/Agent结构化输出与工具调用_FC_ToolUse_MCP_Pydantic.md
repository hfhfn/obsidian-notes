---
title: Agent 结构化输出与工具调用（Function Calling / Tool Use / MCP / 校验）
tags:
- agent
- function-calling
- tool-use
- mcp
- json
- pydantic
- 结构化输出
status: 已消化
source: DeepSeek-Agent JSON输出校验建议 问答(2篇)
created: 2026-08-30
modified: '2026-09-04T23:40:06+08:00'
---

# Agent 结构化输出与工具调用（Function Calling / Tool Use / MCP / 校验）

> [!note] 一句话总结
> 两篇 DeepSeek 问答的整理，回答一个核心工程问题：**Agent 需要让模型输出可信、可解析、可落库的结构化 JSON 时，最好的做法是什么？** 答案是一条环环相扣的防御链 —— **用 Function Calling / Tool Use 让模型在 logits 层直接产出符合 Schema 的结构化输出，再叠加 Pydantic 做业务层二次校验，最后由 MCP 把"模型意图"标准化地翻译成对真实工具的执行。**

> [!tip] 什么时候需要读这篇
> 当你在开发 Agent（要调用工具）、让模型输出 JSON 落库、或纠结"到底用 Function Calling 还是 JSON Mode 还是靠 Prompt 手写"时，本笔记给出完整决策树与生产级代码范式。

---

## 目录

1. [核心结论：让模型"生成"JSON 而不是"手写"JSON](#1-核心结论让模型生成-json-而不是手写-json)
2. [为什么首选 Function Calling](#2-为什么首选-function-calling)
3. [纯 Prompt 手写 JSON 的致命缺陷](#3-纯-prompt-手写-json-的致命缺陷)
4. [命名厘清：Function Calling / Tool Use / Tool Calling / MCP 的关系](#4-命名厘清function-calling--tool-use--tool-calling--mcp-的关系)
5. [五种结构化输出模式全景](#5-五种结构化输出模式全景)
6. [Function Calling + Pydantic：生产级"组合拳"](#6-function-calling--pydantic生产级组合拳)
7. [MCP 与 Function Calling 是互补而非替代](#7-mcp-与-function-calling-是互补而非替代)
8. [生产级代码范式（含 MCP + Pydantic 完整示例）](#8-生产级代码范式含-mcp--pydantic-完整示例)
9. [选型决策树](#9-选型决策树)
10. [面试/要点速查表](#10-面试要点速查表)

---

## 1. 核心结论：让模型"生成"JSON 而不是"手写"JSON

**Agent 需要结构化 JSON 输出时，绝不靠 Prompt 让模型"手写 JSON"，而是借助 Function Calling / Tool Use（首选）。** 两者的本质差异：

| 方式 | 本质 | 约束强度 |
|------|------|---------|
| **Function Calling / Tool Use** | 模型在内部 logits 层直接生成符合 JSON Schema 的 token | ⭐⭐⭐⭐⭐（语法 + 类型 + 字段） |
| JSON Mode | 只保证输出合法 JSON，不约束 Schema | ⭐⭐⭐ |
| Strict / Structured Outputs | JSON Mode 升级版，强制 Schema | ⭐⭐⭐⭐⭐ |
| **Prompt 手写 JSON** | 纯靠提示词引导，无任何代码层保障 | ⭐（极低） |

一句话：**能解析 ≠ 能用**。Function Calling 保证"能解析/长得对"，Pydantic 保证"能用/业务对"。

---

## 2. 为什么首选 Function Calling

大厂（OpenAI / Anthropic）的 Function Calling 底层**不是在模型外面做字符串校验，而是在模型内部的 logits 层面做约束**，直接生成符合 JSON Schema 的 token。因此：

1. **结构强制校验（Schema 层面）**：从根本上杜绝 `{"key": "value",}`（多余逗号）、`'单引号'`、`Missing closing brace` 等语法错误。
2. **类型安全**：传入 JSON Schema（如 `"type": "integer"`），模型若试图输出字符串 `"123"`，底层会强制修正或拒绝，拿到的 `arguments` 直接就是 `dict`，无需 `json.loads()` 容错。
3. **避免"幻觉"字段**：不借助 Tool 时模型常自行"加戏"（如 `"note": "I think..."`）。Function Calling 严格遵循 `required` 列表，多一个 key 都不给。

---

## 3. 纯 Prompt 手写 JSON 的致命缺陷（不推荐）

如果你写 `Please output JSON format, ensure valid...`：

- **语法错误率极高**：即使 GPT-4，长文本输出也有 **1%~3%** 的解析失败率（引号未转义、尾随逗号为主）。
- **校验滞后**：必须 `try-except` 捕获后重试 → 额外 1~2 次 LLM 调用，延迟与成本翻倍。
- **嵌套复杂度一高就崩**：多层嵌套或转义字符（如 `content: "He said \"Hi\""`）极易算错反斜杠数量。
- **字段名 / 类型 / 必填项全不可控**：模型可能输出 `{"city": "北京", "temp": "25°C"}`（类型错）、`{"city": "北京"}`（缺字段）、前后夹带解释文字。

> [!warning] 特别警告：不要自己写"JSON 转义/修复"逻辑
> 有些开发者试图让模型输出 Python dict 字符串再用 `ast.literal_eval`，或手动把单引号替换成双引号。**这极其脆弱且危险，生产环境绝对禁止。** 正确做法永远是借助框架的约束生成 + 结构化校验。

---

## 4. 命名厘清：Function Calling / Tool Use / Tool Calling / MCP 的关系

**核心结论：Function Calling 和 Tool Use 是同一件事，只是不同厂商的叫法。**

| 术语 | 提出方 | 本质 | 使用生态 |
|------|--------|------|---------|
| **Function Calling** | OpenAI | 模型输出"结构化的工具调用指令" | OpenAI API |
| **Tool Use** | Anthropic (Claude) | 同上，叫法不同 | Claude API |
| **Tool Calling** | 行业通用 | 中性统称（不限于"函数"） | 跨平台讨论 |
| **MCP** | Anthropic 主导 | **协议标准**（工具"怎么被描述、发现、调用"） | 跨模型/跨平台 |

**历史原因**：OpenAI 最早（2023年6月）推出时叫 Function Calling，当时主要就是"调用函数"；Anthropic 稍晚（2023年底）为差异化叫 Tool Use；现在行业趋向于 Tool Calling——因为不限"函数"，可以是任何外部能力（API / 数据库 / 本地脚本），"工具"更宽泛准确。

**代码差异对照**（同一概念，几个 key 不同）：

```python
# OpenAI 风格 → Function Calling
response = openai.chat.completions.create(
    model="gpt-4o",
    tools=[{"type": "function", "function": {
        "name": "get_weather",
        "parameters": {  # ← OpenAI 叫 parameters
            "type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]
        }
    }}],
    tool_choice="auto",
)
# 返回: response.choices[0].message.tool_calls
tool_name = response.choices[0].message.tool_calls[0].function.name
tool_args = json.loads(response.choices[0].message.tool_calls[0].function.arguments)

# Anthropic 风格 → Tool Use
response = anthropic.messages.create(
    model="claude-3-opus",
    tools=[{"name": "get_weather", "input_schema": {  # ← Anthropic 叫 input_schema
        "type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]
    }}],
    tool_choice={"type": "auto"},
)
# 返回: response.content 里 type=="tool_use" 的块
for content in response.content:
    if content.type == "tool_use":
        tool_name = content.name
        tool_args = content.input  # ← 不叫 arguments，叫 input
```

> [!note] 概念图谱
>
 ```
> Function Calling (OpenAI)     Tool Use (Anthropic)
>          └──────────┬────────────┘
>                  Tool Calling（统称/实现层）
>                          │
>                          ▼
>                MCP（标准化协议层）
>
 ```
> **MCP 是协议层，Tool Use/Function Calling 是实现层。** 听到 "Tool Use" 直接理解成 "Anthropic 版的 Function Calling" 即可，它们解决同一个问题。

---

## 5. 五种结构化输出模式全景

| 模式 | 代表 | 核心机制 | 结构化程度 | 可靠性 |
|------|------|---------|-----------|--------|
| **Function Calling** | OpenAI | 模型原生支持，logits 层约束 | ★★★★★ | 极高 |
| **Tool Use** | Anthropic | 同上，叫法不同 | ★★★★★ | 极高 |
| **Structured Outputs** | OpenAI（最新） | JSON Mode 升级版，强制 Schema | ★★★★★ | 极高 |
| **JSON Mode** | OpenAI / 通义 | 强制合法 JSON，不约束 Schema | ★★★ | 中等 |
| **Prompt 手写 JSON** | 所有模型 | 纯 Prompt 引导 | ★ | 极低 |

**深入解析：**

1. **Function Calling（最推荐）**：模型内部 Token 生成层约束，只能生成符合 Tool Schema 的 token。模型不能拒绝输出结构化数据（除非 `tool_choice="none"`），保证类型/必填字段，支持**并行调用**（多个 tools 同时返回）。适用：Agent 系统、工具调用、任何需要可靠结构化输出的场景。

2. **JSON Mode（有缺陷）**：`response_format={"type": "json_object"}`。只保证"是合法 JSON"，不保证 Schema 匹配——字段名可能歪掉（`city` vs `城市`）、类型可能错（`temp: "25°C"`）、可能多出额外字段或缺必填字段。适用：要求不高、有 Pydantic 兜底的场合。

3. **Structured Outputs（JSON Mode 升级版）**：OpenAI 2024年8月推出，`client.beta.chat.completions.parse(...)` **直接传入 Pydantic 模型**（`response_format=WeatherInfo`），保证格式合法 + Schema 匹配，**直接返回 Pydantic 实例 `parsed`**，无需二次解析。相当于 Function Calling 的"纯输出"版本。不保留并行调用/工具选择能力。

4. **Prompt 手写 JSON（最不推荐）**：无任何代码层保障。类型错误率可高达 **10-30%**，经常夹带解释文字，无法保证必填字段。适用：原型验证、非生产环境。

---

## 6. Function Calling + Pydantic：生产级"组合拳"

**生产环境几乎 100% 是"Function Calling 约束生成 + Pydantic 二次防御"。** 两者不是二选一，而是各管一层：

| | Function Calling（守门员） | Pydantic（质检员） |
|---|---|---|
| 职责 | 语法层 + 类型粗筛 | 业务层 + 深度校验 |
| 保证 | 合法 JSON 结构、顶层字段类型大致正确 | 拦截脏数据、业务逻辑 |
| 类比 | 保证"能解析" | 保证"能使用" |

**为什么 Function Calling 扛不住，必须上 Pydantic？三个真实翻车案例：**

- **枚举值越界**：Schema 写 `"enum": ["red", "blue"]`，Function Calling **不会**阻止模型输出 `"RED"`（大小写敏感）或 `"red "`（带空格）。不校验就会把脏值写进数据库。
- **业务逻辑矛盾**：`{"start_time": "09:00", "end_time": "08:00"}` —— JSON 语法完全合法，Function Calling 判通过；`@field_validator` 能轻松捕获"结束早于开始"。
- **必填字段的"幽灵空值"**：模型常输出 `"description": ""`（空串）或 `"value": null` 糊弄 required 字段。只有 Pydantic 能靠 `min_length=1` / `Field(..., strict=True)` 拦下。

**为什么不用 `model_dump_json()` 直接丢给模型？**
`OrderInfo.model_json_schema()` 生成的是 **Schema 定义**（告诉模型长得什么样），发给 API 的是这个 Schema；拿回来后用 `OrderInfo(**raw_args)` 校验实际数据。方向相反，两件事不能混。

**纠错闭环（进阶）**：Pydantic 报错时不要直接返回 500，把 `e.errors()` 拼进下一轮对话让模型自己修正，再二次调用——既保证干净落地，又利用 LLM 自我纠错，比单纯重试效果好。

---

## 7. MCP 与 Function Calling 是互补而非替代

**直觉误区：** "现在工具都用 MCP 了，Function Calling 是不是没用了？" → **不，二者是互补与协同。**

| 维度 | Function Calling | MCP（模型上下文协议） |
|------|------------------|----------------------|
| 本质 | 模型**内置能力/机制** | 一套**跨模型的开放协议标准** |
| 核心角色 | 让模型"表达"调用意图并生成参数 | 标准化工具"如何被描述、发现、调用" |
| 依赖 | 深绑特定模型供应商 API（如 OpenAI） | 模型无关，兼容 Claude/GPT/通义… |
| 解决 | 单模型如何发出调用指令 | 多模型、多工具如何统一标准化对接 |
| 比喻 | **"大脑"**（思考并下指令） | **"手/神经"**（规范接入与执行） |

**工作流分工**：模型通过 Function Calling 发出"意图"（如"调用 `search_flights`，参数 `origin: Beijing`"）→ 交给 MCP 客户端 → 通过标准协议与 MCP 服务器通信 → 服务器连接到真实服务执行并回传结果。

**如何选择（不是二选一）**：
- **简单固定单点集成**：只调一两个固定 API、无复杂多模型切换 → 直接用 Function Calling 即可，别引入 MCP 的额外复杂度。
- **复杂 AI Agent 或平台**：要调用多工具（数据库、第三方 API、内部系统）、需跨平台跨模型 → **Function Calling（模型能力）+ MCP（协议）** 是 Best Practice。Model 用 FC 决策，MCP 负责执行。

---

## 8. 生产级代码范式（含 MCP + Pydantic 完整示例）

### 8.1 黄金模板：Pydantic 双保险 + Function Calling（OpenAI 为例）

```python
from pydantic import BaseModel, Field, field_validator

# 1. 定义双保险模型：既能生成 Schema，又能二次校验
class OrderInfo(BaseModel):
    product_id: str = Field(..., min_length=10)            # 非空且长度>=10
    quantity: int = Field(..., ge=1, le=100)               # 1-100
    status: str = Field(..., pattern=r'^(pending|paid|shipped)$')  # 正则严格匹配

    @field_validator('product_id')
    def strip_whitespace(cls, v):
        return v.strip()                                   # 去模型带入的空格

# 2. 调用 Function Calling，把 Pydantic 直接转成 Schema 交给 API
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[...],
    tools=[{"type": "function", "function": {
        "name": "submit_order",
        "parameters": OrderInfo.model_json_schema()       # ← 直接转换
    }}],
    tool_choice={"type": "function", "function": {"name": "submit_order"}},  # 强制输出
)

# 3. 关键一步：拿到 arguments 后，必须再过一遍 Pydantic
try:
    raw_args = json.loads(response.choices[0].message.tool_calls[0].function.arguments)
    validated = OrderInfo(**raw_args)                     # 业务/枚举/正则不符会抛 ValidationError
except ValidationError as e:
    # 纠错闭环：把错误喂回模型让其重写
    messages.append({"role": "user",
        "content": f"你输出的数据不符合要求:{e.errors()}。请只输出修正后的JSON。"})
```

### 8.2 统一抽象层：屏蔽 OpenAI / Anthropic 差异（生产级封装）

用 `ABC` 定义统一接口，各厂商 Provider 各自适配，上层只认统一返回格式：

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, List
import json

class ToolCallProvider(ABC):
    @abstractmethod
    async def chat_with_tools(self, messages: List[Dict], tools: List[Dict]) -> Dict[str, Any]:
        """统一返回格式"""
        pass

class OpenAIProvider(ToolCallProvider):
    def __init__(self, api_key: str): self.client = AsyncOpenAI(api_key=api_key)
    async def chat_with_tools(self, messages, tools) -> Dict:
        openai_tools = [{"type": "function", "function": {
            "name": t["name"], "description": t.get("description", ""),
            "parameters": t["input_schema"]                    # Anthropic 格式 → OpenAI 格式
        }} for t in tools]
        resp = await self.client.chat.completions.create(
            model="gpt-4o", messages=messages, tools=openai_tools, tool_choice="auto")
        if resp.choices[0].message.tool_calls:
            tc = resp.choices[0].message.tool_calls[0]
            return {"type": "tool_call", "tool_name": tc.function.name,
                    "tool_args": json.loads(tc.function.arguments), "raw_response": resp}
        return {"type": "text", "content": resp.choices[0].message.content, "raw_response": resp}

# AnthropicProvider 同理：判断 response.content 中 type=="tool_use" 的块，
# tool_args = content.input；消息格式需按 Anthropic 要求重组。

# 用法
provider = OpenAIProvider(api_key="xxx")   # 或 AnthropicProvider
result = await provider.chat_with_tools(
    messages=[{"role": "user", "content": "北京天气？"}],
    tools=[{"name": "get_weather", "description": "查询天气",
        "input_schema": {"type": "object",
            "properties": {"city": {"type": "string"}}, "required": ["city"]}}])
if result["type"] == "tool_call":
    print(f"调用工具: {result['tool_name']}, 参数: {result['tool_args']}")
```

### 8.3 完整三件套示例：Function Calling + MCP + Pydantic（智能订票助手）

结构：**① Pydantic 数据模型（生成 Schema + 二次校验）→ ② MCP 服务器（封装真实工具实现）→ ③ MCP 客户端（注册表：统一路由 + 执行前 Pydantic 校验）→ ④ 主循环（Function Calling 决策 + 校验 + 纠错回填）**。

```python
import json, asyncio
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, ValidationError
from openai import AsyncOpenAI

# ① Pydantic 模型：既做 API Schema 生成，也做二次校验
class FlightSearchParams(BaseModel):
    origin: str = Field(..., min_length=2, description="出发城市")
    destination: str = Field(..., min_length=2, description="到达城市")
    date: str = Field(..., description="出发日期 YYYY-MM-DD")
    passengers: int = Field(1, ge=1, le=10, description="乘客人数")

    @field_validator('date')
    def date_not_past(cls, v):
        d = datetime.strptime(v, "%Y-%m-%d")
        if d.date() < datetime.now().date():
            raise ValueError("出发日期不能早于今天")
        return v

    @field_validator('origin', 'destination')
    def clean_city(cls, v):
        return v.strip().title()   # 去空格 + 首字母大写

# ② MCP 服务器模拟：负责执行真实业务逻辑（实际用 mcp-python-sdk）
class MCPServer:
    MOCK_FLIGHTS = {("Beijing","Shanghai"): [{"flight":"CA1234","time":"08:00","price":1200}],
                     ("Shanghai","Beijing"): [{"flight":"CA9876","time":"10:00","price":1100}]}
    async def search_flights(self, origin, destination, date, passengers) -> dict:
        await asyncio.sleep(0.5)   # 模拟查询延迟
        flights = self.MOCK_FLIGHTS.get((origin, destination), [])
        if not flights: return {"status":"no_flights","message":"未找到航班","data":[]}
        return {"status":"success","message":f"找到{len(flights)}个航班",
                "data":[ {**f, "total_price": f["price"]*passengers} for f in flights]}

# ③ MCP 客户端：统一工具调用入口（工具注册表 + 执行前 Pydantic 校验）
class MCPClient:
    def __init__(self):
        self.server = MCPServer()
        self.tools_registry = {   # 符合 MCP 协议标准
            "search_flights": {"handler": self.server.search_flights,
                "schema": FlightSearchParams.model_json_schema()}}
    async def execute_tool(self, tool_name, arguments):
        if tool_name not in self.tools_registry: raise ValueError(f"未知工具: {tool_name}")
        try:
            validated = FlightSearchParams(**arguments)   # 执行前二次校验
            handler = self.tools_registry[tool_name]["handler"]
            result = await handler(origin=validated.origin, destination=validated.destination,
                                   date=validated.date, passengers=validated.passengers)
            return {"tool": tool_name, "status": "success", "result": result}
        except ValidationError as e:
            return {"tool": tool_name, "status": "validation_failed", "errors": e.errors()}

# ④ 主循环：Function Calling 决策 → 执行 → Pydantic 校验 → 纠错回填
#    （模型经 Function Calling 输出 JSON 参数 → MCPClient.execute_tool
#      执行真实工具 → 校验失败把 e.errors() 拼回对话让模型重写）
```

---

## 9. 选型决策树

```
你的需求是什么？
│
├─ 需要调用外部工具（API/数据库/本地脚本）？
│   ├─ 是 → 用 Function Calling / Tool Use
│   │        └─ 平台复杂、工具多、需跨模型？→ 再加 MCP 协议层
│   └─ 否 → 继续往下
│
├─ 只需要模型输出结构化数据？
│   ├─ 用 OpenAI 最新版？→ Structured Outputs（最强：直接返回 Pydantic）
│   ├─ 不支持？           → JSON Mode（备选，需 Pydantic 兜底校验 + 重试）
│   └─ 任何模式都不支持？  → 只能 Prompt 手写（不推荐，生产别用）
│
└─ 需要多步推理（ReAct）？
    └─ 必须用 Function Calling（才能做状态管理）
```

**汇总：**
- 有网 + 大厂 API → 无脑 Function Calling。
- 本地部署 + 必须 JSON → JSON Mode + Pydantic 校验 + 重试。
- 千万别只靠 Prompt "输出 JSON"而不做任何代码层约束。

---

## 10. 面试/要点速查表

| 问题 | 一句话答案 |
|------|-----------|
| Agent 要可靠 JSON 输出怎么做 | Function Calling / Tool Use（logits 层约束），别靠 Prompt |
| Function Calling vs Tool Use | 同一件事，OpenAI vs Anthropic 叫法不同 |
| Tool Calling？ | 行业统称，不限"函数"，指一切外部能力 |
| JSON Mode vs Structured Outputs | 前者只保证合法 JSON，后者强制 Schema 且直接返回 Pydantic |
| 为什么还要 Pydantic | FC 管语法/类型粗筛，Pydantic 管业务/深度校验（枚举、逻辑、空值） |
| Function Calling 会被 MCP 取代吗 | 不会；FC=大脑决策，MCP=手脚协议，互补 |
| 直接返回 Pydantic 的最强方式 | OpenAI Structured Outputs：`response_format=PydanticModel` → `parsed` |
| 模型拒绝输出 JSON 怎么办 | `tool_choice` 强制指定某个 function，不给自然语言回复 |
| 校验失败最佳处理 | 把 `e.errors()` 回填给模型重写（纠错闭环），别直接抛 500 |
| 绝对禁止 | `ast.literal_eval` / 手写 JSON 转义修复 |

---

## 相关笔记

- [[AI大模型/Agent/Pydantic工具类优化-校验器与LangChain工具集成|Pydantic 工具类优化（校验器与 LangChain 工具集成）]] — Pydantic 校验器明细与 LangChain 工具集成四种方式（本篇二次校验的细则展开）
- [[AI大模型/Agent/在Agent中落地ReAct模式（Reasoning + Acting）|在Agent中落地ReAct模式（Reasoning + Acting）]] — Agent 多步推理循环（Function Calling 与之配合做状态管理）
- [[AI大模型/Agent/五种 Agent 模式详解|五种 Agent 模式详解]] — Agent 设计模式全景
- [[AI大模型/Agent/AI智能体消息通道分层设计|AI智能体消息通道分层设计]] — Agent 消息通道与工具调用
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] — 领域内容地图
- [[AI大模型/mcp/Streamable HTTP 对比 SSE|Streamable HTTP 对比 SSE]] — MCP 传输协议层