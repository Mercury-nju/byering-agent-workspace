import { p as s, h as a } from "./report-BkiHygWt.js";
const n = a("UserLoginApi");
class c {
  async sendSmsCode(r) {
    return await s("/v3/marvis_commerce_send_sms_code", r).then(
      (e) => e,
      (e) => (n.error("[sendSmsCode] {0!e}", e), {})
    );
  }
  async login(r) {
    return await s("/v3/marvis_commerce_order_login", r).then(
      (e) => e,
      (e) => (n.error("[login] {0!e}", e), {})
    );
  }
  async checkLogin() {
    return await s("/v3/marvis_commerce_check_login_status", {}).then(
      (t) => t,
      (t) => (n.error("[checkLogin] {0!e}", t), {})
    );
  }
  /** 返回用户登录态及资料 */
  async getAuthProfile(r) {
    return await s("/v3/marvis_commerce_get_auth_profile", { brand: r }).then(
      (e) => e,
      (e) => (n.error("[getAuthProfile] {0!e}", e), {})
    );
  }
}
const h = new c();
export {
  h as u
};
