---
title: 工具调用代理需不需要执行器
tags:
- Agent
- LangChain
- AgentExecutor
- LangGraph
- 工具调用
status: 已消化
source: DeepSeek-工具调用代理需执行器.html / ...工具调用代理需执行器 (1).html
created: '2026-09-05T18:28:16+08:00'
modified: '2026-09-05T18:28:16+08:00'
---

> [!summary] 一句话
> `create_tool_calling_agent` 只返回**决策用的 Runnable（"图纸"）**，真正执行工具、循环推理的是 **AgentExecutor（"施工队"）**。搭 Agent 要么用 AgentExecutor，要么用 LangGraph 把"执行循环"显式画成图，不可能完全裸跑。

## 1. 为什么必须配执行器？

- **`create_tool_calling_agent`（大脑/图纸）**：内部只是把提示词模板 + LLM 串起来的 `RunnableSequence`，只负责"决策要不要调工具"。
- **`AgentExecutor`（躯干/施工队）**：负责"执行循环"——LLM 说调工具就去执行，把结果塞回 agent_scratchpad，再让 LLM 继续，循环多次（ReAct）直到给出最终答案。

> 直接 `agent.invoke(...)` 时：若 LLM 返回普通文本 → 能输出；若 LLM 决定调工具（返回带 `tool_calls` 的 `AIMessage`）→ **工具不会真正执行**，只会拿到一个 `AIMessage`，不是最终答案。

## 2. 手动模拟执行循环（能但繁琐）

不依赖 AgentExecutor 唯一办法是**自己写循环**：检测 `tool_calls` → 逐个执行工具 → 构造 `ToolMessage` → 重新喂给 Agent → 维护 `agent_scratchpad` 反复循环直到没有 tool_calls。多轮/异常/截断全靠手写，易错。这正是官方封装 AgentExecutor 的原因。

## 3. 底层原理：bind_tools 做了什么

- **`create_agent`（LangChain 风格）**：内部自动把工具 `bind_tools` 绑给 LLM，Agent 负责一切。
- **LangGraph**：**显式分步**——你在节点里手动 `llm.bind_tools(tools)`，再显式路由 `tools_condition`，把"绑定策略"交给开发者灵活控制。

两种方式的底层核心一致：给 LLM 注入工具的 JSON Schema（`bind_tools`），让模型按格式输出 `tool_calls`。

## 4. 三种建 Agent 方式对比

| 方式 | 是否需 AgentExecutor | 特点 |
|------|------|------|
| `initialize_agent`（旧） | 内部自动封装 | 已 **Deprecated**，黑盒循环难定制 |
| `create_agent`（LangChain 1.x 新 API） | 需要配合 | 官方推荐现代接口，模块化可组合 |
| **LangGraph** | **彻底不需要** | 用图（StateGraph）代替黑盒循环，编译后 `app.invoke()` 自带循环能力，流程**透明可控**（可插人工审批、状态持久化） |

## 5. 输入格式与返回值（LangGraph 细节）

- **输入用字典** `{"messages": [...]}` —— 推荐统一字典格式，兼容性最好。
- **`tools_condition`**：默认在有 `tool_calls` 时路由到工具节点，否则结束；可通过 `should_continue` 自定义路由逻辑。
- **返回值**：从 `app.invoke()` 的结果里取最终消息。

## 6. AgentExecutor 改造示例（手动循环 → 框架）
```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent, tools=tools, verbose=True,
    max_iterations=3,                 # 防死循环
    handle_parsing_errors=True,       # 优雅处理解析错误
)
result = agent_executor.invoke({"input": query})
```
替换掉手写的 `invoke → 检查 tool_calls → 执行工具 → 构造 ToolMessage → 二次 invoke` 那一套，代码量减少 50%+，且自动处理多轮、异常、超时。

## 相关笔记
- [[AI大模型/mcp/DeepSeek-MCP接入代码示例|MCP接入代码示例与LangChain集成]]
- [[AI大模型/Agent/DeepSeek-Function-Calling返回JSON|Function Calling 机制与返回JSON]]
- [[AI大模型/Agent/LangGraph循环直到满足条件|LangGraph 循环直到满足条件（生成-评估-反馈）]]
- [[AI大模型/Agent/Agent主流架构对比与选型|Agent主流架构对比与选型]]