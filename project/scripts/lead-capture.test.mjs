import test from "node:test";
import assert from "node:assert/strict";
import { detectsLeadCapture, extractLeadContact } from "../src/salebuddy/agents/lead-capture.js";

test("extracts phone, email, and WeChat contact signals", () => {
  assert.deepEqual(extractLeadContact("电话 13812345678，邮箱 hello@example.com，微信号 wxid_demo123456"), {
    phone: "13812345678",
    email: "hello@example.com",
    wechat: "wxid_demo123456",
    source: "私信"
  });
  assert.equal(detectsLeadCapture("可以加微信吗？"), false);
  assert.equal(detectsLeadCapture("我的微信是 wxid_demo123456"), true);
});
