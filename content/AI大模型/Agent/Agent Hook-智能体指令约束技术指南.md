---
title: Agent Hook-智能体指令约束技术指南（100%稳定与安全）
tags:
- agent
- hook
- 强制约束
- claude-code
- codex
- 安全性
- 自动化
status: 已消化
source: Mastering_Agent_Hooks.pdf（12页）+ 智能体指令约束技术指南.png
created: 2026-08-30
modified: '2026-08-30T17:12:19+08:00'
---

# Agent Hook：智能体指令约束技术指南

> [!abstract] 一句话总结
> 无论是 claude.md、System Prompt 还是 Skill，本质上都是对 AI 的**「建议」**——只要依赖大模型的理解能力，控制权就永远在 LLM 手里。**Hook 是系统在特定时间点、特定条件下**必须执行的强制操作**，是目前唯一具备绝对强制性和稳定性的安全阀。

> [!info] 原始素材
> - 图解总览：![[AI大模型/Agent/智能体指令约束技术指南.webp]]
> - 原版 PDF 已归档：> [!warning] PDF 暂未发布
> 原文件 `Mastering_Agent_Hooks.pdf` 约 10.0 MB，超过发布阈值；可在本地 Obsidian 中查看。（12 页 · Claude Code / Codex / DeepSeek Harness）

---

## 1. 提示词与系统指令的脆弱性

> [!example] 现实案例
> - 理想状态：System Prompt / claude.md → 🟢 AI 精准执行
> - 现实状态：System Prompt / claude.md → ⚡ **上下文丢失 & AI 幻觉** → AI 完全无视规则（例：规则「每回话前叫爸爸」，结果 AI 无视）

**为什么提示词不够？**
- claude.md、System Prompt、Skill 本质上都是对 AI 的「建议」
- 面对超长上下文、复杂任务或模型幻觉时，AI 随时可能违背约定
- **核心洞察：只要依赖大模型的理解能力，控制权就永远在 LLM 手里**

**Hook 的核心价值：强制性 vs 建议性**

| | 建议性（Soft Constraint） | 强制性（Agent Hook） |
|---|---|---|
| 依赖 | AI 理解与执行（可能失效） | 系统强制机制，AI 无法绕过 |
| 风险 | AI 易摇摆、出现幻觉或上下文丢失 | 在关键节点用脚本硬性阻断 |
| 流程 | 用户输入 → AI 处理(带问号/错误) → 执行结果 | 用户输入 → Hook 处理 → 🛡️ 通过 |

---

## 2. 范式转移：什么是 Hook

三层结构（塔状）：
- **LLM（脑力）**：理解与生成
- **Agent Framework（躯干）**：基础执行
- **Agent Hook（神经中枢 · 最高法则）**：凌驾于所有指令之上的强制约束，由框架本身触发的底层机制，可对 Framework 强制 `Override`。

> **核心定义：在特定的时间点、特定的条件下，必须执行特定操作。** 不依赖大模型的主观判断。

---

## 3. 约束手段能力谱系

控制强度：弱约束 → 强约束｜能力域：知识注入 → 行为干预

| 手段 | 作用 | 局限 |
|---|---|---|
| **Skill** | 传授流程（让 AI 学会怎么做） | 依赖 AI 理解 |
| **MCP** | 扩展边界（让 AI 拥有外部工具） | 赋能，不限死路径 |
| **Claude.md / 提示词** | 注入知识（让 AI 知道什么） | 依赖 AI 自觉 |
| **Hook** | 绝对控制（系统在特定节点自动做、强制管） | 触发式强制干预，**不依赖 AI** |

---

## 4. Hook 的核心引擎：四大逻辑齿轮

单项流程：**Event 事件 → Match 匹配 → Handler 处理器 → Decision 决策**（结果分流 Green PASS 通过 / Red BLOCK 阻止）

