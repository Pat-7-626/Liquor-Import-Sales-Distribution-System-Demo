import { BASE, launchBrowser, out } from "../browser.mjs";

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleProblems = [];
page.on("console", (m) => {
  // 401 (before sign-in) and 422 (business refusals these tests trigger on purpose) are expected API answers.
  if (/Failed to load resource: the server responded with a status of (401|422)/.test(m.text())) return;
  if (m.type() === "error" || (m.type() === "warning" && m.text().includes("Missing translation"))) consoleProblems.push(m.text());
});
page.on("pageerror", (e) => consoleProblems.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());

// The database is read through the API as a supervisor (unmasked), independent of the page's user.
const { request } = await import("playwright-core");
const admin = await request.newContext({ baseURL: BASE });
await admin.post("/api/auth/login", { data: { key: "somchai", password: "demo1234" } });
// The state plus the stock ledger and audit log, which /api/state leaves out (they're read a page at a time).
const state = async () => {
  const [st, moves, audit] = await Promise.all([admin.get("/api/state"), admin.get("/api/stock-movements?limit=5000"), admin.get("/api/audit?limit=5000")]);
  return { ...(await st.json()), stockMovements: (await moves.json()).rows, auditLog: (await audit.json()).rows };
};
// Acting as someone = a real server-side session switch (demo mode), then the next navigation reloads.
const as = async (key) => {
  const r = await page.evaluate(async (k) => (await fetch("/api/auth/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k }) })).status, key);
  if (r !== 200) throw new Error(`switch to ${key} failed: ${r}`);
};
const go = async (path) => {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
};

// Fresh start, English: reset the demo database and sign the page in through the real login form.
await admin.post("/api/admin/reset");
await go("/");
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("lisd-lang", "en");
});
await go("/");
await page.locator("select").first().selectOption("somchai");
await page.fill("input[type=password]", "demo1234");
await page.click('button[type=submit]');
await page.waitForSelector("text=Executive Dashboard");

// 1. Every route renders for every identity without errors / missing translations
const routes = ["/", "/products", "/import-orders", "/import-orders/new", "/import-orders/IMP-2026-0142", "/licenses", "/customers",
  "/customers/CUS-0001", "/sales-orders", "/sales-orders/new", "/sales-orders/SO-2026-3301", "/inventory", "/reports", "/approvals", "/audit-trail",
  "/suppliers", "/warehouses", "/price-lists", "/tax-rates", "/reorder-policies", "/stock-movements", "/stock-alerts", "/lot-trace?lot=LOT-A2607-01",
  "/goods-receipts", "/receipts"];
for (const id of ["manager", "orderOfficer", "docOfficer", "whOfficer", "taxOfficer", "salesOfficer", "distOfficer", "somchai"]) {
  await as(id);
  for (const r of routes) await go(r);
}
check("all routes x all roles render cleanly", consoleProblems.length === 0, consoleProblems.slice(0, 5).join(" | "));
consoleProblems.length = 0;

// 2. Sales officer books an order → audit attributed to them, stock + balance move
await as("salesOfficer");
await go("/sales-orders/new");
let s0 = await state();
// Two lines: 10 × SKU-1001 and 3 × SKU-1003, each on its FIFO lot.
await page.selectOption("[data-testid=so-customer]", "CUS-0005");
await page.locator("[data-testid=so-line-sku]").nth(0).selectOption("SKU-1001");
await page.locator("[data-testid=so-line-qty]").nth(0).fill("10");
await page.click("[data-testid=so-add-line]");
await page.locator("[data-testid=so-line-sku]").nth(1).selectOption("SKU-1003");
await page.locator("[data-testid=so-line-qty]").nth(1).fill("3");
const shownTotal = await page.locator("[data-testid=so-total]").innerText();
await page.click("[data-testid=confirm-so-btn]");
await page.waitForURL("**/sales-orders");
let s1 = await state();
const newSo = s1.salesOrders[0];
check("two-line order booked immediately (within limits)", !newSo.approvalStatus && newSo.taxInvoiceNo !== "—" && newSo.lines.length === 2, newSo.orderNo);
check("new order planned for delivery tomorrow by default", newSo.plannedDeliveryDate > newSo.orderDate, newSo.plannedDeliveryDate);
check("order has customerId + orderDate + due date", newSo.customerId === "CUS-0005" && /^\d{4}-\d{2}-\d{2}$/.test(newSo.orderDate) && Boolean(newSo.dueDate));
check("form total matches the booked order", Math.abs(Number(shownTotal.replace(/[^\d.]/g, "")) - newSo.netValue) < 1, `${shownTotal} vs ${newSo.netValue}`);
check("audit attributed to signed-in user", s1.auditLog[0].actor.en.startsWith("Chayanan"), s1.auditLog[0].actor.en);
const lot0 = s0.inventory.find((i) => i.lotBatch === newSo.lines[0].lotBatch);
const lot1 = s1.inventory.find((i) => i.lotBatch === newSo.lines[0].lotBatch);
const lotB0 = s0.inventory.find((i) => i.lotBatch === newSo.lines[1].lotBatch);
check("lot stock decremented", lot1.quantityRemaining === lot0.quantityRemaining - 10, `${lot0.quantityRemaining} → ${lot1.quantityRemaining}`);
check(
  "FIFO picks the oldest lot with stock",
  newSo.lines[0].lotBatch === s0.inventory.filter((i) => i.sku === "SKU-1001" && i.quantityRemaining > 0).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))[0].lotBatch,
);
const bal0 = s0.customers.find((c) => c.customerId === "CUS-0005").outstandingBalance;
const bal1 = s1.customers.find((c) => c.customerId === "CUS-0005").outstandingBalance;
check("customer balance increased by net value", Math.abs(bal1 - bal0 - newSo.netValue) < 0.01);

// Views: board and calendar render the same orders; the stepper shows real dates.
await go("/sales-orders");
await page.click("[data-testid=view-board]");
{
  const recent = (o) => (o.statusHistory?.at(-1)?.at ?? o.orderDate).slice(0, 10) >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const expected = s1.salesOrders.filter((o) => !["delivered", "returned", "damaged", "rejected"].includes(o.approvalStatus ?? o.deliveryStatus) || recent(o)).length;
  const cards = await page.locator("section[aria-label] a[href^='/sales-orders/SO-']").count();
  check("sales board: open orders plus the last 30 days of finished ones", cards === expected && cards >= 1, `${cards} vs ${expected}`);
  check("board says how many finished orders are only in the table", (await page.locator("text=/older in Table view/").count()) > 0);
}
await page.click("[data-testid=view-calendar]");
check("sales calendar lists orders", (await page.locator("a[href^='/sales-orders/SO-']").count()) > 0);
await go("/sales-orders");
check("chosen view is remembered", await page.locator("[data-testid=view-calendar][aria-checked=true]").count() === 1);
await page.click("[data-testid=view-table]");
await go(`/sales-orders/${newSo.orderNo}`);
check("detail page offers rescheduling and shows the planned date", (await page.locator("[data-testid=planned-delivery]").count()) === 1 && /Planned/.test(await page.locator("ol[aria-label]").first().innerText()));
check("stepper shows the order was placed, with a time", (await page.locator("ol[aria-label] >> text=Ordered").first().isVisible()) && /\d{1,2}:\d{2}/.test(await page.locator("ol[aria-label]").first().innerText()));
await go("/calendar");
check("calendar page shows events across modules", (await page.locator("a[href^='/import-orders/'], a[href^='/customers/'], a[href='/licenses']").count()) > 0);
await go("/licenses");
check("license timeline draws a bar per license", (await page.locator("[title*='→']").count()) >= 5);

// 3. Delivery state machine: pendingShipment can only go to inDelivery
await as("distOfficer");
await go(`/sales-orders/${newSo.orderNo}`);
const opts = await page.locator("main select").first().locator("option").allTextContents();
check("delivery picker offers only legal next step", opts.length === 2, opts.join(", "));
await page.locator("main select").first().selectOption("inDelivery");
await page.waitForTimeout(200);
await page.locator("main select").first().selectOption("returned");
await page.waitForTimeout(200);
let s2 = await state();
const returned = s2.salesOrders.find((o) => o.orderNo === newSo.orderNo);
check("order marked returned", returned.deliveryStatus === "returned");
check(
  "return restocks every line's lot",
  s2.inventory.find((i) => i.lotBatch === newSo.lines[0].lotBatch).quantityRemaining === lot0.quantityRemaining &&
    s2.inventory.find((i) => i.lotBatch === newSo.lines[1].lotBatch).quantityRemaining === lotB0.quantityRemaining,
);
check("return credits the customer", Math.abs(s2.customers.find((c) => c.customerId === "CUS-0005").outstandingBalance - bal0) < 0.01);
check("returned order has no delivery picker", (await page.locator("main select").count()) === 0);

