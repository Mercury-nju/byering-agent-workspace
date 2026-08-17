/**
 * ui/cloud-desktop.js
 * 云电脑实时快照：点击办公室工位上的「显示器」或员工卡片电脑入口，弹出该成员云电脑的大屏模拟实时画面
 * （点角色形象打开该员工的工作进展，两者通过 Pixi 场景节点精确区分）：
 * 按岗位渲染对应的工作窗口（浏览器 / 终端 / 文档 / 触达序列 / 调度台），内容持续滚动模拟 LIVE。
 * 状态与 teamLive 同源（空闲/工作/待审批实时刷新），纯运行时注入，不改冻结文件。
 */
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { getWorkForProject, subscribeWork } from "../agents/work-live.js";
import { createDefaultProfile } from "../agents/model.js";
import { openAgentDrawer, closeAgentDrawer } from "./agent-drawer.js";

const CSS = `
.sb-cloud-backdrop{position:fixed;inset:0;z-index:10080;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(25,31,42,.30);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:sb-cloud-backdrop-in .18s ease-out}
.sb-cloud{position:relative;width:min(1120px,calc(100vw - 56px));height:min(760px,calc(100vh - 56px));max-width:none;max-height:calc(100vh - 56px);display:flex;flex-direction:column;background:#fff;border-radius:20px;box-shadow:0 28px 90px rgba(15,23,42,.28);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden;border:1px solid rgba(15,15,15,0.10);animation:sb-cloud-panel-in .22s cubic-bezier(.2,.8,.2,1)}
.sb-cloud-head{display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid rgba(15,15,15,0.08);background:linear-gradient(180deg,#fff,#fbfcfe)}
.sb-cloud-title{font-size:17px;font-weight:650;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-cloud-live{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#D45B5B;flex:none}
.sb-cloud-live i{width:6px;height:6px;border-radius:50%;background:#D45B5B;animation:sb-cloud-blink 1.2s infinite}
@keyframes sb-cloud-blink{0%,100%{opacity:1}50%{opacity:.25}}
.sb-cloud-clock{margin-left:auto;font-size:11px;color:#8A8F99;font-variant-numeric:tabular-nums;flex:none}
.sb-cloud-close{border:none;background:none;font-size:22px;line-height:1;color:#8A8F99;cursor:pointer;padding:5px 8px;border-radius:9px;flex:none}
.sb-cloud-close:hover{background:rgba(15,15,15,0.05);color:#333}
.sb-cloud-screen{height:264px;overflow:hidden;position:relative;background:#F5F6F8}
.sb-cloud-modal .sb-cloud-screen{height:auto;flex:1;min-height:0;background:#F2F4F7;padding:22px}
.sb-cloud-modal .sb-win{inset:0;border-radius:12px;box-shadow:0 10px 30px rgba(15,15,15,.14)}
.sb-cloud-modal .sb-win-bar{padding:11px 15px;font-size:12px}
.sb-cloud-modal .sb-win-body{padding:16px 18px;font-size:13px;line-height:1.8}
.sb-cloud-foot{display:flex;align-items:center;gap:7px;padding:9px 14px;border-top:1px solid rgba(15,15,15,0.06);font-size:11px;color:#8A8F99}
.sb-cloud-modal .sb-cloud-foot{padding:13px 22px;font-size:12px;background:#fff}
@media (max-width:720px){.sb-cloud-backdrop{padding:12px}.sb-cloud{width:100%;height:calc(100vh - 24px);max-height:none;border-radius:16px}.sb-cloud-head{padding:14px 16px}.sb-cloud-title{font-size:15px}.sb-cloud-modal .sb-cloud-screen{padding:12px}.sb-cloud-modal .sb-win-body{padding:12px;font-size:11px}.sb-cloud-modal .sb-cloud-foot{padding:11px 16px}}
.sb-cloud-dot{width:7px;height:7px;border-radius:50%;background:#57B26A;flex:none}
.sb-cloud-dot.sb-busy{background:#E8A33D}
.sb-cloud-dot.sb-waiting{background:#D45B5B}
.sb-cloud-task{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-cloud-mock{flex:none;color:#B0B4BB;font-size:10px}

/* 屏幕里的窗口 */
.sb-win{position:absolute;inset:10px;border-radius:9px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 14px rgba(15,15,15,0.10)}
.sb-win-bar{flex:none;display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:10.5px}
.sb-win-light{background:#fff;color:#5A5E66}
.sb-win-light .sb-win-bar{background:#F0F1F4;border-bottom:1px solid rgba(15,15,15,0.05)}
.sb-win-dark{background:#14171C;color:#C7D0DC}
.sb-win-dark .sb-win-bar{background:#1D2129;border-bottom:1px solid rgba(255,255,255,0.06)}
.sb-win-dot{width:8px;height:8px;border-radius:50%;flex:none}
.sb-win-url{flex:1;min-width:0;background:rgba(15,15,15,0.05);border-radius:6px;padding:3px 8px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-win-dark .sb-win-url{background:rgba(255,255,255,0.07)}
.sb-win-body{flex:1;overflow:hidden;padding:9px 11px;font-size:10.5px;line-height:1.75}
.sb-win-dark .sb-win-body{font-family:"SF Mono",Menlo,monospace;font-size:10px}
.sb-line{white-space:pre-wrap;word-break:break-all;opacity:0;animation:sb-line-in .25s forwards}
@keyframes sb-line-in{to{opacity:1}}
@keyframes sb-cloud-backdrop-in{from{opacity:0}to{opacity:1}}
@keyframes sb-cloud-panel-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
.sb-line.sb-dim{opacity:.55}
.sb-line.sb-ok{color:#3D9950}
.sb-win-dark .sb-line.sb-ok{color:#6BD490}
.sb-line.sb-hi{color:#3B6BD4}
.sb-win-dark .sb-line.sb-hi{color:#7FA8F5}
.sb-cursor{display:inline-block;width:6px;height:11px;background:currentColor;vertical-align:-1px;animation:sb-cloud-blink 1s infinite}
`;

