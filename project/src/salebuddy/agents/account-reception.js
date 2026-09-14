export const RECEPTION_ROLES = {
  shop: "热情店长",
  support: "专业客服",
  sales: "金牌销售",
  adviser: "专业顾问",
  appointment: "耐心小助手",
  partnership: "合作经理",
  creator: "内容主播",
  personal: "贴心助理",
  custom: "自定义人设"
};

export const RECEPTION_ROLE_DETAILS = {
  shop: "熟悉店铺，热情介绍商品和服务",
  support: "清楚耐心，处理常见咨询和售后",
  sales: "主动了解需求，推荐合适的产品或方案",
  adviser: "逻辑清晰，讲明功能、差异和选择",
  appointment: "友好引导，协助预约、到店或咨询",
  partnership: "稳重得体，接待品牌和商务合作",
  creator: "像账号身边的内容助理一样沟通",
  personal: "像可信赖的个人助理一样安排沟通",
  custom: "用你填写的身份和表达方式接待"
};
export const RECEPTION_GOALS = { contact: "留下联系方式", appointment: "预约到店", survey: "填写问卷" };
export const RECEPTION_GOAL_GUIDANCE = {
  contact: "在自然解答和确认需求后，经对方同意引导留下电话、微信或其他联系方式；拒绝后不再追问",
  appointment: "在解答和确认需求后，引导完成到店、咨询或体验预约；不虚构可预约时间或服务承诺",
  survey: "在对方愿意时引导填写问卷或登记表；没有有效链接时先询问，不虚构链接"
};
const LEGACY_CONVERSATION_STAGES = new Set(["answer", "understand"]);
const fail = message => { throw Object.assign(new Error(message), { code: "RECEPTION_INVALID", statusCode: 400 }); };
const text = (value, limit = 1000) => String(value ?? "").trim().slice(0, limit);
const pick = (value, values, fallback) => value == null ? fallback : values.includes(value) ? value : fail("接待设置包含不支持的选项");
const goal = value => LEGACY_CONVERSATION_STAGES.has(value) ? "contact" : pick(value, Object.keys(RECEPTION_GOALS), "contact");
const minutes = value => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail("接待时间格式不正确");
  const [h, m] = value.split(":").map(Number); return h * 60 + m;
};

export function normalizeReception(input = {}) {
  const schedule = input.schedule || {};
  const timezone = text(schedule.timezone || "Asia/Shanghai");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { fail("时区不正确"); }
  const mode = pick(schedule.mode, ["always", "weekdays", "daily", "custom"], "always");
  const days = mode === "weekdays" ? [1, 2, 3, 4, 5] : mode === "daily" || mode === "always" ? [0, 1, 2, 3, 4, 5, 6] : schedule.days ?? [1, 2, 3, 4, 5];
  if (!Array.isArray(days) || !days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) fail("请选择接待日期");
  const intervals = schedule.intervals ?? [{ start: "09:00", end: "21:00" }];
  if (!Array.isArray(intervals) || !intervals.length || intervals.length > 3) fail("请选择一至三个接待时间段");
  const slots = intervals.map(slot => {
    if (minutes(slot.start) === minutes(slot.end)) fail("接待开始和结束时间不能相同，全天接待请选择全天");
    return { start: slot.start, end: slot.end };
  });
  const outside = pick(schedule.outside, ["queue", "away"], "queue");
  const awayMessage = text(schedule.awayMessage ?? "消息收到啦，现在不在接待时间，稍后会回复你。", 300);
  if (outside === "away" && !awayMessage) fail("请填写休息时的留言");
  const mergeSeconds = Number(input.habits?.mergeSeconds ?? 4);
  if (![0, 4, 8].includes(mergeSeconds)) fail("接待合并等待时间不正确");
  return {
    enabled: input.enabled !== false,
    persona: {
      role: pick(input.persona?.role, Object.keys(RECEPTION_ROLES), "shop"),
      name: text(input.persona?.name, 50),
      brand: text(input.persona?.brand, 100),
      description: text(input.persona?.description, 1000)
    },
    length: pick(input.length, ["short", "balanced", "detailed"], "short"),
    emoji: input.emoji === true,
    goal: goal(input.goal),
    goalDetails: text(input.goalDetails, 2000),
    knowledge: text(input.knowledge, 30000),
    answerRules: text(input.answerRules || "只根据已知业务资料回答，不确定的事情不猜测。", 4000),
    handoff: { price: input.handoff?.price !== false, complaints: true, unknown: true, humanRequest: true },
    habits: { mergeSeconds, proactiveFollowUp: false },
    schedule: { mode, timezone, days: [...new Set(days)], intervals: slots, outside, awayMessage }
  };
}

export function receptionResponseStyle(settings = {}) {
  const role = Object.hasOwn(RECEPTION_ROLES, settings?.persona?.role) ? settings.persona.role : "shop";
  const customDescription = role === "custom" ? text(settings.persona?.description, 1000) : "";
  return `${RECEPTION_ROLES[role]}：${customDescription || RECEPTION_ROLE_DETAILS[role]}`;
}

export function receptionGoalObjective(settings = {}) {
  const selectedGoal = goal(settings.goal);
  return [RECEPTION_GOALS[selectedGoal], RECEPTION_GOAL_GUIDANCE[selectedGoal], text(settings.goalDetails, 2000)].filter(Boolean).join("。") + "。";
}

export function receptionWindow(settings, instant = Date.now()) {
  const schedule = settings.schedule;
  if (!settings.enabled) return { open: false, reason: "paused" };
  if (schedule.mode === "always") return { open: true, reason: "working" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: schedule.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const open = schedule.intervals.some(slot => {
    const start = minutes(slot.start), end = minutes(slot.end);
    return end > start ? schedule.days.includes(day) && minute >= start && minute < end
      : (schedule.days.includes(day) && minute >= start) || (schedule.days.includes((day + 6) % 7) && minute < end);
  });
  return { open, reason: open ? "working" : "outside_hours" };
}

export function receptionPrompt(settings) {
  const role = Object.hasOwn(RECEPTION_ROLES, settings?.persona?.role) ? settings.persona.role : "shop";
  const identityLabel = role === "custom" ? "对外身份" : "称呼";
  return [
    `接待人设：${RECEPTION_ROLES[role]}；${identityLabel}：${settings.persona.name || "不主动自报姓名"}；代表：${settings.persona.brand || "当前账号"}。`,
    "人设只用于表达方式，不虚构真人经历、资质或亲身使用经验；被问及自动回复时如实回答。",
    `表达方式：${receptionResponseStyle(settings)}。使用自然、清晰且尊重的称呼；${settings.emoji ? "可以少量使用表情" : "不要使用表情"}。`,
    `回复长度：${{ short: "简短，通常1至2句话", balanced: "适中，先回答重点", detailed: "需要时详细解释，但不堆砌内容" }[settings.length]}。`,
    `最终转化目标：${receptionGoalObjective(settings)}`,
    "结合双方历史，不重复打招呼或询问已确认信息；先回答，再问一个关键问题。目标已达成时不重复邀请。对方不回复时不要自行发送追问。",
    settings.answerRules
  ].join("\n");
}