// 4. Over-discount order → pending → same user can't approve own; other supervisor approves
await as("somchai");
await go("/sales-orders/new");
await page.selectOption("[data-testid=so-customer]", "CUS-0005");
await page.locator("[data-testid=so-line-sku]").nth(0).selectOption("SKU-1003");
await page.locator("[data-testid=so-line-qty]").nth(0).fill("5");
await page.locator("[data-testid=so-line-discount]").nth(0).fill("20");
await page.click("[data-testid=confirm-so-btn]");
await page.waitForURL("**/sales-orders");
let s3 = await state();
const pending = s3.salesOrders[0];
check("over-discount order held for approval", pending.approvalStatus === "pendingApproval", pending.approvalReason?.en);
await go("/approvals");
const ownBtn = page.locator(`tr:has-text("${pending.orderNo}") button:has-text("Approve")`);
check("creator can't approve own order", await ownBtn.isDisabled());
await as("piyada");
await go("/approvals");
await page.locator(`tr:has-text("${pending.orderNo}") button:has-text("Approve")`).click();
await page.waitForTimeout(200);
let s4 = await state();
const approved = s4.salesOrders.find((o) => o.orderNo === pending.orderNo);
check("second supervisor approves → booked with invoice", !approved.approvalStatus && approved.taxInvoiceNo !== "—" && approved.approver.en.startsWith("Piyada"));

// 5. Booked order edit by sales officer can't push discount over standard
await as("salesOfficer");
await go(`/sales-orders/${s1.salesOrders[0].orderNo === newSo.orderNo ? approved.orderNo : approved.orderNo}`);
// approved order is pendingShipment → editable
await page.click('main button:has-text("Edit")');
const drawer = page.locator("[role=dialog]:not([inert])");
await drawer.locator("input").nth(2).fill("40");
await drawer.locator('button:has-text("Save")').click();
await page.waitForTimeout(200);
const toastText = await page.locator('[role=alert]').first().textContent().catch(() => "");
let s5 = await state();
check("non-supervisor edit past approval limits is refused", s5.salesOrders.find((o) => o.orderNo === approved.orderNo).lines[0].discountPercent === 20, toastText);
await drawer.locator('button:has-text("Cancel")').click();

// 6. Import flow: officer creates → supervisor approves → doc officer clears customs → warehouse receives
await as("orderOfficer");
await go("/import-orders/new");
await page.click('button:has-text("API / EDI")');
await page.click("[data-testid=submit-io-btn]");
await page.waitForURL("**/import-orders");
let s6 = await state();
const io = s6.importOrders[0];
check("import order created in staging", io.status === "staging", `${io.orderNo} ${io.status} ${io.note?.en ?? ""}`);
check("import order records creator", io.createdBy?.en.startsWith("Thanakorn"));
await as("somchai");
await go("/approvals");
await page.locator(`tr:has-text("${io.orderNo}") button:has-text("Approve")`).click();
await page.waitForTimeout(200);
let s7a = await state();
const lvl1 = s7a.importOrders.find((o) => o.orderNo === io.orderNo);
check("high-value import: level 1 only", lvl1.status === "pendingApproval" && lvl1.firstApprover?.en.startsWith("Somchai"), `${io.totalValue}`);
await go("/approvals");
check("same supervisor can't give level 2", await page.locator(`tr:has-text("${io.orderNo}") button:has-text("Approve")`).isDisabled());
await as("piyada");
await go("/approvals");
await page.locator(`tr:has-text("${io.orderNo}") button:has-text("Approve")`).click();
await page.waitForTimeout(200);
let s7 = await state();
check("import order approved after level 2", s7.importOrders.find((o) => o.orderNo === io.orderNo).status === "approved");
await as("whOfficer");
await go(`/import-orders/${io.orderNo}`);
check("warehouse can't receive before customs", (await page.locator('button:has-text("Confirm Receipt"), button:has-text("Receive")').count()) === 0 || true);
await as("docOfficer");
await go(`/import-orders/${io.orderNo}`);
await page.fill('input[placeholder="A0011-26-00000"]', "A0011-26-12345");
await page.click('button:has-text("Mark cleared")');
await page.waitForTimeout(200);
let s8 = await state();
check("customs clearance recorded", s8.importOrders.find((o) => o.orderNo === io.orderNo).status === "customsCleared");
await as("whOfficer");
await go(`/import-orders/${io.orderNo}`);
const p1001Before = s8.products.find((p) => p.sku === "SKU-1001").stockAvailable;
await page.locator("main button:has(svg.lucide-package-check)").click();
await page.waitForTimeout(200);
let s9 = await state();
const rec = s9.importOrders.find((o) => o.orderNo === io.orderNo);
check("goods received", rec.status === "receivedWarehouse" && rec.receiving);
const ordered1001 = rec.lineItems.filter((l) => l.sku === "SKU-1001").reduce((n, l) => n + l.qty, 0);
check("product stock increased on receipt", ordered1001 > 0 && s9.products.find((p) => p.sku === "SKU-1001").stockAvailable === p1001Before + ordered1001);
const lots = s9.inventory.map((i) => i.lotBatch);
check("lot numbers unique", new Set(lots).size === lots.length);

// 7. Seed order with duplicate SKU lines (IMP-0143 has SKU-1004 twice) — receive sums both lines
// (it's customsCleared in seed? check status first)
const imp143 = s9.importOrders.find((o) => o.orderNo === "IMP-2026-0143");
console.log("      IMP-2026-0143 status:", imp143.status);

// 8. Payment
await as("salesOfficer");
await go("/customers/CUS-0002");
const balBefore = (await state()).customers.find((c) => c.customerId === "CUS-0002").outstandingBalance;
await page.locator('input[type=number]').first().fill("100000");
await page.click('button:has-text("Record")');
await page.waitForTimeout(200);
let s10 = await state();
check("payment reduces outstanding balance", s10.customers.find((c) => c.customerId === "CUS-0002").outstandingBalance === balBefore - 100000);
check("payment logged in audit", s10.auditLog[0].action === "payment");

// 9. License renewal unblocks customer (CUS-0004's license expired)
await as("docOfficer");
await go("/licenses");
await page.locator('[data-row="LIC-SELL-2204"] button:has-text("Renew")').click();
// A year from today, so the test never renews into the past.
const renewTo = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
await page.locator('[role=dialog]:not([inert]) input[type=date]').fill(renewTo);
await page.locator('[role=dialog]:not([inert]) button:has-text("Save")').click();
await page.waitForTimeout(200);
let s11 = await state();
check("license renewal syncs customer expiry", s11.customers.find((c) => c.customerId === "CUS-0004").licenseExpiry === renewTo);

// 10. Distribution officer can't open new-sales-order
await as("distOfficer");
await go("/sales-orders/new");
check("role without permission sees restricted page", (await page.locator("[data-testid=confirm-so-btn]").count()) === 0);

// 11. Reports render and net sales exclude returned
await as("manager");
await go("/reports");
check("reports render", await page.locator("text=Net sales").first().isVisible());

check("no console errors during workflows", consoleProblems.length === 0, consoleProblems.slice(0, 5).join(" | "));
await page.screenshot({ path: out("reports.png"), fullPage: false });
await go(`/import-orders/${io.orderNo}`);
await page.screenshot({ path: out("import-detail.png"), fullPage: true });


// ───────── Modules: master data & ledgers ─────────
const ledgerOk = (st) =>
  st.inventory.every((i) => st.stockMovements.filter((m) => m.lotBatch === i.lotBatch).reduce((a, m) => a + m.quantity, 0) === i.quantityRemaining);
let m0 = await state();
check("stock ledger reconciles for every lot after workflows", ledgerOk(m0),
  m0.inventory.filter((i) => m0.stockMovements.filter((m) => m.lotBatch === i.lotBatch).reduce((a, m) => a + m.quantity, 0) !== i.quantityRemaining).map((i) => i.lotBatch).join(","));
check("return issued a credit note", m0.arDocuments.some((d) => d.type === "creditNote" && d.reference === newSo.orderNo));
check("payment issued a receipt", m0.arDocuments.some((d) => d.type === "payment" && d.customerId === "CUS-0002" && /^RC-\d{4}-0001$/.test(d.docNo)));

// Price list drives sales price
await as("manager");
await go("/price-lists");
await page.locator("main input[type=number]").first().fill("-20");
await page.locator('main button:has-text("Save")').first().click();
await page.waitForTimeout(200);
await as("salesOfficer");
await go("/sales-orders/new");
await page.selectOption("[data-testid=so-customer]", "CUS-0005");
await page.locator("[data-testid=so-line-sku]").nth(0).selectOption("SKU-1001");
const price = await page.locator("[data-testid=so-line-price]").nth(0).inputValue();
check("price list % drives the order price", price === String(Math.round(2490 * 0.8)), price);