/* 每个岗位的云电脑画面剧本：窗口标题 / 主题 / 逐行吐出的内容（循环） */
const SCENARIOS = {
  "Browser Agent": {
    app: "Chrome · 线索研究",
    theme: "light",
    url: "https://www.google.com/search?q=跨境电商+ SaaS+决策人",
    lines: [
      ["正在抓取第 4 页搜索结果…", "sb-dim"],
      ["✓ 发现目标公司：云帆科技（跨境电商 ERP）", "sb-ok"],
      ["  └ 官网 alex***@yunfan.io 已补全", ""],
      ["✓ 发现目标公司：Hexa Retail（DTC 品牌）", "sb-ok"],
      ["  └ LinkedIn 决策人：Head of Growth", ""],
      ["验证邮箱可达性：12/14 有效", ""],
      ["⚠ 重复线索已合并（+3 家历史库命中）", "sb-hi"],
      ["导出 9 条高评分线索 → inbox/leads-today.csv", "sb-ok"],
      ["翻页：第 5 页，关键词扩展「独立站 物流」…", "sb-dim"],
      ["✓ 发现目标公司：Polaris Supply（B2B 分销）", "sb-ok"],
      ["  └ 电话 +86 138****2211 已核验", ""],
      ["本轮覆盖 47 家公司，有效线索率 38%", "sb-hi"]
    ]
  },
  "Search Agent": {
    app: "终端 · 数据清洗",
    theme: "dark",
    lines: [
      ["$ python dedupe.py --src leads-today.csv", "sb-dim"],
      ["加载 1,204 行 · 字段校验通过", ""],
      ["重复检测：邮箱哈希命中 37 条 → 合并", ""],
      ["评分模型 v3.2 推理中… 84%", "sb-hi"],
      ["✓ A 级线索 86 条 / B 级 214 条 / C 级 867 条", "sb-ok"],
      ["$ python attribute.py --channel source", "sb-dim"],
      ["来源归因：官网表单 41% · 搜索 33% · 转介绍 12%", ""],
      ["异常值剔除：空号 9 · 域名失效 14", ""],
      ["✓ 输出 output/leads-scored.parquet", "sb-ok"],
      ["$ watch -n 30 python monitor.py", "sb-dim"],
      ["[监控] 数据漂移 0.3%，正常", "sb-hi"]
    ]
  },
  "App Agent": {
    app: "触达序列 · 销售顾问",
    theme: "light",
    url: "salebuddy://sequences/潜在客户拓展",
    lines: [
      ["序列「首轮触达」执行中 · 第 2/5 步", "sb-hi"],
      ["✓ 邮件已发：云帆科技 · 王经理（打开率跟踪中）", "sb-ok"],
      ["✓ 邮件已发：Hexa Retail · Lucy（已打开 ✓✓）", "sb-ok"],
      ["  └ 触发跟进模板 F-2，预约明天 10:00", ""],
      ["待发送 14 封 · 按时区排队", ""],
      ["⚠ Polaris Supply 退信 → 标记换渠道（电话）", "sb-dim"],
      ["A/B 主题行测试：B 版打开率 +11%", "sb-hi"],
      ["✓ 微信话术 v4 已同步给 幕僚长 审批", "sb-ok"],
      ["下一轮触达倒计时 02:59:41", "sb-dim"]
    ]
  },
  "File Agent": {
    app: "文档 · 内容产出",
    theme: "light",
    url: "salebuddy://docs/潜在客户拓展/首触邮件-v5.md",
    lines: [
      ["# 首触邮件 v5（行业：跨境物流）", "sb-hi"],
      ["", ""],
      ["王经理您好，", ""],
      ["注意到贵司近三月东南亚线路单量", ""],
      ["增长 40%，清关时效可能成为瓶颈…", ""],
      ["", ""],
      ["✓ 自动保存 · 版本 v5.3", "sb-ok"],
      ["# 周报草稿：本周线索转化漏斗", "sb-hi"],
      ["- 新增线索 214 · 有效 38%", ""],
      ["- 首触回复率 9.2%（环比 +1.4pp）", "sb-ok"],
      ["✓ 已同步 → 项目共享文件夹", "sb-ok"]
    ]
  },
  "Computer Agent": {
    app: "终端 · 自动化执行",
    theme: "dark",
    lines: [
      ["$ sb run enrich-pipeline --env=cloud", "sb-dim"],
      ["[00:12] 容器就绪 · node20-py311", ""],
      ["[00:13] 挂载工作区 /agents/computer/workspace", ""],
      ["[00:15] 抓取完成 214 条 · 写入暂存区", "sb-ok"],
      ["$ pytest tests/enrich -q", "sb-dim"],
      ["14 passed in 3.21s", "sb-ok"],
      ["$ sb deploy hooks/email-verify --canary 10%", "sb-dim"],
      ["灰度 10% · 错误率 0.0% · 延迟 p95 212ms", "sb-hi"],
      ["$ sb schedule cron '*/30 * * * *' sync-crm", "sb-dim"],
      ["✓ 定时同步已注册：CRM ← 线索库", "sb-ok"],
      ["[监控] CPU 34% · 内存 512Mi · 正常", ""]
    ]
  },
  main: {
    app: "调度台 · 幕僚长",
    theme: "dark",
    lines: [
      ["[调度] 项目组「潜在客户拓展」任务分解 ✓", "sb-hi"],
      ["  ├─ 线索猎人：搜索 + 补全（进行中）", ""],
      ["  ├─ 数据分析师：清洗评分（排队）", ""],
      ["  └─ 内容策划：首触物料 v5（进行中）", ""],
      ["[汇总] 各成员心跳正常 · 4/4 在线", "sb-ok"],
      ["[审批] 销售顾问提交话术 v4 → 等待用户确认", "sb-hi"],
      ["[调度] 重排优先级：高评分线索优先触达", ""],
      ["[汇总] 今日产出：线索 214 · 邮件 32 · 文档 3", "sb-ok"],
      ["[提醒] 17:00 向用户汇报阶段进展", "sb-dim"]
    ]
  }
};

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function dotClass(state) {
  if (state === TEAM_STATES.BUSY) return "sb-busy";
  if (state === TEAM_STATES.WAITING_APPROVAL) return "sb-waiting";
  return "";
}

