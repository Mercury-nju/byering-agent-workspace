/**
 * ui/kanban.js
 * 「自动任务」→「看板」：运行时把原生侧边栏「自动任务」行的文案改为「看板」，
 * 并接管其点击（capture 阶段拦截，不触发原生页面），打开 SaleBuddy 数据看板页。
 * 看板内容：项目组（群聊）→ 该组统一结果看板
 * （核心结果 + 业务明细 + 近 14 天序列图 + 产出文件 + 在制工作状态）。
 * 底部保留「任务动态」条：点击任务重开该任务对话（沿用任务 id，不新建条目）。
 * 原生节点不改结构，仅改可见文案；行被 React 重渲染替换时轮询补挂。
 */
import { el, openPage } from "./pages.js";
import { addTask, listTasks, subscribe as subscribeTasks } from "../agents/task-store.js";
import { chartSeriesSummary, projectRecordMatches, projectResultDashboard } from "../agents/metrics-store.js";
import { reopenTaskConversation } from "./task-runner.js";
import { openFileCenterPage } from "./file-center.js";
import { avatarInitial } from "./agent-drawer.js";
import { mountAgentAvatar, mountGroupAvatar } from "./agent-avatar.js";
import { createSnapshotScreen } from "./cloud-desktop.js";
import { NAV_EVENT, isNavigationRuntimeMounted } from "./nav-framework.js";
import {
  SEED_SALES_ROOM,
  addBoardColumn,
  addBoardTask,
  addCanvasAnnotation,
  addCanvasRun,
  createDefaultBoardConfig,
  createDefaultCanvas,
  moveBoardColumn,
  normalizeBoardConfig,
  readBoardConfig,
  removeBoardColumn,
  removeBoardConfig,
  removeCanvasWidget,
  removeBoardTask,
  suggestBoardConfig,
  updateBoardTask,
  updateCanvasPlacement,
  writeBoardConfig
} from "../agents/kanban-store.js";

