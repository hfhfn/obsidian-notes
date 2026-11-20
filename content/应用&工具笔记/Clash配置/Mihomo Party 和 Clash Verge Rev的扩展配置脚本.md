---
created: '2026-08-05T09:57:32+08:00'
modified: '2026-08-05T09:57:32+08:00'
---

# Mihomo Party 和 Clash Verge Rev的扩展配置/脚本

## mihomo party

- 软件安装后会因为360打不开，需要把程序添加到信任
- 使用UWP工具解除回环限制（解决使用代理时，无法访问微软相关应用【微软商店】的问题）
  - 点击系统代理，打开UWP工具，全部勾选，点击全部解除
- 扩写配置(添加代理组和规则)
  - 点击覆写选项，新建覆写配置文件，填入下方配置，最后点编辑信息勾选全局启用
  - 添加了非港台节点的代理组，便于使用gemini和claude的API（地区限制）

```yaml
# https://mihomo.party/docs/guide/override/yaml

proxy-groups+:
  - name: "非港台选择"
    include-all: true  # 引入所有proxies
    filter: '(?i)^(?!.*(香港|台湾|hong kong|taiwan|HK|TW|剩余流量|套餐到期|官网)).*$'
    type: url-test
    interval: 300
    tolerance: 50

+rules:
  # - DOMAIN-KEYWORD,填写需要添加到规则的关键词,DIRECT  # 备用
  - DOMAIN-SUFFIX,hfhfn.xyz,DIRECT
  - DOMAIN-SUFFIX,generativelanguage.googleapis.com,非港台选择
  - DOMAIN-SUFFIX,claude.ai,非港台选择
  - DOMAIN-SUFFIX,anthropic.com,非港台选择
  - DOMAIN-SUFFIX,ai.google.dev,非港台选择
```

- 点击内核设置，勾选允许局域网连接，以便windows的WSL系统可以使用代理联网
- 最后点击软件上方的齿轮设置按钮，勾选开机自启
- 如果有绕过代理需求，可以点击系统代理，在其中配置需要绕过的IP或域名，也可以通过规则配置走直连
- 覆写脚本文章（没查看过，仅供参考）：https://iyyh.net/archives/f51e9150-160f-4de4-9be8-3c9efc6618df

## clash verge

- clash-verge 扩展配置删除了 prepend/append 能力，请使用 右键订阅 -> 编辑规则/编辑节点/编辑代理组 来代替
  右键订阅中的扩展配置也是不能使用prepend 的。我看更新说明应该就是不支持prepend了

- clash-verge 扩写脚本示例：

```javascript
// Define main function (script entry)

function main(config) {
  // 读取现有的规则
  let oldRules = config.rules;
  
  // 定义新的规则
  let newRules = [
    "IP-CIDR,172.172.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,192.192.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,127.0.0.0/24,DIRECT,no-resolve",
    "DOMAIN-SUFFIX,localhost,DIRECT,no-resolve"
  ];
  
  // 将新的规则添加到现有的规则中
  oldRules = newRules.concat(oldRules);
  
  // 更新配置的规则
  config.rules = oldRules;
  
  // 返回修改后的配置
  return config;
}
```

---

## 相关笔记
- [[应用&工具笔记/Clash配置/配置clash的profiles和bypass（这种是临时方法，一旦刷新订阅信息又要重新配置）|配置clash的profiles和bypass（这种是临时方法，一旦刷新订阅信息又要重新配置）]] — 代理组与规则的 YAML 配置