/* ── 可复用的快照屏幕（办公室浮层与通讯录「云电脑」页签共用）── */

/** 在制工作 → 快照剧本：成员正在跑任务时，云电脑显示他真实在干的事。 */
function liveScenarioFor(agentType, projectId = null) {
  const work = getWorkForProject(agentType, projectId);
  if (!work) return null;
  const base = SCENARIOS[agentType] || SCENARIOS.main;
  const lines = [[`[${work.phase || "执行中"}] ${work.task}`, "sb-hi"]];
  for (const text of work.activities) lines.push([text, ""]);
  if (work.state === "done") {
    lines.push([`✓ 这一步完成${work.artifact ? ` · 已存 ${work.artifact}` : ""}`, "sb-ok"]);
  }
  return {
    app: base.app,
    theme: base.theme,
    url: work.artifact ? `salebuddy://workspace/${work.artifact}` : (base.url || base.app),
    lines
  };
}

/** 在制工作实时供给：先回放已有动态，再订阅新增；返回 dispose。 */
function startWorkFeed(body, agentType, projectId = null) {
  let shown = 0;
  const pushRow = (text, tone = "") => {
    const row = el("div", `sb-line${tone ? " " + tone : ""}`);
    row.textContent = text || " ";
    body.appendChild(row);
    while (body.childElementCount > 40) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
    body.querySelector(".sb-cursor")?.remove();
    row.appendChild(el("span", "sb-cursor"));
  };
  const scenario = liveScenarioFor(agentType, projectId);
  if (!scenario) return null;
  for (const [text, tone] of scenario.lines) pushRow(text, tone);
  shown = scenario.lines.length;
  const unsubscribe = subscribeWork((changed) => {
    if (changed && changed !== agentType) return;
    const next = liveScenarioFor(agentType, projectId);
    if (!next) {
      body.textContent = "";
      pushRow("当前项目暂无进行中的任务", "sb-dim");
      shown = 0;
      const fallback = SCENARIOS[agentType] || SCENARIOS.main;
      const urlEl = body.closest(".sb-win")?.querySelector(".sb-win-url");
      if (urlEl) urlEl.textContent = fallback.url || fallback.app;
      return;
    }
    for (let i = shown; i < next.lines.length; i += 1) pushRow(next.lines[i][0], next.lines[i][1]);
    shown = Math.max(shown, next.lines.length);
    // 产出落地后地址栏同步切到工作区文件
    const urlEl = body.closest(".sb-win")?.querySelector(".sb-win-url");
    if (urlEl && next.url && urlEl.textContent !== next.url) urlEl.textContent = next.url;
  });
  return () => unsubscribe();
}

