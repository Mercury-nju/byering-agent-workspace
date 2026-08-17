/**
 * ui/home-sales-feed.js
 * 首页推荐区销售业务化：原生热词卡片来自线上接口（游戏/生活向，与销售业务无关），
 * 整体隐藏原生 `_hotWordsArea_`，原位注入 SaleBuddy 销售业务推荐区——
 * Shared homepage flow: industry -> digital employee -> employee task prompts.
 * 视觉沿用原生卡片语言（白卡 + 图标 + 标题 + 描述，三列网格），运行时注入，不改冻结文件。
 */
import { BRAND } from "../brand.js";
import { mountAgentAvatar } from "./agent-avatar.js";
import { openAgentSquarePage } from "./agent-square.js";
import { NAV_EVENT } from "./nav-framework.js";
import { openEarPage } from "./ear-page.js";
import { CUSTOMER_DOMAIN_LABELS } from "../business/customer-domains.js";

const BYERING_AGENT_VIDEO_URL = new URL("../../../assets/byering-agent-action-alpha.webm", import.meta.url).href;
const BYERING_WORDMARK_URL = new URL("../../../assets/byering-wordmark-transparent.png", import.meta.url).href;

const CSS = `
[class*="_hotWordsArea_"]{display:none !important}
.sb-feed{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;width:100%;margin-top:0;padding-bottom:34px}
.sb-feed-connect{position:relative;z-index:1;isolation:isolate;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:46px;padding:7px 16px 7px 20px;margin:0 0 32px;border-radius:0 0 16px 16px;background:linear-gradient(100deg,rgba(244,233,224,.64),rgba(226,240,246,.68));backdrop-filter:blur(18px) saturate(120%);-webkit-backdrop-filter:blur(18px) saturate(120%);box-shadow:inset 0 1px 0 rgba(255,255,255,.62);box-sizing:border-box}
.sb-feed-connect::before{content:"";position:absolute;left:0;right:0;top:-16px;height:16px;border-radius:16px 16px 0 0;background:linear-gradient(100deg,rgba(244,233,224,.64),rgba(226,240,246,.68));pointer-events:none;z-index:0}
.sb-feed-connect-copy{position:relative;z-index:1;display:flex;align-items:center;gap:9px;flex:1 1 260px;min-width:0;max-width:100%;padding:0;border:0;background:transparent;color:#3F434A;font:inherit;font-size:14px;text-align:left;white-space:nowrap;cursor:pointer}
.sb-feed-connect-copy:focus-visible,.sb-feed-connect-app:focus-visible{outline:2px solid rgba(45,103,214,.46);outline-offset:3px}
.sb-feed-connect-mark{width:22px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.72);font-size:14px;flex:none}
.sb-feed-connect-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-feed-connect-apps{position:relative;z-index:1;display:flex;align-items:center;gap:8px;flex:0 1 auto;max-width:100%;overflow-x:auto;scrollbar-width:none}
.sb-feed-connect-apps::-webkit-scrollbar{display:none}
.sb-feed-connect-app{position:relative;width:26px;height:26px;flex:0 0 26px;padding:0;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.48);border:1px solid rgba(255,255,255,.76);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font:inherit;font-size:10px;font-weight:700;color:#3F434A;cursor:pointer;transition:background .18s ease,transform .18s ease,box-shadow .18s ease}
.sb-feed-connect-app:hover{background:rgba(255,255,255,.78);transform:translateY(-1px);box-shadow:0 5px 12px rgba(32,40,48,.08)}
.sb-feed-connect-app[data-connected="true"]{box-shadow:inset 0 0 0 2px rgba(46,158,107,.22)}
.sb-feed-connect-app[data-connected="true"]::after{content:"";position:absolute;right:3px;bottom:3px;width:6px;height:6px;border:2px solid rgba(255,255,255,.92);border-radius:50%;background:#2e9e6b}
.sb-feed-connect-app-mark{width:21px;height:21px;border-radius:6px;display:block;object-fit:contain;background:#fff}
.sb-connector-modal{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;padding:36px;background:rgba(22,26,31,.62);backdrop-filter:blur(10px) saturate(82%);-webkit-backdrop-filter:blur(10px) saturate(82%);color:#1F2329;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;animation:sb-connector-fade .18s ease-out}
@keyframes sb-connector-fade{from{opacity:0}to{opacity:1}}
.sb-connector-dialog{width:min(1260px,calc(100vw - 72px));height:min(860px,calc(100vh - 72px));max-height:calc(100vh - 72px);display:flex;overflow:hidden;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(10,14,18,.28);animation:sb-connector-dialog-in .2s ease-out}
@keyframes sb-connector-dialog-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
.sb-connector-sidebar{width:320px;flex:none;padding:34px 28px;background:#F1F1F1;box-sizing:border-box}
.sb-connector-sidebar-title{margin:0 0 34px;color:#1F2329;font-size:24px;font-weight:650;line-height:32px}
.sb-connector-sidebar-nav{display:flex;flex-direction:column;gap:7px}
.sb-connector-sidebar-item{display:flex;align-items:center;gap:14px;width:100%;height:52px;padding:0 20px;border:0;border-radius:28px;background:transparent;color:#666B73;font:inherit;font-size:16px;text-align:left;cursor:pointer}
.sb-connector-sidebar-item:hover{background:rgba(255,255,255,.58);color:#1F2329}
.sb-connector-sidebar-item[data-active="true"]{background:#fff;color:#1F2329;font-weight:650}
.sb-connector-sidebar-icon{width:22px;display:inline-flex;align-items:center;justify-content:center;color:currentColor;font-size:21px;line-height:1}
.sb-connector-sidebar-icon svg{width:20px;height:20px;display:block}
.sb-connector-content{position:relative;flex:1;min-width:0;overflow-y:auto;padding:28px 40px 36px;background:#fff;box-sizing:border-box}
.sb-connector-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}
.sb-connector-heading{flex:1;min-width:0}
.sb-connector-title{margin:0;color:#1F2329;font-size:23px;font-weight:650;line-height:30px}
.sb-connector-subtitle{margin:4px 0 0;color:#92969D;font-size:14px;line-height:20px}
.sb-connector-close{position:absolute;top:26px;right:24px;width:38px;height:38px;border:0;background:transparent;color:#1F2329;font-size:34px;font-weight:300;line-height:1;cursor:pointer}
.sb-connector-close:hover{color:#6F747D}
.sb-connector-custom{display:inline-flex;align-items:center;gap:9px;height:46px;padding:0 21px;border:0;border-radius:24px;background:#1F1F1F;color:#fff;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}
.sb-connector-custom:hover{background:#383838}
.sb-connector-custom-icon{font-size:24px;font-weight:300;line-height:1}
.sb-connector-search{display:flex;align-items:center;gap:10px;height:56px;margin:18px 12px 32px;padding:0 20px;border-radius:16px;background:#F7F7F7;box-sizing:border-box}
.sb-connector-search-icon{color:#7B8087;font-size:28px;font-weight:300;line-height:1}
.sb-connector-search-input{width:100%;border:0;outline:0;background:transparent;color:#1F2329;font:inherit;font-size:17px}
.sb-connector-search-input::placeholder{color:#94989E}
.sb-connector-section-title{margin:0 0 14px 12px;color:#888D95;font-size:15px;font-weight:650;line-height:22px}
.sb-connector-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0 12px}
.sb-connector-card{display:flex;align-items:flex-start;gap:12px;min-width:0;min-height:136px;padding:16px 16px 14px;border:0;border-radius:16px;background:#F8F8F8;text-align:left;box-sizing:border-box;transition:background .18s ease,box-shadow .18s ease,transform .18s ease}
.sb-connector-card:hover{background:#fff;box-shadow:0 10px 28px rgba(32,40,48,.08);transform:translateY(-1px)}
.sb-connector-card-logo{width:46px;height:46px;flex:none;border-radius:11px;display:block;object-fit:contain;background:#fff;padding:5px;box-sizing:border-box}.sb-connector-card-custom-logo{display:grid;place-items:center;padding:0;background:#1F2329;color:#fff;font-size:18px;font-weight:650}
.sb-connector-card-body{flex:1;min-width:0}
.sb-connector-card-top{display:flex;align-items:center;gap:8px;min-width:0}
.sb-connector-card-name{min-width:0;color:#1F2329;font-size:16px;font-weight:650;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-connector-card-category{flex:none;color:#8A8F99;font-size:12px;line-height:18px}
.sb-connector-card-desc{display:block;margin-top:6px;color:#777C84;font-size:14px;line-height:20px}
.sb-connector-card-plus{width:40px;height:40px;flex:none;border:1px solid rgba(15,15,15,.08);border-radius:12px;background:#fff;color:#1F2329;font:inherit;font-size:26px;font-weight:300;line-height:1;cursor:pointer;transition:background .15s ease,color .15s ease}
.sb-connector-card-plus:hover{background:#1F2329;color:#fff}
.sb-connector-card-plus[data-connected="true"]{background:rgba(46,158,107,.1);border-color:rgba(46,158,107,.18);color:#2E9E6B;font-size:21px}
.sb-connector-empty{grid-column:1 / -1;padding:44px 0;text-align:center;color:#92969D;font-size:14px}
.sb-connector-notice{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:11px 17px;border-radius:12px;background:#1F2329;color:#fff;font-size:13px;box-shadow:0 10px 26px rgba(15,15,15,.18)}
.sb-connector-auth{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(255,255,255,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.sb-connector-auth-card{width:min(440px,100%);padding:28px;border:1px solid rgba(15,15,15,.08);border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(15,15,15,.16)}
.sb-connector-auth-title{margin:0;color:#1F2329;font-size:19px;font-weight:650;line-height:26px}
.sb-connector-auth-copy{margin:8px 0 18px;color:#777C84;font-size:13px;line-height:21px}
.sb-connector-auth-scopes{display:grid;gap:8px;margin:0 0 22px;padding:0;list-style:none;color:#3F434A;font-size:13px;line-height:20px}
.sb-connector-auth-scopes li{display:flex;align-items:center;gap:8px}.sb-connector-auth-scopes li::before{content:"✓";color:#2E9E6B;font-weight:700}
.sb-connector-auth-actions{display:flex;justify-content:flex-end;gap:8px}.sb-connector-auth-actions button{height:36px;padding:0 15px;border-radius:9px;border:1px solid rgba(15,15,15,.12);font:inherit;font-size:12px;cursor:pointer}.sb-connector-auth-cancel{background:#fff;color:#5A5E66}.sb-connector-auth-confirm{border-color:#1F2329!important;background:#1F2329;color:#fff}
.sb-connector-custom-panel{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(255,255,255,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.sb-connector-custom-card{width:min(520px,100%);padding:28px;border:1px solid rgba(15,15,15,.08);border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(15,15,15,.16)}
.sb-connector-custom-title{margin:0;color:#1F2329;font-size:19px;font-weight:650}.sb-connector-custom-help{margin:8px 0 20px;color:#777C84;font-size:13px;line-height:21px}
.sb-connector-custom-fields{display:grid;gap:14px}.sb-connector-custom-field{display:grid;gap:6px;color:#5A5E66;font-size:12px}.sb-connector-custom-field input{height:38px;border:1px solid rgba(15,15,15,.12);border-radius:9px;padding:0 11px;background:#fff;color:#1F2329;font:inherit;font-size:13px;outline:none}.sb-connector-custom-field input:focus{border-color:rgba(45,103,214,.58);box-shadow:0 0 0 3px rgba(45,103,214,.1)}
.sb-connector-custom-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}.sb-connector-custom-actions button{height:36px;padding:0 15px;border-radius:9px;border:1px solid rgba(15,15,15,.12);font:inherit;font-size:12px;cursor:pointer}.sb-connector-custom-cancel{background:#fff;color:#5A5E66}.sb-connector-custom-submit{border-color:#1F2329!important;background:#1F2329;color:#fff}
.sb-settings-page{min-height:100%;display:flex;flex-direction:column;gap:26px}
.sb-settings-head{display:flex;align-items:flex-start;gap:20px}
.sb-settings-head-copy{flex:1;min-width:0}
.sb-settings-title{margin:0;color:#1F2329;font-size:25px;font-weight:650;line-height:34px}
.sb-settings-subtitle{margin:6px 0 0;color:#92969D;font-size:16px;line-height:23px}
.sb-settings-head-action{flex:none;display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 17px;border:0;border-radius:22px;background:#1F1F1F;color:#fff;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.sb-settings-head-action:hover{background:#383838}
.sb-settings-head-action-icon{font-size:20px;font-weight:300;line-height:1}
.sb-settings-eyebrow{margin:0 0 8px;color:#8A8F99;font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
.sb-settings-section-title{margin:0;color:#34383F;font-size:17px;font-weight:650;line-height:24px}
.sb-settings-muted{color:#92969D;font-size:13px;line-height:21px}
.sb-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.sb-settings-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.sb-settings-card{min-width:0;padding:22px;border:1px solid rgba(15,15,15,.07);border-radius:16px;background:#F8F8F8;box-sizing:border-box}
.sb-settings-card.white{background:#fff}
.sb-settings-card-accent{background:linear-gradient(135deg,#F4F7FF,#F8F8F8 68%);border-color:rgba(76,154,255,.16)}
.sb-settings-card-title{margin:0;color:#1F2329;font-size:16px;font-weight:650;line-height:23px}
.sb-settings-card-copy{margin:6px 0 0;color:#777C84;font-size:13px;line-height:21px}
.sb-settings-metric{display:flex;align-items:flex-end;gap:8px;margin-top:16px;color:#1F2329}
.sb-settings-metric strong{font-size:34px;line-height:1;font-variant-numeric:tabular-nums}
.sb-settings-metric span{padding-bottom:3px;color:#8A8F99;font-size:13px}
.sb-settings-actions{display:flex;align-items:center;gap:9px;margin-top:18px;flex-wrap:wrap}
.sb-settings-primary,.sb-settings-secondary,.sb-settings-danger{height:36px;padding:0 15px;border-radius:9px;border:1px solid rgba(15,15,15,.12);font:inherit;font-size:12px;cursor:pointer}
.sb-settings-primary{border-color:#1F2329;background:#1F2329;color:#fff}.sb-settings-primary:hover{background:#383838}
.sb-settings-secondary{background:#fff;color:#3F434A}.sb-settings-secondary:hover{background:#F1F2F4}
.sb-settings-danger{background:#fff;color:#B0486B;border-color:rgba(176,72,107,.22)}.sb-settings-danger:hover{background:rgba(176,72,107,.06)}
.sb-settings-tag{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:rgba(46,158,107,.12);color:#2E868E;font-size:11px;font-weight:650;white-space:nowrap}
.sb-settings-tag.blue{background:rgba(76,154,255,.12);color:#2867C7}.sb-settings-tag.gray{background:rgba(15,15,15,.06);color:#777C84}.sb-settings-tag.pink{background:rgba(213,107,140,.13);color:#B0486B}
.sb-plan-card{position:relative;display:flex;flex-direction:column;min-height:232px;padding:22px;border:1px solid rgba(15,15,15,.07);border-radius:16px;background:#F8F8F8;box-sizing:border-box}
.sb-plan-card.current{border-color:rgba(76,154,255,.42);box-shadow:0 8px 24px rgba(76,154,255,.08)}
.sb-plan-card.featured{background:#1F2329;color:#fff;border-color:#1F2329}.sb-plan-card.featured .sb-settings-card-title,.sb-plan-card.featured .sb-settings-card-copy{color:#fff}.sb-plan-card.featured .sb-settings-card-copy{opacity:.68}
.sb-plan-price{display:flex;align-items:baseline;gap:4px;margin:18px 0 12px}.sb-plan-price strong{font-size:30px;line-height:1;font-variant-numeric:tabular-nums}.sb-plan-price span{font-size:12px;opacity:.65}
.sb-plan-features{display:grid;gap:8px;margin:0;padding:0;list-style:none;color:#5A5E66;font-size:12px;line-height:18px}.sb-plan-card.featured .sb-plan-features{color:rgba(255,255,255,.75)}.sb-plan-features li::before{content:"✓";margin-right:7px;color:#2E9E6B;font-weight:700}.sb-plan-card.featured .sb-plan-features li::before{color:#A5E3BE}
.sb-plan-card .sb-settings-actions{margin-top:auto}
.sb-credit-picker{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.sb-credit-option{height:38px;padding:0 14px;border:1px solid rgba(15,15,15,.1);border-radius:10px;background:#fff;color:#3F434A;font:inherit;font-size:13px;cursor:pointer}.sb-credit-option:hover{border-color:rgba(76,154,255,.4)}.sb-credit-option[data-active="true"]{border-color:#2867C7;background:rgba(76,154,255,.1);color:#2867C7;font-weight:650}
.sb-settings-field{display:grid;gap:7px;color:#5A5E66;font-size:12px}.sb-settings-field input,.sb-settings-field textarea,.sb-settings-field select{width:100%;min-height:38px;padding:8px 11px;border:1px solid rgba(15,15,15,.12);border-radius:9px;background:#fff;color:#1F2329;font:inherit;font-size:13px;outline:none;box-sizing:border-box}.sb-settings-field textarea{min-height:94px;resize:vertical}.sb-settings-field input:focus,.sb-settings-field textarea:focus,.sb-settings-field select:focus{border-color:rgba(45,103,214,.58);box-shadow:0 0 0 3px rgba(45,103,214,.1)}
.sb-settings-form{display:grid;gap:15px}.sb-settings-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.sb-payment-row,.sb-billing-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid rgba(15,15,15,.07)}.sb-payment-row:last-child,.sb-billing-row:last-child{border-bottom:0;padding-bottom:0}.sb-payment-brand{width:42px;height:28px;display:grid;place-items:center;border-radius:7px;background:#1F2329;color:#fff;font-size:11px;font-weight:700}.sb-payment-copy,.sb-billing-copy{flex:1;min-width:0}.sb-payment-title,.sb-billing-title{color:#34383F;font-size:13px;font-weight:650;line-height:20px}.sb-payment-meta,.sb-billing-meta{color:#92969D;font-size:11px;line-height:18px}.sb-payment-actions{display:flex;align-items:center;gap:6px;flex:none}.sb-payment-actions button{height:28px;padding:0 9px;border:1px solid rgba(15,15,15,.1);border-radius:7px;background:#fff;color:#5A5E66;font:inherit;font-size:11px;cursor:pointer}.sb-payment-actions button:hover{background:#F1F2F4}
.sb-profile-avatar{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:#C2185B;color:#fff;font-size:22px;font-weight:650}.sb-profile-head{display:flex;align-items:center;gap:14px}.sb-profile-name{color:#1F2329;font-size:16px;font-weight:650}.sb-profile-email{margin-top:3px;color:#92969D;font-size:12px}
.sb-memory-head{display:flex;align-items:center;gap:14px;margin-bottom:18px}.sb-memory-head-copy{min-width:0}.sb-memory-status{margin-top:4px;color:#92969D;font-size:12px}.sb-memory-status[data-connected="true"]{color:#2E868E}.sb-memory-card-title{margin:0;color:#34383F;font-size:16px;font-weight:650;line-height:23px}.sb-memory-card-copy{margin:5px 0 0;color:#92969D;font-size:12px;line-height:20px}.sb-memory-rule-list{display:grid;gap:8px;margin-top:14px}.sb-memory-rule{display:flex;align-items:flex-start;gap:9px;color:#3F434A;font-size:13px;line-height:21px}.sb-memory-rule::before{content:"";width:6px;height:6px;flex:none;margin-top:7px;border-radius:50%;background:#3B6BD4}.sb-memory-rule.empty{color:#92969D}.sb-memory-rule.empty::before{background:#C8CCD2}.sb-memory-train{display:flex;gap:8px;margin-top:16px}.sb-memory-train select{flex:none;border:1px solid rgba(15,15,15,.12);border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;color:#1F2329;background:#fff;outline:none}.sb-memory-train input{flex:1;min-width:0;border:1px solid rgba(15,15,15,.12);border-radius:8px;padding:6px 10px;font-size:12px;font-family:inherit;color:#1F2329;outline:none}.sb-memory-train input:focus{border-color:rgba(76,154,255,.55)}.sb-memory-train button{flex:none}.sb-memory-list{display:grid;gap:9px;margin-top:14px}.sb-memory-entry{padding:12px 14px;border:1px solid rgba(15,15,15,.07);border-radius:11px;background:#FAFAFA}.sb-memory-entry[data-status="rolled-back"]{opacity:.58}.sb-memory-entry-text{color:#1F2329;font-size:13px;line-height:21px}.sb-memory-entry-meta{display:flex;align-items:center;gap:8px;margin-top:6px;color:#A1A6AD;font-size:11px}.sb-memory-entry-kind{padding:2px 7px;border-radius:999px;background:rgba(76,154,255,.1);color:#2867C7;font-weight:650}.sb-memory-entry-kind[data-kind="feedback"]{background:rgba(232,163,61,.14);color:#B87A1E}.sb-memory-entry-kind[data-kind="lessons"]{background:rgba(143,107,216,.12);color:#7A5CCE}.sb-memory-entry-kind[data-kind="bestPractices"]{background:rgba(87,178,106,.13);color:#2F7D3F}.sb-memory-entry-rollback,.sb-memory-entry-delete{border:0;background:transparent;color:#8A8F99;font:inherit;font-size:11px;cursor:pointer}.sb-memory-entry-rollback{margin-left:auto}.sb-memory-entry-rollback:hover,.sb-memory-entry-delete:hover{color:#C4453C}.sb-memory-loading{padding:30px 0;text-align:center;color:#92969D;font-size:13px}
.sb-notice-list{display:grid;gap:10px}.sb-notice-item{display:flex;align-items:flex-start;gap:13px;padding:16px;border:1px solid rgba(15,15,15,.07);border-radius:14px;background:#F8F8F8}.sb-notice-item[data-read="false"]{background:#F6F9FF;border-color:rgba(76,154,255,.17)}.sb-notice-dot{width:8px;height:8px;flex:none;margin-top:6px;border-radius:50%;background:#2867C7}.sb-notice-item[data-read="true"] .sb-notice-dot{background:#C8CCD2}.sb-notice-copy{flex:1;min-width:0}.sb-notice-title{color:#34383F;font-size:13px;font-weight:650;line-height:20px}.sb-notice-body{margin-top:4px;color:#777C84;font-size:12px;line-height:20px}.sb-notice-time{margin-top:7px;color:#A1A6AD;font-size:11px}
.sb-settings-empty{padding:44px 0;text-align:center;color:#92969D;font-size:13px}
@media(max-width:1100px){.sb-connector-sidebar{width:240px;padding-left:22px;padding-right:22px}.sb-connector-content{padding-left:24px;padding-right:24px}.sb-connector-list{gap:12px;margin-left:0;margin-right:0}.sb-connector-section-title{margin-left:0}.sb-connector-search{margin:16px 0 24px}}
@media(max-width:760px){.sb-connector-modal{padding:12px;align-items:stretch}.sb-connector-dialog{width:100%;height:100%;max-height:none;border-radius:14px}.sb-connector-sidebar{display:none}.sb-connector-content{padding:20px 16px 28px}.sb-connector-close{top:18px;right:14px}.sb-connector-custom{margin-right:40px}.sb-connector-search{height:52px;margin:16px 0 24px;padding:0 16px}.sb-connector-list{grid-template-columns:1fr}.sb-connector-card{min-height:132px;padding:16px}.sb-connector-title{font-size:22px}.sb-connector-subtitle{font-size:14px}.sb-settings-grid,.sb-settings-grid.three,.sb-settings-form-grid{grid-template-columns:1fr}.sb-settings-card,.sb-plan-card{padding:18px}.sb-settings-mobile-nav{display:block;width:100%;height:40px;margin:0 0 22px;padding:0 11px;border:1px solid rgba(15,15,15,.12);border-radius:9px;background:#fff;color:#1F2329;font:inherit;font-size:13px}.sb-memory-train{flex-wrap:wrap}.sb-memory-train select{flex:1 1 calc(50% - 4px)}.sb-memory-train input{flex:1 1 100%}.sb-memory-train button{margin-left:auto}}
.sb-feed-quick{display:flex;gap:10px;width:100%;overflow-x:auto;overflow-y:hidden;padding:2px 0 4px;margin-bottom:36px;scrollbar-width:none;scroll-snap-type:x proximity;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;cursor:grab}
.sb-feed-quick[data-dragging="true"]{cursor:grabbing;scroll-snap-type:none;user-select:none}
.sb-feed-quick::-webkit-scrollbar{display:none}
.sb-feed-quick-card{flex:0 0 clamp(220px,24vw,360px);min-width:clamp(220px,24vw,360px);height:58px;display:flex;align-items:center;gap:10px;padding:0 12px;background:rgba(255,255,255,.46);border:1px solid rgba(255,255,255,.76);border-radius:13px;backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%);box-shadow:inset 0 1px 0 rgba(255,255,255,.78),0 6px 18px rgba(32,40,48,.04);cursor:pointer;scroll-snap-align:start;transition:background .18s ease,border-color .18s ease,transform .18s ease;box-sizing:border-box}
.sb-feed-quick-card:last-child{flex:0 0 88px;min-width:88px;justify-content:center;padding:0 10px}
.sb-feed-quick-card:last-child .sb-feed-quick-icon{display:none}
.sb-feed-quick-card:hover{background:rgba(255,255,255,.66);border-color:rgba(255,255,255,.92);transform:translateY(-1px)}
.sb-feed-quick-card[data-active="true"]{border-color:rgba(45,103,214,.28);background:rgba(255,255,255,.84);box-shadow:inset 0 0 0 1px rgba(76,154,255,.12),0 8px 20px rgba(45,103,214,.08)}
.sb-feed-quick-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;flex:none;overflow:hidden}
.sb-feed-quick-copy{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;text-align:left}
.sb-feed-quick-name{font-size:13px;font-weight:650;color:#1F2329;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-feed-quick-task{font-size:11px;color:#8A8F99;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-feed-quick-label{font-size:13px;font-weight:600;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-feed-section-label{font-size:15px;line-height:22px;color:#777C84;margin:0 0 13px}
.sb-feed-section-label strong{color:#1F2329;font-weight:650}
.sb-feed-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
@media (max-width:1100px){.sb-feed-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:680px){.sb-feed-grid{grid-template-columns:1fr}.sb-feed-quick-card{flex-basis:220px;min-width:220px}}
.sb-feed-card{width:100%;background:rgba(255,255,255,.48);border:1px solid rgba(255,255,255,.78);border-radius:16px;padding:18px 18px 15px;backdrop-filter:blur(20px) saturate(125%);-webkit-backdrop-filter:blur(20px) saturate(125%);box-shadow:inset 0 1px 0 rgba(255,255,255,.82),0 10px 28px rgba(32,40,48,.045);cursor:pointer;transition:box-shadow .18s ease,transform .18s ease,border-color .18s ease;position:relative;min-height:142px;box-sizing:border-box;text-align:left;font:inherit;display:flex;flex-direction:column}
.sb-feed-card:hover{background:rgba(255,255,255,.62);border-color:rgba(255,255,255,.92);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 10px 26px rgba(15,15,15,.08);transform:translateY(-1px)}
.sb-feed-cardhead{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sb-feed-icon{width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;flex:none}
.sb-feed-title{font-size:14px;font-weight:650;color:#1F2329;line-height:1.45}
.sb-feed-desc{font-size:12.5px;color:#8A8F99;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-feed-desc::before{content:"我们可以：";color:#5A5E66;font-weight:600}
.sb-feed-fill{display:block;margin-top:auto;padding-top:9px;color:#6F7680;font-size:11px;line-height:16px;opacity:.72;transition:color .18s ease,opacity .18s ease}
.sb-feed-card:hover .sb-feed-fill{color:#2867C7;opacity:1}

/* Homepage composition: the brand banner and task editor own the first viewport. */
[class*="_contentInner_1e9r5_"]{max-width:min(1240px,calc(100vw - 480px))!important;padding:88px 28px 0!important}
[class*="_agentIntro_1e9r5_"]{position:relative;isolation:isolate;display:block!important;width:100%!important;height:clamp(150px,10.45vw,214px)!important;min-height:150px!important;margin-bottom:24px!important;padding:0!important;border:0!important;border-radius:26px!important;background:linear-gradient(180deg,rgba(255,255,255,.56) 0%,rgba(255,255,255,.52) 16%,rgba(255,255,255,.45) 34%,rgba(248,250,251,.33) 54%,rgba(238,245,248,.23) 73%,rgba(226,236,241,.13) 88%,rgba(218,231,237,.08) 100%)!important;backdrop-filter:blur(22px) saturate(118%);-webkit-backdrop-filter:blur(22px) saturate(118%);box-shadow:inset 0 1px 0 rgba(255,255,255,.72),0 8px 22px rgba(59,75,88,.035)!important;box-sizing:border-box;overflow:visible!important}
[class*="_agentIntro_1e9r5_"][data-record-menu="open"]{z-index:8}
[class*="_agentIntro_1e9r5_"]::before{content:"";position:absolute;inset:0;border-radius:30px;background:linear-gradient(105deg,rgba(255,255,255,.24) 0%,rgba(255,255,255,.19) 24%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.05) 72%,rgba(255,255,255,0) 92%);pointer-events:none;z-index:0}
[class*="_agentIntro_1e9r5_"]::after{content:"";position:absolute;right:34px;top:28px;width:292px;height:116px;border:1px solid rgba(15,15,15,.08);border-radius:46% 54% 44% 56%;transform:rotate(-8deg);z-index:0}
[class*="_agentIntro_1e9r5_"] [class*="_agentLogo_"],[class*="_agentIntro_1e9r5_"] [class*="_agentInfo_"]{display:none!important}
[class*="_agentIntro_1e9r5_"] > *{position:relative;z-index:1}
.sb-home-hero-brand{position:absolute;left:12px;top:44%;display:block;color:#111;z-index:2;transform:translateY(-50%)}
.sb-home-hero-lockup{display:block;width:clamp(280px,18vw,340px);aspect-ratio:1911 / 487;overflow:hidden;line-height:0}
.sb-home-hero-wordmark{display:block;width:113.66%;max-width:none;height:auto;object-fit:contain;transform:translate(-6.44%,-21.55%);transform-origin:top left}
.sb-home-hero-caption{display:none}
.sb-home-hero-nav{position:absolute;left:12px;bottom:20px;display:flex;align-items:center;gap:4px;height:45px;padding:0 10px;border:1px solid rgba(255,255,255,.76);border-radius:24px;background:rgba(255,255,255,.28);backdrop-filter:blur(18px) saturate(135%);-webkit-backdrop-filter:blur(18px) saturate(135%);box-shadow:inset 0 1px 0 rgba(255,255,255,.84),0 8px 22px rgba(15,15,15,.035);z-index:2}
.sb-home-hero-nav-item{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;height:32px;min-height:32px;padding:0 17px;border:0;border-radius:17px;background:transparent;color:#25282d;font:inherit;font-size:14px;font-weight:500;line-height:1;letter-spacing:.1px;white-space:nowrap;cursor:pointer;box-sizing:border-box;transition:background .18s ease,color .18s ease,box-shadow .18s ease}
.sb-home-hero-nav-item:hover{background:rgba(255,255,255,.42)}
.sb-home-hero-nav-item[data-active="true"]{background:rgba(255,255,255,.64);box-shadow:inset 0 1px 0 rgba(255,255,255,.88);font-weight:650}
.sb-home-hero-nav-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;flex:0 0 28px;font-family:"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Apple Symbols",sans-serif;font-size:19px;line-height:1;color:#111}
.sb-home-hero-nav-label{display:inline-flex;align-items:center;height:24px;line-height:24px}
.sb-home-hero-nav[data-record-menu="open"]{z-index:8;overflow:visible}
.sb-home-hero-record-menu{position:absolute;top:calc(100% + 10px);right:0;z-index:9;width:min(318px,calc(100vw - 32px));padding:16px;border:1px solid rgba(15,15,15,.1);border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 16px 36px rgba(24,32,40,.16),inset 0 1px 0 rgba(255,255,255,.95);backdrop-filter:blur(18px) saturate(120%);-webkit-backdrop-filter:blur(18px) saturate(120%);box-sizing:border-box;animation:sb-home-record-menu-in 160ms ease-out}
@keyframes sb-home-record-menu-in{from{opacity:0;transform:translateY(-5px) scale(.98)}to{opacity:1;transform:none}}
.sb-home-hero-record-menu-head{display:flex;align-items:flex-start;gap:10px;padding-right:24px}
.sb-home-hero-record-menu-icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:9px;background:#f1f3f5;font-size:18px;line-height:1}
.sb-home-hero-record-menu-copy{min-width:0}
.sb-home-hero-record-menu-title{margin:0;color:#1f2329;font-size:14px;font-weight:650;line-height:20px}
.sb-home-hero-record-menu-subtitle{margin:3px 0 0;color:#858c96;font-size:11px;line-height:17px}
.sb-home-hero-record-menu-close{position:absolute;top:12px;right:12px;width:24px;height:24px;padding:0;border:0;border-radius:7px;background:transparent;color:#8a919a;font:inherit;font-size:18px;line-height:24px;cursor:pointer}
.sb-home-hero-record-menu-close:hover{background:#f1f3f5;color:#34383f}
.sb-home-hero-record-menu-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.sb-home-hero-record-menu-action{height:36px;padding:0 10px;border:1px solid rgba(15,15,15,.12);border-radius:9px;background:#fff;color:#34383f;font:inherit;font-size:12px;cursor:pointer;transition:background 160ms ease,border-color 160ms ease,transform 160ms ease}
.sb-home-hero-record-menu-action:hover{border-color:rgba(15,15,15,.2);background:#f5f6f7;transform:translateY(-1px)}
.sb-home-hero-record-menu-action[data-primary="true"]{border-color:#17191d;background:#17191d;color:#fff}
.sb-home-hero-record-menu-action[data-primary="true"]:hover{background:#30343a}
.sb-home-hero-bubbles{position:absolute;right:18px;top:14px;width:310px;height:170px;z-index:2;pointer-events:none}
.sb-home-hero-bubble{position:absolute;display:flex;align-items:center;justify-content:center;min-width:104px;height:52px;padding:0 18px;border:1px solid rgba(15,15,15,.09);border-radius:28px;background:rgba(255,255,255,.36);box-shadow:0 6px 18px rgba(15,15,15,.025);font-size:15px;color:#34383e;white-space:nowrap}
.sb-home-hero-bubble:nth-child(1){left:4px;top:0;color:#9a9da1}.sb-home-hero-bubble:nth-child(2){right:34px;top:0;color:#b0b2b5}.sb-home-hero-bubble:nth-child(3){right:0;top:68px}.sb-home-hero-bubble:nth-child(4){right:38px;top:136px;color:#676b70}.sb-home-hero-bubble:nth-child(5){left:126px;top:69px;min-width:132px}
.sb-home-hero-bird{position:absolute;right:40px;bottom:-42px;width:240px;height:180px;border-radius:18px;object-fit:contain;object-position:center;filter:drop-shadow(0 12px 16px rgba(15,15,15,.12));z-index:3;pointer-events:none}
[class*="_chatInputArea_1e9r5_"]{max-width:none!important;margin-bottom:28px!important}
[class*="_chatInputBox_1e9r5_"]{min-height:clamp(220px,14.65vw,300px)!important;padding:28px 28px 18px 34px!important;border-radius:28px!important;border-color:rgba(255,255,255,.78)!important;background:rgba(255,255,255,.5)!important;backdrop-filter:blur(20px) saturate(125%);-webkit-backdrop-filter:blur(20px) saturate(125%);box-shadow:inset 0 1px 0 rgba(255,255,255,.86),0 12px 42px rgba(15,15,15,.045)!important}
[class*="_chatInput_17vjn_"] .semi-aiChatInput{position:relative;z-index:2;min-height:clamp(160px,11.3vw,232px)!important;max-height:320px!important;padding:22px!important;border-radius:26px!important;background:rgba(255,255,255,.7)!important;border-color:rgba(255,255,255,.84)!important;backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 4px 14px rgba(15,15,15,.025)!important}
[class*="_chatInput_17vjn_"] .semi-aiChatInput-editor-content{position:relative}
[class*="_chatInput_17vjn_"] .semi-aiChatInput-editor-content .tiptap p.is-editor-empty{padding-left:46px!important}
  [class*="_chatInput_17vjn_"] .semi-aiChatInput-editor-content .tiptap p.is-editor-empty:first-child::before{content:attr(data-placeholder)!important;font-size:14px!important;line-height:22px!important;font-weight:400!important}
.sb-input-tab{position:absolute;left:12px;top:20px;z-index:2;display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 7px;border:1px solid rgba(15,15,15,.18);border-radius:7px;background:#fff;color:#777;font-size:12px;line-height:1;pointer-events:none}
[class*="_chatInput_17vjn_"] .semi-aiChatInput:has(.tiptap p:not(.is-editor-empty)) .sb-input-tab{display:none}
[class*="_chatInput_1e9r5_"]{font-size:18px!important;line-height:26px!important}
[class*="_chatInputActions_1e9r5_"]{margin-top:16px!important}
.sb-input-options{display:flex;align-items:center;gap:8px;margin-left:4px}
.sb-input-option{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--semi-color-text-2,#8A8F99);cursor:pointer;transition:background .16s ease,color .16s ease,transform .16s ease}
.sb-input-option:hover{background:var(--semi-color-fill-0,rgba(15,15,15,.06));color:var(--semi-color-text-0,#1F2329);transform:translateY(-1px)}
.sb-input-option:focus-visible{outline:2px solid rgba(76,154,255,.42);outline-offset:2px}
.sb-input-option[data-active="true"]{background:rgba(76,154,255,.12);color:#2867C7}
.sb-input-option[data-listening="true"]{background:rgba(213,107,140,.14);color:#B0486B;animation:sb-input-pulse 1.25s ease-in-out infinite}
.sb-input-option[data-unsupported="true"]{color:#B0B4BB;cursor:not-allowed}
.sb-input-option svg{width:17px;height:17px;display:block;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
@keyframes sb-input-pulse{0%,100%{box-shadow:0 0 0 0 rgba(176,72,107,.18)}50%{box-shadow:0 0 0 5px rgba(176,72,107,0)}}
.sb-input-notice{position:fixed;left:50%;bottom:28px;z-index:10070;transform:translateX(-50%);padding:9px 14px;border-radius:10px;background:#1F2329;color:#fff;font-size:12px;line-height:18px;box-shadow:0 10px 26px rgba(15,15,15,.18);animation:sb-input-notice-in .18s ease-out}
@keyframes sb-input-notice-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
@media(max-width:1500px){
  [class*="_contentInner_1e9r5_"]{padding-top:60px!important}
  [class*="_agentIntro_1e9r5_"]{height:136px!important;min-height:136px!important}
  .sb-home-hero-lockup{width:clamp(220px,17vw,270px)}.sb-home-hero-brand{left:12px;top:44%}.sb-home-hero-nav{left:12px;bottom:13px;height:40px;padding:0 9px}.sb-home-hero-nav-item{height:30px;padding:0 12px;gap:7px;font-size:14px}.sb-home-hero-nav-icon{font-size:18px}.sb-home-hero-bird{right:28px;bottom:-38px;width:230px;height:173px;border-radius:16px}.sb-home-hero-bubbles{right:0;transform:scale(.86);transform-origin:top right}
}
@media(max-width:1324px){
  [class*="_contentInner_1e9r5_"]{max-width:min(900px,calc(100vw - 270px))!important;padding:48px 24px 0!important}
  [class*="_agentIntro_1e9r5_"]{height:clamp(160px,11vw,190px)!important;min-height:160px!important}
  .sb-home-hero-lockup{width:clamp(210px,23vw,250px)}.sb-home-hero-brand{left:12px;top:44%}.sb-home-hero-nav{left:12px;bottom:13px;height:40px;padding:0 9px}.sb-home-hero-nav-item{height:30px;padding:0 11px;gap:6px;font-size:13px}.sb-home-hero-nav-icon{font-size:17px}.sb-home-hero-bird{right:20px;bottom:-34px;width:225px;height:169px;border-radius:14px}.sb-home-hero-bubbles{right:0;transform:scale(.86);transform-origin:top right}
  [class*="_chatInputBox_1e9r5_"]{min-height:clamp(220px,14.65vw,250px)!important}
  [class*="_chatInput_17vjn_"] .semi-aiChatInput{min-height:clamp(160px,11.3vw,205px)!important;max-height:280px!important;padding:22px!important;border-radius:24px!important}
}
@media(max-width:680px){
  [class*="_contentInner_1e9r5_"]{padding:24px 24px 0!important}
  [class*="_agentIntro_1e9r5_"]{height:150px!important;min-height:150px!important;border-radius:22px!important}
  [class*="_agentIntro_1e9r5_"]::after{right:-72px;top:26px;width:190px;height:80px;border-radius:40px}
  .sb-home-hero-brand{left:18px;top:44%}.sb-home-hero-lockup{width:176px}
  .sb-home-hero-nav{left:14px;bottom:14px;height:42px;padding:0 6px;border-radius:22px;max-width:calc(100% - 28px);overflow:hidden}.sb-home-hero-nav-item{height:32px;padding:0 9px;gap:5px;font-size:11px}.sb-home-hero-nav-icon{font-size:14px}
  .sb-home-hero-bubbles{display:none}.sb-home-hero-bird{right:8px;bottom:-24px;width:162px;height:121px;border-radius:12px}.sb-input-tab{left:18px;top:18px;height:24px;padding-left:6px;padding-right:6px;font-size:11px}
  [class*="_chatInputBox_1e9r5_"]{min-height:220px!important;padding:22px 18px 16px!important;border-radius:22px!important}
  [class*="_chatInput_17vjn_"] .semi-aiChatInput{min-height:210px!important;max-height:280px!important;padding:18px!important;border-radius:22px!important}
  .sb-feed-connect{margin-left:-24px;margin-right:-24px;margin-bottom:32px;border-radius:0 0 20px 20px;padding:14px 18px 14px;align-items:flex-start;gap:10px}
  .sb-feed-connect::before{top:-18px;height:18px;border-radius:20px 20px 0 0}
  .sb-feed-connect-copy{flex-basis:100%;line-height:22px}
  .sb-feed-connect-apps{width:100%;gap:5px}
  .sb-feed-connect-app{width:30px;height:30px;flex-basis:30px;font-size:10px}
}
/* Desktop proportion calibration: keep the existing navigation, but match the reference canvas ratio. */
@media(min-width:1325px){
  [class*="_sidebar_3vz2u_"]{width:clamp(280px,18vw,358px)!important}
  [class*="_sidebarInner_3vz2u_"]{width:100%!important}
  [class*="_contentInner_1e9r5_"]{max-width:min(1210px,calc(100vw - 520px))!important;padding-top:72px!important}
  [class*="_agentIntro_1e9r5_"]{height:clamp(191px,calc(91px + 6.333vw),214px)!important;min-height:191px!important}
  .sb-home-hero-nav{gap:1px;height:39px;padding-left:8px;padding-right:8px}
  .sb-home-hero-nav-item{height:28px;padding-left:10px;padding-right:10px;gap:6px;font-size:13px}
  .sb-home-hero-nav-icon{font-size:17px}
  .sb-home-hero-bird{right:24px;bottom:-42px;width:270px;height:203px;border-radius:15px}
}
@media(min-width:681px) and (max-width:1324px){
  [class*="_sidebar_3vz2u_"]{width:clamp(220px,18vw,280px)!important}
  [class*="_sidebarInner_3vz2u_"]{width:100%!important}
  [class*="_contentInner_1e9r5_"]{max-width:min(900px,calc(100vw - 300px))!important;padding-top:40px!important}
  .sb-home-hero-nav{gap:1px;height:36px;padding-left:6px;padding-right:6px}
  .sb-home-hero-nav-item{height:26px;padding-left:6px;padding-right:6px;gap:5px;font-size:12px}
  .sb-home-hero-nav-icon{font-size:16px}
  .sb-home-hero-bird{right:10px;bottom:-38px;width:255px;height:191px;border-radius:13px}
}
/* Use restrained corner radii across the sales home surface. */
[class*="_agentIntro_1e9r5_"]{border-radius:18px!important}
.sb-home-hero-nav{border-radius:18px}
.sb-home-hero-nav-item{border-radius:12px}
.sb-home-hero-bubble{border-radius:18px}
.sb-home-hero-bird{border-radius:10px}
[class*="_chatInputBox_1e9r5_"]{border-radius:20px!important}
[class*="_chatInput_17vjn_"] .semi-aiChatInput{border-radius:18px!important}
.sb-input-tab{border-radius:6px}
.sb-feed-connect{border-radius:0 0 16px 16px}
.sb-feed-connect::before{border-radius:16px 16px 0 0}
.sb-feed-connect-mark,.sb-feed-connect-app{border-radius:8px}
.sb-feed-connect-app-mark{border-radius:6px}
.sb-feed-quick-card{border-radius:9px}
.sb-feed-quick-icon,.sb-feed-icon{border-radius:6px}
.sb-feed-card{border-radius:12px}
`;

