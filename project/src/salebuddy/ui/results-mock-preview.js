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
const MOCK_VIRAL_ANALYSIS_REPORT_URL = new URL(
  "../../../artifacts/抖音爆款视频拆解报告-学习压力太大了.html",
  import.meta.url
).href;

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

const MOCK_LIVE_ANALYSIS_ARTIFACT = {
  id: "mock-live-danmaku-analysis-report",
  name: "直播间弹幕分析报告-新能源SUV专场.html",
  type: "html",
  agentId: "mkt-live-danmaku-analysis",
  projectName: "直播间分析",
  createdBy: "直播间弹幕分析",
  sourceTaskTitle: "新能源 SUV 周末试驾直播复盘",
  summary: "基于整场 186 条弹幕生成主题、阻力和下一场直播优化建议。",
  content: "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>直播间弹幕分析报告</title><style>body{font-family:Arial,sans-serif;max-width:860px;margin:40px auto;color:#20252b;line-height:1.7}h1{margin-bottom:8px}section{margin-top:28px;padding-top:18px;border-top:1px solid #e5e8ed}li{margin:6px 0}</style></head><body><h1>直播间弹幕分析报告</h1><p>新能源 SUV 周末试驾直播复盘 · 已完成</p><section><h2>本场摘要</h2><ul><li>采集弹幕：186 条</li><li>互动用户：72 位</li><li>问题弹幕：48 条</li><li>识别主题：5 个</li></ul></section><section><h2>下一场直播建议</h2><ul><li>开场 30 秒先说明现车、试驾和金融政策。</li><li>把高频价格问题固定成屏幕侧边信息卡。</li><li>在直播中段增加真实车主续航案例，降低决策阻力。</li></ul></section></body></html>",
  created_at: MOCK_NOW,
  updated_at: MOCK_NOW
};

const MOCK_VIRAL_ANALYSIS_ARTIFACT = {
  id: "mock-viral-work-analysis-report",
  name: "抖音爆款视频拆解报告-学习压力太大了.html",
  type: "html",
  agentId: "mkt-viral-work-analysis",
  projectName: "作品分析",
  createdBy: "抖音爆款拆解官",
  sourceTaskTitle: "《学习压力太大了》",
  summary: "从数据、结构、评论、爆款成因到可复制 SOP，完整拆解 14 秒短剧《学习压力太大了》。",
  url: MOCK_VIRAL_ANALYSIS_REPORT_URL,
  created_at: MOCK_NOW,
  updated_at: MOCK_NOW
};

const MOCK_LIVE_ANALYSIS_RUN = {
  taskId: "mock-live-danmaku-analysis",
  taskRunId: "mock-live-danmaku-analysis-run",
  ownerKey: "mkt-live-danmaku-analysis::mock-live-danmaku-analysis::mock-account-automotive",
  accountId: "mock-account-automotive",
  accountName: "臻选新能源 · 上海",
  agentId: "mkt-live-danmaku-analysis",
  agentName: "直播间弹幕分析",
  resultType: "研究简报",
  title: "直播间弹幕分析报告 · 新能源 SUV 周末试驾直播",
  summary: "基于整场直播弹幕，整理用户问题、转化阻力和下一场直播优化动作。",
  source: "实时工作",
  sourceScope: "authorized_account_live",
  status: "completed",
  counts: { danmaku: 186, uniqueUsers: 72, questions: 48, topics: 5 },
  resultSnapshot: {
    status: "completed",
    artifacts: [MOCK_LIVE_ANALYSIS_ARTIFACT],
    danmakuAnalysis: {
      summary: "本场用户最集中关注现车、价格、试驾和家庭空间，价格解释与试驾承接是主要转化节点。",
      counts: { danmaku: 186, uniqueUsers: 72, questions: 48, topics: 5 },
      topics: [
        { label: "价格与金融", count: 52, userCount: 31, examples: ["首付和月供怎么计算？", "现在还有置换补贴吗？"] },
        { label: "试驾与现车", count: 41, userCount: 25, examples: ["周末能试驾吗？", "上海店有白色现车吗？"] },
        { label: "家庭空间", count: 28, userCount: 19, examples: ["后排放儿童座椅够吗？"] },
        { label: "续航表现", count: 24, userCount: 16, examples: ["冬天实际能跑多少？"] },
        { label: "配置对比", count: 18, userCount: 13, examples: ["E300 和 X7 怎么选？"] }
      ],
      conversionBarriers: ["价格和金融方案没有在开场明确说明", "用户需要更具体的试驾档期与现车信息"],
      optimization: {
        headline: "下一场先把价格、金融和试驾信息前置，再用真实家庭场景回应空间与续航疑问。",
        nextLiveActions: ["开场 30 秒固定说明现车、试驾和金融政策", "每 15 分钟集中回答一次价格与续航问题", "直播结束前公布预约入口和门店档期"]
      }
    }
  },
  artifacts: [MOCK_LIVE_ANALYSIS_ARTIFACT],
  generatedAt: MOCK_NOW
};

