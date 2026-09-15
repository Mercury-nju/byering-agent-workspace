import { el, getCurrentPage } from "./pages.js";
import { getMarketplaceAgent } from "../agents/marketplace.js";
import { getWork as readWork, listWorks, subscribeWork } from "../agents/work-live.js";
import { listAgentActivity } from "../agents/agent-activity-journal.js";
import { mergeAgentConversationMessages } from "./contacts-page.js";
import { douyinCloudViewerUrlFor } from "./realtime-work.js";
import { mountGrokBotAvatar } from "./grok-bot-avatar.js";
import { prospectStore } from "./prospect-store.js";
import { buildAccountAnalysisResumeFlow } from "../agents/account-analysis-contract.js";
import { OFFICE_START_ACTIONS, officeWorkState, selectOfficeWork, latestOfficeResult, partitionOfficeMessages } from "./office-workspace-state.js";
import { officeWorkspaceHeight } from "./office-workspace-layout.js";
import createIcon from "../../../node_modules/lucide/dist/esm/createElement.mjs";
import ArrowUp from "../../../node_modules/lucide/dist/esm/icons/arrow-up.mjs";
import Settings from "../../../node_modules/lucide/dist/esm/icons/settings.mjs";
import HeartHandshake from "../../../node_modules/lucide/dist/esm/icons/heart-handshake.mjs";
import { appendCompanionCards, mountCompanionStatus, openCompanionPreferences } from "./agent-companion-ui.js";
import { companionRequest, companionCardAction, latestCompanionPhase } from "../bridge/companion-client.js";
import { listOfficeReplay, loadOfficeReplayImage, loadOfficeReplayVideo, markOfficeReplayTask, saveOfficeReplaySnapshot, saveOfficeReplayVideo } from "../bridge/office-work-replay.js";

const CLOUD_AGENTS = new Set(["mkt-comment-acquisition", "mkt-find-people", "mkt-cold-writer", "mkt-dm-inbox", "mkt-gold-customer-service", "mkt-live-danmaku-outreach"]);
const ID = "sb-office-workspace";
const REPLAY_WINDOW_MS = 15_000;
const REPLAY_SAMPLE_MS = 3_000;
const REPLAY_FRAME_LIMIT = Math.ceil(REPLAY_WINDOW_MS / REPLAY_SAMPLE_MS);
const REPLAY_SEGMENT_MS = 5_000;
const REPLAY_SEGMENT_LIMIT = Math.ceil(REPLAY_WINDOW_MS / REPLAY_SEGMENT_MS);

function isSuccessfulReplayWork(work) {
  if (!work || work.lastError || work.metadata?.error) return false;
  const metadata = work.metadata || {};
  const snapshot = metadata.acquisitionSnapshot || {};
  const state = String(snapshot.taskState || snapshot.state || metadata.taskState || metadata.acquisitionTaskState || work.taskState || work.state || "").toLowerCase();
  if (["failed", "error", "cancelled", "canceled", "stopped", "degraded", "blocked"].includes(state)) return false;
  if (/(取消|失败|异常|错误|掉线|中断)/.test(String(work.artifact || work.phase || work.statusText || ""))) return false;
  return ["done", "completed", "succeeded"].includes(state) || String(work.status || "").toLowerCase() === "succeeded";
}

