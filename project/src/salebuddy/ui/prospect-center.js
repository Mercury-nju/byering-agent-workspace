import { openPage, el } from "./pages.js";
import { contactabilityFor, isContactableRecord, isManualOutreachReady, prospectStore, PROSPECT_STATUSES } from "./prospect-store.js";
import { openAccountAnalysis, renderAccountAnalysisOverview, renderAccountAnalysisReports } from "./account-analysis.js";
import { buildAccountAnalysisBatch, buildAccountAnalysisResumeFlow, ACCOUNT_ANALYSIS_LIMIT } from "../agents/account-analysis-contract.js";
import { mountPersonAvatar, personAvatarUrl } from "./person-avatar.js";
import { listWorks, subscribeWork } from "../agents/work-live.js";
import { fetchCanonicalResultRuns } from "../bridge/results-client.js";
import { createResultsMockPreviewData, isResultsMockPreview } from "./results-mock-preview.js";
import { accountAvatarSource, getAuthorizedManagedAccounts } from "./realtime-work.js";
import { PRIVATE_OUTREACH_MODES, isPrivateOutreachRecordCandidate, normalizePrivateOutreachMode, privateOutreachProfileIdentifier } from "../agents/private-outreach-contract.js";
import {
  finderAccountCsvRows,
  finderAccountEvidence,
  finderAccountId,
  finderAccountName,
  finderAccountReasons,
  finderAccountStatus,
  finderAccountTags,
  finderAccountToOutreach,
  finderAccountUrl,
  mergeResolvedFinderAccounts,
  normalizeDouyinFinderAccounts
} from "./douyin-finder-results.js";

const SYSTEM_TAGS = Object.freeze(["高意向", "购买咨询", "求链接", "询问价格", "产品对比", "内容互动", "直播间用户"]);
const FOLLOWUP_STATUSES = Object.freeze([PROSPECT_STATUSES.AUTOMATIC_OUTREACH, PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION, "已触达", "已回复", "跟进中", "已留资", "未回复", "高意向需二次触达", "即将流失", "已归档"]);
const PROSPECT_FILTERS = Object.freeze(["全部", PROSPECT_STATUSES.AUTOMATIC_OUTREACH, PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION, "已触达", "已回复", "跟进中", "已归档"]);
const LEAD_FILTERS = Object.freeze(["全部", "已留资", "成交跟进", "已转化", "已失效"]);

const CSS = `
.sb-prospect-page{height:100%;box-sizing:border-box;padding:26px 34px 40px;background:#f7f9f7;color:#17231d;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;overflow:auto}
.sb-prospect-shell{max-width:1260px;margin:0 auto}.sb-prospect-topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.sb-prospect-kicker{display:flex;align-items:center;gap:8px;color:#159f63;font-size:12px;font-weight:700;letter-spacing:.04em}.sb-prospect-kicker i{width:7px;height:7px;border-radius:50%;background:#12b66d;box-shadow:0 0 0 4px rgba(18,182,109,.12)}.sb-prospect-subtitle{margin:6px 0 0;color:#7a887f;font-size:13px}.sb-prospect-top-actions{display:flex;align-items:center;gap:8px}.sb-prospect-button{height:34px;padding:0 13px;border:1px solid #d6e7dc;border-radius:8px;color:#557064;background:#fff;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-prospect-button:hover{border-color:#8ed3ad;background:#f5fcf7}.sb-prospect-button.primary{border-color:#10ae68;color:#fff;background:#10b56b}.sb-prospect-button.primary:hover{background:#079a59}.sb-prospect-button:disabled{opacity:.5;cursor:not-allowed}
.sb-prospect-workspace{display:grid;grid-template-columns:minmax(0,1.58fr) minmax(330px,.72fr);gap:14px;margin-top:14px}.sb-prospect-panel{min-width:0;border:1px solid #e1ebe4;border-radius:13px;background:#fff}.sb-prospect-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #edf2ef}.sb-prospect-panel-title{font-size:14px;font-weight:750}.sb-prospect-panel-meta{color:#9aa59e;font-size:10px}.sb-prospect-panel-actions{display:flex;align-items:center;gap:10px;margin-left:auto}.sb-prospect-toolbar{position:relative;display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:11px 16px;border-bottom:1px solid #f0f3f1}.sb-prospect-filter{height:28px;padding:0 10px;border:1px solid transparent;border-radius:7px;color:#7a887f;background:transparent;font:inherit;font-size:11px;cursor:pointer}.sb-prospect-filter:hover{background:#f3f7f4}.sb-prospect-filter.is-active{border-color:#bfe6cf;color:#118f58;background:#effaf4;font-weight:650}.sb-prospect-search{width:156px;height:29px;margin-left:auto;box-sizing:border-box;padding:0 10px;border:1px solid #e1ebe4;border-radius:7px;outline:none;color:#334238;background:#fbfdfb;font:inherit;font-size:11px}.sb-prospect-search:focus{border-color:#7bd1a3;box-shadow:0 0 0 3px rgba(18,182,109,.1)}.sb-prospect-view-toggle{display:flex;gap:2px;padding:3px;border-radius:8px;background:#f1f5f2}.sb-prospect-view{height:25px;padding:0 8px;border:0;border-radius:6px;color:#8b9890;background:transparent;font:inherit;font-size:10px;cursor:pointer}.sb-prospect-view.is-active{color:#1c3025;background:#fff;box-shadow:0 1px 3px rgba(23,45,32,.08);font-weight:650}
.sb-prospect-sync-notice{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0 0;padding:10px 12px;border:1px solid #d9e3ee;border-radius:9px;color:#536477;background:#f7faff;font-size:11px;line-height:1.5}.sb-prospect-sync-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px;min-width:0}.sb-prospect-sync-copy strong{color:#344456;font-size:12px}.sb-prospect-sync-notice button{height:28px;flex:none;padding:0 10px;border:1px solid #c4d5eb;border-radius:7px;color:#2f6fb9;background:#fff;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-prospect-sync-notice button:hover{border-color:#7ea9dc;background:#f1f7ff}.sb-prospect-sync-notice button:disabled{opacity:.55;cursor:wait}
.sb-prospect-tag-manager{position:absolute;top:48px;left:16px;z-index:5;width:265px;padding:13px;border:1px solid #dcebe1;border-radius:10px;background:#fff;box-shadow:0 14px 32px rgba(24,65,41,.14)}.sb-prospect-tag-manager[hidden]{display:none}.sb-prospect-tag-manager-title{font-size:11px;font-weight:750}.sb-prospect-tag-cloud{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.sb-prospect-tag-chip{height:24px;padding:0 8px;border:1px solid #dbe9df;border-radius:6px;color:#6c7b72;background:#f8fbf9;font:inherit;font-size:10px;cursor:pointer}.sb-prospect-tag-chip.is-used{border-color:#b4e3c8;color:#138e58;background:#effaf4}.sb-prospect-tag-input{display:flex;gap:5px;margin-top:11px}.sb-prospect-tag-input input{min-width:0;flex:1;height:27px;padding:0 8px;border:1px solid #e1ebe4;border-radius:6px;outline:none;font:inherit;font-size:10px}.sb-prospect-tag-input button{height:27px;padding:0 8px;border:0;border-radius:6px;color:#fff;background:#12ae69;font:inherit;font-size:10px;cursor:pointer}.sb-prospect-tag-ai{width:100%;height:28px;margin-top:8px;border:1px solid #cfe7d9;border-radius:6px;color:#178e58;background:#f1fbf5;font:inherit;font-size:10px;cursor:pointer}
.sb-prospect-bulk{display:flex;align-items:center;gap:7px;padding:9px 16px;color:#587066;background:#f2faf5;font-size:10px}.sb-prospect-bulk strong{color:#16925a}.sb-prospect-bulk button{height:25px;padding:0 8px;border:1px solid #c7e4d2;border-radius:6px;color:#168d57;background:#fff;font:inherit;font-size:10px;cursor:pointer}.sb-prospect-bulk button:hover{background:#effaf4}.sb-prospect-table-wrap{overflow:auto;padding:7px 9px 12px}.sb-prospect-table{width:100%;border-collapse:collapse;min-width:730px}.sb-prospect-table th{padding:7px 7px;color:#a0aaa3;font-size:10px;font-weight:600;text-align:left;white-space:nowrap}.sb-prospect-table td{padding:10px 7px;border-top:1px solid #f0f3f1;color:#445149;font-size:11px;vertical-align:middle}.sb-prospect-table input[type="checkbox"]{accent-color:#11b56b}.sb-prospect-row{cursor:pointer}.sb-prospect-row:hover td{background:#f8fcf9}.sb-prospect-row.is-selected td{background:#f0faf4}.sb-prospect-person{display:flex;align-items:center;gap:8px;min-width:156px}.sb-prospect-avatar{width:28px;height:28px;display:grid;place-items:center;flex:none;border-radius:8px;color:#168f5b;background:#dff7e9;font-size:11px;font-weight:750}.sb-prospect-person-copy{min-width:0}.sb-prospect-person-name{color:#24332a;font-weight:700}.sb-prospect-person-handle{margin-top:3px;color:#9aa59e;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-prospect-source,.sb-prospect-tag{color:#77847c;white-space:nowrap}.sb-prospect-score{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:21px;border-radius:6px;color:#0c9457;background:#e7f8ed;font-weight:750}.sb-prospect-score.is-mid{color:#9a701f;background:#fff4dc}.sb-prospect-status{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.sb-prospect-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#c8d2cc}.sb-prospect-status.is-hot{color:#149b60}.sb-prospect-status.is-hot::before{background:#16b76d}.sb-prospect-status.is-research{color:#aa7a27}.sb-prospect-status.is-research::before{background:#e2ac4d}.sb-prospect-status.is-archive{color:#9aa59e}
.sb-prospect-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:12px}.sb-prospect-card{position:relative;padding:13px;border:1px solid #e5eee8;border-radius:10px;cursor:pointer}.sb-prospect-card:hover,.sb-prospect-card.is-selected{border-color:#8ed3ad;background:#f7fcf9}.sb-prospect-card-check{position:absolute;top:11px;right:11px}.sb-prospect-card-top{display:flex;align-items:center;gap:8px}.sb-prospect-card-copy{min-width:0}.sb-prospect-card-name{color:#24332a;font-size:12px;font-weight:750}.sb-prospect-card-handle{margin-top:3px;color:#9aa59e;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-prospect-card-score{margin-left:auto;color:#0c9457;font-size:18px;font-weight:800}.sb-prospect-card-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:11px}.sb-prospect-card-tag{padding:3px 6px;border-radius:5px;color:#5e7468;background:#eef8f1;font-size:9px}.sb-prospect-card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:11px;color:#89968e;font-size:9px}
.sb-prospect-groups{display:grid;gap:13px;padding:13px}.sb-prospect-group-title{display:flex;align-items:center;justify-content:space-between;padding:0 2px 7px;color:#68776e;font-size:11px;font-weight:700;border-bottom:1px solid #edf2ef}.sb-prospect-group-title span{color:#a0aaa3;font-weight:500}.sb-prospect-group-items{display:grid;gap:3px}.sb-prospect-group-item{display:flex;align-items:center;gap:9px;padding:8px;border-radius:8px;cursor:pointer}.sb-prospect-group-item:hover{background:#f7fbf8}.sb-prospect-group-copy{min-width:0;flex:1}.sb-prospect-group-name{font-size:11px;font-weight:700}.sb-prospect-group-meta{margin-top:3px;color:#9aa59e;font-size:10px}
.sb-prospect-detail{padding:16px}.sb-prospect-detail-tabs{display:flex;gap:5px;margin:-2px 0 15px}.sb-prospect-detail-tab{height:27px;padding:0 9px;border:0;border-radius:6px;color:#89968e;background:transparent;font:inherit;font-size:10px;cursor:pointer}.sb-prospect-detail-tab.is-active{color:#148e58;background:#effaf4;font-weight:650}.sb-prospect-detail-top{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid #edf2ef}.sb-prospect-detail-avatar{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;color:#fff;background:#15b56b;font-size:17px;font-weight:750}.sb-prospect-detail-name{font-size:16px;font-weight:750}.sb-prospect-detail-handle{margin-top:4px;color:#929e96;font-size:10px}.sb-prospect-detail-score{margin-left:auto;color:#0c9457;font-size:21px;font-weight:800}.sb-prospect-detail-score small{display:block;color:#9aa59e;font-size:9px;font-weight:500;text-align:right}.sb-prospect-detail-note{margin:14px 0;padding:11px;border-radius:8px;color:#4f6057;background:#f3faf5;font-size:11px;line-height:1.6}.sb-prospect-detail-section{padding:13px 0;border-top:1px solid #edf2ef}.sb-prospect-detail-section-title{display:flex;align-items:center;justify-content:space-between;color:#65736b;font-size:11px;font-weight:700}.sb-prospect-detail-section-title span{color:#a0aaa3;font-size:10px;font-weight:500}.sb-prospect-detail-list{display:grid;gap:10px;margin:11px 0 0}.sb-prospect-detail-item{display:grid;grid-template-columns:64px 1fr;gap:10px;font-size:10px}.sb-prospect-detail-item dt{color:#9aa59e}.sb-prospect-detail-item dd{margin:0;color:#334238;font-weight:600}.sb-prospect-detail-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.sb-prospect-detail-tag{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:6px;color:#197e53;background:#eaf8ef;font-size:10px}.sb-prospect-detail-tag button{width:12px;height:12px;padding:0;border:0;color:#4f8a6c;background:transparent;font-size:11px;line-height:1;cursor:pointer}.sb-prospect-timeline{display:grid;gap:12px;margin-top:12px}.sb-prospect-timeline-item{display:grid;grid-template-columns:10px 1fr auto;gap:8px;color:#526158;font-size:10px;line-height:1.4}.sb-prospect-timeline-item i{width:7px;height:7px;margin-top:3px;border-radius:50%;background:#19b873;box-shadow:0 0 0 3px #e5f8ed}.sb-prospect-timeline-item time{color:#a0aaa3;white-space:nowrap}.sb-prospect-execution{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px;border-radius:8px;background:#f7faf8}.sb-prospect-execution-dot{width:7px;height:7px;border-radius:50%;background:#c4d0c8}.sb-prospect-execution-dot.is-running{background:#e1aa3f;box-shadow:0 0 0 4px rgba(225,170,63,.12)}.sb-prospect-execution-dot.is-done{background:#16b76d;box-shadow:0 0 0 4px rgba(22,183,109,.12)}.sb-prospect-execution-copy{min-width:0;flex:1}.sb-prospect-execution-title{color:#35483c;font-size:10px;font-weight:700}.sb-prospect-execution-meta{margin-top:3px;color:#9aa59e;font-size:9px}.sb-prospect-detail-actions{display:flex;gap:7px;margin-top:14px}.sb-prospect-detail-actions button{height:31px;flex:1;border:1px solid #cfe7d9;border-radius:7px;color:#158e58;background:#fff;font:inherit;font-size:10px;cursor:pointer}.sb-prospect-detail-actions button.primary{border-color:#11af69;color:#fff;background:#10b56b}.sb-prospect-detail-actions button:hover{background:#f1fbf5}.sb-prospect-detail-actions button.primary:hover{background:#079a59}.sb-prospect-detail-empty{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#a1aba5;font-size:11px;text-align:center}.sb-prospect-detail-empty strong{color:#77847c;font-size:13px}
.sb-prospect-toast{position:fixed;right:24px;bottom:22px;z-index:4;padding:10px 13px;border:1px solid #cfe7d9;border-radius:8px;color:#167d50;background:#effaf4;box-shadow:0 10px 30px rgba(25,71,42,.12);font-size:11px}.sb-prospect-empty{padding:45px 10px;color:#9aa59e;font-size:11px;text-align:center}
.sb-prospect-page{--sb-brand-accent:#3b6bd4;--sb-brand-accent-soft:#eff3fa;--sb-brand-accent-wash:#f6f8fd;--sb-brand-accent-border:#d6e0f0}
.sb-prospect-filter.is-active{border-color:var(--sb-brand-accent-border);color:var(--sb-brand-accent);background:var(--sb-brand-accent-soft)}
.sb-prospect-search:focus{border-color:var(--sb-brand-accent);box-shadow:0 0 0 3px rgba(59,107,212,.12)}
.sb-prospect-tag-chip.is-used{border-color:var(--sb-brand-accent-border);color:var(--sb-brand-accent);background:var(--sb-brand-accent-soft)}
.sb-prospect-bulk{background:var(--sb-brand-accent-soft)}.sb-prospect-bulk strong{color:var(--sb-brand-accent)}.sb-prospect-bulk button{border-color:var(--sb-brand-accent-border);color:var(--sb-brand-accent)}.sb-prospect-bulk button:hover{background:var(--sb-brand-accent-soft)}
.sb-prospect-table input[type="checkbox"]{accent-color:var(--sb-brand-accent)}
.sb-prospect-row.is-selected td{background:var(--sb-brand-accent-soft)}
.sb-prospect-card:hover,.sb-prospect-card.is-selected{border-color:var(--sb-brand-accent-border);background:var(--sb-brand-accent-wash)}
.sb-prospect-detail-tab.is-active{color:var(--sb-brand-accent);background:var(--sb-brand-accent-soft)}
@media(max-width:1050px){.sb-prospect-workspace{grid-template-columns:1fr}.sb-prospect-detail-empty{min-height:170px}}@media(max-width:760px){.sb-prospect-page{padding:20px 16px 30px}.sb-prospect-topbar{align-items:flex-start;flex-direction:column}.sb-prospect-top-actions{width:100%}.sb-prospect-top-actions .sb-prospect-button{flex:1}.sb-prospect-search{width:100%;margin-left:0}.sb-prospect-view-toggle{order:5}.sb-prospect-cards{grid-template-columns:1fr}}
.sb-outreach-relation{display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr);align-items:center;gap:8px;margin-top:12px;padding:10px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa}.sb-outreach-party{min-width:0}.sb-outreach-party span{display:block;color:#999;font-size:9px}.sb-outreach-party strong{display:block;margin-top:4px;color:#262626;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-outreach-arrow{color:#a3a3a3;text-align:center}.sb-outreach-message{margin-top:9px;padding:11px;border-left:3px solid #262626;border-radius:0 7px 7px 0;color:#3f3f46;background:#f4f4f5;font-size:10.5px;line-height:1.65;white-space:pre-wrap}.sb-outreach-target{padding:11px;border:1px solid #e5e5e5;border-radius:8px}.sb-outreach-target-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.sb-outreach-target-head strong{display:block;color:#262626;font-size:11px}.sb-outreach-target-head span{display:block;margin-top:3px;color:#777;font-size:9.5px}.sb-outreach-receipt{display:inline-flex!important;flex:none;margin-top:0!important;padding:3px 6px;border-radius:5px;color:#16794f!important;background:#eaf8ef}.sb-outreach-receipt.is-pending{color:#9a701f!important;background:#fff4dc}.sb-outreach-receipt.is-failed{color:#b42318!important;background:#fff0ee}.sb-outreach-facts{display:grid;gap:7px;margin-top:10px}.sb-outreach-fact{display:grid;grid-template-columns:58px minmax(0,1fr);gap:9px;color:#525252;font-size:9.5px;line-height:1.5}.sb-outreach-fact span:first-child{color:#999}.sb-outreach-link{color:#2f80ed;text-decoration:none;overflow-wrap:anywhere}.sb-outreach-evidence{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.sb-outreach-evidence span{padding:3px 6px;border-radius:5px;color:#626262;background:#f0f1f2;font-size:9px}
.sb-research-brief{display:grid;gap:8px;margin-top:10px}.sb-research-brief-row{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;color:#525252;font-size:10px;line-height:1.55}.sb-research-brief-row span:first-child{color:#999}.sb-research-invitation{margin-top:10px;padding:11px;border-left:3px solid #587c64;border-radius:0 7px 7px 0;background:#f4f6f4;color:#3f3f46;font-size:10.5px;line-height:1.65;white-space:pre-wrap}.sb-research-targets{display:grid;gap:7px;margin-top:10px}.sb-research-target{padding:10px;border:1px solid #e5e5e5;border-radius:8px;background:#fff}.sb-research-target-head{display:flex;align-items:flex-start;gap:9px}.sb-research-target-index{display:grid;place-items:center;width:24px;height:24px;flex:none;border-radius:7px;background:#f0f1f2;color:#626262;font-size:9px;font-weight:700}.sb-research-target-copy{min-width:0;flex:1}.sb-research-target-copy strong{display:block;color:#262626;font-size:10.5px}.sb-research-target-copy span{display:block;margin-top:3px;color:#929292;font-size:9px;line-height:1.45}.sb-research-target-score{flex:none;color:#2f80ed;font-size:14px;font-weight:750}.sb-research-target-status{display:inline-flex;margin-top:8px;padding:3px 6px;border-radius:5px;color:#626262;background:#f0f1f2;font-size:9px}.sb-research-target-status.is-sent{color:#16794f;background:#eaf8ef}.sb-research-target-status.is-failed{color:#b42318;background:#fff0ee}.sb-research-target-status.is-pending{color:#9a701f;background:#fff4dc}
/* AI数班 neutral palette: charcoal actions, cool-blue live emphasis, neutral data surfaces. */
.sb-prospect-page{--sb-prospect-blue:#2f80ed;--sb-prospect-blue-soft:#edf3ff;--sb-prospect-neutral:#262626;--sb-prospect-neutral-soft:#f4f4f5;background:var(--sb-app-page-bg,#f7f8fb);color:#262626}
.sb-result-panel-head{padding:12px 16px;align-items:center}.sb-result-panel-head .sb-result-toolbar{width:min(260px,42%);flex:0 1 260px;padding:0;border:0}.sb-result-panel-head .sb-result-toolbar .sb-prospect-search{width:100%;margin-left:0}.sb-result-panel-head .sb-prospect-panel-title{font-size:13px}.sb-result-panel-head .sb-prospect-panel-meta{margin-left:auto;margin-right:14px}.sb-result-card-list{padding-top:4px}.sb-result-detail{min-width:0;overflow:hidden}
.sb-prospect-kicker{color:var(--sb-prospect-blue)}.sb-prospect-kicker i{background:var(--sb-prospect-blue);box-shadow:0 0 0 4px rgba(47,128,237,.12)}
.sb-prospect-button{border-color:#d4d4d4;color:#525252}.sb-prospect-button:hover{border-color:#a3a3a3;background:#fafafa}.sb-prospect-button.primary{border-color:var(--sb-prospect-neutral);background:var(--sb-prospect-neutral)}.sb-prospect-button.primary:hover{background:#3a3a3a}
.sb-prospect-panel{border-color:#e5e5e5}.sb-prospect-filter:hover{background:#f4f4f5}.sb-prospect-filter.is-active{border-color:var(--sb-prospect-neutral);color:#fff;background:var(--sb-prospect-neutral)}
.sb-prospect-search{border-color:#e5e5e5;background:#fff;color:#3f3f46}.sb-prospect-search:focus{border-color:var(--sb-prospect-blue);box-shadow:0 0 0 3px rgba(47,128,237,.12)}
.sb-prospect-view-toggle{background:#f0f0f1}.sb-prospect-view{color:#858585}.sb-prospect-view.is-active{color:#262626;background:#fff}
.sb-prospect-tag-manager{border-color:#e5e5e5;box-shadow:0 14px 32px rgba(0,0,0,.12)}.sb-prospect-tag-chip{border-color:#e5e5e5;color:#737373;background:#fafafa}.sb-prospect-tag-chip.is-used{border-color:#cbdcf8;color:var(--sb-prospect-blue);background:var(--sb-prospect-blue-soft)}.sb-prospect-tag-input input{border-color:#e5e5e5}.sb-prospect-tag-input button,.sb-prospect-tag-ai{border-color:#cbdcf8;color:var(--sb-prospect-blue);background:var(--sb-prospect-blue-soft)}
.sb-prospect-bulk{color:#626262;background:#f4f4f5}.sb-prospect-bulk strong{color:#262626}.sb-prospect-bulk button{border-color:#d4d4d4;color:#525252;background:#fff}.sb-prospect-bulk button:hover{background:#fafafa}
.sb-prospect-table input[type="checkbox"]{accent-color:var(--sb-prospect-blue)}.sb-prospect-row:hover td{background:#fafafa}.sb-prospect-row.is-selected td{background:#fafafa}.sb-prospect-avatar{color:#262626;background:#f0f1f2}.sb-prospect-score{color:var(--sb-prospect-blue);background:var(--sb-prospect-blue-soft)}.sb-prospect-score.is-mid{color:#727b83;background:#f0f1f2}
.sb-prospect-status.is-hot{color:var(--sb-prospect-blue)}.sb-prospect-status.is-hot::before{background:var(--sb-prospect-blue)}.sb-prospect-status.is-research{color:#a87529}.sb-prospect-status.is-research::before{background:#e4a249}
.sb-prospect-card{border-color:#e5e5e5}.sb-prospect-card:hover,.sb-prospect-card.is-selected{border-color:#d4d4d4;background:#fafafa}.sb-prospect-card-score{color:var(--sb-prospect-blue)}.sb-prospect-card-tag{color:#626262;background:#f0f1f2}
.sb-prospect-group-title{color:#676767;border-color:#e5e5e5}.sb-prospect-group-item:hover{background:#fafafa}
.sb-prospect-detail-tab.is-active{color:var(--sb-prospect-blue);background:var(--sb-prospect-blue-soft)}.sb-prospect-detail-top{border-color:#e5e5e5}.sb-prospect-detail-avatar{background:var(--sb-prospect-neutral)}.sb-prospect-detail-score{color:var(--sb-prospect-blue)}.sb-prospect-detail-note{color:#525252;background:#f4f4f5}.sb-prospect-detail-section{border-color:#e5e5e5}.sb-prospect-detail-tag{color:#626262;background:#f0f1f2}.sb-prospect-detail-tag button{color:#858585}
.sb-prospect-timeline-item i{background:var(--sb-prospect-blue);box-shadow:0 0 0 3px rgba(47,128,237,.12)}.sb-prospect-execution{background:#f4f4f5}.sb-prospect-execution-dot.is-running,.sb-prospect-execution-dot.is-done{background:var(--sb-prospect-blue);box-shadow:0 0 0 4px rgba(47,128,237,.12)}.sb-prospect-detail-actions button{border-color:#d4d4d4;color:#525252}.sb-prospect-detail-actions button.primary{border-color:var(--sb-prospect-neutral);color:#fff;background:var(--sb-prospect-neutral)}.sb-prospect-detail-actions button:hover{background:#fafafa}.sb-prospect-detail-actions button.primary:hover{background:#3a3a3a}
.sb-prospect-toast{border-color:#d4d4d4;color:#525252;background:#f4f4f5;box-shadow:0 10px 30px rgba(0,0,0,.1)}
.sb-prospect-loop{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:0;border:1px solid #d8dce3;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(28,39,55,.08);overflow:hidden}.sb-prospect-loop-step{position:relative;display:flex;align-items:center;gap:14px;min-width:0;min-height:88px;padding:18px 22px;border:0;border-right:1px solid #e5e7eb;background:#fff;text-align:left;font:inherit;cursor:pointer}.sb-prospect-loop-step:last-child{border-right:0}.sb-prospect-loop-step:hover{background:#f8f9fb}.sb-prospect-loop-step:focus-visible{z-index:1;outline:2px solid #2f80ed;outline-offset:-2px}.sb-prospect-loop-step::before{content:"";width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#262626;box-shadow:0 0 0 5px rgba(38,38,38,.07)}.sb-prospect-loop-step:nth-child(2)::before{background:#2f80ed;box-shadow:0 0 0 5px rgba(47,128,237,.09)}.sb-prospect-loop-step:nth-child(3)::before{background:#6b7280;box-shadow:0 0 0 5px rgba(107,114,128,.08)}.sb-prospect-loop-step:nth-child(4)::before{background:#a87529;box-shadow:0 0 0 5px rgba(168,117,41,.09)}.sb-prospect-loop-step::after{content:"→";margin-left:2px;color:#adb5c0;font-size:17px}.sb-prospect-loop-step:last-child::after{content:""}.sb-prospect-loop-copy{min-width:0;flex:1}.sb-prospect-loop-label{display:block;color:#262626;font-size:13px;font-weight:780}.sb-prospect-loop-meta{display:block;margin-top:5px;color:#92979d;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-prospect-loop-value{margin-left:auto;color:#262626;font-size:25px;font-weight:820}.sb-prospect-loop-step:nth-child(2) .sb-prospect-loop-value{color:#2f80ed}.sb-prospect-loop-step:nth-child(3) .sb-prospect-loop-value{color:#596273}.sb-prospect-loop-step:nth-child(4) .sb-prospect-loop-value{color:#a87529}
.sb-prospect-detail-status{display:inline-flex;align-items:center;gap:5px;margin-top:7px;padding:3px 7px;border-radius:6px;color:#2f80ed;background:#edf3ff;font-size:9.5px;font-weight:650}.sb-prospect-detail-status::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}.sb-prospect-detail-suggestion{margin-top:10px;padding:10px 11px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa;color:#525252;font-size:10px;line-height:1.55}.sb-prospect-detail-suggestion strong{display:block;margin-bottom:3px;color:#262626;font-size:10.5px}
.sb-prospect-task-run{display:flex;align-items:center;gap:12px;margin-top:10px;padding:10px 13px;border:1px solid #e5e5e5;border-radius:10px;background:#fff}.sb-prospect-task-run-copy{min-width:0;flex:1}.sb-prospect-task-run-title{color:#262626;font-size:11px;font-weight:750}.sb-prospect-task-run-meta{margin-top:3px;color:#858585;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-prospect-task-run-progress{width:112px;height:5px;border-radius:99px;background:#f0f1f2;overflow:hidden}.sb-prospect-task-run-progress i{display:block;height:100%;border-radius:99px;background:#2f80ed}.sb-prospect-task-run-state{color:#2f80ed;font-size:9.5px;font-weight:650;white-space:nowrap}.sb-prospect-task-run button{height:27px;padding:0 9px;border:1px solid #d4d4d4;border-radius:6px;background:#fff;color:#525252;font:inherit;font-size:9.5px;cursor:pointer}.sb-prospect-task-run button:hover{background:#fafafa}
.sb-prospect-timeline-stage{justify-self:start;margin-left:0;padding:2px 5px;border-radius:4px;color:#727b83;background:#f0f1f2;font-size:8.5px;white-space:nowrap}.sb-prospect-timeline-item{grid-template-columns:10px minmax(0,1fr) auto auto}
.sb-prospect-modal{position:fixed;inset:0;z-index:6;display:grid;place-items:center;padding:22px;background:rgba(20,22,25,.24);backdrop-filter:blur(3px)}.sb-prospect-modal-card{width:min(460px,100%);padding:20px;border:1px solid #e5e5e5;border-radius:14px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.16)}.sb-prospect-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sb-prospect-modal-title{color:#262626;font-size:16px;font-weight:750}.sb-prospect-modal-copy{margin-top:5px;color:#858585;font-size:10.5px;line-height:1.5}.sb-prospect-modal-close{width:28px;height:28px;border:0;border-radius:7px;background:#f4f4f5;color:#727272;font-size:15px;cursor:pointer}.sb-prospect-modal-fields{display:grid;gap:12px;margin-top:18px}.sb-prospect-modal-field{display:grid;gap:6px;color:#626262;font-size:10.5px;font-weight:650}.sb-prospect-modal-field input,.sb-prospect-modal-field select{height:34px;box-sizing:border-box;padding:0 9px;border:1px solid #e5e5e5;border-radius:7px;outline:none;color:#3f3f46;background:#fff;font:inherit;font-size:11px}.sb-prospect-modal-field input:focus,.sb-prospect-modal-field select:focus{border-color:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-prospect-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.sb-prospect-modal-actions button{height:33px;padding:0 12px;border:1px solid #d4d4d4;border-radius:7px;background:#fff;color:#525252;font:inherit;font-size:10.5px;cursor:pointer}.sb-prospect-modal-actions button.primary{border-color:#262626;background:#262626;color:#fff}.sb-prospect-modal-actions button:hover{background:#fafafa}.sb-prospect-modal-actions button.primary:hover{background:#3a3a3a}
@media(max-width:1250px){.sb-prospect-loop{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-prospect-loop-step{border-bottom:1px solid #e5e7eb}.sb-prospect-loop-step:nth-child(2){border-right:0}.sb-prospect-loop-step:nth-last-child(-n+2){border-bottom:0}}
@media(max-width:760px){.sb-prospect-loop{grid-template-columns:1fr}.sb-prospect-loop-step{border-right:0;border-bottom:1px solid #ededed}.sb-prospect-loop-step:nth-child(2){border-bottom:1px solid #ededed}.sb-prospect-loop-step:last-child{border-bottom:0}}
.sb-result-tabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:18px}.sb-result-tab{height:31px;padding:0 12px;border:1px solid #e5e5e5;border-radius:7px;color:#737373;background:#fff;font:inherit;font-size:10.5px;cursor:pointer}.sb-result-tab:hover{border-color:#b8c7dc;background:#fafafa}.sb-result-tab.is-active{border-color:#262626;color:#fff;background:#262626;font-weight:700}.sb-result-tab-count{margin-left:5px;color:#a0a0a0;font-size:9px}.sb-result-tab.is-active .sb-result-tab-count{color:#d4d4d4}.sb-result-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 16px;border-bottom:1px solid #f0f0f0}.sb-result-toolbar .sb-prospect-search{margin-left:auto}.sb-result-card-list{display:grid;gap:1px;padding:7px 9px 12px}.sb-result-card{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:11px;align-items:start;padding:13px 10px;border:1px solid transparent;border-radius:9px;cursor:pointer}.sb-result-card:hover{background:#fafafa}.sb-result-card.is-selected{border-color:#d4d4d4;background:#f7f9fd}.sb-result-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;color:#fff;background:#262626;font-size:10px;font-weight:750}.sb-result-icon.research{background:#67758d}.sb-result-icon.comment{background:#3f7d9e}.sb-result-icon.content{background:#8c6b47}.sb-result-icon.outreach{background:#587c64}.sb-result-card-copy{min-width:0}.sb-result-card-title{color:#262626;font-size:12px;font-weight:750}.sb-result-card-summary{margin-top:4px;color:#737373;font-size:10px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-result-card-meta{display:flex;gap:8px;margin-top:7px;color:#a0a0a0;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-result-card-side{text-align:right}.sb-result-type{display:inline-flex;padding:3px 6px;border-radius:5px;color:#2f80ed;background:#edf3ff;font-size:9px;font-weight:650;white-space:nowrap}.sb-result-card-side time{display:block;margin-top:8px;color:#a0a0a0;font-size:9px}.sb-result-counts{display:flex;gap:6px;margin-top:8px}.sb-result-count{padding:3px 6px;border-radius:5px;color:#626262;background:#f0f1f2;font-size:9px}.sb-result-detail-kicker{color:#2f80ed;font-size:9.5px;font-weight:650}.sb-result-detail-title{margin-top:6px;color:#262626;font-size:16px;font-weight:750;line-height:1.35}.sb-result-detail-summary{margin-top:11px;padding:11px;border-radius:8px;color:#525252;background:#f4f4f5;font-size:10.5px;line-height:1.6}.sb-result-detail-section{padding:14px 0;border-top:1px solid #e5e5e5}.sb-result-detail-section-title{display:flex;justify-content:space-between;gap:10px;color:#626262;font-size:11px;font-weight:700}.sb-result-detail-section-title span{color:#a0a0a0;font-size:9.5px;font-weight:500}.sb-result-detail-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}.sb-result-detail-metric{padding:9px;border:1px solid #e5e5e5;border-radius:7px;background:#fafafa}.sb-result-detail-metric strong{display:block;color:#262626;font-size:15px}.sb-result-detail-metric span{display:block;margin-top:3px;color:#858585;font-size:9px}.sb-result-artifacts{display:grid;gap:7px;margin-top:10px}.sb-result-artifact{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e5e5;border-radius:7px;color:#525252;background:#fff;font-size:10px}.sb-result-artifact i{width:6px;height:6px;border-radius:50%;background:#2f80ed}.sb-result-artifact-copy{min-width:0;flex:1}.sb-result-artifact strong{display:block;color:#262626;font-size:10.5px}.sb-result-artifact span{display:block;margin-top:3px;color:#929292;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-result-detail-actions{display:flex;gap:7px;margin-top:14px}.sb-result-detail-actions button{height:31px;flex:1;border:1px solid #d4d4d4;border-radius:7px;color:#525252;background:#fff;font:inherit;font-size:10px;cursor:pointer}.sb-result-detail-actions button.primary{border-color:#262626;color:#fff;background:#262626}.sb-result-detail-actions button:hover{background:#fafafa}.sb-result-detail-actions button.primary:hover{background:#3a3a3a}.sb-results-empty{padding:46px 18px;color:#a0a0a0;font-size:11px;line-height:1.6;text-align:center}.sb-results-empty strong{display:block;margin-bottom:6px;color:#626262;font-size:13px}@media(max-width:760px){.sb-result-tabs{margin-top:14px}.sb-result-toolbar .sb-prospect-search{margin-left:0}.sb-result-card{grid-template-columns:30px minmax(0,1fr)}.sb-result-icon{width:30px;height:30px}.sb-result-card-side{grid-column:2;text-align:left}.sb-result-card-side time{display:inline-block;margin:6px 0 0 8px}}
.sb-result-comment-list{display:grid;gap:8px;margin-top:10px}.sb-result-comment{padding:10px;border:1px solid #e5e5e5;border-radius:8px;background:#fff}.sb-result-comment-head{display:flex;align-items:center;gap:7px}.sb-result-comment-avatar{display:grid;place-items:center;width:25px;height:25px;border-radius:7px;color:#fff;background:#262626;font-size:10px;font-weight:750}.sb-result-comment-user{min-width:0;flex:1}.sb-result-comment-user strong{display:block;color:#262626;font-size:10.5px}.sb-result-comment-user span{display:block;margin-top:2px;color:#929292;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-result-comment-confidence{color:#2f80ed;font-size:9px;white-space:nowrap}.sb-result-comment-quote{margin:9px 0 0;color:#343434;font-size:11px;line-height:1.55}.sb-result-comment-meta{display:flex;gap:7px;align-items:center;margin-top:8px;color:#858585;font-size:9px;line-height:1.4}.sb-result-comment-meta a{min-width:0;overflow:hidden;color:#5d78a8;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.sb-result-comment-meta a:hover{text-decoration:underline}.sb-result-comment-reason{margin-top:7px;color:#737373;font-size:9.5px;line-height:1.45}.sb-result-comment-signals{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.sb-result-comment-signal{padding:2px 5px;border-radius:4px;color:#626262;background:#f0f1f2;font-size:8.5px}
.sb-result-outreach-toolbar{display:flex;align-items:center;gap:8px;margin-top:11px;padding:9px;border:1px solid #dbe5f5;border-radius:8px;background:#f7f9fd}.sb-result-outreach-toolbar strong{color:#262626;font-size:10px}.sb-result-outreach-toolbar span{min-width:0;flex:1;color:#737b86;font-size:9px}.sb-result-outreach-toolbar button{height:27px;padding:0 9px;border:1px solid #d4d4d4;border-radius:6px;color:#525252;background:#fff;font:inherit;font-size:10px;cursor:pointer}.sb-result-outreach-toolbar button.primary{border-color:#262626;color:#fff;background:#262626}.sb-result-outreach-toolbar button:disabled{opacity:.45;cursor:not-allowed}.sb-result-comment-check{width:15px;height:15px;flex:none;accent-color:#2f80ed}.sb-result-comment-check:disabled{opacity:.35}.sb-result-comment.is-selected{border-color:#b8cdef;background:#f7f9fd}
.sb-finder-run-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}.sb-finder-run-stat{padding:9px;border:1px solid #e5e5e5;border-radius:7px;background:#fafafa}.sb-finder-run-stat strong{display:block;color:#262626;font-size:16px}.sb-finder-run-stat span{display:block;margin-top:3px;color:#858585;font-size:9px}.sb-finder-account-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px;padding:9px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa}.sb-finder-account-filter{height:26px;padding:0 8px;border:1px solid transparent;border-radius:6px;color:#737373;background:transparent;font:inherit;font-size:10px;cursor:pointer}.sb-finder-account-filter.is-active{border-color:#262626;color:#fff;background:#262626}.sb-finder-account-search{min-width:140px;flex:1;height:27px;box-sizing:border-box;padding:0 9px;border:1px solid #e5e5e5;border-radius:6px;outline:none;font:inherit;font-size:10px}.sb-finder-account-search:focus{border-color:#2f80ed;box-shadow:0 0 0 3px rgba(47,128,237,.1)}.sb-finder-account-bulk{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding:8px 9px;border:1px solid #dbe5f5;border-radius:7px;background:#f7f9fd;color:#626262;font-size:10px}.sb-finder-account-bulk strong{color:#262626}.sb-finder-account-bulk button{height:25px;padding:0 8px;border:1px solid #d4d4d4;border-radius:6px;color:#525252;background:#fff;font:inherit;font-size:10px;cursor:pointer}.sb-finder-account-bulk button.primary{border-color:#262626;color:#fff;background:#262626}.sb-finder-account-table-wrap{overflow:auto;margin-top:8px;border:1px solid #e5e5e5;border-radius:8px}.sb-finder-account-table{width:100%;min-width:650px;border-collapse:collapse}.sb-finder-account-table th{padding:8px 7px;color:#999;font-size:9px;font-weight:600;text-align:left;white-space:nowrap;background:#fafafa}.sb-finder-account-table td{padding:9px 7px;border-top:1px solid #f0f0f0;color:#525252;font-size:10px;vertical-align:top}.sb-finder-account-table tr{cursor:pointer}.sb-finder-account-table tr:hover td,.sb-finder-account-table tr.is-selected td{background:#f7f9fd}.sb-finder-account-check{width:15px;height:15px;accent-color:#2f80ed}.sb-finder-account-name{display:block;color:#262626;font-weight:700}.sb-finder-account-handle{display:block;margin-top:3px;color:#999;font-size:9px;white-space:nowrap;max-width:145px;overflow:hidden;text-overflow:ellipsis}.sb-finder-account-link{color:#2f80ed;text-decoration:none}.sb-finder-account-link:hover{text-decoration:underline}.sb-finder-account-score{display:inline-flex;min-width:27px;justify-content:center;padding:3px 5px;border-radius:5px;color:#2f80ed;background:#edf3ff;font-weight:750}.sb-finder-account-state{display:inline-flex;padding:3px 6px;border-radius:5px;color:#626262;background:#f0f1f2;white-space:nowrap}.sb-finder-account-state.is-match{color:#16794f;background:#eaf8ef}.sb-finder-account-state.is-review{color:#9a701f;background:#fff4dc}.sb-finder-account-reason{display:block;max-width:220px;color:#737373;line-height:1.45}.sb-finder-account-tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:4px}.sb-finder-account-tag{padding:2px 4px;border-radius:4px;color:#626262;background:#f0f1f2;font-size:8px}.sb-finder-account-empty{padding:28px 12px;color:#999;font-size:10px;text-align:center}
.sb-prospect-avatar,.sb-prospect-detail-avatar,.sb-result-comment-avatar,.sb-finder-account-avatar,.sb-outreach-avatar,.sb-research-target-avatar,.sb-result-person-avatar{overflow:hidden}.sb-prospect-avatar img,.sb-prospect-detail-avatar img,.sb-result-comment-avatar img,.sb-finder-account-avatar img,.sb-outreach-avatar img,.sb-research-target-avatar img,.sb-result-person-avatar img{display:block;width:100%;height:100%;object-fit:cover}.sb-finder-account-person{display:flex;align-items:center;gap:7px;min-width:145px}.sb-finder-account-avatar{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:8px;color:#626262;background:#f0f1f2;font-size:10px;font-weight:700}.sb-finder-account-copy{min-width:0}.sb-outreach-party-main{display:flex;align-items:center;gap:7px;margin-top:4px}.sb-outreach-party-main strong{margin-top:0}.sb-outreach-avatar{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:8px;color:#fff;background:#626262;font-size:10px;font-weight:700}.sb-outreach-target-identity{display:flex;align-items:center;gap:8px;min-width:0}.sb-research-target-avatar{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:8px;color:#626262;background:#f0f1f2;font-size:9px;font-weight:700}.sb-result-person-avatar{color:#626262;background:#f0f1f2}
.sb-result-artifact.is-openable{width:100%;cursor:pointer;font:inherit;text-align:left}.sb-result-artifact.is-openable:hover{border-color:#b9cce9;background:#f8fbff}
`;

