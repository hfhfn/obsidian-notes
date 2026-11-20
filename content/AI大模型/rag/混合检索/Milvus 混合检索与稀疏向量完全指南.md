---
created: '2026-05-26T03:57:37+08:00'
modified: '2026-05-26T03:57:37+08:00'
---

# Milvus 混合检索与稀疏向量完全指南

## 1. 概述

在 RAG 系统中，仅使用稠密向量（语义检索）往往无法精确匹配关键词，而仅使用稀疏向量（词袋模型）又容易丢失语义信息。Milvus 2.4+ 版本同时支持 **`FLOAT_VECTOR`**（稠密）和 **`SPARSE_FLOAT_VECTOR`**（稀疏）两种向量类型，并提供了原生的 **混合检索（Hybrid Search）** 与 **RRF（倒数排名融合）** 能力。

本笔记以你截图中看到的 Collection 结构为例，详细拆解：

- 各字段含义
- 稀疏向量的生成与存储格式
- 如何实现混合检索
- 关键参数（`nprobe`、`limit`、RRF 中的 `k`）的作用
- 父子块（parent-child chunk）的设计与查询

---

## 2. Collection 数据结构梳理

### 2.1 字段一览

| 字段名              | 类型                | 说明                                           |
| ------------------- | ------------------- | ---------------------------------------------- |
| `id`                | VARCHAR (PK)        | 每个文本块的唯一标识（如 MD5）                 |
| `text`              | VARCHAR             | 实际存储的文本片段                             |
| `parent_id`         | VARCHAR             | 父块 ID，子块通过该字段关联到更大的段落/文档   |
| `parent_content`    | VARCHAR             | 可选，冗余存储父块内容（避免二次查询）         |
| `dense_vector`      | FLOAT_VECTOR        | 稠密向量（如 768/1024 维），用于语义相似度检索 |
| `sparse_vector`     | SPARSE_FLOAT_VECTOR | 稀疏向量，用于关键词匹配（BM25 / SPLADE）      |
| `sentence_prob`     | FLOAT               | 句子概率（语言模型的置信度）                   |
| `bleu` / `rouge`    | FLOAT               | 评估指标（可选）                               |
| `2-gram` / `3-gram` | VARCHAR / ARRAY     | N-gram 信息，用于精确匹配                      |
| `doc_9_parent_x`    | VARCHAR             | 文档层级标识（自定义）                         |

### 2.2 稀疏向量格式详解

在你的截图中，`sparse_vector` 字段的值类似：```json
{"4": 0.0584, "7": 0.1277, "6": 0.0783, "74": 0.0471, ...}
```
- **Key（键）**：词在词汇表中的 token ID（如分词器或 SPLADE 模型输出的索引）
- **Value（值）**：该词的权重（TF‑IDF / BM25 / SPLADE 得分）

**为什么叫“稀疏”？**  
因为词汇表通常有几万甚至几十万个词，但一个文本块只包含几十个有意义的 token → 只存储非零项，节省存储和计算。

**常见生成方式**：
1. **BM25 / TF‑IDF**：传统词袋模型，可离线计算或使用 Milvus `Function` 自动生成。
2. **SPLADE**：基于 BERT 的神经稀疏模型，能产生“术语扩展”效果（例如输入“car”会给“automobile”分配权重）。
3. **BGE‑M3**：同时输出稠密和稀疏向量。

---

## 3. 混合检索实现（Hybrid Search）

### 3.1 整体流程```
用户查询
   ↓
生成查询的稠密向量 + 稀疏向量
   ↓
Milvus hybrid_search
   ├─ 稠密检索 (ANN) → top_k 候选
   └─ 稀疏检索 (关键词匹配) → top_k 候选
   ↓
RRF 融合排序 → 最终 top_n 结果
   ↓
（可选）通过 parent_id 获取父块完整上下文
```

### 3.2 代码示例：创建 Collection 并建立索引
```python
from pymilvus import MilvusClient, DataType

client = MilvusClient(uri="http://localhost:19530")

# 1. 定义 Schema
schema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=True)

schema.add_field("id", DataType.VARCHAR, max_length=64, is_primary=True)
schema.add_field("text", DataType.VARCHAR, max_length=65535)
schema.add_field("parent_id", DataType.VARCHAR, max_length=64)
schema.add_field("chunk_type", DataType.VARCHAR, max_length=16)   # "parent" / "child"
schema.add_field("dense_vector", DataType.FLOAT_VECTOR, dim=768)
schema.add_field("sparse_vector", DataType.SPARSE_FLOAT_VECTOR)

