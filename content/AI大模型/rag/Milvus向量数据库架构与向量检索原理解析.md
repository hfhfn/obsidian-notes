---
title: Milvus向量数据库架构与向量检索原理解析
tags:
- AI大模型
- RAG
- 向量检索
created: '2026-09-01T23:47:34+08:00'
modified: '2026-09-01T23:47:34+08:00'
---

# Milvus 向量数据库架构与向量检索原理解析

> 本文整合自两篇笔记：《向量检索与HNSW/IVFPQ原理解析》+《Milvus向量数据库架构详解》。
> 前半部分讲「万物向量化 → 最近邻 → HNSW/IVF/PQ」的检索原理，后半部分拆解 Milvus 的数据组织、存算分离架构与读写链路。

> [!warning] 版本时效说明
> 本文的 Milvus 架构讲解对应经典 **2.x** 存算分离 / 读写分离架构。截至 **2026-09**，Milvus 最新版本为 **3.0.0**（2026-07-29 发布），2.6 线最新为 **2.6.23**；**3.0 已转向「湖仓原生 lake-native」架构**。§九 列出 3.0 的关键变化，并对本文个别过时表述做了标注。

---

## 一、万物皆可向量化（什么是向量）

- 以图搜图、人脸识别、RAG、Memory 等热门技术背后，都指向同一核心能力——**海量数据的向量检索**。
- 人脑识别猫=同时捕捉尖耳朵、圆脸、长胡须等多维特征，特征叠加形成整体感知；计算机可参考相同思路，用**特征数组**描述事物。
- 用坐标轴描述特征：
  - X 轴=耳朵是否尖，Y 轴=是否有长尾巴 → 猫与狐狸在二维几乎重叠。
  - 加入 Z 轴=脸是否圆 → 猫（圆脸）和狐狸（尖脸）分开。
- 扩展到 **128 维甚至更高维度**，每维对应一种视觉特征，每个事物在高维空间里都有唯一位置。
- **向量**=一组浮点数，即高维空间中的一个点。同一只猫不同照片的向量位置相近。
- 向量之间的距离代表相似度：**距离越近，内容越相似**。

---

## 二、最近邻搜索与近似最近邻（ANN）

| 应用 | 原理 |
|---|---|
| 以图搜图 | 拍照 → 转向量 → 从商品库找距离最近的向量 |
| 人脸识别 | 人脸照转向量 → 与人脸库已存向量逐一比对 |
| 文搜图 / 图搜视频 | 文本/视频同样编码为向量，再做最近邻匹配 |

- **核心问题**：给定一个查询向量，从海量向量库中找到距离最近的几个。
- 为什么不能暴力遍历：商品库/人脸库可达数千万至数亿条，全量逐个算距离效率太低；B+ 树适用于标量（数字、字符串），无法直接用于浮点向量数组。
- 允许少量误差、找到"足够接近"结果的搜索方法，称为**近似最近邻（ANN, Approximate Nearest Neighbor）**。HNSW、IVF、PQ 都属于 ANN 家族。

---

## 三、HNSW（分层可导航小世界图）

**灵感：六度人脉理论**——任意两人最多通过 6 个中间人建立联系。类比：将距离相近的向量用边连成**邻居关系图**，查询时从某点出发沿边快速逼近目标。

**关键问题：从哪开始搜？→ 引入分层结构：**
1. 从全量节点中抽取少量节点，构建更稀疏的**上层图**。
2. 继续向上抽取更少节点，形成**金字塔式多层图**。
3. 新向量进入时，从**最高层唯一入口**出发，逐层向下，在每一层快速锁定大致区域，再在更密的节点中找到最近邻，建立连接。
4. 查询流程相同，最终在最底层返回最相似结果。

> **HNSW = Hierarchical Navigable Small World（分层可导航小世界图）**

- 优点：几跳即可得到近似最近邻，**速度极快**。
- 缺点：整张图常驻内存，数据量大时内存成为瓶颈。

