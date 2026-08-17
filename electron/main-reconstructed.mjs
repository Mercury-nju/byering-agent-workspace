import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandIconPath = path.join(projectRoot, "assets/byering-logo-128.png");
let mainWindow;

app.setName("Byering");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Byering",
    icon: brandIconPath,
    webPreferences: {
      preload: path.join(projectRoot, "electron/preload-reconstructed.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(projectRoot, "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.setIcon(brandIconPath);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(true));

  ipcMain.handle("marvis:service-ports:get", () => ({}));
  ipcMain.handle("marvis:gateway:wait-ready", () => ({ ready: false, recovered: true }));
  ipcMain.handle("jsb:invoke", (_event, request) => ({ recovered: true, request }));
  ipcMain.on("marvis:renderer:ready", () => console.log("renderer-ready"));
  ipcMain.on("marvis:bugly:crash-test:trigger", () => console.warn("Crash test ignored in reconstructed shell"));
  ipcMain.on("marvis:drag-files:cache", (_event, payload) => console.log("drag-files", payload));

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
