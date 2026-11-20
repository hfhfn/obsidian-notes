---
title: asyncio await并发与FastAPI并发模型
tags:
- Python
- asyncio
- await
- FastAPI
- 并发
status: 已消化
source: DeepSeek-await异步方法详解.html
created: '2026-09-05T18:28:43+08:00'
modified: '2026-09-05T18:28:43+08:00'
---

> [!summary] 一句话
> `await` 只能接 **awaitable**（协程/Future/实现 `__await__` 的对象），会暂停当前协程直到完成；把同步函数塞进事件循环要用 `asyncio.to_thread()`（I/O 友好）/ `run_in_executor`（可走进程池）。这一步彻底解开"Python 并发该选谁"。

## 1. `await` 的正确使用
```python
async def f(): return "hello"
await f()            # ✅ awaitable，可以

def sync(): return "hello"
await sync()         # ❌ TypeError，同步函数不能直接 await

import asyncio
await asyncio.to_thread(sync_heavy_work)          # ✅ 同步 I/O → 线程池
await loop.run_in_executor(None, sync_heavy_work) # ✅ 等价写法
```
- `await` 使当前协程**暂停**，直到被等对象完成，才往下执行（事件循环可趁机调度其它协程）。

## 2. to_thread / run_in_executor 对 I/O 与 CPU 的效果

| 函数类型 | asyncio.to_thread / run_in_executor | 说明 |
|---------|------|------|
| **I/O 密集型**（网络/磁盘） | ✅ 效果好 | 等待时释放线程池，吞吐大增 |
| **CPU 密集型**（循环计算） | ⚠️ 效果有限 | **线程池受 GIL 限制**，无法并行；要真并行必须用**进程池** |

> **核心坑**：`to_thread`（线程池）对 CPU 计算**没意义**（GIL 同一时刻只一个线程跑字节码）。CPU 密集应扔进程池。

## 3. 进程池不会自动切分任务（常见误解）

- `ProcessPoolExecutor` **不自动把单个大任务切成多块**。
- 多个**独立任务**丢进程池 → 天然并行。
- 单个大任务想并行  要**手动分割数据**（按 chunk 分区），再并发提交，最后合并。
```python
import asyncio, concurrent.futures

async def main():
    loop = asyncio.get_running_loop()
    with concurrent.futures.ProcessPoolExecutor() as pool:
        # 主线程跑 async I/O；CPU 密集计算丢子进程，绕过 GIL
        result = await loop.run_in_executor(pool, cpu_bound_func, 100)

def cpu_bound_func(n):
    return sum(range(n * 10_000_000))
```

> ⚠️ **千万别在 async 函数里直接 `multiprocessing.Process`** —— 子进程会复制父进程的事件循环状态，易死锁/文件描述符错乱。一定用 `run_in_executor` 隔离。

## 4. FastAPI 并发模型（async vs sync 端点）

- **架构**：Uvicorn 是一个**事件循环**跑多个协程；FastAPI 默认在协程内并发处理请求。
- **异步端点 `async def`**：非阻塞，await 时让出，高并发 I/O 友好。
- **同步端点 `def`**：FastAPI 会把它丢到**线程池**（`ThreadPool`）执行，避免阻塞事件循环；但线程池有限，**长 CPU 任务会挤爆线程池，拖累所有请求**。
- 结论：I/O 密集用 `async def`；CPU 密集的项目最好单独用进程/队列解耦，别在 Web 进程里硬算。

## 5. 选型速查

| 场景 | 方案 |
|------|------|
| 高并发 I/O（爬虫/网关） | `async` + `aiohttp` |
| CPU 密集（图像/AI 推理） | `multiprocessing`（**别用 async**） |
| 两者兼有 | 主线程 async + `ProcessPoolExecutor` |
| 传统 Web 后端（Django/Flask） | 多线程/gunicorn 多进程 |

## 相关笔记
- [[AI大模型/Agent/DeepSeek-协程线程对比|协程 vs 线程对比（含Python并发选型）]]
- [[AI大模型/Agent/asyncio协程调度与6.12回调逻辑|asyncio 协程调度与 6.12 回调逻辑]]
- [[AI大模型/mcp/DeepSeek-MCP接入代码示例|MCP接入代码示例与LangChain集成]]