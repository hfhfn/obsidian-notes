---
title: "Milvus 向量数据库架构和系统设计"
tags:
  - video
  - notebooklm
notebook_id: "9066ce02-0c78-45fb-89fd-03da432e9bd7"
source_url: "https://www.youtube.com/watch?v=-hKHbHA0KKI"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "youtube"
created: "2026-09-30"
mindmap-plugin: markmap
---

# Milvus 向量数据库架构和系统设计

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/-hKHbHA0KKI" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

[在源站打开](https://www.youtube.com/watch?v=-hKHbHA0KKI)

## 产物

### 思维导图

<div class="mm-wrap" data-mm="1" data-mm-title="Milvus 向量数据库架构和系统设计" data-mm-slug="milvu-向量数据库架构和系统设计"><div class="mm-toolbar"><button data-mm-act="fit">适应窗口</button><button data-mm-act="expand">全部展开</button><button data-mm-act="collapse">折叠到底</button><span class="mm-sep"></span><label>字号 <input class="mm-font" type="range" min="11" max="24" value="15"></label><label>间距 <input class="mm-space" type="range" min="4" max="40" value="12"></label><span class="mm-sep"></span><button data-mm-act="html" title="导出可交互 HTML">导出 HTML</button><button data-mm-act="svg" title="导出静态 SVG">导出 SVG</button><button data-mm-act="full">全屏</button></div><svg class="mm-canvas"></svg><div class="mm-hint">拖动平移 · 滚轮缩放 · 点击节点折叠</div><script type="application/json" class="mm-data">{"name": "Milvus向量数据库架构解析", "children": [{"name": "底层核心概念", "children": [{"name": "向量与语义理解", "children": [{"name": "多模态转换", "children": [{"name": "文本图像音视频转换"}, {"name": "浮点数组向量生成"}]}, {"name": "高维空间距离计算", "children": [{"name": "空间近邻点相似度"}, {"name": "跨模态语义关联匹配"}]}]}, {"name": "向量与标量结合", "children": [{"name": "混合检索机制", "children": [{"name": "向量特征相似度比对"}, {"name": "传统结构化条件过滤"}]}, {"name": "元数据管理", "children": [{"name": "ID与上传者标识"}, {"name": "分类标签与宽高比"}]}]}, {"name": "核心索引技术", "children": [{"name": "标量传统索引", "children": [{"name": "B+树数字大小比较"}, {"name": "倒排索引字段过滤"}]}, {"name": "近似最近邻索引", "children": [{"name": "分层导航小世界 HNSW"}, {"name": "聚类量化压缩 IVFPQ"}]}]}]}, {"name": "存储组织结构", "children": [{"name": "数据存储单元", "children": [{"name": "数据段 Segment", "children": [{"name": "向量特征独立成列"}, {"name": "标量字段打包逻辑"}]}, {"name": "动态写入区", "children": [{"name": "Growing Segment 内存区"}, {"name": "支持未建索引直接查"}]}, {"name": "固化持久化区", "children": [{"name": "Sealed Segment 封存"}, {"name": "索引与原始数据分离"}]}]}, {"name": "逻辑组织层级", "children": [{"name": "业务分区 Partition", "children": [{"name": "表情包风景照分类"}, {"name": "分区裁剪提升效率"}]}, {"name": "逻辑表 Collection", "children": [{"name": "关系型数据库表映射"}, {"name": "统一管理分段组件"}]}]}, {"name": "后台数据优化", "children": [{"name": "小文件合并 Compaction", "children": [{"name": "碎片段紧凑化处理"}, {"name": "文件数量稳定控制"}]}, {"name": "后台异步构建索引", "children": [{"name": "ANN向量索引生成"}, {"name": "对象存储回传机制"}]}]}]}, {"name": "分布式集群架构", "children": [{"name": "核心设计原则", "children": [{"name": "数据分片机制", "children": [{"name": "主键哈希均匀分发"}, {"name": "单机容量突破限制"}]}, {"name": "存算分离架构", "children": [{"name": "S3对象存储持久化"}, {"name": "计算节点按需加载"}]}]}, {"name": "专业节点分工", "children": [{"name": "网关接入 Proxy", "children": [{"name": "统一对接读写请求"}, {"name": "结果汇总返回应用"}]}, {"name": "协调层 Coordinator", "children": [{"name": "集群状态元数据管理"}, {"name": "ETCD一致性存储"}]}, {"name": "读写分离节点", "children": [{"name": "Data Node 消费写入"}, {"name": "Query Node 内存检索"}, {"name": "Index Node 构建索引"}]}]}, {"name": "高可用与容灾", "children": [{"name": "预写日志机制 WAL", "children": [{"name": "分布式消息队列削峰"}, {"name": "消费位点断点续读"}]}, {"name": "多副本查询容灾", "children": [{"name": "多节点内存备份"}, {"name": "故障自动流量切换"}]}]}]}, {"name": "典型业务链路", "children": [{"name": "写入业务链路", "children": [{"name": "特征提取与打包", "children": [{"name": "图像模型生成向量"}, {"name": "SDK封装标量字段"}]}, {"name": "异步写入与固化", "children": [{"name": "消息队列快速响应"}, {"name": "内存写入与定期Flush"}]}]}, {"name": "混合检索链路", "children": [{"name": "并发分发检索", "children": [{"name": "Proxy路由分发请求"}, {"name": "向量与标量索引交集"}]}, {"name": "全局重排返回", "children": [{"name": "局部结果汇总归并"}, {"name": "相似度排序输出"}]}]}]}, {"name": "AI时代技术定位", "children": [{"name": "大模型外挂组件", "children": [{"name": "长期记忆存储库"}, {"name": "动态模糊匹配中枢"}]}, {"name": "传统关系库互补", "children": [{"name": "传统库管理严谨交易"}, {"name": "向量库处理模糊匹配"}]}]}]}</script></div>

### 信息图

![信息图](_assets/Milvus%20向量数据库架构和系统设计/infographic.webp)

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/Milvus%20%E5%90%91%E9%87%8F%E6%95%B0%E6%8D%AE%E5%BA%93%E6%9E%B6%E6%9E%84%E5%92%8C%E7%B3%BB%E7%BB%9F%E8%AE%BE%E8%AE%A1/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/Milvus%20%E5%90%91%E9%87%8F%E6%95%B0%E6%8D%AE%E5%BA%93%E6%9E%B6%E6%9E%84%E5%92%8C%E7%B3%BB%E7%BB%9F%E8%AE%BE%E8%AE%A1/slide-deck.pdf)</sub>

## 摘要

所提供的来源全面解析了 Milvus 
向量数据库架构，解释了它如何通过将各种媒体转化为多维浮点向量来处理复杂的语义信
息。文中详细阐述了其层级化数据组织，将信息组织为表、分区和不可变的数据段，以优
化检索性能与存储效率。此外，说明中重点介绍了 Milvus 
的分布式系统设计，指出其采用存算分离、读写分离与消息队列来确保高可用性与弹性扩
展能力。通过将用于向量计算的近似最近邻索引与传统标量过滤相结合，该数据库有效地
弥合了模糊语义匹配与结构化数据查询之间的鸿沟。最终，来源将 Milvus 
定位为不可或缺的 AI 内存扩展，旨在补充而非替代传统的关系型数据库。
