/**
 * agents/metrics-store.js
 * 数据看板数据源：按「职能大类 → Agent 员工」组织每个员工产出的经营数据。
 * 近 14 天序列为内置经营基线（演示数据，稳定不变），
 * 真实数据实时并入：产出文件数来自 file-store（createdBy），完成任务数来自 task-store，
 * 在制状态来自 work-live（任务跑到谁，看板头部就显示谁在干活）。
 */

import { listFiles } from "./file-store.js";
import { listTasks } from "./task-store.js";
import { getWorkForProject } from "./work-live.js";

/** 职能大类 → 员工（agentType）。顺序即看板展示顺序。 */
export const BOARD_CATEGORIES = Object.freeze([
  { key: "acquire", label: "获客", desc: "找到并筛出对的人", members: ["Browser Agent", "Search Agent"] },
  { key: "content", label: "内容", desc: "把话说出去", members: ["File Agent"] },
  { key: "touch", label: "触达", desc: "把客户聊起来", members: ["App Agent"] },
  { key: "support", label: "支持", desc: "让团队跑得更快", members: ["Computer Agent"] }
]);

/** 每个员工的看板定义：三个关键指标 + 近 14 天序列（最多两条，图表分组柱状）+ 兜底产出样例。 */
const MEMBER_METRICS = {
  "Browser Agent": {
    headline: "线索发现与联系方式补全",
    stats: [
      { label: "累计新增线索", value: 1086, unit: "条" },
      { label: "联系方式补全率", value: "78.4", unit: "%" },
      { label: "邮箱验证通过率", value: "85", unit: "%" }
    ],
    series: [
      { label: "每日新增线索", color: "#3B6BD4", values: [42, 55, 48, 61, 58, 72, 66, 80, 74, 69, 88, 92, 85, 96] }
    ],
    chartNote: "近 14 天新增线索（条）",
    sampleOutputs: ["douyin-candidates-raw.csv", "竞品账号监控清单.md", "邮箱补全结果-0810.csv"]
  },
  "Search Agent": {
    headline: "线索清洗、评分与分级",
    stats: [
      { label: "累计清洗线索", value: 1142, unit: "条" },
      { label: "A 级占比", value: "10.3", unit: "%" },
      { label: "无效数据剔除率", value: "18", unit: "%" }
    ],
    series: [
      { label: "A 级", color: "#3B6BD4", values: [4, 6, 5, 7, 8, 6, 9, 8, 10, 9, 11, 10, 12, 13] },
      { label: "B / C 级", color: "#B9C6E4", values: [30, 36, 33, 40, 38, 45, 41, 48, 44, 42, 52, 55, 50, 58] }
    ],
    chartNote: "近 14 天评分产出（条 / 天）",
    sampleOutputs: ["leads-douyin-scored.csv", "AB级线索画像分析.md", "无效线索剔除日志.csv"]
  },
  "File Agent": {
    headline: "触达物料与内容产出",
    stats: [
      { label: "内容产出", value: 59, unit: "篇" },
      { label: "一次通过率", value: "84", unit: "%" },
      { label: "覆盖渠道", value: 5, unit: "个" }
    ],
    series: [
      { label: "每日产出", color: "#57B26A", values: [2, 3, 2, 4, 3, 5, 4, 3, 5, 4, 6, 5, 6, 7] }
    ],
    chartNote: "近 14 天内容产出（篇 / 天）",
    sampleOutputs: ["首触私信话术 v1.md", "评论区互动话术.md", "14天选题日历.md"]
  },
  "App Agent": {
    headline: "潜客触达与转化跟进",
    stats: [
      { label: "累计触达", value: 410, unit: "人次" },
      { label: "回复率", value: "22.7", unit: "%" },
      { label: "意向转化", value: 16, unit: "人" }
    ],
    series: [
      { label: "触达", color: "#E8A33D", values: [18, 22, 20, 26, 24, 30, 28, 33, 31, 29, 36, 38, 35, 40] },
      { label: "回复", color: "#57B26A", values: [3, 4, 4, 6, 5, 7, 6, 8, 7, 7, 9, 9, 8, 10] }
    ],
    chartNote: "近 14 天触达与回复（人次 / 天）",
    sampleOutputs: ["A级潜客触达排期.csv", "跟进节奏 SOP.md", "回复意向分级记录.csv"]
  },
  "Computer Agent": {
    headline: "自动化脚本与运行保障",
    stats: [
      { label: "自动化脚本", value: 12, unit: "个" },
      { label: "累计运行", value: 59, unit: "次" },
      { label: "运行成功率", value: "98.3", unit: "%" }
    ],
    series: [
      { label: "每日运行", color: "#8A8F99", values: [3, 2, 4, 3, 5, 2, 4, 6, 3, 5, 4, 6, 5, 7] }
    ],
    chartNote: "近 14 天脚本运行（次 / 天）",
    sampleOutputs: ["dedupe.py 运行报告.txt", "评论区采集脚本 v3.py", "定时同步任务配置.yaml"]
  }
};

