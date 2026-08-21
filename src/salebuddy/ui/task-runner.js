/**
 * ui/task-runner.js
 * 任务运行（对话式，Runtime 事件/视图解耦版）：
 * - 引擎（RUNS）：任务状态机 + 事件流，挂在模块级，页面切换/关闭都不中断，
 *   状态实时写入任务存储（task-store）供看板轮询。
 * - 视图（openConversation）：对话界面的渲染器——打开时重放引擎全部事件，
 *   之后订阅增量事件；审批按钮/追问通过引擎 API 回写。
 * 接管首页任务输入框的提交（Enter / 发送按钮），原生发送链路整段替换。
 * 仅拦截首页（/ 与 /home）的任务编辑器，对话页等其他 ProseMirror 不受影响。
 */
import { openPage, el } from "./pages.js";
import { addTask, updateTask } from "../agents/task-store.js";
import { addFile } from "../agents/file-store.js";
import { recordCost, rollupTask } from "../agents/resource-store.js";
import { endAllWork, beginWork, pushActivity, finishWork } from "../agents/work-live.js";
import { openFileCenterPage } from "./file-center.js";
import { BRAND, displayAgentName } from "../brand.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { activityLabelFor, clearAgentActivities, createAgentActivityBadge, setAgentActivity } from "./agent-activity.js";
import { appendRuntimeEvent, createRuntimeTask, getRuntimeSnapshot, replayRuntimeEvents } from "../runtime/task-runtime.js";
import { createGatewayEventAdapter } from "../runtime/gateway-events.js";
import { createTaskCommandClient } from "../runtime/task-command-client.js";
import { COMMAND_TYPES } from "../runtime/task-protocol.js";
import { createRemoteTask, startRemoteTask } from "../runtime/remote-task-bootstrap.js";
import {
  INTERACTION_COMMANDS,
  canIssueInteractionCommand,
  createInteractionCommand,
  localEventForInteractionCommand
} from "../runtime/interaction-commands.js";
import { resolveBusinessPrompt } from "../business/prompt-catalog.js";
import { buildTouchSimulation, parseTouchRequest } from "../business/touch-audience.js";
import { buildApprovalTimeline, buildAssignmentPlan, buildDemoTimeline, DEMO_PACING, getDemoAccessSetup } from "../runtime/demo-timeline.js";
import { requirementRequiresExternalAccess } from "../runtime/workflow-definitions.js";
import { openDouyinAuthorization } from "./douyin-auth.js";
import { PRODUCT_VISIBILITY } from "./product-visibility.js";
import { SB_ACTIONS } from "../bridge/gateway.js";

const DEMO_REVEAL_MS = Object.freeze({
  trace: 620,
  chief: 820,
  followup: 720
});

let taskRunnerContext = null;
let taskRunnerNoticeTimer = null;

function showTaskRunnerNotice(message) {
  document.querySelector(".sb-task-runner-notice")?.remove();
  const notice = document.createElement("div");
  notice.className = "sb-task-runner-notice";
  notice.textContent = message;
  document.body.appendChild(notice);
  clearTimeout(taskRunnerNoticeTimer);
  taskRunnerNoticeTimer = setTimeout(() => notice.remove(), 3200);
}

