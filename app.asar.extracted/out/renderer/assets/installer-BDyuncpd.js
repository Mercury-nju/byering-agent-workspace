const $ = (selector) => document.querySelector(selector);
$(".main-view");
const appIcon = $("#app-icon");
const versionAlert = $("#version-alert");
const spaceAlert = $("#space-alert");
const combinedAlert = $("#combined-alert");
const combinedList = $("#combined-list");
const progressContainer = $("#progress-container");
const progressFill = $("#progress-fill");
const progressText = $("#progress-text");
const btnUpgrade = $("#btn-upgrade");
const btnOpenStorage = $("#btn-open-storage");
const btnRetrySpace = $("#btn-retry-space");
const btnRetryCombined = $("#btn-retry-combined");
const alertCloseButtons = document.querySelectorAll(".alert-close");
const api = window.installerAPI;
function parseInitialEnvFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const osOK = params.get("osOK");
    const diskOK = params.get("diskOK");
    if (!osOK || !diskOK) return null;
    return {
      osVersionSupported: osOK === "true",
      diskSpaceSufficient: diskOK === "true",
      osVersionString: params.get("osVer") ?? "",
      availableSpaceGB: parseFloat(params.get("diskGB") ?? "0"),
      requiredSpaceGB: parseFloat(params.get("requiredGB") ?? "5")
    };
  } catch {
    return null;
  }
}
if (!api) {
  console.warn("[installer] window.installerAPI 不可用，preload 可能未加载。按钮交互将不可用。");
}
function hideAllAlerts() {
  versionAlert.classList.add("hidden");
  spaceAlert.classList.add("hidden");
  combinedAlert.classList.add("hidden");
}
function showAlert(dialog) {
  hideAllAlerts();
  dialog.classList.remove("hidden");
}
let isCurrentlyCombined = false;
function handleEnvResult(result) {
  const { osVersionSupported, diskSpaceSufficient } = result;
  if (osVersionSupported && diskSpaceSufficient) {
    isCurrentlyCombined = false;
    document.body.classList.remove("alert-mode");
    hideAllAlerts();
    api?.resizeWindow(520, 520);
    return;
  }
  document.body.classList.add("alert-mode");
  const nowCombined = !osVersionSupported && !diskSpaceSufficient;
  if (isCurrentlyCombined && !nowCombined) {
    buildCombinedAlert(result);
    showAlert(combinedAlert);
  } else if (nowCombined) {
    isCurrentlyCombined = true;
    buildCombinedAlert(result);
    showAlert(combinedAlert);
  } else if (!osVersionSupported) {
    isCurrentlyCombined = false;
    showAlert(versionAlert);
  } else if (!diskSpaceSufficient) {
    isCurrentlyCombined = false;
    showAlert(spaceAlert);
  }
  api?.resizeWindow(454, 200);
}
function buildCombinedAlert(result) {
  const items = [];
  if (!result.osVersionSupported) {
    items.push({
      text: "系统版本过低，需升级至macOS13或更高版本",
      action: "去升级",
      actionType: "upgrade",
      resolved: false
    });
  } else if (isCurrentlyCombined) {
    items.push({
      text: "系统版本过低，需升级至macOS13或更高版本",
      action: "已升级",
      actionType: void 0,
      resolved: true
    });
  }
  if (!result.diskSpaceSufficient) {
    items.push({
      text: "磁盘空间不足，请清理不必要的文件",
      action: "去清理",
      actionType: "storage",
      resolved: false
    });
  } else if (isCurrentlyCombined) {
    items.push({
      text: "磁盘空间不足，请清理不必要的文件",
      action: "已清理",
      // 绿色文字，无点击行为
      actionType: void 0,
      resolved: true
    });
  }
  combinedList.innerHTML = items.map((item) => {
    const { action, actionType, resolved, text } = item;
    let actionEl = "";
    if (action) {
      if (resolved) {
        actionEl = `<span class="resolved-text">${action}</span>`;
      } else {
        actionEl = `<a class="action-link" data-action="${actionType}">${action}<svg class="action-arrow" width="6" height="11" viewBox="0 0 6 11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5.5L1 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
      }
    }
    return `
      <li class="${resolved ? "resolved" : ""}">
        ${text}
        ${actionEl}
      </li>
    `;
  }).join("");
  combinedList.querySelectorAll(".action-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const { action } = e.target.dataset;
      if (action === "upgrade") {
        api.openSoftwareUpdate();
      } else if (action === "storage") {
        api.openStorage();
      }
    });
  });
}
function handleProgress(payload) {
  const pct = Math.min(100, Math.max(0, payload.progress * 100));
  progressFill.style.width = `${pct}%`;
  if (payload.progress < 0.4) {
    progressText.textContent = "正在拷贝文件...";
  } else if (payload.progress < 0.8) {
    progressText.textContent = "正在完成安装...";
  } else if (payload.progress < 1) {
    progressText.textContent = "即将启动 Marvis...";
  } else {
    progressText.textContent = "安装完成！";
  }
}
function showProgress(show) {
  progressContainer.classList.toggle("hidden", !show);
}
function handlePhaseChange(payload) {
  switch (payload.phase) {
    case "checking":
      hideAllAlerts();
      showProgress(false);
      break;
    case "installing":
      hideAllAlerts();
      showProgress(true);
      break;
    case "completed":
      showProgress(true);
      progressFill.style.width = "100%";
      progressText.textContent = "安装完成！正在启动...";
      break;
    case "failed":
      showProgress(false);
      break;
  }
}
function loadAppIcon() {
  try {
    const iconPath = new URLSearchParams(window.location.search).get("icon");
    if (iconPath) {
      appIcon.src = decodeURIComponent(iconPath);
    } else {
      appIcon.src = "";
      appIcon.style.display = "none";
    }
  } catch {
  }
}
function bindEvents() {
  api?.onEnvResult(handleEnvResult);
  api?.onProgress(handleProgress);
  api?.onPhaseChange(handlePhaseChange);
  btnUpgrade.addEventListener("click", () => {
    api?.openSoftwareUpdate();
  });
  btnOpenStorage.addEventListener("click", () => {
    api?.openStorage();
  });
  btnRetrySpace.addEventListener("click", () => {
    if (!api) return;
    const btn = btnRetrySpace;
    btn.textContent = "检测中...";
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.6";
    const startedAt = Date.now();
    api.retryCheck().finally(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1e3) {
        setTimeout(finish, 1e3 - elapsed);
      } else {
        finish();
      }
    });
    function finish() {
      btn.textContent = "重新检测";
      btn.style.pointerEvents = "";
      btn.style.opacity = "";
    }
  });
  btnRetryCombined.addEventListener("click", () => {
    if (!api) return;
    const btn = btnRetryCombined;
    btn.textContent = "检测中...";
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.6";
    const startedAt = Date.now();
    api.retryCheck().finally(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1e3) {
        setTimeout(finish, 1e3 - elapsed);
      } else {
        finish();
      }
    });
    function finish() {
      btn.textContent = "重新检测";
      btn.style.pointerEvents = "";
      btn.style.opacity = "";
    }
  });
  alertCloseButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      api?.closeWindow();
    });
  });
}
loadAppIcon();
bindEvents();
const initialEnv = parseInitialEnvFromURL();
if (initialEnv) {
  handleEnvResult(initialEnv);
}
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    api?.notifyReady().catch(() => {
    });
  });
});
