const value = (input, fallback = "—") => {
  const text = String(input ?? "").trim();
  return text || fallback;
};

const list = (items) => Array.isArray(items) ? items.filter((item) => String(item ?? "").trim()) : [];

function accountTitle(account = {}) {
  return value(account.nickname || account.id, "未命名账号");
}

function reportLines(label, items) {
  const values = list(items);
  if (!values.length) return [`- ${label}：暂无真实产出`];
  return [`### ${label}`, ...values.map((item) => `- ${value(item)}`)];
}

function escapeHtml(input) {
  return String(input ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function htmlList(items, empty = "暂无真实产出") {
  const values = list(items);
  if (!values.length) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function accountReportHtml(account = {}) {
  const report = account.report || {};
  const facts = (report.facts || []).map((item) => value(item?.quote));
  const interpretations = (report.interpretations || []).map((item) => value(item?.text));
  return `
    <article class="account">
      <h2>${escapeHtml(accountTitle(account))}</h2>
      <dl>
        <div><dt>主页</dt><dd>${escapeHtml(value(account.profileUrl))}</dd></div>
        <div><dt>分析状态</dt><dd>${report.status === "insufficient_data" ? "资料不足" : "已分析"}</dd></div>
      </dl>
      <p class="summary">${escapeHtml(value(report.summary, "暂无分析结论"))}</p>
      <section><h3>可核对的事实</h3>${htmlList(facts)}</section>
      <section><h3>分析判断</h3>${htmlList(interpretations)}</section>
      <section><h3>仍需确认</h3>${htmlList(report.unknowns)}</section>
      <section><h3>下一步建议</h3>${htmlList(report.suggestions)}</section>
    </article>`;
}

export function buildAccountAnalysisReportHtml(result = {}) {
  const accounts = Array.isArray(result.accounts) ? result.accounts : Array.isArray(result.items) ? result.items : [];
  const links = result.links || {};
  const sourceGoal = links.sourceTaskGoal && links.sourceTaskGoal !== links.sourceTaskTitle
    ? `<li>找人目的：${escapeHtml(links.sourceTaskGoal)}</li>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>抖音账号分析报告</title>
  <style>
    body{margin:0;background:#f6f8fb;color:#18232e;font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
    main{max-width:880px;margin:0 auto;padding:42px 28px 64px}.cover,.account{background:#fff;border:1px solid #e4e9f0;border-radius:14px;padding:28px;margin:0 0 18px;box-shadow:0 8px 24px rgba(20,38,61,.05)}
    h1{margin:0 0 8px;font-size:28px;line-height:1.25}h2{margin:0 0 14px;font-size:20px}h3{margin:18px 0 6px;font-size:15px}.meta{color:#667487}.summary{font-size:16px}dl{display:grid;gap:6px;margin:0}dl div{display:grid;grid-template-columns:72px 1fr;gap:12px}dt{color:#7c8998}dd{margin:0;overflow-wrap:anywhere}ul{margin:6px 0;padding-left:20px}.empty{margin:6px 0;color:#7c8998}.boundary{color:#526170}
  </style>
</head>
<body><main>
  <section class="cover">
    <h1>抖音账号分析报告</h1>
    <p class="meta">分析目标：${escapeHtml(value(result.inputs?.goal || result.goal, "分析账号内容、需求和待确认信息"))}<br>分析时间：${escapeHtml(value(result.generatedAt, "未记录"))}<br>结果状态：${result.status === "completed" ? "已完成" : "部分完成"}</p>
    <p class="summary">${escapeHtml(value(result.summary, "暂无总结"))}</p>
  </section>
  ${accounts.length ? accounts.map(accountReportHtml).join("") : '<section class="account"><p class="empty">暂无账号分析结果。</p></section>'}
  <section class="cover boundary"><h2>来源与边界</h2><ul>
    <li>仅依据抖音公开主页、公开作品和原始证据整理。</li>
    <li>本报告用于理解账号与辅助决策，不代表对账号意图、预算或联系方式的确定判断。</li>
    <li>来源任务：${escapeHtml(value(links.sourceTaskTitle || links.sourceTaskId, "直接输入账号主页"))}</li>
    ${sourceGoal}
  </ul></section>
</main></body></html>`;
}

export function buildAccountAnalysisReportMarkdown(result = {}) {
  const accounts = Array.isArray(result.accounts) ? result.accounts : Array.isArray(result.items) ? result.items : [];
  const lines = [
    "# 抖音账号分析报告",
    "",
    `> 分析目标：${value(result.inputs?.goal || result.goal, "分析账号内容、需求和待确认信息")}`,
    `> 分析时间：${value(result.generatedAt, "未记录")}`,
    `> 结果状态：${result.status === "completed" ? "已完成" : "部分完成"}`,
    "",
    "## 总结",
    value(result.summary, "暂无总结"),
    "",
    "## 账号分析"
  ];

  if (!accounts.length) lines.push("暂无账号分析结果。", "");
  for (const account of accounts) {
    const report = account.report || {};
    lines.push(
      `### ${accountTitle(account)}`,
      `- 主页：${value(account.profileUrl)}`,
      `- 分析状态：${report.status === "insufficient_data" ? "资料不足" : "已分析"}`,
      `- 账号总结：${value(report.summary, "暂无分析结论")}`,
      ...reportLines("可核对的事实", (report.facts || []).map((item) => value(item.quote))),
      ...reportLines("分析判断", (report.interpretations || []).map((item) => value(item.text))),
      ...reportLines("仍需确认", report.unknowns),
      ...reportLines("下一步建议", report.suggestions),
      ""
    );
  }

  lines.push(
    "## 来源与边界",
    "- 仅依据抖音公开主页、公开作品和原始证据整理。",
    "- 本报告用于理解账号与辅助决策，不代表对账号意图、预算或联系方式的确定判断。",
    `- 来源任务：${value(result.links?.sourceTaskTitle || result.links?.sourceTaskId, "直接输入账号主页")}`,
    ...(result.links?.sourceTaskGoal && result.links.sourceTaskGoal !== result.links.sourceTaskTitle
      ? [`- 找人目的：${result.links.sourceTaskGoal}`]
      : [])
  );
  return lines.join("\n");
}

export function accountAnalysisReportFile(result = {}, { createdBy = "抖音账号分析" } = {}) {
  const taskId = value(result.taskId, `analysis-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const accounts = Array.isArray(result.accounts) ? result.accounts : Array.isArray(result.items) ? result.items : [];
  const links = result.links || {};
  return {
    name: `抖音账号分析报告-${taskId}.html`,
    type: "html",
    content: buildAccountAnalysisReportHtml(result),
    projectId: "account-research",
    projectName: "账号研究",
    taskId: result.taskId || null,
    createdBy,
    sourceTaskId: links.sourceTaskId || null,
    sourceTaskTitle: links.sourceTaskTitle || (links.sourceTaskId ? "" : "直接输入账号主页"),
    sourceTaskGoal: links.sourceTaskGoal || "",
    sourceResultId: links.sourceResultId || null,
    accountCount: accounts.length,
    accountNames: accounts.map(account => accountTitle(account)).filter(Boolean),
    summary: value(result.summary, "账号分析报告")
  };
}

export function accountAnalysisReportConversationMessage(file = {}) {
  return {
    text: "账号分析报告已完成，已发送到这里，并同步保存到文件中心。",
    artifact: {
      id: file.id || null,
      name: file.name || "抖音账号分析报告.html",
      type: file.type || "html",
      projectName: file.projectName || "账号研究",
      summary: file.summary || "点击查看 HTML 分析报告",
      status: "已完成"
    }
  };
}
