import { listWorks, subscribeWork } from "../agents/work-live.js";
import { createOfficeStatusStore } from "../bridge/office-status.js";
import { officeWorkState } from "./office-workspace-state.js";
import { createOfficeSceneState } from "./office-scene-state.js";
import {
  getMarketplaceAgent,
  listActivatedMarketplaceAgents,
  sortMarketplaceAgentsForDisplay
} from "../agents/marketplace.js";
import { createOfficeWorkspace } from "./office-workspace.js";
import { findOfficeRightPanel, isUsableOfficeRightPanel } from "./agent-drawer.js";
import { createOfficeSlotBindings, projectOfficeCharacters, hitOfficeCharacter } from "./office-character-binding.js";

export const OFFICE_AGENT_SLOTS = Object.freeze([
  Object.freeze({ id: "main", nativeType: "main" }),
  Object.freeze({ id: "app", nativeType: "App Agent" }),
  Object.freeze({ id: "computer", nativeType: "Computer Agent" }),
  Object.freeze({ id: "browser", nativeType: "Browser Agent" }),
  Object.freeze({ id: "file", nativeType: "File Agent" }),
  Object.freeze({ id: "search", nativeType: "Search Agent" })
]);

const STYLE_ID = "salebuddy-office-agent-runtime-style";
const LAYER_ID = "salebuddy-office-agent-layer";

const CSS = `
.office-dashboard [class*="_pageTitleText_"]{display:none !important}
[data-sb-office-scene-host="1"]{position:relative!important}
#${LAYER_ID}{position:absolute;inset:0;z-index:8;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
#${LAYER_ID} .sb-office-agent-seat{position:absolute;transform:translate(-50%,-100%);max-width:176px;min-height:28px;box-sizing:border-box;display:flex;align-items:center;gap:7px;padding:4px 10px;border:1px solid rgba(28,31,36,.12);border-radius:6px;background:#fff;box-shadow:0 4px 14px rgba(25,28,33,.08);color:#20242a;pointer-events:auto;cursor:pointer;font:inherit;text-align:left;white-space:nowrap}
#${LAYER_ID} .sb-office-agent-seat[hidden]{display:none}
#${LAYER_ID} .sb-office-agent-seat::after{content:"";position:absolute;left:50%;bottom:-5px;width:8px;height:8px;background:#fff;border-right:1px solid rgba(28,31,36,.12);border-bottom:1px solid rgba(28,31,36,.12);transform:translateX(-50%) rotate(45deg)}
#${LAYER_ID} .sb-office-agent-seat:hover{border-color:rgba(28,31,36,.28);box-shadow:0 6px 18px rgba(25,28,33,.12)}
#${LAYER_ID} .sb-office-agent-seat:focus-visible{outline:2px solid rgba(48,99,219,.38);outline-offset:2px}
#${LAYER_ID} .sb-office-agent-avatar{width:22px;height:22px;flex:none;display:grid;place-items:center;overflow:hidden;border-radius:6px;background:#f0f2f5;color:#555b65;font-size:11px;font-weight:700}
#${LAYER_ID} .sb-office-agent-avatar img{width:100%;height:100%;display:block;object-fit:cover}
#${LAYER_ID} .sb-office-agent-avatar.sb-grok-avatar{overflow:visible;border-radius:0;background:transparent}
#${LAYER_ID} .sb-office-agent-avatar .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
#${LAYER_ID} .sb-office-agent-copy{min-width:0;display:flex;align-items:center;gap:6px}
#${LAYER_ID} .sb-office-agent-name{min-width:0;max-width:118px;overflow:hidden;text-overflow:ellipsis;font-size:11px;font-weight:650;line-height:20px}
#${LAYER_ID} .sb-office-agent-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#b8bdc5}
#${LAYER_ID} .sb-office-agent-seat[data-state="working"] .sb-office-agent-dot{background:#2eb66d;box-shadow:0 0 0 3px rgba(46,182,109,.12)}
#${LAYER_ID} .sb-office-agent-seat[data-state="blocked"] .sb-office-agent-dot{background:#e05252;box-shadow:0 0 0 3px rgba(224,82,82,.12)}
#${LAYER_ID} .sb-office-agent-seat[data-state="done"] .sb-office-agent-dot{background:#3f7ee8}
#${LAYER_ID} .sb-office-agent-seat[data-state="listening"] .sb-office-agent-dot{background:#3f7ee8}
#${LAYER_ID} .sb-office-agent-seat[data-state="paused"] .sb-office-agent-dot{background:#ba852d}
#${LAYER_ID} .sb-office-agent-seat[data-state="unknown"] .sb-office-agent-dot{background:#969da5}
#${LAYER_ID} .sb-office-agent-copy{display:grid;grid-template-columns:6px minmax(0,1fr);column-gap:6px;row-gap:0}
#${LAYER_ID} .sb-office-agent-state{grid-column:2;font-size:10px;line-height:14px;font-weight:400;color:#78818a;white-space:normal}
#${LAYER_ID} .sb-office-areas{position:absolute;top:8px;left:50%;right:auto;max-width:calc(100% - 24px);display:flex;gap:6px;flex-wrap:wrap;transform:translateX(-50%);pointer-events:auto}
#${LAYER_ID} .sb-office-area{min-width:88px;min-height:30px;padding:5px 9px;border:1px solid #dfe3e6;border-radius:6px;background:#fff;color:#68727c;font:inherit;font-size:11px;text-align:center;white-space:nowrap;cursor:pointer}
#${LAYER_ID} .sb-office-area[aria-selected="true"]{background:#292e34;color:#fff;border-color:#292e34}
@media(max-width:980px){#${LAYER_ID} .sb-office-agent-seat{max-width:132px}#${LAYER_ID} .sb-office-agent-name{max-width:78px}}
`;