---

## 四、IVF 与乘积量化（PQ）

### IVF（倒排文件索引）
类比：找人先找医院——不挨家挨户敲门，先按类别聚类再细找。
1. 将所有向量**聚类**，相似向量归入同一桶（文件）。
2. 每个桶有一个**聚类中心**代表该桶。
3. 查询时：先算查询向量与各聚类中心的距离，找到**最近的几个桶**，再在桶内逐一精筛。

> 例：1000 万向量，分 1000 个桶，每次只搜最近 10 个桶 → 候选量从 1000 万降至 10 万，计算量砍掉 99%。
> **IVF = Inverted File Index（倒排文件索引）**。相比 HNSW 无需维护邻居关系图，内存占用更小。

### 乘积量化（Product Quantization，PQ）
**问题**：IVF 仍不够省——128 维浮点向量 × 4 字节=512 字节/条，1000 万条≈5GB 内存，查询仍要逐条算欧氏距离。
**PQ 核心：分段量化压缩**
1. 将向量切成多个**子段**（如 128 维切为 4 段，每段 32 维）。
2. 对每个子段分别做聚类，得到若干**聚类中心编号**。
3. 用**聚类中心编号**替代原始浮点值——每个编号≤256，可用 **1 字节**表示。

**举例（4 维整数向量）**：原始向量 A=`[9,1,4,4]`，每段 2 维 →
- 第 1 段 `[9,1]` 离编号 **2** 的聚类中心最近，第 2 段 `[4,4]` 离编号 **3** 最近；
- 编码后 A=`[2,3]`，仅 **2 字节**（原 16 字节），压缩 8 倍。

**查询加速**：预建查找表（查询向量各子段与各聚类中心的平方距离）→ 查表 + 加法即得近似距离，避免逐维浮点运算。
> **IVF + PQ = IVFPQ**：IVF 缩小搜索范围，PQ 压缩每条向量的内存与计算量。

### HNSW vs IVFPQ 速览

| 指标 | HNSW | IVFPQ |
|---|---|---|
| 内存 | 高（全量图常驻） | 低（聚类中心+编码编号） |
| 速度 | 快（几跳命中） | 较快（粗筛+查表） |
| 精度 | 较高 | 有损（PQ 丢精度） |
| 适用 | 内存充足、追求极速 | 大规模数据、内存敏感 |

---

## 五、向量数据库定位与 Milvus 基础

- **语义匹配原理**：文本、图片、视频、音频均可经编码模型转为浮点数数组（向量）。向量在高维空间可视为一个点，距离越近语义越相似。
  - 例：搜"唱跳 rap"可匹配"练习时长两年半"；搜"黄蜂谷历飞羽"可匹配"韩老魔"——字面不同但语义背景相关。
- **核心需求**：需要一个能存储海量向量并提供高效读写的数据库。
- **Milvus 定位**：应用与海量向量数据之间的中间层——外部应用输入查询向量，Milvus 快速匹配出距离相近的向量结果。
- **标量过滤**：除向量外，数据还包含 ID、上传者、分类标签、时间等标量字段，Milvus 支持按标量条件过滤，类似 MySQL。
  ```sql
  SELECT id, category FROM images
  WHERE category = '风景' AND ratio = '16:9'
  ORDER BY L2_distance(embedding, query_vector)
  LIMIT 10;
  ```
- **索引方案**：见下——其中「单纯用 HNSW/IVF 这种 ANN 索引导出索引选型」是旧认知，当前索引体系远为丰富（见 §九）。

---

## 六、Milvus 单机数据组织

- **Segment（分段）**：数据存储的最小逻辑单元。向量字段与标量字段按列式分开存储；索引文件与数据文件独立存放，增删索引不影响原始数据。
- **写入生命周期**：
  - **Growing Segment**：新数据写入区，可查但尚未建立索引。
  - **Sealed Segment**：数据攒满后 `flush` 封存，不再接受写入，专门负责读取。
  - **Compaction（合并）**：定期将多个小 Sealed Segment 合并为大 Segment，控制文件数量、减少磁盘碎片。
