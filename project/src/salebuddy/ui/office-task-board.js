import { mountAgentAvatar } from "./agent-avatar.js";
import { beginWork, endAllWork, finishWork, pushActivity } from "../agents/work-live.js";
import { onboardingMatchFromStorage } from "../onboarding/matching.js";

const BOARD_ID = "sb-office-task-board";
const LAUNCHER_ID = "sb-office-task-board-launcher";

const AGENTS = Object.freeze([
  { id: "main", name: "幕僚长", role: "总控 · 任务调度", task: "拆解目标并协调团队", phase: "拆解中", color: "green" },
  { id: "Browser Agent", name: "潜客挖掘员", role: "找人 · 潜客发现", task: "扫描评论区、粉丝和直播间", phase: "检索中", color: "blue" },
  { id: "Search Agent", name: "线索分析师", role: "分析 · 意向评分", task: "合并账号并筛选高意向客户", phase: "评分中", color: "violet" },
  { id: "Research Agent", name: "客户画像研究员", role: "分析 · 客户研究", task: "整理客户画像和需求信号", phase: "等待分派", color: "orange" },
  { id: "App Agent", name: "触达策略师", role: "触达 · 策略准备", task: "生成首轮触达策略", phase: "等待分派", color: "pink" },
  { id: "Risk Agent", name: "风控专员", role: "触达 · 风险检查", task: "校验权限、频控和重复触达", phase: "等待分派", color: "amber" },
  { id: "Outreach Agent", name: "外联专员", role: "触达 · 外联执行", task: "执行已批准的私信和评论", phase: "等待分派", color: "teal" },
  { id: "Outreach Ops Agent", name: "触达运营专员", role: "触达 · 队列管理", task: "管理批次、重试和执行结果", phase: "等待分派", color: "slate" }
]);

const STAGES = Object.freeze([
  { label: "发现潜客", range: [0, 24] },
  { label: "分析意向", range: [25, 49] },
  { label: "准备触达", range: [50, 74] },
  { label: "执行触达", range: [75, 100] }
]);

const ACTIVITY_TEMPLATES = Object.freeze([
  ["Browser Agent", "已抓取 128 条公开评论，发现 24 个潜在客户"],
  ["Search Agent", "完成首轮意向评分，筛出 9 个高意向账号"],
  ["Research Agent", "已补全 3 个客户画像，等待下一批线索"],
  ["App Agent", "触达策略草稿已生成，等待风控检查"],
  ["Risk Agent", "已完成触达前检查，授权范围和频控规则通过"],
  ["Outreach Agent", "已准备首批授权触达，等待执行确认"],
  ["Outreach Ops Agent", "已建立触达队列，收到回复后停止后续自动计划"],
  ["main", "已更新任务分工，团队正在并行执行"]
]);

const RESULT_ITEMS = Object.freeze([
  ["128", "发现潜客", "评论、粉丝和直播间"],
  ["9", "高意向客户", "已完成意向评分"],
  ["3", "客户画像", "已生成研究简报"],
  ["1", "触达策略", "已生成首轮策略"]
]);

