import { el } from "./pages.js";

const option = (id, label, detail, request, eyebrow = "") => Object.freeze({ id, label, detail, request, eyebrow });
export const TASK_CHOICES = Object.freeze({
  finderSource: { title: "数据来源", multiple: false, options: [
    option("own", "我的账号", "汇总已授权账号的评论、直播互动和账号互动通知中出现的全部用户", "从我的抖音账号作品评论、直播互动和账号互动通知中汇总全部互动用户，保留原话和来源后交给客户分析员判断。", "互动用户池")
  ] },
  finderOwnData: { title: "持续监听哪些来源？", multiple: true, options: [
    option("comments", "作品评论", "汇总评论区出现的全部用户和原话", "读取已授权账号的作品评论，汇总评论用户、原话和作品来源，不在此步骤判断购买意向。", "互动来源"),
    option("live", "直播间互动", "汇总直播间发言和互动用户", "读取已授权账号当前直播间的公开弹幕和互动，保留用户原话、发生时间和直播来源，不在此步骤判断购买意向。", "互动来源"),
    option("interactions", "账号互动通知", "汇总新产生的账号互动用户", "持续读取已授权账号新产生的互动通知，保留用户、发生时间和互动来源，不在此步骤判断购买意向。", "互动来源")
  ] },
  finderPublicPurpose: { title: "想了解哪类账号？", multiple: false, options: [
    option("creators", "适合合作的创作者", "看看内容方向和公开互动表现", "从公域公开资料中整理适合合作的抖音创作者，并说明公开依据。", "内容合作"),
    option("industryAccounts", "同行、品牌或商家", "看看行业里的账号和内容方向", "从公域公开资料中整理同行、品牌或商家账号，用于市场和内容研究。", "市场研究"),
    option("local", "附近的商家或服务者", "看看本地经营中的账号", "从公域公开资料中整理本地商家、门店和服务者账号，只用于分析。", "本地机会"),
    option("growing", "最近活跃的账号", "看看近期持续更新、值得关注的账号", "从公域公开资料中整理近期持续更新且值得关注的抖音账号，只用于分析。", "增长观察")
  ] },
  finder: { title: "这次要找什么人或账号？", multiple: false, options: [
    option("customers", "正在找产品的人", "正在询价、比较或准备购买", "寻找公开内容中明确表达产品咨询、比较或购买需求的抖音用户，不将点赞或关注单独视为购买意向。", "客户线索"),
    option("creators", "适合合作的创作者", "适合联动、投放或内容共创", "寻找持续更新、适合内容合作的抖音创作者，结合公开作品和互动表现说明推荐理由。", "内容合作"),
    option("industryAccounts", "同行、品牌或商家", "看看一个行业里的账号和内容方向", "寻找指定行业里的抖音商家、品牌及内容账号，用于市场和内容研究。", "市场研究"),
    option("local", "附近的商家或服务者", "寻找本地门店、服务商和经营者", "寻找本地生活领域正在经营的门店、服务商和商家账号。", "本地机会"),
    option("growing", "最近增长快的账号", "近期活跃、粉丝增长明显", "寻找近期粉丝增长较快且持续活跃的抖音账号，按可确认的公开数据整理，缺少数据时明确标注。", "增长观察"),
    option("audience", "描述你要找的人", "职业、兴趣或场景都可以说", "根据用户补充的职业、兴趣、生活场景或其他公开特征，寻找符合条件的抖音账号，并说明匹配依据。", "定向发现")
  ] },
  audience: { title: "留意哪些人？", multiple: true, options: [
    option("price", "问价格的人", "多少钱、怎么收费", "明确询问产品价格、费用或报价的人"),
    option("purchase", "准备买的人", "下单、到货、购买时间", "明确表达准备购买、下单或询问送货时间的人"),
    option("compare", "正在挑选的人", "比较品牌和替代方案", "正在比较产品、品牌或寻找替代方案的人"),
    option("help", "有具体问题的人", "用法、适用场景、解决办法", "提出具体使用问题或明确希望解决某个需求的人")
  ] },
  comments: { title: "想看哪类评论？", multiple: true, options: [
    option("price", "询价留言", "价格和收费", "询问产品价格或收费方式的评论"),
    option("complaints", "差评与投诉", "不满意、退款、产品问题", "表达不满意、投诉、退款或产品问题的评论"),
    option("competitors", "提到竞品", "比较其他品牌和产品", "提及其他品牌、竞品或比较不同产品的评论"),
    option("questions", "使用问题", "怎么用、适不适合", "询问使用方法、适用场景或产品功能的评论"),
    option("positive", "好评与推荐", "认可、推荐、使用反馈", "表达认可、推荐或正面使用体验的评论")
  ] },
  research: { title: "想邀请哪类人？", multiple: false, options: [
    option("consumers", "产品使用者", "了解实际使用体验", "寻找公开分享相关产品使用体验、适合参与用户调研的抖音用户。"),
    option("buyers", "正在选购的人", "了解购买前的顾虑", "寻找公开表达相关产品选购或比较需求、适合参与调研的抖音用户。"),
    option("merchants", "商家与店主", "了解经营中的需求", "寻找相关行业的商家、店主或经营者账号，作为调研邀请对象。"),
    option("creators", "内容创作者", "了解创作和合作需求", "寻找持续发布相关主题内容的抖音创作者，作为调研邀请对象。")
  ] },
  analysis: { title: "这份报告重点看什么？", multiple: true, options: [
    option("overview", "这个账号在做什么", "内容定位和公开背景", "根据提供的公开资料总结账号内容方向与可确认的背景"),
    option("content", "哪些内容值得看", "作品主题与互动表现", "结合已有作品和互动数据分析内容主题与表现，缺数据时明确说明"),
    option("needs", "它在吸引谁", "公开表达的兴趣与需求", "根据原始留言和行为证据分析明确表达的需求，不猜测预算或私人信息"),
    option("fit", "值不值得继续了解", "合作或调研的判断依据", "结合分析目标判断账号是否值得进一步了解，区分事实、判断与待确认信息")
  ] },
  conversion: { title: "接下来希望聊到哪一步？", multiple: false, options: [
    option("understand", "先了解需求", "把对方的问题聊清楚", "先回答当前问题，再了解对方的具体需求，不强行销售。"),
    option("appointment", "邀请预约", "约一次咨询或体验", "根据已知业务资料解答问题，再邀请对方预约咨询或体验，不编造时间或服务承诺。"),
    option("survey", "邀请填问卷", "了解真实反馈", "解答对方的问题后，邀请填写用户提供的问卷；缺少问卷链接时先询问，不编造链接。"),
    option("contact", "留下联系方式", "方便后续沟通", "先回应需求，征得对方同意后邀请留下用于后续沟通的联系方式，拒绝后不再追问。")
  ] }
});

