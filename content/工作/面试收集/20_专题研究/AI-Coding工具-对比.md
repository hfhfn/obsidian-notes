---
title: AI-Coding工具对比
tags:
- AI-Coding
- 面试
- Agent
- 工具对比
status: 已整理
created: 2026-08-31
modified: '2026-08-31T18:44:11+08:00'
---

# AI-Coding 工具对比

> [!note] 一句话总览
> 主流的 AI-Coding 工具大致分三类：**终端编码代理**（Claude Code、OpenAI Codex CLI、Qwen Code、Aider）、**IDE 编辑器**（Cursor、Windsurf、GitHub Copilot）、以及**更泛化的"应用/通用智能体"**（OpenClaw、Hermes、DeepSeek-Harness 等）。面试讲清"它们是不是同一物种"，比罗列功能更重要。

> [!tip] 由于本领域 2026 年演进极快，下面每项都标了 ✅已核实 / ⚠️存疑，面试时只把确认的当结论说，存疑项表述成"据公开资料/印象"，别打包票。

---

## 一、终端编码代理（CLI Agent）

### 1. Claude Code（Anthropic）
- **一句话定位**：Terminal 里跑起来的 Agentic 编码代理，能读你整个仓库、自己跑命令、改文件、提 PR——现在更像一个"可在任意环境（终端/IDE/Web/移动端/Slack）使用的编码 Agent"。
- **关键特性**（✅已核实，2026-05~06 官方页面/博客）：
  - 终端原生 + VS Code / JetBrains 官方插件，也可在 Web、移动 App、Slack 里用
  - **Agentic / 长上下文 / 多文件编辑**：用 agentic search 理解代码库结构，一次改多个文件、跑测试、提 PR
  - 集成 GitHub/GitLab：读 issue → 写码 → 跑测试 → 提交 PR，整条工作流在终端完成
  - **Dynamic workflows**：拆 10~100 个并行子代理处理大任务（2026-05 上线）
  - **Agent view**：统一管理多个 Claude Code 会话（2026-05）
  - **Routines**：把任务配置成定时/API/事件触发的例行程序（2026-05）
  - **Computer use**：让 Claude 打开你的应用、操作浏览器、运行开发工具（2026-04）
  - 同一家公司还推出了 **Claude Cowork**（桌面协作组件），Claude Code 是其主入口之一
- **优点**：Agentic 完成度高、上下文长、能 handle 大仓库；生态成熟（插件/MCP/君规范 CLI）;可脚本化、可入 CI
- **缺点/限制**：**成本高**——重度用 Opus/大上下文很烧钱；变更多时需人工 review（容易"自作主张"）；最长 token 上下文仍有限，超大 monorepo 仍吃力
- **适用场景**：个人/团队的主力日常编码；从 issue 到 PR 的自动化；跨模块重构、加测试
- **定价**（✅，2026 官方）：已并入 **Pro（$20/月，年付约 $17）** 与 **Max（$100 起）** 订阅，内含一定用量——注意这不是早期"按 usage 计费的 Developer plan"那种卖法，面试别说过时版本
- **一句话记忆**：“终端里最能打的 Agentic 编码代理，最强也最贵。”

⚠️ **存疑**：题面提的“Developer plan”在 2026 可能已并入 Pro/Max，建议表述为“早期有按量计费的 Developer plan，现在主打包进订阅”。

---

### 2. OpenAI Codex（Codex CLI / Codex Web）
- **一句话定位**：OpenAI 的编码代理，**本地 CLI + 云端并行**两条形态。
- **关键特性**（✅ 官方 README / 文档，2026）：
  - **Codex CLI**：本地跑的 agent，`npm i -g @openai/codex` 或 `curl -fsSL .../install.sh`；可用 ChatGPT 账号（Plus/Pro/Business）登录，也能接 API key
  - **Codex Web / Codex App**：chatgpt.com/codex 网页端与 `codex app` 桌面端，**云端沙箱**里并行跑（cloud agent）
  - **沙箱运行**：在安全隔离环境里跑命令，降低误操作风险
  - **云并行**：云端可同时开多个任务/并行任务，适合批量、长耗时任务离线跑
  - **代码审查模式**：能读 PR/代码做审查建议（code review 能力）
  - 与 VS Code / Cursor / Windsurf 有 IDE 集成
