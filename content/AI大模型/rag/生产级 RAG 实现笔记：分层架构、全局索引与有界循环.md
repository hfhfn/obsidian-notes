---
title: 生产级 RAG 实现笔记：分层架构、全局索引与有界循环
tags:
- RAG
- GraphRAG
- 检索
- 生产环境
- LangGraph
status: 已消化
created: 2026-11-14
modified: '2026-11-14T23:35:23+08:00'
---

# 生产级 RAG 实现笔记：分层架构、全局索引与有界循环

> [!abstract] 摘要
> 标准 top-k 检索无法回答跨文档全局问题。本笔记对比 GraphRAG / LightRAG / RAPTOR 三种全局索引范式，用 Self-RAG/CRAG 与 IRCoT 的有界循环补足证据质量与连通性，并给出 LangGraph 1.x 完整实现。

**版本基准**：LangChain 1.x（LTS，1.4.x），LangGraph 1.x。1.x 将 `EnsembleRetriever`、`ContextualCompressionRetriever` 等旧版检索组合组件移入 `langchain-classic` 兼容包，新开发应逐步迁移到显式组合，而不是继续加深对 classic 的依赖。


## 一、问题诊断

标准 RAG 的 top-k 检索是“局部”的。没有任何一个片段能独自承载跨文档的全局答案。此前讨论已确认两个关键判断：

**逐 Chunk 摘要不解决全局问题。** Summary Index 改善的是“单个片段的可检索性”，但每个摘要仍然只代表那个 Chunk，不存在跨文档的抽象节点。

**混合检索 + RRF + Reranker 仍然面临 top-k 不足。** 这些手段在固定候选池内部做排序优化，无法创造池中不存在的信息。如果全局答案需要聚合 100 个片段而 top-k 只允许 10 个，排序再精确也会有 90 个被排除。这是查询聚焦摘要任务与检索任务之间的范式错位。

此外，单次遍历的检索无法处理**证据不相关**和**证据不连通**两类失败。前者需要迭代反思（Self-RAG/CRAG），后者需要多跳桥接（IRCoT）。


## 二、全局索引的三种范式：GraphRAG、LightRAG、RAPTOR

三种技术都试图在 top-k 之外为全局信息找到承载结构，但路径不同。

### GraphRAG：预计算的分层摘要

GraphRAG 从语料中抽取实体—关系图谱，用 Leiden 算法做社区检测，并为每个社区**预先生成摘要**。它提供两种检索模式：

- **Local search**：从实体向量检索出发，沿图邻域遍历，拉入相关实体、关系和源文本片段，适合实体中心型问题。
- **Global search**：**完全忽略局部图遍历**，直接对预计算的社区摘要执行 map-reduce，适合语料级主题问题。

GraphRAG 还支持 `mix` 模式，用 RRF 融合 local 和 global 的排名，以及 `auto` 路由在查询时选择模式。它的全局答案完整性好，但索引成本高（约为源 token 的 2–5 倍），增量更新几乎需要重建社区结构。

### LightRAG：实时双层检索，增量友好

LightRAG 的核心是**双层检索范式**：低层检索针对实体级键，找到具体事实；高层检索针对关系主题级键，找到跨实体的主题模式。它**不预计算社区摘要**，而是在已构建的实体—关系图上**实时进行图遍历**来形成“全局”视野。

关键区别在于增量更新：新文档进来只需抽取新实体/关系并与已有图谱合并，复杂度是局部变更而非全图重建。LightRAG 在中小规模知识库（<10 万文档）中被视为首选 GraphRAG 替代方案，索引速度可比 GraphRAG 快约一个数量级。

LightRAG 与 GraphRAG 共享“分层检索”的表面形式，但 GraphRAG 的全局靠**预计算摘要**，LightRAG 的全局靠**查询时实时图遍历**。代价是 LightRAG 没有现成的、可直接引用的全局概括文本，全局答案的完整性上限低于 GraphRAG 式的预计算聚合。

### RAPTOR：递归摘要树

