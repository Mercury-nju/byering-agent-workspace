/**
 * ui/office-switch.js
 * 办公室 × 项目组：每个办公室对应一个项目组。
 * 在原生侧边栏「办公室」行下方注入项目组切换列表（QQ 分组式），
 * 点击某个项目组 → room.office.switch 切换办公室会话 → 触发原生办公室行导航。
 * 激活的项目组带绿点高亮。办公室自身逻辑/视觉/代码零改动，纯外层注入。
 */
import { NAV_EVENT, NAV_LAYOUT, isNavigationRuntimeMounted } from "./nav-framework.js";
import { BRAND } from "../brand.js";

const BOX_ID = "salebuddy-office-rooms";

const CSS = `
#${BOX_ID}{position:relative;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:2px 0 8px}
#${BOX_ID} .sb-ofs-row{min-height:${NAV_LAYOUT.projectRow}px;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:0 10px 0 ${NAV_LAYOUT.childIndent}px;margin:0 6px;border-radius:8px;cursor:pointer;font-size:12px;color:#1F2329}
#${BOX_ID} .sb-ofs-row:hover{background:rgba(15,15,15,0.04)}
#${BOX_ID} .sb-ofs-row.sb-on{background:rgba(15,15,15,0.06)}
#${BOX_ID} .sb-ofs-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#C4C8CE}
#${BOX_ID} .sb-ofs-row.sb-on .sb-ofs-dot{background:#57B26A}
#${BOX_ID} .sb-ofs-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${BOX_ID} .sb-ofs-side{flex:none;font-size:10px;color:#B0B4BB}
#${BOX_ID} .sb-ofs-empty{font-size:11px;color:#B0B4BB;padding:4px 12px 4px 34px}
#${BOX_ID} .sb-office-project-count{position:absolute;right:16px;top:-30px;font-size:10.5px;font-weight:400;color:#969BA4;white-space:nowrap;pointer-events:none}
.sb-office-room-badge{margin-left:8px;font-size:12px;font-weight:400;color:#8A8F99;white-space:nowrap;line-height:36px}
/* 隐藏原生标题文字（不碰 DOM 文本，免疫 React 重渲染与浏览器自动翻译），由我们注入的标题替代 */
.office-dashboard [class*="_pageTitleText_"]{font-size:0 !important}
.sb-office-title-name{font-size:20px;font-weight:700;line-height:36px;color:#000;white-space:nowrap}
`;