/** 逐行滚动的内容供给：预填数行 + 定时追加，末尾带闪烁光标。 */
function startLineFeed(body, lines, { prefill = 6, intervalMs = 1100 } = {}) {
  let index = 0;
  const push = () => {
    const [text, tone] = lines[index % lines.length];
    index += 1;
    const row = el("div", `sb-line${tone ? " " + tone : ""}`);
    row.textContent = text || " ";
    body.appendChild(row);
    while (body.childElementCount > 40) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
    body.querySelector(".sb-cursor")?.remove();
    row.appendChild(el("span", "sb-cursor"));
  };
  for (let i = 0; i < prefill; i++) push();
  const timer = setInterval(push, intervalMs);
  return () => clearInterval(timer);
}

/** 按岗位建一个工作窗口（浏览器/终端/文档等）；有在制工作时显示真实工作内容，否则通用模拟。返回 { el, dispose }。 */
export function createSnapshotScreen(agentType, { height = 264, projectId = null } = {}) {
  ensureStyle();
  const live = liveScenarioFor(agentType, projectId);
  const scenario = live || SCENARIOS[agentType] || SCENARIOS.main;
  const screen = el("div", "sb-cloud-screen");
  screen.style.height = `${height}px`;
  const win = el("div", `sb-win ${scenario.theme === "dark" ? "sb-win-dark" : "sb-win-light"}`);
  const bar = el("div", "sb-win-bar");
  for (const color of ["#F26D6D", "#F5BF4F", "#61C454"]) {
    const d = el("span", "sb-win-dot");
    d.style.background = color;
    bar.appendChild(d);
  }
  bar.appendChild(el("span", "sb-win-url", scenario.url || scenario.app));
  win.appendChild(bar);
  const body = el("div", "sb-win-body");
  win.appendChild(body);
  screen.appendChild(win);
  const dispose = live ? (startWorkFeed(body, agentType, projectId) || (() => {})) : startLineFeed(body, scenario.lines);
  return { el: screen, dispose };
}

