---
title: 生产环境全链路 LangGraph Agent
tags:
- LangGraph
- Agent
- 生产环境
- 记忆系统
- HITL
status: 已消化
created: 2026-11-14
modified: '2026-11-14T23:35:23+08:00'
---

# 生产环境全链路 LangGraph Agent · 完整笔记

> [!abstract] 摘要
> 面向「有基础但没做过生产级 Agent」的全链路实现：可直接运行的代码 + 分层记忆、锚点隔离、路由与子任务、重试与熔断、HITL、Token 计费、LangSmith Trace、多租户、TTL 治理九个技术点，最后用一轮请求串起完整生命周期。

> 一份面向有基础、但没做过生产级 Agent 的开发者。上半部分是可直接运行的完整代码，下半部分把 **分层记忆、锚点隔离、路由与子任务、重试与熔断、HITL、Token 计费、LangSmith Trace、多租户命名空间、TTL 治理** 九个技术点逐个拆解，最后用一轮请求的完整生命周期把它们串起来。
>
> 本地用 `InMemorySaver` / `InMemoryStore`，生产替换为 `AsyncPostgresSaver` / `AsyncPostgresStore`，结构不变。

---

## 一、完整代码

```python
import os, uuid, logging, hashlib
from datetime import datetime, timedelta
from typing import Literal

# ---- LangSmith Trace：必须在 import langgraph 之前设置 ----
os.environ["LANGSMITH_OTEL_ENABLED"] = "true"
os.environ["LANGSMITH_TRACING"] = "true"
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = os.getenv(
    "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"
)
os.environ["OTEL_SERVICE_NAME"] = "prod-graph"

from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    HumanMessage, AIMessage, SystemMessage, trim_messages,
    count_tokens_approximately,
)
from langchain_core.callbacks import BaseCallbackHandler
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.types import interrupt, Command
from tenacity import (
    retry, stop_after_attempt, wait_exponential, retry_if_exception_type,
)
import pybreaker

logger = logging.getLogger("prod_graph")

# ============================== 配置 ==============================
RAW_WINDOW = 4                        # 摘要时永远保留的原文条数
SUMMARY_TRIGGER = 8                   # 未摘要消息超过这个数才触发压缩
TRIM_MAX_TOKENS = 1200                # 近期原文的 token 上限
MAX_ANCHORS = 12                      # 每轮注入 prompt 的最大锚点数
ANCHOR_KEYWORDS = ["合同", "签署", "永久", "记住这个"]
RESULT_ANCHOR_KEYWORDS = ["签署成功", "决策已确认", "永久有效"]
HITL_TOOLS = {"write_file", "execute_sql", "delete_record"}
DEFAULT_TENANT = "default"

model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
summary_model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
llm_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=300)


# ============================== 工具函数 ==============================
def _text(m) -> str:
    """content 可能是 str 或 list（多模态），统一取文本用于关键词判断。"""
    c = getattr(m, "content", "")
    return c if isinstance(c, str) else str(c)


def _tenant(config) -> str:
    """多租户：tenant_id 从 config 读，绝不硬编码。"""
    return config["configurable"].get("tenant_id", DEFAULT_TENANT)


def _business_idempotency_key(user_id: str, tool_name: str, args_text: str) -> str:
    """业务语义幂等键：跨会话成立，与 thread_id / message_id 无关。"""
    raw = f"{user_id}|{tool_name}|{args_text.strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ============================== 计费回调 ==============================
class BillingHandler(BaseCallbackHandler):
    def __init__(self):
        self.records = []

    def on_llm_end(self, response, **kwargs):
        msg = response.generations[0][0].message
        usage = getattr(msg, "usage_metadata", {}) or {}
        d = usage.get("input_token_details", {}) or {}
        meta = kwargs.get("metadata") or {}
        # 节点名优先取 LangGraph 自动注入的 metadata，tags 只是回退
        node = meta.get("langgraph_node") or (kwargs.get("tags") or ["unknown"])[0]
        self.records.append({
            "node": node,
            "model": msg.response_metadata.get("model_name", ""),
            "uncached_input": usage.get("input_tokens", 0)
                              - d.get("cache_creation", 0)
                              - d.get("cache_read", 0),
            "output": usage.get("output_tokens", 0),
            "cache_creation": d.get("cache_creation", 0),   # 写缓存，单价高
            "cache_read": d.get("cache_read", 0),           # 命中缓存，单价低
        })

    def summary(self):
        agg = {}
        for r in self.records:
            a = agg.setdefault(r["node"], {
                "uncached_input": 0, "output": 0,
                "cache_creation": 0, "cache_read": 0,
            })
            for f in ("uncached_input", "output", "cache_creation", "cache_read"):
                a[f] += r[f]
        return agg


# ============================== State ==============================
class ProdState(MessagesState):
    summary: str                 # 远期摘要
    summarized_count: int        # 已摘要到第几条
    anchor_cursor: int           # retain 扫描锚点的游标（只由 retain 推进）
    next_worker: str             # router 输出
    working_context: list        # recall 拼好的 prompt
    pending_approval: dict | None
    rejected: bool               # 区分"用户拒绝"与"系统故障"
    last_error: str | None       # agent 失败标记，驱动 fallback 条件边
    fallback_used: bool


# ============================== 可靠性包装 ==============================
def with_resilience(fn, name: str):
    """tenacity 内层重试，pybreaker 外层熔断。reraise=True 保留原异常类型。"""
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TimeoutError, ConnectionError)),
        reraise=True,
    )
    def wrapped(*args, **kwargs):
        return fn(*args, **kwargs)
    return llm_breaker(wrapped)


# ============================== 1. ingest：入口锚点 ==============================
def ingest_node(state: ProdState, config, *, store: InMemoryStore):
    """只检测用户声明式锚点，写入 Store。不推进 anchor_cursor。"""
    last = state["messages"][-1]
    user_id = config["configurable"]["user_id"]
    tenant = _tenant(config)

    if any(k in _text(last) for k in ANCHOR_KEYWORDS):
        store.put(
            ("anchors", tenant, user_id),
            str(uuid.uuid4()),
            {"content": _text(last), "role": last.type,
             "ts": datetime.now().isoformat(),
             "reason": "入口用户声明锚点"},
        )
    return {}


# ============================== 2. recall：记忆前处理 ==============================
def recall_node(state: ProdState, config, *, store: InMemoryStore):
    """三层记忆拼装：稳定前缀 + 动态 system（锚点+摘要）+ 裁剪后的近期原文。"""
    user_id = config["configurable"]["user_id"]
    tenant = _tenant(config)

    # 锚点：倒序取最近 MAX_ANCHORS 条，防止 prompt 膨胀
    anchors = sorted(
        store.search(("anchors", tenant, user_id), limit=50),
        key=lambda a: a.value.get("ts", ""),
        reverse=True,
    )[:MAX_ANCHORS]
    anchor_block = "\n".join(f"[锚点] {a.value['content']}" for a in anchors)

    summary = state.get("summary", "")
    recent = state["messages"][state.get("summarized_count", 0):]
    recent = trim_messages(
        recent, strategy="last",
        token_counter=count_tokens_approximately,
        max_tokens=TRIM_MAX_TOKENS,
        start_on="human", end_on=("human", "tool"),
    )

    # prompt cache 友好：稳定内容在前，动态内容在后
    stable = SystemMessage(content=(
        f"租户：{tenant}\n"
        f"你是生产环境助手，严格遵守工具审批策略与记忆边界。"
    ))
    dynamic = SystemMessage(content=(
        f"永久锚点（按时间倒序，最多 {MAX_ANCHORS} 条）：\n{anchor_block or '（无）'}\n\n"
        f"远期摘要：\n{summary or '（无）'}"
    ))
    return {"working_context": [stable, dynamic] + recent}


# ============================== 3. router：只做分流 ==============================
def router_node(state: ProdState):
    text = _text(state["messages"][-1]).lower()
    if any(k in text for k in ["写文件", "write", "sql", "删除"]):
        return {"next_worker": "tool"}
    if any(k in text for k in ["分析", "报告", "总结"]):
        return {"next_worker": "subtask"}
    return {"next_worker": "agent"}


# ============================== 4. HITL 工具守卫 ==============================
def tool_guard_node(state: ProdState, config):
    last = state["messages"][-1]
    text = _text(last)
    tool_name = "write_file" if "写文件" in text else "execute_sql"

    if tool_name not in HITL_TOOLS:
        return {"pending_approval": {"tool": tool_name, "decision": "auto"},
                "rejected": False}

    # 挂起等待审批；resume 后此处返回 resume 传入的 decision
    decision = interrupt({
        "type": "tool_approval",
        "tool": tool_name,
        "args": text,
        "message": f"工具 {tool_name} 需要人工审批",
    })

    if decision.get("decision") == "reject":
        return {"messages": [AIMessage(content=f"已拒绝执行 {tool_name}")],
                "pending_approval": None, "rejected": True}

    user_id = config["configurable"]["user_id"]
    return {"pending_approval": {
                "tool": tool_name,
                "decision": decision,
                "idempotency_key": _business_idempotency_key(user_id, tool_name, text),
            },
            "rejected": False}


def route_after_guard(state: ProdState) -> Literal["execute", "retain", "fallback"]:
    if state.get("pending_approval"):
        return "execute"
    if state.get("rejected"):
        return "retain"      # 用户拒绝 → 正常收尾，不是服务故障
    return "fallback"


def execute_approved_tool(state: ProdState, config, *, store: InMemoryStore):
    # 生产：幂等键落 Redis/DB，SETNX 或唯一约束，透传下游
    idempotency_key = state["pending_approval"]["idempotency_key"]
    logger.info("执行工具, idempotency_key=%s", idempotency_key)
    return {"messages": [AIMessage(content=f"工具已执行（幂等键 {idempotency_key[:16]}）")],
            "pending_approval": None}


# ============================== 5. 子任务 Subgraph ==============================
def build_subtask_graph():
    b = StateGraph(MessagesState)
    b.add_node("analyze", lambda s: {
        "messages": [AIMessage(content=f"分析完成：{_text(s['messages'][-1])[:40]}")]
    })
    b.add_edge(START, "analyze")
    b.add_edge("analyze", END)
    return b.compile()


subtask_graph = build_subtask_graph()


# ============================== 6. retain：记忆后处理 ==============================
def _summarize(prompt: str) -> str:
    return summary_model.invoke(
        [HumanMessage(content=prompt)],
        {"tags": ["retain_summary"],
         "metadata": {"langgraph_node": "retain_summary"}},
    ).content


resilient_summary = with_resilience(_summarize, "retain_summary")


def retain_node(state: ProdState, config, *, store: InMemoryStore):
    user_id = config["configurable"]["user_id"]
    tenant = _tenant(config)
    msgs = state["messages"]
    cursor = state.get("anchor_cursor", 0)

    # ① 扫描新增消息，捕获执行结果产生的锚点
    for m in msgs[cursor:]:
        if any(k in _text(m) for k in RESULT_ANCHOR_KEYWORDS):
            store.put(
                ("anchors", tenant, user_id),
                str(uuid.uuid4()),
                {"content": _text(m), "role": m.type,
                 "ts": datetime.now().isoformat(),
                 "reason": "执行结果产生的锚点"},
            )

    # ② 摘要推进：未摘要消息超过阈值才压缩，永远保留 RAW_WINDOW 条原文
    pending = len(msgs) - state.get("summarized_count", 0)
    new_summary = state.get("summary", "")
    new_count = state.get("summarized_count", 0)
    if pending > SUMMARY_TRIGGER:
        end = len(msgs) - RAW_WINDOW
        batch = msgs[new_count:end]
        prompt = (
            f"已有摘要：\n{new_summary or '（无）'}\n\n"
            f"新增对话：\n" + "\n".join(f"[{m.type}] {_text(m)}" for m in batch)
            + "\n\n合并为更新后的摘要，保留事实、决策、未决问题。"
        )
        try:
            new_summary = resilient_summary(prompt)
            new_count = end
        except Exception as e:
            logger.warning("摘要失败，保留旧摘要: %s", e)

    # ③ 清理临时状态，避免残留到下一轮
    return {
        "anchor_cursor": len(msgs),
        "summary": new_summary,
        "summarized_count": new_count,
        "pending_approval": None,
        "rejected": False,
        "last_error": None,
    }


# ============================== 7. agent ==============================
def _agent_call(ctx, config):
    return model.invoke(ctx, config)


resilient_agent = with_resilience(_agent_call, "agent")


def agent_node(state: ProdState, config):
    try:
        resp = resilient_agent(state["working_context"], config)
        return {"messages": [resp], "last_error": None}
    except Exception as e:
        # 重试耗尽或熔断打开：转成状态字段，交给条件边走 fallback，不冒泡
        logger.exception("agent 调用失败: %s", type(e).__name__)
        return {"last_error": type(e).__name__}


# ============================== 8. 降级兜底 ==============================
def fallback_node(state: ProdState):
    return {"messages": [AIMessage(content="当前服务繁忙，请稍后重试。")],
            "fallback_used": True}


# ============================== 构图 ==============================
builder = StateGraph(ProdState)
builder.add_node("ingest", ingest_node)
builder.add_node("recall", recall_node)
builder.add_node("router", router_node)
builder.add_node("tool_guard", tool_guard_node)
builder.add_node("execute_tool", execute_approved_tool)
builder.add_node("subtask", subtask_graph)      # 子图直接挂编译结果
builder.add_node("agent", agent_node)
builder.add_node("retain", retain_node)
builder.add_node("fallback", fallback_node)

builder.add_edge(START, "ingest")
builder.add_edge("ingest", "recall")
builder.add_edge("recall", "router")

builder.add_conditional_edges(
    "router",
    lambda s: s["next_worker"],
    {"tool": "tool_guard", "subtask": "subtask", "agent": "agent"},
)

builder.add_conditional_edges(
    "tool_guard", route_after_guard,
    {"execute": "execute_tool", "retain": "retain", "fallback": "fallback"},
)

builder.add_edge("execute_tool", "retain")
builder.add_edge("subtask", "retain")

# agent 失败 → fallback，而不是在图外抛异常
builder.add_conditional_edges(
    "agent",
    lambda s: "fallback" if s.get("last_error") else "retain",
    {"fallback": "fallback", "retain": "retain"},
)

builder.add_edge("retain", END)
builder.add_edge("fallback", END)

# 生产替换：
# from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
# from langgraph.store.postgres.aio import AsyncPostgresStore
checkpointer = InMemorySaver()
store = InMemoryStore()
graph = builder.compile(checkpointer=checkpointer, store=store)


# ============================== 调用示例 ==============================
billing = BillingHandler()
config = {
    "configurable": {
        "thread_id": "t-001",
        "user_id": "alice",
        "tenant_id": "tenant_acme",
    },
    "callbacks": [billing],
    "recursion_limit": 25,
}

# ① 普通对话
graph.invoke(
    {"messages": [HumanMessage(content="帮我分析一下最近的记忆系统设计")]},
    config,
)

# ② 声明锚点
graph.invoke(
    {"messages": [HumanMessage(content="合同已签署，永久记住，金额 30 万")]},
    config,
)

# ③ 触发 HITL：interrupt() 不会抛到用户代码，检查 __interrupt__ 字段
result = graph.invoke(
    {"messages": [HumanMessage(content="帮我写文件到 /tmp/report.txt")]},
    config,
)
if result.get("__interrupt__"):
    logger.info("HITL 暂停：%s", result["__interrupt__"])
    result = graph.invoke(Command(resume={"decision": "approve"}), config)

# ④ 查看存档 + 计费
snapshot = graph.get_state(config)
print(f"Checkpointer 全量消息：{len(snapshot.values['messages'])} 条")
print("Token 计费汇总：")
for node, a in billing.summary().items():
    print(f"  {node}: 未缓存输入={a['uncached_input']}, 输出={a['output']}, "
          f"缓存创建={a['cache_creation']}, 缓存命中={a['cache_read']}")
```

