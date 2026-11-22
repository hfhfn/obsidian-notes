---
title: "从向量到transformer, 大模型演进历程"
tags:
  - video
  - notebooklm
notebook_id: "1cd542b9-150f-4534-ad57-4bf16fa352ea"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "notebooklm"
created: "2026-08-26"
---

# 从向量到transformer, 大模型演进历程

> 由 NotebookLM 笔记本导出的产物集合。

## 产物

### 思维导图

<div class="mm-wrap"><div class="mm-root">AI大模型背后的原理</div><ul class="mm-list mm-top"><li><details open><summary>早期语言模型 (N-gram)</summary><ul class="mm-list"><li class="mm-leaf">核心思路：基于统计预测下一个词</li><li class="mm-leaf">常见类型：二元、三元及N元模型</li><li><details open><summary>主要问题</summary><ul class="mm-list"><li class="mm-leaf">词语组合数量随N增加而膨胀</li><li class="mm-leaf">无法覆盖所有合理的词语组合</li><li class="mm-leaf">词语被视为独立符号，缺乏语义关联</li></ul></details></li></ul></details></li><li><details open><summary>词向量 (Word Embedding)</summary><ul class="mm-list"><li class="mm-leaf">定义：高维空间坐标或带方向的向量</li><li class="mm-leaf">计算方法：余弦相似度衡量语义相近度</li><li class="mm-leaf">获取方式：计算机从海量文本语境中自动学习</li><li class="mm-leaf">意义：将抽象语言转化为精确的数学计算</li></ul></details></li><li><details open><summary>前馈神经网络 (Feed-forward NN)</summary><ul class="mm-list"><li class="mm-leaf">结构：输入层、隐藏层、输出层 (Softmax)</li><li class="mm-leaf">优势：具备泛化能力，能理解近义词组合</li><li class="mm-leaf">局限性：固定输入窗口，无法处理长程信息</li></ul></details></li><li><details open><summary>循环神经网络 (RNN)</summary><ul class="mm-list"><li class="mm-leaf">核心机制：隐藏状态 (Hidden State) 作为记忆</li><li class="mm-leaf">工作原理：逐个读取token，不断刷新迭代记忆</li><li class="mm-leaf">优势：可处理任意长度的文本序列</li><li class="mm-leaf">缺陷：长期依赖问题 (远距离信息易被覆盖/丢失)</li></ul></details></li><li><details open><summary>长短期记忆网络 (LSTM)</summary><ul class="mm-list"><li class="mm-leaf">核心改进：增加细胞状态 (Cell State) 长效通道</li><li><details open><summary>门控机制</summary><ul class="mm-list"><li class="mm-leaf">遗忘门：删除无用旧信息</li><li class="mm-leaf">输入门：写入有价值新信息</li><li class="mm-leaf">输出门：提取特定信息参与当前预测</li></ul></details></li><li class="mm-leaf">训练本质：模型自动学习重要信息的留存规则</li><li><details open><summary>存在问题</summary><ul class="mm-list"><li class="mm-leaf">顺序计算瓶颈：训练效率低</li><li class="mm-leaf">传递路径长：远距离Token间联系不直接</li></ul></details></li></ul></details></li><li><details open><summary>Transformer (现代大模型基础)</summary><ul class="mm-list"><li class="mm-leaf">核心：注意力机制 (Attention Mechanism)</li><li class="mm-leaf">特点：支持并行计算，直接建立Token间关联</li></ul></details></li></ul></div>

### 信息图

<a href="_assets/从向量到transformer, 大模型演进历程/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/从向量到transformer, 大模型演进历程/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BB%8E%E5%90%91%E9%87%8F%E5%88%B0transformer%2C%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%BC%94%E8%BF%9B%E5%8E%86%E7%A8%8B/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BB%8E%E5%90%91%E9%87%8F%E5%88%B0transformer%2C%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%BC%94%E8%BF%9B%E5%8E%86%E7%A8%8B/slide-deck.pdf)</sub>


## 摘要

（在 NotebookLM 里点「摘要」复制正文粘到这里）