# 2. 准备索引参数
index_params = client.prepare_index_params()
index_params.add_index(
    field_name="dense_vector",
    index_type="IVF_FLAT",       # 稠密向量常用 HNSW / IVF_FLAT
    metric_type="IP",            # 内积，适合余弦相似度
    params={"nlist": 128}
)
index_params.add_index(
    field_name="sparse_vector",
    index_type="SPARSE_INVERTED_INDEX",   # 稀疏向量专用倒排索引
    metric_type="IP"
)
index_params.add_index(
    field_name="parent_id",
    index_type="TRIE"            # 标量字段加速过滤
)

# 3. 创建 Collection
client.create_collection(
    collection_name="knowledge_base",
    schema=schema,
    index_params=index_params
)
```

### 3.3 生成查询向量并执行混合检索

- 分别使用稠密向量模型和稀疏向量模型构建索引
```python
# 假设已加载稠密模型和稀疏模型
# dense_model = SentenceTransformer("all-MiniLM-L6-v2")
# sparse_model = SpladeEmbeddingFunction(model_name="naver/splade-cocondenser-selfdistil")

query_text = "如何配置 Milvus 的稀疏索引？"

dense_vec = dense_model.encode(query_text)           # 768维列表
sparse_vec = sparse_model.encode(query_text)         # 字典 {"token_id": weight}

results = client.hybrid_search(
    collection_name="knowledge_base",
    reqs=[
        {   # 稠密检索子请求
            "anns_field": "dense_vector",
            "data": [dense_vec],
            "param": {"metric_type": "IP", "params": {"nprobe": 10}},
            "limit": 10          # 每个子请求召回 10 条
        },
        {   # 稀疏检索子请求
            "anns_field": "sparse_vector",
            "data": [sparse_vec],
            "param": {"metric_type": "IP"},
            "limit": 10
        }
    ],
    rerank={"strategy": "rrf", "params": {"k": 60}},   # RRF 融合
    limit=5,                     # 最终返回 5 条结果
    output_fields=["text", "parent_id", "chunk_type"],
    filter="chunk_type == 'child'"   # 可选，只检索子块
)

# 处理结果
for hits in results:
    for hit in hits:
        print(f"id: {hit['id']}, score: {hit['score']}")
        print(f"text: {hit['entity']['text']}")
        print(f"parent_id: {hit['entity']['parent_id']}")
```

- 使用BGE-m3模型同时构建稠密向量和稀疏向量
```python
from pymilvus import MilvusClient, DataType
from pymilvus import model
import numpy as np

# ============ 第一步：初始化 BGE-M3 模型 ============
bge_m3_ef = model.hybrid.BGEM3EmbeddingFunction(
    model_name='BAAI/bge-m3',
    device='cpu',           # GPU 用户可改为 'cuda:0'
    use_fp16=False,
    return_dense=True,
    return_sparse=True,
    normalize_embeddings=True
)

# ============ 第二步：准备数据 ============
docs = [
    "Milvus 是一个开源的向量数据库，支持高效的向量检索。",
    "混合检索结合了稠密向量和稀疏向量的优势，能同时捕获语义和关键词信息。",
    "BGE-M3 模型由北京智源研究院开发，支持 100+ 种语言。",
    "在 Milvus 中，可以使用 hybrid_search API 实现稠密和稀疏向量的混合检索。"
]

# 使用 BGE-M3 生成向量
embeddings = bge_m3_ef.encode_documents(docs)

dense_vectors = embeddings['dense']      # list of np.ndarray, 每个 1024 维
sparse_vectors = embeddings['sparse']    # CSR 矩阵, shape (4, 250002)

# ============ 第三步：创建 Milvus Collection ============
client = MilvusClient(uri="http://localhost:19530")

# 定义 Schema
schema = MilvusClient.create_schema(auto_id=True, enable_dynamic_field=True)

schema.add_field("id", DataType.INT64, is_primary=True, auto_id=True)
schema.add_field("text", DataType.VARCHAR, max_length=65535)
schema.add_field("dense_vector", DataType.FLOAT_VECTOR, dim=1024)  # BGE-M3 稠密向量维度为 1024
schema.add_field("sparse_vector", DataType.SPARSE_FLOAT_VECTOR)

