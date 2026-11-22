#!/usr/bin/env python3
"""从 NotebookLM 抓每个笔记本的视频来源 URL

NotebookLM 的 source list 会返回 source 的 type 和 url：
  {"type": "youtube", "url": "https://www.youtube.com/watch?v=xxx"}
这就是「视频源」，可以拿去生成页面顶部的播放器。

产出 scripts/candidates/nlm_sources.json：
  { "<notebook_id>": { "title": "...", "sources": [{type,url,title}] } }

用法: python scripts/fetch_nlm_sources.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_notebooklm as m  # noqa: E402

OUT = m.CAND_DIR / "nlm_sources.json"


def main():
    nbs = m.list_notebooks()
    if not nbs:
        print("拿不到笔记本列表，先确认登录状态")
        return

    print(f"共 {len(nbs)} 个笔记本，逐个抓来源…\n")
    result = {}

    for i, nb in enumerate(nbs, 1):
        nid = nb["id"]
        title = nb["title"]

        m.use_notebook(nid)
        out = m.run_nlm(["source", "list", "--json"], timeout=120)

        # 输出可能混有日志，取最后一个完整 JSON
        data = None
        start = out.find("{")
        if start >= 0:
            try:
                data = json.loads(out[start:])
            except Exception:
                # 尝试逐步截断
                for end in range(len(out), start, -1):
                    try:
                        data = json.loads(out[start:end])
                        break
                    except Exception:
                        continue

        if not data or "sources" not in data:
            print(f"[{i}/{len(nbs)}] {title[:36]:38} 无来源")
            continue

        srcs = []
        for s in data["sources"]:
            url = (s.get("url") or "").strip()
            stype = (s.get("type") or "").strip()
            if not url:
                continue
            srcs.append(
                {
                    "type": stype,
                    "url": url,
                    "title": (s.get("title") or "").strip(),
                }
            )

        result[nid] = {"title": title, "sources": srcs}
        types = ", ".join(sorted({x["type"] for x in srcs})) or "-"
        print(f"[{i}/{len(nbs)}] {title[:36]:38} {len(srcs)} 个来源（{types}）")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    total_src = sum(len(v["sources"]) for v in result.values())
    with_url = sum(1 for v in result.values() if v["sources"])
    print(f"\n完成：{with_url}/{len(nbs)} 个笔记本有来源，共 {total_src} 条")
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