/* 图标底色（浅色）按页签区分，与卡片语言一致不抢视觉 */
const TONES = [
  ["rgba(76,154,255,0.14)", "#3B6BD4"],
  ["rgba(87,178,106,0.15)", "#2F7D3F"],
  ["rgba(232,163,61,0.16)", "#B87A1E"],
  ["rgba(213,107,140,0.15)", "#B0486B"],
  ["rgba(124,110,235,0.14)", "#5B4EC4"],
  ["rgba(70,180,190,0.15)", "#2E868E"]
];

export const HOME_SALES_FEED = {
  推荐: [
    ["🎯", "抖音买车线索猎人", "观察抖音评论、粉丝和直播互动，识别有车型、预算、城市或到店信号的高意向买车客户", "帮我监控抖音上的互动，找到高意向买车客户，并自动持续跟进到客户留电话"],
    ["✉️", "首触话术生成", "为 A 级潜客生成 3 套首触私信话术，口语化、无承诺类表述，附跟进节奏建议", "为「潜在客户拓展」项目组的 A 级潜客生成 3 套首触私信话术，要求口语化、不含承诺类表述，并给出 3 天跟进节奏建议"],
    ["📊", "本周线索漏斗周报", "汇总本周新增线索、有效率、首触回复率和转化，输出一页纸周报", "汇总本周的新增线索数量、有效率、首触回复率和转化情况，输出一页纸周报并存到项目共享文件夹"],
    ["🏷️", "竞品动态监控", "监控 3 家主要竞品的账号与官网动态，整理本周新动作并给出应对建议", "监控 3 家主要竞品的抖音账号和官网动态，整理他们本周的新动作、促销活动和内容方向，给出我们的应对建议"],
    ["📞", "今日跟进清单", "筛出超过 3 天未跟进的 B 级以上潜客，按优先级排出今日清单和切入话术", "整理所有超过 3 天未跟进的 B 级以上潜客，按优先级排出今日跟进清单，并为每家准备一句切入话术"],
    ["🤝", "成单复盘沉淀", "复盘本周成单客户从线索到成交的关键动作，沉淀可复制经验到知识库", "复盘本周 2 个成单客户的完整旅程：从线索来源到成交的关键动作各是什么，把可复制的经验沉淀到知识库"]
  ],
  获客: [
    ["🎣", "评论区潜客打捞", "监控同行业账号最新视频评论区，打捞咨询类评论用户整理成清单", "监控同行业 10 个账号的最新视频评论区，打捞有咨询意向的评论用户，整理成潜客清单并标注意向类型"],
    ["👥", "粉丝画像分析", "分析账号粉丝的行业分布、活跃时段、互动偏好，给出内容调整建议", "分析我的抖音账号粉丝画像：行业分布、活跃时段、互动偏好，基于画像给出下周内容方向调整建议"],
    ["🤝", "异业合作名单", "筛选业务互补的本地商家账号，输出 20 个合作候选及切入点", "筛选与我业务互补的本地商家账号，输出 20 个异业合作候选名单，并给出每家的合作切入点"],
    ["📺", "直播线索整理", "整理最近一场直播的观众互动数据，筛出高意向观众并生成跟进话术", "整理最近一场直播的观众互动数据，筛出高意向观众，为每人生成一条个性化的跟进私信话术"],
    ["🔄", "老客转介绍激活", "筛选高满意度成交客户，生成转介绍邀请话术和激励方案", "从成交客户中筛选满意度高的名单，生成转介绍邀请话术和一套转介绍激励方案"],
    ["📈", "行业新榜发现", "监控行业榜单变化，发现新崛起的潜在客户账号", "监控抖音相关行业榜单的变化，发现新崛起的潜在客户账号，输出名单并标注值得关注的原因"]
  ],
  触达: [
    ["📅", "三天触达排期", "为 A 级潜客制定首日私信、次日互动、三日跟进的排期，附每条话术", "为 A 级潜客制定 3 天触达排期：首日私信破冰、次日评论区互动、第三日跟进，每一步都给出具体话术"],
    ["🆚", "破冰话术 A/B", "为同一批潜客生成 A/B 两版破冰私信，设计回复率对比方案", "为同一批潜客生成 A/B 两版破冰私信，并设计一个回复率对比方案，一周后自动统计哪个版本更好"],
    ["⏰", "沉默客户唤醒", "给 30 天未互动的老客户生成唤醒话术，结合历史记录个性化", "给 30 天未互动的老客户生成唤醒话术，结合每家的历史购买记录做个性化，避免群发感"],
    ["🎄", "节日营销触达", "结合最近节日节点，为客户分层设计触达内容和发送排期", "结合最近的节日节点，为全部客户分层设计节日触达内容和发送排期，新老客户话术区分开"],
    ["🔁", "未读客户换道", "把私信未读的潜客改走评论互动路径，生成自然的互动话术", "把私信一直未读的潜客改走评论区互动路径，生成自然不突兀的互动话术，逐步建立熟悉感"],
    ["🎯", "高意向直达", "识别本周有高意向信号的客户，生成一对一专属跟进方案", "识别本周出现高意向信号（反复观看、主动咨询）的客户，为每人生成一对一的专属跟进方案"],
    ["🏅", "金牌客服接管", "持续接管客户咨询，结合历史对话处理异议、判断意向，关键节点转交人工", "接管当前项目组的客户咨询：结合历史对话持续回复，识别并处理价格、配置、试驾和置换异议，实时更新客户意向等级；遇到投诉、承诺、价格审批或高意向成交节点时立即转交人工"],
    ["💬", "金牌话术教练", "实时分析客户消息，生成专业回复建议、沟通策略和下一步跟进动作", "分析当前项目组最近的客户对话，为每条待回复消息生成一版专业回复、一版更亲和的回复，并说明客户情绪、核心诉求、沟通风险和建议的下一步跟进动作，由我确认后再发送"],
    ["🛟", "客诉安抚专家", "识别投诉与负面情绪，生成安抚话术、补救方案和人工升级建议", "筛选当前项目组中带有投诉、不满或明显负面情绪的客户对话，逐条判断客诉等级，生成克制的安抚回复和补救建议；涉及退款、赔付、法律风险或舆情扩散时标记为高优先级并转交人工"]
  ],
  内容: [
    ["🔥", "爆款对标拆解", "拆解同类目 10 条爆款的开头钩子、节奏和转化点，输出可复用模板", "拆解同类目 10 条爆款视频的开头钩子、节奏设计和转化点，输出一套可复用的内容模板"],
    ["🗓️", "14 天选题日历", "生成未来 14 天选题日历，每天一条，贴合粉丝活跃时段", "生成未来 14 天的抖音选题日历，每天一条选题并标注发布时段，贴合粉丝活跃时间"],
    ["🎬", "口播脚本撰写", "为指定主题写 3 条 60 秒口播脚本，含 A/B 两版开头钩子", "为「客户案例拆解」主题写 3 条 60 秒口播脚本，每条含 A/B 两版开头钩子，结尾引导私信咨询"],
    ["💬", "评论区话术库", "整理常见咨询问题的回复话术库，分售前、比价、售后三类", "整理评论区常见咨询问题的回复话术库，分售前咨询、比价应对、售后问题三类，每类 10 条"],
    ["🎙️", "直播大纲设计", "生成完整直播大纲：开场留人、产品讲解、逼单话术、结尾预告", "为下一场直播生成完整大纲：开场留人话术、产品讲解节奏、逼单环节设计、结尾预告钩子"],
    ["📱", "朋友圈文案周包", "生成一周朋友圈营销文案，软广与干货按 3:7 配比", "生成未来一周的朋友圈营销文案，软广与干货内容按 3:7 配比，每天 2 条配发布时段"]
  ],
  复盘: [
    ["📉", "周度数据复盘", "汇总本周播放、涨粉、互动、线索转化，对比上周给出结论", "汇总本周抖音账号数据：播放量、涨粉、互动率、线索转化数，对比上周数据给出结论和改进点"],
    ["📊", "话术效果分析", "统计各版本触达话术的回复率，找出最优版本并分析原因", "统计近期各版本触达话术的回复率，找出效果最好的版本，分析它好在哪里并固化为默认模板"],
    ["⚠️", "客户流失预警", "识别互动频率下降的客户，分析可能原因并给出挽回动作", "识别互动频率明显下降的客户名单，分析可能的原因，为每家给出具体的挽回动作建议"],
    ["⚖️", "渠道 ROI 对比", "对比抖音、转介绍、自然到店三个渠道的线索成本与成交率", "对比抖音、老客转介绍、自然到店三个渠道的线索成本和成交率，给出下月预算倾斜建议"],
    ["👥", "团队产出周报", "汇总四位成员本周产出：线索数、触达数、物料数，标注卡点", "汇总项目组四位成员本周的产出：线索数、触达数、物料产出数，标注还没解决的卡点事项"],
    ["🎯", "月度目标校准", "对照月度目标检查进度，给出下半月冲刺计划和资源倾斜建议", "对照本月获客目标检查当前进度，给出下半月的冲刺计划，明确资源应该向哪个渠道倾斜"]
  ],
  演示: [
    ["▶", "完整销售闭环", "演示从线索核验、意向评分、触达到审批归档的完整链路", "演示：监控抖音买车线索，完成首轮跟进并提交触达审批"],
    ["!", "Executor 故障演示", "演示外部数据源超时后的证据保留、任务暂停和重试入口", "模拟失败：核验买车线索并安排到店"],
    ["⌁", "人工接管演示", "演示客户投诉或要求人工时停止自动动作并交接上下文", "演示人工接管：处理客户投诉并保留完整会话上下文"]
  ]
};

