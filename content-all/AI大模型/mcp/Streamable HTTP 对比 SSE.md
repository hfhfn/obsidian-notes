---
created: '2026-01-29T23:56:12+08:00'
modified: '2026-01-29T23:56:12+08:00'
---

# Streamable HTTP 对比 SSE

# MCP（模型上下文协议）的传输方案对比


## 1. MCP协议基础介绍
- **推出方**：Anthropic公司  
- **核心目标**：规范LLM（大语言模型）与“外部世界”的通信方式，通过工具/功能支持扩展LLM能力，简化集成过程（减少自定义集成代码，专注工具开发）  
- **发展现状**： adoption迅速，新MCP服务器持续涌现，竞争对手OpenAI也已采用该协议  
- **2025年3月关键更新**（社区反馈驱动）：  
  1. 新增工具授权框架  
  2. 传输层：将`HTTP+SSE`替换为**Streamable HTTP（可流式HTTP）**（本文核心聚焦点）  
  3. 添加用于描述工具行为的注解  
  4. 支持TSON-RPC批处理  
- **本文范围**：仅深入讲解传输层变化，安全性改进将在后续博客中展开


## 2. MCP旧传输方案：HTTP + SSE
### 2.1 SSE基础概念
服务器发送事件（SSE）：一种服务器向客户端**单向**推送事件的机制，依赖持久连接维持通信。

### 2.2 工作流程
1. 客户端发起请求，连接MCP服务器的 `/sse` 端点（如 `http://example.com/sse`）  
2. 服务器返回“端点事件”，包含客户端后续发送消息需使用的URI（如 `http://example.com/messages`）  
3. 客户端使用步骤2返回的 `/messages` 端点与服务器通信  
4. 服务器通过流式事件/消息，持续向客户端传输数据  
- 核心逻辑：双端点分工（`/sse` 获消息URI，`/messages` 传实际数据）


### 2.3 核心代码示例（概念性，原文简化版）
#### 2.3.1 服务器端：`/sse` 端点实现
```python
@app.get("/sse")
async def sse_endpoint(request: Request):  # 原文含拼写误差（如"asyne"），已修正核心语法
    # 生成包含客户端ID和消息端点的"端点事件"
    client_id = request.query_params.get("client_id")  # 从查询参数提取客户端ID
    endpoint_event = f"event:endpoint\ndata:/messages?client_id={client_id}\n\n"
    
    # 返回SSE流式响应（符合text/event-stream标准）
    return StreamingResponse(
        media_type="text/event-stream",
        content=endpoint_event,
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}  # 维持持久连接
    )
    # 注：实际场景需补充客户端消息处理逻辑，此处仅展示核心端点事件返回
```

#### 2.3.2 客户端：SSE事件处理与 `/messages` 调用
```python
def handle_sse_events(self):
    # 设置SSE请求头（指定接受text/event-stream类型）
    headers = {"Accept": "text/event-stream"}
    # 发起/SSE端点请求
    response = self.session.get(f"{self.server_url}/sse", headers=headers)
    # 初始化SSE客户端解析流数据
    sse_client = sseclient.SSEClient(response)
    
    # 循环解析SSE事件，提取消息端点并通信
    for event in sse_client.events:
        if event.event == "endpoint":  # 匹配"端点事件"
            try:
                event_data = json.loads(event.data)
                self.message_endpoint = event_data["data"]  # 获取/messages端点
                self.send_message(self.message_endpoint)  # 调用端点发送消息
            except json.JSONDecodeError:
                print(f"解码SSE消息失败：{event.data}")
```


### 2.4 方案局限性
- 需维护**两个独立的连接/端点**（`/sse` 与 `/messages`），客户端复杂度高  
- 依赖**持久连接**，导致无状态服务器实现困难（需跟踪客户端会话）  
- 与部分基础设施/中间件兼容性有限（非所有中间件原生支持SSE持久连接）  
- 网络容错性差：连接中断时无自动恢复机制，对跨互联网的远程MCP服务器不友好


## 3. MCP新传输方案：Streamable HTTP（可流式HTTP）
### 3.1 核心设计理念
2025年3月更新后，MCP取消双端点设计，改用**单一端点**（通常为 `/messages`），服务器可根据交互需求**动态决定**返回“标准HTTP响应”或“流式响应”（流式响应可在连接后续阶段返回，无需首次响应即触发）。