const CSS = `
.sb-office-workspace-host{--sb-office-workspace-radius:16px;position:relative!important;overflow:hidden!important;min-height:0!important;height:var(--sb-office-workspace-height,calc(100dvh - 110px))!important;max-height:var(--sb-office-workspace-height,calc(100dvh - 110px))!important;align-self:flex-start;box-sizing:border-box;border-radius:16px!important}
.sb-office-workspace-host>:not(#${ID}){display:none!important}
#${ID}{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,2fr) minmax(0,3fr);border-radius:16px;overflow:hidden;min-width:0;min-height:0;background:#fff;color:#292e34;font-family:-apple-system,"PingFang SC",sans-serif;z-index:10;letter-spacing:0}
#${ID} *{box-sizing:border-box}
#${ID}[data-mode="home"]{grid-template-rows:minmax(0,1fr)}
#${ID}[data-mode="chat"]{grid-template-rows:auto minmax(0,1fr)}
#${ID}[data-mode="work"][data-view="live"]{grid-template-rows:auto minmax(0,2fr) minmax(0,3fr)}
#${ID}[data-view="compact"]{grid-template-rows:auto auto minmax(0,1fr)}
#${ID}[data-view="compact"] .sb-ow-work{max-height:170px;overflow:auto}
#${ID}[data-view="compact"] .sb-ow-task{height:auto;padding:12px 16px;gap:6px}
.sb-ow-start{min-height:0;overflow-y:auto;padding:26px 22px;align-self:stretch}
.sb-ow-start h2{font-size:22px;line-height:1.4;font-weight:650;margin:0 0 22px;color:#292e34}
.sb-ow-start p{font-size:13px;line-height:1.75;color:#707a83;margin:12px 0;overflow-wrap:anywhere}
.sb-ow-start-options{display:grid;gap:4px}
.sb-ow-start-option{display:flex;align-items:center;gap:12px;width:100%;padding:13px 10px;border:0;border-radius:10px;background:transparent;color:#30363b;text-align:left;cursor:pointer;font:inherit}
.sb-ow-start-option:hover{background:#f5f6f8}.sb-ow-start-option:focus-visible{outline:2px solid #5985ab;outline-offset:3px}
.sb-ow-start-avatar{width:38px;height:38px;flex:none}.sb-ow-start-copy{display:grid;gap:5px;min-width:0;flex:1}.sb-ow-start-copy strong{font-size:15px;font-weight:600}.sb-ow-start-copy small{font-size:12px;color:#7e888f}.sb-ow-start-arrow{font-size:20px;color:#8a949b}
.sb-ow-start button:disabled{opacity:.5;cursor:not-allowed}
.sb-ow-start-primary{height:42px;padding:0 17px;border:0;border-radius:8px;background:#292e34;color:#fff;font:inherit;font-size:14px;cursor:pointer;margin:8px 0 12px}
.sb-ow-recent{margin-top:28px;padding-top:0}.sb-ow-recent h3{margin:0 0 12px;font-size:12px;font-weight:500;color:#849097}.sb-ow-recent strong{font-size:15px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.sb-ow-recent time{display:block;margin-top:8px;font-size:11px;color:#89949b}
.sb-ow-recent-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.sb-ow-recent-actions button,.sb-ow-recovery{min-height:34px;padding:7px 11px;border:1px solid #dce2e6;border-radius:6px;background:white;color:#505b63;font:inherit;font-size:12px;cursor:pointer}.sb-ow-work-head{flex-wrap:wrap}.sb-ow-work-head .sb-ow-recovery{flex-basis:100%;text-align:left}
.sb-ow-work-start{display:grid;place-content:center;justify-items:center;gap:10px;width:100%;height:100%;padding:28px;border:1px solid #e0e6e9;border-radius:12px;background:#fafbfc;color:#44505a;text-align:center}.sb-ow-work-start-mark{width:10px;height:10px;border-radius:50%;background:#39b878;box-shadow:0 0 0 6px rgba(57,184,120,.12);animation:sb-ow-breathe 1.8s ease-in-out infinite}.sb-ow-work-start strong{font-size:15px;font-weight:650;color:#303940}.sb-ow-work-start p{max-width:260px;margin:0;color:#7b8790;font-size:12px;line-height:1.65}.sb-ow-replay{width:100%;margin:18px 0 4px;padding-top:16px}.sb-ow-replay-stage{position:relative;display:block;width:100%;aspect-ratio:4/3;overflow:hidden;border:1px solid #e2e7ea;border-radius:12px;background:#121725}.sb-ow-replay-stage img,.sb-ow-replay-stage video{display:block;width:100%;height:100%;object-fit:contain;background:#121725;transition:opacity .24s ease}.sb-ow-replay-empty{display:grid;place-items:center;width:100%;height:100%;padding:24px;color:#c0cad5;font-size:12px;text-align:center}.sb-ow-replay-overlay{position:absolute;inset:0;z-index:2;display:grid;place-items:center;padding:22px;background:rgba(17,21,34,.78);color:#f7f9fb;text-align:center;backdrop-filter:blur(2px)}.sb-ow-replay-overlay-card{display:grid;justify-items:center;gap:8px;max-width:320px}.sb-ow-replay-overlay-card span{font-size:11px;color:#bdc8d5}.sb-ow-replay-overlay-card strong{font-size:18px;font-weight:650;line-height:1.35}.sb-ow-replay-overlay-card p{margin:0;color:#d3dbe4;font-size:12px;line-height:1.65}.sb-ow-replay-overlay-card button{min-height:36px;margin-top:7px;padding:0 14px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#fff;color:#252c34;font:inherit;font-size:12px;cursor:pointer}.sb-ow-replay-overlay-card button:hover{background:#f2f5f8}.sb-ow-replay-overlay-card button:disabled{opacity:.55;cursor:not-allowed}.sb-ow-replay-overlay-card button:focus-visible{outline:2px solid #8ab5ff;outline-offset:3px}.sb-ow-capture-frame{position:fixed;left:-10000px;top:-10000px;width:880px;height:560px;border:0;opacity:0;pointer-events:none}@keyframes sb-ow-breathe{50%{transform:scale(.82);opacity:.68}}
.sb-ow-empty{display:grid;place-content:center;gap:8px;flex:1;grid-row:1/-1;text-align:center;padding:24px;font-size:14px;color:#78828c}.sb-ow-empty strong{color:#353d45;font-weight:550}
.sb-ow-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e7eaec;flex:none}.sb-ow-avatar{width:36px;height:36px;flex:none}.sb-ow-identity{min-width:0;flex:1}.sb-ow-name{font-size:15px;font-weight:650;overflow-wrap:anywhere}.sb-ow-status{font-size:12px;color:#7a848c;margin-top:4px}.sb-ow-tools{display:flex;gap:6px}
.sb-ow-icon{width:32px;height:32px;padding:0;display:grid;place-items:center;border:1px solid #e1e5e8;border-radius:6px;background:#fff;color:#5b6771;cursor:pointer;font-size:18px}.sb-ow-icon img{width:17px;height:17px}.sb-ow-icon:focus-visible{outline:2px solid #5985ab;outline-offset:2px}
.sb-ow-icon svg{width:17px;height:17px;flex:none}
.sb-ow-work{min-width:0;overflow:hidden;display:flex;flex-direction:column;min-height:0;border-bottom:1px solid #e4e8eb}.sb-ow-work-head{display:flex;justify-content:space-between;gap:8px;padding:8px 16px;flex:none;font-size:12px;color:#717f88}.sb-ow-screen{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:#f1f3f4}#${ID}[data-mode="work"][data-view="live"] .sb-ow-screen{flex:0 1 auto;width:100%;height:auto;max-height:100%;aspect-ratio:4/3;margin:auto 0}.sb-ow-screen iframe{display:block;flex:0 0 auto;border:0;width:100%;height:100%;max-width:100%;max-height:100%;aspect-ratio:auto}.sb-ow-screen:fullscreen{height:100vh;flex:none;background:#111;border-radius:0}.sb-ow-task{height:100%;padding:24px 18px;display:flex;flex-direction:column;justify-content:center;gap:12px;overflow:auto}.sb-ow-task strong{font-size:15px;font-weight:550;line-height:1.5}.sb-ow-task p{font-size:13px;line-height:1.6;margin:0;color:#707a83;overflow-wrap:anywhere}
.sb-ow-dialogue{min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;background:#fff}
.sb-ow-messages{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 18px 12px;display:flex;flex-direction:column;gap:16px;scrollbar-gutter:stable}
.sb-ow-message{display:flex;flex-shrink:0;flex-direction:column;gap:5px;max-width:94%;align-self:flex-start}.sb-ow-message.is-user{align-self:flex-end}
.sb-ow-message time{font-size:10px;line-height:1.4;color:#929ba2}.sb-ow-message.is-user time{text-align:right}
.sb-ow-bubble{border:0;border-radius:8px;background:transparent;padding:2px 0;color:#343d45;font-size:13px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}
.sb-ow-message.is-user .sb-ow-bubble{background:#f0f2f4;color:#303840;padding:9px 12px}
.sb-ow-message-empty{color:#89929b;font-size:13px;line-height:1.7;margin:auto 0;text-align:center;padding:24px 0}
.sb-ow-history{flex-shrink:0;color:#7b858f;font-size:12px}.sb-ow-history summary{cursor:pointer;padding:8px 0}.sb-ow-history-body{display:flex;flex-direction:column;gap:14px;padding:12px 0 18px;border-bottom:1px solid #eceff1}.sb-ow-history .sb-ow-bubble{color:#737e87;font-size:12px}
.sb-ow-error{flex:none;max-height:48px;overflow:auto;font-size:12px;color:#a74141;padding:0 16px;line-height:1.5}
.sb-ow-compose{display:flex;flex-shrink:0;align-items:flex-end;gap:8px;margin:10px 14px 16px;padding:10px;border:1px solid #dce1e5;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(25,35,45,.03)}
.sb-ow-compose:focus-within{border-color:#909ba5;box-shadow:0 0 0 2px rgba(90,107,123,.08)}
.sb-ow-compose textarea{flex:1;min-width:0;height:44px;min-height:44px;max-height:112px;resize:none;overflow-y:auto;border:0;outline:0;background:transparent;padding:10px 2px;font:inherit;font-size:13px;line-height:1.7;color:#343d45}
.sb-ow-compose textarea::placeholder{color:#929aa2}.sb-ow-compose button{width:36px;height:36px;margin-bottom:3px;flex:none;display:grid;place-items:center;border:0;border-radius:8px;background:#292d32;color:#fff;cursor:pointer}.sb-ow-compose button svg{width:20px;height:20px}.sb-ow-compose button:disabled{background:#e8ecef;color:#a1a9b0;cursor:default}.sb-ow-compose button[aria-busy="true"]{position:relative;color:transparent}.sb-ow-compose button[aria-busy="true"]::after{content:"";position:absolute;width:14px;height:14px;border:2px solid rgba(255,255,255,.42);border-top-color:#fff;border-radius:50%;animation:sb-ow-spin .7s linear infinite}.sb-ow-error{flex:none;min-height:0;max-height:48px;overflow:auto;font-size:12px;color:#8b9299;padding:0 16px;line-height:1.5;transition:color .18s ease}.sb-ow-error:empty{display:none}.sb-ow-error[data-state="error"]{color:#b04a4a}@keyframes sb-ow-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.sb-ow-compose button[aria-busy="true"]::after{animation:none}.sb-ow-error{transition:none}}
@media(max-height:700px){.sb-ow-head{padding:10px 12px}}
`;

