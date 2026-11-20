---
created: '2026-09-17T17:54:16+08:00'
modified: '2026-09-17T17:54:16+08:00'
---

# Claude Code 架构深度拆解：从一个 AI 编程工具到完整的 Agent Runtime 框架

> **摘要**：本文基于 Claude Code 1884 个 TypeScript 源文件的架构审计，系统拆解其作为生产级 Agent Runtime 框架的设计思路。涵盖 ReAct 核心循环、四级上下文压缩、七层恢复机制、多层记忆系统、多 Agent 编排及安全纵深防御等核心架构，为 AI Agent 开发者提供工程实践参考。

---

## 核心定义

**Claude Code = Agent Runtime**

- Anthropic 官方推出的 AI 编程助手 CLI 工具
- 本质是一个完整的 Agent 运行时框架
- 内置 42+ 种工具调用能力
- 多层记忆系统 + 严格权限安全机制 + 多 Agent 协同编排设计

---

## 一、代码规模与技术栈

### 1.1 代码体量

| 文件 | 行数 | 职责 |
|------|------|------|
| `main.tsx` | ~4,700 | 总编排（CLI + React Ink UI） |
| `claude.ts` | ~3,600 | API 客户端 |
| `query.ts` | ~1,700 | ReAct 核心循环引擎 |
| **总计** | **1,884 个 TypeScript 源文件** | 中大型软件工程项目 |

### 1.2 技术栈架构

```
生产级 Agent 框架设计
├── TypeScript / React / Ink（终端 UI 渲染）
├── Zustand 风格状态管理（自研轻量 Store）
├── Multi-Agent 编排
├── 分层记忆系统
├── 权限沙箱
├── 多 Provider 适配
└── 遥测体系
```

**关键判断**：不是"调 API → 拿结果 → 打印"的简单封装，而是真正按生产级 Agent 框架设计的系统。

---

## 二、ReAct 核心循环（query.ts）

整个系统的心脏在 `query.ts` 的 `while(true)` 主循环，采用 **AsyncGenerator（yield）** 实现流式推送。

### 2.1 五阶段循环流程

```typescript
// query.ts 伪代码
async function* agentLoop() {
  while (true) {
    // 阶段1：上下文准备
    const context = await prepareContext();
    
    // 阶段2：模型流式调用
    const stream = await callModel(context);
    const { text, toolCalls } = await collectStream(stream);
    
    // 阶段3：工具执行
    if (toolCalls.length > 0) {
      const results = await executeTools(toolCalls);
      // 阶段4：附件收集
      const attachments = collectAttachments(results);
      // 更新记忆/上下文
      updateMemory(attachments);
    } else {
      // 阶段5：终止决策
      break; // 无工具调用 → 任务完成
    }
    
    yield { progress, message, toolResults };
  }
}
```

### 2.2 五阶段详解

#### 阶段 1：上下文准备

```
预处理策略：
├── snipCompactIfNeeded()   - 历史消息裁剪
├── microCompact()          - 缓存工具结果微压缩
└── autoCompact()           - Token 超限触发全量摘要
```

**目标**：保证每次送给模型的上下文既完整又不超标。

#### 阶段 2：模型流式调用

```
输入打包：
├── 对话历史（带 prependUserContext 注入 claude.md/记忆）
├── 系统提示（静态+动态分段）
└── 可用工具列表

输出收集：
└── for await (stream) - 流式收集文本回复 + 工具调用意图
```

**关键优化**：流式输出，模型边生成边回传，不等待全部生成完成。

#### 阶段 3：工具执行

```
两种执行器：
├── StreamingToolExecutor  - 并行流式执行（模型输出时已开始预执行）
└── 批量执行器              - 顺序执行（所有工具确定后统一执行）

执行前检查：
├── PreToolUse 钩子
├── 权限检查
└── 执行工具

执行后：
└── PostToolUse 钩子
```

#### 阶段 4：附件收集

```
收集内容：
├── 任务通知/提示信息
├── 记忆系统更新
└── 文件变更附件

用途：为下一轮模型调用做准备
```

#### 阶段 5：终止/继续决策

```
终止条件：
├── !needsFollowUp → completed
├── 达到轮次限制 → return
└── 上下文溢出处理 → 压缩重试

恢复机制：
├── 413 错误 → reactiveCompact → 重试
├── 输出截断 → Token 上限升级（8K→64K）
└── 最多重试 3 次
```

---

## 三、七层恢复防御体系

