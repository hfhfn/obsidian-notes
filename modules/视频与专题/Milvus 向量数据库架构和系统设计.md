---
title: "Milvus 向量数据库架构和系统设计"
tags:
  - video
  - notebooklm
notebook_id: "9066ce02-0c78-45fb-89fd-03da432e9bd7"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "notebooklm"
created: "2026-09-30"
---

# Milvus 向量数据库架构和系统设计

> 由 NotebookLM 笔记本导出的产物集合。

## 产物

### 思维导图

<div class="mm-wrap"><div class="mm-root">Milvus向量数据库架构解析</div><ul class="mm-list mm-top"><li><details open><summary>底层核心概念</summary><ul class="mm-list"><li><details open><summary>向量与语义理解</summary><ul class="mm-list"><li><details><summary>多模态转换</summary><ul class="mm-list"><li class="mm-leaf">文本图像音视频转换</li><li class="mm-leaf">浮点数组向量生成</li></ul></details></li><li><details><summary>高维空间距离计算</summary><ul class="mm-list"><li class="mm-leaf">空间近邻点相似度</li><li class="mm-leaf">跨模态语义关联匹配</li></ul></details></li></ul></details></li><li><details open><summary>向量与标量结合</summary><ul class="mm-list"><li><details><summary>混合检索机制</summary><ul class="mm-list"><li class="mm-leaf">向量特征相似度比对</li><li class="mm-leaf">传统结构化条件过滤</li></ul></details></li><li><details><summary>元数据管理</summary><ul class="mm-list"><li class="mm-leaf">ID与上传者标识</li><li class="mm-leaf">分类标签与宽高比</li></ul></details></li></ul></details></li><li><details open><summary>核心索引技术</summary><ul class="mm-list"><li><details><summary>标量传统索引</summary><ul class="mm-list"><li class="mm-leaf">B+树数字大小比较</li><li class="mm-leaf">倒排索引字段过滤</li></ul></details></li><li><details><summary>近似最近邻索引</summary><ul class="mm-list"><li class="mm-leaf">分层导航小世界 HNSW</li><li class="mm-leaf">聚类量化压缩 IVFPQ</li></ul></details></li></ul></details></li></ul></details></li><li><details open><summary>存储组织结构</summary><ul class="mm-list"><li><details open><summary>数据存储单元</summary><ul class="mm-list"><li><details><summary>数据段 Segment</summary><ul class="mm-list"><li class="mm-leaf">向量特征独立成列</li><li class="mm-leaf">标量字段打包逻辑</li></ul></details></li><li><details><summary>动态写入区</summary><ul class="mm-list"><li class="mm-leaf">Growing Segment 内存区</li><li class="mm-leaf">支持未建索引直接查</li></ul></details></li><li><details><summary>固化持久化区</summary><ul class="mm-list"><li class="mm-leaf">Sealed Segment 封存</li><li class="mm-leaf">索引与原始数据分离</li></ul></details></li></ul></details></li><li><details open><summary>逻辑组织层级</summary><ul class="mm-list"><li><details><summary>业务分区 Partition</summary><ul class="mm-list"><li class="mm-leaf">表情包风景照分类</li><li class="mm-leaf">分区裁剪提升效率</li></ul></details></li><li><details><summary>逻辑表 Collection</summary><ul class="mm-list"><li class="mm-leaf">关系型数据库表映射</li><li class="mm-leaf">统一管理分段组件</li></ul></details></li></ul></details></li><li><details open><summary>后台数据优化</summary><ul class="mm-list"><li><details><summary>小文件合并 Compaction</summary><ul class="mm-list"><li class="mm-leaf">碎片段紧凑化处理</li><li class="mm-leaf">文件数量稳定控制</li></ul></details></li><li><details><summary>后台异步构建索引</summary><ul class="mm-list"><li class="mm-leaf">ANN向量索引生成</li><li class="mm-leaf">对象存储回传机制</li></ul></details></li></ul></details></li></ul></details></li><li><details open><summary>分布式集群架构</summary><ul class="mm-list"><li><details open><summary>核心设计原则</summary><ul class="mm-list"><li><details><summary>数据分片机制</summary><ul class="mm-list"><li class="mm-leaf">主键哈希均匀分发</li><li class="mm-leaf">单机容量突破限制</li></ul></details></li><li><details><summary>存算分离架构</summary><ul class="mm-list"><li class="mm-leaf">S3对象存储持久化</li><li class="mm-leaf">计算节点按需加载</li></ul></details></li></ul></details></li><li><details open><summary>专业节点分工</summary><ul class="mm-list"><li><details><summary>网关接入 Proxy</summary><ul class="mm-list"><li class="mm-leaf">统一对接读写请求</li><li class="mm-leaf">结果汇总返回应用</li></ul></details></li><li><details><summary>协调层 Coordinator</summary><ul class="mm-list"><li class="mm-leaf">集群状态元数据管理</li><li class="mm-leaf">ETCD一致性存储</li></ul></details></li><li><details><summary>读写分离节点</summary><ul class="mm-list"><li class="mm-leaf">Data Node 消费写入</li><li class="mm-leaf">Query Node 内存检索</li><li class="mm-leaf">Index Node 构建索引</li></ul></details></li></ul></details></li><li><details open><summary>高可用与容灾</summary><ul class="mm-list"><li><details><summary>预写日志机制 WAL</summary><ul class="mm-list"><li class="mm-leaf">分布式消息队列削峰</li><li class="mm-leaf">消费位点断点续读</li></ul></details></li><li><details><summary>多副本查询容灾</summary><ul class="mm-list"><li class="mm-leaf">多节点内存备份</li><li class="mm-leaf">故障自动流量切换</li></ul></details></li></ul></details></li></ul></details></li><li><details open><summary>典型业务链路</summary><ul class="mm-list"><li><details open><summary>写入业务链路</summary><ul class="mm-list"><li><details><summary>特征提取与打包</summary><ul class="mm-list"><li class="mm-leaf">图像模型生成向量</li><li class="mm-leaf">SDK封装标量字段</li></ul></details></li><li><details><summary>异步写入与固化</summary><ul class="mm-list"><li class="mm-leaf">消息队列快速响应</li><li class="mm-leaf">内存写入与定期Flush</li></ul></details></li></ul></details></li><li><details open><summary>混合检索链路</summary><ul class="mm-list"><li><details><summary>并发分发检索</summary><ul class="mm-list"><li class="mm-leaf">Proxy路由分发请求</li><li class="mm-leaf">向量与标量索引交集</li></ul></details></li><li><details><summary>全局重排返回</summary><ul class="mm-list"><li class="mm-leaf">局部结果汇总归并</li><li class="mm-leaf">相似度排序输出</li></ul></details></li></ul></details></li></ul></details></li><li><details open><summary>AI时代技术定位</summary><ul class="mm-list"><li><details open><summary>大模型外挂组件</summary><ul class="mm-list"><li class="mm-leaf">长期记忆存储库</li><li class="mm-leaf">动态模糊匹配中枢</li></ul></details></li><li><details open><summary>传统关系库互补</summary><ul class="mm-list"><li class="mm-leaf">传统库管理严谨交易</li><li class="mm-leaf">向量库处理模糊匹配</li></ul></details></li></ul></details></li></ul></div>

### 信息图

<a href="_assets/Milvus 向量数据库架构和系统设计/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/Milvus 向量数据库架构和系统设计/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/Milvus%20%E5%90%91%E9%87%8F%E6%95%B0%E6%8D%AE%E5%BA%93%E6%9E%B6%E6%9E%84%E5%92%8C%E7%B3%BB%E7%BB%9F%E8%AE%BE%E8%AE%A1/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/Milvus%20%E5%90%91%E9%87%8F%E6%95%B0%E6%8D%AE%E5%BA%93%E6%9E%B6%E6%9E%84%E5%92%8C%E7%B3%BB%E7%BB%9F%E8%AE%BE%E8%AE%A1/slide-deck.pdf)</sub>


## 摘要

（在 NotebookLM 里点「摘要」复制正文粘到这里）
