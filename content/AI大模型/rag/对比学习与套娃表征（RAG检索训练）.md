---
title: 对比学习与套娃表征（RAG检索训练）
tags:
- RAG
- 向量检索
- Embedding
- 对比学习
- MRL
status: 已消化
created: '2026-09-13T05:50:00+08:00'
modified: '2026-09-13T05:50:00+08:00'
---

# 对比学习与套娃表征（RAG检索训练）

> [!abstract] 一句话总结
> 在 RAG 语境下，三者分工明确：**对比学习管"检索准不准"，MRL 管"向量能不能截"，PQ 管"向量能不能压"**。对比学习负责训练阶段把语义学准，决定了检索质量上限；套娃表征（MRL）负责让同一向量"可长可短"，套娃 + 乘积量化（PQ）各自解决"截断"与"压缩"，决定推理/存储成本下限。

---

## 一、对比学习：让语义相近的靠得更近

**核心逻辑**：不依赖人工标注，通过构造"正样本对"和"负样本对"，在向量空间把语义相近的样本拉近、不相关的推远。

在 RAG 检索中，这直接决定向量模型能否准确理解 Query 与 Document 的语义匹配关系。典型训练方式：
- **正样本对**：同一问题的不同改写、或同一文档的标题与正文
- **负样本**：batch 内其他文档（in-batch negatives）
- **损失函数**：InfoNCE

> [!important] 关键点
> 对比学习是 RAG 检索质量的基础。没有好的对比学习，embedding 无法区分"苹果公司"和"水果苹果"，检索召回率无从谈起。

### 在 RAG 中的应用密度：非常高

已是稠密检索的标配训练范式，体现在三个层面：

1. **稠密检索器的标配训练方式** —— 主流的开源 embedding 模型（BGE 系列、E5、GTE）训练阶段都依赖对比学习拉近 query-document 语义距离。甚至用来解决特定检索短板（如对"年龄>30岁"这类数值约束的敏感度）。
2. **生成式检索领域的新探索** —— 从"训练 embedding 模型"扩展到"训练整个检索生成模型"（如 DOGR 直接建模 query-document 相关性做生成式检索）。
3. **面向 RAG 任务的端到端适配** —— 用分层对比学习框架（区分正样本 / 弱正样本 / 负样本）做领域适配。

> [!tip] 结论
> 对比学习不是"用不用"的问题，而是"怎么用得更好"的问题。

---

## 二、套娃表征学习（MRL）：让同一个向量"可长可短"

解决的是工程问题：**一次训练，多档使用**。

传统 embedding 模型训练时维度固定——要省存储就训 128 维小模型，要高精度就训 1024 维。MRL 的思路：训练时让向量的**前 m 维本身就构成一个可用的完整表征**。一个 1024 维 MRL embedding，取前 512/128/64 维都是有效嵌入向量，无需重新训练。

**RAG 环节的直接好处**：低维向量粗筛（快速缩小候选集）+ 高维向量对少数结果精排。论文报告理论 FLOPS 可降 128 倍，实际墙钟时间也有十几倍提升。OpenAI Embedding API 已采用，允许动态截断向量维度。

---

## 三、套娃表征 vs 乘积量化（PQ）：看似相似，实则正交

直觉是对的——两者都在做"压缩"，但**压缩的维度不同**：

- **PQ 压缩"数值精度"**：把 1024 维 float32（4096 字节）切成子段，每段用聚类中心编号近似，可压到 128 字节（≈32 倍）。核心是**有损编码**，信息丢失发生在数值精度层面。
- **MRL 压缩"向量长度"**：前 N 维本身就构成有效表征。核心是**结构化截断**，信息重要性按维度顺序排列，前面承载主要语义，后面补充细节。

| 维度 | 乘积量化 (PQ) | 套娃表征 (MRL) |
| --- | --- | --- |
| 压缩对象 | 数值精度（float32 → 1字节编码） | 向量长度（1024维 → 256维） |
| 何时生效 | 索引构建/存储阶段 | 训练阶段（模型学会多尺度表征） |
| 能否同时使用 | **可以，而且是常见组合** | **可以** |

**实践中常叠加使用**：先用 MRL 训出可截断的 embedding，再用 PQ 对保留维度做量化压缩。针对 MRL 结构的非均匀比特分配（给靠前的信息量大的维度更多存储精度）优于传统均匀 PQ——**MRL 为 PQ 提供了更优的压缩结构先验**。

