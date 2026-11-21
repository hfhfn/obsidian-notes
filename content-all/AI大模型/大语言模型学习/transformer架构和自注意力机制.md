---
created: '2026-08-05T10:10:15+08:00'
modified: '2026-08-05T10:10:15+08:00'
---

# Transformer架构与自关注的力量

采用缩放点积注意力机制的编码器-解码器结构的Transformer架构。

**如果您还不是 Medium 的订阅用户，**[**请点击此处阅读全文**](https://medium.com/@lmpo/the-transformer-architecture-and-the-power-of-self-attention-6a0b59005c11?sk=24f1ed301a025aafb245e945dedaae9c)**。**

Transformer架构在开创性的论文*《*[*Attention Is All You Need*](https://arxiv.org/pdf/1706.03762.pdf)*》*（Vaswani等人，2017）中提出，彻底革新了自然语言处理（NLP），并已成为现代人工智能模型的基础，从GPT和BERT到Vision Transformer（ViT）和基于扩散的图像生成器，无不体现着这一理念。与按顺序处理词元的循环神经网络（RNN）和长短期记忆网络（LSTM）不同（后者通常训练缓慢且存在梯度消失的问题），Transformer利用**注意力机制****并行**处理序列。这种架构创新使得模型能够学习全局依赖关系，并在GPU上高效扩展，使其成为机器翻译、文本生成、代码合成和图像理解等大规模任务的理想选择。

## 1. 序列模型的局限性

在Transformer出现之前，**循环神经网络（RNN）**和**长短期记忆**网络（LSTM）主导了自然语言处理（NLP）领域。这些模型按顺序处理输入词元，并维护一个随着序列逐步演化的隐藏状态。虽然它们在处理短上下文时效果显著，但却存在两个主要问题：

1. **顺序依赖性：**  
   循环神经网络一次处理一个词元，这使得并行化变得困难。这种限制降低了训练效率，尤其是在处理大型数据集时。- **梯度消失和梯度爆炸：**  
     随着序列变长，梯度在反向传播过程中可能会减小或爆炸，从而削弱模型学习长期依赖性的能力。

这些限制促使研究人员设计了一种架构，该架构可以**同时捕获整个序列的上下文**，同时充分利用 GPU 和 TPU 等现代并行计算硬件。


基于循环神经网络的机器翻译。（作者原创）

## 2. Transformer架构概述

Transformer**模型**用**注意力机制**取代了循环，使模型能够同时考虑序列中的所有词元。标准的 Transformer 模型采用**编码器-解码器结构，**包含多个堆叠层。


具有编码器-解码器结构的Transformer架构。（作者原创）

Here’s how information flows through the model:

**1. Input Processing**: Text is converted into dense vector embeddings. Since Transformers don’t inherently understand sequence order, **positional encodings** are added to tell the model where each token sits in the sequence.

**2. Encoder**: Contains **N** identical layers (typically 6–12), each with two main components:

* **Multi-head self-attention (MHA)** mechanism* Position-wise **Feed-Forward Neural Network (FFNN)**

Each component is wrapped with **residual connections** and **layer normalization.**

**3. Decoder**: Similar to the encoder but includes three sublayers per layer:

* **Masked self-attention** (prevents looking ahead at future tokens)* **Cross-attention** (connects to encoder outputs)* Position-wise **FFNN**

**4. Output Generation**: The decoder’s output passes through a final linear layer and softmax to produce probability distributions over the vocabulary.

This parallel processing capability makes Transformers remarkably efficient on modern hardware, scaling well from small tasks to massive datasets.

## 2. Self-Attention: The Heart of the Transformer

Self-attention allows the model to weigh the importance of different words when processing each token. For a sequence of embeddings **X** ∈ R^(*n*×*d*) (where *n* is **maximum sequence length** and *d* is **embedding dimension** which often denoted as *d_model*), self-attention computes a weighted combination based on learned relationships. The original Transformer model, with a maximum **context length** of **256** tokens and **512-dimensional embedding vectors**, produces a token representation matrix of size 256 × 512, where 𝑛 = 256 (sequence length) and 𝑑 = 512 (embedding dimension).

### 2.1 The Mechanism

Self-attention operates through three learned transformations:

**1. Queries (Q), Keys (K), and Values (V)**: Linear projections of the input **X**:


where **W^***Q* , **W^***K* and **W^***V* are learnable weight matrices to project input sequence **X** to **Q**, **K**, **V** matrices. Additionally, *n* is the length of the input sequence, *d* is the dimension of the input embeddings, which is also denoted as *d_model.*

Their matrix representation are given as below:

where *dₖ* is the dimension of key vectors and query vectors (**q***ᵢ*) while *dᵥ* is the dimension of the **v***ᵢ* value vectors

**2. Computing Attention Scores**: The model calculates how much each token should attend to every other token using **scaled dot-products**:

The scaling factor 1/√*dₖ* ​​ **prevents the dot products from becoming excessively large** in high-dimensional spaces, making training stable and efficient.

**3. Softmax Normalization:** The raw scores are passed through a softmax to obtain probabilities:

**4. Output:** The final output is a weighted sum of the values:

This mechanism excels at capturing **long-range dependencies** without regard to positional distance. For instance, in the sentence “The cat ate the mouse,” self-attention could assign high weights between “cat” and “ate” to highlight the subject-verb connection, even in more complex or extended sequences.

Transformer Architecture with Encoder-Decoder Structure. (Created by the Author)

### 2.2 Multi-Head Attention

To capture different types of relationships simultaneously, self-attention runs in parallel across **multiple “heads.”** Each head learns to focus on different aspects — one might capture grammatical relationships while another tracks semantic connections.

The input is projected into multiple sets of queries, keys, and values, each corresponding to a different attention head. For *i*=1,2,…,*h*

**Scaled Dot-Product Attention:** Each set undergoes the scaled dot-product attention mechanism independently.

The outputs from all heads are concatenated and linearly transformed:

A visual representation of multi-head attention with h heads.

This allows the model to attend to information from different representation subspaces simultaneously, dramatically increasing expressiveness.

### 2.3 Masked Self-Attention

In the decoder, self-attention is modified to ensure that during training and inference, **the model does not have access to future tokens** in the output sequence. This is crucial for autoregressive generation, where predictions are made one token at a time based only on previous tokens.

Masked self-attention applies a mask to the attention scores before the softmax operation.

* Mask matrix (**M**) with *mᵢⱼ*= -∞ for *j* > *i* and *mᵢⱼ*= 0 otherwise.

This mask is a lower triangular matrix (including the diagonal for causal masking), setting future positions to negative infinity (or a very large negative number) so that their softmax probabilities become zero.

After softmax, future positions have zero probability, forcing the model to rely only on previously generated tokens.

This prevents the model from “cheating” by looking ahead, simulating the sequential generation process.

### 2.4 Cross-Attention in the Decoder

Following the masked self-attention sublayer in each decoder layer, there is a cross-attention (or encoder-decoder attention) sublayer. This mechanism allows the decoder to attend to the encoder’s output representations, integrating information from the input sequence into the output generation.

In **cross-attention**, the queries **Q**_dec come from the decoder’s previous sublayer output, while the keys **K**_enc and values **V**_enc are derived from the encoder’s final output. This is computed similarly to self-attention:

No masking is applied here, as the entire input sequence is available.

Cross-attention enables the decoder to focus on relevant parts of the input for each output token, such as aligning source and target words in translation tasks.

## 3. Feed-Forward Neural Networks (FFNNs)

After attention mechanisms, each layer applies a **position-wise Feed-Forward Neural Network (FFNN)** independently to each token. This provides additional transformative capacity beyond what attention alone can capture.

### 3.1 Structure and Activation Functions

The original Transformer used two linear transformations with ReLU activation:

Additionally, *d* is the model dimension (e.g., 512) and *d*_*ff* is the hidden dimension of the FFNN (typically 4 times larger, e.g., 2048, to expand and then compress the representation). The ReLU(∙)=max(0,∙) is the **Rectified Linear Unit (ReLU)** activation, which introduces non-linearity by setting negative values to zero.
> Modern transformer variants like BERT and GPT use GELU — an approximately smooth, differentiable activation that probabilistically gates inputs via the Gaussian CDF — because it improves gradient flow, handles negative values, aligns well with LayerNorm, and empirically outperforms ReLU, especially in expanded feed-forward layers.

### 3.2 Residual Connections (Skip Connections)

Residual (or skip) connections are integral to both the attention and FFNN sublayers. They allow the model to learn incremental refinements by adding the input directly to the sublayer output:

Residual connections enable the training of very deep networks (e.g., 6–12 layers in standard Transformers, up to hundreds in scaled variants) by providing shortcut paths for gradients, mitigating vanishing gradient issues.

Skip Connections and LayerNorm.

### 3.3 Layer Normalization

Layer Normalization (**LayerNorm**) is a crucial component in the Transformer architecture, applied after each sublayer in conjunction with residual connections. It normalizes the activations across the feature dimension for each individual token in the sequence, helping to stabilize the training process and improve gradient flow through deep networks.

Mathematically, for a vector **x** ∈ ℝ*ᵈ* (representing the features for a single token), LayerNorm computes:

In the Transformer, LayerNorm is applied after adding the residual connection: LayerNorm(**x**+sublayer(**x**)). This “**post-norm**” formulation (as opposed to “pre-norm” variants in some later models) helps mitigate issues like vanishing or exploding gradients in deep stacks of layers.
> ***Batch Normalization is ill-suited for Transformers*** due to its reliance on batch statistics, which are distorted by variable-length sequences and padding, whereas LayerNorm normalizes per token independently, ensuring stability and compatibility with attention mechanisms.

## 4. Positional Encoding

Since the self-attention mechanism in Transformers treats all positions in the input sequence equally — without any inherent notion of order or sequentiality — **positional encodings are essential to provide the model with information** about the relative or absolute positions of tokens. Without this, the model would be permutation-invariant, unable to distinguish between different arrangements of the same tokens, which is critical for understanding sequence-based data like language.

### 4.1 Sinusoidal Positional Encoding

The original Transformer paper proposes fixed sinusoidal positional encodings, which are added element-wise to the input token embeddings before they are fed into the encoder or decoder. These encodings use sine and cosine functions of different frequencies to create unique patterns for each position. For a token at position pos in the sequence and for dimension *i* (where 0 ≤ *i* < *d* and *d* = *d_model*​ is the embedding dimension), the positional encoding PE(pos, *i*) is defined as:

Here, pos ranges from 0 to the maximum sequence length minus one (*n*-1), and *i* ranges from 0 to ⌊*d*/2⌋−1. The denominator 10000^(2*i*/*d*) creates a geometric progression of wavelengths, starting from short periods for lower dimensions and increasing to longer periods for higher dimensions.

Sinusoidal Positional Encoding Matrix (**PE**).

In practice, the positional encoding matrix **PE** as shown above is precomputed for a maximum sequence length *n* (e.g., 512) and added to the token embeddings:

where **X** is the matrix of token embeddings, and **PE** has the same shape.

[Source](https://datascience.stackexchange.com/questions/55901/in-a-transformer-model-why-does-one-sum-positional-encoding-to-the-embedding-ra)

### 4.2 Advantages of Sinusoidal Positional Encodings:

Sinusoidal positional encodings offer four key advantages:

1. They enable extrapolation to longer sequences due to their periodic and continuous nature;- They inherently encode relative position information through linear combinations of sine and cosine functions;- Their values are bounded between –1 and 1, aligning well with normalized embeddings; and- They are fixed (non-learnable), avoiding extra parameters and reducing overfitting risk.

An example for a small embedding dimension *d* = 4. The positions 0 to 3 illustrates the uniqueness:

* **Position 0**: [sin(0/10000⁰), cos(0/10000⁰), sin(0/10000^{2/4}), cos(0/10000^{2/4})] ≈ **[0, 1, 0, 1]*** **Position 1**: ≈ **[0.84, 0.54, 0.01, 1.0]*** **Position 2**: ≈ **[0.91, -0.43, 0.02, 1.0]*** **Position 3**: ≈ **[0.14, -0.99, 0.03, 1.0]**

These distinct vectors ensure that the model can differentiate positional contexts.

## 5. Training of Transformer

Training a Transformer model involves optimizing its parameters to minimize a loss function on a given task, typically using large-scale datasets and computational resources. The original Transformer was designed for sequence-to-sequence tasks like machine translation, but the principles extend to various applications, including self-supervised pre-training in modern variants like BERT and GPT.

### 5.1 Objective and Loss Function

For sequence-to-sequence tasks, the model is trained end-to-end using teacher forcing during the decoder phase, where the ground-truth output sequence is shifted right and fed as input. The primary loss is the cross-entropy loss (or negative log-likelihood) over the predicted token probabilities:

where *yₜ*​ is the target token at position t, *y*_{<*t*}​ are previous tokens, and **X** is the input sequence. To improve generalization, label smoothing is often applied, softening the one-hot target distribution to a mixture with uniform noise (e.g., smoothing factor of 0.1), which prevents overconfidence in predictions.
> In autoregressive models like GPT, the objective is next-token prediction on unlabeled text, using the same cross-entropy loss but without an encoder-decoder split. For bidirectional models like BERT, masked language modeling (MLM) is used, where random tokens are masked, and the model predicts them based on context.

### 5.2 Optimization

Transformers are optimized using variants of stochastic gradient descent, with AdamW (Adam optimizer with weight decay) being the most common due to its adaptive learning rates and momentum. The original paper uses Adam with β1=0.9, β2=0.98, and ϵ=10−9.

A key innovation is the learning rate schedule with warmup and decay:

This starts with a linear warmup (e.g., over 10,000 steps) to stabilize initial training, followed by inverse square root decay to allow fine-grained updates later. Typical peak learning rates range from 0.0001 to 0.001, depending on model size.

### 5.3 Performance on Machine Translation

The Transformer model was evaluated on **standard machine translation benchmarks**, demonstrating superior performance compared to prior recurrent and convolutional models. On the WMT 2014 English-to-German dataset, the base Transformer achieved a BLEU score of 27.3, while the larger “big” variant scored **28.4**, surpassing the previous state-of-the-art, including ensembles, by over 2 BLEU points. For example, it outperformed GNMT + RL Ensemble (26.30 BLEU) and ConvS2S Ensemble (26.36 BLEU).

On the WMT 2014 English-to-French dataset, the base model scored 38.1 BLEU, and the big model reached **41.8** BLEU, establishing a new single-model state-of-the-art. This outperformed all previously published single models at less than a quarter of the training cost of the prior best, though ensembles like GNMT + RL (41.16 BLEU) and ConvS2S (41.29 BLEU) were slightly higher. These results highlight the Transformer’s efficiency and effectiveness, achieving better quality with faster training times due to its parallel architecture.

## 6. Conclusion

The Transformer architecture has fundamentally transformed the landscape of machine learning, particularly in processing sequential data. By replacing traditional recurrent mechanisms with self-attention, it has enabled unprecedented efficiency, scalability, and performance across a wide array of domains. From its core components like multi-head attention, positional encodings, and feed-forward networks to advanced training techniques and optimizations, the Transformer exemplifies how innovative design can overcome longstanding challenges such as long-range dependencies and computational bottlenecks.

Transformer 模型在机器翻译领域取得了卓越的成果，并在 BERT 和 GPT 等先进模型中扮演着基础性角色，这充分证明了它持续推动着人工智能的发展。展望未来，对各种变体的持续研究——例如，针对二次复杂度问题的高效注意力机制（如稀疏注意力或线性注意力）——以及与其他模态的集成（如多模态 Transformer）有望带来更强大的功能。对于研究人员、从业者和爱好者而言，理解 Transformer 模型至关重要，因为它仍然是现代深度学习的基石。探索其各种实现方式并对其组件进行实验，将有助于我们更深入地了解这个强大的框架。