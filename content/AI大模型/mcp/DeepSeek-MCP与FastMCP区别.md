---
title: MCP官方SDK 与 FastMCP 区别
tags:
- MCP
- FastMCP
- Python
status: 已消化
source: DeepSeek-MCP与FastMCP区别.html
created: '2026-09-05T18:27:42+08:00'
modified: '2026-09-05T18:27:42+08:00'
---

> [!summary] 一句话
> `mcp` 是 Anthropic 官方底层 SDK（发动机），`fastmcp` 是它的高层封装（车身），用装饰器让写 MCP Server 变得极其简单。

## 1. 导入路径的演变（关键坑）

| 阶段 | 导入方式 | 状态 |
|------|---------|------|
| 最初 | `from fastmcp import FastMCP` | 独立开源项目（Prefect 团队） |
| 2024 | `from mcp.server.fastmcp import FastMCP` | 1.0 被整合进官方 SDK |
| 现在 | `from fastmcp import FastMCP`（独立包） | **官方推荐**；`mcp.server.fastmcp` 在 MCP SDK v2 已被移除 |

> ⚠️ 如果你的代码还用 `from mcp.server.fastmcp import FastMCP`，升级 mcp SDK 后会报 `ModuleNotFoundError`。
> 改法：`pip install fastmcp`，只改 import，`@mcp.tool` / `mcp.run()` 用法完全一致。

## 2. 官方 mcp vs FastMCP

```python
# mcp（官方底层 SDK）—— 手动处理一切
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

server = Server("sdg")

@server.list_tools()
async def handle_list_tools():
    return [Tool(name="...", description="...", inputSchema={...})]  # 手写 JSON Schema

@server.call_tool()
async def handle_call_tool(name, arguments):
    return [TextContent(type="text", text="...")]
```

```python
# fastmcp —— 装饰器 + 类型推断，极简
from fastmcp import FastMCP
mcp = FastMCP("sdg")

@mcp.tool()
async def query_high_frequency_question() -> str:
    """从知识库中检索常见问题解答"""
    return "高频问题是: 恐龙是怎么灭绝的？"
```

| 对比 | `mcp`（官方 SDK） | `fastmcp`（高层封装） |
|------|------|------|
| 定位 | 底层，灵活复杂 | 高层，简洁高效 |
| 工具注册 | 手动 `@server.list_tools` / `call_tool` | `@mcp.tool` 装饰器 |
| JSON Schema | 手动定义 | 从函数签名**自动推断** |
| 依赖 | —— | 直接依赖 `mcp>=1.0.0` + `pydantic` |

**本质**：FastMCP 底层调用官方 `mcp` SDK 的 `Server` 类，是"约定优于配置"的封装，不是另起炉灶。

## 3. `@mcp.tool()` 的默认参数推断

- **name**：默认用函数名（`def get_weather` → `name="get_weather"`）
- **description**：默认用函数 docstring
- **参数 JSON Schema**：从函数注解 + 默认值自动生成

```python
@mcp.tool()
async def search_products(keyword: str, category: str = "all", in_stock: bool = True) -> list:
    """搜索产品"""
    return []
# 自动生成 inputSchema: keyword(str, required)、category(str, default "all")、in_stock(bool) 等
```

**最佳实践**：函数名和 docstring 足够清晰就直接 `@mcp.tool()`；需要精确控制时才传 `name=`/`description=`。

## 4. 单独启动服务

`mcp.run(transport="stdio")` 即可独立启动，等待客户端连接：
- **stdio**：被 Claude Desktop 等宿主调用（标准模式）
- **SSE**：`mcp.run(transport="sse", host="127.0.0.1", port=8000)` → 提供 HTTP 接口

## 相关笔记
- [[AI大模型/mcp/DeepSeek-MCP接入代码示例|MCP接入代码示例与LangChain集成]]
- [[AI大模型/mcp/DeepSeek-MCP-stdio模式解析|MCP stdio 模式解析]]
- [[AI大模型/mcp/DeepSeek-MCP传输协议对比|MCP传输协议对比 SSE 与 Streamable HTTP]]