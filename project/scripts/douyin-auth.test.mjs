import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/salebuddy/ui/douyin-auth.js", import.meta.url), "utf8");

test("cloud authorization releases the embedded viewer when the dialog closes", () => {
  assert.match(source, /const close = \(reason = "cancelled"\) => \{[\s\S]*?releaseCloudView\(\);/);
  assert.match(source, /iframe\.src = "about:blank";/);
});

test("cloud authorization supports reconnecting the viewer without recreating the session", () => {
  assert.match(source, /refreshCloudView/);
  assert.match(source, /重新连接画面/);
  assert.match(source, /const refreshedSession = typeof refreshed === "string"/);
  assert.match(source, /const nextUrl = embeddedViewerUrl\(refreshedSession\)/);
  assert.match(source, /iframe\.src = nextUrl;/);
});

test("cloud authorization never exposes a second viewer connection", () => {
  assert.doesNotMatch(source, /打开云电脑/);
  assert.doesNotMatch(source, /target = "_blank"/);
  assert.match(source, /保持在同一台云电脑内完成授权/);
});

test("Douyin authorization always uses the product-owned embedded viewer", () => {
  assert.match(source, /url\.searchParams\.set\("embedded", "1"\)/);
  assert.match(source, /function isDouyinSession\(session\)/);
  assert.match(source, /if \(isDouyinSession\(session\)\) return null/);
  assert.match(source, /let currentCloudViewUrl = embeddedViewerUrl\(session\)/);
  assert.match(source, /function sessionToolbarLabel\(session\)/);
  assert.match(source, /if \(isDouyinSession\(session\) \|\| localCloudViewerUrl\(session\)\) return "当前云电脑授权画面"/);
  assert.doesNotMatch(source, /const nextUrl = localCloudViewerUrl\(\{ \.\.\.session, \.\.\.refreshed \}\) \|\|/);
});

test("cloud authorization supports enlarging the embedded computer by double-click or an explicit control", () => {
  assert.match(source, /toggleCloudViewExpanded/);
  assert.match(source, /dblclick/);
  assert.match(source, /放大云电脑/);
  assert.match(source, /sb-dy-auth-cloudview\.is-expanded/);
});

test("closing or leaving the login step clears the enlarged viewer state", () => {
  assert.match(source, /setCloudViewExpanded\(false\);[\s\S]*?releaseCloudView\(\);/);
});
