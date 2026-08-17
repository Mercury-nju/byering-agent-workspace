/**
 * ui/toolbox-first.js
 * 技能广场：把「工具箱」页签提到「探索发现」前面，并在打开技能广场时默认选中工具箱。
 * 纯 CSS order 调视觉顺序 + 首次出现时补一次原生点击，不改任何冻结文件。
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
    const container = tab.closest('[class*="_mainTabs_"]');
    const route = tab.closest('[class*="_root_"]');
    route?.classList.add("sb-toolbox-route");
    // 每次页面重新挂载只自动选一次；用户手动切回「探索发现」不强制
    if (container?.dataset.sbToolboxFirst) return;
    if (container) container.dataset.sbToolboxFirst = "1";
    if (![...tab.classList].some((cls) => /mainTabActive/i.test(cls))) tab.click();
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
