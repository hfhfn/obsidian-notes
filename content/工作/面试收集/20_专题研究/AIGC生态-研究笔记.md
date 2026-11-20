---
title: AIGC 生态-研究笔记
tags:
- AIGC
- 面试
- ComfyUI
- 文生视频
- TTS
status: 已整理
created: 2026-08-31
modified: '2026-08-31T17:58:06+08:00'
---

# 🎨 AIGC 生态 研究笔记（面试备战）

> [!abstract] 一句话定位
> AIGC = AI Generated Content，用生成式模型产图/视频/音频/文本。面试要能说出**主流开源模型 + ComfyUI 这类平台 + 一条端到端流程（如 AI 短剧）**，证明你懂"用什么、怎么串、各环节瓶颈"。

> [!warning] 时效说明（今天是 2026-08）
> 本文信息已尽量联网核实（2026-08 前），并标注来源。个别点查不到权威资料，已明确标 `[未核实]`，别当事实背。

---

## 1. AIGC 概览（3 句话能讲）

- **定义**：用大模型生成图片、视频、音频、文本等内容，取代人工制作的一部分环节。
- **国内赛道 = 面试加分项**：国内团队模型开源激进（阿里、腾讯、智谱、快手、MiniMax、生数），且中文语境、合规、本地部署需求强，**背熟中文团队模型非常加分**。
- **模型分两类**：**闭源 API**（可用但不可控、按量付费）vs **开源权重**（可本地部署、可微调/超分/编排，ComfyUI 生态就围绕开源权重）。

---

## 2. 图片生成 —— 主流开源模型

| 模型 | 团队 | 一句话定位 | 来源 |
|---|---|---|---|
| **Stable Diffusion（SD）** | Stability AI | 开源图生成鼻祖，基于扩散模型，生态最全（Lora/ControlNet） | stability.ai |
| **SDXL** | Stability AI | SD 的大规模升级版，1B 级，图质与提示词跟随显著提升 | stability.ai |
| **FLUX.1** | Black Forest Labs（柏林） | 后 SD 时代的焦点，**12B rectified-flow Transformer**，图质/排版/文字渲染领先 | github.com/black-forest-labs/flux · bfl.ai |
| **FLUX.2 / FLUX.3** | Black Forest Labs | FLUX.2 迭代；**FLUX.3 已是"视频+图像+音频"多模态模型**（不是纯图了） | bfl.ai/models/flux-2 · bfl.ai/blog/flux-3 |
| **SD 之后百花齐放** | 社区 | SDXL/Flux 各式微调、lora、工作流模板海量 | civitai.com |

> tip 面试点：把 SD 当"引擎/血统"，**FLUX 系列是当前开源质量上限**，且已升级到多模态视频。别只记 SD。

---

## 3. 视频生成 —— 主流开源/国产模型（重点背中文团队）

| 模型 | 团队 | 一句话定位 | 授权 | 来源 |
|---|---|---|---|---|
| **Wan（万象/乾坤）** | 阿里巴巴·通义 | **开源 MoE 视频生成，端到端**，720P 文生视频/图生视频，支持长镜头控制 | **Wan2.1 / Wan2.2 开源**（Wan2.7 不开源） | github.com/Wan-Video/Wan2.2 · wan22.io |
| **Kling（可灵）** | 快手 | 国产顶流**商用视频模型**（kling.ai），文生/图生 1080p，Kling 3.0 支持**原生音频同步 + 物理运动** | 闭源 API | kling.ai |
| **HunyuanVideo（混元）** | 腾讯 | **13B 参数开源文生视频**，质量/运动多样性强；**HunyuanVideo 1.5（2025-11）轻量高效** | 开源 | github.com/Tencent-Hunyuan/HunyuanVideo |
| **CogVideoX** | Z.AI（智谱旗下开源组织） | 开源文生/图生视频，最新 CogVideoX-3 提升帧稳定性 | 开源 | github.com/zai-org/CogVideo |
| **Hailuo（海螺）** | MiniMax | 国产商用视频，口碑好的文本运动跟随 | 闭源 API | minimax.io |
| **Vidu（可视）** | 生数科技 ShengShu | 国产商用文生视频 | 闭源 API | vidu.studio |
| **Sora / Sora 2** | OpenAI | 标杆文生视频，Sora 2 带对白+音效。**2026-04-26 产品下线，API 2026-09-24 停**（重要时效点） | 闭源 | openai.com/index/sora-is-here |
| Gen-3 / Veo | Runway / Google | 国外商用视频模型（可作对比提一句） | 闭源 | runwayml.com · google.ai |
| MuseVideo | — | **`[未核实]`** 未检索到权威资料，可能为流传名，别当事实讲 | — | — |

