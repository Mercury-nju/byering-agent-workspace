/**
 * ui/toolbox-first.js
 * 技能广场：把「工具箱」页签提到「探索发现」前面，并修正工具箱列表的滚动容器。
 * 只调整现有页面的视觉和布局，不主动触发技能广场路由。
 */

const CSS = `
/* 页签视觉顺序对调：工具箱(原第2个)在前，探索发现在后 */
[class*="_mainTabs_"]{display:flex !important}
button[class*="_mainTab_"]:nth-child(1){order:2}
button[class*="_mainTab_"]:nth-child(2){order:1}

/* Keep the native skill list as the only scroll owner. Its virtualized rows
   depend on a fixed viewport and become misaligned when overflow is lifted. */
[class*="_panel_"]:has(.sb-toolbox-route){overflow:hidden !important}
[class*="_tabLayout_"]:has(.sb-toolbox-route),
[class*="_routePanel_"]:has(.sb-toolbox-route),
.sb-toolbox-route{height:100% !important;min-height:0 !important;overflow:hidden !important}
.sb-toolbox-route [class*="_container_"]{height:100% !important;min-height:0 !important;overflow:hidden !important}
.sb-toolbox-route [class*="_cardList_"]{height:auto !important;min-height:0 !important;overflow-y:auto !important;overflow-x:hidden !important;flex:1 1 auto !important}
`;

function findToolboxTab() {
  return [...document.querySelectorAll('button[class*="_mainTab_"]')]
    .find((btn) => btn.textContent?.trim() === "工具箱") || null;
}

export function mountToolboxFirst() {
  const styleTag = document.createElement("style");
  styleTag.textContent = CSS;
  document.head.appendChild(styleTag);

  function sweep() {
    const tab = findToolboxTab();
    if (!tab) return;
    const route = tab.closest('[class*="_root_"]');
    route?.classList.add("sb-toolbox-route");
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; sweep(); }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  sweep();
  console.log("[SaleBuddy] 技能广场「工具箱」已置顶");

  return {
    unmount() {
      observer.disconnect();
      styleTag.remove();
      document.querySelectorAll(".sb-toolbox-route").forEach((node) => node.classList.remove("sb-toolbox-route"));
    }
  };
}
