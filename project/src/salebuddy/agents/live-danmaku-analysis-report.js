function text(value, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function list(items, fallback = "暂无") {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  return values.length ? values : [fallback];
}

function analysisOf(result = {}) {
  return result.danmakuAnalysis && typeof result.danmakuAnalysis === "object" ? result.danmakuAnalysis : result;
}

function metric(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("zh-CN") : "0";
}

export function buildLiveDanmakuAnalysisReportHtml(result = {}) {
  const analysis = analysisOf(result);
  const counts = analysis.counts || {};
  const users = Array.isArray(analysis.users) ? analysis.users : [];
  const topics = Array.isArray(analysis.topics) ? analysis.topics : [];
  const source = analysis.analysisSource === "ai" ? "AI 分析" : "规则兜底分析";
  const userSections = users.length
    ? users.map((user) => {
      const evidence = list((user.evidence || []).map(item => item?.quote).filter(Boolean));
      const ai = user.aiIntent || {};
      return `<article class="user"><h3>${escapeHtml(text(user.nickname, "抖音用户"))}</h3><p class="user-meta">意向：${escapeHtml(text(ai.tier || user.intentTier, "待确认"))} · 分数：${escapeHtml(metric(ai.score ?? user.score))} · 弹幕：${escapeHtml(metric(user.danmakuCount))} 条</p><p>${escapeHtml(text(ai.reason, "基于该用户在本场直播中的弹幕整理。"))}</p><ul>${evidence.map(item => `<li>“${escapeHtml(item)}”</li>`).join("")}</ul></article>`;
    }).join("")
    : '<p class="empty">本场直播没有可分析的文字弹幕。</p>';
  const topicSections = topics.length
    ? topics.map(topic => `<li><strong>${escapeHtml(text(topic.label || topic.name, "未命名主题"))}</strong> · ${escapeHtml(metric(topic.count))} 条${topic.examples?.length ? `：${escapeHtml(topic.examples.join("；"))}` : ""}</li>`).join("")
    : '<li>暂无高频主题</li>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>直播间弹幕分析报告</title><style>body{margin:0;background:#f5f7fa;color:#26313d;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.page{max-width:900px;margin:0 auto;padding:48px 28px}.cover,.section{background:#fff;border:1px solid #e0e6ed;border-radius:12px;padding:28px;margin-bottom:20px}.cover{border-top:4px solid #3182f6}.eyebrow{color:#718096;font-size:13px;letter-spacing:.08em}.meta,.muted{color:#718096}.summary{font-size:18px}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.metric{background:#f4f7fb;border-radius:8px;padding:14px}.metric strong{display:block;font-size:24px}.metric span{color:#718096;font-size:13px}.user{border-top:1px solid #e8edf2;padding:18px 0}.user:first-of-type{border-top:0}.user-meta{color:#5175a8}.empty{color:#8b97a3}@media(max-width:700px){.page{padding:20px 14px}.metrics{grid-template-columns:repeat(2,1fr)}}</style></head><body><main class="page"><section class="cover"><div class="eyebrow">BYERING · LIVE SESSION</div><h1>直播间弹幕分析报告</h1><p class="meta">分析目标：${escapeHtml(text(analysis.goal, "按整场弹幕归纳问题和需求"))}<br>生成时间：${escapeHtml(text(result.generatedAt || analysis.observedAt, "未记录"))}<br>分析方式：${escapeHtml(source)}</p><p class="summary">${escapeHtml(text(analysis.summary, "直播结束后已完成整场弹幕分析。"))}</p></section><section class="section"><h2>整场数据概览</h2><div class="metrics"><div class="metric"><strong>${metric(counts.danmaku ?? counts.total)}</strong><span>采集弹幕</span></div><div class="metric"><strong>${metric(counts.uniqueUsers)}</strong><span>互动用户</span></div><div class="metric"><strong>${metric(counts.questions)}</strong><span>待回应问题</span></div><div class="metric"><strong>${metric(counts.highIntent)}</strong><span>明确需求</span></div><div class="metric"><strong>${metric(counts.mediumIntent)}</strong><span>待确认用户</span></div></div></section><section class="section"><h2>高频主题</h2><ul>${topicSections}</ul></section><section class="section"><h2>用户分析</h2>${userSections}</section><section class="section"><h2>来源与边界</h2><ul><li>本报告在直播结束后，基于本场持续采集到的全部弹幕生成。</li><li>本 Agent 负责监听、归纳和分析，不负责私信触达。</li><li>意向判断用于辅助跟进，仍应结合后续对话确认。</li></ul></section></main></body></html>`;
}

export function liveDanmakuAnalysisReportFile(result = {}, { createdBy = "直播间弹幕分析" } = {}) {
  const analysis = analysisOf(result);
  const taskId = text(result.taskId, `live-analysis-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  return {
    name: `直播间弹幕分析报告-${taskId}.html`,
    type: "html",
    content: buildLiveDanmakuAnalysisReportHtml(result),
    projectId: "live-danmaku-analysis",
    projectName: "直播间分析",
    taskId: result.taskId || null,
    taskRunId: result.taskRunId || null,
    agentId: "mkt-live-danmaku-analysis",
    artifactKind: "live-danmaku-analysis-report",
    createdBy,
    createdAt: result.generatedAt || analysis.observedAt || null,
    summary: text(analysis.summary, "直播结束后基于整场弹幕生成的分析报告")
  };
}

export function liveDanmakuAnalysisReportConversationMessage(file = {}) {
  return {
    text: "直播间已结束，我已基于整场弹幕完成 AI 分析，报告已发送到这里，并同步保存到文件中心。",
    artifact: {
      id: file.id || null,
      name: file.name || "直播间弹幕分析报告.html",
      type: file.type || "html",
      projectName: file.projectName || "直播间分析",
      summary: file.summary || "点击查看 HTML 分析报告",
      status: "已完成"
    }
  };
}
