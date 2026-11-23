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
// 只补一次首次渲染，之后交给 Quartz 自己的 nav / render 监听。
//
// 为什么不能挂在 __nxOnReinit 上：调度器在 DOM 变化、多轮延迟时都会触发，
// 每次调用 W() 都会重新渲染 explorer 并重置 data-collapsed="open" ——
// 用户点「探索」折叠后，下一次 DOM 变化又把它展开了，
// 表现成「探索不能折叠」。
const PATCHED =
  ANCHOR +
  // 补首次渲染，并确保折叠按钮已绑定。
  //
  // Quartz 的 W() 里做两件事：
  //   1. 渲染 .explorer-ul 的节点
  //   2. 给所有 .explorer-toggle 按钮绑 click（切换 .collapsed）
  //
  // 但 W() 在 DOMContentLoaded 时可能早于按钮插入，第 2 步绑不上，
  // 表现成「探索点了没反应 / 不能折叠」。
  // 这里重试到「列表有内容 且 按钮已绑」为止。
  'if(!window.__nxExplorerBooted){window.__nxExplorerBooted=1;' +
  'var __nxTries=0;' +
  'var __nxBoot=function(){' +
  '  var ul=document.querySelector(".explorer-ul");' +
  '  var btns=document.querySelectorAll(".explorer-toggle");' +
  '  var ready=(ul&&ul.children.length>1&&btns.length>0);' +
  // 只在还没就绪时才调 W() —— W() 会重渲染并重置 data-collapsed，
  // 如果每次都调，用户折叠「探索」后又被展开。
  '  if(!ready){try{W({detail:{url:location.pathname}})}catch(e){console.error("' + MARKER + '",e)}}' +
  '  if(ready||++__nxTries>50)return;' +
  '  setTimeout(__nxBoot,100);' +
  '};' +
  'if(document.readyState!=="loading")__nxBoot();else document.addEventListener("DOMContentLoaded",__nxBoot,{once:true})}'

let patched = 0
for (const rel of targets) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) {
    console.log(`[patch-explorer] 跳过（不存在）: ${rel}`)
    continue
  }
  let src = fs.readFileSync(file, "utf-8")

  // 版本标记：只有含这个守卫才算「已是最新」。
  // 之前只判断 MARKER（错误文案），而旧补丁也含 MARKER ——
  // 结果新版补丁永远打不上，用户还在跑旧逻辑（探索不能折叠）。
  const VERSION_TAG = "__nxExplorerBooted"
  if (src.includes(VERSION_TAG)) {
    console.log(`[patch-explorer] 已是最新: ${rel}`)
    continue
  }
  if (!src.includes(ANCHOR)) {
    console.log(`[patch-explorer] 锚点未找到，可能升级了版本: ${rel}`)
    continue
  }

  // 先剥掉任何旧补丁，避免叠加
  src = src.replace(
    /if\(window\.__nxOnReinit\)\{[\s\S]*?\}else if\(document\.readyState!=="loading"\)\{[\s\S]*?\}else\{document\.addEventListener\("DOMContentLoaded",W\)\}/,
    "",
  )
  src = src.replace(
    /if\(document\.readyState!=="loading"\)\{try\{W\(\{detail:\{url:location\.pathname\}\}\)\}catch\(e\)\{console\.error\("\[Explorer\] init error",e\)\}\}else\{document\.addEventListener\("DOMContentLoaded",W\)\}/,
    "",
  )
  src = src.replace(ANCHOR, PATCHED)
  fs.writeFileSync(file, src)
  patched++
  console.log(`[patch-explorer] ✓ 已修复首次渲染: ${rel}`)
}

if (!patched) console.log("[patch-explorer] 无需改动")
