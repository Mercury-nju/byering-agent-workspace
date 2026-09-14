import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("daily report file UI preserves the canonical artifact id across conversation, results, and file center", async () => {
  const [contacts, files, center, results] = await Promise.all([
    source("src/salebuddy/ui/contacts-page.js"),
    source("src/salebuddy/agents/file-store.js"),
    source("src/salebuddy/ui/file-center.js"),
    source("src/salebuddy/ui/prospect-center.js")
  ]);

  assert.match(contacts, /openFileCenterPage\(\{ initialFileId: artifact\.id \|\| null, artifact \}\)/);
  assert.match(files, /const canonicalId = String\(id \|\| ""\)\.trim\(\) \|\| null/);
  assert.match(center, /fetchCanonicalArtifact\(initialFileId\)/);
  assert.match(center, /id: artifact\.id \|\| null/);
  assert.match(center, /mimeType: artifact\.mimeType \|\| null/);
  assert.match(center, /file\.type === "html"/);
  assert.match(center, /frame\.srcdoc = String\(content \|\| ""\)/);
  assert.match(results, /openFileCenter\(artifact\.id, artifact\)/);
});