---

## 二、九个技术点的实现思路

每个技术点回答三件事：**解决什么问题 → 落在哪 → 关键点/坑**。

### 1. 分层记忆：三层结构各管一段

**问题**：对话越来越长，全塞 prompt 会爆 token，全摘要又丢细节。

**落地**：`recall` + `retain` + State 上的 `summary` / `summarized_count`。

```
working_context = [stable system] + [dynamic system(锚点+摘要)] + [裁剪后的近期原文]
                   ↑ 几乎不变          ↑ 每轮变但短            ↑ 只保留最近几轮
messages（全量）→ Checkpointer，不进 prompt
summary（远期） → 超过 SUMMARY_TRIGGER 才压缩，RAW_WINDOW 条永远保留原文
```

- **近期原文**：从 `summarized_count` 截断，再用 `trim_messages` 按 token 裁剪。
- **摘要推进**：`retain` 中只有 `pending > SUMMARY_TRIGGER` 才压缩，且 `end = len(msgs) - RAW_WINDOW` 保留最近原文。
- **坑**：`messages` 全量在 Checkpointer 里，从不删除；被"压缩"的只是 prompt 里看到的内容。**存档 ≠ 上下文**。

### 2. 锚点隔离：关键事实走 Store，不走 messages

**问题**："合同已签署，永久记住"如果只在 messages 里，几轮后会被摘要吞掉。

