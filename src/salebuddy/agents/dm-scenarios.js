/**
 * Role-specific direct-message history used by the recovered demo gateway.
 * Each core employee owns a distinct conversation and a previewable artifact.
 */
import { resolveBusinessPrompt } from "../business/prompt-catalog.js";

const PROJECT_LEADS = { projectId: "room-lead-expansion", projectName: "潜在客户拓展项目组" };
const PROJECT_CONTENT = { projectId: "room-content", projectName: "触达内容共创项目组" };

const SCENARIOS = Object.freeze({
  main: {
    name: "Byering · 幕僚长",
    startedAt: "2026-08-10T00:36:00.000Z",
    messages: [
      ["user", "我", "今天先盯潜客拓展项目组。重点不是抓了多少人，而是高意向客户能不能顺利进入私信跟进。"],
      ["main", "Byering · 幕僚长", "明白。我把目标拆成三道检查：线索有效性、意向评分、触达承接。线索猎人和线索分析师先交叉核验，触达策略师只接收 A 级客户。"],
      ["user", "我", "下午复盘前给我一版可决策的结论，异常也要写出来。"],
      ["main", "Byering · 幕僚长", "首轮已收口：新增有效潜客 214 位，其中 A 级 47 位；已触达 31 位，收到有效回复 12 位。当前卡点是 6 位客户主页信息不足，我已安排二次核验。", {
        name: "潜客拓展项目执行简报-0810.md",
        type: "doc",
        summary: "214 位有效潜客 · 47 位 A 级 · 12 位有效回复",
        status: "已汇总",
        ...PROJECT_LEADS,
        createdBy: "Byering · 幕僚长",
        content: "# 潜客拓展项目执行简报\n\n## 今日结论\n\n- 新增有效潜客：214 位\n- A 级高意向：47 位\n- 已发送私信：31 位\n- 有效回复：12 位\n- 待二次核验：6 位\n\n## 决策建议\n\n优先让触达策略师承接明确提到预算、车型或到店时间的 12 位客户；信息不足的客户暂不触达，避免浪费账号额度。\n\n## 风险\n\n晚间直播场次评论增速较快，建议 20:00 前扩容一次采集队列。"
      }]
    ]
  },
  "Browser Agent": {
    name: "线索猎人",
    startedAt: "2026-08-10T01:08:00.000Z",
    messages: [
      ["user", "我", "先扫昨晚三场汽车直播和两条车型测评视频，把真正问价格、配置、到店的人找出来。"],
      ["Browser Agent", "线索猎人", "已登录授权账号并开始检索。三场直播共读取 3,842 条互动，先排除抽奖、表情刷屏和同行账号，再补看用户主页与近期评论。"],
      ["user", "我", "不要只靠关键词，把“最近有优惠吗”这种隐性意向也算进去，但要注明证据。"],
      ["Browser Agent", "线索猎人", "首轮检索完成：保留 214 位有效候选，其中 68 位出现车型、预算、金融方案或到店相关信号；每条都附了原评论、来源作品和主页线索。", {
        name: "抖音高意向候选-0810.csv",
        type: "sheet",
        summary: "3,842 条互动中筛出 214 位候选 · 68 位强信号",
        status: "检索完成",
        ...PROJECT_LEADS,
        createdBy: "线索猎人",
        content: "昵称,来源,意向信号,原始文本,主页补充,检索状态\n上海阿杰,直播间·新能源专场,价格+到店,这周末到店还有现车优惠吗,主页定位上海·近期关注新能源,有效\n小鹿要换车,视频·Model Y 对比,车型对比,预算30左右选Y还是智界,近7天浏览3条车型测评,有效\n老周在杭州,直播间·置换补贴,置换,老车置换补贴能做到多少,主页定位杭州·有旧车内容,有效\n橘子汽水,视频·城市通勤车,弱意向,最近优惠大不大,无明显营销账号特征,待评分"
      }]
    ]
  },
  "Search Agent": {
    name: "线索分析师",
    startedAt: "2026-08-10T02:12:00.000Z",
    messages: [
      ["user", "我", "线索猎人的候选名单到了。按购买阶段重新评分，别把单纯讨论车的人误判成客户。"],
      ["Search Agent", "线索分析师", "正在做去重和语义复核。我会把预算、车型、城市、时间窗口作为强特征，把泛讨论和竞品营销号作为负向特征，并保留评分依据。"],
      ["user", "我", "A 级名单宁可少一点，销售跟进量有限。"],
      ["Search Agent", "线索分析师", "评分完成：214 位有效候选中，A 级 47 位、B 级 86 位、C 级 81 位。抽检 40 条后，A 级判断一致率 92.5%；另外标记了 6 条证据不足数据，暂不进入触达。", {
        name: "潜客意向评分报告-0810.csv",
        type: "sheet",
        summary: "A 级 47 位 · 判断一致率 92.5% · 6 条待核验",
        status: "评分完成",
        ...PROJECT_LEADS,
        createdBy: "线索分析师",
        content: "昵称,意向等级,得分,关键证据,建议动作\n上海阿杰,A,92,本周到店+现车优惠,2小时内私信\n小鹿要换车,A,88,明确预算+车型对比,发送车型对比话术\n老周在杭州,A,86,置换补贴+城市明确,询问旧车情况\n橘子汽水,B,68,优惠询问但时间不明,24小时内轻触达\n旅行的风,C,32,仅参与车型讨论,暂不触达"
      }]
    ]
  },
  "App Agent": {
    name: "触达策略师",
    startedAt: "2026-08-10T03:04:00.000Z",
    messages: [
      ["user", "我", "A 级客户开始触达。不要一上来就问电话，先承接他原来的问题。"],
      ["App Agent", "触达策略师", "已按价格、配置、置换、到店四类意图匹配首触话术。前两轮只建立信任，客户主动追问后再邀请留资或预约。"],
      ["user", "我", "有回复的客户单独列出来，写清楚下一步由谁接。"],
      ["App Agent", "触达策略师", "已触达 31 位 A 级客户，12 位有效回复，其中 5 位确认本周可到店、4 位需要报价、3 位仍在车型对比。高价值会话已逐条写入跟进记录。", {
        name: "高意向客户触达记录-0810.csv",
        type: "sheet",
        summary: "已触达 31 位 · 有效回复 12 位 · 5 位可到店",
        status: "持续跟进",
        ...PROJECT_LEADS,
        createdBy: "触达策略师",
        content: "客户,首触时间,当前状态,客户回复摘要,下一步,负责人\n上海阿杰,10:14,预约意向,周六下午可以到店,确认门店与试驾车型,触达策略师\n小鹿要换车,10:26,报价需求,想看两款车落地价差,发送对比报价,触达策略师\n老周在杭州,10:42,置换评估,旧车已开6年约8万公里,收集车型与车况,触达策略师\n橘子汽水,11:03,已读未回,,次日一次轻提醒,Byering"
      }]
    ]
  },
  "File Agent": {
    name: "内容策划",
    startedAt: "2026-08-10T01:46:00.000Z",
    messages: [
      ["user", "我", "给不同意向场景分别写首触，不要像群发广告，也不要承诺不存在的优惠。"],
      ["File Agent", "内容策划", "我先从真实评论接话，再自然补一个低门槛问题。已拆成价格咨询、车型对比、置换评估、到店预约四种场景。"],
      ["user", "我", "语气再像真人一点，短句，别一次发太多信息。"],
      ["File Agent", "内容策划", "第三版已完成并通过敏感承诺检查。每套都控制在 55 字内，保留可替换的车型和城市变量，触达策略师可以直接调用。", {
        name: "高意向首触话术-v3.md",
        type: "doc",
        summary: "4 类意向场景 · 12 套短话术 · 已通过承诺检查",
        status: "已审校",
        ...PROJECT_CONTENT,
        createdBy: "内容策划",
        content: "# 高意向客户首触话术 V3\n\n## 价格咨询\n\n看到你刚才在直播间问到 {{车型}} 的优惠。不同城市和配置会有点差别，你更关注裸车价还是落地价？我按你的情况帮你理一下。\n\n## 车型对比\n\n你提到在 {{车型A}} 和 {{车型B}} 之间选，这两款差别主要在空间和用车场景。你平时是市区通勤多，还是经常带家人出行？\n\n## 置换评估\n\n看到你问旧车置换。方便说下品牌、年份和大概里程吗？我先帮你判断需要准备哪些资料，不用急着留电话。\n\n## 到店预约\n\n你说这周想看看实车。你通常工作日晚上方便，还是周末方便？我先帮你把可选时间和车型确认好。"
      }]
    ]
  },
  "Computer Agent": {
    name: "开发助手",
    startedAt: "2026-08-10T00:18:00.000Z",
    messages: [
      ["user", "我", "昨晚 RPA 中途掉过一次，查一下是账号登录、页面改版还是队列问题。"],
      ["Computer Agent", "开发助手", "我已回放云电脑日志。登录态正常，02:17 页面出现一次弹窗遮挡，旧选择器等待超时；队列没有丢任务，失败批次已自动重试。"],
      ["user", "我", "把修复和验证结果一起给我，别只说已经恢复。"],
      ["Computer Agent", "开发助手", "已加弹窗检测和备用选择器，并连续回放 3 轮共 600 条评论。成功率从 91.8% 恢复到 99.3%，失败任务都进入可重试队列，没有重复私信。", {
        name: "RPA运行体检报告-0810.md",
        type: "doc",
        summary: "回放 600 条 · 成功率 99.3% · 无重复触达",
        status: "修复已验证",
        ...PROJECT_LEADS,
        createdBy: "开发助手",
        content: "# RPA 运行体检报告\n\n## 故障定位\n\n02:17 抖音页面弹出活动浮层，遮挡评论区入口，旧选择器等待 30 秒后超时。账号登录态和任务队列均正常。\n\n## 修复\n\n- 增加活动浮层识别与关闭动作\n- 为评论区入口增加文本与结构双备用选择器\n- 失败批次进入幂等重试队列\n\n## 回放验证\n\n- 回放样本：600 条评论\n- 执行成功率：99.3%\n- 重复私信：0\n- 遗失任务：0"
      }]
    ]
  }
});

