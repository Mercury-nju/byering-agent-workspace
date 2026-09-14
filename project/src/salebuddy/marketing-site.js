const SITE_ROOT_ID = "byering-marketing-root";

const workflowCards = [
  {
    eyebrow: "01 / 发现",
    title: "持续发现潜客",
    copy: "从公开内容、评论与互动信号中，识别更接近成交的人。",
    image: "./assets/byering-product-agent-center.png?v=product-ui-20260907",
    alt: "Byering Agent 中心实际产品页面截图",
    tone: "blue"
  },
  {
    eyebrow: "02 / 判断",
    title: "判断谁值得跟进",
    copy: "把零散的表达、需求和行为整理成可回查的意向判断。",
    image: "./assets/byering-product-realtime-work.png?v=product-ui-20260907",
    alt: "Byering 实时工作实际产品页面截图",
    tone: "mist"
  },
  {
    eyebrow: "03 / 跟进",
    title: "让每一次触达有下一步",
    copy: "准备触达角度，记录回复，持续推进关系，并把结果留下来。",
    image: "./assets/byering-product-agent-detail.png?v=product-ui-20260907",
    alt: "Byering Agent 任务详情实际产品页面截图",
    tone: "green"
  }
];

function workflowCard(card) {
  return `
    <article class="workflow-card reveal" data-tone="${card.tone}">
      <div class="workflow-card__visual">
        <div class="workflow-card__glow"></div>
        <img src="${card.image}" alt="${card.alt}" loading="lazy">
      </div>
      <div class="workflow-card__body">
        <span class="eyebrow">${card.eyebrow}</span>
        <h3>${card.title}</h3>
        <p>${card.copy}</p>
      </div>
    </article>
  `;
}

