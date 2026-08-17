import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialArtifact, materialMime } from "../src/salebuddy/materials/material-generator.js";

test("material adapters generate real html, pdf and infographic documents", () => {
  const input = { title: "客户访谈", transcript: "客户关心交付周期", duration: 42 };
  const html = buildMaterialArtifact({ formatId: "html", ...input });
  assert.equal(html.ready, true);
  assert.match(html.body, /^<!doctype html>/);
  const pdf = buildMaterialArtifact({ formatId: "pdf", ...input });
  assert.equal(new TextDecoder().decode(pdf.body).slice(0, 8), "%PDF-1.4");
  const infographic = buildMaterialArtifact({ formatId: "infographic", ...input });
  assert.match(infographic.body, /^<svg /);
  assert.equal(materialMime("pdf"), "application/pdf");
});

test("ppt output is blocked until an OOXML converter is configured", () => {
  const artifact = buildMaterialArtifact({ formatId: "ppt", title: "访谈" });
  assert.equal(artifact.ready, false);
  assert.equal(artifact.code, "ppt_converter_not_configured");
});