- **优点**：本地免费 CLI 门槛低；云网端+并行适合"丢后台跑大量任务";代码审查能力可作为加分项
- **缺点/限制**：核心体验绑定 OpenAI 模型与账号计费；本地 CLI 与云端能力体验有落差（云端更强）；上下文/价格同样不便宜;审查建议有时偏泛
- **与 Claude Code 对比**：
  | 维度 | Claude Code | Codex |
  |---|---|---|
  | 形态 | CLI+IDE+Web+Slack 全平台 | CLI + 云端 Web/App |
  | 卖点 | 长上下文、Agentic、生态 | **云端沙箱 + 并行**、代码审查 |
  | 强项切换 | 大仓库多文件重构 | 云端批量/长任务 |
  | 厂家 | Anthropic(Claude 系列) | OpenAI(GPT-5.6 系列) |
- **适用场景**：习惯 OpenAI 生态、想要"本地 CLI + 云端并行"组合的人；PR 审查
- **一句话记忆**：“OpenAI 版 agent，云端并行+沙箱是它的差异化。”

⚠️ **存疑**：code review 模式的调用方式/细节以最新文档为准（我只确认"具备代码审查能力"，具体形态可能有变化）。

---

### 3. Qwen Code（阿里/通义）+ Qwen3-Coder 模型
- **一句话定位**：开源阵营的 agentic 编码 CLI + 头部开源编码模型。
- **关键特性**（✅ 2025-07 Qwen 官方博客）：
  - **Qwen Code** CLI 从 Gemini CLI fork、适配 Qwen 的 prompt/function-calling
  - 模型 **Qwen3-Coder**（480B MoE、35B active）原生 256K 上下文、可延拓 1M；开源编码/工具使用 SOTA，接近 Claude Sonnet 4
- **优点**：**开源、可控、可私有化**；中文生态好;性价比高
- **缺点/限制**：生态和集成成熟度略逊 Claude Code/Codex；用开源模型要自己搭
- **适用场景**：数据合规/私有化部署；成本敏感、想本地跑大模型 agent 的团队
- **一句话记忆**：“开源版最强 agentic 编码，中文+私有化是卖点。”

---

### 4. Aider（纯 CLI，可带过）
- **一句话定位**：老牌"终端里 chat-with-repo"的 CLI 编码助手。
- **关键特性**：多文件 git diff 治理、可接多家模型（含 OpenAI/Anthropic/本地模型）
- **优点**：轻量、透明、git-first、可接本地开源模型
- **缺点**：Agentic 能力上限不如 Claude Code/Codex；靠手切上下文
- **适用场景**：喜欢裸 CLI、要接各种/本地模型的极简派
- **一句话记忆**：“最克制的 CLI 编码代理，git 友好。”

---

## 二、IDE 编辑器（可带过）

### 5. Cursor
- **一句话定位**：AI 原生代码编辑器（VS Code 分支），把补全+Agent 放 IDE 里。
- **关键特性**：Tab 补全、Composer/Chat、Agent 模式、多模型可选
- **优点**：IDE 内体验顺滑、上手门槛低、生态成熟
- **缺点**：核心体验绑订阅付费；对"分叉自 VS Code"的更新要跟进
- **适用场景**：习惯图形化 IDE、追求开箱即用的人
- **一句话记忆**：“AI 原生 IDE 的代表，补全+Agent 一体。”

