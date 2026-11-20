---
title: LangChain MOC
tags:
- MOC
- 索引
- LangChain
created: '2026-11-14T23:35:37+08:00'
modified: '2026-11-14T23:35:37+08:00'
---

# 🔗 LangChain MOC

> [!abstract] 说明
> LangChain 生态（1.0 迁移 / Agent / RAG 组件）的**内容地图**。新写的 LangChain 相关笔记记得回来补一个链接。

---

## 🎓 教学 / 学习路径

- [[AI大模型/LangChain/LangChain1.0-课堂讲义|LangChain 1.0 课堂讲义]] — ⭐ **入门首选**：3 课时课堂讲义，面向有 Python 基础、首次接触 LangChain 的学生（学习目标 / 精简代码 / 练习 / 自测题）

## 🚚 1.0 迁移

- [[AI大模型/LangChain/LangChain1.0迁移总纲|LangChain 1.0 迁移总纲]] — ⭐ **枢纽**：包结构重组 + llm/embedding/prompt/agent/memory/indexes 各组件「旧 → 新」系统对照 + 速查总表
- [[AI大模型/LangChain/LangChain1.0-RAG+Agent综合示例|LangChain 1.0 RAG+Agent 综合示例]] — 配套综合示例（RAG+Agent Demo，每段代码前注明迁移说明）

## 🧠 Agent / 循环工程

- [[AI大模型/Agent/LangChain-Loop-Engineering四层架构|LangChain Loop Engineering 四层架构]] — 工具/验证/事件驱动/爬坡四层循环
- [[AI大模型/Agent/循环工程的艺术（LangChain Loop Engineering 原文）|循环工程的艺术（LangChain Loop Engineering 原文）]] — 四层循环原文（create_agent / RubricMiddleware / Engine）
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]] — AgentExecutor / create_agent / LangGraph 三种建 Agent 对比
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — LangGraph `create_supervisor` / Swarm 落地
- [[AI大模型/LangChain/LangChain-LangGraph-Agent开发笔记|LangChain / LangGraph Agent 开发笔记]] — `create_react_agent` → `create_agent` 迁移、原生工具调用、中间件、状态图与流式输出问答整理
- [[AI大模型/LangChain/生产环境全链路 LangGraph Agent · 完整笔记|生产环境全链路 LangGraph Agent]] — 🏭 分层记忆 / 锚点隔离 / 路由子任务 / 重试熔断 / HITL / Token 计费 / Trace / 多租户 / TTL

---

## 📚 相关目录

- [[AI大模型/AI大模型-MOC|🤖 AI 大模型 MOC]] — 上级内容地图
- [[AI大模型/Agent/Agent演进全过程-Loop工程到Graph工程|Agent 演进全过程]]
- [[AI大模型/rag/RAG系统核心技术与实现|RAG系统核心技术与实现]] — RAG 系统级实现

| 笔记 | 修改时间 |
|---|---|
| [[AI大模型/LangChain/生产环境全链路 LangGraph Agent · 完整笔记\|生产环境全链路 LangGraph Agent]] | 2026-11-14 |
| [[AI大模型/LangChain/LangChain-LangGraph-Agent开发笔记\|LangChain / LangGraph Agent 开发笔记]] | 2026-11-14 |
| [[AI大模型/LangChain/LangChain1.0迁移总纲\|LangChain 1.0 迁移总纲]] | 2026-11-06 |
| [[AI大模型/LangChain/LangChain1.0-课堂讲义\|LangChain 1.0 课堂讲义]] | 2026-11-05 |
| [[AI大模型/LangChain/LangChain1.0-RAG+Agent综合示例\|LangChain 1.0 RAG+Agent 综合示例]] | 2026-10-02 |