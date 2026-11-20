---
created: '2026-08-05T10:10:15+08:00'
modified: '2026-08-05T10:10:15+08:00'
---

# CLIP 和 SigLIP 简介：革新多模态学习

**如果您还不是 Medium 的订阅用户，**[**请点击此处阅读全文**](https://medium.com/@lmpo/an-introduction-to-clip-and-siglip-revolutionizing-multimodal-learning-016cfe6e4182?sk=a9bf055999953937f9ac96de5c88639a)**。**

近年来，人工智能领域在多模态学习方面取得了显著进展，该领域训练的模型能够**理解并连接不同数据类型**（**例如图像和文本）**的信息。其中最具影响力的成果包括 OpenAI 的**CLIP（对比语言-图像预训练）**和 Google 的**SigLIP（用于语言-图像预训练的 Sigmoid 损失）**。这些模型重新定义了机器解释和连接视觉和文本信息的方式，从而实现了从图像分类到零样本学习等一系列应用。本文将对 CLIP 和 SigLIP 进行技术概述，包括它们的架构、训练范式和主要区别。

## 1. CLIP：对比语言-图像预训练（2021）

[**CLIP**](https://arxiv.org/pdf/2103.00020)是OpenAI于2021年推出的创新模型，它**学习在共享的嵌入空间中对齐图像和文本表示**。与依赖特定任务标记数据集的传统监督学习方法不同，，无需针对特定任务**进行微调即可泛化到各种任务中。**


### 1.1 CLIP架构

CLIP 由两个主要部分组成：

1. **图像编码器**：一种视觉模型，通常是 Vision Transformer (ViT) 或像 ResNet 这样的卷积神经网络，它将图像转换为固定大小的向量嵌入。- **文本编码器**：一种基于 Transformer 的语言模型（类似于 BERT 或 GPT 架构），它将文本描述编码成与图像嵌入维度相同的向量嵌入。

这些编码器旨在将图像和文本映射到共享的潜在空间中，其中语义相关的图像对（例如，一张狗的图像和“一张狗的照片”的标题）彼此靠近，而不相关的图像对则彼此远离。

### 1.2 CLIP 培训目标

CLIP 使用从互联网抓取的大量图像-文本对数据集（约 4 亿对）进行训练。训练过程采用受**InfoNCE（噪声对比估计）**启发的对比损失函数。对于一批*N 个*图像-文本对：

* The model computes the **cosine similarity** between all *N*×*N* combinations of image and text embeddings.* The goal is to maximize the similarity between the *N* correct (matching) pairs while minimizing the similarity between th *N*² — Nincorrect (non-matching) pairs.* This is achieved by optimizing a symmetric cross-entropy loss over the similarity scores.

Mathematically, for a batch of image embeddings {*I*₁,*I*₂,…,*I*_*N*} and text embeddings {*T*₁,*T*₂,…,*T_N*}, the loss for the image-to-text direction is:

Two losses are computed for image-to-text and text-to-image directions, and the total loss is the average of the two. Here, *τ* is a temperature parameter that controls the softness of the distribution. **This symmetric formulation ensures that both modalities (images and texts) are jointly optimized to align their representations effectively.**

### 1.3 CLIP Zero-Shot Capabilities

**CLIP’s strength lies in its zero-shot learning ability**. After pretraining, it can perform tasks like image classification by constructing prompts (e.g., “a photo of a [class]”) and comparing the image embedding to the text embeddings of possible classes, without requiring task-specific training data.

Zero-shot CLIP is much more robust to distribution shift than standard ImageNet models. (Left) An ideal robust model (dashed line) performs equally well on the ImageNet distribution and on other natural image distributions. Zero-shot CLIP models shrink this “robustness gap” by up to 75%. Linear fits on logit transformed values are shown with bootstrap estimated 95% confidence intervals. (Right) Visualizing distribution shift for bananas, a class shared across 5 of the 7 natural distribution shift datasets. The performance of the best zero-shot CLIP model, ViT-L/14@336px, is compared with a model that has the same performance on the ImageNet validation set, ResNet-101. ([Source](https://arxiv.org/pdf/2103.00020))

## 2. SigLIP: Sigmoid Loss for Language-Image Pretraining (2023)

[**SigLIP**](https://arxiv.org/pdf/2303.15343), introduced by Google Research, **builds upon the foundation laid by CLIP but introduces a key innovation in the training objective**. While CLIP uses a softmax-based contrastive loss, **SigLIP adopts a pairwise sigmoid loss**, which simplifies the training process and improves efficiency and performance, especially on large-scale datasets.

<https://blog.ritwikraha.dev/choosing-between-siglip-and-clip-for-language-image-pretraining>

### 2.1 SigLIP Architecture

SigLIP retains a similar dual-encoder setup to CLIP:

* **Image Encoder**: A Vision Transformer or another vision backbone.* **Text Encoder**: A transformer-based language model.

The architecture is largely agnostic to the specific choice of encoders, allowing flexibility in scaling or adapting to different domains.

### 2.2 SigLIP Training Objective

SigLIP departs from CLIP by **replacing the contrastive loss with a sigmoid-based loss function**. For a batch of *N* image-text pairs:

* Each pair (*Iᵢ* , *Tᵢ*) is treated as a positive example with a target label of 1.* All other combinations (*Iᵢ* , *Tⱼ*​) where *i* ≠ *j* are treated as negative examples with a target label of 0.

The model computes the cosine similarity *Iᵢ* ⋅ *Tⱼ*​ for every possible pair and applies a sigmoid function to convert these similarity scores into probabilities that predict whether a given image-text pair matches. The loss is then calculated as the binary cross-entropy between the predicted probabilities and the corresponding target labels, which can be expressed mathematically as:

This pairwise formulation eliminates the need for normalization across the entire batch, as required in CLIP’s softmax-based contrastive loss. By doing so, SigLIP simplifies computations and enhances stability, particularly when scaling to larger batch sizes.

This pairwise approach eliminates the need for normalization across the entire batch, as in CLIP’s softmax loss, making it computationally simpler and more stable when scaling to larger batch sizes.

### Advantages of SigLIP

* **Efficiency**: The sigmoid loss decouples the loss computation across pairs, enabling better parallelism and reducing memory overhead compared to CLIP’s batch-wide normalization.* **Robustness**: SigLIP has shown improved performance on challenging datasets, potentially due to its ability to handle noisy or imbalanced data more effectively.* **Scalability**: The simplified loss function facilitates training on even larger datasets, such as Google’s internal corpus of billions of image-text pairs.

### Key Differences Between CLIP and SigLIP

While CLIP laid the groundwork for multimodal learning, SigLIP refines the approach by optimizing the loss function for efficiency and scalability, making it particularly suited for industrial-scale applications.

## 3. Multimodal Large Language Models (MLLMs)

The advent of CLIP and SigLIP has significantly influenced the development of multimodal large language models (MLLMs), which **integrate vision and language capabilities into a unified framework**. These models leverage the pre-trained image-text alignment capabilities of CLIP and SigLIP to enable tasks such as visual question answering (VQA), image captioning, and multimodal reasoning. Below, we explore how CLIP and SigLIP are applied in prominent MLLMs like LLaVA and others.

### 3.1 LLaVA: Language and Vision Assistant (2023)

**LLaVA (Large Language and Vision Assistant)**, developed by researchers at UC Berkeley and Microsoft, is a notable example of an MLLM that builds on CLIP. LLaVA combines CLIP’s vision encoder (typically a Vision Transformer) with a large language model (e.g., LLaMA or Vicuna) to process both images and text inputs.

LLaVA: <https://llava.hliu.cc/>

The architecture works as follows:

* **Image Processing**: CLIP’s pre-trained image encoder extracts visual embeddings from an input image.* **Projection Layer**: A linear or MLP-based projection layer maps the CLIP visual embeddings into the input space of the language model, ensuring compatibility between modalities.* **Text Integration**: The visual embeddings are concatenated or interleaved with text token embeddings, allowing the language model to reason over both inputs jointly.* **Fine-Tuning**: LLaVA is fine-tuned on **visual instruction-following datasets** (e.g., visual question answering or image captioning tasks) to adapt the combined model for downstream applications.

By leveraging CLIP’s zero-shot capabilities, LLaVA can generalize to unseen tasks with minimal fine-tuning, making it highly versatile for real-world applications like interactive chatbots that interpret images.

### 3.2 Other Well-Known MLLMs

CLIP and SigLIP have also been integrated into other prominent MLLMs, enhancing their multimodal capabilities:

* **BLIP-2 (Bootstrapped Language-Image Pretraining)**: Developed by Salesforce Research, BLIP-2 uses CLIP’s vision encoder to extract image features, which are then fed into a lightweight query transformer (Q-Former) before being processed by a language model like OPT or Flan-T5. This modular approach reduces computational overhead while maintaining strong performance on tasks like VQA and image-text retrieval.* **Flamingo**: Introduced by DeepMind, Flamingo employs CLIP’s vision encoder to process multiple images in a sequence, pairing them with a pre-trained language model (e.g., Chinchilla). Flamingo’s architecture includes a “Perceiver Resampler” to compress visual embeddings, enabling efficient handling of long visual contexts alongside text.* **SigLIP in Google’s Models**: While specific implementations may vary, SigLIP’s efficiency and robustness make it a natural fit for Google’s multimodal efforts, such as the Gemini family of models. SigLIP’s pairwise sigmoid loss allows these models to scale effectively on massive datasets, improving performance in tasks like image-grounded dialogue and content understanding.

<https://www.researchgate.net/figure/PaliGemmas-architecture-a-SigLIP-image-encoder-feeds-into-a-Gemma-decoder-LM_fig1_382146057>

### 3.3 Advantages of CLIP and SigLIP in MLLMs

* **Pre-Trained Alignment**: Both CLIP and SigLIP provide a strong starting point by offering pre-aligned image-text representations, reducing the need for extensive supervised data in downstream tasks.* **Flexibility**: Their encoder-based design allows seamless integration with various language models, enabling researchers to experiment with different architectures.* **Scalability**: SigLIP’s efficient loss function is particularly advantageous for MLLMs trained on vast multimodal datasets, while CLIP’s zero-shot capabilities enhance adaptability.

### 3.4 Challenges and Considerations

Despite their strengths, integrating CLIP and SigLIP into MLLMs comes with challenges. The fixed embedding space of CLIP may limit fine-grained reasoning, requiring additional projection layers or fine-tuning. Similarly, SigLIP’s focus on scalability might trade off some of CLIP’s zero-shot generalization in smaller-scale settings. Moreover, both models inherit biases from their internet-scraped training data, which can propagate into MLLM outputs, necessitating careful evaluation and debiasing strategies.

## Conclusion

CLIP and SigLIP represent milestones in multimodal AI, enabling machines to understand and connect visual and textual information in ways previously unimaginable. CLIP’s contrastive learning paradigm opened the door to zero-shot learning, while SigLIP’s sigmoid loss offers a more efficient and scalable evolution. Together, they underscore the power of joint image-text modeling and pave the way for future innovations in artificial intelligence. For researchers and practitioners, these models provide a robust foundation to explore the intersection of vision and language, driving progress in an increasingly multimodal world.

CLIP 和 SigLIP 的出现不仅拓展了多模态学习的边界，也为进一步探索不同数据模态的融合奠定了基础。随着这些模型的不断发展，其应用范围无疑将不断扩大，在医疗、教育、娱乐等领域开辟新的天地。多模态人工智能的征程才刚刚开始，CLIP 和 SigLIP 带来的创新仅仅是迈向机器能够真正以整体方式理解世界并与之互动的未来的第一步。