export const SALES_DOMAINS = Object.freeze([
  { id: "sales", icon: "📈", label: CUSTOMER_DOMAIN_LABELS.sales, promptPrefix: "销售", skills: [["🎯", "线索猎人", "从评论、私信和表单中识别高意向客户"], ["✉️", "首触话术生成", "按客户画像和业务场景生成个性化首触话术"], ["📊", "线索漏斗周报", "汇总线索、触达、商机和成交转化数据"], ["🏷️", "竞品动态监控", "追踪竞品产品、报价和客户案例变化"], ["📞", "今日跟进清单", "按客户意向和跟进时效排出今日优先级"], ["🤝", "成单复盘沉淀", "复盘从线索到成交的关键动作并沉淀方法"]] },
  { id: "customer-success", icon: "🤝", label: CUSTOMER_DOMAIN_LABELS["customer-success"], promptPrefix: "客户成功", skills: [["🎯", "客户健康度", "从使用、反馈和互动信号识别高风险客户"], ["✉️", "续费沟通生成", "按客户目标和使用阶段生成续费沟通话术"], ["📊", "客户价值周报", "汇总活跃、使用深度、续费和扩容数据"], ["🏷️", "客户需求监控", "整理行业变化与客户反馈中的共性需求"], ["📞", "重点客户跟进", "按健康度和续费节点安排今日跟进"], ["🤝", "成功案例沉淀", "复盘客户从启用到续费的关键成功动作"]] },
  { id: "recruiting", icon: "🧭", label: CUSTOMER_DOMAIN_LABELS.recruiting, promptPrefix: "招聘猎头", skills: [["🎯", "候选人挖掘", "从公开资料和人才库筛选匹配候选人"], ["✉️", "首触沟通生成", "按职位、经历和候选人动机生成首触话术"], ["📊", "招聘漏斗周报", "汇总推荐、面试、Offer 和入职转化数据"], ["🏷️", "人才市场监控", "追踪同类职位、薪资和人才流动变化"], ["📞", "候选人跟进清单", "按沟通阶段和反馈时效安排今日跟进"], ["🤝", "入职复盘沉淀", "复盘从推荐到入职的关键推进节点"]] },
  { id: "education", icon: "🎓", label: CUSTOMER_DOMAIN_LABELS.education, promptPrefix: "教育培训", skills: [["🎯", "报名线索挖掘", "识别试听、咨询和课程关注中的高意向学员"], ["✉️", "咨询话术生成", "按年龄、目标和课程阶段生成沟通话术"], ["📊", "招生漏斗周报", "汇总咨询、试听、报名和续费转化数据"], ["🏷️", "竞品课程监控", "追踪竞品课程、定价和招生内容变化"], ["📞", "学员跟进清单", "按学习目标和跟进时效安排今日触达"], ["🤝", "报名复盘沉淀", "复盘从咨询到报名的关键动作和异议"]] },
  { id: "professional-services", icon: "▦", label: CUSTOMER_DOMAIN_LABELS["professional-services"], promptPrefix: "专业服务", skills: [["🎯", "需求线索识别", "从咨询、内容互动和转介绍中识别有效需求"], ["✉️", "方案沟通生成", "按客户行业、问题和预算生成方案沟通话术"], ["📊", "商机进展周报", "汇总咨询、诊断、提案和签约转化数据"], ["🏷️", "同业方案监控", "追踪同业服务、报价和客户案例变化"], ["📞", "项目跟进清单", "按决策阶段和交付节点安排重点跟进"], ["🤝", "项目复盘沉淀", "复盘从需求确认到交付的关键动作并沉淀方法"]] },
  { id: "ear", icon: "🎙️", label: CUSTOMER_DOMAIN_LABELS.ear, promptPrefix: "倾耳", entry: "ear", skills: [["🎙️", "客户访谈录音", "录下客户访谈并提炼关键需求与异议"], ["📝", "销售复盘录音", "把销售复盘整理成可执行的改进清单"], ["📚", "培训会议录音", "将培训内容整理成结构化知识材料"], ["📊", "经营会议录音", "从会议录音中提取结论、负责人和截止时间"], ["🧩", "方案讲解录音", "把方案讲解转成客户可读的交付材料"], ["↗", "录音分享物料", "生成可分享的 PPT、HTML、PDF 或信息图"]] }
]);