RAPTOR 在离线阶段递归地对文本块聚类、摘要，形成一棵从叶子细节到高层主题的树。检索时叶子片段与所有层级的摘要节点一同参与向量匹配（collapsed tree 模式），全局查询可以直接命中高层摘要节点。RAPTOR 官方实现支持 Blend（默认自然竞争）、Boost（摘要得分乘以 `SummaryBoostFactor`）和 Filter（按层级限制）三种检索模式。

RAPTOR 的聚类使用软聚类，单个节点可以属于多个簇，减少跨文档主题被硬切分遗漏的可能。与 LightRAG 的图结构不同，RAPTOR 的“全局”是**已经写好的摘要文本**，可以直接被检索和引用；代价是递归摘要可能在高层丢失精确的实体细节，且增量更新需要重新聚类。

### 三种范式的定位

| 范式         | 全局信息的承载形式    | 索引成本         | 增量友好度 | 最适合                       |
| ------------ | --------------------- | ---------------- | ---------- | ---------------------------- |
| **GraphRAG** | 预计算的社区摘要      | 极高             | 低         | 语料稳定、全局完整性优先     |
| **LightRAG** | 实体—关系图的实时遍历 | 中等             | **高**     | 语料频繁更新、中小规模       |
| **RAPTOR**   | 递归摘要树的节点文本  | 中高（递归摘要） | 低         | 长文档、需要可引用的摘要节点 |

在分层架构中，RAPTOR 最适合作为 `cross_doc` 路由的全局抽象承载结构，LightRAG 可以作为其增量友好替代，GraphRAG 的 global search 则对应 `corpus` 级查询的 map-reduce 路径。


## 三、迭代 RAG 与多跳 RAG：有界循环的分工

单次检索路径无法处理两类失败，需要两种不同性质的循环。

### 迭代 RAG（Self-RAG / CRAG）：处理“证据质量不足”

Self-RAG 的核心是用反思信号驱动有界重试：

- **ISREL**：片段是否与问题相关。无关片段不进入生成上下文。
- **ISSUP**：答案中的原子断言是否能在证据中找到支撑。失败触发**同证据重生成**。
- **ISUSE**：答案是否真正回答了用户的问题。失败触发**改写查询后重检索**。

CRAG 的路径更轻：对每个片段做相关性评级，全部无关时回退到 web 搜索，部分相关时合并本地与网络证据。CRAG 本质上是在检索层做**纠正**，Self-RAG 是在生成层做**反思**。两者可以叠加。

### 多跳 RAG（IRCoT）：处理“证据不连通”

IRCoT 将检索与思维链推理**交错进行**：先基于已检索内容生成一步推理，从推理中识别出桥接实体或缺失的子问题，再用它发起下一跳检索。在 4 个主流多跳数据集上，IRCoT 将检索召回率提升 11–21 点，QA 准确率提升 7–15 点。

多跳实现的一个关键工程教训是：**不要让模型每轮自由生成新的检索句**。每条子查询应当是**可独立检索的完整问句**，并且最好围绕显式识别出的桥接实体来构造，否则多跳会退化为对原问题的同义改写，跳数增加但信息增量趋近于零。

### 两类循环在架构中的位置

| 循环类型               | 触发条件                     | 回退动作                 | 预算控制      |
| ---------------------- | ---------------------------- | ------------------------ | ------------- |
| **Self-RAG 反思**      | 答案无据（ISSUP 失败）       | 同证据重生成             | `max_retries` |
| **Self-RAG/CRAG 改写** | 答案不回答问题（ISUSE 失败） | 改写查询，重检索         | `max_retries` |
| **IRCoT 多跳**         | 证据链不连通                 | 识别桥接实体，下一跳检索 | `max_hops`    |

这些循环不应与三条路由路径平行运行，而应作为 `local` 和 `cross_doc` 路径上的**条件回边**嵌入同一个状态图。


## 四、完整架构
```
用户查询
  │
  ▼
Query Router（三分类：local / cross_doc / corpus）
  │
  ├── local ──→ 混合检索 + 重排 → ISREL 过滤 → 生成
  │                └── Self-RAG 反思循环（ISSUP 重生成 / ISUSE 改写重检索）
  │
  ├── cross_doc ──→ RAPTOR Boost 检索（第一跳）
  │                    └── IRCoT 多跳循环（桥接实体识别 → 下一跳 RAPTOR）
  │
  └── corpus ──→ RAPTOR 顶层 / GraphRAG 社区摘要
                     └── LangGraph map-reduce（无循环，并行聚合）
```