**落地**：`ingest`（入口声明）+ `retain`（结果产生）+ `recall`（每轮注入），Store 命名空间 `("anchors", tenant, user_id)`。

- 锚点拥有**独立于 messages 裁剪/摘要的生命周期**：写 Store，recall 时注入 system。
- **两个坑**：
  - `ingest` 返回 `messages: []` **不会**删掉用户消息——它在 invoke 时已进 messages。真正的隔离是"额外落 Store + 注入"。
  - `anchor_cursor` **只由 `retain` 推进**。若 `ingest` 也推进，入口锚点和结果锚点的检测范围会互斥。

### 3. 路由与子任务：主图只分流，子图自己闭环

**问题**：所有逻辑塞一个图，条件边爆炸。

**落地**：`router` 输出 `next_worker`，`subtask` 节点直接挂编译好的子图。

```python
subtask_graph = build_subtask_graph()    # 独立编译
builder.add_node("subtask", subtask_graph)   # 直接挂
```

- `router` **不知道记忆和工具的存在**，只读最后一条消息。
- 子图生产化的关键是**与父图共享 `messages` 字段**，内部私有状态用子图自己的 State 定义，不外泄。

### 4. 重试与熔断：包在 LLM 调用外层，异常转状态字段

**问题**：LLM 偶发超时要重试；持续挂了要快速失败，不能重试放大延迟。