const CSS = `
.sb-chat{display:flex;flex-direction:column;height:100%;background:#FAFAFA}
.sb-task-runner-notice{position:fixed;left:50%;bottom:28px;z-index:10070;transform:translateX(-50%);max-width:min(520px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;background:#1F2329;color:#fff;font-size:12px;line-height:18px;box-shadow:0 10px 26px rgba(15,15,15,.18);animation:sb-task-runner-notice-in .18s ease-out}
@keyframes sb-task-runner-notice-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.sb-chat-scroll{flex:1;overflow-y:auto}
.sb-chat-inner{width:calc(100% - 64px);max-width:1280px;box-sizing:border-box;margin:0 auto;padding:32px 40px 28px;display:flex;flex-direction:column;gap:18px}
.sb-msg{display:flex;gap:14px;opacity:0;animation:sb-chat-in .3s forwards}
.sb-msg.sb-instant{opacity:1;animation:none}
@keyframes sb-chat-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.sb-msg.sb-user{justify-content:flex-end}
.sb-msg.sb-completion .sb-msg-bubble{border-left:3px solid #57B26A;background:linear-gradient(90deg,rgba(87,178,106,.08),#fff 38%)}
.sb-msg-avatar{flex:none;width:44px;height:44px;border-radius:13px;background:#1F2329;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;margin-top:3px;overflow:hidden;box-shadow:0 1px 4px rgba(15,15,15,.08)}
.sb-msg-main{max-width:88%;min-width:0}
.sb-msg-name{font-size:13px;color:#8A8F99;margin:0 3px 6px}
.sb-msg-bubble{background:#fff;border:1px solid rgba(15,15,15,0.07);border-radius:5px 16px 16px 16px;padding:15px 19px;font-size:15px;color:#1F2329;line-height:1.75;word-break:break-word;box-shadow:0 1px 5px rgba(15,15,15,0.04)}
.sb-msg.sb-user .sb-msg-bubble{background:#1F2329;color:#fff;border:none;border-radius:14px 4px 14px 14px}
.sb-msg.sb-user .sb-msg-main{display:flex;flex-direction:column;align-items:flex-end}
.sb-msg-typing{display:inline-flex;gap:4px;padding:4px 2px}
.sb-msg-typing i{width:5px;height:5px;border-radius:50%;background:#B0B4BB;animation:sb-chat-blink 1s infinite}
.sb-msg-typing i:nth-child(2){animation-delay:.18s}
.sb-msg-typing i:nth-child(3){animation-delay:.36s}
@keyframes sb-chat-blink{0%,100%{opacity:.3}50%{opacity:1}}
.sb-msg-thinking{display:inline-flex;align-items:center;gap:7px;color:#8A8F99;font-size:12px;font-weight:600}
.sb-msg-thinking .sb-msg-typing{padding:0}

/* 执行前业务简报：把目标、范围、交付与边界说清楚，再开始跑任务 */
.sb-run-brief{border:1px solid rgba(59,107,212,.16);background:#F7F9FF;border-radius:11px;padding:12px 14px}
.sb-run-brief-title{font-size:12px;font-weight:700;color:#1F2329}
.sb-run-brief-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px;margin-top:10px}
.sb-run-brief-item{min-width:0}
.sb-run-brief-label{font-size:10px;color:#7D8794;line-height:1.3}
.sb-run-brief-value{font-size:11.5px;color:#303943;line-height:1.5;margin-top:2px}

/* Local-only outreach planning: make the audience contract legible before any simulated action. */
.sb-touch-plan{margin-top:12px;padding:11px 12px;border:1px solid rgba(59,107,212,.14);border-radius:10px;background:rgba(255,255,255,.74)}
.sb-touch-plan-head{display:flex;align-items:center;gap:8px}.sb-touch-plan-title{font-size:11px;font-weight:700;color:#1F2329}.sb-touch-plan-tag{font-size:9.5px;color:#3B6BD4;background:rgba(76,154,255,.12);border-radius:999px;padding:2px 7px}
.sb-touch-plan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;margin-top:10px}.sb-touch-plan-item{min-width:0}.sb-touch-plan-label{font-size:9.5px;color:#8A95A3;line-height:1.3}.sb-touch-plan-value{margin-top:2px;font-size:11px;line-height:1.45;color:#303943;word-break:break-word}
.sb-touch-plan-missing{margin-top:9px;padding:7px 8px;border-radius:7px;background:rgba(232,163,61,.1);color:#9A681B;font-size:10.5px;line-height:1.45}
.sb-touch-preview{margin-top:12px;border-top:1px solid rgba(15,15,15,.08);padding-top:11px}.sb-touch-preview-head{display:flex;align-items:baseline;gap:8px}.sb-touch-preview-title{font-size:11px;font-weight:700;color:#1F2329}.sb-touch-preview-note{font-size:9.5px;color:#8A8F99}.sb-touch-preview-list{display:grid;gap:6px;margin-top:8px}.sb-touch-preview-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid rgba(15,15,15,.07);border-radius:8px;background:#fff}.sb-touch-preview-row input{width:14px;height:14px;accent-color:#3B6BD4}.sb-touch-preview-main{min-width:0;flex:1}.sb-touch-preview-name{font-size:11px;color:#303943;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-touch-preview-meta{margin-top:1px;font-size:9.5px;color:#8A8F99;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-touch-preview-count{margin-top:8px;font-size:10px;color:#3B6BD4}.sb-touch-draft{margin-top:10px;padding:9px 10px;border-radius:8px;background:rgba(59,107,212,.06);border:1px solid rgba(59,107,212,.12)}.sb-touch-draft-head{display:flex;align-items:center;gap:8px}.sb-touch-draft-title{font-size:10.5px;font-weight:700;color:#2F5BAA}.sb-touch-draft-channel{font-size:9px;color:#6D7A89}.sb-touch-draft-body{margin-top:5px;font-size:11px;line-height:1.6;color:#303943}.sb-touch-draft-note{margin-top:5px;font-size:9.5px;color:#8A95A3}
.sb-touch-outcome{margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,15,15,.08)}.sb-touch-outcome-head{display:flex;align-items:baseline;gap:8px}.sb-touch-outcome-title{font-size:11px;font-weight:700;color:#1F2329}.sb-touch-outcome-note{font-size:9.5px;color:#2F7D3F}.sb-touch-outcome-list{display:grid;gap:6px;margin-top:8px}.sb-touch-outcome-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;background:#fff;border:1px solid rgba(15,15,15,.07)}.sb-touch-outcome-dot{width:7px;height:7px;border-radius:50%;background:#8A8F99;flex:none}.sb-touch-outcome-dot.is-replied{background:#57B26A}.sb-touch-outcome-dot.is-waiting{background:#4C9AFF}.sb-touch-outcome-dot.is-human{background:#E8A33D}.sb-touch-outcome-main{min-width:0;flex:1}.sb-touch-outcome-name{font-size:11px;color:#303943;font-weight:650}.sb-touch-outcome-detail{margin-top:1px;font-size:9.5px;color:#8A8F99;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-touch-outcome-status{font-size:10px;color:#5A6472;white-space:nowrap}.sb-touch-outcome-next{margin-top:8px;padding:7px 8px;border-radius:7px;background:rgba(87,178,106,.08);color:#2F7D3F;font-size:10.5px;line-height:1.45}
@media(max-width:640px){.sb-touch-plan-grid{grid-template-columns:1fr}}

/* Zero-to-one access setup: the demo cannot enter execution before this gate is resolved. */
.sb-access-card{border:1px solid rgba(76,154,255,.24);background:linear-gradient(180deg,#F8FBFF,#F3F7FD);border-radius:12px;padding:14px 16px}
.sb-access-card.sb-access-resolved{border-color:rgba(87,178,106,.34);background:linear-gradient(180deg,rgba(87,178,106,.08),rgba(255,255,255,.72))}
.sb-access-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:#1F2329}
.sb-access-tag{font-size:10px;font-weight:600;color:#3B6BD4;background:rgba(76,154,255,.12);border-radius:999px;padding:2px 8px}
.sb-access-resolved .sb-access-tag{color:#2F7D3F;background:rgba(87,178,106,.13)}
.sb-access-copy{font-size:12.5px;color:#4C5969;line-height:1.65;margin-top:8px}
.sb-access-provider{display:flex;align-items:center;gap:9px;margin-top:12px;padding:9px 10px;background:#fff;border:1px solid rgba(15,15,15,.08);border-radius:9px}
.sb-access-provider-mark{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:#1F2329;color:#fff;font-size:12px;font-weight:700}
.sb-access-provider-main{min-width:0;display:flex;flex-direction:column;gap:2px}
.sb-access-provider-name{font-size:12px;font-weight:650;color:#1F2329}
.sb-access-provider-account{font-size:10.5px;color:#8A8F99}
.sb-access-scopes{display:flex;flex-direction:column;gap:7px;margin-top:11px}
.sb-access-scope{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#4C5969}
.sb-access-scope i{width:15px;height:15px;border-radius:50%;display:grid;place-items:center;background:rgba(76,154,255,.12);color:#3B6BD4;font-style:normal;font-size:10px}
.sb-access-actions{display:flex;gap:9px;margin-top:12px}
.sb-access-select{width:100%;box-sizing:border-box;margin-top:11px;border:1px solid rgba(15,15,15,.12);border-radius:8px;background:#fff;color:#303943;padding:8px 10px;font:inherit;font-size:12px}
.sb-access-note{font-size:11px;color:#6D7A89;line-height:1.55;margin-top:9px}
.sb-access-action[disabled]{opacity:.58;cursor:wait}
.sb-requirement-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:12px}
.sb-requirement-item{min-width:0}
.sb-requirement-label{font-size:10px;color:#7D8794;line-height:1.3}
.sb-requirement-value{font-size:12px;color:#303943;line-height:1.55;margin-top:3px}
@media(max-width:640px){.sb-requirement-grid{grid-template-columns:1fr}}

/* 需求确认后的分工预览：授权前先让用户知道谁负责哪一步。 */
.sb-assignment-card{border:1px solid rgba(87,178,106,.25);background:linear-gradient(180deg,#FBFFF9,#F6FAF6);border-radius:11px;padding:12px 14px}
.sb-assignment-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:#1F2329}
.sb-assignment-tag{font-size:10px;font-weight:600;color:#2F7D3F;background:rgba(87,178,106,.13);border-radius:999px;padding:2px 8px}
.sb-assignment-copy{font-size:12px;color:#59676B;line-height:1.6;margin-top:7px}
.sb-assignment-list{display:grid;gap:7px;margin-top:11px}
.sb-assignment-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border:1px solid rgba(15,15,15,.06);border-radius:8px;background:rgba(255,255,255,.82)}
.sb-assignment-avatar{width:34px;height:34px;flex:none;border-radius:10px;overflow:hidden;background:#E9EDF2;color:#5A6472;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.sb-assignment-avatar img{width:100%;height:100%;display:block;object-fit:cover}
.sb-assignment-main{min-width:0;display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
.sb-assignment-skill{font-size:11.5px;font-weight:650;color:#1F2329}
.sb-assignment-role{font-size:10.5px;color:#7B858C}
.sb-assignment-owner{font-size:11px;color:#2F7D3F;font-weight:600;white-space:nowrap}
.sb-assignment-executor{font-size:10px;color:#8A8F99;margin-top:2px;grid-column:1 / -1}
.sb-assignment-note{font-size:11px;color:#6D7A89;line-height:1.55;margin-top:9px}
@media(max-width:640px){.sb-assignment-row{grid-template-columns:32px minmax(0,1fr)}.sb-assignment-avatar{width:32px;height:32px}.sb-assignment-owner{grid-column:2;grid-row:2}.sb-assignment-executor{grid-column:2;grid-row:3}.sb-assignment-main{grid-column:2}.sb-assignment-executor{margin-top:0}}

/* 执行进展卡片（在幕僚长消息气泡内实时更新） */
.sb-run-statusline{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.sb-run-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#B87A1E;background:rgba(232,163,61,0.12);border-radius:999px;padding:3px 10px}
.sb-run-status.sb-accepted{color:#B87A1E;background:rgba(232,163,61,0.12)}
.sb-run-status.sb-thinking{color:#5B4EC4;background:rgba(124,110,235,0.12)}
.sb-run-status.sb-on{color:#3B6BD4;background:rgba(76,154,255,0.12)}
.sb-run-status.sb-done{color:#2F7D3F;background:rgba(87,178,106,0.14)}
.sb-run-status.sb-error{color:#B23A36;background:rgba(208,77,70,0.12)}
.sb-run-status i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:sb-chat-blink 1.2s infinite}
.sb-run-status.sb-done i{animation:none}
.sb-run-clock{font-size:11px;color:#8A8F99;font-variant-numeric:tabular-nums}
.sb-run-owner{display:flex;align-items:center;gap:7px;margin:0 0 10px;color:#5A6472;font-size:11px}
.sb-run-owner strong{color:#1F2329;font-size:12px}
.sb-run-progress{height:4px;border-radius:2px;background:rgba(15,15,15,0.06);overflow:hidden;margin-bottom:12px}
.sb-run-progress i{display:block;height:100%;width:0;border-radius:2px;background:linear-gradient(90deg,#4C9AFF,#2F7D3F);transition:width .6s ease}
.sb-checkpoint{border:1px solid rgba(15,15,15,.08);border-radius:14px;background:rgba(255,255,255,.92);box-shadow:0 6px 18px rgba(32,40,48,.045);overflow:hidden}
.sb-checkpoint-head{display:flex;align-items:center;gap:10px;padding:13px 15px}
.sb-checkpoint-head-main{min-width:0;flex:1}.sb-checkpoint-title{font-size:13px;font-weight:700;color:#1F2329;line-height:20px}.sb-checkpoint-subtitle{font-size:11px;color:#8A8F99;line-height:17px;margin-top:1px}
.sb-checkpoint-toggle{flex:none;border:0;background:rgba(15,15,15,.045);color:#5A5E66;border-radius:7px;padding:6px 9px;font:inherit;font-size:11px;cursor:pointer}.sb-checkpoint-toggle:hover{background:rgba(15,15,15,.08);color:#1F2329}.sb-checkpoint-toggle:focus-visible,.sb-run-btn:focus-visible,.sb-run-file:focus-visible{outline:2px solid rgba(59,107,212,.55);outline-offset:2px}
.sb-checkpoint-body{padding:0 15px 15px}.sb-checkpoint-body[hidden]{display:none}
.sb-progress-summary{display:flex;align-items:center;gap:8px;margin:0 15px 12px;padding:9px 10px;border-radius:9px;background:#F7F9FB;color:#5A6472;font-size:11px}.sb-progress-summary strong{color:#1F2329;font-size:12px}.sb-progress-summary i{width:6px;height:6px;border-radius:50%;background:#4C9AFF;box-shadow:0 0 0 3px rgba(76,154,255,.12)}
.sb-progress-updated{margin-left:auto;color:#8A8F99;font-size:10px;white-space:nowrap}
.sb-recovery-card{border:1px solid rgba(208,77,70,.25);background:linear-gradient(180deg,#FFF9F8,#FFF);border-radius:13px;padding:14px 15px}.sb-recovery-title{display:flex;align-items:center;gap:8px;color:#7F2925;font-size:13px;font-weight:700}.sb-recovery-tag{font-size:10px;font-weight:600;color:#B23A36;background:rgba(208,77,70,.1);border-radius:999px;padding:2px 8px}.sb-recovery-copy{color:#5F4A49;font-size:12px;line-height:1.65;margin-top:8px}.sb-recovery-preserved{display:flex;align-items:center;gap:7px;margin-top:9px;color:#2F7D3F;font-size:11px}.sb-recovery-preserved i{width:15px;height:15px;display:grid;place-items:center;border-radius:50%;background:rgba(87,178,106,.14);font-style:normal}.sb-recovery-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.sb-result-card{border:1px solid rgba(87,178,106,.24);background:linear-gradient(180deg,#FBFFFA,#FFF);border-radius:14px;padding:15px}.sb-result-head{display:flex;align-items:flex-start;gap:9px}.sb-result-mark{width:28px;height:28px;display:grid;place-items:center;flex:none;border-radius:9px;background:rgba(87,178,106,.14);color:#2F7D3F;font-weight:800}.sb-result-title{font-size:14px;font-weight:700;color:#1F2329;line-height:20px}.sb-result-copy{font-size:12px;line-height:1.65;color:#59676B;margin-top:3px}.sb-result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.sb-result-files{display:grid;gap:7px;margin-top:12px}
.sb-run-progress i.sb-error,.sb-run-subbar.sb-error i{background:#D04D46}
.sb-run-sub{background:rgba(15,15,15,0.025);border:1px solid rgba(15,15,15,0.05);border-radius:10px;padding:10px 14px;margin-bottom:8px}
.sb-run-sub:last-child{margin-bottom:0}
.sb-run-subhead{display:flex;align-items:center;gap:8px}
.sb-run-agent-avatar{width:36px;height:36px;flex:none;border-radius:11px;overflow:hidden;background:#E9EDF2;color:#5A6472;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;box-shadow:0 1px 3px rgba(15,15,15,.08)}
.sb-run-agent-avatar img{width:100%;height:100%;display:block;object-fit:cover}
.sb-run-subidentity{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
.sb-run-subwho,.sb-run-subrole{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-run-subwho{font-size:12px;font-weight:600;color:#1F2329}
.sb-run-subrole{font-size:11px;color:#8A8F99}
.sb-run-substate{margin-left:auto;font-size:11px;color:#8A8F99;flex:none}
.sb-run-substate.sb-accepted{color:#B87A1E}
.sb-run-substate.sb-on{color:#3B6BD4}
.sb-run-substate.sb-thinking{color:#5B4EC4}
.sb-run-substate.sb-ok{color:#2F7D3F}
.sb-run-substate.sb-error{color:#B23A36}
.sb-run-substate.sb-thinking::after{content:"";display:inline-block;width:5px;height:5px;margin-left:5px;border-radius:50%;background:currentColor;animation:sb-chat-blink 1s infinite}
.sb-run-submeta{display:flex;align-items:center;gap:6px;margin:9px 0 0 44px;flex-wrap:wrap}
.sb-run-submeta span{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:10px;line-height:18px;white-space:nowrap}
.sb-run-subskill{background:rgba(91,78,196,.1);color:#5B4EC4}
.sb-run-subexecutor{background:rgba(15,15,15,.05);color:#92969D}
.sb-run-sub-events{display:flex;align-items:center;gap:6px;margin:9px 0 0 44px;min-height:18px}
.sb-run-sub-event{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:rgba(15,15,15,.05);color:#92969D;font-size:10px;line-height:18px}
.sb-run-sub-event.sb-active{background:rgba(76,154,255,.1);color:#3B6BD4}
.sb-run-sub-event.sb-complete{background:rgba(87,178,106,.12);color:#2F7D3F}
.sb-run-sub-event.sb-evidence{background:rgba(91,78,196,.1);color:#5B4EC4}
.sb-run-subbar{height:3px;border-radius:2px;background:rgba(15,15,15,0.06);margin-top:8px;overflow:hidden}
.sb-run-subbar i{display:block;height:100%;width:0;background:#4C9AFF;border-radius:2px;transition:width .5s ease}
.sb-run-subbar.sb-ok i{background:#57B26A}
.sb-msg.sb-agent-trace .sb-msg-bubble{background:#fbfcfe;border-left:3px solid #9aa8bb;padding:14px 17px}
.sb-agent-trace-title{font-size:13px;font-weight:700;color:#4d6179;margin-bottom:6px}
.sb-agent-trace-body{font-size:14px;color:#303943;line-height:1.7}
.sb-agent-trace-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.sb-agent-trace-meta span{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:5px;background:#eef2f6;color:#748196;font-size:11px;line-height:22px}

/* 审批卡点消息 */
.sb-run-approval{background:linear-gradient(180deg,rgba(232,163,61,0.08),rgba(232,163,61,0.03));border:1px solid rgba(232,163,61,0.35);border-radius:12px;padding:14px 16px}
.sb-run-approval.sb-resolved{border-color:rgba(87,178,106,0.4);background:linear-gradient(180deg,rgba(87,178,106,0.08),rgba(87,178,106,0.02))}
.sb-run-apptitle{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1F2329}
.sb-run-apptag{font-size:10px;font-weight:600;color:#B87A1E;background:rgba(232,163,61,0.15);border-radius:999px;padding:2px 8px}
.sb-run-appbody{font-size:12.5px;color:#3F434A;line-height:1.7;margin-top:8px;background:rgba(255,255,255,0.75);border-radius:8px;padding:9px 12px}
.sb-run-appbtns{display:flex;gap:10px;margin-top:11px}
.sb-run-btn{border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer}
.sb-run-btn.sb-primary{background:#1F2329;color:#fff}
.sb-run-btn.sb-primary:hover{background:#3F434A}
.sb-run-btn.sb-ghost{background:rgba(15,15,15,0.05);color:#5A5E66}
.sb-run-btn.sb-ghost:hover{background:rgba(15,15,15,0.09)}
.sb-run-appresult{font-size:12px;color:#2F7D3F;margin-top:9px;font-weight:600}

/* 完成汇总 */
.sb-run-stats{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.sb-run-stat{flex:1;min-width:100px;background:rgba(15,15,15,0.03);border-radius:9px;padding:8px 12px}
.sb-run-statnum{font-size:17px;font-weight:700;color:#1F2329;font-variant-numeric:tabular-nums}
.sb-run-statlabel{font-size:10.5px;color:#8A8F99;margin-top:2px}
.sb-run-actions{display:flex;gap:10px;margin-top:12px}

/* 产出物文件卡（子任务完成时由对应成员发出，点击直达文件中心预览） */
.sb-run-file{width:100%;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid rgba(15,15,15,0.08);border-radius:10px;padding:9px 12px;cursor:pointer;transition:background .15s ease;text-align:left;font:inherit;box-sizing:border-box}
.sb-run-file:hover{background:rgba(76,154,255,0.06);border-color:rgba(76,154,255,0.3)}
.sb-run-fileico{flex:none;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.sb-run-fileico.sb-sheet{background:rgba(87,178,106,0.14);color:#2F7D3F}
.sb-run-fileico.sb-doc{background:rgba(76,154,255,0.12);color:#3B6BD4}
.sb-run-filemain{flex:1;min-width:0}
.sb-run-filename{font-size:12.5px;font-weight:600;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-run-filesub{font-size:11px;color:#8A8F99;margin-top:1px}
.sb-run-filego{flex:none;font-size:11px;color:#3B6BD4;font-weight:600}
.sb-run-failure{border:1px solid rgba(208,77,70,.24);background:rgba(208,77,70,.06);color:#7F2925;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.55}

/* 底部输入条 */
.sb-chat-bar{flex:none;border-top:1px solid rgba(15,15,15,0.06);background:#fff;padding:12px 24px 16px}
.sb-chat-barinner{width:calc(100% - 64px);max-width:1280px;box-sizing:border-box;margin:0 auto;display:flex;align-items:flex-end;gap:12px}
.sb-chat-input{flex:1;resize:none;border:1px solid rgba(15,15,15,0.1);border-radius:14px;padding:13px 17px;font-size:15px;line-height:1.55;font-family:inherit;color:#1F2329;outline:none;max-height:140px;background:#FAFAFA}
.sb-chat-input:focus{border-color:rgba(76,154,255,0.55);background:#fff}
.sb-chat-send{flex:none;width:44px;height:44px;border:none;border-radius:50%;background:#1F2329;color:#fff;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.sb-chat-send:hover{background:#3F434A}
.sb-chat-send:disabled{background:rgba(15,15,15,0.15);cursor:default}
@media(prefers-reduced-motion:reduce){.sb-msg,.sb-msg.sb-instant{opacity:1;animation:none}.sb-msg-typing i,.sb-run-status i,.sb-run-substate.sb-thinking::after{animation:none}}
@media(prefers-reduced-motion:reduce){.sb-checkpoint-toggle,.sb-run-progress i,.sb-run-subbar i{transition:none}}
@media(max-width:640px){.sb-chat-inner{width:100%;padding:20px 14px 18px;gap:14px}.sb-msg{gap:10px}.sb-msg-avatar{width:38px;height:38px;border-radius:11px;font-size:14px}.sb-msg-main{max-width:calc(100% - 48px)}.sb-msg-name{font-size:12px;margin-bottom:4px}.sb-msg-bubble{padding:12px 14px;font-size:14px;line-height:1.7}.sb-msg.sb-agent-trace .sb-msg-bubble{padding:12px 14px}.sb-agent-trace-title{font-size:12px}.sb-agent-trace-body{font-size:13px}.sb-agent-trace-meta{margin-top:8px}.sb-agent-trace-meta span{min-height:20px;line-height:20px;font-size:10px}.sb-run-agent-avatar{width:32px;height:32px;border-radius:10px}.sb-run-submeta,.sb-run-sub-events{margin-left:40px}.sb-checkpoint-head{padding:12px}.sb-checkpoint-body{padding:0 12px 12px}.sb-progress-summary{margin-left:12px;margin-right:12px}.sb-chat-bar{padding:10px 14px 14px}.sb-chat-barinner{width:100%;gap:8px}.sb-chat-input{padding:11px 13px;font-size:14px}.sb-chat-send{width:40px;height:40px;font-size:16px}.sb-run-brief-grid{grid-template-columns:1fr}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

/* ── 剧本：按任务关键字挑选线索猎人 / 内容运营 / 通用流程 ── */

export function pickDialogueScript(taskText) {
  const t = taskText || "";
  if (/查看.*结果|总结.*(?:找人|触达|回复).*结果|结果.*(?:异常|下一步)/.test(t)) return "results";
  if (/分析.*(?:线索|潜客)|线索.*(?:分析|评分|分层)|按意向.*证据/.test(t)) return "analyze";
  if (/(准备|生成|制定).*(?:触达|首轮|消息草稿)|触达方案/.test(t)) return "outreach";
  if (/找.*潜客|找一批.*(?:人|账号|客户)|只找人|先找人/.test(t)) return "find";
  if (/买车|车型|购车|到店|留电话|潜客|线索|挖掘|获客|名单|意向客户/.test(t)) return "leads";
  if (/抖音|视频|内容|小红书|文案|账号/.test(t)) return "content";
  return "generic";
}

const MEMBER_SLOTS = [
  { type: "Browser Agent", fallback: "线索猎人", role: "检索、补全与验证" },
  { type: "Search Agent", fallback: "线索分析师", role: "清洗与评分" },
  { type: "File Agent", fallback: "内容策划", role: "物料产出" },
  { type: "App Agent", fallback: "触达策略师", role: "触达执行" }
];

const EMPLOYEE_VOICES = Object.freeze({
  线索猎人: Object.freeze({
    entranceTitle: "好呀，这部分交给我",
    entranceBody: ({ role }) => `我先去看看${role || "现场互动"}，把真正值得跟进的信号捞出来。有发现我马上回来同步 👀`,
    progressLead: "我刚发现一些新情况：",
    completionTitle: "第一轮我看完啦 ✅"
  }),
  线索分析师: Object.freeze({
    entranceTitle: "没问题，我来看看",
    entranceBody: ({ role }) => `我会把${role || "现有数据"}理清楚，意向强弱和判断依据都会一起整理好。`,
    progressLead: "我这边分析到一个进展：",
    completionTitle: "数据这部分我整理好啦"
  }),
  内容策划: Object.freeze({
    entranceTitle: "收到～我已经有思路了",
    entranceBody: ({ role }) => `我来处理${role || "内容方案"}，会把表达、节奏和风险一起照顾到，整理好就回来找你 ✨`,
    progressLead: "我先同步一下现在的思路：",
    completionTitle: "内容方案我准备好啦"
  }),
  触达策略师: Object.freeze({
    entranceTitle: "好呀，我来接下一棒",
    entranceBody: ({ role }) => `我先把${role || "后续跟进"}接起来，触达前会再检查一遍，需要你判断的地方我会及时来问。`,
    progressLead: "我来同步一下客户这边的进展：",
    completionTitle: "这一轮我跟进完啦 🙌"
  })
});

const DEFAULT_EMPLOYEE_VOICE = Object.freeze({
  entranceTitle: "好呀，交给我吧",
  entranceBody: ({ skill, role }) => `我先来处理${skill || role || "这项任务"}，理清楚之后马上回来同步。`,
  progressLead: "我这边有新进展：",
  completionTitle: "这部分我处理好啦 ✅"
});

function cleanEmployeeText(text = "", agentName = "") {
  return String(text)
    .replace(/\b(?:SUB_START|RUN_STARTED|RUN_FINISHED|RUN_ERROR|COMPLETE|DISPATCH|ERROR|HUMAN_TAKEOVER)\b\s*[·:：-]?\s*/gu, "")
    .replace(/\bExecutor\b/gu, "执行环节")
    .replace(/\bAgent\b/gu, "员工")
    .replace(new RegExp(`^${agentName ? `${agentName}\\s*` : ""}(?:的?\\s*)?(?:已入场[，,]?|已接受[：:]?|开始执行[：:]?|执行环节\\s*返回[：:]?)`, "u"), "")
    .replace(/账号状态\s*READY/gu, "账号已经连接")
    .replace(/\s+/g, " ")
    .trim();
}

function limitEmoji(title = "", body = "") {
  let emojiSeen = false;
  const clean = (value) => String(value).replace(/\p{Extended_Pictographic}/gu, (emoji) => {
    if (emojiSeen) return "";
    emojiSeen = true;
    return emoji;
  }).replace(/\s+([，。！？,.!?])/g, "$1").replace(/ {2,}/g, " ").trim();
  return { title: clean(title), body: clean(body) };
}

/** Translate internal lifecycle events into friendly, first-person employee dialogue. */
export function getEmployeeDialogue(stage, context = {}) {
  if (stage === "accepted" || stage === "started") return null;
  const agentName = String(context.agentName || "").trim();
  const voice = EMPLOYEE_VOICES[agentName] || DEFAULT_EMPLOYEE_VOICE;
  const cleanText = cleanEmployeeText(context.text, agentName);

  if (stage === "entrance") {
    return limitEmoji(voice.entranceTitle, voice.entranceBody(context));
  }
  if (stage === "completion") {
    return limitEmoji(
      voice.completionTitle,
      /我/u.test(cleanText) ? cleanText : `我已经完成${context.skill || "这部分工作"}。${cleanText}`
    );
  }
  if (stage === "error") {
    const detail = cleanText
      .replace(/^的?执行环节返回/gu, "")
      .replace(/^外部数据源响应超过\s*8\s*秒/gu, "外部数据源响应有些慢");
    return limitEmoji(
      "我这里遇到点状况",
      `我先停一下，避免产生不完整结果。${detail || "当前数据还没有写入业务系统，我确认清楚后再继续。"}`
    );
  }
  return limitEmoji(
    "我这边有新进展",
    /我/u.test(cleanText) ? cleanText : `${voice.progressLead}${cleanText}`
  );
}

/* 一个场景只对应一个专业 Agent；浏览器、搜索、文件和 App 只是执行器。 */
const SCENARIO_AGENTS = Object.freeze({
  leads: { id: "lead_hunter", name: "线索猎人", role: "监控互动并推进留资", type: "professional_agent" },
  find: { id: "acquisition_strategist", name: "获客策略师", role: "把业务目标拆成客户画像和找人条件", type: "professional_agent" },
  analyze: { id: "lead_analyst", name: "线索分析师", role: "按意向、证据和来源整理线索优先级", type: "professional_agent" },
  outreach: { id: "outreach_strategist", name: "触达策略师", role: "生成首触方案并在审批后推进触达", type: "professional_agent" },
  results: { id: "result_analyst", name: "数据分析师", role: "汇总找人、触达和回复结果并提出下一步", type: "professional_agent" },
  content: { id: "content_operator", name: "内容策划", role: "验证选题并产出内容计划", type: "professional_agent" },
  generic: { id: "project_operator", name: "项目执行 Agent", role: "按计划拆解并交付结果", type: "professional_agent" }
});

const SCENARIO_SKILL_IDS = Object.freeze({
  leads: ["observe_interactions", "score_intent", "plan_outreach", "run_conversation"],
  find: ["define_icp", "discover_prospects", "verify_signals", "deliver_candidate_pool"],
  analyze: ["deduplicate_leads", "score_intent", "research_prospects", "prioritize_actions"],
  outreach: ["build_outreach_strategy", "check_risk", "draft_messages", "prepare_approval"],
  results: ["aggregate_funnel", "analyze_replies", "explain_anomalies", "recommend_next_steps"],
  content: ["research_benchmarks", "analyze_content_gaps", "draft_content_plan", "schedule_distribution"],
  generic: ["collect_context", "score_priorities", "draft_execution_plan", "prepare_handoff"]
});

const SCRIPTS = {
  leads: {
    decompose: "我先按业务边界执行：只读已授权抖音账号最近 24 小时的互动，目标是识别有车型、预算、城市或到店信号的购车客户，不把所有评论都当线索；先完成证据留存和意向分层，触达前再让你确认。",
    brief: {
      title: "执行前确认",
      objective: "识别高意向购车客户，并推进到有效对话或到店预约",
      scope: "已授权账号最近 24 小时：3 场直播、2 条车型视频及其评论/粉丝互动",
      deliverable: "候选分层、首触话术、会话跟进记录与人工接管清单",
      guardrail: "不编造价格/库存/优惠；不重复追发；投诉或要求人工立即接管"
    },
    subs: [
      {
        skill: "观察互动",
        role: "互动观察与线索发现",
        executor: "RPA + 线索猎人",
        completion: "我已完成互动观察：3,842 条抖音评论、粉丝和直播互动已同步，214 位候选都保留了原评论、来源作品和主页证据，交给线索分析师继续评分。",
        assign: "线索猎人先观察：只读取已授权抖音账号的评论、粉丝和直播互动，保留原始证据。",
        lines: [
          "账号状态 READY，已同步昨晚 3 场直播、2 条车型视频的评论和粉丝互动，共 3,842 条原始记录。",
          "我先排除抽奖、表情刷屏、同行账号和重复互动，再补看用户主页、历史评论和来源作品，不只靠关键词。",
          "发现 214 位有效候选，其中 68 位出现车型、预算、城市或到店信号；例如「325Li 杭州最近落地多少？」每条都保留原评论、作品和主页证据，交给线索分析师。"
        ]
      },
      {
        skill: "识别意向",
        role: "意向评分与解释",
        executor: "Python + LLM + Policy",
        completion: "我已完成意向评分：214 位候选分成 A 级 47、B 级 86、C 级 81，6 条证据不足的线索已拦截，没有进入触达队列。",
        assign: "线索分析师接手：按购买阶段评分，证据不足的线索不进入触达。",
        lines: [
          "收到。214 条先去重并校验证据，把单纯讨论车型、同行营销和没有来源的内容标成待核验。",
          "评分完成：A 级 47 位、B 级 86 位、C 级 81 位；预算 + 具体车型 + 城市/时间窗口同时出现，才会进入 A 级。",
          "已生成意向解释：每位客户都有原话、来源、关键特征和建议动作，6 条证据不足的线索暂不触达。"
        ]
      },
      {
        skill: "规划触达",
        role: "触达话术与风险审校",
        executor: "LLM + Policy",
        completion: "我已完成触达规划：47 位 A 级客户都有对应原问题的首触话术和下一步动作，已通过合规检查，不编造价格、库存或优惠。",
        assign: "话术审校先规划首触：只承接客户原问题，不越权承诺价格、库存或优惠。",
        lines: [
          "我按价格、车型对比、置换评估、到店预约四类意图生成短句，第一条只回答客户刚问的问题。",
          "规则检查通过：不主动索要电话、不编造落地价、不承诺现车和优惠；客户未回复时不连续追发。",
          "已为 47 位 A 级客户生成个性化首触和下一步动作，话术与证据绑定，交给触达策略师执行。"
        ]
      },
      {
        skill: "持续对话",
        role: "私信执行与会话跟进",
        executor: "RPA + LLM + 人工接管",
        completion: "我已完成本轮会话跟进：31 条私信带来 12 条有效回复，5 位确认本周到店；1 位已留联系方式，2 位按规则转人工接管。",
        assign: "触达策略师执行触达：先通过权限和频控检查，再逐条发送并等待客户回复。",
        lines: [
          "A 级先处理 12 位明确询问价格、车型或到店时间的客户；B 级只做轻触达，C 级暂不打扰。",
          "已发送 31 条一对一私信，收到 12 条有效回复：5 位确认本周到店、4 位需要报价、3 位仍在车型对比。",
          "有 1 位客户主动留下联系方式、2 位要求人工确认；我已暂停这些会话的自动回复并保留完整上下文，其余客户继续按下一步动作跟进。"
        ]
      }
    ],
    approval: {
      title: "A 级客户首轮私信待确认",
      body: "即将调用 send_dm：账号状态 READY，已检查触达权限；仅发送 12 条有明确购车信号的个性化消息，遵守单账号日频控 ≤ 20 条。未回复不重复发送，出现投诉、价格承诺或客户要求人工时立即接管。",
      approveNote: "已通过：触达策略师开始逐条触达，并等待客户回复",
      rejectNote: "已驳回：已暂停 send_dm，保留名单和证据，改为人工审核"
    },
    stats: [["3,842", "互动已观察"], ["47", "A 级高意向"], ["12", "有效回复"], ["5", "本周到店"]],
    summary: "线索猎人本轮运行完成：214 位候选已留存原始证据，47 位完成意向分层，12 位进入有效对话；5 位确认本周到店，2 位已转人工接管。"
  },
  content: {
    decompose: "我先按内容运营口径执行：用已连接账号近 30 天数据验证选题机会，先拆解可复用结构，再产出脚本和排期；涉及夸大结果或对外发布的内容，会在发布前提交审批。",
    brief: {
      title: "执行前确认",
      objective: "找到可验证的内容增长机会，并形成可执行的发布计划",
      scope: "已连接账号近 30 天内容表现、同类目头部账号样本和粉丝活跃时段",
      deliverable: "爆款拆解、选题日历、脚本初稿与发布排期",
      guardrail: "数据结论保留来源；不夸大收益；对外发布前经过审批"
    },
    subs: [
      {
        skill: "竞品内容研究",
        role: "拆解同类目高表现内容",
        executor: "线索猎人",
        completion: "我已完成竞品内容研究，爆款结构、证据和可复用的选题方向都整理好了。",
        assign: "猎人先把同类目头部账号近 30 天的爆款捞出来拆。",
        lines: [
          "收到，开捞。同类目 top 30 账号近 30 天的视频我全过了一遍。",
          "24 条真爆款拆完了：开头 3 秒钩子、节奏点、转化引导，结构都标清楚了。",
          "拆解文档 benchmarks.md 已存。说个发现：评测类比纯展示的完播率高快一倍。"
        ]
      },
      {
        skill: "内容表现分析",
        role: "识别账号流量机会和内容缺口",
        executor: "线索分析师",
        completion: "我已完成内容表现分析，流量洼地、优先级和判断依据都整理好了。",
        assign: "分析师找找咱们账号的流量洼地。",
        lines: [
          "收到。近 90 天的数据我拉完了，完播和互动都按选题维度切开看。",
          "6 个流量洼地锁定了——搜索热度在涨，但认真做的号还不多。",
          "content-gap.csv 已存，优先级按竞争密度排好了。"
        ]
      },
      {
        skill: "选题与脚本策划",
        role: "把机会转成选题日历和脚本初稿",
        executor: "内容策划",
        completion: "我已完成选题与脚本策划，日历、脚本初稿和 A/B 版本都已归档。",
        assign: "策划按洼地出 14 天选题日历和脚本。",
        lines: [
          "这几个洼地确实香。日历按粉丝活跃时段排：中午 12 点和晚 7 点半两档。",
          "14 天 8 条排好了，先出 3 条脚本初稿，钩子做了 A/B 两版。",
          "脚本和日历都存共享文件夹了。@触达策略师 发布节奏你过一下。"
        ]
      },
      {
        skill: "发布节奏审校",
        role: "检查发布排期与对外风险",
        executor: "触达策略师",
        completion: "我已完成发布节奏审校，排期和需要审批的表达风险都标出来了。",
        assign: "顾问定发布排期，评论区维护一起带上。",
        lines: [
          "排期没问题，就按日历走。发布后 1 小时内的评论我盯着，高频问题统一应答。",
          "有处得确认：脚本 1 的钩子「0 投放做到 50 万播放」——数据是真实的，但容易被平台判夸大，我提个审批。"
        ]
      }
    ],
    approval: {
      title: "视频脚本初稿（3 条）待审批",
      body: "脚本 1 钩子：「别再乱投豆荚了，我们用 0 投放做到单条 50 万播放，方法就这 3 步……」（A/B 两版开头，详见共享文件夹）",
      approveNote: "已通过：触达策略师按排期执行发布与评论区维护",
      rejectNote: "已驳回：内容策划调整钩子表述后重新提交"
    },
    stats: [["24", "爆款拆解"], ["8", "选题日历"], ["3", "脚本初稿"], ["14 天", "排期覆盖"]],
    summary: "内容运营任务完成：选题日历与脚本已归档，发布排期待审批通过后自动执行。"
  },
  generic: {
    decompose: "我先把目标、数据范围、验收口径和风险边界定清，再交给项目组分工执行；信息不足的地方会标记待确认，不会用猜测补齐。",
    brief: {
      title: "执行前确认",
      objective: "把业务目标转成可验收的执行结果和下一步动作",
      scope: "当前项目组已连接的资料、公开信息和历史任务上下文",
      deliverable: "目标情报、优先级清单、执行方案与沟通要点",
      guardrail: "关键结论保留依据；对外承诺和触达动作需审批"
    },
    subs: [
      {
        assign: "猎人先摸目标市场的底。",
        lines: [
          "收到。目标市场的公开信息和客户动态我先扫一轮。",
          "有效信息 46 条，关键决策人线索补了 12 个。",
          "情报汇总.md 已存，@线索分析师 接着。"
        ]
      },
      {
        assign: "分析师清洗定级。",
        lines: [
          "收到。去重 9 条、失效剔 5 条，剩下的按优先级打分。",
          "评完了，高分客户集中在两个行业。analysis-scored.csv 已存。"
        ]
      },
      {
        assign: "策划出执行方案和沟通要点。",
        lines: [
          "方案 v1 写好了：高评分客户优先，首轮拿价值案例切。",
          "沟通要点清单也出了，每个客户的切入点都写明了，都存共享文件夹了。"
        ]
      },
      {
        assign: "顾问排执行优先级。",
        lines: [
          "执行项排好了，高分客户这周全部触达一轮。",
          "方案里对外承诺的部分，建议老板过一眼再发，我提了审批。"
        ]
      }
    ],
    approval: {
      title: "执行方案 v1 待审批",
      body: "方案要点：优先触达高评分目标客户，首轮以价值案例切入，三天后跟进。完整文档见项目共享文件夹。",
      approveNote: "已通过：触达策略师继续执行",
      rejectNote: "已驳回：内容策划修订后重新提交"
    },
    stats: [["46", "有效信息"], ["12", "决策人线索"], ["2", "方案文档"], ["4", "执行项"]],
    summary: "任务完成：产出已归档至项目共享文件夹，执行项按优先级推进。"
  }
};

// Sales shortcuts are explicit read/prepare/result workflows. Keeping them as
// separate scripts prevents a read-only action from accidentally opening an
// external-action approval card.
SCRIPTS.find = {
  decompose: "我先把客户画像、来源和筛选条件确认清楚，再由获客策略师和线索猎人建立候选池；这里只读公开信息，不触达任何账号。",
  brief: { title: "找人目标确认", objective: "建立符合画像的潜客候选池", scope: "抖音公开账号、作品、评论和互动信号", deliverable: "候选清单、来源证据和初步优先级", guardrail: "只读公开信息，不连接账号、不发送消息" },
  subs: [
    { skill: "定义画像", role: "把业务目标转成筛选条件", executor: "获客策略师", assign: "我先把目标客户的行业、地区、身份和需求信号拆清楚。", lines: ["目标画像已拆成行业、地区、身份和需求信号。", "我补齐了必须条件和可放宽条件，避免一开始把范围卡死。"], completion: "客户画像和找人条件已确认。" },
    { skill: "发现潜客", role: "从指定来源建立候选池", executor: "线索猎人", assign: "我按已确认的来源去发现账号，保留每条候选的来源和命中依据。", lines: ["正在从账号、粉丝、评论和内容信号中建立候选池。", "候选账号已去重，来源、发现时间和命中条件都已保留。"], completion: "候选池已建立，所有账号都有来源证据。" },
    { skill: "核验信号", role: "判断候选是否符合画像", executor: "线索分析师", assign: "我会核验主页、作品和互动信号，先把证据不足的候选标出来。", lines: ["正在核对候选的身份、活跃度和需求表达。", "符合画像的候选已分层，证据不足的账号进入待核验区。"], completion: "候选已完成初步分层，等待你查看结果。" }
  ],
  approval: { title: "候选池已准备好", body: "这是只读候选结果，不会触达账号。你可以查看证据、调整条件或继续准备触达。", approveNote: "已确认候选结果", rejectNote: "已保留候选和证据，等待调整条件" },
  approvalRequired: false,
  stats: [["120", "候选账号"], ["48", "符合画像"], ["16", "高意向"], ["0", "外部动作"]],
  summary: "找人完成：候选账号、来源证据和初步优先级已整理好，可以继续进入线索分析或触达准备。"
};

SCRIPTS.analyze = {
  decompose: "我先合并重复账号，再按意向、来源、证据和时效给线索分层；分析过程只读现有线索，不改变外部客户状态。",
  brief: { title: "线索分析确认", objective: "找出最值得优先处理的线索", scope: "当前项目组线索、来源、互动和历史触达记录", deliverable: "去重结果、意向分层、证据简报和优先级", guardrail: "不发送消息，不修改客户状态" },
  subs: [
    { skill: "合并去重", role: "统一账号身份和多来源记录", executor: "数据分析师", assign: "我先把同一个账号的多条来源合并，保留全部发现路径。", lines: ["正在按账号唯一键合并重复线索。", "重复记录已合并，多来源证据仍然保留。"], completion: "线索已完成去重并统一身份。" },
    { skill: "意向评分", role: "按需求信号和时效分层", executor: "线索分析师", assign: "我会结合明确需求、互动强度和时间新鲜度解释分数。", lines: ["正在核对需求表达、互动强度和最近活跃时间。", "Hot、Warm、Low 三档已生成，每条都有可展开的评分依据。"], completion: "意向分层完成，优先级和理由已整理。" },
    { skill: "客户简报", role: "提炼联系前必须知道的上下文", executor: "客户研究员", assign: "我把主页、作品、评论和历史触达整理成每人的联系前简报。", lines: ["正在补齐近期作品、评论和历史触达上下文。", "每条高优先级线索都绑定了切入点和证据时间。"], completion: "客户简报已完成，可以继续准备触达。" }
  ],
  approval: { title: "线索分析结果已准备好", body: "分析和研究是只读动作，不会发送消息。你可以查看证据，或者继续生成触达方案。", approveNote: "已确认分析结果", rejectNote: "已保留分析结果，等待调整规则" },
  approvalRequired: false,
  stats: [["326", "去重线索"], ["86", "有效线索"], ["42", "高意向"], ["100%", "有依据"]],
  summary: "线索分析完成：重复账号已合并，高意向线索有分数、来源和证据，可继续进入触达准备。"
};

SCRIPTS.outreach = {
  decompose: "我先读取已确认的线索简报，逐条生成触达理由、渠道、首句和后续计划；任何外部动作都先停在审批卡，等你确认。",
  brief: { title: "触达准备确认", objective: "为已确认线索生成可审核的首轮触达方案", scope: "已选线索的简报、来源证据和历史触达记录", deliverable: "触达理由、渠道、消息草稿、发送时机和后续计划", guardrail: "审批前不执行；重复、拒绝和风险线索自动拦截" },
  subs: [
    { skill: "生成触达理由", role: "把证据转成自然的联系起点", executor: "触达策略师", assign: "我会为每条线索写清楚为什么现在联系，以及从哪条证据切入。", lines: ["正在读取每条线索的来源、需求信号和最近行为。", "每条消息都绑定了联系理由，不只替换昵称。"], completion: "触达理由已生成并绑定证据。" },
    { skill: "风控检查", role: "拦截重复、拒绝和不可触达对象", executor: "风控专员", assign: "我先检查冷却、重复触达、勿扰和账号权限。", lines: ["正在核对历史触达、冷却时间和 Do Not Contact 状态。", "可发送、需修改和跳过的对象已分开标记。"], completion: "风控检查完成，拦截原因已清楚展示。" },
    { skill: "准备消息草稿", role: "生成逐条个性化首句", executor: "触达策略师", assign: "我会按客户上下文生成首句和轻量 CTA，不编造价格或承诺。", lines: ["首句已按客户原始需求和业务场景生成。", "每条消息都经过敏感承诺和重复触达检查。"], completion: "首轮消息草稿已准备好，等待审批。" }
  ],
  approval: { title: "首轮触达方案待确认", body: "即将展示对象、渠道、触达理由、消息正文、风控结果和后续计划。确认后才会进入执行队列。", approveNote: "已通过：触达任务进入执行队列", rejectNote: "已驳回：保留草稿和拦截原因，等待修改" },
  approvalRequired: true,
  stats: [["42", "待触达"], ["39", "可发送"], ["2", "需修改"], ["1", "已拦截"]],
  summary: "触达准备完成：消息、理由和风控结果已整理，等待你审批后进入执行队列。"
};

SCRIPTS.results = {
  decompose: "我把当前项目组的找人、触达、回复和异常数据汇总成一张结果简报，并保留每个数字的来源和时间范围。",
  brief: { title: "结果分析范围确认", objective: "看清当前销售动作的产出、异常和下一步", scope: "项目组任务、线索、触达和回复事件", deliverable: "漏斗数据、异常解释、回复摘要和下一步建议", guardrail: "只读分析，不修改线索，不执行触达" },
  subs: [
    { skill: "汇总漏斗", role: "统一找人、触达和回复口径", executor: "数据分析师", assign: "我先把各任务的线索、触达和回复数据统一到同一时间范围。", lines: ["正在汇总当前项目组的任务和业务事件。", "找人、触达、送达和回复漏斗已对齐。"], completion: "结果漏斗已整理完成。" },
    { skill: "解释异常", role: "定位失败、拦截和未回复原因", executor: "数据分析师", assign: "我会把失败、不可触达和回复下降拆成可处理的原因。", lines: ["正在核对失败、风控暂停和网络不确定状态。", "异常已按影响范围排序，并标注需要人工确认的地方。"], completion: "异常原因和影响范围已整理。" },
    { skill: "提出下一步", role: "把结果转成下一轮行动建议", executor: "幕僚长", assign: "我把数据结论转成下一轮找人、分析和触达建议。", lines: ["正在结合高意向、未回复和已回复线索制定下一步。", "下一轮建议已按优先级和停止条件整理好。"], completion: "结果简报和下一步建议已完成。" }
  ],
  approval: { title: "结果简报已准备好", body: "结果查看是只读动作，不会发送消息或修改客户状态。", approveNote: "已确认结果简报", rejectNote: "已保留结果简报" },
  approvalRequired: false,
  stats: [["326", "候选"], ["42", "高意向"], ["39", "已触达"], ["6", "已回复"]],
  summary: "结果分析完成：当前漏斗、异常原因、回复摘要和下一步建议已整理好。"
};

function applyBusinessPrompt(base, taskText) {
  if (base !== SCRIPTS.generic) return base;
  const context = resolveBusinessPrompt(taskText);
  const skillNames = {
    sales_pipeline: ["核验线索", "评估意向", "安排跟进", "检查接管"],
    customer_success: ["核对健康信号", "识别续约风险", "安排客户回访", "升级敏感事项"],
    recruiting: ["核验候选人", "评估岗位匹配", "安排面试推进", "确认邀约边界"],
    education: ["整理咨询记录", "评估试听意向", "安排招生跟进", "审核敏感承诺"],
    professional_services: ["确认客户需求", "评估商机阶段", "起草方案提纲", "审核报价承诺"]
  }[context.id] || [];
  return {
    ...base,
    decompose: context.decompose,
    brief: {
      title: "执行前确认",
      objective: context.objective,
      scope: context.scope,
      deliverable: context.deliverable,
      guardrail: context.guardrail
    },
    subs: base.subs.map((step, index) => ({
      ...step,
      skill: skillNames[index] || step.skill,
      assign: context.assignments[index] || step.assign,
      lines: context.logs[index] || step.lines
    })),
    approval: { ...base.approval, ...context.approval },
    stats: context.stats,
    summary: context.summary
  };
}

function buildTouchSubsteps(touchPlan, { online = false } = {}) {
  const simulation = online ? null : buildTouchSimulation(touchPlan);
  const count = simulation?.candidates.length || 0;
  return [
    {
      skill: "找人",
      role: "按来源发现候选并保留依据",
      executor: online ? "抖音数据连接" : "本地模拟筛选",
      assign: online ? `我先按${touchPlan.source.label}从已授权的抖音账号建立候选池，保留来源和命中依据。` : `我先按${touchPlan.source.label}找人，只整理公开描述里的候选，不连接账号。`,
      lines: [
        `已根据${touchPlan.source.label}建立候选范围，目标是${touchPlan.audience}。`,
        `我先按${touchPlan.timeWindow}和${touchPlan.signal}筛第一批结果，重复项和无关互动不会进入名单。`,
        online ? "候选正在由已授权账号读取，后端会返回命中原因和待核验项。" : `找到 ${count} 位候选，每位都保留命中原因和待核验项，下一步交给我继续筛选。`
      ],
      completion: online ? "候选范围已建立，来源、行为信号和待核验项会随结果返回。" : `我已找到 ${count} 位候选，来源、行为信号和待核验项都整理好了。`
    },
    {
      skill: "筛选",
      role: "核验信号并确定优先级",
      executor: online ? "线索分析服务" : "本地规则模拟",
      assign: online ? "我会按需求意向、时间范围和关系类型去重，并把证据不足的候选单独标出来。" : "我会按需求意向、时间范围和关系类型去重，再把证据不足的候选单独标出来。",
      lines: [
        `筛选条件已应用：${touchPlan.filter}。`,
        `命中${touchPlan.intent}的候选优先保留，缺少明确渠道或需求信号的先标记待确认。`,
        online ? "筛选结果会由后端返回，未通过风控的候选不会进入触达队列。" : `筛选完成：${simulation.selectedCount} 位进入首触预览，其余候选不会被自动触达。`
      ],
      completion: online ? "候选筛选已完成，结果和证据正在返回。" : `我已完成候选筛选，${simulation.selectedCount} 位进入首触预览，未通过的候选已留在待核验区。`
    },
    {
      skill: "生成首触",
      role: "根据命中信号生成沟通草稿",
      executor: online ? "触达策略服务" : "本地文案模拟",
      assign: online ? "我会只承接候选已经表达的需求，先生成一条可审核的首触草稿。" : "我会只承接候选已经表达的需求，先生成一条可审核的首触草稿。",
      lines: [
        online ? `我按${touchPlan.intent}生成可审核的触达草稿，不添加价格、库存或优惠承诺。` : `我按${touchPlan.intent}生成一条${simulation.draft.channel}草稿，不添加价格、库存或优惠承诺。`,
        `草稿会解释为什么联系对方，并留一个轻量问题，不会连续追问。`,
        online ? "草稿会绑定候选证据，发送前仍停在审批卡。" : `首触草稿已生成：${simulation.draft.body}`
      ],
      completion: "我已完成首触草稿，下一步只等你确认候选和沟通内容。"
    },
    {
      skill: "确认触达",
      role: "展示候选与外部动作边界",
      executor: "前端审批卡",
      assign: online ? "我把候选、命中依据和首触草稿放到审批卡里，你确认后才会推进已授权账号的真实触达。" : "我把候选、命中依据和首触草稿放到审批卡里，你确认后才会推进本地模拟触达。",
      lines: [
        online ? "当前候选、来源证据和草稿将由后端返回到审批卡。" : `当前候选：${simulation.candidates.map((candidate) => candidate.name).join("、")}。`,
        `下一步动作：${touchPlan.action}。`,
        online ? "审批前不会发送任何消息；确认后才允许已授权账号进入执行队列。" : "审批前不会发送任何消息；确认后只展示本地模拟结果和跟进建议。"
      ],
      completion: online ? "候选和触达草稿已准备好，等待你确认后执行。" : `我已准备好候选和${simulation.draft.title}，等待你确认 ${simulation.selectedCount} 位对象。`
    }
  ];
}

function applyTouchAudiencePlan(base, taskText, { online = false } = {}) {
  const touchPlan = parseTouchRequest(taskText);
  if (!touchPlan) return base;
  const simulation = online ? null : buildTouchSimulation(touchPlan);
  const waitingCount = simulation?.outcomes.filter((item) => item.status === "等待回复").length || 0;
  const repliedCount = simulation?.outcomes.filter((item) => item.status === "已回复").length || 0;
  const humanCount = simulation?.outcomes.filter((item) => item.status === "待人工确认").length || 0;
  const missingNote = touchPlan.missing.length
    ? `还缺少：${touchPlan.missing.join("、")}。`
    : "关键信息已识别，可以先看候选和触达草稿。";
  return {
    ...base,
    touchPlan,
    subs: buildTouchSubsteps(touchPlan, { online }),
    decompose: online
      ? `我先把这次触达拆成来源、人群、行为信号、筛选条件和时间范围，再从已授权账号读取结果。${missingNote}外部消息仍会停在审批卡，未确认前不会发送。`
      : `我先把这次触达拆成来源、人群、行为信号、筛选条件和时间范围，再给你看一小组候选。${missingNote}整个过程先用本地模拟数据展示，不连接账号，也不会真的发消息。`,
    brief: {
      title: "触达目标确认",
      objective: `找到${touchPlan.audience}，依据${touchPlan.signal}筛出值得优先处理的人`,
      scope: `来源：${touchPlan.source.label}；时间：${touchPlan.timeWindow}；关系：${touchPlan.relationship}`,
      deliverable: online ? "候选结果、筛选依据、首触草稿和执行结果" : "候选预览、筛选依据、首触草稿和模拟触达结果",
      guardrail: online ? `只使用已授权账号和公开数据；发送前必须审批。${missingNote}` : `只展示前端模拟，不连接账号、不发送消息、不修改客户记录。${missingNote}`,
      touchPlan
    },
    approval: {
      title: online ? "首轮触达方案预览" : "模拟触达预览",
      body: online ? `将按「${touchPlan.audience}」和「${touchPlan.filter}」返回真实候选和首触草稿。确认后才会进入已授权账号的执行队列。` : `将按「${touchPlan.audience}」和「${touchPlan.filter}」展示候选，并生成对应的首触草稿。确认后只推进本地演示状态，不会发送任何外部消息。`,
      approveNote: online ? "已确认：触达任务进入已授权账号的执行队列" : "已确认：前端模拟触达完成，结果已整理在当前任务中",
      rejectNote: "已暂缓：候选和筛选条件保留，可继续修改目标"
    },
    stats: online ? [] : [[String(simulation.candidates.length), "找到候选"], [String(simulation.selectedCount), "首触草稿"], [String(repliedCount), "模拟回复"], [String(waitingCount + humanCount), "后续跟进"]],
    summary: online ? `已完成${touchPlan.source.label}的候选与触达准备，等待后端结果和你的审批。` : `已完成${touchPlan.source.label}的找人、筛选和模拟触达：${simulation.candidates.length} 位候选，${simulation.selectedCount} 位进入首触，${repliedCount} 位模拟回复，${waitingCount + humanCount} 位进入后续跟进。`
  };
}

export function getDialogueScript(scriptKey, taskText = "", options = {}) {
  const base = applyBusinessPrompt(SCRIPTS[scriptKey] || SCRIPTS.generic, taskText);
  return ["find", "analyze", "results"].includes(scriptKey)
    ? base
    : applyTouchAudiencePlan(base, taskText, options);
}

export function getDialogueRuntimeDefinition(scriptKey, taskText = "", options = {}) {
  const key = SCRIPTS[scriptKey] ? scriptKey : "generic";
  const script = getDialogueScript(key, taskText, options);
  const business = key === "generic" ? resolveBusinessPrompt(taskText) : null;
  const agent = {
    ...SCENARIO_AGENTS[key],
    ...(business ? {
      id: `${business.id}_operator`,
      name: `${business.label} Agent`,
      role: `由${business.owner}协同，按业务口径拆解并交付结果`
    } : {})
  };
  const skills = script.subs.map((step, index) => ({
    id: step.id || SCENARIO_SKILL_IDS[key]?.[index] || `skill_${index + 1}`,
    name: step.skill || step.role || `执行步骤 ${index + 1}`,
    role: step.role || "按计划执行",
    executor: step.executor || MEMBER_SLOTS[index]?.type || "LLM + Policy",
    order: index + 1
  }));
  return { key, agent, skills };
}

export function getDialogueBrief(scriptKey, taskText = "") {
  return getDialogueScript(scriptKey, taskText).brief;
}

/** Project an authoritative server proposal into the requirement card shape. */
export function requirementBriefFromProposal(proposal) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new TypeError("A server requirement proposal is required");
  }
  const required = ["title", "objective", "scope", "deliverable", "guardrail"];
  const missing = required.filter((key) => typeof proposal[key] !== "string" || !proposal[key].trim());
  if (missing.length) throw new TypeError(`Server requirement proposal is missing: ${missing.join(", ")}`);
  const version = proposal.proposalVersion ?? proposal.version ?? proposal.schemaVersion ?? 1;
  if (!Number.isInteger(Number(version)) || Number(version) < 1) throw new TypeError("Server requirement proposal version is invalid");
  return {
    title: proposal.title,
    objective: proposal.objective,
    scope: proposal.scope,
    deliverable: proposal.deliverable,
    guardrail: proposal.guardrail,
    ...(proposal.touchPlan && typeof proposal.touchPlan === "object" ? { touchPlan: proposal.touchPlan } : {}),
    ...(proposal.source ? { source: proposal.source } : {}),
    proposalVersion: Number(version)
  };
}

export function requirementNeedsAccountAccess(proposal, goal = "") {
  return requirementRequiresExternalAccess(proposal, { goal });
}

export function getSubCompletionMessage(scriptKey, index, taskText = "") {
  const step = getDialogueScript(scriptKey, taskText).subs[index];
  return step?.completion || `我已完成${step?.skill || "当前子任务"}，产出已归档，等待下一步接续。`;
}

export function getDialogueInteractionTrace(scriptKey, index, taskText = "") {
  const key = SCRIPTS[scriptKey] ? scriptKey : "generic";
  const definition = getDialogueRuntimeDefinition(key, taskText);
  const step = getDialogueScript(key, taskText).subs[index];
  const skill = definition.skills[index] || {};
  const logs = step?.lines || [];
  return {
    skill: skill.name || step?.skill || "执行步骤",
    role: skill.role || step?.role || "按计划执行",
    executor: skill.executor || step?.executor || "LLM + Policy",
    accepted: `已接受「${skill.name || step?.skill || "当前任务"}」：${skill.role || step?.role || "按计划执行"}。执行器：${skill.executor || step?.executor || "LLM + Policy"}。`,
    started: `开始执行「${skill.name || step?.skill || "当前任务"}」，由 ${skill.executor || step?.executor || "LLM + Policy"} 执行；验收：保留证据并产出结构化结果。`,
    logs: [...logs],
    completed: getSubCompletionMessage(key, index, taskText)
  };
}

/* 追问的模拟回复：回答当前 Goal/Task 的状态，不回落成泛化销售话术。 */
function followUpReply(text, engine) {
  const business = resolveBusinessPrompt(engine?.taskText);
  if (/停|取消|暂停|别做/.test(text)) {
    return engine?.scriptKey === "leads"
      ? "好的，已暂停自动触达并撤回排队中的 send_dm；已有对话和原始证据会保留，恢复前不会继续发消息。"
      : `好的，${business.label}相关执行项已暂停，排队中的外部动作已撤回。需要恢复时说一声。`;
  }
  if (/证据|为什么|依据/.test(text) && engine?.scriptKey === "leads") {
    return "每条候选都绑定原评论、来源作品、主页动态和意向解释；只有车型、预算、城市或到店时间等信号能相互印证，才进入 A 级触达。";
  }
  if (/人工|接管/.test(text) && engine?.scriptKey === "leads") {
    return "好的，已经把高风险会话交给人工负责人啦：遇到客户投诉、要求人工、价格审批或异常承诺时，我会先停止自动回复，并把完整上下文一起交过去。";
  }
  if (/进度|进展|怎么样/.test(text)) {
    return engine?.scriptKey === "leads"
      ? "当前进展：已观察 3,842 条互动，筛出 214 位候选；47 位进入 A 级，12 位产生有效回复，其中 5 位确认本周到店，2 位已转人工接管。"
      : `${business.progress} 关键节点会再找你确认。你也可以从任务结果里继续查看进展。`;
  }
  if (/谢谢|辛苦|好的|好/.test(text)) return "收到，有新的互动、回复或状态变化我会第一时间同步。";
  return engine?.scriptKey === "leads"
    ? "收到，我会把补充写入当前线索任务；新增候选先去重并保留证据，触达仍遵守权限、频控和人工接管规则。"
    : business.defaultReply;
}

/* ── 产出物：子任务完成时落库到项目共享文件夹（atSub = 子任务下标，null = 任务总结时）── */
const ARTIFACTS = {
  leads: [
    { atSub: 1, name: "抖音买车线索意向评分.csv", type: "sheet", content: `昵称,意向等级,评分,原始互动,来源,关键证据,下一步
