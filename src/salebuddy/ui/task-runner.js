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
import { BRAND } from "../brand.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { activityLabelFor, clearAgentActivities, createAgentActivityBadge, setAgentActivity } from "./agent-activity.js";
import { appendRuntimeEvent, createRuntimeTask, getRuntimeSnapshot, replayRuntimeEvents } from "../runtime/task-runtime.js";
import { resolveBusinessPrompt } from "../business/prompt-catalog.js";
import { buildTouchSimulation, parseTouchRequest } from "../business/touch-audience.js";
import { buildApprovalTimeline, buildAssignmentPlan, buildDemoTimeline, DEMO_PACING, getDemoAccessSetup } from "../runtime/demo-timeline.js";
import { openDouyinAuthorization } from "./douyin-auth.js";

const DEMO_REVEAL_MS = Object.freeze({
  trace: 620,
  chief: 820,
  followup: 720
});

let taskRunnerContext = null;

const CSS = `
.sb-chat{display:flex;flex-direction:column;height:100%;background:#FAFAFA}
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
  if (/买车|车型|购车|到店|留电话|潜客|线索|挖掘|获客|名单|意向客户/.test(t)) return "leads";
  if (/抖音|视频|内容|小红书|文案|账号/.test(t)) return "content";
  return "generic";
}

const MEMBER_SLOTS = [
  { type: "Browser Agent", fallback: "线索猎人", role: "检索、补全与验证" },
  { type: "Search Agent", fallback: "数据分析师", role: "清洗与评分" },
  { type: "File Agent", fallback: "内容策划", role: "物料产出" },
  { type: "App Agent", fallback: "销售顾问", role: "触达执行" }
];

const EMPLOYEE_VOICES = Object.freeze({
  线索猎人: Object.freeze({
    entranceTitle: "好呀，这部分交给我",
    entranceBody: ({ role }) => `我先去看看${role || "现场互动"}，把真正值得跟进的信号捞出来。有发现我马上回来同步 👀`,
    progressLead: "我刚发现一些新情况：",
    completionTitle: "第一轮我看完啦 ✅"
  }),
  数据分析师: Object.freeze({
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
  销售顾问: Object.freeze({
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
  content: { id: "content_operator", name: "内容策划", role: "验证选题并产出内容计划", type: "professional_agent" },
  generic: { id: "project_operator", name: "项目执行 Agent", role: "按计划拆解并交付结果", type: "professional_agent" }
});

const SCENARIO_SKILL_IDS = Object.freeze({
  leads: ["observe_interactions", "score_intent", "plan_outreach", "run_conversation"],
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
        completion: "我已完成互动观察：3,842 条抖音评论、粉丝和直播互动已同步，214 位候选都保留了原评论、来源作品和主页证据，交给数据分析师继续评分。",
        assign: "线索猎人先观察：只读取已授权抖音账号的评论、粉丝和直播互动，保留原始证据。",
        lines: [
          "账号状态 READY，已同步昨晚 3 场直播、2 条车型视频的评论和粉丝互动，共 3,842 条原始记录。",
          "我先排除抽奖、表情刷屏、同行账号和重复互动，再补看用户主页、历史评论和来源作品，不只靠关键词。",
          "发现 214 位有效候选，其中 68 位出现车型、预算、城市或到店信号；例如「325Li 杭州最近落地多少？」每条都保留原评论、作品和主页证据，交给数据分析师。"
        ]
      },
      {
        skill: "识别意向",
        role: "意向评分与解释",
        executor: "Python + LLM + Policy",
        completion: "我已完成意向评分：214 位候选分成 A 级 47、B 级 86、C 级 81，6 条证据不足的线索已拦截，没有进入触达队列。",
        assign: "数据分析师接手：按购买阶段评分，证据不足的线索不进入触达。",
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
          "已为 47 位 A 级客户生成个性化首触和下一步动作，话术与证据绑定，交给销售顾问执行。"
        ]
      },
      {
        skill: "持续对话",
        role: "私信执行与会话跟进",
        executor: "RPA + LLM + 人工接管",
        completion: "我已完成本轮会话跟进：31 条私信带来 12 条有效回复，5 位确认本周到店；1 位已留联系方式，2 位按规则转人工接管。",
        assign: "销售顾问执行触达：先通过权限和频控检查，再逐条发送并等待客户回复。",
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
      approveNote: "已通过：销售顾问开始逐条触达，并等待客户回复",
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
        assign: "猎人先把同类目头部账号近 30 天的爆款捞出来拆。",
        lines: [
          "收到，开捞。同类目 top 30 账号近 30 天的视频我全过了一遍。",
          "24 条真爆款拆完了：开头 3 秒钩子、节奏点、转化引导，结构都标清楚了。",
          "拆解文档 benchmarks.md 已存。说个发现：评测类比纯展示的完播率高快一倍。"
        ]
      },
      {
        assign: "分析师找找咱们账号的流量洼地。",
        lines: [
          "收到。近 90 天的数据我拉完了，完播和互动都按选题维度切开看。",
          "6 个流量洼地锁定了——搜索热度在涨，但认真做的号还不多。",
          "content-gap.csv 已存，优先级按竞争密度排好了。"
        ]
      },
      {
        assign: "策划按洼地出 14 天选题日历和脚本。",
        lines: [
          "这几个洼地确实香。日历按粉丝活跃时段排：中午 12 点和晚 7 点半两档。",
          "14 天 8 条排好了，先出 3 条脚本初稿，钩子做了 A/B 两版。",
          "脚本和日历都存共享文件夹了。@销售顾问 发布节奏你过一下。"
        ]
      },
      {
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
      approveNote: "已通过：销售顾问按排期执行发布与评论区维护",
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
          "情报汇总.md 已存，@数据分析师 接着。"
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
      approveNote: "已通过：销售顾问继续执行",
      rejectNote: "已驳回：内容策划修订后重新提交"
    },
    stats: [["46", "有效信息"], ["12", "决策人线索"], ["2", "方案文档"], ["4", "执行项"]],
    summary: "任务完成：产出已归档至项目共享文件夹，执行项按优先级推进。"
  }
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

function buildTouchSubsteps(touchPlan) {
  const simulation = buildTouchSimulation(touchPlan);
  const count = simulation.candidates.length;
  return [
    {
      skill: "找人",
      role: "按来源发现候选并保留依据",
      executor: "本地模拟筛选",
      assign: `我先按${touchPlan.source.label}找人，只整理公开描述里的候选，不连接账号。`,
      lines: [
        `已根据${touchPlan.source.label}建立候选范围，目标是${touchPlan.audience}。`,
        `我先按${touchPlan.timeWindow}和${touchPlan.signal}筛第一批结果，重复项和无关互动不会进入名单。`,
        `找到 ${count} 位候选，每位都保留命中原因和待核验项，下一步交给我继续筛选。`
      ],
      completion: `我已找到 ${count} 位候选，来源、行为信号和待核验项都整理好了。`
    },
    {
      skill: "筛选",
      role: "核验信号并确定优先级",
      executor: "本地规则模拟",
      assign: "我会按需求意向、时间范围和关系类型去重，再把证据不足的候选单独标出来。",
      lines: [
        `筛选条件已应用：${touchPlan.filter}。`,
        `命中${touchPlan.intent}的候选优先保留，缺少明确渠道或需求信号的先标记待确认。`,
        `筛选完成：${simulation.selectedCount} 位进入首触预览，其余候选不会被自动触达。`
      ],
      completion: `我已完成候选筛选，${simulation.selectedCount} 位进入首触预览，未通过的候选已留在待核验区。`
    },
    {
      skill: "生成首触",
      role: "根据命中信号生成沟通草稿",
      executor: "本地文案模拟",
      assign: "我会只承接候选已经表达的需求，先生成一条可审核的首触草稿。",
      lines: [
        `我按${touchPlan.intent}生成一条${simulation.draft.channel}草稿，不添加价格、库存或优惠承诺。`,
        `草稿会解释为什么联系对方，并留一个轻量问题，不会连续追问。`,
        `首触草稿已生成：${simulation.draft.body}`
      ],
      completion: "我已完成首触草稿，下一步只等你确认候选和沟通内容。"
    },
    {
      skill: "确认触达",
      role: "展示候选与外部动作边界",
      executor: "前端审批卡",
      assign: "我把候选、命中依据和首触草稿放到审批卡里，你确认后才会推进本地模拟触达。",
      lines: [
        `当前候选：${simulation.candidates.map((candidate) => candidate.name).join("、")}。`,
        `下一步动作：${touchPlan.action}。`,
        "审批前不会发送任何消息；确认后只展示本地模拟结果和跟进建议。"
      ],
      completion: `我已准备好候选和${simulation.draft.title}，等待你确认 ${simulation.selectedCount} 位对象。`
    }
  ];
}

function applyTouchAudiencePlan(base, taskText) {
  const touchPlan = parseTouchRequest(taskText);
  if (!touchPlan) return base;
  const simulation = buildTouchSimulation(touchPlan);
  const waitingCount = simulation.outcomes.filter((item) => item.status === "等待回复").length;
  const repliedCount = simulation.outcomes.filter((item) => item.status === "已回复").length;
  const humanCount = simulation.outcomes.filter((item) => item.status === "待人工确认").length;
  const missingNote = touchPlan.missing.length
    ? `还缺少：${touchPlan.missing.join("、")}。`
    : "关键信息已识别，可以先看候选和触达草稿。";
  return {
    ...base,
    touchPlan,
    subs: buildTouchSubsteps(touchPlan),
    decompose: `我先把这次触达拆成来源、人群、行为信号、筛选条件和时间范围，再给你看一小组候选。${missingNote}整个过程先用本地模拟数据展示，不连接账号，也不会真的发消息。`,
    brief: {
      title: "触达目标确认",
      objective: `找到${touchPlan.audience}，依据${touchPlan.signal}筛出值得优先处理的人`,
      scope: `来源：${touchPlan.source.label}；时间：${touchPlan.timeWindow}；关系：${touchPlan.relationship}`,
      deliverable: "候选预览、筛选依据、首触草稿和模拟触达结果",
      guardrail: `只展示前端模拟，不连接账号、不发送消息、不修改客户记录。${missingNote}`,
      touchPlan
    },
    approval: {
      title: "模拟触达预览",
      body: `将按「${touchPlan.audience}」和「${touchPlan.filter}」展示候选，并生成对应的首触草稿。确认后只推进本地演示状态，不会发送任何外部消息。`,
      approveNote: "已确认：前端模拟触达完成，结果已整理在当前任务中",
      rejectNote: "已暂缓：候选和筛选条件保留，可继续修改目标"
    },
    stats: [[String(simulation.candidates.length), "找到候选"], [String(simulation.selectedCount), "首触草稿"], [String(repliedCount), "模拟回复"], [String(waitingCount + humanCount), "后续跟进"]],
    summary: `已完成${touchPlan.source.label}的找人、筛选和模拟触达：${simulation.candidates.length} 位候选，${simulation.selectedCount} 位进入首触，${repliedCount} 位模拟回复，${waitingCount + humanCount} 位进入后续跟进。`
  };
}

export function getDialogueScript(scriptKey, taskText = "") {
  return applyTouchAudiencePlan(applyBusinessPrompt(SCRIPTS[scriptKey] || SCRIPTS.generic, taskText), taskText);
}

export function getDialogueRuntimeDefinition(scriptKey, taskText = "") {
  const key = SCRIPTS[scriptKey] ? scriptKey : "generic";
  const script = getDialogueScript(key, taskText);
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
      : `${business.progress} 关键节点会再找你确认。你也可以点上方「去办公室看看」实时盯一下。`;
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
上海阿杰,SALES_QUALIFIED,周六下午可以到店,确认门店与试驾车型,销售顾问
小鹿要换车,ENGAGED,想看两款车落地价差,补充城市与预算,销售顾问
老周在杭州,CONTACT_READY,询问置换评估需要的资料,客户主动留资后转人工,销售顾问
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
- 数据分析师：评分与优先级
- 内容策划：话术与物料
- 销售顾问：触达执行与反馈回流

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
  // 档案名可能自带品牌前缀（如「SaleBuddy · 幕僚长」），消息署名会再加一次品牌名，这里剥掉
  return raw.replace(/^(?:SaleBuddy|Marvis|Byering)\s*[·\-—]\s*/i, "") || fallback;
}

/* ═══════════ 引擎：任务状态机 + 事件流（模块级，与视图生命周期解耦） ═══════════ */

const RUNS = new Map(); // taskId -> engine

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
  const activityAgents = [event.agentType, event.agentName].filter(Boolean);
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
  updateTask(engine.taskId, {
    ...patch,
    runtimeState: snapshot?.taskState || null,
    runtimeProgress: snapshot?.progress || 0,
    runtimeAgentId: engine.runtime?.agentRun?.agentId || null,
    runtimeAgentName: engine.runtime?.agentRun?.name || null,
    activeSkillId: snapshot?.activeSkill?.skillId || null,
    activeSkillName: snapshot?.activeSkill?.skill || null,
    runtimeEventSequence: engine.runtime?.events?.length || 0,
    runtimeEvents: engine.runtime?.events || [],
    runtimeSnapshot: snapshot || null
  });
}

function resultSnapshotFor(engine, event = {}) {
  const supplied = event.resultSnapshot || event.result || event.data?.resultSnapshot;
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

/** Simulate the external authorization handshake after requirement and assignment gates. */
function beginAccessAuthorization(engine) {
  if (engine.accessStage !== "required") return;
  engine.accessStage = "authorizing";
  emit(engine, {
    t: "auth-started",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    text: `正在打开${engine.accessSetup.provider}授权页，等待用户确认。`
  });
}

/** The cloud window calls this only after the user completes the simulated OAuth flow. */
function completeAccessAuthorization(engine) {
  if (engine.accessStage !== "authorizing") return;
  engine.accessStage = "scope";
  emit(engine, {
    t: "auth-granted",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    text: `已完成${engine.accessSetup.provider}登录，尚未开始读取数据。`
  });
  emit(engine, {
    t: "scope-required",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    scopes: engine.accessSetup.scopes,
    text: "请选择本次任务允许读取和执行的范围。"
  });
}

function cancelAccessAuthorization(engine, reason = "cancelled") {
  if (engine.accessStage !== "authorizing") return;
  engine.accessStage = "required";
  syncTask(engine, { status: "progress", preview: `等待${engine.accessSetup.provider}授权…` });
  emit(engine, {
    t: "auth-cancelled",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    reason,
    text: `云电脑授权未完成（${reason === "denied" ? "用户拒绝授权" : "窗口已关闭"}），任务保持暂停。`
  });
}

/** Confirm the least-privilege scope, then release the precomputed execution timeline. */
function confirmAccessScope(engine) {
  if (engine.accessStage !== "scope") return;
  engine.accessStage = "ready";
  emit(engine, {
    t: "scope-confirmed",
    provider: engine.accessSetup.provider,
    account: engine.accessSetup.account,
    scopes: engine.accessSetup.scopes,
    text: "授权范围已确认，任务可以按已确认的需求和分工开始。"
  });
  syncTask(engine, { status: "progress", preview: "访问范围已确认，幕僚长正在建立任务会话…" });
  const id = setTimeout(() => engine.scheduleTimeline?.(), Math.round(420 * DEMO_PACING));
  engine.timers.push(id);
}

/** Only a deliberate user action may release the requirement gate. */
export function isExplicitUserRequirementConfirmation(confirmation = {}) {
  return confirmation.actor === "user" && confirmation.action === "confirm";
}

/** Confirm the business requirement, then reveal the assignment plan before requesting access. */
function confirmRequirement(engine, confirmation = {}) {
  if (engine.accessStage !== "requirement") return;
  if (!isExplicitUserRequirementConfirmation(confirmation)) return;
  engine.accessStage = "required";
  emit(engine, {
    t: "requirement-confirmed",
    taskText: engine.taskText,
    brief: engine.script.brief,
    confirmation: {
      actor: "user",
      action: "confirm",
      channel: confirmation.channel || "requirement-card",
      confirmedAt: new Date().toISOString()
    },
    text: "需求已确认。幕僚长先按目标拆解技能和责任 Agent，再申请本次任务所需账号授权。"
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
}

function startEngine(engine) {
  if (engine.engineInitialized) return;
  engine.engineInitialized = true;
  const { script } = engine;
  const timeline = buildDemoTimeline({
    taskText: engine.taskText,
    online: engine.online,
    script,
    runtimeDefinition: engine.runtimeDefinition,
    projectMembers: engine.projectMembers
  });
  engine.demoTimeline = timeline;
  const later = (fn, ms) => { const id = setTimeout(fn, ms); engine.timers.push(id); };

  // Delays only pace a precomputed event source; they never decide a state transition.
  engine.scheduleTimeline = () => {
    if (engine.timelineStarted) return;
    engine.timelineStarted = true;
    timeline.forEach((event) => {
      // Requirement understanding and the brief are completed before authorization.
      // Do not repeat them when the authorized run timeline is released.
      const isPreparationHeader = event.t === "user"
        || event.t === "brief"
        || (event.t === "chief" && event.delayMs <= 1500);
      if (isPreparationHeader) return;
      later(() => deliverDemoEvent(event), Math.round(event.delayMs * DEMO_PACING));
    });
  };

  if (engine.accessStage === "ready") {
    engine.scheduleTimeline();
  } else {
    const hasEvent = (type) => engine.runtime.events.some((event) => event.t === type);
    if (!hasEvent("user")) emit(engine, { t: "user", text: engine.taskText, online: engine.online });

    if (engine.accessStage === "requirement") {
      syncTask(engine, { status: "progress", preview: "幕僚长正在理解需求…" });
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
        syncTask(engine, { status: "progress", preview: "幕僚长已理解需求，等待用户确认…" });
        emit(engine, {
          t: "requirement-required",
          taskText: engine.taskText,
          brief: script.brief,
          text: "请确认幕僚长对任务目标、数据范围、交付结果和停止边界的理解。"
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
      emit(engine, { t: "progress", pct: Math.min(88, 10 + Math.round(((event.i + ((event.lineIndex || 0) + 1) / script.subs[event.i].lines.length) / script.subs.length) * 78)) });
    }
    if (event.t === "sub-done") {
      const slot = MEMBER_SLOTS[event.i] || { type: event.agentType };
      pushActivity(slot.type, event.text || "已提交验收结果");
    }
    if (event.t === "sub-error" || event.t === "task-error") {
      endAllWork();
      syncTask(engine, { status: "failed", preview: event.text });
    }
    if (event.t === "task-blocked") {
      endAllWork();
      syncTask(engine, { status: "blocked", preview: event.text });
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

/** 审批决策（视图按钮调用）。 */
function decide(engine, ok, selectedIds = null) {
  if (!engine.approvalShown || engine.decision != null) return;
  engine.decision = ok;
  engine.touchSelection = Array.isArray(selectedIds) ? selectedIds : null;
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
  emit(engine, { t: "followup-user", text });
  const id = setTimeout(() => {
    emit(engine, { t: "followup-chief", text: followUpReply(text, engine) });
  }, Math.round((900 + Math.random() * 600) * DEMO_PACING));
  engine.timers.push(id);
}

function accessStageFromEvents(events = []) {
  for (const event of [...events].reverse()) {
    if (event.t === "scope-confirmed" || event.t === "run-started") return "ready";
    if (event.t === "scope-required" || event.t === "auth-granted") return "scope";
    if (event.t === "auth-started") return "authorizing";
    if (event.t === "auth-cancelled" || event.t === "auth-required" || event.t === "assignment-plan" || event.t === "requirement-confirmed") return "required";
    if (event.t === "requirement-required") return "requirement";
  }
  return "requirement";
}

/** 取任务引擎：不存在则创建并启动；已存在直接返回（重开对话不重跑）。 */
function ensureEngine({ taskId, taskText, projectId, projectName, projectMembers = [], teamLive, online = false, runtimeEvents = [], taskStatus = null, taskPreview = "" }) {
  if (taskId && RUNS.has(taskId)) return RUNS.get(taskId);
  const scriptKey = pickDialogueScript(taskText);
  const localTouchRequest = Boolean(parseTouchRequest(taskText));
  const runtimeOnline = localTouchRequest ? false : Boolean(online);
  const runtimeDefinition = getDialogueRuntimeDefinition(scriptKey, taskText);
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
  const hasPersistedEvents = Array.isArray(runtimeEvents) && runtimeEvents.length > 0;
  if (hasPersistedEvents) replayRuntimeEvents(runtime, runtimeEvents);
  const engine = {
    taskId: taskId || null,
    taskText,
    projectId,
    projectName,
    projectMembers,
    teamLive,
    online: runtimeOnline,
    scriptKey,
    script: getDialogueScript(scriptKey, taskText),
    accessSetup: getDemoAccessSetup(scriptKey),
    accessStage: hasPersistedEvents ? accessStageFromEvents(runtime.events) : "requirement",
    runtimeDefinition,
    runtime,
    events: runtime.events,
    listeners: new Set(),
    timers: [],
    approvalShown: false,
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
  const pv = { bubble: null, card: null, status: null, statusText: null, bar: null, clock: null, progress: null, summary: null, detail: null, toggle: null, progressExpanded: true, progressUserToggled: false, recoveryCard: null, resultCard: null, resultFiles: null, resultSummary: null, progressFiles: null, subs: [] };
  const av = { authCard: null, authTag: null, authButton: null, authWindow: null, scopeCard: null, scopeTag: null, scopeButton: null, requirementCard: null, requirementTag: null, requirementButton: null, requirementEditButton: null, requirementActions: null, assignmentCard: null };

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
    head.append(headMain, toggle);
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

  function markRunFinished() {
    if (!pv.status) return;
    pv.status.classList.remove("sb-accepted", "sb-on", "sb-thinking", "sb-error");
    pv.status.classList.add("sb-done");
    pv.statusText.textContent = "已完成";
    updateProgressSummary("已完成", "所有步骤已完成，结果正在整理");
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

  function showApprovalBox(instant) {
    if (pv.approvalBox) return;
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
    body.innerHTML = `<b>${script.approval.title}</b><br>${script.approval.body}`; // 内容全部来自本文件内置剧本
    const touchPreview = script.touchPlan ? buildTouchPreview(script.touchPlan) : null;
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
    const approve = el("button", "sb-run-btn sb-primary", script.touchPlan ? "确认模拟触达" : "确认执行");
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
    if (av.authCard) return;
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
    const button = el("button", "sb-run-btn sb-primary sb-access-action", "打开云电脑并授权");
    button.type = "button";
    button.addEventListener("click", () => beginAccessAuthorization(engine));
    actions.appendChild(button);
    card.appendChild(actions);
    bubble.appendChild(card);
    av.authCard = card;
    av.authTag = tag;
    av.authButton = button;
    toBottom();
  }

  function markAccessStarted() {
    if (!av.authCard) return;
    av.authTag.textContent = "授权中";
    av.authButton.disabled = true;
    av.authButton.textContent = "云电脑已打开，等待登录…";
  }

  function openAccessWindow(setup) {
    if (av.authWindow) return;
    av.authWindow = openDouyinAuthorization({
      account: setup.account,
      scopes: setup.scopes,
      onAuthorized: () => {
        av.authWindow = null;
        completeAccessAuthorization(engine);
      },
      onCancelled: ({ reason } = {}) => {
        av.authWindow = null;
        cancelAccessAuthorization(engine, reason || "cancelled");
      }
    });
  }

  function markAccessCancelled() {
    if (!av.authCard) return;
    av.authCard.classList.remove("sb-access-resolved");
    av.authTag.textContent = "未授权";
    av.authButton.disabled = false;
    av.authButton.textContent = "重新打开云电脑";
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

  function buildTouchPlanCard(plan) {
    const box = el("section", "sb-touch-plan");
    const head = el("div", "sb-touch-plan-head");
    head.append(el("div", "sb-touch-plan-title", "触达目标拆解"), el("span", "sb-touch-plan-tag", "本地识别"));
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

  function showRequirementCard(brief, taskText, instant) {
    if (av.requirementCard) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("section", "sb-access-card sb-checkpoint");
    card.setAttribute("data-sb-checkpoint", "requirement");
    card.setAttribute("data-sb-checkpoint-key", `${engine.taskId || "task"}:requirement`);
    card.setAttribute("aria-label", "确认任务需求");
    card.setAttribute("aria-live", "polite");
    const title = el("div", "sb-access-title");
    title.append(el("span", null, "请确认幕僚长的需求理解"));
    const tag = el("span", "sb-access-tag", "待确认");
    title.appendChild(tag);
    card.appendChild(title);
    card.appendChild(el("div", "sb-access-copy", "请核对下面的理解是否准确。在你主动确认前，Byering 不会安排 Agent、不会打开账号登录，也不会读取任何业务数据。"));
    if (brief?.touchPlan) card.appendChild(buildTouchPlanCard(brief.touchPlan));
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
    av.requirementCard.appendChild(el("div", "sb-access-note", "需求已锁定，幕僚长正在拆解任务并安排责任 Agent。"));
  }

  function showAssignmentPlan(assignments = [], text = "", instant = false) {
    if (av.assignmentCard) return;
    const bubble = agentMsg(chief, { instant, avatarValue: "main" });
    const card = el("div", "sb-assignment-card");
    const title = el("div", "sb-assignment-title");
    title.append(el("span", null, "任务拆解与责任分工"), el("span", "sb-assignment-tag", "已安排"));
    card.appendChild(title);
    card.appendChild(el("div", "sb-assignment-copy", text || "幕僚长已根据确认后的需求完成分工。"));
    const list = el("div", "sb-assignment-list");
    assignments.forEach((assignment, index) => {
      const row = el("div", "sb-assignment-row");
      const avatar = el("div", "sb-assignment-avatar", assignment.agentName?.slice(0, 1) || "?");
      mountAgentAvatar(avatar, assignment.agentName, { alt: `${assignment.agentName || "数字员工"}头像` });
      const main = el("div", "sb-assignment-main");
      main.append(el("span", "sb-assignment-skill", `${index + 1}. ${assignment.skill}`), el("span", "sb-assignment-role", assignment.role));
      row.append(avatar, main, el("span", "sb-assignment-owner", assignment.agentName));
      row.appendChild(el("div", "sb-assignment-executor", `完成标准：${assignment.acceptance}`));
      list.appendChild(row);
    });
    card.appendChild(list);
    card.appendChild(el("div", "sb-assignment-note", "分工只建立计划，不会触发账号登录、数据读取或对外动作。下一步由你完成授权。"));
    bubble.appendChild(card);
    av.assignmentCard = card;
    toBottom();
  }

  function markApprovalResolved(ok) {
    if (!pv.approvalBox) return;
    pv.approvalBox.classList.add("sb-resolved");
    pv.approvalBtns?.remove();
    pv.approvalBox.appendChild(el("div", "sb-run-appresult", ok ? `✓ ${script.approval.approveNote}` : `↩ ${script.approval.rejectNote}`));
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
    headCopy.append(el("div", "sb-result-title", "任务完成"), el("div", "sb-result-copy", cleanEmployeeText(script.summary)));
    head.appendChild(headCopy);
    card.appendChild(head);
    if (script.touchPlan) card.appendChild(buildTouchOutcomeCard(script.touchPlan));
    const stats = el("div", "sb-run-stats");
    for (const [num, label] of (script.stats || []).slice(0, script.touchPlan ? 4 : 3)) {
      const s = el("div", "sb-run-stat");
      s.append(el("div", "sb-run-statnum", num), el("div", "sb-run-statlabel", label));
      stats.appendChild(s);
    }
    if (stats.childElementCount) card.appendChild(stats);
    const files = el("div", "sb-result-files");
    card.appendChild(files);
    const actions = el("div", "sb-result-actions");
    const goOffice = el("button", "sb-run-btn sb-primary", "去办公室看看");
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
      pv.recoveryCard.querySelector(".sb-recovery-copy")?.replaceChildren(document.createTextNode(text));
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
    for (const [label, value] of (options.actions || [["补充信息", "请补充任务信息："], ["修改范围", "请调整任务范围："], ["交给人工", "请将这项任务交给人工处理。"]])) {
      const button = el("button", "sb-run-btn sb-ghost", label);
      button.type = "button";
      button.addEventListener("click", () => { input.value = value; input.placeholder = "补充信息或安排下一步处理…"; input.focus(); });
      actions.appendChild(button);
    }
    card.appendChild(actions);
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
    const bubble = agentMsg(who, { typing: !instant, instant, avatarValue: who, messageClass });
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
        setAgentActivity("main", "分派中");
        showAssignmentPlan(event.assignments || [], event.text, instant);
        break;
      case "auth-required":
        showAccessRequired(engine.accessSetup, instant);
        break;
      case "auth-started":
        markAccessStarted();
        if (!instant || engine.accessStage === "authorizing") openAccessWindow(engine.accessSetup);
        break;
      case "auth-granted":
        if (av.authCard) {
          av.authCard.classList.add("sb-access-resolved");
          av.authTag.textContent = "已授权";
          av.authButton.remove();
          av.authCard.appendChild(el("div", "sb-access-note", "登录已完成，但还没有读取任何数据。"));
        }
        break;
      case "scope-required":
        showAccessScope(engine.accessSetup, instant);
        break;
      case "scope-confirmed":
        markScopeConfirmed();
        break;
      case "requirement-required":
        setAgentActivity("main", "等待确认");
        showRequirementCard(event.brief || engine.script.brief, event.taskText || engine.taskText, instant);
        break;
      case "requirement-confirmed":
        setAgentActivity("main", "拆解中");
        markRequirementConfirmed();
        break;
      case "auth-cancelled":
        markAccessCancelled();
        showRecoveryCard("授权还没有完成", event.text, instant, { preserved: "数据读取尚未开始，任务仍然安全暂停", actions: [["重新打开授权", "请重新打开授权窗口："], ["交给人工", "请将这项任务交给人工处理。"]] });
        updateProgressSummary("待授权", "数据读取尚未开始");
        break;
      case "run-started":
        setAgentActivity("main", "理解中");
        updateProgressSummary("理解中", "幕僚长正在确认目标、范围和交付边界");
        break;
      case "chief": {
        if (instant) {
          agentMsg(chief, { instant: true, avatarValue: "main" }).textContent = event.text;
        } else {
          const bubble = agentMsg(chief, { typing: true, avatarValue: "main" });
          const id = setTimeout(() => { bubble.textContent = event.text; toBottom(); }, DEMO_REVEAL_MS.chief);
          viewTimers.push(id);
        }
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
      case "sub-start": {
        const agentName = event.agentName || memberOf();
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
        if (c) {
          if (c.sub.style.display === "none") { // 历史事件缺少接收节点时，首条回报也要补齐状态轨迹
            revealSub(c, "已开始任务");
            addSubEvent(c, "已开始", "sb-active");
          }
          c.count += 1;
          c.barI.style.width = `${Math.round((c.count / script.subs[event.i].lines.length) * 100)}%`;
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
        // 成员发言：像群聊一样用自己的气泡说话（实时带 typing，重放直接落字）
        const speaker = event.agentName || memberOf();
        const dialogue = getEmployeeDialogue("progress", {
          agentName: speaker,
          skill: trace.skill,
          role: trace.role,
          text: event.text,
          index: event.i,
          lineIndex: event.lineIndex
        });
        const evidenceMeta = (event.evidence || []).map((item) => `工作依据 · ${item.label || item.ref}`);
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
        const speaker = event.agentName || memberOf();
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
        showRecoveryCard("这一步需要你来接手", cleanEmployeeText(event.text), instant, { actions: [["补充信息", "请补充人工处理要求："], ["交给人工", "请将这项任务交给人工处理。"]] });
        break;
      case "task-error":
        showRecoveryCard("任务先暂停一下", cleanEmployeeText(event.text), instant);
        updateProgressSummary("已暂停", "任务遇到问题，等待你的处理");
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
        showApprovalBox(instant);
        if (engine.decision != null) markApprovalResolved(engine.decision); // 重放时已决策
        break;
      case "approval-resolved":
        engine.touchSelection = Array.isArray(event.selectedIds) ? event.selectedIds : engine.touchSelection;
        markApprovalResolved(event.ok);
        break;
      case "touch-sent":
        updateProgressSummary("已模拟触达", "候选状态已更新，未发送任何外部消息");
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
      case "followup-chief": {
        if (instant) {
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

  const renderLive = (event) => renderEvent(event, false);

  // 重放历史 + 订阅增量
  let input = null;
  for (const event of engine.events) renderEvent(event, true);
  engine.listeners.add(renderLive);
  if (!engine.engineInitialized) startEngine(engine);

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
    online: task.online === true,
    runtimeEvents: task.runtimeEvents || [],
    taskStatus: task.status,
    taskPreview: task.preview
  });
  openConversation(engine);
}

/** Start a task from an independently executable skill in the toolbox. */
export async function startSkillTask({ name, prompt, teamLive = null, gateway = null } = {}) {
  const context = taskRunnerContext || { teamLive, gateway };
  if (!context.teamLive && !teamLive) return false;
  const project = await currentProject(context.gateway || gateway);
  const taskText = prompt || `请执行技能：${name || "未命名技能"}`;
  const projectMembers = project.members || [];
  const taskId = addTask({
    title: name || taskText.slice(0, 40),
    projectId: project.id,
    projectName: project.name,
    projectMembers,
    taskText,
    online: false
  });
  const engine = ensureEngine({
    taskId,
    taskText,
    projectId: project.id,
    projectName: project.name,
    projectMembers,
    teamLive: context.teamLive || teamLive,
    online: false
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
    submitting = true;
    try {
      clearEditor(editor);
      const project = await currentProject(gateway);
      const projectId = project.id;
      const projectName = project.name;
      const title = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      const optionInput = editor.closest?.(".semi-aiChatInput");
      const online = !parseTouchRequest(text) && (optionInput?.dataset.sbOnline === "true" || onlineEnabled);
      const projectMembers = project.members || [];
      const taskId = addTask({ title, projectId, projectName, projectMembers, taskText: text, online });
      const engine = ensureEngine({ taskId, taskText: text, projectId, projectName, projectMembers, teamLive, online });
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
  console.log("[SaleBuddy] 任务模拟运行（对话式·引擎解耦）已接管首页提交");

  return {
    unmount() {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("click", onClick, true);
      document.removeEventListener("salebuddy:input-options", onInputOptions);
      if (taskRunnerContext?.teamLive === teamLive) taskRunnerContext = null;
    }
  };
}
