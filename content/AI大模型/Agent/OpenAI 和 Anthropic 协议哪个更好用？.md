---
title: OpenAI Responses 与 Anthropic Messages 协议对比
tags:
- 协议
- API
- OpenAI
- Anthropic
- 大模型
status: 已消化
created: 2026-11-14
modified: '2026-11-14T23:35:23+08:00'
---

# OpenAI Responses 与 Anthropic Messages 协议对比笔记

> [!abstract] 摘要
> 从消息组装、思考与流式、Token/缓存统计、KV Cache 提示词缓存、跨协议切换五个维度对比 OpenAI Responses 与 Anthropic Messages，末尾附术语对照与核心要点。

本讲系统对比了当前主流的两大 LLM 接入协议，从消息组装规范、思考与流式处理、Token 统计、缓存控制及跨协议切换五个维度解析差异，辅助开发者进行工程选型。

---

## 协议概览

| 项目 | 说明 |
|------|------|
| 主流协议 | **OpenAI Responses** / **Anthropic Messages** |
| 官方默认接口 | Anthropic Messages |

---

## 消息组装规范

### OpenAI Responses

- 系统指令置于请求体最外层的 `instructions` 字段
- 对话历史统一放入 `input` 数组
- 单轮回复中的不同内容（`reasoning`、`message`、`function_call`）**作为独立条目并行排列**，不合成一条消息
- 工具执行结果以独立的 `function_call_output` 返回，可同时包含文本与图片

```text
instructions: <系统指令>
input: [
  { type: "reasoning", ... },
  { type: "message", ... },
  { type: "function_call", ... }
]
// 工具执行完毕后回传
input: [ ..., { type: "function_call_output", ... } ]
```

### Anthropic Messages

- 系统提示词单独放在请求体最外层的 `system` 字段
- `messages` 数组仅允许 `user` 和 `assistant` 两种角色
- 单轮生成的 `thinking`、`text`、`tool_use` 块按顺序**合并在同一条 `assistant` 消息的 `content` 数组中**
- 工具执行结果合并到紧随其后的 `user` 消息里，支持文本与图片混合
- **关键约束**：若同一条 `user` 消息中同时存在 `tool_result` 与普通文本，`tool_result` **必须排在最前面**

```json
{
  "system": "<系统指令>",
  "messages": [
    {
      "role": "assistant",
      "content": [
        { "type": "thinking", ... },
        { "type": "text", ... },
        { "type": "tool_use", ... }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "tool_result", ... },
        { "type": "text", "用户追加内容" }
      ]
    }
  ]
}
```

---

## 思考过程与流式输出处理

| 特性 | OpenAI Responses | Anthropic Messages |
|------|------------------|---------------------|
| 思考过程可见性 | 默认仅下发推理摘要 | content 数组中直接定义明文可读的 `thinking` 块 |
| 完整思考获取方式 | 需显式声明 `include: ["reasoning.encrypted_content"]`，服务端下发加密密文 | 无需额外参数，原生支持 |
| 流式事件序列 | — | 先下发 `thinking_delta`，在该块结束前再下发 `signature_delta` 签名片段 |
| 前端渲染能力 | 无法实时渲染完整思考过程 | 可实时渲染完整思考过程 |
| 多工具调用时的推理流 | — | 模型推理流不会中断 |
| Token 用量上报时机 | 等待流式结束、收到 `response.completed` 事件后才返回；中途取消无法准确统计输入成本 | 首条 `message_start` 事件即携带 `usage`（含输入 Token 数与缓存命中 Token 数），即使中途取消也可精准计费 |
| 内容块边界标记 | — | 每个内容块均有成对的 `content_block_start` 与 `content_block_stop` 事件 |
| CPU 开销 | — | Harness 可在收到停止事件后再对完整工具参数执行一次 `JSON.parse`，显著降低 CPU 开销 |

---

## Token 与缓存统计差异

| 协议 | input_tokens 含义 | 计算方式 |
|------|-------------------|----------|
| OpenAI | **已包含**缓存命中部分 | 未命中缓存的输入量 = `input_tokens` - `cached_tokens` |
| Anthropic | **仅表示**未命中缓存的部分 | 总输入 Token = `input_tokens` + 缓存读取 Token + 缓存写入 Token |

---

## KV Cache 提示词缓存控制策略