const CONSUMER_CSS = `
.sb-discovery-context-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:7px}.sb-discovery-context-stat{padding:9px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}.sb-discovery-context-stat strong{display:block;color:#20252b;font-size:16px;line-height:1.1}.sb-discovery-context-stat span{display:block;margin-top:4px;color:#788391;font-size:9px}.sb-discovery-context-boundary{margin-top:7px;padding-top:8px;border-top:1px solid #e6ebf1;color:#626b78;font-size:10px;line-height:1.55}.sb-discovery-context-warning{color:#a87529;font-size:10px;line-height:1.5}
.sb-page--prospect-center>.sb-page-head{display:none}.sb-page--prospect-center>.sb-page-body{min-height:0}
.sb-prospect-page{padding:22px 42px 48px;background:#f4f6f8}
.sb-discovery-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 0 18px;padding:4px 0 2px}.sb-discovery-heading h1{margin:0;color:#20252b;font-size:30px;line-height:1.2;font-weight:780}.sb-discovery-heading p{max-width:520px;margin:0;color:#7a8490;font-size:13px;line-height:1.6;text-align:right}.sb-prospect-page--standalone-discovery .sb-prospect-workspace{margin-top:0}
.sb-discovery-task-browser{padding:14px 16px 12px;border-bottom:1px solid #edf0f3;background:#fbfcfe}.sb-discovery-task-browser-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.sb-discovery-task-browser-title{color:#20252b;font-size:12px;font-weight:750}.sb-discovery-task-browser-meta{color:#9aa3ae;font-size:10px}.sb-discovery-task-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin-top:11px}.sb-discovery-task{min-width:0;padding:10px 11px;border:1px solid #e1e6ed;border-radius:9px;color:#626b78;background:#fff;font:inherit;text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}.sb-discovery-task:hover{border-color:#b8c9e5;background:#f8faff;transform:translateY(-1px)}.sb-discovery-task.is-active{border-color:#2f80ed;background:#edf3ff;box-shadow:0 3px 10px rgba(47,128,237,.1)}.sb-discovery-task-name{display:block;overflow:hidden;color:#20252b;font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.sb-discovery-task-profile{display:block;margin-top:5px;overflow:hidden;color:#788391;font-size:10px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}.sb-discovery-task-meta{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:8px;color:#9aa3ae;font-size:9px}.sb-discovery-task-count{color:#2f80ed;font-weight:700}.sb-discovery-context{display:grid;gap:5px;padding:14px 16px;border-bottom:1px solid #edf0f3;background:#f7f9fc}.sb-discovery-context>button{justify-self:start;margin-top:4px}.sb-discovery-context-kicker{color:#2f80ed;font-size:10px;font-weight:700}.sb-discovery-context-title{color:#20252b;font-size:15px;font-weight:750;line-height:1.4}.sb-discovery-context-profile{color:#626b78;font-size:11px;line-height:1.5}.sb-discovery-context-note{color:#9aa3ae;font-size:10px}.sb-discovery-task-empty{padding:9px 0;color:#9aa3ae;font-size:10px}
@media(max-width:760px){.sb-discovery-heading{align-items:flex-start;flex-direction:column;gap:6px}.sb-discovery-heading p{text-align:left}.sb-discovery-task-list{grid-template-columns:1fr}.sb-discovery-task-browser-head{align-items:flex-start;flex-direction:column;gap:3px}}
.sb-consumer-nav{display:flex;align-items:center;gap:6px;margin:0 0 22px;padding:5px;border:1px solid #e1e5eb;border-radius:11px;background:#eceff3}.sb-consumer-nav-item{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 15px;border:0;border-radius:8px;color:#626b78;background:transparent;font:inherit;font-size:14px;cursor:pointer}.sb-consumer-nav-item:hover{color:#20252b;background:#f7f8fa}.sb-consumer-nav-item.is-active{color:#20252b;background:#fff;box-shadow:0 1px 5px rgba(28,39,55,.1);font-weight:700}.sb-consumer-nav-count{color:#9aa2ad;font-size:11px;font-weight:600}.sb-consumer-nav-item.is-active .sb-consumer-nav-count{color:#2f80ed}
.sb-consumer-overview{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:24px;align-items:start}.sb-consumer-overview-main{min-width:0}.sb-consumer-title{max-width:760px;margin-top:0;color:#20252b;font-size:38px;line-height:1.18;letter-spacing:0;font-weight:780}.sb-consumer-subtitle{max-width:680px;margin-top:12px;color:#66707c;font-size:15px;line-height:1.6}.sb-consumer-attention{display:flex;align-items:center;gap:22px;margin-top:28px;padding:24px 26px;border:1px solid #cbdcf8;border-radius:16px;background:#eaf2ff;box-shadow:0 8px 22px rgba(45,83,140,.06)}.sb-consumer-attention-copy{min-width:0;flex:1}.sb-consumer-attention-kicker{color:#2f80ed;font-size:12px;font-weight:700}.sb-consumer-attention-title{margin-top:8px;color:#20252b;font-size:22px;font-weight:750}.sb-consumer-attention-description{margin-top:7px;color:#66707c;font-size:14px;line-height:1.55}.sb-consumer-attention button{height:42px;flex:none;padding:0 17px;border:0;border-radius:9px;color:#fff;background:#20252b;font:inherit;font-size:14px;font-weight:700;cursor:pointer}.sb-consumer-attention button:hover{background:#343b44}.sb-consumer-section{margin-top:30px;padding:22px 25px;border:1px solid #e0e5eb;border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(28,39,55,.035)}.sb-consumer-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding-bottom:13px;border-bottom:1px solid #e5e8ed}.sb-consumer-section-title{color:#20252b;font-size:17px;font-weight:750}.sb-consumer-section-meta{color:#8d97a3;font-size:12px}.sb-consumer-run-list{display:grid;gap:0}.sb-consumer-run{display:grid;grid-template-columns:11px minmax(0,1fr) auto;gap:13px;align-items:start;padding:18px 2px;border-bottom:1px solid #edf0f3}.sb-consumer-run:last-child{border-bottom:0}.sb-consumer-run i{width:8px;height:8px;margin-top:6px;border-radius:50%;background:#2f80ed;box-shadow:0 0 0 5px rgba(47,128,237,.1)}.sb-consumer-run-copy{min-width:0}.sb-consumer-run-agent{color:#7b8590;font-size:13px}.sb-consumer-run-narrative{margin-top:7px;color:#20252b;font-size:16px;line-height:1.5}.sb-consumer-run-meta{display:flex;gap:8px;margin-top:8px;color:#9aa2ad;font-size:12px}.sb-consumer-run button{height:32px;padding:0 12px;border:1px solid #d2d8e0;border-radius:8px;color:#4f5965;background:#fff;font:inherit;font-size:13px;cursor:pointer}.sb-consumer-run button:hover{background:#f5f7f9}.sb-consumer-side{padding:24px 25px;border:1px solid #e0e5eb;border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(28,39,55,.035)}.sb-consumer-side-title{color:#20252b;font-size:18px;font-weight:750}.sb-consumer-side-copy{margin-top:8px;color:#8a949f;font-size:13px;line-height:1.6}.sb-consumer-status-list{margin-top:21px;border-top:1px solid #e5e8ed}.sb-consumer-status-row{display:flex;align-items:center;gap:12px;width:100%;padding:17px 0;border:0;border-bottom:1px solid #edf0f3;background:transparent;color:#4f5965;font:inherit;text-align:left;cursor:pointer}.sb-consumer-status-row:hover .sb-consumer-status-label{color:#2f80ed}.sb-consumer-status-dot{width:8px;height:8px;border-radius:50%;background:#a4acb5}.sb-consumer-status-dot.is-blue{background:#2f80ed}.sb-consumer-status-dot.is-gold{background:#a87529}.sb-consumer-status-label{flex:1;font-size:14px}.sb-consumer-status-value{color:#20252b;font-size:20px;font-weight:750}.sb-consumer-secondary-actions{display:flex;gap:9px;margin-top:25px}.sb-consumer-secondary-actions button{height:36px;padding:0 13px;border:1px solid #d2d8e0;border-radius:8px;color:#4f5965;background:#fff;font:inherit;font-size:13px;cursor:pointer}.sb-consumer-secondary-actions button:hover{background:#f5f7f9}.sb-consumer-empty{padding:34px 0;color:#89939e;font-size:14px;line-height:1.6}.sb-consumer-empty button{height:36px;margin-top:14px;padding:0 14px;border:0;border-radius:8px;color:#fff;background:#20252b;font:inherit;font-size:13px;cursor:pointer}@media(max-width:900px){.sb-consumer-overview{grid-template-columns:1fr}.sb-consumer-side{padding-top:22px}}@media(max-width:760px){.sb-prospect-page{padding:16px 16px 30px}.sb-consumer-nav{overflow:auto}.sb-consumer-nav-item{height:36px;padding:0 12px;white-space:nowrap;font-size:13px}.sb-consumer-title{font-size:30px}.sb-consumer-subtitle{font-size:14px}.sb-consumer-attention{align-items:flex-start;flex-direction:column;gap:14px}.sb-consumer-attention button{width:100%}.sb-consumer-run{grid-template-columns:9px minmax(0,1fr)}.sb-consumer-run button{grid-column:2;justify-self:start}}
`;

const DISCOVERY_RESULTS_CSS = `
.sb-prospect-page--standalone-discovery{display:flex;overflow:hidden}.sb-prospect-page--standalone-discovery .sb-prospect-shell{display:flex;flex:1;flex-direction:column;width:100%;min-height:0}.sb-prospect-page--standalone-discovery .sb-prospect-workspace{align-items:stretch;flex:1;min-height:0}.sb-prospect-page--standalone-discovery .sb-discovery-heading{align-items:center;margin:0 0 20px;padding:2px 0}.sb-discovery-heading-copy{display:grid;gap:5px;min-width:0}.sb-prospect-page--standalone-discovery .sb-discovery-heading h1{font-size:31px}.sb-prospect-page--standalone-discovery .sb-discovery-heading p{max-width:none;text-align:left;color:#7c8794;font-size:12px}.sb-discovery-heading-note{display:inline-flex;align-items:center;flex:none;padding:6px 9px;border-radius:6px;color:#687483;background:#eaf0f7;font-size:10px;font-weight:650}
.sb-discovery-task-kicker{display:block;margin-bottom:4px;color:#2f80ed;font-size:9px;font-weight:700;line-height:1.2}.sb-discovery-task-kicker+.sb-discovery-task-name{margin-top:0}
.sb-prospect-page--standalone-discovery .sb-prospect-workspace{grid-template-columns:minmax(0,1.65fr) minmax(310px,.72fr);gap:16px}.sb-prospect-page--standalone-discovery .sb-prospect-panel{height:100%;min-height:0;overflow:hidden;border-color:#e0e5eb;box-shadow:0 4px 14px rgba(28,39,55,.03)}.sb-prospect-page--standalone-discovery .sb-prospect-panel:first-child{display:flex;flex-direction:column}
.sb-prospect-page--standalone-discovery .sb-discovery-task-browser{padding:14px 16px 15px;background:#fff}.sb-prospect-page--standalone-discovery .sb-discovery-task-browser-title{font-size:12px}.sb-prospect-page--standalone-discovery .sb-discovery-task-list{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px;margin-top:10px}.sb-prospect-page--standalone-discovery .sb-discovery-task{padding:10px 12px;border-radius:8px}.sb-prospect-page--standalone-discovery .sb-discovery-task:hover{transform:none}.sb-prospect-page--standalone-discovery .sb-discovery-task.is-active{border-color:#b9d0f5;background:#f7faff;box-shadow:inset 3px 0 #2f80ed}.sb-prospect-page--standalone-discovery .sb-discovery-task-profile{margin-top:4px}.sb-prospect-page--standalone-discovery .sb-discovery-task-meta{margin-top:7px}
.sb-discovery-account-heading{display:flex;align-items:center;gap:8px;min-width:0}.sb-discovery-account-heading .sb-discovery-task-name{min-width:0;flex:1}.sb-discovery-account-avatar{display:grid;place-items:center;width:28px;height:28px;flex:none;overflow:hidden;border-radius:8px;color:#35649e;background:#e7f0ff;font-size:11px;font-weight:750}.sb-discovery-account-avatar img{display:block;width:100%;height:100%;object-fit:cover}
.sb-discovery-source-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}.sb-discovery-source{display:grid;gap:4px;min-width:0;padding:10px 11px;border:1px solid #e1e6ed;border-radius:8px;color:#65707b;background:#fff;font:inherit;text-align:left;cursor:pointer}.sb-discovery-source:hover{border-color:#b8c9e5;background:#f8faff}.sb-discovery-source.is-active{border-color:#b9d0f5;background:#f7faff;box-shadow:inset 3px 0 #2f80ed}.sb-discovery-source-name{overflow:hidden;color:#20252b;font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.sb-discovery-source-copy{color:#7b8794;font-size:9px;line-height:1.45}.sb-discovery-source-meta{color:#2f80ed;font-size:9px;font-weight:700}.sb-discovery-scope-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:16px}.sb-discovery-scope-head strong{color:#3f4954;font-size:11px}.sb-discovery-scope-head span{color:#9aa3ae;font-size:10px}.sb-discovery-task.is-compact{min-height:72px}.sb-discovery-task.is-compact .sb-discovery-task-profile{white-space:normal}.sb-discovery-capability{display:inline-flex;align-items:center;flex:none;padding:5px 8px;border-radius:6px;color:#2f80ed;background:#edf3ff;font-size:10px;font-weight:650}.sb-discovery-capability.is-contactable{color:#157347;background:#eaf8ef}
.sb-prospect-page--standalone-discovery .sb-result-panel-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 16px;border-bottom:1px solid #edf0f3}.sb-discovery-results-title{display:grid;gap:3px;min-width:0}.sb-discovery-results-title strong{overflow:hidden;color:#20252b;font-size:15px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.sb-discovery-results-title span{color:#8b95a1;font-size:10px}.sb-discovery-results-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:0}.sb-prospect-page--standalone-discovery .sb-result-toolbar{padding:0;border:0}.sb-prospect-page--standalone-discovery .sb-result-toolbar .sb-prospect-search{width:220px;margin:0}.sb-prospect-page--standalone-discovery .sb-discovery-results-actions .sb-prospect-button{min-width:100px;flex:none;white-space:nowrap}
.sb-prospect-page--standalone-discovery .sb-prospect-bulk{display:flex;align-items:center;gap:7px;min-height:42px;padding:8px 16px;border-bottom:1px solid #edf0f3;background:#f8fafc}.sb-prospect-page--standalone-discovery .sb-prospect-bulk strong{color:#3f4954;font-size:10px}.sb-prospect-page--standalone-discovery .sb-prospect-bulk button{height:27px;padding:0 9px;border-radius:6px;font-size:10px}.sb-prospect-page--standalone-discovery .sb-prospect-bulk button.primary{border-color:#20252b;background:#20252b}.sb-prospect-page--standalone-discovery .sb-prospect-bulk button:disabled{opacity:.42;cursor:not-allowed}.sb-discovery-list-content{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden}.sb-discovery-list-content .sb-prospect-bulk{flex:none}.sb-discovery-list-content .sb-prospect-table-wrap{flex:1;min-height:0;overflow:auto}
.sb-prospect-page--standalone-discovery .sb-prospect-table-wrap{margin:0;border:0;border-radius:0}.sb-prospect-page--standalone-discovery .sb-prospect-table{min-width:680px}.sb-prospect-page--standalone-discovery .sb-prospect-table th{height:37px;padding:0 12px;color:#98a1ac;background:#fbfcfd;font-size:9px}.sb-prospect-page--standalone-discovery .sb-prospect-table td{padding:11px 12px;color:#66707c;font-size:10px;vertical-align:middle}.sb-prospect-page--standalone-discovery .sb-prospect-table tr:hover td,.sb-prospect-page--standalone-discovery .sb-prospect-table tr.is-selected td{background:#f7faff}.sb-prospect-page--standalone-discovery .sb-prospect-person{gap:8px}.sb-prospect-page--standalone-discovery .sb-prospect-avatar{width:32px;height:32px;border-radius:9px}.sb-discovery-profile{max-width:220px;color:#66707c;font-variant-numeric:tabular-nums;line-height:1.55}.sb-discovery-evidence{min-width:180px}.sb-discovery-evidence .sb-prospect-status{margin-bottom:5px}.sb-discovery-evidence-copy{display:block;max-width:250px;color:#56616d;line-height:1.5}.sb-discovery-evidence.is-pending .sb-discovery-evidence-copy{color:#98a1ac}.sb-prospect-page--standalone-discovery .sb-prospect-status{font-size:9px}
.sb-prospect-page--standalone-discovery .sb-prospect-panel:last-child{position:static;display:flex;flex-direction:column;align-self:stretch}.sb-prospect-page--standalone-discovery .sb-prospect-panel:last-child>.sb-prospect-panel-head{flex:none;padding:15px 17px}.sb-prospect-page--standalone-discovery .sb-prospect-detail{flex:1;min-height:0;overflow:auto;padding:17px}.sb-prospect-page--standalone-discovery .sb-prospect-detail-suggestion{background:#f7f9fc;border-color:#e0e7f1}.sb-prospect-page--standalone-discovery .sb-prospect-detail-actions button.primary{border-color:#20252b;background:#20252b}
@media(max-width:1100px){.sb-prospect-page--standalone-discovery .sb-prospect-workspace{grid-template-columns:minmax(0,1fr) 310px}.sb-prospect-page--standalone-discovery .sb-result-toolbar .sb-prospect-search{width:165px}}
@media(max-width:820px){.sb-prospect-page--standalone-discovery{display:block;height:auto;min-height:100%;overflow:auto}.sb-prospect-page--standalone-discovery .sb-prospect-shell{display:block;min-height:0}.sb-prospect-page--standalone-discovery .sb-prospect-workspace{display:grid;grid-template-columns:1fr;flex:none;min-height:auto}.sb-prospect-page--standalone-discovery .sb-prospect-panel,.sb-prospect-page--standalone-discovery .sb-prospect-panel:last-child{display:block;height:auto;min-height:0;overflow:visible}.sb-prospect-page--standalone-discovery .sb-prospect-detail{overflow:visible}.sb-discovery-list-content{display:block;overflow:visible}.sb-discovery-list-content .sb-prospect-table-wrap{overflow:auto}.sb-prospect-page--standalone-discovery .sb-result-panel-head{align-items:flex-start;flex-direction:column}.sb-discovery-results-actions{justify-content:flex-start;width:100%}.sb-prospect-page--standalone-discovery .sb-result-toolbar{flex:1}.sb-prospect-page--standalone-discovery .sb-result-toolbar .sb-prospect-search{width:100%}.sb-prospect-page--standalone-discovery .sb-discovery-heading{align-items:flex-start;flex-direction:column;gap:8px}.sb-discovery-source-tabs{grid-template-columns:1fr}}
`;

