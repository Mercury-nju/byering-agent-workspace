const E = window.__MARVIS_REACT_JSX_RUNTIME__;
if (!E)
  throw new Error("[marvis-card] window.__MARVIS_REACT_JSX_RUNTIME__ 未注入；请确认主端已调用 installMarvisCardHostRuntime() 暴露 React 实例");
const { Fragment: N, jsx: S, jsxs: D } = E, g = window.__MARVIS_REACT__;
if (!g)
  throw new Error("[marvis-card] window.__MARVIS_REACT__ 未注入；请确认主端已调用 installMarvisCardHostRuntime() 暴露 React 实例");
const { Activity: P, Children: k, Component: U, Fragment: j, Profiler: V, PureComponent: $, StrictMode: x, Suspense: G, act: H, cache: Y, cloneElement: q, createContext: F, createElement: J, createRef: K, forwardRef: W, isValidElement: B, lazy: z, memo: X, startTransition: Q, use: Z, useActionState: ee, useCallback: te, useContext: re, useDebugValue: ne, useDeferredValue: oe, useEffect: se, useId: ce, useImperativeHandle: ae, useInsertionEffect: _e, useLayoutEffect: ie, useMemo: R, useOptimistic: ue, useReducer: de, useRef: le, useState: fe, useSyncExternalStore: Ee, useTransition: ge, version: Re } = g, me = {
  /** 账号登录态校验 */
  ACCOUNT_CHECK: "chat_card_ordering_tea__account_check",
  /** 瑞幸登录提交结果 */
  LOGIN_SUBMIT_RESULT: "chat_card_ordering_tea__login_submit_result",
  /** 门店查询卡 */
  STORE_QUERY_RESULT: "chat_card_ordering_tea__store_query_result",
  /** 配送地址查询/选择结果 */
  DELIVERY_ADDRESS_RESULT: "chat_card_ordering_tea__delivery_address_result",
  /** 下单确认生成 */
  ORDER_CONFIRM_GENERATE: "chat_card_ordering_tea__order_confirm_generate",
  /** 创建订单结果 */
  ORDER_CREATE_RESULT: "chat_card_ordering_tea__order_create_result",
  /** 支付信息生成结果 */
  PAYMENT_GENERATE_RESULT: "chat_card_ordering_tea__payment_generate_result",
  /** 支付结果-成功 */
  PAYMENT_RESULT_SUCCESS: "chat_card_ordering_tea__payment_result_success",
  /** 支付结果-失败 */
  PAYMENT_RESULT_FAILED: "chat_card_ordering_tea__payment_result_failed",
  /** 异常兜底处理 */
  EXCEPTION_FALLBACK: "chat_card_ordering_tea__exception_fallback"
}, p = "chat_card_ordering_tea";
let l = null;
function h(e) {
  l = e;
}
let m = {};
function C(e) {
  m = e;
}
function Se(e) {
  const { sourceMetadata: t, messageId: r, brand: n, conversationId: s } = e;
  R(() => {
    const o = {};
    r && (o.message_id = r), t?.source && (o.conversation_platform = t.source), n !== void 0 && (o.order_brand = String(n)), s && (o.conversation_id = s), C(o);
  }, [r, t, n, s]);
}
function pe(e, t = {}, r) {
  if (!l)
    return;
  const n = {
    ...m,
    ...r,
    ...t
  }, s = {};
  for (const [o, c] of Object.entries(n))
    c != null && (s[o] = typeof c == "object" ? JSON.stringify(c) : String(c));
  l.reportEvent({
    pgid: p,
    eventName: e,
    businessParams: s
  });
}
const A = "marvis_client", O = "fpzkeTlcGLVP37qiOWd29MyaOqaJYxMi";
let f = null;
function T(e) {
  f = e;
}
async function he(e, t) {
  if (!f)
    throw new Error("[ualAccess] 宿主请求能力未注入：请确认卡片入口已调用 useHostRequest(api)");
  return f({
    path: e,
    body: t,
    accessKey: O,
    bid: A,
    needLogin: !0,
    silentAuth: !0
  });
}
function Ce(e) {
  R(() => {
    T(e.postWithSignature), h(e.datongReport ?? null);
  }, [e]);
}
function _(e, t) {
  if (t.length === 0) return [e];
  const r = /* @__PURE__ */ new Set(), n = [], s = e.replace(/\{(\d+)(?:![je])?\}/g, (c, u) => {
    const d = Number(u);
    if (d >= t.length) return c;
    r.add(d);
    const a = t[d];
    return a !== null && typeof a == "object" ? (n.push(a), "%o") : String(a);
  }), o = t.filter((c, u) => !r.has(u));
  return [s, ...n, ...o];
}
const y = {
  debug(e, ...t) {
    console.debug(..._(e, t));
  },
  info(e, ...t) {
    console.info(..._(e, t));
  },
  warn(e, ...t) {
    console.warn(..._(e, t));
  },
  error(e, ...t) {
    console.error(..._(e, t));
  }
}, M = "__MARVIS_CARD_LOGGER__";
function i() {
  return globalThis[M] ?? y;
}
function Ae(e) {
  return {
    debug(t, ...r) {
      i().debug(`[${e}] ${t}`, ...r);
    },
    info(t, ...r) {
      i().info(`[${e}] ${t}`, ...r);
    },
    warn(t, ...r) {
      i().warn(`[${e}] ${t}`, ...r);
    },
    error(t, ...r) {
      i().error(`[${e}] ${t}`, ...r);
    }
  };
}
const b = ["weixin_channel", "mobile"];
function v(e) {
  return e?.source ?? e?.created_source ?? "pc";
}
function Oe(e) {
  return b.includes(v(e));
}
const I = "_placeholder_1o4ki_3", L = {
  placeholder: I
}, Te = () => /* @__PURE__ */ S("div", { className: L.placeholder, children: "移动端正在点单..." }), w = "invoke_mcp_tool";
function ye(e) {
  if (!e) return {};
  let t;
  if (typeof e.arguments == "string")
    try {
      const r = JSON.parse(e.arguments);
      t = r && typeof r == "object" ? r : {};
    } catch {
      t = {};
    }
  else e.arguments && typeof e.arguments == "object" && (t = e.arguments);
  if (!t)
    return e;
  if (e.name === w) {
    const r = t.arguments;
    if (typeof r == "string")
      try {
        const n = JSON.parse(r);
        return n && typeof n == "object" ? n : {};
      } catch {
        return {};
      }
    return r && typeof r == "object" ? r : {};
  }
  return t;
}
const Me = {
  /** 瑞幸登录 / 注册卡片 */
  login: "luckin_login_card",
  /** 门店与取餐方式选择卡片 */
  storeSelect: "luckin_store_select_card",
  /** 收货地址选择卡片 */
  addressSelect: "luckin_address_select_card",
  /** 商品推荐卡片 */
  recommend: "luckin_recommend_card",
  /** SKU 规格选择卡片 */
  skuDetail: "luckin_sku_detail_card",
  /** 下单确认卡片 */
  orderConfirm: "luckin_order_confirm_card",
  /** 支付卡片 */
  payment: "luckin_payment_card"
};
function be(e, t = {}) {
  const r = { mod_id: e, ...t }, n = [];
  for (const [s, o] of Object.entries(r))
    o != null && n.push(`${encodeURIComponent(s)}=${encodeURIComponent(String(o))}`);
  return n.join("&");
}
export {
  j as F,
  Te as M,
  me as O,
  Se as a,
  fe as b,
  R as c,
  se as d,
  te as e,
  D as f,
  be as g,
  Ae as h,
  Oe as i,
  S as j,
  g as k,
  Me as l,
  le as m,
  ye as n,
  ie as o,
  he as p,
  N as q,
  pe as r,
  F as s,
  re as t,
  Ce as u,
  ce as v,
  J as w
};
