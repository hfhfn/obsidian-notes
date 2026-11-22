---
title: "优化RAG检索：查询重写工程指南"
tags:
  - video
  - notebooklm
notebook_id: "6360baf7-3c32-42da-8b26-75bb28320628"
derived:
  - mind-map
  - slide-deck
platform: "notebooklm"
created: "2026-06-06"
---

# 优化RAG检索：查询重写工程指南

> 由 NotebookLM 笔记本导出的产物集合。

## 产物

### 思维导图

<div class="mm-wrap"><div class="mm-root">RAG系统Query改写技术</div><ul class="mm-list mm-top"><li><details open><summary>本质动机</summary><ul class="mm-list"><li class="mm-leaf">语义鸿沟 (口语与专业文档差异)</li><li class="mm-leaf">意图模糊 (背景信息缺失)</li><li class="mm-leaf">上下文断层 (多轮对话指代不明)</li></ul></details></li><li><details open><summary>核心技术路径</summary><ul class="mm-list"><li><details open><summary>HyDE (语义增强型)</summary><ul class="mm-list"><li class="mm-leaf">生成假答案</li><li class="mm-leaf">答案对答案匹配</li></ul></details></li><li><details open><summary>任务分解型</summary><ul class="mm-list"><li class="mm-leaf">复杂问题拆解</li><li class="mm-leaf">原子问题检索</li></ul></details></li><li><details open><summary>上下文补全型</summary><ul class="mm-list"><li class="mm-leaf">对话历史提取</li><li class="mm-leaf">实体消歧/还原</li></ul></details></li></ul></details></li><li><details open><summary>工程落地策略</summary><ul class="mm-list"><li><details open><summary>性能优化</summary><ul class="mm-list"><li class="mm-leaf">微调小模型</li><li class="mm-leaf">异步并行检索</li></ul></details></li><li><details open><summary>稳定性控制</summary><ul class="mm-list"><li class="mm-leaf">防止查询漂移</li><li class="mm-leaf">相似度熔断机制</li></ul></details></li><li><details open><summary>成本管理</summary><ul class="mm-list"><li class="mm-leaf">意图路由分流</li><li class="mm-leaf">高阶引擎按需开启</li></ul></details></li></ul></details></li><li><details open><summary>评估与优化闭环</summary><ul class="mm-list"><li class="mm-leaf">标准化测试集 (Ground Truth)</li><li class="mm-leaf">量化指标 (检索命中率)</li><li class="mm-leaf">Bad Case 反馈链路</li><li class="mm-leaf">Prompt/模型微调</li></ul></details></li></ul></div>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BC%98%E5%8C%96RAG%E6%A3%80%E7%B4%A2%EF%BC%9A%E6%9F%A5%E8%AF%A2%E9%87%8D%E5%86%99%E5%B7%A5%E7%A8%8B%E6%8C%87%E5%8D%97/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BC%98%E5%8C%96RAG%E6%A3%80%E7%B4%A2%EF%BC%9A%E6%9F%A5%E8%AF%A2%E9%87%8D%E5%86%99%E5%B7%A5%E7%A8%8B%E6%8C%87%E5%8D%97/slide-deck.pdf)</sub>


## 摘要

（在 NotebookLM 里点「摘要」复制正文粘到这里）
