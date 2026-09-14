/**
 * Customer-facing conversation workspace for the real Douyin inbox Agent.
 * Strategy settings are shared with Agent Square; business knowledge uses
 * the production agent.memory.* gateway actions consumed by the backend.
 */
import { el, openPage } from "./pages.js";
import { mountGrokBotAvatar } from "./grok-bot-avatar.js";
import { personAvatarUrl } from "./person-avatar.js";
import { douyinCloudTaskStore } from "../agents/douyin-cloud-state.js";
import { inboxStrategyStore } from "../agents/inbox-strategy-store.js";
import { accountAvatarSource, applyAuthoritativeManagedAccountDirectory, createRealtimeMockPreviewAccounts, getAuthorizedManagedAccounts, realtimeWorkPreviewMode } from "./realtime-work.js";
import { openAccountReceptionPage } from "./account-reception-page.js?v=20260914-grid-alignment-1";
import { BUSINESS_MATERIAL_ACCEPT, parseDelimitedRows, readBusinessMaterialFile } from "./business-material-import.js";

export { BUSINESS_MATERIAL_ACCEPT, parseDelimitedRows, readBusinessMaterialFile } from "./business-material-import.js";

const AGENT_ID = "mkt-dm-inbox";
const EMPTY_WORKSPACE_ILLUSTRATION = new URL("../../../assets/icon-none-CLa_dC9J.svg", import.meta.url).href;
const KNOWLEDGE_KINDS = new Set(["projectRules", "bestPractices"]);
const KIND_LABELS = Object.freeze({
  projectRules: "业务事实",
  bestPractices: "有效话术"
});
const SCOPE_LABELS = Object.freeze({
  task: "本次任务",
  project: "当前项目",
  agent: "私信客服",
  organization: "全组织"
});
const SOURCE_LABELS = Object.freeze({
  user: "手动添加",
  "file-import": "文件导入"
});

