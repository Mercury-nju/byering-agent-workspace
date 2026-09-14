const AUTH_VISUAL_IMAGE = new URL("./assets/onboarding-team-hero.png", import.meta.url).href;

function createBenefit({ documentRef, icon, title, description }) {
  const item = documentRef.createElement("article");
  item.className = "sb-douyin-benefit";
  const iconNode = documentRef.createElement("span");
  iconNode.className = "sb-douyin-benefit-icon";
  iconNode.setAttribute("aria-hidden", "true");
  iconNode.textContent = icon;
  const copy = documentRef.createElement("div");
  const heading = documentRef.createElement("strong");
  heading.textContent = title;
  const detail = documentRef.createElement("span");
  detail.textContent = description;
  copy.append(heading, detail);
  item.append(iconNode, copy);
  return item;
}

export function createDouyinAuthorization({
  documentRef = globalThis.document,
  onNext,
  onBack,
  onLater
} = {}) {
  const root = documentRef.createElement("main");
  root.className = "sb-douyin-auth-page";

  const brand = documentRef.createElement("div");
  brand.className = "sb-douyin-brand";
  brand.innerHTML = "<span class=\"sb-douyin-brand-mark\">B</span><strong>Byering</strong>";

  const heading = documentRef.createElement("h1");
  heading.textContent = "先连接你的抖音账号";
  const subtitle = documentRef.createElement("p");
  subtitle.className = "sb-douyin-subtitle";
  subtitle.textContent = "为了帮你找人、联系和跟进，Byering 需要先获得你的抖音账号授权。";
  const privacy = documentRef.createElement("p");
  privacy.className = "sb-douyin-privacy";
  privacy.innerHTML = "<span aria-hidden=\"true\">♢</span>仅在你的授权范围内使用，用于账号识别、潜客发现与任务执行。";

  const panel = documentRef.createElement("section");
  panel.className = "sb-douyin-auth-panel";

  const visual = documentRef.createElement("div");
  visual.className = "sb-douyin-auth-visual";
  const illustration = documentRef.createElement("img");
  illustration.src = AUTH_VISUAL_IMAGE;
  illustration.alt = "数字员工协助连接抖音账号";
  illustration.decoding = "async";
  illustration.loading = "eager";
  const douyinBadge = documentRef.createElement("div");
  douyinBadge.className = "sb-douyin-visual-badge";
  douyinBadge.innerHTML = "<span>♪</span>";
  visual.append(illustration, douyinBadge);

  const card = documentRef.createElement("section");
  card.className = "sb-douyin-account-card";
  const cardHeading = documentRef.createElement("h2");
  cardHeading.innerHTML = "<span aria-hidden=\"true\">♙</span>抖音账号授权";
  const account = documentRef.createElement("div");
  account.className = "sb-douyin-account-row";
  const logo = documentRef.createElement("span");
  logo.className = "sb-douyin-logo";
  logo.textContent = "♪";
  const accountCopy = documentRef.createElement("div");
  accountCopy.innerHTML = "<strong>抖音账号 <em>待授权</em></strong><span>当前状态：未连接</span>";
  account.append(logo, accountCopy);
  const authorize = documentRef.createElement("button");
  authorize.type = "button";
  authorize.className = "sb-douyin-authorize-button";
  authorize.innerHTML = "<span aria-hidden=\"true\">♢</span><span>登录并授权抖音账号</span>";
  authorize.addEventListener("click", () => onNext?.({ step: "auth", provider: "douyin" }));
  const why = documentRef.createElement("button");
  why.type = "button";
  why.className = "sb-douyin-why";
  why.textContent = "为什么需要授权?";
  why.addEventListener("click", () => {
    card.classList.toggle("is-explained");
  });
  const explanation = documentRef.createElement("p");
  explanation.className = "sb-douyin-explanation";
  explanation.textContent = "授权后，数字员工才能识别潜客、执行触达并同步任务结果。";
  card.append(cardHeading, account, authorize, why, explanation);
  panel.append(visual, card);

  const benefitsHeading = documentRef.createElement("h2");
  benefitsHeading.className = "sb-douyin-benefits-heading";
  benefitsHeading.textContent = "授权后，Byering 将为你：";
  const benefits = documentRef.createElement("div");
  benefits.className = "sb-douyin-benefits";
  [
    ["●", "识别你的账号身份", "确认账号归属，保障数据安全。"],
    ["◎", "发现评论区、粉丝和直播间中的潜在客户", "精准挖掘有需求的潜在人群。"],
    ["➤", "执行触达与后续跟进任务", "自动触达、互动并推进转化。"],
    ["▥", "同步任务结果与客户状态", "实时更新进展，便于你掌控全局。"]
  ].forEach(([icon, title, description]) => benefits.appendChild(createBenefit({ documentRef, icon, title, description })));

  const actions = documentRef.createElement("div");
  actions.className = "sb-douyin-auth-actions";
  const later = documentRef.createElement("button");
  later.type = "button";
  later.className = "sb-douyin-later";
  later.textContent = "稍后再说";
  later.addEventListener("click", () => onLater?.({ step: "auth" }));
  actions.append(later);

  root.append(brand, heading, subtitle, privacy, panel, benefitsHeading, benefits, actions);
  return {
    root,
    destroy() { root.remove(); }
  };
}
