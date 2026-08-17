/**
 * ui/sales-skills.js
 * 技能广场·工具箱：在卡片网格上方注入「销售场景」官方技能区。
 * 卡片通过克隆原生卡片节点改造（样式与原生完全一致），挂在自建网格里
 * （复用原生网格 class，不碰虚拟列表内部，避免被 React 对账抹掉）。
 * 纯运行时注入，不改任何冻结文件。
 */
import { BRAND } from "../brand.js";
import { startSkillTask } from "./task-runner.js";

const SALES_SKILLS = [
  { key: "lead-hunter", name: "线索挖掘", desc: "按行业与地区全网搜索潜在客户，自动补全决策人联系方式", input: "目标行业、地区、客户画像与排除条件", steps: ["搜索公开企业与客户线索", "核验官网、职位与联系方式", "去重并标注来源和可信度"], output: "线索清单（含来源、决策人和核验状态）", color: "#3B6BD4", icon: '<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="3.2"/><path d="M11 1.5v3M11 17.5v3M1.5 11h3M17.5 11h3"/>' },
  { key: "outreach-writer", name: "触达话术", desc: "按客户画像生成首触邮件与跟进话术，自带 A/B 两个版本", input: "客户画像、沟通目标、渠道和品牌语气", steps: ["提炼客户痛点和触发信号", "生成首触与跟进 A/B 版本", "标注变量、风险和下一步 CTA"], output: "可直接发送的话术包（含 A/B 版本和变量说明）", color: "#7A5CCE", icon: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>' },
  { key: "customer-360", name: "客户背调", desc: "工商、财报、舆情、招聘动态一键汇总成一页简报", input: "公司名称、官网或统一社会信用代码", steps: ["确认企业身份并收集公开资料", "交叉核验工商、财报与舆情", "按销售相关性整理关键变化"], output: "客户一页简报（事实、来源、风险与切入点）", color: "#2E9E6B", icon: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5.5 5.5M10 6.5v3.5l2.5 2.5"/>' },
  { key: "sequence-planner", name: "跟进节奏", desc: "多轮触达自动排期，到点提醒，重点客户不丢单", input: "客户阶段、最近互动、可用渠道和跟进截止日", steps: ["判断客户阶段和当前阻塞", "设计多轮触达节点与间隔", "生成待办并标注升级条件"], output: "客户跟进排期（节点、负责人、话术和提醒）", color: "#E8A33D", icon: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M7.5 2.5v4M16.5 2.5v4M8 13.5l2.5 2.5 5-5"/>' },
  { key: "competitor-watch", name: "竞品情报", desc: "监控竞品动态、价格调整与舆情变化，周报推送", input: "竞品名单、关注维度、时间窗口和信息来源", steps: ["采集产品、价格、客户案例变化", "核验来源并区分事实与观点", "归纳对销售策略有影响的变化"], output: "竞品动态周报（变化、证据、影响和建议）", color: "#D45B5B", icon: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>' },
  { key: "lead-scoring", name: "线索评分", desc: "按画像匹配度与行为信号给线索打分，优先跟进高分单", input: "线索表、目标客户画像、行为信号和评分规则", steps: ["清洗字段并识别缺失信息", "按画像和行为信号计算分层", "解释评分依据并给出优先级"], output: "分层线索表（评分、依据、缺口和建议动作）", color: "#3B6BD4", icon: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>' },
  { key: "crm-sync", name: "CRM 同步", desc: "线索与跟进记录自动写入 CRM，字段映射可配置", input: "待同步表格、CRM 字段映射和重复记录规则", steps: ["匹配字段并检查必填项", "识别重复客户和冲突记录", "输出同步清单，等待授权后写入"], output: "CRM 同步报告（成功、跳过、冲突和待确认项）", color: "#5B8DEF", icon: '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/>' },
  { key: "quote-builder", name: "报价单生成", desc: "选择配项自动生成报价单与合同初稿，支持在线签署", input: "客户需求、产品配置、价格表、折扣和付款条款", steps: ["核对配置、价格和适用条件", "生成报价明细与版本差异", "标注审批项并输出合同初稿"], output: "报价单与合同初稿（含审批和风险提示）", color: "#8A8F99", icon: '<path d="M6 2.5h8l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M14 2.5V8h5M9 13h6M9 16.5h6"/>' }
];

const CSS = `
.sb-sales-skills{padding:0 72px 18px}
.sb-sales-skills-head{display:flex;align-items:baseline;gap:8px;padding:2px 2px 10px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-sales-skills-title{font-size:14px;font-weight:600;color:#1F2329}
.sb-sales-skills-sub{font-size:11px;color:#B0B4BB}
.sb-sales-skills [class*="_cardIcon_"]{overflow:hidden}
.sb-sales-icon{width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:inherit}
.sb-sales-icon svg{width:58%;height:58%;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-sales-avatar{width:100%;height:100%;border-radius:50%;background:#1F2329;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600}
.sb-sales-skill-modal{position:fixed;inset:0;z-index:10070;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(19,25,32,.42);backdrop-filter:blur(8px);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-sales-skill-dialog{width:min(620px,calc(100vw - 40px));max-height:min(720px,calc(100vh - 56px));overflow:auto;background:#fff;border:1px solid rgba(15,15,15,.09);border-radius:18px;box-shadow:0 24px 70px rgba(16,24,32,.24);padding:24px}
.sb-sales-skill-head{display:flex;align-items:flex-start;gap:13px}.sb-sales-skill-icon{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;flex:none}.sb-sales-skill-icon svg{width:27px;height:27px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.sb-sales-skill-title{font-size:21px;font-weight:750;color:#17191B}.sb-sales-skill-desc{font-size:12px;color:#717A83;line-height:1.55;margin-top:4px}.sb-sales-skill-close{margin-left:auto;border:0;background:#F1F3F5;color:#6D757D;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:18px;line-height:1}.sb-sales-skill-contract{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}.sb-sales-skill-block{border:1px solid #E4E7EA;border-radius:11px;padding:12px}.sb-sales-skill-block-wide{grid-column:1/-1}.sb-sales-skill-label{font-size:10px;font-weight:750;letter-spacing:.08em;color:#8A9299;text-transform:uppercase}.sb-sales-skill-value{font-size:12px;line-height:1.55;color:#303940;margin-top:6px}.sb-sales-skill-steps{display:flex;flex-direction:column;gap:8px;margin-top:7px}.sb-sales-skill-step{display:flex;gap:8px;font-size:12px;color:#303940;line-height:1.45}.sb-sales-skill-step i{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;flex:none;background:#EEF4FF;color:#3B6BD4;font-style:normal;font-size:10px;font-weight:700}.sb-sales-skill-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.sb-sales-skill-action{border:1px solid #D8DDE1;background:#fff;color:#4F5860;border-radius:9px;padding:10px 14px;font:650 12px/1.1 inherit;cursor:pointer}.sb-sales-skill-action-primary{background:#17191B;border-color:#17191B;color:#fff}
@media(max-width:640px){.sb-sales-skill-contract{grid-template-columns:1fr}.sb-sales-skill-block-wide{grid-column:auto}}
@media(max-width:1324px){.sb-sales-skills{padding-left:40px;padding-right:40px}}
@media(max-width:640px){.sb-sales-skills{padding-left:18px;padding-right:18px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

const SECTION_ID = "salebuddy-sales-skills";

function buildSkillModal(skill, { teamLive, gateway } = {}) {
  const modal = document.createElement("div");
  modal.className = "sb-sales-skill-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const dialog = document.createElement("div");
  dialog.className = "sb-sales-skill-dialog";
  const head = document.createElement("div");
  head.className = "sb-sales-skill-head";
  const icon = document.createElement("div");
  icon.className = "sb-sales-skill-icon";
  icon.style.background = skill.color;
  icon.innerHTML = `<svg viewBox="0 0 24 24">${skill.icon}</svg>`;
  const copy = document.createElement("div");
  const title = document.createElement("div");
  title.className = "sb-sales-skill-title";
  title.textContent = skill.name;
  const desc = document.createElement("div");
  desc.className = "sb-sales-skill-desc";
  desc.textContent = skill.desc;
  copy.append(title, desc);
  const close = document.createElement("button");
  close.className = "sb-sales-skill-close";
  close.type = "button";
  close.setAttribute("aria-label", "关闭能力详情");
  close.textContent = "×";
  head.append(icon, copy, close);
  const contract = document.createElement("div");
  contract.className = "sb-sales-skill-contract";
  const block = (label, value, wide = false) => {
    const section = document.createElement("section");
    section.className = `sb-sales-skill-block${wide ? " sb-sales-skill-block-wide" : ""}`;
    const labelEl = document.createElement("div");
    labelEl.className = "sb-sales-skill-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "sb-sales-skill-value";
    valueEl.textContent = value;
    section.append(labelEl, valueEl);
    return section;
  };
  contract.append(block("需要输入", skill.input), block("交付结果", skill.output));
  const steps = document.createElement("section");
  steps.className = "sb-sales-skill-block sb-sales-skill-block-wide";
  steps.appendChild(Object.assign(document.createElement("div"), { className: "sb-sales-skill-label", textContent: "执行步骤" }));
  const stepList = document.createElement("div");
  stepList.className = "sb-sales-skill-steps";
  skill.steps.forEach((text, index) => {
    const row = document.createElement("div");
    row.className = "sb-sales-skill-step";
    const number = document.createElement("i");
    number.textContent = String(index + 1);
    row.append(number, document.createTextNode(text));
    stepList.appendChild(row);
  });
  steps.appendChild(stepList);
  contract.appendChild(steps);
  const actions = document.createElement("div");
  actions.className = "sb-sales-skill-actions";
  const cancel = document.createElement("button");
  cancel.className = "sb-sales-skill-action";
  cancel.type = "button";
  cancel.textContent = "返回";
  const run = document.createElement("button");
  run.className = "sb-sales-skill-action sb-sales-skill-action-primary";
  run.type = "button";
  run.textContent = "开始执行";
  const dismiss = () => modal.remove();
  close.addEventListener("click", dismiss);
  cancel.addEventListener("click", dismiss);
  modal.addEventListener("click", (event) => { if (event.target === modal) dismiss(); });
  run.addEventListener("click", async () => {
    run.disabled = true;
    run.textContent = "正在建立任务…";
    const started = await startSkillTask({ name: skill.name, prompt: `请执行技能「${skill.name}」。\n输入范围：${skill.input}\n执行步骤：${skill.steps.join("；")}。\n交付结果：${skill.output}。`, teamLive, gateway });
    if (started) dismiss();
    else { run.disabled = false; run.textContent = "开始执行"; }
  });
  actions.append(cancel, run);
  dialog.append(head, contract, actions);
  modal.appendChild(dialog);
  return modal;
}

function buildCard(templateCard, skill, options = {}) {
  const card = templateCard.cloneNode(true);
  // 去掉曝光埋点属性，避免假数据上报
  for (const node of [card, ...card.querySelectorAll("[dt-eid]")]) {
    for (const attr of [...node.attributes]) {
      if (attr.name.startsWith("dt-")) node.removeAttribute(attr.name);
    }
  }
  // 图标
  const iconBox = card.querySelector('[class*="_cardIcon_"]');
  if (iconBox) {
    iconBox.textContent = "";
    const icon = document.createElement("div");
    icon.className = "sb-sales-icon";
    icon.style.background = skill.color;
    icon.innerHTML = `<svg viewBox="0 0 24 24">${skill.icon}</svg>`;
    iconBox.appendChild(icon);
  }
  const set = (selector, text) => {
    const node = card.querySelector(selector);
    if (node) node.textContent = text;
  };
  set('[class*="_cardTitle_"]', skill.name);
  set('[class*="_cardDesc_"]', skill.desc);
  set('[class*="_creatorName_"]', BRAND.name);
  set('[class*="_userCount_"]', "官方技能");
  const avatar = card.querySelector('[class*="_creatorAvatar_"]');
  if (avatar) {
    avatar.textContent = "";
    const mark = document.createElement("span");
    mark.className = "sb-sales-avatar";
    mark.textContent = "S";
    avatar.appendChild(mark);
  }
  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    document.body.appendChild(buildSkillModal(skill, options));
  });
  // 添加按钮：打开能力详情，而不是切换一个无后端含义的本地状态
  const btn = card.querySelector("button");
  if (btn) {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.body.appendChild(buildSkillModal(skill, options));
    });
  }
  return card;
}

export function mountSalesSkills({ teamLive = null, gateway = null } = {}) {
  ensureStyle();

  function sweep() {
    // 注意：自建网格复用了原生网格 class，必须用 :not 排除，否则会选中自己导致死循环
    const grid = document.querySelector('[class*="_cardGrid_"]:not(.sb-sales-skills-grid)');
    if (!grid) return;
    // 已注入且还挂着就不重复
    const existing = document.getElementById(SECTION_ID);
    const cardList = grid.closest('[class*="_cardList_"]');
    const host = cardList?.parentElement || grid.parentElement;
    if (!host) return;
    if (existing?.isConnected && existing.parentElement === host && existing.nextElementSibling === cardList) return;

    const templateCard = grid.querySelector('[class*="_skillCard_"]');
    if (!templateCard) return;

    existing?.remove();
    const section = document.createElement("div");
    section.id = SECTION_ID;
    section.className = "sb-sales-skills notranslate";
    section.setAttribute("translate", "no");

    const head = document.createElement("div");
    head.className = "sb-sales-skills-head";
    const title = document.createElement("span");
    title.className = "sb-sales-skills-title";
    title.textContent = "销售场景";
    const sub = document.createElement("span");
    sub.className = "sb-sales-skills-sub";
    sub.textContent = `${BRAND.official} · ${SALES_SKILLS.length} 个`;
    head.append(title, sub);
    section.appendChild(head);

    // 复用原生网格 class，布局与原生卡片流一致（加标记 class 供选择器排除自己）
    const ourGrid = document.createElement("div");
    ourGrid.className = `${grid.className} sb-sales-skills-grid`;
    for (const skill of SALES_SKILLS) ourGrid.appendChild(buildCard(templateCard, skill, { teamLive, gateway }));
    section.appendChild(ourGrid);

    host.insertBefore(section, cardList || grid);
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; sweep(); }, 80);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // 数据加载完成时 React 会整体重渲染网格，observer 之外再加低频轮询兜底，
  // 保证被抹掉后 600ms 内补挂回来
  const interval = setInterval(sweep, 600);
  sweep();
  console.log("[SaleBuddy] 销售场景技能区已挂载");

  return {
    unmount() {
      observer.disconnect();
      clearInterval(interval);
      document.getElementById(SECTION_ID)?.remove();
      document.querySelectorAll(".sb-sales-skill-modal").forEach((modal) => modal.remove());
    }
  };
}