| 层级 | 机制 | 参数 |
|------|------|------|
| 1 | API 级指数退避重试 | BASE_DELAY=500ms，最多 10 次 |
| 2 | 529 过载处理 | 前台 3 次，后台立即放弃 |
| 3 | 输出 Token 恢复 | 8K→64K + 3 次恢复注入 |
| 4 | 响应式压缩 | 413 错误时全量摘要压缩 |
| 5 | 上下文排空 | 防御强度 50% |
| 6 | 模型 Fallback | 自动降级 |
| 7 | 无人值守持久重试 | 最大退避 5min，重置上限 6h |

**设计意义**：即使在网络抖动、API 过载、上下文爆炸等异常情况下，系统也能自我恢复，而非直接崩溃。

---

## 四、六大工程亮点

### 4.1 Prompt 缓存分割策略

```
系统提示分段：
├── 静态段（cacheScope: global）
│   ├── Identity 身份声明
│   ├── Tool Rules 工具指南
│   └── Code Style 编码哲学
│   └── 不同会话共享缓存
├── SYSTEM_PROMPT_DYNAMIC_BOUNDARY 边界标记
└── 动态段（每轮重算，不缓存）
    ├── 记忆内容
    ├── MCP 指令
    └── 环境信息

成本优势：缓存命中可节省 85%+ 成本
```

### 4.2 四级上下文压缩体系

```
压缩级别：
├── Level 1: Snip         - 轻量裁剪（每轮 API 调用前）
├── Level 2: Micro        - 微压缩（三种策略）
│   ├── 缓存感知压缩
│   ├── 基于时间的压缩
│   └── API 级压缩
├── Level 3: Auto         - 全量摘要（Token 超阈值触发）
│   └── AI 结构化摘要
└── Level 4: Reactive     - 紧急压缩（413 错误时）

压缩后智能恢复（按优先级）：
├── 最近读取的文件      - 50K tokens 恢复
├── 当前 Plan 文件      - 5 files max 恢复
└── 已调用的技能        - 25K tokens 恢复
```

### 4.3 投机执行机制（Speculative Execution）

```
执行流程：
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  用户确认    │────▶│  Overlay层   │────▶│ 真实文件系统 │
│  (RealFS)   │     │(Copy-on-Write)│     │  (复制回写)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       ▼                   ▼
   拒绝执行            删除覆盖层
   (什么都没发生)

流水线优化：
确认当前建议时 → 已开始投机执行下一条建议
```

### 4.4 BashTool 20 项安全检查

```
安全维度：
├── 不完整命令检测
├── JQ 函数注入
├── 危险变量嵌入
├── 换行攻击
├── 命令替换模式
├── IFS 注入
├── Unicode 空白字符伪装
├── Shell 元字符
├── /proc 访问
├── /dev/null 重定向
├── 控制字符
├── Glitch commit 替换
├── 反斜杠空白
├── 嵌入换行
├── 花括号展开
├── Token 注入
├── jq system()
├── 文件参数
└── 混淆标志

自动模式解释器黑名单：
├── Python BLOCKED
├── Node BLOCKED
├── Ruby BLOCKED
├── Perl BLOCKED
├── PHP BLOCKED
└── bash/sh BLOCKED
```

**关键设计**：自动模式下脚本语言必须经过用户确认，防止模型偷偷执行脚本。

### 4.5 Zustand 风格轻量 Store

```
自研核心机制：
├── Object.is 引用比较
├── Selector 订阅
├── Store 实例不变（避免级联重渲染）
└── 只有关注的字段变化才触发重渲染

AppState 包含 100+ 属性：
├── settings（设置）
├── tools（工具）
├── tasks（任务）
├── speculative（投机执行）
├── permission（权限）
└── mcp（MCP 状态）

原因：终端 UI（React Ink）需要极致渲染性能控制
```

### 4.6 Hook 系统设计

```
6 种 Hook 类型 × 24 种事件：

Hook 类型：
├── command     - 直接执行 Shell 命令
├── prompt      - 用 LLM 做智能审查
├── agent       - 启动完整多轮 Agent
├── http        - 调用外部 HTTP 端点
├── callback    - 内部 TypeScript 函数
└── function    - 简单布尔值检查

24 种事件覆盖：
├── 工具：PreToolUse / PostToolUse / ToolFailure
├── 权限：PermReq / PermDeny
├── 会话：SessStart / SessEnd
├── 生命周期：Stop / StopFail / Setup
├── 子任务：SubStart / SubStop
├── 通知：Notify
├── 数据：PreCompact / PostCompact
├── 输入：UserSubmit
└── 其他：Elicit / ElicitRes / Idle / TaskCreate / TaskDone
    / CfgChange / CwdChange / FileChange

企业级定制示例：
├── PreToolUse(command) → 每次执行 Bash 前自动记录审计日志
└── PreToolUse(prompt)  → 代码写入前自动触发 LLM 安全审查
```

