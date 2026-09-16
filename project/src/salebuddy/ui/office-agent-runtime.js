import { listWorks, subscribeWork } from "../agents/work-live.js";
import { createOfficeStatusStore } from "../bridge/office-status.js";
import { receptionBaseUrl } from "../bridge/account-reception-client.js";
import { officeWorkState } from "./office-workspace-state.js";
import {
  getMarketplaceAgent,
  listActivatedMarketplaceAgents,
  sortMarketplaceAgentsForDisplay
} from "../agents/marketplace.js";
import { createOfficeWorkspace } from "./office-workspace.js";
import { findOfficeRightPanel, isUsableOfficeRightPanel } from "./agent-drawer.js";
import { grokStateForTeamStatus, mountGrokBotAvatar } from "./grok-bot-avatar.js";
import {
  allOfficeRoleVideoUrls,
  OFFICE_CHIEF_AGENT_ID,
  createOfficeRoleBindings,
  roleVideoUrlsFor
} from "./office-role-video.js";

// Kept for compatibility with roster consumers. Visual rendering no longer uses physical seats.
export const OFFICE_AGENT_SLOTS = Object.freeze([
  Object.freeze({ id: "main", nativeType: "main" }),
  Object.freeze({ id: "app", nativeType: "App Agent" }),
  Object.freeze({ id: "computer", nativeType: "Computer Agent" }),
  Object.freeze({ id: "browser", nativeType: "Browser Agent" }),
  Object.freeze({ id: "file", nativeType: "File Agent" }),
  Object.freeze({ id: "search", nativeType: "Search Agent" })
]);

const STYLE_ID = "salebuddy-office-agent-runtime-style";
const VIDEO_LAYER_ID = "salebuddy-office-role-video-layer";

