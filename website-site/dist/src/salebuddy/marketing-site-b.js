const SITE_ROOT_ID = "byering-marketing-b-root";

const projectCards = [
  {
    name: "账号发现",
    meta: "公开主页 · 目标人群",
    image: "/assets/byering-product-agent-center.png?v=product-ui-20260907",
    tone: "blue",
    rotate: "-5deg"
  },
  {
    name: "评论分析",
    meta: "需求信号 · 意向等级",
    image: "/assets/byering-product-realtime-work.png?v=product-ui-20260907",
    tone: "pink",
    rotate: "3deg"
  },
  {
    name: "触达任务",
    meta: "已授权账号 · 发送回执",
    image: "/assets/byering-product-agent-detail.png?v=product-ui-20260907",
    tone: "lime",
    rotate: "-2deg"
  },
  {
    name: "线索结果",
    meta: "原始证据 · 来源保留",
    image: "/assets/byering-case-intent.png",
    tone: "lavender",
    rotate: "4deg"
  },
  {
    name: "工作回看",
    meta: "过程记录 · 继续处理",
    image: "/assets/byering-case-followup.png",
    tone: "peach",
    rotate: "-4deg"
  }
];

const serviceRows = [
  ["找人", "找到合适的人", "从公开账号、作品和评论里找到候选", "blue"],
  ["分析", "读懂真实信号", "把评论原话和需求上下文变成判断依据", "pink"],
  ["触达", "开启合适的对话", "在授权与确认边界内发起私信", "lime"],
  ["回执", "保留每条结果", "对象、内容、时间与状态都能回查", "mint"],
  ["协作", "让人始终掌控", "高影响动作保留确认，模糊情况转人工", "lavender"]
];

const faqItems = [
    ["Byering 现在能帮我做什么？", "从抖音公开账号、作品和评论中找人、分析需求信号，并在账号已授权且任务允许时协助发起私信。"],
    ["我需要先配置一套复杂流程吗？", "不需要。你可以从智能体中心选择能力，或直接描述目标，Byering 会按任务范围执行并返回结果。"],
  ["它会不会自动给所有人发私信？", "不会。外部发送需要账号授权和任务确认，系统会展示对象与内容；无法确认或命中边界时转人工。"],
  ["结果为什么值得相信？", "每条结果会尽量保留原始评论、来源作品、发布时间、意向等级和判断理由，方便你回看上下文。"],
  ["我可以从哪里开始？", "从一个真实的获客任务开始：给出目标人群、作品或评论范围，先看清楚线索，再决定下一步动作。"]
];

function projectCard(card, index) {
  return `
    <article class="b-project-card b-project-card--${card.tone} b-reveal" style="--card-rotate:${card.rotate}; --card-order:${index}">
      <div class="b-project-window">
        <div class="b-window-bar"><span><i></i><i></i><i></i></span><b>BYERING / 第 ${String(index + 1).padStart(2, "0")} 项</b></div>
        <img src="${card.image}" alt="Byering ${card.name}产品页面" loading="lazy">
      </div>
      <div class="b-project-meta"><strong>${card.name}</strong><span>${card.meta}</span></div>
    </article>
  `;
}

function serviceRow([title, english, copy, tone]) {
  return `
    <button class="b-service-row b-service-row--${tone} b-reveal" type="button" data-service-row>
      <span><strong>${title}</strong><small>${english}</small></span>
      <em>${copy}</em>
      <i class="b-service-icon" aria-hidden="true">↗</i>
    </button>
  `;
}

function faqItem([question, answer], index) {
  return `
    <details class="b-faq-item b-reveal" ${index === 0 ? "open" : ""}>
      <summary><span>${question}</span><b>+</b></summary>
      <p>${answer}</p>
    </details>
  `;
}

