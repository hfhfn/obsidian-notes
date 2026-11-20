---
title: LangGraph 循环直到满足条件（生成-评估-反馈）
tags:
- LangGraph
- Agent
- 循环控制
status: 已消化
created: '2026-10-02T17:40:50+08:00'
modified: '2026-10-02T17:40:50+08:00'
---

# LangGraph 循环直到满足条件

> 摘录自一次 DeepSeek 对话（原 HTML：`00_附件/HTML源码/LangChain/langgraph-chat-export-2026-08-28.html`）。
> 核心问题：如何在 LangGraph 里实现 **「不满足条件就反复执行，直到好了为止」**。

## TL;DR

「循环直到满足」在 LangGraph 里的本质 = **生成 → 评估 → 不通过带反馈重跑去，直到通过或达到次数上限**。有天然更省事的现成 API 时优先用，不必手搓。

| 做法 | 适用场景 | 复杂度 |
|:---|:---|:---|
| 手动「生成-评估」双向循环图 | 内容质量检查（通用） | 中 |
| `create_react_agent` | 工具调用循环（Agent） | 低 |
| `create_reflection_graph` | 「生成→批评→改进」反思流程 | 低（但需遵循其状态约束） |

---

## 1. 手动实现：生成-评估-反馈循环图

核心是三步：**状态（State）+ 生成节点 + 评估节点 + 条件边（路由）**。

- **State**：至少三个字段追踪循环——
  - `draft`：当前生成的内容
  - `retry_count`：已重试次数
  - `feedback`：评估节点给出的改进建议（回传给生成节点）
- **Generator 节点**：执行核心任务（如调 LLM），把 `feedback` 作为上下文改进输出。
- **Evaluator 节点**：对 `draft` 做质量检查，更新 `retry_count`，写入 `quality_passed`（bool）和 `feedback`（文本）。
- **条件边（路由）**（循环关键）：
  - `quality_passed == True` → 走向 **END**
  - `quality_passed == False` 且 `retry_count < 上限` → 回到 **Generator**（形成循环）
  - `retry_count ≥ 上限` → 走向 **END**（标记失败 / 返回默认结果）

> [!note] 关键点
> 用**条件边**（`add_conditional_edges`）而不是硬编码边，才可持续对同一对节点回环。

## 2. 复用 `create_react_agent`

`create_react_agent` 本身就是一个为循环执行设计的封装，但它侧重**工具调用循环（Tool-Calling Loop）**——「思考→行动→观察」——直到不再需要调工具。**不适合做内容质量检查循环**。流程：

- **Agent 节点**：推理后决定直接给答案还是调用工具。
- **工具节点**：执行对应工具。
- **条件边**：还有工具调用 → 回「工具节点」；否则 → END。

## 3. 现成反思 API：`create_reflection_graph`

LangGraph 提供现成高级 API，封装「生成 → 批评 → 改进」反思模式。虽不如 `create_react_agent` 有独立仓库和广泛教程，但功能契合「不满足就重写」。

**状态自定义与限制**：
- 要求 State **至少包含 `messages` 字段**（依赖它传递对话历史并驱动循环）。
- API 内部会**强制新增 `remaining_steps` 字段**来防死循环；因此你传入的状态 Schema **不能已存在 `remaining_steps`**，否则报错。
- 通过 `state_schema` 传入自定义 State 类即可加自己的字段；最直接的方式是**继承 `MessagesState`** 再扩建 `draft` / `quality_passed` / `feedback` 等。

```python
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

class GenState(TypedDict):
    draft: str
    retry_count: int
    feedback: str
    quality_passed: bool

def generator(state): ...   # 读 state["feedback"] 改进输出
def evaluator(state): ...  # 检查质量，写 quality_passed / feedback / retry_count
def route(state):          # 条件边路由
    if state["quality_passed"]:
        return END
    if state["retry_count"] >= MAX:
        return END          # 达上限兜底
    return "generator"      # 回环

g = StateGraph(GenState)
g.add_node("generator", generator)
g.add_node("evaluator", evaluator)
g.set_entry_point("generator")
g.add_edge("generator", "evaluator")
g.add_conditional_edges("evaluator", route, {"generator", END})
```

---

## 小结

「不满足就一直执行」的通用套路：**手动搭建生成-评估循环**，大多数内容质量场景可覆盖；若是工具调用，直接用 `create_react_agent`；若是「生成→批评→改进」，`create_reflection_graph` 更省事。别在需要工具循环时重写手搓循环，也别为了手搓而屏蔽现成 API。

---

## 相关笔记

- [[AI大模型/Agent/五种 Agent 模式详解|五种 Agent 模式详解]] — Agent 架构模式总览
- [[AI大模型/Agent/在Agent中落地ReAct模式（Reasoning + Acting）|在Agent中落地ReAct模式（Reasoning + Acting）]] — ReAct：思考-行动-观察
- [[AI大模型/Agent/AI智能体消息通道分层设计|AI智能体消息通道分层设计]] — Agent 通信设计