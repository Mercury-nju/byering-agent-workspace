/**
 * ui/agent-drawer.js
 * Shared employee detail drawer: live work status first, outputs and metrics second.
 */
import { TEAM_STATE_LABELS, TEAM_STATES } from "../agents/status.js";
import { AGENT_TYPE_DEFAULTS, BYERING_DEFAULT_AGENT_TYPES, createDefaultProfile } from "../agents/model.js";
import { getWorkForProject, listWorks, subscribeWork } from "../agents/work-live.js";
import { listTasks, subscribe as subscribeTasks, updateTask } from "../agents/task-store.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { displayAgentName, displayAgentTitle, localizeAgentText } from "../brand.js";
import { CHIEF_AGENT_TYPE, chiefDmPayload, normalizeChiefMessages } from "../agents/chief-conversation.js";
import { normalizePrivateConversationMessages, specialistConversationMetadata } from "../agents/direct-message-contract.js";

const CLOUD_DISCOVERY_IMAGE = new URL("../../../assets/ecommerce-discovery-live.png", import.meta.url).href;
const CLOUD_LIVE_DISCOVERY_IMAGE = new URL("../../../assets/douyin-discovery-live.png", import.meta.url).href;
const CLOUD_INTENT_IMAGE = new URL("../../../assets/ecommerce-intent-analysis.png", import.meta.url).href;
const CLOUD_OUTREACH_IMAGE = new URL("../../../assets/ecommerce-seller-ops.png", import.meta.url).href;

export const OFFICE_RIGHT_PANEL_SELECTOR = '.office-dashboard [class*="_rightPanel_"]';

export function findOfficeRightPanel(ownerDocument = document) {
  const candidates = ownerDocument?.querySelectorAll
    ? [...ownerDocument.querySelectorAll(OFFICE_RIGHT_PANEL_SELECTOR)]
    : [];
  // React can leave the previous office tree mounted during a route swap.
  // Prefer the candidate whose geometry is a real, narrow right rail.
  const usable = candidates.find((candidate) => isUsableOfficeRightPanel(candidate));
  if (usable) return usable;
  return candidates.find((candidate) => Number(candidate.getBoundingClientRect?.().width) > 0)
    || candidates[0]
    || ownerDocument?.querySelector?.(OFFICE_RIGHT_PANEL_SELECTOR)
    || null;
}

/**
 * Only mount an inline drawer into a genuinely narrow office rail. A broad
 * match is usually the office content row itself and would hide the scene.
 */
export function isUsableOfficeRightPanel(host) {
  if (!host) return false;
  const hostRect = host.getBoundingClientRect?.();
  const officeRect = host.closest?.(".office-dashboard")?.getBoundingClientRect?.();
  const hostWidth = Number(hostRect?.width);
  const officeWidth = Number(officeRect?.width);
  // During the native page's first paint the node can exist without a
  // measurable layout. Wait for the next retry instead of risking a full-row
  // inline mount while its dimensions are unknown.
  if (!Number.isFinite(hostWidth) || !Number.isFinite(officeWidth) || officeWidth <= 0) return false;
  return hostWidth > 0 && hostWidth <= officeWidth * 0.68;
}

