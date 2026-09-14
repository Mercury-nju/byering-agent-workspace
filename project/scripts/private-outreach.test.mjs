import test from "node:test";
import assert from "node:assert/strict";
import { extractDouyinProfileUrls, mergePrivateOutreachUrls } from "../src/salebuddy/ui/private-outreach.js";

test("extracts and deduplicates Douyin profile URLs from pasted text", () => {
  const first = "https://www.douyin.com/user/abc?from_tab_name=main";
  const second = "https://www.douyin.com/user/def";
  assert.deepEqual(extractDouyinProfileUrls(`${first}\n${second}\n${first}`), [first, second]);
});

test("ignores non-profile links and preserves query parameters", () => {
  assert.deepEqual(extractDouyinProfileUrls("https://www.douyin.com/video/123 https://example.com/user/abc"), []);
  assert.deepEqual(extractDouyinProfileUrls("https://www.douyin.com/user/abc?from_tab_name=main"), ["https://www.douyin.com/user/abc?from_tab_name=main"]);
});

test("merges pasted and uploaded URL groups without duplicates", () => {
  assert.deepEqual(mergePrivateOutreachUrls(
    "https://www.douyin.com/user/abc",
    ["https://www.douyin.com/user/def", "https://www.douyin.com/user/abc"]
  ), ["https://www.douyin.com/user/abc", "https://www.douyin.com/user/def"]);
});
