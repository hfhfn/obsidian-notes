---
title: Qwen2.5 LoRA / QLoRA 微调四框架对比
tags:
- AI大模型
- 微调
- LoRA
- QLoRA
source: Transformers+PEFT+TRL / Unsloth / LLaMA-Factory / Axolotl 四套实现
status: 已消化
created: '2026-11-17T05:46:45+08:00'
modified: '2026-11-17T05:46:45+08:00'
---

# Qwen2.5 LoRA / QLoRA 微调四框架对比

---

下面用 **Qwen2.5-1.5B-Instruct** 作为统一基座，分别给出 **Transformers + PEFT + TRL（纯代码）** 、**Unsloth（加速版）** 、**LLaMA-Factory（YAML 配置）** 和 **Axolotl（YAML 配置）** 四套 LoRA 微调实现，再单独给出 QLoRA 示例，最后讲清楚微调完成后**动态加载**与**合并导出**两种使用方式。

---

## 一、Transformers + PEFT + TRL：最标准的 LoRA 微调

这是“手写代码”路线，完全可控，适合需要深度定制训练流程的场景。核心库是 `transformers` + `peft` + `trl` + `datasets`。

**安装依赖：**

```bash
pip install -U "transformers>=4.44" "peft>=0.12" "trl>=0.9" \
  "datasets" "accelerate" "bitsandbytes"
```

**完整训练脚本 `train_lora_peft.py`：**

```python
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTTrainer, SFTConfig

MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"
OUTPUT_DIR = "./qwen2.5-1.5b-lora"

# 1. Tokenizer
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# 2. 基座模型（BF16，全精度冻结权重 + 训练 LoRA）
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    torch_dtype="bfloat16",
    attn_implementation="flash_attention_2",  # 如环境不支持可删掉
)

# 3. LoRA 配置：常用做法是覆盖所有线性层
peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
)

# 4. 数据集：假设 train.jsonl 每行含 "messages" 字段（chat 格式）
dataset = load_dataset("json", data_files="train.jsonl", split="train")

# 5. SFTConfig + SFTTrainer
sft_config = SFTConfig(
    output_dir=OUTPUT_DIR,
    num_train_epochs=2,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,   # 有效 batch = 32
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    bf16=True,
    logging_steps=10,
    save_strategy="epoch",
    max_seq_length=2048,
    packing=True,                    # 提升吞吐
    assistant_only_loss=True,        # 只在 assistant token 上计 loss
)

trainer = SFTTrainer(
    model=model,
    args=sft_config,
    train_dataset=dataset,
    peft_config=peft_config,
    processing_class=tokenizer,
)

trainer.train()
trainer.save_model(f"{OUTPUT_DIR}/final")
tokenizer.save_pretrained(f"{OUTPUT_DIR}/final")
```

关键点：`assistant_only_loss=True` 会把 user/system 的 token 做 mask，只训练 assistant 回复部分；`packing=True` 把多条短样本拼进一个序列，减少 padding 浪费。保存下来的是**只有 LoRA adapter 权重**（通常几十 MB），基座权重不会被重新保存。

---

## 二、Unsloth：显存更省、训练更快

Unsloth 对注意力内核和梯度检查点做了专门优化，官方宣称在相同硬件下 VRAM 占用可减少约 30%，速度也有明显提升。API 仍然是 `FastLanguageModel` + `SFTTrainer`，迁移成本低。