function el(tag, className, text, ownerDocument = globalThis.document) {
  const node = ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function findOfficeRow(ownerDocument = globalThis.document) {
  const section = ownerDocument.querySelector('[class*="_conversationSection_"]');
  if (!section) return null;
  for (const item of section.querySelectorAll('[dt-eid="sidebar_tab"], [data-dt-eid="sidebar_tab"], [class*="_menuItem_"]')) {
    if (item.textContent?.replace(/\s+/g, "").trim() === "办公室") return item;
  }
  return null;
}

/**
 * 挂载办公室项目组切换器。
 * deps: { gateway }
 */
export function mountOfficeSwitch({ gateway } = {}) {
  const mountedDocument = globalThis.document;
  const mountedWindow = globalThis.window;
  const MutationObserverClass = globalThis.MutationObserver;
  const CustomEventClass = mountedWindow.CustomEvent || globalThis.CustomEvent;
  const createElement = (tag, className, text) => el(tag, className, text, mountedDocument);
  const styleTag = mountedDocument.createElement("style");
  styleTag.textContent = CSS;
  mountedDocument.head.appendChild(styleTag);

  let disposed = false;
  let box = null;
  let rooms = [];
  let activeRoomId = null;
  let switching = false;
  let lastSignature = null;
  let refreshRevision = 0;
  let lifecycleRevision = 0;
  const boxCleanups = new Map();

  function cleanupRows(ownedBox) {
    for (const cleanup of boxCleanups.get(ownedBox) || []) cleanup();
    if (boxCleanups.has(ownedBox)) boxCleanups.set(ownedBox, []);
  }

  function releaseBox(ownedBox) {
    if (!ownedBox) return;
    cleanupRows(ownedBox);
    ownedBox.remove();
    boxCleanups.delete(ownedBox);
  }

  async function refreshData() {
    if (!gateway || disposed || switching) return;
    const revision = ++refreshRevision;
    try {
      const [listResult, currentResult] = await Promise.all([
        gateway.action("room.action.list"),
        gateway.action("room.office.current")
      ]);
      if (!disposed && !switching && revision === refreshRevision) {
        rooms = listResult?.data?.rooms || [];
        activeRoomId = currentResult?.data?.roomId || null;
      }
    } catch { /* 保持上次 */ }
  }

  function render() {
    if (!box?.isConnected) return;
    // 数据没变就跳过重建：每 3s 重写文本节点会和 Chrome 自动翻译互相触发，导致侧边栏闪烁
    const signature = `${activeRoomId}|${rooms.map((room) => `${room.id}:${room.name}`).join(",")}`;
    if (signature === lastSignature && box.childNodes.length) return;
    lastSignature = signature;
    cleanupRows(box);
    box.textContent = "";
    const countNode = createElement("span", "sb-office-project-count notranslate", `· ${rooms.length} 个项目`);
    countNode.dataset.sbOfficeProjectCount = "1";
    countNode.setAttribute("aria-hidden", "true");
    countNode.setAttribute("translate", "no");
    box.appendChild(countNode);
    if (!rooms.length) {
      box.appendChild(createElement("div", "sb-ofs-empty", gateway ? "暂无项目" : "gateway 未连接"));
      return;
    }
    for (const room of rooms) {
      const row = createElement("div", `sb-ofs-row${room.id === activeRoomId ? " sb-on" : ""}`);
      row.style.minHeight = `${NAV_LAYOUT.projectRow}px`;
      row.style.paddingLeft = `${NAV_LAYOUT.childIndent}px`;
      row.append(createElement("span", "sb-ofs-dot"), createElement("span", "sb-ofs-name", room.name || "未命名项目组"), createElement("span", "sb-ofs-side", room.id === activeRoomId ? "当前" : ""));
      const onClick = async (event) => {
        event.stopPropagation();
        if (switching || room.id === activeRoomId || !gateway) return;
        switching = true;
        const lifecycleToken = lifecycleRevision;
        const operationRevision = ++refreshRevision;
        try {
          await gateway.action("room.office.switch", { roomId: room.id });
          if (disposed || lifecycleToken !== lifecycleRevision || operationRevision !== refreshRevision) return;
          activeRoomId = room.id;
          render();
          if (!isNavigationRuntimeMounted(mountedDocument)) {
            mountedDocument.dispatchEvent(new CustomEventClass(NAV_EVENT, { detail: { mode: "office", active: true } }));
          }
          // 触发原生办公室行导航（重新打开办公室即按新会话渲染）
          findOfficeRow(mountedDocument)?.click();
        } finally {
          switching = false;
        }
      };
      row.addEventListener("click", onClick);
      boxCleanups.get(box).push(() => row.removeEventListener("click", onClick));
      box.appendChild(row);
    }
  }

  function ensureInjected() {
    if (disposed) return false;
    const officeRow = findOfficeRow(mountedDocument);
    if (!officeRow) return false;
    if (!box || !box.isConnected) {
      box = createElement("div");
      box.id = BOX_ID;
      box.setAttribute("translate", "no"); // 防自动翻译改写注入内容
      box.classList.add("notranslate");
      boxCleanups.set(box, []);
      lastSignature = null;
      officeRow.insertAdjacentElement("afterend", box);
      render();
    }
    return true;
  }

  const observer = new MutationObserverClass(() => {
    if (!box?.isConnected) {
      const previousBox = box;
      box = null;
      lifecycleRevision += 1;
      releaseBox(previousBox);
      ensureInjected();
    }
  });
  observer.observe(mountedDocument.body, { childList: true, subtree: true });
  ensureInjected();

  const pollTimer = mountedWindow.setInterval(async () => {
    await refreshData();
    ensureInjected();
    render();
  }, 3000);
  refreshData().then(() => {
    ensureInjected();
    render();
  });

  // ── 办公室顶部：项目组名作为主标题，原标题降级为小字（位置互换）──
  // 不改写原生文本节点（会被 React 重渲染 / Chrome 自动翻译改回去）：
  // 用 CSS 把原生标题文字设为不可见（font-size:0），再注入我们自己的标题节点。
  const OFFICE_TITLE_TEXTS = new Set([BRAND.office, "SaleBuddy办公室", "Marvis办公室", "办公室加载中"]);
  let lastNativeTitle = BRAND.office;
  let nameNode = null;
  let badgeNode = null;
  let lastNameText = null;
  let lastBadgeText = null;
  const titleGenerations = new Map();

  function activeRoomName() {
    return rooms.find((room) => room.id === activeRoomId)?.name || null;
  }

  function releaseTitleGenerations() {
    for (const { name, badge } of titleGenerations.values()) {
      name.remove();
      badge.remove();
    }
    titleGenerations.clear();
    nameNode = null;
    badgeNode = null;
    lastNameText = null;
    lastBadgeText = null;
  }

  function sweepTitle() {
    const title = mountedDocument.querySelector('.office-dashboard [class*="_pageTitleText_"]');
    if (!title) {
      releaseTitleGenerations();
      return;
    }
    if (nameNode?.parentElement !== title || badgeNode?.parentElement !== title) releaseTitleGenerations();
    // 记录原标题文字（被 font 包裹或还原时都能识别；识别不到就沿用上次的）
    if (!nameNode?.isConnected) {
      for (const node of title.querySelectorAll("*")) {
        const text = node.textContent?.trim();
        if (OFFICE_TITLE_TEXTS.has(text)) { lastNativeTitle = text; break; }
      }
      for (const child of title.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && OFFICE_TITLE_TEXTS.has(child.textContent.trim())) {
          lastNativeTitle = child.textContent.trim();
          break;
        }
      }
    }
    const name = activeRoomName();
    if (!nameNode?.isConnected) {
      nameNode = createElement("span", "sb-office-title-name notranslate");
      nameNode.dataset.sbOfficeTitle = "1";
      nameNode.setAttribute("translate", "no"); // 防止 Chrome 自动翻译改写，避免翻译↔回写死循环（标题抽搐）
      lastNameText = null;
      title.appendChild(nameNode);
    }
    const nameText = name || lastNativeTitle;
    // 不与 textContent 比较（翻译可能已改写它），只跟踪我们自己写入的值
    if (lastNameText !== nameText) {
      nameNode.textContent = nameText;
      lastNameText = nameText;
    }
    if (!badgeNode?.isConnected) {
      badgeNode = createElement("span", "sb-office-room-badge notranslate");
      badgeNode.dataset.sbOfficeRoom = "1";
      badgeNode.setAttribute("translate", "no");
      lastBadgeText = null;
      title.appendChild(badgeNode);
    }
    titleGenerations.set(title, { name: nameNode, badge: badgeNode });
    const label = `· ${lastNativeTitle}`;
    if (lastBadgeText !== label) {
      badgeNode.textContent = label;
      lastBadgeText = label;
    }
  }
  const badgeTimer = mountedWindow.setInterval(sweepTitle, 800);

  return {
    unmount() {
      if (disposed) return;
      disposed = true;
      lifecycleRevision += 1;
      refreshRevision += 1;
      mountedWindow.clearInterval(pollTimer);
      mountedWindow.clearInterval(badgeTimer);
      observer.disconnect();
      for (const ownedBox of [...boxCleanups.keys()]) releaseBox(ownedBox);
      box = null;
      releaseTitleGenerations();
      styleTag.remove();
    }
  };
}