### 3.2 工作流程
1. 客户端直接向MCP服务器的 `/messages` 端点发起请求（支持GET/POST等标准HTTP方法）  
2. 服务器在**同一 `/messages` 端点**处理请求：  
   - 若为单次交互（如工具调用）：返回标准HTTP JSON响应  
   - 若需持续传输（如流式生成结果）：返回SSE格式的流式响应  
3. 客户端在同一连接中接收所有响应，无需切换端点  
- 核心逻辑：单端点统一处理所有交互，动态适配响应类型


### 3.3 核心代码示例（服务器端，原文简化版）
#### 3.3.1 GET `/message`：返回流式响应（处理持续数据传输）
```python
@app.get("/message")
async def stream_messages(request: Request, response: Response):
    # 从请求头提取Session ID，管理客户端会话
    session_id = request.headers.get("session-id")
    session = active_sessions.get(session_id)  # 假设active_sessions为全局会话池
    message_queue = session.get("queue")  # 会话内的消息队列
    
    # 生成流式事件的异步生成器
    async def event_generator():
        # 1. 发送初始"就绪"事件
        yield {
            "event": "ready",
            "data": json.dumps({
                "jsonrpc": "2.0",
                "method": "notify",
                "params": {"type": "ready"}
            }),
            "id": session_id
        }
        
        # 2. 持续从队列取消息，流式返回
        while True:
            message = await message_queue.get()
            if message == "CLOSE":  # 接收关闭信号，终止流
                break
            # 流式返回消息事件
            yield {
                "event": "message",
                "data": json.dumps(message),
                "id": session_id
            }
    
    # 返回SSE流式响应
    return EventSourceResponse(event_generator())
```

#### 3.3.2 POST `/message`：返回标准HTTP响应（处理单次交互）
```python
@app.post("/message")
async def handle_single_message(request: Request, response: Response):
    # 提取Session ID和TSON-RPC请求体
    session_id = request.headers.get("session-id")
    request_body = await request.json()
    rpc_request = JsonRpcRequest(** request_body)  # 映射为RPC请求模型
    
    try:
        # 根据RPC方法路由处理逻辑
        if rpc_request.method == "initialize":
            result = await handle_initialize(rpc_request.id, rpc_request.params)
        elif rpc_request.method == "toolList":
            result = await handle_tool_list(rpc_request.id)
        elif rpc_request.method == "callTool":
            result = await handle_call_tool(rpc_request.id, rpc_request.params or {})
        else:
            # 方法不存在错误响应
            result = JsonRpcResponse(
                id=rpc_request.id,
                error={"code": -32601, "message": f"方法不存在：{rpc_request.method}"}
            )
        # 返回标准JSON响应
        return JSONResponse(result.dict(exclude_none=True))
    except Exception as e:
        # 内部错误处理
        return JSONResponse(
            JsonRpcResponse(
                id=rpc_request.id if hasattr(rpc_request, "id") else None,
                error={"code": -32603, "message": f"内部错误：{str(e)}"}
            ).dict()
        )
```


### 3.4 方案核心优势
1. **纯HTTP实现**：无需服务器单独支持SSE组件，可部署在标准HTTP服务器上，简化开发  
2. **更好的兼容性**：仅依赖标准HTTP协议，兼容所有常规中间件（如负载均衡、API网关）  
3. **灵活的架构**：同时支持无状态（解决旧方案痛点）和有状态服务器实现  
4. **客户端简化**：仅需与单一 `/messages` 端点交互，降低非开发人员理解成本  


## 4. 新旧传输方案核心差异对比
| 对比维度       | 旧方案（HTTP+SSE）               | 新方案（Streamable HTTP）      |
| -------------- | -------------------------------- | ------------------------------ |
| 端点数量       | 2个（`/sse` + `/messages`）      | 1个（通常为 `/messages`）      |
| 连接类型       | 双独立连接（持久SSE + 消息连接） | 单连接（同一端点处理所有交互） |
| 服务器依赖     | 需额外支持SSE                    | 标准HTTP服务器（无额外依赖）   |
| 无状态支持     | 困难（依赖持久连接跟踪状态）     | 支持（可实现完全无状态架构）   |
| 基础设施兼容性 | 有限（部分中间件不支持SSE）      | 广泛（兼容所有标准HTTP中间件） |
| 客户端复杂度   | 高（需管理双端点+SSE事件）       | 低（单一端点交互）             |
| 网络恢复能力   | 差（无自动恢复机制）             | 优（可基于HTTP重试机制扩展）   |



