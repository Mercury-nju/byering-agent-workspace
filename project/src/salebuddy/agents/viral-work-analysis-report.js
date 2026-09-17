import {
  VIRAL_WORK_ANALYSIS_DEFAULT_GOAL,
  VIRAL_WORK_ANALYSIS_PURPOSE,
  VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE
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

export function buildViralWorkAnalysisReportHtml(result = {}) {
  const work = result.work || {};
  const video = result.videoAnalysis || {};
  const metrics = result.metrics || work.metrics || {};
  const content = result.content || {};
  const audience = result.audience || {};
  const recommendations = result.recommendations || {};
  const purpose = value(result.purpose, VIRAL_WORK_ANALYSIS_PURPOSE);
  const targetAudience = value(result.targetAudience, VIRAL_WORK_ANALYSIS_TARGET_AUDIENCE);
  const sourceUrl = value(result.sourceUrl || result.inputs?.workUrl, "未记录");
  const author = cleanUserText(work.author?.name, "未提供");
  const description = cleanUserText(work.description, "未提供视频简介");
  const workTitle = cleanUserText(work.title || description.slice(0, 80), "这条视频");
  const summary = reportSummary(result);
  const status = statusLabel(result.status);
  const statusClass = status === "已完成" ? "is-complete" : "is-partial";
  const statusNote = reportStatusNote(result);
  const frameCount = frameItems(result).length;
  const sourceLink = /^https?:\/\//i.test(sourceUrl)
    ? `<a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">打开原视频</a><span class="source-url">${escapeHtml(sourceUrl)}</span>`
    : escapeHtml(sourceUrl);
  const metricsRows = [
    ["播放量", metricValue(metrics.views)],
    ["点赞", metricValue(metrics.likes)],
    ["评论", metricValue(metrics.comments)],
    ["分享", metricValue(metrics.shares)],
    ["收藏", metricValue(metrics.favorites)],
    ["互动率", metrics.interactionRate == null ? "暂无数据" : `${metrics.interactionRate}%`]
  ];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(workTitle)} · 爆款视频分析报告</title>
  <style>
    :root{--paper:#f4f1eb;--ink:#20282d;--muted:#6d777b;--line:#d9d6ce;--blue:#52718d;--blue-soft:#e8eef1;--ochre:#c68b45;--risk:#9a5f4e}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;background:#dfe3e4;color:var(--ink);font:15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
    main{max-width:1080px;min-height:100vh;margin:0 auto;background:var(--paper);box-shadow:0 0 0 1px rgba(32,40,45,.05)}
    .cover{position:relative;overflow:hidden;padding:48px clamp(24px,6vw,72px) 34px;background:#20282d;color:#f5f1e9;border-bottom:5px solid var(--ochre)}
    .cover:after{content:"";position:absolute;right:7%;top:0;width:1px;height:155px;background:rgba(198,139,69,.75)}
    .cover-top{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:34px}
    .eyebrow,.section-kicker,.summary-label,.label{margin:0;color:#9da9aa;font-size:11px;letter-spacing:.08em}
    .eyebrow{color:#cbd1cd;text-transform:uppercase}
    .status-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border:1px solid rgba(255,255,255,.22);border-radius:999px;font-size:12px;white-space:nowrap}
    .status-badge:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ochre)}
    .status-badge.is-complete:before{background:#80b499}
    h1{max-width:720px;margin:0;font-size:clamp(32px,5vw,52px);font-weight:720;letter-spacing:0;line-height:1.13}
    .cover-subtitle{margin:12px 0 0;color:#d8ddd7;font-size:20px;line-height:1.45}
    .summary-block{max-width:800px;margin:34px 0 30px;padding-left:18px;border-left:3px solid var(--ochre)}
    .summary-label{color:#d6a66c}
    .summary{margin:6px 0 0;font-size:18px;line-height:1.75;color:#fff}
    .hero-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin:0 0 26px;background:rgba(255,255,255,.15)}
    .hero-fact{min-width:0;padding:14px 16px;background:rgba(32,40,45,.9)}
    .hero-fact span{display:block;color:#9da9aa;font-size:11px}
    .hero-fact strong{display:block;margin-top:3px;overflow-wrap:anywhere;font-size:15px;font-weight:600;color:#f8f5ef}
    .source-row{display:flex;align-items:center;flex-wrap:wrap;gap:10px;color:#abb5b4;font-size:12px;overflow-wrap:anywhere}
    .source-link{padding:7px 12px;border:1px solid rgba(255,255,255,.34);border-radius:6px;color:#fff;text-decoration:none}
    .source-link:hover{border-color:#e3b778;background:rgba(198,139,69,.16)}
    .source-url{max-width:100%;word-break:break-all}
    .notice{margin-top:24px;padding:13px 15px;border-left:3px solid #d29c57;background:rgba(198,139,69,.13);color:#f0dfc8;font-size:13px;line-height:1.65}
    .report-nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;padding-top:18px;border-top:1px solid rgba(255,255,255,.15)}
    .nav-link{color:#cbd1cd;text-decoration:none;font-size:12px}
    .nav-link:after{content:" /";padding-left:8px;color:#697777}
    .nav-link:last-child:after{content:""}
    .section{padding:42px clamp(24px,6vw,72px);border-top:1px solid var(--line)}
    .section-heading{display:flex;align-items:flex-start;gap:16px;margin-bottom:22px}
    .section-number{flex:none;color:var(--ochre);font:600 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;padding-top:5px}
    .section-kicker{color:var(--blue);letter-spacing:.04em}
    h2{margin:3px 0 0;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:0}
    h3{margin:30px 0 8px;font-size:16px;line-height:1.35;font-weight:700}
    .section-lead{max-width:760px;margin:-7px 0 22px;color:var(--muted)}
    .two-col{display:grid;grid-template-columns:1fr 1.55fr;gap:28px}
    .label{color:var(--muted);letter-spacing:0}
    .intent-value{margin:5px 0 0;font-size:16px;line-height:1.65}
    .insight{margin:26px 0 0;padding:16px 18px;background:var(--blue-soft);border-left:3px solid var(--blue);color:#344954}
    .logic-list{display:grid;gap:9px;margin:0;padding:0;list-style:none}
    .logic-list li{padding:12px 14px;border-left:3px solid var(--blue);background:#ecefeb}
    .logic-list strong{display:block;margin-bottom:2px}
    .process{display:grid;gap:9px;margin:0;padding:0;list-style:none;counter-reset:process}
    .process li{display:grid;grid-template-columns:30px 1fr;gap:12px;padding:12px 14px;border:1px solid var(--line);background:rgba(255,255,255,.38);counter-increment:process}
    .process li:before{content:counter(process);width:25px;height:25px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--ink);color:#f5f1e9;font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
    .process strong{display:block;font-size:14px}
    .process small{display:block;margin-top:2px;color:var(--muted);font-size:12px;line-height:1.6}
    .fact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 30px;border-top:1px solid var(--line)}
    .fact{padding:12px 0;border-bottom:1px solid var(--line)}
    .fact span{display:block;color:var(--muted);font-size:12px}
    .fact p{margin:3px 0 0;overflow-wrap:anywhere}
    .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:24px;background:var(--line)}
    .metric{min-width:0;padding:16px;background:#e9edef}
    .metric strong{display:block;font-size:23px;line-height:1.2;font-weight:700;color:var(--ink);overflow-wrap:anywhere}
    .metric span{display:block;margin-top:5px;color:var(--muted);font-size:12px}
    .detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 30px}
    .detail{padding-top:12px;border-top:2px solid var(--ink)}
    .detail-label{display:block;color:var(--blue);font-size:12px;font-weight:700}
    .detail p{margin:5px 0 0;overflow-wrap:anywhere}
    ul{margin:8px 0;padding-left:21px}li+li{margin-top:5px}
    .empty{margin:8px 0;color:var(--muted)}
    .quote{margin:10px 0;padding:12px 15px;border-left:3px solid var(--ochre);background:#ede9e1;line-height:1.65}
    .quote+.quote{margin-top:8px}
    .frame-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
    .frame{margin:0;border:1px solid var(--line);background:#ebe9e4}
    .frame img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#d9dddc}
    .frame figcaption{padding:11px 12px 13px;color:var(--muted);font-size:12px}
    .frame figcaption strong{display:block;color:var(--ink);font-size:13px;line-height:1.45}
    .frame figcaption span{display:block;margin-top:5px;line-height:1.55}
    .stat-row{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-top:1px solid var(--line)}
    .stat-row:last-child{border-bottom:1px solid var(--line)}
    .stat-row span{color:var(--muted);font-size:12px}
    .stat-row strong{font-size:13px;text-align:right}
    .boundary{color:#566267}
    .boundary ul{padding-left:21px}
    .evidence-list{font-size:13px;color:#58646a}
    .evidence-list li{overflow-wrap:anywhere}
    @media(max-width:760px){
      .cover{padding-top:34px}
      .cover-top{align-items:flex-start;flex-direction:column;margin-bottom:28px}
      .hero-facts{grid-template-columns:repeat(2,minmax(0,1fr))}
      .two-col,.detail-grid{grid-template-columns:1fr;gap:18px}
      .fact-grid{grid-template-columns:1fr}
      .frame-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:500px){
      body{background:var(--paper)}
      .cover,.section{padding-left:18px;padding-right:18px}
      h1{font-size:34px}
      .cover-subtitle{font-size:17px}
      .summary{font-size:16px}
      .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .metric strong{font-size:19px}
      .frame-grid{grid-template-columns:1fr}
      .source-url{font-size:11px}
    }
  </style>
</head>
<body><main>
  <section class="cover" id="top">
    <div class="cover-top"><p class="eyebrow">内容研究 / 爆款视频拆解</p><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></div>
    <h1>爆款视频分析报告</h1>
    <p class="cover-subtitle">${escapeHtml(workTitle)}</p>
    <div class="summary-block"><p class="summary-label">一句话结论</p><p class="summary">${escapeHtml(summary)}</p></div>
    <div class="hero-facts">
      <div class="hero-fact"><span>作者</span><strong>${escapeHtml(author)}</strong></div>
      <div class="hero-fact"><span>视频时长</span><strong>${escapeHtml(durationLabel(work.durationSeconds))}</strong></div>
      <div class="hero-fact"><span>公开互动</span><strong>${escapeHtml(metricValue(metrics.likes))} 赞 / ${escapeHtml(metricValue(metrics.comments))} 评</strong></div>
      <div class="hero-fact"><span>回看画面</span><strong>${escapeHtml(frameCount ? `${frameCount} 张` : "暂未生成")}</strong></div>
    </div>
    <div class="source-row"><span>原视频</span>${sourceLink}<span>更新于 ${escapeHtml(dateLabel(result.generatedAt))}</span></div>
    ${statusNote ? `<aside class="notice"><strong>本次报告说明：</strong>${escapeHtml(statusNote)}</aside>` : ""}
    <nav class="report-nav" aria-label="报告目录"><a class="nav-link" href="#summary">先看结论</a><a class="nav-link" href="#video">视频内容</a><a class="nav-link" href="#frames">关键画面</a><a class="nav-link" href="#reuse">下一步怎么做</a></nav>
  </section>
  <section class="section" id="summary">
    <div class="section-heading"><span class="section-number">01</span><div><p class="section-kicker">先对齐问题</p><h2>这份报告要帮你做什么</h2></div></div>
    <div class="two-col"><div><p class="label">适合谁</p><p class="intent-value">${escapeHtml(targetAudience)}</p></div><div><p class="label">要回答的问题</p><p class="intent-value">${escapeHtml(cleanUserText(value(result.goal || result.inputs?.goal, VIRAL_WORK_ANALYSIS_DEFAULT_GOAL)))}</p></div></div>
    <p class="insight">这不是对视频的复述，而是把视频中能被看见、听见和核对的内容，转成创作决策：为什么可能获得关注，哪些做法值得借鉴，下一条内容应该怎么试。</p>
  </section>
  <section class="section" id="method">
    <div class="section-heading"><span class="section-number">02</span><div><p class="section-kicker">判断依据</p><h2>这次怎么得出结论</h2></div></div>
    <p class="section-lead">先看视频内容，再用公开数据和观众反馈补充验证；事实和判断分开呈现。</p>
    <h3>我们看了哪些信息</h3>
    <ul class="logic-list">${list(result.analysisLogic?.evidenceLayers).length
      ? list(result.analysisLogic.evidenceLayers).map((item) => `<li><strong>${escapeHtml(displayLabel(item?.name, "信息来源"))}</strong>${escapeHtml(cleanUserText(item?.detail, "未记录"))}</li>`).join("")
      : '<li><strong>视频内容和公开信息</strong>报告会把内容事实、视频数据、观众反馈和我们的判断分开。</li>'}</ul>
    <h3>这次完成了什么</h3>
    ${processItems(result).length
      ? `<ol class="process">${processItems(result).map((item) => `<li><div><strong>${escapeHtml(displayProcessTitle(item.title))} · ${escapeHtml(processStatusLabel(item.status))}</strong><small>${escapeHtml(displayProcessDetail(item.detail))}</small></div></li>`).join("")}</ol>`
      : '<p class="empty">暂未记录具体步骤。</p>'}
    <h3>判断边界</h3>
    ${htmlUserList(result.analysisLogic?.rules, "视频内容优先，未确认的内容会标明为待核对，不用互动数据替代视频观察。")}
  </section>
  <section class="section" id="metrics">
    <div class="section-heading"><span class="section-number">03</span><div><p class="section-kicker">公开数据</p><h2>视频数据</h2></div></div>
    <div class="fact-grid">
      <div class="fact"><span>视频标题</span><p>${escapeHtml(workTitle)}</p></div>
      <div class="fact"><span>作者</span><p>${escapeHtml(author)}</p></div>
      <div class="fact"><span>视频编号</span><p>${escapeHtml(value(work.id, "暂无数据"))}</p></div>
      <div class="fact"><span>视频时长</span><p>${escapeHtml(durationLabel(work.durationSeconds))}</p></div>
      <div class="fact"><span>视频简介</span><p>${escapeHtml(description)}</p></div>
      <div class="fact"><span>发布标签</span><p>${escapeHtml(list(work.hashtags).join("、") || "暂无数据")}</p></div>
    </div>
    <div class="metrics">${metricsRows.map(([label, metric]) => `<div class="metric"><strong>${escapeHtml(metric)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}</div>
  </section>
  <section class="section" id="video">
    <div class="section-heading"><span class="section-number">04</span><div><p class="section-kicker">内容事实</p><h2>视频内容拆解</h2></div></div>
    <p class="section-lead">先把这条视频实际讲了什么、怎么讲清楚，再讨论它可能为什么获得传播。</p>
    ${video.status === "completed" ? `
    <div class="detail-grid">
      <div class="detail"><span class="detail-label">这条视频讲了什么</span><p>${escapeHtml(cleanUserText(video.overview, "暂无内容总结"))}</p></div>
      <div class="detail"><span class="detail-label">画面里有什么</span><p>${escapeHtml(cleanUserText(video.subject, "暂无画面总结"))}</p></div>
      <div class="detail"><span class="detail-label">主要口播</span><p>${escapeHtml(cleanUserText(video.spokenContent, "暂无口播总结"))}</p></div>
      <div class="detail"><span class="detail-label">开头抓手</span><p>${escapeHtml(cleanUserText(video.hook, "暂未发现明显开头抓手"))}</p></div>
      <div class="detail"><span class="detail-label">声音与表达</span><p>${escapeHtml(cleanUserText([video.audio?.speechSummary, video.audio?.speechStyle].filter(Boolean).join("；"), "暂无声音信息"))}</p></div>
      <div class="detail"><span class="detail-label">字幕与画面文字</span><p>${escapeHtml(cleanUserText([video.subtitles?.summary, ...(video.subtitles?.keyPhrases || []).map((item) => `关键词：${item}`)].filter(Boolean).join("；"), "暂无字幕信息"))}</p></div>
      <div class="detail"><span class="detail-label">节奏</span><p>${escapeHtml(cleanUserText(video.pacing, "暂无节奏总结"))}</p></div>
    </div>
    <h3>内容怎么推进</h3>${htmlUserList(videoStructureItems(video.structure), "暂未形成视频分段")}
    <h3>值得注意的节点</h3>${htmlUserList(videoKeyMomentItems(video.keyMoments), "暂未形成关键节点")}
    <h3>视觉表达</h3>${htmlList(video.visual)}
    <h3>剪辑与呈现</h3>${htmlUserList(video.editing)}
    <h3>做得好的地方</h3>${htmlUserList(video.strengths)}
    <h3>还可以改进的地方</h3>${htmlUserList(video.weaknesses)}
    <h3>可能带来传播的因素</h3>${htmlUserList(video.growthSignals, "暂未形成传播因素观察")}
    <h3>值得验证的原因</h3>${htmlUserList(video.growthHypotheses, "暂未形成可验证的原因")}` : `<p class="empty">${escapeHtml(cleanUserText(value(video.message, "视频内容暂未完成复核，当前报告不把视频简介当作内容结论。")))}</p>`}
  </section>
  <section class="section" id="frames">
    <div class="section-heading"><span class="section-number">05</span><div><p class="section-kicker">回到画面</p><h2>关键画面回看</h2></div></div>
    ${frameItems(result).length
      ? `<p class="section-lead">${escapeHtml(frameSelectionDescription(result))}</p><div class="frame-grid">${frameItems(result).map((frame) => { const evidence = frameEvidence(frame, video); return `<figure class="frame"><img src="${escapeHtml(frame.dataUrl)}" alt="${escapeHtml(`视频 ${value(frame.timeLabel, "时间点")} 画面`)}" loading="lazy"><figcaption><strong>${escapeHtml(value(frame.timeLabel, "未标记时间"))} · ${escapeHtml(evidence.title)}</strong><span>为什么保留：${escapeHtml(evidence.reason)}</span></figcaption></figure>`; }).join("")}</div>`
      : '<p class="empty">暂未生成回看画面，报告不会用占位图代替真实证据。</p>'}
  </section>
  <section class="section" id="structure">
    <div class="section-heading"><span class="section-number">06</span><div><p class="section-kicker">提炼结构</p><h2>内容怎么组织</h2></div></div>
    <h3>开头抓手</h3>${htmlUserList([content.hook], "暂未发现明显开头抓手")}
    <h3>内容结构</h3>${htmlUserList(content.structure)}
    <h3>选题与发布标签</h3>${htmlUserList(content.topics)}
    <h3>结尾有没有引导</h3>${htmlUserList([content.cta], "暂未发现明确的行动引导")}
    <h3>观众为什么可能愿意看完</h3>${htmlUserList(content.strengths)}
  </section>
  <section class="section" id="audience">
    <div class="section-heading"><span class="section-number">07</span><div><p class="section-kicker">观众反馈</p><h2>大家在关注什么</h2></div></div>
    <div class="stat-row"><span>已读取评论</span><strong>${escapeHtml(String(audience.collected ?? result.comments?.collected ?? 0))} 条</strong></div>
    <div class="stat-row"><span>评论数据状态</span><strong>${escapeHtml(commentSourceLabel(result.comments?.source))}</strong></div>
    <h3>评论主题</h3>${htmlUserList(audience.topics?.map((item) => `${cleanUserText(item.key)} · ${item.count} 条`))}
    <h3>观众可能需要什么</h3>${htmlUserList(audience.needs)}
    <h3>观众可能卡在哪里</h3>${htmlUserList(audience.questions)}
    <h3>可能的疑问或阻力</h3>${htmlUserList(audience.objections)}
    <h3>评论原话</h3>${list(audience.representativeComments).length ? list(audience.representativeComments).map((item) => `<p class="quote">${escapeHtml(cleanUserText(item))}</p>`).join("") : '<p class="empty">暂未读取到代表性评论。</p>'}
  </section>
  <section class="section" id="reuse">
    <div class="section-heading"><span class="section-number">08</span><div><p class="section-kicker">转成行动</p><h2>可以借鉴什么</h2></div></div>
    <h3>值得借鉴的做法</h3>${htmlUserList(recommendations.reusableElements)}
    <h3>下一条可以怎么试</h3>${htmlUserList(recommendations.nextTests)}
    <h3>先记住这几点</h3>${htmlUserList(recommendations.cautions)}
  </section>
  <section class="section boundary" id="evidence">
    <div class="section-heading"><span class="section-number">09</span><div><p class="section-kicker">保持清醒</p><h2>哪些是事实，哪些是判断</h2></div></div>
    <ul>
      <li>视频内容结论来自对原视频的观察；公开数据和评论只做补充。</li>
      <li>没有返回的数据不会估算，也不会用视频简介代替视频内容。</li>
      <li>这里的“为什么可能有效”是待验证的内容假设，不等于已经证明带来转化或成交。</li>
      <li>点赞、评论和分享不等于商业结果，下一条内容仍需要实际测试。</li>
      <li>报告提炼的是结构和需求，不直接复制原视频素材或表达。</li>
    </ul>
    <h3>本次引用的依据</h3><ul class="evidence-list">${evidenceItems(result).length ? evidenceItems(result).map((item) => `<li>${escapeHtml(item)}</li>`).join("") : '<li class="empty">暂未形成可回查依据。</li>'}</ul>
  </section>
</main></body></html>`;
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
    "# 爆款作品分析报告",
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

export function viralWorkAnalysisReportFile(result = {}, { createdBy = "爆款作品分析" } = {}) {
  const taskId = value(result.taskId, `analysis-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  return {
    name: `爆款作品分析报告-${taskId}.html`,
    type: "html",
    content: buildViralWorkAnalysisReportHtml(result),
    projectId: "content-research",
    projectName: "内容研究",
    taskId: result.taskId || null,
    taskRunId: result.taskRunId || null,
    agentId: "mkt-viral-work-analysis",
    createdBy,
    sourceTaskTitle: "直接输入抖音作品链接",
    sourceResultId: null,
    summary: reportSummary(result),
    metadata: {
      analysisKind: "viral_work",
      sourceUrl: result.sourceUrl || result.inputs?.workUrl || "",
      videoFrameCount: frameItems(result).length
    }
  };
}

export function viralWorkAnalysisReportConversationMessage(file = {}) {
  return {
    text: "爆款作品分析报告已完成，已发送到这里，并同步保存到文件中心。",
    artifact: {
      id: file.id || null,
      name: file.name || "爆款作品分析报告.html",
      type: file.type || "html",
      projectName: file.projectName || "内容研究",
      summary: file.summary || "点击查看 HTML 分析报告",
      status: "已完成"
    }
  };
}
