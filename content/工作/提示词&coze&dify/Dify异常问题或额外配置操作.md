---
created: '2026-08-05T09:56:36+08:00'
modified: '2026-08-05T09:56:36+08:00'
---

## Dify异常问题或额外配置操作

### 一. 某些版本dify接入ragflow知识库, 访问报错 (比如1.13.1版本)

#### 1. 原因: 

- RAGFlow 返回的 metadata 里叫 doc_id，但 Dify 强制要 document_id，没传就报 None 错误。
- <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529101553231.png" alt="image-20260529101553231" style="zoom:67%;" />

#### 2. 解决办法

- 搭建http工作流, 接入ragflow服务

  - ![image-20260529101816648](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529101816648.png)

- 设置http节点

  - 1. 配置请求类型(POST), 请求URL, 请求头, 以及请求体
  - <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529101848960.png" alt="image-20260529101848960" style="zoom:67%;" />

  - 2. 配置请求头中的鉴权参数: Authorization

  - <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529101906767.png" alt="image-20260529101906767" style="zoom: 50%;" />
  - <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529101921186.png" alt="image-20260529101921186" style="zoom: 67%;" />

- 设置代码执行节点, 提取http请求获取的回复结果

  - <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529101948272.png" alt="image-20260529101948272" style="zoom: 50%;" />

  - 代码节点内容:

    -
 ```python
      import json
      
      def main(body: str):
          body_dict = json.loads(body)
          chunks: list = body_dict['data']['chunks']
          result = [chunk['content'] for chunk in chunks]
          # 返回格式化结果
          return {
              "result": result
          }
      ```



---



### 二. Dify 局域网访问配置教程（VMware + Windows）

---



#### 1、虚拟机基础配置
1. 虚拟机网络模式设置为 **NAT 模式**
2. 为虚拟机配置 **静态 IP** (192.168.88.100)
3. 查看网关命令：
```bash
ip route show
```

---

#### 2、VMware 端口转发设置
1. 打开 VMware 菜单栏 → **编辑** → **虚拟网络编辑器**

   ![image-20260529105135947](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529105135947.png)

2. 选中 **VMnet8（NAT 模式）** → 点击 **更改设置** 获取管理员权限，然后点击 **NAT 设置 (NAT Settings)**。

   <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529110539455.png" alt="image-20260529110539455" style="zoom: 80%;" />

3. 在弹出的窗口中，点击 **添加 (Add)**。

   <img src="https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529111926490.png" alt="image-20260529111926490" style="zoom:80%;" />

4. 配置端口映射：
   - 主机端口：局域网访问端口（如 8080、5566）
   - 虚拟机 IP 地址：第一步设置的静态 IP
   - 虚拟机端口：Dify 服务端口（默认 80）
   - 类型：**TCP**

5. 依次确定保存所有设置

   ![image-20260529112037989](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112037989.png)

---

#### 3、Windows 防火墙开放端口 (最简单就是关闭所有防火墙)
1. 打开 **控制面板** → **系统和安全** → **Windows Defender 防火墙**

   ![image-20260529112224931](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112224931.png)

2. 点击 **高级设置** → **入站规则** → **新建规则**

   ![image-20260529112347172](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112347172.png)

3. 规则类型：选择 **端口** → 下一步

   ![image-20260529112407755](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112407755.png)

4. 协议和端口：
   - 协议：**TCP**
   - 特定本地端口：填写前面设置的**主机端口**

   ![image-20260529112433901](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112433901.png)

5. 操作：选择 **允许连接** → 下一步

   ![image-20260529112734528](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112734528.png)

6. 配置文件：全选（域、专用、公用）→ 下一步

   ![image-20260529112552920](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112552920.png)

7. 名称：自定义（如 Dify Port Forwarding）→ 完成

   ![image-20260529112634366](https://cdn.jsdelivr.net/gh/hfhfn/image_storage@img/img/image-20260529112634366.png)

---

#### 4、局域网访问方式
- 访问地址：**本机IP + 主机端口**
- 查看本机 IP 命令（CMD 中执行）：
```cmd
ipconfig
```



---



### 三. 非本地IP访问数据库没有权限的问题

```mysql
-- 查看当前 root 权限
SELECT user,host FROM mysql.user WHERE user='root';

-- 方式1. 创建新用户，并更新密码和授予权限
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY 'your_password';
-- 重置并授予权限
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'root'@'%';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;

-- 方式2. 直接修改用户权限: 允许 root 从任意 IP 连接
UPDATE mysql.user SET host = '%' WHERE user = 'root' AND host = 'localhost';
-- UPDATE mysql.user SET host = '%' WHERE user = 'root';

-- 刷新权限
FLUSH PRIVILEGES;

-- 核心是把 root 用户的 允许访问的host 从localhost 改成 % 然后刷新就行。
```

---

## 相关笔记
- [[工作/提示词&coze&dify/RAGFlow-v0.25.6-部署笔记|RAGFlow-v0.25.6-部署笔记]] — RAGFlow 部署要点
- [[AI大模型/rag/RAG检索策略全面解析|RAG检索策略全面解析]] — RAG 检索策略


---
