import { el, openPage } from "./pages.js";
import { mountPersonAvatar } from "./person-avatar.js";
import { receptionRequest, receptionBaseUrl } from "../bridge/account-reception-client.js";
import { normalizeReception, receptionWindow, RECEPTION_ROLES, RECEPTION_ROLE_DETAILS, RECEPTION_GOALS } from "../agents/account-reception.js";
import { inboxStrategyStore } from "../agents/inbox-strategy-store.js";
import { markReceptionConfigured } from "./account-reception-config-state.js";
import { BUSINESS_MATERIAL_ACCEPT, BUSINESS_MATERIAL_MAX_CHARS, readBusinessMaterialFile } from "./business-material-import.js";

const CSS = `
.sb-reception{max-width:1000px;margin:0 auto;padding:24px 28px 56px;color:#292f35;letter-spacing:0;font-size:14px}
.sb-reception.sb-reception-empty-workspace{box-sizing:border-box;max-width:none;min-height:100%;margin:0;padding:24px 30px 34px}
.sb-reception-empty-workspace .sb-reception-empty{display:grid;min-height:calc(100dvh - 118px);max-width:none;place-items:center;overflow:hidden;margin:0;padding:48px 24px;border:1px solid #e4e9f0;border-radius:16px;background:#fff}
.sb-reception-empty-workspace .sb-reception-empty-inner{display:grid;justify-items:center;gap:12px;max-width:360px;text-align:center}.sb-reception-empty-workspace .sb-reception-empty-art{display:grid;place-items:center;width:86px;height:78px;margin-bottom:4px}.sb-reception-empty-workspace .sb-reception-empty-art img{display:block;width:72px;height:72px;object-fit:contain}.sb-reception-empty-workspace .sb-reception-empty-eyebrow{display:block;margin:0;color:#7d8791;font-size:11px;font-weight:600;letter-spacing:.06em}.sb-reception-empty-workspace .sb-reception-empty-copy{display:grid;gap:4px}.sb-reception-empty-workspace .sb-reception-empty-copy strong{display:block;margin:0;color:#27313d;font-size:17px;font-weight:680;letter-spacing:0;line-height:1.35}.sb-reception-empty-workspace .sb-reception-empty-copy span{display:block;margin:0;color:#7a858f;font-size:12px;line-height:1.7}.sb-reception-empty-workspace .sb-reception-empty-actions{gap:8px;margin-top:6px}.sb-reception-empty-workspace .sb-reception-empty-action{min-height:38px!important;margin:0!important;padding:0 15px!important;border:1px solid #2f6fd3!important;border-radius:8px!important;background:#2f6fd3!important;color:#fff!important;font-size:12px!important;font-weight:650!important;box-shadow:none!important;transition:background 140ms ease,transform 140ms ease}.sb-reception-empty-workspace .sb-reception-empty-action:hover{background:#245fba!important;transform:translateY(-1px)}.sb-reception-empty-workspace .sb-reception-empty-action.is-secondary{border-color:#ccd5df!important;background:#fff!important;color:#3c5875!important}.sb-reception-empty-workspace .sb-reception-empty-action.is-secondary:hover{background:#f5f8fb!important}.sb-reception-empty-workspace .sb-reception-empty-footnote{display:block;margin:0!important;color:#99a3ad!important;font-size:11px!important;line-height:18px!important}
.sb-reception *{box-sizing:border-box}.sb-reception button,.sb-reception input,.sb-reception textarea,.sb-reception select{font:inherit}
	.sb-reception-head{display:flex;align-items:center;gap:14px;padding:0 0 20px;border-bottom:1px solid #e4e7e9}.sb-reception-account-picker{position:relative;width:min(100%,420px);container-type:inline-size}.sb-reception-account-trigger{display:grid!important;grid-template-columns:44px minmax(0,1fr) auto;gap:11px;align-items:center;width:100%;min-height:68px!important;padding:11px 13px!important;border:1px solid #dce4eb!important;border-radius:12px!important;background:#fff!important;box-shadow:0 1px 2px rgba(34,48,64,.035);color:#29323a!important;text-align:left;transition:border-color .15s,box-shadow .15s,background .15s}.sb-reception-account-picker:not(.has-options) .sb-reception-account-trigger{grid-template-columns:44px minmax(0,1fr)}.sb-reception-account-picker.has-options .sb-reception-account-trigger{cursor:pointer}.sb-reception-account-picker.has-options .sb-reception-account-trigger:hover{border-color:#adc3df!important;box-shadow:0 5px 16px rgba(39,67,100,.08)}.sb-reception-account-picker.is-open .sb-reception-account-trigger{border-color:#7da3d8!important;box-shadow:0 0 0 3px rgba(47,128,237,.11),0 5px 16px rgba(39,67,100,.08)}.sb-reception-account-trigger:focus-visible{outline:2px solid #2f80ed;outline-offset:3px}.sb-reception-account-trigger:disabled{cursor:default}.sb-reception-account-action{display:inline-flex!important;align-items:center;gap:6px;min-height:30px!important;padding:4px 0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#58749d!important;font-size:12px!important;font-weight:650!important;white-space:nowrap}.sb-reception-account-action:hover{color:#2f5f9d!important}.sb-reception-account-action:focus-visible{outline:2px solid #2f80ed;outline-offset:3px}.sb-reception-account-action-mark{font-size:18px;font-weight:350;line-height:1}.sb-reception-account-avatar{position:relative;display:grid;width:44px;height:44px;place-items:center;overflow:hidden;border-radius:12px;background:#eef2f5;color:#586774;font-size:14px;font-weight:720;line-height:1}.sb-reception-account-avatar[data-avatar-fallback="true"]{color:transparent;background:#eef4fc}.sb-reception-account-avatar[data-avatar-fallback="true"]:before{position:absolute;top:10px;width:10px;height:10px;border-radius:50%;background:#5679aa;content:""}.sb-reception-account-avatar[data-avatar-fallback="true"]:after{position:absolute;bottom:9px;width:20px;height:10px;border-radius:11px 11px 7px 7px;background:#5679aa;content:""}.sb-reception-account-avatar img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover}.sb-reception-account-copy{display:grid;gap:3px;min-width:0}.sb-reception-account-label{display:flex;align-items:center;gap:6px;color:#84919e;font-size:11px;font-weight:650;line-height:15px}.sb-reception-account-mock{display:inline-flex;align-items:center;height:15px;padding:0 4px;border:1px solid #d6e1f3;border-radius:4px;background:#f1f5fb;color:#5f76a0;font-size:8px;font-style:normal;font-weight:750;letter-spacing:.04em;line-height:1}.sb-reception-account-identity{display:grid;gap:2px;min-width:0;color:#303941}.sb-reception-account-identity strong{min-width:0;overflow:hidden;font-size:15px;font-weight:700;line-height:19px;text-overflow:ellipsis;white-space:nowrap}.sb-reception-account-identity span{min-width:0;overflow:hidden;color:#89949f;font-size:12px;line-height:17px;text-overflow:ellipsis;white-space:nowrap}.sb-reception-account-chevron{width:8px;height:8px;margin:0 3px 3px 0;border-right:1.5px solid #71808c;border-bottom:1.5px solid #71808c;transform:rotate(45deg);transition:transform .15s}.sb-reception-account-picker.is-open .sb-reception-account-chevron{transform:translateY(3px) rotate(225deg)}.sb-reception-account-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:12;width:100%;padding:6px;border:1px solid #dce4ec;border-radius:12px;background:#fff;box-shadow:0 14px 32px rgba(30,43,58,.14)}.sb-reception-account-option{display:grid!important;grid-template-columns:34px minmax(0,1fr) 16px;gap:10px;align-items:center;width:100%;min-height:56px!important;padding:9px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:#34404a!important;text-align:left}.sb-reception-account-option:hover{background:#f4f7fb!important}.sb-reception-account-option.is-selected{background:#edf4ff!important}.sb-reception-account-option-avatar{position:relative;display:grid;width:34px;height:34px;place-items:center;overflow:hidden;border-radius:10px;background:#edf1f5;color:#596975;font-size:12px;font-weight:720}.sb-reception-account-option-avatar[data-avatar-fallback="true"]{color:transparent;background:#eef4fc}.sb-reception-account-option-avatar[data-avatar-fallback="true"]:before{position:absolute;top:8px;width:8px;height:8px;border-radius:50%;background:#5679aa;content:""}.sb-reception-account-option-avatar[data-avatar-fallback="true"]:after{position:absolute;bottom:7px;width:16px;height:8px;border-radius:9px 9px 6px 6px;background:#5679aa;content:""}.sb-reception-account-option-avatar img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover}.sb-reception-account-option-copy{display:grid;gap:2px;min-width:0}.sb-reception-account-option-copy strong{overflow:hidden;color:#35404a;font-size:13px;font-weight:680;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.sb-reception-account-option-copy span{overflow:hidden;color:#89949d;font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}.sb-reception-account-option-check{color:#2f80ed;font-size:15px;font-weight:750;text-align:center}
	@container (max-width:210px){.sb-reception-account-label,.sb-reception-account-identity span{display:none}.sb-reception-account-copy{gap:0}.sb-reception-account-picker:not(.has-options) .sb-reception-account-trigger{grid-template-columns:44px minmax(0,1fr)}.sb-reception-account-identity strong{font-size:13px;line-height:18px}}
	@container (max-width:150px){.sb-reception-account-picker:not(.has-options) .sb-reception-account-trigger{grid-template-columns:44px}.sb-reception-account-copy{display:none}}
.sb-reception-notice{display:flex;align-items:flex-start;gap:10px;margin:18px 0 4px;padding:12px 14px;border:1px solid #f0d9a8;border-radius:8px;background:#fffaf0;color:#7b5b21;line-height:1.55}.sb-reception-notice strong{font-size:13px}.sb-reception-notice p{margin:2px 0 0;color:#8b6d38;font-size:12px}
	.sb-reception select,.sb-reception input:not([type=checkbox]):not([type=radio]),.sb-reception textarea{border:1px solid #d7dde1;border-radius:6px;background:#fff;color:#343b42;padding:9px 10px;min-width:0;max-width:100%}.sb-reception textarea{width:100%;resize:vertical;line-height:1.6}.sb-reception h2{font-size:20px;margin:22px 0 14px}.sb-reception h3{font-size:15px;margin:12px 0}.sb-reception p{line-height:1.65}.sb-reception label{color:#4b555e}
.sb-reception-material-import{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px}.sb-reception-material-import button{min-height:34px;padding:7px 11px;border-color:#9bb9e9;background:#f7fbff;color:#356bb7;font-size:12px}.sb-reception-material-import small{color:#8b969e;font-size:11px;line-height:18px}.sb-reception-material-preview{display:grid;gap:10px;margin-top:10px;padding:12px;border:1px solid #cddcf2;border-radius:8px;background:#f7faff}.sb-reception-material-preview header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.sb-reception-material-preview header strong{color:#354b66;font-size:12px;line-height:18px}.sb-reception-material-preview header span{color:#7d8da2;font-size:11px;line-height:18px}.sb-reception-material-preview header button{min-height:0;padding:0;border:0;background:transparent;color:#7d8da2;font-size:11px}.sb-reception-material-preview textarea{min-height:140px;border-color:#cdd9e8;font-size:12px}.sb-reception-material-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sb-reception-material-actions button{min-height:34px}.sb-reception-material-actions button.primary{border-color:#282e34;background:#282e34;color:#fff}.sb-reception-material-error{margin:8px 0 0;color:#ab4242;font-size:12px;line-height:18px}
.sb-reception-personas{border:0;padding:0;margin:0;min-width:0}.sb-reception-personas legend{margin-bottom:5px;color:#59636c;font-size:13px}.sb-reception-personas>p{margin:0 0 12px;color:#7c8791;font-size:12px;line-height:1.6}.sb-reception-personas>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sb-reception-persona{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;min-height:78px;padding:12px;border:1px solid #dbe2e4;border-radius:8px;background:#fff;cursor:pointer;transition:background .15s,border-color .15s}.sb-reception-persona:hover{border-color:#8aaee8;background:#fbfdff}.sb-reception-persona:has(input:checked){border-color:#2f80ed;background:#f7fbff}.sb-reception-persona-copy{display:grid;gap:4px;min-width:0}.sb-reception-persona-copy strong{color:#35404a;font-size:13px;line-height:1.35}.sb-reception-persona-copy span{color:#7d8893;font-size:11px;line-height:1.55}
.sb-reception-custom-persona{display:grid;gap:12px;margin-top:12px;padding:14px;border:1px solid #d8e3f2;border-radius:8px;background:#f8fbff}.sb-reception-custom-persona>p{margin:0;color:#62748b;font-size:12px;line-height:1.6}.sb-reception-custom-persona-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sb-reception-custom-persona .sb-reception-field{gap:6px}.sb-reception-custom-persona textarea{min-height:82px}.sb-reception-custom-persona .sb-reception-field:last-child{grid-column:1 / -1}
.sb-reception-columns{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:32px;align-items:start}.sb-reception-section{border-bottom:1px solid #e0e5e8;padding:8px 0 14px}.sb-reception-section>summary{display:grid;grid-template-columns:1fr auto;gap:8px;cursor:pointer;list-style:none;min-height:48px;align-items:center}.sb-reception-section>summary::-webkit-details-marker{display:none}.sb-reception-section>summary:after{content:'+';grid-column:2;grid-row:1 / 3;font-size:20px;color:#7b8991}.sb-reception-section[open]>summary:after{content:'−'}.sb-reception-section>summary small{grid-column:1;font-size:12px;color:#7b8991;line-height:1.5;overflow-wrap:anywhere}.sb-reception-fields{display:grid;gap:14px;padding:16px 0}.sb-reception-field{display:grid;gap:7px;font-size:13px}.sb-reception-options{border:0;padding:0;margin:0;min-width:0}.sb-reception-options legend{margin-bottom:10px;font-size:13px;color:#59636c}.sb-reception-options>div{display:flex;gap:8px;flex-wrap:wrap}.sb-reception-option{display:flex;align-items:center;border:1px solid #dbe2e4;background:#fff;border-radius:6px;padding:9px 10px;font-size:13px;cursor:pointer;transition:background .15s,border-color .15s}.sb-reception-option:hover{border-color:#8aaee8;background:#fff}.sb-reception-option:has(input:checked){background:#f7fbff;border-color:#2f80ed}.sb-reception input[type=checkbox]{accent-color:#2f80ed;width:16px;height:16px;margin:0;flex:none}.sb-reception input[type=radio]{position:absolute;width:1px;height:1px;margin:-1px;clip-path:inset(50%);opacity:0;pointer-events:none}.sb-reception-option:has(input:focus-visible),.sb-reception-persona:has(input:focus-visible){outline:2px solid #2f80ed;outline-offset:2px}.sb-reception-toggle{display:flex;gap:9px;align-items:center;font-size:13px;line-height:1.5}.sb-reception-time{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sb-reception-time input{width:110px}.sb-reception button{border:1px solid #dbe2e5;border-radius:6px;padding:8px 12px;background:#fff;color:#48525b;cursor:pointer;min-height:36px}.sb-reception button.primary{background:#282e34;color:#fff;border-color:#282e34}.sb-reception button:disabled{opacity:.5;cursor:not-allowed}.sb-reception-save{display:flex;align-items:center;gap:12px;padding:20px 0;flex-wrap:wrap}.sb-reception-save button{min-height:42px}.sb-reception-status{font-size:12px;color:#6e7e74}.sb-reception-error{color:#ab4242;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.sb-reception-trial{position:sticky;top:16px;border:1px solid #e1e6e9;border-radius:8px;background:#fff;padding:16px}.sb-reception-trial h3{margin-top:0}.sb-reception-trial small{color:#7d8990;font-size:12px}.sb-reception-chat{min-height:150px;max-height:380px;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:14px 0}.sb-reception-bubble{padding:10px 12px;border-radius:8px;background:#f1f3f5;font-size:13px;line-height:1.65;max-width:95%;white-space:pre-wrap;overflow-wrap:anywhere}.sb-reception-bubble.is-user{align-self:flex-end;background:#e8e8e8}.sb-reception-trial select,.sb-reception-trial textarea{width:100%;margin-bottom:10px}.sb-reception-trial-actions{display:flex;justify-content:space-between;gap:8px}.sb-reception-conversation{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid #e7ebed}.sb-reception-conversation>div{min-width:0}.sb-reception-conversation p{font-size:13px;color:#77858d;margin:5px 0;overflow-wrap:anywhere}.sb-reception-actions{display:flex;gap:6px;flex-wrap:wrap}.sb-reception-conversation strong{font-size:14px}
.sb-reception-empty{max-width:640px;margin:76px auto 0;padding:0 18px 32px;text-align:center}.sb-reception-empty-mark{position:relative;display:grid;width:74px;height:74px;place-items:center;margin:0 auto 22px;border:1px solid #dbe5f5;border-radius:24px;background:#f3f7ff;color:#386fe4;font-size:25px;font-weight:750;box-shadow:0 14px 34px rgba(55,103,189,.1)}.sb-reception-empty-mark:after{position:absolute;right:-6px;bottom:-6px;width:18px;height:18px;border:4px solid #fff;border-radius:50%;background:#48bd86;content:""}.sb-reception-empty h2{margin:0;color:#242b33;font-size:26px;line-height:36px;font-weight:700}.sb-reception-empty>p{max-width:470px;margin:10px auto 0;color:#737d88;font-size:14px;line-height:23px}.sb-reception-empty-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:34px 0 26px;text-align:left}.sb-reception-empty-step{position:relative;display:grid;gap:5px;min-width:0;padding:0 17px}.sb-reception-empty-step:first-child{padding-left:0}.sb-reception-empty-step:not(:last-child):after{position:absolute;top:14px;right:0;width:1px;height:24px;background:#e7ebef;content:""}.sb-reception-empty-step b{display:grid;width:28px;height:28px;place-items:center;border-radius:9px;background:#eef3fb;color:#4c6f9d;font-size:12px}.sb-reception-empty-step strong{color:#3a424b;font-size:13px;line-height:18px}.sb-reception-empty-step span{color:#98a1aa;font-size:11px;line-height:17px}.sb-reception-empty-action{min-height:46px!important;padding:0 20px!important;border-color:#242b33!important;border-radius:10px!important;background:#242b33!important;color:#fff!important;font-size:14px!important;font-weight:700!important;box-shadow:0 8px 18px rgba(31,35,41,.16)}.sb-reception-empty-action:hover{background:#39424c!important}.sb-reception-empty-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.sb-reception-empty-action.is-secondary{border-color:#ccd5df!important;background:#fff!important;color:#3c5875!important;box-shadow:none}.sb-reception-empty-action.is-secondary:hover{background:#f5f8fb!important}.sb-reception-empty-footnote{margin-top:12px!important;color:#9aa2aa!important;font-size:11px!important;line-height:18px!important}
@media(max-width:840px){.sb-reception-columns{grid-template-columns:1fr}.sb-reception-trial{position:static}.sb-reception{padding:18px 16px 36px}.sb-reception-conversation{align-items:flex-start;flex-direction:column}}
@media(max-width:560px){.sb-reception-head{align-items:flex-start;flex-direction:column;gap:8px}.sb-reception-account-picker{width:100%}.sb-reception-empty{margin-top:44px;padding:0 4px 26px}.sb-reception.sb-reception-empty-workspace{padding:18px 16px 24px}.sb-reception-empty-workspace .sb-reception-empty{min-height:calc(100dvh - 102px);padding:38px 20px}.sb-reception-empty h2{font-size:23px}.sb-reception-empty-steps{gap:12px}.sb-reception-empty-step{padding:0 8px}.sb-reception-empty-step:first-child{padding-left:0}.sb-reception-empty-step:not(:last-child):after{display:none}.sb-reception-empty-step strong{font-size:12px}.sb-reception-empty-step span{font-size:10px}.sb-reception-personas>div{grid-template-columns:1fr}}

.sb-reception:not(.sb-reception-embedded){max-width:1320px;padding:28px 30px 64px}
.sb-reception-account-bar{display:flex;grid-area:account;align-items:center;justify-content:flex-start;gap:10px;min-width:0;padding:0 0 2px}.sb-reception-account-bar .sb-reception-account-picker{width:min(100%,380px);min-width:240px}.sb-reception-account-bar .sb-reception-account-trigger{min-height:54px!important;padding:7px 10px!important;border-color:#e4e8ed!important;border-radius:8px!important;box-shadow:none!important}.sb-reception-account-bar .sb-reception-account-action{min-height:34px!important;color:#2468d8!important}
.sb-reception-columns{grid-template-columns:minmax(0,1fr) 318px;grid-template-areas:"account ." "main trial";column-gap:20px;row-gap:16px;align-items:start}.sb-reception-strategy-editor{grid-area:main;display:grid;gap:16px;min-width:0}.sb-reception-editor-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:0 0 17px;border-bottom:1px solid #eef0f2}.sb-reception-editor-head h2{margin:0;color:#171b20;font-size:18px;font-weight:720}.sb-reception-editor-head p{margin:5px 0 0;color:#848d96;font-size:12px;line-height:1.6}.sb-reception-editor-head span{color:#2468d8;font-size:11px;font-weight:700;white-space:nowrap}
.sb-reception-section{padding:0;border-bottom:1px solid #eef0f2}.sb-reception-section:last-of-type{border-bottom:0}.sb-reception-section>summary{grid-template-columns:34px minmax(0,1fr) auto;gap:12px;min-height:82px;padding:0;transition:background .15s}.sb-reception-section>summary:hover{background:#fbfcfd}.sb-reception-section>summary:after{grid-column:3;grid-row:1 / 3;margin-right:5px;color:#8b96a1;font-size:18px}.sb-reception-section-index{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;background:#f0f4fb;color:#2468d8;font-size:10px;font-weight:780}.sb-reception-section>summary strong{align-self:end;color:#27303a;font-size:14px;font-weight:720}.sb-reception-section>summary small{grid-column:2;align-self:start;color:#87919b;font-size:12px;line-height:1.55}.sb-reception-section[open]>summary{background:#fbfcfd}.sb-reception-section[open]>summary .sb-reception-section-index{background:#2468d8;color:#fff}.sb-reception-fields{gap:16px;padding:2px 0 22px 46px}.sb-reception-field{gap:8px;color:#59636d;font-size:12px;font-weight:650}.sb-reception-options legend{margin-bottom:9px;color:#59636d;font-size:12px;font-weight:650}.sb-reception-option{min-height:36px;padding:8px 10px;border-radius:7px;font-size:12px}.sb-reception-option:has(input:checked){background:#f7faff;border-color:#2468d8}.sb-reception-personas>div{grid-template-columns:repeat(3,minmax(0,1fr))}.sb-reception-persona{min-height:84px;border-radius:8px}.sb-reception-persona:has(input:checked){background:#f7faff;border-color:#2468d8}.sb-reception-toggle{min-height:34px;padding:0 10px;border-radius:7px;background:#f8f9fa}.sb-reception-time{padding:10px;border:1px solid #edf0f2;border-radius:8px;background:#fafbfc}.sb-reception-material-preview{border-radius:8px}.sb-reception-save{margin-top:6px;padding:20px 0 2px;border-top:1px solid #eef0f2}.sb-reception-save button.primary{min-height:40px;border-radius:7px;background:#171a1f;border-color:#171a1f}.sb-reception-save button.primary:hover{background:#313842}
.sb-reception-trial{grid-area:trial;top:20px;overflow:hidden;border-color:#e7ebef;border-radius:8px;padding:0;box-shadow:none}.sb-reception-trial-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px;border-bottom:1px solid #eef0f2}.sb-reception-trial-head>div{display:grid;gap:4px}.sb-reception-trial-head h3{margin:0;color:#1c2229;font-size:16px;font-weight:720}.sb-reception-trial-head small{color:#87919b;font-size:11px;line-height:1.55}.sb-reception-trial-mode{display:inline-flex;align-items:center;gap:6px;color:#16834d;font-size:10px;font-weight:720;white-space:nowrap}.sb-reception-trial-mode i{width:6px;height:6px;border-radius:50%;background:#22a15a}.sb-reception-chat{min-height:220px;margin:0;padding:16px 18px;background:linear-gradient(180deg,#fcfdfd 0%,#f7f9fb 100%)}.sb-reception-trial-empty{align-self:center;max-width:210px;margin:auto;text-align:center;color:#929ba4;font-size:12px;line-height:1.7}.sb-reception-trial>select,.sb-reception-trial>textarea{width:calc(100% - 36px);margin:12px 18px 0}.sb-reception-trial-actions{padding:12px 18px 18px}.sb-reception-trial-actions button{border-radius:7px}.sb-reception-bubble{border-radius:8px;background:#edf1f5}.sb-reception-bubble.is-user{background:#e7efff}
.sb-reception-section{display:grid;align-self:start;align-content:start;gap:16px;min-width:0;padding:20px!important;border:1px solid #e7ebef!important;border-radius:8px;background:#fff}.sb-reception-section:last-of-type{border-bottom:1px solid #e7ebef!important}.sb-reception-section-title{margin:0!important;color:#1c2229;font-size:16px!important;font-weight:720;line-height:1.35}.sb-reception-fields{gap:16px;padding:0!important}.sb-reception-section .sb-reception-personas>p{display:none}.sb-reception-section .sb-reception-options>div{gap:7px}.sb-reception-section .sb-reception-option{min-height:34px;padding:7px 9px}.sb-reception-section .sb-reception-toggle{min-height:38px;padding:0 10px}.sb-reception-section .sb-reception-time{padding:10px}.sb-reception-personas>.sb-reception-custom-persona{display:grid;grid-template-columns:1fr;gap:12px}.sb-reception-settings-grid{display:grid;grid-template-columns:minmax(260px,.82fr) minmax(340px,1.18fr);gap:16px;align-items:stretch;min-width:0}.sb-reception-settings-grid>.sb-reception-section{align-self:stretch}.sb-reception-persona-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-top:16px;border-top:1px solid #edf0f2}.sb-reception-section-handoff p{margin:0;color:#68737d;font-size:12px;line-height:1.7}.sb-reception-section-knowledge{gap:18px}.sb-reception-knowledge-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(250px,.85fr);gap:16px;align-items:stretch}.sb-reception-knowledge-main,.sb-reception-knowledge-rules{display:grid;align-content:start;gap:12px;min-width:0}.sb-reception-knowledge-main .sb-reception-field,.sb-reception-knowledge-rules .sb-reception-field{height:100%}.sb-reception-knowledge-main textarea,.sb-reception-knowledge-rules textarea{min-height:218px;height:100%;resize:vertical}.sb-reception-knowledge-rules textarea{color:#52606c;background:#fbfcfd}.sb-reception-knowledge-main .sb-reception-material-import{margin-top:0;padding-top:2px}.sb-reception-save{margin:0;padding:4px 0 0;border:0}
.sb-reception-trial{display:grid;grid-template-rows:auto minmax(164px,1fr) auto}.sb-reception-chat{min-height:164px;max-height:300px;padding:14px 18px;background:#f8fafc}.sb-reception-trial-empty{max-width:184px;font-size:11px;line-height:1.7}.sb-reception-trial-composer{display:grid;gap:10px;padding:12px 18px 18px;border-top:1px solid #eef0f2;background:#fff}.sb-reception-trial-composer select,.sb-reception-trial-composer textarea{width:100%;margin:0}.sb-reception-trial-composer textarea{min-height:88px;resize:vertical}.sb-reception-trial-actions{padding:0}.sb-reception-trial-actions:not(.has-history){justify-content:flex-end}
@media(max-width:1180px){.sb-reception:not(.sb-reception-embedded) .sb-reception-strategy-account{max-width:470px}.sb-reception-columns{grid-template-columns:minmax(0,1fr) 290px}.sb-reception-settings-grid,.sb-reception-knowledge-grid{grid-template-columns:1fr}.sb-reception-personas>div{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:840px){.sb-reception:not(.sb-reception-embedded){padding:20px 16px 40px}.sb-reception-columns{grid-template-columns:1fr;grid-template-areas:"account" "main" "trial"}.sb-reception-account-bar{justify-content:flex-start}.sb-reception-trial{position:static}.sb-reception-settings-grid{grid-template-columns:1fr}}
@media(max-width:560px){.sb-reception-account-bar{width:100%;justify-content:stretch}.sb-reception-account-bar .sb-reception-account-picker{width:100%;min-width:0}.sb-reception-persona-settings{grid-template-columns:1fr}.sb-reception-fields{padding-left:0}.sb-reception-section>summary{grid-template-columns:30px minmax(0,1fr) auto}.sb-reception-section>summary small{grid-column:2}.sb-reception-personas>div{grid-template-columns:1fr}.sb-reception-trial-head{padding:16px}.sb-reception-trial-composer{padding:12px 16px 16px}.sb-reception-trial-actions{padding:0}}
`;
let id = 0;
const LOCAL_RECEPTION_KEY = "salebuddy:account-reception:v1";
const LOCAL_RECEPTION_VALUES = new Map();