function normalizedStatus(work) {
  const kind = officeWorkState(work).kind;
  return kind === "attention" ? "blocked" : kind;
}

function stateLabel(state) {
  if (state === "working") return "执行中";
  if (state === "blocked") return "账号已掉线";
  if (state === "done") return "刚完成";
  if (state === "listening") return "监听中";
  if (state === "paused") return "已暂停";
  if (state === "unknown") return "暂未获取状态";
  return "空闲中";
}

function agentIdentity(agentId, { teamLive, work = null } = {}) {
  const profile = teamLive?.getProfiles?.().get(agentId);
  const marketplace = getMarketplaceAgent(agentId);
  const liveStatus = teamLive?.getStatusOf?.(agentId) || null;
  const state = normalizedStatus(work, liveStatus);
  const fallbackName = agentId === "main" ? "Byering · 幕僚长" : marketplace?.displayName || marketplace?.name || agentId;
  const profileName = String(profile?.identity?.name || "").trim();
  const name = marketplace?.displayName || marketplace?.name || (profileName && profileName !== agentId ? profileName : fallbackName);
  const task = work?.task || work?.phase || liveStatus?.currentTask || (agentId === "main" ? "协调当前团队任务" : marketplace?.displayTitle || marketplace?.title || "等待任务");
  return {
    id: agentId,
    name,
    task,
    state,
    stateLabel: state === "unknown" ? officeWorkState(work).shortLabel : stateLabel(state),
    startedAt: Number(work?.startedAt) || 0
  };
}

export function listActivatedOfficeAgents() {
  return listActivatedMarketplaceAgents();
}

/** Build a current-team snapshot without leaking legacy office role names. */
export function buildOfficeAgentRoster({ activatedAgents = [], works = [], teamLive = null, maxSeats = OFFICE_AGENT_SLOTS.length } = {}) {
  const workByAgent = new Map((works || []).map((work) => [work.agentType, work]));
  const visibleAgents = sortMarketplaceAgentsForDisplay((activatedAgents || []).filter((agent) => {
    const id = String(agent?.id || agent?.agentType || "").trim();
    return Boolean(id && id !== "main");
  }));
  const roster = visibleAgents.map((agent) => {
    const id = String(agent?.id || agent?.agentType || "").trim();
    return agentIdentity(id, { teamLive, work: workByAgent.get(id) });
  });
  const seatCount = Math.max(1, Number(maxSeats) || OFFICE_AGENT_SLOTS.length);
  return {
    seated: roster.slice(0, seatCount),
    overflow: roster.slice(seatCount),
    roster,
    activeCount: roster.filter((agent) => agent.state === "working").length
  };
}


