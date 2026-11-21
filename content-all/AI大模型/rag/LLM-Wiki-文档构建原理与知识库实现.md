---
title: LLM-Wiki 文档构建原理与知识库实现
tags:
- AI大模型
- RAG
- LLM-Wiki
- 知识库
source: llm-wiki-compiler / c2kaka-llm-wilki 实现分析
status: 已消化
created: '2026-11-17T05:46:45+08:00'
modified: '2026-11-17T05:46:45+08:00'
---

# LLM-Wiki 文档构建原理与知识库实现

LLM-Wiki 的核心主张是 **“编译一次，持续复用”**，而不是查询时临时检索碎片。RAG 的典型流程是 `query → search chunks → answer → forget`，每次提问都重新发现同样的关系；LLM-Wiki 则是 `sources → compile → wiki → query → save → richer wiki → better answers`，知识以**结构化、互链的 Markdown 页面**形式持久化，查询只在已经编译好的高质量语料上进行。

### 从原始资料到 Wiki 图谱的完整链路

以 `llm-wiki-compiler` 和 `c2kaka/llm-wilki` 的实现为参照，构建过程通常分为以下阶段：

**① 摄入与去重。** 原始资料（网页、PDF、Markdown）被放入 `raw/` 或 `sources/` 目录。系统首先对每个文件计算 **SHA-256 哈希**，已经摄入过的文件自动跳过，只有新增或变更的源才会进入后续 LLM 处理。这一步保证了增量编译的可行性和成本可控性。

**② 概念提取（Phase 1）。** LLM 读取原始内容，从中抽取实体、概念、关系。关键在于**两阶段流水线**：Phase 1 先对所有源统一提取概念，Phase 2 再生成页面。这样做消除了源文件处理顺序的依赖，并且**跨多个源共享的同一概念会被合并到一个页面**，而不是产生多个互相矛盾的碎片页面。

**③ 页面生成与 `[[wikilink]]` 解析（Phase 2）。** 每个概念获得自己的独立 Markdown 页面，页面之间通过 `[[PageName]]` 双向链接。一个源文件通常会触发 **5–15 个页面的创建或更新**，这是正常的，因为一个概念往往与已有的多个实体和主题相连。已有页面用新信息更新而非覆盖，新页面使用模板创建（如 `concept.md`、`person.md`），同时进行**反向链接审计**——在现有页面中搜索新页面标题，补充缺失的 `[[wikilink]]`。

**④ `index.md` 生成。** 所有页面的目录被自动汇总到 `index.md`，作为查询时的**第一入口**。查询时如果无法使用混合检索，系统会先读 `index.md`，通过标题和描述匹配定位相关页面，再跟随一层 `[[wikilink]]` 获取上下文。`index.md` 是 LLM-Wiki 区别于扁平 RAG 索引的关键结构：它是一份**人类可读的导航目录**，而不是不可解释的向量邻域。

**⑤ 图谱构建。** 每个页面的正文中的 `[[链接]]` 被扫描，生成 `{ nodes, edges }` 结构。节点是页面，边是有向的 wikilink（自动去重、剔除自链接和章节锚点）。整张图会按页面集合缓存，笔记变更时才失效重建，因此后续查询的图操作几乎零开销。

**一个具体示例**：假设 `raw/transformer.md` 被摄入，LLM 提取出“Transformer”“自注意力”“对比学习”三个概念。Phase 1 发现“对比学习”在另一篇 `raw/simclr.md` 中也被提及，于是两个源的概念被合并。Phase 2 生成三个页面，并在 `Transformer.md` 中写入 `[[对比学习]]` 链接。即使“对比学习”这个词从未出现在 `Transformer` 的标题中，图谱中的这条边使得 PPR 或图扩展能够从“对比学习”的查询种子游走到 `Transformer` 页面。

---

## 模式一：`index.md` + `wikilink` + PPR 图导航

这个模式**不使用嵌入、不使用 BM25 作为主检索信号**。它的检索逻辑是：先从 `index.md` 和页面元数据中确定少量**种子页面**，然后在 `wikilink` 构成的图上运行 Personalized PageRank，把与种子相连的页面按与本次查询的相关度排序拉入上下文。

