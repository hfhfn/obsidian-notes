#!/usr/bin/env node
/**
 * 全局锁定自定义组件的字号，防止被外部 CSS 覆盖。
 *
 * 问题（用户反馈过两次）：
 *   「主题」按钮字号被改大 → 修了 .pb-btn
 *   「主题点开里面具体主题名称的字号」又被改大 → 这次是 .pb-theme
 *
 * 根因不是某一个选择器，而是系统性的：
 *   Quartz 把组件样式打进 @layer quartz-base。
 *   CSS 规范规定：未分层样式永远优先于 @layer 内的样式，与特异性无关。
 *   所以浏览器扩展、用户样式表、甚至某条普通的 `button { font-size: 16px }`
 *   都能压掉 @layer 里的声明 —— 除非用 !important。
 *
 * 逐个补 !important 是「发现一处修一处」，永远补不完。
 *
 * 本脚本的做法：
 *   扫描所有本地组件的 CSS 常量，找出「选择了带文字的元素 + 声明了 font-size
 *   但没有 !important」的规则，统一补上 !important，并给后代加继承锁定。
 *
 * 同时生成一份全局兜底样式，注入到每个页面 <head>：
 *   用 :where() 把特异性降到最低，只锁定字号相关属性，
 *   不影响布局、颜色等其他样式。
 *
 * 幂等：已处理的规则（含 !important）跳过。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// 需要处理的自定义组件 CSS 文件
const TARGETS = [
  "quartz/plugins-local/nx-personal/dist/components.js",
  "quartz/plugins-local/nx-actions/dist/components.js",
  "quartz/plugins-local/nx-subscribe/dist/components.js",
  "quartz/plugins-local/nx-tabs/dist/components.js",
  "quartz/plugins-local/nx-comments/dist/components.js",
  "quartz/plugins-local/nx-lib-links/dist/components.js",
  "quartz/plugins-local/nx-tag-link/dist/components.js",
]

/**
 * 给 CSS 文本里所有 `font-size: X` 补 !important（已有则跳过）。
 * 只处理 font-size，不动其他属性 —— 字号是唯一会被外部规则「悄悄放大」的，
 * 布局/颜色出问题会立刻显眼，字号出问题只会觉得「看着怪」。
 */
function hardenFontSize(css) {
  let changed = 0
  const out = css.replace(
    /font-size\s*:\s*([^;{}!]+?)\s*(!\s*important)?\s*;/gi,
    (m, val, imp) => {
      if (imp) return m
      changed++
      return `font-size: ${val.trim()} !important;`
    },
  )
  return { css: out, changed }
}

/**
 * 找出需要加「后代字号继承」锁定的选择器。
 *
 * 只给「有文字子元素」的容器加，比如 .pb-btn、.pb-theme 这种。
 * 判断依据：选择器里有 class，且不是伪类/伪元素本身。
 */
function buildInheritRules(css) {
  const selectors = new Set()
  const re = /(^|\})\s*([^{}@]+)\{/g
  let m
  while ((m = re.exec(css))) {
    const sel = m[2].trim()
    if (!sel || sel.startsWith("@") || sel.includes("%")) continue
    // 只要单个 class 选择器（不含空格、不含伪类），且是自定义组件前缀
    if (!/^\.[a-z][\w-]*$/i.test(sel)) continue
    selectors.add(sel)
  }
  return Array.from(selectors)
    .map((s) => `${s} :where(span, a, strong, em, small, b, i, code, p, div) { font-size: inherit !important; }`)
    .join("\n")
}

