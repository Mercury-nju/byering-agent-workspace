import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { HOME_SALES_FEED, KNOWLEDGE_CONNECTORS, SALES_DOMAINS, SALES_SHORTCUTS, SALES_SHORTCUT_AGENT_IDS, domainPromptItems, domainPromptTabs, domainPromptPlaceholder, domainWorkflowPrompt, employeePromptItems, domainEmployeeChoices, shortcutAgentChoices, shortcutPromptItems } from "../src/salebuddy/ui/home-sales-feed.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("homepage feed only exposes executable public-data paths", () => {
  const forbidden = /直播|粉丝|竞品|私信|全网搜索/;
  const cards = Object.values(HOME_SALES_FEED).flat();
  assert.equal(cards.length, 36);
  assert.ok(cards.every(([, title, description, prompt]) => title && description && prompt));
  assert.ok(cards.every((card) => card.slice(1).every((value) => !forbidden.test(value))));
  assert.ok(cards.some(([, title]) => title === "解析指定抖音账号"));
  assert.ok(cards.some(([, title]) => title === "分析指定作品评论"));
  assert.ok(cards.some(([, title]) => title === "批量分析指定账号"));
});

test("knowledge connectors expose local logo assets", () => {
  assert.equal(KNOWLEDGE_CONNECTORS.length, 6);
  assert.deepEqual(KNOWLEDGE_CONNECTORS.map((connector) => connector.name), [
    "飞书云文档",
    "腾讯文档",
    "语雀",
    "WPS 云文档",
    "石墨文档",
    "百度网盘"
  ]);
  assert.ok(KNOWLEDGE_CONNECTORS.every((connector) => connector.logo.includes("/assets/connectors/")));
});

test("homepage domains cover sales and professional customer workflows", () => {
  assert.deepEqual(SALES_DOMAINS.map(({ id, label }) => [id, label]), [
    ["sales", "销售"],
    ["customer-success", "客户成功"],
    ["recruiting", "招聘猎头"],
    ["education", "教育培训"],
    ["professional-services", "专业服务"],
    ["ear", "录音总结"]
  ]);
  assert.ok(SALES_DOMAINS.every(({ skills }) => skills.length === 6));
  assert.deepEqual(SALES_DOMAINS.at(-1), {
    id: "ear",
    icon: "🎙️",
    label: "录音总结",
    promptPrefix: "倾耳",
    entry: "ear",
    skills: [
      ["🎙️", "客户访谈录音", "录下客户访谈并提炼关键需求与异议"],
      ["📝", "销售复盘录音", "把销售复盘整理成可执行的改进清单"],
      ["📚", "培训会议录音", "将培训内容整理成结构化知识材料"],
      ["📊", "经营会议录音", "从会议录音中提取结论、负责人和截止时间"],
      ["🧩", "方案讲解录音", "把方案讲解转成客户可读的交付材料"],
      ["↗", "录音分享物料", "生成可分享的 PPT、HTML、PDF 或信息图"]
    ]
  });
});

test("industry prompt guidance changes tabs, user questions, outcomes, and executable prompts", () => {
  assert.deepEqual(domainPromptTabs("education"), ["推荐", "招生", "咨询", "课程内容", "复盘", "演示"]);
  assert.deepEqual(domainPromptTabs("recruiting"), ["推荐", "寻访", "沟通", "招聘内容", "复盘", "演示"]);

  const education = domainPromptItems("education", "招生");
  const recruiting = domainPromptItems("recruiting", "寻访");
  assert.equal(education.length, 6);
  assert.equal(recruiting.length, 6);
  assert.match(education[0].title, /意向学员/);
  assert.match(education[0].description, /课程咨询|试听记录/);
  assert.match(education[0].prompt, /帮我/);
  assert.match(recruiting[0].title, /候选人/);
  assert.match(recruiting[0].prompt, /帮我/);
  assert.notDeepEqual(education, recruiting);
});

test("recommended industry prompts explain the result and ask for required context", () => {
  const prompts = domainPromptItems("professional-services", "推荐");
  assert.equal(prompts.length, 6);
  assert.ok(prompts.every(({ title, description, prompt }) => title.startsWith("帮我") && description && /^帮我/.test(prompt)));
});