---

## 四、两者关系：互补而非互斥

训练阶段用对比学习把语义判别能力练上去，同时用 MRL 嵌套损失让高维向量前缀保持可用；推理时用 MRL 截断能力控成本。

> [!note] 前沿交叉点
> 已有工作提出在 MRL 多尺度结构上做**时间感知的对比学习**，让不同维度层次表征协同优化，专门服务时序 RAG 场景。实践中两者已开始融合使用。

---

## 五、对比学习最小可运行示例（RAG 检索训练）

### 最核心思想：一个 batch 内"拉近推远"（in-batch negatives）
```
假设 batch 里有 4 个 (query, doc) 对：

q1 ↔ d1   (正样本，应该相似)
q2 ↔ d2   (正样本)
q3 ↔ d3   (正样本)
q4 ↔ d4   (正样本)

对于 q1 来说：
  d1 是正样本 → 拉近
  d2, d3, d4 是负样本（batch 内其他文档）→ 推远

对 q2, q3, q4 同理。
```

损失函数用 **InfoNCE**（也叫 NT-Xent）：

$$\mathcal{L} = -\log \frac{\exp(\text{sim}(q_i, d_i)/\tau)}{\sum_{j=1}^{B}\exp(\text{sim}(q_i, d_j)/\tau)}$$

其中 **τ 是温度系数，B 是 batch size**。本质就是：**在 batch 内做一次 softmax 分类，把正确的文档分到第一位。**

### 数据准备
```python
# 每个样本是一个 (query, positive_doc) 对
# 负样本不显式提供，由 batch 内其他 doc 充当
train_samples = [
    ("苹果公司最新财报", "苹果公司今日发布2024年Q4财报，营收..."),
    ("如何治疗感冒", "感冒通常由病毒引起，建议多休息、多喝水..."),
    ("Python 列表排序", "在 Python 中可以使用 sorted() 或 list.sort()..."),
    ("北京天气预报", "北京今日晴，气温 5-15 摄氏度..."),
    # ... 实际训练需要几万到几百万对
]
```

### 编码器与损失函数
```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

class DualEncoder(nn.Module):
    """Query 和 Document 共享同一个编码器（也可不共享）"""
    def __init__(self, model_name="BAAI/bge-base-zh-v1.5"):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(model_name)
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)

    def encode(self, texts, max_length=256):
        inputs = self.tokenizer(
            texts, padding=True, truncation=True,
            max_length=max_length, return_tensors="pt"
        ).to(self.encoder.device)
        outputs = self.encoder(**inputs)
        # 取 [CLS] 向量作为句向量
        emb = outputs.last_hidden_state[:, 0]
        # L2 归一化，使点积等价于余弦相似度
        return F.normalize(emb, p=2, dim=-1)


class InfoNCELoss(nn.Module):
    """in-batch negatives 对比损失"""
    def __init__(self, temperature=0.05):
        super().__init__()
        self.tau = temperature

    def forward(self, q_emb, d_emb):
        # q_emb, d_emb: [B, D]，已 L2 归一化
        # 相似度矩阵 [B, B]，对角线是正样本
        sim = q_emb @ d_emb.T / self.tau

        # 标签：第 i 个 query 对应第 i 个 doc
        labels = torch.arange(sim.size(0), device=sim.device)

        # 对称损失：query→doc 和 doc→query 两个方向
        loss_qd = F.cross_entropy(sim, labels)
        loss_dq = F.cross_entropy(sim.T, labels)
        return (loss_qd + loss_dq) / 2
```

### 训练循环
```python
from torch.utils.data import DataLoader, Dataset

class PairDataset(Dataset):
    def __init__(self, samples):
        self.samples = samples
    def __len__(self):
        return len(self.samples)
    def __getitem__(self, idx):
        return self.samples[idx]

def collate_fn(batch):
    queries = [x[0] for x in batch]
    docs = [x[1] for x in batch]
    return queries, docs

model = DualEncoder()
loss_fn = InfoNCELoss(temperature=0.05)
optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)

loader = DataLoader(
    PairDataset(train_samples),
    batch_size=32,          # batch 越大，负样本越多，效果通常越好
    shuffle=True,
    collate_fn=collate_fn,
)

model.train()
for epoch in range(3):
    for queries, docs in loader:
        q_emb = model.encode(queries)
        d_emb = model.encode(docs)
        loss = loss_fn(q_emb, d_emb)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        print(f"loss={loss.item():.4f}")
```

