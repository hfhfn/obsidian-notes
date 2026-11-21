---
title: Agent Loop 核心结构与工程实践
tags:
- AI大模型
- Agent
- Agent-Loop
- 工程化
source: 从 minimal_loop.py 到 Anthropic reference_loop.py / pi-agent-core
status: 已消化
created: '2026-11-17T05:46:45+08:00'
modified: '2026-11-17T05:46:45+08:00'
---

# Agent Loop 核心结构与工程实践

多步任务里，每次都是「模型决策 → 程序执行 → 结果带回 → 再次决策」的循环在驱动。本文从零搭建最简 Agent Loop，覆盖工具报错、轮数预算、重复检测、用户取消等运行时问题，并对照 Anthropic `reference_loop.py`（约 282 行）与 `pi-agent-core` 事件总线设计，落地到垂类数据分析的业务规则。

---

## 一、Agent Loop 的基本结构

**单次调用**：输入 → 模型回复 → 结束。  
把「回复」这个位置展开，就是 Loop：

1. **模型只提出调用，不动手**：响应中可能包含工具调用请求。
2. **程序执行工具**：真正打开文件、查询数据的是程序，不是模型。
3. **结果回传，进入下一轮**：把工具结果追加到消息历史，再带着更新后的 messages 请求模型。
4. **退出条件**：只要响应中没有工具调用，就返回文字，退出循环。

---

## 二、最小代码解析（`minimal_loop.py`）

```python
def minimal_loop(task, model, execute):
    # 初始化消息历史：system 提示 + user 任务
    messages = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": task}]

    while True:
        # 请求模型，传入当前历史与可用工具定义
        message = model.chat(messages, tools=REPORT_TOOLS)
        # 保存完整响应（工具调用本身也要留在历史里）
        messages.append(message)

        # 唯一出口：没有工具调用 → 返回最终文字
        if not message.get("tool_calls"):
            return message["content"]

        # 逐个处理本轮的工具调用
        for call in message["tool_calls"]:
            name = call["function"]["name"]
            args = json.loads(call["function"]["arguments"])
            # 交给 execute 函数执行具体工具逻辑
            result = execute(name, args)
            # 追加 tool 角色消息，tool_call_id 对应模型那次调用
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, ensure_ascii=False)
            })
```

| 行数 | 关键点 |
|------|--------|
| 第 15 行 | 初始化 `messages`，含 system 说明和用户任务 |
| 第 16 行 | `while True`，暂不限制轮数 |
| 第 17 行 | 传入当前消息历史和可用工具定义请求模型 |
| 第 18 行 | 先保存模型完整响应，因为下一次请求时工具调用记录也需保留在历史中 |
| 第 19–20 行 | 无 `tool_calls` 是唯一正常出口，程序认为可以结束了 |
| 第 21–24 行 | 逐条取出工具名和 JSON 参数，由 `execute()` 找到对应工具并执行 |
| 第 25–26 行 | 追加 `role="tool"` 消息，`tool_call_id` 用于绑定模型那次调用；for 循环处理完一批工具后回到 `while` 开头 |

---

## 三、异常处理

### 工具报错与信息缺失

**工具报错（如超时）**
- 短暂网络问题可在工具内做有限次数的重试。
- 重试仍失败，要**明确回传错误**，让模型知道这次没查到数据，从而换查询条件或告知用户。
- ⚠️ 最容易出的错：把失败当成空结果返回——模型看到"无记录"会按无此业务继续计算，后续结论全错。

**信息缺失（如文件未上传 / 记录冲突需确认）**
- 可提供一个 `ask_user` 工具，让模型说明缺什么信息。
- 程序识别到该调用后：
  - 保存当前进度；
  - 将任务标记为 `pending`；
  - 等待用户补充后再恢复。

> 注意：有 `ask_user` 工具不等于程序会自动等待，宿主循环需主动处理 `needs_input` 状态。

---

## 四、停止条件与任务状态分离

### 停止步骤①：轮数预算
- `max_turns` 默认 25 次（Anthropic 官方）。
- 次数用尽返回 `budget_exhausted`。
- 局限：只限制请求次数；若某次请求或工具一直卡住，还需依赖超时与取消机制。

### 停止步骤②：重复检测
- 检测到相同工具 + 相同参数 + 相同结果连续出现（如第三次 `list_files`），程序 append 一条反馈要求模型换动作。
- 第四次仍一样 → 返回 `no_progress`。
- 次数可按业务调整；重复不一定是错（例如轮询待完成任务需多次查询），要结合工具用途判断。

### 停止原因 ≠ 任务是否完成

