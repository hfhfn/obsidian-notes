---
title: "From Transformer to LLM: 进化之路"
tags:
  - video
  - notebooklm
notebook_id: "2d96ef54-6366-4ac3-9f56-6241d78f297e"
source_url: "https://www.youtube.com/watch?v=MusyyIW2dro"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "youtube"
created: "2026-08-30"
---

# From Transformer to LLM: 进化之路

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/MusyyIW2dro" title="From Transformer to LLM: 进化之路" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

<sub>[在 YouTube 打开](https://www.youtube.com/watch?v=MusyyIW2dro)</sub>

## 产物

### 思维导图

```mermaid
mindmap
  root((从 Transformer 到大模型原理与演进))
    底层本质
      通用函数形式
      输入/输出定义 （文本预测）
      神经网络权重训练
    文本数字化过程
      分词 （Tokenization）
      词源 （Token）
      词嵌入 （Embedding）
      嵌入矩阵 （Embedding Matrix）
    Transformer 核心架构 （Block）
      注意力机制 （Attention）
        加权求和获取上下文
        QKV 向量 （Query, Key, Value）
        多头注意力 （MHA）
      前馈神经网络 （FFN）
        升维与降维特征提取
      辅助组件
        位置编码 （Positional Encoding）
        残差连接 （Residual Connection）
        归一化 （Layer/RMS Normalization）
      输出层
        线性投影 （Linear Projection）
        Softmax （概率转换）
    训练与智力涌现
      训练阶段
        预训练 （Pre-train, 自监督）
        监督微调 （SFT）
        强化学习 （RLHF/RLVR）
      智力表现
        少样本学习 （Few-shot）
        思维链 （CoT）
    应用层与 Agent 演进
      交互概念
        提示词 （Prompt）
        上下文与记忆 （Context/Memory）
      智能体 （Agent）
        工具与函数调用 （Function Calling）
        检索增强生成 （RAG）
        模型上下文协议 （MCP）
      工程化与流程
        工作流 （Workflow）
        技能 （Skill）
        子智能体 （Sub-agent）
    现代架构改良路线
      混合专家模型 （MoE/DeepSeek-MoE）
      稀疏/线性注意力 （MQA/GQA/MLA/Mamba）
      旋转位置编码 （RoPE）
      残差连接优化 （DeepSeek-V3）
```

### 信息图

<a href="_assets/From Transformer to LLM_ 进化之路/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/From Transformer to LLM_ 进化之路/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/From%20Transformer%20to%20LLM_%20%E8%BF%9B%E5%8C%96%E4%B9%8B%E8%B7%AF/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/From%20Transformer%20to%20LLM_%20%E8%BF%9B%E5%8C%96%E4%B9%8B%E8%B7%AF/slide-deck.pdf)</sub>


## 摘要

提供的源文本逐字稿对 Transformer 
架构和大语言模型进行了全面且通俗易懂的拆解，解释了从基础神经网络到 tokenization
和 vector embeddings 
的一切内容。它通过强调输入和输出的清晰定义简化了复杂的数学概念，并详细阐述了 
attention 机制与 QKV 向量背后的核心原理。此外，文中还探讨了 Retrieval-Augmented
Generation (RAG)、AI agents 以及 post-training 
方法等先进技术如何提升模型的实用性。最后，它回顾了语言模型的历史演进与架构改进
，指出虽然像 positional encoding 和 normalization 
这类次要组件得到了广泛优化，但结构性创新已基本进入平台期。
