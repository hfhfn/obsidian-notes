---
created: '2026-08-05T09:57:33+08:00'
modified: '2026-08-05T09:57:33+08:00'
---

==添加跳过香港和台湾节点的代理组：proxy-groups==
示例：
    - { name: 海外优质节点, type: url-test, proxies: [日本-优化, 日本-优化2, 日本-优化3, 新加坡-优化, 新加坡-优化2, 新加坡-优化3, 美国LA-优化-GPT, 美国LA-优化2-GPT, 美国LA-优化3-GPT, 加拿大-优化, 加拿大-优化2, 加拿大-优化3, 德国-优化, 德国-优化2, 英国-优化-GPT, 英国-优化2, 英国-优化3], url: 'http://www.YouTube.com', interval: 600, tolerance: 200 }
- 测试URL（YouTube.com）
- 测试间隔（600秒）
- 延迟容差（200ms）

==添加规则：rules==
示例：
    - 'DOMAIN-SUFFIX,generativelanguage.googleapis.com,海外优质节点'
    - 'DOMAIN-SUFFIX,claude.ai,海外优质节点'

==添加微软商店直连，防止开代理时无法打开微软商店：settings的system proxy中添加bypass==
示例：
    - "*.microsoft.com"

---

## 相关笔记
- [[应用&工具笔记/Clash配置/Mihomo Party 和 Clash Verge Rev的扩展配置脚本|Mihomo Party 和 Clash Verge Rev的扩展配置脚本]] — 扩展脚本 / 规则注入