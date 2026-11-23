#!/usr/bin/env node
/**
 * 构建后检查：dist 里所有 JS 必须语法正确。
 *
 * 为什么需要：
 *   一个语法错误会让整段运行时静默失效 —— 页面上什么都不发生，
 *   Console 里的错误消息甚至是空的（跨域模块的典型表现）。
 *   我因为这个排查了很久：
 *     - nx-comments 的引号嵌套错 → 评论区空白
 *     - nx-personal 多了一个 } → 账号入口永远显示「登录」
 *   两次都是「功能没反应」，但代码看着都在。
 *
 * 本脚本对每个 .js 跑一次 node --check，有错就打印文件名+行号并退出 1，
 * 让构建直接失败，而不是把坏产物部署上线。
 *
 * 用法：node scripts/check_js_syntax.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      // 跳过第三方 vendor 库：它们是压缩过的 UMD 包，
      // node --check 会误判（比如 markmap-lib.min.js 用了顶层 await 语法糖）。
      // 这些不是我们写的代码，出问题也不该阻塞构建。
      if (e.name === "vendor") continue
      collect(full, out)
    } else if (e.name.endsWith(".js")) {
      out.push(full)
    }
  }
  return out
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const dist = process.argv[2]
  if (!dist) {
    console.error("用法: node scripts/check_js_syntax.mjs <dist-dir>")
    process.exit(1)
  }
  const root = path.resolve(dist)
  const files = collect(root)
  const bad = []

  for (const f of files) {
    try {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" })
    } catch (e) {
      const msg = String(e.stderr || e.message)
      // 只保留 SyntaxError 那一行 + 文件:行号
      const line = msg.split("\n").find((l) => l.includes("SyntaxError")) || "语法错误"
      const loc = msg.split("\n").find((l) => l.includes(":") && /\.js:\d+/.test(l)) || ""
      bad.push({ file: path.relative(root, f), line: line.trim(), loc: loc.trim() })
    }
  }

  if (bad.length) {
    console.error(`\n[check-js] ✗ ${bad.length} 个文件语法错误：`)
    for (const b of bad) {
      console.error(`  ${b.file}`)
      console.error(`    ${b.loc}`)
      console.error(`    ${b.line}`)
    }
    console.error("\n[check-js] 构建中止 —— 语法错误会让整段运行时静默失效。\n")
    process.exit(1)
  }

  console.log(`[check-js] ✓ ${files.length} 个 JS 文件语法正常`)
}

export { collect }