# 准备索引参数
index_params = client.prepare_index_params()
index_params.add_index(
    field_name="dense_vector",
    index_type="HNSW",           # 或 IVF_FLAT
    metric_type="IP",            # 内积（余弦相似度）
    params={"M": 16, "efConstruction": 200}
)
index_params.add_index(
    field_name="sparse_vector",
    index_type="SPARSE_INVERTED_INDEX",
    metric_type="IP"
)

# 创建 Collection
collection_name = "bge_m3_demo"
if client.has_collection(collection_name):
    client.drop_collection(collection_name)

client.create_collection(
    collection_name=collection_name,
    schema=schema,
    index_params=index_params
)

# ============ 第四步：插入数据 ============
# 构建插入数据（注意：稀疏向量使用 CSR 矩阵，直接传入）
insert_data = []
for i, doc in enumerate(docs):
    insert_data.append({
        "text": doc,
        "dense_vector": dense_vectors[i].tolist(),  # np.ndarray 转为 list
        "sparse_vector": sparse_vectors[i]          # CSR 行向量，Milvus 会自动处理
    })

client.insert(collection_name=collection_name, data=insert_data)
print(f"成功插入 {len(docs)} 条数据")

# ============ 第五步：执行混合检索 ============
query = "什么是向量数据库的混合检索？"

# 使用同一个 BGE-M3 模型编码查询
query_embedding = bge_m3_ef.encode_queries([query])
query_dense = query_embedding['dense'][0].tolist()
query_sparse = query_embedding['sparse'][0]   # CSR 格式

# 执行混合检索
results = client.hybrid_search(
    collection_name=collection_name,
    reqs=[
        {   # 稠密检索子请求
            "anns_field": "dense_vector",
            "data": [query_dense],
            "param": {"metric_type": "IP", "params": {"ef": 64}},
            "limit": 3
        },
        {   # 稀疏检索子请求
            "anns_field": "sparse_vector",
            "data": [query_sparse],
            "param": {"metric_type": "IP"},
            "limit": 3
        }
    ],
    rerank={"strategy": "rrf", "params": {"k": 60}},
    limit=3,
    output_fields=["text"]
)

# ============ 第六步：输出结果 ============
print("\n=== 检索结果 ===")
print(f"查询: {query}\n")
for hits in results:
    for hit in hits:
        print(f"分数: {hit['score']:.4f}")
        print(f"文本: {hit['entity']['text']}\n")
```

### 3.4 关键参数详解

| 参数              | 作用                                                         | 默认/建议                   |
| ----------------- | ------------------------------------------------------------ | --------------------------- |
| `nprobe`          | （稠密 IVF 索引）查询时搜索的聚类个数。越大召回越好但速度越慢 | 根据数据量调优，常用 10~100 |
| `reqs[i].limit`   | 每个子检索器内部返回的候选数，这些候选将进入 RRF 融合        | 建议 10~50                  |
| `rerank.params.k` | RRF 平滑因子，公式 `1/(k+rank)`。k 越小，排名靠前的文档优势越大 | 经验值 60（稳定）           |
| 最外层 `limit`    | 最终返回给用户的结果数                                       | 根据业务需求（如 5, 10）    |
| `output_fields`   | 指定返回的标量字段（不返回向量字段）                         | 包含 `text`, `parent_id` 等 |

### 3.5 ANN 与 KNN 的关系

- **KNN（K‑最近邻）**：暴力计算所有向量与查询的距离，结果 100% 精确，但数据量大时极慢。
- **ANN（近似最近邻）**：通过索引（IVF、HNSW、倒排等）只搜索一小部分数据，换取速度的少量精度损失。Milvus 中的所有 `search` 操作本质上都是 ANN。

结论：在工业级场景中，**使用 ANN 模拟 KNN**，在召回率损失可控的情况下获得千倍性能提升。

---

## 4. SPLADE & BGE-M3 模型原理与使用

### 4.1 工作原理

1. **分词**：将输入句子转为 token 序列。
2. **Transformer 编码**：BERT 等模型对每个 token 生成上下文相关的表示。
3. **MLM Head 投影**：每个 token 的表示经过线性层 + ReLU 激活，映射到整个词表大小（如 30522 维），得到每个 token 对每个词表位置的贡献。
4. **聚合**：对所有 token 位置取 **max pooling**（或其他池化），得到一个高维稀疏向量。
5. **输出**：只有非零的 token ID 及其权重被保留。

**术语扩展**：模型会给原文中没有出现但语义相关的词也赋予非零权重（如“car” → “automobile”），这是 SPLADE 相比 BM25 的核心优势。

### 4.2 使用 PyMilvus 内置的模型（无需自定义）
```python
from pymilvus.model.sparse import SpladeEmbeddingFunction

