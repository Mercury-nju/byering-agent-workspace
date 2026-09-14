import { GOAL_OPTIONS } from "./goal-options.js";

const GOAL_VARIANTS = Object.freeze({
  commerce: {
    "discover-leads": ["找到商品兴趣人群", "从内容互动中发现潜在买家"],
    "high-intent": ["筛选高意向买家", "优先找出更有购买可能的人"],
    outreach: ["联系潜在买家", "完成商品咨询后的首次触达"],
    "follow-up": ["跟进商品咨询客户", "继续推进已咨询或未回复的人"],
    reactivate: ["召回老客户", "重新激活沉默客户与复购机会"],
    explore: ["先看看数字员工怎么帮你卖货", "先了解从找人到转化的完整能力"]
  },
  "live-commerce": {
    "discover-leads": ["找到直播间意向观众", "发现互动积极、值得继续了解的人"],
    "high-intent": ["识别高意向观众", "优先筛出有明确购买信号的人"],
    outreach: ["联系直播间潜客", "把直播互动延续到首次沟通"],
    "follow-up": ["跟进直播咨询客户", "持续推进已咨询或未回复的人"],
    reactivate: ["召回沉默观众", "重新激活曾经互动过的观众"],
    explore: ["先看看数字员工怎么做直播转化", "先了解从直播找人到跟进的能力"]
  },
  knowledge: {
    "discover-leads": ["找到课程咨询者", "发现对内容、课程或服务感兴趣的人"],
    "high-intent": ["识别报名意向", "优先筛出有明确学习或咨询需求的人"],
    outreach: ["联系课程咨询客户", "完成咨询用户的首次沟通"],
    "follow-up": ["跟进课程客户", "持续推进试听、咨询或报名中的人"],
    reactivate: ["召回沉默学员", "重新激活曾经咨询或学习过的人"],
    explore: ["先看看数字员工怎么做内容获客", "先了解从内容找人到课程转化的能力"]
  },
  community: {
    "discover-leads": ["找到潜在社群成员", "发现有明确话题或服务需求的人"],
    "high-intent": ["识别入群与续费意向", "优先筛出有明确参与或购买信号的人"],
    outreach: ["联系意向社群成员", "完成潜在成员的首次沟通"],
    "follow-up": ["跟进社群咨询", "持续推进入群、续费或服务咨询"],
    reactivate: ["召回沉默成员", "重新激活低活跃成员与老客户"],
    explore: ["先看看数字员工怎么做社群增长", "先了解从找人到成员运营的能力"]
  },
  automotive: {
    "discover-leads": ["找到购车与服务客户", "发现讨论车型、价格或售后需求的人"],
    "high-intent": ["识别车型购买意向", "优先筛出有明确购车或到店信号的人"],
    outreach: ["联系意向车主", "完成购车或服务客户的首次沟通"],
    "follow-up": ["跟进购车客户", "持续推进车型、报价或到店咨询"],
    reactivate: ["召回老客车主", "重新激活保养、置换与复购机会"],
    explore: ["先看看数字员工怎么做汽车获客", "先了解从找人到到店转化的能力"]
  },
  "real-estate": {
    "discover-leads": ["找到潜在购房者", "发现关注区域、房源或租赁的人"],
    "high-intent": ["识别明确置业意向", "优先筛出有预算、区域或时间信号的人"],
    outreach: ["联系意向客户", "完成购房或租赁客户的首次沟通"],
    "follow-up": ["跟进看房客户", "持续推进房源、预算或到访咨询"],
    reactivate: ["召回沉默客户", "重新激活曾经咨询或看房的人"],
    explore: ["先看看数字员工怎么做置业获客", "先了解从找人到到访转化的能力"]
  },
  aesthetics: {
    "discover-leads": ["找到项目咨询客户", "发现关注项目、效果或价格的人"],
    "high-intent": ["识别到店预约意向", "优先筛出有明确项目或预约信号的人"],
    outreach: ["联系医美咨询客户", "完成项目咨询后的首次沟通"],
    "follow-up": ["跟进预约客户", "持续推进项目、价格或到店咨询"],
    reactivate: ["召回沉默客户", "重新激活曾经咨询或到店的人"],
    explore: ["先看看数字员工怎么做医美获客", "先了解从找人到预约转化的能力"]
  },
  education: {
    "discover-leads": ["找到潜在学员", "发现关注课程、考试或学习需求的人"],
    "high-intent": ["识别报名意向", "优先筛出有明确试听或报名信号的人"],
    outreach: ["联系咨询学员", "完成课程咨询后的首次沟通"],
    "follow-up": ["跟进试听与报名客户", "持续推进试听、咨询或报名中的人"],
    reactivate: ["召回沉默学员", "重新激活曾经咨询或学习过的人"],
    explore: ["先看看数字员工怎么做招生获客", "先了解从找人到报名转化的能力"]
  },
  "professional-services": {
    "discover-leads": ["找到潜在商机", "发现表达业务问题或方案需求的人"],
    "high-intent": ["识别项目决策意向", "优先筛出有明确预算、角色或时间信号的人"],
    outreach: ["联系方案咨询客户", "完成专业服务客户的首次沟通"],
    "follow-up": ["跟进方案客户", "持续推进需求、方案或决策沟通"],
    reactivate: ["召回沉默客户", "重新激活曾经咨询或合作过的人"],
    explore: ["先看看数字员工怎么做商机获客", "先了解从找人到方案转化的能力"]
  },
  "local-business": {
    "discover-leads": ["找到附近消费人群", "发现表达本地服务或到店需求的人"],
    "high-intent": ["识别到店意向", "优先筛出有明确时间、位置或服务需求的人"],
    outreach: ["联系到店客户", "完成本地服务客户的首次沟通"],
    "follow-up": ["跟进到店咨询", "持续推进预约、到店或服务咨询"],
    reactivate: ["召回老客", "重新激活沉默会员与复购机会"],
    explore: ["先看看数字员工怎么做本地获客", "先了解从找人到到店转化的能力"]
  },
  "brand-marketing": {
    "discover-leads": ["找到高匹配受众", "发现对品牌、内容或品类感兴趣的人"],
    "high-intent": ["识别合作与购买意向", "优先筛出有明确互动或合作信号的人"],
    outreach: ["联系潜在合作方", "完成受众或合作客户的首次沟通"],
    "follow-up": ["跟进互动客户", "持续推进合作、内容或购买沟通"],
    reactivate: ["召回沉默受众", "重新激活曾经互动过的人"],
    explore: ["先看看数字员工怎么做品牌获客", "先了解从找人到合作转化的能力"]
  }
});

