# Byering 官网内容与信息架构设计

**日期：** 2026-09-02  
**状态：** 已获初步确认，已根据规格审查修订，待最终确认
**范围：** Byering C 端官网首页的结构、内容、CTA、路由和模板适配边界

## 1. 目标与定位

官网唯一商业目标是引导用户立即注册并开始使用 Byering。官网不承担完整产品手册、企业销售材料或技术架构文档的职责。

对外品牌统一使用 **Byering**。`SaleBuddy`、`WorkBuddy` 和 `Marvis` 仅保留在内部技术上下文，不出现在官网用户可见文案中。

产品定位：

> 面向 Pro-C 与 Solo Business 的 AI 获客与触达团队。

核心表达：

> **持续找客户，联系客户，跟进客户。**

核心 CTA：`立即开始使用`  
次 CTA：`看看 Byering 如何工作`

## 2. 页面与路由

首期采用单页转化型官网，首页按“问题 → 工作方式 → 能力证明 → 信任边界 → 注册”的顺序组织。

```text
/
├── HomePage
│   ├── HeroSection
│   ├── PainSection
│   ├── WorkflowSection
│   ├── CapabilitySection
│   ├── CaseStudySection
│   ├── TeamSection
│   ├── ProactiveSection
│   ├── TrustSection
│   ├── AudienceSection
│   ├── FAQSection
│   └── FinalCTASection
├── /signup
├── /login
└── /legal
```

导航锚点：产品能力（`#capabilities`）、工作方式（`#workflow`）、使用场景（`#audiences`）、安全与权限（`#trust`）。右侧固定提供登录和立即开始使用。

`/signup` 和 `/login` 复用现有 Byering 认证流程，由现有应用路由负责，不在官网项目中重做认证逻辑。`/legal` 只作为现有法律/隐私页面的链接入口；如果当前项目没有对应页面，首期隐藏该入口，不为了官网额外创建完整法律系统。

CTA 跳转规则：

- Header、Hero、Final CTA 的“立即开始使用”统一跳转 `/signup`；
- Header 的“登录”统一跳转 `/login`；
- “看看 Byering 如何工作”滚动到 `#workflow`；
- “用我的目标开始”跳转 `/signup`；
- 所有区块内的次级按钮只能使用页面锚点或上述既有路由，不新增未定义页面。

首期不增加定价页、企业版详情页、未验证客户 Logo、未验证增长数据和自动成交承诺。

## 3. 首页文案

### 3.1 HeroSection

**Eyebrow**

> AI 获客与触达团队

**H1**

> 持续找客户，联系客户，跟进客户。

**Body**

> Byering 为 Pro-C 与 Solo Business 提供一支长期工作的 AI 业务团队。在已授权的平台能力范围内，从公开内容、评论等业务信号中发现潜客，判断购买意向，制定触达策略，并持续推进后续沟通。

**Primary CTA**

> 立即开始使用

**Secondary CTA**

> 看看 Byering 如何工作

**Supporting text**

> 不需要学习复杂的 Agent 配置，从一个目标开始。

### 3.2 PainSection

**Title**

> 你缺的不是流量，而是持续执行的获客能力

**Body**

> 用户已经在内容、评论和账号互动中表达需求。真正的问题是，没有足够的时间每天发现、筛选、研究、联系和跟进这些机会。

**Items**

- 机会太多，无法逐个判断：很难知道谁只是路过，谁已经表现出明确的购买意向。
- 线索发现与触达彼此割裂：找人、写话术、发消息、做跟进，往往分散在多个工具里。
- 沟通结束后，经验没有沉淀：客户信息、触达记录和有效话术无法持续形成业务资产。

**Closing**

> Byering 把这条链路交给一支长期工作的 AI 团队。

### 3.3 WorkflowSection

区块 ID：`workflow`

**Title**

> 从发现机会，到持续跟进

**Steps**

