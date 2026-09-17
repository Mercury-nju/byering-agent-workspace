/**
 * SaleBuddy 源码层入口。
 * 由 index.html 在主 bundle 之后以 type="module" 加载。
 * Phase 0 职责：初始化集成层、输出 spike 报告、暴露 window.__SALEBUDDY__。
 */
import { detectIntegrationPoints, waitForIntegrationPoints, listStoreDomains, readRouteInfo } from "./bridge/context.js";
import { SaleBuddyGatewayClient, SB_ACTIONS } from "./bridge/gateway.js";
import { ControlPlaneHttpClient, createHybridGateway } from "./bridge/control-plane-http.js";
import { isStyleMockPreview, previewMockGatewayUrl } from "./bridge/preview-mode.js";
import * as registry from "./agents/registry.js";
import { createTeamLive } from "./agents/live.js";
import { createDouyinInboxActivityMonitor } from "./agents/douyin-inbox-activity-monitor.js";
import { createDouyinCloudActivityMonitor } from "./agents/douyin-cloud-activity-monitor.js";
import { getUiRoot, mountPanel } from "./ui/mount.js";
import { ACCOUNT_EVENT, mountNavFramework } from "./ui/nav-framework.js?v=20260917-results-mock-preview-fix-1";
import { mountWordmark, releaseWordmarkEarlyGuard } from "./ui/wordmark.js";
import { mountAgentCardChat } from "./ui/agent-card-chat.js";
import { mountCloudDesktop } from "./ui/cloud-desktop.js";
import { mountToolboxFirst } from "./ui/toolbox-first.js";
import { mountSalesSkills } from "./ui/sales-skills.js";
import { mountSidebarCustomization } from "./ui/sidebar-customization.js";
import { mountShellFullscreen } from "./ui/shell-fullscreen.js";
import { mountAiShubanTheme } from "./ui/ai-shuban-theme.js";
import { mountSharePage } from "./ui/share-page.js";
import { mountOfficeAgentRuntime } from "./ui/office-agent-runtime.js";
import { buildAccountAnalysisResumeFlow } from "./agents/account-analysis-contract.js";
import { saveCanonicalProspectRecords, saveCanonicalResultRuns } from "./bridge/results-client.js";
import { prospectStore } from "./ui/prospect-store.js";
import { PRODUCT_VISIBILITY } from "./ui/product-visibility.js";
import { createAuthFeature, renderLoginPage } from "./auth/index.js";
import { mountMarketingSite } from "./marketing-site.js";
import {
  onboardingRoute,
  renderOnboardingPage,
  routeAfterOnboarding,
  routeForRetiredPage,
  markOnboardingCompleted
} from "./onboarding/index.js";

const initialPage = new URLSearchParams(location.search).get("page");
const retiredPageRoute = routeForRetiredPage(initialPage);
if (retiredPageRoute) globalThis.location?.replace?.(retiredPageRoute);
const deferNativeRootReveal = ["agent-square", "agents"].includes(initialPage);
const isMarketingLanding = (initialPage === "marketing" || initialPage === "landing")
  && !location.hash
  && !/^\/share\//.test(location.pathname);

let activeGateway = null;
let gatewayConnectionInFlight = null;
let activityMonitorsStarted = false;

// Customer lifecycle data is server-owned; local storage only keeps an offline mirror.
prospectStore.setRemoteSync((records, runs) => Promise.all([
  saveCanonicalProspectRecords(records),
  saveCanonicalResultRuns(runs)
]));

