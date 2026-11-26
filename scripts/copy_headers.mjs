/**
 * 把 _headers 复制到构建产物根目录。
 *
 * 为什么需要单独一步：
 *   Cloudflare Pages 只认 **站点根目录** 的 _headers 文件。
 *   Quartz 只把 quartz/static/ 的内容复制到 dist/static/，
 *   根目录的 _headers 需要构建后自己放。
 *
 * 为什么需要 _headers：
 *   没有它时 Cloudflare 用默认策略 ——
 *     HTML  max-age=0, must-revalidate           每次回源
 *     图片  max-age=14400, must-revalidate       4 小时后失效
 *   实测同一张封面图连续请求 5 次全是 cf-cache-status: REVALIDATED，
 *   每次 0.5~1.1 秒；藏书馆一页 16 张图，浏览器里单张 6~9 秒。
 *
 * 用法: node scripts/copy_headers.mjs dist-public
 */
import fs from "node:fs"
import path from "node:path"

const dist = process.argv[2]
if (!dist) {
  console.error("[headers] 用法: node scripts/copy_headers.mjs <dist目录>")
  process.exit(1)
}

const src = path.join("public", "_headers")
if (!fs.existsSync(src)) {
  console.warn("[headers] public/_headers 不存在，跳过")
  process.exit(0)
}

if (!fs.existsSync(dist)) {
  console.error(`[headers] 产物目录不存在: ${dist}`)
  process.exit(1)
}

const dest = path.join(dist, "_headers")
fs.copyFileSync(src, dest)
const size = fs.statSync(dest).size
console.log(`[headers] ✓ _headers → ${dest} (${size} 字节)`)
