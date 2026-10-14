// npm test — bring the whole stack up from the current code, then run every suite.
//   npm test              API + browser suites
//   npm test -- api       one suite: api | workflows | guest | crawl
// WARNING: the suites reset the demo data (and create, then remove, test user accounts).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { docker, root, say, startStack } from "../scripts/stack.mjs";

const SUITES = {
  api: "tests/api.test.mjs",
  workflows: "tests/e2e/workflows.mjs",
  guest: "tests/e2e/guest.mjs",
  crawl: "tests/e2e/crawl.mjs",
};
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const unknown = wanted.filter((w) => !SUITES[w]);
if (unknown.length) {
  console.error(`Unknown suite: ${unknown.join(", ")}. Choose from: ${Object.keys(SUITES).join(", ")}.`);
  process.exit(2);
}
const run = wanted.length ? wanted : Object.keys(SUITES);

// Rebuild what changed so the browser suites test this code, not an older image.
await startStack([], { label: "Building and starting the stack for testing…" });

const results = [];
for (const name of run) {
  say(`Running ${name}…`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, SUITES[name])], { cwd: root, stdio: "inherit" });
  results.push({ name, ok: r.status === 0, secs: Math.round((Date.now() - t0) / 1000) });
}

// Test accounts are disabled at the end of each suite; remove them so they don't pile up.
docker(["compose", "exec", "-T", "db", "psql", "-U", "lisd", "-d", "lisd", "-qtAc", "delete from users where key ~ '^(t_|ui_)[0-9a-z]+$' and not active"]);

console.log("");
for (const r of results) console.log(`${r.ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✖\x1b[0m"} ${r.name.padEnd(10)} ${r.secs}s`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} suite(s) failed.` : "\nAll suites passed.");
process.exit(failed.length ? 1 : 0);
