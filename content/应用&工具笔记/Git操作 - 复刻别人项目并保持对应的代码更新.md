---
created: '2026-08-05T09:58:11+08:00'
modified: '2026-08-05T09:58:11+08:00'
---

两个完整的标准流程方案，既能跟随原项目更新，又能保持自己的修改，确保每次部署都是最新状态。

---

## 相关笔记
- [[CS(计科)/运维相关/K8s+Gitlab开发和部署/开发运维整体流程|开发运维整体流程]] — Git 分支 / CI/CD 部署流程

## 方案一：分支隔离法（推荐）

这个方案用**两个分支**分别管理"原项目代码"和"自己的修改"，最清晰也最安全。

### 初始设置（只需一次）
```bash
# 1. 克隆项目
git clone https://github.com/原用户/原项目.git my-project
cd my-project

# 2. 添加自己的远程仓库
git remote rename origin upstream  # 把原来的origin改名为upstream
git remote add origin https://github.com/你的用户名/你的仓库.git

# 3. 创建自己的开发分支（从main分支创建）
git checkout -b my-feature

# 4. 推送到自己的仓库
git push -u origin my-feature
```

### 日常开发流程
```bash
# 1. 每天开始工作前，同步原项目更新
git checkout main
git pull upstream main           # 获取原项目最新代码

# 2. 切换到自己的开发分支，整合更新
git checkout my-feature
git rebase main                   # 把自己的修改应用到最新代码上
# 如果有冲突，在这里解决

# 3. 继续自己的开发工作
# ... 修改代码 ...
git add .
git commit -m "我的功能开发"

# 4. 推送到自己的远程仓库备份
git push origin my-feature
```

### 部署流程（确保最新）
```bash
# 1. 准备部署代码
git checkout main
git pull upstream main           # 确保有原项目最新代码

# 2. 把自己的修改整合进来
git checkout my-feature
git rebase main                   # 再次确保基于最新代码

# 3. 创建部署分支（可选，用于标记部署版本）
git checkout -b deploy/$(date +%Y%m%d)
git push origin deploy/$(date +%Y%m%d)

# 4. 部署（根据你的项目）
npm run build
# 或者 python deploy.py 等
```

## 方案二：单分支管理法

这个方案直接在 `main` 分支上开发和部署，用 Git 的合并策略来管理。

### 初始设置（只需一次）
```bash
# 1. 克隆并设置远程仓库
git clone https://github.com/原用户/原项目.git my-project
cd my-project
git remote rename origin upstream
git remote add origin https://github.com/你的用户名/你的仓库.git

# 2. 推送初始代码到自己的仓库
git push -u origin main

# 3. 设置合并策略（关键步骤！）
# 告诉 Git：当拉取upstream更新时，优先保留我们的修改
git config merge.ours.driver true
echo "重要配置文件 merge=ours" >> .gitattributes
```

### 日常开发流程
```bash
# 1. 每天开始工作前，获取原项目更新
git fetch upstream

# 2. 将原项目更新合并到本地（保留自己的修改）
git checkout main
git merge upstream/main --no-ff --no-commit
# --no-ff: 总是创建合并提交
# --no-commit: 合并后先不提交，让你检查

# 3. 检查合并结果，解决冲突
git diff --cached  # 查看即将提交的更改
# 手动解决所有冲突

# 4. 提交合并结果
git commit -m "Merge upstream updates with local changes"

# 5. 继续自己的开发
# ... 修改代码 ...
git add .
git commit -m "我的新功能"

# 6. 推送到自己的远程仓库
git push origin main
```

### 部署流程
```bash
# 直接部署当前 main 分支（已经包含原项目更新和自己的修改）
git checkout main
git pull origin main  # 确保最新

# 创建部署标签
git tag deploy-$(date +%Y%m%d-%H%M)
git push origin deploy-$(date +%Y%m%d-%H%M)

# 部署
npm run build  # 或其他部署命令
```

## 两个方案对比

| 维度 | 方案一：分支隔离法 | 方案二：单分支管理法 |
|------|-------------------|---------------------|
| **学习曲线** | 稍陡（需要理解 rebase） | 平缓（主要是 merge） |
| **历史清晰度** | ⭐⭐⭐ 线性历史，很清晰 | ⭐⭐ 有合并节点，稍乱 |
| **冲突风险** | ⭐ 低（分批处理） | ⭐⭐⭐ 高（一次性合并） |
| **回滚难度** | ⭐ 容易（按功能回滚） | ⭐⭐ 稍难（功能混在一起） |
| **多人协作** | ⭐⭐⭐ 最适合 | ⭐ 容易冲突 |
| **适合场景** | 长期、复杂开发 | 简单修改、快速原型 |

## 我为什么推荐方案一？

因为在实际工作中，方案一的优势很明显：

```bash
# 1. 可以精细控制每个功能的合并
git checkout my-feature
git rebase main -i  # 交互式rebase，可以重新整理自己的提交

# 2. 可以同时开发多个功能
git checkout feature/login
git checkout feature/payment
# 每个功能独立，互不影响

# 3. 部署时可以选择包含哪些功能
git checkout main
git pull upstream main
git checkout -b deploy/20240227
git cherry-pick feature/login  # 只挑选登录功能
git cherry-pick feature/payment  # 或挑选支付功能
```

## 实用脚本

为了方便，可以创建两个脚本：

**sync.sh**（同步更新）
```bash
#!/bin/bash
# 方案一用
git checkout main
git pull upstream main
git checkout my-feature
git rebase main
echo "✅ 同步完成，当前在 my-feature 分支"
```

**deploy.sh**（部署）
```bash
#!/bin/bash
# 准备部署
git checkout main
git pull upstream main
git checkout my-feature
git rebase main

# 运行测试
npm test || exit 1

# 创建部署标签
TAG="deploy-$(date +%Y%m%d-%H%M)"
git tag $TAG
git push origin $TAG

# 部署命令
echo "🚀 开始部署 $TAG"
# 这里写你的部署命令
```

这样，你就能始终保持项目最新，同时优雅地管理自己的修改了！