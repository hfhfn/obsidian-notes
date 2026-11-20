#!/usr/bin/env python3
"""Inject the Cloudflare Web Analytics beacon into every built HTML page.

Cloudflare's own "enable Web Analytics" toggle does this at the edge for
Pages projects, but that only covers the *.pages.dev deployment and cannot be
version-controlled. This script keeps the snippet in the repo instead, so the
behaviour is identical locally, in CI, and behind a custom domain.

The token comes from CF_ANALYTICS_TOKEN. When it is absent the script is a
no-op, so builds never ship a broken beacon.

Usage:
    python scripts/inject_analytics.py [--dir public]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BEACON = "https://static.cloudflareinsights.com/beacon.min.js"
MARKER = "data-cf-beacon"

SNIPPET = (
    '<!-- Cloudflare Web Analytics -->'
    f'<script defer src="{BEACON}" '
    "data-cf-beacon='{{\"token\": \"{token}\"}}'></script>"
    "<!-- End Cloudflare Web Analytics -->"
)


def inject(html: str, token: str) -> str | None:
    """Return the page with the snippet before </body>, or None if unchanged."""
    if MARKER in html:
        return None  # already present
    idx = html.lower().rfind("</body>")
    if idx == -1:
        return None
    return html[:idx] + SNIPPET.format(token=token) + "\n" + html[idx:]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="public")
    args = ap.parse_args()

    token = os.environ.get("CF_ANALYTICS_TOKEN", "").strip()
    if not token:
        print("[analytics] CF_ANALYTICS_TOKEN not set — skipping beacon injection")
        return 0
    if len(token) < 16:
        print(f"[analytics] token looks invalid (len={len(token)}) — skipping", file=sys.stderr)
        return 1

    root = Path(args.dir)
    if not root.is_dir():
        print(f"[analytics] output dir not found: {root}", file=sys.stderr)
        return 1

    changed = 0
    scanned = 0
    for path in root.rglob("*.html"):
        scanned += 1
        text = path.read_text(encoding="utf-8", errors="surrogateescape")
        updated = inject(text, token)
        if updated is not None:
            path.write_text(updated, encoding="utf-8", errors="surrogateescape")
            changed += 1

    print(f"[analytics] injected beacon into {changed}/{scanned} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