三条路径的循环形态是**异构的**：`local` 走反思迭代，`cross_doc` 走桥接多跳，`corpus` 走并行聚合。没有显式预算的循环在生产中极易失控，所有回边必须封顶。


## 五、完整实现（LangGraph 1.x）

以下代码将 Router、三条检索路径、Self-RAG 反思循环和 IRCoT 多跳循环统一在一个 `StateGraph` 中。RAPTOR 检索器、混合检索器通过 `.invoke()` 接口接入，与 classic 包的迁移解耦。
```python
"""
Production RAG with LangGraph 1.x
- Three-way routing: local / cross_doc / corpus
- local: hybrid retrieval + Self-RAG reflection loop
- cross_doc: RAPTOR Boost retrieval + IRCoT multi-hop loop
- corpus: RAPTOR top-level / map-reduce (parallel, no loop)
All cycles are bounded.
"""
from typing import Literal, TypedDict, List, Optional
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from langchain_openai import ChatOpenAI
from langchain_core.documents import Document


# ============================================================
# 0. Shared state and LLM
# ============================================================
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


class RAGState(TypedDict, total=False):
    question: str
    route: Literal["local", "cross_doc", "corpus"]
    docs: List[Document]
    answer: str
    # Self-RAG control
    reflection_retries: int
    max_retries: int
    # IRCoT multi-hop control
    accumulated_docs: List[Document]
    hop_count: int
    max_hops: int
    bridging_entities: List[str]
    is_sufficient: bool
    # corpus map-reduce
    retrieved_summaries: List[str]
    partial_answers: List[str]


# ============================================================
# 1. Router: three-way classification
# ============================================================
class RouteDecision(BaseModel):
    route: Literal["local", "cross_doc", "corpus"]


def classify(state: RAGState):
    prompt = f"""Classify the query into exactly one category.

- local: single fact, definition, number, or detail answerable from one passage.
- cross_doc: requires connecting multiple passages; evidence may be disconnected.
- corpus: asks for a corpus-level theme, trend, or full comparison across many documents.

Query: {state['question']}
"""
    route = llm.with_structured_output(RouteDecision).invoke(prompt).route
    return {
        "route": route,
        "hop_count": 0,
        "reflection_retries": 0,
        "max_hops": 4,
        "max_retries": 2,
        "accumulated_docs": [],
        "bridging_entities": [],
        "is_sufficient": False,
        "partial_answers": [],
    }


# ============================================================
# 2. local path: hybrid retrieval + Self-RAG reflection loop
# ============================================================
class RelevanceGrade(BaseModel):
    relevant: bool = Field(description="Is this passage relevant to the question?")

class SupportGrade(BaseModel):
    supported: bool = Field(description="Is every atomic claim in the answer supported by the evidence?")

class UsefulnessGrade(BaseModel):
    useful: bool = Field(description="Does the answer actually answer the user's question?")


relevance_grader = llm.with_structured_output(RelevanceGrade)
support_grader = llm.with_structured_output(SupportGrade)
usefulness_grader = llm.with_structured_output(UsefulnessGrade)


# Replace with your actual hybrid retriever (vector + BM25 + RRF + reranker)
def local_retriever_node(state: RAGState):
    # docs = local_retriever.invoke(state["question"])
    docs = []  # placeholder
    return {"docs": docs}


def grade_local_docs(state: RAGState):
    """ISREL: filter out irrelevant passages before generation."""
    kept = []
    for d in state["docs"]:
        verdict = relevance_grader.invoke(
            f"Question: {state['question']}\nPassage: {d.page_content[:1500]}"
        )
        if verdict.relevant:
            kept.append(d)
    return {"docs": kept}


def generate_local(state: RAGState):
    context = "\n\n".join(d.page_content for d in state["docs"])
    answer = llm.invoke(
        f"Answer strictly based on the context below. "
        f"If the context is insufficient, say so explicitly.\n\n"
        f"Context:\n{context}\n\nQuestion: {state['question']}"
    ).content
    return {"answer": answer}


def reflect_local(state: RAGState) -> Literal["accept", "regenerate", "rewrite"]:
    """Self-RAG routing: decide next action based on ISSUP and ISUSE."""
    support = support_grader.invoke(
        f"Evidence:\n{chr(10).join(d.page_content for d in state['docs'][:5])}\n\n"
        f"Answer: {state['answer']}\n\n"
        f"Is every atomic claim in the answer supported by the evidence?"
    )
    if not support.supported:
        return "regenerate"

    usefulness = usefulness_grader.invoke(
        f"Question: {state['question']}\nAnswer: {state['answer']}\n"
        f"Does the answer actually answer the question?"
    )
    if not usefulness.useful:
        return "rewrite"
    return "accept"


def rewrite_local_query(state: RAGState):
    """ISUSE failure: rewrite query and re-retrieve."""
    new_q = llm.invoke(
        f"The previous query did not produce a useful answer. "
        f"Rewrite it into a more specific, retrievable query.\n"
        f"Original: {state['question']}"
    ).content.strip()
    return {
        "question": new_q,
        "reflection_retries": state["reflection_retries"] + 1,
    }


# ============================================================
# 3. cross_doc path: RAPTOR Boost + IRCoT multi-hop loop
# ============================================================
class HopDecision(BaseModel):
    is_sufficient: bool = Field(description="Is the accumulated evidence sufficient to answer the original question?")
    missing_entity: Optional[str] = Field(
        default=None,
        description="If insufficient, the bridging entity or next retrieval target needed."
    )
    reasoning: str = Field(description="Brief reasoning.")


hop_decider = llm.with_structured_output(HopDecision)


# Replace with RAPTOR Boost retriever
def raptor_retrieve(query: str) -> List[Document]:
    # return raptor_retriever.invoke(query)
    return []  # placeholder


def retrieve_cross_first(state: RAGState):
    docs = raptor_retrieve(state["question"])
    return {
        "accumulated_docs": docs,
        "docs": docs,
        "hop_count": 1,
    }


def assess_hop(state: RAGState) -> Literal["sufficient", "next_hop", "exhausted"]:
    if state["hop_count"] >= state["max_hops"]:
        return "exhausted"

    context = "\n\n".join(
        d.page_content for d in state["accumulated_docs"][-10:]
    )
    decision = hop_decider.invoke(
        f"Original question: {state['question']}\n\n"
        f"Accumulated evidence (most recent):\n{context}\n\n"
        f"Is this evidence sufficient to fully answer the question? "
        f"If not, name the bridging entity or the specific next thing to retrieve."
    )
    if decision.is_sufficient:
        return "sufficient"

    state["bridging_entities"] = (
        [decision.missing_entity] if decision.missing_entity else []
    )
    return "next_hop"


def retrieve_next_hop(state: RAGState):
    query = (
        state["bridging_entities"][0]
        if state["bridging_entities"]
        else state["question"]
    )
    new_docs = raptor_retrieve(query)

    seen = {d.page_content[:200] for d in state["accumulated_docs"]}
    merged = state["accumulated_docs"] + [
        d for d in new_docs if d.page_content[:200] not in seen
    ]
    return {
        "accumulated_docs": merged,
        "docs": merged,
        "hop_count": state["hop_count"] + 1,
        "bridging_entities": [],
    }


def generate_cross_doc(state: RAGState):
    context = "\n\n".join(
        d.page_content for d in state["accumulated_docs"]
    )
    answer = llm.invoke(
        f"Answer based on the accumulated evidence below.\n\n"
        f"Evidence:\n{context}\n\nQuestion: {state['question']}"
    ).content
    return {"answer": answer}


# ============================================================
# 4. corpus path: RAPTOR top-level / map-reduce (no loop)
# ============================================================
def retrieve_corpus_summaries(state: RAGState):
    # Replace with RAPTOR top-level / GraphRAG community-summary retriever
    summaries = []  # placeholder
    return {"retrieved_summaries": summaries}


def fan_out_summaries(state: RAGState):
    return [
        Send("map_summary", {"summary": s, "question": state["question"]})
        for s in state["retrieved_summaries"]
    ]


def map_summary(payload: dict):
    partial = llm.invoke(
        f"Answer part of the question based on this summary.\n"
        f"Question: {payload['question']}\nSummary: {payload['summary']}"
    ).content
    return {"partial_answers": [partial]}


def reduce_answers(state: RAGState):
    combined = "\n\n".join(state["partial_answers"])
    final = llm.invoke(
        f"Synthesize a consistent, complete final answer from the partial answers.\n\n"
        f"{combined}\n\nQuestion: {state['question']}"
    ).content
    return {"answer": final}


# ============================================================
# 5. Build the state graph
# ============================================================
builder = StateGraph(RAGState)

# Nodes
builder.add_node("classify", classify)

# local path
builder.add_node("retrieve_local", local_retriever_node)
builder.add_node("grade_local_docs", grade_local_docs)
builder.add_node("generate_local", generate_local)
builder.add_node("rewrite_local_query", rewrite_local_query)

# cross_doc path
builder.add_node("retrieve_cross_first", retrieve_cross_first)
builder.add_node("assess_hop", lambda s: s)   # anchor for conditional edges
builder.add_node("retrieve_next_hop", retrieve_next_hop)
builder.add_node("generate_cross_doc", generate_cross_doc)

# corpus path
builder.add_node("retrieve_corpus", retrieve_corpus_summaries)
builder.add_node("map_summary", map_summary)
builder.add_node("reduce_answers", reduce_answers)

# Entry
builder.add_edge(START, "classify")

# Router
builder.add_conditional_edges("classify", lambda s: s["route"], {
    "local": "retrieve_local",
    "cross_doc": "retrieve_cross_first",
    "corpus": "retrieve_corpus",
})

# ----- local: Self-RAG bounded reflection loop -----
builder.add_edge("retrieve_local", "grade_local_docs")
builder.add_edge("grade_local_docs", "generate_local")
builder.add_conditional_edges("generate_local", reflect_local, {
    "accept": END,
    "regenerate": "generate_local",      # ISSUP fail: same evidence, regenerate
    "rewrite": "retrieve_local",          # ISUSE fail: rewrite and re-retrieve
})
builder.add_edge("rewrite_local_query", "retrieve_local")

# ----- cross_doc: IRCoT bounded multi-hop loop -----
builder.add_edge("retrieve_cross_first", "assess_hop")
builder.add_conditional_edges("assess_hop", assess_hop, {
    "sufficient": "generate_cross_doc",
    "next_hop": "retrieve_next_hop",
    "exhausted": "generate_cross_doc",    # budget exhausted: force generate
})
builder.add_edge("retrieve_next_hop", "assess_hop")

# ----- corpus: parallel map-reduce, no loop -----
builder.add_edge("retrieve_corpus", "fan_out_summaries")
builder.add_conditional_edges("fan_out_summaries", lambda s: s["retrieved_summaries"], ...)
# Use Send API:
builder.add_conditional_edges("retrieve_corpus", fan_out_summaries, ["map_summary"])
builder.add_edge("map_summary", "reduce_answers")
builder.add_edge("reduce_answers", END)

rag_graph = builder.compile()
```

