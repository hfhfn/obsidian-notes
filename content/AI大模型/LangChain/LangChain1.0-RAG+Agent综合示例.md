---
title: LangChain 1.0 RAG+Agent 综合示例
tags:
- LangChain
- LangChain1.0
- 迁移
- RAG
- Agent
- 示例
status: 已消化
source: 基于 LangChain1.0 系列迁移笔记整合（每个代码块前注明「旧 → 新」迁移说明）
created: 2026-10-02
modified: '2026-10-02T17:52:47+08:00'
---

> [!abstract] 这个 Demo 做什么
> 一个**本地知识库问答 Agent**：把本地文档 → 加载 → 分割 → 向量化 → 存 Chroma → 检索，再把「检索」包装成工具交给 `create_agent`，让 Agent 自主决定何时查知识库，并带**对话记忆**。
> **每个代码块前都有 `> [!info] 迁移说明` 标注「旧写法 → 1.0 新写法」**，方便对照理解整条链路的变迁。

> [!note] 运行前提
> - 本机有 Ollama 服务（默认 `http://localhost:11434`），已 `ollama pull qwen2.5:7b` 和 `ollama pull mxbai-embed-large`。
> - 一个本地文本文件（示例用 `./data/pku.txt`）。
> - 无需任何 API Key（全本地）。

---

## 🏗️ 整体架构

```text
本地文档 ──Loader──▶ Document ──Splitter──▶ chunks ──Embedding──▶ VectorStore(Chroma)
                                                                        │
                                                                        ▼
                    ┌─────────────────── 检索能力 ───────────────────┐
                    │  A. 纯 RAG：retriever.invoke → prompt → llm    │
                    │  B. Agentic RAG：检索包装成 @tool → create_agent│
                    └────────────────────────────────────────────────┘
                                                                        │
                                        create_agent + checkpointer(记忆) ◀┘
```

---

## 📦 依赖安装

```bash
# LangChain 1.0：主包只保留 Agent 核心，其余全部拆成独立包
pip install -U \
  langchain \
  langchain-ollama \
  langchain-text-splitters \
  langchain-chroma \
  langchain-unstructured
```

> [!info] 迁移说明｜包安装
> - 旧版一个大包 `langchain` + `langchain_community` 全搞定；1.0 要**按需装独立包**。
> - `langchain-core` 会被 `langchain` 自动带为依赖，通常无需手动装（但它是独立包，不是「包含在 langchain 里」）。
> - `langchain-community` 已停维，新项目避免依赖。

---

## 1️⃣ LLM（对话模型）

> [!info] 迁移说明｜LLM
> **旧**：`from langchain_community.llms import Ollama`（已移除/废弃）
> **新**：`from langchain_ollama import ChatOllama`（对话，推荐）或 `OllamaLLM`（文本补全）
> 关键：`ChatOllama` 返回 `AIMessage`，取 `.content`；它是后续 Agent / 工具调用的基础。

```python
from langchain_ollama import ChatOllama

llm = ChatOllama(
    base_url="http://localhost:11434",
    model="qwen2.5:7b",
    temperature=0,
)
print(llm.invoke("你是谁").content)
```

---

## 2️⃣ Embedding（嵌入模型）

> [!info] 迁移说明｜Embedding
> **旧**：`from langchain_community.embeddings import OllamaEmbeddings`
> **新**：`from langchain_ollama import OllamaEmbeddings`
> **核心 API 不变**：`embed_query()` / `embed_documents()` 照用。

```python
from langchain_ollama import OllamaEmbeddings

embeddings = OllamaEmbeddings(
    base_url="http://localhost:11434",
    model="mxbai-embed-large",
)
# 单条 & 批量
_ = embeddings.embed_query("测试查询")
_ = embeddings.embed_documents(["文档1", "文档2"])
```

---

## 3️⃣ Loader（文档加载）

> [!info] 迁移说明｜Loader
> **旧**：`from langchain_community.document_loaders import UnstructuredFileLoader`（弃用）
> **新**：`from langchain_unstructured import UnstructuredLoader`（独立包）
> 参数变化：`mode` 被移除 → 改用 `chunking_strategy`；`url` 含义变为 API 服务器地址。
> 简版替代：纯 txt 仍可用 `TextLoader`（在 `langchain_community`，已停维）。

```python
from langchain_unstructured import UnstructuredLoader

loader = UnstructuredLoader("./data/pku.txt", encoding="utf8")
documents = loader.load()

print(f"加载文档数：{len(documents)}")
print(documents[0].page_content[:100])
print(documents[0].metadata)   # 保留 source 等元数据
```

> [!tip] 用一个加载器覆盖多格式
> `UnstructuredLoader` 支持 txt/md/html/docx/pdf/pptx/xlsx/eml/… 几乎所有常见格式，是「一个加载器走天下」的省心选择。

---

