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
  return value == null ? "未返回" : Number(value).toLocaleString("zh-CN");
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
    return `展示规则：先完成视频内容理解与结构拆解，再根据这条视频自身的关键表达、内容转折和视觉证据动态选择 ${frames.length} 张代表性画面；没有统一固定模板，相邻重复内容合并。时间和场景采样只用于内部理解，不直接作为用户证据。`;
  }
  if (videoFrames.selectionMode === "scene_aware") {
    return `展示规则：视频内容理解未完成，当前仅按场景变化和视频段落补充 ${frames.length} 张参考画面；这些画面用于回看事实，不等同于内容关键帧。`;
  }
  return `展示规则：视频内容理解和场景变化都不可用，当前仅按视频段落覆盖补充 ${frames.length} 张参考画面；这些画面用于回看事实，不等同于内容关键帧。`;
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
      title: value(keyMoment.title, "内容关键节点"),
      reason: value(keyMoment.reason || keyMoment.visualEvidence || keyMoment.evidence, "该画面用于回看内容关键节点。")
    };
  }
  const segment = frameStructureItem(frame, video.structure);
  if (segment) {
    return {
      title: value(segment.stage, "内容段落"),
      reason: value(segment.description || segment.content, "该画面用于回看这一内容段落。")
    };
  }
  return {
    title: value(frame?.contentTitle, "视频画面"),
    reason: value(frame?.contentReason, "该画面用于回看视频事实。")
  };
}

