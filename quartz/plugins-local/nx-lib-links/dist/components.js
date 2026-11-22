/**
 * Lib Links — 三个卡片库的入口（左栏，位于「探索」折叠面板之外）
 *
 * 为什么用内联 SVG 而不是 emoji：📖 这类字符在 Windows 深色模式下会渲染成
 * 单色轮廓（Segoe UI Emoji 的 text presentation），看起来又小又灰。
 * SVG 能固定颜色和尺寸，深/浅色主题都一致。
 */
import { h } from "preact"

const LINKS = [
  {
    label: "藏书馆",
    href: "/藏书馆",
    color: "#e8a33d",
    // 打开的书
    path: "M12 6.5C10.5 5.2 8.6 4.6 6.2 4.6c-.9 0-1.7.1-2.4.3v13.4c.7-.2 1.5-.3 2.4-.3 2.4 0 4.3.6 5.8 1.9V6.5zm0 0c1.5-1.3 3.4-1.9 5.8-1.9.9 0 1.7.1 2.4.3v13.4c-.7-.2-1.5-.3-2.4-.3-2.4 0-4.3.6-5.8 1.9",
  },
  {
    label: "观影库",
    href: "/观影库",
    color: "#c084fc",
    // 胶片
    path: "M3.5 5.5h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zm3 0v13m11-13v13M2.5 9.5h3m13 0h3M2.5 13.5h3m13 0h3",
  },
  {
    label: "视频与专题",
    href: "/视频与专题",
    color: "#f87171",
    // 播放键圆环
    path: "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6zm-1.6 5.4 5.4 3.4-5.4 3.4V8.6z",
  },
]

const CSS = `
.ll-wrap {
  margin: 0.5rem 0 0.2rem;
}
.ll-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
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
  width: 15px;
  height: 15px;
  display: block;
}
.ll-icon svg {
  display: block;
  width: 15px;
  height: 15px;
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
      h(
        "span",
        { class: "ll-icon", "aria-hidden": "true" },
        h(
          "svg",
          {
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: l.color,
            "stroke-width": "1.7",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
          h("path", { d: l.path }),
        ),
      ),
      h("span", { class: "ll-label" }, l.label),
    )
  })

  const Nav = () => h("nav", { class: "ll-wrap", "aria-label": "卡片库" }, ...items)
  Nav.css = CSS
  return Nav
}

export default LibLinks