const DOMAIN_PROMPT_CONTEXT = Object.freeze({
  sales: { tabs: ["推荐", "获客", "触达", "内容", "复盘", "演示"], subject: "潜在客户", outcome: "成交", signals: "评论、私信、表单和历史跟进记录", channel: "获客渠道" },
  "customer-success": { tabs: ["推荐", "风险", "续费", "运营", "复盘", "演示"], subject: "重点客户", outcome: "续费与扩容", signals: "产品使用、客户反馈、健康度和续费节点", channel: "客户运营动作" },
  recruiting: { tabs: ["推荐", "寻访", "沟通", "招聘内容", "复盘", "演示"], subject: "候选人", outcome: "到面与入职", signals: "人才库、公开履历、沟通记录和职位要求", channel: "人才渠道" },
  education: { tabs: ["推荐", "招生", "咨询", "课程内容", "复盘", "演示"], subject: "意向学员", outcome: "试听、报名与续费", signals: "课程咨询、试听记录、学习目标和家长反馈", channel: "招生渠道" },
  "professional-services": { tabs: ["推荐", "商机", "提案", "专业内容", "复盘", "演示"], subject: "潜在客户", outcome: "签约与项目交付", signals: "咨询记录、客户问题、预算、决策链和项目资料", channel: "商机渠道" },
  ear: { tabs: ["推荐", "访谈", "复盘", "培训", "交付", "演示"], subject: "会议参与者", outcome: "可执行的会议结论", signals: "录音、说话人、时间线和已授权的会议资料", channel: "会议场景" }
});

// Each industry keeps the same orchestration contract while naming its real data, roles, outputs, and approval boundaries.
const DOMAIN_WORKFLOW_CONTEXT = Object.freeze({
  sales: {
    objective: "从获客渠道识别高意向买家，并推进到一次有效沟通或留资",
    sources: "抖音评论、私信、直播互动、表单和 CRM 历史记录",
    agents: "线索猎人负责发现，数据分析师负责评分，销售顾问负责沟通，幕僚长负责汇总",
    steps: "去重并核验线索 → 按车型、预算、城市、购车时间和到店信号分级 → 生成个性化首触 → 记录回复与下一步 → 对高意向客户转人工",
    deliverables: "带原始证据的线索清单、意向等级、首触话术、今日跟进队列和漏斗摘要",
    guardrails: "价格、库存、优惠、试驾承诺、投诉或个人信息缺失",
    example: "从抖音互动中找出有车型和预算信号的买车客户，完成首触并把愿意留电话的人交给销售顾问"
  },
  "customer-success": {
    objective: "识别客户健康度变化，降低流失风险并推进续费或扩容",
    sources: "产品使用日志、工单、客户反馈、沟通记录、合同和续费节点",
    agents: "客户健康度专员负责识别风险，数据分析师负责评分，客户顾问负责沟通，幕僚长负责复盘",
    steps: "补齐客户与合同信息 → 计算健康度并解释变化 → 按风险和续费时间排序 → 生成针对性触达 → 记录客户回应并升级风险",
    deliverables: "客户健康度清单、风险证据、续费沟通草稿、跟进节奏、续费与扩容机会摘要",
    guardrails: "退款、赔偿、合同变更、服务级别承诺或客户投诉",
    example: "找出未来 60 天内可能流失的客户，说明风险证据，生成续费沟通并安排人工接管"
  },
  recruiting: {
    objective: "从授权人才来源筛选匹配候选人，并推进到有效沟通、面试和入职",
    sources: "职位要求、人才库、公开履历、候选人偏好和沟通记录",
    agents: "候选人挖掘负责寻访，数据分析师负责匹配，招聘顾问负责沟通，幕僚长负责推进",
    steps: "解析职位硬性条件 → 核验候选人经历与意愿 → 按匹配度和风险分级 → 生成个性化首触 → 跟踪回复、面试和 Offer 节点",
    deliverables: "候选人 shortlist、匹配依据、首触话术、面试推进表、风险与待确认问题",
    guardrails: "敏感个人信息、未经授权的联系方式、薪资承诺、录用决定或歧视性判断",
    example: "为资深销售岗位筛选 20 位匹配候选人，保留经历证据，分别生成首触并安排回复跟进"
  },
  education: {
    objective: "识别真实学习需求，推进试听、报名和续费，并持续改善招生转化",
    sources: "课程咨询、试听记录、学习目标、家长反馈、内容互动和历史报名数据",
    agents: "招生线索专员负责识别，学员分析师负责分层，课程顾问负责沟通，幕僚长负责复盘",
    steps: "识别年龄、目标和时间窗口 → 判断课程匹配度与报名意向 → 分层生成咨询话术 → 安排试听与提醒 → 记录异议并转人工",
    deliverables: "学员分层清单、需求与证据、咨询话术、试听/报名跟进表、招生漏斗摘要",
    guardrails: "未成年人信息、效果或升学承诺、退费争议、课程价格与名额确认",
    example: "从近期咨询中找出本周最可能试听的学员，按学习目标生成沟通话术并安排试听跟进"
  },
  "professional-services": {
    objective: "识别有效商机，完成需求诊断与方案推进，并把签约事项交付给项目团队",
    sources: "咨询记录、客户行业与问题、预算、决策链、提案版本和项目资料",
    agents: "商机识别负责筛选，行业研究负责补证，方案顾问负责提案，项目经理负责交接，幕僚长负责汇总",
    steps: "确认业务问题与决策角色 → 核验预算、时间和成功标准 → 评估商机阶段 → 生成诊断问题与方案骨架 → 跟进反馈并形成交接单",
    deliverables: "商机分级表、需求诊断、证据索引、方案提纲、跟进计划和交付交接单",
    guardrails: "报价、合同条款、交付范围、法律/合规判断或未经确认的客户承诺",
    example: "整理咨询记录，找出预算和决策人明确的商机，生成诊断问题、方案骨架和下一次会议议程"
  },
  ear: {
    objective: "把一段授权录音转成可核验、可分工、可执行的会议成果",
    sources: "当前录音、说话人、时间戳、会议背景和已授权的附件",
    agents: "倾耳负责转写，内容分析负责提炼，项目协调负责拆解任务，幕僚长负责审核交付",
    steps: "确认录音授权与参与者 → 转写并标记说话人和时间点 → 提炼决策、分歧、需求和风险 → 拆成负责人/截止时间明确的任务 → 生成并审核交付材料",
    deliverables: "带时间戳的摘要、决策记录、待办清单、风险与待确认项，以及 PPT/HTML/PDF/信息图之一",
    guardrails: "未授权录音、敏感个人信息、未经确认的会议结论或对外发布",
    example: "整理这段客户访谈录音，提炼需求、异议和决策人，生成跟进任务与可分享的会议纪要"
  }
});

function buildWorkflowPrompt(_domainId, request) {
  let value = String(request || "").trim();
  value = value.replace(/^让(?:线索猎人|内容策划|数据分析师|销售顾问)/, "").trim();
  value = value.replace(/；重点能力是“[^”]+”/g, "").trim();
  value = value.replace(/[。；]+$/, "").trim();
  if (!value) return "帮我完成这项工作";
  const goal = /^帮我/.test(value) ? value : `帮我${value}`;
  return `${goal}，结合现有资料整理出清晰结果，并标注关键依据和下一步建议。`;
}

export function domainWorkflowPrompt(domainId, request = null) {
  const workflow = DOMAIN_WORKFLOW_CONTEXT[domainId] || DOMAIN_WORKFLOW_CONTEXT.sales;
  return buildWorkflowPrompt(domainId, request || workflow.example);
}

const WORKFLOW_PROMPT_ITEMS = Object.freeze({
  discover: [
    ["🎯", ({ subject }) => `帮我找出最近最值得优先跟进的${subject}`, ({ signals }) => `结合${signals}识别真实需求，按优先级给出名单和判断依据`],
    ["🔎", ({ subject, channel }) => `哪些${channel}更容易找到高质量${subject}？`, ({ outcome }) => `比较各渠道的数量、质量和转化表现，找出最值得投入的方向以促进${outcome}`],
    ["📋", ({ subject }) => `帮我整理一份可以马上行动的${subject}清单`, ({ signals }) => `清洗${signals}中的重复与无效记录，补齐负责人、阶段和下一步动作`],
    ["⚡", ({ subject }) => `哪些${subject}正在释放明确的行动信号？`, ({ signals }) => `从${signals}中识别时间、预算、需求强度等信号，并保留原始依据`],
    ["🧹", ({ subject }) => `现有${subject}数据里有哪些重复或无效记录？`, () => "完成去重、字段核验和异常标记，不把缺失信息臆测成事实"],
    ["🧭", ({ channel }) => `下周应该重点投入哪个${channel}？`, ({ outcome }) => `根据历史投入和结果给出资源分配建议，并说明对${outcome}的预期影响`]
  ],
  engage: [
    ["✉️", ({ subject }) => `第一次联系${subject}，怎么说更容易得到回复？`, ({ signals }) => `结合${signals}生成个性化开场，并标注信息依据和沟通风险`],
    ["📅", ({ subject }) => `帮我安排这批${subject}接下来 7 天的跟进`, ({ outcome }) => `按优先级生成每天的触达动作、负责人和停止条件，推动${outcome}`],
    ["💬", ({ subject }) => `${subject}提出异议时，我应该怎么回应？`, () => "归纳高频异议，生成克制、可信的回复建议，并标出需要人工确认的边界"],
    ["⏰", ({ subject }) => `很久没有回应的${subject}，还有哪些值得重新联系？`, ({ signals }) => `根据${signals}筛选可唤醒对象，生成不打扰的重新联系方案`],
    ["🧩", ({ subject }) => `能不能给每位${subject}生成不同的沟通方案？`, ({ outcome }) => `按画像、阶段和历史互动生成个性化内容，同时统一${outcome}目标与合规要求`],
    ["🛟", () => "哪些沟通必须转给人工处理？", () => "识别投诉、承诺、审批和高风险节点，整理上下文后及时交接给负责人"]
  ],
  content: [
    ["❓", ({ subject }) => `${subject}最近最关心哪些问题？`, ({ signals }) => `汇总${signals}中的高频问题、异议和表达方式，形成可引用的需求清单`],
    ["🗓️", ({ subject }) => `帮我规划两周能吸引${subject}的内容选题`, ({ outcome }) => `按关注阶段编排选题、渠道和行动引导，让内容服务于${outcome}`],
    ["✍️", ({ subject }) => `把现有资料改成${subject}看得懂的版本`, () => "提炼关键信息，去掉内部术语，输出适合直接发送或发布的内容"],
    ["🆚", () => "同行最近在讲什么，我们可以怎么做得更好？", ({ channel }) => `监控主要同行的公开内容和动作，提炼差异点并给出${channel}建议`],
    ["🏆", ({ outcome }) => `把一个成功${outcome}案例整理成可复用内容`, () => "还原问题、关键动作和结果，生成案例稿及可复用的方法清单"],
    ["📦", ({ subject }) => `帮我做一套面向${subject}的常用内容包`, () => "根据常见场景生成话术、短文案、问答和跟进材料，并保持统一表达"]
  ],
  review: [
    ["📊", ({ outcome }) => `目前离${outcome}目标还有多远？`, () => "汇总关键阶段与转化数据，对照目标指出差距、原因和优先动作"],
    ["📉", ({ subject }) => `哪些${subject}流失了，主要卡在哪里？`, ({ signals }) => `沿着${signals}还原流失节点，区分数据事实与推测并给出补救建议`],
    ["🔁", ({ outcome }) => `最近成功${outcome}的关键动作有哪些？`, () => "对比成功与失败案例，找出可复制动作并沉淀为执行清单"],
    ["⚖️", ({ channel }) => `哪个${channel}投入产出更好？`, () => "统一统计口径，比较成本、质量和转化效率，给出资源倾斜建议"],
    ["📝", () => "帮我生成一份本周经营复盘", ({ outcome }) => `汇总进展、问题、关键数据和下周动作，突出影响${outcome}的事项`],
    ["🚀", ({ outcome }) => `下周为了推进${outcome}，最该先做哪三件事？`, () => "根据影响与紧急程度给出三项优先动作，明确负责人、截止时间和验收标准"]
  ],
  demo: [
    ["▶", ({ subject, outcome }) => `演示一次从识别${subject}到${outcome}的完整流程`, () => "用示例数据展示识别、分析、执行、审批和结果归档的完整链路"],
    ["🧠", ({ signals }) => `演示如何从${signals}里判断下一步动作`, () => "展示判断依据、置信度和需要人工确认的信息，不隐藏决策过程"],
    ["👥", () => "演示多个数字员工如何一起完成任务", ({ outcome }) => `展示任务拆分、协作进度、交付物和幕僚长汇总，最终指向${outcome}`],
    ["⏸", () => "演示遇到信息不足时如何暂停并询问我", () => "展示缺少授权、数据或关键条件时的暂停机制，以及恢复任务的入口"],
    ["🛟", () => "演示遇到风险时如何交给人工", () => "展示风险识别、停止自动动作、保留上下文和人工接管的流程"],
    ["📁", () => "演示任务完成后会交付哪些结果", () => "展示进度记录、数据表、内容材料、结论摘要和下一步建议的归档方式"]
  ]
});

