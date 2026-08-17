/**
 * ui/resource-center.js
 * 资源中心：AI 组织的成本与投入产出经营面板（替换原骨架弹窗）。
 * 数据源是 resource-store（localStorage 持久化 + 发布订阅）——
 * 任务运行时引擎实时记录成本流水（Token/API/云电脑/存储/邮件短信/数据采购），
 * 余额与各项面板随之实时变动；本月预算与高成本审批线可编辑并持久化。
 */
import { openPage, el } from "./pages.js";
import { getState, setMonthBudget, setApprovalLine, subscribe, KIND_LABELS } from "../agents/resource-store.js";

const CSS = `
.sb-res{height:100%;overflow-y:auto;background:#FAFAFA;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-res-inner{max-width:880px;margin:0 auto;padding:24px 32px 40px}
.sb-res-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.sb-res-card{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:14px 16px}
.sb-res-cardlabel{font-size:11px;color:#8A8F99;margin-bottom:6px}
.sb-res-cardnum{font-size:22px;font-weight:700;color:#1F2329;font-variant-numeric:tabular-nums;line-height:1.2}
.sb-res-cardnum small{font-size:12px;font-weight:500;color:#8A8F99;margin-left:2px}
.sb-res-cardsub{font-size:11px;color:#8A8F99;margin-top:5px}
.sb-res-budgetbar{height:4px;border-radius:2px;background:rgba(15,15,15,0.07);margin-top:8px;overflow:hidden}
.sb-res-budgetbar i{display:block;height:100%;border-radius:2px;background:#57B26A;transition:width .5s ease}
.sb-res-budgetbar.sb-warn i{background:#E8A33D}
.sb-res-budgetbar.sb-over i{background:#E86363}

.sb-res-sec{background:#fff;border:1px solid rgba(15,15,15,0.06);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.sb-res-sectitle{font-size:14px;font-weight:600;color:#1F2329;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.sb-res-secnote{font-size:11px;color:#B0B4BB;font-weight:400}

.sb-res-kind{display:flex;align-items:center;gap:12px;padding:7px 0}
.sb-res-kindlabel{flex:none;width:76px;font-size:12.5px;color:#3F434A}
.sb-res-kindbar{flex:1;height:8px;border-radius:4px;background:rgba(15,15,15,0.05);overflow:hidden}
.sb-res-kindbar i{display:block;height:100%;border-radius:4px;transition:width .5s ease}
.sb-res-kindnum{flex:none;width:76px;text-align:right;font-size:12.5px;font-weight:600;color:#1F2329;font-variant-numeric:tabular-nums}
.sb-res-kindpct{flex:none;width:44px;text-align:right;font-size:11px;color:#8A8F99;font-variant-numeric:tabular-nums}

.sb-res-table{width:100%;border-collapse:collapse;font-size:12.5px}
.sb-res-table th{text-align:left;color:#8A8F99;font-weight:500;font-size:11.5px;padding:6px 10px;border-bottom:1px solid rgba(15,15,15,0.07);white-space:nowrap}
.sb-res-table td{padding:8px 10px;border-bottom:1px solid rgba(15,15,15,0.045);color:#1F2329}
.sb-res-table tr:last-child td{border-bottom:none}
.sb-res-table .sb-num{text-align:right;font-variant-numeric:tabular-nums}
.sb-res-status{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.sb-res-status.sb-done{background:rgba(87,178,106,0.14);color:#2F7D3F}
.sb-res-status.sb-running{background:rgba(76,154,255,0.12);color:#3B6BD4}
.sb-res-over{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:600;background:rgba(232,99,99,0.12);color:#C4453C}

.sb-res-eff{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sb-res-effitem{background:rgba(15,15,15,0.025);border-radius:10px;padding:10px 14px}
.sb-res-effnum{font-size:18px;font-weight:700;color:#1F2329;font-variant-numeric:tabular-nums}
.sb-res-effnum small{font-size:11px;font-weight:500;color:#8A8F99;margin-left:2px}
.sb-res-efflabel{font-size:11px;color:#8A8F99;margin-top:3px}

.sb-res-setrow{display:flex;align-items:center;gap:12px;padding:8px 0}
.sb-res-setlabel{flex:none;width:180px;font-size:12.5px;color:#3F434A}
.sb-res-setlabel small{display:block;font-size:11px;color:#B0B4BB;margin-top:2px}
.sb-res-input{width:120px;border:1px solid rgba(15,15,15,0.12);border-radius:8px;padding:6px 10px;font-size:13px;font-family:inherit;color:#1F2329;outline:none;text-align:right;font-variant-numeric:tabular-nums}
.sb-res-input:focus{border-color:rgba(76,154,255,0.55)}
.sb-res-save{border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;background:#1F2329;color:#fff}
.sb-res-save:hover{background:#3F434A}
.sb-res-saved{font-size:11.5px;color:#2F7D3F;font-weight:600}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const KIND_ORDER = ["token", "api", "cloud", "storage", "mail", "data"];
const KIND_COLORS = {
  token: "#4C9AFF",
  api: "#8F6BD8",
  cloud: "#E8A33D",
  storage: "#57B26A",
  mail: "#E86363",
  data: "#3AA6A6"
};

function yuan(n) {
  return `¥${(Math.round(n * 100) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function inThisMonth(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatDuration(task) {
  if (task.durationMin != null) return `${task.durationMin} 分钟`;
  if (task.durationSec != null) return task.durationSec >= 60 ? `${Math.floor(task.durationSec / 60)} 分 ${task.durationSec % 60} 秒` : `${task.durationSec} 秒`;
  return "—";
}

/**
 * 打开资源中心页面。
 * options: { onClose }
 */
export function openResourceCenterPage({ onClose = null } = {}) {
  ensureStyle();
  let unsubscribe = null;

  const page = openPage({
    title: "资源中心",
    onClose: () => {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      onClose?.();
    }
  });

  const wrap = el("div", "sb-res notranslate");
  wrap.setAttribute("translate", "no");
  const inner = el("div", "sb-res-inner");
  wrap.appendChild(inner);
  page.body.appendChild(wrap);

  function render() {
    const { balance, monthBudget, approvalLine, entries, tasks } = getState();
    const monthEntries = entries.filter((e) => inThisMonth(e.created_at));
    const monthSpend = monthEntries.reduce((sum, e) => sum + e.amount, 0);
    const doneTasks = tasks.filter((t) => t.status === "done");
    const runningTasks = tasks.filter((t) => t.status === "running");
    const avgCost = doneTasks.length ? doneTasks.reduce((sum, t) => sum + (t.cost || 0), 0) / doneTasks.length : 0;
    const totalLeads = doneTasks.reduce((sum, t) => sum + (t.leads || 0), 0);
    const totalFiles = tasks.reduce((sum, t) => sum + (t.files || 0), 0);
    const budgetPct = monthBudget > 0 ? Math.min(100, (monthSpend / monthBudget) * 100) : 0;

    inner.textContent = "";

    // ── 概览卡 ──
    const cards = el("div", "sb-res-cards");
    const card1 = el("div", "sb-res-card");
    card1.appendChild(el("div", "sb-res-cardlabel", "账户余额"));
    const bal = el("div", "sb-res-cardnum", yuan(balance));
    card1.appendChild(bal);
    card1.appendChild(el("div", "sb-res-cardsub", balance < 0 ? "余额不足，请充值" : "可用于全部 Agent 执行"));
    cards.appendChild(card1);

    const card2 = el("div", "sb-res-card");
    card2.appendChild(el("div", "sb-res-cardlabel", "本月消耗"));
    card2.appendChild(el("div", "sb-res-cardnum", yuan(monthSpend)));
    const bar = el("div", `sb-res-budgetbar${budgetPct >= 100 ? " sb-over" : budgetPct >= 80 ? " sb-warn" : ""}`);
    const barI = el("i");
    barI.style.width = `${budgetPct}%`;
    bar.appendChild(barI);
    card2.appendChild(bar);
    card2.appendChild(el("div", "sb-res-cardsub", `预算 ${yuan(monthBudget)} · 已用 ${budgetPct.toFixed(1)}%`));
    cards.appendChild(card2);

    const card3 = el("div", "sb-res-card");
    card3.appendChild(el("div", "sb-res-cardlabel", "本月任务"));
    const tnum = el("div", "sb-res-cardnum", String(tasks.length));
    card3.appendChild(tnum);
    card3.appendChild(el("div", "sb-res-cardsub", runningTasks.length ? `${runningTasks.length} 个进行中` : "全部已完结"));
    cards.appendChild(card3);

    const card4 = el("div", "sb-res-card");
    card4.appendChild(el("div", "sb-res-cardlabel", "平均任务成本"));
    card4.appendChild(el("div", "sb-res-cardnum", yuan(avgCost)));
    card4.appendChild(el("div", "sb-res-cardsub", `审批线 ${yuan(approvalLine)} / 单任务`));
    cards.appendChild(card4);
    inner.appendChild(cards);

    // ── 消耗分项 ──
    const kindSec = el("div", "sb-res-sec");
    kindSec.appendChild(el("div", "sb-res-sectitle", "消耗分项"));
    const byKind = new Map();
    for (const e of monthEntries) byKind.set(e.kind, (byKind.get(e.kind) || 0) + e.amount);
    for (const kind of KIND_ORDER) {
      const amount = byKind.get(kind) || 0;
      const pct = monthSpend > 0 ? (amount / monthSpend) * 100 : 0;
      const row = el("div", "sb-res-kind");
      row.appendChild(el("span", "sb-res-kindlabel", KIND_LABELS[kind]));
      const kbar = el("div", "sb-res-kindbar");
      const ki = el("i");
      ki.style.width = `${pct}%`;
      ki.style.background = KIND_COLORS[kind];
      kbar.appendChild(ki);
      row.appendChild(kbar);
      row.appendChild(el("span", "sb-res-kindnum", yuan(amount)));
      row.appendChild(el("span", "sb-res-kindpct", `${pct.toFixed(0)}%`));
      kindSec.appendChild(row);
    }
    inner.appendChild(kindSec);

    // ── 按任务成本 ──
    const taskSec = el("div", "sb-res-sec");
    const taskTitle = el("div", "sb-res-sectitle", "按任务成本");
    taskTitle.appendChild(el("span", "sb-res-secnote", "超过审批线的任务已标红"));
    taskSec.appendChild(taskTitle);
    const ttable = el("table", "sb-res-table");
    ttable.innerHTML = "<thead><tr><th>任务</th><th>项目组</th><th class=\"sb-num\">成本</th><th class=\"sb-num\">文件</th><th class=\"sb-num\">线索</th><th>耗时</th><th>状态</th></tr></thead>";
    const ttbody = document.createElement("tbody");
    const sortedTasks = tasks.slice().sort((a, b) => String(b.done_at || b.started_at || "").localeCompare(String(a.done_at || a.started_at || "")));
    for (const task of sortedTasks) {
      const tr = document.createElement("tr");
      const titleTd = el("td", null, (task.title || "未命名任务").length > 20 ? `${(task.title || "").slice(0, 20)}…` : task.title || "未命名任务");
      tr.appendChild(titleTd);
      tr.appendChild(el("td", null, task.projectName || "—"));
      const costTd = el("td", "sb-num");
      costTd.appendChild(document.createTextNode(yuan(task.cost || 0)));
      if ((task.cost || 0) > approvalLine) costTd.appendChild(el("span", "sb-res-over", "触发审批线"));
      tr.appendChild(costTd);
      tr.appendChild(el("td", "sb-num", String(task.files || 0)));
      tr.appendChild(el("td", "sb-num", String(task.leads || 0)));
      tr.appendChild(el("td", null, task.status === "running" ? "进行中" : formatDuration(task)));
      const statusTd = document.createElement("td");
      statusTd.appendChild(el("span", `sb-res-status ${task.status === "done" ? "sb-done" : "sb-running"}`, task.status === "done" ? "已完成" : "进行中"));
      tr.appendChild(statusTd);
      ttbody.appendChild(tr);
    }
    ttable.appendChild(ttbody);
    taskSec.appendChild(ttable);
    inner.appendChild(taskSec);

    // ── 按 Agent 消耗 ──
    const agentSec = el("div", "sb-res-sec");
    agentSec.appendChild(el("div", "sb-res-sectitle", "按 Agent 消耗"));
    const byAgent = new Map();
    for (const e of monthEntries) {
      const cur = byAgent.get(e.agent) || { amount: 0, kinds: new Set() };
      cur.amount += e.amount;
      cur.kinds.add(e.kind);
      byAgent.set(e.agent, cur);
    }
    const atable = el("table", "sb-res-table");
    atable.innerHTML = "<thead><tr><th>Agent</th><th>主要消耗</th><th class=\"sb-num\">本月消耗</th><th class=\"sb-num\">占比</th></tr></thead>";
    const atbody = document.createElement("tbody");
    const agentRows = [...byAgent.entries()].sort((a, b) => b[1].amount - a[1].amount);
    for (const [agent, info] of agentRows) {
      const tr = document.createElement("tr");
      tr.appendChild(el("td", null, agent || "—"));
      tr.appendChild(el("td", null, [...info.kinds].map((k) => KIND_LABELS[k]).slice(0, 3).join(" / ")));
      tr.appendChild(el("td", "sb-num", yuan(info.amount)));
      tr.appendChild(el("td", "sb-num", monthSpend > 0 ? `${((info.amount / monthSpend) * 100).toFixed(1)}%` : "—"));
      atbody.appendChild(tr);
    }
    atable.appendChild(atbody);
    agentSec.appendChild(atable);
    inner.appendChild(agentSec);

    // ── 投入产出效率 ──
    const effSec = el("div", "sb-res-sec");
    effSec.appendChild(el("div", "sb-res-sectitle", "投入产出效率"));
    const eff = el("div", "sb-res-eff");
    const successRate = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
    const avgDuration = doneTasks.length
      ? Math.round(doneTasks.reduce((sum, t) => sum + (t.durationMin != null ? t.durationMin * 60 : t.durationSec || 0), 0) / doneTasks.length)
      : 0;
    const costPerLead = totalLeads > 0 ? monthSpend / totalLeads : 0;
    const savedHours = Math.round(doneTasks.length * 3.5 * 10) / 10; // 每任务约省 3.5 人工小时
    const effItems = [
      { num: String(doneTasks.length), unit: "个", label: "完成任务" },
      { num: `${successRate}`, unit: "%", label: "任务成功率" },
      { num: avgDuration >= 60 ? `${Math.floor(avgDuration / 60)}` : `${avgDuration}`, unit: avgDuration >= 60 ? "分钟" : "秒", label: "平均完成时间" },
      { num: yuan(avgCost), unit: "", label: "平均任务成本" },
      { num: String(totalLeads), unit: "条", label: "创造线索" },
      { num: String(totalFiles), unit: "份", label: "产出文件" },
      { num: totalLeads > 0 ? yuan(costPerLead) : "—", unit: "", label: "单线索成本" },
      { num: `≈${savedHours}`, unit: "小时", label: "节省人工时间" }
    ];
    for (const item of effItems) {
      const box = el("div", "sb-res-effitem");
      const num = el("div", "sb-res-effnum", item.num);
      if (item.unit) num.appendChild(el("small", null, item.unit));
      box.appendChild(num);
      box.appendChild(el("div", "sb-res-efflabel", item.label));
      eff.appendChild(box);
    }
    effSec.appendChild(eff);
    inner.appendChild(effSec);

    // ── 预算与审批线 ──
    const setSec = el("div", "sb-res-sec");
    setSec.appendChild(el("div", "sb-res-sectitle", "预算与审批线"));
    const buildRow = (label, hint, value, onSave) => {
      const row = el("div", "sb-res-setrow");
      const lab = el("div", "sb-res-setlabel", label);
      lab.appendChild(el("small", null, hint));
      row.appendChild(lab);
      const input = el("input", "sb-res-input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.value = String(value);
      row.appendChild(input);
      const save = el("button", "sb-res-save", "保存");
      const saved = el("span", "sb-res-saved", "已保存 ✓");
      saved.style.display = "none";
      save.addEventListener("click", () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v) && v >= 0) {
          onSave(v);
          saved.style.display = "";
          setTimeout(() => { saved.style.display = "none"; }, 1800);
        }
      });
      row.append(save, saved);
      return row;
    };
    setSec.appendChild(buildRow("本月预算", "全组织共享，超 80% 预警", monthBudget, (v) => setMonthBudget(v)));
    setSec.appendChild(buildRow("高成本审批线", "单任务成本超过此金额需审批", approvalLine, (v) => setApprovalLine(v)));
    inner.appendChild(setSec);
  }

  render();

  // 任务运行记录成本时，面板实时刷新（设置行正在编辑时不重绘，避免打断输入）
  unsubscribe = subscribe(() => {
    if (wrap.querySelector(".sb-res-input:focus")) return;
    render();
  });

  return page;
}