const CSS = `
.sb-dash{height:100%;overflow-y:auto;padding:20px 24px 28px;box-sizing:border-box}
.sb-dash-hero{display:flex;align-items:flex-end;gap:18px;margin:2px 0 20px}
.sb-dash-hero-copy{flex:1;min-width:0}
.sb-dash-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;color:#8A8F99;text-transform:uppercase}
.sb-dash-title{font-size:24px;font-weight:700;color:#1F2329;line-height:1.25;margin-top:5px}
.sb-dash-subtitle{font-size:12.5px;color:#8A8F99;line-height:1.6;margin-top:6px}
.sb-dash-count{flex:none;border:1px solid rgba(15,15,15,.08);background:#fff;border-radius:999px;padding:7px 12px;font-size:11.5px;color:#5A5E66}
.sb-project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.sb-project-card{appearance:none;width:100%;border:1px solid rgba(15,15,15,.07);background:#fff;border-radius:18px;padding:18px;text-align:left;font:inherit;color:inherit;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;min-height:196px;display:flex;flex-direction:column}
.sb-project-card:hover{transform:translateY(-2px);border-color:rgba(15,15,15,.13);box-shadow:0 12px 30px rgba(22,27,35,.08)}
.sb-project-card:focus-visible{outline:2px solid #3B6BD4;outline-offset:3px}
.sb-project-head{display:flex;align-items:flex-start;gap:12px}
.sb-project-icon{width:42px;height:42px;border-radius:13px;flex:none;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;background:#1F2329;overflow:hidden}
.sb-project-main{flex:1;min-width:0}
.sb-project-name{font-size:15px;font-weight:700;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-project-goal{font-size:12px;color:#8A8F99;line-height:1.55;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-project-status{flex:none;display:flex;align-items:center;gap:5px;border-radius:999px;padding:4px 8px;background:#EDF7EF;color:#39834A;font-size:10.5px;font-weight:600}
.sb-project-status::before{content:"";width:5px;height:5px;border-radius:50%;background:#57B26A}
.sb-project-status.sb-closed{background:#F0F1F3;color:#8A8F99}
.sb-project-status.sb-closed::before{background:#B0B4BB}
.sb-project-last{font-size:11.5px;color:#5A5E66;line-height:1.55;margin-top:15px;padding:10px 11px;background:#F7F8FA;border-radius:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-project-foot{display:flex;align-items:center;gap:10px;margin-top:auto;padding-top:16px}
.sb-project-avatars{display:flex;align-items:center;padding-left:3px}
.sb-project-avatar{width:25px;height:25px;border-radius:50%;margin-left:-4px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;background:#657594;font-size:9px;font-weight:700;overflow:hidden}
.sb-project-meta{font-size:11px;color:#8A8F99}
.sb-project-go{margin-left:auto;font-size:12px;font-weight:600;color:#1F2329}
.sb-dash-state{border:1px dashed rgba(15,15,15,.12);background:#FAFAFA;border-radius:16px;text-align:center;padding:64px 24px;color:#8A8F99;font-size:13px;line-height:1.7;white-space:pre-line}
.sb-dash-sec-head{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
.sb-dash-sec-title{font-size:13px;font-weight:600;color:#1F2329}
.sb-dash-sec-desc{font-size:11.5px;color:#B0B4BB}
.sb-dash-dot{width:6px;height:6px;border-radius:50%;flex:none;background:#B0B4BB}
.sb-dash-tasks{margin-top:24px}
.sb-dash-task-row{display:flex;gap:8px;flex-wrap:wrap}
.sb-dash-task{appearance:none;border:none;display:flex;align-items:center;gap:7px;background:#F0F1F3;border-radius:10px;padding:8px 12px;font:inherit;font-size:12px;color:#1F2329;cursor:pointer;max-width:320px}
.sb-dash-task:hover{box-shadow:0 2px 8px rgba(15,15,15,0.08)}
.sb-dash-task:focus-visible{outline:2px solid #3B6BD4;outline-offset:2px}
.sb-dash-task-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dash-task-runtime{font-size:10px;color:#7D8794;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dash-task-empty{font-size:12px;color:#B0B4BB}
.sb-result-action-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:15px}.sb-result-action{appearance:none;border:1px solid rgba(16,20,25,.13);background:rgba(255,255,255,.78);color:#315F8A;border-radius:8px;padding:7px 10px;font:650 10px/1.1 inherit;cursor:pointer}.sb-result-action:hover{background:#fff;border-color:rgba(22,139,255,.45);transform:translateY(-1px)}.sb-result-action:focus-visible{outline:2px solid var(--result-blue);outline-offset:3px}.sb-result-action::before{content:"↗";margin-right:5px}.sb-mb-view.sb-view-theme-ink .sb-result-action{background:#1D2A34;border-color:#42515D;color:#A9DFFF}.sb-mb-view.sb-view-theme-ink .sb-result-action:hover{background:#263742}
/* ── Project result board ── */
.sb-mb-view{--result-blue:#168BFF;--result-sky:#8FD3FF;--result-ink:#101419;--result-paper:#FBFBF9;font-family:"Avenir Next","PingFang SC","Hiragino Sans GB",sans-serif;background:var(--result-paper)}
.sb-mb-view.sb-view-theme-ink{--result-paper:#101419;--result-ink:#F4F7F9;background:#101419;color:#F4F7F9}.sb-mb-view.sb-view-theme-ink .sb-board-toolbar{border-color:rgba(255,255,255,.13)}.sb-mb-view.sb-view-theme-ink .sb-board-toolbar-title{color:#F4F7F9}.sb-mb-view.sb-view-theme-ink .sb-board-action{background:#1B232B;border-color:#33404B;color:#F4F7F9}.sb-mb-view.sb-view-theme-ink .sb-result-proof{background:#182129;border-color:#33404B}.sb-mb-view.sb-view-theme-ink .sb-result-proof-label,.sb-mb-view.sb-view-theme-ink .sb-result-card-kicker{color:#AAB7C1}.sb-mb-view.sb-view-theme-ink .sb-result-proof-value{color:#F4F7F9}.sb-mb-view.sb-view-theme-paper{--result-paper:#F3EEE5;--result-ink:#29251F;background:#F3EEE5}.sb-mb-view.sb-view-accent-green{--result-blue:#2D9D62;--result-sky:#A9E1C0}.sb-mb-view.sb-view-accent-orange{--result-blue:#D8792B;--result-sky:#F3C28F}.sb-mb-view.sb-view-layout-grid .sb-result-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-mb-view.sb-view-layout-grid .sb-result-files{grid-column:1/-1}.sb-mb-view.sb-view-layout-focus .sb-result-hero{grid-template-columns:1fr}.sb-mb-view.sb-view-layout-focus .sb-result-breakdown{margin-top:10px}.sb-mb-view.sb-view-layout-focus .sb-result-grid{grid-template-columns:1fr}.sb-mb-view.sb-view-density-compact .sb-result-card{min-height:180px}.sb-mb-view.sb-view-density-compact .sb-result-primary,.sb-mb-view.sb-view-density-compact .sb-result-proof,.sb-mb-view.sb-view-density-compact .sb-result-files{padding:15px 17px}.sb-mb-view.sb-view-density-compact .sb-result-record,.sb-mb-view.sb-view-density-compact .sb-result-proof-row{padding:8px 0}.sb-mb-view.sb-view-theme-ink .sb-result-hero{background:#182129;border-color:#33404B}.sb-mb-view.sb-view-theme-ink .sb-result-breakdown{background:#111A22;border-color:#33404B}.sb-mb-view.sb-view-theme-ink .sb-result-breakdown-title,.sb-mb-view.sb-view-theme-ink .sb-result-breakdown-value{color:#F4F7F9}.sb-mb-view.sb-view-theme-ink .sb-result-breakdown-label{color:#AAB7C1}.sb-mb-view.sb-view-theme-ink .sb-result-context{color:#AAB7C1}
.sb-mb-back{appearance:none;border:0;background:none;font:600 11px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.05em;color:#7E858E;cursor:pointer;padding:4px 0 12px;transition:color .16s ease,transform .16s ease}
.sb-mb-back:hover{color:var(--result-ink);transform:translateX(-2px)}
.sb-mb-back:focus-visible,.sb-mb-cloudbtn:focus-visible,.sb-mb-actlink:focus-visible{outline:2px solid var(--result-blue);outline-offset:3px}
.sb-result-hero{position:relative;min-height:250px;border:1px solid rgba(16,20,25,.09);border-radius:20px;background:#fff;overflow:hidden;padding:28px 32px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,.9fr) minmax(340px,1.1fr);gap:42px;align-items:stretch;animation:sb-result-rise .48s cubic-bezier(.2,.75,.25,1) both}
.sb-result-hero::after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(22,139,255,.1) 1px,transparent 1px);background-size:14px 14px;mask-image:linear-gradient(90deg,transparent 42%,#000 78%);pointer-events:none}
.sb-result-copy{position:relative;z-index:2;display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.sb-result-person{display:flex;align-items:center;gap:10px}
.sb-mb-avatar{width:36px;height:36px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;background:var(--result-ink);overflow:hidden}
.sb-result-person-copy{min-width:0}
.sb-mb-name{font-size:13px;font-weight:700;color:var(--result-ink);line-height:1.25}
.sb-mb-headline{font:500 10px/1.4 "SFMono-Regular",Consolas,monospace;color:#8A9199;letter-spacing:.06em;margin-top:2px;text-transform:uppercase}
.sb-result-hero-label{font-size:15px;font-weight:700;color:#5F6872;margin-top:28px}
.sb-result-hero-value{font-size:clamp(62px,7vw,92px);font-weight:800;letter-spacing:-.075em;color:var(--result-ink);line-height:.9;margin-top:10px}
.sb-result-hero-value small{font-size:18px;font-weight:700;letter-spacing:0;margin-left:9px;color:#39434D}
.sb-result-hero-delta{font:650 11px/1.2 "SFMono-Regular",Consolas,monospace;color:var(--result-blue);margin-top:15px}
.sb-result-context{font-size:12px;color:#7E858E;line-height:1.55;margin-top:auto;padding-top:20px}
.sb-result-context::before{content:"";display:inline-block;width:7px;height:7px;background:var(--result-blue);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);margin-right:8px}
.sb-result-breakdown{position:relative;z-index:2;align-self:center;background:rgba(248,250,252,.92);border:1px solid rgba(16,20,25,.07);border-radius:15px;padding:18px 20px}
.sb-result-breakdown-title{font-size:12px;font-weight:750;color:var(--result-ink);margin-bottom:9px}
.sb-result-breakdown-row{padding:10px 0;border-top:1px solid rgba(16,20,25,.07)}
.sb-result-breakdown-row:first-of-type{border-top:0}
.sb-result-breakdown-meta{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:baseline}
.sb-result-breakdown-label{font-size:11px;color:#59636D}
.sb-result-breakdown-value{font:750 13px/1 "Avenir Next","PingFang SC",sans-serif;color:var(--result-ink)}
.sb-result-breakdown-value small{font-size:9px;color:#8A9199;margin-left:2px}
.sb-result-breakdown-ratio{font:600 9px/1 "SFMono-Regular",Consolas,monospace;color:#8A9199;width:27px;text-align:right}
.sb-result-breakdown-track{height:4px;background:#E7EBEF;border-radius:999px;overflow:hidden;margin-top:7px}
.sb-result-breakdown-fill{display:block;height:100%;background:var(--result-blue);border-radius:inherit}
.sb-result-grid{display:grid;grid-template-columns:1.08fr .92fr 1.08fr;gap:12px;margin-top:12px}
.sb-result-card{min-height:232px;border-radius:18px;box-sizing:border-box;overflow:hidden;animation:sb-result-rise .48s cubic-bezier(.2,.75,.25,1) both}
.sb-result-primary{position:relative;background:var(--result-sky);padding:20px 22px;color:#09213A;animation-delay:.05s}
.sb-result-kicker,.sb-result-card-kicker,.sb-result-trend-kicker{font:700 10px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.14em;text-transform:uppercase}
.sb-result-kicker{color:#215D8E}
.sb-result-record-heading{font-size:18px;font-weight:780;letter-spacing:-.035em;color:#09213A;margin-top:11px}
.sb-result-record-list{margin-top:12px}
.sb-result-record{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;padding:10px 0;border-top:1px solid rgba(9,33,58,.15)}
.sb-result-record:first-child{border-top:0}
.sb-result-record-title{font-size:12px;font-weight:750;color:#09213A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-result-record-value{font:700 9px/1.3 "SFMono-Regular",Consolas,monospace;color:#215D8E;white-space:nowrap}
.sb-result-record-meta{font-size:10px;line-height:1.4;color:#35627F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-result-record-status{justify-self:end;font-size:9px;font-weight:700;color:#0B4F7D;background:rgba(255,255,255,.52);border-radius:5px;padding:2px 5px;white-space:nowrap}
.sb-result-proof{border:1px solid rgba(16,20,25,.09);background:#fff;padding:20px 22px;animation-delay:.1s}
.sb-result-card-kicker{color:#9AA0A7}
.sb-result-proof-list{margin-top:16px}
.sb-result-proof-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px;padding:12px 0;border-top:1px solid rgba(16,20,25,.08)}
.sb-result-proof-row:first-child{border-top:0;padding-top:2px}
.sb-result-proof-label{font-size:11px;color:#737A83;line-height:1.45}
.sb-result-proof-value{font:750 22px/1 "Avenir Next","PingFang SC",sans-serif;color:var(--result-ink);letter-spacing:-.035em;white-space:nowrap}
.sb-result-proof-value small{font-size:10px;font-weight:600;color:#8A9199;margin-left:3px;letter-spacing:0}
.sb-result-files{position:relative;background:var(--result-ink);padding:20px 22px;color:#fff;animation-delay:.15s}
.sb-result-files::after{content:"+ + / / ( ) * # ▲\A / + + ( ) # # * /\A + ( / / ) * ▲ #";white-space:pre;position:absolute;right:-5px;bottom:2px;color:rgba(143,211,255,.13);font:700 12px/1.5 "SFMono-Regular",Consolas,monospace;letter-spacing:.08em}
.sb-result-files .sb-result-card-kicker{color:var(--result-sky)}
.sb-result-files-title{font-size:18px;font-weight:750;letter-spacing:-.035em;margin-top:13px}
.sb-result-file-list{position:relative;z-index:1;margin-top:13px}
.sb-mb-file{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 0;border-top:1px solid rgba(255,255,255,.11)}
.sb-mb-file:first-child{border-top:0}
.sb-mb-file-tag{font:700 8px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.08em;color:#10263A;background:var(--result-sky);border-radius:4px;padding:3px 5px}
.sb-mb-file-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;color:#F3F6F8}
.sb-mb-file-at{font:500 9px/1.2 "SFMono-Regular",Consolas,monospace;color:#727C86;white-space:nowrap}
.sb-result-trend{position:relative;background:#0F151B;border-radius:18px;padding:22px;margin-top:12px;overflow:hidden;animation:sb-result-rise .48s .2s cubic-bezier(.2,.75,.25,1) both}
.sb-result-trend::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(143,211,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(143,211,255,.035) 1px,transparent 1px);background-size:20px 20px;pointer-events:none}
.sb-result-trend-head{position:relative;display:flex;align-items:flex-start;gap:18px;margin-bottom:18px}
.sb-result-trend-copy{min-width:0}
.sb-result-trend-kicker{color:var(--result-sky)}
.sb-result-trend-title{font-size:20px;font-weight:750;color:#fff;letter-spacing:-.035em;margin-top:7px}
.sb-result-trend-status{margin-left:auto;max-width:52%;text-align:right}
.sb-mb-live{font-size:11px;color:#D7E1E9;line-height:1.45}
.sb-mb-live::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#FFB743;box-shadow:0 0 0 4px rgba(255,183,67,.12);margin-right:8px;vertical-align:1px}
.sb-mb-idle{font-size:11px;color:#77818B;line-height:1.45}
.sb-mb-cloudbtn{appearance:none;position:relative;margin-top:9px;border:1px solid rgba(255,255,255,.22);background:#fff;color:#111820;border-radius:999px;padding:7px 12px;font:700 10px/1 "SFMono-Regular",Consolas,monospace;cursor:pointer;transition:transform .16s ease,background .16s ease}
.sb-mb-cloudbtn:hover{transform:translateY(-1px);background:var(--result-sky)}
.sb-result-chart-canvas{position:relative;background:#F7F8F8;border-radius:14px;padding:10px 14px 0}
.sb-mb-chart-head{display:flex;align-items:center;gap:14px;padding:8px 6px 0}
.sb-mb-chart-title{font-size:11px;font-weight:650;color:#515A63}
.sb-mb-legend{display:flex;gap:12px;font:500 9px/1.2 "SFMono-Regular",Consolas,monospace;color:#8A9199;align-items:center}
.sb-mb-legend i{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.sb-mb-cloudembed{border:1px solid rgba(16,20,25,.09);background:#fff;border-radius:18px;padding:10px;margin-top:12px;animation:sb-result-rise .28s ease both}
.sb-mb-cloudembed .sb-cloud-screen{height:300px;border-radius:12px;overflow:hidden}
.sb-mb-actlink{appearance:none;border:0;background:none;padding:0;font:inherit;color:var(--result-blue);cursor:pointer}
@keyframes sb-result-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:900px){.sb-project-grid{grid-template-columns:1fr}.sb-result-hero{grid-template-columns:1fr 280px;gap:22px}.sb-result-grid{grid-template-columns:1fr 1fr}.sb-result-files{grid-column:1/-1}.sb-result-files .sb-result-file-list{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}}
@media(max-width:640px){.sb-dash{padding:16px}.sb-result-hero{grid-template-columns:1fr;padding:22px;min-height:0}.sb-result-breakdown{margin-top:6px}.sb-result-hero-value{font-size:68px}.sb-result-grid{grid-template-columns:1fr}.sb-result-files{grid-column:auto}.sb-result-files .sb-result-file-list{display:block}.sb-result-trend-head{display:block}.sb-result-trend-status{max-width:none;text-align:left;margin:14px 0 0}.sb-result-trend{padding:18px}.sb-mb-chart-head{align-items:flex-start;flex-direction:column;gap:7px}.sb-mb-cloudembed .sb-cloud-screen{height:240px}}
@media(prefers-reduced-motion:reduce){.sb-result-hero,.sb-result-card,.sb-result-trend,.sb-mb-cloudembed{animation:none}.sb-mb-back,.sb-mb-cloudbtn{transition:none}}
.sb-refreshing .sb-result-hero,.sb-refreshing .sb-result-card,.sb-refreshing .sb-result-trend,.sb-refreshing .sb-mb-cloudembed{animation:none}
.sb-dash-directory{background:#FAFAFA;min-height:100%;padding:34px 36px 44px}
.sb-directory-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin:0 0 28px}
.sb-directory-title{font-size:34px;font-weight:750;letter-spacing:-.045em;color:#16181B;line-height:1.1}
.sb-directory-subtitle{font-size:17px;color:#73777C;margin-top:12px;line-height:1.45}
.sb-directory-create{appearance:none;border:0;border-radius:14px;background:#17191B;color:#fff;padding:14px 18px;font:650 14px/1.1 inherit;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 8px 18px rgba(23,25,27,.12);transition:transform .16s ease,background .16s ease}
.sb-directory-create:hover{background:#303337;transform:translateY(-1px)}
.sb-directory-create:focus-visible,.sb-board-action:focus-visible,.sb-editor-button:focus-visible,.sb-column-icon:focus-visible,.sb-task-remove:focus-visible{outline:2px solid #3B6BD4;outline-offset:3px}
.sb-directory-create-plus{font-size:22px;font-weight:350;line-height:.7}
.sb-board-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.sb-board-card{appearance:none;border:1px solid #D9DADC;border-radius:24px;background:#fff;padding:24px;text-align:left;font:inherit;color:inherit;cursor:pointer;min-height:350px;display:flex;flex-direction:column;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
.sb-board-card:hover{border-color:#B7B9BC;box-shadow:0 16px 36px rgba(20,24,28,.08);transform:translateY(-2px)}
.sb-board-card:focus-visible{outline:2px solid #3B6BD4;outline-offset:4px}
.sb-board-preview{height:208px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;overflow:hidden}
.sb-board-preview-tile{min-width:0;border:1px solid #D7D9DC;border-radius:14px;padding:13px;background:#F8F9FA;display:flex;flex-direction:column;gap:7px}
.sb-board-preview-tile.sb-preview-blue{background:#8ED0F4;border-color:#8ED0F4}.sb-board-preview-tile.sb-preview-ink{background:#131619;border-color:#131619;color:#fff}.sb-board-preview-tile.sb-preview-green{background:#E2F2E6;border-color:#C9E5D0}
.sb-preview-kicker{font-size:9px;letter-spacing:.08em;color:#7C8288;text-transform:uppercase}.sb-preview-ink .sb-preview-kicker{color:#A7B4BF}.sb-preview-blue .sb-preview-kicker{color:#2B607E}
.sb-preview-value{font-size:24px;font-weight:750;letter-spacing:-.045em;color:#1C2024;line-height:1}.sb-preview-ink .sb-preview-value{color:#fff}.sb-preview-blue .sb-preview-value{color:#09213A}
.sb-preview-label{font-size:10px;color:#6E747A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-preview-ink .sb-preview-label{color:#CBD4DA}.sb-preview-blue .sb-preview-label{color:#215D8E}
.sb-preview-bars{display:flex;align-items:flex-end;gap:4px;height:42px;margin-top:auto}.sb-preview-bars i{display:block;flex:1;min-width:4px;border-radius:3px 3px 1px 1px;background:#5E7180}.sb-preview-blue .sb-preview-bars i{background:#2479A7}.sb-preview-ink .sb-preview-bars i{background:#FF684B}
.sb-board-card-foot{display:flex;align-items:flex-end;gap:12px;margin-top:24px}.sb-board-card-copy{min-width:0;flex:1}.sb-board-card-name{font-size:22px;font-weight:650;letter-spacing:-.035em;color:#17191B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-board-card-tag{display:inline-flex;margin-left:8px;padding:4px 7px;border-radius:6px;background:#F1F2F3;color:#767B80;font-size:10px;font-weight:600;vertical-align:3px}.sb-board-card-meta{font-size:14px;color:#8B9095;margin-top:9px}.sb-board-card-arrow{font-size:22px;color:#8B9095;line-height:1;padding-bottom:2px}
.sb-board-toolbar{display:flex;align-items:center;gap:8px;margin:-4px 0 18px;padding-bottom:16px;border-bottom:1px solid rgba(15,15,15,.08)}.sb-board-toolbar-title{flex:1;min-width:0;font-size:24px;font-weight:720;letter-spacing:-.04em;color:#17191B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-board-action{appearance:none;border:1px solid #DBDDE0;background:#fff;color:#25282B;border-radius:12px;padding:10px 13px;font:600 12px/1.1 inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:border-color .16s ease,background .16s ease}.sb-board-action:hover{background:#F5F6F7;border-color:#B9BDC1}.sb-board-action.sb-board-action-primary{background:#17191B;color:#fff;border-color:#17191B}.sb-board-action.sb-board-action-primary:hover{background:#303337}
.sb-editor{background:#F5F6F7;min-height:100%;padding:26px 30px 36px}.sb-editor-head{display:flex;align-items:flex-end;gap:18px;margin-bottom:20px}.sb-editor-copy{flex:1;min-width:0}.sb-editor-eyebrow{font-size:10px;font-weight:750;letter-spacing:.12em;color:#7D8389;text-transform:uppercase}.sb-editor-title{font-size:25px;font-weight:720;color:#17191B;margin-top:6px}.sb-editor-subtitle{font-size:12px;color:#7D8389;margin-top:6px}.sb-editor-title-input{width:min(560px,100%);border:0;border-bottom:2px solid #25282B;background:transparent;padding:0 0 7px;color:#17191B;font:720 25px/1.2 inherit;outline:none}.sb-editor-button{appearance:none;border:1px solid #D1D4D7;background:#fff;color:#272A2D;border-radius:11px;padding:10px 13px;font:600 12px/1.1 inherit;cursor:pointer}.sb-editor-button:hover{background:#ECEEF0}.sb-editor-button.sb-editor-save{background:#17191B;border-color:#17191B;color:#fff}.sb-editor-actions{display:flex;gap:8px;flex:none}.sb-editor-columns{display:grid;grid-template-columns:repeat(4,minmax(210px,1fr));gap:12px;align-items:start;overflow-x:auto;padding-bottom:8px}.sb-editor-column{min-width:210px;border:1px solid #D9DCDD;border-radius:16px;background:#fff;padding:13px}.sb-editor-column-head{display:flex;align-items:center;gap:7px;margin-bottom:12px}.sb-column-title-input{min-width:0;flex:1;border:0;border-bottom:1px solid #D7D9DC;padding:4px 0;color:#1C2024;background:transparent;font:700 13px/1.2 inherit;outline:none}.sb-column-tools{display:flex;gap:3px}.sb-column-icon{appearance:none;border:0;background:transparent;color:#8A9096;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1}.sb-column-icon:hover{background:#F0F1F2;color:#1C2024}.sb-editor-task{border:1px solid #E0E2E4;border-radius:11px;padding:10px;margin-top:8px;background:#FBFBFC}.sb-editor-task-input,.sb-editor-task-detail,.sb-editor-task-status{width:100%;box-sizing:border-box;border:0;background:transparent;color:#272A2D;outline:none;font:600 12px/1.4 inherit}.sb-editor-task-detail{font-size:11px;color:#858B91;margin-top:5px;resize:vertical;min-height:28px}.sb-editor-task-status{font-size:10px;color:#6D747A;margin-top:6px;border-top:1px solid #ECEDEF;padding-top:6px}.sb-task-remove{appearance:none;border:0;background:none;color:#B04545;font-size:11px;cursor:pointer;padding:4px 0}.sb-editor-add-task{width:100%;border:1px dashed #C7CBD0;background:#FAFAFB;border-radius:9px;color:#72797F;padding:8px 9px;margin-top:9px;font:600 11px/1.2 inherit;cursor:pointer}.sb-editor-add-task:hover{background:#F1F3F4;color:#25282B}.sb-editor-column-add{min-width:210px;min-height:120px;border:1px dashed #C7CBD0;border-radius:16px;background:transparent;color:#737A81;font:600 12px/1.2 inherit;cursor:pointer}.sb-editor-column-add:hover{background:#F0F1F2;color:#25282B}.sb-editor-note{font-size:11px;color:#8A9096;margin-top:15px}
.sb-create{height:100%;min-height:100%;box-sizing:border-box;background:#F5F6F7;padding:30px 36px 34px;display:flex;flex-direction:column;color:#17191B}.sb-create-head{display:flex;align-items:flex-start;gap:15px;flex:none}.sb-create-back{appearance:none;border:1px solid #D9DCDD;background:#fff;color:#5F666D;border-radius:10px;width:34px;height:34px;font-size:18px;line-height:1;cursor:pointer}.sb-create-back:hover{background:#ECEEF0}.sb-create-back:focus-visible,.sb-create-send:focus-visible,.sb-create-chip:focus-visible,.sb-create-confirm:focus-visible,.sb-create-edit:focus-visible{outline:2px solid #3B6BD4;outline-offset:3px}.sb-create-copy{min-width:0}.sb-create-eyebrow{font-size:10px;font-weight:750;letter-spacing:.12em;color:#7D8389;text-transform:uppercase}.sb-create-title{font-size:26px;font-weight:720;margin-top:5px}.sb-create-subtitle{font-size:13px;color:#7D8389;line-height:1.55;margin-top:5px}.sb-create-main{width:min(920px,100%);flex:1;min-height:0;align-self:center;display:flex;flex-direction:column;justify-content:center}.sb-create-empty{text-align:center;color:#8A9096;padding:26px}.sb-create-empty-mark{width:58px;height:46px;border:2px solid #C8CDD2;border-radius:12px;margin:0 auto 17px;position:relative}.sb-create-empty-mark:before,.sb-create-empty-mark:after{content:"";position:absolute;border:2px solid #C8CDD2;border-radius:5px;background:#F5F6F7}.sb-create-empty-mark:before{width:20px;height:13px;left:8px;top:8px}.sb-create-empty-mark:after{width:28px;height:7px;left:8px;bottom:7px}.sb-create-empty-title{font-size:17px;font-weight:650;color:#6F767D}.sb-create-empty-text{font-size:13px;line-height:1.6;margin-top:7px}.sb-create-messages{display:flex;flex-direction:column;gap:12px;overflow-y:auto;padding:12px 4px 18px}.sb-create-message{max-width:min(720px,88%);padding:12px 15px;border-radius:13px;font-size:13px;line-height:1.65;white-space:pre-line}.sb-create-message-agent{align-self:flex-start;background:#fff;border:1px solid #DFE1E3;color:#30353A}.sb-create-message-user{align-self:flex-end;background:#17191B;color:#fff}.sb-create-thinking{font-size:12px;color:#8A9096;padding:4px 2px}.sb-create-draft{margin-top:4px;border:1px solid #D7DADC;border-radius:16px;background:#fff;padding:17px 18px}.sb-create-draft-title{font-size:16px;font-weight:700}.sb-create-draft-note{font-size:12px;color:#7D8389;margin-top:5px}.sb-create-draft-columns{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.sb-create-draft-column{min-width:0;border:1px solid #E1E3E5;border-radius:10px;padding:9px;background:#FAFAFB}.sb-create-draft-column-title{font-size:11px;font-weight:700;color:#30353A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-create-draft-task{font-size:10px;color:#7D8389;line-height:1.45;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-create-draft-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.sb-create-confirm,.sb-create-edit{appearance:none;border-radius:10px;padding:10px 13px;font:650 12px/1.1 inherit;cursor:pointer}.sb-create-edit{border:1px solid #D1D4D7;background:#fff;color:#272A2D}.sb-create-confirm{border:1px solid #17191B;background:#17191B;color:#fff}.sb-create-composer{flex:none;width:min(920px,100%);align-self:center;margin-top:14px;border:1px solid #D1D4D7;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(24,28,32,.06);padding:12px 13px 10px}.sb-create-input{display:block;width:100%;min-height:58px;box-sizing:border-box;resize:none;border:0;outline:none;background:transparent;color:#272A2D;font:14px/1.55 inherit}.sb-create-input::placeholder{color:#A0A5AA}.sb-create-composer-foot{display:flex;align-items:center;gap:8px;margin-top:7px}.sb-create-hint{flex:1;font-size:11px;color:#9AA0A6}.sb-create-send{appearance:none;border:0;background:#17191B;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px;line-height:1;cursor:pointer}.sb-create-send:disabled{opacity:.4;cursor:default}.sb-create-chips{display:flex;gap:7px;overflow-x:auto;margin-top:9px;padding-bottom:2px}.sb-create-chip{appearance:none;border:1px solid #D9DCDD;background:#fff;color:#697077;border-radius:999px;padding:7px 10px;font:11px/1.2 inherit;white-space:nowrap;cursor:pointer}.sb-create-chip:hover{background:#F0F1F2;color:#272A2D}.sb-create-note{font-size:11px;color:#9AA0A6;text-align:center;margin-top:10px}
.sb-dash-focus{position:fixed!important;inset:12px!important;left:12px!important;z-index:10050!important;border-radius:18px;box-shadow:0 24px 80px rgba(16,20,25,.22)}
.sb-canvas-shell{min-height:100%;padding:26px 30px 38px;background:#F6F7F8;color:#17191B;box-sizing:border-box}
.sb-canvas-toolbar{display:flex;align-items:center;gap:8px;border-bottom:1px solid #E1E3E5;padding-bottom:16px;margin-bottom:18px}
.sb-canvas-heading{flex:1;min-width:0}.sb-canvas-eyebrow{font-size:10px;font-weight:750;letter-spacing:.12em;color:#8A9096;text-transform:uppercase}.sb-canvas-title{font-size:25px;font-weight:720;letter-spacing:-.04em;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-subtitle{font-size:12px;color:#7B8289;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-data-state{display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:10px;color:#6C757D}.sb-canvas-data-state::before{content:"";width:6px;height:6px;border-radius:50%;background:#9AA2AA}.sb-canvas-data-state.sb-live{color:#2C7A4B}.sb-canvas-data-state.sb-live::before{background:#4EAE72}.sb-canvas-data-state.sb-demo{color:#5B6E9A}.sb-canvas-data-state.sb-demo::before{background:#6D8ED2}
.sb-canvas-actions{display:flex;gap:7px;flex:none}.sb-canvas-action{appearance:none;border:1px solid #D6D9DC;background:#fff;color:#25292D;border-radius:10px;padding:9px 11px;font:650 12px/1.1 inherit;cursor:pointer}.sb-canvas-action:hover{background:#EEF0F2;border-color:#BFC4C8}.sb-canvas-action-primary{background:#17191B;color:#fff;border-color:#17191B}.sb-canvas-action-primary:hover{background:#303337}.sb-canvas-action:disabled{opacity:.5;cursor:default}
.sb-canvas-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(132px,auto);gap:12px;align-items:stretch}.sb-canvas-widget{position:relative;min-width:0;border:1px solid #D9DCDD;border-radius:15px;background:#fff;padding:15px;overflow:hidden;box-shadow:0 4px 14px rgba(21,27,34,.035)}.sb-canvas-widget-edit{border:1px dashed #9DA9B5;box-shadow:0 0 0 2px rgba(59,107,212,.08)}.sb-canvas-widget-head{display:flex;align-items:center;gap:8px;margin-bottom:11px}.sb-canvas-widget-label{font-size:11px;font-weight:750;letter-spacing:.03em;color:#4F565D}.sb-canvas-widget-kicker{font-size:9px;color:#98A0A7;letter-spacing:.08em;text-transform:uppercase;margin-left:auto}.sb-canvas-widget-value{font-size:31px;font-weight:760;letter-spacing:-.06em;color:#17191B;line-height:1.05}.sb-canvas-widget-unit{font-size:13px;font-weight:650;margin-left:4px;color:#6F777E}.sb-canvas-widget-note{font-size:11px;color:#80878E;line-height:1.45;margin-top:8px}.sb-canvas-widget-list{display:flex;flex-direction:column;gap:7px}.sb-canvas-record{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;border-top:1px solid #ECEDEF;padding-top:8px}.sb-canvas-record:first-child{border-top:0;padding-top:0}.sb-canvas-record-title{font-size:12px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-record-value{font-size:12px;font-weight:700;color:#30363B}.sb-canvas-record-meta{font-size:10px;color:#90979D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-record-status{font-size:10px;color:#44895B;grid-column:1/-1}.sb-canvas-bars{height:76px;display:flex;align-items:flex-end;gap:5px;margin-top:12px}.sb-canvas-bars i{flex:1;min-width:4px;background:#7EB7E6;border-radius:4px 4px 1px 1px}.sb-canvas-file{display:flex;align-items:center;gap:8px;border-top:1px solid #ECEDEF;padding:8px 0;font-size:11px}.sb-canvas-file:first-child{border-top:0;padding-top:0}.sb-canvas-file-tag{flex:none;font-size:9px;font-weight:750;color:#4A79A5;background:#EAF4FD;border-radius:5px;padding:4px}.sb-canvas-file-name{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-file-at{font-size:9px;color:#9AA1A7}.sb-canvas-task{display:flex;align-items:flex-start;gap:8px;border-top:1px solid #ECEDEF;padding:8px 0;cursor:pointer}.sb-canvas-task:first-child{border-top:0;padding-top:0}.sb-canvas-task-dot{width:7px;height:7px;border-radius:50%;background:#E8A33D;flex:none;margin-top:4px}.sb-canvas-task-title{font-size:11px;font-weight:650;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-task-meta{font-size:9px;color:#949BA2;margin-top:2px}.sb-canvas-widget-actions{display:flex;gap:6px;margin-top:11px}.sb-canvas-mini-action{appearance:none;border:1px solid #DCE0E3;background:#FAFBFC;color:#5D666E;border-radius:7px;padding:5px 7px;font:600 10px/1.1 inherit;cursor:pointer}.sb-canvas-mini-action:hover{background:#F0F2F4;color:#25292D}.sb-canvas-widget-controls{display:flex;gap:3px;margin-left:auto}.sb-canvas-widget-controls button{appearance:none;border:0;background:transparent;color:#8A929A;border-radius:6px;width:22px;height:22px;cursor:pointer}.sb-canvas-widget-controls button:hover{background:#EEF0F2;color:#25292D}.sb-canvas-annotation{border-left:3px solid #D8792B;background:#FFF8EF;border-radius:8px;padding:8px 10px;margin-top:9px;font-size:10px;color:#6C5A45;line-height:1.45}.sb-canvas-runbar{display:flex;align-items:center;gap:8px;margin-top:18px;padding:11px 13px;border:1px solid #DDE1E4;border-radius:12px;background:#fff;font-size:11px;color:#687078}.sb-canvas-runbar strong{color:#25292D}.sb-canvas-run-status{margin-left:auto;font-size:10px;font-weight:700;color:#B07825}.sb-canvas-run-status.is-completed{color:#3C8954}.sb-canvas-history{margin-top:18px;border-top:1px solid #E1E3E5;padding-top:15px}.sb-canvas-history-title{font-size:12px;font-weight:700;color:#454C53}.sb-canvas-history-row{display:flex;gap:10px;align-items:center;border-bottom:1px solid #ECEDEF;padding:9px 0;font-size:11px}.sb-canvas-history-row:last-child{border-bottom:0}.sb-canvas-history-row span:first-child{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-canvas-history-row span:last-child{font-size:10px;color:#8D959C}.sb-canvas-empty{grid-column:1/-1;border:1px dashed #C8CED3;border-radius:14px;padding:46px 20px;text-align:center;color:#8A9299;font-size:12px}.sb-canvas-editor-note{font-size:11px;color:#8A9299;line-height:1.55;margin-top:14px}
@media(max-width:900px){.sb-canvas-board{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-canvas-widget{grid-column:auto!important;grid-row:auto!important}.sb-canvas-shell{padding:22px 20px 30px}.sb-canvas-toolbar{align-items:flex-start}.sb-canvas-actions{flex-wrap:wrap;justify-content:flex-end}}
@media(max-width:640px){.sb-canvas-shell{padding:18px 14px 24px}.sb-canvas-toolbar{display:block}.sb-canvas-title{font-size:22px}.sb-canvas-actions{margin-top:13px;justify-content:flex-start}.sb-canvas-board{grid-template-columns:1fr;grid-auto-rows:auto}.sb-canvas-widget{grid-column:1 / -1!important;grid-row:auto!important;min-height:120px}.sb-canvas-subtitle{white-space:normal}}
@media(max-width:900px){.sb-directory-title{font-size:30px}.sb-directory-subtitle{font-size:15px}.sb-board-grid{grid-template-columns:1fr}.sb-editor-columns{grid-template-columns:repeat(2,minmax(210px,1fr))}}
@media(max-width:640px){.sb-dash-directory{padding:24px 18px 32px}.sb-directory-hero{display:block}.sb-directory-create{margin-top:18px}.sb-board-card{padding:17px;min-height:320px}.sb-board-preview{height:184px}.sb-board-toolbar{flex-wrap:wrap}.sb-board-toolbar-title{flex-basis:100%;font-size:21px;margin-bottom:4px}.sb-editor{padding:20px 16px 28px}.sb-editor-head{display:block}.sb-editor-actions{margin-top:15px}.sb-editor-columns{grid-template-columns:repeat(4,minmax(210px,1fr))}.sb-create{padding:22px 16px 20px}.sb-create-title{font-size:22px}.sb-create-main{justify-content:flex-start;padding-top:24px}.sb-create-draft-columns{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-create-message{max-width:94%}.sb-create-composer{margin-top:10px}.sb-create-hint{display:none}}
`;

