---
created: '2026-08-05T09:57:17+08:00'
modified: '2026-08-05T09:57:17+08:00'
---

- 新创建的conda环境在C:\Users\xxx\.conda\envs，而不在自定义的conda安装目录下的envs中

### 出现这个问题一般2个原因：
#### 第一个原因：conda安装环境envs的配置项（envs_dirs）中没有指定自定义conda的envs安装位置或者指定的配置优先级比较低
> 第一种解决方案 ==> 直接修改 envs_dirs 配置：

查看envs_dirs的配置：`conda config --show envs_dirs`

示例显示如下：
![[images/pasted_images/Pasted image 20260118212554.webp]]


使用命令：`conda config --add envs_dirs D:\software\miniconda3\envs` 把自己自定义的安装位置添加到第一个（最高优先级）

可以再使用 `conda config --show envs_dirs` 命令查看是否修改成功

> 第二种解决方案 ==> 在 C:\Users\用户名下创建一个 .condarc（有则不用创建） 文件写入以下配置来覆盖默认的 envs_dirs 配置：
```shell
envs_dirs:
  - D:\\software\\miniconda3\\envs
```

#### 第二个原因： 自定义conda安装环境中的envs文件夹没有执行权限
解决方案：对envs文件夹的属性添加完全控制权限
![[images/pasted_images/Pasted image 20260118213311.webp]]


修改完成后，执行：`conda create -n 环境名称 python=3.12` 结果如下：
显示已经成功创建环境到自定义envs文件夹中
![[images/pasted_images/Pasted image 20260118213414.webp]]

---

## 相关笔记
- [[应用&工具笔记/Windows配置PowerShell的初始化启动文件（初始化oh-my-posh和conda）|Windows配置PowerShell的初始化启动文件（初始化oh-my-posh和conda）]] — PowerShell 中激活 conda 环境