/** LIVE 小红点标（通讯录等内联场景用）。 */
export function createLiveBadge() {
  ensureStyle();
  const live = el("span", "sb-cloud-live");
  live.appendChild(el("i"));
  live.appendChild(document.createTextNode("LIVE"));
  return live;
}

/**
 * 挂载云电脑快照。
 * deps: { teamLive, gateway }
 */
export function mountCloudDesktop({ teamLive, gateway } = {}) {
  ensureStyle();
  let panel = null;
  let agentType = null;
  let lineTimer = null;
  let clockTimer = null;
  let lineIndex = 0;
  let unsubscribe = null;
  let defaultProgressOpened = false;
  let defaultProgressTimer = null;

  function stopFeeds() {
    clearInterval(lineTimer); lineTimer = null;
    clearInterval(clockTimer); clockTimer = null;
    unsubscribe?.(); unsubscribe = null;
  }

  function close() {
    stopFeeds();
    panel?.remove();
    panel = null;
    agentType = null;
  }

  function profileName(type) {
    return teamLive?.getProfiles?.().get(type)?.identity?.name || type;
  }

  function renderStatus() {
    if (!panel || !agentType) return;
    const status = teamLive?.getStatusOf?.(agentType) || { state: TEAM_STATES.IDLE };
    const dot = panel.querySelector(".sb-cloud-dot");
    if (dot) dot.className = `sb-cloud-dot ${dotClass(status.state)}`;
    const task = panel.querySelector(".sb-cloud-task");
    if (task) task.textContent = status.currentTask ? `${TEAM_STATE_LABELS[status.state]} · ${status.currentTask}` : (TEAM_STATE_LABELS[status.state] || "空闲");
  }

  function pushLine(body, lines) {
    const [text, tone] = lines[lineIndex % lines.length];
    lineIndex += 1;
    const row = el("div", `sb-line${tone ? " " + tone : ""}`);
    row.textContent = text || " ";
    body.appendChild(row);
    while (body.childElementCount > 40) body.firstChild.remove();
    // 最新行贴底
    body.scrollTop = body.scrollHeight;
    // 末尾光标
    body.querySelector(".sb-cursor")?.remove();
    const cursor = el("span", "sb-cursor");
    row.appendChild(cursor);
  }

  function openFor(type) {
    const live = liveScenarioFor(type);
    const scenario = live || SCENARIOS[type] || SCENARIOS.main;
    if (panel && agentType === type) return; // 已在看这台
    close();
    agentType = type;
    lineIndex = 0;

    const backdrop = el("div", "sb-cloud-backdrop notranslate");
    backdrop.setAttribute("translate", "no");
    const shell = el("div", "sb-cloud sb-cloud-modal notranslate");
    shell.setAttribute("translate", "no");
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", `云电脑 · ${profileName(type)}`);
    panel = backdrop;

    const head = el("div", "sb-cloud-head");
    head.appendChild(el("div", "sb-cloud-title", `云电脑 · ${profileName(type)}`));
    const liveBadge = el("span", "sb-cloud-live");
    liveBadge.appendChild(el("i")); liveBadge.appendChild(document.createTextNode("LIVE"));
    head.appendChild(liveBadge);
    const clock = el("span", "sb-cloud-clock", "--:--:--");
    head.appendChild(clock);
    const closeBtn = el("button", "sb-cloud-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭云电脑");
    closeBtn.addEventListener("click", close);
    head.appendChild(closeBtn);

    const screen = el("div", "sb-cloud-screen");
    const win = el("div", `sb-win ${scenario.theme === "dark" ? "sb-win-dark" : "sb-win-light"}`);
    const bar = el("div", "sb-win-bar");
    for (const color of ["#F26D6D", "#F5BF4F", "#61C454"]) {
      const d = el("span", "sb-win-dot"); d.style.background = color; bar.appendChild(d);
    }
    bar.appendChild(el("span", "sb-win-url", scenario.url || scenario.app));
    win.appendChild(bar);
    const body = el("div", "sb-win-body");
    win.appendChild(body);
    screen.appendChild(win);

    const foot = el("div", "sb-cloud-foot");
    foot.appendChild(el("span", "sb-cloud-dot"));
    foot.appendChild(el("span", "sb-cloud-task", "…"));
    foot.appendChild(el("span", "sb-cloud-mock", live ? "任务实时同步" : "模拟实时快照"));

    shell.append(head, screen, foot);
    backdrop.appendChild(shell);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    document.body.appendChild(panel);

    if (live) {
      // 在制工作：回放已有动态 + 订阅新增（真实工作内容）
      const disposeFeed = startWorkFeed(body, type);
      lineTimer = null;
      if (disposeFeed) {
        const prevUnsub = unsubscribe;
        unsubscribe = () => { disposeFeed(); prevUnsub?.(); };
      }
    } else {
      // 预填几行，再按节奏吐新行（通用模拟）
      for (let i = 0; i < 6; i++) pushLine(body, scenario.lines);
      lineTimer = setInterval(() => pushLine(body, scenario.lines), 1100);
    }
    const tick = () => { clock.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false }); };
    tick();
    clockTimer = setInterval(tick, 1000);
    renderStatus();
    const statusUnsub = teamLive?.subscribe?.(renderStatus) || null;
    const feedUnsub = unsubscribe;
    unsubscribe = () => { statusUnsub?.(); feedUnsub?.(); };
  }

  function onEscape(event) {
    if (event.key === "Escape" && panel) close();
  }
  window.addEventListener("keydown", onEscape);

  async function openProgressFor(type) {
    defaultProgressOpened = true;
    const profile = teamLive?.getProfiles?.().get(type) || createDefaultProfile(type);
    const status = teamLive?.getStatusOf?.(type) || { agentType: type, state: TEAM_STATES.IDLE, currentTask: null };
    let projectId = null;
    let projectName = null;
    try {
      const current = (await gateway?.action?.("room.office.current"))?.data?.roomId;
      if (current) {
        projectId = current;
        const rooms = (await gateway?.action?.("room.action.list"))?.data?.rooms || [];
        projectName = rooms.find((room) => room.id === current)?.name || null;
      }
    } catch { /* gateway is optional; the live source still provides a useful view */ }
    close();
    openAgentDrawer(type, profile, status, {
      teamLive,
      projectId,
      projectName,
      onChat: (agentType) => window.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openChatWith?.(agentType))
    });
  }

  // 办公室初次出现时默认展示幕僚长；等待原生办公室右栏和场景都完成挂载。
  function openDefaultProgress() {
    if (defaultProgressOpened || !window.__gameOffice?.scene) return;
    if (!document.querySelector('[class*="_rightPanel_"]')) return;
    defaultProgressOpened = true;
    openProgressFor("main");
  }

  let defaultProgressAttempts = 0;
  defaultProgressTimer = setInterval(() => {
    defaultProgressAttempts += 1;
    openDefaultProgress();
    if (defaultProgressOpened || defaultProgressAttempts >= 120) {
      clearInterval(defaultProgressTimer);
      defaultProgressTimer = null;
    }
  }, 150);

  // ── 精准命中：点显示器 → 云电脑快照；点角色 → 工作进展抽屉（互不干扰）──
  // 用 Pixi 场景自身数据：scene.workstations[i].computerContainer 的 getBounds()
  // 与 scene.mouseWorldX/Y 同属「世界坐标系」（已实测验证同一空间）。
  // client→world 的映射由 scene 自己维护（camera/缩放不公开），做法：
  // 指针移动时在下一拍记录 (client, mouseWorld) 样本对，两点拟合仿射映射；
  // 点击时用拟合结果换算；样本不足则直接用最新 mouseWorld（真实点击前必有 pointermove）。
  const HIT_PAD = 6; // 世界坐标下的容错边距，显示器只有 ~77×48
  const samples = []; // [{cx, cy, wx, wy}]

  function officeCanvas() {
    return window.__gameOffice?.app?.canvas || null;
  }

  function worldFrom(clientX, clientY) {
    const scene = window.__gameOffice?.scene;
    if (!scene) return null;
    const fit = (pairs, c) => {
      if (!pairs.length) return null;
      if (pairs.length === 1) return pairs[0].w;
      const [p1, p2] = pairs;
      const dc = p2.c - p1.c;
      if (Math.abs(dc) < 0.5) return p2.w;
      return p1.w + ((c - p1.c) / dc) * (p2.w - p1.w);
    };
    const xs = samples.map((s) => ({ c: s.cx, w: s.wx }));
    const ys = samples.map((s) => ({ c: s.cy, w: s.wy }));
    const x = fit(xs, clientX);
    const y = fit(ys, clientY);
    if (x == null || y == null) {
      if (Number.isFinite(scene.mouseWorldX)) return { x: scene.mouseWorldX, y: scene.mouseWorldY };
      return null;
    }
    return { x, y };
  }

  function onMoveSample(event) {
    const g = window.__gameOffice;
    if (!g?.scene || event.target !== officeCanvas()) return;
    const { clientX, clientY } = event;
    setTimeout(() => {
      const scene = window.__gameOffice?.scene;
      if (!scene || !Number.isFinite(scene.mouseWorldX)) return;
      samples.push({ cx: clientX, cy: clientY, wx: scene.mouseWorldX, wy: scene.mouseWorldY });
      if (samples.length > 4) samples.shift();
    }, 0);
  }

  function boundsFor(ws, kind) {
    const monitor = [ws.computerContainer, ws.monitorContainer, ws.screenContainer];
    const character = [
      ws.agentContainer,
      ws.characterContainer,
      ws.agent?.displayContainer,
      ws.agent?.bodyContainer,
      ws.character?.displayContainer,
      ws.character?.bodyContainer,
      ws.displayContainer,
      ws.entity?.displayContainer,
      ws.agent,
      ws.character
    ];
    const list = kind === "monitor" ? monitor : character;
    return list.find((item) => item?.getBounds?.())?.getBounds?.() || null;
  }

  function workstationHit(event) {
    const g = window.__gameOffice;
    if (!g?.scene || event.target !== officeCanvas()) return null;
    const world = worldFrom(event.clientX, event.clientY);
    if (!world) return null;
    for (const ws of g.scene.workstations || []) {
      if (!ws.agentType) continue;
      const b = boundsFor(ws, "monitor");
      if (b && world.x >= b.x - HIT_PAD && world.x <= b.x + b.width + HIT_PAD &&
          world.y >= b.y - HIT_PAD && world.y <= b.y + b.height + HIT_PAD) {
        return { type: ws.agentType, kind: "monitor" };
      }
      const characterBounds = boundsFor(ws, "character");
      if (characterBounds && world.x >= characterBounds.x - HIT_PAD && world.x <= characterBounds.x + characterBounds.width + HIT_PAD &&
          world.y >= characterBounds.y - HIT_PAD && world.y <= characterBounds.y + characterBounds.height + HIT_PAD) {
        return { type: ws.agentType, kind: "character" };
      }
    }
    return null;
  }

  function onCanvasPointer(event) {
    const hit = workstationHit(event);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type === "pointerdown") {
      if (hit.kind === "monitor") openFor(hit.type);
      else openProgressFor(hit.type);
    }
  }

  window.addEventListener("pointermove", onMoveSample, true);
  for (const type of ["pointerdown", "pointerup", "click"]) {
    window.addEventListener(type, onCanvasPointer, true);
  }
  console.log("[SaleBuddy] 办公室员工点击已接入实时进展抽屉（显示器保留云电脑快照）");

  return {
    unmount() {
      clearInterval(defaultProgressTimer);
      defaultProgressTimer = null;
      window.removeEventListener("pointermove", onMoveSample, true);
      for (const type of ["pointerdown", "pointerup", "click"]) {
        window.removeEventListener(type, onCanvasPointer, true);
      }
      window.removeEventListener("keydown", onEscape);
      close();
      closeAgentDrawer();
    },
    openFor,
    openProgressFor,
    close
  };
}
