// Two-step sign-in required for a role (REQUIRE_TWO_FACTOR_ROLES). Restarts the API with the setting on
// for Distribution Officers, checks the API and the forced set-up screen, then restarts it as it was.
import { createHmac } from "node:crypto";
import { apiHealthy, docker, sleep } from "../../scripts/stack.mjs";
import { BASE, launchBrowser } from "../browser.mjs";

const results = [];
const check = (name, cond, detail = "") => {
  results.push(Boolean(cond));
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const restartApi = async (roles) => {
  const r = docker(["compose", "up", "-d", "--wait", "api"], { env: { ...process.env, REQUIRE_TWO_FACTOR_ROLES: roles } });
  if (r.status !== 0) throw new Error(`restarting the API failed: ${r.stderr}`);
  for (let i = 0; i < 60 && !(await apiHealthy()); i++) await sleep(500);
};

const totp = (secret, at) => {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const key = [];
  for (const ch of secret.replace(/\s/g, "")) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      key.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const o = mac[19] & 15;
  return String((((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1_000_000).padStart(6, "0");
};

async function session(key, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { status: r.status, cookie, call };
}

/** A new Distribution Officer who has already chosen their own password. */
async function newOfficer(mgr, suffix) {
  const key = `t_${Date.now().toString(36)}${suffix}`;
  await mgr.call("POST", "/api/admin/users", { key, role: "distributionOfficer", name: { th: "ทดสอบบังคับ", en: "Required Test" }, password: "TempPass123" });
  const tmp = await session(key, "TempPass123");
  await tmp.call("POST", "/api/auth/password", { current: "TempPass123", next: "MyOwnPass99" });
  return key;
}

await restartApi("distributionOfficer");
const made = [];
let mgr;
try {
  mgr = await session("manager", "demo1234");

  // ── API ──
  const key = await newOfficer(mgr, "rq");
  made.push(key);
  const me = await session(key, "MyOwnPass99");
  const who = (await me.call("GET", "/api/auth/me")).json?.user;
  check("a required role is told to set it up", who?.twoFactorSetupRequired === true && who.twoFactorRequired === true);
  const blocked = await me.call("GET", "/api/state");
  check("…and nothing else works until it's done", blocked.status === 403 && blocked.json?.twoFactorSetupRequired === true);
  const others = (await mgr.call("GET", "/api/auth/me")).json?.user;
  check("roles not listed aren't affected", others?.twoFactorSetupRequired === false && others.twoFactorRequired === false && (await mgr.call("GET", "/api/state")).status === 200);
  const setup = await me.call("POST", "/api/auth/2fa/setup");
  check("setting it up is allowed meanwhile", setup.status === 200 && Boolean(setup.json?.secret));
  check("the code turns it on", (await me.call("POST", "/api/auth/2fa/enable", { code: totp(setup.json.secret, Date.now()) })).status === 200);
  check("…then the app works", (await me.call("GET", "/api/state")).status === 200);
  check("a required role can't turn it off", (await me.call("POST", "/api/auth/2fa/disable", { password: "MyOwnPass99" })).status === 422);
  await mgr.call("POST", `/api/admin/users/${key}/2fa/reset`);
  const again = await session(key, "MyOwnPass99");
  check("after a manager's reset, set-up is required again at sign-in", (await again.call("GET", "/api/auth/me")).json?.user.twoFactorSetupRequired === true && (await again.call("GET", "/api/state")).status === 403);

  // ── the screen ──
  const ukey = await newOfficer(mgr, "rs");
  made.push(ukey);
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of (401|403|422)/.test(m.text()) && problems.push(m.text()));
  await page.goto(BASE);
  await page.evaluate(async (k) => {
    localStorage.setItem("lisd-lang", "en");
    await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k, password: "MyOwnPass99" }) });
  }, ukey);
  await page.goto(BASE + "/");
  await page.waitForSelector("[data-testid=totp-secret]", { timeout: 10000 }).catch(() => {});
  check("signing in shows the set-up screen, not the app", (await page.locator("text=Set up two-step sign-in").count()) >= 1 && (await page.locator("nav").count()) === 0);
  const secret = (await page.locator("[data-testid=totp-secret]").innerText()).replace(/\s/g, "");
  await page.fill("[data-testid=totp-code]", totp(secret, Date.now()));
  await page.click("[data-testid=totp-enable]");
  await page.waitForSelector("nav", { timeout: 10000 }).catch(() => {});
  check("…and once it's set up, the app opens", (await page.locator("nav").count()) > 0);
  await page.click("[data-testid=change-password]");
  await page.click("[data-testid=account-tab-twoFactor]");
  check("My account says it can't be turned off", (await page.locator("text=Your role must use two-step sign-in").count()) === 1 && (await page.locator("[data-testid=totp-disable]").count()) === 0);
  check("no page errors", problems.length === 0, problems.slice(0, 2).join(" | "));
  await browser.close();
} finally {
  for (const k of made) await mgr?.call("PATCH", `/api/admin/users/${k}`, { active: false });
  await restartApi("");
}
const ok = (await (await fetch(`${BASE}/api/auth/me`)).status) === 401;
check("the API is back to normal afterwards", ok);
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