function localReceptionStorage() {
  const storage = globalThis.localStorage;
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
    ? storage
    : {
      getItem(key) { return LOCAL_RECEPTION_VALUES.has(key) ? LOCAL_RECEPTION_VALUES.get(key) : null; },
      setItem(key, value) { LOCAL_RECEPTION_VALUES.set(key, String(value)); }
    };
}

function readLocalReception(accountId) {
  if (!accountId) return null;
  try {
    const saved = JSON.parse(localReceptionStorage().getItem(LOCAL_RECEPTION_KEY) || "{}");
    const entry = saved && typeof saved[accountId] === "object" ? saved[accountId] : null;
    if (!entry) return null;
    // v1 stored the raw settings. Keep it readable while moving new saves to a versioned envelope.
    if (!entry.settings || typeof entry.settings !== "object") {
      return { settings: normalizeReception(entry), pending: false, baseRevision: 0, updatedAt: "" };
    }
    return {
      settings: normalizeReception(entry.settings),
      pending: Boolean(entry.pending),
      baseRevision: Number.isInteger(entry.baseRevision) && entry.baseRevision >= 0 ? entry.baseRevision : 0,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : ""
    };
  } catch {
    return null;
  }
}

function writeLocalReception(accountId, settings, { pending = false, baseRevision = 0 } = {}) {
  if (!accountId) return;
  try {
    const storage = localReceptionStorage();
    const saved = JSON.parse(storage.getItem(LOCAL_RECEPTION_KEY) || "{}");
    saved[accountId] = {
      settings: normalizeReception(settings),
      pending: Boolean(pending),
      baseRevision: Number.isInteger(baseRevision) && baseRevision >= 0 ? baseRevision : 0,
      updatedAt: new Date().toISOString()
    };
    storage.setItem(LOCAL_RECEPTION_KEY, JSON.stringify(saved));
  } catch {
    // Local storage is only a resilience cache; the control plane remains canonical.
  }
}