# 加载 SPLADE 模型（首次使用会自动下载）
splade_ef = SpladeEmbeddingFunction(model_name="naver/splade-cocondenser-selfdistil")

# 编码文档（或查询）
docs = ["Milvus 是一个向量数据库", "混合检索支持稠密和稀疏向量"]
sparse_vectors = splade_ef.encode_documents(docs)   # 返回 list of dict

# 编码查询
query = "什么是混合检索"
query_vec = splade_ef.encode_queries([query])[0]    # dict 格式
```

### 4.3 SentenceTransformer vs Transformers

| 维度       | Transformers                            | SentenceTransformer                |
| ---------- | --------------------------------------- | ---------------------------------- |
| 定位       | 底层模型库，输出 token-level 向量       | 上层封装，输出 sentence-level 向量 |
| 使用复杂度 | 需手动实现池化（mean/CLS）              | 一行 `.encode()` 搞定              |
| 典型代码   | `outputs.last_hidden_state.mean(dim=1)` | `model.encode("text")`             |

**关系**：SentenceTransformer 底层基于 Transformers，内置了池化层并针对句子相似度任务进行了微调。

好的，我来为你添加 BGE-M3 同时生成稠密和稀疏向量的完整代码示例。

首先需要在笔记的 **第 4 节（SPLADE 模型原理与使用）** 之后，新增一个小节来介绍 BGE-M3；然后在 **第 3 节（混合检索实现）** 中补充使用 BGE-M3 的完整代码。

### 4.4 BGE-M3：一站式生成稠密+稀疏向量

#### 4.4.1 BGE-M3 简介

BGE-M3（BAAI General Embedding Model 3）是北京智源研究院开源的**多功能 Embedding 模型**，“M3”代表：

- **Multi-Functionality（多功能）**：同时支持稠密检索、稀疏检索和多向量检索
- **Multi-Linguality（多语言）**：支持 100+ 种语言
- **Multi-Granularity（多粒度）**：可处理从短句到长达 8192 token 的长文档

相比 SPLADE，BGE-M3 的优势在于**一个模型同时输出两种向量**，无需分别加载不同的模型。

#### 4.4.2 安装依赖
```bash
pip install pymilvus[model]   # 包含 BGE-M3 所需的 FlagEmbedding
# 或单独安装
pip install pymilvus FlagEmbedding
```

#### 4.4.3 使用 PyMilvus 内置的 BGEM3EmbeddingFunction

PyMilvus 已经封装了 BGE-M3 的调用接口，使用非常简单：
```python
from pymilvus import model

# 初始化 BGE-M3 模型
bge_m3_ef = model.hybrid.BGEM3EmbeddingFunction(
    model_name='BAAI/bge-m3',    # 模型名称
    device='cpu',                # 使用 CPU，可改为 'cuda:0' 使用 GPU
    use_fp16=False,              # CPU 时设为 False
    return_dense=True,           # 返回稠密向量
    return_sparse=True,          # 返回稀疏向量
    return_colbert_vecs=False,   # 是否返回 ColBERT 向量（可选）
    normalize_embeddings=True    # 是否归一化
)

# 待编码的文本
docs = [
    "Milvus 是一个开源的向量数据库，支持高效的向量检索。",
    "混合检索结合了稠密向量和稀疏向量的优势。",
    "BGE-M3 模型可以同时生成稠密和稀疏向量。"
]

# 编码文档
embeddings = bge_m3_ef.encode_documents(docs)

# 查看输出结构
print("返回的键:", embeddings.keys())
# 输出: dict_keys(['dense', 'sparse'])

# 稠密向量：每个文本对应一个 1024 维的列表
print("稠密向量维度:", len(embeddings['dense'][0]))   # 1024
print("稠密向量示例:", embeddings['dense'][0][:5])

