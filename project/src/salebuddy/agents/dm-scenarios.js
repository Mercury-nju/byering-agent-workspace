/**
 * Role-specific direct-message history used by the recovered demo gateway.
 * Each core employee owns a distinct conversation and a previewable artifact.
 */
import { resolveBusinessPrompt } from "../business/prompt-catalog.js";
import { getConversationScenario } from "./conversation-scenarios.js";

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
  },
  "mkt-comment-acquisition": {
    name: "抖音获客管家",
    startedAt: "2026-09-13T08:20:00.000Z",
    messages: [
      ["user", "我", "今天帮我从臻选新能源·上海账号的评论、直播和互动里找潜客，重点看上海周末到店和购车预算。"],
      ["mkt-comment-acquisition", "抖音获客管家", "收到。我会以臻选新能源·上海为当前账号，读取作品评论、直播互动和账号互动通知，先排除抽奖、表情刷屏和同行账号，再保留每条有效互动的原话、来源作品与时间。"],
      ["user", "我", "隐性意向也要保留，比如问优惠、问现车，不要只匹配‘我要买车’。"],
      ["mkt-comment-acquisition", "抖音获客管家", "首轮已完成：读取 4,286 条互动，去重后保留 138 位用户；其中 26 位明确提到预算、价格、现车或到店时间，另外 19 位属于优惠和置换等隐性意向。我把证据分级，未确认的不会直接当成潜客。", {
        name: "抖音获客管家日报-2026-09-14.html",
        type: "html",
        summary: "4,286 条互动 · 138 位有效用户 · 26 位强意向",
        status: "已完成",
        projectId: "room-lead-expansion",
        projectName: "潜在客户拓展项目组",
        createdBy: "抖音获客管家",
        content: "<h1>抖音获客管家日报</h1><h2>今日结论</h2><ul><li>读取互动：4,286 条</li><li>去重后有效用户：138 位</li><li>明确购买信号：26 位</li><li>隐性意向：19 位</li><li>待客户分析员复核：93 位</li></ul><h2>重点信号</h2><p>上海周末到店、现车颜色、落地价格和置换补贴是今天出现最多的四类问题。</p><h2>下一步</h2><p>将 45 位带有购买信号的用户交给客户分析员评分，评分完成后再进入首次触达。</p>"
      }],
      ["user", "我", "把高意向的交给客户分析员，证据要能回溯。"],
      ["mkt-comment-acquisition", "抖音获客管家", "已移交 45 位待分析用户。每位都带有原始评论或互动文本、来源作品/直播场次、发生时间和账号主页；客户分析员完成评分后，结果会回写潜客线索，并自动进入下一步建议。"]
    ]
  },
  "mkt-find-people": {
    name: "找客专员",
    startedAt: "2026-09-13T08:42:00.000Z",
    messages: [
      ["user", "我", "从直播间、评论区和账号互动里找合适的人，重点是最近关注新能源的人。"],
      ["mkt-find-people", "找客专员", "可以。我会使用已授权的臻选新能源·上海账号，统一读取直播弹幕、作品评论和账号互动，找到的是互动用户，不会直接把他们判断成潜客。"],
      ["user", "我", "把原话、来源和时间都带上，宁可多一点，也不要漏掉问价格和到店的人。"],
      ["mkt-find-people", "找客专员", "已完成采集：3 场直播、12 条作品和 1,946 条账号互动共发现 138 位去重用户；其中 72 位有车型或购车话题，31 位出现价格、现车、置换或到店信号。", {
        name: "互动用户候选名单-2026-09-14.csv",
        type: "csv",
        summary: "3 场直播 · 12 条作品 · 138 位去重用户",
        status: "采集完成",
        projectId: "room-lead-expansion",
        projectName: "潜在客户拓展项目组",
        createdBy: "找客专员",
        content: "昵称,抖音号,来源,原始互动,发生时间,证据标签\n上海阿杰,@sh_ev_aj,直播间·新能源专场,周末到店还有现车优惠吗？,09:18,价格+到店\n小鹿要换车,@deer_change_car,作品评论·车型对比,预算30左右选哪款更合适？,09:04,预算+车型\n老周在杭州,@zhou_old_car,账号互动·置换内容,旧车置换补贴现在还有吗？,08:41,置换\n橘子汽水,@orange_ev,作品评论·城市通勤车,最近优惠大不大？,08:26,优惠咨询"
      }],
      ["user", "我", "下一步怎么处理？"],
      ["mkt-find-people", "找客专员", "建议先交给客户分析员做意向判断。我已经保留了 138 位完整互动用户，分析员可以按账号、来源和证据标签直接筛选；只有评分确认后的潜客，才会进入潜客触达专员。"]
    ]
  },
  "mkt-intent-analyst": {
    name: "客户分析员",
    startedAt: "2026-09-13T09:16:00.000Z",
    messages: [
      ["user", "我", "分析找客专员刚整理的这批互动用户，筛出真正值得跟进的潜客。"],
      ["mkt-intent-analyst", "客户分析员", "我会先去重，再结合原话、来源、车型、预算、城市和时间窗口判断购买阶段。‘好看’‘支持一下’这类泛互动会保留在发现的人里，但不会进入潜客名单。"],
      ["user", "我", "A级名单控制在 10 人内，销售跟进量有限；每个人都要写清楚为什么入选。"],
      ["mkt-intent-analyst", "客户分析员", "分析完成：138 位互动用户中，筛出 9 位 A 级、23 位 B 级和 41 位待观察用户，其余为低相关互动。9 位 A 级都具备至少两条购买证据，最强信号集中在‘周末到店’‘落地价格’和‘置换补贴’。", {
        name: "潜客意向分析报告-2026-09-14.html",
        type: "html",
        summary: "138 位互动用户 · 9 位 A 级潜客 · 23 位 B 级",
        status: "已完成",
        projectId: "room-lead-expansion",
        projectName: "潜在客户拓展项目组",
        createdBy: "客户分析员",
        content: "<h1>潜客意向分析报告</h1><h2>分层结果</h2><p>A 级 9 位，B 级 23 位，待观察 41 位，低相关 65 位。</p><h2>A 级样例</h2><table><tr><th>客户</th><th>得分</th><th>证据</th><th>建议</th></tr><tr><td>上海阿杰</td><td>94</td><td>周末到店 + 现车优惠</td><td>2 小时内首次触达</td></tr><tr><td>小鹿要换车</td><td>91</td><td>明确预算 + 车型对比</td><td>先发车型差异</td></tr><tr><td>老周在杭州</td><td>87</td><td>置换补贴 + 车况问题</td><td>询问旧车信息</td></tr></table><h2>判断原则</h2><p>每条结论均可回溯到原始互动，不把单一关键词或点赞行为写成购买意愿。</p>"
      }],
      ["user", "我", "报告沉淀到文件中心，把 A 级名单交给潜客触达专员。"],
      ["mkt-intent-analyst", "客户分析员", "已完成。报告已存入文件中心，9 位 A 级潜客已同步到潜客触达专员；名单里保留了账号、来源、原话、评分、判断理由和建议首触方向。"]
    ]
  },
  "mkt-cold-writer": {
    name: "潜客触达专员",
    startedAt: "2026-09-13T10:04:00.000Z",
    messages: [
      ["user", "我", "对客户分析员筛出的 A 级潜客做首次触达，先给我看发送文案，不要一上来就问电话。"],
      ["mkt-cold-writer", "潜客触达专员", "收到。我会按每个人的原始问题生成首触文案：先承接价格、车型、置换或到店问题，再问一个低门槛问题；不会编造优惠，也不会跳过发送前确认。"],
      ["user", "我", "只联系主动问价格、现车和到店的人，先发 4 位。"],
      ["mkt-cold-writer", "潜客触达专员", "已筛出 4 位符合条件的潜客，并按原话生成了个性化内容。发送账号为臻选新能源·上海，当前批次仍是待确认状态。", {
        name: "首轮私信发送预览-2026-09-14.html",
        type: "html",
        summary: "4 位 A 级潜客 · 4 条个性化首触 · 待确认发送",
        status: "待确认",
        projectId: "room-content",
        projectName: "触达内容共创项目组",
        createdBy: "潜客触达专员",
        content: "<h1>首轮私信发送预览</h1><p>发送账号：臻选新能源·上海</p><h2>上海阿杰</h2><p>看到你刚才问周末到店和现车优惠。不同配置的现车情况会有差别，你更关注颜色还是落地价格？我按你的情况帮你确认一下。</p><h2>小鹿要换车</h2><p>你提到预算 30 万左右在两款车之间选。你更在意空间，还是更在意城市通勤的能耗？我把差异先给你理清楚。</p><h2>老周在杭州</h2><p>看到你问旧车置换补贴。方便说下品牌、年份和大概里程吗？我先帮你判断需要准备哪些资料。</p><h2>橘子汽水</h2><p>看到你问最近的优惠。你是准备近期到店，还是先了解一下配置和价格？我按时间帮你整理。</p><p><strong>发送前请确认账号、人数和文案。</strong></p>"
      }],
      ["user", "我", "确认发送这 4 位，使用上面的版本。"],
      ["mkt-cold-writer", "潜客触达专员", "已完成发送前核验并执行首轮触达：成功发送 3 位，1 位因对方账号暂不支持私信而跳过。结果已回写潜客线索，3 位进入跟进中，跳过的 1 位保留在待触达列表。"]
    ]
  },
  "mkt-dm-inbox": {
    name: "私信客服",
    startedAt: "2026-09-13T11:12:00.000Z",
    messages: [
      ["user", "我", "继续接待新私信，有明确留资意向的帮我识别出来。"],
      ["mkt-dm-inbox", "私信客服", "可以。我会监听臻选新能源·上海账号的新私信，先根据上下文自然承接；涉及价格承诺、投诉或留资时，我会把证据和建议动作明确标出来，需要人工决定的节点不会替你擅自答应。"],
      ["user", "我", "南京徐女士这条怎么处理？先自然承接，不要马上要联系方式。"],
      ["mkt-dm-inbox", "私信客服", "我已读取上下文：她主动问‘可以加微信发一下现车颜色和周末档期吗？’，属于明确到店意向。建议先回复可提供现车颜色和周末时间，再确认她更方便周六还是周日，等她继续表达后再收集微信。"],
      ["user", "我", "按这个策略继续，遇到客户愿意留资就帮我标记。"],
      ["mkt-dm-inbox", "私信客服", "已按策略承接 3 个新会话：南京徐女士进入留资确认，合肥赵先生进入预约确认，宁波程女士暂时保持跟进中。两条明确意向已写入潜客线索，原始消息和回复记录同步保留。", {
        name: "私信承接与留资记录-2026-09-14.html",
        type: "html",
        summary: "3 个新会话 · 2 个明确意向 · 1 个跟进中",
        status: "持续跟进",
        projectId: "room-lead-expansion",
        projectName: "潜在客户拓展项目组",
        createdBy: "私信客服",
        content: "<h1>私信承接与留资记录</h1><table><tr><th>客户</th><th>当前阶段</th><th>关键原话</th><th>下一步</th></tr><tr><td>南京徐女士</td><td>留资确认</td><td>可以加微信发一下现车颜色和周末档期吗？</td><td>确认方便的日期，再记录微信号</td></tr><tr><td>合肥赵先生</td><td>预约确认</td><td>周六下午两点可以到店，留个微信方便确认。</td><td>确认门店与试驾车型</td></tr><tr><td>宁波程女士</td><td>跟进中</td><td>先看看家用空间和续航表现。</td><td>发送短版车型对比</td></tr></table>"
      }]
    ]
  },
  "mkt-gold-customer-service": {
    name: "金牌客服",
    startedAt: "2026-09-13T11:20:00.000Z",
    messages: [
      ["user", "我", "用金牌客服接待新私信，目标是先回答客户问题；如果客户有明确需求，再帮我获取可跟进线索。"],
      ["mkt-gold-customer-service", "金牌客服", "可以。我会监听臻选新能源·上海账号的新私信，先回应客户当前最关心的问题，再根据你的目标决定是否澄清需求、获取线索或交给人工；涉及价格承诺、投诉或敏感信息时，我会把证据和需要人工决定的部分讲明白。"],
      ["user", "我", "南京徐女士这条先怎么接？"],
      ["mkt-gold-customer-service", "金牌客服", "她问现车颜色和周末档期。我会先回答已确认的信息；如果她继续表达购车需求，再按“获取可跟进线索”的目标询问必要信息，不会跳过当前问题直接索要联系方式。"],
      ["user", "我", "按这个方式继续接待。"],
      ["mkt-gold-customer-service", "金牌客服", "已按目标承接 3 个新会话：2 个完成了目标要求的关键对话动作，1 个因缺少可确认信息交给人工。原始消息、回复记录和目标判断均已保留。", {
        name: "金牌客服目标执行记录-2026-09-14.html",
        type: "html",
        summary: "3 个新会话 · 2 个完成目标动作 · 1 个交人工",
        status: "持续跟进",
        projectId: "room-lead-expansion",
        projectName: "潜在客户拓展项目组",
        createdBy: "金牌客服",
        content: "<h1>金牌客服目标执行记录</h1><table><tr><th>客户</th><th>目标</th><th>当前状态</th><th>关键原话</th><th>处理结果</th></tr><tr><td>南京徐女士</td><td>获取可跟进线索</td><td>已回应并确认需求</td><td>可以加微信发一下现车颜色和周末档期吗？</td><td>按目标询问必要的联系方式</td></tr><tr><td>合肥赵先生</td><td>引导预约</td><td>待人工确认</td><td>周六下午两点可以到店，留个微信方便确认。</td><td>涉及确认性承诺，保留给人工</td></tr><tr><td>宁波程女士</td><td>解答咨询</td><td>跟进中</td><td>先看看家用空间和续航表现。</td><td>继续回答车型问题，不扩展无关话题</td></tr></table>"
      }]
    ]
  }
});