1. **事件 Event**：什么时候触发？——生命周期特定节点（如 `user_prompt_submit`、`pre_tool_use`）
2. **匹配 Match**：满足什么条件才管？——精准过滤特定操作
3. **处理器 Handler**：到底要做什么？——执行 Python / Node.js 代码
4. **决策 Decision**：最终结果？——Pass 通过 / Block 阻止

> [!tip] 精准介入示例
> 智能体会调用大量工具，通过匹配条件只针对特定行为激活 Hook。例如：仅当 AI 尝试使用「命令行工具」时激活拦截，其余无害操作静默放行，避免「误杀」。
> 关键生命周期事件如 `user_prompt_submit`（用户刚提交提示词时）、上下文压缩前（适合保存 checkpoint 状态）。

---

## 5. 执行与裁决：代码级强制干预

- **处理器 Handler**：执行 Python 或 Node.js 脚本。开发秘诀：**处理器代码完全可以交给 AI 编写，人类只需定义边界和需求**。
- **决策的破坏力（取决所在生命周期事件）**：
  - 在 `user_prompt_submit` 处阻止 = **终结整轮对话**流程
  - 在 `pre_tool_use` 处阻止 = **仅剥夺本次工具调用权**（可能影响任务质量，但不致崩溃）

```text
# Handler 示意
> python script.py --input "data" ...
> node process.js ...
```

---

## 6. 平台对比：Claude Code 的代差优势

| 能力 | Claude Code | Codex |
|---|---|---|
| **Prompt Handler**（临时 AI 裁决） | ✅ 支持（Hook 临时调用一次 AI 做判断） | ❌ 需手动配 API 密钥并额外扣费 |
| **Agent Handler**（派发子智能体） | ✅ 支持（唤起专属子 Agent 复杂清洗） | ❌ 无内置子智能体派发机制 |

> [!conclusion]
> 在**无需额外编码的内置 AI 调度**与**高阶 Hook 自动化编排**上，Claude Code 目前遥遥领先。

---

## 7. 生态桥接：DeepSeek Harness 与插件化

- 最新 DeepSeek Harness 采用**特殊 Plugin 机制**（桥接插件 `.dsh`），扩展性极高，但也改变了原有部署逻辑。
- **最佳实践 · 拒绝盲目搬家**：
  - 不要将已稳定运行的 Codex / Claude Code 系统整体重写移植
  - 推荐：直接在 `.dsh` 配置文件中**指向现有的 `hooks.json`**，利用官方桥接插件低成本无缝接入，进行灰度测试

---

## 8. 从零构建 Hook 的黄金 SOP

| 职责 | 步骤 |
|---|---|
| **规则制定（人类）** | Step 1. 明确边界：是阻止修改、注入背景，还是压缩前保存？ |
| **规则制定（人类）** | Step 4. 部署与测试：放入项目目录，故意触发违规操作，验证红线拦截效果 |
| **代码编写（AI）** | Step 2. 拆解需求：在提示词中明确目标智能体（Claude Code 与 Codex 编辑文件方式不同，需针对性适配） |
| **代码编写（AI）** | Step 3. 生成双文件：Hook 执行脚本（Python/Node）+ 配置文件（JSON/YAML） |

---

## 9. 实战解构：绝对防御的「只读」盾牌

保护本地 `/profile` 隐私数据（无论如何诱导或幻觉都无法篡改）：

1. **Event**：监听所有文件编辑/删除操作
2. **Match**：检查目标路径是否包含 `/profile`
3. **Handler**：检查操作类型——读取(Read)→ Allow 放行；修改/删除(Write/Delete)→ 抛出异常
4. **Decision**：BLOCK（强制中止）

> [!result] 效果
> 无论提示词如何被诱导或发生幻觉，AI 永远无法篡改该隐私数据——这就是「硬编码级」的安全底线。

---

## 10. Claude Code Hook 实现示例

