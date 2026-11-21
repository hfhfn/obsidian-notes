---
title: MCP与skill-对比
tags:
- 面试
- AI&大模型
- MCP
- skill
- Agent
status: 已整理
created: '2026-08-31T19:20:03+08:00'
modified: '2026-08-31T19:20:03+08:00'
---

# 🔌 MCP 高频工具 与 skill+CLI 替代 MCP 的优劣

> [!abstract] 一句话定位
> MCP（Model Context Protocol）是 **Anthropic 于 2024-11 提出的开放协议**，让 LLM 通过一套标准接口（JSON-RPC）调用外部**工具 / 资源 / 数据源**，把「模型该有的能力」从模型本身下沉到服务端，实现一次接入、多客户端复用。

---

## Part 1：高频 MCP 工具盘点

### 1.1 先懂 MCP 的三个面（面试必答）
- **Host**（宿主）：Claude Desktop / Claude Code / 各种 Agent 框架，负责调度。
- **Client**（客户端）：Host 与 Server 之间建立连接、发起调用的那一端。
- **Server**（服务端）：暴露能力的一方，实现工具/资源/提示词。
- **三种原语**：`tools`（可调用函数，带输入 schema）、`resources`（可读数据）、`prompts`（可复用的提示模板）。
- **传输层**：本地 `stdio`（子进程）＋ 远程 `Streamable HTTP`。
- **发起方**：David Soria Parra、Justin Spahr-Summers；现已被 OpenAI（2025-03 采纳）、Google（Gemini、2025-04 采纳）等**多家厂商认可**，成为事实上的**可互操作工具层标准**。
- **规范/版本**：schema 同时给 TypeScript 与 JSON 两份定义；官方 SDK 覆盖 Python/TS/C#/Go/Java/Kotlin/PHP/Ruby/Rust/Swift，生态语言齐全。

### 1.2 官方参考服务器（modelcontextprotocol/servers）
> [!tip] 面试记忆点
> 官方维护的**参考实现**主要是「示范功能」而非生产级，但点子都在。核心几个：Filesystem、Git、Fetch、Memory、Time、Sequential Thinking、Everything（测试用）。

| Server | 作用 |
|--------|------|
| Filesystem | 受控的文件读写（可配置访问白名单） |
| Git | 读/搜/改 Git 仓库 |
| Fetch | 抓取网页并转成适合 LLM 的文本 |
| Memory | 知识图谱式持久记忆 |
| Time | 时间与时区转换 |

> 已归档（多因被社区专责接管，如 GitHub/Slack/Postgre 等都有了更活跃的官方或社区版）：
> GitHub、GitLab、Google Drive、Google Maps、PostgreSQL、Redis、SQLite、Puppeteer、Slack（现由 Zencoder 维护）、Sentry、Brave Search（现由 Brave 官方接管）、AWS KB Retrieval、EverArt 等。

### 1.3 按场景盘点「高频实用」MCP（面试主菜）
| 场景 | 高频 Server / 工具 | 备注 |
|------|-------------------|------|
| 文件 / 代码 | Filesystem、Git、**GitHub**（官方向）、GitLab | Agent 改代码、提 PR 标配 |
| 网页 / 内容 | **Firecrawl**（抓取+转md）、SearXNG（自托管搜索）、Fetch、Puppeteer/Playwright（无头浏览器） | 建 RAG 语料常用 |
| 数据库 | PostgreSQL（多种实现，如 crystal/ReadOnly）、SQLite、Redis、DuckDB 等 | 多数默认**只读**，防破坏 |
| 办公协同 | Notion、Slack、Google Drive、Linear、Jira | OAuth 天然适配，SaaS 协作 |
| 开发 / 部署 | Docker、Kubernetes、Playwright、AWS/GCP/Cloudflare 各云厂商 | 工程效率 |
| 记忆 / 知识 | Memory、Chroma / Deep Lake 等向量库 | Agent 长期记忆 |
| 搜索 | Brave Search、Perplexity、Google 系 | 联网检索 |
| 内容创作 | 图片生成、视频、文档排版（可对接各 AI 生成服务） | EverArt 原官方，后社区化 |

