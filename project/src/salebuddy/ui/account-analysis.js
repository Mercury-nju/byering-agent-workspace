import { el } from "./pages.js";
import { mountPersonAvatar } from "./person-avatar.js";
import { buildAccountAnalysisResumeFlow } from "../agents/account-analysis-contract.js";

const CSS = `
.sb-account-analysis-overview{margin:16px 0 8px;padding:18px;border:1px solid #dbe5f5;border-radius:12px;background:#f7f9fd}
.sb-account-analysis-overview-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.sb-account-analysis-overview-title{color:#20252b;font-size:16px;font-weight:750}
.sb-account-analysis-overview-count{color:#788391;font-size:11px}
.sb-account-analysis-overview-summary{margin:8px 0 0;color:#525c67;font-size:12px;line-height:1.65}
.sb-account-analysis-overview-goal{margin-top:9px;color:#788391;font-size:11px;line-height:1.55}
.sb-account-analysis-overview-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.sb-account-analysis-overview-metric{padding:10px 11px;border:1px solid #e3e9f2;border-radius:9px;background:#fff}
.sb-account-analysis-overview-metric strong{display:block;color:#20252b;font-size:18px;line-height:1.1}
.sb-account-analysis-overview-metric span{display:block;margin-top:5px;color:#788391;font-size:10px}
.sb-account-analysis-overview-boundary{margin-top:12px;padding-top:11px;border-top:1px solid #e3e9f2;color:#788391;font-size:10.5px;line-height:1.55}
.sb-account-analysis-report{padding:16px 0;border-top:1px solid #e5e7eb;overflow-wrap:anywhere}
.sb-account-analysis-report-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.sb-account-analysis-report-avatar{width:32px;height:32px;flex:none;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#f3f4f6}
.sb-account-analysis-report-avatar img{width:100%;height:100%;object-fit:cover}
.sb-account-analysis-report-name{color:#20252b;font-size:13px}
.sb-account-analysis-report-summary{margin:0;color:#525c67;font-size:12px;line-height:1.65}
.sb-account-analysis-report h4{margin:15px 0 7px;color:#69737f;font-size:11px;font-weight:700}
.sb-account-analysis-report ul{margin:0;padding-left:18px;color:#343a43;font-size:11px;line-height:1.65}
.sb-account-analysis-report li+li{margin-top:4px}
.sb-account-analysis-report details{margin-top:14px;padding-top:11px;border-top:1px solid #edf0f3;color:#788391;font-size:10.5px;line-height:1.6}
.sb-account-analysis-report details summary{cursor:pointer;color:#5f6b78;font-weight:650}
.sb-account-analysis-report details p{margin:7px 0}
.sb-account-analysis-report details a{color:#2f80ed;text-decoration:none}
@media(max-width:560px){.sb-account-analysis-overview-metrics{grid-template-columns:1fr}.sb-account-analysis-overview-head{align-items:flex-start;flex-direction:column;gap:4px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

export function openAccountAnalysis({ run = {}, items = null, goal = "" } = {}) {
  const resumeFlow = buildAccountAnalysisResumeFlow({ run, items, goal });
  return globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.(framework => framework?.openAgentSquare?.({ initialAgentId: resumeFlow.agentId, resumeFlow }));
}

export function renderAccountAnalysisOverview(container, accounts = [], { goal = "", summary = "" } = {}) {
  ensureStyle();
  const list = Array.isArray(accounts) ? accounts : [];
  const analyzed = list.filter((account) => account?.report?.status !== "insufficient_data").length;
  const insufficient = list.length - analyzed;
  const evidenceCount = list.reduce((total, account) => total + (account?.report?.facts?.length || 0) + (account?.report?.interpretations?.length || 0), 0);
  const section = el("section", "sb-account-analysis-overview");
  const head = el("div", "sb-account-analysis-overview-head");
  head.append(el("strong", "sb-account-analysis-overview-title", "先看这批账号"), el("span", "sb-account-analysis-overview-count", `${list.length} 个公开账号`));
  section.appendChild(head);
  section.appendChild(el("p", "sb-account-analysis-overview-summary", summary || `${analyzed} 个账号已完成分析${insufficient ? `，${insufficient} 个账号资料不足` : ""}。`));
  if (goal) section.appendChild(el("div", "sb-account-analysis-overview-goal", `这次想了解：${goal}`));
  const metrics = el("div", "sb-account-analysis-overview-metrics");
  metrics.append(
    el("div", "sb-account-analysis-overview-metric", null),
    el("div", "sb-account-analysis-overview-metric", null),
    el("div", "sb-account-analysis-overview-metric", null)
  );
  [[analyzed, "已形成账号结论"], [insufficient, "资料仍需补充"], [evidenceCount, "条公开依据"]].forEach(([value, label], index) => {
    const metric = metrics.children[index];
    metric.append(el("strong", null, String(value)), el("span", null, label));
  });
  section.appendChild(metrics);
  section.appendChild(el("div", "sb-account-analysis-overview-boundary", "结论只来自公开主页、公开作品和原始依据，用来比较这批账号；不代表已确认意图、预算或联系方式，也不会触发触达。"));
  container.appendChild(section);
}

export function renderAccountAnalysisReports(container, accounts = []) {
  ensureStyle();
  for (const account of accounts) {
    const section = el("section", "sb-account-analysis-report");
    const head = el("div", "sb-account-analysis-report-head");
    const avatar = el("span", "sb-account-analysis-report-avatar");
    mountPersonAvatar(avatar, account, { name: account.nickname });
    head.append(avatar, el("strong", "sb-account-analysis-report-name", account.nickname || account.id));
    section.append(head, el("p", "sb-account-analysis-report-summary", account.report?.summary || "尚无分析结论"));
    const report = account.report || {};
    for (const [label, values] of [["可核对的事实", (report.facts || []).map(f => f.quote)], ["分析判断", (report.interpretations || []).map(item => item.text)], ["仍需确认", report.unknowns || []], ["下一步建议", report.suggestions || []]]) {
      if (!values.length) continue;
      section.appendChild(el("h4", null, label));
      const list = el("ul");
      values.forEach(value => list.appendChild(el("li", null, value)));
      section.appendChild(list);
    }
    const evidence = el("details");
    evidence.appendChild(el("summary", null, "查看依据与来源"));
    for (const item of account.analysisEvidence || []) evidence.appendChild(el("p", null, `${item.id ? `依据 ${item.id}：` : ""}${item.text}`));
    const sourceTitle = account.source?.taskTitle || account.source?.taskId;
    if (sourceTitle) evidence.appendChild(el("p", null, `来源任务：${sourceTitle}`));
    if (account.source?.taskGoal && account.source.taskGoal !== account.source.taskTitle) evidence.appendChild(el("p", null, `找人目的：${account.source.taskGoal}`));
    if (account.profileUrl) {
      const link = el("a", null, "打开账号主页"); link.href = account.profileUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; evidence.appendChild(link);
    }
    section.appendChild(evidence);
    container.appendChild(section);
  }
}