---



## **Streamable HTTP 与 HTTP+SSE 的核心区别**

要理解 **Streamable HTTP 与 HTTP+SSE 的核心区别**，不能仅停留在“端点数量”的表面差异——前者本质是对 HTTP 通信模式的**架构级优化**：它并非“依赖 SSE 却只改了端点”，而是重构了 SSE 的使用逻辑、连接管理、状态维护和资源效率，从“强制双通道”升级为“单端点动态适配”。结合参考资料，具体区别可从以下5个关键维度展开：


### 1. SSE 的定位：从“强制独立通道”变为“按需升级的可选能力”
HTTP+SSE 中，SSE 是**唯一的流传输通道**，且必须与请求通道分离：  
- 客户端必须先连接专门的 `/sse` 端点（仅用于接收服务器流消息），再通过 `/messages` 端点发送请求，两者是“发送→接收”的独立双通道，**无论请求是否需要流式响应，都必须建立 SSE 长连接**（即使是简单的单次查询，也需维持 SSE 连接等待可能的流数据）。  
- 例如：客户端要获取一个工具的基础配置（非流式需求），仍需先建立 `/sse` 连接，再发 `/messages` 请求，SSE 连接此时处于“闲置但占用资源”状态。

而 Streamable HTTP 中，SSE 是**按需触发的“升级能力”**，而非强制通道：  
- 所有交互通过单一端点（如 `/message`）完成，服务器会根据请求类型动态决定是否使用 SSE：  
  - 简单请求（如“获取工具列表”“单次工具调用结果”）：直接返回普通 HTTP 响应（200 OK + JSON），**无需启动 SSE**，请求完成后连接即可释放；  
  - 复杂流式需求（如“LLM 生成进度推送”“批量结果分块返回”）：才会将当前 HTTP 连接“升级为 SSE 流”，用 SSE 传输事件，完成后关闭流连接。  
- 例如：客户端查询工具列表（非流式），仅需一次 POST `/message` 请求，服务器返回普通 JSON 响应，连接立即断开，无需维持任何长连接（参考摘要1、2、4）。


### 2. 连接管理：从“强制双长连接”变为“按需建立连接”
HTTP+SSE 的核心痛点是 **连接资源浪费**，而 Streamable HTTP 通过“按需连接”大幅优化资源效率：  
- HTTP+SSE：客户端需同时维持 **两个持久长连接**（`/sse` 用于接收流、`/messages` 用于发送请求），即使请求已完成，`/sse` 连接仍需保持以等待后续流消息——这导致服务器需为每个客户端分配固定内存和线程，并发量受限（摘要5提到：SSE 长连接内存占用高、并发限制低，短连接则相反）。  
- Streamable HTTP：仅在“需要流式响应”时建立临时 SSE 连接，简单请求用“短连接”（请求-响应后立即释放）：  
  - 无流式需求：1次 HTTP 请求 → 1次普通响应 → 连接关闭，不占用额外资源；  
  - 有流式需求：1次 HTTP 请求 → 服务器升级为 SSE 流 → 流传输完成后关闭连接，无需长期挂起。  
- 例如：文档翻译场景中，客户端发起翻译请求（POST `/message`），服务器仅在“返回翻译进度和分块结果”时启动 SSE 流，翻译完成后立即关闭流，避免连接长期闲置（摘要5实战案例）。


### 3. 状态维护：从“难扩展的有状态”变为“支持无状态+断线恢复”
HTTP+SSE 因依赖双长连接，**无法实现无状态服务器**，且断线后状态完全丢失；而 Streamable HTTP 通过“会话 ID 机制”解决了这一问题：  
- HTTP+SSE：服务器需跟踪每个客户端的 `/_sse` 连接状态（如“当前已推送的事件进度”），一旦连接中断（如网络波动），客户端需重新建立 `/sse` 连接，之前的交互上下文（如“未接收完的流数据”“身份验证状态”）全部丢失，必须从头开始（摘要2、3）。  
- Streamable HTTP：  
  - 无状态支持：服务器可通过“会话 ID”（客户端请求头或参数携带）关联状态，无需维持连接本身——即使是多台服务器组成的集群，也能通过会话 ID 从 Redis 等中间件获取客户端状态，轻松水平扩展（摘要2、3提到“无状态服务器架构”）；  
  - 断线恢复：连接中断后，客户端只需携带原会话 ID 重新请求 `/message`，服务器即可通过会话 ID 恢复之前的交互进度（如“继续推送未完成的翻译分块”），无需重新初始化（摘要1、5）。


