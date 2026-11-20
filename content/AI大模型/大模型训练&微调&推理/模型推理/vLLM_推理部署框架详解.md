---
created: '2026-04-02T12:35:46+08:00'
modified: '2026-04-02T12:35:46+08:00'
---

# vLLM 大模型推理部署框架详解

> vLLM 是目前最主流的开源大模型推理与部署框架，由 UC Berkeley 研究团队开发，核心创新是 **PagedAttention**，已成为企业私有化部署大模型的事实标准。

---

## 目录

1. [背景：大模型推理的核心瓶颈](#1-背景大模型推理的核心瓶颈)
2. [核心创新：PagedAttention](#2-核心创新pageattention)
3. [Continuous Batching（连续批处理）](#3-continuous-batching连续批处理)
4. [Prefix Caching（前缀缓存）](#4-prefix-caching前缀缓存)
5. [投机采样（Speculative Decoding）](#5-投机采样speculative-decoding)
6. [工程特性与部署实践](#6-工程特性与部署实践)
7. [性能对比与选型建议](#7-性能对比与选型建议)
8. [生产环境最佳实践](#8-生产环境最佳实践)

---

## 1. 背景：大模型推理的核心瓶颈

大模型（尤其是 Transformer 架构）在推理阶段存在两个核心瓶颈：

### 1.1 KV Cache 是什么？

Transformer 在自回归生成时，每一步都需要计算所有历史 token 的 Key（K）和 Value（V）矩阵。为了避免重复计算，框架会将这些 K/V 矩阵缓存在显存中，称为 **KV Cache**。

```
输入：  [token_1, token_2, ..., token_n]
          ↓
KV Cache：存储每个 token 的 Key 和 Value 向量
          ↓
下一步：直接读取 Cache，只计算新 token
```

### 1.2 传统显存管理的问题

在 vLLM 出现之前，传统推理框架（如 HuggingFace Transformers）对 KV Cache 的管理存在严重问题：

| 问题 | 描述 | 后果 |
|------|------|------|
| **静态预分配** | 按最大序列长度预留显存 | 实际用不到 → 显存浪费高达 60%~80% |
| **显存碎片** | 不同长度请求交替完成后留下碎片 | 无法充分利用剩余显存 |
| **无法共享** | 每个请求独占 KV Cache | 相同前缀无法复用 |
| **低 GPU 利用率** | 等待一批全完成才处理下一批 | GPU 利用率只有 30% 左右 |

---

## 2. 核心创新：PagedAttention

### 2.1 设计思想：借鉴操作系统虚拟内存分页

PagedAttention 直接借鉴了操作系统中**虚拟内存分页（Virtual Memory Paging）**的思想：

```
操作系统虚拟内存                    vLLM PagedAttention
─────────────────────────────────────────────────────
物理内存  →  被切成固定大小的"页帧"    显存  →  被切成固定大小的"KV 块"
进程地址空间  →  逻辑上连续            请求序列  →  逻辑上连续
页表  →  记录逻辑页到物理页帧的映射    Block Table  →  记录逻辑块到物理块的映射
按需分配（Demand Paging）            按需分配 KV Cache 块
```

### 2.2 工作原理

```
                    ┌─────────────────────────────────────────┐
                    │           显存（物理 KV 块池）              │
                    │  [块0][块1][块2][块3][块4][块5][块6][块7]  │
                    └─────────────────────────────────────────┘
                          ↑           ↑           ↑
                    ┌─────┘     ┌─────┘     ┌─────┘
                    │           │           │
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │  请求 A   │ │  请求 B   │ │  请求 C   │
            │ 逻辑块 0→块0│ │ 逻辑块 0→块2│ │ 逻辑块 0→块5│
            │ 逻辑块 1→块3│ │ 逻辑块 1→块6│ │ ...       │
            └───────────┘ └───────────┘ └───────────┘
```

**关键特点：**

- **固定块大小**：每个 KV 块存储固定数量 token 的 K/V（默认 16 个 token/块）
- **按需分配**：只有当序列生成到需要新块时，才分配新的物理块
- **非连续存储**：逻辑上连续的 KV Cache 在物理显存中可以不连续
- **零碎片**：显存碎片降到接近零（内部碎片仅在最后一个块内，理论浪费 < 4%）

### 2.3 共享 KV Cache（Copy-on-Write 机制）

PagedAttention 还支持多个请求共享同一份 KV Cache 块，典型场景是 **Beam Search** 和 **Prefix Caching**：

```
并行采样（Parallel Sampling）：
  同一个 prompt → 生成 N 个不同输出
  
  Prompt KV Cache 块  → 所有输出共享（只读，引用计数管理）
  生成部分 KV Cache   → 各自独占（写时复制 Copy-on-Write）
```

---

## 3. Continuous Batching（连续批处理）

### 3.1 传统 Static Batching 的问题

```
传统静态批处理（Static Batching）：

批次1: [请求A(10步), 请求B(50步), 请求C(30步)]
         ↓ 必须等最长的 B 完成（50步）才能处理下一批
批次2: [请求D, 请求E, ...]

GPU 时间线：
|=====A=====|..........等待B..........|  ← A 完成后 GPU 部分空闲
|=====B========================|
|=====C============|..等待B...|
```

结果：GPU 利用率约 **30%**

### 3.2 Continuous Batching 的工作方式

```
连续批处理（Continuous Batching）：

迭代（Iteration）级别调度，每个生成步骤后重新调度：

时间步 t1: [请求A, 请求B, 请求C]  → A完成，立即插入请求D
时间步 t2: [请求D, 请求B, 请求C]  → C完成，立即插入请求E
时间步 t3: [请求D, 请求B, 请求E]  → ...

GPU 时间线：
|A|D|D|D|D|D|D|D|D|D|  ← A 完成，D 立即填入空位
|B|B|B|B|B|B|B|B|B|B|
|C|C|C|C|E|E|E|E|E|E|  ← C 完成，E 立即填入
```

结果：GPU 利用率提升至 **90%+**

### 3.3 核心调度策略

vLLM 的调度器（Scheduler）在每次迭代时决定：

- **Prefill 阶段**：处理新请求的 prompt（计算密集型，并行度高）
- **Decode 阶段**：为正在生成的请求继续生成下一个 token
- **抢占（Preemption）**：显存不足时，将低优先级请求的 KV Cache 交换到 CPU 内存（Swap）

---

## 4. Prefix Caching（前缀缓存）

### 4.1 核心思想

很多场景中，不同请求共享相同的前缀（如 System Prompt、Few-shot 示例），Prefix Caching 将这部分的 KV Cache 持久化复用。

```
多轮对话场景：

第1轮：[System Prompt | 用户问题1]
                ↓
        计算并缓存 System Prompt 的 KV Cache
        
第2轮：[System Prompt | 用户问题1 | 回答1 | 用户问题2]
                ↓
        System Prompt + 历史对话 → 直接读取缓存 ✓
        新内容（用户问题2） → 只计算这部分 ✓
```

### 4.2 实现机制

vLLM 使用 **基于哈希的 KV 块管理**：

```python
# 伪代码示意
block_hash = hash(token_ids[:block_size])  # 对每个块的内容取哈希
if block_hash in cache:
    return cache[block_hash]  # 命中缓存，直接复用
else:
    kv_block = compute_kv(token_ids)  # 重新计算
    cache[block_hash] = kv_block
    return kv_block
```

**优先级管理**：
- 缓存满时，使用 LRU（最近最少使用）策略淘汰旧块
- 正在使用的块有引用计数保护，不会被淘汰

### 4.3 性能收益

| 场景 | 首 token 延迟（TTFT）降低幅度 |
|------|-------------------------------|
| 固定 System Prompt（1k tokens）| 40%~60% |
| 长文档问答（重复读取同一文档） | 70%~90% |
| 多轮对话（历史对话复用） | 30%~50% |

---

## 5. 投机采样（Speculative Decoding）

### 5.1 为什么要投机采样？

大模型推理的瓶颈是 **自回归解码的串行性**：每次只能生成一个 token，无法并行化。

```
传统解码：
大模型 → [t1] → [t1,t2] → [t1,t2,t3] → ...（完全串行）
```

### 5.2 投机采样的工作流程

```
投机采样（Speculative Decoding）：

步骤1：小模型（Draft Model）快速生成 K 个候选 token
        小模型: [t1,t2,t3,t4,t5]  ← 一次生成 5 个草稿

步骤2：大模型（Target Model）一次性并行验证所有草稿
        大模型并行验证: [✓t1, ✓t2, ✓t3, ✗t4]
                              ↑ 前3个通过，第4个被拒绝

步骤3：接受通过的 token，从第一个被拒绝处重新采样
        最终输出：[t1, t2, t3, t4'（大模型重采样）]
```

**核心原理**：大模型验证多个 token 的并行开销 ≈ 验证一个 token 的开销，而如果草稿模型的猜测大部分正确，就相当于一次生成了多个 token。

### 5.3 精度保证

投机采样在数学上可以证明**与原始大模型的输出分布完全等价**（非近似），不损失任何精度。其接受/拒绝机制基于拒绝采样（Rejection Sampling），确保最终输出分布与直接使用大模型相同。

### 5.4 适用场景与局限

| 适用 | 不适用 |
|------|--------|
| 输出长度较长的任务 | 极短输出（<10 tokens） |
| 草稿模型与目标模型分布接近 | 高随机性（temperature 很高）任务 |
| 有合适的小模型可用 | 无匹配草稿模型的场景 |

---

## 6. 工程特性与部署实践

### 6.1 OpenAI 兼容 API

vLLM 内置 OpenAI 兼容的 REST API 服务，无需修改任何业务代码即可替换 OpenAI 调用：

```bash
# 一行命令启动服务
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3-8B-Instruct \
    --enable-prefix-caching \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.9
```

```python
# 业务代码无需修改，只需换 base_url
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",  # 指向 vLLM
    api_key="EMPTY"
)

response = client.chat.completions.create(
    model="meta-llama/Llama-3-8B-Instruct",
    messages=[{"role": "user", "content": "你好"}]
)
```

### 6.2 支持的模型与特性矩阵

| 特性 | 说明 |
|------|------|
| 模型支持 | LLaMA, Mistral, Qwen, Gemma, DeepSeek 等主流模型 |
| 量化支持 | GPTQ, AWQ, SqueezeLLM, FP8 |
| 多 GPU 支持 | Tensor Parallelism（张量并行）、Pipeline Parallelism |
| 长上下文 | RoPE 缩放，支持 128K+ 上下文 |
| 多模态 | 支持 LLaVA 等视觉语言模型 |

---

## 7. 性能对比与选型建议

### 7.1 与 HuggingFace Transformers 对比

```
相同硬件（A100 80GB），相同模型（LLaMA-2-13B）：

指标              HF Transformers    vLLM         提升倍数
──────────────────────────────────────────────────────
吞吐量（tokens/s）     ~800           ~3500          4.4x
GPU 利用率            ~30%            ~90%           3x
显存利用率            ~40%            ~85%          2.1x
P99 延迟（ms）        ~2000           ~800           2.5x
```

### 7.2 框架选型对照表

| 框架 | 适用场景 | 显存要求 | 特点 |
|------|----------|----------|------|
| **vLLM** | 生产级服务、高并发 | ≥16GB | 吞吐量最优，企业首选 |
| **llama.cpp** | 消费级 GPU / CPU 推理 | 4~8GB | 支持 GGUF 量化，低显存 |
| **Ollama** | 本地开发、个人使用 | 4~16GB | 一键安装，易用性最好 |
| **TensorRT-LLM** | NVIDIA GPU 极致优化 | ≥24GB | 延迟最低，需要编译 |
| **MLC LLM** | 移动端 / 边缘设备 | 2~8GB | 跨平台（iOS/Android/WebGPU） |

### 7.3 选型决策树

```
是否需要服务多个并发用户？
├── 是 → 显存 ≥ 16GB？
│        ├── 是 → ✅ 选 vLLM
│        └── 否 → 选 llama.cpp（量化版本）
└── 否（本地开发/测试）
         ├── 追求易用性 → 选 Ollama
         └── 追求性能 → 选 vLLM 或 llama.cpp
```

---

## 8. 生产环境最佳实践

### 8.1 必开的关键参数

```bash
python -m vllm.entrypoints.openai.api_server \
    --model <your-model> \
    
    # ✅ 必开：前缀缓存（System Prompt 复用）
    --enable-prefix-caching \
    
    # ✅ 推荐：显存利用率（默认 0.9，根据情况调整）
    --gpu-memory-utilization 0.9 \
    
    # ✅ 推荐：最大并发序列数（根据显存和请求长度估算）
    --max-num-seqs 256 \
    
    # ✅ 多 GPU 时开启张量并行
    --tensor-parallel-size 2  # 使用 2 张 GPU
```

### 8.2 Prefix Caching 的最大化收益

```python
# ✅ 好的实践：所有请求共享相同的 System Prompt
system_prompt = "你是一个专业的客服助手..."  # 固定不变

requests = [
    {"system": system_prompt, "user": "问题1"},  # ✓ 命中 Prefix Cache
    {"system": system_prompt, "user": "问题2"},  # ✓ 命中 Prefix Cache
    {"system": system_prompt, "user": "问题3"},  # ✓ 命中 Prefix Cache
]

# ❌ 不好的实践：每次在 System Prompt 中插入动态内容
# 每次 System Prompt 不同 → Cache 全部失效
system_prompt = f"当前时间：{datetime.now()}，你是一个客服助手..."
```

### 8.3 显存估算公式

```
KV Cache 显存（GB）≈
    2（K+V）× num_layers × num_heads × head_dim × seq_len × batch_size × dtype_bytes

以 LLaMA-3-8B（float16）为例：
    2 × 32层 × 32头 × 128维 × 4096长度 × 16并发 × 2字节
    ≈ 17 GB

因此：
    模型权重（~16GB）+ KV Cache（~17GB）= 33GB
    需要 2× A100 40GB 或 1× A100 80GB
```

### 8.4 监控指标

生产环境中重点关注以下指标：

| 指标 | 含义 | 健康范围 |
|------|------|----------|
| `gpu_cache_usage_perc` | KV Cache 占用率 | < 90% |
| `num_requests_waiting` | 等待队列长度 | 接近 0 |
| `time_to_first_token` | 首 token 延迟（TTFT） | 依场景 |
| `inter_token_latency` | Token 间延迟 | < 50ms |
| `request_throughput` | 每秒完成请求数 | 越高越好 |

---

## 总结

```
vLLM 核心创新体系

PagedAttention
└── 解决：显存碎片 + 无法共享 KV Cache
└── 效果：显存利用率从 40% → 85%

Continuous Batching
└── 解决：GPU 因等待而空闲
└── 效果：GPU 利用率从 30% → 90%+

Prefix Caching
└── 解决：重复计算相同前缀
└── 效果：首 token 延迟降低 40%~90%

Speculative Decoding
└── 解决：自回归解码串行瓶颈
└── 效果：生成速度提升 2~3x（无精度损失）

综合效果：相比原生 HF Transformers，吞吐量提升 3~5 倍
```

**一句话总结**：vLLM 用操作系统领域的经典思想（内存分页、按需分配、写时复制）彻底重构了大模型推理的显存管理，再配合连续批处理、前缀缓存、投机采样等工程优化，将 GPU 的计算潜力发挥到极致。

---

*参考资料：*
- *vLLM 论文：Efficient Memory Management for Large Language Model Serving with PagedAttention (SOSP 2023)*
- *vLLM 官方文档：https://docs.vllm.ai*
- *GitHub：https://github.com/vllm-project/vllm*