---

## 五、多 Agent 架构

### 5.1 三种 Agent 执行模型

```
1. Fork 子 Agent（隐式 Worker）
   ├── 继承父 Agent 完整对话上下文
   └── 在独立分支里执行任务

2. In-Process Teammate（同进程异步）
   ├── AsyncLocalStorage 做上下文隔离
   └── 同进程内异步执行

3. Split-Pane Teammate（分窗格）
   ├── 在 tmux/iTerm2 开分窗格
   ├── Leader 在左侧
   └── Teammate 在右侧
```

### 5.2 Coordinator 编排模式

```
任务流水线：研究 → 综合 → 实现 → 验证

每个 Worker 可配置：
├── 不同的 Prompt
├── 不同的工具集
└── 不同的模型

内置 4 种角色 Agent：
├── Plan Agent      - 规划专家
├── Explore Agent   - 代码库探索
├── Verification Agent - 测试验证
└── ClaudeCode Guide - 使用指导
```

**架构判断**：具备 Manager-Worker 模式、任务拆解、委托分发、并发执行、Plan-Execute 分离的层次化多 Agent 架构。

---

## 六、五层记忆体系

### 6.1 记忆层级

```
短期记忆（工作记忆）
├── 当前会话消息列表（进程内）
├── 任务状态
├── 投机执行状态
├── 技能调用跟踪
└── 进程退出即丢失

长期记忆（三层持久化架构）
├── 底层：memory/ 目录
├── 中间层：MEMORY.md 索引文件（最大 200 行，始终加载）
└── 上层：按主题分类的记忆文件（独立 .md，YAML 前言）

路径：~/.claude/projects/<project-id>/memory/
```

### 6.2 记忆类型（4 种）

| 类型 | 用途 |
|------|------|
| `user` | 用户角色和偏好 |
| `feedback` | 用户纠正的反馈 |
| `project` | 进行中的工作约束 |
| `reference` | 外部系统引用 |

### 6.3 记忆搜索

```
非关键词匹配，而是语义搜索：
└── 使用 Claude Sonnet 模型判断相关性
    └── 每次最多选出 5 个最相关记忆文件加载
```

### 6.4 摘要记忆 & Checkpoint

```
摘要记忆（四级压缩）：
├── Level 1: 消息裁剪
├── Level 2: 对话摘要
├── Level 3: 结构化压缩
└── Level 4: 极限压缩

Checkpoint（会话持久化）：
├── 随时关闭终端不丢失
├── 下次 --resume 恢复
├── 消息历史完整恢复
├── 文件变更记录恢复
└── 代码归因信息恢复
```

---

## 七、Prompt 编排系统

### 7.1 六级提示优先级

```
1. Override     - 循环模式全量替换
2. Coordinator  - COORDINATOR_MODE
3. Agent        - Proactive/普通模式
4. Custom       - --system-prompt
5. Default      - 标准 Claude Code 提示
6. Append       - 始终追加（最低优先级）
```

### 7.2 场景变体

```
默认交互模式 / Plan 模式 / Proactive 模式
/ Coordinator 模式 / SDK 非交互模式
```

### 7.3 工具描述注入方式

```
不注入系统提示，通过 API tools[] 独立传递：
├── 每个工具 prompt() 动态生成描述
└── 延迟加载机制：工具超过 20 个时
    └── 模型先通过 tool_search 搜索发现工具
```

---

## 八、安全纵深防御

### 8.1 六层安全环

```
1. Zod 验证         - Schema 强制校验
2. 8 源权限匹配     - 分层规则匹配
3. 二阶段分类器     - Sonnet 快速判断 + 扩展思考深度分析
4. 文件系统边界     - 防止路径遍历
5. Shell 安全检查   - 20 项检查
6. Docker 沙箱      - 隔离执行环境

辅助机制：
├── 连续拒绝 5 次 → 自动回退交互模式（防分类器死循环）
├── 危险文件保护列表
├── 解释器黑名单
└── Hacker 沙箱隔离
```

**设计哲学**：不信任模型输出，层层验证的系统。

---

## 九、可观测性体系

### 9.1 监控组件

```
├── Datadog (DD)        - 遥测
├── GrowthBook          - AB 实验
├── OpenTelemetry (OT)  - 追踪
└── 一方事件记录

日志分级：
├── 调试日志
├── 错误日志
├── 5 级 Session 文件
├── 内存 100 条
├── MCP 64 事件
└── 15s 批量上报
```

### 9.2 隐私控制

```
三级开关：
├── 全部启用
├── 禁用遥测
└── 仅保留必要流量

PII 保护：
└── 代码内容和文件路径被类型标记保护
    └── 使用超长类型名确保不意外记录敏感信息
```

