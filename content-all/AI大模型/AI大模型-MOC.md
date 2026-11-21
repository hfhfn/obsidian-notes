---
title: AI 大模型 MOC
tags:
- MOC
- 索引
created: '2026-11-17T05:47:08+08:00'
modified: '2026-11-17T05:47:08+08:00'
---

# 🤖 AI 大模型 MOC

> [!abstract] 说明
> AI 大模型领域的**内容地图**。按主题分区，dataview 自动汇总各目录笔记。新写的笔记记得回到这里补一个链接。

---

## 🔗 RAG 检索增强生成

### 知识摄入 · 文档解析
- [[AI大模型/rag/文档解析工具选型思路|文档解析工具选型思路]] — ⭐ 解析工具三流派 + anydoc 确定性选型

### 核心原理
- [[AI大模型/rag/RAG检索策略全面解析|RAG检索策略全面解析]] — 检索策略总览
- [[AI大模型/rag/Milvus向量数据库架构与向量检索原理解析|Milvus向量数据库架构与向量检索原理解析]] — HNSW/IVF/PQ 原理 + Milvus 存算分离架构（含 3.0 演进） ⭐
- [[AI大模型/rag/Milvus 完整学习笔记|Milvus 完整学习笔记]] — 动态字段/索引/实体操作/混合检索/Reranker 全链路速查手册
- [[AI大模型/rag/RAG系统核心技术与实现|RAG系统核心技术与实现]] — 系统级实现
- [[AI大模型/rag/RAG评估框架|RAG评估框架]] — 检索/生成质量评估
- [[AI大模型/rag/RAGAS评估数据准备与指标详解|RAGAS 评估数据准备与指标详解]] — RAGAS 数据准备 + 4 指标计算 ✅
- [[AI大模型/rag/家装公司问答系统|家装公司问答系统]] — 实践案例
- [[AI大模型/面试题/RAG面试/RAG系统里面最难搞定的是哪个部分|RAG系统里面最难搞定的是哪个部分]] — 面试视角
- [[AI大模型/rag/干了2年大模型开发居然只会换Embedding|干了2年大模型开发居然只会换Embedding]] — 三路混合检索 + 检索失效诊断（面试复盘）
- [[AI大模型/rag/RAG 企业级架构实战：从事故到生产级防御|RAG 企业级架构实战：从事故到生产级防御]] — 🛡️ 事故复盘 + RAG 四大死穴 + 企业级三层防御（含面试问答附录）
- [[AI大模型/rag/生产级 RAG 实现笔记：分层架构、全局索引与有界循环|生产级 RAG 实现笔记：分层架构、全局索引与有界循环]] — 🧭 全局索引三范式（GraphRAG/LightRAG/RAPTOR）+ Self-RAG/IRCoT 有界循环 + LangGraph 完整实现
- [[AI大模型/rag/Agentic RAG-检索决策权交给模型|Agentic RAG：把检索决策权交给模型]] — RAG 三代演进（Naive → Advanced → Agentic）+ 五种 Agentic 模式 + 分层路由/安全防护

### LLM-Wiki 知识编译
- [[AI大模型/rag/LLM-Wiki-文档构建原理与知识库实现|LLM-Wiki 文档构建原理与知识库实现]] — ⭐ 「编译一次，持续复用」：摄入去重 → 概念提取 → 页面生成 → index.md → 图谱，三种检索模式对比
- [[AI大模型/rag/LLM-Wiki风格RAG-引用溯源|LLM-Wiki 风格 RAG + 引用溯源（LangChain 1.0）]] — LangChain 1.0 落地：Document + BM25Retriever + with_structured_output 强制返回 cited_ids
- [[AI大模型/rag/企业知识库选型-RAG vs LLM Wiki vs Ontology|企业知识库选型：RAG vs LLM Wiki vs Ontology]] — 三者非替代而是分工：检索依据 / 知识沉淀 / 业务对象映射 + 选型方法论

### 分块策略
- [[AI大模型/rag/分块策略/RAG中的分块策略|RAG 中的分块策略]] — ⭐ 分块策略全景（演进脉络 + 选型）
- [[AI大模型/rag/分块策略/语义分块与延迟分块详解|语义分块与延迟分块详解]] — 语义分块 / 延迟分块深度
- [[AI大模型/rag/分块策略/RAG中 分块(chunk)和重叠(overlap) 大小怎么定|RAG中 分块(chunk)和重叠(overlap) 大小怎么定]] — 大小与重叠取值

### 混合检索 & 重排
- [[AI大模型/rag/混合检索/BM25与倒排索引笔记|BM25与倒排索引笔记]] — 稀疏检索原理
- [[AI大模型/rag/混合检索/向量数据库与稀疏检索学习笔记|向量数据库与稀疏检索学习笔记]] — 向量库选型 + SPLADE/ColBERT + BM25 在 Qdrant/Milvus/ES 的实现差异
- [[AI大模型/rag/混合检索/Milvus 混合检索与稀疏向量完全指南|Milvus 混合检索与稀疏向量完全指南]] — Milvus 实践
- [[AI大模型/rag/混合检索/混合检索排序方式 RRF|混合检索排序方式 RRF]] — RRF 融合
- [[AI大模型/rag/ColBERT深度解析|ColBERT深度解析]] — Token 级精排模型
- [[AI大模型/rag/Cross Encoder（交叉编码器）|Cross Encoder（交叉编码器）]] — 精排模型
- [[AI大模型/rag/检索精确率和召回率直观展示|检索精确率和召回率直观展示（交互工具）]] — 交互工具：精确率/召回率阈值直觉
- [[AI大模型/rag/RAG检索可靠性系统设计|RAG检索可靠性系统设计]] — 查询改写→混合检索→重排序→事实校验 全链路管控
- [[AI大模型/rag/MultiQueryRAG-图文笔记|知识库高效召回：从 Multi-Query 到 Hybrid + Reranker]] — ⭐ 知识库高效召回演进：Multi-Query → FAISS → Hybrid(BM25+向量) → BGE Reranker → 来源页码（含企业级架构与代码）
- [[AI大模型/rag/对比学习与套娃表征（RAG检索训练）|对比学习与套娃表征（RAG检索训练）]] — 对比学习/套娃表征(MRL)/PQ 三分工 + 检索训练代码

