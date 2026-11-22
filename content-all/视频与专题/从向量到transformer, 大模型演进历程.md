---
title: "从向量到transformer, 大模型演进历程"
tags:
  - video
  - notebooklm
notebook_id: "1cd542b9-150f-4534-ad57-4bf16fa352ea"
source_url: "https://www.youtube.com/watch?v=j-PLWhTJVsc"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "youtube"
created: "2026-08-26"
---

# 从向量到transformer, 大模型演进历程

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/j-PLWhTJVsc" title="从向量到transformer, 大模型演进历程" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

<sub>[在 YouTube 打开](https://www.youtube.com/watch?v=j-PLWhTJVsc)</sub>

## 产物

### 思维导图

<div class="mm-wrap" data-mm="1" data-mm-title="从向量到transformer, 大模型演进历程"><div class="mm-toolbar"><button data-mm-act="fit">适应窗口</button><button data-mm-act="expand">全部展开</button><button data-mm-act="collapse">折叠到底</button><span class="mm-sep"></span><label>字号 <input class="mm-font" type="range" min="11" max="24" value="15"></label><label>间距 <input class="mm-space" type="range" min="4" max="40" value="12"></label><span class="mm-sep"></span><button data-mm-act="full">全屏</button><button data-mm-act="svg">导出</button></div><svg class="mm-canvas"></svg><div class="mm-hint">拖动平移 · 滚轮缩放 · 点击节点折叠</div><script type="application/json" class="mm-data">{"name": "AI大模型背后的原理", "children": [{"name": "早期语言模型 (N-gram)", "children": [{"name": "核心思路：基于统计预测下一个词"}, {"name": "常见类型：二元、三元及N元模型"}, {"name": "主要问题", "children": [{"name": "词语组合数量随N增加而膨胀"}, {"name": "无法覆盖所有合理的词语组合"}, {"name": "词语被视为独立符号，缺乏语义关联"}]}]}, {"name": "词向量 (Word Embedding)", "children": [{"name": "定义：高维空间坐标或带方向的向量"}, {"name": "计算方法：余弦相似度衡量语义相近度"}, {"name": "获取方式：计算机从海量文本语境中自动学习"}, {"name": "意义：将抽象语言转化为精确的数学计算"}]}, {"name": "前馈神经网络 (Feed-forward NN)", "children": [{"name": "结构：输入层、隐藏层、输出层 (Softmax)"}, {"name": "优势：具备泛化能力，能理解近义词组合"}, {"name": "局限性：固定输入窗口，无法处理长程信息"}]}, {"name": "循环神经网络 (RNN)", "children": [{"name": "核心机制：隐藏状态 (Hidden State) 作为记忆"}, {"name": "工作原理：逐个读取token，不断刷新迭代记忆"}, {"name": "优势：可处理任意长度的文本序列"}, {"name": "缺陷：长期依赖问题 (远距离信息易被覆盖/丢失)"}]}, {"name": "长短期记忆网络 (LSTM)", "children": [{"name": "核心改进：增加细胞状态 (Cell State) 长效通道"}, {"name": "门控机制", "children": [{"name": "遗忘门：删除无用旧信息"}, {"name": "输入门：写入有价值新信息"}, {"name": "输出门：提取特定信息参与当前预测"}]}, {"name": "训练本质：模型自动学习重要信息的留存规则"}, {"name": "存在问题", "children": [{"name": "顺序计算瓶颈：训练效率低"}, {"name": "传递路径长：远距离Token间联系不直接"}]}]}, {"name": "Transformer (现代大模型基础)", "children": [{"name": "核心：注意力机制 (Attention Mechanism)"}, {"name": "特点：支持并行计算，直接建立Token间关联"}]}]}</script></div>

### 信息图

<img src="_assets/从向量到transformer, 大模型演进历程/infographic.webp" alt="信息图" class="nlm-infographic nlm-zoomable" loading="lazy">

<sub>点图放大 · ESC 或点空白处关闭</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BB%8E%E5%90%91%E9%87%8F%E5%88%B0transformer%2C%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%BC%94%E8%BF%9B%E5%8E%86%E7%A8%8B/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BB%8E%E5%90%91%E9%87%8F%E5%88%B0transformer%2C%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%BC%94%E8%BF%9B%E5%8E%86%E7%A8%8B/slide-deck.pdf)</sub>


## 摘要

提供的逐字稿详细记录了用于预测文本的自然语言处理架构的时序演进历程。早期的统计
语言模型完全依赖于词语组合的计数，这限制了它们理解新短语或语义相似性的能力。为
了克服这一限制，研究人员开发了词向量，将词语表示为高维空间中的坐标，使模型能够
衡量语义关系。前馈神经网络利用这些向量来学习复杂的语言模式，尽管它们仍受到固定
输入窗口的限制。循环神经网络的引入允许模型通过维护隐藏状态来处理任意长度的序列
，但它们在处理长距离记忆依赖方面依然困难。这一局限性促成了长短期记忆网络的产生
，它融入了专门的门控机制和细胞状态，以便在更长的上下文中选择性地保留或丢弃信息
。最终，尽管这些技术进步逐步提升了文本理解能力，但顺序处理的瓶颈为 Transformer 
架构的发展铺平了道路。
