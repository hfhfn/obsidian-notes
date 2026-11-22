---
title: "2023–2026 LLM架构的演进 Technical Roadmap"
tags:
  - video
  - notebooklm
notebook_id: "9ecbd7c7-459d-471d-969e-6d7e599ce993"
source_url: "https://www.youtube.com/watch?v=jMz1NT4xScc"
derived:
  - mind-map
platform: "youtube"
created: "2026-05-16"
---

# 2023–2026 LLM架构的演进 Technical Roadmap

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/jMz1NT4xScc" title="2023–2026 LLM架构的演进 Technical Roadmap" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

<sub>[在 YouTube 打开](https://www.youtube.com/watch?v=jMz1NT4xScc)</sub>

## 产物

### 思维导图

<div class="mm-wrap" data-mm="1" data-mm-title="2023–2026 LLM架构的演进 Technical Roadmap"><div class="mm-toolbar"><button data-mm-act="fit">适应窗口</button><button data-mm-act="expand">全部展开</button><button data-mm-act="collapse">折叠到底</button><span class="mm-sep"></span><label>字号 <input class="mm-font" type="range" min="11" max="24" value="15"></label><label>间距 <input class="mm-space" type="range" min="4" max="40" value="12"></label><span class="mm-sep"></span><button data-mm-act="full">全屏</button><button data-mm-act="svg">导出</button></div><svg class="mm-canvas"></svg><div class="mm-hint">拖动平移 · 滚轮缩放 · 点击节点折叠</div><script type="application/json" class="mm-data">{"name": "2023-2026大模型架构演进全复盘", "children": [{"name": "整体架构范式", "children": [{"name": "Encoder-only (2023年前主流)"}, {"name": "Encoder-Decoder (翻译/混合模型)"}, {"name": "Decoder-only (当前主流/GPT系)"}]}, {"name": "分词器 (Tokenizer)", "children": [{"name": "词表映射 (ID/Token转换)"}, {"name": "大词表趋势 (节约算力/上下文增长)"}, {"name": "语意向量 (Embedding/训练获得)"}]}, {"name": "位置编码 (Position Encoding)", "children": [{"name": "绝对位置编码 (Google早期)"}, {"name": "旋转位置编码 (RoPE)", "children": [{"name": "相对位置表达"}, {"name": "高频信息 (短距离/秒针)"}, {"name": "低频信息 (长距离/时针)"}]}, {"name": "上下文长度扩展", "children": [{"name": "内差 (Interpolation)"}, {"name": "外推 (Extrapolation)"}, {"name": "YaRN (加权过渡方案)"}]}, {"name": "3D旋转位置编码 (多模态/视频)"}]}, {"name": "归一化技术 (Normalization)", "children": [{"name": "LayerNorm (均值与方差)"}, {"name": "RMSNorm (几何平均/计算更快)"}, {"name": "放置位置", "children": [{"name": "Post-norm (效果优/难训练)"}, {"name": "Pre-norm (主流/易训练)"}]}, {"name": "QK Normalization (注意力数值稳定)"}]}, {"name": "注意力机制优化 (Attention)", "children": [{"name": "压缩与头数优化", "children": [{"name": "MQA (共享KV)"}, {"name": "GQA (分组共享KV)"}, {"name": "MLA (低秩压缩注意力)"}]}, {"name": "窗口与稀疏", "children": [{"name": "SWA (滑窗注意力)"}, {"name": "稀疏注意力 (快筛)"}]}, {"name": "计算效率", "children": [{"name": "线性注意力 (复杂度降至N)"}, {"name": "Flash Attention (硬件访存优化)"}]}]}, {"name": "FFN与激活函数", "children": [{"name": "混合专家模型 (MoE)", "children": [{"name": "Router (路由机制)"}, {"name": "Shared Experts (共享专家)"}]}, {"name": "激活函数演进", "children": [{"name": "ReLU (非平滑)"}, {"name": "GeLU (平滑改进)"}, {"name": "Swish/SiLU (当前主流平滑函数)"}]}]}, {"name": "残差连接 (Residual)", "children": [{"name": "标准残差连接 (ResNet方案)"}, {"name": "多车道残差 (DeepNet)"}, {"name": "注意力残差优化"}]}]}</script></div>


## 摘要

本文全面概述了 2023 
年以来大语言模型架构的演进，详细介绍了分词器、位置编码和注意力机制等关键技术组
件。它解释了现代模型如何将文本转换为数值表示，如何实现旋转位置编码以获取上下文
感知能力，以及如何利用归一化技术在训练期间保持数值稳定性。此外，该资料还探讨了
包括混合专家（Mixture-of-Experts）、激活函数和残差连接在内的各种优化，旨在提高
计算效率和扩展性能。最终，本教程梳理了基于 Transformer 
的系统的发展轨迹，阐明了结构上的优化改进如何持续提升当代人工智能的能力与效率。