| 笔记 | 修改时间 |
|---|---|
| [[AI大模型/rag/企业知识库选型-RAG vs LLM Wiki vs Ontology\|企业知识库选型：RAG vs LLM Wiki vs Ontology]] | 2026-11-17 |
| [[AI大模型/rag/LLM-Wiki风格RAG-引用溯源\|LLM-Wiki 风格 RAG + 引用溯源（LangChain 1.0）]] | 2026-11-17 |
| [[AI大模型/rag/LLM-Wiki-文档构建原理与知识库实现\|LLM-Wiki 文档构建原理与知识库实现]] | 2026-11-17 |
| [[AI大模型/rag/Agentic RAG-检索决策权交给模型\|Agentic RAG：把检索决策权交给模型]] | 2026-11-17 |
| [[AI大模型/rag/生产级 RAG 实现笔记：分层架构、全局索引与有界循环\|生产级 RAG 实现笔记：分层架构、全局索引与有界循环]] | 2026-11-14 |
| [[AI大模型/rag/混合检索/向量数据库与稀疏检索学习笔记\|向量数据库与稀疏检索学习笔记]] | 2026-10-17 |
| [[AI大模型/rag/Milvus 完整学习笔记\|Milvus 完整学习笔记]] | 2026-10-17 |
| [[AI大模型/rag/MultiQueryRAG-图文笔记\|知识库高效召回：从 Multi-Query 到 Hybrid + Reranker]] | 2026-09-27 |
| [[AI大模型/rag/对比学习与套娃表征（RAG检索训练）\|对比学习与套娃表征（RAG检索训练）]] | 2026-09-13 |
| [[AI大模型/rag/Milvus向量数据库架构与向量检索原理解析\|Milvus向量数据库架构与向量检索原理解析]] | 2026-09-01 |
| [[AI大模型/rag/RAG检索可靠性系统设计\|RAG检索可靠性系统设计]] | 2026-09-01 |
| [[AI大模型/rag/干了2年大模型开发居然只会换Embedding\|干了2年大模型开发居然只会换Embedding]] | 2026-09-01 |
| [[AI大模型/rag/RAG 企业级架构实战：从事故到生产级防御\|RAG 企业级架构实战：从事故到生产级防御]] | 2026-08-30 |
| [[AI大模型/rag/文档解析工具选型思路\|文档解析工具选型思路]] | 2026-08-16 |
| [[AI大模型/rag/RAGAS评估数据准备与指标详解\|RAGAS 评估数据准备与指标详解]] | 2026-08-06 |
| [[AI大模型/rag/RAG评估框架\|RAG评估框架]] | 2026-08-06 |
| [[AI大模型/rag/检索精确率和召回率直观展示\|检索精确率和召回率直观展示（交互工具）]] | 2026-08-05 |
| [[AI大模型/rag/分块策略/RAG中的分块策略\|RAG 中的分块策略]] | 2026-08-05 |
| [[AI大模型/rag/分块策略/语义分块与延迟分块详解\|语义分块与延迟分块详解]] | 2026-08-05 |
| [[AI大模型/rag/分块策略/RAG中 分块(chunk)和重叠(overlap) 大小怎么定\|RAG中 分块(chunk)和重叠(overlap) 大小怎么定]] | 2026-08-05 |
| [[AI大模型/rag/混合检索/Milvus 混合检索与稀疏向量完全指南\|Milvus 混合检索与稀疏向量完全指南]] | 2026-05-26 |
| [[AI大模型/rag/混合检索/BM25与倒排索引笔记\|BM25与倒排索引笔记]] | 2026-05-26 |
| [[AI大模型/rag/混合检索/混合检索排序方式 RRF\|混合检索排序方式 RRF]] | 2026-05-23 |
| [[AI大模型/rag/Cross Encoder（交叉编码器）\|Cross Encoder（交叉编码器）]] | 2026-05-23 |
| [[AI大模型/rag/RAG检索策略全面解析\|RAG检索策略全面解析]] | 2026-05-04 |
| [[AI大模型/rag/ColBERT深度解析\|ColBERT深度解析]] | 2026-05-04 |
| [[AI大模型/rag/家装公司问答系统\|家装公司问答系统]] | 2026-01-29 |
| [[AI大模型/rag/RAG系统核心技术与实现\|RAG系统核心技术与实现]] | 2025-10-20 |

---

## 🧠 大语言模型基础