function renderSite() {
  return `
    <div class="b-site-shell">
      <header class="b-topbar" data-b-topbar>
        <a class="b-wordmark" href="#hero" aria-label="Byering B 首页"><img class="b-logo-mark" src="/assets/byering-logo-mark.png" alt="" aria-hidden="true"><span class="b-wordmark-text">BYERING<sup>®</sup></span></a>
        <div class="b-topbar-state"><i></i> 智能体团队在线</div>
        <a class="b-topbar-cta" href="/?page=login">进入工作台 <span>↗</span></a>
      </header>

      <main>
        <section class="b-hero" id="hero">
          <div class="b-landscape" aria-hidden="true"></div>
          <div class="b-hero-shade" aria-hidden="true"></div>
          <div class="b-eye-pair b-hero-eyes" data-follow-eyes aria-hidden="true"><i></i><i></i></div>
          <div class="b-availability b-floating-label">
            <i></i><span>智能体团队在线</span><strong>BYERING · 客户增长</strong>
          </div>
          <div class="b-hero-title-wrap">
            <div class="b-hero-kicker">抖音获客 / 2026</div>
            <h1>让每个线索<br><span>真正动起来</span></h1>
            <div class="b-hero-tags" aria-label="Byering 核心能力">
              <span class="b-tag b-tag--blue">找对人 <b>⌁</b></span>
              <span class="b-tag b-tag--pink">读懂信号 <b>✦</b></span>
              <span class="b-tag b-tag--lime">发起对话 <b>↗</b></span>
            </div>
          </div>
          <div class="b-hero-note"><b>— 不只是回答。</b><span>让智能体持续把线索<br>带回你的工作台</span></div>
          <button class="b-hero-pulse" type="button" data-scroll-target="#about" aria-label="向下查看">
            <span>向下探索</span><i>↓</i>
          </button>
          <div class="b-hero-result-card" data-result-card>
            <div class="b-result-thumb"><img src="/assets/byering-product-agent-detail.png?v=product-ui-20260907" alt="Byering 触达任务页面"></div>
            <div><small>任务进行中 · 触达</small><strong>3 条高意向线索</strong><span>等待确认下一步动作</span></div>
          </div>
        </section>

        <section class="b-about b-paper" id="about">
          <div class="b-section-sticker b-section-sticker--blue"><span>⌁</span> 关于</div>
          <div class="b-eye-pair" aria-hidden="true"><i></i><i></i></div>
          <div class="b-doodle b-doodle--left" aria-hidden="true"></div>
          <div class="b-doodle b-doodle--right" aria-hidden="true"></div>
          <div class="b-about-intro b-reveal">
            <div class="b-overline">01 / 核心想法</div>
            <h2>让线索<br>被人 <span>记住</span></h2>
            <p>Byering 把找人、分析、触达和结果放在一个连续的工作流里，让每一次动作都更接近真实的业务结果。</p>
            <a class="b-paper-button" href="/?page=login">开始一个任务 <span>↗</span></a>
          </div>
          <div class="b-stat-grid">
            <article class="b-stat-card b-stat-card--tilt-left b-reveal"><strong>1</strong><b>个工作入口</b><p>从智能体中心开始，不需要在工具之间来回切换。</p></article>
            <article class="b-stat-card b-stat-card--tilt-right b-reveal"><strong>3</strong><b>类核心动作</b><p>找人、分析、触达，按任务边界分步完成。</p></article>
            <article class="b-stat-card b-stat-card--tilt-left b-reveal"><strong>全天</strong><b>持续工作</b><p>任务可以持续执行，结果在回来时仍然有上下文。</p></article>
            <article class="b-stat-card b-stat-card--tilt-right b-reveal"><strong>100%</strong><b>可回查</b><p>原始证据、来源、状态和回执都留在成果中心。</p></article>
          </div>
        </section>

        <section class="b-projects b-hills" id="projects">
          <div class="b-section-sticker b-section-sticker--blue"><span>▧</span> 结果</div>
          <div class="b-eye-pair b-eye-pair--dark" aria-hidden="true"><i></i><i></i></div>
          <div class="b-project-heading b-reveal"><div class="b-overline">02 / 工作进行中</div><h2>让结果<br>讲出 <span>故事</span></h2><p>不是一张静态报表，而是一组可以继续处理的业务结果。</p></div>
          <div class="b-project-grid">${projectCards.map(projectCard).join("")}</div>
        </section>

        <section class="b-services b-paper" id="services">
          <div class="b-section-sticker b-section-sticker--blue"><span>⌁</span> 能力</div>
          <div class="b-eye-pair" aria-hidden="true"><i></i><i></i></div>
          <div class="b-services-heading b-reveal"><div class="b-overline">03 / 能做什么</div><h2>Byering<br>可以在这里<br><span>帮到你</span></h2></div>
          <div class="b-services-list">${serviceRows.map(serviceRow).join("")}</div>
        </section>

        <section class="b-reviews b-paper" id="reviews">
          <div class="b-section-sticker b-section-sticker--blue"><span>✦</span> 原则</div>
          <div class="b-eye-pair" aria-hidden="true"><i></i><i></i></div>
          <div class="b-reviews-heading b-reveal"><div class="b-overline">04 / 为什么有效</div><h2>保留<br><span>判断力</span></h2><p>自动化可以负责整理和执行，但真正影响关系的动作，始终应该清楚、可控、能回看。</p></div>
          <div class="b-review-cards">
            <article class="b-review-card b-review-card--one b-reveal"><i class="b-pin"></i><strong>“把原话留下来，<br>判断才有上下文。”</strong><p>从公开评论到意向等级，每条线索都能回到它的来源。</p><b>证据优先</b></article>
            <article class="b-review-card b-review-card--two b-reveal"><i class="b-pin"></i><strong>“外部动作，<br>确认之后再发生。”</strong><p>私信对象、内容和授权状态，在发送前都展示清楚。</p><b>边界清楚</b></article>
            <article class="b-review-card b-review-card--three b-reveal"><i class="b-pin"></i><strong>“结果回来以后，<br>工作还可以继续。”</strong><p>任务不是一次性对话，成果中心让团队能够接着处理。</p><b>结果可用</b></article>
          </div>
        </section>

        <section class="b-faqs b-paper" id="faqs">
          <div class="b-faqs-list">${faqItems.map(faqItem).join("")}</div>
          <div class="b-faqs-heading b-reveal"><div class="b-overline">05 / 开始之前</div><h2>在行动前<br>先有 <span>答案</span></h2><p>先了解能力范围，再把真实任务交给 Byering。</p></div>
          <div class="b-faq-spark b-faq-spark--one">✳</div><div class="b-faq-spark b-faq-spark--two">✦</div>
        </section>

        <section class="b-footer-cta b-hills" id="contact">
          <div class="b-footer-panel">
            <div class="b-footer-socials"><a href="/?page=login" aria-label="进入工作台">↗</a><a href="#services" aria-label="查看能力">⌁</a><a href="#faqs" aria-label="查看常见问题">?</a></div>
            <div class="b-footer-copy"><b>— 有一个真实目标？</b><strong>让它变成<br>可执行的线索。</strong></div>
            <div class="b-footer-title"><div class="b-overline">BYERING / 从这里开始</div><h2>一起把事情<br>往前推<br><span>一步。</span></h2></div>
            <a class="b-footer-button" href="/?page=login">进入工作台 <span>↗</span></a>
            <div class="b-footer-eyes b-eye-pair b-eye-pair--dark" aria-hidden="true"><i></i><i></i></div>
          </div>
          <footer class="b-footer-nav"><a class="b-wordmark" href="#hero"><img class="b-logo-mark" src="/assets/byering-logo-mark.png" alt="" aria-hidden="true"><span class="b-wordmark-text">BYERING<sup>®</sup></span></a><nav><a href="#about">关于</a><a href="#services">能力</a><a href="#projects">结果</a><a href="#reviews">原则</a><a href="#faqs">常见问题</a><a href="#contact">联系</a></nav><span>© 2026 BYERING</span></footer>
        </section>
      </main>

      <div class="b-dock" aria-label="快捷导航">
        <a href="#about" aria-label="关于 Byering"><span class="b-dock-icon b-dock-icon--yellow">▤</span></a>
        <a href="#projects" aria-label="查看结果"><span class="b-dock-icon b-dock-icon--pink">✿</span></a>
        <a href="#services" aria-label="查看能力"><span class="b-dock-icon b-dock-icon--blue">⌁</span></a>
        <a href="/?page=login" aria-label="进入工作台"><span class="b-dock-icon b-dock-icon--navy">↗</span></a>
      </div>
    </div>
  `;
}

