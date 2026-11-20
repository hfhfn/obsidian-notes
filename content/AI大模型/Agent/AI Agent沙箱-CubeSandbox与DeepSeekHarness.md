---
title: AI Agent 沙箱与执行隔离
tags:
- AI大模型
- Agent
- 沙箱
created: '2026-09-02T00:02:30+08:00'
modified: '2026-09-02T00:02:30+08:00'
---

# AI Agent 沙箱与执行隔离：CubeSandbox vs DeepSeek-Harness

> 本文主体源自视频《AI Agent 沙箱技术：从虚拟机到 CubeSandbox》（作者 @小白debug），整理其关于**执行型 Agent 为什么需要沙箱**、从 VM/容器/MicroVM 演进、以及腾讯云 **CubeSandbox** 方案的讲解；在此之上补充了 **DeepSeek-Harness（dsh）自带的进程沙箱**，并做两者对比。

> [!note] 两种路径一句话
> - **CubeSandbox**：走"**隔离整个执行环境**"路线——云上 MicroVM（独立内核），把 Agent 的代码关进一台轻量虚拟机里跑。
> - **DeepSeek-Harness**：走"**约束单个进程**"路线——在原来那台机器上，用 OS 权限机制（Landlock/bwrap、Seatbelt、ACL token）把 Agent 子进程的**文件写权限**封住，最轻最快；真要整机隔离就插一个容器/MicroVM 后端。
> 二者不是竞争关系，而是"**本地最轻** → **云上最重**"隔离谱系里的两个代表点。

---

## 一、为什么执行型 Agent 必须有沙箱

- AI Agent（如 LangChain/LangGraph）靠 **ReAct 循环**工作：组装上下文 → 大模型推理 → 执行工具（写文件 / 跑命令 / 调 API）→ 结果回灌 → 下一轮。
- 循环次数多了上下文过长被截断，**目标可能悄悄偏移**，于是执行出危险命令（如 `rm -rf /`）。
- 一旦命令真的在宿主机上跑，文件系统被清空——"工作没了，烦恼也没了"，目的"达成"但代价巨大。
- **沙箱**：专门划出用于执行高风险操作的**隔离环境**。危险命令不在 Agent 所在环境里跑，而进沙箱跑；炸了也不影响原环境。沙箱在本地叫本地沙箱，在云端叫**云沙箱**。
- 一句话：**没有沙箱的 Agent = 在生产环境做实验。**

---

## 二、隔离技术谱系：VM → 容器 → MicroVM

| 技术 | 隔离本质 | 安全性 | 启动/开销 | 结论 |
|---|---|---|---|---|
| 传统 **VM** | 完整独立 OS 内核 + 资源（KVM 等在裸金属上切分） | 高（完全隔离） | 慢、重（内核完整） | 能力足够，但 Agent 临时建 VM 等不起 |
| **容器** | **进程级隔离**，共享宿主内核；限制 CPU/内存 | 中（同一内核，有逃逸面） | 快、轻 | 早期云沙箱在容器上收紧权限，但只适合**风险可控**操作 |
| **MicroVM** | 精简内核的独立虚拟机（砍掉不必要设备） | 高（独立内核） | 快（较传统 VM 大幅提速） | 折中最优，AI Agent 沙箱主流路线 |

- 核心矛盾：**隔离强度（越重越安全）vs 启动速度/开销（越轻越快）**。Agent 要求秒级响应，于是需要"够隔离 + 够快"的方案。
- 容器因"共享宿主内核，伪 kernel 逃逸影响整台宿主机及兄弟容器"，不满足「行为不可预测的 Agent」的强隔离要求。

---

## 三、CubeSandbox：腾讯云开源的云沙箱（MicroVM 路线）

专为 AI Agent 设计，**兼容 E2B 接口**（现有 E2B 应用改地址即接入）。