- [[AI大模型/大语言模型学习/ChatGPT本质与未来展望解析|ChatGPT本质与未来展望解析]]
- [[AI大模型/大语言模型学习/关于transformer架构和世界模型以及多模态、概率模型的一些思考|关于transformer架构和世界模型以及多模态、概率模型的一些思考]]
- [[AI大模型/大语言模型学习/LLM与Transformer底层原理与架构演进总纲|LLM 与 Transformer 底层原理与架构演进总纲]] — Transformer 原理 + LLM 演进总纲（2 PDF + 2 图解整合）
- [[AI大模型/大语言模型学习/transformer架构和自注意力机制|transformer架构和自注意力机制]] — Transformer 架构详解
- [[AI大模型/大语言模型学习/大语言模型简史/大语言模型简史2025|大语言模型简史2025]] — 从 Transformer 到 DeepSeek-R1
- [[AI大模型/大语言模型学习/分析大模型架构进展(从GPT1-DeepseekR1)|分析大模型架构进展(从GPT1-DeepseekR1)]] — 架构演进全景
- [[AI大模型/大语言模型学习/DeepSeek-V4 四项核心优化（交互图解）|DeepSeek-V4 四项核心优化（交互图解）]] — CSA/HCA 长上下文 + mHC/Muon 训练稳定性（可交互）
- [[AI大模型/大语言模型学习/大模型技术发展与演进|大模型技术发展与演进]] — Transformer/Decoder/并行计算深度问答

### 大模型技术点
- [[AI大模型/大语言模型学习/大模型技术点/RMSNorm_vs_LayerNorm|RMSNorm_vs_LayerNorm]]
- [[AI大模型/大语言模型学习/大模型技术点/从seq2seq到attention|从seq2seq到attention]]
- [[AI大模型/大语言模型学习/大模型技术点/三种seq2seq结构(seq2seq演变)|三种 seq2seq 结构（seq2seq 演变）]] — 无注意力 / Bahdanau / Luong 结构对比（含交互图解）
- [[AI大模型/大语言模型学习/大模型技术点/归一化与相似度等价关系|归一化与相似度等价关系]]
- [[AI大模型/大语言模型学习/大模型技术点/何恺明ResNet(微软)-姚顺雨React(腾讯)-姚顺宇(google)|何恺明ResNet(微软)-姚顺雨React(腾讯)-姚顺宇(google)]]
- [[AI大模型/大语言模型学习/大模型技术点/RoPE旋转位置编码|RoPE 旋转位置编码]] — 用旋转把绝对位置变成相对距离：正交矩阵推导 + 分块对角 + 频率表 + 长上下文外推
- [[AI大模型/大语言模型学习/大模型技术点/04注意力机制（下）：多头、KVcache与FlashAttention|04 注意力机制（下）：多头、KVcache 与 FlashAttention]] — 多头能力从哪来 + 两张账单（KV cache/GQA 省带宽、FlashAttention 改数据通路）+ 面试易错点
- [[AI大模型/大语言模型学习/大模型技术点/MQA GQA MLA-KV Cache瘦身三剑客|MQA / GQA / MLA：KV Cache 瘦身三剑客]] — KV Cache 字节公式 + MHA→MQA→GQA→MLA 连续谱系（含 Qwen3.8 27B 实算，576 vs 32000）⭐

### 交互式进化树
- [[AI大模型/大语言模型学习/大模型进化树|大模型架构进化树（交互工具）]] — 2017-2025 架构进化树（可交互）
- [[AI大模型/大语言模型学习/大模型发展脉络(canvas版)|大模型发展脉络（交互工具）]] — 视觉/语言/多模态画布
- [[AI大模型/大语言模型学习/bert/bert模型家族进化树|BERT 模型家族进化树（交互工具）]] — BERT 家族演进

### 多模态学习
- [[AI大模型/多模态学习/Clip和SigLip革新多模态学习|Clip和SigLip革新多模态学习]] — CLIP / SigLIP
- [[AI大模型/多模态学习/VI-transformer图像分类|VI-transformer图像分类]] — ViT 图像分类
- [[AI大模型/多模态学习/扩散模型和GAN模型|扩散模型和GAN模型]] — 生成模型
- [[AI大模型/大语言模型学习/多模态模型进化树|多模态模型进化树]] — 多模态架构演进