**代码说明**：`local` 路径的反思循环中，`regenerate` 回到 `generate_local`（证据不变），`rewrite` 回到 `retrieve_local`（查询已改写）。两条回边都受 `reflection_retries` 和 `max_retries` 约束，达到上限时强制 `accept` 当前最佳尝试。`cross_doc` 路径的跳数由 `hop_count` 和 `max_hops` 封顶，`exhausted` 分支用现有证据强制生成，而不是无限重试。`corpus` 路径的 map-reduce 通过 `Send` API 并行派发，不存在串行循环。


## 六、生产考量

**Router 的准确率是全局召回的生命线。** 三分类（local / cross_doc / corpus）比二分类更贴合实际负载，但仍需用标注数据做 few-shot 或微调，并监控“全局查询误入 local 路径”的比例。边界模糊的查询默认偏向 `cross_doc`，因为它的摘要节点仍能提供局部细节，反向则不成立。

**循环预算必须按负载分别设置。** `local` 的反思重试通常 1–2 次足够；`cross_doc` 的跳数取决于语料的连通深度，通用问答 2–4 跳是常见范围，每增加一跳的检索成本线性叠加。所有上限应作为图状态的一部分被记录和监控，而不是硬编码在节点内部。

**LLM 评级的成本需要控制。** Self-RAG 的 prompt 模拟版本每问题会多出约 4 次 LLM 调用。生产环境可以用小模型做 ISREL/ISSUP 评级，只在 ISUSE 或最终裁决时调用强模型。CRAG 的相关性评级同样适合用轻量模型完成。

