import { normalizeReception, RECEPTION_GOALS } from "../src/salebuddy/agents/account-reception.js";

function compact(value) {
  return String(value || "").replace(/\s+/g, "");
}

function replaceSetting(settings, key, value, label, changes) {
  settings[key] = value;
  changes.push({ field: key, label });
}

function lengthFor(text) {
  if (/(?:回复|私信|消息).{0,10}(?:简短|简洁|短一点|精简)|(?:简短|简洁|短一点|精简).{0,10}(?:回复|私信|消息)/u.test(text)) return "short";
  if (/(?:回复|私信|消息).{0,10}(?:详细|展开|说清楚)|(?:详细|展开|说清楚).{0,10}(?:回复|私信|消息)/u.test(text)) return "detailed";
  if (/(?:回复|私信|消息).{0,10}(?:适中|正常长度)/u.test(text)) return "balanced";
  return null;
}

function goalFor(text) {
  if (/(?:留资|留(?:下|个)?(?:电话|微信|联系方式)|征求(?:对方)?(?:留|提供)?(?:电话|微信|联系方式)|(?:电话|微信|联系方式).{0,8}(?:留下|提供|留资))/u.test(text)) return "contact";
  if (/(?:邀请|引导|推进).{0,8}(?:预约|约时间|约个时间)/u.test(text)) return "appointment";
  if (/(?:邀请|引导).{0,8}(?:填问卷|填写问卷)/u.test(text)) return "survey";
  return null;
}

function priceHandoffFor(text) {
  if (/(?:价格|报价).{0,12}(?:先交给我|先问我|不要直接(?:回答|回复|报价))|(?:先交给我|先问我).{0,12}(?:价格|报价)/u.test(text)) return true;
  if (/(?:价格|报价).{0,12}(?:可以直接(?:回答|回复|报价)|直接(?:回答|回复|报价))|(?:可以|能够).{0,8}(?:直接).{0,8}(?:价格|报价)/u.test(text)) return false;
  return null;
}

function confirmationFor(changes) {
  const labels = changes.map((change) => {
    if (change.field === "length") return `回复长度改为“${change.label}”`;
    if (change.field === "goal") return `对话目标改为“${change.label}”`;
    return `价格问题${change.label}`;
  });
  return `我准备把这个账号的私信接待${labels.join("，")}。确认后，之后收到的新私信会按这个方式回复。`;
}

export function receptionStrategySavedConfirmation(changes = []) {
  const labels = changes.map((change) => {
    if (change.field === "length") return `回复长度改为“${change.label}”`;
    if (change.field === "goal") return `对话目标改为“${change.label}”`;
    return `价格问题${change.label}`;
  });
  return `已按你的确认保存这个账号的私信接待${labels.join("，")}。之后收到的新私信会按这个版本回复。`;
}

export function applyReceptionStrategyUpdate(currentSettings, message) {
  const text = compact(message);
  if (!text) return null;

  const settings = normalizeReception(currentSettings);
  const changes = [];
  const length = lengthFor(text);
  if (length) replaceSetting(settings, "length", length, { short: "简短一点", balanced: "适中", detailed: "详细解释" }[length], changes);
  const goal = goalFor(text);
  if (goal) replaceSetting(settings, "goal", goal, RECEPTION_GOALS[goal], changes);
  const priceHandoff = priceHandoffFor(text);
  if (priceHandoff !== null) {
    settings.handoff.price = priceHandoff;
    changes.push({ field: "handoff.price", label: priceHandoff ? "转人工" : "可直接回答" });
  }

  if (!changes.length) return null;
  return { settings: normalizeReception(settings), changes, confirmation: confirmationFor(changes) };
}