function agentButton(agent, className, onOpenAgent) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.agentId = agent.id;
  button.dataset.state = agent.state;
  button.title = `${agent.name} · ${agent.stateLabel}\n${agent.task}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenAgent?.(agent.id);
  });
  return button;
}

function renderSeatLayer(host, bindings, onOpenAgent, onPage) {
  let layer = host.querySelector(`#${LAYER_ID}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.setAttribute("aria-label", "当前 Agent 办公席位");
    host.appendChild(layer);
  }
  layer.textContent = "";
  if (bindings.pageCount > 1) {
    const areas = document.createElement("nav"); areas.className = "sb-office-areas";
    areas.setAttribute("aria-label", "切换办公区"); areas.setAttribute("role", "tablist");
    for (let page = 0; page < bindings.pageCount; page++) {
      const button = document.createElement("button"); button.type = "button"; button.className = "sb-office-area";
      button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(page === bindings.page));
      button.textContent = `办公区 ${page + 1}`;
      button.addEventListener("click", event => { event.stopPropagation(); onPage(page); }); areas.appendChild(button);
    }
    layer.appendChild(areas);
  }
  OFFICE_AGENT_SLOTS.forEach((_slot, index) => {
    const agent = bindings.at(index);
    if (!agent) return;
    const button = agentButton(agent, "sb-office-agent-seat", onOpenAgent);
    button.dataset.slotIndex = String(index);
    button.hidden = true;
    const copy = document.createElement("span");
    copy.className = "sb-office-agent-copy";
    const dot = document.createElement("i");
    dot.className = "sb-office-agent-dot";
    const name = document.createElement("span");
    name.className = "sb-office-agent-name";
    name.textContent = agent.name;
    copy.append(dot, name);
    const status = document.createElement("span"); status.className = "sb-office-agent-state"; status.textContent = agent.stateLabel;
    copy.appendChild(status);
    button.appendChild(copy);
    layer.appendChild(button);
  });
}


function syncNativeAgentSummary(dashboard, snapshot) {
  const summary = [...dashboard.querySelectorAll("*")].find((node) => {
    if (node.children.length) return false;
    return /^\d+\s*位数字员工已就绪$/.test(String(node.textContent || "").trim());
  });
  if (summary) summary.textContent = `${snapshot.roster.length} 位 Agent 已就绪`;
}