const CSS = `
.sb-cs{min-height:100%;padding:26px 30px 48px;color:#1f2329;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-cs *{box-sizing:border-box}.sb-cs button,.sb-cs input,.sb-cs textarea,.sb-cs select{font:inherit}
.sb-cs-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:4px 0 24px;border-bottom:1px solid rgba(15,15,15,.08)}
.sb-cs-agent{display:flex;align-items:center;gap:14px;min-width:0}.sb-cs-avatar{width:54px;height:54px;flex:none;border-radius:50%;overflow:hidden;background:#eef1f4}.sb-cs-avatar img{width:100%;height:100%;object-fit:cover}.sb-cs-avatar.sb-grok-avatar{border-radius:0;overflow:visible;background:transparent}.sb-cs-avatar.sb-grok-avatar .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-cs-agent-copy{min-width:0}.sb-cs-agent-copy h1{margin:0;font-size:24px;line-height:32px;font-weight:680;letter-spacing:0}.sb-cs-agent-copy p{margin:5px 0 0;color:#7a818b;font-size:12px;line-height:18px}
.sb-cs-use{height:40px;padding:0 16px;border:1px solid #1f2329;border-radius:8px;background:#1f2329;color:#fff;font-size:12px;font-weight:650;cursor:pointer}.sb-cs-use:hover{background:#383d45}.sb-cs-use:focus-visible{outline:3px solid rgba(31,35,41,.18);outline-offset:2px}
.sb-cs-context{display:flex;align-items:center;gap:9px;min-height:38px;margin-top:16px;padding:0 12px;border:1px solid #e2e6ea;border-radius:8px;background:#fff;color:#666e78;font-size:11px}.sb-cs-context-dot{width:7px;height:7px;border-radius:50%;background:#47a975}.sb-cs-context strong{color:#293039;font-weight:650}.sb-cs-context span:last-child{margin-left:auto;color:#9299a2}
.sb-cs-account-panel{margin-top:16px;padding:15px 16px;border:1px solid #dfe5ea;border-radius:12px;background:#fff}.sb-cs-account-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.sb-cs-account-panel-label{color:#7c858f;font-size:10px;font-weight:650;letter-spacing:.04em}.sb-cs-account-panel-status{display:inline-flex;align-items:center;gap:5px;color:#159965;font-size:10px;font-weight:650}.sb-cs-account-panel-status i{width:6px;height:6px;border-radius:50%;background:#19b879}.sb-cs-account-choice{display:flex;align-items:center;gap:12px;min-width:0}.sb-cs-account-avatar{display:grid;place-items:center;width:48px;height:48px;flex:none;overflow:hidden;border-radius:12px;background:#edf1f4;color:#4d5965;font-size:16px;font-weight:750}.sb-cs-account-avatar img{display:block;width:100%;height:100%;object-fit:cover}.sb-cs-account-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.sb-cs-account-name{overflow:hidden;color:#27313b;font-size:16px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.sb-cs-account-handle{overflow:hidden;color:#8a949e;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.sb-cs-account-select{min-width:112px;height:34px;padding:0 9px;border:1px solid #d8e0e6;border-radius:7px;background:#fff;color:#4e5965;font-size:11px;cursor:pointer}.sb-cs-account-select:focus{border-color:#58749d;outline:none;box-shadow:0 0 0 3px rgba(88,116,157,.1)}.sb-cs-account-panel-note{display:flex;align-items:center;gap:7px;margin-top:12px;padding-top:11px;border-top:1px solid #eef1f3;color:#9299a2;font-size:10px;line-height:16px}.sb-cs-account-panel-note i{width:6px;height:6px;flex:none;border-radius:50%;background:#47a975}.sb-cs-account-empty{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#7c858f;font-size:11px}.sb-cs-account-empty button{height:34px;padding:0 12px;border:1px solid #58749d;border-radius:7px;background:#fff;color:#466b9e;font-size:11px;font-weight:650;cursor:pointer}
.sb-cs-tabs{display:flex;gap:4px;margin-top:22px;padding:4px;border:1px solid #e2e6ea;border-radius:8px;background:#f2f4f6}.sb-cs-tab{height:38px;flex:1;border:0;border-radius:6px;background:transparent;color:#747c86;font-size:12px;font-weight:600;cursor:pointer}.sb-cs-tab:hover{color:#1f2329}.sb-cs-tab.is-active{background:#fff;color:#1f2329;box-shadow:0 2px 7px rgba(31,35,41,.08)}
.sb-cs-workspace{margin-top:18px}.sb-cs-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.sb-cs-section-head h2{margin:0;font-size:18px;line-height:25px;font-weight:680}.sb-cs-section-head p{max-width:700px;margin:5px 0 0;color:#7a818b;font-size:12px;line-height:19px}.sb-cs-section-head-actions{display:flex;align-items:center;flex:none;gap:8px}.sb-cs-import-button{height:36px;padding:0 13px;border:1px solid #58749d;border-radius:8px;background:#fff;color:#466b9e;font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap}.sb-cs-import-button:hover{background:#f4f7fb;border-color:#466b9e}.sb-cs-import-button:focus-visible{outline:3px solid rgba(88,116,157,.16);outline-offset:2px}
.sb-cs-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px;padding:20px 0;border-top:1px solid rgba(15,15,15,.08);border-bottom:1px solid rgba(15,15,15,.08)}
.sb-cs-field{display:grid;gap:7px;min-width:0;color:#59616b;font-size:11px;font-weight:600}.sb-cs-field.is-full{grid-column:1/-1}.sb-cs-field input,.sb-cs-field textarea,.sb-cs-field select{width:100%;border:1px solid #dce1e6;border-radius:8px;background:#fff;color:#1f2329;outline:none;font-size:12px;font-weight:400}.sb-cs-field input,.sb-cs-field select{height:40px;padding:0 11px}.sb-cs-field textarea{min-height:84px;padding:11px;resize:vertical;line-height:1.6}.sb-cs-field input:focus,.sb-cs-field textarea:focus,.sb-cs-field select:focus{border-color:#58749d;box-shadow:0 0 0 3px rgba(88,116,157,.1)}
.sb-cs-save-state{margin-top:12px;color:#718095;font-size:11px;line-height:18px}.sb-cs-save-state.is-error{color:#a15345}
.sb-cs-add{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:9px;align-items:start;padding:16px 0;border-top:1px solid rgba(15,15,15,.08);border-bottom:1px solid rgba(15,15,15,.08)}.sb-cs-add select,.sb-cs-add textarea{border:1px solid #dce1e6;border-radius:8px;background:#fff;color:#1f2329;outline:none;font:inherit;font-size:12px}.sb-cs-add select{height:40px;padding:0 10px}.sb-cs-add textarea{min-height:72px;padding:10px 11px;resize:vertical;line-height:1.55}.sb-cs-add button{height:40px;padding:0 14px;border:1px solid #1f2329;border-radius:8px;background:#1f2329;color:#fff;font-size:11px;font-weight:650;cursor:pointer}.sb-cs-add button:disabled{opacity:.5;cursor:wait}
.sb-cs-import-preview{display:grid;gap:12px;margin:-2px 0 16px;padding:14px;border:1px solid #cddcf2;border-radius:10px;background:#f7faff}.sb-cs-import-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sb-cs-import-preview-title{display:grid;gap:4px;min-width:0}.sb-cs-import-preview-title strong{overflow:hidden;color:#33465d;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.sb-cs-import-preview-title span{color:#7d8da2;font-size:10px}.sb-cs-import-preview-close{padding:0;border:0;background:transparent;color:#7d8da2;font-size:11px;cursor:pointer}.sb-cs-import-preview textarea{width:100%;min-height:150px;padding:10px 11px;border:1px solid #cdd9e8;border-radius:8px;background:#fff;color:#27313b;outline:none;font-size:12px;line-height:1.6;resize:vertical}.sb-cs-import-preview textarea:focus{border-color:#58749d;box-shadow:0 0 0 3px rgba(88,116,157,.1)}.sb-cs-import-preview-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sb-cs-import-preview-actions select{height:36px;min-width:112px;padding:0 9px;border:1px solid #cdd9e8;border-radius:8px;background:#fff;color:#4e5965;font-size:11px}.sb-cs-import-preview-actions button{height:36px;padding:0 13px;border:1px solid #cdd9e8;border-radius:8px;background:#fff;color:#466b9e;font-size:11px;font-weight:650;cursor:pointer}.sb-cs-import-preview-actions button.primary{border-color:#1f2329;background:#1f2329;color:#fff}.sb-cs-import-preview-actions button:disabled{opacity:.5;cursor:wait}.sb-cs-import-error{margin:-6px 0 14px;color:#a15345;font-size:11px;line-height:18px}.sb-cs-entry-source{padding:2px 6px;border-radius:5px;background:#eef4ff;color:#58749d}
@media(max-width:760px){.sb-cs{padding:20px 16px 36px}.sb-cs-hero{align-items:flex-start}.sb-cs-agent-copy h1{font-size:20px}.sb-cs-context{align-items:flex-start;flex-wrap:wrap;padding:10px 12px}.sb-cs-context span:last-child{width:100%;margin-left:16px}.sb-cs-form{grid-template-columns:1fr}.sb-cs-field.is-full{grid-column:auto}.sb-cs-add{grid-template-columns:1fr}.sb-cs-add button{width:100%}.sb-cs-section-head{align-items:stretch;flex-direction:column}.sb-cs-section-head-actions{justify-content:flex-start}.sb-cs-import-button{width:100%}.sb-cs-import-preview-actions{align-items:stretch;flex-direction:column}.sb-cs-import-preview-actions select,.sb-cs-import-preview-actions button{width:100%}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.dataset.salebuddy = "conversation-strategy";
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function activeEntries(entries) {
  return entries.filter((entry) => entry?.text && !["rolled-back", "deleted"].includes(entry.status));
}

export function conversationStrategyAccountId(account = {}) {
  const identity = account.identity || {};
  return String(identity.user_id || identity.uid || identity.secUid || identity.sec_uid || account.id || account.accountKey || "").trim();
}

export function selectConversationStrategyAccounts(accounts = null) {
  const authorized = getAuthorizedManagedAccounts(accounts)
    .filter((account) => account.privateReceptionEligible === true || account.privateReceptionEnabled === true);
  const byIdentity = new Map();
  for (const account of authorized) {
    const key = conversationStrategyAccountId(account);
    if (!key || byIdentity.has(key)) continue;
    byIdentity.set(key, account);
  }
  return Array.from(byIdentity.values());
}

export function createConversationStrategyMockAccounts() {
  return createRealtimeMockPreviewAccounts().map((account) => ({
    id: account.id,
    name: account.name,
    handle: account.handle,
    avatar: account.avatar,
    identity: { user_id: account.id, uniqueId: String(account.handle || "").replace(/^@+/, "") },
    receptionConfigured: true,
    privateReceptionEligible: true,
    privateReceptionEnabled: true,
    mock: true,
    mockScenario: account.mockScenario
  }));
}

function managedAccountProfiles(accounts = null, { configuredOnly = false } = {}) {
  return selectConversationStrategyAccounts(accounts)
    .filter((account) => !configuredOnly || account.receptionConfigured === true)
    .map((account) => {
      const identity = account.identity || {};
      const id = conversationStrategyAccountId(account);
      const name = [
        account.name,
        identity.accountName,
        identity.account_name,
        identity.nickname,
        identity.nick_name,
        identity.uniqueId
      ]
        .map((value) => String(value || "").trim())
        .find((value) => value && !["已授权抖音账号", "当前已授权抖音账号", "抖音账号", "账号名称未返回"].includes(value));
      const handle = String(account.handle || identity.uniqueId || identity.unique_id || "").trim();
      const avatar = account.avatar || accountAvatarSource({ ...account, identity }) || personAvatarUrl(account);
      return id ? {
        id,
        name: name || id,
        receptionConfigured: account.receptionConfigured === true,
        ...(handle ? { handle: handle.startsWith("@") ? handle : `@${handle}` } : {}),
        ...(avatar ? { avatar } : {}),
        identity
      } : null;
    })
    .filter(Boolean);
}

function accountName() {
  const task = douyinCloudTaskStore.get(AGENT_ID);
  const flow = task?.resumeFlow || {};
  const identity = flow.accountIdentity || {};
  const managed = managedAccountProfiles(null, { configuredOnly: true })[0];
  return [flow.account, identity.accountName, identity.account_name, identity.nickname, identity.nick_name]
    .map((value) => String(value || "").trim())
    .find((value) => value && !["已授权抖音账号", "当前已授权抖音账号", "抖音账号"].includes(value)) || managed?.name || "尚未连接抖音账号";
}

function currentAccountProfile() {
  const task = douyinCloudTaskStore.get(AGENT_ID);
  const flow = task?.resumeFlow || {};
  const identity = flow.accountIdentity || {};
  const id = String(flow.accountId || identity.secId || identity.sec_id || identity.uid || "").trim();
  const name = [flow.account, identity.accountName, identity.account_name, identity.nickname, identity.nick_name]
    .map((value) => String(value || "").trim())
    .find((value) => value && !["已授权抖音账号", "当前已授权抖音账号", "抖音账号"].includes(value)) || "";
  const handle = String(flow.accountHandle || identity.uniqueId || identity.unique_id || "").trim();
  const avatar = flow.accountAvatar || accountAvatarSource({ avatar: flow.accountAvatar, identity });
  if (id) return {
    id,
    name: name || id,
    ...(handle ? { handle: handle.startsWith("@") ? handle : `@${handle}` } : {}),
    ...(avatar ? { avatar } : {}),
    identity
  };
  return managedAccountProfiles(null, { configuredOnly: true })[0] || null;
}

export function mergeConversationStrategyProfiles({ saved = [], managed = [], current = null } = {}) {
  const profiles = new Map(managed.map((profile) => [profile.id, { ...profile }]));
  const managedByName = new Map();
  for (const profile of managed) {
    const name = String(profile?.name || "").trim();
    if (!name) continue;
    const matches = managedByName.get(name) || [];
    matches.push(profile);
    managedByName.set(name, matches);
  }

  if (current?.id) {
    const nameMatches = managedByName.get(String(current.name || "").trim()) || [];
    if (String(current.id).startsWith("douyin-agent:") && nameMatches.length === 1) {
      const managedProfile = profiles.get(nameMatches[0].id) || nameMatches[0];
      profiles.set(nameMatches[0].id, { ...current, ...managedProfile, id: nameMatches[0].id });
    } else {
      profiles.set(current.id, { ...(profiles.get(current.id) || {}), ...current });
    }
  }

  for (const profile of saved) {
    if (!profile?.id) continue;
    if (profiles.has(profile.id)) {
      profiles.set(profile.id, { ...profile, ...profiles.get(profile.id) });
      continue;
    }
    const nameMatches = managedByName.get(String(profile.name || "").trim()) || [];
    if (String(profile.id).startsWith("douyin-agent:") && nameMatches.length === 1) continue;
    profiles.set(profile.id, { ...profile });
  }
  return Array.from(profiles.values());
}

function accountProfiles(accounts = null) {
  if (realtimeWorkPreviewMode() === "style") return createConversationStrategyMockAccounts();
  const saved = inboxStrategyStore.listAccounts(AGENT_ID);
  const managed = managedAccountProfiles(accounts);
  for (const legacy of saved) {
    if (!String(legacy.id || "").startsWith("douyin-agent:")) continue;
    const matches = managed.filter((profile) => profile.name === legacy.name);
    if (matches.length !== 1) continue;
    const legacyStrategy = inboxStrategyStore.get(AGENT_ID, { accountId: legacy.id });
    const currentStrategy = inboxStrategyStore.get(AGENT_ID, { accountId: matches[0].id });
    if (legacyStrategy?.updatedAt && !currentStrategy?.updatedAt) {
      inboxStrategyStore.save(AGENT_ID, legacyStrategy, {
        accountId: matches[0].id,
        accountName: matches[0].name
      });
    }
  }
  const current = currentAccountProfile();
  const eligibleIds = new Set(managed.map((profile) => profile.id));
  return mergeConversationStrategyProfiles({ saved, managed, current })
    .filter((profile) => eligibleIds.has(profile.id));
}

/**
 * The strategy page is a management surface, not an authorization source.
 * Clear a stale browser handoff before it can be rendered as a live account.
 */
export function authoritativeConversationStrategyAccountProfiles(accounts = []) {
  if (realtimeWorkPreviewMode() === "style") return accountProfiles(accounts);
  const directory = applyAuthoritativeManagedAccountDirectory({}, Array.isArray(accounts) ? accounts : []);
  return accountProfiles(directory);
}

function mountAccountCardAvatar(container, profile) {
  container.textContent = "";
  const source = profile?.avatar || accountAvatarSource(profile || {});
  if (source) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      container.textContent = Array.from(String(profile?.name || "抖音账号").replace(/^@+/, ""))[0] || "抖";
    }, { once: true });
    container.appendChild(image);
    return;
  }
  container.textContent = Array.from(String(profile?.name || "抖音账号").replace(/^@+/, ""))[0] || "抖";
}

function switchAccount(state, accountId, rerender) {
  const selected = state.accounts.find((profile) => profile.id === accountId) || state.accounts[0] || null;
  state.accountId = selected?.id || "";
  state.accountName = selected?.name || state.accountId;
  state.strategy = inboxStrategyStore.get(AGENT_ID, { accountId: state.accountId });
  state.saveMessage = selected ? `已切换到 ${state.accountName} · 当前账号策略已加载` : "";
  rerender();
}

function renderAccountPanel(host, state, { onUseAgent, rerender }) {
  const panel = el("section", "sb-cs-account-panel");
  const head = el("div", "sb-cs-account-panel-head");
  const status = el("span", "sb-cs-account-panel-status");
  status.append(el("i"), el("span", null, state.accountId ? "已授权" : "未连接"));
  head.append(el("span", "sb-cs-account-panel-label", "当前承接账号"), status);
  panel.appendChild(head);
  const selected = state.accounts.find((profile) => profile.id === state.accountId) || null;
  if (!selected) {
    const empty = el("div", "sb-cs-account-empty", "还没有可用的抖音承接账号。完成首次授权后，账号会显示在这里。");
    if (onUseAgent) {
      const connect = el("button", null, "连接抖音账号");
      connect.type = "button";
      connect.addEventListener("click", () => onUseAgent?.());
      empty.appendChild(connect);
    }
    panel.appendChild(empty);
    host.appendChild(panel);
    return;
  }
  const choice = el("div", "sb-cs-account-choice");
  const avatar = el("div", "sb-cs-account-avatar");
  mountAccountCardAvatar(avatar, selected);
  const copy = el("div", "sb-cs-account-copy");
  copy.append(
    el("strong", "sb-cs-account-name", selected.name || selected.id),
    el("span", "sb-cs-account-handle", selected.handle || "抖音账号已授权")
  );
  choice.append(avatar, copy);
  if (state.accounts.length > 1) {
    const select = document.createElement("select");
    select.className = "sb-cs-account-select";
    select.setAttribute("aria-label", "切换承接账号");
    state.accounts.forEach((profile) => {
      const option = el("option", null, profile.name || profile.id);
      option.value = profile.id;
      option.selected = profile.id === state.accountId;
      select.appendChild(option);
    });
    select.addEventListener("change", () => switchAccount(state, select.value, rerender));
    choice.appendChild(select);
  }
  panel.appendChild(choice);
  const note = el("div", "sb-cs-account-panel-note");
  note.append(el("i"), el("span", null, "正在编辑此账号的承接策略 · 保存后下一次任务立即读取"));
  panel.appendChild(note);
  host.appendChild(panel);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function strategyField(label, control, full = false) {
  const field = el("label", `sb-cs-field${full ? " is-full" : ""}`, label);
  field.appendChild(control);
  return field;
}

function strategyInput(value, rows = 0) {
  const control = rows ? document.createElement("textarea") : document.createElement("input");
  control.value = value || "";
  if (rows) control.rows = rows;
  return control;
}

function renderStrategy(host, state, rerender) {
  const heading = el("div", "sb-cs-section-head");
  const copy = el("div");
  copy.append(el("h2", null, "告诉我怎样接待私信"), el("p", null, "这里的设置会直接影响我如何回答新私信：重点回答什么、用什么语气，以及哪些情况交给你。"));
  heading.appendChild(copy);
  host.appendChild(heading);

  const form = el("div", "sb-cs-form");
  const persist = (patch) => {
    state.strategy = inboxStrategyStore.save(AGENT_ID, { ...state.strategy, ...patch }, {
      accountId: state.accountId,
      accountName: state.accountName
    });
    state.saveMessage = `已保存 · ${formatTime(state.strategy.updatedAt)}`;
    rerender();
  };
  const objective = strategyInput(state.strategy.replyObjective, 3);
  const tone = strategyInput(state.strategy.replyTone);
  const rule = strategyInput(state.strategy.replyRule, 4);
  const handoff = strategyInput(state.strategy.handoffRules, 4);
  objective.placeholder = "例如：先解决用户问题，再邀请留下联系方式或预约沟通。";
  tone.placeholder = "例如：专业、亲切、简短，像资深客服在沟通。";
  rule.placeholder = "例如：产品功能、使用方法、适用人群可以直接回答；不确定的内容先不要猜。";
  handoff.placeholder = "例如：价格谈判、退款投诉、合同、效果承诺、无法确认的信息交给我。";
  objective.addEventListener("change", () => persist({ replyObjective: objective.value }));
  tone.addEventListener("change", () => persist({ replyTone: tone.value }));
  rule.addEventListener("change", () => persist({ replyRule: rule.value }));
  handoff.addEventListener("change", () => persist({ handoffRules: handoff.value }));
  form.append(
    strategyField("希望把对话推进到哪里？", objective, true),
    strategyField("希望我用什么语气回复？", tone, true),
    strategyField("哪些问题可以直接回答？", rule),
    strategyField("哪些情况交给你处理？", handoff)
  );
  host.appendChild(form);
  host.appendChild(el("div", "sb-cs-save-state", state.saveMessage || "修改后自动保存，并同步到 Agent 中心的私信承接流程。"));
}

function renderEntry(entry, reload, gateway) {
  const row = el("article", "sb-cs-entry");
  const body = el("div");
  body.appendChild(el("div", "sb-cs-entry-text", entry.text));
  const meta = el("div", "sb-cs-entry-meta");
  meta.append(
    el("span", "sb-cs-tag", KIND_LABELS[entry.kind] || entry.kind || "知识"),
    el("span", null, SCOPE_LABELS[entry.scope] || entry.scope || "私信客服"),
    ...(SOURCE_LABELS[entry.source] ? [el("span", "sb-cs-entry-source", SOURCE_LABELS[entry.source])] : []),
    el("span", null, formatTime(entry.updatedAt || entry.createdAt))
  );
  body.appendChild(meta);
  const remove = el("button", "sb-cs-delete", "删除");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await gateway.action("agent.memory.delete", { agentType: AGENT_ID, entryId: entry.id });
      await reload();
    } catch {
      remove.disabled = false;
    }
  });
  row.append(body, remove);
  return row;
}

function renderKnowledge(host, state, { gateway, reload, rerender }) {
  const heading = el("div", "sb-cs-section-head");
  const copy = el("div");
  copy.append(
    el("h2", null, "业务知识"),
    el("p", null, "只保存可用于回复客户的真实业务事实和已确认话术。可以直接添加，也可以导入资料后确认写入。")
  );
  const actions = el("div", "sb-cs-section-head-actions");
  heading.append(copy, actions);
  host.appendChild(heading);

  if (!gateway) {
    host.appendChild(el("div", "sb-cs-error", "知识服务尚未连接，当前不能读取或修改真实数据。"));
    return;
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = BUSINESS_MATERIAL_ACCEPT;
  fileInput.hidden = true;
  fileInput.setAttribute("aria-label", "导入业务资料文件");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    state.importBusy = true;
    state.importError = "";
    state.importPreview = null;
    rerender();
    try {
      state.importPreview = await readBusinessMaterialFile(file);
      state.importKind = "projectRules";
    } catch (error) {
      state.importError = error?.message || "资料解析失败，请换一个文件再试。";
    } finally {
      state.importBusy = false;
      rerender();
    }
  });
  const importButton = el("button", "sb-cs-import-button", state.importBusy ? "正在解析…" : "从文件导入");
  importButton.type = "button";
  importButton.disabled = state.importBusy;
  importButton.addEventListener("click", () => fileInput.click());
  actions.append(importButton, fileInput);

  if (state.importError) host.appendChild(el("div", "sb-cs-import-error", state.importError));
  if (state.importBusy) host.appendChild(el("div", "sb-cs-empty", "正在读取文件内容…"));
  if (state.importPreview) {
    const preview = el("section", "sb-cs-import-preview");
    const previewHead = el("div", "sb-cs-import-preview-head");
    const previewTitle = el("div", "sb-cs-import-preview-title");
    const rowHint = state.importPreview.rowCount ? ` · ${state.importPreview.rowCount} 行` : "";
    previewTitle.append(
      el("strong", null, state.importPreview.name),
      el("span", null, `已解析 ${state.importPreview.charCount} 个字${rowHint} · 确认前可修改内容`)
    );
    const close = el("button", "sb-cs-import-preview-close", "取消");
    close.type = "button";
    close.addEventListener("click", () => {
      state.importPreview = null;
      state.importError = "";
      rerender();
    });
    previewHead.append(previewTitle, close);
    const importedText = document.createElement("textarea");
    importedText.value = state.importPreview.content;
    importedText.setAttribute("aria-label", "待导入的业务资料");
    importedText.addEventListener("input", () => {
      state.importPreview.content = importedText.value;
      state.importPreview.charCount = importedText.value.length;
    });
    const previewActions = el("div", "sb-cs-import-preview-actions");
    const importKind = document.createElement("select");
    importKind.setAttribute("aria-label", "导入资料类型");
    for (const value of KNOWLEDGE_KINDS) {
      const option = el("option", null, KIND_LABELS[value]);
      option.value = value;
      option.selected = value === (state.importKind || "projectRules");
      importKind.appendChild(option);
    }
    importKind.addEventListener("change", () => { state.importKind = importKind.value; });
    const append = el("button", "primary", "加入业务知识");
    append.type = "button";
    append.addEventListener("click", async () => {
      const value = importedText.value.trim();
      if (!value) { importedText.focus(); return; }
      append.disabled = true;
      state.error = null;
      try {
        await gateway.action("agent.memory.append", {
          agentType: AGENT_ID,
          entry: { kind: importKind.value, text: value, scope: "agent", source: "file-import" }
        });
        state.importPreview = null;
        state.importError = "";
        await reload();
      } catch (error) {
        state.error = error?.message || "导入资料保存失败";
        append.disabled = false;
        rerender();
      }
    });
    previewActions.append(importKind, append);
    preview.append(previewHead, importedText, previewActions);
    host.appendChild(preview);
  }

  const add = el("div", "sb-cs-add");
  const kind = document.createElement("select");
  for (const value of KNOWLEDGE_KINDS) {
    const option = el("option", null, KIND_LABELS[value]);
    option.value = value;
    kind.appendChild(option);
  }
  const text = document.createElement("textarea");
  text.placeholder = "例如：标准版定价为 299 元，当前没有未确认优惠。";
  const submit = el("button", null, "添加知识");
  submit.type = "button";
  submit.addEventListener("click", async () => {
    const value = text.value.trim();
    if (!value) { text.focus(); return; }
    submit.disabled = true;
    try {
      await gateway.action("agent.memory.append", {
        agentType: AGENT_ID,
        entry: { kind: kind.value, text: value, scope: "agent", source: "user" }
      });
      text.value = "";
      await reload();
    } catch (error) {
      state.error = error?.message || "保存失败";
      submit.disabled = false;
      rerender();
    }
  });
  add.append(kind, text, submit);
  host.appendChild(add);
  if (state.error) host.appendChild(el("div", "sb-cs-error", state.error));

  const entries = activeEntries(state.entries).filter((entry) => KNOWLEDGE_KINDS.has(entry.kind));
  if (!entries.length) {
    host.appendChild(el("div", "sb-cs-empty", "还没有业务知识。添加后，私信客服会在下一次回复时读取。"));
    return;
  }
  const list = el("div", "sb-cs-list");
  for (const entry of entries.slice().reverse()) list.appendChild(renderEntry(entry, reload, gateway));
  host.appendChild(list);
}

/**
 * Open the integrated conversation strategy workspace.
 */
export function openConversationStrategyPage({ onClose = null, initialAccountId = "" } = {}) {
  return openAccountReceptionPage({
    getAccounts: authoritativeConversationStrategyAccountProfiles,
    onClose,
    initialAccountId,
    renderEmpty: (root) => {
      const empty = el("section", "sb-reception-empty");
      const inner = el("div", "sb-reception-empty-inner");
      const art = el("div", "sb-reception-empty-art");
      const image = document.createElement("img");
      image.src = EMPTY_WORKSPACE_ILLUSTRATION;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      art.appendChild(image);
      const copy = el("div", "sb-reception-empty-copy");
      copy.append(
        el("strong", null, "还没有启用私信承接"),
        el("span", null, "对话策略只管理已经开始承接私信的抖音账号。找人、分析和首次触达不需要在这里配置。")
      );
      const actions = el("div", "sb-reception-empty-actions");
      const manager = el("button", "primary sb-reception-empty-action", "使用获客专家");
      const inbox = el("button", "sb-reception-empty-action is-secondary", "使用私信客服");
      manager.type = "button";
      inbox.type = "button";
      manager.addEventListener("click", () => {
        void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({ initialAgentId: "mkt-comment-acquisition" }));
      });
      inbox.addEventListener("click", () => {
        void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({ initialAgentId: "mkt-dm-inbox" }));
      });
      actions.append(manager, inbox);
      inner.append(
        art,
        el("span", "sb-reception-empty-eyebrow", "私信承接"),
        copy,
        actions,
        el("span", "sb-reception-empty-footnote", "完成账号绑定、接待策略保存并启动承接后，这个账号会自动显示在这里。")
      );
      empty.appendChild(inner);
      root.appendChild(empty);
    }
  });
}

function openLegacyConversationStrategyPage({ gateway = null, onUseAgent = null, onClose = null } = {}) {
  ensureStyle();
  const page = openPage({ title: "对话策略", onClose });
  page.root.querySelector(".sb-page-head")?.remove();
  const root = el("div", "sb-cs notranslate");
  root.setAttribute("translate", "no");
  page.body.appendChild(root);

  const accounts = accountProfiles();
  const initialAccount = currentAccountProfile() || accounts[0] || null;
  const state = {
    tab: "strategy",
    accounts,
    accountId: initialAccount?.id || "",
    accountName: initialAccount?.name || accountName(),
    strategy: inboxStrategyStore.get(AGENT_ID, { accountId: initialAccount?.id || "" }),
    entries: [],
    loading: Boolean(gateway),
    error: null,
    saveMessage: "",
    importPreview: null,
    importKind: "projectRules",
    importBusy: false,
    importError: ""
  };
  let disposed = false;

  const loadEntries = async () => {
    if (!gateway) { state.loading = false; render(); return; }
    state.loading = true;
    state.error = null;
    render();
    try {
      const result = await gateway.action("agent.memory.list", { agentType: AGENT_ID });
      if (disposed) return;
      state.entries = Array.isArray(result?.data?.entries) ? result.data.entries : [];
    } catch (error) {
      if (disposed) return;
      state.entries = [];
      state.error = error?.message || "知识读取失败";
    } finally {
      if (!disposed) { state.loading = false; render(); }
    }
  };

  const refreshAuthorizedAccounts = async () => {
    const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
      || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
      || "http://127.0.0.1:6681";
    try {
      const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/connectors/douyin/accounts`, {
        headers: { accept: "application/json" }
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => null);
      if (disposed) return;
      const remoteAccounts = Array.isArray(result?.accounts) ? result.accounts : [];
      globalThis.__SALEBUDDY__ ||= {};
      globalThis.__SALEBUDDY__.douyinAccounts = remoteAccounts;
      const refreshed = accountProfiles(remoteAccounts);
      if (!refreshed.length) return;
      state.accounts = refreshed;
      const selected = refreshed.find((profile) => profile.id === state.accountId) || refreshed[0];
      state.accountId = selected.id;
      state.accountName = selected.name;
      state.strategy = inboxStrategyStore.get(AGENT_ID, { accountId: selected.id });
      render();
    } catch {
      // Keep the last verified account directory when the backend is unavailable.
    }
  };

  const render = () => {
    if (disposed) return;
    root.textContent = "";
    const hero = el("div", "sb-cs-hero");
    const agent = el("div", "sb-cs-agent");
    const avatar = el("div", "sb-cs-avatar");
    mountGrokBotAvatar(avatar, AGENT_ID, { alt: "私信客服", state: "idle", trackPointer: false, mode: "conversation-strategy" });
    const copy = el("div", "sb-cs-agent-copy");
    copy.append(el("h1", null, "私信客服"), el("p", null, "对话策略决定如何回复，业务知识提供可靠事实。"));
    agent.append(avatar, copy);
    hero.appendChild(agent);
    root.appendChild(hero);

    renderAccountPanel(root, state, { onUseAgent, rerender: render });

    const tabs = el("div", "sb-cs-tabs");
    for (const item of [
      ["strategy", "承接策略"],
      ["knowledge", `业务知识${state.loading ? "" : ` · ${activeEntries(state.entries).filter((entry) => KNOWLEDGE_KINDS.has(entry.kind)).length}`}`]
    ]) {
      const tab = el("button", `sb-cs-tab${state.tab === item[0] ? " is-active" : ""}`, item[1]);
      tab.type = "button";
      tab.addEventListener("click", () => { state.tab = item[0]; state.error = null; render(); });
      tabs.appendChild(tab);
    }
    root.appendChild(tabs);

    const workspace = el("section", "sb-cs-workspace");
    if (state.tab === "strategy") renderStrategy(workspace, state, render);
    else if (state.loading) workspace.appendChild(el("div", "sb-cs-empty", "正在读取真实数据…"));
    else renderKnowledge(workspace, state, { gateway, reload: loadEntries, rerender: render });
    root.appendChild(workspace);
  };

  render();
  void loadEntries();
  void refreshAuthorizedAccounts();

  const originalClose = page.close;
  page.close = () => { disposed = true; originalClose(); };
  return page;
}