const VIEW_CSS = `
.sb-view-editor{background:#F5F6F7;min-height:100%;padding:28px 34px 38px}.sb-view-editor-head{display:flex;align-items:flex-end;gap:18px}.sb-view-editor-copy{flex:1;min-width:0}.sb-view-editor-title{font-size:27px;font-weight:720;color:#17191B;margin-top:5px}.sb-view-editor-subtitle{font-size:13px;color:#7D8389;line-height:1.55;margin-top:7px}.sb-view-editor-layout{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:22px;margin-top:24px}.sb-view-editor-panel{border:1px solid #D9DCDD;border-radius:16px;background:#fff;padding:16px}.sb-view-editor-section+.sb-view-editor-section{border-top:1px solid #ECEDEF;margin-top:17px;padding-top:17px}.sb-view-editor-label{font-size:11px;font-weight:750;color:#565D64;letter-spacing:.04em}.sb-view-editor-options{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.sb-view-option{appearance:none;border:1px solid #D7DADC;background:#fff;color:#687078;border-radius:9px;padding:9px 10px;font:600 11px/1.1 inherit;cursor:pointer}.sb-view-option:hover{background:#F1F2F3}.sb-view-option.is-selected{border-color:#17191B;background:#17191B;color:#fff}.sb-view-swatch{width:25px;height:25px;border-radius:7px;border:2px solid transparent;cursor:pointer;box-sizing:border-box}.sb-view-swatch.is-selected{border-color:#17191B;box-shadow:0 0 0 2px #fff inset}.sb-view-swatch-light{background:#F5F6F7}.sb-view-swatch-ink{background:#182129}.sb-view-swatch-paper{background:#F3EEE5}.sb-view-swatch-blue{background:#168BFF}.sb-view-swatch-green{background:#2D9D62}.sb-view-swatch-orange{background:#D8792B}.sb-view-check{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:12px;color:#4F565D}.sb-view-check input{accent-color:#17191B}.sb-view-preview{border:1px solid #D9DCDD;border-radius:16px;background:#fff;padding:14px;min-width:0}.sb-view-preview-label{font-size:10px;font-weight:750;letter-spacing:.12em;color:#8A9096;text-transform:uppercase;margin-bottom:10px}.sb-view-preview-frame{min-height:365px;border-radius:12px;overflow:hidden}.sb-view-editor-footnote{font-size:11px;color:#8A9096;line-height:1.55;margin-top:16px}.sb-view-preview-frame .sb-result-grid{gap:6px;margin-top:6px}.sb-view-preview-frame .sb-result-card{min-height:88px;border-radius:10px;padding:11px}.sb-view-preview-frame .sb-result-hero{min-height:112px;padding:13px;grid-template-columns:1fr 1fr;gap:10px;border-radius:10px}.sb-view-preview-frame .sb-result-hero-value{font-size:31px;margin-top:5px}.sb-view-preview-frame .sb-result-hero-label{font-size:9px;margin-top:11px}.sb-view-preview-frame .sb-result-breakdown{padding:10px}.sb-view-preview-frame .sb-result-breakdown-title{font-size:9px}.sb-view-preview-frame .sb-result-breakdown-row{padding:5px 0}.sb-view-preview-frame .sb-result-breakdown-label,.sb-view-preview-frame .sb-result-breakdown-value{font-size:8px}.sb-view-preview-frame .sb-result-record-heading,.sb-view-preview-frame .sb-result-files-title{font-size:11px;margin-top:6px}.sb-view-preview-frame .sb-result-record{padding:5px 0}.sb-view-preview-frame .sb-result-record-title,.sb-view-preview-frame .sb-result-record-value,.sb-view-preview-frame .sb-result-record-meta,.sb-view-preview-frame .sb-result-record-status{font-size:7px}.sb-view-preview-frame .sb-result-proof-row{padding:5px 0}.sb-view-preview-frame .sb-result-proof-value{font-size:14px}.sb-view-preview-frame .sb-result-trend{padding:10px;margin-top:6px;border-radius:10px}.sb-view-preview-frame .sb-result-trend-title{font-size:12px}.sb-view-preview-frame .sb-result-chart-canvas{padding:5px}.sb-view-preview-frame .sb-result-chart-canvas svg{height:70px}.sb-view-preview-canvas{margin-top:16px;border-top:1px solid #ECEDEF;padding-top:14px}.sb-view-preview-canvas .sb-canvas-board{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:78px;gap:7px}.sb-view-preview-canvas .sb-canvas-widget{border-radius:10px;padding:9px;box-shadow:none}.sb-view-preview-canvas .sb-canvas-widget-head{margin-bottom:6px}.sb-view-preview-canvas .sb-canvas-widget-label{font-size:9px}.sb-view-preview-canvas .sb-canvas-widget-kicker{display:none}.sb-view-preview-canvas .sb-canvas-widget-value{font-size:20px}.sb-view-preview-canvas .sb-canvas-widget-note,.sb-view-preview-canvas .sb-canvas-record-meta,.sb-view-preview-canvas .sb-canvas-record-status,.sb-view-preview-canvas .sb-canvas-file-at,.sb-view-preview-canvas .sb-canvas-task-meta,.sb-view-preview-canvas .sb-canvas-widget-actions,.sb-view-preview-canvas .sb-canvas-annotation{display:none}.sb-view-preview-canvas .sb-canvas-record{padding-top:4px}.sb-view-preview-canvas .sb-canvas-record-title,.sb-view-preview-canvas .sb-canvas-record-value{font-size:8px}.sb-view-preview-canvas .sb-canvas-bars{height:40px;margin-top:4px}.sb-view-preview-canvas .sb-canvas-file{padding:4px 0;font-size:8px}.sb-view-preview-canvas .sb-canvas-file-tag{padding:2px;font-size:7px}.sb-view-preview-canvas .sb-canvas-task{padding:4px 0}.sb-view-preview-canvas .sb-canvas-task-title{font-size:8px}.sb-view-preview-canvas .sb-canvas-widget-controls{display:flex}.sb-view-preview-canvas .sb-canvas-widget-controls button{width:16px;height:16px;font-size:10px}
.sb-board-preview.sb-preview-theme-ink .sb-board-preview-tile{background:#182129;border-color:#33404B;color:#F4F7F9}.sb-board-preview.sb-preview-theme-ink .sb-preview-kicker,.sb-board-preview.sb-preview-ink .sb-preview-label{color:#AAB7C1}.sb-board-preview.sb-preview-theme-paper .sb-board-preview-tile{background:#FFF9F0;border-color:#E2D5C1}.sb-board-preview.sb-preview-layout-focus{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.sb-board-preview.sb-preview-layout-focus .sb-board-preview-tile:nth-child(n+3){display:none}
.sb-board-preview-canvas{background:#F8F9FA;border:1px solid #E1E3E5;border-radius:15px;padding:8px;box-sizing:border-box}.sb-board-preview-canvas .sb-board-preview-tile{border-radius:10px;padding:10px;gap:5px}.sb-board-preview-canvas .sb-preview-kicker{font-size:8px}.sb-board-preview-canvas .sb-preview-value{font-size:20px}.sb-board-preview-canvas .sb-preview-bars{height:30px}
.sb-view-template-note{font-size:10px;color:#8A9096;line-height:1.45;margin-top:6px}.sb-view-template-columns{display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:390px;overflow-y:auto;padding-right:3px}.sb-view-template-column{border:1px solid #E1E3E5;border-radius:10px;background:#FAFBFC;padding:9px}.sb-view-template-column-head{display:flex;align-items:center;gap:5px}.sb-view-template-title{min-width:0;flex:1;border:0;border-bottom:1px solid #D7DADC;background:transparent;color:#272A2D;padding:4px 0;outline:none;font:700 11px/1.2 inherit}.sb-view-template-tools{display:flex;gap:2px}.sb-view-template-tools button{appearance:none;border:0;background:transparent;color:#8A929A;border-radius:5px;width:20px;height:20px;cursor:pointer}.sb-view-template-tools button:hover{background:#E9ECEE;color:#25292D}.sb-view-template-task{border-top:1px solid #E6E8EA;margin-top:8px;padding-top:8px}.sb-view-template-task input,.sb-view-template-task textarea,.sb-view-template-task select{width:100%;box-sizing:border-box;border:1px solid #E0E3E5;border-radius:6px;background:#fff;color:#30353A;padding:5px 6px;outline:none;font:10px/1.35 inherit}.sb-view-template-task textarea{resize:vertical;min-height:32px;margin-top:5px}.sb-view-template-task select{margin-top:5px;color:#6B737B}.sb-view-template-task-remove{appearance:none;border:0;background:transparent;color:#B04545;padding:4px 0;font:10px/1.2 inherit;cursor:pointer}.sb-view-template-add-task,.sb-view-template-add-column{width:100%;appearance:none;border:1px dashed #C7CDD2;border-radius:7px;background:#fff;color:#717A82;padding:6px 7px;margin-top:8px;font:600 10px/1.2 inherit;cursor:pointer}.sb-view-template-add-task:hover,.sb-view-template-add-column:hover{background:#F0F2F3;color:#25292D}.sb-view-template-add-column{margin-top:10px}
@media(max-width:640px){.sb-view-editor{padding:22px 16px 28px}.sb-view-editor-head{display:block}.sb-view-editor-layout{display:block}.sb-view-preview{margin-top:16px}}
`;

