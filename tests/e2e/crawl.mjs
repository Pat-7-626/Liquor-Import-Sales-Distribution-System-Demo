import { BASE, launchBrowser, out } from "../browser.mjs";

const ROUTES = [
  "", "approvals", "reports", "audit-trail",
  "overview/sales", "sales-orders", "sales-orders/new", "sales-orders/SO-2026-3301", "receipts", "ar-aging", "customers", "customers/CUS-0001", "price-lists",
  "overview/purchasing", "import-orders", "import-orders/new", "import-orders/IMP-2026-0142", "import-orders/IMP-2026-0144", "goods-receipts", "suppliers", "licenses",
  "overview/inventory", "inventory", "stock-movements", "stock-alerts", "lot-trace?lot=LOT-A2607-01", "products", "warehouses", "reorder-policies",
  "overview/tax", "tax-rates", "company", "users", "calendar", "payables", "exchange-rates", "accounting", "accounting/journal", "accounting/trial-balance", "accounting/profit-loss", "accounting/balance-sheet", "tax/vat-return",
  "quotations", "purchase-requests", "expenses", "tax/withholding", "accounting/manual-journals", "accounting/closing", "accounting/bank", "stock-counts",
];
const ROLES = ["somchai", "manager", "whOfficer", "salesOfficer", "docOfficer"];
const problems = new Map();
const note = (msg) => problems.set(msg, (problems.get(msg) ?? 0) + 1);

const browser = await launchBrowser();
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  let where = "";
  page.on("console", (m) => {
    if (/Failed to load resource: the server responded with a status of (401|422)/.test(m.text())) return;
    if (m.type() === "error" || m.text().includes("Missing translation")) note(`${m.text().slice(0, 160)}  @ ${where}`);
  });
  page.on("pageerror", (e) => note(`pageerror ${e.message} @ ${where}`));
  await page.goto(BASE + "/");
  await page.evaluate(async () => {
    localStorage.clear();
    await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "somchai", password: "demo1234" }) });
  });
  for (const lang of ["en", "th"]) {
    for (const role of ROLES) {
      await page.evaluate(async ([l, r]) => {
        localStorage.setItem("lisd-lang", l);
        await fetch("/api/auth/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: r }) });
      }, [lang, role]);
      for (const r of ROUTES) {
        where = `/${r} ${lang} ${role} ${width}`;
        await page.goto(`${BASE}/${r}`);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) note(`horizontal page scroll (${overflow}px) on /${r} @ ${width}`);
        // Visible text that literally reads like a translation key = a missing label.
        const keyish = await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((el) => el.children.length === 0 && /^(erp|viz|nav|common|status|lookup|dashboard|ar|tax|company|salesOrders|newSalesOrder|salesOrderDetail|users|roles|perm|password|flow|views|calendar|ap|fx|gl|vat|returns|csv|notify)\.[a-zA-Z.]+$/.test(el.textContent?.trim() ?? ""))
            .map((el) => el.textContent.trim()),
        );
        for (const k of keyish) note(`raw key "${k}" on /${r}`);
      }
    }
  }
  await page.close();
}
await browser.close();
if (problems.size === 0) console.log("crawl: clean");
else for (const [k, v] of problems) console.log(`${v}× ${k}`);
process.exit(problems.size === 0 ? 0 : 1);
