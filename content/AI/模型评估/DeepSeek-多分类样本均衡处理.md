---
title: 多分类样本不均衡处理（DeepSeek 问答整理）
tags:
- 机器学习
- 多分类
- 样本不均衡
- 长尾分类
- 损失函数
- 概率校准
- 模型评估
source: DeepSeek 会话
status: 已消化
created: '2026-09-27T08:46:30+08:00'
modified: '2026-09-27T08:46:30+08:00'
---

# 多分类样本不均衡处理

> [!abstract] 一句话
> 把一次围绕「**多分类项目 + 样本不均衡**」的连续追问，重组成一条从**训练侧 → 标签侧 → 稀疏类别 → 评估侧 → 上线校准**的完整链路。全程围绕同一个核心矛盾：**训练分布 ≠ 线上分布**。

> [!tip] 核心结论（自己的话）
> 1. **均衡只作用在训练集**——验证/测试集必须保持真实分布，否则评估失真。
> 2. **训练侧改损失**（加权 CE / Focal / Logit Adjustment）比硬重采样更稳；类别权重首选**逆频率** $w_k = N/(C\cdot N_k)$。
> 3. **标签侧先分清「0」的含义**——真负样本要保留，只有标注缺失才 mask；单标签用 `ignore_index`（样本级），多标签用**元素级** Loss Mask。
> 4. **稀疏类别**：训练样本为 0 的类，任何 loss 技巧都救不了——只能补数据 / 从输出层去掉 / 接受并监控。
> 5. **评估侧主指标用 Macro-F1**（每类等权）；Micro-F1 在单标签下等于 Accuracy，会被多数类淹没。
> 6. **上线侧必须做概率校准**（先验修正 / Platt / Isotonic / 温度缩放），把概率还原到线上真实先验；只用 argmax 标签则影响较小。

## 🗺️ 全景地图

| 阶段 | 要解决的问题 | 主要手段 | 对应章节 |
|---|---|---|---|
| **训练侧** | 少数类学不好 | 加权 CE · Focal Loss · Logit Adjustment · 重采样/增强 · 代价矩阵 | §二 |
| **标签侧** | 无效标签 / 缺失标注污染 loss | `ignore_index`（单标签）· 元素级 Loss Mask（多标签） | §三 |
| **稀疏类别** | 某些类样本极少或为 0 | 补数据 · 移除类 · 分层/规则兜底 · 监控 | §四 |
| **评估侧** | 指标被多数类淹没 | Macro-F1 为主，Weighted/Micro 为辅，逐类 P/R/F1 兜底 | §五 |
| **上线侧** | 训练先验 ≠ 线上先验 | 先验修正 · Platt · Isotonic · 温度缩放 · 阈值调整 · 线上监控 | §六 |

---

## 一、要不要做均衡？先判断

**结论：通常需要，但要分情况。**

### 1.1 需要做均衡的场景

| 场景 | 说明 |
|---|---|
| 类别间样本量差距大（如 10:1 以上） | 少数类容易被模型忽略 |
| 少数类业务价值高 | 如欺诈检测、罕见病诊断，漏判代价大 |
| 评估指标关注 Macro-F1 / 每类召回 | 不均衡会严重拉低少数类指标 |
| 模型对类别分布敏感 | 如逻辑回归、SVM、神经网络 |

### 1.2 不一定需要做均衡的场景

- **类别差距不大**（如 2:1 以内），且评估指标是 Accuracy 或 Micro-F1
- **树模型 + 类别权重**：XGBoost/LightGBM 的 `class_weight` / `scale_pos_weight` 已经能较好处理
- **数据量极大**：多数类本身已提供充分信息，强行欠采样会丢信息

### 1.3 均衡手段总览（按推荐优先级）

1. **类别权重（class_weight）** — 改动最小，不增删样本，首选
2. **Focal Loss** — 深度学习场景，让模型聚焦难样本
3. **过采样 + 增强** — 少数类 SMOTE / ADASYN / 数据增强
4. **欠采样** — 多数类多时可用，但会丢信息
5. **混合采样** — SMOTE + Tomek Links 等

> [!warning] 关键原则
> 均衡只能作用在**训练集**上，验证集和测试集必须保持**真实分布**，否则评估结果会失真。

---

## 二、训练侧：损失函数怎么做

> 核心思路：**让少数类的错误被放大、多数类的错误被缩小。**

### 2.1 加权交叉熵（Weighted CE）

#### 公式

对单样本 $i$，真实类别为 $y_i$，预测概率为 $p_{i,k}$：

$$L_i = -w_{y_i}\log p_{i,y_i}, \qquad L = \frac{1}{N}\sum_{i=1}^{N} -w_{y_i}\log p_{i,y_i}$$

#### 权重怎么设

| 公式 | 特点 |
|---|---|
| $w_k = \dfrac{N}{C \cdot N_k}$ | **标准逆频率**，样本越少权重越大 |
| $w_k = \dfrac{1}{\sqrt{N_k}}$ | 平方根逆频率，缓解极端权重 |
| $w_k = \dfrac{1-\beta}{1-\beta^{N_k}}$ | 有效样本数（Class-Balanced Loss），长尾友好，$\beta\in[0,1)$，常用 0.999 |
| 手动设定 | 按业务代价，如漏判少数类代价是多数类 10 倍，就设 $w_{\text{minor}}=10$ |

