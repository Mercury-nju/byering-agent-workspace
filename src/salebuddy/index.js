/**
 * SaleBuddy 源码层入口。
 * 由 index.html 在主 bundle 之后以 type="module" 加载。
 * Phase 0 职责：初始化集成层、输出 spike 报告、暴露 window.__SALEBUDDY__。
 */
import { detectIntegrationPoints, waitForIntegrationPoints, listStoreDomains, readRouteInfo } from "./bridge/context.js";
import { SaleBuddyGatewayClient, SB_ACTIONS } from "./bridge/gateway.js";
import { ControlPlaneHttpClient, createHybridGateway } from "./bridge/control-plane-http.js";
import * as registry from "./agents/registry.js";
import { createTeamLive } from "./agents/live.js";
import { getUiRoot, mountPanel } from "./ui/mount.js";
import { mountNavFramework } from "./ui/nav-framework.js";
import { mountWordmark } from "./ui/wordmark.js";
import { mountKanbanNav } from "./ui/kanban.js";
import { mountAgentCardChat } from "./ui/agent-card-chat.js";
import { mountCloudDesktop } from "./ui/cloud-desktop.js";
import { mountToolboxFirst } from "./ui/toolbox-first.js";
import { mountSalesSkills } from "./ui/sales-skills.js";
import { mountSidebarCustomization } from "./ui/sidebar-customization.js";
import { mountTaskRunner } from "./ui/task-runner.js";
import { mountShellFullscreen } from "./ui/shell-fullscreen.js";
import { mountHomeSalesFeed } from "./ui/home-sales-feed.js";
import { mountSharePage } from "./ui/share-page.js";

/** 建立 SaleBuddy 自有 gateway 连接（新 action 命名空间），并注入 registry。 */
async function connectGateway() {
  let nativeGateway = null;
  try {
    const configuredUrl = globalThis.__SALEBUDDY_CONFIG__?.agentGatewayUrl
      || document.querySelector('meta[name="salebuddy-agent-gateway"]')?.content
      || new URLSearchParams(location.search).get("agentGateway")
      || null;
    const url = configuredUrl || await SaleBuddyGatewayClient.discoverUrl();
    if (url) {
      const client = new SaleBuddyGatewayClient({ url });
      await client.connect();
      nativeGateway = client;
      console.log("[SaleBuddy] agent gateway connected:", url);
    }
  } catch (error) {
    console.warn("[SaleBuddy] agent gateway unavailable; trying control plane", error);
  }

  let controlPlane = null;
  try {
    const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
      || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
      || "http://127.0.0.1:6681";
    const apiKey = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneApiKey
      || document.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content
      || null;
    const apiKeyHeader = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneApiKeyHeader
      || "authorization";
    const client = new ControlPlaneHttpClient({ baseUrl, apiKey, apiKeyHeader, timeoutMs: 1200 });
    await client.connect();
    controlPlane = client;
    console.log("[SaleBuddy] control plane connected:", baseUrl);
  } catch (error) {
    console.warn("[SaleBuddy] control plane unavailable; task submission is blocked", error);
  }

  const gateway = createHybridGateway({ nativeGateway, controlPlane });
  if (!gateway) return null;
  registry.attachGateway(gateway);
  return gateway;
}

async function spike() {
  const points = await waitForIntegrationPoints({ timeoutMs: 8000 });
  const report = {
    integrationPoints: points,
    storeDomains: listStoreDomains(),
    routeInfo: Object.fromEntries(
      Object.entries(readRouteInfo()).map(([key, value]) => [key, value != null])
    ),
    gatewayUrl: null,
    agentTypes: registry.listKnownAgentTypes()
  };
  try {
    report.gatewayUrl = await SaleBuddyGatewayClient.discoverUrl();
  } catch { report.gatewayUrl = null; }
  console.table(report.integrationPoints);
  console.log("[SaleBuddy] spike report", report);
  return report;
}

// Mount the visual brand before any async integration can expose recovered content.
const wordmarkReady = (() => {
  try { return mountWordmark(); }
  catch (error) {
    console.warn("[Byering] brand adapter mount failed", error);
    return null;
  }
})();

const gatewayReady = connectGateway();

// gateway 就绪后创建团队实时数据源（档案 + 状态，与办公室同源），
// 并挂载导航框架（项目组 / 通讯录 / Agent广场 / 文件中心）
const teamLiveReady = gatewayReady
  .catch(() => null)
  .then((client) => {
    const live = createTeamLive({ gateway: client, registry });
    live.start();
    return live;
  });

const navFrameworkReady = Promise.all([gatewayReady.catch(() => null), teamLiveReady])
  .then(([client, live]) => mountNavFramework({ gateway: client, teamLive: live }))
  .then((framework) => {
    console.log("[SaleBuddy] 导航框架已挂载");
    return framework;
  })
  .catch((error) => {
    console.warn("[SaleBuddy] 导航框架挂载失败", error);
    return null;
  });

