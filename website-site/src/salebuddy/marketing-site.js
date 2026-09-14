const SITE_ROOT_ID = "byering-marketing-root";

const workflowCards = [
  {
    eyebrow: "01 / 找人",
    title: "发现候选账号",
    copy: "按目标人群搜索真实抖音账号，核验公开主页、内容与匹配依据。",
    image: "/assets/byering-product-agent-center.png?v=product-ui-20260907",
    alt: "Byering Agent 中心实际产品页面截图",
    tone: "blue"
  },
  {
    eyebrow: "02 / 分析",
    title: "筛选评论与意向",
    copy: "读取作品评论，保留原话、作品来源和发布时间，识别需求与购买信号。",
    image: "/assets/byering-product-realtime-work.png?v=product-ui-20260907",
    alt: "Byering 实时工作实际产品页面截图",
    tone: "mist"
  },
  {
    eyebrow: "03 / 触达",
    title: "发送或承接私信",
    copy: "选择已授权账号，配置内容与边界，发送真实私信或承接新消息，并返回逐条回执。",
    image: "/assets/byering-product-agent-detail.png?v=product-ui-20260907",
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
          <img src="/assets/byering-logo-mark.png" alt="">
          <span>Byering</span>
        </a>
        <nav class="nav-links" aria-label="主要导航">
          <a href="#workflow">怎么工作</a>
          <a href="#capabilities">能力</a>
          <a href="/blog/">博客</a>
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
            <div class="hero-kicker reveal">BYERING / DOUYIN ACQUISITION AGENT</div>
            <h1 class="reveal reveal--delay-1">持续为你工作的<br><em>抖音获客与触达 Agent</em></h1>
            <p class="hero-copy reveal reveal--delay-2">从公开账号、作品和评论中发现候选，按需求信号筛选线索，并在账号授权和平台能力允许的范围内协助发起私信。</p>
            <div class="hero-actions reveal reveal--delay-3">
              <a class="primary-button" href="?page=login">立即注册 <span>↗</span></a>
              <a class="text-button" href="#workflow">了解怎么工作 <span>↓</span></a>
            </div>
          </div>

          <div class="hero-product-frame reveal reveal--delay-3" aria-label="Byering 产品工作画面">
            <div class="window-chrome">
              <div class="window-dots"><i></i><i></i><i></i></div>
              <span class="window-title">Byering · 工作台</span>
              <span class="window-status"><b></b> 实时工作</span>
            </div>
            <div class="hero-product-content">
              <img src="/assets/byering-product-agent-center.png?v=product-ui-20260907" alt="Byering Agent 中心实际产品页面截图">
            </div>
            <div class="hero-frame-footer"><span>找人 · 分析 · 触达 · 结果</span><span>⌘ ↵ 进入工作台</span></div>
          </div>
        </section>

        <section class="section workflow-section" id="workflow">
          <div class="section-heading reveal">
            <span class="section-index">01 / 工作方式</span>
            <h2>从公开信号，到可处理的线索</h2>
            <p>在 Agent 中心选择已开放能力，提供作品、账号或目标人群。Byering 按任务范围读取抖音公开数据，返回带来源和证据的结果；需要外部动作时，先让你确认。</p>
          </div>
          <div class="workflow-grid">
            ${workflowCards.map(workflowCard).join("")}
          </div>
        </section>

        <section class="section brief-section" id="capabilities">
          <div class="brief-layout">
            <div class="brief-copy reveal">
              <span class="section-index">02 / 成果中心</span>
              <h2>每条线索，都带着依据回来</h2>
              <p>成果中心会集中归档 Agent 的交付内容。你可以回看原始评论、来源作品、发布时间、意向等级、置信度和判断理由，再决定下一步是否触达。</p>
              <div class="brief-list">
                <div><span>01</span><b>原始证据</b><small>原话、来源作品和发布时间</small></div>
                <div><span>02</span><b>意向判断</b><small>等级、置信度和判断理由</small></div>
                <div><span>03</span><b>下一步动作</b><small>选择触达对象后确认发送</small></div>
              </div>
            </div>
            <div class="brief-visual reveal reveal--delay-1">
              <div class="brief-backdrop"></div>
              <div class="brief-window">
                <div class="brief-window__bar"><span>成果中心 / 线索详情</span><span>已归档</span></div>
                <div class="brief-window__head">
                  <div class="profile-orb">线</div>
                  <div><strong>公开评论线索</strong><small>来源作品、评论原话与时间已保留</small></div>
                  <span class="intent-badge">待确认</span>
                </div>
                <div class="signal-block"><span class="signal-label">证据字段</span><p>原始评论 · 来源作品 · 发布时间 · 意向等级</p><a href="#workflow">查看来源作品 ↗</a><b>4</b></div>
                <div class="brief-columns">
                  <div><span>结果类型</span><strong>评论筛选 / 潜客挖掘</strong></div>
                  <div><span>下一步动作</span><strong>选择已授权账号后确认发送</strong></div>
                </div>
                <div class="brief-footer"><span><i></i> 来源与回执可回查</span><button type="button" data-demo-action>查看结果</button></div>
              </div>
            </div>
          </div>
        </section>

        <section class="section control-section">
          <div class="section-heading reveal">
            <span class="section-index">03 / 清楚可控</span>
            <h2>每一次动作，都有边界</h2>
            <p>当前产品把抖音数据范围、账号授权和外部发送分开处理；读取、起草、发送和回执都保留在任务里。</p>
          </div>
          <div class="control-grid">
            <article class="control-card control-card--blue reveal">
              <div class="control-art"><div class="signal-lines"><i></i><i></i><i></i><i></i></div><div class="signal-pin">公开数据 <b>范围</b></div></div>
              <h3>只读取授权范围</h3><p>按任务限定公开主页、作品、评论和互动数据，不扩大采集范围。</p>
            </article>
            <article class="control-card control-card--cream reveal reveal--delay-1">
              <div class="control-art"><div class="permission-card"><span>外部发送</span><strong>等待确认</strong><button type="button" data-demo-action>确认动作</button></div></div>
              <h3>发送前明确确认</h3><p>私信等外部动作使用已授权账号，发送前展示对象和内容，无法确认的情况转人工。</p>
            </article>
            <article class="control-card control-card--green reveal reveal--delay-2">
              <div class="control-art"><div class="memory-stack"><i>客户</i><i>回复</i><i>经验</i><i>资产</i></div></div>
              <h3>结果回到成果中心</h3><p>潜客、评论筛选、研究简报和触达记录按类型归档，支持继续处理。</p>
            </article>
          </div>
        </section>

        <section class="section team-section">
          <div class="team-layout">
            <div class="team-visual reveal">
              <div class="team-orbit team-orbit--one"></div><div class="team-orbit team-orbit--two"></div>
              <div class="chief-node"><img src="/assets/byering-logo-mark.png" alt=""><span>Byering<br><small>工作入口</small></span></div>
              <div class="role-node role-node--one"><b>Atlas · 找人</b><small>已开放</small></div>
              <div class="role-node role-node--two"><b>Claire · 分析</b><small>已开放</small></div>
              <div class="role-node role-node--three"><b>Owen · 触达</b><small>已开放</small></div>
            </div>
            <div class="team-copy reveal reveal--delay-1">
              <span class="section-index">04 / Agent 中心</span>
              <h2>你只需要从一个入口开始</h2>
              <p>从 Agent 中心选择已开放能力，或在工作台描述目标。当前页面围绕找人、分析、触达和结果查看组织；每个 Agent 的开放状态与账号授权要求都会在使用前展示。</p>
              <div class="team-proof"><strong>1 个</strong><span>工作入口</span><strong>4 类</strong><span>当前核心动作</span><strong>逐条</strong><span>结果回执</span></div>
            </div>
          </div>
        </section>

        <section class="section faq-section" id="faq">
          <div class="faq-layout">
            <div class="section-heading reveal"><span class="section-index">05 / 常见问题</span><h2>在开始之前，先了解 Byering</h2></div>
            <div class="faq-list reveal reveal--delay-1">
              <details open><summary>Byering 目前适合什么场景？<span>+</span></summary><p>当前产品优先服务抖音获客与触达：从公开账号、作品和评论中找人、分析需求信号，再通过已授权账号执行私信发送或承接。</p></details>
              <details><summary>我需要自己配置一组 Agent 吗？<span>+</span></summary><p>不需要理解底层编排。你可以从 Agent 中心选择已开放能力，也可以在工作台描述目标；部分 Agent 仍会显示“能力准备中”或“暂未开放”。</p></details>
              <details><summary>它会自动发私信吗？<span>+</span></summary><p>只有在账号已授权、任务范围允许且平台能力支持时，才会执行真实发送；发送前会展示对象和内容，无法确认或命中边界时转人工。</p></details>
              <details><summary>Byering 如何找到潜客？<span>+</span></summary><p>可以使用作品评论筛选、评论潜客挖掘或抖音全域找人能力，读取公开主页、作品和评论，并返回带来源、原话、时间和匹配依据的结果。</p></details>
              <details><summary>成果中心会保存什么？<span>+</span></summary><p>成果中心按类型归档 Agent 的业务结果，常见字段包括原始评论、来源作品、发布时间、意向等级、判断理由、触达对象和发送回执，具体以任务实际返回为准。</p></details>
            </div>
          </div>
        </section>

        <section class="closing-section">
          <div class="closing-film"></div>
          <div class="closing-content reveal"><span class="section-index">BYERING / START HERE</span><h2>从一个真实任务开始。<br><em>先找人，再触达。</em></h2><p>选择一个已开放的获客或触达能力，先看清范围，再开始工作。</p><a class="primary-button" href="?page=login">立即注册 <span>↗</span></a></div>
        </section>
      </main>

      <footer class="marketing-footer">
        <a class="brand-lockup" href="#top"><img src="/assets/byering-logo-mark.png" alt=""><span>Byering</span></a>
        <span>围绕抖音获客与触达，交付可回查的业务结果。</span>
        <div><a href="?page=login">登录</a><a href="/blog/">博客</a><a href="#faq">常见问题</a><span>© 2026 Byering</span></div>
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