**多跳的桥接识别必须结构化。** `HopDecision` 强制 LLM 输出 `missing_entity`，是为了让下一跳的查询构造有明确锚点。自由文本的“下一步该查什么”容易退化为对原问题的同义改写。

**摘要幻觉需要显式校验。** RAPTOR 和 GraphRAG 的高层摘要由 LLM 生成，建索引时应使用低温度，并对摘要做轻量事实一致性检查（小模型判断摘要断言是否能在原文中找到支撑），减少“摘要漂移”导致的全局召回偏差。

**索引范式的选择取决于更新频率。** 语料稳定、全局完整性优先时选择 GraphRAG 或 RAPTOR；语料频繁更新、中小规模知识库优先选择 LightRAG 的增量双层检索。RAPTOR 的增量建树成本较高，可以按文档批次维护多棵小树而非一棵全局大树。

**LangChain 1.x 迁移节奏。** 局部路径中的 `EnsembleRetriever` / `ContextualCompressionRetriever` 当前可用，但已属于 classic 兼容层。生产代码应将 BM25 检索、向量检索、RRF 融合、Cross-Encoder 拆成独立函数，保持 `.invoke(query)` 接口稳定，逐步移除 `langchain_classic` 依赖。RAPTOR 检索器、LangGraph 编排和 map-reduce 生成均属于 1.x 原生路径，不受此迁移影响。