- **Partition（分区）**：按业务维度（表情包、风景、人像）逻辑分组。查询时指定范围避免全量扫描，提升速度。
- **Collection（集合）**：包含 1~多个 Partition 的逻辑表，聚合相同向量维度与编码模型的数据（相当于传统数据库的"表"）。将 Collection 部署到单台机器即构成单机向量数据库。

---

## 七、Milvus 分布式架构

- **水平扩展**：通过主键哈希将 Collection 数据打散到不同节点，负载均衡、避免热点。
- **存算分离**：数据与索引统一放对象存储（如 S3/OSS）；计算节点独立部署，按需将 Segment 加载至内存。节点故障直接替换，计算与存储各自弹性伸缩。
- **读写分离与角色分化**（以 **3.0 为准**；注意早期 2.x 命名差异）：
  - `Proxy`：统一**无状态**接入层，校验并路由客户端请求、聚合剪枝离结果。
  - `Streaming Node`（3.0 核心新增）：持有 WAL 的 shard 级"小脑"，负责**写入 + 实时（growing）数据查询**，并把 growing 数据转成 sealed；提供分片级一致性与故障恢复。
  - `Data Node`：**离线**处理历史数据的 `compaction 合并` 与 `索引构建`。
  - `Query Node`：加载 sealed（历史）数据与索引，负责历史数据查询。
  - （早期 2.x 的"DataNode=写入、IndexNode=索引构建"角色划分，在 3.0 已被演化为"Streaming Node=写入+实时读、Data Node=离线索引/合并"，QueryNode 专司历史读。）
- **Coordinator 层**：集群"大脑"，维护拓扑、调度各类任务（DDL/DCL/TSO、流式服务绑定 WAL、查询路由、历史数据管理），元数据存 etcd；同一时刻集群仅一个活动 Coordinator。
- **Storage 层（第四层）** = `Meta Store(etcd)` + `WAL 存储` + `对象存储`：
  - **WAL 存储**：3.0 默认 **Woodpecker**（云原生、**零磁盘**，直接写对象存储），可独立部署；也支持 Kafka / Pulsar。
  - **对象存储**：Snapshot 文件（列式数据）、scalar/vector 索引文件、中间查询结果（MinIO / S3 / GCS / Azure Blob / OSS）。
- **高可用保障**：
  - **写入**：先入 WAL 落盘（Woodpecker 零磁盘→对象存储）→ Streaming Node 按 Offset 重放恢复，数据不丢。
  - **读取**：同一份 Sealed Segment 可在多个 QueryNode 建副本，单点故障自动路由切换。
  - **协调**：etcd 持久化元数据，Coordinator 故障随时切换。

---

## 八、完整读写流程（以图搜图为例）

**写入流程：**
1. 应用端通过编码模型将猫表情包图片转为 128 维向量，附带 ID、上传者、分类等标量。
2. 请求经 Proxy 转发至 **Streaming Node**，写入 **WAL**（3.0 默认 Woodpecker→对象存储）即返回客户端"写入成功"。
3. Streaming Node 同时把 WAL 条目切成 **Growing Segment**（尚未落对象存储、实时可查）；攒满后其触发 `flush`，转 **Sealed Segment**（落盘对象存储、不可变）。
4. `Data Node` 对 Sealed Segment 做 **compaction 合并** 与 **索引构建**，索引写回对象存储。
5. Coordinator 发起 handoff，把 sealed 均匀分发到各 **Query Node** 加载；索引加载完毕后替换对应 growing 数据参与历史检索。

