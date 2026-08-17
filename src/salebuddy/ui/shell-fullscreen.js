/**
 * ui/shell-fullscreen.js
 * 应用外壳铺满整个视口：原生 bundle 是桌面客户端窗口化观感，
 * 根容器 `_page_` 默认 32px 圆角（`_maximized_` 时才归 0），四角露出灰底。
 * Web 版全屏化：圆角归 0，内容铺满。仅覆盖表现层变量，不动冻结文件。
 */

const CSS = `
[class*="_page_xk3qg_"]{--border-radius:0 !important;border-radius:0 !important}
[class*="_overlayContainer_xk3qg_"]{border-radius:0 !important}
`;

export function mountShellFullscreen() {
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  console.log("[SaleBuddy] 应用外壳已全屏化（圆角归 0）");
  return { unmount() { tag.remove(); } };
}
