---
title: Function Calling 机制与返回JSON
tags:
- Agent
- Function Calling
- tool_calls
- JSON
status: 已消化
source: DeepSeek-Function Calling返回JSON.html
created: '2026-09-05T18:28:22+08:00'
modified: '2026-09-05T18:28:22+08:00'
---

> [!summary] 一句话
> **Function Calling 不是"返回 JSON 这个动作"，而是"让模型输出结构化 JSON（含函数名+参数）以触发外部函数调用"的整套机制**。JSON 里装的是**调用指令**，不是执行结果。

## 1. 核心机制

- 把外部工具（查天气、发邮件）的**函数签名**（名称、参数描述）告诉模型。
- 模型**不真正执行**，只判断"是否需要工具，若需要就按格式输出一条调用指令"。

## 2. 模型返回什么

| 场景 | 模型返回 |
|------|---------|
| 普通对话 | `"今天天气晴朗"` |
| Function Calling（开启工具时） | `{"name": "get_weather", "arguments": {"city": "北京"}}` ← **调用指令**，非结果 |

## 3. 完整工作流（重点：真正调用靠你的代码）
```text
① 把函数描述发给模型
② 模型返回 JSON 指令 {"name":"get_weather","arguments":{"city":"北京"}}
③ ★你的代码解析 JSON，真正调用本地 get_weather("北京")，拿到 "25°C"
④ 把结果 "25°C" 回传给模型，模型组织成自然语言答复
```

## 4. 两种主流实现方式差异

- **OpenAI 方式**：严格返回 `tool_calls` 字段的 JSON，**必须由开发者手动解析并执行**。
- **MCP 方式**：协议内部可能直接执行函数并返回结果，开发者感知到的往往是最终文本，而非中间那个 JSON 指令。

## 相关笔记
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]]
- [[AI大模型/Agent/Agent结构化输出与工具调用_FC_ToolUse_MCP_Pydantic|Agent 结构化输出与工具调用（Function Calling / Tool Use / MCP / 校验）]]
- [[AI大模型/mcp/DeepSeek-MCP接入代码示例|MCP接入代码示例与LangChain集成]]