> [!tip] 写入到命中索引之间是否有"查询空洞"？（对应问题一）
> **没有。**从写入成功到索引就绪这个间隙，Milvus 用两条并行查询路径 + 多级结果合并兜底：
> - **Growing 数据**：写入即入 WAL，由 Streaming Node **实时**提供查询（数据已在内存/未建索引，等价近似暴力扫描）；
> - **Sealed 且索引未就绪**：Query Node 对该 segment 用**未建索引的暴力扫描**兜底（结果正确，只是慢）；
> - 索引建好并加载后，Query Node 自动切到索引检索提速。
> 全程正确性由 **consistency level** 与 flush/handoff 协调保证，期间差异仅是"用不用索引"的性能问题，**不存在查不到的数据空洞**。

**读取流程（混合查询）：**
- 应用上传图片转向量，指定 `Collection`（images）与 `Partition`（表情包），过滤条件为宽高比 16:9。
- Proxy 向 Coordinator 获取路由，并发请求各 QueryNode。
- QueryNode 内部在多个 Sealed Segment 上并发执行向量检索 + 标量过滤，结果汇总至 Proxy 全局排序后返回 TopK。

**读取流程（纯标量/主键查询）：**
- 已知图片 `ID=100` 需获取完整信息 → Proxy 路由至对应 Partition 的 QueryNode，在各 Segment 的主键索引上并发查找。
- **场景建议**：通过 ID 精确查单条记录在向量库中需跨多 Segment 扫主键索引，性能并非最优；此类场景交给 MySQL 更合适。

---

## 九、Milvus 版本现状与架构演进（本文时效性说明）

### 最新版本（截至 2026-09）
| 版本线 | 最新版本 | 说明 |
|---|---|---|
| **3.0** | **3.0.0**（2026-07-29） | 当前主版本，湖仓原生（lake-native）架构 |
| **2.6** | **2.6.23**（2026-08-28） | 经典架构维护线；2.6→3.0 可回滚 |

### 本文中已过时 / 需修正的表述
1. **标量列"基于 B+ 树"** ❌ —— Milvus 标量索引由 **INVERTED（倒排）、BITMAP、STL_SORT、TRIE、NGRAM、RTREE** 等组成（自动索引按字段类型推断，常用推荐 INVERTED / BITMAP）；**不存在"B+ 树"做标量索引**（那是 MySQL 这类事务库的做法）。本文原表述为"B+ 树、倒排索引"，此处修正。
2. **向量列"只有 HNSW / IVF_PQ"** —— 属 2.x 早期认知。当前主流还包括 **DiskANN**（磁盘索引，大库省内存）、**GPU 索引（如 CAGRA）**、**稀疏向量索引（BM25 / SINDI）** 等，按数据规模与硬件选型，而非单一 HNSW。
3. **整篇无版本语境** —— 本文描述的是 2.x 存算分离/读写分离架构，现已新增版本说明。

### 3.0 的关键演进（相对本文描述的对象）
- **湖仓原生（lake-native）**：新增 **External Collection**——直接引用湖上文件（Parquet / Lance / Iceberg / Vortex）原地建索引与检索，无需把数据复制进 Milvus。
- **存储重构为 Storage V3（代号 Loon）**：manifest 化列式存储，是 Snapshot 与 External Collection 的地基（默认关闭，需 `common.storage.useLoonFFI` 开启）。
- **弹性 Schema**：支持在线增删列 / 回填（Backfill），embedding 模型升级不再需要整库重建。
- **Woodpecker**：流式写入核心 WAL 现可独立部署为服务，而非内嵌于各节点——大集群/高写入负载下可独立扩缩与容错。
- **索引增强**：稀疏索引重构为 **SINDI / Block-Max WAND / MaxScore**（BM25 压缩索引比 2.6 小约 3 倍）；新增 **FAISS 索引透传**（可传任意 Faiss index-factory 字符串）。
- **新类型新能力**：`TEXT` 长文本字段（>64KB 存分行 LOB 文件），`StructArray` 结构体数组与 faceted 分面检索、Function Chain 重排、Vortex / Lance 开放列式格式（Vortex 将成未来默认内部格式）。

