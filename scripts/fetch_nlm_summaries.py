#!/usr/bin/env python3
"""获取 NotebookLM 已有的摘要（不重新生成）

优化后的流程（解决「太慢」）：
  1. `notebooklm summary` 读现成摘要
  2. 判断语言：
     - 已是简体中文 → 直接用，不调任何 API（最快）
     - 繁体中文     → 本地 zhconv 转简体，不调 API
     - 英文/其他     → 才用 ask 翻译（最慢，但必要）
  3. 结果存 scripts/candidates/nlm_summaries.json

之前每个都调 ask 翻译，47 个约 20 分钟。
现在大部分能跳过翻译，预计 5 分钟内。

用法:
    python scripts/fetch_nlm_summaries.py             # 全部（跳过已有）
    python scripts/fetch_nlm_summaries.py --force     # 全部重取
    python scripts/fetch_nlm_summaries.py --limit 3
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_notebooklm as m  # noqa: E402

try:
    import zhconv
except ImportError:
    zhconv = None

OUT = m.CAND_DIR / "nlm_summaries.json"

CJK = re.compile(r"[\u4e00-\u9fff]")

# 繁体特征字：出现任意一个就当作繁体（简体正文不会用这些）
TRAD_HINTS = set("個這個說話時間發現問題點數據實應學國會發動機關於爲與從對開關閉資訊網絡")


def classify(text):
    """判断语言：zh-s / zh-t / en"""
    if not text:
        return "en"
    cjk = len(CJK.findall(text))
    total = len(re.sub(r"\s", "", text))
    if total == 0:
        return "en"
    ratio = cjk / total

    # 中文占比低 → 英文
    if ratio < 0.3:
        return "en"

    # 有繁体特征字 → 繁体
    if any(ch in TRAD_HINTS for ch in text):
        return "zh-t"

    return "zh-s"


def clean(text):
    """去掉 CLI 的包装前缀和尾注。"""
    t = text

    i = t.find("Summary:")
    if i >= 0:
        t = t[i + len("Summary:") :]

    t = re.sub(r"^\s*Continuing conversation[^\n]*\n", "", t)
    j = t.find("Answer:")
    if j >= 0:
        t = t[j + len("Answer:") :]

    for tail in ("Resumed conversation:", "Suggested topics:", "Conversation:"):
        k = t.find(tail)
        if k > 0:
            t = t[:k]

    t = re.sub(r"\[\d+(?:\s*,\s*\d+)*\]", "", t)
    t = t.replace("**", "").replace("__", "")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def translate_to_zh(text):
    """让 NotebookLM 把摘要翻成简体中文（只在英文时需要）。"""
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

    bad = any(
        kw in t
        for kw in (
            "Authentication error",
            "AUTH_ERROR",
            "Unexpected error",
            "Continue? [y/N]",
            "Traceback",
            "Error:",
        )
    )
    return "" if bad else t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
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

    stats = {"zh-s": 0, "zh-t": 0, "en": 0, "fail": 0}

    for i, nb in enumerate(todo, 1):
        nid = nb["id"]
        title = nb["title"]

        m.use_notebook(nid)
        raw = m.run_nlm(["summary"], timeout=150)
        s = clean(raw)

        # 必须挡住所有非摘要内容：认证失败、CLI 报错、交互确认
        bad = any(
            kw in s
            for kw in (
                "Authentication error",
                "Authentication expired",
                "AUTH_ERROR",
                "Unexpected error",
                "Continue? [y/N]",
                "Traceback",
                "Error:",
                "re-authenticate",
            )
        ) or "no summary" in s.lower()

        if bad or len(s) < 40:
            print(f"[{i}/{len(todo)}] {title[:34]:36} 无摘要，跳过")
            stats["fail"] += 1
            continue

        lang = classify(s)

        if lang == "zh-s":
            # 已是简体，直接用 —— 不调 API
            print(f"[{i}/{len(todo)}] {title[:34]:36} ✓ 简体原文 {len(s)} 字")
            stats["zh-s"] += 1

        elif lang == "zh-t" and zhconv:
            # 繁体，本地转简体 —— 不调 API
            s = zhconv.convert(s, "zh-cn")
            print(f"[{i}/{len(todo)}] {title[:34]:36} ✓ 繁体→简体 {len(s)} 字")
            stats["zh-t"] += 1

        else:
            # 英文，必须翻译
            zh = translate_to_zh(s)
            if zh and len(zh) >= 20:
                print(f"[{i}/{len(todo)}] {title[:34]:36} ✓ 英文→中文 {len(zh)} 字")
                s = zh
                stats["en"] += 1
            else:
                print(f"[{i}/{len(todo)}] {title[:34]:36} ⚠ 翻译失败，保留原文")
                stats["fail"] += 1

        existing[nid] = s
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = sum(1 for v in existing.values() if v)
    print(
        f"\n完成：{ok} 个摘要 "
        f"（简体 {stats['zh-s']} / 繁体转 {stats['zh-t']} / 英文译 {stats['en']} / 失败 {stats['fail']}）"
    )
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