function promptWorkflowKey(tab, index) {
  if (index === 0) return "recommended";
  if (index === 1) return "discover";
  if (index === 2) return "engage";
  if (index === 3) return "content";
  if (index === 4) return "review";
  return "demo";
}

export function domainPromptTabs(domainId) {
  return [...(DOMAIN_PROMPT_CONTEXT[domainId]?.tabs || DOMAIN_PROMPT_CONTEXT.sales.tabs)];
}

export function domainPromptItems(domainId, tab = "推荐") {
  const domain = SALES_DOMAINS.find(({ id }) => id === domainId) || SALES_DOMAINS[0];
  const context = DOMAIN_PROMPT_CONTEXT[domain.id] || DOMAIN_PROMPT_CONTEXT.sales;
  const tabs = domainPromptTabs(domain.id);
  const tabIndex = Math.max(0, tabs.indexOf(tab));
  const workflow = promptWorkflowKey(tab, tabIndex);
  if (workflow === "recommended") {
    return domain.skills.map(([icon, title, description]) => ({
      icon,
      title: `帮我${description}`,
      description,
      prompt: buildWorkflowPrompt(domain.id, description),
      capability: title
    }));
  }
  return WORKFLOW_PROMPT_ITEMS[workflow].map(([icon, title, description]) => {
    const resolvedTitle = title(context);
    const resolvedDescription = description(context);
    return {
      icon,
      title: resolvedTitle,
      description: resolvedDescription,
      prompt: buildWorkflowPrompt(domain.id, resolvedTitle)
    };
  });
}

const EMPLOYEE_PROMPT_BLUEPRINTS = Object.freeze({
  "Browser Agent": [
    ["🎯", ({ employeeName, subject }) => `让${employeeName}找出最值得优先处理的${subject}`, ({ signals }) => `从${signals}中筛选真实意向信号，给出名单、优先级和原始依据`],
    ["🔎", ({ employeeName }) => `让${employeeName}监控最新互动，识别正在升温的客户`, ({ signals }) => `持续观察${signals}，标注新出现的车型、预算、时间和主动咨询信号`],
    ["📋", ({ employeeName, subject }) => `让${employeeName}整理一份带证据的${subject}清单`, ({ signals }) => `清洗${signals}中的重复记录，保留来源、时间和判断依据`],
    ["⚡", ({ employeeName }) => `让${employeeName}告诉我今天先跟进谁`, ({ signals }) => `结合${signals}的最新变化排出今日优先级，并说明暂不跟进的原因`]
  ],
  "File Agent": [
    ["✉️", ({ employeeName, subject }) => `让${employeeName}为${subject}写一套首触话术`, ({ signals }) => `根据${signals}中的已知信息生成个性化版本，并标出需要人工确认的部分`],
    ["🧩", ({ employeeName }) => `让${employeeName}把客户信息改写成可直接发送的内容`, ({ signals }) => `提炼${signals}里的关键需求，分别生成破冰、跟进和异议回应版本`],
    ["🗓️", ({ employeeName }) => `让${employeeName}安排一套 3 天沟通节奏`, ({ outcome }) => `围绕${outcome}安排每天的内容、发送条件和停止条件`],
    ["📦", ({ employeeName }) => `让${employeeName}沉淀一套可复用话术库`, ({ signals }) => `从${signals}中归纳高频问题和有效表达，标注适用场景与风险`]
  ],
  "Search Agent": [
    ["📊", ({ employeeName }) => `让${employeeName}算清最近的线索漏斗`, ({ signals }) => `汇总${signals}中的新增、触达、回复和成交数据，统一统计口径并标注缺口`],
    ["📈", ({ employeeName, outcome }) => `让${employeeName}找出影响${outcome}的关键变化`, ({ signals }) => `对照${signals}中的事实数据，拆解转化变化、卡点和可能原因`],
    ["🧭", ({ employeeName }) => `让${employeeName}给下一周的资源投入排优先级`, ({ signals }) => `比较${signals}的质量、成本和转化效率，说明建议依据`],
    ["📝", ({ employeeName }) => `让${employeeName}生成一份可核验的周报`, ({ signals }) => `把${signals}汇总成结论、证据、未解决问题和下一步动作`]
  ],
  "App Agent": [
    ["📞", ({ employeeName }) => `让${employeeName}整理今天要联系的客户`, ({ signals }) => `根据${signals}和跟进时效排出今日队列，为每家标注下一步动作`],
    ["💬", ({ employeeName }) => `让${employeeName}准备每位客户的跟进切入点`, ({ signals }) => `结合${signals}生成一句自然的开场和一个需要确认的问题`],
    ["⏰", ({ employeeName }) => `让${employeeName}找出超过 3 天未跟进的客户`, ({ signals }) => `核对${signals}中的最后联系时间和当前阶段，区分可唤醒与应暂停对象`],
    ["🛟", ({ employeeName }) => `让${employeeName}识别需要人工接管的对话`, ({ signals }) => `从${signals}中标注投诉、承诺、价格审批和高意向成交节点，保留完整上下文`]
  ]
});

export function employeePromptItems(domainId, selection = 0) {
  const domain = SALES_DOMAINS.find(({ id }) => id === domainId) || SALES_DOMAINS[0];
  const context = DOMAIN_PROMPT_CONTEXT[domain.id] || DOMAIN_PROMPT_CONTEXT.sales;
  const choices = domainEmployeeChoices(domain);
  const choice = typeof selection === "string"
    ? choices.find(({ agent }) => agent.id === selection || agent.name === selection)
    : choices.find(({ skillIndex }) => skillIndex === selection);
  const selected = choice || choices[0];
  const skillRows = selected?.skillIndexes?.map((index) => domain.skills[index]).filter(Boolean) || [domain.skills[0]];
  const [skillIcon, skillName, skillDescription] = skillRows[0];
  const employeeName = selected?.agent.name || quickAgentFor(skillName, skillDescription).name;
  const skillNames = skillRows.map(([, name]) => name).join("、");
  const employeeContext = { ...context, employeeName };
  const blueprints = EMPLOYEE_PROMPT_BLUEPRINTS[selected?.agent.id] || EMPLOYEE_PROMPT_BLUEPRINTS["Browser Agent"];
  return blueprints.map(([icon, title, description]) => {
    const resolvedTitle = title(employeeContext);
    const resolvedDescription = `${employeeName}负责${skillNames}：${skillDescription}。${description(employeeContext)}`;
    return {
      icon: icon || skillIcon,
      title: resolvedTitle,
      description: resolvedDescription,
      prompt: buildWorkflowPrompt(domain.id, resolvedTitle),
      capability: skillNames,
      employeeName
    };
  });
}

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

export function domainPromptPlaceholder(domainId = SALES_DOMAINS[0].id) {
  const workflow = DOMAIN_WORKFLOW_CONTEXT[domainId] || DOMAIN_WORKFLOW_CONTEXT.sales;
  return buildWorkflowPrompt(domainId, workflow.example);
}

const PROMPT_TAB_TEXT = domainPromptPlaceholder();

function fillEditor(text, target = null) {
  const editor = target || document.querySelector(".ProseMirror");
  if (!editor) return;
  try {
    editor.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(editor);
    document.execCommand("delete", false);
    document.execCommand("insertText", false, text);
    // 光标移到末尾
    sel.selectAllChildren(editor);
    sel.collapseToEnd();
    editor.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch { /* 填充失败不阻塞 */ }
}

function appendEditorText(text, target = null) {
  const editor = target || document.querySelector(".ProseMirror");
  if (!editor || !text) return;
  try {
    editor.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(editor);
    sel.collapseToEnd();
    document.execCommand("insertText", false, `${editor.textContent.trim() ? " " : ""}${text}`);
  } catch { /* 语音填充失败不阻塞输入 */ }
}

function bindPromptTab(input) {
  const editor = input?.querySelector(".ProseMirror");
  if (!editor || editor.dataset.sbTabBound === "1") return;
  editor.dataset.sbTabBound = "1";
  editor.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.isComposing) return;
    const currentText = (editor.textContent || "").replace(/\u200B/g, "").trim();
    if (currentText) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    fillEditor(input.dataset.sbPromptPlaceholder || PROMPT_TAB_TEXT, editor);
  }, true);
}

const INPUT_GLOBE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z"></path></svg>';
const INPUT_MIC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>';

let activeInputRecognition = null;
let inputNoticeTimer = null;

function showInputNotice(message) {
  document.querySelector(".sb-input-notice")?.remove();
  const notice = el("div", "sb-input-notice", message);
  document.body.appendChild(notice);
  clearTimeout(inputNoticeTimer);
  inputNoticeTimer = setTimeout(() => notice.remove(), 2600);
}

function emitInputOptions(input, online) {
  input.dataset.sbOnline = String(online);
  document.dispatchEvent(new CustomEvent("salebuddy:input-options", {
    detail: { online, voice: input.dataset.sbVoiceListening === "true" }
  }));
}

function stopInputRecognition() {
  if (!activeInputRecognition) return;
  const recognition = activeInputRecognition;
  activeInputRecognition = null;
  try { recognition.stop(); } catch { /* recognition may already be idle */ }
  document.querySelectorAll('[data-option="voice"]').forEach((button) => {
    button.dataset.listening = "false";
    button.setAttribute("aria-pressed", "false");
    button.title = "语音输入";
  });
  document.querySelectorAll(".semi-aiChatInput[data-sb-voice-listening]").forEach((input) => {
    input.dataset.sbVoiceListening = "false";
  });
}

function startVoiceInput(input, button) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    button.dataset.unsupported = "true";
    button.title = "当前浏览器不支持语音输入";
    showInputNotice("当前浏览器不支持语音输入");
    return;
  }
  if (activeInputRecognition) {
    stopInputRecognition();
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;
  activeInputRecognition = recognition;
  input.dataset.sbVoiceListening = "true";
  button.dataset.listening = "true";
  button.setAttribute("aria-pressed", "true");
  button.title = "停止语音输入";
  recognition.onresult = (event) => {
    const transcript = [...event.results].map((result) => result[0]?.transcript || "").join("").trim();
    if (transcript) appendEditorText(transcript, input.querySelector(".ProseMirror"));
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted") showInputNotice(event.error === "not-allowed" ? "麦克风权限未开启" : "语音识别暂时不可用");
  };
  recognition.onend = () => {
    if (activeInputRecognition !== recognition) return;
    activeInputRecognition = null;
    input.dataset.sbVoiceListening = "false";
    button.dataset.listening = "false";
    button.setAttribute("aria-pressed", "false");
    button.title = "语音输入";
    emitInputOptions(input, input.dataset.sbOnline === "true");
  };
  try { recognition.start(); } catch { stopInputRecognition(); }
}

function buildInputOption(input, { key, label, icon, onClick }) {
  const button = el("button", "sb-input-option");
  button.type = "button";
  button.dataset.option = key;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.title = label;
  button.innerHTML = icon;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}

function bindInputOptions(input) {
  const actionArea = input?.querySelector(".semi-aiChatInput-footer-action");
  if (!actionArea || actionArea.querySelector('[data-sb-input-options="1"]')) return;
  const send = actionArea.querySelector(".semi-aiChatInput-footer-action-send, .semi-aiChatInput-footer-action-stop");
  if (!send) return;
  const options = el("span", "sb-input-options");
  options.dataset.sbInputOptions = "1";
  const online = buildInputOption(input, {
    key: "online",
    label: "开启联网",
    icon: INPUT_GLOBE_ICON,
    onClick: (button) => {
      const enabled = input.dataset.sbOnline !== "true";
      button.dataset.active = String(enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.title = enabled ? "关闭联网" : "开启联网";
      emitInputOptions(input, enabled);
    }
  });
  const onlineEnabled = input.dataset.sbOnline === "true";
  online.dataset.active = String(onlineEnabled);
  online.setAttribute("aria-pressed", String(onlineEnabled));
  online.title = onlineEnabled ? "关闭联网" : "开启联网";
  const voice = buildInputOption(input, {
    key: "voice",
    label: "语音输入",
    icon: INPUT_MIC_ICON,
    onClick: () => startVoiceInput(input, voice)
  });
  options.append(online, voice);
  actionArea.insertBefore(options, send);
}

function buildQuickRail(domain = SALES_DOMAINS[0], { selectedEmployeeId = null, onEmployeeSelect = null } = {}) {
  const rail = el("div", "sb-feed-quick");
  domainEmployeeChoices(domain).forEach((choice) => {
    const { icon, title, task, skillIndex, agent } = choice;
    const item = el("button", "sb-feed-quick-card");
    item.type = "button";
    item.title = task;
    item.dataset.employeeId = agent.id;
    item.setAttribute("aria-pressed", String(agent.id === selectedEmployeeId));
    if (agent.id === selectedEmployeeId) item.dataset.active = "true";
    item.setAttribute("aria-label", `选择数字员工${agent.name}，查看${title}提示词`);
    const [bg] = TONES[skillIndex % TONES.length];
    const iconEl = el("span", "sb-feed-quick-icon", icon);
    iconEl.style.background = bg;
    mountAgentAvatar(iconEl, agent.id, { alt: `${agent.name}头像` });
    const copy = el("span", "sb-feed-quick-copy");
    copy.append(el("span", "sb-feed-quick-name", agent.name));
    if (title !== agent.name) copy.append(el("span", "sb-feed-quick-task", title));
    item.append(iconEl, copy);
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      onEmployeeSelect?.(agent.id);
    });
    rail.appendChild(item);
  });
  const more = el("button", "sb-feed-quick-card");
  more.type = "button";
  more.setAttribute("aria-label", "查看更多数字员工提示词");
  more.append(el("span", "sb-feed-quick-icon", "＋"), el("span", "sb-feed-quick-label", "查看更多"));
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    document.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { mode: "agentSquare", active: true } }));
    openAgentSquarePage({
      onClose: () => document.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { mode: "agentSquare", active: false } }))
    });
  });
  rail.appendChild(more);

  let dragStartX = 0;
  let dragStartScroll = 0;
  let didDrag = false;
  rail.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    dragStartX = event.clientX;
    dragStartScroll = rail.scrollLeft;
    didDrag = false;
    rail.dataset.dragging = "true";
    rail.setPointerCapture?.(event.pointerId);
  });
  rail.addEventListener("pointermove", (event) => {
    if (rail.dataset.dragging !== "true") return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) > 4) didDrag = true;
    if (didDrag) rail.scrollLeft = dragStartScroll - delta;
  });
  const endDrag = (event) => {
    if (rail.dataset.dragging !== "true") return;
    rail.dataset.dragging = "false";
    rail.releasePointerCapture?.(event.pointerId);
  };
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);
  rail.addEventListener("click", (event) => {
    if (!didDrag) return;
    event.preventDefault();
    event.stopPropagation();
    didDrag = false;
  }, true);
  return rail;
}

const QUICK_AGENT_NAMES = Object.freeze({
  main: "幕僚长",
  "Browser Agent": "线索猎人",
  "Search Agent": "数据分析师",
  "App Agent": "销售顾问",
  "File Agent": "内容策划"
});

const QUICK_AGENT_BY_TITLE = Object.freeze({
  "线索猎人": "Browser Agent",
  "抖音买车线索猎人": "Browser Agent",
  "首触话术生成": "File Agent",
  "本周线索漏斗周报": "Search Agent",
  "线索漏斗周报": "Search Agent"
});

