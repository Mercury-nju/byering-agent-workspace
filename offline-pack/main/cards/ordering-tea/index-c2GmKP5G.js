import { p as U, h as rt, v as nt, b as ot, m as qe, d as de, e as M, j as f, f as k, q as at, w as Le, c as it } from "./report-BkiHygWt.js";
const V = rt("StoreApi");
class st {
  /** 获取城市列表 */
  async getCityList(e) {
    return await U("/v3/marvis_commerce_get_city_list", e).then(
      (n) => n,
      (n) => (V.error("[getCityList] {0!e}", n), {})
    );
  }
  /** 关键词搜门店 */
  async searchStores(e) {
    return await U("/v3/marvis_commerce_search_stores", e).then(
      (n) => n,
      (n) => (V.error("[searchStores] {0!e}", n), {})
    );
  }
  /** 获取门店详情 */
  async getStoreDetail(e) {
    return await U("/v3/marvis_commerce_get_store", e).then(
      (n) => n,
      (n) => (V.error("[getStoreDetail] {0!e}", n), {})
    );
  }
  /** 查询附近门店 */
  async listNearbyStores(e) {
    return await U("/v3/marvis_commerce_list_nearby_stores", e).then(
      (n) => n,
      (n) => (V.error("[listNearbyStores] {0!e}", n), {})
    );
  }
}
const Jt = new st();
var H = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function ct(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
const Be = window.__MARVIS_REACT_DOM_CLIENT__;
if (!Be)
  throw new Error("[marvis-card] window.__MARVIS_REACT_DOM_CLIENT__ 未注入；请确认主端已调用 installMarvisCardHostRuntime() 暴露 React 实例");
const { createRoot: Me, hydrateRoot: Qt, version: er } = Be, Ae = window.__MARVIS_REACT_DOM__;
if (!Ae)
  throw new Error("[marvis-card] window.__MARVIS_REACT_DOM__ 未注入；请确认主端已调用 installMarvisCardHostRuntime() 暴露 React 实例");
const { createPortal: lt, flushSync: tr, preconnect: rr, prefetchDNS: nr, preinit: or, preinitModule: ar, preload: ir, preloadModule: sr, requestFormReset: cr, unstable_batchedUpdates: lr, useFormState: ur, useFormStatus: dr, version: fr } = Ae, De = 10200, ut = 10, dt = 0.2, Pe = "ai_launcher_overlay_contain";
function ve(t) {
  return typeof t == "number" ? `${t}px` : t;
}
function ft(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var pe = { exports: {} }, he;
function mt() {
  return he || (he = 1, (function(t) {
    (function() {
      var e = {}.hasOwnProperty;
      function r() {
        for (var a = "", i = 0; i < arguments.length; i++) {
          var s = arguments[i];
          s && (a = n(a, o(s)));
        }
        return a;
      }
      function o(a) {
        if (typeof a == "string" || typeof a == "number")
          return a;
        if (typeof a != "object")
          return "";
        if (Array.isArray(a))
          return r.apply(null, a);
        if (a.toString !== Object.prototype.toString && !a.toString.toString().includes("[native code]"))
          return a.toString();
        var i = "";
        for (var s in a)
          e.call(a, s) && a[s] && (i = n(i, s));
        return i;
      }
      function n(a, i) {
        return i ? a ? a + " " + i : a + i : a;
      }
      t.exports ? (r.default = r, t.exports = r) : window.classNames = r;
    })();
  })(pe)), pe.exports;
}
var bt = mt();
const R = /* @__PURE__ */ ft(bt), _t = "_overlay_10ij9_6", vt = "_modal_10ij9_18", pt = "_modalBasic_10ij9_30", ht = "_title_10ij9_37", gt = "_content_10ij9_42", yt = "_btn_10ij9_46", wt = "_footer_10ij9_80", jt = "_footerButtons_10ij9_81", St = "_closeBtn_10ij9_86", Tt = "_titleIcon_10ij9_123", Ct = "_titleText_10ij9_137", Ot = "_footerExtra_10ij9_159", It = "_btnDefault_10ij9_190", xt = "_btnPrimary_10ij9_198", u = {
  overlay: _t,
  modal: vt,
  modalBasic: pt,
  title: ht,
  content: gt,
  btn: yt,
  footer: wt,
  footerButtons: jt,
  closeBtn: St,
  titleIcon: Tt,
  titleText: Ct,
  footerExtra: Ot,
  btnDefault: It,
  btnPrimary: xt
};
let Nt = (t) => t;
function Et() {
  return Nt;
}
function Rt() {
  return /* @__PURE__ */ f("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: /* @__PURE__ */ f(
    "path",
    {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M12.9495 2.34313C13.1447 2.14794 13.4612 2.14807 13.6565 2.34313C13.8518 2.53839 13.8518 2.8549 13.6565 3.05016L8.70632 7.99938L13.6565 12.9496C13.8518 13.1448 13.8518 13.4613 13.6565 13.6566C13.4613 13.8519 13.1447 13.8519 12.9495 13.6566L7.99929 8.70641L3.05007 13.6566C2.85481 13.8518 2.53829 13.8519 2.34304 13.6566C2.14799 13.4613 2.14789 13.1448 2.34304 12.9496L7.29226 7.99938L2.34304 3.05016C2.14778 2.8549 2.14778 2.53839 2.34304 2.34313C2.5383 2.14787 2.85481 2.14787 3.05007 2.34313L7.99929 7.29235L12.9495 2.34313Z",
      fill: "#000000",
      fillOpacity: 0.3
    }
  ) });
}
function kt() {
  return /* @__PURE__ */ k("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [
    /* @__PURE__ */ f("circle", { cx: "10", cy: "10", r: "10", fill: "#FF7D00" }),
    /* @__PURE__ */ f("rect", { x: "9.25", y: "5", width: "1.5", height: "7", rx: "0.75", fill: "white" }),
    /* @__PURE__ */ f("circle", { cx: "10", cy: "14", r: "1", fill: "white" })
  ] });
}
const S = [];
let fe = 0, A = 0;
function qt() {
  return fe += 1, De + fe * ut;
}
function me({
  visible: t,
  title: e,
  titleIcon: r,
  content: o,
  children: n,
  pgid: a,
  pgname: i,
  dtParams: s,
  width: m,
  height: c,
  okText: b = "确定",
  cancelText: v = "取消",
  onOk: w,
  onCancel: g,
  hideOkBtn: _ = !1,
  hideCancelBtn: y = !1,
  hideCloseBtn: T = !1,
  showFooter: P = !0,
  footer: j,
  buttons: C,
  footerExtra: E,
  cancelButtonClassName: z,
  okButtonClassName: X,
  maskOpacity: G = dt,
  maskClosable: O = !1,
  onClose: L,
  className: Z,
  style: K,
  contentClassName: B,
  contentStyle: l,
  portalContainerId: p,
  dataAttributes: I,
  variant: F = "feature"
}) {
  const x = nt(), [Ve, He] = ot(De), ze = qe(null), _e = p && document.getElementById(p) || document.getElementById(Pe) || document.body;
  de(() => {
    if (t) {
      const d = qt();
      return He(d), A += 1, S.push({ id: x, zIndex: d }), document.body.style.overflow = "hidden", () => {
        A -= 1, A <= 0 && (A = 0, document.body.style.overflow = ""), A === 0 && (fe = 0);
        const h = S.findIndex(($) => $.id === x);
        h !== -1 && S.splice(h, 1);
      };
    }
  }, [t, x, _e]);
  const N = M(() => {
    L?.();
  }, [L]);
  de(() => {
    if (!t) return;
    const d = (h) => {
      if (h.key === "Escape") {
        if (S.length === 0) return;
        S[S.length - 1].id === x && N();
      }
    };
    return document.addEventListener("keydown", d), () => {
      document.removeEventListener("keydown", d);
    };
  }, [t, N, x]);
  const Xe = M(
    (d) => {
      if (O && d.target === d.currentTarget) {
        if (S.length === 0) return;
        S[S.length - 1].id === x && N();
      }
    },
    [O, N, x]
  ), Ze = M((d) => {
    d.stopPropagation(), d.preventDefault();
  }, []), Ke = M(async () => {
    await w?.();
  }, [w]), Ye = M(async () => {
    g ? await g() : N();
  }, [g, N]), Je = (d) => d.map((h, $) => /* @__PURE__ */ f(
    "button",
    {
      className: R(
        u.btn,
        h.type === "primary" ? u.btnPrimary : u.btnDefault,
        h.className
      ),
      style: h.style,
      disabled: h.disabled,
      onClick: h.onClick,
      "dt-eid": "modal_custom_btn",
      "dt-ename": "弹窗按钮",
      "dt-params": `mod_id=stack_modal&slot=${$}`,
      children: h.text
    },
    $
  )), Qe = () => j === null || !P ? null : j !== void 0 ? /* @__PURE__ */ f("div", { className: u.footer, children: j }) : C && C.length > 0 ? /* @__PURE__ */ f("div", { className: u.footer, children: Je(C) }) : !y || !_ ? /* @__PURE__ */ k("div", { className: u.footer, children: [
    E && /* @__PURE__ */ f("div", { className: u.footerExtra, children: E }),
    /* @__PURE__ */ k("div", { className: u.footerButtons, children: [
      !y && /* @__PURE__ */ f(
        "button",
        {
          className: R(u.btn, u.btnDefault, z),
          onClick: Ye,
          "dt-eid": "modal_cancel_btn",
          "dt-ename": "取消",
          "dt-params": "mod_id=stack_modal",
          children: v
        }
      ),
      !_ && /* @__PURE__ */ f(
        "button",
        {
          className: R(u.btn, u.btnPrimary, X),
          onClick: Ke,
          "dt-eid": "modal_ok_btn",
          "dt-ename": "确定",
          "dt-params": "mod_id=stack_modal",
          children: b
        }
      )
    ] })
  ] }) : null, et = () => {
    if (!e && !r) return null;
    const d = r === "warning" ? /* @__PURE__ */ f(kt, {}) : r;
    return /* @__PURE__ */ k("div", { className: u.title, children: [
      d && /* @__PURE__ */ f("span", { className: u.titleIcon, children: d }),
      /* @__PURE__ */ f("span", { className: u.titleText, children: e })
    ] });
  };
  if (!t) return null;
  const W = { ...K };
  if (m !== void 0) {
    const d = ve(m);
    W.width = d, W.minWidth = d;
  }
  c !== void 0 && (W.height = ve(c));
  const tt = `rgba(15, 15, 15, ${G})`;
  return lt(
    /* @__PURE__ */ f(
      "div",
      {
        ref: ze,
        className: R(u.overlay),
        style: { zIndex: Ve, backgroundColor: tt },
        onClick: Xe,
        onContextMenu: Ze,
        ...I,
        "dt-pgid": a,
        "dt-pgname": i,
        ...s ? { "dt-params": s } : {},
        children: /* @__PURE__ */ k(
          "div",
          {
            className: R(u.modal, { [u.modalBasic]: F === "basic" }, Z),
            style: W,
            children: [
              !T && Et()(
                /* @__PURE__ */ f(
                  "button",
                  {
                    className: u.closeBtn,
                    onClick: N,
                    "dt-eid": "modal_close_btn",
                    "dt-ename": "关闭弹窗",
                    "dt-params": "mod_id=stack_modal",
                    children: /* @__PURE__ */ f(Rt, {})
                  }
                )
              ),
              n || /* @__PURE__ */ k(at, { children: [
                et(),
                o && /* @__PURE__ */ f("div", { className: R(u.content, B), style: l, children: typeof o == "string" ? /* @__PURE__ */ f("span", { children: o }) : o }),
                Qe()
              ] })
            ]
          }
        )
      }
    ),
    _e
  );
}
const q = /* @__PURE__ */ new Set(), D = /* @__PURE__ */ new Map();
function Ge(t) {
  if (t) {
    const e = document.getElementById(t);
    if (e) return e;
  }
  return document.getElementById(Pe) || document.body;
}
const be = me;
be.confirm = (t) => new Promise((e) => {
  const { modalIdentifier: r, onOk: o, onCancel: n, className: a, ...i } = t;
  if (r) {
    if (q.has(r)) {
      e(!1);
      return;
    }
    q.add(r);
  }
  const s = document.createElement("div");
  Ge(i.portalContainerId).appendChild(s);
  const m = Me(s), c = () => {
    m.unmount(), s.parentNode && s.parentNode.removeChild(s), r && (q.delete(r), D.delete(r));
  };
  r && D.set(r, c);
  const b = async () => {
    await o?.(), c(), e(!0);
  }, v = async () => {
    await n?.(), c(), e(!1);
  }, w = () => {
    c(), e(!1);
  };
  m.render(
    Le(me, {
      ...i,
      className: a,
      variant: "basic",
      visible: !0,
      onOk: b,
      onCancel: v,
      onClose: w
    })
  );
});
be.open = (t) => {
  const { modalIdentifier: e, onClose: r, ...o } = t;
  if (e) {
    if (q.has(e))
      return () => {
      };
    q.add(e);
  }
  const n = document.createElement("div");
  Ge(o.portalContainerId).appendChild(n);
  const a = Me(n), i = () => {
    a.unmount(), n.parentNode && n.parentNode.removeChild(n), e && (q.delete(e), D.delete(e));
  };
  e && D.set(e, i);
  const s = () => {
    r?.(), i();
  };
  return a.render(
    Le(me, {
      ...o,
      visible: !0,
      onClose: s
    })
  ), i;
};
be.close = (t) => {
  const e = D.get(t);
  e && e();
};
function Lt(t, e) {
  var r = typeof Symbol == "function" && t[Symbol.iterator];
  if (!r) return t;
  var o = r.call(t), n, a = [], i;
  try {
    for (; (e === void 0 || e-- > 0) && !(n = o.next()).done; ) a.push(n.value);
  } catch (s) {
    i = { error: s };
  } finally {
    try {
      n && !n.done && (r = o.return) && r.call(o);
    } finally {
      if (i) throw i.error;
    }
  }
  return a;
}
function Bt(t, e, r) {
  if (r || arguments.length === 2) for (var o = 0, n = e.length, a; o < n; o++)
    (a || !(o in e)) && (a || (a = Array.prototype.slice.call(e, 0, o)), a[o] = e[o]);
  return t.concat(a || Array.prototype.slice.call(e));
}
function Fe(t) {
  var e = qe(t);
  return e.current = t, e;
}
var Mt = function(t) {
  var e = Fe(t);
  de(function() {
    return function() {
      e.current();
    };
  }, []);
}, Y, ge;
function We() {
  if (ge) return Y;
  ge = 1;
  function t(e) {
    var r = typeof e;
    return e != null && (r == "object" || r == "function");
  }
  return Y = t, Y;
}
var J, ye;
function At() {
  if (ye) return J;
  ye = 1;
  var t = typeof H == "object" && H && H.Object === Object && H;
  return J = t, J;
}
var Q, we;
function $e() {
  if (we) return Q;
  we = 1;
  var t = At(), e = typeof self == "object" && self && self.Object === Object && self, r = t || e || Function("return this")();
  return Q = r, Q;
}
var ee, je;
function Dt() {
  if (je) return ee;
  je = 1;
  var t = $e(), e = function() {
    return t.Date.now();
  };
  return ee = e, ee;
}
var te, Se;
function Pt() {
  if (Se) return te;
  Se = 1;
  var t = /\s/;
  function e(r) {
    for (var o = r.length; o-- && t.test(r.charAt(o)); )
      ;
    return o;
  }
  return te = e, te;
}
var re, Te;
function Gt() {
  if (Te) return re;
  Te = 1;
  var t = Pt(), e = /^\s+/;
  function r(o) {
    return o && o.slice(0, t(o) + 1).replace(e, "");
  }
  return re = r, re;
}
var ne, Ce;
function Ue() {
  if (Ce) return ne;
  Ce = 1;
  var t = $e(), e = t.Symbol;
  return ne = e, ne;
}
var oe, Oe;
function Ft() {
  if (Oe) return oe;
  Oe = 1;
  var t = Ue(), e = Object.prototype, r = e.hasOwnProperty, o = e.toString, n = t ? t.toStringTag : void 0;
  function a(i) {
    var s = r.call(i, n), m = i[n];
    try {
      i[n] = void 0;
      var c = !0;
    } catch {
    }
    var b = o.call(i);
    return c && (s ? i[n] = m : delete i[n]), b;
  }
  return oe = a, oe;
}
var ae, Ie;
function Wt() {
  if (Ie) return ae;
  Ie = 1;
  var t = Object.prototype, e = t.toString;
  function r(o) {
    return e.call(o);
  }
  return ae = r, ae;
}
var ie, xe;
function $t() {
  if (xe) return ie;
  xe = 1;
  var t = Ue(), e = Ft(), r = Wt(), o = "[object Null]", n = "[object Undefined]", a = t ? t.toStringTag : void 0;
  function i(s) {
    return s == null ? s === void 0 ? n : o : a && a in Object(s) ? e(s) : r(s);
  }
  return ie = i, ie;
}
var se, Ne;
function Ut() {
  if (Ne) return se;
  Ne = 1;
  function t(e) {
    return e != null && typeof e == "object";
  }
  return se = t, se;
}
var ce, Ee;
function Vt() {
  if (Ee) return ce;
  Ee = 1;
  var t = $t(), e = Ut(), r = "[object Symbol]";
  function o(n) {
    return typeof n == "symbol" || e(n) && t(n) == r;
  }
  return ce = o, ce;
}
var le, Re;
function Ht() {
  if (Re) return le;
  Re = 1;
  var t = Gt(), e = We(), r = Vt(), o = NaN, n = /^[-+]0x[0-9a-f]+$/i, a = /^0b[01]+$/i, i = /^0o[0-7]+$/i, s = parseInt;
  function m(c) {
    if (typeof c == "number")
      return c;
    if (r(c))
      return o;
    if (e(c)) {
      var b = typeof c.valueOf == "function" ? c.valueOf() : c;
      c = e(b) ? b + "" : b;
    }
    if (typeof c != "string")
      return c === 0 ? c : +c;
    c = t(c);
    var v = a.test(c);
    return v || i.test(c) ? s(c.slice(2), v ? 2 : 8) : n.test(c) ? o : +c;
  }
  return le = m, le;
}
var ue, ke;
function zt() {
  if (ke) return ue;
  ke = 1;
  var t = We(), e = Dt(), r = Ht(), o = "Expected a function", n = Math.max, a = Math.min;
  function i(s, m, c) {
    var b, v, w, g, _, y, T = 0, P = !1, j = !1, C = !0;
    if (typeof s != "function")
      throw new TypeError(o);
    m = r(m) || 0, t(c) && (P = !!c.leading, j = "maxWait" in c, w = j ? n(r(c.maxWait) || 0, m) : w, C = "trailing" in c ? !!c.trailing : C);
    function E(l) {
      var p = b, I = v;
      return b = v = void 0, T = l, g = s.apply(I, p), g;
    }
    function z(l) {
      return T = l, _ = setTimeout(O, m), P ? E(l) : g;
    }
    function X(l) {
      var p = l - y, I = l - T, F = m - p;
      return j ? a(F, w - I) : F;
    }
    function G(l) {
      var p = l - y, I = l - T;
      return y === void 0 || p >= m || p < 0 || j && I >= w;
    }
    function O() {
      var l = e();
      if (G(l))
        return L(l);
      _ = setTimeout(O, X(l));
    }
    function L(l) {
      return _ = void 0, C && b ? E(l) : (b = v = void 0, g);
    }
    function Z() {
      _ !== void 0 && clearTimeout(_), T = 0, b = y = v = _ = void 0;
    }
    function K() {
      return _ === void 0 ? g : L(e());
    }
    function B() {
      var l = e(), p = G(l);
      if (b = arguments, v = this, y = l, p) {
        if (_ === void 0)
          return z(y);
        if (j)
          return clearTimeout(_), _ = setTimeout(O, m), E(y);
      }
      return _ === void 0 && (_ = setTimeout(O, m)), g;
    }
    return B.cancel = Z, B.flush = K, B;
  }
  return ue = i, ue;
}
var Xt = zt();
const Zt = /* @__PURE__ */ ct(Xt);
function Kt() {
  var t = (typeof global > "u" ? "undefined" : typeof global) == "object" && global && global.Object === Object && global, e = typeof self == "object" && self && self.Object === Object && self;
  return t || e;
}
Kt() || (global.Date = Date);
function mr(t, e) {
  var r, o = Fe(t), n = (r = e?.wait) !== null && r !== void 0 ? r : 1e3, a = it(function() {
    return Zt(function() {
      for (var i = [], s = 0; s < arguments.length; s++)
        i[s] = arguments[s];
      return o.current.apply(o, Bt([], Lt(i), !1));
    }, n, e);
  }, []);
  return Mt(function() {
    a.cancel();
  }), {
    run: a,
    cancel: a.cancel,
    flush: a.flush
  };
}
export {
  be as A,
  Lt as _,
  H as c,
  Jt as s,
  mr as u
};