// 品牌字标：把 bundle 里的 Marvis 矢量字形替换为 SaleBuddy 文字（DOM 层，不动冻结文件）
// Native settings sidebar: remove retired entries and rename the knowledge-base entry.
const sidebarCustomizationReady = Promise.resolve()
  .then(() => mountSidebarCustomization())
  .catch((error) => {
    console.warn("[SaleBuddy] 侧边栏菜单调整失败", error);
    return null;
  });

// 「自动任务 → 看板」：改名 + 接管点击 + 本地任务存储联动（gateway 断开也能看本地任务）
const kanbanReady = Promise.all([gatewayReady.catch(() => null), teamLiveReady])
  .then(([client, live]) => mountKanbanNav({ gateway: client, teamLive: live }))
  .catch((error) => {
    console.warn("[SaleBuddy] 看板挂载失败", error);
    return null;
  });

// 办公室暂时保持单一入口；项目组数据与页面能力保留，待产品重新启用分组时再挂载切换器。
const officeSwitchReady = Promise.resolve(null);

// 办公室原生 Agent 卡片增强：右下角「沟通」按钮 → 进入与该成员的聊天页
const agentCardChatReady = Promise.all([teamLiveReady, navFrameworkReady])
  .then(([live, framework]) => mountAgentCardChat({
    teamLive: live,
    onChat: (agentType) => framework?.openChatWith(agentType),
    onProgress: (agentType) => cloudDesktopReady.then((desktop) => desktop?.openProgressFor?.(agentType)),
    onCloud: (agentType) => cloudDesktopReady.then((desktop) => desktop?.openFor?.(agentType))
  }))
  .catch((error) => {
    console.warn("[SaleBuddy] 卡片沟通入口挂载失败", error);
    return null;
  });

// 云电脑工作快照：点办公室里成员的电脑或员工卡片电脑入口，当前页展示该成员的工作状态
const cloudDesktopReady = Promise.all([gatewayReady.catch(() => null), teamLiveReady])
  .then(([client, live]) => mountCloudDesktop({ teamLive: live, gateway: client }))
  .catch((error) => {
    console.warn("[SaleBuddy] 云电脑快照挂载失败", error);
    return null;
  });

// 技能广场：工具箱页签提到最前并修正列表滚动，不主动切换当前路由
const toolboxFirstReady = Promise.resolve()
  .then(() => mountToolboxFirst())
  .catch((error) => {
    console.warn("[SaleBuddy] 工具箱置顶挂载失败", error);
    return null;
  });

// 技能广场：工具箱网格前注入「销售场景」官方技能区（技能来自线上接口，运行时补充销售技能）
const salesSkillsReady = Promise.all([gatewayReady.catch(() => null), teamLiveReady])
  .then(([client, live]) => mountSalesSkills({ gateway: client, teamLive: live }))
  .catch((error) => {
    console.warn("[SaleBuddy] 销售技能区挂载失败", error);
    return null;
  });

// 任务运行：接管首页任务提交（Enter / 发送按钮），由服务端控制面驱动
const taskRunnerReady = Promise.all([gatewayReady.catch(() => null), teamLiveReady])
  .then(([client, live]) => mountTaskRunner({ teamLive: live, gateway: client }))
  .catch((error) => {
    console.warn("[SaleBuddy] 任务运行挂载失败", error);
    return null;
  });

// 应用外壳全屏化：根容器圆角归 0，铺满整个视口
const shellFullscreenReady = Promise.resolve()
  .then(() => mountShellFullscreen())
  .catch((error) => {
    console.warn("[SaleBuddy] 外壳全屏化挂载失败", error);
    return null;
  });

// 首页推荐区销售业务化：隐藏原生热词区，原位注入销售场景任务卡
const homeSalesFeedReady = gatewayReady
  .catch(() => null)
  .then((client) => mountHomeSalesFeed({ gateway: client }))
  .catch((error) => {
    console.warn("[SaleBuddy] 首页销售推荐区挂载失败", error);
    return null;
  });

const api = {
  version: "0.8.0-phase1",
  spike,
  gatewayReady,
  teamLiveReady,
  navFrameworkReady,
  wordmarkReady,
  sidebarCustomizationReady,
  kanbanReady,
  officeSwitchReady,
  agentCardChatReady,
  cloudDesktopReady,
  toolboxFirstReady,
  salesSkillsReady,
  taskRunnerReady,
  shellFullscreenReady,
  homeSalesFeedReady,
  bridge: { SaleBuddyGatewayClient, ControlPlaneHttpClient, SB_ACTIONS, detectIntegrationPoints },
  agents: registry,
  ui: { getUiRoot, mountPanel }
};

const shareToken = location.pathname.match(/^\/share\/([^/]+)$/)?.[1];
if (shareToken) mountSharePage({ token: shareToken });

window.__SALEBUDDY__ = api;

// 非阻塞地跑一次 spike，结果打到控制台，便于人工核对集成点可用性。
spike().catch((error) => console.warn("[SaleBuddy] spike failed", error));

console.log(`[SaleBuddy] source layer loaded, product: SaleBuddy, phase 1`);
