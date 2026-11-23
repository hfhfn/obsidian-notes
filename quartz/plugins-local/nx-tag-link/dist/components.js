/**
 * Tag Link — 「标签索引」单链接（左栏，紧跟在「探索」面板之后）
 *
 * 为什么不在 explorer 里：tags 目录下有 320 个标签子节点，
 * 在导航树里展开会把整个目录挤到看不见。这里只渲染一个链接，
 * 点进去是分页的标签索引页（见 scripts/rewrite_tags_index.mjs）。
 */
import { h } from "preact"

const CSS = `
.tl-wrap {
  margin: 0.15rem 0 0.4rem;
}
.tl-item {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.28rem 0.5rem;
  border-radius: 6px;
  color: var(--darkgray);
  font-size: 0.85rem !important;
  font-family: var(--bodyFont);
  line-height: 1.5;
  text-decoration: none;
  background: none !important;
  transition: background-color 0.12s, color 0.12s;
}
.tl-item:hover {
  background: var(--highlight);
  color: var(--secondary);
}
.tl-item.active {
  background: var(--highlight);
  color: var(--secondary);
  font-weight: 600;
}
.tl-icon {
  flex: 0 0 auto;
  font-size: 0.9rem !important;
  line-height: 1;
}
`

function basePath() {
  if (typeof document === "undefined") return ""
  return document.body?.dataset?.basepath ?? ""
}

export function TagLink() {
  const bp = basePath()
  const path = typeof location !== "undefined" ? decodeURIComponent(location.pathname) : ""
  const isActive = path.startsWith("/tags")

  const Link = () =>
    h(
      "div",
      { class: "tl-wrap" },
      h(
        "a",
        {
          class: "tl-item" + (isActive ? " active" : ""),
          href: bp + "/tags",
        },
        h("span", { class: "tl-icon", "aria-hidden": "true" }, "🏷"),
        h("span", { class: "tl-label" }, "标签索引"),
      ),
    )

  Link.css = CSS
  return Link
}

export default TagLink