const CSS = `
#${BOARD_ID}{position:fixed;top:72px;right:22px;z-index:9000;width:min(390px,calc(100vw - 32px));max-height:calc(100vh - 94px);display:flex;flex-direction:column;box-sizing:border-box;overflow-y:auto;overflow-x:hidden;border:1px solid rgba(18,37,27,.10);border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 20px 60px rgba(17,35,26,.18),0 2px 8px rgba(17,35,26,.05);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#18241d;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);scrollbar-width:thin;scrollbar-color:#cbdcd1 transparent}
#${BOARD_ID}[hidden],#${LAUNCHER_ID}[hidden]{display:none!important}
.sb-otb-head{display:flex;align-items:flex-start;gap:10px;padding:18px 18px 14px;border-bottom:1px solid #edf2ef}
.sb-otb-head-copy{min-width:0;flex:1}.sb-otb-kicker{display:flex;align-items:center;gap:7px;color:#1ca96b;font-size:11px;font-weight:700;line-height:1}.sb-otb-live-dot{width:7px;height:7px;border-radius:50%;background:#0bb86b;box-shadow:0 0 0 4px rgba(11,184,107,.12);animation:sb-otb-pulse 1.6s ease-in-out infinite}.sb-otb-sim{margin-left:2px;padding:3px 6px;border-radius:5px;color:#8a6b24;background:#fff7df;font-size:9px;font-weight:600}.sb-otb-title{margin:8px 0 0;font-size:18px;font-weight:750;letter-spacing:-.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-otb-subtitle{margin:5px 0 0;color:#7b8780;font-size:11px;line-height:1.4}.sb-otb-close{width:28px;height:28px;flex:none;border:0;border-radius:8px;color:#8d9891;background:transparent;font-size:18px;cursor:pointer}.sb-otb-close:hover{color:#1d2a22;background:#f1f5f2}
.sb-otb-summary{padding:15px 18px 13px}.sb-otb-summary-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.sb-otb-summary-label{color:#65736b;font-size:12px;font-weight:600}.sb-otb-summary-value{color:#129b60;font-size:24px;font-weight:800;letter-spacing:-.04em}.sb-otb-progress{height:8px;margin-top:9px;overflow:hidden;border-radius:99px;background:#e8f1ec}.sb-otb-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#23cf83,#0ca962);transition:width .35s ease}.sb-otb-summary-meta{display:flex;justify-content:space-between;margin-top:7px;color:#9aa49e;font-size:10px}
.sb-otb-stages{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:0 18px 15px}.sb-otb-stage{position:relative;color:#9aa49e;font-size:10px;text-align:center}.sb-otb-stage::before{content:"";display:block;width:10px;height:10px;margin:0 auto 6px;border:2px solid #d9e4dd;border-radius:50%;box-sizing:border-box;background:#fff}.sb-otb-stage:not(:last-child)::after{content:"";position:absolute;top:5px;left:calc(50% + 9px);width:calc(100% - 18px);height:2px;background:#e0e9e3}.sb-otb-stage.is-done{color:#159d62;font-weight:650}.sb-otb-stage.is-done::before{border-color:#12b86c;background:#12b86c;box-shadow:inset 0 0 0 2px #fff}.sb-otb-stage.is-active{color:#18241d;font-weight:700}.sb-otb-stage.is-active::before{border-color:#12b86c;box-shadow:0 0 0 4px rgba(18,184,108,.13)}.sb-otb-stage.is-done:not(:last-child)::after{background:#27c97e}
.sb-otb-section{padding:13px 18px;border-top:1px solid #edf2ef}.sb-otb-section-title{display:flex;align-items:center;justify-content:space-between;color:#65736b;font-size:11px;font-weight:700;letter-spacing:.02em}.sb-otb-section-title span{color:#a3ada7;font-size:10px;font-weight:500}.sb-otb-agents{display:grid;gap:2px;margin-top:8px}.sb-otb-agent{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 7px;border-radius:10px;cursor:pointer}.sb-otb-agent:hover{background:#f5f8f6}.sb-otb-avatar{width:30px;height:30px;display:grid;place-items:center;overflow:hidden;border-radius:9px;color:#fff;background:#dfe9e3;font-size:13px;font-weight:700}.sb-otb-avatar img{width:100%;height:100%;object-fit:cover}.sb-otb-agent-copy{min-width:0}.sb-otb-agent-name{display:flex;align-items:center;gap:6px;color:#29362e;font-size:12px;font-weight:650;white-space:nowrap}.sb-otb-agent-role{margin-top:2px;color:#8a958e;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-otb-agent-status{display:inline-flex;align-items:center;gap:4px;color:#87928b;font-size:9px;white-space:nowrap}.sb-otb-agent-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#cbd4ce}.sb-otb-agent-status.is-working{color:#159d62}.sb-otb-agent-status.is-working::before{background:#14b66c;box-shadow:0 0 0 3px rgba(20,182,108,.12)}.sb-otb-agent-status.is-waiting{color:#b07a25}.sb-otb-agent-status.is-waiting::before{background:#e4aa49}.sb-otb-agent-progress{grid-column:2 / 4;height:4px;margin-top:-3px;overflow:hidden;border-radius:99px;background:#edf2ef}.sb-otb-agent-progress i{display:block;height:100%;border-radius:inherit;background:#1fbd78;transition:width .35s ease}.sb-otb-agent-progress.is-waiting i{background:#e5b256}
.sb-otb-cloud-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}.sb-otb-cloud-card{min-width:0;padding:9px;border:1px solid #e1ece5;border-radius:10px;background:#f9fcfa;text-align:left;cursor:pointer}.sb-otb-cloud-card:hover{border-color:#9bd9b7;background:#f3fbf6}.sb-otb-cloud-bar{display:flex;align-items:center;gap:3px;height:15px;color:#89958d;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-otb-cloud-bar b{width:5px;height:5px;border-radius:50%;background:#ea7169;box-shadow:8px 0 #e7b44c,16px 0 #66bd70;flex:none;margin-right:14px}.sb-otb-cloud-name{overflow:hidden;text-overflow:ellipsis}.sb-otb-cloud-screen{min-height:45px;margin-top:6px;padding:7px 8px;border-radius:7px;background:#17231c;color:#b7e7ca;font-family:"SF Mono",Menlo,monospace;font-size:8px;line-height:1.5;white-space:normal}.sb-otb-cloud-screen strong{display:block;color:#dff8e8;font-family:inherit;font-size:9px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-otb-cloud-screen span{display:block;margin-top:3px;color:#8eb79c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-otb-cloud-foot{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:7px;color:#8b9890;font-size:9px}.sb-otb-cloud-live{display:inline-flex;align-items:center;gap:4px;color:#149b60}.sb-otb-cloud-live::before{content:"";width:5px;height:5px;border-radius:50%;background:#14b66c;box-shadow:0 0 0 3px rgba(20,182,108,.12)}
.sb-otb-live-dot.is-done{background:#9aa89f;box-shadow:none;animation:none}.sb-otb-cloud-live.is-done{color:#7d8b82}.sb-otb-cloud-live.is-done::before{background:#9aa89f;box-shadow:none}.sb-otb-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}.sb-otb-result{padding:10px;border:1px solid #d9eee2;border-radius:10px;background:#f7fcf9}.sb-otb-result-value{color:#119c60;font-size:20px;font-weight:800;line-height:1}.sb-otb-result-label{margin-top:6px;color:#304238;font-size:11px;font-weight:650}.sb-otb-result-detail{margin-top:3px;color:#8a968e;font-size:9px;line-height:1.35}.sb-otb-complete-note{display:flex;align-items:flex-start;gap:8px;margin:0 18px 15px;padding:11px 12px;border-radius:10px;color:#39755e;background:#edf9f2;font-size:11px;line-height:1.5}.sb-otb-complete-note strong{color:#0c9558}.sb-otb-complete-note i{width:17px;height:17px;display:grid;place-items:center;flex:none;border-radius:50%;color:#fff;background:#11b56a;font-size:11px;font-style:normal}
.sb-otb-activity-list{display:grid;gap:9px;margin-top:10px}.sb-otb-activity{display:grid;grid-template-columns:7px minmax(0,1fr) auto;gap:8px;align-items:start;color:#526058;font-size:10px;line-height:1.45}.sb-otb-activity i{width:7px;height:7px;margin-top:3px;border-radius:50%;background:#21bb76}.sb-otb-activity time{color:#a2aaa5;font-variant-numeric:tabular-nums;white-space:nowrap}.sb-otb-next{display:flex;align-items:flex-start;gap:8px;margin:0 18px 16px;padding:11px 12px;border-radius:10px;color:#3a7460;background:#effaf4;font-size:11px;line-height:1.5}.sb-otb-next strong{color:#0e9b5d}.sb-otb-footer{display:flex;gap:8px;padding:12px 18px 15px;border-top:1px solid #edf2ef}.sb-otb-action{height:32px;flex:1;border:1px solid #dfe8e2;border-radius:8px;color:#5f6d65;background:#fff;font:inherit;font-size:11px;cursor:pointer}.sb-otb-action:hover{border-color:#93d9b7;background:#f5fbf7}.sb-otb-action.primary{border-color:#11af69;color:#fff;background:#10b56b}.sb-otb-action.primary:hover{background:#079a59}
#${LAUNCHER_ID}{position:fixed;right:22px;bottom:22px;z-index:9000;height:38px;padding:0 14px;border:1px solid #0caf67;border-radius:10px;color:#fff;background:#10b56b;box-shadow:0 10px 24px rgba(11,143,83,.22);font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-otb-launcher-dot{display:inline-block;width:6px;height:6px;margin-right:7px;border-radius:50%;background:#fff;vertical-align:1px}
@keyframes sb-otb-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.78)}}
@media(max-width:720px){#${BOARD_ID}{top:14px;right:14px;max-height:calc(100vh - 28px);width:min(390px,calc(100vw - 28px))}.sb-otb-head{padding:15px 15px 12px}.sb-otb-summary,.sb-otb-section{padding-inline:15px}.sb-otb-stages{padding-inline:15px}.sb-otb-next{margin-inline:15px}.sb-otb-footer{padding-inline:15px}}
`;

