import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(import.meta.dirname, "../src/salebuddy/ui/toolbox-first.js"), "utf8");

test("toolbox keeps the native virtual list as the only scroll owner", () => {
  assert.match(source, /\.sb-toolbox-route\{height:100% !important;min-height:0 !important;overflow:hidden !important\}/);
  assert.match(source, /\.sb-toolbox-route \[class\*="_cardList_"\]\{height:auto !important;min-height:0 !important;overflow-y:auto !important;overflow-x:hidden !important;flex:1 1 auto !important\}/);
  assert.match(source, /\[class\*="_panel_"\]:has\(\.sb-toolbox-route\)\{overflow:hidden !important\}/);
  assert.match(source, /route\?\.classList\.add\("sb-toolbox-route"\)/);
});