> [!note] 逆频率公式详解 `weights = counts.sum() / (len(counts) * counts)`
> 设 `counts = [N_1, ..., N_C]`，$C$ 为类别数，$N$ 为总样本数，则 $w_k = \dfrac{N}{C \cdot N_k}$：
> - $N/C$ = **平均每类样本数**；$w_k$ = 平均每类样本数 ÷ 第 $k$ 类样本数 → **样本越少权重越大**
> - **为什么要除以 $C$**：不除 $C$ 时 $w_k = N/N_k$，权重整体偏大（例 `[1.11, 11.1, 111]`），要重调学习率；除以 $C$ 后权重量级接近 1，学习率更稳
>
> 数值例子（`counts = [1000, 100, 10]`，$N/C = 370$）：
> `w = [0.37, 3.70, 37.0]` → 少数类每个样本在 loss 里被放大 37 倍，多数类被缩小到 0.37 倍。
>
> ⚠️ 极少数类（如 $N_k=1$）会导致权重爆炸，建议 `torch.clamp(weights, max=...)`。

#### PyTorch 实现
```python
import torch
import torch.nn as nn

# 方式1：直接用 weight 参数
class_counts = torch.tensor([1000, 100, 10], dtype=torch.float)
weights = class_counts.sum() / (len(class_counts) * class_counts)  # 逆频率
weights = torch.clamp(weights, max=50.0)   # 防止极少数类权重爆炸
criterion = nn.CrossEntropyLoss(weight=weights)

# 方式2：手动计算（想按类别平均而非按样本加权时）
def weighted_ce(logits, targets, weights):
    log_probs = torch.log_softmax(logits, dim=1)
    loss = -log_probs.gather(1, targets.unsqueeze(1)).squeeze()
    w = weights[targets]
    return (w * loss).mean()
```

> [!warning] 注意
> `nn.CrossEntropyLoss(weight=...)` 内部会做 `mean`，等价于按样本数加权平均。想按**类别**平均，需 `reduction='none'` 后自行处理。

### 2.2 Focal Loss（聚焦难样本）

**动机**：加权 CE 对所有该类样本一视同仁，但多数类里有大量**容易样本**，它们累加的 loss 仍然主导梯度。

**公式**：

$$L_{\text{focal}} = -\alpha_{y}(1-p_y)^{\gamma}\log p_y$$

- $\gamma$：聚焦参数，常用 2；$\gamma=0$ 退化为加权 CE
- $\alpha_y$：类别权重，处理不均衡
- $(1-p_y)^{\gamma}$：**调制因子**——样本越容易（$p_y\to1$），权重越小

**直观例子**（$\gamma=2$）：

| 样本 | $p_y$ | $(1-p_y)^2$ | 相对 CE 的缩放 |
|---|---|---|---|
| 极易 | 0.95 | 0.0025 | 缩小 400 倍 |
| 容易 | 0.8 | 0.04 | 缩小 25 倍 |
| 中等 | 0.5 | 0.25 | 缩小 4 倍 |
| 难 | 0.2 | 0.64 | 缩小 1.6 倍 |
| 极难 | 0.05 | 0.90 | 几乎不变 |

**代码**：
```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class FocalLoss(nn.Module):
    def __init__(self, alpha=None, gamma=2.0, reduction='mean'):
        super().__init__()
        self.alpha = alpha      # [C] 类别权重（多分类时是向量）
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, logits, targets):
        log_probs = F.log_softmax(logits, dim=1)
        log_pt = log_probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        pt = log_pt.exp()
        loss = -(1 - pt) ** self.gamma * log_pt
        if self.alpha is not None:
            loss = self.alpha[targets] * loss
        return loss.mean() if self.reduction == 'mean' else loss.sum()
```

**适用与注意**：

| 适用 | 不适用 |
|---|---|
| 极不均衡（如 100:1） | 类别均衡 |
| 目标检测（原论文场景） | 噪声标签多（会聚焦噪声） |
| 难样本有业务价值 | 需要精确概率（Focal 会扭曲概率） |

- $\gamma$ 和 $\alpha$ 要一起调，$\gamma$ 大了 $\alpha$ 影响变小
- Focal 输出的概率**偏离真实先验**，下游要用概率必须校准
- 多分类 Focal 的 $\alpha$ 是向量，原论文是二分类

### 2.3 Logit Adjustment（训练推理一致）

**动机**：重采样会改变先验导致概率偏移。Logit Adjustment 在**训练时**就把先验信息加进 logits，让模型学到的分数天然对齐真实先验。

**公式**：

训练时：

$$\ell_i = -w_{y_i}\log \frac{e^{z_{i,y_i} + \tau\log\pi_{y_i}}}{\sum_k e^{z_{i,k} + \tau\log\pi_k}}$$

推理时：

$$\hat{y} = \arg\max_k\left(z_k + \tau\log\pi_k^{\text{real}}\right)$$

其中 $\pi_k$ 是训练集类先验，$\tau$ 是温度超参。

**实现**：
```python
def logit_adjustment_loss(logits, targets, train_prior, tau=1.0, weight=None):
    adjusted = logits + tau * torch.log(train_prior + 1e-12)
    return F.cross_entropy(adjusted, targets, weight=weight)

# 推理时用真实先验
def predict(logits, real_prior, tau=1.0):
    adjusted = logits + tau * torch.log(real_prior + 1e-12)
    return adjusted.argmax(dim=1)
```

这是目前处理不均衡**最优雅**的方法之一，兼顾训练和推理一致性。

### 2.4 其他损失方案

**Class-Balanced Loss**（用有效样本数代替逆频率，适合长尾）：

$$w_k = \frac{1-\beta}{1-\beta^{N_k}}, \qquad \beta=0.999 \text{ 常用}$$
```python
def class_balanced_weights(counts, beta=0.999):
    effective_num = 1.0 - torch.pow(beta, counts)
    weights = (1.0 - beta) / effective_num
    return weights / weights.sum() * len(counts)
```

**LDAM Loss**（Label-Distributed Aware Margin，给少数类更大的分类间隔，$m_k \propto N_k^{-1/4}$）：

