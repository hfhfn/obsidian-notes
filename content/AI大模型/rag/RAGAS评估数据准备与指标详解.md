---
title: RAGAS 评估数据准备与指标详解
tags:
- RAG
- RAGAS
- 评估指标
- AI
source: DeepSeek Chat Export
date: 2026-08-06
status: 已消化
created: '2026-08-06T10:44:15+08:00'
modified: '2026-08-06T10:44:15+08:00'
---

# RAGAS 评估数据准备与指标详解

> 用 RAGAS 评估 RAG 系统时，哪些数据需要你手动准备、哪些由系统自动生成？评估 4 个核心指标时各自用哪些数据、如何计算？本文用示例讲清 Faithfulness、Answer Relevancy、Context Precision、Context Recall 的计算逻辑。

---

## 一、评估数据准备

在真实 RAG 评估场景中，数据分两类来源：

**人工准备**
- `question`：测试问题集
- `ground_truth`：标准参考答案

**系统自动生成（运行 RAG 系统）**
- `contexts`：RAG 系统检索到的文档
- `answer`：RAG 系统基于 contexts 生成的回答

### 完整代码示例

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

# 1. 你只需要准备这两个
test_questions = [
    "什么是 RAG？",
    "RAG 有哪些应用场景？"
]
ground_truths = [
    "RAG 全称检索增强生成，结合外部知识库提升生成质量。",
    "RAG 广泛应用于问答系统、文档摘要、对话系统等场景。"
]

# 2. 对每个问题，运行你的 RAG 系统获取结果
rag_results = []
for q in test_questions:
    # 调用你的 RAG 系统
    result = your_rag_system.query(q)
    rag_results.append({
        "question": q,
        "answer": result["answer"],        # 系统生成
        "contexts": [result["context"]],   # 系统检索
        "ground_truth": ground_truths[len(rag_results)]  # 你准备的
    })

# 3. 转换为 Dataset 并评估
dataset = Dataset.from_list(rag_results)
result = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision, context_recall])
print(result)
```

**分工总结**
- ✅ **你的工作**：准备 `question` 和 `ground_truth`
- ✅ **系统的工作**：生成 `answer` 和检索 `contexts`
- ✅ **RAGAS 的工作**：对比这些数据计算各项指标

> 这样设计是合理的：评估的是**你的 RAG 系统**的真实表现，必须用系统真实的检索和生成结果才能反映真实性能；`ground_truth` 作为标准答案用于计算 `context_precision` 和 `context_recall`。

---

## 二、四个核心指标计算详解

### 1. Faithfulness（忠实度）

- **评估目标**：回答是否基于检索到的上下文，有无幻觉
- **输入**：`answer` + `contexts`（无需标准答案）
- **计算步骤**：从 `answer` 提取所有陈述句（claims）→ 逐一验证每个 claim 能否从 `contexts` 推断出来 → 统计被支持的 claim 占比

**示例**

```
Contexts: "RAG 结合检索和生成，于 2020 年提出"
Answer: "RAG 结合检索和生成，由 Google 开发"

Claims提取：
- "RAG 结合检索和生成" → ✅ 支持
- "RAG 由 Google 开发" → ❌ 不支持（context说2020年提出，未提Google）

Faithfulness = 1/2 = 0.5
```

### 2. Answer Relevancy（答案相关性）

- **评估目标**：回答是否切题，是否完整回答了问题
- **输入**：`question` + `answer`（无需标准答案）
- **计算步骤**：从 `answer` 提取所有关键陈述 → 计算各陈述与 `question` 的语义相似度 → 求平均

**示例**

```
Question: "什么是 RAG？"
Answer: "RAG 是检索增强生成技术，它结合了向量检索和语言模型。"

提取关键点：
- "RAG 是检索增强生成技术" → 与问题高度相关 (0.95)
- "结合了向量检索和语言模型" → 与问题相关 (0.80)

Answer Relevancy = (0.95 + 0.80) / 2 = 0.875
```

### 3. Context Precision（上下文精确率）

- **评估目标**：检索到的文档是否都相关（排序质量）
- **输入**：`contexts` + `ground_truth` + `question`
- **计算步骤**：按检索顺序遍历 documents → 逐个判断是否与 question 相关 → 计算平均精度（位置 k 的精度 = 前 k 个文档中相关文档占比）

**示例**

```
Contexts（按检索顺序）:
文档1: "RAG 是检索增强生成" → 相关 ✅
文档2: "Python 编程基础" → 不相关 ❌
文档3: "RAG 的应用场景" → 相关 ✅

计算：
位置1: 前1个中相关比例 = 1/1 = 1.0
位置2: 前2个中相关比例 = 1/2 = 0.5
位置3: 前3个中相关比例 = 2/3 = 0.667

Context Precision = (1.0 + 0.5 + 0.667) / 3 = 0.722
```

### 4. Context Recall（上下文召回率）

- **评估目标**：检索到的上下文是否包含回答所需的全部信息
- **输入**：`contexts` + `ground_truth`
- **计算步骤**：从 `ground_truth` 提取所有关键信息点 → 检查每个信息点是否在 `contexts` 出现 → 统计被覆盖占比

**示例**

```
Ground Truth: "RAG 全称检索增强生成，结合了向量检索和生成模型，由 Lewis 等人在 2020 年提出"

提取关键信息：
1. "RAG 全称检索增强生成"
2. "结合了向量检索和生成模型"
3. "由 Lewis 等人在 2020 年提出"

Contexts: ["RAG（Retrieval-Augmented Generation）结合检索与生成"]

覆盖检查：
信息1: "检索增强生成" → ✅ 覆盖
信息2: "向量检索" → ❌ 未覆盖
信息3: "Lewis 2020" → ❌ 未覆盖

Context Recall = 1/3 = 0.333
```

---

## 三、指标对比总结

| 指标 | 输入 | 计算核心 | 评估维度 |
| --- | --- | --- | --- |
| **Faithfulness** | answer + contexts | 回答是否来自检索文档 | 幻觉检测 |
| **Answer Relevancy** | question + answer | 回答是否切题 | 回答质量 |
| **Context Precision** | contexts + ground_truth | 检索文档是否相关（排序质量） | 检索精度 |
| **Context Recall** | contexts + ground_truth | 是否检索到所有必要信息 | 检索覆盖度 |

## 四、实际含义（诊断信号）

- **高 Faithfulness + 低 Context Recall**：回答准确但检索不全
- **低 Faithfulness + 高 Context Recall**：检索全面但模型幻觉严重
- **低 Context Precision**：检索噪音太多，混入了不相关内容

> 这些指标结合起来，能全面**诊断 RAG 系统的瓶颈**在哪里。

---

## 相关笔记

- [[AI大模型/rag/RAG评估框架|RAG评估框架]] — RAGAS、TruLens、ARES 等框架全景与工程化评估维度
- [[AI大模型/rag/RAG检索策略全面解析|RAG检索策略全面解析]] — 影响 Context Precision / Recall 的检索与重排策略
- [[AI大模型/rag/RAG系统核心技术与实现|RAG系统核心技术与实现]]