/** Establish the SaleBuddy gateway and inject it into the local registry. */
async function connectGateway() {
  if (activeGateway) return activeGateway;
  if (gatewayConnectionInFlight) return gatewayConnectionInFlight;
  gatewayConnectionInFlight = (async () => {
    const mockPreview = isStyleMockPreview();
    let nativeGateway = null;
    try {
      const configuredUrl = globalThis.__SALEBUDDY_CONFIG__?.agentGatewayUrl
        || document.querySelector('meta[name="salebuddy-agent-gateway"]')?.content
        || new URLSearchParams(location.search).get("agentGateway")
        || null;
      const url = configuredUrl || (mockPreview
        ? previewMockGatewayUrl()
        : await SaleBuddyGatewayClient.discoverUrl());
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
    if (!mockPreview) {
      try {
        const baseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
          || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
          || "http://127.0.0.1:6681";
        const apiKey = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneApiKey
          || document.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content
          || null;
        const apiKeyHeader = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneApiKeyHeader
          || "authorization";
        const client = new ControlPlaneHttpClient({ baseUrl, apiKey, apiKeyHeader });
        await client.connect();
        controlPlane = client;
        console.log("[SaleBuddy] control plane connected:", baseUrl);
      } catch (error) {
        console.warn("[SaleBuddy] control plane unavailable; task submission is blocked", error);
      }
    } else {
      console.log("[SaleBuddy] style preview uses mock gateway only");
    }

    const gateway = createHybridGateway({ nativeGateway, controlPlane });
    if (!gateway) return null;
    activeGateway = gateway;
    registry.attachGateway(gateway);
    if (!activityMonitorsStarted && !mockPreview) {
      activityMonitorsStarted = true;
      // Background monitors write to work history. Direct messages stay reserved
      // for an actual user/Agent conversation.
      const inboxMonitorBaseUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
        || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
        || "http://127.0.0.1:6681";
      createDouyinInboxActivityMonitor({ baseUrl: inboxMonitorBaseUrl }).start();
      createDouyinCloudActivityMonitor({ baseUrl: inboxMonitorBaseUrl }).start();
    }
    return gateway;
  })();
  try {
    return await gatewayConnectionInFlight;
  } finally {
    gatewayConnectionInFlight = null;
  }
}

function waitForGatewayRetry(delayMs) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

async function applyRecoveredGateway(gateway) {
  const [live, framework] = await Promise.all([teamLiveReady, navFrameworkReady]);
  live?.setGateway?.(gateway);
  framework?.updateContext?.({ gateway, teamLive: live });
  const runtime = await officeAgentRuntimeReady;
  runtime?.setGateway?.(gateway);
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
  try { return mountWordmark({ deferEarlyGuard: deferNativeRootReveal }); }
  catch (error) {
    console.warn("[Byering] brand adapter mount failed", error);
    return null;
  }
})();

// Apply the AI数班 visual language without touching the recovered renderer.
const visualThemeReady = Promise.resolve()
  .then(() => mountAiShubanTheme())
  .catch((error) => {
    console.warn("[SaleBuddy] AI数班视觉主题挂载失败", error);
    return null;
  });

const gatewayReady = connectGateway();

// gateway 就绪后创建团队实时数据源（档案 + 状态，与办公室同源），
// 并挂载导航框架（项目组 / 通讯录 / Agent广场 / 成果中心）
const teamLiveReady = gatewayReady
  .catch(() => null)
  .then((client) => {
    const live = createTeamLive({ gateway: client, registry });
    live.start();
    return live;
  });

const navFrameworkReady = Promise.resolve()
  .then(() => mountNavFramework({ gateway: null, teamLive: null }))
  .then((framework) => Promise.all([gatewayReady.catch(() => null), teamLiveReady])
    .then(([client, live]) => {
      framework?.updateContext?.({ gateway: client, teamLive: live });
      return framework;
    }))
  .then((framework) => {
    console.log("[SaleBuddy] 导航框架已挂载");
    return framework;
  })
  .catch((error) => {
    console.warn("[SaleBuddy] 导航框架挂载失败", error);
    return null;
  });

// Recover a late-starting or briefly restarted control plane without requiring
// a full page reload. The promise intentionally remains pending while the tab
// is open and no gateway is available.
const gatewayRecoveryReady = gatewayReady.then(async (client) => {
  if (client) return client;
  let attempt = 0;
  while (!activeGateway) {
    await waitForGatewayRetry(Math.min(15000, 1000 * (2 ** Math.min(attempt, 3))));
    attempt += 1;
    const recovered = await connectGateway();
    if (recovered) return applyRecoveredGateway(recovered);
  }
  return activeGateway;
});

// Logout is also the reset point for the local demo flow. Clear any legacy
// setup state so the next visit starts from the authenticated workspace.
const DEMO_SESSION_KEYS = Object.freeze([
  "byering-onboarding-auth",
  "byering-onboarding-first-agent"
]);