function quickAgentFor(title, task = "") {
  const source = `${title} ${task}`;
  let id = QUICK_AGENT_BY_TITLE[title] || "main";
  if (id !== "main") return { id, name: QUICK_AGENT_NAMES[id] };
  if (/线索|潜客|客户|商机|候选人|学员|需求|合作|粉丝|直播/.test(source)) id = "Browser Agent";
  if (/数据|漏斗|周报|复盘|分析|ROI|经营|效果|流失|目标|画像/.test(source)) id = "Search Agent";
  if (/内容|脚本|文案|方案|录音|会议|培训|物料|分享/.test(source)) id = "File Agent";
  if (/沟通|触达|跟进|客服|客诉|报名|续费|电话/.test(source)) id = "App Agent";
  return { id, name: QUICK_AGENT_NAMES[id] || "幕僚长" };
}

export function domainEmployeeChoices(domain = SALES_DOMAINS[0]) {
  const byAgent = new Map();
  domain.skills.forEach(([icon, skillTitle, task], skillIndex) => {
    const agent = quickAgentFor(skillTitle, task);
    const existing = byAgent.get(agent.id);
    if (existing) {
      existing.skillIndexes.push(skillIndex);
      return;
    }
    byAgent.set(agent.id, { icon, title: skillTitle, task, skillIndex, skillIndexes: [skillIndex], agent });
  });
  return [...byAgent.values()];
}

const CONNECTOR_STORAGE_KEY = "byering.knowledge-connectors";
export const KNOWLEDGE_CONNECTORS = Object.freeze([
  { id: "feishu", name: "飞书云文档", category: "协作办公", description: "同步文档、知识库与多维表格", logo: new URL("../../../assets/connectors/feishu.png", import.meta.url).href },
  { id: "tencent-docs", name: "腾讯文档", category: "协作办公", description: "访问在线文档、表格与文件", logo: new URL("../../../assets/connectors/tencent-docs.png", import.meta.url).href },
  { id: "yuque", name: "语雀", category: "知识管理", description: "接入知识库、文档与团队目录", logo: new URL("../../../assets/connectors/yuque.svg", import.meta.url).href },
  { id: "wps", name: "WPS 云文档", category: "办公套件", description: "连接云端文档、表格与演示", logo: new URL("../../../assets/connectors/wps.png", import.meta.url).href },
  { id: "shimo", name: "石墨文档", category: "协作办公", description: "同步团队文档和知识资料", logo: new URL("../../../assets/connectors/shimo.png", import.meta.url).href },
  { id: "baidu-netdisk", name: "百度网盘", category: "云端存储", description: "接入云端文件夹中的知识资料", logo: new URL("../../../assets/connectors/baidu-netdisk.png", import.meta.url).href }
]);

let connectorModal = null;

const SETTINGS_ICONS = Object.freeze({
  plan: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 6 6-6 10-6-10z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m4 8 6 2 6-2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  credits: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 1.5 5.2L17 9l-5.5 1.8L10 16l-1.5-5.2L3 9l5.5-1.8z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg>',
  payment: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.35"/><path d="M3 8h14" stroke="currentColor" stroke-width="1.35"/></svg>',
  connectors: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v5m0 4v5M14 3v5m0 4v5M3 8h6a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h4M3 12h3" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.5" r="3" fill="none" stroke="currentColor" stroke-width="1.35"/><path d="M4.5 17c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
  billing: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2.5h12v15l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>',
  notice: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 14.5h12l-1.3-2V8a4.7 4.7 0 0 0-9.4 0v4.5z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M8 17h4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>'
});

function setSvgIcon(node, svg) {
  node.innerHTML = svg;
}

function connectedConnectorIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONNECTOR_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function setConnectorConnected(id) {
  const ids = connectedConnectorIds();
  ids.add(id);
  try { window.localStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify([...ids])); } catch { /* local storage may be unavailable */ }
}

function updateStripConnectorState() {
  const connected = connectedConnectorIds();
  document.querySelectorAll(".sb-feed-connect-app[data-connector-id]").forEach((app) => {
    const isConnected = connected.has(app.dataset.connectorId);
    app.dataset.connected = String(isConnected);
    app.title = `${app.dataset.connectorName}：${isConnected ? "已接入" : "打开授权设置"}`;
  });
}

