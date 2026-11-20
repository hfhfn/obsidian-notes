---
title: LLM-Wiki 风格 RAG + 引用溯源（LangChain 1.0）
tags:
- AI大模型
- RAG
- LangChain
- 引用溯源
source: LangChain 1.0 重写版实现
status: 已消化
created: '2026-11-17T05:46:45+08:00'
modified: '2026-11-17T05:46:45+08:00'
---

# LLM-Wiki 风格 RAG + 引用溯源（LangChain 1.0）

---

下面是**完全基于 LangChain 1.0 重写后的版本**。核心变化在于：**不再使用 `create_retrieval_chain` / `create_stuff_documents_chain`**（这两个辅助链在 1.0 中已被移除），改为用 **`Document` + `BM25Retriever` + `with_structured_output`** 显式编排。引用溯源不再依赖正则解析 `[n]`，而是用 Pydantic schema **强制模型返回它实际引用的 chunk ID**，再将 ID 映射回 `Document.metadata` 中的 `page_id` 和 `source_files`。

---

## 完整代码：LangChain 1.0 实现

依赖安装：
```bash
pip install -U langchain>=1.0 langchain-core>=1.0 langchain-community>=0.4 langchain-openai>=1.0 rank-bm25 pydantic
```
```python
"""
LLM-Wiki 风格 RAG + 引用溯源 —— LangChain 1.0 实现

关键变化（相对于手动 rank-bm25 版本）：
1. 用 langchain_core.documents.Document 承载 Wiki 页面，metadata 携带 page_id / source_files
2. 用 langchain_community.retrievers.BM25Retriever 替代手动 BM25 封装
3. 用 with_structured_output(CitedAnswer) 强制模型返回 cited_ids，替代正则解析 [n]
4. 不再使用 create_retrieval_chain（1.0 已移除），用显式函数编排
"""

import re
from typing import List

from pydantic import BaseModel, Field

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_community.retrievers import BM25Retriever


# ============================================================
# 1. LLM-Wiki 语料层：每个 Wiki 页面 → 一个 Document
#    metadata 保留 page_id、source_files，用于后续溯源回填
# ============================================================

WIKI_PAGES = [
    {
        "page_id": "concepts/refund-policy",
        "title": "退款政策",
        "content": "所有客户均可在购买后 30 天内申请退款。"
                   "退款将原路返回至支付账户，处理时间为 3–5 个工作日。"
                   "定制商品除外。",
        "source_files": ["raw/ingested/2026/04/refund-policy.md"],
    },
    {
        "page_id": "concepts/custom-product",
        "title": "定制商品规则",
        "content": "定制商品一经制作，不支持 30 天无理由退款，"
                   "除非存在质量问题。质量问题需在收货后 7 天内提交凭证。",
        "source_files": ["raw/ingested/2026/04/custom-product.md"],
    },
    {
        "page_id": "concepts/shipping-time",
        "title": "发货时效",
        "content": "现货商品在订单确认后 24 小时内发出。"
                   "预售商品发货时间以商品详情页标注为准。",
        "source_files": ["raw/ingested/2026/04/shipping.md"],
    },
]

wiki_docs = [
    Document(
        page_content=f"{p['title']}\n{p['content']}",
        metadata={
            "page_id": p["page_id"],
            "title": p["title"],
            "source_files": p["source_files"],
        },
    )
    for p in WIKI_PAGES
]


# ============================================================
# 2. RAG 检索层：在 Wiki 页面上做 BM25 检索
#    LangChain 1.0 中 BM25Retriever 仍可从 langchain_community 使用
# ============================================================

def build_bm25_retriever(docs: List[Document], k: int = 3) -> BM25Retriever:
    """
    BM25Retriever 使用 rank_bm25 包。
    中文场景下 rank_bm25 的默认分词按空格切分不够理想，
    可通过 preprocess_func 传入自定义分词函数。
    """
    def chinese_preprocess(text: str) -> List[str]:
        text = text.lower()
        # 英文按词，中文按字；实际生产可换成 jieba
        return re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]", text)

    return BM25Retriever.from_documents(
        docs,
        k=k,
        preprocess_func=chinese_preprocess,
    )


retriever = build_bm25_retriever(wiki_docs, k=3)


# ============================================================
# 3. 结构化引用输出 schema
#    用 with_structured_output 强制模型返回 cited_ids
# ============================================================

class CitedAnswer(BaseModel):
    answer: str = Field(description="基于给定上下文生成的答案")
    cited_ids: List[int] = Field(
        description="答案所依据的上下文 chunk ID 列表（0-based），每个陈述都必须有对应的 ID"
    )


# ============================================================
# 4. Prompt：给每个 chunk 编号 [Source 0]、[Source 1]...
#    并明确要求 cited_ids 只能从这些编号中选择
# ============================================================

SYSTEM_PROMPT = """你是一个严谨的问答助手。你只能根据下面提供的 Wiki 片段回答问题。
每个片段前面有 [Source N] 编号。你必须在 cited_ids 中列出答案所依据的片段编号。
如果片段中没有足够信息，answer 中直接说明“根据现有资料无法确定”，cited_ids 返回空列表。

=== 检索到的 Wiki 片段 ===
{context}
"""


def format_context(docs: List[Document]) -> str:
    return "\n\n".join(
        f"[Source {i}]\n{doc.page_content}"
        for i, doc in enumerate(docs)
    )


prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human", "{question}"),
])


# ============================================================
# 5. LLM + 结构化输出
# ============================================================

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1)
# 如果你的模型不支持 tool calling，可改用 PydanticOutputParser 走提示解析路线
structured_llm = llm.with_structured_output(CitedAnswer)


# ============================================================
# 6. 端到端查询：检索 → 构造带编号的上下文 → 结构化生成 → 回填溯源
# ============================================================

def ask(question: str) -> dict:
    # 6.1 检索
    docs = retriever.invoke(question)
    if not docs:
        return {"answer": "未在 Wiki 中找到相关内容。", "citations": []}

    # 6.2 构造带 [Source N] 编号的上下文
    context = format_context(docs)

    # 6.3 调用结构化 LLM
    chain = prompt | structured_llm
    result: CitedAnswer = chain.invoke({
        "context": context,
        "question": question,
    })

    # 6.4 回填溯源信息：cited_ids → Document.metadata
    citations = []
    for cid in result.cited_ids:
        if 0 <= cid < len(docs):          # 边界检查：模型可能返回越界 ID
            doc = docs[cid]
            citations.append({
                "citation_id": cid,
                "page_id": doc.metadata["page_id"],
                "title": doc.metadata["title"],
                "cited_snippet": doc.page_content,
                "source_files": doc.metadata["source_files"],
            })

    # 6.5 可选：检测“无有效引用”的幻觉信号
    if result.answer.strip() and not citations:
        # 有答案但没有任何合法引用，可能来自模型记忆而非检索片段
        # 生产环境可在此打日志或降级返回
        pass

    return {
        "answer": result.answer,
        "citations": citations,
    }


# ============================================================
# 7. 运行
# ============================================================

if __name__ == "__main__":
    result = ask("退款需要多久？定制商品能退吗？")

    print("=== 答案 ===")
    print(result["answer"])

    print("\n=== 引用溯源 ===")
    for c in result["citations"]:
        print(f"[{c['citation_id']}] {c['title']}  (page_id: {c['page_id']})")
        print(f"     来源文件: {c['source_files']}")
        print(f"     被引片段: {c['cited_snippet'][:100]}...")
        print()
```

