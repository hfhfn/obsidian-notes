from __future__ import annotations

import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "qa"
OUT.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:8080/"

PAGES = [
    ("home", ""),
    ("moc", "ai大模型/ai大模型-moc.html"),
    ("note-images", "ai大模型/agent/12种agent-harness设计模式.html"),
    ("note-callout", "ai大模型/agent/hitl人工介入与决策发布.html"),
    ("html-embed", "ai/模型评估/3分类评估指标对比.html"),
    ("canvas", "ai/ai文件夹内容思维导图.canvas.html"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors: list[str] = []
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))

    for name, path in PAGES:
        url = BASE + urllib.parse.quote(path)
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)
        height = page.evaluate("document.documentElement.scrollHeight")
        width = page.evaluate("document.documentElement.scrollWidth")
        print(f"{name}: {page.title()!r} viewport={width}x{height}")

    # Search interaction on the homepage.
    page.goto(BASE, wait_until="networkidle")
    search = page.locator("input[type='search'], input[placeholder*='搜索'], .search-button, button[aria-label*='Search']").first
    print("search element:", search.count() if hasattr(search, "count") else "?")
    page.screenshot(path=str(OUT / "home-dark.png"), full_page=False)

    print("console errors:")
    for e in errors[:20]:
        print("  ", e)
    browser.close()
