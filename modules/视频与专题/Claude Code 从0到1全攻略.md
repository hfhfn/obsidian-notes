---
title: "Claude Code 从0到1全攻略"
tags:
  - video
  - notebooklm
notebook_id: "f72037f9-7650-4b9f-a8ad-781b725a5f8c"
source_url: "https://www.youtube.com/watch?v=AT4b9kLtQCQ"
derived:
  - mind-map
  - infographic
  - slide-deck
platform: "youtube"
created: "2026-02-10"
---

# Claude Code 从0到1全攻略

### 播放源

<iframe class="nlm-video" src="https://www.youtube.com/embed/AT4b9kLtQCQ" title="Claude Code 从0到1全攻略" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>

<sub>[在 YouTube 打开](https://www.youtube.com/watch?v=AT4b9kLtQCQ)</sub>

## 产物

### 思维导图

```mermaid
mindmap
  root((Claude Code 實戰攻略))
    環境搭建與基礎交互
      安裝
        官方腳本安裝
        創建目錄與執行命令
      登錄與授權
        訂閱制 （Pro/Max）
        API Key 模式
        國產模型驅動 （環境變量設置）
      操作模式
        默認模式 （Default）: 詢問所有操作
        自動模式 （Accept Edit）: 自動修改文件
        規劃模式 （Plan）: 只討論不執行
    複雜任務與終端控制
      模式切換
        Shift + Tab 循環切換
      高級輸入
        Shift + Enter 換行
        Ctrl + G 調用 VS Code 編輯器
      終端命令
        ! 前綴執行任意命令
        --dangerously-skip-permissions 跳過權限檢測
      後台任務
        Ctrl + B 放置後台
        /tasks 查看/結束任務
    多模態與上下文管理
      圖片處理
        拖拽/粘貼圖片 （Ctrl + V）
        UI 還原/視覺識別
      上下文命令
        /compact 壓縮上下文 （節省 Token）
        /clear 清空上下文
        ESC 兩次進入 Rewind 回滾代碼
      CLAUDE.md （Memory）
        /init 創建模記文件
        項目級 vs 用戶級
        持久化項目指令與注意事項
    高級功能擴展與定制
      MCP （Model Context Protocol）
        連接外部工具 （如 Figma）
        /mcp 命令管理
      Hook 鉤子
        /hook 設置時機 （如 Post-edit）
        實戰: 自動代碼格式化
      Agent Skill
        動態加載 Prompt
        實戰: 日報生成模板
      SubAgent
        獨立上下文窗口
        處理複雜子任務 （如代碼審核）
      Plugins
        /plugins 插件市場
        一鍵安裝 Skill/MCP/Hook 組合包
```

### 信息图

<a href="_assets/Claude Code 从0到1全攻略/infographic.webp" target="_blank" rel="noopener">
  <img src="_assets/Claude Code 从0到1全攻略/infographic.webp" alt="信息图" class="nlm-infographic" loading="lazy">
</a>

<sub>点图看原图</sub>

### 演示文稿

<iframe src="https://pdf.hfhfn.dpdns.org/notebooklm/Claude%20Code%20%E4%BB%8E0%E5%88%B01%E5%85%A8%E6%94%BB%E7%95%A5/slide-deck.pdf#view=FitH" class="nlm-slides" title="演示文稿" loading="lazy"></iframe>

<sub>[全屏打开](https://pdf.hfhfn.dpdns.org/notebooklm/Claude%20Code%20%E4%BB%8E0%E5%88%B01%E5%85%A8%E6%94%BB%E7%95%A5/slide-deck.pdf)</sub>


## 摘要

所提供的文本提供了关于 Claude Code 的全面教程，Claude Code 
是一款旨在简化软件开发任务的高级编程 
Agent。它详细介绍了初始设置流程、基本交互，以及利用包括默认、自动和规划状态在内
的多种运行模式进行的界面导航。该指南还探讨了高级功能，例如通过 MCP 集成 
Figma、上下文压缩、自定义系统内存指令，以及用于自动代码格式化的 
hooks。此外，它还讲解了如何使用 Agent Skills、Subagents 和 Plugins 
扩展功能，以极高的效率构建复杂且可直接用于生产环境的应用程序。