test("employee selection is the shared source for prompt cards", () => {
  const choices = domainEmployeeChoices(SALES_DOMAINS[0]);
  const hunter = employeePromptItems("sales", "Browser Agent");
  const content = employeePromptItems("sales", "Research Agent");
  const analysis = employeePromptItems("sales", "Search Agent");
  const education = employeePromptItems("education", "Browser Agent");

  assert.deepEqual(choices.map(({ agent }) => agent.name), ["账号发现与解析师", "线索猎人", "线索分析师", "客户研究员"]);
  assert.equal(hunter.length, 4);
  assert.ok(hunter.every(({ employeeName, prompt }) => employeeName === "线索猎人" && /^帮我/.test(prompt)));
  assert.ok(content.every(({ employeeName, prompt }) => employeeName === "客户研究员" && /^帮我/.test(prompt)));
  assert.ok(analysis.every(({ employeeName, prompt }) => employeeName === "线索分析师" && /^帮我/.test(prompt)));
  assert.match(hunter[0].title, /采集账号公开视频/);
  assert.match(content[0].title, /整理线索证据/);
  assert.match(analysis[0].title, /筛选购车意向/);
  assert.match(shortcutPromptItems("outreach", "Research Agent")[0].title, /整理线索证据/);
  assert.ok(education.every(({ prompt }) => /^帮我/.test(prompt)));
  assert.notDeepEqual(hunter, content);
  assert.notDeepEqual(content, analysis);
});

test("homepage renders the guidance line without a second taxonomy row", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /buildQuickRail\(activeDomain\(\), \{[\s\S]*?choices: activeShortcutAgents\(\)/);
  assert.match(source, /shortcutPromptItems\(activeShortcutId, activeEmployeeId\)/);
  assert.match(source, /selectEmployee\(employeeId\)/);
  assert.match(source, /if \(event\.pointerType !== "touch"\) return;/);
  assert.match(source, /围绕.*activeShortcut\(\)\.label.*销售工作中常见的问题/);
  assert.match(source, /sb-feed-section-label/);
  assert.doesNotMatch(source, /sb-feed-skill-tab/);
  assert.doesNotMatch(source, /renderTabs\(\)/);
});

test("homepage exposes only the four sales task shortcuts", () => {
  assert.deepEqual(SALES_SHORTCUTS.map(({ id, label }) => [id, label]), [
    ["find", "找潜客"],
    ["analyze", "分析线索"],
    ["outreach", "触达线索"],
    ["results", "查看结果"]
  ]);
  assert.ok(SALES_SHORTCUTS.every(({ prompt }) => prompt.length >= 24));
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /SALES_SHORTCUTS\.forEach/);
  assert.match(source, /dataset\.shortcutId/);
  assert.match(source, /onShortcutSelect\?\.\(\{ id, label, prompt \}\)/);
  assert.doesNotMatch(source, /SALES_DOMAINS\.forEach\(\(\{ id, icon, label, entry \}\)/);
});

test("sales shortcuts switch the visible team and task prompts together", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(SALES_SHORTCUT_AGENT_IDS).map(([id, agentIds]) => [id, agentIds.length])), {
    find: 4,
    analyze: 4,
    outreach: 4,
    results: 4
  });
  assert.deepEqual(shortcutAgentChoices("find").map(({ agent }) => agent.name), ["账号发现与解析师", "线索猎人", "线索分析师", "客户研究员"]);
  assert.deepEqual(shortcutAgentChoices("outreach").map(({ agent }) => agent.name), ["客户研究员", "风控专员", "线索分析师", "幕僚长"]);
  assert.equal(shortcutAgentChoices("results")[0].agent.name, "线索分析师");
  assert.equal(shortcutAgentChoices("results")[0].title, "数据分析与结果复盘");
  assert.match(shortcutAgentChoices("results")[0].task, /账号、作品、评论和意向数据/);
  const findPrompts = shortcutPromptItems("find", "Browser Agent");
  const outreachPrompts = shortcutPromptItems("outreach", "Outreach Agent");
  assert.ok(findPrompts.every(({ shortcutId, prompt }) => shortcutId === "find" && /^帮我/.test(prompt)));
  assert.ok(outreachPrompts.every(({ shortcutId, prompt }) => shortcutId === "outreach" && /^帮我/.test(prompt)));
  const forbidden = /直播|粉丝|竞品|私信|全网搜索/;
  assert.ok([...findPrompts, ...outreachPrompts].every(({ title, description, prompt }) => !forbidden.test(`${title}${description}${prompt}`)));
  assert.notDeepEqual(findPrompts, outreachPrompts);
});

test("industry switching owns the composer placeholder and Tab prompt", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /content:attr\(data-placeholder\)/);
  assert.match(source, /input\.dataset\.sbPromptPlaceholder = nextPrompt/);
  assert.match(source, /paragraph\.dataset\.placeholder = nextPrompt/);
  assert.match(source, /fillEditor\(input\.dataset\.sbPromptPlaceholder \|\| PROMPT_TAB_TEXT, editor\)/);
  assert.notEqual(domainPromptPlaceholder("sales"), domainPromptPlaceholder("education"));
});

