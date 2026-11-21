---
title: A2A SDK 与 MCP 的关系
tags:
- A2A
- MCP
- Agent2Agent
- python-a2a
status: 已消化
source: DeepSeek-a2a_sdk与MCP关系.html
created: '2026-09-05T18:28:31+08:00'
modified: '2026-09-05T18:28:31+08:00'
---

> [!summary] 一句话
> `a2a-sdk` 专门实现 **A2A（Agent 对 Agent）协议**，本身**不内置 MCP 支持**；但两者是**互补**的——A2A 管"智能体之间协作"，MCP 管"智能体调工具"，常组合使用。

## 1. A2A vs MCP 分工

| 协议 | 核心功能 | 类比 |
|------|---------|------|
| **A2A** | 让 AI 智能体**之间**互相发现、通信、协作、委派任务 | 智能体的"外交语言" |
| **MCP** | 让 AI 智能体**统一、标准化地调用外部工具**（数据库/API/文件） | 智能体的"USB-C 接口" |

**典型架构**：总管智能体用 A2A 把任务分派给各专家智能体；每个专家智能体内部用 MCP 调用自己领域的工具。

## 2. 让 a2a 用上 MCP 的几种方式

1. **自定义集成（最灵活）**：用 `a2a-sdk` 建 A2A 服务器，内部用 `mcp` 库作 MCP 客户端连 MCP 服务器。
2. **社区扩展 `python-a2a`**：
   - 提供 `FastMCPAgent` 混合类，简化把 MCP 工具集成进 A2A 智能体
   - 提供 `ToolServer`，可把 LangChain 工具直接托管为 MCP Server

## 3. MCP 工具 → LangChain 工具（python-a2a）

```python
from python_a2a.mcp import MCPClient
from python_a2a.langchain import to_langchain_tool

client = MCPClient("http://localhost:8010")

# 方式1：逐个获取（明确知道要哪些工具）
get_weather_tool = to_langchain_tool("http://localhost:8010", "get_weather")

# 方式2：★只传服务器地址 → 返回"所有工具的列表"，更简洁
tools = to_langchain_tool("http://localhost:8010")

# 方式3：获取全部后按名字过滤（最灵活）
all_tools = to_langchain_tool("http://localhost:8010")
tools = [t for t in all_tools if t.name in ["get_weather", "query_high_frequency_question"]]

agent = create_tool_calling_agent(llm, tools, prompt_template)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
await agent_executor.ainvoke({"input": query})
```

> ⚠️ 易错点：`to_langchain_tool("http://host:8010")`（只传地址）返回的是**列表**；带第二个参数（工具名）的才返回**单个工具对象**。两者不能互换当同一种用。

## 4. 调用工具传参

`client.call_tool("get_weather", {"city": "Beijing", "days": 3})`，第二个参数用**字典**传参；也支持关键字参数 `call_tool("get_weather", city="Beijing")`（参数名须与工具定义完全一致）。

## 相关笔记
- [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]]
- [[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]]
- [[AI大模型/mcp/DeepSeek-MCP接入代码示例|MCP接入代码示例与LangChain集成]]
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]]