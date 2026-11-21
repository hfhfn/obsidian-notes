---
created: '2026-05-23T10:23:34+08:00'
modified: '2026-05-23T10:23:34+08:00'
---

## Cross Encoder（交叉编码器）

---

Cross Encoder（交叉编码器）是一种用于**稠密检索**、**文本匹配**或**相关性排序**的神经网络结构。它与双编码器（Bi-Encoder）最大的区别在于：**将两个文本直接拼接成一个序列，一次性输入到编码器中**，从而让模型能够对两段文本进行深度的交互和交叉注意力计算。

下面详细介绍 Cross Encoder 的网络结构。

## 1. 核心结构图

```text
    相关性得分 (0~1 或 -∞~+∞)
            ↑
    [全连接层 + 激活函数]  (可选)
            ↑
         [CLS] 向量  (或 序列所有token的平均/最大池化)
            ↑
    _________________________
   |  Transformer Encoder   |  (例如 BERT, RoBERTa, ELECTRA)
   | (多层自注意力+前馈网络) |
    -------------------------
            ↑
    [SEP]  [SEP]
      ↑      ↑
   文本 A  文本 B
      ↑      ↑
    Token  Token
    序列   序列
```

## 2. 输入表示

- **拼接方式**：`[CLS] + 文本A的tokens + [SEP] + 文本B的tokens + [SEP]`
- **作用**：这样可以让文本A的每个token直接与文本B的每个token通过Transformer的**自注意力机制**进行交互，捕捉细粒度的语义关系。

## 3. 编码器主体

- 通常使用预训练语言模型（如BERT、RoBERTa）作为编码器
- 网络层：多层Transformer（例如12层、24层）
- 每层包含：多头自注意力（Multi-Head Self-Attention）+ 前馈网络（FFN）+ 残差连接 + 层归一化

## 4. 输出层（得分计算）

有两种常用方式：

### 方式一：基于[CLS]向量
```
score = MLP( [CLS]向量 )  或  Linear( [CLS]向量 )
```
- [CLS]位置的最终隐状态向量（维度768或1024）代表了整个输入对（文本A+文本B）的聚合信息。

### 方式二：基于所有token的池化
```
score = Linear( Average(所有token的隐状态) )
```
- 对序列所有位置的输出向量进行平均或最大池化，再通过一个线性层映射到标量得分。

## 5. 与双编码器的对比

| 特性       | Cross Encoder                            | Bi-Encoder                             |
| ---------- | ---------------------------------------- | -------------------------------------- |
| 输入方式   | 两文本拼接后一次输入                     | 两文本分别独立编码                     |
| 交互程度   | 深层、完全的交叉注意力（所有层交互）     | 无交互（仅在最终向量相似度计算时交互） |
| 计算复杂度 | O(n²) (n为总长度)                        | O(n1² + n2²)                           |
| 典型应用   | 精排（Re-ranking）、文本蕴含、相似度判断 | 召回（Retrieval）、聚类                |
| 离线/在线  | 不适合在线索引（需要成对计算）           | 适合预先计算索引                       |

## 6. 训练与损失函数

- **二分类任务**：Binary Cross Entropy（输出是否相关/相似）
- **排序任务**：Pairwise损失（如Margin Ranking Loss）或 Listwise损失（如LambdaRank）
- **常见技巧**：使用预训练模型初始化，在特定领域数据上微调

## 7. 优缺点

**优点**：
- 精度高：能够捕捉细粒度的语义匹配信号（如否定、词序、修饰关系）
- 适合精排：作为重排序模型，提升搜索系统的最终效果

**缺点**：
- 计算成本高：对于N对查询-文档，需要N次前向传播
- 无法预计算索引：查询时无法预先编码文档库

## 8. 代码示例（HuggingFace + PyTorch）

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

class CrossEncoder:
    def __init__(self, model_name="cross-encoder/ms-marco-MiniLM-L-6-v2"):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        
    def predict(self, query, document):
        # 拼接输入
        features = self.tokenizer(
            query, document, 
            padding=True, truncation=True, 
            return_tensors="pt"
        )
        
        # 前向传播
        with torch.no_grad():
            outputs = self.model(**features)
            logits = outputs.logits  # shape: (batch, 2) 或 (batch, 1)
            score = torch.sigmoid(logits).item()  # 如果是二分类
        return score

# 使用示例
encoder = CrossEncoder()
score = encoder.predict("什么是机器学习？", "机器学习是人工智能的一个分支，...")
print(f"相关度得分: {score}")
```

## 9. 典型应用场景

1. **搜索系统的精排阶段**：先用Bi-Encoder召回top-100，再用Cross Encoder重排得到最终结果
2. **零样本文本分类**：将文本与类别描述拼接，判断是否匹配
3. **语义相似度计算**：STS任务
4. **自然语言推理**：判断前提与假设的关系（蕴含、矛盾、中性）

## 总结

Cross Encoder通过将两个文本拼接输入Transformer，实现了深层次的交互匹配，因此精度远高于Bi-Encoder，但计算成本也显著增加。在实际系统中，通常采用**召回（Bi-Encoder）+ 精排（Cross Encoder）**的两阶段架构，兼顾效率和效果。