| 笔记 | 修改时间 |
|---|---|
| [[AI大模型/大语言模型学习/大模型技术点/MQA GQA MLA-KV Cache瘦身三剑客\|MQA / GQA / MLA：KV Cache 瘦身三剑客]] | 2026-11-17 |
| [[AI大模型/大语言模型学习/大模型技术点/04注意力机制（下）：多头、KVcache与FlashAttention\|04 注意力机制（下）：多头、KVcache 与 FlashAttention]] | 2026-11-15 |
| [[AI大模型/大语言模型学习/大模型技术点/RoPE旋转位置编码\|RoPE 旋转位置编码]] | 2026-11-14 |
| [[AI大模型/大语言模型学习/大模型技术点/三种seq2seq结构(seq2seq演变)\|三种 seq2seq 结构（seq2seq 演变）]] | 2026-10-30 |
| [[AI大模型/大语言模型学习/大模型技术点/从seq2seq到attention\|从seq2seq到attention]] | 2026-10-30 |
| [[AI大模型/大语言模型学习/DeepSeek-V4 四项核心优化（交互图解）\|DeepSeek-V4 四项核心优化（交互图解）]] | 2026-10-17 |
| [[AI大模型/大语言模型学习/LLM算法演进\|LLM算法演进]] | 2026-08-30 |
| [[AI大模型/大语言模型学习/LLM与Transformer底层原理与架构演进总纲\|LLM 与 Transformer 底层原理与架构演进总纲]] | 2026-08-30 |
| [[AI大模型/大语言模型学习/LLM_Architecture_Evolution\|LLM_Architecture_Evolution]] | 2026-08-30 |
| [[AI大模型/大语言模型学习/LLM_First_Principles\|LLM_First_Principles]] | 2026-08-30 |
| [[AI大模型/大语言模型学习/bert/bert模型家族进化树\|BERT 模型家族进化树（交互工具）]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/大模型进化树\|大模型架构进化树（交互工具）]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/大模型发展脉络(canvas版)\|大模型发展脉络（交互工具）]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/大语言模型简史/大语言模型简史2025（PDF版）\|大语言模型简史2025（PDF版）]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/多模态模型进化树\|多模态模型进化树]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/大模型技术发展与演进\|大模型技术发展与演进]] | 2026-08-05 |
| [[AI大模型/多模态学习/VI-transformer图像分类\|VI-transformer图像分类]] | 2026-08-05 |
| [[AI大模型/多模态学习/Clip和SigLip革新多模态学习\|Clip和SigLip革新多模态学习]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/分析大模型架构进展(从GPT1-DeepseekR1)\|分析大模型架构进展(从GPT1-DeepseekR1)]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/大语言模型简史/大语言模型简史2025\|大语言模型简史2025]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/bert/Bert重新定义语言理解模型\|Bert重新定义语言理解模型]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/RLHF的强大之处-GPT3到ChatGPT\|RLHF的强大之处-GPT3到ChatGPT]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/transformer架构和自注意力机制\|transformer架构和自注意力机制]] | 2026-08-05 |
| [[AI大模型/多模态学习/扩散模型和GAN模型\|扩散模型和GAN模型]] | 2026-08-05 |
| [[AI大模型/大语言模型学习/大模型技术点/何恺明ResNet(微软)-姚顺雨React(腾讯)-姚顺宇(google)\|何恺明ResNet(微软)-姚顺雨React(腾讯)-姚顺宇(google)]] | 2026-05-19 |
| [[AI大模型/大语言模型学习/大模型技术点/归一化与相似度等价关系\|归一化与相似度等价关系]] | 2026-05-16 |
| [[AI大模型/大语言模型学习/大模型技术点/RMSNorm_vs_LayerNorm\|RMSNorm_vs_LayerNorm]] | 2026-05-16 |
| [[AI大模型/大语言模型学习/关于transformer架构和世界模型以及多模态、概率模型的一些思考\|关于transformer架构和世界模型以及多模态、概率模型的一些思考]] | 2026-04-08 |
| [[AI大模型/多模态学习/AlexNet技术创新\|AlexNet技术创新]] | 2026-01-01 |
| [[AI大模型/大语言模型学习/ChatGPT本质与未来展望解析\|ChatGPT本质与未来展望解析]] | 2025-10-02 |

---

## 🏋️ 训练 · 微调 · 推理

### 训练 & 微调
- [[AI大模型/大模型训练&微调&推理/深度学习优化器核心笔记|深度学习优化器核心笔记]] — 反向传播 → EWMA/偏差修正 → Adagrad/RMSprop/Momentum/Adam/AdamW 演进
- [[AI大模型/大模型训练&微调&推理/RLHF训练性能波动深度解析|RLHF训练性能波动深度解析]]
- [[AI大模型/大模型训练&微调&推理/模型微调/智能诊疗机器人训练|智能诊疗机器人训练]]
- [[AI大模型/大模型训练&微调&推理/模型微调/高效微调LoRA,Adapter,Prefix-tuning,P-tuning等作用范围|高效微调LoRA,Adapter,Prefix-tuning,P-tuning等作用范围]]
- [[AI大模型/大模型训练&微调&推理/模型微调/P-Tuning Overview and Key Features Explained|P-Tuning Overview and Key Features Explained]] — P-Tuning 详解
- [[AI大模型/大模型训练&微调&推理/大模型训练推理框架对比|大模型训练推理框架对比]]
- [[AI大模型/大模型训练&微调&推理/大模型微调与灾难性遗忘-LoRA解析|大模型微调与灾难性遗忘——LoRA解析]] — 全量微调遗忘机制 + LoRA 缓解原理 + EWC 变体（面试）
- [[AI大模型/大模型训练&微调&推理/大模型训练注意力崩塌怎么办|大模型训练注意力崩塌怎么办]] — 注意力熵暴跌 / 头趋同，QK-Norm 三件套解
- [[AI大模型/大模型训练&微调&推理/DeepSeek-MLA满秩高熵应对|DeepSeek-MLA满秩高熵应对]] — 为何高维训练再压低秩（MLA）+ KV 缓存压缩，水果比喻闭环 ⭐
- [[AI大模型/大模型训练&微调&推理/大模型微调OOM-生产防线笔记|大模型微调OOM-生产防线笔记]] — OOM→显存/分布式/超参/数据四防线 + 生产级防御体系（面试案例）
- [[AI大模型/大模型训练&微调&推理/模型微调/Qwen2.5 LoRA微调四框架对比|Qwen2.5 LoRA / QLoRA 微调四框架对比]] — Transformers+PEFT+TRL / Unsloth / LLaMA-Factory / Axolotl 四套 LoRA+QLoRA 实现 + 动态加载 vs merge 导出

### 推理部署
- [[AI大模型/大模型训练&微调&推理/模型推理/LLM推理优化完整知识梳理|LLM推理优化完整知识梳理]]
- [[AI大模型/大模型训练&微调&推理/模型推理/vLLM_推理部署框架详解|vLLM_推理部署框架详解]]
- [[AI大模型/大模型训练&微调&推理/模型推理/llama_cpp_笔记|llama_cpp_笔记]]
- [[AI大模型/大模型训练&微调&推理/模型推理/Transformer注意力机制与推理优化全栈|Transformer注意力机制与推理优化全栈]] — 注意力数学 → 推理优化全栈（含 Canvas 图）
- [[AI大模型/大模型训练&微调&推理/模型推理/8GB显存运行27B模型部署优化指南|8GB显存运行27B模型部署优化指南]] — 低显存量化部署实战（IQ4_XS + 三大支柱）