const DATA_CSS = `
.sb-prospect-page--data{padding:0;background:#f5f6f8;color:#252a31}
.sb-data-dashboard{max-width:1480px;margin:0 auto;padding:38px 46px 56px}
.sb-data-title{margin:0;color:#20252b;font-size:32px;line-height:1.18;letter-spacing:0;font-weight:780}
.sb-data-subtitle{margin:8px 0 0;color:#788391;font-size:14px;line-height:1.55}
.sb-data-funnel{display:flex;align-items:stretch;margin-top:28px;border:1px solid #e0e5eb;border-radius:17px;background:#fff;box-shadow:0 5px 18px rgba(28,39,55,.035);overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.sb-data-funnel::-webkit-scrollbar{display:none}
.sb-data-funnel-cell{position:relative;display:flex;flex:1 0 148px;flex-direction:column;justify-content:center;min-width:0;min-height:92px;padding:17px 24px}
.sb-data-funnel-label{color:#788391;font-size:13px;line-height:1.4;white-space:nowrap}
.sb-data-funnel-value{margin-top:7px;color:#20252b;font-size:25px;line-height:1;font-weight:760}
.sb-data-funnel-bridge{position:relative;display:flex;flex:0 0 106px;align-items:center;justify-content:center;min-width:0;padding:13px 10px;border-right:1px solid #edf0f3}
.sb-data-funnel-bridge-copy{display:grid;gap:5px;justify-items:center;text-align:center}
.sb-data-funnel-bridge-label{color:#788391;font-size:11px;line-height:1.3;white-space:nowrap}
.sb-data-funnel-bridge-value{color:#20252b;font-size:15px;line-height:1;font-weight:760;white-space:nowrap}
.sb-data-funnel-bridge.is-final{flex-basis:46px;padding:0}
.sb-data-funnel-final{flex:0 0 166px;background:#edf3ff}
.sb-data-funnel-final .sb-data-funnel-value{color:#175fd4;font-size:27px}
.sb-data-funnel-arrow{position:absolute;z-index:1;top:50%;right:-11px;display:grid;place-items:center;width:22px;height:22px;box-sizing:border-box;border:1px solid #dbe1e8;border-radius:50%;color:#2f80ed;background:#fff;font-size:15px;font-style:normal;line-height:1;transform:translateY(-50%)}
.sb-data-result-tabs{display:flex;align-items:center;gap:0;flex-wrap:wrap;margin-top:28px;padding:4px;border-radius:13px;background:#e9ebee}
.sb-data-result-tab{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 22px;border:0;border-radius:10px;color:#717b87;background:transparent;font:inherit;font-size:15px;cursor:pointer}
.sb-data-result-tab:hover{color:#20252b}
.sb-data-result-tab.is-active{color:#20252b;background:#fff;box-shadow:0 1px 5px rgba(28,39,55,.12);font-weight:700}
.sb-data-result-count{color:#9aa3ae;font-size:12px;font-weight:600}
.sb-data-result-tab.is-active .sb-data-result-count{color:#2f80ed}
.sb-data-table-panel{margin-top:28px;border:1px solid #e0e5eb;border-radius:17px;background:#fff;box-shadow:0 5px 18px rgba(28,39,55,.035);overflow:hidden}
.sb-data-table-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:23px 26px 18px;border-bottom:1px solid #e5e8ed}
.sb-data-table-head strong{color:#20252b;font-size:19px;font-weight:750}
.sb-data-table-head span{color:#9aa3ae;font-size:13px}
.sb-data-table-wrap{overflow:auto;padding:0 20px 12px}
.sb-data-table{width:100%;min-width:1080px;border-collapse:collapse;table-layout:fixed}
.sb-data-table th{height:53px;padding:0 14px;color:#788391;background:#fafbfc;font-size:13px;font-weight:650;text-align:left;white-space:nowrap}
.sb-data-table th:first-child{width:24%}.sb-data-table th:nth-child(2){width:11%}.sb-data-table th:nth-child(3){width:11%}.sb-data-table th:nth-child(4){width:11%}.sb-data-table th:nth-child(5){width:14%}.sb-data-table th:nth-child(6){width:12%}.sb-data-table th:nth-child(7){width:9%}.sb-data-table th:nth-child(8){width:8%}.sb-data-table th:last-child{width:10%}
.sb-data-table td{height:72px;padding:0 14px;border-top:1px solid #edf0f3;color:#525c67;font-size:14px;vertical-align:middle}
.sb-data-row{cursor:pointer}.sb-data-row:hover td,.sb-data-row.is-selected td{background:#f8fbff}
.sb-data-person{display:flex;align-items:center;gap:11px;min-width:0}
.sb-data-avatar{display:grid;place-items:center;flex:none;width:38px;height:38px;overflow:hidden;border-radius:11px;color:#626d79;background:#eef0f3;font-size:12px;font-weight:700}
.sb-data-avatar img{display:block;width:100%;height:100%;object-fit:cover}
.sb-data-person-copy{min-width:0}
.sb-data-person-name{display:block;overflow:hidden;color:#252a31;font-size:14px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.sb-data-person-handle{display:block;margin-top:4px;overflow:hidden;color:#a0a8b2;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.sb-data-status{display:inline-flex;align-items:center;gap:8px;color:#18a866;font-size:14px;white-space:nowrap}
.sb-data-status::before{content:"";width:8px;height:8px;border-radius:50%;background:#18b76e}
.sb-data-status.is-research{color:#a87529}.sb-data-status.is-research::before{background:#d6a13a}
.sb-data-status.is-muted{color:#89939e}.sb-data-status.is-muted::before{background:#adb5bf}
.sb-data-status.is-archive{color:#89939e}.sb-data-status.is-archive::before{background:#aab2bb}
.sb-data-muted{overflow:hidden;color:#737e8a;text-overflow:ellipsis;white-space:nowrap}
.sb-data-time{color:#737e8a;white-space:nowrap}
.sb-data-reply{display:inline-flex;align-items:center;gap:8px;color:#89939e;white-space:nowrap}
.sb-data-reply::before{content:"";width:8px;height:8px;border-radius:50%;background:#adb5bf}
.sb-data-reply.is-replied{color:#18a866}.sb-data-reply.is-replied::before{background:#18b76e}
.sb-data-contact-preview{display:block;max-width:180px;margin-top:6px;overflow:hidden;color:#2f80ed;font-size:11px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}
.sb-data-actions{white-space:nowrap}
.sb-data-actions button{height:35px;padding:0 14px;border:1px solid #d4dbe4;border-radius:9px;color:#4f5965;background:#fff;font:inherit;font-size:13px;cursor:pointer}
.sb-data-actions button:hover{border-color:#2f80ed;color:#2f80ed;background:#f8fbff}
.sb-data-actions button.primary{border-color:#20252b;color:#fff;background:#20252b}.sb-data-actions button.primary:hover{border-color:#343b44;background:#343b44}
.sb-data-empty{padding:72px 20px;color:#89939e;font-size:14px;text-align:center}
.sb-data-workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:0;margin-top:28px;align-items:start;view-transition-name:sb-data-workspace;transition:grid-template-columns .34s cubic-bezier(.22,1,.36,1),gap .34s cubic-bezier(.22,1,.36,1)}
.sb-data-workspace.has-detail{grid-template-columns:minmax(0,1fr) 360px;gap:18px}
::view-transition-old(sb-data-workspace),::view-transition-new(sb-data-workspace){animation-duration:.34s;animation-timing-function:cubic-bezier(.22,1,.36,1)}
.sb-data-workspace>.sb-data-table-panel{margin-top:0;min-width:0}
.sb-data-detail-panel{position:sticky;top:18px;min-width:0;border:1px solid #e0e5eb;border-radius:17px;background:#fff;box-shadow:0 5px 18px rgba(28,39,55,.035);overflow:hidden;animation:sb-data-detail-enter .34s cubic-bezier(.22,1,.36,1) both}
@keyframes sb-data-detail-enter{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
.sb-data-detail-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 17px;border-bottom:1px solid #e5e8ed}
.sb-data-detail-head strong{color:#20252b;font-size:18px;font-weight:750}
.sb-data-detail-head span{color:#9aa3ae;font-size:12px}
.sb-data-detail-close{display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid #d4dbe4;border-radius:8px;color:#69737f;background:#fff;font:inherit;font-size:18px;line-height:1;cursor:pointer}
.sb-data-detail-close:hover{border-color:#aeb8c4;color:#20252b;background:#f8fafc}
.sb-data-detail-body{padding:22px}
.sb-data-detail-person{display:flex;align-items:center;gap:12px;padding-bottom:18px;border-bottom:1px solid #edf0f3}
.sb-data-detail-avatar{display:grid;place-items:center;width:48px;height:48px;overflow:hidden;flex:none;border-radius:13px;color:#626d79;background:#eef0f3;font-size:15px;font-weight:700}
.sb-data-detail-avatar img{display:block;width:100%;height:100%;object-fit:cover}
.sb-data-detail-person-copy{min-width:0;flex:1}
.sb-data-detail-name{display:block;overflow:hidden;color:#20252b;font-size:17px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}
.sb-data-detail-handle{display:block;margin-top:5px;overflow:hidden;color:#9aa3ae;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.sb-data-detail-status{display:inline-flex;align-items:center;gap:7px;margin-top:8px;color:#18a866;font-size:12px;font-weight:650}
.sb-data-detail-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#18b76e}
.sb-data-detail-status.is-muted{color:#89939e}.sb-data-detail-status.is-muted::before{background:#adb5bf}
.sb-data-detail-score{flex:none;color:#2f80ed;font-size:25px;font-weight:780;text-align:right}
.sb-data-detail-score small{display:block;margin-top:3px;color:#9aa3ae;font-size:10px;font-weight:500}
.sb-data-capture-card{margin-top:18px;padding:14px;border:1px solid #bed5fb;border-radius:11px;background:#f4f8ff}
.sb-data-capture-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#185ebd;font-size:13px;font-weight:750}
.sb-data-capture-card-head span{display:inline-flex;align-items:center;gap:6px;color:#2f80ed;font-size:11px;font-weight:650}
.sb-data-capture-card-head span::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.sb-data-capture-fields{display:grid;gap:8px;margin-top:12px}
.sb-data-capture-field{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.sb-data-capture-field span{color:#6a7d97;font-size:11px}
.sb-data-capture-field strong{overflow-wrap:anywhere;color:#1e3f70;font-size:14px;font-weight:750;text-align:right}
.sb-data-detail-section{padding:17px 0;border-bottom:1px solid #edf0f3}
.sb-data-detail-section:last-of-type{border-bottom:0}
.sb-data-detail-section-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px;color:#20252b;font-size:13px;font-weight:700}
.sb-data-detail-section-title span{color:#9aa3ae;font-size:11px;font-weight:500}
.sb-data-detail-quote{margin-top:11px;padding:12px;border-radius:9px;color:#525c67;background:#f4f6f8;font-size:12px;line-height:1.6}
.sb-data-detail-list{display:grid;gap:11px;margin:12px 0 0}
.sb-data-detail-item{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px;font-size:12px;line-height:1.5}
.sb-data-detail-item dt{color:#9aa3ae}
.sb-data-detail-item dd{margin:0;overflow-wrap:anywhere;color:#3f4954;font-weight:600}
.sb-data-detail-next{margin-top:14px;padding:12px;border:1px solid #dbe5f5;border-radius:9px;background:#f7f9fd;color:#525c67;font-size:12px;line-height:1.55}
.sb-data-detail-next strong{display:block;margin-bottom:4px;color:#20252b;font-size:12px}
.sb-data-detail-actions{display:flex;gap:8px;padding-top:18px}
.sb-data-detail-actions button{height:36px;flex:1;padding:0 12px;border:1px solid #d4dbe4;border-radius:9px;color:#4f5965;background:#fff;font:inherit;font-size:12px;cursor:pointer}
.sb-data-detail-actions button:hover{border-color:#2f80ed;color:#2f80ed;background:#f8fbff}
.sb-data-detail-actions button.primary{border-color:#20252b;color:#fff;background:#20252b}.sb-data-detail-actions button.primary:hover{border-color:#343b44;background:#343b44}
@media(max-width:1100px){.sb-data-dashboard{padding:30px 28px 44px}.sb-data-funnel-cell{flex-basis:128px;padding-left:15px;padding-right:15px}.sb-data-funnel-bridge{flex-basis:94px}.sb-data-funnel-label{font-size:12px}.sb-data-funnel-value{font-size:21px}.sb-data-funnel-final .sb-data-funnel-value{font-size:22px}}
@media(max-width:1100px){.sb-data-workspace.has-detail{grid-template-columns:minmax(0,1fr) 320px}.sb-data-detail-body{padding:18px}}
@media(max-width:760px){.sb-data-dashboard{padding:22px 16px 34px}.sb-data-title{font-size:28px}.sb-data-funnel{border-radius:13px}.sb-data-funnel-cell{flex-basis:132px;min-height:76px;padding:14px 16px}.sb-data-funnel-bridge{flex-basis:88px}.sb-data-funnel-bridge.is-final{flex-basis:42px}.sb-data-funnel-final{flex-basis:138px}.sb-data-funnel-arrow{width:20px;height:20px;font-size:14px}.sb-data-result-tabs{margin-top:20px;overflow:auto;flex-wrap:nowrap}.sb-data-result-tab{height:38px;padding:0 15px;font-size:14px;white-space:nowrap}.sb-data-table-panel{margin-top:20px;border-radius:13px}.sb-data-table-wrap{padding:0 8px 10px}.sb-data-table th,.sb-data-table td{padding-left:10px;padding-right:10px}.sb-data-workspace{display:block;margin-top:20px}.sb-data-detail-panel{position:relative;top:auto;margin-top:20px;border-radius:13px}.sb-data-detail-head{padding:17px 18px 15px}.sb-data-detail-body{padding:18px}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  for (const [name, text] of [["base", CSS], ["consumer", CONSUMER_CSS], ["discovery-results", DISCOVERY_RESULTS_CSS], ["data", DATA_CSS]]) {
    const style = document.createElement("style");
    style.dataset.sbProspectStyle = name;
    style.textContent = text;
    document.head.appendChild(style);
  }
  styleInjected = true;
}

function scoreClass(score) { return score >= 80 ? "" : " is-mid"; }
function statusClass(status) {
  if (["已触达", "已回复", "跟进中", "已留资", "高意向需二次触达"].includes(status)) return "is-hot";
  if (status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH || status === PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION) return "is-research";
  if (status === "研究中") return "is-research";
  return "is-archive";
}

function isLeadCenterRecord(item) {
  return item?.status === "已留资" || ["成交跟进", "已转化", "已失效"].includes(item?.conversionStatus);
}

function isAwaitingIntentAnalysis(item = {}) {
  const tier = String(item?.tier || item?.intent?.tier || "unknown").toLowerCase();
  return item?.status === "待分析" || (item?.source?.agentId === "mkt-find-people" && !item?.intent && tier === "unknown");
}

function isProspectRecord(item = {}) {
  return isContactableRecord(item) && !isLeadCenterRecord(item) && !isAwaitingIntentAnalysis(item);
}

function runHasExplicitOrigin(run = {}) {
  return Boolean(
    run?.sourceScope
    || run?.inputs?.sourceScope
    || run?.contactability
    || run?.sourceResultType
    || ["mkt-douyin-finder", "mkt-find-people"].includes(run?.agentId)
    || run?.resultType === "抖音找人"
  );
}

function runContactability(run = {}) {
  if (run?.contactability && typeof run.contactability.allowed === "boolean") return run.contactability;
  return contactabilityFor({
    agentId: run.agentId,
    agentName: run.agentName,
    source: run.source,
    sourceScope: run.sourceScope || run.inputs?.sourceScope,
    sourceResultType: run.sourceResultType,
    resultType: run.resultType,
    resultSnapshot: run.resultSnapshot || run
  });
}

function runCanCreateProspects(run = {}) {
  return !runHasExplicitOrigin(run) || runContactability(run).allowed;
}

function contactableDiscoveryCount({ records = [], runs = [] } = {}) {
  const identities = new Set();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    if (isContactableRecord(record)) identities.add(analyzedPersonIdentity(record, `record-${index}`));
  });
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    if (!runCanCreateProspects(run) || run?.resultType === "抖音找人") return;
    analyzedPeople(run).forEach((item, index) => identities.add(analyzedPersonIdentity(item, `${run.taskId || "analysis"}-${index}`)));
  });
  identities.delete("");
  return identities.size;
}

export function normalizePeopleFilter(resultType, filter) {
  const allowed = resultType === "线索" ? LEAD_FILTERS : PROSPECT_FILTERS;
  return allowed.includes(filter) ? filter : "全部";
}

export function prospectSelectionIds(items, fallbackSelection = new Set()) {
  if (!Array.isArray(items)) return fallbackSelection;
  return new Set(items.map((item) => item?.id).filter(Boolean));
}

function sourceText(item) {
  return item?.source?.type || item?.source || "作品评论";
}

export function dashboardReplyLabel(item) {
  if (hasReply(item)) return "已回复";
  if (isTouchedRecord(item)) return "未回复";
  return "未触达";
}

export function dashboardLeadLabel(item) {
  return textValue(
    item?.leadStatus,
    item?.lead_status,
    item?.contactStatus === "已留资" ? item.contactStatus : "",
    item?.status === "已留资" ? item.status : "",
    "未留资"
  );
}

export function dashboardAcquisitionAccount(item) {
  return textValue(
    item?.source?.accountName,
    item?.source?.acquisitionAccountName,
    item?.acquisitionAccountName,
    item?.accountName,
    item?.source?.captureAccountName,
    "未记录"
  );
}

function dashboardTouchLabelForExport(item) {
  if (isTouchedRecord(item)) return "触达成功";
  if (item?.status === "待触达") return "待触达";
  return item?.status || "待判断";
}

function tierLabel(tier) {
  return tier === "high" ? "高意向" : tier === "medium" ? "中意向" : tier === "low" ? "低意向" : "待分析";
}

function formatContact(contact = {}) {
  return contactEntries(contact).map(([label, value]) => `${label}：${value}`).join(" / ");
}

function leadCaptureFieldLabel(field) {
  return { phone: "手机号", email: "邮箱", wechat: "微信号" }[field] || field;
}

export function contactEntries(contact = {}) {
  if (!contact || typeof contact !== "object") return [];
  return ["phone", "email", "wechat"]
    .map((field) => [leadCaptureFieldLabel(field), textValue(contact[field])])
    .filter(([, value]) => Boolean(value));
}

export function leadCaptureContactEntries(item = {}) {
  return contactEntries(item?.contact);
}

function exportCsv(items, { opportunity = false } = {}) {
  const header = opportunity ? "姓名,账号,来源,获客账号,意向评分,触达状态,回复状态,留资状态,留资信息,转化时间,转化说明,负责人\n" : "姓名,账号,来源,获客账号,意向评分,触达状态,回复状态,留资状态,负责人\n";
  const body = items.map((item) => (opportunity
    ? [item.name, item.handle, sourceText(item), dashboardAcquisitionAccount(item), item.score, dashboardTouchLabelForExport(item), dashboardReplyLabel(item), dashboardLeadLabel(item), formatContact(item.contact), item.convertedAt || "", item.conversionNote || "", item.owner]
    : [item.name, item.handle, sourceText(item), dashboardAcquisitionAccount(item), item.score, dashboardTouchLabelForExport(item), dashboardReplyLabel(item), dashboardLeadLabel(item), item.owner]
  ).map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const href = URL.createObjectURL(new Blob([header + body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = opportunity ? "byering-线索清单.csv" : "byering-潜客清单.csv";
  link.click();
  URL.revokeObjectURL(href);
}

function exportDiscoveredCsv(items = []) {
  const header = "用户,账号,来源类型,来源抖音账号,找人任务,目标画像,当前状态,原始内容,意向评分,判断理由,发现时间\n";
  const body = items.map((item) => [item.name, item.handle, item.origin === "own" ? "我的账号互动用户" : item.origin === "public" ? "公域找人" : "历史结果", item.sourceAccount ? sourceDouyinAccountName(item.sourceAccount) : "—", (item.sourceTasks || []).map((task) => task.title).join(" / ") || "—", (item.sourceTasks || []).map((task) => task.profile).join(" / ") || "—", item.status, item.quote, item.score ?? "", item.reason, item.observedAt]
    .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const href = URL.createObjectURL(new Blob([header + body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = "byering-发现用户.csv";
  link.click();
  URL.revokeObjectURL(href);
}

function timelineStage(type) {
  return { score: "分析", research: "分析", compare: "分析", touch: "触达", comment: "挖掘", live: "挖掘", view: "挖掘", save: "挖掘", like: "挖掘", alert: "分析" }[type] || "记录";
}

function openRealtimeWork(run = null) {
  const owner = run && typeof run === "object" ? run : {};
  globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openRealtimeWork?.({
    selectedAgentId: owner.agentId || "Browser Agent",
    taskId: owner.taskId || null,
    taskRunId: owner.taskRunId || null,
    accountId: owner.accountId || null
  }));
}

function openFileCenter(fileId = null, artifact = null) {
  globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openFiles?.({ initialFileId: fileId, artifact }));
}

  function openAgentConversation(run = null) {
  const owner = run && typeof run === "object" ? run : {};
  if (!owner.agentId || !owner.taskId) return;
  globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openChatWith?.({
    agentId: owner.agentId,
    taskId: owner.taskId,
    taskRunId: owner.taskRunId || null,
    accountId: owner.accountId || null
  }));
}

function controlPlaneBaseUrl() {
  return globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
    || document.querySelector('meta[name="salebuddy-control-plane"]')?.content
    || "http://127.0.0.1:6681";
}

const RESULT_TYPES = Object.freeze(["全部成果", "发现", "互动用户", "潜客", "线索", "抖音找人", "用户调研", "触达记录", "评论筛选", "研究简报", "内容产出", "其他成果"]);

function consumerRunNarrative(run = {}) {
  const summary = textValue(run.summary, run.title, "这轮工作已经完成").replace(/[。！？.!?]+$/, "");
  if (run.resultType === "触达记录") return `我刚完成了一轮触达：${summary}。`;
  if (run.resultType === "研究简报" || run.resultType === "用户调研") return `我刚整理了一份${summary}。`;
  return `我刚${summary}。`;
}

export function buildConsumerOverviewModel({ records = [], runs = [] } = {}) {
  const people = Array.isArray(records) ? records : [];
  const resultRuns = Array.isArray(runs) ? runs : [];
  const counts = resultFunnelCounts({ records: people, runs: resultRuns });
  const hasFinderOutput = resultRuns.some((run) => run?.resultType === "抖音找人" && finderResultAccounts(run).length);
  const waitingForReply = people.filter((item) => {
    const legacyWaitingStatus = ["未回复", "高意向需二次触达"].includes(item?.status);
    return (isTouchedRecord(item) && !hasReply(item)) || legacyWaitingStatus;
  }).length;
  const pendingAnalysis = people.filter(isAwaitingIntentAnalysis).length;
  const readyToContact = people.filter((item) => item?.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH).length;
  const waitingForOutreachConfirmation = people.filter(isManualOutreachReady).length;
  const savedLeads = people.filter(isLeadCenterRecord).length;
  let primaryAction;
  if (waitingForReply) {
    primaryAction = { kind: "reply", count: waitingForReply, title: `${waitingForReply} 位客户在等你回复`, description: "先处理最近的对话，别让机会冷掉。", label: "查看待回复" };
  } else if (waitingForOutreachConfirmation) {
    primaryAction = { kind: "contact", count: waitingForOutreachConfirmation, title: `${waitingForOutreachConfirmation} 位潜客等待你确认触达`, description: "客户分析员已经完成判断，确认后才会发出首轮私信。", label: "查看待确认" };
  } else if (readyToContact) {
    primaryAction = { kind: "contact", count: readyToContact, title: `抖音获客管家正在自动触达 ${readyToContact} 位潜客`, description: "找人、分析、触达和对话由自动流程承接。", label: "查看自动进展" };
  } else if (pendingAnalysis) {
    primaryAction = { kind: "analyze", count: pendingAnalysis, title: `有 ${pendingAnalysis} 位互动用户等待分析`, description: "先让客户分析员判断意向，再决定是否触达。", label: "开始分析" };
  } else if (savedLeads) {
    primaryAction = { kind: "lead", count: savedLeads, title: `${savedLeads} 位客户已经进入你的客户资产`, description: "继续跟进已有关系，离成交更近一步。", label: "查看客户资产" };
  } else if (hasFinderOutput && counts.discovered) {
    primaryAction = { kind: "discovery", count: counts.discovered, title: `刚找到 ${counts.discovered} 个符合条件的人`, description: "这些人来自公开内容，只用于查看和账号分析，不直接触达。", label: "查看发现的人" };
  } else if (resultRuns.length) {
    primaryAction = { kind: "review", count: resultRuns.length, title: `Agent 刚完成 ${resultRuns.length} 项工作`, description: "打开最近结果，看看它带回了什么。", label: "查看结果" };
  } else {
    primaryAction = { kind: "start", count: 0, title: "告诉 Agent 你想找什么客户", description: "Agent 会帮你发现、判断和联系客户。", label: "开始找客户" };
  }
  return {
    counts: { ...counts, waitingForReply, pendingAnalysis, readyToContact, waitingForOutreachConfirmation, savedLeads },
    primaryAction,
    recentRuns: resultRuns.slice(0, 4).map((run) => ({ ...run, narrative: consumerRunNarrative(run) }))
  };
}

export function consumerNavigationItems({ records = [], runs = [] } = {}) {
  const counts = buildConsumerOverviewModel({ records, runs }).counts;
  const discoveredCount = discoveredUserItems({ records, runs }).length;
  return [
    { surface: "overview", label: "现在要做的事", count: null, resultType: "全部成果" },
    { surface: "people", label: "发现的人", count: discoveredCount, resultType: "发现" },
    { surface: "touch", label: "联系进展", count: counts.touched, resultType: "触达记录" },
    { surface: "work", label: "Agent 做过的事", count: Array.isArray(runs) ? runs.length : 0, resultType: "全部成果" }
  ];
}

function resultId(run) { return `run:${run.ownerKey || `${run.agentId || "agent"}::${run.taskId || "unknown"}::${run.accountId || ""}`}`; }

export function sourceFinderRunForAnalysis(runs = [], analysisRun = {}) {
  const links = analysisRun.links || analysisRun.resultSnapshot?.links || {};
  const sourceResultId = links.sourceResultId || analysisRun.links?.sourceResultId || analysisRun.resultSnapshot?.sourceResultId || "";
  const sourceTaskId = links.sourceTaskId || analysisRun.links?.sourceTaskId || analysisRun.resultSnapshot?.sourceTaskId || "";
  return (Array.isArray(runs) ? runs : []).find((candidate) => {
    if (candidate?.resultType !== "抖音找人") return false;
    const matchesResult = sourceResultId && [candidate.id, candidate.resultId, resultId(candidate)].includes(sourceResultId);
    return Boolean(matchesResult || (sourceTaskId && candidate.taskId === sourceTaskId));
  }) || null;
}

export function selectedResultIdForType(runs = [], resultType = "全部成果") {
  const selected = runs.find((run) => resultType === "全部成果" || run?.resultType === resultType);
  return selected ? resultId(selected) : null;
}
function resultIconClass(type) {
  return type === "研究简报" ? "research" : type === "评论筛选" ? "comment" : type === "内容产出" ? "content" : type === "触达记录" || type === "用户调研" ? "outreach" : type === "抖音找人" ? "research" : "";
}
function resultIcon(type) {
  return type === "研究简报" ? "研" : type === "评论筛选" ? "筛" : type === "内容产出" ? "文" : type === "用户调研" ? "调" : type === "触达记录" ? "触" : type === "抖音找人" ? "找" : type === "潜客" ? "客" : type === "线索" ? "线" : "果";
}
function resultCountUnit(type) { return type === "发现" || type === "潜客" || type === "线索" ? "人" : "项"; }
function formatResultTime(value) {
  if (!value) return "刚刚";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function resultMetricEntries(run) {
  const source = run?.metrics && Object.keys(run.metrics).length ? run.metrics : run?.counts || {};
  if (run?.resultType === "抖音找人" && !Array.isArray(source)) {
    return [
      ["最终交付", source.delivered ?? run.items?.length ?? 0],
      ["符合主题", source.qualified ?? source.matched ?? 0],
      ["深度核验", source.enriched ?? source.resolved ?? source.screened ?? 0],
      ["搜索候选", source.discovered ?? 0]
    ];
  }
  const labels = { input: "参考账号", discovered: "搜索候选", resolved: "已读取", accounts: "账号", videos: "作品", comments: "评论", candidates: "用户", qualified: "合格用户", matched: "匹配用户", selected: "已选择", unmatched: "未匹配", failed: "发送失败", unknown: "等待回执", high: "高意向", medium: "中意向", low: "低意向", sent: "发送成功", delivered: "已送达", replies: "回复" };
  if (Array.isArray(source)) return source.filter((item) => item && typeof item === "object").map((item) => [item.label || item.key || "指标", item.displayValue ?? item.value ?? "—"]);
  return Object.entries(source).slice(0, 4).map(([label, value]) => [labels[label] || label, value]);
}
function artifactLabel(artifact) {
  if (typeof artifact === "string") return artifact;
  return artifact?.name || artifact?.title || artifact?.type || "可交接成果";
}

function resultEntryTitle(entry) {
  if (entry == null) return "真实结果";
  if (typeof entry !== "object") return String(entry);
  return textValue(entry.title, entry.name, entry.label, entry.nickname, entry.accountName, entry.content, entry.text, entry.status, entry.type, "真实结果");
}

function resultEntrySummary(entry) {
  if (entry == null || typeof entry !== "object") return "";
  const ignored = new Set(["title", "name", "label", "nickname", "accountName", "content", "text", "status", "type"]);
  const values = Object.entries(entry)
    .filter(([key, value]) => !ignored.has(key) && value != null && value !== "" && typeof value !== "object")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${value}`);
  return values.join(" · ");
}

function textValue(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

export function personAvatarHydrationReference(item = {}) {
  const user = item?.user && typeof item.user === "object" ? item.user : {};
  const account = item?.account && typeof item.account === "object" ? item.account : {};
  const accountName = textValue(
    item?.targetName,
    item?.nickname,
    item?.accountName,
    item?.name,
    user.nickname,
    user.name,
    account.nickname,
    account.name
  );
  const profileUrl = textValue(
    item?.profileUrl,
    item?.profile_url,
    item?.userUrl,
    item?.user_url,
    user.profileUrl,
    user.profile_url,
    account.profileUrl,
    account.profile_url
  );
  const secUid = textValue(
    item?.secUid,
    item?.sec_uid,
    item?.secId,
    item?.sec_id,
    user.secUid,
    user.sec_uid,
    account.secUid,
    account.sec_uid
  );
  const rawUniqueId = textValue(
    item?.uniqueId,
    item?.unique_id,
    item?.handle,
    user.uniqueId,
    user.unique_id,
    account.uniqueId,
    account.unique_id
  ).replace(/^@+/, "");
  const uniqueId = rawUniqueId && !/^MS4w\./i.test(rawUniqueId) && rawUniqueId.length <= 40 && !["待核验", "用户身份未返回"].includes(rawUniqueId)
    ? rawUniqueId
    : "";
  const resolvedProfileUrl = profileUrl || (secUid ? `https://www.douyin.com/user/${encodeURIComponent(secUid)}` : "");
  if (!accountName && !resolvedProfileUrl && !uniqueId) return null;
  return {
    ...(accountName ? { accountName } : {}),
    ...(uniqueId ? { uniqueId } : {}),
    ...(resolvedProfileUrl ? { profileUrl: resolvedProfileUrl } : {})
  };
}

function personAvatarNode(className, person, name, options = {}) {
  const avatar = el("span", className);
  mountPersonAvatar(avatar, person, { name, ...options });
  return avatar;
}

export function commentResultItems(run = {}) {
  const sourceItems = Array.isArray(run.items) && run.items.length
    ? run.items
    : Array.isArray(run.candidateEvidence) ? run.candidateEvidence : [];
  const filterMode = run.resultType === "评论筛选" || run.analysis?.mode === "filter";
  const normalized = sourceItems.map((item, index) => {
    const source = item?.source && typeof item.source === "object" ? item.source : {};
    const filter = item?.filter && typeof item.filter === "object" ? item.filter : {};
    const user = item?.user && typeof item.user === "object" ? item.user : {};
    const account = item?.account && typeof item.account === "object" ? item.account : {};
    const matched = typeof filter.matched === "boolean" ? filter.matched : null;
    const videoUrl = textValue(source.videoUrl, source.video_url, source.url, item?.videoUrl, item?.video_url);
    const secId = textValue(item?.secId, item?.sec_id, item?.secUid, item?.sec_uid, user.secId, user.sec_id, user.secUid, user.sec_uid, account.secId, account.sec_id, account.secUid, account.sec_uid);
    const secUid = textValue(item?.secUid, item?.sec_uid, item?.secId, item?.sec_id, user.secUid, user.sec_uid, user.secId, user.sec_id, account.secUid, account.sec_uid, account.secId, account.sec_id);
    const profileUrl = textValue(item?.profileUrl, item?.profile_url, item?.userUrl, item?.user_url, user.profileUrl, user.profile_url, user.userUrl, user.user_url, account.profileUrl, account.profile_url);
    const avatar = personAvatarUrl(item, user, account);
    return {
      id: textValue(item?.commentId, item?.comment_id, item?.id, `${index}`),
      name: textValue(item?.nickname, item?.account, item?.userName, item?.user_name, item?.uniqueId, item?.unique_id, "匿名用户"),
      handle: textValue(item?.uniqueId, item?.unique_id, item?.secUid, item?.sec_uid, item?.externalUserId, item?.external_user_id),
      quote: textValue(item?.text, item?.comment, item?.content, item?.quote),
      videoTitle: textValue(source.videoTitle, source.video_title, item?.videoTitle, item?.video_title, source.videoId, source.video_id, "来源作品未返回"),
      videoUrl,
      profileUrl,
      ...(avatar ? { avatar } : {}),
      observedAt: textValue(source.observedAt, source.observed_at, item?.observedAt, item?.observed_at, item?.createTime, item?.create_time),
      reason: textValue(filter.reason, item?.reason, item?.rationale),
      confidence: filter.confidence ?? item?.confidence ?? null,
      signals: Array.isArray(filter.signals) ? filter.signals : Array.isArray(item?.matchedTerms) ? item.matchedTerms : [],
      matched,
      ...(secId ? { secId } : {}),
      ...(secUid ? { secUid } : {})
    };
  }).filter((item) => item.quote);
  const hasFilterDecisions = normalized.some((item) => item.matched !== null);
  return filterMode && hasFilterDecisions ? normalized.filter((item) => item.matched === true) : normalized;
}

function outreachTriggerSource(run = {}, item = {}) {
  const explicit = textValue(item.triggerSource, item.sourceResultType, run.trigger?.source, run.sourceResultType, run.resultSnapshot?.sourceResultType);
  if (explicit === "评论筛选") return "评论筛选结果";
  if (explicit === "抖音找人") return "抖音找人结果";
  if (explicit === "潜客") return "成果中心潜客";
  return explicit || "用户直接指定";
}

function outreachReceipt(status) {
  const normalized = String(status || "unknown").toLowerCase();
  if (["sent", "success", "succeeded", "delivered", "completed"].includes(normalized)) return { status: "sent", label: "发送成功" };
  if (["failed", "error", "rejected"].includes(normalized)) return { status: "failed", label: "发送失败" };
  if (["pending", "unknown", "sending", "running"].includes(normalized)) return { status: "pending", label: "等待平台回执" };
  return { status: normalized, label: "回执未记录" };
}

function outreachPublicHandle(...values) {
  const handle = textValue(...values).replace(/^@+/, "");
  if (!handle || /^MS4w\./i.test(handle) || handle.length > 40) return "";
  return handle;
}

function matchingProspect(records = [], item = {}) {
  const identities = [item.recordId, item.sourceRecordId, item.secUid, item.secId, item.profileUrl, item.handle, item.uniqueId].map((value) => String(value || "").trim()).filter(Boolean);
  return records.find((record) => identities.includes(String(record?.id || ""))
    || identities.includes(String(record?.secUid || record?.secId || record?.profileUrl || record?.handle || ""))) || null;
}

export function outreachResultItems(run = {}, records = []) {
  const senderName = textValue(run.accountName, run.sender?.accountName, run.resultSnapshot?.accountName, run.resultSnapshot?.sender?.accountName, "历史发送账号未记录");
  const senderAvatar = personAvatarUrl(run.sender, run.account, run.resultSnapshot?.sender, run.resultSnapshot?.account, run);
  const fallbackMessage = textValue(run.message, run.inputs?.message, run.resultSnapshot?.message);
  return (Array.isArray(run.items) ? run.items : []).map((item, index) => {
    const prospect = matchingProspect(records, item) || {};
    const receipt = outreachReceipt(item?.status);
    const profile = item?.profile && typeof item.profile === "object"
      ? item.profile
      : prospect?.profile && typeof prospect.profile === "object"
        ? prospect.profile
        : {};
    const evidenceSource = item?.evidence ?? prospect?.evidence ?? [];
    const evidence = (Array.isArray(evidenceSource) ? evidenceSource : [evidenceSource]).filter(Boolean);
    const avatar = personAvatarUrl(item, prospect);
    return {
      id: textValue(item?.recordId, item?.sourceRecordId, item?.secUid, item?.secId, item?.profileUrl, `${index}`),
      taskId: textValue(run.taskId, run.ownerKey),
      senderName,
      ...(senderAvatar ? { senderAvatar } : {}),
      senderAccountId: textValue(run.accountId, run.sender?.accountId, run.resultSnapshot?.accountId),
      targetName: textValue(item?.nickname, item?.name, prospect?.name, "目标用户"),
      handle: outreachPublicHandle(item?.handle, item?.uniqueId, item?.unique_id, prospect?.handle),
      secUid: textValue(item?.secUid, item?.secId, prospect?.secUid, prospect?.secId),
      profileUrl: textValue(item?.profileUrl, prospect?.profileUrl),
      ...(avatar ? { avatar } : {}),
      message: textValue(item?.message, item?.content, fallbackMessage, "历史记录未保存发送内容"),
      profile,
      profileSummary: textValue(typeof item?.profile === "string" ? item.profile : "", typeof prospect?.profile === "string" ? prospect.profile : ""),
      tier: textValue(item?.tier, prospect?.tier),
      score: item?.score ?? prospect?.score ?? null,
      intent: item?.intent || prospect?.intent || null,
      triggerSource: outreachTriggerSource(run, item),
      triggerReason: textValue(item?.triggerReason, item?.reason, prospect?.reason, run.trigger?.reason, "历史记录未保存触发理由"),
      quote: textValue(item?.quote, item?.comment, item?.sourceQuote, prospect?.quote),
      signals: Array.isArray(item?.signals) ? item.signals : Array.isArray(prospect?.signals) ? prospect.signals : [],
      evidence,
      sentAt: textValue(item?.sentAt, item?.submittedAt, item?.receiptAt, item?.providerResult?.sentAt, run.generatedAt),
      error: textValue(item?.error),
      providerResult: item?.providerResult || null,
      receiptStatus: receipt.status,
      receiptLabel: receipt.label
    };
  });
}

function nestedIdentityValue(item = {}) {
  const source = item?.source && typeof item.source === "object" ? item.source : {};
  const user = item?.user && typeof item.user === "object" ? item.user : {};
  const sender = item?.sender && typeof item.sender === "object" ? item.sender : {};
  const account = item?.account && typeof item.account === "object" ? item.account : {};
  return textValue(
    item?.secId,
    item?.sec_id,
    item?.secUid,
    item?.sec_uid,
    source.secId,
    source.sec_id,
    source.secUid,
    source.sec_uid,
    user.secId,
    user.sec_id,
    user.secUid,
    user.sec_uid,
    sender.secId,
    sender.sec_id,
    sender.secUid,
    sender.sec_uid,
    account.secId,
    account.sec_id,
    account.secUid,
    account.sec_uid
  );
}

function legacySecUidFromHandle(item = {}) {
  const source = item?.source && typeof item.source === "object" ? item.source : {};
  const user = item?.user && typeof item.user === "object" ? item.user : {};
  const sender = item?.sender && typeof item.sender === "object" ? item.sender : {};
  const account = item?.account && typeof item.account === "object" ? item.account : {};
  const candidate = textValue(
    item?.handle,
    item?.uniqueId,
    item?.unique_id,
    source.handle,
    source.uniqueId,
    source.unique_id,
    user.handle,
    user.uniqueId,
    user.unique_id,
    sender.handle,
    sender.uniqueId,
    sender.unique_id,
    account.handle,
    account.uniqueId,
    account.unique_id
  ).replace(/^@+/, "");
  return /^MS4w[A-Za-z0-9._-]+$/i.test(candidate) ? candidate : "";
}

export function privateOutreachRecipientId(item = {}) {
  return nestedIdentityValue(item)
    || legacySecUidFromHandle(item)
    || privateOutreachProfileIdentifier(item?.profileUrl || item?.profile_url);
}

function commentCanBeContacted(comment = {}) {
  return Boolean(comment.profileUrl || privateOutreachRecipientId(comment));
}

export function isDirectOutreachCandidate(record = {}) {
  return isPrivateOutreachRecordCandidate(record, PRIVATE_OUTREACH_MODES.ALL_FOUND)
    && isContactableRecord(record)
    && commentCanBeContacted(record);
}

export function buildPrivateOutreachResumeFlow({ run = {}, items = [], message = "", source = "评论筛选结果", outreachMode = PRIVATE_OUTREACH_MODES.PROSPECTS } = {}) {
  const targets = (Array.isArray(items) ? items : [])
    .filter(commentCanBeContacted)
    .map((comment) => {
      const recipient = privateOutreachRecipientId(comment);
      return {
        id: comment.id,
        recordId: comment.recordId || comment.sourceRecordId || comment.id || "",
        nickname: comment.name || "抖音用户",
        avatar: personAvatarUrl(comment),
        handle: comment.handle || comment.uniqueId || "",
        profileUrl: comment.profileUrl || "",
        secId: recipient,
        secUid: recipient,
        profile: comment.profile || null,
        tier: comment.tier || "",
        score: comment.score ?? null,
        intent: comment.intent || null,
        reason: comment.reason || "",
        quote: comment.quote || comment.comment || "",
        signals: Array.isArray(comment.signals) ? [...comment.signals] : [],
        evidence: Array.isArray(comment.evidence) ? [...comment.evidence] : [],
        videoTitle: comment.videoTitle || "",
        videoUrl: comment.videoUrl || "",
        triggerSource: source,
        triggerReason: comment.reason || (run.resultType === "评论筛选" ? "来自用户选中的评论筛选结果" : "用户在成果中心选择该目标"),
        sourceResultType: run.resultType || "",
        sourceResultId: resultId(run),
        sourceTaskId: run.taskId || "",
        sourceScope: comment.sourceScope || run.sourceScope || run.inputs?.sourceScope || "",
        sourceAccountId: comment.sourceAccountId || comment.source?.accountId || run.accountId || "",
        sourceAccountName: comment.sourceAccountName || comment.source?.accountName || run.accountName || "",
        status: recipient ? "ready" : "pending",
        error: null
      };
    });
  return {
    agentId: "mkt-cold-writer",
    step: "setup",
    phase: "setup",
    outreachMode: normalizePrivateOutreachMode(outreachMode),
    prefilledFromResult: true,
    source,
    sourceScope: run.sourceScope || run.inputs?.sourceScope || targets.find((target) => target.sourceScope)?.sourceScope || "",
    sourceAccountId: run.accountId || targets.find((target) => target.sourceAccountId)?.sourceAccountId || "",
    sourceAccountName: run.accountName || targets.find((target) => target.sourceAccountName)?.sourceAccountName || "",
    sourceResultType: run.resultType || "",
    sourceResultId: resultId(run),
    sourceTaskId: run.taskId || "",
    targetInput: targets.map((target) => target.profileUrl).filter(Boolean).join("\n"),
    targetProfileUrls: targets.map((target) => target.profileUrl).filter(Boolean),
    targetEntries: targets,
    message: String(message || "")
  };
}

export function buildInboxResumeFlow({ items = [], source = "成果中心已触达用户" } = {}) {
  const targets = (Array.isArray(items) ? items : []).map((item) => {
    const avatar = personAvatarUrl(item);
    return {
      recordId: item.id || item.recordId || "",
      nickname: item.name || item.nickname || "抖音用户",
      ...(avatar ? { avatar } : {}),
      profileUrl: item.profileUrl || "",
      secId: item.secId || item.sec_id || item.secUid || item.sec_uid || "",
      secUid: item.secUid || item.sec_uid || item.secId || item.sec_id || "",
      status: "ready",
      error: null
    };
  });
  return {
    agentId: "mkt-dm-inbox",
    step: "setup",
    phase: "setup",
    prefilledFromResult: true,
    source,
    sourceResultId: "results-center",
    sourceTaskId: "results-center",
    sourceResultType: "潜客",
    focusTargets: targets,
    targetEntries: targets
  };
}

function displayRun(run = {}) {
  if (run.resultType !== "评论筛选" && run.analysis?.mode !== "filter") return run;
  const comments = commentResultItems(run);
  const countValue = Number(run.counts?.matched);
  const matched = Number.isFinite(countValue) ? countValue : comments.length;
  const normalizedStatus = String(run.status || "unknown").toLowerCase();
  const completed = ["completed", "succeeded", "success", "done"].includes(normalizedStatus);
  return {
    ...run,
    title: run.query ? `${run.query}筛选结果` : run.title,
    summary: completed && (matched || comments.length)
      ? `${run.source || "作品评论"} 已完成，筛出 ${matched} 条匹配评论，保留评论用户、原话、来源作品、时间和判断理由。`
      : run.summary
  };
}

function liveResultTypeFor(work) {
  if (work?.metadata?.taskId && !work?.artifact) return "运行摘要";
  const haystack = [work?.agentType, work?.artifact, work?.task, work?.phase].filter(Boolean).join(" ").toLowerCase();
  if (/comment|评论|筛选|filter/.test(haystack)) return "评论筛选";
  if (/research|brief|研究|画像/.test(haystack)) return "研究简报";
  if (/copy|content|文案|内容/.test(haystack)) return "内容产出";
  if (/outreach|dm|触达|私信|发送/.test(haystack)) return "触达记录";
  if (/lead|prospect|潜客/.test(haystack)) return "潜客";
  return "其他成果";
}

export function isBusinessResult(run = {}) {
  if (["运行摘要", "实时能力"].includes(run.resultType)) return false;
  const hasData = [
    run.items,
    run.artifacts,
    run.evidence,
    run.decisions,
    run.actions,
    run.candidateEvidence,
    run.scanSummaries,
    run.approvalHistory,
    run.submissions,
    run.receipts,
    run.retries,
    run.replies
  ]
    .some((value) => Array.isArray(value) && value.length);
  const hasMetrics = run.counts && typeof run.counts === "object" && Object.keys(run.counts).length > 0;
  const hasError = Boolean(run.error) || (Array.isArray(run.errors) && run.errors.length > 0);
  return hasData || hasMetrics || hasError;
}

function finderResultAccounts(run = {}) {
  const sources = [
    run.items,
    run.accounts,
    run.resultSnapshot?.items,
    run.resultSnapshot?.accounts,
    run.result?.items,
    run.result?.accounts
  ];
  const merged = new Map();
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    normalizeDouyinFinderAccounts(source).forEach((account, index) => {
      const key = finderAccountId(account) || `${finderAccountName(account)}:${index}`;
      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, account);
        return;
      }
      merged.set(key, normalizeDouyinFinderAccounts([{
        ...previous,
        ...account,
        reasons: [...new Set([...(previous.reasons || []), ...(account.reasons || [])])],
        evidence: [...(previous.evidence || []), ...(account.evidence || [])],
        finderState: {
          ...(previous.finderState || {}),
          ...(account.finderState || {}),
          reasons: [...new Set([...(previous.finderState?.reasons || []), ...(account.finderState?.reasons || [])])],
          evidence: [...(previous.finderState?.evidence || []), ...(account.finderState?.evidence || [])]
        }
      }])[0]);
    });
  });
  return [...merged.values()];
}

