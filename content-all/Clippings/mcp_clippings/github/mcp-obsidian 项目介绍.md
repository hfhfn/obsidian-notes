---
title: mcp-obsidian：用 MCP 操作 Obsidian 笔记库
source: https://github.com/MarkusPfundstein/mcp-obsidian?tab=readme-ov-file
created: 2025-07-04
tags:
- MCP
- Obsidian
- 自动化
- 已消化
status: 已消化
modified: '2026-08-05T11:03:56+08:00'
---

> [!info] 摘录来源
> - **来源**：[GitHub mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian)
> - **剪藏时间**：2025-07-04

---

## 📌 摘录（项目介绍）

**mcp-obsidian** 是一个 MCP 服务器，通过 Obsidian 的**本地 REST API** 社区插件实现与 Obsidian 的交互。

主要能力：
- 列出笔记库所有文件和目录
- 获取指定目录下的文件和目录
- 获取单个笔记内容
- **全库文本搜索**
- 在指定标题、块或 frontmatter 位置**插入内容**
- 向已有/新建笔记**追加内容**
- 删除笔记或目录

适用场景：需要**自动化、远程或批量操作** Obsidian 笔记库，通过 API 进行内容管理和集成。

---

## 💭 我的想法 / 关联

- **为什么存**：这正是"让 AI 自动整理 Obsidian"的桥梁——Claudian 目前直接操作文件系统，但未来可用 MCP 走 REST API。
- **启发点**：插入/追加/删除的 API 设计，对应我整理笔记的核心操作。
- **注意**：需要先装 Obsidian 的 Local REST API 插件。

---

## 🔗 相关笔记

- [[Clippings/highlight_Clippings/模型上下文协议 - 维基百科，自由的百科全书|MCP 协议]]
- [[应用&工具笔记/obsidian/obsidian 插件|Obsidian 插件]]
- 笔记协作手册
