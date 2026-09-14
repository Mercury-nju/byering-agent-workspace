import * as XLSX from "xlsx";

function text(value) {
  if (value == null) return "";
  const source = String(value);
  // Prevent spreadsheet formula injection when public text starts with a
  // formula-like character.
  return /^[=+\-@]/.test(source) ? `'${source}` : source;
}

function list(value) {
  return Array.isArray(value) ? value.join("、") : text(value);
}

function videoRows(snapshot) {
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : [];
  const byVideo = new Map();
  for (const lead of leads) {
    const videoId = lead?.source?.videoId || lead?.videoId;
    if (!videoId) continue;
    if (!byVideo.has(videoId)) byVideo.set(videoId, []);
    byVideo.get(videoId).push(lead);
  }
  return (Array.isArray(snapshot?.videos) ? snapshot.videos : []).map((video, index) => ({
    ...(() => {
      const videoLeads = byVideo.get(video.videoId || video.id) || [];
      return {
        判断来源: text(snapshot.analysis?.source === "model" || snapshot.analysis?.mode === "model" ? "大模型" : "规则兜底"),
        高意向数: videoLeads.filter((lead) => lead.tier === "high").length,
        中意向数: videoLeads.filter((lead) => lead.tier === "medium").length,
        低意向数: videoLeads.filter((lead) => lead.tier === "low").length
      };
    })(),
    序号: index + 1,
    视频ID: text(video.videoId || video.id),
    标题: text(video.title),
    视频链接: text(video.url),
    发布时间: text(video.publishedAt),
    作者: text(video.authorName),
    作者ID: text(video.authorId),
    点赞数: video.metrics?.likes ?? "",
    评论数: video.metrics?.comments ?? "",
    分享数: video.metrics?.shares ?? "",
    播放数: video.metrics?.views ?? ""
  }));
}

function commentRows(snapshot) {
  const comments = Array.isArray(snapshot?.comments) && snapshot.comments.length
    ? snapshot.comments
    : Array.isArray(snapshot?.leads) ? snapshot.leads : [];
  const filterMode = snapshot.analysis?.mode === "filter";
  return comments.map((comment, index) => ({
    序号: index + 1,
    评论ID: text(comment.commentId || comment.cid || comment.id),
    视频ID: text(comment.source?.videoId || comment.videoId),
    视频链接: text(comment.source?.videoUrl || comment.source?.url),
    用户昵称: text(comment.nickname || comment.account),
    抖音号: text(comment.uniqueId),
    用户SecUID: text(comment.secUid),
    用户ID: text(comment.externalUserId),
    评论内容: text(comment.text),
    ...(filterMode ? {
      是否匹配: comment.filter?.matched === true ? "是" : comment.filter?.matched === false ? "否" : "待判断",
      判断来源: text(comment.filter?.source === "model" ? "大模型" : "规则兜底"),
      匹配置信度: comment.filter?.confidence ?? "",
      判断理由: text(comment.filter?.reason),
      匹配信号: list(comment.filter?.signals)
    } : {
      意向评分: comment.score ?? "",
      意向层级: text(comment.tier),
      判断来源: text(comment.intent?.source === "model" ? "大模型" : "规则兜底"),
      意向置信度: comment.intent?.confidence ?? "",
      判断理由: text(comment.intent?.reason),
      意向信号: list(comment.intent?.signals),
      命中关键词: list(comment.matchedTerms)
    }),
    评论时间: text(comment.source?.observedAt),
    证据链接: text(comment.source?.url || comment.source?.videoUrl)
  }));
}

export function createProspectWorkbook(resultSnapshot = {}) {
  const workbook = XLSX.utils.book_new();
  const videos = videoRows(resultSnapshot);
  const comments = commentRows(resultSnapshot);
  const videoSheet = XLSX.utils.json_to_sheet(videos.length ? videos : [{ 说明: "未采集到视频" }]);
  const commentSheet = XLSX.utils.json_to_sheet(comments.length ? comments : [{ 说明: "未采集到评论" }]);
  videoSheet["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 52 }, { wch: 48 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  commentSheet["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 22 }, { wch: 48 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 56 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 34 }, { wch: 18 }, { wch: 36 }, { wch: 30 }, { wch: 28 }, { wch: 22 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, videoSheet, "视频信息");
  XLSX.utils.book_append_sheet(workbook, commentSheet, "评论信息");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function prospectWorkbookFilename(snapshot = {}, fallback = "douyin-prospect") {
  const source = String(snapshot.account?.nickname || snapshot.query || fallback)
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
  return `${source}.xlsx`;
}