`obsidian-llm-wiki` 的实际实现中，种子选择是一个**5 级级联**，前一级成功就不再调用后一级的 LLM：

| 级别       | 策略                           | 何时触发         |
| ---------- | ------------------------------ | ---------------- |
| Stage 1    | 对标题+别名做 BM25F 词法打分   | 总是最先执行     |
| Stage 1.5a | LLM 从问题中提取 5–10 个概念名 | Stage 1 信号偏弱 |
| Stage 1.5b | 关键词全库子串扫描             | 有关键词时       |
| Fallback   | 放弃 Wiki，LLM 凭通用知识回答  | 前几级一无所获   |
| Stage 3    | PPR 图扩展                     | 只要有种子就执行 |

PPR 本身用**蒙特卡洛随机游走**近似：从种子页面出发，每次游走以 0.30 的概率“瞬移”回种子（damping 系数），否则随机沿一条出链跳转，遇到死胡同也瞬移回种子；统计每个页面被经过的次数并归一化，得到相对于本次查询的相关度得分。生产参数通常是 **3000 次游走 × 每次最多 10 步**。由于游走是采样的，同一个问题的排名需要可复现，实现中会用“问题文本 + 种子集合”的哈希作为随机种子。

下面的实现用 `networkx.pagerank` 的 `personalization` 参数来完成同一件事（Power Iteration 而非蒙特卡洛，结果确定且无需采样），检索层保持“零嵌入、零向量库”。