function isNetworkError(error) {
  return error instanceof TypeError || error?.name === "TypeError" || /network|fetch|connection|offline/i.test(String(error?.message || ""));
}

function legacyReceptionSettings(accountId) {
  const legacy = inboxStrategyStore.get("mkt-comment-acquisition", { accountId })
    || inboxStrategyStore.get("mkt-dm-inbox", { accountId });
  return normalizeReception({
    goalDetails: legacy?.replyObjective,
    answerRules: [legacy?.replyRule, legacy?.handoffRules].filter(Boolean).join("\n")
  });
}

function field(parent, label, control) { const row = el("label", "sb-reception-field", label); row.appendChild(control); parent.appendChild(row); return control; }
function options(parent, label, values, selected, change) {
  const group = el("fieldset", "sb-reception-options"), name = `reception-${++id}`;
  group.appendChild(el("legend", null, label)); const row = el("div");
  Object.entries(values).forEach(([value, title]) => { const option = el("label", "sb-reception-option"); const input = document.createElement("input"); input.type = "radio"; input.name = name; input.value = value; input.checked = String(selected) === value; input.addEventListener("change", () => change(value)); option.append(input, el("span", null, title)); row.appendChild(option); });
  group.appendChild(row); parent.appendChild(group);
}
function personaOptions(parent, persona, change, markChanged = () => {}) {
  const selected = persona.role;
  const group = el("fieldset", "sb-reception-personas"), name = `reception-${++id}`;
  group.setAttribute("aria-label", "接待人设");
  const row = el("div");
  Object.entries(RECEPTION_ROLES).forEach(([value, title]) => {
    const option = el("label", "sb-reception-persona");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;
    radio.checked = String(selected) === value;
    radio.addEventListener("change", () => change(value));
    const copy = el("span", "sb-reception-persona-copy");
    copy.append(el("strong", null, title), el("span", null, RECEPTION_ROLE_DETAILS[value]));
    option.append(radio, copy);
    row.appendChild(option);
  });
  group.appendChild(row);
  if (selected === "custom") {
    const custom = el("div", "sb-reception-custom-persona");
    custom.appendChild(el("strong", "sb-reception-custom-persona-title", "自定义人设设置"));
    custom.appendChild(el("p", null, "告诉我希望以什么身份和风格接待客户，保存后会用于实际私信回复。"));
    const fields = el("div", "sb-reception-custom-persona-fields");
    input(fields, "自定义身份", persona.name, value => { persona.name = value; markChanged(); }, { ariaLabel: "自定义身份", placeholder: "例如：懂装修的邻家顾问" });
    input(fields, "自定义表达方式", persona.description, value => { persona.description = value; markChanged(); }, { ariaLabel: "自定义表达方式", placeholder: "例如：像熟悉的朋友一样自然沟通，先回答问题，再给出下一步建议。", rows: 3 });
    custom.appendChild(fields);
    group.appendChild(custom);
  }
  parent.appendChild(group);
}
function input(parent, label, value, change, { type = "text", rows = 0, ariaLabel = "", placeholder = "" } = {}) {
  const control = document.createElement(rows ? "textarea" : "input"); if (rows) control.rows = rows; else control.type = type; control.value = value;
  if (ariaLabel) control.setAttribute("aria-label", ariaLabel);
  if (placeholder) control.placeholder = placeholder;
  control.addEventListener("input", () => change(control.value)); return field(parent, label, control);
}
function toggle(parent, label, checked, change) {
  const row = el("label", "sb-reception-toggle"), input = document.createElement("input"); input.type = "checkbox"; input.checked = checked; input.addEventListener("change", () => change(input.checked)); row.append(input, el("span", null, label)); parent.appendChild(row);
}
function accountDisplayName(account = {}) {
  return String(account.name || account.nickname || account.accountName || account.id || "抖音账号").trim() || "抖音账号";
}