> tip 面试怎么答"国产视频模型"：**开源能跑（Wan / HunyuanVideo / CogVideoX）+ 商用 API（可灵 / 海螺 / Vidu）** 两条线都提，再补一句 Hailuo/Vidu 是 lite 移动端的即可显得懂行。

---

## 4. 音频 / 语音 生成

### TTS / 语音合成（开源）
- **CosyVoice**（FunAudioLLM / 阿里·Qwen 语音团队）：**多语言 zero-shot TTS，LLM 直出，音色/情感自然**，可跨语种克隆。当前到 **Fun-CosyVoice 3.0**（流式、低首 token 延迟）。github.com/QwenAudio/CosyVoice
- **ChatTTS**（社区）：**专为 LLM 对话场景**设计的生成式语音，语气更像真人聊天。github.com/2noise/ChatTTS
- **OpenVoice**：音色克隆（常与 ChatTTS 组合"10 秒克隆音色"）。可并入上面 GitHub 的 ChatTTS-OpenVoice 组合项目使用。
- **FunAudioLLM** 是阿里开源语音组织，CosyVoice 所属。

### 音乐生成
- **Suno**：商用闭源顶流，唱完整首歌。suno.com
- **ACE-Step 1.5**（开源 **Suno 的本地替代**）：MIT 协议，语言模型规划器 + 扩散 Transformer，**A100 上约 2 秒出一整首歌，可本地 ~4GB 显存跑，支持参考音频/人声伴奏**。github 搜 ace-step。`[未核实-细节]` 具体指标以官方 README 为准。

---

## 5. ComfyUI —— AIGC 平台的代表

### 是什么 / 核心定位
- **节点式（node-based）可视化编程工具**：把"模型 + 条件 + 采样 + 后处理"画成一个个节点，连线组成**图式 workflow（工作流）**，产出图片/视频/音频甚至 3D。
- **核心价值 = 可控 + 可复现 + 可复用**：整条流水线（文生图→放大→改脸→拼接）被固化成**一张图/一段 JSON**，改一个节点参数即可复跑。比"点按钮出图"更接近**工程化/被编排**——这正是它被叫"AIGC 平台代表"的原因。
- workflow 即 **JSON**，可保存、共享、版本化、甚至**通过 API 下发由程序批量执行**（ComfyUI 有 API 节点）——所以常被用作**后端服务/自动化底座**。docs.comfy.org

### 生态（为什么有生命力）
- **Custom Nodes（自定义节点）** 是灵魂：社区写几万个插件节点扩展能力。
- **ComfyUI-Manager**：官方扩展，一键**装/卸/开/关自定义节点**，还有 Hub 功能（现已并入 Comfy-Org 组织）。github.com/Comfy-Org/ComfyUI-Manager
- **Workflow 模板/社区**：官方 template 库 + 社区（comfy.org/workflows、civitai、shakker 等）海量成品工作流，拖进来就能跑。
- 老牌常用工具节点：**ComfyUltils / ComfyUI-VideoHelperSuite / ControlNet / LoraLoader** 等（本文不逐一核实，按功能理解）。

### vs Stable Diffusion WebUI（A1111）对比 —— 面试常考
| 维度 | **ComfyUI** | **WebUI (A1111)** |
|---|---|---|
| 范式 | 节点/图编排，复杂可控 | 表单/Gradio，开箱即用 |
| 上手成本 | 高（要理解数据流） | 低 |
| 灵活性/高级用法 | 极高（构图、并行、批量、作为库复用） | 有限 |
| 适用 | 进阶用户 / 工程化 / 服务化 | 新手 / 单次生成 |
> 类比：**SD 是引擎，ComfyUI 和 WebUI 是驾驶舱**；WebUI 更易用，ComfyUI 更灵活可编程。来源 wiki.shakker.ai / sider.ai

