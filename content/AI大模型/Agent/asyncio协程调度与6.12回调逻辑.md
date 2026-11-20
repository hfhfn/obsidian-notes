---
title: asyncio 协程调度与 6.12 回调逻辑
tags:
- Agent
- Python
- asyncio
- 协程
- EduAgent
created: '2026-09-04T14:09:21+08:00'
modified: '2026-09-04T14:09:21+08:00'
---

# asyncio 协程调度与 6.12 回调逻辑

> [!note] 本篇是什么
> **第 6 章（试卷批改）后台 scheduling + 6.12 回调业务**拆解：上半是 asyncio 七种协程调度方法对比（哪些本项目用到）；下半是 `POST /submit` 后台批改结束时，`add_done_callback` 的 `done` 回调怎么跑、为什么这么写。
>
> 属于：**EduAgent 多 Agent 系列回顾** 之第 6 章异步落地。配套图：`![[06章-asyncio协程调度与回调.html]]`

---

## 1. 七种协程调度方法一览

> 协程对象本身**不会执行**，必须被调度进事件循环。下面这些方法都是「调度器」，区别在**等不等你、怎么收结果**。

| 方法 | 是否等待 | 返回什么 | 本项目用在哪 |
| --- | --- | --- | --- |
| `await coro` | 等（阻塞） | 直接返回值 | 各节点内部顺序调用 |
| **`create_task(coro)`** 🟢 | 不等，立即返回 Task | Task（`.result()` / 回调） | `POST /submit` 起后台批改（fire-and-forget） |
| **`ensure_future(obj)`** 🟢 | 不等 | 协程→Task；已是 Task 原样返回 | 同步回调里包 async 清理（历史习惯） |
| **`gather(*coros)`** 🟢 | 等全部 | 结果列表 | 6.5–6.8 三轨并行（`return_exceptions=True`） |
| `as_completed(...)` | 边等边收 | 谁先完成谁出 | （本项目未用） |
| `wait(...)` | 等 | `(done, pending)` 集合 | 3.11+ 被 TaskGroup 取代 |
| `TaskGroup()` | 等全部 | 结构化并发 | 新写法，出错自动取消兄弟任务 |

> 🟢 = 本项目（EduAgent 第 6 章）实际用到的三种。

**项目用到的三个**：
- **`create_task`** → 后台起批改（不等，立即 202 返回）；
- **`gather`** → 三轨并行批改（等所有轨跑完，`return_exceptions=True` 不因单轨失败崩掉）；
- **`ensure_future`** → 同步回调里调度 async 清理函数。

---

## 2. 6.12 后台批改 + done 回调业务逻辑

时序（`POST /submit` 被调起后）——见顶部嵌入图：

```
POST /submit（学员提交 .docx + exam_id）
  │
① asyncio.create_task(_graph.ainvoke(...))   ← 仅调度排进队，立即返回 Task（协程体未跑）
② _background_tasks.add(task)                ← 强引用：把 Task 抱住，计数≥1 防 GC 回收
③ task.add_done_callback(_on_task_done)      ← 注册回调：跑前就位，task 结束才触发
〓〓〓 同步 setup 段结束（瞬间完成，接口先返回 202）〓〓〓
task 后台跑整张图（事件循环让出控制后开跑 → teacher_review interrupt → 结束）
  │
回调触发 _on_task_done(t)                    ← task 结束后才 fire（收到 task 参数）
  ├── 无论如何: ① discard(t) 放手·计数归0（防内存泄漏）
  │            ② 判断 task_failed
  ├── 若失败:  ensure_future(_cleanup()) → 回滚 DB status='submitted'（允许重提）
  └── 无论成败: 清理临时 .docx（os.remove(tmp_path)）
```

---

## 3. 两个「为什么」（记忆点）

### 为什么 /submit 用 `create_task` 而不是 `gather`？
批改要 **30 秒+**，接口要**立即返回 202**，不能等。`gather` 的语义是「等全部跑完」，用了接口就被拖住；`create_task` 一调度就返回，正好做 **fire-and-forget**（后台跑，接口先走）。

### 为什么 `_on_task_done` 里用 `ensure_future`？
`add_done_callback` 要求回调是**同步**函数，但 `_cleanup` 里有 **async DB 操作**，同步里不能 `await`——用 `ensure_future(_cleanup())` 把它调度成**新后台任务**。这里换成 `create_task` 也等价，`ensure_future` 是历史习惯。

### 回调双职责
1. **释放引用**：从 `_background_tasks` `discard(t)`，防内存泄漏；
2. **失败兜底**：回滚 DB 状态允许重提，无论成败都清理临时文件。

> 💡 记忆口诀：**`create_task` 不等、`gather` 等齐、`ensure_future` 多面手；`add` 进集合防回收、`discard` 掉防泄漏。**

---

## 章节回顾

- **调度器三选**：`create_task`（后台不想等）、`gather`（并行等齐）、`ensure_future`（同步包 async）。
- **后台批改用 Task 三连**：`create_task` 起任务 → `_background_tasks.add` 强引用防 GC → `add_done_callback` 注册收尾回调。
- **回调是同步函数**，要跑 async 清理就 `ensure_future` 再调度一层。
- 批改跑完后进 **HITL**（教师裁决）——见 [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]]。

## 相关笔记

- [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]] — 同章：批改完成后的人工介入 + 发布
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — LangGraph 图内编排的框架底座
- [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]] — 所属系列总览