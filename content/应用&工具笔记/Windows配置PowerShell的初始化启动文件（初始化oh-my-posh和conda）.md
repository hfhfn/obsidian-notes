---
created: '2026-08-05T09:57:26+08:00'
modified: '2026-08-05T09:57:26+08:00'
---

### 解决2个问题：

##### 1. 安装oh-my-posh后，在PowerShell中激活oh-my-posh
##### 2. 安装miniconda3后, 在PowerShell中conda activate命令无法激活环境

#### 初始化oh-my-posh配置```shell
oh-my-posh init pwsh --config $env:POSH_THEMES_PATH\iterm2.omp.json | Invoke-Expression
​
# 如果直接写oh-my-posh无法激活的话，可以配置绝对路径，以下是配置oh-my-posh的默认安装地址
C:\\Users\\【USER】\\AppData\\Local\\Programs\\oh-my-posh\\bin\\oh-my-posh.exe init pwsh --config $env:POSH_THEMES_PATH\iterm2.omp.json | Invoke-Expression
```

#### 初始化conda配置
- 以下配置文件，可以在安装好conda后，使用 `conda init powershell` 命令
- 输出结果中就能看到默认配置文件：`C:\Users\【USER】\Documents\PowerShell\profile.ps1`
- **复制路径粘贴到资源管理器地址栏直接打开文件，其中就会有如下配置**
```shell
#region conda initialize
# !! Contents within this block are managed by 'conda init' !!
If (Test-Path "D:\software\miniconda3\Scripts\conda.exe") {
    (& "D:\software\miniconda3\Scripts\conda.exe" "shell.powershell" "hook") | Out-String | ?{$_} | Invoke-Expression
}
#endregion
```

#### 把配置写入PowerShell的profile.psl文件
- 查看PowerShell的profile.psl文件使用命令：`$profile`

- 系统默认安装conda的初始化文件是 `C:\Users\【USER】\Documents\PowerShell\profile.ps1`（管理员权限可以使用这个配置）

- 但如果我们是从Microsoft Store（微软商店）安装的powershell，默认的初始化文件为：`C:\Users\【USER】\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`

- 所有最终我们需要在 `C:\Users\【USER】\Documents\PowerShell\Microsoft.PowerShell_profile.ps1` 配置文件中写入如下配置：
	- 也就是把上面“初始化oh-my-posh配置”和“初始化conda配置”都写进去，保存，重新打开powershell即可生效
```shell
# 初始化oh-my-posh
oh-my-posh init pwsh --config $env:POSH_THEMES_PATH\iterm2.omp.json | Invoke-Expression
​
# 初始化conda
#region conda initialize
# !! Contents within this block are managed by 'conda init' !!
If (Test-Path "D:\software\miniconda3\Scripts\conda.exe") {
    (& "D:\software\miniconda3\Scripts\conda.exe" "shell.powershell" "hook") | Out-String | ?{$_} | Invoke-Expression
}
#endregion
```

---

## 相关笔记
- [[应用&工具笔记/powershell美化，oh-my-posh安装和配置|powershell美化，oh-my-posh安装和配置]] — oh-my-posh 安装美化
- [[应用&工具笔记/解决新创建的conda环境不在自定义的conda安装目录下的envs中|解决新创建的conda环境不在自定义的conda安装目录下的envs中]] — conda 环境路径配置