### OpenAI Responses

- 由服务端**自动匹配**相同提示词前缀
- 协议层**无标记缓存边界的字段**
- Harness 可做两项优化：
  1. 传入 `prompt_cache_key` 作为会话标识，促使负载均衡器将同一会话的请求路由至同一台推理节点
  2. 传入上一轮的 `previous_response_id`，每轮仅发送新增的工具返回结果，由服务端自动拼接历史上下文

### Anthropic Messages

- 将上下文构建与缓存控制权交给 Harness
- 允许通过 `cache_control` 字段**手动划定缓存边界**（明确告知服务端哪些内容需要缓存）
- DeepSeek Harness 的高缓存命中率核心机制：保持顶层 `system` 与 `tools` 不变，仅在上一轮 `tool_result` 消息之后追加系统更新块或新增工具块

---

## 跨协议切换时的历史消息适配

同一会话中途切换协议所属模型时，Adapter 执行三步转换：

### 1. 思考块降级
- `thinking.signature`（Anthropic）与 `reasoning.encrypted_content`（OpenAI）均与原生成模型强绑定，跨协议后将无法通过校验
- 适配器识别历史消息来源，剥离不兼容的签名/密文
- 将明文 `thinking` 块降级转换为普通 `text` 块递交给新模型

### 2. 工具调用 ID 重写

| 协议 | ID 规则 |
|------|---------|
| OpenAI Responses | 每次工具调用分配 `call_id` 与以 `fc_` 开头的配对 ID，服务端强制校验两者一一对应 |
| Anthropic Messages | 仅使用单一 ID |

- **OpenAI → Anthropic**：过滤 ID 中不合规字符，并通过映射表同步替换 `tool_result` 中引用的 ID
- **Anthropic → OpenAI**：主动剥离旧 ID，仅透传 `call_id`，避免触发服务端的配对校验报错

### 3. 本地原始记录隔离
- 将本地持久化的会话日志与每次发请求使用的临时副本严格分离
- 跨协议转换仅作用于当次请求的临时副本
- 本地日志始终保留原模型的完整签名与 ID，确保后续再次切换时可无损还原

---

## 术语对照表

| 术语 | 所在协议 |
|------|----------|
| `instructions` | OpenAI Responses |
| `input` / `function_call_output` | OpenAI Responses |
| `include: ["reasoning.encrypted_content"]` | OpenAI Responses |
| `prompt_cache_key` | OpenAI Responses |
| `previous_response_id` | OpenAI Responses |
| `response.completed` | OpenAI Responses |
| `system` / `messages` | Anthropic Messages |
| `thinking` / `tool_use` / `tool_result` | Anthropic Messages |
| `cache_control` | Anthropic Messages |
| `thinking_delta` / `signature_delta` | Anthropic Messages |
| `message_start` | Anthropic Messages |
| `content_block_start` / `content_block_stop` | Anthropic Messages |
| `call_id` / `fc_` 开头配对 ID | OpenAI Responses |

---

## 核心要点回顾

- **消息结构**：OpenAI 将思考、消息、工具调用拆分为独立条目；Anthropic 将它们合并在同一条 assistant 消息的 content 数组中
- **思考可见性**：Anthropic 原生支持明文 thinking，OpenAI 需额外声明且返回加密密文
- **计费精度**：Anthropic 首条事件即携带 usage，中途取消可精准计费；OpenAI 需等待流结束
- **缓存控制**：OpenAI 依赖服务端自动匹配；Anthropic 可通过 `cache_control` 手动划定边界，配合增量更新实现高命中率
- **跨协议切换**：需处理思考块降级、工具 ID 重写、本地日志隔离三项适配逻辑

---

## 相关笔记

- [[AI大模型/Agent/Agent结构化输出与工具调用_FC_ToolUse_MCP_Pydantic|Agent 结构化输出与工具调用（Function Calling / Tool Use / MCP / 校验）]] — 工具调用消息结构对照
- [[AI大模型/Agent/DeepSeek-Function-Calling返回JSON|Function Calling 机制与返回JSON]] — Function Calling 返回值的执行语义
- [[工作/面试收集/20_专题研究/大模型API-选型与成本优化|大模型API-选型与成本优化]] — API 选型与成本视角
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] — 返回 AI 大模型内容地图