```python
"""
模式一：index.md + wikilink + PPR 图导航
零嵌入 / 零向量库；检索 = 种子选择 → 图上 Personalized PageRank → 取 Top 页面
"""
import re
from typing import List, Dict, Set
import networkx as nx

# ============================================================
# 1. 模拟 LLM-Wiki 编译产物：页面 + wikilink + index.md
# ============================================================

WIKI_PAGES: Dict[str, dict] = {
    "Transformer": {
        "title": "Transformer",
        "aliases": ["Transformer 模型", "自注意力架构"],
        "body": "Transformer 是一种基于 [[自注意力]] 的序列建模架构。"
                "与 RNN 不同，它不依赖循环结构。"
                "在对比学习中，Transformer 常作为编码器骨干。",
    },
    "自注意力": {
        "title": "自注意力",
        "aliases": ["Self-Attention"],
        "body": "自注意力让序列中每个位置直接 attend 到其他所有位置。"
                "它是 [[Transformer]] 的核心组件。",
    },
    "对比学习": {
        "title": "对比学习",
        "aliases": ["Contrastive Learning"],
        "body": "对比学习通过拉近正样本、推开负样本来学习表征。"
                "SimCLR 使用 [[Transformer]] 或 ResNet 作为编码器。"
                "它与 [[自监督学习]] 密切相关。",
    },
    "自监督学习": {
        "title": "自监督学习",
        "aliases": ["Self-Supervised Learning"],
        "body": "自监督学习从数据本身构造监督信号。"
                "[[对比学习]] 是自监督学习的一种主流范式。",
    },
    "SimCLR": {
        "title": "SimCLR",
        "aliases": ["SimCLR 框架"],
        "body": "SimCLR 是对比学习的经典框架，"
                "使用 [[对比学习]] 目标训练编码器。",
    },
}

INDEX_MD = """
# Wiki Index

## 概念
- [[Transformer]] — 基于自注意力的序列建模架构
- [[自注意力]] — Transformer 的核心组件
- [[对比学习]] — 通过正负样本学习表征
- [[自监督学习]] — 从数据本身构造监督信号
- [[SimCLR]] — 对比学习经典框架
"""


# ============================================================
# 2. 从 wikilink 构建有向图（对应 build-graph.ts 的逻辑）
# ============================================================

def build_graph(pages: Dict[str, dict]) -> nx.DiGraph:
    G = nx.DiGraph()
    G.add_nodes_from(pages.keys())
    for page_name, page in pages.items():
        links = re.findall(r"\[\[([^\]]+)\]\]", page["body"])
        for link in links:
            link = link.strip()
            if link in pages and link != page_name:   # 剔除自链接和死链
                G.add_edge(page_name, link)
    return G


GRAPH = build_graph(WIKI_PAGES)


# ============================================================
# 3. 种子选择：index.md 词法匹配 + 标题/别名匹配
#    这是 obsidian-llm-wiki 5 级级联的简化版 Stage 1
# ============================================================

def tokenize(text: str) -> Set[str]:
    text = text.lower()
    return set(re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]", text))


def select_seeds(query: str, pages: Dict[str, dict], max_seeds: int = 3) -> List[str]:
    """
    对每个页面，用查询词在 title + aliases + body 上做词法覆盖度打分。
    覆盖度 = 查询 token 中被页面命中的比例。
    取覆盖度最高的 max_seeds 个页面作为种子。
    """
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    scores = []
    for name, page in pages.items():
        page_text = f"{page['title']} {' '.join(page['aliases'])} {page['body']}"
        page_tokens = tokenize(page_text)
        overlap = query_tokens & page_tokens
        if overlap:
            coverage = len(overlap) / len(query_tokens)
            scores.append((name, coverage))

    scores.sort(key=lambda x: x[1], reverse=True)
    # 只保留覆盖度达到阈值的种子，避免把弱匹配页面强行当种子
    seeds = [name for name, cov in scores if cov >= 0.3][:max_seeds]
    return seeds


# ============================================================
# 4. Personalized PageRank 图扩展
#    用 networkx.pagerank 的 personalization 参数实现 PPR
# ============================================================

def ppr_retrieve(
    query: str,
    graph: nx.DiGraph,
    pages: Dict[str, dict],
    alpha: float = 0.85,
    budget: int = 10,
) -> List[dict]:
    """
    alpha 是 damping 参数，对应蒙特卡洛实现中 0.30 的“瞬移回种子”概率的补。
    budget 是最终交给 LLM 的页面预算（obsidian-llm-wiki 默认 RETRIEVAL_BUDGET = 20）。
    """
    seeds = select_seeds(query, pages)
    if not seeds:
        return []

    # personalization 向量：种子均匀分配权重，非种子为 0
    personalization = {node: 0.0 for node in graph.nodes}
    for s in seeds:
        personalization[s] = 1.0 / len(seeds)

    ppr_scores = nx.pagerank(
        graph,
        alpha=alpha,
        personalization=personalization,
    )

    # 按 PPR 分数排序，取 Top budget
    ranked = sorted(ppr_scores.items(), key=lambda x: x[1], reverse=True)[:budget]

    results = []
    for rank, (page_name, score) in enumerate(ranked):
        if score <= 0:
            continue
        page = pages[page_name]
        results.append({
            "rank": rank,
            "page_id": page_name,
            "title": page["title"],
            "content": page["body"],
            "ppr_score": round(score, 6),
            "is_seed": page_name in seeds,
            "seeds": seeds,
        })
    return results


# ============================================================
# 5. 查询
# ============================================================

def ask_ppr(query: str) -> dict:
    retrieved = ppr_retrieve(query, GRAPH, WIKI_PAGES)
    if not retrieved:
        return {"answer": "未在图谱中找到相关页面。", "citations": []}

    # 交给 LLM 的上下文：页面正文，保留 [[wikilink]] 作为引用形态
    context = "\n\n".join(
        f"[Page {i}] {r['title']}\n{r['content']}"
        for i, r in enumerate(retrieved)
    )

    # 真实场景调用 LLM；此处返回模拟答案以展示引用形态
    answer = (
        "对比学习通过拉近正样本、推开负样本学习表征 "
        "（参见 [[对比学习]]）。"
        "SimCLR 是它的经典框架（参见 [[SimCLR]]）。"
    )

    return {
        "answer": answer,
        "citations": [
            {
                "page_id": r["page_id"],
                "title": r["title"],
                "ppr_score": r["ppr_score"],
                "is_seed": r["is_seed"],
                "cited_snippet": r["content"][:120],
            }
            for r in retrieved
            if f"[[{r['page_id']}]]" in answer   # 按答案中的 wikilink 回填
        ],
        "retrieved_all": retrieved,
    }


if __name__ == "__main__":
    result = ask_ppr("对比学习是什么")
    print("=== PPR 检索结果 ===")
    for r in result["retrieved_all"]:
        print(f"  [{r['rank']}] {r['title']}  PPR={r['ppr_score']:.4f}  seed={r['is_seed']}")
    print("\n=== 答案 ===")
    print(result["answer"])
    print("\n=== 引用 ===")
    for c in result["citations"]:
        print(f"  [[{c['page_id']}]]  PPR={c['ppr_score']:.4f}  seed={c['is_seed']}")
```