$$L_i = -\log \frac{e^{z_{y_i} - m_{y_i}}}{e^{z_{y_i} - m_{y_i}} + \sum_{k\neq y_i} e^{z_k}}$$

**代价敏感矩阵**（不同类误判代价不同时，$C_{ij}$ = 真实 $i$ 预测成 $j$ 的代价）：

$$L_i = \sum_j C_{y_i,j} \cdot p_{i,j}$$

比单纯类别加权更通用。**重采样 + 普通 CE** 则是数据层面均衡，缺点是推理时仍需先验修正（见 §6.3）。

### 2.5 方法对比与选择

| 方法 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|
| 加权 CE | 简单、稳定 | 易分样本仍主导 | 通用首选 |
| Focal Loss | 聚焦难样本 | 多分类调参麻烦 | 极不均衡、检测 |
| Logit Adjustment | 训练推理一致、理论优雅 | 需要知道先验 | 长尾分类 |
| Class-Balanced | 长尾友好 | 需调 $\beta$ | 长尾分布 |
| LDAM | 学得更开 | 实现稍复杂 | 长尾分类 |
| 代价矩阵 | 贴合业务 | 需定义代价 | 代价敏感业务 |

**推荐组合**：

1. **入门**：逆频率加权 CE
2. **进阶**：Focal Loss + $\alpha$ 权重
3. **长尾/研究**：Logit Adjustment 或 LDAM + 重采样
4. **业务代价明确**：代价矩阵

### 2.6 几个关键坑

1. **权重归一化**：`nn.CrossEntropyLoss(weight=w)` 不要求 $w$ 归一化，但归一化后学习率更稳定
2. **验证集不要加权**：用真实分布验证集 + 普通 CE 或 Macro-F1 评估
3. **Focal Loss 的 $\alpha$ 和 $\gamma$ 要一起调**：$\gamma$ 大了 $\alpha$ 影响变小
4. **概率偏移**：任何重采样/加权都会让输出概率偏离真实先验，下游要用概率必须校准（§六）
5. **多分类 Focal 的 $\alpha$**：原论文是二分类，多分类时 $\alpha$ 是向量，需自己扩展

---

## 三、标签侧：无效标签 / 缺失标注怎么 mask

> 目的：让「未提及标签」（Padding、被截断/无效标签、不属于当前任务的样本）在计算损失时被**完全忽略**，不对梯度产生任何贡献。

### 3.1 先分清「0」是什么（决定一切）

同样是「0」，含义不同，处理方式完全相反：

| 「0」的含义 | 本质 | 是否该忽略 |
|---|---|---|
| 类别**真的不存在**该标签 | 该样本不属于这个类，是合法的负样本 | **不能忽略**，这是有效监督信号 |
| 类别**标注缺失**（未提及） | 标注员没标，不代表不存在 | 可以忽略，但会丢信息 |
| 类别**永远不会出现** | 业务上该类别已废弃 / 不可能 | 可以从输出层去掉 |
| Padding / 无效占位 | 非真实样本 | 应该忽略 |

> [!warning] 最常见的误区
> 把「多标签里没提到的类」当成「负样本」。如果做的是**单标签 18 分类**，每个样本只属于 1 个类，其他 17 个类天然是负类，不存在「未提及」问题——**这种情况根本不该用 `ignore_index`**。只有**多标签**或**标注不完整**场景，才存在「未提及 ≠ 负样本」。

### 3.2 单标签：`ignore_index`

**原理**：PyTorch `CrossEntropyLoss` 的 `ignore_index` 指定一个特殊目标值（默认 `-100`），标签等于该值时损失乘 0，被排除在反向传播外：

$$l_n = -w_{y_n}\log\frac{e^{x_{n,y_n}}}{\sum_c e^{x_{n,c}}} \cdot \mathbb{1}\{y_n \neq \text{ignore\_index}\}$$
`reduction='mean'` 时，分母也是 $\sum_n w_{y_n}\cdot\mathbb{1}\{y_n\neq\text{ignore\_index}\}$——**被忽略的样本既不在分子也不在分母**。
```python
import torch
import torch.nn as nn

targets = torch.tensor([0, -100, 2])   # 第 2 个样本是 padding，设为 -100
logits = torch.randn(3, 4)             # 3 个样本，4 个类别

criterion = nn.CrossEntropyLoss(ignore_index=-100)
loss = criterion(logits, targets)      # 只有样本 1、3 参与
```

NLP 中极常见：语言模型训练时 padding token 的标签设为 `-100`。

> [!note] `ignore_index` 的取值
> 默认 `-100`，但**不强制**——可指定任何整数。且这个值**不需要**在类别范围 $[0, C-1]$ 内，所以可以安全用 `-100` / `-1` 标记「忽略」而不与真实类别混淆。

### 3.3 多标签：Loss Mask

**数据形态**：一个样本的标签是长度为 $C$ 的 0/1 向量。
```
样本1: [1, 0, 0, 1, 0, ..., 0]  # 属于类1和类4
样本2: [0, 0, 0, 0, 1, ..., 0]  # 只属于类5
```

问题：那些 0，是「确定不属于」还是「没标注」？

| 0 的含义 | 处理 |
|---|---|
| 明确负样本 | 保留，参与 loss |
| 标注缺失（未提及） | **mask 掉，不参与 loss** |
| padding | mask 掉 |

> 若无法区分，通常假设「未提及 = 缺失」，只对**明确标注为正**的类计算 loss——但这样会丢失负样本信息。

#### 三种实现方式

**方式一：样本级 mask**（整个样本忽略；适用于标注完全不可靠的样本）
```python
def sample_level_masked_bce(logits, targets, valid_mask):
    """valid_mask: [N] bool，True 表示该样本有效"""
    loss_per_sample = F.binary_cross_entropy_with_logits(
        logits, targets, reduction='none'
    ).mean(dim=1)                      # [N]
    loss_per_sample = loss_per_sample * valid_mask.float()
    return loss_per_sample.sum() / valid_mask.sum().clamp(min=1)
```