const REPLIES = Object.freeze({
  main: "我已把你的要求同步到项目组，并重新检查线索、评分和触达三段进度。当前关键数字没有异常；下一次状态变化我会直接给你结论和影响。",
  "Browser Agent": "收到。我会按原评论、来源作品和用户主页三层证据继续检索线索，新增候选会先去重，再标明具体意向信号。",
  "Search Agent": "收到。我会按购买阶段重新评分这批数据，并单独标记证据不足和边界样本，结论里会给出等级分布与判断依据。",
  "App Agent": "收到。我会先承接客户原问题再推进触达，有效回复会记录当前意向、下一步动作和跟进负责人。",
  "File Agent": "收到。我会把这条要求写进话术约束，按真实对话场景调整成短句，并在交付前检查承诺风险和群发感。",
  "Computer Agent": "收到。我会先复现运行链路，再核对登录态、页面选择器和重试队列；完成后给你故障原因、修复动作和回放数据。"
});

const BUSINESS_REPLIES = Object.freeze({
  "mkt-lead-miner": "我会先按客户画像筛选来源，保留公司、联系人和核验状态，不把推测写成事实。",
  "mkt-market-scout": "我会按行业、竞品和招标主题去重，给每条情报补来源、日期、影响和建议动作。",
  "mkt-cold-writer": "我会基于客户触发点写两版首触，标注适用假设，不替你直接发送。",
  "mkt-follow-up": "我会按客户阶段和上次反馈排今天的跟进，写清负责人、时间点和停止条件。",
  "mkt-phone-sdr": "我会按客户类型准备外呼脚本，通话后只根据录音原话记录意向和异议。",
  "mkt-copywriter": "我会先核对业务素材和渠道规格，再出内容初稿和发布日历，不虚构案例数据。",
  "mkt-designer": "我会按品牌规范整理尺寸、素材来源和可编辑交付，不使用未授权图片。",
  "mkt-private-op": "我会按社群目标排内容和负责人，先小范围验证，不直接批量触达成员。",
  "mkt-cs-manager": "我会按使用、反馈和续约节点识别风险客户，回访建议需人工确认。",
  "mkt-quote": "我会按已确认产品和价格生成报价初稿，标出信息缺口，不把初稿当正式合同。",
  "mkt-data-analyst": "我会先统一销售数据口径，标记缺失值和异常，再输出可追溯的漏斗和业绩归因。",
  "mkt-bid": "我会先核对资格要求和截止时间，列出材料缺口，不伪造资质或业绩。"
});

export function seedDmMessages(agentType) {
  const scenario = SCENARIOS[agentType];
  if (!scenario) return [];
  const base = Date.parse(scenario.startedAt);
  return scenario.messages.map(([from, fromName, text, artifact], index) => ({
    id: `dm-seed-${encodeURIComponent(agentType)}-${index + 1}`,
    agentType,
    from,
    fromName,
    text,
    ...(artifact ? { artifact: { ...artifact } } : {}),
    createdAt: new Date(base + index * 9 * 60 * 1000).toISOString()
  }));
}

export function roleReply(agentType, taskText = "") {
  return REPLIES[agentType] || BUSINESS_REPLIES[agentType] || resolveBusinessPrompt(taskText).defaultReply;
}

export const CORE_DM_AGENT_TYPES = Object.freeze(Object.keys(SCENARIOS));
