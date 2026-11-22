---
title: "2023–2026 LLM架构的演进 Technical Roadmap"
tags:
  - video
  - notebooklm
notebook_id: "9ecbd7c7-459d-471d-969e-6d7e599ce993"
derived:
  - mind-map
platform: "notebooklm"
created: "2026-05-16"
---

# 2023–2026 LLM架构的演进 Technical Roadmap

> 由 NotebookLM 笔记本导出的产物集合。

## 产物

### 思维导图

<div class="mm-wrap"><div class="mm-root">2023-2026大模型架构演进全复盘</div><ul class="mm-list mm-top"><li><details open><summary>整体架构范式</summary><ul class="mm-list"><li class="mm-leaf">Encoder-only (2023年前主流)</li><li class="mm-leaf">Encoder-Decoder (翻译/混合模型)</li><li class="mm-leaf">Decoder-only (当前主流/GPT系)</li></ul></details></li><li><details open><summary>分词器 (Tokenizer)</summary><ul class="mm-list"><li class="mm-leaf">词表映射 (ID/Token转换)</li><li class="mm-leaf">大词表趋势 (节约算力/上下文增长)</li><li class="mm-leaf">语意向量 (Embedding/训练获得)</li></ul></details></li><li><details open><summary>位置编码 (Position Encoding)</summary><ul class="mm-list"><li class="mm-leaf">绝对位置编码 (Google早期)</li><li><details open><summary>旋转位置编码 (RoPE)</summary><ul class="mm-list"><li class="mm-leaf">相对位置表达</li><li class="mm-leaf">高频信息 (短距离/秒针)</li><li class="mm-leaf">低频信息 (长距离/时针)</li></ul></details></li><li><details open><summary>上下文长度扩展</summary><ul class="mm-list"><li class="mm-leaf">内差 (Interpolation)</li><li class="mm-leaf">外推 (Extrapolation)</li><li class="mm-leaf">YaRN (加权过渡方案)</li></ul></details></li><li class="mm-leaf">3D旋转位置编码 (多模态/视频)</li></ul></details></li><li><details open><summary>归一化技术 (Normalization)</summary><ul class="mm-list"><li class="mm-leaf">LayerNorm (均值与方差)</li><li class="mm-leaf">RMSNorm (几何平均/计算更快)</li><li><details open><summary>放置位置</summary><ul class="mm-list"><li class="mm-leaf">Post-norm (效果优/难训练)</li><li class="mm-leaf">Pre-norm (主流/易训练)</li></ul></details></li><li class="mm-leaf">QK Normalization (注意力数值稳定)</li></ul></details></li><li><details open><summary>注意力机制优化 (Attention)</summary><ul class="mm-list"><li><details open><summary>压缩与头数优化</summary><ul class="mm-list"><li class="mm-leaf">MQA (共享KV)</li><li class="mm-leaf">GQA (分组共享KV)</li><li class="mm-leaf">MLA (低秩压缩注意力)</li></ul></details></li><li><details open><summary>窗口与稀疏</summary><ul class="mm-list"><li class="mm-leaf">SWA (滑窗注意力)</li><li class="mm-leaf">稀疏注意力 (快筛)</li></ul></details></li><li><details open><summary>计算效率</summary><ul class="mm-list"><li class="mm-leaf">线性注意力 (复杂度降至N)</li><li class="mm-leaf">Flash Attention (硬件访存优化)</li></ul></details></li></ul></details></li><li><details open><summary>FFN与激活函数</summary><ul class="mm-list"><li><details open><summary>混合专家模型 (MoE)</summary><ul class="mm-list"><li class="mm-leaf">Router (路由机制)</li><li class="mm-leaf">Shared Experts (共享专家)</li></ul></details></li><li><details open><summary>激活函数演进</summary><ul class="mm-list"><li class="mm-leaf">ReLU (非平滑)</li><li class="mm-leaf">GeLU (平滑改进)</li><li class="mm-leaf">Swish/SiLU (当前主流平滑函数)</li></ul></details></li></ul></details></li><li><details open><summary>残差连接 (Residual)</summary><ul class="mm-list"><li class="mm-leaf">标准残差连接 (ResNet方案)</li><li class="mm-leaf">多车道残差 (DeepNet)</li><li class="mm-leaf">注意力残差优化</li></ul></details></li></ul></div>


## 摘要

（在 NotebookLM 里点「摘要」复制正文粘到这里）