| 笔记 | 修改时间 |
|---|---|
| [[AI大模型/大模型训练&微调&推理/模型微调/Qwen2.5 LoRA微调四框架对比\|Qwen2.5 LoRA / QLoRA 微调四框架对比]] | 2026-11-17 |
| [[AI大模型/大模型训练&微调&推理/深度学习优化器核心笔记\|深度学习优化器核心笔记]] | 2026-10-17 |
| [[AI大模型/大模型训练&微调&推理/大模型微调OOM-生产防线笔记\|大模型微调OOM-生产防线笔记]] | 2026-09-17 |
| [[AI大模型/大模型训练&微调&推理/DeepSeek-MLA满秩高熵应对\|DeepSeek-MLA满秩高熵应对]] | 2026-09-14 |
| [[AI大模型/大模型训练&微调&推理/大模型训练注意力崩塌怎么办\|大模型训练注意力崩塌怎么办]] | 2026-09-01 |
| [[AI大模型/大模型训练&微调&推理/大模型微调与灾难性遗忘-LoRA解析\|大模型微调与灾难性遗忘——LoRA解析]] | 2026-09-01 |
| [[AI大模型/大模型训练&微调&推理/模型推理/8GB显存运行27B模型部署优化指南\|8GB显存运行27B模型部署优化指南]] | 2026-08-30 |
| [[AI大模型/大模型训练&微调&推理/模型推理/Transformer注意力机制与推理优化全栈\|Transformer注意力机制与推理优化全栈]] | 2026-08-30 |
| [[AI大模型/大模型训练&微调&推理/模型微调/P-Tuning Overview and Key Features Explained\|P-Tuning Overview and Key Features Explained]] | 2026-08-05 |
| [[AI大模型/大模型训练&微调&推理/模型微调/高效微调LoRA,Adapter,Prefix-tuning,P-tuning等作用范围\|高效微调LoRA,Adapter,Prefix-tuning,P-tuning等作用范围]] | 2026-08-05 |
| [[AI大模型/大模型训练&微调&推理/RLHF训练性能波动深度解析\|RLHF训练性能波动深度解析]] | 2026-05-31 |
| [[AI大模型/大模型训练&微调&推理/模型推理/llama_cpp_笔记\|llama_cpp_笔记]] | 2026-05-19 |
| [[AI大模型/大模型训练&微调&推理/模型推理/LLM推理优化完整知识梳理\|LLM推理优化完整知识梳理]] | 2026-05-19 |
| [[AI大模型/大模型训练&微调&推理/大模型训练推理框架对比\|大模型训练推理框架对比]] | 2026-05-04 |
| [[AI大模型/大模型训练&微调&推理/模型推理/vLLM_推理部署框架详解\|vLLM_推理部署框架详解]] | 2026-04-02 |
| [[AI大模型/大模型训练&微调&推理/模型微调/智能诊疗机器人训练\|智能诊疗机器人训练]] | 2026-03-22 |

---

## 🤝 Agent & MCP

### Agent 模式与架构
- [[AI大模型/Agent/Agent演进全过程-Loop工程到Graph工程|Agent 演进全过程：从 Tool Use 到 Multi-Agent，从 Loop 工程到 Graph 工程]] — 🧭 **枢纽**：五模式演进 + Workflow→ReAct→Graph + 动态Graph(Send/LLMCompiler) + 反思/HITL，全模式配图
- [[AI大模型/Agent/五种 Agent 模式详解|五种 Agent 模式详解]]
- [[AI大模型/Agent/在Agent中落地ReAct模式（Reasoning + Acting）|在Agent中落地ReAct模式（Reasoning + Acting）]] — ReAct 闭环 / 状态机
- [[AI大模型/Agent/生产级Agent工程架构蓝图-从Demo到千万级并发|生产级Agent工程架构蓝图（从Demo到千万级并发）]] — 🏭 六层架构 / 状态机闭环 / 记忆分级 / 工具防弹衣 / 高并发（2 PDF 图解整合）
- [[AI大模型/Agent/Agent结构化输出与工具调用_FC_ToolUse_MCP_Pydantic|Agent 结构化输出与工具调用（Function Calling / Tool Use / MCP / 校验）]] — Function Calling / Tool Use / MCP / Pydantic 校验（结构化 JSON 输出全栈）
- [[AI大模型/Agent/Anthropic-Agent产品设计新范式|Anthropic-Agent产品设计新范式]] — 少拆 SubAgent / Harness 把关工具 / 上下文分层（Commerce Agents 七条设计）
- [[AI大模型/Agent/12种Agent Harness设计模式|12种 Agent Harness 设计模式]] — Harness 12 种模式四大类（记忆/工作流/工具/自动化）
- [[AI大模型/Agent/Harness-五要素图文笔记|Harness 五要素面试题（字节）· 精读笔记]] — ⭐ 字节面试题：Harness 五要素（Context/Tools/Guardrails/Evaluation/Recovery）+ Claude Code 工程落地 + 逐字稿
- [[AI大模型/Agent/Claude Code 架构深度拆解：从一个 AI 编程工具到完整的 Agent Runtime 框架|Claude Code 架构深度拆解]] — 生产级 Agent Runtime 源码审计（ReAct/四级压缩/七层恢复/多Agent）
- [[AI大模型/Agent/看完这条-你对AI的理解碾压90的人|看完这条：AI 七层全貌]] — Token→Prompt→Context→Agent→Harness→MCP→Skills
- [[AI大模型/Agent/Agent基础丨大厂面试|Agent 基础丨大厂面试（九大能力板块）]] — Agent 9 大基础板块（Agent/Workflow/ToolCalling/Memory/Planning/Reflection/HITL/Fallback/权限审计）