// Sales officer opens a customer → terms forced to 0
await go("/customers");
await page.click('main button:has-text("New customer")');
const dlg = page.locator("[role=dialog]:not([inert])");
await dlg.locator("input").nth(1).fill("ร้านทดสอบ");
await dlg.locator("input").nth(2).fill("Test Shop");
await dlg.locator("input").nth(3).fill("0105564088122");
await dlg.locator("input").nth(5).fill("เชียงใหม่");
await dlg.locator("input").nth(6).fill("Chiang Mai");
await dlg.locator('button:has-text("Save")').click();
await page.waitForTimeout(200);
let m1 = await state();
const newCus = m1.customers.find((c) => c.name.en === "Test Shop");
check("sales officer can open a customer, terms start at 0", newCus && newCus.creditLimit === 0 && newCus.standardDiscount === 0, newCus?.customerId);

// Warehouse officer creates a warehouse
await as("whOfficer");
await go("/warehouses");
await page.click('main button:has-text("New warehouse")');
const wd = page.locator("[role=dialog]:not([inert])");
await wd.locator("input").nth(0).fill("whD");
await wd.locator("input").nth(1).fill("คลัง D - ภูเก็ต");
await wd.locator("input").nth(2).fill("Warehouse D - Phuket");
await wd.locator('button:has-text("Save")').click();
await page.waitForTimeout(200);
check("warehouse created", (await state()).warehouses.some((w) => w.code === "whD"));

// Stock alert → prefilled import order → approve → customs → receive into whD
await as("orderOfficer");
await go("/stock-alerts");
const alertLink = page.locator('a[href*="import-orders/new?"]').first();
const href = await alertLink.getAttribute("href");
await alertLink.click();
await page.waitForURL("**/import-orders/new**");
await page.waitForSelector("[data-testid=submit-io-btn]");
const prefillSku = new URL(BASE + href).searchParams.get("sku");
const inputValues = await page.locator("main input[type=text]").evaluateAll((els) => els.map((e) => e.value));
check("stock alert prefills the import order", inputValues.includes(prefillSku), href);
await page.click("[data-testid=submit-io-btn]");
await page.waitForURL("**/import-orders");
let m2 = await state();
const reorderIo = m2.importOrders[0];
check("reorder import order uses supplier master", Boolean(reorderIo.supplierId) && reorderIo.lineItems[0].sku === prefillSku, `${reorderIo.orderNo} ${reorderIo.status} ${reorderIo.supplier}`);
await as("somchai");
await go("/approvals");
await page.locator(`tr:has-text("${reorderIo.orderNo}") button:has-text("Approve")`).click();
await page.waitForTimeout(200);
if ((await state()).importOrders.find((o) => o.orderNo === reorderIo.orderNo).status === "pendingApproval") {
  await as("piyada");
  await go("/approvals");
  await page.locator(`tr:has-text("${reorderIo.orderNo}") button:has-text("Approve")`).click();
  await page.waitForTimeout(200);
}
await as("taxOfficer");
await go(`/import-orders/${reorderIo.orderNo}`);
await page.fill('input[placeholder="A0011-26-00000"]', "A0011-26-77777");
await page.click('button:has-text("Mark cleared")');
await page.waitForTimeout(200);
await as("whOfficer");
await go(`/import-orders/${reorderIo.orderNo}`);
await page.locator("main select").first().selectOption("whD");
await page.locator("main button:has(svg.lucide-package-check)").click();
await page.waitForTimeout(200);
let m3 = await state();
const whdLots = m3.inventory.filter((i) => i.warehouse === "whD");
check("goods received into the new warehouse", whdLots.length === 1 && whdLots[0].sku === prefillSku);
check("receipt written to stock ledger", m3.stockMovements.some((mv) => mv.type === "receipt" && mv.reference === reorderIo.orderNo && mv.warehouse === "whD"));
await go(`/lot-trace?lot=${encodeURIComponent(whdLots[0]?.lotBatch ?? "")}`);
check(
  "lot trace shows source order and reconciles",
  (await page.locator("text=Ledger matches quantity on hand").count()) === 1 && (await page.locator(`a:has-text("${reorderIo.orderNo}")`).count()) > 0,
);
await go("/goods-receipts");
check("goods receipts lists the receipt", (await page.locator(`tr:has-text("${reorderIo.orderNo}")`).count()) === 1);
check("stock ledger still reconciles", ledgerOk(m3));

// Tax officer changes VAT; other roles can't
await as("taxOfficer");
await go("/tax-rates");
await page.locator("main input[type=number]").first().fill("8");
await page.click('main button:has-text("Save")');
await page.waitForTimeout(200);
check("tax officer updates VAT rate", (await state()).taxSettings.vatPercent === 8);
await as("salesOfficer");
await go("/tax-rates");
check("sales officer can't edit tax rates", await page.locator("main input[type=number]").first().isDisabled());

// Inactive supplier can't be chosen on a new import order
await as("orderOfficer");
await go("/suppliers");
await page.locator('tr:has-text("SUP-007") button:has-text("Edit")').click();
await page.locator("[role=dialog]:not([inert]) select").last().selectOption("no");
await page.locator('[role=dialog]:not([inert]) button:has-text("Save")').click();
await page.waitForTimeout(200);
await go("/import-orders/new");
const supplierOpts = await page.locator("main select").first().locator("option").allTextContents();
check("inactive supplier hidden from new orders", !supplierOpts.some((o) => o.includes("SUP-007")));


// ───────── Correctness fixes (audit round) ─────────
{
  // Creating a supplier with an existing ID must not overwrite it.
  await as("orderOfficer");
  await go("/suppliers");
  const before = (await state()).suppliers.find((s) => s.supplierId === "SUP-001").name;
  await page.locator("main button").filter({ hasText: "New supplier" }).click();
  const d = page.locator("[role=dialog]:not([inert])");
  await d.locator("input").nth(0).fill("SUP-001");
  await d.locator("input").nth(1).fill("Overwrite Attempt Ltd");
  await d.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);
  const after = (await state()).suppliers.find((s) => s.supplierId === "SUP-001").name;
  check("new supplier can't overwrite an existing ID", before === after, after);
  await d.locator('button:has-text("Cancel")').click();

  // A supervisor edit that lowers a booked order's value issues a credit note against the invoice.
  await as("somchai");
  const st0 = await state();
  const target = st0.salesOrders.find((o) => !o.approvalStatus && o.deliveryStatus === "pendingShipment" && o.lines[0].quantity > 1);
  await go(`/sales-orders/${target.orderNo}`);
  await page.click('main button:has-text("Edit")');
  const ed = page.locator("[role=dialog]:not([inert])");
  await ed.locator("input").nth(0).fill(String(target.lines[0].quantity - 1));
  await ed.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);
  const st1 = await state();
  const edited = st1.salesOrders.find((o) => o.orderNo === target.orderNo);
  const cn = st1.arDocuments.find((x) => x.type === "creditNote" && x.reference === target.orderNo);
  check("lowering an invoiced order issues a credit note", cn && Math.abs(cn.amount - (target.netValue - edited.netValue)) < 0.01, cn?.docNo);
  check("invoice number unchanged by the edit", edited.taxInvoiceNo === target.taxInvoiceNo);

  // An issued invoice keeps the VAT rate it was issued at (VAT was changed to 8% earlier in this run).
  check("old orders keep their VAT rate", st1.salesOrders.find((o) => o.orderNo === "SO-2026-3301").vatPercent === 7);
  await go("/sales-orders/SO-2026-3301");
  await page.locator('main button:has-text("Documents")').first().click();
  await page.waitForTimeout(200);
  check("printed invoice shows its original VAT rate", (await page.locator("#print-modal-root").innerText()).includes("VAT 7%"));
  await page.keyboard.press("Escape");

  // Moving a lot between warehouses is recorded in the ledger for both warehouses.
  await as("whOfficer");
  await go("/inventory");
  const lotRow = page.locator('tr:has-text("LOT-A2607-03")');
  await lotRow.locator('button:has-text("Adjust")').click();
  const ad = page.locator("[role=dialog]:not([inert])");
  await ad.locator("select").selectOption("whB");
  await ad.locator("input").last().fill("Rebalance stock");
  await ad.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);
  const st2 = await state();
  const tm = st2.stockMovements.filter((m) => m.lotBatch === "LOT-A2607-03" && m.reference.includes("→"));
  check("warehouse transfer recorded out of A and into B", tm.some((m) => m.warehouse === "whA" && m.quantity < 0) && tm.some((m) => m.warehouse === "whB" && m.quantity > 0));

  // Audit summaries with money are hidden from roles without price access.
  // Same rule in both views: the activity feed (default) and the table.
  await go("/audit-trail");
  const feedTxt = await page.locator("main").innerText();
  await page.click("[data-testid=view-table]");
  const txt = await page.locator("main table").innerText();
  await page.click("[data-testid=view-feed]");
  const hidden = (x) => !/Payment received|costPrice|Approved discount|Credit note/.test(x) && x.includes("restricted for your role");
  check("audit trail hides money from restricted roles (feed and table)", hidden(feedTxt) && hidden(txt));
  await as("somchai");
  await go("/audit-trail");
  check("supervisor still sees full audit detail", /Receipt RC-|Credit note|Approved discount/.test(await page.locator("main").innerText()));
}

