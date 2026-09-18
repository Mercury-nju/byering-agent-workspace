import {
  VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
  VIRAL_WORK_ANALYSIS_PURPOSE,
  VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE,
  VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE_ID
} from "./viral-work-analysis.js";

const value = (input, fallback = "—") => {
  const text = String(input ?? "").trim();
  return text || fallback;
};

const list = (items) => Array.isArray(items)
  ? items.filter((item) => String(item ?? "").trim())
  : [];

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

function metricValue(value) {
  return value == null ? "暂无数据" : Number(value).toLocaleString("zh-CN");
}

const DISPLAY_LABELS = Object.freeze({
  video: "视频内容",
  metrics: "视频数据",
  comments: "观众反馈",
  judgement: "我们的判断",
  "视频事实": "视频内容",
  "作品表现": "视频数据",
  "观众反馈": "观众反馈",
  "分析判断": "我们的判断",
  work_description: "视频简介",
  work_metrics: "视频数据",
  work_hashtags: "发布标签",
  comment: "观众评论"
});

const INTERNAL_TEXT_REPLACEMENTS = [
  [/已识别作品 ID ([^，]+)，将标准作品链接作为后续数据源。?/g, "已确认视频编号 $1，并使用该链接作为本次分析依据。"],
  [/已刷新标题、作者、时长、互动指标和公开标签；这些字段只作为作品表现事实，不替代视频观察。?/g, "已刷新标题、作者、时长、互动数据和发布标签；这些公开数据只用于说明视频表现，不代替对视频内容的观察。"],
  [/本轮视频模型因推理限额未完成重新解析；视频事实区引用同一链接上一份已完成观察，并在报告中明确标注。?/g, "本次视频内容复核暂未完成，视频拆解部分沿用同一视频此前已经完成的观察，并已在报告中说明。"],
  [/本轮已重新生成 (\d+) 张场景参考画面；由于本轮视频模型不可用，这些画面用于回看事实，不等同于本轮内容关键帧。?/g, "本次已更新 $1 张回看画面。由于视频内容复核暂未完成，这些画面用于辅助回看原视频，不单独代表新的内容结论。"],
  [/本轮视频内容复核因推理限额未完成重新解析；视频内容部分引用同一链接上一份已完成观察，并在报告中明确标注。?/g, "本次视频内容复核暂未完成，视频拆解部分沿用同一视频此前已经完成的观察，并已在报告中说明。"],
  [/本轮已重新生成 (\d+) 张场景参考画面；由于本轮视频内容复核暂未完成，这些画面用于回看事实，不等同于本轮内容关键帧。?/g, "本次已更新 $1 张回看画面。由于视频内容复核暂未完成，这些画面用于辅助回看原视频，不单独代表新的内容结论。"],
  [/已按当前优化后的证据分层、事实与判断分离、增长假设和下一轮测试规则重新计算总结与建议。?/g, "已按“先看内容、再看数据、最后转成行动”的方式整理结论和建议。"],
  [/本轮视频模型因推理限额未重新解析；以下视频事实引用 \d{4}-\d{2}-\d{2} 同一链接已完成的观察结果，仅作为既有证据。?/g, "本次视频内容复核暂未完成，以下内容沿用同一视频此前已经完成的观察，仅供参考。"],
  [/本轮视频模型达到推理限额，视频事实区沿用同一链接的既有观察并已明确标注。?/g, "视频内容复核暂未完成，本次沿用同一视频此前已经完成的观察，相关结论请先作为参考。"],
  [/评论采集源未配置，本次先基于作品详情(?:和既有视频观察)?生成(?:重合成)?报告。?/g, "目前没有可读取的公开评论，评论部分暂不下结论。"],
  [/视频本身暂未完成解析/g, "视频内容暂未完成复核"],
  [/视频本身已解析/g, "视频内容已梳理"],
  [/视频本身解析/g, "视频内容复核"],
  [/视频本身/g, "视频内容"],
  [/视频模型不可用/g, "视频内容复核暂未完成"],
  [/视频模型/g, "视频内容复核"],
  [/作品详情/g, "视频公开信息"],
  [/作品表现/g, "视频表现"],
  [/视频事实区/g, "视频内容部分"],
  [/重合成报告/g, "更新后的报告"],
  [/既有证据/g, "此前观察"],
  [/待核验/g, "待核对"],
  [/未返回/g, "暂无数据"],
  [/未识别到/g, "暂未发现"],
  [/数据源/g, "分析依据"],
  [/not_configured/g, "当前没有可读取的数据"],
  [/prior_report_observation(?:_with_current_resynthesis)?/g, "同一视频此前的观察"]
];

function displayLabel(input, fallback = "未命名项") {
  const raw = value(input, fallback);
  return DISPLAY_LABELS[raw] || cleanUserText(raw, fallback);
}