**落地**：`with_resilience`（tenacity 内层重试 + pybreaker 外层熔断）+ `agent_node` 的 `try/except` + 条件边。

```python
resilient_agent = with_resilience(_agent_call, "agent")

def agent_node(state, config):
    try:
        resp = resilient_agent(state["working_context"], config)
        return {"messages": [resp], "last_error": None}
    except Exception as e:
        return {"last_error": type(e).__name__}    # 转状态字段，不冒泡

builder.add_conditional_edges("agent",
    lambda s: "fallback" if s.get("last_error") else "retain",
    {"fallback": "fallback", "retain": "retain"})
```

- **最容易做错的地方**：不 `try/except`，熔断打开时异常冒泡到图外，`fallback` **永远不会执行**。异常必须在节点内转成状态字段，由边决定走向。
- `reraise=True` 保证重试耗尽抛原异常，不是 `RetryError`，便于按类型区分。

### 5. HITL：`interrupt()` 是暂停，不是抛异常

**问题**：写文件、SQL 这类高危操作必须人工审批。

**落地**：`tool_guard` 里 `interrupt()` 挂起，Checkpointer 持久化现场；调用方检查 `__interrupt__`，`Command(resume=...)` 恢复。

```python
# 节点内
decision = interrupt({"type": "tool_approval", "tool": tool_name, ...})
if decision.get("decision") == "reject":
    return {"rejected": True, ...}

# 调用方：不要 try/except GraphInterrupt
result = graph.invoke({...}, config)
if result.get("__interrupt__"):
    result = graph.invoke(Command(resume={"decision": "approve"}), config)
```