> [!warning] 国内生态（**未核实**，面试若被问可答「在跟进，数字不确定」）
> 国内各家模型平台/云厂商也在推 MCP 化接入（阿里百炼 ModelScope、百度千帆、腾讯 等据称都有 MCP 布局与兼容），但具体 Server 清单与稳定性我**未逐一核实**，不硬编细节。若面试追问国内工具，建议投前自己搜一版最新盘点。

### 1.4 去哪里找「高频」清单（面试可提）
- **官方 Registry**：`registry.modelcontextprotocol.io`
- **社区目录**：Smithery、mcp.so、PulseMCP（聚合了大量社区 Server，可看热度/下载量）。
- 面试话术：「我会先在官方 Registry 和社区目录看热度，再按自己业务挑」。

---

## Part 2：skill + CLI 替代 MCP —— 是什么、为何兴起

### 2.1 拆开三个词
- **Skill**：打包「**指令 + 知识 + 校验脚本**」让 agent 复用的能力包（Claude Skills / agent skills）。本质是把「团队或个人怎么做某件事的 know-how」写进普通文件，agent 能读、能照着执行，还能跑 script 自校验结果。
- **CLI**：命令行工具。各开发工具基本都带 CLI（`gh`、`curl|jq|grep`、`npm`、`wrangler` 等），天然可组合。
- **组合思路**：**「SKILL 注入怎么做（知识/提示），CLI 直接动手（执行），跳过 MCP 服务层」**——尤其对**单人/轻量/本地**场景，动机是省掉 MCP 的部署、鉴权、调试成本。

### 2.1c skill vs agent：特点对比（面试最直接一句）
> 面试让"简单清楚介绍 skill 和 agent 特点"的必答口径。

- **Skill = 固定的 SOP 流程**：把"某件事怎么做"写成确定步骤，**追求稳定、可复用的流程**——交给它就在既定路径上执行，结果可控、可回归。
- **Agent = 能思考、会规划、自主决策的执行体**：基于环境/观察**动态决策**去调用**不同的工具和不同流程**——不固定走一条路，会计划、会试错、会兜底。
- **一句话对比**：Skill 是"**怎么做的标准动作**"（稳定复用），Agent 是"**怎么做最合适的决策者**"（思考/规划/观察决策）；一个追求**确定性**，一个追求**自主性**。生产中常用 Agent 当大脑、把单步动作做成 Skill 供其调用。

### 2.1b skill 的内部机制（面试多想一步）
> 面试官想听的是"skill 到底怎么工作"，可以往内部讲。

- **Skill = 一个目录（能力包）**：核心是 `SKILL.md`（frontmatter 写 `name`/`description`，正文写操作步骤/规范/范例），可外加 `scripts/`（可执行校验脚本）、`references/`（补充知识）、配置文件。
- **怎么被发现/加载**：agent 启动时扫描技能目录，**读取每个 skill 的 `description` 建立索引**；只有当用户任务命中某个 skill 的描述时，才**把那个 SKILL.md 内容按需加载进上下文**（不是全部常驻）——所以描述写得好不好直接决定"命中率"。
- **怎么执行**：skill 正文指导 agent 一步步做；需要校验时 `scripts/` 里的脚本跑一遍验证结果对不对，agent 据此纠正。
- **和模型的关系**：skill 本质是**注入上下文的知识/指令**，不微调模型、不依赖网络服务，纯本地文件，天然可放进代码库版本管理。
- **一句话**：skill = 按需把「某件事的 know-how」注进上下文，description 决定命中，scripts 负责自校验；轻、离线、可版本化，这也是它用来替代 MCP 服务的根因。

