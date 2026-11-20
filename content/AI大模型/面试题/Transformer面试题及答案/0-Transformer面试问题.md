---
created: '2026-05-15T19:30:51+08:00'
modified: '2026-05-15T19:30:51+08:00'
---

## Transformer 篇

### 一、基础原理与数学模型（21题）

1. Transformer为何使用多头注意力机制？（为什么不用一个头）
2. Transformer为什么Q和K使用不同的权重矩阵生成？为何不能使用同一个值进行自身的点乘？
3. Transformer计算attention的时候为何选择点乘而不是加法？两者计算复杂度和效果上有什么区别？
4. 为什么在进行softmax之前需要对attention进行scaled？（为什么除以dk的平方根），并使用公式推导进行讲解
5. 在计算attention score的时候如何对padding做mask操作？
6. 为什么在进行多头注意力的时候需要对每个head进行降维？
7. 讲一下Transformer的Encoder模块？
8. 为何在获取输入向量之后需要对矩阵乘以embedding size的开方？
9. 简单介绍Transformer的位置编码？
10. 了解哪些关于位置编码的技术？
11. 简单介绍一下Transformer中的残差结构以及意义。
12. 为什么transformer块使用LayerNorm而不是BatchNorm？
13. 讲一下BatchNorm技术及其优缺点？
14. 简单描述一下Transformer的前馈神经网络？使用了什么激活函数？相关优缺点？Encoder端和Decoder端是如何进行交互的？
15. Encoder端和Decoder端是如何进行交互的？（在这里可以问一下关于seq2seq的attention知识）
16. Transformer的并行化提现在哪个地方？Decoder端可以做并行化吗？
17. 描述一下wordpiece model和byte pair encoding？Dropout是如何设定的，位置在哪里？Dropout在测试时需要有什么需要注意的吗？
18. Transformer训练的时候学习率是如何设定的？
19. Dropout是如何设定的？
20. Bert的mask为何不学习transformer在attention处进行屏蔽score的技巧？

---

## 二、训练与优化（19题）

1. Transformer中的可训练Queries、Keys和Values矩阵从哪儿来？
2. Transformer的Feed Forward层在训练的时候到底在训练什么？
3. 具体分析Transformer的Embeddings层、Attention层和Feedforward层的复杂度。
4. Transformer的Positional Encoding如何表达相对位置关系？
5. Layer Normalization蕴含的神经网络的假设是什么？
6. 从数据的角度分析Transformer中的Decoder和Encoder的依存关系。
7. 描述Transformer中的Tokenization的数学原理、运行流程、问题及改进方法。
8. 描述self-attention复杂度从O(n²)降低到O(n)的方案。
9. Bert的CLS能够有效的表达Sentence Embeddings吗？
10. 使用BPE进行Tokenization对于Cross-lingual语言模型的意义？
11. 如何训练Transformer处理数据量差异大的多类别数据？
12. 如何使BERT更好地适应大规模预训练任务？
13. 在输入Embeddings时是否可以使用更多来源的词嵌入？
14. 更深的Transformer网络是否意味着更强的预训练模型？
15. 如何降低Transformer中Embedding中的参数数量？
16. 描述Transformer不同Layer之间的FeedForward神经网络之间的联系。
17. 如何降低Transformer的Feedforward层的参数数量？
18. Transformer的Layer深度过深会导致什么问题？
19. 如何大规模降低Transformer中Embedding中的参数数量？

---

## 三、应用与实践（6题）

1. 如何使用Transformer实现Zero-shot Learning？
2. 描述至少2种对不同训练模型训练出来的Embeddings进行相似度比较的方法。
3. 如何使得小模型例如LSTM具有大模型例如Bert的能力？
4. 训练后的BERT模型泛化能力的限制是什么？
5. GPT的auto-regressive语言模型架构在信息表示方面有什么缺陷？
6. 描述BERT中MLM实现中的缺陷及可能的解决方案。

---

## 四、技术深入与创新应用（29题）

1. 从数学角度阐明对Transformer任意位置和长度进行Mask的方式。
2. 描述Encoder和Decoder中Attention机制的不同之处。
3. 描述Transformer中Decoder的Embedding layers架构设计、运行流程和数学原理。
4. 描述Transformer进行Training的全生命周期的在Decoder中是如何进行Embedding的。
5. 描述Transformer进行Inference的全生命周期的在Decoder中是如何进行Embedding的。
6. 如果Transformer采用和Inference同样的流程进行Training，会有什么弊端？
7. 为何Transformer的Matrix Dimensions是3D的？
8. 描述只由一个Encoder和Decoder的Transformer使用了Attention的地方及其功能。
9. 描述Training和Inference时Masking在Transformer使用Attention机制的地方的功能和数学实现。
10. 描述Transformer的Training Loss工作流程和数学公式。
11. 阐述Multi-head Attention机制中通过Linear layer计算QKV的logical和physical partition。
12. 阐述Transformer中所有训练操作的功能。
13. 阐述QKV在Transformer中的功能。
14. 解释Transformer中Attention Score衡量不同Words Relevance的原理。
15. 描述Transformer如何知道什么样的Weights能更好地表达不同信息部分的注意力。
16. 如何减少Transformer中训练后的Word Embeddings的Bias？
17. 解决Self-attention和Word与自身Attention的问题？
18. Transformer如何有效表示NLP、CV等AI领域的信息？
19. 通过Ground Truth训练Transformer使其具有泛化能力的原因？
20. Transformer的Attention计算时为何需要进行Scaling？
21. 输入文本词汇的顺序如何由position encoding或multi-head attention实现？
22. 描述multi-head attention的实现方式。
23. 描述Transformer中non-linear操作的类型和数学原理。
24. 为何Transformer论文作者声称"Attention is all you need"？
25. 谈一下Teacher forcing的数学原理及其在Transformer中的应用。

---

## 五、性能优化与模型改进（7题）

1. Transformer采用Inference流程进行Training的问题？
2. Transformer的Matrix Dimensions为何是3D的？
3. 描述单Encoder和Decoder的Transformer使用Attention的地方及其功能。
4. Training和Inference时Masking在Transformer Attention机制中的功能和数学实现。
5. 描述Transformer的Training Loss工作流程和数学公式。
6. 阐述Multi-head Attention中通过Linear layer计算QKV的partition。
7. 如何减少Transformer中训练后的Word Embeddings的Bias？

---

## 六、特定应用场景与解决方案（2题）

1. 如何使用Transformer实现对话系统并判定用户交流内容是否离题？
2. Transformer训练时学习率和Dropout的设定？