**运行效果**：查询“对比学习是什么”时，`select_seeds` 很可能把“对比学习”和“SimCLR”选为种子。PPR 会以这两个页面为起点在图上游走，`Transformer` 和 `自监督学习` 虽然标题中不含“对比学习”，但因为与种子页面有直接 wikilink 边，PPR 分数会被拉高，出现在结果中。这正是图导航相对于纯词法检索的**多跳召回**优势。

---

## 模式二：BM25 + 向量 + 可选图扩展（混合检索）

这个模式以**词法检索（BM25）和语义检索（向量）** 为两路基础信号，通过 **RRF（Reciprocal Rank Fusion）** 融合，图扩展作为**可选的第三路信号**叠加。LangChain 1.0 中 `EnsembleRetriever` 仍然可用，内部就是 RRF：它把来自 BM25 和向量检索的两个不可通约的分数尺度（TF-IDF vs 余弦相似度）转化为**排名**再融合，避免了分数校准问题。

下面的实现中，向量检索用一个**轻量的字符 n-gram 余弦相似度**代替外部嵌入服务，使代码自包含；真实生产环境中把 `DenseRetriever` 替换为 `OpenAIEmbeddings` + `Chroma` 即可，`EnsembleRetriever` 的接口不变。

```python
"""
模式二：BM25 + 向量（n-gram 余弦，可替换为嵌入）+ 可选图扩展
LangChain 1.0：EnsembleRetriever 做 RRF 融合；图扩展作为可选第三路
"""
import re
from typing import List
from collections import Counter
import math

from langchain_core.documents import Document
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever


# ============================================================
# 1. Wiki 页面 → Document（与模式一共用同一套数据）
#    实际使用时从 wiki/ 目录读取 Markdown + frontmatter
# ============================================================

WIKI_DATA = {
    "Transformer": {
        "title": "Transformer",
        "body": "Transformer 是一种基于自注意力的序列建模架构。与 RNN 不同，它不依赖循环结构。在对比学习中，Transformer 常作为编码器骨干。",
    },
    "自注意力": {
        "title": "自注意力",
        "body": "自注意力让序列中每个位置直接 attend 到其他所有位置。它是 Transformer 的核心组件。",
    },
    "对比学习": {
        "title": "对比学习",
        "body": "对比学习通过拉近正样本、推开负样本来学习表征。SimCLR 使用 Transformer 或 ResNet 作为编码器。它与自监督学习密切相关。",
    },
    "自监督学习": {
        "title": "自监督学习",
        "body": "自监督学习从数据本身构造监督信号。对比学习是自监督学习的一种主流范式。",
    },
    "SimCLR": {
        "title": "SimCLR",
        "body": "SimCLR 是对比学习的经典框架，使用对比学习目标训练编码器。",
    },
}

docs = [
    Document(
        page_content=f"{v['title']}\n{v['body']}",
        metadata={"page_id": k, "title": v["title"]},
    )
    for k, v in WIKI_DATA.items()
]


# ============================================================
# 2. BM25 检索器（中文按字切分）
# ============================================================

def chinese_preprocess(text: str) -> List[str]:
    text = text.lower()
    return re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]", text)


bm25_retriever = BM25Retriever.from_documents(
    docs, k=3, preprocess_func=chinese_preprocess
)


# ============================================================
# 3. 轻量“向量”检索器：字符 n-gram 余弦相似度
#    替换为真实嵌入时，只需把 embed() 换成 embeddings.embed_query / embed_documents
# ============================================================

def ngrams(text: str, n: int = 2) -> Counter:
    text = re.sub(r"\s+", "", text.lower())
    return Counter(text[i:i+n] for i in range(len(text) - n + 1))


def cosine(a: Counter, b: Counter) -> float:
    keys = set(a) | set(b)
    dot = sum(a[k] * b[k] for k in keys)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class DenseRetriever:
    """接口与 LangChain Retriever 对齐：invoke(query) -> List[Document]"""

    def __init__(self, documents: List[Document], k: int = 3):
        self.documents = documents
        self.k = k
        self.doc_vecs = [ngrams(d.page_content) for d in documents]

    def invoke(self, query: str) -> List[Document]:
        qv = ngrams(query)
        scored = [
            (cosine(qv, dv), doc)
            for dv, doc in zip(self.doc_vecs, self.documents)
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scored[:self.k]]


dense_retriever = DenseRetriever(docs, k=3)


# ============================================================
# 4. EnsembleRetriever：RRF 融合 BM25 + 向量
# ============================================================

ensemble_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.4, 0.6],   # 可按场景调整；RRF 内部按排名融合，权重影响各路贡献
)


# ============================================================
# 5. 可选：图扩展（第三路信号）
#    以 Ensemble 的 Top-K 为种子，沿 wikilink 图扩一跳
# ============================================================

def build_wikilink_edges() -> dict:
    edges = {}
    for k, v in WIKI_DATA.items():
        links = re.findall(r"\[\[([^\]]+)\]\]", v["body"])
        edges[k] = [l.strip() for l in links if l.strip() in WIKI_DATA and l.strip() != k]
    return edges


WIKILINK_EDGES = build_wikilink_edges()


def graph_expand(
    docs: List[Document],
    edges: dict,
    max_expanded: int = 2,
) -> List[Document]:
    """
    从 Ensemble 结果中的页面出发，沿出链扩展。
    已经出现在结果中的页面不重复加入。
    """
    existing_ids = {d.metadata["page_id"] for d in docs}
    candidates = []
    for d in docs:
        src = d.metadata["page_id"]
        for neighbor in edges.get(src, []):
            if neighbor not in existing_ids:
                candidates.append(neighbor)

    # 按出现频次排序，取最高频的邻接页
    freq = Counter(candidates)
    expanded_ids = [pid for pid, _ in freq.most_common(max_expanded)]

    expanded_docs = []
    for pid in expanded_ids:
        v = WIKI_DATA[pid]
        expanded_docs.append(Document(
            page_content=f"{v['title']}\n{v['body']}",
            metadata={"page_id": pid, "title": v["title"], "via_graph": True},
        ))
    return expanded_docs


# ============================================================
# 6. 查询：混合检索 → 可选图扩展 → 生成带引用的答案
# ============================================================

def ask_hybrid(query: str, use_graph_expand: bool = True) -> dict:
    # 6.1 混合检索
    docs = ensemble_retriever.invoke(query)
    if not docs:
        return {"answer": "未找到相关内容。", "citations": []}

    # 6.2 可选图扩展
    graph_docs = []
    if use_graph_expand:
        graph_docs = graph_expand(docs, WIKILINK_EDGES)

    all_docs = docs + graph_docs

    # 6.3 构造上下文（编号用于结构化引用）
    context = "\n\n".join(
        f"[Source {i}] {d.metadata['title']}\n{d.page_content}"
        for i, d in enumerate(all_docs)
    )

    # 真实场景调用 with_structured_output(CitedAnswer)；
    # 此处返回模拟答案，引用编号对应上面 [Source i] 的索引
    answer = (
        "对比学习通过正负样本学习表征 [0]。"
        "SimCLR 是经典框架 [1]。"
        "Transformer 常作为对比学习的编码器骨干 [2]。"
    )

    # 6.4 解析引用编号并回填溯源
    cited_ids = sorted({int(m) for m in re.findall(r"\[(\d+)\]", answer)})
    citations = []
    for cid in cited_ids:
        if 0 <= cid < len(all_docs):
            d = all_docs[cid]
            citations.append({
                "citation_id": cid,
                "page_id": d.metadata["page_id"],
                "title": d.metadata["title"],
                "cited_snippet": d.page_content[:120],
                "via_graph": d.metadata.get("via_graph", False),
            })

    return {
        "answer": answer,
        "citations": citations,
        "retrieved_all": [
            {"page_id": d.metadata["page_id"], "via_graph": d.metadata.get("via_graph", False)}
            for d in all_docs
        ],
    }


if __name__ == "__main__":
    result = ask_hybrid("对比学习是什么", use_graph_expand=True)
    print("=== 检索到的页面 ===")
    for r in result["retrieved_all"]:
        tag = " (图扩展)" if r["via_graph"] else ""
        print(f"  {r['page_id']}{tag}")
    print("\n=== 答案 ===")
    print(result["answer"])
    print("\n=== 引用 ===")
    for c in result["citations"]:
        tag = " [图扩展]" if c["via_graph"] else ""
        print(f"  [{c['citation_id']}] {c['title']} (page_id: {c['page_id']}){tag}")
```

