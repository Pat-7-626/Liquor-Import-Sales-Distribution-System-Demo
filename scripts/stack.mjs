// Shared by `npm run dev` and `npm test`: make sure Docker is running and the stack is up.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const apiPort = process.env.API_PORT ?? readEnv("API_PORT") ?? "3000";
export const apiUrl = `http://localhost:${apiPort}`;
export const say = (msg) => console.log(`\x1b[36m[dev]\x1b[0m ${msg}`);
export const fail = (msg) => {
  console.error(`\x1b[31m[dev]\x1b[0m ${msg}`);
  process.exit(1);
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnv(key) {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() || undefined : undefined;
}

export async function apiHealthy() {
  try {
    const r = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export const docker = (args, opts = {}) => spawnSync("docker", args, { cwd: root, stdio: "pipe", encoding: "utf8", ...opts });

/** First run: a .env with fresh random secrets, so nobody runs on the example placeholders. */
export function ensureEnvFile() {
  const file = path.join(root, ".env");
  if (existsSync(file)) return;
  const example = readFileSync(path.join(root, ".env.example"), "utf8");
  const env = example
    .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${randomBytes(18).toString("hex")}`)
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(32).toString("hex")}`);
  writeFileSync(file, env);
  say("Created .env with new random secrets.");
}

/** Docker Desktop may be closed: start it (Windows/macOS) and wait for the engine. */
export async function ensureDockerEngine() {
  if (docker(["version"]).error) fail("Docker isn't installed. Install Docker Desktop, then run `npm run dev` again.");
  if (docker(["info"]).status === 0) return;

  const candidates =
    process.platform === "win32"
      ? [path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe")]
      : process.platform === "darwin"
        ? ["/Applications/Docker.app"]
        : [];
  const app = candidates.find((c) => existsSync(c));
  if (!app) fail("Docker isn't running. Start Docker, then run `npm run dev` again.");

  say("Starting Docker Desktop…");
  if (process.platform === "darwin") spawn("open", ["-a", app], { detached: true, stdio: "ignore" }).unref();
  else spawn(app, [], { detached: true, stdio: "ignore" }).unref();

  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    if (docker(["info"]).status === 0) return say("Docker is ready.");
  }
  fail("Docker Desktop didn't become ready within 3 minutes. Open it, wait for it to finish starting, then run `npm run dev` again.");
}

/** Starts (and, with build, rebuilds when code changed) the given services and waits until healthy. */
export async function startStack(services, { label } = {}) {
  ensureEnvFile();
  await ensureDockerEngine();
  say(label ?? "Starting the stack (the first run builds images — a minute or two)…");
  const up = docker(["compose", "up", "-d", "--build", "--wait", ...services], { stdio: "inherit" });
  if (up.status !== 0) fail("`docker compose up` failed — see the messages above.");
  for (let i = 0; i < 30 && !(await apiHealthy()); i++) await sleep(1000);
  if (!(await apiHealthy())) fail(`The API didn't answer at ${apiUrl}. Check \`docker compose logs api\`.`);
}