function cleanUserText(input, fallback = "—") {
  let text = value(input, fallback);
  for (const [pattern, replacement] of INTERNAL_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

function dateLabel(input) {
  const raw = value(input, "");
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return raw || "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function durationLabel(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "暂无数据";
  const totalSeconds = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return minutes ? `${minutes}分${String(remainingSeconds).padStart(2, "0")}秒` : `${remainingSeconds}秒`;
}

function displayProcessTitle(title) {
  return cleanUserText(title, "分析步骤")
    .replace("校验并规范化作品链接", "确认视频链接")
    .replace("读取公开作品详情", "读取视频公开信息")
    .replace("读取公开视频公开信息", "读取视频公开信息")
    .replace("解析视频内容", "梳理视频内容")
    .replace("解析视频本身", "梳理视频内容")
    .replace("选择视频代表画面", "挑选回看画面")
    .replace("补充公开评论证据", "查看观众反馈")
    .replace("形成结论与可复用打法", "整理结论和可借鉴做法");
}

function displayProcessDetail(detail) {
  return cleanUserText(detail, "未记录");
}

function commentSourceLabel(source) {
  switch (String(source || "").toLowerCase()) {
    case "public_connector":
    case "provided":
      return "已读取公开评论";
    case "not_configured":
      return "当前没有可读取的公开评论";
    case "error":
      return "公开评论暂时不可用";
    default:
      return cleanUserText(source, "暂无评论数据");
  }
}

function reportStatusNote(result = {}) {
  const notes = [];
  const videoSource = String(result.videoAnalysis?.source || result.inputs?.videoContentSource || "");
  if (videoSource.includes("prior_report_observation")) {
    notes.push("本次已更新视频公开数据和回看画面。由于视频内容复核暂未完成，视频拆解部分沿用同一视频此前已完成的观察，请先作为参考。 ");
  }
  if (result.comments?.source === "not_configured") {
    notes.push("目前没有可读取的公开评论，因此评论部分暂不下结论。");
  } else if (result.comments?.source === "error") {
    notes.push("公开评论暂时不可用，因此评论部分暂不下结论。");
  }
  return notes.join(" ").trim();
}

function reportSummary(result = {}) {
  let summary = cleanUserText(result.summary, "暂无总结");
  summary = summary
    .replace(/本次视频内容复核暂未完成，以下内容沿用同一视频此前已经完成的观察，仅供参考。/g, "")
    .replace(/视频内容复核暂未完成，本次沿用同一视频此前已经完成的观察，相关结论请先作为参考。/g, "")
    .replace(/目前没有可读取的公开评论，评论部分暂不下结论。/g, "")
    .replace(/暂未读取到公开评论，评论需求和异议仍需补充验证。?/g, "")
    .replace(/当前没有可读取的公开评论，评论需求和异议仍需补充验证。/g, "")
    .replace(/。；/g, "；")
    .replace(/；。/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/\s*；\s*；/g, "；")
    .replace(/^\s*[；。]+|[；。]+\s*$/g, "")
    .trim();
  return summary || "暂无总结";
}

function formatMetricsEvidence(text) {
  try {
    const metrics = JSON.parse(text);
    const labels = {
      views: "播放",
      likes: "点赞",
      comments: "评论",
      shares: "分享",
      favorites: "收藏"
    };
    return Object.entries(labels)
      .filter(([key]) => metrics[key] != null)
      .map(([key, label]) => `${label} ${metricValue(metrics[key])}`)
      .join("，") || "暂无数据";
  } catch {
    return cleanUserText(text, "暂无数据");
  }
}

function videoStructureItems(values) {
  return list(values).map((item) => {
    if (typeof item === "string") return item;
    const stage = value(item?.stage, "阶段");
    const range = value(item?.timeRange, "");
    const description = value(item?.description || item?.content, "未记录");
    return `${stage}${range ? `（${range}）` : ""}：${description}`;
  });
}

function videoKeyMomentItems(values) {
  return list(values).map((item) => {
    if (typeof item === "string") return item;
    const title = value(item?.title, "关键内容");
    const range = value(item?.timeRange, "时间待核");
    const reason = value(item?.reason || item?.visualEvidence || item?.evidence, "未记录内容依据");
    return `${title}（${range}）：${reason}`;
  });
}

function statusLabel(status) {
  return ["completed", "succeeded", "success", "done"].includes(String(status || "").toLowerCase())
    ? "已完成"
    : "部分完成";
}

function processStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "succeeded", "success", "done"].includes(normalized)) return "完成";
  if (["partial", "running"].includes(normalized)) return "部分完成";
  return "待核验";
}

function processItems(result) {
  return Array.isArray(result.analysisProcess) ? result.analysisProcess.filter((item) => item && (item.title || item.detail)) : [];
}

function frameItems(result) {
  const frames = result.videoFrames?.frames;
  if (!Array.isArray(frames)) return [];
  return frames.filter((frame) => /^data:image\/(?:jpeg|jpg|png);base64,/i.test(String(frame?.dataUrl || "")));
}

function frameSelectionDescription(result) {
  const frames = frameItems(result);
  const videoFrames = result.videoFrames || {};
  if (videoFrames.selectionMode === "content_aware") {
    return `已根据视频中的表达重点、内容转折和画面变化，挑选 ${frames.length} 张回看画面；相邻重复画面已合并。`;
  }
  if (videoFrames.selectionMode === "scene_aware") {
    return `已按画面场景和内容段落挑选 ${frames.length} 张回看画面。由于本次视频内容复核暂未完成，这些画面用于帮助你回看原视频，不单独代表新的内容结论。`;
  }
  return `已按视频段落挑选 ${frames.length} 张回看画面，用于辅助核对原视频，不单独代表新的内容结论。`;
}

function rangeNumbers(value) {
  return String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
}

function rangeContainsTime(item, seconds) {
  const numbers = rangeNumbers(item?.timeRange || item?.time_range || item?.timestamp || item?.time);
  return numbers.length >= 2 && seconds >= Math.min(numbers[0], numbers[1]) && seconds <= Math.max(numbers[0], numbers[1]);
}

function frameStructureItem(frame, structure) {
  const seconds = Number(frame?.timestampSeconds);
  if (!Number.isFinite(seconds) || !Array.isArray(structure)) return null;
  return structure.find((item) => rangeContainsTime(item, seconds)) || null;
}

function frameStage(frame, structure) {
  return frameStructureItem(frame, structure)?.stage || "视频画面";
}

function frameEvidence(frame, video = {}) {
  const seconds = Number(frame?.timestampSeconds);
  const keyMoment = Number.isFinite(seconds) && Array.isArray(video.keyMoments)
    ? video.keyMoments.find((item) => rangeContainsTime(item, seconds))
    : null;
  if (keyMoment) {
    return {
      title: cleanUserText(keyMoment.title, "值得注意的节点"),
      reason: cleanUserText(keyMoment.reason || keyMoment.visualEvidence || keyMoment.evidence, "这个画面帮助回看视频中的重点表达。")
    };
  }
  const segment = frameStructureItem(frame, video.structure);
  if (segment) {
    return {
      title: cleanUserText(segment.stage, "内容段落"),
      reason: cleanUserText(segment.description || segment.content, "这个画面帮助回看这一内容段落。")
    };
  }
  return {
    title: cleanUserText(frame?.contentTitle, "视频画面"),
    reason: cleanUserText(frame?.contentReason, "这个画面帮助回看原视频。")
  };
}