**关键工程点**：

**RRF 融合避免分数校准。** BM25 的 TF-IDF 分数和余弦相似度没有可比性。`EnsembleRetriever` 不试图把两者放到同一尺度上，而是分别取排名，用 `1/(k + rank)` 融合。`weights=[0.4, 0.6]` 是常见的起点，实际调优时根据查询类型调整——精确术语查询可提高 BM25 权重，模糊语义查询可提高向量权重。

**图扩展是第三路“可选”信号。** 它与 PPR 模式的区别在于：图扩展只做**一跳邻居扩展**，而不是全图 PageRank 传播。它作为 Ensemble 之后的**精排/补召**步骤，成本低、可控性强。如果不需要，`use_graph_expand=False` 即可退化为纯混合检索。

**引用回填与之前一致。** 无论检索层用 PPR、混合检索还是图扩展，引用溯源的最终环节仍然是：**每个 chunk 在上下文中有稳定编号 → 模型输出引用的编号 → 用编号映射回 `Document.metadata`**。检索策略的变化不影响引用层的接口。

---

## 两种模式的取舍

**模式一（`index.md` + `wikilink` + PPR）** 的优势是**零嵌入、完全可解释、排名可复现**。每一条引用都可以追溯到确定的 `[[PageName]]` 链接和 PPR 分数，不需要外部嵌入服务，隐私面最小。代价是当页面规模过大、链接网络过于稠密时，种子选择可能变得困难，PPR 的排序信号也可能被“高人气”页面稀释。它适合**个人或团队的中小型知识库、对引用可验证性要求极高、愿意维护页面间链接质量**的场景。

