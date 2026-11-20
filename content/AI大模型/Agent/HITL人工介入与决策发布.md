---
title: HITL 人工介入与决策发布（6.9-6.10）
tags:
- Agent
- LangGraph
- HITL
- human-in-the-loop
- EduAgent
created: '2026-09-04T14:09:03+08:00'
modified: '2026-09-04T14:09:03+08:00'
---

# HITL 人工介入与决策发布（6.9–6.10）

> [!note] 本篇是什么
> **第 6 章（试卷批改）的 Human-in-the-Loop（HITL）+ 决策发布**串讲：AI 预批改完成后，如何把人（教师）拉进流程干预，再把最终成绩写库发布。机在动、人把关——对应 LangGraph 的 `interrupt()` / `Command(resume)` / `MemorySaver` 三件套。
>
> 属于：**EduAgent 多 Agent 系列回顾** 之第 6 章拆解。父级总览见 [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]]。

- 配套图①（时序图）：`![[06章-HITL时序图.html]]`
- 配套图②（决策发布连续流）：`![[06章-HITL与决策发布.html]]`

---

## 1. 一句话主线

AI 自动批改（节点 ①–⑤）跑完 → **⑦ `teacher_review_node` 调 `interrupt()` 把图冻结**，State 存进 MemorySaver → 教师用 API 读 AI 预批改 → 教师 `approve` / `modify` 决策 → `Command(resume=decision)` 恢复 → ⑧ 合并出 `final_score` → ⑨ `publish_results` 写库 → END。

**本质**：单个 Agent 自治不够，要在**关键节点引入人工裁决**（成绩这种影响学生的数据不能全交给 LLM）。

---

## 2. interrupt() 内部 5 步（LangGraph 机制）

| 步 | 发生什么 |
| --- | --- |
| ① | 节点里执行到 `interrupt(value)`，LangGraph **抛内部 `Interrupt` 异常** |
| ② | `graph.ainvoke` **捕获它**，把完整 State 按 `thread_id` 存进 `MemorySaver` |
| ③ | `ainvoke` **真正返回**（不是等待——接口不被拖住） |
| ④ | 图进入**暂停态**，State 记着 `next=["teacher_review"]` |
| ⑤ | 后续 `graph.ainvoke(Command(resume=decision), config)` 恢复 State，让 `interrupt()` 返回 `decision`，**图从原处继续** |

> ⚠️ **LangGraph 1.0 新写法**：编译图时**不传** `interrupt_before`，只在节点内调 `interrupt()`。旧写法已被废弃。

---

## 3. 六个关键节点职责（编号与图一致）

| 节点 | 职责 |
| --- | --- |
| ①–⑤ | 自动批改（三轨并行：规则/LLM/代码）—— 见 [[AI大模型/Agent/asyncio协程调度与6.12回调逻辑\|asyncio 协程调度与 6.12 回调逻辑]] |
| ⑥ `notify_teacher_node` | 只把 DB 状态更新为 `pending_review`（通知 → 人工介入） |
| ⑦ `teacher_review_node` | **专职 HITL 暂停**：`interrupt(display_data)`，把 AI 预批改成绩单抛给教师 |
| ⑧ `apply_teacher_decision` | 按 approve / modify 合并 `final_score` |
| ⑨ `publish_results` | **先删后插**写 `exam_reviews` + 更新 `exam_submissions.status='published'` |

---

## 4. 教师侧两个 API（人与图怎么对话）
```text
GET  /submissions/{id}/review   → 教师用 aget_state 读 AI 预批改快照
POST /confirm                    → 教师 approve / modify，传 Command(resume=decision) 回图
```

- 教师读完快照，可**原样确认（approve）**，也可**改命中题目（modify）**后回传。
- `MemorySaver` 按 `thread_id` 存中断点 State —— 这就是「图冻住后，谁都能随时回来续」的机制。

---

## 5. 三个分数（写得清楚）

| 分数 | 含义 | 何时有 |
| --- | --- | --- |
| `ai_score` | AI 打的分数 | **永久保存** |
| `teacher_score` | 教师改的分数 | **仅 modify** 有 |
| `final_score` | 学员最终得分 | = approve 取 `ai_score`；modify 被改题取 `teacher_score`、未改取 `ai_score` |

**写库要点**：`exam_reviews` **先删后插（幂等）**，每道题一行；`exam_submissions` 更新 `status='published'` + `weak_points`。

---

## 章节回顾

- **HITL = interrupt/resume**：机在动、人把关；`interrupt(value)` 冻图 + `Command(resume=decision)` 续跑，State 走 MemorySaver。
- **两图一义**：时序图讲「机制」，决策发布连续流讲「业务全链路」，同一套 interrupt 机制支撑。
- **成绩发布的关键**：AI 分数永久留档、教师修正可溯源、最终分幂等写库——把「人的决策」和「AI 的产出」都存下来。
- **Command 一叉二用**：`Command(resume=...)` 做人工恢复（本 6 章），`Command(goto=...)` 做 Agent 间交接（8 章）——详见 [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]]。

## 相关笔记

- [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]] — 所属系列总览
- [[AI大模型/Agent/asyncio协程调度与6.12回调逻辑|asyncio 协程调度与 6.12 回调逻辑]] — 同章：批改的后台调度 + done 回调
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — Command/interrupt 的框架全貌
- [[AI大模型/Agent/多Agent协作系统面试与架构解析|多Agent协作系统面试与架构解析]] — 面试向的多 Agent 问法