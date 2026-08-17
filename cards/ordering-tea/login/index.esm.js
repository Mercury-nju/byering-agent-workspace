import { i as ne, j as r, M as te, u as oe, n as ae, a as re, b as u, c as f, d as E, e as N, r as C, O as w, f as i, g as d, h as se, k as ie, l as s } from "../report-BkiHygWt.js";
import { r as O } from "../apiError-CRSB73RG.js";
import { u as I } from "../userLogin-BzmJpzuu.js";
import { s as ce, n as le } from "../select-Cu-uucJn.js";
import { i as k } from "../phone-BZQQaCk4.js";
const de = "_loginCard_1wtgg_3", _e = "_title_1wtgg_17", ge = "_formItem_1wtgg_26", me = "_label_1wtgg_32", ue = "_input_1wtgg_42", pe = "_codeInput_1wtgg_64", he = "_codeRow_1wtgg_69", be = "_codeBtn_1wtgg_86", fe = "_hightLight_1wtgg_108", Ce = "_policyLinkContainer_1wtgg_116", we = "_policyLink_1wtgg_116", ye = "_defaultText_1wtgg_132", Le = "_footer_1wtgg_136", Ne = "_allow_1wtgg_143", Ie = "_iconContainer_1wtgg_152", ke = "_action_1wtgg_162", ve = "_btnSecondary_1wtgg_170", Se = "_btnPrimary_1wtgg_202", n = {
  loginCard: de,
  title: _e,
  formItem: ge,
  label: me,
  input: ue,
  codeInput: pe,
  codeRow: he,
  codeBtn: be,
  hightLight: fe,
  policyLinkContainer: Ce,
  policyLink: we,
  defaultText: ye,
  footer: Le,
  allow: Ne,
  iconContainer: Ie,
  action: ke,
  btnSecondary: ve,
  btnPrimary: Se
}, v = "phone_sms", P = se("LoginCard"), Te = 60, D = /^\d{4,6}$/;
function R(e, p) {
  if (e)
    return p ? "complete" : "invalid";
}
const Ee = ({ api: e, params: p, sourceMetadata: h, messageId: y, conversationId: b }) => {
  oe(e);
  const S = ae(p), a = S?.brand || 1;
  re({ sourceMetadata: h, messageId: y, brand: a, conversationId: b });
  const x = S?.phone ?? "", [_, M] = u(null), [U, A] = u(!1), B = f(
    () => _?.privacy_agreement_url || "https://privacy.qq.com/document/preview/6c3760b1810e436ca8bd122984cd5183",
    [_?.privacy_agreement_url]
  ), $ = f(
    () => _?.user_agreement_url || "https://rule.tencent.com/rule/202604280002",
    [_?.user_agreement_url]
  ), G = f(() => _?.brand_name || "瑞幸", [_?.brand_name]), [g, j] = u(!1), [c, q] = u(x), [m, H] = u(""), [l, T] = u(0), F = f(() => g ? ce : le, [g]);
  E(() => {
    if (l <= 0)
      return;
    const t = setTimeout(() => {
      T((o) => o - 1);
    }, 1e3);
    return () => clearTimeout(t);
  }, [l]);
  const K = N(() => {
    if (l > 0)
      return;
    if (!k(c)) {
      e.ui.toast("请输入正确的手机号", "warning");
      return;
    }
    const t = {
      brand: a,
      phone_number: c
    };
    I.sendSmsCode(t).then((o) => {
      if (o?.base?.code === 0) {
        const L = o?.retry_after_seconds && o.retry_after_seconds > 0 ? o.retry_after_seconds : Te;
        T(L), e.ui.toast("验证码已发送至您的手机，请查收", "success");
      } else
        P.error("[sendSmsCode] 调用失败, err_msg is {0}", o?.base?.message), e.ui.toast(O(o?.base, "验证码发送失败，请稍后重试"), "error"), C(
          w.EXCEPTION_FALLBACK,
          {
            exception_type: "send_sms_failed",
            fail_reason: o?.base?.message
          },
          { card_id: s.login }
        );
    });
  }, [l, c, a, e.ui]), V = N(() => {
    if (!k(c)) {
      e.ui.toast("请输入正确的手机号", "warning");
      return;
    }
    if (!D.test(m)) {
      e.ui.toast("请输入 4-6 位验证码", "warning");
      return;
    }
    if (!g) {
      e.ui.toast("请同意用户协议、隐私政策", "warning");
      return;
    }
    const t = {
      brand: a,
      method: 1,
      phone_number: c,
      sms_code: m,
      agreement_checked: !0
    };
    I.login(t).then((o) => {
      o?.base?.code === 0 ? (e.resolve({ status: "success", mobile: o?.profile?.phone_number }), C(
        w.LOGIN_SUBMIT_RESULT,
        {
          login_result: "1"
        },
        { card_id: s.login }
      )) : (P.error("[login] 调用失败, err_msg is {0}", o?.base?.message), e.ui.toast(O(o?.base, "登录失败，请稍后重试"), "error"), C(
        w.LOGIN_SUBMIT_RESULT,
        {
          login_result: "0",
          fail_reason: o?.base?.message
        },
        { card_id: s.login }
      ));
    });
  }, [c, m, g, a, e]), W = N(() => {
    e.resolve({ status: "cancelled", reason: "user_closed" });
  }, [e]), z = l > 0, X = l > 0 ? `${l}s 后重发` : "获取验证码", Y = R(c, k(c)), J = R(m, D.test(m));
  return E(() => {
    I.getAuthProfile(a).then((t) => {
      if (t?.base?.code === 0) {
        const { user_agreement_url: L, privacy_agreement_url: Q, brand_name: Z, brand_logo_url: ee } = t;
        M({ user_agreement_url: L, privacy_agreement_url: Q, brand_name: Z, brand_logo_url: ee }), A(t.profile?.is_logged_in ?? !1);
      }
      const o = t?.profile?.is_logged_in ?? !1;
      C(
        w.ACCOUNT_CHECK,
        {
          brand_account_bound: o ? "1" : "0",
          need_login_card: o ? "0" : "1",
          check_result: t?.base?.code === 0 ? "1" : "0",
          fail_reason: t?.base?.code === 0 ? void 0 : t?.base?.message
        },
        { card_id: s.login }
      );
    });
  }, [a]), /* @__PURE__ */ i(
    "div",
    {
      className: n.loginCard,
      "dt-eid": "card_exposure",
      "dt-ename": "登录卡片曝光",
      "dt-params": d(s.login, {
        card_type: "login",
        login_status: U ? "logged_in" : "idle",
        login_method: v,
        order_brand: a
      }),
      children: [
        /* @__PURE__ */ i("span", { className: n.title, children: [
          "登录",
          G,
          "账号"
        ] }),
        /* @__PURE__ */ i("div", { className: n.formItem, children: [
          /* @__PURE__ */ r("label", { className: n.label, children: "手机号" }),
          /* @__PURE__ */ r(
            "input",
            {
              className: n.input,
              type: "tel",
              inputMode: "numeric",
              maxLength: 11,
              placeholder: "请输入 11 位手机号",
              value: c,
              onChange: (t) => q(t.target.value.replace(/\D/g, "")),
              "dt-eid": "phone_input",
              "dt-ename": "手机号输入框",
              "dt-params": d(s.login, {
                input_status: Y,
                order_brand: a
              })
            }
          )
        ] }),
        /* @__PURE__ */ i("div", { className: n.formItem, children: [
          /* @__PURE__ */ r("label", { className: n.label, children: "验证码" }),
          /* @__PURE__ */ i("div", { className: n.codeRow, children: [
            /* @__PURE__ */ r(
              "input",
              {
                className: `${n.input} ${n.codeInput}`,
                type: "tel",
                inputMode: "numeric",
                maxLength: 6,
                placeholder: "请输入验证码",
                value: m,
                onChange: (t) => H(t.target.value.replace(/\D/g, "")),
                "dt-eid": "sms_code_input",
                "dt-ename": "验证码输入框",
                "dt-params": d(s.login, {
                  input_status: J,
                  order_brand: a
                })
              }
            ),
            /* @__PURE__ */ r(
              "button",
              {
                type: "button",
                className: `${n.codeBtn} ${c && n.hightLight}`,
                disabled: z,
                onClick: K,
                "dt-eid": "get_sms_code_button",
                "dt-ename": "获取验证码",
                "dt-params": d(s.login, { login_method: v, order_brand: a }),
                children: X
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ i("footer", { className: n.footer, children: [
          /* @__PURE__ */ i("div", { className: n.allow, children: [
            /* @__PURE__ */ r("div", { className: n.iconContainer, children: /* @__PURE__ */ r(
              "img",
              {
                src: F,
                alt: "",
                onClick: () => {
                  j((t) => !t);
                },
                "dt-eid": "agreement_checkbox",
                "dt-ename": "隐私协议勾选框",
                "dt-params": d(s.login, { agreement_checked: g ? 1 : 0, order_brand: a })
              }
            ) }),
            /* @__PURE__ */ r(Pe, { userAgreementUrl: $, privacyAgreementUrl: B, brand: a })
          ] }),
          /* @__PURE__ */ i("div", { className: n.action, children: [
            /* @__PURE__ */ r("button", { type: "button", className: n.btnSecondary, onClick: W, children: "取消" }),
            /* @__PURE__ */ r(
              "button",
              {
                type: "button",
                className: n.btnPrimary,
                onClick: V,
                "dt-eid": "auth_login_button",
                "dt-ename": "授权登录按钮",
                "dt-params": d(s.login, {
                  agreement_checked: g ? 1 : 0,
                  login_method: v,
                  order_brand: a
                }),
                children: "登录"
              }
            )
          ] })
        ] })
      ]
    }
  );
};
function Oe(e) {
  e.preventDefault(), window.open(e.target.href, "_blank", "noopener,noreferrer");
}
function Pe(e) {
  const p = [
    { url: e.privacyAgreementUrl, name: "用户协议" },
    { url: e.userAgreementUrl, name: "隐私政策" }
  ];
  return /* @__PURE__ */ i("div", { className: n.policyLinkContainer, children: [
    /* @__PURE__ */ r("span", { className: `${n.policyLink} ${n.defaultText}`, children: "同意" }),
    p.map(({ url: h, name: y }, b) => /* @__PURE__ */ i(ie.Fragment, { children: [
      b > 0 && /* @__PURE__ */ r("span", { className: n.policyLink, children: "、" }),
      /* @__PURE__ */ i(
        "a",
        {
          className: n.policyLink,
          onClick: Oe,
          target: "_blank",
          rel: "noreferrer",
          href: h,
          "dt-eid": "setup_guide_policy_link",
          "dt-ename": "协议链接",
          "dt-params": d(s.login, { slot: b, order_brand: e.brand }),
          children: [
            "《",
            y,
            "》"
          ]
        }
      )
    ] }, h))
  ] });
}
const Ae = (e) => ne(e.sourceMetadata) ? /* @__PURE__ */ r(te, {}) : /* @__PURE__ */ r(Ee, { ...e });
export {
  Ae as default
};
