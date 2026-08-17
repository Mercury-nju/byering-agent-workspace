import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { HOME_SALES_FEED, KNOWLEDGE_CONNECTORS, SALES_DOMAINS, domainPromptItems, domainPromptTabs, domainPromptPlaceholder, domainWorkflowPrompt, employeePromptItems, domainEmployeeChoices } from "../src/salebuddy/ui/home-sales-feed.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("touch feed exposes three separate gold-service capabilities", () => {
  const cards = HOME_SALES_FEED["触达"];
  const titles = cards.map(([, title]) => title);

  assert.equal(titles.filter((title) => title === "金牌客服接管").length, 1);
  assert.equal(titles.filter((title) => title === "金牌话术教练").length, 1);
  assert.equal(titles.filter((title) => title === "客诉安抚专家").length, 1);
  assert.equal(new Set(cards.slice(-3).map((card) => card[3])).size, 3);
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
  const content = employeePromptItems("sales", "File Agent");
  const analysis = employeePromptItems("sales", "Search Agent");
  const education = employeePromptItems("education", "Browser Agent");

  assert.deepEqual(choices.map(({ agent }) => agent.name), ["线索猎人", "内容策划", "数据分析师", "销售顾问"]);
  assert.equal(hunter.length, 4);
  assert.ok(hunter.every(({ employeeName, prompt }) => employeeName === "线索猎人" && /^帮我/.test(prompt)));
  assert.ok(content.every(({ employeeName, prompt }) => employeeName === "内容策划" && /^帮我/.test(prompt)));
  assert.ok(analysis.every(({ employeeName, prompt }) => employeeName === "数据分析师" && /^帮我/.test(prompt)));
  assert.match(hunter[0].title, /找出最值得优先处理/);
  assert.match(content[0].title, /首触话术/);
  assert.match(analysis[0].title, /线索漏斗/);
  assert.match(employeePromptItems("sales", "App Agent")[0].title, /今天要联系/);
  assert.ok(education.every(({ prompt }) => /^帮我/.test(prompt)));
  assert.notDeepEqual(hunter, content);
  assert.notDeepEqual(content, analysis);
});

test("homepage renders the guidance line without a second taxonomy row", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /buildQuickRail\(activeDomain\(\), \{ selectedEmployeeId: activeEmployeeId, onEmployeeSelect: selectEmployee \}/);
  assert.match(source, /employeePromptItems\(activeDomainId, activeEmployeeId\)/);
  assert.match(source, /selectEmployee\(employeeId\)/);
  assert.match(source, /if \(event\.pointerType !== "touch"\) return;/);
  assert.match(source, /不知道怎么开始？下面是/);
  assert.match(source, /sb-feed-section-label/);
  assert.doesNotMatch(source, /sb-feed-skill-tab/);
  assert.doesNotMatch(source, /renderTabs\(\)/);
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
  assert.match(source, /input: "目标行业、地区、客户画像与排除条件"/);
  assert.match(source, /steps: \["搜索公开企业与客户线索"/);
  assert.match(source, /output: "线索清单（含来源、决策人和核验状态）"/);
  assert.match(source, /buildSkillModal/);
  assert.match(source, /startSkillTask\(\{/);
  assert.match(source, /textContent = "开始执行"/);
});

test("sales skills mount outside the native virtual list so scrolling cannot leave a blank spacer", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/sales-skills.js"), "utf8");
  assert.match(source, /const cardList = grid\.closest\('\[class\*="_cardList_"\]'\)/);
  assert.match(source, /host\.insertBefore\(section, cardList \|\| grid\)/);
});

test("homepage domain rail uses fixed icon and label alignment slots", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /\.sb-home-hero-nav-item\{[^}]*align-items:center;[^}]*justify-content:flex-start;[^}]*height:32px;min-height:32px/);
  assert.match(source, /\.sb-home-hero-nav-icon\{[^}]*display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;flex:0 0 28px/);
  assert.match(source, /\.sb-home-hero-nav-label\{[^}]*display:inline-flex;align-items:center;height:24px;line-height:24px/);
  assert.match(source, /item\.append\(el\("span", "sb-home-hero-nav-icon", icon\), el\("span", "sb-home-hero-nav-label", label\)\)/);
});

test("recording navigation opens a local choice tray before entering the workspace", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/home-sales-feed.js"), "utf8");
  assert.match(source, /\.sb-home-hero-record-menu\{[^}]*position:absolute/);
  assert.match(source, /openRecordMenu\(item\)/);
  assert.match(source, /onEarOpen\?\.\(\{ autoStart: true \}\)/);
  assert.match(source, /onEarOpen\?\.\(\{ autoStart: false \}\)/);
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
