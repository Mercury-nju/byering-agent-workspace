import assert from "node:assert/strict";
import test from "node:test";
import { createShareStore } from "../src/salebuddy/agents/share-store.js";

function storage() { const map = new Map(); return { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value) }; }

test("share records carry permission and expiry and produce token URLs", () => {
  const store = createShareStore({ storage: storage(), origin: "https://example.test" });
  const share = store.create({ materialId: "m1", title: "访谈", ownerId: "u1", permission: "commenter", expiresInMs: 60000 });
  assert.match(share.url, /\/share\/[a-z0-9]+$/);
  assert.equal(store.canAccess(share.token, { userId: "u2", required: "viewer" }), true);
  assert.equal(store.canAccess(share.token, { userId: "u2", required: "editor" }), false);
  assert.equal(store.canAccess(share.token, { userId: "u1", required: "editor" }), true);
});

test("expired share links are denied", () => {
  const store = createShareStore({ storage: storage() });
  const share = store.create({ materialId: "m2", expiresInMs: 0 });
  assert.equal(store.getByToken(share.token).expired, true);
  assert.equal(store.canAccess(share.token), false);
});
