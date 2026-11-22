/**
 * Explore Links — 三个卡片库的入口（左栏，在「探索」折叠面板之外）
 *
 * 为什么单独做组件而不是塞进 explorer：
 * Quartz 的 explorer 把所有文件夹都渲染成它的子项，视觉上都是「探索」的下一级。
 * 这三个库在语义上和「工作 / AI」等目录不同——它们是展示层页面，不是笔记分类，
 * 用户希望它们和「探索」这个面板标题平级，所以放在面板外面单独渲染。
 */
import { h } from "preact"

const LINKS = [
  { label: "藏书馆", href: "/藏书馆", icon: "📖" },
  { label: "观影库", href: "/观影库", icon: "🎬" },
  { label: "视频与专题", href: "/视频与专题", icon: "🎥" },
]

const CSS = `
.el-list {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin: 0.35rem 0 0.5rem;
}
.el-item {
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
.el-item:hover {
  background: var(--highlight);
  color: var(--secondary);
}
.el-item.active {
  background: var(--highlight);
  color: var(--secondary);
  font-weight: 600;
}
.el-icon {
  flex: 0 0 auto;
  font-size: 0.9rem;
  line-height: 1;
}
.el-label {
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

export function ExploreLinks() {
  const bp = basePath()
  const path = typeof location !== "undefined" ? decodeURIComponent(location.pathname) : ""

  const items = LINKS.map((l) => {
    const full = bp + l.href
    const isActive = path.startsWith(decodeURIComponent(l.href))
    return h(
      "a",
      {
        class: "el-item" + (isActive ? " active" : ""),
        href: full,
        "data-el": l.label,
      },
      h("span", { class: "el-icon", "aria-hidden": "true" }, l.icon),
      h("span", { class: "el-label" }, l.label),
    )
  })

  const List = () => h("nav", { class: "el-list", "aria-label": "卡片库" }, ...items)
  List.css = CSS
  return List
}

export default ExploreLinks
