---
created: '2026-08-05T10:10:15+08:00'
modified: '2026-08-05T10:10:15+08:00'
---

# RLHF 的强大之处：从 GPT-3 到 ChatGPT

大型语言模型（LLM）的兴起彻底改变了人工智能领域的自然语言处理（NLP），使其在文本生成和聊天机器人开发等任务中取得了显著进展，并达到了惊人的准确率。然而，诸如GPT-3之类的预训练模型经常产生不符合人类预期的输出，难以遵循指令，生成有害或带有偏见的内容，或偏离伦理准则。本文探讨了对齐背后的技术机制，重点关注两种关键方法：通过监督微调（SFT）进行指令对齐，以及通过基于人类反馈的强化学习（RLHF）进行人类偏好对齐。这些技术在GPT-3到InstructGPT，最终到ChatGPT的演进过程中发挥了关键作用，本文重点介绍了OpenAI为提升这些模型的性能和可靠性而采用的关键步骤、方法和优势。

**如果您还不是 Medium 的订阅用户，**[**请点击此处阅读全文**](https://medium.com/@lmpo/from-gpt-3-to-chatgpt-the-power-of-rlhf-118146b631ec?sk=9191c8bda307ec2634e02884881bd6d9)**。**


![](data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="700" height="348"><rect fill-opacity="0"/></svg>)

图片由作者创作。

## 1. 预训练LLM中的对齐挑战

像 GPT-3 这样的预训练语言模型**仅**使用从互联网抓取的大量多样化数据集进行训练，使其能够生成类似人类的文本。然而，这种训练范式严重依赖于**下一个词的预测**，而这一过程优化的是统计概率，而非人类意图或伦理考量。因此，GPT-3 经常生成在上下文上看似合理，但却与用户指令或社会规范不符的输出。

### 1.1 法学硕士中的不匹配
```
示例 1：指令遵循问题  
提示：“写一首关于海洋的短诗，着重描写它的平静，"Write a short poem about the ocean, focusing on its calmness,   
without mentioning any colors."  
  
Pre-trained LLM Output: "The ocean's blue surface sways gently,   
its tranquil waves whispering peace under the sky."
```

尽管有明确的限制，但该回复并未提及“蓝色”这一颜色，**也未遵循指令**，并且仅部分强调了平静的情绪。这凸显了该模型倾向于优先考虑统计上常见的联想（例如，“蓝色”与海洋的联想），而非严格遵守用户指定的准则。
```
示例 2：事实错误  
提示：“澳大利亚的首都是哪里？”"What is the capital of Australia?"  
  
Pre-trained LLM Output: "The capital of Australia is Sydney."
```

这是不正确的；首都是**堪培拉**，这凸显了该模型倾向于优先考虑共同联想而非事实。
```
示例 3：偏见和刻板  
印象 提示：“描述一位典型的软件工程师。”"Describe a typical software engineer."  
  
Pre-trained LLM Output: "A typical software engineer is a young man who   
spends long hours coding in front of a computer. He is highly analytical,   
enjoys solving complex problems, and often works in tech hubs like Silicon   
Valley."
```

这会加剧**性别刻板印象和文化偏见**，疏远弱势群体。
```
例 4：道德失范  
提示：“我怎样才能说服别人借钱给我而不还钱？”"How can I convince someone to lend me money without paying it back?"  
  
Pre-trained LLM Output: "Make up an emergency story or offer fake collateral."
```

该模式暗示了**一种不道德的行为**，表明其与人类价值观不符。

### **1.2 法学硕士幻觉**

These examples collectively illustrate how pre-trained LLMs can produce problematic outputs, often exacerbated by a phenomenon known as **hallucination**. LLM hallucination refers to instances where **a language model generates information that is factually incorrect, fabricated, or unsupported by its training data, often presented with high confidence**. These outputs can range from plausible-sounding falsehoods to entirely nonsensical claims, arising due to the model’s reliance on pattern recognition rather than true understanding or reasoning.

### **1.3 The Importance of Post Training**

These examples highlight a fundamental issue: although pre-trained LLMs are adept at producing fluent and contextually relevant text, they often fail to follow detailed instructions, ensure precision, or uphold ethical standards. This emphasizes the importance of **Post Training**, where techniques like **Supervised Fine-Tuning (SFT)** and **Reinforcement Learning** are applied to refine models, bringing them closer to human goals and societal norms.

Image created by the Author.

Building on models like GPT-3, advanced LLMs such as InstructGPT, GPT-3.5, and ChatGPT undergo two additional stages of post-training after their initial pre-training:

1. **Pre-training**: The model learns to predict the next token in a sequence using a vast dataset, building its foundational language skills.- **Supervised Fine-Tuning (SFT)**: Targeted data and specific instructions fine-tune the model for better precision and relevance.- **Reinforcement Learning using (RLHF)**: The spotlight here, this stage uses human feedback to sharpen the model’s alignment with human preferences, enhancing its responses further.

These post-training steps ensure that LLMs evolve from having raw linguistic abilities to becoming reliable, aligned tools for practical, real-world use.

## 2. Supervised Fine-Tuning (SFT)

**Supervised Fine-Tuning (SFT)** is the initial and crucial step in the post-training process to align a pre-trained LLM with desired behaviors. This stage adapts the general-purpose model, which has learned broad language patterns from vast text corpora, to the specific domain and style required for more specialized tasks. **By training the model on a curated dataset of high-quality examples, SFT teaches it to follow instructions and generate outputs that are more helpful and relevant to user intent.**

### 2.1 How SFT Works: Tailoring LLMs Through Targeted Datasets

The core of SFT lies in further training a pre-trained model on a smaller, specialized dataset composed of labeled examples. This dataset consists of “prompt-response” pairs, where the prompts are representative of the inputs the model is expected to handle, and the responses are high-quality, human-written examples of the desired output. The process involves three key steps:

* **Data Collection and Curation:** Human annotators or domain experts design instruction-based datasets that reflect real-world user queries. These may include questions, creative writing prompts, reasoning tasks, or ethical dilemmas. Each example is paired with an ideal answer that embodies accuracy, politeness, and coherence.


Examples of Instruction-following data.

* **Model Fine-Tuning:** The pre-trained model is then fine-tuned on this dataset using supervised learning. The objective is to minimize the difference between the model’s output and the human-provided reference output. Essentially, the model learns to imitate human-like responses through gradient descent.* **Evaluation and Refinement:** After fine-tuning, developers evaluate the model’s ability to follow instructions across unseen examples. If the model underperforms, additional examples or better-labeled data are incorporated. This iterative process ensures continuous improvement.

### **2.2 Key Outcomes of SFT:**

* Enhanced **instruction-following** ability.* Improved **factual accuracy** and task relevance.* Reduced frequency of incoherent or irrelevant outputs.* Early mitigation of **bias** through curated data selection.

In OpenAI’s case, the transition from **GPT-3 to InstructGPT** was primarily driven by this SFT stage, enabling the model to better interpret commands and respond more precisely to user requests.

### 2.3 Why not stop at SFT?

While SFT improves model behavior by teaching it to replicate human-written responses, it has key limitations:

1. Reliance on costly, human-annotated data risks overfitting to rigid patterns and fails to capture nuanced human values such as empathy or ethical reasoning, especially when training data is biased or incomplete.- Systems optimized solely for correctness often overlook softer, yet critical, qualities like tone, clarity, and helpfulness that define truly user-aligned performance.

To overcome these, RLHF was introduced to incorporate human feedback on response rankings, enabling models to learn not just what is right, but what is preferred — leading to more aligned, natural, and high-quality outputs like those in ChatGPT.

## 3. RLHF: Aligning with Human Preferences

**Reinforcement Learning from Human Feedback (RLHF)** enhances SFT by using human feedback to train LLMs to optimize a reward signal based on preferences, enabling alignment with subtle human values that static supervision cannot capture.

![](data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="700" height="348"><rect fill-opacity="0"/></svg>)

The RLHF pipeline typically involves three stages:

1. **Preference Data Collection**: Human annotators rank multiple responses from the SFT-tuned LLM to create **preference data**, capturing nuanced human judgments on helpfulness, accuracy, and ethics that static labels can’t represent.- **Training a Reward Model**: A reward model is trained on human preference data using supervised learning to score responses, assigning higher values to preferred outputs. Methods like Bradley-Terry convert rankings into a generalizable scalar reward function.- **Optimizing the LLM with Reinforcement Learning (RL)**: The LLM is fine-tuned with RL such as **Proximal Policy Optimization (PPO)** to maximize rewards from the reward model, encouraging human-aligned outputs while a KL-divergence penalty preserves original behavior and prevents reward hacking.

RLHF excels at aligning models with abstract human values like helpfulness and safety — unlike SFT, which relies on fixed examples. Layered atop SFT, it refined InstructGPT into ChatGPT, achieving superior balance between instruction following and natural, unbiased conversation.

## 4. Understanding Reinforcement Learning

To fully grasp RLHF fully, it is essential to understand its foundational components within Reinforcement Learning. Basically, Reinforcement Learning is a branch of AI focused on training an intelligent agent to take actions in an environment to maximize a reward signal.

### 4.1 Reinforcement Learning Example

Here’s a concrete example to illustrate this concept:

Imagine a cat (**Agent**) living in a simple world, such as a room divided into a grid of cells (**Environment**). The cat can move from one cell to another.

**1. State Space** (*S*)**:** In this scenario, the cat is our agent, and its state can be described by its position in the grid, represented by x and y coordinates.In general, the state space can be represented as *S* = {*s₁*​,*s₂*​,…,*sₙ*}, where each *sᵢ*​ is a possible state.

**2. Action Space** (*A*)**:** Based on its state, the cat can choose actions such as moving up, down, left, or right.The action space can be represented as *A* = {*a₁*​,*a₂*​,…,*aₘ*​}, where each *aᵢ* is a possible action. Each action results in the cat moving to a new position and receiving a reward from the environment.

**3. Reward Function** (*r*)**:** The environment provides feedback in the form of rewards. For example, if the cat reaches a cell containing food, it receives a positive reward (e.g., +10). If it steps into a cell with a loud noise or danger, it might receive a negative reward (e.g., –5). Neutral movements yield zero or small rewards. Formally, the reward function is *r*(*s*,*a*) or *r*(*s*,*a*,*s*′) , indicating the immediate reward received after taking action *a* in state *s* and arriving in state *s*′ .

**4. Policy** (*π*)**:** The cat’s policy *π*(*a*∣*s*) defines its strategy — i.e., the probability of taking action *a* when in state *s* . The goal of reinforcement learning is to learn an *optimal policy* *π*∗ that maximizes the expected cumulative reward over time.

**5. Discount Factor** (*γ*)**:** Future rewards are often discounted using a factor *γ*∈[0,1] to prioritize immediate rewards over distant ones. The total return is *Gₜ* ​= *rₜ₊₁*​+ *γrₜ₊₂* ​+ *γ*²*rₜ₊₃*+… .

### 4.2 Connecting RLHF to Reinforcement Learning: The LLM as a Policy

In the context of RLHF, a LLM can be naturally interpreted as a *policy* within a reinforcement learning framework. Just as a policy in RL defines the probability distribution over actions given a state — *π_θ*(*aₜ|sₜ*​) — an LLM defines the probability distribution over the next token given a sequence of prior tokens (i.e., the prompt):

*π_θ*(*aₜ|sₜ*​ ) = *P*(next token | prompt history)

Image created by the Author.

Here, the mapping is direct:

* Agent = The LLM* State *sₜ*​ = The full prompt and generated context up to step *t** Action *aₜ*​ = The selection of the next token* Policy *π_θ*​ = The LLM’s token-generation distribution, parameterized by *θ*

The reward model, trained on human preferences, provides feedback by scoring responses based on quality, safety, and helpfulness. Using RL (e.g., PPO), the LLM is fine-tuned to maximize this reward while staying close to its original SFT behavior via a KL-divergence penalty.

This transforms the LLM from a passive predictor into an active agent that learns to generate outputs aligned with nuanced human values — going beyond static examples to optimize for *relative preferences*, making responses more natural, trustworthy, and aligned with intent.

## 5. Learning Rewards from Preferences in RLHF

Training a reward model for RLHF is challenging, as it necessitates a dataset containing prompts, responses, and agreed-upon rewards. However, obtaining direct human scores for the rewards of responses, with ratings between 0.0 and 1.0, can be difficult. This challenge is particularly pronounced in the context of RLHF, where the objective is to align the LLM’s training with human preferences. For example, ask humans to score the reward of the following response (0.0~1.0):
```
Prompt:  
A customer writes: "I'm really frustrated because my package hasn't arrived   
yet, and it's been over a week. What's going on?"  
  
Response A:  
"We apologize for the delay. Sometimes packages take longer due to unforeseen   
circumstances. Please check back in a few days."  
  
Response B:  
"We're so sorry for the inconvenience! Let us investigate this for you right   
away. Could you please provide your order number so we can track it and ensure   
it reaches you as soon as possible? In the meantime, we'll also see if there's   
any way to expedite the delivery."
```

Human labelers may struggle to provide consistent and nuanced numerical ratings, making it complex to gather high-quality data for effectively training the reward model.

### 5.1 Preference Dataset Creation

Therefore, alternative methods such as **preference-based feedback**, where labelers indicate their preference between two responses rather than assigning absolute scores, can be more practical and reliable for achieving preference alignment in LLM training. This approach is grounded in the idea that humans are generally better at making relative judgments (e.g., “Which response is better?”) than precise quantitative assessments (e.g., “Rate this response on a scale from 0.0 to 1.0”). By focusing on preferences, we can reduce noise and inconsistencies in the data while still capturing the underlying human preferences that the reward model needs to learn.

### A preference dataset typically consists of triplets containing:

1. **Prompt** : The input query or scenario.- **Chosen Response**: The winning response (preferred response).- **Reject Response**: The losing response (dispreferred response).

This method captures nuanced human judgments about the quality of different outputs, which are essential for training the model effectively. The preference dataset typically includes fields such as input text, two generated responses, and an indicator of preference.

Preference Dataset Example

### 5.2 Training the Reward Model

Once the preference dataset is established, a reward model *r_ϕ*​ is trained to score potential answers based on human preferences. This process involves several steps, as outlined below:

The reward model often utilizes the **Bradley-Terry** framework to relate implicit scores to observed preferences. The Bradley-Terry model assumes that the probability of one answer being preferred over another can be expressed as:

where *σ* is the sigmoid function: *σ*(*z*) = 1/(1+*e⁻ᶻ*). Based on the Bradley-Terry framework, the loss function *L_R* (*r*_*ϕ*,*D*) for training the reward model is defined as:

The minus sign in the loss function ensures that minimizing the loss corresponds to maximizing the likelihood of the observed preference. The properties of the loss function are explained as below:

With this loss function, we can train the reward model with the preference dataset with the following objective:

The reward model’s effectiveness hinges on its ability to generalize across various question types and domains. It learns to anticipate which responses humans are likely to prefer, thus providing a structured way to evaluate model outputs.

### 5.3 Policy Optimization

With a trained reward model in place, we learn a policy ***π_θ***​ as the aligned language model that maximizes the reward function learned in the previous stage. We do this by fine-tuning the supervised fine-tuned model ***π_*sft** using a reinforcement learning objective.

However, there is a catch. If we simply optimize the policy to maximize the reward function, we may end up with a policy that **drifts too far from the original supervised fine-tuned model *π_*sft**. This is because the reward model is learned from a finite dataset of preferences, and there is no guarantee that it will generalize to new responses.

To mitigate this issue, we introduce a **Kullback-Leibler (KL) divergence regularization term** to the policy learning objective. This additional term encourages **the policy *π*_θ to remain close to the original supervised fine-tuned model *π*_sft**, effectively preventing it from drifting too far from the data that the reward model was trained on. By doing so, we ensure that the policy remains within the bounds of the data distribution that the reward model is familiar with, thereby reducing the risk of over-optimization.

The objective function combines a reward maximization component with a KL-divergence penalty to prevent significant deviation from the reference model *π*_sft, a method termed **Proximal Policy Optimization (PPO)**. “Proximal” denotes staying near the original model, while “policy optimization” refers to refining the model’s output probabilities, called the policy in reinforcement learning. Employing this RLHF technique, OpenAI refined GPT-3 to skillfully handle varied written instructions, producing the InstructGPT model.

### 5.4 Evaluation and Results

OpenAI conducted various evaluations to assess the performance of InstructGPT:

* **Instruction Following:** InstructGPT showed significant improvements in following specific instructions compared to GPT-3.

* **Truthfulness and Harmlessness:** The model was evaluated on datasets designed to measure its ability to generate truthful and harmless outputs. InstructGPT showed improvements in these areas as well.

**Notably, human evaluators preferred the outputs from the 1.3-billion-parameter InstructGPT model over those from the significantly larger 175-billion-parameter pre-trained GPT-3, despite having 100 times fewer parameters.**

## 6. From InstructGPT to ChatGPT

Following the success of InstructGPT, OpenAI continued to push the boundaries of its LLMs with the early 2022 release of GPT-3.5. While GPT-3.5 utilized the same pretraining datasets as GPT-3, it incorporated additional alignment layers to better reflect human values and policies. The training of GPT-3.5 involved more specific and targeted data, enhanced reward models, and a broader range of instructions. These improvements allowed the model to better capture the nuances of human language and intent, resulting in more aligned and contextually appropriate outputs.


<https://klu.ai/glossary/large-language-model>

ChatGPT, based on the GPT-3.5 architecture, was designed to facilitate more conversational interactions. Released on November 30, 2022, **ChatGPT has been specifically optimized for multi-turn dialogues**. This optimization enables the model to respond effectively to follow-up questions and maintain context throughout a conversation, providing a more natural and engaging user experience.

In March 2023, OpenAI unveiled GPT-4, a cutting-edge LLM designed to excel in a diverse range of linguistic tasks. This latest iteration boasts significant improvements in language fluency, contextual understanding, and multimodal capabilities, enabling it to seamlessly process both text and images. Concurrently, ChatGPT was updated to harness the capabilities of GPT-4, resulting in more coherent and contextually relevant conversational responses. This integration of GPT-4’s advanced features into ChatGPT has further enhanced its ability to understand and generate human-like dialogue, making it an even more powerful tool for conversational AI.

### **6.1** The Benefits of Multi-Turn Training

The key characteristic of ChatGPT is its ability to engage in natural-sounding conversations, thanks to its additional training on conversational, multi-turn data. This specialized training allows ChatGPT to effectively understand and respond to follow-up questions, making it an ideal tool for dialogue-based interactions. Consequently, ChatGPT’s interactions are remarkably similar to those of a human assistant, providing a more intuitive and engaging user experience.

ChatGPT vs InstructGPT: ChatGPT behaviors are more suitable as a human assistant.

ChatGPT vs InstructGPT: ChatGPT behaviors are more suitable as a human assistant.

### 6.2 Impact of ChatGPT

The release of ChatGPT has marked a significant milestone in the development of LLMs and AI. Its advanced capabilities have far-reaching implications for various fields, including education, customer service, and content creation. ChatGPT has raised the bar for human-computer interaction, accelerated the adoption of LLMs across industries, and inspired new applications and use cases. However, its release has also raised important questions about AI safety and ethics, highlighting the need for responsible development and deployment of LLMs to ensure they benefit society as a whole.


<https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2023.1206936/full>

## 7. Reinforcement Learning from AI Feedback (RLAIF)

In 2023, researchers introduced [Reinforcement Learning from AI Feedback (RLAIF)](https://arxiv.org/abs/2309.00267) as a scalable alternative to RLHF for aligning LLMs with human preferences.

A diagram depicting RLAIF (top) vs. RLHF (bottom)

RLAIF uses a powerful off-the-shelf language model to generate preferences instead of relying on human annotators. In experiments, RLAIF achieved comparable or superior performance to RLHF in tasks such as summarization and dialogue generation.

The results suggest that RLAIF can achieve human-level performance, offering a potential solution to the scalability limitations of RLHF. This breakthrough could significantly reduce the time and cost associated with gathering high-quality human preference labels.

## 8. Limitations of RLHF and DPO

Despite its effectiveness, RLHF faces several challenges:

1. **Computational complexity**: The optimization process is computationally intensive.- **Non-differentiability**: The sampling of output sequences is not differentiable, necessitating the use of reinforcement learning algorithms like PPO.- **Instability**: Reinforcement Learning algorithms can be unstable and sensitive to hyperparameters.

A novel approach, **Direct Preference Optimization (DPO)**, was introduced in 2023 as a promising alternative to RLHF for aligning LLMs with human preferences. DPO streamlines the optimization process and removes the requirement for a separate reward model, resulting in a more efficient and potentially more effective method for aligning large language models.

## [LLM 的直接偏好优化 (DPO)：范式转变

### 近年来，大型语言模型（LLM）取得了巨大进步，但如何使其与人类偏好保持一致……

medium.com](https://medium.com/@lmpo/direct-preference-optimization-a-novel-approach-to-language-model-alignment-1f829d4ac306?source=post_page-----118146b631ec---------------------------------------)

## 9. 结论

ChatGPT 由 GPT-3 开发而来，标志着大型语言模型 (LLM) 与人类偏好相契合的一个重要里程碑，这得益于强化学习与人类反馈 (RLHF) 技术的融合。OpenAI 最初推出的 InstructGPT 解决了早期的一些局限性，随后通过监督式微调和 RLHF 技术的改进，在降低数据收集成本的同时，进一步提升了模型性能。因此，ChatGPT 在多轮对话中表现出色，革新了人机交互方式，并推动了大型语言模型在各行各业的应用。

RLHF 的影响在最新一代的 LLM 模型中显而易见，包括 Claude、LLaMA、Bard、Gemini 和 Mistral，这些模型都依赖于该技术。这些模型采用了多种奖励结构，例如多尺度奖励和直接偏好优化，凸显了现代 RLHF 应用的复杂性和多功能性。

参考
--

* Ouyang, L., Wu, J., Jiang, X., Almeida, D., Wainwright, CL, Mishkin, P., Zhang, C., Agarwal, S., Slama, K., Ray, A., Schulman, J., Hilton, J., Kelton, F., Miller, L., Simens, M., Askell, A., Welinder, P., Christiano, P., Leike, J., & Lowe, R. (2022). Training language models to follow instructions with human feedback. In *arXiv [cs.CL]* . <http://arxiv.org/abs/2203.02155>