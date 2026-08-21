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
  { key: "account-resolver", name: "抖音账号解析", desc: "把抖音号、账号名称或主页链接解析成可采集的账号身份", input: "抖音号、账号名称或主页链接", steps: ["识别账号引用并核验候选", "取得公开账号身份与主页信息", "保留解析来源和歧义提示"], output: "账号身份卡（昵称、抖音号、sec_id、来源）", color: "#3B6BD4", icon: '<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="3.2"/><path d="M11 1.5v3M11 17.5v3M1.5 11h3M17.5 11h3"/>' },
  { key: "public-video-list", name: "公开视频采集", desc: "读取指定抖音账号的公开视频列表和基础公开信息", input: "已确认的抖音账号身份、时间范围", steps: ["提交公开视频采集任务", "等待视频列表回传", "整理视频标识、标题、链接和发布时间"], output: "公开视频清单（来源、时间、标题和链接）", color: "#2E9E6B", icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h7M7 16h5"/>' },
  { key: "public-comments", name: "作品评论采集", desc: "抓取指定账号公开视频下的公开评论并保留作品证据", input: "账号身份或作品 ID、评论采集范围", steps: ["关联公开视频与作品 ID", "提交评论采集任务", "按评论者和作品保留原始证据"], output: "评论证据表（评论者、内容、时间、作品来源）", color: "#7A5CCE", icon: '<path d="M4 4.5h16v11H9l-5 4v-15z"/><path d="M7 8h10M7 11.5h7"/>' },
  { key: "intent-scoring", name: "评论意向分析", desc: "从公开评论识别购车、咨询和明确需求信号并分层", input: "公开评论和目标客户画像", steps: ["清洗重复评论和无效文本", "提取车型、预算、时间等信号", "输出评分、等级和判断依据"], output: "意向线索表（评分、证据、风险和优先级）", color: "#E8A33D", icon: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>' },
  { key: "lead-evidence", name: "线索证据整理", desc: "把候选账号、评论原文和作品来源整理成可核验清单", input: "已采集的视频、评论和账号身份", steps: ["按 sec_id 或 uid 去重", "合并同一用户的公开评论证据", "标出身份缺口和不可核验项"], output: "可核验线索清单（身份、证据、来源和缺口）", color: "#D45B5B", icon: '<path d="M6 2.5h8l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M14 2.5V8h5M8 13h8M8 16h6"/>' },
  { key: "prospect-review", name: "找人结果复盘", desc: "复盘公开视频、评论、候选线索和风险筛选结果", input: "一次已完成的公开找人任务", steps: ["核对视频和评论采集数量", "查看候选与高意向分层", "汇总证据缺口和下一步建议"], output: "公开找人结果摘要（数量、线索、证据和缺口）", color: "#5B8DEF", icon: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>' }
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
