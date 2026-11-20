---
created: '2026-08-05T09:57:18+08:00'
modified: '2026-08-05T09:57:18+08:00'
---

1. 直接在微软商店搜索 PowerShell 安装

2. 直接在微软商店搜索 oh my posh 安装

3. 下载作者推荐MesloLGM NF字体，点此下载
	- 下载完成后解压，全选右键点击安装即可自动安装

---

## 相关笔记
- [[应用&工具笔记/Windows配置PowerShell的初始化启动文件（初始化oh-my-posh和conda）|Windows配置PowerShell的初始化启动文件（初始化oh-my-posh和conda）]] — 初始化启动文件配置
	- 更简单的方式：
		- 使用命令oh-my-posh font install, 选择要安装的字体 Meslo LGM NF
		
![[images/pasted_images/Pasted image 20260118214822.webp]]

4. 打开powershell，按快捷键ctrl+,打开设置，选择左边的默认值选项 ->然后选择外观 ->选择字体为刚刚下载的 -> MesloLGS NF

5. 配置oh my posh的 profile

  - 在powershell中 运行：```shell
notepad $PROFILE
```

- 这个命令会在 `C:\Users\<your_name>\Documents\PowerShell\` 文件夹下面创建`Microsoft.PowerShell_profile.ps1` 文件。

- 我们原来是没有这个文件的，运行上述命令后，会弹出创建文件提醒，选择是。之后系统会自动使用记事本打开这个文件。

- 如果没有弹出提醒，显示找不到该文件，则输入如下命令手动创建：
```shell
if (!(Test-Path -Path $PROFILE )) { New-Item -Type File -Path $PROFILE -Force }
```

 - 在生成的文件中写入以下配置并保存
```shell
oh-my-posh init pwsh | Invoke-Expression
```

- 再使用以下命令使配置生效
```shell
.$PROFILE
```

6. 查看主题并选择自己想要的主题，这里选择 iterm2

        输入命令 **Get-PoshThemes** 可查看主题

        还是 使用命令 **notepad $PROFILE** 打开配置文件，更改内容为：
        ```shell
oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH\iterm2.omp.json" | Invoke-Expression
```

- 保存后再使用 **.$PROFILE** 命令使生效

- 最终效果：
![[images/pasted_images/Pasted image 20260118215638.webp]]

> 注：conda环境在 ~目录下（即家目录）时，不显示环境名称，其他目录正常

![[images/pasted_images/Pasted image 20260118215701.webp]]

> 其他 trick：

1. 更改powershell显示界面的大小：打开powershell，点开箭头下拉菜单打开设置，选择左边的启动选项 ->然后启动大小 ->更改行列数保存即可

2. 更改powershell启动后的初始目录：

- notepad $PROFILE 打开配置文件写入以下配置保存：```shell
set-location ~/Desktop
```

- 并用 **.$PROFILE 命令使其生效**