### 整体架构
```
控制面（Control Plane）           工作节点（Node）
┌─────────────┐                  ┌───────────────┐
│  CubeAPI    │  ← HTTP/gRPC     │  Cubelet      │
│  CubeMaster │     消息         │  (驱动 KVM    │
└──────┬──────┘      ──────────> └──────┬────────┘
       │         调度/管理               │
       └─（Node 为裸金属服务器，负责创建/运行沙箱）──┘
```

- **控制面**：沙箱的创建、隔离、回收管理。
  - `CubeAPI`：对外提供兼容 E2B 的接口。
  - `CubeMaster`：接收请求，经消息队列指挥 Node 创建沙箱。
- **Node 节点**：内置 `Cubelet`，驱动 KVM/MicroVM 实际创建运行沙箱的裸金属服务器。

### 启动优化：快照克隆（Snapshot Cloning）
- 传统每次启动 MicroVM：内核加载 → 分配 CPU/内存 → 系统初始化 → 业务依赖加载（Python/JS）→ 慢。
- CubeSandbox：**预启动一次把"慢活"全跑完 → 保存成模板快照 → 新请求直接克隆快照**。启动压到**几十毫秒**。

### 内存优化：写时复制（Copy-on-Write）
- 每个沙箱内存/磁盘初始都**指向同一份底层页面**，只有写入才复制新页（COW）。
- 单个沙箱内存开销可控制在 **MB 级**。

### 性能与使用
- **压测**：50 并发下，沙箱创建 P99 延迟约 **150ms**。
- 调用方式：API 把待执行代码/命令发给沙箱，结果从 `result` 字段返回。
```python
# 示意：调用 CubeSandbox 执行代码
response = cube_client.run(
    code="def quick_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    ...",
    timeout=30
)
print(response.result)  # 排序结果
```

---

## 四、DeepSeek-Harness 的沙箱：`dsh-sandbox`（进程级 OS 约束路线）

DeepSeek-Harness（`dsh`）是 DeepSeek 官方 2026 年开源的**通用智能体框架（agent harness）**，架构哲学"Everything is a Plugin"，基于 Cordis，TypeScript，`npx @deepseek-ai/dsh web` 起本地 Web UI。它的沙箱是一套可插拔的**进程沙箱 seam**，与 CubeSandbox 思路完全不同。

### 隔离方式：不是 VM，是 OS 权限约束`ctx.sandbox` 把**同一个世界里要执行的子进程 argv** 包一层"文件效果策略"，靠各平台原生机制落地：

| 平台 | 后端 |
|---|---|
| Linux | **bwrap（bubblewrap）+ Landlock**（内核 LSM） |
| macOS | **Seatbelt** |
| Windows | **ACL 受限令牌（restricted token）** |

> 关键设计：**容器 / MicroVM / 远程执行在 dsh 里是"另一个完整能力 seam 的兄弟实现"，并不是 `ctx.sandbox` 的提供方**——也就是说最重的整机隔离可以外插（比如塞容器后端），但默认/首选是这套 OS 级进程约束。

