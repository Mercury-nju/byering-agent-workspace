import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { actions: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") args.output = argv[++index];
    else if (value === "--actions") args.actions = argv[++index].split(",").filter(Boolean);
    else if (value === "--source") args.source = argv[++index];
    else if (value === "--legacy") args.legacy = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.output) throw new Error("--output is required");
  if (!args.actions.length) throw new Error("--actions requires at least one action");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(SCRIPT_DIR, "..");
const output = path.resolve(args.output);
const source = path.resolve(args.source || path.join(projectRoot, "workbench", "byering", "pilot", "frames", "normalized"));
const legacy = path.resolve(args.legacy || path.join(projectRoot, "workbench", "assets", "spritesheet", "agent"));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "byering-atlas-"));
const specPath = path.join(tempRoot, "spec.json");

mkdirSync(output, { recursive: true });
writeFileSync(specPath, JSON.stringify({ output, source, legacy, actions: args.actions }));

try {
  execFileSync("python3", [path.join(SCRIPT_DIR, "office-ip-atlas.py"), specPath], { stdio: "inherit" });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