function renderSite() {
  return `
    <div class="marketing-shell">
      <header class="marketing-nav" data-nav>
        <a class="brand-lockup" href="#top" aria-label="Byering 首页">
          <img src="./assets/byering-logo-mark.png" alt="">
          <span>Byering</span>
        </a>
        <nav class="nav-links" aria-label="主要导航">
          <a href="#workflow">怎么工作</a>
          <a href="#capabilities">能力</a>
          <a href="#faq">常见问题</a>
        </nav>
        <a class="nav-cta" href="?page=login">立即注册</a>
      </header>

      <main>
        <section class="marketing-hero" id="top">
          <div class="hero-scene" aria-hidden="true"></div>
          <div class="hero-wash"></div>
          <div class="hero-light hero-light--left"></div>
          <div class="hero-light hero-light--right"></div>
          <div class="hero-content">
            <div class="hero-kicker reveal">BYERING / AI ACQUISITION TEAM</div>
            <h1 class="reveal reveal--delay-1"><span class="hero-title-rank">#1</span> 持续为你工作的<br><em>AI 获客团队</em></h1>
            <p class="hero-copy reveal reveal--delay-2">Byering 发现高意向潜客，研究客户、协助触达与持续跟进，把每一次经营沉淀成下一次增长的业务资产。</p>
            <div class="hero-actions reveal reveal--delay-3">
              <a class="primary-button" href="?page=login">立即注册 <span>↗</span></a>
              <a class="text-button" href="#workflow">了解怎么工作 <span>↓</span></a>
            </div>
          </div>

          <div class="hero-product-frame reveal reveal--delay-3" aria-label="Byering 产品工作画面">
            <div class="window-chrome">
              <div class="window-dots"><i></i><i></i><i></i></div>
              <span class="window-title">Byering · 幕僚长</span>
              <span class="window-status"><b></b> 正在工作</span>
            </div>
            <div class="hero-product-content">
              <img src="./assets/byering-product-agent-center.png?v=product-ui-20260907" alt="Byering Agent 中心实际产品页面截图">
            </div>
            <div class="hero-frame-footer"><span>今天的获客任务</span><span>⌘ ↵ 进入工作台</span></div>
          </div>
        </section>

        <section class="section workflow-section" id="workflow">
          <div class="section-heading reveal">
            <span class="section-index">01 / 工作方式</span>
            <h2>Byering 如何持续帮你找到客户</h2>
            <p>你只需要告诉它想要的结果。幕僚长会组织合适的 Agent，把发现、判断、触达和跟进串成一项持续工作的任务。</p>
          </div>
          <div class="workflow-grid">
            ${workflowCards.map(workflowCard).join("")}
          </div>
        </section>

        <section class="section brief-section" id="capabilities">
          <div class="brief-layout">
            <div class="brief-copy reveal">
              <span class="section-index">02 / 客户判断</span>
              <h2>即时客户简报</h2>
              <p>把每个值得联系的人，整理成一份可执行的判断。你看到的不只是一个昵称，而是为什么现在值得联系，以及下一步应该怎么做。</p>
              <div class="brief-list">
                <div><span>01</span><b>意向信号</b><small>客户说了什么，做了什么</small></div>
                <div><span>02</span><b>触达角度</b><small>为什么联系，应该怎么开场</small></div>
                <div><span>03</span><b>跟进建议</b><small>下一步行动和风险提示</small></div>
              </div>
            </div>
            <div class="brief-visual reveal reveal--delay-1">
              <div class="brief-backdrop"></div>
              <div class="brief-window">
                <div class="brief-window__bar"><span>潜客简报 / 2026.09.02</span><span>已完成</span></div>
                <div class="brief-window__head">
                  <div class="profile-orb">小</div>
                  <div><strong>小雨今天喝拿铁</strong><small>评论于「意式半自动咖啡机」作品</small></div>
                  <span class="intent-badge">高意向</span>
                </div>
                <div class="signal-block"><span class="signal-label">意向证据</span><p>“请问这款萃取压力够吗？想入手，主要用来做拿铁。”</p><a href="#workflow">查看原评论 ↗</a><b>92</b></div>
                <div class="brief-columns">
                  <div><span>客户关注</span><strong>口感、压力、入手时机</strong></div>
                  <div><span>建议动作</span><strong>先回答使用场景，再给出适配型号</strong></div>
                </div>
                <div class="brief-footer"><span><i></i> 触达策略师已准备</span><button type="button" data-demo-action>查看建议</button></div>
              </div>
            </div>
          </div>
        </section>

        <section class="section control-section">
          <div class="section-heading reveal">
            <span class="section-index">03 / 清楚可控</span>
            <h2>每一次触达，都清楚可控</h2>
            <p>Byering 把复杂的 Agent 协作收进产品内部，同时把真正重要的业务动作、依据和边界交还给你。</p>
          </div>
          <div class="control-grid">
            <article class="control-card control-card--blue reveal">
              <div class="control-art"><div class="signal-lines"><i></i><i></i><i></i><i></i></div><div class="signal-pin">高意向 <b>92</b></div></div>
              <h3>不漏掉有效信号</h3><p>从评论、互动和行为中筛出值得跟进的人。</p>
            </article>
            <article class="control-card control-card--cream reveal reveal--delay-1">
              <div class="control-art"><div class="permission-card"><span>外部发送</span><strong>等待确认</strong><button type="button" data-demo-action>确认动作</button></div></div>
              <h3>不替你越权行动</h3><p>账号权限、发送动作和风险边界，由你掌握。</p>
            </article>
            <article class="control-card control-card--green reveal reveal--delay-2">
              <div class="control-art"><div class="memory-stack"><i>客户</i><i>回复</i><i>经验</i><i>资产</i></div></div>
              <h3>不让经验随任务消失</h3><p>客户、回复、话术和结果，持续沉淀为业务资产。</p>
            </article>
          </div>
        </section>

        <section class="section team-section">
          <div class="team-layout">
            <div class="team-visual reveal">
              <div class="team-orbit team-orbit--one"></div><div class="team-orbit team-orbit--two"></div>
              <div class="chief-node"><img src="./assets/byering-logo-mark.png" alt=""><span>Byering<br><small>幕僚长</small></span></div>
              <div class="role-node role-node--one"><b>潜客挖掘员</b><small>正在发现</small></div>
              <div class="role-node role-node--two"><b>客户分析员</b><small>正在整理</small></div>
              <div class="role-node role-node--three"><b>触达策略师</b><small>待确认</small></div>
            </div>
            <div class="team-copy reveal reveal--delay-1">
              <span class="section-index">04 / Agent 团队</span>
              <h2>你不需要管理一组 Agent</h2>
              <p>你只需要和 Byering 说清楚目标。幕僚长会自动理解需求、拆解任务、组织专业 Agent，并持续向你汇报结果。</p>
              <div class="team-proof"><strong>1 个</strong><span>主 Agent 入口</span><strong>多岗位</strong><span>专业 Agent 协作</span><strong>每一次</strong><span>经营结果持续沉淀</span></div>
            </div>
          </div>
        </section>

        <section class="section faq-section" id="faq">
          <div class="faq-layout">
            <div class="section-heading reveal"><span class="section-index">05 / 常见问题</span><h2>在开始之前，先了解 Byering</h2></div>
            <div class="faq-list reveal reveal--delay-1">
              <details open><summary>Byering 适合谁？<span>+</span></summary><p>适合个体卖家、主播、内容创作者、专业顾问和小型商家。只要你已经有商品、内容或账号，却缺少稳定主动的获客和跟进能力，就可以从 Byering 开始。</p></details>
              <details><summary>我需要自己配置一组 Agent 吗？<span>+</span></summary><p>不需要。Byering 的幕僚长会根据你的目标自动组织合适的专业 Agent，你看到的是业务结果，而不是复杂的技术配置。</p></details>
              <details><summary>它会自动发私信吗？<span>+</span></summary><p>在平台能力和账号授权允许的范围内，Byering 会准备并协助执行触达。涉及外部发送或敏感动作时，会在具体动作层面请求你的确认。</p></details>
              <details><summary>Byering 如何找到潜客？<span>+</span></summary><p>第一阶段聚焦抖音公开内容、评论和互动信号，识别价格、求链接、适配性、购买时间和竞品比较等明确意向。</p></details>
              <details><summary>我的客户和业务数据会留下什么？<span>+</span></summary><p>每条线索都会保留来源、意向证据、触达历史、回复、风险和下一步，让每次执行都能回查，也让有效经验可以复用。</p></details>
            </div>
          </div>
        </section>

        <section class="closing-section">
          <div class="closing-film"></div>
          <div class="closing-content reveal"><span class="section-index">BYERING / START HERE</span><h2>让你的 AI 团队，<br><em>今天开始工作。</em></h2><p>从找到第一个高意向潜客开始。</p><a class="primary-button" href="?page=login">立即注册 <span>↗</span></a></div>
        </section>
      </main>

      <footer class="marketing-footer">
        <a class="brand-lockup" href="#top"><img src="./assets/byering-logo-mark.png" alt=""><span>Byering</span></a>
        <span>为线索而生，为转化而造。</span>
        <div><a href="?page=login">登录</a><a href="#faq">常见问题</a><span>© 2026 Byering</span></div>
      </footer>
    </div>
  `;
}

function mountMarketingSite({ documentRef = globalThis.document } = {}) {
  if (!documentRef?.body) return null;
  let root = documentRef.getElementById(SITE_ROOT_ID);
  if (root) return root;

  root = documentRef.createElement("div");
  root.id = SITE_ROOT_ID;
  root.innerHTML = renderSite();
  documentRef.body.appendChild(root);
  documentRef.documentElement.dataset.byeringMarketing = "1";
  documentRef.body.classList.add("byering-marketing-active");

  const nav = root.querySelector("[data-nav]");
  const updateNav = () => nav?.classList.toggle("is-scrolled", window.scrollY > 60);
  window.addEventListener("scroll", updateNav, { passive: true });
  updateNav();

  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = root.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -8%" });
  root.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

  root.querySelectorAll("[data-demo-action]").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.add("is-complete");
      button.textContent = "已准备";
      window.setTimeout(() => {
        button.classList.remove("is-complete");
        button.textContent = button.closest(".permission-card") ? "确认动作" : "查看建议";
      }, 1800);
    });
  });

  return root;
}

export { mountMarketingSite };