### 2.2 为什么有人用它替代 MCP
- 不必起一个常驻 Server、不用 JSON-RPC 配置、不用维护 token/网络。
- 复用**本机已装好的命令**，`curl | jq` 流水式管道，比串多个 MCP 调用更自然。
- Skill 可以注入**专有领域判断**（话术、代码规范、评审流程），这是纯工具调用给不了的「上下文」。

### 2.3 优势 vs 短板（面试对比）

**✅ Skill + CLI 的优势**
- 轻量：一个文件夹（Skill 就是指令+脚本）＋已装 CLI，**零常驻服务、零新依赖**。
- 无暴露面：不对外开 HTTP 服务端口，**没有因开 MCP Server 引入的无鉴权攻击面/越权风险**。
- 复用已装工具：不重复造轮子，管道天然可组合（`a | b | c`）。
- 可注入指令与知识：Skill 里带提示词、样例、禁忌、校验脚本，agent「知道怎么做」而非只会「能调什么」。
- 非工程师也易上手：Skill 约等于普通文件，无需终端/无需 docker。

**❌ Skill + CLI 的短板**
- **无统一标准**：每个 CLI 的鉴权、flag、报错都不一致，跨工具无法标准化。
- **不可被外部/其他客户端复用**：没有标准接口，别的 agent/客户端认不出来；无法像 MCP 那样被任何 host 发现式调用。
- **依赖本地环境**：要装好命令、配好环境变量，镜像/远程/无 shell 环境就跑不了。
- **跨工具生态弱**：无统一 `tools/list / tools/call`，缺少**会话级细粒度权限**——想让 agent「能用 gh 但禁删分支」几乎没法统一管控。

**✅ MCP 的优势**
- **标准化协议**：统一 `tools/list`/`tools/call` 接口，所有客户端一视同仁、可被发现与调用。
- **多样客户端**：写一次 Server，Claude/Codex/Gemini 等都能用。
- **服务化 / 共享**：可把复杂能力做成独立服务，团队/多人复用。
- **鉴权与审计**：OAuth 内置于规范；**会话级 `allowedTools` 细粒度授权**，配好即可，是后台无人值守 agent 的刚需。

**❌ MCP 的短板**
- **部署/配置成本**：要起 Server、配 client、管依赖，比「一个脚本」重。
- **网络 / 鉴权**：远程 MCP 要处理认证、网络、越权面（开个服务就多个风险入口）。
- **调试难**：stdio/HTTP 两层、工具调用黑盒，排查比 CLI 麻烦。
- **大文件传输别扭**：协议定位是「控制面」，传大输入（如图片）不顺手。

### 2.4 判断框架（可直接背）——「谁在用、解决什么问题」
> [!tip] 面试万能答案（来源 jngiam，2026-03）
> **它们不是互相替代，是解决不同问题：**
> - **Skill** → 团队/个人的**过程 know-how 与判断**（怎么做、什么好坏），人人通用。
> - **CLI** → 开发者的**构建/黑客模式**（管道组合、本地快）。
> - **MCP** → **已鉴权的 SaaS 接入 / 企业 / 无人值守的 background agent**（要权限边界、要审计、要一键接入）。
> 一句话：**「CLI 和 MCP 给 agent 工具，Skill 给 agent 用好工具的上下文。」**

| 维度 | Skill | CLI | MCP |
|------|-------|-----|-----|
| 本质 | 过程 know-how | 开发者工具链 | 已鉴权 SaaS 接入 |
| 最佳用户 | 所有人（个人/团队） | 开发者（build 模式） | 企业 / 非工程师 / 后台 agent |
| 鉴权模型 | 无 | 本地令牌（各异） | 内置 OAuth |
| 访问控制 | N/A | 难按会话细粒度隔离 | `allowedTools` 按会话 / MCP 网关 |
| 可组合性 | N/A | 原生管道 | 靠「结果落盘」workaround |
| 大输入传输 | 自然 | 自然 | 目前别扭 |
| 凭据 UX | N/A | 终端命令（对新手难） | 一键 UI |
| 典型场景 | 写作/评审/销售方法论 | gh、curl\|\|jq、npm | 多人协作、企业权限、定时 agent |