const MOCK_VIRAL_ANALYSIS_RUN = {
  taskId: "mock-viral-work-analysis",
  taskRunId: "mock-viral-work-analysis-run",
  ownerKey: "mkt-viral-work-analysis::mock-viral-work-analysis::public-work",
  agentId: "mkt-viral-work-analysis",
  agentName: "抖音爆款拆解官",
  resultType: "研究简报",
  reportTemplate: "viral-teardown-v1",
  title: "抖音爆款视频拆解报告 ·《学习压力太大了》",
  summary: "拆解 14 秒短剧的传播数据、剧情结构、评论生态、爆款成因与可复制方法论。",
  source: "公开作品分析",
  sourceScope: "public_work_link",
  status: "completed",
  resultSnapshot: {
    status: "completed",
    reportTemplate: "viral-teardown-v1",
    title: "抖音爆款视频拆解报告",
    sourceUrl: "https://www.douyin.com/video/mock-learning-pressure-2026",
    purpose: "从视频本身和公开表现中拆解它为什么可能获得流量。",
    targetAudience: "准备做或正在做自媒体、希望通过学习爆款视频增长流量的博主",
    work: {
      title: "学习压力太大了",
      author: { name: "开心影视" },
      description: "以孩子学习压力切入，通过连续反转和道具梗推动评论与转发。",
      hashtags: ["AI短剧", "学习压力", "家庭共鸣"],
      durationSeconds: 14,
      metrics: { likes: 51274, comments: 10239, shares: 200440, favorites: 3422 }
    },
    metrics: { likes: 51274, comments: 10239, shares: 200440, favorites: 3422, totalInteractions: 265375, shareLikeRatio: 3.91 },
    videoAnalysis: {
      status: "completed",
      overview: "作品用家庭教育压力切入，通过烟梗和连续反转把观众带进评论区。",
      subject: "14 秒 AI 短剧、家庭关系和学习压力",
      spokenContent: "先抛出反常识冲突，再用道具和人物反应连续推进，结尾不替观众下结论。",
      hook: "第一句就把学习压力和家庭冲突抛出来，观众无需铺垫即可进入情境。",
      audio: { speechSummary: "台词短、节奏快，信息密度高", speechStyle: "先抛冲突，再用反应和反转给信息" },
      subtitles: { summary: "字幕回收标题台词并突出冲突", keyPhrases: ["学习压力太大了", "利群", "你说抽什么"] },
      structure: [
        { stage: "冲突开场", timeRange: "0-3 秒", description: "父亲把做抖音说成解决学习压力的方法，形成反常识冲突" },
        { stage: "道具推进", timeRange: "3-7 秒", description: "烟盒和人物反应连续出现，让每个镜头都有新的信息" },
        { stage: "情绪锚点", timeRange: "7-11 秒", description: "女儿说出标题同款台词，击中家长和学生的共同焦虑" },
        { stage: "开放结尾", timeRange: "11-14 秒", description: "不替观众下结论，把争议留给评论区继续接龙" }
      ],
      keyMoments: [{ title: "标题台词回收", timeRange: "7-8 秒", reason: "标题、台词和情绪在同一秒对齐，形成记忆点" }],
      visual: ["人物反应与道具切换紧凑", "关键台词和转折点使用字幕强化"],
      pacing: "14 秒内连续 5 次信息转折，平均不到 3 秒一个新点。",
      editing: ["每个结论前保留一个真实动作", "在反转前留出一拍让观众跟上"],
      strengths: ["开头冲突明确", "道具梗易于复述", "结尾问题没有封口"],
      weaknesses: ["情绪承接依赖观众对家庭压力的共鸣", "道具梗存在合规表达边界"],
      growthSignals: ["开头冲突明确", "评论区围绕道具和结尾自然接龙"],
      growthHypotheses: ["转发是把视频递给具体的人", "评论区的争论延长了停留"]
    },
    content: {
      hook: "第一句就把学习压力和家庭冲突抛出来，观众无需铺垫即可进入情境。",
      structure: ["冲突开场", "道具推进", "情绪锚点", "开放结尾"],
      topics: ["学习压力", "家庭关系", "烟梗接龙"],
      cta: "不替观众下结论，把问题留给评论区继续接龙。",
      strengths: ["标题与台词形成回收", "每个镜头都有新信息", "争议点方便转述"]
    },
    audience: {
      collected: 128,
      topics: [{ key: "烟梗接龙", count: 92 }, { key: "家长共鸣", count: 10 }, { key: "生活压力", count: 9 }, { key: "劝戒烟", count: 6 }],
      needs: ["情绪共鸣", "道具讨论"],
      questions: ["利群现在多少钱？", "孩子压力大到底怎么沟通？"],
      objections: ["对抽烟情节的担忧"],
      representativeComments: ["利群劲大", "我女儿也说学习压力太大了", "这结尾怎么还没说完"]
    },
    recommendations: {
      reusableElements: ["前三秒先抛熟悉的家庭冲突", "准备一个能被复述的具体道具梗", "结尾留下可争论的问题"],
      nextTests: ["保留标题台词回收，测试两个不同道具梗", "分别测试家长视角和学生视角的开场", "继续观察发布后 72 小时的分享占比"],
      cautions: ["公开互动不等同于成交结果", "评论样本只代表采样范围，不外推全部观众"]
    },
    analysisLogic: { evidenceLayers: [{ name: "视频事实", detail: "画面、口播、字幕和时间线" }, { name: "公开表现", detail: "播放、点赞、评论和分享" }, { name: "观众反馈", detail: "评论主题、问题与疑虑" }], rules: ["视频事实优先", "判断与事实分层记录", "未确认内容标记为待核验"] },
    analysisProcess: [{ key: "link", title: "校验作品链接", detail: "确认公开链接、作者和基础指标", status: "completed" }, { key: "metadata", title: "读取公开作品详情", detail: "已读取标题、作者、时长和四项互动指标", status: "completed" }, { key: "comments", title: "整理公开评论", detail: "按主题、问题和争议分类评论样本", status: "completed" }, { key: "video", title: "解析视频内容", detail: "提取开头、结构、关键画面和口播", status: "completed" }, { key: "frames", title: "选择视频代表画面", detail: "从内容转折点中选择可回看的画面", status: "completed" }, { key: "synthesis", title: "生成分析报告", detail: "把观察转成下一轮可验证动作", status: "completed" }],
    evidence: [{ type: "work_description", text: "作品描述与公开页面信息", sourceUrl: "https://www.douyin.com/video/mock-learning-pressure-2026" }, { type: "work_metrics", text: "公开互动指标：点赞 51,274、评论 10,239、分享 200,440、收藏 3,422", sourceUrl: "https://www.douyin.com/video/mock-learning-pressure-2026" }],
    artifacts: [MOCK_VIRAL_ANALYSIS_ARTIFACT]
  },
  artifacts: [MOCK_VIRAL_ANALYSIS_ARTIFACT],
  generatedAt: MOCK_NOW
};

