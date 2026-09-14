import { isResultsMockPreview } from "./results-mock-preview.js";

const MOCK_NOW = "2026-09-14T10:30:00.000Z";
const MOCK_SOURCE_ACCOUNT_AVATAR = new URL("../../../assets/accounts/store-avatar-goods.png", import.meta.url).href;
const MOCK_AVATARS = Object.freeze([
  new URL("../../../assets/agents/human/generated-avatar-v2-01.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-03.png", import.meta.url).href,
  new URL("../../../assets/agents/human/generated-avatar-v2-05.png", import.meta.url).href
]);

const MOCK_ACCOUNT = Object.freeze({
  id: "mock-account-automotive",
  accountKey: "mock-account-automotive",
  agentId: "mkt-cold-writer",
  name: "臻选新能源 · 上海",
  handle: "zhenxuan_newenergy_sh",
  source: "mock",
  mock: true,
  identity: {
    secId: "mock-account-automotive",
    uniqueId: "zhenxuan_newenergy_sh",
    accountName: "臻选新能源 · 上海",
    nickname: "臻选新能源 · 上海",
    avatarUrl: MOCK_SOURCE_ACCOUNT_AVATAR,
    profileUrl: "https://www.douyin.com/user/mock-account-automotive"
  }
});

const MOCK_RECORDS = Object.freeze([
  {
    id: "mock-outreach-shanghai-zhou",
    name: "上海周先生",
    handle: "zhou_ev_2026",
    secId: "mock-sec-zhou-ev-2026",
    secUid: "mock-sec-zhou-ev-2026",
    profileUrl: "https://www.douyin.com/user/mock-sec-zhou-ev-2026",
    avatar: MOCK_AVATARS[0],
    status: "待确认触达",
    tier: "high",
    score: 94,
    tags: ["询问价格", "直播间用户"],
    city: "上海",
    reason: "主动询问到店试驾和现车情况，购买信号明确。",
    source: {
      type: "直播间弹幕",
      sourceScope: "own_account_live",
      accountName: MOCK_ACCOUNT.name,
      accountId: MOCK_ACCOUNT.id,
      accountAvatar: MOCK_SOURCE_ACCOUNT_AVATAR,
      videoTitle: "新能源 SUV 周末试驾直播",
      taskId: "mock-outreach-prospect-analysis",
      observedAt: "2026-09-14T09:18:00.000Z"
    },
    contactability: {
      allowed: true,
      sourceScope: "own_account_live",
      reason: "来自用户已授权账号的直播互动"
    },
    evidence: [{ quote: "周末能安排试驾吗？上海店现在有现车吗？", observedAt: "2026-09-14T09:18:00.000Z" }],
    createdAt: "2026-09-14T09:18:00.000Z",
    updatedAt: "2026-09-14T10:20:00.000Z",
    lastSeen: "2026-09-14T10:20:00.000Z"
  },
  {
    id: "mock-outreach-hangzhou-lin",
    name: "杭州林女士",
    handle: "linlin_familycar",
    secId: "mock-sec-lin-familycar",
    secUid: "mock-sec-lin-familycar",
    profileUrl: "https://www.douyin.com/user/mock-sec-lin-familycar",
    avatar: MOCK_AVATARS[1],
    status: "待确认触达",
    tier: "high",
    score: 89,
    tags: ["零首付", "家庭用车"],
    city: "杭州",
    reason: "在作品评论区连续追问金融方案，适合优先私信承接。",
    source: {
      type: "作品评论",
      sourceScope: "own_account_comments",
      accountName: MOCK_ACCOUNT.name,
      accountId: MOCK_ACCOUNT.id,
      accountAvatar: MOCK_SOURCE_ACCOUNT_AVATAR,
      videoTitle: "新能源 SUV 金融政策说明",
      taskId: "mock-outreach-prospect-analysis",
      observedAt: "2026-09-14T09:04:00.000Z"
    },
    contactability: {
      allowed: true,
      sourceScope: "own_account_comments",
      reason: "来自用户已授权账号的作品评论"
    },
    evidence: [{ quote: "可以零首付分期吗？家里两个人带宝宝用够不够？", observedAt: "2026-09-14T09:04:00.000Z" }],
    createdAt: "2026-09-14T09:04:00.000Z",
    updatedAt: "2026-09-14T10:20:00.000Z",
    lastSeen: "2026-09-14T10:20:00.000Z"
  },
  {
    id: "mock-outreach-ningbo-cheng",
    name: "宁波程女士",
    handle: "cheng_ev_life",
    secId: "mock-sec-cheng-ev-life",
    secUid: "mock-sec-cheng-ev-life",
    profileUrl: "https://www.douyin.com/user/mock-sec-cheng-ev-life",
    avatar: MOCK_AVATARS[2],
    status: "待确认触达",
    tier: "medium",
    score: 83,
    tags: ["置换补贴", "账号互动"],
    city: "宁波",
    reason: "关注置换补贴与门店库存，具备进一步沟通价值。",
    source: {
      type: "账号互动",
      sourceScope: "own_account_interactions",
      accountName: MOCK_ACCOUNT.name,
      accountId: MOCK_ACCOUNT.id,
      accountAvatar: MOCK_SOURCE_ACCOUNT_AVATAR,
      videoTitle: "置换补贴政策直播回放",
      taskId: "mock-outreach-prospect-analysis",
      observedAt: "2026-09-14T08:41:00.000Z"
    },
    contactability: {
      allowed: true,
      sourceScope: "own_account_interactions",
      reason: "来自用户已授权账号的账号互动"
    },
    evidence: [{ quote: "旧车置换的补贴现在还有吗？", observedAt: "2026-09-14T08:41:00.000Z" }],
    createdAt: "2026-09-14T08:41:00.000Z",
    updatedAt: "2026-09-14T10:20:00.000Z",
    lastSeen: "2026-09-14T10:20:00.000Z"
  },
  {
    id: "mock-outreach-shaoxing-tang",
    name: "绍兴唐女士",
    handle: "tang_tang_sx",
    secId: "mock-sec-tang-sx",
    secUid: "mock-sec-tang-sx",
    profileUrl: "https://www.douyin.com/user/mock-sec-tang-sx",
    avatar: MOCK_AVATARS[1],
    status: "已触达",
    outreachStatus: "sent",
    replyStatus: "未回复",
    tier: "high",
    score: 86,
    tags: ["已触达", "直播间用户"],
    reason: "已在本批次前完成首轮私信触达，不再重复出现。",
    source: {
      type: "直播间弹幕",
      sourceScope: "own_account_live",
      accountName: MOCK_ACCOUNT.name,
      accountId: MOCK_ACCOUNT.id,
      accountAvatar: MOCK_SOURCE_ACCOUNT_AVATAR,
      videoTitle: "新能源车型直播间",
      taskId: "mock-outreach-previous-run",
      observedAt: "2026-09-13T16:20:00.000Z"
    },
    contactability: {
      allowed: true,
      sourceScope: "own_account_live",
      reason: "来自用户已授权账号的直播互动"
    },
    evidence: [{ quote: "想问一下这款车的落地价。", observedAt: "2026-09-13T16:20:00.000Z" }],
    createdAt: "2026-09-13T16:20:00.000Z",
    updatedAt: "2026-09-14T09:40:00.000Z",
    lastSeen: "2026-09-14T09:40:00.000Z"
  },
  {
    id: "mock-outreach-jiaxing-wu",
    name: "嘉兴吴先生",
    handle: "wu_jx_newcar",
    secId: "mock-sec-wu-jx",
    secUid: "mock-sec-wu-jx",
    profileUrl: "https://www.douyin.com/user/mock-sec-wu-jx",
    avatar: MOCK_AVATARS[2],
    status: "触达中",
    outreachStatus: "pending",
    tier: "medium",
    score: 78,
    tags: ["触达中", "价格咨询"],
    reason: "已有一条私信提交，正在等待平台最终回执。",
    source: {
      type: "作品评论",
      sourceScope: "own_account_comments",
      accountName: MOCK_ACCOUNT.name,
      accountId: MOCK_ACCOUNT.id,
      accountAvatar: MOCK_SOURCE_ACCOUNT_AVATAR,
      videoTitle: "新能源车型价格说明",
      taskId: "mock-outreach-previous-run",
      observedAt: "2026-09-14T09:42:00.000Z"
    },
    contactability: {
      allowed: true,
      sourceScope: "own_account_comments",
      reason: "来自用户已授权账号的作品评论"
    },
    evidence: [{ quote: "这个价格包含购置税吗？", observedAt: "2026-09-14T09:42:00.000Z" }],
    createdAt: "2026-09-14T09:42:00.000Z",
    updatedAt: "2026-09-14T09:48:00.000Z",
    lastSeen: "2026-09-14T09:48:00.000Z"
  }
]);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function isPrivateOutreachMockPreview({ search = globalThis.location?.search, hostname = globalThis.location?.hostname } = {}) {
  return isResultsMockPreview(search, { hostname });
}

export function createPrivateOutreachMockData() {
  return copy({ account: MOCK_ACCOUNT, records: MOCK_RECORDS });
}

export function createPrivateOutreachMockResult(entries = [], message = "") {
  const targets = Array.isArray(entries) ? entries : [];
  const sentAt = MOCK_NOW;
  const resultEntries = targets.map((entry) => ({
    ...copy(entry),
    status: "sent",
    error: null,
    submittedAt: sentAt,
    receiptAt: sentAt,
    sentAt,
    providerResult: {
      mock: true,
      state: "sent",
      message: String(message || "")
    }
  }));
  return {
    total: resultEntries.length,
    sent: resultEntries.length,
    failed: 0,
    unknown: 0,
    status: "completed",
    entries: resultEntries,
    mock: true,
    completedAt: sentAt
  };
}