> [!warning] 先校正一个概念
> Claude Code 当前将 Hook 配置放在项目级 `.claude/settings.json`（或用户级 `~/.claude/settings.json`）的 `hooks` 字段中，不是一个必须叫 `hooks.json` 的固定文件。下面示例使用 Claude Code 的实际事件名：`PreToolUse`、`UserPromptSubmit`、`PostToolUse`、`Stop`。

### 10.1 通用配置骨架

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/block-dangerous-command.py",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/inject-project-context.py",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/audit-file-change.py",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/require-checkpoint.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- `matcher` 是正则表达式；`Bash` 匹配 Bash 工具，`Edit|Write` 匹配两个工具，`.*` 匹配所有输入。
- `type: command` 的 Hook 会从 **stdin 接收一份 JSON 事件对象**；脚本不要依赖命令行参数接收事件。
- `PreToolUse` 的结构化裁决放在 `hookSpecificOutput` 中：`permissionDecision` 可设为 `allow`、`ask` 或 `deny`。
- `UserPromptSubmit` 可通过 `hookSpecificOutput.additionalContext` 向当前提示词注入上下文；它不是修改用户原始文本。
- `Stop` 使用顶层 `decision: "block"` 和 `reason` 阻止本轮结束。若 Hook 只是记录日志，不输出阻断决定即可。
- 脚本正常退出（`exit 0`）表示 Hook 成功；`exit 2` 可用于阻断并把 stderr 反馈给 Claude。其他非零退出码通常表示 Hook 出错，不应拿它代替清晰的业务裁决。

### 10.2 示例一：阻止危险 Bash 命令（PreToolUse）

目录结构：

```text
.claude/
├── settings.json
└── hooks/
    └── block-dangerous-command.py
```

```python
# .claude/hooks/block-dangerous-command.py
import json
import re
import sys

payload = json.load(sys.stdin)
tool_input = payload.get("tool_input") or {}
command = tool_input.get("command", "")

# 只拦截高风险模式；不要用过宽的 "rm" 匹配造成误杀。
dangerous = re.compile(
    r"(?:rm\s+-rf\s+[/~]|git\s+reset\s+--hard|git\s+push\s+--force(?:\s|$)|del\s+/[sS])"
)

if dangerous.search(command):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                "命令命中高风险模式，已被 Hook 阻止。请改用可回滚、范围明确的操作。"
            )
        }
    }, ensure_ascii=False))
else:
    # 不输出 deny，交还给 Claude Code 的正常权限流程。
    print(json.dumps({}))
```

**执行链路：** Claude Code 准备调用 Bash → `PreToolUse` 匹配 `Bash` → 脚本从 stdin 读到命令 → 命中规则时返回 `deny` → 本次工具调用被取消；未命中时放行。

> [!tip] 更安全的路径保护
> 对文件写入保护时，优先使用规范化后的绝对路径进行比较，例如 Python 的 `Path(path).resolve()`；不要只用字符串包含判断，否则 `profile-backup` 等相似路径可能被误判，`../profile` 也可能绕过检查。

### 10.3 示例二：提交提示词时注入项目上下文（UserPromptSubmit）

```python
# .claude/hooks/inject-project-context.py
import json
import sys
from pathlib import Path

payload = json.load(sys.stdin)
prompt = payload.get("prompt", "")
context_file = Path("PROJECT_CONTEXT.md")

# 只对相关任务注入，避免每轮都增加上下文和费用。
if context_file.exists() and any(word in prompt.lower() for word in ("代码", "code", "实现", "bug", "修复")):
    context = context_file.read_text(encoding="utf-8")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "以下是项目强制约定，请在本轮执行前参考：\n\n" + context
        }
    }, ensure_ascii=False))
else:
    print(json.dumps({}))
```

这个 Hook 适合注入**短小、稳定、与任务相关**的背景信息；安全红线仍应放在 `PreToolUse` 中用代码阻断，不能只靠注入一段提示词。

