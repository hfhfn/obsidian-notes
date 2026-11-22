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
---

# Milvus 向量数据库架构和系统设计

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/-hKHbHA0KKI" title="Milvus 向量数据库架构和系统设计" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

<sub>[在 YouTube 打开](https://www.youtube.com/watch?v=-hKHbHA0KKI)</sub>

## 产物

### 思维导图

```mermaid
mindmap
  root((Milvus向量数据库架构解析))
    底层核心概念
      向量与语义理解
        多模态转换
          文本图像音视频转换
          浮点数组向量生成
        高维空间距离计算
          空间近邻点相似度
          跨模态语义关联匹配
      向量与标量结合
        混合检索机制
          向量特征相似度比对
          传统结构化条件过滤
        元数据管理
          ID与上传者标识
          分类标签与宽高比
      核心索引技术
        标量传统索引
          B+树数字大小比较
          倒排索引字段过滤
        近似最近邻索引
          分层导航小世界 HNSW
          聚类量化压缩 IVFPQ
    存储组织结构
      数据存储单元
        数据段 Segment
          向量特征独立成列
          标量字段打包逻辑
        动态写入区
          Growing Segment 内存区
          支持未建索引直接查
        固化持久化区
          Sealed Segment 封存
          索引与原始数据分离
      逻辑组织层级
        业务分区 Partition
          表情包风景照分类
          分区裁剪提升效率
        逻辑表 Collection
          关系型数据库表映射
          统一管理分段组件
      后台数据优化
        小文件合并 Compaction
          碎片段紧凑化处理
          文件数量稳定控制
        后台异步构建索引
          ANN向量索引生成
          对象存储回传机制
    分布式集群架构
      核心设计原则
        数据分片机制
          主键哈希均匀分发
          单机容量突破限制
        存算分离架构
          S3对象存储持久化
          计算节点按需加载
      专业节点分工
        网关接入 Proxy
          统一对接读写请求
          结果汇总返回应用
        协调层 Coordinator
          集群状态元数据管理
          ETCD一致性存储
        读写分离节点
          Data Node 消费写入
          Query Node 内存检索
          Index Node 构建索引
      高可用与容灾
        预写日志机制 WAL
          分布式消息队列削峰
          消费位点断点续读
        多副本查询容灾
          多节点内存备份
          故障自动流量切换
    典型业务链路
      写入业务链路
        特征提取与打包
          图像模型生成向量
          SDK封装标量字段
        异步写入与固化
          消息队列快速响应
          内存写入与定期Flush
      混合检索链路
        并发分发检索
          Proxy路由分发请求
          向量与标量索引交集
        全局重排返回
          局部结果汇总归并
          相似度排序输出
    AI时代技术定位
      大模型外挂组件
        长期记忆存储库
        动态模糊匹配中枢
      传统关系库互补
        传统库管理严谨交易
        向量库处理模糊匹配
```

### 信息图

<a href="_assets/Milvus 向量数据库架构和系统设计/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/Milvus 向量数据库架构和系统设计/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

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