# 稀疏向量：以 CSR 格式存储的稀疏矩阵
print("稀疏向量类型:", type(embeddings['sparse']))
# 稀疏矩阵的行数 = 文档数，列数 = 词表大小（约 250002）
print("稀疏矩阵形状:", embeddings['sparse'].shape)

# 将稀疏矩阵转换为列表格式（便于查看）
sparse_list = embeddings['sparse'].tolil()  # 转换为 List of Lists 格式
for i, doc in enumerate(docs):
    non_zero = sparse_list[i].nonzero()
    print(f"文档 {i+1} 的非零 token 数量: {len(non_zero[1])}")
```

**输出示例**：```
返回的键: dict_keys(['dense', 'sparse'])
稠密向量维度: 1024
稠密向量示例: [-0.02505937, -0.00142193, 0.04015467, -0.02094924, 0.02623661]
稀疏向量类型: <class 'scipy.sparse.csr.csr_matrix'>
稀疏矩阵形状: (3, 250002)
文档 1 的非零 token 数量: 15
文档 2 的非零 token 数量: 12
文档 3 的非零 token 数量: 18
```

#### 4.4.4 将 BGE-M3 输出转换为 Milvus 兼容格式

Milvus 的 `sparse_vector` 字段接受两种格式：
1. **字典格式**：`{token_id: weight, ...}`
2. **CSR 矩阵**（可直接使用）

BGEM3EmbeddingFunction 返回的 `embeddings['sparse']` 就是 CSR 矩阵，可以直接用于插入或查询。
```python
# 方式1：直接使用 CSR 矩阵（推荐，性能好）
sparse_vectors = embeddings['sparse']   # 直接用于 Milvus

# 方式2：转换为字典列表（便于调试查看）
def csr_to_dict_list(sparse_matrix):
    """将 CSR 矩阵转换为字典列表"""
    dict_list = []
    lil_matrix = sparse_matrix.tolil()
    for i in range(sparse_matrix.shape[0]):
        row = lil_matrix[i]
        indices = row.nonzero()[1]
        data = row.data
        dict_list.append({str(idx): float(val) for idx, val in zip(indices, data)})
    return dict_list

sparse_dict_list = csr_to_dict_list(embeddings['sparse'])
print("字典格式示例:", sparse_dict_list[0])
# 输出: {"128": 0.32, "4521": 0.87, ...}
```

---

### 4.5 BGE-M3 vs SPLADE 对比

| 维度         | BGE-M3                                | SPLADE                 |
| ------------ | ------------------------------------- | ---------------------- |
| 输出类型     | 稠密向量 + 稀疏向量                   | 仅稀疏向量             |
| 模型参数量   | ~560M                                 | ~110M                  |
| 支持语言     | 100+ 种                               | 英文为主               |
| 最大输入长度 | 8192 token                            | 512 token              |
| 术语扩展能力 | 较强（通过 MLM head）                 | 强（专门设计）         |
| 适用场景     | 多语言、长文档、需要稠密+稀疏统一来源 | 纯英文、侧重关键词扩展 |

**选择建议**：

- 如果你**同时需要稠密和稀疏向量**，BGE-M3 是最便捷的选择（一个模型搞定）
- 如果只需要**稀疏向量且以英文为主**，SPLADE 仍是优秀的选项
- 在生产环境中，可以两种都尝试，通过离线评估选择更适合你数据的模型

---

BGE-M3 混合检索相关代码在项目中使用时, 需要注意的是：
1. 首次运行时会自动从 HuggingFace 下载 BGE-M3 模型（约 2.2GB），请确保网络通畅
2. Milvus 版本需要 2.4.0 以上才能支持稀疏向量
3. GPU 用户可将 `device` 设为 `'cuda:0'`，并设置 `use_fp16=True` 以加速推理

---

## 5. 父子块设计：如何存储与获取父块内容

### 5.1 设计模式

Milvus 本身不提供“关联查询”，需要在应用层通过 **`parent_id` 字段** 实现。

- **父块**：`chunk_type = "parent"`，`parent_id = None`
- **子块**：`chunk_type = "child"`，`parent_id` 指向父块的 `id`

### 5.2 插入父子块数据
```python
data = [
    # 父块
    {
        "id": "parent_001",
        "text": "Milvus 是一个向量数据库，支持稠密和稀疏向量混合检索。",
        "parent_id": None,
        "chunk_type": "parent",
        "dense_vector": [...],   # 768维
        "sparse_vector": {...}
    },
    # 子块1
    {
        "id": "child_001_1",
        "text": "Milvus 支持稠密向量检索。",
        "parent_id": "parent_001",
        "chunk_type": "child",
        "dense_vector": [...],
        "sparse_vector": {...}
    },
    # 子块2
    {
        "id": "child_001_2",
        "text": "Milvus 支持稀疏向量检索。",
        "parent_id": "parent_001",
        "chunk_type": "child",
        ...
    }
]
client.insert("knowledge_base", data)
```

### 5.3 检索子块并获取父块内容
```python
def search_with_parent(query_vec, top_k=3):
    # 1. 混合检索，只检索子块
    search_res = client.hybrid_search(
        collection_name="knowledge_base",
        reqs=[...],   # 同上
        filter="chunk_type == 'child'",
        output_fields=["text", "parent_id"],
        limit=top_k
    )
    
    # 2. 收集所有的 parent_id
    parent_ids = set()
    for hits in search_res:
        for hit in hits:
            pid = hit['entity']['parent_id']
            if pid:
                parent_ids.add(pid)
    
    # 3. 批量查询父块
    parent_map = {}
    if parent_ids:
        res = client.get(
            collection_name="knowledge_base",
            ids=list(parent_ids),
            output_fields=["text", "id"]
        )
        for item in res:
            parent_map[item['id']] = item['entity']['text']
    
    # 4. 组装结果
    final = []
    for hits in search_res:
        for hit in hits:
            pid = hit['entity']['parent_id']
            final.append({
                "child_text": hit['entity']['text'],
                "parent_text": parent_map.get(pid, ""),
                "score": hit['score']
            })
    return final