const FINDER_PURPOSE_LABELS = Object.freeze({
  customers: "潜在客户",
  creators: "合作博主",
  peers: "同行账号",
  local: "本地商家",
  growing: "涨粉快的账号"
});

function finderRunInput(run = {}) {
  return run?.inputs && typeof run.inputs === "object"
    ? run.inputs
    : run?.resultSnapshot?.inputs && typeof run.resultSnapshot.inputs === "object"
      ? run.resultSnapshot.inputs
      : {};
}

function discoveryTaskTitle(run = {}) {
  const input = finderRunInput(run);
  const raw = textValue(input.goal, run.goal, run.query, run.title, "这次公开找人")
    .replace(/\s*[·•|]\s*(?:抖音)?找人结果\s*$/u, "")
    .trim();
  return raw || "这次公开找人";
}

function discoveryTaskProfile(run = {}) {
  const input = finderRunInput(run);
  const finderChoices = input.choices?.finder && typeof input.choices.finder === "object" ? input.choices.finder : {};
  const purpose = Array.isArray(finderChoices.selected)
    ? finderChoices.selected.map((value) => FINDER_PURPOSE_LABELS[value] || "").filter(Boolean)
    : [];
  const filters = [
    purpose.length ? `人群：${purpose.join("、")}` : "",
    finderChoices.industry ? `行业：${finderChoices.industry}` : input.industry ? `行业：${input.industry}` : "",
    finderChoices.region ? `地区：${finderChoices.region}` : "",
    finderChoices.followers ? `粉丝：${finderChoices.followers}` : "",
    run.growthIntent?.windowDays ? `近 ${run.growthIntent.windowDays} 天增长` : ""
  ].filter(Boolean);
  return filters.join(" · ") || "按这次找人需求筛选公开账号";
}

function discoveryTaskId(run = {}) {
  return textValue(run.taskId, resultId(run));
}

function discoveryTaskDescriptor(run = {}) {
  return {
    id: discoveryTaskId(run),
    taskId: textValue(run.taskId),
    title: discoveryTaskTitle(run),
    profile: discoveryTaskProfile(run),
    summary: textValue(run.summary, "公开找人结果已整理完成。"),
    generatedAt: textValue(run.generatedAt),
    status: textValue(run.status)
  };
}

function mergeDiscoveryTasks(previous = [], next = []) {
  const merged = new Map();
  for (const task of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])]) {
    if (!task?.id) continue;
    merged.set(task.id, { ...task, ...(merged.get(task.id) || {}) });
  }
  return [...merged.values()];
}

function funnelIdentity(item, fallback = "") {
  return textValue(item?.id, item?.accountId, item?.account_id, item?.sec_uid, item?.secUid, item?.commentId, item?.comment_id, item?.nickname, item?.name, fallback);
}

function analyzedPersonIdentity(item, fallback = "") {
  const user = item?.user && typeof item.user === "object" ? item.user : {};
  const account = item?.account && typeof item.account === "object" ? item.account : {};
  return textValue(
    item?.secUid, item?.sec_uid, item?.externalUserId, item?.external_user_id,
    item?.uniqueId, item?.unique_id, item?.accountId, item?.account_id,
    item?.handle,
    item?.uid, item?.userId, item?.user_id,
    user.secUid, user.sec_uid, user.uniqueId, user.unique_id, user.userId, user.user_id,
    account.secUid, account.sec_uid, account.uniqueId, account.unique_id, account.accountId, account.account_id,
    item?.profileUrl, item?.profile_url, user.profileUrl, user.profile_url, account.profileUrl, account.profile_url,
    item?.nickname, item?.name, user.nickname, user.name, account.nickname, account.name,
    fallback
  );
}

function analyzedPeople(run = {}) {
  if (!(run?.resultType === "潜客" || run?.resultType === "评论筛选" || run?.analysis?.mode === "filter")) return [];
  const collections = [
    run.resultSnapshot?.comments,
    run.resultSnapshot?.allLeads,
    run.items,
    run.resultSnapshot?.items,
    run.comments,
    run.candidateEvidence
  ];
  const items = collections.find((value) => Array.isArray(value) && value.length) || [];
  return items;
}

function sourceDouyinAccountName(account = {}) {
  const name = textValue(account?.name);
  if (name && name !== "未命名授权账号") return name;
  const id = textValue(account?.id).replace(/^own:/, "");
  return id ? `未命名抖音账号 · ${id.slice(-6)}` : "未命名抖音账号";
}

function sourceDouyinAccountDescription(account = {}) {
  const handle = textValue(account?.handle).replace(/^@+/, "");
  return handle
    ? `已授权抖音账号 · @${handle}`
    : "已授权抖音账号 · 评论、直播和账号互动";
}

function authorizedSourceAccountDirectory(accounts = []) {
  return (Array.isArray(accounts) ? accounts : [])
    .map((account) => {
      const identity = account?.identity && typeof account.identity === "object" ? account.identity : {};
      return {
        id: textValue(account?.id, account?.accountId, identity.managedAccountKey, identity.secUid, identity.secId, identity.uid, identity.uniqueId),
        name: textValue(account?.name, identity.accountName, identity.nickname, "已授权抖音账号"),
        handle: textValue(account?.handle, identity.account, identity.uniqueId),
        profileUrl: textValue(account?.profileUrl, identity.profileUrl),
        avatar: accountAvatarSource({ ...account, identity })
      };
    })
    .filter((account) => account.id);
}

function normalizedSourceAccountValues(account = {}) {
  const identity = account?.identity && typeof account.identity === "object" ? account.identity : {};
  return new Set([
    account?.id,
    account?.accountId,
    account?.name,
    account?.handle,
    account?.profileUrl,
    identity.managedAccountKey,
    identity.secUid,
    identity.secId,
    identity.uid,
    identity.uniqueId,
    identity.accountName,
    identity.nickname,
    identity.account,
    identity.profileUrl
  ]
    .map((value) => String(value || "").trim().replace(/^@+/, "").toLowerCase())
    .filter(Boolean));
}

function matchingAuthorizedSourceAccount(sourceAccount = {}, authorizedAccounts = []) {
  const directory = authorizedSourceAccountDirectory(authorizedAccounts);
  if (directory.length === 1) return directory[0];
  const sourceValues = normalizedSourceAccountValues(sourceAccount);
  return directory.find((account) => [...normalizedSourceAccountValues(account)].some((value) => sourceValues.has(value))) || null;
}

export function discoveredUserItems({ records = [], runs = [] } = {}) {
  const recordByIdentity = new Map();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const identity = analyzedPersonIdentity(record, `record-${index}`);
    if (identity) recordByIdentity.set(identity, record);
  });
  const discovered = new Map();
  const add = (run, raw, index) => {
    const user = raw?.user && typeof raw.user === "object" ? raw.user : {};
    const account = raw?.account && typeof raw.account === "object" ? raw.account : {};
    const source = raw?.source && typeof raw.source === "object" ? raw.source : {};
    const filter = raw?.filter && typeof raw.filter === "object" ? raw.filter : {};
    const identity = analyzedPersonIdentity(raw, `${run?.taskId || "analysis"}-${index}`);
    if (!identity) return;
    const record = recordByIdentity.get(identity);
    const origin = run?.resultType === "抖音找人"
      ? "public"
      : record && isContactableRecord(record)
        ? "own"
        : run && runContactability(run).allowed
          ? "own"
          : "other";
    const sourceTask = origin === "public" ? discoveryTaskDescriptor(run) : null;
    const sourceAccountName = textValue(
      record?.source?.accountName,
      raw?.source?.accountName,
      source?.accountName,
      raw?.sourceAccountName,
      run?.accountName,
      "未命名授权账号"
    );
    const sourceAccount = origin === "own" ? {
      id: textValue(record?.source?.accountId, raw?.source?.accountId, source?.accountId, raw?.sourceAccountId, run?.accountId, `own:${sourceAccountName}`),
      name: sourceAccountName,
      handle: textValue(record?.source?.accountHandle, record?.source?.accountUniqueId, raw?.source?.accountHandle, raw?.source?.accountUniqueId, source?.accountHandle, source?.accountUniqueId, raw?.sourceAccountHandle, run?.accountHandle),
      profileUrl: textValue(record?.source?.accountUrl, raw?.source?.accountUrl, source?.accountUrl, raw?.sourceAccountUrl, run?.accountUrl),
      avatar: personAvatarUrl(
        record?.source?.accountAvatar,
        record?.source?.accountAvatarUrl,
        raw?.source?.accountAvatar,
        raw?.source?.accountAvatarUrl,
        source?.accountAvatar,
        source?.accountAvatarUrl,
        raw?.sourceAccountAvatar,
        raw?.sourceAccountAvatarUrl,
        run?.accountAvatar,
        run?.accountAvatarUrl
      )
    } : null;
    const recordIsContactable = origin === "own" && Boolean(record && isContactableRecord(record));
    const matchingReasons = run?.resultType === "抖音找人" ? finderAccountReasons(raw) : [];
    if (run?.resultType === "抖音找人" && !matchingReasons.length) return;
    const matched = typeof filter.matched === "boolean"
      ? filter.matched
      : typeof raw?.matched === "boolean" ? raw.matched : null;
    const prospectAnalysis = run?.resultType === "潜客" || run?.resultType === "评论筛选" || run?.analysis?.mode === "filter";
    const item = {
      id: `discovered:${origin}:${sourceAccount?.id || "shared"}:${identity}`,
      accountData: raw,
      identity,
      origin,
      sourceAccount,
      name: textValue(raw?.nickname, raw?.accountName, raw?.userName, raw?.user_name, user.nickname, user.name, account.nickname, account.name, record?.name, "匿名用户"),
      handle: textValue(raw?.uniqueId, raw?.unique_id, raw?.handle, raw?.secUid, raw?.sec_uid, user.uniqueId, user.unique_id, account.uniqueId, account.unique_id, account.handle, record?.handle),
      profileUrl: textValue(raw?.profileUrl, raw?.profile_url, raw?.userUrl, raw?.user_url, user.profileUrl, user.profile_url, account.profileUrl, account.profile_url, record?.profileUrl),
      avatar: personAvatarUrl(raw, user, account, record),
      quote: textValue(raw?.text, raw?.comment, raw?.content, raw?.quote),
      source: textValue(source.videoTitle, source.video_title, source.videoId, source.video_id, raw?.videoTitle, raw?.video_title, record?.source?.videoTitle, record?.source?.videoId, run?.title, run?.source, "来源未返回"),
      observedAt: textValue(source.observedAt, source.observed_at, raw?.observedAt, raw?.observed_at, raw?.createTime, raw?.create_time, record?.lastSeen, run?.generatedAt),
      reason: textValue(filter.reason, raw?.reason, raw?.rationale, matchingReasons.join("；"), Array.isArray(raw?.reasons) ? raw.reasons.join("；") : raw?.reasons, record?.reason),
      score: record?.score ?? raw?.score ?? raw?.intent?.score ?? null,
      tier: record?.tier || raw?.tier || "待判断",
      status: recordIsContactable ? (record?.status || "待触达") : prospectAnalysis && matched === false ? "未进入潜客池" : origin === "public" ? "仅用于分析" : "已分析",
      matched,
      recordId: origin === "own" ? record?.id || "" : "",
      taskId: run?.taskId || record?.source?.taskId || "",
      sourceTasks: sourceTask ? [sourceTask] : [],
      ...(run?.resultType === "抖音找人" ? {
        followers: raw?.followers ?? null,
        awemeCount: raw?.awemeCount ?? null,
        likes: raw?.likes ?? null,
        location: textValue(raw?.location),
        isLive: raw?.isLive === true,
        growth: raw?.growth && typeof raw.growth === "object" ? { ...raw.growth } : null,
        videos: Array.isArray(raw?.videos) ? raw.videos : [],
        tags: Array.isArray(raw?.finderState?.tags) ? [...raw.finderState.tags] : [],
        matchingReasons
      } : {})
    };
    const discoveryKey = `${origin}:${sourceAccount?.id || "shared"}:${identity}`;
    const previous = discovered.get(discoveryKey);
    discovered.set(discoveryKey, previous ? {
      ...previous,
      name: previous.name === "匿名用户" ? item.name : previous.name,
      handle: previous.handle || item.handle,
      profileUrl: previous.profileUrl || item.profileUrl,
      avatar: previous.avatar || item.avatar,
      quote: previous.quote || item.quote,
      source: previous.source === "来源未返回" ? item.source : previous.source,
      observedAt: previous.observedAt || item.observedAt,
      reason: previous.reason || item.reason,
      score: previous.score ?? item.score,
      tier: previous.tier === "待判断" ? item.tier : previous.tier,
      status: previous.status === "已分析" ? item.status : previous.status,
      matched: previous.matched ?? item.matched,
      recordId: previous.recordId || item.recordId,
      taskId: previous.taskId || item.taskId,
      sourceTasks: mergeDiscoveryTasks(previous.sourceTasks, item.sourceTasks),
      followers: previous.followers ?? item.followers,
      awemeCount: previous.awemeCount ?? item.awemeCount,
      likes: previous.likes ?? item.likes,
      location: previous.location || item.location,
      isLive: previous.isLive ?? item.isLive,
      growth: previous.growth || item.growth,
      videos: previous.videos?.length ? previous.videos : item.videos,
      tags: previous.tags?.length ? previous.tags : item.tags,
      matchingReasons: [...new Set([...(previous.matchingReasons || []), ...(item.matchingReasons || [])])]
    } : item);
  };
  (Array.isArray(runs) ? runs : []).forEach((run) => analyzedPeople(run).forEach((item, index) => add(run, item, index)));
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    if (run?.resultType !== "抖音找人") return;
    finderResultAccounts(run).forEach((account, index) => add(run, {
      ...account,
      source: { videoTitle: run.title || run.query || run.source || "抖音找人结果", observedAt: run.generatedAt },
      reason: finderAccountReasons(account).join("；"),
      matchingEvidence: finderAccountEvidence(account),
    }, index));
  });
  (Array.isArray(records) ? records : []).forEach((record, index) => add(null, record, index));
  return [...discovered.values()];
}

export function discoveryTaskGroups({ records = [], runs = [] } = {}) {
  const items = discoveredUserItems({ records, runs }).filter((item) => item.origin === "public");
  const groups = (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.resultType === "抖音找人" && (finderResultAccounts(run).length || run?.counts?.discovered))
    .map((run) => {
      const task = discoveryTaskDescriptor(run);
      const taskItems = items.filter((item) => item.sourceTasks?.some((sourceTask) => sourceTask.id === task.id));
      return {
        ...task,
        count: taskItems.length,
        items: taskItems,
        sourceCounts: run.counts && typeof run.counts === "object" ? { ...run.counts } : {}
      };
    });
  return groups;
}

export function discoverySourceGroups({ records = [], runs = [], authorizedAccounts = null } = {}) {
  const rawItems = discoveredUserItems({ records, runs });
  const currentAuthorizedAccounts = authorizedSourceAccountDirectory(authorizedAccounts);
  const ownItems = rawItems
    .filter((item) => item.origin === "own")
    .map((item) => {
      if (!currentAuthorizedAccounts.length) return { ...item, sourceAccountResolved: true };
      const sourceAccount = matchingAuthorizedSourceAccount(item.sourceAccount, currentAuthorizedAccounts);
      if (sourceAccount) return { ...item, sourceAccount, sourceAccountResolved: true };
      return {
        ...item,
        sourceAccount: { id: "unresolved-history", name: "历史来源待核对", handle: "", profileUrl: "" },
        sourceAccountResolved: false
      };
    });
  const publicItems = rawItems.filter((item) => item.origin === "public");
  const otherItems = rawItems.filter((item) => item.origin === "other");
  const items = [...ownItems, ...publicItems, ...otherItems];
  const accountsById = new Map();
  ownItems.forEach((item) => {
    const account = item.sourceAccount || { id: "own:unknown", name: "未命名授权账号", profileUrl: "" };
    const group = accountsById.get(account.id) || { ...account, id: `own-account:${account.id}`, sourceAccountResolved: item.sourceAccountResolved !== false, count: 0, items: [] };
    group.count += 1;
    group.items.push(item);
    accountsById.set(account.id, group);
  });
  return {
    items,
    ownItems,
    publicItems,
    otherItems,
    accounts: [...accountsById.values()],
    authorizedAccounts: currentAuthorizedAccounts,
    tasks: discoveryTaskGroups({ records, runs })
  };
}

export function discoveryMatchLabel(item = {}) {
  if (item.matched === true) return "符合这次目标";
  if (item.matched === false) return "未符合这次目标";
  return "待核验";
}

export function resultFunnelCounts({ records = [], runs = [] } = {}) {
  const discovered = new Set();
  const successfulOutreach = new Set();
  let successfulOutreachFallback = 0;
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    analyzedPeople(run).forEach((item, index) => discovered.add(analyzedPersonIdentity(item, `${run.taskId || "analysis"}-${index}`)));
    if (analyzedPeople(run).length) return;
    const counts = run?.counts && typeof run.counts === "object" ? run.counts : {};
    const analyzedCount = counts.comments ?? counts.analyzed ?? counts.reviewed;
    if (Number.isFinite(Number(analyzedCount)) && Number(analyzedCount) > 0) {
      for (let index = 0; index < Number(analyzedCount); index += 1) discovered.add(`${run.taskId || "analysis"}-reviewed-${index}`);
    }
  });
  const contactableRecords = (Array.isArray(records) ? records : []).filter(isContactableRecord);
  contactableRecords.forEach((item, index) => {
    if (!discovered.size) discovered.add(analyzedPersonIdentity(item, `record-${index}`));
  });
  contactableRecords.forEach((item, index) => {
    const status = String(item?.outreachStatus || item?.outreach_status || item?.touchStatus || item?.touch_status || item?.status || "").toLowerCase();
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    if (["sent", "delivered", "success", "succeeded", "已发送", "已送达", "成功", "已触达"].includes(status) || tags.includes("已触达")) {
      successfulOutreach.add(funnelIdentity(item, `record-${index}`));
    }
  });
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    if (run?.resultType === "抖音找人") {
      finderResultAccounts(run).forEach((item, index) => discovered.add(funnelIdentity(item, `${run.taskId || "finder"}-${index}`)));
    }
    if (run?.resultType !== "触达记录" || !runCanCreateProspects(run)) return;
    const items = [...(Array.isArray(run.items) ? run.items : []), ...(Array.isArray(run.receipts) ? run.receipts : [])];
    let matchedItems = 0;
    items.forEach((item, index) => {
      const status = String(item?.status || item?.state || item?.deliveryState || item?.delivery_state || "").toLowerCase();
      if (!["sent", "delivered", "success", "succeeded", "已发送", "已送达", "成功", "已触达"].includes(status)) return;
      matchedItems += 1;
      successfulOutreach.add(funnelIdentity(item, `${run.taskId || "outreach"}-${index}`));
    });
    if (!matchedItems) {
      const counts = run?.counts && typeof run.counts === "object" ? run.counts : {};
      const outreach = run?.outreach && typeof run.outreach === "object" ? run.outreach : {};
      const value = counts.delivered ?? counts.sent ?? counts.success ?? counts.succeeded ?? counts.successful ?? outreach.delivered ?? outreach.sent;
      if (Number.isFinite(Number(value)) && Number(value) > 0) successfulOutreachFallback += Number(value);
    }
  });
  return {
    discovered: discoveredUserItems({ records, runs }).length,
    prospects: contactableRecords.filter(isProspectRecord).length,
    touched: successfulOutreach.size + successfulOutreachFallback,
    converted: contactableRecords.filter((item) => item?.conversionStatus === "已转化").length
  };
}

function hasReply(item) {
  const status = textValue(item?.replyStatus, item?.reply_status, item?.responseStatus, item?.response_status, item?.status);
  return item?.replied === true
    || item?.replyReceived === true
    || ["已回复", "已回应", "回复", "replied", "responded"].includes(status.toLowerCase());
}

function isTouchedRecord(item) {
  const status = String(item?.outreachStatus || item?.outreach_status || item?.touchStatus || item?.touch_status || item?.status || "").toLowerCase();
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return ["sent", "delivered", "success", "succeeded", "已发送", "已送达", "成功", "已触达", "跟进中", "已回复"].includes(status) || tags.includes("已触达");
}

function percentage(value, total) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return 0;
  return Math.round((Number(value) / Number(total)) * 10000) / 100;
}

export function buildProspectDashboardModel({ records = [], runs = [] } = {}) {
  const allRecords = Array.isArray(records) ? records : [];
  const contactableRecords = allRecords.filter(isContactableRecord);
  const prospects = contactableRecords.filter(isProspectRecord);
  const funnel = resultFunnelCounts({ records: allRecords, runs });
  const saved = contactableRecords.filter((item) => item?.contactStatus === "已留资" || item?.status === "已留资").length;
  const converted = contactableRecords.filter((item) => item?.conversionStatus === "已转化").length;
  const acquired = Math.max(contactableDiscoveryCount({ records: allRecords, runs }), contactableRecords.length);
  const replied = contactableRecords.filter(hasReply).length;
  const touchedProspects = prospects.filter(isTouchedRecord);
  const leadRecords = contactableRecords.filter(isLeadCenterRecord);
  return {
    counts: {
      acquired,
      touched: funnel.touched,
      replied,
      saved,
      converted,
      touchRate: percentage(funnel.touched, acquired),
      replyRate: percentage(replied, funnel.touched),
      savedRate: percentage(saved, funnel.touched),
      conversionRate: percentage(converted, acquired)
    },
    views: {
      all: { label: "全部潜客", items: prospects },
      ready: { label: PROSPECT_STATUSES.AUTOMATIC_OUTREACH, items: prospects.filter((item) => item?.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH) },
      confirmation: { label: PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION, items: prospects.filter(isManualOutreachReady) },
      touched: { label: "已触达", items: touchedProspects },
      following: { label: "跟进中", items: prospects.filter(hasReply) },
      leads: { label: "已留资", items: leadRecords }
    },
    prospects
  };
}