```python
from unsloth import FastLanguageModel
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset

max_seq_length = 2048

# 1. 加载模型（Unsloth 封装，自动应用优化）
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="Qwen/Qwen2.5-1.5B-Instruct",
    max_seq_length=max_seq_length,
    load_in_4bit=False,          # 纯 LoRA 用 False；QLoRA 改为 True
    dtype=None,                  # 自动选择 bf16/fp16
)

# 2. 注入 LoRA adapter
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    lora_alpha=32,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",   # Unsloth 优化的梯度检查点
    random_state=3407,
    max_seq_length=max_seq_length,
)

# 3. 数据
dataset = load_dataset("json", data_files="train.jsonl", split="train")

# 4. 训练
trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    tokenizer=tokenizer,
    args=SFTConfig(
        dataset_text_field="text",   # 如果你的数据已经拼成 text 字段
        max_seq_length=max_seq_length,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        max_steps=200,
        logging_steps=10,
        output_dir="./qwen2.5-1.5b-unsloth",
        optim="adamw_8bit",
        seed=3407,
    ),
)
trainer.train()

# 5. 保存 adapter
model.save_pretrained("./qwen2.5-1.5b-unsloth-lora")
tokenizer.save_pretrained("./qwen2.5-1.5b-unsloth-lora")
```

Unsloth 保存出来的也是标准 PEFT adapter 格式，可以用 PEFT 的标准方式加载。但如果是 **4bit 训练后要用 Unsloth 做推理**，官方要求显式调用 `FastLanguageModel.for_inference(model)`，否则 4bit 推理路径不会走优化内核。

---

## 三、LLaMA-Factory：YAML 驱动，命令行一键训练

LLaMA-Factory 把训练参数全部收敛到 YAML，适合快速实验和多组配置对比，不需要写训练循环代码。

**训练 YAML `qwen2.5_lora_sft.yaml`：**

```yaml
model_name_or_path: Qwen/Qwen2.5-1.5B-Instruct
stage: sft
do_train: true
finetuning_type: lora

# LoRA 参数
lora_rank: 16
lora_target: all
lora_alpha: 32
lora_dropout: 0.05

# 数据
dataset: your_dataset_name
template: qwen
cutoff_len: 2048
max_samples: 10000
preprocessing_num_workers: 16

# 训练
output_dir: saves/qwen2.5-1.5b/lora/sft
logging_steps: 10
save_steps: 500
overwrite_output_dir: true
per_device_train_batch_size: 2
gradient_accumulation_steps: 8
learning_rate: 2.0e-4
num_train_epochs: 3.0
lr_scheduler_type: cosine
warmup_ratio: 0.1
bf16: true
```

**启动训练：**

```bash
llamafactory-cli train qwen2.5_lora_sft.yaml
```

LLaMA-Factory 的 `finetuning_type: lora` 对应标准 LoRA；`lora_target: all` 会自动匹配模型的所有线性层。数据集需要先在 LLaMA-Factory 的 `dataset_info.json` 中注册，`template` 必须与基座模型的 chat template 匹配。

---

## 四、Axolotl：另一套成熟的 YAML 训练方案

Axolotl 和 LLaMA-Factory 定位相似，但生态更偏 “研究/大规模实验” 风格，同样通过 YAML 描述模型、数据和方法，一条命令启动。

**最小 LoRA YAML 示例 `qwen2.5-lora.yml`：**

```yaml
base_model: Qwen/Qwen2.5-1.5B-Instruct
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer

load_in_4bit: false

datasets:
  - path: your_dataset.jsonl
    type:
      system_prompt: ""
      field_instruction: instruction
      field_output: output
    format: alpaca

val_set_size: 0.05
output_dir: ./qlora-out

adapter: lora
lora_r: 16
lora_alpha: 32
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - k_proj
  - v_proj
  - o_proj
  - gate_proj
  - up_proj
  - down_proj

micro_batch_size: 2
gradient_accumulation_steps: 8
num_epochs: 3
learning_rate: 2e-4
lr_scheduler: cosine
warmup_ratio: 0.1

bf16: true
gradient_checkpointing: true
logging_steps: 10
save_steps: 500
```

**启动训练：**

```bash
axolotl train qwen2.5-lora.yml
```

Axolotl 同样支持 `axolotl merge-lora` 命令把 adapter 合并进基座，输出到 `merged` 子目录。

