---
created: '2026-10-30T20:09:43+08:00'
modified: '2026-10-30T20:09:43+08:00'
---

# Seq2Seq 与 Encoder-Decoder Attention 笔记

## 1. Seq2Seq 是什么

Seq2Seq，全称是 Sequence to Sequence，意思是“从一个序列生成另一个序列”。

它最早被广泛用于机器翻译，例如：
```text
输入英文: I love machine learning
输出中文: 我 喜欢 机器 学习
```

Seq2Seq 的核心结构是：
```text
源序列 -> Encoder -> 语义表示 -> Decoder -> 目标序列
```

其中：

- Encoder 负责理解输入序列。
- Decoder 负责生成输出序列。

早期 Seq2Seq 通常使用 RNN、LSTM 或 GRU 作为 Encoder 和 Decoder。

## 2. Encoder 怎么做

Encoder 会按顺序读取输入句子的每个词。

例如输入句子：
```text
I love machine learning
```

Encoder 的处理过程可以理解为：
```text
I        -> h1
love     -> h2
machine  -> h3
learning -> h4
```

每个 `h_i` 是 Encoder 在当前位置的隐藏状态，包含了当前词以及前面上下文的信息。

在最早的 Seq2Seq 中，通常只把最后一个隐藏状态 `h4` 作为整句话的语义表示，然后交给 Decoder。

也就是：
```text
I love machine learning -> h4 -> Decoder
```

这个 `h4` 就像一个固定长度的“句子压缩包”。

## 3. Decoder 怎么做

Decoder 根据 Encoder 提供的语义表示，一个词一个词生成目标句。

例如：
```text
<BOS> -> 我 -> 喜欢 -> 机器 -> 学习 -> <EOS>
```

其中：

- `<BOS>` 表示句子开始。
- `<EOS>` 表示句子结束。

Decoder 每一步都会根据以下信息预测下一个词：

- 上一步生成的词；
- 当前 Decoder 隐藏状态；
- Encoder 提供的源句语义信息。

可以粗略写成：
```text
p(y_t | y_<t, x) = Decoder(s_t, context)
```

其中：

- `y_t` 是当前要生成的目标词；
- `y_<t` 是前面已经生成的目标词；
- `x` 是输入源句；
- `s_t` 是 Decoder 当前隐藏状态；
- `context` 是 Encoder 提供的上下文信息。

## 4. 早期 Seq2Seq 的问题

早期 Seq2Seq 最大的问题是：它把整句话压缩进一个固定长度向量。

短句问题不大，但长句会丢信息。

例如：
```text
The student who won the math competition last year is now studying artificial intelligence.
```

如果只用最后一个隐藏状态表示整句话，Decoder 在生成目标句时很难准确记住所有细节。

这被称为固定长度瓶颈。

## 5. Encoder-Decoder Attention 的核心思想

Attention 的改进是：

Decoder 不再只依赖 Encoder 的最后一个隐藏状态，而是可以在每一步生成时，动态查看 Encoder 的所有隐藏状态。

也就是从：
```text
只看最后一个 h_n
```

变成：
```text
每一步都看 h1, h2, h3, ..., h_n
```

这样，Decoder 生成不同目标词时，可以关注源句中不同的位置。

例如：
```text
输入: I love machine learning
输出: 我 喜欢 机器 学习
```

生成“机器”时，模型应该主要关注 `machine`。

生成“学习”时，模型应该主要关注 `learning`。

这就是所谓的“注意力对齐”。

## 6. Attention 对齐是怎么计算的

假设 Encoder 得到源句每个位置的隐藏状态：
```text
h1, h2, h3, h4
```

Decoder 在第 `t` 步有一个当前隐藏状态：
```text
s_t
```

### 第一步：计算相关性分数

Decoder 会拿自己的当前状态 `s_t` 和每个 Encoder 隐藏状态 `h_i` 计算一个分数：
```text
score(s_t, h_i)
```

这个分数表示：
```text
生成当前目标词时，源句第 i 个位置有多重要
```