> [!tip] 关键点
> batch_size 直接决定负样本数量。batch=32 时，每个 query 有 31 个负样本。这就是为何 RAG 检索训练通常需要大 batch（256 甚至 1024），配合梯度累积或跨卡 gather 扩大负样本池。

### 进阶：引入难负样本（Hard Negatives）

只用 in-batch negatives 的问题：batch 内随机凑的文档太容易区分，模型学不到细粒度判别力。RAG 场景通常先用检索器召回一批"看起来像但不正确"的文档作为难负样本。
```python
# 每个样本变成 (query, positive, hard_negative)
train_samples_hn = [
    (
        "苹果公司最新财报",
        "苹果公司今日发布2024年Q4财报，营收...",
        "苹果种植技术指南：秋季施肥要点..."   # 难负样本：也含"苹果"但语义不同
    ),
    # ...
]

class TripletDataset(Dataset):
    def __init__(self, samples):
        self.samples = samples
    def __len__(self):
        return len(self.samples)
    def __getitem__(self, idx):
        return self.samples[idx]

def collate_triplet(batch):
    q = [x[0] for x in batch]
    p = [x[1] for x in batch]
    n = [x[2] for x in batch]
    return q, p, n

def info_nce_with_hard_neg(q_emb, p_emb, n_emb, tau=0.05):
    """
    q_emb, p_emb, n_emb: [B, D]
    正样本相似度 vs 难负样本相似度，做二分类式对比
    """
    pos_sim = (q_emb * p_emb).sum(dim=-1, keepdim=True) / tau   # [B, 1]
    neg_sim = (q_emb * n_emb).sum(dim=-1, keepdim=True) / tau   # [B, 1]

    # 同时把 batch 内其他正样本也作为负样本
    all_sim = q_emb @ p_emb.T / tau                              # [B, B]
    labels = torch.arange(q_emb.size(0), device=q_emb.device)

    # 拼接：每个 query 的候选 = [自己的正样本, 自己的难负样本, batch内其他正样本]
    logits = torch.cat([pos_sim, neg_sim, all_sim], dim=1)
    # 正确标签始终是第 0 列（自己的正样本）
    target = torch.zeros(q_emb.size(0), dtype=torch.long, device=q_emb.device)

    return F.cross_entropy(logits, target)
```

难负样本构造通常用当前模型或基础检索器对训练集做一次召回，取 rank 10-50 的文档作为候选（BGE、E5 训练 recipe 的标准操作）。

---

## 六、在 RAG 全流程中的位置
```
离线阶段：
  原始文档 → 切块 → [对比学习训练好的 Encoder] → 向量库
                          ↑
                    对比学习在这里发挥作用
                    （训练阶段决定 embedding 质量）

在线阶段：
  用户 Query → [同一个 Encoder] → 向量检索 → Top-K 文档 → LLM 生成
```

> [!important] 定位
> 对比学习**不直接出现在在线推理路径里**，它影响的是 Encoder 的参数。Encoder 训得好，Query 和 Document 向量才能在统一语义空间对齐，检索才能召回相关内容。

---

## 七、几个容易踩的坑

1. **温度系数 τ 的选择** — τ 太小（0.01）softmax 过于尖锐、训练不稳；太大大（0.5）负样本区分度不足。常见范围 0.02-0.1，BGE 系列用 0.02。
2. **batch size 与负样本质量** — in-batch negatives 效果随 batch 增大而提升；显存有限可用 gradient cache 或跨卡 all-gather 扩大有效负样本池。
3. **正样本的构造方式** — 不一定是"同一文档"，也可以是同一文档不同切块、同一问题不同改写、或 LLM 生成的伪 query。正样本质量决定模型学到的"相似"的含义。
4. **不要忽略对称性** — Query→Doc 和 Doc→Query 两个方向损失通常都要算，否则模型可能只学会单向匹配。

---

## 八、MRL 是怎么训练出来的（多尺度"套娃"损失）

