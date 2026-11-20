---
title: BERT 模型家族进化树（交互工具）
tags:
- BERT
- 预训练模型
- 交互工具
- HTML
created: '2026-08-05T10:41:04+08:00'
modified: '2026-08-05T10:41:04+08:00'
---

# BERT 模型家族进化树（交互工具）

> [!tip] 这是一个**交互式 HTML 进化树**，展示 BERT 家族的演进脉络。

[打开交互图](/attachments/html/bert%E6%A8%A1%E5%9E%8B%E5%AE%B6%E6%97%8F%E8%BF%9B%E5%8C%96%E6%A0%91.htm)

---

## 工具内容

从预训练语言模型到领域专用优化的**完整演进历程**，按 5 条技术线组织：

- **基础架构**：BERT → RoBERTa
- **训练优化**：MLM → ELECTRA 的 RTD → DeBERTa V3 混合训练
- **效率提升**：DistilBERT（蒸馏）、ALBERT（参数共享）
- **注意力机制**：标准注意力 → DeBERTa 解耦注意力 → Longformer 稀疏注意力
- **领域适配**：BioBERT、mBERT 等

## 关键洞察

- **训练效率优化**是持续主线：从标准 MLM 到 RTD，不断降低训练成本
- **模型压缩**：蒸馏 + 参数共享在保持性能的同时大幅减小模型

## 相关

- [[AI大模型/大语言模型学习/bert/Bert重新定义语言理解模型|BERT 详解]]
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]]