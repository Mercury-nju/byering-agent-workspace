import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pagesSource = fs.readFileSync(new URL("../src/salebuddy/ui/pages.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../src/salebuddy/index.js", import.meta.url), "utf8");

test("custom pages keep the native main surface hidden while they own the route", () => {
  assert.ok(indexHtml.includes(
    'html[data-byering-guard="pending"] #route_inner_content_id > [class*="_layoutContainer_"] > [class*="_mainContent_"]{display:none!important}'
  ));
  assert.ok(indexHtml.includes(
    'html[data-byering-guard="pending"] #route_inner_content_id [class*="_rightPanel_"]{display:none!important}'
  ));
  assert.match(pagesSource, /html\[data-sb-custom-page-active="1"\][^}]*_mainContent_/);
  assert.match(pagesSource, /html\[data-sb-custom-page-active="1"\] #route_inner_content_id \[class\*="_rightPanel_"\]/);
  assert.match(pagesSource, /dataset\.sbCustomPageActive = "1"/);
  assert.match(pagesSource, /delete document\.documentElement\.dataset\.sbCustomPageActive/);
});

test("legacy homepage integrations are no longer mounted", () => {
  assert.doesNotMatch(appSource, /mountTaskRunner/);
  assert.doesNotMatch(appSource, /mountHomeSalesFeed/);
  assert.doesNotMatch(appSource, /taskRunnerReady/);
  assert.doesNotMatch(appSource, /homeSalesFeedReady/);
});

test("the default and custom routes hide the native homepage before app mount", () => {
  assert.match(indexHtml, /byeringPage===null/);
  assert.match(indexHtml, /data-byering-custom-page/);
  assert.ok(indexHtml.includes(
    'html[data-byering-custom-page="1"] #route_inner_content_id > [class*="_layoutContainer_"] > [class*="_mainContent_"]{display:none!important}'
  ));
  assert.ok(indexHtml.includes(
    'html[data-byering-custom-page="1"] #route_inner_content_id [class*="_rightPanel_"]{display:none!important}'
  ));
});