### 2.5 补充洞察（面试加分）
- 「技能之间的边界在模糊」：已有项目把 MCP Server **暴露成 CLI**、或把 CLI **包成 MCP**，两条路都在汇合。
- 别被「MCP 已死 / CLI 才是唯一」带偏——那是**开发者社区视角**；**企业/非工程师群体**反而在拼命把每个 SaaS 都接上 MCP。两种声音都真实，只是用户不同。
- 大模型团队面试常考：**「给你的 Agent 接工具，选 MCP 还是写脚本？」** → 答「看场景」：单机/本地/自用倾向 CLI+Skill；要共享、要权限、要后台无人值守、要给非工程师 → MCP。

---

## 💥 补充：技能/工具执行与「沙箱」（面试能说两句）

> 面试官问工具/skill 执行的安全与隔离时，能讲「沙箱」就加分——你做的 agent 要跑工具/代码，怎么保证不搞坏环境。

**为什么需要沙箱**：Agent 会让模型执行工具或生成的代码（文件操作、跑脚本、访问网络）。不加隔离，一次错误调用就可能改坏本地系统或泄露数据。

**沙箱的常见形态**（按隔离强度从低到高）
1. **权限/授权层**：给工具调用设权限白名单、危险操作二次确认（如 Claude Code 的权限系统）。
2. **进程/文件系统隔离**：在受限子进程或临时目录里跑；限制可访问路径、网络。
3. **容器化沙箱（生产主选）**：把执行放进 **Docker 容器 / gVisor / Firecracker** 等隔离运行时——**窄文件系统 + 无/受限网络 + 无宿主权限**。OpenAI Codex 云沙箱、一些 coding skill 的 sandbox 都属此类。
4. **网络隔离 + 审计**：沙箱内禁止外连或走代理白名单；全程日志留痕可回放。

**一句话记忆（能说两句）**
> Agent 执行工具/代码要落在沙箱：权限白名单 + 容器化隔离（Docker/gVisor）+ 网络受限 + 审计日志；单机用 CLI/Skill 也要拍照回退，生产无人值守更必须沙箱兜底。

---

## 📝 面试复述提纲
1. MCP 一句话 + 三原语（tools/resources/prompts）+ 传输（stdio/HTTP）+ 厂商采纳情况。
2. 高频工具按场景报 3-5 个（Firecrawl、Filesystem/Git、Postgres、Notion/Slack、Playwright）。
3. Skill/CLI/MCP 三者定位区分，各报优劣，落到「按场景选」。
4. 有明显优势方向：后台 agent 强制走 MCP；本地重构工具用 CLI+Skill、注入专属知识。

## ⚠️ 未核实 / 存疑项
- **国内（阿里 ModelScope / 百度千帆 / 腾讯）的 MCP Server 具体清单与稳定性**：未逐一核实，面试被追问只定性不举细节。
- **MCP「被 OpenAI/Google 采纳」的具体时间点**：大致记忆（OpenAI 2025-03、Gemini 2025-04 表态，**未逐字核对**），面试口头回答要不精确时间就说「已获多家主流厂商采纳」。若投前建议以官网新闻为准。
- **「有用 Skill+CLI 完全替代 MCP 的公司」案例**：多出自开发者社区（Reddit/Medium/个人 blog），**无企业级权威统计**，属观点性证据，非官方数据。

## 相关笔记
- [[工作/面试收集/面试收集-MOC|面试收集 MOC]]
- [[工作/面试收集/00_题库/05-AI&大模型|AI&大模型]]
- [[工作/面试收集/20_专题研究/AI-Coding工具-对比|AI-Coding工具对比]]