### 6. GitHub Copilot
- **一句话定位**：GitHub 主推的 AI 编程助手（原以补全著称，后也上 Agent）。
- **关键特性**：代码补全起家、深度绑 GitHub/CoPilot Workspace、多模型
- **优点**：量大面广、补全质量稳定、GitHub 工作流联动
- **缺点**：Agentic 深度普遍被认为不如 Claude Code；受模型的智商上限约束
- **适用场景**：重度用 GitHub 的开发者、想先上补全的团队
- **一句话记忆**：“补全之王，Agent 是后补的课。”

### 7. Windsurf
- **一句话定位**：AI IDE（原 Codeium 演进而来），强调"Agent + 流式补全"。
- **关键特性**：Agent 自动规划、Cascade 模型、跨 IDE 的 agent
- **优点**：UI/交互设计口碑好、速度不错
- **缺点**：市场份额/生态相对 Cursor 小
- **适用场景**：爱尝鲜、重 UI 体验的开发者
- **一句话记忆**：“Cursor 的竞品，界面和交互是招牌。”

（⚠️ Cursor/Copilot/Windsurf 具体功能点以 2026 当前版本为准，上表为"印象级"概括，面试只当常识带过，别展开背细节。）

---

## 三、应用智能体 / 通用 Agent（重点：说清"和编码代理不是一回事"）

> [!warning] 面试关键：Claude Code/Codex 是**编码（coding）agent**，但 OpenClaw、Hermes、DeepSeek-Harness 这类是**更宏观的"应用/通用智能体"或甚至不是面向终端的工具**。别把它们混进"AI 编码工具"堆里讲，要能把它们单拎出来讲清楚各自定位。