const AGENT_NAME_VARIANTS = Object.freeze({
  commerce: { acquisition_strategist: "商品获客策划师", lead_miner: "商品线索挖掘员", lead_analyst: "购买意向分析师", prospect_researcher: "商品客户画像研究员", sales_consultant: "成交推进顾问", risk_specialist: "触达风控专员", outreach_specialist: "首触策略师", outreach_operator: "触达执行专员" },
  "live-commerce": { acquisition_strategist: "直播获客策划师", lead_miner: "直播观众挖掘员", lead_analyst: "直播意向分析师", prospect_researcher: "观众画像研究员", sales_consultant: "直播转化顾问", risk_specialist: "直播触达风控", outreach_specialist: "直播首触策略师", outreach_operator: "直播触达专员" },
  knowledge: { acquisition_strategist: "内容获客策划师", lead_miner: "咨询线索挖掘员", lead_analyst: "咨询意向分析师", prospect_researcher: "学员画像研究员", sales_consultant: "课程转化顾问", risk_specialist: "内容触达风控", outreach_specialist: "咨询首触策略师", outreach_operator: "招生触达专员" },
  community: { acquisition_strategist: "社群增长策划师", lead_miner: "成员线索挖掘员", lead_analyst: "成员活跃分析师", prospect_researcher: "成员需求研究员", sales_consultant: "社群转化顾问", risk_specialist: "社群触达风控", outreach_specialist: "成员触达策略师", outreach_operator: "社群运营专员" },
  automotive: { acquisition_strategist: "汽车获客策划师", lead_miner: "购车线索挖掘员", lead_analyst: "车型意向分析师", prospect_researcher: "车主需求研究员", sales_consultant: "到店转化顾问", risk_specialist: "汽车触达风控", outreach_specialist: "车主触达策略师", outreach_operator: "车源触达专员" },
  "real-estate": { acquisition_strategist: "置业获客策划师", lead_miner: "购房线索挖掘员", lead_analyst: "置业意向分析师", prospect_researcher: "客户需求研究员", sales_consultant: "到访转化顾问", risk_specialist: "房产触达风控", outreach_specialist: "客户触达策略师", outreach_operator: "置业跟进专员" },
  aesthetics: { acquisition_strategist: "医美获客策划师", lead_miner: "医美咨询挖掘员", lead_analyst: "项目意向分析师", prospect_researcher: "客户需求研究员", sales_consultant: "到店转化顾问", risk_specialist: "医美触达风控", outreach_specialist: "预约触达策略师", outreach_operator: "医美运营专员" },
  education: { acquisition_strategist: "招生获客策划师", lead_miner: "学员线索挖掘员", lead_analyst: "报名意向分析师", prospect_researcher: "学员需求研究员", sales_consultant: "报名转化顾问", risk_specialist: "招生触达风控", outreach_specialist: "学员触达策略师", outreach_operator: "招生运营专员" },
  "professional-services": { acquisition_strategist: "商机获客策划师", lead_miner: "商机线索挖掘员", lead_analyst: "决策意向分析师", prospect_researcher: "客户需求研究员", sales_consultant: "方案转化顾问", risk_specialist: "商机触达风控", outreach_specialist: "客户触达策略师", outreach_operator: "商机运营专员" },
  "local-business": { acquisition_strategist: "本地获客策划师", lead_miner: "到店线索挖掘员", lead_analyst: "消费意向分析师", prospect_researcher: "顾客需求研究员", sales_consultant: "到店转化顾问", risk_specialist: "本地触达风控", outreach_specialist: "顾客触达策略师", outreach_operator: "到店运营专员" },
  "brand-marketing": { acquisition_strategist: "品牌获客策划师", lead_miner: "受众线索挖掘员", lead_analyst: "内容意向分析师", prospect_researcher: "受众需求研究员", sales_consultant: "合作转化顾问", risk_specialist: "品牌触达风控", outreach_specialist: "合作触达策略师", outreach_operator: "品牌运营专员" }
});

export function goalOptionsForIndustry(identityId = "commerce") {
  const variants = GOAL_VARIANTS[identityId] || {};
  return GOAL_OPTIONS.map((option) => {
    const [label, description] = variants[option.id] || [];
    return { ...option, label: label || option.label, description: description || option.description };
  });
}

export function agentNameForIndustry(identityId, agentId, fallbackName) {
  return AGENT_NAME_VARIANTS[identityId]?.[agentId] || fallbackName;
}

export { AGENT_NAME_VARIANTS, GOAL_VARIANTS };
