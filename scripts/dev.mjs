// `npm run dev`: get the API and database running in Docker, then start Vite with hot reload.
// Safe to run repeatedly — anything already up is left as it is.
import { spawn } from "node:child_process";
import path from "node:path";
import { apiHealthy, apiUrl, root, say, startStack } from "./stack.mjs";

async function main() {
  if (await apiHealthy()) {
    say(`API already running at ${apiUrl}.`);
  } else {
    // --build reuses Docker's cache, so it's quick when the server code hasn't changed.
    await startStack(["db", "api"], { label: "Starting the database and API (the first run builds the API image — a minute or two)…" });
    say(`API ready at ${apiUrl}.`);
  }

  say("Starting Vite — open the Local URL below. Ctrl+C stops Vite; Docker keeps running (`npm run stop` to stop it).");
  const vite = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_API_PROXY: process.env.VITE_API_PROXY ?? apiUrl },
  });
  vite.on("exit", (code) => process.exit(code ?? 0));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => vite.kill(sig));
}

main();
