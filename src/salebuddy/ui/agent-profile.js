/**
 * ui/agent-profile.js
 * Agent 详情页（PRD 第 3 节）：通讯录成员「配置」页签的完整版。
 * 数据：gateway agent.profile.get / agent.memory.list（实时，编辑后回写），
 *       resource-store（任务历史 / Token 消耗 / 质量数据），file-store（文件产出）。
 * 可编辑（PRD：调整岗位、能力、权限和预算）：岗位职责、技能、权限、预算；
 * 可训练：追加记忆（用户规则/反馈/经验），支持回退版本。
 */
import { el } from "./pages.js";
import { listFiles } from "../agents/file-store.js";
import { getState as getResourceState, KIND_LABELS } from "../agents/resource-store.js";
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { openFileCenterPage } from "./file-center.js";
import { BRAND } from "../brand.js";
import { fillProfileDefaults, mergeProfilePatch } from "../agents/model.js";
import { marketplaceProfileSeed } from "../agents/marketplace.js";
import { saveAgentProfile } from "../agents/registry.js";

const CSS = `
.sb-ap{padding:18px 26px 34px;overflow-y:auto;flex:1;min-height:0}
.sb-ap-sec{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:14px 18px;margin-bottom:12px}
.sb-ap-title{font-size:11.5px;font-weight:600;color:#8A8F99;letter-spacing:.04em;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.sb-ap-title .sb-ap-edit{margin-left:auto;font-size:11px;color:#3B6BD4;cursor:pointer;font-weight:500}
.sb-ap-title .sb-ap-edit:hover{text-decoration:underline}
.sb-ap-kv{display:flex;font-size:12.5px;color:#1F2329;padding:4px 0;gap:12px;line-height:1.6}
.sb-ap-kv b{font-weight:500;color:#5A5E66;flex:none;width:64px}
.sb-ap-tags{display:flex;flex-wrap:wrap;gap:6px}
.sb-ap-tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:3px 9px;border-radius:8px;background:rgba(15,15,15,0.05);color:#3F434A}
.sb-ap-tag.sb-skill{background:rgba(76,154,255,0.12);color:#3B6BD4;font-weight:600}
.sb-ap-tag.sb-tool{background:rgba(87,178,106,0.13);color:#2F7D3F;font-weight:600}
.sb-ap-tag.sb-warn{background:rgba(232,99,99,0.1);color:#C4453C}
.sb-ap-tag.sb-gold{background:rgba(232,163,61,0.14);color:#B87A1E;font-weight:600}
.sb-ap-tagx{cursor:pointer;color:#B0B4BB;font-size:12px;line-height:1}
.sb-ap-tagx:hover{color:#C4453C}
.sb-ap-add{display:inline-flex;align-items:center;height:22px;border:1px dashed rgba(15,15,15,0.2);border-radius:8px;padding:0 8px;font-size:11.5px;color:#8A8F99;background:none;cursor:pointer}
.sb-ap-add:hover{border-color:#3B6BD4;color:#3B6BD4}
.sb-ap-addinput{width:120px;border:1px solid rgba(76,154,255,0.5);border-radius:8px;padding:3px 8px;font-size:11.5px;font-family:inherit;outline:none}
.sb-ap-empty{font-size:12px;color:#B0B4BB;padding:2px 0}
.sb-ap-soul{font-size:12.5px;color:#3F434A;line-height:1.8}
.sb-ap-soul li{margin:2px 0}
.sb-ap-soul ul{padding-left:18px;margin:4px 0}
.sb-ap-soul-label{font-weight:700;color:#6B7280;margin-top:8px}

.sb-ap-statgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sb-ap-stat{background:rgba(15,15,15,0.025);border-radius:9px;padding:8px 12px}
.sb-ap-statnum{font-size:16px;font-weight:700;color:#1F2329;font-variant-numeric:tabular-nums}
.sb-ap-statnum small{font-size:10.5px;font-weight:500;color:#8A8F99;margin-left:2px}
.sb-ap-statlabel{font-size:10.5px;color:#8A8F99;margin-top:2px}

.sb-ap-statusline{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#1F2329;padding:3px 0}
.sb-ap-dot{width:7px;height:7px;border-radius:50%;background:#57B26A;flex:none}
.sb-ap-dot.sb-busy{background:#E8A33D}
.sb-ap-dot.sb-waiting{background:#D45B5B}

.sb-ap-table{width:100%;border-collapse:collapse;font-size:12px}
.sb-ap-table th{text-align:left;color:#8A8F99;font-weight:500;font-size:11px;padding:4px 8px 6px 0;border-bottom:1px solid rgba(15,15,15,0.06)}
.sb-ap-table td{padding:6px 8px 6px 0;border-bottom:1px solid rgba(15,15,15,0.04);color:#1F2329}
.sb-ap-table tr:last-child td{border-bottom:none}
.sb-ap-table .sb-num{text-align:right;font-variant-numeric:tabular-nums}

.sb-ap-file{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;cursor:pointer;font-size:12.5px;color:#1F2329}
.sb-ap-file:hover{background:rgba(76,154,255,0.06)}
.sb-ap-fileico{flex:none;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.sb-ap-fileico.sb-sheet{background:rgba(87,178,106,0.14);color:#2F7D3F}
.sb-ap-fileico.sb-doc{background:rgba(76,154,255,0.12);color:#3B6BD4}
.sb-ap-filesub{margin-left:auto;flex:none;font-size:10.5px;color:#B0B4BB}

.sb-ap-kind{display:flex;align-items:center;gap:10px;padding:4px 0;font-size:12px}
.sb-ap-kindlabel{flex:none;width:64px;color:#3F434A}
.sb-ap-kindbar{flex:1;height:6px;border-radius:3px;background:rgba(15,15,15,0.05);overflow:hidden}
.sb-ap-kindbar i{display:block;height:100%;border-radius:3px}
.sb-ap-kindnum{flex:none;width:64px;text-align:right;font-weight:600;color:#1F2329;font-variant-numeric:tabular-nums}

.sb-ap-mem{border:1px solid rgba(15,15,15,0.06);border-radius:9px;padding:8px 12px;margin-bottom:7px;background:#fff}
.sb-ap-memtext{font-size:12.5px;color:#1F2329;line-height:1.6}
.sb-ap-memmeta{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:10.5px;color:#B0B4BB}
.sb-ap-memkind{padding:1px 7px;border-radius:999px;background:rgba(76,154,255,0.1);color:#3B6BD4;font-weight:600}
.sb-ap-memkind.sb-feedback{background:rgba(232,163,61,0.14);color:#B87A1E}
.sb-ap-memkind.sb-lessons{background:rgba(143,107,216,0.12);color:#7A5CCE}
.sb-ap-memkind.sb-best{background:rgba(87,178,106,0.13);color:#2F7D3F}
.sb-ap-memrollback{margin-left:auto;cursor:pointer;color:#8A8F99}
.sb-ap-memrollback:hover{color:#C4453C}
.sb-ap-memrolled{opacity:.55}
.sb-ap-train{display:flex;gap:8px;margin-bottom:12px}
.sb-ap-train select{flex:none;border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;color:#1F2329;background:#fff;outline:none}
.sb-ap-train input{flex:1;border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:6px 10px;font-size:12px;font-family:inherit;color:#1F2329;outline:none}
.sb-ap-train input:focus{border-color:rgba(76,154,255,0.55)}
.sb-ap-train button{flex:none;border:none;border-radius:8px;padding:0 14px;font-size:12px;font-weight:600;background:#1F2329;color:#fff;cursor:pointer}
.sb-ap-train button:hover{background:#3F434A}

.sb-ap-budget{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
.sb-ap-bfield{display:flex;align-items:center;gap:8px;font-size:12px;color:#5A5E66}
.sb-ap-bfield span{flex:none;width:76px}
.sb-ap-bfield input,.sb-ap-bfield select{flex:1;min-width:0;border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:5px 9px;font-size:12px;font-family:inherit;color:#1F2329;outline:none;background:#fff}
.sb-ap-bfield input:focus{border-color:rgba(76,154,255,0.55)}
.sb-ap-save{margin-top:10px;display:flex;align-items:center;gap:10px}
.sb-ap-savebtn{border:none;border-radius:8px;padding:7px 18px;font-size:12px;font-weight:600;background:#1F2329;color:#fff;cursor:pointer}
.sb-ap-savebtn:hover{background:#3F434A}
.sb-ap-saved{font-size:11.5px;color:#2F7D3F;font-weight:600}
.sb-ap-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.sb-ap-editnote{margin-right:auto;font-size:11.5px;color:#8A8F99}
.sb-ap-editbtn,.sb-ap-cancelbtn{border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:6px 13px;font-size:12px;font-family:inherit;color:#3F434A;background:#fff;cursor:pointer}
.sb-ap-editbtn{border-color:rgba(59,107,212,.25);color:#3B6BD4}
.sb-ap-editbtn:hover,.sb-ap-cancelbtn:hover{border-color:#3B6BD4;color:#3B6BD4}
.sb-ap-toolbar .sb-ap-savebtn{padding:6px 15px}
.sb-ap-field{width:100%;border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:6px 9px;font-size:12.5px;font-family:inherit;color:#1F2329;background:#fff;outline:none;box-sizing:border-box}
.sb-ap-field:focus,.sb-ap-textarea:focus{border-color:rgba(76,154,255,0.6)}
.sb-ap-textarea{width:100%;min-height:76px;resize:vertical;border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:7px 9px;font-size:12.5px;line-height:1.7;font-family:inherit;color:#1F2329;background:#fff;outline:none;box-sizing:border-box}
.sb-ap-editing{border-color:rgba(76,154,255,0.22);box-shadow:0 0 0 2px rgba(76,154,255,0.04)}
.sb-ap-loading{padding:30px 0;text-align:center;font-size:12px;color:#B0B4BB}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const MEM_KIND_LABELS = {
  userRules: "用户规则",
  projectRules: "项目记忆",
  lessons: "岗位经验",
  feedback: "用户反馈",
  bestPractices: "最佳实践"
};
const MEM_KIND_CLASS = { feedback: "sb-feedback", lessons: "sb-lessons", bestPractices: "sb-best" };

/* 各岗位的默认「灵魂 / 技能 / 工具 / 范围」展示值（档案为空时补齐，不落库） */
const SECTION_DEFAULTS = {
  main: {
    soul: ["先理解目标，再拆解执行", "质量不达标不交付", "成本透明，每一笔可追溯"],
    skills: ["目标理解", "任务拆解", "团队协调", "质量审核"],
    tools: ["全员调度", "任务看板", "审批流"],
    scope: { dataAccess: ["全部项目组", "组织知识库"], forbiddenZones: ["用户私人文件"] }
  },
  "Browser Agent": {
    soul: ["来源不明的线索不采纳", "每条线索标注出处", "宁缺毋滥"],
    skills: ["全网检索", "主页分析", "联系方式补全", "真实性验证"],
    tools: ["全网搜索", "地图采集", "工商数据"],
    scope: { dataAccess: ["公开网页", "工商公开信息"], forbiddenZones: ["付费墙数据", "个人隐私数据"] }
  },
  "Search Agent": {
    soul: ["重复数据必须合并", "评分依据可解释", "结论附数据支撑"],
    skills: ["数据清洗", "线索评分", "来源核验", "归因分析"],
    tools: ["表格", "图表", "数据采购接口"],
    scope: { dataAccess: ["项目共享文件", "采购数据"], forbiddenZones: ["其他项目原始数据"] }
  },
  "App Agent": {
    soul: ["不承诺做不到的事", "话术不含夸大表述", "频控优先，不打扰客户"],
    skills: ["触达策略", "沟通节奏设计", "转化路径评估"],
    tools: ["邮箱", "企业微信", "短信"],
    scope: { dataAccess: ["线索清单", "话术库"], forbiddenZones: ["客户支付信息"] }
  },
  "File Agent": {
    soul: ["产出即可用", "格式统一规范", "每份文件可追溯作者"],
    skills: ["话术撰写", "报告生成", "文件管理"],
    tools: ["文档", "素材库", "模板库"],
    scope: { dataAccess: ["项目共享文件", "素材库"], forbiddenZones: ["其他成员私有文件"] }
  },
  "Computer Agent": {
    soul: ["操作前先备份", "危险命令需审批", "环境变更要记录"],
    skills: ["脚本自动化", "环境操作", "工具集成"],
    tools: ["终端", "云电脑"],
    scope: { dataAccess: ["工作区"], forbiddenZones: ["系统目录", "核心代码"] }
  }
};

function sectionDefaults(agentType, profile) {
  const d = SECTION_DEFAULTS[agentType] || {};
  return {
    soul: (profile.soul?.principles?.length ? profile.soul.principles : d.soul) || [],
    skills: (profile.skills?.length ? profile.skills : d.skills) || [],
    tools: (profile.tools?.length ? profile.tools : d.tools) || [],
    scope: {
      dataAccess: (profile.scope?.dataAccess?.length ? profile.scope.dataAccess : d.scope?.dataAccess) || [],
      forbiddenZones: (profile.scope?.forbiddenZones?.length ? profile.scope.forbiddenZones : d.scope?.forbiddenZones) || []
    }
  };
}

function yuan(n) {
  return `¥${(Math.round(n * 100) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* 标签组：display 模式只读；edit 模式可删可加 */
function tagList(items, { tagClass = "", editable = false, onChange = null } = {}) {
  const box = el("div", "sb-ap-tags");
  if (!items.length && !editable) {
    box.appendChild(el("span", "sb-ap-empty", "暂无"));
    return box;
  }
  items.forEach((item, index) => {
    const tag = el("span", `sb-ap-tag${tagClass ? ` ${tagClass}` : ""}`, item);
    if (editable) {
      const x = el("span", "sb-ap-tagx", "✕");
      x.addEventListener("click", () => onChange?.(items.filter((_, i) => i !== index)));
      tag.appendChild(x);
    }
    box.appendChild(tag);
  });
  if (editable) {
    const add = el("button", "sb-ap-add", "+ 添加");
    add.addEventListener("click", () => {
      const input = el("input", "sb-ap-addinput");
      input.placeholder = "回车确认";
      add.replaceWith(input);
      input.focus();
      const commit = () => {
        const value = input.value.trim();
        if (value) onChange?.([...items, value]);
        else input.replaceWith(add);
      };
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") commit(); if (event.key === "Escape") input.replaceWith(add); });
      input.addEventListener("blur", commit);
    });
    box.appendChild(add);
  }
  return box;
}

/**
 * 渲染完整 Agent 详情页到容器（异步取数，先出骨架再填充）。
 * deps: { gateway, teamLive }
 */
export async function renderAgentProfile(container, agentType, fallbackProfile, { gateway, teamLive } = {}) {
  ensureStyle();
  const root = el("div", "sb-ap notranslate");
  root.setAttribute("translate", "no");
  root.appendChild(el("div", "sb-ap-loading", "读取员工档案…"));
  container.appendChild(root);

  let disposed = false;
  let localProfile = fillProfileDefaults(fallbackProfile || {}, marketplaceProfileSeed(agentType));
  let editMode = false;
  let draft = null;
  let saving = false;
  let saveNotice = "";
  let renderVersion = 0;
  const observer = new MutationObserver(() => { if (!root.isConnected) { disposed = true; observer.disconnect(); } });
  observer.observe(document.body, { childList: true, subtree: true });

  async function fetchProfile() {
    if (gateway) {
      try {
        const profile = (await gateway.action("agent.profile.get", { agentType }))?.data?.profile;
        if (profile) return fillProfileDefaults(profile, marketplaceProfileSeed(agentType));
      } catch { /* 用兜底档案 */ }
    }
    return fillProfileDefaults(localProfile, marketplaceProfileSeed(agentType));
  }

  async function savePatch(patch) {
    if (!gateway) return null;
    try {
      return (await gateway.action("agent.profile.update", { agentType, patch }))?.data?.profile || null;
    } catch { return null; }
  }

  function cloneProfile(profile) {
    return JSON.parse(JSON.stringify(profile || {}));
  }

  function createDraft(profile) {
    const next = cloneProfile(profile);
    const defaults = sectionDefaults(agentType, next);
    next.identity = { ...(next.identity || {}) };
    next.soul = { ...(next.soul || {}), principles: defaults.soul.slice() };
    next.skills = (next.skills?.length ? next.skills : defaults.skills).slice();
    next.tools = (next.tools?.length ? next.tools : defaults.tools).slice();
    next.scope = {
      ...(next.scope || {}),
      dataAccess: defaults.scope.dataAccess.slice(),
      forbiddenZones: defaults.scope.forbiddenZones.slice()
    };
    next.role = { ...(next.role || {}) };
    next.permission = { ...(next.permission || {}) };
    next.budget = { ...(next.budget || {}) };
    return next;
  }

  function updateDraft(patch) {
    draft = mergeProfilePatch(draft || {}, patch);
  }

  async function commitDraft() {
    if (!draft || saving) return;
    saving = true;
    const current = await fetchProfile();
    const patch = {
      identity: draft.identity,
      soul: draft.soul,
      role: draft.role,
      skills: draft.skills,
      tools: draft.tools,
      scope: draft.scope,
      permission: draft.permission,
      budget: draft.budget
    };
    const merged = mergeProfilePatch(current, patch);
    const persisted = await savePatch(patch);
    localProfile = persisted || saveAgentProfile(merged);
    saving = false;
    editMode = false;
    draft = null;
    saveNotice = "配置已保存";
    await render();
    window.setTimeout(() => {
      saveNotice = "";
      if (!editMode && !disposed) render();
    }, 1800);
  }

  async function render() {
    if (disposed || !root.isConnected) return;
    const version = ++renderVersion;
    const profile = editMode && draft ? draft : await fetchProfile();
    if (disposed || !root.isConnected || version !== renderVersion) return;
    const name = profile.identity?.name || agentType;
    const defaults = sectionDefaults(agentType, profile);
    const status = teamLive?.getStatusOf?.(agentType) || { state: TEAM_STATES.IDLE, currentTask: null, activeConversations: 0, waitingApproval: false };
    const editable = editMode;
    const canTrain = !!gateway;

    // 运行数据（按成员名归集）
    const resources = getResourceState();
    const myEntries = resources.entries.filter((e) => e.agent === name);
    const myTotal = myEntries.reduce((sum, e) => sum + e.amount, 0);
    const myTaskIds = new Set(myEntries.map((e) => e.taskId).filter(Boolean));
    const myTasks = resources.tasks.filter((t) => myTaskIds.has(t.taskId));
    const myFiles = listFiles().filter((f) => f.createdBy === name);

    root.textContent = "";

    const toolbar = el("div", "sb-ap-toolbar");
    if (editMode) {
      toolbar.appendChild(el("span", "sb-ap-editnote", saving ? "正在保存配置…" : "编辑配置中"));
      const cancelBtn = el("button", "sb-ap-cancelbtn", "取消");
      cancelBtn.disabled = saving;
      cancelBtn.addEventListener("click", () => { if (!saving) { editMode = false; draft = null; render(); } });
      const saveBtn = el("button", "sb-ap-savebtn", "保存配置");
      saveBtn.disabled = saving;
      saveBtn.addEventListener("click", commitDraft);
      toolbar.append(cancelBtn, saveBtn);
    } else {
      toolbar.appendChild(el("span", "sb-ap-editnote", saveNotice || "员工能力与权限配置"));
      const editBtn = el("button", "sb-ap-editbtn", "编辑配置");
      editBtn.addEventListener("click", () => { editMode = true; draft = createDraft(profile); render(); });
      toolbar.appendChild(editBtn);
    }
    root.appendChild(toolbar);

    // ── 当前状态 ──
    const statusSec = el("div", "sb-ap-sec");
    statusSec.appendChild(el("div", "sb-ap-title", "当前状态"));
    const line = el("div", "sb-ap-statusline");
    const dotCls = status.state === TEAM_STATES.WORKING ? "sb-busy" : status.state === TEAM_STATES.BLOCKED ? "sb-waiting" : "";
    line.append(el("span", `sb-ap-dot ${dotCls}`), el("span", null, TEAM_STATE_LABELS[status.state] || "空闲"));
    statusSec.appendChild(line);
    if (status.waitingApproval) statusSec.appendChild(el("div", "sb-ap-statusline", "有任务正等待你审批"));
    root.appendChild(statusSec);

    // ── 身份 IDENTITY ──
    const idSec = el("div", `sb-ap-sec${editMode ? " sb-ap-editing" : ""}`);
    idSec.appendChild(el("div", "sb-ap-title", "身份 IDENTITY"));
    const kv = (label, value) => {
      const row = el("div", "sb-ap-kv");
      row.appendChild(el("b", null, label));
      row.appendChild(el("span", null, value || "—"));
      return row;
    };
    const identityField = (label, key, value, placeholder = "", target = draft.identity) => {
      const row = el("div", "sb-ap-kv");
      row.appendChild(el("b", null, label));
      const input = el("input", "sb-ap-field");
      input.value = value || "";
      input.placeholder = placeholder;
      input.addEventListener("input", () => { target[key] = input.value; });
      row.appendChild(input);
      return row;
    };
    if (editMode) {
      idSec.appendChild(identityField("姓名", "name", profile.identity?.name, "员工名称"));
      idSec.appendChild(identityField("职位", "title", profile.identity?.title, "岗位名称"));
      idSec.appendChild(identityField("语言风格", "languageStyle", profile.identity?.languageStyle, "默认"));
      idSec.appendChild(identityField("对外签名", "signature", profile.identity?.signature, "无"));
    } else {
      idSec.appendChild(kv("姓名", name));
      idSec.appendChild(kv("职位", profile.identity?.title));
      idSec.appendChild(kv("语言风格", profile.identity?.languageStyle || "默认"));
      idSec.appendChild(kv("对外签名", profile.identity?.signature || "无"));
    }
    root.appendChild(idSec);

    // ── 灵魂 SOUL ──
    const soulSec = el("div", `sb-ap-sec${editMode ? " sb-ap-editing" : ""}`);
    soulSec.appendChild(el("div", "sb-ap-title", "灵魂 SOUL"));
    const soulBox = el("div", "sb-ap-soul");
    if (editMode) {
      const principles = el("textarea", "sb-ap-textarea");
      principles.value = (profile.soul?.principles || defaults.soul).join("\n");
      principles.placeholder = "每行一条工作原则";
      principles.addEventListener("input", () => { draft.soul.principles = principles.value.split("\n").map((item) => item.trim()).filter(Boolean); });
      const delivery = el("input", "sb-ap-field");
      delivery.value = profile.soul?.deliveryStandard || "";
      delivery.placeholder = "交付标准";
      delivery.style.marginTop = "8px";
      delivery.addEventListener("input", () => { draft.soul.deliveryStandard = delivery.value; });
      const safety = el("textarea", "sb-ap-textarea");
      safety.value = (profile.soul?.safetyRules || []).join("\n");
      safety.placeholder = "每行一条安全规则";
      safety.style.marginTop = "8px";
      safety.addEventListener("input", () => { draft.soul.safetyRules = safety.value.split("\n").map((item) => item.trim()).filter(Boolean); });
      const honesty = el("textarea", "sb-ap-textarea");
      honesty.value = (profile.soul?.honestyRules || []).join("\n");
      honesty.placeholder = "每行一条诚实规则";
      honesty.style.marginTop = "8px";
      honesty.addEventListener("input", () => { draft.soul.honestyRules = honesty.value.split("\n").map((item) => item.trim()).filter(Boolean); });
      soulBox.append(principles, delivery, safety, honesty);
    } else {
      const ul = document.createElement("ul");
      for (const p of defaults.soul) ul.appendChild(el("li", null, p));
      soulBox.appendChild(ul);
      if (profile.soul?.deliveryStandard) soulBox.appendChild(el("div", null, `交付标准：${profile.soul.deliveryStandard}`));
      if (profile.soul?.safetyRules?.length) {
        soulBox.appendChild(el("div", "sb-ap-soul-label", "安全规则"));
        const safety = document.createElement("ul");
        for (const rule of profile.soul.safetyRules) safety.appendChild(el("li", null, rule));
        soulBox.appendChild(safety);
      }
      if (profile.soul?.honestyRules?.length) {
        soulBox.appendChild(el("div", "sb-ap-soul-label", "诚实规则"));
        const honesty = document.createElement("ul");
        for (const rule of profile.soul.honestyRules) honesty.appendChild(el("li", null, rule));
        soulBox.appendChild(honesty);
      }
    }
    soulSec.appendChild(soulBox);
    root.appendChild(soulSec);

    // ── 岗位 ROLE（职责可编辑）──
    const roleSec = el("div", "sb-ap-sec");
    roleSec.appendChild(el("div", "sb-ap-title", "岗位 ROLE"));
    if (editMode) {
      roleSec.appendChild(identityField("汇报对象", "reportsTo", profile.role?.reportsTo === "main" ? BRAND.mainAgent : profile.role?.reportsTo, "负责人", draft.role));
    } else {
      roleSec.appendChild(kv("汇报对象", profile.role?.reportsTo === "main" ? BRAND.mainAgent : (profile.role?.reportsTo || "—")));
    }
    roleSec.appendChild(tagList(profile.role?.responsibilities || [], {
      editable,
      onChange: (next) => { updateDraft({ role: { responsibilities: next } }); render(); }
    }));
    root.appendChild(roleSec);

    // ── 技能 SKILLS（可编辑）──
    const skillSec = el("div", "sb-ap-sec");
    skillSec.appendChild(el("div", "sb-ap-title", "技能 SKILLS"));
    skillSec.appendChild(tagList(profile.skills?.length ? profile.skills : defaults.skills, {
      tagClass: "sb-skill",
      editable,
      onChange: (next) => { updateDraft({ skills: next }); render(); }
    }));
    root.appendChild(skillSec);

    // ── 工具 TOOLS ──
    const toolSec = el("div", "sb-ap-sec");
    toolSec.appendChild(el("div", "sb-ap-title", "工具 TOOLS"));
    toolSec.appendChild(tagList(profile.tools?.length ? profile.tools : defaults.tools, {
      tagClass: "sb-tool",
      editable,
      onChange: (next) => { updateDraft({ tools: next }); render(); }
    }));
    root.appendChild(toolSec);

    // ── 范围 SCOPE ──
    const scopeSec = el("div", "sb-ap-sec");
    scopeSec.appendChild(el("div", "sb-ap-title", "范围 SCOPE"));
    const accRow = el("div", "sb-ap-kv");
    accRow.appendChild(el("b", null, "可访问"));
    scopeSec.appendChild(accRow);
    scopeSec.appendChild(tagList(defaults.scope.dataAccess, {
      editable,
      onChange: (next) => { updateDraft({ scope: { dataAccess: next } }); render(); }
    }));
    const forbRow = el("div", "sb-ap-kv");
    forbRow.style.marginTop = "8px";
    forbRow.appendChild(el("b", null, "禁区"));
    scopeSec.appendChild(forbRow);
    scopeSec.appendChild(tagList(defaults.scope.forbiddenZones, {
      tagClass: "sb-warn",
      editable,
      onChange: (next) => { updateDraft({ scope: { forbiddenZones: next } }); render(); }
    }));
    root.appendChild(scopeSec);

    // ── 权限 PERMISSIONS（可编辑）──
    const permSec = el("div", "sb-ap-sec");
    permSec.appendChild(el("div", "sb-ap-title", "权限 PERMISSIONS"));
    const apprRow = el("div", "sb-ap-kv");
    apprRow.appendChild(el("b", null, "需审批"));
    permSec.appendChild(apprRow);
    permSec.appendChild(tagList(profile.permission?.approvalRequired || [], {
      tagClass: "sb-gold",
      editable,
      onChange: (next) => { updateDraft({ permission: { approvalRequired: next } }); render(); }
    }));
    const forbRow2 = el("div", "sb-ap-kv");
    forbRow2.style.marginTop = "8px";
    forbRow2.appendChild(el("b", null, "禁止项"));
    permSec.appendChild(forbRow2);
    permSec.appendChild(tagList(profile.permission?.forbidden || [], {
      tagClass: "sb-warn",
      editable,
      onChange: (next) => { updateDraft({ permission: { forbidden: next } }); render(); }
    }));
    root.appendChild(permSec);

    // ── 预算 BUDGET（可编辑）──
    const budget = profile.budget || {};
    const budSec = el("div", "sb-ap-sec");
    budSec.appendChild(el("div", "sb-ap-title", "预算 BUDGET"));
    const grid = el("div", "sb-ap-budget");
    const fields = [
      { key: "daily", label: "每日预算", type: "number", placeholder: "不限" },
      { key: "monthly", label: "每月预算", type: "number", placeholder: "不限" },
      { key: "perTask", label: "单任务预算", type: "number", placeholder: "不限" },
      { key: "maxCalls", label: "最大调用", type: "number", placeholder: "不限" },
      { key: "modelTier", label: "模型等级", type: "select", options: [["standard", "标准"], ["pro", "专业"], ["flagship", "旗舰"]] }
    ];
    const inputs = {};
    for (const f of fields) {
      const wrap = el("label", "sb-ap-bfield");
      wrap.appendChild(el("span", null, f.label));
      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        for (const [value, text] of f.options) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = text;
          input.appendChild(opt);
        }
        input.value = budget[f.key] || "standard";
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.placeholder = f.placeholder;
        if (budget[f.key] != null) input.value = String(budget[f.key]);
      }
      input.disabled = !editable;
      if (editable) {
        input.addEventListener("input", () => {
          draft.budget[f.key] = f.type === "number"
            ? (input.value === "" ? null : Math.max(0, parseFloat(input.value) || 0))
            : input.value;
        });
      }
      inputs[f.key] = input;
      wrap.appendChild(input);
      grid.appendChild(wrap);
    }
    budSec.appendChild(grid);
    root.appendChild(budSec);

    // ── 记忆 MEMORY + 用户训练 ──
    const memSec = el("div", "sb-ap-sec");
    memSec.appendChild(el("div", "sb-ap-title", "记忆 MEMORY · 用户训练"));
    if (canTrain) {
      const train = el("div", "sb-ap-train");
      const kindSel = document.createElement("select");
      for (const [value, text] of [["userRules", "用户规则"], ["feedback", "用户反馈"], ["lessons", "岗位经验"], ["bestPractices", "最佳实践"]]) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = text;
        kindSel.appendChild(opt);
      }
      const textInput = document.createElement("input");
      textInput.placeholder = `教${name}一条规矩，回车保存…`;
      const trainBtn = el("button", null, "训练");
      const doTrain = async () => {
        const text = textInput.value.trim();
        if (!text) return;
        try {
          await gateway.action("agent.memory.append", { agentType, entry: { kind: kindSel.value, text, scope: "agent", source: "user" } });
        } catch { /* 忽略 */ }
        render();
      };
      trainBtn.addEventListener("click", doTrain);
      textInput.addEventListener("keydown", (event) => { if (event.key === "Enter") doTrain(); });
      train.append(kindSel, textInput, trainBtn);
      memSec.appendChild(train);
    }
    let memories = [];
    if (gateway) {
      try { memories = (await gateway.action("agent.memory.list", { agentType }))?.data?.entries || []; } catch { memories = []; }
    }
    if (disposed || !root.isConnected || version !== renderVersion) return;
    if (!memories.length) {
      memSec.appendChild(el("div", "sb-ap-empty", canTrain ? "还没有记忆，上面可以开始训练。" : "暂无记忆"));
    }
    for (const entry of memories.slice(-8).reverse()) {
      const card = el("div", `sb-ap-mem${entry.status === "rolled-back" ? " sb-ap-memrolled" : ""}`);
      card.appendChild(el("div", "sb-ap-memtext", entry.text));
      const meta = el("div", "sb-ap-memmeta");
      meta.appendChild(el("span", `sb-ap-memkind ${MEM_KIND_CLASS[entry.kind] || ""}`, MEM_KIND_LABELS[entry.kind] || entry.kind));
      meta.appendChild(el("span", null, entry.source === "user" ? "来自你" : "来自执行"));
      meta.appendChild(el("span", null, `v${entry.version}`));
      if (entry.status === "rolled-back") meta.appendChild(el("span", null, "已回退"));
      else if (canTrain && (entry.history || []).length) {
        const rb = el("span", "sb-ap-memrollback", "回退");
        rb.addEventListener("click", async () => {
          try { await gateway.action("agent.memory.rollback", { agentType, entryId: entry.id }); } catch { /* 忽略 */ }
          render();
        });
        meta.appendChild(rb);
      }
      card.appendChild(meta);
      memSec.appendChild(card);
    }
    root.appendChild(memSec);

    // ── 任务历史 ──
    const taskSec = el("div", "sb-ap-sec");
    taskSec.appendChild(el("div", "sb-ap-title", "任务历史"));
    if (!myTasks.length) {
      taskSec.appendChild(el("div", "sb-ap-empty", "还没有参与过任务"));
    } else {
      const table = el("table", "sb-ap-table");
      table.innerHTML = "<thead><tr><th>任务</th><th>项目组</th><th class=\"sb-num\">我的成本</th><th>状态</th></tr></thead>";
      const tbody = document.createElement("tbody");
      for (const task of myTasks.slice(0, 8)) {
        const tr = document.createElement("tr");
        const title = (task.title || "未命名任务").length > 18 ? `${(task.title || "").slice(0, 18)}…` : task.title || "未命名任务";
        tr.appendChild(el("td", null, title));
        tr.appendChild(el("td", null, task.projectName || "—"));
        const myCost = myEntries.filter((e) => e.taskId === task.taskId).reduce((sum, e) => sum + e.amount, 0);
        tr.appendChild(el("td", "sb-num", yuan(myCost)));
        tr.appendChild(el("td", null, task.status === "done" ? "已完成" : "进行中"));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      taskSec.appendChild(table);
    }
    root.appendChild(taskSec);

    // ── 文件产出 ──
    const fileSec = el("div", "sb-ap-sec");
    fileSec.appendChild(el("div", "sb-ap-title", "文件产出"));
    if (!myFiles.length) {
      fileSec.appendChild(el("div", "sb-ap-empty", "还没有产出文件"));
    } else {
      for (const file of myFiles.slice(0, 8)) {
        const row = el("div", "sb-ap-file");
        row.appendChild(el("span", `sb-ap-fileico ${file.type === "sheet" ? "sb-sheet" : "sb-doc"}`, file.type === "sheet" ? "表" : "文"));
        row.appendChild(el("span", null, file.name));
        row.appendChild(el("span", "sb-ap-filesub", file.projectName || ""));
        row.addEventListener("click", () => openFileCenterPage({ initialFileId: file.id }));
        fileSec.appendChild(row);
      }
    }
    root.appendChild(fileSec);

    // ── Token 消耗 ──
    const costSec = el("div", "sb-ap-sec");
    const costTitle = el("div", "sb-ap-title", "TOKEN 与成本消耗");
    costSec.appendChild(costTitle);
    if (!myEntries.length) {
      costSec.appendChild(el("div", "sb-ap-empty", "还没有消耗记录"));
    } else {
      const byKind = new Map();
      for (const e of myEntries) byKind.set(e.kind, (byKind.get(e.kind) || 0) + e.amount);
      for (const [kind, amount] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
        const row = el("div", "sb-ap-kind");
        row.appendChild(el("span", "sb-ap-kindlabel", KIND_LABELS[kind] || kind));
        const bar = el("div", "sb-ap-kindbar");
        const i = el("i");
        i.style.width = `${myTotal > 0 ? (amount / myTotal) * 100 : 0}%`;
        i.style.background = "#4C9AFF";
        bar.appendChild(i);
        row.appendChild(bar);
        row.appendChild(el("span", "sb-ap-kindnum", yuan(amount)));
        costSec.appendChild(row);
      }
    }
    root.appendChild(costSec);

    // ── 工作质量数据 ──
    const qualitySec = el("div", "sb-ap-sec");
    qualitySec.appendChild(el("div", "sb-ap-title", "工作质量数据"));
    const stats = el("div", "sb-ap-statgrid");
    const trainCount = memories.filter((m) => m.source === "user").length;
    const items = [
      { num: String(myTasks.length), unit: "个", label: "参与任务" },
      { num: String(myFiles.length), unit: "份", label: "产出文件" },
      { num: yuan(myTotal), unit: "", label: "累计成本" },
      { num: String(trainCount), unit: "条", label: "训练记录" }
    ];
    for (const item of items) {
      const box = el("div", "sb-ap-stat");
      const num = el("div", "sb-ap-statnum", item.num);
      if (item.unit) num.appendChild(el("small", null, item.unit));
      box.appendChild(num);
      box.appendChild(el("div", "sb-ap-statlabel", item.label));
      stats.appendChild(box);
    }
    qualitySec.appendChild(stats);
    root.appendChild(qualitySec);
  }

  await render();
}