function exportFinderAccounts(accounts = [], taskId = "finder") {
  const header = ["账号昵称", "账号", "主页链接", "结果状态", "匹配评分", "粉丝数", "作品数", "获赞数", "趋势天数", "新增粉丝", "趋势期末粉丝", "地域", "当前直播", "标签", "匹配理由"];
    const href = URL.createObjectURL(new Blob([[header, ...finderAccountCsvRows(accounts)].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = `抖音找人-${taskId}.csv`;
  link.click();
  URL.revokeObjectURL(href);
}

export function openProspectCenterPage({ onClose = null, initialResult = null, initialSurface = null, initialResultType = null, standaloneDiscovery = false } = {}) {
  ensureStyle();
  const mockPreview = isResultsMockPreview();
  const mockData = mockPreview ? createResultsMockPreviewData() : null;
  const page = openPage({ title: "", onClose });
  page.root.classList.add("sb-page--prospect-center");
  const wrap = el("main", "sb-prospect-page");
  const shell = el("div", "sb-prospect-shell");
  const state = {
    surface: initialSurface || (initialResult ? "work" : "overview"),
    resultType: initialResultType || initialResult?.resultType || (initialSurface === "people" ? "发现" : "全部成果"),
    standaloneDiscovery: Boolean(standaloneDiscovery),
    filter: "全部",
    search: "",
    view: "list",
    groupBy: "status",
    selected: new Set(),
    selectedId: null,
    detailTab: "overview",
    tagPanel: false,
    customTags: [],
    taskComposer: false,
    taskRun: prospectStore.latestRun(),
    selectedResultId: initialResult ? resultId(initialResult) : null,
    selectedCommentIds: new Set(),
    selectedFinderAccountIds: new Set(),
    finderAccountFilter: "全部",
    finderAccountSearch: "",
    finderSelectionRunId: null,
    selectedDiscoveredId: null,
    selectedDiscoveredIds: new Set(),
    discoverySelectionTaskId: null,
    selectedDiscoveryOrigin: initialResult?.resultType === "抖音找人" ? "public" : "own",
    selectedDiscoveryTaskId: null,
    dashboardView: "all",
    dashboardDetailId: null
  };
  let records = mockData?.records || prospectStore.list();
  let runs = mockData?.runs || [];
  let toastTimer = null;
  let canonicalResultsRefreshPending = null;
  let canonicalResultsRefreshTimer = null;
  const finderAvatarHydrationRuns = new Set();
  const hydratedAvatarByIdentity = new Map();
  const avatarHydrationKeys = new Set();
  const avatarHydrationQueue = [];
  let activeAvatarHydrations = 0;

  function discoverySourcesForPage() {
    return discoverySourceGroups({
      records,
      runs,
      authorizedAccounts: mockPreview ? null : getAuthorizedManagedAccounts()
    });
  }

  function syncViewSelections() {
    const peoplePool = state.resultType === "线索" ? records.filter(isLeadCenterRecord) : records.filter((item) => !isLeadCenterRecord(item));
    if (!peoplePool.some((item) => item.id === state.selectedId)) state.selectedId = peoplePool[0]?.id || null;
    const visibleRuns = state.resultType === "全部成果" ? runs : runs.filter((item) => item.resultType === state.resultType);
    if (!visibleRuns.some((item) => resultId(item) === state.selectedResultId)) {
      state.selectedResultId = selectedResultIdForType(runs, state.resultType);
    }
    const discoverySources = discoverySourcesForPage();
    const discovered = discoverySources.items;
    if (!discovered.some((item) => item.id === state.selectedDiscoveredId)) state.selectedDiscoveredId = discovered[0]?.id || null;
    const discoveredIds = new Set(discovered.map((item) => item.id));
    state.selectedDiscoveredIds.forEach((id) => { if (!discoveredIds.has(id)) state.selectedDiscoveredIds.delete(id); });
    if (state.selectedDiscoveryOrigin === "own" && !discoverySources.ownItems.length) state.selectedDiscoveryOrigin = discoverySources.publicItems.length ? "public" : "other";
    if (state.selectedDiscoveryOrigin === "public" && !discoverySources.publicItems.length) state.selectedDiscoveryOrigin = discoverySources.ownItems.length ? "own" : "other";
    const scopes = state.selectedDiscoveryOrigin === "own" ? discoverySources.accounts : state.selectedDiscoveryOrigin === "public" ? discoverySources.tasks : [];
    if (!scopes.some((group) => group.id === state.selectedDiscoveryTaskId)) state.selectedDiscoveryTaskId = scopes[0]?.id || "all";
    const scopedDiscovery = discoveryItemsForCurrentScope();
    if (!scopedDiscovery.some((item) => item.id === state.selectedDiscoveredId)) {
      state.selectedDiscoveredId = scopedDiscovery[0]?.id || null;
    }
  }

  function syncRecords() {
    if (mockPreview) {
      records = mockData.records;
      runs = mockData.runs;
      state.taskRun = mockData.runs[0] || null;
      syncViewSelections();
      return;
    }
    records = prospectStore.list();
    const storedRuns = (typeof prospectStore.listRuns === "function" ? prospectStore.listRuns() : (prospectStore.latestRun() ? [prospectStore.latestRun()] : []))
      .map(displayRun);
    const liveRuns = listWorks()
      .filter((work) => work.projectId !== "demo-office" && work.metadata?.simulated !== true && (work.artifact || work.metadata?.taskId))
      .map((work) => ({
        taskId: work.metadata?.taskId || `live:${work.agentType}:${work.startedAt}`,
        ownerKey: work.metadata?.taskId ? `${work.agentType}::${work.metadata.taskId}::${work.metadata?.accountId || ""}` : null,
        taskRunId: work.metadata?.taskRunId || null,
        accountId: work.metadata?.accountId || null,
        status: work.lastError ? "failed" : work.state === "done" ? "completed" : work.metadata?.taskState || "running",
        agentId: work.agentType,
        agentName: work.metadata?.agentName || work.agentType,
        resultType: liveResultTypeFor(work),
        title: artifactLabel(work.artifact),
        summary: work.task || "真实任务已产生可交接结果。",
        source: work.phase || "实时工作",
        window: "当前任务",
        query: work.task || "",
        metrics: {},
        artifacts: [work.artifact],
        links: work.metadata?.links || {},
        generatedAt: work.completedAt || work.startedAt
      }))
      .filter((work) => !storedRuns.some((run) => (work.ownerKey && run.ownerKey === work.ownerKey) || (!work.ownerKey && run.agentId === work.agentId && run.title === work.title)));
    runs = [...storedRuns, ...liveRuns].filter(isBusinessResult);
    syncViewSelections();
    state.taskRun = prospectStore.latestRun();
  }

  const unsubscribeStore = prospectStore.subscribe(() => {
    if (!wrap.isConnected) return;
    syncRecords();
    render();
  });
  const unsubscribeLiveWork = subscribeWork(() => {
    if (!wrap.isConnected) return;
    syncRecords();
    render();
  });

  async function hydrateCanonicalResults() {
    if (mockPreview) return null;
    if (canonicalResultsRefreshPending || !wrap.isConnected) return canonicalResultsRefreshPending;
    canonicalResultsRefreshPending = (async () => {
      try {
        if (prospectStore.syncStatus?.().pending) await prospectStore.retryRemoteSync?.();
        const { runs: canonicalRuns, prospects: canonicalProspects } = await fetchCanonicalResultRuns();
        const hydratedRuns = prospectStore.hydrateRuns?.(canonicalRuns) || 0;
        const hydratedProspects = prospectStore.hydrateRecords?.(canonicalProspects) || 0;
        const hydrated = hydratedRuns + hydratedProspects;
        if (hydrated && wrap.isConnected) {
          syncRecords();
          render();
        }
      } catch {
        // The stored task result remains visible while the control plane reconnects.
      } finally {
        canonicalResultsRefreshPending = null;
      }
    })();
    return canonicalResultsRefreshPending;
  }

  function showToast(text) {
    wrap.querySelector(".sb-prospect-toast")?.remove();
    const toast = el("div", "sb-prospect-toast", text);
    wrap.appendChild(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 2300);
  }

  function renderSyncNotice() {
    if (mockPreview) return null;
    const sync = prospectStore.syncStatus?.();
    if (!sync?.pending) return null;

    const notice = el("section", "sb-prospect-sync-notice");
    const copy = el("div", "sb-prospect-sync-copy");
    const attempts = Number(sync.attempts) || 0;
    copy.append(
      el("strong", null, "成果正在等待同步"),
      el("span", null, attempts > 1 ? `已尝试 ${attempts} 次，网络恢复后会继续同步。` : "本机变更会在网络恢复后继续同步。")
    );
    const retry = el("button", null, "重试同步");
    retry.type = "button";
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      try {
        await prospectStore.retryRemoteSync?.();
      } finally {
        if (wrap.isConnected) {
          syncRecords();
          render();
        }
      }
    });
    notice.append(copy, retry);
    return notice;
  }

  function resolvedAvatar(item = {}) {
    const direct = personAvatarUrl(item);
    if (direct) return direct;
    const identities = avatarIdentityKeys(item);
    for (const identity of identities) {
      const hydrated = hydratedAvatarByIdentity.get(identity);
      if (hydrated) return hydrated;
    }
    for (const run of runs) {
      const collections = [
        run.items,
        run.comments,
        run.candidateEvidence,
        run.resultSnapshot?.items,
        run.resultSnapshot?.leads,
        run.resultSnapshot?.allLeads,
        run.resultSnapshot?.comments,
        run.resultSnapshot?.accounts,
        run.receipts,
        run.replies,
        run.submissions,
        run.resultSnapshot?.receipts,
        run.resultSnapshot?.replies,
        run.resultSnapshot?.submissions
      ];
      for (const collection of collections) {
        if (!Array.isArray(collection)) continue;
        for (const candidate of collection) {
          const candidateIdentities = new Set([
            analyzedPersonIdentity(candidate),
            candidate?.id,
            candidate?.recordId,
            candidate?.handle,
            candidate?.profileUrl,
            candidate?.profile_url,
            candidate?.nickname,
            candidate?.name
          ].map((value) => String(value || "").replace(/^@+/, "").trim()).filter(Boolean));
          const matches = [...candidateIdentities].some((identity) => identities.has(identity)
            || String(item.id || "").endsWith(`::${identity}`));
          if (!matches) continue;
          const source = personAvatarUrl(candidate);
          if (source) return source;
        }
      }
    }
    return "";
  }

  function avatarIdentityKeys(item = {}) {
    const user = item?.user && typeof item.user === "object" ? item.user : {};
    const account = item?.account && typeof item.account === "object" ? item.account : {};
    return new Set([
      analyzedPersonIdentity(item),
      item.identity,
      item.recordId,
      item.sourceRecordId,
      item.id,
      item.secUid,
      item.sec_uid,
      item.secId,
      item.sec_id,
      item.uniqueId,
      item.unique_id,
      item.handle,
      item.profileUrl,
      item.profile_url,
      item.targetName,
      item.nickname,
      item.name,
      user.secUid,
      user.sec_uid,
      user.uniqueId,
      user.unique_id,
      user.nickname,
      user.name,
      account.secUid,
      account.sec_uid,
      account.uniqueId,
      account.unique_id,
      account.nickname,
      account.name
    ].map((value) => String(value || "").replace(/^@+/, "").trim()).filter(Boolean));
  }

  function sharesAvatarIdentity(left, right) {
    const leftKeys = avatarIdentityKeys(left);
    return [...avatarIdentityKeys(right)].some((key) => leftKeys.has(key)
      || String(left?.id || "").endsWith(`:${key}`));
  }

  function persistHydratedRunAvatar(taskId, target, avatar) {
    if (!taskId || typeof prospectStore.updateRun !== "function") return false;
    const run = runs.find((candidate) => candidate.taskId === taskId || candidate.ownerKey === taskId);
    if (!run) return false;
    const patchCollection = (collection) => Array.isArray(collection)
      ? collection.map((candidate) => sharesAvatarIdentity(target, candidate)
        ? { ...candidate, avatar, avatarUrl: avatar }
        : candidate)
      : collection;
    prospectStore.updateRun(taskId, (current) => {
      const resultSnapshot = current.resultSnapshot && typeof current.resultSnapshot === "object"
        ? { ...current.resultSnapshot }
        : {};
      ["items", "comments", "candidateEvidence", "accounts", "leads", "allLeads", "receipts", "replies", "submissions"].forEach((field) => {
        if (Array.isArray(resultSnapshot[field])) resultSnapshot[field] = patchCollection(resultSnapshot[field]);
      });
      return {
        ...current,
        items: patchCollection(current.items),
        comments: patchCollection(current.comments),
        candidateEvidence: patchCollection(current.candidateEvidence),
        receipts: patchCollection(current.receipts),
        replies: patchCollection(current.replies),
        submissions: patchCollection(current.submissions),
        resultSnapshot
      };
    });
    return true;
  }

  async function hydratePersonAvatar(entry) {
    const response = await fetch(`${controlPlaneBaseUrl()}/v1/connectors/prospect/resolve-accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accounts: [entry.reference] })
    });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload?.accounts)) return;
    const resolved = payload.accounts[0]?.account;
    const avatar = personAvatarUrl(resolved);
    if (!avatar) return;
    [...avatarIdentityKeys(entry.item), ...avatarIdentityKeys(resolved)].forEach((key) => hydratedAvatarByIdentity.set(key, avatar));
    const recordId = entry.item.recordId || (records.some((record) => record.id === entry.item.id) ? entry.item.id : "");
    if (recordId) prospectStore.update(recordId, { avatar, avatarUrl: avatar });
    persistHydratedRunAvatar(entry.item.taskId, entry.item, avatar);
    if (!recordId && !entry.item.taskId && wrap.isConnected) render();
  }

  function pumpPersonAvatarHydrationQueue() {
    while (activeAvatarHydrations < 3 && avatarHydrationQueue.length) {
      const entry = avatarHydrationQueue.shift();
      activeAvatarHydrations += 1;
      hydratePersonAvatar(entry)
        .catch(() => {})
        .finally(() => {
          activeAvatarHydrations -= 1;
          pumpPersonAvatarHydrationQueue();
        });
    }
  }

  function queuePersonAvatarHydration(items = []) {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || resolvedAvatar(item)) continue;
      const reference = personAvatarHydrationReference(item);
      if (!reference) continue;
      const key = [...avatarIdentityKeys(item)][0] || JSON.stringify(reference);
      if (avatarHydrationKeys.has(key)) continue;
      avatarHydrationKeys.add(key);
      avatarHydrationQueue.push({ item, reference });
    }
    pumpPersonAvatarHydrationQueue();
  }

  async function hydrateFinderAvatars(run, accounts) {
    const runKey = String(run?.ownerKey || run?.taskId || "").trim();
    if (!runKey || finderAvatarHydrationRuns.has(runKey)) return;
    const missing = accounts.map((account, index) => ({ account, index })).filter(({ account }) => {
      return !personAvatarUrl(account) && Boolean(finderAccountUrl(account) || account.handle || finderAccountName(account));
    });
    if (!missing.length) return;
    finderAvatarHydrationRuns.add(runKey);

    const resolvedEntries = [];
    try {
      const queue = [...missing];
      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length) {
          const current = queue.shift();
          if (!current) return;
          try {
            const response = await fetch(`${controlPlaneBaseUrl()}/v1/connectors/prospect/resolve-accounts`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ accounts: [{
                accountName: finderAccountName(current.account),
                uniqueId: current.account.handle || undefined,
                profileUrl: finderAccountUrl(current.account) || undefined
              }] })
            });
            const payload = await response.json();
            if (!response.ok || !Array.isArray(payload?.accounts)) continue;
            const entry = payload.accounts[0];
            if (entry?.account) resolvedEntries.push({ ...entry, index: current.index });
          } catch {
            // Other accounts should still receive avatars when one lookup fails.
          }
        }
      });
      await Promise.all(workers);
      const merged = mergeResolvedFinderAccounts(accounts, resolvedEntries);
      const addedAvatar = merged.some((account, index) => personAvatarUrl(account) && !personAvatarUrl(accounts[index]));
      if (!addedAvatar) return;
      prospectStore.updateRun(run.taskId || run.ownerKey, (current) => ({
        ...current,
        items: merged,
        resultSnapshot: {
          ...(current.resultSnapshot || {}),
          accounts: merged,
          items: merged
        }
      }));
    } catch (error) {
      console.warn("Failed to hydrate finder avatars", error);
    }
  }

  function renderPersonAvatar(className, item, name, options = {}) {
    return personAvatarNode(className, { avatar: resolvedAvatar(item) }, name, options);
  }

function openPrivateOutreachFromResult(run, comments, source = "评论筛选结果", outreachMode = PRIVATE_OUTREACH_MODES.PROSPECTS) {
    if (runHasExplicitOrigin(run) && !runCanCreateProspects(run)) {
      showToast("这批结果来自公域分析，不能直接触达");
      return;
    }
    const selected = (Array.isArray(comments) ? comments : []).filter(commentCanBeContacted);
    if (!selected.length) {
      showToast("当前结果没有可触达的主页或用户身份");
      return;
    }
    const resumeFlow = buildPrivateOutreachResumeFlow({
      run: {
        ...run,
        sourceScope: run.sourceScope || run.inputs?.sourceScope || selected.find((item) => item.sourceScope)?.sourceScope || ""
      },
      items: selected,
      source,
      outreachMode
    });
    globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({
      initialAgentId: resumeFlow.agentId,
      resumeFlow
    }));
  }

  function intentCandidateFromProspect(item = {}) {
    const evidence = Array.isArray(item.evidence) ? item.evidence.map((entry) => ({ ...entry })) : [];
    return {
      sourceRecordId: item.id || "",
      leadId: item.source?.leadId || item.handle || item.id || "",
      nickname: item.name || "抖音用户",
      uniqueId: String(item.handle || "").replace(/^@+/, ""),
      secUid: item.source?.secUid || item.source?.sec_uid || item.secUid || item.sec_uid || "",
      text: evidence[0]?.quote || item.profile || "",
      source: { ...(item.source || {}), type: item.source?.type || "作品评论" },
      evidence,
      profileUrl: item.profileUrl || ""
    };
  }

  function openIntentAnalysisFromProspects(items = [], run = {}, { allowSelected = false } = {}) {
    const selected = (Array.isArray(items) ? items : []).filter((item) => allowSelected ? isContactableRecord(item) : isAwaitingIntentAnalysis(item));
    if (!selected.length) {
      showToast(allowSelected ? "请选择来源明确、可以分析的互动用户" : "请选择找客专员汇总、且仍待分析的互动用户");
      return;
    }
    const candidates = selected.map(intentCandidateFromProspect);
    const source = selected[0]?.source || {};
    const resumeFlow = {
      agentId: "mkt-intent-analyst",
      step: "setup",
      intentCandidates: candidates,
      intentSelectedIds: candidates.map((candidate) => candidate.sourceRecordId || candidate.leadId),
      intentGoal: "判断这些用户是否是高意向潜客，并说明值得继续跟进的依据。",
      analysisMode: "intent",
      analysisKind: "intent",
      analysisScope: "user_intent",
      prefilledFromResult: true,
      sourceResultId: resultId(run) || source.sourceResultId || "",
      sourceTaskId: run.taskId || source.sourceTaskId || source.taskId || "",
      sourceTaskTitle: run.title || run.taskTitle || "找人结果",
      sourceTaskGoal: run.query || run.goal || run.title || "",
      sourceResultType: run.resultType || "潜客",
      sourceScope: run.sourceScope || source.sourceScope || selected[0]?.contactability?.sourceScope || "",
      sourceAccountId: run.accountId || source.accountId || "",
      sourceAccountName: run.accountName || source.accountName || ""
    };
    globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({
      initialAgentId: resumeFlow.agentId,
      resumeFlow
    }));
  }

  function openPrivateOutreachFromProspects(items = null, { outreachMode = PRIVATE_OUTREACH_MODES.PROSPECTS, source = "成果中心潜客", run = {} } = {}) {
    const mode = normalizePrivateOutreachMode(outreachMode);
    const selectedIds = prospectSelectionIds(items, state.selected);
    const selectedRecords = records
      .filter((item) => selectedIds.has(item.id) && (mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? isDirectOutreachCandidate(item) : isManualOutreachReady(item) && isContactableRecord(item)))
    if (!selectedRecords.length) {
      showToast(mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "请选择来源明确、尚未触达且有抖音身份的用户" : `请选择状态为“${PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION}”的潜客`);
      return;
    }
    const selected = selectedRecords
      .map((item) => ({
        ...item,
        id: item.id,
        recordId: item.id,
        name: item.name,
        profileUrl: item.profileUrl,
        sourceScope: item.contactability?.sourceScope || item.sourceScope || item.source?.sourceScope || "",
        sourceAccountId: item.source?.accountId || "",
        sourceAccountName: item.source?.accountName || ""
      }))
      .filter(commentCanBeContacted);
    if (!selected.length) {
      showToast(`已选中 ${selectedRecords.length} 位待确认触达用户，但他们暂未回传可用于私信的抖音身份`);
      return;
    }
    const first = selectedRecords[0] || {};
    openPrivateOutreachFromResult({
      taskId: run.taskId || "results-center",
      resultType: run.resultType || (mode === PRIVATE_OUTREACH_MODES.ALL_FOUND ? "找到的人" : "潜客"),
      sourceScope: run.sourceScope || first.contactability?.sourceScope || first.sourceScope || first.source?.sourceScope || "",
      accountId: run.accountId || first.source?.accountId || "",
      accountName: run.accountName || first.source?.accountName || ""
    }, selected, source, mode);
  }

  function openInboxFromProspects(items = null) {
    const selectedIds = prospectSelectionIds(items, state.selected);
    const selected = records.filter((item) => selectedIds.has(item.id) && item.status === "已触达");
    if (!selected.length) {
      showToast("请选择状态为“已触达”的用户");
      return;
    }
    const resumeFlow = buildInboxResumeFlow({ items: selected });
    const navigation = globalThis.__SALEBUDDY__?.navFrameworkReady;
    if (!navigation?.then) {
      showToast("页面导航尚未就绪，请稍后重试");
      return;
    }
    navigation
      .then((framework) => {
        if (typeof framework?.openAgentSquare !== "function") {
          showToast("暂时无法打开私信客服，请刷新后重试");
          return;
        }
        framework.openAgentSquare({
          initialAgentId: resumeFlow.agentId,
          resumeFlow
        });
        selected.forEach((item) => {
          prospectStore.update(item.id, {
            status: "跟进中",
            tags: [...new Set([...(item.tags || []), "私信监听中"])],
            timeline: [["刚刚", "已交给私信客服监听新的私信动态", "touch"], ...(item.timeline || [])].slice(0, 12),
            lastSeen: "刚刚"
          });
        });
        state.selected.clear();
      })
      .catch(() => showToast("打开私信客服失败，请稍后重试"));
  }

  function renderDouyinFinderResultDetail(container, run) {
    const allAccounts = finderResultAccounts(run);
    void hydrateFinderAvatars(run, allAccounts);
    if (state.finderSelectionRunId !== run.taskId) {
      state.finderSelectionRunId = run.taskId;
      state.selectedFinderAccountIds.clear();
      state.finderAccountFilter = "全部";
      state.finderAccountSearch = "";
    }
    const query = state.finderAccountSearch.trim().toLowerCase();
    const visibleAccounts = allAccounts.filter((account) => {
      const status = finderAccountStatus(account);
      const stateData = account.finderState || {};
      const statusMatch = state.finderAccountFilter === "全部"
        || (state.finderAccountFilter === "匹配" && status === "匹配")
        || (state.finderAccountFilter === "待核验" && status === "待核验")
        || (state.finderAccountFilter === "不匹配" && status === "不匹配")
        || (state.finderAccountFilter === "已保存" && stateData.saved)
        || (state.finderAccountFilter === "已归档" && status === "已归档");
      const haystack = [finderAccountName(account), account.handle, account.location, finderAccountUrl(account), ...(finderAccountTags(account))].join(" ").toLowerCase();
      return statusMatch && (!query || haystack.includes(query));
    });
    const selectedAccounts = allAccounts.filter((account) => state.selectedFinderAccountIds.has(finderAccountId(account)));
    const persist = (mutator, message) => {
      const next = allAccounts.map((account) => state.selectedFinderAccountIds.has(finderAccountId(account)) ? mutator({ ...account, finderState: { ...(account.finderState || {}) } }) : account);
      prospectStore.updateRun(run.taskId, { items: next });
      state.selectedFinderAccountIds.clear();
      if (message) showToast(message);
    };
    const stateClass = (status) => status === "匹配" ? "is-match" : status === "待核验" ? "is-review" : "";

    const summary = el("div", "sb-finder-run-summary");
    [[run.counts?.discovered ?? 0, "搜索候选"], [run.counts?.enriched ?? run.counts?.resolved ?? run.counts?.screened ?? 0, "深度核验"], [run.counts?.qualified ?? run.counts?.matched ?? 0, "符合主题"], [run.counts?.delivered ?? allAccounts.length, "最终交付"]].forEach(([value, label]) => {
      const item = el("div", "sb-finder-run-stat"); item.append(el("strong", null, String(value)), el("span", null, label)); summary.appendChild(item);
    });
    container.appendChild(summary);

    const toolbar = el("div", "sb-finder-account-toolbar");
    ["全部", "匹配", "待核验", "不匹配", "已保存", "已归档"].forEach((label) => {
      const button = el("button", `sb-finder-account-filter${state.finderAccountFilter === label ? " is-active" : ""}`, label); button.type = "button";
      button.addEventListener("click", () => { state.finderAccountFilter = label; render(); }); toolbar.appendChild(button);
    });
    const search = el("input", "sb-finder-account-search"); search.type = "search"; search.placeholder = "搜索昵称、账号、地域或标签"; search.value = state.finderAccountSearch; search.setAttribute("aria-label", "搜索找人结果"); search.addEventListener("input", (event) => { state.finderAccountSearch = event.target.value; render(); }); toolbar.appendChild(search);
    const exportButton = el("button", "sb-finder-account-filter", "导出本批 CSV"); exportButton.type = "button"; exportButton.disabled = !visibleAccounts.length; exportButton.addEventListener("click", () => { exportFinderAccounts(visibleAccounts, run.taskId); showToast(`已导出 ${visibleAccounts.length} 个候选账号`); }); toolbar.appendChild(exportButton);
    const analyzeBatch = el("button", "sb-finder-account-filter", "分析本批账号"); analyzeBatch.type = "button"; analyzeBatch.title = allAccounts.length > ACCOUNT_ANALYSIS_LIMIT ? `本批超过单次分析上限 ${ACCOUNT_ANALYSIS_LIMIT} 个，请先选择账号` : ""; analyzeBatch.addEventListener("click", () => openFinderBatchAnalysis(run, allAccounts)); toolbar.appendChild(analyzeBatch);
    container.appendChild(toolbar);

    if (selectedAccounts.length) {
      const bulk = el("div", "sb-finder-account-bulk"); bulk.append(el("strong", null, `已选择 ${selectedAccounts.length} 个账号`), document.createTextNode("批量操作："));
      const save = el("button", null, "保存候选"); save.type = "button"; save.addEventListener("click", () => persist((account) => ({ ...account, finderState: { ...account.finderState, saved: true } }), `已保存 ${selectedAccounts.length} 个候选账号`));
      const tag = el("button", null, "标记重点"); tag.type = "button"; tag.addEventListener("click", () => persist((account) => ({ ...account, finderState: { ...account.finderState, tags: [...new Set([...(account.finderState.tags || []), "重点候选"])] } }), `已标记 ${selectedAccounts.length} 个重点候选`));
      const archive = el("button", null, "归档"); archive.type = "button"; archive.addEventListener("click", () => persist((account) => ({ ...account, finderState: { ...account.finderState, status: "已归档" } }), `已归档 ${selectedAccounts.length} 个候选账号`));
      const analyze = el("button", "primary", "分析选中账号"); analyze.type = "button"; analyze.addEventListener("click", () => openFinderBatchAnalysis(run, selectedAccounts));
      const outreach = el("button", null, "仅供分析"); outreach.type = "button"; outreach.disabled = true; outreach.title = "公域找人结果不能直接触达";
      const clear = el("button", null, "清除选择"); clear.type = "button"; clear.addEventListener("click", () => { state.selectedFinderAccountIds.clear(); render(); });
      bulk.append(save, tag, archive, analyze, outreach, clear); container.appendChild(bulk);
    }

    const tableWrap = el("div", "sb-finder-account-table-wrap");
    if (!visibleAccounts.length) {
      tableWrap.appendChild(el("div", "sb-finder-account-empty", allAccounts.length ? "没有符合当前筛选条件的账号" : "本批没有候选账号")); container.appendChild(tableWrap); return;
    }
    const table = el("table", "sb-finder-account-table");
    const head = el("thead"); const headRow = el("tr"); ["选择", "账号", "近期涨粉", "匹配评分", "匹配", "粉丝 / 作品 / 获赞", "地域", "直播", "依据"].forEach((label) => headRow.appendChild(el("th", null, label))); head.appendChild(headRow);
    const body = el("tbody");
    const visibleIds = visibleAccounts.map(finderAccountId);
    visibleAccounts.forEach((account) => {
      const id = finderAccountId(account); const status = finderAccountStatus(account); const row = el("tr", state.selectedFinderAccountIds.has(id) ? "is-selected" : "");
      const checkboxCell = el("td"); const checkbox = el("input", "sb-finder-account-check"); checkbox.type = "checkbox"; checkbox.checked = state.selectedFinderAccountIds.has(id); checkbox.setAttribute("aria-label", `选择${finderAccountName(account)}`); checkbox.addEventListener("click", (event) => event.stopPropagation()); checkbox.addEventListener("change", () => { if (checkbox.checked) state.selectedFinderAccountIds.add(id); else state.selectedFinderAccountIds.delete(id); render(); }); checkboxCell.appendChild(checkbox);
      const accountCell = el("td"); const person = el("div", "sb-finder-account-person"); const accountCopy = el("div", "sb-finder-account-copy"); const name = el("span", "sb-finder-account-name", finderAccountName(account)); const url = finderAccountUrl(account); const handle = el(url ? "a" : "span", "sb-finder-account-handle", account.handle || account.accountId || "身份未返回"); if (url) { handle.href = url; handle.target = "_blank"; handle.rel = "noopener noreferrer"; handle.classList.add("sb-finder-account-link"); } accountCopy.append(name, handle); person.append(renderPersonAvatar("sb-finder-account-avatar", account, finderAccountName(account)), accountCopy); accountCell.appendChild(person);
      const scoreCell = el("td"); scoreCell.appendChild(el("span", "sb-finder-account-score", account.score == null ? "—" : String(account.score)));
      const matchCell = el("td"); matchCell.appendChild(el("span", `sb-finder-account-state ${stateClass(status)}`, status)); const tags = finderAccountTags(account); if (tags.length) { const tagList = el("div", "sb-finder-account-tags"); tags.forEach((tag) => tagList.appendChild(el("span", "sb-finder-account-tag", tag))); matchCell.appendChild(tagList); }
      const growthCell = el("td", null, account.growth?.newFollowers == null ? "—" : `近 ${account.growth.windowDays || "?"} 天 ${Number(account.growth.newFollowers).toLocaleString("zh-CN")}`);
      const metricCell = el("td", null, `${account.followers ?? "—"} / ${account.awemeCount ?? "—"} / ${account.likes ?? "—"}`);
      const locationCell = el("td", null, account.location || "—");
      const liveCell = el("td", null, account.isLive ? "直播中" : "未直播");
      const reasonCell = el("td"); reasonCell.appendChild(el("span", "sb-finder-account-reason", (account.reasons || []).slice(0, 2).join("；") || "暂无匹配理由"));
      row.append(checkboxCell, accountCell, growthCell, scoreCell, matchCell, metricCell, locationCell, liveCell, reasonCell); row.addEventListener("click", () => { if (id) { state.selectedFinderAccountIds.clear(); state.selectedFinderAccountIds.add(id); render(); } }); body.appendChild(row);
    });
    table.append(head, body); tableWrap.appendChild(table); container.appendChild(tableWrap);
    const selectAll = el("button", "sb-finder-account-filter", `全选当前 ${visibleIds.length} 个`); selectAll.type = "button"; selectAll.addEventListener("click", () => { const allSelected = visibleIds.every((id) => state.selectedFinderAccountIds.has(id)); visibleIds.forEach((id) => allSelected ? state.selectedFinderAccountIds.delete(id) : state.selectedFinderAccountIds.add(id)); render(); }); toolbar.insertBefore(selectAll, search);
  }

  function isConverted(item) {
    return item?.conversionStatus === "已转化";
  }

  function visiblePeople(converted) {
    const query = state.search.trim().toLowerCase();
    return records.filter((item) => {
      if (!isContactableRecord(item)) return false;
      if (!converted && !isProspectRecord(item)) return false;
      const matchesConversion = converted == null || isLeadCenterRecord(item) === converted;
      const matchesFilter = state.filter === "全部"
        || (state.filter === "高意向" && item.tier === "high")
        || (state.filter === PROSPECT_STATUSES.AUTOMATIC_OUTREACH && item.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH)
        || (state.filter === PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION && isManualOutreachReady(item))
        || (state.filter === "已触达" && item.status === "已触达")
        || (state.filter === "已回复" && item.status === "已回复")
        || (state.filter === "跟进中" && item.status === "跟进中")
        || (state.filter === "已留资" && item.status === "已留资")
        || (state.filter === "成交跟进" && item.conversionStatus === "成交跟进")
        || (state.filter === "已转化" && item.conversionStatus === "已转化")
        || (state.filter === "已失效" && item.conversionStatus === "已失效")
        || (state.filter === "未回复" && item.status === "未回复")
        || (state.filter === "即将流失" && item.status === "即将流失")
        || (state.filter === "已归档" && item.status === "已归档")
        || (state.filter === "已保存" && item.saved);
      const matchesSearch = !query || `${item.name}${item.handle}${item.source?.type || item.source}${item.tags.join("")}${formatContact(item.contact)}${item.contact?.phone || ""}${item.contact?.email || ""}${item.contact?.wechat || ""}${item.owner}`.toLowerCase().includes(query);
      return matchesConversion && matchesFilter && matchesSearch;
    });
  }

  function visibleProspects() { return visiblePeople(false); }
  function visibleOpportunities() { return visiblePeople(true); }
  function discoveryItemsForCurrentScope() {
    const sources = discoverySourcesForPage();
    const origin = state.selectedDiscoveryOrigin;
    const scopeId = state.selectedDiscoveryTaskId;
    const scopedItems = origin === "own"
      ? sources.ownItems.filter((item) => !scopeId || scopeId === "all" || `own-account:${item.sourceAccount?.id || "own:unknown"}` === scopeId)
      : origin === "public"
        ? sources.publicItems.filter((item) => !scopeId || scopeId === "all" || item.sourceTasks?.some((task) => task.id === scopeId))
        : sources.otherItems;
    return scopedItems;
  }

  function resetDiscoverySelection(origin = state.selectedDiscoveryOrigin) {
    const sources = discoverySourcesForPage();
    const nextOrigin = origin === "own" && !sources.ownItems.length
      ? sources.publicItems.length ? "public" : "other"
      : origin === "public" && !sources.publicItems.length
        ? sources.ownItems.length ? "own" : "other"
        : origin;
    state.selectedDiscoveryOrigin = nextOrigin;
    const scopes = nextOrigin === "own" ? sources.accounts : nextOrigin === "public" ? sources.tasks : [];
    state.selectedDiscoveryTaskId = scopes[0]?.id || "all";
    state.selectedDiscoveredIds.clear();
    state.discoverySelectionTaskId = state.selectedDiscoveryTaskId;
    state.selectedDiscoveredId = discoveryItemsForCurrentScope()[0]?.id || null;
  }

  function visibleDiscovered() {
    const query = state.search.trim().toLowerCase();
    return discoveryItemsForCurrentScope().filter((item) => {
      const haystack = [item.name, item.handle, item.source, item.quote, item.reason, item.status, item.sourceAccount?.name, ...(item.sourceTasks || []).flatMap((task) => [task.title, task.profile])].filter(Boolean).join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });
  }
  function lifecycleLabel(item) {
    return ["成交跟进", "已转化", "已失效"].includes(item?.conversionStatus)
      ? `${item.conversionStatus} · ${item.status || "已留资"}`
      : item.status;
  }

  function appendHumanLeadActions(actions, item) {
    if (dashboardLeadLabel(item) !== "已留资") return false;
    const update = (status, note, toast) => {
      prospectStore.setConversionStatus([item.id], status, { note, source: "manual" });
      showToast(`${item.name} ${toast}`);
      render();
    };

    if (item.conversionStatus === "已转化" || item.conversionStatus === "已失效") {
      const done = el("button", "", item.conversionStatus);
      done.type = "button";
      done.disabled = true;
      actions.appendChild(done);
      return true;
    }

    if (item.conversionStatus !== "成交跟进") {
      const followup = el("button", "", "进入成交跟进");
      followup.type = "button";
      followup.addEventListener("click", () => update("成交跟进", "已由人工接手，推进报价、预约或成交。", "已进入成交跟进"));
      actions.appendChild(followup);
    }

    const convert = el("button", "primary", "确认已转化");
    convert.type = "button";
    convert.addEventListener("click", () => update("已转化", "已通过人工确认进入客户资产。", "已确认转化"));
    const lost = el("button", "", "标记已失效");
    lost.type = "button";
    lost.addEventListener("click", () => update("已失效", "人工确认当前机会不再继续推进。", "已标记为失效"));
    actions.append(convert, lost);
    return true;
  }

  function selectedProspect() { return records.find((item) => item.id === state.selectedId) || null; }
  function select(item, checked = true) { if (checked) state.selected.add(item.id); else state.selected.delete(item.id); }
  function isSelected(item) { return state.selected.has(item.id); }
  function updateSelected(mutator) {
    for (const item of records) if (state.selected.has(item.id)) mutator(item);
    if (!mockPreview) prospectStore.commit(records);
    render();
  }
  function appendTimeline(item, text, type = "touch") { item.timeline.unshift(["刚刚", text, type]); item.lastSeen = "刚刚"; }

  function renderLoop() {
    const loop = el("section", "sb-prospect-loop");
    const counts = resultFunnelCounts({ records, runs });
    const steps = [
      ["发现", String(counts.discovered), "已分析或检索的目标用户", () => { state.resultType = "发现"; state.search = ""; resetDiscoverySelection(); render(); }],
      ["潜客", String(counts.prospects), "可继续推进的客户线索", () => { state.resultType = "潜客"; state.filter = "全部"; state.search = ""; state.view = "list"; state.detailTab = "overview"; state.selectedId = records.find(isProspectRecord)?.id || null; render(); }],
      ["成功触达", String(counts.touched), "已确认发送成功的用户", () => { state.resultType = "潜客"; state.filter = "已触达"; state.search = ""; state.detailTab = "overview"; state.selectedId = records.find((item) => isContactableRecord(item) && item.status === "已触达")?.id || null; render(); }],
      ["最终转化", String(counts.converted), "已确认完成转化", () => { state.resultType = "线索"; state.filter = "已转化"; state.search = ""; state.detailTab = "overview"; state.selectedId = records.find((item) => isContactableRecord(item) && item.conversionStatus === "已转化")?.id || null; render(); }]
    ];
    steps.forEach(([label, value, meta, action]) => {
      const button = el("button", "sb-prospect-loop-step"); button.type = "button"; button.addEventListener("click", action);
      const copy = el("span", "sb-prospect-loop-copy"); copy.append(el("span", "sb-prospect-loop-label", label), el("span", "sb-prospect-loop-meta", meta));
      button.append(copy, el("strong", "sb-prospect-loop-value", value)); loop.appendChild(button);
    });
    return loop;
  }

  function renderTaskComposer() {
    if (!state.taskComposer) return;
    const modal = el("div", "sb-prospect-modal");
    const card = el("form", "sb-prospect-modal-card");
    const head = el("div", "sb-prospect-modal-head");
    const copy = el("div"); copy.append(el("div", "sb-prospect-modal-title", "新建潜客拓展任务"), el("div", "sb-prospect-modal-copy", "配置目标和来源后，任务会进入找人 → 分析 → 触达的执行链路。"));
    const close = el("button", "sb-prospect-modal-close", "×"); close.type = "button"; close.setAttribute("aria-label", "关闭"); close.addEventListener("click", () => { state.taskComposer = false; render(); }); head.append(copy, close);
    const fields = el("div", "sb-prospect-modal-fields");
    const titleLabel = el("label", "sb-prospect-modal-field", "任务目标"); const title = el("input"); title.value = "找高意向客户"; title.required = true; titleLabel.appendChild(title);
    const sourceLabel = el("label", "sb-prospect-modal-field", "线索来源"); const source = el("select"); ["商品评论 · 直播互动 · 账号主页", "竞品账号与粉丝列表", "历史客户与未回复名单"].forEach((value) => source.appendChild(el("option", null, value))); sourceLabel.appendChild(source);
    const sizeLabel = el("label", "sb-prospect-modal-field", "本轮规模"); const size = el("select"); ["先处理 50 位", "先处理 100 位", "持续处理全部新增"].forEach((value) => size.appendChild(el("option", null, value))); sizeLabel.appendChild(size);
    fields.append(titleLabel, sourceLabel, sizeLabel);
    const actions = el("div", "sb-prospect-modal-actions"); const cancel = el("button", null, "取消"); cancel.type = "button"; cancel.addEventListener("click", () => { state.taskComposer = false; render(); }); const submit = el("button", "primary", "创建并开始"); submit.type = "submit"; actions.append(cancel, submit);
    card.append(head, fields, actions); card.addEventListener("submit", (event) => { event.preventDefault(); globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.()); });
    modal.appendChild(card); modal.addEventListener("click", (event) => { if (event.target === modal) { state.taskComposer = false; render(); } }); wrap.appendChild(modal);
  }

  function renderBulkBar() {
    if (!state.selected.size) return null;
    const bar = el("div", "sb-prospect-bulk"); bar.append(el("strong", null, `已选择 ${state.selected.size} 位潜客`), el("span", null, "批量操作："));
    const touchTargets = records.filter((item) => isContactableRecord(item) && state.selected.has(item.id) && isManualOutreachReady(item));
    const inboxTargets = records.filter((item) => isContactableRecord(item) && state.selected.has(item.id) && item.status === "已触达");
    const outreach = el("button", "primary", "一键触达"); outreach.type = "button"; outreach.disabled = !touchTargets.length; outreach.title = `把${PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION}用户交给私信触达专员`; outreach.addEventListener("click", openPrivateOutreachFromProspects);
    const inbox = el("button", null, "开启私信承接"); inbox.type = "button"; inbox.disabled = !inboxTargets.length; inbox.title = "监听已触达用户的新私信"; inbox.addEventListener("click", openInboxFromProspects);
    const selectedItems = records.filter((item) => state.selected.has(item.id));
    const intentItems = selectedItems.filter(isAwaitingIntentAnalysis);
    const analyze = el("button", null, intentItems.length ? "分析互动用户" : "分析选中账号"); analyze.type = "button";
    analyze.addEventListener("click", () => intentItems.length
      ? openIntentAnalysisFromProspects(intentItems)
      : openAccountAnalysis({ items: selectedItems }));
    bar.appendChild(analyze);
    const archive = el("button", null, "批量归档"); archive.type = "button"; archive.addEventListener("click", () => updateSelected((item) => { item.status = "已归档"; }));
    const clear = el("button", null, "清除选择"); clear.type = "button"; clear.addEventListener("click", () => { state.selected.clear(); render(); }); bar.append(outreach, inbox, archive, clear); return bar;
  }

  function renderPerson(item, { card = false } = {}) {
    const row = el(card ? "article" : "tr", `${card ? "sb-prospect-card" : "sb-prospect-row"}${item.id === state.selectedId ? " is-selected" : ""}`); const checkbox = el("input", card ? "sb-prospect-card-check" : null); checkbox.type = "checkbox"; checkbox.checked = isSelected(item); checkbox.setAttribute("aria-label", `选择${item.name}`); checkbox.addEventListener("click", (event) => { event.stopPropagation(); select(item, checkbox.checked); render(); });
    if (card) {
      const top = el("div", "sb-prospect-card-top"); const copy = el("div", "sb-prospect-card-copy"); copy.append(el("div", "sb-prospect-card-name", item.name), el("div", "sb-prospect-card-handle", item.handle)); top.append(renderPersonAvatar("sb-prospect-avatar", item, item.name), copy, el("strong", "sb-prospect-card-score", String(item.score))); const tags = el("div", "sb-prospect-card-tags"); item.tags.forEach((tag) => tags.appendChild(el("span", "sb-prospect-card-tag", tag))); const foot = el("div", "sb-prospect-card-foot"); foot.append(el("span", null, sourceText(item)), el("span", `sb-prospect-status ${statusClass(item.status)}`, lifecycleLabel(item))); row.append(checkbox, top, tags, foot);
    } else {
      const person = el("div", "sb-prospect-person"); const copy = el("div", "sb-prospect-person-copy"); copy.append(el("div", "sb-prospect-person-name", item.name), el("div", "sb-prospect-person-handle", item.handle)); person.append(renderPersonAvatar("sb-prospect-avatar", item, item.name), copy); const selectCell = el("td"); selectCell.appendChild(checkbox); const personCell = el("td"); personCell.appendChild(person); const sourceCell = el("td", "sb-prospect-source", sourceText(item)); const scoreCell = el("td"); scoreCell.appendChild(el("span", `sb-prospect-score${scoreClass(item.score)}`, String(item.score))); const tagsCell = el("td", "sb-prospect-tag", item.tags.slice(0, 2).join(" · ")); const statusCell = el("td"); statusCell.appendChild(el("span", `sb-prospect-status ${statusClass(item.status)}`, lifecycleLabel(item))); const ownerCell = el("td", "sb-prospect-source", item.owner); row.append(selectCell, personCell, sourceCell, scoreCell, tagsCell, statusCell, ownerCell);
    }
    row.addEventListener("click", () => { state.selectedId = item.id; state.detailTab = "overview"; render(); }); return row;
  }

  function renderListContent(container, items) {
    queuePersonAvatarHydration(items);
    if (!items.length) { container.appendChild(el("div", "sb-prospect-empty", state.resultType === "线索" ? "还没有已留资的线索" : "没有符合条件的潜客")); return; }
    if (state.view === "cards") { const grid = el("div", "sb-prospect-cards"); items.forEach((item) => grid.appendChild(renderPerson(item, { card: true }))); container.appendChild(grid); return; }
    if (state.view === "groups") {
      const groups = new Map(); items.forEach((item) => { const key = state.groupBy === "source" ? sourceText(item) : item.status; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }); const wrap = el("div", "sb-prospect-groups");
      groups.forEach((groupItems, key) => { const section = el("section"); const title = el("div", "sb-prospect-group-title"); title.append(el("span", null, key), el("span", null, `${groupItems.length} 位`)); const list = el("div", "sb-prospect-group-items"); groupItems.forEach((item) => { const row = el("div", "sb-prospect-group-item"); row.append(renderPersonAvatar("sb-prospect-avatar", item, item.name)); const copy = el("div", "sb-prospect-group-copy"); copy.append(el("div", "sb-prospect-group-name", item.name), el("div", "sb-prospect-group-meta", `${item.tags.join(" · ")} · ${item.score} 分`)); row.append(copy, el("span", `sb-prospect-status ${statusClass(item.status)}`, lifecycleLabel(item))); row.addEventListener("click", () => { state.selectedId = item.id; render(); }); list.appendChild(row); }); section.append(title, list); wrap.appendChild(section); }); container.appendChild(wrap); return;
    }
    const tableWrap = el("div", "sb-prospect-table-wrap"); const table = el("table", "sb-prospect-table"); const head = el("thead"); const headRow = el("tr"); ["选择", state.resultType === "线索" ? "线索" : "潜客", "来源", "意向评分", "标签", state.resultType === "线索" ? "线索状态" : "跟进状态", "负责人"].forEach((label) => headRow.appendChild(el("th", null, label))); head.appendChild(headRow); const body = el("tbody"); items.forEach((item) => body.appendChild(renderPerson(item))); table.append(head, body); tableWrap.appendChild(table); container.appendChild(tableWrap);
  }

  function renderDiscoveredListContent(container, items) {
    queuePersonAvatarHydration(items);
    if (!items.length) {
      container.appendChild(el("div", "sb-prospect-empty", state.selectedDiscoveryOrigin === "own" ? "这个账号下还没有新的互动用户" : "这个找人任务还没有可展示的账号"));
      return;
    }
    const ownView = state.selectedDiscoveryOrigin === "own";
    const selectedItems = items.filter((item) => state.selectedDiscoveredIds.has(item.id));
    const bulk = el("div", "sb-prospect-bulk");
    bulk.append(el("strong", null, `已选 ${selectedItems.length} 位`));
    const selectAll = el("button", null, selectedItems.length === items.length ? "取消全选" : `全选当前 ${items.length} 位`);
    selectAll.type = "button";
    selectAll.addEventListener("click", () => {
      if (selectedItems.length === items.length) items.forEach((item) => state.selectedDiscoveredIds.delete(item.id));
      else items.forEach((item) => state.selectedDiscoveredIds.add(item.id));
      state.discoverySelectionTaskId = state.selectedDiscoveryTaskId;
      render();
    });
    const analyze = el("button", "primary", ownView ? "分析已选用户" : "分析已选账号");
    analyze.type = "button";
    analyze.disabled = !selectedItems.length;
    analyze.addEventListener("click", () => ownView ? openDiscoveredPeopleAnalysis(selectedItems) : openDiscoveredBatchAnalysis(selectedItems));
    if (ownView) {
      const touchTargets = selectedItems
        .map((item) => recordForDiscovered(item))
        .filter(isDirectOutreachCandidate);
      const outreach = el("button", null, "开始触达");
      outreach.type = "button";
      outreach.disabled = !touchTargets.length;
      outreach.title = "向来自已授权账号、尚未触达且有抖音身份的互动用户发起触达";
      outreach.addEventListener("click", () => openDiscoveredOutreach(selectedItems));
      bulk.append(selectAll, analyze, outreach);
    } else {
      bulk.append(selectAll, analyze);
    }
    const clear = el("button", null, "清除选择");
    clear.type = "button";
    clear.disabled = !selectedItems.length;
    clear.addEventListener("click", () => { state.selectedDiscoveredIds.clear(); render(); });
    bulk.append(clear);
    container.appendChild(bulk);
    const tableWrap = el("div", "sb-prospect-table-wrap");
    const table = el("table", "sb-prospect-table");
    const head = el("thead");
    const headRow = el("tr");
    const scopedToTask = state.selectedDiscoveryTaskId && state.selectedDiscoveryTaskId !== "all";
    (ownView
      ? ["选择", "用户", ...(scopedToTask ? [] : ["来源抖音账号"]), "互动内容", "当前状态"]
      : ["选择", "账号", ...(scopedToTask ? [] : ["来源任务"]), "公开画像", "匹配依据"]
    ).forEach((label) => headRow.appendChild(el("th", null, label)));
    head.appendChild(headRow);
    const body = el("tbody");
    items.forEach((item) => {
      const row = el("tr", `sb-prospect-row${item.id === state.selectedDiscoveredId ? " is-selected" : ""}`);
      const selectCell = el("td");
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedDiscoveredIds.has(item.id);
      checkbox.setAttribute("aria-label", `选择${item.name}`);
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selectedDiscoveredIds.add(item.id);
        else state.selectedDiscoveredIds.delete(item.id);
        state.discoverySelectionTaskId = state.selectedDiscoveryTaskId;
        render();
      });
      selectCell.appendChild(checkbox);
      const userCell = el("td");
      const person = el("div", "sb-prospect-person");
      const copy = el("div", "sb-prospect-person-copy");
      const profile = item.profileUrl ? el("a", "sb-prospect-person-name", item.name) : el("div", "sb-prospect-person-name", item.name);
      if (item.profileUrl) {
        profile.href = item.profileUrl;
        profile.target = "_blank";
        profile.rel = "noopener noreferrer";
        profile.addEventListener("click", (event) => event.stopPropagation());
      }
      copy.append(profile, el("div", "sb-prospect-person-handle", item.handle ? `@${item.handle.replace(/^@+/, "")}` : "用户身份未返回"));
      person.append(renderPersonAvatar("sb-prospect-avatar", item, item.name), copy);
      userCell.appendChild(person);
      if (ownView) {
        const record = recordForDiscovered(item);
        const accountCell = el("td", "sb-prospect-source", item.sourceAccount ? sourceDouyinAccountName(item.sourceAccount) : "未记录来源抖音账号");
        const interactionCell = el("td", "sb-discovery-evidence");
        interactionCell.append(el("span", "sb-discovery-evidence-copy", item.quote || item.source || "互动内容未返回"));
        const currentStatus = record?.status || item.status || "待分析";
        const statusCell = el("td");
        statusCell.appendChild(el("span", `sb-prospect-status ${statusClass(currentStatus)}`, currentStatus));
        row.append(selectCell, userCell, ...(scopedToTask ? [] : [accountCell]), interactionCell, statusCell);
        row.addEventListener("click", () => { state.selectedDiscoveredId = item.id; render(); });
        body.appendChild(row);
        return;
      }
      const sourceCell = el("td", "sb-prospect-source", (item.sourceTasks || []).map((task) => task.title).join(" / ") || item.source || "其他发现结果");
      const profileCell = el("td", "sb-discovery-profile", [
        item.followers != null ? `粉丝 ${Number(item.followers).toLocaleString("zh-CN")}` : "",
        item.awemeCount != null ? `作品 ${Number(item.awemeCount).toLocaleString("zh-CN")}` : "",
        item.likes != null ? `获赞 ${Number(item.likes).toLocaleString("zh-CN")}` : "",
        item.location,
        item.isLive ? "直播中" : ""
      ].filter(Boolean).join(" · ") || "公开画像未返回");
      const statusText = discoveryMatchLabel(item);
      const statusClassName = item.matched === true ? "is-hot" : item.matched === false ? "is-archive" : "is-research";
      const evidence = item.reason || item.quote || "暂无匹配依据";
      const evidenceCell = el("td", `sb-discovery-evidence${item.reason || item.quote ? "" : " is-pending"}`);
      evidenceCell.append(el("span", `sb-prospect-status ${statusClassName}`, statusText), el("span", "sb-discovery-evidence-copy", evidence));
      row.append(selectCell, userCell, ...(scopedToTask ? [] : [sourceCell]), profileCell, evidenceCell);
      row.addEventListener("click", () => { state.selectedDiscoveredId = item.id; render(); });
      body.appendChild(row);
    });
    table.append(head, body);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  }

  function recordForDiscovered(item = {}) {
    const record = item?.recordId ? records.find((entry) => entry.id === item.recordId) || null : null;
    if (!record) return null;
    if (item.sourceAccountResolved === false) {
      return {
        ...record,
        contactability: { ...(record.contactability || {}), allowed: false }
      };
    }
    if (!item.sourceAccount?.id) return record;
    return {
      ...record,
      source: {
        ...(record.source || {}),
        accountId: item.sourceAccount.id,
        accountName: item.sourceAccount.name,
        accountUrl: item.sourceAccount.profileUrl || record.source?.accountUrl || ""
      }
    };
  }

  function sourceRunForDiscovered(item = {}) {
    const sourceTaskId = item.sourceTasks?.[0]?.taskId || item.sourceTasks?.[0]?.id || item.taskId;
    return runs.find((run) => run.taskId === sourceTaskId || resultId(run) === sourceTaskId) || null;
  }

  function openDiscoveredPeopleAnalysis(items = []) {
    const selectedItems = Array.isArray(items) ? items : [];
    const recordsForAnalysis = selectedItems.map(recordForDiscovered).filter(Boolean);
    const ownRecords = selectedItems
      .map((item) => ({ item, record: recordForDiscovered(item) }))
      .filter(({ item, record }) => item?.origin === "own" && record && isContactableRecord(record))
      .map(({ record }) => record);
    if (ownRecords.length) {
      openIntentAnalysisFromProspects(ownRecords, sourceRunForDiscovered(selectedItems[0]) || {}, { allowSelected: true });
      return;
    }
    if (selectedItems.some((item) => item?.origin === "own")) {
      showToast("这批互动用户的潜客记录尚未同步，请刷新成果中心后重试");
      return;
    }
    const awaitingIntent = recordsForAnalysis.filter(isAwaitingIntentAnalysis);
    if (awaitingIntent.length) {
      openIntentAnalysisFromProspects(awaitingIntent, sourceRunForDiscovered(selectedItems[0]) || {});
      return;
    }
    openAccountAnalysis({ items: selectedItems.map((item) => item.accountData || item) });
  }

  function openDiscoveredOutreach(items = []) {
    const prospects = (Array.isArray(items) ? items : [])
      .map(recordForDiscovered)
      .filter(isDirectOutreachCandidate);
    if (!prospects.length) {
      showToast("请选择来源明确、尚未触达且有抖音身份的互动用户");
      return;
    }
    const first = prospects[0] || {};
    openPrivateOutreachFromProspects(prospects, {
      outreachMode: PRIVATE_OUTREACH_MODES.ALL_FOUND,
      source: "找到的人",
      run: {
        taskId: "discovered-people",
        resultType: "找到的人",
        sourceScope: first.contactability?.sourceScope || first.sourceScope || first.source?.sourceScope || "",
        accountId: first.source?.accountId || "",
        accountName: first.source?.accountName || ""
      }
    });
  }

  function openDiscoveredBatchAnalysis(items = []) {
    const publicItems = (Array.isArray(items) ? items : []).filter((item) => item.origin === "public");
    const sourceItems = publicItems.map((item) => item.accountData || item);
    const batch = buildAccountAnalysisBatch(sourceItems);
    if (!batch.count) {
      showToast("本批没有可分析的公开账号");
      return;
    }
    if (batch.exceedsLimit) {
      showToast(`本批有 ${batch.count} 个账号，一次最多同时分析 ${batch.limit} 个，请先选择不超过 ${batch.limit} 个账号`);
      return;
    }
    const sourceTaskIds = new Set(publicItems.flatMap((item) => (item.sourceTasks || []).map((task) => task.taskId || task.id)).filter(Boolean));
    if (sourceTaskIds.size > 1) {
      showToast("请在同一次找人任务内选择账号后再生成报告");
      return;
    }
    const sourceRun = sourceTaskIds.size === 1
      ? runs.find((run) => run.resultType === "抖音找人" && (run.taskId === [...sourceTaskIds][0] || resultId(run) === [...sourceTaskIds][0]))
      : null;
    openAccountAnalysis({
      run: sourceRun || {},
      items: sourceItems,
      goal: sourceRun ? discoveryTaskTitle(sourceRun) : "分析这批公开账号的内容、画像和共同特征"
    });
    state.selectedDiscoveredIds.clear();
  }

  function openFinderBatchAnalysis(run, accounts = []) {
    const batch = buildAccountAnalysisBatch(accounts);
    if (!batch.count) {
      showToast("本批没有可分析的公开账号");
      return;
    }
    if (batch.exceedsLimit) {
      showToast(`本批有 ${batch.count} 个账号，一次最多同时分析 ${batch.limit} 个，请先勾选不超过 ${batch.limit} 个账号`);
      return;
    }
    openAccountAnalysis({ run, items: batch.accounts, goal: discoveryTaskTitle(run) });
    state.selectedFinderAccountIds.clear();
  }

  function renderDiscoverySourceBrowser(container, sources) {
    const browser = el("section", "sb-discovery-task-browser");
    const head = el("div", "sb-discovery-task-browser-head");
    head.append(el("span", "sb-discovery-task-browser-title", "结果来源"), el("span", "sb-discovery-task-browser-meta", `${sources.items.length} 位已找到`));
    const sourceTabs = el("div", "sb-discovery-source-tabs");
    [
      { id: "own", name: "我的账号互动用户", copy: "按来源抖音账号筛选，可分析、可触达", count: sources.ownItems.length },
      { id: "public", name: "公域找人", copy: "按找人任务筛选，仅查看与分析", count: sources.publicItems.length }
    ].forEach((source) => {
      const button = el("button", `sb-discovery-source${state.selectedDiscoveryOrigin === source.id ? " is-active" : ""}`);
      button.type = "button";
      button.append(el("span", "sb-discovery-source-name", source.name), el("span", "sb-discovery-source-copy", source.copy), el("span", "sb-discovery-source-meta", `${source.count} 位`));
      button.addEventListener("click", () => {
        if (state.selectedDiscoveryOrigin === source.id) return;
        state.search = "";
        resetDiscoverySelection(source.id);
        render();
      });
      sourceTabs.appendChild(button);
    });
    const ownView = state.selectedDiscoveryOrigin === "own";
    const groups = ownView ? sources.accounts : sources.tasks;
    const scopeLabel = ownView ? "来源抖音账号" : "找人任务";
    const authorizedAccountCount = sources.authorizedAccounts?.length || groups.filter((group) => group.sourceAccountResolved !== false).length;
    const scopeMeta = ownView ? `${authorizedAccountCount} 个当前已授权抖音账号` : `${groups.length} 次任务`;
    const scopeHead = el("div", "sb-discovery-scope-head");
    scopeHead.append(el("strong", null, scopeLabel), el("span", null, scopeMeta));
    const list = el("div", "sb-discovery-task-list");
    const all = el("button", `sb-discovery-task${state.selectedDiscoveryTaskId === "all" ? " is-active" : ""}`);
    all.type = "button";
    const allCount = ownView ? sources.ownItems.length : sources.publicItems.length;
    if (ownView) all.appendChild(el("span", "sb-discovery-task-kicker", "来源抖音账号 · 已授权"));
    all.append(el("span", "sb-discovery-task-name", ownView ? "全部来源抖音账号" : "全部任务"), el("span", "sb-discovery-task-profile", ownView ? "汇总所有已授权抖音账号的互动用户" : "汇总全部公域找人任务的账号"));
    const allMeta = el("span", "sb-discovery-task-meta"); allMeta.append(el("span", "sb-discovery-task-count", `${allCount} 位`), document.createTextNode("全部")); all.appendChild(allMeta);
    all.addEventListener("click", () => { state.selectedDiscoveryTaskId = "all"; state.selectedDiscoveredIds.clear(); state.discoverySelectionTaskId = "all"; state.selectedDiscoveredId = discoveryItemsForCurrentScope()[0]?.id || null; render(); });
    list.appendChild(all);
    groups.forEach((group) => {
      const button = el("button", `sb-discovery-task is-compact${state.selectedDiscoveryTaskId === group.id ? " is-active" : ""}`);
      button.type = "button";
      const title = ownView ? sourceDouyinAccountName(group) : group.title;
      const profile = ownView ? sourceDouyinAccountDescription(group) : group.profile;
      if (ownView) button.appendChild(el("span", "sb-discovery-task-kicker", "来源抖音账号 · 已授权"));
      if (ownView) {
        const accountHeading = el("span", "sb-discovery-account-heading");
        const avatar = el("span", "sb-discovery-account-avatar");
        mountPersonAvatar(avatar, group, { name: title, eager: true });
        accountHeading.append(avatar, el("span", "sb-discovery-task-name", title));
        button.append(accountHeading, el("span", "sb-discovery-task-profile", profile));
      } else {
        button.append(el("span", "sb-discovery-task-name", title), el("span", "sb-discovery-task-profile", profile));
      }
      const meta = el("span", "sb-discovery-task-meta"); meta.append(el("span", "sb-discovery-task-count", `${group.count} 位`), document.createTextNode(ownView ? "互动用户" : group.generatedAt ? formatResultTime(group.generatedAt) : "历史结果")); button.appendChild(meta);
      button.addEventListener("click", () => { state.selectedDiscoveryTaskId = group.id; state.selectedDiscoveredId = group.items[0]?.id || null; state.selectedDiscoveredIds.clear(); state.discoverySelectionTaskId = group.id; state.search = ""; render(); });
      list.appendChild(button);
    });
    browser.append(head, sourceTabs, scopeHead, list);
    container.appendChild(browser);
  }

  function renderDiscoveredDetail(container) {
    const item = discoverySourcesForPage().items.find((entry) => entry.id === state.selectedDiscoveredId) || null;
    if (!item) {
      const empty = el("div", "sb-prospect-detail-empty");
      empty.append(el("strong", null, "选择一个用户"), el("span", null, "查看来源、互动或匹配依据，并继续下一步处理"));
      container.appendChild(empty);
      return;
    }
    const ownDiscovery = item.origin === "own";
    const record = recordForDiscovered(item);
    const canDirectOutreach = isDirectOutreachCandidate(record);
    const top = el("div", "sb-prospect-detail-top");
    top.append(renderPersonAvatar("sb-prospect-detail-avatar", item, item.name, { eager: true }));
    const copy = el("div");
    const name = item.profileUrl ? el("a", "sb-prospect-detail-name", item.name) : el("div", "sb-prospect-detail-name", item.name);
    if (item.profileUrl) {
      name.href = item.profileUrl;
      name.target = "_blank";
      name.rel = "noopener noreferrer";
    }
    copy.append(name, el("div", "sb-prospect-detail-handle", item.handle ? `@${item.handle.replace(/^@+/, "")}` : "用户身份未返回"), el("div", "sb-prospect-detail-status", ownDiscovery ? record?.status || "待分析" : discoveryMatchLabel(item)));
    top.append(copy);
    container.appendChild(top);
    if (item.quote) container.appendChild(el("div", "sb-prospect-detail-note", ownDiscovery ? `互动内容：“${item.quote}”` : `原始内容：“${item.quote}”`));
    const info = el("section", "sb-prospect-detail-section");
    const title = el("div", "sb-prospect-detail-section-title");
    title.append(el("span", null, ownDiscovery ? "互动来源" : "为什么被找到"), el("span", null, ownDiscovery ? "可分析、可触达" : discoveryMatchLabel(item)));
    const list = el("dl", "sb-prospect-detail-list");
    const sourceTask = item.sourceTasks?.[0];
    const matchEvidence = item.reason || item.quote || "暂无匹配依据";
    (ownDiscovery
      ? [["来源抖音账号", item.sourceAccount ? sourceDouyinAccountName(item.sourceAccount) : "未记录来源抖音账号"], ["互动类型", item.source || "账号互动"], ["分析状态", record?.status || item.status || "待分析"], ["发现时间", item.observedAt ? formatResultTime(item.observedAt) : "—"]]
      : [["来自任务", sourceTask?.title || item.source || "其他发现结果"], ["目标人群", sourceTask?.profile || "按公开内容寻找"], ["匹配依据", matchEvidence], ["匹配程度", item.score == null ? "—" : String(item.score)], ["发现时间", item.observedAt ? formatResultTime(item.observedAt) : "—"]]
    ).forEach(([label, value]) => {
      const line = el("div", "sb-prospect-detail-item");
      line.append(el("dt", null, label), el("dd", null, value || "—"));
      list.appendChild(line);
    });
    info.append(title, list);
    container.appendChild(info);
    if (!ownDiscovery) {
      const profileInfo = el("section", "sb-prospect-detail-section");
      const profileTitle = el("div", "sb-prospect-detail-section-title");
      profileTitle.append(el("span", null, "公开账号画像"), el("span", null, "仅供分析"));
      const profileList = el("dl", "sb-prospect-detail-list");
      [["粉丝", item.followers == null ? "—" : Number(item.followers).toLocaleString("zh-CN")], ["作品", item.awemeCount == null ? "—" : Number(item.awemeCount).toLocaleString("zh-CN")], ["获赞", item.likes == null ? "—" : Number(item.likes).toLocaleString("zh-CN")], ["地域", item.location || "—"], ["直播状态", item.isLive ? "直播中" : "未直播"], ["近期开播/增长", item.growth?.newFollowers == null ? "—" : `近 ${item.growth.windowDays || "?"} 天新增粉丝 ${Number(item.growth.newFollowers).toLocaleString("zh-CN")}`]].forEach(([label, value]) => {
        const line = el("div", "sb-prospect-detail-item");
        line.append(el("dt", null, label), el("dd", null, value));
        profileList.appendChild(line);
      });
      profileInfo.append(profileTitle, profileList);
      container.appendChild(profileInfo);
    }
    const suggestion = el("div", "sb-prospect-detail-suggestion");
    suggestion.append(el("strong", null, "下一步"), el("span", null, ownDiscovery ? canDirectOutreach ? "该用户来自已授权账号且尚未触达，可以直接交给潜客触达专员。" : record?.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH ? "该用户已进入自动触达流程，请在自动流程中查看进展。" : isManualOutreachReady(record) ? "客户分析员已完成判断，确认后可以从来源抖音账号发起私信触达。" : "先完成互动用户分析，再决定是否进入触达。" : "先核对公开画像和匹配依据；确认值得进一步了解时，再进行账号分析。"));
    container.appendChild(suggestion);
    const actions = el("div", "sb-prospect-detail-actions");
    const analyze = el("button", "primary", ownDiscovery ? isAwaitingIntentAnalysis(record || item) ? "分析互动用户" : "分析这个用户" : "分析这个账号"); analyze.type = "button";
    const sourceRun = sourceRunForDiscovered(item);
    analyze.addEventListener("click", () => ownDiscovery
      ? openDiscoveredPeopleAnalysis([item])
      : openAccountAnalysis({ run: sourceRun || {}, items: [item.accountData || item] }));
    actions.appendChild(analyze);
    if (ownDiscovery) {
      const outreach = el("button", null, record?.status === "已触达" ? "开启私信承接" : canDirectOutreach ? "开始触达" : "自动触达中");
      outreach.type = "button";
      outreach.disabled = !record || (!canDirectOutreach && record.status !== "已触达");
      outreach.addEventListener("click", () => record?.status === "已触达" ? openInboxFromProspects([record]) : openDiscoveredOutreach([item]));
      actions.appendChild(outreach);
    } else if (sourceRun) {
      const sourceResult = el("button", null, "查看这次任务"); sourceResult.type = "button";
      sourceResult.addEventListener("click", () => { state.surface = "work"; state.standaloneDiscovery = false; state.resultType = "抖音找人"; state.search = ""; state.selectedResultId = resultId(sourceRun); render(); });
      actions.appendChild(sourceResult);
    }
    container.appendChild(actions);
  }

  function renderDetail(container) {
    const item = selectedProspect(); if (!item) { const empty = el("div", "sb-prospect-detail-empty"); empty.append(el("strong", null, state.resultType === "线索" ? "选择一条线索" : "选择一位潜客"), el("span", null, state.resultType === "线索" ? "查看留资信息、跟进状态和下一步动作" : "查看完整画像、行为时间线和下一步动作")); container.appendChild(empty); return; }
    const sourceRun = runs.find((run) => resultId(run) === item.source?.sourceResultId || (item.source?.sourceTaskId && run.taskId === item.source.sourceTaskId));
    const analyze = el("button", null, isContactableRecord(item) ? "综合分析" : "分析这个账号"); analyze.type = "button";
    analyze.addEventListener("click", () => isContactableRecord(item)
      ? openIntentAnalysisFromProspects([item], sourceRun || {})
      : openAccountAnalysis({ items: [item], run: sourceRun || {} }));
    const sourceResult = el("button", null, sourceRun ? "查看发现依据" : "发现依据未归档"); sourceResult.type = "button"; sourceResult.disabled = !sourceRun;
    sourceResult.addEventListener("click", () => {
      if (!sourceRun) return;
      state.surface = "work";
      state.resultType = sourceRun.resultType || "全部成果";
      state.search = "";
      state.selectedResultId = resultId(sourceRun);
      render();
    });
    const sourceActions = el("div", "sb-prospect-detail-actions"); sourceActions.append(analyze, sourceResult);
    container.appendChild(sourceActions);
    const tabs = el("div", "sb-prospect-detail-tabs"); ["overview", "timeline", "actions"].forEach((tab) => { const label = { overview: "概览", timeline: "行为时间线", actions: "执行记录" }[tab]; const button = el("button", `sb-prospect-detail-tab${state.detailTab === tab ? " is-active" : ""}`, label); button.type = "button"; button.addEventListener("click", () => { state.detailTab = tab; render(); }); tabs.appendChild(button); });
    const top = el("div", "sb-prospect-detail-top"); top.append(renderPersonAvatar("sb-prospect-detail-avatar", item, item.name, { eager: true })); const copy = el("div"); copy.append(el("div", "sb-prospect-detail-name", item.name), el("div", "sb-prospect-detail-handle", item.handle), el("div", "sb-prospect-detail-status", lifecycleLabel(item))); const score = el("div", "sb-prospect-detail-score", String(item.score)); score.append(el("small", null, "意向评分")); top.append(copy, score); container.append(tabs, top);
    if (state.detailTab === "overview") {
      container.appendChild(el("div", "sb-prospect-detail-note", item.profile)); const info = el("section", "sb-prospect-detail-section"); const infoTitle = el("div", "sb-prospect-detail-section-title"); const intentPending = item.tier === "unknown" || !item.intent; infoTitle.append(el("span", null, state.resultType === "线索" ? "留资信息" : "分析结果"), el("span", null, state.resultType === "线索" ? item.status === "已留资" ? "已进入线索中心" : "已确认转化" : intentPending ? "待分析" : item.intent?.source === "model" ? "大模型" : "规则判断")); const list = el("dl", "sb-prospect-detail-list"); [["分析等级", intentPending ? "待分析" : tierLabel(item.tier)], ["分析说明", intentPending ? "尚未完成综合分析" : item.reason], ["来源", sourceText(item)], ["来源作品", item.source?.videoTitle || item.source?.videoId || "—"], ["来源任务", item.source?.taskId || "—"], ["执行 Agent", item.owner], ["跟进状态", item.status || "待触达"], ["转化状态", item.conversionStatus || "未转化"], ["转化时间", item.convertedAt ? formatResultTime(item.convertedAt) : "—"], ...(item.conversionNote ? [["转化说明", item.conversionNote]] : []), ["联系人状态", item.contactStatus || "未保存"], ...(item.contact ? [["留资信息", formatContact(item.contact) || "已留资，信息待补充"]] : []), ["最近活跃", item.lastSeen]].forEach(([label, value]) => { const line = el("div", "sb-prospect-detail-item"); line.append(el("dt", null, label), el("dd", null, value)); list.appendChild(line); }); info.append(infoTitle, list); container.appendChild(info);
      const evidence = item.evidence?.[0]; if (evidence?.quote) { const evidenceBox = el("div", "sb-prospect-detail-note"); evidenceBox.append(el("strong", null, "原始评论证据"), document.createTextNode(`“${evidence.quote}”`)); container.appendChild(evidenceBox); }
      const captureEvidence = item.leadCaptureEvidence?.[item.leadCaptureEvidence.length - 1];
      if (captureEvidence) {
        const captureBox = el("div", "sb-prospect-detail-note");
        const fields = (captureEvidence.detectedFields || []).map(leadCaptureFieldLabel).join("、") || "联系方式";
        const account = captureEvidence.sourceAccount?.name || item.source?.captureAccountName || "当前授权账号";
        captureBox.append(
          el("strong", null, "留资依据"),
          document.createTextNode(captureEvidence.quote ? `“${captureEvidence.quote}”` : "已识别联系方式，原始私信未返回。"),
          el("div", null, `${fields} · 来源账号：${account} · ${captureEvidence.observedAt ? formatResultTime(captureEvidence.observedAt) : "时间未返回"}`)
        );
        container.appendChild(captureBox);
      }
      const tagSection = el("section", "sb-prospect-detail-section"); const tagTitle = el("div", "sb-prospect-detail-section-title"); tagTitle.append(el("span", null, "用户标签"), el("span", null, `${item.tags.length} 个`)); const tags = el("div", "sb-prospect-detail-tags"); item.tags.forEach((tag) => { const chip = el("span", "sb-prospect-detail-tag", null); chip.append(document.createTextNode(tag)); const remove = el("button", null, "×"); remove.type = "button"; remove.setAttribute("aria-label", `移除${tag}`); remove.addEventListener("click", () => { item.tags = item.tags.filter((value) => value !== tag); render(); }); chip.appendChild(remove); tags.appendChild(chip); }); tagSection.append(tagTitle, tags); container.appendChild(tagSection);
      const suggestion = el("div", "sb-prospect-detail-suggestion"); suggestion.append(el("strong", null, state.resultType === "线索" ? "线索提示" : "后续建议"), el("span", null, state.resultType === "线索" ? item.status === "已留资" ? "这条记录已完成留资，后续重点是人工跟进、推进成交、交付或复购。" : "这条记录已确认转化，后续重点是推进成交、交付或复购。" : item.status === "未回复" || item.status === "高意向需二次触达" ? "换一个活跃时间窗口进行二次触达，并沿用当前用户画像。" : item.status === "已归档" ? "暂不继续触达，保留行为证据，后续可重新激活。" : "先生成个性化首触方案；触达并确认留资后，记录会进入线索中心。")); container.appendChild(suggestion);
      const contactActions = el("div", "sb-prospect-detail-actions"); const save = el("button", item.saved ? "" : "primary", item.saved ? "已在我的联系人" : "保存到我的联系人"); save.type = "button"; save.disabled = Boolean(item.saved); save.addEventListener("click", () => { prospectStore.saveToContacts([item.id]); showToast(`${item.name} 已保存到我的联系人`); }); contactActions.appendChild(save);
      if (!appendHumanLeadActions(contactActions, item)) {
        if (isConverted(item)) {
          const converted = el("button", "", "已进入客户资产"); converted.type = "button"; converted.disabled = true; contactActions.appendChild(converted);
        } else {
        const convert = el("button", "primary", "确认已转化"); convert.type = "button"; convert.addEventListener("click", () => { prospectStore.markConverted([item.id], { note: "已通过触达确认进入客户资产", source: "manual" }); showToast(`${item.name} 已进入客户资产`); }); contactActions.appendChild(convert);
        }
      }
      container.appendChild(contactActions);
    } else if (state.detailTab === "timeline") {
      const section = el("section", "sb-prospect-detail-section"); const title = el("div", "sb-prospect-detail-section-title"); title.append(el("span", null, "行为时间线"), el("span", null, "挖掘 / 分析 / 触达")); const timeline = el("div", "sb-prospect-timeline"); item.timeline.forEach(([time, text, type]) => { const line = el("div", "sb-prospect-timeline-item"); line.append(el("i"), el("span", null, text), el("span", "sb-prospect-timeline-stage", timelineStage(type)), el("time", null, time)); timeline.appendChild(line); }); section.append(title, timeline); container.appendChild(section); container.appendChild(el("div", "sb-prospect-detail-note", "AI 已将最近行为汇总为：明确需求、持续关注、尚未完成决策。建议在下一个活跃时间窗口进行二次触达。"));
    } else {
      const section = el("section", "sb-prospect-detail-section"); const title = el("div", "sb-prospect-detail-section-title"); title.append(el("span", null, "AI 执行状态"), el("span", null, item.execution.status === "done" ? "已完成" : item.execution.status === "running" ? "执行中" : "待执行")); const execution = el("div", "sb-prospect-execution"); execution.append(el("i", `sb-prospect-execution-dot is-${item.execution.status}`)); const copy = el("div", "sb-prospect-execution-copy"); copy.append(el("div", "sb-prospect-execution-title", item.execution.task), el("div", "sb-prospect-execution-meta", item.execution.status === "done" ? "执行结果已写回潜客记录" : `由${item.owner}负责`)); execution.append(copy); section.append(title, execution); container.appendChild(section);
      const actions = el("div", "sb-prospect-detail-actions");
      const handoff = isManualOutreachReady(item)
        ? el("button", "primary", "开始触达")
        : item.status === "已触达"
          ? el("button", "primary", "开启私信承接")
          : el("button", null, item.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH ? "自动触达中" : item.status === "跟进中" ? "正在承接" : "查看触达记录");
      handoff.type = "button";
      handoff.disabled = !isManualOutreachReady(item) && item.status !== "已触达";
      handoff.addEventListener("click", () => isManualOutreachReady(item) ? openPrivateOutreachFromProspects([item]) : openInboxFromProspects([item]));
      const status = el("button", null, "更新跟进状态"); status.type = "button"; status.addEventListener("click", () => { const index = FOLLOWUP_STATUSES.indexOf(item.status); item.status = FOLLOWUP_STATUSES[(index + 1) % FOLLOWUP_STATUSES.length]; appendTimeline(item, `跟进状态更新为「${item.status}」`, "touch"); prospectStore.commit(records); showToast(`已更新为「${item.status}」`); render(); });
      const realtime = el("button", null, "查看实时工作"); realtime.type = "button"; realtime.addEventListener("click", openRealtimeWork); actions.append(handoff, status, realtime); container.appendChild(actions);
    }
  }

  function selectedResult() {
    return runs.find((run) => resultId(run) === state.selectedResultId) || null;
  }

  function visibleResults() {
    const query = state.search.trim().toLowerCase();
    return runs.filter((run) => {
      const matchesType = state.resultType === "全部成果" || run.resultType === state.resultType;
      const haystack = [run.title, run.summary, run.agentName, run.source, run.accountName, run.resultType].filter(Boolean).join(" ").toLowerCase();
      return matchesType && (!query || haystack.includes(query));
    });
  }

  function renderResultList(container, items) {
    if (!items.length) {
      const empty = el("div", "sb-results-empty");
      empty.append(el("strong", null, "还没有这类成果"), el("span", null, "Agent 产生业务结果后，会自动归档到这里。"));
      container.appendChild(empty);
      return;
    }
    const list = el("div", "sb-result-card-list");
    items.forEach((run) => {
      const card = el("article", `sb-result-card${resultId(run) === state.selectedResultId ? " is-selected" : ""}`);
      const copy = el("div", "sb-result-card-copy");
      const outreachItems = run.resultType === "触达记录" ? outreachResultItems(run, records) : [];
      queuePersonAvatarHydration(outreachItems);
      const firstOutreach = outreachItems[0] || null;
      const icon = firstOutreach
        ? renderPersonAvatar("sb-result-icon sb-result-person-avatar", firstOutreach, firstOutreach.targetName)
        : el("span", `sb-result-icon ${resultIconClass(run.resultType)}`, resultIcon(run.resultType));
      const senderName = firstOutreach?.senderName || "";
      const targetName = firstOutreach?.targetName || "";
      const message = firstOutreach?.message || "";
      const title = firstOutreach ? `${senderName} → ${targetName}${outreachItems.length > 1 ? ` 等 ${outreachItems.length} 人` : ""}` : run.title || "Agent 业务结果";
      const summary = firstOutreach ? `“${message}”` : run.summary || "暂无真实产出";
      copy.append(el("div", "sb-result-card-title", title), el("div", "sb-result-card-summary", summary));
      const meta = el("div", "sb-result-card-meta");
      meta.append(document.createTextNode(firstOutreach ? `${firstOutreach.triggerSource} · ${firstOutreach.receiptLabel}` : `${run.agentName || "Agent"} · ${run.source || "业务结果"}${run.accountName ? ` · ${run.accountName}` : ""}`));
      copy.appendChild(meta);
      const side = el("div", "sb-result-card-side");
      side.append(el("span", "sb-result-type", firstOutreach?.receiptLabel || run.resultType || "其他成果"), el("time", null, formatResultTime(firstOutreach?.sentAt || run.generatedAt)));
      const counts = firstOutreach ? [] : resultMetricEntries(run);
      if (!firstOutreach && counts.length) {
        const countRow = el("div", "sb-result-counts");
        counts.slice(0, 2).forEach(([label, value]) => countRow.appendChild(el("span", "sb-result-count", `${value} ${label}`)));
        side.appendChild(countRow);
      }
      card.append(icon, copy, side);
      card.addEventListener("click", () => { state.selectedResultId = resultId(run); state.selectedCommentIds.clear(); state.selectedFinderAccountIds.clear(); state.finderSelectionRunId = null; render(); });
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  function renderOutreachResultDetail(container, run) {
    const outreachItems = outreachResultItems(run, records);
    queuePersonAvatarHydration(outreachItems);
    const first = outreachItems[0] || null;
    const targetLabel = first ? `${first.targetName}${outreachItems.length > 1 ? ` 等 ${outreachItems.length} 人` : ""}` : "触达对象未记录";
    container.append(
      el("div", "sb-result-detail-kicker", "私信触达专员 · 真实触达记录"),
      el("div", "sb-result-detail-title", `${first?.senderName || "历史发送账号未记录"} → ${targetLabel}`),
      el("div", "sb-result-detail-summary", first ? `${first.receiptLabel} · ${formatResultTime(first.sentAt || run.generatedAt)}` : "这条历史记录没有保存目标明细。")
    );
    if (!outreachItems.length) return;

    outreachItems.forEach((item) => {
      const relation = el("div", "sb-outreach-relation");
      const sender = el("div", "sb-outreach-party");
      const senderMain = el("div", "sb-outreach-party-main");
      senderMain.append(renderPersonAvatar("sb-outreach-avatar", { avatar: item.senderAvatar }, item.senderName), el("strong", null, item.senderName));
      sender.append(el("span", null, "发送账号"), senderMain);
      const target = el("div", "sb-outreach-party");
      const targetMain = el("div", "sb-outreach-party-main");
      targetMain.append(renderPersonAvatar("sb-outreach-avatar", item, item.targetName), el("strong", null, item.handle ? `${item.targetName} · @${item.handle.replace(/^@+/, "")}` : item.targetName));
      target.append(el("span", null, "触达对象"), targetMain);
      relation.append(sender, el("div", "sb-outreach-arrow", "→"), target);
      container.appendChild(relation);

      const messageSection = el("section", "sb-result-detail-section");
      const messageTitle = el("div", "sb-result-detail-section-title");
      messageTitle.append(document.createTextNode("发送内容"), el("span", null, item.message === "历史记录未保存发送内容" ? "历史数据缺失" : "实际发送内容"));
      messageSection.append(messageTitle, el("div", "sb-outreach-message", item.message));
      container.appendChild(messageSection);

      const targetSection = el("section", "sb-result-detail-section");
      const targetTitle = el("div", "sb-result-detail-section-title");
      targetTitle.append(document.createTextNode("目标画像"), el("span", null, item.handle || item.secUid || "公开身份未完整记录"));
      const targetCard = el("div", "sb-outreach-target");
      const targetHead = el("div", "sb-outreach-target-head");
      const identity = el("div", "sb-outreach-target-identity");
      const identityCopy = el("div");
      identityCopy.append(el("strong", null, item.targetName), el("span", null, item.handle ? `@${item.handle.replace(/^@+/, "")}` : item.secUid || "抖音身份未记录"));
      identity.append(renderPersonAvatar("sb-outreach-avatar", item, item.targetName), identityCopy);
      const receipt = el("span", `sb-outreach-receipt${item.receiptStatus === "pending" ? " is-pending" : item.receiptStatus === "failed" ? " is-failed" : ""}`, item.receiptLabel);
      targetHead.append(identity, receipt);
      const facts = el("div", "sb-outreach-facts");
      [
        ["账号画像", item.profileSummary || item.profile?.summary || item.profile?.description || "历史记录未保存画像摘要"],
        ["粉丝规模", item.profile?.followerCount ?? item.profile?.follower_count ?? "未记录"],
        ["地区", item.profile?.location || item.profile?.province || item.profile?.city || "未记录"],
        ["意向判断", ["high", "medium", "low"].includes(item.tier) ? `${tierLabel(item.tier)}${item.score != null ? ` · ${item.score}分` : ""}` : "未进行意向判断"]
      ].forEach(([label, value]) => {
        const row = el("div", "sb-outreach-fact");
        row.append(el("span", null, label), el("span", null, String(value)));
        facts.appendChild(row);
      });
      if (item.profileUrl) {
        const row = el("div", "sb-outreach-fact");
        const link = el("a", "sb-outreach-link", "打开抖音主页");
        link.href = item.profileUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        row.append(el("span", null, "公开主页"), link);
        facts.appendChild(row);
      }
      targetCard.append(targetHead, facts);
      targetSection.append(targetTitle, targetCard);
      container.appendChild(targetSection);

      const triggerSection = el("section", "sb-result-detail-section");
      const triggerTitle = el("div", "sb-result-detail-section-title");
      triggerTitle.append(document.createTextNode("触发依据"), el("span", null, item.triggerSource));
      const triggerFacts = el("div", "sb-outreach-facts");
      [["来源", item.triggerSource], ["触发原因", item.triggerReason], ...(item.quote ? [["用户原话", `“${item.quote}”`]] : [])].forEach(([label, value]) => {
        const row = el("div", "sb-outreach-fact");
        row.append(el("span", null, label), el("span", null, value));
        triggerFacts.appendChild(row);
      });
      const evidence = el("div", "sb-outreach-evidence");
      item.signals.forEach((signal) => evidence.appendChild(el("span", null, String(signal))));
      item.evidence.forEach((entry) => evidence.appendChild(el("span", null, typeof entry === "string" ? entry : resultEntryTitle(entry))));
      triggerSection.append(triggerTitle, triggerFacts);
      if (evidence.childNodes.length) triggerSection.appendChild(evidence);
      container.appendChild(triggerSection);

      const receiptSection = el("section", "sb-result-detail-section");
      const receiptTitle = el("div", "sb-result-detail-section-title");
      receiptTitle.append(document.createTextNode("真实回执"), el("span", null, item.receiptLabel));
      const receiptFacts = el("div", "sb-outreach-facts");
      [["状态", item.receiptLabel], ["时间", formatResultTime(item.sentAt || run.generatedAt)], ...(item.error ? [["异常", item.error]] : [])].forEach(([label, value]) => {
        const row = el("div", "sb-outreach-fact");
        row.append(el("span", null, label), el("span", null, value));
        receiptFacts.appendChild(row);
      });
      receiptSection.append(receiptTitle, receiptFacts);
      container.appendChild(receiptSection);
    });

    const actions = el("div", "sb-result-detail-actions");
    const conversation = el("button", null, "打开 Agent 对话");
    conversation.type = "button";
    conversation.disabled = !(run.agentId && run.taskId);
    conversation.addEventListener("click", () => openAgentConversation(run));
    actions.appendChild(conversation);
    container.appendChild(actions);
  }

  function renderUserResearchResultDetail(container, run) {
    const survey = run.survey && typeof run.survey === "object" ? run.survey : {};
    const items = outreachResultItems(run, records);
    queuePersonAvatarHydration(items);
    const counts = run.counts && typeof run.counts === "object" ? run.counts : {};
    const audienceGoal = textValue(survey.audienceGoal, run.inputs?.goal, run.query, "目标人群未记录");
    const questionnaireUrl = textValue(survey.url, run.inputs?.questionnaireUrl);
    const invitation = textValue(survey.invitation, run.message, run.inputs?.message, "问卷邀请内容未记录");
    const senderName = textValue(run.accountName, run.sender?.accountName, "尚未选择发送账号");
    const sent = Number(counts.sent || 0);
    const failed = Number(counts.failed || 0);
    const unknown = Number(counts.unknown || 0);
    const selected = Number(counts.selected ?? items.length ?? 0);

    container.append(
      el("div", "sb-result-detail-kicker", "用户调研专家 · 找人、分析与问卷触达"),
      el("div", "sb-result-detail-title", run.title || `${audienceGoal} · 用户调研`),
      el("div", "sb-result-detail-summary", run.summary || "调研任务的候选人群、匹配依据和发送回执已归档。")
    );

    const briefSection = el("section", "sb-result-detail-section");
    const briefTitle = el("div", "sb-result-detail-section-title");
    briefTitle.append(document.createTextNode("调研任务"), el("span", null, senderName));
    const brief = el("div", "sb-research-brief");
    const rows = [
      ["目标人群", audienceGoal],
      ["发送账号", senderName]
    ];
    rows.forEach(([label, value]) => {
      const row = el("div", "sb-research-brief-row");
      row.append(el("span", null, label), el("span", null, value));
      brief.appendChild(row);
    });
    if (questionnaireUrl) {
      const row = el("div", "sb-research-brief-row");
      const link = el("a", "sb-outreach-link", questionnaireUrl);
      link.href = questionnaireUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      row.append(el("span", null, "问卷链接"), link);
      brief.appendChild(row);
    }
    briefSection.append(briefTitle, brief, el("div", "sb-research-invitation", invitation));
    container.appendChild(briefSection);

    const metricsSection = el("section", "sb-result-detail-section");
    const metricsTitle = el("div", "sb-result-detail-section-title");
    metricsTitle.append(document.createTextNode("投放结果"), el("span", null, `${selected} 位已选择`));
    const metrics = el("div", "sb-result-detail-metrics");
    [
      [counts.discovered ?? 0, "搜索候选"],
      [counts.matched ?? items.length, "匹配用户"],
      [sent, "发送成功"],
      [failed + unknown, unknown ? `异常或待回执 ${failed + unknown}` : "发送失败"]
    ].forEach(([value, label]) => {
      const metric = el("div", "sb-result-detail-metric");
      metric.append(el("strong", null, String(value)), el("span", null, label));
      metrics.appendChild(metric);
    });
    metricsSection.append(metricsTitle, metrics);
    container.appendChild(metricsSection);

    const targetSection = el("section", "sb-result-detail-section");
    const targetTitle = el("div", "sb-result-detail-section-title");
    targetTitle.append(document.createTextNode("受访者与匹配依据"), el("span", null, `${items.length} 位有明细`));
    const list = el("div", "sb-research-targets");
    if (!items.length) list.appendChild(el("div", "sb-result-detail-summary", "本次没有保存可展示的候选用户明细。"));
    items.forEach((item, index) => {
      const raw = Array.isArray(run.items) ? run.items[index] || {} : {};
      const reason = textValue(item.triggerReason, Array.isArray(raw.reasons) ? raw.reasons.join("；") : raw.reason, "匹配依据未记录");
      const statusClass = item.receiptStatus === "sent" ? " is-sent" : item.receiptStatus === "failed" ? " is-failed" : " is-pending";
      const statusLabel = item.receiptLabel === "回执未记录" ? "已匹配，尚未发送" : item.receiptLabel;
      const card = el("article", "sb-research-target");
      const head = el("div", "sb-research-target-head");
      const copy = el("div", "sb-research-target-copy");
      copy.append(el("strong", null, item.handle ? `${item.targetName} · @${item.handle}` : item.targetName), el("span", null, reason));
      head.append(renderPersonAvatar("sb-research-target-avatar", item, item.targetName), copy, el("span", "sb-research-target-score", item.score == null ? "—" : String(item.score)));
      card.append(head, el("span", `sb-research-target-status${statusClass}`, statusLabel));
      if (item.profileUrl) {
        const link = el("a", "sb-outreach-link", "查看公开主页");
        link.href = item.profileUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.appendChild(link);
      }
      list.appendChild(card);
    });
    targetSection.append(targetTitle, list);
    container.appendChild(targetSection);

    const actions = el("div", "sb-result-detail-actions");
    const conversation = el("button", null, "打开 Agent 对话");
    conversation.type = "button";
    conversation.disabled = !(run.agentId && run.taskId);
    conversation.addEventListener("click", () => openAgentConversation(run));
    const realtime = el("button", "primary", "查看实时工作");
    realtime.type = "button";
    realtime.disabled = !(run.agentId && run.taskId);
    realtime.addEventListener("click", () => openRealtimeWork(run));
    actions.append(conversation, realtime);
    container.appendChild(actions);
  }

  function renderResultDetail(container) {
    const run = selectedResult();
    if (!run) {
      const empty = el("div", "sb-prospect-detail-empty");
      empty.append(el("strong", null, "选择一项成果"), el("span", null, "查看 Agent 的交付内容、处理指标和下一步动作"));
      container.appendChild(empty);
      return;
    }
    if (run.agentId === "mkt-research-expert") {
      const analysisRun = run;
      const sourceLinks = analysisRun.links || analysisRun.resultSnapshot?.links || {};
      const sourceFinderRun = sourceFinderRunForAnalysis(runs, analysisRun);
      const analysisAccounts = run.accounts || run.resultSnapshot?.accounts || run.items || [];
      container.append(el("h3", null, analysisRun.title || "抖音账号分析报告"), el("p", null, analysisRun.summary || ""));
      const sourceTaskTitle = sourceLinks.sourceTaskTitle || (sourceFinderRun ? discoveryTaskTitle(sourceFinderRun) : "");
      const sourceTaskGoal = sourceLinks.sourceTaskGoal || sourceFinderRun?.inputs?.goal || sourceFinderRun?.resultSnapshot?.inputs?.goal || "";
      if (sourceTaskTitle || sourceTaskGoal) {
        const source = el("section", "sb-result-detail-section");
        const sourceTitle = el("div", "sb-result-detail-section-title");
        sourceTitle.append(el("span", null, "这份分析从哪里来"), el("span", null, "公开资料"));
        const sourceList = el("dl", "sb-prospect-detail-list");
        [["来源任务", sourceTaskTitle || "直接输入账号主页"], ...(sourceTaskGoal && sourceTaskGoal !== sourceTaskTitle ? [["找人目的", sourceTaskGoal]] : []), ["使用边界", "只读取公开主页和作品，用于查看与分析，不执行触达"]].forEach(([label, value]) => {
          const line = el("div", "sb-prospect-detail-item");
          line.append(el("dt", null, label), el("dd", null, value));
          sourceList.appendChild(line);
        });
        source.append(sourceTitle, sourceList);
        container.appendChild(source);
      }
      renderAccountAnalysisOverview(container, analysisAccounts, { goal: sourceTaskGoal || analysisRun.inputs?.goal || "", summary: analysisRun.summary || "" });
      renderAccountAnalysisReports(container, analysisAccounts);
      const actions = el("div", "sb-result-detail-actions");
      const reportFile = [...(Array.isArray(analysisRun.artifacts) ? analysisRun.artifacts : []), ...(Array.isArray(analysisRun.resultSnapshot?.artifacts) ? analysisRun.resultSnapshot.artifacts : [])].find((artifact) => artifact?.id && ["doc", "html"].includes(artifact?.type));
      if (reportFile) {
        const file = el("button", null, "打开完整报告");
        file.type = "button";
        file.addEventListener("click", () => openFileCenter(reportFile.id, reportFile));
        actions.appendChild(file);
      }
      if (sourceFinderRun) {
        const source = el("button", null, "查看来源找人结果");
        source.type = "button";
        source.addEventListener("click", () => {
          state.surface = "work";
          state.resultType = "抖音找人";
          state.search = "";
          state.selectedResultId = resultId(sourceFinderRun);
          render();
        });
        actions.appendChild(source);
      }
      const realtime = el("button", "primary", "查看实时工作");
      realtime.type = "button";
      realtime.disabled = !(analysisRun.agentId && analysisRun.taskId);
      realtime.addEventListener("click", () => openRealtimeWork(analysisRun));
      actions.appendChild(realtime);
      container.appendChild(actions);
      return;
    }
    if (run.resultType !== "抖音找人" && buildAccountAnalysisResumeFlow({ run }).analysisAccounts.length) {
      const analyze = el("button", null, "分析这些账号"); analyze.type = "button";
      analyze.addEventListener("click", () => openAccountAnalysis({ run }));
      container.appendChild(analyze);
    }
    if (run.resultType === "触达记录") {
      renderOutreachResultDetail(container, run);
      return;
    }
    if (run.resultType === "用户调研") {
      renderUserResearchResultDetail(container, run);
      return;
    }
    if (run.resultType === "抖音找人") {
      container.append(el("div", "sb-result-detail-kicker", "抖音找人专家 · 账号清单"), el("div", "sb-result-detail-title", run.title || "抖音找人结果"), el("div", "sb-result-detail-summary", run.summary || "候选账号、公开资料和匹配依据已归档。"));
      renderDouyinFinderResultDetail(container, run);
      const actions = el("div", "sb-result-detail-actions");
      const conversation = el("button", null, "打开 Agent 对话"); conversation.type = "button"; conversation.disabled = !(run.agentId && run.taskId); conversation.addEventListener("click", () => openAgentConversation(run));
      const next = el("button", "primary", "调整条件再找");
      next.type = "button";
      next.addEventListener("click", () => globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({
        initialAgentId: run.agentId || "mkt-douyin-finder",
        resumeFlow: {
          agentId: run.agentId || "mkt-douyin-finder",
          step: "setup",
          finderGoal: run.inputs?.goal || "",
          taskChoices: run.inputs?.choices || run.resultSnapshot?.inputs?.choices || {},
          finderIndustry: run.inputs?.industry || "",
          finderMode: run.inputs?.mode || "full",
          finderResultLimit: run.inputs?.resultLimit || 10,
          finderInputs: run.inputs?.optionalSeeds || ""
        }
      })));
      actions.append(conversation, next); container.appendChild(actions);
      return;
    }
    container.append(el("div", "sb-result-detail-kicker", `${run.agentName || "Agent"} · ${run.resultType || "其他成果"}`), el("div", "sb-result-detail-title", run.title || "Agent 业务结果"), el("div", "sb-result-detail-summary", run.summary || "暂无真实产出"));
    const info = el("section", "sb-result-detail-section");
    const infoTitle = el("div", "sb-result-detail-section-title");
    infoTitle.append(el("span", null, "结果来源"), el("span", null, run.resultType || "业务成果"));
    const list = el("dl", "sb-prospect-detail-list");
    [["执行 Agent", run.agentName || "—"], ["来源", run.source || "—"], ["处理范围", run.window || "—"], ["生成时间", formatResultTime(run.generatedAt)], ...(run.accountName ? [["来源账号", run.accountName]] : []), ...(run.touchStatus ? [["触达状态", run.touchStatus]] : []), ...(run.links?.sourceWorkUrl ? [["来源工作", run.links.sourceWorkUrl]] : []), ...(run.links?.commentUrl ? [["来源评论", run.links.commentUrl]] : [])].forEach(([label, value]) => {
      const line = el("div", "sb-prospect-detail-item");
      const detailValue = el("dd", null); if ((label === "来源工作" || label === "来源评论") && /^(https?:\/\/|\/)/i.test(String(value))) { const link = el("a", null, String(value)); link.href = String(value); link.target = "_blank"; link.rel = "noopener noreferrer"; detailValue.appendChild(link); } else detailValue.appendChild(document.createTextNode(String(value))); line.append(el("dt", null, label), detailValue);
      list.appendChild(line);
    });
    info.append(infoTitle, list);
    container.appendChild(info);

    const metrics = resultMetricEntries(run);
    if (metrics.length) {
      const section = el("section", "sb-result-detail-section");
      const title = el("div", "sb-result-detail-section-title");
      title.append(el("span", null, "处理结果"), el("span", null, `${metrics.length} 项指标`));
      const grid = el("div", "sb-result-detail-metrics");
      metrics.forEach(([label, value]) => { const metric = el("div", "sb-result-detail-metric"); metric.append(el("strong", null, String(value)), el("span", null, label)); grid.appendChild(metric); });
      section.append(title, grid);
      container.appendChild(section);
    }

    if (run.resultType === "评论筛选" || run.analysis?.mode === "filter") {
      const comments = commentResultItems(run);
      queuePersonAvatarHydration(comments.map((comment) => ({ ...comment, taskId: run.taskId })));
      const section = el("section", "sb-result-detail-section");
      const title = el("div", "sb-result-detail-section-title");
      const matchedCount = Number(run.counts?.matched ?? comments.length);
      title.append(el("span", null, "匹配评论"), el("span", null, `${matchedCount} 条`));
      const selectableComments = comments.filter(commentCanBeContacted);
      const selectedComments = comments.filter((comment) => state.selectedCommentIds.has(comment.id));
      const outreachToolbar = el("div", "sb-result-outreach-toolbar");
      const selectAll = el("button", null, selectedComments.length === selectableComments.length && selectableComments.length ? "取消全选" : "全选可触达");
      selectAll.type = "button";
      selectAll.disabled = !selectableComments.length;
      selectAll.addEventListener("click", () => {
        if (selectedComments.length === selectableComments.length) state.selectedCommentIds.clear();
        else selectableComments.forEach((comment) => state.selectedCommentIds.add(comment.id));
        render();
      });
      const outreach = el("button", "primary", "私信触达");
      outreach.type = "button";
      outreach.disabled = !selectedComments.length;
      outreach.addEventListener("click", () => openPrivateOutreachFromResult(run, selectedComments));
      outreachToolbar.append(el("strong", null, `${selectedComments.length} 个用户已选`), el("span", null, "选择高意向用户后，交给私信触达专员继续处理"), selectAll, outreach);
      const list = el("div", "sb-result-comment-list");
      if (!comments.length) list.appendChild(el("div", "sb-result-detail-summary", "本次没有匹配评论。"));
      comments.slice(0, 50).forEach((comment) => {
        const canContact = commentCanBeContacted(comment);
        const item = el("article", `sb-result-comment${state.selectedCommentIds.has(comment.id) ? " is-selected" : ""}`);
        const head = el("div", "sb-result-comment-head");
        const checkbox = el("input", "sb-result-comment-check");
        checkbox.type = "checkbox";
        checkbox.checked = state.selectedCommentIds.has(comment.id);
        checkbox.disabled = !canContact;
        checkbox.title = canContact ? "选择后进行私信触达" : "缺少主页链接或用户身份，无法触达";
        checkbox.setAttribute("aria-label", `选择${comment.name}`);
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) state.selectedCommentIds.add(comment.id);
          else state.selectedCommentIds.delete(comment.id);
          render();
        });
        const avatar = renderPersonAvatar("sb-result-comment-avatar", comment, comment.name);
        const user = el("div", "sb-result-comment-user");
        user.append(el("strong", null, comment.name), el("span", null, comment.handle ? `@${comment.handle.replace(/^@+/, "")}` : "用户身份未返回"));
        const confidence = Number(comment.confidence);
        const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}% 置信度` : "已命中";
        head.append(checkbox, avatar, user, el("span", "sb-result-comment-confidence", confidenceLabel));
        const quote = el("div", "sb-result-comment-quote", `“${comment.quote}”`);
        const meta = el("div", "sb-result-comment-meta");
        if (comment.videoUrl) {
          const link = el("a", null, comment.videoTitle);
          link.href = comment.videoUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          meta.appendChild(link);
        } else meta.appendChild(el("span", null, comment.videoTitle));
        if (comment.observedAt) meta.appendChild(el("span", null, formatResultTime(comment.observedAt)));
        const reason = comment.reason ? el("div", "sb-result-comment-reason", `判断理由：${comment.reason}`) : null;
        const signals = el("div", "sb-result-comment-signals");
        comment.signals.slice(0, 6).forEach((signal) => signals.appendChild(el("span", "sb-result-comment-signal", String(signal))));
        item.append(head, quote, meta);
        if (reason) item.appendChild(reason);
        if (comment.signals.length) item.appendChild(signals);
        list.appendChild(item);
      });
      section.append(title, outreachToolbar, list);
      container.appendChild(section);
    }

    const artifactMap = new Map();
    [...(Array.isArray(run.artifacts) ? run.artifacts : []), ...(Array.isArray(run.resultSnapshot?.artifacts) ? run.resultSnapshot.artifacts : [])]
      .filter((artifact) => artifact && typeof artifact === "object")
      .forEach((artifact, index) => artifactMap.set(artifact.id || `${artifact.name || "artifact"}:${index}`, artifact));
    const artifacts = [...artifactMap.values()];
    if (artifacts.length) {
      const section = el("section", "sb-result-detail-section");
      const title = el("div", "sb-result-detail-section-title");
      title.append(el("span", null, "可交接文件"), el("span", null, `${artifacts.length} 项`));
      const list = el("div", "sb-result-artifacts");
      artifacts.slice(0, 6).forEach((artifact) => {
        const item = el(artifact.id ? "button" : "div", `sb-result-artifact${artifact.id ? " is-openable" : ""}`);
        if (artifact.id) {
          item.type = "button";
          item.addEventListener("click", () => openFileCenter(artifact.id, artifact));
        }
        const copy = el("div", "sb-result-artifact-copy");
        copy.append(el("strong", null, artifactLabel(artifact)), el("span", null, artifact?.summary || artifact?.status || "已归档"));
        item.append(el("i"), copy);
        list.appendChild(item);
      });
      section.append(title, list);
      container.appendChild(section);
    }

    const genericCollections = [
      ["结果明细", run.resultType === "评论筛选" ? [] : run.items],
      ["证据来源", run.evidence],
      ["判断与决策", run.decisions],
      ["后续动作", run.actions],
      ["交接信息", Array.isArray(run.handoff) ? run.handoff : Object.keys(run.handoff || {}).length ? [run.handoff] : []]
    ];
    genericCollections.forEach(([label, values]) => {
      const entries = Array.isArray(values) ? values : [];
      if (!entries.length) return;
      const section = el("section", "sb-result-detail-section");
      const title = el("div", "sb-result-detail-section-title");
      title.append(el("span", null, label), el("span", null, `${entries.length} 条`));
      const list = el("div", "sb-result-artifacts");
      entries.slice(0, 50).forEach((entry) => {
        const item = el("div", "sb-result-artifact");
        const copy = el("div", "sb-result-artifact-copy");
        copy.append(el("strong", null, resultEntryTitle(entry)), el("span", null, resultEntrySummary(entry) || "已记录"));
        item.append(el("i"), copy);
        list.appendChild(item);
      });
      section.append(title, list);
      container.appendChild(section);
    });

    const detailFields = [
      ["候选证据", run.candidateEvidence, (item) => [item.quote || item.text || item.content, item.observedAt || item.observed_at, item.reason || item.rationale, item.risk, item.sourceWorkUrl || item.source_work_url || item.commentUrl || item.comment_url]],
      ["扫描摘要", run.scanSummaries, (item) => [item.summary || item.text || item.content, item.observedAt || item.observed_at]],
      ["审批历史", run.approvalHistory, (item) => [item.status || item.decision || item.reason, item.observedAt || item.observed_at]],
      ["提交记录", run.submissions, (item) => [item.status || item.submissionId || item.id, item.observedAt || item.observed_at]],
      ["回执记录", run.receipts, (item) => [item.status || item.receiptId || item.id, item.observedAt || item.observed_at]],
      ["重试记录", run.retries, (item) => [item.status || item.reason || item.id, item.observedAt || item.observed_at]],
      ["回复记录", run.replies, (item) => [item.text || item.content || item.status, item.observedAt || item.observed_at]]
    ];
    detailFields.forEach(([label, values, describe]) => {
      const section = el("section", "sb-result-detail-section"); const title = el("div", "sb-result-detail-section-title"); const entries = Array.isArray(values) ? values : []; title.append(el("span", null, label), el("span", null, entries.length ? `${entries.length} 条` : "暂无真实产出")); const list = el("div", "sb-result-artifacts");
      if (!entries.length) list.appendChild(el("div", "sb-result-detail-summary", "暂无真实产出"));
      entries.slice(0, 20).forEach((entry) => { const [content, observedAt, rationale, risk, sourceUrl] = describe(entry || {}); const item = el("div", "sb-result-artifact"); const copy = el("div", "sb-result-artifact-copy"); copy.append(el("strong", null, content || "真实事件"), el("span", null, [observedAt ? formatResultTime(observedAt) : "观察时间未知", rationale ? `判断依据：${rationale}` : "", risk ? `风险：${risk}` : ""].filter(Boolean).join(" · "))); if (sourceUrl && /^(https?:\/\/|\/)/i.test(String(sourceUrl))) { const link = el("a", null, String(sourceUrl)); link.href = String(sourceUrl); link.target = "_blank"; link.rel = "noopener noreferrer"; copy.appendChild(link); } item.append(el("i"), copy); list.appendChild(item); });
      section.append(title, list); container.appendChild(section);
    });
    const touchStatus = run.touchStatus || run.touch_status;
    if (touchStatus) { const section = el("section", "sb-result-detail-section"); const title = el("div", "sb-result-detail-section-title"); title.append(el("span", null, "触达状态")); const state = el("div", "sb-result-detail-summary", String(touchStatus)); section.append(title, state); container.appendChild(section); }

    const actions = el("div", "sb-result-detail-actions");
    const conversation = el("button", null, "打开 Agent 对话"); conversation.type = "button"; conversation.disabled = !(run.agentId && run.taskId); conversation.addEventListener("click", () => openAgentConversation(run));
    const prospect = el("button", "primary", run.resultType === "潜客" ? "查看潜客记录" : "进入成果分类"); prospect.type = "button"; prospect.addEventListener("click", () => { state.resultType = run.resultType === "潜客" ? "潜客" : run.resultType; state.search = ""; render(); });
    actions.append(conversation, prospect); container.appendChild(actions);
  }

  function renderResultToolbar({ placeholder = "搜索成果、Agent、账号", ariaLabel = "搜索成果", inline = false } = {}) {
    const toolbar = el("div", `sb-result-toolbar${inline ? " sb-result-toolbar-inline" : ""}`);
    const search = el("input", "sb-prospect-search"); search.type = "search"; search.placeholder = placeholder; search.value = state.search; search.setAttribute("aria-label", ariaLabel); search.addEventListener("input", (event) => { state.search = event.target.value; render(); });
    toolbar.appendChild(search);
    return toolbar;
  }

  function openConsumerSurface(surface, resultType = "全部成果") {
    state.surface = surface;
    state.resultType = resultType;
    state.search = "";
    if (resultType === "发现") resetDiscoverySelection();
    if (resultType === "潜客" || resultType === "线索") {
      state.filter = "全部";
      state.detailTab = "overview";
      const pool = resultType === "线索" ? records.filter((item) => isContactableRecord(item) && isLeadCenterRecord(item)) : records.filter((item) => isContactableRecord(item) && !isLeadCenterRecord(item));
      state.selectedId = pool[0]?.id || null;
    } else if (resultType !== "发现") {
      state.selectedResultId = selectedResultIdForType(runs, resultType);
    }
    render();
  }

  function renderConsumerNavigation() {
    const nav = el("nav", "sb-consumer-nav");
    consumerNavigationItems({ records, runs }).forEach(({ surface, label, count, resultType }) => {
      const button = el("button", `sb-consumer-nav-item${state.surface === surface ? " is-active" : ""}`);
      button.type = "button";
      button.append(document.createTextNode(label));
      if (count != null) button.appendChild(el("span", "sb-consumer-nav-count", String(count)));
      button.addEventListener("click", () => openConsumerSurface(surface, resultType));
      nav.appendChild(button);
    });
    return nav;
  }

  function openPrimaryConsumerAction(action) {
    if (action.kind === "reply") return openConsumerSurface("touch", "触达记录");
    if (action.kind === "contact") return openConsumerSurface("people", "潜客");
    if (action.kind === "analyze") return globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.({ initialAgentId: "mkt-intent-analyst" }));
    if (action.kind === "lead") return openConsumerSurface("people", "线索");
    if (action.kind === "discovery") return openConsumerSurface("people", "发现");
    if (action.kind === "review") return openConsumerSurface("work", "全部成果");
    globalThis.__SALEBUDDY__?.navFrameworkReady?.then?.((framework) => framework?.openAgentSquare?.());
  }

  function renderConsumerOverview() {
    const model = buildConsumerOverviewModel({ records, runs });
    const overview = el("section", "sb-consumer-overview");
    const main = el("div", "sb-consumer-overview-main");
    main.append(el("h1", "sb-consumer-title", model.primaryAction.title), el("p", "sb-consumer-subtitle", model.primaryAction.description));

    const attention = el("section", "sb-consumer-attention");
    const attentionCopy = el("div", "sb-consumer-attention-copy");
    attentionCopy.append(el("div", "sb-consumer-attention-kicker", "下一步"), el("div", "sb-consumer-attention-title", model.primaryAction.kind === "contact" ? `先看这 ${model.primaryAction.count} 位潜客` : model.primaryAction.kind === "discovery" ? `先看这 ${model.primaryAction.count} 个发现的人` : model.primaryAction.label), el("div", "sb-consumer-attention-description", model.primaryAction.kind === "start" ? "从一个明确目标开始。" : model.primaryAction.kind === "contact" && model.primaryAction.label === "查看自动进展" ? "自动流程已经接手后续工作。" : model.primaryAction.kind === "contact" ? "确认后才会发送首轮私信。" : "Agent 已经把需要判断的内容整理好了。"));
    const primary = el("button", null, model.primaryAction.label);
    primary.type = "button";
    primary.addEventListener("click", () => openPrimaryConsumerAction(model.primaryAction));
    attention.append(attentionCopy, primary);
    main.appendChild(attention);

    const recent = el("section", "sb-consumer-section");
    const recentHead = el("div", "sb-consumer-section-head");
    recentHead.append(el("span", "sb-consumer-section-title", "最近发生"), el("span", "sb-consumer-section-meta", model.recentRuns.length ? "Agent 已经替你完成的工作" : "还没有工作记录"));
    recent.appendChild(recentHead);
    if (!model.recentRuns.length) {
      const empty = el("div", "sb-consumer-empty");
      empty.append(document.createTextNode("告诉 Agent 你想找什么客户，第一轮工作会从这里开始。"));
      const start = el("button", null, "开始找客户"); start.type = "button"; start.addEventListener("click", () => openPrimaryConsumerAction({ kind: "start" })); empty.appendChild(start); recent.appendChild(empty);
    } else {
      const list = el("div", "sb-consumer-run-list");
      model.recentRuns.forEach((run) => {
        const row = el("article", "sb-consumer-run");
        const view = el("button", null, "查看"); view.type = "button"; view.addEventListener("click", () => openConsumerSurface("work", run.resultType || "全部成果"));
        row.append(el("i"));
        const copy = el("div", "sb-consumer-run-copy");
        copy.append(el("div", "sb-consumer-run-agent", run.agentName || "Agent"), el("div", "sb-consumer-run-narrative", run.narrative));
        copy.appendChild(el("div", "sb-consumer-run-meta", `${run.resultType || "工作结果"} · ${formatResultTime(run.generatedAt)}`));
        row.append(copy, view); list.appendChild(row);
      });
      recent.appendChild(list);
    }
    main.appendChild(recent);

    const side = el("aside", "sb-consumer-side");
    side.append(el("div", "sb-consumer-side-title", "客户现在在哪一步"), el("div", "sb-consumer-side-copy", "Agent 会继续推进，但重要的决定留给你。"));
    const statuses = [
      ["待确认触达", model.counts.waitingForOutreachConfirmation, "is-gold", () => openConsumerSurface("people", "潜客")],
      ["自动触达中", model.counts.readyToContact, "is-blue", () => openConsumerSurface("people", "潜客")],
      ["等待回复", model.counts.waitingForReply, "is-gold", () => openConsumerSurface("touch", "触达记录")],
      ["已进入客户资产", model.counts.savedLeads, "", () => openConsumerSurface("people", "线索")]
    ];
    const statusList = el("div", "sb-consumer-status-list");
    statuses.forEach(([label, value, dotClass, action]) => {
      const row = el("button", "sb-consumer-status-row"); row.type = "button"; row.addEventListener("click", action);
      row.append(el("i", `sb-consumer-status-dot ${dotClass}`), el("span", "sb-consumer-status-label", label), el("strong", "sb-consumer-status-value", String(value)));
      statusList.appendChild(row);
    });
    side.appendChild(statusList);
    const secondary = el("div", "sb-consumer-secondary-actions");
    const allWork = el("button", null, "查看全部工作记录"); allWork.type = "button"; allWork.addEventListener("click", () => openConsumerSurface("work", "全部成果")); secondary.appendChild(allWork);
    side.appendChild(secondary);
    overview.append(main, side);
    return overview;
  }

  function dashboardItems(model) {
    const source = model.views[state.dashboardView]?.items || model.views.all.items;
    return source;
  }

  function dashboardTouchLabel(item) {
    if (isTouchedRecord(item)) return "触达成功";
    if (item?.status === "待触达") return "待触达";
    return item?.status || "待判断";
  }

  function dashboardField(item, ...keys) {
    for (const key of keys) {
      const path = key.split(".");
      let value = item;
      for (const segment of path) value = value?.[segment];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "—";
  }

  function openDashboardProspect(item) {
    state.dashboardDetailId = item?.id || null;
    state.selectedId = item?.id || null;
    renderDashboardTransition();
  }

  function renderDashboardTransition() {
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => render());
      return;
    }
    render();
  }

  function renderDashboardFunnel(counts) {
    const funnel = el("section", "sb-data-funnel");
    const stages = [
      { label: "获取潜客", value: counts.acquired, rateLabel: "触达率", rateValue: `${counts.touchRate}%` },
      { label: "私信触达", value: counts.touched, rateLabel: "回复率", rateValue: `${counts.replyRate}%` },
      { label: "客户回复", value: counts.replied, rateLabel: "触达留资率", rateValue: `${counts.savedRate}%` },
      { label: "完成留资", value: counts.saved }
    ];
    stages.forEach((stage) => {
      const cell = el("div", "sb-data-funnel-cell");
      cell.append(el("span", "sb-data-funnel-label", stage.label), el("strong", "sb-data-funnel-value", String(stage.value)));
      funnel.appendChild(cell);

      const bridge = el("div", `sb-data-funnel-bridge${stage.rateLabel ? "" : " is-final"}`);
      if (stage.rateLabel) {
        const copy = el("div", "sb-data-funnel-bridge-copy");
        copy.append(
          el("span", "sb-data-funnel-bridge-label", stage.rateLabel),
          el("strong", "sb-data-funnel-bridge-value", stage.rateValue)
        );
        bridge.appendChild(copy);
      }
      bridge.appendChild(el("i", "sb-data-funnel-arrow", "→"));
      funnel.appendChild(bridge);
    });

    const final = el("div", "sb-data-funnel-cell sb-data-funnel-final");
    final.append(el("span", "sb-data-funnel-label", "转化率"), el("strong", "sb-data-funnel-value", `${counts.conversionRate}%`));
    funnel.appendChild(final);
    return funnel;
  }

  function renderDashboardDetail(item) {
    const panel = el("aside", "sb-data-detail-panel");
    const head = el("div", "sb-data-detail-head");
    head.append(el("strong", null, "客户详情"), el("span", null, "不离开当前列表"));
    const close = el("button", "sb-data-detail-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭客户详情");
    close.addEventListener("click", () => { state.dashboardDetailId = null; state.selectedId = null; renderDashboardTransition(); });
    head.appendChild(close);

    const body = el("div", "sb-data-detail-body");
    const person = el("div", "sb-data-detail-person");
    person.appendChild(renderPersonAvatar("sb-data-detail-avatar", item, item.name, { eager: true }));
    const copy = el("div", "sb-data-detail-person-copy");
    copy.append(
      el("strong", "sb-data-detail-name", item.name || "匿名用户"),
      el("span", "sb-data-detail-handle", item.handle ? `@${String(item.handle).replace(/^@+/, "")}` : "账号未返回")
    );
    const statusClassName = isTouchedRecord(item) || item.status === "已留资" ? "" : "is-muted";
    copy.appendChild(el("span", `sb-data-detail-status ${statusClassName}`.trim(), dashboardTouchLabel(item)));
    person.appendChild(copy);
    if (item.score != null) {
      const score = el("strong", "sb-data-detail-score", String(item.score));
      score.appendChild(el("small", null, "意向评分"));
      person.appendChild(score);
    }
    body.appendChild(person);

    const capturedContacts = leadCaptureContactEntries(item);
    if (dashboardLeadLabel(item) === "已留资" && capturedContacts.length) {
      const captureCard = el("section", "sb-data-capture-card");
      const captureHead = el("div", "sb-data-capture-card-head");
      captureHead.append(document.createTextNode("已留资联系方式"), el("span", null, "已识别"));
      const fields = el("div", "sb-data-capture-fields");
      capturedContacts.forEach(([label, value]) => {
        const field = el("div", "sb-data-capture-field");
        field.append(el("span", null, label), el("strong", null, value));
        fields.appendChild(field);
      });
      captureCard.append(captureHead, fields);
      body.appendChild(captureCard);
    }

    const evidence = item.evidence?.find((entry) => entry?.quote || entry?.text || entry?.content)?.quote
      || item.evidence?.find((entry) => entry?.text || entry?.content)?.text
      || item.comment?.text
      || item.comment
      || item.quote;
    const evidenceSection = el("section", "sb-data-detail-section");
    const evidenceTitle = el("div", "sb-data-detail-section-title");
    evidenceTitle.append(document.createTextNode("为什么找到他"), el("span", null, sourceText(item)));
    evidenceSection.appendChild(evidenceTitle);
    evidenceSection.appendChild(el("div", "sb-data-detail-quote", evidence ? `“${evidence}”` : item.reason || "这条记录暂未保存原始内容。"));
    body.appendChild(evidenceSection);

    const captureEvidence = item.leadCaptureEvidence?.[item.leadCaptureEvidence.length - 1];
    if (captureEvidence) {
      const captureSection = el("section", "sb-data-detail-section");
      const captureTitle = el("div", "sb-data-detail-section-title");
      captureTitle.append(document.createTextNode("留资依据"), el("span", null, `来自私信 · ${item.leadCaptureEvidence.length} 条`));
      const captureQuote = captureEvidence.quote ? `“${captureEvidence.quote}”` : "已识别联系方式，原始私信未返回。";
      captureSection.appendChild(captureTitle);
      captureSection.appendChild(el("div", "sb-data-detail-quote", captureQuote));
      const captureList = el("dl", "sb-data-detail-list");
      [
        ["识别字段", (captureEvidence.detectedFields || []).map(leadCaptureFieldLabel).join("、") || "联系方式"],
        ["来源账号", captureEvidence.sourceAccount?.name || item.source?.captureAccountName || "当前授权账号"],
        ["收到时间", captureEvidence.observedAt ? formatResultTime(captureEvidence.observedAt) : "—"],
        ["消息编号", captureEvidence.messageId || "未返回"]
      ].forEach(([label, value]) => {
        const row = el("div", "sb-data-detail-item");
        row.append(el("dt", null, label), el("dd", null, value || "—"));
        captureList.appendChild(row);
      });
      captureSection.appendChild(captureList);
      body.appendChild(captureSection);
    }

    const progressSection = el("section", "sb-data-detail-section");
    const progressTitle = el("div", "sb-data-detail-section-title");
    progressTitle.append(document.createTextNode("当前进展"), el("span", null, dashboardReplyLabel(item)));
    const progressList = el("dl", "sb-data-detail-list");
    [
      ["触达状态", dashboardTouchLabel(item)],
      ["回复状态", dashboardReplyLabel(item)],
      ["留资状态", dashboardLeadLabel(item)],
      ["成交状态", item.conversionStatus || "未转化"],
      ["获客账号", dashboardAcquisitionAccount(item)],
      ["来源", sourceText(item)],
      ["来源作品", dashboardField(item, "source.videoTitle", "source.videoId", "sourceWorkTitle", "sourceWorkId")],
      ["最近活跃", formatResultTime(item.lastSeen || item.updatedAt || item.createdAt || item.observedAt)]
    ].forEach(([label, value]) => {
      const row = el("div", "sb-data-detail-item");
      row.append(el("dt", null, label), el("dd", null, value || "—"));
      progressList.appendChild(row);
    });
    progressSection.appendChild(progressTitle);
    progressSection.appendChild(progressList);
    body.appendChild(progressSection);

    const next = el("div", "sb-data-detail-next");
    const nextCopy = dashboardLeadLabel(item) === "已留资"
      ? item.conversionStatus === "已转化"
        ? "已确认转化，等待门店回传成交、交付或复购结果。"
        : item.conversionStatus === "已失效"
          ? "该机会已标记失效，保留留资和对话证据，后续可按新的需求重新激活。"
          : item.conversionStatus === "成交跟进"
            ? "人工正在推进报价、预约或成交；完成后请回写转化结果。"
            : "联系方式已进入客户资产，下一步由人工跟进试驾、报价与成交推进。"
      : item.status === PROSPECT_STATUSES.WAITING_OUTREACH_CONFIRMATION
        ? "客户分析员已完成判断，确认后可以交给私信触达专员。"
        : item.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH
          ? "这位用户已进入抖音获客管家的自动触达流程，请在自动任务中查看进展。"
        : hasReply(item)
          ? "用户已经回复，下一步是继续承接对话并确认是否留资。"
          : isTouchedRecord(item)
            ? "已经完成首次私信联系，等待用户回复；有新消息后可交给私信客服。"
            : "Agent 已保存这条记录，等待下一步业务动作。";
    next.append(el("strong", null, "下一步"), el("span", null, nextCopy));
    body.appendChild(next);

    const actions = el("div", "sb-data-detail-actions");
    if (isManualOutreachReady(item)) {
      const outreach = el("button", "primary", "开始触达");
      outreach.type = "button";
      outreach.addEventListener("click", () => openPrivateOutreachFromProspects([item]));
      actions.appendChild(outreach);
    } else if (item.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH) {
      const automatic = el("button", null, "自动触达中");
      automatic.type = "button";
      automatic.disabled = true;
      actions.appendChild(automatic);
    } else if (item.status === "已触达") {
      const inbox = el("button", "primary", "开启私信承接");
      inbox.type = "button";
      inbox.addEventListener("click", () => openInboxFromProspects([item]));
      actions.appendChild(inbox);
    }
    appendHumanLeadActions(actions, item);
    const analyze = el("button", null, "分析这个账号");
    analyze.type = "button";
    analyze.addEventListener("click", () => openAccountAnalysis({ items: [item], run: runs.find((run) => run.taskId === item.source?.taskId) || {} }));
    actions.appendChild(analyze);
    body.appendChild(actions);

    panel.append(head, body);
    return panel;
  }

  function renderDashboardRow(item) {
    const row = el("tr", `sb-data-row${item.id === state.selectedId ? " is-selected" : ""}`);
    const client = el("td");
    const person = el("div", "sb-data-person");
    const copy = el("div", "sb-data-person-copy");
    copy.append(el("strong", "sb-data-person-name", item.name || "匿名用户"), el("span", "sb-data-person-handle", item.handle ? `@${String(item.handle).replace(/^@+/, "")}` : "账号未返回"));
    person.append(renderPersonAvatar("sb-data-avatar", item, item.name), copy);
    client.appendChild(person);

    const touch = el("td"); touch.appendChild(el("span", `sb-data-status ${statusClass(item.status)}`, dashboardTouchLabel(item)));
    const reply = el("td"); reply.appendChild(el("span", `sb-data-reply ${hasReply(item) ? "is-replied" : ""}`.trim(), dashboardReplyLabel(item)));
    const lead = el("td");
    lead.appendChild(el("span", `sb-data-status ${dashboardLeadLabel(item) === "已留资" ? "" : "is-muted"}`.trim(), dashboardLeadLabel(item)));
    const contactSummary = formatContact(item.contact);
    if (dashboardLeadLabel(item) === "已留资" && contactSummary) lead.appendChild(el("span", "sb-data-contact-preview", contactSummary));
    const account = el("td", "sb-data-muted", dashboardAcquisitionAccount(item));
    const source = el("td", "sb-data-muted", sourceText(item));
    const city = el("td", "sb-data-muted", dashboardField(item, "city", "location", "profile.city", "profile.location"));
    const time = el("td", "sb-data-time", formatResultTime(item.lastSeen || item.updatedAt || item.createdAt || item.observedAt));
    const actions = el("td", "sb-data-actions");
    const action = el("button", isManualOutreachReady(item) ? "primary" : "", isManualOutreachReady(item)
      ? "开始触达"
      : item.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH ? "自动触达中" : "查看详情");
    action.type = "button";
    action.disabled = item.status === PROSPECT_STATUSES.AUTOMATIC_OUTREACH;
    action.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isManualOutreachReady(item)) openPrivateOutreachFromProspects([item]);
      else openDashboardProspect(item);
    });
    actions.appendChild(action);
    row.append(client, touch, reply, lead, account, source, city, time, actions);
    row.addEventListener("click", () => openDashboardProspect(item));
    return row;
  }

  function renderDataOverview() {
    const model = buildProspectDashboardModel({ records, runs });
    const dashboard = el("section", "sb-data-dashboard");
    dashboard.appendChild(renderDashboardFunnel(model.counts));

    const resultTabs = el("div", "sb-data-result-tabs");
    Object.entries(model.views).forEach(([key, view]) => {
      const button = el("button", `sb-data-result-tab${state.dashboardView === key ? " is-active" : ""}`);
      button.type = "button";
      button.append(document.createTextNode(view.label), el("span", "sb-data-result-count", String(view.items.length)));
      button.addEventListener("click", () => { state.dashboardView = key; state.selectedId = null; renderDashboardTransition(); });
      resultTabs.appendChild(button);
    });
    dashboard.appendChild(resultTabs);
    const items = dashboardItems(model);
    const tablePanel = el("section", "sb-data-table-panel");
    const tableHead = el("div", "sb-data-table-head");
    tableHead.append(el("strong", null, model.views[state.dashboardView]?.label || model.views.all.label), el("span", null, `${items.length} 位可见 · 共 ${model.views[state.dashboardView]?.items.length || 0} 位`));
    tablePanel.appendChild(tableHead);
    const tableWrap = el("div", "sb-data-table-wrap");
    if (!items.length) {
      tableWrap.appendChild(el("div", "sb-data-empty", "还没有这一类潜客"));
    } else {
      queuePersonAvatarHydration(items);
      const table = el("table", "sb-data-table");
      const head = el("thead");
      const headRow = el("tr");
      ["客户信息", "触达状态", "回复状态", "留资信息", "获客账号", "来源", "城市", "触达时间", "操作"].forEach((label) => headRow.appendChild(el("th", null, label)));
      head.appendChild(headRow);
      const body = el("tbody");
      items.forEach((item) => body.appendChild(renderDashboardRow(item)));
      table.append(head, body);
      tableWrap.appendChild(table);
    }
    tablePanel.appendChild(tableWrap);
    const detailItem = state.dashboardDetailId ? items.find((item) => item.id === state.dashboardDetailId) : null;
    if (!detailItem && state.dashboardDetailId) state.dashboardDetailId = null;
    const workspace = el("div", "sb-data-workspace");
    workspace.appendChild(tablePanel);
    if (detailItem) {
      workspace.classList.add("has-detail");
      workspace.appendChild(renderDashboardDetail(detailItem));
    }
    dashboard.appendChild(workspace);
    return dashboard;
  }

  function render() {
    wrap.querySelector(".sb-prospect-modal")?.remove();
    shell.textContent = "";

    const prospectCount = records.filter(isProspectRecord).length;
    const opportunityCount = records.filter((item) => isContactableRecord(item) && isLeadCenterRecord(item)).length;
    const discoverySources = discoverySourcesForPage();
    const discoveredCount = discoverySources.items.length;
    const overviewModel = buildConsumerOverviewModel({ records, runs });
    const syncNotice = renderSyncNotice();
    if (state.surface === "overview") {
      wrap.classList.add("sb-prospect-page--data");
      if (syncNotice) shell.appendChild(syncNotice);
      shell.appendChild(renderDataOverview());
      wrap.appendChild(shell);
      renderTaskComposer();
      return;
    }
    wrap.classList.remove("sb-prospect-page--data");
    const standaloneDiscovery = state.standaloneDiscovery && state.surface === "people";
    wrap.classList.toggle("sb-prospect-page--standalone-discovery", standaloneDiscovery);
    if (!standaloneDiscovery) shell.appendChild(renderConsumerNavigation());
    if (syncNotice) shell.appendChild(syncNotice);
    if (standaloneDiscovery) {
      const heading = el("header", "sb-discovery-heading");
      const headingCopy = el("div", "sb-discovery-heading-copy");
      const ownDiscovery = state.selectedDiscoveryOrigin === "own";
      headingCopy.append(el("h1", null, "找到的人"), el("p", null, "承接找客专员的结果：我的账号互动用户可继续分析和触达；公域找人按任务查看，仅用于分析。"));
      heading.append(headingCopy, el("span", `sb-discovery-heading-note${ownDiscovery ? " sb-discovery-capability is-contactable" : " sb-discovery-capability"}`, ownDiscovery ? "可分析、可触达" : "只查看与分析"));
      shell.appendChild(heading);
    }
    if (state.surface === "people" && !standaloneDiscovery && state.resultType !== "发现") state.resultType = "潜客";
    if (state.surface === "touch") state.resultType = "触达记录";
    if (state.surface === "work") {
      const tabs = el("nav", "sb-result-tabs");
      RESULT_TYPES.forEach((type) => { const count = type === "全部成果" ? runs.length : type === "发现" ? discoveredCount : type === "潜客" ? prospectCount : type === "线索" ? opportunityCount : runs.filter((run) => run.resultType === type).length; const button = el("button", `sb-result-tab${state.resultType === type ? " is-active" : ""}`); button.type = "button"; button.append(document.createTextNode(type), el("span", "sb-result-tab-count", `${count}${resultCountUnit(type)}`)); button.addEventListener("click", () => { state.resultType = type; state.search = ""; if (type === "发现") resetDiscoverySelection(); if (type === "潜客" || type === "线索") { state.filter = "全部"; state.detailTab = "overview"; const pool = type === "线索" ? records.filter((item) => isContactableRecord(item) && isLeadCenterRecord(item)) : records.filter(isProspectRecord); state.selectedId = pool[0]?.id || null; } else if (type !== "发现") state.selectedResultId = selectedResultIdForType(runs, type); render(); }); tabs.appendChild(button); });
      shell.appendChild(tabs);
    }

    const workspace = el("div", "sb-prospect-workspace");
    const listPanel = el("section", "sb-prospect-panel");
    const detailPanel = el("aside", "sb-prospect-panel");
    if (standaloneDiscovery || state.resultType === "发现") {
      const items = visibleDiscovered();
      const ownDiscovery = state.selectedDiscoveryOrigin === "own";
      const scopes = ownDiscovery ? discoverySources.accounts : discoverySources.tasks;
      const activeGroup = scopes.find((group) => group.id === state.selectedDiscoveryTaskId) || null;
      renderDiscoverySourceBrowser(listPanel, discoverySources);
      const panelHead = el("div", "sb-prospect-panel-head sb-result-panel-head");
      const panelTitle = el("div", "sb-discovery-results-title");
      const isAllDiscovery = !activeGroup || activeGroup.id === "all";
      panelTitle.append(
        el("strong", null, ownDiscovery ? (isAllDiscovery ? "我的账号互动用户" : `${sourceDouyinAccountName(activeGroup)} 的互动用户`) : (isAllDiscovery ? "公域找人结果" : activeGroup.title)),
        el("span", null, ownDiscovery
          ? `${items.length} 位 · 可分析、可触达`
          : isAllDiscovery
            ? `${items.length} 个账号 · 仅查看与分析`
            : `${items.length} 个账号${activeGroup.generatedAt ? ` · ${formatResultTime(activeGroup.generatedAt)}` : ""} · 仅查看与分析`)
      );
      const exportButton = el("button", "sb-prospect-button", "导出发现用户"); exportButton.type = "button"; exportButton.disabled = !items.length; exportButton.addEventListener("click", () => { if (!items.length) return; exportDiscoveredCsv(items); showToast(`已导出 ${items.length} 位发现用户`); });
      const panelActions = el("div", "sb-discovery-results-actions");
      panelActions.append(renderResultToolbar({ placeholder: ownDiscovery ? "搜索昵称、账号或互动内容" : "搜索昵称、账号或匹配内容", ariaLabel: "搜索找到的人", inline: true }), exportButton);
      panelHead.append(panelTitle, panelActions);
      const content = el("div", "sb-discovery-list-content"); renderDiscoveredListContent(content, items); listPanel.append(panelHead, content);
      const detailHead = el("div", "sb-prospect-panel-head"); detailHead.append(el("span", "sb-prospect-panel-title", ownDiscovery ? "互动用户详情" : "账号详情"), el("span", "sb-prospect-panel-meta", ownDiscovery ? "来源抖音账号、互动依据与触达" : "公开画像与匹配依据")); const detail = el("div", "sb-prospect-detail"); renderDiscoveredDetail(detail); detailPanel.append(detailHead, detail);
    } else if (state.resultType === "潜客" || state.resultType === "线索") {
      const opportunityView = state.resultType === "线索";
      state.filter = normalizePeopleFilter(state.resultType, state.filter);
      const items = opportunityView ? visibleOpportunities() : visibleProspects();
      if (!items.some((item) => item.id === state.selectedId)) state.selectedId = items[0]?.id || null;
      const total = opportunityView ? opportunityCount : prospectCount;
      const panelHead = el("div", "sb-prospect-panel-head");
      const panelActions = el("div", "sb-prospect-panel-actions");
      const exportButton = el("button", "sb-prospect-button", opportunityView ? "导出线索" : "导出潜客"); exportButton.type = "button"; exportButton.disabled = !items.length; exportButton.addEventListener("click", () => { if (!items.length) return; exportCsv(items, { opportunity: opportunityView }); showToast(opportunityView ? `已导出 ${items.length} 条线索` : `已导出 ${items.length} 位潜客`); });
      panelActions.append(el("span", "sb-prospect-panel-meta", `${items.length} 位可见 · 共 ${total} 位`), exportButton);
      panelHead.append(el("span", "sb-prospect-panel-title", opportunityView ? "线索中心" : "潜客列表"), panelActions);
      const toolbar = el("div", "sb-prospect-toolbar");
      (opportunityView ? LEAD_FILTERS : PROSPECT_FILTERS).forEach((label) => { const button = el("button", `sb-prospect-filter${state.filter === label ? " is-active" : ""}`, label); button.type = "button"; button.addEventListener("click", () => { state.filter = label; render(); }); toolbar.appendChild(button); });
      // Keep the list focused on lifecycle filters and operational actions.
      // Search, alternate layouts, and tag-management controls are intentionally not exposed here.
      const bulk = opportunityView ? null : renderBulkBar(); const content = el("div"); renderListContent(content, items); listPanel.append(panelHead, toolbar); if (bulk) listPanel.appendChild(bulk); listPanel.appendChild(content);
      const detailHead = el("div", "sb-prospect-panel-head"); detailHead.append(el("span", "sb-prospect-panel-title", opportunityView ? "线索详情" : "潜客详情"), el("span", "sb-prospect-panel-meta", opportunityView ? "留资记录、跟进与下一步" : "画像、时间线与执行")); const detail = el("div", "sb-prospect-detail"); renderDetail(detail); detailPanel.append(detailHead, detail);
    } else {
      const items = visibleResults();
      const outreachView = state.resultType === "触达记录";
      const panelHead = el("div", "sb-prospect-panel-head sb-result-panel-head"); panelHead.append(el("span", "sb-prospect-panel-title", outreachView ? "触达记录" : "Agent 成果"), el("span", "sb-prospect-panel-meta", `${items.length} 项可见 · 共 ${runs.length} 项业务结果`), renderResultToolbar({ inline: true }));
      const content = el("div"); renderResultList(content, items); listPanel.append(panelHead, content);
      const detailHead = el("div", "sb-prospect-panel-head"); detailHead.append(el("span", "sb-prospect-panel-title", outreachView ? "触达详情" : "成果详情"), el("span", "sb-prospect-panel-meta", outreachView ? "账号、对象、内容与触发依据" : "交付内容、指标与下一步")); const detail = el("div", "sb-prospect-detail"); renderResultDetail(detail); detailPanel.append(detailHead, detail);
    }
    workspace.append(listPanel, detailPanel); shell.appendChild(workspace); wrap.appendChild(shell); renderTaskComposer();
  }

  syncRecords();
  render();
  page.body.appendChild(wrap);
  void hydrateCanonicalResults();
  if (!mockPreview) canonicalResultsRefreshTimer = globalThis.setInterval(() => { void hydrateCanonicalResults(); }, 5000);
  const originalClose = page.close;
  page.close = () => {
    if (canonicalResultsRefreshTimer) globalThis.clearInterval(canonicalResultsRefreshTimer);
    unsubscribeStore();
    unsubscribeLiveWork();
    originalClose();
  };
  return page;
}
