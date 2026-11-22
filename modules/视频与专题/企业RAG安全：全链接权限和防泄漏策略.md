---
title: "企业RAG安全：全链接权限和防泄漏策略"
tags:
  - video
  - notebooklm
notebook_id: "fbf4b75b-c7d2-43f9-868f-e6d150320fc8"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "notebooklm"
created: "2026-09-17"
---

# 企业RAG安全：全链接权限和防泄漏策略

> 由 NotebookLM 笔记本导出的产物集合。

## 产物

### 思维导图

<div class="mm-wrap"><div class="mm-root">企业级RAG全链路权限防泄密</div><ul class="mm-list mm-top"><li><details open><summary>核心安全陷阱</summary><ul class="mm-list"><li class="mm-leaf">权限颗粒度过粗 (文档级 vs 切片级)</li><li class="mm-leaf">同步延迟漏洞 (人员异动空窗期)</li><li class="mm-leaf">逻辑拼图攻击 (多点公开信息推导机密)</li><li class="mm-leaf">明文标签泄密 (元数据暴露组织架构)</li></ul></details></li><li><details open><summary>前置过滤体系</summary><ul class="mm-list"><li class="mm-leaf">实时调用统一权限中心</li><li class="mm-leaf">多维身份状态查询 (部门/职级/项目)</li><li class="mm-leaf">动态布尔过滤表达式注入</li><li class="mm-leaf">向量引擎索引层混合查询</li><li class="mm-leaf">无权限切片时强制断流</li></ul></details></li><li><details open><summary>后置校验体系</summary><ul class="mm-list"><li class="mm-leaf">溯元映射 (原切片支撑检查)</li><li class="mm-leaf">逐句密集比对</li><li class="mm-leaf">动态脱敏 (抹掉敏感实体)</li><li class="mm-leaf">预设安全模板替换</li></ul></details></li><li><details open><summary>切片级打标逻辑</summary><ul class="mm-list"><li class="mm-leaf">结构化版式解析 (识别章节目)</li><li class="mm-leaf">权限继承与复写机制</li><li class="mm-leaf">敏感特征探测/密集提升</li><li class="mm-leaf">元数据属性封装 (职级/业务线/保密期)</li></ul></details></li><li><details open><summary>深水区进阶架构</summary><ul class="mm-list"><li><details open><summary>权限向量隐视匹配</summary><ul class="mm-list"><li class="mm-leaf">消除明文标签</li><li class="mm-leaf">权向量编码器</li><li class="mm-leaf">复合特征向量融合</li><li class="mm-leaf">多维空间几何对齐</li></ul></details></li><li><details open><summary>前置意图识别网</summary><ul class="mm-list"><li class="mm-leaf">意图分类模型</li><li class="mm-leaf">逻辑探针痕迹检测</li><li class="mm-leaf">推理距离约束 (禁止跨域串联)</li></ul></details></li></ul></details></li><li><details open><summary>生产运维与工程底线</summary><ul class="mm-list"><li class="mm-leaf">MS级权限变更感知 (EventBus/Kafka)</li><li class="mm-leaf">漏斗式双校验 (粗筛保吞吐/精校保安全)</li><li class="mm-leaf">Fail-Secure 安全失效原则</li><li class="mm-leaf">故障熔断降级 (全公开只读模式)</li><li class="mm-leaf">宁可不答，绝不越权</li></ul></details></li></ul></div>

### 信息图

<a href="_assets/企业RAG安全：全链接权限和防泄漏策略/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/企业RAG安全：全链接权限和防泄漏策略/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BC%81%E4%B8%9ARAG%E5%AE%89%E5%85%A8%EF%BC%9A%E5%85%A8%E9%93%BE%E6%8E%A5%E6%9D%83%E9%99%90%E5%92%8C%E9%98%B2%E6%B3%84%E6%BC%8F%E7%AD%96%E7%95%A5/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/%E4%BC%81%E4%B8%9ARAG%E5%AE%89%E5%85%A8%EF%BC%9A%E5%85%A8%E9%93%BE%E6%8E%A5%E6%9D%83%E9%99%90%E5%92%8C%E9%98%B2%E6%B3%84%E6%BC%8F%E7%AD%96%E7%95%A5/slide-deck.pdf)</sub>


## 摘要

（在 NotebookLM 里点「摘要」复制正文粘到这里）