export const DEMO_DM_AGENT_TYPES = Object.freeze([
  "main",
  "mkt-comment-acquisition",
  "mkt-find-people",
  "mkt-intent-analyst",
  "mkt-cold-writer",
  "mkt-dm-inbox",
  "mkt-gold-customer-service"
]);

/**
 * Business memory used by the investor-demo conversation engine.
 * These facts are deliberately explicit so a demo reply can cite the same
 * account, metrics, evidence, and configuration across multiple turns.
 */
const DEMO_AGENT_MEMORY = Object.freeze({
  main: {
    businessContext: "负责查看全局 Agent 状态、任务进展和成果，并把获客、分析、触达、对话串成可决策的业务闭环。",
    account: { name: "臻选新能源·上海" },
    metrics: { managedAgents: 5, activeTasks: 1, qualifiedLeads: 47, repliedUsers: 12, blockedItems: 6 },
    yesterday: { managedAgents: 5, completedTasks: 3, qualifiedLeads: 47, repliedUsers: 12, conversionRate: "25.81%" },
    diagnosis: [
      "获客和分析结果已经产出，但 6 位用户的主页证据不足，影响进入触达名单",
      "31 位已触达用户中有 12 位回复，仍有部分高意向用户没有在有效时间窗内承接",
      "当前主要瓶颈在触达承接，而不是继续扩大采集量"
    ],
    config: { dailyFocus: "扩大获客覆盖", reviewThreshold: "至少 2 条购买证据" },
    proposal: {
      title: "把今日重点切到转化",
      changes: [
        { field: "dailyFocus", label: "今日重点", to: "优先处理高意向用户转化" },
        { field: "reviewThreshold", label: "复核规则", to: "先处理有预算、车型或到店时间的用户" }
      ]
    }
  },
  "mkt-comment-acquisition": {
    businessContext: "负责从授权抖音账号的评论、直播和账号互动中找齐用户，保留原始证据，再交给客户分析员判断。",
    account: { name: "臻选新能源·上海", handle: "@58262205543" },
    metrics: { interactions: 4286, foundUsers: 138, explicitSignals: 26, implicitSignals: 19, handedToAnalyst: 45 },
    yesterday: { interactions: 4286, foundUsers: 138, aLeads: 9, firstTouched: 4, repliedUsers: 2, qualifiedLeads: 0, conversionRate: "0%" },
    diagnosis: [
      "9 位 A 级用户里只有 4 位完成首次触达，覆盖率不足",
      "其中 3 条首触发生在用户活跃窗口之后，错过了用户刚提问的上下文",
      "首触内容没有引用用户原话，且没有优先处理‘价格 + 到店’这类强信号"
    ],
    config: { touchWindow: "24 小时内", priorityRule: "按采集时间顺序", firstTouchBatch: "4 位" },
    proposal: {
      title: "优化获客后的首触承接",
      changes: [
        { field: "touchWindow", label: "首触时间窗", to: "2 小时内" },
        { field: "priorityRule", label: "触达优先级", to: "价格 + 到店信号优先" },
        { field: "firstTouchBatch", label: "首次触达批次", to: "8 位" }
      ]
    }
  },
  "mkt-find-people": {
    businessContext: "负责从已授权账号的直播、作品评论和账号互动中汇总所有互动用户，去重并保留原话、来源和时间，不直接把互动判成潜客。",
    account: { name: "臻选新能源·上海", handle: "@58262205543" },
    metrics: { liveRooms: 3, works: 12, interactions: 1946, foundUsers: 138, strongSignals: 31 },
    yesterday: { liveRooms: 3, works: 12, foundUsers: 138, strongSignals: 31, missingEvidence: 17 },
    diagnosis: [
      "当前有 17 位用户只有单条弱互动，无法直接进入潜客名单",
      "账号互动的来源标注完整度低于直播和作品评论，需要补充主页和近期作品证据",
      "采集范围已经覆盖主要入口，下一步价值在证据补全和去重，而不是盲目扩大数量"
    ],
    config: { sourceScope: "直播 + 作品评论 + 账号互动", evidenceMode: "保留原始互动", includeWeakSignals: "保留待分析" },
    proposal: {
      title: "补强候选名单证据",
      changes: [
        { field: "evidenceMode", label: "证据范围", to: "增加主页与近期作品摘要" },
        { field: "includeWeakSignals", label: "弱信号处理", to: "保留并标记为待分析" },
        { field: "sourceScope", label: "采集范围", to: "保持三类互动入口不变" }
      ]
    }
  },
  "mkt-intent-analyst": {
    businessContext: "负责基于互动原话、来源、车型、预算、城市和时间窗口判断购买意向，输出带证据的分层结果和分析报告，不重新找人也不自动私信。",
    account: { name: "臻选新能源·上海", handle: "@58262205543" },
    metrics: { analyzedUsers: 138, aLeads: 9, bLeads: 23, watchUsers: 41, lowRelevance: 65, accuracy: "92.5%" },
    yesterday: { analyzedUsers: 138, aLeads: 9, bLeads: 23, watchUsers: 41, qualifiedLeads: 9, conversionRate: "6.52%" },
    diagnosis: [
      "9 位 A 级潜客中有 5 位尚未完成首次触达，评分结果没有及时进入下一环",
      "部分 A 级用户的证据虽然充分，但首触时间和话术没有跟上购买窗口",
      "评分本身抽检一致率为 92.5%，当前主要损耗发生在评分后的承接阶段"
    ],
    config: { scoreThreshold: "80 分", evidenceRequirement: "至少 2 条购买证据", maxAList: "9 位" },
    proposal: {
      title: "让高意向名单更快进入触达",
      changes: [
        { field: "scoreThreshold", label: "A 级分数线", to: "85 分" },
        { field: "evidenceRequirement", label: "证据规则", to: "预算、车型、到店任一强信号即可进入复核" },
        { field: "maxAList", label: "A 级名单上限", to: "保留前 10 位" }
      ]
    }
  },
  "mkt-cold-writer": {
    businessContext: "负责承接客户分析员确认过的潜客，按原始问题生成首轮私信，发送前让用户确认账号、对象和内容，发送后返回逐条结果。",
    account: { name: "臻选新能源·上海", handle: "@58262205543" },
    metrics: { selectedUsers: 4, sentUsers: 3, skippedUsers: 1, followUpUsers: 3, replyRate: "66.67%" },
    yesterday: { selectedUsers: 4, sentUsers: 3, skippedUsers: 1, repliedUsers: 2, qualifiedLeads: 2, conversionRate: "50%" },
    diagnosis: [
      "4 位待触达用户中有 1 位账号暂不支持私信，实际送达覆盖率为 75%",
      "首轮文案已经引用原问题，但部分用户收到消息时距离原互动超过 24 小时",
      "发送批次偏小，导致 A 级名单没有在同一业务窗口内完成承接"
    ],
    config: { sendWindow: "24 小时内", batchSize: "4 位", template: "承接原问题后询问一个低门槛问题" },
    proposal: {
      title: "提高首轮私信的有效承接",
      changes: [
        { field: "sendWindow", label: "发送时间窗", to: "2 小时内" },
        { field: "batchSize", label: "发送批次", to: "8 位" },
        { field: "template", label: "首触话术", to: "先引用原话，再给出一个明确下一步" }
      ]
    }
  },
  "mkt-dm-inbox": {
    businessContext: "负责监听授权账号的新私信，结合对话策略继续承接客户；遇到留资、价格承诺、投诉和人工交接节点时，先把上下文和建议动作告诉用户。",
    account: { name: "臻选新能源·上海", handle: "@58262205543" },
    metrics: { activeSessions: 3, clearIntentSessions: 2, capturedLeads: 2, followingSessions: 1, replySla: "15 分钟" },
    yesterday: { activeSessions: 3, clearIntentSessions: 2, capturedLeads: 1, followingSessions: 2, conversionRate: "33.33%" },
    diagnosis: [
      "3 个新会话里有 2 个明确意向，但只有 1 个会话完成留资，另一条还停在预约确认",
      "部分回复先讲了完整业务信息，没有先回答客户当前最关心的问题",
      "人工交接边界已经清楚，但触发条件需要更早识别到‘加微信’和‘预约’"
    ],
    config: { replySla: "30 分钟", handoffRule: "涉及留资或投诉时人工确认", greeting: "先承接问题，再确认下一步" },
    proposal: {
      title: "缩短私信承接链路",
      changes: [
        { field: "replySla", label: "回复时限", to: "15 分钟" },
        { field: "handoffRule", label: "交接规则", to: "出现加微信、预约或报价请求时立即提示人工确认" },
        { field: "greeting", label: "首句策略", to: "先回答当前问题，再追问一个必要信息" }
      ]
    }
  },
  "mkt-gold-customer-service": {
    businessContext: "负责承接授权账号的新私信，根据用户设定的目标自动设计回复、追问和推进方式；涉及无法确认的事实或敏感信息时交给人工。",
    account: { name: "臻选新能源·上海", handle: "@58262205543" },
    metrics: { activeSessions: 3, answeredSessions: 3, nextStepSessions: 2, capturedLeads: 2, followingSessions: 1, replySla: "15 分钟" },
    yesterday: { activeSessions: 3, answeredSessions: 3, nextStepSessions: 2, capturedLeads: 1, followingSessions: 2, conversionRate: "33.33%" },
    diagnosis: [
      "3 个新会话都已得到回复，但只有 2 个完成了目标要求的关键动作，另 1 个仍需更多上下文",
      "部分会话没有把客户当前问题和用户设定的目标衔接好，目标动作出现得偏早或偏晚",
      "涉及报价、承诺或敏感信息的人工边界已经明确，需要继续根据事实和目标判断推进方式"
    ],
    config: { replySla: "30 分钟", goalDriven: "按用户目标设计对话", handoffRule: "无法确认的事实、报价承诺、投诉或敏感信息交人工" },
    proposal: {
      title: "优化金牌客服的目标承接",
      changes: [
        { field: "replySla", label: "回复时限", to: "15 分钟" },
        { field: "goalDriven", label: "对话方式", to: "先回应问题，再按用户目标推进" },
        { field: "handoffRule", label: "人工边界", to: "无法确认或涉及敏感信息时交人工" }
      ]
    }
  },
  "Browser Agent": {
    businessContext: "负责从公开网页、作品评论和直播互动中发现候选用户，保留原始来源、时间和证据，不直接替用户发送消息。",
    account: { name: "公开抖音线索池" },
    metrics: { sources: 5, scannedItems: 3842, candidates: 214, strongSignals: 68 },
    yesterday: { scannedItems: 3842, candidates: 214, strongSignals: 68, missingEvidence: 6 },
    diagnosis: [
      "有 6 位候选人的主页信息不足，暂时不能确认城市或账号属性",
      "部分泛讨论被关键词命中，需要结合上下文和近期行为复核",
      "公开来源已经覆盖，但证据质量决定后续分析准确率"
    ],
    config: { sourceScope: "作品评论 + 直播互动", evidenceMode: "保留原话与来源", reviewMode: "关键词后人工复核" },
    proposal: {
      title: "提高公开线索证据完整度",
      changes: [
        { field: "evidenceMode", label: "证据方式", to: "补充主页与近期作品摘要" },
        { field: "reviewMode", label: "复核方式", to: "关键词与上下文联合判断" }
      ]
    }
  },
  "Search Agent": {
    businessContext: "负责合并重复账号、核验来源并按购买意向给线索分层，输出带判断依据的候选名单。",
    account: { name: "潜客拓展项目" },
    metrics: { inputUsers: 214, aLeads: 47, bLeads: 86, cLeads: 81, accuracy: "92.5%" },
    yesterday: { inputUsers: 214, aLeads: 47, bLeads: 86, cLeads: 81, accuracy: "92.5%" },
    diagnosis: [
      "A 级名单已经控制在可跟进范围，但仍有 6 条证据不足",
      "单纯车型讨论与真实购车意向容易混淆，需要保留负向特征",
      "评分准确率稳定，下一步要让 A 级结果更快交给触达策略师"
    ],
    config: { scoreThreshold: "80 分", evidenceRequirement: "预算、车型、城市、时间综合判断", maxAList: "47 位" },
    proposal: {
      title: "收紧高意向筛选并加快交接",
      changes: [
        { field: "scoreThreshold", label: "高意向分数线", to: "85 分" },
        { field: "evidenceRequirement", label: "判断规则", to: "强信号优先，泛讨论降权" }
      ]
    }
  },
  "App Agent": {
    businessContext: "负责按客户原问题匹配首触话术，记录客户回复、意向变化和下一步跟进动作。",
    account: { name: "臻选新能源·上海" },
    metrics: { touchedUsers: 31, repliedUsers: 12, visitIntent: 5, quoteRequests: 4, comparingUsers: 3 },
    yesterday: { touchedUsers: 31, repliedUsers: 12, visitIntent: 5, quoteRequests: 4, followUpNeeded: 7 },
    diagnosis: [
      "7 位客户需要继续跟进，但当前提醒节奏不够统一",
      "价格和车型问题的首触效果好于泛问候，应该优先承接原问题",
      "高价值会话已有记录，但负责人和下次动作需要更明确"
    ],
    config: { followUpWindow: "24 小时", firstTouchStyle: "先建立信任再邀请留资", handoffRule: "客户主动追问后交人工" },
    proposal: {
      title: "规范触达后的跟进节奏",
      changes: [
        { field: "followUpWindow", label: "跟进窗口", to: "12 小时内" },
        { field: "firstTouchStyle", label: "首触方式", to: "先承接原问题，再给明确下一步" }
      ]
    }
  },
  "File Agent": {
    businessContext: "负责把业务目标整理成可直接使用的话术、报告和交付文件，并把结果沉淀到工作区。",
    account: { name: "潜客拓展项目" },
    metrics: { reports: 3, templates: 12, reviewedCopies: 4, pendingReviews: 2 },
    yesterday: { reports: 3, templates: 12, reviewedCopies: 4, pendingReviews: 2 },
    diagnosis: [
      "报告和话术已经产出，但不同 Agent 的文件命名还不够统一",
      "业务数据和结论都已保留，投资人演示时需要更快定位关键结果",
      "当前文件交付完整，下一步重点是让产出与任务节点自动关联"
    ],
    config: { fileNaming: "按 Agent + 日期命名", reportFormat: "Markdown", delivery: "沉淀工作区后提醒" },
    proposal: {
      title: "统一业务产出交付方式",
      changes: [
        { field: "fileNaming", label: "文件命名", to: "按业务 + Agent + 日期命名" },
        { field: "delivery", label: "交付方式", to: "工作区沉淀并在对话中附预览" }
      ]
    }
  },
  "Computer Agent": {
    businessContext: "负责检查云电脑、账号登录态、页面选择器和任务队列，并用可回放结果说明运行是否可靠。",
    account: { name: "臻选新能源·上海云电脑" },
    metrics: { replayedItems: 600, successRate: "99.3%", retries: 3, duplicateMessages: 0 },
    yesterday: { replayedItems: 600, successRate: "99.3%", retries: 3, duplicateMessages: 0 },
    diagnosis: [
      "昨天出现过一次活动浮层遮挡，旧选择器等待超时",
      "账号登录态和任务队列正常，没有遗失任务或重复私信",
      "备用选择器已经验证，但还需要持续回放监控页面改版"
    ],
    config: { selectorMode: "主选择器", retryCount: "3 次", popupDetection: "未启用" },
    proposal: {
      title: "提高云电脑任务稳定性",
      changes: [
        { field: "selectorMode", label: "选择器策略", to: "主选择器 + 备用选择器" },
        { field: "popupDetection", label: "弹窗检测", to: "启用并在任务前自动处理" }
      ]
    }
  }
});

