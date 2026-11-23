/**
 * Subscribe Box — 页尾邮件订阅
 *
 * 外观参考常见的「输入邮箱 + 订阅按钮」样式：
 * 标题、说明、输入框与按钮同排，深色下自适应。
 * 提交走 /api/public/subscribe，成功后原地提示。
 */
import { h } from "preact"

const CSS = `
.sb-wrap {
  margin: 2.6rem 0 0;
  padding: 1.25rem 1.4rem 1.35rem;
  border: 1px solid var(--lightgray);
  border-radius: 12px;
  background: color-mix(in srgb, var(--lightgray) 18%, transparent);
}
.sb-title {
  display: flex; align-items: center; gap: .45rem;
  margin: 0 0 .35rem;
  font-size: 1.05rem; font-weight: 700;
  color: var(--dark);
  font-family: var(--headerFont);
}
.sb-title svg { width: 16px; height: 16px; color: var(--gray); }
.sb-desc {
  margin: 0 0 .95rem;
  color: var(--gray);
  font-size: .86rem;
}
.sb-form { display: flex; gap: .55rem; flex-wrap: wrap; }
.sb-input {
  flex: 1 1 16rem; min-width: 0;
  padding: .6rem .8rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background: var(--light);
  color: var(--darkgray);
  font-size: .88rem;
  font-family: var(--bodyFont);
  transition: border-color .15s;
}
.sb-input::placeholder { color: var(--gray); }
.sb-input:focus {
  outline: none;
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px var(--highlight);
}
.sb-btn {
  flex: 0 0 auto;
  padding: .6rem 1.15rem;
  border: 1px solid var(--secondary);
  border-radius: 8px;
  background: var(--secondary);
  color: #fff;
  font-size: .88rem;
  font-family: var(--bodyFont);
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s, transform .05s;
}
.sb-btn:hover { opacity: .88; }
.sb-btn:active { transform: translateY(1px); }
.sb-btn[disabled] { opacity: .55; cursor: default; }
.sb-msg {
  margin-top: .65rem;
  font-size: .82rem;
  min-height: 1.2em;
}
.sb-msg.ok { color: var(--tertiary); }
.sb-msg.err { color: #c0392b; }

@media all and (max-width: 800px) {
  .sb-wrap { padding: 1rem; }
  .sb-btn { flex: 1 1 auto; }
}
`

const ICONS = {
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
}

function icon(path) {
  return h("svg", {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
  }, h("path", { d: path }))
}

const RUNTIME = `
(function () {
  async function submit(e) {
    e.preventDefault();
    var form = e.target;
    var input = form.querySelector(".sb-input");
    var btn = form.querySelector(".sb-btn");
    var msg = form.parentElement.querySelector(".sb-msg");
    var email = (input.value || "").trim();
    if (!email) return;

    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = "提交中…";
    msg.className = "sb-msg";
    msg.textContent = "";

    try {
      var r = await fetch("/api/public/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email }),
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok) {
        msg.className = "sb-msg ok";
        msg.textContent = d.message || "订阅成功";
        input.value = "";
      } else {
        msg.className = "sb-msg err";
        msg.textContent = d.message || "订阅失败，请检查邮箱格式";
      }
    } catch (err) {
      msg.className = "sb-msg err";
      msg.textContent = "网络异常，请稍后再试";
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function init() {
    document.querySelectorAll(".sb-form").forEach(function (f) {
      if (f.dataset.bound) return;
      f.dataset.bound = "1";
      f.addEventListener("submit", submit);
    });
  }
  document.addEventListener("nav", init);
  if (window.__nxOnReinit) window.__nxOnReinit(init);
  else if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
`

export function SubscribeBox() {
  // 只在首页渲染订阅框：订阅是站点级入口，每篇文章页尾再放一次是噪音。
  // 用组件内部判断而不是 layout.condition，因为内置条件只有 not-index，
  // 没有 index-only，注册自定义条件又需要改动构建期代码。
  const Box = (props) => {
    if (props?.fileData?.slug !== "index") return null

    return h("section", { class: "sb-wrap" },
      h("h3", { class: "sb-title" }, "订阅", icon(ICONS.link)),
      h("p", { class: "sb-desc" }, "免费订阅获取最新推送"),
      h("form", { class: "sb-form", onsubmit: "return false" },
        h("input", {
          class: "sb-input", type: "email", name: "email",
          placeholder: "你的邮箱", required: true, autocomplete: "email",
        }),
        h("button", { class: "sb-btn", type: "submit" }, "订阅"),
      ),
      h("div", { class: "sb-msg" }),
    )
  }

  Box.css = CSS
  Box.afterDOMLoaded = RUNTIME
  return Box
}

export default SubscribeBox