function resetDemoSession() {
  for (const key of DEMO_SESSION_KEYS) {
    try { globalThis.sessionStorage?.removeItem?.(key); } catch { /* storage may be unavailable */ }
  }
}

document.addEventListener(ACCOUNT_EVENT, (event) => {
  if (event.detail?.action !== "logout") return;
  resetDemoSession();
  globalThis.setTimeout(() => globalThis.location?.assign?.("?page=login"), 0);
});

function activateOfficeEntry() {
  if (!PRODUCT_VISIBILITY.office) return Promise.resolve(null);
  if (new URLSearchParams(location.search).get("page") !== "office") return Promise.resolve(null);
  const findOffice = () => [...document.querySelectorAll('[dt-eid="sidebar_tab"], [data-dt-eid="sidebar_tab"], [class*="_menuItem_"]')]
    .find((node) => (node.textContent || "").replace(/\s+/g, "").trim() === "办公室");
  return new Promise((resolve) => {
    let attempts = 0;
    const attempt = () => {
      const office = findOffice();
      if (office) {
        office.click();
        resolve(office);
        return;
      }
      attempts += 1;
      if (attempts >= 40) {
        resolve(null);
        return;
      }
      globalThis.setTimeout(attempt, 100);
    };
    attempt();
  });
}

const officeEntryReady = navFrameworkReady.then(() => activateOfficeEntry());

// The legacy chief drawer still carries the retired internal role model.
// Keep it disabled in Office; the selected-Agent workspace below owns the rail.
const chiefOfficeEntryReady = Promise.resolve(null);

async function primeOnboardingWork() {
  // A stored onboarding match describes intent only. It is not evidence that
  // a real task is running, so it must never seed the live work registry.
  return null;
}

const officeWorkReady = officeEntryReady
  .then(() => primeOnboardingWork())
  .catch((error) => {
    console.warn("[SaleBuddy] 登录任务工作状态初始化失败", error);
    return null;
  });

// The office already owns the work-state surface. Keep the promise for API
// compatibility, but do not mount a second floating task board on top of it.
const officeTaskBoardReady = Promise.resolve(null);

function activateContactsEntry() {
  if (new URLSearchParams(location.search).get("page") !== "contacts") return null;
  return navFrameworkReady.then((framework) => {
    framework?.openContacts?.();
    return framework;
  });
}

const contactsEntryReady = activateContactsEntry();

function activateProspectCenterEntry() {
  const page = new URLSearchParams(location.search).get("page");
  if (page !== "prospects" && page !== "discovered-people") return null;
  return navFrameworkReady.then((framework) => {
    const open = () => {
      if (page === "discovered-people") framework?.openDiscoveredPeople?.();
      else framework?.openProspects?.();
    };
    if (isStyleMockPreview()) {
      let attempts = 0;
      const restorePreviewRoute = () => {
        attempts += 1;
        if (!document.querySelector("#route_inner_content_id")) {
          if (attempts < 12) globalThis.setTimeout(restorePreviewRoute, 120);
          return;
        }
        open();
        if (attempts < 4) {
          globalThis.setTimeout(() => {
            if (!document.querySelector(".sb-prospect-page")) restorePreviewRoute();
          }, 240);
        }
      };
      globalThis.requestAnimationFrame?.(restorePreviewRoute) || globalThis.setTimeout(restorePreviewRoute, 0);
    } else {
      open();
    }
    return framework;
  });
}

const prospectCenterEntryReady = activateProspectCenterEntry();

// The recovered host bundle may replace its content root after the first route
// restore in local style preview. Re-open this custom page once the nav owner
// is settled so the visual mock always reaches the prospect center.
if (initialPage === "prospects" && isStyleMockPreview()) {
  void navFrameworkReady.then((framework) => {
    const reopen = () => {
      if (!document.querySelector(".sb-prospect-page")) framework?.openProspects?.();
    };
    globalThis.setTimeout(reopen, 900);
    globalThis.setTimeout(reopen, 1800);
    globalThis.setTimeout(reopen, 3000);
  });
}

function activateFilesEntry() {
  if (new URLSearchParams(location.search).get("page") !== "files") return null;
  return navFrameworkReady.then((framework) => {
    framework?.openFiles?.();
    return framework;
  });
}