---

## 五、QLoRA 微调示例

QLoRA 的本质是：**基座权重以 4bit NF4 量化加载并冻结，只训练 LoRA adapter**，从而把显存需求压到 16bit LoRA 的几分之一。以 Transformers + PEFT 为例：

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset

MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"

# 1. 4bit 量化配置
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
)

# 2. 加载 4bit 基座
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto",
)

# 3. 关键：为 k-bit 训练做准备
model = prepare_model_for_kbit_training(model)

# 4. LoRA 配置
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# 5. 数据 + 训练
dataset = load_dataset("json", data_files="train.jsonl", split="train")

trainer = SFTTrainer(
    model=model,
    args=SFTConfig(
        output_dir="./qwen2.5-1.5b-qlora",
        num_train_epochs=2,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        bf16=True,
        logging_steps=10,
        max_seq_length=2048,
        packing=True,
        assistant_only_loss=True,
    ),
    train_dataset=dataset,
    processing_class=tokenizer,
)
trainer.train()
trainer.save_model("./qwen2.5-1.5b-qlora/final")
```

`prepare_model_for_kbit_training` 是 QLoRA 流程中不可省略的一步：它会处理量化模型训练的精度细节，并启用适合 4bit 的梯度检查点，否则训练可能不稳定或直接报错。

**Unsloth 下的 QLoRA 只需要改一个参数**：把 `FastLanguageModel.from_pretrained` 中的 `load_in_4bit=False` 改为 `load_in_4bit=True`，其余 LoRA 配置和训练代码完全不变。LLaMA-Factory 和 Axolotl 则在 YAML 中把对应量化开关打开即可（LLaMA-Factory 使用 `quantization_bit: 4`，Axolotl 使用 `load_in_4bit: true`）。

---

## 六、微调完成后怎么用

LoRA 训练产物是 **adapter 权重**（`adapter_model.bin` / `adapter_model.safetensors` + `adapter_config.json`），基座权重原封不动。推理时有两条路：**动态加载 adapter**（不合并）和 **合并导出**（merge）。

### 方式一：不合并，用 `PeftModel` 动态加载（推荐用于多 adapter 切换）

这种方式保留 adapter 独立文件，基座仍然共享，适合需要同时维护多个任务 adapter、随时切换的场景。

**Transformers / PEFT 标准加载：**

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER = "./qwen2.5-1.5b-lora/final"

tokenizer = AutoTokenizer.from_pretrained(ADAPTER)
base_model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype="bfloat16")
model = PeftModel.from_pretrained(base_model, ADAPTER)
model.eval()

# 推理
messages = [{"role": "user", "content": "用一句话解释 LoRA。"}]
inputs = tokenizer.apply_chat_template(
    messages, tokenize=True, add_generation_prompt=True, return_tensors="pt"
).to(model.device)
outputs = model.generate(inputs, max_new_tokens=128)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

如果是 **QLoRA 训练出来的 adapter**，加载时基座必须使用**相同的 4bit 量化配置**，否则 adapter 的数值尺度不匹配：

```python
bnb_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", ...)
base_model = AutoModelForCausalLM.from_pretrained(
    BASE, quantization_config=bnb_config, device_map="auto"
)
model = PeftModel.from_pretrained(base_model, ADAPTER)
```

**Unsloth 下的动态加载：**

```python
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="./qwen2.5-1.5b-unsloth-lora",   # adapter 目录
    max_seq_length=2048,
    load_in_4bit=True,                           # 如果训练时是 4bit
)
FastLanguageModel.for_inference(model)           # 必须调用，否则 4bit 推理不走优化路径
```

### 方式二：合并导出，得到独立完整模型（推荐用于部署）

把 LoRA 的增量权重“融进”基座的线性层，导出一个不依赖 PEFT 的普通 Hugging Face 模型。推理时不需要 `PeftModel` 包装，可以直接交给 vLLM、TGI 等推理引擎。

**PEFT 合并：**

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER = "./qwen2.5-1.5b-lora/final"

base_model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype="bfloat16")
model = PeftModel.from_pretrained(base_model, ADAPTER)
merged_model = model.merge_and_unload()          # 合并并卸载 adapter 包装
merged_model.save_pretrained("./qwen2.5-1.5b-merged")
tokenizer.save_pretrained("./qwen2.5-1.5b-merged")
```