### 8. DeepSeek-Harness（`dsh`）——核实结论：既不是 RL 训练框架，也不是编码/补全工具
- **一句话定位**：DeepSeek 官方 2026-08 新发的**开源「通用智能体框架（agent harness）」**——用来**搭建/运行 LLM Agent** 的运行时与开发骨架（TypeScript / 基于 Cordis 插件架构 / 带本地 Web UI）。
- **关键特性**（✅ 官方 repo 与文档，2026-08）：
  - 仓库：`github.com/deepseek-ai/deepseek-harness`（官方组织真实项目，代号 `dsh`）；npm 包 `@deepseek-ai/dsh`
  - 启动 `npx @deepseek-ai/dsh web` → `127.0.0.1:3080` 起图形界面
  - **"一切皆插件"（Everything is a Plugin）**，基于 [Cordis](https://github.com/cordiverse/cordis)；有 `dsh-plugin` 生态、SAFETY 文档等
  - 定位是"编排/组合 LLM 智能体"的框架层
- **优点**：框架化、插件化、官方背书；适合开发者拿来搭自己的 agent 运行时
- **缺点/限制**：**不是开箱即用的终端编码器**；是一款刚发布的"开发者预览"项目，生态/成熟度仍在快速迭代
- **明确排坑**（✅，面试重点）：
  - ❌ **它不是 RL/强化学习训练框架**（DeepSeek 的 RL 内核在 DeepGEMM/DeepEP/DualPipe/3FS 等底层项目）；"harness" 在此指 **agent 运行时的编排框架**，不是训练封装
  - ❌ **它也不是 AI 编码补全/编码 Agent 工具**——DeepSeek 的编码产品是 **DeepSeek-Coder / Coder-V2**（代码语言模型），与本仓库是两个不同东西
- **适用场景**：往"用框架搭 Agent 运行时"方向做工程的人；不是给普通开发者写代码用的
- **一句话记忆**：“harness = 跑 agent 的框架骨架，不是 RL 训练，也不是 IDE 补全。”

### 9. OpenClaw（前身 Clawdbot——已核实改名属实）
- **一句话定位**：**自托管的通用"应用/设备级"个人 AI 智能体**——把模型+工具+消息频道+可选终端 App 收敛到一个本地 Gateway，在 WhatsApp/TG/Discord/Slack/Signal 等频道里指挥它在真实电脑上干活。
- **改名核实**（✅，VISION.md 原文）：`Warelay → Clawdbot → Moltbot → OpenClaw`。即 **Clawdbot 确实是 OpenClaw 的旧名**（更早 Warelay，中间 Moltbot）。Cloudflare 的部署模板也写明了这条改名链。**面试别把 Clawdbot 和 OpenClaw 当成两个东西。**
- **关键特性**（✅ repo：`github.com/openclaw/openclaw`，主创 **Peter Steinberger / steipete**）：
  - 频道型（channel-first）：在你自己常用的 IM 里用；可语音/Canvas/摄像头/computer-use
  - CLI/TUI/网页 Control UI；Skills+Plugins 扩展（`openclaw/clawhub` 技能注册中心）
  - 模型无关，本地/云端多模型；强调"trusted gateway / untrusted execution / deterministic policy"安全主张
  - 单机个人助手 ↔ 团队共享 Gateway 可切换
- **优点**：跨平台、channel-first、自托管、隐私/安全优先、模型无关、生态（skills/docker/插件）配套成熟
- **缺点/限制**：团队/规模化依赖"成员互信"模型（不适合零信任组织）；computer-use 与 agent-harness 能力官方自述仍是"接下来要做"的优先级，成熟度在爬坡；官方自述仍偏早期
- **与编码 agent 的界限**：它不是纯 coding agent，但能通过工具做开发——更像 Claude Code/Hermes 那类"通用体"，**不同于** OpenAI **Codex CLI** 那种"以写代码为中心"的编码 agent。
- **避坑**：GitHub 上同名的 `pjasicek/OpenClaw` 是 1997 游戏《Captain Claw》重制版，**与本项目无关**，别混淆。
- **一句话记忆**：“自托管、在 IM 里指挥的通用个人 agent，前身叫 Clawdbot。”

### 10. Hermes（Nous 出品，应用级 agent）——核实结论
- **一句话定位**：Nous Research 的**应用/通用型 AI agent**（自我标榜 "The self-improving AI agent / 自进化 AI 代理"），是**通用 agent**，不是纯编码工具。（注意与 Nous 的 **Hermes 2/3 开源模型家族**区分——同公司、不同东西。）
- **关键特性**（✅ 本地安装 + 仓库源码 | `github.com/NousResearch/hermes-agent`）：
  - **自进化技能学习闭环**：从经验自动建 skill、自我改进、持久化记忆、跨会话检索、构建用户画像
  - **模型无关**：接 Nous Portal / OpenRouter / OpenAI / 智谱 GLM / Kimi / MiniMax / 自建端点，`hermes model` 切
  - **多平台**：CLI/TUI + Telegram/Discord/Slack/WhatsApp/Signal（统一 gateway 进程）
  - **技能体系**：兼容 agentskills.io 标准；FTS5 会话搜索 + LLM 摘要回溯；多终端后端（本地/Docker/SSH/Singularity/Modal/Daytona/Vercel）；cron 定时 + 子代理并行委派；批量轨迹生成/压缩（服务下一代工具调用模型训练）
- **与 OpenClaw 的关系**（✅）：它是 **OpenClaw 的直系继任/同源路线**——仓库 README 明示 `hermes claw migrate`（可从 OpenClaw 自动迁移设置/记忆/技能/API key），与题面里"OpenClaw、Hermes 并列"强吻合。
- **优点**：自演进、模型无关、跨平台、技能与记忆体系完整、可移植后端多
- **缺点/限制**：属"通用 agent"而非开箱即用编码工具；需自己搭运行时；部分亮点（star、跑分）需在线实时核实
- **适用场景**：想跑"自主学习、跨 IM 触达、带记忆技能"的自主 agent
- **一句话记忆**：“会自我进化技能的应用 agent，与 OpenClaw 同源、是它的继任者。”

### 11. 一句话区分（面试救命表）
| 你说的 | 是编码工具吗 | 该类别的本质 |
|---|---|---|
| DeepSeek-Harness | ❌ 也不是 RL 训练 | DeepSeek 官方**通用 agent 框架**（plugin/Cordis），搭 agent 用 |
| OpenClaw(原 Clawdbot) | 弱相关/能开发 | 自托管**应用/设备级个人 agent**，频道型 |
| Hermes | 弱相关/能开发 | Nous **应用级自主 agent**，OpenClaw 继任者 |
| Claude Code / Codex | ✅ 是 | **编码** agent，终端+云端

---

## 四、横向对比表

| 工具 | 厂商 | 形态(CLI/IDE) | 核心卖点 | 主要短板 | 适合谁 |
|---|---|---|---|---|---|
| Claude Code | Anthropic | CLI + IDE/Web/Slack | Agentic、长上下文、多文件、生态强 | 贵、需多 review | 要认真干大活的开发个体/团队 |
| Codex | OpenAI | CLI + 云端 Web/App | 云端沙箱+**并行**、代码审查 | 绑 OpenAI/账号计费 | OpenAI 生态、要并行跑批任务的人 |
| Qwen Code | 阿里/通义 | CLI | 开源、私有化、中文好、性价比 | 生态成熟度略欠 | 合规/私有化/开源控 |
| Cursor | Cursor(Anysphere) | IDE | AI 原生 IDE、开箱即用 | 订阅费、跟 VS Code 分歧 | 重 IDE 体验者 |
| GitHub Copilot | Microsoft/GitHub | IDE(补全+Agent) | 补全稳定、GitHub 联动 | Agent 深度一般 | GitHub 重度用户、先上补全 |
| Windsurf | Windsurf(原 Codeium) | IDE | 交互/UI、Agent+Cascade | 生态盘子小 | 尝鲜、重 UI |
| Aider | 开源社区 | CLI | 轻量、git-first、接本地模型 | 能力上限较低 | CLI 极简派 |
| OpenClaw | 开源社区(steipete 等) | 应用/设备 Agent(Gateway) | channel-first、自托管、安全优先 | 偏早期、规模靠成员互信 | 要在 IM 里指挥的通用个人 agent |
| Hermes | Nous Research | 应用 Agent(CLI+IM) | 自进化技能、模型无关、跨平台 | 需自搭运行时、较复杂 | 想要自主学习/记忆的自主 agent |
| DeepSeek-Harness | DeepSeek | Agent 框架(非终端编码) | 插件化、搭 agent 运行时 | 刚发布、非开箱即用 | 开发者搭 agent 框架 |

---

## 来源与未核实项
- **来源**：Anthropic 官网/定价页（`anthropic.com/claude-code`、`/pricing`）、OpenAI Codex README 与文档（`developers.openai.com/codex`、`github.com/openai/codex`）、Qwen 官方博客（`qwenlm.github.io`）、DeepSeek-Harness 官方 repo/文档、OpenClaw 官方 repo`github.com/openclaw/openclaw` 及 VISION.md、Nous Hermes 本地安装与`github.com/NousResearch/hermes-agent`。
- **未核实 (面试前建议在线复核)**：
  - ⚠️ **OpenClaw / DeepSeek-Harness 的 GitHub star 数偏大（40万+/20万+）**，对如此年轻的项目异常可疑，**面试不要引用这些数字当权威指标**，只确认"仓库真实存在、近期发布"。
  - ⚠️ Hermes Agent 的 GitHub star / 最新版本号 / 真实跑分，本次未能线上核到（本地源码可证身份与特性）。
  - ⚠️ Codex "代码审查模式"的精确调用细节、Claude Code 的 **Developer plan 是否已被 Pro/Max 取代**，以 2026 当前官方页为准。
  - ⚠️ Cursor / Copilot / Windsurf 的功能点表述为"印象级"，面试只作常识带过。

## 相关笔记
- [[工作/面试收集/面试收集-MOC|面试收集 MOC]]
- [[工作/面试收集/00_题库/05-AI&大模型|AI&大模型]]