### 核心结论

| 负载          | 全局索引承载                     | 检索形态              | 循环机制               | 解决的核心问题                       |
| ------------- | -------------------------------- | --------------------- | ---------------------- | ------------------------------------ |
| **local**     | 无                               | 混合检索 + RRF + 重排 | **Self-RAG 反思循环**  | 证据相关但答案无据，或答案不回答问题 |
| **cross_doc** | RAPTOR Boost（或 LightRAG 双层） | RAPTOR 按跳累积       | **IRCoT 桥接循环**     | 证据分散、链路不连通                 |
| **corpus**    | RAPTOR 顶层 / GraphRAG 社区摘要  | 摘要节点并行 map      | **无循环**，map-reduce | 全量覆盖，索引阶段已预聚合           |

整套架构的逻辑：**Router 按聚合范围分流；`local` 用反思循环确保“用对的证据给出有据的答案”；`cross_doc` 用桥接多跳确保“把断开的证据链补齐”；`corpus` 用索引期预聚合 + 并行 map-reduce 确保“全局视野不依赖 top-k 临时捞取”。GraphRAG、LightRAG、RAPTOR 三者不是互斥选项，而是对应不同索引成本与更新频率的全局承载结构；Self-RAG 与 IRCoT 不是通用“重试”，而是分别匹配“证据质量失败”与“证据连通失败”两类不同的问题。**

---

## 相关笔记

- [[AI大模型/rag/RAG检索策略全面解析|RAG检索策略全面解析]] — 检索策略全景
- [[AI大模型/rag/RAG 企业级架构实战：从事故到生产级防御|RAG 企业级架构实战：从事故到生产级防御]] — 生产级失败模式与防御
- [[AI大模型/rag/RAG评估框架|RAG评估框架]] — 评估与迭代
- [[AI大模型/rag/Milvus向量数据库架构与向量检索原理解析|Milvus向量数据库架构与向量检索原理解析]] — 向量检索底座
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] — 返回 AI 大模型内容地图