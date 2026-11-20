---
created: '2026-02-13T09:58:05+08:00'
modified: '2026-02-13T09:58:05+08:00'
---

1. 编辑: 在Elements页面删除或修改
2. 保存: 
	- 在Console页面输入 `allow pasting`(允许粘贴代码) 回车;
	- 然后粘贴输入以下js代码对当前修改的html文件进行下载.```JavaScript
(function(){
  const blob = new Blob([document.documentElement.outerHTML], {type: 'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'modified_page.html';
  a.click();
})();
```