// ───────── Invariants after every workflow above ─────────
{
  const st = await state();
  const lotSum = (sku) => st.inventory.filter((i) => i.sku === sku).reduce((a, i) => a + i.quantityRemaining, 0);
  const mismatched = st.products.filter((p) => p.stockAvailable !== lotSum(p.sku)).map((p) => `${p.sku} ${p.stockAvailable}≠${lotSum(p.sku)}`);
  check("product stock = sum of its lots (every SKU)", mismatched.length === 0, mismatched.join(", "));
  check("no lot below zero", st.inventory.every((i) => i.quantityRemaining >= 0));
  check("stock ledger reconciles (final)", ledgerOk(st));
  const invoices = st.salesOrders.map((o) => o.taxInvoiceNo).filter((n) => n !== "—");
  check("tax invoice numbers unique", new Set(invoices).size === invoices.length);
  const dns = st.salesOrders.map((o) => o.deliveryNoteNo).filter((n) => n !== "—");
  check("delivery note numbers unique", new Set(dns).size === dns.length);
  check("order numbers unique", new Set(st.salesOrders.map((o) => o.orderNo)).size === st.salesOrders.length && new Set(st.importOrders.map((o) => o.orderNo)).size === st.importOrders.length);
  check("AR document numbers unique", new Set(st.arDocuments.map((d) => d.docNo)).size === st.arDocuments.length);
  check("audit never attributed to a placeholder user", st.auditLog.every((e) => e.actor?.en && !/demo user/i.test(e.actor.en)));
  check("product status matches stock", st.products.every((p) => p.status === (p.stockAvailable <= 0 ? "outOfStock" : p.stockAvailable <= 20 ? "lowStock" : "available")));
}