| 停止原因 | 含义 |
|----------|------|
| `budget_exhausted` | 轮数额度用完 |
| `no_progress` | 动作持续重复，无进展 |
| `completed` | 任务正常交付 |

循环因非正常原因退出时（如预算用完、无进展），不能直接标 `completed`。需要单独核查：报表有没有生成、金额有没有核对，并向用户展示已完成部分与缺失项。

**Trace 日志**：记录每次调用的参数、结果、程序给模型的反馈，是排查问题的关键。

---

## 五、用户取消与进程退出

**用户点击停止**
- **后续调度关闭**：不再发起新的模型请求与工具调用。
- **当前操作传递取消信号**：正在执行的远端查询、文件写入、数据库驱动等需能响应取消。
- 取消 ≠ 撤销：已写完的文件不会自动恢复，远端仍在运行的查询可能需要另外的接口取消。

**进程直接退出（Ctrl+C）**
- Demo 中 `messages` 仅保存在内存里，重启后丢失上下文。
- 要支持恢复，需把消息历史与执行进度持久化到进程外（如数据库/文件）。
- 重新运行时要知道：哪些工具已经执行过，避免重复写入。

---

## 六、对标 Anthropic `reference_loop.py`（282 行）

### ① 主循环同构
```python
# loop.py 第 238 行
for turn in range(1, self.budget.max_turns + 1):
    response = self.client.messages.create(...)
```
执行顺序与我们最小代码一致：请求模型 → 存响应 → 有工具调用则执行 → 回传结果。官方开局就带有轮数上限。

### ② 写门禁（Fail-closed）
```python
# loop.py 第 123 行
if unguarded and approve is None:
    # a missing gate must not mean every write runs
```
只要注册的工具中有标注为"会修改外部数据"的工具，且未提供 `approve` 回调，程序直接报错、不创建 Agent。这是一种 **fail-closed** 策略：门禁默认关着，缺配置就不放行写操作。真正执行写工具时还会再调用 `approve` 判断，放行规则可由人工确认或权限逻辑实现。

### ③ 停止原因分两层
```python
@dataclass
class Result:
    text: str
    stop: str   # answered | verify_failed | turn_budget | token_budget | refusal | max_tokens
    turns: int
```
六种退出原因一目了然，便于上层应用按情况处理。

**Verify 校验回调**：检查模型准备交付的最终结果；未配置则跳过。若校验未通过，程序会把问题追加到消息历史让模型再跑一次，但最多给一次修复机会（`complaints > 1` 时强制返回 `verify_failed`），防止无限循环修改。

---

## 七、pi-agent-core：事件总线视角

沿循环顺时针走一圈，每一步都有对应的事件发出，上层应用订阅后即可驱动 UI 更新与日志记录。

| 阶段 | 事件 |
|------|------|
| 整个任务开始 | `agent_start` |
| 开始一轮 | `turn_start`（携带当前消息历史） |
| 模型开始生成 | `message_start` |
| 模型流式输出中 | `message_update`（界面据此实时更新显示） |
| 模型生成结束 | `message_end` |
| 程序执行工具 | `tool_execution_start` |
| 工具报告进度 | `tool_execution_update` |
| 工具执行结束 | `tool_execution_end` |
| 工具结果作为消息加入历史 | `message_start` / `message_end` |
| 本轮收尾 | `turn_end` |

> 工具中途才会产生 `update` 事件；日志可完整记录工具开始、进度与结果。

**一轮完整流程**：`turn_end` → `turn_start` → 带工具结果继续判断。走完完整的一圈，后续不再继续运行时才发出 `agent_end`。

### 接入钩子

| 钩子 | 位置 | 作用 |
|------|------|------|
| `transform_context` | 请求模型之前 | 上下文的压缩、注入业务规则 |
| `before_tool_call` | 工具执行前 | 门禁检查权限，拦住未授权的写操作 |
| `after_tool_call` | 工具执行后 | 审计日志，可检查或调整结果 |
| `finish_turn` | 本轮收尾决策 | 看本轮消息和工具结果，决定继续还是结束 |
| `steer` | 轮次之间 | 用户中途补一句别的要求，排队在下一次模型请求时带上 |
| `followup` | 任务自然收尾时 | 有新的后续任务，等待当前任务结束后接着处理 |
| `abort` | 运行中断 | 用户点了停止，随时可以请求取消 |

---

## 八、垂直场景：数据分析 Agent 的实践取舍

