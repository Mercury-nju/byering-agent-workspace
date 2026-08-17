import assert from "node:assert/strict";
import test from "node:test";

import { BUSINESS_PROMPT_CATALOG, resolveBusinessPrompt } from "../src/salebuddy/business/prompt-catalog.js";

test("each business prompt has an explicit object, evidence boundary and delivery", () => {
  assert.equal(BUSINESS_PROMPT_CATALOG.length, 5);
  for (const prompt of BUSINESS_PROMPT_CATALOG) {
    for (const field of ["label", "decompose", "objective", "scope", "deliverable", "guardrail", "summary", "progress", "defaultReply"]) {
      assert.equal(typeof prompt[field], "string", `${prompt.id}.${field} should be a string`);
      assert.ok(prompt[field].length > (field === "label" ? 2 : 12), `${prompt.id}.${field} should be specific`);
    }
    assert.equal(prompt.assignments.length, 4);
    assert.equal(prompt.logs.length, 4);
  }
});

test("real business phrases resolve to the matching operating context", () => {
  assert.equal(resolveBusinessPrompt("筛选候选人并安排面试").id, "recruiting");
  assert.equal(resolveBusinessPrompt("整理续费风险客户的健康度").id, "customer_success");
  assert.equal(resolveBusinessPrompt("安排试听并跟进报名").id, "education");
  assert.equal(resolveBusinessPrompt("补齐咨询项目报价和交付周期").id, "professional_services");
  assert.equal(resolveBusinessPrompt("核验买车线索并安排到店").id, "sales_pipeline");
});