const RESULT_STORIES = Object.freeze({
  "Browser Agent": {
    kicker: "LEAD DISCOVERY",
    primaryLabel: "今日新增候选",
    primaryUnit: "人",
    seriesIndex: 0,
    breakdownMode: "partition-primary",
    breakdown: {
      title: "线索来源",
      items: [
        { label: "作品评论区", value: 46, unit: "人", ratio: 48 },
        { label: "直播间互动", value: 30, unit: "人", ratio: 31 },
        { label: "关注列表", value: 20, unit: "人", ratio: 21 }
      ]
    },
    records: {
      title: "最近新增潜客",
      items: [
        { title: "@沪上车研社", meta: "Model Y · 问落地价 · 评论区", value: "匹配 92", status: "待分析" },
        { title: "@阿峰看车", meta: "理想 L7 · 置换 · 直播间", value: "匹配 88", status: "已补全" },
        { title: "@周末去试驾", meta: "问界 M9 · 试驾 · 关注列表", value: "匹配 84", status: "待补全" }
      ]
    }
  },
  "Search Agent": {
    kicker: "INTENT SCORING",
    primaryLabel: "今日高意向",
    primaryUnit: "人",
    seriesIndex: 0,
    breakdownMode: "intent",
    breakdown: {
      title: "今日意向分层",
      items: [
        { label: "A 级 · 高意向", value: 13, unit: "人", ratio: 18 },
        { label: "B 级 · 可培育", value: 35, unit: "人", ratio: 49 },
        { label: "C 级 · 低意向", value: 23, unit: "人", ratio: 33 }
      ]
    },
    records: {
      title: "最新高意向客户",
      items: [
        { title: "用户 8***2", meta: "Model Y · 预算 25–30 万 · 上海", value: "94 分", status: "A 级" },
        { title: "用户 3***7", meta: "理想 L7 · 有旧车置换 · 杭州", value: "91 分", status: "A 级" },
        { title: "用户 6***5", meta: "问界 M9 · 两周内试驾 · 苏州", value: "89 分", status: "A 级" }
      ]
    }
  },
  "File Agent": {
    kicker: "CONTENT DELIVERY",
    primaryLabel: "今日交付内容",
    primaryUnit: "篇",
    seriesIndex: 0,
    breakdownMode: "partition-primary",
    breakdown: {
      title: "今日内容类型",
      items: [
        { label: "首触私信", value: 3, unit: "篇", ratio: 43 },
        { label: "评论回复", value: 2, unit: "篇", ratio: 29 },
        { label: "跟进模板", value: 2, unit: "篇", ratio: 28 }
      ]
    },
    records: {
      title: "最新内容交付",
      items: [
        { title: "首触私信话术 v3", meta: "高意向 · 新能源 SUV", value: "3 套", status: "已交付" },
        { title: "评论区互动回复", meta: "价格咨询 · 试驾邀约", value: "18 条", status: "已通过" },
        { title: "二次跟进模板", meta: "24h 未回复客户", value: "5 条", status: "待审核" }
      ]
    }
  },
  "App Agent": {
    kicker: "OUTREACH RESULT",
    primaryLabel: "今日收到回复",
    primaryUnit: "人",
    seriesIndex: 1,
    breakdownMode: "funnel",
    breakdown: {
      title: "今日触达漏斗",
      items: [
        { label: "已触达", value: 40, unit: "人", ratio: 100 },
        { label: "已回复", value: 10, unit: "人", ratio: 25 },
        { label: "意向升级", value: 3, unit: "人", ratio: 8 }
      ]
    },
    records: {
      title: "最新客户回复",
      items: [
        { title: "用户 8***2", meta: "“周六下午可以去店里看看”", value: "1 分钟前", status: "待跟进" },
        { title: "用户 3***7", meta: "“旧车置换大概能抵多少？”", value: "6 分钟前", status: "已回复" },
        { title: "用户 1***4", meta: "“把配置单发我看一下”", value: "12 分钟前", status: "已发送" }
      ]
    }
  },
  "Computer Agent": {
    kicker: "AUTOMATION RUN",
    primaryLabel: "今日完成运行",
    primaryUnit: "次",
    seriesIndex: 0,
    breakdownMode: "scaled",
    breakdown: {
      title: "今日运行结果",
      items: [
        { label: "成功任务", value: 7, unit: "次", ratio: 100 },
        { label: "采集账号", value: 4, unit: "个", ratio: 57 },
        { label: "输出文件", value: 3, unit: "份", ratio: 43 }
      ]
    },
    records: {
      title: "最近自动化运行",
      items: [
        { title: "抖音评论区采集", meta: "4 个账号 · 1,286 条互动", value: "02:43", status: "成功" },
        { title: "联系方式补全", meta: "96 条候选 · 命中 75 条", value: "01:18", status: "成功" },
        { title: "高意向名单导出", meta: "A 级 13 人 · CSV", value: "00:09", status: "成功" }
      ]
    }
  }
});

