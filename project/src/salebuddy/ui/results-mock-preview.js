const MOCK_AVATARS = Object.freeze([
  new URL("../../../assets/agents/human/generated-avatar-v2-01.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-03.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-05.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-06.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-07.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-08.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v3-01.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v3-02.png", import.meta.url).href
]);
const MOCK_SOURCE_ACCOUNT_AVATAR = new URL("../../../assets/accounts/store-avatar-goods.png", import.meta.url).href;

const MOCK_NOW = "2026-09-14T10:30:00.000Z";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function mockSource({ type, scope, accountName, accountId, workTitle, observedAt, accountAvatar = MOCK_SOURCE_ACCOUNT_AVATAR }) {
  return {
    type,
    sourceScope: scope,
    accountName,
    accountId,
    accountAvatar,
    videoTitle: workTitle,
    taskId: "mock-results-prospect-scan",
    observedAt
  };
}

function mockContactability(sourceScope) {
  return {
    allowed: true,
    sourceScope,
    reason: "来自用户已授权账号的作品、直播或互动"
  };
}

function mockEvidence(quote, observedAt) {
  return [{ quote, observedAt, videoId: "mock-video-ev-launch" }];
}

const MOCK_RECORDS = Object.freeze([
  {
    id: "mock-prospect-shanghai-zhou",
    name: "上海周先生",
    handle: "zhou_ev_2026",
    profileUrl: "https://www.douyin.com/user/mock-sec-zhou-ev-2026",
    avatar: MOCK_AVATARS[0],
    status: "待确认触达",
    tier: "high",
    score: 94,
    tags: ["询问价格", "直播间用户"],
    city: "上海",
    owner: "客户分析员",
    reason: "主动询问到店试驾和现车情况，购买信号明确。",
    source: mockSource({
      type: "直播间弹幕",
      scope: "own_account_live",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "新能源 SUV 周末试驾直播",
      observedAt: "2026-09-14T09:18:00.000Z"
    }),
    contactability: mockContactability("own_account_live"),
    evidence: mockEvidence("周末能安排试驾吗？上海店现在有现车吗？", "2026-09-14T09:18:00.000Z"),
    createdAt: "2026-09-14T09:18:00.000Z",
    updatedAt: "2026-09-14T09:18:00.000Z",
    lastSeen: "2026-09-14T09:18:00.000Z"
  },
  {
    id: "mock-prospect-hangzhou-lin",
    name: "杭州林女士",
    handle: "linlin_familycar",
    profileUrl: "https://www.douyin.com/user/mock-sec-lin-familycar",
    avatar: MOCK_AVATARS[1],
    status: "待触达",
    tier: "high",
    score: 89,
    tags: ["零首付", "家庭用车"],
    city: "杭州",
    owner: "获客专家",
    reason: "在作品评论区连续追问金融方案，适合优先私信承接。",
    source: mockSource({
      type: "作品评论",
      scope: "own_account_comments",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "新能源 SUV 金融政策说明",
      observedAt: "2026-09-14T09:04:00.000Z"
    }),
    contactability: mockContactability("own_account_comments"),
    evidence: mockEvidence("可以零首付分期吗？家里两个人带宝宝用够不够？", "2026-09-14T09:04:00.000Z"),
    createdAt: "2026-09-14T09:04:00.000Z",
    updatedAt: "2026-09-14T09:04:00.000Z",
    lastSeen: "2026-09-14T09:04:00.000Z"
  },
  {
    id: "mock-prospect-suzhou-chen",
    name: "苏州陈先生",
    handle: "chen_suzhou_ev",
    profileUrl: "https://www.douyin.com/user/mock-sec-chen-suzhou-ev",
    avatar: MOCK_AVATARS[2],
    status: "已触达",
    outreachStatus: "sent",
    replyStatus: "未回复",
    tier: "medium",
    score: 82,
    tags: ["询问价格", "已触达"],
    city: "苏州",
    owner: "潜客触达专员",
    reason: "比较了两款车型的配置与价格，首次私信已发送。",
    source: mockSource({
      type: "作品评论",
      scope: "own_account_comments",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "两款 SUV 配置对比",
      observedAt: "2026-09-14T08:52:00.000Z"
    }),
    contactability: mockContactability("own_account_comments"),
    evidence: mockEvidence("E300 和 X7 哪个后排更舒服？落地大概差多少？", "2026-09-14T08:52:00.000Z"),
    createdAt: "2026-09-14T08:52:00.000Z",
    updatedAt: "2026-09-14T10:06:00.000Z",
    lastSeen: "2026-09-14T10:06:00.000Z"
  },
  {
    id: "mock-prospect-ningbo-cheng",
    name: "宁波程女士",
    handle: "cheng_ev_life",
    profileUrl: "https://www.douyin.com/user/mock-sec-cheng-ev-life",
    avatar: MOCK_AVATARS[3],
    status: "已触达",
    outreachStatus: "sent",
    replyStatus: "未回复",
    tier: "medium",
    score: 78,
    tags: ["补贴咨询", "已触达"],
    city: "宁波",
    owner: "潜客触达专员",
    reason: "关注置换补贴与门店库存，已发送个性化私信等待回复。",
    source: mockSource({
      type: "账号互动",
      scope: "own_account_interactions",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "置换补贴政策直播回放",
      observedAt: "2026-09-14T08:41:00.000Z"
    }),
    contactability: mockContactability("own_account_interactions"),
    evidence: mockEvidence("旧车置换的补贴现在还有吗？", "2026-09-14T08:41:00.000Z"),
    createdAt: "2026-09-14T08:41:00.000Z",
    updatedAt: "2026-09-14T09:57:00.000Z",
    lastSeen: "2026-09-14T09:57:00.000Z"
  },
  {
    id: "mock-prospect-shaoxing-tang",
    name: "绍兴唐女士",
    handle: "tang_tang_sx",
    profileUrl: "https://www.douyin.com/user/mock-sec-tang-tang-sx",
    avatar: MOCK_AVATARS[4],
    status: "已触达",
    outreachStatus: "sent",
    replyStatus: "已回复",
    replied: true,
    tier: "high",
    score: 91,
    tags: ["到店试驾", "已回复"],
    city: "绍兴",
    owner: "私信客服",
    reason: "已确认近期到店意愿，并主动询问工作日试驾档期。",
    source: mockSource({
      type: "直播间弹幕",
      scope: "own_account_live",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "新能源 SUV 周末试驾直播",
      observedAt: "2026-09-14T08:27:00.000Z"
    }),
    contactability: mockContactability("own_account_live"),
    evidence: mockEvidence("这周工作日晚上能试驾吗？", "2026-09-14T08:27:00.000Z"),
    createdAt: "2026-09-14T08:27:00.000Z",
    updatedAt: "2026-09-14T10:12:00.000Z",
    lastSeen: "2026-09-14T10:12:00.000Z"
  },
  {
    id: "mock-prospect-jiaxing-wu",
    name: "嘉兴吴先生",
    handle: "wu_jx_newcar",
    profileUrl: "https://www.douyin.com/user/mock-sec-wu-jx-newcar",
    avatar: MOCK_AVATARS[5],
    status: "已触达",
    outreachStatus: "sent",
    replyStatus: "已回复",
    replied: true,
    tier: "medium",
    score: 84,
    tags: ["车型对比", "已回复"],
    city: "嘉兴",
    owner: "私信客服",
    reason: "回复中明确提到近期购车计划，正在确认配置偏好。",
    source: mockSource({
      type: "作品评论",
      scope: "own_account_comments",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "E300 长途续航实测",
      observedAt: "2026-09-14T08:14:00.000Z"
    }),
    contactability: mockContactability("own_account_comments"),
    evidence: mockEvidence("我通勤加周末回老家，续航够用吗？", "2026-09-14T08:14:00.000Z"),
    createdAt: "2026-09-14T08:14:00.000Z",
    updatedAt: "2026-09-14T10:18:00.000Z",
    lastSeen: "2026-09-14T10:18:00.000Z"
  },
  {
    id: "mock-prospect-nanjing-xu",
    name: "南京徐女士",
    handle: "xu_nan_ev",
    profileUrl: "https://www.douyin.com/user/mock-sec-xu-nan-ev",
    avatar: MOCK_AVATARS[6],
    status: "已留资",
    outreachStatus: "sent",
    replyStatus: "已回复",
    replied: true,
    contactStatus: "已留资",
    leadStatus: "已留资",
    conversionStatus: "跟进中",
    contact: { wechat: "nanjing_ev_xu" },
    tier: "high",
    score: 96,
    tags: ["到店试驾", "已留资"],
    city: "南京",
    owner: "私信客服",
    reason: "用户留下微信，希望先收到门店库存和试驾安排。",
    source: mockSource({
      type: "私信承接",
      scope: "own_inbox",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "到店试驾私信承接",
      observedAt: "2026-09-14T08:06:00.000Z"
    }),
    contactability: mockContactability("own_inbox"),
    evidence: mockEvidence("可以加微信发一下现车颜色和周末档期吗？", "2026-09-14T08:06:00.000Z"),
    leadCaptureEvidence: [{
      detectedFields: ["wechat"],
      sourceAccount: { name: "臻选新能源 · 上海" },
      observedAt: "2026-09-14T10:22:00.000Z",
      messageId: "mock-message-nanjing-xu",
      quote: "微信是 nanjing_ev_xu，麻烦把试驾时间发我。"
    }],
    createdAt: "2026-09-14T08:06:00.000Z",
    updatedAt: "2026-09-14T10:22:00.000Z",
    lastSeen: "2026-09-14T10:22:00.000Z"
  },
  {
    id: "mock-prospect-hefei-zhao",
    name: "合肥赵先生",
    handle: "zhao_hefei_ev",
    profileUrl: "https://www.douyin.com/user/mock-sec-zhao-hefei-ev",
    avatar: MOCK_AVATARS[7],
    status: "已留资",
    outreachStatus: "sent",
    replyStatus: "已回复",
    replied: true,
    contactStatus: "已留资",
    leadStatus: "已留资",
    conversionStatus: "已转化",
    convertedAt: "2026-09-14T10:26:00.000Z",
    conversionNote: "已确认到店，门店顾问已接手。",
    contact: { wechat: "hefei_zhao_ev" },
    tier: "high",
    score: 98,
    tags: ["到店成交", "已转化"],
    city: "合肥",
    owner: "门店顾问",
    reason: "完成留资并确认到店时间，已转交门店顾问继续成交。",
    source: mockSource({
      type: "私信承接",
      scope: "own_inbox",
      accountName: "臻选新能源 · 上海",
      accountId: "mock-account-automotive",
      workTitle: "高意向客户私信承接",
      observedAt: "2026-09-14T07:54:00.000Z"
    }),
    contactability: mockContactability("own_inbox"),
    evidence: mockEvidence("周六下午两点可以到店，留个微信方便确认。", "2026-09-14T07:54:00.000Z"),
    leadCaptureEvidence: [{
      detectedFields: ["wechat"],
      sourceAccount: { name: "臻选新能源 · 上海" },
      observedAt: "2026-09-14T10:26:00.000Z",
      messageId: "mock-message-hefei-zhao",
      quote: "我的微信 hefei_zhao_ev，周六两点到店。"
    }],
    createdAt: "2026-09-14T07:54:00.000Z",
    updatedAt: "2026-09-14T10:26:00.000Z",
    lastSeen: "2026-09-14T10:26:00.000Z"
  }
]);