**方式二：元素级 mask**（每个标签位置单独忽略）——**最常用**
```python
def element_level_masked_bce(logits, targets, label_mask):
    """label_mask: [N, C] bool，True 表示该位置标签有效"""
    loss_per_element = F.binary_cross_entropy_with_logits(
        logits, targets, reduction='none'
    )                                  # [N, C]
    loss_per_element = loss_per_element * label_mask.float()
    return loss_per_element.sum() / label_mask.sum().clamp(min=1)
```

**方式三：只用正样本 + 负采样**（正样本极少、全量负样本太多时）
```python
label_mask = (targets == 1)            # 只用正样本
# 或：正样本 + 随机采样的负样本
```

#### 完整示例：多标签 + 缺失标注 + 不均衡
```python
class MaskedBCELoss(nn.Module):
    def __init__(self, pos_weight=None):
        super().__init__()
        self.pos_weight = pos_weight    # [C] 每个类的正样本权重

    def forward(self, logits, targets, label_mask):
        loss = F.binary_cross_entropy_with_logits(
            logits, targets, reduction='none', pos_weight=self.pos_weight
        )                               # [N, C]
        loss = loss * label_mask.float()
        return loss.sum() / label_mask.sum().clamp(min=1)

pos_weight = torch.tensor([...])        # 每类的负正比，处理不均衡
criterion = MaskedBCELoss(pos_weight=pos_weight)
loss = criterion(model(x), targets, label_mask)
```

#### mask 怎么构造

| 情况 | 做法 |
|---|---|
| 标注平台明确给出「已标注/未标注」 | 直接用平台返回的 `label_mask` |
| 只给了正样本，其余全是「未提及」 | `label_mask = (targets == 1)`，或正样本 + 随机采样负样本 |
| 全部标注完整 | `label_mask = torch.ones_like(targets, dtype=torch.bool)` |

#### 注意事项

| 注意点 | 说明 |
|---|---|
| mask 的位置不参与 loss，**也不参与分母** | 否则会稀释有效信号 |
| `pos_weight` 仍可叠加 | 处理正负样本不均衡 |
| 推理时不用 mask | 对所有类都输出概率，再 argmax / 阈值判定 |
| **未标注 ≠ 负样本** | mask 掉不代表模型学会「不是这个类」 |
| 未标注类线上会出现 | 模型可能漏判，需要监控 |
| mask 比例过高 | 有效信号太少，训练不充分，考虑补标 |

#### 上线预测
```python
probs = torch.sigmoid(model(x))         # 每个类独立概率

pred = (probs > 0.5).int()              # 方式1：固定阈值
pred = (probs > thresholds).int()       # 方式2：每类调阈值（在真实分布验证集上调）
topk_probs, topk_idx = probs.topk(k=3, dim=1)   # 方式3：Top-K
```

### 3.4 CE vs BCE：任务与 mask 粒度

| 维度 | CrossEntropy (CE) | BinaryCrossEntropy (BCE) |
|---|---|---|
| 任务 | **单标签**多分类 | **多标签**分类 |
| 输出 | softmax，各类概率和为 1 | sigmoid，各类独立概率 |
| 类别关系 | 互斥 | 可共存 |
| 公式 | $-\log\frac{e^{z_y}}{\sum_k e^{z_k}}$ | $-\sum_k[y_k\log p_k + (1-y_k)\log(1-p_k)]$ |
| 标签形态 | 整数 `[0, 2, 1]` | 0/1 向量（如 `[1,0,1]`） |
| 不均衡处理 | `weight`（每类权重） | `pos_weight`（正样本权重） |
| **`ignore_index` 粒度** | **样本级**（整个样本忽略） | **元素级**（单个标签位置忽略） |

**关键差异**：

- **梯度行为**：CE 的 softmax 让类间竞争（提高一类压低其他类）；BCE 各类独立，提高一类不影响其他类
- **这就是为什么多标签缺失标注要用 BCE + 元素级 mask**——CE 的 `ignore_index` 是样本级，无法只忽略某几个标签位置
```python
# CE：单标签
logits = model(x)                        # [N, 18]
targets = torch.tensor([0, 3, 5])        # 每个样本一个类
loss = F.cross_entropy(logits, targets, weight=class_weights)

# BCE：多标签
targets = torch.tensor([[1,0,0,1,...], ...])   # 0/1 向量
loss = F.binary_cross_entropy_with_logits(logits, targets, pos_weight=pos_weights)
```

**能否互换**：

| 场景 | 能否用 CE | 能否用 BCE |
|---|---|---|
| 单标签互斥 | ✅ 标准 | ⚠️ 可用但浪费（需 one-hot） |
| 多标签共存 | ❌ 不行 | ✅ 标准 |
| 单标签但类别多 | ✅ | ⚠️ 计算量大 |

> **单标签用 CE，多标签用 BCE，这是标准做法。** 多标签不能用 CE，因为 softmax 假设类别互斥、概率和为 1；多标签里一个样本可同时属于多个类，用 CE 会强制模型在类间做选择，丢失共存信息。

**不均衡下的选择**：

| 场景 | 损失 | 不均衡处理 |
|---|---|---|
| 单标签不均衡 | CE | `weight` 逆频率 / Focal |
| 多标签不均衡 | BCE | `pos_weight` + mask |
| 多标签缺失标注 | BCE | 元素级 mask + `pos_weight` |

---

## 四、稀疏类别：18 类里很多类为 0 / 个别类极少

