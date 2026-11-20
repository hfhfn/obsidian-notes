---
created: '2026-05-15T20:57:48+08:00'
modified: '2026-05-15T20:57:48+08:00'
---

## 1. Windows下使用claude code, API能连接上(即URL和api-key没问题), 但无法有效对话(没有token响应), 总是延时退出

- ​根本原因不太清楚, 不过只需要每次启动claude前, 删除用户目录下的.claude文件夹和.claude.json以及.claude.json.backup两个文件, 再启动就可以正常使用了.

## 2. 配置claude code的第三方模型接口

> 最直接的方式是到对应API厂家的官网, 查看他们对应配置claude code的开发文档
> 
```shell
export ANTHROPIC_BASE_URL="http://your-gateway.example.com"   # 能接 /v1/messages  
export ANTHROPIC_AUTH_TOKEN="***REDACTED***"  
export ANTHROPIC_MODEL="your-model-name"
```

## 3. 配置显卡
- ### 配置编号以及对应的可见性
> CUDA 程序看到的 GPU 编号（如 device 0, 1, 2...）并非固定不变，`CUDA_DEVICE_ORDER` 定义了这套编号的生成规则。它主要有两种设定：
- **`FASTEST_FIRST` (默认值)**：CUDA 运行时自行决定，倾向于将性能最强的 GPU 编为 0 号。但具体排序规则不透明，剩余设备的顺序也不固定。这是很多“编号错乱”问题的根源。
- **`PCI_BUS_ID` (推荐设置)**：强制 CUDA 按照 GPU 在主板上的物理插槽顺序（PCIe Bus ID）进行编号。这保证了编号的**确定性和可预测性**，通常与 `nvidia-smi` 命令显示的索引顺序一致

```shell
# 设置排序规则为按物理总线顺序，然后只让程序看见物理上的 2 号和 3 号卡
# Windows下不建议配置 CUDA_DEVICE_ORDER=PCI_BUS_ID
# export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES=2,3
```

- ### 配置应用使用的首选显卡
![[images/pasted_images/cfcaf304-faf0-4e65-a0c4-3753dcf70dd1.webp]]