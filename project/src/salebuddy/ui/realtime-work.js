import { openPage, el } from "./pages.js";
import { clearNavigationRoute, persistNavigationRoute } from "./navigation-routes.js";
import { grokStateForTeamStatus, mountGrokBotAvatar } from "./grok-bot-avatar.js";
import { onboardingMatchFromStorage } from "../onboarding/matching.js";
import { openDouyinAuthorization } from "./douyin-auth.js";
import {
  buildDouyinAcquisitionAccountCapabilityMatrix,
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  GOLD_CUSTOMER_SERVICE_AGENT_ID,
  DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS,
  MARKETPLACE_STANDALONE_AGENT_IDS,
  MARKETPLACE_LATEST_AGENT_IDS,
  getMarketplaceAgent
} from "../agents/marketplace.js";
import { listWorks, subscribeWork } from "../agents/work-live.js";
import { normalizeAcquisitionTaskStatus } from "../agents/acquisition-contract.js";
import { receptionBaseUrl, receptionRequest } from "../bridge/account-reception-client.js";
import { listOfficeReplay, loadOfficeReplayVideo, markOfficeReplayTask, saveOfficeReplaySnapshot, saveOfficeReplayVideo } from "../bridge/office-work-replay.js";

const PROSPECT_AVATAR_SPRITE = new URL("../../../assets/prospect-avatar-sprite.png", import.meta.url).href;
const DOUYIN_ACCOUNT_AVATAR_IMAGES = Object.freeze({
  goods: new URL("../../../assets/accounts/store-avatar-goods.png", import.meta.url).href,
  home: new URL("../../../assets/accounts/store-avatar-home.png", import.meta.url).href,
  select: new URL("../../../assets/accounts/store-avatar-select.png", import.meta.url).href
});
const DOUYIN_LIVE_ROOM_IMAGE = new URL("../../../assets/douyin-discovery-live.png", import.meta.url).href;
const PUBLIC_TASK_EMPTY_ILLUSTRATION = new URL("../../../assets/icon-none-CLa_dC9J.svg", import.meta.url).href;
const REALTIME_MOCK_LIVE_ROOM_IMAGES = Object.freeze({
  automotive: DOUYIN_LIVE_ROOM_IMAGE,
  education: new URL("../../../assets/live-commerce-intent.png", import.meta.url).href,
  home: new URL("../../../assets/ecommerce-discovery-live.png", import.meta.url).href
});
const DEMO_PROSPECT_AVATARS = Object.freeze([
  new URL("../../../assets/agents/human/generated-avatar-v2-01.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-03.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-05.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-06.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-07.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-08.png", import.meta.url).href
]);

export function realtimeWorkPreviewMode(search = globalThis.location?.search, { hostname = globalThis.location?.hostname } = {}) {
  const params = new URLSearchParams(String(search || ""));
  const explicitPreview = params.get("preview") === "style";
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  const localHost = !normalizedHost || normalizedHost === "localhost" || normalizedHost === "127.0.0.1" || normalizedHost === "::1";
  const configuredPreview = globalThis.__SALEBUDDY_CONFIG__?.allowStylePreview === true;
  return explicitPreview && (localHost || configuredPreview) ? "style" : "";
}

const REALTIME_MOCK_ACCOUNT_SCENARIOS = Object.freeze([
  {
    id: "mock-account-automotive",
    name: "臻选新能源 · 上海",
    handle: "@zhenxuan_ev_sh",
    avatar: DOUYIN_ACCOUNT_AVATAR_IMAGES.goods,
    mockScenario: "automotive"
  },
  {
    id: "mock-account-education",
    name: "启航升学规划",
    handle: "@qihang_plan",
    avatar: DOUYIN_ACCOUNT_AVATAR_IMAGES.select,
    mockScenario: "education"
  },
  {
    id: "mock-account-home",
    name: "木作生活研究所",
    handle: "@muzuo_home",
    avatar: DOUYIN_ACCOUNT_AVATAR_IMAGES.home,
    mockScenario: "home"
  }
]);

export function createRealtimeMockPreviewAccounts() {
  return REALTIME_MOCK_ACCOUNT_SCENARIOS.map((scenario) => ({
    ...scenario,
    status: "模拟运行中",
    phase: "模拟任务运行中",
    computer: "模拟在线",
    source: "mock",
    accountKey: scenario.id,
    agentIds: [...MARKETPLACE_LATEST_AGENT_IDS],
    agents: MARKETPLACE_LATEST_AGENT_IDS.length,
    capabilityMatrix: buildDouyinAcquisitionAccountCapabilityMatrix({
      agentIds: DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS
    }),
    mock: true
  }));
}

function createRealtimeStylePreviewAccount() {
  return createRealtimeMockPreviewAccounts()[0];
}

const AGENT_LIVE_CONFIG = Object.freeze([
  {
    id: "main", phase: "总控", role: "总控 · 任务编排", task: "拆解当前获客目标",
    action: "确认找人 → 分析 → 触达工作流", input: "用户目标 + 业务类型", output: "执行计划 · 风险边界", handoff: "获客策略师", tool: "strategy_brief / task_planner", status: "working", progress: 86,
    steps: ["读取用户目标", "拆解执行阶段", "分配 Agent 与验收标准"]
  },
  {
    id: "Strategy Agent", phase: "找人", role: "找人 · 获客策略", task: "把行业目标转成可检索画像",
    action: "选择抖音评论、粉丝和直播来源", input: "目标客户 + 行业场景", output: "客户画像 · 意向信号 · 筛选条件", handoff: "潜客挖掘员", tool: "market_map / segment_builder", status: "working", progress: 78,
    steps: ["定义客户画像", "匹配公开来源", "确定时间范围与任务规模"]
  },
  {
    id: "Browser Agent", phase: "找人", role: "找人 · 公开线索发现", task: "扫描公开内容与互动中的线索",
    action: "采集账号、评论、直播互动并保留来源", input: "抖音公开视频与互动", output: "候选线索 · 来源证据", handoff: "线索分析师", tool: "web_search / spider.comments / source_log", status: "working", progress: 74,
    steps: ["发现视频与账号", "采集评论和粉丝", "验证身份并保留来源"]
  },
  {
    id: "Search Agent", phase: "分析", role: "分析 · 线索质量判断", task: "合并重复账号并筛选高意向客户",
    action: "去重、评分并解释每条线索的优先级", input: "候选线索 + 行为证据", output: "意向评分 · A/B 优先级 · 数据风险", handoff: "客户画像研究员", tool: "lead.normalize / lead.score / dedupe_review", status: "waiting", progress: 0,
    steps: ["合并重复账号", "计算意向评分", "输出可解释优先级"]
  },
  {
    id: "Research Agent", phase: "分析", role: "分析 · 客户画像分析", task: "整理主页、作品和互动中的需求信号",
    action: "提炼购买动机、切入点和信息缺口", input: "高意向候选 + 公开资料", output: "Prospect Brief · 购买信号 · 信息缺口", handoff: "触达策略师", tool: "account_research / signal_extraction / brief_writer", status: "working", progress: 57,
    steps: ["补全客户画像", "提炼需求与切入点", "生成可追溯客户简报"]
  },
  {
    id: "App Agent", phase: "触达", role: "触达 · 首触策略设计", task: "为高意向客户生成首轮触达策略",
    action: "按证据生成个性化私信与触达批次", input: "Prospect Brief + 触达目标", output: "触达顺序 · 首触草稿 · 审批项", handoff: "风控专员", tool: "sales_strategy / approval_policy", status: "waiting", progress: 0,
    steps: ["选择触达方式", "生成个性化首触", "提交风险校验与审批"]
  },
  {
    id: "Risk Agent", phase: "触达", role: "触达 · 风险与权限校验", task: "检查重复触达、冷却期和账号权限",
    action: "判断允许、延迟、修改或拦截触达", input: "首触草稿 + 历史触达记录", output: "风险结论 · 频控结果 · 放行清单", handoff: "外联专员", tool: "policy.check / cooldown_review", status: "waiting", progress: 34,
    steps: ["检查重复与冷却期", "核验权限和勿扰状态", "给出放行或拦截理由"]
  },
  {
    id: "Outreach Agent", phase: "触达", role: "触达 · 执行私信评论", task: "执行已批准的私信和评论动作",
    action: "按批准版本逐条发送并记录平台结果", input: "风控放行清单 + 已批准内容", output: "提交记录 · 送达结果 · 失败原因", handoff: "触达运营专员", tool: "douyin.rpa / outreach_execution", status: "waiting", progress: 21,
    steps: ["领取批准批次", "执行私信与评论", "记录送达或失败结果"]
  },
  {
    id: "Outreach Ops Agent", phase: "触达", role: "触达 · 队列与结果运营", task: "管理批次、失败重试和回复回流",
    action: "监听回复并在有效反馈后停止后续计划", input: "执行日志 + 平台回复事件", output: "队列状态 · 重试记录 · 回复信号", handoff: "幕僚长", tool: "outreach_queue / retry_policy / reply_listener", status: "waiting", progress: 15,
    steps: ["管理发送队列", "处理失败与暂停恢复", "回流回复并结束后续计划"]
  }
]);

const AGENT_CONTEXT = Object.freeze({
  main: { prospect: "当前获客任务", source: "用户目标 · 任务编排", score: "--", activity: "等待团队执行结果" },
  "Strategy Agent": { prospect: "目标客户画像", source: "业务类型 · 当前目标", score: "--", activity: "正在定义筛选条件" },
  "Browser Agent": { prospect: "待验证潜客", source: "公开内容 · 实时发现", score: "--", activity: "持续采集公开内容与互动信号" },
  "Search Agent": { prospect: "待评分潜客", source: "候选线索 · 去重分析", score: "92", activity: "正在合并账号并判断意向" },
  "Research Agent": { prospect: "待补全潜客", source: "公开资料 · 画像分析", score: "86", activity: "正在提炼需求与切入点" },
  "App Agent": { prospect: "待触达潜客", source: "画像简报 · 首触策略", score: "84", activity: "等待触达策略确认" },
  "Risk Agent": { prospect: "待校验触达", source: "历史记录 · 风控校验", score: "79", activity: "正在检查重复触达与权限" },
  "Outreach Agent": { prospect: "待执行批次", source: "批准清单 · 平台触达", score: "81", activity: "等待平台返回执行结果" },
  "Outreach Ops Agent": { prospect: "触达执行队列", source: "发送队列 · 回复监听", score: "--", activity: "监听回复并准备停止后续计划" }
});

const AGENT_METRICS = Object.freeze({
  main: ["231", "185", "72", "9", "68%"],
  "Strategy Agent": ["231", "185", "72", "9", "78%"],
  "Browser Agent": ["231", "148", "12", "0", "74%"],
  "Search Agent": ["218", "185", "72", "9", "64%"],
  "Research Agent": ["185", "126", "58", "9", "57%"],
  "App Agent": ["72", "72", "36", "9", "49%"],
  "Risk Agent": ["36", "36", "28", "4", "34%"],
  "Outreach Agent": ["28", "28", "24", "16", "21%"],
  "Outreach Ops Agent": ["16", "16", "16", "12", "15%"]
});

// Each role reports the units that matter to its own work instead of reusing the global funnel KPIs.
const AGENT_KPI_SETS = Object.freeze({
  main: [["任务阶段", "3", "已拆解", "找人 → 分析 → 触达"], ["团队输入", "9", "个 Agent", "实时协作"], ["高意向线索", "47", "+8", "等待触达"], ["待决策项", "4", "需确认", "风险与权限"], ["整体完成", "68%", "", "当前任务"]],
  "Strategy Agent": [["画像版本", "4", "+1", "本轮任务"], ["来源渠道", "3", "已匹配", "评论 · 粉丝 · 直播"], ["筛选条件", "12", "条", "地域 · 需求 · 意向"], ["任务规模", "500", "目标", "候选账号"], ["完成度", "78%", "", "当前策略"]],
  "Browser Agent": [["已发现账号", "231", "+18", "过去 24 小时"], ["互动证据", "3,842", "+216", "评论 · 粉丝 · 直播"], ["购买表达", "68", "+9", "预算 / 品类 / 购买时间"], ["待分析", "47", "条", "已保留来源"], ["完成度", "74%", "", "当前找人任务"]],
  "Search Agent": [["候选线索", "214", "+18", "已去重"], ["A 级线索", "47", "+8", "优先触达"], ["判断一致率", "92.5%", "+1.8%", "抽检 40 条"], ["证据不足", "6", "条", "暂不触达"], ["完成度", "64%", "", "当前分析任务"]],
  "Research Agent": [["已补全画像", "126", "+12", "主页 · 作品"], ["需求信号", "58", "+7", "已提炼"], ["信息缺口", "19", "条", "待二次研究"], ["客户简报", "36", "份", "可交接"], ["完成度", "57%", "", "当前研究任务"]],
  "App Agent": [["待触达客户", "72", "+12", "A / B 级"], ["首触草稿", "36", "份", "已生成"], ["待审批", "9", "批", "等待风控"], ["策略覆盖", "4", "类", "价格 · 品类 · 使用场景"], ["完成度", "49%", "", "当前策略任务"]],
  "Risk Agent": [["待校验批次", "9", "批", "触达前"], ["已拦截", "4", "条", "重复 / 冷却期"], ["已放行", "28", "条", "可执行"], ["待确认权限", "3", "项", "账号状态"], ["完成度", "34%", "", "当前风控任务"]],
  "Outreach Agent": [["已触达客户", "31", "+7", "本轮批次"], ["送达成功", "28", "条", "平台已回执"], ["有效回复", "12", "+4", "进入跟进"], ["待重试", "3", "条", "账号限流"], ["完成度", "21%", "", "当前执行任务"]],
  "Outreach Ops Agent": [["发送队列", "16", "条", "当前批次"], ["已完成", "12", "+3", "已记录回执"], ["待重试", "3", "条", "自动排队"], ["新回复", "5", "条", "待回流"], ["完成度", "15%", "", "当前运营任务"]]
});

const AGENT_OUTPUTS = Object.freeze({
  main: {
    kind: "orchestration",
    title: "团队编排进度",
    subtitle: "幕僚长正在把获客目标拆成可执行、可验收的协作节点。",
    rows: [
      ["目标拆解", "找人 → 分析 → 触达", "已发布 3 个阶段和验收标准", "执行中"],
      ["团队分工", "9 个 Agent", "已分配输入、交接人和风险边界", "已同步"],
      ["待决策项", "4 个协作节点", "需要确认触达窗口与权限", "待确认"]
    ]
  },
  "Strategy Agent": {
    kind: "strategy",
    title: "获客策略产出",
    subtitle: "策略师把业务目标转换成找人任务包，供后续 Agent 直接执行。",
    rows: [
      ["客户画像", "日常好物购买者", "品类、预算、使用场景和购买时间", "已生成"],
      ["来源组合", "评论 · 粉丝 · 直播间", "覆盖公开讨论和实时互动场景", "已匹配"],
      ["筛选规则", "12 条条件", "地域、需求、意向和时间窗口", "待下发"]
    ]
  },
  "Browser Agent": {
    kind: "discovery",
    title: "来源采集进度",
    subtitle: "围绕商品视频、直播互动和账号主页，持续汇总可追溯的商品线索。",
    rows: [
      ["商品视频", "18 条购买表达", "视频评论 · 保留原文与时间", "抓取中"],
      ["直播间互动", "32 个预算信号", "直播弹幕 · 已完成去重", "已记录"],
      ["账号主页", "12 个待验证账号", "主页与粉丝 · 等待补看", "验证中"]
    ]
  },
  "Search Agent": {
    kind: "analysis",
    title: "线索分析结果",
    subtitle: "每条评分都关联来源证据和判断理由。",
    rows: [
      ["小雨今天喝拿铁", "92 · A 级", "本周想入手 + 预算明确", "优先触达"],
      ["阿泽的咖啡日记", "88 · A 级", "在对比机型 + 已问到货", "优先触达"],
      ["冰美式不加糖", "68 · B 级", "询问颜色，购买时间不明", "待复核"],
      ["Lily 的生活碎片", "42 · C 级", "浏览内容，暂无明确需求", "暂不触达"]
    ]
  },
  "Research Agent": {
    kind: "research",
    title: "客户分析产出",
    subtitle: "已将公开资料整理成可交接的客户简报。",
    rows: [
      ["小雨今天喝拿铁", "购买阶段", "已收藏 · 本周入手", "已补全"],
      ["阿泽的咖啡日记", "需求切入", "预算 1,500 · 对比机型", "已补全"],
      ["Lily 的生活碎片", "信息缺口", "使用场景与购买时间", "待补充"]
    ]
  },
  "App Agent": {
    kind: "campaign",
    title: "首触策略产出",
    subtitle: "触达策略师按客户证据编排首触内容、渠道和审批节点。",
    rows: [
      ["小雨今天喝拿铁", "私信首触", "围绕到货时间和使用场景切入", "待风控"],
      ["阿泽的咖啡日记", "评论后私信", "先确认预算，再发送机型对比", "已生成"],
      ["冰美式不加糖", "暂缓触达", "缺少明确购买时间，避免过早打扰", "需补证据"]
    ]
  },
  "Risk Agent": {
    kind: "risk",
    title: "触达风控结果",
    subtitle: "风控专员在发送前检查重复触达、冷却期和账号权限。",
    rows: [
      ["小雨今天喝拿铁", "重复检查", "近 7 天无触达记录，允许进入批次", "已放行"],
      ["阿泽的咖啡日记", "权限校验", "账号状态正常，未命中勿扰规则", "已放行"],
      ["冰美式不加糖", "冷却期检查", "近期已收到同类内容，建议延迟 24 小时", "已拦截"]
    ]
  },
  "Outreach Agent": {
    kind: "outreach",
    title: "触达执行记录",
    subtitle: "点击任意客户，查看实际发送内容和平台回执。",
    rows: [
      ["小雨今天喝拿铁", "想先了解下到货和保修吗？", "已送达 · 等待回复", "10:14"],
      ["阿泽的咖啡日记", "你更关注研磨细度还是清洁方便？", "已回复 · 进入跟进", "10:26"],
      ["Lily 的生活碎片", "方便说下平时几个人使用吗？", "已送达 · 未读", "10:42"],
      ["冰美式不加糖", "你更喜欢奶油白还是雾霾绿？", "等待重试", "11:03"]
    ]
  },
  "Outreach Ops Agent": {
    kind: "queue",
    title: "触达队列与回复回流",
    subtitle: "统一处理送达回执、失败重试和客户回复。",
    rows: [
      ["小雨今天喝拿铁", "已回复", "转交触达策略师", "刚刚"],
      ["阿泽的咖啡日记", "已送达", "等待客户回复", "2 分钟前"],
      ["冰美式不加糖", "限流重试", "已排入下一批次", "5 分钟前"]
    ]
  }
});

const AGENT_WORK_UNITS = Object.freeze({
  main: { title: "协作节点", subtitle: "当前编排", rows: [["目标拆解", "找人 → 分析 → 触达", "执行中"], ["团队分工", "9 个 Agent 已接入", "已同步"], ["待决策项", "触达窗口与权限", "待确认"]] },
  "Strategy Agent": { title: "策略任务包", subtitle: "画像与来源", rows: [["客户画像", "日常好物购买者", "已生成"], ["来源组合", "评论 · 粉丝 · 直播间", "已匹配"], ["筛选规则", "12 条条件待下发", "待处理"]] },
  "Browser Agent": { title: "来源采集队列", subtitle: "公开内容", rows: [["评论区", "采集需求表达与账号", "抓取中"], ["直播间", "保留互动时间与原文", "已记录"], ["账号主页", "验证身份与近期内容", "验证中"]] },
  "Search Agent": { title: "待评分线索", subtitle: "质量判断", rows: [["已挖掘线索", "214 条公开来源候选", "已接收"], ["去重与合并", "账号、昵称、主页链接", "处理中"], ["意向信号分析", "预算、品类、购买时间", "评分中"], ["优先级分层", "A / B / C 级客户列表", "持续输出"]] },
  "Research Agent": { title: "客户分析队列", subtitle: "画像补全", rows: [["小雨今天喝拿铁", "整理主页与购买阶段", "补全中"], ["阿泽的咖啡日记", "提炼预算与品类偏好", "待分析"], ["Lily 的生活碎片", "补充使用场景与时间", "缺信息"]] },
  "App Agent": { title: "首触审批队列", subtitle: "触达策略", rows: [["小雨今天喝拿铁", "生成到货时间首触", "待风控"], ["阿泽的咖啡日记", "安排评论后私信", "已生成"], ["冰美式不加糖", "等待补充购买时间", "暂缓"]] },
  "Risk Agent": { title: "风控待审", subtitle: "发送前检查", rows: [["小雨今天喝拿铁", "重复触达与冷却期", "已放行"], ["阿泽的咖啡日记", "账号权限与勿扰状态", "已放行"], ["冰美式不加糖", "同类内容冷却 24 小时", "已拦截"]] },
  "Outreach Agent": { title: "发送批次", subtitle: "平台执行", rows: [["首触批次 · 09", "私信与评论逐条发送", "执行中"], ["送达回执", "等待平台返回状态", "监听中"], ["失败记录", "账号限流自动重试", "3 条"]] },
  "Outreach Ops Agent": { title: "回复回流队列", subtitle: "触达运营", rows: [["新回复", "转交触达策略师", "5 条"], ["待跟进", "等待下一步动作", "12 条"], ["失败重试", "排入下一发送窗口", "3 条"]] }
});

const LIVE_COMMERCE_AGENT_OVERRIDES = Object.freeze({
  "Browser Agent": {
    task: "从直播间停留、提问和商品点击中筛选潜客",
    action: "采集直播互动并保留场次、原话和商品证据",
    input: "直播间互动 + 商品点击",
    output: "直播潜客 · 互动证据",
    handoff: "直播意向分析师",
    steps: ["锁定重点直播场次", "筛除抽奖与刷屏互动", "保留购买表达和时间证据"],
    context: { prospect: "直播间高意向观众", source: "直播互动 · 商品点击", score: "--", activity: "正在捕捉提问、预算和购买时间" },
    metrics: ["126", "3,842", "68", "18", "74%"]
  },
  "Search Agent": {
    task: "按用户互动证据判断直播购买意向",
    action: "合并观众行为，输出高、中、低意向表单",
    input: "直播潜客 + 互动原话",
    output: "意向等级 · 判断理由",
    handoff: "直播转化顾问",
    steps: ["合并观众与场次", "提取预算和购买时间", "输出高低意向等级"],
    context: { prospect: "待评分直播观众", source: "直播间互动 · 商品证据", score: "92", activity: "正在判断购买时间和商品匹配度" },
    metrics: ["126", "34", "92", "6", "64%"]
  },
  "App Agent": {
    task: "为直播高意向观众设计首轮沟通",
    action: "围绕用户提问和商品场景生成首触策略",
    input: "观众意向表单 + 直播上下文",
    output: "直播首触策略 · 审批项",
    handoff: "直播触达专员",
    steps: ["还原直播提问", "设计承接话术", "提交触达审批"],
    context: { prospect: "待承接直播潜客", source: "直播意向表单 · 首触策略", score: "88", activity: "正在围绕用户原问题生成回复" },
    metrics: ["34", "18", "6", "3", "49%"]
  }
});

const LIVE_COMMERCE_OUTPUTS = Object.freeze({
  "Browser Agent": {
    kind: "discovery",
    title: "直播互动入池",
    subtitle: "按场次保留直播互动、商品和原话证据，交给意向分析师判断。",
    rows: [
      ["小满的家居日常", "询问补货时间", "直播弹幕 · 20:14 · 商品卡点击 3 次", "已记录"],
      ["小满的好物小铺", "这款适合小户型吗？", "直播评论 · 20:09 · 停留 8 分钟", "抓取中"],
      ["小满的生活选物", "想看真实上身效果", "直播间 · 19:58 · 关注账号", "待验证"]
    ]
  },
  "Search Agent": {
    kind: "analysis",
    title: "直播意向结果",
    subtitle: "保留账号、作品、评论和互动证据，整理可回查的分析结论。",
    rows: [
      ["小雨今天喝拿铁", "92 · A 级", "问到货时间 + 预算明确 + 直播停留 12 分钟", "优先触达"],
      ["阿泽的咖啡日记", "88 · A 级", "连续追问优惠 + 点击商品卡", "优先触达"],
      ["冰美式不加糖", "68 · B 级", "询问颜色，购买时间不明", "待补证据"],
      ["Lily 的生活碎片", "42 · C 级", "仅浏览直播切片，暂无购买表达", "暂不触达"]
    ]
  },
  "App Agent": {
    kind: "outreach",
    title: "直播首触策略",
    subtitle: "根据观众在直播间的原问题生成承接话术，并交给触达专员审批。",
    rows: [
      ["小雨今天喝拿铁", "想先了解下到货和保修吗？", "待风控", "刚刚"],
      ["阿泽的咖啡日记", "刚才你问的发货时间，我整理了可选方案。", "已生成", "2 分钟前"],
      ["冰美式不加糖", "你更关注颜色还是容量？", "需补证据", "5 分钟前"]
    ]
  }
});

const LIVE_COMMERCE_WORK_UNITS = Object.freeze({
  "Browser Agent": { title: "直播观众入池", subtitle: "实时互动", rows: [["重点直播场次", "正在监听提问、停留和商品点击", "进行中"], ["购买表达", "预算 · 品类 · 到货时间", "持续捕捉"], ["来源证据", "场次、时间、原话和商品", "已保留"]] },
  "Search Agent": { title: "待分析对象", subtitle: "综合分析", rows: [["已找到对象", "账号、作品、评论和互动数据", "已接收"], ["内容与互动", "整理来源和关键事实", "处理中"], ["分析结论", "重点发现与待确认信息", "分析中"], ["结果整理", "输出可回查的分析结果", "持续输出"]] },
  "App Agent": { title: "首触交接队列", subtitle: "直播转化", rows: [["高意向观众", "围绕原问题生成首触", "待风控"], ["待承接回复", "到货、优惠和使用场景", "已生成"], ["低意向观众", "等待补充购买证据", "暂缓"]] }
});

const AGENTS_PER_ACCOUNT = 3;

const REALTIME_MOCK_AUTOMOTIVE_SOURCE_PROFILES = Object.freeze([
  { type: "live", channel: "live", label: "直播间", title: "新能源车型直播间", reference: "直播弹幕E300" },
  { type: "comment", channel: "comment", label: "作品评论", title: "新能源车型介绍 · 作品评论", reference: "作品评论E301" },
  { type: "interaction", channel: "interaction", label: "互动通知", title: "账号互动通知", reference: "互动通知E302" },
  { type: "comment", channel: "comment", label: "作品评论", title: "购车成本讲解 · 作品评论", reference: "作品评论E303" },
  { type: "live", channel: "live", label: "直播间", title: "新能源车型直播间", reference: "直播弹幕E304" },
  { type: "interaction", channel: "interaction", label: "互动通知", title: "试驾预约互动通知", reference: "互动通知E305" }
]);

const DOUYIN_CLOUD_AGENT_IDS = new Set(["mkt-comment-acquisition", "mkt-find-people", "mkt-intent-analyst", "mkt-cold-writer", "mkt-dm-inbox", GOLD_CUSTOMER_SERVICE_AGENT_ID, "mkt-live-danmaku-analysis", "mkt-live-danmaku-outreach"]);
const ACQUISITION_REALTIME_AGENT_IDS = new Set(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
const STANDALONE_REALTIME_AGENT_IDS = new Set(MARKETPLACE_STANDALONE_AGENT_IDS);
const LEGACY_ACQUISITION_REALTIME_AGENT_IDS = new Set(["mkt-live-lead-miner"]);
const REALTIME_MOCK_SPECIALIST_DEFINITIONS = Object.freeze([
  {
    id: "find-people",
    agentType: "mkt-find-people",
    phase: "潜客搜寻",
    task: "从评论、直播和互动中整理符合条件的人",
    activities: ["正在归集评论、直播和互动来源", "已保留候选人和原始证据"]
  },
  {
    id: "intent-analysis",
    agentType: "mkt-intent-analyst",
    phase: "意向分析",
    task: "依据原始证据判断候选人的意向和下一步",
    activities: ["正在归纳账号、评论和互动事实", "分析结论已同步到候选人队列"]
  },
  {
    id: "outreach",
    agentType: "mkt-cold-writer",
    phase: "私信触达",
    task: "根据已批准的候选名单执行首次私信",
    activities: ["正在核对名单和发送账号", "逐条等待平台发送结果"]
  },
  {
    id: "conversation",
    agentType: "mkt-dm-inbox",
    phase: "客服转化",
    task: "承接收到的私信并标记需要人工处理的会话",
    activities: ["持续读取新会话", "按策略自动回复并保留人工接管边界"]
  },
  {
    id: "gold-customer-service",
    agentType: GOLD_CUSTOMER_SERVICE_AGENT_ID,
    phase: "金牌客服",
    task: "按用户设定目标完成私信对话",
    activities: ["持续读取新会话", "先回应当前问题，再推进与目标直接相关的动作并保留人工边界"]
  },
  {
    id: "live-danmaku-analysis",
    agentType: "mkt-live-danmaku-analysis",
    phase: "直播分析",
    task: "持续分析直播间新弹幕",
    activities: ["持续读取直播间新弹幕", "整理用户问题、需求信号和原始证据"]
  },
  {
    id: "live-danmaku-outreach",
    agentType: "mkt-live-danmaku-outreach",
    phase: "直播触达",
    task: "监听新弹幕并逐一发送首次私信",
    activities: ["持续读取直播间新弹幕", "逐一发送私信并归档平台回执"]
  },
  {
    id: "viral-work-analysis",
    agentType: "mkt-viral-work-analysis",
    phase: "作品分析",
    task: "拆解公开作品的内容结构与流量抓手",
    activities: ["读取公开作品内容与数据", "整理可验证的创作测试方向"]
  }
]);
const ACQUISITION_CLOUD_LABELS = Object.freeze({
  provisioning: "云电脑启动中",
  online: "云电脑 ready",
  connecting: "云电脑连接中",
  recovering: "云电脑恢复中",
  disconnected: "云电脑已断开",
  "auth-expired": "抖音授权已失效"
});
const ACQUISITION_TASK_LABELS = Object.freeze({ running: "任务运行中", paused: "任务已暂停", degraded: "任务降级运行", error: "任务异常", stopped: "任务已停止", configuring: "任务配置中" });

export function createRealtimeMockAcquisitionWork(account = {}) {
  const accountId = String(account.id || "mock-douyin-account");
  const accountLabel = String(account.name || "一以万真");
  const accountKey = douyinAccountWorkKey(account.identity, accountId);
  const leads = [
    {
      leadId: "mock-lead-shanghai-zhou",
      nickname: "上海周先生",
      avatar: DEMO_PROSPECT_AVATARS[0],
      source: {
        type: "live",
        channel: "live",
        workTitle: "上海店现在有现车吗？",
        videoTitle: "新能源车型直播间",
        videoId: "mock-live-20260910-001",
        videoUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:18:24+08:00"
      },
      evidence: [{
        type: "live",
        quote: "上海店现在有现车吗？",
        sourceUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:18:24+08:00"
      }],
      intent: {
        tier: "high",
        score: 92,
        confidence: 0.94,
        reason: "直接询问现车，且持续追问价格与到店安排。",
        signals: ["询问现车", "追问价格", "关注到店安排"]
      }
    },
    {
      leadId: "mock-lead-hangzhou-lin",
      nickname: "杭州林女士",
      avatar: DEMO_PROSPECT_AVATARS[1],
      source: {
        type: "live",
        channel: "live",
        workTitle: "新能源车型直播间",
        videoId: "mock-live-20260910-001",
        videoUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:16:08+08:00"
      },
      evidence: [{
        type: "live",
        quote: "可以零首付分期吗？",
        sourceUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:16:08+08:00"
      }],
      intent: {
        tier: "high",
        score: 86,
        confidence: 0.88,
        reason: "主动询问付款方式，具备明确的购车决策信号。",
        signals: ["询问分期", "关注首付", "正在比较方案"]
      }
    },
    {
      leadId: "mock-lead-suzhou-chen",
      nickname: "苏州陈先生",
      avatar: DEMO_PROSPECT_AVATARS[2],
      source: {
        type: "live",
        channel: "live",
        workTitle: "新能源车型直播间",
        videoId: "mock-live-20260910-001",
        videoUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:12:42+08:00"
      },
      evidence: [{
        type: "live",
        quote: "这是电还是油？",
        sourceUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:12:42+08:00"
      }],
      intent: {
        tier: "medium",
        score: 71,
        confidence: 0.79,
        reason: "正在了解能源形式，暂时还没有明确的购买时间。",
        signals: ["询问能源形式", "了解产品基础信息"]
      }
    },
    {
      leadId: "mock-lead-shaoxing-tang",
      nickname: "绍兴唐女士",
      avatar: DEMO_PROSPECT_AVATARS[3],
      source: {
        type: "live",
        channel: "live",
        workTitle: "新能源车型直播间",
        videoId: "mock-live-20260910-001",
        videoUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:09:17+08:00"
      },
      evidence: [{
        type: "live",
        quote: "这个价格包含购置税吗？",
        sourceUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:09:17+08:00"
      }],
      intent: {
        tier: "high",
        score: 89,
        confidence: 0.91,
        reason: "主动确认落地价格，正在核对购车成本。",
        signals: ["询问购置税", "关注落地价", "比较购车成本"]
      }
    },
    {
      leadId: "mock-lead-jiaxing-zhou",
      nickname: "嘉兴周先生",
      avatar: DEMO_PROSPECT_AVATARS[4],
      source: {
        type: "live",
        channel: "live",
        workTitle: "新能源车型直播间",
        videoId: "mock-live-20260910-001",
        videoUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:05:33+08:00"
      },
      evidence: [{
        type: "live",
        quote: "有现车的话多久能提车？",
        sourceUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:05:33+08:00"
      }],
      intent: {
        tier: "high",
        score: 84,
        confidence: 0.86,
        reason: "明确询问提车周期，具备近期购买信号。",
        signals: ["询问提车周期", "关注现车", "近期购车"]
      }
    },
    {
      leadId: "mock-lead-ningbo-cheng",
      nickname: "宁波程女士",
      avatar: DEMO_PROSPECT_AVATARS[5],
      source: {
        type: "live",
        channel: "live",
        workTitle: "新能源车型直播间",
        videoId: "mock-live-20260910-001",
        videoUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:01:46+08:00"
      },
      evidence: [{
        type: "live",
        quote: "试驾需要提前预约吗？",
        sourceUrl: "https://www.douyin.com/video/mock-live-20260910-001",
        observedAt: "2026-09-10T10:01:46+08:00"
      }],
      intent: {
        tier: "medium",
        score: 76,
        confidence: 0.82,
        reason: "开始了解试驾流程，仍需继续确认购买计划。",
        signals: ["询问试驾", "关注到店流程"]
      }
    }
  ];
  const profileEvidence = [
    {
      recentComment: "有现车吗？",
      activeBehavior: "近期关注过 2 次汽车直播或短视频内容",
      followedBrands: "一汽丰田、广汽本田",
      vehiclePreference: "暂无发现明确的关注车型",
      cityRelation: "上海 · 同城潜客",
      storeConversation: "评论并未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    },
    {
      recentComment: "可以零首付分期吗？",
      activeBehavior: "近期连续浏览新能源车型和分期方案",
      followedBrands: "蔚来、特斯拉",
      vehiclePreference: "关注新能源 SUV",
      cityRelation: "杭州 · 同城潜客",
      storeConversation: "暂未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    },
    {
      recentComment: "这是电还是油？",
      activeBehavior: "近期浏览 1 次新能源车型内容",
      followedBrands: "暂无明确关注品牌",
      vehiclePreference: "正在了解能源形式",
      cityRelation: "苏州 · 异地潜客",
      storeConversation: "暂未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    },
    {
      recentComment: "这个价格包含购置税吗？",
      activeBehavior: "近期多次查看价格和购车成本内容",
      followedBrands: "广汽本田、比亚迪",
      vehiclePreference: "关注中型新能源 SUV",
      cityRelation: "绍兴 · 同城潜客",
      storeConversation: "暂未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    },
    {
      recentComment: "有现车的话多久能提车？",
      activeBehavior: "近期关注现车、提车周期相关内容",
      followedBrands: "暂无明确关注品牌",
      vehiclePreference: "暂无发现明确的关注车型",
      cityRelation: "嘉兴 · 同城潜客",
      storeConversation: "暂未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    },
    {
      recentComment: "试驾需要提前预约吗？",
      activeBehavior: "近期关注试驾流程和门店内容",
      followedBrands: "小鹏、理想",
      vehiclePreference: "关注纯电车型",
      cityRelation: "宁波 · 同城潜客",
      storeConversation: "暂未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    }
  ];
  leads.forEach((lead, index) => {
    const sourceProfile = REALTIME_MOCK_AUTOMOTIVE_SOURCE_PROFILES[index] || REALTIME_MOCK_AUTOMOTIVE_SOURCE_PROFILES[0];
    Object.assign(lead.source, {
      type: sourceProfile.type,
      channel: sourceProfile.channel,
      sourceLabel: sourceProfile.label,
      workTitle: sourceProfile.title,
      reference: sourceProfile.reference
    });
    Object.assign(lead.evidence[0], {
      type: sourceProfile.type,
      sourceLabel: sourceProfile.label,
      sourceReference: sourceProfile.reference
    });
    lead.recentComment = profileEvidence[index].recentComment;
    lead.profileEvidence = profileEvidence[index];
  });
  const approvalQueue = [
    {
      state: "delivered",
      lead: leads[0],
      content: "上海店现在有现车吗？",
      receipt: { state: "delivered", sentAt: "2026-09-10T10:19:06+08:00" }
    },
    {
      state: "sent",
      lead: leads[1],
      content: "可以帮你看看上海和杭州门店的分期方案。",
      receipt: { state: "sent", sentAt: "2026-09-10T10:18:41+08:00" }
    },
    {
      state: "submitted",
      lead: leads[2],
      content: "这款是纯电车型，如果你更关注续航，我可以继续帮你整理。"
    },
    {
      state: "sending",
      lead: leads[3],
      content: "我帮你把落地价格和购置税一起算清楚。"
    },
    {
      state: "sent",
      lead: leads[4],
      content: "有现车的话，我帮你确认最近的提车时间。",
      receipt: { state: "sent", sentAt: "2026-09-10T10:07:12+08:00" }
    },
    {
      state: "delivered",
      lead: leads[5],
      content: "可以帮你确认试驾预约的时间和门店。",
      receipt: { state: "delivered", sentAt: "2026-09-10T10:03:26+08:00" }
    }
  ];
  const snapshot = {
    counters: { works: 12, comments: 86, candidates: 6, sent: 4, delivered: 2, replies: 2, captured: 2 },
    works: [{ id: "mock-live-20260910-001", title: "新能源车型直播间", url: "https://www.douyin.com/video/mock-live-20260910-001" }],
    lastScan: { notifications: 86 },
    resultSnapshot: { leads, counts: { candidates: 6, captured: 2 } },
    candidateProfiles: Object.fromEntries(leads.map((lead) => [lead.leadId, lead])),
    approvalQueue,
    replies: [
      {
        lead: leads[0],
        content: "上海店现在有现车吗？",
        replyContent: "有的，上海店这周可以安排试驾。",
        status: "replied",
        leadCapture: { phone: "13800001234", quote: "方便的话发我一下试驾时间。" },
        leadCaptureStatus: "captured",
        leadCaptureQuote: "方便的话发我一下试驾时间。",
        receivedAt: "2026-09-10T10:20:12+08:00"
      },
      {
        lead: leads[5],
        content: "周末下午方便试驾吗？",
        replyContent: "可以，我帮你预留周日下午的时间。",
        status: "replied",
        leadCapture: { phone: "13900002345", quote: "周日下午可以到店。" },
        leadCaptureStatus: "captured",
        leadCaptureQuote: "周日下午可以到店。",
        receivedAt: "2026-09-10T10:08:49+08:00"
      }
    ],
    events: [{ message: "已识别 6 位直播间潜客，2 位已回复并留下联系方式。" }]
  };
  const configuration = {
    sourceScope: "authorized_account_all_signals",
    audienceRules: {
      goal: "正在询问现车、价格、分期、购置税或提车时间的人",
      requirements: "只保留高意向用户；优先保留上海、杭州、绍兴和嘉兴地区"
    },
    contentPolicy: {
      strategy: "先回应用户当前问题，再确认车型、预算和到店安排；不直接推销。",
      replyStyle: "专业、简短、自然",
      handoffBoundary: "价格承诺、退款、投诉和无法确认的库存信息转人工"
    },
    touchChannel: "private_message",
    touchContent: "先回应用户当前问题，再确认车型、预算和到店安排；不直接推销。",
    approvalMode: "auto",
    frequency: "识别到高意向潜客后自动触达",
    caps: { dailyMax: 30, sendIntervalMs: 15 * 60 * 1000 }
  };
  return {
    agentType: "mkt-comment-acquisition",
    projectId: "local-style-preview",
    state: "working",
    phase: "持续获客",
    task: "持续监听评论、直播互动和账号通知，寻找有购车意向的人",
    activities: ["抖音账号已连接，正在监听新增评论、直播互动和账号通知", "发现 6 位符合条件的潜客，已进入触达队列"],
    metadata: {
      mock: true,
      mockScenario: "automotive",
      source: "douyin-mcp",
      cloudProvider: "douyin",
      taskId: "mock-acquisition-task-20260910",
      taskRunId: "mock-acquisition-run-001",
      accountId,
      accountKey,
      accountLabel,
      cloudState: "online",
      taskState: "running",
      acquisitionTaskState: "running",
      mockLiveRoomImage: REALTIME_MOCK_LIVE_ROOM_IMAGES.automotive,
      configuration,
      acquisitionSnapshot: snapshot
    }
  };
}

const REALTIME_MOCK_DOMAIN_SOURCE_PROFILES = Object.freeze({
  education: Object.freeze([
    { type: "comment", channel: "comment", label: "作品评论", title: "升学规划案例 · 作品评论", reference: "作品评论J420" },
    { type: "interaction", channel: "interaction", label: "互动通知", title: "账号互动通知", reference: "互动通知J421" },
    { type: "live", channel: "live", label: "直播间", title: "升学规划直播间", reference: "直播弹幕J422" },
    { type: "comment", channel: "comment", label: "作品评论", title: "学校选择讲解 · 作品评论", reference: "作品评论J423" }
  ]),
  home: Object.freeze([
    { type: "interaction", channel: "interaction", label: "互动通知", title: "账号互动通知", reference: "互动通知H420" },
    { type: "comment", channel: "comment", label: "作品评论", title: "小户型收纳案例 · 作品评论", reference: "作品评论H421" },
    { type: "live", channel: "live", label: "直播间", title: "小户型改造直播间", reference: "直播弹幕H422" },
    { type: "interaction", channel: "interaction", label: "互动通知", title: "全屋定制互动通知", reference: "互动通知H423" }
  ])
});

const REALTIME_MOCK_DOMAIN_SCENARIOS = Object.freeze({
  education: {
    label: "升学规划直播间",
    task: "从直播间互动中找出正在了解升学方案的家长",
    audienceGoal: "正在询问升学路径、课程安排或报名时间的人",
    requirements: "优先保留已经说明孩子阶段、目标城市或课程需求的家长",
    workId: "mock-live-education-20260911-001",
    leads: [
      {
        leadId: "mock-lead-education-shanghai",
        nickname: "上海周女士",
        quote: "我家孩子明年中考，怎么选学校？",
        intentTier: "high",
        score: 93,
        reason: "主动说明孩子的升学阶段，并直接询问学校选择方案。",
        signals: ["明确升学阶段", "询问学校选择", "家长本人决策"],
        traits: [
          ["孩子阶段", "初二，明年参加中考"],
          ["目标方向", "上海中考升学规划"],
          ["决策角色", "家长本人"]
        ],
        activeBehavior: "近 7 天连续观看升学规划和学校对比内容",
        cityRelation: "上海 · 同城用户",
        storeConversation: "已在直播间连续追问两次",
        touchContent: "我先按上海中考的时间线帮你梳理学校选择，再确认孩子目前的成绩区间。",
        touchState: "delivered"
      },
      {
        leadId: "mock-lead-education-hangzhou",
        nickname: "杭州林先生",
        quote: "国际课程转体制内，需要准备哪些材料？",
        intentTier: "high",
        score: 88,
        reason: "正在比较转轨方案，问题已经落到材料和执行准备。",
        signals: ["比较课程路径", "询问办理材料", "有明确转轨需求"],
        traits: [
          ["当前路径", "国际课程转体制内"],
          ["关注问题", "转轨材料和时间节点"],
          ["决策阶段", "方案比较中"]
        ],
        activeBehavior: "近期多次查看国际课程转轨和备考安排",
        cityRelation: "杭州 · 异地用户",
        storeConversation: "直播间已回复过课程路径问题",
        touchContent: "我可以先把转轨材料和时间节点列给你，再根据孩子现在的年级判断准备顺序。",
        touchState: "sent"
      },
      {
        leadId: "mock-lead-education-suzhou",
        nickname: "苏州陈女士",
        quote: "有没有周末一对一规划？",
        intentTier: "high",
        score: 84,
        reason: "明确询问服务形式和可用时间，已经进入咨询安排阶段。",
        signals: ["询问服务形式", "关注周末时段", "准备进一步咨询"],
        traits: [
          ["服务偏好", "周末一对一规划"],
          ["关注主题", "升学路径梳理"],
          ["咨询状态", "准备预约"]
        ],
        activeBehavior: "近 3 天浏览过一对一规划案例",
        cityRelation: "苏州 · 异地用户",
        storeConversation: "尚未进入私信对话",
        touchContent: "周末可以安排，我先确认孩子所在年级和目标方向，再给你匹配合适的规划时段。",
        touchState: "submitted"
      },
      {
        leadId: "mock-lead-education-nanjing",
        nickname: "南京赵先生",
        quote: "高一现在开始准备还来得及吗？",
        intentTier: "medium",
        score: 72,
        reason: "正在了解准备时机，还没有提供具体目标和成绩信息。",
        signals: ["关注准备时机", "需要补充目标信息"],
        traits: [
          ["孩子阶段", "高一"],
          ["关注问题", "准备起始时间"]
        ],
        activeBehavior: "近期浏览过升学时间规划内容",
        cityRelation: "南京 · 异地用户",
        storeConversation: "尚未与账号对话",
        touchContent: ""
      }
    ]
  },
  home: {
    label: "小户型改造直播间",
    task: "从直播间互动中找出正在了解装修方案的用户",
    audienceGoal: "正在询问户型改造、预算、工期或材料方案的人",
    requirements: "优先保留已经说明户型、预算或具体空间问题的用户",
    workId: "mock-live-home-20260911-001",
    leads: [
      {
        leadId: "mock-lead-home-shanghai",
        nickname: "上海林女士",
        quote: "89 平两居，厨房和玄关怎么做收纳？",
        intentTier: "high",
        score: 91,
        reason: "明确提供户型和空间问题，已经进入方案咨询阶段。",
        signals: ["提供户型信息", "明确空间问题", "询问改造方案"],
        traits: [
          ["房屋类型", "89㎡两居室"],
          ["关注空间", "厨房与玄关收纳"],
          ["改造阶段", "方案咨询中"]
        ],
        activeBehavior: "近 7 天连续观看小户型收纳改造案例",
        cityRelation: "上海 · 同城用户",
        storeConversation: "已在直播间追问过空间尺寸建议",
        touchContent: "我先按 89 平两居的动线帮你梳理厨房和玄关的收纳重点，再确认现场尺寸。",
        touchState: "delivered"
      },
      {
        leadId: "mock-lead-home-hangzhou",
        nickname: "杭州王先生",
        quote: "全屋定制大概多少钱？",
        intentTier: "high",
        score: 87,
        reason: "直接询问整体预算，具备明确的装修成本决策信号。",
        signals: ["询问整体预算", "关注定制方案", "正在评估成本"],
        traits: [
          ["预算关注", "全屋定制整体报价"],
          ["空间需求", "客餐厅一体化"],
          ["决策阶段", "预算评估中"]
        ],
        activeBehavior: "近期多次查看全屋定制报价和案例内容",
        cityRelation: "杭州 · 同城用户",
        storeConversation: "直播间已回复过报价范围问题",
        touchContent: "全屋定制要结合面积和柜体数量估算，我先按你的户型确认报价所需信息。",
        touchState: "sent"
      },
      {
        leadId: "mock-lead-home-suzhou",
        nickname: "苏州陈先生",
        quote: "厨房改造一般多久能完工？",
        intentTier: "high",
        score: 82,
        reason: "主动确认施工周期，说明已经在安排实际改造计划。",
        signals: ["询问施工周期", "关注落地安排", "有明确改造计划"],
        traits: [
          ["改造空间", "厨房"],
          ["关注节点", "施工周期和入住安排"],
          ["当前需求", "准备确定施工计划"]
        ],
        activeBehavior: "近 3 天关注厨房改造和施工避坑内容",
        cityRelation: "苏州 · 异地用户",
        storeConversation: "尚未进入私信对话",
        touchContent: "工期会受拆改和定制进场影响，我先了解厨房面积和是否需要同步改水电。",
        touchState: "submitted"
      },
      {
        leadId: "mock-lead-home-nanjing",
        nickname: "南京赵女士",
        quote: "奶油风现在还流行吗？",
        intentTier: "medium",
        score: 69,
        reason: "主要在了解风格趋势，暂时没有明确的户型和装修时间。",
        signals: ["关注风格趋势", "需要补充装修计划"],
        traits: [
          ["风格偏好", "奶油风"],
          ["关注主题", "软装搭配趋势"]
        ],
        activeBehavior: "近期浏览过多条风格搭配内容",
        cityRelation: "南京 · 异地用户",
        storeConversation: "尚未与账号对话",
        touchContent: ""
      }
    ]
  }
});

export function createRealtimeMockDomainWork(account = {}, scenarioName = account.mockScenario) {
  const scenario = REALTIME_MOCK_DOMAIN_SCENARIOS[scenarioName];
  if (!scenario) return createRealtimeMockAcquisitionWork(account);
  const accountId = String(account.id || `mock-${scenarioName}-account`);
  const accountLabel = String(account.name || "模拟抖音账号");
  const accountKey = String(account.accountKey || douyinAccountWorkKey(account.identity, accountId));
  const sourceProfiles = REALTIME_MOCK_DOMAIN_SOURCE_PROFILES[scenarioName] || [];
  const leads = scenario.leads.map((item, index) => ({
    sourceProfile: sourceProfiles[index] || { type: "live", channel: "live", label: "直播间", title: scenario.label, reference: `直播弹幕${scenarioName[0].toUpperCase()}${420 + index}` },
    leadId: item.leadId,
    nickname: item.nickname,
    avatar: DEMO_PROSPECT_AVATARS[index % DEMO_PROSPECT_AVATARS.length],
    recentComment: item.quote,
    profileEvidence: {
      recentComment: item.quote,
      activeBehavior: item.activeBehavior,
      cityRelation: item.cityRelation,
      storeConversation: item.storeConversation,
      dynamicTraits: item.traits.map(([label, value]) => ({ label, value, evidence: item.quote }))
    },
    source: {
      type: sourceProfiles[index]?.type || "live",
      channel: sourceProfiles[index]?.channel || "live",
      sourceLabel: sourceProfiles[index]?.label || "直播间",
      workTitle: sourceProfiles[index]?.title || scenario.label,
      videoTitle: scenario.label,
      videoId: scenario.workId,
      videoUrl: `https://www.douyin.com/video/${scenario.workId}`,
      observedAt: `2026-09-11T10:${String(18 - index * 3).padStart(2, "0")}:24+08:00`
    },
    evidence: [{
      type: sourceProfiles[index]?.type || "live",
      sourceLabel: sourceProfiles[index]?.label || "直播间",
      quote: item.quote,
      sourceUrl: `https://www.douyin.com/video/${scenario.workId}`,
      observedAt: `2026-09-11T10:${String(18 - index * 3).padStart(2, "0")}:24+08:00`
    }],
    intent: {
      tier: item.intentTier,
      score: item.score,
      confidence: Number((0.82 + Math.min(item.score, 95) / 1000).toFixed(2)),
      reason: item.reason,
      signals: item.signals
    }
  }));
  leads.forEach((lead, index) => {
    lead.source.reference = lead.sourceProfile.reference;
    lead.evidence[0].sourceReference = lead.sourceProfile.reference;
    delete lead.sourceProfile;
  });
  const approvalQueue = leads.map((lead, index) => ({
    state: scenario.leads[index].touchState ? scenario.leads[index].touchState : "submitted",
    lead,
    content: scenario.leads[index].touchContent,
    ...(scenario.leads[index].touchState === "sent" || scenario.leads[index].touchState === "delivered"
      ? { receipt: { state: scenario.leads[index].touchState, sentAt: "2026-09-11T10:20:12+08:00" } }
      : {})
  }));
  const touched = approvalQueue.filter((item) => ["sent", "delivered"].includes(item.state)).length;
  const replyIndexes = scenarioName === "education" ? [0, 2] : [0, 1];
  const replies = replyIndexes.map((index) => leads[index]).filter(Boolean).map((lead) => ({
    lead,
    content: lead.recentComment,
    replyContent: scenarioName === "education"
      ? "可以，我先把孩子阶段和目标城市发你，你帮我看看适合哪条路径。"
      : "好的，我把户型和预算补充给你，麻烦帮我看看。",
    status: "replied",
    receivedAt: "2026-09-11T10:21:12+08:00"
  }));
  const snapshot = {
    counters: {
      works: 8,
      comments: scenarioName === "education" ? 64 : 58,
      candidates: leads.length,
      sent: touched,
      delivered: approvalQueue.filter((item) => item.state === "delivered").length,
      replies: replies.length,
      captured: 0
    },
    works: [{ id: scenario.workId, title: scenario.label, url: `https://www.douyin.com/video/${scenario.workId}` }],
    lastScan: { notifications: scenarioName === "education" ? 64 : 58 },
    resultSnapshot: { leads, counts: { candidates: leads.length, captured: 0 } },
    candidateProfiles: Object.fromEntries(leads.map((lead) => [lead.leadId, lead])),
    approvalQueue,
    replies,
    events: [{ message: `已识别 ${leads.length} 位${scenarioName === "education" ? "升学咨询" : "装修咨询"}用户，正在按状态推进。` }]
  };
  const configuration = {
    sourceScope: "authorized_account_all_signals",
    audienceRules: { goal: scenario.audienceGoal, requirements: scenario.requirements },
    contentPolicy: {
      strategy: "先回应用户当前问题，再补充必要信息；不直接推销。",
      replyStyle: "专业、简短、自然",
      handoffBoundary: "价格承诺、退款、投诉和无法确认的信息转人工"
    },
    touchChannel: "private_message",
    touchContent: "先回应用户当前问题，再补充必要信息；不直接推销。",
    approvalMode: "auto",
    frequency: "识别到高意向潜客后自动触达",
    caps: { dailyMax: 30, sendIntervalMs: 15 * 60 * 1000 }
  };
  return {
    agentType: "mkt-comment-acquisition",
    projectId: "local-style-preview",
    state: "working",
    phase: "持续获客",
    task: scenario.task,
    activities: ["抖音账号已连接，正在分析作品评论、互动通知和直播消息", `发现 ${leads.length} 位符合条件的用户，已进入工作队列`],
    metadata: {
      mock: true,
      mockScenario: scenarioName,
      source: "mock",
      cloudProvider: "mock",
      taskId: `mock-acquisition-task-${scenarioName}-20260911`,
      taskRunId: `mock-acquisition-run-${scenarioName}-001`,
      accountId,
      accountKey,
      accountLabel,
      cloudState: "online",
      taskState: "running",
      acquisitionTaskState: "running",
      mockLiveRoomImage: REALTIME_MOCK_LIVE_ROOM_IMAGES[scenarioName],
      configuration,
      acquisitionSnapshot: snapshot
    }
  };
}

function createRealtimeMockSpecialistWork(managerWork, definition) {
  const metadata = managerWork?.metadata && typeof managerWork.metadata === "object" ? managerWork.metadata : {};
  const { acquisitionTaskState, ...managerMetadata } = metadata;
  return {
    ...managerWork,
    agentType: definition.agentType,
    phase: definition.phase,
    task: definition.task,
    activities: [...definition.activities],
    metadata: {
      ...managerMetadata,
      source: "mock",
      cloudProvider: "mock",
      taskId: `${metadata.taskId || "mock-acquisition-task"}-${definition.id}`,
      taskRunId: `${metadata.taskRunId || "mock-acquisition-run"}-${definition.id}`,
      parentTaskId: metadata.taskId || null,
      parentTaskRunId: metadata.taskRunId || null,
      mockRole: definition.id,
      taskState: "running"
    }
  };
}

export function realtimeMockAgentIdsForAccount(account = {}) {
  const configuredIds = Array.isArray(account.agentIds)
    ? [...new Set(account.agentIds.map((agentId) => String(agentId || "").trim()).filter(Boolean))]
    : [DOUYIN_ACQUISITION_COMPLETE_AGENT_ID];
  if (configuredIds.includes(DOUYIN_ACQUISITION_COMPLETE_AGENT_ID)) return [...MARKETPLACE_LATEST_AGENT_IDS];
  return DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS.filter((agentId) => configuredIds.includes(agentId));
}

export function createRealtimeMockPreviewWorks(accounts = createRealtimeMockPreviewAccounts()) {
  return (Array.isArray(accounts) ? accounts : []).flatMap((account) => {
    const managerWork = account.mockScenario === "automotive"
      ? createRealtimeMockAcquisitionWork(account)
      : createRealtimeMockDomainWork(account, account.mockScenario);
    const agentIds = realtimeMockAgentIdsForAccount(account);
    return agentIds.map((agentId) => {
      if (agentId === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID) return managerWork;
      const definition = REALTIME_MOCK_SPECIALIST_DEFINITIONS.find((item) => item.agentType === agentId);
      return definition ? createRealtimeMockSpecialistWork(managerWork, definition) : null;
    }).filter(Boolean);
  });
}

/**
 * Build the local viewer shell for an account-scoped Douyin cloud desktop.
 * The shell obtains/refreshes the short-lived VNC target itself, so the
 * realtime-work page never needs to expose or persist a raw credential.
 */
export function douyinCloudViewerUrlFor(agentId, {
  origin = globalThis.location?.origin,
  backend = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
    || globalThis.document?.querySelector?.('meta[name="salebuddy-control-plane"]')?.content
    || "http://127.0.0.1:6681"
} = {}) {
  const id = String(agentId || "").trim();
  if (!id || !origin || origin === "null") return null;
  const url = new URL("/cloud-view.html", origin);
  url.searchParams.set("agentId", id);
  url.searchParams.set("embedded", "1");
  if (backend) url.searchParams.set("backend", String(backend));
  return url.toString();
}

function isDouyinCloudAgent(agentId) {
  return DOUYIN_CLOUD_AGENT_IDS.has(String(agentId || "").trim());
}

const REALTIME_SPECIALIST_WORKSITES = Object.freeze({
  "mkt-find-people": "finder",
  "mkt-intent-analyst": "analysis",
  "mkt-cold-writer": "outreach",
  "mkt-dm-inbox": "conversion",
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: "conversion",
  "mkt-live-danmaku-analysis": "live-analysis",
  "mkt-live-danmaku-outreach": "live-outreach",
  "mkt-viral-work-analysis": "viral-analysis"
});

export function realtimeSpecialistWorksiteFor(agentId, work = null) {
  if (!work) return null;
  return REALTIME_SPECIALIST_WORKSITES[String(agentId || "").trim()] || null;
}

export function clampHorizontalScrollOffset(offset, scrollWidth, clientWidth) {
  const maximum = Math.max(0, Number(scrollWidth) - Number(clientWidth));
  const value = Number(offset);
  return Math.min(maximum, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function realtimeWorkSurfaceFor(agentId, work = null) {
  if (String(agentId || "").trim() === "mkt-research-expert") return "background";
  return isDouyinCloudAgent(agentId, work) ? "cloud" : "generic";
}

export const ACCOUNT_SETUP_STEPS = Object.freeze([
  { id: "verify", label: "验证抖音账号", detail: "确认账号身份和授权状态" },
  { id: "cloud", label: "创建独立云电脑", detail: "为账号分配隔离的浏览器工作区" },
  { id: "agents", label: "配置账号级 Agent", detail: "接入找人、分析和触达团队" }
]);

export function normalizeNewAccountInput(input = {}) {
  const name = String(input.name || "").trim() || "待识别抖音店铺";
  const rawHandle = String(input.handle || "").trim().replace(/^@+/, "");
  return { name, handle: rawHandle ? `@${rawHandle}` : "待识别账号" };
}

export function createManagedAccount(input, existingCount = 0) {
  const normalized = normalizeNewAccountInput(input);
  const serial = String(existingCount + 1).padStart(2, "0");
  return {
    id: `managed-${serial}`,
    ...normalized,
    status: "待授权",
    phase: "等待抖音登录",
    discovered: "0",
    hot: "0",
    progress: "0%",
    color: "#2f80ed",
    avatar: DOUYIN_ACCOUNT_AVATAR_IMAGES.select,
    fans: "待同步",
    agents: 0,
    computer: "创建中",
    setupStep: ACCOUNT_SETUP_STEPS[0].id,
    createdAt: new Date().toISOString()
  };
}

function createAccountSetup(accounts = []) {
  return {
    phase: "verify",
    authState: "waiting",
    progress: 0,
    agentCount: 0,
    sessionId: "",
    error: "",
    timer: null,
    account: createManagedAccount({}, accounts.length)
  };
}

const CUSTOM_ACCOUNT_STORAGE_KEY = "byering-managed-douyin-accounts";

function loadCustomAccounts() {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem?.(CUSTOM_ACCOUNT_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((account) => account?.id && account?.name && account?.handle) : [];
  } catch {
    return [];
  }
}

function saveCustomAccounts(accounts) {
  try { globalThis.localStorage?.setItem?.(CUSTOM_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts)); } catch { /* storage may be unavailable */ }
}

function accountDirectoryFor(state) {
  const source = Array.isArray(state.accounts)
    ? state.accounts
    : Array.isArray(state.customAccounts) ? state.customAccounts : [];
  return getAuthorizedManagedAccounts(source);
}

function concreteAccountName(...values) {
  const placeholderNames = new Set(["已授权抖音账号", "当前已授权抖音账号", "抖音账号"]);
  return values
    .map((value) => String(value || "").trim())
    .find((value) => value && !placeholderNames.has(value)) || "";
}

function avatarUrlFromValue(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(avatarUrlFromValue).find(Boolean) || "";
  if (!value || typeof value !== "object") return "";
  return avatarUrlFromValue(
    value.url
      || value.uri
      || value.urlList
      || value.url_list
      || value.urls
  );
}

export function accountAvatarSource(account = {}) {
  const identity = account.identity && typeof account.identity === "object" ? account.identity : {};
  const candidates = [
    account.avatarUrl,
    account.avatar_url,
    account.avatar,
    identity.avatar,
    identity.avatarUrl,
    identity.avatar_url,
    identity.avatarThumb,
    identity.avatar_thumb,
    identity.avatarLarger,
    identity.avatar_larger
  ];
  return candidates
    .map(avatarUrlFromValue)
    .find((source) => source && !Object.values(DOUYIN_ACCOUNT_AVATAR_IMAGES).includes(source)) || "";
}

export function accountAvatarFallbackLabel(account = {}) {
  const identity = account.identity && typeof account.identity === "object" ? account.identity : {};
  const label = concreteAccountName(
    identity.accountName,
    identity.account_name,
    identity.nickname,
    identity.nick_name,
    account.name,
    account.handle
  ) || "抖音账号";
  return Array.from(label.replace(/^@+/, ""))[0] || "抖";
}

function mountAccountAvatar(container, account, { eager = false } = {}) {
  if (!container) return;
  const label = concreteAccountName(account.name, account.handle) || "抖音账号";
  const source = accountAvatarSource(account);
  container.textContent = "";
  container.setAttribute("aria-label", `${label}头像`);
  if (!source) {
    container.dataset.avatarFallback = "true";
    container.textContent = accountAvatarFallbackLabel(account);
    return;
  }

  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.loading = eager ? "eager" : "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    if (image.parentElement !== container) return;
    image.remove();
    container.dataset.avatarFallback = "true";
    container.textContent = accountAvatarFallbackLabel(account);
  }, { once: true });
  container.appendChild(image);
}

export function accountIdentityFor(account = {}) {
  const identity = account.identity && typeof account.identity === "object" ? account.identity : account;
  const accountName = concreteAccountName(
    identity.accountName,
    identity.account_name,
    identity.nickname,
    identity.nick_name,
    account.name
  );
  const profileUrl = identity.profileUrl || account.profileUrl || account.profile_url || "";
  const uniqueId = identity.uniqueId
    || identity.unique_id
    || identity.uid
    || account.uniqueId
    || account.unique_id
    || account.uid
    || "";
  const uid = identity.uid || identity.userId || identity.user_id || account.userId || account.user_id || "";
  const secId = identity.secId || identity.sec_id || identity.secUid || identity.sec_uid || account.secId || account.sec_id || account.secUid || account.sec_uid || "";
  const managedAccountKey = identity.managedAccountKey || account.managedAccountKey || account.accountKey || "";
  const avatar = accountAvatarSource({ ...account, identity });
  return {
    ...identity,
    accountName,
    ...(profileUrl ? { profileUrl } : {}),
    ...(uniqueId && uniqueId !== "待识别账号" ? { uniqueId } : {}),
    ...(uid ? { uid } : {}),
    ...(secId ? { secId } : {}),
    ...(managedAccountKey ? { managedAccountKey } : {}),
    ...(avatar ? { avatar } : {})
  };
}

// Keep cloud sessions isolated while grouping work by the real provider identity.
export function douyinAccountWorkKey(accountOrIdentity = {}, fallback = "") {
  const source = accountOrIdentity?.identity && typeof accountOrIdentity.identity === "object"
    ? { ...accountOrIdentity.identity, ...accountOrIdentity }
    : accountOrIdentity || {};
  const identityValue = source.secUid
    || source.sec_uid
    || source.secId
    || source.sec_id
    || source.uid
    || source.userId
    || source.user_id
    || source.uniqueId
    || source.unique_id
    || source.profileUrl
    || source.profile_url;
  const normalized = String(identityValue || "").trim();
  return normalized ? `douyin:${normalized}` : String(fallback || "").trim();
}

function accountIsAuthorized(account = {}) {
  const state = `${account.status || ""} ${account.phase || ""} ${account.computer || ""}`;
  const identity = accountIdentityFor(account);
  if (account.authenticationVerified !== true) return false;
  const hasExternalIdentity = Boolean(identity.uniqueId || identity.profileUrl || identity.uid || identity.secId);
  return account.computer === "在线"
    && !/(待授权|等待授权|需重新登录|已暂停|创建中|分析中|配置 Agent)/.test(state)
    && hasExternalIdentity;
}

export function realtimeAccountStatusLabel(account = {}, activeWorks = []) {
  const status = String(account.status || "").trim();
  if (["需重新登录", "已暂停"].includes(status)) return status;
  return Array.isArray(activeWorks) && activeWorks.length ? "运行中" : "已连接";
}

function authorizedAccountKey(account = {}) {
  const identityKey = douyinAccountWorkKey(account.identity || account, "");
  return identityKey || `account:${String(account.id || "").trim()}`;
}

function mergeAuthorizedAccountRecords(accounts = []) {
  const merged = new Map();
  for (const account of accounts) {
    const key = authorizedAccountKey(account);
    const previous = merged.get(key);
    const accountAgentIds = [...new Set([
      ...(Array.isArray(account.agentIds) ? account.agentIds : []),
      account.agentId
    ].map((agentId) => String(agentId || "").trim()).filter(Boolean))];
    const accountSessionIds = [...new Set([
      ...(Array.isArray(account.sessionIds) ? account.sessionIds : []),
      account.sessionId
    ].map((sessionId) => String(sessionId || "").trim()).filter(Boolean))];
    if (!previous) {
      merged.set(key, {
        ...account,
        agentIds: accountAgentIds,
        sessionIds: accountSessionIds,
        agents: Math.max(accountAgentIds.length, Number(account.agents) || 0),
        cloudCount: Math.max(accountSessionIds.length, Number(account.cloudCount) || 0)
      });
      continue;
    }

    const agentIds = [...new Set([...(previous.agentIds || []), previous.agentId, ...accountAgentIds].filter(Boolean))];
    const sessionIds = [...new Set([...(previous.sessionIds || []), previous.sessionId, ...accountSessionIds].filter(Boolean))];
    merged.set(key, {
      ...previous,
      agentIds,
      sessionIds,
      agents: Math.max(agentIds.length, Number(previous.agents) || 0, Number(account.agents) || 0),
      cloudCount: Math.max(1, sessionIds.length || previous.cloudCount || 0),
      receptionConfigured: Boolean(previous.receptionConfigured || account.receptionConfigured),
      privateReceptionEnabled: Boolean(previous.privateReceptionEnabled || account.privateReceptionEnabled),
      privateReceptionEligible: Boolean(previous.privateReceptionEligible || account.privateReceptionEligible || previous.privateReceptionEnabled || account.privateReceptionEnabled),
      privateReceptionRunning: Boolean(previous.privateReceptionRunning || account.privateReceptionRunning),
      privateReceptionRuntimeState: previous.privateReceptionRunning || account.privateReceptionRunning
        ? "running"
        : (account.privateReceptionRuntimeState || previous.privateReceptionRuntimeState || "stopped"),
      privateReception: previous.privateReceptionEnabled
        ? previous.privateReception
        : account.privateReception
    });
  }
  return [...merged.values()].map((account) => {
    const capabilityMatrix = buildDouyinAcquisitionAccountCapabilityMatrix({ agentIds: account.agentIds });
    return {
      ...account,
      agents: capabilityMatrix.filter(({ ready }) => ready).length,
      cloudCount: Math.max(1, Number(account.cloudCount) || 0),
      capabilityMatrix
    };
  });
}

/**
 * Return account records that can be used without asking the user to re-enter
 * a Douyin identity. The identity comes from the managed account record.
 */
export function getAuthorizedManagedAccounts(accounts = null) {
  const source = Array.isArray(accounts)
    ? accounts
    : Array.isArray(globalThis.__SALEBUDDY__?.douyinAccounts)
      ? globalThis.__SALEBUDDY__.douyinAccounts
      : loadCustomAccounts();
  const normalized = source.filter(accountIsAuthorized).map((account) => {
    const identity = accountIdentityFor(account);
    const avatar = accountAvatarSource({ ...account, identity });
    const { avatar: _avatar, avatarUrl: _avatarUrl, avatar_url: _avatarUrlSnake, ...accountWithoutAvatar } = account;
    return {
      ...accountWithoutAvatar,
      name: concreteAccountName(
        identity.accountName,
        identity.account_name,
        identity.nickname,
        identity.nick_name,
        identity.account,
        account.name,
        identity.uniqueId,
        identity.uid
      ) || "账号名称未返回",
      identity,
      ...(avatar ? { avatar } : {}),
      authenticationVerified: account.authenticationVerified === true,
      handle: identity.account || identity.uniqueId
        ? `@${String(identity.account || identity.uniqueId).replace(/^@+/, "")}`
        : ""
    };
  });
  return mergeAuthorizedAccountRecords(normalized);
}

/**
 * The account directory returned by the control plane is authoritative. Browser
 * storage is only a short-lived handoff after a successful authorization and
 * must never keep an unlinked account visible in the product.
 */
export function applyAuthoritativeManagedAccountDirectory(state = {}, accounts = []) {
  const authorized = getAuthorizedManagedAccounts(Array.isArray(accounts) ? accounts : []);
  saveCustomAccounts(authorized);
  globalThis.__SALEBUDDY__ ||= {};
  globalThis.__SALEBUDDY__.douyinAccounts = [...authorized];

  if (state && typeof state === "object") {
    state.accounts = [...authorized];
    state.customAccounts = [...authorized];
    const selected = authorized.find((account) => account.id === state.accountId) || authorized[0] || null;
    state.accountId = selected?.id || "";
    state.accountKey = douyinAccountWorkKey(selected?.identity, "");
  }

  return authorized;
}

/** Persist only an identity returned by a real authorization/browser session. */
export function rememberAuthorizedManagedAccount(account = {}) {
  const identity = accountIdentityFor(account);
  if (!accountIsAuthorized({ ...account, identity, computer: account.computer || "在线", status: account.status || "已连接" })) return null;
  const id = account.id || `authorized-${identity.uniqueId || identity.uid || identity.secId || Date.now()}`;
  const name = concreteAccountName(
    identity.accountName,
    identity.account_name,
    identity.nickname,
    identity.nick_name,
    account.name,
    identity.uniqueId,
    identity.uid
  ) || "账号名称未返回";
  const handle = identity.uniqueId ? `@${String(identity.uniqueId).replace(/^@+/, "")}` : "@已授权账号";
  const avatar = accountAvatarSource({ ...account, identity });
  const { avatar: _avatar, avatarUrl: _avatarUrl, avatar_url: _avatarUrlSnake, ...accountWithoutAvatar } = account;
  const normalized = {
    ...accountWithoutAvatar,
    id,
    name,
    handle,
    status: "已连接",
    computer: "在线",
    identity,
    authenticationVerified: true,
    ...(avatar ? { avatar } : {})
  };
  const stored = getAuthorizedManagedAccounts(loadCustomAccounts());
  const existing = stored.find((item) => authorizedAccountKey(item) === authorizedAccountKey(normalized));
  const stableId = existing?.id || id;
  normalized.id = stableId;
  const next = mergeAuthorizedAccountRecords([...stored.filter((item) => item.id !== stableId), normalized]);
  saveCustomAccounts(next);
  globalThis.__SALEBUDDY__ ||= {};
  globalThis.__SALEBUDDY__.douyinAccounts = next;
  return normalized;
}

const REALTIME_AGENT_NAMES = Object.freeze({
  "Browser Agent": "商品线索挖掘员",
  "Search Agent": "购买意向分析师",
  "App Agent": "触达策略师"
});

export function realtimeAgentName(agentId, fallbackName) {
  return REALTIME_AGENT_NAMES[agentId] || fallbackName;
}

const ACTIVE_AGENT_REALTIME_DEFAULTS = Object.freeze({
  "mkt-comment-acquisition": Object.freeze({
    phase: "完整获客",
    role: "持续监听 · 找客、判断、首触、接待",
    task: "等待已授权账号的新互动信号",
    action: "持续监听评论、直播互动和账号互动，识别意向后按规则完成首触与接待",
    input: "已授权账号 · 目标人群 · 接待策略",
    output: "潜客、来源证据、触达记录、会话进展",
    handoff: "成果中心 / 用户",
    tool: "核心执行 MCP · 抖音云电脑",
    steps: ["监听新增互动", "判断潜客意向", "首触并承接私信"],
    context: Object.freeze({ prospect: "等待新潜客", source: "已授权账号的新互动", score: "--", activity: "监听中，等待新的评论、直播或互动通知" })
  }),
  "mkt-find-people": Object.freeze({
    phase: "找人",
    role: "找人 · 公开找人或账号监听",
    task: "等待找客任务启动",
    action: "公开找人时整理候选；账号监听时只处理后续新增信号",
    input: "找客目标 · 来源方式 · 筛选条件",
    output: "候选名单、原始证据、匹配理由",
    handoff: "客户分析员 / 成果中心",
    tool: "公开找人服务 / 核心执行 MCP",
    steps: ["接收找客目标", "保留来源证据", "整理候选名单"],
    context: Object.freeze({ prospect: "等待候选客户", source: "公开来源或已授权账号", score: "--", activity: "等待找客任务启动" })
  }),
  "mkt-intent-analyst": Object.freeze({
    phase: "分析",
    role: "分析 · 潜客判断",
    task: "等待待分析候选",
    action: "基于来源证据、内容与互动判断潜客优先级",
    input: "候选对象 · 原始证据 · 分析要求",
    output: "潜客列表、优先级、判断依据",
    handoff: "潜客触达专员 / 成果中心",
    tool: "核心执行 MCP · AI 分析",
    steps: ["读取原始证据", "归纳需求信号", "交付潜客列表"],
    context: Object.freeze({ prospect: "等待分析对象", source: "候选线索与原始证据", score: "--", activity: "等待分析任务启动" })
  }),
  "mkt-live-danmaku-analysis": Object.freeze({
    phase: "直播分析",
    role: "直播分析 · 弹幕判断",
    task: "等待授权账号直播间的新弹幕",
    action: "读取直播间新弹幕，整理用户问题、需求与异议",
    input: "授权账号直播间 · 新弹幕",
    output: "直播主题、用户问题、需求信号、原始证据",
    handoff: "客户分析员 / 成果中心",
    tool: "核心执行 MCP · 抖音云电脑",
    steps: ["监听新弹幕", "归纳高频问题", "保留用户与原始证据"],
    context: Object.freeze({ prospect: "等待新弹幕", source: "授权账号当前直播间", score: "--", activity: "等待新的弹幕通知" })
  }),
  "mkt-live-danmaku-outreach": Object.freeze({
    phase: "直播触达",
    role: "直播触达 · 弹幕即私信",
    task: "等待授权账号直播间的新弹幕",
    action: "每位发弹幕的用户都进入首次私信触达，不判断成交或购买意向",
    input: "授权账号直播间 · 新弹幕",
    output: "逐人触达结果 · 平台回执",
    handoff: "用户 / 成果中心",
    tool: "核心执行 MCP · 抖音云电脑",
    steps: ["监听新弹幕", "逐一发送首次私信", "归档真实回执"],
    context: Object.freeze({ prospect: "等待发弹幕的用户", source: "授权账号当前直播间", score: "--", activity: "监听中，弹幕出现即进入触达" })
  }),
  "mkt-cold-writer": Object.freeze({
    phase: "触达",
    role: "触达 · 首轮联系",
    task: "等待确认触达名单",
    action: "按确认名单执行首次私信，并保留真实平台回执",
    input: "确认名单 · 首触内容 · 已授权账号",
    output: "逐人触达结果、失败原因、15 秒成功录屏",
    handoff: "私信客服 / 成果中心",
    tool: "核心执行 MCP · 抖音云电脑",
    steps: ["核对确认名单", "执行首次触达", "归档真实回执"],
    context: Object.freeze({ prospect: "等待确认名单", source: "成果中心潜客", score: "--", activity: "等待用户确认首次触达" })
  }),
  "mkt-dm-inbox": Object.freeze({
    phase: "私信对话",
    role: "私信对话 · 持续接待",
    task: "等待已授权账号的新私信",
    action: "按账号专属对话策略持续接待，并将边界问题交给用户",
    input: "已授权账号 · 对话策略 · 知识内容",
    output: "会话摘要、回复记录、人工接管事项",
    handoff: "用户 / 成果中心",
    tool: "核心执行 MCP · 抖音云电脑",
    steps: ["监听新私信", "按策略回复", "交接需要人工处理的事项"],
    context: Object.freeze({ prospect: "等待新的私信会话", source: "已授权账号私信", score: "--", activity: "接待中，等待新的私信" })
  }),
  [GOLD_CUSTOMER_SERVICE_AGENT_ID]: Object.freeze({
    phase: "金牌客服",
    role: "金牌客服 · 快速接待",
    task: "等待已授权账号的新私信",
    action: "先回应客户问题，再按用户目标设计后续对话",
    input: "已授权账号 · 私信对话目标 · 业务资料",
    output: "客户问题摘要、回复记录、目标达成进展、人工接管事项",
    handoff: "用户 / 成果中心",
    tool: "核心执行 MCP · 抖音云电脑",
    steps: ["监听新私信", "回应当前问题", "按目标推进并保留人工边界"],
    context: Object.freeze({ prospect: "等待新的私信会话", source: "已授权账号私信", score: "--", activity: "金牌客服接待中，等待新的私信" })
  })
});

function activeWorkUnitConfig(selected = {}) {
  const defaults = ACTIVE_AGENT_REALTIME_DEFAULTS[selected?.id];
  if (!defaults) return null;
  const working = selected?.status === "working" || selected?.state === "working";
  return {
    title: defaults.phase,
    subtitle: defaults.role,
    rows: [
      ["当前工作", defaults.task, working ? "进行中" : "待命"],
      ["执行内容", defaults.action, "按任务执行"],
      ["本次交付", defaults.output, "等待产出"]
    ]
  };
}

function createAgentsForMatch(match) {
  const matchedAgents = Array.isArray(match?.agents) ? match.agents : [];
  const matchedById = new Map(matchedAgents.map((agent) => [agent.id, agent]));
  const goalLabel = match?.goalLabels?.join("、") || "当前获客目标";
  const businessType = match?.businessType || "当前业务";
  const taskObjective = String(match?.taskObjective || match?.primaryGoal?.label || goalLabel).trim();

  // Empty-state cards must use the same five product agents as real work. Old
  // demo-agent templates intentionally never participate in runtime fallback.
  return DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.map((agentId) => {
    const profile = getMarketplaceAgent(agentId) || {};
    const defaults = ACTIVE_AGENT_REALTIME_DEFAULTS[agentId];
    const matched = matchedById.get(agentId);
    const context = {
      ...defaults.context,
      ...(match ? {
        prospect: `${businessType} · ${taskObjective}`,
        source: `${match.workflowName || "获客任务"} · ${match.goalFocus || goalLabel}`,
        activity: `${defaults.context.activity} · 目标：${taskObjective}`
      } : {})
    };
    return {
      id: agentId,
      name: profile.name || agentId,
      phase: defaults.phase,
      role: matched?.role ? `${defaults.phase} · ${matched.role}` : defaults.role,
      task: match ? `${defaults.task} · ${taskObjective}` : defaults.task,
      action: defaults.action,
      input: defaults.input,
      output: defaults.output,
      handoff: defaults.handoff,
      tool: defaults.tool,
      capabilities: [...(profile.skills || [])],
      context,
      metrics: [],
      status: "waiting",
      progress: 0,
      stepIndex: 0,
      steps: [...defaults.steps]
    };
  });
}

const CSS = `
.sb-rw-account-avatar img{display:block;width:100%;height:100%;object-fit:cover}
.sb-rw-account-avatar{overflow:hidden}
.sb-rw-account-avatar[data-avatar-fallback="true"],.sb-rw-directory-avatar[data-avatar-fallback="true"]{font-size:12px;font-weight:750;line-height:1}
.sb-realtime-page{min-height:100dvh;box-sizing:border-box;padding:26px 30px 34px;background:var(--sb-app-page-bg,#f7f8fb);color:#18201d;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-page.sb-page-realtime-work > .sb-page-head{display:none}
.sb-realtime-page *{box-sizing:border-box}
.sb-rw-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}
.sb-rw-kicker{margin-bottom:7px;color:#7c8984;font-size:11px;letter-spacing:.08em}
.sb-rw-title{margin:0;font-size:26px;letter-spacing:-.02em;font-weight:680;line-height:1.2}
.sb-rw-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.sb-rw-account-section{margin-bottom:20px}.sb-rw-account-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.sb-rw-account-title{font-size:13px;font-weight:680}.sb-rw-account-count{color:#8c9792;font-size:10px}.sb-rw-account-list{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 5px;scrollbar-width:thin;scrollbar-color:#cbded5 transparent}.sb-rw-account-card{position:relative;display:grid;grid-template-columns:30px minmax(0,1fr);gap:9px;flex:0 0 250px;min-height:74px;padding:11px 12px;border:1px solid #e6ece9;border-radius:12px;background:#fff;text-align:left;cursor:pointer;font:inherit;transition:border-color 140ms ease,box-shadow 140ms ease,transform 140ms ease}.sb-rw-account-card:hover{border-color:#a8d9c5;transform:translateY(-1px)}.sb-rw-account-card.is-active{border-color:#16b77a;box-shadow:0 0 0 2px rgba(16,185,129,.1)}.sb-rw-account-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:#fff;background:#252b2a;font-size:11px;font-weight:750}.sb-rw-account-avatar.is-blue{background:#3b7be8}.sb-rw-account-avatar.is-amber{background:#c78d36}.sb-rw-account-copy{min-width:0}.sb-rw-account-name{display:block;overflow:hidden;color:#27352e;font-size:11px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.sb-rw-account-handle{display:block;margin-top:3px;overflow:hidden;color:#99a39e;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-account-meta{display:flex;align-items:center;gap:6px;margin-top:7px;color:#708078;font-size:9px;white-space:nowrap}.sb-rw-account-status{display:inline-flex;align-items:center;gap:4px}.sb-rw-account-status i{width:6px;height:6px;border-radius:50%;background:#19b879}.sb-rw-account-status.is-warning{color:#a87529}.sb-rw-account-status.is-warning i{background:#e4a249}.sb-rw-account-stat{margin-left:auto;color:#159965;font-weight:650}.sb-rw-no-account{display:grid;min-height:calc(100dvh - 60px);place-items:center;overflow:hidden;padding:48px 24px;border:1px solid #e4e9f0;border-radius:16px;background:#fff}.sb-rw-no-account-inner{display:grid;justify-items:center;gap:12px;max-width:360px;text-align:center}.sb-rw-no-account-art{display:grid;place-items:center;width:86px;height:78px;margin-bottom:4px}.sb-rw-no-account-art img{display:block;width:72px;height:72px;object-fit:contain}.sb-rw-no-account-eyebrow{display:block;margin:0;color:#7d8791;font-size:11px;font-weight:600;letter-spacing:.06em}.sb-rw-no-account strong{display:block;margin:0;color:#27313d;font-size:17px;font-weight:680;letter-spacing:0;line-height:1.35}.sb-rw-no-account span{display:block;margin:0;color:#7a858f;font-size:12px;line-height:1.7}.sb-rw-no-account button{min-height:38px;margin-top:6px;padding:0 15px;border:1px solid #2f6fd3;border-radius:8px;background:#2f6fd3;color:#fff;font:inherit;font-size:12px;font-weight:650;cursor:pointer;transition:background 140ms ease,transform 140ms ease}.sb-rw-no-account button:hover{background:#245fba;transform:translateY(-1px)}.sb-rw-no-account button:focus-visible{outline:2px solid #78a6ec;outline-offset:3px}@media(max-width:640px){.sb-rw-no-account{min-height:calc(100dvh - 48px);padding:38px 20px}}
.sb-rw-filter{display:flex;gap:3px;padding:3px;border:1px solid #e5ebe8;border-radius:10px;background:#fff}
.sb-rw-filter button,.sb-rw-pause{border:0;border-radius:7px;background:transparent;color:#7a8581;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer}
.sb-rw-filter button:hover,.sb-rw-pause:hover{background:#f2f5f3;color:#27332f}
.sb-rw-filter button.is-active{background:#17211d;color:#fff;font-weight:600}
.sb-rw-pause{border:1px solid #e1e8e4;background:#fff;color:#52615b}
.sb-rw-pause.is-paused{color:#b56a20;border-color:#f0ddc2;background:#fffaf2}
.sb-rw-team{display:flex;flex-wrap:nowrap;gap:12px;margin-bottom:24px;padding:3px 2px 9px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;scrollbar-color:#cbded5 transparent}
.sb-rw-team-card{position:relative;display:flex;flex:0 0 220px;flex-direction:column;align-items:stretch;justify-content:space-between;min-width:220px;min-height:126px;padding:14px 15px;border:1px solid #e6ebe9;border-radius:14px;background:#fff;text-align:left;font:inherit;cursor:pointer;transition:border-color 140ms ease,box-shadow 140ms ease,transform 140ms ease}
.sb-rw-team-card:hover{border-color:#a8d9c5;transform:translateY(-1px)}
.sb-rw-team-card.is-active{border-color:#16b77a;box-shadow:0 0 0 2px rgba(16,185,129,.11)}
.sb-rw-agent-line{display:flex;align-items:flex-start;gap:10px;min-width:0;text-align:left}
.sb-rw-avatar{width:34px;height:34px;flex:none;border-radius:50%;overflow:hidden;background:#edf5f1;color:#0c8e5e;font-size:12px;display:grid;place-items:center}
.sb-rw-avatar.sb-grok-avatar{border-radius:0;overflow:visible;background:transparent}
.sb-rw-avatar.sb-grok-avatar .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-rw-avatar img{width:100%;height:100%;object-fit:cover}
.sb-rw-agent-copy{min-width:0;flex:1;padding-top:1px;text-align:left}
.sb-rw-agent-name{display:block;font-size:13px;font-weight:650;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-agent-phase{display:block;margin-top:5px;color:#8a9691;font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-status-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#16b77a;box-shadow:0 0 0 3px rgba(16,183,122,.11)}
.sb-rw-status-dot.waiting{background:#b6c0bc;box-shadow:none}
.sb-rw-card-meta{position:absolute;top:12px;right:12px;display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:18px;margin-top:0;color:#8c9792;font-size:11px;text-align:right}.sb-rw-card-meta.is-attention{color:#c65a38}
.sb-rw-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid #e7ecea;border-radius:14px;background:#fff;margin-bottom:18px;overflow:hidden}
.sb-rw-kpi{padding:14px 18px;border-right:1px solid #edf1ef}
.sb-rw-kpi:last-child{border-right:0;background:#f4fbf7}
.sb-rw-kpi-label{font-size:11px;color:#8b9691}
.sb-rw-kpi-value{margin-top:5px;font-size:24px;line-height:1;font-weight:680;letter-spacing:-.02em}
.sb-rw-kpi-value small{margin-left:6px;color:#1aad74;font-size:10px;font-weight:500;letter-spacing:0}
.sb-rw-kpi-note{margin-top:7px;color:#9ba6a1;font-size:10px}
.sb-rw-workbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.sb-rw-section-title{margin:0;font-size:16px;font-weight:670}
.sb-rw-phase-tabs{display:flex;gap:4px;padding:3px;border-radius:9px;background:#edf2ef}
.sb-rw-phase-tabs button{border:0;border-radius:7px;padding:6px 12px;background:transparent;color:#738079;font:inherit;font-size:11px;cursor:pointer}
.sb-rw-phase-tabs button.is-active{background:#fff;color:#1a2721;box-shadow:0 1px 3px rgba(17,34,26,.08);font-weight:650}
.sb-rw-main{display:grid;grid-template-columns:minmax(390px,1.35fr) minmax(270px,.8fr);gap:14px;align-items:stretch}
.sb-rw-panel{border:1px solid #e6ece9;border-radius:15px;background:#fff;min-width:0;overflow:hidden}
.sb-rw-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:15px 16px 12px;border-bottom:1px solid #edf1ef}
.sb-rw-panel-title{font-size:13px;font-weight:650}
.sb-rw-panel-sub{color:#99a39f;font-size:10px}
.sb-rw-live{display:inline-flex;align-items:center;gap:5px;color:#1b9a6a;font-size:10px}
.sb-rw-live i{width:6px;height:6px;border-radius:50%;background:#1ac27e;box-shadow:0 0 0 3px rgba(26,194,126,.12)}
.sb-rw-cloud-wrap{padding:14px;background:#f3f7f5}
.sb-rw-cloud-live-wrap{padding:10px;background:#f0f5f2}
.sb-rw-cloud-live{position:relative;min-height:350px;overflow:hidden;border:1px solid #cfdad5;border-radius:9px;background:#111522;box-shadow:0 8px 20px rgba(32,58,48,.12)}
.sb-rw-cloud-live iframe{display:block;width:100%;height:350px;border:0;background:#111522}
.sb-rw-cloud-viewer-state{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(17,21,34,.88);color:#eef2fb;text-align:center;pointer-events:none}
.sb-rw-cloud-viewer-state div{max-width:360px}.sb-rw-cloud-viewer-state strong{display:block;font-size:15px}.sb-rw-cloud-viewer-state span{display:block;margin-top:7px;color:#aeb6cc;font-size:11px;line-height:1.5}
.sb-rw-cloud-live-status{display:flex;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #e2ebe6;background:#fff;color:#627168;font-size:10px}
.sb-rw-cloud-live-status i{width:7px;height:7px;flex:none;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.12);animation:sb-rw-cloud-pulse 1.4s ease-in-out infinite}
@keyframes sb-rw-cloud-pulse{0%,100%{opacity:.45}50%{opacity:1}}
.sb-rw-cloud-replay-stage{position:relative;display:grid;place-items:center;min-height:350px;overflow:hidden;border:1px solid #cfdad5;border-radius:9px;background:#111522;box-shadow:0 8px 20px rgba(32,58,48,.12)}
.sb-rw-cloud-replay-stage video{display:block;width:100%;height:350px;object-fit:contain;background:#111522}
.sb-rw-cloud-replay-empty{padding:24px;color:#c4cedd;font-size:12px;text-align:center}
.sb-rw-cloud-capture-source{position:fixed!important;left:-10000px!important;top:-10000px!important;width:880px!important;height:560px!important;min-height:0!important;z-index:-1!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
.sb-rw-cloud{position:relative;min-height:350px;border:1px solid #cfdad5;border-radius:10px;background:#17211f;box-shadow:0 12px 26px rgba(32,58,48,.14);overflow:hidden}
.sb-rw-cloud-top{height:33px;display:flex;align-items:center;gap:7px;padding:0 11px;background:#26332f;color:#b9c6c0;font-size:10px}
.sb-rw-cloud-top b{width:7px;height:7px;border-radius:50%;background:#ec7565;box-shadow:12px 0 #e5b85c,24px 0 #59c88a}
.sb-rw-cloud-top span{margin-left:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-cloud-screen{padding:17px 18px;color:#d8e5de;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.sb-rw-cloud-screen .sb-rw-screen-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px;color:#fff;font-family:inherit;font-size:12px}
.sb-rw-screen-heading em{font-style:normal;color:#59d9a0;font-size:10px}
.sb-rw-screen-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sb-rw-screen-card{min-height:112px;padding:12px;border:1px solid rgba(146,190,169,.2);border-radius:7px;background:#1d2b27}
.sb-rw-screen-card strong{display:block;margin-bottom:10px;color:#f5faf7;font-size:11px;font-weight:550}
.sb-rw-screen-line{height:7px;margin:8px 0;border-radius:3px;background:#31443d}
.sb-rw-screen-line.short{width:58%}.sb-rw-screen-line.green{background:linear-gradient(90deg,#25c587 70%,#31443d 70%)}
.sb-rw-screen-chip{display:inline-flex;padding:4px 6px;border-radius:4px;background:#293c35;color:#86e6ba;font-size:9px}
.sb-rw-screen-terminal{margin-top:11px;padding-top:9px;border-top:1px solid rgba(147,191,171,.18);color:#91b9a6;line-height:1.75}
.sb-rw-screen-terminal b{color:#55d799;font-weight:500}
.sb-rw-cloud[data-scene="strategy"]{background:#172238;border-color:#34486b}
.sb-rw-cloud[data-scene="browser"]{background:#edf5f8;border-color:#c6dbe1;color:#243b43}
.sb-rw-cloud[data-scene="data"]{background:#211d2d;border-color:#4b4160}
.sb-rw-cloud[data-scene="dossier"]{background:#2c261d;border-color:#69563b}
.sb-rw-cloud[data-scene="campaign"]{background:#2a2020;border-color:#634642}
.sb-rw-cloud[data-scene="audit"]{background:#2b261d;border-color:#655333}
.sb-rw-cloud[data-scene="send"]{background:#182b2d;border-color:#315e61}
.sb-rw-cloud[data-scene="queue"]{background:#20262b;border-color:#4d5962}
.sb-rw-cloud[data-scene="browser"] .sb-rw-cloud-top{background:#dcecf2;color:#3f5b65}
.sb-rw-cloud[data-scene="strategy"] .sb-rw-cloud-top{background:#243454;color:#b7c9ee}
.sb-rw-cloud[data-scene="data"] .sb-rw-cloud-top{background:#302a43;color:#d2c8f5}
.sb-rw-cloud[data-scene="dossier"] .sb-rw-cloud-top{background:#403527;color:#e8d6b8}
.sb-rw-cloud[data-scene="campaign"] .sb-rw-cloud-top{background:#49302e;color:#f0c8c2}
.sb-rw-cloud[data-scene="audit"] .sb-rw-cloud-top{background:#483923;color:#f0d39a}
.sb-rw-cloud[data-scene="send"] .sb-rw-cloud-top{background:#214447;color:#b7e2df}
.sb-rw-cloud[data-scene="queue"] .sb-rw-cloud-top{background:#303942;color:#cbd5dd}
.sb-rw-cloud[data-scene="browser"] .sb-rw-cloud-screen{color:#34515a;font-family:inherit}
.sb-rw-cloud[data-scene="browser"] .sb-rw-screen-heading{color:#1f3840}
.sb-rw-cloud[data-scene="browser"] .sb-rw-screen-heading em{color:#188a78}
.sb-rw-cloud[data-scene="strategy"] .sb-rw-screen-heading em{color:#96b8ff}
.sb-rw-cloud[data-scene="data"] .sb-rw-screen-heading em{color:#c5adff}
.sb-rw-cloud[data-scene="dossier"] .sb-rw-screen-heading em{color:#edc879}
.sb-rw-cloud[data-scene="campaign"] .sb-rw-screen-heading em{color:#ff9b88}
.sb-rw-cloud[data-scene="audit"] .sb-rw-screen-heading em{color:#f1c46d}
.sb-rw-cloud[data-scene="send"] .sb-rw-screen-heading em{color:#79ded1}
.sb-rw-cloud[data-scene="queue"] .sb-rw-screen-heading em{color:#b6c8d8}
.sb-rw-scene-toolbar{display:flex;align-items:center;gap:7px;margin:0 0 12px;padding:7px 9px;border-radius:6px;background:rgba(255,255,255,.08);font-size:10px}
.sb-rw-scene-toolbar span:first-child{width:7px;height:7px;border-radius:50%;background:#29c487;box-shadow:0 0 0 3px rgba(41,196,135,.14)}
.sb-rw-scene-toolbar strong{font-weight:600;color:inherit}
.sb-rw-scene-toolbar small{margin-left:auto;opacity:.65;font-size:9px}
.sb-rw-scene-list{display:grid;gap:7px}
.sb-rw-scene-row{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.065)}
.sb-rw-scene-row > div{min-width:0;flex:1}
.sb-rw-scene-row strong{display:block;color:#f5faf7;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-scene-row span{display:block;margin-top:3px;color:rgba(225,239,231,.66);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-scene-row em{font-style:normal;color:#6fe0ad;font-size:9px;white-space:nowrap}
.sb-rw-scene-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:10px}
.sb-rw-scene-stat{padding:8px 9px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.065)}
.sb-rw-scene-stat span{display:block;color:rgba(225,239,231,.66);font-size:8px}
.sb-rw-scene-stat strong{display:block;margin-top:4px;color:#fff;font-size:14px;font-weight:650}
.sb-rw-scene-draft{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(255,255,255,.07);color:#e6f3ec;font-size:9px;line-height:1.55}
.sb-rw-scene-draft header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;color:#fff;font-size:10px;font-weight:600}
.sb-rw-scene-draft header em{color:#ffad8f;font-size:9px;font-style:normal;font-weight:500}
.sb-rw-scene-draft p{margin:0;color:rgba(225,239,231,.78)}
.sb-rw-scene-verdict{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 10px;border-radius:6px;background:rgba(213,170,88,.14);color:#f3d78f;font-size:9px}
.sb-rw-scene-verdict i{width:8px;height:8px;border-radius:50%;background:#d5aa58}
.sb-rw-scene-chat{display:grid;gap:7px;margin-top:10px}
.sb-rw-scene-chat-row{max-width:84%;padding:8px 9px;border-radius:8px;background:rgba(255,255,255,.09);color:#d6ece6;font-size:9px;line-height:1.45}
.sb-rw-scene-chat-row.is-agent{justify-self:end;background:#22534c;color:#d8fff4}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-row{border-color:#cfe1e5;background:#fff}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-row strong{color:#23434b}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-row span{color:#779097}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-row em{color:#168d78}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-stat{border-color:#cfe1e5;background:#fff}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-stat span{color:#779097}
.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-stat strong{color:#23434b}
.sb-rw-cloud.is-image{min-height:0;border-color:#cfe1e5;background:#fff;box-shadow:0 8px 20px rgba(36,72,82,.08)}
.sb-rw-douyin-image{display:block;width:100%;aspect-ratio:3 / 2;object-fit:cover;object-position:center;border:0;border-radius:inherit;background:#fff}
.sb-rw-scene-table{border:1px solid rgba(255,255,255,.13);border-radius:6px;overflow:hidden}
.sb-rw-scene-table-row{display:grid;grid-template-columns:1.2fr .8fr .5fr;gap:7px;padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.1);color:#d8d0ef;font-size:9px}
.sb-rw-scene-table-row:last-child{border-bottom:0}
.sb-rw-scene-table-row:first-child{background:rgba(255,255,255,.07);color:#fff;font-weight:600}
.sb-rw-scene-dossier{display:grid;grid-template-columns:78px 1fr;gap:11px;align-items:start}
.sb-rw-scene-profile{padding:11px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(255,255,255,.08);text-align:center}
.sb-rw-scene-profile b{display:grid;place-items:center;width:38px;height:38px;margin:0 auto 8px;border-radius:50%;background:#d9a85a;color:#332719;font-size:16px}
.sb-rw-scene-profile strong{display:block;color:#fff;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-scene-profile span{display:block;margin-top:3px;color:#d6c6a7;font-size:9px}
.sb-rw-scene-facts{display:grid;gap:7px}
.sb-rw-scene-fact{padding:8px 9px;border-left:2px solid #d9a85a;background:rgba(255,255,255,.07)}
.sb-rw-scene-fact strong{display:block;color:#fff;font-size:9px;font-weight:600}
.sb-rw-scene-fact span{display:block;margin-top:3px;color:#d5c6ad;font-size:9px;line-height:1.45}
.sb-rw-scene-steps{display:grid;gap:6px}
.sb-rw-scene-step{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:6px;background:rgba(255,255,255,.075)}
.sb-rw-scene-step b{display:grid;place-items:center;width:19px;height:19px;border-radius:50%;background:#c85b4b;color:#fff;font-size:9px}
.sb-rw-scene-step span{color:#f4e3df;font-size:9px}
.sb-rw-scene-step.is-done b{background:#47c69b}.sb-rw-scene-step.is-done span{color:#b7e5d4}
.sb-rw-scene-checks{display:grid;gap:6px}
.sb-rw-scene-check{display:flex;align-items:center;gap:8px;padding:8px 9px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.06);color:#f3e5c6;font-size:9px}
.sb-rw-scene-check i{width:13px;height:13px;border:1px solid #d5aa58;border-radius:3px}.sb-rw-scene-check.is-done i{background:#d5aa58;box-shadow:inset 0 0 0 3px #332a1d}
.sb-rw-scene-check.is-done{color:#d4c49f}
.sb-rw-scene-batch{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-radius:6px;background:rgba(255,255,255,.08);color:#d2eeeb;font-size:9px}
.sb-rw-scene-batch strong{color:#fff;font-size:11px}.sb-rw-scene-batch em{font-style:normal;color:#7ddbd1}
.sb-rw-scene-meter{height:6px;margin-top:8px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}.sb-rw-scene-meter i{display:block;height:100%;border-radius:inherit;background:#61d9c3}
.sb-rw-scene-inbox{display:grid;gap:6px}.sb-rw-scene-inbox-row{display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid rgba(255,255,255,.1);color:#d3dde5;font-size:9px}.sb-rw-scene-inbox-row i{width:7px;height:7px;border-radius:50%;background:#94a7b5}.sb-rw-scene-inbox-row.is-hot i{background:#e8a83e}.sb-rw-scene-inbox-row span{margin-left:auto;color:#8ee3ac}
.sb-rw-cloud-caption{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;color:#63736b;font-size:10px}
.sb-rw-cloud-caption button{border:0;background:none;color:#159965;font:inherit;font-size:10px;cursor:pointer}
.sb-rw-queue{padding-bottom:5px}
.sb-rw-queue-list{max-height:405px;overflow-y:auto}
.sb-rw-queue-item{display:flex;align-items:center;gap:9px;width:100%;padding:12px 15px;border:0;border-bottom:1px solid #f0f3f1;background:#fff;text-align:left;cursor:pointer;font:inherit}
.sb-rw-queue-item:hover,.sb-rw-queue-item.is-selected{background:#f7fbf9}
.sb-rw-queue-item.is-selected{box-shadow:inset 3px 0 #15b578}
.sb-rw-queue-copy{min-width:0;flex:1}
.sb-rw-queue-name{display:flex;align-items:center;gap:5px;min-width:0;font-size:11px;font-weight:620}
.sb-rw-queue-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-queue-task{margin-top:4px;color:#8c9892;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-queue-progress{display:flex;align-items:center;gap:8px;margin-top:7px}
.sb-rw-queue-progress div{height:4px;flex:1;border-radius:99px;background:#e7eeeb;overflow:hidden}.sb-rw-queue-progress i{display:block;height:100%;border-radius:inherit;background:#18b779}.sb-rw-queue-progress b{color:#6c7b73;font-size:9px;font-weight:550}
.sb-rw-lead-head-status{display:inline-flex;align-items:center;gap:6px;color:#159965;font-size:10px;white-space:nowrap}.sb-rw-lead-head-status i{width:7px;height:7px;border-radius:50%;background:#1abb79;box-shadow:0 0 0 4px rgba(27,187,121,.13)}
.sb-rw-lead-list{max-height:405px;overflow-y:auto;padding:0 14px}.sb-rw-lead-item{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;padding:14px 0;border-bottom:1px solid #edf1ef}.sb-rw-lead-item:last-child{border-bottom:0}.sb-rw-lead-item.is-selected{margin:0 -7px;padding:14px 7px;border-radius:12px;background:#f6fbf8}.sb-rw-prospect-avatar{width:38px;height:38px;border-radius:50%;background-image:url("${PROSPECT_AVATAR_SPRITE}");background-size:200% 200%;background-repeat:no-repeat;box-shadow:0 0 0 2px #fff,0 0 0 3px #e4ece8}.sb-rw-prospect-avatar.is-0{background-position:0 0}.sb-rw-prospect-avatar.is-1{background-position:100% 0}.sb-rw-prospect-avatar.is-2{background-position:0 100%}.sb-rw-prospect-avatar.is-3{background-position:100% 100%}
.sb-rw-lead-name{display:flex;align-items:center;gap:6px;min-width:0;color:#27362f;font-size:12px;font-weight:680}.sb-rw-lead-name span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-rw-lead-score{flex:none;color:#3b6bd4;font-size:10px;font-weight:600}.sb-rw-lead-meta{display:flex;align-items:center;gap:8px;margin-top:5px;color:#a0aaa5;font-size:10px;white-space:nowrap}.sb-rw-lead-state{display:inline-flex;align-items:center;gap:5px;color:#5d6f83}.sb-rw-lead-state i{width:7px;height:7px;border-radius:50%;background:#3b6bd4;box-shadow:0 0 0 4px rgba(59,107,212,.14)}.sb-rw-lead-source{color:#a3aaa6}.sb-rw-lead-quote{margin:7px 0 0;color:#3e4d45;font-size:11px;line-height:1.45;word-break:break-word}
.sb-rw-prospect-body{padding:15px}
.sb-rw-output-body{padding:14px}
.sb-rw-output-list{display:grid;gap:8px}
.sb-rw-output-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;width:100%;padding:10px 11px;border:1px solid #edf1ef;border-radius:10px;background:#fbfcfb;text-align:left;color:#25332c;font:inherit;cursor:pointer}
.sb-rw-output-row:hover,.sb-rw-output-row.is-selected{border-color:#a9dcc5;background:#f2fbf6}
.sb-rw-output-main{min-width:0}
.sb-rw-output-name{display:block;font-size:11px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-output-value{display:block;margin-top:4px;color:#5d6c64;font-size:10px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-rw-output-state{align-self:center;color:#159965;font-size:10px;white-space:nowrap}
.sb-rw-output-detail{margin-top:10px;padding:11px;border-radius:10px;background:#f0faf5;color:#42564b;font-size:10px;line-height:1.55}
.sb-rw-output-detail strong{display:block;margin-bottom:4px;color:#158d61;font-size:11px}
.sb-rw-output-actions{display:flex;gap:8px;margin-top:11px}
.sb-rw-output-action{height:31px;padding:0 11px;border:1px solid #d5e8de;border-radius:8px;background:#fff;color:#168f62;font:inherit;font-size:10px;cursor:pointer}
.sb-rw-output-action:hover{background:#f2fbf6;border-color:#9dd5bb}
.sb-rw-search-result-body{padding:12px 14px 14px}
.sb-rw-search-result-intro{margin-bottom:10px;color:#99a39e;font-size:10px;line-height:1.4}
.sb-rw-search-user-list{display:grid;gap:8px}
.sb-rw-search-user-card{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:start;gap:9px;width:100%;padding:10px;border:1px solid #e9edef;border-radius:10px;background:#fff;color:#27332f;text-align:left;font:inherit;cursor:pointer;transition:border-color 140ms ease,background 140ms ease,box-shadow 140ms ease}
.sb-rw-search-user-card:hover,.sb-rw-search-user-card.is-selected{border-color:#d4d4d4;background:#f4f4f5;box-shadow:0 0 0 1px rgba(38,38,38,.04)}
.sb-rw-search-user-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background-image:url("${PROSPECT_AVATAR_SPRITE}");background-size:200% 200%;background-repeat:no-repeat;box-shadow:0 0 0 2px #fff,0 0 0 3px #e5e8eb}
.sb-rw-search-user-avatar.is-0{background-position:0 0}.sb-rw-search-user-avatar.is-1{background-position:100% 0}.sb-rw-search-user-avatar.is-2{background-position:0 100%}.sb-rw-search-user-avatar.is-3{background-position:100% 100%}
.sb-rw-search-user-content{display:block;min-width:0}
.sb-rw-search-user-title{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;font-weight:680;line-height:1.3}
.sb-rw-search-user-title>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-search-user-meta{display:block;margin-top:3px;color:#9aa39f;font-size:9px;line-height:1.3}
.sb-rw-search-user-fields{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:7px;margin-top:8px}
.sb-rw-search-user-field{display:block;min-width:0;color:#9aa39f;font-size:8px;line-height:1.3}
.sb-rw-search-user-field strong{display:block;margin-top:2px;overflow:hidden;color:#56615c;font-size:9px;font-weight:550;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-intent-tag,.sb-rw-search-user-action{display:inline-flex;align-items:center;flex:none;white-space:nowrap;font-size:9px;font-weight:600}
.sb-rw-intent-tag{padding:2px 5px;border-radius:4px}.sb-rw-intent-tag.is-high{background:#edf3ff;color:#2f80ed}.sb-rw-intent-tag.is-low{background:#f0f1f2;color:#727b83}
.sb-rw-search-user-action{align-self:start;padding-top:2px}.sb-rw-search-user-action.is-high{color:#2f80ed}.sb-rw-search-user-action.is-low{color:#727b83}
.sb-rw-search-result-body>.sb-rw-output-action{margin-top:12px}
.sb-rw-outreach-list{display:grid;gap:0}
.sb-rw-outreach-item{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:12px;width:100%;padding:13px 15px;border:0;border-bottom:1px solid #edf1ef;background:#fff;color:#26332e;text-align:left;font:inherit;cursor:pointer;transition:background 140ms ease,box-shadow 140ms ease}
.sb-rw-outreach-item:last-child{border-bottom:0}.sb-rw-outreach-item:hover,.sb-rw-outreach-item.is-selected{background:#f4f4f5}.sb-rw-outreach-item.is-selected{box-shadow:inset 3px 0 #262626}
.sb-rw-outreach-identity{display:flex;align-items:center;gap:9px;min-width:0}.sb-rw-outreach-copy{display:block;min-width:0}.sb-rw-outreach-name{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;font-weight:680}.sb-rw-outreach-name>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-rw-outreach-source{flex:none;color:#2f80ed;font-size:9px;font-weight:550}.sb-rw-outreach-channel{display:block;margin-top:5px;color:#8e9994;font-size:10px}
.sb-rw-outreach-progress{display:flex;align-items:center;gap:8px;min-width:0}.sb-rw-outreach-progress>span:first-child{display:block;height:5px;flex:1;border-radius:99px;background:#e6ebee;overflow:hidden}.sb-rw-outreach-progress i{display:block;height:100%;border-radius:inherit;background:#2f80ed}.sb-rw-outreach-status{flex:none;color:#596772;font-size:9px;white-space:nowrap}.sb-rw-outreach-status.is-muted{color:#89939a}
.sb-rw-outreach-detail-body{padding:12px 14px 14px}.sb-rw-outreach-profile{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #e6eaed;border-radius:10px;background:#fafafa}.sb-rw-outreach-profile-copy{display:block;min-width:0}.sb-rw-outreach-profile-title{display:flex;align-items:center;gap:7px;min-width:0}.sb-rw-outreach-profile-title strong{overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-outreach-facts{display:grid;gap:7px;margin-top:10px}.sb-rw-outreach-fact{display:grid;grid-template-columns:68px minmax(0,1fr);gap:10px;padding-bottom:7px;border-bottom:1px solid #edf1ef}.sb-rw-outreach-fact:last-child{border-bottom:0}.sb-rw-outreach-fact>span{color:#9aa39f;font-size:9px}.sb-rw-outreach-fact strong{color:#53605a;font-size:10px;font-weight:550;line-height:1.45}
.sb-rw-outreach-timeline{margin-top:11px}.sb-rw-outreach-section-label{margin-bottom:7px;color:#8e9994;font-size:10px;font-weight:650}.sb-rw-outreach-timeline-step{display:grid;grid-template-columns:9px minmax(0,1fr) auto;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid #edf1ef}.sb-rw-outreach-timeline-step:last-child{border-bottom:0}.sb-rw-outreach-timeline-step i{width:7px;height:7px;border-radius:50%;background:#aeb8be}.sb-rw-outreach-timeline-step.is-done i{background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.12)}.sb-rw-outreach-timeline-copy{color:#697670;font-size:9px;line-height:1.35}.sb-rw-outreach-timeline-step strong{color:#7e8b85;font-size:9px;font-weight:550;white-space:nowrap}.sb-rw-outreach-message{margin-top:10px;padding:10px;border-radius:9px;background:#f4f4f5}.sb-rw-outreach-message span{display:block;color:#959e9a;font-size:9px}.sb-rw-outreach-message strong{display:block;margin-top:4px;color:#4c5953;font-size:10px;font-weight:550;line-height:1.45}
.sb-rw-outreach-detail-body .sb-rw-output-actions{flex-wrap:wrap}.sb-rw-outreach-detail-body .sb-rw-output-action{flex:1;min-width:84px}.sb-rw-outreach-detail-body .sb-rw-output-action:disabled{border-color:#e2e5e7;background:#f4f5f6;color:#8e989d;cursor:default}
.sb-rw-prospect-profile{display:flex;align-items:center;gap:10px;padding-bottom:15px;border-bottom:1px solid #edf1ef}
.sb-rw-profile-avatar{width:42px;height:42px;border-radius:50%;overflow:hidden;background:#dceee7;display:grid;place-items:center;color:#168c61;font-weight:650}
.sb-rw-prospect-name{font-size:13px;font-weight:650}.sb-rw-prospect-source{margin-top:4px;color:#8b9891;font-size:10px}
.sb-rw-intent{margin:14px 0;padding:12px;border-radius:10px;background:#f0faf5}
.sb-rw-intent-top{display:flex;align-items:center;justify-content:space-between;color:#219c6c;font-size:11px}.sb-rw-intent-score{font-size:22px;font-weight:700}
.sb-rw-intent-bar{height:5px;margin-top:9px;border-radius:99px;background:#d6eee2;overflow:hidden}.sb-rw-intent-bar span{display:block;width:92%;height:100%;border-radius:inherit;background:#19b97a}
.sb-rw-signal{padding:0 0 10px}.sb-rw-signal:last-child{padding-bottom:0}.sb-rw-signal-label{color:#a0aaa5;font-size:10px}.sb-rw-signal-value{margin-top:4px;color:#39463f;font-size:11px;line-height:1.45}
.sb-rw-detail{display:flex;align-items:center;justify-content:center;width:100%;height:32px;margin-top:16px;border:1px solid #d8e7df;border-radius:8px;background:#fff;color:#159965;font:inherit;font-size:11px;cursor:pointer}.sb-rw-detail:hover{background:#f2fbf6}
.sb-rw-events{margin-top:14px}.sb-rw-events .sb-rw-panel-head{border-bottom:0}.sb-rw-events-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:0 14px 14px}.sb-rw-events-empty{grid-column:1/-1;padding:14px;border:1px dashed #dfe7e2;border-radius:9px;color:#8b9690;font-size:11px;text-align:center}
.sb-rw-live-work-body{display:grid;gap:12px;padding:16px 14px}.sb-rw-live-work-task{color:#27352e;font-size:13px;line-height:1.5}.sb-rw-live-work-phase{color:#7f8c85;font-size:11px}.sb-rw-live-work-progress{display:flex;align-items:center;gap:10px}.sb-rw-live-work-progress>div{height:6px;flex:1;overflow:hidden;border-radius:99px;background:#e5ece8}.sb-rw-live-work-progress i{display:block;height:100%;border-radius:inherit;background:#2f80ed;transition:width .25s ease}.sb-rw-live-work-progress>span{min-width:42px;color:#6e7a73;font-size:10px;text-align:right}.sb-rw-live-work-activities{display:grid;gap:7px}.sb-rw-live-work-activity{padding:8px 9px;border-left:2px solid #2f80ed;background:#f7faf8;color:#526159;font-size:10px;line-height:1.45}.sb-rw-live-work-activity.is-error{border-left-color:#cf5c53;background:#fff5f3;color:#a24139}.sb-rw-live-work-empty{color:#99a49e;font-size:10px}
.sb-rw-live-work-progress.is-indeterminate>div{position:relative;overflow:hidden}.sb-rw-live-work-progress.is-indeterminate>div::after{display:block;width:38%;height:100%;border-radius:inherit;background:#2f80ed;content:"";animation:sb-rw-live-progress 1.5s ease-in-out infinite}.sb-rw-acquisition-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.sb-rw-acquisition-meta-item{display:grid;gap:3px;padding:8px 9px;border:1px solid #e4ece7;border-radius:8px;background:#fbfdfc}.sb-rw-acquisition-meta-item span{color:#89968f;font-size:9px}.sb-rw-acquisition-meta-item strong{overflow:hidden;color:#405148;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-acquisition-controls{display:flex;gap:7px;flex-wrap:wrap}.sb-rw-acquisition-control{height:29px;padding:0 11px;border:1px solid #d8e3dc;border-radius:7px;background:#fff;color:#53645a;font:inherit;font-size:10px;cursor:pointer}.sb-rw-acquisition-control:hover{border-color:#2f80ed;color:#2f80ed}.sb-rw-acquisition-control:disabled{cursor:default;opacity:.45}
.sb-rw-task-update-mask{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:24px;background:rgba(18,25,22,.32)}.sb-rw-task-update-dialog{width:min(920px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border:1px solid #dfe9e3;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(18,39,28,.2);font-family:inherit}.sb-rw-task-update-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:19px 22px 15px;border-bottom:1px solid #edf1ef}.sb-rw-task-update-head h2{margin:0;color:#213028;font-size:18px}.sb-rw-task-update-head p{margin:6px 0 0;color:#7b8981;font-size:11px;line-height:1.5}.sb-rw-task-update-close{width:30px;height:30px;border:0;border-radius:8px;background:#f4f7f5;color:#64726a;font-size:20px;line-height:1;cursor:pointer}.sb-rw-task-update-close:hover{background:#e9f0ec}.sb-rw-task-update-body{display:grid;gap:15px;padding:18px 22px 21px}.sb-rw-task-update-boundary{padding:10px 12px;border:1px solid #d8e9df;border-radius:9px;background:#f5fbf7;color:#547064;font-size:10px;line-height:1.55}.sb-rw-task-update-boundary strong{color:#277a58}.sb-rw-task-update-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:15px}.sb-rw-task-update-section{display:grid;gap:10px;padding:13px;border:1px solid #e7eeea;border-radius:11px;background:#fbfdfc}.sb-rw-task-update-section h3{margin:0;color:#34453c;font-size:12px}.sb-rw-task-update-field{display:grid;gap:5px}.sb-rw-task-update-field label{color:#7d8b83;font-size:10px}.sb-rw-task-update-field input,.sb-rw-task-update-field select,.sb-rw-task-update-field textarea{width:100%;padding:8px 9px;border:1px solid #dce6e0;border-radius:7px;background:#fff;color:#2d3a33;font:inherit;font-size:11px;outline:none}.sb-rw-task-update-field input:focus,.sb-rw-task-update-field select:focus,.sb-rw-task-update-field textarea:focus{border-color:#6cb991;box-shadow:0 0 0 2px rgba(108,185,145,.12)}.sb-rw-task-update-field textarea{min-height:54px;resize:vertical;line-height:1.45}.sb-rw-task-update-readonly{display:grid;gap:2px;min-height:35px;padding:8px 9px;border:1px solid #dce6e0;border-radius:7px;background:#f5f8f6;color:#405148;font-size:11px;line-height:1.4}.sb-rw-task-update-readonly strong{font-weight:600}.sb-rw-task-update-readonly small{color:#829087;font-size:9px}.sb-rw-task-update-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sb-rw-task-update-preview>section{min-width:0;padding:11px;border:1px solid #e5ece8;border-radius:9px;background:#fff}.sb-rw-task-update-preview h4{margin:0 0 7px;color:#66766d;font-size:10px}.sb-rw-task-update-summary{display:grid;gap:10px;max-height:230px;overflow:auto}.sb-rw-task-update-summary-group{display:grid;gap:4px}.sb-rw-task-update-summary-group h5{margin:0 0 2px;color:#34453c;font-size:10px;font-weight:700}.sb-rw-task-update-summary-row{display:grid;grid-template-columns:minmax(82px,auto) minmax(0,1fr);gap:8px;align-items:start;color:#829087;font-size:9px;line-height:1.45}.sb-rw-task-update-summary-row strong{min-width:0;color:#3d5046;font-size:10px;font-weight:500;white-space:pre-wrap;word-break:break-word}.sb-rw-task-update-impact{display:none;padding:10px 12px;border:1px solid #efd9bb;border-radius:9px;background:#fff9f0;color:#8d6438;font-size:10px;line-height:1.55}.sb-rw-task-update-impact.is-visible{display:block}.sb-rw-task-update-confirm{display:none;align-items:center;gap:8px;padding:10px 12px;border:1px solid #efc9c5;border-radius:9px;background:#fff5f3;color:#964941;font-size:10px;line-height:1.5}.sb-rw-task-update-confirm.is-visible{display:flex}.sb-rw-task-update-confirm input{flex:none}.sb-rw-task-update-error{display:none;padding:9px 11px;border-radius:8px;background:#fff3f1;color:#ae463d;font-size:10px}.sb-rw-task-update-error.is-visible{display:block}.sb-rw-task-update-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px}.sb-rw-task-update-footer button{height:32px;padding:0 13px;border:1px solid #d9e4dd;border-radius:8px;background:#fff;color:#53635a;font:inherit;font-size:10px;cursor:pointer}.sb-rw-task-update-footer button:last-child{border-color:#21885f;background:#21885f;color:#fff}.sb-rw-task-update-footer button:hover{filter:brightness(.97)}.sb-rw-task-update-footer button:disabled{cursor:default;opacity:.5}
@media(max-width:680px){.sb-rw-task-update-grid,.sb-rw-task-update-preview{grid-template-columns:1fr}}
@keyframes sb-rw-live-progress{0%{transform:translateX(-140%)}100%{transform:translateX(360%)}}

.sb-rw-event{display:flex;gap:8px;padding:11px;border:1px solid #edf1ef;border-radius:10px;background:#fbfcfb}.sb-rw-event-dot{width:7px;height:7px;flex:none;margin-top:4px;border-radius:50%;background:#18b779}.sb-rw-event-copy{min-width:0}.sb-rw-event-text{color:#4c5952;font-size:10px;line-height:1.45}.sb-rw-event-time{margin-top:6px;color:#a4ada8;font-size:9px}
.sb-realtime-page{--sb-brand-accent:#3b6bd4;--sb-brand-accent-soft:#eff3fa;--sb-brand-accent-wash:#f6f8fd;--sb-brand-accent-border:#d6e0f0}
.sb-rw-account-card:hover{border-color:#b7c8e5}.sb-rw-account-card.is-active{border-color:var(--sb-brand-accent);box-shadow:0 0 0 2px rgba(59,107,212,.12)}
.sb-rw-team-card:hover{border-color:#b7c8e5}.sb-rw-team-card.is-active{border-color:var(--sb-brand-accent);box-shadow:0 0 0 2px rgba(59,107,212,.11)}
.sb-rw-queue-item:hover,.sb-rw-queue-item.is-selected{background:var(--sb-brand-accent-wash)}.sb-rw-queue-item.is-selected{box-shadow:inset 3px 0 var(--sb-brand-accent)}
.sb-rw-lead-item.is-selected{background:var(--sb-brand-accent-wash)}
.sb-rw-output-row:hover,.sb-rw-output-row.is-selected{border-color:var(--sb-brand-accent-border);background:var(--sb-brand-accent-soft)}
@media (max-width:1200px){.sb-rw-team{gap:10px}.sb-rw-main{grid-template-columns:minmax(350px,1.2fr) minmax(250px,.8fr)}.sb-rw-prospect{grid-column:1/-1}.sb-rw-prospect-body{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sb-rw-prospect-profile{border-bottom:0}.sb-rw-intent{margin:0}.sb-rw-signals{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}
@media (max-width:760px){.sb-realtime-page{padding:20px 16px 26px}.sb-rw-head{display:block}.sb-rw-head-actions{justify-content:flex-start;margin-top:14px}.sb-rw-team{gap:10px}.sb-rw-team-card{flex-basis:190px;min-width:190px;min-height:116px;padding:12px}.sb-rw-kpis{grid-template-columns:repeat(2,1fr)}.sb-rw-kpi{border-bottom:1px solid #edf1ef}.sb-rw-kpi:nth-child(2){border-right:0}.sb-rw-main{display:block}.sb-rw-panel{margin-bottom:12px}.sb-rw-cloud{min-height:300px}.sb-rw-events-list{grid-template-columns:1fr}.sb-rw-workbar{align-items:flex-start;display:block}.sb-rw-phase-tabs{margin-top:10px;width:max-content}.sb-rw-prospect-body,.sb-rw-signals{display:block}.sb-rw-prospect-profile{padding-bottom:12px;border-bottom:1px solid #edf1ef}.sb-rw-intent{margin:14px 0}.sb-rw-signal{padding-bottom:9px}}
@media (max-width:760px){.sb-rw-lead-panel .sb-rw-panel-head{display:block}.sb-rw-lead-panel .sb-rw-lead-head-status{margin-top:8px;white-space:normal}.sb-rw-lead-panel .sb-rw-panel-title{font-size:13px}}
@media (max-width:760px){.sb-rw-account-head{align-items:flex-start;display:block}.sb-rw-account-count{display:block;margin-top:3px}.sb-rw-account-card{flex-basis:205px}}
@media (prefers-reduced-motion:reduce){.sb-rw-team-card{transition:none}}

/* Personal commerce workspace: compact rails, quiet surfaces, one clear accent. */
.sb-realtime-page{padding:22px 26px 30px;background:#f5f7f5}
.sb-rw-account-section{margin-bottom:16px}
.sb-rw-account-head{margin-bottom:8px}
.sb-rw-account-title{font-size:16px;letter-spacing:-.01em}
.sb-rw-account-count{font-size:11px}
.sb-rw-account-list{gap:8px;padding:2px 1px 4px}
.sb-rw-account-card{flex-basis:228px;min-height:78px;padding:10px 11px;border-radius:10px;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-account-name-line{padding-right:58px}
.sb-rw-account-status{position:absolute;top:12px;right:12px}
.sb-rw-account-card.is-active{box-shadow:0 0 0 2px rgba(22,183,122,.1),0 3px 8px rgba(35,57,47,.06)}
.sb-rw-account-thumb{width:50px;height:32px;border-radius:5px}
.sb-rw-team{gap:8px;margin-bottom:18px;padding:1px 1px 5px}
.sb-rw-team-card{flex-basis:196px;min-width:196px;min-height:104px;padding:12px;border-radius:10px;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-team-card.is-active{box-shadow:0 0 0 2px rgba(22,183,122,.1),0 3px 8px rgba(35,57,47,.06)}
.sb-rw-card-meta{top:10px;right:10px}
.sb-rw-kpis{margin-bottom:16px;border-radius:11px;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-kpi{padding:12px 15px}
.sb-rw-kpi-value{font-size:22px}
.sb-rw-workbar{min-height:46px;margin-bottom:10px}
.sb-rw-section-title{font-size:17px;letter-spacing:-.02em}
.sb-rw-main{grid-template-columns:minmax(430px,1.25fr) minmax(250px,.8fr);gap:12px}
.sb-rw-main.is-inbox-work{grid-template-columns:minmax(460px,1.08fr) minmax(180px,.34fr) minmax(480px,1.24fr);align-items:start}
.sb-rw-main.is-inbox-work .sb-rw-inbox-status-panel{align-self:start}
.sb-rw-main.is-inbox-work .sb-rw-inbox-conversations{min-height:520px;align-self:stretch}
.sb-rw-main.is-comment-acquisition-work{grid-template-columns:minmax(0,1.25fr) minmax(360px,.85fr);align-items:stretch}
.sb-rw-main.is-comment-acquisition-work .sb-rw-acquisition-progress-panel,.sb-rw-main.is-comment-acquisition-work .sb-rw-acquisition-conversation-panel{min-height:520px;align-self:stretch}
.sb-rw-acquisition-head{align-items:flex-start}.sb-rw-acquisition-head>div{display:grid;gap:3px;min-width:0}.sb-rw-acquisition-running{display:inline-flex;align-items:center;gap:7px;flex:none;color:#6e7b74;font-size:9px;white-space:nowrap}.sb-rw-acquisition-running i{width:7px;height:7px;border-radius:50%;background:#18a86f;box-shadow:0 0 0 3px rgba(24,168,111,.1)}
.sb-rw-acquisition-progress-body{display:grid;gap:12px;padding:13px 14px 14px}.sb-rw-acquisition-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;border:1px solid #e5ebe8;border-radius:8px;background:#e5ebe8;gap:1px}.sb-rw-acquisition-metric{display:grid;gap:3px;padding:10px;background:#fbfcfb}.sb-rw-acquisition-metric strong{color:#202a25;font-size:17px;line-height:1}.sb-rw-acquisition-metric span{color:#8b9690;font-size:9px;white-space:nowrap}
.sb-rw-acquisition-works{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}.sb-rw-acquisition-works>span{flex:none;color:#929d97;font-size:9px}.sb-rw-acquisition-works strong{min-width:0;overflow:hidden;padding:5px 7px;border:1px solid #e5ebe8;border-radius:6px;background:#fff;color:#58665f;font-size:9px;font-weight:560;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-acquisition-people{display:grid;gap:7px;max-height:390px;overflow:auto}.sb-rw-acquisition-person{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;padding:10px;border:1px solid #e5ebe8;border-radius:8px;background:#fff}.sb-rw-acquisition-avatar{display:grid;place-items:center;width:34px;height:34px;overflow:hidden;border-radius:50%;background:#f0f2f1;color:#37433d;font-size:12px;font-weight:700}.sb-rw-acquisition-avatar img{width:100%;height:100%;object-fit:cover}.sb-rw-acquisition-person-content{min-width:0}.sb-rw-acquisition-person-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.sb-rw-acquisition-person-top strong{overflow:hidden;color:#27332d;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-acquisition-person-top span,.sb-rw-acquisition-conversation-top>span{flex:none;padding:3px 6px;border-radius:5px;background:#f1f3f2;color:#6d7973;font-size:8px;font-weight:650}.sb-rw-acquisition-person-top span.is-high,.sb-rw-acquisition-conversation-top>span.is-replied{background:#eaf8f1;color:#13875a}.sb-rw-acquisition-person-top span.is-medium,.sb-rw-acquisition-conversation-top>span.is-received{background:#fff6e6;color:#936415}.sb-rw-acquisition-conversation-top>span.is-failed{background:#fff0ee;color:#b34d44}
.sb-rw-acquisition-quote{margin:6px 0 0;color:#46534c;font-size:10px;line-height:1.45}.sb-rw-acquisition-reason{margin-top:5px;color:#89948e;font-size:9px;line-height:1.45}.sb-rw-acquisition-touch{margin-top:7px;padding:7px 8px;border-left:2px solid #2f80ed;background:#f6f9fd;color:#596a61;font-size:9px;line-height:1.45}.sb-rw-acquisition-compact-controls{display:flex;gap:7px;padding-top:2px}.sb-rw-acquisition-compact-controls button{height:29px;padding:0 10px;border:1px solid #d9e2dd;border-radius:7px;background:#fff;color:#53615a;font:inherit;font-size:9px;cursor:pointer}.sb-rw-acquisition-compact-controls button:hover{border-color:#a8b7af;color:#26342d}.sb-rw-acquisition-compact-controls button.is-danger{margin-left:auto;color:#a44b43}.sb-rw-acquisition-compact-controls button:disabled{cursor:default;opacity:.45}
.sb-rw-acquisition-conversations{display:grid;gap:8px;max-height:464px;padding:12px 14px 8px;overflow:auto}.sb-rw-acquisition-conversation{display:grid;gap:8px;padding:11px;border:1px solid #e5ebe8;border-radius:8px;background:#fff}.sb-rw-acquisition-conversation-top{display:flex;align-items:center;justify-content:space-between;gap:9px}.sb-rw-acquisition-conversation-person{display:flex;align-items:center;gap:8px;min-width:0}.sb-rw-acquisition-conversation-person .sb-rw-acquisition-avatar{width:30px;height:30px}.sb-rw-acquisition-conversation-person strong{overflow:hidden;color:#27332d;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-acquisition-bubble{max-width:92%;padding:7px 9px;border-radius:7px;background:#f4f5f5}.sb-rw-acquisition-bubble.is-user{justify-self:end;background:#eef4fb}.sb-rw-acquisition-bubble span{display:block;color:#8b9690;font-size:8px}.sb-rw-acquisition-bubble p{margin:3px 0 0;color:#46534c;font-size:9px;line-height:1.5}.sb-rw-acquisition-conversation-time{justify-self:end;color:#a0a9a4;font-size:8px}.sb-rw-acquisition-results{height:31px;margin:2px 14px 14px;border:1px solid #d9e2dd;border-radius:7px;background:#fff;color:#34423a;font:inherit;font-size:9px;cursor:pointer}.sb-rw-acquisition-results:hover{background:#f7f9f8}.sb-rw-acquisition-empty{display:grid;place-items:center;min-height:180px;padding:24px;text-align:center}.sb-rw-acquisition-empty.is-conversation{min-height:330px}.sb-rw-acquisition-empty i{width:8px;height:8px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.1)}.sb-rw-acquisition-empty strong{margin-top:12px;color:#34423a;font-size:12px}.sb-rw-acquisition-empty span{max-width:250px;margin-top:5px;color:#8c9792;font-size:9px;line-height:1.6}
.sb-rw-inbox-status-body{display:grid;gap:11px;padding:14px}
.sb-rw-inbox-running{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #e2e9e5;border-radius:9px;background:#fbfcfb;color:#334139;font-size:11px;font-weight:680}
.sb-rw-inbox-running i{width:8px;height:8px;flex:none;border-radius:50%;background:#18a86f;box-shadow:0 0 0 4px rgba(24,168,111,.1)}
.sb-rw-inbox-running.is-error{border-color:#f0d7d3;background:#fff7f5;color:#a84840}.sb-rw-inbox-running.is-error i{background:#cf5c53;box-shadow:0 0 0 4px rgba(207,92,83,.1)}
.sb-rw-inbox-running.is-stopped{color:#7b8780}.sb-rw-inbox-running.is-stopped i{background:#9ba59f;box-shadow:0 0 0 4px rgba(155,165,159,.1)}
.sb-rw-inbox-status-list{display:grid;gap:0;border-top:1px solid #edf1ef}
.sb-rw-inbox-status-row{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid #edf1ef}.sb-rw-inbox-status-row span{color:#929d97;font-size:9px}.sb-rw-inbox-status-row strong{color:#46554d;font-size:10px;font-weight:600;line-height:1.5}
.sb-rw-inbox-status-note{color:#8d9892;font-size:9px;line-height:1.55}
.sb-rw-inbox-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin:12px 14px 0;overflow:hidden;border:1px solid #e5ebe8;border-radius:10px;background:#e5ebe8}
.sb-rw-inbox-stat{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:10px 11px;background:#fbfcfb}
.sb-rw-inbox-stat strong{color:#202a25;font-size:16px;font-weight:720}.sb-rw-inbox-stat span{color:#8b9690;font-size:10px}
.sb-rw-inbox-list{display:grid;gap:8px;max-height:560px;padding:12px 14px 16px;overflow:auto}
.sb-rw-inbox-item{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;padding:12px;border:1px solid #e5ebe8;border-radius:11px;background:#fff;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-inbox-avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:#f0f3f1;color:#35433b;font-size:13px;font-weight:720}
.sb-rw-inbox-item-content{min-width:0}.sb-rw-inbox-item-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.sb-rw-inbox-item-top strong{overflow:hidden;color:#26332c;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-inbox-status{flex:none;padding:3px 7px;border-radius:99px;background:#eef4f1;color:#64736b;font-size:9px;font-weight:650}.sb-rw-inbox-status.is-sent{background:#eaf8f1;color:#13875a}.sb-rw-inbox-status.is-failed,.sb-rw-inbox-status.is-error{background:#fff0ee;color:#b34d44}.sb-rw-inbox-status.is-pending,.sb-rw-inbox-status.is-pending_approval,.sb-rw-inbox-status.is-skipped{background:#fff7e8;color:#9c6a14}
.sb-rw-inbox-message{margin-top:7px;overflow:hidden;color:#3f4d45;font-size:11px;line-height:1.55;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-reply{margin-top:7px;padding:8px 9px;border-left:2px solid #2f80ed;background:#f6f9fd;color:#66766d;font-size:10px;line-height:1.5}
.sb-rw-inbox-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;color:#9aa49f;font-size:9px}.sb-rw-inbox-meta time{font:inherit}
.sb-rw-inbox-empty{display:grid;place-items:center;min-height:320px;padding:28px;text-align:center}.sb-rw-inbox-empty i{width:9px;height:9px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 5px rgba(47,128,237,.1)}.sb-rw-inbox-empty strong{margin-top:14px;color:#34423a;font-size:13px}.sb-rw-inbox-empty span{max-width:260px;margin-top:6px;color:#8c9792;font-size:10px;line-height:1.6}
.sb-rw-inbox-workbench{grid-column:1/-1;display:grid;gap:12px;min-width:0}
.sb-rw-inbox-funnel{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));overflow:hidden;border:1px solid #e5ebe8;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-inbox-funnel-step{position:relative;display:grid;gap:6px;min-width:0;padding:15px 18px;border-right:1px solid #edf1ef;background:#fff}.sb-rw-inbox-funnel-step:last-child{border-right:0}.sb-rw-inbox-funnel-step:not(:last-child)::after{position:absolute;z-index:1;top:50%;right:-10px;display:grid;place-items:center;width:20px;height:20px;border:1px solid #d9e4df;border-radius:50%;background:#fff;color:#2f80ed;content:"→";font-size:12px;line-height:1;transform:translateY(-50%)}
.sb-rw-inbox-funnel-step span{overflow:hidden;color:#89968f;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-funnel-step strong{color:#242d28;font-size:23px;line-height:1;font-weight:720}.sb-rw-inbox-funnel-step.is-accent{background:#f5f8fe}.sb-rw-inbox-funnel-step.is-accent strong{color:#2f80ed}
.sb-rw-inbox-shell{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(390px,1.65fr) minmax(230px,.85fr);min-height:520px;overflow:hidden;border:1px solid #e5ebe8;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-inbox-sidebar,.sb-rw-inbox-chat,.sb-rw-inbox-details{min-width:0}.sb-rw-inbox-sidebar{display:grid;grid-template-rows:auto auto minmax(0,1fr);border-right:1px solid #edf1ef;background:#f8f9f8}.sb-rw-inbox-sidebar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px 12px 9px}.sb-rw-inbox-tabs{display:flex;gap:3px;padding:3px;border-radius:8px;background:#eef0ef}.sb-rw-inbox-tab{height:27px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:#76837c;font:inherit;font-size:10px;cursor:pointer}.sb-rw-inbox-tab.is-active{background:#fff;color:#26332c;box-shadow:0 1px 2px rgba(35,57,47,.08);font-weight:650}.sb-rw-inbox-tool{width:27px;height:27px;border:1px solid #dfe7e2;border-radius:7px;background:#fff;color:#69766f;font:inherit;font-size:15px;cursor:pointer}.sb-rw-inbox-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:0 12px 11px}.sb-rw-inbox-search{width:100%;height:31px;padding:0 9px;border:1px solid #e1e8e4;border-radius:7px;background:#fff;color:#35443c;font:inherit;font-size:10px;outline:none}.sb-rw-inbox-search::placeholder{color:#a2aca6}.sb-rw-inbox-search:focus{border-color:#8fb8a3;box-shadow:0 0 0 2px rgba(143,184,163,.12)}.sb-rw-inbox-filter{height:31px;padding:0 8px;border:1px solid #e1e8e4;border-radius:7px;background:#fff;color:#526159;font:inherit;font-size:10px;outline:none}.sb-rw-inbox-thread-list{display:grid;align-content:start;gap:5px;min-height:0;padding:0 8px 10px;overflow:auto}.sb-rw-inbox-thread{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;width:100%;padding:9px 8px;border:1px solid transparent;border-radius:9px;background:transparent;color:inherit;text-align:left;cursor:pointer}.sb-rw-inbox-thread:hover{background:#f0f4f1}.sb-rw-inbox-thread.is-selected{border-color:#d7e4dc;background:#fff;box-shadow:0 1px 3px rgba(35,57,47,.06)}.sb-rw-inbox-thread-avatar,.sb-rw-inbox-chat-avatar,.sb-rw-inbox-detail-avatar{display:grid;place-items:center;overflow:hidden;border-radius:50%;background:#e8eeea;color:#334139;font-weight:700}.sb-rw-inbox-thread-avatar{width:34px;height:34px;font-size:12px}.sb-rw-inbox-thread-copy{min-width:0}.sb-rw-inbox-thread-top{display:flex;align-items:center;justify-content:space-between;gap:6px}.sb-rw-inbox-thread-top strong{overflow:hidden;color:#2a362f;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-thread-top time{flex:none;color:#a0aaa5;font-size:8px}.sb-rw-inbox-thread-message{margin-top:4px;overflow:hidden;color:#89958e;font-size:9px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-thread-bottom{display:flex;align-items:center;gap:5px;margin-top:5px;color:#2f80ed;font-size:8px}.sb-rw-inbox-thread-bottom i{width:6px;height:6px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-rw-inbox-thread-bottom.is-handoff{color:#a36d1e}.sb-rw-inbox-thread-bottom.is-handoff i{background:#d2922b;box-shadow:0 0 0 3px rgba(210,146,43,.1)}
.sb-rw-inbox-chat{display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#fff}.sb-rw-inbox-chat-head{display:flex;align-items:center;gap:10px;min-height:64px;padding:12px 15px;border-bottom:1px solid #edf1ef}.sb-rw-inbox-chat-avatar{width:36px;height:36px;font-size:13px}.sb-rw-inbox-chat-head-copy{min-width:0}.sb-rw-inbox-chat-head-copy strong{display:block;overflow:hidden;color:#27332d;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-chat-head-copy span{display:block;margin-top:4px;color:#8b9790;font-size:9px}.sb-rw-inbox-chat-status{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;color:#2f80ed;font-size:9px}.sb-rw-inbox-chat-status i{width:6px;height:6px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-rw-inbox-chat-status.is-handoff{color:#a36d1e}.sb-rw-inbox-chat-status.is-handoff i{background:#d2922b;box-shadow:0 0 0 3px rgba(210,146,43,.1)}.sb-rw-inbox-chat-body{display:flex;flex-direction:column;gap:10px;min-height:0;padding:18px 16px;overflow:auto}.sb-rw-inbox-date{align-self:center;color:#a4ada8;font-size:9px}.sb-rw-inbox-bubble-row{display:flex;align-items:flex-end;gap:7px}.sb-rw-inbox-bubble-row.is-out{justify-content:flex-end}.sb-rw-inbox-bubble{max-width:min(78%,430px);padding:9px 11px;border-radius:10px;background:#f1f3f2;color:#46534c;font-size:11px;line-height:1.55}.sb-rw-inbox-bubble-row.is-out .sb-rw-inbox-bubble{background:#eaf1ff;color:#2e4d84}.sb-rw-inbox-bubble-meta{margin-top:4px;color:#9aa49f;font-size:8px}.sb-rw-inbox-composer{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid #edf1ef;background:#fbfcfb}.sb-rw-inbox-composer input{min-width:0;flex:1;height:34px;padding:0 10px;border:1px solid #e2e8e4;border-radius:8px;background:#fff;color:#8b9790;font:inherit;font-size:10px}.sb-rw-inbox-human{height:34px;padding:0 10px;border:1px solid #dce5df;border-radius:8px;background:#fff;color:#5b6a61;font:inherit;font-size:10px;white-space:nowrap}.sb-rw-inbox-human:disabled{cursor:default;opacity:.55}
.sb-rw-inbox-details{padding:14px 13px;border-left:1px solid #edf1ef;background:#fff}.sb-rw-inbox-details-head{display:flex;align-items:center;gap:9px;padding-bottom:12px;border-bottom:1px solid #edf1ef}.sb-rw-inbox-detail-avatar{width:38px;height:38px;font-size:13px}.sb-rw-inbox-details-head strong{display:block;overflow:hidden;color:#27332d;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-details-head span{display:block;margin-top:4px;color:#8d9892;font-size:9px}.sb-rw-inbox-detail-section{display:grid;gap:7px;padding:13px 0;border-bottom:1px solid #edf1ef}.sb-rw-inbox-detail-section:last-child{border-bottom:0}.sb-rw-inbox-detail-section h3{margin:0;color:#35433b;font-size:11px}.sb-rw-inbox-detail-fact{display:grid;grid-template-columns:60px minmax(0,1fr);gap:8px;color:#929d97;font-size:9px;line-height:1.45}.sb-rw-inbox-detail-fact strong{overflow:hidden;color:#4e5d54;font-size:10px;font-weight:550;text-overflow:ellipsis;white-space:nowrap}.sb-rw-inbox-detail-note{padding:8px 9px;border-radius:8px;background:#f5f6f6;color:#68766e;font-size:9px;line-height:1.5}.sb-rw-inbox-workbench-empty{display:grid;place-items:center;min-height:250px;padding:25px;text-align:center}.sb-rw-inbox-workbench-empty i{width:8px;height:8px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.1)}.sb-rw-inbox-workbench-empty strong{margin-top:12px;color:#34423a;font-size:12px}.sb-rw-inbox-workbench-empty span{max-width:240px;margin-top:5px;color:#929d97;font-size:9px;line-height:1.6}.sb-rw-inbox-no-results{padding:30px 12px;color:#929d97;font-size:10px;text-align:center}
.sb-rw-panel{border-radius:12px;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-panel-head{padding:13px 14px 11px}
.sb-rw-cloud-wrap{padding:10px;background:#f0f5f2}
.sb-rw-cloud{min-height:0;border-radius:9px;background:#fff;box-shadow:none}
.sb-rw-cloud.is-image{border-color:#dbe7e1;box-shadow:0 1px 4px rgba(35,57,47,.08)}
.sb-rw-douyin-image{aspect-ratio:3 / 2;object-fit:cover}
.sb-rw-cloud-caption{margin-top:8px;font-size:10px}
.sb-rw-events{margin-top:12px}
.sb-rw-account-topline{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:12px}
.sb-rw-account-heading{min-width:220px}
.sb-rw-account-summary{display:flex;align-items:stretch;border:1px solid #e5ebe8;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(35,57,47,.025)}
.sb-rw-account-summary-item{display:flex;align-items:center;gap:9px;min-width:148px;padding:10px 14px;border-right:1px solid #edf1ef}
.sb-rw-account-summary-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#f1f8f4;color:#159965;font-size:16px}
.sb-rw-account-summary-copy{color:#52625a;font-size:12px;white-space:nowrap}
.sb-rw-account-summary-action{border:0;padding:0 16px;background:#fff;color:#4c5953;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.sb-rw-account-summary-action:hover{background:#f5faf7;color:#159965}
.sb-rw-account-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;overflow:visible;padding:0}
.sb-rw-account-card{width:100%;min-height:104px;grid-template-columns:30px minmax(0,1fr);padding:12px;border-radius:10px}
.sb-rw-account-capability-summary{display:block;margin-top:5px;overflow:hidden;color:#627168;font-size:9px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-account-foot{display:block;margin-top:6px;overflow:hidden;color:#a0aaa5;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-account-setup-mask{position:fixed;inset:0;z-index:9400;display:grid;place-items:center;padding:24px;background:rgba(19,25,22,.22)}
.sb-rw-account-setup{width:min(520px,100%);border:1px solid #e3e8e5;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(28,45,36,.18);overflow:hidden}
.sb-rw-account-setup-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 22px 16px;border-bottom:1px solid #edf1ef}
.sb-rw-account-setup-title{margin:0;color:#202a25;font-size:18px;font-weight:700}.sb-rw-account-setup-subtitle{margin-top:5px;color:#8b9690;font-size:11px}
.sb-rw-account-setup-close{border:0;background:none;color:#8b9690;font:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}.sb-rw-account-setup-close:hover{color:#202a25}
.sb-rw-account-setup-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:16px 22px 0}
.sb-rw-account-setup-step{display:flex;align-items:center;gap:7px;color:#a2aca6;font-size:10px}.sb-rw-account-setup-step i{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#f0f3f1;color:#87948d;font-style:normal;font-size:10px;font-weight:700}.sb-rw-account-setup-step.is-active{color:#262626;font-weight:650}.sb-rw-account-setup-step.is-active i{background:#262626;color:#fff}.sb-rw-account-setup-step.is-done{color:#2f80ed}.sb-rw-account-setup-step.is-done i{background:#eaf2ff;color:#2f80ed}
.sb-rw-account-setup-body{padding:20px 22px 22px}.sb-rw-account-setup-copy{color:#4e5b54;font-size:12px;line-height:1.55}.sb-rw-account-setup-form{display:grid;gap:12px;margin-top:16px}.sb-rw-account-setup-field{display:grid;gap:6px;color:#66736b;font-size:11px}.sb-rw-account-setup-field input{height:38px;padding:0 11px;border:1px solid #dfe7e2;border-radius:8px;background:#fbfcfb;color:#25322b;font:inherit;font-size:12px;outline:none}.sb-rw-account-setup-field input:focus{border-color:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1);background:#fff}.sb-rw-account-setup-error{margin-top:10px;color:#b34d44;font-size:11px}.sb-rw-account-setup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.sb-rw-account-setup-button{height:34px;padding:0 14px;border:1px solid #d9e2dc;border-radius:8px;background:#fff;color:#53615a;font:inherit;font-size:11px;cursor:pointer}.sb-rw-account-setup-button:hover{background:#f6f8f7}.sb-rw-account-setup-button.is-primary{border-color:#262626;background:#262626;color:#fff}.sb-rw-account-setup-button.is-primary:hover{background:#3d3d3d}.sb-rw-account-setup-button:disabled{opacity:.55;cursor:default}.sb-rw-account-setup-progress{height:7px;margin-top:17px;border-radius:99px;background:#e9eeeb;overflow:hidden}.sb-rw-account-setup-progress i{display:block;height:100%;border-radius:inherit;background:#2f80ed;transition:width .3s ease}.sb-rw-account-setup-progress-meta{display:flex;justify-content:space-between;margin-top:7px;color:#8b9690;font-size:10px}.sb-rw-account-setup-checks{display:grid;gap:9px;margin-top:16px}.sb-rw-account-setup-check{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid #e5ebe7;border-radius:9px;color:#55635a;font-size:11px}.sb-rw-account-setup-check i{width:14px;height:14px;border:1px solid #ccd8d0;border-radius:50%;background:#fff}.sb-rw-account-setup-check.is-done{border-color:#cfe2f8;background:#f7fbff;color:#2f80ed}.sb-rw-account-setup-check.is-done i{border-color:#2f80ed;background:#2f80ed;box-shadow:inset 0 0 0 3px #fff}
.sb-rw-ai-team{margin-bottom:12px}
.sb-rw-ai-team.is-completed{margin-top:2px;margin-bottom:18px}.sb-rw-ai-team.is-completed .sb-rw-ai-team-heading{margin-bottom:8px}.sb-rw-ai-team.is-completed .sb-rw-team-card{background:#fbfcfb}.sb-rw-ai-team.is-completed .sb-rw-card-meta{color:#7f8b84}
.sb-rw-ai-team-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}
.sb-rw-ai-team-heading-copy{display:flex;align-items:baseline;gap:12px;min-width:0}
.sb-rw-ai-team-heading strong{font-size:14px;font-weight:680}
.sb-rw-ai-team-heading span{color:#8c9792;font-size:10px}
.sb-rw-ai-team-action{flex:none;height:30px;padding:0 11px;border:1px solid #d9e1dd;border-radius:7px;background:#fff;color:#26342d;font:inherit;font-size:10px;font-weight:620;cursor:pointer}
.sb-rw-ai-team-action:hover{border-color:#9db5aa;background:#f7faf8}
.sb-rw-agent-manager-mask{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:24px;background:rgba(18,25,22,.32)}.sb-rw-agent-manager{width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border:1px solid #dfe5e2;border-radius:12px;background:#fff;box-shadow:0 24px 80px rgba(18,39,28,.18)}.sb-rw-agent-manager-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px 15px;border-bottom:1px solid #edf1ef}.sb-rw-agent-manager-head h2{margin:0;color:#25322b;font-size:16px}.sb-rw-agent-manager-head p{margin:5px 0 0;color:#7d8983;font-size:11px;line-height:1.5}.sb-rw-agent-manager-close{width:28px;height:28px;border:0;border-radius:7px;background:#f3f6f4;color:#65736b;font-size:18px;line-height:1;cursor:pointer}.sb-rw-agent-manager-close:hover{background:#e8eeea}.sb-rw-agent-manager-list{display:grid;gap:8px;padding:14px 20px}.sb-rw-agent-manager-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px;border:1px solid #e6ece8;border-radius:9px;background:#fbfcfb}.sb-rw-agent-manager-copy{display:grid;gap:4px;min-width:0}.sb-rw-agent-manager-copy strong{overflow:hidden;color:#2b3931;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-agent-manager-copy span{overflow:hidden;color:#829087;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-agent-manager-cancel{flex:none;height:30px;padding:0 10px;border:1px solid #e8cbc8;border-radius:7px;background:#fff;color:#ad5148;font:inherit;font-size:10px;cursor:pointer}.sb-rw-agent-manager-cancel:hover{border-color:#dba49e;background:#fff7f6}.sb-rw-agent-manager-cancel:disabled{cursor:default;opacity:.48}.sb-rw-agent-manager-empty{padding:22px 0;color:#8b9690;font-size:11px;text-align:center}.sb-rw-agent-manager-error{display:none;margin:0 20px 14px;padding:9px 10px;border-radius:7px;background:#fff3f1;color:#ae463d;font-size:10px}.sb-rw-agent-manager-error.is-visible{display:block}.sb-rw-agent-manager-footer{display:flex;justify-content:flex-end;gap:8px;padding:0 20px 18px}.sb-rw-agent-manager-footer button{height:32px;padding:0 12px;border:1px solid #d8e2dc;border-radius:7px;background:#fff;color:#55635b;font:inherit;font-size:10px;cursor:pointer}.sb-rw-agent-manager-footer button:last-child{border-color:#262626;background:#262626;color:#fff}
.sb-rw-team{display:flex;flex-wrap:nowrap;gap:8px;margin:0;padding:1px 1px 7px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:thin;scrollbar-color:#d4dbe2 transparent;-webkit-overflow-scrolling:touch;touch-action:pan-x}
.sb-rw-ai-team .sb-rw-team::-webkit-scrollbar{height:4px}
.sb-rw-ai-team .sb-rw-team::-webkit-scrollbar-track{background:transparent}
.sb-rw-ai-team .sb-rw-team::-webkit-scrollbar-thumb{border-radius:999px;background:#d4dbe2}
.sb-rw-team-card{flex:0 0 calc((100% - 16px) / 3);min-width:320px;min-height:78px;padding:12px;border-radius:10px;scroll-snap-align:start;scroll-snap-stop:always}
.sb-rw-kpis{display:none}
@media (max-width:1200px){.sb-rw-main{grid-template-columns:minmax(330px,1.1fr) minmax(240px,.9fr)}.sb-rw-prospect{grid-column:1/-1}.sb-rw-main.is-inbox-work{grid-template-columns:minmax(360px,1fr) minmax(280px,.72fr)}.sb-rw-main.is-comment-acquisition-work{grid-template-columns:minmax(0,1fr)}.sb-rw-main.is-inbox-work .sb-rw-inbox-conversations{grid-column:1/-1;min-height:0}.sb-rw-acquisition-conversations{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.sb-rw-acquisition-empty.is-conversation{grid-column:1/-1;min-height:190px}.sb-rw-inbox-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.sb-rw-inbox-empty{grid-column:1/-1;min-height:190px}}
@media (max-width:1100px){.sb-rw-account-topline{display:block}.sb-rw-account-summary{margin-top:9px;width:max-content;max-width:100%;overflow-x:auto}.sb-rw-account-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.sb-realtime-page{padding:18px 14px 24px}.sb-rw-account-summary{width:max-content;max-width:100%;overflow-x:auto}.sb-rw-account-summary-item{min-width:132px;flex:none;padding:9px 11px}.sb-rw-account-summary-icon{width:28px;height:28px;font-size:15px}.sb-rw-account-summary-copy{font-size:11px;white-space:nowrap}.sb-rw-account-summary-action{padding:0 11px;font-size:11px}.sb-rw-account-list{grid-template-columns:1fr}.sb-rw-account-card{min-width:0}.sb-rw-team{gap:10px;padding-bottom:8px}.sb-rw-team-card{flex-basis:min(84vw,340px);min-width:min(84vw,340px)}.sb-rw-main{display:block}.sb-rw-cloud-wrap{padding:8px}.sb-rw-panel{margin-bottom:10px}.sb-rw-acquisition-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-rw-acquisition-conversations,.sb-rw-inbox-list{grid-template-columns:1fr}.sb-rw-acquisition-empty.is-conversation,.sb-rw-inbox-empty{min-height:180px}}
.sb-rw-account-card.is-active{border-color:#16b77a;box-shadow:0 0 0 2px rgba(22,183,122,.1),0 3px 8px rgba(35,57,47,.06)}
.sb-rw-team-card.is-active{border-color:#16b77a;box-shadow:0 0 0 2px rgba(22,183,122,.1),0 3px 8px rgba(35,57,47,.06)}
/* AI数班 neutral palette: charcoal controls, cool-blue live status, amber warnings. */
.sb-realtime-page{--sb-brand-accent:#262626;--sb-brand-accent-soft:#f4f4f5;--sb-brand-accent-wash:#fafafa;--sb-brand-accent-border:#d4d4d4}
.sb-rw-account-card:hover{border-color:#a3a3a3}
.sb-rw-account-card.is-active{border-color:#b7c8e5;background:#fff;box-shadow:none}
.sb-rw-team-card.is-active{border-color:#b7c8e5;background:#fff;box-shadow:none}
.sb-rw-account-title,.sb-rw-account-name-line{display:flex;align-items:center;gap:7px;min-width:0}
.sb-rw-account-meta .sb-rw-account-capability-summary{flex:1;min-width:0;margin-top:0}
.sb-rw-account-name-line .sb-rw-account-name{min-width:0;flex:0 1 auto}
.sb-rw-mock-badge{display:inline-flex;align-items:center;justify-content:center;flex:none;height:17px;padding:0 5px;border:1px solid #d6e1f3;border-radius:5px;background:#f1f5fb;color:#5f76a0;font-size:8px;font-weight:750;letter-spacing:.04em;line-height:1}
.sb-rw-panel-title{display:flex;align-items:center;gap:7px;min-width:0}
.sb-rw-account-status i,.sb-rw-status-dot{background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.12)}
.sb-rw-live{color:#2f80ed}.sb-rw-live i{background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.12)}
.sb-rw-queue-item:hover,.sb-rw-queue-item.is-selected{background:#fafafa}.sb-rw-queue-item.is-selected{box-shadow:inset 3px 0 #262626}
.sb-rw-queue-progress i{background:#2f80ed}
.sb-rw-lead-item.is-selected{background:#fafafa}
.sb-rw-output-row:hover,.sb-rw-output-row.is-selected{border-color:#d4d4d4;background:#f4f4f5}
.sb-rw-output-detail{background:#f5f5f5;color:#525252}.sb-rw-output-detail strong{color:#262626}
.sb-rw-output-action{border-color:#d4d4d4;color:#262626}.sb-rw-output-action:hover{border-color:#a3a3a3;background:#f4f4f5}
.sb-rw-intent{background:#f5f5f5}.sb-rw-intent-top{color:#262626}
.sb-rw-profile-avatar,.sb-rw-avatar{background:#f0f0f0;color:#262626}
.sb-rw-account-stat,.sb-rw-cloud-caption button,.sb-rw-lead-head-status,.sb-rw-output-state,.sb-rw-detail{color:#262626}
.sb-rw-lead-head-status i{background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.12)}
.sb-rw-intent-bar{background:#e5e7eb}.sb-rw-intent-bar span{background:#2f80ed}
.sb-rw-detail{border-color:#d4d4d4}.sb-rw-detail:hover{background:#f4f4f5}
.sb-rw-event-dot{background:#2f80ed}
.sb-rw-account-summary-icon{background:#f5f5f5;color:#262626}
.sb-rw-account-summary-action:hover{background:#f4f4f5;color:#262626}
.sb-rw-screen-card strong,.sb-rw-scene-row strong{color:#f5f5f5}
.sb-rw-screen-heading em,.sb-rw-screen-chip,.sb-rw-screen-terminal,.sb-rw-screen-terminal b,.sb-rw-scene-row em,.sb-rw-scene-batch em,.sb-rw-scene-inbox-row span{color:#2f80ed}
.sb-rw-screen-line.green,.sb-rw-scene-toolbar span:first-child,.sb-rw-scene-meter i{background-color:#2f80ed}
.sb-rw-screen-line.green{background:linear-gradient(90deg,#2f80ed 70%,#31443d 70%)}
.sb-rw-screen-chip{background:#eaf2ff}.sb-rw-screen-terminal{background:transparent}.sb-rw-scene-toolbar span:first-child{box-shadow:0 0 0 3px rgba(47,128,237,.14)}
.sb-rw-scene-chat-row.is-agent{background:#eaf2ff;color:#24436d}.sb-rw-scene-step.is-done b{background:#2f80ed}.sb-rw-scene-step.is-done span{color:#b7c9ee}
.sb-rw-cloud[data-scene="browser"] .sb-rw-screen-heading em,.sb-rw-cloud[data-scene="browser"] .sb-rw-scene-row em{color:#2f80ed}
.sb-rw-account-directory{padding-bottom:34px}
.sb-rw-directory-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.sb-rw-directory-back{display:inline-flex;align-items:center;gap:7px;padding:0;border:0;background:none;color:#626b74;font:inherit;font-size:12px;cursor:pointer}
.sb-rw-directory-back:hover{color:#262626}
.sb-rw-directory-back::before{content:"←";font-size:16px;line-height:1}
.sb-rw-directory-title{margin-top:9px;color:#262626;font-size:22px;font-weight:720;letter-spacing:-.02em}
.sb-rw-directory-subtitle{margin-top:5px;color:#8b949c;font-size:11px;line-height:1.45}
.sb-rw-directory-summary{display:flex;align-items:stretch;border:1px solid #e1e5e9;border-radius:10px;background:#fff;overflow:hidden}
.sb-rw-directory-summary-item{min-width:112px;padding:10px 12px;border-right:1px solid #edf0f3}
.sb-rw-directory-summary-item:last-child{border-right:0}
.sb-rw-directory-summary-item strong{display:block;color:#262626;font-size:15px;font-variant-numeric:tabular-nums}
.sb-rw-directory-summary-item span{display:block;margin-top:3px;color:#8b949c;font-size:9.5px;white-space:nowrap}
.sb-rw-directory-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px;border:1px solid #e1e5e9;border-radius:11px;background:#fff}
.sb-rw-directory-search{flex:1;min-width:180px;height:34px;padding:0 11px;border:1px solid #dfe4e8;border-radius:7px;background:#fafafa;color:#262626;font:inherit;font-size:11px;outline:none}
.sb-rw-directory-search:focus{border-color:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1);background:#fff}
.sb-rw-directory-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sb-rw-directory-filter{height:30px;padding:0 10px;border:1px solid #e1e5e9;border-radius:7px;background:#fff;color:#707a83;font:inherit;font-size:10px;cursor:pointer}
.sb-rw-directory-filter:hover{border-color:#a8b0b8;color:#262626}
.sb-rw-directory-filter.is-active{border-color:#262626;background:#262626;color:#fff}
.sb-rw-directory-list{display:grid;gap:7px;max-height:calc(100vh - 260px);overflow:auto;padding:1px 2px 2px}
.sb-rw-directory-row{display:grid;grid-template-columns:minmax(220px,1.45fr) repeat(4,minmax(75px,.6fr)) auto;align-items:center;gap:12px;padding:11px 13px;border:1px solid #e4e8eb;border-radius:10px;background:#fff;text-align:left;cursor:pointer;transition:border-color 140ms ease,box-shadow 140ms ease,transform 140ms ease}
.sb-rw-directory-row:hover{border-color:#aeb6bd;box-shadow:0 3px 10px rgba(24,32,39,.06);transform:translateY(-1px)}
.sb-rw-directory-identity{display:flex;align-items:center;gap:9px;min-width:0}
.sb-rw-directory-avatar{width:34px;height:34px;flex:none;border-radius:9px;overflow:hidden;background:#f0f0f0}
.sb-rw-directory-avatar img{width:100%;height:100%;object-fit:cover}
.sb-rw-directory-copy{min-width:0}
.sb-rw-directory-name{display:block;overflow:hidden;color:#303840;font-size:11px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-directory-handle{display:block;margin-top:3px;overflow:hidden;color:#9aa2aa;font-size:9.5px;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-directory-cell{min-width:0}
.sb-rw-directory-cell strong{display:block;overflow:hidden;color:#3f4850;font-size:11px;font-weight:620;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-directory-cell span{display:block;margin-top:3px;overflow:hidden;color:#9aa2aa;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-directory-status{display:inline-flex;align-items:center;gap:5px;color:#2f80ed;font-size:10px;font-weight:650;white-space:nowrap}
.sb-rw-directory-status i{width:6px;height:6px;border-radius:50%;background:#2f80ed}
.sb-rw-directory-status.is-warning{color:#c48725}.sb-rw-directory-status.is-warning i{background:#e2a23c}
.sb-rw-directory-status.is-muted{color:#8b949c}.sb-rw-directory-status.is-muted i{background:#aab2b9}
.sb-rw-directory-open{color:#2f80ed;font-size:15px;line-height:1}
.sb-rw-directory-empty{padding:30px;text-align:center;color:#8b949c;font-size:11px;border:1px dashed #dfe4e8;border-radius:10px;background:#fff}
@media(max-width:900px){.sb-rw-directory-head{display:block}.sb-rw-directory-summary{margin-top:14px;width:max-content;max-width:100%;overflow:auto}.sb-rw-directory-toolbar{display:block}.sb-rw-directory-search{width:100%;margin-bottom:9px}.sb-rw-directory-row{grid-template-columns:minmax(190px,1.4fr) repeat(3,minmax(70px,.65fr)) auto}.sb-rw-directory-row .sb-rw-directory-cell:nth-of-type(4){display:none}}
@media(max-width:640px){.sb-rw-directory-row{grid-template-columns:minmax(180px,1fr) repeat(2,minmax(65px,.6fr)) auto}.sb-rw-directory-row .sb-rw-directory-cell:nth-of-type(3),.sb-rw-directory-row .sb-rw-directory-cell:nth-of-type(4){display:none}.sb-rw-directory-list{max-height:none}}
@media(max-width:1200px){.sb-rw-inbox-shell{grid-template-columns:minmax(210px,.85fr) minmax(360px,1.4fr)}.sb-rw-inbox-details{grid-column:1/-1;border-top:1px solid #edf1ef;border-left:0}.sb-rw-inbox-detail-section{display:inline-grid;vertical-align:top;width:32%;margin-right:1.5%;border-bottom:0}.sb-rw-inbox-detail-section:last-child{margin-right:0}.sb-rw-inbox-funnel-step{padding:13px 14px}}
@media(max-width:760px){.sb-rw-inbox-funnel{grid-template-columns:repeat(5,minmax(118px,1fr));overflow-x:auto}.sb-rw-inbox-funnel-step{min-width:118px}.sb-rw-inbox-shell{display:block;min-height:0}.sb-rw-inbox-sidebar{min-height:290px;border-right:0;border-bottom:1px solid #edf1ef}.sb-rw-inbox-thread-list{max-height:220px}.sb-rw-inbox-chat{min-height:430px}.sb-rw-inbox-details{min-height:270px}.sb-rw-inbox-detail-section{display:grid;width:auto;margin:0;padding:10px 0;border-bottom:1px solid #edf1ef}.sb-rw-inbox-detail-section:last-child{border-bottom:0}.sb-rw-inbox-composer{align-items:stretch;flex-wrap:wrap}.sb-rw-inbox-composer input{flex-basis:100%}.sb-rw-inbox-human{margin-left:auto}.sb-rw-inbox-bubble{max-width:88%}}
.sb-rw-acquisition-scene-header{margin:0}.sb-rw-auth-recovery{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 10px;padding:12px 14px;border:1px solid #efd2c7;border-radius:10px;background:#fff8f5}.sb-rw-auth-recovery strong,.sb-rw-auth-recovery span{display:block}.sb-rw-auth-recovery strong{color:#96452d;font-size:13px}.sb-rw-auth-recovery span{margin-top:4px;color:#80645b;font-size:11px;line-height:1.5}.sb-rw-auth-recovery button{flex:none;height:32px;padding:0 13px;border:1px solid #d97b60;border-radius:7px;background:#fff;color:#a34b31;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-rw-auth-recovery button:hover{background:#fff1eb}.sb-rw-auth-recovery button:disabled{cursor:wait;opacity:.62}
.sb-rw-acquisition-full-desktop-panel{grid-column:1/-1;min-height:620px;display:flex;flex-direction:column;overflow:hidden}.sb-rw-acquisition-full-desktop-panel>.sb-rw-panel-head{height:61px;min-height:61px;box-sizing:border-box}.sb-rw-acquisition-full-desktop-wrap{display:flex;flex:1;min-height:0;padding:0 14px 14px}.sb-rw-acquisition-full-desktop-replay{display:flex;flex:1;min-height:0;align-items:center;justify-content:center;border:1px solid #dce4ef;border-radius:14px;background:#111522;overflow:hidden}.sb-rw-acquisition-full-desktop-replay video{display:block;width:100%;height:100%;object-fit:contain;background:#111522}
.sb-rw-acquisition-conversion-workbench{grid-column:1/-1;display:grid;grid-template-columns:minmax(220px,.8fr) minmax(390px,1.65fr) minmax(250px,.85fr);min-height:620px;overflow:hidden;border:1px solid #e1e7f0;border-radius:15px;background:#fff;box-shadow:0 1px 2px rgba(56,84,125,.035)}.sb-rw-acquisition-conversion-sidebar{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;padding:14px 12px;background:#f8f9fb;border-right:1px solid #edf1f5}.sb-rw-acquisition-conversion-search{width:100%;height:36px;box-sizing:border-box;padding:0 11px;border:1px solid #e0e7ef;border-radius:9px;background:#fff;color:#27333d;font:inherit;font-size:11px;outline:none}.sb-rw-acquisition-conversion-search::placeholder{color:#9aa4ae}.sb-rw-acquisition-conversion-list{display:grid;align-content:start;gap:5px;margin-top:12px;overflow:auto}.sb-rw-acquisition-conversion-thread{display:grid;grid-template-columns:38px minmax(0,1fr);gap:8px;width:100%;padding:10px 8px;border:1px solid transparent;border-radius:10px;background:transparent;text-align:left;cursor:pointer}.sb-rw-acquisition-conversion-thread:hover{background:#eef3fa}.sb-rw-acquisition-conversion-thread.is-selected{border-color:#e0e8f4;background:#fff;box-shadow:0 1px 3px rgba(56,84,125,.06)}.sb-rw-acquisition-conversion-thread .sb-rw-acquisition-avatar{width:38px;height:38px}.sb-rw-acquisition-conversion-thread strong,.sb-rw-acquisition-conversion-thread span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-rw-acquisition-conversion-thread strong{color:#27333d;font-size:11px}.sb-rw-acquisition-conversion-thread span{margin-top:5px;color:#8a96a2;font-size:9px}.sb-rw-acquisition-conversion-conversation{display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-width:0;background:#fff}.sb-rw-acquisition-conversation-head{display:flex;align-items:center;gap:10px;min-height:70px;padding:14px 17px;border-bottom:1px solid #edf1f5}.sb-rw-acquisition-conversation-head .sb-rw-acquisition-avatar{width:42px;height:42px}.sb-rw-acquisition-conversation-head strong,.sb-rw-acquisition-conversation-head span{display:block}.sb-rw-acquisition-conversation-head strong{color:#27333d;font-size:14px}.sb-rw-acquisition-conversation-head span{margin-top:5px;color:#2f80ed;font-size:10px}.sb-rw-acquisition-conversation-messages{display:flex;flex-direction:column;gap:14px;min-height:0;padding:28px 18px;overflow:auto}.sb-rw-acquisition-conversation-message{max-width:78%;padding:12px 14px;border-radius:13px;color:#38444f;font-size:12px;line-height:1.6}.sb-rw-acquisition-conversation-message.is-inbound{justify-self:start;align-self:start;background:#f1f3f5}.sb-rw-acquisition-conversation-message.is-outbound{align-self:end;background:#e8f0ff;color:#35527c}.sb-rw-acquisition-conversation-empty,.sb-rw-acquisition-conversion-empty{display:grid;place-items:center;min-height:260px;color:#9aa4ae;font-size:11px}.sb-rw-acquisition-conversation-footer{display:flex;align-items:center;gap:8px;margin:0 14px 14px;padding:10px 12px;border:1px solid #edf1f5;border-radius:13px;background:#fff;box-shadow:0 4px 18px rgba(56,84,125,.07)}.sb-rw-acquisition-conversation-footer .sb-rw-acquisition-avatar{width:34px;height:34px;background:#e8f0ff;color:#2f80ed;font-size:10px}.sb-rw-acquisition-conversation-footer>span:not(.sb-rw-acquisition-avatar){color:#2f80ed;font-size:10px}.sb-rw-acquisition-conversation-footer button{margin-left:auto;height:32px;padding:0 13px;border:0;border-radius:8px;background:#15181d;color:#fff;font:inherit;font-size:10px;cursor:pointer}.sb-rw-acquisition-conversion-details{min-width:0;padding:18px 15px;overflow:auto;border-left:1px solid #edf1f5}.sb-rw-acquisition-conversion-details h3{margin:0 0 15px;color:#27333d;font-size:13px}.sb-rw-acquisition-conversion-details h3:not(:first-child){margin-top:24px}.sb-rw-acquisition-conversion-fact{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;padding:9px 0;border-bottom:1px solid #f0f3f6}.sb-rw-acquisition-conversion-fact span{color:#9aa4ae;font-size:10px}.sb-rw-acquisition-conversion-fact strong{min-width:0;overflow:hidden;color:#36434f;font-size:10px;font-weight:550;text-overflow:ellipsis;white-space:nowrap}.sb-rw-acquisition-conversion-tags{display:flex;flex-wrap:wrap;gap:5px}.sb-rw-acquisition-conversion-tags span{padding:4px 7px;border-radius:6px;background:#eef4ff;color:#3e68a3;font-size:9px}
.sb-rw-acquisition-scene-bar{display:flex;align-items:center;justify-content:flex-end;gap:14px}.sb-rw-acquisition-scene-tabs{display:flex;gap:3px;padding:4px;border-radius:11px;background:#eceeed}.sb-rw-acquisition-scene-tab{min-width:128px;height:38px;padding:0 16px;border:0;border-radius:8px;background:transparent;color:#69756e;font:inherit;font-size:12px;cursor:pointer}.sb-rw-acquisition-scene-tab.is-active{background:#fff;color:#252d28;box-shadow:0 1px 3px rgba(35,57,47,.08);font-weight:680}
.sb-rw-main.is-comment-acquisition-work{grid-template-columns:minmax(300px,.84fr) minmax(360px,1fr) minmax(330px,.96fr);align-items:stretch}.sb-rw-main.is-comment-acquisition-work>.sb-rw-panel{min-height:620px}.sb-rw-main.is-comment-acquisition-work>.sb-rw-panel>.sb-rw-panel-head{height:61px;min-height:61px;box-sizing:border-box}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel>.sb-rw-panel-head,.sb-rw-main.is-comment-acquisition-work>.sb-rw-acquisition-detail-panel>.sb-rw-panel-head{align-items:flex-start}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel,.sb-rw-main.is-comment-acquisition-work>.sb-rw-acquisition-queue-panel{display:flex;flex-direction:column;align-self:stretch}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel .sb-rw-cloud-live-wrap{display:flex;flex:1;min-height:0;flex-direction:column}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel .sb-rw-cloud-live{width:100%;min-height:0;flex:1;aspect-ratio:auto}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel .sb-rw-cloud-replay-stage{width:100%;min-height:0;flex:1}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel .sb-rw-cloud-live iframe{width:100%;height:100%}.sb-rw-acquisition-queue-body{display:grid;flex:1;min-height:0;gap:12px;padding:13px 14px 14px}.sb-rw-acquisition-queue-body.is-empty{grid-template-rows:auto minmax(0,1fr)}.sb-rw-acquisition-queue-body.is-empty .sb-rw-acquisition-people{min-height:0;max-height:none}.sb-rw-acquisition-queue-body.is-empty .sb-rw-acquisition-empty{height:100%;min-height:0}.sb-rw-acquisition-queue-status{display:flex;align-items:center;gap:8px;color:#159965;font-size:11px}.sb-rw-acquisition-queue-status i{width:8px;height:8px;border-radius:50%;background:#18a86f;box-shadow:0 0 0 4px rgba(24,168,111,.1)}.sb-rw-acquisition-queue-body .sb-rw-acquisition-people{max-height:520px}.sb-rw-acquisition-queue-body .sb-rw-acquisition-person{display:grid;width:100%;padding:11px;border:1px solid #e5ebe8;text-align:left;cursor:pointer;font:inherit;transition:border-color 140ms ease,background 140ms ease,box-shadow 140ms ease}.sb-rw-acquisition-queue-body .sb-rw-acquisition-person:hover{border-color:#b8c9c0;background:#fbfdfc}.sb-rw-acquisition-queue-body .sb-rw-acquisition-person.is-selected{border-color:#bfcfc7;background:#f5faf7;box-shadow:inset 3px 0 #16a571}.sb-rw-acquisition-person-meta{display:flex;align-items:center;gap:8px;margin-top:6px;color:#89948e;font-size:9px}.sb-rw-acquisition-person-meta span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-rw-acquisition-person-meta b{flex:none;color:#159965;font-size:9px;font-weight:650}.sb-rw-acquisition-queue-body .sb-rw-acquisition-touch{margin-top:7px}.sb-rw-acquisition-detail-body{padding:16px}.sb-rw-acquisition-detail-profile{display:flex;align-items:center;gap:10px;padding-bottom:15px;border-bottom:1px solid #edf1ef}.sb-rw-acquisition-detail-profile .sb-rw-acquisition-avatar{width:44px;height:44px}.sb-rw-acquisition-detail-profile strong{display:block;color:#27332d;font-size:14px}.sb-rw-acquisition-detail-profile span{display:block;margin-top:5px;color:#89948e;font-size:10px;line-height:1.4}.sb-rw-acquisition-detail-timeline{display:grid;margin-top:15px}.sb-rw-acquisition-detail-step{position:relative;display:grid;grid-template-columns:12px minmax(0,1fr);gap:10px;min-height:68px}.sb-rw-acquisition-detail-step:not(:last-child)::before{position:absolute;top:12px;bottom:0;left:5px;border-left:1px dashed #d9e3de;content:""}.sb-rw-acquisition-detail-step i{z-index:1;width:11px;height:11px;border:2px solid #cbd6d0;border-radius:50%;background:#fff}.sb-rw-acquisition-detail-step.is-done i{border-color:#2f80ed;background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-rw-acquisition-detail-step strong{display:block;color:#536159;font-size:10px;font-weight:650}.sb-rw-acquisition-detail-step span{display:block;margin-top:5px;color:#7f8b84;font-size:10px;line-height:1.55;word-break:break-word}.sb-rw-acquisition-detail-step.is-done span{color:#405148}.sb-rw-acquisition-detail-empty{display:grid;place-items:center;min-height:540px;padding:26px;text-align:center}.sb-rw-acquisition-detail-empty i{width:9px;height:9px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.1)}.sb-rw-acquisition-detail-empty strong{margin-top:14px;color:#34423a;font-size:13px}.sb-rw-acquisition-detail-empty span{max-width:240px;margin-top:6px;color:#8c9792;font-size:10px;line-height:1.6}.sb-rw-main.is-background-work{grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}.sb-rw-main.is-background-work>.sb-rw-panel{min-height:420px;align-self:stretch}
.sb-rw-main.is-specialist-acquisition-work{grid-template-columns:minmax(0,1fr);align-items:stretch}.sb-rw-main.is-specialist-acquisition-work.is-finder-work,.sb-rw-main.is-specialist-acquisition-work.is-analysis-work{grid-template-columns:minmax(300px,.84fr) minmax(360px,1fr) minmax(330px,.96fr)}.sb-rw-main.is-finder-work>.sb-rw-panel,.sb-rw-main.is-analysis-work>.sb-rw-panel{min-height:620px}.sb-rw-main.is-finder-work>.sb-rw-panel>.sb-rw-panel-head,.sb-rw-main.is-analysis-work>.sb-rw-panel>.sb-rw-panel-head{height:61px;min-height:61px;box-sizing:border-box}.sb-rw-main.is-finder-work>.sb-rw-finder-source-panel,.sb-rw-main.is-finder-work>.sb-rw-finder-queue-panel,.sb-rw-main.is-analysis-work>.sb-rw-analysis-source-panel,.sb-rw-main.is-analysis-work>.sb-rw-analysis-queue-panel,.sb-rw-main.is-analysis-work>.sb-rw-analysis-prospects-panel{display:flex;flex-direction:column;align-self:stretch}.sb-rw-finder-source-list,.sb-rw-analysis-source-list{display:grid;align-content:start;gap:0;flex:1;min-height:0;padding:7px 15px 14px;overflow:auto}.sb-rw-finder-source-row,.sb-rw-analysis-source-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:14px 8px;border:0;border-bottom:1px solid #f0f3f2;background:transparent;color:inherit;text-align:left}.sb-rw-finder-source-row{cursor:pointer;font:inherit}.sb-rw-finder-source-row:hover{background:#fbfcff}.sb-rw-finder-source-row.is-selected{border-radius:16px;background:#f4f4f5}.sb-rw-finder-source-copy,.sb-rw-analysis-source-copy{min-width:0}.sb-rw-finder-source-copy strong,.sb-rw-finder-source-copy span,.sb-rw-analysis-source-copy strong,.sb-rw-analysis-source-copy span{display:block}.sb-rw-finder-source-copy strong,.sb-rw-analysis-source-copy strong{overflow:hidden;color:#27332d;font-size:14px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.sb-rw-finder-source-copy span,.sb-rw-analysis-source-copy span{margin-top:7px;overflow:hidden;color:#89948e;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.sb-rw-finder-source-row>b,.sb-rw-analysis-source-row>b{flex:none;color:#2f80ed;font-size:11px;font-weight:680}.sb-rw-finder-queue-panel>.sb-rw-panel-head,.sb-rw-analysis-queue-panel>.sb-rw-panel-head{border-bottom:0}.sb-rw-finder-queue-panel .sb-rw-acquisition-person-meta>b,.sb-rw-analysis-queue-panel .sb-rw-acquisition-person-meta>b{color:#2f80ed}.sb-rw-finder-detail-panel{display:flex;flex-direction:column;align-self:stretch}
.sb-rw-main.is-specialist-acquisition-work.is-outreach-work{grid-template-columns:minmax(320px,.78fr) minmax(520px,1.42fr)}.sb-rw-main.is-outreach-work>.sb-rw-panel{display:flex;flex-direction:column;min-height:620px;overflow:hidden}.sb-rw-main.is-outreach-work>.sb-rw-panel>.sb-rw-panel-head{height:61px;min-height:61px;box-sizing:border-box}.sb-rw-outreach-specialist-list{display:grid;align-content:start;gap:16px;flex:1;min-height:0;padding:14px;overflow:auto}.sb-rw-outreach-specialist-group{display:grid;gap:8px}.sb-rw-outreach-specialist-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px;color:#5f6c76;font-size:10px;font-weight:680}.sb-rw-outreach-specialist-group-head b{color:#98a4ae;font-size:10px;font-weight:560}.sb-rw-outreach-specialist-person{display:grid;grid-template-columns:40px minmax(0,1fr);gap:10px;width:100%;padding:11px;border:0;border-bottom:1px solid #edf1f5;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.sb-rw-outreach-specialist-person:hover{background:#fbfcff}.sb-rw-outreach-specialist-person.is-selected{background:#f4f4f5;box-shadow:inset 3px 0 #ff3b54}.sb-rw-outreach-specialist-person .sb-rw-acquisition-avatar{width:40px;height:40px}.sb-rw-outreach-specialist-copy{display:grid;min-width:0}.sb-rw-outreach-specialist-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.sb-rw-outreach-specialist-top strong{min-width:0;overflow:hidden;color:#27332d;font-size:12px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.sb-rw-outreach-specialist-state{flex:none;padding:3px 6px;border-radius:5px;background:#fff4e8;color:#bc701b;font-size:9px;font-weight:680;line-height:1.2}.sb-rw-outreach-specialist-state.is-sent{background:#edf7f1;color:#16885b}.sb-rw-outreach-specialist-source,.sb-rw-outreach-specialist-quote,.sb-rw-outreach-specialist-note{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-rw-outreach-specialist-source{margin-top:5px;color:#8b969e;font-size:9px}.sb-rw-outreach-specialist-quote{margin-top:6px;color:#425049;font-size:10px}.sb-rw-outreach-specialist-note{margin-top:6px;color:#77847d;font-size:9px}.sb-rw-outreach-specialist-note.is-sent{color:#16885b}.sb-rw-outreach-specialist-empty{padding:12px;border:1px dashed #dfe6e2;border-radius:8px;color:#98a39d;font-size:10px}.sb-rw-outreach-specialist-replay-wrap{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:12px;flex:1;min-height:0;padding:0 14px 14px}.sb-rw-outreach-specialist-replay-stage{display:flex;min-height:0;align-items:center;justify-content:center;border:1px solid #dce4ef;border-radius:12px;background:#111522;overflow:hidden}.sb-rw-outreach-specialist-replay-stage video{display:block;width:100%;height:100%;object-fit:contain;background:#111522}.sb-rw-outreach-specialist-focus{display:flex;align-items:center;gap:9px;min-height:48px;padding:9px 11px;border:1px solid #e6ebf1;border-radius:8px;background:#fbfcfe}.sb-rw-outreach-specialist-focus .sb-rw-acquisition-avatar{width:30px;height:30px;flex:none}.sb-rw-outreach-specialist-focus-copy{display:grid;min-width:0}.sb-rw-outreach-specialist-focus-copy strong,.sb-rw-outreach-specialist-focus-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-rw-outreach-specialist-focus-copy strong{color:#38454e;font-size:10px;font-weight:680}.sb-rw-outreach-specialist-focus-copy span{margin-top:4px;color:#86919b;font-size:9px}
.sb-rw-acquisition-detail-step i{margin-top:3px}
@media(max-width:1200px){.sb-rw-main.is-comment-acquisition-work,.sb-rw-main.is-finder-work,.sb-rw-main.is-analysis-work,.sb-rw-main.is-outreach-work{grid-template-columns:minmax(0,1fr) minmax(300px,.9fr)}.sb-rw-main.is-comment-acquisition-work>.sb-rw-panel,.sb-rw-main.is-finder-work>.sb-rw-panel,.sb-rw-main.is-analysis-work>.sb-rw-panel,.sb-rw-main.is-outreach-work>.sb-rw-panel{min-height:0}.sb-rw-main.is-comment-acquisition-work .sb-rw-cloud-panel,.sb-rw-main.is-finder-work .sb-rw-finder-source-panel,.sb-rw-main.is-analysis-work .sb-rw-analysis-source-panel{display:block;grid-column:1/-1}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel .sb-rw-cloud-live-wrap{display:block;height:auto}.sb-rw-main.is-comment-acquisition-work>.sb-rw-cloud-panel .sb-rw-cloud-live{display:block;aspect-ratio:16 / 9}.sb-rw-main.is-comment-acquisition-work .sb-rw-acquisition-detail-panel,.sb-rw-main.is-finder-work .sb-rw-acquisition-detail-panel,.sb-rw-main.is-analysis-work .sb-rw-acquisition-detail-panel{grid-column:1/-1}.sb-rw-main.is-background-work{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-rw-main.is-background-work .sb-rw-prospect{grid-column:auto}.sb-rw-acquisition-empty{min-height:300px}}
@media(max-width:760px){.sb-rw-workbar{min-height:68px}}
@media(max-width:760px){.sb-rw-acquisition-scene-bar{display:block}.sb-rw-acquisition-scene-tabs{width:max-content;max-width:100%;margin-top:10px;overflow:auto}.sb-rw-acquisition-scene-tab{min-width:104px;height:34px;padding:0 12px}.sb-rw-auth-recovery{align-items:flex-start;flex-direction:column}.sb-rw-main.is-comment-acquisition-work,.sb-rw-main.is-specialist-acquisition-work{display:block}.sb-rw-main.is-comment-acquisition-work .sb-rw-panel,.sb-rw-main.is-specialist-acquisition-work .sb-rw-panel{margin-bottom:10px}.sb-rw-main.is-comment-acquisition-work .sb-rw-acquisition-queue-panel,.sb-rw-main.is-comment-acquisition-work .sb-rw-acquisition-detail-panel{min-height:0}.sb-rw-acquisition-queue-body .sb-rw-acquisition-people{max-height:none}.sb-rw-acquisition-detail-empty{min-height:240px}}
/* Unified acquisition workbench overrides. */
.sb-rw-main.is-comment-acquisition-work>.sb-rw-acquisition-detail-panel{display:flex;flex-direction:column;align-self:stretch}.sb-rw-acquisition-queue-body{overflow:auto}.sb-rw-acquisition-queue-group{display:grid;gap:8px}.sb-rw-acquisition-queue-group-title{color:#58645e;font-size:10px;font-weight:680}.sb-rw-acquisition-group-empty{padding:11px 12px;border:1px dashed #dce5e0;border-radius:7px;color:#98a39d;font-size:10px}.sb-rw-acquisition-queue-body .sb-rw-acquisition-people{display:grid;gap:7px;max-height:none}.sb-rw-acquisition-person-meta b{color:#b6751e}.sb-rw-acquisition-person-meta b.is-sent{color:#159965}.sb-rw-acquisition-queue-body .sb-rw-acquisition-touch{margin-top:7px;color:#159965;font-size:9px;font-weight:650}.sb-rw-acquisition-detail-body{display:grid;flex:1;align-content:start;gap:15px;min-height:0;overflow:auto}.sb-rw-acquisition-outreach-detail{display:grid;gap:10px}.sb-rw-acquisition-outreach-source,.sb-rw-acquisition-outreach-message,.sb-rw-acquisition-outreach-pending{padding:12px;border-radius:7px;font-size:10px;line-height:1.6}.sb-rw-acquisition-outreach-source{border:1px solid #e7ece9;background:#fafcfb}.sb-rw-acquisition-outreach-message{max-width:92%;border:1px solid #dce9e1;background:#f2faf5}.sb-rw-acquisition-outreach-message.is-inbound{justify-self:end;border-color:#dce5f3;background:#f5f8ff}.sb-rw-acquisition-outreach-pending{border:1px dashed #dce5e0;color:#89948e}.sb-rw-acquisition-outreach-source span,.sb-rw-acquisition-outreach-message span{display:block;color:#819089;font-size:9px;font-weight:650}.sb-rw-acquisition-outreach-message.is-inbound span{color:#61779b}.sb-rw-acquisition-outreach-source p,.sb-rw-acquisition-outreach-message p{margin:6px 0 0;color:#334039;font-size:11px;word-break:break-word}
/* Keep workbench surfaces aligned with the marketing site's white and cool-blue palette. */
.sb-realtime-page{background:var(--sb-app-page-bg,#f7f8fb)}
.sb-rw-cloud-wrap,.sb-rw-cloud-live-wrap{background:var(--sb-app-subtle-bg,#f3f6fb)}
.sb-rw-panel{border-color:#e1e7f0;box-shadow:0 1px 2px rgba(56,84,125,.035)}
.sb-rw-cloud-live,.sb-rw-cloud-replay-stage{border-color:#dce4ef;box-shadow:0 8px 20px rgba(51,78,122,.08)}
.sb-rw-cloud-live-status{border-top-color:#e7edf5}
.sb-rw-live-room-stage{position:relative;display:grid;place-items:center;width:min(100%,300px);height:100%;aspect-ratio:9 / 16;overflow:hidden;border:1px solid #cfdad5;border-radius:10px;background:#111522;box-shadow:0 8px 20px rgba(32,58,48,.12)}
/* Keep the portrait frame, but anchor the landscape capture on the actual live-room canvas. */
.sb-rw-live-room-stage img,.sb-rw-live-room-stage video{display:block;width:100%;height:100%;object-fit:cover;object-position:34% center;background:#111522}
.sb-rw-live-room-stage>img.sb-rw-live-room-fallback{transform:none}
.sb-rw-live-room-waiting{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,transparent 50%,rgba(17,21,34,.76));color:#e9eef7;font-size:12px;text-align:center;pointer-events:none}
.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel{border:1px solid #dce4ef;border-radius:15px;background:#fff;box-shadow:0 1px 2px rgba(56,84,125,.035);overflow:hidden}
.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel .sb-rw-cloud-live-wrap{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;padding:0;flex:1;min-height:0;background:transparent;flex-direction:column}
.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel .sb-rw-live-room-stage{flex:none;width:100%;height:100%;max-height:620px;aspect-ratio:auto;border-radius:14px}
.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel{display:flex;flex-direction:column;align-self:stretch;overflow:hidden}
.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel .sb-rw-cloud-live-wrap{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;padding:0;flex:1;min-height:0;background:transparent;flex-direction:column}
.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel .sb-rw-live-room-stage{flex:none;width:100%;height:100%;max-height:620px;aspect-ratio:auto;border-radius:14px}
@media(min-width:1201px){.sb-rw-main.is-comment-acquisition-work{grid-template-rows:620px}.sb-rw-main.is-comment-acquisition-work>.sb-rw-panel{height:620px;min-height:0;max-height:620px}}
@media(min-width:1201px){.sb-rw-main.is-finder-work{grid-template-rows:620px}.sb-rw-main.is-finder-work>.sb-rw-panel{height:620px;min-height:0;max-height:620px}}
@media(min-width:1201px){.sb-rw-main.is-analysis-work{grid-template-rows:620px}.sb-rw-main.is-analysis-work>.sb-rw-panel{height:620px;min-height:0;max-height:620px}}
@media(max-width:1200px){.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel .sb-rw-cloud-live-wrap{display:flex;min-height:620px;height:auto}.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel .sb-rw-live-room-stage{width:min(100%,300px);height:620px;max-height:620px;aspect-ratio:9 / 16}}
@media(max-width:1200px){.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel{display:block;grid-column:1/-1}.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel .sb-rw-cloud-live-wrap{display:flex;min-height:620px;height:auto}.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel .sb-rw-live-room-stage{width:min(100%,300px);height:620px;max-height:620px;aspect-ratio:9 / 16}}
@media(max-width:760px){.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel .sb-rw-cloud-live-wrap{min-height:0}.sb-rw-main.is-comment-acquisition-work>.sb-rw-pure-live-panel .sb-rw-live-room-stage{width:min(100%,300px);height:520px;max-height:520px;aspect-ratio:9 / 16}}
@media(max-width:760px){.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel .sb-rw-cloud-live-wrap{min-height:0}.sb-rw-main.is-finder-work>.sb-rw-finder-live-panel .sb-rw-live-room-stage{width:min(100%,300px);height:520px;max-height:520px;aspect-ratio:9 / 16}}
/* Keep the prospect detail readable as a factual processing trail. */
.sb-rw-acquisition-detail-body{padding:14px 15px 16px;gap:13px}
.sb-rw-acquisition-detail-profile{padding-bottom:13px}
.sb-rw-acquisition-detail-profile>div{min-width:0;flex:1}
.sb-rw-acquisition-detail-profile .sb-rw-acquisition-avatar{width:40px;height:40px}
.sb-rw-acquisition-detail-profile strong{font-size:13px}
.sb-rw-acquisition-detail-profile span{overflow:hidden;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-acquisition-detail-status{flex:none;padding:4px 7px;border-radius:6px;background:#f1f5ff;color:#2f80ed;font-size:9px;font-weight:680;white-space:nowrap}
.sb-rw-acquisition-detail-status.is-pending{background:#fff7e8;color:#b6751e}
.sb-rw-acquisition-detail-timeline{gap:0;margin-top:0}
.sb-rw-acquisition-detail-step{grid-template-columns:12px minmax(0,1fr);gap:9px;min-height:0;padding:0 0 16px}
.sb-rw-acquisition-detail-step:not(:last-child)::before{top:13px;bottom:0}
.sb-rw-acquisition-detail-step>i{margin-top:2px}
.sb-rw-acquisition-detail-step.is-pending>i{border-color:#d7dfe9;background:#fff;box-shadow:none}
.sb-rw-acquisition-detail-step-copy{min-width:0}
.sb-rw-acquisition-detail-step-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:16px}
.sb-rw-acquisition-detail-step-head>strong{color:#27332d;font-size:11px;font-weight:700}
.sb-rw-acquisition-detail-step-head .sb-rw-acquisition-detail-step-state{display:block;margin:0;overflow:hidden;color:#7d8b84;font-size:9px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-acquisition-detail-step.is-done .sb-rw-acquisition-detail-step-state{color:#159965}
.sb-rw-acquisition-detail-evidence,.sb-rw-acquisition-detail-judgment,.sb-rw-acquisition-detail-message,.sb-rw-acquisition-detail-capture-fields{margin-top:7px}
.sb-rw-acquisition-detail-evidence{padding:9px 10px;border-left:2px solid #bfd1f0;background:#f7f9fd}
.sb-rw-acquisition-detail-evidence>span,.sb-rw-acquisition-detail-judgment>span,.sb-rw-acquisition-detail-message>span{display:block;color:#8b9690;font-size:9px;font-weight:650}
.sb-rw-acquisition-detail-evidence p,.sb-rw-acquisition-detail-judgment p,.sb-rw-acquisition-detail-message p,.sb-rw-acquisition-detail-capture-quote{margin:5px 0 0;color:#34413b;font-size:10px;line-height:1.55;word-break:break-word}
.sb-rw-acquisition-detail-judgment{padding:9px 10px;background:#f8faf9}
.sb-rw-acquisition-detail-judgment>span:not(:first-child){margin-top:8px}
.sb-rw-acquisition-detail-signals{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.sb-rw-acquisition-detail-signals span{display:inline-flex;align-items:center;margin:0;padding:3px 6px;border:1px solid #d9e8df;border-radius:5px;background:#f0f8f3;color:#398365;font-size:9px;line-height:1.2}
.sb-rw-acquisition-detail-muted{margin:6px 0 0;color:#9aa49e;font-size:9px;line-height:1.45}
.sb-rw-acquisition-detail-message{padding:9px 10px;border-radius:7px;background:#f2faf5}
.sb-rw-acquisition-detail-message.is-inbound{margin-top:6px;background:#f5f8ff}
.sb-rw-acquisition-detail-message.is-outbound>span{color:#398365}
.sb-rw-acquisition-detail-message.is-inbound>span{color:#61779b}
.sb-rw-acquisition-detail-capture-fields{display:grid;gap:7px}
.sb-rw-acquisition-detail-capture-fields>div{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-bottom:6px;border-bottom:1px solid #edf1ef}
.sb-rw-acquisition-detail-capture-fields span{margin:0;color:#8b9690;font-size:9px}
.sb-rw-acquisition-detail-capture-fields strong{color:#34413b;font-size:10px;font-weight:650;text-align:right;word-break:break-all}
.sb-rw-acquisition-detail-capture-quote{color:#6f7e76;font-size:9px}
/* Keep the live queue as one continuous processing stream. */
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-queue-body{display:grid;gap:0;padding:7px 15px 14px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-queue-body:not(.is-empty){grid-template-rows:minmax(0,1fr) auto;overflow:hidden}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-queue-body.is-empty{grid-template-rows:auto minmax(0,1fr);gap:12px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-people{display:grid;grid-auto-rows:max-content;align-content:start;gap:0;min-height:0;max-height:none;overflow:auto}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person{grid-template-columns:48px minmax(0,1fr);gap:12px;padding:13px 8px;border:0;border-bottom:1px solid #f0f3f2;border-radius:0;background:transparent}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person{align-self:start;min-height:0}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person:first-child{padding-top:10px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person:last-child{border-bottom:0}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person:hover{border-color:#f0f3f2;background:#fafcfb;box-shadow:none}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person.is-selected{border-color:#f0f3f2;background:#f7fbf9;box-shadow:inset 3px 0 #16a571}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-avatar{width:48px;height:48px;border-radius:50%}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person-top{justify-content:flex-start;min-width:0}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person-top strong{display:block;overflow:hidden;color:#27332d;font-size:14px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person-meta{gap:12px;margin-top:7px;font-size:11px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person-meta>span{overflow:visible;text-overflow:clip;white-space:nowrap}
.sb-rw-acquisition-progress{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:11px;font-weight:600;white-space:nowrap}
.sb-rw-acquisition-progress i{width:8px;height:8px;border-radius:50%;background:#f28a35;box-shadow:0 0 0 4px rgba(242,138,53,.12)}
.sb-rw-acquisition-progress.is-sending{color:#f0782e}.sb-rw-acquisition-progress.is-sending i{background:#f0782e}
.sb-rw-acquisition-progress.is-queued{color:#f0782e}.sb-rw-acquisition-progress.is-queued i{background:#f0782e}
.sb-rw-acquisition-progress.is-waiting-reply{color:#2f80ed}.sb-rw-acquisition-progress.is-waiting-reply i{background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.12)}
.sb-rw-acquisition-progress.is-replied{color:#16a571}.sb-rw-acquisition-progress.is-replied i{background:#16a571;box-shadow:0 0 0 4px rgba(22,165,113,.12)}
.sb-rw-acquisition-progress.is-failed{color:#b34d44}.sb-rw-acquisition-progress.is-failed i{background:#b34d44;box-shadow:0 0 0 4px rgba(179,77,68,.12)}
.sb-rw-acquisition-source{color:#9aa39f;font-size:11px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-quote{margin-top:9px;color:#27332d;font-size:13px;line-height:1.55}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-queue-status{padding:4px 8px 0}
/* Keep the acquisition workbench on a blue, orange, and neutral status palette. */
.sb-rw-acquisition-running i{background:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.12)}
.sb-rw-acquisition-queue-status{color:#2f80ed}.sb-rw-acquisition-queue-status i{background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.1)}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person-meta b{color:#2f80ed}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person-meta b.is-sent{color:#2f80ed}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-touch{color:#2f80ed}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person:hover{border-color:#dce5f3;background:#fbfcff}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person.is-selected{border-color:#b7c8e5;background:#fff;box-shadow:none;border-radius:16px}
.sb-rw-acquisition-progress.is-replied{color:#2f80ed}.sb-rw-acquisition-progress.is-replied i{background:#2f80ed;box-shadow:0 0 0 4px rgba(47,128,237,.12)}
.sb-rw-acquisition-detail-step.is-done .sb-rw-acquisition-detail-step-state{color:#2f80ed}
.sb-rw-acquisition-detail-signals span{border-color:#dce5f3;background:#f1f5ff;color:#4f6f9f}
.sb-rw-acquisition-detail-message.is-outbound{background:#f5f8ff;border:1px solid #dce5f3}
.sb-rw-acquisition-detail-message.is-outbound>span{color:#2f80ed}
.sb-rw-acquisition-queue-panel .sb-rw-panel-title{font-size:16px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-running{font-size:13px}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-running i{width:9px;height:9px}
.sb-rw-main.is-comment-acquisition-work>.sb-rw-acquisition-queue-panel{border:0;box-shadow:none}
.sb-rw-acquisition-queue-panel>.sb-rw-panel-head{border-bottom:0}
.sb-rw-acquisition-queue-panel .sb-rw-acquisition-person{border-bottom:0}
.sb-rw-acquisition-detail-panel>.sb-rw-panel-head{border-bottom:0}
.sb-rw-acquisition-detail-fact-list{display:grid;gap:9px;margin-top:7px}
.sb-rw-acquisition-detail-fact{min-width:0}
.sb-rw-acquisition-detail-fact>span,.sb-rw-acquisition-detail-section-label,.sb-rw-acquisition-detail-generation-basis>span{display:block;color:#8b9690;font-size:9px;font-weight:650}
.sb-rw-acquisition-detail-fact>p{margin:4px 0 0;color:#405148;font-size:10px;line-height:1.5;word-break:break-word}
.sb-rw-acquisition-detail-basis{display:grid;gap:5px;margin:6px 0 0;padding:0;list-style:none}
.sb-rw-acquisition-detail-basis li{position:relative;padding-left:10px;color:#405148;font-size:10px;line-height:1.5;word-break:break-word}
.sb-rw-acquisition-detail-basis li::before{position:absolute;top:0;left:0;color:#8291a8;content:"·"}
.sb-rw-acquisition-detail-decision{display:grid;gap:4px;margin-top:9px;padding:10px;border-radius:9px;background:#050505;color:#fff}
.sb-rw-acquisition-detail-decision>span{color:#bdc4ce;font-size:9px}
.sb-rw-acquisition-detail-decision>strong{font-size:11px;font-weight:700}
.sb-rw-acquisition-detail-step.is-done .sb-rw-acquisition-detail-decision>span{color:#bdc4ce}
.sb-rw-acquisition-detail-step.is-done .sb-rw-acquisition-detail-decision>strong{color:#fff}
.sb-rw-acquisition-detail-recommendation{margin:8px 0 0;color:#34413b;font-size:10px;line-height:1.5}
.sb-rw-acquisition-detail-section-label{margin-top:1px;color:#27332d;font-size:10px}
.sb-rw-acquisition-detail-generation-basis{margin-top:9px;padding-top:9px;border-top:1px solid #edf1ef}
/* Keep task adjustment surfaces on the blue workspace accent. */
.sb-rw-task-update-dialog{border-color:#dce5f3;box-shadow:0 24px 80px rgba(30,52,88,.16)}
.sb-rw-task-update-head{border-bottom-color:#e8edf5}
.sb-rw-task-update-close{background:#f4f7fc;color:#64748b}.sb-rw-task-update-close:hover{background:#eaf0fb}
.sb-rw-task-update-boundary{border-color:#dce5f3;background:#f5f8ff;color:#5d6f83}
.sb-rw-task-update-boundary strong{color:#426aa7}
.sb-rw-task-update-section{border-color:#e4eaf3;background:#fbfcff}
.sb-rw-task-update-section h3{color:#344a68}
.sb-rw-task-update-field label{color:#7b8799}
.sb-rw-task-update-field input,.sb-rw-task-update-field select,.sb-rw-task-update-field textarea{border-color:#dce5f3;color:#2d3d56}
.sb-rw-task-update-field input:focus,.sb-rw-task-update-field select:focus,.sb-rw-task-update-field textarea:focus{border-color:#2f80ed;box-shadow:0 0 0 2px rgba(47,128,237,.12)}
.sb-rw-task-update-readonly{border-color:#dce5f3;background:#f5f8ff;color:#405b84}
.sb-rw-task-update-preview>section{border-color:#e3e9f2}
.sb-rw-task-update-preview h4{color:#667792}
.sb-rw-task-update-summary-group h5{color:#344a68}
.sb-rw-task-update-summary-row{color:#8290a3}.sb-rw-task-update-summary-row strong{color:#405675}
.sb-rw-task-update-footer button{border-color:#d8e2f0;color:#53627a}
.sb-rw-task-update-footer button:last-child{border-color:#2f80ed;background:#2f80ed}
/* Analysis produces an actionable prospect list rather than a separate conclusion document. */
.sb-rw-analysis-prospects-panel{min-width:0;overflow:hidden}.sb-rw-analysis-prospects-panel>.sb-rw-panel-head{border-bottom:0}.sb-rw-analysis-prospect-list{display:grid;grid-auto-rows:max-content;align-content:start;flex:1;min-height:0;padding:7px 15px 14px;overflow:auto}.sb-rw-analysis-prospect{display:grid;grid-template-columns:44px minmax(0,1fr);gap:11px;width:100%;padding:13px 8px;border:0;border-bottom:1px solid #edf1f5;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.sb-rw-analysis-prospect:hover{background:#fbfcff}.sb-rw-analysis-prospect.is-selected{background:#f4f4f5;box-shadow:inset 3px 0 #2f80ed}.sb-rw-analysis-prospect:last-child{border-bottom:0}.sb-rw-analysis-prospect .sb-rw-acquisition-avatar{width:44px;height:44px;border-radius:50%}.sb-rw-analysis-prospect-copy{display:grid;min-width:0}.sb-rw-analysis-prospect-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.sb-rw-analysis-prospect-top strong{min-width:0;overflow:hidden;color:#27332d;font-size:13px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.sb-rw-analysis-prospect-tier{flex:none;padding:3px 6px;border-radius:5px;background:#f1f5ff;color:#2f80ed;font-size:9px;font-weight:680;line-height:1.2}.sb-rw-analysis-prospect-tier.is-medium{background:#fff7e8;color:#b6751e}.sb-rw-analysis-prospect-source,.sb-rw-analysis-prospect-quote,.sb-rw-analysis-prospect-evidence,.sb-rw-analysis-prospect-next{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis}.sb-rw-analysis-prospect-source{margin-top:5px;color:#8b969e;font-size:9px;white-space:nowrap}.sb-rw-analysis-prospect-quote{margin-top:6px;color:#34413b;font-size:11px;line-height:1.45;white-space:nowrap}.sb-rw-analysis-prospect-evidence{margin-top:5px;color:#647080;font-size:9px;line-height:1.45;white-space:nowrap}.sb-rw-analysis-prospect-next{margin-top:7px;color:#2f80ed;font-size:9px;font-weight:650;line-height:1.45;white-space:nowrap}
.sb-rw-main.is-live-danmaku-analysis-work,.sb-rw-main.is-live-danmaku-outreach-work{grid-template-columns:minmax(300px,.84fr) minmax(360px,1fr) minmax(330px,.96fr);align-items:stretch}.sb-rw-main.is-live-danmaku-analysis-work>.sb-rw-panel,.sb-rw-main.is-live-danmaku-outreach-work>.sb-rw-panel{min-height:620px}.sb-rw-main.is-live-danmaku-analysis-work>.sb-rw-panel>.sb-rw-panel-head,.sb-rw-main.is-live-danmaku-outreach-work>.sb-rw-panel>.sb-rw-panel-head{height:61px;min-height:61px;box-sizing:border-box}.sb-rw-main.is-live-danmaku-analysis-work>.sb-rw-live-danmaku-room-panel,.sb-rw-main.is-live-danmaku-outreach-work>.sb-rw-live-danmaku-room-panel{display:flex;flex-direction:column;overflow:hidden}.sb-rw-main.is-live-danmaku-outreach-work>.sb-rw-live-danmaku-outreach-pending-panel,.sb-rw-main.is-live-danmaku-outreach-work>.sb-rw-live-danmaku-outreach-sent-panel{display:flex;flex-direction:column;overflow:hidden}.sb-rw-main.is-live-danmaku-outreach-work .sb-rw-outreach-specialist-list{display:grid;align-content:start;gap:16px;flex:1;min-height:0;padding:14px;overflow:auto}.sb-rw-live-danmaku-room-panel .sb-rw-cloud-live-wrap{display:flex;flex:1;min-height:0;flex-direction:column;padding:0;background:transparent}.sb-rw-live-danmaku-room-panel .sb-rw-live-room-stage{flex:1;width:100%;min-height:0;max-height:none;aspect-ratio:auto;border-radius:14px}.sb-rw-live-danmaku-room-status{display:flex;align-items:center;gap:8px;padding:11px 14px;color:#16885b;font-size:10px}.sb-rw-live-danmaku-room-status i{width:7px;height:7px;border-radius:50%;background:#18a86f;box-shadow:0 0 0 4px rgba(24,168,111,.1)}.sb-rw-live-danmaku-analysis-queue-panel,.sb-rw-live-danmaku-analysis-detail-panel{display:flex;flex-direction:column;overflow:hidden}.sb-rw-live-danmaku-analysis-queue-panel .sb-rw-acquisition-queue-body,.sb-rw-live-danmaku-analysis-detail-panel .sb-rw-acquisition-detail-body{min-height:0}.sb-rw-live-danmaku-analysis-queue-panel .sb-rw-acquisition-person-meta b{color:#6b55c7}.sb-rw-live-danmaku-analysis-queue-panel .sb-rw-acquisition-person-top>b{flex:none;padding:3px 6px;border-radius:5px;background:#f0ebff;color:#6b55c7;font-size:9px;font-weight:680}.sb-rw-live-danmaku-facts{display:grid;gap:8px}.sb-rw-live-danmaku-fact{display:grid;grid-template-columns:68px minmax(0,1fr);gap:9px;padding-bottom:9px;border-bottom:1px solid #edf1ef}.sb-rw-live-danmaku-fact span{color:#89948e;font-size:10px}.sb-rw-live-danmaku-fact strong{color:#334039;font-size:10px;line-height:1.5;word-break:break-word}.sb-rw-live-danmaku-evidence{display:grid;gap:7px}.sb-rw-live-danmaku-evidence h3{margin:0;color:#64716b;font-size:10px;font-weight:680}.sb-rw-live-danmaku-evidence p{margin:0;padding:9px 10px;border-left:3px solid #8d70e8;border-radius:0 7px 7px 0;background:#f7f4ff;color:#4b485d;font-size:10px;line-height:1.55;word-break:break-word}.sb-rw-main.is-viral-work-analysis-work{grid-template-columns:minmax(340px,.86fr) minmax(500px,1.14fr);align-items:stretch}.sb-rw-main.is-viral-work-analysis-work>.sb-rw-panel{min-height:620px}.sb-rw-main.is-viral-work-analysis-work>.sb-rw-panel>.sb-rw-panel-head{height:61px;min-height:61px;box-sizing:border-box}.sb-rw-viral-source-panel,.sb-rw-viral-report-panel{display:flex;flex-direction:column;overflow:hidden}.sb-rw-viral-source-body,.sb-rw-viral-report-body{display:grid;align-content:start;gap:15px;flex:1;min-height:0;padding:16px;overflow:auto}.sb-rw-viral-source-link{display:grid;gap:6px;padding:12px;border:1px solid #e1e8f2;border-radius:9px;background:#f8faff}.sb-rw-viral-source-link span{color:#7a8797;font-size:10px}.sb-rw-viral-source-link strong,.sb-rw-viral-source-link a{color:#3a5e99;font-size:11px;line-height:1.5;overflow-wrap:anywhere}.sb-rw-viral-source-link a{text-decoration:none}.sb-rw-viral-goal{padding:11px 12px;border:1px solid #e8edf3;border-radius:8px;color:#596573;font-size:10px;line-height:1.55}.sb-rw-viral-progress{height:7px;overflow:hidden;border-radius:99px;background:#e9eef5}.sb-rw-viral-progress i{display:block;height:100%;border-radius:inherit;background:#527fd0;transition:width .35s ease}.sb-rw-viral-progress-meta{color:#647080;font-size:10px;line-height:1.55}.sb-rw-viral-process{display:grid;gap:7px}.sb-rw-viral-process-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:8px;padding:10px;border:1px solid #e7ebf1;border-radius:8px;background:#fbfcfe}.sb-rw-viral-process-row i{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#eef2f7;color:#8a96a4;font-size:10px;font-style:normal}.sb-rw-viral-process-row.is-done i{background:#eaf8ef;color:#197e53}.sb-rw-viral-process-row span{color:#3d4b5b;font-size:10px}.sb-rw-viral-process-row small{color:#8a96a4;font-size:9px}.sb-rw-viral-complete{padding:11px 12px;border:1px solid #d9eee2;border-radius:8px;background:#f2faf5;color:#197e53;font-size:10px}.sb-rw-viral-error{padding:11px 12px;border:1px solid #f1d9d9;border-radius:8px;background:#fff7f7;color:#a55454;font-size:10px;line-height:1.55}.sb-rw-viral-report-summary{margin:0;color:#394655;font-size:12px;line-height:1.65}.sb-rw-viral-report-facts{display:grid;gap:7px;padding-top:2px;color:#667382;font-size:10px;line-height:1.55}.sb-rw-viral-artifact{padding:10px 11px;border:1px solid #d9eee2;border-radius:8px;background:#f2faf5;color:#197e53;font-size:10px;line-height:1.5}
@media(max-width:1200px){.sb-rw-main.is-analysis-work>.sb-rw-analysis-prospects-panel{grid-column:1/-1}}
@media(max-width:1200px){.sb-rw-main.is-live-danmaku-analysis-work,.sb-rw-main.is-live-danmaku-outreach-work{grid-template-columns:minmax(0,1fr) minmax(300px,.9fr)}.sb-rw-main.is-live-danmaku-analysis-work>.sb-rw-live-danmaku-room-panel,.sb-rw-main.is-live-danmaku-outreach-work>.sb-rw-live-danmaku-room-panel{grid-column:1/-1}.sb-rw-main.is-viral-work-analysis-work{grid-template-columns:minmax(0,1fr)}.sb-rw-main.is-viral-work-analysis-work>.sb-rw-panel{min-height:0}}
/* Keep the empty state within the page body's available height after the account rail. */
.sb-page.sb-page-realtime-work > .sb-page-body{min-height:0}
.sb-page.sb-page-realtime-work > .sb-page-body > .sb-realtime-page{display:flex;flex-direction:column;min-height:100%;height:100%}
.sb-rw-account-section{flex:0 0 auto}
.sb-rw-no-account{display:flex;flex:1 1 auto;align-items:center;justify-content:center;min-height:320px;overflow:auto}
.sb-rw-no-account-inner{width:min(100%,360px);max-width:100%;padding:16px 0}
@media (max-width:760px){.sb-rw-no-account{min-height:300px;padding:32px 16px}.sb-rw-no-account-inner{width:min(100%,340px)}.sb-rw-no-account strong{font-size:16px}.sb-rw-no-account span{font-size:11px;line-height:1.6}}
@media (max-height:720px){.sb-realtime-page{padding-top:16px;padding-bottom:20px}.sb-rw-account-section{margin-bottom:12px}.sb-rw-no-account{min-height:280px;padding-top:24px;padding-bottom:24px}.sb-rw-no-account-inner{gap:9px;padding:8px 0}.sb-rw-no-account-art{width:74px;height:68px;margin-bottom:0}.sb-rw-no-account-art img{width:64px;height:64px}.sb-rw-no-account button{margin-top:2px}}
`;

function ensureStyle() {
  if (document.querySelector("#salebuddy-realtime-work-style")) return;
  const style = document.createElement("style");
  style.id = "salebuddy-realtime-work-style";
  style.textContent = CSS;
  document.head.appendChild(style);
}

const AUTHORIZATION_RECOVERY_CODES = new Set([
  "DOUYIN_AUTH_EXPIRED",
  "DOUYIN_AUTHORIZATION_REQUIRED",
  "DOUYIN_LOGIN_REQUIRED",
  "LOGIN_EXPIRED",
  "AUTHORIZATION_REQUIRED"
]);

function authorizationRecoveryEvidence(value) {
  if (!value) return false;
  if (typeof value === "string") return /授权已失效|授权过期|重新连接账号|重新登录|登录失效|登录过期|账号掉线/.test(value);
  if (typeof value !== "object") return false;
  const code = String(value.code || value.reason || "").trim().toUpperCase();
  if (AUTHORIZATION_RECOVERY_CODES.has(code)) return true;
  return authorizationRecoveryEvidence(String(value.message || value.detail || ""));
}

export function authorizationRecoveryForWork(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const values = [work?.lastError, metadata.error, metadata.resumeBlocked];
  if (!values.some(authorizationRecoveryEvidence)) return null;
  return {
    label: "账号已掉线",
    detail: "抖音账号已掉线，重新连接后会从原任务继续。"
  };
}

export function realtimeWorkDisplayStatus(work = {}) {
  if (authorizationRecoveryForWork(work)) return "auth-expired";
  const taskState = String(work?.metadata?.taskState || work?.metadata?.acquisitionTaskState || "").toLowerCase();
  if (taskState === "paused") return "paused";
  if (taskState === "stopped" || work?.state === "done") return "done";
  return work?.lastError ? "error" : "working";
}

function statusLabel(status) {
  return status === "working" ? "执行中" : status === "done" ? "已完成" : status === "auth-expired" ? "账号已掉线" : status === "error" ? "异常" : status === "paused" ? "已暂停" : "未开始";
}

function realtimeErrorText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === "object") {
    const message = value.message || value.detail || value.reason || value.code;
    return message ? String(message) : "任务需要处理";
  }
  return String(value);
}

export function isAcquisitionRealtimeAgent(agentId) {
  return ACQUISITION_REALTIME_AGENT_IDS.has(String(agentId || ""));
}

export function isRealtimeWorkAgent(agentId) {
  const id = String(agentId || "").trim();
  return isAcquisitionRealtimeAgent(id) || STANDALONE_REALTIME_AGENT_IDS.has(id);
}

function supportsAcquisitionRealtimeMetadata(agentId) {
  const id = String(agentId || "").trim();
  return ACQUISITION_REALTIME_AGENT_IDS.has(id) || LEGACY_ACQUISITION_REALTIME_AGENT_IDS.has(id);
}

function cloudCaptureProfileFor(agentId, work = {}) {
  return isAcquisitionRealtimeAgent(agentId) && isDouyinCloudAgent(agentId, work)
    ? "douyin-live-room"
    : "full-screen";
}

function cloudCaptureRegionFor(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const candidates = [
    work.captureRegion, work.capture_region,
    metadata.captureRegion, metadata.capture_region,
    metadata.liveRoomRegion, metadata.live_room_region,
    metadata.cloudCapture?.region, metadata.cloud_capture?.region
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
}

export function isCompletedLiveWork(selected = {}, realtime = null) {
  return selected?.status === "done"
    || selected?.liveWork?.state === "done"
    || realtime?.taskState === "completed";
}

export function isSuccessfulReplayWork(work = {}) {
  if (!work || work.lastError) return false;
  const taskState = String(work?.metadata?.taskState || work?.metadata?.acquisitionTaskState || "").trim().toLowerCase();
  if (["stopped", "cancelled", "canceled", "failed", "error"].includes(taskState)) return false;
  const artifact = String(work.artifact || "").trim();
  if (/取消|失败|异常|错误|掉线|中断/.test(artifact)) return false;
  return work.state === "done" || ["completed", "succeeded"].includes(taskState);
}

export function cloudReplayPresentation(replay = null, liveWork = null) {
  if (replay?.segments?.length) return { mode: "replay", label: "", emptyText: "" };

  const taskState = String(
    liveWork?.metadata?.taskState
      || liveWork?.metadata?.acquisitionTaskState
      || liveWork?.taskState
      || liveWork?.state
      || ""
  ).trim().toLowerCase();
  const hasActiveTask = Boolean(liveWork) && ![
    "done", "completed", "succeeded", "stopped", "cancelled", "canceled", "failed", "error"
  ].includes(taskState);

  return hasActiveTask
    ? { mode: "waiting", label: "", emptyText: "任务已启动，等待首次成功工作" }
    : { mode: "empty", label: "暂无成功工作", emptyText: "暂无成功工作的录屏" };
}

export const ACQUISITION_TASK_UPDATE_ACTION = "task.config.update";

const TASK_UPDATE_STRATEGY_KEYS = Object.freeze(["sourceScope", "audienceGoal", "requirements"]);
const TASK_UPDATE_TOUCH_KEYS = Object.freeze(["channel", "message", "strategy", "replyStyle", "handoffBoundary", "approvalMode"]);
const TASK_UPDATE_RUNTIME_KEYS = Object.freeze(["frequency", "maxTouchesPerDay", "minIntervalMinutes", "stopConditions"]);
const ACQUISITION_TASK_CONFIGURATION_DEFAULTS = Object.freeze({
  replyStyle: "专业、简短、自然",
  handoffBoundary: "价格承诺、退款、投诉和无法确认的库存信息交给人工。",
  maxTouchesPerDay: 30,
  minIntervalMinutes: 15,
  stopConditions: "用户明确拒绝或退订后停止该潜客自动触达"
});

function compactObject(source, keys) {
  const input = source && typeof source === "object" ? source : {};
  return Object.fromEntries(keys
    .map((key) => [key, input[key]])
    .filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Keep task edits inside the strategy layer. Credentials, platform/account,
 * cloud ownership, history, and already-processed records never enter this patch.
 */
export function normalizeAcquisitionTaskUpdateDraft(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  const strategy = input.strategy || input.discovery || input.findingStrategy || {};
  const rawTouch = input.touchContent ?? input.touch ?? {};
  const touch = typeof rawTouch === "string" ? { message: rawTouch } : rawTouch;
  const runtimeRules = input.runtimeRules || input.runtime || {};
  const normalizedRuntime = compactObject(runtimeRules, TASK_UPDATE_RUNTIME_KEYS);
  for (const key of ["maxTouchesPerDay", "minIntervalMinutes"]) {
    const number = asFiniteNumber(normalizedRuntime[key]);
    if (number === null) delete normalizedRuntime[key];
    else normalizedRuntime[key] = Math.max(0, Math.floor(number));
  }
  return {
    strategy: compactObject(strategy, TASK_UPDATE_STRATEGY_KEYS),
    touchContent: compactObject(touch, TASK_UPDATE_TOUCH_KEYS),
    runtimeRules: normalizedRuntime
  };
}

export function acquisitionTaskUpdatePayload(agentType, context = {}, changes = {}, options = {}) {
  const update = normalizeAcquisitionTaskUpdateDraft(changes);
  delete update.strategy.sourceScope;
  // The comprehensive agent is an account-level listener. Its prospect-level
  // opt-out protection is fixed by the backend and cannot be updated as a
  // task-level stop rule through an older client payload.
  if (agentType === "mkt-comment-acquisition") {
    // Comprehensive acquisition owns audience discovery and first-message
    // generation in the backend. Ignore legacy caller fields at this boundary.
    delete update.strategy.audienceGoal;
    delete update.strategy.requirements;
    delete update.touchContent.message;
    delete update.touchContent.strategy;
    delete update.runtimeRules.frequency;
    delete update.runtimeRules.stopConditions;
    // Keep older clients and deep links from reviving the retired public
    // reply flow. The backend separately rejects any non-private channel.
    if (Object.prototype.hasOwnProperty.call(update.touchContent, "channel")) {
      update.touchContent.channel = "private_message";
    }
  }
  if (agentType === "mkt-find-people") update.runtimeRules = {};
  const requestedBaseVersion = Number(options.baseConfigVersion ?? context.configVersion ?? 1);
  const baseConfigVersion = Number.isInteger(requestedBaseVersion) && requestedBaseVersion >= 1 ? requestedBaseVersion : 1;
  const requestedConfigVersion = Number(options.configVersion ?? (baseConfigVersion + 1));
  const configVersion = Number.isInteger(requestedConfigVersion) && requestedConfigVersion === baseConfigVersion + 1
    ? requestedConfigVersion
    : baseConfigVersion + 1;
  const payload = {
    action: ACQUISITION_TASK_UPDATE_ACTION,
    agentId: agentType,
    taskId: context.taskId,
    taskRunId: context.taskRunId,
    accountId: context.accountId,
    conversationId: context.conversationId,
    changes: Object.fromEntries(Object.entries(update).filter(([, value]) => Object.keys(value).length)),
    effectiveScope: "future_only",
    baseConfigVersion,
    configVersion,
    expectedVersion: options.expectedVersion,
    ...(options.confirmation === true
      ? { confirmation: { confirmed: true } }
      : (options.confirmation && typeof options.confirmation === "object" ? { confirmation: options.confirmation } : {}))
  };
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function textValue(value) {
  return String(value ?? "").trim();
}

function valueFrom(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) continue;
    const text = textValue(value);
    if (text) return text;
  }
  return "";
}

function structuredValueFrom(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value).trim();
      if (text) return text;
      continue;
    }
    if (Array.isArray(value)) {
      const text = value.map((entry) => structuredValueFrom(entry)).filter(Boolean).join("、");
      if (text) return text;
      continue;
    }
    if (typeof value === "object") {
      const text = JSON.stringify(value);
      if (text && text !== "{}") return text;
    }
  }
  return "";
}

function sourceScopeLabel(...values) {
  const raw = values.find((value) => value !== null && value !== undefined && value !== "");
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw.kind || raw.type || raw.scope || ""
    : String(raw || "").trim();
  const labels = {
    authorized_account_all_signals: "持续监听你的抖音账号新增评论、直播互动和账号互动通知",
    own_account_all_signals: "持续监听你的抖音账号新增评论、直播互动和账号互动通知",
    authorized_account_interactions: "从你的抖音账号互动通知中找",
    authorized_account_comments: "从你的抖音账号作品评论区中找",
    authorized_account_live: "从你的抖音账号直播间互动中找",
    own_account_comments: "从你的抖音账号作品评论区中找",
    own_works: "从你的抖音账号作品评论区中找",
    live_room: "从你的抖音账号直播间互动中找"
  };
  return labels[source] || source || "由 Agent 固定提供";
}

function taskConfigCandidates(source, metadata) {
  const input = source && typeof source === "object" ? source : {};
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const candidates = [];
  const visited = new Set();
  const envelopeKeys = [
    "configuration", "config", "taskConfig", "task_config", "acquisitionSnapshot", "taskSnapshot",
    "task", "resultSnapshot", "result_snapshot", "inputs", "data", "state"
  ];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || visited.has(value)) return;
    visited.add(value);
    candidates.push(value);
    if (depth >= 3) return;
    envelopeKeys.forEach((key) => visit(value[key], depth + 1));
  };
  visit(input);
  if (meta !== input) visit(meta);
  return candidates;
}

function isDiscoveryOnlyTaskConfig(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return taskConfigCandidates(input, metadata).some((candidate) => {
    if (candidate?.discoveryOnly === true) return true;
    const strategy = candidate?.findingStrategy || candidate?.finding_strategy || candidate?.strategy || candidate?.discovery || {};
    const scope = strategy?.sourceScope ?? strategy?.source_scope ?? candidate?.sourceScope ?? candidate?.source_scope;
    const kind = typeof scope === "object" && scope !== null
      ? String(scope.kind || scope.type || scope.scope || "").trim()
      : String(scope || "").trim();
    const authorizedListener = ["authorized_account_all_signals", "authorized_account_comments", "authorized_account_live", "authorized_account_interactions"].includes(kind);
    const hasOutreach = ["touchContent", "touch_content", "contentPolicy", "content_policy", "touchChannel", "touch_channel", "frequency", "caps", "stopConditions", "stop_conditions"]
      .some((key) => Object.prototype.hasOwnProperty.call(candidate, key));
    return authorizedListener && !hasOutreach;
  });
}

function taskConfigFrom(source = {}, { agentId = "" } = {}) {
  const input = source && typeof source === "object" ? source : {};
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const discoveryOnly = isDiscoveryOnlyTaskConfig(input);
  const raw = taskConfigCandidates(input, metadata).find((candidate) => [
    "findingStrategy", "finding_strategy", "strategy", "discovery", "sourceScope", "source_scope",
    "audienceRules", "audience_rules", "contentPolicy", "content_policy", "touchContent", "touch_content",
    "frequency", "runtimeRules", "runtime_rules", "stopConditions", "stop_conditions"
  ].some((key) => Object.prototype.hasOwnProperty.call(candidate, key))) || {};
  const strategy = raw.strategy || raw.discovery || raw.findingStrategy || raw.finding_strategy || {};
  const rawTouch = raw.touchContent ?? raw.touch_content ?? raw.touch ?? {};
  const touch = rawTouch && typeof rawTouch === "object" && !Array.isArray(rawTouch)
    ? rawTouch
    : { message: rawTouch };
  const runtime = raw.runtimeRules || raw.runtime_rules || raw.runtime || {};
  const rawStopConditions = runtime.stopConditions ?? runtime.stop_conditions
    ?? raw.stopConditions ?? raw.stop_conditions;
  // Older comprehensive tasks used the interaction-only scope before the
  // listener was expanded. A task with outreach policy is comprehensive even
  // when its persisted scope has not yet been migrated by the backend.
  const comprehensive = agentId === "mkt-comment-acquisition"
    || (!discoveryOnly && [raw.touchChannel, raw.touchContent, raw.contentPolicy, raw.approvalMode]
      .some((value) => value !== undefined));
  const sourceScope = comprehensive
    ? "authorized_account_all_signals"
    : strategy.sourceScope ?? strategy.source_scope ?? raw.sourceScope ?? raw.source_scope;
  const runtimeRules = discoveryOnly ? {} : {
    ...(comprehensive ? {} : {
      frequency: valueFrom(runtime.frequency, runtime.frequencyLabel, runtime.frequency_label, raw.frequency?.mode, raw.frequency?.label, raw.frequency?.interval, raw.frequencyLabel, raw.frequency_label, typeof raw.frequency === "string" ? raw.frequency : "")
    }),
    maxTouchesPerDay: runtime.maxTouchesPerDay ?? runtime.max_touches_per_day ?? raw.frequency?.maxTouchesPerDay ?? raw.frequency?.max_touches_per_day ?? raw.caps?.dailyMax ?? raw.caps?.daily_max ?? raw.maxTouchesPerDay ?? raw.max_touches_per_day ?? ACQUISITION_TASK_CONFIGURATION_DEFAULTS.maxTouchesPerDay,
    minIntervalMinutes: runtime.minIntervalMinutes ?? runtime.min_interval_minutes ?? raw.frequency?.minIntervalMinutes ?? raw.frequency?.min_interval_minutes ?? (Number(raw.caps?.sendIntervalMs ?? raw.caps?.send_interval_ms) > 0 ? Number(raw.caps.sendIntervalMs ?? raw.caps.send_interval_ms) / 60000 : raw.minIntervalMinutes ?? raw.min_interval_minutes ?? ACQUISITION_TASK_CONFIGURATION_DEFAULTS.minIntervalMinutes),
    stopConditions: stopConditionsLabel(rawStopConditions) || ACQUISITION_TASK_CONFIGURATION_DEFAULTS.stopConditions
  };
  if (comprehensive) delete runtimeRules.stopConditions;
  const persistedTouchChannel = valueFrom(touch.channel, touch.touchChannel, raw.touchChannel, raw.touch_channel);
  const privateTouchChannel = ["", "private_message", "private-message", "direct_message", "dm"].includes(
    String(persistedTouchChannel || "").trim().toLowerCase()
  );
  const displayTouchChannel = comprehensive
    ? (privateTouchChannel ? "private_message" : "public_reply")
    : persistedTouchChannel;
  return normalizeAcquisitionTaskUpdateDraft({
    strategy: {
      sourceScope: sourceScopeLabel(sourceScope),
      audienceGoal: valueFrom(strategy.audienceGoal, strategy.audience_goal, strategy.audienceRules?.goal, strategy.audience_rules?.goal, raw.audienceGoal, raw.audience_goal, raw.product, raw.audienceRules?.goal, raw.audience_rules?.goal),
      requirements: valueFrom(strategy.requirements, strategy.requirements_text, strategy.audienceRules?.requirements, strategy.audience_rules?.requirements, raw.requirements, raw.audienceRules?.requirements, raw.audience_rules?.requirements)
    },
    touchContent: discoveryOnly ? {} : {
      channel: displayTouchChannel,
      message: valueFrom(touch.strategy, touch.message, touch.text, raw.contentPolicy?.strategy, raw.contentPolicy?.template, raw.content_policy?.strategy, raw.content_policy?.template),
      strategy: valueFrom(touch.strategy, touch.message, touch.text, raw.contentPolicy?.strategy, raw.contentPolicy?.template, raw.content_policy?.strategy, raw.content_policy?.template),
      replyStyle: valueFrom(touch.replyStyle, touch.reply_style, raw.replyStyle, raw.reply_style, raw.contentPolicy?.replyStyle, raw.content_policy?.replyStyle) || ACQUISITION_TASK_CONFIGURATION_DEFAULTS.replyStyle,
      handoffBoundary: valueFrom(touch.handoffBoundary, touch.handoff_boundary, raw.handoffBoundary, raw.handoff_boundary, raw.transferBoundary, raw.transfer_boundary, raw.contentPolicy?.handoffBoundary, raw.content_policy?.handoff_boundary) || ACQUISITION_TASK_CONFIGURATION_DEFAULTS.handoffBoundary,
      approvalMode: valueFrom(touch.approvalMode, touch.approval_mode, raw.approvalMode, raw.approval_mode)
    },
    runtimeRules
  });
}

function stopConditionsLabel(value) {
  if (Array.isArray(value)) return value.map((entry) => textValue(entry)).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return textValue(value);
  const labels = [];
  if (value.stopOnReply || value.stop_on_reply) labels.push("用户回复后停止");
  if (value.stopOnOptOut || value.stop_on_opt_out) labels.push("用户明确拒绝或退订后停止");
  if (value.dailyCapReached || value.daily_cap_reached) labels.push("达到每日上限后停止");
  if (value.maxFailures || value.max_failures) labels.push(`连续失败${value.maxFailures ?? value.max_failures}次后停止`);
  if (value.onError) labels.push(`发生异常时${textValue(value.onError)}`);
  return labels.join("\n");
}

export function acquisitionTaskUpdateDraftFrom(source = {}) {
  return cloneTaskUpdateDraft(taskConfigFrom(source));
}

function cloneTaskUpdateDraft(draft = {}) {
  return JSON.parse(JSON.stringify(normalizeAcquisitionTaskUpdateDraft(draft)));
}

function taskUpdateHighImpact(current, next, { discoveryOnly = false } = {}) {
  if (discoveryOnly) return false;
  const currentChannel = String(current.touchContent?.channel || "").trim().toLowerCase();
  const nextChannel = String(next.touchContent?.channel || "").trim().toLowerCase();
  if (currentChannel !== nextChannel && nextChannel === "private_message") return true;
  const currentMode = current.touchContent?.approvalMode || "manual";
  if (next.touchContent?.approvalMode === "auto" && currentMode !== "auto") return true;
  const currentMax = Number(current.runtimeRules?.maxTouchesPerDay);
  const nextMax = Number(next.runtimeRules?.maxTouchesPerDay);
  if (Number.isFinite(currentMax) && Number.isFinite(nextMax) && nextMax > currentMax) return true;
  const currentInterval = Number(current.runtimeRules?.minIntervalMinutes);
  const nextInterval = Number(next.runtimeRules?.minIntervalMinutes);
  return Number.isFinite(currentInterval) && Number.isFinite(nextInterval) && nextInterval < currentInterval;
}

function taskUpdateInput(form, name) {
  return form.querySelector(`[name="${name}"]`);
}

function taskUpdateField(label, control) {
  const field = el("div", "sb-rw-task-update-field");
  field.append(el("label", null, label), control);
  return field;
}

function taskUpdateControl(tag, name, value, options = {}) {
  const control = el(tag, "");
  control.name = name;
  if (tag === "select") {
    for (const [optionValue, label] of options.options || []) {
      const option = el("option", null, label);
      option.value = optionValue;
      control.appendChild(option);
    }
  }
  if (value !== undefined && value !== null) control.value = String(value);
  if (options.placeholder) control.placeholder = options.placeholder;
  if (options.rows) control.rows = options.rows;
  return control;
}

function taskUpdateReadOnly(value, note = "") {
  const control = el("div", "sb-rw-task-update-readonly");
  control.appendChild(el("strong", null, value || "由 Agent 固定提供"));
  if (note) control.appendChild(el("small", null, note));
  return control;
}

function taskUpdateFixedValue(value, note, name, submittedValue) {
  const control = taskUpdateReadOnly(value, note);
  const input = el("input");
  input.type = "hidden";
  input.name = name;
  input.value = submittedValue;
  control.appendChild(input);
  return control;
}

function taskUpdateSummarySections(draft = {}, { discoveryOnly = false, comprehensive = false } = {}) {
  if (discoveryOnly) {
    return [
      {
        title: "找人",
        rows: [
          ["从哪里监听", draft.strategy?.sourceScope],
          ["想找的人", draft.strategy?.audienceGoal],
          ["额外要求", draft.strategy?.requirements]
        ]
      }
    ];
  }
  if (comprehensive) {
    return [
      {
        title: "后台识别",
        rows: [
          ["账号定位和服务对象", "根据账号主页、近期作品和新互动自动识别"],
          ["潜客判断", "结合评论、直播互动和账号互动证据判断"]
        ]
      },
      {
        title: "联系",
        rows: [
          ["怎么联系", "私信首触达"],
          ["首条内容", "根据用户具体互动证据自动生成"],
          ["说话方式", draft.touchContent?.replyStyle],
          ["哪些情况交给你", draft.touchContent?.handoffBoundary],
          ["发送方式", "自动发送"]
        ]
      },
      {
        title: "发送保护",
        rows: [
          ["每天最多联系", draft.runtimeRules?.maxTouchesPerDay ? `${draft.runtimeRules.maxTouchesPerDay} 位` : "不限制"],
          ["两次联系至少间隔", draft.runtimeRules?.minIntervalMinutes ? `${draft.runtimeRules.minIntervalMinutes} 分钟` : "不限制"],
          ["触达边界", "用户拒绝、退订或转人工时，仅停止该潜客的自动触达；账号持续监听"]
        ]
      }
    ];
  }
  return [
    {
      title: "找人",
      rows: [
        ["从哪里监听", draft.strategy?.sourceScope],
        ["想找的人", draft.strategy?.audienceGoal],
        ["额外要求", draft.strategy?.requirements]
      ]
    },
    {
      title: "联系",
      rows: [
        ["怎么联系", comprehensive && draft.touchContent?.channel === "public_reply"
          ? "旧公开回复（需改为私信首触达）"
          : (draft.touchContent?.channel === "comment_reply" ? "评论区回复" : "私信首触达")],
        ["第一句话怎么说", draft.touchContent?.strategy || draft.touchContent?.message],
        ["说话方式", draft.touchContent?.replyStyle],
        ["哪些情况交给你", draft.touchContent?.handoffBoundary],
        ["发送方式", draft.touchContent?.approvalMode === "auto" ? "自动发送" : draft.touchContent?.approvalMode === "batch" ? "批量确认后发送" : "确认后发送"]
      ]
    },
    {
      title: comprehensive ? "发送保护" : "运行规则",
      rows: [
        ["每天最多联系", draft.runtimeRules?.maxTouchesPerDay ? `${draft.runtimeRules.maxTouchesPerDay} 位` : "不限制"],
        ["两次联系至少间隔", draft.runtimeRules?.minIntervalMinutes ? `${draft.runtimeRules.minIntervalMinutes} 分钟` : "不限制"],
        ...(comprehensive
          ? [["触达边界", "用户拒绝、退订或转人工时，仅停止该潜客的自动触达；账号持续监听"]]
          : [["触发方式", draft.runtimeRules?.frequency], ["什么时候停止", draft.runtimeRules?.stopConditions]])
      ]
    }
  ];
}

function renderTaskUpdateSummary(container, draft, options = {}) {
  container.textContent = "";
  taskUpdateSummarySections(draft, options).forEach((section) => {
    const group = el("div", "sb-rw-task-update-summary-group");
    group.appendChild(el("h5", null, section.title));
    section.rows.forEach(([label, value]) => {
      const row = el("div", "sb-rw-task-update-summary-row");
      row.append(el("span", null, label), el("strong", null, String(value || "未设置")));
      group.appendChild(row);
    });
    container.appendChild(group);
  });
}

function taskUpdateFormDraft(form, baseDraft = {}, { discoveryOnly = false, comprehensive = false } = {}) {
  const base = cloneTaskUpdateDraft(baseDraft);
  if (discoveryOnly) {
    return {
      strategy: {
        sourceScope: base.strategy?.sourceScope,
        audienceGoal: taskUpdateInput(form, "strategy.audienceGoal")?.value,
        requirements: taskUpdateInput(form, "strategy.requirements")?.value
      }
    };
  }
  if (comprehensive) {
    return {
      strategy: {
        sourceScope: base.strategy?.sourceScope
      },
      touchContent: {
        channel: taskUpdateInput(form, "touchContent.channel")?.value,
        replyStyle: taskUpdateInput(form, "touchContent.replyStyle")?.value,
        handoffBoundary: taskUpdateInput(form, "touchContent.handoffBoundary")?.value,
        approvalMode: taskUpdateInput(form, "touchContent.approvalMode")?.value
      },
      runtimeRules: {
        maxTouchesPerDay: taskUpdateInput(form, "runtimeRules.maxTouchesPerDay")?.value,
        minIntervalMinutes: taskUpdateInput(form, "runtimeRules.minIntervalMinutes")?.value
      }
    };
  }
  return {
    strategy: {
      // Source scope is deliberately read-only in the form, so retain the
      // persisted task value when preparing the preview and update payload.
      sourceScope: base.strategy?.sourceScope,
      audienceGoal: taskUpdateInput(form, "strategy.audienceGoal")?.value,
      requirements: taskUpdateInput(form, "strategy.requirements")?.value
    },
    touchContent: {
      channel: taskUpdateInput(form, "touchContent.channel")?.value,
      message: taskUpdateInput(form, "touchContent.message")?.value,
      strategy: taskUpdateInput(form, "touchContent.strategy")?.value,
      replyStyle: taskUpdateInput(form, "touchContent.replyStyle")?.value,
      handoffBoundary: taskUpdateInput(form, "touchContent.handoffBoundary")?.value,
      approvalMode: taskUpdateInput(form, "touchContent.approvalMode")?.value
    },
    runtimeRules: {
      frequency: comprehensive ? undefined : taskUpdateInput(form, "runtimeRules.frequency")?.value,
      maxTouchesPerDay: taskUpdateInput(form, "runtimeRules.maxTouchesPerDay")?.value,
      minIntervalMinutes: taskUpdateInput(form, "runtimeRules.minIntervalMinutes")?.value,
      stopConditions: comprehensive ? undefined : taskUpdateInput(form, "runtimeRules.stopConditions")?.value
    }
  };
}

/**
 * Open the shared strategy-layer editor used by the member conversation and
 * realtime-work surfaces. Submission is intentionally future-only and sends a
 * single task.config.update command through the existing gateway.
 */
export function openAcquisitionTaskUpdateDialog({
  agentId,
  gateway = null,
  context = {},
  currentConfig = {},
  onSubmitted = null
} = {}) {
  if (typeof document === "undefined") return null;
  ensureStyle();
  const discoveryOnly = agentId === "mkt-find-people" && isDiscoveryOnlyTaskConfig(currentConfig);
  const comprehensive = agentId === "mkt-comment-acquisition";
  const current = taskConfigFrom(currentConfig, { agentId });
  const fixedAutoSend = !discoveryOnly && agentId === "mkt-comment-acquisition";
  if (fixedAutoSend) current.touchContent.approvalMode = "auto";
  const initial = cloneTaskUpdateDraft(current);
  const mask = el("div", "sb-rw-task-update-mask");
  const dialog = el("section", "sb-rw-task-update-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "sb-rw-task-update-title");
  const head = el("div", "sb-rw-task-update-head");
  const titleCopy = el("div");
  const title = el("h2", null, discoveryOnly ? "调整找客监听" : "调整当前任务");
  title.id = "sb-rw-task-update-title";
  titleCopy.append(title, el("p", null, discoveryOnly
    ? "只调整找人条件；修改仅对未来的新信号生效。"
    : comprehensive
      ? "账号定位、服务对象和首条私信由后台自动判断；这里只调整接待边界和发送保护。"
      : "只调整找人策略、触达策略和运行规则；修改仅对未来执行生效。"));
  const closeButton = el("button", "sb-rw-task-update-close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭任务调整");
  head.append(titleCopy, closeButton);
  dialog.appendChild(head);

  const body = el("div", "sb-rw-task-update-body");
  body.appendChild(el("div", "sb-rw-task-update-boundary", discoveryOnly
    ? "这次调整只会影响后续新产生的评论、直播互动和账号通知。已归档候选和原始证据不会改变。"
    : comprehensive
      ? "后台会持续使用授权账号资料和新互动证据识别服务对象；已经处理过的用户、发送记录和历史结果不会改变。"
      : "这次调整只会影响后续找到的人。已经处理过的用户、发送记录和历史结果不会改变。"));
  const form = el("form", "sb-rw-task-update-form");
  form.addEventListener("submit", (event) => event.preventDefault());
  const grid = el("div", "sb-rw-task-update-grid");

  const strategySection = el("section", "sb-rw-task-update-section");
  strategySection.appendChild(el("h3", null, comprehensive ? "后台自动识别" : "找什么样的人"));
  if (comprehensive) {
    strategySection.append(
      taskUpdateField("从哪里监听", taskUpdateReadOnly(initial.strategy.sourceScope, "持续接收新产生的互动，不回扫历史内容。")),
      taskUpdateField("账号定位和服务对象", taskUpdateReadOnly("根据账号资料和互动证据自动识别")),
      taskUpdateField("潜客判断", taskUpdateReadOnly("结合每条评论、直播互动和账号互动综合判断"))
    );
  } else {
    strategySection.append(
      taskUpdateField("从哪里监听", taskUpdateReadOnly(initial.strategy.sourceScope, "持续接收新产生的互动，不回扫历史内容。")),
      taskUpdateField("想找的人", taskUpdateControl("textarea", "strategy.audienceGoal", initial.strategy.audienceGoal, { rows: 2, placeholder: "例如：正在询问现车、价格或提车时间的人" })),
      taskUpdateField("额外要求", taskUpdateControl("textarea", "strategy.requirements", initial.strategy.requirements, { rows: 2, placeholder: "例如：只保留上海地区、明确表达购买需求的人" }))
    );
  }

  grid.appendChild(strategySection);
  if (!discoveryOnly) {
    const touchSection = el("section", "sb-rw-task-update-section");
    touchSection.appendChild(el("h3", null, "怎么联系"));
    const legacyPublicTouch = comprehensive && initial.touchContent.channel === "public_reply";
    touchSection.append(
      taskUpdateField("怎么联系", comprehensive
        ? taskUpdateFixedValue(
          "私信首触达",
          legacyPublicTouch
            ? "当前旧任务使用公开回复。确认改为私信首触达后才能继续运行。"
            : "获客专家只通过私信完成首次触达。",
          "touchContent.channel",
          "private_message"
        )
        : taskUpdateControl("select", "touchContent.channel", initial.touchContent.channel, { options: [["", "保持不变"], ["private_message", "私信联系"], ["comment_reply", "评论区回复"]] })),
      ...(comprehensive ? [] : [taskUpdateField("第一句话怎么说", taskUpdateControl("textarea", "touchContent.strategy", initial.touchContent.strategy || initial.touchContent.message, { rows: 3, placeholder: "例如：先回应具体留言，再确认需求，语气自然，不直接推销" }))]),
      taskUpdateField("说话方式", taskUpdateControl("input", "touchContent.replyStyle", initial.touchContent.replyStyle, { placeholder: "例如：专业、简短、自然" })),
      taskUpdateField("哪些情况交给你", taskUpdateControl("textarea", "touchContent.handoffBoundary", initial.touchContent.handoffBoundary, { rows: 2, placeholder: "例如：价格、退款、投诉和无法确认的信息交给人工" })),
      taskUpdateField("发送模式", fixedAutoSend
        ? taskUpdateControl("select", "touchContent.approvalMode", "auto", { options: [["auto", "自动发送"]] })
        : taskUpdateControl("select", "touchContent.approvalMode", initial.touchContent.approvalMode, { options: [["", "保持不变"], ["manual", "确认后发送"], ["batch", "批量确认后发送"], ["auto", "自动发送（需要确认）"]] }))
    );
    grid.appendChild(touchSection);
  }

  if (!discoveryOnly) {
    const runtimeSection = el("section", "sb-rw-task-update-section");
    runtimeSection.appendChild(el("h3", null, comprehensive ? "发送保护" : "运行规则"));
    runtimeSection.append(
      taskUpdateField("每天最多联系几位", taskUpdateControl("input", "runtimeRules.maxTouchesPerDay", initial.runtimeRules.maxTouchesPerDay, { placeholder: "不填则不限制" })),
      taskUpdateField("两次联系至少间隔多久", taskUpdateControl("input", "runtimeRules.minIntervalMinutes", initial.runtimeRules.minIntervalMinutes, { placeholder: "不填则不限制，单位：分钟" }))
    );
    if (comprehensive) {
      runtimeSection.appendChild(taskUpdateField("触达边界", taskUpdateReadOnly("用户拒绝、退订或转人工时，仅停止该潜客的自动触达。账号会持续监听新信号。")));
    } else {
      runtimeSection.append(
        taskUpdateField("触发方式", taskUpdateControl("input", "runtimeRules.frequency", initial.runtimeRules.frequency, { placeholder: "例如：发现合适的人后马上联系" })),
        taskUpdateField("什么时候停止", taskUpdateControl("textarea", "runtimeRules.stopConditions", initial.runtimeRules.stopConditions, { rows: 2, placeholder: "例如：用户明确拒绝、完成留资或遇到投诉" }))
      );
    }
    form.append(grid, runtimeSection);
  } else {
    form.appendChild(grid);
  }

  const preview = el("div", "sb-rw-task-update-preview");
  const before = el("section");
  const after = el("section");
  before.append(el("h4", null, "当前设置"));
  const beforeValue = el("div", "sb-rw-task-update-summary");
  renderTaskUpdateSummary(beforeValue, current, { discoveryOnly, comprehensive });
  before.appendChild(beforeValue);
  after.append(el("h4", null, "调整后预览"));
  const afterValue = el("div", "sb-rw-task-update-summary");
  after.appendChild(afterValue);
  preview.append(before, after);
  form.appendChild(preview);

  const impact = el("div", "sb-rw-task-update-impact");
  impact.textContent = "本次修改包含高影响策略：切换私信首触达、自动发送、扩大找人范围或放宽频率。提交前必须进行第二次确认。";
  if (!discoveryOnly) form.appendChild(impact);
  const confirm = el("label", "sb-rw-task-update-confirm");
  const confirmInput = el("input");
  confirmInput.type = "checkbox";
  confirm.append(confirmInput, el("span", null, "我确认高影响修改只作用于未来执行，不会触达已处理用户。"));
  if (!discoveryOnly) form.appendChild(confirm);
  const error = el("div", "sb-rw-task-update-error");
  form.appendChild(error);

  const footer = el("div", "sb-rw-task-update-footer");
  const cancel = el("button", null, "取消");
  cancel.type = "button";
  const submit = el("button", null, "确认修改");
  submit.type = "button";
  footer.append(cancel, submit);
  form.appendChild(footer);
  body.appendChild(form);
  dialog.appendChild(body);
  mask.appendChild(dialog);
  document.body.appendChild(mask);

  let secondStep = false;
  const close = () => mask.remove();
  const refreshPreview = () => {
    const next = cloneTaskUpdateDraft(taskUpdateFormDraft(form, initial, { discoveryOnly, comprehensive }));
    renderTaskUpdateSummary(afterValue, next, { discoveryOnly, comprehensive });
    const highImpact = taskUpdateHighImpact(current, next, { discoveryOnly });
    impact.classList.toggle("is-visible", highImpact);
    confirm.classList.toggle("is-visible", highImpact && secondStep);
    if (!highImpact) {
      secondStep = false;
      confirmInput.checked = false;
      submit.textContent = "确认修改";
    }
    return { next, highImpact };
  };
  refreshPreview();
  form.addEventListener("input", refreshPreview);
  form.addEventListener("change", refreshPreview);
  const submitUpdate = async (next, highImpact) => {
    if (!context.taskId) throw new Error("当前任务没有可更新的任务编号");
    let currentGateway = gateway;
    if (!currentGateway?.action) currentGateway = await globalThis.__SALEBUDDY__?.gatewayReady?.catch?.(() => null);
    if (!currentGateway?.action) throw new Error("控制面暂不可用，请稍后重试");
    if (!Number.isInteger(context.taskVersion) || context.taskVersion < 0) {
      throw new Error("当前任务版本不可用，请刷新实时工作后再调整");
    }
    const payload = acquisitionTaskUpdatePayload(agentId, context, next, {
      baseConfigVersion: currentConfig?.configuration?.version
        || currentConfig?.metadata?.configuration?.version
        || currentConfig?.acquisitionSnapshot?.configuration?.version
        || currentConfig?.metadata?.acquisitionSnapshot?.configuration?.version
        || currentConfig?.configVersion
        || currentConfig?.metadata?.configVersion
        || context.configVersion
        || 1,
      expectedVersion: context.taskVersion,
      confirmation: highImpact
    });
    const response = await currentGateway.action(ACQUISITION_TASK_UPDATE_ACTION, payload);
    onSubmitted?.({ payload, response });
  };
  submit.addEventListener("click", async () => {
    const { next, highImpact } = refreshPreview();
    if (highImpact && (!secondStep || !confirmInput.checked)) {
      secondStep = true;
      confirm.classList.add("is-visible");
      submit.textContent = "确认并提交高影响修改";
      error.classList.remove("is-visible");
      return;
    }
    submit.disabled = true;
    cancel.disabled = true;
    error.classList.remove("is-visible");
    try {
      await submitUpdate(next, highImpact);
      close();
    } catch (cause) {
      error.textContent = cause?.message || "任务调整未提交";
      error.classList.add("is-visible");
      submit.disabled = false;
      cancel.disabled = false;
    }
  });
  cancel.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  mask.addEventListener("mousedown", (event) => { if (event.target === mask) close(); });
  return { close, mask, form };
}

export function normalizeAcquisitionRealtimeMetadata(agentId, source = {}, progress = null) {
  const input = source && typeof source === "object" ? source : {};
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : input;
  if (!supportsAcquisitionRealtimeMetadata(agentId)) return { ...metadata };
  const rawTaskState = String(metadata.taskState || metadata.acquisitionTaskState || input.taskState || "configuring").toLowerCase();
  const normalized = normalizeAcquisitionTaskStatus(rawTaskState);
  const progressValue = progress ?? input.progress;
  return {
    taskId: metadata.taskId || metadata.task_id || input.taskId || null,
    taskRunId: metadata.taskRunId || metadata.task_run_id || input.taskRunId || null,
    accountId: metadata.accountId || metadata.account_id || input.accountId || null,
    cloudState: String(metadata.cloudState || metadata.cloud_state || input.cloudState || "").toLowerCase() || null,
    taskState: normalized?.taskState || rawTaskState,
    retryCount: Math.max(0, Number.isFinite(Number(metadata.retryCount ?? input.retryCount)) ? Math.floor(Number(metadata.retryCount ?? input.retryCount)) : 0),
    progressMode: metadata.progressMode === "provider" && metadata.progressSource === "provider" && Number.isFinite(Number(progressValue)) ? "provider" : "indeterminate",
    pendingApprovalCount: Math.max(0, Number.isFinite(Number(metadata.pendingApprovalCount ?? input.pendingApprovalCount)) ? Math.floor(Number(metadata.pendingApprovalCount ?? input.pendingApprovalCount)) : 0)
  };
}

export function acquisitionRealtimeViewModel(agentId, work = {}) {
  const metadata = normalizeAcquisitionRealtimeMetadata(agentId, work, work.progress);
  return {
    agentId: String(agentId || ""),
    ...metadata,
    phase: String(work.phase || "等待真实阶段").trim(),
    task: String(work.task || "等待真实任务").trim(),
    pendingApprovalCount: metadata.pendingApprovalCount,
    recentSignal: String(work.activities?.at(-1) || metadata.latestSignal || "等待真实工作动态").trim(),
    lastError: work.lastError || null
  };
}

export function acquisitionRealtimeActionPayload(agentId, action, work = {}) {
  const metadata = normalizeAcquisitionRealtimeMetadata(agentId, work, work.progress);
  return Object.fromEntries(Object.entries({ agentId, action, taskId: metadata.taskId, taskRunId: metadata.taskRunId, accountId: metadata.accountId })
    .filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

export function realtimeTaskControlPayload(agentId, action, work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const base = acquisitionRealtimeActionPayload(agentId, action, work);
  return Object.fromEntries(Object.entries({
    ...base,
    agentId,
    action,
    taskId: base.taskId || work.taskId || metadata.taskId || metadata.task_id || null,
    taskRunId: base.taskRunId || work.taskRunId || metadata.taskRunId || metadata.task_run_id || null,
    accountId: base.accountId || work.accountId || metadata.accountId || metadata.account_id || null
  }).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

export function liveAgentsForWorks(agents = [], works = []) {
  const liveIds = [...new Set((Array.isArray(works) ? works : [])
    .filter((work) => work?.projectId !== "demo-office" && work?.metadata?.simulated !== true)
    .map((work) => work?.agentType)
    .filter(Boolean))];
  const agentsById = new Map((Array.isArray(agents) ? agents : []).map((agent) => [agent?.id, agent]));
  return liveIds.map((agentId) => agentsById.get(agentId)).filter(Boolean);
}

export function partitionRealtimeWorks(works = []) {
  const entries = Array.isArray(works) ? works : [];
  const completed = entries.filter((work) => work?.state === "done"
    || ["completed", "succeeded"].includes(String(work?.metadata?.taskState || work?.metadata?.acquisitionTaskState || "").toLowerCase()));
  return {
    active: entries.filter((work) => !completed.includes(work) && !work?.lastError),
    attention: entries.filter((work) => Boolean(work?.lastError)),
    completed: completed.filter((work) => !work?.lastError)
  };
}

const REMOTE_REALTIME_WORK_STATES = new Set(["working", "listening", "attention"]);

export function officeStatusWorksToRealtimeWorks(works = [], accounts = []) {
  return (Array.isArray(works) ? works : [])
    .filter((work) => REMOTE_REALTIME_WORK_STATES.has(String(work?.state || work?.metadata?.officeStatus || "").toLowerCase()))
    .map((work) => {
      const officeState = String(work.state || work.metadata?.officeStatus || "working").toLowerCase();
      const sourceMetadata = work.metadata && typeof work.metadata === "object" ? work.metadata : {};
      const accountReference = String(sourceMetadata.accountId || sourceMetadata.account_id || "").trim();
      const referencedAgentId = accountReference.startsWith("douyin-agent:") ? accountReference.slice("douyin-agent:".length) : accountReference;
      const managedAccount = (Array.isArray(accounts) ? accounts : []).find((account) => account?.id === accountReference
        || account?.agentId === referencedAgentId
        || account?.agentIds?.includes?.(referencedAgentId));
      const attention = officeState === "attention";
      const lastError = work.lastError || (attention
        ? sourceMetadata.error || sourceMetadata.resumeBlocked || { code: "OFFICE_STATUS_ATTENTION", message: "任务需要处理" }
        : null);
      return {
        ...work,
        state: "working",
        lastError,
        metadata: {
          ...sourceMetadata,
          officeStatus: officeState,
          taskState: officeState === "listening" || officeState === "working" ? "running" : officeState,
          ...(managedAccount ? {
            accountLabel: managedAccount.name,
            accountIdentity: managedAccount.identity,
            accountKey: douyinAccountWorkKey(managedAccount.identity, managedAccount.id)
          } : {})
        }
      };
    });
}

function realtimeWorkKey(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const taskId = String(metadata.taskId || metadata.task_id || "").trim();
  const taskRunId = String(metadata.taskRunId || metadata.task_run_id || "").trim();
  const accountId = String(metadata.accountId || metadata.account_id || metadata.accountKey || "").trim();
  return [String(work?.agentType || "").trim(), taskId, taskRunId, accountId].join("|");
}

export function mergeRealtimeWorkSources(localWorks = [], remoteWorks = []) {
  const merged = new Map();
  for (const work of [...(Array.isArray(localWorks) ? localWorks : []), ...(Array.isArray(remoteWorks) ? remoteWorks : [])]) {
    if (!work?.agentType) continue;
    const key = realtimeWorkKey(work);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...work, metadata: { ...(work.metadata || {}) }, activities: [...(work.activities || [])] });
      continue;
    }
    const activities = [...new Set([...(previous.activities || []), ...(work.activities || [])])];
    merged.set(key, {
      ...previous,
      ...work,
      metadata: { ...(previous.metadata || {}), ...(work.metadata || {}) },
      activities,
      lastError: work.lastError || previous.lastError || null
    });
  }
  return [...merged.values()];
}

function realtimeWorkAccountId(work = {}) {
  const metadata = work?.metadata || {};
  const explicitKey = String(metadata.accountKey || "").trim();
  if (explicitKey) return explicitKey;
  const identityKey = douyinAccountWorkKey(metadata.accountIdentity, "");
  return identityKey || String(metadata.accountId || "").trim();
}

export function visibleRealtimeWorks(works = [], { selectedAgentId = null, taskId = null, taskRunId = null, accountId = null, accountKey = null } = {}) {
  const selectedId = String(selectedAgentId || "").trim();
  if (selectedId && !isRealtimeWorkAgent(selectedId)) return [];
  const entries = (Array.isArray(works) ? works : [])
    .filter((work) => isRealtimeWorkAgent(work?.agentType));
  const selectedTaskId = String(taskId || "").trim();
  const selectedRunId = String(taskRunId || "").trim();
  const selectedAccountId = String(accountId || "").trim();
  const selectedAccountKey = String(accountKey || "").trim();
  const requested = entries.find((work) => (!selectedId || work?.agentType === selectedId)
    && (!selectedTaskId || work?.metadata?.taskId === selectedTaskId)
    && (!selectedRunId || work?.metadata?.taskRunId === selectedRunId));

  if (selectedAccountId) {
    const requestedAccountKey = realtimeWorkAccountId(requested);
    const accountWorks = entries.filter((work) => realtimeWorkAccountId(work) === selectedAccountId
      || (selectedAccountKey && realtimeWorkAccountId(work) === selectedAccountKey)
      || (requestedAccountKey && realtimeWorkAccountId(work) === requestedAccountKey));
    if (accountWorks.length) return accountWorks;
    return requested ? [requested] : [];
  }

  if (requested && !realtimeWorkAccountId(requested)) {
    return entries.filter((work) => !realtimeWorkAccountId(work));
  }

  return entries;
}

function avatar(container, agent) {
  container.textContent = agent.name.slice(0, 1);
  mountGrokBotAvatar(container, agent.id, {
    alt: `${agent.name}头像`,
    state: grokStateForTeamStatus({ state: agent.status }),
    trackPointer: false,
    mode: "realtime-work"
  });
}

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function openProspectResults() {
  globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openProspects?.());
}

export function normalizeRealtimeOutputContext(context = {}) {
  const input = context && typeof context === "object" ? context : {};
  return {
    ...input,
    prospect: typeof input.prospect === "string" && input.prospect.trim() ? input.prospect : "当前任务",
    source: typeof input.source === "string" && input.source.trim() ? input.source : "实时工作流",
    score: input.score == null || input.score === "" ? "--" : String(input.score),
    activity: typeof input.activity === "string" && input.activity.trim() ? input.activity : "等待数据"
  };
}

function inboxText(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : "";
}

function inboxConversationKey(item = {}) {
  return inboxText(
    item.conversationId,
    item.conversation_id,
    item.recipient?.conversationId,
    item.recipient?.conversation_id,
    item.secUid,
    item.sec_uid,
    item.recipient?.secUid,
    item.recipient?.sec_uid,
    item.nickname,
    item.messageId,
    item.id
  );
}

function inboxTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function inboxStatusLabel(status) {
  const labels = {
    sent: "已自动回复",
    handoff: "已转人工接管",
    pending: "已转人工接管",
    pending_approval: "已转人工接管",
    generated: "回复已生成",
    failed: "回复失败",
    error: "回复失败",
    skipped: "已转人工",
    received: "待处理"
  };
  return labels[String(status || "").toLowerCase()] || "处理中";
}

export function inboxRealtimeRows(work = {}) {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const messages = Array.isArray(metadata.inboxMessages) ? metadata.inboxMessages : [];
  const drafts = Array.isArray(metadata.inboxDrafts) ? metadata.inboxDrafts : [];
  const groups = new Map();

  for (const message of messages) {
    const id = inboxConversationKey(message);
    if (!id) continue;
    const current = groups.get(id) || { messages: [], drafts: [] };
    current.messages.push(message);
    groups.set(id, current);
  }
  for (const draft of drafts) {
    const id = inboxConversationKey(draft);
    if (!id) continue;
    const current = groups.get(id) || { messages: [], drafts: [] };
    current.drafts.push(draft);
    groups.set(id, current);
  }

  return [...groups.entries()].map(([id, group]) => {
    const latestMessage = [...group.messages].sort((a, b) => inboxTimestamp(b.receivedAt || b.createdAt) - inboxTimestamp(a.receivedAt || a.createdAt))[0] || null;
    const matchingDrafts = latestMessage
      ? group.drafts.filter((draft) => inboxText(draft.messageId) === inboxText(latestMessage.messageId, latestMessage.id))
      : [];
    const latestDraft = [...(matchingDrafts.length ? matchingDrafts : group.drafts)].sort((a, b) => inboxTimestamp(b.sentAt || b.createdAt) - inboxTimestamp(a.sentAt || a.createdAt))[0] || null;
    const status = inboxText(latestMessage?.status, latestDraft?.status) || "received";
    return {
      id,
      nickname: inboxText(latestMessage?.nickname, latestMessage?.sender?.nickname, latestDraft?.nickname, latestDraft?.recipient?.nickname) || "未命名用户",
      latestMessage: inboxText(latestMessage?.content, latestDraft?.incomingContent),
      replyContent: inboxText(latestMessage?.replyContent, latestMessage?.reply_content, latestDraft?.content),
      status,
      statusLabel: inboxStatusLabel(status),
      timestamp: inboxText(latestDraft?.sentAt, latestDraft?.createdAt, latestMessage?.receivedAt, latestMessage?.createdAt),
      messageCount: group.messages.length
    };
  }).sort((a, b) => inboxTimestamp(b.timestamp) - inboxTimestamp(a.timestamp));
}

export function inboxRealtimeMetrics(work = {}) {
  const rows = inboxRealtimeRows(work);
  const runtime = work?.metadata?.runtime && typeof work.metadata.runtime === "object" ? work.metadata.runtime : {};
  const captured = Number(work?.metadata?.leadCapturedCount || runtime.capturedCount || 0);
  const entered = rows.length;
  const replied = Math.max(Number(runtime.sentCount || 0), rows.filter((row) => row.replyContent).length);
  return {
    entered,
    replied,
    replyRate: entered ? Math.round((replied / entered) * 100) : 0,
    captured: Math.max(0, captured),
    captureRate: replied ? Math.round((captured / replied) * 100) : 0
  };
}

export function inboxConversationTimeline(work = {}, conversationId = "") {
  const metadata = work?.metadata && typeof work.metadata === "object" ? work.metadata : {};
  const messages = Array.isArray(metadata.inboxMessages) ? metadata.inboxMessages : [];
  const drafts = Array.isArray(metadata.inboxDrafts) ? metadata.inboxDrafts : [];
  const target = String(conversationId || "").trim();
  const timeline = [];
  const seenReplies = new Set();
  const matches = (item) => !target || inboxConversationKey(item) === target;

  messages.filter(matches).forEach((message) => {
    const messageId = inboxText(message.messageId, message.message_id, message.id);
    const receivedAt = inboxText(message.receivedAt, message.received_at, message.createdAt, message.created_at);
    const incoming = inboxText(message.content, message.text);
    if (incoming) timeline.push({ direction: "in", content: incoming, timestamp: receivedAt, status: message.status || "received" });
    const reply = inboxText(message.replyContent, message.reply_content);
    if (reply) {
      const replyKey = `${messageId}|${reply}`;
      seenReplies.add(replyKey);
      timeline.push({ direction: "out", content: reply, timestamp: inboxText(message.repliedAt, message.replied_at, message.sentAt, receivedAt), status: message.status || "sent" });
    }
  });
  drafts.filter(matches).forEach((draft) => {
    const content = inboxText(draft.content, draft.replyContent, draft.reply_content);
    if (!content) return;
    const messageId = inboxText(draft.messageId, draft.message_id, draft.id);
    const replyKey = `${messageId}|${content}`;
    if (seenReplies.has(replyKey)) return;
    timeline.push({ direction: "out", content, timestamp: inboxText(draft.sentAt, draft.sent_at, draft.createdAt, draft.created_at), status: draft.status || "generated" });
  });
  return timeline.sort((a, b) => inboxTimestamp(a.timestamp) - inboxTimestamp(b.timestamp));
}

function inboxTimeLabel(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function acquisitionObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function acquisitionArray(value) {
  return Array.isArray(value) ? value : [];
}

function acquisitionNumber(...values) {
  const value = values.find((item) => item !== null && item !== undefined && item !== "" && Number.isFinite(Number(item)));
  return value === undefined ? 0 : Math.max(0, Number(value));
}

function acquisitionText(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : "";
}

function acquisitionLeadKey(value = {}) {
  const lead = acquisitionObject(value.lead);
  const recipient = acquisitionObject(value.recipient);
  return acquisitionText(
    value.leadId, value.lead_id, value.id, value.secUid, value.sec_uid, value.secId, value.sec_id, value.uid, value.userId, value.user_id,
    lead.leadId, lead.lead_id, lead.id, lead.secUid, lead.sec_uid, lead.secId, lead.sec_id, lead.uid,
    recipient.leadId, recipient.id, recipient.secUid, recipient.sec_uid, recipient.secId, recipient.sec_id,
    value.nickname, lead.nickname, recipient.nickname
  );
}

function acquisitionSnapshotFor(work = {}) {
  const metadata = acquisitionObject(work.metadata);
  const snapshot = acquisitionObject(metadata.acquisitionSnapshot || metadata.taskSnapshot);
  if (Object.keys(snapshot).length) return snapshot;
  const resultSnapshot = acquisitionObject(metadata.resultSnapshot);
  return Object.keys(resultSnapshot).length ? { resultSnapshot } : {};
}

function acquisitionAvatarSource(...values) {
  for (const value of values) {
    const source = acquisitionObject(value);
    const avatar = [
      source.avatarUrl, source.avatar_url, source.avatar, source.avatarThumb, source.avatar_thumb,
      source.avatarLarger, source.avatar_larger, source.user?.avatar, source.user?.avatarUrl,
      source.identity?.avatar, source.identity?.avatarUrl
    ].map(avatarUrlFromValue).find(Boolean);
    if (avatar) return avatar;
  }
  return "";
}

function acquisitionSourceLabel(...values) {
  const sources = values.map(acquisitionObject);
  const source = sources.find((item) => Object.keys(item).length) || {};
  const raw = acquisitionText(
    source.sourceLabel, source.source_label,
    ...values.flatMap((item) => [
      typeof item?.source === "string" ? item.source : "",
      typeof item?.origin === "string" ? item.origin : ""
    ]),
    ...sources.flatMap((item) => [item.type, item.kind, item.channel, item.scope]),
    ...values.flatMap((item) => [item?.sourceLabel, item?.source_label, item?.sourceType, item?.source_type])
  ).toLowerCase();
  if (/live|danmaku|chat|直播|弹幕/.test(raw)) return "直播间";
  if (/follow|like|notification|interaction|互动|关注|点赞/.test(raw)) return "互动";
  if (/comment|review|作品|评论/.test(raw)) return "评论区";
  return "来源待确认";
}

function acquisitionEvidenceQuote(lead = {}) {
  const evidence = acquisitionArray(lead.evidence);
  const latest = evidence.at(-1) || {};
  return acquisitionText(
    lead.text, lead.comment, lead.content, lead.quote,
    latest.quote, latest.text, latest.content, latest.message
  );
}

function acquisitionDetailFieldText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const text = value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).join("、");
      if (text) return text;
    }
    if (value && typeof value === "object") {
      const text = acquisitionText(value.text, value.content, value.value, value.label, value.description);
      if (text) return text;
    }
  }
  return "";
}

const ACQUISITION_LEGACY_TRAIT_LABELS = Object.freeze({
  followedBrands: "关注品牌",
  followed_brands: "关注品牌",
  followingBrands: "关注品牌",
  following_brands: "关注品牌",
  vehiclePreference: "偏好",
  vehicle_preference: "偏好",
  modelPreference: "偏好",
  model_preference: "偏好",
  vehicleModel: "偏好",
  vehicle_model: "偏好",
  purchaseHistory: "历史询价",
  purchase_history: "历史询价",
  inquiryHistory: "历史询价",
  inquiry_history: "历史询价",
  priceInquiry: "历史询价",
  price_inquiry: "历史询价"
});

function acquisitionFactHasValue(value) {
  const text = acquisitionDetailFieldText(value);
  return Boolean(text) && !/^(?:暂未|暂无|尚未|未发现(?:明确)?|无法确认|无法判断|待补充|数据不足|来源待确认|无可见)/.test(text);
}

function acquisitionTraitLabel(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return "";
  if (ACQUISITION_LEGACY_TRAIT_LABELS[normalized]) return ACQUISITION_LEGACY_TRAIT_LABELS[normalized];
  return normalized.replace(/[_-]+/g, " ").trim();
}

function acquisitionTraitValue(value) {
  return acquisitionDetailFieldText(value?.value, value?.result, value?.conclusion, value?.text, value?.content, value?.description, value);
}

function acquisitionDynamicTraitEntries(...sources) {
  const entries = [];
  const seen = new Set();
  const add = (label, value) => {
    const normalizedLabel = acquisitionTraitLabel(label);
    const normalizedValue = acquisitionTraitValue(value);
    if (!normalizedLabel || !acquisitionFactHasValue(normalizedValue)) return;
    const key = `${normalizedLabel}\u0000${normalizedValue}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push([normalizedLabel, normalizedValue]);
  };
  const visit = (value, fallbackLabel = "") => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, fallbackLabel));
      return;
    }
    if (value && typeof value === "object") {
      const explicitLabel = acquisitionText(value.label, value.name, value.attribute, value.key, fallbackLabel);
      const explicitValue = acquisitionTraitValue(value);
      if (explicitLabel && explicitValue && explicitValue !== "[object Object]") {
        add(explicitLabel, value);
        return;
      }
      Object.entries(value).forEach(([key, item]) => {
        if (["source", "provider", "model", "generatedAt", "observedAt", "evidence", "basis", "support"].includes(key)) return;
        visit(item, key);
      });
      return;
    }
    if (fallbackLabel) add(fallbackLabel, value);
  };
  const dynamicKeys = [
    "profileTraits", "profile_traits", "userTraits", "user_traits", "analysisTraits", "analysis_traits",
    "traits", "attributes", "analysisAttributes", "analysis_attributes", "profileAttributes", "profile_attributes",
    "dynamicTraits", "dynamic_traits", "insights", "userInsights", "user_insights"
  ];
  sources.forEach((source) => {
    if (!source || typeof source !== "object") return;
    dynamicKeys.forEach((key) => visit(source[key]));
    [
      "followedBrands", "followed_brands", "followingBrands", "following_brands",
      "vehiclePreference", "vehicle_preference", "modelPreference", "model_preference", "vehicleModel", "vehicle_model",
      "purchaseHistory", "purchase_history", "inquiryHistory", "inquiry_history", "priceInquiry", "price_inquiry"
    ].forEach((key) => visit(source[key], key));
  });
  return entries;
}

function acquisitionProfileEvidence(lead = {}) {
  const profile = acquisitionObject(lead.profile || lead.profileEvidence || lead.profile_evidence || lead.accountProfile || lead.account_profile || lead.userProfile || lead.user_profile);
  const facts = acquisitionObject(lead.facts || lead.prospectFacts || lead.profileFacts || profile.facts || profile.profileFacts);
  const behavior = acquisitionObject(lead.behavior || lead.activity || profile.behavior || profile.activity);
  const factText = (...keys) => acquisitionDetailFieldText(...keys.flatMap((key) => [facts[key], facts[key]?.value]));
  return {
    recentComment: acquisitionDetailFieldText(factText("recentComment"), lead.recentComment, lead.recent_comment, lead.latestComment, lead.latest_comment, lead.comment, acquisitionEvidenceQuote(lead)),
    activeBehavior: acquisitionDetailFieldText(factText("activeBehavior"), lead.activeBehavior, lead.active_behavior, lead.recentBehavior, lead.recent_behavior, behavior.summary, behavior.text, profile.activeBehavior, profile.active_behavior),
    followedBrands: acquisitionDetailFieldText(factText("followedBrands"), lead.followedBrands, lead.followed_brands, lead.followingBrands, lead.following_brands, profile.followedBrands, profile.followed_brands, profile.brands, lead.brands),
    vehiclePreference: acquisitionDetailFieldText(factText("vehiclePreference"), lead.vehiclePreference, lead.vehicle_preference, lead.modelPreference, lead.model_preference, profile.vehiclePreference, profile.vehicle_preference, profile.modelPreference, profile.model_preference, lead.vehicleModel, lead.vehicle_model),
    cityRelation: acquisitionDetailFieldText(factText("cityRelation"), lead.cityRelation, lead.city_relation, lead.locationRelation, lead.location_relation, profile.cityRelation, profile.city_relation, profile.location, lead.city, lead.region),
    storeConversation: acquisitionDetailFieldText(factText("storeConversation"), lead.storeConversation, lead.store_conversation, lead.storeDialogue, lead.store_dialogue, lead.conversationEvidence, lead.conversation_evidence, lead.incomingContent, lead.incoming_content, profile.storeConversation, profile.store_conversation, lead.storeChat, lead.store_chat),
    purchaseHistory: acquisitionDetailFieldText(factText("purchaseHistory"), lead.purchaseHistory, lead.purchase_history, lead.inquiryHistory, lead.inquiry_history, profile.purchaseHistory, profile.purchase_history, lead.priceInquiry, lead.price_inquiry),
    dynamicTraits: acquisitionDynamicTraitEntries(lead, profile, facts, lead.analysis, lead.intent)
  };
}

function acquisitionSourceReference(...values) {
  return acquisitionText(...values.flatMap((value) => {
    const source = acquisitionObject(value);
    return [
      source.sourceReference, source.source_reference, source.reference, source.referenceLabel, source.reference_label,
      source.commentId, source.comment_id, source.eventId, source.event_id,
      value?.sourceReference, value?.source_reference, value?.reference, value?.referenceLabel, value?.reference_label
    ];
  }));
}

function mergeAcquisitionLead(previous = {}, next = {}) {
  const merged = { ...acquisitionObject(previous) };
  for (const [field, value] of Object.entries(acquisitionObject(next))) {
    if (value === null || value === undefined || (typeof value === "string" && !value.trim())) continue;
    const previousValue = merged[field];
    if (value && typeof value === "object" && !Array.isArray(value) && previousValue && typeof previousValue === "object" && !Array.isArray(previousValue)) {
      merged[field] = { ...previousValue, ...value };
    } else if (Array.isArray(value) && Array.isArray(previousValue)) {
      merged[field] = [...previousValue, ...value].filter((item, index, items) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);
    } else {
      merged[field] = value;
    }
  }
  return merged;
}

function acquisitionWorkEntries(snapshot = {}, result = {}, lastScan = {}) {
  const source = acquisitionObject(lastScan.source);
  const entries = [
    ...acquisitionArray(snapshot.works),
    ...acquisitionArray(snapshot.videos),
    ...acquisitionArray(result.works),
    ...acquisitionArray(result.videos),
    ...acquisitionArray(lastScan.works),
    ...acquisitionArray(lastScan.videos),
    ...acquisitionArray(source.works),
    ...acquisitionArray(source.videos)
  ];
  const seen = new Set();
  return entries.filter((entry) => {
    const key = acquisitionText(entry?.id, entry?.workId, entry?.work_id, entry?.videoId, entry?.video_id, entry?.url, entry?.title, entry?.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((entry) => ({
    id: acquisitionText(entry.id, entry.workId, entry.work_id, entry.videoId, entry.video_id, entry.url, entry.title),
    title: acquisitionText(entry.title, entry.name, entry.desc, entry.description, "未命名作品"),
    url: acquisitionText(entry.url, entry.shareUrl, entry.share_url)
  }));
}

export function commentAcquisitionRealtimeView(work = {}) {
  const snapshot = acquisitionSnapshotFor(work);
  const result = acquisitionObject(snapshot.resultSnapshot || snapshot.snapshot);
  const lastScan = acquisitionObject(snapshot.lastScan || result.lastScan);
  const counters = acquisitionObject(snapshot.counters);
  const queue = acquisitionArray(snapshot.approvalQueue);
  const replies = acquisitionArray(snapshot.replies);
  const resultLeads = acquisitionArray(result.leads || result.candidates || snapshot.leads || snapshot.candidates);
  const leadMap = new Map();
  [
    ...resultLeads,
    ...Object.values(acquisitionObject(snapshot.candidateProfiles)),
    ...queue.map((touch) => touch?.lead).filter(Boolean),
    ...replies
  ].forEach((lead) => {
    const key = acquisitionLeadKey(lead);
    if (!key) return;
    leadMap.set(key, mergeAcquisitionLead(leadMap.get(key), lead));
  });
  const works = acquisitionWorkEntries(snapshot, result, lastScan);
  const touchedStates = new Set(["sent", "delivered", "succeeded", "completed"]);
  const touchedCount = queue.filter((touch) => touchedStates.has(acquisitionText(touch?.state, touch?.status, touch?.receipt?.state).toLowerCase())).length;
  const people = [...leadMap.entries()].map(([id, lead]) => {
    const touch = queue.find((item) => acquisitionLeadKey(item) === id) || {};
    const source = acquisitionObject(lead.source);
    const evidence = acquisitionArray(lead.evidence);
    const latestEvidence = evidence.at(-1) || {};
    const intent = acquisitionObject(lead.intent);
    return {
      id,
      nickname: acquisitionText(lead.nickname, lead.name, lead.user?.nickname, "未命名用户"),
      avatar: acquisitionAvatarSource(lead, touch.lead),
      quote: acquisitionEvidenceQuote(lead),
      reason: acquisitionText(lead.reason, lead.matchReason, lead.match_reason, intent.reason, intent.explanation, lead.analysis?.reason),
      workTitle: acquisitionText(source.workTitle, source.work_title, source.videoTitle, source.video_title, source.title, lead.workTitle, lead.videoTitle),
      sourceLabel: acquisitionSourceLabel(source, lead, touch),
      sourceReference: acquisitionSourceReference(source, lead, latestEvidence),
      profileEvidence: acquisitionProfileEvidence(lead),
      facts: acquisitionObject(lead.facts || lead.prospectFacts || lead.profileFacts),
      factAvailability: acquisitionObject(lead.factAvailability),
      enrichment: acquisitionObject(lead.enrichment),
      intentTier: acquisitionText(intent.tier, lead.tier, intent.level, lead.intentLevel).toLowerCase(),
      intentScore: acquisitionNumber(intent.score, lead.score, lead.intentScore),
      intentSignals: Array.isArray(intent.signals) ? intent.signals.filter((item) => typeof item === "string" && item.trim()).slice(0, 8) : [],
      intentConfidence: acquisitionNumber(intent.confidence, lead.confidence),
      leadCapture: acquisitionObject(lead.leadCapture || lead.lead_capture || lead.capture || lead.contact || lead.contactInfo || lead.contact_info),
      leadCaptureStatus: acquisitionText(lead.leadCaptureStatus, lead.lead_capture_status, lead.captureStatus, lead.capture_status),
      sourceUrl: acquisitionText(
        source.videoUrl, source.video_url, source.url, source.shareUrl, source.share_url,
        latestEvidence.sourceUrl, latestEvidence.source_url,
        lead.url, lead.shareUrl, lead.share_url
      ),
      sourceObservedAt: acquisitionText(source.observedAt, source.observed_at, latestEvidence.observedAt, latestEvidence.observed_at, lead.observedAt, lead.observed_at),
      touchContent: acquisitionText(touch.content, touch.message, touch.outreachContent),
      touchState: acquisitionText(touch.state, touch.status, touch.receipt?.state),
      timestamp: acquisitionText(touch.receipt?.sentAt, touch.sentAt, touch.updatedAt, lead.observedAt, source.observedAt)
    };
  });
  return {
    counts: {
      works: acquisitionNumber(counters.works, counters.videos, counters.scannedWorks, works.length),
      comments: acquisitionNumber(lastScan.notifications, lastScan.counts?.notifications, lastScan.counts?.normalized, counters.comments),
      prospects: acquisitionNumber(counters.candidates, result.counts?.candidates, result.counts?.matched, people.length),
      touched: acquisitionNumber(counters.delivered, counters.sent, touchedCount),
      replies: acquisitionNumber(counters.replies, replies.length),
      captured: acquisitionNumber(counters.captured, counters.capturedLeads, counters.leadsCaptured, result.counts?.captured),
      converted: acquisitionNumber(counters.converted, counters.conversions, counters.completedLeads, result.counts?.converted)
    },
    captured: acquisitionNumber(counters.captured, counters.capturedLeads, counters.leadsCaptured, result.counts?.captured),
    converted: acquisitionNumber(counters.converted, counters.conversions, counters.completedLeads, result.counts?.converted),
    works,
    people,
    latestActivity: acquisitionText(work.activities?.at?.(-1), snapshot.events?.at?.(-1)?.message, snapshot.events?.at?.(-1)?.description),
    hasSnapshot: Boolean(Object.keys(snapshot).length)
  };
}

function acquisitionConversationStatus({ incomingContent, replyContent, touchContent, rawStatus }) {
  if (incomingContent && replyContent) return ["replied", "已自动续聊"];
  if (incomingContent) return ["received", "已收到回复"];
  if (["failed", "error"].includes(rawStatus)) return ["failed", "触达失败"];
  if (touchContent) return ["waiting", "等待对方回复"];
  return ["listening", "持续监听中"];
}

export function commentAcquisitionConversationRows(work = {}) {
  const snapshot = acquisitionSnapshotFor(work);
  const queue = acquisitionArray(snapshot.approvalQueue);
  const replies = acquisitionArray(snapshot.replies);
  const groups = new Map();
  queue.forEach((touch) => {
    const id = acquisitionLeadKey(touch);
    if (!id) return;
    groups.set(id, { ...(groups.get(id) || {}), touch, lead: acquisitionObject(touch.lead) });
  });
  replies.forEach((reply) => {
    const id = acquisitionLeadKey(reply);
    if (!id) return;
    groups.set(id, { ...(groups.get(id) || {}), reply, lead: { ...acquisitionObject(groups.get(id)?.lead), ...acquisitionObject(reply.lead) } });
  });
  return [...groups.entries()].map(([id, group]) => {
    const touch = acquisitionObject(group.touch);
    const reply = acquisitionObject(group.reply);
    const lead = acquisitionObject(group.lead);
    const incomingContent = acquisitionText(reply.content, reply.message, reply.incomingContent, reply.incoming_content, reply.text);
    const replyContent = acquisitionText(reply.replyContent, reply.reply_content, reply.autoReply, reply.auto_reply, reply.response?.content, reply.draft?.content);
    const touchContent = acquisitionText(touch.content, touch.message, touch.outreachContent);
    const leadCapture = acquisitionObject(reply.leadCapture || reply.lead_capture || reply.capture || reply.contact || reply.contactInfo || reply.contact_info || lead.leadCapture || lead.lead_capture || lead.capture || lead.contact || lead.contactInfo || lead.contact_info);
    const rawStatus = acquisitionText(reply.status, touch.state, touch.status).toLowerCase();
    const [status, statusLabel] = acquisitionConversationStatus({ incomingContent, replyContent, touchContent, rawStatus });
    const leadCaptureStatus = acquisitionText(
      reply.leadCaptureStatus,
      reply.lead_capture_status,
      reply.captureStatus,
      reply.capture_status,
      lead.leadCaptureStatus,
      lead.lead_capture_status
    );
    const leadCaptureQuote = acquisitionText(
      reply.leadCaptureQuote,
      reply.lead_capture_quote,
      lead.leadCaptureQuote,
      lead.lead_capture_quote
    );
    const leadCaptureObservedAt = acquisitionText(
      reply.leadCaptureObservedAt,
      reply.lead_capture_observed_at,
      lead.leadCaptureObservedAt,
      lead.lead_capture_observed_at
    );
    return {
      id,
      nickname: acquisitionText(reply.nickname, lead.nickname, lead.name, touch.recipient?.nickname, "未命名用户"),
      avatar: acquisitionAvatarSource(reply, lead, touch.recipient),
      sourceLabel: acquisitionSourceLabel(reply, lead, touch),
      touchContent,
      incomingContent,
      replyContent,
      ...(Object.keys(leadCapture).length ? { leadCapture } : {}),
      ...(leadCaptureStatus ? { leadCaptureStatus } : {}),
      ...(leadCaptureQuote ? { leadCaptureQuote } : {}),
      ...(leadCaptureObservedAt ? { leadCaptureObservedAt } : {}),
      status,
      statusLabel,
      timestamp: acquisitionText(reply.receivedAt, reply.createdAt, reply.updatedAt, touch.receipt?.sentAt, touch.sentAt, touch.updatedAt)
    };
  }).sort((a, b) => inboxTimestamp(b.timestamp) - inboxTimestamp(a.timestamp));
}

export function commentAcquisitionOutreachRows(work = {}) {
  const view = commentAcquisitionRealtimeView(work);
  const conversations = commentAcquisitionConversationRows(work);
  const rows = new Map(view.people.map((person) => [person.id, { ...person }]));
  const sentStates = new Set(["sent", "delivered", "succeeded", "completed"]);

  conversations.forEach((conversation) => {
    const previous = rows.get(conversation.id) || {};
    rows.set(conversation.id, {
      ...previous,
      ...conversation,
      nickname: acquisitionText(conversation.nickname, previous.nickname, "未命名用户"),
      avatar: acquisitionText(conversation.avatar, previous.avatar),
      quote: acquisitionText(previous.quote),
      workTitle: acquisitionText(previous.workTitle),
      reason: acquisitionText(previous.reason),
      sourceLabel: conversation.sourceLabel && conversation.sourceLabel !== "来源待确认"
        ? conversation.sourceLabel
        : acquisitionText(previous.sourceLabel, conversation.sourceLabel, "来源待确认"),
      intentTier: acquisitionText(previous.intentTier),
      intentScore: acquisitionNumber(previous.intentScore),
      intentSignals: Array.isArray(previous.intentSignals) ? previous.intentSignals : [],
      intentConfidence: acquisitionNumber(previous.intentConfidence),
      leadCapture: acquisitionObject(conversation.leadCapture || previous.leadCapture),
      leadCaptureStatus: acquisitionText(conversation.leadCaptureStatus, previous.leadCaptureStatus),
      leadCaptureQuote: acquisitionText(conversation.leadCaptureQuote, previous.leadCaptureQuote),
      leadCaptureObservedAt: acquisitionText(conversation.leadCaptureObservedAt, previous.leadCaptureObservedAt),
      sourceUrl: acquisitionText(previous.sourceUrl),
      sourceObservedAt: acquisitionText(previous.sourceObservedAt),
      touchContent: acquisitionText(conversation.touchContent, previous.touchContent),
      touchState: acquisitionText(previous.touchState)
    });
  });

  return [...rows.values()].map((person) => {
    const rawState = acquisitionText(person.touchState).toLowerCase();
    const sent = sentStates.has(rawState);
    return {
      ...person,
      outreachState: sent ? "sent" : "pending",
      outreachStateLabel: sent ? "已触达" : "待触达",
      touchContent: sent ? acquisitionText(person.touchContent) : ""
    };
  }).sort((a, b) => {
    const stage = (a.outreachState === "pending" ? 0 : 1) - (b.outreachState === "pending" ? 0 : 1);
    return stage || inboxTimestamp(b.timestamp) - inboxTimestamp(a.timestamp);
  });
}

function liveDanmakuOutreachRows(work = {}) {
  return commentAcquisitionOutreachRows(work).map((person) => ({
    ...person,
    sourceLabel: "直播弹幕",
    workTitle: ""
  }));
}

export function liveDanmakuAnalysisRealtimeView(work = {}) {
  const snapshot = acquisitionSnapshotFor(work);
  const result = acquisitionObject(snapshot.resultSnapshot || snapshot.snapshot);
  const analysis = acquisitionObject(
    result.danmakuAnalysis
      || snapshot.danmakuAnalysis
      || work?.metadata?.danmakuAnalysis
  );
  const collection = acquisitionObject(result.collectionSnapshot || snapshot.collectionSnapshot || work?.metadata?.collectionSnapshot);
  const taskState = acquisitionText(snapshot.taskState, result.taskState, work?.metadata?.taskState).toLowerCase();
  const resultStatus = acquisitionText(result.status, snapshot.status).toLowerCase();
  const isFinal = resultStatus === "collecting"
    ? false
    : Boolean(analysis.users?.length || ["completed", "succeeded", "success", "done"].includes(taskState) || collection.state === "ended");
  const rawUsers = isFinal ? acquisitionArray(analysis.users || result.leads || snapshot.leads) : [];
  const people = rawUsers.map((user, index) => {
    const evidence = acquisitionArray(user?.evidence).map((item) => ({
      quote: acquisitionText(item?.quote, item?.text, item?.content, item?.message),
      observedAt: acquisitionText(item?.observedAt, item?.observed_at),
      roomId: acquisitionText(item?.roomId, item?.room_id)
    })).filter((item) => item.quote);
    const topics = acquisitionArray(user?.topics || user?.topicLabels || user?.topic_labels)
      .map((item) => acquisitionText(item?.label, item?.name, item?.key, item))
      .filter(Boolean);
    const key = acquisitionLeadKey(user) || `live-user-${index + 1}`;
    return {
      ...user,
      id: key,
      nickname: acquisitionText(user?.nickname, user?.name, "抖音用户"),
      avatar: acquisitionAvatarSource(user),
      quote: acquisitionText(acquisitionEvidenceQuote(user), evidence.at(-1)?.quote),
      intentTier: acquisitionText(user?.intentTier, user?.intent, user?.tier, "待确认"),
      intentScore: acquisitionNumber(user?.score, user?.intentScore, user?.intent_score),
      danmakuCount: acquisitionNumber(user?.danmakuCount, user?.danmaku_count, user?.count, 1),
      topics,
      evidence,
      sourceLabel: "直播间",
      workTitle: acquisitionText(user?.roomTitle, user?.room_title, "当前直播间")
    };
  });
  const topics = acquisitionArray(analysis.topics).map((topic) => ({
    ...topic,
    label: acquisitionText(topic?.label, topic?.name, topic?.key, "未命名主题"),
    count: acquisitionNumber(topic?.count, topic?.total),
    examples: acquisitionArray(topic?.examples || topic?.quotes).map((item) => acquisitionText(item)).filter(Boolean)
  }));
  const counts = {
    ...acquisitionObject(result.counts),
    ...acquisitionObject(analysis.counts)
  };
  return {
    analysis,
    people,
    topics,
    counts: {
      danmaku: acquisitionNumber(collection.totalDanmaku, counts.danmaku, counts.total, snapshot.lastScan?.counts?.danmaku),
      questions: isFinal ? acquisitionNumber(counts.questions) : 0,
      highIntent: isFinal ? acquisitionNumber(counts.highIntent, counts.high_intent) : 0,
      uniqueUsers: acquisitionNumber(collection.uniqueUsers, counts.uniqueUsers, counts.unique_users, people.length)
    },
    goal: acquisitionText(analysis.goal, work?.metadata?.configuration?.audienceRules?.goal, work?.metadata?.goal),
    liveSourceState: acquisitionText(snapshot.lastScan?.sources?.live?.state, result.sources?.live?.state) || "waiting",
    collection,
    isFinal,
    status: acquisitionText(result.status, taskState, "collecting"),
    hasSnapshot: Boolean(Object.keys(snapshot).length || Object.keys(analysis).length || Object.keys(collection).length)
  };
}

export function viralWorkAnalysisRealtimeView(work = {}) {
  const metadata = acquisitionObject(work.metadata);
  const rawResult = metadata.resultSnapshot || metadata.viralWorkAnalysis || metadata.analysisResult;
  const resultSource = acquisitionObject(rawResult);
  const result = acquisitionObject(resultSource.resultSnapshot || resultSource);
  const status = acquisitionText(metadata.status, result.status, work.state === "done" ? "completed" : work.lastError ? "failed" : "running") || "running";
  const progress = acquisitionNumber(work.progress, metadata.progress);
  const completed = ["completed", "succeeded", "success", "done", "partial"].includes(status.toLowerCase()) || work.state === "done";
  const process = acquisitionArray(result.analysisProcess);
  const phase = acquisitionText(work.phase, metadata.phase, metadata.progressPhase);
  const phaseKey = {
    "校验作品链接": "link",
    "读取公开作品详情": "metadata",
    "整理公开评论": "comments",
    "解析视频内容": "video",
    "选择视频代表画面": "frames",
    "生成分析报告": "synthesis",
    "分析报告已生成": "synthesis"
  }[phase] || "";
  const steps = [
    ["link", "校验作品链接"],
    ["metadata", "读取公开作品详情"],
    ["comments", "整理公开评论"],
    ["video", "解析视频内容"],
    ["frames", "选择视频代表画面"],
    ["synthesis", "生成分析报告"]
  ].map(([key, title], index) => {
    const stored = process.find((item) => item?.key === key);
    const currentIndex = ["link", "metadata", "comments", "video", "frames", "synthesis"].indexOf(phaseKey);
    const fallbackStatus = completed
      ? "completed"
      : currentIndex >= 0
        ? index < currentIndex ? "completed" : index === currentIndex ? "running" : "queued"
        : metadata.mock === true
          ? index === 0 ? "completed" : "running"
          : "queued";
    const stepStatus = acquisitionText(stored?.status, fallbackStatus) || fallbackStatus;
    return { key, title, status: stepStatus, detail: acquisitionText(stored?.detail) };
  });
  return {
    result,
    status,
    progress,
    sourceUrl: acquisitionText(metadata.sourceUrl, metadata.source_url, result.sourceUrl, result.inputs?.workUrl),
    goal: acquisitionText(metadata.goal, result.goal),
    phase,
    title: acquisitionText(result.title, "爆款作品分析报告"),
    summary: acquisitionText(result.summary, work.task, "等待分析服务回传"),
    work: acquisitionObject(result.work),
    metrics: acquisitionObject(result.metrics || result.work?.metrics),
    steps,
    artifact: acquisitionText(work.artifact),
    hasResult: Boolean(Object.keys(result).length)
  };
}

function acquisitionQueueProgressFor(person = {}) {
  const rawState = acquisitionText(person.touchState).toLowerCase().replace(/[\s-]+/g, "_");
  const hasReply = Boolean(acquisitionText(person.incomingContent, person.replyContent));
  if (["sending", "processing", "in_progress", "running", "dispatching"].includes(rawState)) {
    return { state: "sending", label: "正在触达" };
  }
  if (["failed", "error", "rejected", "blocked", "cancelled", "canceled"].includes(rawState)) {
    return { state: "failed", label: "触达失败" };
  }
  if (["sent", "delivered", "succeeded", "completed"].includes(rawState)) {
    return hasReply ? { state: "replied", label: "已回复" } : { state: "waiting-reply", label: "等待客户回复" };
  }
  return { state: "queued", label: "排队触达中" };
}

function acquisitionQueueSourceLabelFor(person = {}) {
  const sourceLabel = acquisitionText(person.sourceLabel, "来源待确认");
  const normalized = sourceLabel.toLowerCase();
  if (/live|danmaku|直播/.test(normalized)) return "直播弹幕";
  if (/follow|like|notification|interaction|互动|关注|点赞/.test(normalized)) return "互动通知";
  return sourceLabel;
}

export function commentAcquisitionQueueRows(work = {}) {
  return commentAcquisitionOutreachRows(work)
    .filter((person) => person.intentTier === "high")
    .map((person) => {
      const progress = acquisitionQueueProgressFor(person);
      return {
        ...person,
        touchProgressState: progress.state,
        touchProgressLabel: progress.label,
        queueSourceLabel: acquisitionQueueSourceLabelFor(person)
      };
    });
}

function mountAcquisitionPersonAvatar(container, person = {}) {
  const name = acquisitionText(person.nickname, person.name, "用户");
  const source = acquisitionAvatarSource(person);
  container.textContent = "";
  container.setAttribute("aria-label", `${name}头像`);
  if (!source) {
    container.textContent = Array.from(name)[0] || "用";
    return;
  }
  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    if (image.parentElement !== container) return;
    image.remove();
    container.textContent = Array.from(name)[0] || "用";
  }, { once: true });
  container.appendChild(image);
}

function commentAcquisitionIntentLabel(person = {}) {
  const labels = { high: "高意向", medium: "中意向", low: "待观察" };
  return labels[person.intentTier] || (person.intentScore ? `${person.intentScore} 分` : "已识别");
}

function analysisQualifiedTierFor(person = {}) {
  const tier = acquisitionText(person.intentTier).toLowerCase();
  if (tier === "high" || tier === "medium") return tier;
  const score = Number(person.intentScore);
  if (!Number.isFinite(score)) return "";
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "";
}

function analysisDecisionStateFor(person = {}) {
  const qualifiedTier = analysisQualifiedTierFor(person);
  if (qualifiedTier) return qualifiedTier;
  const hasJudgment = Boolean(
    acquisitionText(person.intentTier, person.reason)
    || Number(person.intentScore)
    || (Array.isArray(person.intentSignals) && person.intentSignals.length)
  );
  return hasJudgment ? "not-qualified" : "pending";
}

function analysisProspectLabel(person = {}) {
  return analysisQualifiedTierFor(person) === "high" ? "高意向" : "可跟进";
}

export function analysisQualifiedProspects(people = []) {
  const rank = { high: 0, medium: 1 };
  return (Array.isArray(people) ? people : [])
    .map((person) => ({ ...person, analysisTier: analysisQualifiedTierFor(person) }))
    .filter((person) => person.analysisTier)
    .sort((left, right) => {
      const tierOrder = rank[left.analysisTier] - rank[right.analysisTier];
      if (tierOrder) return tierOrder;
      return Number(right.intentScore || 0) - Number(left.intentScore || 0);
    });
}

function acquisitionLeadCaptureDetails(person = {}) {
  const capture = acquisitionObject(person.leadCapture || person.capture || person.contact || person.contactInfo || person.contact_info);
  const fields = [
    ["手机号", capture.phone || capture.mobile || capture.mobilePhone || capture.mobile_phone],
    ["微信号", capture.wechat || capture.wechatId || capture.wechat_id || capture.vx],
    ["邮箱", capture.email || capture.mail]
  ].map(([label, value]) => ({ label, value: value == null ? "" : String(value).trim() })).filter((item) => item.value);
  const rawStatus = acquisitionText(person.leadCaptureStatus, capture.status, capture.state).toLowerCase();
  const captured = fields.length > 0 || /captured|saved|completed|已留资|已保存/.test(rawStatus);
  const quote = acquisitionText(person.leadCaptureQuote, capture.quote, capture.content, capture.message, capture.sourceText);
  return {
    captured,
    label: captured ? "已留资" : "暂未留资",
    fields,
    quote
  };
}

export function commentAcquisitionDetailModel(person = {}) {
  const quote = acquisitionText(person.quote);
  const sourceLabel = acquisitionText(person.sourceLabel, "来源待确认");
  const workTitle = acquisitionText(person.workTitle);
  const profile = acquisitionObject(person.profileEvidence || person.profile || person.profile_evidence);
  const facts = acquisitionObject(person.facts || person.prospectFacts || profile.facts || profile.profileFacts);
  const factText = (...keys) => acquisitionDetailFieldText(...keys.flatMap((key) => [facts[key], facts[key]?.value]));
  const profileEvidence = acquisitionProfileEvidence(person);
  const signals = Array.isArray(person.intentSignals) ? person.intentSignals.filter((item) => typeof item === "string" && item.trim()).slice(0, 8) : [];
  const hasJudgment = Boolean(person.intentTier || person.intentScore || person.reason || signals.length);
  const outreachSent = person.outreachState === "sent";
  const capture = acquisitionLeadCaptureDetails(person);
  const recommendation = acquisitionText(person.recommendation, person.nextAction, person.next_action)
    || (person.intentTier === "high"
      ? "建议优先进入私信触达"
      : person.intentTier === "medium"
        ? "建议继续补充证据后再触达"
        : person.intentTier === "low"
          ? "建议暂缓触达"
          : "等待补充判断后再决定");
  const outreachBasis = [
    ...signals,
    person.reason ? `结合${person.reason}` : "",
    profile.activeBehavior ? `结合${profile.activeBehavior}` : ""
  ].filter(Boolean).slice(0, 4);
  const evidence = {
    sourceLabel,
    workTitle,
    quote,
    recentComment: acquisitionText(person.recentComment, person.recent_comment, person.latestComment, person.latest_comment, quote),
    sourceReference: acquisitionText(person.sourceReference, person.source_reference),
    profile: {
      activeBehavior: acquisitionDetailFieldText(factText("activeBehavior"), profileEvidence.activeBehavior),
      cityRelation: acquisitionDetailFieldText(factText("cityRelation"), profileEvidence.cityRelation),
      storeConversation: acquisitionDetailFieldText(factText("storeConversation"), profileEvidence.storeConversation),
      dynamicTraits: profileEvidence.dynamicTraits
    },
    sourceUrl: acquisitionText(person.sourceUrl),
    observedAt: acquisitionText(person.sourceObservedAt)
  };
  const judgment = {
    label: hasJudgment ? commentAcquisitionIntentLabel(person) : "待判断",
    reason: acquisitionText(person.reason),
    signals,
    score: person.intentScore || 0,
    confidence: person.intentConfidence || 0,
    recommendation
  };
  const outreach = {
    state: outreachSent ? "done" : "pending",
    label: outreachSent ? "已发送" : "待触达",
    message: outreachSent ? acquisitionText(person.touchContent) : "",
    reply: acquisitionText(person.incomingContent),
    replyStatus: person.incomingContent ? "已收到回复" : outreachSent ? "等待对方回复" : "尚未发送私信",
    basis: outreachBasis
  };
  return {
    person: { ...person },
    evidence,
    judgment,
    outreach,
    capture,
    flow: [
      { key: "discovered", title: "获取潜客", state: quote ? "done" : "pending", detail: quote ? `${sourceLabel}${workTitle ? ` · ${workTitle}` : ""}` : "等待来源内容" },
      { key: "judged", title: "判断意向", state: hasJudgment ? "done" : "pending", detail: judgment.label },
      { key: "outreach", title: "私信触达", state: outreach.state, detail: outreach.label },
      { key: "capture", title: "留资结果", state: capture.captured ? "done" : "pending", detail: capture.label }
    ]
  };
}

export function acquisitionDetailFactEntries(detail = {}, sourceKind = "") {
  const evidence = acquisitionObject(detail.evidence);
  const profile = acquisitionObject(evidence.profile);
  const sourceFactLabel = /弹幕|live|danmaku/i.test(sourceKind)
    ? "获取直播弹幕"
    : /评论|comment|review/i.test(sourceKind)
      ? "获取作品评论"
      : /互动|interaction|notification|follow|like/i.test(sourceKind)
        ? "获取互动通知"
        : "获取来源内容";
  const entries = [
    [sourceFactLabel, evidence.quote],
    ["最近评论", evidence.recentComment],
    ["活跃行为", profile.activeBehavior]
  ];
  const dynamicTraits = Array.isArray(profile.dynamicTraits) ? profile.dynamicTraits : [];
  entries.push(...dynamicTraits);
  entries.push(
    ["城市关系", profile.cityRelation],
    ["门店对话", profile.storeConversation]
  );
  return entries.filter(([, value]) => acquisitionFactHasValue(value));
}

function renderCommentAcquisitionControls(selected, state, onChange) {
  const work = selected.liveWork || {};
  const realtime = acquisitionRealtimeViewModel(selected.id, work);
  const controls = el("div", "sb-rw-acquisition-compact-controls");
  const adjust = el("button", null, "调整策略");
  adjust.type = "button";
  adjust.disabled = !realtime.taskId;
  adjust.addEventListener("click", () => {
    openAcquisitionTaskUpdateDialog({
      agentId: selected.id,
      gateway: state?.gateway,
      context: {
        taskId: realtime.taskId,
        taskRunId: realtime.taskRunId,
        accountId: realtime.accountId,
        taskVersion: work.version ?? work.taskVersion ?? work.metadata?.taskVersion ?? null
      },
      currentConfig: work,
      onSubmitted: ({ payload }) => {
        state.events = [`${selected.name}：任务策略已更新，仅对未来执行生效`, ...state.events].slice(0, 8);
        state.lastUpdatePayload = payload;
        onChange?.();
      }
    });
  });
  controls.appendChild(adjust);
  const dispatch = async (action, button) => {
    if (!state || !realtime.taskId || button.disabled) return;
    button.disabled = true;
    const actionName = action === "stop" ? "task.cancel" : action === "pause" ? "task.pause" : "task.resume";
    try {
      let gateway = state.gateway;
      if (!gateway?.action) gateway = await globalThis.__SALEBUDDY__?.gatewayReady?.catch?.(() => null);
      if (!gateway?.action) throw new Error("控制面暂不可用");
      await gateway.action(actionName, acquisitionRealtimeActionPayload(selected.id, action, work));
    } catch (error) {
      state.events = [`${selected.name}：${error?.message || "控制动作未提交"}`, ...state.events].slice(0, 8);
    } finally {
      button.disabled = false;
      onChange?.();
    }
  };
  const paused = realtime.taskState === "paused";
  const toggle = el("button", null, paused ? "恢复运行" : "暂停运行");
  toggle.type = "button";
  toggle.disabled = !realtime.taskId || ["error", "stopped", "completed"].includes(realtime.taskState);
  toggle.addEventListener("click", () => { void dispatch(paused ? "resume" : "pause", toggle); });
  controls.appendChild(toggle);
  return controls;
}

function renderCommentAcquisitionProgressPanel(selected, state, onChange) {
  const work = selected.liveWork || {};
  const view = commentAcquisitionRealtimeView(work);
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-progress-panel");
  const head = el("div", "sb-rw-panel-head sb-rw-acquisition-head");
  const heading = el("div");
  heading.append(el("div", "sb-rw-panel-title", "实时获客进展"), el("span", "sb-rw-panel-sub", view.hasSnapshot ? "来自真实任务回传" : "等待第一轮评论回传"));
  const running = el("span", "sb-rw-acquisition-running");
  running.append(el("i"), el("span", null, work.lastError ? "需要处理" : "自动运行中"));
  head.append(heading, running);
  panel.appendChild(head);

  const body = el("div", "sb-rw-acquisition-progress-body");
  const metrics = el("div", "sb-rw-acquisition-metrics");
  [["分析作品", view.counts.works], ["分析评论", view.counts.comments], ["找到潜客", view.counts.prospects], ["已触达", view.counts.touched]].forEach(([label, value]) => {
    const item = el("div", "sb-rw-acquisition-metric");
    item.append(el("strong", null, String(value)), el("span", null, label));
    metrics.appendChild(item);
  });
  body.appendChild(metrics);

  if (view.works.length) {
    const works = el("div", "sb-rw-acquisition-works");
    works.appendChild(el("span", null, "最近分析"));
    view.works.slice(0, 3).forEach((entry) => works.appendChild(el("strong", null, entry.title)));
    body.appendChild(works);
  }

  const list = el("div", "sb-rw-acquisition-people");
  if (!view.people.length) {
    const empty = el("div", "sb-rw-acquisition-empty");
    empty.append(el("i"), el("strong", null, "正在等待符合条件的人"), el("span", null, view.latestActivity || "评论区获客运营会持续分析新评论，找到目标用户后立即显示在这里。"));
    list.appendChild(empty);
  } else {
    view.people.slice(0, 6).forEach((person) => {
      const item = el("article", "sb-rw-acquisition-person");
      const avatarNode = el("span", "sb-rw-acquisition-avatar");
      mountAcquisitionPersonAvatar(avatarNode, person);
      const content = el("div", "sb-rw-acquisition-person-content");
      const top = el("div", "sb-rw-acquisition-person-top");
      top.append(el("strong", null, person.nickname), el("span", `is-${person.intentTier || "recognized"}`, commentAcquisitionIntentLabel(person)));
      content.appendChild(top);
      if (person.quote) content.appendChild(el("p", "sb-rw-acquisition-quote", `“${person.quote}”`));
      const facts = [person.workTitle ? `来自《${person.workTitle}》` : "", person.reason].filter(Boolean).join(" · ");
      if (facts) content.appendChild(el("div", "sb-rw-acquisition-reason", facts));
      if (person.touchContent) content.appendChild(el("div", "sb-rw-acquisition-touch", `已自动触达：${person.touchContent}`));
      item.append(avatarNode, content);
      list.appendChild(item);
    });
  }
  body.append(list, renderCommentAcquisitionControls(selected, state, onChange));
  panel.appendChild(body);
  return panel;
}

function acquisitionSelectedPerson(view, state) {
  const people = Array.isArray(view?.people) ? view.people : [];
  const selectedId = state?.acquisitionProspectId;
  const selected = people.find((person) => person.id === selectedId) || people[0] || null;
  if (state) state.acquisitionProspectId = selected?.id || null;
  return selected;
}

function updateAcquisitionQueueSelection(panel, selected, state) {
  const selectedId = String(state?.acquisitionProspectId || "");
  panel.querySelectorAll(".sb-rw-acquisition-person").forEach((item) => {
    item.classList.toggle("is-selected", item.dataset.prospectId === selectedId);
  });
  const detailPanel = panel.parentElement?.querySelector(".sb-rw-acquisition-detail-panel");
  if (detailPanel) detailPanel.replaceWith(renderCommentAcquisitionDetailPanel(selected, state));
}

const ACQUISITION_WORK_VIEWS = Object.freeze([
  { id: "prospecting", label: "潜客搜寻" },
  { id: "outreach", label: "私信触达" },
  { id: "conversion", label: "客服转化" }
]);

const DEFAULT_ACQUISITION_WORK_VIEW = "prospecting";

function acquisitionWorkViewFor(state) {
  const selected = ACQUISITION_WORK_VIEWS.find((view) => view.id === state?.acquisitionWorkView);
  return selected?.id || DEFAULT_ACQUISITION_WORK_VIEW;
}

function renderAcquisitionWorkViewTabs(state, onChange) {
  const tabs = el("nav", "sb-rw-acquisition-scene-tabs");
  tabs.setAttribute("aria-label", "获客工作视图");
  const selectedView = acquisitionWorkViewFor(state);
  ACQUISITION_WORK_VIEWS.forEach((view) => {
    const tab = el("button", `sb-rw-acquisition-scene-tab${view.id === selectedView ? " is-active" : ""}`, view.label);
    tab.type = "button";
    tab.setAttribute("aria-selected", String(view.id === selectedView));
    tab.addEventListener("click", () => {
      if (view.id === acquisitionWorkViewFor(state)) return;
      state.acquisitionWorkView = view.id;
      onChange?.({ structural: true });
    });
    tabs.appendChild(tab);
  });
  return tabs;
}

function renderAuthorizationRecoveryNotice(selected, state, onChange) {
  const recovery = authorizationRecoveryForWork(selected.liveWork);
  if (!recovery) return null;
  const notice = el("section", "sb-rw-auth-recovery");
  const copy = el("div");
  copy.append(el("strong", null, recovery.label), el("span", null, recovery.detail));
  const reconnect = el("button", null, "重新连接账号");
  reconnect.type = "button";
  reconnect.addEventListener("click", () => {
    void state.reauthorizeAgent?.(selected, reconnect, onChange);
  });
  notice.append(copy, reconnect);
  return notice;
}

function syncAuthorizationRecoveryNotice(root, selected, state, onChange) {
  if (!root) return;
  const current = root.querySelector(".sb-rw-auth-recovery");
  const next = renderAuthorizationRecoveryNotice(selected, state, onChange);
  if (current && next) {
    current.replaceWith(next);
    return;
  }
  if (current) {
    current.remove();
    return;
  }
  if (next) root.querySelector(".sb-rw-workbar")?.before(next);
}

function renderCommentAcquisitionSceneHeader(state, onChange) {
  const header = el("section", "sb-rw-acquisition-scene-header");
  const bar = el("div", "sb-rw-acquisition-scene-bar");
  bar.appendChild(renderAcquisitionWorkViewTabs(state, onChange));
  header.appendChild(bar);
  return header;
}

function renderAcquisitionOutreachView(selected, state) {
  const work = selected.liveWork || {};
  const rows = commentAcquisitionOutreachRows(work).filter((person) => person.outreachState === "sent");
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-view-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "私信触达"), el("span", "sb-rw-panel-sub", rows.length ? `${rows.length} 位已发出私信` : "等待私信发送"));
  panel.appendChild(head);
  const body = el("div", "sb-rw-acquisition-view-body");
  if (!rows.length) {
    body.appendChild(el("div", "sb-rw-acquisition-empty", "等待高意向潜客进入私信触达"));
  } else {
    const list = el("div", "sb-rw-acquisition-view-list");
    rows.slice(0, 8).forEach((person) => {
      const item = el("article", "sb-rw-acquisition-view-item");
      const avatar = el("span", "sb-rw-acquisition-avatar");
      mountAcquisitionPersonAvatar(avatar, person);
      const copy = el("div");
      copy.append(el("strong", null, person.nickname), el("span", null, `${person.queueSourceLabel || person.sourceLabel} · ${person.outreachStateLabel}`));
      copy.appendChild(el("p", null, person.touchContent || "已发送私信，等待对方回复"));
      if (person.incomingContent) copy.appendChild(el("p", "sb-rw-acquisition-view-reply", `对方回复：${person.incomingContent}`));
      item.append(avatar, copy);
      list.appendChild(item);
    });
    body.appendChild(list);
  }
  panel.appendChild(body);
  return panel;
}

function renderAcquisitionConversionView(selected, state, onChange) {
  const work = selected.liveWork || {};
  const rows = commentAcquisitionConversationRows(work).map((row) => ({
    ...row,
    receptionMode: state?.receptionConversations?.[row.id]?.mode || "auto"
  }));
  const selectedId = rows.some((row) => row.id === selected?.liveWork?.metadata?.conversionConversationId)
    ? selected.liveWork.metadata.conversionConversationId
    : rows[0]?.id || null;
  const selectedRow = rows.find((row) => row.id === selectedId) || null;
  const panel = el("article", "sb-rw-acquisition-conversion-workbench");
  const sidebar = el("aside", "sb-rw-acquisition-conversion-sidebar");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "昵称或聊天记录";
  search.className = "sb-rw-acquisition-conversion-search";
  sidebar.appendChild(search);
  const list = el("div", "sb-rw-acquisition-conversion-list");
  rows.forEach((row) => {
    const item = el("button", `sb-rw-acquisition-conversion-thread${row.id === selectedId ? " is-selected" : ""}`);
    item.type = "button";
    const avatar = el("span", "sb-rw-acquisition-avatar");
    mountAcquisitionPersonAvatar(avatar, row);
    const copy = el("span");
    copy.append(el("strong", null, row.nickname), el("span", null, row.receptionMode === "human" ? "人工处理中" : row.incomingContent || row.touchContent || "等待客户回复"));
    item.append(avatar, copy);
    item.addEventListener("click", () => {
      selected.liveWork.metadata ||= {};
      selected.liveWork.metadata.conversionConversationId = row.id;
      onChange?.();
    });
    list.appendChild(item);
  });
  sidebar.appendChild(list);

  const conversation = el("section", "sb-rw-acquisition-conversion-conversation");
  if (selectedRow) {
    const head = el("div", "sb-rw-acquisition-conversation-head");
    const avatar = el("span", "sb-rw-acquisition-avatar");
    mountAcquisitionPersonAvatar(avatar, selectedRow);
    const copy = el("div");
    copy.append(el("strong", null, selectedRow.nickname), el("span", null, `${selectedRow.statusLabel || "处理中"} · ${selectedRow.receptionMode === "human" ? "人工处理中" : "AI处理中"}`));
    head.append(avatar, copy);
    conversation.appendChild(head);
    const messages = el("div", "sb-rw-acquisition-conversation-messages");
    if (selectedRow.incomingContent) messages.appendChild(el("div", "sb-rw-acquisition-conversation-message is-inbound", selectedRow.incomingContent));
    if (selectedRow.touchContent) messages.appendChild(el("div", "sb-rw-acquisition-conversation-message is-outbound", selectedRow.touchContent));
    if (!selectedRow.incomingContent && !selectedRow.touchContent) messages.appendChild(el("div", "sb-rw-acquisition-conversation-empty", "等待新的客户消息"));
    conversation.appendChild(messages);
    const footer = el("div", "sb-rw-acquisition-conversation-footer");
    footer.append(el("span", "sb-rw-acquisition-avatar", "AI"), el("span", null, "AI处理中"));
    const handoff = el("button", null, "转人工处理");
    handoff.type = "button";
    handoff.disabled = selectedRow.receptionMode === "human";
    handoff.addEventListener("click", async () => {
      if (handoff.disabled) return;
      handoff.disabled = true;
      handoff.textContent = "正在交接";
      try {
        const accountId = selected.liveWork.metadata?.accountId || state.accountId;
        const result = await receptionRequest(accountId, {
          operation: "/conversations",
          method: "POST",
          body: { customerId: selectedRow.id, mode: "human" }
        });
        state.receptionConversations ||= {};
        state.receptionConversations[selectedRow.id] = { ...(state.receptionConversations[selectedRow.id] || {}), ...result, mode: "human" };
        onChange?.({ structural: true });
      } catch (error) {
        handoff.disabled = false;
        handoff.textContent = "转人工处理";
        state.events = [`${selectedRow.nickname}：${error?.message || "转人工失败"}`, ...state.events].slice(0, 8);
      }
    });
    footer.appendChild(handoff);
    conversation.appendChild(footer);
  } else {
    conversation.appendChild(el("div", "sb-rw-acquisition-conversion-empty", "等待客户回复进入转化工作台"));
  }

  const details = el("aside", "sb-rw-acquisition-conversion-details");
  if (selectedRow) {
    details.appendChild(el("h3", null, "客户详情"));
    const detail = commentAcquisitionDetailModel(selectedRow);
    const facts = [
      ["意向状态", detail.judgment.label],
      ["线索来源", selectedRow.sourceLabel || "抖音私信"],
      ["最近问题", selectedRow.incomingContent || selectedRow.touchContent],
      ...detail.capture.fields.map((field) => [field.label, field.value])
    ].filter(([, value]) => value);
    facts.forEach(([label, value]) => {
      const row = el("div", "sb-rw-acquisition-conversion-fact");
      row.append(el("span", null, label), el("strong", null, value));
      details.appendChild(row);
    });
    details.appendChild(el("h3", null, "客户要求"));
    const tags = el("div", "sb-rw-acquisition-conversion-tags");
    (detail.judgment.signals.length ? detail.judgment.signals : ["持续跟进"])
      .forEach((signal) => tags.appendChild(el("span", null, signal)));
    details.appendChild(tags);
  }
  panel.append(sidebar, conversation, details);
  return panel;
}

function mockSpecialistSourceRows(people = []) {
  const sources = new Map();
  people.forEach((person) => {
    const label = person.sourceLabel || "来源待确认";
    const title = person.workTitle || "抖音互动内容";
    const key = `${label}:${title}`;
    const current = sources.get(key) || { label, title, count: 0 };
    current.count += 1;
    sources.set(key, current);
  });
  return [...sources.values()];
}

function renderMockAnalysisSourcePanel(people) {
  const panel = el("article", "sb-rw-panel sb-rw-analysis-source-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(
    el("div", "sb-rw-panel-title", "待分析来源"),
    el("span", "sb-rw-panel-sub", people.length ? `${people.length} 个对象` : "等待来源")
  );
  panel.appendChild(head);
  const list = el("div", "sb-rw-analysis-source-list");
  const rows = mockSpecialistSourceRows(people);
  if (!rows.length) {
    list.appendChild(el("div", "sb-rw-acquisition-empty", "等待来源内容进入工作现场"));
  } else {
    rows.forEach((row) => {
      const item = el("div", "sb-rw-analysis-source-row");
      const copy = el("div", "sb-rw-analysis-source-copy");
      copy.append(el("strong", null, row.label), el("span", null, row.title));
      item.append(copy, el("b", null, `${row.count} 人`));
      list.appendChild(item);
    });
  }
  panel.appendChild(list);
  return panel;
}

function renderMockAnalysisQueuePanel(people, activePerson, state, onChange, isMock = false) {
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-queue-panel sb-rw-analysis-queue-panel");
  const head = el("div", "sb-rw-panel-head sb-rw-acquisition-head");
  const title = el("div", "sb-rw-panel-title");
  title.append(el("span", null, "分析队列"));
  if (isMock) title.appendChild(el("span", "sb-rw-mock-badge", "MOCK"));
  const running = el("span", "sb-rw-acquisition-running");
  const pendingCount = people.filter((person) => analysisDecisionStateFor(person) === "pending").length;
  const completedCount = people.length - pendingCount;
  running.append(el("i"), el("span", null, people.length
    ? pendingCount ? `${pendingCount} 位待分析` : `${completedCount} 位已完成判断`
    : "等待进入队列"));
  head.append(title, running);
  panel.appendChild(head);

  const body = el("div", `sb-rw-acquisition-queue-body${people.length ? "" : " is-empty"}`);
  const list = el("div", "sb-rw-acquisition-people");
  if (!people.length) {
    const empty = el("div", "sb-rw-acquisition-empty");
    empty.append(el("i"), el("strong", null, "等待对象进入分析队列"), el("span", null, "新的评论、弹幕和互动会在这里排队分析。"));
    list.appendChild(empty);
  } else {
    people.forEach((person) => {
      const item = el("button", `sb-rw-acquisition-person${person.id === activePerson?.id ? " is-selected" : ""}`);
      item.type = "button";
      const avatar = el("span", "sb-rw-acquisition-avatar");
      mountAcquisitionPersonAvatar(avatar, person);
      const content = el("span", "sb-rw-acquisition-person-content");
      const top = el("span", "sb-rw-acquisition-person-top");
      top.append(el("strong", null, person.nickname));
      const meta = el("span", "sb-rw-acquisition-person-meta");
      const decisionState = analysisDecisionStateFor(person);
      const decisionLabel = person.id === activePerson?.id
        ? "查看中"
        : decisionState === "high"
          ? "已入池"
          : decisionState === "medium"
            ? "可跟进"
            : decisionState === "not-qualified"
              ? "暂不入池"
              : "待分析";
      meta.append(el("b", null, decisionLabel), el("span", "sb-rw-acquisition-source", person.sourceLabel || "来源待确认"));
      content.append(top, meta);
      if (person.quote) content.appendChild(el("span", "sb-rw-acquisition-quote", `“${person.quote}”`));
      item.append(avatar, content);
      item.addEventListener("click", () => {
        state.acquisitionProspectId = person.id;
        onChange?.({ structural: true });
      });
      list.appendChild(item);
    });
  }
  body.appendChild(list);
  panel.appendChild(body);
  return panel;
}

function renderMockFinderLiveRoomPanel(selected) {
  const work = selected.liveWork || {};
  const panel = el("article", "sb-rw-panel sb-rw-cloud-panel sb-rw-pure-live-panel sb-rw-finder-live-panel");
  const wrap = el("div", "sb-rw-cloud-live-wrap");
  wrap.appendChild(renderCommentAcquisitionLiveRoomStage(null, null, work));
  panel.appendChild(wrap);
  return panel;
}

function renderMockFinderQueuePanel(people, activePerson, state, onChange, isMock = false) {
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-queue-panel sb-rw-finder-queue-panel");
  const head = el("div", "sb-rw-panel-head sb-rw-acquisition-head");
  const title = el("div", "sb-rw-panel-title");
  title.append(el("span", null, "找到谁"));
  if (isMock) title.appendChild(el("span", "sb-rw-mock-badge", "MOCK"));
  const running = el("span", "sb-rw-acquisition-running");
  running.append(el("i"), el("span", null, people.length ? `${people.length} 位已找到` : "等待找到对象"));
  head.append(title, running);
  panel.appendChild(head);

  const body = el("div", `sb-rw-acquisition-queue-body${people.length ? "" : " is-empty"}`);
  const list = el("div", "sb-rw-acquisition-people");
  if (!people.length) {
    const empty = el("div", "sb-rw-acquisition-empty");
    empty.append(el("i"), el("strong", null, "当前来源还没有找到对象"), el("span", null, "新的评论、弹幕和互动会继续进入这里。"));
    list.appendChild(empty);
  } else {
    people.forEach((person) => {
      const item = el("button", `sb-rw-acquisition-person${person.id === activePerson?.id ? " is-selected" : ""}`);
      item.type = "button";
      const avatar = el("span", "sb-rw-acquisition-avatar");
      mountAcquisitionPersonAvatar(avatar, person);
      const content = el("span", "sb-rw-acquisition-person-content");
      const top = el("span", "sb-rw-acquisition-person-top");
      top.append(el("strong", null, person.nickname));
      const meta = el("span", "sb-rw-acquisition-person-meta");
      meta.append(el("b", null, "已找到"), el("span", "sb-rw-acquisition-source", person.sourceLabel || "来源待确认"));
      content.append(top, meta);
      if (person.quote) content.appendChild(el("span", "sb-rw-acquisition-quote", `“${person.quote}”`));
      item.append(avatar, content);
      item.addEventListener("click", () => {
        state.acquisitionProspectId = person.id;
        onChange?.({ structural: true });
      });
      list.appendChild(item);
    });
  }
  body.appendChild(list);
  panel.appendChild(body);
  return panel;
}

function renderMockFinderDetailPanel(person) {
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-detail-panel sb-rw-finder-detail-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "原始证据"), el("span", "sb-rw-panel-sub", person ? "已找到" : "等待对象"));
  panel.appendChild(head);
  if (!person) {
    const empty = el("div", "sb-rw-acquisition-detail-empty");
    empty.append(el("i"), el("strong", null, "选择一个找到的人"), el("span", null, "他的来源位置与原始内容会显示在这里。"));
    panel.appendChild(empty);
    return panel;
  }

  const body = el("div", "sb-rw-acquisition-detail-body");
  const profile = el("div", "sb-rw-acquisition-detail-profile");
  const avatar = el("span", "sb-rw-acquisition-avatar");
  mountAcquisitionPersonAvatar(avatar, person);
  const profileCopy = el("div");
  profileCopy.append(el("strong", null, person.nickname), el("span", null, [person.sourceLabel, person.workTitle].filter(Boolean).join(" · ") || "来源待确认"));
  profile.append(avatar, profileCopy);
  body.appendChild(profile);

  const timeline = el("div", "sb-rw-acquisition-detail-timeline");
  const step = el("section", "sb-rw-acquisition-detail-step is-done");
  step.appendChild(el("i"));
  const copy = el("div", "sb-rw-acquisition-detail-step-copy");
  const stepHead = el("div", "sb-rw-acquisition-detail-step-head");
  stepHead.append(el("strong", null, "发现记录"), el("span", "sb-rw-acquisition-detail-step-state is-done", person.sourceLabel || "来源已保留"));
  const facts = el("div", "sb-rw-acquisition-detail-fact-list");
  [
    ["来源位置", person.sourceLabel || "来源待确认"],
    ["关联内容", person.workTitle || "抖音互动内容"],
    ["原始内容", person.quote || "原始内容已保留"]
  ].forEach(([label, value]) => {
    const fact = el("div", "sb-rw-acquisition-detail-fact");
    fact.append(el("span", null, label), el("p", null, value));
    facts.appendChild(fact);
  });
  copy.append(stepHead, facts);
  step.appendChild(copy);
  timeline.appendChild(step);
  body.appendChild(timeline);
  panel.appendChild(body);
  return panel;
}

function renderMockFinderWorksite(selected, state, onChange) {
  const work = selected.liveWork || {};
  const people = commentAcquisitionRealtimeView(work).people;
  const person = acquisitionSelectedPerson({ people }, state);
  return {
    liveRoomPanel: renderMockFinderLiveRoomPanel(selected),
    queuePanel: renderMockFinderQueuePanel(people, person, state, onChange, Boolean(work.metadata?.mock)),
    detailPanel: renderMockFinderDetailPanel(person)
  };
}

function renderMockAnalysisProspectsPanel(people, activePerson, state, onChange) {
  const prospects = analysisQualifiedProspects(people);
  const panel = el("article", "sb-rw-panel sb-rw-analysis-prospects-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "已判断的潜客"), el("span", "sb-rw-panel-sub", prospects.length ? `${prospects.length} 位可跟进` : "等待判断完成"));
  panel.appendChild(head);
  if (!prospects.length) {
    const empty = el("div", "sb-rw-acquisition-detail-empty");
    empty.append(el("i"), el("strong", null, "暂无可跟进潜客"), el("span", null, "完成判断后，高意向和可跟进对象会进入这里。"));
    panel.appendChild(empty);
    return panel;
  }

  const list = el("div", "sb-rw-analysis-prospect-list");
  prospects.forEach((person) => {
    const model = commentAcquisitionDetailModel(person);
    const item = el("button", `sb-rw-analysis-prospect${person.id === activePerson?.id ? " is-selected" : ""}`);
    item.type = "button";
    item.setAttribute("aria-pressed", person.id === activePerson?.id ? "true" : "false");

    const avatar = el("span", "sb-rw-acquisition-avatar");
    mountAcquisitionPersonAvatar(avatar, person);
    const copy = el("span", "sb-rw-analysis-prospect-copy");
    const top = el("span", "sb-rw-analysis-prospect-top");
    top.append(el("strong", null, person.nickname), el("span", `sb-rw-analysis-prospect-tier is-${person.analysisTier}`, analysisProspectLabel(person)));
    const source = [person.sourceLabel, person.workTitle].filter(Boolean).join(" · ") || "来源待确认";
    const evidence = model.judgment.reason || model.judgment.signals[0] || "已保留判断依据";
    const next = model.judgment.recommendation || "等待安排下一步";
    copy.append(
      top,
      el("span", "sb-rw-analysis-prospect-source", source),
      el("span", "sb-rw-analysis-prospect-quote", `“${model.evidence.quote || person.quote || "原始内容已保留"}”`),
      el("span", "sb-rw-analysis-prospect-evidence", evidence),
      el("span", "sb-rw-analysis-prospect-next", `下一步：${next}`)
    );
    item.append(avatar, copy);
    item.addEventListener("click", () => {
      state.acquisitionProspectId = person.id;
      onChange?.({ structural: true });
    });
    list.appendChild(item);
  });
  panel.appendChild(list);
  return panel;
}

function renderMockAnalysisWorksite(selected, state, onChange) {
  const work = selected.liveWork || {};
  const people = commentAcquisitionRealtimeView(work).people;
  const person = acquisitionSelectedPerson({ people }, state);
  return {
    sourcePanel: renderMockAnalysisSourcePanel(people),
    queuePanel: renderMockAnalysisQueuePanel(people, person, state, onChange, Boolean(work.metadata?.mock)),
    prospectPanel: renderMockAnalysisProspectsPanel(people, person, state, onChange)
  };
}

function renderLiveDanmakuLiveRoomPanel(selected, state, title = "", subtitle = "", options = {}) {
  const work = selected.liveWork || {};
  const replay = state?.cloudViewerReplays?.get(selected.id) || null;
  const replayPresentation = cloudReplayPresentation(replay, work);
  const panel = el("article", "sb-rw-panel sb-rw-cloud-panel sb-rw-pure-live-panel sb-rw-live-danmaku-room-panel");
  if (options.showHeader !== false && (title || subtitle)) {
    const head = el("div", "sb-rw-panel-head");
    head.append(el("div", "sb-rw-panel-title", title), el("span", "sb-rw-panel-sub", subtitle));
    panel.appendChild(head);
  }
  const wrap = el("div", "sb-rw-cloud-live-wrap");
  wrap.appendChild(renderCommentAcquisitionLiveRoomStage(replay, replayPresentation, work));
  if (options.showStatus !== false) {
    const status = el("div", "sb-rw-live-danmaku-room-status");
    const sourceState = acquisitionText(work?.taskSnapshot?.lastScan?.sources?.live?.state, work?.resultSnapshot?.sources?.live?.state, work?.metadata?.liveSourceState).toLowerCase();
    const statusText = work.lastError ? "数据源需要处理" : sourceState === "ended" ? "直播已结束，正在整理整场弹幕" : sourceState === "waiting" ? "等待直播开始" : "当前直播间持续监听中";
    status.append(el("i"), el("span", null, statusText));
    wrap.appendChild(status);
  }
  panel.appendChild(wrap);
  return panel;
}

function liveDanmakuIntentLabel(person = {}) {
  const raw = acquisitionText(person.intentTier).toLowerCase();
  if (raw === "high" || /重点|明确/.test(raw)) return "重点用户";
  if (raw === "medium" || /待确认|中意向/.test(raw)) return "待确认";
  if (raw === "low" || /行为/.test(raw)) return "行为信号";
  return acquisitionText(person.intentTier, "待分析");
}

function renderLiveDanmakuAnalysisQueuePanel(view, activePerson, state, onChange) {
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-queue-panel sb-rw-live-danmaku-analysis-queue-panel");
  const head = el("div", "sb-rw-panel-head sb-rw-acquisition-head");
  const running = el("span", "sb-rw-acquisition-running");
  running.append(el("i"), el("span", null, view.isFinal ? `${view.people.length} 位用户已分析` : `${view.counts.danmaku} 条弹幕已采集`));
  head.append(el("div", "sb-rw-panel-title", "弹幕分析队列"), running);
  panel.appendChild(head);
  const body = el("div", `sb-rw-acquisition-queue-body${view.people.length ? "" : " is-empty"}`);
  const list = el("div", "sb-rw-acquisition-people");
  if (!view.people.length) {
    const empty = el("div", "sb-rw-acquisition-empty");
    empty.append(el("i"), el("strong", null, view.isFinal ? "整场暂无可分析弹幕" : "持续采集直播间弹幕"), el("span", null, view.isFinal ? "本场没有可用于分析的文字弹幕。" : "直播结束后，我会基于整场弹幕统一分析。"));
    list.appendChild(empty);
  } else {
    view.people.slice(0, 30).forEach((person) => {
      const item = el("button", `sb-rw-acquisition-person${person.id === activePerson?.id ? " is-selected" : ""}`);
      item.type = "button";
      item.dataset.prospectId = person.id;
      const avatarNode = el("span", "sb-rw-acquisition-avatar");
      mountAcquisitionPersonAvatar(avatarNode, person);
      const content = el("span", "sb-rw-acquisition-person-content");
      const top = el("span", "sb-rw-acquisition-person-top");
      top.append(el("strong", null, person.nickname), el("b", null, liveDanmakuIntentLabel(person)));
      const meta = el("span", "sb-rw-acquisition-person-meta");
      meta.append(el("span", null, `${person.danmakuCount} 条弹幕`), el("span", "sb-rw-acquisition-source", person.topics?.slice(0, 2).join("、") || "直播间"));
      content.append(top, meta);
      if (person.quote) content.appendChild(el("span", "sb-rw-acquisition-quote", `“${person.quote}”`));
      item.append(avatarNode, content);
      item.addEventListener("click", () => {
        state.acquisitionProspectId = person.id;
        onChange?.({ structural: true });
      });
      list.appendChild(item);
    });
  }
  body.appendChild(list);
  panel.appendChild(body);
  return panel;
}

function renderLiveDanmakuAnalysisDetailPanel(view, person) {
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-detail-panel sb-rw-live-danmaku-analysis-detail-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", person ? "意向与原始证据" : "采集进度"), el("span", "sb-rw-panel-sub", person ? liveDanmakuIntentLabel(person) : view.isFinal ? "已完成" : "持续采集中"));
  panel.appendChild(head);
  if (!person) {
    const empty = el("div", "sb-rw-acquisition-detail-empty");
    empty.append(el("i"), el("strong", null, view.isFinal ? "本场暂无可分析用户" : `${view.counts.danmaku} 条弹幕已采集`), el("span", null, view.isFinal ? "直播结束后没有返回可分析的文字弹幕。" : "直播结束后，我会在这里展示整场分析结果。"));
    panel.appendChild(empty);
    return panel;
  }
  const body = el("div", "sb-rw-acquisition-detail-body");
  const profile = el("div", "sb-rw-acquisition-detail-profile");
  const avatarNode = el("span", "sb-rw-acquisition-avatar");
  mountAcquisitionPersonAvatar(avatarNode, person);
  const profileCopy = el("div");
  profileCopy.append(el("strong", null, person.nickname), el("span", null, `直播间 · ${person.danmakuCount} 条弹幕`));
  profile.append(avatarNode, profileCopy);
  body.appendChild(profile);

  const facts = el("div", "sb-rw-live-danmaku-facts");
  [["意向判断", liveDanmakuIntentLabel(person)], ["涉及主题", person.topics?.join("、") || "尚未归纳"], ["分析目标", view.goal || "按直播间弹幕归纳问题和需求"]].forEach(([label, value]) => {
    const row = el("div", "sb-rw-live-danmaku-fact");
    row.append(el("span", null, label), el("strong", null, value));
    facts.appendChild(row);
  });
  body.appendChild(facts);

  const evidence = el("section", "sb-rw-live-danmaku-evidence");
  evidence.appendChild(el("h3", null, "弹幕原话"));
  if (person.evidence?.length) {
    person.evidence.slice(-6).forEach((item) => evidence.appendChild(el("p", null, `“${item.quote}”`)));
  } else {
    evidence.appendChild(el("p", "sb-rw-acquisition-detail-muted", "原始弹幕暂未回传"));
  }
  body.appendChild(evidence);
  panel.appendChild(body);
  return panel;
}

function renderLiveDanmakuAnalysisWorksite(selected, state, onChange) {
  const view = liveDanmakuAnalysisRealtimeView(selected.liveWork || {});
  const person = acquisitionSelectedPerson({ people: view.people }, state);
  return {
    liveRoomPanel: renderLiveDanmakuLiveRoomPanel(selected, state, "直播间分析现场", "持续采集弹幕 · 直播结束后统一 AI 分析"),
    queuePanel: renderLiveDanmakuAnalysisQueuePanel(view, person, state, onChange),
    detailPanel: renderLiveDanmakuAnalysisDetailPanel(view, person)
  };
}

function renderLiveDanmakuOutreachWorksite(selected, state, onChange) {
  const panels = renderLiveDanmakuOutreachPanels(selected, state, onChange);
  return {
    liveRoomPanel: renderLiveDanmakuLiveRoomPanel(selected, state, "", "", { showHeader: false, showStatus: false }),
    ...panels
  };
}

function viralRealtimeMetricValue(value) {
  if (value === null || value === undefined || value === "") return "未返回";
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("zh-CN") : String(value);
}

function renderViralWorkAnalysisSourcePanel(view) {
  const panel = el("article", "sb-rw-panel sb-rw-viral-source-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "作品输入与分析进度"), el("span", "sb-rw-panel-sub", view.status === "running" ? "执行中" : view.status === "failed" ? "异常" : "已回传"));
  panel.appendChild(head);
  const body = el("div", "sb-rw-viral-source-body");
  const source = el("div", "sb-rw-viral-source-link");
  source.appendChild(el("span", null, "分析作品"));
  if (/^https?:\/\//i.test(view.sourceUrl)) {
    const link = el("a", null, view.sourceUrl);
    link.href = view.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    source.appendChild(link);
  } else source.appendChild(el("strong", null, view.sourceUrl || "等待作品链接"));
  body.appendChild(source);
  if (view.goal) body.appendChild(el("div", "sb-rw-viral-goal", `分析目标：${view.goal}`));
  if (view.status === "running") {
    const progress = el("div", "sb-rw-viral-progress");
    const fill = el("i");
    fill.style.width = `${Math.max(0, Math.min(96, view.progress || 0))}%`;
    progress.appendChild(fill);
    body.append(progress, el("div", "sb-rw-viral-progress-meta", `${Math.max(0, view.progress || 0)}% · ${view.phase || view.summary}`));
  } else if (view.status === "failed" || view.status === "error") {
    body.appendChild(el("div", "sb-rw-viral-error", view.summary || "分析失败"));
  } else {
    body.appendChild(el("div", "sb-rw-viral-complete", view.artifact ? "报告已生成并同步到文件中心" : "分析结果已回传"));
  }
  const steps = el("div", "sb-rw-viral-process");
  view.steps.forEach((step) => {
    const done = ["completed", "succeeded", "success", "done"].includes(step.status.toLowerCase());
    const row = el("div", `sb-rw-viral-process-row${done ? " is-done" : ""}`);
    row.append(el("i", null, done ? "✓" : "·"), el("span", null, step.title), el("small", null, done ? "完成" : step.status === "running" ? "进行中" : "待处理"));
    steps.appendChild(row);
  });
  body.appendChild(steps);
  panel.appendChild(body);
  return panel;
}

function renderViralWorkAnalysisReportPanel(view) {
  const panel = el("article", "sb-rw-panel sb-rw-viral-report-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "分析报告"), el("span", "sb-rw-panel-sub", view.hasResult ? "真实结果" : "等待回传"));
  panel.appendChild(head);
  const body = el("div", "sb-rw-viral-report-body");
  if (!view.hasResult) {
    const empty = el("div", "sb-rw-acquisition-detail-empty");
    empty.append(el("i"), el("strong", null, "分析完成后，报告会显示在这里"), el("span", null, "视频事实、互动数据、评论证据和可复用打法会按层次整理。"));
    body.appendChild(empty);
    panel.appendChild(body);
    return panel;
  }
  body.appendChild(el("p", "sb-rw-viral-report-summary", view.summary));
  const metrics = el("div", "sb-rw-viral-report-metrics");
  [[view.metrics.views, "播放量"], [view.metrics.likes, "点赞"], [view.metrics.comments, "评论"], [view.metrics.shares, "分享"], [view.metrics.interactionRate == null ? "未返回" : `${view.metrics.interactionRate}%`, "可见互动率"]].forEach(([value, label]) => {
    const item = el("div", "sb-rw-viral-report-metric");
    item.append(el("strong", null, viralRealtimeMetricValue(value)), el("span", null, label));
    metrics.appendChild(item);
  });
  body.appendChild(metrics);
  const work = view.work || {};
  const content = view.result.content || {};
  const facts = el("div", "sb-rw-viral-report-facts");
  [["作品", work.title || work.description], ["作者", work.author?.name], ["开头抓手", content.hook], ["下一步验证", view.result.recommendations?.nextTests?.[0]]].filter(([, value]) => value).forEach(([label, value]) => facts.appendChild(el("div", null, `${label}：${value}`)));
  body.appendChild(facts);
  if (view.artifact) body.appendChild(el("div", "sb-rw-viral-artifact", `已生成报告：${view.artifact}`));
  panel.appendChild(body);
  return panel;
}

function renderViralWorkAnalysisWorksite(selected) {
  const view = viralWorkAnalysisRealtimeView(selected.liveWork || {});
  return {
    sourcePanel: renderViralWorkAnalysisSourcePanel(view),
    reportPanel: renderViralWorkAnalysisReportPanel(view)
  };
}

async function loadAcquisitionReceptionConversations(selected, state) {
  if (state.stylePreview) return;
  const accountId = selected?.liveWork?.metadata?.accountId || state.accountId;
  if (!accountId || state.receptionConversationLoads?.has(accountId)) return;
  state.receptionConversationLoads ||= new Set();
  state.receptionConversationLoads.add(accountId);
  try {
    const result = await receptionRequest(accountId, { operation: "/conversations" });
    const conversations = Array.isArray(result?.conversations) ? result.conversations : [];
    state.receptionConversations = Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation]));
    if (!state.disposed && acquisitionWorkViewFor(state) === "conversion") state.refreshView?.({ structural: true });
  } catch {
    // The acquisition snapshot remains the source for conversation content when reception state is unavailable.
  } finally {
    state.receptionConversationLoads.delete(accountId);
  }
}

function renderAcquisitionFullDesktopView(selected, state) {
  const work = selected.liveWork || {};
  const replay = state.cloudViewerReplays.get(selected.id);
  const replayPresentation = cloudReplayPresentation(replay, work);
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-full-desktop-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "私信触达"), el("span", "sb-rw-panel-sub", "完整云电脑工作画面"));
  panel.appendChild(head);
  const wrap = el("div", "sb-rw-acquisition-full-desktop-wrap");
  const replayStage = el("div", "sb-rw-cloud-replay-stage sb-rw-acquisition-full-desktop-replay");
  if (!replay) {
    replayStage.append(el("div", "sb-rw-cloud-replay-empty", replayPresentation.emptyText));
  } else if (replay.segments?.length) {
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    let index = 0;
    const play = () => {
      const current = replay.segments[index % replay.segments.length];
      video.src = current.url;
      video.setAttribute("aria-label", current.segment.title || "私信触达完整桌面录屏");
      video.play?.().catch?.(() => {});
    };
    video.addEventListener("ended", () => { index = (index + 1) % replay.segments.length; play(); });
    replayStage.appendChild(video);
    play();
  } else {
    replayStage.append(el("div", "sb-rw-cloud-replay-empty", replay.error ? "私信触达录屏暂时无法读取" : replayPresentation.emptyText));
  }
  wrap.appendChild(replayStage);
  panel.appendChild(wrap);
  return panel;
}

function renderOutreachSpecialistPerson(person, activePerson, state, onChange) {
  const selected = person.id === activePerson?.id;
  const item = el("button", `sb-rw-outreach-specialist-person${selected ? " is-selected" : ""}`);
  item.type = "button";
  item.setAttribute("aria-pressed", selected ? "true" : "false");
  const avatar = el("span", "sb-rw-acquisition-avatar");
  mountAcquisitionPersonAvatar(avatar, person);
  const copy = el("span", "sb-rw-outreach-specialist-copy");
  const top = el("span", "sb-rw-outreach-specialist-top");
  const stateLabel = person.outreachState === "sent" ? "已触达" : "待触达";
  top.append(
    el("strong", null, person.nickname || "未命名用户"),
    el("span", `sb-rw-outreach-specialist-state${person.outreachState === "sent" ? " is-sent" : ""}`, stateLabel)
  );
  const source = [person.sourceLabel, person.workTitle].filter(Boolean).join(" · ") || "来源待确认";
  copy.append(top, el("span", "sb-rw-outreach-specialist-source", source));
  if (person.quote) copy.appendChild(el("span", "sb-rw-outreach-specialist-quote", `“${person.quote}”`));
  const note = person.outreachState === "sent"
    ? acquisitionText(person.touchContent) || "已发送，等待对方回复"
    : acquisitionText(person.reason) || "已进入触达队列，等待执行";
  copy.appendChild(el("span", `sb-rw-outreach-specialist-note${person.outreachState === "sent" ? " is-sent" : ""}`, note));
  item.append(avatar, copy);
  item.addEventListener("click", () => {
    state.acquisitionProspectId = person.id;
    onChange?.({ structural: true });
  });
  return item;
}

function renderOutreachSpecialistGroup(label, people, activePerson, state, onChange) {
  const group = el("section", "sb-rw-outreach-specialist-group");
  const heading = el("div", "sb-rw-outreach-specialist-group-head");
  heading.append(el("span", null, label), el("b", null, `${people.length} 位`));
  group.appendChild(heading);
  if (!people.length) {
    group.appendChild(el("div", "sb-rw-outreach-specialist-empty", label === "待触达" ? "暂时没有等待触达的互动用户" : "还没有成功触达记录"));
    return group;
  }
  people.forEach((person) => group.appendChild(renderOutreachSpecialistPerson(person, activePerson, state, onChange)));
  return group;
}

function renderOutreachSpecialistList(people, activePerson, state, onChange, emptyText) {
  const list = el("div", "sb-rw-outreach-specialist-list");
  if (!people.length) {
    list.appendChild(el("div", "sb-rw-outreach-specialist-empty", emptyText));
    return list;
  }
  people.forEach((person) => list.appendChild(renderOutreachSpecialistPerson(person, activePerson, state, onChange)));
  return list;
}

function renderOutreachSpecialistWorksite(selected, state, onChange) {
  const work = selected.liveWork || {};
  const rows = commentAcquisitionOutreachRows(work);
  const pending = rows.filter((person) => person.outreachState !== "sent");
  const sent = rows.filter((person) => person.outreachState === "sent");
  const activePerson = acquisitionSelectedPerson({ people: rows }, state);

  const prospectPanel = el("article", "sb-rw-panel sb-rw-outreach-specialist-prospect-panel");
  const prospectHead = el("div", "sb-rw-panel-head");
  prospectHead.append(
    el("div", "sb-rw-panel-title", "潜客名单"),
    el("span", "sb-rw-panel-sub", `${pending.length} 位待触达 · ${sent.length} 位已触达`)
  );
  prospectPanel.appendChild(prospectHead);
  const list = el("div", "sb-rw-outreach-specialist-list");
  list.append(
    renderOutreachSpecialistGroup("待触达", pending, activePerson, state, onChange),
    renderOutreachSpecialistGroup("已触达", sent, activePerson, state, onChange)
  );
  prospectPanel.appendChild(list);

  const replay = state.cloudViewerReplays.get(selected.id);
  const replayPresentation = cloudReplayPresentation(replay, work);
  const replayPanel = el("article", "sb-rw-panel sb-rw-outreach-specialist-replay-panel");
  const replayHead = el("div", "sb-rw-panel-head");
  replayHead.append(
    el("div", "sb-rw-panel-title", "最近成功触达回放"),
    el("span", "sb-rw-panel-sub", "最近成功工作的 15 秒录屏")
  );
  replayPanel.appendChild(replayHead);
  const replayWrap = el("div", "sb-rw-outreach-specialist-replay-wrap");
  const replayStage = el("div", "sb-rw-cloud-replay-stage sb-rw-outreach-specialist-replay-stage");
  if (!replay) {
    replayStage.appendChild(el("div", "sb-rw-cloud-replay-empty", replayPresentation.emptyText));
  } else if (replay.segments?.length) {
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    let index = 0;
    const play = () => {
      const current = replay.segments[index % replay.segments.length];
      video.src = current.url;
      video.setAttribute("aria-label", current.segment.title || "最近成功触达工作录屏");
      video.play?.().catch?.(() => {});
    };
    video.addEventListener("ended", () => { index = (index + 1) % replay.segments.length; play(); });
    replayStage.appendChild(video);
    play();
  } else {
    replayStage.appendChild(el("div", "sb-rw-cloud-replay-empty", replay.error ? "触达录屏暂时无法读取" : replayPresentation.emptyText));
  }
  const focus = el("div", "sb-rw-outreach-specialist-focus");
  if (activePerson) {
    const avatar = el("span", "sb-rw-acquisition-avatar");
    mountAcquisitionPersonAvatar(avatar, activePerson);
    const copy = el("div", "sb-rw-outreach-specialist-focus-copy");
    const status = activePerson.outreachState === "sent" ? "已触达" : "待触达";
    copy.append(
      el("strong", null, `当前查看：${activePerson.nickname || "未命名用户"} · ${status}`),
      el("span", null, [activePerson.sourceLabel, activePerson.workTitle].filter(Boolean).join(" · ") || "来源待确认")
    );
    focus.append(avatar, copy);
  } else {
    focus.appendChild(el("span", null, "当前没有可展示的潜客"));
  }
  replayWrap.append(replayStage, focus);
  replayPanel.appendChild(replayWrap);

  return { prospectPanel, replayPanel };
}

function renderLiveDanmakuOutreachPanels(selected, state, onChange) {
  const work = selected.liveWork || {};
  const rows = liveDanmakuOutreachRows(work);
  const pending = rows.filter((person) => person.outreachState !== "sent");
  const sent = rows.filter((person) => person.outreachState === "sent");
  const activePerson = acquisitionSelectedPerson({ people: rows }, state);

  const pendingPanel = el("article", "sb-rw-panel sb-rw-live-danmaku-outreach-pending-panel");
  const pendingHead = el("div", "sb-rw-panel-head");
  pendingHead.append(
    el("div", "sb-rw-panel-title", "直播弹幕"),
    el("span", "sb-rw-panel-sub", `${pending.length} 位待触达`)
  );
  pendingPanel.append(pendingHead, renderOutreachSpecialistList(pending, activePerson, state, onChange, "暂无待触达弹幕"));

  const sentPanel = el("article", "sb-rw-panel sb-rw-live-danmaku-outreach-sent-panel");
  const sentHead = el("div", "sb-rw-panel-head");
  sentHead.append(
    el("div", "sb-rw-panel-title", "已触达列表"),
    el("span", "sb-rw-panel-sub", `${sent.length} 位`)
  );
  sentPanel.append(sentHead, renderOutreachSpecialistList(sent, activePerson, state, onChange, "还没有成功触达记录"));

  return { pendingPanel, sentPanel };
}

function acquisitionLiveRoomVideoUrl(work = {}) {
  const metadata = acquisitionObject(work.metadata);
  const snapshot = acquisitionSnapshotFor(work);
  const result = acquisitionObject(snapshot.resultSnapshot || snapshot.snapshot);
  const lastScan = acquisitionObject(snapshot.lastScan || result.lastScan);
  const candidates = [
    work.liveRoomVideoUrl, work.live_room_video_url,
    metadata.liveRoomVideoUrl, metadata.live_room_video_url,
    snapshot.liveRoomVideoUrl, snapshot.live_room_video_url,
    result.liveRoomVideoUrl, result.live_room_video_url,
    lastScan.liveRoomVideoUrl, lastScan.live_room_video_url,
    acquisitionObject(snapshot.liveRoom).videoUrl,
    acquisitionObject(snapshot.live_room).video_url
  ];
  return candidates.map((value) => acquisitionText(value)).find((value) => /^(https?:|\/|blob:)/.test(value)) || "";
}

function renderCommentAcquisitionLiveRoomStage(replay, replayPresentation, work = {}) {
  const stage = el("div", "sb-rw-live-room-stage");
  const videoUrl = acquisitionLiveRoomVideoUrl(work);
  const image = document.createElement("img");
  image.className = "sb-rw-live-room-fallback";
  const mockLiveRoomImage = work?.metadata?.mock
    ? acquisitionText(work.metadata.mockLiveRoomImage)
    : "";
  image.src = mockLiveRoomImage || DOUYIN_LIVE_ROOM_IMAGE;
  image.alt = "直播间工作现场";
  image.decoding = "async";
  image.loading = "eager";
  const mountFallback = () => {
    stage.replaceChildren(image);
  };

  if (replay?.segments?.length) {
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    let index = 0;
    const play = () => {
      const current = replay.segments[index % replay.segments.length];
      video.src = current.url;
      video.setAttribute("aria-label", current.segment.title || "最近一次成功工作的直播间录屏");
      const result = video.play?.();
      result?.catch?.(() => {});
    };
    video.addEventListener("ended", () => { index = (index + 1) % replay.segments.length; play(); });
    video.addEventListener("error", mountFallback, { once: true });
    stage.appendChild(video);
    play();
    return stage;
  }

  if (videoUrl) {
    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "直播间工作现场");
    video.addEventListener("error", mountFallback, { once: true });
    stage.appendChild(video);
  } else {
    mountFallback();
  }

  if (!replay?.segments?.length && !videoUrl && replayPresentation?.mode === "waiting") {
    stage.appendChild(el("div", "sb-rw-live-room-waiting", replayPresentation.emptyText));
  }
  return stage;
}

function renderCommentAcquisitionQueuePanel(selected, state, onChange) {
  const work = selected.liveWork || {};
  const recovery = authorizationRecoveryForWork(work);
  const view = commentAcquisitionRealtimeView(work);
  const people = commentAcquisitionQueueRows(work);
  const activePerson = acquisitionSelectedPerson({ people }, state);
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-queue-panel");
  const head = el("div", "sb-rw-panel-head sb-rw-acquisition-head");
  const heading = el("div");
  const title = el("div", "sb-rw-panel-title");
  title.append(el("span", null, "实施工作队列"));
  if (work.metadata?.mock) title.append(el("span", "sb-rw-mock-badge", "MOCK"));
  heading.append(title);
  const running = el("span", "sb-rw-acquisition-running");
  running.append(el("i"), el("span", null, recovery ? recovery.label : work.lastError ? "需要处理" : people.length ? `${people.length}位潜客正在同时推进` : "等待潜客进入队列"));
  head.append(heading, running);
  panel.appendChild(head);

  const isEmpty = !people.length;
  const body = el("div", `sb-rw-acquisition-queue-body${isEmpty ? " is-empty" : ""}`);
  const list = el("div", "sb-rw-acquisition-people");
  if (!isEmpty) {
    people.slice(0, 8).forEach((person) => {
      const item = el("button", `sb-rw-acquisition-person${person.id === activePerson?.id ? " is-selected" : ""}`);
      item.type = "button";
      item.dataset.prospectId = person.id;
      const avatarNode = el("span", "sb-rw-acquisition-avatar");
      mountAcquisitionPersonAvatar(avatarNode, person);
      const content = el("span", "sb-rw-acquisition-person-content");
      const top = el("span", "sb-rw-acquisition-person-top");
      top.append(el("strong", null, `${person.nickname} · ${commentAcquisitionIntentLabel(person)}`));
      const meta = el("span", "sb-rw-acquisition-person-meta");
      const progress = el("span", `sb-rw-acquisition-progress is-${person.touchProgressState}`);
      progress.append(el("i"), el("span", null, person.touchProgressLabel));
      meta.append(progress, el("span", "sb-rw-acquisition-source", person.queueSourceLabel));
      content.append(top, meta);
      if (person.quote) content.appendChild(el("span", "sb-rw-acquisition-quote", `“${person.quote}”`));
      item.append(avatarNode, content);
      item.addEventListener("click", () => {
        state.acquisitionProspectId = person.id;
        updateAcquisitionQueueSelection(panel, selected, state);
      });
      list.appendChild(item);
    });
  }

  if (isEmpty) {
    const status = el("div", "sb-rw-acquisition-queue-status");
    status.append(el("i"), el("strong", null, recovery ? recovery.label : view.hasSnapshot ? "等待潜客进入队列" : "等待第一批潜客回传"));
    body.appendChild(status);
    const list = el("div", "sb-rw-acquisition-people");
    const empty = el("div", "sb-rw-acquisition-empty");
    empty.append(
      el("i"),
      el("strong", null, recovery ? "先重新连接抖音账号" : "正在等待符合条件的人"),
      el("span", null, recovery?.detail || view.latestActivity || "持续分析作品评论，发现真实高意向用户后会显示在这里。")
    );
    list.appendChild(empty);
    body.appendChild(list);
  } else {
    body.appendChild(list);
  }
  if (!isEmpty || work.lastError) body.appendChild(renderCommentAcquisitionControls(selected, state, onChange));
  panel.appendChild(body);
  return panel;
}

function renderCommentAcquisitionDetailPanel(selected, state) {
  const work = selected.liveWork || {};
  const view = { people: commentAcquisitionQueueRows(work) };
  const person = acquisitionSelectedPerson(view, state);
  const panel = el("article", "sb-rw-panel sb-rw-acquisition-detail-panel");
  const head = el("div", "sb-rw-panel-head");
  const title = el("div", "sb-rw-panel-title");
  title.append(el("span", null, "当前处理的潜客"));
  if (work.metadata?.mock) title.append(el("span", "sb-rw-mock-badge", "MOCK"));
  head.append(title, el("span", "sb-rw-panel-sub", person ? person.outreachStateLabel : "等待找到潜客"));
  panel.appendChild(head);
  if (!person) {
    const empty = el("div", "sb-rw-acquisition-detail-empty");
    empty.append(el("i"), el("strong", null, "找到潜客后，详情会显示在这里"), el("span", null, "来源内容、意向判断和触达进展都会按顺序记录。"));
    panel.appendChild(empty);
    return panel;
  }
  const detail = commentAcquisitionDetailModel(person);
  const body = el("div", "sb-rw-acquisition-detail-body");
  const profile = el("div", "sb-rw-acquisition-detail-profile");
  const avatarNode = el("span", "sb-rw-acquisition-avatar");
  mountAcquisitionPersonAvatar(avatarNode, person);
  const profileCopy = el("div");
  const sourceRaw = `${detail.evidence.sourceLabel} ${detail.evidence.workTitle}`.toLowerCase();
  const sourceKind = /直播|弹幕|live|danmaku/.test(sourceRaw) ? "弹幕" : /评论|comment|review/.test(sourceRaw) ? "评论" : detail.evidence.sourceLabel;
  const sourceReference = detail.evidence.sourceReference || detail.evidence.workTitle || detail.evidence.sourceLabel;
  const profileMeta = el("span", null, [detail.judgment.label, sourceKind, sourceReference].filter(Boolean).join(" · "));
  profileCopy.append(el("strong", null, person.nickname), profileMeta);
  profile.append(avatarNode, profileCopy);
  body.appendChild(profile);

  const timeline = el("div", "sb-rw-acquisition-detail-timeline");
  detail.flow.forEach((flowStep) => {
    const step = el("section", `sb-rw-acquisition-detail-step is-${flowStep.state}`);
    step.appendChild(el("i"));
    const copy = el("div", "sb-rw-acquisition-detail-step-copy");
    const stepHead = el("div", "sb-rw-acquisition-detail-step-head");
    stepHead.append(el("strong", null, flowStep.title), el("span", `sb-rw-acquisition-detail-step-state is-${flowStep.state}`, flowStep.detail));
    copy.appendChild(stepHead);

    if (flowStep.key === "discovered") {
      const factRows = acquisitionDetailFactEntries(detail, sourceKind);
      if (factRows.length) {
        const facts = el("div", "sb-rw-acquisition-detail-fact-list");
        factRows.forEach(([label, value]) => {
        const fact = el("div", "sb-rw-acquisition-detail-fact");
        fact.append(el("span", null, label), el("p", null, value));
        facts.appendChild(fact);
        });
        copy.appendChild(facts);
      }
    }

    if (flowStep.key === "judged") {
      const judgment = el("div", "sb-rw-acquisition-detail-judgment");
      judgment.append(el("span", null, "意向判断"));
      const basis = el("ul", "sb-rw-acquisition-detail-basis");
      [detail.judgment.reason, ...detail.judgment.signals].filter(Boolean).forEach((item) => basis.appendChild(el("li", null, item)));
      if (basis.childElementCount) {
        judgment.append(el("span", null, "判断依据"), basis);
      }
      if (detail.judgment.signals.length) {
        const signals = el("div", "sb-rw-acquisition-detail-signals");
        detail.judgment.signals.forEach((signal) => signals.appendChild(el("span", null, signal)));
        judgment.append(el("span", null, "相关信号"), signals);
      }
      if (!basis.childElementCount) judgment.appendChild(el("p", "sb-rw-acquisition-detail-muted", "等待补充判断依据"));
      copy.appendChild(judgment);
      const decision = el("div", "sb-rw-acquisition-detail-decision");
      decision.append(el("span", null, "最终判断"), el("strong", null, detail.judgment.label));
      copy.append(decision, el("p", "sb-rw-acquisition-detail-recommendation", detail.judgment.recommendation));
    }

    if (flowStep.key === "outreach") {
      copy.appendChild(el("div", "sb-rw-acquisition-detail-section-label", "话术生成与触达"));
      if (detail.outreach.message) {
        const outbound = el("div", "sb-rw-acquisition-detail-message is-outbound");
        outbound.append(el("span", null, "话术内容"), el("p", null, detail.outreach.message));
        copy.appendChild(outbound);
      } else {
        copy.appendChild(el("p", "sb-rw-acquisition-detail-muted", "尚未发送私信"));
      }
      if (detail.outreach.reply) {
        const inbound = el("div", "sb-rw-acquisition-detail-message is-inbound");
        inbound.append(el("span", null, "对方回复"), el("p", null, detail.outreach.reply));
        copy.appendChild(inbound);
      }
      if (detail.outreach.basis.length) {
        const basis = el("div", "sb-rw-acquisition-detail-generation-basis");
        basis.appendChild(el("span", null, "生成依据"));
        const list = el("ul", "sb-rw-acquisition-detail-basis");
        detail.outreach.basis.forEach((item) => list.appendChild(el("li", null, item)));
        basis.appendChild(list);
        copy.appendChild(basis);
      }
    }

    if (flowStep.key === "capture") {
      if (detail.capture.fields.length) {
        const captureFields = el("div", "sb-rw-acquisition-detail-capture-fields");
        detail.capture.fields.forEach((field) => {
          const item = el("div");
          item.append(el("span", null, field.label), el("strong", null, field.value));
          captureFields.appendChild(item);
        });
        copy.appendChild(captureFields);
      } else {
        copy.appendChild(el("p", "sb-rw-acquisition-detail-muted", "结果尚未确认，等待对方留下联系方式"));
      }
      if (detail.capture.quote) copy.appendChild(el("p", "sb-rw-acquisition-detail-capture-quote", `“${detail.capture.quote}”`));
    }

    step.appendChild(copy);
    timeline.appendChild(step);
  });
  body.appendChild(timeline);
  panel.appendChild(body);
  return panel;
}

function inboxConversationStatusClass(row = {}) {
  return ["handoff", "pending", "pending_approval", "skipped"].includes(String(row.status || "").toLowerCase()) ? "is-handoff" : "";
}

function renderInboxFunnel(work) {
  const metrics = inboxRealtimeMetrics(work);
  const steps = [
    ["进入私信人数", metrics.entered, ""],
    ["回复率", `${metrics.replyRate}%`, ""],
    ["回复数", metrics.replied, ""],
    ["回复留资率", `${metrics.captureRate}%`, ""],
    ["留资数", metrics.captured, "is-accent"]
  ];
  const funnel = el("div", "sb-rw-inbox-funnel");
  steps.forEach(([label, value, className]) => {
    const step = el("div", `sb-rw-inbox-funnel-step${className ? ` ${className}` : ""}`);
    step.append(el("span", null, label), el("strong", null, String(value)));
    funnel.appendChild(step);
  });
  return funnel;
}

function renderInboxAvatar(container, nickname) {
  const name = inboxText(nickname, "用户");
  container.textContent = Array.from(name)[0] || "用";
  container.setAttribute("aria-label", `${name}头像`);
}

function renderInboxConversationList(list, rows, selectedId, onSelect) {
  list.textContent = "";
  if (!rows.length) {
    list.appendChild(el("div", "sb-rw-inbox-no-results", "暂未收到符合条件的私信"));
    return;
  }
  rows.forEach((row) => {
    const item = el("button", `sb-rw-inbox-thread${row.id === selectedId ? " is-selected" : ""}`);
    item.type = "button";
    const avatar = el("span", "sb-rw-inbox-thread-avatar");
    renderInboxAvatar(avatar, row.nickname);
    const copy = el("span", "sb-rw-inbox-thread-copy");
    const top = el("span", "sb-rw-inbox-thread-top");
    top.append(el("strong", null, row.nickname), el("time", null, inboxTimeLabel(row.timestamp)));
    const status = el("span", `sb-rw-inbox-thread-bottom ${inboxConversationStatusClass(row)}`);
    status.append(el("i"), el("span", null, row.statusLabel));
    copy.append(top, el("span", "sb-rw-inbox-thread-message", row.latestMessage || "等待消息内容"), status);
    item.append(avatar, copy);
    item.addEventListener("click", () => onSelect(row.id));
    list.appendChild(item);
  });
}

function renderInboxChat(selectedRow, work) {
  const chat = el("section", "sb-rw-inbox-chat");
  if (!selectedRow) {
    const empty = el("div", "sb-rw-inbox-workbench-empty");
    empty.append(el("i"), el("strong", null, "等待新的真实私信"), el("span", null, "收到私信后，会在这里展示完整对话和自动回复结果。"));
    chat.appendChild(empty);
    return chat;
  }
  const head = el("div", "sb-rw-inbox-chat-head");
  const avatar = el("span", "sb-rw-inbox-chat-avatar");
  renderInboxAvatar(avatar, selectedRow.nickname);
  const copy = el("div", "sb-rw-inbox-chat-head-copy");
  copy.append(el("strong", null, selectedRow.nickname), el("span", null, `${selectedRow.messageCount} 条私信 · 抖音私信`));
  const status = el("span", `sb-rw-inbox-chat-status ${inboxConversationStatusClass(selectedRow)}`);
  status.append(el("i"), el("span", null, selectedRow.statusLabel));
  head.append(avatar, copy, status);
  chat.appendChild(head);

  const body = el("div", "sb-rw-inbox-chat-body");
  const timeline = inboxConversationTimeline(work, selectedRow.id);
  if (!timeline.length) {
    body.appendChild(el("div", "sb-rw-inbox-workbench-empty", "暂无可展示的消息内容"));
  } else {
    let previousDate = "";
    timeline.forEach((entry) => {
      const dateLabel = inboxTimeLabel(entry.timestamp).split(" ")[0];
      if (dateLabel !== previousDate) {
        body.appendChild(el("div", "sb-rw-inbox-date", dateLabel));
        previousDate = dateLabel;
      }
      const row = el("div", `sb-rw-inbox-bubble-row${entry.direction === "out" ? " is-out" : ""}`);
      const bubble = el("div", "sb-rw-inbox-bubble");
      bubble.append(el("div", null, entry.content), el("div", "sb-rw-inbox-bubble-meta", `${entry.direction === "out" ? "AI 自动回复" : "客户"} · ${inboxTimeLabel(entry.timestamp)}`));
      row.appendChild(bubble);
      body.appendChild(row);
    });
  }
  chat.appendChild(body);
  const composer = el("div", "sb-rw-inbox-composer");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "自动回复 Agent 正在监听新私信";
  input.disabled = true;
  const human = el("button", "sb-rw-inbox-human", "转人工处理");
  human.type = "button";
  human.disabled = !["handoff", "pending", "pending_approval", "skipped"].includes(String(selectedRow.status || "").toLowerCase());
  composer.append(input, human);
  chat.appendChild(composer);
  return chat;
}

function renderInboxDetails(selectedRow, selected) {
  const details = el("aside", "sb-rw-inbox-details");
  if (!selectedRow) {
    const empty = el("div", "sb-rw-inbox-workbench-empty");
    empty.append(el("i"), el("strong", null, "选择会话查看客户详情"), el("span", null, "客户状态、来源和对话内容会在这里同步。"));
    details.appendChild(empty);
    return details;
  }
  const head = el("div", "sb-rw-inbox-details-head");
  const avatar = el("span", "sb-rw-inbox-detail-avatar");
  renderInboxAvatar(avatar, selectedRow.nickname);
  const headCopy = el("div");
  headCopy.append(el("strong", null, selectedRow.nickname), el("span", null, "抖音私信用户"));
  head.append(avatar, headCopy);
  details.appendChild(head);

  const overview = el("section", "sb-rw-inbox-detail-section");
  overview.appendChild(el("h3", null, "客户详情"));
  [["状态", selectedRow.statusLabel], ["线索来源", "抖音私信"], ["承接账号", inboxText(selected.liveWork?.metadata?.accountName, selected.liveWork?.metadata?.accountLabel, "当前账号")]].forEach(([label, value]) => {
    const fact = el("div", "sb-rw-inbox-detail-fact");
    fact.append(el("span", null, label), el("strong", null, value));
    overview.appendChild(fact);
  });
  details.appendChild(overview);

  const intent = el("section", "sb-rw-inbox-detail-section");
  intent.appendChild(el("h3", null, "客户意向"));
  const intentNote = el("div", "sb-rw-inbox-detail-note", selectedRow.latestMessage || "暂未识别客户意向");
  intent.appendChild(intentNote);
  details.appendChild(intent);

  const requirement = el("section", "sb-rw-inbox-detail-section");
  requirement.appendChild(el("h3", null, "客户要求"), el("div", "sb-rw-inbox-detail-note", selectedRow.replyContent ? "已生成自动回复，等待客户继续反馈" : "暂未提取到明确要求"));
  details.appendChild(requirement);

  const adInfo = selectedRow.adInfo || selectedRow.ad || selected.liveWork?.metadata?.adInfo;
  const advertising = el("section", "sb-rw-inbox-detail-section");
  advertising.appendChild(el("h3", null, "广告信息"), el("div", "sb-rw-inbox-detail-note", adInfo || "当前私信未关联广告信息"));
  details.appendChild(advertising);
  return details;
}

function renderInboxWorkbench(selected, state, onChange) {
  const work = selected.liveWork || {};
  const rows = inboxRealtimeRows(work);
  const panel = el("article", "sb-rw-panel sb-rw-inbox-workbench");
  panel.appendChild(renderInboxFunnel(work));

  const shell = el("div", "sb-rw-inbox-shell");
  const sidebar = el("aside", "sb-rw-inbox-sidebar");
  const sidebarHead = el("div", "sb-rw-inbox-sidebar-head");
  const tabs = el("div", "sb-rw-inbox-tabs");
  const tabValues = [["all", "全部会话"], ["handoff", "转人工处理"]];
  tabValues.forEach(([value, label]) => {
    const tab = el("button", `sb-rw-inbox-tab${(state.inboxTab || "all") === value ? " is-active" : ""}`, label);
    tab.type = "button";
    tab.addEventListener("click", () => { state.inboxTab = value; state.inboxConversationId = null; onChange?.(); });
    tabs.appendChild(tab);
  });
  const tool = el("button", "sb-rw-inbox-tool", "⌘");
  tool.type = "button";
  tool.title = "刷新会话";
  tool.addEventListener("click", () => onChange?.());
  sidebarHead.append(tabs, tool);
  sidebar.appendChild(sidebarHead);

  const searchRow = el("div", "sb-rw-inbox-search-row");
  const search = document.createElement("input");
  search.className = "sb-rw-inbox-search";
  search.type = "search";
  search.value = state.inboxSearch || "";
  search.placeholder = "昵称或聊天记录";
  search.addEventListener("input", () => { state.inboxSearch = search.value; state.inboxConversationId = null; onChange?.(); });
  const filter = document.createElement("select");
  filter.className = "sb-rw-inbox-filter";
  [["all", "筛选"], ["sent", "已回复"], ["received", "待处理"], ["handoff", "已转人工"]].forEach(([value, label]) => {
    const option = document.createElement("option"); option.value = value; option.textContent = label; filter.appendChild(option);
  });
  filter.value = state.inboxFilter || "all";
  filter.addEventListener("change", () => { state.inboxFilter = filter.value; state.inboxConversationId = null; onChange?.(); });
  searchRow.append(search, filter);
  sidebar.appendChild(searchRow);

  const query = String(state.inboxSearch || "").trim().toLowerCase();
  const filterValue = state.inboxFilter || "all";
  const filteredRows = rows.filter((row) => {
    const matchesTab = state.inboxTab !== "handoff" || inboxConversationStatusClass(row) === "is-handoff";
    const matchesFilter = filterValue === "all" || (filterValue === "handoff" ? inboxConversationStatusClass(row) === "is-handoff" : String(row.status || "").toLowerCase() === filterValue);
    const matchesQuery = !query || `${row.nickname} ${row.latestMessage} ${row.replyContent}`.toLowerCase().includes(query);
    return matchesTab && matchesFilter && matchesQuery;
  });
  const selectedId = filteredRows.some((row) => row.id === state.inboxConversationId) ? state.inboxConversationId : filteredRows[0]?.id || null;
  state.inboxConversationId = selectedId;
  const threadList = el("div", "sb-rw-inbox-thread-list");
  renderInboxConversationList(threadList, filteredRows, selectedId, (id) => { state.inboxConversationId = id; onChange?.(); });
  sidebar.appendChild(threadList);
  shell.append(sidebar, renderInboxChat(filteredRows.find((row) => row.id === selectedId), work), renderInboxDetails(filteredRows.find((row) => row.id === selectedId), selected));
  panel.appendChild(shell);
  return panel;
}

function renderGenericOutputPanel(panel, selected) {
  const context = normalizeRealtimeOutputContext(selected.context);
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "任务结果摘要"), el("span", "sb-rw-panel-sub", `${selected.name} · 真实回传`));
  panel.appendChild(head);
  const body = el("div", "sb-rw-prospect-body");
  const profile = el("div", "sb-rw-prospect-profile");
  const profileAvatar = el("span", "sb-rw-profile-avatar", context.prospect.slice(0, 1));
  const profileCopy = el("div");
  profileCopy.append(el("div", "sb-rw-prospect-name", context.prospect), el("div", "sb-rw-prospect-source", context.source));
  profile.append(profileAvatar, profileCopy);
  body.appendChild(profile);
  const signals = el("div", "sb-rw-signals");
  const work = selected.liveWork;
  const rows = work ? [
    ["任务状态", statusLabel(selected.status)],
    ["当前阶段", work.phase || selected.phase || "执行中"],
    ["当前任务", work.task || selected.task || "真实任务执行中"],
    ["最近信号", context.activity],
    ["已返回产出", work.artifact || "等待真实产出"]
  ] : [
    ["当前动作", selected.action], ["当前产出", selected.output], ["下一步交接", selected.handoff], ["最近信号", context.activity]
  ];
  rows.forEach(([label, value]) => {
    const signal = el("div", "sb-rw-signal");
    signal.append(el("div", "sb-rw-signal-label", label), el("div", "sb-rw-signal-value", value));
    signals.appendChild(signal);
  });
  body.appendChild(signals);
  const detail = el("button", "sb-rw-detail", work?.artifact ? "查看成果中心" : "等待真实产出");
  detail.type = "button";
  detail.disabled = Boolean(work && !work.artifact);
  detail.addEventListener("click", openProspectResults);
  body.appendChild(detail);
  panel.appendChild(body);
}

function renderAccountAnalysisDeliveryPanel(panel, selected) {
  const work = selected.liveWork || {};
  const result = work.metadata?.result;
  const resultSummary = typeof result === "string"
    ? result
    : String(result?.summary || result?.title || result?.message || "").trim();
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "结果会发到对话"), el("span", "sb-rw-panel-sub", "抖音账号分析"));
  panel.appendChild(head);

  const body = el("div", "sb-rw-prospect-body");
  const profile = el("div", "sb-rw-prospect-profile");
  profile.append(
    el("span", "sb-rw-profile-avatar", "析"),
    el("div", null,
      el("div", "sb-rw-prospect-name", "正在分析这个账号"),
      el("div", "sb-rw-prospect-source", "完成后会把结论和依据直接发回对话")
    )
  );
  body.appendChild(profile);

  const signals = el("div", "sb-rw-signals");
  [
    ["当前任务", work.task || selected.task || "正在读取账号公开资料"],
    ["当前进度", work.phase || selected.phase || "正在整理作品和互动信息"],
    ["交付位置", "抖音账号分析对话"],
    ["已获得结果", resultSummary || "分析完成后会同步到这里"]
  ].forEach(([label, value]) => {
    const signal = el("div", "sb-rw-signal");
    signal.append(el("div", "sb-rw-signal-label", label), el("div", "sb-rw-signal-value", value));
    signals.appendChild(signal);
  });
  body.appendChild(signals);
  panel.appendChild(body);
}

function renderRoleOutputPanel(panel, selected, state, onChange) {
  if (selected.id === "mkt-research-expert" && selected.liveWork) {
    renderAccountAnalysisDeliveryPanel(panel, selected);
    return;
  }
  if (selected.liveWork) {
    renderGenericOutputPanel(panel, selected);
    return;
  }
  if (selected.id === "Search Agent") {
    renderSearchAnalysisPanel(panel, selected, selected.liveScene ? LIVE_COMMERCE_SEARCH_LEAD_FORMS : SEARCH_LEAD_FORMS);
    return;
  }
  if (selected.id === "App Agent") {
    renderOutreachStrategyPanel(panel, selected, state, onChange, selected.liveScene ? LIVE_COMMERCE_OUTREACH_CASES : OUTREACH_CASES);
    return;
  }
  const output = selected.liveScene ? LIVE_COMMERCE_OUTPUTS[selected.id] || AGENT_OUTPUTS[selected.id] : AGENT_OUTPUTS[selected.id];
  if (!output) {
    renderGenericOutputPanel(panel, selected);
    return;
  }
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", output.title), el("span", "sb-rw-panel-sub", `${selected.name} · 实时产出`));
  panel.appendChild(head);
  const body = el("div", "sb-rw-output-body");
  body.appendChild(el("div", "sb-rw-panel-sub", output.subtitle));
  const list = el("div", "sb-rw-output-list");
  const detail = el("div", "sb-rw-output-detail");
  const selectRow = (button, row) => {
    list.querySelectorAll(".sb-rw-output-row").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    detail.textContent = "";
    if (output.kind === "outreach") {
      detail.append(el("strong", null, `${row[0]} · 触达内容`), el("span", null, `“${row[1]}” · ${row[2]} · ${row[3]}`));
    } else {
      detail.append(el("strong", null, `${row[0]} · ${row[1]}`), el("span", null, `${row[2]} · 当前状态：${row[3]}`));
    }
  };
  output.rows.forEach((row, index) => {
    const button = el("button", `sb-rw-output-row${index === 0 ? " is-selected" : ""}`);
    button.type = "button";
    const copy = el("span", "sb-rw-output-main");
    copy.append(el("span", "sb-rw-output-name", row[0]), el("span", "sb-rw-output-value", row[1]));
    button.append(copy, el("span", "sb-rw-output-state", row[3]));
    button.addEventListener("click", () => selectRow(button, row));
    list.appendChild(button);
    if (index === 0) selectRow(button, row);
  });
  body.appendChild(list);
  body.appendChild(detail);
  const actions = el("div", "sb-rw-output-actions");
  const results = el("button", "sb-rw-output-action", "打开成果中心");
  results.type = "button";
  results.addEventListener("click", openProspectResults);
  actions.appendChild(results);
  if (output.kind === "outreach") {
    const pause = el("button", "sb-rw-output-action", "暂停后续触达");
    pause.type = "button";
    pause.addEventListener("click", () => { pause.textContent = "已暂停"; pause.disabled = true; });
    actions.appendChild(pause);
  }
  body.appendChild(actions);
  panel.appendChild(body);
}

const BROWSER_LEADS = Object.freeze([
  ["小雨今天喝拿铁", "这款杯子可以放洗碗机吗？", "视频评论", 0],
  ["阿泽的咖啡日记", "想入手一台，月底前能发货吗？", "直播弹幕", 1],
  ["冰美式不加糖", "奶油白和雾霾绿怎么选？", "视频评论", 2],
  ["Lily 的生活碎片", "想看看更多厨房收纳好物。", "账号主页", 3],
  ["奶油小熊", "预算一千五，适合小户型吗？", "直播间", 1]
]);

const SEARCH_LEAD_FORMS = Object.freeze([
  { name: "小雨今天喝拿铁", avatarIndex: 0, source: "视频评论", product: "自动咖啡机 · 家用小型", budget: "¥1,500–2,000", purchase: "1 周内", score: "92", intent: "高意向", action: "优先触达" },
  { name: "阿泽的咖啡日记", avatarIndex: 1, source: "直播弹幕", product: "半自动咖啡机", budget: "¥1,000–1,500", purchase: "2–4 周", score: "88", intent: "高意向", action: "优先触达" },
  { name: "冰美式不加糖", avatarIndex: 2, source: "视频评论", product: "咖啡机配色款", budget: "未明确", purchase: "未明确", score: "68", intent: "低意向", action: "待补证据" },
  { name: "Lily 的生活碎片", avatarIndex: 3, source: "账号主页", product: "厨房收纳好物", budget: "未明确", purchase: "长期关注", score: "42", intent: "低意向", action: "暂不触达" }
]);

const OUTREACH_CASES = Object.freeze([
  { name: "小雨今天喝拿铁", avatarIndex: 0, source: "意向评分 92 · 高意向", channel: "私信首触", status: "待风控", progress: 18, message: "围绕到货时间和使用场景切入，先确认她对洗碗机兼容性的关注。", next: "提交风控审核" },
  { name: "阿泽的咖啡日记", avatarIndex: 1, source: "意向评分 88 · 高意向", channel: "评论后私信", status: "已生成", progress: 54, message: "先回应月底发货，再补充半自动机型的预算和清洁成本。", next: "查看首触内容" },
  { name: "冰美式不加糖", avatarIndex: 2, source: "意向评分 68 · 低意向", channel: "暂缓触达", status: "需补证据", progress: 8, message: "尚未确认购买时间，继续补充需求证据，避免过早打扰。", next: "补充用户证据" }
]);

const LIVE_COMMERCE_BROWSER_LEADS = Object.freeze([
  ["小雨今天喝拿铁", "这款什么时候补货？月底前能收到吗？", "直播弹幕 · 20:14", 0],
  ["阿泽的咖啡日记", "刚才说的优惠还有效吗？", "直播评论 · 20:09", 1],
  ["冰美式不加糖", "奶油白和雾霾绿怎么选？", "直播间 · 19:58", 2],
  ["Lily 的生活碎片", "想看真实上身效果。", "直播弹幕 · 19:45", 3]
]);

const LIVE_COMMERCE_SEARCH_LEAD_FORMS = Object.freeze([
  { name: "小雨今天喝拿铁", avatarIndex: 0, source: "直播弹幕", product: "直播主推款 · 家用小型", budget: "¥1,500–2,000", purchase: "本周内", score: "92", intent: "高意向", action: "优先触达" },
  { name: "阿泽的咖啡日记", avatarIndex: 1, source: "直播评论", product: "半自动咖啡机", budget: "¥1,000–1,500", purchase: "2–4 周", score: "88", intent: "高意向", action: "优先触达" },
  { name: "冰美式不加糖", avatarIndex: 2, source: "直播间", product: "咖啡机配色款", budget: "未明确", purchase: "未明确", score: "68", intent: "低意向", action: "待补证据" },
  { name: "Lily 的生活碎片", avatarIndex: 3, source: "直播切片", product: "厨房收纳好物", budget: "未明确", purchase: "长期关注", score: "42", intent: "低意向", action: "暂不触达" }
]);

const LIVE_COMMERCE_OUTREACH_CASES = Object.freeze([
  { name: "小雨今天喝拿铁", avatarIndex: 0, source: "意向评分 92 · 高意向", channel: "直播后私信", status: "待风控", progress: 18, message: "围绕她在直播间问到货时间的问题，先确认收货窗口和保修需求。", next: "提交风控审核" },
  { name: "阿泽的咖啡日记", avatarIndex: 1, source: "意向评分 88 · 高意向", channel: "评论承接", status: "已生成", progress: 54, message: "先承接直播间的优惠提问，再补充适合他的机型和发货时间。", next: "查看首触内容" },
  { name: "冰美式不加糖", avatarIndex: 2, source: "意向评分 68 · 低意向", channel: "暂缓触达", status: "需补证据", progress: 8, message: "只确认了颜色偏好，继续补充购买时间，避免直播后过早打扰。", next: "补充用户证据" }
]);

function renderSearchAnalysisPanel(panel, selected, users = SEARCH_LEAD_FORMS) {
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "用户意向结果"), el("span", "sb-rw-panel-sub", `${selected.name} · 实时产出`));
  panel.appendChild(head);
  const body = el("div", "sb-rw-search-result-body");
  body.appendChild(el("div", "sb-rw-search-result-intro", "每条对象记录都保留来源和分析依据，并给出可回查的结论。"));
  const list = el("div", "sb-rw-search-user-list");
  users.forEach((user, index) => {
    const card = el("button", `sb-rw-search-user-card${index === 0 ? " is-selected" : ""}`);
    card.type = "button";
    const avatar = el("span", `sb-rw-search-user-avatar is-${user.avatarIndex}`);
    avatar.setAttribute("aria-label", `${user.name}头像`);
    const content = el("span", "sb-rw-search-user-content");
    const title = el("span", "sb-rw-search-user-title");
    title.append(el("span", null, user.name), el("span", `sb-rw-intent-tag ${user.intent === "高意向" ? "is-high" : "is-low"}`, user.intent));
    const meta = el("span", "sb-rw-search-user-meta", `${user.source} · ${user.score} 分`);
    const fields = el("span", "sb-rw-search-user-fields");
    [["关注商品", user.product], ["预算", user.budget], ["购买时间", user.purchase]].forEach(([label, value]) => {
      const field = el("span", "sb-rw-search-user-field");
      field.append(el("span", null, label), el("strong", null, value));
      fields.appendChild(field);
    });
    content.append(title, meta, fields);
    card.append(avatar, content, el("span", `sb-rw-search-user-action ${user.intent === "高意向" ? "is-high" : "is-low"}`, user.action));
    card.addEventListener("click", () => {
      list.querySelectorAll(".sb-rw-search-user-card").forEach((item) => item.classList.remove("is-selected"));
      card.classList.add("is-selected");
    });
    list.appendChild(card);
  });
  body.appendChild(list);
  const detail = el("button", "sb-rw-output-action", "打开客户结果");
  detail.type = "button";
  detail.addEventListener("click", openProspectResults);
  body.appendChild(detail);
  panel.appendChild(body);
}

function renderBrowserLeadPanel(selected, leads = BROWSER_LEADS) {
  const panel = el("article", "sb-rw-panel sb-rw-queue sb-rw-lead-panel");
  const head = el("div", "sb-rw-panel-head");
  const status = el("span", "sb-rw-lead-head-status");
  status.append(el("i"), el("span", null, selected.liveScene ? "9 位观众正在实时入池" : "9 条线索正在实时入池"));
  head.append(el("div", "sb-rw-panel-title", selected.liveScene ? "实时直播观众" : "实时商品线索"), status);
  panel.appendChild(head);
  const list = el("div", "sb-rw-lead-list");
  leads.forEach(([name, quote, source, avatarIndex], index) => {
    const item = el("div", `sb-rw-lead-item${index === 0 ? " is-selected" : ""}`);
    const avatar = el("div", `sb-rw-prospect-avatar is-${avatarIndex}`);
    avatar.setAttribute("role", "img");
    avatar.setAttribute("aria-label", `${name}头像`);
    const copy = el("div");
    const title = el("div", "sb-rw-lead-name");
    title.append(el("span", null, name), el("span", "sb-rw-lead-score", "购买表达"));
    const meta = el("div", "sb-rw-lead-meta");
    const state = el("span", "sb-rw-lead-state");
    const stage = ["已发现", "待分析", "待分析", "待验证", "待分析"][index] || "待分析";
    state.append(el("i"), el("span", null, stage));
    meta.append(state, el("span", "sb-rw-lead-source", source));
    copy.append(title, meta, el("div", "sb-rw-lead-quote", `“${quote}”`));
    item.append(avatar, copy);
    list.appendChild(item);
  });
  panel.appendChild(list);
  return panel;
}

function renderOutreachQueuePanel(selected, state, onChange, cases = OUTREACH_CASES) {
  const panel = el("article", "sb-rw-panel sb-rw-queue sb-rw-outreach-queue");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "首触审批队列"), el("span", "sb-rw-panel-sub", `${selected.name} · 触达策略`));
  panel.appendChild(head);
  const list = el("div", "sb-rw-outreach-list");
  cases.forEach((item, index) => {
    const isSelected = state.outreachSelected === index;
    const status = isSelected && state.outreachPaused ? "已暂停" : isSelected && state.outreachDecision === "已通过" ? "已通过" : item.status;
    const row = el("button", `sb-rw-outreach-item${isSelected ? " is-selected" : ""}`);
    row.type = "button";
    const identity = el("span", "sb-rw-outreach-identity");
    const avatar = el("span", `sb-rw-search-user-avatar is-${item.avatarIndex}`);
    const copy = el("span", "sb-rw-outreach-copy");
    const name = el("span", "sb-rw-outreach-name");
    name.append(el("span", null, item.name), el("span", "sb-rw-outreach-source", item.source));
    copy.append(name, el("span", "sb-rw-outreach-channel", item.channel));
    identity.append(avatar, copy);
    const stateLabel = el("span", `sb-rw-outreach-status${status === "已暂停" || status === "需补证据" ? " is-muted" : ""}`, status);
    const progress = el("span", "sb-rw-outreach-progress");
    const track = el("span");
    const fill = el("i");
    fill.style.width = `${isSelected && state.outreachDecision === "已通过" ? 72 : item.progress}%`;
    track.appendChild(fill);
    progress.append(track, stateLabel);
    row.append(identity, progress);
    row.addEventListener("click", () => {
      state.outreachSelected = index;
      state.outreachDecision = item.status;
      state.outreachPaused = false;
      state.outreachDraftState = item.status === "需补证据" ? "待补证据" : "已生成";
      onChange?.();
    });
    list.appendChild(row);
  });
  panel.appendChild(list);
  return panel;
}

function renderOutreachStrategyPanel(panel, selected, state, onChange, cases = OUTREACH_CASES) {
  const item = cases[state.outreachSelected] || cases[0];
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", selected.liveScene ? "直播首触策略" : "首触策略产出"), el("span", "sb-rw-panel-sub", `${selected.name} · 实时产出`));
  panel.appendChild(head);
  const body = el("div", "sb-rw-outreach-detail-body");
  body.appendChild(el("div", "sb-rw-search-result-intro", "触达策略师按客户证据编排首触内容、渠道和审批节点。"));

  const profile = el("div", "sb-rw-outreach-profile");
  profile.append(el("span", `sb-rw-search-user-avatar is-${item.avatarIndex}`));
  const profileCopy = el("span", "sb-rw-outreach-profile-copy");
  const profileTitle = el("span", "sb-rw-outreach-profile-title");
  profileTitle.append(el("strong", null, item.name), el("span", `sb-rw-intent-tag ${item.source.includes("高意向") ? "is-high" : "is-low"}`, item.source.includes("高意向") ? "高意向" : "低意向"));
  profileCopy.append(profileTitle, el("span", "sb-rw-search-user-meta", `${item.channel} · 评分 ${item.source.match(/\d+/)?.[0] || "--"}`));
  profile.appendChild(profileCopy);
  body.appendChild(profile);

  const facts = el("div", "sb-rw-outreach-facts");
  [["触达渠道", item.channel], ["首触依据", item.message], ["当前状态", state.outreachPaused ? "已暂停后续触达" : state.outreachDecision]].forEach(([label, value]) => {
    const fact = el("div", "sb-rw-outreach-fact");
    fact.append(el("span", null, label), el("strong", null, value));
    facts.appendChild(fact);
  });
  body.appendChild(facts);

  const timeline = el("div", "sb-rw-outreach-timeline");
  timeline.appendChild(el("div", "sb-rw-outreach-section-label", "触达动态"));
  const timelineSteps = [
    ["已识别购买信号", "已完成", "从评论、预算和购买时间提取依据"],
    ["已生成个性化首触", state.outreachDraftState, "围绕用户当前问题生成首句和跟进问题"],
    ["风控与审批", state.outreachDecision === "已通过" ? "已通过" : state.outreachDecision, "通过后才会进入后续触达执行队列"]
  ];
  timelineSteps.forEach(([title, status, detail], index) => {
    const step = el("div", `sb-rw-outreach-timeline-step${status === "已完成" || status === "已通过" ? " is-done" : ""}`);
    step.append(el("i"), el("span", "sb-rw-outreach-timeline-copy", `${title} · ${detail}`), el("strong", null, status));
    timeline.appendChild(step);
  });
  body.appendChild(timeline);

  const message = el("div", "sb-rw-outreach-message");
  message.append(el("span", null, "首触内容"), el("strong", null, `“${item.message}”`));
  body.appendChild(message);

  const actions = el("div", "sb-rw-output-actions");
  const review = el("button", "sb-rw-output-action", state.outreachDecision === "已通过" ? "已通过风控" : item.status === "需补证据" ? "补充证据" : "通过风控");
  review.type = "button";
  review.disabled = state.outreachDecision === "已通过";
  review.addEventListener("click", () => {
    if (item.status === "需补证据" && state.outreachDecision !== "已通过") {
      state.outreachDecision = "待风控";
      state.outreachDraftState = "已生成";
      state.events.unshift(`${item.name} 已补充购买证据，重新进入风控审核`);
    } else {
      state.outreachDecision = "已通过";
      state.events.unshift(`${item.name} 的首触策略已通过风控，等待进入执行队列`);
    }
    state.events = state.events.slice(0, 5);
    onChange?.();
  });
  const adjust = el("button", "sb-rw-output-action", state.outreachDraftState === "待调整" ? "已标记调整" : "调整话术");
  adjust.type = "button";
  adjust.addEventListener("click", () => {
    state.outreachDraftState = "待调整";
    state.events.unshift(`${item.name} 的首触内容已标记为待调整`);
    state.events = state.events.slice(0, 5);
    onChange?.();
  });
  const pause = el("button", "sb-rw-output-action", state.outreachPaused ? "恢复后续触达" : "暂停后续触达");
  pause.type = "button";
  pause.addEventListener("click", () => {
    state.outreachPaused = !state.outreachPaused;
    state.events.unshift(`${item.name} 的后续触达${state.outreachPaused ? "已暂停" : "已恢复"}`);
    state.events = state.events.slice(0, 5);
    onChange?.();
  });
  actions.append(review, adjust, pause);
  body.appendChild(actions);
  panel.appendChild(body);
}

function renderLiveWorkPanel(selected, state = null, onChange = null) {
  const work = selected.liveWork;
  const panel = el("article", "sb-rw-panel sb-rw-queue sb-rw-live-work-panel");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", "真实任务状态"), el("span", "sb-rw-panel-sub", `${selected.name} · ${statusLabel(selected.status)}`));
  panel.appendChild(head);
  const body = el("div", "sb-rw-live-work-body");
  const acquisition = isAcquisitionRealtimeAgent(selected.id);
  const realtime = acquisition ? acquisitionRealtimeViewModel(selected.id, work) : null;
  const completed = isCompletedLiveWork(selected, realtime);
  const recentSignal = completed
    ? String(work.activities?.at(-1) || work.artifact || "任务已完成").trim()
    : realtime?.recentSignal || "等待真实工作动态";
  body.append(
    el("strong", "sb-rw-live-work-task", realtime?.task || (acquisition ? "等待真实任务状态" : work.task || selected.task || "等待真实任务")),
    el("span", "sb-rw-live-work-phase", realtime?.phase || (acquisition ? "等待真实阶段" : work.phase || selected.phase || "等待真实阶段"))
  );
  if (realtime) {
    const meta = el("div", "sb-rw-acquisition-meta");
    [["账号", realtime.accountId || "等待真实账号"], ["云电脑", ACQUISITION_CLOUD_LABELS[realtime.cloudState] || "等待真实云电脑状态"], ["任务", completed ? "已完成" : ACQUISITION_TASK_LABELS[realtime.taskState] || "等待真实任务状态"], ["待审批", String(realtime.pendingApprovalCount)], ["重试", String(realtime.retryCount)], ["最近信号", recentSignal]].forEach(([label, value]) => {
      const item = el("div", "sb-rw-acquisition-meta-item");
      item.append(el("span", null, label), el("strong", null, value));
      meta.appendChild(item);
    });
    body.appendChild(meta);
  }
  const progressSource = work.metadata?.progressSource;
  const waitingReceipt = work.metadata?.cloudWatch === "waiting_receipt" || work.metadata?.receiptPending === true;
  const providerValue = Number(work.progress);
  if (!completed && !acquisition && progressSource === "provider" && Number.isFinite(providerValue)) {
    const progress = el("div", "sb-rw-live-work-progress");
    const track = el("div");
    const fill = el("i");
    const value = Math.max(0, Math.min(100, providerValue));
    fill.style.width = `${value}%`;
    track.appendChild(fill);
    progress.append(track, el("span", null, `${value}% · provider`));
    body.appendChild(progress);
  } else if (!completed && (!acquisition || realtime.progressMode === "indeterminate")) {
    const progress = el("div", "sb-rw-live-work-progress is-indeterminate");
    progress.append(el("div", null, ""), el("span", null, waitingReceipt ? "等待平台回执" : work.lastError ? "未完成" : "等待真实回执"));
    body.appendChild(progress);
  } else if (!completed) {
    const progress = el("div", "sb-rw-live-work-progress");
    const track = el("div");
    const fill = el("i");
    const value = Math.max(0, Math.min(100, providerValue));
    fill.style.width = `${value}%`;
    track.appendChild(fill);
    progress.append(track, el("span", null, `${value}% · provider`));
    body.appendChild(progress);
  }
  if (completed) {
    body.appendChild(el("span", "sb-rw-live-work-receipt", work.artifact ? "结果已回传" : "任务已完成"));
  } else if (!acquisition) {
    body.appendChild(el("span", "sb-rw-live-work-receipt", waitingReceipt ? "等待平台回执" : work.lastError ? "未完成" : "等待真实回执"));
  }
  const activities = el("div", "sb-rw-live-work-activities");
  const items = Array.isArray(work.activities) ? work.activities.slice(-5).reverse() : [];
  if (items.length) {
    items.forEach((activity) => {
      const className = work.lastError && activity === work.lastError ? "sb-rw-live-work-activity is-error" : "sb-rw-live-work-activity";
      activities.appendChild(el("div", className, activity));
    });
  } else {
    activities.appendChild(el("div", "sb-rw-live-work-empty", completed ? "任务已完成" : "等待真实工作动态"));
  }
  body.appendChild(activities);
  if (realtime) {
    const controls = el("div", "sb-rw-acquisition-controls");
    const adjust = el("button", "sb-rw-acquisition-control", "调整当前任务");
    adjust.type = "button";
    adjust.disabled = !realtime.taskId;
    adjust.addEventListener("click", () => {
      openAcquisitionTaskUpdateDialog({
        agentId: selected.id,
        gateway: state?.gateway,
        context: {
          taskId: realtime.taskId,
          taskRunId: realtime.taskRunId,
          accountId: realtime.accountId,
          taskVersion: work.version ?? work.taskVersion ?? work.metadata?.taskVersion ?? null
        },
        currentConfig: work,
        onSubmitted: ({ payload }) => {
          state.events = [`${selected.name}：任务策略已更新，仅对未来执行生效`, ...state.events].slice(0, 8);
          state.lastUpdatePayload = payload;
          onChange?.();
        }
      });
    });
    controls.appendChild(adjust);
    const dispatch = async (action, button) => {
      if (!state || !realtime.taskId || button.disabled) return;
      button.disabled = true;
      const actionName = action === "stop" ? "task.cancel" : action === "pause" ? "task.pause" : "task.resume";
      try {
        let gateway = state.gateway;
        if (!gateway?.action) gateway = await globalThis.__SALEBUDDY__?.gatewayReady?.catch?.(() => null);
        if (!gateway?.action) throw new Error("控制面暂不可用");
        await gateway.action(actionName, acquisitionRealtimeActionPayload(selected.id, action, work));
      } catch (error) {
        state.events = [`${selected.name}：${error?.message || "控制动作未提交"}`, ...state.events].slice(0, 8);
      } finally {
        button.disabled = false;
        onChange?.();
      }
    };
    [["暂停", "pause", !["running", "degraded"].includes(realtime.taskState)], ["恢复", "resume", !["paused", "degraded"].includes(realtime.taskState)]].forEach(([label, action, disabled]) => {
      const button = el("button", "sb-rw-acquisition-control", label);
      button.type = "button";
      button.disabled = disabled;
      button.addEventListener("click", () => { void dispatch(action, button); });
      controls.appendChild(button);
    });
    body.appendChild(controls);
  }
  panel.appendChild(body);
  return panel;
}

function renderWorkUnitPanel(selected, state, onChange) {
  if (selected.liveWork) return renderLiveWorkPanel(selected, state, onChange);
  if (selected.id === "Browser Agent") return renderBrowserLeadPanel(selected, selected.liveScene ? LIVE_COMMERCE_BROWSER_LEADS : BROWSER_LEADS);
  if (selected.id === "App Agent") return renderOutreachQueuePanel(selected, state, onChange, selected.liveScene ? LIVE_COMMERCE_OUTREACH_CASES : OUTREACH_CASES);
  const config = activeWorkUnitConfig(selected)
    || (selected.liveScene && LIVE_COMMERCE_WORK_UNITS[selected.id])
    || AGENT_WORK_UNITS[selected.id]
    || AGENT_WORK_UNITS.main;
  const panel = el("article", "sb-rw-panel sb-rw-queue");
  const head = el("div", "sb-rw-panel-head");
  head.append(el("div", "sb-rw-panel-title", config.title), el("span", "sb-rw-panel-sub", `${selected.name} · ${config.subtitle}`));
  panel.appendChild(head);
  const list = el("div", "sb-rw-queue-list");
  config.rows.forEach(([name, task, status], index) => {
    const item = el("div", `sb-rw-queue-item${index === 0 ? " is-selected" : ""}`);
    const marker = el("span", `sb-rw-status-dot${status.includes("待") || status.includes("暂") || status.includes("拦") ? " waiting" : ""}`);
    const copy = el("span", "sb-rw-queue-copy");
    const title = el("span", "sb-rw-queue-name");
    title.append(el("span", null, name), marker);
    copy.append(title, el("div", "sb-rw-queue-task", task));
    const progress = el("div", "sb-rw-queue-progress");
    const track = el("div");
    const fill = el("i");
    fill.style.width = `${Math.max(8, selected.progress - index * 13)}%`;
    track.appendChild(fill);
    progress.append(track, el("b", null, status));
    copy.appendChild(progress);
    item.append(copy);
    list.appendChild(item);
  });
  panel.appendChild(list);
  return panel;
}

function renderAccountDirectory(root, state, { onBack, onSelect }) {
  root.classList.add("sb-rw-account-directory");
  root.textContent = "";
  const directory = accountDirectoryFor(state);
  const managedCount = directory.length;
  const cloudCount = directory.reduce((total, account) => total + Math.max(1, Number(account.cloudCount) || 0), 0);
  const runningAgentCount = state.liveWorks.filter((work) => work.state !== "done" && !work.lastError).length;

  const head = el("header", "sb-rw-directory-head");
  const headCopy = el("div");
  const back = el("button", "sb-rw-directory-back", "返回实时工作");
  back.type = "button";
  back.addEventListener("click", onBack);
  headCopy.appendChild(back);
  headCopy.append(el("h1", "sb-rw-directory-title", "全部账号"), el("div", "sb-rw-directory-subtitle", `统一管理 ${managedCount} 个抖音小店账号、独立云电脑和账号级 Agent 团队。`));
  const summary = el("div", "sb-rw-directory-summary");
  [[managedCount, "托管账号"], [cloudCount, "独立云电脑"], [runningAgentCount, "运行中 Agent"]].forEach(([value, label]) => {
    const item = el("div", "sb-rw-directory-summary-item");
    item.append(el("strong", null, value), el("span", null, label));
    summary.appendChild(item);
  });
  head.append(headCopy, summary);
  root.appendChild(head);

  const toolbar = el("div", "sb-rw-directory-toolbar");
  const search = el("input", "sb-rw-directory-search");
  search.type = "search";
  search.placeholder = "搜索店铺名称或抖音号";
  search.value = state.accountSearch || "";
  const filters = el("div", "sb-rw-directory-filters");
  const filterOptions = ["全部", "已连接", "需重新登录", "已暂停"];
  const list = el("div", "sb-rw-directory-list");

  const drawList = () => {
    const query = String(state.accountSearch || "").trim().toLowerCase();
    const filter = state.accountFilter || "全部";
    const matches = directory.filter((account) => {
      const matchesQuery = !query || `${account.name} ${account.handle}`.toLowerCase().includes(query);
      return matchesQuery && (filter === "全部" || account.status === filter);
    });
    list.textContent = "";
    if (!matches.length) {
      list.appendChild(el("div", "sb-rw-directory-empty", "没有找到符合条件的账号"));
      return;
    }
    matches.forEach((account) => {
      const row = el("button", "sb-rw-directory-row");
      row.type = "button";
      const identity = el("span", "sb-rw-directory-identity");
      const avatarEl = el("span", "sb-rw-directory-avatar");
      mountAccountAvatar(avatarEl, account);
      const copy = el("span", "sb-rw-directory-copy");
      copy.append(el("span", "sb-rw-directory-name", account.name), el("span", "sb-rw-directory-handle", account.handle));
      identity.append(avatarEl, copy);
      const statusClass = account.status === "需重新登录" ? "is-warning" : account.status === "已暂停" ? "is-muted" : "";
      const status = el("span", `sb-rw-directory-status ${statusClass}`);
      status.append(el("i"), el("span", null, account.status));
      const statusCell = el("span", "sb-rw-directory-cell");
      statusCell.append(status, el("span", null, account.computer === "在线" ? "独立云电脑在线" : account.computer));
      const fans = el("span", "sb-rw-directory-cell");
      fans.append(el("strong", null, account.fans), el("span", null, "粉丝"));
      const agents = el("span", "sb-rw-directory-cell");
      const matrix = Array.isArray(account.capabilityMatrix) ? account.capabilityMatrix : [];
      const ready = matrix.filter(({ ready }) => ready).length;
      agents.append(
        el("strong", null, `${account.agents} 项`),
        el("span", null, ready ? "账号云电脑已就绪" : "尚未接入")
      );
      const hot = el("span", "sb-rw-directory-cell");
      hot.append(el("strong", null, account.hot), el("span", null, "高意向线索"));
      const progress = el("span", "sb-rw-directory-cell");
      progress.append(el("strong", null, account.progress), el("span", null, "策略完成"));
      row.append(identity, statusCell, fans, agents, hot, progress, el("span", "sb-rw-directory-open", "→"));
      row.addEventListener("click", () => onSelect(account.id));
      list.appendChild(row);
    });
  };

  filterOptions.forEach((option) => {
    const button = el("button", `sb-rw-directory-filter${(state.accountFilter || "全部") === option ? " is-active" : ""}`, option);
    button.type = "button";
    button.addEventListener("click", () => {
      state.accountFilter = option;
      renderAccountDirectory(root, state, { onBack, onSelect });
    });
    filters.appendChild(button);
  });
  search.addEventListener("input", () => {
    state.accountSearch = search.value;
    drawList();
  });
  toolbar.append(search, filters);
  root.append(toolbar, list);
  drawList();
}

function setupStepIndex(phase) {
  if (phase === "analyzing") return 1;
  if (phase === "cloud") return 1;
  if (phase === "agents") return 2;
  return 0;
}

function renderSetupSteps(container, phase) {
  const activeIndex = setupStepIndex(phase);
  ACCOUNT_SETUP_STEPS.forEach((step, index) => {
    const item = el("div", `sb-rw-account-setup-step${index < activeIndex ? " is-done" : index === activeIndex ? " is-active" : ""}`);
    item.append(el("i", null, index < activeIndex ? "✓" : String(index + 1)), el("span", null, step.label));
    container.appendChild(item);
  });
}

function renderSetupProgress(body, setup, label, detail) {
  body.append(el("div", "sb-rw-account-setup-copy", detail));
  const progress = el("div", "sb-rw-account-setup-progress");
  const fill = el("i");
  fill.style.width = `${Math.max(4, setup.progress)}%`;
  progress.appendChild(fill);
  const meta = el("div", "sb-rw-account-setup-progress-meta");
  meta.append(el("span", null, label), el("span", null, `${setup.progress}%`));
  body.append(progress, meta);
}

function renderSetupChecks(body, setup) {
  const checks = el("div", "sb-rw-account-setup-checks");
  [
    ["verify", "抖音账号登录态已核验"],
    ["cloud", "独立云电脑已创建"],
    ["agents", "账号级 Agent 已接入"]
  ].forEach(([step, label]) => {
    const index = ACCOUNT_SETUP_STEPS.findIndex((item) => item.id === step);
    const current = setupStepIndex(setup.phase);
    const done = index < current || (step === "agents" && setup.agentCount >= AGENTS_PER_ACCOUNT);
    const item = el("div", `sb-rw-account-setup-check${done ? " is-done" : ""}`);
    item.append(el("i"), el("span", null, label));
    checks.appendChild(item);
  });
  body.appendChild(checks);
}

function renderAccountSetupModal(root, state, render) {
  const setup = state.accountSetup;
  if (!setup) return;
  const mask = el("div", "sb-rw-account-setup-mask");
  const modal = el("section", "sb-rw-account-setup");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "添加抖音账号");
  const head = el("header", "sb-rw-account-setup-head");
  const headCopy = el("div");
  headCopy.append(el("h2", "sb-rw-account-setup-title", "添加抖音账号"), el("div", "sb-rw-account-setup-subtitle", "登录后由 AI 自动识别店铺信息并完成配置"));
  const close = el("button", "sb-rw-account-setup-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "关闭添加账号");
  const closeSetup = () => {
    if (setup.timer) globalThis.clearInterval(setup.timer);
    state.accountSetup = null;
    render();
  };
  close.addEventListener("click", closeSetup);
  head.append(headCopy, close);
  modal.appendChild(head);

  const steps = el("div", "sb-rw-account-setup-steps");
  renderSetupSteps(steps, setup.phase);
  modal.appendChild(steps);
  const body = el("div", "sb-rw-account-setup-body");
  const account = setup.account;

  if (setup.phase === "verify") {
    body.append(el("div", "sb-rw-account-setup-copy", "不需要填写店铺名称或抖音号。请直接登录抖音，系统会读取登录后的公开资料，自动生成账号卡片。"));
    const accountCard = el("div", "sb-rw-account-setup-check");
    accountCard.append(el("i"), el("span", null, setup.authState === "opening" ? "正在启动真实云电脑" : setup.authState === "checking" ? "正在检查云电脑内的抖音登录状态" : setup.authState === "ready" ? "已检测到真实抖音登录" : "等待连接抖音账号"));
    body.appendChild(accountCard);
    const actions = el("div", "sb-rw-account-setup-actions");
    const authorize = el("button", "sb-rw-account-setup-button is-primary", setup.authState === "browser" ? "检查登录状态" : "打开云电脑授权");
    authorize.type = "button";
    authorize.disabled = setup.authState === "opening" || setup.authState === "checking";
    authorize.addEventListener("click", async () => {
      authorize.disabled = true;
      const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
        || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
        || "http://127.0.0.1:6681";
      try {
        if (!setup.sessionId) {
          setup.authState = "opening";
          render();
          const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/douyin/mcp/start`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({})
          });
          const started = await response.json().catch(() => null);
          if (!response.ok || started?.ok === false) throw new Error(started?.error?.message || "真实云电脑启动失败");
          const loginResponse = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/douyin/mcp/open-login`, {
            method: "POST",
            headers: { accept: "application/json", "content-type": "application/json" },
            body: JSON.stringify({ agentId: selected.id, force: true, wantQr: true })
          });
          const login = await loginResponse.json().catch(() => null);
          const pageUrl = login?.cloudViewUrl || login?.cloud_view_url || login?.viewUrl || login?.view_url
            || login?.viewPageUrl || login?.view_page_url || login?.pageUrl || login?.loginUrl || login?.login_url;
          if (!loginResponse.ok || !pageUrl) throw new Error(login?.error?.message || "云电脑没有返回登录屏幕链接");
          setup.sessionId = `douyin-mcp:${Date.now()}`;
          setup.authState = "browser";
          account.phase = "等待抖音登录";
          render();
          openDouyinAuthorization({
            account: account.name,
            scopes: ["账号身份", "公开作品评论"],
            session: { ...started, ...login, agentId: selected.id, pageUrl, cloudViewUrl: pageUrl, source: "douyin-mcp" },
            refreshCloudView: async () => {
              const refreshedResponse = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/douyin/mcp/open-login`, {
                method: "POST",
                headers: { accept: "application/json", "content-type": "application/json" },
                body: JSON.stringify({ agentId: selected.id, force: true, wantQr: true })
              });
              const refreshed = await refreshedResponse.json().catch(() => null);
              if (!refreshedResponse.ok) throw new Error(refreshed?.error?.message || "云电脑画面暂时无法重新连接");
              return refreshed;
            },
            checkAuthorization: async () => {
              const statusResponse = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/douyin/mcp/check-login`, {
                method: "POST",
                headers: { accept: "application/json", "content-type": "application/json" },
                body: JSON.stringify({ agentId: selected.id, reqId: `manual-login-check:${selected.id}:${Date.now()}` })
              });
              const status = await statusResponse.json().catch(() => null);
              const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
              const raw = status?.account && typeof status.account === "object" ? status.account : {};
              const identity = accountIdentityFor(raw);
              if (!statusResponse.ok || !["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState) || !(identity.profileUrl || identity.uniqueId || identity.uid || identity.secId)) throw new Error("尚未检测到云电脑内的抖音登录，请完成登录后再检查");
              return {
                state: "READY",
                authenticationVerified: true,
                accountIdentity: identity,
                accountLabel: concreteAccountName(
                  identity.accountName,
                  identity.account_name,
                  identity.nickname,
                  identity.nick_name,
                  account.name
                )
              };
            },
            onAuthorized: ({ session: authorizedSession } = {}) => {
              account.name = authorizedSession?.accountIdentity?.accountName || authorizedSession?.accountLabel || account.name;
              account.handle = authorizedSession?.accountIdentity?.uniqueId ? `@${authorizedSession.accountIdentity.uniqueId.replace(/^@+/, "")}` : "@已授权账号";
              account.identity = authorizedSession?.accountIdentity;
              account.status = "已连接";
              account.phase = "已授权，等待 Agent 使用";
              account.computer = "在线";
              account.source = "douyin-mcp";
              account.accountKey = account.id;
              account.setupStep = "done";
              const authorized = rememberAuthorizedManagedAccount(account);
              if (!authorized) { setup.error = "真实抖音身份未确认，不能创建托管账号"; return; }
              state.customAccounts = [...state.customAccounts.filter((item) => item.id !== authorized.id), authorized];
              state.accounts = [...state.customAccounts];
              state.accountId = account.id;
              state.accountSetup = null;
              render();
            },
            onCancelled: () => { setup.authState = "browser"; render(); }
          });
          return;
        }
        setup.authState = "checking";
        render();
        if (!setup.sessionId.startsWith("douyin-mcp:")) throw new Error("抖音授权必须通过云电脑启动");
        const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/douyin/mcp/status`, { headers: { accept: "application/json" } });
        const status = await response.json().catch(() => null);
        const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
        const raw = status?.account && typeof status.account === "object" ? status.account : {};
        const identity = accountIdentityFor(raw);
        if (!response.ok || !["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState) || !(identity.profileUrl || identity.uniqueId || identity.uid || identity.secId)) throw new Error("尚未检测到云电脑内的抖音登录，请完成登录后再检查");
        account.name = identity.accountName || account.name;
        account.handle = identity.uniqueId ? `@${identity.uniqueId.replace(/^@+/, "")}` : "@已授权账号";
        account.identity = identity;
        account.status = "已连接";
        account.phase = "已授权，等待 Agent 使用";
        account.computer = "在线";
        account.source = "douyin-mcp";
        account.accountKey = account.id;
        account.setupStep = "done";
        const authorized = rememberAuthorizedManagedAccount(account);
        if (!authorized) throw new Error("真实抖音身份未确认，不能创建托管账号");
        state.customAccounts = [...state.customAccounts.filter((item) => item.id !== authorized.id), authorized];
        state.accounts = [...state.customAccounts];
        state.accountId = account.id;
        state.accountSetup = null;
      } catch (error) {
        setup.authState = setup.sessionId ? "browser" : "waiting";
        setup.error = error?.message || "授权失败";
      } finally {
        render();
      }
    });
    if (setup.error) body.appendChild(el("div", "sb-rw-account-setup-error", setup.error));
    actions.appendChild(authorize);
    body.appendChild(actions);
  } else if (setup.phase === "analyzing") {
    renderSetupProgress(body, setup, "AI 正在识别", "正在从抖音登录态读取店铺名称、抖音号、头像和公开运营信息。无需手动填写。 ");
    renderSetupChecks(body, setup);
  } else if (setup.phase === "cloud") {
    renderSetupProgress(body, setup, "创建云电脑", `账号 ${account.name} 已识别，正在创建独立浏览器工作区。`);
    renderSetupChecks(body, setup);
  } else {
    renderSetupProgress(body, setup, `已接入 ${setup.agentCount}/${AGENTS_PER_ACCOUNT} 个 Agent`, `云电脑已在线，正在为 ${account.name} 接入账号级找人、分析和触达 Agent。`);
    renderSetupChecks(body, setup);
  }
  modal.appendChild(body);
  mask.appendChild(modal);
  mask.addEventListener("mousedown", (event) => { if (event.target === mask) closeSetup(); });
  root.appendChild(mask);
}

export function openRealtimeWorkPage({ teamLive = null, gateway = null, onClose = null, selectedAgentId = null, taskId = null, taskRunId = null, accountId = null, accountKey = null, openAccountSetup = false } = {}) {
  persistNavigationRoute("realtimeWork");
  ensureStyle();
  const page = openPage({
    title: "",
    onClose: () => {
      clearNavigationRoute("realtimeWork");
      onClose?.();
    }
  });
  page.root.classList.add("sb-page-realtime-work");
  const stylePreview = realtimeWorkPreviewMode() === "style";
  const match = onboardingMatchFromStorage();
  const configuredAgents = createAgentsForMatch(match);
  // Do not render a managed account from browser storage. The control plane
  // confirms the current authorization state immediately after the page opens.
  const customAccounts = [];
  const previewAccounts = stylePreview ? createRealtimeMockPreviewAccounts() : [];
  const accounts = stylePreview ? previewAccounts : [...customAccounts];
  const initialAccount = accounts.find((account) => account.id === accountId) || accounts[0] || null;
  const initialAccountWorkKey = accountKey || douyinAccountWorkKey(initialAccount?.identity, "");
  const previewWorks = stylePreview ? createRealtimeMockPreviewWorks(previewAccounts) : [];
  const previewWork = previewWorks.find((work) => work.metadata?.accountId === initialAccount?.id) || null;
  const requestedWork = listWorks().find((work) => work.agentType === selectedAgentId
    && work.metadata?.taskId === taskId
    && (!taskRunId || work.metadata?.taskRunId === taskRunId)
    && (!accountId || work.metadata?.accountId === accountId));
  const initialSelected = stylePreview
    ? "mkt-comment-acquisition"
    : requestedWork?.agentType || ((configuredAgents.some((agent) => agent.id === selectedAgentId) || listWorks().some((work) => work.agentType === selectedAgentId))
    ? selectedAgentId
    : configuredAgents.some((agent) => agent.id === "mkt-comment-acquisition")
    ? "mkt-comment-acquisition"
    : configuredAgents[0]?.id);
  const state = {
    view: "realtime",
    stylePreview,
    previewWork,
    previewWorks,
    accountId: initialAccount?.id || "",
    accounts,
    customAccounts,
    accountSetup: openAccountSetup ? createAccountSetup(accounts) : null,
    accountSearch: "",
    accountFilter: "全部",
    filter: "全部",
    selected: initialSelected,
    taskId,
    taskRunId,
    accountKey: initialAccountWorkKey,
    gateway,
    paused: false,
    outreachSelected: 0,
    outreachPaused: false,
    outreachDecision: "待风控",
    outreachDraftState: "已生成",
    acquisitionProspectId: previewWork ? "mock-lead-shanghai-zhou" : null,
    inboxTab: "all",
    inboxSearch: "",
    inboxFilter: "all",
    inboxConversationId: null,
    receptionConversations: {},
    receptionConversationLoads: new Set(),
    refreshView: null,
    disposed: false,
    agents: configuredAgents.map((agent) => ({ ...agent })),
    liveWorks: [],
    remoteOfficeWorks: [],
    remoteOfficeSnapshot: [],
    cancellingTaskKeys: new Set(),
    events: [],
    cloudViewerFrames: new Map(),
    cloudViewerStatuses: new Map(),
    cloudViewerPresentations: new Map(),
    cloudViewerCaptures: new Map(),
    cloudViewerCaptureSignatures: new Map(),
    cloudViewerRecordings: new Map(),
    cloudViewerRecordingSignatures: new Map(),
    cloudViewerReplays: new Map(),
    cloudViewerReplayLoads: new Map(),
    cloudViewerReplayMarkedTasks: new Set(),
    runningAgentRailScrollLeft: 0,
    completedAgentRailScrollLeft: 0
  };
  let disposed = false;
  let unsubscribe = null;
  let unsubscribeLiveWork = null;
  let remoteOfficeTimer = null;
  let remoteOfficeRefreshPending = null;
  const updateCloudViewerPresentation = (agentId, viewer) => {
    const presentation = state.cloudViewerPresentations.get(agentId);
    if (!presentation?.cloudLive?.isConnected) return;
    viewer ||= { status: "connecting", message: "正在准备录屏采集", reason: "" };
    if (viewer.status === "connected") {
      presentation.viewerState?.remove();
      presentation.viewerState = null;
      presentation.viewerTitle = null;
      presentation.viewerMessage = null;
    } else {
      if (!presentation.viewerState?.isConnected) {
        presentation.viewerState = el("div", "sb-rw-cloud-viewer-state");
        const viewerCopy = el("div");
        presentation.viewerTitle = el("strong");
        presentation.viewerMessage = el("span");
        viewerCopy.append(presentation.viewerTitle, presentation.viewerMessage);
        presentation.viewerState.appendChild(viewerCopy);
        presentation.cloudLive.appendChild(presentation.viewerState);
      }
      const authExpired = viewer.reason === "auth-expired" || viewer.status === "auth-expired";
      presentation.viewerTitle.textContent = authExpired
        ? "抖音账号已掉线"
        : viewer.status === "error"
          ? "云电脑画面不可用"
        : viewer.status === "disconnected"
          ? "云电脑画面已断开"
          : viewer.status === "reconnecting"
            ? "正在恢复云电脑画面"
            : "正在连接云电脑画面";
      presentation.viewerMessage.textContent = viewer.message || "等待真实画面连接结果";
    }
    if (presentation.statusText) {
      const captureStatus = viewer.status === "connected"
        ? "录屏采集已连接"
        : viewer.status === "reconnecting"
          ? "录屏采集正在恢复"
          : viewer.status === "auth-expired"
            ? "账号已掉线，录屏采集已暂停"
            : viewer.status === "disconnected" || viewer.status === "error" || viewer.status === "recording-unavailable"
              ? "录屏采集暂时中断"
              : "正在准备录屏采集";
      presentation.statusText.textContent = `${presentation.statusPrefix} · ${captureStatus}`;
    }
  };
  const cloudReplayContext = (agentId) => {
    const agent = state.agents.find((item) => item.id === agentId);
    const work = agent?.liveWork;
    const frame = state.cloudViewerFrames.get(agentId);
    if (!agent || !work || !frame?.contentWindow) return null;
    const metadata = work.metadata || {};
    const taskId = metadata.taskId || work.taskId || null;
    const taskRunId = metadata.taskRunId || work.taskRunId || null;
    const detail = work.task || agent.task || "";
    const title = agent.context?.activity || work.phase || agent.phase || "正在处理任务";
    const eventKey = [taskId || "current", taskRunId || "", work.state || "working", title, detail, work.activities?.at(-1) || ""].join("|");
    if (state.cloudViewerCaptureSignatures.get(agentId) === eventKey) return null;
    if ([...state.cloudViewerCaptures.values()].some((capture) => capture.agentId === agentId && capture.eventKey === eventKey)) return null;
    return {
      agentId,
      taskId,
      taskRunId,
      eventKey,
      title,
      detail,
      captureProfile: cloudCaptureProfileFor(agentId, work),
      captureRegion: cloudCaptureRegionFor(work)
    };
  };
  const requestCloudReplayCapture = (agentId) => {
    const context = cloudReplayContext(agentId);
    if (!context) return;
    const frame = state.cloudViewerFrames.get(agentId);
    const captureId = globalThis.crypto?.randomUUID?.() || `realtime-frame-${Date.now()}`;
    state.cloudViewerCaptures.set(captureId, context);
    globalThis.setTimeout?.(() => state.cloudViewerCaptures.delete(captureId), 15_000);
    frame.contentWindow.postMessage({
      type: "byering-cloud-viewer-capture",
      agentId,
      captureId,
      maxEdge: 880,
      quality: 0.68,
      captureProfile: context.captureProfile,
      captureRegion: context.captureRegion
    }, globalThis.location?.origin || "*");
  };
  const cloudReplayRecordingContext = (agentId, { force = false } = {}) => {
    const agent = state.agents.find((item) => item.id === agentId);
    const work = agent?.liveWork;
    const frame = state.cloudViewerFrames.get(agentId);
    if (!agent || !work || !frame?.contentWindow) return null;
    const metadata = work.metadata || {};
    const taskId = metadata.taskId || work.taskId || null;
    const taskRunId = metadata.taskRunId || work.taskRunId || null;
    const detail = work.task || agent.task || "";
    const title = agent.context?.activity || work.phase || agent.phase || "正在处理任务";
    const eventKey = [taskId || "current", taskRunId || "", work.state || "working", title, detail].join("|");
    if (!force && state.cloudViewerRecordingSignatures.get(agentId) === eventKey) return null;
    state.cloudViewerRecordingSignatures.set(agentId, eventKey);
    return {
      agentId,
      taskId,
      taskRunId,
      eventKey,
      title,
      detail,
      captureProfile: cloudCaptureProfileFor(agentId, work),
      captureRegion: cloudCaptureRegionFor(work),
      recordingId: globalThis.crypto?.randomUUID?.() || `realtime-recording-${Date.now()}`
    };
  };
  const requestCloudReplayRecording = (agentId, options = {}) => {
    const context = cloudReplayRecordingContext(agentId, options);
    if (!context) return;
    const frame = state.cloudViewerFrames.get(agentId);
    state.cloudViewerRecordings.set(context.recordingId, context);
    frame.contentWindow.postMessage({
      type: "byering-cloud-viewer-recording-start",
      agentId,
      recordingId: context.recordingId,
      captureProfile: context.captureProfile,
      captureRegion: context.captureRegion
    }, globalThis.location?.origin || "*");
  };
  const replayTaskIdForWork = (work) => {
    const metadata = work?.metadata || {};
    return String(metadata.taskId || metadata.task_id || work?.taskId || "").trim() || null;
  };
  const clearCloudReplay = (agentId) => {
    const replay = state.cloudViewerReplays.get(agentId);
    replay?.segments?.forEach(({ url }) => { try { globalThis.URL?.revokeObjectURL?.(url); } catch {} });
    state.cloudViewerReplays.delete(agentId);
  };
  const ensureCloudReplay = (agentId) => {
    if (state.cloudViewerReplays.has(agentId) || state.cloudViewerReplayLoads.has(agentId)) return;
    state.cloudViewerReplayLoads.set(agentId, true);
    const work = state.agents.find((item) => item.id === agentId)?.liveWork;
    const taskId = replayTaskIdForWork(work);
    void listOfficeReplay(agentId, { taskId, limit: 8, latestOnly: true, successfulOnly: true }).then(async (result) => {
      const segments = [];
      for (const segment of (Array.isArray(result?.segments) ? result.segments.slice().reverse() : [])) {
        try { segments.push({ segment, url: await loadOfficeReplayVideo(segment) }); } catch {}
      }
      state.cloudViewerReplays.set(agentId, { status: "ready", taskId: result?.taskId || null, segments });
      if (!disposed && state.selected === agentId) render();
    }).catch(() => {
      state.cloudViewerReplays.set(agentId, { status: "ready", taskId: null, segments: [], error: true });
      if (!disposed && state.selected === agentId) render();
    }).finally(() => state.cloudViewerReplayLoads.delete(agentId));
  };
  const refreshCloudReplay = (agentId) => {
    clearCloudReplay(agentId);
    if (!disposed && state.selected === agentId) {
      ensureCloudReplay(agentId);
      render();
    }
  };
  const markReplaySuccess = (agentId, work, recordingId = null) => {
    const taskId = replayTaskIdForWork(work);
    if (!taskId || !isSuccessfulReplayWork(work)) return;
    const key = `${agentId}:${taskId}`;
    if (state.cloudViewerReplayMarkedTasks.has(key)) return;
    state.cloudViewerReplayMarkedTasks.add(key);
    void markOfficeReplayTask({ agentId, taskId, recordingId, outcome: "success" }).then(() => {
      refreshCloudReplay(agentId);
    }).catch(() => state.cloudViewerReplayMarkedTasks.delete(key));
  };
  const onCloudViewerMessage = (event) => {
    const data = event?.data;
    if (!data || !data.agentId || event.origin !== globalThis.location?.origin) return;
    const frame = state.cloudViewerFrames.get(data.agentId);
    if (frame?.contentWindow && event.source !== frame.contentWindow) return;
    if (data.type === "byering-cloud-snapshot") {
      const capture = state.cloudViewerCaptures.get(data.captureId);
      state.cloudViewerCaptures.delete(data.captureId);
      if (!capture || !data.imageData) return;
      void saveOfficeReplaySnapshot({ ...capture, imageData: data.imageData }).then(() => {
        state.cloudViewerCaptureSignatures.set(capture.agentId, capture.eventKey);
      }).catch(() => {});
      return;
    }
    if (data.type === "byering-cloud-recording-segment") {
      const recording = state.cloudViewerRecordings.get(data.recordingId);
      if (!recording || !data.videoData) return;
      const work = state.agents.find((agent) => agent.id === recording.agentId)?.liveWork;
      void saveOfficeReplayVideo({
        ...recording,
        outcome: isSuccessfulReplayWork(work) ? "success" : "unknown",
        durationMs: Number(data.durationMs) || 5_000,
        videoData: data.videoData
      }).then(() => {
        markReplaySuccess(recording.agentId, work, recording.recordingId);
        refreshCloudReplay(recording.agentId);
      }).catch(() => requestCloudReplayCapture(recording.agentId));
      return;
    }
    if (data.type !== "byering-cloud-viewer") return;
    const viewer = { status: String(data.status || "error"), message: String(data.message || ""), reason: String(data.reason || "") };
    state.cloudViewerStatuses.set(data.agentId, viewer);
    updateCloudViewerPresentation(data.agentId, viewer);
    const currentWork = state.agents.find((agent) => agent.id === data.agentId)?.liveWork;
    const currentTaskState = String(currentWork?.taskState || currentWork?.task_status || "").trim().toLowerCase();
    const taskFinished = currentWork?.state === "done"
      || ["completed", "succeeded", "failed", "error", "cancelled", "canceled", "stopped"].includes(currentTaskState);
    if (viewer.status === "connected" && !taskFinished) {
      globalThis.setTimeout?.(() => requestCloudReplayRecording(data.agentId, { force: true }), 900);
    }
    if (viewer.status === "recording-unavailable") requestCloudReplayCapture(data.agentId);
  };
  globalThis.addEventListener?.("message", onCloudViewerMessage);

  const selectedAgent = () => {
    const liveAgents = liveAgentsForWorks(state.agents, state.liveWorks);
    return liveAgents.find((agent) => agent.id === state.selected) || liveAgents[0] || null;
  };
  const selectedAccount = () => state.accounts.find((account) => account.id === state.accountId) || state.accounts[0] || null;

  function syncLiveWorks() {
    const previewWorks = state.stylePreview && state.previewWorks?.length
      ? state.previewWorks
      : state.stylePreview && state.previewWork ? [state.previewWork] : [];
    const selectedPreviewWorks = previewWorks.filter((work) => work.metadata?.accountId === state.accountId
      || work.metadata?.accountKey === state.accountKey);
    state.previewWork = selectedPreviewWorks.find((work) => work.agentType === "mkt-comment-acquisition")
      || selectedPreviewWorks[0]
      || null;
    const localWorks = [
      ...listWorks().filter((work) => work.projectId !== "demo-office" && work.metadata?.simulated !== true),
      ...previewWorks
    ];
    const allWorks = mergeRealtimeWorkSources(localWorks, state.remoteOfficeWorks);
    state.liveWorks = state.stylePreview && selectedPreviewWorks.length
      ? selectedPreviewWorks
      : visibleRealtimeWorks(allWorks, { selectedAgentId, taskId, taskRunId, accountId: state.accountId, accountKey: state.accountKey });
    for (const work of state.liveWorks) {
      const agentId = work.agentType;
      let agent = state.agents.find((item) => item.id === agentId);
      if (!agent) {
        const marketplaceAgent = getMarketplaceAgent(agentId);
        agent = {
          id: agentId,
          name: marketplaceAgent?.name || agentId,
          phase: marketplaceAgent?.category || "找人",
          role: marketplaceAgent?.title || "实时任务 Agent",
          task: work.task || "正在执行任务",
          action: "按任务要求处理真实数据并保留执行证据",
          input: "用户任务参数",
          output: marketplaceAgent?.deliverables?.join(" · ") || "任务结果",
          handoff: "用户",
          tool: marketplaceAgent?.tools?.join(" / ") || "已配置工具",
          status: "working",
          progress: 0,
          stepIndex: 0,
          steps: ["接收任务", "处理真实数据", "整理结果"]
        };
        state.agents.push(agent);
      }
      agent.task = work.task || agent.task;
      agent.phase = work.phase || agent.phase;
      const realtime = isAcquisitionRealtimeAgent(agentId) ? acquisitionRealtimeViewModel(agentId, work) : null;
      agent.status = realtimeWorkDisplayStatus({
        ...work,
        metadata: { ...(work.metadata || {}), taskState: realtime?.taskState || work.metadata?.taskState }
      });
      agent.progress = realtime?.progressMode === "indeterminate" ? 0 : Number.isFinite(Number(work.progress)) ? Number(work.progress) : agent.progress;
      agent.liveWork = work;
      const isPublicWork = Boolean(work.metadata?.profileUrl);
      agent.context = {
        ...normalizeRealtimeOutputContext(agent.context),
        prospect: work.metadata?.accountLabel || (isPublicWork ? "公开抖音账号" : "当前任务"),
        source: isPublicWork ? "抖音公开主页 · 作品评论" : "真实任务执行",
        activity: realtime?.recentSignal || work.activities?.at(-1) || work.task || "实时执行中"
      };
      markReplaySuccess(agentId, work);
      const latestActivity = work.activities?.at(-1);
      if (latestActivity) {
        const eventText = `${agent.name}：${latestActivity}`;
        if (!state.events.includes(eventText)) state.events = [eventText, ...state.events].slice(0, 8);
      }
    }
    if (!state.agents.some((agent) => agent.id === state.selected)) {
      const live = state.liveWorks.find((work) => work.state !== "done") || state.liveWorks.at(-1);
      if (live) state.selected = live.agentType;
    }
  }

  function openRunningAgentManager() {
    if (document.querySelector(".sb-rw-agent-manager-mask")) return;
    syncLiveWorks();
    const workGroups = partitionRealtimeWorks(state.liveWorks);
    const runningWorks = [...workGroups.active, ...workGroups.attention];
    const mask = el("div", "sb-rw-agent-manager-mask");
    const dialog = el("section", "sb-rw-agent-manager");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "sb-rw-agent-manager-title");
    const head = el("header", "sb-rw-agent-manager-head");
    const headCopy = el("div");
    const title = el("h2", null, "管理运行中的 Agent");
    title.id = "sb-rw-agent-manager-title";
    headCopy.append(title, el("p", null, "取消后会停止当前账号的后续任务，已产出的结果与证据会保留。"));
    const closeButton = el("button", "sb-rw-agent-manager-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "关闭任务管理");
    head.append(headCopy, closeButton);
    dialog.appendChild(head);

    const list = el("div", "sb-rw-agent-manager-list");
    if (!runningWorks.length) {
      list.appendChild(el("div", "sb-rw-agent-manager-empty", "当前账号没有可取消的运行任务。"));
    }
    const error = el("div", "sb-rw-agent-manager-error");
    const close = () => mask.remove();
    const cancelTask = async (agent, work, button) => {
      const payload = realtimeTaskControlPayload(agent.id, "cancel", work);
      const taskKey = `${agent.id}:${payload.taskId || payload.taskRunId || ""}`;
      if (!payload.taskId || state.cancellingTaskKeys.has(taskKey)) return;
      state.cancellingTaskKeys.add(taskKey);
      button.disabled = true;
      button.textContent = "正在取消…";
      error.classList.remove("is-visible");
      try {
        let taskGateway = state.gateway;
        if (!taskGateway?.action) taskGateway = await globalThis.__SALEBUDDY__?.gatewayReady?.catch?.(() => null);
        if (!taskGateway?.action) throw new Error("任务控制暂不可用");
        await taskGateway.action("task.cancel", payload);
        state.events = [`${agent.name}：任务已取消，已有结果与证据已保留`, ...state.events].slice(0, 8);
        await refreshRemoteOfficeStatus();
        close();
        refreshRealtimeView({ structural: true });
      } catch (cause) {
        error.textContent = `取消任务失败：${cause?.message || "请稍后重试"}`;
        error.classList.add("is-visible");
        button.disabled = false;
        button.textContent = "取消任务";
      } finally {
        state.cancellingTaskKeys.delete(taskKey);
      }
    };

    runningWorks.forEach((work) => {
      const agent = state.agents.find((item) => item.id === work.agentType) || {
        id: work.agentType,
        name: getMarketplaceAgent(work.agentType)?.name || work.agentType
      };
      const payload = realtimeTaskControlPayload(agent.id, "cancel", work);
      const row = el("div", "sb-rw-agent-manager-row");
      const copy = el("div", "sb-rw-agent-manager-copy");
      copy.append(
        el("strong", null, agent.name),
        el("span", null, `${work.phase || "执行中"} · ${work.task || "正在处理任务"}`)
      );
      const cancel = el("button", "sb-rw-agent-manager-cancel", "取消任务");
      cancel.type = "button";
      cancel.disabled = !payload.taskId;
      cancel.addEventListener("click", () => { void cancelTask(agent, work, cancel); });
      row.append(copy, cancel);
      list.appendChild(row);
    });
    dialog.append(list, error);
    const footer = el("footer", "sb-rw-agent-manager-footer");
    const dismiss = el("button", null, "关闭");
    dismiss.type = "button";
    dismiss.addEventListener("click", close);
    const startMore = el("button", null, "启动更多 Agent");
    startMore.type = "button";
    startMore.addEventListener("click", () => {
      close();
      globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.());
    });
    footer.append(dismiss, startMore);
    dialog.appendChild(footer);
    mask.appendChild(dialog);
    closeButton.addEventListener("click", close);
    mask.addEventListener("mousedown", (event) => { if (event.target === mask) close(); });
    document.body.appendChild(mask);
  }

  function captureAgentRailScrollPositions(root) {
    const runningRail = root.querySelector(".sb-rw-team:not(.sb-rw-completed-team)");
    const completedRail = root.querySelector(".sb-rw-completed-team");
    if (runningRail) state.runningAgentRailScrollLeft = runningRail.scrollLeft;
    if (completedRail) state.completedAgentRailScrollLeft = completedRail.scrollLeft;
  }

  function restoreAgentRailScroll(team, scrollStateKey) {
    if (!scrollStateKey) return;
    const restore = () => {
      team.scrollLeft = clampHorizontalScrollOffset(
        state[scrollStateKey],
        team.scrollWidth,
        team.clientWidth
      );
    };
    restore();
    globalThis.requestAnimationFrame?.(restore);
  }

  function updateAgentCards(root, agents, selector = ".sb-rw-team", emptyText = "", scrollStateKey = "") {
    const team = root.querySelector(selector);
    if (!team) return;
    // A full render creates a fresh rail at zero. Only overwrite the saved position
    // when refreshing an already-mounted rail that still contains the prior cards.
    if (scrollStateKey && team.childElementCount > 0) state[scrollStateKey] = team.scrollLeft;
    team.textContent = "";
    if (!agents.length && emptyText) {
      team.appendChild(el("div", "sb-rw-team-empty", emptyText));
      restoreAgentRailScroll(team, scrollStateKey);
      return;
    }
    for (const agent of agents) {
      const card = el("button", `sb-rw-team-card${agent.id === state.selected ? " is-active" : ""}`);
      card.type = "button";
      const line = el("div", "sb-rw-agent-line");
      const avatarEl = el("span", "sb-rw-avatar"); avatar(avatarEl, agent);
      const copy = el("span", "sb-rw-agent-copy");
      copy.append(el("span", "sb-rw-agent-name", agent.name), el("span", "sb-rw-agent-phase", agent.role));
      line.append(avatarEl, copy);
      const meta = el("div", `sb-rw-card-meta${agent.status === "auth-expired" ? " is-attention" : ""}`); meta.append(el("span", null, statusLabel(agent.status)));
      card.append(line, meta);
      card.addEventListener("click", () => { state.selected = agent.id; render(); });
      team.appendChild(card);
    }
    if (scrollStateKey && team.dataset.scrollPersistenceBound !== "true") {
      team.dataset.scrollPersistenceBound = "true";
      team.addEventListener("scroll", () => {
        state[scrollStateKey] = team.scrollLeft;
      }, { passive: true });
    }
    restoreAgentRailScroll(team, scrollStateKey);
  }

  function render() {
    syncLiveWorks();
    const workGroups = partitionRealtimeWorks(state.liveWorks);
    const liveAgents = liveAgentsForWorks(state.agents, [...workGroups.active, ...workGroups.attention]);
    const completedAgents = liveAgentsForWorks(state.agents, workGroups.completed);
    const selected = selectedAgent();
    const managedAccount = selectedAccount();
    const standaloneWork = selected?.id === "mkt-viral-work-analysis";
    const liveAccountLabel = state.liveWorks.find((work) => work.metadata?.accountLabel)?.metadata?.accountLabel;
    const account = managedAccount || (state.liveWorks.length ? { id: "public-live", name: standaloneWork ? "公开作品分析" : liveAccountLabel || "公开抖音账号", handle: standaloneWork ? "无需账号授权" : "无需登录", progress: 0 } : null);
    const activeLiveCount = workGroups.active.length;
    const erroredLiveCount = workGroups.attention.length;
    const root = page.body.querySelector(".sb-realtime-page") || el("main", "sb-realtime-page");
    if (state.view === "accounts") {
      renderAccountDirectory(root, state, {
        onBack: () => { state.view = "realtime"; render(); },
        onSelect: (accountId) => { state.accountId = accountId; state.view = "realtime"; render(); }
      });
      if (!root.isConnected) page.body.appendChild(root);
      return;
    }
    root.classList.remove("sb-rw-account-directory");
    captureAgentRailScrollPositions(root);
    root.textContent = "";
    state.cloudViewerPresentations.clear();
    if (state.accountSetup) {
      renderAccountSetupModal(root, state, render);
      if (!root.isConnected) page.body.appendChild(root);
      return;
    }

    const managedCount = state.accounts.length;
    const runningAgentCount = activeLiveCount;

    const accountSection = el("section", "sb-rw-account-section");
    const accountTopline = el("div", "sb-rw-account-topline");
    const accountHead = el("div", "sb-rw-account-head");
    const accountHeading = el("div", "sb-rw-account-heading");
    accountHeading.append(el("div", "sb-rw-account-title", "我的账号"));
    if (state.stylePreview) accountHeading.firstElementChild?.append(el("span", "sb-rw-mock-badge", "MOCK"));
    accountHead.append(accountHeading);
    const accountSummary = el("div", "sb-rw-account-summary");
    [["⌁", "托管账号", `${managedCount} 个`], ["✦", "运行中 Agent", `${runningAgentCount} 个`]].forEach(([icon, label, value]) => {
      const item = el("div", "sb-rw-account-summary-item");
      item.append(el("span", "sb-rw-account-summary-icon", icon), el("span", "sb-rw-account-summary-copy", `${label} ${value}`));
      accountSummary.appendChild(item);
    });
    const allAccounts = el("button", "sb-rw-account-summary-action", "查看全部账号");
    allAccounts.type = "button";
    allAccounts.addEventListener("click", () => {
      state.view = "accounts";
      state.accountSearch = "";
      state.accountFilter = "全部";
      render();
    });
    accountSummary.appendChild(allAccounts);
    accountTopline.append(accountHead, accountSummary);
    const accountList = el("div", "sb-rw-account-list");
    state.accounts.forEach((item, index) => {
      const card = el("button", `sb-rw-account-card${item.id === account.id ? " is-active" : ""}`);
      card.type = "button";
      const accountAvatar = el("span", `sb-rw-account-avatar${index === 1 ? " is-blue" : index === 2 ? " is-amber" : ""}`);
      mountAccountAvatar(accountAvatar, item, { eager: true });
      const copy = el("span", "sb-rw-account-copy");
      const nameLine = el("span", "sb-rw-account-name-line");
      nameLine.append(el("span", "sb-rw-account-name", item.name));
      if (item.mock) nameLine.append(el("span", "sb-rw-mock-badge", "MOCK"));
      copy.append(nameLine, el("span", "sb-rw-account-handle", item.handle));
      const meta = el("span", "sb-rw-account-meta");
      const workSource = state.stylePreview && state.previewWorks?.length ? state.previewWorks : state.liveWorks;
      const accountWorks = workSource.filter((work) => {
        const accountKey = work.metadata?.accountKey || work.metadata?.accountId;
        const itemWorkKey = douyinAccountWorkKey(item.identity, item.id);
        return accountKey ? accountKey === item.id || accountKey === itemWorkKey : item.id === account.id;
      });
      const activeAccountWorks = accountWorks.filter((work) => work.state !== "done" && !work.lastError);
      const accountStatusLabel = realtimeAccountStatusLabel(item, activeAccountWorks);
      const accountStatus = el("span", `sb-rw-account-status${accountStatusLabel === "需重新登录" ? " is-warning" : ""}`);
      accountStatus.append(el("i"), el("span", null, accountStatusLabel));
      const capabilityMatrix = Array.isArray(item.capabilityMatrix) ? item.capabilityMatrix : [];
      const ready = capabilityMatrix.filter(({ ready }) => ready).length;
      const capabilitySummary = capabilityMatrix.length
        ? ready
          ? `${ready} 项能力可使用`
          : "尚未接入可运行能力"
        : "尚未接入可运行能力";
      const capabilityStatus = el("span", "sb-rw-account-capability-summary", capabilitySummary);
      capabilityStatus.title = capabilityMatrix.map(({ name, binding }) => `${name}：${binding === "account_cloud" ? "账号云电脑已就绪" : "未接入"}`).join("\n");
      meta.append(accountStatus, capabilityStatus, el("span", "sb-rw-account-stat", activeAccountWorks.length ? `${activeAccountWorks.length} 个${item.mock ? "模拟 Agent" : "Agent"}运行中` : item.mock ? "已准备模拟数据" : "暂无实时任务"));
      const foot = item.status === "需重新登录"
        ? "等待授权后恢复"
        : item.mock
          ? "切换查看该账号的模拟数据"
        : activeAccountWorks.length
          ? "真实任务已连接"
          : "等待任务启动";
      copy.append(meta, el("span", "sb-rw-account-foot", foot));
      card.append(accountAvatar, copy);
      card.addEventListener("click", () => {
        state.accountId = item.id;
        state.accountKey = item.accountKey || douyinAccountWorkKey(item.identity, "");
        render();
      });
      accountList.appendChild(card);
    });
    accountSection.append(accountTopline, accountList);
    if (managedAccount) root.appendChild(accountSection);

    if (!state.liveWorks.length) {
      const empty = el("section", "sb-rw-no-account");
      empty.dataset.state = managedAccount ? "account-idle" : "public-idle";
      const inner = el("div", "sb-rw-no-account-inner");
      const art = el("div", "sb-rw-no-account-art");
      const image = document.createElement("img");
      image.src = PUBLIC_TASK_EMPTY_ILLUSTRATION;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      art.appendChild(image);
      const copy = el("div", "sb-rw-no-account-copy");
      const eyebrow = el("span", "sb-rw-no-account-eyebrow", managedAccount ? "账号工作台" : "公开找人");
      if (managedAccount) {
        copy.append(el("strong", null, "还没有进行中的任务"), el("span", null, "启动 Agent 后，真实任务状态、进度和工作动态会在这里持续更新。"));
      } else {
        copy.append(el("strong", null, "还没有公开找人任务"), el("span", null, "从公开主页开始找人后，任务进度、来源和结果会统一沉淀在这里。"));
      }
      const start = el("button", null, managedAccount ? "运行 Agent" : "开始公开找人");
      start.type = "button";
      start.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.(managedAccount ? undefined : { initialAgentId: "mkt-comment-filter" })));
      inner.append(art, eyebrow, copy, start);
      empty.appendChild(inner);
      root.appendChild(empty);
      if (!root.isConnected) page.body.appendChild(root);
      return;
    }
    const teamSection = el("section", "sb-rw-ai-team");
    teamSection.dataset.activeCount = String(liveAgents.length);
    teamSection.dataset.attentionCount = String(workGroups.attention.length);
    const teamHeading = el("div", "sb-rw-ai-team-heading");
    const teamHeadingCopy = el("div", "sb-rw-ai-team-heading-copy");
    const teamStatus = erroredLiveCount
      ? `${erroredLiveCount} 个任务需要处理${activeLiveCount ? ` · ${activeLiveCount} 个正在运行` : ""}`
      : activeLiveCount
        ? `${activeLiveCount} 个任务正在运行`
        : completedAgents.length
          ? "当前没有正在运行的任务"
          : "暂无正在运行的任务";
    teamHeadingCopy.append(el("strong", null, `「${account.name}」的 Agent`), el("span", null, teamStatus));
    const runMoreAgents = el("button", "sb-rw-ai-team-action", "运行更多 Agent");
    runMoreAgents.type = "button";
    runMoreAgents.addEventListener("click", openRunningAgentManager);
    teamHeading.append(teamHeadingCopy, runMoreAgents);
    const team = el("div", "sb-rw-team");
    teamSection.append(teamHeading, team);
    root.appendChild(teamSection);

    if (completedAgents.length) {
      const completedSection = el("section", "sb-rw-ai-team is-completed");
      completedSection.dataset.completedCount = String(completedAgents.length);
      const completedHeading = el("div", "sb-rw-ai-team-heading");
      const completedHeadingCopy = el("div", "sb-rw-ai-team-heading-copy");
      completedHeadingCopy.append(el("strong", null, "最近完成"), el("span", null, `${completedAgents.length} 个 Agent · 可查看成果`));
      completedHeading.append(completedHeadingCopy);
      const completedTeam = el("div", "sb-rw-team sb-rw-completed-team");
      completedSection.append(completedHeading, completedTeam);
      root.appendChild(completedSection);
    }
    updateAgentCards(root, liveAgents, ".sb-rw-team:not(.sb-rw-completed-team)", "", "runningAgentRailScrollLeft");
    updateAgentCards(root, completedAgents, ".sb-rw-completed-team", "", "completedAgentRailScrollLeft");

    const workbar = el("div", "sb-rw-workbar");
    workbar.append(el("h2", "sb-rw-section-title", "工作现场"));

    const specialistWorksite = realtimeSpecialistWorksiteFor(selected.id, selected.liveWork);
    const specialistWork = Boolean(specialistWorksite);
    const finderWork = specialistWorksite === "finder";
    const analysisWork = specialistWorksite === "analysis";
    const liveDanmakuAnalysisWork = specialistWorksite === "live-analysis";
    const liveDanmakuOutreachWork = specialistWorksite === "live-outreach";
    const viralWorkAnalysisWork = specialistWorksite === "viral-analysis";
    const inboxWork = ["mkt-dm-inbox", GOLD_CUSTOMER_SERVICE_AGENT_ID].includes(selected.id) && Boolean(selected.liveWork) && !specialistWork;
    const commentAcquisitionWork = selected.id === "mkt-comment-acquisition" && Boolean(selected.liveWork);
    const acquisitionWorkView = commentAcquisitionWork ? acquisitionWorkViewFor(state) : DEFAULT_ACQUISITION_WORK_VIEW;
    const fullDesktopOutreachWork = commentAcquisitionWork && acquisitionWorkView === "outreach";
    const conversionWork = commentAcquisitionWork && acquisitionWorkView === "conversion";
    const backgroundWork = realtimeWorkSurfaceFor(selected.id, selected.liveWork) === "background" && Boolean(selected.liveWork);
    const recoveryNotice = commentAcquisitionWork ? renderAuthorizationRecoveryNotice(selected, state, refreshRealtimeView) : null;
    if (recoveryNotice) root.appendChild(recoveryNotice);
    if (commentAcquisitionWork) workbar.appendChild(renderCommentAcquisitionSceneHeader(state, refreshRealtimeView));
    if (conversionWork) void loadAcquisitionReceptionConversations(selected, state);
    root.appendChild(workbar);
    const main = el("section", `sb-rw-main${inboxWork ? " is-inbox-work" : ""}${commentAcquisitionWork ? " is-comment-acquisition-work" : ""}${specialistWork ? " is-specialist-acquisition-work" : ""}${finderWork ? " is-finder-work" : ""}${analysisWork ? " is-analysis-work" : ""}${specialistWorksite === "outreach" ? " is-outreach-work" : ""}${liveDanmakuAnalysisWork ? " is-live-danmaku-analysis-work" : ""}${liveDanmakuOutreachWork ? " is-live-danmaku-outreach-work" : ""}${viralWorkAnalysisWork ? " is-viral-work-analysis-work" : ""}${fullDesktopOutreachWork ? " is-acquisition-full-desktop-work" : ""}${backgroundWork ? " is-background-work" : ""}`);
    if (fullDesktopOutreachWork) {
      ensureCloudReplay(selected.id);
      main.appendChild(renderAcquisitionFullDesktopView(selected, state));
      root.appendChild(main);
      if (!root.isConnected) page.body.appendChild(root);
      return;
    }
    if (specialistWorksite === "outreach") ensureCloudReplay(selected.id);
    if (liveDanmakuAnalysisWork || liveDanmakuOutreachWork) ensureCloudReplay(selected.id);
    if (!specialistWork && !inboxWork && !backgroundWork && !conversionWork) {
      const cloudPanel = el("article", `sb-rw-panel sb-rw-cloud-panel${commentAcquisitionWork ? " sb-rw-pure-live-panel" : ""}`);
      const douyinLiveWork = Boolean(selected?.liveWork && isDouyinCloudAgent(selected.id, selected.liveWork));
      const replay = state.cloudViewerReplays.get(selected.id);
      const replayPresentation = managedAccount ? cloudReplayPresentation(replay, selected.liveWork) : null;
      if (!commentAcquisitionWork && !douyinLiveWork) {
        const cloudHead = el("div", "sb-rw-panel-head");
        cloudHead.append(el("div", "sb-rw-panel-title", "任务实时状态"));
        const publicLiveLabel = activeLiveCount ? "真实任务同步" : erroredLiveCount ? "存在异常" : "已完成";
        const cloudStatusLabel = state.paused ? "已暂停" : publicLiveLabel;
        if (cloudStatusLabel) {
          const live = el("span", "sb-rw-live");
          live.append(el("i"), el("span", cloudStatusLabel));
          cloudHead.appendChild(live);
        }
        cloudPanel.appendChild(cloudHead);
      }
      if (douyinLiveWork) {
        const cloudWrap = el("div", "sb-rw-cloud-live-wrap");
        ensureCloudReplay(selected.id);
        const visibleStage = commentAcquisitionWork
          ? renderCommentAcquisitionLiveRoomStage(replay, replayPresentation, selected.liveWork)
          : (() => {
            const replayStage = el("div", "sb-rw-cloud-replay-stage");
            if (!replay) {
              replayStage.append(el("div", "sb-rw-cloud-replay-empty", replayPresentation.emptyText));
            } else if (replay.segments?.length) {
              const video = document.createElement("video");
              video.muted = true; video.autoplay = true; video.playsInline = true; video.preload = "auto";
              let index = 0;
              const play = () => {
                const current = replay.segments[index % replay.segments.length];
                video.src = current.url;
                video.setAttribute("aria-label", current.segment.title || "最近一次成功工作的录屏");
                const result = video.play?.();
                result?.catch?.(() => {});
              };
              video.addEventListener("ended", () => { index = (index + 1) % replay.segments.length; play(); });
              replayStage.appendChild(video);
              play();
            } else {
              replayStage.append(el("div", "sb-rw-cloud-replay-empty", replay.error ? "成功工作记录暂时无法读取" : replayPresentation.emptyText));
            }
            return replayStage;
          })();
        const cloudLive = el("div", "sb-rw-cloud-live sb-rw-cloud-capture-source"); cloudLive.setAttribute("aria-hidden", "true");
        const realtime = isAcquisitionRealtimeAgent(selected.id) ? acquisitionRealtimeViewModel(selected.id, selected.liveWork) : null;
        const recovery = authorizationRecoveryForWork(selected.liveWork);
        const cloudStatus = realtime?.cloudState === "online" ? "connected"
          : ["connecting", "recovering"].includes(realtime?.cloudState) ? "reconnecting"
            : realtime?.cloudState === "disconnected" ? "disconnected"
              : realtime?.cloudState === "auth-expired" ? "error" : "connecting";
        const viewer = state.cloudViewerStatuses.get(selected.id) || (recovery
          ? { status: "auth-expired", message: recovery.detail, reason: "auth-expired" }
          : { status: cloudStatus, message: "正在准备录屏采集", reason: "" });
        let frame = state.cloudViewerFrames.get(selected.id);
        if (!recovery && !frame) {
          frame = document.createElement("iframe");
          frame.title = `后台云电脑采集源 · ${selected.name}`;
          frame.allow = "clipboard-read; clipboard-write; fullscreen";
          frame.setAttribute("loading", "eager");
          frame.setAttribute("aria-hidden", "true");
          frame.tabIndex = -1;
          frame.src = douyinCloudViewerUrlFor(selected.id);
          state.cloudViewerFrames.set(selected.id, frame);
        }
        if (recovery && frame) {
          try { frame.src = "about:blank"; } catch {}
          frame.remove();
          state.cloudViewerFrames.delete(selected.id);
        } else if (frame) {
          cloudLive.appendChild(frame);
        }
        cloudWrap.append(cloudLive, visibleStage);
        const statusPrefix = recovery
          ? recovery.detail
          : selected.liveWork.lastError
            ? realtimeErrorText(selected.liveWork.lastError)
          : `${statusLabel(selected.status)} · ${realtime?.task || selected.liveWork.task || selected.task || "等待真实任务状态"}`;
        const statusText = el("span");
        if (!commentAcquisitionWork) {
          const liveStatus = el("div", "sb-rw-cloud-live-status");
          liveStatus.append(el("i"), statusText);
          cloudWrap.appendChild(liveStatus);
        }
        state.cloudViewerPresentations.set(selected.id, { cloudLive, statusText, statusPrefix, viewerState: null, viewerTitle: null, viewerMessage: null });
        updateCloudViewerPresentation(selected.id, viewer);
        cloudPanel.appendChild(cloudWrap);
      } else if (selected.liveWork || !managedAccount) {
        const liveTask = el("div", "sb-rw-live-task");
        liveTask.style.cssText = "min-height:350px;padding:28px 24px;background:#f3f7f5;color:#27352e;display:flex;flex-direction:column;justify-content:center;gap:12px";
        liveTask.append(el("div", null, `${statusLabel(selected.status)} · ${selected.phase}`), el("strong", null, selected.task || "正在执行真实任务"), el("span", null, selected.context?.activity || "等待真实采集服务回传"));
        const progressSource = selected.liveWork?.metadata?.progressSource;
        const progressValue = Number(selected.liveWork?.progress);
        if (progressSource === "provider" && Number.isFinite(progressValue)) {
          const track = el("div"); track.style.cssText = "height:7px;width:100%;overflow:hidden;border-radius:99px;background:#dfe9e4";
          const fill = el("i"); fill.style.cssText = `display:block;height:100%;width:${Math.max(0, Math.min(100, progressValue))}%;border-radius:inherit;background:#16a571;transition:width .35s ease`; track.appendChild(fill); liveTask.appendChild(track);
          liveTask.append(el("small", null, `${progressValue}% · provider 真实回传`));
        } else {
          liveTask.append(el("small", null, "真实执行状态已接入，等待 provider 回传"));
        }
        cloudPanel.appendChild(liveTask);
      } else {
        const liveTask = el("div", "sb-rw-live-task");
        liveTask.style.cssText = "min-height:350px;padding:28px 24px;background:#f3f7f5;color:#27352e;display:flex;flex-direction:column;justify-content:center;gap:12px";
        liveTask.append(el("strong", null, "真实云电脑未提供可用画面"), el("span", null, "当前任务没有返回云电脑画面地址，页面不会使用模拟画面代替。"));
        cloudPanel.appendChild(liveTask);
      }
      main.appendChild(cloudPanel);
    }
    if (finderWork) {
      const finderPanels = renderMockFinderWorksite(selected, state, refreshRealtimeView);
      main.append(finderPanels.liveRoomPanel, finderPanels.queuePanel, finderPanels.detailPanel);
    } else if (analysisWork) {
      const analysisPanels = renderMockAnalysisWorksite(selected, state, refreshRealtimeView);
      main.append(analysisPanels.sourcePanel, analysisPanels.queuePanel, analysisPanels.prospectPanel);
    } else if (specialistWorksite === "outreach") {
      const outreachPanels = renderOutreachSpecialistWorksite(selected, state, refreshRealtimeView);
      main.append(outreachPanels.prospectPanel, outreachPanels.replayPanel);
    } else if (liveDanmakuAnalysisWork) {
      const liveAnalysisPanels = renderLiveDanmakuAnalysisWorksite(selected, state, refreshRealtimeView);
      main.append(liveAnalysisPanels.liveRoomPanel, liveAnalysisPanels.queuePanel, liveAnalysisPanels.detailPanel);
    } else if (liveDanmakuOutreachWork) {
      const liveOutreachPanels = renderLiveDanmakuOutreachWorksite(selected, state, refreshRealtimeView);
      main.append(liveOutreachPanels.liveRoomPanel, liveOutreachPanels.pendingPanel, liveOutreachPanels.sentPanel);
    } else if (viralWorkAnalysisWork) {
      const viralPanels = renderViralWorkAnalysisWorksite(selected);
      main.append(viralPanels.sourcePanel, viralPanels.reportPanel);
    } else {
      const workUnitPanel = specialistWorksite === "conversion"
            ? renderAcquisitionConversionView(selected, state, refreshRealtimeView)
        : inboxWork
          ? renderInboxWorkbench(selected, state, refreshRealtimeView)
          : commentAcquisitionWork
            ? conversionWork
              ? renderAcquisitionConversionView(selected, state, refreshRealtimeView)
              : renderCommentAcquisitionQueuePanel(selected, state, refreshRealtimeView)
            : renderWorkUnitPanel(selected, state, refreshRealtimeView);
      main.appendChild(workUnitPanel);
    }

    if (commentAcquisitionWork && acquisitionWorkView === "outreach") {
      main.appendChild(renderAcquisitionFullDesktopView(selected, state));
    } else if (commentAcquisitionWork && acquisitionWorkView === "prospecting") {
      main.appendChild(renderCommentAcquisitionDetailPanel(selected, state));
    } else if (!inboxWork && !specialistWork) {
      const prospect = el("article", "sb-rw-panel sb-rw-prospect");
      renderRoleOutputPanel(prospect, selected, state, refreshRealtimeView);
      main.appendChild(prospect);
    }
    root.appendChild(main);

    if (!commentAcquisitionWork && !backgroundWork && !specialistWork) {
      const events = el("section", "sb-rw-panel sb-rw-events"); const eventHead = el("div", "sb-rw-panel-head"); const eventLive = el("span", "sb-rw-live"); eventLive.append(el("i"), el("span", "真实回传")); eventHead.append(el("div", "sb-rw-panel-title", "最近动态"), eventLive); events.appendChild(eventHead); const eventList = el("div", "sb-rw-events-list");
      if (state.events.length) {
        state.events.slice(0, 3).forEach((event) => { const item = el("div", "sb-rw-event"); const copy = el("div", "sb-rw-event-copy"); copy.append(el("div", "sb-rw-event-text", event), el("div", "sb-rw-event-time", "刚刚")); item.append(el("i", "sb-rw-event-dot"), copy); eventList.appendChild(item); });
      } else {
        eventList.appendChild(el("div", "sb-rw-events-empty", "等待 Agent 回传工作动态"));
      }
      events.appendChild(eventList); root.appendChild(events);
    }

    if (!root.isConnected) page.body.appendChild(root);
  }

  const refreshMountedRealtimeView = () => {
    const previousSelected = state.selected;
    syncLiveWorks();
    const selected = selectedAgent();
    if (!selected || state.selected !== previousSelected || !selected.liveWork || !isDouyinCloudAgent(selected.id, selected.liveWork)) return false;
    if (realtimeSpecialistWorksiteFor(selected.id, selected.liveWork)) return false;
    const inboxWork = ["mkt-dm-inbox", GOLD_CUSTOMER_SERVICE_AGENT_ID].includes(selected.id) && Boolean(selected.liveWork);
    const commentAcquisitionWork = selected.id === "mkt-comment-acquisition" && Boolean(selected.liveWork);
    const acquisitionWorkView = commentAcquisitionWork ? acquisitionWorkViewFor(state) : DEFAULT_ACQUISITION_WORK_VIEW;
    const fullDesktopOutreachWork = commentAcquisitionWork && acquisitionWorkView === "outreach";
    const conversionWork = commentAcquisitionWork && acquisitionWorkView === "conversion";
    const currentAcquisitionHeader = commentAcquisitionWork ? page.body.querySelector(".sb-rw-acquisition-scene-header") : null;
    const presentation = state.cloudViewerPresentations.get(selected.id);
    const main = page.body.querySelector(inboxWork
      ? ".sb-rw-main.is-inbox-work"
      : commentAcquisitionWork
        ? ".sb-rw-main.is-comment-acquisition-work"
        : ".sb-rw-main:not(.is-inbox-work):not(.is-comment-acquisition-work)");
    if (!main?.isConnected) return false;

    const workGroups = partitionRealtimeWorks(state.liveWorks);
    const activeAgents = liveAgentsForWorks(state.agents, [...workGroups.active, ...workGroups.attention]);
    const activeTeam = page.body.querySelector(".sb-rw-ai-team:not(.is-completed)");
    const completedSection = page.body.querySelector(".sb-rw-ai-team.is-completed");
    if (!activeTeam
      || Number(activeTeam.dataset.activeCount) !== activeAgents.length
      || Number(activeTeam.dataset.attentionCount) !== workGroups.attention.length
      || Boolean(completedSection) !== Boolean(workGroups.completed.length)
      || (completedSection && Number(completedSection.dataset.completedCount) !== workGroups.completed.length)) return false;

    if (fullDesktopOutreachWork) {
      render();
      return true;
    }

    const realtime = isAcquisitionRealtimeAgent(selected.id) ? acquisitionRealtimeViewModel(selected.id, selected.liveWork) : null;
    if (presentation) {
      const recovery = authorizationRecoveryForWork(selected.liveWork);
      presentation.statusPrefix = recovery
        ? recovery.detail
        : selected.liveWork.lastError
          ? realtimeErrorText(selected.liveWork.lastError)
        : `${statusLabel(selected.status)} · ${realtime?.task || selected.liveWork.task || selected.task || "等待真实任务状态"}`;
      const viewer = state.cloudViewerStatuses.get(selected.id) || (recovery
        ? { status: "auth-expired", message: recovery.detail, reason: "auth-expired" }
        : undefined);
      updateCloudViewerPresentation(selected.id, viewer);
      const liveTaskState = String(selected.liveWork.taskState || selected.liveWork.task_status || "").trim().toLowerCase();
      const liveTaskFinished = selected.liveWork.state === "done"
        || ["completed", "succeeded", "failed", "error", "cancelled", "canceled", "stopped"].includes(liveTaskState);
      if (viewer?.status === "connected" && !liveTaskFinished) requestCloudReplayRecording(selected.id);
    }

    const currentWorkPanel = main.querySelector(inboxWork
      ? ".sb-rw-inbox-workbench"
      : commentAcquisitionWork
        ? fullDesktopOutreachWork
          ? ".sb-rw-acquisition-full-desktop-panel"
          : acquisitionWorkView === "conversion"
            ? ".sb-rw-acquisition-conversion-workbench"
            : ".sb-rw-acquisition-queue-panel"
        : ".sb-rw-live-work-panel");
    if (fullDesktopOutreachWork || conversionWork) {
      currentWorkPanel?.replaceWith(fullDesktopOutreachWork
        ? renderAcquisitionFullDesktopView(selected, state)
        : renderAcquisitionConversionView(selected, state, refreshRealtimeView));
      syncAuthorizationRecoveryNotice(page.body.querySelector(".sb-realtime-page"), selected, state, refreshRealtimeView);
      currentAcquisitionHeader?.replaceWith(renderCommentAcquisitionSceneHeader(state, refreshRealtimeView));
      return true;
    }
    const currentAcquisitionDetailPanel = commentAcquisitionWork ? main.querySelector(".sb-rw-acquisition-detail-panel") : null;
    const currentProspectPanel = main.querySelector(".sb-rw-prospect");
    main.classList.toggle("is-inbox-work", inboxWork);
    main.classList.toggle("is-comment-acquisition-work", commentAcquisitionWork);
    const nextWorkPanel = inboxWork
      ? renderInboxWorkbench(selected, state, refreshRealtimeView)
      : commentAcquisitionWork
        ? renderCommentAcquisitionQueuePanel(selected, state, refreshRealtimeView)
        : renderWorkUnitPanel(selected, state, refreshRealtimeView);
    currentWorkPanel?.replaceWith(nextWorkPanel);
    if (commentAcquisitionWork) {
      syncAuthorizationRecoveryNotice(page.body.querySelector(".sb-realtime-page"), selected, state, refreshRealtimeView);
    }
    if (commentAcquisitionWork && currentAcquisitionDetailPanel) {
      currentAcquisitionDetailPanel.replaceWith(renderCommentAcquisitionDetailPanel(selected, state));
      currentAcquisitionHeader?.replaceWith(renderCommentAcquisitionSceneHeader(state, refreshRealtimeView));
    } else if (currentProspectPanel && !commentAcquisitionWork && !inboxWork) {
      const nextProspectPanel = el("article", "sb-rw-panel sb-rw-prospect");
      renderRoleOutputPanel(nextProspectPanel, selected, state, refreshRealtimeView);
      currentProspectPanel.replaceWith(nextProspectPanel);
    } else if (currentProspectPanel && (commentAcquisitionWork || inboxWork)) {
      currentProspectPanel.remove();
    }

    const root = page.body.querySelector(".sb-realtime-page");
    if (root) {
      updateAgentCards(root, activeAgents, ".sb-rw-team:not(.sb-rw-completed-team)", "", "runningAgentRailScrollLeft");
      updateAgentCards(root, liveAgentsForWorks(state.agents, workGroups.completed), ".sb-rw-completed-team", "", "completedAgentRailScrollLeft");
    }
    const eventList = root?.querySelector(".sb-rw-events-list");
    if (eventList) {
      eventList.textContent = "";
      if (state.events.length) {
        state.events.slice(0, 3).forEach((event) => {
          const item = el("div", "sb-rw-event");
          const copy = el("div", "sb-rw-event-copy");
          copy.append(el("div", "sb-rw-event-text", event), el("div", "sb-rw-event-time", "刚刚"));
          item.append(el("i", "sb-rw-event-dot"), copy);
          eventList.appendChild(item);
        });
      } else {
        eventList.appendChild(el("div", "sb-rw-events-empty", "等待 Agent 回传工作动态"));
      }
    }
    return true;
  };

  const refreshRealtimeView = ({ structural = false } = {}) => {
    if (state.paused || !page.root.isConnected) return;
    if (structural || !refreshMountedRealtimeView()) render();
  };
  state.refreshView = refreshRealtimeView;

  const refreshRemoteOfficeStatus = async () => {
    if (disposed || remoteOfficeRefreshPending) return remoteOfficeRefreshPending;
    remoteOfficeRefreshPending = (async () => {
      const config = globalThis.__SALEBUDDY_CONFIG__ || {};
      const key = config.controlPlaneApiKey || document.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content;
      const header = (config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
      const headers = { accept: "application/json" };
      if (key) headers[header] = header === "authorization" ? `Bearer ${key}` : key;
      try {
        const response = await fetch(`${receptionBaseUrl()}/v1/office/status`, { headers, cache: "no-store" });
        if (!response.ok) throw new Error(`Office status request failed: ${response.status}`);
        const result = await response.json();
        state.remoteOfficeSnapshot = Array.isArray(result?.works) ? result.works : [];
        state.remoteOfficeWorks = officeStatusWorksToRealtimeWorks(result.taskWorks || state.remoteOfficeSnapshot, state.accounts);
        if (!disposed) refreshRealtimeView();
      } catch {
        // Keep local work visible when the control plane is temporarily unavailable.
      } finally {
        remoteOfficeRefreshPending = null;
      }
    })();
    return remoteOfficeRefreshPending;
  };

  state.reauthorizeAgent = async (agent, button, onChange) => {
    if (!agent?.liveWork || button?.disabled) return;
    const agentId = String(agent.id || "").trim();
    if (!agentId) return;
    const baseUrl = receptionBaseUrl();
    const originalLabel = button?.textContent || "重新连接账号";
    if (button) {
      button.disabled = true;
      button.textContent = "正在打开登录…";
    }
    const requestLoginWindow = async () => {
      const headers = { accept: "application/json", "content-type": "application/json" };
      let response = await fetch(`${baseUrl}/v1/douyin/mcp/open-login`, {
        method: "POST",
        headers,
        body: JSON.stringify({ agentId, force: true, wantQr: true })
      });
      let payload = await response.json().catch(() => null);
      const pageUrl = payload?.cloudViewUrl || payload?.cloud_view_url || payload?.viewUrl || payload?.view_url
        || payload?.viewPageUrl || payload?.view_page_url || payload?.pageUrl || payload?.loginUrl || payload?.login_url;
      if (response.ok && pageUrl) return { login: payload, pageUrl };

      const startedResponse = await fetch(`${baseUrl}/v1/douyin/mcp/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({ agentId })
      });
      const started = await startedResponse.json().catch(() => null);
      if (!startedResponse.ok || started?.ok === false) throw new Error(started?.error?.message || "云电脑启动失败");

      response = await fetch(`${baseUrl}/v1/douyin/mcp/open-login`, {
        method: "POST",
        headers,
        body: JSON.stringify({ agentId, force: true, wantQr: true })
      });
      payload = await response.json().catch(() => null);
      const refreshedPageUrl = payload?.cloudViewUrl || payload?.cloud_view_url || payload?.viewUrl || payload?.view_url
        || payload?.viewPageUrl || payload?.view_page_url || payload?.pageUrl || payload?.loginUrl || payload?.login_url;
      if (!response.ok || !refreshedPageUrl) throw new Error(payload?.error?.message || "云电脑没有返回登录画面");
      return { started, login: payload, pageUrl: refreshedPageUrl };
    };
    const checkAuthorization = async () => {
      const response = await fetch(`${baseUrl}/v1/douyin/mcp/check-login`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ agentId, reqId: `reauthorize:${agentId}:${Date.now()}` })
      });
      const status = await response.json().catch(() => null);
      const loginState = String(status?.login_state || status?.loginState || "").toLowerCase();
      const raw = status?.account && typeof status.account === "object" ? status.account : {};
      const identity = accountIdentityFor(raw);
      const verified = ["logged_in", "authenticated", "authorized", "ready", "success", "已登录"].includes(loginState)
        && Boolean(identity.profileUrl || identity.profile_url || identity.uniqueId || identity.unique_id || identity.uid || identity.secId || identity.sec_id);
      if (!response.ok || !verified) throw new Error("尚未检测到抖音登录，请在云电脑内完成登录后再检查");
      return { state: "READY", authenticationVerified: true, accountIdentity: identity };
    };
    try {
      const { started, login, pageUrl } = await requestLoginWindow();
      if (button) button.textContent = "请完成登录";
      openDouyinAuthorization({
        account: agent.liveWork.metadata?.accountLabel || "当前抖音账号",
        scopes: ["账号身份", "自己的作品评论", "当前找人任务"],
        session: { ...started, ...login, agentId, pageUrl, cloudViewUrl: pageUrl, source: "douyin-mcp" },
        refreshCloudView: async () => {
          const { login: refreshed, pageUrl: refreshedPageUrl } = await requestLoginWindow();
          return { ...refreshed, agentId, pageUrl: refreshedPageUrl, cloudViewUrl: refreshedPageUrl, source: "douyin-mcp" };
        },
        checkAuthorization,
        onAuthorized: () => {
          void (async () => {
            try {
              let gateway = state.gateway;
              if (!gateway?.action) gateway = await globalThis.__SALEBUDDY__?.gatewayReady?.catch?.(() => null);
              if (!gateway?.action) throw new Error("控制面暂不可用");
              await gateway.action("task.resume", acquisitionRealtimeActionPayload(agentId, "resume", agent.liveWork));
              state.cloudViewerStatuses.delete(agentId);
              state.events = [`${agent.name}：账号已重新连接，原任务正在继续`, ...state.events].slice(0, 8);
              await refreshRemoteOfficeStatus();
            } catch (error) {
              state.events = [`${agent.name}：账号已连接，但恢复原任务失败：${error?.message || "请稍后重试"}`, ...state.events].slice(0, 8);
            } finally {
              if (button) {
                button.disabled = false;
                button.textContent = originalLabel;
              }
              onChange?.();
            }
          })();
        },
        onCancelled: () => {
          if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
          }
        }
      });
    } catch (error) {
      state.events = [`${agent.name}：无法打开账号登录：${error?.message || "请稍后重试"}`, ...state.events].slice(0, 8);
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
      onChange?.();
    }
  };

  render();
  const refreshAuthorizedAccounts = async () => {
    const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
      || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
      || "http://127.0.0.1:6681";
    try {
      const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/v1/connectors/douyin/accounts`, {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => null);
      const authorized = applyAuthoritativeManagedAccountDirectory(state, result?.accounts || []);
      if (!page.root.isConnected && disposed) return;
      state.remoteOfficeWorks = officeStatusWorksToRealtimeWorks(result.taskWorks || state.remoteOfficeSnapshot, state.accounts);
      render();
    } catch {
      // Keep the truthful empty state when the account source is unavailable.
    } finally {
    }
  };
  // This endpoint reads persisted session identities only. It does not probe
  // or occupy the remote MCP worker connection.
  if (!state.stylePreview) {
    void refreshAuthorizedAccounts();
    void refreshRemoteOfficeStatus();
    remoteOfficeTimer = globalThis.setInterval?.(() => { void refreshRemoteOfficeStatus(); }, 3000) || null;
  }
  const originalClose = page.close;
  page.close = () => {
    state.disposed = true;
    disposed = true;
    if (state.accountSetup?.timer != null) globalThis.clearInterval(state.accountSetup.timer);
    if (remoteOfficeTimer != null) globalThis.clearInterval(remoteOfficeTimer);
    unsubscribe?.();
    unsubscribe = null;
    unsubscribeLiveWork?.();
    unsubscribeLiveWork = null;
    globalThis.removeEventListener?.("message", onCloudViewerMessage);
    for (const frame of state.cloudViewerFrames.values()) {
      try { frame.src = "about:blank"; } catch {}
    }
    state.cloudViewerFrames.clear();
    state.cloudViewerPresentations.clear();
    state.cloudViewerCaptures.clear();
    state.cloudViewerCaptureSignatures.clear();
    state.cloudViewerRecordings.clear();
    state.cloudViewerRecordingSignatures.clear();
    for (const replay of state.cloudViewerReplays.values()) {
      replay?.segments?.forEach(({ url }) => { try { globalThis.URL?.revokeObjectURL?.(url); } catch {} });
    }
    state.cloudViewerReplays.clear();
    state.cloudViewerReplayLoads.clear();
    state.cloudViewerReplayMarkedTasks.clear();
    state.receptionConversationLoads.clear();
    originalClose();
  };
  // Keep the live source warm for pages that already expose a shared team stream.
  unsubscribe = teamLive?.subscribe?.(refreshRealtimeView) || null;
  unsubscribeLiveWork = subscribeWork(refreshRealtimeView);
  return page;
}