const MOCK_LIVE_OUTREACH_RUN = {
  taskId: "mock-live-danmaku-outreach",
  taskRunId: "mock-live-danmaku-outreach-run",
  ownerKey: "mkt-live-danmaku-outreach::mock-live-danmaku-outreach::mock-account-automotive",
  accountId: "mock-account-automotive",
  accountName: "臻选新能源 · 上海",
  agentId: "mkt-live-danmaku-outreach",
  agentName: "直播追单助理",
  resultType: "触达记录",
  title: "直播间弹幕用户首次触达 · 试驾专场",
  summary: "监听本场直播弹幕并完成 3 位用户首次私信，另有 1 条等待平台回执。",
  source: "实时工作",
  sourceScope: "authorized_account_live",
  status: "completed",
  counts: { candidates: 4, sent: 3, unknown: 1, failed: 0, replies: 1 },
  items: [
    { id: "mock-prospect-shaoxing-tang", recordId: "mock-prospect-shaoxing-tang", nickname: "绍兴唐女士", handle: "tang_tang_sx", status: "sent", message: "你好，看到你在直播间问工作日试驾，我把绍兴门店的档期整理给你。", quote: "这周工作日晚上能试驾吗？", triggerSource: "直播间弹幕", triggerReason: "用户主动询问试驾档期", sentAt: "2026-09-14T09:20:00.000Z", providerResult: { messageId: "mock-live-touch-tang" } },
    { id: "mock-prospect-jiaxing-wu", recordId: "mock-prospect-jiaxing-wu", nickname: "嘉兴吴先生", handle: "wu_jx_newcar", status: "sent", message: "你好，看到你在直播间问续航，我把同场景的实测资料整理给你。", quote: "我通勤加周末回老家，续航够用吗？", triggerSource: "直播间弹幕", triggerReason: "用户明确提出续航问题", sentAt: "2026-09-14T09:21:00.000Z", providerResult: { messageId: "mock-live-touch-wu" } },
    { id: "mock-prospect-suzhou-chen", recordId: "mock-prospect-suzhou-chen", nickname: "苏州陈先生", handle: "chen_suzhou_ev", status: "sent", message: "你好，看到你在直播间比较两款 SUV，我把配置差异和试驾入口整理给你。", quote: "E300 和 X7 哪个后排更舒服？", triggerSource: "直播间弹幕", triggerReason: "用户明确提出车型对比问题", sentAt: "2026-09-14T09:23:00.000Z", providerResult: { messageId: "mock-live-touch-chen" } },
    { id: "mock-prospect-ningbo-cheng", recordId: "mock-prospect-ningbo-cheng", nickname: "宁波程女士", handle: "cheng_ev_life", status: "pending", message: "你好，看到你在直播间问置换补贴，我稍后把宁波门店的政策和试驾安排发给你。", quote: "旧车置换的补贴现在还有吗？", triggerSource: "直播间弹幕", triggerReason: "用户询问置换补贴", sentAt: "2026-09-14T09:25:00.000Z" }
  ],
  generatedAt: MOCK_NOW
};