const CSS = `
.sb-drawer-mask{display:none}
.sb-drawer{position:fixed;top:0;right:0;bottom:0;width:min(42vw,560px);min-width:390px;background:#fff;z-index:9101;box-shadow:-16px 0 36px rgba(15,15,15,.12);border:1px solid rgba(15,15,15,.08);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-progress-host{position:relative!important;overflow:hidden!important;border-radius:20px!important}
/* The native office panel renders a placeholder stats card beside the live drawer. */
.sb-progress-host > [class*="_container_"]{display:none!important}
.sb-drawer.sb-drawer-inline{position:absolute;inset:0;width:100%;min-width:0;box-shadow:none;border:0;border-radius:inherit;z-index:3}
.sb-drawer.sb-chief-dialogue{background:var(--sb-app-page-bg,#f7f8fb)}
.sb-chief-dialogue .sb-drawer-head{background:#fff}
.sb-drawer-head{padding:17px 18px 14px;border-bottom:1px solid rgba(15,15,15,.07);display:flex;align-items:center;gap:11px}
.sb-drawer-close{margin-left:auto;border:none;background:none;font-size:16px;color:#8A8F99;cursor:pointer;padding:5px 8px;border-radius:8px}
.sb-drawer-close:hover{background:rgba(15,15,15,.05);color:#333}
.sb-drawer-body{flex:1;overflow-y:auto;padding:16px 18px 28px;background:#FBFCFD}
.sb-agent-avatar{width:38px;height:38px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;background:#5B6B8C;overflow:hidden}
.sb-agent-avatar.sb-main{background:#1F2329}
.sb-agent-avatar.sb-grok-avatar{overflow:visible;border-radius:0;background:transparent}
.sb-agent-avatar.sb-grok-avatar .sb-grok-avatar-svg{display:block;width:100%;height:100%;overflow:visible}
.sb-drawer-name{font-size:15px;font-weight:650;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-drawer-title{font-size:11.5px;color:#8A8F99;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-drawer-live{display:inline-flex;align-items:center;gap:5px;margin-left:8px;font-size:10.5px;color:#2F80ED;font-weight:600}
.sb-drawer-live i{width:6px;height:6px;border-radius:50%;background:currentColor}
.sb-drawer-live.sb-working{color:#B87A1E}.sb-drawer-live.sb-waiting,.sb-drawer-live.sb-blocked{color:#C4453C}
.sb-work-hero{background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:13px;padding:14px;margin-bottom:14px}
.sb-work-hero-top{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sb-work-kicker,.sb-section-title{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#8A8F99;font-weight:700}
.sb-work-state{margin-left:auto;font-size:11px;font-weight:650;color:#B87A1E}
.sb-work-state.sb-done{color:#3D9950}.sb-work-state.sb-idle{color:#8A8F99}
.sb-work-task{font-size:14px;line-height:1.55;color:#1F2329;font-weight:600}
.sb-work-phase{font-size:11.5px;color:#5A5E66;margin-top:4px}
.sb-work-progress{height:5px;border-radius:99px;background:#EEF0F3;overflow:hidden;margin-top:12px}
.sb-work-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#3B6BD4,#57B26A);transition:width .3s ease}
.sb-work-progress-meta{display:flex;justify-content:space-between;font-size:10.5px;color:#8A8F99;margin-top:6px}
.sb-work-context{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.sb-work-context span{font-size:10.5px;color:#66707C;background:#F5F7FA;border:1px solid #E5E9EF;border-radius:999px;padding:3px 8px}
.sb-section{margin:0 0 17px}.sb-section-title{margin-bottom:9px}
.sb-timeline{position:relative;padding-left:18px}.sb-timeline:before{content:"";position:absolute;left:4px;top:5px;bottom:5px;width:1px;background:#DDE2E8}
.sb-timeline-item{position:relative;font-size:12px;color:#3F434A;line-height:1.55;padding:0 0 10px}
.sb-timeline-item:before{content:"";position:absolute;left:-17px;top:5px;width:7px;height:7px;border-radius:50%;background:#AAB4C1;box-shadow:0 0 0 3px #FBFCFD}
.sb-timeline-item:first-child:before{background:#3B6BD4}.sb-timeline-item:last-child{padding-bottom:0}
.sb-timeline-time{display:block;font-size:10px;color:#A2A8B0;margin-top:2px}
.sb-output-list{display:flex;flex-direction:column;gap:8px}
.sb-output{display:flex;align-items:center;gap:10px;padding:9px 10px;background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:10px}
.sb-output-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:rgba(76,154,255,.12);color:#3B6BD4;flex:none}
.sb-output-icon.sb-sheet{background:rgba(87,178,106,.14);color:#2F7D3F}
.sb-output-main{min-width:0;flex:1}.sb-output-name{font-size:12px;color:#1F2329;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-output-meta{font-size:10.5px;color:#8A8F99;margin-top:2px}
.sb-output-status{font-size:10px;color:#3D9950;font-weight:650;flex:none}
.sb-proof-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sb-proof{background:#fff;border:1px solid rgba(15,15,15,.07);border-radius:10px;padding:9px 10px;min-width:0}.sb-proof-value{font-size:17px;font-weight:700;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-proof-label{font-size:10px;line-height:1.35;color:#8A8F99;margin-top:3px}
.sb-next{font-size:12px;line-height:1.6;color:#3F434A;background:#F1F5FF;border:1px solid rgba(59,107,212,.13);border-radius:10px;padding:10px 12px}
.sb-next.sb-attention{background:#FFF7E8;border-color:rgba(232,163,61,.25);color:#805B1B}
.sb-next-action{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}
.sb-next-action button{border:1px solid rgba(59,107,212,.2);background:#fff;color:#3B6BD4;border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;cursor:pointer}
.sb-empty{font-size:12px;color:#8A8F99;background:#fff;border:1px dashed #DDE2E8;border-radius:10px;padding:12px}
.sb-chief-body{display:flex;flex-direction:column;min-height:0;padding:0;background:var(--sb-app-page-bg,#f7f8fb);overflow:hidden}
.sb-chief-overview{flex:none;padding:16px 16px 14px;background:#fff;color:#1f2924;border-bottom:1px solid #e8eeeb;box-shadow:0 1px 0 rgba(19,37,30,.02)}
.sb-chief-overview-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sb-chief-overview-kicker{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#7e8b84;font-weight:700}
.sb-chief-overview-count{margin-left:auto;color:#4b8b68;font-size:10px;font-weight:650}
.sb-chief-overview-task{font-size:16px;line-height:1.4;font-weight:720;letter-spacing:-.01em}
.sb-chief-overview-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.sb-chief-overview-meta span{font-size:10.5px;line-height:1.4;color:#66736c;border:1px solid #e0e9e4;background:#f8faf9;border-radius:999px;padding:4px 8px}
.sb-chief-phases{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:14px}
.sb-chief-phase{position:relative;min-width:0;color:#9aa49f;font-size:9.5px;line-height:1.3}
.sb-chief-phase:before{content:"";display:block;width:8px;height:8px;border-radius:50%;margin-bottom:5px;background:#d8e1dc;box-shadow:0 0 0 3px #f4f7f5}
.sb-chief-phase.is-active{color:#3d7657;font-weight:650}
.sb-chief-phase.is-active:before{background:#42b77b;box-shadow:0 0 0 3px #e7f5ed}
.sb-chief-team{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:11px;border-top:1px solid #edf1ef}
.sb-chief-team-label{font-size:10.5px;color:#7c8882;white-space:nowrap}
.sb-chief-team-avatars{display:flex;align-items:center;min-width:0;overflow:hidden}
.sb-chief-team-avatar{width:23px;height:23px;margin-left:-4px;border:2px solid #fff;border-radius:8px;overflow:hidden;background:#edf3ef;color:#466653;font-size:8px;display:grid;place-items:center;box-shadow:0 1px 3px rgba(29,58,43,.12)}
.sb-chief-team-avatar:first-child{margin-left:0}
.sb-chief-team-avatar img{width:100%;height:100%;object-fit:cover}
.sb-chief-team-more{font-size:10px;color:#5b9473;margin-left:3px;white-space:nowrap}
.sb-chief-feed{flex:1;min-height:0;overflow-y:auto;padding:16px 16px 12px}
.sb-chief-empty{margin:2px 0 12px;padding:11px 12px;border:1px dashed #dfe9e3;border-radius:10px;background:#fbfdfc;color:#89968e;font-size:11px;line-height:1.55}
.sb-chief-message{display:flex;gap:8px;margin:0 0 12px;align-items:flex-start}
.sb-chief-message.is-user{justify-content:flex-end}
.sb-chief-avatar{width:28px;height:28px;flex:none;display:grid;place-items:center;border-radius:9px;overflow:hidden;background:#1F2329;color:#fff;font-size:11px;font-weight:700}
.sb-chief-avatar img{width:100%;height:100%;object-fit:cover}
.sb-chief-bubble{max-width:88%;padding:10px 12px;border:1px solid #e4ebe7;border-radius:4px 13px 13px 13px;background:#fff;color:#28342e;font-size:12px;line-height:1.65;box-shadow:0 2px 8px rgba(28,49,39,.035)}
.sb-chief-message.is-user .sb-chief-bubble{border-color:#cdebdc;border-radius:13px 4px 13px 13px;background:#e9f8f0;color:#186b4c}
.sb-chief-thinking{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding-left:36px;color:#7b8981;font-size:11px;animation:sb-drawer-message-in .18s ease-out both}.sb-chief-thinking-dots{display:inline-flex;gap:3px}.sb-chief-thinking-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:sb-chief-thinking 1.1s ease-in-out infinite}.sb-chief-thinking-dots i:nth-child(2){animation-delay:.14s}.sb-chief-thinking-dots i:nth-child(3){animation-delay:.28s}@keyframes sb-chief-thinking{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-3px);opacity:1}}
.sb-chief-meta{margin-top:5px;color:#99a49e;font-size:10px}
.sb-chief-options{flex:none;padding:0 16px 14px;background:var(--sb-app-page-bg,#f7f8fb)}
.sb-chief-options-title{margin:0 0 8px;color:#7d8982;font-size:10px;font-weight:650;letter-spacing:.03em}
.sb-chief-option-list{display:grid;gap:7px}
.sb-chief-option{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:10px 11px;border:1px solid #dfe9e3;border-radius:10px;background:#fff;color:#236e50;text-align:left;font:inherit;font-size:11px;cursor:pointer;transition:border-color .15s ease,background .15s ease,transform .15s ease}
.sb-chief-option::after{content:"→";color:#6aa889;font-size:14px}
.sb-chief-option:hover{border-color:#8bd3ad;background:#f3fcf7;transform:translateY(-1px)}
.sb-chief-option:disabled{opacity:.55;cursor:default;transform:none}
.sb-chief-compose{display:flex;align-items:center;gap:7px;flex:none;padding:0 16px 14px;background:var(--sb-app-page-bg,#f7f8fb)}
.sb-chief-compose input{flex:1;min-width:0;height:34px;padding:0 10px;border:1px solid #dfe9e3;border-radius:9px;background:#fff;color:#28342e;font:inherit;font-size:11px;outline:none}
.sb-chief-compose input:focus{border-color:#8bd3ad;box-shadow:0 0 0 3px rgba(66,183,123,.12)}
.sb-chief-compose button{width:40px;height:34px;border:0;border-radius:9px;background:#1f2924;color:#fff;font:inherit;font-size:11px;font-weight:650;cursor:pointer}
.sb-chief-compose button:hover{background:#31483b}.sb-chief-compose button:disabled{opacity:.55;cursor:default}
.sb-drawer-quick-actions{display:flex;gap:8px;padding:0 16px 14px;background:var(--sb-app-page-bg,#f7f8fb)}
.sb-drawer-quick-action{flex:1;height:34px;border:1px solid #d9dee4;border-radius:9px;background:#fff;color:#4d5964;font:inherit;font-size:11px;font-weight:650;cursor:pointer}
.sb-drawer-quick-action:hover{border-color:#aab3bd;background:#f6f7f8}
.sb-drawer-quick-action.is-primary{border-color:#262626;background:#262626;color:#fff}
.sb-drawer-quick-action.is-primary:hover{background:#3d3d3d}
.sb-drawer-quick-action:disabled{opacity:.5;cursor:default}
@media(prefers-reduced-motion:reduce){.sb-chief-thinking,.sb-chief-thinking-dots i{animation:none!important}}
.sb-agent-cloud{margin:0 0 14px;border:1px solid #e1e5e9;border-radius:14px;background:#fff;overflow:hidden}
.sb-agent-cloud-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 13px 10px;border-bottom:1px solid #edf0f3}
.sb-agent-cloud-title{color:#262626;font-size:12px;font-weight:700}
.sb-agent-cloud-state{display:inline-flex;align-items:center;gap:5px;color:#2f80ed;font-size:10px;font-weight:650}
.sb-agent-cloud-state i{width:6px;height:6px;border-radius:50%;background:#2f80ed}
.sb-agent-cloud-screen{position:relative;min-height:224px;background:#f0f2f4;overflow:hidden}
.sb-agent-cloud-screen img{display:block;width:100%;height:224px;object-fit:cover}
.sb-agent-cloud-generated{height:224px;padding:13px;background:#20252b;color:#e7edf3;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sb-agent-cloud-browserbar{display:flex;align-items:center;gap:5px;height:20px;margin:-13px -13px 12px;padding:0 9px;background:#30363d;color:#aeb8c3;font-size:8px}
.sb-agent-cloud-browserbar i{width:5px;height:5px;border-radius:50%;background:#ef6e67;box-shadow:9px 0 #e6b450,18px 0 #61c477}
.sb-agent-cloud-generated h4{margin:0 0 11px;color:#fff;font-size:11px;font-family:inherit}
.sb-agent-cloud-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
.sb-agent-cloud-stat{padding:7px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.05)}
.sb-agent-cloud-stat strong{display:block;color:#fff;font-size:13px}.sb-agent-cloud-stat span{display:block;margin-top:3px;color:#9eabb7;font-size:8px}
.sb-agent-cloud-lines{display:grid;gap:6px}.sb-agent-cloud-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 7px;border-radius:5px;background:rgba(255,255,255,.06);font-size:8px}.sb-agent-cloud-line em{color:#75b5ff;font-style:normal;white-space:nowrap}
.sb-agent-cloud-overlay{position:absolute;right:10px;bottom:10px;left:10px;padding:9px 10px;border-radius:9px;background:rgba(12,16,20,.78);color:#fff}
.sb-agent-cloud-overlay span{display:block;color:#aeb8c3;font-size:9px}.sb-agent-cloud-overlay strong{display:block;margin-top:3px;font-size:12px;font-weight:650}
.sb-agent-cloud-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;color:#8b949c;font-size:9.5px}
.sb-agent-cloud-store{position:relative}
.sb-agent-cloud-store-button{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #dfe4e8;border-radius:7px;background:#fff;color:#4d5964;font:inherit;font-size:9.5px;cursor:pointer}
.sb-agent-cloud-store-button::after{content:"⌄";font-size:11px}
.sb-agent-cloud-store-menu{position:absolute;right:0;bottom:31px;z-index:2;display:grid;min-width:142px;padding:4px;border:1px solid #dfe4e8;border-radius:8px;background:#fff;box-shadow:0 8px 20px rgba(24,32,39,.12)}
.sb-agent-cloud-store-menu button{padding:7px 8px;border:0;border-radius:5px;background:#fff;color:#4d5964;text-align:left;font:inherit;font-size:9.5px;cursor:pointer}.sb-agent-cloud-store-menu button:hover{background:#f4f4f5}
.sb-agent-chat{margin:0 0 16px;padding:13px 14px 12px;border:1px solid #e1e5e9;border-radius:14px;background:#fff;transition:border-color .18s ease,box-shadow .18s ease}.sb-agent-chat[data-state="loading"]{border-color:#d7e4f8;box-shadow:0 4px 16px rgba(47,128,237,.06)}
.sb-agent-chat-time{margin-bottom:11px;color:#a0a8b0;font-size:9.5px;text-align:center}
.sb-agent-chat-message{display:flex;align-items:flex-start;gap:8px;margin-bottom:10px}.sb-agent-chat-message.is-new{animation:sb-drawer-message-in .22s cubic-bezier(.22,.8,.3,1) both}.sb-agent-chat-message.is-user{justify-content:flex-end}.sb-agent-chat-message.is-user .sb-agent-chat-bubble{border-color:#d4d4d4;background:#f4f4f5;color:#303840}
.sb-agent-chat-avatar{width:25px;height:25px;flex:none;border-radius:8px;overflow:hidden;background:#f0f0f0}.sb-agent-chat-avatar img{width:100%;height:100%;object-fit:cover}
.sb-agent-chat-bubble{max-width:82%;padding:8px 10px;border:1px solid #e8ebee;border-radius:4px 10px 10px 10px;background:#fafafa;color:#4d5964;font-size:11px;line-height:1.55}.sb-agent-chat-empty{padding:10px 11px;border:1px dashed #dfe4e8;border-radius:9px;background:#fbfcfd;color:#8a939d;font-size:10.5px;line-height:1.5}.sb-agent-chat-error{margin-top:8px;color:#b24b44;font-size:10px;line-height:1.4}
.sb-agent-chat-compose{display:flex;align-items:center;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #edf0f3}.sb-agent-chat-input{flex:1;min-width:0;height:32px;padding:0 9px;border:1px solid #dfe4e8;border-radius:7px;background:#fafafa;color:#303840;font:inherit;font-size:10px;outline:none}.sb-agent-chat-input:focus{border-color:#2f80ed;background:#fff;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-agent-chat-send{width:32px;height:32px;border:0;border-radius:8px;background:#262626;color:#fff;font-size:15px;line-height:1;cursor:pointer;transition:background .15s ease,opacity .15s ease,transform .15s ease}.sb-agent-chat-send:hover{background:#3d3d3d}.sb-agent-chat-send[aria-busy="true"]{opacity:.72;cursor:wait}.sb-agent-chat-send[aria-busy="true"]::after{content:"";display:inline-block;width:11px;height:11px;border:1.5px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:sb-drawer-spin .65s linear infinite}
@keyframes sb-drawer-message-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes sb-drawer-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.sb-agent-chat,.sb-agent-chat-message.is-new,.sb-agent-chat-send[aria-busy="true"]::after{animation:none!important;transition:none!important}}
.sb-role-workspace{margin-bottom:16px;border:1px solid #e1e5ea;border-radius:13px;background:#fff;overflow:hidden}
.sb-role-workspace-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:13px 14px 11px;border-bottom:1px solid #edf0f3}
.sb-role-workspace-kicker{color:#8a939d;font-size:10px;font-weight:700;letter-spacing:.04em}
.sb-role-workspace-title{margin-top:3px;color:#262626;font-size:14px;font-weight:700;line-height:1.35}
.sb-role-workspace-live{display:inline-flex;align-items:center;gap:5px;flex:none;color:#2f80ed;font-size:10px;font-weight:650}
.sb-role-workspace-live i{width:6px;height:6px;border-radius:50%;background:#2f80ed}
.sb-role-workspace-body{padding:12px 14px 14px}
.sb-role-workspace-subtitle{margin-bottom:10px;color:#8a939d;font-size:10.5px;line-height:1.5}
.sb-role-workspace-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:11px}
.sb-role-workspace-metric{min-width:0;padding:8px 9px;border-radius:9px;background:#f4f4f5}
.sb-role-workspace-metric strong{display:block;color:#262626;font-size:15px;font-variant-numeric:tabular-nums;line-height:1.15}
.sb-role-workspace-metric span{display:block;margin-top:3px;color:#8a939d;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-role-workspace-table{display:grid;gap:0;border-top:1px solid #edf0f3}
.sb-role-workspace-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #edf0f3}
.sb-role-workspace-row:last-child{border-bottom:0}
.sb-role-workspace-row-copy{min-width:0}
.sb-role-workspace-row-title{display:block;color:#3f4650;font-size:10.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-role-workspace-row-detail{display:block;margin-top:3px;color:#929aa3;font-size:9.5px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-role-workspace-row-state{color:#2f80ed;font-size:9.5px;font-weight:650;white-space:nowrap}
.sb-role-workspace-row-state.is-muted{color:#8a939d}
.sb-role-workspace-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px;padding-top:10px;border-top:1px solid #edf0f3;color:#8a939d;font-size:9.5px}
.sb-role-workspace-footer strong{color:#2f80ed;font-weight:650}
@media(max-width:900px){.sb-drawer{width:min(48vw,500px);min-width:340px}}
@media(max-width:640px){.sb-drawer{width:100%;min-width:0}.sb-drawer-body{padding-left:14px;padding-right:14px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function avatarInitial(name) {
  return (name || "?").trim().slice(0, 1) || "?";
}

export function normalizeAgentConversationMessages(messages = []) {
  return normalizePrivateConversationMessages(messages);
}

export const ACQUISITION_DRAWER_AGENT_IDS = Object.freeze(["mkt-comment-acquisition", "mkt-find-people"]);

export function isAcquisitionDrawerAgent(agentType) {
  return ACQUISITION_DRAWER_AGENT_IDS.includes(String(agentType || ""));
}

export function acquisitionDrawerContext(agentType, { task = null, work = null } = {}) {
  const metadata = work?.metadata || task?.metadata || {};
  return {
    agentId: String(agentType || task?.runtimeAgentId || ""),
    taskId: task?.taskId || task?.id || work?.taskId || metadata.taskId || null,
    taskRunId: task?.taskRunId || task?.runtimeTaskRunId || work?.taskRunId || metadata.taskRunId || null,
    accountId: task?.accountId || task?.account_id || work?.accountId || metadata.accountId || null,
    conversationId: task?.conversationId || task?.conversation_id || metadata.conversationId || null
  };
}

export function acquisitionDrawerActionPayload(agentType, action, context = {}) {
  return Object.fromEntries(Object.entries({ agentId: agentType, action, ...context })
    .filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

export function acquisitionDrawerActions({ taskState = "", hasTask = false } = {}) {
  const state = String(taskState || "").toLowerCase();
  return [
    { label: "继续处理", action: "resume", disabled: !hasTask || !["paused", "degraded"].includes(state) },
    { label: "暂停", action: "pause", disabled: !hasTask || !["running", "degraded"].includes(state) },
    { label: "恢复", action: "resume", disabled: !hasTask || !["paused", "degraded"].includes(state) },
    { label: "关闭", action: "stop", disabled: !hasTask || ["stopped", "error"].includes(state) },
    { label: "查看实时工作", action: "realtime", disabled: false }
  ];
}

let drawerEls = null;
let drawerCleanup = null;
export function closeAgentDrawer() {
  drawerCleanup?.();
  drawerCleanup = null;
  if (drawerEls) {
    const host = drawerEls.find((node) => node?.dataset?.sbProgressHost === "1");
    host?.classList.remove("sb-progress-host");
    drawerEls.filter((node) => node !== host).forEach((node) => node.remove());
    drawerEls = null;
  }
}

function profileFallback(agentType) {
  return createDefaultProfile(agentType);
}

function contextualProfile(agentType, profile) {
  const match = onboardingMatchFromStorage();
  const matched = match?.agents?.find((agent) => agent.legacyType === agentType || agent.id === agentType);
  if (!matched?.name) return profile;
  return {
    ...profile,
    identity: { ...profile.identity, name: matched.name, title: matched.name },
    role: { ...profile.role, position: matched.name }
  };
}

function statusClass(state) {
  if (state === TEAM_STATES.BUSY) return "sb-working";
  if (state === TEAM_STATES.WAITING_APPROVAL) return "sb-waiting";
  if (state === TEAM_STATES.BLOCKED) return "sb-blocked";
  return "";
}

function progressFor(work, dashboard, status) {
  if (!work) return status.state === TEAM_STATES.WAITING_APPROVAL ? 92 : status.state === TEAM_STATES.BUSY ? 48 : 100;
  if (work.state === "done") return 100;
  const count = Math.min(4, work.activities?.length || 0);
  return Math.min(92, Math.max(18, 18 + count * 18));
}

function taskForAgent(agentType, projectId) {
  const tasks = listTasks()
    .filter((task) => !projectId || task.projectId === projectId)
    .filter((task) => task.runtimeAgentId === agentType || task.runtimeAgentName === agentType || agentType === "main")
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  const match = onboardingMatchFromStorage();
  const signature = match
    ? [match.identityId, ...(Array.isArray(match.goalIds) ? match.goalIds : []), match.workflowId].filter(Boolean).join("|")
    : "";
  const onboardingTask = signature ? tasks.find((task) => task.onboardingSignature === signature) : null;
  if (onboardingTask) return onboardingTask;
  return tasks[0] || null;
}

function taskStatusLabel(task, work, status) {
  if (work?.state === "done" || task?.status === "done") return "已完成";
  if (task?.status === "approval" || status.state === TEAM_STATES.WAITING_APPROVAL) return "待你确认";
  if (task?.status === "failed" || task?.status === "blocked" || status.state === TEAM_STATES.BLOCKED) return "遇到阻塞";
  if (work || task?.status === "progress" || task?.status === "running" || status.state === TEAM_STATES.WORKING) return "执行中";
  return "空闲";
}

function taskProgress(task, work, status) {
  if (work) return progressFor(work, null, status);
  if (Number.isFinite(task?.runtimeProgress)) return Math.max(0, Math.min(100, Math.round(task.runtimeProgress)));
  if (task?.status === "done") return 100;
  if (task?.status === "approval") return 92;
  return 0;
}

function taskEvents(task, work) {
  const events = Array.isArray(task?.runtimeEvents) ? task.runtimeEvents : [];
  const eventRows = events
    .filter((event) => event?.text || event?.message)
    .slice(-6)
    .reverse()
    .map((event) => ({ text: event.text || event.message, at: event.createdAt || event.at || task.updated_at }));
  if (work?.activities?.length) return work.activities.slice(-6).reverse().map((text) => ({ text, at: work.startedAt }));
  return eventRows;
}

function chiefSnapshot(_projectId, _currentStatus, teamLive) {
  const tasks = listTasks();
  const works = listWorks();
  const counts = { running: 0, waiting: 0, blocked: 0, completed: 0 };
  for (const task of tasks) {
    const state = String(task?.status || "").toLowerCase();
    if (["progress", "running", "retrying"].includes(state)) counts.running += 1;
    else if (["approval", "paused", "created"].includes(state)) counts.waiting += 1;
    else if (["failed", "blocked"].includes(state)) counts.blocked += 1;
    else if (state) counts.completed += 1;
  }

  const workingAgentTypes = new Set(works
    .filter((work) => work?.state === "working")
    .map((work) => work.agentType)
    .filter(Boolean));
  const teamStatus = teamLive?.getTeamStatus?.();
  if (teamStatus instanceof Map) {
    for (const [agentType, status] of teamStatus.entries()) {
      if (status?.state === TEAM_STATES.WORKING) workingAgentTypes.add(agentType);
    }
  }
  const profiles = teamLive?.getProfiles?.() instanceof Map ? teamLive.getProfiles() : new Map();
  const agentTypes = [...new Set([
    ...BYERING_DEFAULT_AGENT_TYPES,
    ...profiles.keys(),
    ...works.map((work) => work.agentType),
    ...tasks.map((task) => task.runtimeAgentId || task.agentId)
  ].filter(Boolean))].filter((agentType) => agentType !== "main");
  const roster = agentTypes.map((agentType) => {
    const liveStatus = teamLive?.getStatusOf?.(agentType);
    const currentWork = works.find((work) => work.agentType === agentType && work.state === "working");
    const profile = profiles.get(agentType);
    return {
      id: agentType,
      type: agentType,
      name: profile?.identity?.name || AGENT_TYPE_DEFAULTS[agentType]?.role || agentType,
      stage: currentWork?.phase || TEAM_STATE_LABELS[liveStatus?.state] || "空闲",
      state: liveStatus?.state || null
    };
  });
  const active = counts.running + counts.waiting + counts.blocked > 0 || workingAgentTypes.size > 0;
  const title = counts.running
    ? `${counts.running} 项任务正在执行`
    : counts.waiting
      ? `${counts.waiting} 项任务等待处理`
      : counts.blocked
        ? `${counts.blocked} 项任务需要关注`
        : "当前没有进行中的任务";
  return {
    roster,
    counts,
    active,
    title,
    workingCount: workingAgentTypes.size,
    signature: JSON.stringify({ counts, working: [...workingAgentTypes].sort(), work: works.map((item) => [item.agentType, item.state, item.phase]) })
  };
}

const ROLE_WORKSPACE_PAGES = Object.freeze({
  "Browser Agent": {
    title: "商品线索采集",
    subtitle: "从商品视频、直播互动和账号主页中保留可追溯的购买表达。",
    metrics: [["231", "已发现账号"], ["3,842", "互动证据"], ["47", "待分析"]],
    rows: [["商品视频", "18 条购买表达 · 保留原文与时间", "抓取中"], ["直播间互动", "32 个预算信号 · 已完成去重", "已记录"], ["账号主页", "12 个待验证账号 · 等待补看", "验证中"]],
    footer: "当前页面：抖音商品线索池",
    action: "持续采集公开来源"
  },
  "mkt-find-people": {
    title: "找客任务",
    subtitle: "公开找人时整理候选；账号监听时只处理后续新增评论、直播互动和账号互动，并保留原始证据。",
    metrics: null,
    rows: null,
    footer: "当前页面：候选客户与原始证据",
    action: "交接给客户分析员"
  },
  "mkt-comment-acquisition": {
    title: "评论区线索采集",
    subtitle: "按评论原文、互动上下文和账号身份筛出可交接的真实购买信号。",
    metrics: null,
    rows: null,
    footer: "当前页面：评论线索证据池",
    action: "交接给购买意向分析师"
  },
  "Search Agent": {
    title: "用户意向分析",
    subtitle: "把线索表单、行为证据和购买时间合并成可解释的意向等级。",
    metrics: [["214", "候选线索"], ["47", "A 级线索"], ["6", "证据不足"]],
    rows: [["小雨今天喝拿铁", "92 分 · 预算明确 · 1 周内购买", "高意向"], ["阿泽的咖啡日记", "88 分 · 对比机型 · 等待发货", "高意向"], ["冰美式不加糖", "68 分 · 购买时间未明确", "低意向"]],
    footer: "当前页面：用户意向结果表",
    action: "输出 A / B / C 优先级"
  },
  "App Agent": {
    title: "首触策略工作台",
    subtitle: "根据用户的购买证据，编排渠道、首句和审批节点。",
    metrics: [["72", "待触达客户"], ["36", "首触草稿"], ["9", "待审批批次"]],
    rows: [["小雨今天喝拿铁", "私信首触 · 围绕到货和保修切入", "待风控"], ["阿泽的咖啡日记", "评论后私信 · 先确认预算", "已生成"], ["冰美式不加糖", "暂缓触达 · 继续补充购买证据", "需补证据"]],
    footer: "当前页面：首触审批队列",
    action: "通过后进入触达执行"
  },
  "Computer Agent": {
    title: "数据处理工作台",
    subtitle: "运行去重、补全和同步任务，为团队提供稳定的数据底座。",
    metrics: [["1,204", "待处理记录"], ["37", "重复命中"], ["86%", "任务完成"]],
    rows: [["去重脚本", "合并邮箱和主页重复记录", "已完成"], ["字段补全", "校验账号、来源和时间字段", "执行中"], ["同步任务", "写入线索库和项目空间", "排队中"]],
    footer: "当前页面：自动化执行台",
    action: "等待下一批数据任务"
  },
  "File Agent": {
    title: "内容与文档产出",
    subtitle: "把研究结果整理成可阅读、可复用、可交接的业务材料。",
    metrics: [["12", "待整理素材"], ["5", "已生成文档"], ["3", "待审核"]],
    rows: [["客户简报", "补充来源证据和购买信号", "整理中"], ["首触话术", "输出按意向分层的沟通版本", "待审核"], ["交接记录", "同步给触达策略师", "已完成"]],
    footer: "当前页面：客户简报与文档库",
    action: "产出可交接文件"
  },
  "Strategy Agent": {
    title: "获客策略编排",
    subtitle: "把业务目标拆成行业、画像、来源和验收标准。",
    metrics: [["4", "画像版本"], ["3", "来源渠道"], ["12", "筛选条件"]],
    rows: [["客户画像", "日常好物购买者 · 预算与场景", "已生成"], ["来源组合", "评论、粉丝和直播间", "已匹配"], ["筛选规则", "地域、需求、意向和时间窗口", "待下发"]],
    footer: "当前页面：团队策略任务包",
    action: "交接给线索猎人"
  },
  "Research Agent": {
    title: "客户画像分析",
    subtitle: "补全主页、作品和互动中的需求信号，形成客户简报。",
    metrics: [["126", "已补全画像"], ["58", "需求信号"], ["19", "信息缺口"]],
    rows: [["小雨今天喝拿铁", "已收藏 · 本周入手", "已补全"], ["阿泽的咖啡日记", "预算 1,500 · 对比机型", "已补全"], ["Lily 的生活碎片", "使用场景与时间未知", "待补充"]],
    footer: "当前页面：客户分析工作区",
    action: "交接给触达策略师"
  },
  "Risk Agent": {
    title: "触达风控审核",
    subtitle: "在发送前检查重复触达、冷却期、权限和勿扰状态。",
    metrics: [["9", "待校验批次"], ["28", "已放行"], ["4", "已拦截"]],
    rows: [["重复触达", "检查近 7 天历史动作", "已放行"], ["权限状态", "校验账号权限与勿扰设置", "已放行"], ["冷却规则", "命中同类内容 24 小时冷却", "已拦截"]],
    footer: "当前页面：发送前风险检查",
    action: "输出放行或拦截结论"
  },
  "Outreach Agent": {
    title: "触达执行台",
    subtitle: "按批准版本逐条执行私信、评论，并记录平台回执。",
    metrics: [["31", "已触达客户"], ["28", "送达成功"], ["12", "有效回复"]],
    rows: [["小雨今天喝拿铁", "私信首触 · 等待客户回复", "已送达"], ["阿泽的咖啡日记", "评论后私信 · 进入跟进", "已回复"], ["Lily 的生活碎片", "账号主页 · 等待重试", "未读"]],
    footer: "当前页面：平台触达执行记录",
    action: "等待送达回执"
  },
  "Outreach Ops Agent": {
    title: "回复回流队列",
    subtitle: "监听客户回复，处理重试和暂停，满足条件后停止后续计划。",
    metrics: [["16", "发送队列"], ["5", "新回复"], ["3", "待重试"]],
    rows: [["小雨今天喝拿铁", "客户回复已回流策略师", "刚刚"], ["阿泽的咖啡日记", "已送达 · 等待下一次互动", "2 分钟前"], ["冰美式不加糖", "账号限流 · 排入下一批次", "5 分钟前"]],
    footer: "当前页面：触达运营台",
    action: "持续监听回复事件"
  }
});

function snapshotCount(snapshot, ...keys) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (Number.isFinite(Number(value))) return String(Math.max(0, Number(value)));
  }
  return "—";
}

export function acquisitionWorkspaceDataFor(agentType, { task = null, work = null, events = [] } = {}) {
  const page = ROLE_WORKSPACE_PAGES[agentType];
  if (!isAcquisitionDrawerAgent(agentType) || !page) return page;
  const snapshot = {
    ...(task?.metadata && typeof task.metadata === "object" ? task.metadata : {}),
    ...(work?.metadata && typeof work.metadata === "object" ? work.metadata : {}),
    ...(task && typeof task === "object" ? task : {}),
    ...(work && typeof work === "object" ? work : {})
  };
  const hasRealSnapshot = [task, work].some((value) => value && typeof value === "object" && Object.keys(value).length > 0)
    || (Array.isArray(events) && events.length > 0);
  if (!hasRealSnapshot) {
    return {
      ...page,
      metrics: [["—", "等待真实数据"], ["—", "等待真实数据"], ["—", "等待真实数据"]],
      rows: [["真实执行结果", "尚未产生真实产出，等待任务回传。", "等待中"]]
    };
  }
  const metrics = [
    [snapshotCount(snapshot, "candidateCount", "prospectCount", "leadCount"), "真实候选潜客"],
    [snapshotCount(snapshot, "interactionCount", "evidenceCount"), "真实互动证据"],
    [snapshotCount(snapshot, "pendingCount", "pendingLeadCount", "pendingProspectCount"), "真实待分析"]
  ];
  return {
    ...page,
    metrics,
    rows: [["真实任务快照", events.length ? `已记录 ${events.length} 条真实事件。` : "已连接真实任务，等待更多产出。", "实时同步"]]
  };
}

export function acquisitionCloudPresentationFor(agentType, snapshot = {}) {
  if (!isAcquisitionDrawerAgent(agentType)) return acquisitionWorkspaceDataFor(agentType, snapshot);
  const page = acquisitionWorkspaceDataFor(agentType, snapshot) || {
    title: "获客任务",
    subtitle: "等待真实任务快照。",
    metrics: [["—", "等待真实数据"], ["—", "等待真实数据"], ["—", "等待真实数据"]],
    rows: [["真实执行结果", "尚未产生真实产出，等待任务回传。", "等待中"]],
    footer: "当前页面：等待真实任务",
    action: "等待真实数据"
  };
  const error = acquisitionErrorFor(snapshot);
  const hasRealSnapshot = hasAcquisitionSnapshot(snapshot.task, snapshot.work, snapshot.events);
  if (error) {
    return {
      ...page,
      stores: [],
      errorState: true,
      errorMessage: error.message,
      errorCode: error.code,
      overlayTitle: "真实任务异常",
      overlayDetail: error.message,
      metrics: [["—", "真实数据不可用"], ["—", "真实数据不可用"], ["—", "需要处理"]],
      rows: [["真实任务错误", error.message, "异常"]]
    };
  }
  return {
    ...page,
    stores: hasRealSnapshot ? acquisitionStoresFor(snapshot) : [],
    errorState: false
  };
}

function renderRoleWorkspace(body, agentType) {
  const page = acquisitionWorkspaceDataFor(agentType);
  if (!page) return;
  const section = el("section", "sb-role-workspace");
  const head = el("div", "sb-role-workspace-head");
  const headCopy = el("div");
  headCopy.append(el("div", "sb-role-workspace-kicker", "角色工作页面"), el("div", "sb-role-workspace-title", page.title));
  const live = el("span", "sb-role-workspace-live");
  live.append(el("i"), el("span", null, "实时同步"));
  head.append(headCopy, live);
  const content = el("div", "sb-role-workspace-body");
  content.appendChild(el("div", "sb-role-workspace-subtitle", page.subtitle));
  const metrics = el("div", "sb-role-workspace-metrics");
  page.metrics.forEach(([value, label]) => {
    const metric = el("div", "sb-role-workspace-metric");
    metric.append(el("strong", null, value), el("span", null, label));
    metrics.appendChild(metric);
  });
  content.appendChild(metrics);
  const table = el("div", "sb-role-workspace-table");
  page.rows.forEach(([title, detail, state]) => {
    const row = el("div", "sb-role-workspace-row");
    const copy = el("div", "sb-role-workspace-row-copy");
    copy.append(el("span", "sb-role-workspace-row-title", title), el("span", "sb-role-workspace-row-detail", detail));
    const stateEl = el("span", `sb-role-workspace-row-state${state.includes("待") || state.includes("排") || state.includes("未") || state.includes("需") ? " is-muted" : ""}`, state);
    row.append(copy, stateEl);
    table.appendChild(row);
  });
  content.appendChild(table);
  const footer = el("div", "sb-role-workspace-footer");
  footer.append(el("span", null, page.footer), el("strong", null, page.action));
  content.appendChild(footer);
  section.append(head, content);
  body.appendChild(section);
}

const ROLE_CLOUD_PAGES = Object.freeze({
  "mkt-comment-acquisition": {
    title: "评论线索采集",
    overlayTitle: "等待真实数据",
    overlayDetail: "尚未产生真实产出",
    stores: [],
    message: "我会在真实采集结果回传后同步线索进展。",
    reply: "收到，我会保留来源和原话，等真实结果回传。"
  },
  "Browser Agent": {
    title: "抖音线索研究",
    overlayTitle: "正在筛选高意向买家",
    overlayDetail: "采集商品评论、直播互动与账号主页信号",
    image: CLOUD_DISCOVERY_IMAGE,
    stores: ["杭州豪车专卖店", "小满的好物小铺", "小满的家居日常"],
    message: "我正在整理公开评论和主页信号，先把有明确购买表达的人筛出来。",
    reply: "收到，我会继续保留原始来源和时间，筛完后交给线索分析师。"
  },
  "mkt-find-people": {
    title: "找客任务",
    overlayTitle: "正在整理候选客户",
    overlayDetail: "公开找人保留来源证据；账号监听只处理新评论、直播互动和账号互动",
    image: null,
    stores: [],
    message: "我会保留候选客户的来源、原话和时间。账号监听只接收任务启动后的新信号，不会回扫历史内容。",
    reply: "收到。我会把候选名单和原始证据交给客户分析员；没有明确购买表达的用户不会直接判成高意向。"
  },
  "Search Agent": {
    title: "用户意向分析",
    overlayTitle: "正在计算意向评分",
    overlayDetail: "合并账号、预算、品类与购买时间证据",
    image: CLOUD_INTENT_IMAGE,
    stores: ["杭州豪车专卖店", "小满的好物小铺", "小满的生活选物"],
    message: "我正在把线索表单和行为证据合并，给每个用户标上高、中、低意向。",
    reply: "我会把评分依据一并留下，方便后续触达时知道从哪里切入。"
  },
  "App Agent": {
    title: "首触策略工作台",
    overlayTitle: "准备首轮触达",
    overlayDetail: "编排个性化首句、渠道与审批节点",
    image: CLOUD_OUTREACH_IMAGE,
    stores: ["杭州豪车专卖店", "小满的家居日常", "小满的生活选物"],
    message: "我正在按用户的购买证据编排首触，不会把同一套话术发给所有人。",
    reply: "我会先完成首触草稿和风控检查，确认后再进入触达执行。"
  },
  "Computer Agent": {
    title: "数据处理工作台",
    overlayTitle: "正在同步线索数据",
    overlayDetail: "去重、补全字段并写入项目空间",
    stores: ["杭州豪车专卖店", "小满的好物小铺"],
    message: "我正在处理重复账号和缺失字段，让后面的分析拿到一份干净的数据。",
    reply: "数据同步完成后，我会把异常记录单独列出来，不会悄悄覆盖原始来源。"
  },
  "File Agent": {
    title: "客户简报与文档库",
    overlayTitle: "正在整理客户简报",
    overlayDetail: "汇总证据、意向等级与可用首触素材",
    stores: ["杭州豪车专卖店", "小满的家居日常"],
    message: "我正在把研究结果整理成客户简报，方便触达策略师直接接手。",
    reply: "我会保留每条结论的来源，并把需要人工确认的内容标出来。"
  },
  "Strategy Agent": {
    title: "获客策略画布",
    overlayTitle: "正在拆解获客目标",
    overlayDetail: "明确行业、画像、来源和验收标准",
    stores: ["杭州豪车专卖店", "小满的好物小铺"],
    message: "我正在把这次业务目标拆成可执行的找人、分析和触达阶段。",
    reply: "我会先把边界和验收标准定清楚，再交给各个执行 Agent。"
  },
  "Research Agent": {
    title: "客户分析工作区",
    overlayTitle: "正在补全客户画像",
    overlayDetail: "核对主页、作品与互动中的需求信号",
    stores: ["杭州豪车专卖店", "小满的生活选物"],
    message: "我正在补充用户的使用场景和购买时间，让后面的触达更有依据。",
    reply: "我会把已确认的需求和仍然缺失的信息分开，避免把猜测当成事实。"
  },
  "Risk Agent": {
    title: "触达风险控制台",
    overlayTitle: "正在校验触达权限",
    overlayDetail: "检查重复触达、冷却期和账号勿扰状态",
    stores: ["杭州豪车专卖店", "小满的好物小铺"],
    message: "我正在检查每一批首触是否满足权限和冷却规则，先拦住有风险的动作。",
    reply: "我会给每个批次输出放行、延迟或拦截的明确原因。"
  },
  "Outreach Agent": {
    title: "平台触达执行台",
    overlayTitle: "正在执行首轮触达",
    overlayDetail: "按批准版本发送私信、评论并记录平台回执",
    stores: ["杭州豪车专卖店", "小满的家居日常"],
    message: "我正在按已批准的版本逐条触达，并记录送达和回复结果。",
    reply: "收到，我会遇到异常账号就暂停这一条，并保留平台返回的原因。"
  },
  "Outreach Ops Agent": {
    title: "回复回流队列",
    overlayTitle: "正在监听客户回复",
    overlayDetail: "处理送达回执、失败重试和后续暂停",
    stores: ["杭州豪车专卖店", "小满的家居日常"],
    message: "我正在监听客户回复，命中有效回应后会停止不必要的后续触达。",
    reply: "我会把新回复及时回流给策略师，并同步下一步建议。"
  }
});

function cloudPageFor(agentType) {
  if (ROLE_CLOUD_PAGES[agentType]) {
    const workspacePage = ROLE_WORKSPACE_PAGES[agentType];
    return workspacePage
      ? { ...ROLE_CLOUD_PAGES[agentType], metrics: workspacePage.metrics, rows: workspacePage.rows }
      : ROLE_CLOUD_PAGES[agentType];
  }
  const title = displayAgentTitle({ agentType }) || "Agent 工作台";
  return {
    title,
    overlayTitle: "正在执行当前任务",
    overlayDetail: "实时处理当前业务场景并同步执行结果",
    stores: ["杭州豪车专卖店", "小满的好物小铺"],
    message: `${title}已经接手当前任务，正在通过云电脑持续推进。`,
    reply: "收到，我会继续推进当前任务，并在出现关键结果后同步你。"
  };
}

function hasAcquisitionSnapshot(task, work, events = []) {
  return [task, work].some((value) => value && typeof value === "object" && Object.keys(value).length > 0)
    || (Array.isArray(events) && events.length > 0);
}

function acquisitionEventsFor(task, work) {
  return [
    ...(Array.isArray(task?.events) ? task.events : []),
    ...(Array.isArray(work?.events) ? work.events : []),
    ...(Array.isArray(work?.activities) ? work.activities : [])
  ];
}

function acquisitionStoresFor({ task = null, work = null } = {}) {
  const candidates = [
    task?.stores,
    task?.metadata?.stores,
    work?.stores,
    work?.metadata?.stores
  ];
  return candidates.find((value) => Array.isArray(value) && value.length > 0) || [];
}

function acquisitionErrorFor({ task = null, work = null } = {}) {
  const candidates = [
    task?.lastError,
    task?.error,
    task?.runtimeError,
    work?.lastError,
    work?.error,
    work?.runtimeError,
    task?.metadata?.error,
    work?.metadata?.error
  ];
  const state = String(
    task?.state
      || task?.status
      || task?.acquisitionTaskState
      || work?.state
      || work?.status
      || work?.metadata?.taskState
      || ""
  ).toLowerCase();
  const candidate = candidates.find((value) => value && (typeof value === "string" || typeof value === "object"));
  if (!candidate && !["error", "failed", "blocked"].includes(state)) return null;
  const message = typeof candidate === "string"
    ? candidate
    : candidate?.message || candidate?.detail || candidate?.reason || (candidate ? JSON.stringify(candidate) : "真实任务执行失败");
  return {
    code: typeof candidate === "object" ? candidate.code || null : null,
    message: String(message || "真实任务执行失败")
  };
}

function renderGeneratedCloudScreen(screen, page, snapshot = {}) {
  page = acquisitionCloudPresentationFor(page.agentType, snapshot) || page;
  const generated = el("div", "sb-agent-cloud-generated");
  const browserbar = el("div", "sb-agent-cloud-browserbar");
  browserbar.append(el("i"), document.createTextNode(`cloud.byering.local / ${page.title}`));
  generated.appendChild(browserbar);
  generated.appendChild(el("h4", null, page.title));
  const metrics = Array.isArray(page.metrics)
    ? page.metrics
    : [];
  const grid = el("div", "sb-agent-cloud-grid");
  metrics.slice(0, 3).forEach(([value, label]) => {
    const stat = el("div", "sb-agent-cloud-stat");
    stat.append(el("strong", null, value), el("span", null, label));
    grid.appendChild(stat);
  });
  generated.appendChild(grid);
  const lines = el("div", "sb-agent-cloud-lines");
  const rows = Array.isArray(page.rows)
    ? page.rows
    : [];
  rows.slice(0, 3).forEach(([title, detail, state]) => {
    const line = el("div", "sb-agent-cloud-line");
    line.append(el("span", null, `${title} · ${detail}`), el("em", null, state));
    lines.appendChild(line);
  });
  generated.appendChild(lines);
  screen.appendChild(generated);
}

function renderAgentCloud(body, agentType, currentStatus, task, work, state, onRender) {
  const events = acquisitionEventsFor(task, work);
  const presentation = acquisitionCloudPresentationFor(agentType, { task, work, events });
  const page = { ...cloudPageFor(agentType), ...(presentation || {}), agentType };
  const errorState = presentation?.errorState === true;
  const section = el("section", "sb-agent-cloud");
  section.setAttribute("aria-label", `${page.title}云电脑`);
  const head = el("div", "sb-agent-cloud-head");
  head.appendChild(el("div", "sb-agent-cloud-title", page.title));
  const live = el("span", "sb-agent-cloud-state");
  live.append(el("i"), el("span", null, errorState ? "异常" : TEAM_STATE_LABELS[currentStatus.state] || "实时同步"));
  head.appendChild(live);
  const screen = el("div", "sb-agent-cloud-screen");
  if (page.image && (!isAcquisitionDrawerAgent(agentType) || hasAcquisitionSnapshot(task, work, events))) {
    const image = el("img");
    image.src = page.image;
    image.alt = `${page.title}云电脑实时画面`;
    screen.appendChild(image);
  } else {
    renderGeneratedCloudScreen(screen, page, { task, work, events });
  }
  const overlay = el("div", "sb-agent-cloud-overlay");
  const waitingForData = isAcquisitionDrawerAgent(agentType) && !hasAcquisitionSnapshot(task, work, events) && !errorState;
  overlay.append(
    el("span", null, errorState ? "真实任务异常" : waitingForData ? "等待真实数据" : "云电脑 · 实时工作"),
    el("strong", null, errorState ? page.errorMessage : waitingForData ? "尚未产生真实产出" : task?.title || work?.task || page.overlayTitle)
  );
  if (errorState) overlay.appendChild(el("span", null, page.errorMessage));
  else if (!waitingForData && page.overlayDetail) overlay.appendChild(el("span", null, page.overlayDetail));
  screen.appendChild(overlay);
  const foot = el("div", "sb-agent-cloud-foot");
  foot.appendChild(el("span", null, errorState ? "当前状态 · 需要处理" : waitingForData ? "当前状态 · 等待真实数据" : `当前状态 · ${page.overlayTitle}`));
  const storeNames = Array.isArray(page.stores) ? page.stores : [];
  const currentStore = state.store || storeNames[0] || null;
  if (currentStore) {
    const store = el("div", "sb-agent-cloud-store");
    const storeButton = el("button", "sb-agent-cloud-store-button", currentStore);
    storeButton.type = "button";
    storeButton.setAttribute("aria-expanded", state.storeOpen ? "true" : "false");
    storeButton.addEventListener("click", () => { state.storeOpen = !state.storeOpen; onRender(); });
    store.appendChild(storeButton);
    if (state.storeOpen) {
      const menu = el("div", "sb-agent-cloud-store-menu");
      storeNames.forEach((name) => {
        const option = el("button", null, name);
        option.type = "button";
        option.addEventListener("click", () => { state.store = name; state.storeOpen = false; onRender(); });
        menu.appendChild(option);
      });
      store.appendChild(menu);
    }
    foot.appendChild(store);
  }
  section.append(head, screen, foot);
  body.appendChild(section);
}

function renderAgentConversation(body, agentType, headName, state, onRender, { gateway = null, projectId = null, task = null, work = null, refreshConversation = null } = {}) {
  const section = el("section", "sb-agent-chat");
  section.setAttribute("aria-label", `${headName}对话`);
  section.dataset.state = state.sending || state.conversationLoadInFlight ? "loading" : "ready";
  if (isAcquisitionDrawerAgent(agentType)) {
    const context = acquisitionDrawerContext(agentType, { task, work });
    const taskState = task?.acquisitionTaskState || task?.status || work?.metadata?.taskState || work?.taskState || "";
    const actionBar = el("div", "sb-proactive-actions");
    actionBar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;";
    for (const item of acquisitionDrawerActions({ taskState, hasTask: Boolean(task || work) })) {
      const button = el("button", "sb-action-btn", item.label);
      button.type = "button";
      button.disabled = item.disabled;
      button.addEventListener("click", async () => {
        if (item.action === "realtime") {
          openRealtimeDestination(agentType);
          return;
        }
        if (!gateway?.action || !context.taskId) return;
        const action = item.action === "stop" ? "task.cancel" : `task.${item.action}`;
        button.disabled = true;
        try { await gateway.action(action, acquisitionDrawerActionPayload(agentType, item.action, context)); }
        catch { button.disabled = false; }
      });
      actionBar.appendChild(button);
    }
    section.appendChild(actionBar);
  }
  section.appendChild(el("div", "sb-agent-chat-time", state.conversationLoadInFlight ? "正在打开对话" : "对话"));

  const messages = normalizeAgentConversationMessages(state.remoteMessages);
  if (!state.conversationLoaded) {
    section.appendChild(el("div", "sb-agent-chat-empty", gateway?.action ? "正在打开这段对话…" : "对话连接尚未就绪，恢复后可以继续聊。"));
  } else if (!messages.length) {
    section.appendChild(el("div", "sb-agent-chat-empty", "还没有对话，你可以直接告诉我下一步。"));
  } else {
    messages.forEach((message) => {
      const key = message.id || `${message.role}:${message.text}`;
      const isNew = !state.renderedMessageKeys.has(key);
      state.renderedMessageKeys.add(key);
      const row = el("div", `sb-agent-chat-message${message.role === "user" ? " is-user" : ""}${isNew ? " is-new" : ""}`);
      if (message.role !== "user") {
        const avatar = el("div", "sb-agent-chat-avatar", avatarInitial(headName));
        mountAgentAvatar(avatar, agentType, { alt: headName });
        row.appendChild(avatar);
      }
      row.appendChild(el("div", "sb-agent-chat-bubble", message.text));
      section.appendChild(row);
    });
  }

  if (state.sendError) section.appendChild(el("div", "sb-agent-chat-error", state.sendError));
  const compose = el("div", "sb-agent-chat-compose");
  const input = el("input", "sb-agent-chat-input");
  input.type = "text";
  input.value = state.draft || "";
  input.placeholder = `给${headName}留言...`;
  input.setAttribute("aria-label", `给${headName}留言`);
  const send = el("button", "sb-agent-chat-send", state.sending ? "" : "↑");
  send.type = "button";
  send.setAttribute("aria-label", state.sending ? "发送中" : "发送消息");
  send.setAttribute("aria-busy", state.sending ? "true" : "false");
  const updateSendState = () => {
    state.draft = input.value;
    send.disabled = state.sending || !input.value.trim() || !gateway?.action;
  };
  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text || state.sending) return;
    state.draft = text;
    state.sendError = "";
    if (!gateway?.action) {
      state.sendError = "对话连接尚未就绪，这条消息还在输入框里，请稍后重试。";
      onRender();
      return;
    }
    state.sending = true;
    onRender();
    try {
      const result = await gateway.action("dm.message.send", {
        agentType,
        projectId,
        from: "user",
        fromName: "我",
        text,
        metadata: specialistConversationMetadata(acquisitionDrawerContext(agentType, { task, work })),
        ...acquisitionDrawerContext(agentType, { task, work })
      });
      if (result?.accepted === false || result?.ok === false) {
        throw new Error(result?.message || "消息未被网关接受");
      }
      const saved = result?.data?.message || result?.message;
      if (saved) state.remoteMessages = [...state.remoteMessages, saved];
      state.conversationLoaded = true;
      state.draft = "";
      await refreshConversation?.({ render: false });
    } catch (error) {
      state.sendError = error?.message || "这条消息没发出去，内容还在输入框里。";
    } finally {
      state.sending = false;
      onRender();
    }
  };
  input.addEventListener("input", updateSendState);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); void sendMessage(); }
  });
  send.addEventListener("click", () => { void sendMessage(); });
  compose.append(input, send);
  updateSendState();
  section.appendChild(compose);
  body.appendChild(section);
}

export function chiefOptionsForSnapshot(snapshot = {}) {
  void snapshot;
  return [
    { label: "查看所有 Agent 状态", action: "realtime" },
    { label: "查看潜客与数据", action: "prospects" },
    { label: "打开幕僚长对话", action: "chat" }
  ];
}

function openChiefDestination(action) {
  const frameworkPromise = globalThis.__SALEBUDDY__?.navFrameworkReady;
  if (action === "realtime") {
    frameworkPromise?.then?.((framework) => framework?.openRealtimeWork?.());
    return;
  }
  if (action === "prospects") {
    frameworkPromise?.then?.((framework) => framework?.openProspects?.());
    return;
  }
}

function openRealtimeDestination(agentType) {
  const frameworkPromise = globalThis.__SALEBUDDY__?.navFrameworkReady;
  closeAgentDrawer();
  frameworkPromise?.then?.((framework) => framework?.openRealtimeWork?.({ selectedAgentId: agentType }));
}

export function openAgentDrawer(agentType, profile, status, { teamLive, gateway: initialGateway = null, projectId = null, projectName = null, onChat = null } = {}) {
  ensureStyle();
  closeAgentDrawer();
  let gateway = initialGateway;
  const safeProfile = contextualProfile(agentType, profile || profileFallback(agentType));
  let currentStatus = status || teamLive?.getStatusOf?.(agentType) || { state: TEAM_STATES.IDLE };

  const mask = el("div", "sb-drawer-mask");
  const drawer = el("div", "sb-drawer");
  const host = findOfficeRightPanel();
  const inline = Boolean(host && isUsableOfficeRightPanel(host));
  const chiefMode = agentType === "main";
  if (chiefMode) drawer.classList.add("sb-chief-dialogue");
  if (inline) {
    host.classList.add("sb-progress-host");
    host.dataset.sbProgressHost = "1";
    drawer.classList.add("sb-drawer-inline");
  }
  drawer.setAttribute("role", "dialog");
  const headName = displayAgentName({ agentType, identity: safeProfile.identity });
  const headTitle = displayAgentTitle({ agentType, identity: safeProfile.identity, role: safeProfile.role });
  const cloudPage = cloudPageFor(agentType);
  const agentState = {
    store: isAcquisitionDrawerAgent(agentType) ? null : cloudPage.stores[0],
    storeOpen: false,
    remoteMessages: [],
    conversationLoaded: false,
    conversationLoadInFlight: false,
    conversationPollTimer: null,
    renderedMessageKeys: new Set(),
    draft: "",
    sending: false,
    sendError: ""
  };
  drawer.setAttribute("aria-label", chiefMode ? `${headName}对话` : `${headName}工作进展`);

  const head = el("div", "sb-drawer-head");
  const headAvatar = el("div", `sb-agent-avatar${agentType === "main" ? " sb-main" : ""}`, avatarInitial(headName));
  mountAgentAvatar(headAvatar, agentType, { alt: headName });
  head.appendChild(headAvatar);
  const headText = el("div");
  headText.style.minWidth = "0";
  headText.appendChild(el("div", "sb-drawer-name", headName));
  const titleRow = el("div", "sb-drawer-title");
  titleRow.appendChild(document.createTextNode(headTitle));
  const live = el("span", `sb-drawer-live ${statusClass(currentStatus.state)}`);
  live.appendChild(el("i"));
  live.appendChild(document.createTextNode(chiefMode ? "在线" : TEAM_STATE_LABELS[currentStatus.state] || "空闲"));
  titleRow.appendChild(live);
  headText.appendChild(titleRow);
  const closeBtn = el("button", "sb-drawer-close", "✕");
  closeBtn.setAttribute("aria-label", "关闭员工详情");
  head.append(headText, closeBtn);

  const body = el("div", "sb-drawer-body");
  const chiefDialogue = {
    messages: [],
    remoteMessages: [],
    remoteLoaded: false,
    remoteLoadInFlight: false,
    remotePollTimer: null,
    lastSignature: null,
    lastSnapshot: null,
    selectedAction: null,
    draft: "",
    sending: false,
    phase: "",
    sendError: ""
  };

  async function refreshAgentConversation({ render = true } = {}) {
    if (chiefMode || !gateway?.action || agentState.conversationLoadInFlight) return;
    agentState.conversationLoadInFlight = true;
    if (render && drawer.isConnected) renderBody();
    try {
      const result = await gateway.action("dm.message.list", {
        agentType,
        ...(isAcquisitionDrawerAgent(agentType) ? acquisitionDrawerContext(agentType, {
          task: taskForAgent(agentType, projectId),
          work: getWorkForProject(agentType, projectId)
        }) : {})
      });
      const messages = result?.data?.messages || result?.messages || [];
      agentState.remoteMessages = normalizeAgentConversationMessages(messages);
      agentState.conversationLoaded = true;
      agentState.sendError = "";
      if (render && drawer.isConnected) renderBody();
    } catch (error) {
      agentState.sendError = error?.message || "对话记录暂时无法读取";
    } finally {
      agentState.conversationLoadInFlight = false;
    }
  }

  function pushChiefMessage(text, role = "assistant") {
    if (!text) return;
    chiefDialogue.messages.push({ text, role, time: new Date() });
    if (chiefDialogue.messages.length > 12) chiefDialogue.messages = chiefDialogue.messages.slice(-12);
  }

  async function refreshChiefConversation({ render = true } = {}) {
    if (!chiefMode || !gateway?.action || chiefDialogue.remoteLoadInFlight) return;
    chiefDialogue.remoteLoadInFlight = true;
    try {
      const result = await gateway.action("dm.message.list", chiefDmPayload());
      const messages = normalizeChiefMessages(result?.data?.messages || []);
      chiefDialogue.remoteMessages = messages;
      chiefDialogue.remoteLoaded = true;
      // Once the durable conversation is available, discard the temporary
      // first-paint greeting so office and member views cannot diverge.
      if (messages.length) chiefDialogue.messages = [];
      if (render && drawer.isConnected) renderBody();
    } catch {
      // The office view remains usable with its local status fallback.
    } finally {
      chiefDialogue.remoteLoadInFlight = false;
    }
  }

  async function persistChiefMessage(text, { from = "user", fromName = "我", metadata = {}, clientMessageId = null } = {}) {
    const value = String(text || "").trim();
    if (!value || !gateway?.action) return false;
    const result = await gateway.action("dm.message.send", chiefDmPayload({
      from,
      fromName,
      text: value,
      ...(clientMessageId ? { clientMessageId } : {}),
      metadata: { source: "chief-conversation", entry: inline ? "office" : "drawer", ...metadata }
    }));
    if (result?.accepted === false || result?.ok === false) throw new Error(result?.message || "幕僚长消息未被网关接受");
    return result?.data?.message || result?.message || null;
  }

  async function sendChiefTurn(text) {
    const value = String(text || "").trim();
    if (!value || chiefDialogue.sending || !gateway?.action) return false;
    const clientMessageId = globalThis.crypto?.randomUUID?.() || `chief-message-${Date.now()}`;
    chiefDialogue.sending = true;
    chiefDialogue.phase = "thinking";
    chiefDialogue.sendError = "";
    pushChiefMessage(value, "user");
    renderBody();
    try {
      await persistChiefMessage(value, {
        clientMessageId,
        metadata: { suppressAutoReply: true }
      });
      chiefDialogue.draft = "";
      await refreshChiefConversation();

      const routed = await gateway.action("chief.message.decide", { message: value });
      const routedData = routed?.data || routed || {};
      const decision = routedData.decision || {};
      let responseText = routedData.message;

      await persistChiefMessage(responseText || "我还需要你补充一点信息后才能继续。", {
        from: CHIEF_AGENT_TYPE,
        fromName: headName,
        metadata: {
          chiefDecision: {
            ...decision,
            taskTitle: null,
            statusText: decision.intent === "status_query"
              ? `执行中 ${routedData?.overview?.running || 0} · 等待处理 ${routedData?.overview?.waiting || 0} · 阻塞 ${routedData?.overview?.blocked || 0}`
              : null
          }
        }
      });
      await refreshChiefConversation();
      return true;
    } catch (error) {
      const message = `这次没有执行成功：${error?.message || "服务暂时不可用"}`;
      try {
        await persistChiefMessage(message, {
          from: CHIEF_AGENT_TYPE,
          fromName: headName,
          metadata: { chiefDecision: { responseMode: "recovery_card", errorCode: error?.code || "CHIEF_MESSAGE_FAILED" } }
        });
        await refreshChiefConversation();
      } catch {
        chiefDialogue.sendError = message;
      }
      return false;
    } finally {
      chiefDialogue.sending = false;
      chiefDialogue.phase = "";
      if (drawer.isConnected) renderBody();
    }
  }

  async function runChiefOption(option) {
    chiefDialogue.selectedAction = option.action;
    if (option.action === "chat") {
      closeAgentDrawer();
      onChat?.("main");
      return;
    }
    if (["realtime", "prospects"].includes(option.action)) {
      openChiefDestination(option.action);
      return;
    }
    await sendChiefTurn(option.label);
  }

  function renderChiefDialogue() {
    const snapshot = chiefSnapshot(projectId, currentStatus, teamLive);
    chiefDialogue.lastSignature = snapshot.signature;
    chiefDialogue.lastSnapshot = snapshot;

    body.className = "sb-chief-body";
    body.textContent = "";
    const overview = el("section", "sb-chief-overview");
    overview.setAttribute("aria-label", "全局运行总览");
    const overviewHead = el("div", "sb-chief-overview-head");
    overviewHead.appendChild(el("div", "sb-chief-overview-kicker", "全局运行总览"));
    overviewHead.appendChild(el("div", "sb-chief-overview-count", snapshot.roster.length ? `${snapshot.roster.length} 位 Agent` : "暂无 Agent"));
    overview.appendChild(overviewHead);
    const overviewTask = snapshot.title;
    overview.appendChild(el("div", "sb-chief-overview-task", overviewTask));
    const overviewMeta = el("div", "sb-chief-overview-meta");
    overviewMeta.appendChild(el("span", null, `工作中 ${snapshot.workingCount} 位`));
    overviewMeta.appendChild(el("span", null, `待处理 ${snapshot.counts.waiting}`));
    overviewMeta.appendChild(el("span", null, `已阻塞 ${snapshot.counts.blocked}`));
    overviewMeta.appendChild(el("span", null, `已完成 ${snapshot.counts.completed}`));
    overview.appendChild(overviewMeta);
    if (snapshot.roster.length) {
      const team = el("div", "sb-chief-team");
      team.appendChild(el("div", "sb-chief-team-label", "Agent 状态"));
      const avatars = el("div", "sb-chief-team-avatars");
      snapshot.roster.slice(0, 6).forEach((agent) => {
        const avatar = el("div", "sb-chief-team-avatar", avatarInitial(agent.name));
        mountAgentAvatar(avatar, agent.type, { alt: agent.name });
        avatar.title = `${agent.name} · ${agent.stage}`;
        avatars.appendChild(avatar);
      });
      team.appendChild(avatars);
      if (snapshot.roster.length > 6) team.appendChild(el("div", "sb-chief-team-more", `+${snapshot.roster.length - 6}`));
      overview.appendChild(team);
    }
    body.appendChild(overview);
    const feed = el("div", "sb-chief-feed");
    const visibleMessages = chiefDialogue.remoteMessages.length
      ? [...chiefDialogue.remoteMessages, ...chiefDialogue.messages]
      : chiefDialogue.messages;
    if (!visibleMessages.length) {
      feed.appendChild(el("div", "sb-chief-empty", snapshot.active
        ? "上方展示的是全局真实状态。你可以查询数据，或控制一个已经存在的任务。"
        : "还没有对话。你可以问谁在工作、哪些任务卡住，或查看已有数据。"));
    } else {
      for (const message of visibleMessages) {
        const row = el("div", `sb-chief-message${message.role === "user" ? " is-user" : ""}`);
        if (message.role !== "user") {
          const avatar = el("span", "sb-chief-avatar");
          mountAgentAvatar(avatar, "main", { alt: headName });
          row.appendChild(avatar);
        }
        const bubble = el("div", "sb-chief-bubble", message.text);
        row.appendChild(bubble);
        feed.appendChild(row);
      }
    }
    if (chiefDialogue.phase === "thinking") {
      const thinking = el("div", "sb-chief-thinking", "正在梳理下一步");
      thinking.setAttribute("aria-live", "polite");
      const dots = el("span", "sb-chief-thinking-dots");
      dots.setAttribute("aria-hidden", "true");
      dots.append(el("i"), el("i"), el("i"));
      thinking.appendChild(dots);
      feed.appendChild(thinking);
    }
    if (chiefDialogue.sendError) feed.appendChild(el("div", "sb-agent-chat-error", chiefDialogue.sendError));
    feed.scrollTop = feed.scrollHeight;
    body.appendChild(feed);

    const optionsForSnapshot = chiefOptionsForSnapshot(snapshot);
    if (optionsForSnapshot.length) {
      const options = el("section", "sb-chief-options");
      options.appendChild(el("div", "sb-chief-options-title", "快捷查看"));
      const list = el("div", "sb-chief-option-list");
      for (const option of optionsForSnapshot) {
        const button = el("button", "sb-chief-option", option.label);
        button.type = "button";
        button.disabled = chiefDialogue.sending;
        button.addEventListener("click", () => { void runChiefOption(option); });
        list.appendChild(button);
      }
      options.appendChild(list);
      body.appendChild(options);
    }
    const quickActions = el("div", "sb-drawer-quick-actions");
    const progress = el("button", "sb-drawer-quick-action is-primary", "查看全部状态");
    progress.type = "button";
    progress.addEventListener("click", () => openRealtimeDestination("main"));
    const chat = el("button", "sb-drawer-quick-action", "沟通");
    chat.type = "button";
    chat.disabled = typeof onChat !== "function";
    chat.addEventListener("click", () => { closeAgentDrawer(); onChat?.("main"); });
    quickActions.append(progress, chat);
    body.appendChild(quickActions);

    const compose = el("form", "sb-chief-compose");
    const input = el("input");
    input.type = "text";
    input.value = chiefDialogue.draft;
    input.placeholder = "例如：谁在工作？潜客数据怎么样？该用哪个 Agent？";
    input.setAttribute("aria-label", "发送给幕僚长");
    const send = el("button", null, chiefDialogue.sending ? "发送中" : "发送");
    send.type = "submit";
    send.disabled = chiefDialogue.sending || !input.value.trim();
    input.addEventListener("input", () => {
      chiefDialogue.draft = input.value;
      send.disabled = chiefDialogue.sending || !input.value.trim();
    });
    compose.append(input, send);
    compose.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || send.disabled) return;
      chiefDialogue.draft = text;
      chiefDialogue.sendError = "";
      if (!gateway?.action) {
        chiefDialogue.sendError = "对话连接尚未就绪，这条消息还在输入框里，请稍后重试。";
        renderBody();
        return;
      }
      try {
        await sendChiefTurn(text);
      } finally { if (drawer.isConnected) renderBody(); }
    });
    body.appendChild(compose);
  }

  function renderBody() {
    if (chiefMode) {
      renderChiefDialogue();
      return;
    }
    const work = getWorkForProject(agentType, projectId);
    const task = taskForAgent(agentType, projectId);
    body.textContent = "";
    renderAgentCloud(body, agentType, currentStatus, task, work, agentState, renderBody);
    renderAgentConversation(body, agentType, headName, agentState, renderBody, {
      gateway,
      projectId,
      task,
      work,
      refreshConversation: refreshAgentConversation
    });
    // Non-chief agents share one operating surface: cloud computer first, conversation second.
  }
  renderBody();
  if (!chiefMode && gateway?.action) {
    void refreshAgentConversation();
    agentState.conversationPollTimer = window.setInterval(() => { void refreshAgentConversation(); }, 2200);
  }
  if (chiefMode && gateway?.action) {
    void refreshChiefConversation();
    chiefDialogue.remotePollTimer = window.setInterval(() => { void refreshChiefConversation(); }, 2200);
  }

  closeBtn.addEventListener("click", closeAgentDrawer);
  mask.addEventListener("click", closeAgentDrawer);
  drawer.append(head, body);
  if (inline) {
    host.appendChild(drawer);
    document.body.appendChild(mask);
  } else {
    document.body.append(mask, drawer);
  }
  drawerEls = inline ? [host, mask, drawer] : [mask, drawer];
  const refreshStatus = () => {
    if (!drawer.isConnected) return;
    currentStatus = teamLive?.getStatusOf?.(agentType) || currentStatus;
    const live = head.querySelector(".sb-drawer-live");
    if (live) {
      live.className = `sb-drawer-live ${statusClass(currentStatus.state)}`;
      live.lastChild.textContent = chiefMode ? "在线" : TEAM_STATE_LABELS[currentStatus.state] || "空闲";
    }
    renderBody();
  };
  const unsubscribeTeam = teamLive?.subscribe?.(refreshStatus) || (() => {});
  const unsubscribeWork = subscribeWork((changed) => {
    if (changed === null || changed === agentType) refreshStatus();
  });
  const unsubscribeTasks = subscribeTasks(() => refreshStatus());
  drawerCleanup = () => {
    unsubscribeTeam();
    unsubscribeWork();
    unsubscribeTasks();
    if (agentState.conversationPollTimer) window.clearInterval(agentState.conversationPollTimer);
    if (chiefDialogue.remotePollTimer) window.clearInterval(chiefDialogue.remotePollTimer);
  };
  return { close: closeAgentDrawer };
}