### 预期输出形态
```
=== 答案 ===
标准商品可在购买后 30 天内申请退款，退款一般在 3–5 个工作日内原路返回。但定制商品不适用 30 天无理由退款，除非存在质量问题。

=== 引用溯源 ===
[0] 退款政策  (page_id: concepts/refund-policy)
     来源文件: ['raw/ingested/2026/04/refund-policy.md']
     被引片段: 退款政策
所有客户均可在购买后 30 天内申请退款。退款将原路返回至支付账户...

[1] 定制商品规则  (page_id: concepts/custom-product)
     来源文件: ['raw/ingested/2026/04/custom-product.md']
     被引片段: 定制商品规则
定制商品一经制作，不支持 30 天无理由退款，除非存在质量问题...
```

---

## LangChain 1.0 下引用溯源的关键改动

与之前的手动正则解析相比，这个实现的核心转变是**把“引用”从后处理问题变成了生成时的约束问题**。

**① 用 `with_structured_output` 替代正则解析。** 旧方案让模型在自由文本中写 `[1]`、`[2]`，再用正则提取编号。问题是模型可能写出格式正确的标记，但标记指向的片段并不支撑该陈述。LangChain 1.0 推荐的做法是定义一个 Pydantic 模型 `CitedAnswer`，其中 `cited_ids` 是结构化字段，模型在生成答案时必须同时填充它。这比事后解析更可靠，因为引用 ID 是输出 schema 的一部分，而不是模型“顺带”写出的文本标记。

