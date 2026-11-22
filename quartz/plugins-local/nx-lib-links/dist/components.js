/**
 * Lib Links — 三个卡片库的入口（左栏，位于「探索」折叠面板之外）
 *
 * 为什么不放在 explorer 里：explorer 里的所有节点都在「探索」的折叠范围内，
 * 折叠面板时会被一起收起来，视觉上也是「探索」的子级。
 * 这三个库是站点展示层页面，不是笔记分类，应该在面板外单独成一栏。
 *
 * 用真实 <a href> 而不是 JS 跳转，保证浏览器后退能正常回退。
 */
import { h } from "preact"

const LINKS = [
  { label: "藏书馆", href: "/藏书馆", icon: "📖" },
  { label: "观影库", href: "/观影库", icon: "🎬" },
  { label: "视频与专题", href: "/视频与专题", icon: "🎥" },
]

const CSS = `
.ll-wrap {
  margin: 0.5rem 0 0.2rem;
}
.ll-item {
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
.ll-item:hover {
  background: var(--highlight);
  color: var(--secondary);
}
.ll-item.active {
  background: var(--highlight);
  color: var(--secondary);
  font-weight: 600;
}
.ll-icon {
  flex: 0 0 auto;
  font-size: 0.9rem;
  line-height: 1;
}
.ll-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`

function basePath() {
  if (typeof document === "undefined") return ""
  return document.body?.dataset?.basepath ?? ""
}

export function LibLinks() {
  const bp = basePath()
  const path = typeof location !== "undefined" ? decodeURIComponent(location.pathname) : ""

  const items = LINKS.map((l) => {
    const isActive = path.startsWith(decodeURIComponent(l.href))
    return h(
      "a",
      {
        class: "ll-item" + (isActive ? " active" : ""),
        href: bp + l.href,
      },
      h("span", { class: "ll-icon", "aria-hidden": "true" }, l.icon),
      h("span", { class: "ll-label" }, l.label),
    )
  })

  const Nav = () => h("nav", { class: "ll-wrap", "aria-label": "卡片库" }, ...items)
  Nav.css = CSS
  return Nav
}

export default LibLinks
