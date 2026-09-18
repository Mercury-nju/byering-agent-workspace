import { el } from "./pages.js";

const CSS = `
.sb-viral-report-overview{display:grid;gap:14px;margin:16px 0 8px;padding:18px;border:1px solid #dbe5f5;border-radius:12px;background:#f7f9fd}
.sb-viral-report-kicker{color:#4267a5;font-size:10px;font-weight:700;letter-spacing:.04em}
.sb-viral-report-title{color:#20252b;font-size:18px;font-weight:750;line-height:1.35}
.sb-viral-report-summary{margin:0;color:#525c67;font-size:12px;line-height:1.65}
.sb-viral-report-source{margin:0;color:#788391;font-size:10.5px;line-height:1.55;overflow-wrap:anywhere}
.sb-viral-report-source a{color:#2f80ed;text-decoration:none}
.sb-viral-report-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:#788391;font-size:10px}
.sb-viral-report-status{display:inline-flex;align-items:center;padding:3px 7px;border-radius:5px;color:#197e53;background:#eaf8ef;font-weight:650}
.sb-viral-report-status.is-partial{color:#9a701f;background:#fff4dc}
.sb-viral-report-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sb-viral-report-metric{padding:10px 11px;border:1px solid #e3e9f2;border-radius:9px;background:#fff}
.sb-viral-report-metric strong{display:block;color:#20252b;font-size:18px;line-height:1.1}
.sb-viral-report-metric span{display:block;margin-top:5px;color:#788391;font-size:10px}
.sb-viral-report-facts{display:grid;gap:5px;color:#788391;font-size:10.5px;line-height:1.5}
.sb-viral-report-details{display:grid;gap:15px;margin-top:16px}
.sb-viral-report-section{padding-top:14px;border-top:1px solid #edf0f3}
.sb-viral-report-section:first-child{padding-top:0;border-top:0}
.sb-viral-report-section-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px;color:#69737f;font-size:12px;font-weight:700}
.sb-viral-report-section-title span{color:#a0a8b1;font-size:10px;font-weight:500}
.sb-viral-report-subsection{margin-top:12px}
.sb-viral-report-subsection h4{margin:0 0 6px;color:#8a949f;font-size:10.5px;font-weight:650}
.sb-viral-report-list{display:grid;gap:6px;margin:0;padding-left:17px;color:#343a43;font-size:11px;line-height:1.6}
.sb-viral-report-empty{margin:0;color:#9aa3ae;font-size:10.5px;line-height:1.5}
.sb-viral-report-quotes{display:grid;gap:7px}
.sb-viral-report-quote{margin:0;padding:9px 11px;border-left:3px solid #7096d4;border-radius:0 7px 7px 0;background:#f5f8fd;color:#4e5c6c;font-size:10.5px;line-height:1.55}
.sb-viral-report-evidence{display:grid;gap:7px}
.sb-viral-report-evidence-item{padding:9px 10px;border:1px solid #e7ebf1;border-radius:8px;background:#fbfcfe;color:#596573;font-size:10px;line-height:1.55}
.sb-viral-report-evidence-item strong{display:block;color:#34404c;font-size:10.5px}
.sb-viral-report-evidence-item a{color:#2f80ed;text-decoration:none;overflow-wrap:anywhere}
.sb-viral-report-process{display:grid;gap:7px;margin:0;padding:0;list-style:none;counter-reset:viral-process}
.sb-viral-report-process-item{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:8px 9px;border:1px solid #e7ebf1;border-radius:8px;background:#fbfcfe;counter-increment:viral-process}
.sb-viral-report-process-item::before{content:counter(viral-process);width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eaf2ff;color:#3b6bd4;font-size:10px;font-weight:700}
.sb-viral-report-process-item strong{display:block;color:#34404c;font-size:10.5px}
.sb-viral-report-process-item span{display:block;color:#596573;font-size:10px;line-height:1.55}
.sb-viral-report-frames{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sb-viral-report-frame{margin:0;overflow:hidden;border:1px solid #e7ebf1;border-radius:8px;background:#fbfcfe}
.sb-viral-report-frame img{display:block;width:100%;aspect-ratio:2 / 3;object-fit:cover;background:#eef2f6}
.sb-viral-report-frame figcaption{padding:7px 8px;color:#596573;font-size:10px;line-height:1.45}
.sb-viral-report-frame figcaption strong{display:block;color:#34404c;font-size:10.5px}
.sb-viral-report-frame figcaption span{display:block;margin-top:3px;color:#6d7783;font-size:9.5px;line-height:1.5}
.sb-viral-video-status{color:#197e53;font-size:10px;font-weight:650}
.sb-viral-video-status.is-unavailable{color:#9a701f}
@media(max-width:560px){.sb-viral-report-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-viral-report-section-title{align-items:flex-start;flex-direction:column;gap:3px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function value(input, fallback = "—") {
  const text = String(input ?? "").trim();
  return text || fallback;
}

function items(values) {
  return Array.isArray(values)
    ? values.filter((item) => String(item ?? "").trim())
    : [];
}

function metricValue(input) {
  if (input == null || input === "") return "未返回";
  const number = Number(input);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN") : String(input);
}

function statusLabel(status) {
  return ["completed", "succeeded", "success", "done"].includes(String(status || "").toLowerCase())
    ? "已完成"
    : "部分完成";
}

function appendList(container, values, empty = "暂无真实产出") {
  const list = items(values);
  if (!list.length) {
    container.appendChild(el("p", "sb-viral-report-empty", empty));
    return;
  }
  const ul = el("ul", "sb-viral-report-list");
  list.forEach((item) => ul.appendChild(el("li", null, item)));
  container.appendChild(ul);
}

function appendSubsection(container, title, values, empty) {
  const section = el("div", "sb-viral-report-subsection");
  section.appendChild(el("h4", null, title));
  appendList(section, values, empty);
  container.appendChild(section);
}

function structureItems(values) {
  return Array.isArray(values)
    ? values.map((item) => {
      if (typeof item === "string") return item;
      const stage = value(item?.stage, "阶段");
      const range = value(item?.timeRange, "");
      const description = value(item?.description || item?.content, "未记录");
      return `${stage}${range ? `（${range}）` : ""}：${description}`;
    }).filter(Boolean)
    : [];
}

function keyMomentItems(values) {
  return Array.isArray(values)
    ? values.map((item) => {
      if (typeof item === "string") return item;
      return `${value(item?.title, "关键内容")}（${value(item?.timeRange, "时间待核")}）：${value(item?.reason || item?.visualEvidence || item?.evidence, "未记录内容依据")}`;
    }).filter(Boolean)
    : [];
}

function processStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "succeeded", "success", "done"].includes(normalized)) return "完成";
  if (["partial", "running"].includes(normalized)) return "部分完成";
  return "待核验";
}

function validFrameItems(result) {
  const frames = result.videoFrames?.frames;
  if (!Array.isArray(frames)) return [];
  return frames.filter((frame) => /^data:image\/(?:jpeg|jpg|png);base64,/i.test(String(frame?.dataUrl || "")));
}

function frameStage(frame, structure) {
  const seconds = Number(frame?.timestampSeconds);
  if (!Number.isFinite(seconds) || !Array.isArray(structure)) return "视频画面";
  const matching = structure.find((item) => {
    const numbers = String(item?.timeRange || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    return numbers.length >= 2 && seconds >= numbers[0] && seconds <= numbers[1];
  });
  return matching?.stage || "视频画面";
}

function rangeContainsTime(item, seconds) {
  const numbers = String(item?.timeRange || item?.time_range || item?.timestamp || item?.time || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return numbers.length >= 2 && seconds >= Math.min(numbers[0], numbers[1]) && seconds <= Math.max(numbers[0], numbers[1]);
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
  const segment = Number.isFinite(seconds) && Array.isArray(video.structure)
    ? video.structure.find((item) => rangeContainsTime(item, seconds))
    : null;
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

function sourceLink(container, sourceUrl) {
  const source = el("p", "sb-viral-report-source");
  source.appendChild(document.createTextNode("作品链接："));
  if (/^https?:\/\//i.test(String(sourceUrl || ""))) {
    const link = el("a", null, sourceUrl);
    link.href = sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    source.appendChild(link);
  } else {
    source.appendChild(document.createTextNode(value(sourceUrl, "未记录")));
  }
  container.appendChild(source);
}

function section(container, title, count = "") {
  const node = el("section", "sb-viral-report-section");
  const head = el("div", "sb-viral-report-section-title");
  head.append(el("span", null, title), el("span", null, count));
  node.appendChild(head);
  container.appendChild(node);
  return node;
}

export function renderViralWorkAnalysisOverview(container, result = {}, { compact = false } = {}) {
  ensureStyle();
  const work = result.work || {};
  const metrics = result.metrics || work.metrics || {};
  const overview = el("section", "sb-viral-report-overview");
  overview.append(
    el("div", "sb-viral-report-kicker", "抖音爆款拆解官 · 面向自媒体博主的增长拆解"),
    el("strong", "sb-viral-report-title", value(result.title, "抖音爆款视频拆解报告")),
    el("p", "sb-viral-report-summary", value(result.summary, "暂无总结"))
  );
  sourceLink(overview, result.sourceUrl || result.inputs?.workUrl);
  const meta = el("div", "sb-viral-report-meta");
  const status = el("span", `sb-viral-report-status${statusLabel(result.status) === "部分完成" ? " is-partial" : ""}`, statusLabel(result.status));
  meta.append(status, el("span", null, `作者：${value(work.author?.name, "未返回")}`));
  if (result.comments?.note) meta.appendChild(el("span", null, result.comments.note));
  overview.appendChild(meta);
  if (!compact) {
    const metricsGrid = el("div", "sb-viral-report-metrics");
    [[metrics.views, "播放量"], [metrics.likes, "点赞"], [metrics.comments, "评论"], [metrics.shares, "分享"], [metrics.favorites, "收藏"], [metrics.interactionRate == null ? "未返回" : `${metrics.interactionRate}%`, "可见互动率"]].forEach(([metric, label]) => {
      const item = el("div", "sb-viral-report-metric");
      item.append(el("strong", null, metricValue(metric)), el("span", null, label));
      metricsGrid.appendChild(item);
    });
    overview.appendChild(metricsGrid);
  }
  const facts = el("div", "sb-viral-report-facts");
  facts.append(
    el("span", null, `作品：${value(work.title || work.description, "未返回")}`),
    el("span", null, `标签：${items(work.hashtags).join("、") || "未识别到"}`),
    ...(work.durationSeconds ? [el("span", null, `视频时长：${work.durationSeconds} 秒`)] : [])
  );
  overview.appendChild(facts);
  container.appendChild(overview);
}

export function renderViralWorkAnalysisDetails(container, result = {}) {
  ensureStyle();
  const work = result.work || {};
  const content = result.content || {};
  const audience = result.audience || {};
  const recommendations = result.recommendations || {};
  const details = el("div", "sb-viral-report-details");

  const purposeSection = section(details, "分析目的与服务对象");
  appendSubsection(purposeSection, "服务对象", [result.targetAudience || "准备做或正在做自媒体、希望通过学习爆款视频增长流量的博主"]);
  appendSubsection(purposeSection, "分析目的", [result.purpose || "从视频本身和公开表现中拆解它为什么可能获得流量，帮助博主找到可复用、可验证的创作方法。"]);
  appendSubsection(purposeSection, "报告要解决的问题", ["这条视频有哪些可观察的流量信号？哪些机制值得借鉴？下一条内容应该如何设计并验证？"]);

  const logicSection = section(details, "分析逻辑与执行过程");
  const layers = items(result.analysisLogic?.evidenceLayers).map((item) => `${value(item?.name, "证据层")}：${value(item?.detail, "未记录")}`);
  appendSubsection(logicSection, "证据分层", layers, "视频事实、作品表现、观众反馈和分析判断分层记录。");
  const process = Array.isArray(result.analysisProcess) ? result.analysisProcess.filter((item) => item && (item.title || item.detail)) : [];
  if (process.length) {
    const processBlock = el("div", "sb-viral-report-subsection");
    processBlock.appendChild(el("h4", null, "执行步骤"));
    const processList = el("ol", "sb-viral-report-process");
    process.forEach((item) => {
      const row = el("li", "sb-viral-report-process-item");
      const detail = el("div");
      detail.append(
        el("strong", null, `${value(item.title, "分析步骤")} · ${processStatusLabel(item.status)}`),
        el("span", null, value(item.detail, "未记录"))
      );
      row.appendChild(detail);
      processList.appendChild(row);
    });
    processBlock.appendChild(processList);
    logicSection.appendChild(processBlock);
  }
  appendSubsection(logicSection, "判断规则", items(result.analysisLogic?.rules), "视频事实优先，未确认内容标记为待核验，不用互动指标替代视频观察。");

  const video = result.videoAnalysis || {};
  const videoSection = section(details, "视频本身解析", video.status === "completed" ? "已读取画面与音轨" : "待补充");
  if (video.status === "completed") {
    appendSubsection(videoSection, "视频内容概览", [video.overview], "未形成视频内容概览");
    appendSubsection(videoSection, "画面主体与场景", [video.subject], "未识别到画面主体");
    appendSubsection(videoSection, "口播内容", [video.spokenContent], "未识别到可概括的口播内容");
    appendSubsection(videoSection, "开头抓手", [video.hook], "未识别到前几秒抓手");
    appendSubsection(videoSection, "音频表现", [video.audio?.speechSummary, video.audio?.speechStyle].filter(Boolean), "未识别到音频表现");
    appendSubsection(videoSection, "字幕与画面文字", [video.subtitles?.summary, ...(video.subtitles?.keyPhrases || []).map((item) => `关键短语：${item}`)].filter(Boolean), "未识别到字幕或画面文字");
    appendSubsection(videoSection, "视频时间线", structureItems(video.structure), "未形成视频分段");
    appendSubsection(videoSection, "内容关键节点", keyMomentItems(video.keyMoments), "未形成内容关键节点");
    appendSubsection(videoSection, "视觉表达", video.visual, "未形成视觉观察");
    appendSubsection(videoSection, "节奏", [video.pacing], "未形成节奏判断");
    appendSubsection(videoSection, "剪辑方式", video.editing, "未形成剪辑观察");
    appendSubsection(videoSection, "视频本身的优势", video.strengths);
    appendSubsection(videoSection, "视频本身的不足", video.weaknesses);
    appendSubsection(videoSection, "可观察的流量信号", video.growthSignals, "未形成流量信号观察");
    appendSubsection(videoSection, "增长机制假设", video.growthHypotheses, "暂未形成增长机制假设，需在下一轮内容数据中验证");
  } else {
    const unavailable = el("p", "sb-viral-report-empty", value(video.message, "视频本身暂未完成解析，当前报告不把作品简介当作视频内容结论。"));
    videoSection.appendChild(unavailable);
  }

  const frames = validFrameItems(result);
  const framesSection = section(details, "视频画面证据", frames.length ? `${frames.length} 张` : "待补充");
  if (frames.length) {
    framesSection.appendChild(el("p", "sb-viral-report-empty", result.videoFrames?.selectionMode === "content_aware"
      ? "展示规则：先完成视频内容理解与结构拆解，再根据这条视频自身的关键表达、内容转折和视觉证据动态选择代表性画面；没有统一固定模板，相邻重复内容合并。时间和场景采样只用于内部理解，不直接作为用户证据。"
      : "展示规则：视频内容理解未完成，当前仅按场景变化和视频段落补充参考画面；这些画面用于回看事实，不等同于内容关键帧。"));
    const grid = el("div", "sb-viral-report-frames");
    frames.forEach((frame) => {
      const figure = el("figure", "sb-viral-report-frame");
      const image = document.createElement("img");
      image.src = frame.dataUrl;
      image.alt = `视频 ${value(frame.timeLabel, "时间点")} 画面`;
      image.loading = "lazy";
      const caption = el("figcaption");
      const evidence = frameEvidence(frame, video);
      caption.append(
        el("strong", null, `${value(frame.timeLabel, "未标记时间")} · ${evidence.title}`),
        el("span", null, `展示理由：${evidence.reason}`)
      );
      figure.append(image, caption);
      grid.appendChild(figure);
    });
    framesSection.appendChild(grid);
  } else {
    framesSection.appendChild(el("p", "sb-viral-report-empty", "视频代表画面未生成，当前结果不伪造视频画面证据。"));
  }

  const contentSection = section(details, "内容结构拆解");
  appendSubsection(contentSection, "开头抓手", [content.hook], "未识别到作品开头");
  appendSubsection(contentSection, "内容结构", content.structure);
  appendSubsection(contentSection, "选题与标签", content.topics);
  appendSubsection(contentSection, "行动引导", [content.cta], "未识别到明确行动引导");
  appendSubsection(contentSection, "当前可见优势", content.strengths);

  const audienceSection = section(details, "评论需求与观众反馈", `${audience.collected ?? 0} 条公开评论`);
  appendSubsection(audienceSection, "评论主题", items(audience.topics).map((item) => `${item.key} · ${item.count} 条`));
  appendSubsection(audienceSection, "用户需求", audience.needs);
  appendSubsection(audienceSection, "用户问题", audience.questions);
  appendSubsection(audienceSection, "疑虑与反对", audience.objections);
  const quotes = el("div", "sb-viral-report-subsection");
  quotes.appendChild(el("h4", null, "代表性原话"));
  const quoteItems = items(audience.representativeComments);
  if (!quoteItems.length) quotes.appendChild(el("p", "sb-viral-report-empty", "暂未读取到代表性评论。"));
  else {
    const quoteList = el("div", "sb-viral-report-quotes");
    quoteItems.forEach((item) => quoteList.appendChild(el("p", "sb-viral-report-quote", item)));
    quotes.appendChild(quoteList);
  }
  audienceSection.appendChild(quotes);

  const recommendationSection = section(details, "可复用打法");
  appendSubsection(recommendationSection, "可复用元素", recommendations.reusableElements);
  appendSubsection(recommendationSection, "下一轮测试", recommendations.nextTests);
  appendSubsection(recommendationSection, "使用边界", recommendations.cautions);

  const evidenceSection = section(details, "证据与边界", `${items(result.evidence).length} 条可回查依据`);
  const boundary = el("p", "sb-viral-report-empty", "视频解析结论来自作品视频本身；公开指标和评论用于补充验证。没有返回的数据不做估算，互动表现也不等同于成交结果。报告用于提炼结构和需求，不直接复制原作品素材或表达。");
  evidenceSection.appendChild(boundary);
  const evidence = items(result.evidence);
  if (evidence.length) {
    const evidenceList = el("div", "sb-viral-report-evidence");
    evidence.forEach((item) => {
      const row = el("div", "sb-viral-report-evidence-item");
      row.appendChild(el("strong", null, value(item.type, "公开证据")));
      row.appendChild(document.createTextNode(value(item.text, "未记录")));
      if (item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl)) {
        row.appendChild(document.createTextNode(" "));
        const link = el("a", null, "打开来源");
        link.href = item.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        row.appendChild(link);
      }
      evidenceList.appendChild(row);
    });
    evidenceSection.appendChild(evidenceList);
  }
  container.appendChild(details);
}