**必须知道的三个点**：

- **`GraphInterrupt` 不会抛到用户代码**。框架内部消化后把 payload 镜像到 `result["__interrupt__"]`，正常返回。`try: invoke() except GraphInterrupt:` 是**死代码**，审批会被跳过。
- **resume 时节点从开头重新执行**，`interrupt()` 之前的代码会再跑一遍，不能有不可重放的副作用。
- **幂等键解决重复副作用**：resume 可能执行多次，`execute_tool` 必须带幂等键。用**业务语义哈希**（`user_id + tool + args`），因为 `thread_id:message_id` **跨会话失效**——新会话重发同一需求会被重复执行。

**用户拒绝 ≠ 服务故障**：

```python
def route_after_guard(s):
    if s.get("pending_approval"): return "execute"
    if s.get("rejected"):         return "retain"    # 正常收尾
    return "fallback"                                 # 系统异常才兜底
```

### 6. Token 计费：在 `on_llm_end` 里扒 `usage_metadata`

**问题**：不知道每个节点花多少 token，就没法做预算和优化。

**落地**：`BillingHandler(BaseCallbackHandler)` 注入 `config["callbacks"]`，全图 LLM 调用都经过它。

- **节点名用 `metadata.langgraph_node`**（LangGraph 自动注入），`tags[0]` 只是回退。
- **必须把 `cache_creation` / `cache_read` 和 `uncached_input` 拆开统计**——单价差好几倍。
- **摘要调用要显式打 `metadata={"langgraph_node": "retain_summary"}`**，否则聚合落到 `unknown`。

