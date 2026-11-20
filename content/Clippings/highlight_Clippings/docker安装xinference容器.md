---
title: Xinference 容器部署与模型加载
source: https://chat.deepseek.com/a/chat/s/3973f9f7-22dd-4da0-9121-f27ce4c90cc7
created: 2025-07-04
tags:
- docker
- xinference
- GPU
- vLLM
- 模型部署
- 已消化
status: 已消化
modified: '2026-08-05T11:03:29+08:00'
---

> [!info] 摘录来源
> - **来源**：DeepSeek 对话
> - **剪藏时间**：2025-07-04

---

## 📌 摘录（核心方案）

### Docker 启动 Xinference（GPU）```powershell
docker run --name xinference -d `
  -p 9997:9997 `
  -e XINFERENCE_HOME=/data `
  -v E:\xinference\data:/data `
  -v E:\xinference\scripts:/scripts `
  --gpus all `
  --shm-size=2GB `   # 解决 NCCL 共享内存问题
  --restart=always `
  xprobe/xinference:latest `
  xinference-local -H 0.0.0.0
```

### 关键点
- `--shm-size=2GB`：解决 NCCL 共享内存不足
- 挂载 `scripts/` 目录：通过启动脚本自动加载模型
- 第一次用命令行启动（便于 UI 下载模型），后续用 compose 自动加载
- **Windows 编写 .sh 脚本需转 Unix(LF) 格式**（Notepad++ 编辑→格式→转换）

### 自动加载模型脚本（简化）```bash
xinference launch --model-name qwen3 --model-type LLM \
  --model-engine vLLM --model-format awq \
  --size-in-billions 32 --quantization Int4 \
  --n-gpu 2 --max_model_len 16384
```

---

## 💭 我的想法 / 关联

- **为什么存**：本机 GPU 跑大模型服务的完整部署方案。
- **启发点**：脚本里 `wait_for_service` + `load_models` 分离的模式很实用；健康检查用 curl 而非依赖复杂工具。
- **注意**：embedding/rerank 模型默认开 FlashAttention，30 系以下显卡不支持需注释掉。

---

## 🔗 相关笔记

- [[工作/使用到的docker命令收集|Docker 命令收集]]
- [[AI大模型/大模型训练&微调&推理/模型推理/vLLM_推理部署框架详解|vLLM 部署]]
- [[AI大模型/大模型训练&微调&推理/模型推理/llama_cpp_笔记|llama.cpp 笔记]]