const filesEntryReady = activateFilesEntry();

function activateRealtimeWorkEntry() {
  const page = new URLSearchParams(location.search).get("page");
  if (page !== "realtime-work" && page !== "realtime") return null;
  return navFrameworkReady.then((framework) => {
    framework?.openRealtimeWork?.();
    return framework;
  });
}

const realtimeWorkEntryReady = activateRealtimeWorkEntry();

function activateAgentSquareEntry() {
  const params = new URLSearchParams(location.search);
  const page = params.get("page");
  const isAuthHash = /^#\/?auth(?:\/login)?$/.test(location.hash);
  const isOnboardingHash = /^#\/?onboarding(?:\/(?:identity|goal|team|auth))?$/.test(location.hash);
  const isSharePage = /^\/share\//.test(location.pathname);
  // Agent Square is the default authenticated workspace. Explicit routes keep
  // their existing behavior, while auth, legacy setup, and share pages stay isolated.
  if (isMarketingLanding
    || (page !== null && page !== "agent-square" && page !== "agents")
    || page === "login"
    || page === "onboarding"
    || isAuthHash
  || isOnboardingHash
  || isSharePage) return null;
  return navFrameworkReady.then((framework) => {
    const initialAgentId = params.get("agent");
    if (initialAgentId) framework?.openAgentSquare?.({ initialAgentId });
    else framework?.openAgentSquare?.();
    return framework;
  });
}

const agentSquareEntryReady = activateAgentSquareEntry();
if (deferNativeRootReveal) {
  agentSquareEntryReady.finally(() => {
    releaseWordmarkEarlyGuard();
  });
}

function onboardingStorageValue(key) {
  try { return globalThis.sessionStorage?.getItem?.(key) || ""; }
  catch { return ""; }
}

function setOnboardingStorageValue(key, value) {
  try { globalThis.sessionStorage?.setItem?.(key, value); }
  catch { /* storage may be unavailable */ }
}

function activateOnboardingEntry() {
  const page = new URLSearchParams(location.search).get("page");
  const isOnboardingHash = /^#\/?onboarding(?:\/(?:identity|goal))?$/.test(location.hash);
  if (page !== "onboarding" && !isOnboardingHash) return Promise.resolve(null);

  document.documentElement.dataset.byeringOnboarding = "1";
  const nativeRoot = document.getElementById("root");
  nativeRoot?.setAttribute("hidden", "");
  const root = document.createElement("div");
  root.id = "salebuddy-onboarding-root";
  document.body.appendChild(root);

  let selectedAgentId = onboardingStorageValue("byering-onboarding-first-agent") || undefined;
  let cleanup = null;

  function render() {
    cleanup?.();
    cleanup = renderOnboardingPage({
      root,
      selectedAgentId,
      onNext(event) {
        selectedAgentId = event?.agentId || null;
        if (selectedAgentId) setOnboardingStorageValue("byering-onboarding-first-agent", selectedAgentId);
        markOnboardingCompleted();
        globalThis.location?.assign?.(routeAfterOnboarding(selectedAgentId));
      }
    });
  }

  render();
  return Promise.resolve({ root, destroy: () => { cleanup?.(); root.remove(); } });
}

const onboardingEntryReady = activateOnboardingEntry();

function activateConversationStrategyEntry() {
  const page = new URLSearchParams(location.search).get("page");
  if (page !== "conversation-strategy") return null;
  return navFrameworkReady.then((framework) => {
    framework?.openConversationStrategy?.();
    return framework;
  });
}

const conversationStrategyEntryReady = activateConversationStrategyEntry();

function activateMemoryEntry() {
  const page = new URLSearchParams(location.search).get("page");
  if (page !== "memory") return null;
  return navFrameworkReady.then((framework) => {
    framework?.openMemory?.();
    return framework;
  });
}

const memoryEntryReady = activateMemoryEntry();

// 品牌字标：把 bundle 里的 Marvis 矢量字形替换为 SaleBuddy 文字（DOM 层，不动冻结文件）
// Native settings sidebar: remove retired entries and rename the knowledge-base entry.
const sidebarCustomizationReady = Promise.resolve()
  .then(() => mountSidebarCustomization())
  .catch((error) => {
    console.warn("[SaleBuddy] 侧边栏菜单调整失败", error);
    return null;
  });

