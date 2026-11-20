---
tags:
- AI-Coding
- ClaudeCode
- MCP服务器
created: '2026-02-19T16:46:02+08:00'
modified: '2026-02-19T16:46:02+08:00'
---

1. 安装supabase云数据库
	claude mcp add --scope user --transport http supabase "https://mcp.supabase.com/mcp"
2. 安装浏览器自动化工具
	claude mcp add chrome-devtools npx chrome-devtools-mcp@latest -s user
3. 安装context7检索工具
	claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp
4. 安装github-mcp工具
	github的认证token: ***REDACTED***
	claude mcp add-json github '{"type":"http","url":"https://api.githubcopilot.com/mcp","headers":{"Authorization":"Bearer ***REDACTED***"}}'  --scope user
5. 安装搜索工具brave(可以直接在用户目录下.claude.json配置文件中增加以下配置)
	需要先在魔搭社区注册远程MCP服务, 再配置以下信息
```json
"brave-search-mcp": {
  "type": "http",
  "url": "https://mcp.api-inference.modelscope.net/bf907fb0f5d744/mcp"
}
```

6. 安装网页抓取工具 fetch
	需要先在魔搭社区注册远程MCP服务, 再配置以下信息
```json
"fetch": {
  "type": "http",
  "url": "https://mcp.api-inference.modelscope.net/2e1f1f3558d243/mcp"
}
```