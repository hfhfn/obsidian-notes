---
title: 模型部署-vLLM
tags:
- 面试
- 模型部署
- vLLM
status: 收集
created: '2026-08-31T18:55:40+08:00'
modified: '2026-08-31T18:55:40+08:00'
---

# 🚀 模型部署 · vLLM（能说两句）

> [!abstract] 说明
> 面试官聊模型部署、或问"你模型怎么服务的"时，能报出 **vLLM** 并说清几句，很加分。即使生产是运维在部署，你也可以说"知道他们用 vLLM 起的服务，细节他们负责"。这篇给"能接住展现环节"的口径。

## vLLM 是什么（一句话）
> 一个**高吞吐、省显存**的大模型推理/部署框架，是目前业界部署开源 LLM 最主流的方案之一（LMSYS 起步、开源）。**会被问的薪资点：PagedAttention。**

## 核心卖点（能讲 3-4 条）
1. **PagedAttention 显存优化**：把 KV Cache 按"页"分配，像操作系统虚拟内存分页，**显著提高显存利用率**、支持更大 batch。
2. **Continuous batching（连续批处理）**：来一个请求就动态插入当前 batch，**把服务吞吐打满**（对比传统静态 batching 吞吐大幅提升）。
3. **兼容 OpenAI 接口**：起服务后暴露 `/v1/chat/completions` 这类 **OpenAI 兼容 API**，上层接 OpenRouter/one-api 等很顺，工程上零改动切换。
4. **大模型扩展**：支持**张量并行（Tensor Parallelism）**把超大模型拆到多卡部署；支持多种量化（AWQ/GPTQ/FP8）降显存。

## 部署形态（知道大概即可，细节归运维）
- 典型：**Docker + GPU**，配好模型权重与量化方式，一条命令/编排（K8s/docker compose）拉起；配 **CUDA/FlashAttention** 优化。
- 会伴随：Prefill/decode 分离、调度参数、多卡切分、观测面板。
- 一句话分工：**"我在 应用/Agent 层通过 OpenAI 兼容接口调用，底层是 vLLM 服务化；显存、切卡、压测这些是 SRE 负责，我清楚链路但不越权。"**——既显得懂，又把"具体细节他们负责"说得体面。

## 对比（面试加分一句）
- 同类方案：TensorRT-LLM（NVIDIA）、TGI（HuggingFace）、SGLang（新贵，调度更细）。
- 一句话取舍：**要成熟稳定、生态大 → vLLM；要极致推理延迟/绑 TensorRT → 看业务；要长上下文调度灵活 → 可提 SGLang。**

## 一句话记忆
> vLLM = 主流开源 LLM 部署框架，**PagedAttention 省显存 + Continuous batching 拉吞吐 + OpenAI 兼容接口**；即使不是自己部署，也要能报出"生产用 vLLM 起的服务"。

---

## 相关笔记
- [[工作/面试收集/面试收集-MOC|面试收集 MOC]]
- [[工作/面试收集/20_专题研究/大模型API-选型与成本优化|大模型API-选型与成本优化]]
- [[工作/面试收集/10_项目深挖/Agent系统-项目深挖|Agent系统-项目深挖]]