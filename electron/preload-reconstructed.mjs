import { contextBridge, ipcRenderer, webUtils } from "electron";

const channels = {
  servicePortsGet: "marvis:service-ports:get",
  servicePortChanged: "marvis:service-ports:changed",
  processEvent: "marvis:process:event",
  waitForGateway: "marvis:gateway:wait-ready",
  buglyCrashTest: "marvis:bugly:crash-test:trigger",
  rendererReady: "marvis:renderer:ready",
  menuAction: "marvis:menu:action",
  jsbInvoke: "jsb:invoke",
  contentChanged: "jsb:content-changed",
  dragFilesCache: "marvis:drag-files:cache"
};

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback?.(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge = {
  getVersion: () => process.versions.app || process.versions.electron,
  invoke: (methodName, args = []) => ipcRenderer.invoke(channels.jsbInvoke, { methodName, args }),
  getServicePorts: () => ipcRenderer.invoke(channels.servicePortsGet),
  waitForGateway: () => ipcRenderer.invoke(channels.waitForGateway),
  triggerCrash: () => ipcRenderer.send(channels.buglyCrashTest),
  notifyReady: () => ipcRenderer.send(channels.rendererReady),
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onServicePortChanged: (callback) => subscribe(channels.servicePortChanged, callback),
  onProcessEvent: (callback) => subscribe(channels.processEvent, callback),
  onMenuAction: (callback) => subscribe(channels.menuAction, callback),
  onContentChanged: (callback) => subscribe(channels.contentChanged, callback)
};

contextBridge.exposeInMainWorld("marvis", bridge);