/** 员工名解析：优先 teamLive 档案名（用户可能改过），回退岗位默认名。 */
export function memberName(teamLive, agentType, fallback) {
  return teamLive?.getProfiles?.().get(agentType)?.identity?.name || fallback || agentType;
}

/** 项目组的经营规模系数：按 id 稳定散列到 0.42–0.98；主项目组（潜在客户拓展）为满量 1。 */
export function projectScale(room) {
  if (!room) return 1;
  if ((room.name || "").includes("潜在客户拓展")) return 1;
  let h = 0;
  const s = String(room.id || room.name);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 0.42 + (h % 57) / 100;
}

/** 项目组可用看板：负责人优先，去重后过滤掉尚无指标定义的成员。 */
export function roomDashboardMembers(room) {
  if (!room) return [];
  return [...new Set([room.owner, ...(room.members || [])])]
    .filter((agentType) => agentType && MEMBER_METRICS[agentType]);
}

/** 项目记录必须通过稳定 room id 归属，同名项目不互相污染。 */
export function projectRecordMatches(record, project) {
  if (!record || !project?.id) return false;
  return record.projectId === project.id;
}

function projectTasks(room) {
  return listTasks()
    .filter((task) => projectRecordMatches(task, room))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}

function taskStatusLabel(status) {
  return {
    progress: "进行中",
    running: "进行中",
    approval: "待确认",
    blocked: "已暂停",
    failed: "执行失败",
    done: "已完成"
  }[status] || "待开始";
}

function taskDisplayValue(task) {
  if (task?.resultSnapshot) return "有结果";
  if (task?.status === "done") return "已完成";
  if (task?.status === "approval") return "待确认";
  if (task?.status === "failed" || task?.status === "blocked") return taskStatusLabel(task.status);
  const progress = Number(task?.runtimeProgress);
  return Number.isFinite(progress) && progress > 0 && progress < 100 ? `${Math.round(progress)}%` : "执行中";
}

function observedTaskSeries(tasks, files) {
  const events = [...tasks, ...files]
    .map((item) => item?.updated_at || item?.created_at)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!events.length) return [];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const values = Array.from({ length: 7 }, () => 0);
  events.forEach((timestamp) => {
    const age = Math.floor((now - timestamp) / day);
    if (age >= 0 && age < values.length) values[values.length - age - 1] += 1;
  });
  if (!values.some(Boolean)) return [];
  return [{ label: "任务更新", values }];
}

function isSalesProject(room) {
  const text = `${room?.name || ""} ${room?.goal || ""}`;
  return /(潜在客户|潜客|留资|到店|买车|销售线索|客户拓展)/.test(text);
}

function isSalesSimulationRoom(room) {
  return ["seed-sales-ops", "room-leads"].includes(room?.id)
    || /^room-leads(?:-|$)/.test(room?.id || "");
}