### 10.4 示例三：工具完成后记录审计日志（PostToolUse）

```python
# .claude/hooks/audit-file-change.py
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

payload = json.load(sys.stdin)
record = {
    "time": datetime.now(timezone.utc).isoformat(),
    "event": payload.get("hook_event_name", "PostToolUse"),
    "tool": payload.get("tool_name"),
    "input": payload.get("tool_input"),
    "session_id": payload.get("session_id"),
}

log_file = Path(".claude/hooks/audit.jsonl")
log_file.parent.mkdir(parents=True, exist_ok=True)
with log_file.open("a", encoding="utf-8") as f:
    f.write(json.dumps(record, ensure_ascii=False) + "\n")

print(json.dumps({}))
```

`PostToolUse` 发生在工具调用完成后，适合做日志、格式化和测试触发；它不能撤销已经完成的写入。需要在写入前拦截，必须使用 `PreToolUse`。

### 10.5 示例四：没有 checkpoint 时阻止结束（Stop）

```python
# .claude/hooks/require-checkpoint.py
import json
import sys
from pathlib import Path

payload = json.load(sys.stdin)

# 防止 Stop Hook 自己触发下一轮 Stop，造成无限循环。
if payload.get("stop_hook_active"):
    print(json.dumps({}))
    raise SystemExit(0)

checkpoint = Path(".claude/checkpoint.md")
if not checkpoint.exists():
    print(json.dumps({
        "decision": "block",
        "reason": "尚未发现 .claude/checkpoint.md。请先记录当前进度、未完成事项和下一步，再结束本轮。"
    }, ensure_ascii=False))
else:
    print(json.dumps({}))
```

`Stop` 适合做“结束前必须完成”的检查，但不要把它当成测试系统本身：更可靠的做法是让脚本实际运行测试、读取明确的结果文件，并处理超时、失败和重入状态。

### 10.6 调试与上线检查清单

1. 先用 `echo '{"tool_name":"Bash","tool_input":{"command":"git reset --hard"}}' | python .claude/hooks/block-dangerous-command.py` 做离线测试。
2. Hook 脚本必须从 stdin 读取 JSON，并对缺失字段使用安全默认值。
3. 先在项目级 `.claude/settings.json` 灰度，不要直接修改用户级全局设置。
4. 高风险 Hook 应记录 `session_id`、工具名、目标路径和裁决原因，但不要把 API Key 等秘密写入日志。
5. 明确区分“拒绝本次工具调用”（`PreToolUse`）与“阻止结束本轮”（`Stop`）。
6. 验证正常路径、违规路径、脚本异常、超时和重复触发；尤其要测试 Windows 路径与包含空格的路径。

---

## 11. 从工具使用者到系统架构师

> [!quote]
> 停止把所有需求都塞进 Claude.md！让 AI 做它擅长的发散创造，让 **Hook 守住你的绝对底线**。掌握此机制，你已超越绝大多数智能体用户。

能力进阶：提示词撰写（Prompting）→ 系统配置（Configuring）→ **钩子接管（Hooking）**

Hook 将日常重复的**安全检查**、**状态保存（checkpoint）**、**环境注入**实现为硬编码级的自动化。

---

## 相关笔记

- [[AI大模型/Agent/在Agent中落地ReAct模式（Reasoning + Acting）|在 Agent 中落地 ReAct 模式]]
- [[AI大模型/Agent/生产级Agent工程架构蓝图-从Demo到千万级并发|生产级 Agent 工程架构蓝图]]
- [[AI大模型/面试题/Agent面试/大模型面试题-Agent-2026版-带答案|Agent 面试题（2026 带答案）]]
- [[AI大模型/AI-Coding/Claude_Code_全攻略PPT|Claude Code 全攻略]]
- [[AI大模型/Agent/Agent结构化输出与工具调用_FC_ToolUse_MCP_Pydantic|Agent 结构化输出与工具调用]]