function accountHandle(account = {}) {
  return String(account.handle || account.identity?.uniqueId || account.identity?.unique_id || "").trim().replace(/^@+/, "");
}

function accountOptionLabel(account = {}) {
  const name = accountDisplayName(account);
  const handle = accountHandle(account);
  return handle && handle !== name ? `${name} · @${handle}` : name;
}

export function openAccountReceptionPage({ getAccounts, onClose, initialAccountId = "", embeddedContainer = null, onSaved = null, onLoaded = null, onConnectAccount = null, renderEmpty = null } = {}) {
  if (!document.getElementById("sb-reception-style")) { const style = el("style"); style.id = "sb-reception-style"; style.textContent = CSS; document.head.appendChild(style); }
  const embedded = Boolean(embeddedContainer);
  const page = embedded ? { body: embeddedContainer, close() {} } : openPage({ title: "对话策略", onClose });
  const root = el("div", `sb-reception${embedded ? " sb-reception-embedded" : ""}`); page.body.appendChild(root);
  const accounts = getAccounts?.() || [];
  const state = { accounts, accountId: initialAccountId || accounts[0]?.id || "", record: null, settings: normalizeReception(), loading: false, saving: false, error: "", message: "", dirty: false, history: [], preview: "", trialTime: "now", testing: false, offline: false, pendingDraft: null, syncConflict: null, materialImportPreview: null, materialImportText: "", materialImportBusy: false, materialImportError: "", accountPickerOpen: false };
  let generation = 0, disposed = false, saveButton, statusText, unbindAccountPicker = () => {};
  function changed() { state.dirty = true; state.message = "有修改尚未保存"; state.error = ""; if (saveButton) saveButton.disabled = state.saving || state.loading; if (statusText) statusText.textContent = state.message; }
  async function load(accountId) {
    const token = ++generation; state.accountId = accountId; state.loading = true; state.error = ""; state.history = []; state.record = null; state.dirty = false; state.testing = false; state.offline = false; state.pendingDraft = null; state.syncConflict = null; state.materialImportPreview = null; state.materialImportText = ""; state.materialImportBusy = false; state.materialImportError = ""; state.accountPickerOpen = false; render();
    const selectedAccount = state.accounts.find((account) => account.id === accountId);
    if (selectedAccount?.mock) {
      const cached = readLocalReception(accountId);
      const settings = cached?.settings || normalizeReception();
      state.record = { revision: Math.max(1, cached?.baseRevision || 0), settings };
      state.settings = normalizeReception(settings);
      state.message = "模拟账号策略";
      state.loading = false;
      onLoaded?.(state.record);
      render();
      return;
    }
    try {
      const record = await receptionRequest(accountId);
      if (disposed || generation !== token) return;
      const cached = readLocalReception(accountId);
      state.record = record;
      if (cached?.pending && cached.baseRevision === record.revision) {
        state.pendingDraft = cached;
        try {
          const synced = await receptionRequest(accountId, { method: "PUT", body: { settings: cached.settings, expectedRevision: record.revision } });
          if (disposed || generation !== token) return;
          state.record = synced;
          state.settings = normalizeReception(synced.settings);
          state.pendingDraft = null;
          writeLocalReception(accountId, state.settings, { baseRevision: synced.revision });
          markReceptionConfigured([accountId, state.accounts.find(value => value.id === accountId)]);
          state.message = "已同步离线策略 · 下一次回复开始使用";
          onSaved?.(synced);
        } catch (error) {
          if (disposed || generation !== token) return;
          state.settings = cached.settings;
          state.offline = isNetworkError(error);
          state.message = state.offline ? "本机策略等待同步，请恢复连接后重新读取" : "本机策略暂未同步，请稍后重新读取";
          state.error = state.offline ? "" : error.message;
        }
      } else if (cached?.pending) {
        state.pendingDraft = cached;
        state.syncConflict = { remote: record, draft: cached };
        state.settings = cached.settings;
        state.dirty = true;
        state.message = "云端策略已更新，保留本机草稿，请确认后再保存";
      } else {
        state.settings = normalizeReception(record.settings);
        writeLocalReception(accountId, state.settings, { baseRevision: record.revision });
        state.message = record.revision ? "已保存到这个账号" : "首次设置，保存后生效";
      }
      onLoaded?.(record);
    } catch (error) {
      if (generation !== token) return;
      const cached = readLocalReception(accountId);
      const settings = cached?.settings || legacyReceptionSettings(accountId);
      state.record = { revision: cached?.baseRevision || 0, settings };
      state.settings = settings;
      state.pendingDraft = cached?.pending ? cached : null;
      state.offline = true;
      state.message = cached?.pending ? "本机策略等待同步，当前仍可继续编辑" : "控制面暂时不可用，当前编辑的是这个账号的本地策略";
      state.error = "";
    }
    finally { if (!disposed && generation === token) { state.loading = false; render(); } }
  }
  function section(parent, key, title) {
    const panel = el("section", `sb-reception-section sb-reception-section-${key}`);
    panel.setAttribute("data-reception-section", key);
    panel.appendChild(el("h3", "sb-reception-section-title", title));
    const body = el("div", "sb-reception-fields");
    panel.appendChild(body);
    parent.appendChild(panel);
    return body;
  }
  function redraw(change) { change(); changed(); render(); }
  function renderEmptyAccountState() {
    if (root.classList) root.classList.add("sb-reception-empty-workspace");
    if (typeof renderEmpty === "function") {
      renderEmpty(root);
      return;
    }
    const empty = el("section", "sb-reception-empty");
    empty.append(
      el("div", "sb-reception-empty-mark", "抖"),
      el("h2", null, "先连接一个抖音账号"),
      el("p", null, "接待方式按账号保存。连接后，你可以决定 Agent 怎样回复私信、什么时候暂停并交给你处理。")
    );
    const steps = el("div", "sb-reception-empty-steps");
    [
      ["1", "连接账号", "在云电脑登录抖音"],
      ["2", "设置接待", "告诉我怎样回复"],
      ["3", "开始承接", "新私信自动按规则处理"]
    ].forEach(([number, title, detail]) => {
      const step = el("div", "sb-reception-empty-step");
      step.append(el("b", null, number), el("strong", null, title), el("span", null, detail));
      steps.appendChild(step);
    });
    empty.appendChild(steps);
    const connect = el("button", "primary sb-reception-empty-action", "连接抖音账号");
    connect.type = "button";
    connect.addEventListener("click", () => {
      if (onConnectAccount) {
        onConnectAccount();
        return;
      }
      void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ openAccountSetup: true }));
    });
    empty.append(connect, el("p", "sb-reception-empty-footnote", "只会使用你在云电脑中完成授权的账号。"));
    root.appendChild(empty);
  }
  function switchAccount(accountId) {
    if (!accountId || accountId === state.accountId) {
      state.accountPickerOpen = false;
      render();
      return;
    }
    if (state.dirty && !globalThis.confirm("当前修改还没保存，切换账号并放弃这些修改？")) return;
    state.accountPickerOpen = false;
    void load(accountId);
  }
  function openAccountSetup() {
    state.accountPickerOpen = false;
    if (onConnectAccount) {
      onConnectAccount();
      return;
    }
    void globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({ openAccountSetup: true }));
  }
  function toggleAccountPicker() {
    if (state.accounts.length < 2 || state.loading || state.saving) return;
    state.accountPickerOpen = !state.accountPickerOpen;
    render();
  }
  function accountAvatar(className, targetAccount) {
    const avatar = el("span", className);
    const mounted = mountPersonAvatar(avatar, targetAccount || {}, {
      name: accountDisplayName(targetAccount),
      eager: className === "sb-reception-account-avatar"
    });
    if (!mounted) {
      avatar.textContent = "";
      avatar.setAttribute("data-avatar-fallback", "true");
    }
    return avatar;
  }
  function accountIdentity(className, targetAccount) {
    const name = accountDisplayName(targetAccount);
    const handle = accountHandle(targetAccount);
    const identity = el("span", className);
    identity.append(el("strong", null, name));
    if (handle && handle !== name) identity.appendChild(el("span", null, `@${handle}`));
    return identity;
  }
  function renderAccountPicker(account) {
    const hasOptions = state.accounts.length > 1;
    const picker = el("div", `sb-reception-account-picker${hasOptions ? " has-options" : ""}${state.accountPickerOpen ? " is-open" : ""}`);
    const trigger = el("button", "sb-reception-account-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-label", hasOptions ? "切换接待账号" : "当前接待账号");
    trigger.setAttribute("aria-haspopup", hasOptions ? "listbox" : "false");
    trigger.setAttribute("aria-expanded", String(hasOptions && state.accountPickerOpen));
    trigger.disabled = state.loading || state.saving;
    if (!hasOptions) trigger.setAttribute("aria-disabled", "true");
    const copy = el("span", "sb-reception-account-copy");
    const label = el("span", "sb-reception-account-label", "当前接待账号");
    if (account?.mock) label.appendChild(el("em", "sb-reception-account-mock", "MOCK"));
    copy.append(label, accountIdentity("sb-reception-account-identity", account));
    trigger.append(accountAvatar("sb-reception-account-avatar", account), copy);
    if (hasOptions) trigger.appendChild(el("span", "sb-reception-account-chevron"));
    trigger.addEventListener("click", toggleAccountPicker);
    trigger.addEventListener("keydown", event => {
      if (!hasOptions || state.loading || state.saving) return;
      if (event.key === "Escape" && state.accountPickerOpen) {
        event.preventDefault?.();
        state.accountPickerOpen = false;
        render();
      } else if (["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault?.();
        if (!state.accountPickerOpen) toggleAccountPicker();
      }
    });
    picker.appendChild(trigger);
    if (!hasOptions || !state.accountPickerOpen) return picker;

    const menu = el("div", "sb-reception-account-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "选择接待账号");
    state.accounts.forEach(candidate => {
      const selected = candidate.id === state.accountId;
      const option = el("button", `sb-reception-account-option${selected ? " is-selected" : ""}`);
      option.type = "button";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(selected));
      option.setAttribute("aria-label", `使用${accountOptionLabel(candidate)}`);
      const optionCopy = el("span", "sb-reception-account-option-copy");
      optionCopy.appendChild(el("strong", null, accountDisplayName(candidate)));
      const optionHandle = accountHandle(candidate);
      if (optionHandle) optionCopy.appendChild(el("span", null, `@${optionHandle}`));
      option.append(accountAvatar("sb-reception-account-option-avatar", candidate), optionCopy);
      if (selected) option.appendChild(el("span", "sb-reception-account-option-check", "✓"));
      option.addEventListener("click", () => switchAccount(candidate.id));
      menu.appendChild(option);
    });
    picker.appendChild(menu);
    if (typeof document.addEventListener === "function") {
      const closeMenu = event => {
        if (picker.contains?.(event.target)) return;
        state.accountPickerOpen = false;
        render();
      };
      document.addEventListener("pointerdown", closeMenu, true);
      unbindAccountPicker = () => document.removeEventListener?.("pointerdown", closeMenu, true);
    }
    return picker;
  }
  function renderAccountAction() {
    const hasOptions = state.accounts.length > 1;
    if (hasOptions) return null;
    const action = el("button", "sb-reception-account-action");
    action.type = "button";
    action.disabled = state.loading || state.saving;
    action.setAttribute("aria-label", "连接其他抖音账号");
    action.append(
      el("span", null, "连接其他账号"),
      el("span", "sb-reception-account-action-mark", "+")
    );
    action.addEventListener("click", () => {
      openAccountSetup();
    });
    return action;
  }
  function render() {
    if (disposed) return;
    unbindAccountPicker();
    unbindAccountPicker = () => {};
    root.textContent = "";
    if (root.classList) root.classList.remove("sb-reception-empty-workspace");
    const account = state.accounts.find(a => a.id === state.accountId);
    const hasAccounts = state.accounts.length > 0;
    if (state.loading) { root.appendChild(el("p", null, "正在读取账号的接待方式…")); return; }
    if (!hasAccounts) { renderEmptyAccountState(); return; }
    if (!state.record) {
      root.appendChild(el("p", "sb-reception-error", state.error || "暂时无法读取这个账号的接待方式"));
      if (state.accountId) { const retry = el("button", null, "重新读取"); retry.addEventListener("click", () => load(state.accountId)); root.appendChild(retry); } return;
    }
    if (state.syncConflict) {
      const notice = el("div", "sb-reception-notice");
      const copy = el("div");
      copy.append(el("strong", null, "云端策略已更新"), el("p", null, "本机草稿没有自动覆盖云端。你可以采用云端版本，或确认后用当前草稿覆盖。"));
      const useRemote = el("button", null, "采用云端策略");
      useRemote.type = "button";
      useRemote.addEventListener("click", () => {
        state.settings = normalizeReception(state.syncConflict.remote.settings);
        state.record = state.syncConflict.remote;
        state.pendingDraft = null;
        state.syncConflict = null;
        state.dirty = false;
        writeLocalReception(state.accountId, state.settings, { baseRevision: state.record.revision });
        state.message = "已采用云端策略";
        render();
      });
      const useDraft = el("button", "primary", "用本机草稿覆盖");
      useDraft.type = "button";
      useDraft.addEventListener("click", () => {
        state.record = state.syncConflict.remote;
        state.pendingDraft = null;
        state.syncConflict = null;
        state.dirty = true;
        state.message = "将按最新云端版本保存本机草稿";
        render();
      });
      notice.append(copy, useRemote, useDraft);
      root.appendChild(notice);
    } else if (state.offline || state.pendingDraft) {
      const notice = el("div", "sb-reception-notice");
      const copy = el("div");
      copy.append(
        el("strong", null, state.pendingDraft ? "策略等待同步" : "暂时离线"),
        el("p", null, state.pendingDraft ? "当前策略已保留为这个账号的待同步草稿，不会覆盖较新的云端版本。" : "控制面未连接，策略仍按账号保存在本机；恢复连接后可重新读取并安全同步。")
      );
      const reconnect = el("button", null, "重新连接");
      reconnect.type = "button";
      reconnect.addEventListener("click", () => void load(state.accountId));
      notice.append(copy, reconnect);
      root.appendChild(notice);
    }
    const s = state.settings;
    const hours = s.schedule.mode === "always" ? "全天接待" : `${s.schedule.mode === "weekdays" ? "工作日" : s.schedule.mode === "daily" ? "每天" : "自定日期"} ${s.schedule.intervals.map(x => `${x.start}–${x.end}`).join(" / ")}`;
    const columns = el("div", "sb-reception-columns"), main = el("main", "sb-reception-strategy-editor");
    if (embedded) root.appendChild(main); else {
      const accountBar = el("div", "sb-reception-account-bar");
      accountBar.appendChild(renderAccountPicker(account));
      const accountAction = renderAccountAction();
      if (accountAction) accountBar.appendChild(accountAction);
      columns.append(accountBar, main);
      root.appendChild(columns);
    }
    const persona = section(main, "persona", "对外身份");
    personaOptions(persona, s.persona, value => redraw(() => { s.persona.role = value; }), changed);
    const settingsGrid = el("div", "sb-reception-settings-grid");
    main.appendChild(settingsGrid);
    const time = section(settingsGrid, "time", "接待时段");
    toggle(time, "开启自动接待", s.enabled, value => redraw(() => { s.enabled = value; }));
    options(time, "接待日期", { always: "全天", weekdays: "工作日", daily: "每天固定时间", custom: "自己安排" }, s.schedule.mode, value => redraw(() => { s.schedule.mode = value; }));
    if (s.schedule.mode !== "always") {
      if (s.schedule.mode === "custom") { const days = el("div", "sb-reception-actions"); ["周日", "周一", "周二", "周三", "周四", "周五", "周六"].forEach((label, day) => toggle(days, label, s.schedule.days.includes(day), checked => { s.schedule.days = checked ? [...s.schedule.days, day] : s.schedule.days.filter(d => d !== day); changed(); })); time.appendChild(days); }
      s.schedule.intervals.forEach((slot, index) => { const row = el("div", "sb-reception-time"); input(row, "开始", slot.start, value => { slot.start = value; changed(); }, { type: "time" }); input(row, "结束", slot.end, value => { slot.end = value; changed(); }, { type: "time" }); if (s.schedule.intervals.length > 1) { const remove = el("button", null, "删除时段"); remove.addEventListener("click", () => redraw(() => s.schedule.intervals.splice(index, 1))); row.appendChild(remove); } time.appendChild(row); });
      if (s.schedule.intervals.length < 3) { const add = el("button", null, "添加时段"); add.addEventListener("click", () => redraw(() => s.schedule.intervals.push({ start: "14:00", end: "18:00" }))); time.appendChild(add); }
      options(time, "休息时收到消息", { queue: "上班后再回复", away: "先留一句话" }, s.schedule.outside, value => redraw(() => { s.schedule.outside = value; }));
      if (s.schedule.outside === "away") input(time, "休息留言", s.schedule.awayMessage, value => { s.schedule.awayMessage = value; changed(); }, { rows: 2 });
    }
    const chat = section(settingsGrid, "chat", "转化目标");
    options(chat, "希望对方最终完成什么", RECEPTION_GOALS, s.goal, value => redraw(() => { s.goal = value; }));
    input(chat, "补充转化要求或链接（选填）", s.goalDetails, value => { s.goalDetails = value; changed(); }, { rows: 2 });
    const handoff = section(settingsGrid, "handoff", "人工交接");
    toggle(handoff, "价格问题先交给我", s.handoff.price, value => { s.handoff.price = value; changed(); });
    handoff.appendChild(el("p", null, "对方要求人工、投诉退款或问题没有可靠依据时，停止自动接话。"));
    const reply = section(settingsGrid, "reply", "回复方式");
    options(reply, "回复长度", { short: "简短一点", balanced: "适中", detailed: "详细解释" }, s.length, value => redraw(() => { s.length = value; }));
    toggle(reply, "可以少量用表情", s.emoji, value => { s.emoji = value; changed(); });
    options(reply, "等对方说完再回复", { 0: "不额外等待", 4: "等 4 秒", 8: "等 8 秒" }, s.habits.mergeSeconds, value => redraw(() => { s.habits.mergeSeconds = Number(value); }));
    const knowledge = section(main, "knowledge", "业务资料");
    const knowledgeGrid = el("div", "sb-reception-knowledge-grid");
    const knowledgeMain = el("div", "sb-reception-knowledge-main");
    const knowledgeRules = el("div", "sb-reception-knowledge-rules");
    knowledgeGrid.append(knowledgeMain, knowledgeRules);
    knowledge.appendChild(knowledgeGrid);
    const knowledgeInput = input(knowledgeMain, "产品、服务、价格和常见问题", s.knowledge, value => { s.knowledge = value; changed(); }, { rows: 6 });
    const materialImport = el("div", "sb-reception-material-import");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = BUSINESS_MATERIAL_ACCEPT;
    fileInput.hidden = true;
    fileInput.setAttribute("aria-label", "导入业务资料文件");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      state.materialImportBusy = true;
      state.materialImportError = "";
      state.materialImportPreview = null;
      render();
      try {
        const parsed = await readBusinessMaterialFile(file);
        state.materialImportPreview = parsed;
        state.materialImportText = parsed.content;
      } catch (error) {
        state.materialImportError = error?.message || "资料解析失败，请换一个文件再试。";
      } finally {
        state.materialImportBusy = false;
        render();
      }
    });
    const importButton = el("button", null, state.materialImportBusy ? "正在解析…" : "导入业务资料");
    importButton.type = "button";
    importButton.disabled = state.materialImportBusy;
    importButton.addEventListener("click", () => fileInput.click());
    materialImport.append(importButton, el("small", null, "支持 TXT、MD、CSV、TSV、JSON、XLS、XLSX"), fileInput);
    knowledgeMain.appendChild(materialImport);
    if (state.materialImportError) knowledge.appendChild(el("div", "sb-reception-material-error", state.materialImportError));
    if (state.materialImportBusy) knowledge.appendChild(el("small", null, "正在读取文件内容…"));
    if (state.materialImportPreview) {
      const preview = el("div", "sb-reception-material-preview");
      const previewHeader = el("header");
      const previewCopy = el("div");
      const rowHint = state.materialImportPreview.rowCount ? ` · ${state.materialImportPreview.rowCount} 行` : "";
      previewCopy.append(
        el("strong", null, state.materialImportPreview.name),
        el("span", null, `已解析 ${state.materialImportPreview.charCount} 个字${rowHint} · 确认前可修改内容`)
      );
      const cancelImport = el("button", null, "取消");
      cancelImport.type = "button";
      cancelImport.addEventListener("click", () => {
        state.materialImportPreview = null;
        state.materialImportText = "";
        state.materialImportError = "";
        render();
      });
      previewHeader.append(previewCopy, cancelImport);
      const parsedText = document.createElement("textarea");
      parsedText.value = state.materialImportText;
      parsedText.rows = 7;
      parsedText.setAttribute("aria-label", "待导入的业务资料");
      parsedText.addEventListener("input", () => { state.materialImportText = parsedText.value; });
      const importActions = el("div", "sb-reception-material-actions");
      const replace = el("button", "primary", "替换当前资料");
      const append = el("button", null, "追加到当前资料");
      const commitImport = (mode) => {
        const imported = state.materialImportText.trim();
        if (!imported) { parsedText.focus(); return; }
        const nextKnowledge = mode === "replace" || !s.knowledge.trim()
          ? imported
          : `${s.knowledge.trim()}\n\n${imported}`;
        if (nextKnowledge.length > BUSINESS_MATERIAL_MAX_CHARS) {
          state.materialImportError = `合并后的业务资料超过 ${BUSINESS_MATERIAL_MAX_CHARS} 字，请先精简内容。`;
          render();
          return;
        }
        s.knowledge = nextKnowledge;
        state.materialImportPreview = null;
        state.materialImportText = "";
        state.materialImportError = "";
        changed();
        render();
      };
      replace.type = "button";
      append.type = "button";
      replace.addEventListener("click", () => commitImport("replace"));
      append.addEventListener("click", () => commitImport("append"));
      importActions.append(replace, append);
      preview.append(previewHeader, parsedText, importActions);
      knowledge.appendChild(preview);
    }
    input(knowledgeRules, "回答规则", s.answerRules, value => { s.answerRules = value; changed(); }, { rows: 6 });
    const saveArea = el("div", "sb-reception-save"); saveButton = el("button", "primary", state.saving ? "正在保存…" : "保存接待方式"); saveButton.disabled = state.saving || (!state.dirty && state.record.revision > 0);
    statusText = el("span", "sb-reception-status", state.message); saveArea.append(saveButton, statusText); main.appendChild(saveArea);
    saveButton.addEventListener("click", async () => {
      const accountId = state.accountId, token = generation; state.saving = true; saveButton.disabled = true;
      root.querySelectorAll("input,textarea,select,button").forEach(control => { control.disabled = true; });
      try {
        const settings = normalizeReception(state.settings);
        const selectedAccount = state.accounts.find((account) => account.id === accountId);
        if (selectedAccount?.mock) {
          const revision = Math.max(1, Number(state.record?.revision) || 0);
          writeLocalReception(accountId, settings, { baseRevision: revision });
          state.record = { revision, settings };
          state.settings = settings;
          state.dirty = false;
          state.error = "";
          state.message = "模拟策略已保存";
          onSaved?.(state.record);
        } else if (state.offline) {
          const baseRevision = Number.isInteger(state.record?.revision) ? state.record.revision : state.pendingDraft?.baseRevision || 0;
          writeLocalReception(accountId, settings, { pending: true, baseRevision });
          state.pendingDraft = { settings, pending: true, baseRevision, updatedAt: new Date().toISOString() };
          state.record = { ...state.record, settings };
          state.settings = settings;
          state.dirty = false;
          state.error = "";
          state.message = "已保存到这个账号的本机策略 · 等待安全同步";
        } else {
          const record = await receptionRequest(accountId, { method: "PUT", body: { settings, expectedRevision: state.record.revision } });
          if (disposed || token !== generation) return;
          state.record = record; state.settings = normalizeReception(record.settings); state.pendingDraft = null; state.syncConflict = null; writeLocalReception(accountId, state.settings, { baseRevision: record.revision }); markReceptionConfigured([accountId, state.accounts.find(value => value.id === accountId)]); state.dirty = false; state.error = ""; state.message = "已保存 · 下一次回复开始使用"; onSaved?.(record);
        }
      } catch (error) {
        if (token !== generation) return;
        if (!state.offline && isNetworkError(error)) {
          state.offline = true;
          const settings = normalizeReception(state.settings);
          const baseRevision = Number.isInteger(state.record?.revision) ? state.record.revision : 0;
          writeLocalReception(accountId, settings, { pending: true, baseRevision });
          state.pendingDraft = { settings, pending: true, baseRevision, updatedAt: new Date().toISOString() };
          state.dirty = false;
          state.error = "";
          state.message = "已保存到这个账号的本机策略 · 等待安全同步";
        } else state.error = error.message;
      }
      finally { if (token === generation) { state.saving = false; render(); } }
    });
    if (state.error) main.appendChild(el("p", "sb-reception-error", state.error));
    if (embedded) return;
    renderTrial(columns);
  }
  function renderTrial(parent) {
    const trial = el("aside", "sb-reception-trial");
    const head = el("div", "sb-reception-trial-head");
    const copy = el("div");
    copy.append(el("h3", null, "试聊一下"), el("small", null, "预览未保存的设置，不会发送到抖音"));
    const mode = el("span", "sb-reception-trial-mode");
    mode.append(el("i"), el("span", null, state.settings.enabled ? "模拟中" : "已暂停"));
    head.append(copy, mode);
    trial.appendChild(head);
    const chat = el("div", "sb-reception-chat");
    if (!state.history.length) chat.appendChild(el("div", "sb-reception-trial-empty", "输入一条客户消息，查看当前策略会怎样回复。"));
    state.history.forEach(item => chat.appendChild(el("div", `sb-reception-bubble${item.role === "user" ? " is-user" : ""}`, item.content))); trial.appendChild(chat);
    const composer = el("div", "sb-reception-trial-composer");
    const clock = document.createElement("select"); clock.setAttribute("aria-label", "试聊时间"); [["now", "按当前时间"], ["working", "模拟接待时间"], ["away", "模拟休息时间"]].forEach(([value, label]) => { const option = el("option", null, label); option.value = value; clock.appendChild(option); }); clock.value = state.trialTime; clock.addEventListener("change", () => { state.trialTime = clock.value; }); composer.appendChild(clock);
    const message = document.createElement("textarea"); message.rows = 3; message.value = state.preview; message.placeholder = "例如：你好，想了解一下预约方式"; message.setAttribute("aria-label", "试聊消息"); message.addEventListener("input", () => { state.preview = message.value; }); composer.appendChild(message);
    const actions = el("div", `sb-reception-trial-actions${state.history.length ? " has-history" : ""}`), test = el("button", "primary", state.testing ? "正在回复…" : "试试看"); test.disabled = state.testing;
    if (state.history.length) {
      const clear = el("button", null, "重新试聊");
      clear.disabled = state.testing;
      clear.addEventListener("click", () => { state.history = []; render(); });
      actions.appendChild(clear);
    }
    test.addEventListener("click", async () => {
      const token = generation, accountId = state.accountId, content = state.preview.trim(); if (!content) return;
      state.testing = true;
      try {
        const settings = normalizeReception(state.settings); let instant = Date.now();
        if (state.trialTime !== "now") {
          const open = state.trialTime === "working"; let found = false;
          for (let step = 0; step < 8 * 24 * 4; step++) { const candidate = instant + step * 15 * 60000; if (receptionWindow(settings, candidate).open === open) { instant = candidate; found = true; break; } }
          if (!found) throw new Error(open ? "当前设置没有接待时段" : "全天接待没有休息时段");
        }
        const history = state.history.slice(); state.history.push({ role: "user", content }); state.preview = ""; render();
        const result = await receptionRequest(accountId, { operation: "/preview", method: "POST", body: { settings, message: content, history, instant } });
        if (disposed || token !== generation) return;
        const text = result.reply || { human: "这条消息会交给你处理，不自动回复。", closed: "对方不希望被联系，停止回复。", paused: "接待已暂停。", away: "休息时间，消息会保留到接待时间再回复。" }[result.action] || "暂不回复";
        state.history.push({ role: "assistant", content: text }); state.history = state.history.slice(-20);
      } catch (error) { if (token === generation) state.error = error.message; }
      finally { if (token === generation) { state.testing = false; render(); } }
    }); actions.appendChild(test); composer.appendChild(actions); trial.appendChild(composer); parent.appendChild(trial);
  }
  render();
  if (state.accountId) void load(state.accountId);
  if (!embedded) void fetch(`${receptionBaseUrl()}/v1/connectors/douyin/accounts`).then(response => response.json()).then(result => {
    if (disposed) return;
    const fresh = getAccounts(result.accounts || []);
    if (!fresh.length && typeof renderEmpty !== "function") return;
    state.accounts = fresh;
    const selected = fresh.find(account => account.id === state.accountId) || fresh[0] || null;
    if (!selected) {
      state.accountId = "";
      render();
      return;
    }
    if (selected.id !== state.accountId) void load(selected.id); else render();
  }).catch(() => {});
  const close = page.close; page.close = () => { disposed = true; generation++; unbindAccountPicker(); close(); }; return page;
}