function salesFunnelSnapshot(members) {
  const byType = new Map(members.map((dashboard) => [dashboard.agentType, dashboard]));
  const app = byType.get("App Agent");
  const search = byType.get("Search Agent");
  const contacted = app?.series?.[0]?.values?.at(-1) || 0;
  const replied = app?.series?.[1]?.values?.at(-1) || 0;
  const highIntent = search?.series?.[0]?.values?.at(-1) || 0;
  const appointments = Math.max(0, Math.round(replied * 0.4));
  const effectiveLeads = Math.max(0, Math.round(highIntent * 0.45));
  const items = [
    { label: "有效留资", value: effectiveLeads, unit: "人" },
    { label: "到店/预约", value: appointments, unit: "人" },
    { label: "高意向客户", value: Math.round(highIntent * 0.6), unit: "人" },
    { label: "有效回复", value: replied, unit: "人" },
    { label: "已触达", value: contacted, unit: "人" }
  ];
  const denominator = contacted || 1;
  return {
    primary: { label: "有效留资", value: effectiveLeads, unit: "人" },
    items: items.map((item) => ({ ...item, ratio: Math.round((item.value / denominator) * 100) })),
    stats: [
      { label: "有效留资", value: effectiveLeads, unit: "人" },
      { label: "到店/预约", value: appointments, unit: "人" },
      { label: "有效回复", value: replied, unit: "人" }
    ],
    series: app?.series?.length
      ? [
        { ...app.series[0], label: "已触达" },
        { ...app.series[1], label: "有效回复" }
      ]
      : [],
    chartNote: "近 14 天触达与留资转化趋势"
  };
}

function emptySalesFunnelSnapshot() {
  const items = [
    { label: "有效留资", value: 0, unit: "人", ratio: 0 },
    { label: "到店/预约", value: 0, unit: "人", ratio: 0 },
    { label: "高意向客户", value: 0, unit: "人", ratio: 0 },
    { label: "有效回复", value: 0, unit: "人", ratio: 0 },
    { label: "已触达", value: 0, unit: "人", ratio: 0 }
  ];
  return {
    primary: { label: "有效留资", value: 0, unit: "人" },
    items,
    stats: [
      { label: "有效留资", value: 0, unit: "人" },
      { label: "到店/预约", value: 0, unit: "人" },
      { label: "有效回复", value: 0, unit: "人" }
    ],
    series: [],
    chartNote: "等待真实销售结果"
  };
}

function salesRecords(members) {
  const app = members.find((dashboard) => dashboard.agentType === "App Agent");
  const records = memberResultStory(app)?.records?.items || [];
  return {
    title: "最新有效留资",
    items: records.slice(0, 3).map((item, index) => ({
      ...item,
      title: index === 0 ? "用户 8***2" : item.title,
      meta: index === 0 ? "已确认到店意向 · 周六 14:00" : item.meta,
      value: index === 0 ? "已留资" : item.value,
      status: index === 0 ? "待销售跟进" : item.status
    }))
  };
}