**② 每个 chunk 在上下文中都有稳定编号。** `format_context` 用 `[Source 0]`、`[Source 1]` 给每个检索到的 `Document` 编号，模型看到的是确定性的编号系统。`cited_ids` 直接对应 `docs` 列表的索引，回填时只需 `docs[cid]` 即可拿到完整的 `metadata`（`page_id`、`title`、`source_files`）。

**③ 边界检查是必需步骤。** 模型可能返回超出范围的整数（例如只给了 3 个 chunk，却返回 `cited_ids=[3]`）。`0 <= cid < len(docs)` 的检查不是可选的，而是引用溯源可靠性的底线。越界的 ID 直接丢弃，不会导致 `IndexError` 或错误的溯源信息。

**④ `BM25Retriever` 仍然可用，但需要自定义中文分词。** `BM25Retriever.from_documents` 在 1.0 中仍然从 `langchain_community.retrievers` 导入，用法不变。但 `rank_bm25` 的默认预处理按空格切分，中文会被当成一个整块，检索效果很差。通过 `preprocess_func` 传入按字切分的函数，可以让中文 BM25 恢复可用的召回水平；生产环境中换成 `jieba` 分词会更好。

---

## 如果你的模型不支持 `with_structured_output`

部分模型（尤其是部分国产开源模型）不支持 tool calling，`with_structured_output` 会失败。此时可以改用 **`PydanticOutputParser`** 走提示解析路线，代价是可靠性略低，需要更严格的格式约束：
```python
from langchain_core.output_parsers import PydanticOutputParser

parser = PydanticOutputParser(pydantic_object=CitedAnswer)

prompt_with_format = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT + "\n\n{format_instructions}"),
    ("human", "{question}"),
]).partial(format_instructions=parser.get_format_instructions())

chain = prompt_with_format | llm | parser
```

但**优先推荐 `with_structured_output`**：只要模型支持 tool calling，它就是引用溯源最直接的路径，省去了格式解析失败和 JSON 修复的麻烦。

---

## 相关笔记

- [[AI大模型/rag/LLM-Wiki-文档构建原理与知识库实现|LLM-Wiki 文档构建原理与知识库实现]] — 姊妹篇：构建原理与三种检索模式
- [[AI大模型/rag/企业知识库选型-RAG vs LLM Wiki vs Ontology|企业知识库选型：RAG vs LLM Wiki vs Ontology]] — 选型边界
- [[AI大模型/LangChain/LangChain1.0迁移总纲|LangChain 1.0 迁移总纲]] — 迁移对照（create_retrieval_chain 已移除等）