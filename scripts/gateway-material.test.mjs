import assert from "node:assert/strict";
import test from "node:test";
import { buildPptx } from "./gateway-mock.mjs";

test("gateway converter produces an OOXML zip for PPT output", async () => {
  const body = await buildPptx({ title: "客户访谈", transcript: "关注交付周期", duration: 42 });
  assert.equal(Buffer.isBuffer(body), true);
  assert.equal(body.subarray(0, 2).toString(), "PK");
  assert.ok(body.length > 1000);
});