上海阿杰,A,92,这周末到店还有现车优惠吗,直播间·新能源专场,到店时间+价格咨询+城市,首轮私信
小鹿要换车,A,88,预算30左右选Y还是智界,视频·车型对比,预算+车型对比,发送对比问题
老周在杭州,A,86,老车置换补贴能做到多少,直播间·置换补贴,城市+置换+明确问题,询问旧车情况
橘子汽水,B,68,最近优惠大不大,视频·城市通勤车,价格询问但时间不明,轻触达
旅行的风,C,32,这车看着还行,视频·家庭用车,仅泛讨论,暂不触达` },
    { atSub: 2, name: "高意向买车首触话术.md", type: "doc", content: `# 高意向买车首触话术

## 价格咨询
看到你刚才问 {{车型}} 的落地价。不同城市和配置会有差别，你更关注裸车价还是落地价？我先按你的情况帮你理一下。

## 车型对比
你提到在 {{车型A}} 和 {{车型B}} 之间选，这两款主要差在空间和用车场景。你平时市区通勤多，还是经常带家人出行？

## 置换评估
看到你问旧车置换。方便说下品牌、年份和大概里程吗？我先帮你判断需要准备哪些资料，不急着留电话。

## 到店预约
你说这周想看看实车。你通常工作日晚上方便，还是周末方便？我先帮你把可选时间和车型确认好。

> 禁止编造价格、库存、优惠；客户未回复不重复发送。` },
    { atSub: 3, name: "高意向会话跟进记录.csv", type: "sheet", content: `客户,当前状态,客户回复摘要,下一步,负责人
上海阿杰,SALES_QUALIFIED,周六下午可以到店,确认门店与试驾车型,触达策略师
小鹿要换车,ENGAGED,想看两款车落地价差,补充城市与预算,触达策略师
老周在杭州,CONTACT_READY,询问置换评估需要的资料,客户主动留资后转人工,触达策略师
橘子汽水,WAITING_CUSTOMER,已读未回,不重复触达,线索猎人
投诉客户,HUMAN_TAKEOVER,要求人工处理价格问题,停止自动回复并交接上下文,人工` },
    { atSub: null, name: "线索猎人运行总结-抖音买车.md", type: "doc", createdByChief: true, content: `# 线索猎人运行总结

## 本轮状态
- 观察互动 **3,842** 条，筛出候选 **214** 位
- A 级高意向 **47** 位，B 级 **86** 位，C 级 **81** 位
- 有效回复 **12** 位，其中 **5** 位确认本周到店
- **2** 位触发 HUMAN_TAKEOVER，已停止自动回复

## 规则
- A 级必须有车型、预算、城市或到店时间等可解释证据
- send_dm 前检查账号 READY、权限和单账号日频控 ≤ 20 条
- 不编造价格、库存、优惠，不重复追发；投诉、价格承诺和人工请求立即接管

## 下一步
- 等待客户回复并更新 Lead/Conversation 状态
- CONTACT_READY 的客户由人工确认联系方式，再进入 CRM` }
  ],
  content: [
    { atSub: 0, name: "爆款对标拆解 benchmarks.md", type: "doc", content: `# 爆款对标拆解（24 条样本）

## 开头钩子 TOP3
1. 反常识断言：「别再乱投豆荚了」——完播率均值 **41%**
2. 结果前置：「单条 50 万播放的方法就这 3 步」——完播率 **38%**
3. 身份代入：「开实体店的注意了」——完播率 **35%**

## 节奏结构
- 前 3 秒必出冲突/结果；15 秒处给第一个信息点；45 秒处二次钩住
- 转化点统一放在结尾 5 秒：引导私信关键词「清单」

## 可复用模板
钩子（反常识）→ 痛点共鸣 → 3 个方法（每个 10 秒）→ 案例佐证 → 私信引导` },
    { atSub: 1, name: "content-gap.csv", type: "sheet", content: `选题方向,竞争密度,搜索热度,互动率预估,优先级
门店引流避坑,低,高,9.2%,P0
评论区运营技巧,低,中,8.7%,P0
0 投放起号案例,中,高,8.1%,P1
员工号矩阵玩法,低,中,7.6%,P1
团购套餐设计,中,中,6.9%,P2
直播留人话术,高,中,6.2%,P2` },
    { atSub: 2, name: "14天选题日历.md", type: "doc", content: `# 未来 14 天选题日历（贴合粉丝活跃时段 12:00 / 19:30）

| 日期 | 选题 | 形式 | 发布时段 |
| --- | --- | --- | --- |
| D1 | 别再乱投豆荚了，0 投放起量 3 步法 | 口播 | 19:30 |
| D2 | 评论区这 3 种问法，都是准客户 | 图文 | 12:00 |
| D3 | 客户案例：美甲店 2 周线索翻倍实录 | 案例 | 19:30 |
| D4 | 门店账号简介这样写，私信多一倍 | 口播 | 12:00 |
| D5 | 直播留人开场 30 秒模板 | 口播 | 19:30 |
| D6 | 粉丝答疑：团购怎么设计不亏本 | 图文 | 12:00 |
| D7 | 一周数据复盘（连续剧式） | 数据 | 19:30 |
| D8-D14 | 按数据回流动态排期（详见共享文件夹） | - | - |` },
    { atSub: 2, name: "口播脚本初稿×3.md", type: "doc", content: `# 口播脚本初稿（3 条 · 60 秒）

## 脚本 1：0 投放起量
- 钩子 A：「别再乱投豆荚了」
- 钩子 B：「我这条视频没花一分钱，50 万播放」
- 正文：方法 1 评论区截流 / 方法 2 选题蹭搜索 / 方法 3 简介钩子
- 结尾：「想要清单的，评论区扣 1」

## 脚本 2：评论区截流
- 钩子 A：「你的同行正在评论区捡客户」
- 钩子 B：「同样一条爆款，有人看热闹，有人捡客户」
- 正文：找对标 → 识别咨询评论 → 3 步私信破冰
- 结尾：引导私信「话术」

## 脚本 3：案例拆解
- 钩子 A：「这家烧烤店 14 天做到同城热榜」
- 钩子 B：「0 粉丝的店，第一条视频就爆了」
- 正文：背景 → 动作拆解 → 数据对比
- 结尾：「想看自己行业怎么做的，私信『拆解』」` },
    { atSub: null, name: "内容运营任务总结.md", type: "doc", createdByChief: true, content: `# 内容运营任务总结

## 产出
- 爆款拆解 **24** 条（可复用模板 1 套）
- 选题日历 **8** 条（覆盖 14 天）
- 脚本初稿 **3** 条（A/B 钩子）

## 关键结论
- 反常识断言类钩子完播率最高（41%），作为主力结构
- 「评论区运营」方向竞争密度低、热度高，优先做

## 下一步
- 脚本待审批通过后按日历排期发布
- D8-D14 选题根据首周数据回流再定` }
  ],
  generic: [
    { atSub: 0, name: "目标市场情报汇总.md", type: "doc", content: `# 目标市场情报汇总（46 条有效信息）

## 客户动态
- 3 家目标客户近期有扩张动作（新开店/招加盟），切入窗口期
- 行业整体获客成本环比上涨，客户对「低成本获客」话题敏感度高

## 决策人线索
- 补全关键决策人 **12** 位（店主/运营负责人），联系方式已核验

## 关注点排序
1. 见效周期 2. 投入成本 3. 同行案例 4. 是否绑长期合约` },
    { atSub: 1, name: "analysis-scored.csv", type: "sheet", content: `目标客户,优先级,评分,决策人,状态,建议动作
星辰母婴店,P0,92,王店主,已建联,本周约电话
蓝湾健身,P0,88,李教练,已读未回,换话术二次触达
老周烧烤,P1,85,周老板,已建联,发案例视频
悦色美甲,P1,81,陈店长,新线索,首轮破冰
巷口咖啡,P2,74,吴老板,已建联,内容养熟
果然鲜,P2,69,赵店主,新线索,评论互动` },
    { atSub: 2, name: "执行方案 v1.md", type: "doc", content: `# 执行方案 v1

## 目标
本月新增有效线索 300 条，首触回复率 ≥ 10%

## 策略
1. **高评分优先**：P0 客户 48 小时内完成首轮触达
2. **案例切入**：首轮不带产品，只带同行业案例
3. **三天节奏**：首日破冰 → 次日互动 → 第三日跟进

## 分工
- 线索猎人：名单与补全
- 线索分析师：评分与优先级
- 内容策划：话术与物料
- 触达策略师：触达执行与反馈回流

## 风险与卡点
- 对外表述需审批后方可使用（本次卡点）
- 频控约束：单账号日私信 ≤ 20 条` },
    { atSub: 2, name: "客户沟通要点清单.md", type: "doc", content: `# 客户沟通要点清单

## 通用原则
- 先给价值，再谈合作；不承诺效果数字
- 每条消息只推进一个动作

## 高频问题应答
- 「多少钱」：先给配置差异清单，再约 10 分钟电话
- 「有没有案例」：发同行业连载记录，强调可查证
- 「再想想」：48 小时后以新干货二次触达，不追问

## 禁用表述
保证 / 稳赚 / 必火 / 百分百 / 无效退款（未经授权）` },
    { atSub: null, name: "任务总结.md", type: "doc", createdByChief: true, content: `# 任务总结

## 产出
- 有效信息 **46** 条，决策人线索 **12** 位
- 方案文档 **2** 份，执行项 **4** 个

## 关键结论
- 客户对「低成本获客」最敏感，方案已按此排序
- P0 客户 2 家进入 48 小时触达窗口