> 核心担心：训练时 mask 掉大量「0 样本类别」，会不会导致模型学不会这些类、上线预测不出？

### 4.1 训练样本为 0 的类会怎样

- 模型**从未见过**这些类，输出层对应神经元梯度始终为 0（或只有负梯度）
- 上线后这些类的 logit 通常极小，**几乎永远不会被 argmax 选中**；即使选中也是随机噪声

**核心问题不是「mask 会不会影响」，而是「没有数据怎么学」**：

| 处理方式 | 说明 |
|---|---|
| **去掉这些类** | 业务确认不会出现，直接从 18 类改成实际存在的类 |
| **补充数据** | 最根本的解法，哪怕少量样本 |
| **零样本 / 小样本迁移** | 用类别语义（如文本描述）做 embedding 匹配 |
| **设置先验 / 阈值** | 给这些类一个基础分，但效果有限 |
| **保留但接受预测不出** | 明确业务上这些类线上极少，漏判可接受 |

> [!warning] 关键
> **如果某个类训练集为 0，任何 loss 技巧都救不了它。** `ignore_index` 只是「不计算」，不会「无中生有」。

### 4.2 ignore_index / mask 对预测类别数的影响

| 影响 | 说明 |
|---|---|
| **输出层维度不变** | `ignore_index` 只影响损失计算，不改模型结构，输出仍是 18 维，argmax 仍在 18 类里选 → **预测类别数量不会变** |
| **被忽略的类学不到东西** | 某类样本训练中全被 mask → 该神经元几乎无有效梯度，logit 停在初始化附近 → 上线基本不会被预测到。**真正要担心的不是类别数变了，而是某些类「名存实亡」** |
| **概率分布被扭曲** | 大量忽略样本 → 学到的先验 ≠ 线上真实先验 → 输出概率偏移，下游要用概率需校准 |

### 4.3 上线预测 18 类的三种情况

| 情况 | 结论 |
|---|---|
| **A：18 类都有训练数据，只是不均衡** | 用 class_weight / Focal 处理即可，**不要用 `ignore_index` 忽略少数类**（等于主动放弃），上线正常 |
| **B：部分类训练样本为 0** | 这些类上线**基本预测不出来**。业务必须识别 → **必须补数据**；业务极少出现 → 可接受但要监控 |
| **C：多标签，大量标签「未提及」** | 用 mask 合理，但注意**忽略 ≠ 负样本**，模型只是不学，上线遇到这些类真实出现可能漏判 |

### 4.4 单标签个别类极少：怎么做

#### 先判断：要不要移除？

| 判断维度 | 倾向保留 | 倾向移除 |
|---|---|---|
| 业务价值 | 该类漏判代价高 | 该类无关紧要 |
| 样本量 | 有几十~几百 | 只有个位数且无法补充 |
| 可补充性 | 能补数据/合成 | 永远补不到 |
| 线上出现频率 | 线上会出现 | 线上几乎不出现 |

- 有业务价值 + 能补数据 → **保留，补数据**
- 无业务价值 + 线上不出现 → **移除，缩小类别数**
- 有业务价值 + 样本极少 + 补不到 → **保留但特殊处理**

> [!warning] 移除的代价
> 一旦线上真的出现该类，模型永远预测不出，且会误判成其他类。

#### 不移除时，训练阶段怎么做

| 层面 | 做法 |
|---|---|
| **损失** | 逆频率加权（`clamp` 上限防权重爆炸）或 Focal Loss + 类别权重（§2.1 / §2.2） |
| **数据** | 过采样 · SMOTE/ADASYN · 数据增强（文本回译、图像变换）· 迁移学习 |
| **结构** | 分层分类（先粗分大类再细分）· 二阶段（先判是否稀有类集合）· 共享表征 |
| **评估** | Macro-F1 为主 · 逐类看 P/R/F1 · 验证集保持真实分布不过采样 |
```python
# 逆频率加权，但给极少数类设上限，避免权重爆炸
counts = torch.tensor([...])                      # 18 类样本数
weights = counts.sum() / (len(counts) * counts)
weights = torch.clamp(weights, max=50.0)
criterion = nn.CrossEntropyLoss(weight=weights)
```

#### 处理姿势总结
```
1. 判断：业务价值 + 样本量 + 可补充性
2. 能补数据 → 补数据，这是最根本的
3. 不能补 → 保留 + 加权/Focal + 过采样/增强
4. 评估 → Macro-F1 + 逐类 P/R/F1
5. 上线 → 先验修正 / 温度校准 / 阈值调整   （见 §六）
6. 监控 → 预测分布 + 稀有类召回
```

#### 上线监控

- **监控预测分布**：各类别预测占比 vs 真实占比
- **监控每类召回**：哪些类从来没被预测出来
- **设置告警**：某类连续 N 天预测数为 0 → 模型没学会

#### 如果必须保留 18 类但部分类无数据

- **分层预测**：先判断是否属于「稀有类集合」，再细分
- **规则兜底**：模型预测不出的类，用业务规则补充
- **阈值调整**：给稀有类降低被判出的阈值（但会增假阳）

---

## 五、评估侧：用哪个 F1

### 5.1 基础：每类 P / R / F1

$$P_k = \frac{TP_k}{TP_k + FP_k}, \quad R_k = \frac{TP_k}{TP_k + FN_k}, \quad F1_k = \frac{2P_kR_k}{P_k + R_k}$$

- $TP_k$：真实为 $k$ 且预测为 $k$；$FP_k$：真实不为 $k$ 但预测为 $k$；$FN_k$：真实为 $k$ 但预测不为 $k$
- 多分类的 $P/R/F1$ 就是把每个类的 $F1_k$ 用不同方式聚合

### 5.2 三种聚合

**Macro-F1（宏平均）** —— 每类先算 F1 再直接平均，不考虑样本量：