const MOCK_GOLD_RESULT_FILE = {
  id: "mock-results-file-gold-service",
  name: "金牌客服对话目标复盘.md",
  type: "doc",
  agentId: "mkt-gold-customer-service",
  projectName: "私信承接",
  taskId: "mock-gold-customer-service",
  createdBy: "金牌客服",
  sourceTaskTitle: "高意向私信承接",
  summary: "记录三段目标对话的推进状态、人工接管节点和下一步动作。",
  created_at: MOCK_NOW,
  updated_at: MOCK_NOW,
  content: "# 金牌客服对话目标复盘\n\n- 活跃会话：3 位\n- 已回复：3 位\n- 完成目标：1 位\n- 待人工接管：1 位\n\n## 下一步\n- 优先确认合肥赵先生的优惠口径。\n- 跟进绍兴唐女士的试驾档期。"
};

const MOCK_LIVE_OUTREACH_FILE = {
  id: "mock-results-file-live-outreach",
  name: "直播弹幕触达回执.csv",
  type: "sheet",
  agentId: "mkt-live-danmaku-outreach",
  projectName: "直播间触达",
  taskId: "mock-live-danmaku-outreach",
  createdBy: "直播追单助理",
  sourceTaskTitle: "直播间弹幕用户首次触达 · 试驾专场",
  summary: "保留弹幕原话、首次私信内容和平台回执。",
  created_at: MOCK_NOW,
  updated_at: MOCK_NOW,
  content: "用户,触发弹幕,触达状态,发送时间\n绍兴唐女士,这周工作日晚上能试驾吗？,发送成功,2026-09-14 17:20\n嘉兴吴先生,我通勤加周末回老家，续航够用吗？,发送成功,2026-09-14 17:21\n苏州陈先生,E300 和 X7 哪个后排更舒服？,发送成功,2026-09-14 17:23\n宁波程女士,旧车置换的补贴现在还有吗？,等待平台回执,2026-09-14 17:25"
};

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
  },
  {
    taskId: "mock-gold-customer-service",
    ownerKey: "mkt-gold-customer-service::mock-gold-customer-service::mock-account-automotive",
    accountId: "mock-account-automotive",
    accountName: "臻选新能源 · 上海",
    agentId: "mkt-gold-customer-service",
    agentName: "金牌客服",
    resultType: "触达记录",
    title: "高意向私信承接",
    summary: "围绕试驾和留资目标承接 3 位用户私信。",
    status: "completed",
    counts: { received: 3, replies: 3, completed: 1, handoff: 1 },
    generatedAt: MOCK_NOW,
    messages: [
      { conversationId: "gold-xu", recordId: "mock-prospect-nanjing-xu", nickname: "南京徐女士", status: "已留资", goal: "确认试驾时间并获取可跟进联系方式", conversationHistory: [{ role: "user", content: "现在有白色现车吗？周末可以试驾吗？" }, { role: "assistant", content: "白色现车和周末试驾我先帮您核对。方便留个微信，我把确认后的颜色和档期发给您。" }, { role: "user", content: "微信是 nanjing_ev_xu，周日下午都可以。" }, { role: "assistant", content: "已记录，我会优先确认周日下午的试驾档期。" }] },
      { conversationId: "gold-zhao", recordId: "mock-prospect-hefei-zhao", nickname: "合肥赵先生", status: "待人工接管", goal: "引导预约到店", handoffReason: "用户要求确认具体优惠与到店承诺", conversationHistory: [{ role: "user", content: "周六下午两点可以到店，优惠还能按直播间说的吗？" }, { role: "assistant", content: "到店时间我可以先为您保留，具体优惠需要门店确认后再回复您。" }] },
      { conversationId: "gold-tang", recordId: "mock-prospect-shaoxing-tang", nickname: "绍兴唐女士", status: "跟进中", goal: "解答续航咨询并推进试驾", conversationHistory: [{ role: "user", content: "我通勤加周末回老家，续航够用吗？" }, { role: "assistant", content: "按您的通勤场景，建议先看实际续航和充电条件。我整理一份对比给您，再确认是否安排试驾。" }] }
    ]
  },
  MOCK_LIVE_ANALYSIS_RUN,
  MOCK_VIRAL_ANALYSIS_RUN,
  MOCK_LIVE_OUTREACH_RUN
]);