MRL 能让"前 m 维本身成为完整表征"，技巧一句话：**在多个"前缀长度"上同时计算损失并加权求和，让网络被迫让每一个前缀都成为完整可用的表征**。

### 核心思路

假设输出一个 1024 维向量 `z ∈ R¹⁰²⁴`。MRL 训练时**不只在完整向量上算一次损失**，而是逐尺度各算一次：
```
L_total = w₁·loss(z[:64])   ← 取前 64 维，算一次检索损失
        + w₂·loss(z[:128])  ← 取前 128 维，再算一次
        + w₃·loss(z[:256])
        + w₄·loss(z[:512])
        + w₅·loss(z[:1024]) ← 完整维度也照常算
```

梯度反向传播时，网络必须**同时**让 64/128/256/512/1024 维的前缀向量都能独立完成检索。于是信息被迫按"重要性从高到低"排进维度——靠前承载主语义，后面补充细节。这就是"套娃"：大的套小的，每个嵌套层都是一个完整可用表征。

### 代码示例（把第七节 InfoNCE 升级成 MRL 版）

只是在外层循环各个维度前缀：
```python
class MatryoshkaInfoNCELoss(nn.Module):
    """MRL: 在每个维度前缀上分别算 InfoNCE，再求平均"""
    def __init__(self, dims, temperature=0.05):
        super().__init__()
        self.dims = dims          # 例如 [64, 128, 256, 512, 1024]
        self.tau = temperature

    def forward(self, q_emb, d_emb):
        """
        q_emb, d_emb: [B, D]，已 L2 归一化
        返回：各尺度 InfoNCE 损失的加权平均
        """
        dims = self.dims
        total_loss = 0.0

        for d in dims:
            # 1) 取前 d 维，得到一个候选"低维表征"
            q_sub = F.normalize(q_emb[:, :d], dim=-1)   # ← 截断后必须重新归一化
            d_sub = F.normalize(d_emb[:, :d], dim=-1)

            # 2) 在这个前缀维度上照常做 in-batch 对比
            sim = q_sub @ d_sub.T / self.tau
            labels = torch.arange(sim.size(0), device=sim.device)
            loss = (F.cross_entropy(sim, labels) + F.cross_entropy(sim.T, labels)) / 2
            total_loss += loss

        return total_loss / len(dims)
```

训练循环完全不用改，只需换上损失函数：
```python
model     = DualEncoder()                              # 与笔记相同，输出 1024 维
loss_fn   = MatryoshkaInfoNCELoss(dims=[64, 128, 256, 512, 1024], temperature=0.05)
optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)
# ... 其余与第六节 2.3 完全一致
```

### 三个关键易错点

1. **截断后必须重新 L2 归一化**。`q_emb[:, :d]` 只是原始向量的子段，范数≠1（原 1024 向量归一到 1，前缀范数通常 <1），不重新归一化点积就不是余弦相似度了。
2. **dims 序列最后要覆盖完整维度**（如 `...1024`），否则纯低维训练会掉精度。
3. **各尺度同权平均即可**（`return total_loss / len(dims)`）；论文里也有用 `1/log(d)` 做尺度加权，但收益不大，同权更稳。

### 为什么训完能直接"取前缀用"

因为训练时每个前缀都经过完整的前向+损失+反向，模型学会了"前 64 维自己也能完成匹配"。推理时只取前 256 维喂给向量库，就是独立可用的 256 维 embedding——不需任何线性变换或投影。

> [!tip] 和 PQ 的区别再次确认
> MRL 是**在训练时让向量"天生可分档"**（嵌套损失驱动）；而 PQ 是**训练好之后在存储时压数值**。所以两者可叠加：MRL 训出的可截断向量，再用 PQ 对每档维度做量化。

---

## 相关笔记

- [[AI大模型/rag/RAG检索可靠性系统设计|RAG检索可靠性系统设计]] — 检索全链路管控
- [[AI大模型/rag/Milvus向量数据库架构与向量检索原理解析|Milvus向量数据库架构与向量检索原理解析]] — HNSW/IVF/PQ 原理
- [[AI大模型/rag/ColBERT深度解析|ColBERT深度解析]] — Token 级精排模型
- [[AI大模型/rag/干了2年大模型开发居然只会换Embedding|干了2年大模型开发居然只会换Embedding]] — 三路混合检索 + 检索失效诊断