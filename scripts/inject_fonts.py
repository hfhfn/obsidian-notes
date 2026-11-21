#!/usr/bin/env python3
"""Inject the self-hosted font stylesheet into every built HTML page.

Why: `fontOrigin: selfHosted` re-downloads fonts from Google on every build
and fails when that request is flaky in CI. The fonts are committed under
`quartz/static/fonts/`, so the only thing left to do is link the stylesheet.

Usage:
    python scripts/inject_fonts.py [--dir dist-all]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

MARKER = "quartz-fonts.css"
LINK = '<link rel="stylesheet" href="/static/fonts/quartz-fonts.css"/>'


def inject(html: str) -> str | None:
    if MARKER in html:
        return None
    idx = html.lower().rfind("</head>")
    if idx == -1:
        return None
    return html[:idx] + LINK + html[idx:]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="dist-all")
    args = ap.parse_args()

    root = Path(args.dir)
    if not root.is_dir():
        print(f"[fonts] output dir not found: {root}", file=sys.stderr)
        return 1

    changed = 0
    scanned = 0
    for path in root.rglob("*.html"):
        scanned += 1
        text = path.read_text(encoding="utf-8", errors="surrogateescape")
        updated = inject(text)
        if updated is not None:
            path.write_text(updated, encoding="utf-8", errors="surrogateescape")
            changed += 1

    print(f"[fonts] linked stylesheet in {changed}/{scanned} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
