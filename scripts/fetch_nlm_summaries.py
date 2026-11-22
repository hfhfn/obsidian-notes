#!/usr/bin/env python3
"""获取 NotebookLM 已有的摘要（不重新生成）

NotebookLM 每个笔记本本来就有 AI 生成的摘要（`notebooklm summary`）。
之前用 `ask` 重新生成是错的：既慢（47 个约 15 分钟），又会触发对话删除的
交互确认导致失败，而且和 NotebookLM 里看到的不是同一份。

这里的做法：
  1. `notebooklm summary` 读现成摘要
  2. 如果是英文（NotebookLM 常见输出），再让 AI 翻成简体中文
  3. 结果存 scripts/candidates/nlm_summaries.json

用法:
    python scripts/fetch_nlm_summaries.py             # 全部（跳过已有）
    python scripts/fetch_nlm_summaries.py --force     # 全部重取
    python scripts/fetch_nlm_summaries.py --limit 3
    python scripts/fetch_nlm_summaries.py --no-translate   # 保留原文
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_notebooklm as m  # noqa: E402

OUT = m.CAND_DIR / "nlm_summaries.json"

# 判断是否已经是中文：中文字符占比 > 20% 就认为是中文
CJK = re.compile(r"[\u4e00-\u9fff]")


def is_chinese(text):
    if not text:
        return False
    cjk = len(CJK.findall(text))
    # 只数非空白字符
    total = len(re.sub(r"\s", "", text))
    return total > 0 and cjk / total > 0.2


def clean(text):
    """去掉 CLI 的包装前缀和尾注。"""
    t = text

    # "Summary:" 前缀
    i = t.find("Summary:")
    if i >= 0:
        t = t[i + len("Summary:") :]

    # ask 的输出会带 "Continuing conversation xxx..." 和 "Answer:" 前缀
    t = re.sub(r"^\s*Continuing conversation[^\n]*\n", "", t)
    j = t.find("Answer:")
    if j >= 0:
        t = t[j + len("Answer:") :]

    # 尾注
    for tail in ("Resumed conversation:", "Suggested topics:", "Conversation:"):
        j = t.find(tail)
        if j > 0:
            t = t[:j]

    # 去掉 [1] [2, 3] 引用
    t = re.sub(r"\[\d+(?:\s*,\s*\d+)*\]", "", t)

    # 去掉 markdown 粗体/斜体标记（摘要正文不需要）
    t = t.replace("**", "").replace("__", "")

    # 折叠空白（保留段落分隔）
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def translate_to_zh(text):
    """让 NotebookLM 把摘要翻成简体中文。

    用同一个笔记本的 ask，因为它已经有全文上下文，
    比外部翻译服务更准确（专有名词不会被乱翻）。
    """
    prompt = (
        "请把下面这段摘要翻译成简体中文，要求："
        "1) 只输出译文，不要任何解释或前缀；"
        "2) 保留专有名词原文（如 Milvus、RAG、Transformer、HNSW 等不要翻译）；"
        "3) 保留原有的段落结构；"
        "4) 不要保留 [1][2] 这类引用编号。\n\n"
        f"{text}"
    )
    out = m.run_nlm(["ask", prompt], timeout=180)
    t = clean(out)

    bad = (
        "Unexpected error" in t
        or "Continue? [y/N]" in t
        or "Traceback" in t
        or "Error:" in t
    )
    return "" if bad else t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--no-translate", action="store_true")
    args = ap.parse_args()

    nbs = m.list_notebooks()
    if not nbs:
        print("拿不到笔记本列表，先确认登录状态")
        return

    existing = {}
    if OUT.exists() and not args.force:
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    todo = [n for n in nbs if args.force or not existing.get(n["id"])]
    if args.limit:
        todo = todo[: args.limit]

    print(f"共 {len(nbs)} 个笔记本，待获取 {len(todo)} 个\n")
    if not todo:
        print("全部已有摘要，用 --force 重新获取")
        return

    for i, nb in enumerate(todo, 1):
        nid = nb["id"]
        title = nb["title"]
        print(f"[{i}/{len(todo)}] {title[:40]}")

        m.use_notebook(nid)
        raw = m.run_nlm(["summary"], timeout=150)
        s = clean(raw)

        bad = (
            "Unexpected error" in s
            or "Continue? [y/N]" in s
            or "Traceback" in s
            or "no summary" in s.lower()
        )
        if bad or len(s) < 40:
            print(f"    无摘要或出错，跳过")
            continue

        was_en = not is_chinese(s)
        if was_en and not args.no_translate:
            zh = translate_to_zh(s)
            if zh and len(zh) >= 20:
                s = zh
                print(f"    ✓ 原文 {len(raw)} 字 → 中文 {len(s)} 字")
            else:
                print(f"    ⚠ 翻译失败，保留原文 {len(s)} 字")
        else:
            print(f"    ✓ {len(s)} 字（已是中文）")

        existing[nid] = s
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = sum(1 for v in existing.values() if v)
    print(f"\n完成：{ok} 个摘要 → {OUT}")


if __name__ == "__main__":
    main()