### 三种文件效果模式```ts
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
```
- `read-only`：拒绝写（POSIX 后端会额外放行 `/dev/null` 供 shell 用）。
- `workspace-write`：允许写工作区根目录 + 后端约定的临时区。
- `danger-full-access`：完全放开（不调用 `ctx.sandbox`，直接裸跑）。
- **注意**：这套词汇只管**文件系统效果**；网络、进程可见性不在其治理范围内（要那层面隔离得跑容器/MicroVM seam）。

### 两个关键性质
1. **Fail-closed（失败即关闭）**：没有可用后端时抛 `SANDBOX_UNAVAILABLE`，**绝不静默无沙箱直通**。被拒/runner 失败会按各后端"方言"分类（EROFS/EACCES/EPERM）上报，模型收到后只能申请"一次性放宽 + 人审批"才能重试。
2. **逐调用策略（per-call）**：策略按**每次调用**解析携带，而非固定在 provider 上——同一时刻两个调用可处于不同边界（bash 在 `read-only`，子 agent 需要可写状态目录则 `workspace-write`）。

### 配套：shell 沙箱与 code-runtime
- 消费方：`dsh-bash-sandbox`、`dsh-pwsh-sandbox`（shell 执行也走 `ctx.sandbox` 约束文件写）。
- `ctx.codeRuntime`：一个更高层的"代码运行"seam，`isolation` 字段标注 `'worker-thread' | 'process' | 'container'` 三种执行基质（官方明确：**这只是诊断标签，不是安全声明**）；把程序当"恶意对等体"，run 之间必须互相隔离、销毁时停干净。

---

## 五、对比：CubeSandbox vs DeepSeek-Harness 沙箱

| 维度 | CubeSandbox | dsh-sandbox（DeepSeek-Harness） |
|---|---|---|
| 定位 | 云沙箱**产品**（腾讯云开源） | Agent 框架**内置的一个可插拔能力** |
| 隔离粒度 | 完整 **MicroVM**（独立精简内核，KVM） | **进程级** OS 权限约束（bwrap/Landlock·Seatbelt·ACL token） |
| 隔离边界 | 整个执行环境（独立内核，天然含网络/进程隔离） | 仅**文件系统效果**；网络/进程在外，需另插容器/MicroVM seam |
| 启动 | 模板**快照克隆**，几十毫秒 | 子进程直接 spawn，无 VM 启动（更轻） |
| 内存开销 | COW **MB 级** | 进程内，近乎零额外 |
| 运行位置 | 云上 **Node 裸金属**（远程） | **本机同内核**（Linux/macOS/Win 本地后端） |
| 接口/架构 | 兼容 **E2B**；控制面 CubeAPI/CubeMaster + Cubelet | **Cordis 插件 seam**（`ctx.sandbox` / bash-sandbox / code-runtime） |
| 安全强度 | OS 级强隔离（独立内核） | OS 机制级，存在 `partial` 约束、fail-closed |
| 重型隔离 | MicroVM 即终极形态 | 容器/MicroVM 作为**兄弟 seam** 外插 |
| 适用 | 要**真正隔网隔离**、云端跑 Agent 任意代码 | **本地/轻量快速**、主要防"误写文件"，重型场景再升级 |

> 一句话记忆：**CubeSandbox 把 Agent 搬进一台小虚拟机（重隔离、云端、秒出）；DeepSeek-Harness 用 OS 权限把 Agent 的手脚绑住（轻隔离、本地、瞬时）——前者管"它在哪跑"，后者管"它在你机器上能碰什么"。**

---

## 六、小结与选型
- 只要 Agent 要执行真实命令/代码，就必须做执行隔离，否则就是在生产环境做实验。
- **强隔离需求**（跑不可信代码、要隔离网络/进程、云端按需扩）→ MicroVM 云沙箱，如 CubeSandbox / E2B / Firecracker。
- **轻量防误写**（本地 Agent、主要是"别 rm -rf 我的文件"）→ 进程级 OS 约束，如 dsh-sandbox；需要时就近插入容器/MicroVM 后端。
- 两者可组合：本地进程沙箱兜底 + 特定危险步骤到云端 MicroVM 沙箱。

---
## 相关笔记
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]] · ↪ 返回 AI 大模型 MOC
- [[工作/面试收集/20_专题研究/AI-Coding工具-对比|AI-Coding工具对比]] — 终端/IDE/通用 Agent 框架定位辨析（含 DeepSeek-Harness）
- [[工作/面试收集/20_专题研究/MCP与skill-对比|MCP与skill-对比]] — Agent 如何接外部能力
- [[AI大模型/Agent/生产级Agent工程架构蓝图-从Demo到千万级并发|生产级Agent工程架构蓝图（从Demo到千万级并发）]] — Agent 生产工程化