## 下一步
- 执行项按优先级推进，关键节点继续找你确认` }
  ]
};

function memberName(teamLive, type, fallback) {
  const raw = teamLive?.getProfiles?.().get(type)?.identity?.name || fallback;
  const visible = displayAgentName({ agentType: type, name: raw });
  // 档案名可能自带品牌前缀（如「SaleBuddy · 幕僚长」），消息署名会再加一次品牌名，这里剥掉
  return visible.replace(/^(?:SaleBuddy|Marvis|Byering)\s*[·\-—]\s*/i, "") || fallback;
}

/* ═══════════ 引擎：任务状态机 + 事件流（模块级，与视图生命周期解耦） ═══════════ */

const RUNS = new Map(); // taskId -> engine

function remoteTaskIdFor(engine) {
  // The local task-store id is only a UI projection key. Once a task is
  // online, every command and event must use the authoritative server id.
  return engine?.remoteTaskId || null;
}

export function isRemoteTaskNotFound(error) {
  const candidates = [
    error?.code,
    error?.message,
    error?.cause?.code,
    error?.cause?.message,
    error?.cause?.details?.error?.code,
    error?.details?.error?.code
  ];
  return candidates.some((value) => /TASK_NOT_FOUND|TASK\s+NOT\s+FOUND/i.test(String(value || "")));
}

function commandTaskIdFor(engine) {
  return engine?.online ? remoteTaskIdFor(engine) : (engine?.taskId || null);
}

/** Clear a lost server task identity without deleting the local audit trail. */
function resetRemoteTaskIdentity(engine) {
  engine.remoteTaskStale = false;
  engine.remoteTaskId = null;
  engine.remoteRunId = null;
  engine.remoteConversationId = null;
  engine.remoteTaskVersion = null;
  engine.remoteTaskSeq = null;
  engine.remoteTaskCreated = false;
  engine.remoteTaskProvisioning = false;
  engine.remoteTaskPromise = null;
  engine.remoteRunStarted = false;
  engine.remoteUnsubscribe?.();
  engine.remoteUnsubscribe = null;
  if (typeof engine.remoteTaskSubscription === "function") engine.remoteTaskSubscription();
  engine.remoteTaskSubscription = null;
  engine.remoteAdapter = null;
  engine.requirementProposal = null;
  engine.requirementRequested = false;
  engine.forceRequirementRefresh = true;
  engine.accessStage = "requirement";
  engine.paused = false;
  engine.cancelled = false;
  engine.approvalShown = false;
  engine.approvalPending = false;
  engine.decision = null;
  engine.touchSelection = null;
  engine.engineInitialized = false;

  const view = engine.viewState;
  if (view) {
    const removeCard = (key) => {
      const card = view.av?.[key] || view.pv?.[key];
      card?.closest?.(".sb-msg")?.remove();
      if (view.av && key in view.av) view.av[key] = null;
      if (view.pv && key in view.pv) view.pv[key] = null;
    };
    ["requirementCard", "assignmentCard", "authCard", "scopeCard"].forEach(removeCard);
    ["approvalBox", "recoveryCard"].forEach(removeCard);
    if (view.av) {
      view.av.requirementTag = null;
      view.av.requirementButton = null;
      view.av.requirementEditButton = null;
      view.av.requirementActions = null;
      view.av.authTag = null;
      view.av.authButton = null;
      view.av.authActions = null;
      view.av.scopeTag = null;
      view.av.scopeButton = null;
    }
    if (view.pv) {
      view.pv.approvalBtns = null;
      view.pv.progressFiles = null;
      view.pv.resultFiles = null;
    }
  }
  syncTask(engine, { status: "progress", preview: "服务端任务已失效，等待重新建立任务…" });
}

function remoteAckSources(ack) {
  return [ack, ack?.data, ack?.data?.data].filter((source) => source && typeof source === "object" && !Array.isArray(source));
}

function remoteAckField(ack, fields) {
  for (const source of remoteAckSources(ack)) {
    for (const field of fields) {
      if (source[field] != null && source[field] !== "") return source[field];
    }
  }
  return null;
}

function remoteAckInteger(ack, fields) {
  const value = remoteAckField(ack, fields);
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function remoteCommand(engine, type, payload = {}) {
  if (!engine.online || !engine.commandClient) return Promise.resolve(null);
  if (!engine.remoteTaskId) {
    const error = new Error("服务端任务身份已失效，请重新建立任务");
    error.code = "REMOTE_TASK_ID_MISSING";
    return Promise.reject(error);
  }
  const ready = engine.remoteTaskPromise || Promise.resolve();
  return ready.then(() => engine.commandClient.send(type, {
    taskId: engine.remoteTaskId,
    taskRunId: engine.remoteRunId,
    conversationId: engine.remoteConversationId,
    expectedVersion: Number.isInteger(engine.remoteTaskVersion) ? engine.remoteTaskVersion : undefined,
    payload
  })).then((ack) => {
    const taskId = remoteAckField(ack, ["taskId", "task_id"]);
    const taskRunId = remoteAckField(ack, ["taskRunId", "task_run_id", "runId", "run_id"]);
    const conversationId = remoteAckField(ack, ["conversationId", "conversation_id"]);
    const currentVersion = remoteAckInteger(ack, ["currentVersion", "current_version", "version"]);
    const currentSeq = remoteAckInteger(ack, ["currentSeq", "current_seq", "seq"]);
    if (taskId) engine.remoteTaskId = taskId;
    if (taskRunId) engine.remoteRunId = taskRunId;
    if (conversationId) engine.remoteConversationId = conversationId;
    if (currentVersion != null) engine.remoteTaskVersion = currentVersion;
    if (currentSeq != null) engine.remoteTaskSeq = currentSeq;
    return ack;
  });
}

function requirementProposalFromAck(ack) {
  return ack?.data?.requirement
    || ack?.data?.data?.requirement
    || ack?.requirement
    || ack?.data?.requirementProposal
    || null;
}

function requirementProposalFromEvents(events = []) {
  return [...events].reverse().find((event) => event.t === "requirement-proposed")?.proposal || null;
}

export function hasOnlineExecutionTransport(engine = {}) {
  return Boolean(
    engine?.online
    && typeof engine?.gateway?.on === "function"
    && (
      engine?.gateway?.executionReady === true
      || typeof engine?.gateway?.nativeGateway?.run === "function"
      || typeof engine?.gateway?.run === "function" && engine?.gateway?.controlPlane == null
    )
  );
}

function emitRemoteRequirement(engine, proposal) {
  if (!proposal) {
    emit(engine, {
      t: "task-error",
      text: "服务端没有返回结构化需求理解，任务已停止。请检查我的服务配置后重试。",
      errorCode: "REQUIREMENT_PROPOSAL_MISSING",
      retryable: true
    });
    return false;
  }
  let brief;
  try {
    brief = requirementBriefFromProposal(proposal);
  } catch (error) {
    emit(engine, {
      t: "task-error",
      text: `服务端需求理解格式无效：${error.message}`,
      errorCode: "INVALID_REQUIREMENT_PROPOSAL",
      retryable: true
    });
    return false;
  }
  engine.requirementProposal = proposal;
  if (!engine.runtime.events.some((event) => event.t === "user")) emit(engine, { t: "user", text: engine.taskText, online: true });
  if (!engine.runtime.events.some((event) => event.t === "chief" && event.source === "model")) {
    emit(engine, {
      t: "chief",
      text: `我已根据你的目标形成一份可执行理解：${brief.objective}。请核对数据范围、交付结果和停止边界，确认后我才会安排执行。`,
      source: "model",
      proposalVersion: brief.proposalVersion
    });
  }
  const refreshRequirement = engine.forceRequirementRefresh === true;
  if (refreshRequirement || !engine.runtime.events.some((event) => event.t === "requirement-proposed")) {
    emit(engine, { t: "requirement-proposed", proposal, brief, source: proposal.source || "model" });
  }
  if (refreshRequirement) {
    emit(engine, {
      t: "requirement-edited",
      taskText: engine.taskText,
      proposal,
      brief,
      text: "服务端任务已重新建立，请再次确认这份需求理解。"
    });
    engine.forceRequirementRefresh = false;
  } else if (!engine.runtime.events.some((event) => event.t === "requirement-required")) {
    syncTask(engine, { status: "progress", preview: "我已经理解了你的需求，等你确认…" });
    emit(engine, {
      t: "requirement-required",
      taskText: engine.taskText,
      brief,
      proposal,
      text: "请确认我对任务目标、数据范围、交付结果和停止边界的理解。"
    });
  }
  return true;
}

function requestRemoteRequirement(engine) {
  if (engine.requirementRequested) return;
  engine.requirementRequested = true;
  if (engine.requirementProposal) {
    emitRemoteRequirement(engine, engine.requirementProposal);
    return;
  }
  remoteCommand(engine, COMMAND_TYPES.REQUIREMENT_REQUEST, {
    goal: engine.taskText,
    taskText: engine.taskText,
    projectId: engine.projectId || null,
    projectName: engine.projectName || null,
    scenario: engine.scriptKey
  }).then((ack) => {
    const proposal = requirementProposalFromAck(ack);
    if (!proposal) throw new Error("服务端未返回需求提案");
    emitRemoteRequirement(engine, proposal);
  }).catch((error) => {
    engine.requirementRequested = false;
    emit(engine, {
      t: "task-error",
      text: `需求理解未完成：${error?.message || "服务端连接异常"}`,
      errorCode: error?.code || "REQUIREMENT_REQUEST_FAILED",
      retryable: true
    });
  });
}

export function getTaskRuntimeSnapshot(taskId) {
  const engine = taskId ? RUNS.get(taskId) : null;
  return engine ? getRuntimeSnapshot(engine.runtime) : null;
}

function runtimeSkillFor(engine, index) {
  const skill = engine.runtimeDefinition?.skills?.[index];
  if (!skill) return {};
  return {
    skillId: skill.id,
    skill: skill.name,
    executor: skill.executor,
    agentId: engine.runtime?.agentRun?.agentId,
    agentName: engine.runtime?.agentRun?.name
  };
}

function emit(engine, event) {
  const runtimeEvent = appendRuntimeEvent(engine.runtime, {
    ...(event.i != null ? runtimeSkillFor(engine, event.i) : {}),
    ...event
  });
  syncTask(engine, {});
  const activityAgents = [
    event.agentType,
    event.agentName,
    event.t === "account-resolved" ? "acquisition_strategist" : null
  ].filter(Boolean);
  if (["user", "chief", "run-started", "progress-start", "requirement-required", "requirement-confirmed", "assignment-plan"].includes(event.t)) activityAgents.push("main");
  for (const activityAgent of new Set(activityAgents)) {
    // An unrelated message must not clear the employee's last meaningful status.
    const label = activityLabelFor(activityAgent, event);
    if (label) setAgentActivity(activityAgent, label);
  }
  if (event.t === "summary" || event.t === "task-error" || event.t === "task-blocked") clearAgentActivities();
  for (const fn of engine.listeners) {
    try { fn(runtimeEvent); } catch { /* 单个视图异常不影响引擎 */ }
  }
}

function syncTask(engine, patch) {
  if (!engine.taskId) return;
  const snapshot = engine.runtime?.snapshot;
  const interactionTaskState = snapshot?.interaction?.taskState;
  const runtimeStatus = {
    WAITING_APPROVAL: "approval",
    PAUSED: "blocked",
    BLOCKED: "blocked",
    FAILED: "failed",
    SUCCEEDED: "done",
    CANCELLED: "blocked"
  }[interactionTaskState] || null;
  updateTask(engine.taskId, {
    ...patch,
    remoteTaskId: engine.remoteTaskId || null,
    remoteTaskRunId: engine.remoteRunId || null,
    remoteConversationId: engine.remoteConversationId || null,
    remoteTaskVersion: Number.isInteger(engine.remoteTaskVersion) ? engine.remoteTaskVersion : null,
    remoteTaskSeq: Number.isInteger(engine.remoteTaskSeq) ? engine.remoteTaskSeq : null,
    browserSessionId: engine.browserSessionId || null,
    ...(patch.status === undefined && runtimeStatus ? { status: runtimeStatus } : {}),
    runtimeState: snapshot?.taskState || null,
    runtimeProgress: snapshot?.progress || 0,
    runtimeAgentId: engine.runtime?.agentRun?.agentId || null,
    runtimeAgentName: engine.runtime?.agentRun?.name || null,
    activeSkillId: snapshot?.activeSkill?.skillId || null,
    activeSkillName: snapshot?.activeSkill?.skill || null,
    runtimeEventSequence: engine.runtime?.events?.length || 0,
    runtimeEvents: engine.runtime?.events || [],
    runtimeSnapshot: snapshot || null,
    runtimeInteraction: snapshot?.interaction || null,
    ...(snapshot?.resultSnapshot ? { resultSnapshot: snapshot.resultSnapshot } : {}),
    ...(Array.isArray(snapshot?.artifacts) ? { artifacts: snapshot.artifacts } : {})
  });
}

function resultSnapshotFor(engine, event = {}) {
  const supplied = event.resultSnapshot
    || event.result
    || event.data?.resultSnapshot
    || engine.runtime?.snapshot?.resultSnapshot;
  if (supplied && typeof supplied === "object") {
    return { schemaVersion: 1, source: supplied.source || (engine.online ? "gateway" : "runtime"), ...supplied };
  }
  if (engine.online) {
    return {
      schemaVersion: 1,
      source: "gateway",
      completedAt: new Date().toISOString(),
      metrics: [],
      summary: event.text || "任务已完成，等待业务系统返回结构化结果"
    };
  }
  const stats = Array.isArray(engine.script?.stats) ? engine.script.stats : [];
  const metrics = stats.map(([rawValue, label], index) => {
    const valueText = String(rawValue || "").replace(/,/g, "");
    const numeric = Number.parseFloat(valueText);
    if (!Number.isFinite(numeric)) return null;
    return {
      key: `${engine.scriptKey || "task"}_${index + 1}`,
      label: label || `结果 ${index + 1}`,
      value: numeric,
      unit: /天$/.test(String(rawValue)) ? "天" : ""
    };
  }).filter(Boolean);
  return {
    schemaVersion: 1,
    source: "demo",
    completedAt: new Date().toISOString(),
    metrics,
    summary: event.text || engine.script?.summary || "任务已完成"
  };
}

function numericResultCount(snapshot, keys = [], labelPattern = null) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const sources = [snapshot, snapshot.counts, snapshot.summary].filter((value) => value && typeof value === "object");
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (Number.isFinite(Number(value))) return Number(value);
      if (Array.isArray(value)) return value.length;
    }
  }
  if (labelPattern && Array.isArray(snapshot.metrics)) {
    const metric = snapshot.metrics.find((item) => labelPattern.test(String(item?.key || "")) || labelPattern.test(String(item?.label || "")));
    const value = metric?.value ?? metric?.count ?? metric?.displayValue;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function resultCountsFor(snapshot) {
  return {
    leads: numericResultCount(
      snapshot,
      ["leads", "leadCount", "candidateCount", "candidates", "qualifiedCount"],
      /lead|候选|线索|qualified|candidate/i
    ),
    outreach: numericResultCount(
      snapshot,
      ["outreach", "outreachCount", "sentCount", "touchCount", "scheduledCount"],
      /outreach|触达|发送|首触|scheduled|sent/i
    ),
    replies: numericResultCount(
      snapshot,
      ["replies", "replyCount", "repliedCount"],
      /reply|回复|replied/i
    )
  };
}

/* 各剧本任务完结时计入资源中心的产出线索数（投入产出效率面板用） */
const LEADS_BY_SCRIPT = { leads: 214, content: 0, generic: 12 };

/** 子任务完成/任务总结时，把产出物落库到项目共享文件夹并发出文件事件。返回产出文件名列表。 */
function produceArtifacts(engine, atSub) {
  const items = (ARTIFACTS[engine.scriptKey] || []).filter((a) => a.atSub === atSub);
  const names = [];
  for (const art of items) {
    const createdBy = art.createdByChief
      ? memberName(engine.teamLive, "main", "幕僚长")
      : engine.runtime?.agentRun?.name || memberName(engine.teamLive, MEMBER_SLOTS[atSub]?.type, MEMBER_SLOTS[atSub]?.fallback || "成员");
    const id = addFile({
      name: art.name,
      type: art.type,
      content: art.content,
      projectId: engine.projectId,
      projectName: engine.projectName,
      taskId: engine.taskId,
      createdBy
    });
    engine.fileCount = (engine.fileCount || 0) + 1;
    // 存储成本：每份产出 ¥0.02
    recordCost({
      taskId: engine.taskId,
      projectName: engine.projectName,
      agent: createdBy,
      kind: "storage",
      label: `文件存储 · ${art.name}`,
      amount: 0.02
    });
    names.push(art.name);
    emit(engine, { t: "file", id, name: art.name, ftype: art.type, createdBy });
  }
  return names;
}

/** 子任务完成时记录该成员的执行成本（Token + 云电脑 + 岗位相关的 API/数据/邮件）。 */
function recordSubCost(engine, i) {
  const skill = engine.runtimeDefinition?.skills?.[i] || {};
  const slot = MEMBER_SLOTS[i] || {
    type: skill.executor || "LLM + Policy",
    fallback: engine.runtime?.agentRun?.name || "项目执行 Agent",
    role: skill.role || "按计划执行"
  };
  if (!slot) return;
  const agent = engine.runtime?.agentRun?.name || memberName(engine.teamLive, slot.type, slot.fallback);
  const logCount = engine.script.subs[i]?.lines.length || 4;
  const base = { taskId: engine.taskId, projectName: engine.projectName, agent };
  recordCost({ ...base, kind: "token", label: `模型 Token · ${slot.role}`, amount: logCount * 0.42 + 0.5 + Math.random() * 0.5 });
  recordCost({ ...base, kind: "cloud", label: "云电脑 · 子任务执行", amount: 0.9 + Math.random() * 0.9 });
  if (slot.type === "Browser Agent") {
    recordCost({ ...base, kind: "api", label: "搜索 API · 检索调用", amount: 0.6 + Math.random() * 0.5 });
  } else if (slot.type === "Search Agent") {
    recordCost({ ...base, kind: "data", label: "数据采购 · 信息补全", amount: 1.2 + Math.random() * 0.8 });
  } else if (slot.type === "App Agent") {
    recordCost({ ...base, kind: "mail", label: "社交私信 · 触达执行", amount: 0.8 + Math.random() * 0.6 });
  }
}

/** Start the account-scoped browser workspace after requirement and assignment gates. */
function beginAccessAuthorization(engine) {
  if (engine.accessStage !== "required") return;
  const apply = () => {
    engine.accessStage = "authorizing";
    emit(engine, {
      t: "auth-started",
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      text: `正在打开${engine.accessSetup.provider}授权页，等待用户确认。`
    });
  };
  if (engine.online && engine.commandClient) {
    remoteCommand(engine, COMMAND_TYPES.ACCESS_REQUEST, {
      authorizationStarted: true,
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      scopes: engine.accessSetup.scopes
    }).then(() => {
      // The server event remains the source of truth. The scoped view handler
      // opens the browser workspace after auth-started arrives; this command
      // callback must not call view-only helpers outside that scope.
      engine.accessStage = "authorizing";
      syncTask(engine, { status: "progress", preview: "授权请求已送达，等待真实浏览器工作区打开…" });
    }).catch((error) => emit(engine, {
      t: "task-error",
      text: `授权请求未送达：${error?.message || "连接异常"}`,
      errorCode: "ACCESS_REQUEST_FAILED",
      retryable: true
    }));
    return;
  }
  apply();
}

/** The browser workspace calls this only after the backend verifies a real login session. */
function completeAccessAuthorization(engine) {
  if (engine.accessStage !== "authorizing") return;
  if (engine.online && engine.commandClient) {
    // Browser login is a real server-side fact. Report it to the control
    // plane and wait for ACCESS_GRANTED before rendering the scope gate.
    remoteCommand(engine, COMMAND_TYPES.ACCESS_REQUEST, {
      authorizationConfirmed: true,
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      browserSessionId: engine.browserSessionId || null,
      scopes: engine.accessSetup.scopes
    }).then(() => {
      engine.accessStage = "awaiting-server-scope";
      syncTask(engine, { status: "progress", preview: "抖音登录已由后端核验，等待返回访问范围…" });
    }).catch((error) => emit(engine, {
      t: "task-error",
      text: `登录核验结果未送达：${error?.message || "连接异常"}`,
      errorCode: error?.code || "ACCESS_AUTHORIZATION_CONFIRM_FAILED",
      retryable: true
    }));
    return;
  }
  engine.accessStage = "scope";
  emit(engine, {
    t: "auth-granted",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    browserSessionId: engine.browserSessionId || null,
    text: `已完成${engine.accessSetup.provider}登录，尚未开始读取数据。`
  });
  emit(engine, {
    t: "scope-required",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    browserSessionId: engine.browserSessionId || null,
    scopes: engine.accessSetup.scopes,
    text: "请选择本次任务允许读取和执行的范围。"
  });
}

function cancelAccessAuthorization(engine, reason = "cancelled") {
  if (engine.accessStage !== "authorizing") return;
  const apply = () => {
    const sessionId = engine.browserSessionId;
    if (sessionId && engine.gateway?.browserSessionClose) {
      engine.gateway.browserSessionClose(sessionId).catch(() => {});
      engine.browserSessionId = null;
    }
    engine.accessStage = "required";
    syncTask(engine, { status: "progress", preview: `等待${engine.accessSetup.provider}授权…` });
    emit(engine, {
      t: "auth-cancelled",
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      reason,
      text: `云电脑授权未完成（${reason === "denied" ? "用户拒绝授权" : "窗口已关闭"}），任务保持暂停。`
    });
  };
  if (engine.online && engine.commandClient) {
    remoteCommand(engine, COMMAND_TYPES.ACCESS_CANCEL, { reason }).then(() => {
      engine.accessStage = "awaiting-server-cancel";
    }).catch((error) => emit(engine, {
      t: "task-error",
      text: `取消授权未送达：${error?.message || "连接异常"}`,
      errorCode: "ACCESS_CANCEL_FAILED",
      retryable: true
    }));
    return;
  }
  apply();
}

function applyAuthoritativeAccessSetup(engine, event = {}) {
  if (!engine.online || !event || typeof event !== "object") return;
  const scopes = Array.isArray(event.scopes) ? event.scopes.filter(Boolean) : null;
  engine.accessSetup = {
    ...engine.accessSetup,
    ...(event.provider ? { provider: event.provider } : {}),
    ...(event.account ? { account: event.account } : {}),
    ...(scopes ? { scopes } : {})
  };
}

/** Confirm the least-privilege scope, then release the precomputed execution timeline. */
function confirmAccessScope(engine) {
  if (engine.accessStage !== "scope") return;
  const apply = () => {
    engine.accessStage = "ready";
    emit(engine, {
      t: "scope-confirmed",
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      scopes: engine.accessSetup.scopes,
      text: "授权范围已确认，任务可以按已确认的需求和分工开始。"
    });
    syncTask(engine, { status: "progress", preview: "访问范围已确认，我正在建立任务会话…" });
    const id = setTimeout(() => engine.scheduleTimeline?.(), Math.round(420 * DEMO_PACING));
    engine.timers.push(id);
  };
  if (engine.online && engine.commandClient) {
    remoteCommand(engine, COMMAND_TYPES.ACCESS_GRANT, {
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      browserSessionId: engine.browserSessionId || null,
      scopes: engine.accessSetup.scopes
    }).then(() => {
      engine.accessStage = "awaiting-server-run";
      syncTask(engine, { status: "progress", preview: "访问范围确认已送达，等待服务端释放执行…" });
    }).catch((error) => emit(engine, {
      t: "task-error",
      text: `授权范围确认未送达：${error?.message || "连接异常"}`,
      errorCode: "ACCESS_SCOPE_CONFIRM_FAILED",
      retryable: true
    }));
    return;
  }
  apply();
}

/** Only a deliberate user action may release the requirement gate. */
export function isExplicitUserRequirementConfirmation(confirmation = {}) {
  return confirmation.actor === "user" && confirmation.action === "confirm";
}

/** Confirm the business requirement, then reveal the assignment plan before requesting access. */
function confirmRequirement(engine, confirmation = {}) {
  if (engine.accessStage !== "requirement") return;
  if (!isExplicitUserRequirementConfirmation(confirmation)) return;
  if (engine.online && !engine.requirementProposal) {
    emit(engine, {
      t: "task-error",
      text: "服务端需求理解尚未完成，不能使用本地模板确认。请重试需求理解。",
      errorCode: "REQUIREMENT_PROPOSAL_REQUIRED",
      retryable: true
    });
    return;
  }
  const confirmedBrief = engine.online
    ? requirementBriefFromProposal(engine.requirementProposal)
    : engine.script.brief;
  const apply = () => {
    engine.accessStage = "required";
    emit(engine, {
      t: "requirement-confirmed",
      taskText: engine.taskText,
      brief: confirmedBrief,
      proposal: engine.requirementProposal || null,
      proposalVersion: confirmedBrief.proposalVersion || null,
      confirmation: {
        actor: "user",
        action: "confirm",
        channel: confirmation.channel || "requirement-card",
        confirmedAt: new Date().toISOString()
      },
      text: "需求已确认。我先按目标拆解技能和责任 Agent，再申请本次任务所需账号授权。"
    });
    emit(engine, {
      t: "assignment-plan",
      protocolType: "ASSIGNMENT_PROPOSED",
      assignments: buildAssignmentPlan({ script: engine.script, runtimeDefinition: engine.runtimeDefinition, projectMembers: engine.projectMembers }),
      text: "任务已拆解，以下责任 Agent 将按顺序执行；确认账号后才会读取业务数据。"
    });
    syncTask(engine, { status: "progress", preview: `需求已确认，等待${engine.accessSetup.provider}授权…` });
    const id = setTimeout(() => {
      if (engine.accessStage !== "required") return;
      if (engine.runtime.events.some((event) => event.t === "auth-required")) return;
      emit(engine, {
        t: "auth-required",
        provider: engine.accessSetup.provider,
        account: engine.accessSetup.account,
        scopes: engine.accessSetup.scopes,
        text: `责任 Agent 已安排完成。现在需要连接${engine.accessSetup.provider}，任务仍未读取或发送任何数据。`
      });
    }, Math.round(520 * DEMO_PACING));
    engine.timers.push(id);
  };
  if (engine.online && engine.commandClient) {
    remoteCommand(engine, COMMAND_TYPES.REQUIREMENT_CONFIRM, {
      requiresAccess: requirementNeedsAccountAccess(engine.requirementProposal, engine.taskText),
      taskText: engine.taskText,
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      scopes: engine.accessSetup.scopes,
      proposalVersion: engine.requirementProposal?.proposalVersion || engine.requirementProposal?.version || engine.requirementProposal?.schemaVersion || 1,
      proposal: engine.requirementProposal || null,
      confirmation: { actor: "user", action: "confirm", channel: confirmation.channel || "requirement-card" }
    }).then((ack) => {
      const currentVersion = ack?.data?.currentVersion ?? ack?.currentVersion;
      if (Number.isInteger(currentVersion)) engine.remoteTaskVersion = currentVersion;
      engine.accessStage = "awaiting-server-gates";
      syncTask(engine, { status: "progress", preview: "需求确认已送达，等待服务端生成分工与授权申请…" });
    }).catch((error) => emit(engine, {
      t: "task-error",
      text: `需求确认未送达：${error?.message || "连接异常"}`,
      errorCode: "REQUIREMENT_CONFIRM_FAILED",
      retryable: true
    }));
    return;
  }
  apply();
}

function startEngine(engine) {
  if (engine.engineInitialized) return;
  // Keep the conversation visibly alive while task.create and the requirement
  // model are in flight. The authoritative proposal still replaces this
  // transport status; it must not be synthesized from the local script.
  if (engine.online) {
    if (!engine.runtime.events.some((event) => event.t === "user")) {
      emit(engine, { t: "user", text: engine.taskText, online: true });
    }
    if (!engine.runtime.events.some((event) => event.t === "chief" && event.source === "transport")) {
      emit(engine, {
        t: "chief",
        source: "transport",
        text: "我已收到任务，正在理解你的需求…"
      });
    }
    syncTask(engine, { status: "progress", preview: "我正在理解你的需求…" });
  }
  // Provision the authoritative server task before opening the AG-UI stream.
  // The local task id remains the task-store key; it must never become a remote
  // conversation id or task identity.
  if (engine.online && engine.commandClient && !engine.remoteTaskCreated) {
    if (engine.remoteTaskProvisioning) return;
    engine.remoteTaskProvisioning = true;
    engine.remoteTaskPromise = createRemoteTask({
      commandClient: engine.commandClient,
      taskText: engine.taskText,
      projectId: engine.projectId,
      projectName: engine.projectName,
      localTaskId: engine.taskId,
      scenario: engine.scriptKey
    }).then((identity) => {
      engine.remoteTaskId = identity.taskId;
      engine.remoteRunId = identity.taskRunId;
      engine.remoteConversationId = identity.conversationId;
      engine.remoteTaskVersion = identity.currentVersion ?? 0;
      engine.requirementProposal = identity.requirement || null;
      engine.remoteTaskCreated = true;
      engine.remoteTaskProvisioning = false;
      syncTask(engine, { status: "progress", preview: "已建立服务端任务，等待需求确认…" });
      // Move CREATED into WAITING_REQUIREMENT before showing the card. The
      // actual execution command is intentionally blocked until the user
      // confirms the structured requirement.
      return startRemoteTask({
        commandClient: engine.commandClient,
        identity,
        taskText: engine.taskText,
        projectId: engine.projectId,
        projectName: engine.projectName,
        localTaskId: engine.taskId,
        requirementsConfirmed: false,
        requiresAccess: false
      }).then((started) => {
        engine.remoteTaskVersion = started.currentVersion ?? (engine.remoteTaskVersion + 1);
        engine.remoteTaskPrimed = true;
        startEngine(engine);
        return identity;
      });
    }).catch((error) => {
      engine.remoteTaskProvisioning = false;
      engine.engineInitialized = true;
      syncTask(engine, { status: "failed", preview: "服务端任务创建失败，等待处理" });
      emit(engine, { t: "task-error", text: error?.message || "服务端任务创建失败", errorCode: error?.code || "REMOTE_TASK_CREATE_FAILED", retryable: true });
      return null;
    });
    return;
  }
  engine.engineInitialized = true;
  const { script } = engine;

  // Online runs are event-driven. A production task must never fall through
  // to the local demo timeline when its real execution transport is missing.
  if (engine.online && !hasOnlineExecutionTransport(engine)) {
    syncTask(engine, { status: "failed", preview: "真实 Agent Gateway 未连接，任务未执行" });
    emit(engine, {
      t: "task-error",
      text: "真实 Agent Gateway 未连接，任务未执行。请连接后重试；系统不会用本地模拟替代真实业务动作。",
      errorCode: "AGENT_GATEWAY_UNAVAILABLE",
      retryable: true
    });
    return;
  }
  if (engine.online && !remoteTaskIdFor(engine)) {
    syncTask(engine, { status: "failed", preview: "服务端任务身份不可用，任务未执行" });
    emit(engine, {
      t: "task-error",
      text: "服务端任务身份不可用，任务未执行。请重新建立任务；系统不会把本地任务编号当成服务端任务。",
      errorCode: "REMOTE_TASK_ID_MISSING",
      retryable: true
    });
    return;
  }
  if (engine.online) {
    const adapter = createGatewayEventAdapter({
      taskId: remoteTaskIdFor(engine),
      onEvent: (event) => {
        if (event.t === "approval-show") {
          engine.approvalShown = true;
          engine.approvalPending = false;
          engine.decision = null;
        }
        if (event.t === "approval-resolved") {
          engine.approvalPending = false;
          engine.decision = Boolean(event.ok);
        }
        if (event.t === "task-paused") engine.paused = true;
        if (event.t === "task-resumed" || event.t === "task-retry-requested") engine.paused = false;
        if (event.t === "sub-start") {
          beginWork(event.agentType || event.agentName, { task: engine.taskText, phase: event.skill, projectId: engine.projectId });
        }
        if (event.t === "sub-done" || event.t === "sub-error") {
          finishWork(event.agentType || event.agentName, null);
          if (event.t === "sub-error") endAllWork();
        }
        if (event.t === "sub-log") {
          pushActivity(event.agentType || event.agentName, event.text);
        }
        if (event.t === "sub-log" && event.pct != null) emit(engine, { t: "progress", pct: event.pct, stage: "execution" });
        if (event.t === "task-error") {
          endAllWork();
          syncTask(engine, { status: "failed", preview: event.text });
        }
        if (event.t === "summary") {
          const suppliedResult = event.resultSnapshot
            || event.result
            || event.data?.resultSnapshot
            || event.data?.result
            // A connector may publish the final result in one or more
            // RESULT_UPDATED events before task.completed. The runtime has
            // already reduced those events, so use that authoritative
            // projection instead of rejecting an otherwise valid run.
            || engine.runtime?.snapshot?.resultSnapshot;
          if (engine.online && (!suppliedResult || typeof suppliedResult !== "object" || Array.isArray(suppliedResult))) {
            endAllWork();
            syncTask(engine, { status: "failed", preview: "服务端未返回结构化结果，任务不能标记为完成" });
            emit(engine, {
              t: "task-error",
              text: "服务端已结束运行，但没有返回可核验的线索、触达或回复结果。系统不会用本地统计补齐结果，请重试或检查 Agent Gateway。",
              errorCode: "RESULT_SNAPSHOT_MISSING",
              retryable: true
            });
            return;
          }
          syncTask(engine, { status: "done", preview: event.text || "任务已完成", resultSnapshot: resultSnapshotFor(engine, event) });
          const resultCounts = resultCountsFor(suppliedResult);
          rollupTask(engine.taskId, {
            title: engine.taskText,
            projectName: engine.projectName,
            status: "done",
            files: engine.runtime.snapshot.evidence.filter((item) => item.type === "artifact").length,
            ...(resultCounts.leads != null ? { leads: resultCounts.leads } : {}),
            ...(resultCounts.outreach != null ? { outreach: resultCounts.outreach } : {}),
            ...(resultCounts.replies != null ? { replies: resultCounts.replies } : {}),
            durationSec: Math.max(1, Math.round((Date.now() - engine.startedAt) / 1000)),
            done_at: new Date().toISOString()
          });
          endAllWork();
        }
        emit(engine, event);
        if (event.t === "summary") {
          engine.remoteUnsubscribe?.();
          engine.remoteUnsubscribe = null;
          if (typeof engine.remoteTaskSubscription === "function") engine.remoteTaskSubscription();
          engine.remoteTaskSubscription = null;
        }
      }
    });
    engine.remoteAdapter = adapter;
    const handleRemoteEvent = (event) => {
      const conversationId = event?.conversation_id || event?.conversationId || null;
      const eventTaskId = event?.task_id || event?.taskId || null;
      if (eventTaskId && remoteTaskIdFor(engine) && eventTaskId !== remoteTaskIdFor(engine)) return;
      if (engine.remoteRunId && event?.run_id && event.run_id !== engine.remoteRunId) return;
      if (conversationId && engine.remoteConversationId && conversationId !== engine.remoteConversationId) return;
      if (conversationId && !engine.remoteConversationId) engine.remoteConversationId = conversationId;
      if (event?.run_id && !engine.remoteRunId) engine.remoteRunId = event.run_id;
      adapter.accept(event);
    };
    engine.subscribeRemote = () => {
      if (!engine.remoteUnsubscribe) engine.remoteUnsubscribe = engine.gateway.on("ag_ui_event", handleRemoteEvent);
      return engine.remoteUnsubscribe;
    };
    engine.subscribeRemote();
    // Command calls (create/start/confirm) do not automatically open the
    // durable event stream. Start it before replaying the gate events so the
    // UI receives assignment/access transitions after requirement confirm.
    if (!engine.remoteTaskSubscription && typeof engine.gateway.subscribeTask === "function") {
      engine.remoteTaskSubscription = engine.gateway.subscribeTask(remoteTaskIdFor(engine));
    } else if (!engine.remoteTaskSubscription && typeof engine.gateway.action === "function") {
      engine.remoteTaskSubscription = Promise.resolve(
        engine.gateway.action(SB_ACTIONS.taskRunSubscribe, {
          taskId: remoteTaskIdFor(engine),
          taskRunId: engine.remoteRunId,
          conversationId: engine.remoteConversationId
        })
      ).catch((error) => {
        emit(engine, {
          t: "task-error",
          text: `任务事件订阅未建立：${error?.message || "连接异常"}`,
          errorCode: "TASK_EVENT_SUBSCRIBE_FAILED",
          retryable: true
        });
        return null;
      });
    }
    engine.scheduleTimeline = () => {
      if (engine.timelineStarted || engine.remoteRunStarted) return;
      engine.timelineStarted = true;
      engine.remoteRunStarted = true;
      const runPayload = {
        conversation_id: engine.remoteConversationId,
        client_task_id: engine.taskId,
        taskId: remoteTaskIdFor(engine),
        task_run_id: engine.remoteRunId,
        taskRunId: engine.remoteRunId,
        title: engine.taskText,
        input: engine.taskText,
        project_id: engine.projectId,
        project_name: engine.projectName,
        browser_session_id: engine.browserSessionId || null,
        browserSessionId: engine.browserSessionId || null,
        scenario: engine.scriptKey,
        approval_required: engine.script.approvalRequired !== false
      };
      const runRequest = engine.gateway.run(runPayload);
      runRequest.then((ack) => {
        engine.remoteRunId = ack?.run_id || ack?.runId || ack?.data?.run_id || engine.remoteRunId;
        engine.remoteConversationId = ack?.conversation_id || ack?.conversationId || ack?.data?.conversation_id || engine.remoteConversationId;
        syncTask(engine, { status: "progress", preview: "后端已接收任务，正在等待实时进度…" });
      }).catch((error) => {
        engine.remoteRunStarted = false;
        const needsReauthorization = ["AUTHORIZATION_PENDING", "SESSION_NOT_FOUND", "BROWSER_SESSION_TASK_MISMATCH", "REAUTH_REQUIRED"].includes(error?.code);
        if (needsReauthorization) {
          engine.accessStage = "required";
          syncTask(engine, { status: "progress", preview: "抖音登录已失效，等待重新授权…" });
          emit(engine, {
            t: "auth-required",
            provider: engine.accessSetup.provider,
            account: engine.accessSetup.account,
            scopes: engine.accessSetup.scopes,
            text: "抖音浏览器会话已失效。任务已暂停，不会继续读取或发送；请重新打开云电脑完成登录。"
          });
        } else {
          syncTask(engine, { status: "failed", preview: "后端任务启动失败，等待处理" });
          emit(engine, { t: "task-error", text: `后端任务启动失败：${error?.message || "连接异常"}`, errorCode: "GATEWAY_RUN_START_FAILED" });
        }
      });
    };
    if (engine.accessStage === "ready") engine.scheduleTimeline();
    else if (engine.accessStage === "requirement") requestRemoteRequirement(engine);
    else {
      // Server events (REQUIREMENT_CONFIRMED -> ASSIGNMENT_PROPOSED ->
      // ACCESS_REQUIRED) advance the online gates. Do not synthesize any of
      // those facts from the local dialogue script.
      syncTask(engine, { status: "progress", preview: "等待服务端返回当前任务门禁状态…" });
    }
    return;
  }

  if (!engine.demoMode) {
    syncTask(engine, { status: "failed", preview: "非演示任务未连接服务端，未执行本地模拟" });
    emit(engine, {
      t: "task-error",
      text: "服务端执行链未连接，任务未执行。系统不会播放本地模拟结果；请连接控制面后重新建立任务。",
      errorCode: "REAL_EXECUTION_REQUIRED",
      retryable: true
    });
    return;
  }
  const timeline = buildDemoTimeline({
    taskText: engine.taskText,
    online: engine.online,
    script,
    runtimeDefinition: engine.runtimeDefinition,
    projectMembers: engine.projectMembers
  });
  engine.demoTimeline = timeline;
  engine.timelineCursor = engine.timelineCursor || 0;
  engine.timelineTimers = engine.timelineTimers || [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); engine.timers.push(id); };

  // Delays only pace a precomputed event source; they never decide a state transition.
  // The cursor makes pause/resume/retry deterministic instead of restarting a run.
  engine.scheduleTimeline = () => {
    if (engine.timelineStarted || engine.paused || engine.cancelled) return;
    engine.timelineStarted = true;
    const startIndex = engine.timelineCursor || 0;
    let previousDelay = startIndex > 0 ? Number(timeline[startIndex - 1]?.delayMs || 0) : 0;
    timeline.forEach((event, index) => {
      if (index < startIndex) return;
      // Requirement understanding and the brief are completed before authorization.
      // Do not repeat them when the authorized run timeline is released.
      const isPreparationHeader = event.t === "user"
        || event.t === "brief"
        || (event.t === "chief" && event.delayMs <= 1500);
      if (isPreparationHeader) {
        engine.timelineCursor = index + 1;
        previousDelay = Number(event.delayMs || previousDelay);
        return;
      }
      const delay = Math.max(0, Number(event.delayMs || previousDelay) - previousDelay);
      previousDelay = Number(event.delayMs || previousDelay);
      const id = setTimeout(() => {
        engine.timelineTimers = engine.timelineTimers.filter((timerId) => timerId !== id);
        engine.timelineCursor = index + 1;
        if (engine.paused || engine.cancelled) return;
        deliverDemoEvent(event);
      }, Math.round(delay * DEMO_PACING));
      engine.timelineTimers.push(id);
      engine.timers.push(id);
    });
  };

  if (engine.accessStage === "ready") {
    engine.scheduleTimeline();
  } else {
    const hasEvent = (type) => engine.runtime.events.some((event) => event.t === type);
    if (!hasEvent("user")) emit(engine, { t: "user", text: engine.taskText, online: engine.online });

    if (engine.accessStage === "requirement") {
      syncTask(engine, { status: "progress", preview: "我正在理解你的需求…" });
      if (!hasEvent("chief")) later(() => {
        if (hasEvent("chief")) return;
        emit(engine, {
          t: "chief",
          protocolType: "TEXT_MESSAGE_CONTENT",
          text: `我先理解你的需求：${script.decompose} 我会先和你确认目标、数据范围、交付结果与停止边界；确认后再安排责任 Agent，最后才申请执行所需的账号权限。`
        });
      }, Math.round(520 * DEMO_PACING));
      if (!hasEvent("brief")) later(() => {
        if (!hasEvent("brief")) emit(engine, { t: "brief", brief: script.brief, protocolType: "TEXT_MESSAGE_END" });
      }, Math.round(1450 * DEMO_PACING));
      if (!hasEvent("requirement-required")) later(() => {
        if (hasEvent("requirement-required") || engine.accessStage !== "requirement") return;
        syncTask(engine, { status: "progress", preview: "我已经理解了你的需求，等你确认…" });
        emit(engine, {
          t: "requirement-required",
          taskText: engine.taskText,
          brief: script.brief,
          text: "请确认我对任务目标、数据范围、交付结果和停止边界的理解。"
        });
      }, Math.round(2200 * DEMO_PACING));
      return;
    }

    if (engine.accessStage === "required" && !hasEvent("auth-required")) {
      if (!hasEvent("assignment-plan")) {
        emit(engine, {
          t: "assignment-plan",
          protocolType: "ASSIGNMENT_PROPOSED",
          assignments: buildAssignmentPlan({ script: engine.script, runtimeDefinition: engine.runtimeDefinition, projectMembers: engine.projectMembers }),
          text: "任务已拆解，以下责任 Agent 将按顺序执行；确认账号后才会读取业务数据。"
        });
      }
      emit(engine, {
        t: "auth-required",
        provider: engine.accessSetup.provider,
        account: engine.accessSetup.account,
        scopes: engine.accessSetup.scopes,
        text: `责任 Agent 已安排完成。现在需要连接${engine.accessSetup.provider}，任务仍未读取或发送任何数据。`
      });
    }
  }

  function deliverDemoEvent(event) {
    if (event.t === "artifact-sub") {
      const produced = produceArtifacts(engine, event.i);
      const slot = MEMBER_SLOTS[event.i] || { type: event.agentType };
      finishWork(slot.type, produced[0] || null);
      recordSubCost(engine, event.i);
      return;
    }
    if (event.t === "approval-show") {
      engine.approvalShown = true;
      syncTask(engine, { status: "approval", preview: `审批卡点：${script.approval.title}` });
    }
    if (event.t === "sub-start") {
      beginWork(event.agentType, { task: engine.taskText, phase: event.skill, projectId: engine.projectId });
    }
    if (event.t === "sub-log") {
      pushActivity(event.agentType, event.text);
      const stepCount = Math.max(1, script.subs.length);
      const lineCount = Math.max(1, script.subs[event.i]?.lines?.length || 1);
      emit(engine, { t: "progress", pct: Math.min(88, 10 + Math.round(((event.i + ((event.lineIndex || 0) + 1) / lineCount) / stepCount) * 78)) });
    }
    if (event.t === "sub-done") {
      const slot = MEMBER_SLOTS[event.i] || { type: event.agentType };
      pushActivity(slot.type, event.text || "已提交验收结果");
    }
    if (event.t === "sub-error" || event.t === "task-error") {
      if (event.t === "sub-error" && event.i != null) engine.lastFailedIndex = event.i;
      endAllWork();
      syncTask(engine, { status: "failed", preview: event.text });
    }
    if (event.t === "task-blocked") {
      endAllWork();
      syncTask(engine, { status: "blocked", preview: event.text });
    }
    if (event.t === "task-error" || event.t === "task-blocked") {
      engine.paused = true;
      clearTimelineTimers(engine);
    }
    if (event.t === "summary") {
      produceArtifacts(engine, null);
      syncTask(engine, { status: "done", preview: script.summary, resultSnapshot: resultSnapshotFor(engine, event) });
      rollupTask(engine.taskId, {
        title: engine.taskText,
        projectName: engine.projectName,
        status: "done",
        files: engine.fileCount || 0,
        leads: LEADS_BY_SCRIPT[engine.scriptKey] || 0,
        durationSec: Math.max(1, Math.round((Date.now() - engine.startedAt) / 1000)),
        done_at: new Date().toISOString()
      });
      endAllWork();
    }
    emit(engine, event);
  }
}

/** Render the same requirement/access gates for both local and remote runs. */
function prepareEngineGates(engine) {
  const { script } = engine;
  const later = (fn, ms) => { const id = setTimeout(fn, ms); engine.timers.push(id); };
  const hasEvent = (type) => engine.runtime.events.some((event) => event.t === type);

  if (!hasEvent("user")) emit(engine, { t: "user", text: engine.taskText, online: engine.online });
  if (engine.accessStage === "requirement") {
    syncTask(engine, { status: "progress", preview: "我正在理解你的需求…" });
    if (!hasEvent("chief")) later(() => {
      if (hasEvent("chief")) return;
      emit(engine, {
        t: "chief",
        protocolType: "TEXT_MESSAGE_CONTENT",
        text: `我先理解你的需求：${script.decompose} 我会先和你确认目标、数据范围、交付结果与停止边界；确认后再安排责任 Agent，最后才申请执行所需的账号权限。`
      });
    }, Math.round(520 * DEMO_PACING));
    if (!hasEvent("brief")) later(() => {
      if (!hasEvent("brief")) emit(engine, { t: "brief", brief: script.brief, protocolType: "TEXT_MESSAGE_END" });
    }, Math.round(1450 * DEMO_PACING));
    if (!hasEvent("requirement-required")) later(() => {
      if (hasEvent("requirement-required") || engine.accessStage !== "requirement") return;
      syncTask(engine, { status: "progress", preview: "我已经理解了你的需求，等你确认…" });
      emit(engine, { t: "requirement-required", taskText: engine.taskText, brief: script.brief, text: "请确认我对任务目标、数据范围、交付结果和停止边界的理解。" });
    }, Math.round(2200 * DEMO_PACING));
    return;
  }
  if (engine.accessStage === "required" && !hasEvent("auth-required")) {
    if (!hasEvent("assignment-plan")) {
      emit(engine, {
        t: "assignment-plan",
        protocolType: "ASSIGNMENT_PROPOSED",
        assignments: buildAssignmentPlan({ script: engine.script, runtimeDefinition: engine.runtimeDefinition, projectMembers: engine.projectMembers }),
        text: "任务已拆解，以下责任 Agent 将按顺序执行；确认账号后才会读取业务数据。"
      });
    }
    emit(engine, {
      t: "auth-required",
      provider: engine.accessSetup.provider,
      account: engine.accessSetup.account,
      scopes: engine.accessSetup.scopes,
      text: `责任 Agent 已安排完成。现在需要连接${engine.accessSetup.provider}，任务仍未读取或发送任何数据。`
    });
  }
}

const REMOTE_INTERACTION_ACTIONS = Object.freeze({
  [INTERACTION_COMMANDS.PAUSE]: SB_ACTIONS.taskPause,
  [INTERACTION_COMMANDS.RESUME]: SB_ACTIONS.taskResume,
  [INTERACTION_COMMANDS.RETRY]: SB_ACTIONS.taskRetry,
  [INTERACTION_COMMANDS.HANDOFF]: SB_ACTIONS.taskHandoff,
  [INTERACTION_COMMANDS.CANCEL]: SB_ACTIONS.taskCancel
});

const REMOTE_INTERACTION_COMMAND_TYPES = Object.freeze({
  [INTERACTION_COMMANDS.PAUSE]: COMMAND_TYPES.PAUSE,
  [INTERACTION_COMMANDS.RESUME]: COMMAND_TYPES.RESUME,
  [INTERACTION_COMMANDS.RETRY]: COMMAND_TYPES.RETRY,
  [INTERACTION_COMMANDS.HANDOFF]: COMMAND_TYPES.HANDOFF,
  [INTERACTION_COMMANDS.CANCEL]: COMMAND_TYPES.CANCEL
});

function interactionStateFor(engine) {
  return engine?.runtime?.snapshot?.interaction || engine?.runtime?.snapshot || {};
}

function clearTimelineTimers(engine) {
  for (const id of engine.timelineTimers?.splice(0) || []) clearTimeout(id);
  engine.timelineStarted = false;
}

function clearTaskTimers(engine) {
  clearTimelineTimers(engine);
  for (const id of engine.timers?.splice(0) || []) {
    clearTimeout(id);
    clearInterval(id);
  }
}

function applyLocalInteractionCommand(engine, action, payload = {}) {
  if (action === INTERACTION_COMMANDS.PAUSE) {
    engine.paused = true;
    clearTimelineTimers(engine);
  }
  if (action === INTERACTION_COMMANDS.RESUME || action === INTERACTION_COMMANDS.RETRY) {
    engine.paused = false;
    engine.cancelled = false;
  }
  if (action === INTERACTION_COMMANDS.CANCEL) {
    engine.cancelled = true;
    engine.paused = true;
    clearTaskTimers(engine);
  }
  const event = localEventForInteractionCommand(action, payload);
  if (event) emit(engine, event);
  if (action === INTERACTION_COMMANDS.RESUME || action === INTERACTION_COMMANDS.RETRY) {
    const id = setTimeout(() => engine.scheduleTimeline?.(), Math.round(320 * DEMO_PACING));
    engine.timers.push(id);
  }
  if (action === INTERACTION_COMMANDS.RETRY && engine.lastFailedIndex != null && engine.timelineCursor >= (engine.demoTimeline?.length || 0)) {
    const retryIndex = engine.lastFailedIndex;
    const id = setTimeout(() => {
      const skill = engine.runtimeDefinition?.skills?.[retryIndex] || {};
      emit(engine, {
        t: "sub-log",
        i: retryIndex,
        skillId: skill.id,
        skill: skill.name,
        agentName: engine.runtimeDefinition?.agent?.name || "项目执行 Agent",
        agentType: engine.runtimeDefinition?.agent?.id || "professional_agent",
        text: "重试已完成，结果依据已重新整理。",
        lineIndex: 0,
        pct: 92,
        evidence: [{ type: "retry", label: "重试结果", ref: `${engine.taskId || "task"}-retry-${engine.runtime.snapshot.interaction.retryCount}` }]
      });
      emit(engine, {
        t: "sub-done",
        i: retryIndex,
        skillId: skill.id,
        skill: skill.name,
        agentName: engine.runtimeDefinition?.agent?.name || "项目执行 Agent",
        agentType: engine.runtimeDefinition?.agent?.id || "professional_agent",
        text: "我已完成重试，结果和工作依据已经整理好。"
      });
      emit(engine, { t: "run-finished", text: "重试完成，任务结果已整理。" });
      emit(engine, { t: "summary", text: "重试完成，任务结果已整理。" });
    }, Math.round(920 * DEMO_PACING));
    engine.timers.push(id);
  }
  return event;
}

function gatewayAckError(ack) {
  if (!ack || typeof ack !== "object") return null;
  if (ack.ok === false || ack.accepted === false || ack.success === false) {
    return new Error(ack.message || ack.error || "服务端拒绝了这次操作");
  }
  if (typeof ack.code === "string" && /^(ERROR|FAILED|REJECTED|DENIED|INVALID)/i.test(ack.code)) {
    return new Error(ack.message || ack.error || ack.code);
  }
  return null;
}

/** Issue a recoverable task command and keep the card actionable on failure. */
function issueInteractionCommand(engine, action, payload = {}) {
  const state = interactionStateFor(engine);
  if (!canIssueInteractionCommand(state, action)) return false;
  const command = createInteractionCommand(action, {
    taskId: commandTaskIdFor(engine),
    runId: engine.remoteRunId,
    stepId: payload.stepId || state.activeSkill?.skillId || null,
    payload
  });
  engine.pendingCommands ||= new Map();
  engine.pendingCommands.set(command.commandId, command);
  const remoteAction = REMOTE_INTERACTION_ACTIONS[action];
  const complete = (ack = {}) => {
    const ackError = gatewayAckError(ack);
    if (ackError) return fail(ackError);
    engine.pendingCommands.delete(command.commandId);
    const event = ack?.event || ack?.data?.event;
    if (engine.online) {
      // An accepted command is not a state transition. The control plane
      // publishes the authoritative event through the task subscription;
      // never synthesize pause/resume/retry/handoff state from the ACK.
      if (event && typeof event === "object") emit(engine, event);
      else syncTask(engine, { status: "progress", preview: "操作已送达，等待服务端确认…" });
    } else if (event && typeof event === "object") {
      emit(engine, event);
    } else {
      applyLocalInteractionCommand(engine, action, payload);
    }
    return ack;
  };
  const fail = (error) => {
    engine.pendingCommands.delete(command.commandId);
    const taskNotFound = isRemoteTaskNotFound(error);
    if (taskNotFound) {
      resetRemoteTaskIdentity(engine);
      engine.remoteTaskStale = true;
    }
    emit(engine, {
      t: "task-error",
      text: taskNotFound
        ? "服务端任务已失效（通常是控制面重启后旧任务未持久化），请重新建立任务。"
        : `${action === INTERACTION_COMMANDS.RETRY ? "重试" : "任务操作"}未完成：${error?.message || "连接异常"}`,
      errorCode: taskNotFound ? "REMOTE_TASK_NOT_FOUND" : "INTERACTION_COMMAND_FAILED",
      retryable: true
    });
  };
  if (engine.online && !remoteTaskIdFor(engine)) {
    fail(Object.assign(new Error("服务端任务身份已失效，请重新建立任务"), { code: "REMOTE_TASK_ID_MISSING" }));
    return true;
  }
  if (engine.online && remoteAction && typeof engine.gateway?.action === "function") {
    const commandType = REMOTE_INTERACTION_COMMAND_TYPES[action];
    if (engine.commandClient && commandType) {
      engine.commandClient.send(commandType, {
        taskId: remoteTaskIdFor(engine),
        taskRunId: engine.remoteRunId,
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        payload: { ...payload, stepId: command.stepId, action }
      }).then(complete).catch(fail);
    } else {
      engine.gateway.action(remoteAction, {
        ...command,
        taskId: remoteTaskIdFor(engine),
        taskRunId: engine.remoteRunId || null,
        conversationId: engine.remoteConversationId || null
      }).then(complete).catch(fail);
    }
  } else {
    complete({ source: "local" });
  }
  return true;
}

/** 审批决策（视图按钮调用）。 */
function decide(engine, ok, selectedIds = null) {
  if (!engine.approvalShown || engine.decision != null || engine.approvalPending) return;
  engine.touchSelection = Array.isArray(selectedIds) ? selectedIds : null;
  if (engine.online && typeof engine.gateway?.action === "function") {
    const remoteTaskId = remoteTaskIdFor(engine);
    if (!remoteTaskId) {
      emit(engine, {
        t: "task-error",
        text: "审批未送达：服务端任务身份已失效，请重新建立任务。",
        errorCode: "REMOTE_TASK_ID_MISSING",
        retryable: true
      });
      return;
    }
    engine.approvalPending = true;
    engine.approvalActionUi?.forEach((button) => { button.disabled = true; });
    engine.approvalActionUi?.[ok ? 1 : 0] && (engine.approvalActionUi[ok ? 1 : 0].textContent = "正在提交…");
    const approvalId = engine.runtime.snapshot.approvals.at(-1)?.id || null;
    const approval = engine.remoteApproval && typeof engine.remoteApproval === "object"
      ? engine.remoteApproval
      : {};
    const approvalExecution = approval.execution && typeof approval.execution === "object"
      ? approval.execution
      : approval.executionRequest && typeof approval.executionRequest === "object"
        ? approval.executionRequest
        : {};
    const executionSource = { ...approval, ...approvalExecution };
    const executionFields = {};
    [
      "actionType", "action", "channel", "leadId", "recipient", "message", "content",
      "videoId", "commentId", "shortVideoId", "queue", "scheduleAt"
    ].forEach((field) => {
      if (executionSource[field] !== undefined && executionSource[field] !== null && executionSource[field] !== "") {
        executionFields[field] = executionSource[field];
      }
    });
    const approvalRequestPayload = {
      taskId: remoteTaskIdFor(engine),
      taskRunId: engine.remoteRunId,
      commandId: engine.approvalCommandId || ["approval", engine.taskId, approvalId || "latest"].join("-"),
      idempotencyKey: engine.approvalIdempotencyKey || ["approval", engine.taskId, approvalId || "latest", ok ? "approved" : "rejected"].join("-"),
      payload: {
        approvalId,
        decision: ok ? "approved" : "rejected",
        selectedIds: engine.touchSelection,
        ...(engine.touchSelection ? { selectedLeadIds: engine.touchSelection } : {}),
        ...(ok ? executionFields : {})
      }
    };
    engine.approvalCommandId = approvalRequestPayload.commandId;
    engine.approvalIdempotencyKey = approvalRequestPayload.idempotencyKey;
    const approvalRequest = engine.commandClient
      ? engine.commandClient.send(COMMAND_TYPES.APPROVAL_DECISION, approvalRequestPayload)
      : engine.gateway.action(SB_ACTIONS.approvalRespond, {
        taskId: remoteTaskId,
        runId: engine.remoteRunId,
        taskRunId: engine.remoteRunId,
        conversationId: engine.remoteConversationId,
        approvalId,
        ok,
        selectedIds: engine.touchSelection
      });
    approvalRequest.then((ack) => {
      const ackError = gatewayAckError(ack);
      if (ackError) throw ackError;
      const event = ack?.event || ack?.data?.event;
      if (event && typeof event === "object") {
        emit(engine, event);
      } else {
        // The ACK only confirms that the command was accepted. Keep the
        // approval pending until approval.resolved arrives from the server;
        // otherwise a lost event could make the UI claim an external action
        // was approved when no authoritative decision exists.
        syncTask(engine, { status: "progress", preview: "审批已送达，等待服务端确认…" });
      }
    }).catch((error) => {
      engine.approvalPending = false;
      engine.approvalActionUi?.forEach((button) => { button.disabled = false; });
      emit(engine, { t: "task-error", text: `审批请求未送达：${error?.message || "连接异常"}`, errorCode: "APPROVAL_COMMAND_FAILED", retryable: true });
    });
    return;
  }
  engine.decision = ok;
  const { script } = engine;
  const timeline = buildApprovalTimeline({ approved: ok, script, taskText: engine.taskText, selectedIds: engine.touchSelection });
  timeline.forEach((event) => {
    const id = setTimeout(() => {
      if (event.t === "approval-resolved") {
        syncTask(engine, { status: ok ? "progress" : "blocked", preview: ok ? "审批已通过，执行收尾中" : "已驳回，修改后重新提交" });
      }
      emit(engine, event);
    }, Math.round(event.delayMs * DEMO_PACING));
    engine.timers.push(id);
  });
}

/** 追问（视图输入条调用）。 */
function followUp(engine, text) {
  const followupId = `followup-${engine.taskId || "task"}-${Date.now().toString(36)}`;
  const editingRequirement = engine.editingRequirement === true && engine.accessStage === "requirement";
  emit(engine, { t: "followup-user", text });
  if (editingRequirement) {
    const applyEdit = () => {
      engine.taskText = text;
      engine.editingRequirement = false;
      emit(engine, { t: "requirement-edited", taskText: text, text: "已收到修改后的需求，请再次确认任务目标和执行边界。" });
    };
    if (engine.online && engine.commandClient) {
      engine.commandClient.send(COMMAND_TYPES.REQUIREMENT_EDIT, {
        taskId: remoteTaskIdFor(engine),
        taskRunId: engine.remoteRunId,
        payload: { text }
      }).then((ack) => {
        const proposal = requirementProposalFromAck(ack);
        if (!proposal) throw new Error("服务端未返回修改后的需求提案");
        engine.requirementProposal = proposal;
        engine.requirementRequested = true;
        engine.taskText = text;
        engine.editingRequirement = false;
        emit(engine, { t: "requirement-proposed", proposal, brief: requirementBriefFromProposal(proposal), source: proposal.source || "model" });
        emit(engine, { t: "requirement-edited", taskText: text, proposal, text: "已收到修改后的需求，请再次确认任务目标和执行边界。" });
      }).catch((error) => {
        emit(engine, { t: "followup-failed", followupId, text: "需求修改未送达：" + (error?.message || "连接异常"), errorCode: "REQUIREMENT_EDIT_FAILED", retryable: true });
      });
    } else {
      applyEdit();
    }
    return;
  }
  emit(engine, { t: "followup-waiting", followupId });
  if (engine.online && typeof engine.gateway?.action === "function") {
    const remoteTaskId = remoteTaskIdFor(engine);
    if (!remoteTaskId) {
      emit(engine, { t: "followup-failed", followupId, text: "追问未送达：服务端任务身份已失效，请重新建立任务。", errorCode: "REMOTE_TASK_ID_MISSING", retryable: true });
      return;
    }
    const followupRequest = engine.commandClient
      ? engine.commandClient.send(COMMAND_TYPES.REPLY, {
        taskId: remoteTaskIdFor(engine),
        taskRunId: engine.remoteRunId,
        idempotencyKey: followupId,
        payload: { text, followupId }
      })
      : engine.gateway.action(SB_ACTIONS.taskFollowup, {
        taskId: remoteTaskId,
        runId: engine.remoteRunId,
        taskRunId: engine.remoteRunId,
        conversationId: engine.remoteConversationId,
        text,
        followupId
      });
    followupRequest.then((ack) => {
      const ackError = gatewayAckError(ack);
      if (ackError) throw ackError;
      const reply = ack?.data?.text || ack?.data?.message || ack?.text || ack?.message;
      if (reply) emit(engine, { t: "followup-chief", text: reply });
    }).catch((error) => {
      emit(engine, { t: "followup-failed", followupId, text: `追问未送达：${error?.message || "连接异常"}`, errorCode: "FOLLOWUP_COMMAND_FAILED", retryable: true });
    });
    return;
  }
  const id = setTimeout(() => {
    emit(engine, { t: "followup-chief", followupId, text: followUpReply(text, engine) });
  }, Math.round((900 + Math.random() * 600) * DEMO_PACING));
  engine.timers.push(id);
}

function accessStageFromEvents(events = []) {
  for (const event of [...events].reverse()) {
    // RUN_STARTED is emitted when the server parks a task behind a gate. It
    // is not proof that access scope was granted and must never release a
    // remote execution timeline.
    if (event.t === "scope-confirmed") return "ready";
    if (event.t === "scope-required" || event.t === "auth-granted") return "scope";
    if (event.t === "auth-started") return "authorizing";
    if (event.t === "auth-cancelled" || event.t === "auth-required" || event.t === "assignment-plan" || event.t === "requirement-confirmed") return "required";
    if (event.t === "requirement-required") return "requirement";
  }
  return "requirement";
}

function normalizePersistedRuntimeEvents(events = [], { online = false, demoMode = false, taskStatus = null, resultSnapshot = null } = {}) {
  const resultStatus = String(resultSnapshot?.status || "").trim().toLowerCase();
  const shouldDowngrade = online && !demoMode && taskStatus !== "done"
    && !["done", "completed", "complete", "success", "succeeded"].includes(resultStatus);
  if (!shouldDowngrade) return events;
  return events.map((event) => {
    if (event?.t !== "sub-done" || event.status) return event;
    return {
      ...event,
      t: "sub-log",
      status: "PENDING",
      text: event.text || "历史执行记录尚未被服务端确认完成，等待真实结果回传。",
      legacyCompletionDowngraded: true
    };
  });
}

/** 取任务引擎：不存在则创建并启动；已存在直接返回（重开对话不重跑）。 */
function ensureEngine({ taskId, taskText, projectId, projectName, projectMembers = [], teamLive, gateway = null, online = false, demoMode = false, runtimeEvents = [], taskStatus = null, taskResultSnapshot = null, taskPreview = "", remoteTaskId = null, remoteTaskRunId = null, remoteConversationId = null, remoteTaskVersion = null, remoteTaskSeq = null, browserSessionId = null }) {
  if (taskId && RUNS.has(taskId)) return RUNS.get(taskId);
  const scriptKey = pickDialogueScript(taskText);
  // Whether this is a touch request is a business scenario, not a transport
  // decision. Once the control plane is connected, every supported scenario
  // must use the same server-authoritative path.
  const runtimeOnline = Boolean(online);
  const runtimeDefinition = getDialogueRuntimeDefinition(scriptKey, taskText, { online: runtimeOnline });
  const runtime = createRuntimeTask({
    taskId,
    taskText,
    scriptKey,
    projectId,
    projectName,
    online: runtimeOnline,
    agent: runtimeDefinition.agent,
    planNodes: runtimeDefinition.skills.map((skill) => ({
      id: skill.id,
      kind: "work",
      agentId: runtimeDefinition.agent.id,
      skillId: skill.id,
      outputContract: "structured_result",
      acceptance: "verified"
    }))
  });
  const persistedEvents = normalizePersistedRuntimeEvents(runtimeEvents, {
    online: runtimeOnline,
    demoMode,
    taskStatus,
    resultSnapshot: taskResultSnapshot
  });
  const hasPersistedEvents = Array.isArray(persistedEvents) && persistedEvents.length > 0;
  const replayPersistedEvents = hasPersistedEvents && (runtimeOnline || demoMode);
  if (replayPersistedEvents) replayRuntimeEvents(runtime, persistedEvents);
  const persistedRequirementProposal = requirementProposalFromEvents(runtime.events);
  const engine = {
    taskId: taskId || null,
    taskText,
    projectId,
    projectName,
    projectMembers,
    teamLive,
    gateway,
    commandClient: runtimeOnline && typeof gateway?.action === "function"
      ? createTaskCommandClient({ gateway, actor: "user" })
      : null,
    online: runtimeOnline,
    demoMode: Boolean(demoMode),
    remoteTaskId: remoteTaskId || null,
    remoteConversationId: remoteConversationId || null,
    remoteRunId: remoteTaskRunId || null,
    remoteTaskVersion: Number.isInteger(remoteTaskVersion) ? remoteTaskVersion : null,
    remoteTaskSeq: Number.isInteger(remoteTaskSeq) ? remoteTaskSeq : null,
    browserSessionId: browserSessionId || null,
    requirementProposal: persistedRequirementProposal,
    requirementRequested: Boolean(persistedRequirementProposal),
    remoteTaskCreated: Boolean(remoteTaskId && remoteTaskRunId && remoteConversationId),
    remoteTaskProvisioning: false,
    remoteTaskPromise: null,
    remoteRunStarted: false,
    paused: false,
    cancelled: false,
    timelineCursor: 0,
    timelineTimers: [],
    lastFailedIndex: null,
    pendingCommands: new Map(),
    scriptKey,
    script: getDialogueScript(scriptKey, taskText, { online: runtimeOnline }),
    accessSetup: getDemoAccessSetup(scriptKey),
    accessStage: replayPersistedEvents ? accessStageFromEvents(runtime.events) : "requirement",
    runtimeDefinition,
    runtime,
    events: runtime.events,
    listeners: new Set(),
    timers: [],
    approvalShown: false,
    approvalPending: false,
    editingRequirement: false,
    pendingFollowupId: null,
    decision: null,
    fileCount: 0,
    startedAt: Date.now()
  };
  const resolvedApproval = [...runtime.events].reverse().find((event) => event.t === "approval-resolved");
  engine.approvalShown = runtime.events.some((event) => event.t === "approval-show");
  engine.decision = resolvedApproval ? Boolean(resolvedApproval.ok) : null;
  engine.touchSelection = Array.isArray(resolvedApproval?.selectedIds) ? resolvedApproval.selectedIds : null;
  if (taskId) RUNS.set(taskId, engine);
  if (hasPersistedEvents) {
    syncTask(engine, { status: taskStatus || "progress", preview: taskPreview || "任务已恢复，可继续查看运行轨迹" });
    if (engine.accessStage !== "ready" && !runtime.events.some((event) => event.t === "run-started")) startEngine(engine);
    return engine;
  }
  // 任务启动即在资源中心建档（运行中状态，成本随子任务推进实时累加）
  rollupTask(engine.taskId, { title: taskText, projectId, projectName, online: engine.online, status: "running", started_at: new Date().toISOString() });
  endAllWork(); // 清掉上一轮任务的在制状态
  clearAgentActivities(); // 清掉上一轮任务的头像旁工作状态
  return engine;
}

/* ═══════════ 视图：对话渲染器（重放 + 订阅） ═══════════ */

function openConversation(engine) {
  ensureStyle();
  const { script, teamLive } = engine;
  const chief = memberName(teamLive, "main", "幕僚长");
  const runtimeAgent = engine.runtimeDefinition?.agent || { name: "项目执行 Agent" };
  const memberOf = () => runtimeAgent.name;

  const viewTimers = [];
  const clearViewTimers = () => { for (const id of viewTimers.splice(0)) { clearTimeout(id); clearInterval(id); } };
  const page = openPage({
    title: engine.taskText.length > 24 ? `${engine.taskText.slice(0, 24)}…` : engine.taskText,
    onClose: () => {
      engine.listeners.delete(renderLive);
      clearViewTimers();
      av.authWindow?.close("replaced");
      engine.remoteUnsubscribe?.();
      engine.remoteUnsubscribe = null;
      if (typeof engine.remoteTaskSubscription === "function") engine.remoteTaskSubscription();
      engine.remoteTaskSubscription = null;
      scroll.removeEventListener("scroll", onScroll);
    }
  });

  const chat = el("div", "sb-chat notranslate");
  chat.setAttribute("translate", "no");
  const scroll = el("div", "sb-chat-scroll");
  const inner = el("div", "sb-chat-inner");
  inner.setAttribute("role", "log");
  inner.setAttribute("aria-live", "polite");
  inner.setAttribute("aria-relevant", "additions text");
  inner.setAttribute("aria-label", "数字员工协作消息");
  scroll.appendChild(inner);
  let followTail = true;
  const onScroll = () => {
    const distanceFromTail = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    followTail = distanceFromTail <= 24;
  };
  scroll.addEventListener("scroll", onScroll, { passive: true });
  chat.appendChild(scroll);
  page.body.appendChild(chat);

  // New events follow the tail only while the reader is already at the bottom.
  // Once the reader scrolls up, preserve that reading position until they return.
  const toBottom = () => {
    if (!followTail) return;
    scroll.scrollTop = scroll.scrollHeight;
  };

  function userMsg(text, instant) {
    const msg = el("div", `sb-msg sb-user${instant ? " sb-instant" : ""}`);
    const main = el("div", "sb-msg-main");
    main.appendChild(el("div", "sb-msg-bubble", text));
    msg.appendChild(main);
    inner.appendChild(msg);
    toBottom();
  }

  function agentMsg(who, { typing = false, instant = false, avatarValue = who, messageClass = "" } = {}) {
    const msg = el("div", `sb-msg${messageClass ? ` ${messageClass}` : ""}${instant ? " sb-instant" : ""}`);
    const avatar = el("div", "sb-msg-avatar", (who || "幕").slice(0, 1));
    mountAgentAvatar(avatar, avatarValue, { alt: who || "数字员工" });
    msg.appendChild(avatar);
    const main = el("div", "sb-msg-main");
    const nameRow = el("div", "sb-msg-name-row");
    nameRow.appendChild(el("div", "sb-msg-name", `${BRAND.mainAgent.replace(/\s*·\s*幕僚长$/, "")} · ${who}`));
    const activity = createAgentActivityBadge(avatarValue === "main" ? "main" : who, { status: { state: "working" } });
    if (activity) nameRow.appendChild(activity);
    main.appendChild(nameRow);
    const bubble = el("div", "sb-msg-bubble");
    if (typing) {
      const thinking = el("span", "sb-msg-thinking", who === chief ? "正在理解目标" : "正在准备");
      const t = el("span", "sb-msg-typing");
      t.append(el("i"), el("i"), el("i"));
      thinking.appendChild(t);
      bubble.appendChild(thinking);
    }
    main.appendChild(bubble);
    msg.appendChild(main);
    inner.appendChild(msg);
    toBottom();
    return bubble;
  }

  // ── 进展卡片视图状态 ──
  const pv = { bubble: null, card: null, status: null, statusText: null, bar: null, clock: null, progress: null, summary: null, detail: null, toggle: null, pauseButton: null, cancelButton: null, progressExpanded: true, progressUserToggled: false, recoveryCard: null, resultCard: null, resultFiles: null, resultSummary: null, progressFiles: null, subs: [] };
  const av = { authCard: null, authTag: null, authButton: null, authActions: null, authWindow: null, authOpening: false, scopeCard: null, scopeTag: null, scopeButton: null, requirementCard: null, requirementTag: null, requirementButton: null, requirementEditButton: null, requirementActions: null, assignmentCard: null };
  engine.viewState = { pv, av };
  const chiefStreams = new Map();
  const followupStreams = new Map();

  function openProgressCard(instant) {
    if (pv.card) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("section", "sb-checkpoint sb-progress-card");
    card.setAttribute("data-sb-checkpoint", "progress");
    card.setAttribute("data-sb-checkpoint-key", `${engine.taskId || "task"}:progress`);
    card.setAttribute("aria-label", "任务执行进度");
    card.setAttribute("aria-live", "polite");
    const head = el("div", "sb-checkpoint-head");
    const headMain = el("div", "sb-checkpoint-head-main");
    headMain.append(el("div", "sb-checkpoint-title", "任务执行进度"), el("div", "sb-checkpoint-subtitle", "数字员工会在关键节点同步发现和产出"));
    const toggle = el("button", "sb-checkpoint-toggle", "收起工作记录");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "true");
    const detailId = `sb-progress-details-${engine.taskId || Date.now()}`;
    toggle.setAttribute("aria-controls", detailId);
    const pauseButton = el("button", "sb-checkpoint-toggle", "暂停任务");
    pauseButton.type = "button";
    pauseButton.setAttribute("aria-label", "暂停任务");
    pauseButton.addEventListener("click", () => {
      const state = interactionStateFor(engine);
      const action = state.taskState === "PAUSED" ? INTERACTION_COMMANDS.RESUME : INTERACTION_COMMANDS.PAUSE;
      issueInteractionCommand(engine, action, { reason: action === INTERACTION_COMMANDS.PAUSE ? "用户暂停" : null });
    });
    const cancelButton = el("button", "sb-checkpoint-toggle", "取消任务");
    cancelButton.type = "button";
    cancelButton.setAttribute("aria-label", "取消任务");
    cancelButton.addEventListener("click", () => {
      if (!window.confirm || window.confirm("确定取消当前任务吗？已完成的工作和证据会保留。")) {
        issueInteractionCommand(engine, INTERACTION_COMMANDS.CANCEL, { reason: "用户取消" });
      }
    });
    const headActions = el("div", "sb-checkpoint-head-actions");
    headActions.append(pauseButton, cancelButton, toggle);
    head.append(headMain, headActions);
    card.appendChild(head);
    const summary = el("div", "sb-progress-summary");
    const summaryDot = el("i");
    const summaryStrong = el("strong", null, "准备执行");
    const summaryText = el("span", null, "等待数字员工接手");
    const updated = el("span", "sb-progress-updated", "刚刚");
    summary.append(summaryDot, summaryStrong, summaryText, updated);
    card.appendChild(summary);
    const body = el("div", "sb-checkpoint-body");
    body.id = detailId;
    const owner = el("div", "sb-run-owner");
    owner.append(el("span", null, "本次由"), el("strong", null, `${runtimeAgent.name}负责`));
    const statusLine = el("div", "sb-run-statusline");
    const status = el("span", "sb-run-status");
    status.appendChild(el("i"));
    status.classList.add("sb-accepted");
    const statusText = document.createTextNode("已接收任务");
    status.appendChild(statusText);
    statusLine.appendChild(status);
    const clock = el("span", "sb-run-clock", "00:00");
    statusLine.appendChild(clock);
    body.appendChild(owner);
    body.appendChild(statusLine);
    const progress = el("div", "sb-run-progress");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "任务整体进度");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", "0");
    const barI = el("i");
    progress.appendChild(barI);
    body.appendChild(progress);
    card.appendChild(body);
    bubble.replaceChildren(card);
    toggle.addEventListener("click", () => {
      pv.progressUserToggled = true;
      pv.progressExpanded = !pv.progressExpanded;
      body.hidden = !pv.progressExpanded;
      toggle.setAttribute("aria-expanded", String(pv.progressExpanded));
      toggle.textContent = pv.progressExpanded ? "收起工作记录" : "展开工作记录";
    });
    pv.bubble = bubble;
    pv.card = card;
    pv.summary = { strong: summaryStrong, text: summaryText, updated, dot: summaryDot };
    pv.detail = body;
    pv.progressFiles = el("div", "sb-result-files");
    body.appendChild(pv.progressFiles);
    pv.toggle = toggle;
    pv.pauseButton = pauseButton;
    pv.cancelButton = cancelButton;
    pv.status = status;
    pv.statusText = statusText;
    pv.bar = barI;
    pv.progress = progress;
    pv.clock = clock;
    pv.subs = script.subs.map((step, index) => {
      const slot = MEMBER_SLOTS[index] || {};
      const skill = engine.runtimeDefinition?.skills?.[index] || { name: step.skill || step.role, executor: step.executor || slot.type };
      const sub = el("div", "sb-run-sub");
      sub.style.display = "none";
      const head = el("div", "sb-run-subhead");
      const employeeName = slot.fallback || runtimeAgent.name;
      const avatar = el("div", "sb-run-agent-avatar", employeeName.slice(0, 1));
      mountAgentAvatar(avatar, employeeName, { alt: employeeName });
      const identity = el("div", "sb-run-subidentity");
      identity.appendChild(el("span", "sb-run-subwho", skill.name));
      identity.appendChild(el("span", "sb-run-subrole", skill.role || step?.role || slot.role));
      const state = el("span", "sb-run-substate", "排队中");
      head.append(avatar, identity, state);
      sub.appendChild(head);
      if (employeeName) {
        const meta = el("div", "sb-run-submeta");
        meta.appendChild(el("span", "sb-run-subskill", `负责员工 · ${employeeName}`));
        sub.appendChild(meta);
      }
      const events = el("div", "sb-run-sub-events");
      sub.appendChild(events);
      const bar = el("div", "sb-run-subbar");
      const bi = el("i");
      bar.appendChild(bi);
      sub.appendChild(bar);
      body.appendChild(sub);
      return { sub, state, events, bar, barI: bi, count: 0 };
    });
    // 计时器（纯视图）
    const t0 = Date.now();
    const cid = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      if (pv.clock) pv.clock.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }, 1000);
    viewTimers.push(cid);
  }

  function updateProgressSummary(status, text) {
    if (!pv.summary) return;
    pv.summary.strong.textContent = status;
    pv.summary.text.textContent = text;
    pv.summary.updated.textContent = "刚刚";
  }

  function updateTaskActionControl() {
    if (!pv.pauseButton) return;
    const state = interactionStateFor(engine);
    const paused = state.taskState === "PAUSED" || engine.paused;
    const waitingApproval = state.taskState === "WAITING_APPROVAL";
    pv.pauseButton.textContent = paused ? "继续任务" : waitingApproval ? "等待审批" : "暂停任务";
    pv.pauseButton.setAttribute("aria-label", paused ? "继续任务" : waitingApproval ? "等待审批" : "暂停任务");
    pv.pauseButton.disabled = waitingApproval || (!paused && !canIssueInteractionCommand(state, INTERACTION_COMMANDS.PAUSE)) || (paused && !canIssueInteractionCommand(state, INTERACTION_COMMANDS.RESUME));
    if (pv.cancelButton) {
      pv.cancelButton.disabled = !canIssueInteractionCommand(state, INTERACTION_COMMANDS.CANCEL);
      pv.cancelButton.textContent = state.taskState === "CANCELLED" ? "已取消" : "取消任务";
    }
  }

  function markRunFinished() {
    if (!pv.status) return;
    pv.status.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-error");
    pv.status.classList.add("sb-done");
    pv.statusText.textContent = "已完成";
    updateProgressSummary("已完成", "所有步骤已完成，结果正在整理");
    updateTaskActionControl();
  }

  function maybeCollapseProgress() {
    if (pv.progressUserToggled || !pv.detail || !pv.toggle) return;
    pv.progressExpanded = false;
    pv.detail.hidden = true;
    pv.toggle.setAttribute("aria-expanded", "false");
    pv.toggle.textContent = "展开工作记录";
  }

  function buildTouchPreview(plan) {
    const box = el("div", "sb-touch-preview");
    const head = el("div", "sb-touch-preview-head");
    head.append(el("span", "sb-touch-preview-title", "模拟候选预览"), el("span", "sb-touch-preview-note", "仅展示，不发送"));
    box.appendChild(head);
    const simulation = buildTouchSimulation(plan);
    const list = el("div", "sb-touch-preview-list");
    simulation.candidates.forEach((candidate) => {
      const row = el("label", "sb-touch-preview-row");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = candidate.id;
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `选择 ${candidate.name}`);
      const main = el("span", "sb-touch-preview-main");
      main.append(el("span", "sb-touch-preview-name", candidate.name), el("span", "sb-touch-preview-meta", candidate.match));
      row.append(checkbox, main);
      list.appendChild(row);
    });
    box.appendChild(list);
    const draft = el("div", "sb-touch-draft");
    const draftHead = el("div", "sb-touch-draft-head");
    draftHead.append(el("span", "sb-touch-draft-title", simulation.draft.title || "模拟首触草稿"), el("span", "sb-touch-draft-channel", simulation.draft.channel));
    draft.append(draftHead, el("div", "sb-touch-draft-body", simulation.draft.body), el("div", "sb-touch-draft-note", simulation.draft.note));
    box.appendChild(draft);
    box.appendChild(el("div", "sb-touch-preview-count", `已选 ${simulation.selectedCount} 位候选`));
    return box;
  }

  function showApprovalBox(instant, remoteApproval = null) {
    if (pv.approvalBox) return;
    if (engine.online && (!remoteApproval || typeof remoteApproval !== "object" || Object.keys(remoteApproval).length === 0)) {
      showRecoveryCard(
        "审批信息未返回",
        "服务端没有返回本次外部动作的对象、方式和风险信息，系统不会用本地模板代替，也不会发送消息。请重试任务。",
        instant,
        { preserved: "外部动作尚未执行", actions: [["重试此步骤", INTERACTION_COMMANDS.RETRY]] }
      );
      return;
    }
    // An online approval must come from the server with its actual target,
    // policy decision and scope. Never fill the card with a local script.
    const approval = remoteApproval || (engine.online ? {} : script.approval || {});
    engine.remoteApproval = engine.online ? { ...approval } : null;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const box = el("section", "sb-run-approval sb-checkpoint");
    box.setAttribute("data-sb-checkpoint", "approval");
    box.setAttribute("data-sb-checkpoint-key", `${engine.taskId || "task"}:approval`);
    box.setAttribute("aria-label", "需要确认的外部操作");
    box.setAttribute("aria-live", "polite");
    const head = el("div", "sb-run-apptitle");
    head.appendChild(document.createTextNode("审批卡点"));
    head.appendChild(el("span", "sb-run-apptag", "需要你的确认"));
    box.appendChild(head);
    const body = el("div", "sb-run-appbody");
    body.innerHTML = `<b>${approval.title || "对外动作确认"}</b><br>${approval.body || approval.description || "请确认本次对外动作的对象、方式和范围。"}`;
    const touchPreview = script.touchPlan && !engine.online ? buildTouchPreview(script.touchPlan) : null;
    if (touchPreview) body.appendChild(touchPreview);
    box.appendChild(body);
    const btns = el("div", "sb-run-appbtns");
    const details = el("button", "sb-run-btn sb-ghost", "查看内容");
    details.type = "button";
    details.setAttribute("aria-expanded", "true");
    details.addEventListener("click", () => {
      const expanded = details.getAttribute("aria-expanded") === "true";
      body.hidden = expanded;
      details.setAttribute("aria-expanded", String(!expanded));
      details.textContent = expanded ? "展开内容" : "收起内容";
    });
    const approve = el("button", "sb-run-btn sb-primary", script.touchPlan && !engine.online ? "确认模拟触达" : "确认执行");
    const reject = el("button", "sb-run-btn sb-ghost", "暂不执行");
    if (touchPreview) {
      const count = touchPreview.querySelector(".sb-touch-preview-count");
      const syncSelection = () => {
        const selected = [...touchPreview.querySelectorAll("input[type=checkbox]")].filter((input) => input.checked).length;
        if (count) count.textContent = `已选 ${selected} 位候选`;
        approve.textContent = selected ? `确认模拟触达（${selected}）` : "请选择候选";
        approve.disabled = selected === 0;
      };
      touchPreview.addEventListener("change", syncSelection);
      syncSelection();
    }
    approve.addEventListener("click", () => {
      const selectedIds = touchPreview
        ? [...touchPreview.querySelectorAll("input[type=checkbox]:checked")].map((input) => input.value)
        : null;
      decide(engine, true, selectedIds);
    });
    reject.addEventListener("click", () => decide(engine, false));
    btns.append(details, reject, approve);
    box.appendChild(btns);
    bubble.appendChild(box);
    pv.approvalBox = box;
    pv.approvalBtns = btns;
    engine.approvalActionUi = [reject, approve];
    toBottom();
  }

  function showBusinessBrief(brief, instant) {
    if (!brief) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("div", "sb-run-brief");
    card.appendChild(el("div", "sb-run-brief-title", brief.title || "执行前确认"));
    const grid = el("div", "sb-run-brief-grid");
    [
      ["业务目标", brief.objective],
      ["数据范围", brief.scope],
      ["交付结果", brief.deliverable],
      ["风控边界", brief.guardrail]
    ].forEach(([label, value]) => {
      const item = el("div", "sb-run-brief-item");
      item.append(el("div", "sb-run-brief-label", label), el("div", "sb-run-brief-value", value));
      grid.appendChild(item);
    });
    card.appendChild(grid);
    bubble.appendChild(card);
    toBottom();
  }

  function showAccessRequired(setup, instant) {
    const localMode = engine.gateway?.cloudDesktopMode === "local";
    const browserLabel = localMode ? "本机浏览器" : "云电脑";
    if (av.authCard) {
      av.authCard.classList.remove("sb-access-resolved");
      av.authTag.textContent = "需要重新登录";
      av.authButton?.remove();
      const button = el("button", "sb-run-btn sb-primary sb-access-action", `重新打开${browserLabel}`);
      button.type = "button";
      button.addEventListener("click", () => beginAccessAuthorization(engine));
      av.authActions?.appendChild(button);
      av.authButton = button;
      av.authCard.querySelector(".sb-access-note")?.remove();
      av.authCard.appendChild(el("div", "sb-access-note", "原浏览器会话已失效，请重新登录抖音；任务不会在未验证登录时继续执行。"));
      toBottom();
      return;
    }
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("div", "sb-access-card");
    const title = el("div", "sb-access-title");
    title.append(el("span", null, "连接执行账号"));
    const tag = el("span", "sb-access-tag", "未授权");
    title.appendChild(tag);
    card.appendChild(title);
    card.appendChild(el("div", "sb-access-copy", setup.description));
    const provider = el("div", "sb-access-provider");
    provider.appendChild(el("div", "sb-access-provider-mark", setup.provider.slice(0, 1)));
    const providerMain = el("div", "sb-access-provider-main");
    providerMain.append(el("div", "sb-access-provider-name", setup.provider), el("div", "sb-access-provider-account", setup.account));
    provider.appendChild(providerMain);
    card.appendChild(provider);
    const scopes = el("div", "sb-access-scopes");
    setup.scopes.forEach((scope) => {
      const row = el("div", "sb-access-scope");
      row.append(el("i", null, "✓"), el("span", null, scope));
      scopes.appendChild(row);
    });
    card.appendChild(scopes);
    const actions = el("div", "sb-access-actions");
    const button = el("button", "sb-run-btn sb-primary sb-access-action", `打开${browserLabel}并授权`);
    button.type = "button";
    button.addEventListener("click", () => beginAccessAuthorization(engine));
    actions.appendChild(button);
    card.appendChild(actions);
    bubble.appendChild(card);
    av.authCard = card;
    av.authTag = tag;
    av.authButton = button;
    av.authActions = actions;
    toBottom();
  }

  function markAccessStarted() {
    if (!av.authCard) return;
    const localMode = engine.gateway?.cloudDesktopMode === "local";
    const browserLabel = localMode ? "本机浏览器" : "云电脑";
    av.authTag.textContent = "授权中";
    av.authButton.disabled = true;
    av.authButton.textContent = `${browserLabel}已打开，等待登录…`;
  }

  async function openAccessWindow(setup) {
    if (av.authWindow || av.authOpening) return;
    av.authOpening = true;
    try {
      const browserStart = engine.gateway?.browserSessionStart;
      const browserAuthorize = engine.gateway?.browserSessionAuthorize;
      if (!engine.online || typeof browserStart !== "function" || typeof browserAuthorize !== "function") {
        throw new Error(engine.gateway?.cloudDesktopMode === "local"
          ? "本机浏览器工作区未连接，无法打开抖音授权窗口"
          : "真实云电脑未连接，无法打开抖音授权窗口");
      }
      const provider = ["抖音账号", "内容账号"].includes(setup.provider) ? "douyin" : setup.provider;
      const session = await browserStart({
        tenantId: engine.tenantId || "local-user",
        provider,
        accountKey: setup.account,
        accountLabel: setup.account,
        taskId: remoteTaskIdFor(engine),
        scopes: setup.scopes
      });
      if (!session?.sessionId) throw new Error("浏览器工作区没有返回会话身份");
      engine.browserSessionId = session.sessionId;
      syncTask(engine, { status: "progress", preview: `${engine.gateway?.cloudDesktopMode === "local" ? "本机浏览器" : "云电脑"}已打开，等待抖音账号登录…` });
      av.authWindow = openDouyinAuthorization({
        account: setup.account,
        scopes: setup.scopes,
        session,
        checkAuthorization: () => browserAuthorize(session.sessionId),
        onAuthorized: () => {
          av.authWindow = null;
          completeAccessAuthorization(engine);
        },
        onCancelled: ({ reason } = {}) => {
          av.authWindow = null;
          cancelAccessAuthorization(engine, reason || "cancelled");
        }
      });
    } catch (error) {
      if (engine.browserSessionId && engine.gateway?.browserSessionClose) {
        engine.gateway.browserSessionClose(engine.browserSessionId).catch(() => {});
        engine.browserSessionId = null;
      }
      engine.accessStage = "required";
      markAccessCancelled();
      emit(engine, {
        t: "task-error",
        text: `真实抖音授权窗口启动失败：${error?.message || "连接异常"}`,
        errorCode: error?.code || "BROWSER_WORKSPACE_START_FAILED",
        retryable: true
      });
    } finally {
      av.authOpening = false;
    }
  }

  function markAccessCancelled() {
    if (!av.authCard) return;
    av.authCard.classList.remove("sb-access-resolved");
    av.authTag.textContent = "未授权";
    av.authButton.disabled = false;
    av.authButton.textContent = `${engine.gateway?.cloudDesktopMode === "local" ? "重新打开本机浏览器" : "重新打开云电脑"}`;
    av.authCard.querySelector(".sb-access-note")?.remove();
  }

  function showAccessScope(setup, instant) {
    if (av.scopeCard) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("div", "sb-access-card");
    const title = el("div", "sb-access-title");
    title.append(el("span", null, "确认本次访问范围"));
    const tag = el("span", "sb-access-tag", "待确认");
    title.appendChild(tag);
    card.appendChild(title);
    card.appendChild(el("div", "sb-access-copy", "选择账号后，确认本次任务允许使用的数据范围。未勾选的数据不会进入任务上下文。"));
    const select = document.createElement("select");
    select.className = "sb-access-select";
    select.setAttribute("aria-label", `${setup.provider}账号`);
    const option = document.createElement("option");
    option.value = setup.account;
    option.textContent = setup.account;
    select.appendChild(option);
    card.appendChild(select);
    const scopes = el("div", "sb-access-scopes");
    setup.scopes.forEach((scope) => {
      const row = el("div", "sb-access-scope");
      row.append(el("i", null, "✓"), el("span", null, scope));
      scopes.appendChild(row);
    });
    card.appendChild(scopes);
    const actions = el("div", "sb-access-actions");
    const button = el("button", "sb-run-btn sb-primary sb-access-action", "确认范围并开始执行");
    button.type = "button";
    button.addEventListener("click", () => confirmAccessScope(engine));
    actions.appendChild(button);
    card.appendChild(actions);
    bubble.appendChild(card);
    av.scopeCard = card;
    av.scopeTag = tag;
    av.scopeButton = button;
    toBottom();
  }

  function markScopeConfirmed() {
    if (!av.scopeCard) return;
    av.scopeCard.classList.add("sb-access-resolved");
    av.scopeTag.textContent = "已确认";
    av.scopeButton.remove();
    av.scopeCard.appendChild(el("div", "sb-access-note", "访问范围已锁定，任务将按此前确认的需求与分工开始执行。"));
  }

  function buildTouchPlanCard(plan, online = engine.online) {
    const box = el("section", "sb-touch-plan");
    const head = el("div", "sb-touch-plan-head");
    head.append(el("div", "sb-touch-plan-title", "我对触达目标的拆解"), el("span", "sb-touch-plan-tag", online ? "我来拆解" : "本地识别"));
    box.appendChild(head);
    const grid = el("div", "sb-touch-plan-grid");
    const fields = [
      ["Source 来源", plan.source?.label],
      ["Audience 人群", plan.audience],
      ["Signal 行为信号", plan.signal],
      ["Filter 筛选条件", plan.filter],
      ["Time 时间范围", plan.timeWindow],
      ["Intent 需求意向", plan.intent],
      ["Relationship 关系", plan.relationship],
      ["Action 下一步", plan.action]
    ];
    fields.forEach(([label, value]) => {
      const item = el("div", "sb-touch-plan-item");
      item.append(el("div", "sb-touch-plan-label", label), el("div", "sb-touch-plan-value", value || "待补充"));
      grid.appendChild(item);
    });
    box.appendChild(grid);
    if (plan.missing?.length) box.appendChild(el("div", "sb-touch-plan-missing", `还需要你补充：${plan.missing.join("、")}`));
    return box;
  }

  function showRequirementCard(brief, taskText, instant, proposal = null) {
    if (av.requirementCard) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("section", "sb-access-card sb-checkpoint");
    card.setAttribute("data-sb-checkpoint", "requirement");
    card.setAttribute("data-sb-checkpoint-key", `${engine.taskId || "task"}:requirement`);
    card.setAttribute("aria-label", "确认任务需求");
    card.setAttribute("aria-live", "polite");
    const title = el("div", "sb-access-title");
    title.append(el("span", null, "请确认我对任务的理解"));
    const tag = el("span", "sb-access-tag", "待确认");
    title.appendChild(tag);
    card.appendChild(title);
    card.appendChild(el("div", "sb-access-copy", "请核对下面的理解是否准确。在你主动确认前，我不会安排 Agent、不会打开账号登录，也不会读取任何业务数据。"));
    if (brief?.touchPlan) card.appendChild(buildTouchPlanCard(brief.touchPlan, engine.online));
    if (proposal?.source) card.appendChild(el("div", "sb-access-note", `由我整理 · 版本 ${brief?.proposalVersion || 1}`));
    const grid = el("div", "sb-requirement-grid");
    const fields = [
      ["任务描述", taskText],
      ["业务目标", brief?.objective],
      ["数据范围", brief?.scope || "按已授权的最小范围"],
      ["交付结果", brief?.deliverable],
      ["停止边界", brief?.guardrail]
    ];
    fields.forEach(([label, value]) => {
      const item = el("div", "sb-requirement-item");
      const missing = isMissingRequirementValue(value);
      item.classList.toggle("sb-requirement-missing", missing);
      item.append(el("div", "sb-requirement-label", label), el("div", "sb-requirement-value", missing ? "需要补充" : value));
      grid.appendChild(item);
    });
    card.appendChild(grid);
    const actions = el("div", "sb-access-actions");
    const button = el("button", "sb-run-btn sb-primary sb-access-action", "确认并开始");
    button.type = "button";
    const missingFields = fields.filter(([, value]) => isMissingRequirementValue(value)).map(([label]) => label);
    if (missingFields.length) {
      button.disabled = true;
      card.appendChild(el("div", "sb-access-note", `请先补充：${missingFields.join("、")}。补充完成后，确认按钮才会启用。`));
    }
    button.addEventListener("click", () => confirmRequirement(engine, { actor: "user", action: "confirm", channel: "requirement-card" }));
    const editButton = el("button", "sb-run-btn sb-ghost", "修改要求");
    editButton.type = "button";
    editButton.addEventListener("click", () => {
      engine.editingRequirement = true;
      input.placeholder = "请补充或修改任务目标、范围、交付结果或停止边界…";
      input.focus();
    });
    actions.append(button, editButton);
    card.appendChild(actions);
    bubble.appendChild(card);
    av.requirementCard = card;
    av.requirementTag = tag;
    av.requirementButton = button;
    av.requirementEditButton = editButton;
    av.requirementActions = actions;
    toBottom();
  }

  function isMissingRequirementValue(value) {
    const normalized = String(value ?? "").trim();
    return !normalized || /^(待补充|需要补充|未填写|暂无|未知|n\/a)$/i.test(normalized);
  }

  function markRequirementConfirmed() {
    if (!av.requirementCard) return;
    av.requirementCard.classList.add("sb-access-resolved");
    av.requirementTag.textContent = "已确认";
    av.requirementActions?.remove();
    av.requirementCard.appendChild(el("div", "sb-access-note", "需求已锁定，我正在拆解任务并安排责任 Agent。"));
  }

  function showAssignmentPlan(assignments = [], text = "", instant = false) {
    if (av.assignmentCard) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("div", "sb-assignment-card");
    const title = el("div", "sb-assignment-title");
    title.append(el("span", null, "任务拆解与责任分工"), el("span", "sb-assignment-tag", "已安排"));
    card.appendChild(title);
    card.appendChild(el("div", "sb-assignment-copy", text || "我已根据确认后的需求完成分工。"));
    const list = el("div", "sb-assignment-list");
    assignments.forEach((assignment, index) => {
      const assignmentName = displayAgentName({ agentType: assignment.agentType, name: assignment.agentName });
      const row = el("div", "sb-assignment-row");
      const avatar = el("div", "sb-assignment-avatar", assignmentName?.slice(0, 1) || "?");
      mountAgentAvatar(avatar, assignment.agentType || assignmentName, { alt: `${assignmentName || "数字员工"}头像` });
      const main = el("div", "sb-assignment-main");
      main.append(el("span", "sb-assignment-skill", `${index + 1}. ${assignment.skill}`), el("span", "sb-assignment-role", assignment.role));
      row.append(avatar, main, el("span", "sb-assignment-owner", assignmentName));
      row.appendChild(el("div", "sb-assignment-executor", `完成标准：${assignment.acceptance}`));
      list.appendChild(row);
    });
    card.appendChild(list);
    const requiresAccess = requirementNeedsAccountAccess(engine.requirementProposal, engine.taskText);
    card.appendChild(el(
      "div",
      "sb-assignment-note",
      requiresAccess
        ? "分工只建立计划，不会触发账号登录、数据读取或对外动作。下一步由你确认授权范围。"
        : "公开数据找人链路已就绪，不需要登录抖音账号或打开云电脑；只会读取公开视频和评论并生成可核验线索。"
    ));
    bubble.appendChild(card);
    av.assignmentCard = card;
    toBottom();
  }

  function markApprovalResolved(ok) {
    if (!pv.approvalBox) return;
    pv.approvalBox.classList.add("sb-resolved");
    pv.approvalBtns?.remove();
    engine.approvalActionUi = null;
    engine.approvalPending = false;
    const approval = engine.runtime.snapshot.approvals.at(-1) || (engine.online ? {} : script.approval || {});
    pv.approvalBox.appendChild(el("div", "sb-run-appresult", ok ? `✓ ${approval.approveNote || "已通过，继续执行任务"}` : `↩ ${approval.rejectNote || "已驳回，任务已暂停"}`));
    if (pv.status && !ok) {
      pv.status.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-done");
      pv.status.classList.add("sb-error");
      pv.statusText.textContent = "已暂停";
      updateProgressSummary("已暂停", "外部操作未执行，等待调整需求");
    } else if (ok) {
      updateProgressSummary("已批准", "外部操作已获确认，继续推进任务");
    }
    if (!ok) {
      const follow = el("button", "sb-run-btn sb-ghost", "调整需求并创建后续任务");
      follow.type = "button";
      follow.addEventListener("click", () => {
        input.placeholder = "描述你希望调整的范围，提交后会创建一个新的后续任务…";
        input.value = "请调整当前任务的范围和执行条件：";
        input.focus();
      });
      pv.approvalBox.appendChild(follow);
    }
    toBottom();
  }

  function buildTouchOutcomeCard(plan) {
    const simulation = buildTouchSimulation(plan, engine.touchSelection);
    const box = el("div", "sb-touch-outcome");
    const head = el("div", "sb-touch-outcome-head");
    head.append(el("span", "sb-touch-outcome-title", "触达结果"), el("span", "sb-touch-outcome-note", "本地模拟"));
    box.appendChild(head);
    const list = el("div", "sb-touch-outcome-list");
    simulation.outcomes.forEach((outcome) => {
      const row = el("div", "sb-touch-outcome-row");
      const dot = el("i", "sb-touch-outcome-dot");
      dot.classList.add(outcome.status === "已回复" ? "is-replied" : outcome.status === "等待回复" ? "is-waiting" : "is-human");
      const main = el("div", "sb-touch-outcome-main");
      main.append(el("div", "sb-touch-outcome-name", outcome.name), el("div", "sb-touch-outcome-detail", outcome.detail));
      row.append(dot, main, el("span", "sb-touch-outcome-status", outcome.status));
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(el("div", "sb-touch-outcome-next", `下一步：${simulation.nextStep}`));
    return box;
  }

  function showSummaryBox(instant) {
    if (pv.resultCard) return;
    const summaryEvent = [...engine.runtime.events].reverse().find((event) => event.t === "summary");
    const resultSnapshot = summaryEvent?.resultSnapshot || resultSnapshotFor(engine, summaryEvent || {});
    if (pv.status) {
      pv.status.classList.add("sb-done");
      pv.statusText.textContent = "已完成";
    }
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("section", "sb-result-card");
    card.setAttribute("data-sb-checkpoint", "result");
    card.setAttribute("data-sb-checkpoint-key", `${engine.taskId || "task"}:result`);
    card.setAttribute("aria-label", "任务结果");
    card.setAttribute("aria-live", "polite");
    const head = el("div", "sb-result-head");
    head.append(el("div", "sb-result-mark", "✓"));
    const headCopy = el("div");
    headCopy.append(el("div", "sb-result-title", "任务完成"), el("div", "sb-result-copy", cleanEmployeeText(resultSnapshot.summary || script.summary)));
    head.appendChild(headCopy);
    card.appendChild(head);
    const account = resultSnapshot.account || engine.runtime?.snapshot?.resolvedAccounts?.[0] || null;
    if (account) {
      const accountLabel = account.nickname || account.uniqueId || account.unique_id || "目标账号";
      const accountId = account.uniqueId || account.unique_id;
      card.appendChild(el("div", "sb-result-account", accountId && accountId !== accountLabel
        ? `已解析账号：${accountLabel} · 抖音号 ${accountId}`
        : `已解析账号：${accountLabel}`));
    }
    if (script.touchPlan && !engine.online) card.appendChild(buildTouchOutcomeCard(script.touchPlan));
    const stats = el("div", "sb-run-stats");
    const metrics = Array.isArray(resultSnapshot.metrics) && resultSnapshot.metrics.length
      ? resultSnapshot.metrics.map((metric) => [metric.value ?? metric.displayValue ?? "—", metric.label || "结果"])
      : engine.online ? [] : (script.stats || []).slice(0, script.touchPlan ? 4 : 3);
    for (const [num, label] of metrics) {
      const s = el("div", "sb-run-stat");
      s.append(el("div", "sb-run-statnum", num), el("div", "sb-run-statlabel", label));
      stats.appendChild(s);
    }
    if (stats.childElementCount) card.appendChild(stats);
    if (engine.online && !metrics.length) card.appendChild(el("div", "sb-access-note", "后端任务已完成，结构化业务结果将在数据返回后补充；当前没有展示示例指标。"));
    const files = el("div", "sb-result-files");
    card.appendChild(files);
    const actions = el("div", "sb-result-actions");
    const goOffice = el("button", "sb-run-btn sb-primary", "去办公室看看");
    goOffice.hidden = !PRODUCT_VISIBILITY.office;
    goOffice.setAttribute("aria-hidden", String(!PRODUCT_VISIBILITY.office));
    goOffice.addEventListener("click", () => {
      page.close();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let cur;
      while ((cur = walker.nextNode())) {
        if (cur.nodeValue && cur.nodeValue.trim() === "办公室") {
          cur.parentElement?.click();
          break;
        }
      }
    });
    const askNext = el("button", "sb-run-btn sb-ghost", script.touchPlan ? "安排下一轮跟进" : "继续生成话术");
    askNext.type = "button";
    askNext.addEventListener("click", () => {
      input.placeholder = script.touchPlan ? "描述你希望如何跟进未回复候选…" : "继续追问结果，或安排下一步工作…";
      input.value = script.touchPlan ? "继续跟进刚才未回复的候选，先给出下一轮跟进话术。" : "基于刚才的结果，继续生成下一步跟进话术。";
      input.focus();
    });
    actions.append(goOffice, askNext);
    card.appendChild(actions);
    bubble.appendChild(card);
    pv.resultCard = card;
    pv.resultFiles = files;
    pv.resultSummary = headCopy.querySelector(".sb-result-copy");
    for (const event of engine.events.filter((item) => item.t === "file")) appendResultFile(event);
    setComposerPlaceholder("继续追问结果，或安排下一步工作…");
    toBottom();
  }

  // Result snapshots can arrive several times before the terminal event
  // (lead sync, qualification, delivery and replies are all incremental).
  // Keep the already-visible result card current without manufacturing local
  // numbers when the task is online.
  function refreshResultCard(snapshot) {
    if (!pv.resultCard || !snapshot || typeof snapshot !== "object") return;
    if (pv.resultSummary && snapshot.summary) {
      pv.resultSummary.textContent = cleanEmployeeText(snapshot.summary);
    }
    const metrics = Array.isArray(snapshot.metrics)
      ? snapshot.metrics.map((metric) => [metric.value ?? metric.displayValue ?? "—", metric.label || "结果"])
      : [];
    const stats = pv.resultCard.querySelector(".sb-run-stats");
    if (!stats || !metrics.length) return;
    stats.replaceChildren();
    for (const [num, label] of metrics) {
      const stat = el("div", "sb-run-stat");
      stat.append(el("div", "sb-run-statnum", num), el("div", "sb-run-statlabel", label));
      stats.appendChild(stat);
    }
  }

  function appendResultFile(event) {
    if (!pv.resultFiles || !event?.name) return;
    if (pv.resultFiles.querySelector(`[data-file-id="${event.id || event.name}"]`)) return;
    const card = el("button", "sb-run-file");
    card.type = "button";
    card.dataset.fileId = event.id || event.name;
    card.append(el("span", `sb-run-fileico ${event.ftype === "sheet" ? "sb-sheet" : "sb-doc"}`, event.ftype === "sheet" ? "表" : "文"));
    const main = el("span", "sb-run-filemain");
    main.append(el("span", "sb-run-filename", event.name), el("span", "sb-run-filesub", "已存入项目共享文件夹"));
    card.append(main, el("span", "sb-run-filego", "预览 ›"));
    card.addEventListener("click", () => openFileCenterPage({ initialFileId: event.id }));
    pv.resultFiles.appendChild(card);
  }

  function setComposerPlaceholder(value) {
    if (typeof input !== "undefined" && input) input.placeholder = value;
  }

  function showRecoveryCard(title, text, instant, options = {}) {
    if (pv.recoveryCard) {
      pv.recoveryCard.querySelector(".sb-recovery-title span")?.replaceChildren(document.createTextNode(title));
      const tag = pv.recoveryCard.querySelector(".sb-recovery-tag");
      if (tag) tag.textContent = /人工|回复/.test(title) ? "需要你的处理" : "任务已暂停";
      pv.recoveryCard.querySelector(".sb-recovery-copy")?.replaceChildren(document.createTextNode(text));
      const preserved = pv.recoveryCard.querySelector(".sb-recovery-preserved span");
      if (preserved) preserved.textContent = options.preserved || "已完成的工作和证据已保留";
      updateRecoveryActions(pv.recoveryCard, options);
      return;
    }
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("section", "sb-recovery-card");
    card.setAttribute("data-sb-checkpoint", "recovery");
    card.setAttribute("data-sb-checkpoint-key", `${engine.taskId || "task"}:recovery`);
    card.setAttribute("aria-label", "任务恢复建议");
    card.setAttribute("aria-live", "polite");
    const titleRow = el("div", "sb-recovery-title");
    titleRow.append(el("span", null, title), el("span", "sb-recovery-tag", "任务已暂停"));
    card.appendChild(titleRow);
    card.appendChild(el("div", "sb-recovery-copy", text));
    const preserved = el("div", "sb-recovery-preserved");
    preserved.append(el("i", null, "✓"), el("span", null, options.preserved || "已完成的工作和证据已保留"));
    card.appendChild(preserved);
    const actions = el("div", "sb-recovery-actions");
    card.appendChild(actions);
    function updateRecoveryActions(targetCard, actionOptions = {}) {
      const target = targetCard.querySelector(".sb-recovery-actions");
      if (!target) return;
      target.replaceChildren();
      const interaction = interactionStateFor(engine);
      const commandActions = [];
      const staleRemoteTask = actionOptions.errorCode === "REMOTE_TASK_NOT_FOUND" || engine.remoteTaskStale === true;
      if (!staleRemoteTask && canIssueInteractionCommand(interaction, INTERACTION_COMMANDS.RETRY)) commandActions.push(["重试此步骤", INTERACTION_COMMANDS.RETRY]);
      if (!staleRemoteTask && canIssueInteractionCommand(interaction, INTERACTION_COMMANDS.RESUME)) commandActions.push(["继续任务", INTERACTION_COMMANDS.RESUME]);
      if (!staleRemoteTask && canIssueInteractionCommand(interaction, INTERACTION_COMMANDS.HANDOFF)) commandActions.push(["转人工接手", INTERACTION_COMMANDS.HANDOFF]);
      for (const [label, value] of [...commandActions, ...(actionOptions.actions || [["补充信息", "请补充任务信息："], ["修改范围", "请调整任务范围："]])]) {
        const button = el("button", "sb-run-btn sb-ghost", label);
        button.type = "button";
        button.addEventListener("click", () => {
          if (Object.values(INTERACTION_COMMANDS).includes(value)) {
            if (!issueInteractionCommand(engine, value, { reason: value === INTERACTION_COMMANDS.HANDOFF ? "用户请求人工接手" : undefined })) return;
            button.disabled = true;
            button.textContent = value === INTERACTION_COMMANDS.HANDOFF ? "已转人工" : value === INTERACTION_COMMANDS.RETRY ? "已提交重试" : "已提交继续";
            return;
          }
          if (value === "auth-reopen") {
            beginAccessAuthorization(engine);
            button.disabled = true;
            button.textContent = "正在打开授权";
            return;
          }
          if (value === "remote-recreate") {
            resetRemoteTaskIdentity(engine);
            button.disabled = true;
            button.textContent = "正在重新建立";
            startEngine(engine);
            return;
          }
          if (value === "requirement-retry") {
            engine.requirementProposal = null;
            engine.requirementRequested = false;
            requestRemoteRequirement(engine);
            button.disabled = true;
            button.textContent = "正在重新理解";
            return;
          }
          engine.editingRequirement = /调整|修改|补充/.test(value);
          input.value = value;
          input.placeholder = "补充信息或安排下一步处理…";
          input.focus();
        });
        target.appendChild(button);
      }
    }
    const interaction = interactionStateFor(engine);
    updateRecoveryActions(card, options);
    bubble.appendChild(card);
    pv.recoveryCard = card;
    toBottom();
  }

  function appendProgressFile(event) {
    if (!pv.progressFiles || !event?.name) return;
    if (pv.progressFiles.querySelector(`[data-file-id="${event.id || event.name}"]`)) return;
    const card = el("button", "sb-run-file");
    card.type = "button";
    card.dataset.fileId = event.id || event.name;
    card.append(el("span", `sb-run-fileico ${event.ftype === "sheet" ? "sb-sheet" : "sb-doc"}`, event.ftype === "sheet" ? "表" : "文"));
    const main = el("span", "sb-run-filemain");
    main.append(el("span", "sb-run-filename", event.name), el("span", "sb-run-filesub", "执行中已产出"));
    card.append(main, el("span", "sb-run-filego", "预览 ›"));
    card.addEventListener("click", () => openFileCenterPage({ initialFileId: event.id }));
    pv.progressFiles.appendChild(card);
  }

  function revealSub(c, stateText = "已接受任务") {
    if (!c) return;
    c.sub.style.display = "";
    c.state.textContent = stateText;
    c.state.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-ok");
    c.state.classList.add(stateText === "已接受任务" ? "sb-accepted" : "sb-thinking");
  }

  function addSubEvent(c, label, className = "") {
    if (!c?.events || c.events.querySelector(`[data-sub-event="${label}"]`)) return;
    const event = el("span", `sb-run-sub-event${className ? ` ${className}` : ""}`, label);
    event.dataset.subEvent = label;
    c.events.appendChild(event);
  }

  function renderAgentTrace(who, title, body, meta = [], instant = false, messageClass = "sb-agent-trace") {
    const visibleWho = displayAgentName(who);
    const bubble = agentMsg(visibleWho, { typing: !instant, instant, avatarValue: who, messageClass });
    if (messageClass.includes("sb-completion")) bubble.closest(".sb-msg")?.querySelector(".sb-agent-activity")?.remove();
    const fill = () => {
      bubble.replaceChildren();
      bubble.appendChild(el("div", "sb-agent-trace-title", title));
      bubble.appendChild(el("div", "sb-agent-trace-body", body));
      if (meta.length) {
        const metaRow = el("div", "sb-agent-trace-meta");
        for (const item of meta) metaRow.appendChild(el("span", null, item));
        bubble.appendChild(metaRow);
      }
      toBottom();
    };
    if (instant) fill();
    else {
      const id = setTimeout(fill, DEMO_REVEAL_MS.trace);
      viewTimers.push(id);
    }
    return bubble;
  }

  /** 渲染一个引擎事件。instant=true 为重放（跳过动画与 typing）。 */
  function renderEvent(event, instant) {
    switch (event.t) {
      case "user":
        userMsg(event.text, instant);
        break;
      case "assignment-plan":
        if (engine.online) engine.accessStage = "required";
        setAgentActivity("main", "分派中");
        showAssignmentPlan(event.assignments || [], event.text, instant);
        break;
      case "auth-required":
        if (engine.online) engine.accessStage = "required";
        applyAuthoritativeAccessSetup(engine, event);
        showAccessRequired(engine.accessSetup, instant);
        break;
      case "auth-started":
        markAccessStarted();
        if (!instant || engine.accessStage === "authorizing") openAccessWindow(engine.accessSetup);
        break;
      case "auth-granted":
        if (engine.online) engine.accessStage = "scope";
        applyAuthoritativeAccessSetup(engine, event);
        if (av.authCard) {
          av.authCard.classList.add("sb-access-resolved");
          av.authTag.textContent = "已授权";
          av.authButton.remove();
          av.authButton = null;
          av.authCard.appendChild(el("div", "sb-access-note", "登录已完成，但还没有读取任何数据。"));
        }
        break;
      case "scope-required":
        if (engine.online) engine.accessStage = "scope";
        applyAuthoritativeAccessSetup(engine, event);
        showAccessScope(engine.accessSetup, instant);
        break;
      case "scope-confirmed":
        if (engine.online) engine.accessStage = "ready";
        applyAuthoritativeAccessSetup(engine, event);
        markScopeConfirmed();
        if (engine.online) engine.scheduleTimeline?.();
        break;
      case "requirement-required":
        setAgentActivity("main", "等待确认");
        if (event.proposal) engine.requirementProposal = event.proposal;
        if (engine.online && !engine.requirementProposal) {
          showRecoveryCard("需求理解未完成", "服务端没有返回结构化需求提案，系统不会用本地模板代替。请重试。", instant, { preserved: "尚未安排 Agent、未读取数据", actions: [["重试理解", "requirement-retry"]] });
          break;
        }
        try {
          const proposalBrief = engine.online
            ? requirementBriefFromProposal(engine.requirementProposal)
            : (event.brief || engine.script.brief);
          showRequirementCard(proposalBrief, event.taskText || engine.taskText, instant, engine.online ? engine.requirementProposal : null);
        } catch (error) {
          showRecoveryCard("需求理解结果无效", error.message, instant, { preserved: "尚未安排 Agent、未读取数据", actions: [["重试理解", "requirement-retry"]] });
        }
        break;
      case "requirement-proposed":
        if (event.proposal) engine.requirementProposal = event.proposal;
        break;
      case "requirement-confirmed":
        if (engine.online) engine.accessStage = "required";
        setAgentActivity("main", "拆解中");
        markRequirementConfirmed();
        break;
      case "requirement-edited":
        if (event.proposal) engine.requirementProposal = event.proposal;
        if (av.requirementCard) {
          const oldMessage = av.requirementCard.closest(".sb-msg");
          oldMessage?.remove();
          av.requirementCard = null;
          av.requirementTag = null;
          av.requirementButton = null;
          av.requirementActions = null;
          try {
            const brief = engine.online
              ? requirementBriefFromProposal(engine.requirementProposal)
              : (event.brief || engine.script.brief);
            showRequirementCard(brief, event.taskText || engine.taskText, instant, engine.online ? engine.requirementProposal : null);
          } catch (error) {
            showRecoveryCard("需求理解结果无效", error.message, instant, { preserved: "尚未安排 Agent、未读取数据", actions: [["重试理解", "requirement-retry"]] });
          }
        }
        updateProgressSummary("等待确认", "需求已更新，等待你再次确认");
        break;
      case "auth-cancelled":
        if (engine.online) engine.accessStage = "required";
        markAccessCancelled();
        showRecoveryCard("授权还没有完成", event.text, instant, { preserved: "数据读取尚未开始，任务仍然安全暂停", actions: [["重新打开授权", "auth-reopen"], ["交给人工", INTERACTION_COMMANDS.HANDOFF]] });
        updateProgressSummary("待授权", "数据读取尚未开始");
        break;
      case "run-started":
        setAgentActivity("main", "理解中");
        updateProgressSummary("理解中", "我正在确认目标、范围和交付边界");
        break;
      case "chief": {
        // Older persisted tasks contain the pre-ownership transport copy. Keep
        // replay truthful to the current orchestration model without mutating
        // the immutable event log.
        const displayText = String(event.text || "").replace(
          "已收到任务，正在连接需求理解 Agent…",
          "我已收到任务，正在理解你的需求…"
        );
        if (instant) {
          agentMsg(chief, { instant: true, avatarValue: "main" }).textContent = displayText;
        } else {
          const bubble = agentMsg(chief, { typing: true, avatarValue: "main" });
          const id = setTimeout(() => { bubble.textContent = displayText; toBottom(); }, DEMO_REVEAL_MS.chief);
          viewTimers.push(id);
        }
        break;
      }
      case "chief-stream-start": {
        const streamId = event.streamId || event.messageId || event.runId || "default";
        const bubble = agentMsg(chief, { typing: true, instant, avatarValue: "main" });
        chiefStreams.set(streamId, { bubble, text: "" });
        break;
      }
      case "chief-stream-delta": {
        const streamId = event.streamId || event.messageId || event.runId || "default";
        const state = chiefStreams.get(streamId) || (() => {
          const next = { bubble: agentMsg(chief, { typing: true, instant, avatarValue: "main" }), text: "" };
          chiefStreams.set(streamId, next);
          return next;
        })();
        state.text += String(event.text || "");
        state.bubble.textContent = state.text;
        toBottom();
        break;
      }
      case "chief-stream-end": {
        const streamId = event.streamId || event.messageId || event.runId || "default";
        const state = chiefStreams.get(streamId);
        if (state) {
          state.text = event.text || state.text;
          state.bubble.textContent = state.text;
          chiefStreams.delete(streamId);
          toBottom();
        } else if (event.text) {
          agentMsg(chief, { instant, avatarValue: "main" }).textContent = event.text;
        }
        break;
      }
      case "followup-stream-start": {
        const followupId = event.followupId || event.streamId || engine.pendingFollowupId;
        if (!followupId) break;
        const bubble = followupStreams.get(followupId) || agentMsg(chief, { typing: true, avatarValue: "main", instant });
        followupStreams.set(followupId, bubble);
        engine.pendingFollowupId = followupId;
        break;
      }
      case "followup-stream-delta": {
        const followupId = event.followupId || event.streamId || engine.pendingFollowupId;
        if (!followupId) break;
        const bubble = followupStreams.get(followupId) || agentMsg(chief, { typing: true, avatarValue: "main", instant });
        bubble.textContent = `${bubble.dataset.sbStreamText || ""}${event.text || ""}`;
        bubble.dataset.sbStreamText = bubble.textContent;
        followupStreams.set(followupId, bubble);
        engine.pendingFollowupId = followupId;
        toBottom();
        break;
      }
      case "followup-stream-end": {
        const followupId = event.followupId || event.streamId || engine.pendingFollowupId;
        const bubble = followupId ? followupStreams.get(followupId) : null;
        if (bubble) {
          bubble.textContent = event.text || bubble.dataset.sbStreamText || bubble.textContent;
          delete bubble.dataset.sbStreamText;
        }
        if (followupId) followupStreams.delete(followupId);
        if (engine.pendingFollowupId === followupId) engine.pendingFollowupId = null;
        toBottom();
        break;
      }
      case "brief":
        // The requirement checkpoint owns the brief so it is not repeated as a second card.
        break;
      case "progress-start":
        openProgressCard(instant);
        updateProgressSummary("准备执行", "数字员工正在接手任务");
        break;
      case "dispatch":
        // Dispatch remains in the runtime/evidence stream. The employee's own entrance
        // message below is the only user-facing handoff, avoiding protocol-like chatter.
        break;
      case "account-resolved": {
        const account = event.account || {};
        const label = account.nickname || account.uniqueId || account.unique_id || "目标账号";
        const douyinId = account.uniqueId || account.unique_id;
        updateProgressSummary("账号已识别", douyinId && douyinId !== label ? `${label} · 抖音号 ${douyinId}` : label);
        break;
      }
      case "lead-candidate":
        updateProgressSummary("找人中", event.count != null ? `已同步 ${event.count} 条候选线索` : "正在同步候选线索");
        break;
      case "lead-qualified":
        updateProgressSummary("分析中", event.score != null ? `已识别一条 ${event.tier || "高意向"} 线索（${event.score} 分）` : "正在核验线索意向");
        break;
      case "result-updated": {
        const snapshot = event.resultSnapshot || engine.runtime?.snapshot?.resultSnapshot;
        const counts = resultCountsFor(snapshot);
        const countText = [
          counts.leads != null ? `${counts.leads} 条线索` : null,
          counts.outreach != null ? `${counts.outreach} 次触达` : null,
          counts.replies != null ? `${counts.replies} 条回复` : null
        ].filter(Boolean).join(" · ");
        updateProgressSummary("结果已更新", countText || "已收到新的业务结果");
        refreshResultCard(snapshot);
        break;
      }
      case "sub-start": {
        const agentName = displayAgentName({ agentType: event.agentType, name: event.agentName || memberOf() });
        if (engine.online) {
          const skill = event.skill || event.skillId || "服务端执行阶段";
          renderAgentTrace(
            agentName,
            "已开始执行",
            event.text || `${skill}已由${agentName}开始处理。`,
            [],
            instant,
            "sb-human-agent-message"
          );
          break;
        }
        const trace = getDialogueInteractionTrace(engine.scriptKey, event.i, engine.taskText);
        const dialogue = getEmployeeDialogue("entrance", {
          agentName,
          skill: event.skill || trace.skill,
          role: trace.role,
          index: event.i
        });
        renderAgentTrace(agentName, dialogue.title, dialogue.body, [], instant, "sb-human-agent-message");
        break;
      }
      case "sub-show":
      case "sub-accepted": {
        const c = pv.subs[event.i];
        const trace = getDialogueInteractionTrace(engine.scriptKey, event.i, engine.taskText);
        if (c && c.count === 0) {
          revealSub(c);
          addSubEvent(c, "已接受", "sb-active");
          if (pv.statusText) {
            pv.statusText.textContent = "已开始分派";
            pv.status.classList.remove("sb-accepted");
            pv.status.classList.add("sb-on");
          }
          updateProgressSummary("执行中", "数字员工正在接手任务");
        }
        // The entrance message already communicates acceptance in the employee's voice.
        break;
      }
      case "sub-started": {
        const c = pv.subs[event.i];
        const trace = getDialogueInteractionTrace(engine.scriptKey, event.i, engine.taskText);
        if (c) {
          revealSub(c, "已开始任务");
          addSubEvent(c, "已开始", "sb-active");
          if (pv.statusText) {
            pv.statusText.textContent = "执行中";
            pv.status.classList.remove("sb-accepted", "sb-thinking");
            pv.status.classList.add("sb-on");
          }
          updateProgressSummary("执行中", "数字员工正在处理任务");
        }
        // Progress state still advances, but no second mechanical chat bubble is added.
        break;
      }
      case "sub-log": {
        const c = pv.subs[event.i];
        const trace = getDialogueInteractionTrace(engine.scriptKey, event.i, engine.taskText);
        const waitingForRemoteResult = ["PENDING", "QUEUED", "WAITING", "PROCESSING", "DISPATCHED"].includes(String(event.status || "").toUpperCase());
        if (c) {
          if (c.sub.style.display === "none") { // 历史事件缺少接收节点时，首条回报也要补齐状态轨迹
            revealSub(c, "已开始任务");
            addSubEvent(c, "已开始", "sb-active");
          }
          c.count += 1;
          const lineCount = Math.max(1, script.subs[event.i]?.lines?.length || c.count || 1);
          c.barI.style.width = `${Math.min(100, Math.round((c.count / lineCount) * 100))}%`;
          for (const evidence of event.evidence || []) {
            addSubEvent(c, `证据 · ${evidence.label || evidence.ref}`, "sb-evidence");
          }
          c.state.textContent = "思考中";
          c.state.classList.remove("sb-accepted", "sb-on", "sb-ok");
          c.state.classList.add("sb-thinking");
          if (pv.statusText) {
            pv.statusText.textContent = "正在推进";
            pv.status.classList.remove("sb-accepted", "sb-on");
            pv.status.classList.add("sb-thinking");
          }
          updateProgressSummary("正在分析", "正在整理证据和判断依据");
        }
        // Online runs render only server status/text. Local employee dialogue is
        // reserved for explicit demo mode and must never imply real progress.
        const speaker = displayAgentName({ agentType: event.agentType, name: event.agentName || memberOf() });
        const evidenceMeta = (event.evidence || []).map((item) => `工作依据 · ${item.label || item.ref}`);
        if (engine.online) {
          renderAgentTrace(
            speaker,
            waitingForRemoteResult ? "等待异步回调" : "服务端进展",
            event.text || `${event.skill || event.skillId || "服务端执行阶段"}已更新状态。`,
            evidenceMeta,
            instant,
            "sb-human-agent-message"
          );
          toBottom();
          break;
        }
        const dialogue = getEmployeeDialogue("progress", {
          agentName: speaker,
          skill: trace.skill,
          role: trace.role,
          text: event.text,
          index: event.i,
          lineIndex: event.lineIndex
        });
        if (instant) {
          renderAgentTrace(speaker, dialogue.title, dialogue.body, evidenceMeta, true, "sb-human-agent-message");
          if (c) {
            c.state.textContent = "工作中";
            c.state.classList.remove("sb-thinking");
            c.state.classList.add("sb-on");
          }
          if (pv.statusText) {
            pv.statusText.textContent = "执行中";
            pv.status.classList.remove("sb-thinking");
            pv.status.classList.add("sb-on");
          }
          updateProgressSummary("执行中", `${speaker}刚刚同步了新的进展`);
        } else {
          renderAgentTrace(speaker, dialogue.title, dialogue.body, evidenceMeta, false, "sb-human-agent-message");
          const id = setTimeout(() => {
            if (c) {
              c.state.textContent = "工作中";
              c.state.classList.remove("sb-thinking");
              c.state.classList.add("sb-on");
            }
            if (pv.statusText) {
              pv.statusText.textContent = "执行中";
              pv.status.classList.remove("sb-thinking");
              pv.status.classList.add("sb-on");
            }
            updateProgressSummary("执行中", `${speaker}刚刚同步了新的进展`);
            toBottom();
          }, 800);
          viewTimers.push(id);
        }
        if (waitingForRemoteResult) {
          if (c) {
            c.state.textContent = "等待回调";
            c.state.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-ok");
            c.state.classList.add("sb-thinking");
          }
          if (pv.statusText) {
            pv.statusText.textContent = "等待数据回调";
            pv.status.classList.remove("sb-accepted", "sb-on", "sb-ok");
            pv.status.classList.add("sb-thinking");
          }
          updateProgressSummary("等待数据回调", event.text || "真实采集任务已提交，等待异步结果返回");
        }
        toBottom();
        break;
      }
      case "sub-done": {
        const c = pv.subs[event.i];
        const trace = getDialogueInteractionTrace(engine.scriptKey, event.i, engine.taskText);
        if (c) {
          c.state.textContent = "已完成";
          c.state.classList.remove("sb-accepted", "sb-on", "sb-thinking");
          c.state.classList.add("sb-ok");
          c.bar.classList.add("sb-ok");
          addSubEvent(c, "已完成", "sb-complete");
        }
        const speaker = displayAgentName({ agentType: event.agentType, name: event.agentName || memberOf() });
        if (engine.online) {
          renderAgentTrace(
            speaker,
            "阶段已返回",
            event.text || `${event.skill || event.skillId || "服务端执行阶段"}已返回服务端结果。`,
            event.errorCode ? [`错误码 · ${event.errorCode}`] : [],
            instant,
            "sb-human-agent-message sb-completion"
          );
          updateProgressSummary("执行中", `${speaker}已返回服务端状态`);
          maybeCollapseProgress();
          toBottom();
          break;
        }
        const dialogue = getEmployeeDialogue("completion", {
          agentName: speaker,
          skill: trace.skill,
          role: trace.role,
          text: event.text || trace.completed,
          index: event.i
        });
        renderAgentTrace(speaker, dialogue.title, dialogue.body, ["本步骤已完成", "等待产出整理"], instant, "sb-human-agent-message sb-completion");
        updateProgressSummary("执行中", `${speaker}已完成负责步骤`);
        maybeCollapseProgress();
        toBottom();
        break;
      }
      case "sub-error": {
        const c = pv.subs[event.i];
        if (c) {
          c.state.textContent = "执行失败";
          c.state.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-ok");
          c.state.classList.add("sb-error");
          c.bar.classList.add("sb-error");
          addSubEvent(c, "遇到问题 · 已暂停", "sb-evidence");
        }
        if (pv.status) {
          pv.status.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-done");
          pv.status.classList.add("sb-error");
          pv.statusText.textContent = "执行失败";
        }
        updateProgressSummary("已暂停", "这一步遇到问题，已完成内容不会丢失");
        showRecoveryCard("这一步没有顺利完成", cleanEmployeeText(event.text), instant);
        break;
      }
      case "handoff":
        updateProgressSummary("需要人工", "自动动作已停止，等待你的处理");
        showRecoveryCard("这一步需要你来接手", cleanEmployeeText(event.text), instant, { actions: [["补充信息", "请补充人工处理要求："], ["交给人工", INTERACTION_COMMANDS.HANDOFF]] });
        break;
      case "task-error":
        showRecoveryCard(
          "任务先暂停一下",
          cleanEmployeeText(event.text),
          instant,
          event.errorCode === "REMOTE_TASK_NOT_FOUND"
            ? { preserved: "本地已完成的工作和证据已保留", errorCode: event.errorCode, actions: [["重新建立任务", "remote-recreate"]] }
            : {}
        );
        updateProgressSummary("已暂停", "任务遇到问题，等待你的处理");
        break;
      case "task-paused":
        engine.paused = true;
        updateProgressSummary("已暂停", event.reason || "任务已暂停，已完成内容和证据会保留");
        showRecoveryCard("任务已暂停", event.reason || "任务已暂停，继续时会从未完成步骤恢复。", instant, { preserved: "已完成的工作和证据已保留" });
        break;
      case "task-resumed":
        engine.paused = false;
        updateProgressSummary("继续执行", "任务已恢复，将从剩余步骤继续");
        break;
      case "task-retry-requested":
        engine.paused = false;
        updateProgressSummary("重试中", "正在重新执行失败步骤，已完成内容不会重复发送");
        break;
      case "task-cancelled":
        engine.cancelled = true;
        if (pv.status) {
          pv.status.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-done");
          pv.status.classList.add("sb-error");
          pv.statusText.textContent = "已取消";
        }
        updateProgressSummary("已取消", "任务已停止，历史证据仍可查看");
        break;
      case "lead-replied":
        updateProgressSummary("已收到回复", "未执行的后续触达已停止，等待人工或会话接管");
        showRecoveryCard("收到客户回复", `${event.replyText || "客户发来了新的回复"} 已停止后续自动跟进，完整上下文保留在当前任务中。`, instant, { preserved: "后续触达已停止，不会重复打扰客户", actions: [["继续追问", "请基于客户刚才的回复，整理下一步人工处理建议："]] });
        break;
      case "lead-do-not-contact":
        updateProgressSummary("已停止触达", "客户已被加入不触达保护，后续自动动作均已拦截");
        showRecoveryCard("已停止触达", event.reason || "该客户不再接受自动触达。", instant, { preserved: "不触达状态已记录，后续任务会继续拦截" });
        break;
      case "outreach-scheduled":
        updateProgressSummary("已排期", event.at ? `触达计划：${event.at}` : "触达已排入执行队列");
        break;
      case "outreach-sending":
        updateProgressSummary("触达中", "正在逐条执行已确认的触达动作");
        break;
      case "outreach-sent":
        updateProgressSummary("已提交触达", event.deliveryState === "delivered" ? "平台已确认送达，等待客户回复" : "平台已接收请求，正在核对送达状态");
        break;
      case "delivery-checking":
        updateProgressSummary("核对送达", "网络状态不确定，正在核对结果，暂不重复发送");
        break;
      case "outreach-failed":
        showRecoveryCard("触达没有完成", cleanEmployeeText(event.text || "触达执行失败"), instant, { preserved: "已保留对象、动作和失败原因" });
        updateProgressSummary("触达失败", event.retryable === false ? "需要调整触达方式" : "可以重试失败对象");
        break;
      case "task-blocked":
        if (pv.status) {
          pv.status.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-done");
          pv.status.classList.add("sb-error");
          pv.statusText.textContent = "待人工修改";
        }
        updateProgressSummary("待人工处理", "不会继续对外执行，等待你的调整");
        showRecoveryCard("好，我先停在这里", cleanEmployeeText(event.text), instant);
        break;
      case "progress":
        if (pv.bar) pv.bar.style.width = `${event.pct}%`;
        if (pv.progress) pv.progress.setAttribute("aria-valuenow", String(event.pct));
        break;
      case "file": {
        appendProgressFile(event);
        appendResultFile(event);
        toBottom();
        break;
      }
      case "approval-show":
        showApprovalBox(instant, event.approval);
        if (engine.decision != null) markApprovalResolved(engine.decision); // 重放时已决策
        break;
      case "approval-resolved":
        engine.touchSelection = Array.isArray(event.selectedIds) ? event.selectedIds : engine.touchSelection;
        markApprovalResolved(event.ok);
        break;
      case "touch-sent":
        updateProgressSummary(
          engine.online ? "已提交触达" : "已模拟触达",
          engine.online ? "平台已接收请求，正在核对送达状态" : "候选状态已更新，未发送任何外部消息"
        );
        break;
      case "run-finished":
        markRunFinished();
        break;
      case "summary":
        showSummaryBox(instant);
        break;
      case "followup-user":
        userMsg(event.text, instant);
        break;
      case "followup-waiting": {
        const followupId = event.followupId || `followup-${engine.runtime.events.length}`;
        const bubble = agentMsg(chief, { typing: true, avatarValue: "main", instant });
        followupStreams.set(followupId, bubble);
        engine.pendingFollowupId = followupId;
        break;
      }
      case "followup-failed": {
        const bubble = followupStreams.get(event.followupId);
        if (bubble) {
          bubble.textContent = event.text || "追问未送达，请稍后重试。";
          followupStreams.delete(event.followupId);
        }
        if (engine.pendingFollowupId === event.followupId) engine.pendingFollowupId = null;
        showRecoveryCard("追问没有送达", event.text || "连接异常，请重试。", instant, { preserved: "原任务状态和已完成证据未受影响" });
        break;
      }
      case "followup-chief": {
        const pending = event.followupId ? followupStreams.get(event.followupId) : null;
        if (pending) {
          pending.textContent = event.text;
          followupStreams.delete(event.followupId);
          if (engine.pendingFollowupId === event.followupId) engine.pendingFollowupId = null;
        } else if (instant) {
          agentMsg(chief, { instant: true, avatarValue: "main" }).textContent = event.text;
        } else {
          const bubble = agentMsg(chief, { typing: true, avatarValue: "main" });
          const id = setTimeout(() => { bubble.textContent = event.text; toBottom(); }, DEMO_REVEAL_MS.followup);
          viewTimers.push(id);
        }
        break;
      }
    }
  }

  const renderLive = (event) => {
    renderEvent(event, false);
    updateTaskActionControl();
  };

  // 重放历史 + 订阅增量
  let input = null;
  for (const event of engine.events) renderEvent(event, true);
  updateTaskActionControl();
  engine.listeners.add(renderLive);
  if (!engine.engineInitialized) startEngine(engine);
  else if (!engine.runtime.events.some((event) => ["summary", "task-cancelled"].includes(event.t))) engine.subscribeRemote?.();

  // ── 底部输入条：追问 ──
  const bar = el("div", "sb-chat-bar");
  const barInner = el("div", "sb-chat-barinner");
  input = el("textarea", "sb-chat-input");
  input.rows = 1;
  input.placeholder = "补充客户、目标、数据范围或验收口径…";
  if (engine.runtime.events.some((event) => event.t === "summary")) input.placeholder = "继续追问结果，或安排下一步工作…";
  const send = el("button", "sb-chat-send", "↑");
  send.setAttribute("aria-label", "发送");
  const doSend = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    followUp(engine, text);
  };
  send.addEventListener("click", doSend);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      doSend();
    }
  });
  barInner.append(input, send);
  bar.appendChild(barInner);
  chat.appendChild(bar);

  toBottom();
  return page;
}

/** 供看板卡片点击重开任务对话：引擎已存在则直接重放，不重新跑。 */
export function reopenTaskConversation({ task, teamLive }) {
  const engine = ensureEngine({
    taskId: task.id,
    taskText: task.taskText || task.title,
    projectId: task.projectId || "room-leads",
    projectName: task.projectName || "潜在客户拓展项目组",
    projectMembers: task.projectMembers || [],
    teamLive,
    gateway: taskRunnerContext?.gateway || null,
    online: task.online === true,
    demoMode: explicitDemoMode(),
        runtimeEvents: task.runtimeEvents || [],
        taskStatus: task.status,
        taskResultSnapshot: task.resultSnapshot || null,
        taskPreview: task.preview,
    remoteTaskId: task.remoteTaskId || null,
    remoteTaskRunId: task.remoteTaskRunId || null,
    remoteConversationId: task.remoteConversationId || null,
    remoteTaskVersion: task.remoteTaskVersion ?? null,
    remoteTaskSeq: task.remoteTaskSeq ?? null,
    browserSessionId: task.browserSessionId || null
  });
  openConversation(engine);
}

/** Start a task from an independently executable skill in the toolbox. */
export async function startSkillTask({ name, prompt, teamLive = null, gateway = null } = {}) {
  const context = taskRunnerContext || { teamLive, gateway };
  const activeGateway = context.gateway || gateway;
  const demoMode = explicitDemoMode();
  if (!canSubmitTask({ gateway: activeGateway, demoMode })) {
    showTaskRunnerNotice("后端控制面未连接，任务未执行。请先启动 Byering 后端（6681）。");
    return false;
  }
  if (!context.teamLive && !teamLive) return false;
  const project = await currentProject(activeGateway);
  const taskText = prompt || `请执行技能：${name || "未命名技能"}`;
  const projectMembers = project.members || [];
  const online = activeGateway?.controlPlaneReady === true;
  const taskId = addTask({
    title: name || taskText.slice(0, 40),
    projectId: project.id,
    projectName: project.name,
    projectMembers,
    taskText,
    online
  });
  const engine = ensureEngine({
    taskId,
    taskText,
    projectId: project.id,
    projectName: project.name,
    projectMembers,
    teamLive: context.teamLive || teamLive,
    gateway: activeGateway,
    online,
    demoMode
  });
  openConversation(engine);
  return true;
}

/* ── 提交拦截 ── */

function isHomePath() {
  const p = location.pathname;
  return p === "/" || p === "/home" || p === "";
}

function homeEditor() {
  if (!isHomePath()) return null;
  const ed = document.querySelector(".ProseMirror");
  return ed && ed.isContentEditable ? ed : null;
}

function clearEditor(editor) {
  try {
    editor.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(editor);
    document.execCommand("delete", false);
  } catch { /* 清空失败不阻塞 */ }
}

export function canSubmitTask({ gateway = null, demoMode = false } = {}) {
  return gateway?.controlPlaneReady === true || demoMode === true;
}

function explicitDemoMode() {
  return globalThis.__SALEBUDDY_CONFIG__?.demoMode === true
    || (typeof location !== "undefined" && new URLSearchParams(location.search).get("demo") === "1");
}

async function currentProject(gateway) {
  try {
    const [list, cur] = await Promise.all([
      gateway.action("room.action.list"),
      gateway.action("room.office.current")
    ]);
    const id = cur?.data?.roomId;
    const room = (list?.data?.rooms || []).find((r) => r.id === id);
    return room || { id: "room-leads", name: "潜在客户拓展项目组" };
  } catch {
    return { id: "room-leads", name: "潜在客户拓展项目组" };
  }
}

export function mountTaskRunner({ teamLive, gateway } = {}) {
  ensureStyle();
  taskRunnerContext = { teamLive, gateway };
  let submitting = false;
  let onlineEnabled = false;

  const onInputOptions = (event) => {
    onlineEnabled = event.detail?.online === true;
  };
  document.addEventListener("salebuddy:input-options", onInputOptions);

  async function submit(editor) {
    const text = (editor?.textContent || "").replace(/ /g, " ").trim();
    if (!text || submitting) return;
    const controlPlaneReady = gateway?.controlPlaneReady === true;
    const demoMode = explicitDemoMode();
    if (!canSubmitTask({ gateway, demoMode })) {
      showTaskRunnerNotice("后端控制面未连接，任务未执行。请先启动 Byering 后端（6681）。");
      return;
    }
    submitting = true;
    try {
      clearEditor(editor);
      const project = await currentProject(gateway);
      const projectId = project.id;
      const projectName = project.name;
      const title = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      const optionInput = editor.closest?.(".semi-aiChatInput");
      const online = controlPlaneReady;
      const projectMembers = project.members || [];
      const taskId = addTask({ title, projectId, projectName, projectMembers, taskText: text, online });
      const engine = ensureEngine({ taskId, taskText: text, projectId, projectName, projectMembers, teamLive, gateway, online, demoMode });
      openConversation(engine);
    } finally {
      submitting = false;
    }
  }

  // Enter 发送（无 Shift、非输入法组词中）；捕获阶段拦截，原生链路整段替换
  const onKeydown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const editor = homeEditor();
    if (!editor || !editor.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submit(editor);
  };

  // 右下角发送按钮
  const onClick = (event) => {
    const btn = event.target.closest?.("button.semi-aiChatInput-footer-action-send");
    if (!btn) return;
    const editor = homeEditor();
    if (!editor) return;
    if (!(editor.textContent || "").trim()) return; // 空内容放行原生（按钮本就禁用）
    event.preventDefault();
    event.stopImmediatePropagation();
    submit(editor);
  };

  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("click", onClick, true);
  console.log("[SaleBuddy] 任务运行（对话式·服务端控制面）已接管首页提交");

  return {
    unmount() {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("click", onClick, true);
      document.removeEventListener("salebuddy:input-options", onInputOptions);
      if (taskRunnerContext?.teamLive === teamLive) taskRunnerContext = null;
    }
  };
}
