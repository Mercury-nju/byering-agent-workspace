import { m as ee, c as de, e as k, d as _e, n as Qt, h as Oe, b as z, p as we, r as ve, O as Ie, l as J, j as l, f, g as ue, q as We, k as se, o as Yt, i as Wt, M as Kt, u as Xt, a as jt } from "../report-BkiHygWt.js";
import { e as Ee, a as xe } from "../apiError-CRSB73RG.js";
import { a as Zt, b as Jt, e as er } from "../empty-C-sLburo.js";
import { s as it, u as tr, A as ct } from "../index-c2GmKP5G.js";
var rr = function(e) {
  return typeof e == "number";
}, Le = function(e) {
  var t = ee(e);
  t.current = de(function() {
    return e;
  }, [e]);
  var r = ee(void 0);
  return r.current || (r.current = function() {
    for (var a = [], u = 0; u < arguments.length; u++)
      a[u] = arguments[u];
    return t.current.apply(this, a);
  }), r.current;
}, lt = function(e, t, r) {
  r === void 0 && (r = {});
  var a = Le(e), u = ee(null), m = k(function() {
    u.current && clearInterval(u.current);
  }, []);
  return _e(function() {
    if (!(!rr(t) || t < 0))
      return r.immediate && a(), u.current = setInterval(a, t), m;
  }, [t, r.immediate]), m;
}, Ce = /* @__PURE__ */ ((e) => (e[e.PENDING_PAY = 10] = "PENDING_PAY", e[e.PAID = 20] = "PAID", e[e.MAKING = 30] = "MAKING", e[e.WAITING_ACCEPT = 40] = "WAITING_ACCEPT", e[e.DELIVERING = 50] = "DELIVERING", e[e.WAITING_PICKUP = 60] = "WAITING_PICKUP", e[e.DELIVERED = 70] = "DELIVERED", e[e.COMPLETED = 80] = "COMPLETED", e[e.CANCELED = 100] = "CANCELED", e))(Ce || {});
const vt = "place-order-card", nr = 10080 * 60 * 1e3, dt = 5, or = "https://marvis.qq.com", Ke = {
  recommend: "为你推荐以下饮品，确认数量后即可下单",
  confirm: "请确认下单信息，并在5分钟内完成支付，过时订单将会取消",
  pay: "订单已创建，请尽快完成支付"
}, me = 2, Be = 1, It = /* @__PURE__ */ new Set([
  Ce.PAID,
  Ce.MAKING,
  Ce.WAITING_ACCEPT,
  Ce.DELIVERING,
  Ce.WAITING_PICKUP,
  Ce.DELIVERED,
  Ce.COMPLETED
]), ot = /* @__PURE__ */ new Set([Ce.CANCELED]), ut = 3e3, sr = 800, Xe = 1e3, ar = 3, cr = Oe("parsePlaceOrderParams"), Ge = (e, t = 0) => {
  const r = typeof e == "string" ? Number(e) : e;
  return Number.isFinite(r) ? r : t;
}, ie = (e) => e ? Ge(e.amount_cents, 0) : 0, ir = (e) => ie(e.estimate_price), lr = (e) => ie(e.init_price), wt = (e) => ie(e.init_total_price), dr = (e) => ie(e.estimate_total_price), mt = (e, t) => e?.fulfillment || t.fulfillment, ur = (e) => ({
  group_id: String(e.group_id ?? e.groupId ?? ""),
  option_id: String(e.option_id ?? e.optionId ?? "")
}), mr = (e) => {
  let t = e;
  if (typeof e == "string")
    try {
      t = JSON.parse(e);
    } catch {
      t = {};
    }
  const r = t.selected_options ?? t.selectedOptions, a = t.sku_code ?? t.skuCode;
  return {
    item_id: String(t.product_id ?? t.itemId ?? t.productId ?? ""),
    sku_code: a ? String(a) : void 0,
    selected_options: (r ?? []).map(ur),
    quantity: Math.max(0, Math.floor(Ge(t.amount, 0)))
  };
};
function _r(e) {
  let t;
  if (typeof e == "string")
    try {
      t = JSON.parse(e);
    } catch (o) {
      cr.error("params 字符串解析失败，使用空对象 {0!e}", o), t = {};
    }
  else
    t = e;
  const r = Qt(t), a = r.product_list ?? r.productList, u = Ge(r.fulfillment, Be) === me ? me : Be, m = r.store_id ?? r.storeId, g = r.address_id ?? r.addressId, M = r.direct_pay ?? r.directPay;
  return {
    brand: Ge(r.brand, 1),
    storeId: String(m ?? ""),
    fulfillment: u,
    addressId: g ? String(g) : void 0,
    directPay: !!M,
    productList: (a ?? []).map(mr)
  };
}
function je(e) {
  return {
    brand: e.brand,
    store_id: e.storeId,
    fulfillment: e.fulfillment,
    lines: e.productList,
    address_id: e.fulfillment === me ? e.addressId : void 0,
    auto_apply_coupon: !0
  };
}
function fr(e) {
  return {
    brand: e.brand,
    store_id: e.storeId,
    item_id: e.itemId,
    fulfillment: e.fulfillment
  };
}
function pr(e) {
  return e.map((t) => ({
    item_id: t.itemId,
    sku_code: t.skuCode || void 0,
    selected_options: t.selectedOptions,
    quantity: t.quantity
  }));
}
function Ze(e) {
  return e.map((t) => ({
    item_id: t.itemId,
    sku_code: t.skuCode || void 0,
    selected_options: [],
    quantity: t.quantity
  }));
}
function Je(e) {
  return e.map((t) => `${t.itemId}__${t.skuCode}__${t.quantity}`).join(";");
}
function hr({
  params: e,
  cart: t,
  expectedPayCents: r,
  couponCodes: a,
  sessionId: u,
  preview: m,
  addressDetail: g
}) {
  return {
    brand: e.brand,
    store_id: e.storeId,
    fulfillment: e.fulfillment,
    lines: pr(t),
    address_id: e.fulfillment === me ? e.addressId : void 0,
    coupon_codes: a && a.length > 0 ? a : void 0,
    expected_pay_cents: r,
    session_id: u,
    // preview 内的收货地址以 enterPay 传入的 deliveryAddress 为准
    preview: {
      ...m,
      // 仅外卖透传配送地址详情；自取无配送地址，不挂该字段
      ...e.fulfillment === me ? { delivery_address: m.delivery_address ?? g } : {}
    }
  };
}
function gr(e) {
  return {
    brand: e.brand,
    store_id: e.storeId,
    item_id: e.itemId,
    sku_code: e.skuCode,
    quantity: e.quantity,
    selected_options: e.selectedOptions,
    fulfillment: e.fulfillment
  };
}
function Te(e) {
  return e.lines.map((t) => ({
    itemId: t.item_id,
    skuCode: t.sku_code,
    selectedOptions: yr(t.customization_groups),
    quantity: t.quantity,
    name: t.item_name,
    specSummary: t.spec_summary,
    unitPriceCents: ir(t),
    originalPriceCents: lr(t),
    initTotalPriceCents: wt(t),
    estimateTotalPriceCents: dr(t),
    imageUrl: t.image_url
  }));
}
function He(e) {
  const { amount: t } = e;
  return {
    totalOriginalCents: ie(t.total_original),
    subtotalCents: e.lines.reduce((r, a) => r + wt(a), 0),
    deliveryFeeCents: ie(t.delivery_fee),
    packagingFeeCents: ie(t.packaging_fee),
    discountCents: ie(t.total_discount),
    actualPayCents: ie(t.actual_pay)
  };
}
function Et(e) {
  const t = e.fulfillment === me ? me : Be;
  return {
    storeName: e.store?.store_name,
    storeIcon: e.store?.store_icon,
    fulfillment: t,
    scheduledTime: e.scheduled_time || ("estimated_ready" in e ? e.estimated_ready : void 0) || void 0,
    couponLabel: e.coupons?.[0]?.coupon_name
  };
}
function yr(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  return e.forEach((r) => {
    r.options.forEach((a) => {
      (a.is_selected || r.options.length === 1) && t.push({ group_id: r.group_id, option_id: a.option_id });
    });
  }), t;
}
function _t(e, t) {
  const r = t.fulfillment === me ? me : Be;
  return {
    storeName: e.store_name,
    storeIcon: e.store_icon,
    fulfillment: r
  };
}
function Cr(e) {
  return e.reduce((t, r) => t + r.quantity, 0);
}
function Mt(e) {
  return !e || e.length === 0 ? "" : e.map((t) => (t.options.find((r) => r.is_default) ?? t.options[0])?.option_name).filter(Boolean).join("/");
}
function ft(e, t) {
  return e.map((r) => r.options.find((a) => a.option_id === t[r.group_id])?.option_name).filter(Boolean).join("/");
}
function At(e) {
  return e.map((t) => ({
    item_id: t.itemId,
    item_name: t.name,
    spec_summary: t.specSummary,
    quantity: t.quantity,
    original_total_price_cents: t.initTotalPriceCents,
    estimate_total_price_cents: t.estimateTotalPriceCents,
    image_url: t.imageUrl
  }));
}
function Pr(e) {
  if (e == null || e === "")
    return "";
  const t = typeof e == "string" ? Number(e) : e;
  if (!Number.isFinite(t) || t <= 0)
    return "";
  const r = new Date(t), a = (u) => String(u).padStart(2, "0");
  return `${r.getFullYear()}-${a(r.getMonth() + 1)}-${a(r.getDate())} ${a(r.getHours())}:${a(r.getMinutes())}`;
}
const pt = (e) => It.has(e), ht = (e) => It.has(e) || ot.has(e), Nr = Oe("useDeliveryAddress");
function br(e) {
  const { brand: t, fulfillment: r, addressId: a } = e, [u, m] = z(void 0), [g, M] = z(!1), o = ee(void 0), s = r === me;
  return _e(() => {
    if (!s || !a) {
      a || (o.current = void 0, m(void 0)), M(!1);
      return;
    }
    if (o.current === a)
      return;
    m(void 0), M(!0);
    let n = !0;
    return Zt.listAddresses({ brand: t }).then((c) => {
      if (!n) return;
      const i = c.find((p) => p.address_id === a);
      o.current = a, m(i);
    }).catch((c) => {
      n && Nr.warn("listAddresses 失败，PayStep 配送至将不渲染 {0!e}, addressId={1}", c, a);
    }).finally(() => {
      n && M(!1);
    }), () => {
      n = !1;
    };
  }, [t, s, a]), {
    // 地址唯一来源：地址列表接口按 addressId 命中项；不回退任何接口返回的地址
    address: u,
    loading: g
  };
}
const Me = Oe("CommerceApi"), vr = "/v3/marvis_commerce_preview_order", Ir = "/v3/marvis_commerce_search_products", wr = "/v3/marvis_commerce_get_product", Er = "/v3/marvis_commerce_price_sku", Mr = "/v3/marvis_commerce_create_order", Ar = "/v3/marvis_commerce_query_order", Sr = "/v3/marvis_commerce_cancel_order", Rr = "/v3/marvis_commerce_get_auth_profile";
class Lr {
  /** 获取auth信息 品牌 */
  async getAuthProfile(t) {
    try {
      const r = await we(Rr, t);
      return Ee("getAuthProfile", r?.base), r;
    } catch (r) {
      throw Me.error("getAuthProfile 接口失败 brand={0} {1!e}", t.brand, r), r;
    }
  }
  /** 订单预览：返回 OrderPreview（含 lines 详情 / store / amount / address / payment） */
  async previewOrder(t) {
    try {
      const r = await we(vr, t);
      return Ee("previewOrder", r?.base), r.preview;
    } catch (r) {
      throw Me.error("previewOrder 接口失败 brand={0} storeId={1} {2!e}", t.brand, t.store_id, r), r;
    }
  }
  async searchProducts(t) {
    try {
      const r = await we(Ir, t);
      return Ee("searchProducts", r?.base), r;
    } catch (r) {
      throw Me.error(
        "searchProducts 接口失败 brand={0} storeId={1} keyword={2} {3!e}",
        t.brand,
        t.store_id,
        t.keyword,
        r
      ), r;
    }
  }
  async getProduct(t) {
    try {
      const r = await we(wr, t);
      return Ee("getProduct", r?.base), r;
    } catch (r) {
      throw Me.error(
        "getProduct 接口失败 brand={0} storeId={1} itemId={2} {3!e}",
        t.brand,
        t.store_id,
        t.item_id,
        r
      ), r;
    }
  }
  /** SKU 实时算价：返回最新单价 + sku_code + 重算后的定制组（is_selected/is_available） */
  async priceSku(t) {
    try {
      const r = await we(Er, t);
      return Ee("priceSku", r?.base), r;
    } catch (r) {
      throw Me.error(
        "priceSku 接口失败 brand={0} storeId={1} itemId={2} {3!e}",
        t.brand,
        t.store_id,
        t.item_id,
        r
      ), r;
    }
  }
  /** 创建订单：点击「立即支付」时调用，返回订单号 + 支付链接，进入待支付步 */
  async createOrder(t) {
    try {
      const r = await we(Mr, t);
      return Ee("createOrder", r?.base), {
        orderId: r.order_id,
        needPay: r.need_pay,
        tradeNo: r.trade_no,
        payUrl: r.pay_order_url
      };
    } catch (r) {
      throw Me.error(
        "createOrder 接口失败 brand={0} storeId={1} clientOrderId={2} {3!e}",
        t.brand,
        t.store_id,
        t.client_order_id,
        r
      ), r;
    }
  }
  /** 查询订单详情：PayStep 首次拉取 + 2s 轮询用，返回完整 Order（含 status / pay_time_left） */
  async getOrder(t) {
    try {
      const r = await we(Ar, t);
      return Ee("getOrder", r?.base), r.order;
    } catch (r) {
      throw Me.error("getOrder 接口失败 brand={0} orderId={1} {2!e}", t.brand, t.order_id, r), r;
    }
  }
  /** 取消订单：PayStep「取消订单」按钮触发，成功后由轮询拿到 status=9 统一收尾 */
  async cancelOrder(t) {
    try {
      const r = await we(Sr, t);
      Ee("cancelOrder", r?.base);
    } catch (r) {
      throw Me.error("cancelOrder 接口失败 brand={0} orderId={1} {2!e}", t.brand, t.order_id, r), r;
    }
  }
}
const be = new Lr(), et = Oe("usePayPolling"), tt = /* @__PURE__ */ new Set(), ke = (e) => !e || typeof e.pay_time_left != "number" ? 0 : Math.max(0, Math.floor(e.pay_time_left)), Tr = 3, gt = (e) => {
  const t = ke(e);
  return t <= 0 ? 0 : Date.now() + t * 1e3;
}, yt = (e) => {
  if (e <= 0) return 0;
  const t = e - Date.now();
  return t <= 0 ? 0 : Math.ceil(t / 1e3);
};
function kr(e) {
  const { brand: t, orderId: r, initialOrder: a, onSettled: u, onError: m } = e, [g, M] = z(a ?? null), [o, s] = z(ke(a)), [n, c] = z(!a), [i, p] = z(!1), d = ee(gt(a)), C = ee(!1), y = ee(!1), D = ee(0), A = ee(!1), N = ee(0), [w, R] = z(r ? ut : void 0), [O, Q] = z(r ? Xe : void 0);
  _e(() => {
    !r || C.current || (R(ut), a && ke(a) > 0 && (d.current = gt(a), s(ke(a))), (!a || ke(a) > 0) && Q(Xe));
  }, [r]);
  const x = Le((b, $) => {
    if (C.current)
      return;
    C.current = !0, R(void 0), Q(void 0);
    const L = $ ?? (b.status === "success" ? b.order : null), E = L ? ie(L.amount.actual_pay) : 0, V = L?.order_id ?? r;
    b.status === "success" ? ve(
      Ie.PAYMENT_RESULT_SUCCESS,
      { total_amount_cents: E, order_id: V },
      { card_id: J.payment }
    ) : ve(
      Ie.PAYMENT_RESULT_FAILED,
      {
        total_amount_cents: E,
        fail_reason: b.status,
        order_id: V
      },
      { card_id: J.payment }
    ), u(b);
  }), S = Le((b) => {
    m?.(b);
  }), G = Le(async () => {
    if (!(!r || C.current))
      try {
        const b = await be.getOrder({ brand: t, order_id: r });
        N.current = 0, M(b), b.status !== Ce.PENDING_PAY && et.warn(
          "订单状态非等待支付 orderId={0}, status={1}, status_text={2}",
          r,
          b.status,
          b.status_text
        );
        const $ = ke(b), L = yt(d.current);
        Math.abs($ - L) >= Tr ? (d.current = $ > 0 ? Date.now() + $ * 1e3 : 0, s($), $ > 0 && !y.current && Q(Xe)) : $ === 0 && L === 0 && s(0), ht(b.status) ? pt(b.status) ? x({ status: "success", order: b }) : ot.has(b.status) && x({ status: A.current ? "user_cancel" : "timeout" }, b) : b.status === Ce.PENDING_PAY && $ === 0 && x({ status: A.current ? "user_cancel" : "timeout" }, b);
      } catch (b) {
        N.current += 1, et.warn(
          "GetOrder 失败，保留上次展示 {0!e}, orderId={1}, failureCount={2}",
          b,
          r,
          N.current
        ), N.current >= ar && (S(b), ve(
          Ie.EXCEPTION_FALLBACK,
          {
            exception_type: "get_order_polling_failed",
            order_id: r,
            fail_reason: b instanceof Error ? b.message : String(b)
          },
          { card_id: J.payment }
        ));
      }
  }), T = Le(async () => {
    if (!r || C.current || tt.has(r))
      return;
    const b = Date.now();
    if (!(b - D.current < sr)) {
      D.current = b, tt.add(r);
      try {
        await G();
      } finally {
        tt.delete(r);
      }
    }
  });
  _e(() => {
    a || !r || (c(!0), G().finally(() => {
      c(!1);
    }));
  }, [r]), _e(() => {
    a && ht(a.status) && (pt(a.status) ? x({ status: "success", order: a }) : ot.has(a.status) && x({ status: A.current ? "user_cancel" : "timeout" }, a));
  }, []), lt(() => {
    T();
  }, w), lt(() => {
    if (d.current <= 0)
      return;
    const b = yt(d.current);
    s(b), b === 0 && (Q(void 0), y.current = !0, C.current || T());
  }, O);
  const ae = Le(async () => {
    if (!(!r || i || C.current)) {
      p(!0);
      try {
        await be.cancelOrder({ brand: t, order_id: r }), A.current = !0;
      } catch (b) {
        throw et.error("CancelOrder 失败 {0!e}, orderId={1}", b, r), ve(
          Ie.EXCEPTION_FALLBACK,
          {
            exception_type: "cancel_order_failed",
            order_id: r,
            fail_reason: b instanceof Error ? b.message : String(b)
          },
          { card_id: J.payment }
        ), b;
      } finally {
        p(!1);
      }
    }
  });
  return {
    order: g,
    remainSeconds: o,
    isFirstLoading: n,
    cancelLoading: i,
    cancel: ae
  };
}
function Dr(e, t) {
  return `${vt}:${e || "default"}:${t || "default"}`;
}
function St(e, t = Date.now()) {
  return Number.isFinite(e.updatedAt) && t - e.updatedAt > nr;
}
function xr(e) {
  try {
    const t = localStorage.getItem(e);
    if (!t)
      return null;
    const r = JSON.parse(t);
    return !r || !Array.isArray(r.cart) ? null : St(r) ? (ze(e), null) : r;
  } catch {
    return null;
  }
}
function Or(e, t) {
  try {
    localStorage.setItem(e, JSON.stringify(t));
  } catch {
  }
}
function ze(e) {
  try {
    localStorage.removeItem(e);
  } catch {
  }
}
function Fr() {
  const e = [];
  for (let t = 0; t < localStorage.length; t += 1) {
    const r = localStorage.key(t);
    r && r.startsWith(`${vt}:`) && e.push(r);
  }
  return e;
}
function qr(e = Date.now()) {
  try {
    const t = [];
    for (const r of Fr()) {
      const a = localStorage.getItem(r);
      let u = !a, m = 0;
      if (a)
        try {
          const g = JSON.parse(a);
          m = Number.isFinite(g?.updatedAt) ? g.updatedAt : 0, u = !g || !Array.isArray(g.cart) || St(g, e);
        } catch {
          u = !0;
        }
      u ? ze(r) : t.push({ key: r, updatedAt: m });
    }
    t.length > dt && t.sort((r, a) => r.updatedAt - a.updatedAt).slice(0, t.length - dt).forEach(({ key: r }) => ze(r));
  } catch {
  }
}
const Ae = Oe("usePlaceOrderState");
function Br(e) {
  if (e)
    return /weixin:\/\/wxpay\/bizpayurl\?pr=/.test(e) ? e.replace(/(pr=)[^&]+/, "$1***") : `${e.slice(0, 4)}***`;
}
const $r = {
  totalOriginalCents: 0,
  subtotalCents: 0,
  deliveryFeeCents: 0,
  packagingFeeCents: 0,
  discountCents: 0,
  actualPayCents: 0
};
function rt(e) {
  return e.directPay ? "confirm" : "recommend";
}
function Vr(e) {
  return e.productList.map((t) => ({ itemId: t.item_id, skuCode: t.sku_code ?? "", quantity: t.quantity })).filter((t) => t.quantity > 0);
}
function Ur(e, t, r, a) {
  const u = de(() => Dr(t, r), [t, r]), [m, g] = z("loading"), [M, o] = z(void 0), [s, n] = z(null), [c, i] = z(null), [p, d] = z({}), [C, y] = z(!0), [D, A] = z(!1), [N, w] = z(null), [R, O] = z([]), Q = ee(R);
  Q.current = R;
  const [x, S] = z(!1), [G, T] = z(() => ({
    step: rt(e),
    cart: [],
    updatedAt: Date.now()
  })), ae = ee(a);
  _e(() => {
    ae.current = a;
  }, [a]);
  const b = ee(!1), $ = ee(!1), L = ee(null), E = ee(null), V = k(() => {
    let h = !0;
    g("loading"), o(void 0), i(null), S(!1);
    const _ = xr(u), v = _ ? _.cart.filter((P) => P.quantity > 0) : Vr(e), B = Ze(v), I = Je(v);
    return B.length === 0 ? (n(null), O([]), T({
      step: _?.step ?? rt(e),
      cart: [],
      orderId: _?.orderId,
      orderCreatedAt: _?.orderCreatedAt,
      payUrl: _?.payUrl,
      updatedAt: Date.now()
    }), L.current = "", $.current = !0, g("ready"), it.getStoreDetail({ brand: e.brand, store_id: e.storeId }).then((P) => {
      h && P?.store && i(_t(P.store, e));
    }).catch((P) => {
      Ae.error("空车门店头 GetStore 失败 brand={0} storeId={1} {2!e}", e.brand, e.storeId, P);
    }), () => {
      h = !1;
    }) : (be.previewOrder({ ...je(e), lines: B }).then((P) => {
      if (!h)
        return;
      n(P), O(Te(P)), T({
        step: _?.step ?? rt(e),
        cart: v,
        orderId: _?.orderId,
        orderCreatedAt: _?.orderCreatedAt,
        payUrl: _?.payUrl,
        updatedAt: Date.now()
      }), L.current = I, E.current = { preview: P, requestLines: v, sig: I }, $.current = !0, g("ready");
      const j = He(P), X = Te(P);
      ve(
        Ie.ORDER_CONFIRM_GENERATE,
        {
          store_id: P.store?.store_id ?? e.storeId,
          product_count: X.length,
          sku_id: X[0]?.skuCode,
          fulfillment_type: P.fulfillment === me ? "delivery" : "self_pickup",
          generate_result: 1,
          original_price: j.subtotalCents,
          discounted_price: j.actualPayCents,
          total_price: j.totalOriginalCents,
          delivery_fee: j.deliveryFeeCents
        },
        { card_id: J.orderConfirm }
      );
    }).catch((P) => {
      h && (Ae.error("订单预览失败，清空购物车 {0!e}", P), ve(
        Ie.EXCEPTION_FALLBACK,
        {
          exception_type: "preview_order_failed",
          fail_reason: P instanceof Error ? P.message : String(P)
        },
        { card_id: J.recommend }
      ), n(null), O([]), T({
        step: "recommend",
        cart: [],
        orderId: _?.orderId,
        orderCreatedAt: _?.orderCreatedAt,
        payUrl: _?.payUrl,
        updatedAt: Date.now()
      }), L.current = "", $.current = !0, g("ready"), ae.current?.(xe(P, "请求失败，请重试"), "error"));
    }), () => {
      h = !1;
    });
  }, [e, u]);
  _e(() => V(), [V]), _e(() => {
    let h = !0;
    const _ = Array.from(new Set(e.productList.map((v) => v.item_id))).filter(Boolean);
    if (_.length === 0) {
      Ae.warn("商品列表为空，跳过 GetProduct 拉取"), d({}), y(!1);
      return;
    }
    return y(!0), Promise.allSettled(
      _.map(
        (v) => be.getProduct(
          fr({
            brand: e.brand,
            storeId: e.storeId,
            itemId: v,
            fulfillment: e.fulfillment
          })
        )
      )
    ).then((v) => {
      if (!h)
        return;
      const B = {};
      v.forEach((I, P) => {
        I.status === "fulfilled" ? B[I.value.product.item_id] = I.value.product : Ae.error(
          "GetProduct 失败（第 {0}/{1} 个商品）itemId={2} {3!e}",
          P + 1,
          _.length,
          _[P],
          I.reason
        );
      }), d(B);
    }).finally(() => {
      h && y(!1);
    }), () => {
      h = !1;
    };
  }, [e]), _e(() => {
    qr();
  }, []), _e(() => {
    b.current || !$.current || Or(u, G);
  }, [u, G]);
  const W = ee(0), re = k(
    (h) => {
      const _ = Ze(h).filter((I) => I.quantity > 0), v = Je(h);
      if (_.length === 0) {
        n(null), O([]), S(!1), c || it.getStoreDetail({ brand: e.brand, store_id: e.storeId }).then((I) => {
          I?.store && i(_t(I.store, e));
        }).catch((I) => {
          Ae.error(
            "reprice 空车门店头 GetStore 失败 brand={0} storeId={1} {2!e}",
            e.brand,
            e.storeId,
            I
          );
        });
        return;
      }
      W.current += 1;
      const B = W.current;
      S(!0), be.previewOrder({ ...je(e), lines: _ }).then((I) => {
        B === W.current && v === L.current && (n(I), O(Te(I)), S(!1), E.current = { preview: I, requestLines: h, sig: v });
      }).catch((I) => {
        if (B !== W.current || v !== L.current)
          return;
        const P = E.current;
        if (P) {
          Ae.error("订单预览失败，恢复上次成功购物车 {0!e}", I), n(P.preview), O(Te(P.preview)), S(!1), L.current = P.sig, T((j) => ({
            ...j,
            cart: P.requestLines,
            updatedAt: Date.now()
          })), ae.current?.(xe(I, "订单预览失败，请重试"), "error");
          return;
        }
        Ae.error("订单预览失败，清空购物车 {0!e}", I), n(null), O([]), S(!1), L.current = "", T((j) => ({
          ...j,
          cart: [],
          step: j.step === "confirm" ? "recommend" : j.step,
          updatedAt: Date.now()
        })), ae.current?.(xe(I, "订单预览失败，请重试"), "error");
      });
    },
    [e, c]
  ), { run: fe } = tr(re, { wait: 300 }), le = de(() => Je(G.cart), [G.cart]);
  _e(() => {
    $.current && (L.current === null || le === L.current || (L.current = le, fe(G.cart)));
  }, [le, fe, G.cart]);
  const pe = k((h, _) => {
    const v = Q.current, B = v[h];
    if (!B)
      return;
    const I = B.quantity + _, P = I <= 0 ? v.filter((X, Y) => Y !== h) : v.map((X, Y) => Y === h ? { ...X, quantity: I } : X);
    Q.current = P, O(P);
    const j = P.map((X) => ({
      itemId: X.itemId,
      skuCode: X.skuCode,
      quantity: X.quantity
    }));
    T((X) => ({ ...X, cart: j, updatedAt: Date.now() }));
  }, []), he = k((h) => {
    T((_) => {
      const v = _.cart.findIndex((P) => P.itemId === h.itemId && P.skuCode === h.skuCode);
      if (h.replaceQuantity !== void 0) {
        const P = h.replaceQuantity;
        if (P <= 0) {
          const X = v >= 0 ? _.cart.filter((Y, oe) => oe !== v) : _.cart;
          return X === _.cart ? _ : { ..._, cart: X, updatedAt: Date.now() };
        }
        if (v >= 0) {
          const X = _.cart.map((Y, oe) => oe === v ? { ...Y, quantity: P } : Y);
          return { ..._, cart: X, updatedAt: Date.now() };
        }
        const j = [..._.cart, { itemId: h.itemId, skuCode: h.skuCode, quantity: P }];
        return { ..._, cart: j, updatedAt: Date.now() };
      }
      const B = h.quantity;
      if (v >= 0) {
        const P = _.cart[v].quantity + B, j = P <= 0 ? _.cart.filter((X, Y) => Y !== v) : _.cart.map((X, Y) => Y === v ? { ...X, quantity: P } : X);
        return { ..._, cart: j, updatedAt: Date.now() };
      }
      const I = [
        ..._.cart,
        { itemId: h.itemId, skuCode: h.skuCode, quantity: Math.max(1, B) }
      ];
      return { ..._, cart: I, updatedAt: Date.now() };
    });
  }, []), Ne = k(() => {
    T((h) => ({
      ...h,
      cart: [],
      updatedAt: Date.now()
    }));
  }, []), ge = k(
    (h, _) => {
      const v = R[h];
      if (!v)
        return;
      const B = _.skuCode || v.skuCode, I = _.quantity > 0 ? _.quantity : v.quantity, P = R.map((Y) => ({
        itemId: Y.itemId,
        skuCode: Y.skuCode,
        quantity: Y.quantity
      }));
      P[h] = { itemId: v.itemId, skuCode: B, quantity: I };
      const j = P.findIndex(
        (Y, oe) => oe !== h && Y.itemId === v.itemId && Y.skuCode === B
      ), X = j >= 0 ? P.map((Y, oe) => oe === j ? { ...Y, quantity: Y.quantity + I } : Y).filter((Y, oe) => oe !== h) : P;
      T((Y) => ({ ...Y, cart: X, updatedAt: Date.now() }));
    },
    [R]
  ), ne = k(() => {
    T((h) => ({
      ...h,
      cart: h.cart.filter((_) => _.quantity > 0),
      step: "confirm",
      updatedAt: Date.now()
    }));
  }, []), ye = k(
    async (h) => {
      if (G.orderId) {
        T((v) => ({ ...v, step: "pay", updatedAt: Date.now() }));
        return;
      }
      if (!s)
        throw new Error("订单数据未就绪，请重试");
      A(!0);
      const _ = Date.now();
      try {
        const v = Ze(G.cart).filter((qe) => qe.quantity > 0), B = await be.previewOrder({ ...je(e), lines: v });
        n(B);
        const I = Te(B);
        O(I);
        const P = He(B), j = ie(B.amount.actual_pay), X = (B.coupons ?? []).map((qe) => qe.coupon_code).filter(Boolean), Y = hr({
          params: e,
          cart: I,
          expectedPayCents: j,
          couponCodes: X,
          sessionId: t,
          addressDetail: h,
          preview: B
        }), oe = await be.createOrder(Y);
        ve(
          Ie.ORDER_CREATE_RESULT,
          {
            store_id: e.storeId,
            product_count: I.length,
            sku_id: I[0]?.skuCode,
            fulfillment_type: e.fulfillment === me ? "delivery" : "self_pickup",
            generate_result: 1,
            original_price: P.subtotalCents,
            discounted_price: P.actualPayCents,
            total_price: P.totalOriginalCents,
            delivery_fee: P.deliveryFeeCents,
            order_id: oe.orderId,
            create_result: 1,
            create_duration: Date.now() - _
          },
          { card_id: J.orderConfirm }
        );
        const Ve = Br(oe.payUrl);
        ve(
          Ie.PAYMENT_GENERATE_RESULT,
          {
            brand_order_id: oe.orderId,
            payment_method: "wechat_h5",
            payment_link: Ve,
            generate_result: 1
          },
          { card_id: J.payment }
        );
        const Ue = await be.getOrder({ brand: e.brand, order_id: oe.orderId });
        w(Ue), T((qe) => ({
          ...qe,
          step: "pay",
          orderId: oe.orderId,
          orderCreatedAt: Date.now(),
          payUrl: oe.payUrl,
          updatedAt: Date.now()
        }));
      } catch (v) {
        throw Ae.error("下单失败 orderId={0} {1!e}", G.orderId, v), ve(
          Ie.ORDER_CREATE_RESULT,
          {
            store_id: e.storeId,
            fulfillment_type: e.fulfillment === me ? "delivery" : "self_pickup",
            generate_result: 0,
            create_result: 0,
            fail_reason: v instanceof Error ? v.message : String(v),
            create_duration: Date.now() - _
          },
          { card_id: J.orderConfirm }
        ), v;
      } finally {
        A(!1);
      }
    },
    [G.orderId, G.cart, s, e, t]
  ), Fe = k(() => {
    b.current = !0, w(null), ze(u);
  }, [u]), Ye = de(() => s ? Et(s) : c, [s, c]), $e = de(() => s ? He(s) : $r, [s]);
  return {
    status: m,
    error: M,
    productDetails: p,
    productDetailsLoading: C,
    draft: G,
    cart: R,
    display: Ye,
    amounts: $e,
    pricing: x,
    creatingOrder: D,
    firstOrder: N,
    changeQuantity: pe,
    addCartLine: he,
    changeLineSpec: ge,
    clearCart: Ne,
    confirmSelection: ne,
    enterPay: ye,
    clear: Fe,
    retry: V
  };
}
const Pe = (e) => {
  if (e == null) return "--";
  const t = (e / 100).toFixed(2);
  return t.endsWith("0") ? t.slice(0, -1) : t;
}, Hr = "_productList_175s1_11", Gr = "_productListBoxed_175s1_19", zr = "_productItem_175s1_26", Qr = "_productItemPlain_175s1_35", Yr = "_productImage_175s1_44", Wr = "_productInfo_175s1_56", Kr = "_productName_175s1_64", Xr = "_productNameText_175s1_77", jr = "_productSpec_175s1_85", Zr = "_specText_175s1_94", Jr = "_productSpecClickable_175s1_106", en = "_specArrow_175s1_110", tn = "_productPrice_175s1_116", rn = "_priceMain_175s1_129", nn = "_priceSymbol_175s1_134", on = "_estimatePrice_175s1_141", sn = "_originalPrice_175s1_147", ce = {
  productList: Hr,
  productListBoxed: Gr,
  productItem: zr,
  productItemPlain: Qr,
  productImage: Yr,
  productInfo: Wr,
  productName: Kr,
  productNameText: Xr,
  productSpec: jr,
  specText: Zr,
  productSpecClickable: Jr,
  specArrow: en,
  productPrice: tn,
  priceMain: rn,
  priceSymbol: nn,
  estimatePrice: on,
  originalPrice: sn
}, Rt = ({ items: e, onSpecClick: t, specModId: r }) => {
  const a = e.length > 1;
  return /* @__PURE__ */ l("div", { className: `${ce.productList} ${a ? ce.productListBoxed : ""}`, children: e.map((u, m) => /* @__PURE__ */ f(
    "div",
    {
      className: `${ce.productItem} ${a ? ce.productItemPlain : ""}`,
      children: [
        /* @__PURE__ */ l("img", { className: ce.productImage, src: u.image_url, alt: u.item_name }),
        /* @__PURE__ */ f("div", { className: ce.productInfo, children: [
          /* @__PURE__ */ l("div", { className: ce.productName, children: /* @__PURE__ */ f("span", { className: ce.productNameText, children: [
            u.item_name,
            "*",
            u.quantity
          ] }) }),
          u.spec_summary && /* @__PURE__ */ f(
            "div",
            {
              className: `${ce.productSpec} ${t ? ce.productSpecClickable : ""}`,
              onClick: t ? () => t(u, m) : void 0,
              ...t && r ? {
                "dt-eid": "edit_item_spec_button",
                "dt-ename": "修改规格入口",
                "dt-params": ue(r, {
                  edit_target: "item_spec",
                  item_id: u.item_id
                })
              } : {},
              children: [
                /* @__PURE__ */ l("span", { className: ce.specText, children: u.spec_summary }),
                t && /* @__PURE__ */ l("img", { className: ce.specArrow, src: Jt, alt: "" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ f("div", { className: ce.productPrice, children: [
          /* @__PURE__ */ f("span", { className: ce.priceMain, children: [
            /* @__PURE__ */ l("span", { className: ce.priceSymbol, children: "¥" }),
            /* @__PURE__ */ l("span", { className: ce.estimatePrice, children: Pe(u.estimate_total_price_cents) })
          ] }),
          u.original_total_price_cents > u.estimate_total_price_cents && /* @__PURE__ */ f("span", { className: ce.originalPrice, children: [
            "¥",
            Pe(u.original_total_price_cents)
          ] })
        ] })
      ]
    },
    `${u.item_name}_${m}`
  )) });
}, an = "_orderCard_1imn8_8", cn = "_guideText_1imn8_37", ln = "_orderContent_1imn8_9", dn = "_scrollArea_1imn8_58", un = "_storeHeader_1imn8_68", mn = "_storeLogo_1imn8_83", _n = "_storeName_1imn8_92", fn = "_infoList_1imn8_106", pn = "_infoRow_1imn8_113", hn = "_infoLabel_1imn8_121", gn = "_infoValue_1imn8_136", yn = "_infoValueColumn_1imn8_201", Cn = "_infoSubValue_1imn8_229", Pn = "_infoValueDiscount_1imn8_258", Nn = "_footer_1imn8_290", bn = "_hasDiscount_1imn8_301", vn = "_priceBox_1imn8_306", In = "_priceMain_1imn8_324", wn = "_priceSymbol_1imn8_330", En = "_actualPrice_1imn8_339", Mn = "_discountTag_1imn8_347", An = "_actions_1imn8_370", Sn = "_btnCancel_1imn8_376", Rn = "_btnPrimary_1imn8_420", U = {
  orderCard: an,
  guideText: cn,
  orderContent: ln,
  scrollArea: dn,
  storeHeader: un,
  storeLogo: mn,
  storeName: _n,
  infoList: fn,
  infoRow: pn,
  infoLabel: hn,
  infoValue: gn,
  infoValueColumn: yn,
  infoSubValue: Cn,
  infoValueDiscount: Pn,
  footer: Nn,
  hasDiscount: bn,
  priceBox: vn,
  priceMain: In,
  priceSymbol: wn,
  actualPrice: En,
  discountTag: Mn,
  actions: An,
  btnCancel: Sn,
  btnPrimary: Rn
}, Lt = "data:image/svg+xml,%3csvg%20width='20'%20height='20'%20viewBox='0%200%2020%2020'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3crect%20x='0.5'%20y='0.5'%20width='19'%20height='19'%20rx='9.5'%20stroke='black'/%3e%3cpath%20d='M6.39844%2010H13.5984'%20stroke='black'%20stroke-linecap='round'/%3e%3c/svg%3e", Tt = "data:image/svg+xml,%3csvg%20width='20'%20height='20'%20viewBox='0%200%2020%2020'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3crect%20width='20'%20height='20'%20rx='10'%20fill='black'/%3e%3cpath%20d='M6%2010H14'%20stroke='white'%20stroke-linecap='round'/%3e%3cpath%20d='M10%206L10%2014'%20stroke='white'%20stroke-linecap='round'/%3e%3c/svg%3e", Ln = "_specPanelBox_hxrfm_9", Tn = "_specPanel_hxrfm_9", kn = "_specPanelTitle_hxrfm_35", Dn = "_loadingContainer_hxrfm_44", xn = "_specPanelHeader_hxrfm_54", On = "_specPanelImage_hxrfm_64", Fn = "_specPanelInfo_hxrfm_74", qn = "_specPanelName_hxrfm_82", Bn = "_specPanelSubTitle_hxrfm_90", $n = "_specPanelBody_hxrfm_28", Vn = "_specGroup_hxrfm_126", Un = "_specGroupName_hxrfm_132", Hn = "_specValues_hxrfm_139", Gn = "_originPriceSymbol_hxrfm_145", zn = "_specValueBtn_hxrfm_156", Qn = "_specValueBtnActive_hxrfm_172", Yn = "_specPanelFooter_hxrfm_189", Wn = "_footerRow_hxrfm_199", Kn = "_specPanelPrice_hxrfm_205", Xn = "_specPanelConfirm_hxrfm_216", jn = "_specPanelConfirmNarrow_hxrfm_250", Zn = "_specPanelFooterEdit_hxrfm_256", Jn = "_quantityControl_hxrfm_263", eo = "_quantityBtn_hxrfm_269", to = "_quantityValue_hxrfm_286", K = {
  specPanelBox: Ln,
  specPanel: Tn,
  specPanelTitle: kn,
  loadingContainer: Dn,
  specPanelHeader: xn,
  specPanelImage: On,
  specPanelInfo: Fn,
  specPanelName: qn,
  specPanelSubTitle: Bn,
  specPanelBody: $n,
  specGroup: Vn,
  specGroupName: Un,
  specValues: Hn,
  originPriceSymbol: Gn,
  specValueBtn: zn,
  specValueBtnActive: Qn,
  specPanelFooter: Yn,
  footerRow: Wn,
  specPanelPrice: Kn,
  specPanelConfirm: Xn,
  specPanelConfirmNarrow: jn,
  specPanelFooterEdit: Zn,
  quantityControl: Jn,
  quantityBtn: eo,
  quantityValue: to
}, ro = Oe("SpecPickerOverlayModal"), Ct = (e) => {
  const t = {};
  return e.forEach((r) => {
    const a = r.options.find((u) => u.is_selected) ?? r.options.find((u) => u.is_default);
    a && (t[r.group_id] = a.option_id);
  }), t;
}, Pt = (e) => {
  const t = e.extra_price?.amount_cents;
  return !t || Number(t) === 0 ? null : ` (+¥${(Number(t) / 100).toFixed(2)})`;
}, Nt = (e, t, r) => {
  if (!r) return 0;
  const a = e.find((u) => u.group_id === t)?.options.find((u) => u.option_id === r);
  return a ? ie(a.extra_price) : 0;
}, kt = ({
  product: e,
  productDetail: t,
  storeId: r,
  brand: a,
  fulfillment: u,
  mode: m = "add",
  initialSpecs: g,
  initialQuantity: M,
  initialUnitPriceCents: o,
  initialOriginalPriceCents: s,
  initialSkuCode: n,
  onConfirm: c,
  onClose: i,
  onToast: p
}) => {
  const [d, C] = z([]), [y, D] = z({}), [A, N] = z(""), [w, R] = z(0), [O, Q] = z(0), [x, S] = z(m === "edit" ? Math.max(1, M ?? 1) : 1), [G, T] = z(!0), [ae, b] = z(!1), [$, L] = z(!1), E = ee(0), V = ee(!1), W = ee(null), re = ee(null), fe = k(
    async (h, _, v) => {
      E.current += 1;
      const B = E.current;
      b(!0);
      try {
        const I = await be.priceSku(
          gr({
            brand: a,
            storeId: r,
            fulfillment: u,
            itemId: e.item_id,
            quantity: 1,
            skuCode: h,
            selectedOptions: _ ? [_] : void 0
          })
        );
        if (B !== E.current)
          return null;
        const P = I.customization_groups ?? [], j = P.length > 0 ? P : v, X = Ct(j), Y = I.sku?.sku_code ?? "", oe = ie(I.sku?.unit_price), Ve = ie(I.sku?.original_price), Ue = {
          specs: X,
          groups: j,
          skuCode: Y,
          unitPriceCents: oe,
          originalPriceCents: Ve
        };
        return C(j), D(X), N(Y), R(oe), Q(Ve), W.current = Ue, Ue;
      } catch (I) {
        if (B === E.current) {
          ro.warn("PriceSku 算价失败 {0!e}", I);
          const P = W.current;
          P && (C(P.groups), D(P.specs), N(P.skuCode), R(P.unitPriceCents), Q(P.originalPriceCents));
          const j = xe(I, "规格切换失败，请重试");
          p?.(j, "error");
        }
        return null;
      } finally {
        B === E.current && b(!1);
      }
    },
    [a, r, u, e.item_id, p]
  ), le = k(
    (h, _, v) => {
      const B = fe(h, _, v);
      return re.current = B, B;
    },
    [fe]
  );
  _e(() => {
    const h = t?.customization_groups;
    if (!h || h.length === 0 || V.current)
      return;
    V.current = !0;
    const _ = m === "edit" && g && Object.keys(g).length > 0 ? g : Ct(h), v = m === "edit" ? o ?? 0 : ie(t.estimate_price), B = m === "edit" ? s ?? 0 : ie(t.init_price), I = m === "edit" ? n ?? "" : t.sku_code ?? "";
    C(h), D(_), R(v), Q(B), N(I), W.current = {
      specs: _,
      groups: h,
      skuCode: I,
      unitPriceCents: v,
      originalPriceCents: B
    }, T(!1);
  }, [t, m, g, o, s, n]);
  const pe = k(
    (h, _) => {
      const v = y[h];
      if (v === _ || ae) return;
      const B = { ...y, [h]: _ }, I = Nt(d, h, _) - Nt(d, h, v);
      D(B), R((P) => P + I), Q((P) => P + I), N(""), le(A, { group_id: h, option_id: _ }, d);
    },
    [y, d, A, ae, le]
  ), he = k(
    (h, _, v) => ({
      itemId: e.item_id,
      skuCode: v?.skuCode ?? A,
      quantity: h,
      replaceQuantity: _
    }),
    [e.item_id, A]
  ), Ne = k(async () => {
    if (A)
      return W.current;
    if (re.current) {
      const h = await re.current;
      if (h?.skuCode)
        return h;
    }
    return W.current?.skuCode ? W.current : null;
  }, [A]), ge = k(
    async (h) => {
      if (!$) {
        L(!0);
        try {
          const _ = await Ne();
          _?.skuCode && h(_);
        } finally {
          L(!1);
        }
      }
    },
    [$, Ne]
  ), ne = k(() => {
    ge((h) => {
      c(he(x, void 0, h)), i();
    });
  }, [ge, c, i, he, x]), ye = k(() => {
    S((h) => h + 1);
  }, []), Fe = k(() => {
    S((h) => Math.max(1, h - 1));
  }, []), Ye = k(() => {
    ge((h) => {
      const _ = Math.max(1, x);
      c(he(_, _, h)), i();
    });
  }, [ge, c, i, he, x]), $e = $;
  return /* @__PURE__ */ l(
    ct,
    {
      visible: !0,
      onClose: i,
      maskClosable: !1,
      pgid: "recommend_card_spec_picker",
      className: K.specPanelBox,
      pgname: "推荐商品规格选择器",
      children: /* @__PURE__ */ f(
        "div",
        {
          className: K.specPanel,
          "dt-eid": "card_exposure",
          "dt-ename": "SKU规格卡片曝光",
          "dt-params": ue(J.skuDetail, {
            card_type: "sku_detail",
            store_id: r,
            item_id: e.item_id,
            item_name: e.name,
            default_spec_summary: Mt(t?.customization_groups),
            total_price_cents: w,
            order_brand: a
          }),
          children: [
            /* @__PURE__ */ l("div", { className: K.specPanelTitle, children: "选择饮品规格" }),
            G ? /* @__PURE__ */ l("div", { className: K.loadingContainer }) : /* @__PURE__ */ f(We, { children: [
              /* @__PURE__ */ f("div", { className: K.specPanelHeader, children: [
                /* @__PURE__ */ l("img", { className: K.specPanelImage, src: e.image_url ?? "", alt: e.name }),
                /* @__PURE__ */ f("div", { className: K.specPanelInfo, children: [
                  /* @__PURE__ */ l("div", { className: K.specPanelName, children: e.name }),
                  /* @__PURE__ */ l("div", { className: K.specPanelSubTitle, children: e.description })
                ] })
              ] }),
              /* @__PURE__ */ l("div", { className: K.specPanelBody, children: d.map((h) => /* @__PURE__ */ f("div", { className: K.specGroup, children: [
                /* @__PURE__ */ l("div", { className: K.specGroupName, children: h.group_name }),
                /* @__PURE__ */ l("div", { className: K.specValues, children: h.options.filter((_) => _.is_available !== !1).map((_) => {
                  const v = y[h.group_id] === _.option_id;
                  return /* @__PURE__ */ f(
                    "button",
                    {
                      type: "button",
                      disabled: ae || _.is_available === !1,
                      className: `${K.specValueBtn} ${v ? K.specValueBtnActive : ""}`,
                      onClick: () => pe(h.group_id, _.option_id),
                      "dt-eid": "sku_option",
                      "dt-ename": "规格选项",
                      "dt-params": ue(J.skuDetail, {
                        item_id: e.item_id,
                        group_type: h.group_id,
                        option_id: _.option_id,
                        option_name: _.option_name,
                        is_default: _.is_default ? 1 : 0,
                        is_available: _.is_available === !1 ? 0 : 1,
                        extra_price_cents: Number(_.extra_price?.amount_cents ?? 0),
                        order_brand: a
                      }),
                      children: [
                        _.option_name,
                        Pt(_) && /* @__PURE__ */ l("span", { children: Pt(_) })
                      ]
                    },
                    _.option_id
                  );
                }) })
              ] }, h.group_id)) }),
              /* @__PURE__ */ l("div", { className: `${K.specPanelFooter} ${m === "edit" ? K.specPanelFooterEdit : ""}`, children: m === "edit" ? /* @__PURE__ */ f(We, { children: [
                /* @__PURE__ */ f("div", { className: K.specPanelPrice, children: [
                  /* @__PURE__ */ l("span", { children: "¥" }),
                  /* @__PURE__ */ l("span", { children: Number.isFinite(w) ? (w / 100).toFixed(2) : "0.00" }),
                  O > w && /* @__PURE__ */ f("span", { className: K.originPriceSymbol, children: [
                    "¥",
                    (O / 100).toFixed(2)
                  ] })
                ] }),
                /* @__PURE__ */ l(
                  "button",
                  {
                    type: "button",
                    className: `${K.specPanelConfirm} ${K.specPanelConfirmNarrow}`,
                    disabled: $e,
                    onClick: Ye,
                    "dt-eid": "sku_confirm_button",
                    "dt-ename": "确认规格按钮",
                    "dt-params": ue(J.skuDetail, {
                      store_id: r,
                      item_id: e.item_id,
                      spec_summary: ft(d, y),
                      total_price_cents: w,
                      order_brand: a
                    }),
                    children: "确认修改"
                  }
                )
              ] }) : /* @__PURE__ */ f(We, { children: [
                /* @__PURE__ */ f("div", { className: K.footerRow, children: [
                  /* @__PURE__ */ f("div", { className: K.specPanelPrice, children: [
                    /* @__PURE__ */ l("span", { children: "¥" }),
                    /* @__PURE__ */ l("span", { children: Number.isFinite(w) ? (w / 100).toFixed(2) : "0.00" }),
                    O > w && /* @__PURE__ */ f("span", { className: K.originPriceSymbol, children: [
                      "¥",
                      (O / 100).toFixed(2)
                    ] })
                  ] }),
                  /* @__PURE__ */ f("div", { className: K.quantityControl, children: [
                    /* @__PURE__ */ l(
                      "button",
                      {
                        type: "button",
                        className: K.quantityBtn,
                        disabled: x <= 1,
                        onClick: Fe,
                        children: /* @__PURE__ */ l("img", { src: Lt, alt: "减少" })
                      }
                    ),
                    /* @__PURE__ */ l("span", { className: K.quantityValue, children: x }),
                    /* @__PURE__ */ l("button", { type: "button", className: K.quantityBtn, onClick: ye, children: /* @__PURE__ */ l("img", { src: Tt, alt: "增加" }) })
                  ] })
                ] }),
                /* @__PURE__ */ l(
                  "button",
                  {
                    type: "button",
                    className: K.specPanelConfirm,
                    disabled: $e,
                    onClick: ne,
                    "dt-eid": "sku_confirm_button",
                    "dt-ename": "加入购物车按钮",
                    "dt-params": ue(J.skuDetail, {
                      store_id: r,
                      item_id: e.item_id,
                      spec_summary: ft(d, y),
                      total_price_cents: w,
                      quantity: x,
                      order_brand: a
                    }),
                    children: "加入购物车"
                  }
                )
              ] }) })
            ] })
          ]
        }
      )
    }
  );
}, no = ({
  display: e,
  cart: t,
  storeId: r,
  brand: a,
  fulfillment: u,
  amounts: m,
  productDetails: g,
  guideText: M,
  deliveryAddress: o,
  onPay: s,
  creating: n = !1,
  onCancel: c,
  onChangeSpec: i,
  onToast: p
}) => {
  const d = e.fulfillment === me, { deliveryFeeCents: C, packagingFeeCents: y, discountCents: D, actualPayCents: A } = m, N = D > 0, w = d ? "delivery" : "self_pickup", R = t[0], O = o, [Q, x] = z(null), S = Q !== null ? t[Q] ?? null : null, G = de(
    () => S ? {
      item_id: S.itemId,
      name: S.name,
      image_url: S.imageUrl,
      description: ""
    } : null,
    [S]
  ), T = de(
    () => S ? Object.fromEntries(S.selectedOptions.map((L) => [L.group_id, L.option_id])) : {},
    [S]
  ), ae = k((L, E) => {
    x(E);
  }, []), b = k(() => {
    x(null);
  }, []), $ = k(
    (L) => {
      Q !== null && (i(Q, {
        skuCode: L.skuCode,
        quantity: L.quantity
      }), x(null));
    },
    [Q, i]
  );
  return /* @__PURE__ */ f(
    "div",
    {
      className: U.orderCard,
      "dt-eid": "card_exposure",
      "dt-ename": "下单确认卡片曝光",
      "dt-params": ue(J.orderConfirm, {
        card_type: "order_confirm",
        store_id: r,
        delivery_type: w,
        item_id: R?.itemId,
        item_name: R?.name,
        spec_summary: R?.specSummary,
        actual_pay_cents: A,
        coupon_applied: N ? 1 : 0,
        order_brand: a
      }),
      children: [
        /* @__PURE__ */ l("div", { className: U.guideText, children: M }),
        /* @__PURE__ */ f("div", { className: U.orderContent, children: [
          /* @__PURE__ */ f("div", { className: U.scrollArea, children: [
            /* @__PURE__ */ f("div", { className: U.storeHeader, children: [
              e.storeIcon && /* @__PURE__ */ l("img", { className: U.storeLogo, src: e.storeIcon, alt: e.storeName ?? "门店" }),
              /* @__PURE__ */ l("span", { className: U.storeName, children: e.storeName ?? "门店" })
            ] }),
            /* @__PURE__ */ l(
              Rt,
              {
                items: At(t),
                onSpecClick: ae,
                specModId: J.orderConfirm
              }
            ),
            /* @__PURE__ */ f("div", { className: U.infoList, children: [
              d && O && /* @__PURE__ */ f("div", { className: U.infoRow, children: [
                /* @__PURE__ */ l("span", { className: U.infoLabel, children: "配送至" }),
                /* @__PURE__ */ f("div", { className: U.infoValueColumn, children: [
                  /* @__PURE__ */ l("span", { className: `${U.infoValue} ${U.infoValueStatic}`, children: /* @__PURE__ */ f("span", { children: [
                    O.address,
                    O.address_detail ?? ""
                  ] }) }),
                  /* @__PURE__ */ f("span", { className: U.infoSubValue, children: [
                    O.contact_name,
                    " ",
                    O.contact_phone
                  ] })
                ] })
              ] }),
              e.scheduledTime && /* @__PURE__ */ f("div", { className: U.infoRow, children: [
                /* @__PURE__ */ f("span", { className: U.infoLabel, children: [
                  "预计",
                  d ? "送达" : "取餐",
                  "时间"
                ] }),
                /* @__PURE__ */ l("span", { className: `${U.infoValue} ${U.infoValueStatic}`, children: /* @__PURE__ */ l("span", { children: e.scheduledTime }) })
              ] }),
              /* @__PURE__ */ f("div", { className: U.infoRow, children: [
                /* @__PURE__ */ l("span", { className: U.infoLabel, children: "优惠券" }),
                /* @__PURE__ */ l("span", { className: U.infoValueDiscount, children: D > 0 ? `-¥${Pe(D)}` : "暂无优惠" })
              ] }),
              (C > 0 || y > 0) && /* @__PURE__ */ f("div", { className: U.infoRow, children: [
                /* @__PURE__ */ l("span", { className: U.infoLabel, children: "额外费用" }),
                /* @__PURE__ */ f("span", { className: U.infoSubValue, children: [
                  C > 0 && `配送费¥${Pe(C)}`,
                  C > 0 && y > 0 && "，",
                  y > 0 && `打包费¥${Pe(y)}`
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ f("footer", { className: `${U.footer} ${N ? U.hasDiscount : ""}`, children: [
            /* @__PURE__ */ f("div", { className: U.priceBox, children: [
              /* @__PURE__ */ f("div", { className: U.priceMain, children: [
                /* @__PURE__ */ l("span", { className: U.priceSymbol, children: "¥" }),
                /* @__PURE__ */ l("span", { className: U.actualPrice, children: Pe(A) })
              ] }),
              N && /* @__PURE__ */ f("span", { className: U.discountTag, children: [
                "已优惠",
                Pe(D),
                "元"
              ] })
            ] }),
            /* @__PURE__ */ f("div", { className: U.actions, children: [
              /* @__PURE__ */ l(
                "button",
                {
                  type: "button",
                  className: U.btnCancel,
                  onClick: c,
                  disabled: n,
                  "dt-eid": "order_confirm_cancel_button",
                  "dt-ename": "取消订单按钮",
                  "dt-params": ue(J.orderConfirm, {
                    store_id: r,
                    delivery_type: w,
                    order_brand: a
                  }),
                  children: "取消订单"
                }
              ),
              /* @__PURE__ */ l(
                "button",
                {
                  type: "button",
                  className: U.btnPrimary,
                  onClick: s,
                  disabled: n,
                  "dt-eid": "confirm_order_button",
                  "dt-ename": "确认下单按钮",
                  "dt-params": ue(J.orderConfirm, {
                    store_id: r,
                    delivery_type: w,
                    item_id: R?.itemId,
                    actual_pay_cents: A,
                    payment_method: "wechat",
                    order_brand: a
                  }),
                  children: n ? "提交中…" : "立即支付"
                }
              )
            ] })
          ] })
        ] }),
        G && /* @__PURE__ */ l(
          kt,
          {
            mode: "edit",
            product: G,
            productDetail: S ? g[S.itemId] : void 0,
            storeId: r,
            brand: a,
            fulfillment: u,
            initialSpecs: T,
            initialQuantity: S?.quantity ?? 1,
            initialUnitPriceCents: S?.unitPriceCents,
            initialOriginalPriceCents: S?.originalPriceCents,
            initialSkuCode: S?.skuCode,
            onConfirm: $,
            onClose: b,
            onToast: p
          },
          Q
        )
      ]
    }
  );
};
var oo = Object.defineProperty, Qe = Object.getOwnPropertySymbols, Dt = Object.prototype.hasOwnProperty, xt = Object.prototype.propertyIsEnumerable, bt = (e, t, r) => t in e ? oo(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, st = (e, t) => {
  for (var r in t || (t = {}))
    Dt.call(t, r) && bt(e, r, t[r]);
  if (Qe)
    for (var r of Qe(t))
      xt.call(t, r) && bt(e, r, t[r]);
  return e;
}, at = (e, t) => {
  var r = {};
  for (var a in e)
    Dt.call(e, a) && t.indexOf(a) < 0 && (r[a] = e[a]);
  if (e != null && Qe)
    for (var a of Qe(e))
      t.indexOf(a) < 0 && xt.call(e, a) && (r[a] = e[a]);
  return r;
};
var Re;
((e) => {
  const t = class q {
    /*-- Constructor (low level) and fields --*/
    // Creates a new QR Code with the given version number,
    // error correction level, data codeword bytes, and mask number.
    // This is a low-level API that most users should not use directly.
    // A mid-level API is the encodeSegments() function.
    constructor(o, s, n, c) {
      if (this.version = o, this.errorCorrectionLevel = s, this.modules = [], this.isFunction = [], o < q.MIN_VERSION || o > q.MAX_VERSION)
        throw new RangeError("Version value out of range");
      if (c < -1 || c > 7)
        throw new RangeError("Mask value out of range");
      this.size = o * 4 + 17;
      let i = [];
      for (let d = 0; d < this.size; d++)
        i.push(!1);
      for (let d = 0; d < this.size; d++)
        this.modules.push(i.slice()), this.isFunction.push(i.slice());
      this.drawFunctionPatterns();
      const p = this.addEccAndInterleave(n);
      if (this.drawCodewords(p), c == -1) {
        let d = 1e9;
        for (let C = 0; C < 8; C++) {
          this.applyMask(C), this.drawFormatBits(C);
          const y = this.getPenaltyScore();
          y < d && (c = C, d = y), this.applyMask(C);
        }
      }
      u(0 <= c && c <= 7), this.mask = c, this.applyMask(c), this.drawFormatBits(c), this.isFunction = [];
    }
    /*-- Static factory functions (high level) --*/
    // Returns a QR Code representing the given Unicode text string at the given error correction level.
    // As a conservative upper bound, this function is guaranteed to succeed for strings that have 738 or fewer
    // Unicode code points (not UTF-16 code units) if the low error correction level is used. The smallest possible
    // QR Code version is automatically chosen for the output. The ECC level of the result may be higher than the
    // ecl argument if it can be done without increasing the version.
    static encodeText(o, s) {
      const n = e.QrSegment.makeSegments(o);
      return q.encodeSegments(n, s);
    }
    // Returns a QR Code representing the given binary data at the given error correction level.
    // This function always encodes using the binary segment mode, not any text mode. The maximum number of
    // bytes allowed is 2953. The smallest possible QR Code version is automatically chosen for the output.
    // The ECC level of the result may be higher than the ecl argument if it can be done without increasing the version.
    static encodeBinary(o, s) {
      const n = e.QrSegment.makeBytes(o);
      return q.encodeSegments([n], s);
    }
    /*-- Static factory functions (mid level) --*/
    // Returns a QR Code representing the given segments with the given encoding parameters.
    // The smallest possible QR Code version within the given range is automatically
    // chosen for the output. Iff boostEcl is true, then the ECC level of the result
    // may be higher than the ecl argument if it can be done without increasing the
    // version. The mask number is either between 0 to 7 (inclusive) to force that
    // mask, or -1 to automatically choose an appropriate mask (which may be slow).
    // This function allows the user to create a custom sequence of segments that switches
    // between modes (such as alphanumeric and byte) to encode text in less space.
    // This is a mid-level API; the high-level API is encodeText() and encodeBinary().
    static encodeSegments(o, s, n = 1, c = 40, i = -1, p = !0) {
      if (!(q.MIN_VERSION <= n && n <= c && c <= q.MAX_VERSION) || i < -1 || i > 7)
        throw new RangeError("Invalid value");
      let d, C;
      for (d = n; ; d++) {
        const N = q.getNumDataCodewords(d, s) * 8, w = g.getTotalBits(o, d);
        if (w <= N) {
          C = w;
          break;
        }
        if (d >= c)
          throw new RangeError("Data too long");
      }
      for (const N of [q.Ecc.MEDIUM, q.Ecc.QUARTILE, q.Ecc.HIGH])
        p && C <= q.getNumDataCodewords(d, N) * 8 && (s = N);
      let y = [];
      for (const N of o) {
        r(N.mode.modeBits, 4, y), r(N.numChars, N.mode.numCharCountBits(d), y);
        for (const w of N.getData())
          y.push(w);
      }
      u(y.length == C);
      const D = q.getNumDataCodewords(d, s) * 8;
      u(y.length <= D), r(0, Math.min(4, D - y.length), y), r(0, (8 - y.length % 8) % 8, y), u(y.length % 8 == 0);
      for (let N = 236; y.length < D; N ^= 253)
        r(N, 8, y);
      let A = [];
      for (; A.length * 8 < y.length; )
        A.push(0);
      return y.forEach((N, w) => A[w >>> 3] |= N << 7 - (w & 7)), new q(d, s, A, i);
    }
    /*-- Accessor methods --*/
    // Returns the color of the module (pixel) at the given coordinates, which is false
    // for light or true for dark. The top left corner has the coordinates (x=0, y=0).
    // If the given coordinates are out of bounds, then false (light) is returned.
    getModule(o, s) {
      return 0 <= o && o < this.size && 0 <= s && s < this.size && this.modules[s][o];
    }
    // Modified to expose modules for easy access
    getModules() {
      return this.modules;
    }
    /*-- Private helper methods for constructor: Drawing function modules --*/
    // Reads this object's version field, and draws and marks all function modules.
    drawFunctionPatterns() {
      for (let n = 0; n < this.size; n++)
        this.setFunctionModule(6, n, n % 2 == 0), this.setFunctionModule(n, 6, n % 2 == 0);
      this.drawFinderPattern(3, 3), this.drawFinderPattern(this.size - 4, 3), this.drawFinderPattern(3, this.size - 4);
      const o = this.getAlignmentPatternPositions(), s = o.length;
      for (let n = 0; n < s; n++)
        for (let c = 0; c < s; c++)
          n == 0 && c == 0 || n == 0 && c == s - 1 || n == s - 1 && c == 0 || this.drawAlignmentPattern(o[n], o[c]);
      this.drawFormatBits(0), this.drawVersion();
    }
    // Draws two copies of the format bits (with its own error correction code)
    // based on the given mask and this object's error correction level field.
    drawFormatBits(o) {
      const s = this.errorCorrectionLevel.formatBits << 3 | o;
      let n = s;
      for (let i = 0; i < 10; i++)
        n = n << 1 ^ (n >>> 9) * 1335;
      const c = (s << 10 | n) ^ 21522;
      u(c >>> 15 == 0);
      for (let i = 0; i <= 5; i++)
        this.setFunctionModule(8, i, a(c, i));
      this.setFunctionModule(8, 7, a(c, 6)), this.setFunctionModule(8, 8, a(c, 7)), this.setFunctionModule(7, 8, a(c, 8));
      for (let i = 9; i < 15; i++)
        this.setFunctionModule(14 - i, 8, a(c, i));
      for (let i = 0; i < 8; i++)
        this.setFunctionModule(this.size - 1 - i, 8, a(c, i));
      for (let i = 8; i < 15; i++)
        this.setFunctionModule(8, this.size - 15 + i, a(c, i));
      this.setFunctionModule(8, this.size - 8, !0);
    }
    // Draws two copies of the version bits (with its own error correction code),
    // based on this object's version field, iff 7 <= version <= 40.
    drawVersion() {
      if (this.version < 7)
        return;
      let o = this.version;
      for (let n = 0; n < 12; n++)
        o = o << 1 ^ (o >>> 11) * 7973;
      const s = this.version << 12 | o;
      u(s >>> 18 == 0);
      for (let n = 0; n < 18; n++) {
        const c = a(s, n), i = this.size - 11 + n % 3, p = Math.floor(n / 3);
        this.setFunctionModule(i, p, c), this.setFunctionModule(p, i, c);
      }
    }
    // Draws a 9*9 finder pattern including the border separator,
    // with the center module at (x, y). Modules can be out of bounds.
    drawFinderPattern(o, s) {
      for (let n = -4; n <= 4; n++)
        for (let c = -4; c <= 4; c++) {
          const i = Math.max(Math.abs(c), Math.abs(n)), p = o + c, d = s + n;
          0 <= p && p < this.size && 0 <= d && d < this.size && this.setFunctionModule(p, d, i != 2 && i != 4);
        }
    }
    // Draws a 5*5 alignment pattern, with the center module
    // at (x, y). All modules must be in bounds.
    drawAlignmentPattern(o, s) {
      for (let n = -2; n <= 2; n++)
        for (let c = -2; c <= 2; c++)
          this.setFunctionModule(o + c, s + n, Math.max(Math.abs(c), Math.abs(n)) != 1);
    }
    // Sets the color of a module and marks it as a function module.
    // Only used by the constructor. Coordinates must be in bounds.
    setFunctionModule(o, s, n) {
      this.modules[s][o] = n, this.isFunction[s][o] = !0;
    }
    /*-- Private helper methods for constructor: Codewords and masking --*/
    // Returns a new byte string representing the given data with the appropriate error correction
    // codewords appended to it, based on this object's version and error correction level.
    addEccAndInterleave(o) {
      const s = this.version, n = this.errorCorrectionLevel;
      if (o.length != q.getNumDataCodewords(s, n))
        throw new RangeError("Invalid argument");
      const c = q.NUM_ERROR_CORRECTION_BLOCKS[n.ordinal][s], i = q.ECC_CODEWORDS_PER_BLOCK[n.ordinal][s], p = Math.floor(q.getNumRawDataModules(s) / 8), d = c - p % c, C = Math.floor(p / c);
      let y = [];
      const D = q.reedSolomonComputeDivisor(i);
      for (let N = 0, w = 0; N < c; N++) {
        let R = o.slice(w, w + C - i + (N < d ? 0 : 1));
        w += R.length;
        const O = q.reedSolomonComputeRemainder(R, D);
        N < d && R.push(0), y.push(R.concat(O));
      }
      let A = [];
      for (let N = 0; N < y[0].length; N++)
        y.forEach((w, R) => {
          (N != C - i || R >= d) && A.push(w[N]);
        });
      return u(A.length == p), A;
    }
    // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
    // data area of this QR Code. Function modules need to be marked off before this is called.
    drawCodewords(o) {
      if (o.length != Math.floor(q.getNumRawDataModules(this.version) / 8))
        throw new RangeError("Invalid argument");
      let s = 0;
      for (let n = this.size - 1; n >= 1; n -= 2) {
        n == 6 && (n = 5);
        for (let c = 0; c < this.size; c++)
          for (let i = 0; i < 2; i++) {
            const p = n - i, C = (n + 1 & 2) == 0 ? this.size - 1 - c : c;
            !this.isFunction[C][p] && s < o.length * 8 && (this.modules[C][p] = a(o[s >>> 3], 7 - (s & 7)), s++);
          }
      }
      u(s == o.length * 8);
    }
    // XORs the codeword modules in this QR Code with the given mask pattern.
    // The function modules must be marked and the codeword bits must be drawn
    // before masking. Due to the arithmetic of XOR, calling applyMask() with
    // the same mask value a second time will undo the mask. A final well-formed
    // QR Code needs exactly one (not zero, two, etc.) mask applied.
    applyMask(o) {
      if (o < 0 || o > 7)
        throw new RangeError("Mask value out of range");
      for (let s = 0; s < this.size; s++)
        for (let n = 0; n < this.size; n++) {
          let c;
          switch (o) {
            case 0:
              c = (n + s) % 2 == 0;
              break;
            case 1:
              c = s % 2 == 0;
              break;
            case 2:
              c = n % 3 == 0;
              break;
            case 3:
              c = (n + s) % 3 == 0;
              break;
            case 4:
              c = (Math.floor(n / 3) + Math.floor(s / 2)) % 2 == 0;
              break;
            case 5:
              c = n * s % 2 + n * s % 3 == 0;
              break;
            case 6:
              c = (n * s % 2 + n * s % 3) % 2 == 0;
              break;
            case 7:
              c = ((n + s) % 2 + n * s % 3) % 2 == 0;
              break;
            default:
              throw new Error("Unreachable");
          }
          !this.isFunction[s][n] && c && (this.modules[s][n] = !this.modules[s][n]);
        }
    }
    // Calculates and returns the penalty score based on state of this QR Code's current modules.
    // This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
    getPenaltyScore() {
      let o = 0;
      for (let i = 0; i < this.size; i++) {
        let p = !1, d = 0, C = [0, 0, 0, 0, 0, 0, 0];
        for (let y = 0; y < this.size; y++)
          this.modules[i][y] == p ? (d++, d == 5 ? o += q.PENALTY_N1 : d > 5 && o++) : (this.finderPenaltyAddHistory(d, C), p || (o += this.finderPenaltyCountPatterns(C) * q.PENALTY_N3), p = this.modules[i][y], d = 1);
        o += this.finderPenaltyTerminateAndCount(p, d, C) * q.PENALTY_N3;
      }
      for (let i = 0; i < this.size; i++) {
        let p = !1, d = 0, C = [0, 0, 0, 0, 0, 0, 0];
        for (let y = 0; y < this.size; y++)
          this.modules[y][i] == p ? (d++, d == 5 ? o += q.PENALTY_N1 : d > 5 && o++) : (this.finderPenaltyAddHistory(d, C), p || (o += this.finderPenaltyCountPatterns(C) * q.PENALTY_N3), p = this.modules[y][i], d = 1);
        o += this.finderPenaltyTerminateAndCount(p, d, C) * q.PENALTY_N3;
      }
      for (let i = 0; i < this.size - 1; i++)
        for (let p = 0; p < this.size - 1; p++) {
          const d = this.modules[i][p];
          d == this.modules[i][p + 1] && d == this.modules[i + 1][p] && d == this.modules[i + 1][p + 1] && (o += q.PENALTY_N2);
        }
      let s = 0;
      for (const i of this.modules)
        s = i.reduce((p, d) => p + (d ? 1 : 0), s);
      const n = this.size * this.size, c = Math.ceil(Math.abs(s * 20 - n * 10) / n) - 1;
      return u(0 <= c && c <= 9), o += c * q.PENALTY_N4, u(0 <= o && o <= 2568888), o;
    }
    /*-- Private helper functions --*/
    // Returns an ascending list of positions of alignment patterns for this version number.
    // Each position is in the range [0,177), and are used on both the x and y axes.
    // This could be implemented as lookup table of 40 variable-length lists of integers.
    getAlignmentPatternPositions() {
      if (this.version == 1)
        return [];
      {
        const o = Math.floor(this.version / 7) + 2, s = this.version == 32 ? 26 : Math.ceil((this.version * 4 + 4) / (o * 2 - 2)) * 2;
        let n = [6];
        for (let c = this.size - 7; n.length < o; c -= s)
          n.splice(1, 0, c);
        return n;
      }
    }
    // Returns the number of data bits that can be stored in a QR Code of the given version number, after
    // all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
    // The result is in the range [208, 29648]. This could be implemented as a 40-entry lookup table.
    static getNumRawDataModules(o) {
      if (o < q.MIN_VERSION || o > q.MAX_VERSION)
        throw new RangeError("Version number out of range");
      let s = (16 * o + 128) * o + 64;
      if (o >= 2) {
        const n = Math.floor(o / 7) + 2;
        s -= (25 * n - 10) * n - 55, o >= 7 && (s -= 36);
      }
      return u(208 <= s && s <= 29648), s;
    }
    // Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
    // QR Code of the given version number and error correction level, with remainder bits discarded.
    // This stateless pure function could be implemented as a (40*4)-cell lookup table.
    static getNumDataCodewords(o, s) {
      return Math.floor(q.getNumRawDataModules(o) / 8) - q.ECC_CODEWORDS_PER_BLOCK[s.ordinal][o] * q.NUM_ERROR_CORRECTION_BLOCKS[s.ordinal][o];
    }
    // Returns a Reed-Solomon ECC generator polynomial for the given degree. This could be
    // implemented as a lookup table over all possible parameter values, instead of as an algorithm.
    static reedSolomonComputeDivisor(o) {
      if (o < 1 || o > 255)
        throw new RangeError("Degree out of range");
      let s = [];
      for (let c = 0; c < o - 1; c++)
        s.push(0);
      s.push(1);
      let n = 1;
      for (let c = 0; c < o; c++) {
        for (let i = 0; i < s.length; i++)
          s[i] = q.reedSolomonMultiply(s[i], n), i + 1 < s.length && (s[i] ^= s[i + 1]);
        n = q.reedSolomonMultiply(n, 2);
      }
      return s;
    }
    // Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.
    static reedSolomonComputeRemainder(o, s) {
      let n = s.map((c) => 0);
      for (const c of o) {
        const i = c ^ n.shift();
        n.push(0), s.forEach((p, d) => n[d] ^= q.reedSolomonMultiply(p, i));
      }
      return n;
    }
    // Returns the product of the two given field elements modulo GF(2^8/0x11D). The arguments and result
    // are unsigned 8-bit integers. This could be implemented as a lookup table of 256*256 entries of uint8.
    static reedSolomonMultiply(o, s) {
      if (o >>> 8 || s >>> 8)
        throw new RangeError("Byte out of range");
      let n = 0;
      for (let c = 7; c >= 0; c--)
        n = n << 1 ^ (n >>> 7) * 285, n ^= (s >>> c & 1) * o;
      return u(n >>> 8 == 0), n;
    }
    // Can only be called immediately after a light run is added, and
    // returns either 0, 1, or 2. A helper function for getPenaltyScore().
    finderPenaltyCountPatterns(o) {
      const s = o[1];
      u(s <= this.size * 3);
      const n = s > 0 && o[2] == s && o[3] == s * 3 && o[4] == s && o[5] == s;
      return (n && o[0] >= s * 4 && o[6] >= s ? 1 : 0) + (n && o[6] >= s * 4 && o[0] >= s ? 1 : 0);
    }
    // Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
    finderPenaltyTerminateAndCount(o, s, n) {
      return o && (this.finderPenaltyAddHistory(s, n), s = 0), s += this.size, this.finderPenaltyAddHistory(s, n), this.finderPenaltyCountPatterns(n);
    }
    // Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
    finderPenaltyAddHistory(o, s) {
      s[0] == 0 && (o += this.size), s.pop(), s.unshift(o);
    }
  };
  t.MIN_VERSION = 1, t.MAX_VERSION = 40, t.PENALTY_N1 = 3, t.PENALTY_N2 = 3, t.PENALTY_N3 = 40, t.PENALTY_N4 = 10, t.ECC_CODEWORDS_PER_BLOCK = [
    // Version: (note that index 0 is for padding, and is set to an illegal value)
    //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    // Low
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    // Medium
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    // Quartile
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
    // High
  ], t.NUM_ERROR_CORRECTION_BLOCKS = [
    // Version: (note that index 0 is for padding, and is set to an illegal value)
    //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    // Low
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    // Medium
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    // Quartile
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
    // High
  ], e.QrCode = t;
  function r(M, o, s) {
    if (o < 0 || o > 31 || M >>> o)
      throw new RangeError("Value out of range");
    for (let n = o - 1; n >= 0; n--)
      s.push(M >>> n & 1);
  }
  function a(M, o) {
    return (M >>> o & 1) != 0;
  }
  function u(M) {
    if (!M)
      throw new Error("Assertion error");
  }
  const m = class te {
    /*-- Constructor (low level) and fields --*/
    // Creates a new QR Code segment with the given attributes and data.
    // The character count (numChars) must agree with the mode and the bit buffer length,
    // but the constraint isn't checked. The given bit buffer is cloned and stored.
    constructor(o, s, n) {
      if (this.mode = o, this.numChars = s, this.bitData = n, s < 0)
        throw new RangeError("Invalid argument");
      this.bitData = n.slice();
    }
    /*-- Static factory functions (mid level) --*/
    // Returns a segment representing the given binary data encoded in
    // byte mode. All input byte arrays are acceptable. Any text string
    // can be converted to UTF-8 bytes and encoded as a byte mode segment.
    static makeBytes(o) {
      let s = [];
      for (const n of o)
        r(n, 8, s);
      return new te(te.Mode.BYTE, o.length, s);
    }
    // Returns a segment representing the given string of decimal digits encoded in numeric mode.
    static makeNumeric(o) {
      if (!te.isNumeric(o))
        throw new RangeError("String contains non-numeric characters");
      let s = [];
      for (let n = 0; n < o.length; ) {
        const c = Math.min(o.length - n, 3);
        r(parseInt(o.substring(n, n + c), 10), c * 3 + 1, s), n += c;
      }
      return new te(te.Mode.NUMERIC, o.length, s);
    }
    // Returns a segment representing the given text string encoded in alphanumeric mode.
    // The characters allowed are: 0 to 9, A to Z (uppercase only), space,
    // dollar, percent, asterisk, plus, hyphen, period, slash, colon.
    static makeAlphanumeric(o) {
      if (!te.isAlphanumeric(o))
        throw new RangeError("String contains unencodable characters in alphanumeric mode");
      let s = [], n;
      for (n = 0; n + 2 <= o.length; n += 2) {
        let c = te.ALPHANUMERIC_CHARSET.indexOf(o.charAt(n)) * 45;
        c += te.ALPHANUMERIC_CHARSET.indexOf(o.charAt(n + 1)), r(c, 11, s);
      }
      return n < o.length && r(te.ALPHANUMERIC_CHARSET.indexOf(o.charAt(n)), 6, s), new te(te.Mode.ALPHANUMERIC, o.length, s);
    }
    // Returns a new mutable list of zero or more segments to represent the given Unicode text string.
    // The result may use various segment modes and switch modes to optimize the length of the bit stream.
    static makeSegments(o) {
      return o == "" ? [] : te.isNumeric(o) ? [te.makeNumeric(o)] : te.isAlphanumeric(o) ? [te.makeAlphanumeric(o)] : [te.makeBytes(te.toUtf8ByteArray(o))];
    }
    // Returns a segment representing an Extended Channel Interpretation
    // (ECI) designator with the given assignment value.
    static makeEci(o) {
      let s = [];
      if (o < 0)
        throw new RangeError("ECI assignment value out of range");
      if (o < 128)
        r(o, 8, s);
      else if (o < 16384)
        r(2, 2, s), r(o, 14, s);
      else if (o < 1e6)
        r(6, 3, s), r(o, 21, s);
      else
        throw new RangeError("ECI assignment value out of range");
      return new te(te.Mode.ECI, 0, s);
    }
    // Tests whether the given string can be encoded as a segment in numeric mode.
    // A string is encodable iff each character is in the range 0 to 9.
    static isNumeric(o) {
      return te.NUMERIC_REGEX.test(o);
    }
    // Tests whether the given string can be encoded as a segment in alphanumeric mode.
    // A string is encodable iff each character is in the following set: 0 to 9, A to Z
    // (uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.
    static isAlphanumeric(o) {
      return te.ALPHANUMERIC_REGEX.test(o);
    }
    /*-- Methods --*/
    // Returns a new copy of the data bits of this segment.
    getData() {
      return this.bitData.slice();
    }
    // (Package-private) Calculates and returns the number of bits needed to encode the given segments at
    // the given version. The result is infinity if a segment has too many characters to fit its length field.
    static getTotalBits(o, s) {
      let n = 0;
      for (const c of o) {
        const i = c.mode.numCharCountBits(s);
        if (c.numChars >= 1 << i)
          return 1 / 0;
        n += 4 + i + c.bitData.length;
      }
      return n;
    }
    // Returns a new array of bytes representing the given string encoded in UTF-8.
    static toUtf8ByteArray(o) {
      o = encodeURI(o);
      let s = [];
      for (let n = 0; n < o.length; n++)
        o.charAt(n) != "%" ? s.push(o.charCodeAt(n)) : (s.push(parseInt(o.substring(n + 1, n + 3), 16)), n += 2);
      return s;
    }
  };
  m.NUMERIC_REGEX = /^[0-9]*$/, m.ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/, m.ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  let g = m;
  e.QrSegment = m;
})(Re || (Re = {}));
((e) => {
  ((t) => {
    const r = class {
      // The QR Code can tolerate about 30% erroneous codewords
      /*-- Constructor and fields --*/
      constructor(u, m) {
        this.ordinal = u, this.formatBits = m;
      }
    };
    r.LOW = new r(0, 1), r.MEDIUM = new r(1, 0), r.QUARTILE = new r(2, 3), r.HIGH = new r(3, 2), t.Ecc = r;
  })(e.QrCode || (e.QrCode = {}));
})(Re || (Re = {}));
((e) => {
  ((t) => {
    const r = class {
      /*-- Constructor and fields --*/
      constructor(u, m) {
        this.modeBits = u, this.numBitsCharCount = m;
      }
      /*-- Method --*/
      // (Package-private) Returns the bit width of the character count field for a segment in
      // this mode in a QR Code at the given version number. The result is in the range [0, 16].
      numCharCountBits(u) {
        return this.numBitsCharCount[Math.floor((u + 7) / 17)];
      }
    };
    r.NUMERIC = new r(1, [10, 12, 14]), r.ALPHANUMERIC = new r(2, [9, 11, 13]), r.BYTE = new r(4, [8, 16, 16]), r.KANJI = new r(8, [8, 10, 12]), r.ECI = new r(7, [0, 0, 0]), t.Mode = r;
  })(e.QrSegment || (e.QrSegment = {}));
})(Re || (Re = {}));
var De = Re;
var so = {
  L: De.QrCode.Ecc.LOW,
  M: De.QrCode.Ecc.MEDIUM,
  Q: De.QrCode.Ecc.QUARTILE,
  H: De.QrCode.Ecc.HIGH
}, Ot = 128, Ft = "L", qt = "#FFFFFF", Bt = "#000000", $t = !1, Vt = 1, ao = 4, co = 0, io = 0.1;
function Ut(e, t = 0) {
  const r = [];
  return e.forEach(function(a, u) {
    let m = null;
    a.forEach(function(g, M) {
      if (!g && m !== null) {
        r.push(
          `M${m + t} ${u + t}h${M - m}v1H${m + t}z`
        ), m = null;
        return;
      }
      if (M === a.length - 1) {
        if (!g)
          return;
        m === null ? r.push(`M${M + t},${u + t} h1v1H${M + t}z`) : r.push(
          `M${m + t},${u + t} h${M + 1 - m}v1H${m + t}z`
        );
        return;
      }
      g && m === null && (m = M);
    });
  }), r.join("");
}
function Ht(e, t) {
  return e.slice().map((r, a) => a < t.y || a >= t.y + t.h ? r : r.map((u, m) => m < t.x || m >= t.x + t.w ? u : !1));
}
function lo(e, t, r, a) {
  if (a == null)
    return null;
  const u = e.length + r * 2, m = Math.floor(t * io), g = u / t, M = (a.width || m) * g, o = (a.height || m) * g, s = a.x == null ? e.length / 2 - M / 2 : a.x * g, n = a.y == null ? e.length / 2 - o / 2 : a.y * g, c = a.opacity == null ? 1 : a.opacity;
  let i = null;
  if (a.excavate) {
    let d = Math.floor(s), C = Math.floor(n), y = Math.ceil(M + s - d), D = Math.ceil(o + n - C);
    i = { x: d, y: C, w: y, h: D };
  }
  const p = a.crossOrigin;
  return { x: s, y: n, h: o, w: M, excavation: i, opacity: c, crossOrigin: p };
}
function uo(e, t) {
  return t != null ? Math.max(Math.floor(t), 0) : e ? ao : co;
}
function Gt({
  value: e,
  level: t,
  minVersion: r,
  includeMargin: a,
  marginSize: u,
  imageSettings: m,
  size: g,
  boostLevel: M
}) {
  let o = se.useMemo(() => {
    const d = (Array.isArray(e) ? e : [e]).reduce((C, y) => (C.push(...De.QrSegment.makeSegments(y)), C), []);
    return De.QrCode.encodeSegments(
      d,
      so[t],
      r,
      void 0,
      void 0,
      M
    );
  }, [e, t, r, M]);
  const { cells: s, margin: n, numCells: c, calculatedImageSettings: i } = se.useMemo(() => {
    let p = o.getModules();
    const d = uo(a, u), C = p.length + d * 2, y = lo(
      p,
      g,
      d,
      m
    );
    return {
      cells: p,
      margin: d,
      numCells: C,
      calculatedImageSettings: y
    };
  }, [o, g, m, a, u]);
  return {
    qrcode: o,
    margin: n,
    cells: s,
    numCells: c,
    calculatedImageSettings: i
  };
}
var mo = (function() {
  try {
    new Path2D().addPath(new Path2D());
  } catch {
    return !1;
  }
  return !0;
})(), _o = se.forwardRef(
  function(t, r) {
    const a = t, {
      value: u,
      size: m = Ot,
      level: g = Ft,
      bgColor: M = qt,
      fgColor: o = Bt,
      includeMargin: s = $t,
      minVersion: n = Vt,
      boostLevel: c,
      marginSize: i,
      imageSettings: p
    } = a, C = at(a, [
      "value",
      "size",
      "level",
      "bgColor",
      "fgColor",
      "includeMargin",
      "minVersion",
      "boostLevel",
      "marginSize",
      "imageSettings"
    ]), { style: y } = C, D = at(C, ["style"]), A = p?.src, N = se.useRef(null), w = se.useRef(null), R = se.useCallback(
      ($) => {
        N.current = $, typeof r == "function" ? r($) : r && (r.current = $);
      },
      [r]
    ), [O, Q] = se.useState(!1), { margin: x, cells: S, numCells: G, calculatedImageSettings: T } = Gt({
      value: u,
      level: g,
      minVersion: n,
      boostLevel: c,
      includeMargin: s,
      marginSize: i,
      imageSettings: p,
      size: m
    });
    se.useEffect(() => {
      if (N.current != null) {
        const $ = N.current, L = $.getContext("2d");
        if (!L)
          return;
        let E = S;
        const V = w.current, W = T != null && V !== null && V.complete && V.naturalHeight !== 0 && V.naturalWidth !== 0;
        W && T.excavation != null && (E = Ht(
          S,
          T.excavation
        ));
        const re = window.devicePixelRatio || 1;
        $.height = $.width = m * re;
        const fe = m / G * re;
        L.scale(fe, fe), L.fillStyle = M, L.fillRect(0, 0, G, G), L.fillStyle = o, mo ? L.fill(new Path2D(Ut(E, x))) : S.forEach(function(le, pe) {
          le.forEach(function(he, Ne) {
            he && L.fillRect(Ne + x, pe + x, 1, 1);
          });
        }), T && (L.globalAlpha = T.opacity), W && L.drawImage(
          V,
          T.x + x,
          T.y + x,
          T.w,
          T.h
        );
      }
    }), se.useEffect(() => {
      Q(!1);
    }, [A]);
    const ae = st({ height: m, width: m }, y);
    let b = null;
    return A != null && (b = /* @__PURE__ */ se.createElement(
      "img",
      {
        src: A,
        key: A,
        style: { display: "none" },
        onLoad: () => {
          Q(!0);
        },
        ref: w,
        crossOrigin: T?.crossOrigin
      }
    )), /* @__PURE__ */ se.createElement(se.Fragment, null, /* @__PURE__ */ se.createElement(
      "canvas",
      st({
        style: ae,
        height: m,
        width: m,
        ref: R,
        role: "img"
      }, D)
    ), b);
  }
);
_o.displayName = "QRCodeCanvas";
var zt = se.forwardRef(
  function(t, r) {
    const a = t, {
      value: u,
      size: m = Ot,
      level: g = Ft,
      bgColor: M = qt,
      fgColor: o = Bt,
      includeMargin: s = $t,
      minVersion: n = Vt,
      boostLevel: c,
      title: i,
      marginSize: p,
      imageSettings: d
    } = a, C = at(a, [
      "value",
      "size",
      "level",
      "bgColor",
      "fgColor",
      "includeMargin",
      "minVersion",
      "boostLevel",
      "title",
      "marginSize",
      "imageSettings"
    ]), { margin: y, cells: D, numCells: A, calculatedImageSettings: N } = Gt({
      value: u,
      level: g,
      minVersion: n,
      boostLevel: c,
      includeMargin: s,
      marginSize: p,
      imageSettings: d,
      size: m
    });
    let w = D, R = null;
    d != null && N != null && (N.excavation != null && (w = Ht(
      D,
      N.excavation
    )), R = /* @__PURE__ */ se.createElement(
      "image",
      {
        href: d.src,
        height: N.h,
        width: N.w,
        x: N.x + y,
        y: N.y + y,
        preserveAspectRatio: "none",
        opacity: N.opacity,
        crossOrigin: N.crossOrigin
      }
    ));
    const O = Ut(w, y);
    return /* @__PURE__ */ se.createElement(
      "svg",
      st({
        height: m,
        width: m,
        viewBox: `0 0 ${A} ${A}`,
        ref: r,
        role: "img"
      }, C),
      !!i && /* @__PURE__ */ se.createElement("title", null, i),
      /* @__PURE__ */ se.createElement(
        "path",
        {
          fill: M,
          d: `M0,0 h${A}v${A}H0z`,
          shapeRendering: "crispEdges"
        }
      ),
      /* @__PURE__ */ se.createElement("path", { fill: o, d: O, shapeRendering: "crispEdges" }),
      R
    );
  }
);
zt.displayName = "QRCodeSVG";
const fo = "_modal_135ty_23", po = "_modalContent_135ty_50", ho = "_payBody_135ty_60", go = "_title_135ty_67", yo = "_tip_135ty_77", Co = "_qrBox_135ty_86", Po = "_qrImage_135ty_98", Se = {
  modal: fo,
  modalContent: po,
  payBody: ho,
  title: go,
  tip: yo,
  qrBox: Co,
  qrImage: Po
}, No = 280, bo = ({ visible: e, payUrl: t, title: r = "", tip: a = "", onClose: u }) => {
  const m = /* @__PURE__ */ f("div", { className: Se.payBody, children: [
    r && /* @__PURE__ */ l("h3", { className: Se.title, children: r }),
    a && /* @__PURE__ */ l("p", { className: Se.tip, children: a }),
    /* @__PURE__ */ l("div", { className: Se.qrBox, children: /* @__PURE__ */ l(zt, { className: Se.qrImage, value: t, size: No, level: "Q" }) })
  ] });
  return /* @__PURE__ */ l(
    ct,
    {
      visible: e,
      pgid: "pay_qrcode_modal",
      pgname: "扫码支付弹窗",
      showFooter: !1,
      className: Se.modal,
      contentClassName: Se.modalContent,
      content: m,
      onClose: u
    }
  );
}, vo = "_paymentCard_sqoly_8", Io = "_guideText_sqoly_35", wo = "_paymentContent_sqoly_9", Eo = "_countdownBar_sqoly_64", Mo = "_countdownNum_sqoly_91", Ao = "_storeHeader_sqoly_103", So = "_storeLogo_sqoly_110", Ro = "_storeName_sqoly_119", Lo = "_infoList_sqoly_133", To = "_infoRow_sqoly_140", ko = "_infoLabel_sqoly_148", Do = "_infoValue_sqoly_163", xo = "_infoValueColumn_sqoly_223", Oo = "_infoSubValue_sqoly_250", Fo = "_footer_sqoly_280", qo = "_hasDiscount_sqoly_292", Bo = "_priceBox_sqoly_297", $o = "_priceMain_sqoly_315", Vo = "_priceSymbol_sqoly_321", Uo = "_actualPrice_sqoly_330", Ho = "_discountTag_sqoly_338", Go = "_actions_sqoly_361", zo = "_btnCancel_sqoly_367", Qo = "_btnPrimary_sqoly_411", F = {
  paymentCard: vo,
  guideText: Io,
  paymentContent: wo,
  countdownBar: Eo,
  countdownNum: Mo,
  storeHeader: Ao,
  storeLogo: So,
  storeName: Ro,
  infoList: Lo,
  infoRow: To,
  infoLabel: ko,
  infoValue: Do,
  infoValueColumn: xo,
  infoSubValue: Oo,
  footer: Fo,
  hasDiscount: qo,
  priceBox: Bo,
  priceMain: $o,
  priceSymbol: Vo,
  actualPrice: Uo,
  discountTag: Ho,
  actions: Go,
  btnCancel: zo,
  btnPrimary: Qo
}, Yo = (e) => {
  const t = Math.max(0, e);
  return { minutes: Math.floor(t / 60), seconds: t % 60 };
}, Wo = ({
  order: e,
  remainSeconds: t,
  cancelLoading: r,
  guideText: a,
  payUrl: u,
  autoOpenPay: m = !1,
  deliveryAddress: g,
  fulfillment: M,
  onCancel: o
}) => {
  const [s, n] = z(!1), c = ee(!1);
  _e(() => {
    t <= 0 && n(!1);
  }, [t]), _e(() => {
    m && !c.current && t > 0 && (c.current = !0, n(!0));
  }, [m, t]);
  const i = k(() => n(!0), []), p = k(() => n(!1), []), d = de(() => Et(e), [e]), C = de(() => Te(e), [e]), y = de(() => He(e), [e]), { minutes: D, seconds: A } = de(() => Yo(t), [t]), N = (M ?? d.fulfillment) === me, w = g, { deliveryFeeCents: R, packagingFeeCents: O, discountCents: Q, actualPayCents: x } = y, S = Q > 0, G = t > 0 ? "pending" : "expired";
  return /* @__PURE__ */ f(
    "div",
    {
      className: F.paymentCard,
      "dt-eid": "card_exposure",
      "dt-ename": "支付卡片曝光",
      "dt-params": ue(J.payment, {
        card_type: "payment",
        order_id: e.order_id,
        actual_pay_cents: x,
        payment_method: "wechat",
        payment_type: "qrcode",
        expire_seconds: Math.max(0, t),
        status: G,
        delivery_type: N ? "delivery" : "self_pickup",
        order_brand: e.brand
      }),
      children: [
        /* @__PURE__ */ l("div", { className: F.guideText, children: a }),
        /* @__PURE__ */ f("div", { className: F.paymentContent, children: [
          /* @__PURE__ */ f("div", { className: F.countdownBar, children: [
            "请在",
            /* @__PURE__ */ l("span", { className: F.countdownNum, children: D }),
            "分",
            /* @__PURE__ */ l("span", { className: F.countdownNum, children: A }),
            "秒内完成支付，过时订单将会取消"
          ] }),
          /* @__PURE__ */ f("div", { className: F.storeHeader, children: [
            d.storeIcon && /* @__PURE__ */ l("img", { className: F.storeLogo, src: d.storeIcon, alt: d.storeName ?? "门店" }),
            /* @__PURE__ */ l("span", { className: F.storeName, children: d.storeName ?? "门店" })
          ] }),
          /* @__PURE__ */ l(Rt, { items: At(C) }),
          /* @__PURE__ */ f("div", { className: F.infoList, children: [
            N && w && /* @__PURE__ */ f("div", { className: F.infoRow, children: [
              /* @__PURE__ */ l("span", { className: F.infoLabel, children: "配送至" }),
              /* @__PURE__ */ f("div", { className: F.infoValueColumn, children: [
                /* @__PURE__ */ l("span", { className: F.infoValue, children: /* @__PURE__ */ f("span", { children: [
                  w.address,
                  w.address_detail ?? ""
                ] }) }),
                /* @__PURE__ */ f("span", { className: F.infoSubValue, children: [
                  w.contact_name,
                  " ",
                  w.contact_phone
                ] })
              ] })
            ] }),
            d.scheduledTime && /* @__PURE__ */ f("div", { className: F.infoRow, children: [
              /* @__PURE__ */ f("span", { className: F.infoLabel, children: [
                "预计",
                N ? "送达" : "取餐",
                "时间"
              ] }),
              /* @__PURE__ */ l("span", { className: F.infoValue, children: /* @__PURE__ */ l("span", { children: d.scheduledTime }) })
            ] }),
            /* @__PURE__ */ f("div", { className: F.infoRow, children: [
              /* @__PURE__ */ l("span", { className: F.infoLabel, children: "订单号" }),
              /* @__PURE__ */ l("span", { className: F.infoValue, children: /* @__PURE__ */ l("span", { children: e.order_id }) })
            ] }),
            /* @__PURE__ */ f("div", { className: F.infoRow, children: [
              /* @__PURE__ */ l("span", { className: F.infoLabel, children: "订单创建时间" }),
              /* @__PURE__ */ l("span", { className: F.infoValue, children: /* @__PURE__ */ l("span", { children: Pr(e.create_time) }) })
            ] }),
            (R > 0 || O > 0) && /* @__PURE__ */ f("div", { className: F.infoRow, children: [
              /* @__PURE__ */ l("span", { className: F.infoLabel, children: "额外费用" }),
              /* @__PURE__ */ f("span", { className: F.infoSubValue, children: [
                R > 0 && `配送费¥${Pe(R)}`,
                R > 0 && O > 0 && "，",
                O > 0 && `打包费¥${Pe(O)}`
              ] })
            ] })
          ] }),
          /* @__PURE__ */ f("footer", { className: `${F.footer} ${S ? F.hasDiscount : ""}`, children: [
            /* @__PURE__ */ f("div", { className: F.priceBox, children: [
              /* @__PURE__ */ f("div", { className: F.priceMain, children: [
                /* @__PURE__ */ l("span", { className: F.priceSymbol, children: "¥" }),
                /* @__PURE__ */ l("span", { className: F.actualPrice, children: Pe(x) })
              ] }),
              S && /* @__PURE__ */ f("span", { className: F.discountTag, children: [
                "已优惠",
                Pe(Q),
                "元"
              ] })
            ] }),
            /* @__PURE__ */ f("div", { className: F.actions, children: [
              /* @__PURE__ */ l(
                "button",
                {
                  type: "button",
                  className: F.btnCancel,
                  onClick: o,
                  disabled: r || e.cancellable !== !0,
                  "dt-eid": "payment_cancel_button",
                  "dt-ename": "取消订单",
                  "dt-params": ue(J.payment, { order_id: e.order_id, order_brand: e.brand }),
                  children: r ? "取消中…" : "取消订单"
                }
              ),
              /* @__PURE__ */ l(
                "button",
                {
                  type: "button",
                  className: F.btnPrimary,
                  onClick: i,
                  "dt-eid": "payment_qrcode",
                  "dt-ename": "立即支付",
                  "dt-params": ue(J.payment, {
                    order_id: e.order_id,
                    payment_type: "qrcode",
                    payment_method: "wechat",
                    actual_pay_cents: x,
                    status: G,
                    order_brand: e.brand
                  }),
                  children: "立即支付"
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ l(
          bo,
          {
            visible: s,
            payUrl: u,
            title: "请使用手机微信扫码支付",
            tip: "请在5分钟内完成支付",
            onClose: p
          }
        )
      ]
    }
  );
}, Ko = "data:image/svg+xml,%3csvg%20width='8'%20height='8'%20viewBox='0%200%208%208'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M4.00391%200C4.28005%201.20706e-08%204.50391%200.223858%204.50391%200.5V3.49414H7.5C7.77614%203.49414%208%203.718%208%203.99414C8%204.27028%207.77614%204.49414%207.5%204.49414H4.50391V7.5C4.50391%207.77614%204.28005%208%204.00391%208C3.72776%208%203.50391%207.77614%203.50391%207.5V4.49414H0.5C0.223858%204.49414%200%204.27028%200%203.99414C0%203.718%200.223858%203.49414%200.5%203.49414H3.50391V0.5C3.50391%200.223858%203.72776%20-2.58772e-10%204.00391%200Z'%20fill='white'/%3e%3c/svg%3e", Xo = "data:image/svg+xml,%3csvg%20width='30'%20height='30'%20viewBox='0%200%2030%2030'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M6.56934%209.23633H24.9502C25.411%209.23646%2025.7946%209.58965%2025.833%2010.0488L27.1973%2026.4131C27.2401%2026.9297%2026.8319%2027.373%2026.3135%2027.373H3.8418C3.29414%2027.373%202.87784%2026.881%202.96777%2026.3408L5.69434%209.97656C5.7657%209.54934%206.13616%209.23633%206.56934%209.23633Z'%20stroke='black'%20stroke-width='1.5'/%3e%3cpath%20d='M8.45703%208.99951V27.3063'%20stroke='black'%20stroke-width='1.5'/%3e%3cpath%20d='M17.4619%2019.1265L17.4248%2019.1255H17.499C17.4867%2019.1256%2017.4743%2019.1265%2017.4619%2019.1265ZM17.7568%201.13428C20.7827%201.28792%2023.1885%203.78993%2023.1885%206.854V9.30713H21.6885V6.854C21.6885%204.51943%2019.7964%202.62661%2017.4619%202.62646C15.1273%202.62646%2013.2344%204.51934%2013.2344%206.854V9.30713H11.7344V6.854C11.7344%203.69092%2014.2988%201.12646%2017.4619%201.12646L17.7568%201.13428Z'%20fill='black'/%3e%3cpath%20d='M14.4756%201.13428C15.4581%201.18417%2016.3744%201.48241%2017.165%201.96631L15.8135%201.94385L14.7344%202.6626C14.5531%202.63887%2014.3684%202.62648%2014.1807%202.62646C11.846%202.62646%209.95312%204.51934%209.95312%206.854V9.30713H8.45312V6.854C8.45312%203.69092%2011.0176%201.12646%2014.1807%201.12646L14.4756%201.13428Z'%20fill='black'/%3e%3c/svg%3e", jo = "data:image/svg+xml,%3csvg%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M13.6797%203.09961C14.2578%203.09967%2014.8119%203.33051%2015.2207%203.73926C15.6293%204.14799%2015.8593%204.70233%2015.8594%205.28027V6.0957H20.2412C20.5174%206.0957%2020.7412%206.31956%2020.7412%206.5957C20.7409%206.87162%2020.5172%207.0957%2020.2412%207.0957H18.9795V18.7207C18.9793%2019.2986%2018.7494%2019.853%2018.3408%2020.2617C17.9321%2020.6703%2017.3778%2020.9003%2016.7998%2020.9004H7.19922C6.62128%2020.9003%206.06693%2020.6703%205.6582%2020.2617C5.24959%2019.853%205.01969%2019.2986%205.01953%2018.7207V7.0957H3.44141C3.16526%207.0957%202.94141%206.87087%202.94141%206.59473C2.94167%206.31881%203.16543%206.0957%203.44141%206.0957H8.13965V5.28027C8.13973%204.70233%208.36972%204.14799%208.77832%203.73926C9.18711%203.33052%209.74125%203.09965%2010.3193%203.09961H13.6797ZM6.01953%2018.7207C6.01969%2019.0334%206.14415%2019.3335%206.36523%2019.5547C6.58642%2019.7757%206.8865%2019.9003%207.19922%2019.9004H16.7998C17.1125%2019.9003%2017.4126%2019.7758%2017.6338%2019.5547C17.8549%2019.3335%2017.9793%2019.0334%2017.9795%2018.7207V7.0957H6.01953V18.7207ZM13.8008%2010.6924C14.0769%2010.6924%2014.3008%2010.9162%2014.3008%2011.1924V16.2324C14.3007%2016.5085%2014.0769%2016.7324%2013.8008%2016.7324C13.5247%2016.7324%2013.3008%2016.5085%2013.3008%2016.2324V11.1924C13.3008%2010.9162%2013.5246%2010.6924%2013.8008%2010.6924ZM10.1992%2010.6602C10.4754%2010.6602%2010.6992%2010.884%2010.6992%2011.1602V16.2002C10.6989%2016.4761%2010.4752%2016.7002%2010.1992%2016.7002C9.92325%2016.7002%209.6995%2016.4761%209.69922%2016.2002V11.1602C9.69922%2010.884%209.92308%2010.6602%2010.1992%2010.6602ZM10.3193%204.10059C10.0065%204.10062%209.7066%204.22508%209.48535%204.44629C9.26428%204.66748%209.13973%204.96755%209.13965%205.28027V6.0957H14.8594V5.28027C14.8593%204.96755%2014.7347%204.66748%2014.5137%204.44629C14.2924%204.22508%2013.9925%204.10064%2013.6797%204.10059H10.3193Z'%20fill='black'%20fill-opacity='0.5'/%3e%3c/svg%3e", Zo = "_cartModalBox_d5bvt_9", Jo = "_cartModal_d5bvt_9", es = "_cartModalTitle_d5bvt_33", ts = "_cartModalEmpty_d5bvt_43", rs = "_qtyBtnSub_d5bvt_53", ns = "_qtyBtnAdd_d5bvt_54", os = "_qtyBtnAddRound_d5bvt_98", ss = "_qtyNum_d5bvt_104", as = "_cartModalList_d5bvt_26", cs = "_cartModalItem_d5bvt_132", is = "_qtyRow_d5bvt_143", ls = "_cartModalItemImage_d5bvt_155", ds = "_cartModalItemInfo_d5bvt_165", us = "_cartModalItemName_d5bvt_173", ms = "_cartModalItemSpec_d5bvt_185", _s = "_cartModalItemPrice_d5bvt_196", fs = "_cartModalFooter_d5bvt_219", ps = "_cartModalActions_d5bvt_228", hs = "_btnCancel_d5bvt_236", gs = "_btnPrimary_d5bvt_269", ys = "_btnClear_d5bvt_303", Cs = "_btnClearIcon_d5bvt_322", Ps = "_cartModalActionGroup_d5bvt_327", Z = {
  cartModalBox: Zo,
  cartModal: Jo,
  cartModalTitle: es,
  cartModalEmpty: ts,
  qtyBtnSub: rs,
  qtyBtnAdd: ns,
  qtyBtnAddRound: os,
  qtyNum: ss,
  cartModalList: as,
  cartModalItem: cs,
  qtyRow: is,
  cartModalItemImage: ls,
  cartModalItemInfo: ds,
  cartModalItemName: us,
  cartModalItemSpec: ms,
  cartModalItemPrice: _s,
  cartModalFooter: fs,
  cartModalActions: ps,
  btnCancel: hs,
  btnPrimary: gs,
  btnClear: ys,
  btnClearIcon: Cs,
  cartModalActionGroup: Ps
};
function Ns(e, t, r) {
  const a = e?.customization_groups?.find((m) => m.group_id === t);
  return a ? a.options?.find((m) => m.option_id === r)?.option_name ?? "" : "";
}
const bs = ({
  show: e,
  cartItems: t,
  productsDetails: r,
  onClose: a,
  onConfirm: u,
  onClearCart: m,
  onChangeQuantity: g
}) => {
  const M = k(
    (n) => {
      g(n, -1);
    },
    [g]
  ), o = k(
    (n) => {
      g(n, 1);
    },
    [g]
  ), s = de(() => {
    const n = /* @__PURE__ */ new Map();
    return t.forEach((c, i) => {
      const p = `${c.itemId}__${c.skuCode}`;
      let d = n.get(p);
      d || (d = [], n.set(p, d)), d.push({ line: c, index: i });
    }), Array.from(n.values()).map((c) => {
      const i = c[0], p = r.find((C) => C.item_id === i.line.itemId), d = i.line.specSummary || i.line.selectedOptions.map((C) => Ns(p, C.group_id, C.option_id)).filter(Boolean).join("/");
      return {
        // 订单预览返回后，商品名 / 图标以 line（OrderPreview 行）为准；line 缺失时才回退商品详情
        imageUrl: i.line.imageUrl || p?.image_url || "",
        name: i.line.name || p?.name || "",
        specText: d,
        originalPriceCents: i.line.originalPriceCents,
        totalQty: c.reduce((C, y) => C + y.line.quantity, 0),
        firstIndex: i.index
      };
    });
  }, [t, r]);
  return /* @__PURE__ */ l(
    ct,
    {
      visible: e,
      title: "已选择商品",
      onClose: a,
      maskClosable: !1,
      pgid: "recommend_card_cart",
      className: Z.cartModalBox,
      pgname: "购物车",
      children: /* @__PURE__ */ f("div", { className: Z.cartModal, children: [
        /* @__PURE__ */ l("div", { className: Z.cartModalTitle, children: "已选择商品" }),
        s.length === 0 ? /* @__PURE__ */ l("div", { className: Z.cartModalEmpty, children: "暂无商品" }) : /* @__PURE__ */ l("div", { className: Z.cartModalList, children: s.map((n) => /* @__PURE__ */ f("div", { className: Z.cartModalItem, children: [
          /* @__PURE__ */ l("img", { className: Z.cartModalItemImage, src: n.imageUrl, alt: n.name }),
          /* @__PURE__ */ f("div", { className: Z.cartModalItemInfo, children: [
            /* @__PURE__ */ l("div", { className: Z.cartModalItemName, children: n.name }),
            n.specText && /* @__PURE__ */ l("div", { className: Z.cartModalItemSpec, children: n.specText }),
            /* @__PURE__ */ l("div", { className: Z.cartModalItemPrice, children: /* @__PURE__ */ l("div", { className: Z.priceSymbol, children: /* @__PURE__ */ f("span", { children: [
              "¥",
              " ",
              Number.isFinite(n.originalPriceCents) ? (n.originalPriceCents / 100).toFixed(2) : "0.00"
            ] }) }) })
          ] }),
          /* @__PURE__ */ f("div", { className: Z.qtyRow, children: [
            /* @__PURE__ */ l(
              "img",
              {
                src: Lt,
                alt: "",
                className: Z.qtyBtnSub,
                onClick: () => M(n.firstIndex)
              }
            ),
            /* @__PURE__ */ l("span", { className: Z.qtyNum, children: n.totalQty }),
            /* @__PURE__ */ l(
              "img",
              {
                src: Tt,
                alt: "",
                className: `${Z.qtyBtnAdd} ${Z.qtyBtnAddRound}`,
                onClick: () => o(n.firstIndex)
              }
            )
          ] })
        ] }, `${n.firstIndex}-${n.name}`)) }),
        /* @__PURE__ */ l("div", { className: Z.cartModalFooter, children: /* @__PURE__ */ f("div", { className: Z.cartModalActions, children: [
          /* @__PURE__ */ f("button", { type: "button", className: Z.btnClear, onClick: m, children: [
            /* @__PURE__ */ l("img", { src: jo, alt: "", className: Z.btnClearIcon }),
            "清空"
          ] }),
          /* @__PURE__ */ f("div", { className: Z.cartModalActionGroup, children: [
            /* @__PURE__ */ l("button", { type: "button", className: Z.btnCancel, onClick: a, children: "取消" }),
            /* @__PURE__ */ l(
              "button",
              {
                type: "button",
                className: Z.btnPrimary,
                disabled: s.length === 0,
                onClick: u,
                children: "下单"
              }
            )
          ] })
        ] }) })
      ] })
    }
  );
}, vs = "_productRecommendCard_179cq_2", Is = "_cardHeader_179cq_16", ws = "_cardHeaderIcon_179cq_23", Es = "_cardHeaderTitle_179cq_35", Ms = "_cardContent_179cq_44", As = "_cardFooter_179cq_51", Ss = "_cardFooterLeft_179cq_68", Rs = "_cartIconWrap_179cq_86", Ls = "_cartBadge_179cq_120", Ts = "_estimateLabel_179cq_160", ks = "_estimatePriceIcon_179cq_175", Ds = "_estimatePrice_179cq_175", xs = "_originalPrice_179cq_198", Os = "_cardFooterRight_179cq_207", Fs = "_cardFooterCancelBtn_179cq_218", qs = "_cardFooterOrderBtn_179cq_269", Bs = "_productList_179cq_318", $s = "_empty_179cq_377", Vs = "_productItem_179cq_394", Us = "_imageBox_179cq_423", Hs = "_productContent_179cq_464", Gs = "_productName_179cq_485", zs = "_productFooter_179cq_503", Qs = "_productPrice_179cq_509", Ys = "_propuctMinimumPrice_179cq_520", Ws = "_priceSymbol_179cq_528", Ks = "_productOriginPrice_179cq_548", Xs = "_productAdd_179cq_562", js = "_productBadge_179cq_645", H = {
  productRecommendCard: vs,
  cardHeader: Is,
  cardHeaderIcon: ws,
  cardHeaderTitle: Es,
  cardContent: Ms,
  cardFooter: As,
  cardFooterLeft: Ss,
  cartIconWrap: Rs,
  cartBadge: Ls,
  estimateLabel: Ts,
  estimatePriceIcon: ks,
  estimatePrice: Ds,
  originalPrice: xs,
  cardFooterRight: Os,
  cardFooterCancelBtn: Fs,
  cardFooterOrderBtn: qs,
  productList: Bs,
  empty: $s,
  productItem: Vs,
  imageBox: Us,
  productContent: Hs,
  productName: Gs,
  productFooter: zs,
  productPrice: Qs,
  propuctMinimumPrice: Ys,
  priceSymbol: Ws,
  productOriginPrice: Ks,
  productAdd: Xs,
  productBadge: js
}, Zs = ({
  storeName: e,
  storeIcon: t,
  storeId: r,
  productLists: a,
  estimatePayCents: u,
  originalTotalCents: m,
  totalQty: g,
  cart: M,
  productDetails: o,
  detailsLoading: s,
  onAddLine: n,
  onChangeQuantity: c,
  onConfirm: i,
  onCancel: p,
  onToast: d,
  onClearCart: C,
  searchBrand: y = 1,
  brand: D,
  fulfillment: A
}) => {
  const [N, w] = z(null), [R, O] = z(!1), Q = de(() => {
    const E = {};
    return a.forEach((V) => {
      V.sku_code && !E[V.item_id] && (E[V.item_id] = V.sku_code);
    }), E;
  }, [a]), x = ee(null);
  Yt(() => {
    const E = document.querySelector(".agent-card-right");
    if (!E || !x.current) return;
    const V = () => {
      const re = E.getBoundingClientRect().width;
      x.current && (re >= 878 ? x.current.style.width = "846px" : re >= 680 ? x.current.style.width = "640px" : re >= 432 ? x.current.style.width = "400px" : x.current.style.width = "256px");
    };
    V();
    const W = new ResizeObserver(V);
    return W.observe(E), () => W.disconnect();
  }, []);
  const S = de(() => {
    const E = /* @__PURE__ */ new Set(), V = [];
    return a.forEach((W) => {
      if (E.has(W.item_id))
        return;
      const re = o[W.item_id];
      re && (E.add(W.item_id), V.push(re));
    }), V;
  }, [a, o]), G = k(() => {
    w(null);
  }, []), T = k(
    (E) => {
      n({
        itemId: E.itemId,
        skuCode: E.skuCode,
        quantity: E.quantity,
        replaceQuantity: E.replaceQuantity
      });
    },
    [n]
  ), ae = k(() => {
    if (!g) {
      d?.("请至少选择一件商品", "warning");
      return;
    }
    O(!0);
  }, [g, d]), b = k(() => {
    O(!1);
  }, []), $ = k(
    (E) => {
      const V = E.item_id, W = Q[V];
      T({ itemId: V, skuCode: W, quantity: 1 });
    },
    [Q, T]
  ), L = k(
    (E) => {
      if ((E.customization_groups?.length ?? 0) > 0) {
        w(E);
        return;
      }
      $(E);
    },
    [$]
  );
  return /* @__PURE__ */ f(
    "div",
    {
      ref: x,
      className: H.productRecommendCard,
      "dt-eid": "card_exposure",
      "dt-ename": "推荐卡片曝光",
      "dt-params": ue(J.recommend, {
        card_type: "recommend",
        store_id: r,
        item_count: S.length,
        order_brand: D
      }),
      children: [
        /* @__PURE__ */ f("div", { className: H.content, children: [
          /* @__PURE__ */ f("div", { className: H.cardHeader, children: [
            /* @__PURE__ */ l("div", { className: H.cardHeaderIcon, children: /* @__PURE__ */ l("img", { src: t, alt: "" }) }),
            /* @__PURE__ */ l("div", { className: H.cardHeaderTitle, children: e })
          ] }),
          /* @__PURE__ */ f("div", { className: H.cardContent, children: [
            s && /* @__PURE__ */ l("div", { className: H.empty, children: "加载中..." }),
            !s && S.length === 0 && /* @__PURE__ */ f("div", { className: H.empty, children: [
              /* @__PURE__ */ l("img", { className: H.emptyIcon, src: er, alt: "" }),
              /* @__PURE__ */ l("span", { className: H.emptyText, children: "暂无推荐商品" })
            ] }),
            !s && S.length > 0 && /* @__PURE__ */ l("div", { className: H.productList, children: S.map((E, V) => {
              const { item_id: W, name: re, image_url: fe } = E, le = Number(E.estimate_price?.amount_cents ?? 0), pe = Number(E.init_price?.amount_cents ?? 0), he = le ? (le / 100).toFixed(2) : "NAN", Ne = pe > le, ge = M.reduce((ne, ye) => ye.itemId === W ? ne + ye.quantity : ne, 0);
              return /* @__PURE__ */ f(
                "div",
                {
                  className: H.productItem,
                  "dt-eid": "recommend_item",
                  "dt-ename": "推荐商品项",
                  "dt-params": ue(J.recommend, {
                    store_id: r,
                    item_id: W,
                    item_name: re,
                    item_position: V,
                    price_cents: le,
                    is_available: E.is_available ? 1 : 0,
                    default_spec_summary: Mt(E.customization_groups),
                    order_brand: D
                  }),
                  onClick: () => L(E),
                  children: [
                    /* @__PURE__ */ l("div", { className: H.imageBox, children: /* @__PURE__ */ l("img", { src: fe, alt: re }) }),
                    /* @__PURE__ */ f("div", { className: H.productContent, children: [
                      /* @__PURE__ */ l("div", { className: H.productName, children: re }),
                      /* @__PURE__ */ f("div", { className: H.productFooter, children: [
                        /* @__PURE__ */ f("span", { className: H.productPrice, children: [
                          /* @__PURE__ */ f("span", { className: H.propuctMinimumPrice, children: [
                            /* @__PURE__ */ l("span", { className: H.priceSymbol, children: "￥" }),
                            he
                          ] }),
                          Ne && /* @__PURE__ */ f("span", { className: H.productOriginPrice, children: [
                            "￥",
                            (pe / 100).toFixed(2)
                          ] })
                        ] }),
                        /* @__PURE__ */ l("span", { className: H.productAdd, children: /* @__PURE__ */ l("img", { src: Ko, alt: "" }) }),
                        ge > 0 && /* @__PURE__ */ l("span", { className: H.productBadge, children: ge })
                      ] })
                    ] })
                  ]
                },
                W
              );
            }) })
          ] }),
          /* @__PURE__ */ f("div", { className: H.cardFooter, children: [
            /* @__PURE__ */ f("div", { className: H.cardFooterLeft, onClick: ae, children: [
              /* @__PURE__ */ f(
                "span",
                {
                  className: H.cartIconWrap,
                  "dt-eid": "recommend_cart_button",
                  "dt-ename": "购物车入口",
                  "dt-params": ue(J.recommend, {
                    store_id: r,
                    item_count: g,
                    order_brand: D
                  }),
                  children: [
                    /* @__PURE__ */ l("img", { src: Xo, alt: "" }),
                    g > 0 && /* @__PURE__ */ l("span", { className: H.cartBadge, children: g })
                  ]
                }
              ),
              /* @__PURE__ */ l("span", { className: H.estimateLabel, children: "预估" }),
              /* @__PURE__ */ l("span", { className: H.estimatePriceIcon, children: "￥" }),
              /* @__PURE__ */ l("span", { className: H.estimatePrice, children: (u / 100).toFixed(2) }),
              m > u && /* @__PURE__ */ f("span", { className: H.originalPrice, children: [
                "￥",
                (m / 100).toFixed(2)
              ] })
            ] }),
            /* @__PURE__ */ f("div", { className: H.cardFooterRight, children: [
              /* @__PURE__ */ l("button", { className: H.cardFooterCancelBtn, type: "button", onClick: p, children: "取消" }),
              /* @__PURE__ */ l(
                "button",
                {
                  className: H.cardFooterOrderBtn,
                  type: "button",
                  disabled: g === 0,
                  onClick: i,
                  "dt-eid": "recommend_confirm_button",
                  "dt-ename": "下单按钮",
                  "dt-params": ue(J.recommend, {
                    store_id: r,
                    item_count: g,
                    actual_pay_cents: u,
                    order_brand: D
                  }),
                  children: "下单"
                }
              )
            ] })
          ] })
        ] }),
        N && /* @__PURE__ */ l(
          kt,
          {
            product: N,
            productDetail: N,
            storeId: r,
            brand: y,
            fulfillment: A,
            onConfirm: T,
            onClose: G,
            onToast: d
          }
        ),
        /* @__PURE__ */ l(
          bs,
          {
            show: R,
            productsDetails: S,
            cartItems: M,
            onClose: b,
            onClearCart: C,
            onChangeQuantity: c,
            onConfirm: () => {
              i(), O(!1);
            }
          }
        )
      ]
    }
  );
}, nt = () => null, Js = ({ uri: e, params: t, api: r, conversationId: a = "", sourceMetadata: u, messageId: m }) => {
  Xt(r);
  const g = de(() => _r(t), [t]);
  jt({ sourceMetadata: u, messageId: m, brand: g.brand, conversationId: a });
  const o = String((t ?? {}).id ?? ""), s = g.storeId ?? "", n = g.productList ?? [], c = k(
    (ne, ye) => {
      r.ui?.toast?.(ne, ye);
    },
    [r]
  ), {
    status: i,
    productDetails: p,
    productDetailsLoading: d,
    draft: C,
    cart: y,
    display: D,
    amounts: A,
    pricing: N,
    creatingOrder: w,
    firstOrder: R,
    changeQuantity: O,
    addCartLine: Q,
    changeLineSpec: x,
    confirmSelection: S,
    enterPay: G,
    clear: T,
    clearCart: ae
  } = Ur(g, a, o, c), b = de(() => Cr(y), [y]), $ = k(() => {
    T(), r.resolve({ status: "cancelled", reason: "user_closed", uri: e });
  }, [r, T, e]), L = k(
    (ne) => {
      if (T(), ne.status === "success") {
        const ye = ie(ne.order.amount.actual_pay), Fe = mt(ne.order, g) === Be;
        r.resolve({
          status: "success",
          order_id: ne.order.order_id,
          ...Fe ? { pickup_code: ne.order.pickup_code } : {},
          ...ye > 0 ? { total_amount: ye } : {},
          uri: e
        });
      } else ne.status === "user_cancel" ? r.resolve({ status: "cancelled", reason: "user_closed", uri: e }) : r.resolve({
        status: "timeout",
        errorCode: "PAY_TIMEOUT",
        errorMessage: "支付超时",
        uri: e
      });
    },
    [r, T, g, e]
  ), E = k(
    (ne) => {
      r.ui?.toast?.("订单状态查询失败", "warning");
    },
    [r]
  ), {
    order: V,
    remainSeconds: W,
    cancelLoading: re,
    cancel: fe
  } = kr({
    brand: g.brand,
    orderId: C.orderId ?? "",
    initialOrder: R,
    onSettled: L,
    onError: E
  }), le = mt(V, g), { address: pe } = br({
    brand: g.brand,
    fulfillment: le,
    addressId: g.addressId
  }), he = k(async () => {
    try {
      await G(pe);
    } catch (ne) {
      r.ui?.toast?.(xe(ne, "创建订单失败，请重试"), "error");
    }
  }, [r, pe, G]), Ne = k(() => {
    if (b === 0) {
      r.ui?.toast?.("请至少选择一件商品", "warning");
      return;
    }
    S();
  }, [r, b, S]), ge = k(async () => {
    try {
      await fe();
    } catch (ne) {
      r.ui?.toast?.(xe(ne, "取消订单失败"), "error");
    }
  }, [r, fe]);
  return i === "loading" ? /* @__PURE__ */ l(nt, { kind: "loading" }) : C.step === "recommend" ? /* @__PURE__ */ l(
    Zs,
    {
      storeName: D?.storeName,
      storeId: s,
      storeIcon: D?.storeIcon,
      guideText: Ke.recommend,
      estimatePayCents: b === 0 ? 0 : A.actualPayCents,
      originalTotalCents: b === 0 ? 0 : A.totalOriginalCents,
      totalQty: b,
      cart: y,
      pricing: N,
      productDetails: p,
      detailsLoading: d,
      onAddLine: Q,
      onChangeQuantity: O,
      productLists: n,
      onConfirm: Ne,
      onCancel: $,
      onToast: c,
      onClearCart: ae,
      fulfillment: g.fulfillment,
      brand: g.brand
    }
  ) : D ? C.step === "confirm" ? /* @__PURE__ */ l(
    no,
    {
      display: D,
      cart: y,
      storeId: s,
      brand: g.brand,
      fulfillment: g.fulfillment,
      amounts: A,
      productDetails: p,
      guideText: Ke.confirm,
      deliveryAddress: pe,
      onPay: he,
      creating: w,
      onCancel: $,
      onChangeSpec: x,
      onToast: c
    }
  ) : V ? /* @__PURE__ */ l(
    Wo,
    {
      order: V,
      remainSeconds: W,
      cancelLoading: re,
      guideText: Ke.pay,
      payUrl: C.payUrl ?? or,
      autoOpenPay: R !== null,
      deliveryAddress: pe,
      fulfillment: le,
      onCancel: ge
    }
  ) : /* @__PURE__ */ l(nt, { kind: "loading" }) : /* @__PURE__ */ l(nt, { kind: "loading" });
}, aa = (e) => Wt(e.sourceMetadata) ? /* @__PURE__ */ l(Kt, {}) : /* @__PURE__ */ l(Js, { ...e });
export {
  aa as default
};