$$\text{Macro-F1} = \frac{1}{C}\sum_{k=1}^{C} F1_k$$

- 每个类权重相同，少数类表现和多数类一样重要
- **对不均衡敏感**：少数类 F1 低会显著拉低

**Micro-F1（微平均）** —— 先汇总所有类的 TP/FP/FN 再算全局：

$$P_{\text{micro}} = \frac{\sum_k TP_k}{\sum_k(TP_k+FP_k)}, \quad R_{\text{micro}} = \frac{\sum_k TP_k}{\sum_k(TP_k+FN_k)}, \quad \text{Micro-F1} = \frac{2P_{\text{micro}}R_{\text{micro}}}{P_{\text{micro}}+R_{\text{micro}}}$$

- 单标签多分类中：$P_{\text{micro}} = R_{\text{micro}} = \text{Accuracy} = \text{Micro-F1}$
- 被多数类主导；多标签下 Micro-F1 ≠ Accuracy，更有意义

**Weighted-F1（加权平均）** —— 按样本量加权：

$$\text{Weighted-F1} = \sum_{k=1}^{C} \frac{N_k}{N} F1_k$$

- 样本多的类权重高，介于 Macro 和 Micro 之间

### 5.3 例子（样本数 1000 / 100 / 10，F1 分别 0.95 / 0.80 / 0.30）

| 指标 | 计算 | 结果 |
|---|---|---|
| Macro-F1 | (0.95+0.80+0.30)/3 | **0.683** ← 少数类差，被拉低 |
| Weighted-F1 | 0.901×0.95 + 0.090×0.80 + 0.009×0.30 | ≈ **0.930** |
| Micro-F1 | ≈ Accuracy，主要被 A 主导 | ≈ **0.93** |

### 5.4 三者对比

| 指标 | 权重方式 | 对不均衡 | 单标签下 = Accuracy？ | 关注点 |
|---|---|---|---|---|
| Macro-F1 | 每类等权 | **敏感**，少数类影响大 | 否 | 每类表现 |
| Micro-F1 | 按样本汇总 | 不敏感，多数类主导 | **是** | 整体表现 |
| Weighted-F1 | 按类样本量加权 | 较不敏感 | 否，但接近 | 折中 |

- 类别均衡时：Macro ≈ Micro ≈ Weighted
- 不均衡时：通常 **Micro > Weighted > Macro**

### 5.5 不均衡项目怎么选

1. **主指标用 Macro-F1** —— 最能反映少数类是否被忽略
2. **辅助看 Weighted-F1 / Micro-F1** —— 了解整体，避免为少数类牺牲太多多数类
3. **同时看每类 P/R/F1** —— 只看聚合会掩盖问题，用 `classification_report` 逐类检查
4. **结合业务代价** —— 漏判少数类代价高就看少数类 Recall；误判多数类代价高就看多数类 Precision
```
主指标：Macro-F1
辅指标：Weighted-F1、少数类 Recall
监控：每类 P/R/F1 + 混淆矩阵
```

> [!warning] 陷阱
> - **不要只看 Accuracy/Micro-F1**：不均衡时会被多数类主导，掩盖少数类崩掉
> - **Macro-F1 也有陷阱**：某类样本极少时其 F1 方差大，会剧烈影响 Macro-F1，需结合样本量看
> - **多标签任务**：Micro-F1 ≠ Accuracy，此时 Micro 和 Macro 都有意义
```python
from sklearn.metrics import f1_score, classification_report

macro = f1_score(y_true, y_pred, average='macro')
micro = f1_score(y_true, y_pred, average='micro')
weighted = f1_score(y_true, y_pred, average='weighted')
print(classification_report(y_true, y_pred, digits=4))
```

---

## 六、上线侧：概率校准

> 核心矛盾：**训练分布 ≠ 线上分布**，会导致预测概率偏移。

### 6.1 先明确：你要的是什么？

- **只要类别标签（argmax）** → 均衡训练通常影响不大，因为 argmax 对单调变换不敏感
- **要校准的概率值** → 必须做**概率校准**

### 6.2 类别先验（Class Prior）是什么

**类别先验就是实际类别占比**：

$$\pi_k = P(y=k) = \frac{N_k}{N}$$

| 概念 | 含义 | 例子 |
|---|---|---|
| **训练先验** $\pi_k^{\text{train}}$ | 训练集里各类占比 | 过采样后少数类占比被抬高 |
| **线上真实先验** $\pi_k^{\text{real}}$ | 线上实际各类占比 | 少数类只占 0.1% |

**为什么重要**：对少数类过采样后（如 0.1% → 10%），模型输出概率**偏向少数类**；上线时线上还是 0.1%，概率就偏了。

**怎么估计线上真实先验**：历史线上数据统计 · 业务专家估计 · 小批量人工标注 · 至少用**未经采样的验证集**占比。

### 6.3 先验修正（Prior Correction）—— 最直接的校准

$$p_{\text{real}}(y=k|x) \propto p_{\text{model}}(y=k|x) \cdot \frac{\pi_k^{\text{real}}}{\pi_k^{\text{train}}}$$

修正后再归一化：
```python
def prior_correction(probs, train_prior, real_prior):
    """probs: [N, C]；train_prior: [C] 训练时（过采样后）先验；real_prior: [C] 线上真实先验"""
    adjusted = probs * (real_prior / train_prior).unsqueeze(0)
    return adjusted / adjusted.sum(dim=1, keepdim=True)
```

### 6.4 Temperature Scaling —— 调概率，不改 argmax

$$p_{\text{cal}}(y=k|x) = \text{softmax}(z_k / T)$$

