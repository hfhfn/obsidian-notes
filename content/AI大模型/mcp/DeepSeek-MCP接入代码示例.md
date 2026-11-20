---
title: MCP接入代码示例与LangChain集成
tags:
- MCP
- FastMCP
- langchain-mcp-adapters
- 代码示例
status: 已消化
source: DeepSeek-MCP接入代码示例.html
created: '2026-09-05T18:28:04+08:00'
modified: '2026-09-05T18:28:04+08:00'
---

> [!summary] 一句话
> 完整打通 **MCP Server（FastMCP）→ MCP Client → Agent（LangChain）** 的接入链路：从手写官方 SDK 到 `langchain-mcp-adapters` 一行集成，以及三种传输方式（stdio/sse/streamable_http）在两端的具体配置。

## 1. 架构角色（Agent 场景）

| 角色 | 职责 |
|------|------|
| **MCP Host** | **Agent 应用本身**，含 LLM、推理、工具编排、上下文维护 |
| **MCP Client** | **内嵌在 Host 里的通信组件**（不是独立进程），负责连接管理、协议处理、工具发现、请求转发 |
| **MCP Server** | 独立工具服务进程，含工具实现、资源、权限、结果返回 |

> 通信方向：Host（通过内嵌 Client）→ Server；Server 不会主动调用 Host。Agent 推理引擎决定"何时用工具"，MCP 提供"如何发现和调用工具"的标准协议。

## 2. 三种传输方式的配置对照（FastMCP vs langchain-mcp-adapters）

| 传输 | FastMCP 启动/路径 | langchain-mcp-adapters 配置 | transport 字符串 |
|------|------|------|------|
| **stdio** | `fastmcp run server.py`（无 URL） | `{"command":"python","args":["server.py"]}` | `"stdio"` |
| **SSE** | 默认端点 `/sse` | `{"url":"http://host:port/sse"}` | `"sse"` |
| **Streamable HTTP** | 默认端点 `/mcp`，`fastmcp run server.py --transport http` | `{"url":"http://host:port/mcp"}` | `"streamable_http"`（**下划线**，非 `-`） |

> ⚠️ **命名细节**：`http` = `streamable-http` 的别名；在 `langchain-mcp-adapters` 中必须用 `"streamable_http"`（下划线），用 `"streamable-http"` 会报错。
> ⚠️ **"Host" 澄清**：MCP 的 Host 指 **Agent 应用**，不是远程服务器主机；`http://your-server-host:port/sse` 里的 `your-server-host` 是部署 MCP 服务的那台机器。

## 3. 推荐方案：FastMCP + langchain-mcp-adapters（最简洁）

**Server（math_server.py）**：```python
from fastmcp import FastMCP
mcp = FastMCP("MathServer")

@mcp.tool()
def add(a: int, b: int) -> int:
    """将两个数字相加。"""
    return a + b

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

**Agent 客户端（agent_client.py）**：```python
import asyncio
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langchain_mcp_adapters.client import MultiServerMCPClient

async def main():
    # 可同时连多个服务器（stdio 或 http），工具自动合并
    client = MultiServerMCPClient({
        "math": {"command": "python", "args": ["/path/math_server.py"], "transport": "stdio"},
        "weather": {"url": "http://localhost:8000/mcp", "transport": "http"},
    })
    async with client:
        tools = await client.get_tools()          # 已经是 LangChain 标准 Tool 列表
        agent = create_agent(ChatOpenAI(model="gpt-4o"), tools)
        resp = await agent.ainvoke({"messages": [("user", "计算 (3+5) 乘以 12")]})

asyncio.run(main())
```

## 4. 关键点

- **`mcp`（官方底层 SDK）** vs **LangChain**：`mcp` 是"工具提供者"，LangChain 是"工具使用者+编排者"，二者互补。
- **`langchain-mcp-adapters` 提供**：`MultiServerMCPClient`（多服务器管理）、`load_mcp_tools()`（一键转工具）、`MCPAdapter`（现代化适配器，内部用 FastMCP 协商）。JS 生态有 `@langchain/mcp-adapters`。
- **性能权衡**：LangChain 适配层有额外抽象开销（每次调用约 +50~200ms），简单场景可能过重，可考虑直接用官方 `mcp` SDK 手写 client。
- **SSE 需认证**时可在配置里加 `headers: {"Authorization": "Bearer TOKEN"}`。

## 相关笔记
- [[AI大模型/mcp/DeepSeek-MCP与FastMCP区别|MCP官方SDK 与 FastMCP 区别]]
- [[AI大模型/mcp/DeepSeek-MCP传输协议对比|MCP传输协议对比 SSE 与 Streamable HTTP]]
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]]
- [[AI大模型/Agent/Agent结构化输出与工具调用_FC_ToolUse_MCP_Pydantic|Agent 结构化输出与工具调用（Function Calling / Tool Use / MCP / 校验）]]