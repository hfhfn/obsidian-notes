---
title: "DeepSeek Super-agent 架构解析"
tags:
  - video
  - notebooklm
notebook_id: "9211a1f7-4188-4ae7-aac4-b16c179d556d"
source_url: "https://www.youtube.com/watch?v=qX7msY_RYWY"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "youtube"
created: "2026-11-07"
mindmap-plugin: markmap
---

# DeepSeek Super-agent 架构解析

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/qX7msY_RYWY" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

[在源站打开](https://www.youtube.com/watch?v=qX7msY_RYWY)

## 产物

### 思维导图

> 🖥 [用浏览器打开完整脑图](_assets/DeepSeek%20Super-agent%20架构解析/mindmap.html)（可拖动、折叠、全屏）

[查看原始数据](_assets/DeepSeek%20Super-agent%20架构解析/mind-map.json)

### 信息图

![信息图](_assets/DeepSeek%20Super-agent%20架构解析/infographic.webp)

### 演示文稿

[打开 演示文稿（PDF）](https://pdf.hfhfn.dpdns.org/notebooklm/DeepSeek%20Super-agent%20%E6%9E%B6%E6%9E%84%E8%A7%A3%E6%9E%90/slide-deck.pdf)

## 摘要

DeepSeek 推出了一种创新的 Super-agent 架构，旨在克服传统单会话 AI 
工具的局限性。通过将职责拆分为负责管理的 Router 层和负责执行的 Worker 
层，该系统的运作方式更像是一个协同作战的项目团队，而非受限的助手。它能够在聊天
应用和代码仓库等不同平台之间实现持续的多任务处理与操作，而不会受到会话限制的束
缚。该框架融合了事件驱动触发、智能消息过滤以及云端分离等先进策略，使 agent 
能够保持持久在线并快速响应。尽管它显著提升了运行速度与稳定性，但也消耗了更多的 
token，并引发了关于隐私和安全的重要关切。