### 为什么是"AIGC 平台的代表"
- 它证明"生成能力可以被**图式编排+参数化**"，把 AIGC 从"工具"变成"**可复用的生产流水线/服务**"。
- 所有新开源模型（Flux、Wan、HunyuanVideo）几乎都会**第一时间接进 ComfyUI**，说"能进 ComfyUI，说明生态成熟"。

---

## 6. 成熟 AIGC 流程 ——【重点】AI 短剧 / AI 短片端到端

> [!success] 面试应答框架
> 面试官爱考"怎么用 AI 做一部短剧"。核心是把传统影视工业化分拆，**每个环节找一个 AI 模型/工具顶替**，最后拼装。答结构，秀你懂"编排能力"。

**一条典型流水线（按工艺顺序）：**

1. **剧本/脚本** → 用 **LLM**（GPT/Claude/DeepSeek/Qwen）写分集脚本、对白、大纲。
   - 保持"人设/世界观一致"用提示词 + 写好的角色卡。
2. **分镜（Storyboard）** → 用 **LLM + 文生图**（SDXL / Flux）按镜头**逐格出图**，常用 ControlNet（姿态/线稿/深度）稳定人物与构图、批量抽相同的角色形象（ID 一致性）。
3. **文生视频** → 单镜出图后，用**图生视频（image-to-video）**让静态分镜"动起来"：开源可跑 Wan / HunyuanVideo / CogVideoX，商用 API 可灵 / Hailuo / Vidu。
   - 关键难点：**多镜头角色一致性、运动连贯**——常靠抽帧回溯、ControlNet、角色 LoRA 校准。
4. **配音/音效/音乐** → TTS（CosyVoice 做角色配音、ChatTTS 做对话感）+ 音乐（Suno/ACE-Step）+ 音效。
   - **数字人**（如驱动静态角色嘴型）常见，用于口播/对白镜头。
5. **剪辑/拼接/后期** → 传统剪辑工具（剪映/Premiere) 拼镜头；AI 做局部修图（inpaint）、超分（放大）、补帧。
6. **成片/发布** → 字幕（LLM 生成）、封面图（文生图）、平台化/合规审核。

> tip 一句话概括面试话术：
> "AI 短剧 = **脚本LLM → 分镜文生图 → 图生视频 → TTS/数字人配音 → 剪辑成片** 的**能力编排**，核心瓶颈在**多镜头角色一致性**与**各环节的拼接与成本控制**，所以落地多走"半自动工业化"而非全 AI。"

---

## 7. 面试常问点（速记）

- **什么是 AIGC？** 用生成式模型产图/视频/音频/文本，替代人工制作。
- **主流开源图片模型？** SD / SDXL / FLUX（FLUX.3 已多模态）。
- **国产视频模型有哪些？** 开源：Wan、HunyuanVideo、CogVideoX；闭源 API：可灵、海螺、Vidu。
- **开源 vs 闭源怎么选？** 本地部署/微调/可控 → 开源；效果/省事 → 闭源 API。
- **ComfyUI 是什么？** 节点式 workflow 可视化编排，可控可复现，生态靠自定义节点 + Manager + 模板市场。
- **ComfyUI vs WebUI？** WebUI 易上手，ComfyUI 灵活可编程可服务化。
- **一条 AIGC 流程怎么串？** 短剧流程六环节（脚本→分镜→图生视频→配音→剪辑→成片）。
- **当前瓶颈/难点？** 视频**多镜头一致性、运动连贯、成本**、可控性；音频与口型同步。

---

## 相关笔记
- [[工作/面试收集/面试收集-MOC|面试收集 MOC]]
- [[工作/面试收集/00_题库/05-AI&大模型|AI&大模型]]
- [[工作/面试收集/20_专题研究/AI-Coding工具-对比|AI-Coding工具对比]]