const CSS = `
.office-dashboard [class*="_pageTitleText_"]{display:none !important}
[data-sb-office-simple-host="1"]{position:relative!important;overflow:hidden!important;background:#f6f7f9!important}
[data-sb-office-simple-host="1"]>:not(#${VIDEO_LAYER_ID}){display:none!important}
#${VIDEO_LAYER_ID}{position:absolute;inset:0;z-index:6;box-sizing:border-box;overflow:auto;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;scrollbar-width:none}
#${VIDEO_LAYER_ID}::-webkit-scrollbar{display:none}
#${VIDEO_LAYER_ID} .sb-office-agent-stage{display:grid;grid-template-columns:repeat(2,minmax(300px,300px));justify-content:center;align-content:start;gap:28px 12px;min-height:100%;box-sizing:border-box;padding:0 12px}
#${VIDEO_LAYER_ID} .sb-office-agent-figure{width:300px;min-width:300px;margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}
#${VIDEO_LAYER_ID} .sb-office-agent-badge{position:relative;display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:10px;width:292px;max-width:calc(100% - 8px);min-width:0;height:58px;box-sizing:border-box;padding:7px 14px 7px 6px;border:1px solid rgba(8,8,8,.04);border-radius:999px;background:#fff;box-shadow:0 4px 18px rgba(8,8,8,.06);color:#080808;text-align:left;z-index:2}
#${VIDEO_LAYER_ID} .sb-office-agent-badge:hover{box-shadow:0 6px 22px rgba(8,8,8,.1)}
#${VIDEO_LAYER_ID} .sb-office-agent-badge:focus-visible{outline:2px solid rgba(48,99,219,.38);outline-offset:2px}
#${VIDEO_LAYER_ID} .sb-office-agent-avatar{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:#eaf0f6;color:#5c6875;font-size:13px;font-weight:700}
#${VIDEO_LAYER_ID} .sb-office-agent-avatar img{width:100%;height:100%;display:block;object-fit:cover}
#${VIDEO_LAYER_ID} .sb-office-agent-copy{min-width:0;display:flex;flex-direction:column;gap:1px}
#${VIDEO_LAYER_ID} .sb-office-agent-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:600;line-height:21px}
#${VIDEO_LAYER_ID} .sb-office-agent-account{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6f7882;font-size:13px;line-height:18px}
#${VIDEO_LAYER_ID} .sb-office-agent-account:empty{display:none}
#${VIDEO_LAYER_ID} .sb-office-agent-state{display:flex;align-items:center;flex:0 0 auto;gap:5px;color:#21a55b;font-size:13px;line-height:18px;white-space:nowrap}
#${VIDEO_LAYER_ID} .sb-office-agent-dot{width:8px;height:8px;flex:none;border-radius:50%;background:#a9b0b8;box-shadow:0 0 0 4px rgba(169,176,184,.12)}
#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="working"] .sb-office-agent-dot{background:#2eb66d;box-shadow:0 0 0 3px rgba(46,182,109,.12)}
#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="working"] .sb-office-agent-state{color:#21a55b}
#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="blocked"] .sb-office-agent-dot{background:#e05252;box-shadow:0 0 0 3px rgba(224,82,82,.12)}
#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="blocked"] .sb-office-agent-state{color:#d14c4c}
#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="done"] .sb-office-agent-dot,#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="listening"] .sb-office-agent-dot{background:#3f7ee8}
#${VIDEO_LAYER_ID} .sb-office-agent-badge[data-state="paused"] .sb-office-agent-dot{background:#ba852d}
#${VIDEO_LAYER_ID} .sb-office-agent-avatar-fallback{font-size:12px}
#${VIDEO_LAYER_ID} .sb-office-agent-video-button{position:relative;display:block;width:300px;height:300px;flex:0 0 300px;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;overflow:hidden}
#${VIDEO_LAYER_ID} .sb-office-agent-video-button:hover{filter:brightness(.985)}
#${VIDEO_LAYER_ID} .sb-office-agent-video-button:focus-visible{outline:2px solid rgba(48,99,219,.38);outline-offset:2px}
#${VIDEO_LAYER_ID} .sb-office-agent-video{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;background:transparent;pointer-events:none}
#${VIDEO_LAYER_ID} .sb-office-agent-video[hidden]{display:none}
#${VIDEO_LAYER_ID} .sb-office-empty{display:grid;place-items:center;min-height:100%;padding:32px;color:#89929b;font-size:13px;text-align:center}
@media(max-width:900px){.office-dashboard [class*="_contentRow_"]{position:relative!important;min-width:0!important}.office-dashboard [class*="_leftPanel_"]{width:100%!important;min-width:0!important;flex:1 1 auto!important}.office-dashboard [class*="_rightPanel_"]{position:absolute!important;top:0!important;right:0!important;bottom:auto!important;left:auto!important;width:min(294px,calc(100% - 24px))!important;min-width:0!important;height:calc(100% - 26px)!important;margin:0!important;z-index:20!important}}
@media(max-width:640px){#${VIDEO_LAYER_ID}{padding:16px 8px}#${VIDEO_LAYER_ID} .sb-office-agent-stage{grid-template-columns:minmax(0,1fr);gap:24px 0;padding:0}#${VIDEO_LAYER_ID} .sb-office-agent-figure{width:100%;min-width:0}#${VIDEO_LAYER_ID} .sb-office-agent-badge,#${VIDEO_LAYER_ID} .sb-office-agent-video-button{width:100%;max-width:100%}#${VIDEO_LAYER_ID} .sb-office-agent-video-button{height:auto;aspect-ratio:1}}
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

function officeBadgeStateLabel(agent) {
  if (agent?.state === "unknown") return "待同步";
  if (agent?.state === "working") return "工作中";
  if (agent?.state === "blocked") return "已掉线";
  if (agent?.state === "done") return "已完成";
  return agent?.stateLabel || "空闲中";
}

export function officeAgentAriaLabel(agent = {}) {
  const account = agent.id === OFFICE_CHIEF_AGENT_ID ? "" : `，抖音账号：${agent.accountLabel || "抖音账号待同步"}`;
  return `查看 ${agent.name || "数字员工"}${account}，当前状态：${agent.stateLabel || officeBadgeStateLabel(agent)}`;
}

function textValue(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function accountIdentitySource(account = {}) {
  return account?.identity && typeof account.identity === "object" ? account.identity : account;
}

function accountReferenceValues(account = {}) {
  const identity = accountIdentitySource(account);
  return [...new Set([
    account.id,
    account.accountId,
    account.account_id,
    account.accountKey,
    account.account_key,
    identity.managedAccountKey,
    identity.managed_account_key,
    identity.uniqueId,
    identity.unique_id,
    identity.uid,
    identity.userId,
    identity.user_id
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function accountName(account = {}) {
  const identity = accountIdentitySource(account);
  const value = textValue(
    account.name,
    account.accountName,
    account.account_name,
    account.nickname,
    account.nick_name,
    identity.accountName,
    identity.account_name,
    identity.nickname,
    identity.nick_name,
    identity.account,
    account.handle,
    identity.uniqueId,
    identity.unique_id
  );
  return /^(账号名称未返回|待识别账号|未命名账号)$/i.test(value) ? "" : value;
}

function accountAgentIds(account = {}) {
  const capabilityAgentIds = Array.isArray(account.capabilityMatrix)
    ? account.capabilityMatrix.map((item) => item?.agentId || item?.agent_id)
    : [];
  return [...new Set([
    account.agentId,
    account.agent_id,
    ...(Array.isArray(account.agentIds) ? account.agentIds : []),
    ...capabilityAgentIds
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function findAccountByReference(accounts, reference) {
  const normalized = String(reference || "").trim();
  if (!normalized) return null;
  const referencedAgentId = normalized.startsWith("douyin-agent:")
    ? normalized.slice("douyin-agent:".length)
    : normalized;
  return accounts.find((account) => accountReferenceValues(account).includes(normalized)
    || account.agentId === referencedAgentId
    || accountAgentIds(account).includes(referencedAgentId)) || null;
}

function workAccountReference(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  return textValue(
    work.accountId,
    work.account_id,
    work.accountKey,
    work.account_key,
    metadata.accountId,
    metadata.account_id,
    metadata.accountKey,
    metadata.account_key
  );
}

function workAccountName(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const identity = metadata.accountIdentity && typeof metadata.accountIdentity === "object"
    ? metadata.accountIdentity
    : {};
  return textValue(
    work.accountName,
    work.account_name,
    work.accountLabel,
    work.account_label,
    metadata.accountName,
    metadata.account_name,
    metadata.accountLabel,
    metadata.account_label,
    identity.accountName,
    identity.account_name,
    identity.nickname,
    identity.nick_name
  );
}

function officeAccountDirectory(accounts = null) {
  if (Array.isArray(accounts)) return accounts;
  return Array.isArray(globalThis.__SALEBUDDY__?.douyinAccounts)
    ? globalThis.__SALEBUDDY__.douyinAccounts
    : [];
}

function accountSupportsAgent(account, agentId) {
  return accountAgentIds(account).includes(agentId);
}

function addOfficeAccount(accounts, seen, reference, explicitName = "") {
  const account = findAccountByReference(accounts, reference);
  const accountId = textValue(reference, account && accountReferenceValues(account)[0]);
  const name = textValue(explicitName, accountName(account || {}), accountId);
  if (!name) return;
  const key = accountId || name;
  if (seen.has(key)) return;
  seen.add(key);
  accounts.push({ id: accountId, name });
}

function officeAccountPresentation(agentId, works = [], accounts = null) {
  if (agentId === OFFICE_CHIEF_AGENT_ID) {
    return { accountIds: [], accountNames: [], accountLabel: "" };
  }
  const directory = officeAccountDirectory(accounts);
  const accountEntries = [];
  const seen = new Set();
  const agentWorks = (Array.isArray(works) ? works : []).filter((work) => work?.agentType === agentId);

  for (const account of directory) {
    if (accountSupportsAgent(account, agentId)) {
      addOfficeAccount(accountEntries, seen, accountReferenceValues(account)[0], accountName(account));
    }
  }

  for (const work of agentWorks) {
    addOfficeAccount(accountEntries, seen, workAccountReference(work), workAccountName(work));
    const tasks = Array.isArray(work?.metadata?.tasks) ? work.metadata.tasks : [];
    for (const task of tasks) {
      addOfficeAccount(accountEntries, seen, textValue(task?.accountId, task?.account_id), textValue(task?.accountName, task?.account_name, task?.accountLabel, task?.account_label));
    }
  }

  const accountNames = accountEntries.map((entry) => entry.name).filter(Boolean);
  const accountLabel = accountNames.length > 2
    ? `${accountNames.slice(0, 2).join("、")} 等${accountNames.length}个账号`
    : accountNames.join("、");
  return {
    accountIds: accountEntries.map((entry) => entry.id).filter(Boolean),
    accountNames,
    accountLabel: accountLabel || "抖音账号待同步"
  };
}

function agentIdentity(agentId, { teamLive, work = null, works = [], accounts = null } = {}) {
  const profile = teamLive?.getProfiles?.().get(agentId);
  const marketplace = getMarketplaceAgent(agentId);
  const liveStatus = teamLive?.getStatusOf?.(agentId) || null;
  const state = normalizedStatus(work);
  const fallbackName = agentId === "main" ? "Byering · 幕僚长" : marketplace?.displayName || marketplace?.name || agentId;
  const profileName = String(profile?.identity?.name || "").trim();
  const name = marketplace?.displayName || marketplace?.name || (profileName && profileName !== agentId ? profileName : fallbackName);
  const task = work?.task || work?.phase || liveStatus?.currentTask || (agentId === "main" ? "协调当前团队任务" : marketplace?.displayTitle || marketplace?.title || "等待任务");
  const account = officeAccountPresentation(agentId, works, accounts);
  return {
    id: agentId,
    name,
    task,
    ...account,
    state,
    stateLabel: state === "unknown" ? officeWorkState(work).shortLabel : stateLabel(state),
    startedAt: Number(work?.startedAt) || 0
  };
}

export function listActivatedOfficeAgents() {
  return listActivatedMarketplaceAgents();
}

/** Build a current-team snapshot without leaking legacy office role names. */
export function buildOfficeAgentRoster({ activatedAgents = [], works = [], accounts = null, teamLive = null, maxSeats = OFFICE_AGENT_SLOTS.length } = {}) {
  const workByAgent = new Map((works || []).map((work) => [work.agentType, work]));
  const chiefWork = {
    agentType: OFFICE_CHIEF_AGENT_ID,
    state: "working",
    task: "统筹当前团队任务",
    metadata: { officeStatus: "working", officeStatusPhase: "ready" }
  };
  const visibleAgents = sortMarketplaceAgentsForDisplay((activatedAgents || []).filter((agent) => {
    const id = String(agent?.id || agent?.agentType || "").trim();
    return Boolean(id && id !== OFFICE_CHIEF_AGENT_ID && normalizedStatus(workByAgent.get(id)) === "working");
  }));
  const roster = [
    agentIdentity(OFFICE_CHIEF_AGENT_ID, { teamLive, work: chiefWork, works, accounts }),
    ...visibleAgents.map((agent) => {
    const id = String(agent?.id || agent?.agentType || "").trim();
    return agentIdentity(id, { teamLive, work: workByAgent.get(id), works, accounts });
    })
  ];
  const seatCount = Math.max(1, Number(maxSeats) || OFFICE_AGENT_SLOTS.length);
  return {
    seated: roster.slice(0, seatCount),
    overflow: roster.slice(seatCount),
    roster,
    activeCount: roster.filter((agent) => agent.state === "working").length
  };
}

function officeVideoPhase(agent) {
  return agent?.state === "working" ? "working" : "resting";
}

function agentButton(agent, className, onOpenAgent) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.agentId = agent.id;
  button.dataset.state = agent.state;
  button.setAttribute("aria-label", officeAgentAriaLabel(agent));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenAgent?.(agent.id);
  });
  return button;
}

function renderAgentBadge(agent, onOpenAgent) {
  const badge = agentButton(agent, "sb-office-agent-badge", onOpenAgent);
  const avatar = document.createElement("span");
  avatar.className = "sb-office-agent-avatar sb-office-agent-avatar-fallback";
  mountGrokBotAvatar(avatar, agent.id, {
    alt: `${agent.name} 头像`,
    state: grokStateForTeamStatus({ state: agent.state }),
    trackPointer: false,
    mode: "office"
  });

  const copy = document.createElement("span");
  copy.className = "sb-office-agent-copy";
  const name = document.createElement("span");
  name.className = "sb-office-agent-name";
  name.textContent = agent.name;
  const account = document.createElement("span");
  account.className = "sb-office-agent-account";
  account.textContent = agent.accountLabel;
  copy.append(name, account);

  const state = document.createElement("span");
  state.className = "sb-office-agent-state";
  const dot = document.createElement("i");
  dot.className = "sb-office-agent-dot";
  const label = document.createElement("span");
  label.textContent = officeBadgeStateLabel(agent);
  state.append(dot, label);
  badge.append(avatar, copy, state);
  return badge;
}

function createOfficeStage(host, roleBindings, onOpenAgent) {
  let layer = host.querySelector(`#${VIDEO_LAYER_ID}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = VIDEO_LAYER_ID;
    layer.setAttribute("aria-label", "办公室数字员工");
    host.appendChild(layer);
  }

  let stage = layer.querySelector(".sb-office-agent-stage");
  if (!stage) {
    stage = document.createElement("div");
    stage.className = "sb-office-agent-stage";
    layer.appendChild(stage);
  }

  const entries = new Map();
  const preloadVideos = new Map();

  function preloadRoleVideos() {
    for (const url of allOfficeRoleVideoUrls()) {
      if (!url || preloadVideos.has(url)) continue;
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.src = url;
      video.load();
      preloadVideos.set(url, video);
    }
  }

  function createEntry(agent) {
    const figure = document.createElement("figure");
    figure.className = "sb-office-agent-figure";
    figure.dataset.agentId = agent.id;

    const badge = renderAgentBadge(agent, onOpenAgent);
    const videoButton = agentButton(agent, "sb-office-agent-video-button", onOpenAgent);
    const video = document.createElement("video");
    video.className = "sb-office-agent-video";
    video.autoplay = true;
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    videoButton.appendChild(video);
    figure.append(badge, videoButton);
    stage.appendChild(figure);

    const entry = {
      agentId: agent.id,
      roleKey: null,
      phase: null,
      currentUrl: "",
      figure,
      badge,
      videoButton,
      video
    };

    const play = () => { void video.play?.().catch?.(() => {}); };
    const setNextVideo = () => {
      if (!entry.roleKey || !entry.agentId) return;
      const [nextUrl] = roleVideoUrlsFor(entry.roleKey, entry.phase);
      if (!nextUrl) return;
      if (nextUrl === entry.currentUrl) {
        video.currentTime = 0;
        play();
        return;
      }
      entry.currentUrl = nextUrl;
      video.src = nextUrl;
      video.load();
      play();
    };
    video.addEventListener("loadeddata", play);
    video.addEventListener("canplay", play);
    video.addEventListener("ended", setNextVideo);
    video.addEventListener("error", () => {
      video.hidden = true;
    });
    entries.set(agent.id, entry);
    return entry;
  }

  function updateEntry(entry, agent) {
    const roleKey = roleBindings.get(agent.id);
    const phase = officeVideoPhase(agent);
    const identityChanged = entry.agentId !== agent.id;
    const phaseChanged = entry.phase !== phase;
    const roleChanged = entry.roleKey !== roleKey;
    const [url] = roleVideoUrlsFor(roleKey, phase, { random: () => 0 });

    entry.agentId = agent.id;
    entry.roleKey = roleKey;
    entry.phase = phase;
    entry.figure.dataset.agentId = agent.id;
    entry.badge.dataset.agentId = agent.id;
    entry.badge.dataset.state = agent.state;
    entry.videoButton.dataset.agentId = agent.id;
    entry.videoButton.dataset.state = agent.state;
    entry.badge.setAttribute("aria-label", officeAgentAriaLabel(agent));
    entry.videoButton.setAttribute("aria-label", officeAgentAriaLabel(agent));

    const name = entry.badge.querySelector(".sb-office-agent-name");
    const account = entry.badge.querySelector(".sb-office-agent-account");
    const state = entry.badge.querySelector(".sb-office-agent-state span");
    const avatar = entry.badge.querySelector(".sb-office-agent-avatar");
    if (name) name.textContent = agent.name;
    if (account) account.textContent = agent.accountLabel;
    if (state) state.textContent = officeBadgeStateLabel(agent);
    if (avatar) mountGrokBotAvatar(avatar, agent.id, {
      alt: `${agent.name} 头像`,
      state: grokStateForTeamStatus({ state: agent.state }),
      trackPointer: false,
      mode: "office"
    });

    entry.video.dataset.agentId = agent.id;
    entry.video.dataset.roleKey = roleKey || "";
    entry.video.dataset.state = agent.state || "unknown";
    if (!url) {
      entry.video.hidden = true;
      return;
    }
    entry.video.hidden = false;
    if (!identityChanged && !phaseChanged && !roleChanged && entry.currentUrl) return;
    if (entry.currentUrl === url && !phaseChanged && !roleChanged) return;
    entry.currentUrl = url;
    entry.video.src = url;
    entry.video.load();
    void entry.video.play?.().catch?.(() => {});
  }

  function sync(roster) {
    preloadRoleVideos();
    const visibleIds = new Set();
    for (const agent of roster) {
      const entry = entries.get(agent.id) || createEntry(agent);
      updateEntry(entry, agent);
      stage.appendChild(entry.figure);
      visibleIds.add(agent.id);
    }
    for (const [agentId, entry] of entries) {
      if (visibleIds.has(agentId)) continue;
      entry.video.pause?.();
      entry.video.removeAttribute("src");
      entry.video.load?.();
      entry.figure.remove();
      entries.delete(agentId);
    }
    if (!roster.length) {
      if (!layer.querySelector(".sb-office-empty")) {
        const empty = document.createElement("div");
        empty.className = "sb-office-empty";
        empty.textContent = "暂无已启用的数字员工";
        layer.appendChild(empty);
      }
    } else {
      layer.querySelector(".sb-office-empty")?.remove();
    }
  }

  return {
    sync,
    dispose() {
      for (const entry of entries.values()) {
        entry.video.pause?.();
        entry.video.removeAttribute("src");
        entry.video.load?.();
      }
      for (const video of preloadVideos.values()) {
        video.pause?.();
        video.removeAttribute("src");
        video.load?.();
      }
      layer.remove();
      entries.clear();
      preloadVideos.clear();
    }
  };
}

