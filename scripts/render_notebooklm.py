#!/usr/bin/env python3
"""把视频与专题笔记里的纯 markdown 产物链接，换成站点的交互组件。

为什么要分两步：
  - 源笔记（vault）里必须是纯 markdown，Obsidian 才能正常阅读。
    之前直接写 <div class="mm-wrap"> + <iframe>，Obsidian 显示成一堆
    原始 HTML 和空框，根本没法看。
  - 站点需要交互（markmap 可拖动折叠、PDF 内嵌阅读、图片灯箱），
    这些是构建时才该做的事。

所以：vault 里是 `[思维导图（可交互）](_assets/x/mind-map.json)`，
这里读 json 渲染成 markmap 组件替换掉。

用法: python scripts/render_notebooklm.py <content-dir>
"""
import json
import re
import sys
from pathlib import Path

MODULE = "视频与专题"


def quartz_slug(name: str) -> str:
    """复刻 Quartz 的 slug 规则：小写、空格/下划线转 -、去掉标点保留中文。"""
    import unicodedata

    s = name.lower().strip()
    s = re.sub(r"[\\s_]+", "-", s)
    # 保留中文、字母、数字、连字符
    s = "".join(
        ch for ch in s
        if ch == "-" or ch.isalnum() or "\u4e00" <= ch <= "\u9fff"
    )
    return s


def render_mindmap(tree, title, slug=""):
    """把 {name, children} 树渲染成 markmap 容器。"""
    payload = json.dumps(tree, ensure_ascii=False).replace("</script", "<\\/script")
    safe = str(title).replace('"', "&quot;")
    return (
        f'<div class="mm-wrap" data-mm="1" data-mm-title="{safe}" data-mm-slug="{slug}">'
        '<div class="mm-toolbar">'
        '<button data-mm-act="fit">适应窗口</button>'
        '<button data-mm-act="expand">全部展开</button>'
        '<button data-mm-act="collapse">折叠到底</button>'
        '<span class="mm-sep"></span>'
        '<label>字号 <input class="mm-font" type="range" min="11" max="24" value="15"></label>'
        '<label>间距 <input class="mm-space" type="range" min="4" max="40" value="12"></label>'
        '<span class="mm-sep"></span>'
        '<button data-mm-act="html" title="导出可交互 HTML">导出 HTML</button>'
        '<button data-mm-act="svg" title="导出静态 SVG">导出 SVG</button>'
        '<button data-mm-act="full">全屏</button>'
        "</div>"
        '<svg class="mm-canvas"></svg>'
        '<div class="mm-hint">拖动平移 · 滚轮缩放 · 点击节点折叠</div>'
        f'<script type="application/json" class="mm-data">{payload}</script>'
        "</div>"
    )


def to_zh(text):
    try:
        import zhconv

        return zhconv.convert(text, "zh-cn")
    except ImportError:
        return text


def walk_zh(node):
    out = {"name": to_zh(str(node.get("name", "")))}
    kids = node.get("children") or []
    if kids:
        out["children"] = [walk_zh(c) for c in kids]
    return out


def md_list_to_tree(body: str, fallback_title: str) -> dict | None:
    """markdown 列表（# 根 + - 嵌套）→ {name, children} 树。"""
    root_name = fallback_title
    # 栈里存 (缩进层级, 节点)
    stack: list[tuple[int, dict]] = []
    root: dict | None = None

    for raw_line in body.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue

        if line.startswith("#"):
            name = line.lstrip("#").strip()
            if name:
                root_name = name
            continue

        m = re.match(r"^(\s*)-\s+(.*)$", line)
        if not m:
            continue
        depth = len(m.group(1)) // 2
        name = m.group(2).strip()
        if not name:
            continue

        node = {"name": name}
        if root is None:
            root = {"name": root_name, "children": []}
            stack = [(0, root)]

        while stack and stack[-1][0] > depth:
            stack.pop()
        parent = stack[-1][1] if stack else root
        parent.setdefault("children", []).append(node)
        stack.append((depth + 1, node))

    if root is None:
        return None
    if not root.get("children"):
        root.pop("children", None)
    return root


def note_title(md: Path, text: str) -> str:
    """取笔记标题：优先 frontmatter title，其次一级标题，最后文件名。"""
    m = re.search(r"^---\s*\ntitle:\s*(.+?)\s*\n", text, re.M)
    if m:
        return m.group(1).strip().strip('"\'')
    m = re.search(r"^#\s+(.+)$", text, re.M)
    if m:
        return m.group(1).strip()
    return md.stem


def process_md(md: Path, content_dir: Path):
    text = md.read_text(encoding="utf-8")
    orig = text
    # 导出的文件名用笔记标题，不是「思维导图」这种段落名
    title = note_title(md, text)

    # 1) 思维导图：```markmap 代码块 → mm-wrap 组件
    #    源笔记里是 markdown 列表（Obsidian 用 Mindmap NextGen 渲染），
    #    站点需要 markmap 的拖动/缩放/折叠，所以这里转成组件。
    def mm_sub(m):
        body = m.group(1)
        # markdown 列表 → {name, children} 树
        tree = md_list_to_tree(body, title)
        if not tree:
            return m.group(0)
        return render_mindmap(tree, title, quartz_slug(md.stem))

    text = re.sub(r"```markmap\s*\n([\s\S]*?)```", mm_sub, text)

    # 2) 演示文稿： [打开 xxx（PDF）](https://pdf.../slide-deck.pdf)
    def slide_sub(m):
        label = m.group(1)
        url = m.group(2)
        return (
            f'<iframe src="{url}#view=FitH" class="nlm-slides" '
            f'title="{label}" loading="lazy"></iframe>\n\n'
            f"<sub>[全屏打开]({url})</sub>"
        )

    text = re.sub(
        r"\[打开 ([^\]]*?)（PDF）\]\((https://[^)]+?\.pdf)\)",
        slide_sub,
        text,
    )

    # 3) 信息图： ![信息图](_assets/x/infographic.webp) → 灯箱版
    def info_sub(m):
        label = m.group(1)
        rel = m.group(2)
        return (
            f'<img src="../{rel}" alt="{label}" class="nlm-infographic nlm-zoomable" loading="lazy">\n\n'
            "<sub>点图放大 · ESC 或点空白处关闭</sub>"
        )

    text = re.sub(
        r"!\[([^\]]*?)\]\((_assets/[^)]+?infographic\.\w+)\)",
        info_sub,
        text,
    )

    if text != orig:
        md.write_text(text, encoding="utf-8", newline="\n")
        return True
    return False


def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/render_notebooklm.py <content-dir>")
        sys.exit(1)

    content_dir = Path(sys.argv[1]).resolve()
    target = content_dir / MODULE
    if not target.is_dir():
        print(f"目录不存在: {target}")
        return

    n = 0
    for md in target.rglob("*.md"):
        if process_md(md, content_dir):
            n += 1
    print(f"[render-notebooklm] 渲染 {n} 篇笔记的产物")


if __name__ == "__main__":
    main()