function evidenceItems(result = {}) {
  return list(result.evidence).map((item) => {
    const source = item?.sourceUrl ? `（来源：${item.sourceUrl}）` : "";
    return `${value(item?.type, "公开证据")}：${value(item?.text, "未记录")}${source}`;
  });
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
  const author = value(work.author?.name, "未返回");
  const description = value(work.description, "未返回");
  const sourceLink = /^https?:\/\//i.test(sourceUrl)
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a>`
    : escapeHtml(sourceUrl);
  const metricsRows = [
    ["播放量", metricValue(metrics.views)],
    ["点赞", metricValue(metrics.likes)],
    ["评论", metricValue(metrics.comments)],
    ["分享", metricValue(metrics.shares)],
    ["收藏", metricValue(metrics.favorites)],
    ["可见互动率", metrics.interactionRate == null ? "未返回" : `${metrics.interactionRate}%`]
  ];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>爆款作品分析报告</title>
  <style>
    body{margin:0;background:#f6f8fb;color:#18232e;font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
    main{max-width:920px;margin:0 auto;padding:42px 28px 64px}.cover,.section{background:#fff;border:1px solid #e4e9f0;border-radius:14px;padding:28px;margin:0 0 18px;box-shadow:0 8px 24px rgba(20,38,61,.05)}
    h1{margin:0 0 8px;font-size:30px;line-height:1.25}h2{margin:0 0 12px;font-size:20px}h3{margin:18px 0 6px;font-size:15px}.meta{color:#667487;overflow-wrap:anywhere}.summary{font-size:16px}.source{overflow-wrap:anywhere}.source a{color:#2f80ed;text-decoration:none}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}.metric{padding:12px;border:1px solid #e4eaf1;border-radius:9px;background:#fafcff}.metric strong{display:block;font-size:18px}.metric span{display:block;margin-top:3px;color:#778597;font-size:11px}dl{display:grid;gap:7px;margin:0 0 12px}dl div{display:grid;grid-template-columns:86px 1fr;gap:12px}dt{color:#7c8998}dd{margin:0;overflow-wrap:anywhere}ul{margin:6px 0;padding-left:20px}.empty{margin:6px 0;color:#7c8998}.boundary{color:#526170}.quote{padding:10px 12px;border-left:3px solid #7096d4;background:#f5f8fd;line-height:1.6}.quote+ .quote{margin-top:8px}.process{display:grid;gap:10px;margin:0;padding:0;list-style:none;counter-reset:process}.process li{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:11px 12px;border:1px solid #e5ebf2;border-radius:9px;background:#fbfcfe;counter-increment:process}.process li::before{content:counter(process);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eaf2ff;color:#3b6bd4;font-weight:700;font-size:12px}.process strong{display:block}.process small{display:block;color:#6d7b8b}.logic-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}.logic-list li{padding:9px 11px;border-left:3px solid #6c9ce8;background:#f5f8fd}.logic-list strong{display:block}.frame-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.frame{margin:0;border:1px solid #e3e9f1;border-radius:10px;overflow:hidden;background:#fbfcfe}.frame img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover;background:#eef2f6}.frame figcaption{padding:9px 11px;color:#5e6d7d;font-size:12px}.frame figcaption strong{display:block;color:#263342;font-size:13px}.frame figcaption span{display:block;margin-top:4px;color:#6d7b8b;font-size:11px;line-height:1.55}@media(max-width:640px){main{padding:22px 14px 42px}.cover,.section{padding:20px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.frame-grid{grid-template-columns:1fr}}
  </style>
</head>
<body><main>
  <section class="cover">
    <h1>爆款作品分析报告</h1>
    <p class="meta">分析状态：${escapeHtml(statusLabel(result.status))}<br>分析目标：${escapeHtml(value(result.goal || result.inputs?.goal, VIRAL_WORK_ANALYSIS_DEFAULT_GOAL))}<br>生成时间：${escapeHtml(value(result.generatedAt, "未记录"))}</p>
    <p class="source">作品链接：${sourceLink}</p>
    <p class="summary">${escapeHtml(value(result.summary, "暂无总结"))}</p>
  </section>
  <section class="section">
    <h2>分析目的与服务对象</h2>
    <dl>
      <div><dt>服务对象</dt><dd>${escapeHtml(targetAudience)}</dd></div>
      <div><dt>分析目的</dt><dd>${escapeHtml(purpose)}</dd></div>
    </dl>
    <p class="quote">这份报告不是复述视频，而是把视频中的可观察事实转成创作决策：为什么可能获得流量，哪些方法值得借鉴，以及下一条内容如何设计并验证。</p>
  </section>
  <section class="section">
    <h2>分析逻辑与执行过程</h2>
    <h3>证据分层</h3>
    <ul class="logic-list">${list(result.analysisLogic?.evidenceLayers).length
      ? list(result.analysisLogic.evidenceLayers).map((item) => `<li><strong>${escapeHtml(value(item?.name, "证据层"))}</strong>${escapeHtml(value(item?.detail, "未记录"))}</li>`).join("")
      : '<li>报告按视频事实、作品表现、观众反馈和分析判断分层。</li>'}</ul>
    <h3>执行步骤</h3>
    ${processItems(result).length
      ? `<ol class="process">${processItems(result).map((item) => `<li><div><strong>${escapeHtml(value(item.title, "分析步骤"))} · ${escapeHtml(processStatusLabel(item.status))}</strong><small>${escapeHtml(value(item.detail, "未记录"))}</small></div></li>`).join("")}</ol>`
      : '<p class="empty">未记录结构化执行步骤。</p>'}
    <h3>判断规则</h3>
    ${htmlList(result.analysisLogic?.rules, "视频事实优先，未确认内容标记为待核验，不用互动指标替代视频观察。")}
  </section>
  <section class="section">
    <h2>作品表现事实</h2>
    <dl>
      <div><dt>作品标题</dt><dd>${escapeHtml(value(work.title || description.slice(0, 80)))}</dd></div>
      <div><dt>作者</dt><dd>${escapeHtml(author)}</dd></div>
      <div><dt>作品 ID</dt><dd>${escapeHtml(value(work.id, "未返回"))}</dd></div>
      <div><dt>视频时长</dt><dd>${escapeHtml(work.durationSeconds == null ? "未返回" : `${work.durationSeconds} 秒`)}</dd></div>
      <div><dt>作品原文</dt><dd>${escapeHtml(description)}</dd></div>
      <div><dt>话题标签</dt><dd>${escapeHtml(list(work.hashtags).join("、") || "未识别到")}</dd></div>
    </dl>
    <div class="metrics">${metricsRows.map(([label, metric]) => `<div class="metric"><strong>${escapeHtml(metric)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}</div>
  </section>
  <section class="section">
    <h2>视频本身解析</h2>
    ${video.status === "completed" ? `
    <dl>
      <div><dt>视频内容</dt><dd>${escapeHtml(value(video.overview, "未返回"))}</dd></div>
      <div><dt>画面主体</dt><dd>${escapeHtml(value(video.subject, "未返回"))}</dd></div>
      <div><dt>口播内容</dt><dd>${escapeHtml(value(video.spokenContent, "未返回"))}</dd></div>
      <div><dt>开头抓手</dt><dd>${escapeHtml(value(video.hook, "未识别到"))}</dd></div>
      <div><dt>音频表现</dt><dd>${escapeHtml([video.audio?.speechSummary, video.audio?.speechStyle].filter(Boolean).join("；") || "未返回")}</dd></div>
      <div><dt>字幕与文字</dt><dd>${escapeHtml([video.subtitles?.summary, ...(video.subtitles?.keyPhrases || []).map((item) => `关键短语：${item}`)].filter(Boolean).join("；") || "未返回")}</dd></div>
      <div><dt>节奏</dt><dd>${escapeHtml(value(video.pacing, "未返回"))}</dd></div>
    </dl>
    <h3>视频时间线</h3>${htmlList(videoStructureItems(video.structure), "未形成视频分段")}
    <h3>内容关键节点</h3>${htmlList(videoKeyMomentItems(video.keyMoments), "未形成内容关键节点")}
    <h3>视觉表达</h3>${htmlList(video.visual)}
    <h3>剪辑方式</h3>${htmlList(video.editing)}
    <h3>视频本身的优势</h3>${htmlList(video.strengths)}
    <h3>视频本身的不足</h3>${htmlList(video.weaknesses)}
    <h3>可观察的流量信号</h3>${htmlList(video.growthSignals, "暂未形成流量信号观察")}
    <h3>增长机制假设</h3>${htmlList(video.growthHypotheses, "暂未形成增长机制假设，需在下一轮内容数据中验证")}` : `<p class="empty">${escapeHtml(value(video.message, "视频本身暂未完成解析，当前报告不把作品简介当作视频内容结论。"))}</p>`}
  </section>
  <section class="section">
    <h2>视频画面证据</h2>
    ${frameItems(result).length
      ? `<p class="meta">${escapeHtml(frameSelectionDescription(result))}</p><div class="frame-grid">${frameItems(result).map((frame) => { const evidence = frameEvidence(frame, video); return `<figure class="frame"><img src="${escapeHtml(frame.dataUrl)}" alt="${escapeHtml(`视频 ${value(frame.timeLabel, "时间点")} 画面`)}" loading="lazy"><figcaption><strong>${escapeHtml(value(frame.timeLabel, "未标记时间"))} · ${escapeHtml(evidence.title)}</strong><span>展示理由：${escapeHtml(evidence.reason)}</span></figcaption></figure>`; }).join("")}</div>`
      : '<p class="empty">视频代表画面未生成，当前报告不伪造视频画面证据。</p>'}
  </section>
  <section class="section">
    <h2>内容结构拆解</h2>
    <h3>开头抓手</h3>${htmlList([content.hook], "未识别到作品开头")}
    <h3>内容结构</h3>${htmlList(content.structure)}
    <h3>选题与标签</h3>${htmlList(content.topics)}
    <h3>行动引导</h3>${htmlList([content.cta], "未识别到明确行动引导")}
    <h3>当前可见优势</h3>${htmlList(content.strengths)}
  </section>
  <section class="section">
    <h2>评论需求与观众反馈</h2>
    <dl>
      <div><dt>采集数量</dt><dd>${escapeHtml(String(audience.collected ?? result.comments?.collected ?? 0))} 条</dd></div>
      <div><dt>评论来源</dt><dd>${escapeHtml(value(result.comments?.source, "未记录"))}</dd></div>
    </dl>
    <h3>评论主题</h3>${htmlList(audience.topics?.map((item) => `${item.key} · ${item.count} 条`))}
    <h3>用户需求</h3>${htmlList(audience.needs)}
    <h3>用户问题</h3>${htmlList(audience.questions)}
    <h3>疑虑与反对</h3>${htmlList(audience.objections)}
    <h3>代表性原话</h3>${list(audience.representativeComments).length ? list(audience.representativeComments).map((item) => `<p class="quote">${escapeHtml(item)}</p>`).join("") : '<p class="empty">暂未读取到代表性评论。</p>'}
  </section>
  <section class="section">
    <h2>可复用打法</h2>
    <h3>可复用元素</h3>${htmlList(recommendations.reusableElements)}
    <h3>下一轮测试</h3>${htmlList(recommendations.nextTests)}
    <h3>使用边界</h3>${htmlList(recommendations.cautions)}
  </section>
  <section class="section boundary">
    <h2>数据事实和分析判断</h2>
    <ul>
      <li>视频解析结论来自作品视频本身；公开指标和评论用于补充验证。</li>
      <li>未返回的数据不会估算，也不会用作品简介冒充视频内容结论。</li>
      <li>分析判断用于提出可验证的内容假设，不代表已经证明转化或成交。</li>
      <li>作品互动表现不等同于商业转化结果，需用下一轮测试继续验证。</li>
      <li>报告用于提炼结构和需求，不直接复制原作品素材或表达。</li>
    </ul>
    <h3>原始证据</h3>${htmlList(evidenceItems(result), "暂未形成可回查证据")}
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
    `> 作品链接：${value(result.sourceUrl || result.inputs?.workUrl)}`,
    `> 分析目标：${value(result.goal || result.inputs?.goal, VIRAL_WORK_ANALYSIS_DEFAULT_GOAL)}`,
    `> 分析状态：${statusLabel(result.status)}`,
    "",
    "## 总结",
    value(result.summary, "暂无总结"),
    "",
    "## 分析目的与服务对象",
    `- 服务对象：${targetAudience}`,
    `- 分析目的：${purpose}`,
    "- 报告要回答：这条视频有哪些可观察的流量信号，哪些机制值得借鉴，下一条内容如何设计并验证。",
    "",
    "## 分析逻辑与执行过程",
    "### 证据分层",
    ...htmlSafeMarkdownList("证据层", result.analysisLogic?.evidenceLayers?.map((item) => `${item.name}：${item.detail}`)),
    "### 执行步骤",
    ...processItems(result).map((item, index) => `${index + 1}. ${value(item.title, "分析步骤")} · ${processStatusLabel(item.status)}：${value(item.detail, "未记录")}`),
    "### 判断规则",
    ...htmlSafeMarkdownList("判断规则", result.analysisLogic?.rules),
    "",
    "## 作品表现事实",
    `- 作者：${value(work.author?.name, "未返回")}`,
    `- 作品原文：${value(work.description, "未返回")}`,
    `- 话题标签：${list(work.hashtags).join("、") || "未识别到"}`,
    `- 播放量：${metricValue(result.metrics?.views ?? work.metrics?.views)}`,
    `- 可见互动率：${result.metrics?.interactionRate == null ? "未返回" : `${result.metrics.interactionRate}%`}`,
    "",
    "## 视频本身解析",
    ...(video.status === "completed"
      ? [
        `- 视频内容：${value(video.overview, "未返回")}`,
        `- 画面主体：${value(video.subject, "未返回")}`,
        `- 口播内容：${value(video.spokenContent, "未返回")}`,
        `- 开头抓手：${value(video.hook, "未识别到")}`,
        `- 音频表现：${[video.audio?.speechSummary, video.audio?.speechStyle].filter(Boolean).join("；") || "未返回"}`,
        `- 字幕与画面文字：${[video.subtitles?.summary, ...(video.subtitles?.keyPhrases || []).map((item) => `关键短语：${item}`)].filter(Boolean).join("；") || "未返回"}`,
        `- 节奏：${value(video.pacing, "未返回")}`,
        ...htmlSafeMarkdownList("视频时间线", videoStructureItems(video.structure)),
        ...htmlSafeMarkdownList("内容关键节点", videoKeyMomentItems(video.keyMoments)),
        ...htmlSafeMarkdownList("视觉表达", video.visual),
        ...htmlSafeMarkdownList("剪辑方式", video.editing),
        ...htmlSafeMarkdownList("视频本身的优势", video.strengths),
        ...htmlSafeMarkdownList("视频本身的不足", video.weaknesses),
        ...htmlSafeMarkdownList("可观察的流量信号", video.growthSignals),
        ...htmlSafeMarkdownList("增长机制假设", video.growthHypotheses)
      ]
      : [`- ${value(video.message, "视频本身暂未完成解析，当前报告不把作品简介当作视频内容结论。")}`]),
    "",
    "## 视频画面证据",
    ...(frameItems(result).length
      ? [`${frameSelectionDescription(result)}`, ...frameItems(result).map((frame) => { const evidence = frameEvidence(frame, video); return `- ${value(frame.timeLabel, "未标记时间")} · ${evidence.title}：展示理由：${evidence.reason}。报告 HTML 中已嵌入实际视频帧。`; })]
      : ["- 视频代表画面未生成，当前报告不伪造视频画面证据。"]),
    "",
    "## 内容结构拆解",
    `- 开头抓手：${value(content.hook, "未识别到")}`,
    ...htmlSafeMarkdownList("内容结构", content.structure),
    ...htmlSafeMarkdownList("行动引导", [content.cta]),
    "",
    "## 评论需求与观众反馈",
    ...htmlSafeMarkdownList("评论主题", audience.topics?.map((item) => `${item.key} · ${item.count} 条`)),
    ...htmlSafeMarkdownList("用户需求", audience.needs),
    ...htmlSafeMarkdownList("用户问题", audience.questions),
    ...htmlSafeMarkdownList("代表性原话", audience.representativeComments),
    "",
    "## 可复用打法",
    ...htmlSafeMarkdownList("可复用元素", recommendations.reusableElements),
    ...htmlSafeMarkdownList("下一轮测试", recommendations.nextTests),
    ...htmlSafeMarkdownList("使用边界", recommendations.cautions),
    "",
    "## 数据事实和分析判断",
    "- 数据事实来自公开作品信息与可见评论，未返回的数据不会估算。",
    "- 分析判断是可验证假设，不代表已经证明转化或成交。",
    "- 不直接复制原作品素材或表达。"
  ];
  return lines.join("\n");
}

function htmlSafeMarkdownList(label, items) {
  const values = list(items);
  return [
    `### ${label}`,
    ...(values.length ? values.map((item) => `- ${value(item)}`) : [`- ${label}：暂无真实产出`])
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
    summary: value(result.summary, "爆款作品分析报告"),
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