const CANVAS_ROLE_CSS = `
.sb-canvas-widget-metrics{background:linear-gradient(145deg,#F2F8FF 0%,#DCEEFF 100%);border-color:#BCDDF5;box-shadow:0 10px 24px rgba(55,126,186,.10)}
.sb-canvas-widget-metrics .sb-canvas-widget-label{color:#245D8B}.sb-canvas-widget-metrics .sb-canvas-widget-value{color:#123B5B}.sb-canvas-widget-metrics .sb-canvas-widget-unit{color:#3F749B}.sb-canvas-widget-metrics .sb-canvas-mini-action{border-color:#B9D8EF;background:rgba(255,255,255,.6);color:#245D8B}
.sb-canvas-widget-records{background:#F9FCFF;border-color:#CFE4F5;box-shadow:0 10px 24px rgba(55,126,186,.07)}.sb-canvas-widget-records .sb-canvas-widget-label{color:#2E648E}.sb-canvas-widget-records .sb-canvas-record-status{color:#2E8A5A}.sb-canvas-widget-records .sb-canvas-mini-action{border-color:#C5DDEC;background:#fff;color:#2E648E}
.sb-canvas-widget-files{background:linear-gradient(145deg,#FFFCF5 0%,#FFF2D9 100%);border-color:#F0D7A9;box-shadow:0 10px 24px rgba(187,132,42,.08)}.sb-canvas-widget-files .sb-canvas-widget-label{color:#866126}.sb-canvas-widget-files .sb-canvas-file-tag{background:#FFF0C9;color:#8A641E}.sb-canvas-widget-files .sb-canvas-file{border-color:rgba(177,135,55,.18)}
.sb-canvas-widget-trend{background:linear-gradient(135deg,#152B3D 0%,#1E5068 100%);border-color:#2C6681;box-shadow:0 14px 32px rgba(16,49,68,.18);color:#F4FAFD}.sb-canvas-widget-trend .sb-canvas-widget-label,.sb-canvas-widget-trend .sb-canvas-widget-kicker{color:#BFE4F6}.sb-canvas-widget-trend .sb-canvas-widget-note{color:#B8D2DE}.sb-canvas-widget-trend .sb-canvas-bars{border-bottom:1px solid rgba(191,228,246,.24);background:repeating-linear-gradient(to top,rgba(191,228,246,.12) 0,rgba(191,228,246,.12) 1px,transparent 1px,transparent 25%);border-radius:8px 8px 0 0;padding:0 8px}.sb-canvas-widget-trend .sb-canvas-bars i{background:linear-gradient(to top,#5BB8E6,#A5E4FF);box-shadow:0 0 12px rgba(130,218,255,.22)}
.sb-canvas-widget-tasks{background:#FFFFFF;border-color:#D9DDE0;box-shadow:0 10px 24px rgba(21,27,34,.055);border-top:3px solid #E8A33D}.sb-canvas-widget-tasks .sb-canvas-widget-label{color:#754C12}.sb-canvas-widget-tasks .sb-canvas-task{border-color:#ECEDEF}.sb-canvas-widget-tasks .sb-canvas-task-meta{color:#7B858D}
.sb-canvas-widget{display:flex;flex-direction:column}
.sb-canvas-widget-list{flex:1;min-height:0;justify-content:space-evenly}
.sb-canvas-widget-actions{margin-top:auto;padding-top:11px}
.sb-canvas-widget-metrics .sb-canvas-widget-note{max-width:46rem}
.sb-canvas-kpi-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:18px}
.sb-canvas-kpi{min-width:0;padding:9px 10px;border:1px solid rgba(58,126,184,.16);border-radius:9px;background:rgba(255,255,255,.58)}
.sb-canvas-kpi-value{font-size:17px;font-weight:750;line-height:1.1;color:#174D72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-canvas-kpi-label{font-size:9px;color:#5B7D95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}
.sb-canvas-bars{flex:1;height:auto;min-height:145px;margin-top:16px}
.sb-canvas-trend-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;font-size:10px;color:#B8D2DE}
.sb-canvas-trend-summary strong{font-size:11px;color:#E7F7FF;white-space:nowrap}
.sb-view-preview-canvas .sb-canvas-bars{height:40px;min-height:0;flex:none;margin-top:4px}
@media(max-width:640px){.sb-canvas-kpi-strip{gap:5px}.sb-canvas-kpi{padding:8px}.sb-canvas-kpi-value{font-size:15px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = `${CSS}${VIEW_CSS}${CANVAS_ROLE_CSS}`;
  document.head.appendChild(tag);
  styleInjected = true;
}

function formatTime(iso) {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60e3) return "刚刚";
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function projectAccent(room) {
  const colors = ["#1F2329", "#405A73", "#627153", "#80604F", "#5B607F"];
  const value = String(room?.id || room?.name || "");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

export function projectCloudViewKey(room, dashboard) {
  if (!room?.id || !dashboard?.cloudAgentType) return null;
  const work = dashboard.work;
  const stateKey = work ? `${work.state || "working"}:${work.phase || ""}:${work.task || ""}` : "idle";
  return `${room.id}|${dashboard.cloudAgentType}|${stateKey}`;
}

/** 分组柱状图（员工看板主图，最多两条序列）。 */
function barChart(series) {
  const W = 660, H = 190, top = 14, bottom = 26;
  const days = series[0].values.length;
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const slot = W / days;
  const barW = Math.min(16, (slot - 10) / series.length);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(H));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", chartSeriesSummary(series));
  const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc");
  desc.textContent = chartSeriesSummary(series);
  svg.appendChild(desc);
  // 基线
  const base = document.createElementNS("http://www.w3.org/2000/svg", "line");
  base.setAttribute("x1", "0"); base.setAttribute("x2", String(W));
  base.setAttribute("y1", String(H - bottom)); base.setAttribute("y2", String(H - bottom));
  base.setAttribute("stroke", "rgba(15,15,15,0.1)");
  svg.appendChild(base);
  const today = new Date();
  for (let d = 0; d < days; d += 1) {
    const cx = slot * d + slot / 2;
    const x0 = cx - (barW * series.length) / 2;
    series.forEach((s, si) => {
      const v = s.values[d];
      const bh = Math.max(2, (v / max) * (H - top - bottom));
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", (x0 + si * barW + 1).toFixed(1));
      rect.setAttribute("y", (H - bottom - bh).toFixed(1));
      rect.setAttribute("width", (barW - 2).toFixed(1));
      rect.setAttribute("height", bh.toFixed(1));
      rect.setAttribute("rx", "2.5");
      rect.setAttribute("fill", s.color);
      const tip = document.createElementNS("http://www.w3.org/2000/svg", "title");
      const date = new Date(today.getTime() - (days - 1 - d) * 86400e3);
      tip.textContent = `${date.getMonth() + 1}/${date.getDate()} ${s.label}：${v}`;
      rect.appendChild(tip);
      svg.appendChild(rect);
    });
    if (d % 3 === 0 || d === days - 1) {
      const date = new Date(today.getTime() - (days - 1 - d) * 86400e3);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", cx.toFixed(1));
      label.setAttribute("y", String(H - 8));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "#B0B4BB");
      label.textContent = d === days - 1 ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`;
      svg.appendChild(label);
    }
  }
  return svg;
}

