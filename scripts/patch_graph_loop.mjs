/**
 * 让关系图谱「静止后降频重绘」。
 *
 * 问题：@quartz-community/graph 的渲染循环是无条件递归的
 *
 *   function se(){
 *     if (!De) {
 *       // 每帧重绘所有节点位置 + 所有连线
 *       ...
 *       requestAnimationFrame(se)
 *     }
 *   }
 *
 * 它不看物理模拟是否还在动，也不看页面是否可见，**每帧都重绘**。
 * 实测首页空闲时仍跑 48 FPS，主线程被占满 —— 用户反馈
 * 「关系图谱一直在动，网页都感觉有点卡，日夜切换也卡」。
 *
 * 修法：在循环里加「帧签名」检测
 *   - 每帧把所有节点的坐标算成一个签名
 *   - 签名连续 3 帧不变 = 已经静止 → 改成 400ms 后才画一次（降频巡检）
 *   - 一旦坐标又变了（拖动/缩放/重新模拟）立刻恢复 60fps
 *   - 页面不可见时降到 1s
 *
 * 为什么不用 d3 的 simulation.alpha()：
 *   压缩后 sim 对象的变量名在闭包里被改名，从 se() 内部引用不可靠。
 *   坐标签名不依赖任何外部变量，只看渲染结果本身。
 *
 * 为什么不改 node_modules：
 *   npm install / prebuild 会重装插件，改动会丢。构建后打补丁可重复。
 */

import fs from "node:fs"
import path from "node:path"

// 原始片段：无条件重绘（Quartz 压缩后的确切形态）
const OLD_TAIL = "requestAnimationFrame(se)}}"

// PIXI 的自动 ticker 也要停：它每帧都调 render，即使画面没变。
// Q.init() 之后立刻 stop()，我们手动控制何时重绘。
const OLD_INIT = 'await Q.init({width:I,height:O,antialias:!0,backgroundAlpha:0,resolution:window.devicePixelRatio||1,autoDensity:!0,eventMode:"static"}),_.appendChild(Q.canvas)'
// PIXI 8 的 Application.init() 内部会 autoStart ticker。
// 光调 stop() 一次可能被后面的 restart 覆盖，所以在渲染循环里
// 每次进入「静止」分支时都再停一次（幂等，开销可忽略）。
const NEW_INIT = 'await Q.init({width:I,height:O,antialias:!0,backgroundAlpha:0,resolution:window.devicePixelRatio||1,autoDensity:!0,eventMode:"static"}),Q.ticker&&(Q.ticker.autoStart=!1,Q.ticker.stop()),_.appendChild(Q.canvas),window.__nxPixiApp=Q' 

// 补丁后：签名不变则降频
// 核心：PIXI 的 Application 有自己的 ticker（实测占 245/2s 的 rAF），
// 即使我们不调 render，它也在空转。所以要同时停 ticker。
//
// 策略：把渲染循环改成「按需绘制」
//   - 平时不排 rAF，只在坐标真变了时排一帧
//   - 用一个轻量的 setInterval 巡检（200ms 一次，几乎不耗 CPU）
//   - 页面隐藏时完全停掉
const NEW_TAIL = `/* nx-patch: 静止后停止重绘 */
if(document.hidden){return}
/* 位置快照：每帧记录所有节点坐标，与上一帧比较最大位移 */
se.__snap=se.__snap||{x:[],y:[],ready:false};
var __maxd=0,__i,__s,__dx,__dy,__arr=se.__snap;
for(__i=0;__i<j.length;__i++){
  __s=j[__i].simulationData;
  if(__s.x==null)continue;
  if(__arr.ready){
    __dx=__s.x-__arr.x[__i];__dy=__s.y-__arr.y[__i];
    var __d2=__dx*__dx+__dy*__dy;
    if(__d2>__maxd)__maxd=__d2;
  }
  __arr.x[__i]=__s.x;__arr.y[__i]=__s.y;
}
/* 首帧必须放行：此时还没有上一帧可比，__maxd 恒为 0，
   如果直接按「静止」处理会一帧都不画，画布全空。
   用户反馈「关系图谱显示不出来了」就是这个。 */
if(!__arr.ready){__arr.ready=true;requestAnimationFrame(se);return}
/* 位移平方 < 0.09（约 0.3px）视为静止 → 300ms 后再看 */
if(__maxd<0.09){
  try{if(window.__nxPixiApp&&window.__nxPixiApp.ticker)window.__nxPixiApp.ticker.stop()}catch(e){}
  if(se.__timer)return;
  se.__timer=setTimeout(function(){se.__timer=null;se()},300);
  return;
}
/* 节点又在动了（拖动/缩放/重新模拟）：确保 PIXI ticker 恢复，
   否则之前静止时停掉的 ticker 不会自己醒来，画面会冻住。 */
try{var __app=window.__nxPixiApp;if(__app&&__app.ticker&&!__app.ticker.started)__app.ticker.start()}catch(e){}
requestAnimationFrame(se)}}`

const MARKER = "nx-patch: 静止后停止重绘"

export function patchGraphLoop(distDir) {
  // Quartz 把 inline script 编译到 static/scripts/script-N-<hash>.js
  const candidates = []
  const scriptDir = path.join(distDir, "static", "scripts")
  for (const dir of [path.join(distDir, "static"), scriptDir, distDir]) {
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (/\.js$/.test(f)) candidates.push(path.join(dir, f))
    }
  }

  let patched = 0
  for (const f of candidates) {
    let t
    try {
      t = fs.readFileSync(f, "utf-8")
    } catch {
      continue
    }
    if (!t.includes(OLD_TAIL)) continue
    if (t.includes(MARKER)) continue

    let next = t.replace(OLD_TAIL, NEW_TAIL)
    // 停掉 PIXI 自动 ticker
    if (next.includes(OLD_INIT)) {
      next = next.replace(OLD_INIT, NEW_INIT)
    }
    if (next !== t) {
      fs.writeFileSync(f, next, "utf-8")
      patched++
      console.log(`[graph-loop] ✓ ${path.relative(distDir, f)}`)
    }
  }

  if (!patched) {
    console.log("[graph-loop] 未找到可补丁的 graph 脚本（可能已打过或插件结构变了）")
  }
  return patched
}

// 直接运行时：node scripts/patch_graph_loop.mjs dist-public
if (process.argv[1] && process.argv[1].endsWith("patch_graph_loop.mjs")) {
  const target = process.argv[2]
  if (!target) {
    console.error("用法: node scripts/patch_graph_loop.mjs <dist-dir>")
    process.exit(1)
  }
  patchGraphLoop(path.resolve(target))
}