function mountMarketingSiteB({ documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  if (!documentRef?.body) return null;
  let root = documentRef.getElementById(SITE_ROOT_ID);
  if (root) return root;

  root = documentRef.createElement("div");
  root.id = SITE_ROOT_ID;
  root.innerHTML = renderSite();
  documentRef.body.appendChild(root);
  documentRef.documentElement.dataset.byeringMarketingB = "1";
  documentRef.body.classList.add("byering-marketing-b-active");

  const topbar = root.querySelector("[data-b-topbar]");
  const updateTopbar = () => topbar?.classList.toggle("is-scrolled", windowRef.scrollY > 40);
  windowRef.addEventListener("scroll", updateTopbar, { passive: true });
  updateTopbar();

  const hero = root.querySelector("#hero");
  const followEyes = root.querySelector("[data-follow-eyes]");
  const updateFollowEyes = (event) => {
    if (!hero || !followEyes) return;
    const bounds = hero.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height * .28;
    const horizontal = Math.max(-1, Math.min(1, (event.clientX - centerX) / (bounds.width * .34)));
    const vertical = Math.max(-1, Math.min(1, (event.clientY - centerY) / (bounds.height * .34)));
    followEyes.style.setProperty("--eye-pupil-x", `${(horizontal * 5).toFixed(2)}px`);
    followEyes.style.setProperty("--eye-pupil-y", `${(vertical * 5).toFixed(2)}px`);
  };
  hero?.addEventListener("pointermove", updateFollowEyes, { passive: true });
  hero?.addEventListener("pointerleave", () => {
    followEyes?.style.setProperty("--eye-pupil-x", "0px");
    followEyes?.style.setProperty("--eye-pupil-y", "0px");
  }, { passive: true });

  root.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => root.querySelector(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });

  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = root.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  root.querySelectorAll("[data-service-row]").forEach((row) => {
    row.addEventListener("click", () => {
      root.querySelectorAll("[data-service-row].is-active").forEach((item) => item.classList.remove("is-active"));
      row.classList.add("is-active");
    });
  });

  if ("IntersectionObserver" in windowRef) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7%" });
    root.querySelectorAll(".b-reveal").forEach((element) => observer.observe(element));
  } else {
    root.querySelectorAll(".b-reveal").forEach((element) => element.classList.add("is-visible"));
  }

  return root;
}

export { mountMarketingSiteB };