function emptyProjectDashboard(room, members, tasks, files, work) {
  const taskSummary = tasks.reduce((summary, task) => {
    if (task.status === "approval") summary.approval += 1;
    else if (task.status === "done") summary.done += 1;
    else if (task.status === "failed" || task.status === "blocked") summary.blocked += 1;
    else summary.running += 1;
    return summary;
  }, { running: 0, approval: 0, done: 0, blocked: 0 });
  const statusItems = [
    { key: "running", label: "进行中", value: taskSummary.running },
    { key: "approval", label: "待确认", value: taskSummary.approval },
    { key: "done", label: "已完成", value: taskSummary.done },
    { key: "blocked", label: "已暂停", value: taskSummary.blocked }
  ].filter((item) => item.value > 0);
  const totalTasks = tasks.length;
  // The primary lead project is an investor-demo fixture until the gateway sends
  // a structured result. Other untouched projects stay honest at zero.
  const salesFunnel = isSalesProject(room)
    ? (isSalesSimulationRoom(room) ? salesFunnelSnapshot(members) : emptySalesFunnelSnapshot())
    : null;
  const primary = totalTasks
    ? { label: "项目任务", value: totalTasks, unit: "项" }
    : files.length
      ? { label: "项目产出", value: files.length, unit: "份" }
      : work
        ? { label: "执行中任务", value: 1, unit: "项" }
      : { label: "尚无结果", value: 0, unit: "" };
  if (salesFunnel) {
    primary.label = salesFunnel.primary.label;
    primary.value = salesFunnel.primary.value;
    primary.unit = salesFunnel.primary.unit;
  }
  if (work && !statusItems.some((item) => item.key === "running")) statusItems.unshift({ key: "running", label: "进行中", value: 1 });
  const statusTotal = statusItems.reduce((sum, item) => sum + item.value, 0);
  const stats = statusItems.map((item) => ({ label: item.label, value: item.value, unit: "项", real: true }));
  if (files.length && totalTasks) stats.push({ label: "项目产出", value: files.length, unit: "份", real: true });
  const observedSeries = observedTaskSeries(tasks, files);
  return {
    projectId: room.id,
    projectName: room.name,
    dataState: tasks.length || files.length || work ? "live" : "empty",
    dataSource: tasks.some((task) => task.resultSnapshot?.source === "gateway") ? "gateway" : tasks.length || files.length || work ? "runtime" : "none",
    primary,
    delta: null,
    breakdown: {
      title: salesFunnel ? "销售转化漏斗" : totalTasks ? "任务状态" : "项目产出",
      items: salesFunnel ? salesFunnel.items : statusItems.map((item) => ({
        label: item.label,
        value: item.value,
        unit: "项",
        ratio: statusTotal ? Math.round((item.value / statusTotal) * 100) : 0
      }))
    },
    records: salesFunnel
      ? (salesFunnel.primary.value ? salesRecords(members) : { title: "最新有效留资", items: [] })
      : {
      title: totalTasks ? "任务状态汇总" : "项目产出汇总",
      mode: "status-summary",
      items: totalTasks
        ? statusItems.map((item) => ({
          title: item.label,
          meta: `${item.value} 项项目任务`,
          value: `${item.value} 项`,
          status: "已同步",
          source: "task-store"
        }))
        : files.length
          ? [{ title: "项目产出", meta: "来自当前项目文件夹", value: `${files.length} 份`, status: "已同步", source: "file-store" }]
          : []
    },
    stats: salesFunnel ? salesFunnel.stats : stats,
    outputs: files.slice(0, 5).map((file) => ({
      id: file.id,
      name: file.name,
      at: file.updated_at || file.created_at || null,
      owner: file.createdBy || "项目组",
      taskId: file.taskId || null,
      real: true
    })),
    series: salesFunnel?.series?.length ? salesFunnel.series : observedSeries,
    chartNote: salesFunnel ? salesFunnel.chartNote : observedSeries.length ? "最近任务更新（项 / 天）" : "暂无足够历史数据",
    tasks: tasks.slice(0, 12).map((task) => ({
      id: task.id,
      title: task.title || "未命名任务",
      status: task.status || "progress",
      preview: task.preview || "",
      progress: task.runtimeProgress || 0,
      updatedAt: task.updated_at || task.created_at || null
    })),
    taskSummary,
    members: members.map((dashboard) => ({ agentType: dashboard.agentType, name: dashboard.name, work: dashboard.work })),
    work: work ? { ...work, agentType: work.agentType || members.find((dashboard) => dashboard.work === work)?.agentType || null } : null,
    cloudAgentType: work?.agentType || members[0]?.agentType || null
  };
}

function liveProjectDashboard(room, members, tasks, files, work) {
  const snapshots = tasks
    .map((task) => ({ task, snapshot: task.resultSnapshot }))
    .filter(({ snapshot }) => snapshot && Array.isArray(snapshot.metrics) && snapshot.metrics.length);
  const metricMap = new Map();
  snapshots.forEach(({ snapshot }) => {
    snapshot.metrics.forEach((metric) => {
      if (!metric?.key || !Number.isFinite(Number(metric.value))) return;
      metricMap.set(metric.key, { key: metric.key, label: metric.label || metric.key, value: Number(metric.value), unit: metric.unit || "" });
    });
  });
  const metrics = [...metricMap.values()];
  const latestSnapshot = snapshots[0]?.snapshot;
  const primaryMetric = (isSalesProject(room) && metrics.find((metric) => metric.key === "effective_leads"))
    || metrics.find((metric) => metric.key === latestSnapshot?.primaryMetricKey)
    || metrics.at(-1);
  const live = emptyProjectDashboard(room, members, tasks, files, work);
  live.dataState = "live";
  live.dataSource = snapshots.some(({ snapshot }) => snapshot.source === "gateway") ? "gateway" : "runtime";
  live.primary = primaryMetric ? { label: primaryMetric.label, value: primaryMetric.value, unit: primaryMetric.unit } : live.primary;
  live.stats = metrics.slice(0, 4);
  live.records = {
    title: "最近任务结果",
    mode: "result-summary",
    items: tasks.slice(0, 5).map((task) => ({
      taskId: task.id,
      title: task.title || "未命名任务",
      meta: task.resultSnapshot?.summary || task.preview || "任务已创建，等待执行结果",
      value: taskDisplayValue(task),
      status: taskStatusLabel(task.status),
      resultTitle: task.resultSnapshot ? "结果已提交" : "等待结果",
      source: "task-store"
    }))
  };
  const snapshotSeries = latestSnapshot?.series?.length ? latestSnapshot.series : null;
  live.series = snapshotSeries || live.series;
  live.chartNote = latestSnapshot?.chartNote || (snapshotSeries ? "真实任务结果趋势" : live.series.length ? "最近任务更新（项 / 天）" : "暂无足够历史数据");
  return live;
}