- $T>1$：分布变**平缓**；$T<1$：变**尖锐**；$T=1$：不变
- 让概率更接近真实置信度，**不改变 argmax 结果**（除以同一个 $T$，排序不变）
```python
class TemperatureScaler(nn.Module):
    def __init__(self):
        super().__init__()
        self.T = nn.Parameter(torch.ones(1))
    def forward(self, logits):
        return logits / self.T

# 在验证集上优化 T（LBFGS）
scaler = TemperatureScaler()
optimizer = optim.LBFGS([scaler.T], lr=0.01)
criterion = nn.CrossEntropyLoss()

def closure():
    optimizer.zero_grad()
    loss = criterion(scaler(val_logits), val_labels)
    loss.backward()
    return loss

optimizer.step(closure)
```

#### Temperature Scaling vs 阈值调整

| 维度 | Temperature Scaling | 阈值调整 |
|---|---|---|
| 改什么 | 概率值本身 | **决策边界** |
| 改 argmax？ | **不改**（单标签） | **改** |
| 目的 | 概率校准 | 调召回/精度平衡 |
| 适用 | 下游要用概率 | 下游只用标签 |
| 参数 | 1 个全局 $T$ | 每类一个阈值 |

直观理解：
```
原始 logits: [5, 3, 1]
T=1:   softmax → [0.84, 0.11, 0.04]   argmax=类1
T=5:   softmax → [0.45, 0.30, 0.25]   argmax=类1（不变，概率更平）
T=0.5: softmax → [0.98, 0.02, 0.00]   argmax=类1（不变，更尖）
```

无论 $T$ 怎么变，类1 始终最大，但概率值变化很大。

> - 下游只用类别标签 → **阈值调整**更直接
> - 下游要用概率（排序、融合、风控）→ **Temperature Scaling** 必须做

### 6.5 Platt Scaling —— sigmoid 拟合

**要解决**：模型输出概率不是真实概率（说 80% 置信，实际可能只有 60% 对）。

$$p_{\text{cal}} = \frac{1}{1 + \exp(A \cdot s + B)}$$

$s$ 为模型原始输出，$A, B$ 在**验证集**上用最大似然拟合（本质是在模型输出上再训一个逻辑回归）。
```python
from sklearn.linear_model import LogisticRegression

platt = LogisticRegression()
platt.fit(val_scores.reshape(-1, 1), val_labels)
calibrated = platt.predict_proba(new_scores.reshape(-1, 1))[:, 1]
```

多分类不能直接套，两种做法：
```python
# 方式一：One-vs-Rest
from sklearn.multiclass import OneVsRestClassifier
platt_ovr = OneVsRestClassifier(LogisticRegression())
platt_ovr.fit(val_scores, val_labels_onehot)
calibrated = platt_ovr.predict_proba(test_scores)

# 方式二：先 softmax 再逐类校准，最后重新归一化
probs = F.softmax(logits, dim=1)
calibrated = np.zeros_like(probs)
for k in range(C):
    lr = LogisticRegression()
    lr.fit(probs[:, k].reshape(-1, 1), (val_labels == k).astype(int))
    calibrated[:, k] = lr.predict_proba(probs[:, k].reshape(-1, 1))[:, 1]
calibrated = calibrated / calibrated.sum(axis=1, keepdims=True)
```

| 优点 | 缺点 |
|---|---|
| 简单、参数少（2 个） | 假设 sigmoid 形状，可能不匹配 |
| 小样本也能拟合 | 多分类要拆成多个二分类 |
| 稳定不易过拟合 | 表达能力有限 |

### 6.6 Isotonic Regression —— 只假设单调

**要解决**：Platt 假设校准曲线是 sigmoid，但真实关系可能更复杂。Isotonic **不假设形状**，只要求**单调非减**——把模型输出排序、分成若干段，每段用真实正例频率代替。
```
模型输出:  0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8  0.9
真实频率:  0.05 0.08 0.15 0.20 0.45 0.50 0.65 0.80 0.92
                ↑ 分段拟合，保证单调不减
```
```python
from sklearn.isotonic import IsotonicRegression

iso = IsotonicRegression(out_of_bounds='clip')
iso.fit(val_scores, val_labels)
calibrated = iso.predict(test_scores)

# 多分类：One-vs-Rest
calibrated = np.zeros_like(probs)
for k in range(C):
    iso = IsotonicRegression(out_of_bounds='clip')
    iso.fit(probs[:, k], (val_labels == k).astype(int))
    calibrated[:, k] = iso.predict(probs[:, k])
calibrated = calibrated / calibrated.sum(axis=1, keepdims=True)
```

| 优点 | 缺点 |
|---|---|
| 不假设形状，更灵活 | 需要**大量**验证样本（几千+） |
| 拟合真实频率 | 容易过拟合 |
| 单调保证 | 多分类要拆 |
| 适合复杂校准曲线 | 外推差（超出训练范围） |

### 6.7 Platt vs Isotonic

| 维度 | Platt Scaling | Isotonic Regression |
|---|---|---|
| 假设 | sigmoid 形状 | 仅单调 |
| 参数量 | 2 个 | 分段，较多 |
| 样本需求 | 少（几百） | 多（几千+） |
| 过拟合风险 | 低 | 高 |
| 灵活性 | 低 | 高 |
| 外推 | 好 | 差 |

**经验法则**：验证集 < 1000 → Platt；> 1000 且曲线复杂 → Isotonic；不确定 → 先试 Platt。

### 6.8 阈值调整 —— 不校准概率，直接调决策

下游只用类别标签、不关心概率时，可直接给稀有类加偏置：
```python
adjusted_logits = logits + bias        # bias[k] 对稀有类为正
pred = adjusted_logits.argmax(dim=1)
```

偏置大小在**真实分布验证集**上调，平衡稀有类召回和整体精度。

### 6.9 校准方法总览与选择

