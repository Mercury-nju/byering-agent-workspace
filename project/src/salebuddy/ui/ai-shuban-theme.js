/**
 * AI数班 visual theme adapter.
 * Keeps the recovered renderer untouched and styles the surrounding product UI.
 */

const STYLE_ID = "salebuddy-ai-shuban-theme";
const THEME_ATTRIBUTE = "data-byering-theme";

const CSS = `
:root{
  --byering-paper:#f7f8fb;
  --byering-white:#fff;
  --byering-ink:#080808;
  --byering-muted:#777;
  --byering-line:#ededed;
  --byering-green:#22a15a;
  --byering-orange:#ff6c21;
}

html[${THEME_ATTRIBUTE}="ai-shuban"]{
  width:100%;
  min-width:0;
  min-height:100%;
  overflow-x:hidden;
  overflow-x:clip;
  background:var(--byering-paper)!important;
  color:var(--byering-ink);
  font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  font-synthesis:none;
  text-rendering:optimizeLegibility;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] body{
  width:100%;
  min-width:0;
  min-height:100%;
  overflow-x:hidden;
  overflow-x:clip;
  background:var(--byering-paper)!important;
  color:var(--byering-ink);
  font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  font-synthesis:none;
  text-rendering:optimizeLegibility;
}

html[${THEME_ATTRIBUTE}="ai-shuban"] #root{
  width:100%;
  min-width:0;
  min-height:100dvh;
  overflow-x:hidden;
  overflow-x:clip;
  background:var(--byering-paper)!important;
  color:var(--byering-ink);
}

/* Keep the recovered shell on the same full-width paper canvas as AI数班. */
html[${THEME_ATTRIBUTE}="ai-shuban"] [class*="_page_xk3qg_"],
html[${THEME_ATTRIBUTE}="ai-shuban"] [class*="_pageContainer_xk3qg_"],
html[${THEME_ATTRIBUTE}="ai-shuban"] [class*="_layoutContainer_xk3qg_"]{
  min-width:0!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  background:var(--byering-paper)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [class*="_mainContent_xk3qg_"]{
  min-width:0!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  margin:10px 10px 10px 0!important;
  border-radius:16px!important;
  overflow:hidden!important;
}

/* Keep the office canvas flat; only the navigation and assistant are surfaces. */
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard{
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  min-height:calc(100vh - 20px)!important;
  min-height:calc(100dvh - 20px)!important;
  margin:0!important;
  padding:0 28px 0 0!important;
  box-sizing:border-box!important;
  border-radius:0!important;
  background:var(--byering-paper)!important;
  overflow-x:hidden!important;
  overflow-x:clip!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard [class*="_rightPanel_"]{
  position:relative!important;
  border:0!important;
  border-radius:var(--sb-office-workspace-radius,0px)!important;
  background:transparent!important;
  box-shadow:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard [class*="_rightPanel_"] > [class*="_container_"]{
  display:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard [class*="_pageTitleText_"],
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-page-host [class*="_pageTitleText_"]{
  display:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard [class*="_statsCard_"]{
  border:1px solid var(--byering-line)!important;
  border-radius:12px!important;
  background:#fafafa!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard [class*="_agentCard_"],
html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard [class*="_agentItem_"]{
  border-radius:12px!important;
  border-color:var(--byering-line)!important;
  background:#fff!important;
  box-shadow:none!important;
}

/* The target project's floating white navigation card. */
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"]{
  position:relative!important;
  z-index:2!important;
  width:200px!important;
  min-width:200px!important;
  flex:0 0 200px!important;
  height:calc(100% - 20px)!important;
  min-height:0!important;
  align-self:stretch!important;
  box-sizing:border-box!important;
  margin:10px 20px 10px 10px!important;
  padding:30px 10px 17px!important;
  border-radius:16px!important;
  background:rgba(255,255,255,.92)!important;
  box-shadow:none!important;
  overflow:hidden!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [class*="_sidebarInner_"]{
  background:transparent!important;
  border-radius:inherit!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [data-sb-nav-owner="1"]{
  color:var(--byering-ink)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-row,
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [data-sb-nav-slot="newTask"]{
  min-height:40px!important;
  border-radius:8px!important;
  color:var(--byering-ink)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-row:hover,
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-row.sb-nav-on,
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [data-sb-nav-slot="newTask"]:hover,
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [data-sb-nav-slot="newTask"].sb-nav-on{
  background:#f1f1f1!important;
  color:var(--byering-ink)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-group-label,
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-recent-label,
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-project-heading{
  color:#777!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-account{
  border-radius:8px!important;
  color:var(--byering-ink)!important;
}

/* Docked pages and panels use the same paper-to-white hierarchy. */
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page{
  min-width:0!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  background:var(--byering-paper)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-head{
  height:66px!important;
  padding:0 32px!important;
  border-bottom:0!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-title{
  color:var(--byering-ink)!important;
  font-size:20px!important;
  font-weight:600!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-body{
  min-width:0!important;
  max-width:100%!important;
  padding:0 32px 32px!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-room-card,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-output,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-work-hero,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-proof,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-empty{
  border-color:var(--byering-line)!important;
  border-radius:16px!important;
  background:var(--byering-white)!important;
  box-shadow:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-room-card:hover,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-output:hover{
  background:#fff!important;
  box-shadow:0 8px 22px rgba(0,0,0,.05)!important;
}

/* Agent detail is a floating assistant card, matching the office reference. */
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-drawer{
  top:10px!important;
  right:10px!important;
  bottom:10px!important;
  width:min(420px,calc(100vw - 30px))!important;
  min-width:360px!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  border:0!important;
  border-radius:16px!important;
  background:rgba(255,255,255,.96)!important;
  box-shadow:0 8px 26px rgba(0,0,0,.08)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-drawer-head{
  padding:20px 16px 14px!important;
  border-bottom:0!important;
  background:transparent!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-drawer-body,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chief-body,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chief-options{
  background:var(--byering-white)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chief-overview{
  border-bottom:1px solid var(--byering-line)!important;
  box-shadow:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chief-option{
  border-color:var(--byering-line)!important;
  border-radius:8px!important;
  color:var(--byering-ink)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chief-option:hover{
  border-color:#d9d9d9!important;
  background:#f1f1f1!important;
}

/* Replace frosted promotional surfaces with the target's quiet flat cards. */
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-feed-card,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-feed-quick-card{
  border:1px solid var(--byering-line)!important;
  border-radius:16px!important;
  background:#fff!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-feed-card:hover,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-feed-quick-card:hover{
  background:#fff!important;
  border-color:#dedede!important;
  box-shadow:0 8px 22px rgba(0,0,0,.05)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-feed-connect{
  border-radius:0 0 16px 16px!important;
  background:#fff!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-home-hero-nav{
  border-color:var(--byering-line)!important;
  background:rgba(255,255,255,.92)!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
}

/* Members follows the reference conversation proportions: a framed canvas,
   a wider master list, and a dominant detail workspace. */
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page:has(.sb-contacts2){
  padding:10px 0!important;
  background:var(--byering-paper)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-body:has(.sb-contacts2){
  padding:0!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-contacts2{
  gap:20px!important;
  padding:20px!important;
  border:1px solid #fff!important;
  border-radius:20px!important;
  background:#f1f1f1!important;
  scrollbar-width:none!important;
  -ms-overflow-style:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-clist{
  width:320px!important;
  padding:0!important;
  border-right:0!important;
  scrollbar-width:none!important;
  -ms-overflow-style:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-clist::-webkit-scrollbar,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-contacts2::-webkit-scrollbar{
  width:0!important;
  height:0!important;
  display:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cgroup-title{
  padding:0 0 12px!important;
  color:#222!important;
  font-size:16px!important;
  letter-spacing:0!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cgroup-count{
  color:#999!important;
  font-size:13px!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-crow{
  min-height:70px!important;
  gap:12px!important;
  padding:10px 14px!important;
  border-radius:16px!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-crow.sb-on,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-crow:hover{
  background:#fff!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cavatar{
  width:50px!important;
  height:50px!important;
  font-size:17px!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cname{
  color:#222!important;
  font-size:15px!important;
  font-weight:600!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-csub{
  margin-top:4px!important;
  color:#999!important;
  font-size:13px!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cdetail{
  padding:20px!important;
  border:1px solid #fff!important;
  border-radius:20px!important;
  background:#fbfbfb!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cplaceholder{
  font-size:14px!important;
  color:#999!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chead-friend{
  padding:0 0 14px!important;
  border-bottom-color:var(--byering-line)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chat-list2{
  padding:20px 10px!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-chat-input2{
  padding:14px 10px 0!important;
  border-top-color:var(--byering-line)!important;
}

html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-connector-modal{
  background:rgba(15,15,15,.2)!important;
  backdrop-filter:none!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-connector-dialog{
  border-radius:16px!important;
  box-shadow:0 14px 40px rgba(0,0,0,.12)!important;
}

html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-drawer-live,
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-output-status{
  color:var(--byering-green)!important;
}
html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-drawer-live.sb-working{
  color:#b87a1e!important;
}

/* Casting often exposes a smaller CSS viewport than the source display. Reflow instead of scaling. */
@media(max-width:1180px){
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"]{
    width:180px!important;
    min-width:180px!important;
    flex-basis:180px!important;
    margin-right:14px!important;
    padding-top:24px!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard{padding-right:18px!important}
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-head{padding-inline:24px!important}
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-body{padding-inline:24px!important}
}
@media(max-width:920px){
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"]{
    width:68px!important;
    min-width:68px!important;
    flex-basis:68px!important;
    margin:8px 12px 8px 8px!important;
    padding:18px 7px 12px!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-row,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [data-sb-nav-slot="newTask"],
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-account{
    justify-content:center!important;
    gap:0!important;
    padding-inline:0!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-label,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-group-label,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-recent-label,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-project-heading,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-account-copy,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] .sb-nav-account-chevron,
  html[${THEME_ATTRIBUTE}="ai-shuban"] [data-sb-nav-root="1"] [data-sb-nav-slot="newTask"] > :not(:first-child){
    display:none!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] .office-dashboard{padding-right:12px!important}
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-head{height:60px!important;padding-inline:20px!important}
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-page-body{padding-inline:20px!important}
}
@media(max-width:760px){
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-drawer{
    width:calc(100vw - 20px)!important;
    min-width:0!important;
    right:10px!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-contacts2{
    display:grid!important;
    grid-template-columns:minmax(0,1fr)!important;
    grid-auto-rows:minmax(0,auto)!important;
    gap:12px!important;
    padding:12px!important;
    overflow-y:auto!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-clist{
    width:100%!important;
    max-height:420px!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cdetail{
    width:100%!important;
    min-height:360px!important;
  }
  html[${THEME_ATTRIBUTE}="ai-shuban"] .sb-cdetail{padding:14px!important}
}
`;

export function mountAiShubanTheme() {
  const html = document.documentElement;
  html.setAttribute(THEME_ATTRIBUTE, "ai-shuban");

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  return {
    unmount() {
      style?.remove();
      if (html.getAttribute(THEME_ATTRIBUTE) === "ai-shuban") {
        html.removeAttribute(THEME_ATTRIBUTE);
      }
    }
  };
}