### 架构选型与协作
- [[AI大模型/Agent/多Agent协作方式全景与A2A-综合笔记|多Agent协作方式全景与A2A-综合笔记]] — 🧭 **08章 EduAgent 综合笔记**：四标尺定位图（嵌入全景图）+ 七种协作范式 + A2A/MCP 对比 + AI-Coding 主流结论（枢纽）
- [[AI大模型/Agent/多Agent协作范式七种与A2A协议|多Agent协作范式七种与A2A协议]] — 七种协作范式逐个拆解 + A2A 协议代码（Agent Card / JSON-RPC / a2a-sdk）+ 业界生态（概念侧）
- [[AI大模型/Agent/DeepSeek-a2a_sdk与MCP关系|A2A SDK 与 MCP 的关系]] — A2A（智能体协作）vs MCP（智能体调工具）互补 + python-a2a 工具转换
- [[AI大模型/Agent/多Agent编排-LangGraph原生Supervisor与Swarm实现|多Agent编排-LangGraph原生Supervisor与Swarm实现]] — LangGraph `create_supervisor` / 子图 / Command / Swarm 落地同一套业务（实现侧）
- [[AI大模型/Agent/HITL人工介入与决策发布|HITL 人工介入与决策发布（6.9-6.10）]] — 第6章 HITL：interrupt / Command(resume) / MemorySaver + 三分数发布
- [[AI大模型/Agent/asyncio协程调度与6.12回调逻辑|asyncio 协程调度与 6.12 回调逻辑]] — 第6章 asyncio 七种调度 + 后台批改 done 回调
- [[AI大模型/Agent/Agent主流架构对比与选型|Agent主流架构对比与选型]] — 7 种主流架构演进线 + 选型建议（AI Coding 推 Route+Skill）
- [[AI大模型/Agent/Jev-给Agent的快速决策引擎|Jev：给 Agent 的快速决策引擎]] — No/Yes · Choice · Score 三原语 + 概率校准（RLCD）+ Agent 中间层定位
- [[AI大模型/Agent/Agent八大主流架构解析|Agent 八大主流架构解析]] — 8 大架构设计思路图文速览
- [[AI大模型/Agent/什么时候该拆多Agent|什么时候该拆多Agent]] — 上下文/并行/权限三约束 + 瓶颈驱动拆分
- [[AI大模型/Agent/Super-agent 设计探索：迈向更自主的 Agent 系统|Super-agent 设计探索：迈向更自主的 Agent 系统]] — 跨会话连续实体：双层架构 / 事件驱动 / 存算分离 / Watchdog，把 OS 经典工程思想搬进 Agent
- [[AI大模型/Agent/多Agent协作系统面试与架构解析|多Agent协作系统面试与架构解析]] — 四大深层问题 + 三层应对架构（面试复盘）
- [[AI大模型/Agent/LangChain-Loop-Engineering四层架构|LangChain Loop Engineering 四层架构]] — 工具/验证/事件驱动/爬坡四层循环
- [[AI大模型/Agent/循环工程的艺术（LangChain Loop Engineering 原文）|循环工程的艺术（LangChain Loop Engineering 原文）]] — 四层循环原文章（含 LangChain 原语：create_agent / RubricMiddleware / Engine）
- [[AI大模型/Agent/Agent Loop 核心结构与工程实践|Agent Loop 核心结构与工程实践]] — minimal_loop 起步 → 工具报错/轮数预算/重复检测/用户取消 → 对标 reference_loop.py 与 pi-agent-core 事件总线

### 稳定性与安全约束
- [[AI大模型/Agent/Agent Hook-智能体指令约束技术指南|Agent Hook-智能体指令约束技术指南（100%稳定与安全）]] — Agent Hook 强制约束 / 四大齿轮 / Claude Code vs Codex / 只读盾牌（PDF+图解整合）
- [[AI大模型/Agent/AI Agent沙箱-CubeSandbox与DeepSeekHarness|AI Agent 沙箱与执行隔离]] — CubeSandbox MicroVM 云沙箱 + DeepSeek-Harness 进程沙箱对比（执行隔离谱系）
- [[AI大模型/Agent/L3-18-06 沙箱隔离：让Agent的危险操作套上防护罩|L3-18-06 沙箱隔离]] — 容器/WASM/进程隔离三种沙箱 + 目录挂载/网络白名单/资源上限最小权限实战

