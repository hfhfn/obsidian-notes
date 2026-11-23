#!/usr/bin/env node
/**
 * 修 Quartz explorer 首次加载不渲染的问题。
 *
 * 现象：
 *   打开站点，左侧「探索」是展开的，但里面只有一个空的 <li>。
 *   点击任意导航（触发 SPA 的 nav 事件）后，7 个目录节点才出现。
 *
 * 根因：
 *   @quartz-community/explorer 的 afterDOMLoaded 只注册了
 *   nav / render / prenav 三个监听器，没有在脚本执行时立即渲染一次。
 *   而 afterDOMLoaded 脚本是在 DOMContentLoaded 之后注入的 ——
 *   它自己注册的 DOMContentLoaded 监听器永远等不到，
 *   首次加载就成了空白。
 *
 * 修法：
 *   接到 scripts/inject_reinit.mjs 的全局调度器上（window.__nxOnReinit），
 *   不再自己写「立即执行 + DOMContentLoaded」的一次性判断。
 *   调度器覆盖 DOMContentLoaded / nav / popstate / DOM 变化 / 多轮延迟，
 *   所有组件共用一套时机，不会互相漏。
 *
 * 为什么写成构建时 patch 而不是直接改 node_modules：
 *   node_modules 会被 npm install 覆盖，补丁必须可重现。
 *   在 npm run build 前跑一次，幂等（已 patch 过就跳过）。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const targets = [
  "node_modules/@quartz-community/explorer/dist/components/index.js",
]

const MARKER = "[Explorer] init error"
const ANCHOR = 'document.addEventListener("nav",W);document.addEventListener("render",W);'
const PATCHED =
  ANCHOR +
  'if(window.__nxOnReinit){window.__nxOnReinit(function(){try{W({detail:{url:location.pathname}})}catch(e){console.error("' +
  MARKER +
  '",e)}})}else if(document.readyState!=="loading"){try{W({detail:{url:location.pathname}})}catch(e){}}else{document.addEventListener("DOMContentLoaded",W)}'

let patched = 0
for (const rel of targets) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) {
    console.log(`[patch-explorer] 跳过（不存在）: ${rel}`)
    continue
  }
  let src = fs.readFileSync(file, "utf-8")
  if (src.includes(MARKER)) {
    console.log(`[patch-explorer] 已是最新: ${rel}`)
    continue
  }
  if (!src.includes(ANCHOR)) {
    console.log(`[patch-explorer] 锚点未找到，可能升级了版本: ${rel}`)
    continue
  }
  src = src.replace(ANCHOR, PATCHED)
  fs.writeFileSync(file, src)
  patched++
  console.log(`[patch-explorer] ✓ 已修复首次渲染: ${rel}`)
}

if (!patched) console.log("[patch-explorer] 无需改动")