const DEMO_CONVERSATION_TAILS = Object.freeze({
  main: [
    ["user", "我", "昨天的全局数据怎么样？转化了多少线索？"],
    ["main", "Byering · 幕僚长", "我记得昨天有 5 个 Agent 参与工作，完成 3 项任务，产出 47 位高意向线索，收到 12 位客户回复，整体转化率 25.81%。当前主要卡点是证据不足和触达承接。"],
    ["user", "我", "为什么转化率还有损耗？"],
    ["main", "Byering · 幕僚长", "我回看了获客、分析和触达链路：6 位用户证据不足没有进入触达，31 位已触达用户里有 12 位回复，还有一部分高意向用户错过了有效承接时间。问题集中在中间环节，不是继续抓更多人。"],
    ["user", "我", "后面要怎么解决？"],
    ["main", "Byering · 幕僚长", "我建议把今日重点从扩大获客覆盖切到优先处理高意向用户转化，同时先处理有预算、车型或到店时间的用户。这组调整还没有生效，要不要确认？"],
    ["user", "我", "可以"],
    ["main", "Byering · 幕僚长", "好的，配置已生效。今天会优先处理高意向用户转化，并把有明确购买证据的用户提前进入触达。"]
  ],
  "mkt-comment-acquisition": [
    ["user", "我", "昨天的数据怎么样？转化了多少线索？"],
    ["mkt-comment-acquisition", "抖音获客管家", "我记得昨天处理的是臻选新能源·上海：读取 4,286 条互动，找到 138 位用户，完成首触 4 位，收到回复 2 位，新增转化线索 0 位，转化率 0%。"],
    ["user", "我", "为什么转化率低？"],
    ["mkt-comment-acquisition", "抖音获客管家", "主要有三点：9 位 A 级用户里只有 4 位完成首次触达；3 条首触错过了用户活跃窗口；首触内容没有充分引用用户原话，也没有优先处理价格和到店信号。"],
    ["user", "我", "后面要怎么解决？"],
    ["mkt-comment-acquisition", "抖音获客管家", "我建议把首触时间窗从 24 小时内改成 2 小时内，把价格和到店信号提到最高优先级，并把首次触达批次从 4 位提高到 8 位。配置还没有影响真实任务，确认后我再生效，可以吗？"],
    ["user", "我", "可以，立即生效"],
    ["mkt-comment-acquisition", "抖音获客管家", "好的，配置已生效。后续会在 2 小时内优先承接价格和到店信号，首轮最多处理 8 位用户。"]
  ],
  "mkt-find-people": [
    ["user", "我", "昨天从账号里找到了多少人？"],
    ["mkt-find-people", "找客专员", "我记得昨天从 3 场直播和 12 条作品里找到 138 位去重用户，其中 31 位出现价格、现车、置换或到店信号；17 位证据还不完整，我保留为待分析，没有直接判成潜客。"],
    ["user", "我", "为什么还有这么多不能直接用？"],
    ["mkt-find-people", "找客专员", "有 17 位只有单条弱互动，账号互动的来源标注也不如直播和作品评论完整。采集范围已经覆盖主要入口，下一步要补主页和近期作品证据，避免把泛互动误交给触达。"],
    ["user", "我", "后面怎么优化？"],
    ["mkt-find-people", "找客专员", "我建议增加主页与近期作品摘要，同时保留并标记弱信号，让客户分析员可以复核。这个采集配置还没有生效，要不要确认？"],
    ["user", "我", "确认生效"],
    ["mkt-find-people", "找客专员", "已生效。下一轮名单会继续覆盖直播、作品评论和账号互动，并补充主页与近期作品证据。"]
  ],
  "mkt-intent-analyst": [
    ["user", "我", "昨天分析结果怎么样？转化了多少潜客？"],
    ["mkt-intent-analyst", "客户分析员", "我记得昨天分析了 138 位互动用户，筛出 A 级 9 位、B 级 23 位、待观察 41 位，确认进入潜客池 9 位，当前转化率 6.52%；评分抽检一致率是 92.5%。"],
    ["user", "我", "为什么分析出来的潜客转化还不高？"],
    ["mkt-intent-analyst", "客户分析员", "5 位 A 级用户还没有完成首次触达，部分用户虽然证据充分，但评分结果没有及时进入下一环。评分本身抽检一致率为 92.5%，主要损耗发生在评分后的承接。"],
    ["user", "我", "后面怎么解决？"],
    ["mkt-intent-analyst", "客户分析员", "我建议把 A 级分数线从 80 分提高到 85 分，把有预算、车型或到店任一强信号的用户提前进入复核，并把 A 级名单上限调到前 10 位。要确认这组配置吗？"],
    ["user", "我", "可以"],
    ["mkt-intent-analyst", "客户分析员", "配置已生效。后续先复核强购买信号，最多保留前 10 位 A 级用户，并在报告里继续保留每条判断证据。"]
  ],
  "mkt-cold-writer": [
    ["user", "我", "昨天首轮触达的数据怎么样？转化了多少线索？"],
    ["mkt-cold-writer", "潜客触达专员", "我记得昨天计划触达 4 位潜客，实际发送 3 位，1 位因账号限制跳过，收到回复 2 位，形成转化线索 2 位，批次转化率 50%。"],
    ["user", "我", "为什么还有人没有转化？"],
    ["mkt-cold-writer", "潜客触达专员", "1 位账号暂不支持私信，实际送达覆盖率只有 75%；另外部分用户收到首触时距离原互动超过 24 小时，虽然文案引用了原问题，但没有赶上购买窗口。"],
    ["user", "我", "后面怎么解决？"],
    ["mkt-cold-writer", "潜客触达专员", "我建议把发送时间窗改成 2 小时内，把批次提高到 8 位，并坚持先引用原话再给一个明确下一步。现在只是提案，还没有发送任何新消息，要确认生效吗？"],
    ["user", "我", "确认生效"],
    ["mkt-cold-writer", "潜客触达专员", "配置已生效。后续发送仍会先核对账号、对象和内容，再按 2 小时窗口执行，不会跳过发送前确认。"]
  ],
  "mkt-dm-inbox": [
    ["user", "我", "昨天私信承接得怎么样？转化了多少线索？"],
    ["mkt-dm-inbox", "私信客服", "我记得昨天承接了 3 个私信会话，其中 2 个有明确意向，完成留资 1 个，另外 2 个仍在跟进中，转化率 33.33%。"],
    ["user", "我", "为什么明确意向没有都完成留资？"],
    ["mkt-dm-inbox", "私信客服", "有一条会话先收到了完整业务信息，但没有先回答客户当前最关心的问题；‘加微信’和‘预约’的人工确认触发得也偏晚，所以对话没有顺利进入留资。"],
    ["user", "我", "后面怎么解决？"],
    ["mkt-dm-inbox", "私信客服", "我建议把回复时限从 30 分钟改成 15 分钟，遇到加微信、预约或报价请求就立即提示人工确认，同时先回答当前问题，再追问一个必要信息。要确认生效吗？"],
    ["user", "我", "可以，立即生效"],
    ["mkt-dm-inbox", "私信客服", "配置已生效。后续会在 15 分钟内优先承接新消息，并在出现加微信、预约或报价请求时及时交给你确认。"]
  ],
  "mkt-gold-customer-service": [
    ["user", "我", "昨天金牌客服接待得怎么样？按目标完成得如何？"],
    ["mkt-gold-customer-service", "金牌客服", "我记得昨天承接了 3 个私信会话，3 个都已得到回复，其中 2 个按用户设定的目标完成了关键对话动作，形成可跟进结果 1 个，另外 2 个仍在跟进中。"],
    ["user", "我", "为什么还有会话没有完成目标？"],
    ["mkt-gold-customer-service", "金牌客服", "有一条会话还停留在问题确认阶段，客户没有继续表达目标相关需求；另一条涉及尚未确认的业务信息，我没有直接猜测，先保留给人工判断。"],
    ["user", "我", "后面怎么优化？"],
    ["mkt-gold-customer-service", "金牌客服", "我建议把回复时限从 30 分钟改成 15 分钟，并让每次推进都直接服务于当前设定目标；遇到无法确认的事实、报价承诺、投诉或敏感信息立即交人工。现在只是提案，还没有影响真实任务，要确认生效吗？"],
    ["user", "我", "确认生效"],
    ["mkt-gold-customer-service", "金牌客服", "配置已生效。后续会在 15 分钟内优先承接新私信，先回应客户当前问题，再根据用户目标设计追问、方案和下一步，并保留需要人工接管的会话。"]
  ],
  "Browser Agent": [
    ["user", "我", "昨天公开找人找得怎么样？"],
    ["Browser Agent", "线索猎人", "我记得昨天扫描了 3,842 条公开互动，保留 214 位候选，其中 68 位出现预算、车型或到店信号；6 位主页证据不足，暂未进入高意向名单。"],
    ["user", "我", "为什么还有候选不能直接用？"],
    ["Browser Agent", "线索猎人", "因为部分用户只有泛讨论或单条弱互动，主页也缺少城市和账号属性。公开找人的结果必须保留来源和证据，不能只凭关键词直接判成潜客。"],
    ["user", "我", "后面怎么优化？"],
    ["Browser Agent", "线索猎人", "我建议补充主页与近期作品摘要，并把关键词和上下文联合复核。这组配置还没有生效，要不要确认？"],
    ["user", "我", "可以"],
    ["Browser Agent", "线索猎人", "配置已生效。下一轮候选会带上更完整的主页证据，再交给线索分析师判断。"]
  ],
  "Search Agent": [
    ["user", "我", "昨天分析了多少候选？"],
    ["Search Agent", "线索分析师", "我记得昨天处理了 214 位候选，分出 A 级 47 位、B 级 86 位、C 级 81 位，抽检判断一致率 92.5%，另有 6 条证据不足待核验。"],
    ["user", "我", "为什么转化还会损耗？"],
    ["Search Agent", "线索分析师", "A 级名单已经筛出，但其中部分结果没有及时交给触达策略师；另外单纯车型讨论容易被误判，证据不足的客户不能直接进入触达。"],
    ["user", "我", "后面怎么优化？"],
    ["Search Agent", "线索分析师", "我建议把高意向分数线调到 85 分，并给强信号优先级高于泛讨论。这组分析配置还没有生效，要不要确认？"],
    ["user", "我", "确认生效"],
    ["Search Agent", "线索分析师", "配置已生效。后续会优先处理预算、车型、城市和时间窗口明确的候选。"]
  ],
  "App Agent": [
    ["user", "我", "昨天触达和回复怎么样？"],
    ["App Agent", "触达策略师", "我记得昨天触达 31 位 A 级客户，收到 12 位有效回复，其中 5 位确认本周到店、4 位需要报价、3 位仍在车型对比，另有 7 位需要继续跟进。"],
    ["user", "我", "为什么还有人没有继续推进？"],
    ["App Agent", "触达策略师", "部分客户已经回复，但下次动作和负责人没有统一记录；价格和车型问题的承接效果更好，泛问候容易让对话停住。"],
    ["user", "我", "后面怎么优化？"],
    ["App Agent", "触达策略师", "我建议把跟进窗口缩短到 12 小时，并坚持先承接原问题，再给一个明确下一步。要确认生效吗？"],
    ["user", "我", "可以"],
    ["App Agent", "触达策略师", "配置已生效。后续每条有效回复都会记录负责人、下一动作和跟进时间。"]
  ],
  "File Agent": [
    ["user", "我", "昨天沉淀了哪些产出？"],
    ["File Agent", "内容策划", "我记得昨天完成 3 份报告、12 套模板和 4 组首触话术，当前还有 2 份内容等待复核，业务数据和判断依据都已保留。"],
    ["user", "我", "为什么找文件还是不够快？"],
    ["File Agent", "内容策划", "文件内容是完整的，但命名主要按 Agent 和日期，投资人演示时不容易一眼看出对应的业务环节和关键结论。"],
    ["user", "我", "后面怎么优化？"],
    ["File Agent", "内容策划", "我建议统一采用‘业务 + Agent + 日期’命名，并在对话里附带产出预览。配置还没有生效，要不要确认？"],
    ["user", "我", "确认生效"],
    ["File Agent", "内容策划", "配置已生效。后续报告和话术会按业务链路命名，并在生成后直接附预览入口。"]
  ],
  "Computer Agent": [
    ["user", "我", "昨天云电脑运行得怎么样？"],
    ["Computer Agent", "开发助手", "我记得昨天回放 600 条任务，成功率 99.3%，自动重试 3 次，没有重复私信；唯一异常是一次活动浮层遮挡评论入口。"],
    ["user", "我", "为什么还会有异常？"],
    ["Computer Agent", "开发助手", "账号登录态和队列没有问题，异常来自页面临时弹窗，旧选择器等待超时。备用选择器已经验证，但页面改版仍需要持续监控。"],
    ["user", "我", "后面怎么解决？"],
    ["Computer Agent", "开发助手", "我建议启用弹窗检测，并使用主选择器和备用选择器双保险。这组运行配置还没有生效，要不要确认？"],
    ["user", "我", "可以"],
    ["Computer Agent", "开发助手", "配置已生效。后续任务开始前会自动处理弹窗，失败批次继续进入可重试队列。"]
  ]
});

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function demoMemoryFor(agentType) {
  const memory = DEMO_AGENT_MEMORY[agentType] || {
    businessContext: capabilityReply(agentType),
    account: { name: "当前工作区" },
    metrics: { completedTasks: 3 },
    yesterday: { completedTasks: 3 },
    diagnosis: ["当前演示没有记录异常，建议先查看最近任务和产出。"],
    config: { responseMode: "先确认范围，再给出下一步" },
    proposal: { title: "优化当前工作方式", changes: [{ field: "responseMode", label: "工作方式", to: "先给结论，再补充依据" }] }
  };
  return cloneValue(memory);
}