function openConnectorModal(gateway = null) {
  connectorModal?.remove();
  const root = el("div", "sb-connector-modal");
  const dialog = el("div", "sb-connector-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "sb-settings-title");
  const sidebar = el("aside", "sb-connector-sidebar");
  sidebar.appendChild(el("h2", "sb-connector-sidebar-title", "设置"));
  const sidebarNav = el("nav", "sb-connector-sidebar-nav");
  const sections = [["plan", "订阅套餐"], ["credits", "充值积分"], ["payment", "支付方式"], ["connectors", "连接器"], ["profile", "主 Agent 记忆"], ["billing", "账单记录"], ["notice", "通知公告"]];
  const sectionItems = new Map();
  sections.forEach(([iconName, label]) => {
    const item = el("button", "sb-connector-sidebar-item");
    item.type = "button";
    item.dataset.settingsSection = label;
    const icon = el("span", "sb-connector-sidebar-icon");
    setSvgIcon(icon, SETTINGS_ICONS[iconName]);
    item.append(icon, el("span", "sb-connector-sidebar-label", label));
    sectionItems.set(label, item);
    sidebarNav.appendChild(item);
  });
  sidebar.appendChild(sidebarNav);

  const content = el("main", "sb-connector-content");
  const close = el("button", "sb-connector-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "关闭设置");
  const mobileNav = el("select", "sb-settings-mobile-nav");
  sections.forEach(([, label]) => { const option = document.createElement("option"); option.value = label; option.textContent = label; mobileNav.appendChild(option); });
  const page = el("div", "sb-settings-page");
  content.append(close, mobileNav, page);
  dialog.append(sidebar, content);
  root.appendChild(dialog);

  const SETTINGS_STATE_KEY = "byering.settings-state";
  const fallbackState = {
    plan: "专业版",
    credits: 1280,
    selectedCredit: 500,
    profile: { name: "鸿扬", company: "Byering 工作台", role: "销售负责人", email: "hongyang@example.com", bio: "负责销售团队的线索运营与客户触达。" },
    mainMemory: {
      identity: { name: "鸿扬", organization: "Byering 工作台", title: "销售负责人", bio: "负责销售团队的线索运营与客户触达。", languageStyle: "中文，清晰直接，先给结论再说明依据。", signature: "" },
      soul: { principles: ["先理解目标，再拆解执行", "质量不达标不交付"], deliveryStandard: "交付内容要可执行、可复盘，关键结论附上依据。" },
      scope: { forbiddenZones: ["未经确认不代表我做出承诺", "不触碰用户私人文件"] }
    },
    mainMemories: [],
    customConnectors: [],
    payments: [{ id: "visa-4242", brand: "VISA", title: "Visa •••• 4242", meta: "到期 08/28", primary: true }],
    billing: [
      { id: "bill-20260801-plan", date: "2026/08/01", title: "专业版订阅", amount: "¥199.00", status: "已支付" },
      { id: "bill-20260724-credit", date: "2026/07/24", title: "积分充值 · 1,000", amount: "¥100.00", status: "已支付" },
      { id: "bill-20260701-plan", date: "2026/07/01", title: "专业版订阅", amount: "¥199.00", status: "已支付" }
    ],
    notices: [
      { id: "n1", title: "连接器同步策略更新", body: "新增按项目组刷新知识库的权限控制，已接入的连接器无需重新授权。", time: "今天 09:30", read: false },
      { id: "n2", title: "专业版额度已刷新", body: "本月包含的自动任务额度已于 8 月 1 日恢复。", time: "8 月 1 日", read: true },
      { id: "n3", title: "销售工作台使用指南", body: "现在可以在任务输入框中启用联网检索和语音输入。", time: "7 月 28 日", read: true }
    ]
  };
  let state = fallbackState;
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_STATE_KEY) || "null");
    if (saved && typeof saved === "object") state = { ...fallbackState, ...saved, profile: { ...fallbackState.profile, ...saved.profile }, mainMemory: { ...fallbackState.mainMemory, ...saved.mainMemory, identity: { ...fallbackState.mainMemory.identity, ...saved.mainMemory?.identity }, soul: { ...fallbackState.mainMemory.soul, ...saved.mainMemory?.soul }, scope: { ...fallbackState.mainMemory.scope, ...saved.mainMemory?.scope } }, mainMemories: Array.isArray(saved.mainMemories) ? saved.mainMemories : fallbackState.mainMemories, customConnectors: Array.isArray(saved.customConnectors) ? saved.customConnectors : fallbackState.customConnectors, payments: Array.isArray(saved.payments) ? saved.payments : fallbackState.payments, billing: Array.isArray(saved.billing) ? saved.billing : fallbackState.billing, notices: Array.isArray(saved.notices) ? saved.notices : fallbackState.notices };
  } catch { /* local storage may be unavailable */ }
  const persistState = () => { try { window.localStorage.setItem(SETTINGS_STATE_KEY, JSON.stringify(state)); } catch { /* local storage may be unavailable */ } };
  let searchInput = null;
  let sectionTitle = null;
  let list = null;
  // Each section render gets a monotonically increasing version. Async views
  // must verify it before committing results, otherwise a slow memory fetch
  // can overwrite a page the user has already switched away from.
  let renderVersion = 0;
  let activeSection = "连接器";

  const closeModal = () => {
    document.removeEventListener("keydown", onKeyDown);
    root.remove();
    if (connectorModal === root) connectorModal = null;
  };
  const onKeyDown = (event) => { if (event.key === "Escape") closeModal(); };
  close.addEventListener("click", closeModal);
  root.addEventListener("click", (event) => { if (event.target === root) closeModal(); });
  document.addEventListener("keydown", onKeyDown);

  let noticeTimer = null;
  function showNotice(message) {
    content.querySelector(".sb-connector-notice")?.remove();
    const notice = el("div", "sb-connector-notice", message);
    content.appendChild(notice);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.remove(), 2600);
  }

  const makeButton = (label, className = "sb-settings-secondary") => {
    const button = el("button", className, label);
    button.type = "button";
    return button;
  };

  function buildHeader(title, subtitle, actionLabel, onAction) {
    const head = el("div", "sb-settings-head");
    const copy = el("div", "sb-settings-head-copy");
    const titleNode = el("h1", "sb-settings-title", title);
    titleNode.id = "sb-settings-title";
    copy.append(titleNode, el("p", "sb-settings-subtitle", subtitle));
    head.appendChild(copy);
    if (actionLabel) {
      const action = makeButton(actionLabel, "sb-settings-head-action");
      action.addEventListener("click", onAction);
      head.appendChild(action);
    }
    return head;
  }

  function renderPlan() {
    page.append(
      buildHeader("订阅套餐", "根据团队规模选择合适的工作台能力。当前方案可随时调整。"),
      el("p", "sb-settings-eyebrow", "当前方案")
    );
    const current = el("section", "sb-settings-card sb-settings-card-accent");
    current.append(el("h2", "sb-settings-card-title", `${state.plan} · 下次续费 2026/09/01`), el("p", "sb-settings-card-copy", "已包含 4 个销售 Agent、联网检索和项目组协作。"));
    const metric = el("div", "sb-settings-metric");
    metric.append(el("strong", "", `${state.credits.toLocaleString("zh-CN")}`), el("span", "", "积分余额"));
    current.append(metric);
    page.appendChild(current);
    const grid = el("div", "sb-settings-grid three");
    [{ name: "基础版", price: "¥0", copy: "适合个人试用", features: ["1 个项目组", "每月 100 积分", "基础知识库"] }, { name: "专业版", price: "¥199", copy: "适合销售团队", features: ["10 个项目组", "每月 5,000 积分", "联网检索与连接器"] }, { name: "企业版", price: "¥699", copy: "适合多团队协作", features: ["无限项目组", "专属额度与权限", "优先支持与审计"] }].forEach((plan) => {
      const card = el("article", `sb-plan-card${plan.name === state.plan ? " current" : ""}${plan.name === "专业版" ? " featured" : ""}`);
      card.append(el("h2", "sb-settings-card-title", plan.name), el("p", "sb-settings-card-copy", plan.copy));
      const price = el("div", "sb-plan-price");
      price.append(el("strong", "", plan.price), el("span", "", "/月"));
      card.appendChild(price);
      const features = el("ul", "sb-plan-features");
      plan.features.forEach((feature) => features.appendChild(el("li", "", feature)));
      card.appendChild(features);
      const actions = el("div", "sb-settings-actions");
      const button = makeButton(plan.name === state.plan ? "当前方案" : `选择${plan.name}`, plan.name === state.plan ? "sb-settings-secondary" : "sb-settings-primary");
      button.disabled = plan.name === state.plan;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = gateway ? await gateway.action("billing.plan.update", { plan: plan.name }) : null;
          state.plan = result?.data?.settings?.plan || plan.name;
          if (result?.data?.settings) state = { ...state, ...result.data.settings };
          persistState();
          renderSection("订阅套餐");
          showNotice(`已切换至${plan.name}`);
        } catch {
          button.disabled = false;
          showNotice("方案切换失败，请稍后重试");
        }
      });
      actions.appendChild(button);
      card.appendChild(actions);
      grid.appendChild(card);
    });
    page.appendChild(grid);
  }

  function renderCredits() {
    page.append(buildHeader("充值积分", "积分用于联网检索、自动任务和内容生成，充值后立即到账。"));
    const summary = el("section", "sb-settings-card sb-settings-card-accent");
    summary.append(el("h2", "sb-settings-card-title", "可用积分"));
    const metric = el("div", "sb-settings-metric");
    metric.append(el("strong", "", state.credits.toLocaleString("zh-CN")), el("span", "", "积分"));
    summary.appendChild(metric);
    page.appendChild(summary);
    const card = el("section", "sb-settings-card white");
    card.append(el("h2", "sb-settings-section-title", "选择充值额度"), el("p", "sb-settings-muted", "每 1 元兑换 10 积分，支付成功后自动刷新。"));
    const picker = el("div", "sb-credit-picker");
    [100, 500, 1000, 3000].forEach((amount) => {
      const button = makeButton(`${amount} 积分`, "sb-credit-option");
      button.dataset.active = String(state.selectedCredit === amount);
      button.addEventListener("click", () => { state.selectedCredit = amount; renderSection("充值积分"); });
      picker.appendChild(button);
    });
    card.appendChild(picker);
    const actions = el("div", "sb-settings-actions");
    const recharge = makeButton(`充值 ¥${Math.round(state.selectedCredit / 10)}`, "sb-settings-primary");
    recharge.addEventListener("click", async () => {
      const amount = state.selectedCredit;
      recharge.disabled = true;
      try {
        const result = gateway ? await gateway.action("billing.credits.recharge", { amount }) : null;
        if (result?.data?.settings) state = { ...state, ...result.data.settings };
        else {
          state.credits += amount;
          state.billing = [{ id: `bill-${Date.now()}`, date: new Date().toLocaleDateString("zh-CN").replaceAll(".", "/"), title: `积分充值 · ${amount.toLocaleString("zh-CN")}`, amount: `¥${Math.round(amount / 10)}.00`, status: "已支付" }, ...(state.billing || [])];
        }
        persistState();
        renderSection("充值积分");
        showNotice(`充值成功，已到账 ${amount} 积分`);
      } catch {
        recharge.disabled = false;
        showNotice("充值失败，请检查支付方式后重试");
      }
    });
    const history = makeButton("查看充值记录");
    history.addEventListener("click", () => renderSection("账单记录"));
    actions.append(recharge, history);
    card.appendChild(actions);
    page.appendChild(card);
  }

  function renderPayment() {
    page.append(buildHeader("支付方式", "管理用于订阅和充值的支付方式。"));
    const card = el("section", "sb-settings-card white");
    const titleRow = el("div", "sb-settings-head");
    titleRow.append(el("h2", "sb-settings-section-title", "已保存的支付方式"));
    const add = makeButton("添加支付方式", "sb-settings-secondary");
    titleRow.appendChild(add);
    card.appendChild(titleRow);
    const list = el("div", "");
    const renderPayments = () => {
      list.textContent = "";
      state.payments.forEach((payment) => {
        const row = el("div", "sb-payment-row");
        row.append(el("span", "sb-payment-brand", payment.brand), el("div", "sb-payment-copy"));
        const copy = row.querySelector(".sb-payment-copy");
        copy.append(el("div", "sb-payment-title", payment.title), el("div", "sb-payment-meta", payment.meta));
        if (payment.primary) copy.appendChild(el("span", "sb-settings-tag", "默认"));
        const actions = el("div", "sb-payment-actions");
        if (!payment.primary) {
          const setDefault = makeButton("设为默认");
          setDefault.addEventListener("click", async () => {
            setDefault.disabled = true;
            try {
              const result = gateway ? await gateway.action("billing.payment.default", { paymentId: payment.id }) : null;
              if (result?.data?.settings) state = { ...state, ...result.data.settings };
              else state.payments.forEach((item) => { item.primary = item.id === payment.id; });
              persistState(); renderPayments(); showNotice("默认支付方式已更新");
            } catch { setDefault.disabled = false; showNotice("默认支付方式更新失败"); }
          });
          actions.appendChild(setDefault);
        }
        const remove = makeButton("移除", "sb-settings-danger");
        remove.addEventListener("click", async () => {
          if (payment.primary) { showNotice("请先设置其他默认支付方式"); return; }
          remove.disabled = true;
          try {
            const result = gateway ? await gateway.action("billing.payment.remove", { paymentId: payment.id }) : null;
            if (result?.data?.settings) state = { ...state, ...result.data.settings };
            else state.payments = state.payments.filter((item) => item.id !== payment.id);
            persistState(); renderPayments(); showNotice("支付方式已移除");
          } catch { remove.disabled = false; showNotice("支付方式移除失败"); }
        });
        actions.appendChild(remove);
        row.appendChild(actions);
        list.appendChild(row);
      });
    };
    renderPayments();
    card.appendChild(list);
    const addForm = el("form", "sb-settings-form");
    addForm.hidden = true;
    const fields = el("div", "sb-settings-form-grid");
    const number = el("label", "sb-settings-field", "卡号");
    const numberInput = el("input"); numberInput.inputMode = "numeric"; numberInput.placeholder = "•••• •••• •••• 1234"; number.appendChild(numberInput);
    const expiry = el("label", "sb-settings-field", "有效期");
    const expiryInput = el("input"); expiryInput.placeholder = "08/28"; expiry.appendChild(expiryInput);
    fields.append(number, expiry);
    const formActions = el("div", "sb-settings-actions");
    const save = makeButton("保存支付方式", "sb-settings-primary"); save.type = "submit";
    formActions.appendChild(save); addForm.append(fields, formActions); card.appendChild(addForm);
    add.addEventListener("click", () => { addForm.hidden = !addForm.hidden; if (!addForm.hidden) numberInput.focus(); });
    addForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const digits = numberInput.value.replace(/\D/g, "");
      if (digits.length < 4) { showNotice("请输入完整卡号"); return; }
      save.disabled = true;
      try {
        const result = gateway ? await gateway.action("billing.payment.add", { last4: digits.slice(-4), expiry: expiryInput.value || "未填写" }) : null;
        if (result?.data?.settings) state = { ...state, ...result.data.settings };
        else state.payments.push({ id: `card-${Date.now()}`, brand: "CARD", title: `银行卡 •••• ${digits.slice(-4)}`, meta: `到期 ${expiryInput.value || "未填写"}`, primary: state.payments.length === 0 });
        persistState(); renderSection("支付方式"); showNotice("支付方式已保存");
      } catch { save.disabled = false; showNotice("支付方式保存失败"); }
    });
    page.appendChild(card);
  }

  async function renderProfile(viewVersion) {
    page.append(buildHeader("主 Agent 记忆", "配置主 Agent 对你的背景、偏好和长期规则的理解。"));
    const loading = el("div", "sb-memory-loading", "正在读取主 Agent 记忆…");
    page.appendChild(loading);
    let profile = state.mainMemory;
    let memories = Array.isArray(state.mainMemories) ? state.mainMemories : [];
    if (gateway) {
      try {
        const [profileResult, memoryResult] = await Promise.all([
          gateway.action("agent.profile.get", { agentType: "main" }),
          gateway.action("agent.memory.list", { agentType: "main" })
        ]);
        const remoteProfile = profileResult?.data?.profile;
        if (remoteProfile) profile = {
          ...state.mainMemory,
          ...remoteProfile,
          identity: { ...state.mainMemory.identity, ...remoteProfile.identity },
          soul: { ...state.mainMemory.soul, ...remoteProfile.soul },
          role: { ...(state.mainMemory.role || {}), ...(remoteProfile.role || {}) },
          scope: { ...state.mainMemory.scope, ...remoteProfile.scope }
        };
        if (Array.isArray(memoryResult?.data?.entries)) {
          const remoteEntries = memoryResult.data.entries;
          const remoteIds = new Set(remoteEntries.map((entry) => entry.id));
          const localPending = memories.filter((entry) => entry.status !== "rolled-back" && entry.id && !remoteIds.has(entry.id));
          memories = [...remoteEntries, ...localPending];
        }
      } catch { /* keep local fallback */ }
    }
    if (!page.isConnected || viewVersion !== renderVersion) return;
    loading.remove();
    state.mainMemory = profile;
    state.mainMemories = memories;
    const name = profile.identity?.name || state.profile.name || "鸿扬";
    const role = profile.role?.position || profile.identity?.title || state.profile.role || "销售负责人";
    const profileCard = el("section", "sb-settings-card white");
    const profileHead = el("div", "sb-memory-head");
    profileHead.append(el("div", "sb-profile-avatar", name.slice(0, 1)), el("div", "sb-memory-head-copy"));
    const profileCopy = profileHead.lastChild;
    profileCopy.append(el("div", "sb-profile-name", name), el("div", "sb-memory-status", gateway ? "已连接主 Agent · 保存后实时生效" : "本地模式 · 连接 gateway 后会同步到主 Agent"));
    profileCard.appendChild(profileHead);
    const form = el("form", "sb-settings-form");
    const fields = el("div", "sb-settings-form-grid");
    const makeField = (label, nameKey, value, type = "text") => { const field = el("label", "sb-settings-field", label); const input = el("input"); input.type = type; input.value = value || ""; input.name = nameKey; field.appendChild(input); return field; };
    fields.append(
      makeField("称呼", "name", name),
      makeField("公司 / 团队", "organization", profile.identity?.organization || state.profile.company),
      makeField("职位 / 角色", "role", role),
      makeField("默认语言与语气", "languageStyle", profile.identity?.languageStyle)
    );
    const bio = el("label", "sb-settings-field", "业务背景");
    const bioInput = el("textarea"); bioInput.name = "bio"; bioInput.value = profile.identity?.bio || state.profile.bio || ""; bio.appendChild(bioInput);
    const signature = el("label", "sb-settings-field", "默认署名（可选）");
    const signatureInput = el("input"); signatureInput.name = "signature"; signatureInput.value = profile.identity?.signature || ""; signature.appendChild(signatureInput);
    const principles = el("label", "sb-settings-field", "长期工作原则（每行一条）");
    const principlesInput = el("textarea"); principlesInput.name = "principles"; principlesInput.value = (profile.soul?.principles || []).join("\n"); principles.appendChild(principlesInput);
    const delivery = el("label", "sb-settings-field", "交付标准");
    const deliveryInput = el("textarea"); deliveryInput.name = "deliveryStandard"; deliveryInput.value = profile.soul?.deliveryStandard || ""; delivery.appendChild(deliveryInput);
    const forbidden = el("label", "sb-settings-field", "重要禁区（每行一条）");
    const forbiddenInput = el("textarea"); forbiddenInput.name = "forbiddenZones"; forbiddenInput.value = (profile.scope?.forbiddenZones || []).join("\n"); forbidden.appendChild(forbiddenInput);
    const actions = el("div", "sb-settings-actions");
    const save = makeButton("保存主记忆", "sb-settings-primary"); save.type = "submit"; actions.appendChild(save);
    form.append(fields, bio, signature, principles, delivery, forbidden, actions);
    profileCard.appendChild(form);
    page.appendChild(profileCard);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      save.textContent = "保存中…";
      const values = new FormData(form);
      const splitLines = (value) => String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
      const patch = {
        identity: { name: String(values.get("name") || "").trim(), organization: String(values.get("organization") || "").trim(), title: String(values.get("role") || "").trim(), bio: String(values.get("bio") || "").trim(), languageStyle: String(values.get("languageStyle") || "").trim(), signature: String(values.get("signature") || "").trim() },
        role: { position: String(values.get("role") || "").trim() },
        soul: { principles: splitLines(values.get("principles")), deliveryStandard: String(values.get("deliveryStandard") || "").trim() },
        scope: { forbiddenZones: splitLines(values.get("forbiddenZones")) }
      };
      state.mainMemory = { ...state.mainMemory, ...patch, identity: { ...state.mainMemory.identity, ...patch.identity }, role: { ...(state.mainMemory.role || {}), ...patch.role }, soul: { ...state.mainMemory.soul, ...patch.soul }, scope: { ...state.mainMemory.scope, ...patch.scope } };
      state.profile = { ...state.profile, name: patch.identity.name, company: patch.identity.organization, role: patch.role.position, bio: patch.identity.bio };
      persistState();
      let synced = false;
      if (gateway) {
        try { synced = Boolean((await gateway.action("agent.profile.update", { agentType: "main", patch }))?.data?.profile); } catch { synced = false; }
      }
      renderSection("主 Agent 记忆");
      showNotice(synced ? "主 Agent 记忆已同步" : "主 Agent 记忆已保存");
    });

    const memoryCard = el("section", "sb-settings-card white");
    memoryCard.append(el("h2", "sb-memory-card-title", "当前有效记忆"), el("p", "sb-memory-card-copy", "这些记忆会影响主 Agent 后续的判断和交付方式，可随时回退。"));
    const train = el("form", "sb-memory-train");
    const kind = document.createElement("select");
    [["userRules", "用户规则"], ["feedback", "用户反馈"], ["lessons", "经验总结"], ["bestPractices", "最佳实践"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; kind.appendChild(option); });
    const scope = document.createElement("select");
    [["task", "本次任务"], ["project", "当前项目"], ["agent", "当前 Agent"], ["organization", "整个组织"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; scope.appendChild(option); });
    const memoryInput = el("input"); memoryInput.placeholder = "添加一条记忆规则…";
    const memorySave = makeButton("添加记忆", "sb-settings-primary"); memorySave.type = "submit";
    train.append(kind, scope, memoryInput, memorySave); memoryCard.appendChild(train);
    const memoryList = el("div", "sb-memory-list");
    const kindLabels = { userRules: "用户规则", feedback: "用户反馈", lessons: "经验总结", bestPractices: "最佳实践", projectRules: "项目记忆" };
    const scopeLabels = { task: "本次任务", project: "当前项目", agent: "当前 Agent", organization: "整个组织" };
    const activeMemories = memories.filter((entry) => entry.status !== "rolled-back");
    if (!activeMemories.length) memoryList.appendChild(el("div", "sb-memory-rule empty", "暂无追加记忆，可以从上方开始训练主 Agent。"));
    activeMemories.slice(-8).reverse().forEach((entry) => {
      const item = el("article", "sb-memory-entry");
      item.dataset.status = entry.status || "active";
      item.appendChild(el("div", "sb-memory-entry-text", entry.text));
      const meta = el("div", "sb-memory-entry-meta");
      const tag = el("span", "sb-memory-entry-kind", kindLabels[entry.kind] || entry.kind); tag.dataset.kind = entry.kind || "";
      meta.append(tag, el("span", "", scopeLabels[entry.scope] || "当前 Agent"), el("span", "", entry.source === "user" ? "来自你" : "来自执行"));
      if (entry.version) meta.appendChild(el("span", "", `v${entry.version}`));
      if (gateway && entry.history?.length) {
        const rollback = makeButton("回退", "sb-memory-entry-rollback");
        rollback.addEventListener("click", async () => { rollback.disabled = true; try { await gateway.action("agent.memory.rollback", { agentType: "main", entryId: entry.id }); state.mainMemories = (state.mainMemories || []).map((item) => item.id === entry.id ? { ...item, status: "rolled-back" } : item); persistState(); showNotice("记忆已回退"); } catch { showNotice("回退失败，请稍后重试"); } renderSection("主 Agent 记忆"); });
        meta.appendChild(rollback);
      }
      const remove = makeButton("删除", "sb-memory-entry-delete");
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          if (gateway) await gateway.action("agent.memory.delete", { agentType: "main", entryId: entry.id });
          state.mainMemories = (state.mainMemories || []).filter((item) => item.id !== entry.id);
          persistState();
          showNotice("记忆已删除");
          renderSection("主 Agent 记忆");
        } catch {
          remove.disabled = false;
          showNotice("删除失败，请稍后重试");
        }
      });
      meta.appendChild(remove);
      item.appendChild(meta); memoryList.appendChild(item);
    });
    memoryCard.appendChild(memoryList); page.appendChild(memoryCard);
    train.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = memoryInput.value.trim();
      if (!text) return;
      memorySave.disabled = true;
      const entry = { kind: kind.value, text, scope: scope.value, source: "user" };
      let savedEntry = { ...entry, id: `local-${Date.now()}`, status: "active", version: 1, history: [] };
      let synced = false;
      if (gateway) {
        try { savedEntry = (await gateway.action("agent.memory.append", { agentType: "main", entry }))?.data?.entry || savedEntry; synced = true; } catch { /* keep local fallback */ }
      }
      state.mainMemories = [...(state.mainMemories || []), savedEntry];
      persistState();
      renderSection("主 Agent 记忆");
      showNotice(synced ? "记忆已同步到主 Agent" : "记忆已保存");
    });
  }

  function renderBilling() {
    page.append(buildHeader("账单记录", "查看订阅、充值和退款的完整记录。"));
    const card = el("section", "sb-settings-card white");
    card.append(el("h2", "sb-settings-section-title", "最近账单"), el("p", "sb-settings-muted", "共 3 条记录"));
    const rows = Array.isArray(state.billing) ? state.billing : [];
    if (!rows.length) card.appendChild(el("div", "sb-settings-muted", "暂无账单记录"));
    rows.forEach(({ date, title, amount, status }) => {
      const row = el("div", "sb-billing-row");
      const copy = el("div", "sb-billing-copy"); copy.append(el("div", "sb-billing-title", title), el("div", "sb-billing-meta", date));
      const amountEl = el("strong", "sb-billing-title", amount); const tag = el("span", "sb-settings-tag", status); const action = makeButton("查看详情"); action.addEventListener("click", () => showNotice(`${title} · ${amount} · ${status}`)); row.append(copy, amountEl, tag, action); card.appendChild(row);
    });
    page.appendChild(card);
  }

  function renderNotice() {
    page.append(buildHeader("通知公告", "查看 Byering 的产品更新、额度提醒和安全通知。", "全部标记已读", () => { state.notices = state.notices.map((notice) => ({ ...notice, read: true })); persistState(); renderSection("通知公告"); showNotice("所有通知已标记为已读"); }));
    const list = el("div", "sb-notice-list");
    state.notices.forEach((notice) => {
      const item = el("article", "sb-notice-item"); item.dataset.read = String(notice.read);
      const dot = el("span", "sb-notice-dot"); const copy = el("div", "sb-notice-copy"); copy.append(el("div", "sb-notice-title", notice.title), el("div", "sb-notice-body", notice.body), el("div", "sb-notice-time", notice.time)); item.append(dot, copy);
      item.addEventListener("click", () => { if (!notice.read) { notice.read = true; persistState(); item.dataset.read = "true"; } });
      list.appendChild(item);
    });
    page.appendChild(list);
  }

  function closeTransientPanel(selector) {
    content.querySelector(selector)?.remove();
  }

  function openAuthorization(connector, action) {
    closeTransientPanel(".sb-connector-auth");
    const mask = el("div", "sb-connector-auth");
    const card = el("section", "sb-connector-auth-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `授权接入${connector.name}`);
    card.append(
      el("h3", "sb-connector-auth-title", `授权接入${connector.name}`),
      el("p", "sb-connector-auth-copy", "授权后，Byering 只能访问你选择的文档与知识库内容，不会修改原始文件。")
    );
    const scopes = el("ul", "sb-connector-auth-scopes");
    ["读取在线文档与知识库", "同步标题、正文和目录结构", "按需刷新最新内容"].forEach((scope) => scopes.appendChild(el("li", "", scope)));
    const actions = el("div", "sb-connector-auth-actions");
    const cancel = el("button", "sb-connector-auth-cancel", "取消");
    const confirm = el("button", "sb-connector-auth-confirm", "确认授权");
    cancel.type = confirm.type = "button";
    actions.append(cancel, confirm);
    card.append(scopes, actions);
    mask.appendChild(card);
    content.appendChild(mask);
    const close = () => mask.remove();
    cancel.addEventListener("click", close);
    mask.addEventListener("click", (event) => { if (event.target === mask) close(); });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        if (gateway) await gateway.action("connector.connect", { connectorId: connector.id, connector: { id: connector.id, name: connector.name, category: connector.category, description: connector.description } });
        setConnectorConnected(connector.id);
        action.disabled = true;
        action.dataset.connected = "true";
        action.textContent = "✓";
        action.setAttribute("aria-label", `${connector.name}：已接入`);
        updateStripConnectorState();
        close();
        showNotice(`已接入${connector.name}`);
      } catch {
        confirm.disabled = false;
        showNotice(`接入${connector.name}失败，请稍后重试`);
      }
    });
    confirm.focus();
  }

  function openCustomConnectorPanel() {
    closeTransientPanel(".sb-connector-custom-panel");
    const mask = el("div", "sb-connector-custom-panel");
    const card = el("form", "sb-connector-custom-card");
    const title = el("h3", "sb-connector-custom-title", "自定义连接器");
    const help = el("p", "sb-connector-custom-help", "填写一个兼容 OpenAPI 或文档服务的连接地址，之后可以在工作台中调用。" );
    const fields = el("div", "sb-connector-custom-fields");
    const nameLabel = el("label", "sb-connector-custom-field", "连接器名称");
    const nameInput = el("input");
    nameInput.required = true;
    nameInput.placeholder = "例如：团队知识库";
    nameLabel.appendChild(nameInput);
    const urlLabel = el("label", "sb-connector-custom-field", "服务地址");
    const urlInput = el("input");
    urlInput.type = "url";
    urlInput.required = true;
    urlInput.placeholder = "https://api.example.com";
    urlLabel.appendChild(urlInput);
    fields.append(nameLabel, urlLabel);
    const actions = el("div", "sb-connector-custom-actions");
    const cancel = el("button", "sb-connector-custom-cancel", "取消");
    const submit = el("button", "sb-connector-custom-submit", "保存连接器");
    cancel.type = "button";
    submit.type = "submit";
    actions.append(cancel, submit);
    card.append(title, help, fields, actions);
    mask.appendChild(card);
    content.appendChild(mask);
    const close = () => mask.remove();
    cancel.addEventListener("click", close);
    mask.addEventListener("click", (event) => { if (event.target === mask) close(); });
    card.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      const custom = { id: `custom-${Date.now()}`, name: nameInput.value.trim(), category: "自定义连接器", description: `OpenAPI 服务 · ${urlInput.value.trim()}`, url: urlInput.value.trim() };
      try {
        const result = gateway ? await gateway.action("connector.custom.create", { connector: custom }) : null;
        const saved = result?.data?.connector || custom;
        state.customConnectors = [...(state.customConnectors || []), saved];
        persistState();
        close();
        renderSection("连接器");
        showNotice(`已保存${saved.name}，等待完成授权配置`);
      } catch {
        submit.disabled = false;
        showNotice("保存连接器失败，请检查服务地址");
      }
    });
    nameInput.focus();
  }

  function renderCatalog(query = "") {
    list.textContent = "";
    const connected = connectedConnectorIds();
    const normalizedQuery = query.trim().toLowerCase();
    const connectors = [...KNOWLEDGE_CONNECTORS, ...(state.customConnectors || [])].filter((connector) => !normalizedQuery || `${connector.name} ${connector.category} ${connector.description}`.toLowerCase().includes(normalizedQuery));
    sectionTitle.textContent = normalizedQuery ? "搜索结果" : "推荐连接器";
    if (!connectors.length) {
      list.appendChild(el("div", "sb-connector-empty", "没有找到匹配的连接器"));
      return;
    }
    connectors.forEach((connector) => {
      const card = el("article", "sb-connector-card");
      const logo = connector.logo ? el("img", "sb-connector-card-logo") : el("span", "sb-connector-card-logo sb-connector-card-custom-logo", connector.name.slice(0, 1));
      if (connector.logo) {
        logo.src = connector.logo;
        logo.alt = `${connector.name} logo`;
      }
      const cardBody = el("span", "sb-connector-card-body");
      const top = el("span", "sb-connector-card-top");
      top.append(el("span", "sb-connector-card-name", connector.name), el("span", "sb-connector-card-category", connector.category));
      cardBody.append(top, el("span", "sb-connector-card-desc", connector.description));
      const action = el("button", "sb-connector-card-plus", connected.has(connector.id) ? "✓" : "+");
      action.type = "button";
      action.dataset.connected = String(connected.has(connector.id));
      action.disabled = connected.has(connector.id);
      action.setAttribute("aria-label", `${connector.name}：${connected.has(connector.id) ? "已接入" : "授权接入"}`);
      action.addEventListener("click", () => {
        if (action.disabled) return;
        openAuthorization(connector, action);
      });
      card.append(logo, cardBody, action);
      list.appendChild(card);
    });
  }

  function renderConnectors() {
    const head = buildHeader("连接器", "管理已连接的应用，或添加自定义连接器。", "＋ 自定义连接器", openCustomConnectorPanel);
    const search = el("label", "sb-connector-search");
    search.append(el("span", "sb-connector-search-icon", "⌕"));
    searchInput = el("input", "sb-connector-search-input");
    searchInput.type = "search";
    searchInput.placeholder = "搜索连接器...";
    searchInput.setAttribute("aria-label", "搜索连接器");
    search.appendChild(searchInput);
    sectionTitle = el("h2", "sb-connector-section-title", "推荐连接器");
    list = el("div", "sb-connector-list");
    page.append(head, search, sectionTitle, list);
    searchInput.addEventListener("input", () => renderCatalog(searchInput.value));
    renderCatalog();
  }

  function renderSection(label) {
    activeSection = label;
    mobileNav.value = label;
    const viewVersion = ++renderVersion;
    sectionItems.forEach((item, itemLabel) => { item.dataset.active = String(itemLabel === label); });
    closeTransientPanel(".sb-connector-auth");
    closeTransientPanel(".sb-connector-custom-panel");
    page.textContent = "";
    if (label === "订阅套餐") renderPlan();
    else if (label === "充值积分") renderCredits();
    else if (label === "支付方式") renderPayment();
    else if (label === "主 Agent 记忆") renderProfile(viewVersion);
    else if (label === "账单记录") renderBilling();
    else if (label === "通知公告") renderNotice();
    else renderConnectors();
  }

  sections.forEach(([, label]) => sectionItems.get(label).addEventListener("click", () => renderSection(label)));
  mobileNav.addEventListener("change", () => renderSection(mobileNav.value));
  document.body.appendChild(root);
  connectorModal = root;
  renderSection("连接器");
  if (gateway) {
    gateway.action("account.settings.get").then((result) => {
      if (connectorModal !== root) return;
      const settings = result?.data?.settings;
      if (!settings) return;
      state = {
        ...state,
        ...settings,
        profile: { ...state.profile, ...(settings.profile || {}) },
        mainMemory: { ...state.mainMemory, ...(settings.mainMemory || {}) },
        payments: Array.isArray(settings.payments) ? settings.payments : state.payments,
        billing: Array.isArray(settings.billing) ? settings.billing : state.billing,
        notices: Array.isArray(settings.notices) ? settings.notices : state.notices,
        customConnectors: Array.isArray(settings.customConnectors) ? settings.customConnectors : state.customConnectors
      };
      if (Array.isArray(settings.connectedConnectorIds)) {
        try { window.localStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(settings.connectedConnectorIds)); } catch { /* local storage may be unavailable */ }
      }
      persistState();
      updateStripConnectorState();
      renderSection(activeSection);
    }).catch(() => { /* local settings remain available */ });
  }
}

