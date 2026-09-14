const n = {
  /** 通用逻辑错误，不外显给用户，前端展示固定兜底文案 */
  GENERIC: -1,
  /** 品牌方错误提示，message 直接外显给用户 */
  BRAND_DISPLAY: -100
};
class t extends Error {
  /** 后端 base.code */
  code;
  /** 后端 base.message 原文（是否外显由 code 决定） */
  serverMessage;
  /** 触发错误的接口名（便于日志定位） */
  operation;
  constructor(r, s, o) {
    super(`[${r}] code=${s} ${o}`), this.name = "ApiError", this.code = s, this.serverMessage = o, this.operation = r;
  }
}
function i(e) {
  return e === n.BRAND_DISPLAY;
}
function u(e, r) {
  if (!r?.success)
    throw new t(e, r?.code ?? n.GENERIC, r?.message ?? "");
}
function c(e, r) {
  return e && i(e.code) && e.message ? e.message : r;
}
function a(e, r) {
  return e instanceof t ? c({ code: e.code, message: e.serverMessage }, r) : r;
}
export {
  a,
  u as e,
  c as r
};
