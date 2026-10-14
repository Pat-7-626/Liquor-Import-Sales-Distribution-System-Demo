import { BASE, launchBrowser, out } from "../browser.mjs";

const b = await launchBrowser();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const results = [];
const check = (name, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? "  — " + d : ""}`);
};

await p.goto(BASE + "/");
await p.evaluate(async () => {
  localStorage.setItem("lisd-lang", "en");
  await fetch("/api/auth/logout", { method: "POST" });
});
await p.goto(BASE + "/");
await p.waitForSelector("text=Continue as guest");
await p.screenshot({ path: out("guest-login.png") });
await p.click("text=Continue as guest");
await p.waitForSelector("text=Executive Dashboard");
check("guest lands on the dashboard", true);
check("guest banner shown", await p.locator("text=You're browsing as a guest").isVisible());
check("header offers Sign in, no user switcher", (await p.locator("header button:has-text('Sign in')").count()) === 1 && (await p.locator("header select").count()) === 0);
check("no Reset demo data for guests", (await p.locator("text=Reset demo data").count()) === 0);
await p.screenshot({ path: out("guest-dashboard.png") });

await p.goto(BASE + "/products");
await p.waitForLoadState("networkidle");
check("create/edit buttons disabled", await p.locator("main button:has-text('New product')").isDisabled());
check("cost prices masked", (await p.locator("main table").innerText()).includes("••••••"));
await p.goto(BASE + "/sales-orders/SO-2026-3303");
await p.waitForLoadState("networkidle");
check("delivery status picker disabled", await p.locator("main select").first().isDisabled());

await p.click("header button:has-text('Sign in')");
await p.waitForSelector("input[type=password]");
check("Sign in returns to the sign-in page", true);
check("no page errors", errors.length === 0, errors.join(" | "));
await b.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