/** 打开数据看板页（主内容区）。 */
export function openKanbanPage({ gateway, teamLive, initialRoom = null, onClose } = {}) {
  ensureStyle();
  const page = openPage({ title: "", onClose });
  page.root.querySelector(".sb-page-head")?.remove();
  let disposed = false;
  let pollTimer = null;
  let rooms = [];
  let roomsLoading = true;
  let roomsLoadFailed = false;
  let selectedRoom = initialRoom || null;
  let showCloud = false; // 项目组结果视图里是否展开云电脑实时画面
  let cloudView = null; // { key, view } 复用同一个快照实例，轮询重渲时不打断实时供给
  let editMode = false;
  let editingConfig = null;
  let focusMode = false;
  let creatingBoard = false;
  let refreshing = false;
  let creationMode = false;
  let creationMessages = [];
  let creationDraft = null;
  let creationBusy = false;
  let creationTimers = [];
  let taskUnsubscribe = null;

  function disposeCloud() {
    cloudView?.view.dispose();
    cloudView = null;
  }

  function toggleCloud() {
    showCloud = !showCloud;
    if (!showCloud) disposeCloud();
    render();
  }

  function availableRooms() {
    return rooms.length ? rooms : [SEED_SALES_ROOM];
  }

  function dashboardFor(room) {
    return projectResultDashboard(room, { teamLive });
  }

  function tasksForRoom(room) {
    return listTasks()
      .filter((task) => projectRecordMatches(task, room))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  }

  function taskProjectionStatus(status) {
    return { progress: "进行中", running: "进行中", approval: "待确认", blocked: "已暂停", failed: "执行失败", done: "已完成" }[status] || "待开始";
  }

  function startAgentAction(room, { title, taskText }) {
    if (!room?.id || !taskText) return;
    const taskId = addTask({
      title,
      taskText,
      projectId: room.id,
      projectName: room.name || "销售运营总览",
      online: false
    });
    const task = listTasks().find((entry) => entry.id === taskId);
    if (task) reopenTaskConversation({ task, teamLive });
  }

  function agentActionButton(room, label, title, taskText) {
    const button = el("button", "sb-result-action", label);
    button.type = "button";
    button.setAttribute("aria-label", `${label}：${title}`);
    button.addEventListener("click", () => startAgentAction(room, { title, taskText }));
    return button;
  }

  function configFor(room) {
    return readBoardConfig(room?.id, createDefaultBoardConfig(room, dashboardFor(room)));
  }

  function enterEditor(room, { create = false } = {}) {
    selectedRoom = room || SEED_SALES_ROOM;
    creationMode = false;
    creatingBoard = create;
    editingConfig = configFor(selectedRoom);
    editMode = true;
    showCloud = false;
    disposeCloud();
    render();
  }

  function openCreationConversation(room) {
    selectedRoom = room || SEED_SALES_ROOM;
    creationMode = true;
    creationMessages = [{ role: "agent", text: "你好，我是你的工作台 Agent。你想把这块看板做成什么风格？可以告诉我业务主题、想突出的信息和偏好的排版。" }];
    creationDraft = null;
    creationBusy = false;
    editMode = false;
    editingConfig = null;
    creatingBoard = true;
    showCloud = false;
    disposeCloud();
    render();
  }

  function closeCreationConversation() {
    creationTimers.forEach((timer) => clearTimeout(timer));
    creationTimers = [];
    creationMode = false;
    creationMessages = [];
    creationDraft = null;
    creationBusy = false;
    creatingBoard = false;
    selectedRoom = null;
    render();
  }

  function submitCreationPrompt(prompt) {
    const value = String(prompt || "").trim();
    if (!value || creationBusy) return;
    creationMessages.push({ role: "user", text: value });
    creationBusy = true;
    render();
    const timer = setTimeout(() => {
      creationTimers = creationTimers.filter((entry) => entry !== timer);
      if (disposed || !creationMode) return;
      creationDraft = suggestBoardConfig(value, selectedRoom || SEED_SALES_ROOM, dashboardFor(selectedRoom || SEED_SALES_ROOM));
      creationMessages.push({ role: "agent", text: `我理解为“${creationDraft.title}”：我会用${creationDraft.view.theme === "ink" ? "深色" : creationDraft.view.theme === "paper" ? "暖白" : "浅色"}主题、${creationDraft.view.layout === "focus" ? "聚焦重点" : creationDraft.view.layout === "grid" ? "网格卡片" : "仪表盘"}排版，突出${creationDraft.view.components.map((key) => ({ records: "实时明细", metrics: "关键指标", files: "项目产出", trend: "趋势图", tasks: "任务动态" }[key])).join("、")}。下面是使用当前项目组真实数据的视觉草案，确认后还可以继续修改。` });
      creationBusy = false;
      render();
    }, 700);
    creationTimers.push(timer);
  }

  function confirmCreation() {
    if (!selectedRoom || !creationDraft) return;
    writeBoardConfig(selectedRoom.id, creationDraft);
    creationMode = false;
    creationMessages = [];
    creationDraft = null;
    creationBusy = false;
    creatingBoard = false;
    render();
  }

  function editCreationDraft() {
    if (!creationDraft) return;
    editingConfig = normalizeBoardConfig(creationDraft, configFor(selectedRoom));
    creationMode = false;
    editMode = true;
    creatingBoard = true;
    render();
  }

  function saveEditor() {
    if (!selectedRoom || !editingConfig) return;
    writeBoardConfig(selectedRoom.id, editingConfig);
    editMode = false;
    creatingBoard = false;
    editingConfig = null;
    render();
  }

  function cancelEditor() {
    editMode = false;
    creatingBoard = false;
    editingConfig = null;
    render();
  }

  function toggleFocus() {
    focusMode = !focusMode;
    page.root.classList.toggle("sb-dash-focus", focusMode);
    render();
  }

  async function loadRooms() {
    roomsLoading = true;
    refreshing = true;
    roomsLoadFailed = false;
    render();
    try {
      if (gateway) {
        const result = await gateway.action("room.action.list");
        rooms = result?.data?.rooms || [];
      } else {
        const response = await fetch("./rooms/rooms.json");
        if (!response.ok) throw new Error(`rooms request failed: ${response.status}`);
        rooms = await response.json();
      }
    } catch {
      rooms = [];
      roomsLoadFailed = true;
    } finally {
      roomsLoading = false;
      refreshing = false;
      render();
    }
  }

  function previewTile(label, value, tone, series = []) {
    const tile = el("div", `sb-board-preview-tile${tone ? ` sb-preview-${tone}` : ""}`);
    tile.appendChild(el("div", "sb-preview-kicker", label));
    tile.appendChild(el("div", "sb-preview-value", value));
    if (series.length) {
      const bars = el("div", "sb-preview-bars");
      const max = Math.max(...series, 1);
      series.forEach((item) => {
        const bar = el("i");
        bar.style.height = `${Math.max(18, Math.round((item / max) * 100))}%`;
        bars.appendChild(bar);
      });
      tile.appendChild(bars);
    }
    return tile;
  }

  function renderBoardPreview(room, dashboard, config) {
    const preview = el("div", "sb-board-preview sb-board-preview-canvas");
    const view = config?.view || {};
    preview.classList.add(`sb-preview-theme-${view.theme || "light"}`, `sb-preview-layout-${view.layout || "dashboard"}`);
    const primarySeries = dashboard?.series?.[0]?.values?.slice(-7) || [];
    const secondarySeries = dashboard?.series?.[1]?.values?.slice(-7) || [];
    const recordCount = dashboard?.records?.mode === "status-summary"
      ? dashboard?.tasks?.length || 0
      : dashboard?.records?.items?.length || 0;
    const outputCount = dashboard?.outputs?.length || 0;
    preview.append(
      previewTile(`${dashboard?.dataState === "demo" ? "示例 · " : ""}关键指标`, dashboard ? `${dashboard.primary.value}${dashboard.primary.unit || ""}` : "暂无", "", primarySeries),
      previewTile("实时明细", `${recordCount}条`, "blue", secondarySeries),
      previewTile("项目产出", `${outputCount}份`, "green", []),
      previewTile("项目趋势", dashboard?.chartNote || "完成任务后生成", "ink", primarySeries)
    );
    return preview;
  }

  function renderProjects() {
    const wrap = el("div", "sb-dash sb-dash-directory notranslate");
    wrap.setAttribute("translate", "no");
    const hero = el("div", "sb-directory-hero");
    const copy = el("div");
    copy.append(
      el("div", "sb-directory-title", "我的看板"),
      el("div", "sb-directory-subtitle", "定制主题，搭一块属于你的销售看板")
    );
    hero.appendChild(copy);
    const create = el("button", "sb-directory-create");
    create.type = "button";
    create.setAttribute("aria-label", "通过对话创建销售看板");
    create.append(el("span", "sb-directory-create-plus", "+"), "对话创建");
    create.addEventListener("click", () => {
      const firstRoom = availableRooms().slice().sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"))[0] || SEED_SALES_ROOM;
      openCreationConversation(firstRoom);
    });
    hero.appendChild(create);
    wrap.appendChild(hero);

    if (roomsLoading) {
      wrap.appendChild(el("div", "sb-dash-state", "正在读取销售项目数据…"));
      return wrap;
    }

    const grid = el("div", "sb-board-grid");
    const orderedRooms = availableRooms().slice().sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"));
    for (const room of orderedRooms) {
      const dashboard = dashboardFor(room);
      const config = configFor(room);
      const card = el("button", "sb-board-card");
      card.type = "button";
      card.setAttribute("aria-label", `打开${config.title}看板`);
      card.appendChild(renderBoardPreview(room, dashboard, config));
      const foot = el("div", "sb-board-card-foot");
      const cardCopy = el("div", "sb-board-card-copy");
      const name = el("div", "sb-board-card-name", config.title);
      name.appendChild(el("span", "sb-board-card-tag", rooms.length ? "项目组" : "业务模板"));
      cardCopy.append(name, el("div", "sb-board-card-meta", `${config.canvas?.placements?.length || 5} 个画布组件 · ${room.goal || "销售协同与客户转化"}`));
      foot.append(cardCopy, el("span", "sb-board-card-arrow", "↗"));
      card.appendChild(foot);
      card.addEventListener("click", () => {
        selectedRoom = room;
        editMode = false;
        editingConfig = null;
        creatingBoard = false;
        showCloud = false;
        disposeCloud();
        render();
      });
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    if (roomsLoadFailed) wrap.appendChild(el("div", "sb-editor-note", "网关暂不可用，当前展示销售运营模板；连接恢复后会自动读取项目组数据。"));
    return wrap;
  }

  function renderCreationConversation(room) {
    const wrap = el("div", "sb-create sb-dash notranslate");
    wrap.setAttribute("translate", "no");
    const head = el("div", "sb-create-head");
    const back = el("button", "sb-create-back", "←");
    back.type = "button";
    back.setAttribute("aria-label", "返回看板目录");
    back.addEventListener("click", closeCreationConversation);
    const copy = el("div", "sb-create-copy");
    copy.append(
      el("div", "sb-create-eyebrow", "CREATE BOARD WITH AGENT"),
      el("div", "sb-create-title", "对话创建看板"),
      el("div", "sb-create-subtitle", `当前项目组：${room?.name || "销售运营总览"} · 描述你的视觉偏好，Agent 会生成看板草案`)
    );
    head.append(back, copy);
    wrap.appendChild(head);

    const main = el("div", "sb-create-main");
    const hasConversation = creationMessages.length > 1 || creationDraft;
    if (!hasConversation) {
      const empty = el("div", "sb-create-empty");
      empty.append(el("div", "sb-create-empty-mark"), el("div", "sb-create-empty-title", "让 Agent 帮你设计一块工作台"), el("div", "sb-create-empty-text", "告诉我你喜欢的主题、排版和信息重点，生成后可继续调整。"));
      main.appendChild(empty);
    } else {
      const messages = el("div", "sb-create-messages");
      creationMessages.forEach((message) => messages.appendChild(el("div", `sb-create-message sb-create-message-${message.role}`, message.text)));
      if (creationBusy) messages.appendChild(el("div", "sb-create-thinking", "Agent 正在整理视觉需求和信息重点…"));
      if (creationDraft) {
        const draft = el("div", "sb-create-draft");
        draft.append(el("div", "sb-create-draft-title", creationDraft.title), el("div", "sb-create-draft-note", `视觉方案：${creationDraft.view.theme === "ink" ? "深色" : creationDraft.view.theme === "paper" ? "暖白" : "浅色"} · ${creationDraft.view.layout === "focus" ? "聚焦重点" : creationDraft.view.layout === "grid" ? "网格卡片" : "仪表盘"} · ${creationDraft.view.density === "compact" ? "紧凑" : "舒展"}`));
        const components = el("div", "sb-create-draft-columns");
        creationDraft.view.components.forEach((component) => {
          const componentEl = el("div", "sb-create-draft-column");
          componentEl.appendChild(el("div", "sb-create-draft-column-title", canvasWidgetLabel(component)));
          componentEl.appendChild(el("div", "sb-create-draft-task", "使用项目组真实数据"));
          components.appendChild(componentEl);
        });
        draft.appendChild(components);
        const actions = el("div", "sb-create-draft-actions");
        const edit = el("button", "sb-create-edit", "进入修改");
        edit.type = "button";
        edit.addEventListener("click", editCreationDraft);
        const confirm = el("button", "sb-create-confirm", "确认生成看板");
        confirm.type = "button";
        confirm.addEventListener("click", confirmCreation);
        actions.append(edit, confirm);
        draft.appendChild(actions);
        messages.appendChild(draft);
      }
      main.appendChild(messages);
    }
    wrap.appendChild(main);

    const composer = el("div", "sb-create-composer");
    const input = document.createElement("textarea");
    input.className = "sb-create-input";
    input.placeholder = "例如：做一个深色科技感的客户跟进看板，重点突出指标和趋势图…";
    input.setAttribute("aria-label", "描述想创建的业务看板");
    input.disabled = creationBusy;
    const send = () => {
      const value = input.value;
      if (!value.trim() || creationBusy) return;
      input.value = "";
      submitCreationPrompt(value);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
    });
    composer.appendChild(input);
    const foot = el("div", "sb-create-composer-foot");
    foot.appendChild(el("div", "sb-create-hint", "Enter 发送 · Shift + Enter 换行"));
    const sendButton = el("button", "sb-create-send", "↑");
    sendButton.type = "button";
    sendButton.disabled = creationBusy;
    sendButton.setAttribute("aria-label", "发送看板需求");
    sendButton.addEventListener("click", send);
    foot.appendChild(sendButton);
    composer.appendChild(foot);
    const chips = el("div", "sb-create-chips");
    ["做一个深色科技感的客户跟进看板，重点突出指标和趋势图", "做一个暖白杂志感的内容交付看板，用网格卡片展示", "做一个紧凑的潜客转化看板，聚焦重点任务和转化数据"].forEach((text) => {
      const chip = el("button", "sb-create-chip", text);
      chip.type = "button";
      chip.disabled = creationBusy;
      chip.addEventListener("click", () => submitCreationPrompt(text));
      chips.appendChild(chip);
    });
    composer.appendChild(chips);
    wrap.append(composer, el("div", "sb-create-note", "看板只改变视觉呈现，不改动任务、Agent 执行和原对话数据。"));
    return wrap;
  }

  function appendTaskSection(wrap, room) {
    const tasks = listTasks().filter((task) => !room || projectRecordMatches(task, room));
    const tsec = el("div", "sb-dash-tasks");
    const thead = el("div", "sb-dash-sec-head");
    thead.append(el("span", "sb-dash-sec-title", "任务动态"), el("span", "sb-dash-sec-desc", "点击回到任务对话"));
    tsec.appendChild(thead);
    if (!tasks.length) {
      tsec.appendChild(el("div", "sb-dash-task-empty", "还没有任务，从「新建任务」开始"));
    } else {
      const row = el("div", "sb-dash-task-row");
      for (const task of tasks.slice(0, 8)) {
        const chip = el("button", "sb-dash-task");
        chip.type = "button";
        chip.setAttribute("aria-label", `回到任务对话：${task.title || "未命名任务"}`);
        const color = task.status === "done" ? "#57B26A" : task.status === "approval" ? "#D45B5B" : "#E8A33D";
        const dot = el("span", "sb-dash-dot");
        dot.style.background = color;
        chip.appendChild(dot);
        chip.appendChild(el("span", "sb-dash-task-title", task.title || "未命名任务"));
        if (task.runtimeAgentName && task.activeSkillName) {
          chip.appendChild(el("span", "sb-dash-task-runtime", `${task.runtimeAgentName} · ${task.activeSkillName}`));
        }
        chip.addEventListener("click", () => reopenTaskConversation({ task, teamLive }));
        row.appendChild(chip);
      }
      tsec.appendChild(row);
    }
    wrap.appendChild(tsec);
  }

  function canvasWidgetLabel(widgetId) {
    return { metrics: "关键指标", records: "实时明细", trend: "项目趋势", files: "项目产出", tasks: "业务任务" }[widgetId] || "业务组件";
  }

  function canvasPlacementStyle(placement) {
    return {
      gridColumn: `${placement.x + 1} / span ${Math.min(4 - placement.x, placement.w)}`,
      gridRow: `${placement.y + 1} / span ${placement.h}`
    };
  }

  function canvasRunStatus(status) {
    return { queued: "排队中", running: "执行中", approval: "待确认", completed: "已完成", failed: "失败", cancelled: "已取消" }[status] || "排队中";
  }

  function renderCanvasBoard(room, dashboard, config, { editing = false } = {}) {
    const canvas = config.canvas || createDefaultCanvas();
    const board = el("div", "sb-canvas-board");
    const visible = new Set(config.view?.components || ["metrics", "records", "trend", "files", "tasks"]);
    const placements = canvas.placements.filter((placement) => visible.has(placement.widgetId));
    const tasks = (dashboard?.tasks || tasksForRoom(room)).map((task) => ({
      ...task,
      columnTitle: taskProjectionStatus(task.status),
      detail: task.detail || task.preview || "等待执行结果"
    }));

    if (!placements.length) {
      board.appendChild(el("div", "sb-canvas-empty", editing ? "还没有组件，先从左侧展示组件中开启一个。" : "这块看板还没有可展示的组件。"));
    }

    placements.forEach((placement) => {
      const widget = el("section", `sb-canvas-widget sb-canvas-widget-${placement.widgetId}${editing ? " sb-canvas-widget-edit" : ""}`);
      Object.assign(widget.style, canvasPlacementStyle(placement));
      const head = el("div", "sb-canvas-widget-head");
      head.appendChild(el("div", "sb-canvas-widget-label", canvasWidgetLabel(placement.widgetId)));
      head.appendChild(el("div", "sb-canvas-widget-kicker", `MOUNT / ${placement.mountId.replace("mount-", "")}`));
      if (editing) {
        const controls = el("div", "sb-canvas-widget-controls");
        [["←", { x: Math.max(0, placement.x - 1) }, "向左移动"], ["→", { x: Math.min(3, placement.x + 1) }, "向右移动"], ["×", null, "移除组件"]].forEach(([label, patch, title]) => {
          const button = el("button", null, label);
          button.type = "button";
          button.title = title;
          button.setAttribute("aria-label", title);
          button.addEventListener("click", () => {
            if (patch) editingConfig = updateCanvasPlacement(editingConfig, placement.mountId, patch);
            else editingConfig = removeCanvasWidget(editingConfig, placement.mountId);
            render();
          });
          controls.appendChild(button);
        });
        head.appendChild(controls);
      }
      widget.appendChild(head);

      if (placement.widgetId === "metrics") {
        const primary = dashboard?.primary || { label: "尚无结果", value: 0, unit: "" };
        const value = el("div", "sb-canvas-widget-value");
        value.append(String(primary.value), el("span", "sb-canvas-widget-unit", primary.unit || ""));
        const deltaNote = Number.isFinite(dashboard?.delta)
          ? `${dashboard.delta > 0 ? "+" : ""}${dashboard.delta}% 较前一日`
          : "暂无历史对比";
        widget.append(value, el("div", "sb-canvas-widget-note", `${dashboard?.dataState === "demo" ? "示例数据 · " : ""}${deltaNote} · ${dashboard?.chartNote || "等待真实任务结果"}`));
        const kpiStrip = el("div", "sb-canvas-kpi-strip");
        (dashboard?.stats || []).slice(0, 3).forEach((stat) => {
          const kpi = el("div", "sb-canvas-kpi");
          kpi.append(
            el("div", "sb-canvas-kpi-value", `${stat.value ?? 0}${stat.unit || ""}`),
            el("div", "sb-canvas-kpi-label", stat.label || "状态")
          );
          kpiStrip.appendChild(kpi);
        });
        if (kpiStrip.childElementCount) widget.appendChild(kpiStrip);
        const actions = el("div", "sb-canvas-widget-actions");
        const run = el("button", "sb-canvas-mini-action", "运行复盘 Agent");
        run.type = "button";
        run.addEventListener("click", () => runCanvasWidget(room, placement, `请基于${primary.label}和项目指标生成销售复盘，列出下一步动作。`));
        actions.appendChild(run);
        widget.appendChild(actions);
      } else if (placement.widgetId === "records") {
        const list = el("div", "sb-canvas-widget-list");
        (dashboard?.records?.items || []).slice(0, 5).forEach((item) => {
          const row = el("div", "sb-canvas-record");
          const title = dashboard?.records?.mode === "result-summary" ? (item.resultTitle || "结果更新") : item.title;
          const meta = dashboard?.records?.mode === "result-summary" ? `${item.title} · ${item.meta}` : item.meta;
          row.append(el("div", "sb-canvas-record-title", title), el("div", "sb-canvas-record-value", item.value), el("div", "sb-canvas-record-meta", meta), el("div", "sb-canvas-record-status", item.status));
          list.appendChild(row);
        });
        widget.appendChild(list);
        const run = el("button", "sb-canvas-mini-action", "推进高意向触达");
        run.type = "button";
        run.addEventListener("click", () => runCanvasWidget(room, placement, `请根据${dashboard?.records?.title || "实时线索明细"}推进高意向客户触达，核对联系方式、意向等级和下一步动作。`));
        widget.appendChild(el("div", "sb-canvas-widget-actions")).appendChild(run);
      } else if (placement.widgetId === "trend") {
        const series = dashboard?.series?.[0]?.values?.slice(-10) || [];
        if (!series.length) {
          widget.appendChild(el("div", "sb-canvas-empty", "暂无足够历史数据"));
        }
        const bars = el("div", "sb-canvas-bars");
        const max = Math.max(...series, 1);
        series.forEach((value) => { const bar = el("i"); bar.style.height = `${Math.max(12, Math.round((value / max) * 100))}%`; bars.appendChild(bar); });
        if (series.length) {
          const latest = series.at(-1) ?? 0;
          const first = series[0] ?? latest;
          const trendDelta = first ? Math.round(((latest - first) / first) * 100) : 0;
          const summary = el("div", "sb-canvas-trend-summary");
          summary.append(
            el("span", null, dashboard?.chartNote || "最近任务更新"),
            el("strong", null, `${latest} · ${trendDelta >= 0 ? "+" : ""}${trendDelta}%`)
          );
          widget.append(bars, summary);
        }
      } else if (placement.widgetId === "files") {
        const list = el("div", "sb-canvas-widget-list");
        (dashboard?.outputs || []).slice(0, 5).forEach((output) => {
          const row = el("div", "sb-canvas-file");
          const extension = String(output.name || "FILE").split(".").at(-1)?.slice(0, 4).toUpperCase() || "FILE";
          row.append(el("span", "sb-canvas-file-tag", extension), el("span", "sb-canvas-file-name", output.name), el("span", "sb-canvas-file-at", output.at ? formatTime(output.at) : output.owner || ""));
          if (output.id) row.addEventListener("click", () => openFileCenterPage({ initialFileId: output.id }));
          list.appendChild(row);
        });
        widget.appendChild(list);
      } else if (placement.widgetId === "tasks") {
        const list = el("div", "sb-canvas-widget-list");
        tasks.slice(0, 6).forEach((task) => {
          const row = el("div", "sb-canvas-task");
          const dot = el("span", "sb-canvas-task-dot");
          dot.style.background = task.status === "done" ? "#57B26A" : task.status === "approval" ? "#D45B5B" : "#E8A33D";
          const taskCopy = el("div");
          taskCopy.append(el("div", "sb-canvas-task-title", task.title), el("div", "sb-canvas-task-meta", `${task.columnTitle} · ${task.detail || "等待执行结果"}`));
          row.append(dot, taskCopy);
          row.addEventListener("click", () => {
            const sourceTask = listTasks().find((entry) => entry.id === task.id);
            if (sourceTask) reopenTaskConversation({ task: sourceTask, teamLive });
          });
          list.appendChild(row);
        });
        widget.appendChild(list);
      }

      const annotation = canvas.annotations.find((item) => item.mountId === placement.mountId);
      if (annotation) widget.appendChild(el("div", "sb-canvas-annotation", annotation.text));
      if (editing) {
        const annotate = el("button", "sb-canvas-mini-action", annotation ? "修改批注" : "添加批注");
        annotate.type = "button";
        annotate.addEventListener("click", () => {
          const value = globalThis.prompt?.("写下这个组件的工作备注", annotation?.text || "");
          if (value?.trim()) { editingConfig = addCanvasAnnotation(editingConfig, { mountId: placement.mountId, text: value }); render(); }
        });
        widget.appendChild(el("div", "sb-canvas-widget-actions")).appendChild(annotate);
      }
      board.appendChild(widget);
    });
    return board;
  }

  function runCanvasWidget(room, placement, prompt) {
    if (!room?.id) return;
    startAgentAction(room, { title: canvasWidgetLabel(placement.widgetId), taskText: prompt });
    const task = tasksForRoom(room)[0];
    if (!task) return;
    const next = addCanvasRun(configFor(room), { mountId: placement.mountId, taskId: task.id, prompt, status: task.status === "approval" ? "approval" : "running" });
    writeBoardConfig(room.id, next);
    render();
  }

  function renderCanvasRoom(room) {
    const dashboard = dashboardFor(room);
    const config = configFor(room);
    const view = config.view || {};
    const wrap = el("div", `sb-canvas-shell sb-mb-view sb-view-theme-${view.theme || "light"} sb-view-accent-${view.accent || "blue"} notranslate`);
    wrap.setAttribute("translate", "no");
    const toolbar = el("div", "sb-canvas-toolbar");
    const heading = el("div", "sb-canvas-heading");
    heading.append(el("div", "sb-canvas-eyebrow", "DIGITAL EMPLOYEE WORKSPACE"), el("div", "sb-canvas-title", config.title), el("div", "sb-canvas-subtitle", `${room.goal || "围绕销售结果推进业务"} · ${dashboard?.members?.length || room.members?.length || 0} 位数字员工`));
    const dataState = el("div", `sb-canvas-data-state sb-${dashboard?.dataState || "empty"}`, dashboard?.dataState === "live" ? "实时任务数据" : dashboard?.dataState === "demo" ? "示例业务数据" : "等待真实任务数据");
    heading.appendChild(dataState);
    toolbar.appendChild(heading);
    const actions = el("div", "sb-canvas-actions");
    const edit = el("button", "sb-canvas-action sb-canvas-action-primary", "✎ 修改");
    edit.type = "button";
    edit.setAttribute("aria-label", "修改看板视觉与组件布局");
    edit.addEventListener("click", () => enterEditor(room));
    const refresh = el("button", "sb-canvas-action", refreshing ? "刷新中…" : "↻ 刷新");
    refresh.type = "button";
    refresh.disabled = refreshing;
    refresh.setAttribute("aria-label", "刷新项目组数据");
    refresh.addEventListener("click", () => { if (!refreshing) loadRooms(); });
    const focus = el("button", "sb-canvas-action", focusMode ? "⤢ 退出" : "⤢ 全屏");
    focus.type = "button";
    focus.setAttribute("aria-label", focusMode ? "退出看板全屏" : "进入看板全屏");
    focus.addEventListener("click", toggleFocus);
    const remove = el("button", "sb-canvas-action", "删除");
    remove.type = "button";
    remove.setAttribute("aria-label", "删除当前看板配置");
    remove.addEventListener("click", () => {
      const confirmed = globalThis.confirm ? globalThis.confirm(`删除“${config.title}”的视觉配置？项目组和任务数据不会被删除。`) : true;
      if (!confirmed) return;
      removeBoardConfig(room.id);
      selectedRoom = null;
      render();
    });
    actions.append(edit, refresh, focus, remove);
    toolbar.appendChild(actions);
    wrap.appendChild(toolbar);
    wrap.appendChild(renderCanvasBoard(room, dashboard, config));

    const latestRun = config.canvas?.runs?.[0];
    const linkedTask = latestRun?.taskId ? listTasks().find((task) => task.id === latestRun.taskId) : null;
    if (latestRun && linkedTask) {
      const currentStatus = linkedTask.status === "done" ? "completed" : linkedTask.status === "approval" ? "approval" : linkedTask.status === "failed" ? "failed" : linkedTask.status === "blocked" ? "cancelled" : "running";
      if (latestRun.status !== currentStatus) latestRun.status = currentStatus;
    }
    if (latestRun) {
      const runbar = el("div", "sb-canvas-runbar");
      runbar.append(el("strong", null, "最近一次组件运行"), el("span", null, latestRun.prompt || "业务组件执行"));
      const status = el("span", `sb-canvas-run-status${latestRun.status === "completed" ? " is-completed" : ""}`, canvasRunStatus(latestRun.status));
      runbar.appendChild(status);
      wrap.appendChild(runbar);
    }
    const history = config.canvas?.history || [];
    if (history.length) {
      const historyWrap = el("section", "sb-canvas-history");
      historyWrap.appendChild(el("div", "sb-canvas-history-title", "组件运行历史"));
      history.slice(0, 6).forEach((entry) => {
        const row = el("div", "sb-canvas-history-row");
        row.append(el("span", null, entry.title), el("span", null, `${canvasRunStatus(entry.status)} · ${formatTime(entry.createdAt)}`));
        historyWrap.appendChild(row);
      });
      wrap.appendChild(historyWrap);
    }
    appendTaskSection(wrap, room);
    return wrap;
  }

  function renderEditor(room) {
    editingConfig = normalizeBoardConfig(editingConfig, configFor(room));
    const wrap = el("div", "sb-editor sb-dash notranslate");
    wrap.setAttribute("translate", "no");
    const head = el("div", "sb-editor-head");
    const copy = el("div", "sb-editor-copy");
    copy.appendChild(el("div", "sb-editor-eyebrow", creatingBoard ? "CREATE SALES BOARD" : "CUSTOMIZE SALES BOARD"));
    const titleInput = document.createElement("input");
    titleInput.className = "sb-editor-title-input";
    titleInput.value = editingConfig.title;
    titleInput.placeholder = "输入看板名称";
    titleInput.setAttribute("aria-label", "看板名称");
    titleInput.addEventListener("input", () => { editingConfig.title = titleInput.value; });
    copy.appendChild(titleInput);
    copy.appendChild(el("div", "sb-editor-subtitle", "把销售线索、触达动作和交付结果放进同一块工作台。"));
    head.appendChild(copy);
    const actions = el("div", "sb-editor-actions");
    const cancel = el("button", "sb-editor-button", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", cancelEditor);
    const save = el("button", "sb-editor-button sb-editor-save", "保存修改");
    save.type = "button";
    save.addEventListener("click", saveEditor);
    actions.append(cancel, save);
    head.appendChild(actions);
    wrap.appendChild(head);

    const columns = el("div", "sb-editor-columns");
    editingConfig.columns.forEach((column, columnIndex) => {
      const columnEl = el("section", "sb-editor-column");
      const columnHead = el("div", "sb-editor-column-head");
      const columnTitle = document.createElement("input");
      columnTitle.className = "sb-column-title-input";
      columnTitle.value = column.title;
      columnTitle.setAttribute("aria-label", `${column.title}列名称`);
      columnTitle.addEventListener("input", () => { column.title = columnTitle.value; });
      columnHead.appendChild(columnTitle);
      const tools = el("div", "sb-column-tools");
      const moveLeft = el("button", "sb-column-icon", "←");
      moveLeft.type = "button";
      moveLeft.title = "向左移动列";
      moveLeft.setAttribute("aria-label", "向左移动列");
      moveLeft.disabled = columnIndex === 0;
      moveLeft.addEventListener("click", () => { editingConfig = moveBoardColumn(editingConfig, column.id, "left"); render(); });
      const moveRight = el("button", "sb-column-icon", "→");
      moveRight.type = "button";
      moveRight.title = "向右移动列";
      moveRight.setAttribute("aria-label", "向右移动列");
      moveRight.disabled = columnIndex === editingConfig.columns.length - 1;
      moveRight.addEventListener("click", () => { editingConfig = moveBoardColumn(editingConfig, column.id, "right"); render(); });
      const remove = el("button", "sb-column-icon", "×");
      remove.type = "button";
      remove.title = "删除列";
      remove.setAttribute("aria-label", "删除列");
      remove.disabled = editingConfig.columns.length <= 1;
      remove.addEventListener("click", () => {
        if (editingConfig.columns.length <= 1) return;
        const confirmed = globalThis.confirm ? globalThis.confirm(`删除“${column.title}”及其中的任务？`) : true;
        if (confirmed) { editingConfig = removeBoardColumn(editingConfig, column.id); render(); }
      });
      tools.append(moveLeft, moveRight, remove);
      columnHead.appendChild(tools);
      columnEl.appendChild(columnHead);

      column.tasks.forEach((task) => {
        const taskEl = el("div", "sb-editor-task");
        const taskInput = document.createElement("input");
        taskInput.className = "sb-editor-task-input";
        taskInput.value = task.title;
        taskInput.placeholder = "任务名称，例如：审核首触话术";
        taskInput.setAttribute("aria-label", "任务名称");
        taskInput.addEventListener("input", () => { task.title = taskInput.value; });
        const detail = document.createElement("textarea");
        detail.className = "sb-editor-task-detail";
        detail.value = task.detail || "";
        detail.placeholder = "补充业务目标或验收条件";
        detail.setAttribute("aria-label", "任务说明");
        detail.addEventListener("input", () => { task.detail = detail.value; });
        const status = document.createElement("select");
        status.className = "sb-editor-task-status";
        status.setAttribute("aria-label", "任务状态");
        [["todo", "待跟进"], ["doing", "触达中"], ["approval", "待审核"], ["done", "已完成"]].forEach(([value, label]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          option.selected = task.status === value;
          status.appendChild(option);
        });
        status.addEventListener("change", () => { task.status = status.value; });
        const removeTask = el("button", "sb-task-remove", "删除任务");
        removeTask.type = "button";
        removeTask.setAttribute("aria-label", `删除任务：${task.title}`);
        removeTask.addEventListener("click", () => { editingConfig = removeBoardTask(editingConfig, column.id, task.id); render(); });
        taskEl.append(taskInput, detail, status, removeTask);
        columnEl.appendChild(taskEl);
      });

      const addTask = el("button", "sb-editor-add-task", "+ 添加业务任务");
      addTask.type = "button";
      addTask.addEventListener("click", () => {
        editingConfig = addBoardTask(editingConfig, column.id, { title: "新销售跟进任务", detail: "填写客户、触达动作或验收条件", status: column.id });
        render();
      });
      columnEl.appendChild(addTask);
      columns.appendChild(columnEl);
    });

    const addColumn = el("button", "sb-editor-column-add", "+ 添加一列");
    addColumn.type = "button";
    addColumn.addEventListener("click", () => { editingConfig = addBoardColumn(editingConfig, "新业务阶段"); render(); });
    columns.appendChild(addColumn);
    wrap.appendChild(columns);
    wrap.appendChild(el("div", "sb-editor-note", "任务状态用于“整理”自动归类；看板任务是业务展示配置，任务动态仍保留在页面底部并可回到原对话。"));
    return wrap;
  }

  function renderViewEditor(room) {
    editingConfig = normalizeBoardConfig(editingConfig, configFor(room));
    const view = editingConfig.view;
    const dashboard = dashboardFor(room);
    const wrap = el("div", "sb-view-editor sb-dash notranslate");
    wrap.setAttribute("translate", "no");
    const head = el("div", "sb-view-editor-head");
    const copy = el("div", "sb-view-editor-copy");
    copy.appendChild(el("div", "sb-editor-eyebrow", creatingBoard ? "CREATE BOARD VIEW" : "CUSTOMIZE BOARD VIEW"));
    const titleInput = document.createElement("input");
    titleInput.className = "sb-editor-title-input";
    titleInput.value = editingConfig.title;
    titleInput.placeholder = "输入看板名称";
    titleInput.setAttribute("aria-label", "看板名称");
    titleInput.addEventListener("input", () => { editingConfig.title = titleInput.value; });
    copy.appendChild(titleInput);
    copy.appendChild(el("div", "sb-view-editor-subtitle", "调整主题、排版和信息重点；业务任务与 Agent 执行数据保持不变。"));
    head.appendChild(copy);
    const actions = el("div", "sb-editor-actions");
    const cancel = el("button", "sb-editor-button", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", cancelEditor);
    const save = el("button", "sb-editor-button sb-editor-save", "保存视图");
    save.type = "button";
    save.addEventListener("click", saveEditor);
    actions.append(cancel, save);
    head.appendChild(actions);
    wrap.appendChild(head);

    const layout = el("div", "sb-view-editor-layout");
    const panel = el("div", "sb-view-editor-panel");
    const updateView = (patch) => { editingConfig.view = { ...editingConfig.view, ...patch }; render(); };
    const addOptionGroup = (label, options, current, key) => {
      const section = el("div", "sb-view-editor-section");
      section.appendChild(el("div", "sb-view-editor-label", label));
      const optionsEl = el("div", "sb-view-editor-options");
      options.forEach(([value, text]) => {
        const button = el("button", `sb-view-option${current === value ? " is-selected" : ""}`, text);
        button.type = "button";
        button.setAttribute("aria-pressed", String(current === value));
        button.addEventListener("click", () => updateView({ [key]: value }));
        optionsEl.appendChild(button);
      });
      section.appendChild(optionsEl);
      panel.appendChild(section);
    };
    const addSwatchGroup = (label, values, current, key) => {
      const section = el("div", "sb-view-editor-section");
      section.appendChild(el("div", "sb-view-editor-label", label));
      const optionsEl = el("div", "sb-view-editor-options");
      values.forEach(([value, text]) => {
        const button = el("button", `sb-view-swatch sb-view-swatch-${value}${current === value ? " is-selected" : ""}`);
        button.type = "button";
        button.title = text;
        button.setAttribute("aria-label", text);
        button.setAttribute("aria-pressed", String(current === value));
        button.addEventListener("click", () => updateView({ [key]: value }));
        optionsEl.appendChild(button);
      });
      section.appendChild(optionsEl);
      panel.appendChild(section);
    };
    addSwatchGroup("主题色", [["light", "浅色"], ["ink", "深色"], ["paper", "暖白"]], view.theme, "theme");
    addSwatchGroup("强调色", [["blue", "蓝色"], ["green", "绿色"], ["orange", "橙色"]], view.accent, "accent");
    addOptionGroup("页面排版", [["dashboard", "仪表盘"], ["grid", "网格卡片"], ["focus", "聚焦重点"]], view.layout, "layout");
    addOptionGroup("信息密度", [["comfortable", "舒展"], ["compact", "紧凑"]], view.density, "density");
    const components = el("div", "sb-view-editor-section");
    components.appendChild(el("div", "sb-view-editor-label", "展示组件"));
    const componentLabels = [["records", "实时明细"], ["metrics", "关键指标"], ["files", "项目产出"], ["trend", "趋势图"], ["tasks", "任务动态"]];
    componentLabels.forEach(([key, label]) => {
      const row = el("label", "sb-view-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = view.components.includes(key);
      checkbox.addEventListener("change", () => {
        const next = new Set(view.components);
        if (checkbox.checked) next.add(key);
        else if (next.size > 1) next.delete(key);
        else { checkbox.checked = true; return; }
        updateView({ components: [...next] });
      });
      row.append(checkbox, label);
      components.appendChild(row);
    });
    panel.appendChild(components);
    const canvasSection = el("div", "sb-view-editor-section");
    canvasSection.appendChild(el("div", "sb-view-editor-label", "组件画布"));
    canvasSection.appendChild(el("div", "sb-editor-note", "拖动感由位置按钮完成；每个组件可移除，批注和运行记录会跟随组件保存。"));
    const canvasComponents = [
      ["metrics", "关键指标"],
      ["records", "实时明细"],
      ["trend", "项目趋势"],
      ["files", "项目产出"],
      ["tasks", "业务任务"]
    ];
    const activeWidgets = new Set((editingConfig.canvas?.placements || []).map((placement) => placement.widgetId));
    canvasComponents.forEach(([key, label]) => {
      const row = el("label", "sb-view-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = activeWidgets.has(key);
      checkbox.addEventListener("change", () => {
        let current = editingConfig.canvas || createDefaultCanvas();
        if (checkbox.checked && !current.placements.some((placement) => placement.widgetId === key)) {
          const index = current.placements.length;
          current.placements.push({ mountId: `mount-${key}`, widgetId: key, x: index % 4, y: Math.floor(index / 4) * 2, w: key === "records" ? 2 : key === "tasks" ? 4 : 1, h: key === "metrics" ? 1 : 2, viewState: {} });
        } else if (!checkbox.checked) {
          const mountId = current.placements.find((placement) => placement.widgetId === key)?.mountId;
          if (mountId) editingConfig = removeCanvasWidget(editingConfig, mountId);
        }
        if (checkbox.checked) editingConfig.canvas = current;
        render();
      });
      row.append(checkbox, label);
      canvasSection.appendChild(row);
    });
    panel.appendChild(canvasSection);
    const templateSection = el("div", "sb-view-editor-section");
    templateSection.appendChild(el("div", "sb-view-editor-label", "业务模板"));
    templateSection.appendChild(el("div", "sb-view-template-note", "调整业务阶段和模板任务；不会修改真实任务、对话或执行结果。"));
    const templateColumns = el("div", "sb-view-template-columns");
    const statusOptions = [["todo", "待跟进"], ["doing", "进行中"], ["approval", "待确认"], ["done", "已完成"]];
    editingConfig.columns.forEach((column, columnIndex) => {
      const columnEl = el("section", "sb-view-template-column");
      const columnHead = el("div", "sb-view-template-column-head");
      const columnTitle = document.createElement("input");
      columnTitle.className = "sb-view-template-title";
      columnTitle.value = column.title;
      columnTitle.setAttribute("aria-label", `${column.title}阶段名称`);
      columnTitle.addEventListener("input", () => { column.title = columnTitle.value; });
      const tools = el("div", "sb-view-template-tools");
      const moveLeft = document.createElement("button");
      moveLeft.type = "button";
      moveLeft.textContent = "←";
      moveLeft.title = "向左移动阶段";
      moveLeft.setAttribute("aria-label", "向左移动阶段");
      moveLeft.disabled = columnIndex === 0;
      moveLeft.addEventListener("click", () => { editingConfig = moveBoardColumn(editingConfig, column.id, "left"); render(); });
      const moveRight = document.createElement("button");
      moveRight.type = "button";
      moveRight.textContent = "→";
      moveRight.title = "向右移动阶段";
      moveRight.setAttribute("aria-label", "向右移动阶段");
      moveRight.disabled = columnIndex === editingConfig.columns.length - 1;
      moveRight.addEventListener("click", () => { editingConfig = moveBoardColumn(editingConfig, column.id, "right"); render(); });
      const removeColumn = document.createElement("button");
      removeColumn.type = "button";
      removeColumn.textContent = "×";
      removeColumn.title = "删除阶段";
      removeColumn.setAttribute("aria-label", `删除阶段：${column.title}`);
      removeColumn.disabled = editingConfig.columns.length <= 1;
      removeColumn.addEventListener("click", () => {
        if (editingConfig.columns.length <= 1) return;
        const confirmed = globalThis.confirm ? globalThis.confirm(`删除“${column.title}”及其中的模板任务？`) : true;
        if (confirmed) { editingConfig = removeBoardColumn(editingConfig, column.id); render(); }
      });
      tools.append(moveLeft, moveRight, removeColumn);
      columnHead.append(columnTitle, tools);
      columnEl.appendChild(columnHead);
      column.tasks.forEach((task) => {
        const taskEl = el("div", "sb-view-template-task");
        const taskTitle = document.createElement("input");
        taskTitle.value = task.title;
        taskTitle.placeholder = "模板任务名称";
        taskTitle.setAttribute("aria-label", "模板任务名称");
        taskTitle.addEventListener("input", () => { task.title = taskTitle.value; });
        taskTitle.addEventListener("change", () => { editingConfig = updateBoardTask(editingConfig, column.id, task.id, { title: taskTitle.value }); });
        const taskDetail = document.createElement("textarea");
        taskDetail.value = task.detail || "";
        taskDetail.placeholder = "补充目标或验收条件";
        taskDetail.setAttribute("aria-label", "模板任务说明");
        taskDetail.addEventListener("input", () => { task.detail = taskDetail.value; });
        taskDetail.addEventListener("change", () => { editingConfig = updateBoardTask(editingConfig, column.id, task.id, { detail: taskDetail.value }); });
        const taskStatus = document.createElement("select");
        taskStatus.setAttribute("aria-label", "模板任务状态");
        statusOptions.forEach(([value, label]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          option.selected = task.status === value;
          taskStatus.appendChild(option);
        });
        taskStatus.addEventListener("change", () => { editingConfig = updateBoardTask(editingConfig, column.id, task.id, { status: taskStatus.value }); render(); });
        const removeTask = el("button", "sb-view-template-task-remove", "删除模板任务");
        removeTask.type = "button";
        removeTask.setAttribute("aria-label", `删除模板任务：${task.title}`);
        removeTask.addEventListener("click", () => { editingConfig = removeBoardTask(editingConfig, column.id, task.id); render(); });
        taskEl.append(taskTitle, taskDetail, taskStatus, removeTask);
        columnEl.appendChild(taskEl);
      });
      const addTask = el("button", "sb-view-template-add-task", "+ 添加模板任务");
      addTask.type = "button";
      addTask.addEventListener("click", () => { editingConfig = addBoardTask(editingConfig, column.id, { title: "新业务任务", detail: "填写目标和验收条件", status: column.id }); render(); });
      columnEl.appendChild(addTask);
      templateColumns.appendChild(columnEl);
    });
    templateSection.appendChild(templateColumns);
    const addColumn = el("button", "sb-view-template-add-column", "+ 添加业务阶段");
    addColumn.type = "button";
    addColumn.addEventListener("click", () => { editingConfig = addBoardColumn(editingConfig, "新业务阶段"); render(); });
    templateSection.appendChild(addColumn);
    const resetTemplate = el("button", "sb-editor-button", "恢复默认模板");
    resetTemplate.type = "button";
    resetTemplate.style.marginTop = "8px";
    resetTemplate.addEventListener("click", () => {
      const defaults = createDefaultBoardConfig(room, dashboard);
      editingConfig = { ...editingConfig, columns: defaults.columns };
      render();
    });
    templateSection.appendChild(resetTemplate);
    panel.appendChild(templateSection);
    const reset = el("button", "sb-editor-button", "恢复默认视觉");
    reset.type = "button";
    reset.style.marginTop = "17px";
    reset.addEventListener("click", () => { editingConfig.view = configFor(room).view; render(); });
    panel.appendChild(reset);
    layout.appendChild(panel);

    const preview = el("div", "sb-view-preview");
    preview.appendChild(el("div", "sb-view-preview-label", "LIVE PREVIEW / 实时预览"));
    const frame = el("div", `sb-view-preview-frame sb-mb-view sb-view-theme-${view.theme} sb-view-layout-${view.layout} sb-view-density-${view.density} sb-view-accent-${view.accent}`);
    const previewHero = el("div", "sb-result-hero");
    previewHero.style.display = "grid";
    previewHero.style.background = view.theme === "ink" ? "#182129" : view.theme === "paper" ? "#FFF9F0" : "#FBFBF9";
    const primaryValue = dashboard?.primary ? `${dashboard.primary.value}${dashboard.primary.unit || ""}` : "暂无";
    previewHero.append(el("div", "sb-result-hero-label", dashboard?.primary?.label || "今日新增候选"), el("div", "sb-result-hero-value", primaryValue));
    const previewBreakdown = el("div", "sb-result-breakdown");
    const breakdownItem = dashboard?.breakdown?.items?.[0];
    previewBreakdown.append(el("div", "sb-result-breakdown-title", dashboard?.breakdown?.title || "等待真实业务结果"), el("div", "sb-result-breakdown-value", breakdownItem ? `${breakdownItem.value}${breakdownItem.unit || ""}` : "暂无"));
    previewHero.appendChild(previewBreakdown);
    frame.appendChild(previewHero);
    const blocks = el("div", "sb-result-grid");
    const blockNames = [["records", "实时明细"], ["metrics", "关键指标"], ["files", "项目产出"], ["trend", "趋势图"], ["tasks", "任务动态"]];
    blockNames.filter(([key]) => view.components.includes(key)).forEach(([key, label]) => {
      const block = el("div", "sb-result-card sb-result-proof");
      const blockValue = key === "metrics" ? `${dashboard?.stats?.[0]?.value ?? 68}${dashboard?.stats?.[0]?.unit || "%"}` : key === "records" ? `${dashboard?.records?.items?.length || 0} 条` : "查看";
      block.append(el("div", "sb-result-card-kicker", label), el("div", "sb-result-proof-value", blockValue));
      blocks.appendChild(block);
    });
    frame.appendChild(blocks);
    preview.appendChild(frame);
    const canvasPreview = el("div", "sb-view-preview-canvas");
    canvasPreview.appendChild(el("div", "sb-view-preview-label", "CANVAS LAYOUT / 组件排版"));
    canvasPreview.appendChild(renderCanvasBoard(room, dashboard, editingConfig, { editing: true }));
    preview.appendChild(canvasPreview);
    preview.appendChild(el("div", "sb-view-editor-footnote", "预览使用当前项目组真实业务数据；保存后看板首页会按此视图呈现。"));
    layout.appendChild(preview);
    wrap.appendChild(layout);
    return wrap;
  }

  function renderRoom(room) {
    if (creationMode) return renderCreationConversation(room);
    if (editMode) return renderViewEditor(room);
    return renderCanvasRoom(room);
    /* Legacy result layout retained below as a reference for the recovered data model. */
    const wrap = el("div", "sb-dash sb-mb-view notranslate");
    wrap.setAttribute("translate", "no");
    const back = el("button", "sb-mb-back", "← 返回项目组");
    back.addEventListener("click", () => { selectedRoom = null; editMode = false; editingConfig = null; creatingBoard = false; focusMode = false; page.root.classList.remove("sb-dash-focus"); showCloud = false; disposeCloud(); render(); });
    wrap.appendChild(back);
    const dashboard = projectResultDashboard(room, { teamLive }) || projectResultDashboard(SEED_SALES_ROOM, { teamLive });
    if (!dashboard) {
      wrap.appendChild(el("div", "sb-dash-state", "这个项目组还没有可用的结果数据"));
      return wrap;
    }
    const config = configFor(room);
    const view = config.view || {};
    wrap.classList.add(`sb-view-theme-${view.theme || "light"}`, `sb-view-layout-${view.layout || "dashboard"}`, `sb-view-density-${view.density || "comfortable"}`, `sb-view-accent-${view.accent || "blue"}`);
    const toolbar = el("div", "sb-board-toolbar");
    toolbar.appendChild(el("div", "sb-board-toolbar-title", config.title));
    const edit = el("button", "sb-board-action sb-board-action-primary", "✎ 修改");
    edit.type = "button";
    edit.setAttribute("aria-label", "修改看板配置");
    edit.addEventListener("click", () => enterEditor(room));
    const organize = el("button", "sb-board-action", "☷ 整理");
    organize.type = "button";
    organize.setAttribute("aria-label", "按业务状态整理任务");
    organize.addEventListener("click", () => { writeBoardConfig(room.id, organizeBoardTasks(config)); render(); });
    const focus = el("button", "sb-board-action", focusMode ? "⤢ 退出全屏" : "⤢ 全屏");
    focus.type = "button";
    focus.setAttribute("aria-label", focusMode ? "退出看板全屏" : "进入看板全屏");
    focus.addEventListener("click", toggleFocus);
    const refresh = el("button", "sb-board-action", refreshing ? "刷新中…" : "↻ 刷新");
    refresh.type = "button";
    refresh.disabled = refreshing;
    refresh.setAttribute("aria-label", "刷新项目数据");
    refresh.addEventListener("click", () => { if (!refreshing) loadRooms(); });
    toolbar.append(edit, organize, focus, refresh);
    wrap.appendChild(toolbar);

    const hero = el("section", "sb-result-hero");
    const heroCopy = el("div", "sb-result-copy");
    const person = el("div", "sb-result-person");
    const projectAvatar = el("div", "sb-mb-avatar");
    projectAvatar.style.background = projectAccent(room);
    mountGroupAvatar(projectAvatar, [room.owner, ...(room.members || [])], { alt: `${room.name || "项目组"}成员头像` });
    person.appendChild(projectAvatar);
    const personCopy = el("div", "sb-result-person-copy");
    personCopy.append(
      el("div", "sb-mb-name", config.title),
      el("div", "sb-mb-headline", `PROJECT RESULT BOARD · ${dashboard.members.length} DIGITAL EMPLOYEES`)
    );
    person.appendChild(personCopy);
    heroCopy.appendChild(person);
    heroCopy.appendChild(el("h1", "sb-result-hero-label", dashboard.primary.label));
    const heroValue = el("div", "sb-result-hero-value");
    heroValue.append(String(dashboard.primary.value), el("small", null, dashboard.primary.unit));
    heroCopy.appendChild(heroValue);
    const deltaCopy = Number.isFinite(dashboard.delta)
      ? `${dashboard.delta > 0 ? "+" : ""}${dashboard.delta}% · 较前一日`
      : "暂无历史对比";
    heroCopy.appendChild(el("div", "sb-result-hero-delta", deltaCopy));
    heroCopy.appendChild(el("div", "sb-result-context", room.goal || `${dashboard.members.length} 位数字员工协同交付`));
    hero.appendChild(heroCopy);
    const breakdown = el("section", "sb-result-breakdown");
    breakdown.appendChild(el("div", "sb-result-breakdown-title", dashboard.breakdown.title));
    for (const item of dashboard.breakdown.items) {
      const row = el("div", "sb-result-breakdown-row");
      const meta = el("div", "sb-result-breakdown-meta");
      meta.appendChild(el("span", "sb-result-breakdown-label", item.label));
      const value = el("span", "sb-result-breakdown-value");
      value.append(String(item.value), el("small", null, item.unit));
      meta.append(value, el("span", "sb-result-breakdown-ratio", `${item.ratio}%`));
      row.appendChild(meta);
      const track = el("div", "sb-result-breakdown-track");
      const fill = el("span", "sb-result-breakdown-fill");
      fill.style.width = `${Math.min(100, item.ratio)}%`;
      track.appendChild(fill);
      row.appendChild(track);
      breakdown.appendChild(row);
    }
    hero.appendChild(breakdown);
    wrap.appendChild(hero);

    if (showCloud) {
      const snapshotKey = projectCloudViewKey(room, dashboard);
      if (cloudView?.key !== snapshotKey) {
        disposeCloud();
        cloudView = {
          key: snapshotKey,
          view: createSnapshotScreen(dashboard.cloudAgentType, { height: 300, projectId: room.id || null })
        };
      }
      const embed = el("div", "sb-mb-cloudembed");
      embed.appendChild(cloudView.view.el);
      wrap.appendChild(embed);
    }

    const resultGrid = el("div", "sb-result-grid");
    if (view.components?.includes("records") !== false) {
      const primary = el("section", "sb-result-card sb-result-primary");
      primary.append(el("div", "sb-result-kicker", "LATEST / 实时明细"), el("div", "sb-result-record-heading", dashboard.records.title));
      const recordList = el("div", "sb-result-record-list");
      for (const item of dashboard.records.items) {
        const row = el("div", "sb-result-record");
        row.append(
          el("div", "sb-result-record-title", item.title),
          el("div", "sb-result-record-value", item.value),
          el("div", "sb-result-record-meta", item.meta),
          el("div", "sb-result-record-status", item.status)
        );
        recordList.appendChild(row);
      }
      primary.appendChild(recordList);
      const actions = el("div", "sb-result-action-row");
      actions.appendChild(agentActionButton(room, "推进线索", "推进高意向客户触达", `请根据${dashboard.records.title}推进高意向客户触达，核对联系方式、意向等级和下一步动作。`));
      primary.appendChild(actions);
      resultGrid.appendChild(primary);
    }

    if (view.components?.includes("metrics") !== false) {
      const proof = el("section", "sb-result-card sb-result-proof");
      proof.appendChild(el("div", "sb-result-card-kicker", "KEY METRICS / 关键指标"));
      const proofList = el("div", "sb-result-proof-list");
      for (const item of dashboard.stats) {
        const row = el("div", "sb-result-proof-row");
        row.appendChild(el("div", "sb-result-proof-label", item.label));
        const value = el("div", "sb-result-proof-value");
        value.append(String(item.value));
        if (item.unit) value.appendChild(el("small", null, item.unit));
        row.appendChild(value);
        proofList.appendChild(row);
      }
      proof.appendChild(proofList);
      const actions = el("div", "sb-result-action-row");
      actions.appendChild(agentActionButton(room, "生成复盘", "生成销售指标复盘", `请基于${dashboard.breakdown.title}和关键指标，生成本项目组的销售复盘与下一步建议。`));
      proof.appendChild(actions);
      resultGrid.appendChild(proof);
    }

    if (view.components?.includes("files") !== false) {
      const filesPanel = el("section", "sb-result-card sb-result-files");
      filesPanel.append(el("div", "sb-result-card-kicker", "PROJECT OUTPUT / 项目产出"), el("div", "sb-result-files-title", "最近产出文件"));
      const fileList = el("div", "sb-result-file-list");
      for (const output of dashboard.outputs) {
        const row = el("div", "sb-mb-file");
        const extension = String(output.name).split(".").at(-1)?.slice(0, 4).toUpperCase() || "FILE";
        row.append(
          el("span", "sb-mb-file-tag", extension),
          el("span", "sb-mb-file-name", output.name),
          el("span", "sb-mb-file-at", output.at ? formatTime(output.at) : output.owner)
        );
        fileList.appendChild(row);
      }
      filesPanel.appendChild(fileList);
      const actions = el("div", "sb-result-action-row");
      actions.appendChild(agentActionButton(room, "整理交付", "整理项目交付物", `请整理${room.name || "当前项目组"}最近的项目产出文件，标记需要复核和补充的交付物。`));
      filesPanel.appendChild(actions);
      resultGrid.appendChild(filesPanel);
    }
    if (resultGrid.childElementCount) wrap.appendChild(resultGrid);

    const trend = el("section", "sb-result-trend");
    const trendHead = el("div", "sb-result-trend-head");
    const trendCopy = el("div", "sb-result-trend-copy");
    trendCopy.append(el("div", "sb-result-trend-kicker", "PROJECT TREND / LAST 14 DAYS"), el("div", "sb-result-trend-title", dashboard.chartNote));
    trendHead.appendChild(trendCopy);
    const status = el("div", "sb-result-trend-status");
    const activeMember = dashboard.members.find((member) => member.agentType === dashboard.cloudAgentType);
    if (dashboard.work) {
      status.appendChild(el("div", "sb-mb-live", `${activeMember?.name || "项目组"} · ${dashboard.work.state === "done" ? "刚完成" : "正在执行"} · ${dashboard.work.phase} · ${dashboard.work.task}`));
    } else {
      status.appendChild(el("div", "sb-mb-idle", `${dashboard.members.length} 位数字员工当前待命`));
    }
    const cloudBtn = el("button", "sb-mb-cloudbtn", showCloud ? "收起项目云电脑 ×" : "查看项目云电脑 ↗");
    cloudBtn.type = "button";
    cloudBtn.setAttribute("aria-expanded", String(showCloud));
    cloudBtn.addEventListener("click", toggleCloud);
    status.appendChild(cloudBtn);
    status.appendChild(agentActionButton(room, "分析趋势", "分析项目趋势", `请分析${dashboard.chartNote}，找出增长、下滑和需要 Agent 介入的环节。`));
    trendHead.appendChild(status);
    trend.appendChild(trendHead);
    const chart = el("div", "sb-result-chart-canvas");
    const chead = el("div", "sb-mb-chart-head");
    const chartTotals = dashboard.series
      .map((item) => `${item.label}合计 ${item.values.reduce((sum, value) => sum + value, 0)}`)
      .join(" · ");
    chead.appendChild(el("span", "sb-mb-chart-title", chartTotals));
    const legend = el("div", "sb-mb-legend");
    for (const s of dashboard.series) {
      const item = el("span");
      const sw = el("i");
      sw.style.background = s.color;
      item.append(sw, s.label);
      legend.appendChild(item);
    }
    chead.appendChild(legend);
    chart.appendChild(chead);
    chart.appendChild(barChart(dashboard.series));
    trend.appendChild(chart);
    if (view.components?.includes("trend") !== false) wrap.appendChild(trend);
    if (view.components?.includes("tasks") !== false) appendTaskSection(wrap, room);
    return wrap;
  }

  function render({ preserveScroll = false } = {}) {
    if (disposed || !page.root.isConnected) return;
    const previousView = page.body.querySelector(".sb-dash");
    const previousScrollTop = preserveScroll ? previousView?.scrollTop || 0 : 0;
    page.body.textContent = "";
    let nextView;
    if (selectedRoom) nextView = renderRoom(selectedRoom);
    else nextView = renderProjects();
    if (preserveScroll) nextView.classList.add("sb-refreshing");
    page.body.appendChild(nextView);
    if (preserveScroll) nextView.scrollTop = previousScrollTop;
  }

  render();
  loadRooms();
  taskUnsubscribe = subscribeTasks(() => {
    if (!disposed && selectedRoom && !editMode && !creationMode) render({ preserveScroll: true });
  });
  pollTimer = setInterval(() => {
    if (!editMode && !page.root.contains(document.activeElement)) render({ preserveScroll: true });
  }, 3000);

  const origClose = page.close;
  page.close = () => { disposed = true; clearInterval(pollTimer); taskUnsubscribe?.(); taskUnsubscribe = null; creationTimers.forEach((timer) => clearTimeout(timer)); creationTimers = []; disposeCloud(); page.root.classList.remove("sb-dash-focus"); origClose(); };
  return page;
}

/**
 * 挂载「自动任务 → 看板」改造：改名 + 接管点击。
 * 返回 { unmount }。
 */
export function mountKanbanNav({ gateway, teamLive, openKanban = openKanbanPage } = {}) {
  const mountedDocument = globalThis.document;
  const mountedWindow = globalThis.window;
  const CustomEventClass = mountedWindow.CustomEvent || globalThis.CustomEvent;
  let disposed = false;
  let appliedRow = null;
  let pageOpen = false;
  let ownedPage = null;
  let pageGeneration = 0;
  let navigationActive = false;
  const rowOwnership = new Map();

  function notify(active) {
    mountedDocument.dispatchEvent(new CustomEventClass(NAV_EVENT, { detail: { mode: "kanban", active } }));
  }

  function activateNavigation() {
    if (navigationActive) return;
    navigationActive = true;
    if (!isNavigationRuntimeMounted(mountedDocument)) notify(true);
  }

  function deactivateNavigation() {
    if (!navigationActive) return;
    navigationActive = false;
    notify(false);
  }

  function onHijackClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (disposed || pageOpen) return;
    pageOpen = true;
    const generation = ++pageGeneration;
    activateNavigation();
    try {
      const page = openKanban({
        gateway,
        teamLive,
        onClose: () => {
          if (disposed || generation !== pageGeneration || !pageOpen) return;
          pageOpen = false;
          ownedPage = null;
          deactivateNavigation();
        }
      });
      if (!disposed && generation === pageGeneration && pageOpen) ownedPage = page || null;
    } catch (error) {
      pageOpen = false;
      pageGeneration += 1;
      ownedPage = null;
      deactivateNavigation();
      throw error;
    }
  }

  function relabel(row, ownership) {
    ownership.textNodes = ownership.textNodes.filter((entry) => {
      if (row.contains(entry.node)) return true;
      if (entry.node.nodeValue === entry.owned) entry.node.nodeValue = entry.original;
      return false;
    });
    // 改可见文案（找包含「自动任务」的文本节点）
    const walker = mountedDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes("自动任务")) {
        const original = node.nodeValue;
        const owned = original.replace("自动任务", "看板");
        let textOwnership = ownership.textNodes.find((entry) => entry.node === node);
        if (!textOwnership) {
          textOwnership = { node, original, owned };
          ownership.textNodes.push(textOwnership);
        } else {
          textOwnership.original = original;
          textOwnership.owned = owned;
        }
        node.nodeValue = owned;
      }
    }
  }

  function apply(row) {
    let ownership = rowOwnership.get(row);
    if (!ownership) {
      ownership = {
        marker: row.getAttribute("data-sb-kanban"),
        translate: row.getAttribute("translate"),
        hadNoTranslate: row.classList.contains("notranslate"),
        textNodes: []
      };
      rowOwnership.set(row, ownership);
      row.addEventListener("click", onHijackClick, true);
      row.dataset.sbKanban = "1";
      // 防 Chrome 自动翻译改写这行的文案（避免翻译↔回写互抢）
      row.setAttribute("translate", "no");
      row.classList.add("notranslate");
    }
    relabel(row, ownership);
    return true;
  }

  function release(row) {
    const ownership = rowOwnership.get(row);
    if (!row || !ownership) return;
    row.removeEventListener("click", onHijackClick, true);
    for (const text of ownership.textNodes) {
      if (text.node.nodeValue === text.owned) text.node.nodeValue = text.original;
    }
    if (row.getAttribute("data-sb-kanban") === "1") {
      if (ownership.marker == null) row.removeAttribute("data-sb-kanban");
      else row.setAttribute("data-sb-kanban", ownership.marker);
    }
    if (row.getAttribute("translate") === "no") {
      if (ownership.translate == null) row.removeAttribute("translate");
      else row.setAttribute("translate", ownership.translate);
    }
    if (!ownership.hadNoTranslate && row.classList.contains("notranslate")) row.classList.remove("notranslate");
    rowOwnership.delete(row);
  }

  function sweep() {
    if (disposed) return;
    if (appliedRow && appliedRow.isConnected && rowOwnership.has(appliedRow)
      && (appliedRow.textContent?.trim() === "自动任务" || appliedRow.textContent?.trim() === "看板")) {
      // React 重渲染可能把文案原地改回「自动任务」（节点不变，dataset 还在）——发现就补回
      if (appliedRow.textContent.includes("自动任务")) relabel(appliedRow, rowOwnership.get(appliedRow));
      return;
    }
    if (appliedRow) {
      release(appliedRow);
      appliedRow = null;
    }
    const section = mountedDocument.querySelector('[class*="_pluginSection_"]');
    if (!section) return;
    for (const row of section.querySelectorAll("div")) {
      if (row.textContent?.trim() === "自动任务" || row.textContent?.trim() === "看板") {
        // 取最内层整行（带点击行为的容器）：向上找到直接位于列表下的行
        let target = row;
        while (target.parentElement && target.parentElement !== section && !target.parentElement.className.includes("pluginList")) {
          target = target.parentElement;
        }
        appliedRow = row.closest('[dt-eid="sidebar_tab"]') || target;
        apply(appliedRow);
        break;
      }
    }
  }

  const timer = mountedWindow.setInterval(sweep, 500);
  sweep();
  console.log("[SaleBuddy] 自动任务 → 看板 已接管");
  return {
    unmount() {
      if (disposed) return;
      disposed = true;
      mountedWindow.clearInterval(timer);
      for (const row of [...rowOwnership.keys()]) release(row);
      appliedRow = null;
      const page = ownedPage;
      ownedPage = null;
      pageOpen = false;
      pageGeneration += 1;
      deactivateNavigation();
      page?.close?.();
    }
  };
}