// The office uses the same task ids as the result cards, so mock work status
// stays visibly connected to the five featured Agent deliveries.
const MOCK_OFFICE_WORKS = Object.freeze([
  {
    agentType: "mkt-comment-acquisition",
    task: "持续监听评论、直播和互动里的潜客",
    phase: "已整理 8 位潜客，持续跟进中",
    progress: 68,
    state: "working",
    startedAt: "2026-09-14T09:00:00.000Z",
    metadata: { taskId: "mock-results-prospect-scan", taskRunId: "mock-results-prospect-scan-run", accountId: "mock-account-automotive", accountName: "臻选新能源 · 上海", taskState: "running", officeStatus: "working", officeStatusPhase: "ready", simulated: true, longRunning: true }
  },
  {
    agentType: "mkt-live-danmaku-analysis",
    task: "整理直播弹幕问题与转化阻力",
    phase: "已分析 186 条弹幕，生成下一场策略",
    progress: 82,
    state: "working",
    startedAt: "2026-09-14T09:05:00.000Z",
    metadata: { taskId: "mock-live-danmaku-analysis", taskRunId: "mock-live-danmaku-analysis-run", accountId: "mock-account-automotive", accountName: "臻选新能源 · 上海", taskState: "running", officeStatus: "working", officeStatusPhase: "ready", simulated: true, longRunning: true }
  },
  {
    agentType: "mkt-viral-work-analysis",
    task: "拆解《学习压力太大了》的内容结构与流量抓手",
    phase: "整理公开评论",
    progress: 68,
    state: "working",
    startedAt: "2026-09-14T09:10:00.000Z",
    artifact: "抖音爆款视频拆解报告-学习压力太大了.html",
    metadata: { taskId: "mock-viral-work-analysis", taskRunId: "mock-viral-work-analysis-run", accountId: "mock-account-education", accountName: "安安的升学笔记", taskState: "running", status: "running", sourceUrl: "https://www.douyin.com/video/mock-learning-pressure-2026", goal: "拆解这条作品的传播抓手，并把可验证的创作方法沉淀成报告。", phase: "整理公开评论", progress: 68, reportTemplate: "viral-teardown-v1", resultSnapshot: { ...MOCK_VIRAL_ANALYSIS_RUN.resultSnapshot, status: "running" }, officeStatus: "working", officeStatusPhase: "ready", simulated: true, longRunning: true }
  },
  {
    agentType: "mkt-live-danmaku-outreach",
    task: "触达直播间高意向观众",
    phase: "3 位已发送，1 位等待平台回执",
    progress: 75,
    state: "working",
    startedAt: "2026-09-14T09:15:00.000Z",
    metadata: { taskId: "mock-live-danmaku-outreach", taskRunId: "mock-live-danmaku-outreach-run", accountId: "mock-account-automotive", accountName: "臻选新能源 · 上海", taskState: "running", officeStatus: "working", officeStatusPhase: "ready", simulated: true, longRunning: true }
  },
  {
    agentType: "mkt-gold-customer-service",
    task: "承接高意向私信并推进留资",
    phase: "3 段会话处理中，1 位待人工接管",
    progress: 64,
    state: "working",
    startedAt: "2026-09-14T09:20:00.000Z",
    metadata: { taskId: "mock-gold-customer-service", taskRunId: "mock-gold-customer-service-run", accountId: "mock-account-automotive", accountName: "臻选新能源 · 上海", taskState: "running", officeStatus: "working", officeStatusPhase: "ready", simulated: true, longRunning: true }
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
  },
  MOCK_GOLD_RESULT_FILE,
  MOCK_LIVE_OUTREACH_FILE,
  MOCK_VIRAL_ANALYSIS_ARTIFACT
]);

export function isResultsMockPreview(search = globalThis.location?.search, { hostname = globalThis.location?.hostname } = {}) {
  const params = new URLSearchParams(String(search || ""));
  const runtimeMock = globalThis.__SALEBUDDY_CONFIG__?.runtimeMode === "mock";
  if (params.get("preview") !== "style" && !runtimeMock) return false;
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  const localHost = !normalizedHost || normalizedHost === "localhost" || normalizedHost === "127.0.0.1" || normalizedHost === "::1";
  return localHost || globalThis.__SALEBUDDY_CONFIG__?.allowStylePreview === true;
}

export function createResultsMockPreviewData() {
  return copy({ records: MOCK_RECORDS, runs: MOCK_RUNS });
}

export function createResultsMockPreviewOfficeWorks() {
  return copy(MOCK_OFFICE_WORKS);
}

export function createResultsMockPreviewFiles() {
  return copy(MOCK_FILES);
}