function el(tag, className, text, ownerDocument = globalThis.document) {
  const node = ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sessionValue(key) {
  try { return globalThis.sessionStorage?.getItem(key) || null; } catch { return null; }
}

function timeLabel(date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function activeStage(progress) {
  return STAGES.findIndex(({ range }) => progress >= range[0] && progress <= range[1]);
}

function noOp() { return { unmount() {} }; }

function agentsForMatch(match) {
  if (!Array.isArray(match?.agents) || !match.agents.length) return AGENTS;
  return match.agents.map((agent, index) => ({
    id: agent.legacyType || agent.agentType || agent.id,
    name: agent.name || agent.displayName || agent.id,
    role: agent.role || agent.title || "数字员工",
    task: agent.mission || agent.skill || "按目标执行任务",
    phase: agent.stage || "待分派",
    color: ["green", "blue", "violet", "orange", "pink", "amber", "teal", "slate"][index % 8]
  }));
}

export function mountOfficeTaskBoard({ ownerDocument = globalThis.document } = {}) {
  const params = new URLSearchParams(globalThis.location?.search || "");
  const authorized = sessionValue("byering-onboarding-auth") === "authorized";
  const demoRequested = params.get("demo") === "1";
  if (params.get("page") !== "office" || (!authorized && !demoRequested)) return noOp();
  if (ownerDocument.getElementById(BOARD_ID)) return noOp();
  const onboardingMatch = onboardingMatchFromStorage();
  const activeAgents = agentsForMatch(onboardingMatch);
  const goalLabels = Array.isArray(onboardingMatch?.goalLabels) ? onboardingMatch.goalLabels : [];
  const taskTitle = onboardingMatch?.taskObjective || "潜客拓展任务";
  const taskContext = onboardingMatch
    ? `${onboardingMatch.businessType || "当前业务"} · ${goalLabels.join("、") || "当前目标"} · ${onboardingMatch.workflowName || "团队工作流"}`
    : "抖音账号已连接 · 团队正在协作执行";

  const style = ownerDocument.createElement("style");
  style.id = `${BOARD_ID}-style`;
  style.textContent = CSS;
  ownerDocument.head.appendChild(style);

  const board = el("aside", "notranslate", null, ownerDocument);
  board.id = BOARD_ID;
  board.setAttribute("translate", "no");
  board.setAttribute("aria-label", "办公室实时任务看板");
  const launcher = el("button", null, null, ownerDocument);
  launcher.id = LAUNCHER_ID;
  launcher.type = "button";
  launcher.hidden = true;
  launcher.innerHTML = '<span class="sb-otb-launcher-dot" aria-hidden="true"></span>打开任务看板';

  const state = {
    progress: 18,
    activity: [],
    paused: false,
    completed: false,
    selectedAgent: null,
    startedAt: Date.now()
  };
  const cleanups = [];
  let timer = null;

  function agentProgress(agent, progress) {
    if (agent.id === "main") return Math.min(100, Math.max(18, Math.round(progress * .85)));
    const offsets = { "Browser Agent": 22, "Search Agent": 7, "Research Agent": -11, "App Agent": -27, "Risk Agent": -35, "Outreach Agent": -43, "Outreach Ops Agent": -49 };
    return Math.min(100, Math.max(0, Math.round(progress + (offsets[agent.id] || 0))));
  }

  function agentState(agent, progress) {
    const pct = agentProgress(agent, progress);
    if (pct >= 100) return "done";
    if (agent.id === "Research Agent" && pct < 25) return "waiting";
    if (agent.id === "App Agent" && pct < 55) return "waiting";
    if (["Risk Agent", "Outreach Agent", "Outreach Ops Agent"].includes(agent.id) && pct < 70) return "waiting";
    return "working";
  }

  function agentPhase(agent, progress) {
    const pct = agentProgress(agent, progress);
    if (agent.id === "Browser Agent") return pct > 70 ? "整理来源" : "检索中";
    if (agent.id === "Search Agent") return pct > 65 ? "核验中" : "评分中";
    if (agent.id === "Research Agent") return pct > 70 ? "生成客户简报" : pct > 25 ? "研究中" : "等待分派";
    if (agent.id === "App Agent") return pct > 78 ? "策略已生成" : pct > 55 ? "准备触达" : "等待分派";
    if (agent.id === "Risk Agent") return pct > 78 ? "检查通过" : "风控检查";
    if (agent.id === "Outreach Agent") return pct > 82 ? "执行中" : "等待授权";
    if (agent.id === "Outreach Ops Agent") return pct > 82 ? "记录结果" : "队列排期";
    return pct > 65 ? "汇总中" : "拆解中";
  }

  function cloudSnapshot(agent, progress) {
    const pct = agentProgress(agent, progress);
    const snapshots = {
      main: ["调度台 · Byering", "正在协调团队并汇总结果"],
      "Browser Agent": ["Chrome · 线索研究", "抓取评论区与粉丝列表"],
      "Search Agent": ["分析台 · 意向评分", "合并账号并计算意向分"],
      "Research Agent": ["浏览器 · 客户分析", "整理客户画像与需求信号"],
      "App Agent": ["触达策略 · 工作区", "生成首轮触达策略"],
      "Risk Agent": ["风控台 · 触达检查", "校验权限、频控和重复触达"],
      "Outreach Agent": ["抖音授权台 · 外联执行", "执行已批准的私信和评论"],
      "Outreach Ops Agent": ["触达队列 · 状态管理", "记录发送结果并处理失败重试"]
    };
    const [app, line] = snapshots[agent.id] || ["工作区 · 执行中", agent.task];
    return { app, line, pct };
  }

  function addActivity(agentId, text) {
    state.activity.unshift({ agentId, text, at: new Date() });
    state.activity = state.activity.slice(0, 4);
  }

  function syncWorkLive() {
    for (const agent of activeAgents) {
      const status = agentState(agent, state.progress);
      const phase = agentPhase(agent, state.progress);
      const pct = agentProgress(agent, state.progress);
      if (status === "waiting") {
        beginWork(agent.id, { task: agent.task, phase, projectId: "demo-office" });
        pushActivity(agent.id, `${agent.name} 已进入等待队列`);
      } else if (status === "done") {
        finishWork(agent.id, `${agent.name}-执行记录.json`);
      } else {
        beginWork(agent.id, { task: agent.task, phase, projectId: "demo-office" });
        pushActivity(agent.id, `${phase} · ${agent.task}`);
      }
      if (pct >= 100) finishWork(agent.id, `${agent.name}-执行记录.json`);
    }
  }

  function render() {
    const stage = activeStage(state.progress);
    const statusLabel = state.completed ? "办公室 · 任务已完成" : "办公室 · 工作中";
    const subtitle = state.completed ? `${taskContext} · 任务结果已归档` : taskContext;
    board.textContent = "";
    const head = el("header", "sb-otb-head", null, ownerDocument);
    const headCopy = el("div", "sb-otb-head-copy", null, ownerDocument);
    const kicker = el("div", "sb-otb-kicker", null, ownerDocument);
    kicker.append(el("i", `sb-otb-live-dot${state.completed ? " is-done" : ""}`, null, ownerDocument), el("span", null, statusLabel, ownerDocument), el("em", "sb-otb-sim", "模拟运行", ownerDocument));
    headCopy.append(kicker, el("h2", "sb-otb-title", taskTitle, ownerDocument), el("p", "sb-otb-subtitle", subtitle, ownerDocument));
    const close = el("button", "sb-otb-close", "×", ownerDocument);
    close.type = "button";
    close.setAttribute("aria-label", "收起任务看板");
    close.addEventListener("click", () => { board.hidden = true; launcher.hidden = false; });
    head.append(headCopy, close);
    board.appendChild(head);

    const summary = el("section", "sb-otb-summary", null, ownerDocument);
    const summaryTop = el("div", "sb-otb-summary-top", null, ownerDocument);
    summaryTop.append(el("span", "sb-otb-summary-label", state.completed ? "任务已完成" : "整体执行进度", ownerDocument), el("strong", "sb-otb-summary-value", `${state.progress}%`, ownerDocument));
    const progress = el("div", "sb-otb-progress", null, ownerDocument);
    const progressFill = el("i", null, null, ownerDocument); progressFill.style.width = `${state.progress}%`; progress.appendChild(progressFill);
    summary.append(summaryTop, progress, el("div", "sb-otb-summary-meta", null, ownerDocument));
    summary.lastChild.append(el("span", null, `已运行 ${Math.max(1, Math.floor((Date.now() - state.startedAt) / 60000))} 分钟`, ownerDocument), el("span", null, state.completed ? "结果已归档" : "预计还需 8 分钟", ownerDocument));
    board.appendChild(summary);

    const stages = el("div", "sb-otb-stages", null, ownerDocument);
    STAGES.forEach((item, index) => {
      const stageClass = state.completed ? "sb-otb-stage is-done" : `sb-otb-stage${index < stage ? " is-done" : index === stage ? " is-active" : ""}`;
      const node = el("div", stageClass, item.label, ownerDocument);
      stages.appendChild(node);
    });
    board.appendChild(stages);

    const agentSection = el("section", "sb-otb-section", null, ownerDocument);
    const agentTitle = el("div", "sb-otb-section-title", null, ownerDocument);
    agentTitle.append(el("span", null, "团队协作", ownerDocument), el("span", null, state.completed ? `${activeAgents.length} 人已完成` : `${activeAgents.filter((agent) => agentState(agent, state.progress) === "working").length} 人工作中`, ownerDocument));
    const agents = el("div", "sb-otb-agents", null, ownerDocument);
    activeAgents.forEach((agent) => {
      const pct = agentProgress(agent, state.progress);
      const status = agentState(agent, state.progress);
      const row = el("button", "sb-otb-agent", null, ownerDocument);
      row.type = "button";
      row.dataset.agent = agent.id;
      const avatar = el("span", "sb-otb-avatar", agent.name.slice(0, 1), ownerDocument);
      mountAgentAvatar(avatar, agent.id, { alt: agent.name });
      const copy = el("span", "sb-otb-agent-copy", null, ownerDocument);
      const name = el("span", "sb-otb-agent-name", null, ownerDocument);
      name.append(el("span", null, agent.name, ownerDocument), el("em", `sb-otb-agent-status is-${status}`, status === "working" ? "正在工作" : status === "waiting" ? "排队中" : "已完成", ownerDocument));
      copy.append(name, el("span", "sb-otb-agent-role", `${agentPhase(agent, state.progress)} · ${agent.task}`, ownerDocument));
      row.append(avatar, copy, el("span", "sb-otb-agent-role", `${pct}%`, ownerDocument));
      const bar = el("span", `sb-otb-agent-progress${status === "waiting" ? " is-waiting" : ""}`, null, ownerDocument);
      const fill = el("i", null, null, ownerDocument); fill.style.width = `${pct}%`; bar.appendChild(fill); row.appendChild(bar);
      row.addEventListener("click", () => {
        state.selectedAgent = agent.id;
        addActivity(agent.id, `已打开${agent.name}的工作详情`);
        render();
        globalThis.window?.__SALEBUDDY__?.cloudDesktopReady?.then?.((desktop) => desktop?.openProgressFor?.(agent.id));
      });
      agents.appendChild(row);
    });
    agentSection.append(agentTitle, agents);
    board.appendChild(agentSection);

    const cloudSection = el("section", "sb-otb-section", null, ownerDocument);
    const cloudTitle = el("div", "sb-otb-section-title", null, ownerDocument);
    cloudTitle.append(el("span", null, "云电脑实时状态", ownerDocument), el("span", null, "点击查看完整画面", ownerDocument));
    const cloudGrid = el("div", "sb-otb-cloud-grid", null, ownerDocument);
    activeAgents.forEach((agent) => {
      const snapshot = cloudSnapshot(agent, state.progress);
      const card = el("button", "sb-otb-cloud-card", null, ownerDocument);
      card.type = "button";
      const bar = el("div", "sb-otb-cloud-bar", null, ownerDocument);
      bar.append(el("b", null, null, ownerDocument), el("span", "sb-otb-cloud-name", snapshot.app, ownerDocument));
      const screen = el("div", "sb-otb-cloud-screen", null, ownerDocument);
      screen.append(el("strong", null, `${agent.name} · ${agentPhase(agent, state.progress)}`, ownerDocument), el("span", null, `> ${snapshot.line}`, ownerDocument));
      const foot = el("div", "sb-otb-cloud-foot", null, ownerDocument);
      foot.append(el("span", `sb-otb-cloud-live${state.completed ? " is-done" : ""}`, state.completed ? "已完成" : "实时同步", ownerDocument), el("span", null, `${snapshot.pct}%`, ownerDocument));
      card.append(bar, screen, foot);
      card.addEventListener("click", () => globalThis.window?.__SALEBUDDY__?.cloudDesktopReady?.then?.((desktop) => desktop?.openFor?.(agent.id)));
      cloudGrid.appendChild(card);
    });
    cloudSection.append(cloudTitle, cloudGrid);
    board.appendChild(cloudSection);

    if (state.completed) {
      const resultSection = el("section", "sb-otb-section", null, ownerDocument);
      const resultTitle = el("div", "sb-otb-section-title", null, ownerDocument);
      resultTitle.append(el("span", null, "任务结果", ownerDocument), el("span", null, "已归档", ownerDocument));
      const resultGrid = el("div", "sb-otb-results", null, ownerDocument);
      RESULT_ITEMS.forEach(([value, label, detail]) => {
        const item = el("div", "sb-otb-result", null, ownerDocument);
        item.append(el("div", "sb-otb-result-value", value, ownerDocument), el("div", "sb-otb-result-label", label, ownerDocument), el("div", "sb-otb-result-detail", detail, ownerDocument));
        resultGrid.appendChild(item);
      });
      resultSection.append(resultTitle, resultGrid);
      board.appendChild(resultSection);

      const note = el("div", "sb-otb-complete-note", null, ownerDocument);
      const noteCopy = el("span", null, null, ownerDocument);
      noteCopy.append(el("strong", null, "任务已完成。", ownerDocument), ownerDocument.createTextNode("结果已同步到成果中心和看板；潜客类结果可继续查看客户详情。"));
      note.append(el("i", null, "✓", ownerDocument), noteCopy);
      board.appendChild(note);
    }

    const activitySection = el("section", "sb-otb-section", null, ownerDocument);
    const activityTitle = el("div", "sb-otb-section-title", null, ownerDocument);
    activityTitle.append(el("span", null, "最近动态", ownerDocument), el("span", null, "自动更新", ownerDocument));
    const activityList = el("div", "sb-otb-activity-list", null, ownerDocument);
    for (const item of state.activity) {
      const row = el("div", "sb-otb-activity", null, ownerDocument);
      row.append(el("i", null, null, ownerDocument), el("span", null, item.text, ownerDocument), el("time", null, timeLabel(item.at), ownerDocument));
      activityList.appendChild(row);
    }
    if (!state.activity.length) activityList.appendChild(el("div", "sb-otb-activity", "任务刚刚启动，等待第一条执行事件", ownerDocument));
    activitySection.append(activityTitle, activityList);
    board.appendChild(activitySection);

    const next = el("div", "sb-otb-next", null, ownerDocument);
    next.append(el("strong", null, state.completed ? "已完成" : "下一步", ownerDocument), el("span", null, state.completed ? "本轮任务已完成，结果已归档。你可以查看潜客列表或继续创建新任务。" : state.progress < 50 ? "继续分析高意向客户，完成首轮筛选。" : "准备触达策略，等待风控检查。", ownerDocument));
    board.appendChild(next);

    const footer = el("footer", "sb-otb-footer", null, ownerDocument);
    const pause = el("button", "sb-otb-action", state.completed ? "任务已完成" : state.paused ? "继续模拟" : "暂停模拟", ownerDocument);
    pause.type = "button";
    pause.disabled = state.completed;
    pause.addEventListener("click", () => { state.paused = !state.paused; pause.textContent = state.paused ? "继续模拟" : "暂停模拟"; });
    const details = el("button", "sb-otb-action primary", state.completed ? "查看任务结果" : "查看完整任务", ownerDocument);
    details.type = "button";
    details.addEventListener("click", () => {
      addActivity("main", state.completed ? "已打开任务结果摘要" : "已打开完整任务详情");
      render();
      if (state.completed) {
        board.hidden = true;
        launcher.hidden = false;
        globalThis.window?.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.());
      }
    });
    footer.append(pause, details);
    board.appendChild(footer);
  }

  function tick() {
    if (state.paused || state.completed) return;
    const previousStage = activeStage(state.progress);
    state.progress = Math.min(100, state.progress + 4);
    const nextStage = activeStage(state.progress);
    syncWorkLive();
    if (nextStage !== previousStage) addActivity("main", `任务进入「${STAGES[nextStage].label}」阶段`);
    if (state.progress >= 100) {
      state.completed = true;
      for (const agent of activeAgents) finishWork(agent.id, `${agent.name}-执行记录.json`);
      addActivity("main", "任务已完成，结果已归档到成果中心和看板");
    } else {
      const activity = ACTIVITY_TEMPLATES[Math.floor(state.progress / 4) % ACTIVITY_TEMPLATES.length];
      const activeAgent = activeAgents.find((agent) => agent.id === activity[0]) || activeAgents[0];
      addActivity(activeAgent?.id || "main", activeAgent ? `${activeAgent.name}：${activeAgent.task}` : activity[1]);
    }
    render();
  }

  syncWorkLive();
  addActivity("main", onboardingMatch ? `已按「${onboardingMatch.businessType || "当前业务"} · ${goalLabels.join("、") || "当前目标"}」启动${onboardingMatch.workflowName || "团队工作流"}` : "已连接抖音账号，开始执行潜客拓展任务");
  const firstAgent = activeAgents.find((agent) => agent.id === "Browser Agent") || activeAgents.find((agent) => agent.id !== "main");
  if (firstAgent) addActivity(firstAgent.id, `${firstAgent.name}已入场，开始${firstAgent.task}`);
  render();
  ownerDocument.body.append(board, launcher);
  launcher.addEventListener("click", () => { board.hidden = false; launcher.hidden = true; });
  timer = globalThis.setInterval(tick, 3200);

  return {
    board,
    unmount() {
      if (timer) globalThis.clearInterval(timer);
      endAllWork();
      board.remove();
      launcher.remove();
      style.remove();
      cleanups.forEach((cleanup) => cleanup());
    }
  };
}
