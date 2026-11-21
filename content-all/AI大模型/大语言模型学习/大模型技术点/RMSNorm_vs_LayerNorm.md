---
created: '2026-05-16T11:30:15+08:00'
modified: '2026-05-16T11:30:15+08:00'
---

# RMSNorm vs LayerNorm

## 核心观点

RMSNorm 并非在所有场景都优于 LayerNorm，其核心优势是**更高效**，在现代 LLM 中能保持与 LayerNorm 相当的效果。

---

## 公式对比

**LayerNorm**（需计算均值 μ 和方差 σ²）：

```
y = (x - μ) / sqrt(σ² + ε) * γ + β
```

**RMSNorm**（只需计算均方根 RMS）：

```
y = x / RMS(x) * γ     其中 RMS(x) = sqrt(mean(x²))
```

---

## 为什么 RMSNorm 更受现代 LLM 青睐

### 1. 计算更快
- LayerNorm 需要计算两个统计量：均值 + 方差
- RMSNorm 只需一个：均方根（平方 → 求和 → 开根）
- 实测节省约 **7%~64%** 的计算开销，大模型训练/推理中累积收益显著

### 2. 去掉了「中心化」操作
- LayerNorm 会减去均值，将分布强制平移到均值为 0
- RMSNorm 只做尺度缩放，不改变分布的均值偏移
- 研究表明：在 Transformer 中，中心化操作带来的收益极小，去掉几乎不影响效果

### 3. Pre-Norm 结构下中心化作用被大幅削弱

| 结构 | 说明 | 推荐归一化 |
|------|------|-----------|
| Post-Norm（BERT、GPT-1/2） | 先做注意力/FFN，再归一化 | LayerNorm（中心化稳定梯度） |
| **Pre-Norm（现代 LLM）** | **先归一化，再做注意力/FFN** | **RMSNorm（够用且更快）** |

Pre-Norm 结构中，残差连接本身已能很好地稳定梯度，LayerNorm 的中心化变得冗余。

---

## 主流模型的选择

| 模型系列 | 归一化方式 |
|---------|-----------|
| GPT-3、早期 Transformer | LayerNorm |
| Llama 1/2/3（Meta） | RMSNorm |
| Mistral | RMSNorm |
| Gemma（Google） | RMSNorm |

---

## 总结

> **在 Pre-Norm 结构的现代 LLM 中，RMSNorm 以更低的计算成本达到与 LayerNorm 相当的效果，是更优的工程选择。**

若使用小模型、Post-Norm 结构，或任务对分布偏移敏感，LayerNorm 仍可能更合适。