export function mountOfficeAgentRuntime({ teamLive = null, gateway = null, onConfigure = null, onOpenResult = null, onAnalyze = null, onOpenWork = null, getActivatedAgents = listActivatedOfficeAgents, getWorks = listWorks, getGame = () => globalThis.__gameOffice } = {}) {
  if (typeof document === "undefined") return { refresh() {}, unmount() {} };
  let disposed = false;
  let signature = "";
  let sceneHost = null;
  let panelHost = null;
  let ownedCanvas = null;
  let animationFrame = null;
  let selectedId = null;
  const bindings = createOfficeSlotBindings(OFFICE_AGENT_SLOTS.length);
  const statusStore = createOfficeStatusStore({ getLocalWorks: getWorks, getAgentIds: () => getActivatedAgents().map(agent => agent.id) });
  const sceneState = createOfficeSceneState();
  const workspace = createOfficeWorkspace({ teamLive, gateway, onConfigure, onOpenResult, onAnalyze, onOpenWork,
    getWorks: statusStore.getWorks, getWork: statusStore.getWork, onRetryStatus: () => statusStore.refresh() });
  const onOpenAgent = agentId => {
    selectedId = agentId;
    const page = bindings.pageOf(agentId);
    if (page >= 0) bindings.setPage(page);
    workspace.select(agentId); signature = ""; refresh();
  };

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function refresh() {
    if (disposed) return;
    const dashboard = document.querySelector(".office-dashboard");
    const canvas = dashboard?.querySelector("canvas");
    const nextSceneHost = canvas?.parentElement || null;
    const candidatePanel = dashboard ? findOfficeRightPanel(document) : null;
    const nextPanelHost = isUsableOfficeRightPanel(candidatePanel) ? candidatePanel : null;
    if (!dashboard || !nextSceneHost) return;
    if (sceneHost !== nextSceneHost) {
      sceneHost?.removeAttribute?.("data-sb-office-scene-host");
      sceneHost = nextSceneHost;
      sceneHost.dataset.sbOfficeSceneHost = "1";
      signature = "";
    }
    if (panelHost !== nextPanelHost) {
      panelHost = nextPanelHost;
      signature = "";
    }
    if (panelHost) workspace.mount(panelHost);
    const snapshot = buildOfficeAgentRoster({ activatedAgents: getActivatedAgents(), works: statusStore.getWorks(), teamLive });
    bindings.update(snapshot.roster, { selectedId });
    workspace.refresh();
    const nextSignature = snapshot.roster.map((agent) => [agent.id, agent.name, agent.task, agent.state, agent.stateLabel].join(":"))
      .concat(`scene:${Boolean(sceneHost.querySelector(`#${LAYER_ID}`))}`, `area:${bindings.page}:${bindings.pageCount}`)
      .join("|");
    syncNativeAgentSummary(dashboard, snapshot);
    if (signature === nextSignature) return;
    signature = nextSignature;
    renderSeatLayer(sceneHost, bindings, onOpenAgent, page => { bindings.setPage(page); signature = ""; refresh(); });
  }

  function positionLabels() {
    if (disposed) return;
    const game = getGame();
    const canvas = game?.app?.canvas;
    const layer = sceneHost?.querySelector(`#${LAYER_ID}`);
    if (canvas && layer && sceneHost.contains(canvas)) {
      sceneState.sync(game, bindings);
      if (ownedCanvas !== canvas) {
        ownedCanvas?.removeAttribute("data-sb-office-identity-owned");
        ownedCanvas = canvas;
        canvas.dataset.sbOfficeIdentityOwned = "1";
      }
      const projected = projectOfficeCharacters(game, bindings, sceneHost.getBoundingClientRect());
      const bySlot = new Map(projected.map(item => [String(item.slotIndex), item]));
      layer.querySelectorAll(".sb-office-agent-seat").forEach(button => {
        const item = bySlot.get(button.dataset.slotIndex);
        if (!item) { if (!button.hidden) button.hidden = true; return; }
        if (button.hidden) button.hidden = false;
        const left = `${item.left.toFixed(1)}px`, top = `${item.top.toFixed(1)}px`;
        if (button.style.left !== left) button.style.left = left;
        if (button.style.top !== top) button.style.top = top;
      });
    } else if (ownedCanvas) {
      sceneState.dispose();
      ownedCanvas.removeAttribute("data-sb-office-identity-owned");
      ownedCanvas = null;
    }
    animationFrame = globalThis.requestAnimationFrame?.(positionLabels);
  }

  function onCanvasPointer(event) {
    const game = getGame();
    if (!ownedCanvas || event.target !== ownedCanvas || !sceneHost?.isConnected) return;
    const agent = hitOfficeCharacter(game, bindings, event.clientX, event.clientY);
    if (!agent) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    if (event.type === "pointerdown") onOpenAgent?.(agent.id);
  }

  const observer = typeof MutationObserver === "function" ? new MutationObserver(refresh) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  const unsubscribeWork = subscribeWork(() => { refresh(); void statusStore.refresh(); });
  const unsubscribeStatus = statusStore.subscribe(refresh);
  const unsubscribeTeam = teamLive?.subscribe?.(refresh) || (() => {});
  const timer = globalThis.setInterval?.(() => { refresh(); if (!document.hidden) void statusStore.refresh(); }, 3000);
  const onVisibility = () => { refresh(); if (!document.hidden) void statusStore.refresh(); };
  document.addEventListener("visibilitychange", onVisibility);
  void statusStore.refresh();
  refresh();
  positionLabels();
  for (const event of ["pointerdown", "pointerup", "click"]) globalThis.addEventListener?.(event, onCanvasPointer, true);

  return {
    refresh,
    select: onOpenAgent,
    setGateway: value => workspace.setGateway(value),
    unmount() {
      if (disposed) return;
      disposed = true;
      workspace.unmount();
      sceneState.dispose();
      statusStore.dispose();
      unsubscribeStatus();
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      unsubscribeWork();
      unsubscribeTeam();
      if (timer != null) globalThis.clearInterval?.(timer);
      if (animationFrame != null) globalThis.cancelAnimationFrame?.(animationFrame);
      for (const event of ["pointerdown", "pointerup", "click"]) globalThis.removeEventListener?.(event, onCanvasPointer, true);
      ownedCanvas?.removeAttribute("data-sb-office-identity-owned");
      sceneHost?.removeAttribute?.("data-sb-office-scene-host");
      document.querySelectorAll(`#${LAYER_ID}`).forEach((node) => node.remove());
      style?.remove();
    }
  };
}