### 4. 基础设施兼容性：从“易被中断”变为“贴合 HTTP 生态”
HTTP+SSE 的长连接易被网络中间件（代理、防火墙、CDN）中断，而 Streamable HTTP 因“纯 HTTP 实现”完全兼容现有基础设施：  
- HTTP+SSE：`/sse` 端点的长连接（通常超时时间长）容易触发中间件的“闲置连接清理规则”——例如代理服务器默认断开 60s 无数据的连接，防火墙可能拦截非标准的长连接，导致 SSE 流频繁中断（摘要3、5）；  
- Streamable HTTP：所有交互都是“标准 HTTP 请求/响应”（包括 SSE 流升级）：  
  - 简单请求：与普通 API 无区别，中间件可正常转发；  
  - SSE 流：本质是“带 `text/event-stream` 头的 HTTP 响应”，使用 HTTP 分块编码（Chunked Encoding）传输，中间件无需特殊配置即可识别，不会被误判为“异常长连接”（摘要3、6）。  
- 例如：通过 CDN 部署 MCP 服务器时，HTTP+SSE 的 `/sse` 连接可能被 CDN 截断，而 Streamable HTTP 的 `/message` 端点可直接通过 CDN 转发，无需额外适配（摘要2）。


### 5. 功能灵活性：从“单向被动流”变为“双向动态交互”
HTTP+SSE 是“单向被动”的流传输，而 Streamable HTTP 支持“请求-响应”与“流推送”的灵活结合：  
- HTTP+SSE：服务器只能通过 `/sse` 端点“被动推送流”，无法主动根据客户端请求调整——例如：客户端发送“取消任务”请求后，服务器仍需通过 `/sse` 推送已启动的流数据，无法立即终止（摘要2、5提到“单向被动响应，无任意时机推送能力”）；  
- Streamable HTTP：单一 `/message` 端点可同时处理“请求指令”和“流响应”：  
  - 客户端可通过 POST 请求发送“终止任务”“调整参数”等指令；  
  - 服务器收到指令后，可立即停止 SSE 流，或调整流数据内容，实现“双向动态交互”（摘要3、5）。  
- 例如：LLM 生成文本时，客户端通过 POST `/message` 发送“停止生成”指令，服务器可立即终止 SSE 流，无需等待流自然结束（摘要3动态响应案例）。


### 总结：核心是“从固定模式到动态适配”的架构升级
| 对比维度     | HTTP+SSE                   | Streamable HTTP                  |
| ------------ | -------------------------- | -------------------------------- |
| SSE 定位     | 强制独立通道（必须用）     | 按需升级能力（可选用）           |
| 连接模式     | 双长连接（永久占用资源）   | 按需连接（短连接为主，流为临时） |
| 状态管理     | 强依赖连接状态（难无状态） | 会话 ID 解耦（支持无状态+恢复）  |
| 中间件兼容性 | 易被长连接中断（不友好）   | 纯 HTTP 生态（完全兼容）         |
| 交互灵活性   | 单向被动流（无法动态调整） | 双向动态交互（指令+流协同）      |

简言之：HTTP+SSE 是“为了流而设计的固定双通道”，而 Streamable HTTP 是“为了适配所有场景的动态单端点”——SSE 只是前者的“唯一流工具”，却是后者的“可选流手段”，两者的差异本质是“通信架构的设计理念升级”，而非“端点数量的简单修改”。



---



## 一、SSE的基础定义：什么是服务器发送事件（Server-Sent Events）

SSE的全称是**Server-Sent Events（服务器发送事件）**，是W3C标准化的一种HTTP通信技术，核心目标是解决“HTTP协议默认是‘客户端请求-服务器响应’的单向模式”的局限，让服务器能在**无需客户端反复发起请求**的情况下，主动、持续地向客户端推送数据（即“流传输”）。

简单来说：普通HTTP是“客户端问、服务器答”（一次请求对应一次响应），而SSE是“客户端问一次，服务器持续答多次”（一次请求对应持续的流式响应），比如实时股价更新、LLM生成内容的分块推送、日志实时输出等场景，都适合用SSE实现。


### 二、SSE的3个关键技术特征（决定它如何工作）
SSE的本质是“带特殊规则的HTTP响应”，所有行为都基于HTTP协议，核心依赖以下3个技术约定：