合并后，`./qwen2.5-1.5b-merged` 就是一个标准模型目录，加载方式和普通模型完全一样：

```python
model = AutoModelForCausalLM.from_pretrained("./qwen2.5-1.5b-merged", torch_dtype="bfloat16")
tokenizer = AutoTokenizer.from_pretrained("./qwen2.5-1.5b-merged")
```

**LLaMA-Factory 合并**用 `llamafactory-cli merge`，只需在 YAML 中指定基座、adapter 和输出目录：

```yaml
model: Qwen/Qwen2.5-1.5B-Instruct
peft_config:
  name: lora
  adapter_name_or_path: outputs/qwen2.5_lora
export_dir: outputs/qwen2.5_merged
```

```bash
llamafactory-cli merge merge.yaml
```

**Axolotl 合并**用 `axolotl merge-lora path/to/config.yml`，输出到 `{output_dir}/merged`。

**一个容易踩的坑**：如果你训练的是 QLoRA（4bit 基座），不要直接对量化权重做 `merge_and_unload` 后当作普通 FP16 模型使用。更稳妥的做法是先把 adapter 保存好，在合并时用**全精度基座**（或按 PEFT 文档先 dequantize）再合并；否则合并结果的精度和可用性可能不符合预期。

---

## 七、选型速查

| 方案                          | 形态               | 适合场景                                     | 主要优势                                     |
| ----------------------------- | ------------------ | -------------------------------------------- | -------------------------------------------- |
| **Transformers + PEFT + TRL** | 纯 Python 脚本     | 需要完全控制训练逻辑、自定义 loss / 数据处理 | 最透明，调试方便，生态兼容性最好             |
| **Unsloth**                   | Python API（封装） | 单卡显存吃紧、追求训练速度                   | VRAM 更省，内核优化，迁移成本低              |
| **LLaMA-Factory**             | YAML + CLI         | 快速实验、多组超参对比、不想写训练代码       | 配置驱动，内置数据集模板，一键 train / merge |
| **Axolotl**                   | YAML + CLI         | 研究风格实验、大规模多卡场景                 | 配置灵活，社区示例丰富，与 TRL 生态打通      |

如果只是**跑通第一个 LoRA**，建议从 Transformers + PEFT + TRL 开始；如果**显存有限想省资源**，优先试 Unsloth；如果**需要批量做多组配置对比**，LLaMA-Factory 或 Axolotl 的 YAML 驱动会更高效。微调后的使用，开发调试阶段用 `PeftModel` 动态加载最方便，正式部署前再 `merge_and_unload` 导出独立模型。

---

## 相关笔记

- [[AI大模型/大模型训练&微调&推理/模型微调/高效微调LoRA,Adapter,Prefix-tuning,P-tuning等作用范围|高效微调LoRA,Adapter,Prefix-tuning,P-tuning等作用范围]] — 各类 PEFT 方法的作用范围
- [[AI大模型/大模型训练&微调&推理/大模型微调与灾难性遗忘-LoRA解析|大模型微调与灾难性遗忘——LoRA解析]] — LoRA 为何能缓解遗忘
- [[AI大模型/大模型训练&微调&推理/大模型训练推理框架对比|大模型训练推理框架对比]] — 训练/推理框架选型
- [[AI大模型/大模型训练&微调&推理/大模型微调OOM-生产防线笔记|大模型微调OOM-生产防线笔记]] — 显存与 OOM 防线
