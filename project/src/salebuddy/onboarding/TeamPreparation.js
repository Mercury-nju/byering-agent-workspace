const TEAM_HERO_IMAGE = new URL("./assets/onboarding-team-hero.png", import.meta.url).href;

function createConfigRow({ documentRef, icon, label, value }) {
  const row = documentRef.createElement("div");
  row.className = "sb-team-config-row";
  const iconNode = documentRef.createElement("span");
  iconNode.className = `sb-team-config-icon is-${icon}`;
  iconNode.setAttribute("aria-hidden", "true");
  iconNode.textContent = icon === "business" ? "▣" : icon === "goal" ? "◎" : "➤";
  const copy = documentRef.createElement("span");
  copy.innerHTML = `<b>${label}：</b>${value}`;
  row.append(iconNode, copy);
  return row;
}

function createMatchedAgentRow({ documentRef, agent, index }) {
  const row = documentRef.createElement("article");
  row.className = "sb-team-match-row";
  const number = documentRef.createElement("span");
  number.className = "sb-team-match-number";
  number.textContent = String(index + 1).padStart(2, "0");
  const copy = documentRef.createElement("div");
  copy.className = "sb-team-match-copy";
  const name = documentRef.createElement("strong");
  name.textContent = agent.name;
  const role = documentRef.createElement("span");
  role.textContent = `${agent.stage} · ${agent.role}`;
  copy.append(name, role);
  row.append(number, copy);
  return row;
}

export function createTeamPreparation({
  documentRef = globalThis.document,
  businessType = "电商卖货",
  currentGoal = "找到高意向客户",
  match = null,
  onNext,
  onBack
} = {}) {
  const root = documentRef.createElement("main");
  root.className = "sb-team-preparation";

  const brand = documentRef.createElement("div");
  brand.className = "sb-team-brand";
  brand.innerHTML = "<span class=\"sb-team-brand-mark\">B</span><strong>Byering</strong>";

  const heading = documentRef.createElement("h1");
  heading.textContent = match?.agents?.length ? `已为你匹配 ${match.agents.length} 位数字员工` : "正在为你准备数字员工团队";
  const subtitle = documentRef.createElement("p");
  subtitle.textContent = match?.goalFocus
    ? `围绕「${businessType}」的${match.goalFocus}，团队将按「${match.workflowName}」协作。`
    : "根据你的业务类型和当前目标，Byering 正在为你匹配最合适的数字员工。";
  subtitle.className = "sb-team-subtitle";

  const workspace = documentRef.createElement("div");
  workspace.className = "sb-team-workspace";

  const network = documentRef.createElement("section");
  network.className = "sb-team-network";
  network.setAttribute("aria-label", "数字员工匹配结果");
  const illustration = documentRef.createElement("img");
  illustration.className = "sb-team-illustration";
  illustration.src = TEAM_HERO_IMAGE;
  illustration.alt = "Byering 数字员工团队开始执行任务";
  illustration.decoding = "async";
  illustration.loading = "eager";
  network.appendChild(illustration);

  const config = documentRef.createElement("section");
  config.className = "sb-team-config";
  config.innerHTML = "<h2><span aria-hidden=\"true\">▧</span>你的配置</h2>";
  const configBox = documentRef.createElement("div");
  configBox.className = "sb-team-config-box";
  configBox.append(
    createConfigRow({ documentRef, icon: "business", label: "业务类型", value: businessType }),
    createConfigRow({ documentRef, icon: "goal", label: "当前目标", value: currentGoal }),
    createConfigRow({ documentRef, icon: "touch", label: "执行工作流", value: match?.workflowName || "稍后确认" })
  );
  const matchHeading = documentRef.createElement("h3");
  matchHeading.className = "sb-team-match-heading";
  matchHeading.appendChild(documentRef.createTextNode("匹配的数字员工"));
  const matchCount = documentRef.createElement("span");
  matchCount.className = "sb-team-match-count";
  matchCount.textContent = `${match?.agents?.length || 0} 位`;
  matchHeading.appendChild(matchCount);
  const matchList = documentRef.createElement("div");
  matchList.className = "sb-team-match-list";
  (match?.agents || []).forEach((agent, index) => matchList.appendChild(createMatchedAgentRow({ documentRef, agent, index })));
  if (!match?.agents?.length) {
    matchList.appendChild(documentRef.createTextNode("团队角色将在下一步生成。"));
  }
  const matchNote = documentRef.createElement("p");
  matchNote.className = "sb-team-match-note";
  matchNote.textContent = match?.industryFocus ? `行业重点：${match.industryFocus}` : "";
  const tip = documentRef.createElement("div");
  tip.className = "sb-team-tip";
  tip.innerHTML = `<span class="sb-team-tip-icon" aria-hidden="true">♧</span><p><strong>小提示：</strong><br>数字员工已经准备就绪，下一步${match?.requiresAccess ? "先连接抖音账号，再开始执行任务" : "可以直接开始第一个任务"}。</p>`;
  config.append(configBox, matchHeading, matchList, matchNote, tip);
  workspace.append(network, config);

  const footer = documentRef.createElement("footer");
  footer.className = "sb-team-footer";
  const ready = documentRef.createElement("span");
  ready.className = "sb-team-ready";
  ready.innerHTML = `<span aria-hidden="true">◷</span>${match?.agents?.length || 0} 位数字员工已按目标就绪，${match?.requiresAccess ? "连接账号后开始执行" : "马上可以开始任务"}`;
  const back = documentRef.createElement("button");
  back.type = "button";
  back.className = "sb-team-back";
  back.textContent = "返回上一步";
  back.addEventListener("click", () => onBack?.({ step: "team" }));
  const start = documentRef.createElement("button");
  start.type = "button";
  start.className = "sb-team-start";
  start.innerHTML = `<span>${match?.requiresAccess ? "继续连接账号" : "开始第一个任务"}</span><span aria-hidden="true">→</span>`;
  start.addEventListener("click", () => onNext?.({ step: "team" }));
  footer.append(ready, back, start);

  root.append(brand, heading, subtitle, workspace, footer);
  return {
    root,
    destroy() { root.remove(); }
  };
}