export function updateChoiceSelection(group, selected, id, checked) {
  const catalog = TASK_CHOICES[group];
  if (!catalog?.options.some(option => option.id === id)) return selected;
  if (!catalog.multiple) return checked ? [id] : [];
  return checked ? [...new Set([...selected, id])] : selected.filter(value => value !== id);
}

export function compileTaskChoices(group, state = {}) {
  const catalog = TASK_CHOICES[group];
  if (!catalog) return "";
  const selected = catalog.options.filter(option => state.selected?.includes(option.id));
  const parts = [];
  if (selected.length) {
    const prefix = group === "comments" ? "筛选符合以下任一条件的评论：" : group === "audience" ? "寻找有以下任一需求信号的人：" : "";
    parts.push(prefix + selected.map(option => option.request).join("；"));
    if (group === "finder" && state.selected?.includes("audience") && String(state.audienceQuery || "").trim()) {
      parts.push(`具体找人条件：${String(state.audienceQuery).trim()}`);
    }
    if (state.industry) parts.push(`行业方向：${state.industry}`);
    if (state.region) parts.push(`地区要求：在${state.region}`);
    if (state.followers) parts.push(`粉丝数量：${state.followers}`);
  }
  if (String(state.extra || "").trim()) parts.push(`补充要求：${String(state.extra).trim()}`);
  return parts.join("\n");
}

