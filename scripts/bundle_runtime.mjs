#!/usr/bin/env node
/**
 * 把所有「全站运行时」打包成一个外部 JS 文件，页面只引用一行 <script src>。
 *
 * 为什么改：
 *   之前 inject_charts / inject_library / inject_mindmap / paginate_listing /
 *   inject_reinit 各自往【每一个】页面内联一段脚本。实测单页 53.5KB，
 *   689 页合计 35.2MB 完全重复的内容 —— 每页都重新下载一遍，
 *   首次访问慢、Cloudflare 也无法跨页缓存（内联脚本没有独立 URL）。
 *
 * 正确做法（业界标准）：
 *   所有页面共享的逻辑 → 打包成一个带内容哈希的 .js 文件
 *   放在 /static/nx-runtime.<hash>.js
 *   每页只放一行：<script src="/static/nx-runtime.<hash>.js" defer></script>
 *
 *   好处：
 *     - 浏览器缓存一次，后续所有页面命中缓存（0 字节）
 *     - 内容哈希变了才重新下载，可长期缓存
 *     - HTML 体积从 53KB 降到 ~100 字节
 *
 * 实现：
 *   本脚本【不】重新生成这些运行时，而是从已有的注入脚本里把它们的
 *   RUNTIME 常量取出来，拼成一个大文件。这样各脚本仍然是唯一的真源，
 *   不会出现两份逻辑不一致。
 *
 *   顺序很重要：调度器必须最先（其他脚本要注册到它上面），
 *   然后是各功能模块。
 *
 * 用法：
 *   node scripts/bundle_runtime.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** 从某个注入脚本里抽取它的 RUNTIME 模板字符串 */
async function extractRuntime(scriptFile, exportName) {
  const mod = await import(`file://${path.join(root, scriptFile)}`)
  const v = mod[exportName]
  if (typeof v !== "string") {
    throw new Error(`${scriptFile} 没有导出字符串 ${exportName}`)
  }
  return v
}

/** 把一个模块的运行时包进 IIFE，避免变量名互相污染 */
function wrap(name, code) {
  return `\n/* ===== ${name} ===== */\n;(function(){\n${code}\n})();\n`
}

async function build() {
  const parts = []

  // 1) 调度器最先 —— 其他模块会调用 window.__nxOnReinit
  parts.push(wrap("reinit-dispatcher", await extractRuntime("scripts/inject_reinit.mjs", "REINIT_RUNTIME")))

  // 2) 各功能模块（顺序无所谓，但都要在调度器之后）
  parts.push(wrap("library-filter", await extractRuntime("scripts/inject_library.mjs", "FILTER_JS")))
  parts.push(wrap("charts-runtime", await extractRuntime("scripts/inject_charts.mjs", "CHARTS_RUNTIME")))
  parts.push(wrap("markmap", await extractRuntime("scripts/inject_mindmap.mjs", "MINDMAP_RUNTIME")))
  parts.push(wrap("listing-pager", await extractRuntime("scripts/paginate_listing.mjs", "PAGER_RUNTIME")))
  parts.push(wrap("explorer-expand", await extractRuntime("scripts/explorer_expand_runtime.mjs", "EXPLORER_EXPAND_RUNTIME")))

  return parts.join("")
}

/** 内联到 <script> 时的安全转义 */
function escapeForInline(js) {
  return js
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<script/gi, "<\\script")
    .replace(/<!--/g, "<\\!--")
}

function writeBundle(distDir, code) {
  const hash = crypto.createHash("sha256").update(code).digest("hex").slice(0, 10)
  const rel = `static/nx-runtime.${hash}.js`
  const out = path.join(distDir, rel)

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, code, "utf-8")

  // 清掉旧哈希的包，避免堆积
  const dir = path.join(distDir, "static")
  for (const f of fs.readdirSync(dir)) {
    if (/^nx-runtime\.[a-f0-9]+\.js$/.test(f) && f !== `nx-runtime.${hash}.js`) {
      fs.unlinkSync(path.join(dir, f))
    }
  }

  return { rel, hash, bytes: Buffer.byteLength(code) }
}

function stripInlineAndAddTag(distDir, bundleRel) {
  let stripped = 0
  let tagged = 0

  const MARKERS = [
    "/* nx-reinit-dispatcher */",
    "/* library-filter */",
    "/* charts-runtime */",
    "/* data-pl-runtime */",
    "/* data-mm-runtime */",
    "data-mm-runtime",
  ]

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === "vendor" || e.name === "static") continue
        walk(full)
        continue
      }
      if (!e.name.endsWith(".html")) continue

      let h = fs.readFileSync(full, "utf-8")
      const before = h

      // --- 移除之前内联的全局运行时 ---
      // 这些 <script> 都以某个 marker 开头，整体删掉。
      h = h.replace(
        /<script>(?:\s|\/\*[^*]*\*\/)*(?:\/\* (?:nx-reinit-dispatcher|library-filter|charts-runtime|data-pl-runtime|data-mm-runtime) \*\/)[\s\S]*?<\/script>/g,
        "",
      )

      // --- 加外部引用（幂等）---
      if (!h.includes(bundleRel)) {
        const at = h.lastIndexOf("</body>")
        if (at >= 0) {
          // defer：不阻塞解析，且在 DOM 就绪后按顺序执行
          h =
            h.slice(0, at) +
            `<script src="/${bundleRel}" defer data-nx-runtime="1"></script>` +
            h.slice(at)
          tagged++
        }
      }

      if (h !== before) {
        fs.writeFileSync(full, h, "utf-8")
        stripped++
      }
    }
  }

  walk(distDir)
  return { stripped, tagged }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const dist = process.argv[2]
  if (!dist) {
    console.error("用法: node scripts/bundle_runtime.mjs <dist-dir>")
    process.exit(1)
  }
  const distDir = path.resolve(dist)

  const code = await build()
  const info = writeBundle(distDir, code)
  console.log(`[bundle] 打包 ${(info.bytes / 1024).toFixed(1)}KB → /${info.rel}`)

  const r = stripInlineAndAddTag(distDir, info.rel)
  console.log(`[bundle] 清理内联 ${r.stripped} 页，加外链 ${r.tagged} 页`)

  // 报告节省
  const savings = ((info.bytes * r.stripped) / 1024 / 1024).toFixed(1)
  console.log(`[bundle] 预计省下 ${savings}MB 重复内容`)
}

export { build, escapeForInline }
