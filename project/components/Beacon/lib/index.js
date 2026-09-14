/**
 * Marvis beacon_wrapper - Electron / Node.js 高层封装。
 *
 * Usage:
 *   const beacon = require('beacon-napi');
 *   beacon.init();
 *   beacon.setCommonParams({ biz_id: 'main_process', install_source: 'dmg' });
 *   beacon.reportEvent('app_launch', { route: '/home' });
 *   beacon.reportRealtimeEvent('crash', { stack: '...' });
 *   beacon.shutdown();
 */
'use strict';

const addon = require('../beacon_napi.node');

/**
 * 初始化灯塔上报（进程启动时调用一次）。
 * @param {string} [paramsJson] 可选的初始化参数 JSON 字符串
 * @returns {number} 0 on success
 */
function init(paramsJson) {
  return addon.init(paramsJson == null ? undefined : String(paramsJson));
}

/**
 * 注入进程级公参（与每个事件合并上报）。
 * @param {object|string} params 公参 JSON 对象或字符串
 * @returns {number} 0 on success
 */
function setCommonParams(params) {
  return addon.setCommonParams(typeof params === 'string' ? params : (params || {}));
}

/**
 * 上报普通事件（按灯塔策略批量上报）。
 * @param {string} code 事件码
 * @param {object|string} [params] 事件级参数
 * @returns {number} 0 on success
 */
function reportEvent(code, params) {
  return addon.reportEvent(String(code), params == null ? undefined : params);
}

/**
 * 上报实时事件（立即上报）。
 * @param {string} code 事件码
 * @param {object|string} [params] 事件级参数
 * @returns {number} 0 on success
 */
function reportRealtimeEvent(code, params) {
  return addon.reportRealtimeEvent(String(code), params == null ? undefined : params);
}

/**
 * 关闭（进程退出前调用，可选）。
 */
function shutdown() {
  return addon.shutdown();
}

/**
 * 检查当前是否在 iOA 内网环境（异步，不阻塞主线程）。
 * addon 侧通过 Napi::AsyncWorker 在 libuv 线程池执行，返回 Promise。
 * @returns {Promise<number>} 1 = 内网，0 = 非内网；addon 不支持时返回 -1
 */
function checkIsIoaNetwork() {
  if (typeof addon.checkIsIoaNetwork !== 'function') return Promise.resolve(-1);
  return addon.checkIsIoaNetwork();
}

module.exports = {
  init,
  setCommonParams,
  reportEvent,
  reportRealtimeEvent,
  shutdown,
  checkIsIoaNetwork,
};