## 4️⃣ Splitter（文本分割）

> [!info] 迁移说明｜Splitter
> **旧**：`from langchain.text_splitter import CharacterTextSplitter`
> **新**：`from langchain_text_splitters import CharacterTextSplitter`（独立包）
> 方法选择：**来自加载器的文档用 `split_documents()`（保留 metadata）**；纯字符串才用 `split_text()`。

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,
    chunk_overlap=50,
)

# split_documents：输入 Document 列表，输出 Document 列表，元数据透传到每个子块
chunks = splitter.split_documents(documents)
print(f"切分后块数：{len(chunks)}")
```

---

## 5️⃣ VectorStore（向量库）

> [!info] 迁移说明｜VectorStore
> **旧**：`from langchain_community.vectorstores import Chroma`
> **新**：`from langchain_chroma import Chroma`（独立包，无统一的「store 包」）
> 用法基本不变：`from_documents()` / `similarity_search()`。

```python
from langchain_chroma import Chroma

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db",   # 持久化到本地
)
print(f"已写入向量库，集合大小：{vectorstore._collection.count()}")
```

---

## 6️⃣ Retriever（检索器）

> [!info] 迁移说明｜Retriever
> **旧**：`db.as_retriever(search_kwargs={'k': 1})` + `retriever.get_relevant_documents(q)`
> **新**：`as_retriever()` **不变**；但检索器现在是 Runnable，**统一用 `.invoke(q)`**（`get_relevant_documents` 属旧接口）。
> 认知转变：Retriever 从「独立类」变成「向量库的方法 / 一种模式」。

```python
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

docs = retriever.invoke("北京大学是什么时候成立的？")   # 1.0：用 invoke
for d in docs:
    print("-", d.page_content[:80])
```

---

## 7️⃣ Prompt（RAG 提示词模板）

> [!info] 迁移说明｜Prompt
> **旧**：`from langchain import PromptTemplate`
> **新**：`from langchain_core.prompts import ChatPromptTemplate`（对话场景推荐 Chat 版）
> **注意**：在**纯 RAG 链**里，`ChatPromptTemplate` 仍是核心起点（`{context}` 占位符把检索结果动态填入）。

```python
from langchain_core.prompts import ChatPromptTemplate

rag_prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个严谨的问答助手。只根据以下上下文回答问题，上下文没有的信息就说不知道。\n\n上下文：\n{context}"),
    ("human", "{question}"),
])
```

---

## 8️⃣ 纯 RAG 链（LCEL）

> [!info] 迁移说明｜Chain
> **旧**：`create_retrieval_chain(...)` / `RetrievalQA`（已移出主包）
> **新**：用 **LCEL 管道** `prompt | llm | StrOutputParser()`，或直接写几行 Python。官方更推荐「显式代码」。

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

def format_docs(docs):
    return "\n\n".join(d.page_content for d in docs)

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | rag_prompt
    | llm
    | StrOutputParser()
)

print(rag_chain.invoke("北京大学是什么时候成立的？"))
```

---

## 9️⃣ 把检索包装成工具（Agentic RAG）

> [!info] 迁移说明｜工具定义
> **旧**：`from langchain.agents import load_tools`（字符串别名加载，已不推荐）
> **新**：`@tool` 装饰器自己写（`from langchain.tools import tool`），或直接导入 `langchain_community.tools` 里的现成工具类。
> 这一步把「检索」变成 Agent 可自主调用的工具——这就是 **Agentic RAG**。

```python
from langchain.tools import tool

@tool
def search_knowledge_base(query: str) -> str:
    """从本地知识库检索与问题最相关的资料。当需要回答关于知识库内容的问题时使用。"""
    docs = retriever.invoke(query)
    return "\n\n".join(d.page_content for d in docs)

# 可选：再给一个数学工具，演示多工具协作
@tool
def calculate(expression: str) -> str:
    """计算数学表达式，例如 '3*3+4'。"""
    return str(eval(expression))

tools = [search_knowledge_base, calculate]
```

---

## 🔟 create_agent + 记忆（checkpointer）

> [!info] 迁移说明｜Agent + Memory
> **旧**：`initialize_agent(tools, llm, agent=AgentType.XXX)` + `ConversationBufferMemory`
> **新**：`create_agent(model, tools, system_prompt, checkpointer)`；记忆靠 **`checkpointer` + `thread_id`**，不再手动管 `chat_history`。
> **注意**：`create_agent` 原生对接 **Message Array**，不要塞 `ChatPromptTemplate` 进去（会报 `Unsupported message type`）。

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()   # 开发用；生产换 SqliteSaver / PostgresSaver

agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt="你是一个知识库助手。回答知识库相关问题时，先调用 search_knowledge_base 检索，再基于检索结果作答；需要计算时调用 calculate。",
    checkpointer=checkpointer,
)
```

---

## ▶️ 运行

> [!info] 迁移说明｜调用
> **旧**：`agent.run("字符串")`
> **新**：`agent.invoke({"messages": [{"role": "user", "content": "..."}]}, config)`，用 `thread_id` 维持会话。

```python
config = {"configurable": {"thread_id": "kb-demo-1"}}   # 同一会话复用，记忆自动保持

def ask(question: str) -> str:
    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]},
        config=config,
    )
    return result["messages"][-1].content

print(ask("北京大学是什么时候成立的？"))      # → 触发 search_knowledge_base
print(ask("那它 1937 年发生了什么？"))         # → 依赖上一轮记忆 + 检索
print(ask("顺便帮我算一下 37 * 12 + 5"))       # → 触发 calculate
```

---

## 🧩 完整整合代码（单文件可跑）

```python
"""
rag_agent_demo.py — LangChain 1.0 本地知识库问答 Agent
依赖：langchain langchain-ollama langchain-text-splitters langchain-chroma langchain-unstructured
"""
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_unstructured import UnstructuredLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain.tools import tool
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver

# ---- 1. LLM ----
llm = ChatOllama(base_url="http://localhost:11434", model="qwen2.5:7b", temperature=0)

# ---- 2. Embedding ----
embeddings = OllamaEmbeddings(base_url="http://localhost:11434", model="mxbai-embed-large")

# ---- 3. Loader ----
documents = UnstructuredLoader("./data/pku.txt", encoding="utf8").load()

# ---- 4. Splitter ----
chunks = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=50).split_documents(documents)

# ---- 5. VectorStore ----
vectorstore = Chroma.from_documents(chunks, embeddings, persist_directory="./chroma_db")

# ---- 6. Retriever ----
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# ---- 7. Prompt ----
rag_prompt = ChatPromptTemplate.from_messages([
    ("system", "只根据以下上下文回答问题：\n\n{context}"),
    ("human", "{question}"),
])

# ---- 8. 纯 RAG 链（LCEL）----
rag_chain = (
    {"context": retriever | (lambda ds: "\n\n".join(d.page_content for d in ds)),
     "question": RunnablePassthrough()}
    | rag_prompt | llm | StrOutputParser()
)

# ---- 9. 工具（Agentic RAG）----
@tool
def search_knowledge_base(query: str) -> str:
    """从本地知识库检索与问题最相关的资料。"""
    return "\n\n".join(d.page_content for d in retriever.invoke(query))

@tool
def calculate(expression: str) -> str:
    """计算数学表达式，例如 '3*3+4'。"""
    return str(eval(expression))

# ---- 10. Agent + 记忆 ----
agent = create_agent(
    model=llm,
    tools=[search_knowledge_base, calculate],
    system_prompt="你是知识库助手，先检索再作答；需要计算时调用 calculate。",
    checkpointer=InMemorySaver(),
)

if __name__ == "__main__":
    # 纯 RAG 链用法
    print("纯RAG:", rag_chain.invoke("北京大学是什么时候成立的？"))

    # Agent 用法（带记忆）
    config = {"configurable": {"thread_id": "kb-demo-1"}}
    for q in ["北京大学是什么时候成立的？", "那它 1937 年发生了什么？", "帮我算 37*12+5"]:
        r = agent.invoke({"messages": [{"role": "user", "content": q}]}, config=config)
        print(f"Q: {q}\nA: {r['messages'][-1].content}\n")
```

---

> [!success] 版本基准（已核实）
> 本示例的导入路径与 API 已对照**官方文档**逐条核实（LangChain 1.0，2025-10-22 发布）：`langchain.agents.create_agent`、`langchain.tools.tool`、`langchain_ollama`、`langchain_unstructured.UnstructuredLoader`、`langchain_text_splitters`、`langchain_chroma`、`langgraph.checkpoint.memory.InMemorySaver`、`vectorstore.as_retriever().invoke()` 均为当前标准写法。落地时以本机 `pip show langchain` 版本为准即可。

## 相关笔记
- [[AI大模型/LangChain/LangChain1.0迁移总纲|LangChain 1.0 迁移总纲]] — 各组件「旧 → 新」系统对照（本示例的理论依据）
- [[AI大模型/Agent/DeepSeek-工具调用代理需执行器|工具调用代理需不需要执行器]] — AgentExecutor / create_agent / LangGraph 建 Agent 对比
- [[AI大模型/rag/RAG系统核心技术与实现|RAG系统核心技术与实现]] — RAG 系统级实现
- [[AI大模型/rag/MultiQueryRAG-图文笔记|知识库高效召回：从 Multi-Query 到 Hybrid + Reranker]] — 检索增强演进
- [[AI大模型/Agent/Agent Memory-Basic Memory-智能体长期记忆系统完整指南|Agent Memory-Basic Memory-智能体长期记忆系统完整指南]] — 记忆体系