```

> **优化建议**：若频繁需要父块文本，可在子块中冗余存储 `parent_content` 字段，避免二次查询。

---

## 6. RRF 中 k 值的影响（进阶）

RRF 融合分数公式：  `RRF_score(d) = Σ 1 / (k + rank_i(d))`

- **小 k（如 1~10）**：排名靠前的文档获得极大权重，靠后的文档几乎忽略 → 适合子检索器质量极高、只需 top 结果的场景。
- **k = 60（默认）**：衰减平滑，给所有文档合理权重，被广泛验证为最佳实践。
- **大 k（如 200+）**：排名差异影响小，趋向于平均加权 → 适合需要“民主”融合或各子检索器置信度不均衡的场景。

**结论**：没有特殊需求时，**保持 `k=60` 即可**。

---

## 7. 总结：技术选型速查表

| 场景                  | 推荐方案                                           | 代码/工具                                         |
| --------------------- | -------------------------------------------------- | ------------------------------------------------- |
| 同时生成稠密+稀疏向量 | **BGE-M3**（一个模型解决两种需求）                 | `pymilvus.model.hybrid.BGEM3EmbeddingFunction`    |
| 仅生成稀疏向量        | SPLADE（神经术语扩展）                             | `pymilvus.model.sparse.SpladeEmbeddingFunction`   |
| 快速原型（稀疏向量）  | BM25 + Milvus Function                             | `FunctionType.BM25` 自动生成                      |
| 稠密向量生成          | BGE / OpenAI / all-MiniLM                          | `pymilvus.model.DefaultEmbeddingFunction`         |
| 索引类型              | 稠密：HNSW / IVF_FLAT；稀疏：SPARSE_INVERTED_INDEX | 见上文代码                                        |
| 混合检索              | `hybrid_search` + RRF                              | `rerank={"strategy": "rrf", "params": {"k": 60}}` |
| 获取父块上下文        | 应用层通过 `parent_id` 二次查询                    | `client.get()` 批量获取                           |

---

## 8. 延伸学习资源

- [Milvus 官方文档 – 混合检索](https://milvus.io/docs/hybrid_search.md)
- [SPLADE 论文](https://arxiv.org/abs/2107.05744)
- [PyMilvus 模型集成示例](https://milvus.io/docs/embeddings.md)

---

*代码示例已适配 Milvus 2.4+ 及 PyMilvus 2.4+ 版本。*