### 工具墙 vs 窄接口
以数据分析 agent 为例：
- 需求只是查数和分析 → 只给查表结构、执行只读查询、采样几行这类工具
- **不给写扩删表**；数据库账号也只给查询权限
- 工具数量不追求多，先把高频分析任务覆盖好；哪些确实需要再按实际任务加

通用 agent = 一面工具墙；数据分析 agent = **只给"查数"一类**的刀。

### 千万行不塞进上下文
- 工具返回多少数据？模型决定查什么，工具负责把查询做出来并**限制返回行数**
- 若被截断，要明确告知模型——否则程序每次返回前 100 行、模型却以为这是全部，分析从输入这一步就错了
- 关键原则：**聚合下推到数据库**，而非拉明细到上下文

示例：`dept_sales` 1008 万行 → 塞进上下文=爆；在 loop 外面替模型把「读什么」先想好，这一步决定它查得准，还是在几万行里迷路。

### 校验、门禁与停止的具体规则

- **校验·回到业务**：时间对不对？金额单位有没有混？汇总数能否按同一口径跟来源核对？
- **量级突变要停**：昨天 100 万 → 今天 1 亿，可能是业务真实增长，也可能是单位拿错或关联查询导致重复计算，程序先标异常，再决定是否补查或交给人确认
- **门禁·原始数据只读**：确需写回结果，单独设计写入工具并设授权规则；**fail-closed，宁可不动**，带上已查到部分结果问人
- **停止·比通用更紧**：
  - 同一查询同一错误连续出现 → 设上限（如 3 次）
  - 费用预算：查一次扫多少数据、模型请求花多少 token 都计入成本，预算到即停

这些规则来自具体业务；写完再决定在循环哪些位置接入检查。

---

## 九、速查表

### 终止状态
| 状态 | 含义 |
|------|------|
| `answered` | 正常回答完毕 |
| `verify_failed` | 校验未通过，且超过允许修复次数 |
| `turn_budget` | 轮数额度用完（默认 max_turns = 25） |
| `token_budget` | Token 额度用完 |
| `refusal` | 模型拒绝回答 |
| `max_tokens` | 输出达到最大 token 限制 |
| `budget_exhausted` | 预算（自定义）用尽 |
| `no_progress` | 动作持续重复，无进展 |
| `completed` | 任务正常交付 |

### pi-agent-core 事件触发时机
- `tool_execution_update`：仅在工具中途报告进度时产生
- `message_update`：模型流式输出时，供界面实时更新
- `turn_start`：携带当前消息历史

### 典型 Hook 接入点
| Hook | 触发时机 |
|------|----------|
| `transform_context` | 每次请求模型之前 |
| `before_tool_call` | 工具执行前 |
| `after_tool_call` | 工具执行后 |
| `finish_turn` | 每轮结束后决策 |
| `steer` | 用户中途插入新指令 |
| `followup` | 队列中的后续任务 |
| `abort` | 任意时刻取消请求 |

---

## 十、核心金句

1. **模型只提出调用，不动手**；真正执行工具的是程序，结果是程序决定如何处理失败、如何限制范围、何时告诉模型"不够"。
2. **失败 ≠ 空结果**：工具报错必须明确回传错误，不能让模型误以为"无数据"并据此得出结论。
3. **停止原因 ≠ 任务完成**：`budget_exhausted`、`no_progress` 等异常退出后，仍需核查已产出内容并向用户展示缺口。
4. **fail-closed**：门禁默认关着，缺配置就不放行写操作；宁可不动，也不盲写。
5. **垂类 agent 的取舍**：给窄接口、限行数、压聚合到数据库，而不是堆工具墙和塞上下文。

---

## 相关笔记

- [[AI大模型/Agent/Agent演进全过程-Loop工程到Graph工程|Agent 演进全过程：从 Tool Use 到 Multi-Agent，从 Loop 工程到 Graph 工程]] — Loop → Graph 演进枢纽
- [[AI大模型/Agent/LangChain-Loop-Engineering四层架构|LangChain Loop Engineering 四层架构]] — 工具/验证/事件驱动/爬坡四层循环
- [[AI大模型/Agent/循环工程的艺术（LangChain Loop Engineering 原文）|循环工程的艺术（LangChain Loop Engineering 原文）]] — 原文与 LangChain 原语
- [[AI大模型/Agent/Claude Code 架构深度拆解：从一个 AI 编程工具到完整的 Agent Runtime 框架|Claude Code 架构深度拆解：从一个 AI 编程工具到完整的 Agent Runtime 框架]] — 生产级 loop 实现
- [[AI大模型/Agent/Agent长任务怎么管控|Agent 长任务管控方法论]] — 停止条件与轮数预算