const ROLE_CAPABILITIES = Object.freeze({
  main: "查看全局 Agent 状态、任务进展和成果，并帮你判断下一步该找谁处理。",
  "mkt-comment-acquisition": "从授权账号的评论、直播和互动里汇总用户，保留来源证据，再交给客户分析员判断。",
  "mkt-find-people": "从授权账号的评论、直播和互动里找齐用户，去重并保留原始来源，不直接把互动当成潜客。",
  "mkt-intent-analyst": "基于已有互动用户判断购买意向，给出评分、证据和分析报告，不重新找人也不自动私信。",
  "mkt-cold-writer": "承接已经确认的潜客名单，配置首轮私信，发送前让你确认，发送后返回平台结果。",
  "mkt-dm-inbox": "监听授权账号的新私信，结合对话策略继续承接客户，需要人工决定的节点会先交给你。",
  "mkt-gold-customer-service": "承接授权账号的新私信，根据用户设定的目标自动设计回复和推进方式；需要人工决定的节点会先交给你。",
  "Browser Agent": "从公开视频、评论、粉丝和直播互动里发现潜在客户，并保留原始来源。",
  "Search Agent": "合并重复账号、核验来源，并按购买意向给线索分层。",
  "App Agent": "按客户原问题匹配首触话术，记录回复和下一步跟进动作。",
  "File Agent": "把业务目标整理成可直接使用的话术、报告或其他交付文件。",
  "Computer Agent": "检查云电脑、登录态、页面选择器和任务队列，并给出可复核的运行结果。"
});