1. 发现潜客：在已授权的平台能力范围内，从公开内容、评论等业务信号中发现潜在客户。
2. 判断意向：清洗、去重，识别价格、适配性、购买时间等意向信号。
3. 研究客户：整理客户背景、行为证据和沟通重点。
4. 制定策略：生成合适的触达角度、话术和下一步动作。
5. 审批与触达：外部发送前进行风险检查，并在需要时请求用户确认。
6. 持续跟进：管理回复、未回复、人工接管和后续转化机会。

**Closing**

> 任务完成，不代表客户关系结束。Byering 会把每一次沟通继续带入后续经营。

### 3.4 CapabilitySection

区块 ID：`capabilities`

**Title**

> 一支团队，覆盖完整获客链路

**Items**

- 潜客发现：从内容和互动中找到值得进一步了解的人。
- 高意向筛选：根据真实信号判断客户优先级。
- 客户研究：输出有来源、有依据的客户简报。
- 触达策略：为不同客户制定合适的沟通方式。
- 回复与跟进：持续推进已回复、未回复和沉默客户。
- 客户资产：沉淀客户身份、意向、沟通记录和转化状态。

### 3.5 CaseStudySection

该区块是静态流程展示，不依赖实时后端数据或动态产品演示。

**Title**

> 你只需要说出目标

**User input**

> 帮我找到最近 7 天对这款商品表现出明确购买意向的人，筛选高意向用户并完成首次触达。

**Execution steps**

- 理解目标人群与时间范围
- 搜索相关公开内容和互动
- 找出价格、求链接、适配性等购买信号
- 清洗重复线索并进行意向评分
- 研究重点客户的公开信息
- 生成个性化触达草稿
- 完成风险检查并请求审批
- 执行触达，接收回复并安排跟进

**Closing**

> 你得到的不是一份名单，而是一组已经可以继续推进的业务机会。

**CTA**

> 用我的目标开始

### 3.6 TeamSection

**Title**

> 一个 Byering，管理一支专业团队

**Body**

> 你不需要自己判断该找哪个 Agent。Byering 会根据目标自动组织合适的专业员工，分配任务、协调协作，并向你汇总结果。

**Roles**

- 获客策略师：定义目标人群与获客策略。
- 潜客挖掘员：发现账号、作品和互动线索。
- 线索分析师：清洗、去重并判断意向。
- 客户研究员：整理客户背景和行为证据。
- 触达策略师：制定沟通角度和跟进计划。
- 风控专员：检查授权、频控和触达风险。
- 外联专员：执行已批准的触达动作。
- 触达运营专员：管理回复、重试和人工接管。

**Closing**

> 复杂的组织工作交给 Byering，重要的经营判断留给你。

### 3.7 ProactiveSection

**Title**

> 不等你想好下一步，Byering 会主动告诉你

**Body**

> 每天开始工作时，Byering 会主动汇报新的高意向用户、值得再次跟进的客户、待处理回复和异常情况，并给出可以直接执行的下一步动作。

**Suggested actions**

- 先联系今天新增的高意向用户
- 继续研究竞品评论区
- 跟进已经咨询但还没有回复的人
- 跟进长期未处理的客户
- 查看本周最值得推进的客户机会

### 3.8 TrustSection

区块 ID：`trust`

**Title**

> 能真正执行，也知道什么时候该停下来

**Body**

> Byering 不用模糊授权代替人工判断。每次执行都会结合数据范围、账号授权、操作权限、预算和审批策略进行检查。

**Items**

- 只使用已授权数据和明确公开来源。
- 高风险或超出既定策略的外部发送必须人工确认。
- 保留来源、证据和执行记录。
- 遇到风险或阻塞时主动上报。

**Closing**

> 自动化的价值，不是替你做所有决定，而是让每一个决定都更有依据。

### 3.9 AudienceSection

区块 ID：`audiences`

**Title**

> 为正在经营的人工作

**Items**

- 内容创作者：从内容互动中发现真正感兴趣的人。
- 电商卖家：找到潜在买家，持续推进商品咨询。
- 主播与直播团队：围绕直播业务经营客户机会。
- 专业顾问：发现有明确需求和决策意向的客户。
- 本地商家：推进预约、到店和复购机会。
- 一人业务团队：用一支 AI 团队承担重复的获客与跟进工作。