例如生成“机器”时：
```text
score(s_t, h_I)
score(s_t, h_love)
score(s_t, h_machine)
score(s_t, h_learning)
```

理论上，`h_machine` 的分数应该最高。

### 第二步：Softmax 得到注意力权重

分数会经过 softmax，变成一组权重：
```text
alpha_ti = softmax(score(s_t, h_i))
```

这些权重加起来等于 1。

例如生成“机器”时，可能得到：
```text
I:        0.02
love:     0.05
machine:  0.72
learning: 0.21
```

这说明模型在生成当前词时，主要关注 `machine`，同时也会参考一点 `learning`。

### 第三步：加权求和得到上下文向量

然后模型会把所有 Encoder 隐藏状态按权重加权求和：
```text
c_t = sum(alpha_ti * h_i)
```

其中：

- `c_t` 是当前生成步骤专属的上下文向量；
- `alpha_ti` 是第 `t` 个目标词对第 `i` 个源词的注意力权重；
- `h_i` 是 Encoder 在第 `i` 个源词位置的隐藏状态。

### 第四步：Decoder 结合上下文生成目标词

Decoder 最后会结合：

- 当前 Decoder 状态 `s_t`；
- 当前上下文向量 `c_t`；
- 上一步生成的目标词；

来预测当前目标词：
```text
p(y_t | y_<t, x) = Decoder(s_t, c_t)
```

## 7. 为什么叫“对齐”

在机器翻译里，“对齐”指的是：
```text
目标句中的某个词，对应源句中的哪个词或哪些词
```

例如：
```text
I        -> 我
love     -> 喜欢
machine  -> 机器
learning -> 学习
```

Attention 权重 `alpha_ti` 本质上就学到了这种对应关系。

所以 Encoder-Decoder Attention 也可以理解为：
```text
Decoder 每生成一个目标词，就自动学习它应该对齐源句中的哪些位置。
```

## 8. Seq2Seq 与 Seq2Seq + Attention 的区别

### 普通 Seq2Seq
```text
源句 -> Encoder -> 最后一个隐藏状态 -> Decoder -> 目标句
```

特点：

- 结构简单；
- 整个源句被压缩成一个固定长度向量；
- 长句信息容易丢失。

### Seq2Seq + Attention
```text
源句 -> Encoder 所有隐藏状态
                ↓
Decoder 每一步动态选择该关注哪些源句位置
                ↓
目标句
```

特点：

- Decoder 每一步都能访问源句全部位置；
- 可以动态关注不同词；
- 长序列翻译更稳定；
- 注意力权重具有一定可解释性。

## 9. 和 Transformer Attention 的关系

2014-2015 年的 Attention 主要是 RNN Seq2Seq 里的辅助模块。

它通常是 Encoder-Decoder Attention，也就是：
```text
Decoder 查询 Encoder 的隐藏状态
```

到了 2017 年 Transformer，Attention 变成了主干结构。

Transformer 不再依赖 RNN，而是大量使用：

- Self-Attention；
- Multi-Head Attention；
- Encoder-Decoder Cross-Attention；
- Position Encoding。

二者关系可以理解为：
```text
Seq2Seq Attention:
RNN 是主干，Attention 是辅助信息检索机制。

Transformer:
Attention 直接成为主干，替代 RNN 进行序列建模。
```

## 10. 一句话总结

Seq2Seq 用 Encoder 把输入序列编码，再用 Decoder 生成输出序列；Encoder-Decoder Attention 则让 Decoder 在生成每个词时，动态回看 Encoder 的所有隐藏状态，计算对齐权重，从而知道当前目标词应该重点参考源句中的哪些位置。

## 相关笔记

- [[AI大模型/大语言模型学习/大模型技术点/三种seq2seq结构(seq2seq演变)|三种 seq2seq 结构（seq2seq 演变）]] — 无注意力 / Bahdanau / Luong 三张结构图对比（含交互图解）
- [[AI大模型/大语言模型学习/transformer架构和自注意力机制|transformer架构和自注意力机制]] — 注意力成为主干后的 Transformer