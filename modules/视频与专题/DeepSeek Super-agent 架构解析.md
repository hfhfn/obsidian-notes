---
title: "DeepSeek Super-agent 架构解析"
tags:
  - video
  - notebooklm
notebook_id: "9211a1f7-4188-4ae7-aac4-b16c179d556d"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "notebooklm"
created: "2026-11-07"
---

# DeepSeek Super-agent 架构解析

> 由 NotebookLM 笔记本导出的产物集合。

## 产物

### 思维导图

<div class="mm-wrap"><div class="mm-root">DeepSeek Super-agent 架构解析</div><ul class="mm-list mm-top"><li><details open><summary>传统 Agent 的局限与痛点</summary><ul class="mm-list"><li><details open><summary>会话模式: 以 Session 为单位</summary><ul class="mm-list"><li class="mm-leaf">核心循环: ReAct Loop</li><li class="mm-leaf">工作方式: 想一步做一步</li></ul></details></li><li><details open><summary>面临的三大核心痛点</summary><ul class="mm-list"><li class="mm-leaf">执行耗时命令时整个循环卡住</li><li class="mm-leaf">多需求塞入同会话导致上下文混乱</li><li class="mm-leaf">本地电脑休眠导致 Agent 罢工</li></ul></details></li></ul></details></li><li><details open><summary>Super-agent 的四大基础特征</summary><ul class="mm-list"><li class="mm-leaf">连续: 跨会话记住上下文并持续推进</li><li class="mm-leaf">高效: 同时推进好几件事</li><li class="mm-leaf">主动: 盯着群消息和工单自主处理</li><li class="mm-leaf">持久: 一直在线并能自动恢复</li></ul></details></li><li><details open><summary>五大核心模块与架构设计</summary><ul class="mm-list"><li><details open><summary>上下层分工 (Router 与 Worker)</summary><ul class="mm-list"><li class="mm-leaf">Router 层: 充当项目经理，用轻量模型</li><li class="mm-leaf">Worker 层: 充当工程师，用最强模型</li></ul></details></li><li><details open><summary>事件驱动与消息过滤机制</summary><ul class="mm-list"><li class="mm-leaf">触发事件: Trigger</li><li class="mm-leaf">快慢路径: Fast Path / Slow Path</li><li class="mm-leaf">两级过滤: 门卫机制与秘书机制</li></ul></details></li><li><details open><summary>任务分配与订阅机制</summary><ul class="mm-list"><li class="mm-leaf">工作单元: Thread (工单/话题)</li><li class="mm-leaf">订阅机制: 后续消息直接送达 Worker</li></ul></details></li><li><details open><summary>上下文管理策略</summary><ul class="mm-list"><li class="mm-leaf">内联: Inline 附带前后聊天</li><li class="mm-leaf">溢出: Spill 只给摘要</li><li class="mm-leaf">链式召回: Chain of Recall 顺编号翻阅</li></ul></details></li><li><details open><summary>主动性与安全边界</summary><ul class="mm-list"><li class="mm-leaf">投机执行: 后台提前备好草稿</li><li class="mm-leaf">观察模式: 默认只记录不执行</li></ul></details></li></ul></details></li><li><details open><summary>通信、部署与高可用优化</summary><ul class="mm-list"><li class="mm-leaf">全双工通信: 异步工具调用</li><li class="mm-leaf">多渠道消息降噪: 控制输出长度与时机</li><li><details open><summary>存算分离与云端部署</summary><ul class="mm-list"><li class="mm-leaf">计算与状态分离: 云端容器与数据库</li><li class="mm-leaf">计算与执行环境分离: BYOM (Bring Your Own Machine)</li></ul></details></li><li class="mm-leaf">高可用保障: Watchdog 巡查机制</li></ul></details></li><li><details open><summary>优劣势对比与开放挑战</summary><ul class="mm-list"><li><details open><summary>性能对比</summary><ul class="mm-list"><li class="mm-leaf">速度提升: 速度快了一倍</li><li class="mm-leaf">Token 消耗: 读缓存 token 增加 2 到 4 倍</li></ul></details></li><li><details open><summary>面临挑战</summary><ul class="mm-list"><li class="mm-leaf">任务规模扩大与长期记忆</li><li class="mm-leaf">人机协作交互界面</li><li class="mm-leaf">多助手隐私配合</li><li class="mm-leaf">安全防范: 提示词注入攻击</li></ul></details></li></ul></details></li></ul></div>

### 信息图

<a href="_assets/DeepSeek Super-agent 架构解析/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/DeepSeek Super-agent 架构解析/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/DeepSeek%20Super-agent%20%E6%9E%B6%E6%9E%84%E8%A7%A3%E6%9E%90/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/DeepSeek%20Super-agent%20%E6%9E%B6%E6%9E%84%E8%A7%A3%E6%9E%90/slide-deck.pdf)</sub>


## 摘要

（在 NotebookLM 里点「摘要」复制正文粘到这里）