---

## 十、总体评价

### 10.1 四维能力雷达

| 维度 | 核心设计 | 目标 |
|------|----------|------|
| **成本意识** | Prompt 缓存分割 + 四级压缩 | 降低 API Token 成本 |
| **韧性设计** | 七层恢复 + 会话持久化 | 不中断用户体验 |
| **安全纵深** | 20 项检查 + 分类器 + 黑名单 | 防止恶意操作 |
| **架构前瞻** | 投机执行 + Coordinator + KAIROS | 隐藏等待延迟 |

### 10.2 核心判断

> **Claude Code 是目前业界工程完成度最高的单体 AI Agent CLI 实现，没有之一。**

这不仅仅是一个 AI 编程工具，而是一个成熟的 **Agent Runtime 框架**，其设计思路值得所有 AI Agent 开发者和产品从业者深入研究。

---

## 参考资料

- 视频来源：B站/公众号/YouTube @唐国梁Tommy
- 项目地址：`TGLTommy.com`
- 核心文件：1,884 个 TypeScript 源文件
- 架构审计方法：系统级源码分析

---

*注：本文整理自视频原始提取材料，已修正 OCR 识别错误（如 "cloud code"→"Claude Code"、"ag"→"agent"、"typepescript"→"TypeScript" 等），合并重复幻灯片内容，保留核心技术要点。*

---

## 15:10–16:10 四维能力雷达数据

| 维度 | 核心能力 | 关键指标 |
|------|----------|----------|
| **成本意识 (Cost Awareness)** | Prompt缓存分割 + Fork子Agent占位优化 + 四级压缩体系 | 缓存命中率优化 **92%** |
| **韧性设计 (Resilience)** | 七层恢复机制 + 会话持久化 + 上下文爆炸优雅退化 + 压缩后智能恢复 | 韧性设计 **95%** |
| **安全纵深 (Defense in Depth)** | 20+安全检查点 + 二阶段分类器 + 拒绝追踪 + 解释器黑名单 + 文件保护 | — |
| **架构前瞻 (Forward Architecture)** | 投机执行 + Coordinator多Agent编排 + KAIROS + 每日日志蒸馏 | — |

> "你的对话可以中断、可以恢复，"

> "这是一个能执行Shell命令、能读写文件的AI系统，作为——这是被真实的安全事件教训过之后才加上去的。"

---

## 16:10–16:30 架构前瞻：预留未来布局

投机执行、Coordinator多Agent编排、CAR助手模式、每日日志蒸馏等功能——**有的还在特性门控后面，还没有完全开放**。但架构上已经预留好了位置。

这说明团队不只是在做当前的产品，而是在为 **AI Agent未来几年的演进做布局**。

---

## 16:30–17:00 值得观察的设计：模型即理解引擎

| 设计选择 | 说明 |
|----------|------|
| 无预构建代码索引 | 不做 Embedding 向量检索 |
| 不做 AST 语法树分析 | 不依赖传统静态分析 |
| 完全依赖模型推理 | 加上 grep/glob 实时搜索来理解代码库 |

> "在当前模型能力越来越强的趋势下，这种选择是说得通的。但当代码库规模非常大的时候，效率可能是一个瓶颈。"

---

## 17:10–17:30 总结

"这就是我对 Claude Code 源码架构的完整解读。我们今天从它的**核心循环**讲到**工程设计亮点**，从**多Agent编排**讲到**安全纵深防御**，从**记忆体系**讲到**Prompt缓存优化**。"

Claude Code 展示了 Anthropic 团队在 **AI Agent工程化**方面的深厚功力。对于做AI产品的同学来说，这套架构里有太多值得学习的设计思路了。

> 如果你觉得这些内容有帮助，记得点赞关注。如果你对其中的某个模块想看更深入的分析，欢迎在评论区告诉我。我们下期见。

---

## 相关笔记

- [[AI大模型/Agent/12种Agent Harness设计模式|12种 Agent Harness 设计模式]] — 本文模式在真实生产级 Agent Runtime 中的落地实例
- [[AI大模型/Agent/第13集｜三分钟带你搞懂：鹅厂Agent面试题——为什么选择手搓Agent而不用LangChain？|第13集：手搓 Agent vs LangChain]] — 手搓生产级 Agent 的工程论证
- [[AI大模型/Agent/L3-18-06 沙箱隔离：让Agent的危险操作套上防护罩|L3-18-06 沙箱隔离]] — 安全纵深的具体隔离技术实现
- [[AI大模型/AI大模型-MOC|AI 大模型 MOC]]