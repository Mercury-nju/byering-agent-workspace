/**
 * ui/agent-card-chat.js
 * 办公室原生 Agent 信息卡片（dt-eid="xiaobao_agent_workbench_card"）增强：
 * 卡片出现后提供工作进展、沟通和云电脑入口；云电脑在当前页面内以大屏弹窗展示。
 * 纯运行时注入，不改任何冻结文件；注入内容带 translate="no" 防浏览器翻译改写。
 */
import { AGENT_TYPE_DEFAULTS } from "../agents/model.js";
import { applyAvatarToImage, restoreAvatarImage } from "./agent-avatar.js";

const CARD_SELECTOR = '[dt-eid="xiaobao_agent_workbench_card"]';

const CSS = `
.sb-card-chat-foot{display:flex;justify-content:flex-end;padding:10px 14px;border-top:1px solid rgba(15,15,15,0.06)}
.sb-card-chat-actions{display:flex;justify-content:flex-end;gap:8px;width:100%}
.sb-card-chat-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(15,15,15,0.14);background:#fff;color:#1F2329;font-size:12px;padding:7px 14px;border-radius:9px;cursor:pointer;font-family:inherit}
.sb-card-chat-btn.sb-progress{background:#1F2329;border-color:#1F2329;color:#fff}
.sb-card-chat-btn:hover{background:#33373F}
.sb-card-chat-btn:not(.sb-progress):hover{background:#F5F6F8;color:#1F2329}
.sb-card-chat-btn svg{width:14px;height:14px}
.sb-card-computer-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:7px;padding:0;border:1px solid rgba(15,15,15,.14);border-radius:8px;background:#fff;color:#4B5563;cursor:pointer;vertical-align:middle;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}
.sb-card-computer-icon:hover{background:#EEF4FF;color:#2563EB;border-color:#AFC9F8;transform:translateY(-1px)}
.sb-card-computer-icon svg{width:15px;height:15px}
`;

const CHAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-4.5-7.8L21 3l-.8 3.6A8.9 8.9 0 0 1 21 12z"/><path d="M8 10h8M8 14h5"/></svg>';
const COMPUTER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

/** 规范化名字，便于双向包含匹配（去空白/间隔号/括号等）。 */
function norm(text) {
  return (text || "").replace(/[\s·•()（）\-—_·]/g, "").toLowerCase();
}

/**
 * 由卡片上的名字解析 agentType：
 * 1) 与 teamLive 档案（identity.name / role.position）及 agentType 键双向包含匹配；
 * 2) 兜底：含 salebuddy/marvis/幕僚长 → main。
 */
function resolveAgentType(cardName, teamLive) {
  const target = norm(cardName);
  if (!target) return null;
  const profiles = teamLive?.getProfiles?.() || new Map();
  for (const [type, profile] of profiles) {
    const candidates = [type, profile?.identity?.name, profile?.role?.position].map(norm).filter(Boolean);
    if (candidates.some((c) => target.includes(c) || c.includes(target))) return type;
  }
  for (const type of Object.keys(AGENT_TYPE_DEFAULTS)) {
    const key = norm(type);
    if (key && key !== "main" && target.includes(key)) return type;
  }
  if (/salebuddy|marvis|幕僚长/.test(target)) return "main";
  return null;
}

/** 读卡片展示名：优先 name 节点，其次头像 img 的 alt。 */
function readCardName(card) {
  const nameNode = card.querySelector('[class*="_name_"]');
  const fromName = nameNode?.textContent?.trim();
  if (fromName) return fromName;
  const avatar = card.querySelector("img[alt]");
  return avatar?.getAttribute("alt")?.trim() || null;
}

export { CARD_SELECTOR, readCardName, resolveAgentType };

/** 尝试关掉原生卡片弹层（Semi popover：优先 Escape，其次外部 mousedown）。 */
function dismissPopover(card) {
  for (const type of ["keydown", "keyup"]) {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }
  setTimeout(() => {
    if (card.isConnected) {
      for (const type of ["mousedown", "mouseup", "click"]) {
        document.body.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
    }
  }, 50);
}

/**
 * 挂载卡片增强。
 * deps: { teamLive, onChat(agentType), onProgress(agentType), onCloud(agentType) }
 */
export function mountAgentCardChat({ teamLive, onChat, onProgress, onCloud } = {}) {
  ensureStyle();

  function enhance(card) {
    if (!card.isConnected) return;
    const name = readCardName(card);
    const agentType = resolveAgentType(name, teamLive);
    if (!agentType) return; // 认不出是谁就不注入，避免跳错人
    const avatar = card.querySelector("img[alt]");
    if (avatar) applyAvatarToImage(avatar, agentType);
    const bindAction = (btn, action) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        dismissPopover(card);
        setTimeout(() => action?.(agentType), 90);
      });
      for (const type of ["mousedown", "mouseup", "pointerdown", "pointerup"]) {
        btn.addEventListener(type, (event) => event.stopPropagation());
      }
    };
    const nameNode = card.querySelector('[class*="_name_"]');
    if (onCloud && nameNode?.parentElement && !card.querySelector("[data-sb-card-cloud]")) {
      const cloudBtn = document.createElement("button");
      cloudBtn.type = "button";
      cloudBtn.className = "sb-card-computer-icon";
      cloudBtn.dataset.sbCardCloud = "1";
      cloudBtn.innerHTML = COMPUTER_ICON;
      cloudBtn.title = "打开云电脑";
      cloudBtn.setAttribute("aria-label", "打开云电脑");
      bindAction(cloudBtn, onCloud);
      nameNode.insertAdjacentElement("afterend", cloudBtn);
    }
    if (card.querySelector("[data-sb-card-chat]")) return;

    const foot = document.createElement("div");
    foot.className = "sb-card-chat-foot notranslate";
    foot.setAttribute("translate", "no");
    foot.dataset.sbCardChat = "1";
    const actions = document.createElement("div");
    actions.className = "sb-card-chat-actions";
    if (onProgress) {
      const progressBtn = document.createElement("button");
      progressBtn.className = "sb-card-chat-btn sb-progress";
      progressBtn.textContent = "查看进展";
      bindAction(progressBtn, onProgress);
      actions.appendChild(progressBtn);
    }
    const btn = document.createElement("button");
    btn.className = "sb-card-chat-btn";
    btn.innerHTML = `${CHAT_ICON}<span>沟通</span>`;
    bindAction(btn, onChat);
    actions.appendChild(btn);
    foot.appendChild(actions);
    card.appendChild(foot);
  }

  function sweep() {
    for (const card of document.querySelectorAll(CARD_SELECTOR)) enhance(card);
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; sweep(); }, 120);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  sweep();
  console.log("[SaleBuddy] 办公室 Agent 卡片「沟通」入口已挂载");

  return {
    unmount() {
      observer.disconnect();
      document.querySelectorAll(`${CARD_SELECTOR} img[data-sb-agent-avatar-original]`).forEach(restoreAvatarImage);
    }
  };
}