> 一句话：**Segment/Partition/Collection 的数据组织、Coordinator 调度、存算分离 + 对象存储/WAL 的四层骨架在 3.0 依然成立**；但 3.0 对执行节点做了重命名与职责调整（新增 **Streaming Node**、**Data Node 专职离线索引/合并**、**QueryNode 专司历史读**、WAL 用零磁盘 **Woodpecker**），理解时请以本页 §七 的 3.0 版本为准，早期 2.x 名称仅作参考。

---

## 附：字段类型 · 检索方式 · 存储速查（3.0）

### 字段类型速查
| 数据 | 类型（DataType） | 说明 |
|---|---|---|
| 稠密向量 | `FLOAT_VECTOR`（变体：FLOAT16 / BFLOAT16 / INT8） | 定长数组，必须给 `dim`；语义检索 |
| 稀疏向量 | `SPARSE_FLOAT_VECTOR` | 不定长，只存非零 `{index: value}`；关键词精确匹配（BM25 / SPLADE） |
| 标量 | `VARCHAR` / 数值 / `JSON` / `BOOL` / `TEXT` 等 | 过滤、主键、动态字段；TEXT 支持长文本（需 Storage V3） |
| 二值向量 | `BINARY_VECTOR` | 快速相似比较 / 去重 |

### 检索方式速查（代码层各名字 / 条件怎么传）
- **Collection / Partition / 过滤条件**：`search()` 或 `query()` 里传参——`collection_name="..."`、`partition_names=["表情包", ...]`、`filter="category == '风景' and ratio == '16:9'"`（filter 即标量过滤表达式，走倒排/标量索引）。创建与改名在 schema 与 `create_partition` 环节。
- **稠密向量检索**：`client.search(collection_name=..., data=[query_vec], anns_field="dense_vector", search_params={"params":{"nprobe":10}}, limit=...)`；`data` 是定长 `float` 数组。
- **稀疏向量检索**：同样的 `search()`，`data=[{1:0.2, 50:0.4, 1000:0.7}]`（dict / scipy csr / tuple 迭代器），`anns_field="sparse_vector"`；索引用 `SPARSE_INVERTED_INDEX` + `IP` 度量，可由 `text` 字段 + BM25 函数自动生成，也可用外部 SPLADE 嵌入。
- **纯标量 / 主键查询 ≠ 向量检索**（对应问题二）——是**两套 API、两条执行路径**：
  - `search(...)` = **向量 ANN 检索**（DQL 向量路径，返回 topK 相似向量）；
  - `query(...)` / `get(...)` = **纯标量过滤 / 主键取数**（DQL 标量路径，按 `filter` 条件或主键返回整行，不做向量匹配），同样支持 `partition_names`。
  - 两者可**组合**成"带过滤的向量检索"（`search()` 里同时给 `filter=`），Milvus 先走标量过滤缩小候选，再做向量 ANN。
- **稠密 vs 稀疏的"设置"差异**：字段类型不同（`FLOAT_VECTOR(dim=固定值)` vs `SPARSE_FLOAT_VECTOR`）、度量不同（稠密多用 `IP`/`COSINE`/`L2`，稀疏用 `IP`）、索引类型不同（稠密 `HNSW`/`IVF_*`/`DISKANN`/`GPU_CAGRA`/`AUTOINDEX`，稀疏 `SPARSE_INVERTED_INDEX`/`SPARSE_WAND` 等）。查询入口都是 `search()`，靠 `anns_field` 指定走哪个向量字段。

### 写入代码速查
> 字段名为示例：`id`(主键)、`dense_vector`、`sparse_vector`、`category`/`text`(标量)。写入是写操作，与前面 `search()/query()` 的读操作是**两套 API**。

