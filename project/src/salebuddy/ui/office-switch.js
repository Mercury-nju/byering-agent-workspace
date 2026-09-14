/**
 * ui/office-switch.js
 * 办公室 × 项目组：每个办公室对应一个项目组。
 * 在原生侧边栏「办公室」行下方注入项目组切换列表（QQ 分组式），
 * 点击某个项目组 → room.office.switch 切换办公室会话 → 触发原生办公室行导航。
 * 激活的项目组带绿点高亮。办公室自身逻辑/视觉/代码零改动，纯外层注入。
 */
import { NAV_EVENT, NAV_LAYOUT, isNavigationRuntimeMounted } from "./nav-framework.js";

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
/* The office scene does not need a separate brand title. */
.office-dashboard [class*="_pageTitleText_"]{display:none !important}
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

  return {
    unmount() {
      if (disposed) return;
      disposed = true;
      lifecycleRevision += 1;
      refreshRevision += 1;
      mountedWindow.clearInterval(pollTimer);
      observer.disconnect();
      for (const ownedBox of [...boxCleanups.keys()]) releaseBox(ownedBox);
      box = null;
      styleTag.remove();
    }
  };
}