function buildConnectStrip({ gateway = null } = {}) {
  const strip = el("div", "sb-feed-connect");
  const copy = el("button", "sb-feed-connect-copy");
  copy.type = "button";
  copy.setAttribute("aria-label", "打开连接器管理");
  copy.append(el("span", "sb-feed-connect-mark", "↗"), el("span", "sb-feed-connect-title", `将你的知识沉淀接入${BRAND.name}`));
  copy.addEventListener("click", (event) => { event.stopPropagation(); openConnectorModal(gateway); });
  const apps = el("div", "sb-feed-connect-apps");
  KNOWLEDGE_CONNECTORS.slice(0, 5).forEach((connector) => {
    const app = el("button", "sb-feed-connect-app");
    app.type = "button";
    app.dataset.connectorId = connector.id;
    app.dataset.connectorName = connector.name;
    const logo = el("img", "sb-feed-connect-app-mark");
    logo.src = connector.logo;
    logo.alt = `${connector.name} logo`;
    app.appendChild(logo);
    app.addEventListener("click", (event) => { event.stopPropagation(); openConnectorModal(gateway); });
    apps.appendChild(app);
  });
  strip.append(copy, apps);
  updateStripConnectorState();
  return strip;
}

function decorateHomeHero({ activeDomainId = SALES_DOMAINS[0].id, onDomainChange = null, onEarOpen = null } = {}) {
  const hero = document.querySelector('[class*="_agentIntro_1e9r5_"]');
  if (!hero) return false;
  if (!hero.dataset.sbHeroDecorated) {
    const brand = el("div", "sb-home-hero-brand");
    const lockup = el("div", "sb-home-hero-lockup");
    const wordmark = el("img", "sb-home-hero-wordmark");
    wordmark.src = BYERING_WORDMARK_URL;
    wordmark.alt = `${BRAND.name} Sales Intelligence`;
    lockup.appendChild(wordmark);
    brand.appendChild(lockup);

    const nav = el("div", "sb-home-hero-nav");
    let recordMenu = null;
    const closeRecordMenu = () => {
      recordMenu?.remove();
      recordMenu = null;
      nav.dataset.recordMenu = "closed";
      hero.dataset.recordMenu = "closed";
      nav.querySelector('[data-domain-id="ear"]')?.setAttribute("aria-expanded", "false");
    };
    const openRecordMenu = (item) => {
      if (recordMenu) {
        closeRecordMenu();
        return;
      }
      recordMenu = el("div", "sb-home-hero-record-menu");
      recordMenu.setAttribute("role", "dialog");
      recordMenu.setAttribute("aria-label", "录音总结入口");
      const head = el("div", "sb-home-hero-record-menu-head");
      const copy = el("div", "sb-home-hero-record-menu-copy");
      copy.append(el("h3", "sb-home-hero-record-menu-title", "录音总结"), el("p", "sb-home-hero-record-menu-subtitle", "把访谈、复盘或会议整理成可交付物料"));
      head.append(el("span", "sb-home-hero-record-menu-icon", "🎙️"), copy);
      const close = el("button", "sb-home-hero-record-menu-close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "关闭录音入口");
      close.addEventListener("click", closeRecordMenu);
      const actions = el("div", "sb-home-hero-record-menu-actions");
      const quickStart = el("button", "sb-home-hero-record-menu-action", "立即开始录音");
      quickStart.type = "button";
      quickStart.dataset.primary = "true";
      quickStart.addEventListener("click", () => { closeRecordMenu(); onEarOpen?.({ autoStart: true }); });
      const openWorkspace = el("button", "sb-home-hero-record-menu-action", "进入录音工作台");
      openWorkspace.type = "button";
      openWorkspace.addEventListener("click", () => { closeRecordMenu(); onEarOpen?.({ autoStart: false }); });
      actions.append(quickStart, openWorkspace);
      recordMenu.append(head, close, actions);
      nav.appendChild(recordMenu);
      nav.dataset.recordMenu = "open";
      hero.dataset.recordMenu = "open";
      item.setAttribute("aria-expanded", "true");
    };
    const setActiveDomain = (domainId) => {
      nav.querySelectorAll(".sb-home-hero-nav-item").forEach((item) => {
        const active = item.dataset.domainId === domainId;
        item.dataset.active = String(active);
        item.setAttribute("aria-pressed", String(active));
      });
    };
    SALES_DOMAINS.forEach(({ id, icon, label, entry }) => {
      const item = el("button", "sb-home-hero-nav-item");
      item.type = "button";
      item.dataset.domainId = id;
      item.setAttribute("aria-label", entry === "ear" ? "打开录音总结（倾耳）" : `切换到${label}领域`);
      if (entry === "ear") item.setAttribute("aria-expanded", "false");
      item.append(el("span", "sb-home-hero-nav-icon", icon), el("span", "sb-home-hero-nav-label", label));
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        if (entry === "ear") {
          openRecordMenu(item);
          return;
        }
        if (recordMenu) closeRecordMenu();
        setActiveDomain(id);
        onDomainChange?.(id);
      });
      nav.appendChild(item);
    });
    setActiveDomain(activeDomainId);

    const bubbles = el("div", "sb-home-hero-bubbles");
    ["线索池", "客户画像", "品牌", "数据", "转化路径"].forEach((label) => bubbles.appendChild(el("span", "sb-home-hero-bubble", label)));
    const bird = el("video", "sb-home-hero-bird");
    bird.src = BYERING_AGENT_VIDEO_URL;
    bird.autoplay = true;
    bird.loop = true;
    bird.muted = true;
    bird.playsInline = true;
    bird.setAttribute("aria-label", `${BRAND.name} 工作动作`);
    bird.setAttribute("aria-hidden", "true");
    hero.append(brand, nav, bubbles, bird);
    hero.dataset.sbHeroDecorated = "1";
  }

  return true;
}

function tuneHomePrompt(prompt = null) {
  const input = document.querySelector('[class*="_chatInput_17vjn_"] .semi-aiChatInput');
  const paragraph = input?.querySelector(".semi-aiChatInput-editor-content .tiptap p");
  if (!input || !paragraph) return false;
  bindPromptTab(input);
  bindInputOptions(input);
  const nextPrompt = prompt || input.dataset.sbPromptPlaceholder || PROMPT_TAB_TEXT;
  input.dataset.sbPromptPlaceholder = nextPrompt;
  if (!paragraph.textContent.trim()) paragraph.dataset.placeholder = nextPrompt;
  if (!input.querySelector(".sb-input-tab")) input.appendChild(el("span", "sb-input-tab", "Tab"));
  return true;
}

export function mountHomeSalesFeed({ gateway = null } = {}) {
  ensureStyle();
  const mountedWindow = globalThis.window;
  let area = null;
  let activeDomainId = SALES_DOMAINS[0].id;
  let activeEmployeeId = null;
  let quickRail = null;
  let sectionLabel = null;
  let grid = null;
  const onAccountAction = (event) => {
    if (event.detail?.action === "settings") openConnectorModal(gateway);
  };
  document.addEventListener("salebuddy:account-action", onAccountAction);

  const activeDomain = () => SALES_DOMAINS.find(({ id }) => id === activeDomainId) || SALES_DOMAINS[0];

  function domainItems() {
    return employeePromptItems(activeDomainId, activeEmployeeId);
  }

  function renderGrid(grid) {
    grid.textContent = "";
    domainItems().forEach(({ icon, title, description, prompt }, i) => {
      const [bg, fg] = TONES[i % TONES.length];
      const card = el("button", "sb-feed-card");
      card.type = "button";
      card.setAttribute("aria-label", `${title}，点击填入输入框`);
      const head = el("div", "sb-feed-cardhead");
      const iconEl = el("span", "sb-feed-icon", icon);
      iconEl.style.background = bg;
      head.append(iconEl, el("span", "sb-feed-title", title));
      card.appendChild(head);
      card.appendChild(el("div", "sb-feed-desc", description));
      card.appendChild(el("span", "sb-feed-fill", "直接这样问 · 填入输入框 ↗"));
      card.addEventListener("click", (event) => {
        event.stopPropagation();
        fillEditor(prompt);
      });
      grid.appendChild(card);
    });
  }

  function renderQuickRail() {
    const next = buildQuickRail(activeDomain(), {
      selectedEmployeeId: activeEmployeeId,
      onEmployeeSelect: selectEmployee
    });
    quickRail?.replaceWith(next);
    quickRail = next;
  }

  function selectEmployee(employeeId) {
    const domain = activeDomain();
    const choice = domainEmployeeChoices(domain).find(({ agent }) => agent.id === employeeId);
    if (!choice || activeEmployeeId === employeeId) return;
    activeEmployeeId = employeeId;
    if (area?.isConnected) renderQuickRail();
    renderGrid(grid);
  }

  function updateSectionLabel() {
    sectionLabel.textContent = "";
    sectionLabel.append("不知道怎么开始？下面是", el("strong", "", `${activeDomain().label}`), "中常见的问题，你可以直接这样问。");
  }

  function build() {
    area = el("div", "sb-feed notranslate");
    area.id = "sb-sales-feed";
    area.setAttribute("translate", "no");
    area.appendChild(buildConnectStrip({ gateway }));
    updateStripConnectorState();
    activeEmployeeId = domainEmployeeChoices(activeDomain())[0]?.agent.id || "main";
    quickRail = buildQuickRail(activeDomain(), { selectedEmployeeId: activeEmployeeId, onEmployeeSelect: selectEmployee });
    area.appendChild(quickRail);
    sectionLabel = el("div", "sb-feed-section-label");
    area.appendChild(sectionLabel);
    updateSectionLabel();
    grid = el("div", "sb-feed-grid");
    area.appendChild(grid);
    renderGrid(grid);
  }

  function switchDomain(domainId) {
    if (!SALES_DOMAINS.some(({ id }) => id === domainId) || domainId === activeDomainId) return;
    activeDomainId = domainId;
    if (!area) return;
    activeEmployeeId = domainEmployeeChoices(activeDomain())[0]?.agent.id || "main";
    const promptEditor = document.querySelector('[class*="_chatInput_17vjn_"] .semi-aiChatInput-editor-content .tiptap p');
    const promptInput = promptEditor?.closest(".semi-aiChatInput");
    const nextPrompt = domainPromptPlaceholder(domainId);
    if (promptInput) promptInput.dataset.sbPromptPlaceholder = nextPrompt;
    if (promptEditor && !promptEditor.textContent.trim()) promptEditor.dataset.placeholder = nextPrompt;
    renderQuickRail();
    updateSectionLabel();
    renderGrid(grid);
  }

  function homeMain() {
    const p = location.pathname;
    if (!(p === "/" || p === "/home" || p === "")) return null;
    return document.querySelector('[class*="_hotWordsArea_"]');
  }

  function ensureInjected() {
    decorateHomeHero({ activeDomainId, onDomainChange: switchDomain, onEarOpen: (options = {}) => openEarPage({ gateway, ...options }) });
    tuneHomePrompt(domainPromptPlaceholder(activeDomainId));
    const native = homeMain();
    if (!native) return false;
    if (!area || !area.isConnected) {
      build();
      native.insertAdjacentElement("afterend", area);
    }
    return true;
  }

  const observer = new MutationObserver(() => {
    if (!area?.isConnected) ensureInjected();
  });
  const observeRoot = document.body || document.documentElement;
  if (observeRoot) observer.observe(observeRoot, { childList: true, subtree: true });
  mountedWindow.addEventListener("popstate", ensureInjected);
  const promptTimer = setInterval(tuneHomePrompt, 400);
  const bootTimer = setInterval(() => {
    if (ensureInjected()) {
      console.log("[SaleBuddy] 首页销售业务推荐区已注入");
      clearInterval(bootTimer);
    }
  }, 500);

  return {
    unmount() {
      clearInterval(bootTimer);
      clearInterval(promptTimer);
      observer.disconnect();
      mountedWindow.removeEventListener("popstate", ensureInjected);
      document.removeEventListener("salebuddy:account-action", onAccountAction);
      stopInputRecognition();
      document.querySelectorAll("[data-sb-input-options=\"1\"]").forEach((node) => node.remove());
      document.querySelector(".sb-input-notice")?.remove();
      clearTimeout(inputNoticeTimer);
      area?.remove();
    }
  };
}