function projectDataToken(projectId) {
  if (!projectId) return "BASE";
  let hash = 0;
  for (const char of String(projectId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 1296).toString(36).toUpperCase().padStart(2, "0");
}

function addTokenToFilename(name, token) {
  if (token === "BASE") return name;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${token}`;
  return `${name.slice(0, dot)}-${token}${name.slice(dot)}`;
}

/** 某员工的看板数据（指标 + 序列 + 真实产出文件 + 在制状态）。 */
export function memberDashboard(agentType, { teamLive, scale = 1, projectId = null, projectName = null } = {}) {
  const def = MEMBER_METRICS[agentType];
  if (!def) return null;
  const name = memberName(teamLive, agentType, agentType);
  let files = listFiles().filter((f) => f.createdBy === name);
  if (projectId) files = files.filter((f) => projectRecordMatches(f, { id: projectId, name: projectName }));
  const work = getWorkForProject(agentType, projectId);
  const projectToken = projectDataToken(projectId);
  const stats = def.stats.map((s) => ({
    ...s,
    value: typeof s.value === "number" && s.unit !== "%" ? Math.max(1, Math.round(s.value * scale)) : s.value
  }));
  // 真实产出并入：任务跑出来的文件直接反映到关键指标第一位之外，单列「任务产出文件」
  if (files.length) stats.push({ label: "任务产出文件", value: files.length, unit: "份", real: true });
  return {
    agentType,
    name,
    headline: def.headline,
    scale,
    projectId,
    projectName,
    projectToken,
    stats,
    series: def.series.map((s) => ({ ...s, values: s.values.map((v) => Math.max(1, Math.round(v * scale))) })),
    chartNote: def.chartNote,
    recentFiles: files.slice(0, 5).map((f) => ({ name: f.name, at: f.updated_at, real: true })),
    sampleOutputs: def.sampleOutputs.map((name) => addTokenToFilename(name, projectToken)),
    work: work ? { phase: work.phase, task: work.task, state: work.state } : null
  };
}

function partitionBreakdown(items, total) {
  let remaining = total;
  const allocated = items.map((item, index) => {
    const value = index === items.length - 1
      ? remaining
      : Math.min(remaining, Math.max(0, Math.round((total * item.ratio) / 100)));
    remaining -= value;
    return { ...item, value };
  });
  let ratioRemaining = 100;
  return allocated.map((item, index) => {
    const ratio = index === allocated.length - 1
      ? ratioRemaining
      : Math.min(ratioRemaining, Math.round((item.value / total) * 100));
    ratioRemaining -= ratio;
    return { ...item, ratio };
  });
}

function buildBreakdown(meta, dashboard, primaryValue) {
  const items = meta.breakdown.items;
  if (meta.breakdownMode === "partition-primary") return partitionBreakdown(items, primaryValue);
  if (meta.breakdownMode === "intent") {
    const high = dashboard.series[0].values.at(-1) || 0;
    const lower = dashboard.series[1].values.at(-1) || 0;
    const medium = Math.round(lower * 0.6);
    const values = [high, medium, lower - medium];
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    return items.map((item, index) => ({ ...item, value: values[index], ratio: Math.round((values[index] / total) * 100) }));
  }
  if (meta.breakdownMode === "funnel") {
    const touched = dashboard.series[0].values.at(-1) || 0;
    const replied = dashboard.series[1].values.at(-1) || 0;
    const upgraded = Math.max(1, Math.round(items[2].value * dashboard.scale));
    const values = [touched, replied, upgraded];
    return items.map((item, index) => ({
      ...item,
      value: values[index],
      ratio: touched ? Math.round((values[index] / touched) * 100) : 0
    }));
  }
  const scaled = items.map((item) => ({ ...item, value: Math.max(1, Math.round(item.value * dashboard.scale)) }));
  const baseline = scaled[0].value || 1;
  return scaled.map((item, index) => ({
    ...item,
    ratio: index === 0 ? 100 : Math.round((item.value / baseline) * 100)
  }));
}

/** Shape existing employee metrics into an outcome-first presentation without inventing new business data. */
export function memberResultStory(dashboard) {
  const meta = RESULT_STORIES[dashboard?.agentType];
  if (!meta) return null;
  const series = dashboard.series?.[meta.seriesIndex] || dashboard.series?.[0];
  const values = series?.values || [];
  const current = values.at(-1) || 0;
  const previous = values.at(-2) || 0;
  const delta = previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : 0;
  const projectToken = dashboard.projectToken || "BASE";
  const rotation = projectToken === "BASE" ? 0 : parseInt(projectToken, 36) % meta.records.items.length;
  const records = meta.records.items
    .slice(rotation)
    .concat(meta.records.items.slice(0, rotation))
    .map((item) => ({
      ...item,
      meta: projectToken === "BASE" ? item.meta : `${item.meta} · 批次 ${projectToken}`
    }));
  return {
    kicker: meta.kicker,
    primary: { label: meta.primaryLabel, value: current, unit: meta.primaryUnit },
    delta,
    breakdown: {
      title: meta.breakdown.title,
      items: buildBreakdown(meta, dashboard, current)
    },
    records: { title: meta.records.title, items: records },
    proof: (dashboard.stats || []).slice(0, 3)
  };
}

/** Combine all employee output in a room into one project-level result board. */
export function projectResultDashboard(room, { teamLive } = {}) {
  if (!room?.id) return null;
  const scale = projectScale(room);
  const members = roomDashboardMembers(room)
    .map((agentType) => memberDashboard(agentType, {
      teamLive,
      scale,
      projectId: room.id,
      projectName: room.name
    }))
    .filter(Boolean);
  if (!members.length) return null;

  const tasks = projectTasks(room);
  const projectFiles = listFiles()
    .filter((file) => projectRecordMatches(file, room))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  const liveWorkOwner = members.find((dashboard) => dashboard.work && dashboard.work.state !== "done")
    || members.find((dashboard) => dashboard.work)
    || null;
  const liveWork = liveWorkOwner?.work ? { ...liveWorkOwner.work, agentType: liveWorkOwner.agentType } : null;
  const hasStructuredResults = tasks.some((task) => task.resultSnapshot && Array.isArray(task.resultSnapshot.metrics));
  if (tasks.length || projectFiles.length || liveWork) {
    return hasStructuredResults
      ? liveProjectDashboard(room, members, tasks, projectFiles, liveWork)
      : emptyProjectDashboard(room, members, tasks, projectFiles, liveWork);
  }

  const isDemoRoom = ["room-content", "seed-sales-ops"].includes(room.id) || /^room-leads(?:-|$)/.test(room.id);
  if (!isDemoRoom) return emptyProjectDashboard(room, members, tasks, projectFiles, liveWork);

  const byType = new Map(members.map((dashboard) => [dashboard.agentType, dashboard]));
  const storyFor = (agentType) => memberResultStory(byType.get(agentType));
  const primaryType = ["Browser Agent", "File Agent", "App Agent", "Search Agent", "Computer Agent"]
    .find((agentType) => byType.has(agentType));
  const primaryDashboard = byType.get(primaryType) || members[0];
  const primaryStory = memberResultStory(primaryDashboard);
  const browserStory = storyFor("Browser Agent");
  const searchStory = storyFor("Search Agent");
  const fileStory = storyFor("File Agent");
  const appStory = storyFor("App Agent");
  const salesFunnel = isSalesProject(room) ? salesFunnelSnapshot(members) : null;

  const stats = [];
  if (searchStory) stats.push({ label: "今日高意向", value: searchStory.primary.value, unit: searchStory.primary.unit });
  if (appStory) {
    const appDashboard = byType.get("App Agent");
    stats.push(
      { label: "今日触达", value: appDashboard.series[0].values.at(-1), unit: "人" },
      { label: "今日回复", value: appDashboard.series[1].values.at(-1), unit: "人" }
    );
  }
  if (fileStory && stats.length < 3) stats.push(fileStory.proof[1]);
  for (const item of primaryStory.proof) {
    if (stats.length >= 3) break;
    if (!stats.some((stat) => stat.label === item.label)) stats.push(item);
  }

  const outputs = projectFiles.length
    ? projectFiles.slice(0, 5).map((file) => ({
      name: file.name,
      at: file.updated_at || file.created_at || null,
      owner: file.createdBy || "项目组",
      real: true
    }))
    : members.flatMap((dashboard) => dashboard.sampleOutputs.slice(0, 2).map((name) => ({
      name,
      at: null,
      owner: dashboard.name,
      agentType: dashboard.agentType,
      real: false
    }))).slice(0, 5);

  const series = [];
  const addSeries = (agentType, seriesIndex, label) => {
    const item = byType.get(agentType)?.series?.[seriesIndex];
    if (item) series.push({ ...item, label });
  };
  let chartNote = primaryDashboard.chartNote;
  if (primaryDashboard.agentType === "Browser Agent") {
    addSeries("Browser Agent", 0, "新增潜客");
    addSeries("Search Agent", 0, "高意向客户");
    chartNote = "近 14 天潜客转化趋势";
  } else if (primaryDashboard.agentType === "File Agent") {
    addSeries("File Agent", 0, "内容交付");
    chartNote = "近 14 天内容交付趋势";
  } else if (primaryDashboard.agentType === "App Agent") {
    addSeries("App Agent", 0, "客户触达");
    addSeries("App Agent", 1, "客户回复");
    chartNote = "近 14 天客户触达趋势";
  } else if (primaryDashboard.agentType === "Search Agent") {
    addSeries("Search Agent", 0, "高意向客户");
    addSeries("Search Agent", 1, "可培育客户");
    chartNote = "近 14 天客户意向趋势";
  } else {
    addSeries(primaryDashboard.agentType, 0, primaryDashboard.series[0].label);
  }

  const activeMember = members.find((dashboard) => dashboard.work && dashboard.work.state !== "done")
    || members.find((dashboard) => dashboard.work)
    || primaryDashboard;
  const recordsStory = searchStory || fileStory || appStory || browserStory || primaryStory;
  if (salesFunnel) {
    return {
      projectId: room.id,
      projectName: room.name,
      dataState: "demo",
      dataSource: "demo-template",
      projectToken: primaryDashboard.projectToken,
      primary: salesFunnel.primary,
      delta: null,
      breakdown: { title: "销售转化漏斗", items: salesFunnel.items },
      records: salesRecords(members),
      stats: salesFunnel.stats,
      outputs,
      series: salesFunnel.series,
      chartNote: salesFunnel.chartNote,
      members: members.map((dashboard) => ({ agentType: dashboard.agentType, name: dashboard.name, work: dashboard.work })),
      work: activeMember.work,
      cloudAgentType: activeMember.agentType
    };
  }
  return {
    projectId: room.id,
    projectName: room.name,
    dataState: "demo",
    dataSource: "demo-template",
    projectToken: primaryDashboard.projectToken,
    primary: primaryStory.primary,
    delta: primaryStory.delta,
    breakdown: (browserStory || fileStory || primaryStory).breakdown,
    records: recordsStory.records,
    stats: stats.slice(0, 3),
    outputs,
    series: series.slice(0, 2),
    chartNote,
    members: members.map((dashboard) => ({
      agentType: dashboard.agentType,
      name: dashboard.name,
      work: dashboard.work
    })),
    work: activeMember.work,
    cloudAgentType: activeMember.agentType
  };
}

/** Build a compact text equivalent for chart series. */
export function chartSeriesSummary(series) {
  if (!Array.isArray(series) || !series.length) return "暂无趋势数据";
  const days = Math.max(...series.map((item) => item.values?.length || 0), 0);
  const details = series.map((item) => `${item.label}：${(item.values || []).join("、")}`).join("；");
  return `过去 ${days} 天。${details}`;
}

/** 团队总览四个大盘数字（序列合计 + 真实完成任务数）。scale/projectName 用于按项目组折算与过滤。 */
export function teamOverview({ scale = 1, projectId = null, projectName = null } = {}) {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  let tasks = listTasks();
  if (projectId) tasks = tasks.filter((t) => projectRecordMatches(t, { id: projectId, name: projectName }));
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const runningTasks = tasks.filter((t) => t.status !== "done").length;
  const hunter = MEMBER_METRICS["Browser Agent"].series[0].values;
  return [
    { label: "累计线索", value: Math.round(sum(hunter) * scale), unit: "条", sub: `今日 +${Math.max(1, Math.round(hunter.at(-1) * scale))}` },
    { label: "内容产出", value: Math.round(sum(MEMBER_METRICS["File Agent"].series[0].values) * scale), unit: "篇", sub: "一次通过率 84%" },
    { label: "累计触达", value: Math.round(sum(MEMBER_METRICS["App Agent"].series[0].values) * scale), unit: "人次", sub: "回复率 22.7%" },
    { label: "完成任务", value: doneTasks, unit: "个", sub: runningTasks ? `${runningTasks} 个进行中` : "全部已交付", real: true }
  ];
}