#### 1. 必须使用「text/event-stream」媒体类型
客户端发起请求时，需要在HTTP头中声明`Accept: text/event-stream`，告诉服务器“我要接收SSE流式数据”；服务器返回响应时，也必须设置`Content-Type: text/event-stream`，明确告知客户端“这是SSE格式的流数据”。  
这是SSE与普通HTTP响应的核心区别——普通HTTP响应的`Content-Type`可能是`application/json`（JSON数据）、`text/html`（网页），而SSE固定用`text/event-stream`标识“流式事件”。

#### 2. 数据格式：按“事件块”组织，有固定字段
服务器推送的SSE流数据，不是杂乱的字节流，而是由一个个“事件块”组成，每个事件块包含以下可选字段（字段间用`\n`分隔，事件块末尾用`\n\n`结束）：
- `event`：事件类型（自定义名称，如“message”“progress”“ready”），客户端可按类型筛选处理；
- `data`：事件的核心数据（字符串格式，可放JSON、文本等，客户端需自行解析）；
- `id`：事件唯一标识（用于断线重连时，客户端告诉服务器“我上次收到到哪个id的事件，继续推”）；
- `retry`：断线重连时间（毫秒，客户端若断开连接，会按这个时间自动重试）。  

例如文档中MCP服务器返回的SSE事件块（简化后）：  
```
event:endpoint\n
data:/messages?client_id=123\n
\n  # 事件块结束
```
这段代码的意思是：推送一个名为“endpoint”的事件，数据是客户端后续发送消息的URI（`/messages?client_id=123`）。

#### 3. 连接特性：基于HTTP长连接，支持自动重连
- **长连接**：SSE依赖HTTP长连接（Persistent Connection）——客户端发起一次请求后，连接不会像普通HTTP那样“响应完成就关闭”，而是保持打开状态，服务器通过这个连接持续推送事件，直到服务器主动关闭或客户端断开；
- **自动重连**：若连接因网络波动中断，客户端会自动按`retry`字段指定的时间重试（默认3秒），并通过`Last-Event-ID`请求头告诉服务器“上次收到的最后一个事件id”，服务器可据此继续推送未完成的数据，避免重复或遗漏。


### 三、SSE在MCP两种传输方案中的角色差异（关键！避免混淆）
你提到“Streamable HTTP通过text/event-stream头实现SSE”，这个观察很准确，但需要注意：**SSE本身是固定的技术机制，但MCP的新旧方案对SSE的“使用方式”完全不同**——这也是两者核心差异的关键：

| 对比维度            | 旧方案（HTTP+SSE）                                           | 新方案（Streamable HTTP）                                    |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| SSE的“使用场景”     | 强制使用：所有与服务器的交互，都必须先通过专门的`/sse`端点建立SSE连接，即使是不需要流式响应的简单请求（如“获取工具列表”） | 按需使用：仅当需要“流式响应”（如LLM分块生成、实时日志）时，才通过单一`/message`端点启用SSE（设置`text/event-stream`头）；简单请求直接返回普通HTTP响应（如`application/json`），不启用SSE |
| SSE与端点的绑定关系 | SSE绑定独立的`/sse`端点：SSE连接和业务请求（如发送消息）必须用两个不同端点（`/sse`负责收流，`/messages`负责发请求） | SSE不绑定固定端点：SSE能力集成在`/message`一个端点中，同一个端点既处理普通请求，也处理SSE流请求 |
| SSE连接的“生命周期” | 长期占用：SSE连接建立后，无论是否有数据推送，都需长期保持（避免断线后重新建立），浪费服务器资源 | 按需创建：仅在有流式需求时建立SSE连接，流传输完成后立即关闭；无流式需求时不建立，用短连接节省资源 |


### 四、一句话总结SSE的本质
SSE是**HTTP协议的“流传输扩展”**——它没有发明新的通信协议，只是通过“`text/event-stream`媒体类型+固定事件格式+长连接”的约定，让服务器能主动、持续地向客户端推送数据，解决了普通HTTP“只能客户端问、服务器答”的单向局限。

而MCP的Streamable HTTP方案，本质是“更聪明地用SSE”：不再把SSE当作“必须全程启用的固定通道”，而是作为“需要时才激活的流式工具”，从而解决了旧方案（HTTP+SSE）的资源浪费、兼容性差、难扩展等问题。