| 校准方法 | 原理 | 数据需求 | 适用场景 | 能否改 argmax |
|---|---|---|---|---|
| **先验修正** | 按先验比例调整概率 | 知道训练和线上先验 | 重采样/加权后 | 可能改（各类缩放不同） |
| **Temperature Scaling** | 全局温度缩放 | 真实分布验证集 | 深度学习，概率偏移 | **不改** |
| **Platt Scaling** | 每类 sigmoid 拟合 | 每类足够验证样本 | 二分类/每类独立 | 可能改 |
| **Isotonic Regression** | 非参数单调拟合 | 大量验证样本 | 样本充足，概率校准 | 可能改 |
| **阈值调整** | 直接调决策边界 | 真实分布验证集 | 只用标签，调召回 | **改** |
| **Logit Adjustment** | 训练推理都加先验 | 知道先验 | 长尾，训练推理一致 | 改 |

**能都用吗？可以叠加，但要注意顺序**：
```
1. 先验修正（处理重采样导致的偏移）
2. Temperature Scaling（校准概率置信度）
3. 阈值调整（调最终决策）
```

通常**不需要全用**：

| 需求 | 推荐 |
|---|---|
| 只用标签，不关心概率 | 阈值调整 / Logit Adjustment |
| 要用概率，且做过重采样 | 先验修正 + Temperature Scaling |
| 概率要非常准 | 先验修正 + Isotonic Regression |
| 简单快速 | Temperature Scaling |

**决策树**：
```
下游用概率吗？
├─ 否 → 阈值调整 或 Logit Adjustment
└─ 是 → 训练时重采样了吗？
        ├─ 是 → 先验修正 + Temperature Scaling
        └─ 否 → Temperature Scaling 或 Isotonic
```

### 6.10 三者定位：Focal vs Platt vs Isotonic

| 方法 | 阶段 | 目的 | 作用对象 |
|---|---|---|---|
| **Focal Loss** | 训练时 | 让模型聚焦难样本、少数类 | 损失函数 |
| **Platt Scaling** | 训练后 | 把输出概率校准成真实概率 | 概率值 |
| **Isotonic Regression** | 训练后 | 同上，非参数、更灵活 | 概率值 |

- Focal 改的是**模型怎么学**；Platt / Isotonic 改的是**模型学完之后，输出概率怎么解释**
- **Platt / Isotonic 是单调变换，不改变 argmax 排序**，只改概率值
- **Focal 会扭曲概率**，用了 Focal 后概率校准更重要

**典型配合流程**：
```
1. 训练：Focal Loss 或加权 CE 处理不均衡
   ↓
2. 得到模型，但输出概率偏移
   ↓
3. 在真实分布验证集上校准：样本少 → Platt；样本多 → Isotonic；深度学习 → 温度缩放
   ↓
4. 下游用校准后的概率 或 调阈值出标签
```

### 6.11 线上监控与迭代

- **监控预测分布**：线上各类别预测占比 vs 真实占比，偏差大说明校准有问题
- **监控各类指标**：少数类的 precision/recall 是否达标
- **持续回流**：线上真实分布数据回流，定期重训
- **A/B 测试**：校准前后的业务指标对比

---

## 七、推荐的整体流程（收口）
```
1. 分析数据分布 & 业务代价
2. 判断任务类型：单标签（CE）还是多标签（BCE）
3. 训练集：class_weight / Focal / Logit Adjustment（验证/测试保持真实分布）
4. 无效标签：单标签 ignore_index，多标签元素级 Loss Mask
5. 训练模型
6. 评估：Macro-F1 为主 + 逐类 P/R/F1
7. 用真实分布验证集做概率校准（先验修正 / Platt / Isotonic / 温度缩放）
8. 按业务需求调阈值
9. 线上监控预测分布 & 各类指标，数据回流定期重训
```

> [!success] 一句话总结
> 训练时可以均衡（推荐改损失用 `class_weight` / Focal / Logit Adjustment，而非硬重采样），但**推理时必须把概率还原到线上真实先验**；标签侧先分清「负样本 vs 缺失」再决定是否 mask；评估侧主看 **Macro-F1**。如果只用 argmax 标签，校准影响相对小，但仍建议用真实分布验证集评估。

> [!quote]- 原始 8 轮问题（存档）
> 1. 多分类项目，需要做样本均衡吗？做了均衡，线上实际不均衡怎么处理
> 2. 样本不均衡，怎么计算损失
> 3. Macro-F1 / Micro-F1 / Weighted-F1
> 4. 针对未提及标签导致的数据不均衡问题，引入 ignore_index / Loss Mask 机制优化模型训练过程，这是怎么做的
> 5. 对于一个 18 类多分类业务，很多类别都是 0，这样使用以上处理，不会影响最终预测类别数量吗？上线预测 18 类会有问题吗
> 6. 单标签场景个别类样本极少怎么做（移除吗？不移除上线怎么校准）；多标签场景每个样本只有少数类别有标签，mask 怎么做
> 7. 逆频率 `weights = counts.sum() / (len(counts) * counts)` 啥意思；各类先验是实际类别占比吗；`softmax(z_k/T)` 是用 T 调节概率吗；几种校准方式的使用场景；CE 和 BCE 对比
> 8. Platt Scaling / Isotonic Regression / Focal 这三个再解释一下

---

## 相关笔记

- [[AI/模型评估/3分类评估指标对比|3分类评估指标对比（交互工具）]] — Macro / Weighted / Micro 三指标交互对比工具（同目录）
- [[AI/机器学习/XGBoost并行化技术详解|XGBoost并行化技术详解]] — 树模型的 `class_weight` / 损失函数视角
- [[AI/AI-MOC|AI MOC]] — 机器学习 · 模型评估内容地图