### 工程落地与框架
- [[AI大模型/Agent/LangGraph循环直到满足条件|LangGraph 循环直到满足条件（生成-评估-反馈）]] — 生成-评估反馈循环 / 现成 API
- [[AI大模型/Agent/AI智能体消息通道分层设计|AI智能体消息通道分层设计]]
- [[AI大模型/Agent/美团智能问答拆解|美团智能问答拆解]]
- [[AI大模型/Agent/大模型Agent记忆写入机制设计|大模型 Agent 记忆写入机制设计]] — 旁路小模型预审 + 图/向量混合存储 + 反思遗忘
- [[AI大模型/Agent/Agent Memory-Basic Memory-智能体长期记忆系统完整指南|Agent Memory-Basic Memory-智能体长期记忆系统完整指南]] — Agent 记忆体系全览 + Basic Memory 跨 Agent 长期记忆落地（Codex/Claude Code/Hermes 统一记忆库）⭐
- [[AI大模型/Agent/Agent跨会话长期记忆-五问架构|Agent 跨会话长期记忆：五问架构]] — 三类记忆（短/长/工作）+ 三条写入路径 + 检索组合拳 + 分层压缩 + 遗忘验证（面试五问）
- [[AI大模型/Agent/自动会议纪要Agent设计|自动会议纪要Agent设计]] — 系统级 Agent 设计思维（高频面试题）
- [[AI大模型/Agent/AI 电商客服 Agent 从0到1 实现思路|AI 电商客服 Agent 从0到1 实现思路]] — 场景收窄 / 规则与模型边界 / 评测集与 bad_case 闭环（从 0 到生产）
- [[AI大模型/Agent/Agent长任务怎么管控|Agent 长任务管控方法论]] — 三层能力（规划/记忆/锚点）+ 五道关卡，长任务跑偏失控的架构解法
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]] — create_tool_calling_agent 必须配 AgentExecutor / create_agent / LangGraph 三种建 Agent 对比
- [[AI大模型/Agent/DeepSeek-Function-Calling返回JSON|Function Calling 机制与返回JSON]] — Function Calling 返回的 JSON 是指令非结果 / OpenAI vs MCP 两种执行方式
- [[AI大模型/Agent/DeepSeek-await异步方法详解|asyncio await并发与FastAPI并发模型]] — await / to_thread / 进程池 / FastAPI async vs sync 端点并发模型
- [[AI大模型/Agent/DeepSeek-协程线程对比|协程 vs 线程对比（含Python并发选型）]] — 线程(OS调度) vs 协程(用户调度) + Python GIL 并发选型 + 主/子进程
- [[AI大模型/Agent/Agent工具调用准确率明显下降怎么办？（工具从10个到100个）|Agent 工具调用准确率下降]] — 10→100 工具：信噪比/决策空间根因 + 检索预筛/描述治理/动态挂载 + 评测闭环
- [[AI大模型/Agent/OpenAI 和 Anthropic 协议哪个更好用？|OpenAI vs Anthropic 协议对比]] — 消息组装 / 思考流式 / Token 缓存 / 跨协议切换

### MCP 传输
- [[AI大模型/mcp/Streamable HTTP 对比 SSE|Streamable HTTP 对比 SSE]] — MCP 传输协议
- [[AI大模型/Skills/【万字长文】Claude Skills完全指南：从概念到实战|【万字长文】Claude Skills完全指南：从概念到实战]]
- [[AI大模型/mcp/DeepSeek-MCP-stdio模式解析|MCP stdio 模式解析]] — stdio 是传输层 / JSON-RPC 是协议层 / 为何 Server 是子进程
- [[AI大模型/mcp/DeepSeek-MCP与FastMCP区别|MCP官方SDK 与 FastMCP 区别]] — 官方 mcp SDK vs FastMCP 封装 / import 路径演变 / @mcp.tool 推断
- [[AI大模型/mcp/DeepSeek-MCP传输协议对比|MCP传输协议对比 SSE 与 Streamable HTTP]] — SSE（双通道常驻）vs Streamable HTTP（统一端点按需）
- [[AI大模型/mcp/DeepSeek-MCP接入代码示例|MCP接入代码示例与LangChain集成]] — FastMCP + langchain-mcp-adapters 全链路 + 三种 transport 配置表

---

## 🔗 LangChain 1.0

> [!note] 子地图
> 完整索引见 [[AI大模型/LangChain/LangChain-MOC|LangChain MOC]]。

- [[AI大模型/LangChain/LangChain1.0迁移总纲|LangChain 1.0 迁移总纲]] — ⭐ **枢纽**：包结构重组 + llm/embedding/prompt/agent/memory/indexes 各组件「旧 → 新」系统对照 + 速查总表
- [[AI大模型/LangChain/LangChain1.0-RAG+Agent综合示例|LangChain 1.0 RAG+Agent 综合示例]] — 配套 RAG+Agent 综合示例（每段代码前注明迁移说明）
- [[AI大模型/LangChain/LangChain-LangGraph-Agent开发笔记|LangChain / LangGraph Agent 开发笔记]] — create_agent 迁移 / 中间件 / 状态图 / 上下文 / 流式输出问答整理
- [[AI大模型/LangChain/生产环境全链路 LangGraph Agent · 完整笔记|生产环境全链路 LangGraph Agent]] — 分层记忆 / 锚点 / 路由子图 / 熔断 / HITL / 计费 / Trace / 多租户 / TTL 九点全链路

| 笔记 | 修改时间 |
|---|---|
| [[AI大模型/LangChain/生产环境全链路 LangGraph Agent · 完整笔记\|生产环境全链路 LangGraph Agent]] | 2026-11-14 |
| [[AI大模型/LangChain/LangChain-LangGraph-Agent开发笔记\|LangChain / LangGraph Agent 开发笔记]] | 2026-11-14 |
| [[AI大模型/LangChain/LangChain1.0迁移总纲\|LangChain 1.0 迁移总纲]] | 2026-11-06 |
| [[AI大模型/LangChain/LangChain1.0-课堂讲义\|LangChain 1.0 课堂讲义]] | 2026-11-05 |
| [[AI大模型/LangChain/LangChain1.0-RAG+Agent综合示例\|LangChain 1.0 RAG+Agent 综合示例]] | 2026-10-02 |

---

## 🧩 本体 & 知识图谱