### 3.10 FAQSection

**Q：Byering 是聊天机器人吗？**  
**A：** 不只是。Byering 会理解你的业务目标，组织专业 Agent，执行找人、分析、研究、触达和跟进任务。

**Q：我需要自己配置多个 Agent 吗？**  
**A：** 不需要。默认情况下，你只需要和 Byering 沟通，它会自动组织合适的员工。

**Q：Byering 可以自动发消息吗？**  
**A：** 系统会根据账号权限、平台能力和风险策略决定执行方式。高风险、未授权或超出策略的外部触达必须经过人工确认。

**Q：Byering 能做哪些行业？**  
**A：** 首期重点服务电商、直播、内容创作、专业服务、本地业务等 Pro-C 与 Solo Business 场景。具体可执行能力以当前账号授权和平台开放能力为准。

**Q：Byering 会记住我的业务规则吗？**  
**A：** 会。你可以让规则只对当前任务生效，也可以沉淀为项目、Agent 或整个组织的长期规则。

**Q：我可以查看 Agent 做了什么吗？**  
**A：** 可以。你可以查看任务进度、参与员工、来源证据、执行记录、文件产出和下一步计划。

### 3.11 FinalCTASection

**Title**

> 让你的下一个客户机会，有人持续跟进

**Body**

> 从一个目标开始，建立属于你的 AI 获客与触达团队。

**CTA**

> 立即开始使用

**Supporting text**

> 注册后即可开始配置你的业务目标。

## 4. 模板适配边界

模板中的视觉区块只负责承载内容，不改变产品定位和文案逻辑。当前模板尚未提供，因此先定义内容槽位；拿到模板后按以下规则映射：

- Hero → HeroSection
- Feature grid → CapabilitySection
- Timeline / process → WorkflowSection
- Product demo / case → CaseStudySection
- Team / avatars → TeamSection
- Trust / security → TrustSection
- Testimonials / logos → 暂不填充虚构内容，可隐藏或替换为 AudienceSection
- Pricing → 首期隐藏
- Final banner → FinalCTASection

如果模板缺少某个区块，优先将其内容合并到最接近的现有区块；无法承载时隐藏该可选区块，不强行增加装饰性模块。只有 Hero、Workflow、Capability、CaseStudy、Trust 和 FinalCTA 属于必需内容槽位，其他区块可根据模板结构折叠或合并。

不使用未经验证的结果数字、客户评价、客户品牌和转化承诺。官网只宣传当前已被产品和连接器验证的能力；尚未验证的直播互动读取、公开回复或其他平台动作，只能作为业务场景描述，不能写成已经可执行的功能承诺。所有注册按钮统一指向 `/signup`，登录按钮统一指向 `/login`。

## 5. 内容组件边界

内容应与模板布局分离，建议使用以下源码结构：

```text
content/home.js
components/HeroSection.js
components/PainSection.js
components/WorkflowSection.js
components/CapabilitySection.js
components/CaseStudySection.js
components/TeamSection.js
components/ProactiveSection.js
components/TrustSection.js
components/AudienceSection.js
components/FAQSection.js
components/FinalCTASection.js
```

## 6. 验收边界

- 首页所有主 CTA 均可到达现有 `/signup`；登录入口到达现有 `/login`；
- 页面内容不出现 SaleBuddy、WorkBuddy 或 Marvis 等历史品牌；
- 页面不出现未经验证的客户、数据、收益和自动成交承诺；
- 外部触达文案统一表达为“按权限、平台能力和风险策略执行，必要时人工确认”；
- 模板缺少可选区块时可以合并或隐藏，不因此改变核心叙事顺序；
- 不修改现有 AI 办公室逻辑、Agent 执行协议、抖音连接器或认证实现。

本设计只定义官网首页内容与信息架构，不改变现有 AI 办公室逻辑、Agent 执行协议、抖音连接器或登录实现。
