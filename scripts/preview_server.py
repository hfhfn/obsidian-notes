#!/usr/bin/env python3
"""Static preview server that mimics Cloudflare Pages / GitHub Pages URL handling.

Cloudflare Pages serves `/foo` from `foo.html`, `/dir/` from `dir/index.html`.
Python's http.server does not, so local QA shows false 404s without this.
"""

import argparse
import http.server
import os
import posixpath
import urllib.parse


class PrettyHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.urlsplit(path).path
        path = urllib.parse.unquote(path)
        path = posixpath.normpath(path)
        parts = [p for p in path.split("/") if p and p not in (".", "..")]
        root = self.directory
        fs = os.path.join(root, *parts)
        if os.path.isdir(fs):
            index = os.path.join(fs, "index.html")
            if os.path.exists(index):
                return index
            return fs
        if os.path.exists(fs):
            return fs
        if os.path.exists(fs + ".html"):
            return fs + ".html"
        return fs

    def log_message(self, fmt, *args):  # quieter
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-d", "--directory", default="public")
    ap.add_argument("-p", "--port", type=int, default=8080)
    args = ap.parse_args()
    handler = lambda *a, **kw: PrettyHandler(*a, directory=args.directory, **kw)  # noqa: E731
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"serving {args.directory} on http://127.0.0.1:{args.port}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