- [[AI大模型/本体与知识图谱/本体 Ontology 全景（概念·标准·构建·落地）|本体 Ontology 全景（概念·标准·构建·落地）]] — 🧭 **枢纽**：本体本质/判断标准 + TBox-ABox-数据总线三层架构 + 5 种 LLM 构建方法 + Palantir 落地范本（4 篇同主题整合）
- [[AI大模型/本体与知识图谱/本体论落地实践-从数据中台到智能中台|本体论落地实践：从数据中台到智能中台]] — 语义层 7+1 + 工具层 MCP + 记忆层 + Harness + 11 步归因（EP1+EP2 整合）⭐
- [[AI大模型/本体与知识图谱/Palantir企业AI架构深度拆解|Palantir 企业 AI 架构深度拆解（Foundry · Ontology · AIP）]] — Object Type 四步建模 + Action Type 五步配置 + OAG vs RAG + 中国落地 8 步（2 份 PDF 整合）
- [[AI大模型/本体与知识图谱/本体建模自检清单|本体建模自检清单]] — 定边界/抽实体/定类型/建层级/抽关系/验证 六步自查 + 立项四条标准
- [[AI大模型/本体与知识图谱/AIP Evolve医院案例-AI推理成本优化|AIP Evolve 医院案例：AI 推理成本优化]] — 推理成本降 70%、调用降 84%：三个成本旋钮 + 三层 Evals 护栏
- [[AI大模型/本体与知识图谱/AI数据价值重估-Trace-Eval-Governance|AI 数据价值重估：Trace · Eval · Governance]] — Trace / Eval / Governance + 五类复利资产 + 90 天落地

| 笔记 | 修改时间 |
|---|---|
| [[AI大模型/本体与知识图谱/AI数据价值重估-Trace-Eval-Governance\|AI 数据价值重估：Trace · Eval · Governance]] | 2026-10-21 |
| [[AI大模型/本体与知识图谱/本体 Ontology 全景（概念·标准·构建·落地）\|本体 Ontology 全景（概念·标准·构建·落地）]] | 2026-10-21 |
| [[AI大模型/本体与知识图谱/AIP Evolve医院案例-AI推理成本优化\|AIP Evolve 医院案例：AI 推理成本优化]] | 2026-10-21 |
| [[AI大模型/本体与知识图谱/本体论落地实践-从数据中台到智能中台\|本体论落地实践：从数据中台到智能中台]] | 2026-10-21 |
| [[AI大模型/本体与知识图谱/本体建模自检清单\|本体建模自检清单]] | 2026-10-21 |
| [[AI大模型/本体与知识图谱/Palantir企业AI架构深度拆解\|Palantir 企业 AI 架构深度拆解（Foundry · Ontology · AIP）]] | 2026-10-21 |

---

## 💻 AI Coding

- [[AI大模型/AI-Coding/Claude Code安装常用MCP命令|Claude Code安装常用MCP命令]]
- [[AI大模型/AI-Coding/claude code相关命令&插件&设置|claude code相关命令&插件&设置]]
- [[应用&工具笔记/Claude-HUD状态栏恢复指南|Claude HUD 状态栏恢复指南]] — 安装/恢复/排错（含 cc-switch 持久化）
- [[AI大模型/AI-Coding/openclaw常用命令|openclaw常用命令]]

---

## 🎯 面试题

### Agent 面试
- [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-带答案|大模型面试题-Agent-2026版-带答案]]
- [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-精简|大模型面试题-Agent-2026版-精简]]
- [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版|大模型面试题-Agent-2026版]]
- [[AI大模型/面试题/Agent面试/DeepSeek Agent 三面面经-16题设计追问|DeepSeek Agent 三面面经：16 题设计追问]] — 架构/幻觉/记忆/多Agent/数据闭环/评测/RAG 全链路设计追问 ⭐
- [[AI大模型/Agent/第13集｜三分钟带你搞懂：鹅厂Agent面试题——为什么选择手搓Agent而不用LangChain？|第13集：手搓Agent vs LangChain 面试题]] — 过程掌控/上下文工程/交互调度三大优势 + 开源项目佐证
- [[AI大模型/面试题/Agent面试/Agent面试第4期：这19道把我问懵了（58-76题）|Agent 面试第 4 期（58-76 题）]] — 13 题带答案整理版：记忆隔离/长对话/上下文/幻觉/安全/多 Agent/工作流可靠性/评估；6 题截图缺失待补

### LLM 面试
- [[AI大模型/面试题/LLM面试题及答案/0-大模型（LLMs）面试问题|0-大模型（LLMs）面试问题]]
- [[AI大模型/面试题/LLM面试题及答案/1-基础知识篇|1-基础知识篇]]
- [[AI大模型/面试题/LLM面试题及答案/2-进阶面试题1|2-进阶面试题1]]
- [[AI大模型/面试题/LLM面试题及答案/3-进阶面试题2|3-进阶面试题2]]
- [[AI大模型/面试题/LLM面试题及答案/4-微调面试题|4-微调面试题]]

### Transformer 面试
- [[AI大模型/面试题/Transformer面试题及答案/0-Transformer面试问题|0-Transformer面试问题]]
- [[AI大模型/面试题/Transformer面试题及答案/1-基础原理与数学模型|1-基础原理与数学模型]]
- [[AI大模型/面试题/Transformer面试题及答案/2-训练与优化1|2-训练与优化1]]
- [[AI大模型/面试题/Transformer面试题及答案/3-训练与优化2|3-训练与优化2]]
- [[AI大模型/面试题/Transformer面试题及答案/4-应用与实践+技术深入(1-13)|4-应用与实践+技术深入(1-13)]]
- [[AI大模型/面试题/Transformer面试题及答案/5-技术深入(14-25)+性能优化|5-技术深入(14-25)+性能优化]]
- [[AI大模型/面试题/Transformer面试题及答案/6-特定应用|6-特定应用]]

---

## 🗺️ 全栈技术全景

- [[AI大模型/现代AI全栈技术全景图|现代AI全栈技术全景图]] — 访问 → 客户端 → API → 应用服务 → AI 应用 → 模型 → 数据 → 基础设施/运维 → 安全 全栈技术地图（含海报原图）

---

## 🔄 相关入口

- [[index|🏠 返回首页]]
- [[AI大模型/2026后端转型AI大模型开发|转型路线图]]