export function officeConversationContext(agentId, work) {
  const metadata = work?.metadata || {};
  return { agentType: agentId,
    ...(metadata.taskId || work?.taskId ? { taskId: metadata.taskId || work.taskId } : {}),
    ...(metadata.taskRunId || work?.taskRunId ? { taskRunId: metadata.taskRunId || work.taskRunId } : {}),
    ...(metadata.accountId || work?.accountId ? { accountId: metadata.accountId || work.accountId } : {})
  };
}

/** Reuse the live VNC shell and durable DM channel; never mount demo drawer content. */
export function createOfficeWorkspace({ gateway = null, teamLive = null, onConfigure = null, onOpenResult = null, onAnalyze = null, onOpenWork = null, onRetryStatus = null, getWork = readWork, getWorks = listWorks, getResults = () => prospectStore.listRuns(), getActivity = listAgentActivity, viewerUrl = douyinCloudViewerUrlFor, mountAvatar = mountGrokBotAvatar, pollMs = 2500, isVisible = () => !document.hidden && !getCurrentPage() } = {}) {
  let host = null, root = null, selected = null, frame = null, generation = 0, disposed = false;
  let messages = null, input = null, sendButton = null, errorNode = null, statusNode = null, taskNode = null;
  let remote = [], sending = false, inFlight = null, messageSignature = "";
  let suspended = false;
  let manualSelection = false, layoutKey = "";
  const drafts = new Map();
  const historyExpanded = new Map(), acknowledged = new Map(), pendingSends = new Set();
  const replay = { loadedKey: "", loadingKey: "", snapshots: [], segments: [], captureSignature: "", recordingSignature: "", markedTasks: new Set(), captures: new Map(), recordings: new Map(), images: new Map(), videos: new Map(), imageLoads: new Set(), videoLoads: new Set(), imageNode: null, videoNode: null, playbackIndex: 0, playbackTimer: null };
  let companionStatus = null, companionStatusKey = "", viewerConnectionStatus = "", disposeCompanionStatus = () => {};
  const cardDisposers = [];
  const displayedMessages = new Set();
  const icon = node => createIcon(node, { "aria-hidden": "true", focusable: "false" });
  let style = document.getElementById(`${ID}-style`);
  if (!style) { style = el("style"); style.id = `${ID}-style`; style.textContent = CSS; document.head.appendChild(style); }

  function releaseFrame() {
    replay.captures.clear(); replay.recordings.clear(); replay.recordingSignature = ""; viewerConnectionStatus = "";
    if (frame) { frame.src = "about:blank"; frame.remove(); frame = null; }
  }
  function clearReplayPlayback() {
    if (replay.playbackTimer != null) globalThis.clearInterval?.(replay.playbackTimer);
    replay.playbackTimer = null;
    replay.imageNode = null;
    replay.videoNode = null;
    replay.playbackIndex = 0;
  }
  function requestViewerStatus() {
    if (!frame?.contentWindow || !selected || !CLOUD_AGENTS.has(selected)) return;
    frame.contentWindow.postMessage({ type: "byering-cloud-viewer-status-request", agentId: selected }, globalThis.location?.origin || "*");
  }
  function clearReplayImages() {
    replay.images.forEach((url) => { try { globalThis.URL?.revokeObjectURL?.(url); } catch {} });
    replay.images.clear(); replay.imageLoads.clear();
    replay.videos.forEach((url) => { try { globalThis.URL?.revokeObjectURL?.(url); } catch {} });
    replay.videos.clear(); replay.videoLoads.clear();
  }
  function syncHeight() {
    const rect = host?.getBoundingClientRect?.();
    const viewport = globalThis.visualViewport;
    if (!rect?.width) return;
    let clipBottom = Infinity;
    for (let node = host.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflow = globalThis.getComputedStyle?.(node)?.overflowY;
      const bounds = node.getBoundingClientRect?.();
      if (bounds?.height && /hidden|clip|auto|scroll/.test(overflow || "")) clipBottom = Math.min(clipBottom, bounds.bottom);
    }
    const height = officeWorkspaceHeight({ top: rect.top, width: rect.width, layoutWidth: host.offsetWidth,
      viewportHeight: viewport?.height || globalThis.innerHeight, viewportTop: viewport?.offsetTop || 0, clipBottom });
    if (height === null) return;
    const value = `${height}px`;
    if (host.style.getPropertyValue?.("--sb-office-workspace-height") !== value) host.style.setProperty?.("--sb-office-workspace-height", value);
  }
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(syncHeight) : null;
  function releaseHost() {
    resizeObserver?.disconnect(); host?.classList.remove("sb-office-workspace-host"); host?.style.removeProperty?.("--sb-office-workspace-height");
  }
  function mount(nextHost) {
    if (disposed || !nextHost || (host === nextHost && root?.isConnected)) return;
    if (selected && input) drafts.set(selected, input.value);
    generation++; inFlight = null; releaseFrame(); root?.remove(); releaseHost();
    host = nextHost; host.classList.add("sb-office-workspace-host");
    syncHeight(); resizeObserver?.observe(host); if (host.parentElement) resizeObserver?.observe(host.parentElement);
    root = el("section"); root.id = ID; root.setAttribute("aria-label", "选中 Agent 的工作与对话"); host.appendChild(root);
    if (!manualSelection) selected = selectOfficeWork(getWorks(), selected);
    build();
  }
  function select(agentId) {
    if (disposed || !getMarketplaceAgent(agentId)) return;
    manualSelection = true;
    if (selected === agentId) { refresh(); return; }
    if (selected && input) drafts.set(selected, input.value);
    generation++; inFlight = null; remote = []; sending = false; messageSignature = ""; replay.captureSignature = ""; clearReplayImages(); selected = agentId;
    releaseFrame(); build();
  }
  function build() {
    if (!root) return;
    const focused = input && document.activeElement === input;
    const selection = focused ? [input.selectionStart, input.selectionEnd] : null;
    releaseFrame();
    clearReplayPlayback();
    disposeCompanionStatus(); cardDisposers.splice(0).forEach(dispose => dispose()); companionStatusKey = "";
    root.textContent = ""; input = null; messages = null; taskNode = null; messageSignature = "";
    const selectedWork = selected ? getWork(selected) : null;
    const state = officeWorkState(selectedWork);
    const displayState = officeDisplayState(state);
    const liveWork = state.kind === "working";
    const usesCloudWorkspace = CLOUD_AGENTS.has(selected);
    const showLiveWorkspace = liveWork && usesCloudWorkspace;
    layoutKey = viewKey(displayState);
    root.dataset.mode = selected ? showLiveWorkspace ? "work" : "chat" : "home";
    root.dataset.view = showLiveWorkspace ? "live" : "chat";
    root.dataset.officeState = selected ? state.kind : "";
    if (!selected) { buildHome(); return; }
    const agent = getMarketplaceAgent(selected);
    root.dataset.agentId = selected;
    const head = el("header", "sb-ow-head"), avatar = el("span", "sb-ow-avatar"), identity = el("div", "sb-ow-identity");
    mountAvatar(avatar, selected, { alt: agent.name, trackPointer: false, mode: "office-workspace" });
    statusNode = el("div", "sb-ow-status", displayState.shortLabel || displayState.label); identity.append(el("div", "sb-ow-name", agent.name), statusNode);
    const tools = el("div", "sb-ow-tools");
    const configure = el("button", "sb-ow-icon"); configure.type = "button"; configure.title = "调整任务"; configure.setAttribute("aria-label", "调整任务");
    configure.appendChild(icon(Settings));
    configure.disabled = !onConfigure; configure.addEventListener("click", () => onConfigure?.(selected)); tools.appendChild(configure);
    const preferences = el("button", "sb-ow-icon"); preferences.type = "button"; preferences.title = "相处方式与记忆"; preferences.setAttribute("aria-label", "相处方式与记忆");
    preferences.appendChild(icon(HeartHandshake)); preferences.addEventListener("click", () => openCompanionPreferences({ agentId: selected, request: companionRequest })); tools.appendChild(preferences);
    head.append(avatar, identity, tools); root.appendChild(head);
    if (showLiveWorkspace) {
      const usesCloud = true;
      const work = el("section", "sb-ow-work"), screen = el("div", "sb-ow-screen");
      const workHead = usesCloud ? null : el("div", "sb-ow-work-head");
      if (!usesCloud) workHead.appendChild(el("strong", null, "工作动态"));
      const url = viewerUrl(selected);
      if (url) {
        frame = document.createElement("iframe"); frame.className = "sb-ow-capture-frame"; frame.src = url; frame.title = `${agent.name}的工作画面采集`; frame.allow = "clipboard-read; clipboard-write"; frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1;
        frame.addEventListener("load", () => { requestViewerStatus(); globalThis.setTimeout?.(requestViewerStatus, 500); });
        root.appendChild(frame);
        appendReplay(screen, { emptyText: "暂无成功工作的录屏" });
        void ensureReplay(selected, state, selectedWork);
      }
      else screen.appendChild(el("div", "sb-ow-empty", "工作画面暂时无法准备"));
      if (workHead) work.append(workHead);
      work.append(screen);
      root.appendChild(work);
    }
    const dialogue = el("section", "sb-ow-dialogue"); dialogue.setAttribute("aria-label", `与${agent.name}对话`);
    messages = el("div", "sb-ow-messages"); messages.setAttribute("role", "log"); messages.setAttribute("aria-live", "polite");
    errorNode = el("div", "sb-ow-error"); errorNode.setAttribute("role", "status");
    const compose = el("div", "sb-ow-compose"); input = document.createElement("textarea"); input.rows = 1; input.value = drafts.get(selected) || "";
    input.placeholder = selected === "mkt-intent-analyst" ? "说说你想分析哪些候选人，或选择成果中的名单" : "发消息…"; input.setAttribute("aria-label", `发消息给${agent.name}`);
    sendButton = el("button"); sendButton.appendChild(icon(ArrowUp)); sendButton.type = "button"; sendButton.title = "发送消息"; sendButton.setAttribute("aria-label", "发送消息");
    input.addEventListener("input", () => { drafts.set(selected, input.value); updateComposer(); });
    sendButton.addEventListener("click", send);
    input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); } });
    companionStatus = el("div"); companionStatus.style.padding = "0 16px";
    compose.append(input, sendButton); dialogue.append(messages, companionStatus, errorNode, compose); root.appendChild(dialogue); updateComposer(); refresh();
    if (focused && input) { input.focus?.({ preventScroll: true }); input.setSelectionRange?.(...selection); }
  }
  function updateComposer() {
    if (!input || !sendButton) return;
    input.style.height = "44px";
    input.style.height = `${Math.max(44, Math.min(112, input.scrollHeight || 44))}px`;
    sendButton.disabled = pendingSends.has(selected) || !gateway?.action || !input.value.trim();
    sendButton.setAttribute("aria-busy", String(pendingSends.has(selected)));
    sendButton.title = pendingSends.has(selected) ? "正在发送" : "发送消息";
    if (!pendingSends.has(selected) && !gateway?.action && !errorNode.textContent) {
      errorNode.textContent = "对话连接尚未就绪，消息会留在输入框里。";
    } else if (gateway?.action && errorNode.textContent === "对话连接尚未就绪，消息会留在输入框里。") {
      errorNode.textContent = "";
    }
  }
  function viewKey(state) {
    return JSON.stringify([selected, state.kind, state.label, state.reason, getWork(selected)?.task || null]);
  }
  function appendRecent(parent, result) {
    if (!result) return;
    const section = el("section", "sb-ow-recent");
    section.append(el("h3", null, "最近一次成果"), el("strong", null, result.title || "上次的工作结果"));
    if (result.summary) section.appendChild(el("p", null, result.summary));
    const date = new Date(result.generatedAt || result.updatedAt);
    if (Number.isFinite(date.getTime())) section.appendChild(el("time", null, date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })));
    const actions = el("div", "sb-ow-recent-actions"), view = el("button", null, "查看结果"); view.type = "button"; view.disabled = !onOpenResult;
    view.addEventListener("click", () => onOpenResult?.(result)); actions.appendChild(view);
    if (result.agentId !== "mkt-intent-analyst" && buildAccountAnalysisResumeFlow({ run: result }).analysisAccounts.length) {
      const analyze = el("button", null, "继续分析"); analyze.type = "button"; analyze.disabled = !onAnalyze; analyze.addEventListener("click", () => onAnalyze?.(result)); actions.appendChild(analyze);
    }
    section.appendChild(actions); parent.appendChild(section);
  }
  async function ensureReplay(agentId, state, work) {
    if (!agentId || !CLOUD_AGENTS.has(agentId)) return;
    const key = `${agentId}:successful-replay`;
    if (replay.loadedKey === key || replay.loadingKey === key) return;
    replay.loadingKey = key;
    try {
      const result = await listOfficeReplay(agentId, { limit: 30, latestOnly: true, successfulOnly: true });
      if (disposed || selected !== agentId || replay.loadedKey && replay.loadedKey !== key && replay.loadingKey !== key) return;
      replay.snapshots = Array.isArray(result?.snapshots) ? result.snapshots.slice(0, REPLAY_FRAME_LIMIT) : [];
      replay.segments = Array.isArray(result?.segments) ? result.segments.slice(0, REPLAY_SEGMENT_LIMIT) : [];
      const availableIds = new Set([...replay.snapshots, ...replay.segments].map(item => item.id));
      replay.images.forEach((imageUrl, snapshotId) => {
        if (availableIds.has(snapshotId)) return;
        try { globalThis.URL?.revokeObjectURL?.(imageUrl); } catch {}
        replay.images.delete(snapshotId);
      });
      replay.videos.forEach((videoUrl, segmentId) => {
        if (availableIds.has(segmentId)) return;
        try { globalThis.URL?.revokeObjectURL?.(videoUrl); } catch {}
        replay.videos.delete(segmentId);
      });
      replay.loadedKey = key;
      hydrateReplayImages(replay.snapshots, key);
      hydrateReplayVideos(replay.segments, key);
      build();
    } catch {
      if (!disposed && selected === agentId) { replay.snapshots = []; replay.loadedKey = key; }
    } finally {
      if (replay.loadingKey === key) replay.loadingKey = "";
    }
  }
  function hydrateReplayImages(snapshots, key) {
    snapshots.forEach(snapshot => {
      if (!snapshot?.id || !snapshot.imageUrl || replay.images.has(snapshot.id) || replay.imageLoads.has(snapshot.id)) return;
      replay.imageLoads.add(snapshot.id);
      void loadOfficeReplayImage(snapshot).then(imageUrl => {
        replay.imageLoads.delete(snapshot.id);
        const currentIds = new Set(replay.snapshots.map(item => item.id));
        if (disposed || replay.loadedKey !== key || !currentIds.has(snapshot.id)) {
          try { globalThis.URL?.revokeObjectURL?.(imageUrl); } catch {}
          return;
        }
        replay.images.set(snapshot.id, imageUrl);
        build();
      }).catch(() => replay.imageLoads.delete(snapshot.id));
    });
  }
  function hydrateReplayVideos(segments, key) {
    segments.forEach(segment => {
      if (!segment?.id || !segment.videoUrl || replay.videos.has(segment.id) || replay.videoLoads.has(segment.id)) return;
      replay.videoLoads.add(segment.id);
      void loadOfficeReplayVideo(segment).then(videoUrl => {
        replay.videoLoads.delete(segment.id);
        const currentIds = new Set(replay.segments.map(item => item.id));
        if (disposed || replay.loadedKey !== key || !currentIds.has(segment.id)) {
          try { globalThis.URL?.revokeObjectURL?.(videoUrl); } catch {}
          return;
        }
        replay.videos.set(segment.id, videoUrl);
        build();
      }).catch(() => replay.videoLoads.delete(segment.id));
    });
  }
  function replayFrames() {
    return replay.snapshots.slice().reverse().map(snapshot => ({ snapshot, imageUrl: replay.images.get(snapshot.id) })).filter(frame => frame.imageUrl);
  }
  function replaySegments() {
    return replay.segments.slice().reverse().map(segment => ({ segment, videoUrl: replay.videos.get(segment.id) })).filter(item => item.videoUrl);
  }
  function updateReplayPlayback() {
    const frames = replayFrames();
    if (!replay.imageNode || !frames.length) return;
    const frameAtIndex = frames[replay.playbackIndex % frames.length];
    replay.imageNode.src = frameAtIndex.imageUrl;
    replay.imageNode.alt = frameAtIndex.snapshot.title || "本次任务工作片段";
    replay.playbackIndex = (replay.playbackIndex + 1) % frames.length;
  }
  function startReplayPlayback() {
    const frames = replayFrames();
    if (!replay.imageNode || !frames.length || replay.playbackTimer != null) return;
    replay.playbackIndex = 0;
    updateReplayPlayback();
    replay.playbackTimer = globalThis.setInterval?.(updateReplayPlayback, REPLAY_SAMPLE_MS) || null;
    replay.playbackTimer?.unref?.();
  }
  function updateReplayVideoPlayback() {
    const segments = replaySegments();
    if (!replay.videoNode || !segments.length) return;
    const current = segments[replay.playbackIndex % segments.length];
    replay.videoNode.src = current.videoUrl;
    replay.videoNode.setAttribute("aria-label", current.segment.title || "本次任务工作片段");
    const play = replay.videoNode.play?.();
    play?.catch?.(() => {});
  }
  function startReplayVideoPlayback() {
    const segments = replaySegments();
    if (!replay.videoNode || !segments.length) return;
    replay.playbackIndex = 0;
    const advance = () => {
      const currentSegments = replaySegments();
      if (!currentSegments.length) return;
      replay.playbackIndex = (replay.playbackIndex + 1) % currentSegments.length;
      updateReplayVideoPlayback();
    };
    replay.videoNode.addEventListener("ended", advance);
    updateReplayVideoPlayback();
    replay.playbackTimer = globalThis.setInterval?.(() => {
      if (replay.videoNode?.ended) advance();
    }, 250) || null;
    replay.playbackTimer?.unref?.();
  }
  function appendReplay(parent, { attention = null, emptyText = "暂无成功工作的录屏" } = {}) {
    const frames = replayFrames();
    const segments = replaySegments();
    const hasFullClip = segments.length >= REPLAY_SEGMENT_LIMIT || frames.length >= REPLAY_FRAME_LIMIT;
    if (!attention && !frames.length && !segments.length) {
      const pending = el("section", "sb-ow-work-start");
      pending.append(el("span", "sb-ow-work-start-mark"), el("strong", null, emptyText), el("p", null, "完成一次工作后，这里会播放最近一次成功工作的录屏。"));
      parent.appendChild(pending);
      return;
    }
    const section = el("section", `sb-ow-replay${attention ? " is-attention" : ""}`);
    const stage = el("div", "sb-ow-replay-stage");
    if (segments.length) {
      const video = document.createElement("video"); video.muted = true; video.autoplay = true; video.playsInline = true; video.preload = "auto";
      replay.videoNode = video; stage.appendChild(video);
    } else if (frames.length) {
      const image = document.createElement("img"); image.loading = "eager"; replay.imageNode = image;
      const latest = frames.at(-1); image.src = latest.imageUrl; image.alt = latest.snapshot.title || "当前工作画面";
      stage.appendChild(image);
    } else {
      stage.appendChild(el("div", "sb-ow-replay-empty"));
    }
    if (attention) {
      const overlay = el("div", "sb-ow-replay-overlay");
      const overlayCard = el("div", "sb-ow-replay-overlay-card");
      overlayCard.append(el("span", null, "云电脑状态"), el("strong", null, attention.title), el("p", null, attention.message));
      const action = el("button", null, attention.actionLabel || "处理账号");
      action.type = "button"; action.disabled = Boolean(attention.disabled); action.addEventListener("click", attention.onAction);
      overlayCard.appendChild(action); overlay.appendChild(overlayCard); stage.appendChild(overlay);
    }
    section.appendChild(stage);
    parent.appendChild(section);
    if (!attention && segments.length) startReplayVideoPlayback();
    else if (!attention && hasFullClip) startReplayPlayback();
  }
  function replayRecordingContext() {
    if (!selected || !frame?.contentWindow) return null;
    const work = getWork(selected), state = officeWorkState(work);
    if (state.kind !== "working") return null;
    const taskId = work?.metadata?.taskId || work?.taskId || null;
    const taskRunId = work?.metadata?.taskRunId || work?.taskRunId || null;
    const latest = getActivity(selected).at?.(-1);
    const title = latest?.text || work?.phase || state.label || "正在处理任务";
    const detail = work?.task || state.reason || "";
    const eventKey = [taskId || "current", taskRunId || "", state.kind].join("|");
    if (eventKey === replay.recordingSignature) return null;
    replay.recordingSignature = eventKey;
    return { agentId: selected, taskId, taskRunId, title, detail, recordingId: globalThis.crypto?.randomUUID?.() || `office-recording-${Date.now()}` };
  }
  function markReplaySuccess(agentId, work, recordingId = null) {
    if (!isSuccessfulReplayWork(work)) return;
    const metadata = work.metadata || {};
    const taskId = metadata.taskId || metadata.task_id || work.taskId || null;
    if (!taskId) return;
    const key = `${agentId}:${taskId}`;
    if (replay.markedTasks.has(key)) return;
    replay.markedTasks.add(key);
    void markOfficeReplayTask({ agentId, taskId, recordingId, outcome: "success" }).then(() => {
      replay.loadedKey = "";
      void ensureReplay(agentId, officeWorkState(work), work);
    }).catch(() => replay.markedTasks.delete(key));
  }
  function requestReplayRecording({ force = false } = {}) {
    if (force) replay.recordingSignature = "";
    const context = replayRecordingContext();
    if (!context) return;
    replay.recordings.set(context.recordingId, context);
    frame.contentWindow.postMessage({ type: "byering-cloud-viewer-recording-start", agentId: context.agentId, recordingId: context.recordingId }, globalThis.location?.origin || "*");
  }
  function replayCaptureContext() {
    if (!selected || !frame?.contentWindow) return null;
    const work = getWork(selected), state = officeWorkState(work);
    if (state.kind !== "working") return null;
    const latest = getActivity(selected).at?.(-1);
    const taskId = work?.metadata?.taskId || work?.taskId || null;
    const taskRunId = work?.metadata?.taskRunId || work?.taskRunId || null;
    const title = latest?.text || work?.phase || state.label || "正在处理任务";
    const detail = work?.task || state.reason || "";
    const sampleBucket = Math.floor(Date.now() / REPLAY_SAMPLE_MS);
    const eventKey = [taskId || "current", taskRunId || "", state.kind, title, detail, sampleBucket].join("|");
    if (eventKey === replay.captureSignature) return null;
    replay.captureSignature = eventKey;
    return { agentId: selected, taskId, taskRunId, eventKey, title, detail };
  }
  function requestReplayCapture() {
    const context = replayCaptureContext();
    if (!context) return;
    const captureId = globalThis.crypto?.randomUUID?.() || `office-frame-${Date.now()}`;
    replay.captures.set(captureId, context);
    globalThis.setTimeout?.(() => replay.captures.delete(captureId), 15_000);
    frame.contentWindow.postMessage({ type: "byering-cloud-viewer-capture", agentId: context.agentId, captureId, maxEdge: 880, quality: 0.68 }, globalThis.location?.origin || "*");
  }
  function buildHome() {
    delete root.dataset.agentId; delete root.dataset.replay;
    const content = el("div", "sb-ow-start"); content.appendChild(el("h2", null, "今天想做点什么？"));
    const actions = el("div", "sb-ow-start-options");
    OFFICE_START_ACTIONS.forEach(action => {
      const button = el("button", "sb-ow-start-option"); button.type = "button"; button.disabled = !onConfigure;
      const avatar = el("span", "sb-ow-start-avatar"); mountAvatar(avatar, action.agentId, { alt: "", trackPointer: false, mode: "office-workspace" });
      const copy = el("span", "sb-ow-start-copy"); copy.append(el("strong", null, action.label), el("small", null, action.detail));
      button.append(avatar, copy, el("span", "sb-ow-start-arrow", "→")); button.addEventListener("click", () => onConfigure?.(action.agentId)); actions.appendChild(button);
    });
    content.appendChild(actions); appendRecent(content, latestOfficeResult(getResults())); root.appendChild(content);
  }
  function idleConversationPrompt(agentId) {
    const state = officeDisplayState(officeWorkState(getWork(agentId)));
    if (state.kind === "working") return null;
    const text = state.kind === "attention"
      ? `${state.reason || "账号需要重新连接后才能继续工作。"} 请先在右上角调整任务后，再直接告诉我接下来想做什么。`
      : `${state.label === "上次任务已完成" ? "上一项工作已经完成。" : "我现在没有在执行任务。"}接下来想做点什么？直接发消息告诉我。`;
    return { id: `office-idle-prompt:${agentId}:${state.kind}:${state.label}`, from: agentId, text, metadata: { source: "office-conversation" } };
  }
  function renderMessages() {
    if (!messages || !selected) return;
    const directMessages = mergeAgentConversationMessages(remote, acknowledged.get(selected) || []);
    const { history: directHistory, current } = partitionOfficeMessages(directMessages, getWork(selected));
    const history = mergeAgentConversationMessages(directHistory, getActivity(selected), { includeActivity: true });
    // Idle guidance stays in the direct-message stream, not in a workspace action panel.
    const prompt = current.length ? null : idleConversationPrompt(selected);
    const visibleCurrent = prompt ? [...current, prompt] : current;
    const combined = [...history, ...visibleCurrent];
    const status = latestCompanionPhase(directMessages);
    const statusKey = `${selected}:${status.messageId}:${status.phase}`;
    if (companionStatus && statusKey !== companionStatusKey) {
      companionStatusKey = statusKey; const agentId = selected;
      disposeCompanionStatus = mountCompanionStatus(companionStatus, { phase: status.phase, onRetry: async () => {
        await companionRequest("POST", "/v1/direct-messages/retry", { agentId, messageId: status.messageId }); await loadMessages();
      } });
    }
    const signature = JSON.stringify([history.map(message => message.id), combined.map(message => [message.id, message.from, message.text, message.createdAt, message.metadata?.companion])]);
    if (signature === messageSignature) return;
    const nearBottom = !messageSignature || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
    const scrollTop = messages.scrollTop;
    messageSignature = signature; cardDisposers.splice(0).forEach(dispose => dispose()); messages.textContent = "";
    const appendMessages = (parent, entries) => {
      let previousTime = null;
      entries.slice(-100).forEach(message => {
        if (!message.text) return;
        const row = el("div", `sb-ow-message${message.from === "user" ? " is-user" : ""}`);
        if (!displayedMessages.has(message.id)) { row.className += " sb-companion-arrive"; displayedMessages.add(message.id); }
        row.setAttribute("aria-label", message.from === "user" ? "我" : getMarketplaceAgent(selected).name);
        const date = new Date(message.createdAt || "");
        const timestamp = Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
        if (timestamp && timestamp !== previousTime) {
          const time = el("time", null, timestamp);
          if (Number.isFinite(date.getTime())) time.setAttribute("datetime", date.toISOString());
          row.appendChild(time); previousTime = timestamp;
        }
        row.appendChild(el("div", "sb-ow-bubble", message.text));
        const agentId = selected;
        cardDisposers.push(appendCompanionCards(row, message, { onAction: async action => {
          const result = await companionCardAction(agentId, action, { onConfigure, onOpenWork: id => onOpenWork?.(id, getWork(id)) });
          await loadMessages(); return result;
        } }));
        parent.appendChild(row);
      });
    };
    if (history.length) {
      const details = el("details", "sb-ow-history"); details.open = historyExpanded.get(selected) || false;
      const agentId = selected; details.addEventListener("toggle", () => historyExpanded.set(agentId, details.open));
      const body = el("div", "sb-ow-history-body"); appendMessages(body, history);
      details.append(el("summary", null, `之前的工作记录 · ${history.length} 条`), body); messages.appendChild(details);
    }
    if (!visibleCurrent.length) messages.appendChild(el("div", "sb-ow-message-empty", history.length ? "暂时没有新的对话" : "暂时没有对话记录"));
    appendMessages(messages, visibleCurrent);
    if (nearBottom) messages.scrollTop = messages.scrollHeight;
    else messages.scrollTop = scrollTop;
  }
  async function loadMessages() {
    if (!selected || !gateway?.action || inFlight || !root?.isConnected || !isVisible()) return;
    const token = generation, agentId = selected;
    const request = {};
    inFlight = request;
    try {
      const result = await gateway.action("dm.message.list", officeConversationContext(agentId, getWork(agentId)));
      if (token !== generation || disposed) return;
      if (result?.ok === false || result?.accepted === false) throw new Error("对话记录暂时无法读取");
      remote = result?.data?.messages || result?.messages || [];
      renderMessages();
    } catch (error) { if (token === generation && errorNode && !disposed) errorNode.textContent = error.message || "对话记录暂时无法读取"; }
    finally { if (inFlight === request) inFlight = null; }
  }
  async function send() {
    if (!selected || pendingSends.has(selected)) return;
    if (!gateway?.action) {
      errorNode.textContent = "对话连接尚未就绪，这条消息还在输入框里，请稍后重试。";
      updateComposer();
      return;
    }
    const text = input.value.trim(); if (!text) return;
    const agentId = selected, token = generation, context = officeConversationContext(agentId, getWork(agentId));
    sending = true; pendingSends.add(agentId); updateComposer(); errorNode.textContent = "";
    try {
      const result = await gateway.action("dm.message.send", { ...context, from: "user", fromName: "我", text, clientMessageId: globalThis.crypto?.randomUUID?.() || `message-${Date.now()}` });
      if (result?.ok === false || result?.accepted === false) throw new Error(result?.message || "消息未被接收");
      const saved = result?.data?.message || result?.message;
      const sent = { id: saved?.id || `local-sent:${Date.now()}`, from: "user", text, metadata: saved?.metadata, createdAt: saved?.createdAt || new Date().toISOString() };
      acknowledged.set(agentId, [...(acknowledged.get(agentId) || []), sent].slice(-100));
      if (drafts.get(agentId)?.trim() === text || (token === generation && input?.value.trim() === text)) drafts.delete(agentId);
      if (selected !== agentId || disposed) return;
      if (input?.value.trim() === text) input.value = "";
      updateComposer();
      renderMessages(); await loadMessages();
    } catch (error) { if (selected === agentId && !disposed) errorNode.textContent = error.message || "发送失败，请重试"; }
    finally { pendingSends.delete(agentId); if (selected === agentId && !disposed) { sending = false; updateComposer(); } }
  }
  function refresh() {
    if (disposed) return;
    syncHeight();
    const bounds = host?.getBoundingClientRect?.();
    if (!root?.isConnected || !isVisible() || (bounds && (!bounds.width || !bounds.height))) {
      if (!suspended) { suspended = true; generation++; inFlight = null; if (selected && input) drafts.set(selected, input.value); releaseFrame(); clearReplayPlayback(); }
      return;
    }
    if (suspended) { suspended = false; sending = false; build(); return; }
    if (!manualSelection) {
      const next = selectOfficeWork(getWorks(), selected);
      if (next !== selected && (next || !selected)) {
      if (selected && input) drafts.set(selected, input.value);
        generation++; inFlight = null; remote = []; sending = false; replay.captureSignature = ""; clearReplayImages(); selected = next; build(); return;
      }
    }
    const work = selected ? getWork(selected) : null;
    const state = officeDisplayState(officeWorkState(work));
    if (viewKey(state) !== layoutKey) {
      if (selected && input) drafts.set(selected, input.value);
      generation++; inFlight = null; sending = false; build(); return;
    }
    if (!selected) return;
    const label = state.shortLabel || state.label;
    if (statusNode.textContent !== label) statusNode.textContent = label;
    if (taskNode) {
      const title = state.reason || work?.phase || state.label;
      const text = work?.task || "";
      const signature = `${title}:${text}`;
      if (taskNode.dataset.signature !== signature) { taskNode.dataset.signature = signature; taskNode.textContent = ""; taskNode.append(el("strong", null, title), el("p", null, text)); }
    }
    markReplaySuccess(selected, work);
    renderMessages(); void loadMessages();
    const taskState = String(work?.metadata?.taskState || work?.metadata?.acquisitionTaskState || work?.taskState || work?.state || "").toLowerCase();
    const taskFinished = isSuccessfulReplayWork(work) || ["failed", "error", "cancelled", "canceled", "stopped"].includes(taskState);
    if (CLOUD_AGENTS.has(selected) && officeWorkState(work).kind === "working" && !taskFinished) requestReplayRecording();
  }
  function officeDisplayState(state) {
    if (state?.kind !== "unknown") return state;
    return { ...state, kind: "idle", label: "暂时没有任务", shortLabel: "暂时没有任务", reason: "" };
  }
  function onViewerMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== globalThis.location?.origin || event.data?.agentId !== selected) return;
    if (event.data?.type === "byering-cloud-recording-segment") {
      const context = replay.recordings.get(event.data.recordingId);
      if (!context || !event.data.videoData || typeof event.data.videoData.size !== "number") return;
          const work = getWork(context.agentId);
          void saveOfficeReplayVideo({ ...context, outcome: isSuccessfulReplayWork(work) ? "success" : "unknown", durationMs: event.data.durationMs || REPLAY_SEGMENT_MS, videoData: event.data.videoData }).then(() => {
            markReplaySuccess(context.agentId, work, context.recordingId);
            replay.loadedKey = "";
            const state = officeWorkState(work);
            void ensureReplay(context.agentId, state, work);
      }).catch(() => requestReplayCapture());
      return;
    }
    if (event.data?.type === "byering-cloud-snapshot") {
      const context = replay.captures.get(event.data.captureId);
      replay.captures.delete(event.data.captureId);
      if (!context || !event.data.imageData) return;
      void saveOfficeReplaySnapshot({ ...context, imageData: event.data.imageData }).then(() => {
        replay.loadedKey = "";
        const work = getWork(context.agentId), state = officeWorkState(work);
        void ensureReplay(context.agentId, state, work);
      }).catch(() => {});
      return;
    }
    if (event.data?.type !== "byering-cloud-viewer") return;
    const justConnected = event.data.status === "connected" && viewerConnectionStatus !== "connected";
    viewerConnectionStatus = String(event.data.status || "");
    if (justConnected) globalThis.setTimeout?.(() => requestReplayRecording({ force: true }), 900);
    if (event.data.status === "recording-unavailable") requestReplayCapture();
  }
  globalThis.addEventListener?.("message", onViewerMessage);
  globalThis.addEventListener?.("resize", syncHeight);
  globalThis.addEventListener?.("scroll", syncHeight, true);
  globalThis.visualViewport?.addEventListener("resize", syncHeight);
  globalThis.visualViewport?.addEventListener("scroll", syncHeight);
  const unsubscribe = subscribeWork(refresh), unsubscribeTeam = teamLive?.subscribe?.(refresh) || (() => {});
  const timer = globalThis.setInterval?.(refresh, pollMs); timer?.unref?.();
  const viewerStatusTimer = globalThis.setInterval?.(requestViewerStatus, 2_000); viewerStatusTimer?.unref?.();
  return { mount, select, refresh, setGateway(value) {
    gateway = value;
    updateComposer();
    refresh();
  }, unmount() {
    disposeCompanionStatus(); cardDisposers.splice(0).forEach(dispose => dispose());
    disposed = true; generation++; releaseFrame(); clearReplayPlayback(); clearReplayImages(); unsubscribe(); unsubscribeTeam(); if (timer != null) globalThis.clearInterval?.(timer); if (viewerStatusTimer != null) globalThis.clearInterval?.(viewerStatusTimer);
    globalThis.removeEventListener?.("message", onViewerMessage);
    globalThis.removeEventListener?.("resize", syncHeight); globalThis.removeEventListener?.("scroll", syncHeight, true);
    globalThis.visualViewport?.removeEventListener("resize", syncHeight); globalThis.visualViewport?.removeEventListener("scroll", syncHeight);
    root?.remove(); releaseHost(); style?.remove();
  } };
}