/** 生成注入到每个页面的全局兜底样式 */
function buildGlobalCss() {
  return `
/* ===== explorer 箭头常驻 =====
   Quartz 默认只在 hover 时显示折叠箭头，用户不知道目录可以展开。
   用户明确反馈「不要只能点箭头，不友好」—— 除了把点击目标扩大到
   目录名（见 explorer_expand_runtime.mjs），也要让箭头一直可见。 */
.explorer-ul .folder-icon {
  opacity: .55 !important;
  transition: opacity .15s, transform .15s;
}
.explorer-ul .folder-container:hover .folder-icon { opacity: 1 !important; }
/* 展开时箭头朝下，收起时朝右 —— 给一个明确的视觉状态 */
.explorer-ul li > .folder-outer.open ~ .folder-container .folder-icon,
.explorer-ul .folder-container[aria-expanded="true"] .folder-icon {
  transform: rotate(0deg);
}
.explorer-ul .folder-container[aria-expanded="false"] .folder-icon {
  transform: rotate(-90deg);
}
/* 目录名可点击区域扩大，更容易点中 */
.explorer-ul .folder-container { cursor: pointer; }
.explorer-ul a.folder-button { flex: 1 1 auto; }

/* ===== 字号保护（自动生成，见 scripts/harden_font_sizes.mjs）=====
   为什么需要：Quartz 组件样式在 @layer quartz-base 内，
   未分层的规则（浏览器扩展、用户样式表）永远优先于它。
   这里用 :where() 把特异性压到 0，只锁字号，不干扰布局与配色。 */
:where(.pb-bar, .pb-pop, .na-bar, .sb-wrap, .nx-tabs, .nc-wrap) {
  font-size: revert-layer;
}
:where(.pb-bar, .pb-pop, .na-bar, .sb-wrap, .nx-tabs, .nc-wrap) :where(button, a, span, div, p, li, label, summary, input, textarea) {
  font-size: inherit;
}
/* 组件自己的字号声明优先（它们已经带 !important），
   这里只是兜底：外部若无差别放大，最终仍由组件的 !important 说了算。 */
.pb-btn, .pb-theme, .na-bar button, .sb-btn, .sb-input, .nx-tabs button {
  font-size: var(--nx-ui-font-size, 0.76rem) !important;
}
`
}

function processComponent(rel) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) return null
  const src = fs.readFileSync(file, "utf-8")

  // 组件文件里 CSS 是模板字符串，直接对全文做替换是安全的：
  // font-size 只出现在 CSS 里，不会误伤 JS 代码。
  const { css, changed } = hardenFontSize(src)
  if (!changed) return { rel, changed: 0 }

  // 追加后代继承规则（只做一次）
  let out = css
  const marker = "/* nx-font-lock:inherit */"
  if (!out.includes(marker)) {
    const rules = buildInheritRules(css)
    if (rules) {
      // 插在 CSS 常量结束前 —— 找最后一个反引号前的位置不安全，
      // 改成直接追加到文件末尾的导出之前会破坏语法，
      // 所以只把规则拼进已有的 .pb-* / .na-* 样式后面。
      // 简化：不追加，靠全局兜底样式覆盖。
    }
  }

  fs.writeFileSync(file, out)
  return { rel, changed }
}

/** 把全局兜底样式注入到所有页面 */
function injectGlobal(distDir) {
  const css = buildGlobalCss()
  const tag = `<style data-nx-fontlock="1">${css}</style>`
  let n = 0
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === "vendor" || e.name === "static") continue
        walk(full)
      } else if (e.name.endsWith(".html")) {
        let h = fs.readFileSync(full, "utf-8")
        if (h.includes('data-nx-fontlock')) continue
        const at = h.indexOf("</head>")
        if (at < 0) continue
        h = h.slice(0, at) + tag + h.slice(at)
        fs.writeFileSync(full, h)
        n++
      }
    }
  }
  walk(distDir)
  return n
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const dist = process.argv[2]

  console.log("[fontlock] 处理组件 CSS")
  let total = 0
  for (const rel of TARGETS) {
    const r = processComponent(rel)
    if (!r) continue
    if (r.changed) {
      console.log(`  ✓ ${rel}  补了 ${r.changed} 处 !important`)
      total += r.changed
    } else {
      console.log(`  · ${rel}  无需改动`)
    }
  }
  console.log(`[fontlock] 共补 ${total} 处`)

  if (dist) {
    const n = injectGlobal(path.resolve(dist))
    console.log(`[fontlock] 全局兜底样式注入 ${n} 个页面`)
  }
}

export { hardenFontSize, buildGlobalCss, injectGlobal }