const MOCK_RUNS = Object.freeze([
  {
    taskId: "mock-results-prospect-scan",
    ownerKey: "mkt-comment-acquisition::mock-results-prospect-scan::mock-account-automotive",
    accountId: "mock-account-automotive",
    agentId: "mkt-comment-acquisition",
    agentName: "获客专家",
    resultType: "潜客",
    title: "新能源 SUV 互动潜客筛选",
    summary: "从直播、评论和账号互动中整理出 8 位可继续推进的潜客。",
    source: "已授权账号互动",
    sourceScope: "own_account_all_signals",
    contactability: mockContactability("own_account_all_signals"),
    status: "completed",
    counts: { discovered: 8, qualified: 8, delivered: 8 },
    items: MOCK_RECORDS,
    generatedAt: MOCK_NOW
  }
]);

const MOCK_FILES = Object.freeze([
  {
    id: "mock-results-file-weekly-review",
    name: "9月第2周潜客转化复盘.md",
    type: "doc",
    projectName: "潜客线索",
    taskId: "mock-results-prospect-scan",
    agentId: "mkt-intent-analyst",
    createdBy: "客户分析员",
    sourceTaskTitle: "新能源 SUV 互动潜客筛选",
    summary: "汇总本周获客、触达、回复与留资的转化表现。",
    created_at: "2026-09-14T10:30:00.000Z",
    updated_at: "2026-09-14T10:30:00.000Z",
    content: "# 9月第2周潜客转化复盘\n\n## 转化概览\n- 获取潜客：8 位\n- 完成私信触达：6 位\n- 收到客户回复：4 位\n- 完成留资：2 位\n- 已确认转化：1 位\n\n## 重点结论\n- 直播间试驾与现车咨询的意向最明确，应在 10 分钟内进入私信承接。\n- 已回复但未留资的客户，需要围绕试驾档期与库存信息继续推进。\n\n## 下一步\n- 优先跟进绍兴唐女士与嘉兴吴先生。\n- 将合肥赵先生同步给门店顾问，确认到店后的转化回传。"
  },
  {
    id: "mock-results-file-prospect-list",
    name: "高意向潜客清单.csv",
    type: "sheet",
    projectName: "潜客线索",
    taskId: "mock-results-prospect-scan",
    agentId: "mkt-comment-acquisition",
    createdBy: "获客专家",
    sourceTaskTitle: "新能源 SUV 互动潜客筛选",
    summary: "保留高意向用户的来源、证据和当前进展。",
    created_at: "2026-09-14T10:18:00.000Z",
    updated_at: "2026-09-14T10:18:00.000Z",
    content: "客户,城市,来源,意向等级,当前进展\n上海周先生,上海,直播间弹幕,A,待触达\n杭州林女士,杭州,作品评论,A,待触达\n绍兴唐女士,绍兴,直播间弹幕,A,已回复\n南京徐女士,南京,私信承接,A,已留资\n合肥赵先生,合肥,私信承接,A,已转化"
  },
  {
    id: "mock-results-file-inbox-playbook",
    name: "私信承接话术复盘.md",
    type: "doc",
    projectName: "对话策略",
    taskId: "mock-results-inbox-review",
    agentId: "mkt-dm-inbox",
    createdBy: "私信客服",
    sourceTaskTitle: "高意向客户私信承接",
    summary: "沉淀已回复客户的接待节奏和下一步话术。",
    created_at: "2026-09-14T10:26:00.000Z",
    updated_at: "2026-09-14T10:26:00.000Z",
    content: "# 私信承接话术复盘\n\n## 有效切入\n- 先确认用户问题，再给出与所在城市相关的库存或试驾信息。\n- 用户回复后，不重复推销，优先给出一个明确的下一步。\n\n## 留资信号\n- 主动询问到店时间。\n- 请求通过微信接收配置、库存或试驾安排。\n\n> Mock 预览数据，仅用于展示成果中心的完整信息层级。"
  }
]);

export function isResultsMockPreview(search = globalThis.location?.search, { hostname = globalThis.location?.hostname } = {}) {
  const params = new URLSearchParams(String(search || ""));
  if (params.get("preview") !== "style") return false;
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  const localHost = !normalizedHost || normalizedHost === "localhost" || normalizedHost === "127.0.0.1" || normalizedHost === "::1";
  return localHost || globalThis.__SALEBUDDY_CONFIG__?.allowStylePreview === true;
}

export function createResultsMockPreviewData() {
  return copy({ records: MOCK_RECORDS, runs: MOCK_RUNS });
}

export function createResultsMockPreviewFiles() {
  return copy(MOCK_FILES);
}