### 7. LangSmith Trace：环境变量必须在 import 前设

**问题**：出问题要能回放"哪个节点、哪次 LLM 调用、耗时多少"。

**落地**：设环境变量，LangGraph 内置 OTel 集成，**每个节点自动发 span**，零侵入。

```python
import os
os.environ["LANGSMITH_OTEL_ENABLED"] = "true"
os.environ["LANGSMITH_TRACING"] = "true"
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://localhost:4317"
os.environ["OTEL_SERVICE_NAME"] = "prod-graph"
# ↑ 必须在 from langgraph... 之前
```

- **与计费对齐**：`BillingHandler` 拿到的 `metadata.langgraph_node` 和 span 节点名一致，**计费记录和 trace 能按节点 join**。

### 8. 多租户命名空间：tenant 走 config，Store 三段式

**问题**：多租户共用部署，数据不能串。

**落地**：`_tenant(config)` 从 `config["configurable"]` 读，Store 命名空间固定 `("anchors", tenant, user_id)`。

- **tenant 级隔离**：命名空间第二段，物理隔离。
- **会话级隔离**：`thread_id` 在 config 里，Checkpointer 按 thread 分桶。
- **坑**：`TENANT_ID = "tenant_acme"` 硬编码会让多租户形同虚设，必须走 config。

### 9. TTL 治理：锚点永久，普通事实过期

**问题**：Store 只增不减，记忆库无限膨胀。

**落地**：Store 的 `PutOp(ttl=...)` 和 `get(refresh_ttl=True)`，**按命名空间分级**。

| 命名空间                       | TTL            | 理由                           |
| ------------------------------ | -------------- | ------------------------------ |
| `("anchors", tenant, user_id)` | 无 / 极长      | 用户要求"永久记住"，过期即失信 |
| `("facts", tenant, user_id)`   | 7 天，读取刷新 | 普通事实会过时，热数据自动续期 |
| 会话级锚点                     | 随 thread 归档 | 生命周期跟对话走               |

- **两层截断别混**：TTL 是**存储层**淘汰（防库膨胀），`MAX_ANCHORS` 是**prompt 层**截断（防 prompt 膨胀）。两层都要有。

---

## 三、一轮请求的完整生命周期

```
用户发消息
  │
  ▼
ingest ─── 检测"合同/签署/永久" → 写 Store(anchors)        【锚点隔离 + 多租户】
  │
  ▼
recall ─── 拉锚点(倒序截断) + 摘要 + 裁剪近期原文
  │        拼成 [stable system] + [dynamic system] + recent  【分层记忆 + prompt cache】
  ▼
router ─── 关键词分流 → next_worker                        【路由】
  │
  ├─ tool ──▶ tool_guard ── interrupt() 挂起 ──▶ 调用方检查 __interrupt__
  │              │                                    │
  │              │                          Command(resume=approve)
  │              ▼                                    │
  │          execute_tool ◀───────────────────────────┘
  │              │  幂等键 = hash(user_id+tool+args)   【HITL + 幂等】
  │              ▼
  ├─ subtask ─▶ subtask_graph（编译子图，内部闭环）    【子任务】
  │              │
  └─ agent ───▶ resilient_agent = retry(pybreaker(model))  【重试 + 熔断】
                 │  失败 → last_error 字段
                 ▼
              条件边 → fallback（熔断/重试耗尽）或 retain
  │
  ▼
retain ─── 扫 msgs[cursor:] 捕获结果锚点 → 写 Store      【锚点隔离】
  │        超过 SUMMARY_TRIGGER → 摘要压缩，留 RAW_WINDOW 【分层记忆】
  │        清空 pending_approval / rejected / last_error
  ▼
END
```

**横切关注点**贯穿全程：

- **Token 计费**：`BillingHandler` 挂在 `config["callbacks"]`，`agent` 和 `retain_summary` 的每次 LLM 调用都被记录，按 `langgraph_node` 聚合。
- **LangSmith Trace**：每个节点自动发 span，与计费按节点名对齐。
- **多租户**：所有 Store 读写经过 `_tenant(config)`，`thread_id` 隔离会话。
- **TTL 治理**：`anchors` 永久，`facts` 7 天，会话锚点随 thread 走。

