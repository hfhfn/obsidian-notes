/**
 * 往 HTML 里内联 JS 时，必须转义 `</script>`。
 *
 * 为什么需要：
 *   浏览器解析 HTML 时，`<script>` 里遇到 `</script>` 就认为脚本结束，
 *   哪怕它在字符串或注释里。一旦提前闭合，后面的 JS 全部变成页面文本，
 *   页面上会出现一大段源码（用户看到过：思维导图的导出代码显示在正文里）。
 *
 *   我踩过三次：
 *     1. inject_charts 里 alert 文案带 \n\n（模板字符串把 \n 变成真换行）
 *     2. 导出 HTML 模板里写 '</script>'
 *     3. inject_reinit 注入的调度器里也含 '</script>' 字面量
 *
 * 用法：
 *   import { inlineScript } from "./_inline.mjs"
 *   html.replace("</body>", inlineScript(RUNTIME) + "</body>")
 *
 * 或者只要内容：
 *   const safe = escapeScriptContent(js)
 */
export function escapeScriptContent(js) {
  return String(js)
    // 必须处理的：闭合标签
    .replace(/<\/script/gi, "<\\/script")
    // </body> 和 </html> 也要转义！
    // 后续的注入脚本（inject_reinit 等）用 lastIndexOf("</body>") 定位
    // 插入点，如果前面某个 RUNTIME 里含未转义的 '</body>' 字面量，
    // lastIndexOf 会命中那个字符串，把新脚本塞进字符串内部，
    // 结果脚本被截断、整段 JS 变成页面文本。
    .replace(/<\/body/gi, "<\\/body")
    .replace(/<\/html/gi, "<\\/html")
    // HTML 注释开头，避免 `<!--` 引发解析歧义
    .replace(/<!--/g, "<\\!--")
    // 开标签也要转义！
    // JS 注释里写「<script> 不会重新执行」这类说明文字，HTML 解析器
    // 会把它当成真的开标签，导致后面的脚本结构全乱、源码漏到页面上。
    .replace(/<script/gi, "<\\script")
}

/** 生成一段可安全内联的 <script>...</script> */
export function inlineScript(js) {
  return `<script>${escapeScriptContent(js)}</script>`
}
