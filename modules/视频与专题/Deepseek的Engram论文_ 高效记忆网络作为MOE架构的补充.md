---
title: "Deepseek的Engram论文: 高效记忆网络作为MOE架构的补充"
tags:
  - video
  - notebooklm
notebook_id: "77a108a2-22b0-46e5-a6d4-c6f10d8edbc7"
source_url: "https://www.youtube.com/watch?v=LOHYVlZ0cwM"
derived:
  - infographic
  - slide-deck
platform: "youtube"
created: "2026-01-24"
---

# Deepseek的Engram论文: 高效记忆网络作为MOE架构的补充

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/LOHYVlZ0cwM" title="Deepseek的Engram论文: 高效记忆网络作为MOE架构的补充" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

<sub>[在 YouTube 打开](https://www.youtube.com/watch?v=LOHYVlZ0cwM)</sub>

## 产物

### 信息图

<a href="_assets/Deepseek的Engram论文_ 高效记忆网络作为MOE架构的补充/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/Deepseek的Engram论文_ 高效记忆网络作为MOE架构的补充/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/Deepseek%E7%9A%84Engram%E8%AE%BA%E6%96%87_%20%E9%AB%98%E6%95%88%E8%AE%B0%E5%BF%86%E7%BD%91%E7%BB%9C%E4%BD%9C%E4%B8%BAMOE%E6%9E%B6%E6%9E%84%E7%9A%84%E8%A1%A5%E5%85%85/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/Deepseek%E7%9A%84Engram%E8%AE%BA%E6%96%87_%20%E9%AB%98%E6%95%88%E8%AE%B0%E5%BF%86%E7%BD%91%E7%BB%9C%E4%BD%9C%E4%B8%BAMOE%E6%9E%B6%E6%9E%84%E7%9A%84%E8%A1%A5%E5%85%85/slide-deck.pdf)</sub>


## 摘要

DeepSeek Engram 论文通过引入一种建立在 Memory Network 和 n-gram 
方法先前研究基础上的外部 memory lookup 
机制，解决了大语言模型中知识检索的高计算成本问题。通过高效的 hash 函数集成稀疏 
n-gram 
embedding，该架构允许模型即时检索事实性知识，而无需繁重的逐层计算。该方法成功将
模型大小与计算成本解耦，在遵循 Scaling Law 
原则的同时，提升了在知识密集型任务上的性能。此外，嵌入表在推理过程中可以卸载到 
CPU 内存中，为高效扩展 Transformer 的能力提供了一种精简可行的方式。