test("industry prompts carry a complete executable workflow contract", () => {
  const requiredSections = ["帮我"];
  for (const { id } of SALES_DOMAINS) {
    const prompt = domainWorkflowPrompt(id);
    assert.ok(prompt.length >= 42 && prompt.length < 170, `${id} prompt should be concise and user-facing`);
    for (const section of requiredSections) assert.match(prompt, new RegExp(section), `${id} prompt is missing ${section}`);
  }
  assert.match(domainPromptPlaceholder("recruiting"), /为资深销售岗位筛选/);
  assert.match(domainPromptPlaceholder("customer-success"), /未来 60 天内可能流失/);
  assert.notEqual(domainPromptPlaceholder("sales"), domainPromptPlaceholder("education"));
});

test("quick employee rail keeps avatar identity separate from task labels", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /mountAgentAvatar\(iconEl, agent\.id/);
  assert.match(source, /sb-feed-quick-name/);
  assert.match(source, /sb-feed-quick-task/);
  assert.match(source, /const QUICK_AGENT_BY_TITLE/);
  assert.match(source, /sb-feed-quick-label\", \"查看更多\"/);
  assert.doesNotMatch(source, /sb-feed-quick-label\", \"全部提示词\"/);
  assert.match(source, /openAgentSquarePage\(\{/);
  assert.match(source, /mode: "agentSquare", active: true/);
});

test("sales toolbox skills expose executable input, steps, and output contracts", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/sales-skills.js"), "utf8");
  assert.match(source, /input: "抖音号、账号名称或主页链接"/);
  assert.match(source, /steps: \["识别账号引用并核验候选"/);
  assert.match(source, /output: "账号身份卡（昵称、抖音号、sec_id、来源）"/);
  assert.match(source, /buildSkillModal/);
  assert.match(source, /startSkillTask\(\{/);
  assert.match(source, /textContent = "开始执行"/);
});

test("sales skills mount outside the native virtual list so scrolling cannot leave a blank spacer", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/sales-skills.js"), "utf8");
  assert.match(source, /const cardList = grid\.closest\('\[class\*="_cardList_"\]'\)/);
  assert.match(source, /host\.insertBefore\(section, cardList \|\| grid\)/);
});

test("homepage shortcut rail uses fixed icon and label alignment slots", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /\.sb-home-hero-nav-item\{[^}]*align-items:center;[^}]*justify-content:flex-start;[^}]*height:32px;min-height:32px/);
  assert.match(source, /\.sb-home-hero-nav-icon\{[^}]*display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;flex:0 0 28px/);
  assert.match(source, /\.sb-home-hero-nav-label\{[^}]*display:inline-flex;align-items:center;height:24px;line-height:24px/);
  assert.match(source, /item\.append\(el\("span", "sb-home-hero-nav-icon", icon\), el\("span", "sb-home-hero-nav-label", label\)\)/);
});

test("sales shortcut clicks fill the existing chat composer instead of opening a route", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /fillEditor\(shortcut\.prompt\)/);
  assert.match(source, /decorateHomeHero\(\{ activeShortcutId, onShortcutSelect: selectShortcut \}\)/);
  assert.doesNotMatch(source, /openRecordMenu|onEarOpen|openEarPage/);
});

test("homepage wordmark crops transparent source padding to align with hero content", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /\.sb-home-hero-lockup\{[^}]*aspect-ratio:1911\s*\/\s*487;[^}]*overflow:hidden/);
  assert.match(source, /\.sb-home-hero-wordmark\{[^}]*width:113\.66%;[^}]*transform:translate\(-6\.44%,-21\.55%\)/);
});

test("homepage wordmark uses a slightly elevated visual anchor across responsive hero rules", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /\.sb-home-hero-brand\{[^}]*top:44%;[^}]*transform:translateY\(-50%\)/);
  assert.doesNotMatch(source, /\.sb-home-hero-brand\{[^}]*top:-5px/);
  assert.doesNotMatch(source, /\.sb-home-hero-brand\{[^}]*top:0/);
});

test("homepage feed watches the document so returning navigation can re-inject rebuilt home nodes", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /observer\.observe\(observeRoot,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*\}\)/);
  assert.match(source, /mountedWindow\.addEventListener\("popstate", ensureInjected\)/);
});

test("homepage wordmark stays visually subordinate to the hero navigation at desktop widths", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /@media\(max-width:1500px\)[\s\S]*?\.sb-home-hero-lockup\{width:clamp\(220px,17vw,270px\)\}/);
  assert.match(source, /@media\(max-width:1324px\)[\s\S]*?\.sb-home-hero-lockup\{width:clamp\(210px,23vw,250px\)\}/);
  assert.doesNotMatch(source, /@media\(max-width:1500px\)[\s\S]*?\.sb-home-hero-lockup\{width:300px\}/);
});