**一句话总结**：九个技术点不是九个模块，而是**在同一次执行里各管一段的横切能力**——记忆管"给 LLM 看什么"，锚点管"什么不能被忘"，路由管"去哪"，resilience 管"失败怎么办"，HITL 管"高危操作谁批准"，计费/Trace 管"花了多少、卡在哪"，多租户/TTL 管"数据归谁、留多久"。拆开看是九个技术点，合起来是**一条请求从进入到返回的完整治理链路**。

---

## 四、生产替换清单

| 项           | 本地                           | 生产                                                      |
| ------------ | ------------------------------ | --------------------------------------------------------- |
| Checkpointer | `InMemorySaver`                | `AsyncPostgresSaver`，`graph.ainvoke` 异步调用            |
| Store        | `InMemoryStore`                | `AsyncPostgresStore`，与 Saver 共享 `AsyncConnectionPool` |
| 锚点命名空间 | `("anchors", tenant, user_id)` | 同左；**豁免 TTL** 或设极长过期                           |
| 普通事实     | —                              | `PutOp(ttl=timedelta(days=7))`，`get(refresh_ttl=True)`   |
| 幂等键       | 业务语义哈希                   | 落 Redis/DB，`SETNX` 或唯一约束，透传下游                 |
| 熔断         | `pybreaker` 5 次 / 300s        | 按下游 SLA 调参；熔断事件打点上报                         |
| 重试         | tenacity 3 次指数退避          | 仅对瞬时故障重试，避免对 4xx 重试                         |
| Trace        | LangSmith + OTel endpoint      | 补 `OTEL_SERVICE_NAME`；计费字段作为 span attribute       |
| 子图         | 占位 `MessagesState`           | 与父图共享 `messages`；私有状态独立 State                 |
| 递归         | `recursion_limit=25`           | 按图深度设上限，防环                                      |

---

## 五、一页速查

- **`interrupt()` 是暂停并返回，不是抛异常到用户代码**。`GraphInterrupt` 由框架内部处理，`__interrupt__` 才是调用方该看的信号。**不要 `try/except GraphInterrupt` 包 `invoke()`**。
- **`Command(resume=...)` 的值 = `interrupt()` 的返回值**。resume 时节点从**开头重跑**，前面不要有不可重放的副作用。
- **幂等键分两层**：`thread_id:message_id` 管同线程重放；业务语义哈希（`user_id + tool + args`）管**跨会话防重**。只靠前者，新会话会重复执行。
- **用户拒绝走 `retain`，不走 `fallback`**。`fallback` 只给系统故障。
- **resilience 必须接线到节点内部**：LLM 外层包 `with_resilience`，节点内 `try/except` 转 `last_error`，条件边导流 `fallback`。否则熔断时异常冒泡，`fallback` 形同虚设。
- **prompt cache**：稳定前缀（租户、规则）在前，动态内容（锚点、摘要）在后。
- **计费归因**用 `metadata.langgraph_node`；`cache_creation` / `cache_read` / `uncached_input` 必须分开统计。
- **多租户**走 `config["configurable"]["tenant_id"]`，Store 命名空间固定 `("anchors", tenant, user_id)`。
- **TTL 与截断别混**：TTL 防库膨胀（存储层），`MAX_ANCHORS` 防 prompt 膨胀（prompt 层），两层都要。
- **锚点隔离的本质**：额外落 Store + recall 注入，不是从 messages 物理剔除。`messages: []` 删不掉已进入的消息。

---

## 相关笔记

- [[AI大模型/Agent/LangGraph循环直到满足条件|LangGraph 循环直到满足条件（生成-评估-反馈）]] — 图内循环与退出条件
- [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]] — interrupt / Command(resume) 落地
- [[AI大模型/Agent/生产级Agent工程架构蓝图-从Demo到千万级并发|生产级Agent工程架构蓝图（从Demo到千万级并发）]] — 生产级 Agent 架构蓝图
- [[AI大模型/LangChain/LangChain1.0迁移总纲|LangChain 1.0 迁移总纲]] — 1.0 迁移底稿
- [[AI大模型/LangChain/LangChain-MOC|LangChain MOC]] — 返回 LangChain 内容地图
