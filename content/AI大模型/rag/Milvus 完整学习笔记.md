---
title: Milvus 完整学习笔记
tags:
- Milvus
- 向量数据库
- RAG
- 检索
- 学习笔记
status: 已归档
created: 2026-10-17
modified: '2026-10-17T18:19:08+08:00'
---

# Milvus 完整学习笔记

> [!info] 内容概览
> 整合自**动态字段机制、索引原理对比、实体操作、查询搜索、混合检索、标量过滤、Reranker 参数**等全部讨论内容。
> 覆盖 Milvus 从 Schema 建模到混合检索的完整链路，可直接当作速查手册使用。

## 目录

1. [[#一、核心概念]]
2. [[#二、动态字段 enable_dynamic_field]]
3. [[#三、索引类型与原理]]
4. [[#四、度量方式：IP 与 COSINE]]
5. [[#五、集合与 Schema 操作]]
6. [[#六、实体操作：增删改查]]
7. [[#七、搜索与查询]]
8. [[#八、多向量与混合检索]]
9. [[#九、标量过滤 + 向量检索]]
10. [[#十、Reranker 详解：RRF 与 WeightedRanker]]
11. [[#十一、资源管理]]
12. [[#十二、完整示例代码]]
13. [[#十三、易错点速查]]
14. [[#十四、索引参数调优（nlist/nprobe/M）]]

---

## 一、核心概念

| 概念                    | 含义                                     |
| ----------------------- | ---------------------------------------- |
| **Collection（集合）**  | 类似关系型数据库的"表"，存储实体         |
| **Schema**              | 集合的结构定义，包含字段名、类型、主键等 |
| **Entity（实体）**      | 集合中的一条数据，类似"行"               |
| **Field（字段）**       | 实体的属性，类似"列"                     |
| **Primary Key（主键）** | 唯一标识实体，可 `auto_id` 自动生成      |
| **Partition（分区）**   | 集合内的逻辑划分，可加速查询、隔离数据   |
| **Index（索引）**       | 加速向量/标量检索的数据结构              |
| **Load / Release**      | 将集合数据加载到内存 / 从内存释放        |
| **Metric Type**         | 相似度度量方式：L2、IP、COSINE           |
| **output_fields**       | 指定检索结果返回哪些字段                 |
| **Reranker**            | 混合检索中融合多路结果的策略             |

---

## 二、动态字段 enable_dynamic_field

### 2.1 作用

在 `create_schema()` 时设置 `enable_dynamic_field=True`，可以**插入未在 Schema 中定义的字段**，Milvus 不会报错。

### 2.2 内部机制

- 所有"计划外"字段及其值，以键值对形式存入一个隐藏的 JSON 字段 **`$meta`**。
- 对用户透明：查询、过滤、输出时都可像普通字段一样使用。

### 2.3 行为对比

| 状态            | 插入未定义字段 | 适用场景               |
| --------------- | -------------- | ---------------------- |
| `False`（默认） | 报错           | 结构固定、字段稳定     |
| `True`          | 存入 `$meta`   | 结构灵活、字段频繁变化 |

### 2.4 使用示例

```python
schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=5)

# 插入时携带未定义字段 category、description
client.insert(collection_name="demo", data=[
    {"id": 1, "vector": [...], "category": "技术", "description": "..."}
])

# 查询时可正常取出和过滤
client.search(..., output_fields=["category", "description"],
              filter='category == "技术"')
```

### 2.5 注意事项

- **过滤性能**：动态字段底层是 JSON 解析，效率**低于**预定义字段。
- **不能建索引**：动态字段无法像静态标量字段那样建独立索引。
- **类型限制**：支持 JSON 基本类型（字符串、数字、布尔、数组），不支持复杂嵌套查询。
- **命名冲突**：动态字段名不能与 Schema 中已有字段重名。
- **建议**：高频过滤的字段应定义为静态字段。

---

## 三、索引类型与原理

### 3.1 IVF 系列

**IVF = Inverted File（倒排文件）**

思路：先用 k-means 把向量空间聚成若干簇，查询时只搜索与查询向量最近的少数簇（`nprobe` 控制），避免全量扫描。

| 索引         | 原理                                  | 特点                                   |
| ------------ | ------------------------------------- | -------------------------------------- |
| **IVF_FLAT** | 簇内保留原始浮点向量，精确计算距离    | 精度高，存储大，速度中等               |
| **IVF_SQ8**  | 簇内用标量量化，FLOAT(4B) → UINT8(1B) | 存储降至 1/4，速度更快，精度下降       |
| **IVF_PQ**   | 簇内用乘积量化，向量切段分别量化      | 压缩率极高，查表算距离，精度进一步下降 |

**IVF_SQ8 不只是降存储**：量化后距离计算从浮点变为整数，**速度也更快**，代价是召回率下降。

**IVF_PQ 在簇内如何既省存储又提效率**：

1. **切段量化**：把 128 维向量切成 8 段，每段 16 维，各段独立用子码本（如 256 个中心）量化。
2. **存储**：原来 128×4=512 字节 → 8 字节（每段 1 字节索引），压缩比极高。
3. **距离计算**：查询向量也切段，**预计算**每段到对应子码本所有中心的距离，存成查找表（LUT）。
4. **扫描时**：每个候选用它 8 段的索引**查表并累加 8 个距离**，无需浮点乘加。

效率来自：**读的数据量小** + **算距离简单（查表代替乘加）**。

### 3.2 HNSW

分层可导航小世界图。**从最上层开始，逐层向下搜索**。

- 上层节点少、连接稀疏 → 快速跳到大致正确区域
- 下层节点密 → 精细定位

**上层找不到更近的邻居怎么办？**
不会卡住。这说明在当前稀疏层已到局部最优，算法**带着当前最近节点直接进入下一层**继续搜索。上层找不到更近，恰恰是进入下层精细搜索的信号。

### 3.3 选择建议

| 场景                     | 推荐            |
| ------------------------ | --------------- |
| 追求高召回、数据量中等   | IVF_FLAT / HNSW |
| 内存受限、可接受精度损失 | IVF_SQ8         |
| 超大规模、极致压缩       | IVF_PQ          |
| 低延迟、高召回           | HNSW            |

---

## 四、度量方式：IP 与 COSINE

### 4.1 数学关系

**对于归一化后的向量，IP = COSINE。**

### 4.2 本质区别

| 度量               | 关注                | 适用场景                         |
| ------------------ | ------------------- | -------------------------------- |
| **IP（内积）**     | 方向 + 长度（模长） | 向量长度有语义，如"热度""置信度" |
| **COSINE（余弦）** | 只看方向            | 只关心语义相似，忽略强度         |

### 4.3 关键提醒

- 用 IP 时若未归一化，可能出现"查询向量本身不是 top1"，因为长向量内积更高。
- **建索引时的 `metric_type` 必须与 search 时一致**，否则报错。

---

## 五、集合与 Schema 操作

### 5.1 创建 Schema

```python
schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=5)
schema.add_field(field_name="category", datatype=DataType.VARCHAR, max_length=64)
```

### 5.2 推荐：Schema + Index 一次创建

```python
index_params = client.prepare_index_params()
index_params.add_index(
    field_name="vector",
    index_type="IVF_FLAT",     # 留空则用 AUTOINDEX
    metric_type="IP",
    params={"nlist": 128},
    index_name="vector_index",
)
client.create_collection(collection_name="demo", schema=schema,
                         index_params=index_params)
```

### 5.3 索引查看

```python
client.list_indexes(collection_name="demo")
client.describe_index(collection_name="demo", index_name="vector_index")
```

### 5.4 标量字段索引

```python
index_params.add_index(field_name="category",
                       index_type="INVERTED",   # 倒排索引，加速过滤
                       index_name="cat_idx")
```

---

## 六、实体操作：增删改查

### 6.1 插入

```python
# 插入主集合
client.insert(collection_name="demo", data=[{...}, {...}])

# 插入指定分区
client.insert(collection_name="demo", data=[...], partition_name="partitionA")
```

### 6.2 Upsert

按主键判断：存在则覆盖，不存在则插入。

```python
client.upsert(collection_name="demo", data=[...])
# 指定分区：分区内不存在 id 时不影响，但会覆盖集合中同 id 实体
client.upsert(collection_name="demo", data=[...], partition_name="partitionA")
```

### 6.3 删除

```python
# 按过滤条件（默认全集合）
client.delete(collection_name="demo", filter="id in [12, 5, 6]")

# 按 id + 分区
client.delete(collection_name="demo", ids=[1, 2, 3], partition_name="partitionA")
```

### 6.4 分区管理

```python
client.create_partition(collection_name="demo", partition_name="partitionA")
client.list_partitions(collection_name="demo")
```

---

## 七、搜索与查询

### 7.1 搜索前必须 Load

```python
client.load_collection(collection_name="demo")
client.get_load_state(collection_name="demo")
```

### 7.2 单向量搜索

```python
res = client.search(
    collection_name="demo",
    data=[[...query_vec...]],
    limit=2,
    search_params={"metric_type": "IP", "params": {}},
    output_fields=["id", "vector", "color"],
)
```

### 7.3 批量向量搜索

一个向量字段，多个查询向量：

```python
res = client.search(collection_name="demo", data=[vec1, vec2], ...)
```

### 7.4 分区搜索

```python
res = client.search(collection_name="demo", data=[...],
                    partition_names=["partitionA"], ...)
```

### 7.5 过滤搜索

```python
res = client.search(collection_name="demo", data=[...],
                    filter='color like "red%"',
                    output_fields=["color"], ...)
```

支持的运算符：`==`、`!=`、`in`、`like`、`>`、`<` 等，可组合复杂条件。

### 7.6 范围搜索 radius + range_filter

- **`radius`**：搜索空间的外边界。
- **`range_filter`**：内边界，切掉"太相似"的部分，保留中间区间。

**方向取决于度量类型**：

| 度量            | 距离含义   | 条件                                                     |
| --------------- | ---------- | -------------------------------------------------------- |
| **L2**          | 越小越相似 | `range_filter <= distance < radius`（range_filter 更小） |
| **IP / COSINE** | 越大越相似 | `radius < distance <= range_filter`（range_filter 更大） |

```python
search_params = {
    "metric_type": "IP",
    "params": {"radius": 0.8, "range_filter": 1.0}
}
```

### 7.7 output_fields 详解

`output_fields` 指定**检索结果中每条命中实体需要返回哪些字段**。

```python
output_fields=["id", "category"]   # 只返回 id 和 category
```

补充说明：

- **不指定时**：PyMilvus 当前行为是**默认只返回主键字段**（`id`）。
- **可以写 `["*"]`**：表示返回所有字段（向量字段除外，需显式写出）。
- **动态字段也可以指定**：比如 `output_fields=["color", "category"]`，即使 `color` 是动态字段，也能正常返回。
- **向量字段需要显式写出**：比如 `output_fields=["vector"]`，默认不返回向量，因为数据量通常较大。

---

## 八、多向量与混合检索

### 8.1 批量向量 vs 多向量

| 类型             | 含义                                                    |
| ---------------- | ------------------------------------------------------- |
| **批量向量搜索** | 一个向量字段，多个查询向量，一次 `search()`             |
| **多向量搜索**   | 多个向量字段，用 `hybrid_search()` + `AnnSearchRequest` |

### 8.2 hybrid_search 机制

对多个向量字段分别发起独立 `AnnSearchRequest`，再用 Reranker（如 `RRFRanker`）融合结果。

**同一个 query 多路召回也一样吗？**
机制完全一样。只要走 `hybrid_search`，就是"多路召回 + Rerank"。如果各路传入相同的 `data`，只是输入恰好相同，框架处理不变。如果不需要融合，直接用 `search()`。

### 8.3 示例

```python
req_1 = AnnSearchRequest(
    data=query_film, anns_field="filmVector",
    param={"metric_type": "L2", "params": {"nprobe": 10}}, limit=2,
)
req_2 = AnnSearchRequest(
    data=query_poster, anns_field="posterVector",
    param={"metric_type": "COSINE", "params": {"nprobe": 10}}, limit=2,
)

res = client.hybrid_search(
    collection_name="demo_v3",
    reqs=[req_1, req_2],
    ranker=RRFRanker(100),
    limit=2,
    output_fields=["film_id"],
)
```

### 8.4 关键提醒

- **多向量集合同样需要 `load_collection`**，`hybrid_search` 也不例外。
- 多向量集合要求**所有向量字段都建好索引并加载**后才能查询。

---

## 九、标量过滤 + 向量检索

### 9.1 核心用法

`filter` 参数直接写在 `search()` 里，Milvus 会**先在满足标量条件的实体中做向量检索**。

```python
res = client.search(
    collection_name="demo",
    data=[query_vec],
    limit=5,
    search_params={"metric_type": "IP", "params": {"nprobe": 10}},
    filter='category == "tech"',
    output_fields=["id", "category"],
)
```

### 9.2 性能建议

- 静态标量字段建 `INVERTED` 索引 → 过滤效率高。
- 动态字段（在 `$meta` 中）无法建索引 → 过滤性能较低。
- 高频过滤字段应定义为静态字段。

---

## 十、Reranker 详解：RRF 与 WeightedRanker

### 10.1 RRFRanker(k) 参数含义

`RRFRanker(100)` 里的 **100 是 RRF 公式中的平滑参数 `k`**，默认值为 **60**。

RRF 计分公式：

\[
\text{RRF}(d) = \sum_{i} \frac{1}{k + \text{rank}_i(d)}
\]

其中 `rank_i(d)` 是文档 `d` 在第 `i` 路检索结果中的排名位置。

**`k` 的作用**：

- `k` 越大 → 分母越大 → 不同排名之间的得分差距越小 → **对排名靠前的文档敏感度越低**。
- `k` 越小 → 排名的细微差别被放大 → 靠前文档优势更明显。
- Milvus 建议 `k` 取值范围 **[10, 100]**，默认 60 是常见选择。

### 10.2 在 RRF 基础上加权怎么做

**Milvus 的 `RRFRanker` 本身不支持直接叠加权重**，两种重排策略是互斥的：

- **`RRFRanker`**：基于排名融合，天然不带权重，设计目的就是"不偏袒任何一路"。
- **`WeightedRanker`**：基于分数加权融合，支持为每一路分配权重。

想要"加权"效果，**直接用 `WeightedRanker` 替代 `RRFRanker`**。

### 10.3 WeightedRanker 用法

```python
from pymilvus import WeightedRanker

# 两路检索：文本向量 + 图像向量，权重 0.7 / 0.3，表示更看重文本
ranker = WeightedRanker(0.7, 0.3)

res = client.hybrid_search(
    collection_name="demo",
    reqs=[req_text, req_image],
    ranker=ranker,
    limit=10,
)
```

**注意**：

- 权重数量必须和 `reqs` 数量一致。
- WeightedRanker 内部会先把各路分数归一化到 `[0, 1]`（通常用 arctan），再加权求和。

### 10.4 两种 Reranker 对比

| 策略               | 依据 | 是否可调权重 | 特点                                          |
| ------------------ | ---- | ------------ | --------------------------------------------- |
| **RRFRanker**      | 排名 | 否           | 公平，不偏袒任何一路                          |
| **WeightedRanker** | 分数 | 是           | 可调权重，需处理分数量纲（Milvus 内部归一化） |

---

## 十一、资源管理

### 11.1 Load / Release

| 操作                 | 作用                                     |
| -------------------- | ---------------------------------------- |
| `load_collection`    | 将集合数据加载到内存，**搜索前必须执行** |
| `release_collection` | 将集合数据从内存释放，腾出内存           |
| `drop_collection`    | 删除集合（元数据 + 数据）                |

**`release_collection` 是释放资源吗？**
是的。它释放内存中的索引和数据，但磁盘上的数据仍保留，需要时可重新 `load`。

### 11.2 清理示例

```python
def cleanup(client, name):
    if client.has_collection(name):
        client.release_collection(collection_name=name)
        client.drop_collection(collection_name=name)
```

---

## 十二、完整示例代码

```python
"""
Milvus 完整使用示例
覆盖：数据库 → Schema/索引 → 实体增删改查 → 向量搜索 → 分区 → 多向量混合检索
      → 标量过滤 → RRF / WeightedRanker 重排
"""

import json
import random
import logging
from pymilvus import (
    MilvusClient, DataType, AnnSearchRequest,
    RRFRanker, WeightedRanker,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DB_NAME = "milvus_demo"
COLLECTION_V2 = "demo_v2"
COLLECTION_V3 = "demo_v3"
FILTER_COLLECTION = "filter_search_demo"


# ============ 0. 客户端与数据库 ============
def get_client(uri: str = "milvus_demo.db") -> MilvusClient:
    """uri: 本地文件 'milvus_demo.db' 或服务端 'http://localhost:19530'"""
    return MilvusClient(uri=uri)


def init_database(client, db_name=DB_NAME):
    databases = client.list_databases()
    if db_name not in databases:
        client.create_database(db_name=db_name)
    client.using_database(db_name=db_name)


# ============ 1. 动态字段集合 ============
def create_collection_with_dynamic_field(client, name=COLLECTION_V2):
    if client.has_collection(name):
        return
    schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
    schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
    schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=5)

    index_params = client.prepare_index_params()
    index_params.add_index(field_name="vector", index_type="IVF_FLAT",
                           metric_type="IP", params={"nlist": 128},
                           index_name="vector_index")
    client.create_collection(collection_name=name, schema=schema,
                             index_params=index_params)
    logger.info("集合 %s 创建完成", name)


# ============ 2. 实体操作 ============
def build_entities(start_id, count):
    colors = ["pink", "red", "orange", "yellow", "grey", "white", "purple", "blue", "brown"]
    return [
        {"id": i, "vector": [random.uniform(-1, 1) for _ in range(5)],
         "color": f"{random.choice(colors)}_{random.randint(1000, 9999)}"}
        for i in range(start_id, start_id + count)
    ]


def operate_entities(client, name=COLLECTION_V2):
    client.insert(collection_name=name, data=build_entities(0, 10))

    if "partitionA" not in client.list_partitions(collection_name=name):
        client.create_partition(collection_name=name, partition_name="partitionA")
    client.insert(collection_name=name, data=build_entities(10, 10),
                  partition_name="partitionA")

    client.upsert(collection_name=name, data=build_entities(0, 10))
    client.delete(collection_name=name, filter="id in [12, 5, 6]")


# ============ 3. 搜索 ============
def _fmt(res):
    out = []
    for hits in res:
        out.append([{"id": h.id, "distance": h.distance,
                     "entity": h.entity.to_dict() if hasattr(h.entity, "to_dict") else str(h.entity)}
                    for h in hits])
    return json.dumps(out, indent=2, ensure_ascii=False)


def search_operations(client, name=COLLECTION_V2):
    qv = [0.19886812562848388, 0.06023560599112088, 0.6976963061752597,
          0.2614474506242501, 0.838729485096104]

    # 单向量
    res = client.search(collection_name=name, data=[qv], limit=2,
                        search_params={"metric_type": "IP", "params": {}},
                        output_fields=["id", "vector", "color"])
    logger.info("单向量搜索:\n%s", _fmt(res))

    # 批量
    res = client.search(collection_name=name, data=[qv, [0.3, 0.9, -0.3, -0.4, 0.9]],
                        limit=2, search_params={"metric_type": "IP", "params": {}},
                        output_fields=["id", "color"])
    logger.info("批量搜索:\n%s", _fmt(res))

    # 分区
    res = client.search(collection_name=name, data=[[0.02, 0.05, 0.61, -0.79, 0.55]],
                        limit=5, search_params={"metric_type": "IP", "params": {}},
                        partition_names=["partitionA"], output_fields=["color"])
    logger.info("分区搜索:\n%s", _fmt(res))

    # 过滤
    res = client.search(collection_name=name, data=[qv], limit=5,
                        search_params={"metric_type": "IP", "params": {}},
                        output_fields=["color"], filter='color like "red%"')
    logger.info("过滤搜索:\n%s", _fmt(res))

    # 范围
    res = client.search(collection_name=name, data=[qv], limit=3,
                        search_params={"metric_type": "IP",
                                       "params": {"radius": 0.8, "range_filter": 1.0}},
                        output_fields=["color"])
    logger.info("范围搜索:\n%s", _fmt(res))


# ============ 4. 多向量混合检索 ============
def create_collection_multi_vector(client, name=COLLECTION_V3):
    if client.has_collection(name):
        return
    schema = client.create_schema(enable_dynamic_field=False)
    schema.add_field(field_name="film_id", datatype=DataType.INT64, is_primary=True)
    schema.add_field(field_name="filmVector", datatype=DataType.FLOAT_VECTOR, dim=5)
    schema.add_field(field_name="posterVector", datatype=DataType.FLOAT_VECTOR, dim=5)

    index_params = client.prepare_index_params()
    index_params.add_index(field_name="filmVector", index_type="IVF_FLAT",
                           metric_type="L2", params={"nlist": 128}, index_name="film_idx")
    index_params.add_index(field_name="posterVector", index_type="IVF_FLAT",
                           metric_type="COSINE", params={"nlist": 128}, index_name="poster_idx")
    client.create_collection(collection_name=name, schema=schema,
                             index_params=index_params)


def hybrid_search_demo(client, name=COLLECTION_V3):
    entities = [{"film_id": random.randint(1, 1000000),
                 "filmVector": [random.random() for _ in range(5)],
                 "posterVector": [random.random() for _ in range(5)]}
                for _ in range(1000)]
    client.insert(collection_name=name, data=entities)

    req_1 = AnnSearchRequest(
        data=[[0.8896863042430693, 0.370613100114602, 0.23779315077113428,
               0.38227915951132996, 0.5997064603128835]],
        anns_field="filmVector",
        param={"metric_type": "L2", "params": {"nprobe": 10}}, limit=2)
    req_2 = AnnSearchRequest(
        data=[[0.02550758562349764, 0.006085637357292062, 0.5325251250159071,
               0.7676432650114147, 0.5521074424751443]],
        anns_field="posterVector",
        param={"metric_type": "COSINE", "params": {"nprobe": 10}}, limit=2)

    # --- RRF 融合 ---
    res_rrf = client.hybrid_search(collection_name=name, reqs=[req_1, req_2],
                                   ranker=RRFRanker(100), limit=2,
                                   output_fields=["film_id"])
    logger.info("混合检索(RRF):\n%s", _fmt(res_rrf))

    # --- 加权融合 ---
    res_weighted = client.hybrid_search(collection_name=name, reqs=[req_1, req_2],
                                        ranker=WeightedRanker(0.7, 0.3), limit=2,
                                        output_fields=["film_id"])
    logger.info("混合检索(Weighted 0.7/0.3):\n%s", _fmt(res_weighted))


# ============ 5. 标量过滤 + 向量检索 ============
def filter_search_demo(client):
    if not client.has_collection(FILTER_COLLECTION):
        schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
        schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
        schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=5)
        schema.add_field(field_name="category", datatype=DataType.VARCHAR, max_length=64)

        index_params = client.prepare_index_params()
        index_params.add_index(field_name="vector", index_type="IVF_FLAT",
                               metric_type="IP", params={"nlist": 64}, index_name="vec_idx")
        index_params.add_index(field_name="category", index_type="INVERTED",
                               index_name="cat_idx")
        client.create_collection(collection_name=FILTER_COLLECTION, schema=schema,
                                 index_params=index_params)

    categories = ["tech", "sports", "music", "food", "travel"]
    data = [{"id": i, "vector": [random.uniform(-1, 1) for _ in range(5)],
             "category": random.choice(categories)} for i in range(200)]
    client.insert(collection_name=FILTER_COLLECTION, data=data)

    client.load_collection(collection_name=FILTER_COLLECTION)
    res = client.search(
        collection_name=FILTER_COLLECTION,
        data=[[0.1, 0.2, 0.3, 0.4, 0.5]],
        limit=5,
        search_params={"metric_type": "IP", "params": {"nprobe": 10}},
        filter='category == "tech"',
        output_fields=["id", "category"],
    )
    logger.info("标量过滤搜索:\n%s", _fmt(res))


# ============ 6. 清理 ============
def cleanup(client, name):
    if client.has_collection(name):
        client.release_collection(collection_name=name)
        client.drop_collection(collection_name=name)
        logger.info("集合 %s 已释放并删除", name)


# ============ main ============
def main():
    client = get_client()
    init_database(client)

    create_collection_with_dynamic_field(client, COLLECTION_V2)
    operate_entities(client, COLLECTION_V2)
    client.load_collection(collection_name=COLLECTION_V2)   # 搜索前必须 load
    search_operations(client, COLLECTION_V2)

    create_collection_multi_vector(client, COLLECTION_V3)
    client.load_collection(collection_name=COLLECTION_V3)   # 混合检索前同样要 load
    hybrid_search_demo(client, COLLECTION_V3)

    filter_search_demo(client)

    # cleanup(client, COLLECTION_V2)
    # cleanup(client, COLLECTION_V3)
    # cleanup(client, FILTER_COLLECTION)


if __name__ == "__main__":
    main()
```

---

## 十三、易错点速查

| #    | 易错点                                  | 正确做法                                           |
| ---- | --------------------------------------- | -------------------------------------------------- |
| 1    | 搜索前忘 `load_collection`              | search / hybrid_search 前必须 load                 |
| 2    | 建索引与搜索的 `metric_type` 不一致     | 两处必须一致                                       |
| 3    | 动态字段想建索引                        | 动态字段无法建索引，高频过滤应设为静态字段         |
| 4    | `auto_id=True` 还手动传 id              | 二选一，开了自动生成就不能手动指定                 |
| 5    | range_filter 方向搞反                   | L2 越小越相似，IP/COSINE 越大越相似                |
| 6    | 以为 IVF_SQ8 只省存储                   | 它也提升速度，代价是精度                           |
| 7    | 以为 IP 和 COSINE 随便选                | 归一化后等价；未归一化时 IP 受长度影响             |
| 8    | 认为 hybrid_search 不需要 load          | 同样需要，且所有向量字段都要建索引                 |
| 9    | `release_collection` 当成删除           | 只释放内存，数据仍在磁盘；删除用 `drop_collection` |
| 10   | Milvus Lite 当生产用                    | Lite 不支持部分高级特性，生产用服务端模式          |
| 11   | 以为 `RRFRanker(100)` 的 100 是权重     | 它是平滑参数 `k`（默认 60），不是权重              |
| 12   | 想在 RRF 上直接叠加权重                 | RRF 不支持权重，改用 `WeightedRanker`              |
| 13   | 以为 `output_fields` 不写就返回全部字段 | PyMilvus 默认只返回主键，向量需显式指定            |
| 14   | `WeightedRanker` 权重数量与 reqs 不匹配 | 权重个数必须等于 `reqs` 个数                       |

---

## 十四、索引参数调优（nlist/nprobe/M）

`M` 是 **HNSW 索引**专有的参数，全称是 **Maximum degree of the node**，也就是**每个节点能拥有的最大连接数（边数）**。

你可以把它理解成：在 HNSW 构建的图里，每个向量点最多能“牵手”多少个邻居节点。

### M 的作用和影响

| M 值 | 图的密度 | 搜索时能探索的路径 | 内存开销 | 构建/搜索速度 |
|---|---|---|---|---|
| **越大** | 越密 | 更多 | 越高 | 越慢（插入和搜索都慢） |
| **越小** | 越疏 | 更少 | 越低 | 越快 |

所以 `M` 直接权衡的是**精度（召回率）**和**内存/速度**。M 越大，图连接越丰富，搜索时能探索到的路径更多，越不容易“迷路”到局部最优，召回率越高；但代价是每条边的存储开销、构建索引的时间、以及搜索时遍历的邻居数量都增加了。

### 取值范围和建议

- **官方范围**：`[2, 2048]`
- **默认值**：**30**（每个节点最多 30 条出边和 30 条入边）
- **建议范围**：大多数场景下设为 **`[5, 100]`** 之间
- **初始值经验公式**：可尝试 **`lg(N)`**（N 是总向量数），然后再根据实际效果微调，比如从 16、32、64 试起

### 另外两个参数

* **nlist**：属于 **IVF 系列索引**，指定 k-means 把数据集分成多少个簇（聚类中心数），范围 `[1, 65536]`，默认 128，建议 `[32, 4096]`。nlist 越大，簇越细，索引构建越慢。
* **nprobe**：也是 **IVF 系列**的搜索参数，指定查询时去探测几个最相近的簇，范围 `[1, nlist]`。nprobe 越大，搜索的簇越多，召回率越高但越慢。

---

## 相关笔记

- [[AI大模型/rag/混合检索/向量数据库与稀疏检索学习笔记|向量数据库与稀疏检索学习笔记]] — 姊妹篇：选型、稀疏嵌入、BM25 与 ES 对比
- [[AI大模型/rag/Milvus向量数据库架构与向量检索原理解析|Milvus向量数据库架构与向量检索原理解析]] — HNSW / IVF / PQ 原理 + 存算分离架构（含 3.0 演进）
- [[AI大模型/rag/混合检索/Milvus 混合检索与稀疏向量完全指南|Milvus 混合检索与稀疏向量完全指南]] — 多向量混合检索 + 稀疏向量实践
- [[AI大模型/rag/混合检索/混合检索排序方式 RRF|混合检索排序方式 RRF]] — RRF 融合原理
- [[AI大模型/rag/混合检索/BM25与倒排索引笔记|BM25与倒排索引笔记]] — 稀疏检索底层结构
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] — 主题导航