**① 预建 collection（schema + 索引，先于写入）**
```python
from pymilvus import MilvusClient, DataType

client = MilvusClient(uri="http://localhost:19530", token="root:Milvus")

schema = client.create_schema(auto_id=False)               # 主键自增用 auto_id=True
schema.add_field(field_name="id",            datatype=DataType.INT64,                is_primary=True)
schema.add_field(field_name="dense_vector",  datatype=DataType.FLOAT_VECTOR,         dim=128)
schema.add_field(field_name="category",      datatype=DataType.VARCHAR, max_length=100)
schema.add_field(field_name="text",          datatype=DataType.VARCHAR, max_length=65535)  # 稀疏向量的原文
schema.add_field(field_name="sparse_vector", datatype=DataType.SPARSE_FLOAT_VECTOR)

index_params = client.prepare_index_params()
index_params.add_index(field_name="dense_vector",  index_type="AUTOINDEX",            metric_type="IP")
index_params.add_index(field_name="sparse_vector", index_type="SPARSE_INVERTED_INDEX", metric_type="IP")

client.create_collection(collection_name="my_collection", schema=schema, index_params=index_params)
client.create_partition(collection_name="my_collection", partition_name="表情包")   # 可选：建分区
```

**② 批量写入（稠密向量 + 标量）**
```python
data = [
    {"id": 1, "dense_vector": [0.358, -0.602, 0.184, ...], "category": "风景_16:9"},
    {"id": 2, "dense_vector": [0.437, -0.559, 0.645, ...], "category": "风景_16:9"},
]
res = client.insert(collection_name="my_collection", data=data)
# {'insert_count': 2, 'ids': [1, 2]}
```

**③ 写入到指定分区**（与读取时 `partition_names=` 对应）
```python
res = client.insert(collection_name="my_collection", partition_name="表情包", data=data)
```

**④ 稀疏向量写入**（`text` 存原文，`sparse_vector` 用 dict 存非零 `{维度: 权值}`；若想让 BM25 函数从 `text` 自动生成向量，见下方「BM25 自动生成稀疏向量」小节）
```python
data = [
    {"id": 3, "text": "information retrieval is a field of study.",
              "sparse_vector": {1: 0.5, 100: 0.3, 500: 0.8}},
    {"id": 4, "text": "finding relevant information in large datasets.",
              "sparse_vector": {10: 0.1, 200: 0.7, 1000: 0.9}},
]
client.insert(collection_name="my_collection", data=data)
```

**⑤ 更新 / 覆盖（upsert：主键存在则覆盖，不存在则插入）**
```python
client.upsert(collection_name="my_collection",
              data=[{"id": 1, "dense_vector": [0.9, -0.2, 0.1, ...], "category": "风景_4:3"}])
```

> 写入链路与 §八 一一对应：`insert()/upsert()` → Proxy → **Streaming Node 写 WAL(Woodpecker)** 并切成 Growing Segment（此时实时可查）→ flush 转 Sealed → DataNode 合并/建索引 → 加载到 QueryNode。**写入成功即返回，之后可直接搜到（见 §八"查询空洞"说明）。**

### BM25 自动生成稀疏向量（Function·BM25）
> 核心：**建 Collection 时定义一个 `FunctionType.BM25` 函数，把 `text` 和 `sparse_vector` 绑定**，而非在写数据时手动计算。插入时**只需提供 `text` 原文，Milvus 自动分词并生成 BM25 稀疏向量**。与上面 §④（手工 dict 稀疏向量）互为两种方式。

**① Schema + Function（关键配置：`analyzer` 分词器）**
```python
from pymilvus import MilvusClient, DataType, Function, FunctionType

client = MilvusClient(uri="http://localhost:19530", token="root:Milvus")

schema = client.create_schema(enable_dynamic_field=True)
schema.add_field(field_name="id",             datatype=DataType.INT64,   is_primary=True, auto_id=True)
schema.add_field(field_name="text",           datatype=DataType.VARCHAR, max_length=65535,
                 enable_analyzer=True, analyzer_params={"type": "english"})   # 中文用 {"type":"chinese"}
schema.add_field(field_name="sparse_vector",  datatype=DataType.SPARSE_FLOAT_VECTOR)

bm25 = Function(
    name="bm25_embedding",
    function_type=FunctionType.BM25,
    input_field_names=["text"],           # 输入：原文 VARCHAR
    output_field_names=["sparse_vector"]  # 输出：自动生成的稀疏向量
)
schema.add_function(bm25)
```
> `enable_analyzer=True` 和 `analyzer_params` 必不可少，决定文本如何分词（英文 `{"type":"english"}`，中文 `{"type":"chinese"}`）。