// 办公室暂时保持单一入口；项目组数据与页面能力保留，待产品重新启用分组时再挂载切换器。
const officeSwitchReady = Promise.resolve(null);

// Bind the recovered office scene to the current hired/runtime Agents. The
// native role names are only physical animation slots; current Agent IDs own
// the visible identity, task state, and click destination.
const officeAgentRuntimeReady = Promise.all([teamLiveReady, navFrameworkReady])
  .then(([live, framework]) => {
    const runtime = mountOfficeAgentRuntime({
      teamLive: live,
      onConfigure: (agentId) => framework?.openAgentSquare?.({ initialAgentId: agentId }),
      onOpenResult: (run) => framework?.openProspects?.({ initialResult: { ownerKey: run.ownerKey, agentId: run.agentId, taskId: run.taskId, accountId: run.accountId || "" } }),
      onAnalyze: (run) => framework?.openAgentSquare?.({ initialAgentId: "mkt-intent-analyst", resumeFlow: buildAccountAnalysisResumeFlow({ run }) }),
      onOpenWork: (agentId, work) => framework?.openRealtimeWork?.({ selectedAgentId: agentId, taskId: work?.metadata?.taskId || work?.taskId, accountId: work?.metadata?.accountId || work?.accountId })
    });
    void gatewayReady.then(gateway => runtime.setGateway(gateway)).catch(() => {});
    return runtime;
  })
  .catch((error) => {
    console.warn("[SaleBuddy] 办公室 Agent 实时映射挂载失败", error);
    return null;
  });

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

// 应用外壳全屏化：根容器圆角归 0，铺满整个视口
const shellFullscreenReady = Promise.resolve()
  .then(() => mountShellFullscreen())
  .catch((error) => {
    console.warn("[SaleBuddy] 外壳全屏化挂载失败", error);
    return null;
  });

const api = {
  version: "0.8.0-phase1",
  spike,
  gatewayReady,
  gatewayRecoveryReady,
  teamLiveReady,
  navFrameworkReady,
  officeEntryReady,
  chiefOfficeEntryReady,
  officeWorkReady,
  officeTaskBoardReady,
  contactsEntryReady,
  prospectCenterEntryReady,
  filesEntryReady,
  realtimeWorkEntryReady,
  agentSquareEntryReady,
  onboardingEntryReady,
  conversationStrategyEntryReady,
  memoryEntryReady,
  wordmarkReady,
  visualThemeReady,
  sidebarCustomizationReady,
  officeSwitchReady,
  officeAgentRuntimeReady,
  agentCardChatReady,
  cloudDesktopReady,
  toolboxFirstReady,
  salesSkillsReady,
  shellFullscreenReady,
  bridge: { SaleBuddyGatewayClient, ControlPlaneHttpClient, SB_ACTIONS, detectIntegrationPoints },
  auth: { createAuthFeature, renderLoginPage },
  agents: registry,
  ui: { getUiRoot, mountPanel }
};

const marketingSiteReady = isMarketingLanding
  ? Promise.resolve(mountMarketingSite())
  : Promise.resolve(null);
api.marketingSiteReady = marketingSiteReady;

const shareToken = location.pathname.match(/^\/share\/([^/]+)$/)?.[1];
if (shareToken) mountSharePage({ token: shareToken });

window.__SALEBUDDY__ = api;

if (initialPage === "office" && !PRODUCT_VISIBILITY.office) {
  globalThis.location?.replace?.("?page=agent-square");
}

const isLoginPage = new URLSearchParams(location.search).get("page") === "login"
  || /^#\/?auth(?:\/login)?$/.test(location.hash);
if (isLoginPage) {
  document.documentElement.dataset.byeringAuth = "1";
  const authFeature = createAuthFeature({ render: renderLoginPage });
  authFeature.mount();
  window.__SALEBUDDY__.auth.feature = authFeature;
}

// 非阻塞地跑一次 spike，结果打到控制台，便于人工核对集成点可用性。
spike().catch((error) => console.warn("[SaleBuddy] spike failed", error));

console.log(`[SaleBuddy] source layer loaded, product: SaleBuddy, phase 1`);
