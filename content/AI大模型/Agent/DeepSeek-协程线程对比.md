---
title: 协程 vs 线程对比（含Python并发选型）
tags:
- Python
- 协程
- 线程
- 并发
- GIL
status: 已消化
source: DeepSeek-协程线程对比.html
created: '2026-09-05T18:28:53+08:00'
modified: '2026-09-05T18:28:53+08:00'
---

> [!summary] 一句话
> **线程是操作系统调度（内核态，抢占式），协程是用户程序调度（用户态，协作式）**。线程适合真并行（CPU 多核），协程适合高并发 I/O（最少资源扛最多连接）。

## 1. 核心本质对比

| 维度 | 线程 | 协程 |
|------|------|------|
| **调度者** | 操作系统内核（抢占式） | 用户程序/运行时（协作式，主动让出） |
| **切换开销** | 微秒 μs（涉及内核态、寄存器、TLB） | 纳秒 ns（只改函数/栈指针） |
| **内存** | 固定大栈（Java/C++ 默认 ~1MB） | 小且动态增长（Go 初始 2KB） |
| **规模** | ~几千个 | 可轻松数十万个 |
| **并发模型** | 多核真并行，需锁/信号量 | 默认并发（非并行），可多协程绑多线程（GMP） |

## 2. 关键误区：协程不会取代线程

- **CPU 密集型** → 协程毫无优势（计算占满没机会让出）。此时 `线程数 ≈ CPU 核数` 最高效。
- **I/O 密集型** → 协程是王者（等待时间拿去处理别的任务，吞吐数倍）。

## 3. Python 特有的并发格局（GIL 是核心）

Python 的 `asyncio` 跑在**单线程 + 事件循环**里，**并发但不并行**（只在 `await` 处让出）。

| 场景 | 多线程的意义 |
|------|------|
| CPU 计算 | **没意义**（GIL 同一时刻只一个线程执行字节码，4 核 4 线程≈1 线程，还多切换开销） |
| I/O 操作 | **有意义**（线程发起 `recv`/`read` 系统调用时**主动释放 GIL**，OS 可切去执行其它线程） |

## 4. 如何"多进程协程"（Process + asyncio）

每进程一个独立 asyncio 事件循环，用满多核 + 每核内扛海量 I/O：

```python
import asyncio, concurrent.futures

def run_loop_in_process(pid):
    new_loop = asyncio.new_event_loop()   # 子进程里必须重建事件循环！
    asyncio.set_event_loop(new_loop)
    new_loop.run_until_complete(heavy_io_task(pid))

if __name__ == "__main__":
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
        executor.map(run_loop_in_process, [1, 2, 3, 4])
```
> 事件循环是运行时状态，不在进程拷贝的内存里——子进程必须 `asyncio.new_event_loop()`。

## 5. 主进程 vs 子进程

- **资源隔离**：子进程**完全复制主进程那一刻的内存（Copy-on-Write）**，之后彻底独立；改子进程的变量不影响主进程（线程则共享内存）。经典陷阱：`data.append` 在子进程里改了，主进程里的 `data` 不变。
- **文件描述符**：子进程继承父进程的 fd，主进程 close 后子进程仍以为文件开着 → 报 `Bad file descriptor`。**fork 前关掉不需要的连接**（DB/Redis），让子进程重建。
- **生死关系**：主进程先死 → 子进程变**孤儿**（被 init 收养继续跑）；子进程先死且父不 `join()` → **僵尸**（占进程表）。
- **Windows vs Linux**：`spawn`（Windows，安全慢，重建解释器）vs `fork`（Linux，快，写时复制）。Windows 上 `Process` 必须放 `if __name__ == "__main__":` 下，否则递归导入死机。

## 相关笔记
- [[AI大模型/Agent/DeepSeek-await异步方法详解|asyncio await并发与FastAPI并发模型]]
- [[AI大模型/Agent/asyncio协程调度与6.12回调逻辑|asyncio 协程调度与 6.12 回调逻辑]]
- [[AI大模型/mcp/DeepSeek-MCP-stdio模式解析|MCP stdio 模式解析]]