function evidenceItems(result = {}) {
  return list(result.evidence).map((item) => {
    const type = value(item?.type, "公开信息");
    const text = type === "work_metrics"
      ? formatMetricsEvidence(value(item?.text, ""))
      : cleanUserText(item?.text, "未记录");
    return `${displayLabel(type, "公开信息")}：${text}`;
  });
}

function htmlUserList(items, empty = "暂无真实产出") {
  return htmlList(list(items).map((item) => cleanUserText(item)), cleanUserText(empty));
}

export const VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE = Object.freeze({
  id: VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE_ID,
  name: "VIRAL TEARDOWN · 爆款拆解",
  sections: Object.freeze([
    "数据表现拆解",
    "内容结构逐帧拆解",
    "评论区洞察",
    "爆款成因总结",
    "风险与合规提示",
    "可复制方法论 SOP"
  ])
});

function teardownImageSource(input) {
  const source = String(input ?? "").trim();
  return /^(?:data:image\/(?:jpeg|jpg|png|webp);base64,|https?:\/\/)/i.test(source) ? source : "";
}

function teardownTextList(values, empty = "暂无真实产出") {
  const entries = list(values).map((item) => cleanUserText(item)).filter(Boolean);
  return entries.length ? entries : [empty];
}

function teardownTimeline(values) {
  const entries = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!entries.length) return '<p class="empty">暂未形成逐帧结构，报告不会用占位信息代替视频观察。</p>';
  const segments = entries.map((item, index) => {
    const range = cleanUserText(item?.timeRange, "");
    const title = cleanUserText(item?.stage, `阶段 ${index + 1}`);
    const detail = cleanUserText(item?.description || item?.content, "未记录");
    const tone = (index % 7) + 1;
    return `<div class="tl-seg s${tone}" style="flex:${Math.max(1, String(detail).length)}"><span class="sec">${escapeHtml(range || `${index + 1}`)}</span>${escapeHtml(title)}</div>`;
  }).join("");
  const notes = entries.map((item, index) => {
    const range = cleanUserText(item?.timeRange, `阶段 ${index + 1}`);
    const title = cleanUserText(item?.stage, `内容阶段 ${index + 1}`);
    const detail = cleanUserText(item?.description || item?.content, "未记录");
    return `<div class="tl-note"><div class="t">${escapeHtml(range)}</div><div class="line"><q>${escapeHtml(title)}</q></div><div class="fn">${escapeHtml(detail)}</div></div>`;
  }).join("");
  return `<div class="timeline"><div class="tl-track">${segments}</div><div class="tl-notes">${notes}</div></div>`;
}

function teardownQuotes(values) {
  const quotes = list(values).map((item) => cleanUserText(item)).filter(Boolean);
  if (!quotes.length) return '<p class="empty">暂未读取到代表性评论，评论区洞察需要后续补充验证。</p>';
  return `<div class="quotes">${quotes.slice(0, 6).map((quote) => `<div class="quote"><div class="qc"><q>${escapeHtml(quote)}</q><div class="ip">公开评论 · 原话</div></div></div>`).join("")}</div>`;
}

function teardownGrowthSummary(result = {}) {
  const video = result.videoAnalysis || {};
  const hypotheses = teardownTextList(video.growthHypotheses, "");
  if (hypotheses[0]) return `当前最值得验证的传播机制：${hypotheses.slice(0, 2).join("；")}。`;
  const signals = teardownTextList(video.growthSignals, "");
  if (signals[0]) return `当前可观察到的传播信号：${signals.slice(0, 2).join("；")}。`;
  return "当前还没有足够的视频事实形成稳定结论，建议先补充画面、口播和评论证据。";
}

function teardownFrameGrid(result, video) {
  const frames = frameItems(result);
  if (!frames.length) return '<p class="empty">暂未生成回看画面，报告不会用占位图代替真实证据。</p>';
  return `<div class="frame-grid">${frames.map((frame) => {
    const evidence = frameEvidence(frame, video);
    return `<figure class="frame"><img src="${escapeHtml(frame.dataUrl)}" alt="${escapeHtml(`视频 ${value(frame.timeLabel, "时间点")} 画面`)}" loading="lazy"><figcaption><strong>${escapeHtml(value(frame.timeLabel, "未标记时间"))} · ${escapeHtml(evidence.title)}</strong><span>为什么保留：${escapeHtml(evidence.reason)}</span></figcaption></figure>`;
  }).join("")}</div>`;
}