**模式二（BM25 + 向量 + 可选图扩展）** 的优势是**召回覆盖面广**：BM25 抓住精确术语，向量抓住同义改写，图扩展补充多跳关联。`EnsembleRetriever` 的接口在 LangChain 1.0 中保持稳定，替换向量后端（从 n-gram 余弦到真实嵌入）只需改 `DenseRetriever` 的内部实现。代价是引入了嵌入服务的依赖和成本，引用溯源的可靠性更多依赖**结构化输出约束**（`with_structured_output`）而非链接的确定性。它适合**页面规模较大、查询语义分布广、团队已经具备嵌入基础设施**的生产环境。

两种模式并不互斥。一种务实的生产架构是：**用 `index.md` + `wikilink` 作为知识层的组织骨架，用混合检索（BM25 + 向量）作为默认召回路径，图扩展（或 PPR）作为可选的召回增强**。知识构建层始终保持 Markdown + wikilink 的可读、可版本化形态，检索层根据规模 and 精度需求动态选择信号组合，引用层则统一通过 chunk 编号 → `Document.metadata` → 原始 `source_files` 的链路回填溯源。

---

## 相关笔记

- [[AI大模型/rag/LLM-Wiki风格RAG-引用溯源|LLM-Wiki 风格 RAG + 引用溯源（LangChain 1.0）]] — 姊妹篇：LangChain 1.0 落地代码与引用溯源
- [[AI大模型/rag/企业知识库选型-RAG vs LLM Wiki vs Ontology|企业知识库选型：RAG vs LLM Wiki vs Ontology]] — 三者定位与选型边界
- [[AI大模型/rag/生产级 RAG 实现笔记：分层架构、全局索引与有界循环|生产级 RAG 实现笔记：分层架构、全局索引与有界循环]] — GraphRAG / LightRAG 全局索引范式