let sequence = 0;
export function mountTaskChoices(container, { flow, group, field, title = null, initialText = flow[field] || "", defaults = [], filters = false, goalInput = null, allowSpecificAudience = true, allowFreeText = true, onChange = () => {} } = {}) {
  const catalog = TASK_CHOICES[group];
  if (!catalog) throw new Error(`Unknown task choice group: ${group}`);
  flow.taskChoices ||= {};
  const state = flow.taskChoices[group] ||= {};
  if (!Array.isArray(state.selected)) state.selected = [...defaults];
  if (typeof state.extra !== "string") state.extra = initialText;
  const name = `task-choice-${++sequence}`;
  const section = el("fieldset", "sb-task-choices");
  section.appendChild(el("legend", null, title || catalog.title));
  if (group === "finder") section.appendChild(el("p", "sb-task-choice-guidance", "先选一个方向，再补充行业、地区和账号规模。"));
  const grid = el("div", "sb-task-choice-grid");
  const inputs = [];
  const filterControls = [];
  let specificGoal = null;
  let specificInput = null;
  let filterSection = null;
  const commit = (edited = false) => {
    flow[field] = compileTaskChoices(group, state);
    if (edited) flow.setupError = null;
    inputs.forEach(({ input, label, id }) => { input.checked = state.selected.includes(id); label.classList.toggle("is-selected", input.checked); });
    filterControls.forEach(({ sync }) => sync());
    const selectedOption = catalog.options.find(option => state.selected.includes(option.id));
    if (specificGoal) specificGoal.classList.toggle("is-visible", state.selected.includes("audience"));
    if (filterSection && group === "finder") filterSection.hidden = !selectedOption;
    onChange(flow[field], edited);
  };
  let goal = null;
  if (goalInput) {
    goal = el("div", "sb-task-goal is-secondary");
    const goalLabel = goalInput.label || "你想找什么样的人？";
    const label = title === goalLabel ? null : el("label", "sb-task-goal-label", goalLabel);
    const textarea = document.createElement("textarea");
    textarea.rows = goalInput.rows || 2;
    textarea.value = state.extra || "";
    textarea.placeholder = goalInput.placeholder || "用一句话告诉我你的目标";
    textarea.setAttribute("aria-label", goalLabel);
    textarea.addEventListener("input", () => { state.extra = textarea.value; commit(true); });
    goal.append(...(label ? [label] : []), textarea);
    section.appendChild(el("div", "sb-task-quick-label", goalInput.quickTitle || "先选择要留意的信号（可多选）"));
  }
  for (const option of catalog.options) {
    const label = el("label", "sb-task-choice");
    const input = document.createElement("input"); input.type = catalog.multiple ? "checkbox" : "radio"; input.name = name; input.value = option.id;
    input.addEventListener("change", () => { state.selected = updateChoiceSelection(group, state.selected, option.id, input.checked); commit(true); });
    const copy = el("span", "sb-task-choice-copy");
    if (group === "finder" && option.eyebrow) copy.appendChild(el("span", "sb-task-choice-eyebrow", option.eyebrow));
    copy.append(el("strong", null, option.label), el("small", null, option.detail));
    label.append(input, copy); grid.appendChild(label); inputs.push({ input, label, id: option.id });
  }
  section.appendChild(grid);
  if (goal) section.appendChild(goal);
  if (group === "finder" && allowSpecificAudience) {
    specificGoal = el("div", "sb-task-specific-goal");
    specificGoal.appendChild(el("label", null, "具体想找什么样的人？"));
    specificInput = document.createElement("textarea");
    specificInput.rows = 2;
    specificInput.value = state.audienceQuery || "";
    specificInput.placeholder = "例如：杭州做露营装备的老板，或经常分享亲子旅行的人";
    specificInput.setAttribute("aria-label", "具体想找什么样的人");
    specificInput.addEventListener("input", () => { state.audienceQuery = specificInput.value; commit(true); });
    specificGoal.appendChild(specificInput);
    section.appendChild(specificGoal);
  }
  if (filters) {
    filterSection = el("div", "sb-task-filter-section");
    const filterHeader = el("div", "sb-task-filter-header");
    filterHeader.append(el("strong", null, "补充条件"), el("span", null, "选填，帮助更快找到你要的人"));
    filterSection.appendChild(filterHeader);
    const row = el("div", "sb-task-filter-row");
    for (const [key, label, values] of [
      ["industry", "行业", ["家居家装", "美妆护肤", "服饰穿搭", "餐饮美食", "数码科技", "汽车服务", "教育培训", "母婴育儿", "运动健身", "旅游出行", "宠物用品", "本地生活"]],
      ["region", "地区", ["北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "武汉", "南京", "苏州", "西安"]],
      ["followers", "粉丝要求", ["1000 以上", "1 万以上", "10 万以上"]]
    ]) {
      const details = el("details", "sb-task-filter");
      const summary = el("summary", "sb-task-filter-trigger");
      summary.setAttribute("aria-label", `${label}筛选`);
      const copy = el("span", "sb-task-filter-copy");
      const valueNode = el("strong", null, state[key] || `不限${label}`);
      copy.append(el("span", null, label), valueNode);
      summary.append(copy, el("span", "sb-task-filter-chevron", "⌄"));
      const menu = el("div", "sb-task-filter-menu");
      const optionNodes = [];
      for (const value of ["", ...values]) {
        const optionButton = el("button", "sb-task-filter-option", value || `不限${label}`);
        optionButton.type = "button";
        optionButton.dataset.value = value;
        optionButton.setAttribute("aria-label", `${label}：${value || `不限${label}`}`);
        optionButton.addEventListener("click", () => {
          state[key] = value;
          details.open = false;
          commit(true);
        });
        menu.appendChild(optionButton);
        optionNodes.push(optionButton);
      }
      details.append(summary, menu);
      row.appendChild(details);
      filterControls.push({ sync: () => {
        const current = state[key] || "";
        valueNode.textContent = current || `不限${label}`;
        details.classList.toggle("is-filtered", Boolean(current));
        optionNodes.forEach(optionNode => optionNode.classList.toggle("is-current", optionNode.dataset.value === current));
      } });
    }
    filterSection.appendChild(row);
    section.appendChild(filterSection);
  }
  if (!goalInput && allowFreeText) {
    const custom = el("details", "sb-task-extra");
    custom.open = Boolean(state.extra && !state.selected.length);
    custom.appendChild(el("summary", null, "补充特殊要求"));
    const extra = document.createElement("textarea"); extra.rows = 2; extra.value = state.extra || ""; extra.placeholder = "例如：具体品牌、其他地区，或想排除的情况"; extra.setAttribute("aria-label", "补充特殊要求（选填）");
    extra.addEventListener("input", () => { state.extra = extra.value; commit(true); }); custom.appendChild(extra); section.appendChild(custom);
  }
  container.appendChild(section); commit();
  return { state, element: section };
}

export function makeTaskSettings(label = "更多设置") {
  const details = el("details", "sb-task-settings");
  const summary = el("summary"); summary.title = label; summary.setAttribute("aria-label", label);
  const icon = el("img"); icon.src = "/assets/setting-C9MTeH0y.svg"; icon.alt = ""; summary.append(icon, el("span", null, label)); details.appendChild(summary);
  return details;
}

export const TASK_ENTRY_TITLES = Object.freeze({
  "mkt-find-people": "把几类线索合起来找",
  "mkt-comment-acquisition": "把找客户和接待交给我",
  "mkt-cold-writer": "这次想联系谁？",
  "mkt-dm-inbox": "有人来问，我帮你接待",
  "mkt-gold-customer-service": "用金牌客服接待客户"
});

export const TASK_FLOW_CSS = `
.sb-as-use.sb-consumer-use.sb-consumer-use{max-width:800px;margin:0 auto;padding:28px 28px 44px;letter-spacing:0}
.sb-consumer-use .sb-as-use-panel.sb-as-task-compose-panel,.sb-consumer-use .sb-as-use-panel{border:0;border-radius:0;background:transparent;padding:0;box-shadow:none}
.sb-task-presence{display:flex;align-items:center;gap:16px;margin-bottom:26px}
.sb-task-presence h1{font-size:24px;line-height:1.4;font-weight:650;margin:0;color:#25282c;overflow-wrap:anywhere}
.sb-task-face{width:52px;height:52px;flex:none}
.sb-task-choices{min-width:0;margin:0 0 20px;padding:0;border:0}
.sb-task-choices legend{font-size:15px;font-weight:600;margin-bottom:12px;color:#40454b}
.sb-task-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.sb-task-choice{display:flex;align-items:center;gap:11px;min-height:66px;box-sizing:border-box;padding:12px 14px;border:1px solid #e0e3e6;border-radius:8px;background:#fff;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
.sb-task-choice:hover{border-color:#8aaee8;background:#fff}
.sb-task-choice.is-selected{background:#fff;border-color:#2f80ed;box-shadow:inset 3px 0 0 #2f80ed}
.sb-task-choice:focus-within{outline:2px solid #4d7797;outline-offset:2px}
.sb-task-choice input{appearance:auto!important;width:17px!important;height:17px!important;min-height:0!important;flex:none;margin:0;accent-color:#2f80ed}
.sb-consumer-use input[type=checkbox],.sb-consumer-use input[type=radio]{accent-color:#2f80ed}
.sb-task-choice-copy{display:grid;gap:4px;min-width:0}
.sb-task-goal{display:grid;gap:8px;margin:0 0 12px}
.sb-task-goal.is-secondary{margin:14px 0 0;padding-top:14px;border-top:1px solid #edf0f3}
.sb-task-goal-label{font-size:13px;font-weight:600;color:#4b545d}
.sb-task-goal textarea{width:100%;box-sizing:border-box;min-height:76px;padding:12px;border:1px solid #dce1e5;border-radius:8px;background:#fff;color:#30363c;font:inherit;font-size:14px;line-height:1.6;resize:vertical}
.sb-task-goal textarea:focus{border-color:#7a91ac;outline:0;box-shadow:0 0 0 2px rgba(78,106,137,.1)}
.sb-task-quick-label{margin:0 0 10px;color:#737b83;font-size:12px}
.sb-task-choice strong{font-size:14px;font-weight:600;color:#282e34;overflow-wrap:anywhere}
.sb-task-choice small{font-size:12px;color:#727b83;line-height:1.45}
.sb-task-choice-guidance{margin:-4px 0 13px;color:#8390a0;font-size:11px;line-height:1.55}
.sb-task-filter-section{margin-top:18px;padding:15px 16px 16px;border:1px solid #e0e6ee;border-radius:12px;background:#fff;box-shadow:0 10px 28px rgba(31,35,41,.035)}
.sb-task-filter-header{display:flex;align-items:baseline;gap:8px;margin-bottom:11px}
.sb-task-filter-header strong{color:#303a45;font-size:13px;font-weight:680}
.sb-task-filter-header span{color:#94a0ae;font-size:10.5px}
.sb-task-filter-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.sb-task-filter{position:relative;min-width:0}
.sb-task-filter-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;box-sizing:border-box;padding:9px 11px;border:1px solid #dce3ec;border-radius:10px;background:#fff;color:#303a45;cursor:pointer;list-style:none;transition:background .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.sb-task-filter-trigger::-webkit-details-marker{display:none}
.sb-task-filter-trigger:hover{border-color:#9cb8df;background:#fbfdff;transform:translateY(-1px)}
.sb-task-filter[open] .sb-task-filter-trigger,.sb-task-filter.is-filtered .sb-task-filter-trigger{border-color:#6e9fe3;background:#f6f9ff;box-shadow:0 0 0 3px rgba(66,103,165,.08)}
.sb-task-filter-copy{display:grid;gap:4px;min-width:0}
.sb-task-filter-copy>span{color:#8593a3;font-size:10px;line-height:1.2}
.sb-task-filter-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#303a45;font-size:13px;font-weight:650;line-height:1.25}
.sb-task-filter.is-filtered .sb-task-filter-copy strong{color:#245ea9}
.sb-task-filter-chevron{flex:none;color:#8a96a4;font-size:16px;line-height:1;transition:transform .16s ease,color .16s ease}
.sb-task-filter[open] .sb-task-filter-chevron{color:#2f80ed;transform:rotate(180deg)}
.sb-task-filter-menu{position:absolute;top:calc(100% + 7px);left:0;right:0;z-index:20;display:none;gap:2px;padding:6px;border:1px solid #dce3ec;border-radius:10px;background:#fff;box-shadow:0 14px 30px rgba(31,35,41,.13)}
.sb-task-filter[open] .sb-task-filter-menu{display:grid}
.sb-task-filter-option{width:100%;min-height:34px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:#5e6a78;font:inherit;font-size:11px;text-align:left;cursor:pointer;transition:background .14s ease,color .14s ease}
.sb-task-filter-option:hover{background:#f2f6fc;color:#245ea9}
.sb-task-filter-option.is-current{background:#edf4ff;color:#245ea9;font-weight:650}
.sb-consumer-use select,.sb-task-filter-row select{min-width:0;max-width:100%;height:38px;padding:0 10px;border:1px solid #dce1e5;border-radius:6px;background:#fff;color:#4a535c;font:inherit;font-size:13px}
.sb-task-extra{margin-top:12px;font-size:12px;color:#737b83}
.sb-task-extra summary{cursor:pointer;width:fit-content;padding:4px 0}
.sb-task-extra textarea,.sb-consumer-use .sb-as-morgan-prompt textarea{min-height:68px;box-shadow:none;border-radius:8px;padding:12px;font-size:14px}
.sb-task-extra textarea{width:100%;box-sizing:border-box;margin-top:8px;border:1px solid #dce1e5;background:#fff;font:inherit;color:#30363c;resize:vertical}
.sb-task-source{display:grid;gap:9px;padding:18px 0;border-top:1px solid #e4e7ea;border-bottom:1px solid #e4e7ea;margin-bottom:12px}
.sb-task-source>label,.sb-task-message>label{font-size:13px;font-weight:600;color:#4b545d}
.sb-task-source>input{width:100%;box-sizing:border-box;min-width:0;height:42px;padding:0 12px;border:1px solid #dce1e5;border-radius:8px;background:#fff;font:inherit;font-size:14px;color:#31373e}
.sb-task-account{display:flex;align-items:center;gap:10px;min-height:48px;margin:10px 0;flex-wrap:wrap;color:#444b53;font-size:13px}
.sb-task-account select{flex:1;min-width:140px;max-width:320px;border:0;background:transparent;font-size:14px}
.sb-task-person-avatar{width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:6px;overflow:hidden;background:#e8ecee}
.sb-task-person-avatar img{width:100%;height:100%;object-fit:cover}
.sb-task-muted{font-size:12px;color:#78818a;line-height:1.6}
.sb-task-settings{margin:12px 0;border:0;border-bottom:1px solid #e5e8ea;padding-bottom:12px}
.sb-task-settings>summary{display:flex;align-items:center;gap:7px;width:fit-content;cursor:pointer;list-style:none;color:#6a737c;font-size:12px;min-height:32px}
.sb-task-settings>summary::-webkit-details-marker{display:none}
.sb-task-settings>summary img{width:16px;height:16px;opacity:.65}
.sb-task-settings>div,.sb-task-settings>fieldset{margin-top:12px}
.sb-task-account .sb-task-settings{margin:0;padding:0;border:0;position:relative}
.sb-task-account .sb-task-settings>summary{width:32px;justify-content:center}
.sb-task-account .sb-task-settings>summary span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.sb-task-account .sb-task-settings[open]>button{position:absolute;top:34px;right:0;z-index:5;width:130px;background:white}
.sb-task-account-picker{margin:20px 0;gap:12px;align-items:center}
.sb-task-account-selector{display:grid;grid-template-columns:36px minmax(0,1fr);column-gap:12px;row-gap:3px;align-items:center;flex:1;min-width:0;max-width:440px;padding:10px 12px;border:1px solid #dce1e5;border-radius:8px;background:#fff;cursor:pointer}
.sb-task-account-selector>:first-child{grid-row:1/3;width:36px;height:36px;flex:none}
.sb-task-account-caption{grid-column:2;font-size:11px;line-height:16px;color:#7d8790}
.sb-task-account-picker .sb-task-account-selector select{grid-column:2;width:100%;max-width:none;min-width:0;padding:0 22px 0 0;min-height:24px;color:#2e363d;font:inherit;font-size:14px;cursor:pointer}
.sb-task-account-selector:focus-within{border-color:#7a91ac;box-shadow:0 0 0 2px rgba(78,106,137,.1)}
.sb-task-account-picker .sb-task-settings>summary{width:auto;gap:6px;padding:6px 8px;border-radius:6px}
.sb-task-account-picker .sb-task-settings>summary:hover{background:#eef0f2}
.sb-task-account-picker .sb-task-settings>summary span{position:static;width:auto;height:auto;overflow:visible;clip-path:none;font-size:12px}
.sb-task-reception{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:20px;padding:18px 0;margin:0 0 8px;border-top:1px solid #e4e7ea;border-bottom:1px solid #e4e7ea}
.sb-task-reception-copy{display:grid;gap:8px;min-width:0}.sb-task-reception-copy>strong{font-size:13px;font-weight:600;color:#414b54}.sb-task-reception-copy .sb-task-muted{line-height:1.6}
.sb-task-reception-detail{display:grid;gap:10px;margin-top:1px}
.sb-task-reception-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px}
.sb-task-reception-item{display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;align-items:start;min-width:0}
.sb-task-reception-item>span:first-child{color:#8a929d;font-size:11px;line-height:1.55}
.sb-task-reception-item>span:last-child{color:#4a545d;font-size:11px;line-height:1.55;overflow-wrap:anywhere}
.sb-task-reception-item.is-wide{grid-column:1/-1}
.sb-task-reception-actions{display:flex;align-items:center;gap:8px;flex:none}
.sb-consumer-use .sb-task-reception-actions>button{width:auto;min-height:36px;margin:0;padding:7px 12px;border:1px solid #d5dce3;border-radius:6px;background:#fff;color:#394652;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.sb-consumer-use .sb-task-reception-actions>.sb-task-reception-refresh{border-color:transparent;background:transparent;color:#77828c;padding:7px 8px}
.sb-task-reception-actions>button:disabled{opacity:.5;cursor:default}
.sb-task-reception-actions>button:focus-visible{outline:2px solid #7a91ac;outline-offset:2px}
@media(max-width:640px){.sb-task-reception{display:flex;align-items:flex-start;flex-direction:column;gap:12px}.sb-task-reception-grid{grid-template-columns:1fr}.sb-task-reception-item.is-wide{grid-column:auto}.sb-task-account-picker{gap:6px}.sb-task-account-selector{max-width:none;flex-basis:100%}.sb-task-reception-actions{align-self:flex-start}}
.sb-task-message{display:grid;gap:9px;margin:18px 0}
.sb-task-message textarea,.sb-consumer-use .sb-as-private-message textarea{width:100%;box-sizing:border-box;min-height:84px;resize:vertical;border:1px solid #d4d4d4;border-radius:8px;padding:14px;background:#fff;color:#303030;font:inherit;font-size:14px;line-height:1.6;box-shadow:none}
.sb-task-message-preview{margin:14px 0 14px auto;max-width:88%;white-space:pre-wrap;overflow-wrap:anywhere;background:#eeeeee;border-radius:8px;padding:16px;color:#303030;font-size:14px;line-height:1.7}
.sb-task-recipients{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.sb-task-recipient{display:flex;align-items:center;gap:7px;font-size:13px;color:#4d5660;max-width:100%;overflow-wrap:anywhere}
.sb-consumer-use .sb-as-use-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:24px;padding-top:16px;border-top:1px solid #e5e8ea}
.sb-consumer-use .sb-as-use-actions>span{margin-right:auto}
.sb-consumer-use .sb-as-use-actions button,.sb-consumer-use .sb-as-finder-actions button.primary{height:44px;padding:0 20px;border-radius:8px;font-size:14px;font-weight:550;white-space:normal;line-height:1.4}
.sb-consumer-use .sb-as-use-actions button.primary{background:#252a2f;border-color:#252a2f;color:#fff;box-shadow:none}
.sb-consumer-use button:disabled{cursor:not-allowed;opacity:.5}
.sb-consumer-use .sb-as-use-panel-title{font-size:20px;line-height:1.4}
.sb-consumer-use .sb-as-use-field{font-size:12px;line-height:1.5}
.sb-consumer-use .sb-as-use-field textarea{min-height:70px;width:100%;box-sizing:border-box;border:1px solid #dce1e5;border-radius:6px;padding:10px;font:inherit;background:#fff;resize:vertical}
.sb-consumer-use .sb-as-private-source,.sb-consumer-use .sb-as-private-message,.sb-consumer-use .sb-as-inbox-plan{padding:16px 0;background:transparent;border:0;border-radius:0;box-shadow:none}
.sb-consumer-use .sb-as-private-source-title{font-size:14px}
.sb-consumer-use .sb-as-private-source-copy{display:none}
.sb-consumer-use .sb-as-private-url-input{min-height:88px;border-radius:8px;font-size:14px}
.sb-consumer-use .sb-as-private-file{min-height:48px;padding:10px;border-radius:8px;background:transparent}
.sb-consumer-use .sb-as-private-message label{font-size:13px}
.sb-consumer-use .sb-as-use-summary,.sb-consumer-use .sb-as-private-summary{display:block;background:transparent}
.sb-consumer-use .sb-as-use-summary-item{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border:0;border-bottom:1px solid #e5e8ea;border-radius:0;background:transparent}
.sb-consumer-use .sb-as-use-summary-item strong{margin:0;font-size:13px;overflow-wrap:anywhere;text-align:right}
.sb-consumer-use .sb-as-use-check{border:0;border-radius:0;background:transparent;padding:8px 0}
.sb-consumer-use .sb-as-use-result strong{letter-spacing:0}
.sb-consumer-use .sb-as-use-notice{background:transparent;padding:8px 0;border-radius:0;font-size:12px}
.sb-consumer-use .sb-as-use-notice.is-error{color:#a13d3d}
@media(max-width:640px){.sb-as-use.sb-consumer-use.sb-consumer-use{padding:22px 16px 36px}.sb-task-presence h1{font-size:20px}.sb-task-face{width:44px;height:44px}.sb-task-choice-grid{grid-template-columns:1fr}.sb-task-filter-section{padding:13px}.sb-task-filter-row{grid-template-columns:1fr}.sb-consumer-use .sb-as-use-actions button.primary{width:auto;flex:1}.sb-consumer-use .sb-as-use-actions>span{flex-basis:100%}.sb-task-message-preview{max-width:100%}.sb-task-account select{max-width:calc(100% - 86px)}}
`;