function findOfficeStageHost(dashboard) {
  const leftPanel = dashboard?.querySelector?.('[class*="_leftPanel_"]');
  if (leftPanel) return leftPanel;
  const canvas = dashboard?.querySelector?.("canvas");
  return canvas?.parentElement || null;
}

function syncNativeAgentSummary(dashboard, snapshot) {
  const summary = [...dashboard.querySelectorAll("*")].find((node) => {
    if (node.children.length) return false;
    return /^\d+\s*位数字员工已就绪$/.test(String(node.textContent || "").trim());
  });
  if (summary) summary.textContent = `${snapshot.roster.length} 位 Agent 已就绪`;
}

export function mountOfficeAgentRuntime({ teamLive = null, gateway = null, onConfigure = null, onOpenResult = null, onAnalyze = null, onOpenWork = null, getActivatedAgents = listActivatedOfficeAgents, getWorks = listWorks } = {}) {
  if (typeof document === "undefined") return { refresh() {}, unmount() {} };
  let disposed = false;
  let signature = "";
  let simpleHost = null;
  let panelHost = null;
  const roleBindings = createOfficeRoleBindings();
  let officeStage = null;
  let accountDirectory = officeAccountDirectory();
  let accountDirectoryPending = null;
  const statusStore = createOfficeStatusStore({ getLocalWorks: getWorks, getAgentIds: () => getActivatedAgents().map(agent => agent.id) });
  const workspace = createOfficeWorkspace({ teamLive, gateway, onConfigure, onOpenResult, onAnalyze, onOpenWork,
    getWorks: statusStore.getWorks, getWork: statusStore.getWork, onRetryStatus: () => statusStore.refresh() });
  const onOpenAgent = agentId => {
    workspace.select(agentId);
    signature = "";
    refresh();
  };

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function restoreHost() {
    officeStage?.dispose();
    officeStage = null;
    if (simpleHost) {
      simpleHost.removeAttribute("data-sb-office-simple-host");
    }
    simpleHost = null;
  }

  function refresh() {
    if (disposed) return;
    const dashboard = document.querySelector(".office-dashboard");
    const nextSimpleHost = findOfficeStageHost(dashboard);
    const candidatePanel = dashboard ? findOfficeRightPanel(document) : null;
    const nextPanelHost = isUsableOfficeRightPanel(candidatePanel) ? candidatePanel : null;
    if (!dashboard || !nextSimpleHost) {
      restoreHost();
      panelHost = null;
      signature = "";
      return;
    }
    if (simpleHost !== nextSimpleHost) {
      restoreHost();
      simpleHost = nextSimpleHost;
      simpleHost.dataset.sbOfficeSimpleHost = "1";
      officeStage = createOfficeStage(simpleHost, roleBindings, onOpenAgent);
      signature = "";
    }
    if (panelHost !== nextPanelHost) {
      panelHost = nextPanelHost;
      signature = "";
    }
    if (panelHost) workspace.mount(panelHost);
    const snapshot = buildOfficeAgentRoster({ activatedAgents: getActivatedAgents(), works: statusStore.getWorks(), accounts: accountDirectory, teamLive });
    roleBindings.assign(snapshot.roster);
    workspace.refresh();
    const nextSignature = snapshot.roster.map((agent) => [agent.id, agent.name, agent.accountLabel, agent.state, agent.stateLabel, roleBindings.get(agent.id)].join(":"))
      .join("|");
    syncNativeAgentSummary(dashboard, snapshot);
    if (signature === nextSignature) return;
    signature = nextSignature;
    officeStage?.sync(snapshot.roster);
  }

  const observer = typeof MutationObserver === "function" ? new MutationObserver(refresh) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  const unsubscribeWork = subscribeWork(() => { refresh(); void statusStore.refresh(); });
  const unsubscribeStatus = statusStore.subscribe(refresh);
  const unsubscribeTeam = teamLive?.subscribe?.(refresh) || (() => {});
  const refreshAccountDirectory = async () => {
    if (disposed || accountDirectoryPending) return accountDirectoryPending;
    accountDirectoryPending = (async () => {
      try {
        const response = await fetch(`${receptionBaseUrl()}/v1/connectors/douyin/accounts`, {
          headers: { accept: "application/json" },
          cache: "no-store"
        });
        if (!response.ok) return;
        const result = await response.json().catch(() => null);
        if (!Array.isArray(result?.accounts)) return;
        accountDirectory = result.accounts;
        globalThis.__SALEBUDDY__ ||= {};
        globalThis.__SALEBUDDY__.douyinAccounts = [...accountDirectory];
        refresh();
      } catch {
        // Keep the office identity readable while the account source is unavailable.
      } finally {
        accountDirectoryPending = null;
      }
    })();
    return accountDirectoryPending;
  };
  const timer = globalThis.setInterval?.(() => {
    refresh();
    if (!document.hidden) {
      void statusStore.refresh();
      void refreshAccountDirectory();
    }
  }, 3000);
  const onVisibility = () => {
    refresh();
    if (!document.hidden) {
      void statusStore.refresh();
      void refreshAccountDirectory();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  void statusStore.refresh();
  void refreshAccountDirectory();
  refresh();

  return {
    refresh,
    select: onOpenAgent,
    setGateway: value => workspace.setGateway(value),
    unmount() {
      if (disposed) return;
      disposed = true;
      workspace.unmount();
      statusStore.dispose();
      unsubscribeStatus();
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      unsubscribeWork();
      unsubscribeTeam();
      if (timer != null) globalThis.clearInterval?.(timer);
      restoreHost();
      document.querySelectorAll(`#${VIDEO_LAYER_ID}`).forEach((node) => node.remove());
      style?.remove();
    }
  };
}
