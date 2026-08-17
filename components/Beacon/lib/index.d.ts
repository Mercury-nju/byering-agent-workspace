/**
 * Marvis beacon_wrapper - Electron / Node.js TypeScript 声明
 */

/** 初始化灯塔上报（进程启动时调用一次）。可选传入初始化参数 JSON 字符串。 */
export function init(paramsJson?: string | null): number;

/** 注入进程级公参（多次调用按 key 累加/覆盖）。 */
export function setCommonParams(params: Record<string, unknown> | string): number;

/** 上报普通事件。 */
export function reportEvent(code: string, params?: Record<string, unknown> | string): number;

/** 上报实时事件（立即上报）。 */
export function reportRealtimeEvent(code: string, params?: Record<string, unknown> | string): number;

/** 关闭（进程退出前可选调用）。 */
export function shutdown(): void;

/**
 * 检查当前是否在 iOA 内网环境（异步，不阻塞主线程）。
 * 检测逻辑：检查 iOA 客户端是否安装 → DNS 解析 ioa.woa.com → TCP 连接 443 端口。
 * 总超时约 400ms。
 * @returns 1=在 iOA 内网，0=不在，-1=接口不可用
 */
export function checkIsIoaNetwork(): Promise<number>;