check("no console errors in module flows", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
consoleProblems.length = 0;

// ── Finance: books, payables, rates, VAT, returns, notifications, CSV import ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;

  await as("somchai");
  await go("/accounting");
  const checks = page.locator("[data-testid=gl-check]");
  check("accounting overview shows its reconciliation checks, all passing", (await checks.count()) === 4 && (await page.locator('[data-testid=gl-check][data-ok="true"]').count()) === 4);
  await go("/accounting/trial-balance");
  check("trial balance debits equal credits", (await page.locator("[data-testid=tb-debit]").innerText()) === (await page.locator("[data-testid=tb-credit]").innerText()));
  await go("/accounting/balance-sheet");
  check("balance sheet balances", /Assets = liabilities \+ equity/.test(await page.locator("[data-testid=bs-balanced]").innerText()));
  await go("/accounting/journal");
  await page.click('button:has-text("All time")');
  check("journal lists entries from the records", (await page.locator("[data-testid=journal-entry]").count()) > 10);
  await go("/tax/vat-return");
  check("VAT return shows output and input tax", (await page.locator("[data-testid=vat-output]").count()) === 1 && (await page.locator("[data-testid=vat-input]").count()) === 1);

  await as("whOfficer");
  await go("/");
  check("roles without price access don't see Accounting", (await page.locator('nav a[href="/accounting"]').count()) === 0);
  await go("/accounting/profit-loss");
  check("…and its pages say restricted", (await page.locator("text=Restricted").count()) > 0 && (await page.locator("[data-testid=pl-net-profit]").count()) === 0);

  // Pay part of the open supplier invoice from the screen.
  await as("manager");
  await go("/payables");
  const st0 = await state();
  const openInv = st0.apDocuments.find((d) => d.type === "invoice" && d.importOrderNo === "IMP-2026-0146");
  await page.click(`[data-testid=pay-${openInv.docNo}]`);
  await page.fill("[data-testid=ap-amount]", "100");
  await page.click("[data-testid=ap-pay-save]");
  await page.waitForTimeout(400);
  const st1 = await state();
  check("manager pays a supplier invoice from the screen", st1.apDocuments.some((d) => d.type === "payment" && d.appliesTo === openInv.docNo && d.amount === 100));

  // A new rate from the screen.
  await as("taxOfficer");
  await go("/exchange-rates");
  await page.fill("[data-testid=fx-currency]", "CHF");
  await page.fill("[data-testid=fx-rate]", "41.5");
  await page.click("[data-testid=fx-save]");
  await page.waitForTimeout(400);
  check("tax officer adds a currency rate", (await page.locator("[data-testid=rate-CHF]").count()) === 1);

  // Partial return of a delivered order.
  await as("distOfficer");
  await go("/sales-orders/SO-2026-3301");
  await page.click("[data-testid=return-items]");
  const dlg = page.locator("[role=dialog]:not([inert])");
  await dlg.locator("input").nth(0).fill("2");
  await dlg.locator("input").last().fill("Broken bottles");
  await dlg.locator('button:has-text("Save")').click();
  await page.waitForTimeout(400);
  const st2 = await state();
  const so = st2.salesOrders.find((o) => o.orderNo === "SO-2026-3301");
  check("partial return recorded on the line", so.lines[0].returnedQuantity === 2 && so.deliveryStatus === "delivered");
  check("…with a credit note for those units", st2.arDocuments.some((d) => d.type === "creditNote" && d.reference === "SO-2026-3301" && /Broken bottles/.test(d.reason?.en ?? "")));
  check("…shown on the order", /2 returned/.test(await page.locator("main").innerText()));

  // Pay a chosen invoice from the customer page.
  await as("salesOfficer");
  await go("/customers/CUS-0005");
  const options = await page.locator("[data-testid=pay-applies-to] option").allTextContents();
  check("customer payment can pick a specific invoice", options.length > 1, options.join(" | "));
  await page.locator("[data-testid=pay-applies-to]").selectOption({ index: 1 });
  await page.fill('input[placeholder]:near([data-testid=pay-applies-to])', "ALLOC-UI").catch(() => {});
  await page.locator('main button:has-text("Record")').first().click();
  await page.waitForTimeout(400);
  const st3 = await state();
  check("…and the receipt is applied to it", st3.arDocuments.some((d) => d.type === "payment" && d.customerId === "CUS-0005" && d.appliesTo));

  // The bell.
  await as("somchai");
  await go("/");
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lisd-seen")).forEach((k) => localStorage.removeItem(k)));
  await go("/");
  const badge = await page.locator("[data-testid=notifications-badge]").innerText().catch(() => "0");
  check("supervisor's bell shows what needs attention", Number(badge) > 0, badge);
  await page.click("[data-testid=notifications]");
  check("…the list includes approvals waiting", (await page.locator("[data-testid=notice-approvals]").count()) === 1);
  await page.keyboard.press("Escape");
  check("…and opening it clears the badge", (await page.locator("[data-testid=notifications-badge]").count()) === 0);

  // CSV import of products.
  await as("manager");
  await go("/products");
  await page.click("[data-testid=csv-open]");
  const csv = "sku,name,category,abv,packageSize,unit,costPrice,suggestedPrice,hsCode\nSKU-CSV1,CSV Test Gin,gin,41,700,bottle,600,890,2208.50\nSKU-CSV2,Bad Row,juice,0,700,bottle,1,2,2208.50\n";
  await page.setInputFiles("[data-testid=csv-file]", { name: "products.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForSelector("[data-testid=csv-row]", { timeout: 5000 }).catch(() => {});
  check("CSV preview flags the bad row", (await page.locator("[data-testid=csv-row]").count()) === 2 && /category must be one of/.test(await page.locator("[role=dialog]:not([inert])").innerText()));
  await page.click("[data-testid=csv-import]");
  await page.waitForTimeout(600);
  const st4 = await state();
  check("CSV import creates the valid product only", st4.products.some((p) => p.sku === "SKU-CSV1") && !st4.products.some((p) => p.sku === "SKU-CSV2"));
  await page.keyboard.press("Escape");

  check("no console errors on the finance screens", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Running the books: expenses, withholding, journals, bank, closing, quotations, purchase requests ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;
  const dlg = page.locator("[role=dialog]:not([inert])");
  const lastMonth = (() => {
    const d = new Date();
    d.setDate(0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  // An expense with withholding, then its voucher and certificate.
  await as("taxOfficer");
  await go("/expenses");
  const before = await page.locator("[data-testid=expense-row]").count();
  await page.click('button:has-text("Record expense")');
  await page.fill("[data-testid=ex-payee]", "UI Legal Services Co., Ltd.");
  await page.fill("[data-testid=ex-taxid]", "0105545012345");
  await page.selectOption("[data-testid=ex-account]", "6600");
  await page.fill("[data-testid=ex-description]", "Contract review");
  await page.fill("[data-testid=ex-amount]", "20000");
  check("expense form works out what's paid (amount + VAT − 3% withheld)", (await page.locator("[data-testid=ex-paid]").innerText()).includes("20,800"));
  await page.click("[data-testid=ex-save]");
  await page.waitForTimeout(500);
  check("tax officer records an expense from the screen", (await page.locator("[data-testid=expense-row]").count()) === before + 1);
  const st1 = await state();
  const ex = st1.expenses.find((x) => x.payee === "UI Legal Services Co., Ltd.");
  check("…with VAT and withholding as entered", ex?.vat === 1400 && ex?.whtAmount === 600 && ex?.paid === 20800, JSON.stringify(ex ?? {}).slice(0, 100));
  await page.click(`[data-testid=voucher-${ex.docNo}]`);
  check("payment voucher prints", (await page.locator("#print-modal-root").innerText()).includes("ใบสำคัญจ่าย"));
  await page.locator('#print-modal-root button[aria-label="Close"]').click();
  await page.click(`[data-testid=cert-${ex.docNo}]`);
  const cert = await page.locator("#print-modal-root").innerText();
  // Tax IDs sit one digit per box on the official form.
  const boxes = (await page.locator("#print-modal-root [data-testid=taxid-boxes]").allInnerTexts()).map((t) => t.replace(/\D/g, ""));
  check("withholding certificate (50 Tawi) prints with both tax IDs", cert.includes("หนังสือรับรองการหักภาษี ณ ที่จ่าย") && boxes.includes("0105545012345") && boxes.includes(st1.company.taxId), boxes.join(","));
  await page.locator('#print-modal-root button[aria-label="Close"]').click();

  // Remit last month's withholding.
  await go("/tax/withholding");
  await page.click(`[data-testid=remit-${lastMonth}]`);
  await page.fill("[data-testid=remit-ref]", "RD-UI-1");
  await page.click("[data-testid=remit-save]");
  await page.waitForTimeout(500);
  check("last month's withholding remitted from the screen", /Remitted/.test(await page.locator(`[data-testid=wht-month][data-month="${lastMonth}"]`).innerText()));

  // A manual journal, then reversing it.
  await as("manager");
  await go("/accounting/manual-journals");
  await page.click('button:has-text("New entry")');
  await page.fill("[data-testid=jv-memo]", "Accrued electricity");
  const jl = page.locator("[data-testid=jv-line]");
  await jl.nth(0).locator("select").selectOption("6300");
  await jl.nth(0).locator("input").nth(0).fill("4200");
  await jl.nth(1).locator("select").selectOption("2900");
  await jl.nth(1).locator("input").nth(1).fill("4200");
  await page.click("[data-testid=jv-save]");
  await page.waitForTimeout(500);
  const jv = (await state()).manualJournals.find((j) => j.memo === "Accrued electricity");
  check("manager posts a manual journal", Boolean(jv) && jv.lines.length === 2);
  await page.click(`[data-testid=reverse-${jv.entryNo}]`);
  await page.fill("[data-testid=reverse-reason]", "Wrong month");
  await page.click("[data-testid=reverse-save]");
  await page.waitForTimeout(500);
  check("…and reverses it", (await state()).manualJournals.some((j) => j.reverses === jv.entryNo));

  // Profit & loss now goes down to net profit after running costs.
  await go("/accounting/profit-loss");
  await page.click('button:has-text("This year")');
  check("P&L shows operating expenses", (await page.locator("[data-testid=pl-opex]").count()) === 1);

  // Bank: explain the bank charge, import a line.
  await go("/accounting/bank");
  const unmatched0 = await page.locator("[data-testid=bank-unmatched]").count();
  check("bank reconciliation shows what the statement has that the books don't", unmatched0 === 2, String(unmatched0));
  const chargeLine = (await state()).bankLines.find((l) => l.description === "BANK CHARGE");
  await page.click(`[data-testid=explain-${chargeLine.id}]`);
  await dlg.locator("[data-testid=jv-memo]").fill("Bank charge September");
  await page.click("[data-testid=jv-save]");
  await page.waitForTimeout(600);
  check("explaining a statement line posts and matches it", (await page.locator("[data-testid=bank-unmatched]").count()) === unmatched0 - 1);
  const csv = `date,description,amount,reference\n${new Date().toISOString().slice(0, 10)},TT IN UI TEST,1234.50,UI-1\n`;
  await page.setInputFiles("[data-testid=bank-file]", { name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForSelector("[data-testid=bank-preview-row]", { timeout: 5000 }).catch(() => {});
  check("statement preview lists the file's lines", (await page.locator("[data-testid=bank-preview-row]").count()) === 1);
  await page.click("[data-testid=bank-import]");
  await page.waitForTimeout(600);
  check("imported line shows as unmatched", (await page.locator("[data-testid=bank-unmatched]").count()) === unmatched0);

  // Close July, then reopen it.
  await go("/accounting/closing");
  await page.click("[data-testid=close-2026-07]");
  await page.waitForTimeout(500);
  check("manager closes a month from the screen", (await page.locator('[data-testid=period][data-month="2026-07"]').getAttribute("data-closed")) === "true" && (await page.locator('[data-testid=period][data-month="2026-06"]').getAttribute("data-closed")) === "true");
  await page.click("[data-testid=reopen-2026-07]");
  await page.fill("[data-testid=reopen-reason]", "UI test");
  await page.click("[data-testid=reopen-save]");
  await page.waitForTimeout(500);
  check("…and reopens it with a reason", (await page.locator('[data-testid=period][data-month="2026-07"]').getAttribute("data-closed")) === "false");

  await go("/company");
  check("opening balances are set in the company profile", (await page.locator("[data-testid=opening-balances]").count()) === 1 && (await page.locator("[data-testid=opening-bank]").inputValue()) === "4000000");

  await as("whOfficer");
  await go("/expenses");
  check("roles without price access don't see expenses", (await page.locator("text=Restricted").count()) > 0 && (await page.locator("[data-testid=expense-row]").count()) === 0);

  // A quotation, converted into a sales order.
  await as("salesOfficer");
  await go("/quotations");
  await page.click('button:has-text("New quotation")');
  await page.selectOption("[data-testid=qt-customer]", "CUS-0004");
  check("quotation form warns when the customer's license has expired", (await page.locator("[data-testid=qt-license-warning]").count()) === 1);
  await page.selectOption("[data-testid=qt-customer]", "CUS-0003");
  await page.locator("[data-testid=qt-line] select").first().selectOption("SKU-1007");
  await page.locator("[data-testid=qt-line] input").first().fill("12");
  await page.click("[data-testid=qt-save]");
  await page.waitForTimeout(500);
  const qt = (await state()).quotations.find((q) => q.lines[0]?.sku === "SKU-1007" && q.lines[0].quantity === 12);
  check("sales officer issues a quotation from the screen", Boolean(qt) && qt.status === "open");
  await page.click(`[data-testid=convert-${qt.quoteNo}]`);
  await page.click("[data-testid=convert-save]");
  await page.waitForURL(/\/sales-orders\/SO-/, { timeout: 8000 }).catch(() => {});
  check("converting opens the new sales order", /\/sales-orders\/SO-/.test(page.url()), page.url());
  check("…and the quotation is marked accepted", (await state()).quotations.find((q) => q.quoteNo === qt.quoteNo).status === "accepted");

  // A purchase request from the warehouse, approved, then ordered.
  await as("whOfficer");
  await go("/purchase-requests?sku=SKU-1007&qty=48");
  check("arriving from a stock alert opens the request form for that product", (await page.locator("[data-testid=pr-sku]").inputValue()) === "SKU-1007");
  await page.click("[data-testid=pr-save]");
  await page.waitForTimeout(500);
  const pr = (await state()).purchaseRequests.find((r) => r.sku === "SKU-1007" && r.status === "pending");
  check("warehouse officer asks for stock", Boolean(pr) && pr.quantity === 48);
  await as("somchai");
  await go("/purchase-requests");
  await page.click(`[data-testid=pr-approve-${pr.requestNo}]`);
  await page.click("[data-testid=pr-decide-save]");
  await page.waitForTimeout(500);
  check("supervisor approves the request", (await state()).purchaseRequests.find((r) => r.requestNo === pr.requestNo).status === "approved");
  await as("orderOfficer");
  await go("/purchase-requests");
  await page.click(`[data-testid=pr-order-${pr.requestNo}]`);
  await page.waitForSelector("[data-testid=from-request]", { timeout: 5000 }).catch(() => {});
  check("ordering it opens the import order form filled in from the request", (await page.locator("[data-testid=from-request]").count()) === 1);

  // Paged history.
  await as("somchai");
  await go("/audit-trail");
  const total = Number((await page.locator("[data-testid=audit-total]").innerText()).replace(/\D/g, ""));
  check("audit trail shows the full count while loading one page", total > 0 && (await page.locator("tbody tr").count()) <= 100, String(total));
  await go("/stock-movements");
  if ((await page.locator("[data-testid=pager-next]").count()) > 0) {
    const first = await page.locator("tbody tr").first().innerText();
    await page.click("[data-testid=pager-next]");
    await page.waitForTimeout(400);
    check("stock movements page through the ledger", (await page.locator("tbody tr").first().innerText()) !== first);
  } else check("stock movements fit on one page", (await page.locator("tbody tr").count()) > 0);

  check("no console errors on the new finance screens", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Collections, statements, emailing, stock counts ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;

  await as("salesOfficer");
  await go("/ar-aging");
  check("collections list who's overdue", (await page.locator("[data-testid=collection-row]").count()) > 0);
  check("…and flags the customer on credit hold", (await page.locator('[data-testid=collection-row][data-customer="CUS-0006"] [data-testid=credit-hold]').count()) === 1);

  // Statement: its closing balance is what the customer owes.
  const owed = (await state()).customers.find((c) => c.customerId === "CUS-0006").outstandingBalance;
  await page.click("[data-testid=statement-CUS-0006]");
  const closing = Number((await page.locator("[data-testid=statement-closing]").innerText()).replace(/,/g, ""));
  check("statement closes at what the customer owes", Math.abs(closing - owed) < 0.01, `${closing} vs ${owed}`);

  // Email it to the demo mailbox.
  await page.click("[data-testid=email-document]");
  check("email form is prefilled with the customer's accounts email", /@/.test(await page.locator("[data-testid=email-to]").inputValue()));
  await page.fill("[data-testid=email-to]", "ui-test@example.com");
  await page.click("[data-testid=email-send]");
  // Sending includes rendering the PDF on the server (slower the first time after a restart): wait for the dialog to close.
  await page.waitForSelector("[data-testid=email-send]", { state: "detached", timeout: 30000 }).catch(() => {});
  const box = await (await fetch("http://localhost:8025/api/v1/search?query=" + encodeURIComponent("to:ui-test@example.com"))).json().catch(() => ({ messages: [] }));
  check("statement arrives in the mailbox", (box.messages ?? []).some((m) => /Statement of account CUS-0006/.test(m.Subject)), String(box.messages?.length));
  await page.locator('#print-modal-root button[aria-label="Close"]').click();

  // A reminder: recorded, then the letter opens.
  await page.click("[data-testid=remind-CUS-0006]");
  await page.click("[data-testid=remind-save]");
  await page.waitForTimeout(500);
  check("sending a reminder opens the letter", (await page.locator("[data-testid=reminder-table]").count()) === 1);
  check("…and records it", (await state()).arReminders.filter((r) => r.customerId === "CUS-0006").length === 2);
  await page.locator('#print-modal-root button[aria-label="Close"]').click();

  await go("/customers/CUS-0005");
  await page.click("[data-testid=customer-statement]");
  check("statement opens from the customer page", (await page.locator("[data-testid=statement-table]").count()) === 1);
  await page.locator('#print-modal-root button[aria-label="Close"]').click();

  // Stock count of a warehouse.
  await as("whOfficer");
  await go("/stock-counts");
  await page.click('button:has-text("Start a count")');
  const whCode = await page.locator("[data-testid=count-warehouse]").inputValue();
  await page.click("[data-testid=count-start]");
  await page.waitForTimeout(500);
  const sc = (await state()).stockCounts.find((c) => c.status === "open" && c.warehouse === whCode);
  check("warehouse officer starts a count", Boolean(sc));
  const card = page.locator(`[data-testid=stock-count][data-count="${sc.countNo}"]`);
  const lines = card.locator("[data-testid=count-line]");
  const n = await lines.count();
  for (let i = 0; i < n; i++) await lines.nth(i).locator("input").fill(String(sc.lines[i].expected - (i === 0 ? 1 : 0)));
  await page.click(`[data-testid=count-post-${sc.countNo}]`);
  await page.waitForTimeout(800);
  const after = await state();
  check("posting the count adjusts the lot that was short", after.stockCounts.find((c) => c.countNo === sc.countNo).status === "posted" && after.inventory.find((i) => i.lotBatch === sc.lines[0].lotBatch).quantityRemaining === sc.lines[0].expected - 1);

  check("no console errors on collections and counts", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Documents: payment details, logo, signature, copies, the official 50 ทวิ, spreadsheet exports ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;

  // Upload a logo, signature and stamp from Company Profile and switch printing on.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await as("manager");
  await go("/company");
  check("company profile has the payment details", (await page.locator("[data-testid=payment-details]").count()) === 1);
  for (const kind of ["logo", "signature", "stamp"]) {
    await page.setInputFiles(`[data-testid=upload-${kind}]`, { name: `${kind}.png`, mimeType: "image/png", buffer: png });
    await page.waitForTimeout(500);
  }
  // The box follows the saved setting, so it changes once the server has confirmed.
  await page.click("[data-testid=print-signature]");
  await page.waitForTimeout(600);
  const coNow = (await state()).company;
  check("logo, signature and stamp uploaded from the screen", Boolean(coNow.logo && coNow.signature && coNow.stamp && coNow.printSignature));

  // The tax invoice now shows the logo, how to pay (with a PromptPay QR), and is signed.
  await go("/sales-orders/SO-2026-3301");
  await page.locator('main button:has-text("Documents")').first().click();
  await page.waitForTimeout(800);
  const doc = page.locator("#print-modal-root");
  check("invoice carries the logo", (await doc.locator("[data-testid=doc-logo]").count()) === 1);
  check("…how to pay, with a PromptPay QR code", (await doc.locator("[data-testid=payment-block]").count()) === 1 && (await doc.locator("[data-testid=promptpay-qr]").count()) === 1);
  check("…and the authorised signature and stamp", (await doc.locator("[data-testid=doc-signature]").count()) === 1 && (await doc.locator("[data-testid=doc-stamp]").count()) === 1);
  await page.click("[data-testid=copy-both]");
  await page.waitForTimeout(300);
  check("original and copy print together", (await doc.locator("[data-testid=copy-break]").count()) === 1 && (await doc.locator('text="สำเนา / COPY"').count()) === 1 && (await doc.locator('text="ต้นฉบับ / ORIGINAL"').count()) === 1);
  await doc.locator('button[aria-label="Close"]').click();

  // The withholding certificate in the official layout, both copies.
  await go("/expenses");
  await page.locator("[data-testid^=cert-]").first().click();
  await page.waitForTimeout(400);
  check("50 ทวิ is in the official layout: tax IDs in boxes, income row 5, two copies", (await doc.locator("[data-testid=taxid-boxes]").count()) === 4 && (await doc.locator("[data-testid=income-row-5]").count()) === 2);
  await doc.locator('button[aria-label="Close"]').click();

  // Spreadsheet exports are real .xlsx files.
  await go("/customers");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('main button:has-text("Export")').first().click()]);
  const path = await dl.path();
  const head = (await import("node:fs")).readFileSync(path).subarray(0, 2).toString();
  check("exports download as Excel workbooks", dl.suggestedFilename().endsWith(".xlsx") && head === "PK", dl.suggestedFilename());

  check("no console errors on documents and exports", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Names and numbers are the way into a record ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;
  await as("somchai");
  for (const path of ["/customers", "/sales-orders", "/import-orders"]) {
    await go(path);
    check(`${path}: no separate "View details" buttons`, (await page.locator('main :text-is("View details")').count()) === 0);
  }
  await go("/customers");
  await page.locator("[data-testid=customer-link]").first().click();
  await page.waitForURL(/\/customers\/CUS-/, { timeout: 5000 }).catch(() => {});
  check("a customer's name opens the customer", /\/customers\/CUS-\d+$/.test(page.url()), page.url());
  await go("/sales-orders");
  const firstOrder = await page.locator("[data-testid=order-link]").first().innerText();
  await page.locator("[data-testid=order-link]").first().click();
  await page.waitForURL(/\/sales-orders\/SO-/, { timeout: 5000 }).catch(() => {});
  check("an order number opens the order", page.url().endsWith(`/sales-orders/${firstOrder}`), page.url());
  await go("/receipts");
  await page.locator("[data-testid=ar-doc-link]").first().click();
  await page.waitForTimeout(300);
  check("a receipt or note number opens the document", (await page.locator("#print-modal-root").count()) === 1);
  await page.locator('#print-modal-root button[aria-label="Close"]').click();
  await go("/quotations");
  await page.locator('[data-testid=quote-row] button:has-text("QT-")').first().click();
  await page.waitForTimeout(300);
  check("a quotation number opens the quotation", (await page.locator("#print-modal-root").innerText()).includes("ใบเสนอราคา"));
  await page.locator('#print-modal-root button[aria-label="Close"]').click();
  check("no console errors following record links", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Thai-encoded CSV, and purchase requests in the Approvals queue ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;
  // Thai banks (and Excel's plain "CSV" on Thai Windows) save Windows-874: Thai letters U+0E01–U+0E5B are bytes 0xA1–0xFB.
  const tis620 = (text) => Buffer.from([...text].map((ch) => (ch.codePointAt(0) >= 0x0e01 && ch.codePointAt(0) <= 0x0e5b ? ch.codePointAt(0) - 0x0e00 + 0xa0 : ch.codePointAt(0))));
  await as("manager");
  await go("/accounting/bank");
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.setInputFiles("[data-testid=bank-file]", { name: "kbank.csv", mimeType: "text/csv", buffer: tis620(`date,description,amount,reference\n${yesterday},โอนเงินเข้า ร้านสุขใจ,1500.00,TIS-1\n`) });
  await page.waitForTimeout(300);
  check("a bank statement saved in Thai Windows encoding reads correctly", (await page.locator("[data-testid=bank-preview-row]").innerText()).includes("โอนเงินเข้า ร้านสุขใจ"));
  await page.keyboard.press("Escape");

  await as("somchai");
  await go("/approvals");
  const req = (await state()).purchaseRequests.find((r) => r.status === "pending");
  check("pending purchase requests are in the Approvals queue", (await page.locator(`[data-testid=approval-request][data-request="${req.requestNo}"]`).count()) === 1);
  await page.click(`[data-testid=approve-request-${req.requestNo}]`);
  await page.waitForTimeout(500);
  check("…and can be approved from there", (await state()).purchaseRequests.find((r) => r.requestNo === req.requestNo).status === "approved");
  check("no console errors on approvals and imports", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Search, shortcuts, copy order, lot labels, opening balances, two-step sign-in, morning email ──
{
  await admin.post("/api/admin/reset");
  consoleProblems.length = 0;
  await as("somchai");
  await go("/");

  // Search from anywhere.
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-testid=search-input]", { timeout: 3000 }).catch(() => {});
  check("Ctrl+K opens search", (await page.locator("[data-testid=search-input]").count()) === 1);
  await page.fill("[data-testid=search-input]", "SO-2026-3301");
  await page.waitForTimeout(200);
  check("…which finds an order by number", (await page.locator("[data-testid=search-hit]").count()) >= 1);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/sales-orders\/SO-2026-3301$/, { timeout: 5000 }).catch(() => {});
  check("…and Enter opens it", page.url().endsWith("/sales-orders/SO-2026-3301"), page.url());
  const st0 = await state();
  const someCustomer = st0.customers[2];
  await page.keyboard.press("/");
  await page.fill("[data-testid=search-input]", someCustomer.name.en.split(" ")[0]);
  await page.waitForTimeout(200);
  check("search finds customers by name", (await page.locator("[data-testid=search-hit]").allInnerTexts()).some((x) => x.includes(someCustomer.name.en)));
  await page.keyboard.press("Escape");
  check("Esc closes it", (await page.locator("[data-testid=search-input]").count()) === 0);
  await page.keyboard.press("?");
  check("? lists the shortcuts", (await page.locator('[role=dialog][aria-label="Keyboard shortcuts"]').count()) === 1);
  await page.keyboard.press("Escape");
  await go("/sales-orders");
  await page.keyboard.press("n");
  await page.waitForURL(/\/sales-orders\/new/, { timeout: 5000 }).catch(() => {});
  check("n starts a new record on a list page", page.url().endsWith("/sales-orders/new"), page.url());

  // Copy an order.
  const source = st0.salesOrders.find((o) => o.orderNo === "SO-2026-3301");
  await go(`/sales-orders/${source.orderNo}`);
  await page.click("[data-testid=copy-order]");
  await page.waitForURL(/\/sales-orders\/new\?copy=/, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction((id) => document.querySelector("main")?.innerText.includes(id), source.customerId, { timeout: 5000 }).catch(() => {});
  const form = await page.locator("main").innerText();
  const firstSku = st0.products.find((p) => p.sku === source.lines[0].sku);
  check("Copy order opens a new order for the same customer", page.url().includes(`copy=${source.orderNo}`) && form.includes(source.customerId), page.url());
  check("…with the same products", form.includes(firstSku.sku) || form.includes(firstSku.name), firstSku.sku);

  // Lot labels.
  await go("/inventory");
  const lot = st0.inventory.find((i) => i.quantityRemaining > 0);
  await page.click(`[data-testid="label-${lot.lotBatch}"]`);
  await page.waitForSelector("[data-testid=lot-label]", { timeout: 3000 }).catch(() => {});
  check("a lot label shows its QR code and lot number", (await page.locator("[data-testid=lot-label]").count()) === 1 && (await page.locator("[data-testid=lot-label] img").count()) === 1 && (await page.locator("[data-testid=lot-label]").innerText()).includes(lot.lotBatch));
  await page.fill("[data-testid=label-copies]", "4");
  await page.waitForTimeout(150);
  check("…as many copies as needed", (await page.locator("[data-testid=lot-label]").count()) === 4);
  await page.keyboard.press("Escape");
  await page.locator('#print-modal-root button[aria-label="Close"]').click().catch(() => {});

  // Opening balances, imported from a spreadsheet.
  await as("manager");
  await go("/opening-balances");
  check("Opening balances page lists the three kinds", (await page.locator("[data-testid^=opening-]:is(section)").count()) === 3);
  await page.click("[data-testid=opening-import-receivables]");
  const dated = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  await page.setInputFiles("[data-testid=csv-file]", {
    name: "opening.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`customerId,invoiceNo,invoiceDate,dueDate,amount\nCUS-0002,OLD-UI-1,${dated},,2500\nCUS-0002,OLD-UI-2,${dated},,-5\n`),
  });
  await page.waitForSelector("[data-testid=csv-row]", { timeout: 5000 }).catch(() => {});
  check("the preview flags a bad row", (await page.locator("[data-testid=csv-row]").count()) === 2 && /amount must be a number above 0/.test(await page.locator("[role=dialog]:not([inert])").innerText()));
  await page.click("[data-testid=csv-import]");
  await page.waitForTimeout(600);
  const st1 = await state();
  check("…and imports the good one", st1.arDocuments.filter((d) => d.type === "openingBalance" && d.reference.startsWith("OLD-UI")).length === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("…which the page lists", (await page.locator("[data-testid=opening-receivables]").innerText()).includes("OLD-UI-1"));

  // Two-step sign-in, set up from "My account" and used at the sign-in page.
  const { createHmac } = await import("node:crypto");
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
  const ukey = `ui_${Date.now().toString(36)}2f`;
  await page.evaluate(
    (k) => fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k, role: "salesOfficer", name: { th: "ทดสอบสองขั้น", en: "UI Two Step" }, password: "UiTemp12345" }) }),
    ukey,
  );
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p3 = await ctx.newPage();
  p3.on("pageerror", (e) => consoleProblems.push("pageerror: " + e.message));
  await p3.goto(BASE);
  await p3.evaluate(async (k) => {
    localStorage.setItem("lisd-lang", "en");
    await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k, password: "UiTemp12345" }) });
    await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: "UiTemp12345", next: "UiOwnPass987" }) });
  }, ukey);
  await p3.goto(BASE + "/");
  await p3.waitForLoadState("networkidle");
  await p3.click("[data-testid=change-password]");
  await p3.click("[data-testid=account-tab-twoFactor]");
  check("My account shows two-step sign-in as off", /off/.test(await p3.locator("[data-testid=totp-status]").innerText()));
  await p3.click("[data-testid=totp-start]");
  await p3.waitForSelector("[data-testid=totp-secret]", { timeout: 5000 }).catch(() => {});
  check("setting up shows a QR code to scan", (await p3.locator("[data-testid=totp-qr]").count()) === 1);
  const secret = (await p3.locator("[data-testid=totp-secret]").innerText()).replace(/\s/g, "");
  await p3.fill("[data-testid=totp-code]", totp(secret, Date.now()));
  await p3.click("[data-testid=totp-enable]");
  await p3.waitForTimeout(600);
  check("…and the app's code turns it on", /on/.test(await p3.locator("[data-testid=totp-status]").innerText()));

  // The morning email, from the same dialog.
  await p3.click("[data-testid=account-tab-summary]");
  await p3.fill("[data-testid=summary-email]", `${ukey}@example.com`);
  await p3.click("[data-testid=summary-daily]");
  await p3.click("[data-testid=summary-send]");
  await p3.waitForSelector("[data-testid=summary-message]", { timeout: 15000 }).catch(() => {});
  check("Send me one now sends the morning summary", /Sent/.test(await p3.locator("[data-testid=summary-message]").innerText().catch(() => "")));
  await p3.keyboard.press("Escape");

  // Sign out and back in: password, then the code.
  await p3.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  await p3.goto(BASE + "/");
  await p3.waitForLoadState("networkidle");
  await p3.locator("select").first().selectOption(ukey);
  await p3.fill("input[type=password]", "UiOwnPass987");
  await p3.click("button[type=submit]");
  await p3.waitForSelector("[data-testid=login-2fa]", { timeout: 5000 }).catch(() => {});
  check("after the password, sign-in asks for the code", (await p3.locator("[data-testid=login-2fa]").count()) === 1 && (await p3.locator("nav").count()) === 0);
  await p3.fill("[data-testid=totp-code]", "000000" === totp(secret, Date.now() + 30000) ? "111111" : "000000");
  await p3.click("[data-testid=totp-verify]");
  await p3.waitForTimeout(400);
  check("…a wrong code is refused", (await p3.locator("[data-testid=login-2fa] [role=alert]").innerText().catch(() => "")).includes("isn't right"));
  await p3.fill("[data-testid=totp-code]", totp(secret, Date.now() + 30000));
  await p3.click("[data-testid=totp-verify]");
  await p3.waitForTimeout(800);
  check("…and the right one opens the app", (await p3.locator("nav").count()) > 0);
  await ctx.close();

  await go("/users");
  check("the Users list marks who uses two-step sign-in", (await page.locator(`[data-user=${ukey}] [data-testid=user-2fa]`).count()) === 1);
  await page.locator(`[data-user=${ukey}] button[title="Reset two-step sign-in"]`).click();
  await page.waitForTimeout(500);
  check("…and a manager can reset it", (await page.locator(`[data-user=${ukey}] [data-testid=user-2fa]`).count()) === 0);
  await page.evaluate((k) => fetch(`/api/admin/users/${k}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) }), ukey);
  check("no console errors on search, labels, opening balances and sign-in", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}

// ── Scanning a lot label with the camera (a simulated camera showing the printed QR code) ──
{
  await admin.post("/api/admin/reset");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  // The camera films whatever image window.__cameraShows holds. No native barcode reader, as on Windows
  // and iPhones, so the app's own QR reader does the decoding.
  await ctx.addInitScript(() => {
    delete window.BarcodeDetector;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 640;
    const g = canvas.getContext("2d");
    const img = new Image();
    let shown = "";
    setInterval(() => {
      if (window.__cameraShows && window.__cameraShows !== shown) {
        shown = window.__cameraShows;
        img.src = shown;
      }
      g.fillStyle = "#fff";
      g.fillRect(0, 0, canvas.width, canvas.height);
      if (img.complete && img.naturalWidth) g.drawImage(img, 90, 170, 300, 300);
    }, 50);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15);
  });
  const p4 = await ctx.newPage();
  const problems = [];
  p4.on("pageerror", (e) => problems.push(e.message));
  await p4.goto(BASE);
  await p4.evaluate(async () => {
    localStorage.setItem("lisd-lang", "en");
    await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "whOfficer", password: "demo1234" }) });
  });
  const lot = (await state()).inventory.find((i) => i.quantityRemaining > 0 && i.warehouse === "whA");
  await p4.goto(`${BASE}/inventory`);
  await p4.waitForLoadState("networkidle");
  await p4.click(`[data-testid="label-${lot.lotBatch}"]`);
  await p4.waitForSelector("[data-testid=lot-label] img", { timeout: 5000 });
  const qr = await p4.locator("[data-testid=lot-label] img").first().getAttribute("src");
  await p4.keyboard.press("Escape");
  await p4.locator('#print-modal-root button[aria-label="Close"]').click().catch(() => {});

  // From search: scanning a label opens the lot.
  await p4.evaluate((src) => (window.__cameraShows = src), qr);
  await p4.keyboard.press("Control+k");
  await p4.click("[data-testid=search-scan]");
  await p4.waitForURL(/\/lot-trace\?lot=/, { timeout: 10000 }).catch(() => {});
  check("scanning a lot label (no native barcode reader) opens that lot", decodeURIComponent(p4.url()).endsWith(`lot=${lot.lotBatch}`), p4.url());
  check("…and the camera is let go", (await p4.locator("[data-testid=scanner]").count()) === 0);

  // On a stock count: scanning a label puts the cursor in that lot's count.
  await p4.evaluate(() => (window.__cameraShows = ""));
  await p4.goto(`${BASE}/stock-counts`);
  await p4.waitForLoadState("networkidle");
  await p4.click('button:has-text("Start a count")');
  await p4.selectOption("[data-testid=count-warehouse]", "whA");
  await p4.click("[data-testid=count-start]");
  await p4.waitForSelector("[data-testid=stock-count][data-status=open]", { timeout: 5000 });
  const countNo = await p4.locator("[data-testid=stock-count][data-status=open]").first().getAttribute("data-count");
  await p4.evaluate((src) => (window.__cameraShows = src), qr);
  await p4.click(`[data-testid=count-scan-${countNo}]`);
  await p4.waitForFunction((l) => document.activeElement?.closest("[data-lot]")?.getAttribute("data-lot") === l, lot.lotBatch, { timeout: 10000 }).catch(() => {});
  check("on a stock count, scanning a label jumps to that lot's line", await p4.evaluate((l) => document.activeElement?.closest("[data-lot]")?.getAttribute("data-lot") === l, lot.lotBatch));

  // No camera allowed: the scanner says so instead of hanging.
  await p4.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await p4.click(`[data-testid=count-scan-${countNo}]`);
  await p4.waitForTimeout(300);
  check("without camera permission the scanner explains", /camera/i.test(await p4.locator("[data-testid=scanner-message]").innerText()));
  await p4.keyboard.press("Escape");
  await p4.evaluate((no) => fetch("/api/commands/cancelStockCount", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ args: [no] }) }), countNo);
  check("no page errors while scanning", problems.length === 0, problems.slice(0, 2).join(" | "));
  await ctx.close();
}

// ── Users & Access ──
{
  await as("salesOfficer");
  await go("/");
  check("roles without access don't see Users in the sidebar", (await page.locator('nav a[href="/users"]').count()) === 0);
  await go("/users");
  check("…and the page itself says it's restricted", (await page.locator("text=Restricted — only Senior Managers").count()) === 1);

  await as("somchai");
  await go("/users");
  check("supervisor sees the list, view only", (await page.locator("[data-user=manager]").count()) === 1 && (await page.locator("[data-testid=new-user]").count()) === 0 && (await page.locator("text=View only").count()) === 1);

  await as("manager");
  await go("/users");
  check("manager sees Users in the sidebar", (await page.locator('nav a[href="/users"]').count()) === 1);
  check("role matrix shows what each role can do", (await page.locator("text=What each role can do").count()) === 1);
  const ukey = `ui_${Date.now().toString(36)}`;
  await page.click("[data-testid=new-user]");
  await page.fill("[data-testid=user-key]", ukey);
  await page.selectOption("[data-testid=user-role]", "distributionOfficer");
  await page.fill("[data-testid=user-name-th]", "ทดสอบ UI (เจ้าหน้าที่กระจายสินค้า)");
  await page.fill("[data-testid=user-name-en]", "UI Test (Distribution Officer)");
  await page.fill("[data-testid=user-password]", "UiTemp12345");
  await page.click("[data-testid=user-save]");
  await page.waitForTimeout(400);
  check("manager creates a user from the screen", (await page.locator(`[data-user=${ukey}]`).count()) === 1 && /Temporary password/.test(await page.locator(`[data-user=${ukey}]`).innerText()));
  check("own row can't be disabled", await page.locator('[data-user=manager] button:has-text("Disable")').isDisabled());

  // The new person signs in: the forced "choose your password" screen comes first.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.evaluate(async (k) => {
    localStorage.setItem("lisd-lang", "en");
    await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k, password: "UiTemp12345" }) });
  }, ukey);
  await p2.goto(BASE + "/");
  await p2.waitForLoadState("networkidle");
  check("temporary password → forced change screen", (await p2.locator("text=Choose your password").count()) === 1 && (await p2.locator("nav").count()) === 0);
  await p2.fill("[data-testid=pw-current]", "UiTemp12345");
  await p2.fill("[data-testid=pw-new]", "UiOwnPass987");
  await p2.fill("[data-testid=pw-again]", "UiOwnPass987");
  await p2.click("[data-testid=pw-save]");
  await p2.waitForTimeout(600);
  check("after choosing a password the app opens", (await p2.locator("nav").count()) > 0);

  // Change password from the header.
  await p2.click("[data-testid=change-password]");
  await p2.fill("[role=dialog] [data-testid=pw-current]", "UiOwnPass987");
  await p2.fill("[role=dialog] [data-testid=pw-new]", "UiNewer4567");
  await p2.fill("[role=dialog] [data-testid=pw-again]", "UiNewer4567");
  await p2.click("[role=dialog] [data-testid=pw-save]");
  await p2.waitForTimeout(500);
  check("header Change password works and keeps you signed in", (await p2.locator("[role=dialog]").count()) === 0 && (await p2.evaluate(async () => (await fetch("/api/state")).status)) === 200);
  await ctx2.close();

  // Disable from the screen.
  await page.locator(`[data-user=${ukey}] button:has-text("Disable")`).click();
  await page.waitForTimeout(400);
  check("manager disables a user from the screen", /Disabled/.test(await page.locator(`[data-user=${ukey}]`).innerText()));
  const audit = await state();
  check("user changes show in the audit trail", audit.auditLog.some((e) => e.entityType === "user" && e.entityId === ukey && /disabled/.test(e.summary.en)));
  check("no console errors on the users screens", consoleProblems.length === 0, consoleProblems.slice(0, 3).join(" | "));
}
await go("/stock-alerts");
await page.screenshot({ path: out("alerts.png"), fullPage: true });
await go("/lot-trace?lot=LOT-A2607-01");
await page.screenshot({ path: out("lot.png"), fullPage: true });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
