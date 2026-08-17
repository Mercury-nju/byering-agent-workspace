/**
 * ui/mount.js
 * 外围 UI 挂载工具：在 bundle 渲染的 DOM 之外挂载 SaleBuddy 新面板，
 * 不修改 bundle 内部任何节点。视觉风格跟随产品既有语言。
 */

const HOST_ID = "salebuddy-ui-root";

/** 获取（或创建）SaleBuddy 的 UI 挂载容器。 */
export function getUiRoot() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  return host;
}

/**
 * 挂载一个外围面板。返回卸载函数。
 * @param {(container: HTMLElement) => void} render
 */
export function mountPanel(render) {
  const container = document.createElement("section");
  container.dataset.salebuddyPanel = "";
  getUiRoot().appendChild(container);
  render(container);
  return () => container.remove();
}