function buildViralTeardownReportHtml(result = {}) {
  const work = result.work || {};
  const video = result.videoAnalysis || {};
  const content = result.content || {};
  const audience = result.audience || {};
  const recommendations = result.recommendations || {};
  const metrics = result.metrics || work.metrics || {};
  const workTitle = cleanUserText(work.title || work.description?.slice?.(0, 80), "这条视频");
  const author = cleanUserText(work.author?.name, "未提供");
  const description = cleanUserText(work.description, "未提供视频简介");
  const duration = durationLabel(work.durationSeconds);
  const summary = reportSummary(result);
  const sourceUrl = value(result.sourceUrl || result.inputs?.workUrl, "未记录");
  const cover = teardownImageSource(work.coverUrl) || teardownImageSource(frameItems(result)[0]?.dataUrl);
  const structureSource = Array.isArray(video.structure) && video.structure.length
    ? video.structure
    : Array.isArray(content.structure) ? content.structure : [];
  const structure = structureSource.filter(Boolean).map((item) => typeof item === "string" ? { stage: item, description: item } : item);
  const topicRows = Array.isArray(audience.topics) ? audience.topics : [];
  const causes = [
    ...teardownTextList(video.growthSignals, "暂未形成传播因素观察").map((item) => ({ title: "视频里的可观察信号", detail: item })),
    ...teardownTextList(video.growthHypotheses, "暂未形成可验证的原因").map((item) => ({ title: "需要验证的传播假设", detail: item })),
    ...teardownTextList(recommendations.reusableElements, "暂未形成可借鉴做法").slice(0, 4).map((item) => ({ title: "可复用表达", detail: item }))
  ];
  const risks = teardownTextList(recommendations.cautions, "没有额外风险提示；仍需区分内容事实、公开表现和分析判断");
  const tests = teardownTextList(recommendations.nextTests, "补充视频事实和公开数据后，再设计下一轮测试");
  const reuse = teardownTextList(recommendations.reusableElements, "先确认视频中的具体场景、道具和冲突，再抽象为自己的表达");
  const totalInteractions = metrics.totalInteractions ?? [metrics.likes, metrics.comments, metrics.shares, metrics.favorites].filter((item) => Number.isFinite(Number(item))).reduce((sum, item) => sum + Number(item), 0);
  const shareLikeRatio = Number(metrics.likes) > 0 && metrics.shares != null ? (Number(metrics.shares) / Number(metrics.likes)).toFixed(2) : "暂无数据";
  const metricCards = [
    [metrics.likes, "点赞"],
    [metrics.comments, "评论"],
    [metrics.shares, "分享"],
    [metrics.favorites, "收藏"]
  ];
  const evidence = evidenceItems(result);
  const sourceLink = /^https?:\/\//i.test(sourceUrl)
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">打开原视频</a>`
    : escapeHtml(sourceUrl);
  const topicTable = topicRows.length
    ? `<div class="tbl-scroll"><table><thead><tr><th>评论主题</th><th class="num-r">数量</th><th>说明</th></tr></thead><tbody>${topicRows.map((item) => `<tr><td>${escapeHtml(cleanUserText(item.key, "未命名主题"))}</td><td class="num-r"><b>${escapeHtml(String(item.count ?? "暂无"))}</b></td><td>${escapeHtml(cleanUserText(item.detail, "从公开评论中归纳"))}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty">暂未形成稳定评论主题。</p>';
  const facts = [
    ["视频标题", workTitle],
    ["作者", author],
    ["视频编号", value(work.id, "暂无数据")],
    ["视频时长", duration],
    ["视频简介", description],
    ["发布标签", list(work.hashtags).join("、") || "暂无数据"]
  ];
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="report-template" content="${VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE.id}">
<title>${escapeHtml(workTitle)} · 抖音爆款视频拆解报告</title>
<style>
:root{--paper:#fff;--paper-2:#f8f7f4;--ink:#1b1712;--ink-2:#4a443b;--ink-3:#8a8175;--line:#e8e4dc;--rust:#a03e21;--rust-soft:#c0563b;--fill:#faf9f6}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{background:var(--paper);color:var(--ink);font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif;font-size:16px;line-height:1.9;-webkit-font-smoothing:antialiased}.serif{font-family:"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif}.wrap{max-width:1080px;margin:0 auto;padding:0 32px}.topbar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}.topbar .wrap{display:flex;align-items:center;justify-content:space-between;height:56px}.brand{font-size:13px;letter-spacing:.18em;color:var(--ink-2);font-weight:600}.brand em{color:var(--rust);font-style:normal}.nav{display:flex;gap:26px;font-size:13px;color:var(--ink-3)}.nav a{color:inherit;text-decoration:none;letter-spacing:.08em}.nav a:hover{color:var(--rust)}.hero{padding:72px 0 56px;border-bottom:1px solid var(--line)}.hero-band{display:flex;gap:clamp(24px,4vw,44px);align-items:stretch;margin-bottom:38px}.hero .cover{flex:none;width:clamp(150px,26vw,260px);display:flex;align-items:center;justify-content:center;min-height:180px;border:1px solid var(--ink);box-shadow:6px 6px 0 var(--paper-2);object-fit:cover;background:var(--paper-2)}.cover-placeholder{padding:20px;text-align:center;color:var(--ink-3);font-size:13px}.hero-band .ht{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between}.hero-lower{border-top:1px solid var(--line);padding-top:26px}.kicker{display:flex;align-items:center;gap:14px;font-size:13px;letter-spacing:.32em;color:var(--rust);font-weight:600}.kicker:before{content:"";width:44px;height:1px;background:var(--rust)}.hero h1{font-size:clamp(36px,5.6vw,64px);line-height:1.22;font-weight:900;letter-spacing:.02em;margin:10px 0}.hero h1 .q{color:var(--rust)}.tline .lab{display:block;font-size:12px;letter-spacing:.22em;color:var(--rust);font-weight:600;margin-bottom:8px}.tline .lab:before{content:"";display:inline-block;width:20px;height:1px;background:var(--rust);vertical-align:middle;margin-right:10px}.tline .name{font-family:"Noto Serif SC","Songti SC",serif;font-size:clamp(19px,2.4vw,26px);font-weight:900}.hero .sub{font-size:clamp(15px,1.8vw,17.5px);color:var(--ink-2);max-width:760px;margin:0 0 26px}.hero .sub strong{color:var(--rust)}.hero .note{font-size:12.5px;color:var(--ink-3);letter-spacing:.08em;line-height:1.9}section{padding:88px 0;border-bottom:1px solid var(--line)}.sec-head{display:flex;align-items:baseline;gap:22px;margin-bottom:44px}.sec-no{font-size:14px;color:var(--rust);font-weight:700;letter-spacing:.2em;white-space:nowrap;border:1px solid var(--rust);padding:4px 12px}.sec-head h2{font-size:clamp(26px,3.4vw,38px);font-weight:900;letter-spacing:.03em}.sec-head .en{margin-left:auto;font-size:12px;letter-spacing:.28em;color:var(--ink-3)}p.body{max-width:760px;color:var(--ink-2);margin-bottom:20px}.lead{font-size:18px;color:var(--ink)}.stats{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);background:var(--fill)}.stat{padding:34px 28px 30px;border-right:1px solid var(--line)}.stat:last-child{border-right:none}.stat .num{font-size:clamp(28px,3.4vw,44px);font-weight:900;line-height:1.1}.stat.hot .num{color:var(--rust)}.stat .lab{font-size:13px;color:var(--ink-3);margin-top:10px;letter-spacing:.1em}.stat .lab b{color:var(--ink-2)}.hero-facts{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);background:var(--fill);margin-top:30px}.hero-fact{padding:14px 16px;border-right:1px solid var(--line)}.hero-fact:last-child{border-right:0}.hero-fact span{display:block;color:var(--ink-3);font-size:11px}.hero-fact strong{display:block;margin-top:3px;overflow-wrap:anywhere;font-size:14px}.source-row{display:flex;align-items:center;flex-wrap:wrap;gap:10px;color:var(--ink-3);font-size:12px}.source-row a{padding:6px 10px;border:1px solid var(--rust);color:var(--rust);text-decoration:none}.source-row a:hover{background:#fdf2ed}.fact-grid{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid var(--line)}.fact{padding:14px 0;border-bottom:1px solid var(--line)}.fact span{display:block;color:var(--ink-3);font-size:12px}.fact p{margin:2px 0 0;overflow-wrap:anywhere}.insight{margin:26px 0 0;padding:16px 18px;background:#fbf1ec;border-left:3px solid var(--rust);color:var(--ink-2)}.tbl-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:36px 0 12px;font-size:14px;background:var(--fill);border:1px solid var(--line)}th,td{padding:14px 18px;text-align:left;border-bottom:1px solid var(--line);border-right:1px solid var(--line);vertical-align:top}th:last-child,td:last-child{border-right:0}tr:last-child td{border-bottom:0}th{font-size:12px;letter-spacing:.12em;color:var(--ink-3);font-weight:600;background:var(--paper-2)}td b{color:var(--rust)}.num-r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.timeline{margin:56px 0 20px}.tl-track{display:flex;min-height:64px;border:1px solid var(--ink);background:var(--fill)}.tl-seg{position:relative;border-right:1px solid var(--paper);display:flex;align-items:flex-end;min-width:82px;padding:8px 10px;font-size:11px;color:var(--ink-3);line-height:1.4}.tl-seg:last-child{border-right:0}.tl-seg .sec{position:absolute;top:8px;left:10px;font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums}.tl-seg.s1,.tl-seg.s4,.tl-seg.s7{background:#eceadf}.tl-seg.s2{background:#ddd8c6}.tl-seg.s3{background:var(--rust-soft);color:#fff}.tl-seg.s3 .sec,.tl-seg.s5 .sec,.tl-seg.s6 .sec{color:#fff}.tl-seg.s5{background:var(--rust);color:#fff}.tl-seg.s6{background:#7c2f18;color:#fff}.tl-notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));border:1px solid var(--line);border-top:0}.tl-note{padding:18px 20px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:13px;color:var(--ink-2)}.tl-note .t{font-size:12px;color:var(--rust);letter-spacing:.12em;font-weight:700}.tl-note q{font-family:"Noto Serif SC","Songti SC",serif;color:var(--ink);font-weight:700;font-size:14.5px}.tl-note .fn{margin-top:8px;font-size:12.5px;color:var(--ink-3);line-height:1.7}.points{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:44px}.point{background:var(--fill);padding:17px 22px}.point .no{font-family:Georgia,serif;font-size:20px;color:var(--rust);font-weight:700}.point h4{font-size:15.5px;font-weight:700}.point p{margin-top:6px;font-size:13.5px;color:var(--ink-2);line-height:1.75}.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:40px}.quote{background:var(--fill);border:1px solid var(--line);padding:20px 22px}.quote q{display:block;font-size:14px;color:var(--ink);line-height:1.75;font-weight:600}.quote .ip{margin-top:8px;font-size:12px;color:var(--ink-3);letter-spacing:.1em}.causes{margin-top:8px;border-top:1px solid var(--ink)}.cause{display:grid;grid-template-columns:44px 200px 1fr;column-gap:20px;align-items:baseline;padding:15px 4px;border-bottom:1px solid var(--line)}.cause .cno{font-family:Georgia,serif;font-size:17px;color:var(--rust);font-weight:700}.cause h4{font-size:15px}.cause p{font-size:13.5px;color:var(--ink-2);line-height:1.75}.risks{display:grid;gap:0;border:1px solid var(--rust);margin-top:36px}.risk{display:flex;gap:20px;align-items:center;padding:18px 24px;background:#fdf6f1;border-bottom:1px solid #e8c9bb}.risk:last-child{border-bottom:0}.risk .tag{flex:none;width:92px;text-align:center;font-size:11px;letter-spacing:.14em;color:#fff;background:var(--rust);padding:6px 0;font-weight:600}.risk p{font-size:13.5px;color:var(--ink-2);line-height:1.75}.formula{background:var(--ink);color:var(--paper);padding:44px 40px;margin:44px 0;font-size:clamp(17px,2.4vw,23px);line-height:2;font-weight:700}.formula .x{color:var(--rust-soft);font-family:Georgia,serif;margin:0 10px;font-weight:400}.formula small{display:block;font-size:12px;font-weight:400;color:#9a917f;letter-spacing:.2em;margin-top:18px}.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-top:36px}.step{border:1px solid var(--line);background:var(--fill);padding:26px 24px}.step .t{font-size:12px;color:var(--rust);letter-spacing:.16em;font-weight:700}.step h4{font-size:16px;font-weight:800;margin:10px 0 8px;font-family:"Noto Serif SC","Songti SC",serif}.step p{font-size:13px;color:var(--ink-2)}.frame-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.frame{margin:0;border:1px solid var(--line);background:#ebe9e4}.frame img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#d9dddc}.frame figcaption{padding:11px 12px 13px;color:var(--ink-3);font-size:12px}.frame figcaption strong{display:block;color:var(--ink);font-size:13px}.frame figcaption span{display:block;margin-top:5px;line-height:1.55}.boundary{color:#566267}.boundary ul{padding-left:21px}.evidence-list{font-size:13px;color:#58646a}.evidence-list li{overflow-wrap:anywhere}.empty{margin:16px 0;color:var(--ink-3)}footer{padding:64px 0 88px}footer .src{font-size:13px;color:var(--ink-3);max-width:760px;line-height:2.1}footer .src b{color:var(--ink-2)}footer .end{margin-top:48px;padding-top:28px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:12px;letter-spacing:.12em;color:var(--ink-3)}@media(max-width:760px){.wrap{padding:0 18px}.nav{display:none}.hero{padding-top:42px}.hero-band{gap:18px}.hero .cover{width:132px;min-height:150px;box-shadow:4px 4px 0 var(--paper-2)}.stats,.hero-facts{grid-template-columns:repeat(2,1fr)}.stat:nth-child(2n),.hero-fact:nth-child(2n){border-right:0}.two-col,.fact-grid{grid-template-columns:1fr}.tl-note{border-right:0}.cause{grid-template-columns:44px 1fr;row-gap:2px}.cause p{grid-column:2}.frame-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:500px){.hero-band{display:block}.hero .cover{width:100%;height:220px;margin-bottom:22px}.hero h1{font-size:34px}.stats{grid-template-columns:repeat(2,1fr)}.frame-grid{grid-template-columns:1fr}.section-heading,.sec-head{align-items:flex-start;flex-direction:column;gap:8px}.fact-grid{grid-template-columns:1fr}.cause{grid-template-columns:36px 1fr}.cause h4{grid-column:2}.cause p{grid-column:2}.risk{align-items:flex-start;flex-direction:column;gap:10px}.formula{padding:28px 22px}.footer .end{display:block}}
</style>
</head>
<body><div class="topbar"><div class="wrap"><div class="brand">VIRAL <em>TEARDOWN</em> · 爆款拆解</div><nav class="nav"><a href="#sec1">数据</a><a href="#sec2">结构</a><a href="#sec3">评论</a><a href="#sec4">成因</a><a href="#sec5">风险</a><a href="#sec6">方法论</a></nav></div></div>
<header class="hero"><div class="wrap"><div class="hero-band">${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="${escapeHtml(workTitle)} 视频画面">` : '<div class="cover cover-placeholder">视频画面待补充</div>'}<div class="ht"><div><div class="kicker">抖音爆款视频拆解 · 爆款视频分析报告</div><h1>${escapeHtml(duration)}，<br><span class="q">${escapeHtml(metricValue(metrics.shares))} 分享。</span></h1><div class="tline"><span class="lab">拆解对象</span><span class="name">《${escapeHtml(workTitle.replace(/^《|》$/g, ""))}》</span></div></div></div><div class="hero-lower"><p class="sub">${escapeHtml(author)} 的这条作品${description !== "未提供视频简介" ? `：${escapeHtml(description)}` : "已进入内容、数据和评论的完整拆解。"}</p><div class="note">${escapeHtml(`统计时间：${dateLabel(result.generatedAt)} · 作者：${author} · 视频时长：${duration} · 报告模板：${VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE.id}`)}</div></div></div></div><div class="hero-facts"><div class="hero-fact"><span>作者</span><strong>${escapeHtml(author)}</strong></div><div class="hero-fact"><span>视频时长</span><strong>${escapeHtml(duration)}</strong></div><div class="hero-fact"><span>总互动</span><strong>${escapeHtml(metricValue(totalInteractions))}</strong></div><div class="hero-fact"><span>分析状态</span><strong>${escapeHtml(statusLabel(result.status))}</strong></div></div><div class="source-row"><span>原视频：</span>${sourceLink}<span>更新于 ${escapeHtml(dateLabel(result.generatedAt))}</span></div></div></header>
<main><section id="sec1"><div class="wrap"><div class="sec-head"><span class="sec-no">01</span><h2>数据表现拆解</h2><span class="en">DATA BREAKDOWN</span></div><p class="body lead">${escapeHtml(summary)}</p><div class="stats">${metricCards.map(([metric, label], index) => `<div class="stat${index === 2 ? " hot" : ""}"><div class="num serif">${escapeHtml(metricValue(metric))}</div><div class="lab">${escapeHtml(label)}${metric != null ? " · 公开数据" : " · 待核对"}</div></div>`).join("")}</div><div class="insight">总互动 <b>${escapeHtml(metricValue(totalInteractions))}</b> 次，分享/点赞比 <b>${escapeHtml(shareLikeRatio)}</b>。互动数据用于说明传播表现，不直接等同于成交或转化。</div><div class="fact-grid">${facts.map(([label, text]) => `<div class="fact"><span>${escapeHtml(label)}</span><p>${escapeHtml(text)}</p></div>`).join("")}</div></div></section>
<section id="sec2"><div class="wrap"><div class="sec-head"><span class="sec-no">02</span><h2>内容结构逐帧拆解</h2><span class="en">CONTENT STRUCTURE</span></div><p class="body">${escapeHtml(cleanUserText(video.overview, "视频内容暂未完成复核，当前不把视频简介当作内容结论。"))}</p>${teardownTimeline(structure)}<h3>内容怎么组织 · 视频内容拆解</h3><div class="points">${[
    ["开头抓手", video.hook || content.hook],
    ["画面主体", video.subject],
    ["主要口播", video.spokenContent],
    ["声音与表达", [video.audio?.speechSummary, video.audio?.speechStyle].filter(Boolean).join("；")],
    ["字幕与文字", [video.subtitles?.summary, ...(Array.isArray(video.subtitles?.keyPhrases) ? video.subtitles.keyPhrases : [])].filter(Boolean).join("；")],
    ["剪辑与节奏", [video.pacing, ...(Array.isArray(video.editing) ? video.editing : video.editing ? [video.editing] : [])].filter(Boolean).join("；")]
  ].filter(([, detail]) => detail).map(([label, detail], index) => `<div class="point"><div class="top"><span class="no">${String(index + 1).padStart(2, "0")}</span><h4>${escapeHtml(label)}</h4></div><p>${escapeHtml(cleanUserText(detail))}</p></div>`).join("") || '<div class="point"><p>视频内容暂未完成复核。</p></div>'}</div><h3>关键画面回看 · 挑选回看画面</h3><p class="body">${escapeHtml(frameSelectionDescription(result))}</p>${teardownFrameGrid(result, video)}</div></section>
<section id="sec3"><div class="wrap"><div class="sec-head"><span class="sec-no">03</span><h2>评论区洞察</h2><span class="en">AUDIENCE SIGNALS</span></div><p class="body lead">大家在关注什么：评论区是验证内容共鸣、疑问和阻力的第二现场。</p><div class="hero-facts"><div class="hero-fact"><span>公开评论</span><strong>${escapeHtml(String(audience.collected ?? result.comments?.collected ?? 0))} 条</strong></div><div class="hero-fact"><span>评论状态</span><strong>${escapeHtml(commentSourceLabel(result.comments?.source))}</strong></div><div class="hero-fact"><span>评论主题</span><strong>${escapeHtml(String(topicRows.length))} 类</strong></div><div class="hero-fact"><span>代表性原话</span><strong>${escapeHtml(String(list(audience.representativeComments).length))} 条</strong></div></div>${topicTable}<h3>观众需求与疑虑</h3><div class="points">${teardownTextList([...(Array.isArray(audience.needs) ? audience.needs : []), ...(Array.isArray(audience.questions) ? audience.questions : []), ...(Array.isArray(audience.objections) ? audience.objections : [])], "暂未读取到明确需求或疑虑").slice(0, 6).map((item, index) => `<div class="point"><div class="top"><span class="no">${String(index + 1).padStart(2, "0")}</span><h4>评论信号</h4></div><p>${escapeHtml(item)}</p></div>`).join("")}</div><h3>代表性评论</h3>${teardownQuotes(audience.representativeComments)}</div></section>
<section id="sec4"><div class="wrap"><div class="sec-head"><span class="sec-no">04</span><h2>爆款成因总结</h2><span class="en">WHY IT SPREAD</span></div><p class="body lead">这次怎么得出结论：把视频事实、公开表现和观众反馈合在一起，形成可以继续验证的判断。</p><div class="causes">${causes.slice(0, 8).map((item, index) => `<div class="cause"><div class="cno">${String(index + 1).padStart(2, "0")}</div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(cleanUserText(item.detail))}</p></div>`).join("")}</div><div class="insight">${escapeHtml(teardownGrowthSummary(result))}</div></div></section>
<section id="sec5"><div class="wrap"><div class="sec-head"><span class="sec-no">05</span><h2>风险与合规提示</h2><span class="en">BOUNDARIES</span></div><p class="body">哪些是事实，哪些是判断：报告只把可回看的内容、公开数据和评论作为依据，未返回的数据不会估算。</p><div class="risks">${risks.map((item, index) => `<div class="risk"><span class="tag">${index === 0 ? "先看边界" : "风险提示"}</span><p>${escapeHtml(item)}</p></div>`).join("")}</div><ul class="body" style="margin-top:28px"><li>视频内容结论来自原视频观察；公开数据和评论只做补充。</li><li>传播假设需要下一轮内容测试验证，不等于已经证明带来转化或成交。</li><li>报告提炼结构和需求，不直接复制原作品素材或表达。</li></ul></div></section>
<section id="sec6"><div class="wrap"><div class="sec-head"><span class="sec-no">06</span><h2>可复制方法论 SOP</h2><span class="en">REUSABLE PLAYBOOK</span></div><p class="body lead">把这条作品的有效元素拆成变量，每次只改变一个变量，再用发布后的数据检验。</p><div class="formula">${escapeHtml(reuse.slice(0, 3).join(" × ") || "熟悉场景 × 具体冲突 × 可接续话题")}<small>不是复制原作，而是复用结构、需求和验证方法</small></div><div class="steps">${tests.slice(0, 6).map((item, index) => `<div class="step"><div class="t">STEP ${String(index + 1).padStart(2, "0")}</div><h4>下一轮测试</h4><p>${escapeHtml(item)}</p></div>`).join("")}</div><h3>可以借鉴什么</h3><div class="points">${reuse.slice(0, 6).map((item, index) => `<div class="point"><div class="top"><span class="no">${String(index + 1).padStart(2, "0")}</span><h4>可复用元素</h4></div><p>${escapeHtml(item)}</p></div>`).join("")}</div></div></section></main>
<footer><div class="wrap"><p class="src"><b>本次引用的依据</b><br>${evidence.length ? evidence.map((item) => escapeHtml(item)).join("<br>") : "暂未形成可回查依据。"}</p><div class="end"><span>VIRAL TEARDOWN · 爆款拆解 · ${VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE.id}</span><span>《${escapeHtml(workTitle.replace(/^《|》$/g, ""))}》 · ${escapeHtml(author)}</span></div></div></footer></body></html>`;
}

export function buildViralWorkAnalysisReportHtml(result = {}) {
  return buildViralTeardownReportHtml(result);
}

export function buildViralWorkAnalysisReportMarkdown(result = {}) {
  const work = result.work || {};
  const content = result.content || {};
  const audience = result.audience || {};
  const recommendations = result.recommendations || {};
  const video = result.videoAnalysis || {};
  const purpose = value(result.purpose, VIRAL_WORK_ANALYSIS_PURPOSE);
  const targetAudience = value(result.targetAudience, VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE);
  const lines = [
    "# 抖音爆款视频拆解报告",
    "",
    `> 原视频：${value(result.sourceUrl || result.inputs?.workUrl)}`,
    `> 要回答的问题：${cleanUserText(value(result.goal || result.inputs?.goal, VIRAL_WORK_ANALYSIS_DEFAULT_GOAL))}`,
    `> 当前进度：${statusLabel(result.status)}`,
    "",
    "## 一句话结论",
    reportSummary(result),
    "",
    "## 这份报告要帮你做什么",
    `- 适合谁：${targetAudience}`,
    `- 要回答的问题：${purpose}`,
    "- 重点：这条视频有哪些可能带来传播的因素，哪些做法值得借鉴，下一条内容如何设计并验证。",
    "",
    "## 这次怎么得出结论",
    "### 我们看了哪些信息",
    ...htmlSafeMarkdownList("证据层", result.analysisLogic?.evidenceLayers?.map((item) => `${item.name}：${item.detail}`)),
    "### 这次完成了什么",
    ...processItems(result).map((item, index) => `${index + 1}. ${displayProcessTitle(item.title)} · ${processStatusLabel(item.status)}：${displayProcessDetail(item.detail)}`),
    "### 判断边界",
    ...htmlSafeMarkdownList("判断边界", result.analysisLogic?.rules),
    "",
    "## 视频数据",
    `- 作者：${cleanUserText(value(work.author?.name, "未提供"))}`,
    `- 视频简介：${cleanUserText(value(work.description, "未提供视频简介"))}`,
    `- 发布标签：${list(work.hashtags).join("、") || "暂无数据"}`,
    `- 播放量：${metricValue(result.metrics?.views ?? work.metrics?.views)}`,
    `- 互动率：${result.metrics?.interactionRate == null ? "暂无数据" : `${result.metrics.interactionRate}%`}`,
    "",
    "## 视频内容拆解",
    ...(video.status === "completed"
      ? [
        `- 这条视频讲了什么：${cleanUserText(value(video.overview, "暂无内容总结"))}`,
        `- 画面里有什么：${cleanUserText(value(video.subject, "暂无画面总结"))}`,
        `- 主要口播：${cleanUserText(value(video.spokenContent, "暂无口播总结"))}`,
        `- 开头抓手：${cleanUserText(value(video.hook, "暂未发现明显开头抓手"))}`,
        `- 声音与表达：${cleanUserText([video.audio?.speechSummary, video.audio?.speechStyle].filter(Boolean).join("；"), "暂无声音信息")}`,
        `- 字幕与画面文字：${cleanUserText([video.subtitles?.summary, ...(video.subtitles?.keyPhrases || []).map((item) => `关键词：${item}`)].filter(Boolean).join("；"), "暂无字幕信息")}`,
        `- 节奏：${cleanUserText(value(video.pacing, "暂无节奏总结"))}`,
        ...htmlSafeMarkdownList("内容怎么推进", videoStructureItems(video.structure)),
        ...htmlSafeMarkdownList("值得注意的节点", videoKeyMomentItems(video.keyMoments)),
        ...htmlSafeMarkdownList("视觉表达", video.visual),
        ...htmlSafeMarkdownList("剪辑与呈现", video.editing),
        ...htmlSafeMarkdownList("做得好的地方", video.strengths),
        ...htmlSafeMarkdownList("还可以改进的地方", video.weaknesses),
        ...htmlSafeMarkdownList("可能带来传播的因素", video.growthSignals),
        ...htmlSafeMarkdownList("值得验证的原因", video.growthHypotheses)
      ]
      : [`- ${cleanUserText(value(video.message, "视频内容暂未完成复核，当前报告不把视频简介当作内容结论。"))}`]),
    "",
    "## 关键画面回看",
    ...(frameItems(result).length
      ? [`${frameSelectionDescription(result)}`, ...frameItems(result).map((frame) => { const evidence = frameEvidence(frame, video); return `- ${value(frame.timeLabel, "未标记时间")} · ${evidence.title}：为什么保留：${evidence.reason}。报告中已附回看画面。`; })]
      : ["- 暂未生成回看画面，报告不会用占位图代替真实证据。"]),
    "",
    "## 内容怎么组织",
    `- 开头抓手：${cleanUserText(value(content.hook, "暂未发现明显开头抓手"))}`,
    ...htmlSafeMarkdownList("内容结构", content.structure),
    ...htmlSafeMarkdownList("结尾有没有引导", [content.cta]),
    "",
    "## 大家在关注什么",
    `- 已读取评论：${audience.collected ?? result.comments?.collected ?? 0} 条`,
    `- 评论数据状态：${commentSourceLabel(result.comments?.source)}`,
    ...htmlSafeMarkdownList("评论主题", audience.topics?.map((item) => `${item.key} · ${item.count} 条`)),
    ...htmlSafeMarkdownList("观众可能需要什么", audience.needs),
    ...htmlSafeMarkdownList("观众可能卡在哪里", audience.questions),
    ...htmlSafeMarkdownList("评论原话", audience.representativeComments),
    "",
    "## 可以借鉴什么",
    ...htmlSafeMarkdownList("值得借鉴的做法", recommendations.reusableElements),
    ...htmlSafeMarkdownList("下一条可以怎么试", recommendations.nextTests),
    ...htmlSafeMarkdownList("先记住这几点", recommendations.cautions),
    "",
    "## 哪些是事实，哪些是判断",
    "- 事实来自原视频、公开视频信息和可见评论，没有返回的数据不会估算。",
    "- 判断是可验证的内容假设，不代表已经证明带来转化或成交。",
    "- 不直接复制原作品素材或表达。"
  ];
  return lines.join("\n");
}

function htmlSafeMarkdownList(label, items) {
  const values = list(items);
  return [
    `### ${cleanUserText(label)}`,
    ...(values.length ? values.map((item) => `- ${cleanUserText(item)}`) : [`- ${cleanUserText(label)}：暂无真实产出`])
  ];
}

export function viralWorkAnalysisReportFile(result = {}, { createdBy = "抖音爆款拆解官" } = {}) {
  const taskId = value(result.taskId, `analysis-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const workTitle = cleanUserText(result.work?.title || result.work?.description?.slice?.(0, 80), "直接输入抖音作品链接");
  return {
    name: `抖音爆款视频拆解报告-${taskId}.html`,
    type: "html",
    content: buildViralWorkAnalysisReportHtml(result),
    projectId: "content-research",
    projectName: "内容研究",
    taskId: result.taskId || null,
    taskRunId: result.taskRunId || null,
    agentId: "mkt-viral-work-analysis",
    createdBy,
    sourceTaskTitle: workTitle,
    sourceResultId: null,
    summary: reportSummary(result),
    metadata: {
      analysisKind: "viral_work",
      reportTemplate: VIRAL_WORK_ANALYSIS_REPORT_TEMPLATE.id,
      sourceUrl: result.sourceUrl || result.inputs?.workUrl || "",
      videoFrameCount: frameItems(result).length
    }
  };
}

export function viralWorkAnalysisReportConversationMessage(file = {}) {
  return {
    text: "抖音爆款视频拆解报告已完成，已发送到这里，并同步保存到文件中心。",
    artifact: {
      id: file.id || null,
      name: file.name || "抖音爆款视频拆解报告.html",
      type: file.type || "html",
      projectName: file.projectName || "内容研究",
      summary: file.summary || "点击查看 HTML 分析报告",
      status: "已完成"
    }
  };
}