**② 索引（关键：`metric_type` 必须=`BM25`，否则写入报错）**
```python
index_params = client.prepare_index_params()
index_params.add_index(
    field_name="sparse_vector",
    index_type="SPARSE_INVERTED_INDEX",                 # 推荐
    metric_type="BM25",                                 # 必须与 Function 类型匹配
    params={"inverted_index_algo": "DAAT_MAXSCORE",     # 可选
            "bm25_k1": 1.2, "bm25_b": 0.75}             # BM25 调参（官方默认）
)
client.create_collection(collection_name="demo_bm25", schema=schema, index_params=index_params)
```

**③ 写入（只填 `text`，`sparse_vector` 自动生成，插入时省略该字段）**
```python
data = [
    {"text": "Artificial intelligence was founded as an academic discipline in 1956."},
    {"text": "Alan Turing was the first person to conduct significant research in AI."},
]
client.insert(collection_name="demo_bm25", data=data)
```

**④ 查询**（复用前文"稀疏向量检索"写法：`anns_field="sparse_vector"`，`data` 传 dict）
```python
res = client.search(collection_name="demo_bm25", data=[{1: 0.2, 50: 0.4, 1000: 0.7}],
                    anns_field="sparse_vector", limit=3, output_fields=["text"])
```

> 流程一句话：**建表用 `Function` 绑定 `text`→`sparse_vector` + 索引 `metric_type="BM25"` → 写入只给 `text` → 自动分词/算 BM25/生成稀疏向量**。这一能力正是 3.0 稀疏索引重整（SINDI / DAAT 算法）之上的常见用法。

### 最新版（3.0）存储布局（对应问题三，本文 §六/§七 核对）
| 内容 | 存放位置（3.0） |
|---|---|
| **元数据**（schema、路由视图、消费 checkpoint） | **etcd** |
| **数据本体**（稠密 / 稀疏 / 标量 / TEXT，列式） | **对象存储**（MinIO / S3 / OSS / GCS / Azure）Snapshot 文件；默认格式 **Parquet**，可选 **Vortex**；3.0 经 **Storage V3(Loon)** manifest 化并可对接湖上外部数据 |
| **索引文件**（向量 + 标量 + 主键） | **对象存储**，按 segment 独立存放；构建时 Data Node 从对象存储读到内存重建、序列化后写回 |
| **WAL（写入日志）** | 3.0 默认 **Woodpecker（零磁盘→对象存储）**，或 Kafka / Pulsar |
| **中间查询结果 / 缓存** | 对象存储 + 各 QueryNode 内存 / 本地缓存 |

> 与本文此前表述的差异点：① 标量索引不是"B+ 树"，而是 INVERTED / BITMAP / STL_SORT / TRIE 等；② 数据与索引统一在对象存储（存算分离），3.0 的 Storage V3（Loon）把这一层 manifest 化，`TEXT` 长文本也需要它；③ WAL 默认是零磁盘的 **Woodpecker** 而非传统消息队列。

---
## 相关笔记
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] · ↪ 返回 AI 大模型 MOC
- [[AI大模型/rag/混合检索/Milvus 混合检索与稀疏向量完全指南|Milvus 混合检索与稀疏向量完全指南]] — 稠密/稀疏向量混合检索 + RRF 实战
- [[AI大模型/rag/RAG检索可靠性系统设计|RAG检索可靠性系统设计]] — 向量检索之外的 RAG 全链路可靠性