const BUSINESS_REPLIES = Object.freeze({
  "mkt-find-people": "我只汇总已授权抖音账号启用后新产生的作品评论、直播互动和账号互动通知，保留全部用户与来源证据，交给客户分析员判断；不会把互动直接当成潜客，也不会自动发私信。",
  "mkt-cold-writer": "我会解析指定抖音用户主页，确认私信内容后通过已授权云电脑发送一条，并返回真实发送结果。",
  "mkt-gold-customer-service": "我会承接授权账号的新私信，根据用户设定的目标自动设计回复和推进方式；需要人工决定的节点会先交给你。",
});

export function seedDmMessages(agentType) {
  const scenario = SCENARIOS[agentType];
  if (!scenario) return [];
  const base = Date.parse(scenario.startedAt);
  const messages = [...scenario.messages, ...(DEMO_CONVERSATION_TAILS[agentType] || [])];
  return messages.map(([from, fromName, text, artifact], index) => ({
    id: `dm-seed-${encodeURIComponent(agentType)}-${index + 1}`,
    agentType,
    from,
    fromName,
    text,
    metadata: from === "user"
      ? { source: "demo-conversation", demo: true }
      : {
        source: agentType === "main" ? "chief-conversation" : "member-conversation",
        conversationRole: agentType === "main" ? "chief" : "specialist-executor",
        demo: true
      },
    ...(artifact ? { artifact: { ...artifact } } : {}),
    createdAt: new Date(base + index * 9 * 60 * 1000).toISOString()
  }));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function capabilityReply(agentType) {
  const conversationScenario = getConversationScenario(agentType);
  return ROLE_CAPABILITIES[agentType]
    || BUSINESS_REPLIES[agentType]
    || conversationScenario.objective
    || "我可以根据当前项目目标拆解任务、执行对应步骤，并把结果和下一步建议发回这里。";
}

function demoConversationState(agentType, memory, state = {}) {
  const conversationScenario = getConversationScenario(agentType);
  return {
    conversationScenarioId: conversationScenario.id,
    conversationFamily: conversationScenario.family,
    appliedConfig: { ...memory.config, ...(state?.appliedConfig || {}) },
    pendingProposal: state?.pendingProposal ? cloneValue(state.pendingProposal) : null,
    lastTopic: state?.lastTopic || null
  };
}

function demoProposalFor(agentType, memory, state) {
  const changes = memory.proposal.changes.map((change) => ({
    ...change,
    from: state.appliedConfig[change.field] ?? "未配置"
  }));
  return {
    id: `demo-proposal-${encodeURIComponent(agentType)}`,
    title: memory.proposal.title,
    status: "pending",
    changes
  };
}

function isDemoApproval(text) {
  const compact = String(text || "").replace(/[，。！？、,.!?；;：:]/gu, "").trim();
  return /^(?:(?:ok|okay|可以|好|好的|确认|确认生效|立即生效|生效|应用|按这个来|执行|确定|行|没问题|我觉得可以|就这样调整|这样调整)(?:了|吧)?)$/iu.test(compact)
    || /(?:ok|okay|可以|确认|同意|我觉得可以).{0,12}(?:生效|应用|执行|这样调整|按这个来)/iu.test(compact)
    || /(?:就这样调整|这样调整)(?:了|吧)?$/u.test(compact);
}

function isDemoCancellation(text) {
  return /(?:取消|不要|先不|暂不|不生效|别生效|稍后再说)/u.test(String(text || ""));
}

function isDemoMetricQuestion(text) {
  const value = String(text || "");
  return (/(?:昨天|昨日|前一天)/u.test(value) && /(?:数据|表现|结果|转化|线索|触达|回复率|多少|怎么样|工作)/u.test(value))
    || /(?:最近|当前).{0,8}(?:数据|进展|结果|转化|线索)/u.test(value);
}

function isDemoDiagnosisQuestion(text) {
  return /(?:为什么|原因|问题|卡在哪|哪里出了问题|转化率低|效果不好|表现差)/u.test(String(text || ""));
}

function isDemoSolutionQuestion(text) {
  return /(?:怎么解决|如何解决|后面怎么|下一步|怎么办|怎么优化|如何优化|优化一下|改进|提升|改善|变得更好|做得更好|表现.*更好)/u.test(String(text || ""));
}

function isDemoConfigQuestion(text) {
  return /(?:修改|调整|改成|设置|配置|策略|窗口|批次|阈值|优先|规则)/u.test(String(text || ""));
}

function demoMetricsReply(agentType, memory) {
  const data = memory.yesterday;
  if (agentType === "main") {
    return `我记得昨天全局有 ${data.managedAgents} 个 Agent 参与工作，完成 ${data.completedTasks} 项任务，产出 ${data.qualifiedLeads} 位高意向线索，收到 ${data.repliedUsers} 位客户回复，整体转化率为 ${data.conversionRate}。当前主要卡点是证据不足和触达承接。`;
  }
  if (agentType === "mkt-comment-acquisition") {
    const percent = (numerator, denominator) => denominator > 0 ? `${((numerator / denominator) * 100).toFixed(2)}%` : "0%";
    const qualifiedTouchRate = percent(data.firstTouched, data.aLeads);
    const overallTouchRate = percent(data.firstTouched, data.foundUsers);
    const replyRate = percent(data.repliedUsers, data.firstTouched);
    return `我记得昨天处理的是${memory.account.name}。共读取 ${data.interactions.toLocaleString("zh-CN")} 条互动，去重后找到 ${data.foundUsers} 位用户，其中 ${data.aLeads} 位是 A 级高意向用户；完成首触 ${data.firstTouched} 位，A 级触达率为 ${qualifiedTouchRate}（${data.firstTouched}/${data.aLeads}），按全部用户计算的整体首触率为 ${overallTouchRate}（${data.firstTouched}/${data.foundUsers}），收到回复 ${data.repliedUsers} 位，首触回复率为 ${replyRate}，新增转化线索 ${data.qualifiedLeads} 位，转化率为 ${data.conversionRate}。`;
  }
  if (agentType === "mkt-find-people") {
    return `我记得昨天从 ${data.liveRooms} 场直播和 ${data.works} 条作品里找到 ${data.foundUsers} 位去重用户，其中 ${data.strongSignals} 位出现价格、现车、置换或到店信号，另有 ${data.missingEvidence} 位证据还不完整，暂时没有直接判成潜客。`;
  }
  if (agentType === "mkt-intent-analyst") {
    return `我记得昨天分析了 ${data.analyzedUsers} 位互动用户，筛出 A 级 ${data.aLeads} 位、B 级 ${data.bLeads} 位、待观察 ${data.watchUsers} 位，确认进入潜客池 ${data.qualifiedLeads} 位，当前转化率为 ${data.conversionRate}；评分抽检一致率是 ${memory.metrics.accuracy}。`;
  }
  if (agentType === "mkt-cold-writer") {
    return `我记得昨天计划触达 ${data.selectedUsers} 位潜客，实际发送 ${data.sentUsers} 位，${data.skippedUsers} 位因账号限制跳过，收到回复 ${data.repliedUsers} 位，形成转化线索 ${data.qualifiedLeads} 位，批次转化率为 ${data.conversionRate}。`;
  }
  if (agentType === "mkt-dm-inbox") {
    return `我记得昨天承接了 ${data.activeSessions} 个私信会话，其中 ${data.clearIntentSessions} 个有明确意向，完成留资 ${data.capturedLeads} 个，另外 ${data.followingSessions} 个仍在跟进中，当前转化率为 ${data.conversionRate}。`;
  }
  if (agentType === "mkt-gold-customer-service") {
    return `我记得昨天承接了 ${data.activeSessions} 个私信会话，${data.answeredSessions} 个都已得到回复，其中 ${data.nextStepSessions} 个按用户设定目标完成了关键对话动作，形成可跟进结果 ${data.capturedLeads} 个，另外 ${data.followingSessions} 个仍在跟进中。`;
  }
  return `我记得昨天完成了 ${data.completedTasks || data.analyzedUsers || data.foundUsers || data.sentUsers || data.activeSessions || 0} 项核心工作，结果已经沉淀在当前 Agent 的工作记录里。`;
}

function demoDiagnosisReply(memory) {
  return `我回看了当前账号和最近的业务记录，主要有三点：1. ${memory.diagnosis[0]}；2. ${memory.diagnosis[1]}；3. ${memory.diagnosis[2]}。所以当前问题更像是业务链路中间的承接损耗，不是单纯数据量不够。`;
}

function demoSolutionReply(agentType, memory, state) {
  const proposal = demoProposalFor(agentType, memory, state);
  const changes = proposal.changes
    .map((change) => `${change.label}由“${change.from}”调整为“${change.to}”`)
    .join("；");
  return {
    text: `我建议先处理承接链路：${memory.diagnosis[0]}。我可以把${changes}。这只是待确认配置，还没有影响真实任务；你确认后我再让它生效，可以吗？`,
    proposal
  };
}

/**
 * Stateful deterministic conversation turn for the investor demo.
 * The gateway owns the returned state, so a proposal cannot be applied by a
 * later message unless the user explicitly confirms it.
 */
export function mockConversationTurn(agentType, taskText = "", context = {}) {
  const text = String(taskText || "").trim();
  const memory = context.memory ? cloneValue(context.memory) : demoMemoryFor(agentType);
  const state = demoConversationState(agentType, memory, context.state);

  if (state.pendingProposal) {
    if (isDemoApproval(text)) {
      const appliedConfig = { ...state.appliedConfig };
      for (const change of state.pendingProposal.changes || []) appliedConfig[change.field] = change.to;
      const applied = state.pendingProposal;
      state.appliedConfig = appliedConfig;
      state.pendingProposal = null;
      return {
        text: `好的，配置“${applied.title}”已生效。${(applied.changes || []).map((change) => `${change.label}现在是“${change.to}”`).join("；")}。后续任务会按新配置执行。`,
        appliedConfig,
        proposal: { ...applied, status: "applied" },
        state,
        memory
      };
    }
    if (isDemoCancellation(text)) {
      return {
        text: `好的，“${state.pendingProposal.title}”先不生效，当前配置保持不变。你之后说“确认生效”时，我再应用这组调整。`,
        state,
        memory
      };
    }
  }

  if (agentType === "mkt-gold-customer-service") {
    if (hasAny(text, [/(?:私信|消息|会话|回复|承接|客户说)/u])) {
      return { text: "收到。我会先回应客户当前最关心的问题，再根据用户设定的目标决定是否继续追问、提供方案、获取线索或交给人工；涉及价格、承诺、投诉或敏感信息时，我会先标出需要人工确认的节点。", state, memory };
    }
    if (hasAny(text, [/(?:接待|监听|自动回复|持续|客服)/u])) {
      return { text: "可以。我会持续监听授权账号的新私信，根据用户设定的目标设计对话节奏，先回应当前问题，再推进与目标直接相关的动作，并保留原始消息、回复记录和人工边界。", state, memory };
    }
  }

  if (isDemoDiagnosisQuestion(text)) {
    state.lastTopic = "diagnosis";
    return { text: demoDiagnosisReply(memory), state, memory };
  }
  if (isDemoSolutionQuestion(text) || isDemoConfigQuestion(text)) {
    state.lastTopic = "config";
    const solution = demoSolutionReply(agentType, memory, state);
    state.pendingProposal = solution.proposal;
    return { ...solution, state, memory };
  }
  if (isDemoMetricQuestion(text)) {
    state.lastTopic = "metrics";
    return { text: demoMetricsReply(agentType, memory), state, memory };
  }

  return { text: mockConversationReply(agentType, text), state, memory };
}

function genericReply(agentType, text) {
  const capability = capabilityReply(agentType);
  if (!text) return `我现在可以开始工作。${capability}你可以直接告诉我目标、对象或希望看到的结果。`;
  if (hasAny(text, [/^(?:你好|嗨|hi|hello|在吗)/iu])) {
    return `你好，我在。${capability}你可以直接说想处理什么，我会先确认范围，再告诉你下一步。`;
  }
  if (hasAny(text, [/(?:能做什么|可以做什么|怎么帮|负责什么|有什么能力|介绍一下)/u])) {
    return `我主要负责：${capability}如果你愿意，可以直接给我一个具体目标，我会按这个目标开始。`;
  }
  if (hasAny(text, [/(?:进展|状态|结果|做到哪|完成了吗|现在怎么样)/u])) {
    return `我会先核对当前会话、任务和最近结果，再把已经完成、正在处理和需要你决定的部分分开说明。${capability}`;
  }
  if (hasAny(text, [/(?:帮助|怎么用|如何使用|下一步|该做什么)/u])) {
    return `你可以把目标直接发给我，我会先判断是否需要账号、名单或配置。${capability}`;
  }
  return `我收到你的要求了。${capability}我会先确认输入是否足够，再给你可执行的下一步，不会把尚未完成的结果当成已完成。`;
}

export function mockConversationReply(agentType, taskText = "") {
  const text = String(taskText || "").trim();
  if (agentType === "main" && hasAny(text, [/(?:金牌客服|快速接待客服)/u])) {
    return "这属于目标驱动的私信承接流程，建议使用金牌客服。它只处理授权账号收到的新私信，会先回应当前问题，再根据用户目的设计后续对话；原私信客服继续保留给开发者探索。";
  }
  if (agentType === "mkt-comment-acquisition" || agentType === "mkt-find-people" || agentType === "Browser Agent") {
    if (hasAny(text, [/(?:开始|执行|找人|找用户|找客户|找潜客|评论|直播|互动|候选)/u])) {
      return "收到。我先从已授权账号的评论、直播和互动里汇总用户，过滤重复和明显无关账号，同时保留原话、来源和时间。完成后我会把可分析名单交给客户分析员，不会直接发送私信。";
    }
    if (hasAny(text, [/(?:分析|筛选|判断|意向)/u])) {
      return "这批数据先由我负责汇总，购买意向由客户分析员判断。我会把来源证据整理好，确保后面的评分能追溯到原始互动。";
    }
  }

  if (agentType === "mkt-intent-analyst" || agentType === "Search Agent") {
    if (hasAny(text, [/(?:开始|执行|分析|筛选|判断|评分|挖掘|潜客|报告|名单)/u])) {
      return "可以。我会对已有互动用户做去重和语义复核，把预算、车型、城市和时间窗口作为主要判断依据，保留每条证据，并输出一份可继续触达的潜客名单和分析报告。";
    }
    if (hasAny(text, [/(?:找人|搜索|重新找)/u])) {
      return "我只分析已经找到的互动用户，不负责重新找人。请先让找客专员汇总数据，名单会自动带入这里。";
    }
  }

  if (agentType === "mkt-cold-writer" || agentType === "App Agent") {
    if (hasAny(text, [/(?:取消|不要发|先别发|不发送)/u])) {
      return "好的，我先不发送。名单、账号和文案会保留在当前会话里，等你确认后再继续。";
    }
    if (hasAny(text, [/(?:确认发送|确认发|发出去|开始触达|发送|私信)/u])) {
      return "我收到你的发送意图了。发送前还会核对抖音账号、潜客名单和最终文案；确认无误后逐条执行，完成后把成功、失败和跳过原因分别回传。现在还没有把消息发出去。";
    }
    if (hasAny(text, [/(?:名单|潜客|人选|客户)/u])) {
      return "可以。我会优先接收客户分析员确认过的待触达潜客，先按客户原来的问题生成短消息，再让你确认账号、对象和文案。";
    }
  }

  if (agentType === "mkt-dm-inbox") {
    if (hasAny(text, [/(?:私信|消息|会话|回复|承接|客户说)/u])) {
      return "收到。我会先读取这条私信的上下文和账号对话策略，再给出自然的下一句；涉及价格、承诺、投诉或留资时，我会先标出需要人工确认的节点。";
    }
    if (hasAny(text, [/(?:接待|监听|自动回复|持续)/u])) {
      return "可以。我会持续监听授权账号的新私信，只在有真实消息时推进对话，并保留原始消息、回复内容和当前跟进状态。";
    }
  }

  if (agentType === "mkt-gold-customer-service") {
    if (hasAny(text, [/(?:私信|消息|会话|回复|承接|客户说)/u])) {
      return "收到。我会先回应客户当前最关心的问题，再根据用户设定的目标决定是否继续追问、提供方案、获取线索或交给人工；涉及价格、承诺、投诉或敏感信息时，我会先标出需要人工确认的节点。";
    }
    if (hasAny(text, [/(?:接待|监听|自动回复|持续|客服)/u])) {
      return "可以。我会持续监听授权账号的新私信，根据用户设定的目标设计对话节奏，先回应当前问题，再推进与目标直接相关的动作，并保留原始消息、回复记录和人工边界。";
    }
  }

  if (agentType === "main") {
    if (hasAny(text, [/(?:找人|评论|直播|互动)/u])) return "这属于找人环节，我建议先使用找客专员汇总互动用户，再由客户分析员判断意向。";
    if (hasAny(text, [/(?:分析|筛选|潜客|报告)/u])) return "这属于分析环节，我会把已有互动用户交给客户分析员，分析结果会回写成果中心，并生成可查看的报告。";
    if (hasAny(text, [/(?:触达|发送|私信)/u])) return "这属于触达环节。先确认账号、触达方式、名单和首轮文案，再由潜客触达专员执行，发送前会保留确认步骤。";
    if (hasAny(text, [/(?:客户回复|私信承接|对话)/u])) return "这属于对话承接环节，由私信客服读取上下文并继续回复；遇到留资或高风险内容会交给你确认。";
  }

  return genericReply(agentType, text);
}

function chiefDecisionFor(intent, responseMode = "text") {
  return {
    intent,
    responseMode,
    riskLevel: "low",
    confirmationPolicy: "none",
    requiredCapabilities: [],
    requestedAgentId: null,
    incompatibleCapabilities: [],
    blockingMissing: [],
    optionalMissing: [],
    defaultsApplied: [],
    taskAction: "",
    userMessage: "",
    confidence: 1,
    shouldCreateTask: false
  };
}

const MOCK_CHIEF_OVERVIEW = Object.freeze({
  total: 5,
  running: 1,
  waiting: 1,
  blocked: 0,
  completed: 3,
  active: [{ taskId: "mock-task-acquisition", title: "潜客拓展项目", state: "执行中" }]
});

function chiefOverview(overview = {}) {
  return {
    total: Number.isFinite(Number(overview.total)) ? Number(overview.total) : MOCK_CHIEF_OVERVIEW.total,
    running: Number.isFinite(Number(overview.running)) ? Number(overview.running) : MOCK_CHIEF_OVERVIEW.running,
    waiting: Number.isFinite(Number(overview.waiting)) ? Number(overview.waiting) : MOCK_CHIEF_OVERVIEW.waiting,
    blocked: Number.isFinite(Number(overview.blocked)) ? Number(overview.blocked) : MOCK_CHIEF_OVERVIEW.blocked,
    completed: Number.isFinite(Number(overview.completed)) ? Number(overview.completed) : MOCK_CHIEF_OVERVIEW.completed,
    active: Array.isArray(overview.active) ? overview.active : MOCK_CHIEF_OVERVIEW.active
  };
}

function chiefConsultationMessage(text, decision, overview) {
  if (decision.intent === "status_query") {
    const summary = `当前任务总览：执行中 ${overview.running} 项，等待处理 ${overview.waiting} 项，阻塞 ${overview.blocked} 项，已结束 ${overview.completed} 项。`;
    const active = overview.active.length
      ? `正在关注：${overview.active.map((task) => `${task.title || "未命名任务"}（${task.state || "状态未知"}）`).join("；")}。`
      : "当前没有执行中的任务。";
    return `${summary}${active}`;
  }
  if (/(?:暂停|停止|终止|取消|继续|恢复|重试).{0,8}(?:任务|执行|工作)?/u.test(text)) {
    return "幕僚长一期只负责查看全局状态和咨询引导，不提供暂停、继续、取消或重试。请在对应任务或专业 Agent 的工作页操作。";
  }
  if (/(?:你|幕僚长).{0,8}(?:能|可以|会).{0,8}(?:做什么|帮我做什么|怎么帮我|提供什么)|(?:你|幕僚长).{0,8}(?:有什么能力|职责是什么|负责什么)/u.test(text)) {
    return "我是全局运营管家：可以查看所有 Agent 的工作状态、任务进展和已有数据，并引导你前往对应专业 Agent。我不拆分、派发、启动或控制任务，更不会代替你的账号对外发送消息。";
  }
  if (/(?:获客专家|持续).{0,20}(?:获客|评论|直播|互动|账号)|(?:账号|评论|直播|互动).{0,20}(?:持续|自动).{0,12}(?:获客|找客户|找潜客)/u.test(text)) {
    return "持续处理已授权账号的新评论、直播和互动信号，请使用获客专家。它需要先完成账号授权、业务资料和接待策略配置，随后按已确认策略运行。";
  }
  if (/(?:私信客服|自动回复|接待).{0,20}(?:私信|咨询)?|(?:私信|咨询).{0,20}(?:承接|接待|自动回复)/u.test(text)) {
    return "承接新私信请使用私信客服。先选择并授权账号，再配置业务资料、回复规则和人工交接边界。";
  }
  if (/(?:潜客触达专员|潜客激活专员|首次触达|待触达)|(?:联系|触达|发(?:送)?私信).{0,20}(?:潜客|客户|用户|名单|这些)?/u.test(text)) {
    return "联系已确认潜客请使用潜客触达专员。它可以只触达潜客，也可以从当前账号找到的人中选择；发送前需要确认发送账号、对象和内容。";
  }
  if (/(?:客户分析员|分析).{0,20}(?:候选|客户|潜客|意向|名单)|(?:候选|客户|潜客|意向|名单).{0,20}(?:分析|判断|优先级)/u.test(text)) {
    return "判断候选客户意向请使用客户分析员。它需要已有候选名单和来源证据，输出意向等级、理由和下一步建议，不会重新找人或发送消息。";
  }
  if (/(?:找客专员|找人|找客户|找潜客|找评论|找直播|找互动|找用户|搜索|筛选).{0,20}(?:人|用户|客户|潜客|账号|评论|直播|互动)?/u.test(text)
    || /(?:找|搜索|筛选).{0,20}(?:人|用户|客户|潜客|账号|评论|直播|互动)/u.test(text)) {
    return "寻找候选客户请使用找客专员。它负责公开找人或监听已授权账号的新互动，保留候选和原始证据，但不会发送私信。";
  }
  return "幕僚长不创建、派发、启动或控制任务。我可以查看全局 Agent 状态、汇总已有数据，并引导你前往对应专业 Agent 发起具体业务。";
}

export function mockChiefDecision(message, overview = {}) {
  const text = String(message || "").trim();
  if (!text) return null;
  const normalizedOverview = chiefOverview(overview);
  const intent = /(?:进度|做到哪|怎么样了|结果(?:呢|是什么|怎么样)|谁在(?:做|执行)|(?:所有|全部|全局|整个团队).{0,12}(?:agent|员工|任务|工作|数据|状态)|(?:任务|工作|agent|员工|潜客|线索|数据).{0,12}(?:总览|统计|汇总|情况|状态)|(?:当前|现在|目前).{0,8}(?:没有|无|未).{0,12}(?:正在)?(?:执行|进行)(?:的)?(?:任务|工作)?)/iu.test(text)
    ? "status_query"
    : "conversation";
  const decision = chiefDecisionFor(intent, intent === "status_query" ? "status_card" : "text");
  return {
    accepted: true,
    decisionId: null,
    decision,
    requirement: null,
    shouldCreateTask: false,
    overview: normalizedOverview,
    message: chiefConsultationMessage(text, decision, normalizedOverview)
  };
}

export function roleReply(agentType, taskText = "") {
  return mockConversationReply(agentType, taskText) || BUSINESS_REPLIES[agentType] || resolveBusinessPrompt(taskText).defaultReply;
}

export const CORE_DM_AGENT_TYPES = Object.freeze(Object.keys(SCENARIOS));
