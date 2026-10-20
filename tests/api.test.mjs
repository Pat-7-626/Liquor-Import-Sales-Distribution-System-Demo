// API tests against a running stack: node tests/api.test.mjs [http://localhost:3000]
// Note: resets the demo data.
const BASE = process.argv[2] ?? process.env.API_URL ?? "http://localhost:3000";
const results = [];
const check = (name, cond, detail = "") => {
  results.push(Boolean(cond));
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function session(key, password = "demo1234") {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { cookie, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  };
  return { status: r.status, cookie, call, cmd: (name, ...args) => call("POST", `/api/commands/${name}`, { args }) };
}

const lotSum = (st, sku) => st.inventory.filter((i) => i.sku === sku).reduce((a, i) => a + i.quantityRemaining, 0);
// What each customer owes must equal opening balances + invoices of orders they kept − payments.
// (Credit/debit notes from edits are already in the order's value; a return reverses the whole invoice.)
const arReconciles = (st) =>
  st.customers.every((c) => {
    const docs = st.arDocuments.filter((d) => d.customerId === c.customerId);
    const opening = docs.filter((d) => d.type === "openingBalance").reduce((a, d) => a + d.amount, 0);
    const paid = docs.filter((d) => d.type === "payment").reduce((a, d) => a + d.amount, 0);
    const invoiced = st.salesOrders
      .filter((o) => o.customerId === c.customerId && !o.approvalStatus && !["returned", "damaged"].includes(o.deliveryStatus))
      .reduce((a, o) => a + o.netValue, 0);
    return Math.abs(opening + invoiced - paid - c.outstandingBalance) < 0.01;
  });
const one = (customerId, sku, lotBatch, quantity, unitPrice, discountPercent = 0) => ({ customerId, lines: [{ sku, lotBatch, quantity, unitPrice, discountPercent }] });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// /api/state leaves out the stock ledger and audit log (they're paged); tests that need them read them in full.
async function fullState(sess) {
  const [state, moves, audit] = await Promise.all([sess.call("GET", "/api/state"), sess.call("GET", "/api/stock-movements?limit=5000"), sess.call("GET", "/api/audit?limit=5000")]);
  return { ...state.json, stockMovements: moves.json.rows, auditLog: audit.json.rows };
}
const ledgerOk = (st) => st.inventory.every((i) => st.stockMovements.filter((m) => m.lotBatch === i.lotBatch).reduce((a, m) => a + m.quantity, 0) === i.quantityRemaining);

// ── auth ──
check("unauthenticated state is refused", (await fetch(`${BASE}/api/state`)).status === 401);
check("the sign-in user list is offered (demo mode)", (await (await fetch(`${BASE}/api/users`)).json()).length > 0);
{
  // Five wrong passwords for a username nobody has: locked out just like a real account, so a 429 reveals nothing.
  const ghost = `ghost-${Date.now()}`;
  const replies = [];
  for (let i = 0; i < 5; i++) replies.push((await session(ghost, "wrong")).status);
  check("a made-up username locks after the same number of tries as a real one", replies.slice(0, 4).every((c) => c === 401) && replies[4] === 429, replies.join(","));
}
check("wrong password refused", (await session("somchai", "nope")).status === 401);
const sup = await session("somchai");
check("supervisor signs in", sup.status === 200 && sup.cookie.startsWith("lisd_session="));

// Fresh data for a repeatable run.
await sup.call("POST", "/api/admin/reset");
let st = (await fullState(sup));
check("seeded: 12 products, 10 import orders' worth of data", st.products.length === 12 && st.importOrders.length === 8 && st.salesOrders.length === 8, `${st.products.length}/${st.importOrders.length}/${st.salesOrders.length}`);
check("seeded product stock = sum of lots", st.products.every((p) => p.stockAvailable === lotSum(st, p.sku)));
check("seeded stock ledger reconciles", ledgerOk(await fullState(sup)));
check("dates come back as ISO strings", /^\d{4}-\d{2}-\d{2}$/.test(st.salesOrders[0].orderDate) && typeof st.products[0].costPrice === "number");
check("derived credit status computed on load", st.customers.find((c) => c.customerId === "CUS-0006").creditStatus === "overLimit");
check("seeded orders have lines that sum to the order value", st.salesOrders.every((o) => o.lines.length > 0 && Math.abs(o.lines.reduce((a, l) => a + l.netValue, 0) - o.netValue) < 0.01));
check("seeded customers carry tax ID, branch, address, terms", st.customers.every((c) => /^\d{13}$/.test(c.taxId) && /^\d{5}$/.test(c.branch) && c.address.th && c.creditTermDays > 0));
check("seeded company profile present", /^\d{13}$/.test(st.company.taxId) && st.company.name.th.length > 0);
check("every seeded order has a status history ending at its current stage", st.salesOrders.every((o) => o.statusHistory?.length && o.statusHistory.at(-1).status === (o.approvalStatus ?? o.deliveryStatus)) && st.importOrders.every((o) => o.statusHistory?.length && o.statusHistory.at(-1).status === o.status));
check("opening balances explain every outstanding balance", st.arDocuments.some((d) => d.type === "openingBalance" && d.dueDate) && arReconciles(st));

// ── a sale, end to end ──
const so = await (await session("salesOfficer")).cmd("createSalesOrder", one("CUS-0005", "SKU-1001", "LOT-A2607-01", 10, 2241));
check("sales officer books an order", so.status === 200 && so.json.result.ok && so.json.result.order.orderNo === "SO-2026-3309", JSON.stringify(so.json?.result).slice(0, 120));
st = (await fullState(sup));
check("lot and product stock both moved", st.inventory.find((i) => i.lotBatch === "LOT-A2607-01").quantityRemaining === 350 && st.products.find((p) => p.sku === "SKU-1001").stockAvailable === 350);
check("audit attributed to the signed-in user", st.auditLog[0].actor.en.startsWith("Chayanan"));
check("order stamped with VAT rate", st.salesOrders.find((o) => o.orderNo === "SO-2026-3309").vatPercent === 7);
{
  const o = st.salesOrders.find((x) => x.orderNo === "SO-2026-3309");
  const terms = st.customers.find((c) => c.customerId === "CUS-0005").creditTermDays;
  check("booked order gets invoice date and due date on the customer's terms", o.invoiceDate === o.orderDate && o.dueDate === addDays(o.invoiceDate, terms), `${o.invoiceDate} → ${o.dueDate}`);
  check("receivables still reconcile after a sale", arReconciles(st));
  check("an order placed without a date is planned for the next day", o.plannedDeliveryDate === addDays(o.orderDate, 1), o.plannedDeliveryDate);
}
{
  const sales = await session("salesOfficer");
  const past = await sales.cmd("createSalesOrder", { ...one("CUS-0005", "SKU-1001", "LOT-A2607-01", 1, 2241), plannedDeliveryDate: "2020-01-01" });
  check("planned delivery before the order date refused", !past.json.result.ok, past.json.result.error?.en);
  const far = await sales.cmd("createSalesOrder", { ...one("CUS-0005", "SKU-1001", "LOT-A2607-01", 1, 2241), plannedDeliveryDate: addDays(new Date().toISOString().slice(0, 10), 120) });
  check("planned delivery more than 90 days out refused", !far.json.result.ok);
  const dist = await session("distOfficer");
  const target = addDays(new Date().toISOString().slice(0, 10), 5);
  const re = await dist.cmd("scheduleDelivery", "SO-2026-3309", target);
  check("dispatch reschedules a delivery", re.json.result.ok && re.json.state.salesOrders.find((x) => x.orderNo === "SO-2026-3309").plannedDeliveryDate === target);
  check("sales officer can't reschedule deliveries", !(await sales.cmd("scheduleDelivery", "SO-2026-3309", target)).json.result.ok);
  check("a delivered order can't be rescheduled", !(await dist.cmd("scheduleDelivery", "SO-2026-3301", target)).json.result.ok);
}

// ── permissions, validation, masking ──
const wh = await session("whOfficer");
const denied = await wh.cmd("createSalesOrder", one("CUS-0005", "SKU-1001", "LOT-A2607-01", 1, 2241));
check("warehouse officer can't create sales orders (server-enforced)", denied.status === 422 && /permitted/.test(denied.json.result.error.en));
const bad = await sup.cmd("createSalesOrder", { customerId: "CUS-0005", lines: [{ sku: "SKU-1001", quantity: "ten" }] });
check("malformed input rejected before the rules run", bad.status === 422 && /Invalid input/.test(bad.json.result.error.en));
check("unknown command → 404", (await sup.cmd("dropAllTables")).status === 404);
const whState = (await fullState(wh));
check("restricted role never receives cost prices", whState.products.every((p) => p.costPrice === 0) && whState.salesOrders.every((o) => o.netValue === 0));
check("restricted role gets masked line prices", whState.salesOrders.every((o) => o.lines.every((l) => l.unitPrice === 0 && l.netValue === 0 && l.discountPercent === 0)) && whState.salesOrders.some((o) => o.lines[0].quantity > 0));
check("restricted role gets masked audit text", whState.auditLog.filter((e) => e.sensitive).every((e) => /restricted/.test(e.summary.en)));
check("restricted role still sees quantities", whState.inventory.some((i) => i.quantityRemaining > 0));
check("validation notes scrubbed of prices", !JSON.stringify(whState.importOrders.map((o) => o.note)).match(/฿\d/));

// ── concurrency: 6 parallel orders for 5 units each against a 12-unit lot ──
const sales = await session("salesOfficer");
const race = await Promise.all(
  Array.from({ length: 6 }, () =>
    sales.cmd("createSalesOrder", one("CUS-0005", "SKU-1011", "LOT-A2601-01", 5, 4500)),
  ),
);
const won = race.filter((r) => r.json?.result?.ok).length;
st = (await fullState(sup));
check("parallel orders can't oversell a lot", won === 2 && st.inventory.find((i) => i.lotBatch === "LOT-A2601-01").quantityRemaining === 2, `${won} succeeded`);
const invoices = st.salesOrders.map((o) => o.taxInvoiceNo).filter((n) => n !== "—");
check("invoice numbers unique under concurrency", new Set(invoices).size === invoices.length);

// ── multi-line orders ──
{
  await sup.call("POST", "/api/admin/reset");
  st = (await fullState(sup));
  const lotA = st.inventory.find((i) => i.lotBatch === "LOT-A2607-01");
  const lotB = st.inventory.find((i) => i.sku !== lotA.sku && i.quantityRemaining >= 20);
  const before = st.customers.find((c) => c.customerId === "CUS-0005").outstandingBalance;
  const r = await sales.cmd("createSalesOrder", {
    customerId: "CUS-0005",
    lines: [
      { sku: lotA.sku, lotBatch: lotA.lotBatch, quantity: 4, unitPrice: 2241, discountPercent: 0 },
      { sku: lotB.sku, lotBatch: lotB.lotBatch, quantity: 6, unitPrice: 1500, discountPercent: 2 },
      { sku: lotA.sku, lotBatch: lotA.lotBatch, quantity: 2, unitPrice: 2241, discountPercent: 0 },
    ],
  });
  const o = r.json.result.order;
  st = r.json.state;
  check("three-line order booked", r.json.result.ok && o?.lines.length === 3, JSON.stringify(r.json.result).slice(0, 140));
  check("order value = sum of line values", Math.abs(o.netValue - (4 * 2241 + 6 * 1500 * 0.98 + 2 * 2241)) < 0.01, String(o.netValue));
  check("each lot drawn down by its lines", st.inventory.find((i) => i.lotBatch === lotA.lotBatch).quantityRemaining === lotA.quantityRemaining - 6 && st.inventory.find((i) => i.lotBatch === lotB.lotBatch).quantityRemaining === lotB.quantityRemaining - 6);
  check("balance moved by the whole order", Math.abs(st.customers.find((c) => c.customerId === "CUS-0005").outstandingBalance - before - o.netValue) < 0.01);
  check("stock and ledger reconcile after multi-line sale", st.products.every((p) => p.stockAvailable === lotSum(st, p.sku)) && ledgerOk(await fullState(sup)));

  const lotC = st.inventory.find((i) => i.lotBatch === "LOT-A2601-01");
  const over = await sales.cmd("createSalesOrder", {
    customerId: "CUS-0005",
    lines: [
      { sku: lotC.sku, lotBatch: lotC.lotBatch, quantity: lotC.quantityRemaining, unitPrice: 4500, discountPercent: 0 },
      { sku: lotC.sku, lotBatch: lotC.lotBatch, quantity: 1, unitPrice: 4500, discountPercent: 0 },
    ],
  });
  check("two lines can't together oversell one lot", !over.json.result.ok, over.json.result.error?.en);
  const mismatch = await sales.cmd("createSalesOrder", one("CUS-0005", "SKU-1002", lotA.lotBatch, 1, 5000));
  check("a line's lot must belong to its product", !mismatch.json.result.ok, mismatch.json.result.error?.en);
  check("an order needs at least one line", (await sales.cmd("createSalesOrder", { customerId: "CUS-0005", lines: [] })).status === 422);

  // Edit an invoiced order: lower one line's quantity → credit note with reason and original value.
  const edit = await sup.cmd("editSalesOrder", o.orderNo, [
    { quantity: 4, unitPrice: 2241, discountPercent: 0 },
    { quantity: 3, unitPrice: 1500, discountPercent: 2 },
    { quantity: 2, unitPrice: 2241, discountPercent: 0 },
  ]);
  st = edit.json.state;
  const cn = st.arDocuments.find((d) => d.type === "creditNote" && d.reference === o.orderNo);
  check("editing an invoiced order issues a credit note for the difference", edit.json.result.ok && cn && Math.abs(cn.amount - 3 * 1500 * 0.98) < 0.01, JSON.stringify(cn ?? edit.json.result).slice(0, 140));
  check("credit note records its reason and the original invoice value", cn?.reason?.en && Math.abs(cn.originalValue - o.netValue) < 0.01);
  check("edit returned stock to the lot", st.inventory.find((i) => i.lotBatch === lotB.lotBatch).quantityRemaining === lotB.quantityRemaining - 3 && ledgerOk(await fullState(sup)));
  check("edit with the wrong number of lines refused", !(await sup.cmd("editSalesOrder", o.orderNo, [{ quantity: 1, unitPrice: 2241, discountPercent: 0 }])).json.result.ok);

  // Return the whole order: one credit note for its value, stock back on every line, receivables reconcile.
  const valueBefore = st.salesOrders.find((x) => x.orderNo === o.orderNo).netValue;
  const dist = await session("distOfficer");
  await dist.cmd("updateDeliveryStatus", o.orderNo, "inDelivery");
  const ret = await dist.cmd("updateDeliveryStatus", o.orderNo, "returned");
  // The distribution officer's own view is price-masked; read the books as the supervisor.
  st = (await fullState(sup));
  const retCn = st.arDocuments.filter((d) => d.type === "creditNote" && d.reference === o.orderNo).find((d) => d.docNo !== cn?.docNo);
  check("return issues a credit note for the order value", ret.json.result.ok && retCn && Math.abs(retCn.amount - valueBefore) < 0.01 && /return/i.test(retCn.reason?.en ?? ""));
  check("return restocks every line's lot", st.inventory.find((i) => i.lotBatch === lotA.lotBatch).quantityRemaining === lotA.quantityRemaining && st.inventory.find((i) => i.lotBatch === lotB.lotBatch).quantityRemaining === lotB.quantityRemaining);
  check("receivables reconcile after edit and return", arReconciles(st));
  const hist = st.salesOrders.find((x) => x.orderNo === o.orderNo).statusHistory;
  check(
    "status history records each stage once, with time and who did it (edits add nothing)",
    JSON.stringify(hist.map((e) => e.status)) === JSON.stringify(["pendingShipment", "inDelivery", "returned"]) && hist[1].actor.en.startsWith("Wichai") && hist.every((e) => !Number.isNaN(Date.parse(e.at))),
    JSON.stringify(hist.map((e) => e.status)),
  );

  // A payment keeps the books in line too.
  const pay = await sup.cmd("recordPayment", "CUS-0002", 1000, "transfer", "API-PAY");
  check("payment recorded and receivables reconcile", pay.json.result.ok && arReconciles(pay.json.state));
}

// ── tax-invoice details ──
{
  const base = { customerId: "CUS-0901", name: { th: "ร้านทดสอบ", en: "Test Shop" }, branch: "00000", address: { th: "กรุงเทพฯ", en: "Bangkok" }, creditTermDays: 30, channelType: "online", licenseNo: null, creditLimit: 0, standardDiscount: 0 };
  const badId = await sup.cmd("createCustomer", { ...base, taxId: "0105558012340" });
  check("customer with an invalid tax ID check digit refused", !badId.json.result.ok, badId.json.result.error?.en);
  const badBranch = await sup.cmd("createCustomer", { ...base, taxId: "0105558012349", branch: "1" });
  check("branch must be 5 digits", !badBranch.json.result.ok);
  const okCust = await sup.cmd("createCustomer", { ...base, taxId: "0105564088122" });
  check("customer with valid tax details created", okCust.json.result.ok, okCust.json.result.error?.en);
  const terms = await sup.cmd("updateCustomerTerms", "CUS-0901", { creditLimit: 10000, standardDiscount: 0, channelType: "online", creditTermDays: 400 });
  check("payment terms over 365 days refused", !terms.json.result.ok);
  const prof = await (await session("salesOfficer")).cmd("updateCustomerProfile", "CUS-0901", { name: { th: "ร้านทดสอบ 2", en: "Test Shop 2" }, taxId: "0105564088122", branch: "00001", address: { th: "เชียงใหม่", en: "Chiang Mai" } });
  check("sales officer updates a customer's legal details", prof.json.result.ok && prof.json.state.customers.find((c) => c.customerId === "CUS-0901").branch === "00001");

  const company = (await fullState(sup)).company;
  const deniedCo = await (await session("salesOfficer")).cmd("updateCompanyProfile", { ...company, phone: "x" });
  check("only manager/supervisor may change the company profile", !deniedCo.json.result.ok && /permitted/.test(deniedCo.json.result.error.en));
  const badCo = await sup.cmd("updateCompanyProfile", { ...company, taxId: "123" });
  check("company tax ID validated", !badCo.json.result.ok);
  const okCo = await sup.cmd("updateCompanyProfile", { ...company, phone: "02-000-0000" });
  check("supervisor updates the company profile", okCo.json.result.ok && okCo.json.state.company.phone === "02-000-0000");
}

// ── documents ──
const doc = await session("docOfficer");
const fd = new FormData();
fd.append("kind", "invoice");
fd.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), "invoice-0144.pdf");
const up = await doc.call("POST", "/api/import-orders/IMP-2026-0144/documents", fd);
const attached = up.json?.state?.importOrders.find((o) => o.orderNo === "IMP-2026-0144")?.documents?.[0];
check("document upload stored and attached", up.status === 200 && attached?.name === "invoice-0144.pdf", up.text.slice(0, 120));
const file = await doc.call("GET", attached.url);
check("uploaded file downloadable", file.status === 200 && file.text.startsWith("%PDF"));
const exe = new FormData();
exe.append("file", new Blob(["MZ"], { type: "application/x-msdownload" }), "evil.exe");
check("non-PDF/image upload refused", (await doc.call("POST", "/api/import-orders/IMP-2026-0144/documents", exe)).status === 415);
const fake = new FormData();
fake.append("file", new Blob(["<html><script>alert(1)</script></html>"], { type: "application/pdf" }), "not-a.pdf");
check("a file whose content isn't what it claims is refused", (await doc.call("POST", "/api/import-orders/IMP-2026-0144/documents", fake)).status === 415);
{
  // The supplier's invoice shows prices: import paperwork roles and price roles get it; warehouse staff and guests don't.
  const whView = await session("whOfficer");
  check("warehouse staff don't receive the supplier's invoice", !(await whView.call("GET", "/api/state")).json.importOrders.find((o) => o.orderNo === "IMP-2026-0144").documents?.some((d) => d.kind === "invoice"));
  check("…and can't download it", (await whView.call("GET", attached.url)).status === 403);
  check("price roles can", (await sup.call("GET", attached.url)).status === 200);
}
const rm = await doc.cmd("removeDocument", "IMP-2026-0144", attached.id);
check("document removed, file gone", rm.json.result.ok && (await doc.call("GET", attached.url)).status === 404);

// ── workflow through the API: approve → customs → receive ──
await sup.call("POST", "/api/admin/reset");
const off = await session("orderOfficer");
// Price the test order the way a buyer would: the product's expected supplier price, in euros at today's rate.
const base = (await fullState(sup));
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const eurRate = base.exchangeRates.filter((r) => r.currency === "EUR" && r.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0].rate;
const vodka = base.products.find((p) => p.sku === "SKU-1007");
const dutyRate = (base.taxSettings.dutyRates.filter((r) => vodka.hsCode.startsWith(r.hsPrefix)).sort((a, b) => b.hsPrefix.length - a.hsPrefix.length)[0]?.dutyPercent ?? base.taxSettings.defaultDutyPercent) / 100;
const excisePerBottle = 40 * base.taxSettings.exciseThbPerAbvLiter * (vodka.packageSize / 1000);
const supplierThb = (vodka.costPrice - excisePerBottle) / (1 + dutyRate);
const eurPrice = Math.round((supplierThb / eurRate) * 100) / 100;
const io = await off.cmd("createImportOrder", {
  supplierId: "SUP-004", country: "sweden", incoterms: "FOB", orderDate: "2020-01-01", etaDate: "2099-01-01",
  intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1007", abv: 40, qty: 100, unitPrice: eurPrice }],
  logistics: { manufacturerRegNo: "SE-VOD-0093", blAwbNumber: "T1", origin: "Stockholm", destination: "Bangkok", currency: "EUR", paymentTerms: "T/T" }, importLicenseNo: null,
});
const ioNo = io.json.result.order?.orderNo;
check("import order created; backdated order date ignored", io.json.result.ok && io.json.result.order.orderDate !== "2020-01-01", ioNo);
check(
  "order fixed at today's EUR rate and valued in baht",
  io.json.result.order.currency === "EUR" && io.json.result.order.exchangeRate === eurRate && Math.abs(io.json.result.order.totalValue - 100 * eurPrice * eurRate) < 0.02,
  `${io.json.result.order.currency} @ ${io.json.result.order.exchangeRate}`,
);
{
  const silly = await off.cmd("createImportOrder", {
    supplierId: "SUP-004", country: "sweden", incoterms: "FOB", orderDate: today, etaDate: "2099-01-01",
    intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1007", abv: 40, qty: 10, unitPrice: Math.round(supplierThb) }],
    logistics: { manufacturerRegNo: "", blAwbNumber: "", origin: "", destination: "", currency: "EUR", paymentTerms: "" }, importLicenseNo: null,
  });
  check("a baht price typed into a euro order is flagged", silly.json.result.order?.status === "issueDetected", silly.json.result.order?.status);
  const noRate = await off.cmd("createImportOrder", {
    supplierId: "SUP-004", country: "sweden", incoterms: "FOB", orderDate: today, etaDate: "2099-01-01",
    intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1007", abv: 40, qty: 10, unitPrice: 5 }],
    logistics: { manufacturerRegNo: "", blAwbNumber: "", origin: "", destination: "", currency: "CHF", paymentTerms: "" }, importLicenseNo: null,
  });
  check("a currency with no exchange rate is refused", !noRate.json.result.ok && /exchange rate/.test(noRate.json.result.error.en));
}
const own = await sup.cmd("createImportOrder", {
  supplierId: "SUP-004", country: "sweden", incoterms: "FOB", orderDate: "2026-10-08", etaDate: "2099-01-01",
  intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1007", abv: 40, qty: 10, unitPrice: eurPrice }],
  logistics: { manufacturerRegNo: "", blAwbNumber: "", origin: "", destination: "", currency: "EUR", paymentTerms: "" }, importLicenseNo: null,
});
const selfApprove = await sup.cmd("approveImportOrder", own.json.result.order.orderNo);
check("raiser can't approve own order", !selfApprove.json.result.ok && /yourself/.test(selfApprove.json.result.error.en));
check("supervisor approves", (await sup.cmd("approveImportOrder", ioNo)).json.result.ok);
{
  const h = (await fullState(sup)).importOrders.find((x) => x.orderNo === ioNo).statusHistory;
  check("import approval appended to its history", h.at(-1).status === "approved" && h.at(-1).actor.en.startsWith("Somchai"), JSON.stringify(h.map((e) => e.status)));
}
check("doc officer records customs", (await doc.cmd("recordCustomsClearance", ioNo, "A-API-1")).json.result.ok);
const rec = await wh.cmd("receiveGoods", {
  orderNo: ioNo,
  receivedDate: "2026-01-01",
  warehouse: "whC",
  lines: [{ sku: "SKU-1007", orderedQty: 100, receivedQty: 100, lotBatch: "LOT-API-1", exciseStampDate: "2026-10-08" }],
  additionalCostThb: 5000,
});
st = rec.json.state;
check("warehouse receives into whC", rec.json.result.ok && st.inventory.find((i) => i.lotBatch === "LOT-API-1")?.warehouse === "whC");
check("stock invariants hold after the workflow", st.products.every((p) => p.stockAvailable === lotSum(st, p.sku)) && ledgerOk(await fullState(sup)));
{
  // Landed cost = goods at the order's rate + duty + excise + this shipment's freight (฿5,000 over 100 bottles).
  const lot = (await fullState(sup)).inventory.find((i) => i.lotBatch === "LOT-API-1");
  const expected = eurPrice * eurRate * (1 + dutyRate) + excisePerBottle + 50;
  check("received lot carries its landed cost", Math.abs(lot.unitCost - expected) < 0.02, `${lot.unitCost} vs ${expected.toFixed(2)}`);
}

// ── payables and the books ──
{
  const stockQty = (await fullState(sup));
  const offAp = await off.cmd("recordSupplierInvoice", ioNo, "NF-INV-77", today);
  check("purchasing staff can't record supplier invoices", !offAp.json.result.ok && /permitted/.test(offAp.json.result.error.en));
  const inv = await sup.cmd("recordSupplierInvoice", ioNo, "NF-INV-77", today);
  const apInv = inv.json.state.apDocuments.find((d) => d.importOrderNo === ioNo && d.type === "invoice");
  check("supplier invoice recorded for the received goods, due on the supplier's terms", inv.json.result.ok && apInv.currency === "EUR" && Math.abs(apInv.amount - 100 * eurPrice) < 0.01 && apInv.dueDate > apInv.date, JSON.stringify(apInv).slice(0, 120));
  check("only one invoice per shipment", !(await sup.cmd("recordSupplierInvoice", ioNo, "DUP", today)).json.result.ok);
  check("can't invoice goods not yet received", !(await sup.cmd("recordSupplierInvoice", "IMP-2026-0144", "X1", today)).json.result.ok);
  const over = await sup.cmd("recordSupplierPayment", apInv.docNo, apInv.amount + 1, eurRate, "transfer", "TT-1");
  check("can't pay more than is owed", !over.json.result.ok);
  const half = Math.round((apInv.amount / 2) * 100) / 100;
  const pay = await sup.cmd("recordSupplierPayment", apInv.docNo, half, eurRate + 0.5, "transfer", "TT-1");
  check("part payment at a different rate recorded", pay.json.result.ok, pay.json.result.error?.en);

  const st2 = (await fullState(sup));
  const tb = (await sup.call("GET", "/api/accounting/trial-balance")).json;
  const bal = (c) => tb.accounts.find((a) => a.code === c).balance;
  const sum = (k) => tb.accounts.reduce((s, a) => s + a[k], 0);
  check("every journal entry balances", tb.unbalancedEntries.length === 0 && Math.abs(sum("debit") - sum("credit")) < 0.01);
  const stockValue = st2.inventory.reduce((s, i) => s + i.quantityRemaining * i.unitCost, 0);
  check("inventory in the books = stock on hand × landed cost", Math.abs(bal("1300") - stockValue) < 0.05, `${bal("1300")} vs ${stockValue.toFixed(2)}`);
  check("receivables in the books = what customers owe", Math.abs(bal("1200") - st2.customers.reduce((s, c) => s + c.outstandingBalance, 0)) < 0.05);
  const apOpen = st2.apDocuments.filter((d) => d.type === "invoice").reduce((s, d) => s + (d.amount - st2.apDocuments.filter((p) => p.appliesTo === d.docNo).reduce((x, p) => x + p.amount, 0)) * d.rate, 0);
  check("payables in the books = unpaid supplier invoices at their booked rate", Math.abs(bal("2110") - apOpen) < 0.05, `${bal("2110")} vs ${apOpen.toFixed(2)}`);
  check("goods received and invoiced leave nothing in GRNI", Math.abs(bal("2120")) < 0.05, String(bal("2120")));
  check("paying at a higher rate than booked is an exchange loss", bal("5900") > 0);
  const assets = tb.accounts.filter((a) => a.code < "2").reduce((s, a) => s + a.balance, 0);
  const liab = tb.accounts.filter((a) => a.code >= "2" && a.code < "3").reduce((s, a) => s + a.balance, 0);
  const equity = tb.accounts.filter((a) => a.code >= "3" && a.code < "4").reduce((s, a) => s + a.balance, 0);
  const profit = tb.accounts.filter((a) => a.code >= "4" && a.code < "5").reduce((s, a) => s + a.balance, 0) - tb.accounts.filter((a) => a.code >= "5").reduce((s, a) => s + a.balance, 0);
  check("balance sheet balances (assets = liabilities + equity + profit)", Math.abs(assets - liab - equity - profit) < 0.05, `${assets.toFixed(2)} vs ${(liab + equity + profit).toFixed(2)}`);
  check("roles without price access can't read the books", (await wh.call("GET", "/api/accounting/trial-balance")).status === 403);
  check("restricted roles get payables amounts masked", (await fullState(wh)).apDocuments.every((d) => d.amount === 0 && d.amountThb === 0));
  check("restricted roles get lot costs masked", (await fullState(wh)).inventory.every((i) => !i.unitCost));
  void stockQty;
}

// ── exchange rates ──
{
  const sales = await session("salesOfficer");
  check("sales staff can't set exchange rates", !(await sales.cmd("saveExchangeRate", { currency: "USD", effectiveDate: today, rate: 30 })).json.result.ok);
  const tax = await session("taxOfficer");
  check("tax officer sets a new rate", (await tax.cmd("saveExchangeRate", { currency: "CHF", effectiveDate: today, rate: 41.25 })).json.result.ok);
  check("bad currency code refused", !(await tax.cmd("saveExchangeRate", { currency: "francs", effectiveDate: today, rate: 41 })).json.result.ok);
  check("baht can't be given a rate", !(await tax.cmd("saveExchangeRate", { currency: "THB", effectiveDate: today, rate: 2 })).json.result.ok);
}

// ── guest access ──
{
  const opts = await (await fetch(`${BASE}/api/auth/options`)).json();
  check("guest access advertised in demo mode", opts.guestAccess === true);
  const users = await (await fetch(`${BASE}/api/users`)).json();
  check("guest account not in the sign-in list", !users.some((u) => u.role === "guest"));
  check("guest account can't be used with a password", (await session("guest", "")).status === 401 && (await session("guest", "!")).status === 401);
  const g = await fetch(`${BASE}/api/auth/guest`, { method: "POST" });
  const gCookie = (g.headers.get("set-cookie") ?? "").split(";")[0];
  const gCall = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { cookie: gCookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  check("continue as guest signs in", g.status === 200 && (await gCall("GET", "/api/auth/me")).json?.user.role === "guest");
  const gs = (await gCall("GET", "/api/state")).json;
  check("guest can read data", gs.products.length > 0 && gs.salesOrders.length > 0);
  check("guest gets masked prices", gs.products.every((p) => p.costPrice === 0) && gs.customers.every((c) => c.creditLimit === 0));
  const write = await gCall("POST", "/api/commands/updateDeliveryStatus", { args: ["SO-2026-3303", "delivered"] });
  check("guest can't change anything", write.status === 422 && /permitted/.test(write.json.result.error.en));
  const pay = await gCall("POST", "/api/commands/recordPayment", { args: ["CUS-0002", 1, "cash", ""] });
  check("guest can't record payments", pay.status === 422);
  check("guest can't switch to a staff user", (await gCall("POST", "/api/auth/switch", { key: "somchai" })).status === 403);
  check("guest can't reset demo data", (await gCall("POST", "/api/admin/reset")).status === 403);
}

// ── stock held for orders awaiting approval ──
{
  await sup.call("POST", "/api/admin/reset");
  const st0 = (await fullState(sup));
  const lot = st0.inventory.find((i) => i.lotBatch === "LOT-A2601-01");
  const sales = await session("salesOfficer");
  // 25% off is over the standard discount → this order waits for a supervisor, holding its units.
  const held = await sales.cmd("createSalesOrder", one("CUS-0005", lot.sku, lot.lotBatch, lot.quantityRemaining - 2, 4500, 25));
  check("over-discount order waits for approval", held.json.result.order?.approvalStatus === "pendingApproval");
  const next = await sales.cmd("createSalesOrder", one("CUS-0005", lot.sku, lot.lotBatch, 5, 4500));
  check("another order can't take units held for it", !next.json.result.ok && /held by orders awaiting approval/.test(next.json.result.error.en), next.json.result.error?.en);
  check("…but can take what's still free", (await sales.cmd("createSalesOrder", one("CUS-0005", lot.sku, lot.lotBatch, 2, 4500))).json.result.ok);
  const appr = await (await session("piyada")).cmd("approveSalesOrder", held.json.result.order.orderNo);
  check("the held order is approved against its own hold", appr.json.result.ok, appr.json.result.error?.en);
}

// ── costs on sales, tax invoice as issued, paying a chosen invoice ──
{
  await sup.call("POST", "/api/admin/reset");
  const sales = await session("salesOfficer");
  const st0 = (await fullState(sup));
  const lot = st0.inventory.find((i) => i.lotBatch === "LOT-A2607-01");
  const o = (await sales.cmd("createSalesOrder", one("CUS-0005", lot.sku, lot.lotBatch, 10, 2241))).json.result.order;
  check("sale line records its lot's landed cost", o.lines[0].unitCost === lot.unitCost);
  check("booked order keeps a copy of its tax invoice", o.invoice?.netValue === o.netValue && o.invoice.lines.length === 1);
  await sup.cmd("editSalesOrder", o.orderNo, [{ quantity: 8, unitPrice: 2241, discountPercent: 0 }]);
  const edited = (await fullState(sup)).salesOrders.find((x) => x.orderNo === o.orderNo);
  check("editing after invoicing leaves the issued invoice unchanged", edited.invoice.netValue === o.netValue && edited.netValue < o.netValue);

  const cust = st0.customers.find((c) => c.customerId === "CUS-0005");
  const pay = await sup.cmd("recordPayment", "CUS-0005", 1000, "transfer", "ALLOC-1", o.orderNo);
  check("payment can be applied to a chosen invoice", pay.json.result.ok && pay.json.state.arDocuments.find((d) => d.reference === "ALLOC-1")?.appliesTo === o.orderNo);
  check("…which must be that customer's", !(await sup.cmd("recordPayment", "CUS-0001", 10, "transfer", "X", o.orderNo)).json.result.ok);
  void cust;
}

// ── on-time delivery ──
{
  await sup.call("POST", "/api/admin/reset");
  const st0 = (await fullState(sup));
  const delivered = st0.salesOrders.filter((o) => o.deliveryStatus === "delivered" && !o.approvalStatus);
  const late = delivered.filter((o) => o.statusHistory.at(-1).at.slice(0, 10) > o.plannedDeliveryDate);
  check("demo data has deliveries on time and late, with dates to measure", delivered.length >= 3 && late.length === 1);
}

// ── sign-in lockout ──
{
  const mgr = await session("manager");
  const key = `t_${Date.now().toString(36)}lk`;
  await mgr.call("POST", "/api/admin/users", { key, role: "taxOfficer", name: { th: "ล็อก", en: "Lock test" }, password: "LockTest123" });
  const tries = [];
  for (let i = 0; i < 5; i++) tries.push((await session(key, "wrong-password")).status);
  check("five wrong passwords lock the account", tries.slice(0, 4).every((s) => s === 401) && tries[4] === 429, tries.join(","));
  check("while locked, even the right password is refused", (await session(key, "LockTest123")).status === 429);
  const listed = (await mgr.call("GET", "/api/admin/users")).json.users.find((u) => u.key === key);
  check("the users page shows it as locked", Boolean(listed.lockedUntil));
  check("manager unlocks it", (await mgr.call("PATCH", `/api/admin/users/${key}`, { unlock: true })).status === 200);
  check("…and the right password works again", (await session(key, "LockTest123")).status === 200);
  await mgr.call("PATCH", `/api/admin/users/${key}`, { active: false });
}

// ── paged history: audit log and stock ledger ──
{
  await sup.call("POST", "/api/admin/reset");
  const plain = (await sup.call("GET", "/api/state")).json;
  check("state no longer carries the whole stock ledger or audit log", !("stockMovements" in plain) && !("auditLog" in plain) && Array.isArray(plain.recentActivity) && plain.recentActivity.length <= 20);
  const page1 = (await sup.call("GET", "/api/audit?limit=5")).json;
  const page2 = (await sup.call("GET", "/api/audit?limit=5&offset=5")).json;
  check("audit log pages newest first", page1.rows.length === 5 && page1.total > 5 && page1.rows[0].timestamp >= page1.rows[4].timestamp && page2.rows[0].id !== page1.rows[0].id);
  const forOrder = (await sup.call("GET", "/api/audit?entityId=SO-2026-3301&limit=100")).json;
  check("audit log filters by record", forOrder.rows.length > 0 && forOrder.rows.every((e) => e.entityId === "SO-2026-3301"));
  const typed = (await sup.call("GET", "/api/audit?entityType=salesOrder&action=created&limit=500")).json;
  check("audit log filters by type and action", typed.rows.every((e) => e.entityType === "salesOrder" && e.action === "created"));
  check("audit search with wildcard characters is literal", (await sup.call("GET", "/api/audit?q=%25%25%25")).json.total === 0);
  const whAudit = (await wh.call("GET", "/api/audit?limit=5000")).json;
  check("audit text that quotes money is masked for restricted roles", whAudit.rows.filter((e) => e.sensitive).every((e) => /restricted/.test(e.summary.en)));
  const lot = (await sup.call("GET", "/api/stock-movements?lot=LOT-A2607-01&limit=500")).json;
  check("stock ledger filters by lot", lot.rows.length > 0 && lot.rows.every((m) => m.lotBatch === "LOT-A2607-01") && lot.total === lot.rows.length);
  const sales = (await sup.call("GET", "/api/stock-movements?type=sale&limit=3")).json;
  check("stock ledger pages and totals what matches", sales.rows.length <= 3 && sales.rows.every((m) => m.type === "sale") && sales.unitsOut > 0 && sales.unitsIn === 0);
  const monthly = (await sup.call("GET", "/api/stock-movements/monthly")).json;
  check("monthly stock flow comes back summarised", Array.isArray(monthly) && monthly.every((m) => /^\d{4}-\d{2}$/.test(m.month) && m.unitsIn >= 0 && m.unitsOut >= 0));
  check("bad filters are refused", (await sup.call("GET", "/api/stock-movements?limit=999999")).status === 400);
  check("the journal is served for roles with price access", Array.isArray((await sup.call("GET", "/api/accounting/journal")).json));
  check("…and refused for the rest", (await wh.call("GET", "/api/accounting/journal")).status === 403);
}

// ── expenses, withholding tax, manual journals, month-end close, bank reconciliation ──
{
  await sup.call("POST", "/api/admin/reset");
  const mgr = await session("manager");
  const tax = await session("taxOfficer");
  const journal = async () => (await mgr.call("GET", "/api/accounting/journal")).json;
  const tbOf = async () => {
    const tb = (await mgr.call("GET", "/api/accounting/trial-balance")).json;
    return { tb, bal: (c) => tb.accounts.find((a) => a.code === c).balance };
  };
  let s0 = (await fullState(mgr));
  check("seeded: three months of expenses, remittances, a bank statement", s0.expenses.length === 12 && s0.manualJournals.length === 4 && s0.bankLines.length > 5);
  check("seeded statement: auto-matched except a bank charge and an unexplained transfer", s0.bankLines.filter((l) => !l.matchedEntryId).length === 2, String(s0.bankLines.filter((l) => !l.matchedEntryId).length));
  check("opening bank balance comes from the company profile", s0.company.openingBank === 4000000 && s0.company.openingDate === "2026-04-30");

  // The books with expenses and manual entries still tie out.
  let { tb, bal } = await tbOf();
  check("books still balance with expenses and journals", tb.unbalancedEntries.length === 0);
  const withheld = s0.expenses.reduce((s, x) => s + x.whtAmount, 0);
  const remitted = s0.manualJournals.filter((j) => j.kind === "whtRemittance").reduce((s, j) => s + j.lines[0].debit, 0);
  check("withholding payable in the books = withheld − remitted", Math.abs(bal("2410") - (withheld - remitted)) < 0.01, `${bal("2410")} vs ${withheld - remitted}`);
  check("rent is booked to its expense account", Math.abs(bal("6200") - 3 * 85000) < 0.01);
  const entries = await journal();
  check("expense entries carry VAT and withholding", entries.filter((e) => e.source === "expense").length === 12 && entries.some((e) => e.source === "expense" && e.lines.some((l) => l.account === "2410")));

  // Opening balance from settings.
  const bank0 = bal("1110");
  check("only the company-profile role sets opening balances", !(await tax.cmd("setOpeningBalances", "2026-04-30", 4100000)).json.result.ok);
  check("opening bank balance can be changed", (await mgr.cmd("setOpeningBalances", "2026-04-30", 4100000)).json.result.ok);
  ({ bal } = await tbOf());
  check("…and the bank account moves with it", Math.abs(bal("1110") - bank0 - 100000) < 0.01);
  check("negative opening balance refused", !(await mgr.cmd("setOpeningBalances", "2026-04-30", -1)).json.result.ok);
  await mgr.cmd("setOpeningBalances", "2026-04-30", 4000000);

  // Expenses.
  const ex = await tax.cmd("recordExpense", {
    date: today, payee: "API Consulting Co., Ltd.", payeeTaxId: "0105545012345", payeeType: "company", account: "6600",
    description: "API test advisory", amount: 10000, vat: 700, whtRate: 3, method: "transfer", reference: "TT-API",
  });
  const exDoc = ex.json.state?.expenses.find((x) => x.reference === "TT-API");
  check("tax officer records an expense with withholding", ex.json.result.ok && exDoc?.whtAmount === 300 && exDoc?.paid === 10400, JSON.stringify(ex.json.result).slice(0, 120));
  check("warehouse staff can't record expenses", !(await wh.cmd("recordExpense", { date: today, payee: "x", payeeTaxId: "", payeeType: "company", account: "6900", description: "x", amount: 1, vat: 0, whtRate: 0, method: "cash", reference: "" })).json.result.ok);
  const badTax = await tax.cmd("recordExpense", { date: today, payee: "No ID", payeeTaxId: "123", payeeType: "individual", account: "6600", description: "x", amount: 1000, vat: 0, whtRate: 3, method: "cash", reference: "" });
  check("withholding needs the payee's valid tax ID", !badTax.json.result.ok && /tax ID/.test(badTax.json.result.error.en));
  check("an expense can't be dated in the future", !(await tax.cmd("recordExpense", { date: addDays(today, 3), payee: "x", payeeTaxId: "", payeeType: "company", account: "6900", description: "x", amount: 1, vat: 0, whtRate: 0, method: "cash", reference: "" })).json.result.ok);
  check("an odd withholding rate is refused", !(await tax.cmd("recordExpense", { date: today, payee: "x", payeeTaxId: "0105545012345", payeeType: "company", account: "6900", description: "x", amount: 100, vat: 0, whtRate: 4, method: "cash", reference: "" })).json.result.ok);
  check("VAT above 7% is refused", !(await tax.cmd("recordExpense", { date: today, payee: "x", payeeTaxId: "", payeeType: "company", account: "6900", description: "x", amount: 100, vat: 50, whtRate: 0, method: "cash", reference: "" })).json.result.ok);
  check("an expense must go to an expense account", !(await tax.cmd("recordExpense", { date: today, payee: "x", payeeTaxId: "", payeeType: "company", account: "1300", description: "x", amount: 100, vat: 0, whtRate: 0, method: "cash", reference: "" })).json.result.ok);

  // Remitting last month's withholding.
  const lastMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const owedLast = (await fullState(mgr)).expenses.filter((x) => x.date.startsWith(lastMonth)).reduce((s, x) => s + x.whtAmount, 0);
  const rem = await tax.cmd("remitWithholding", lastMonth, "RD-API-1");
  const remJv = rem.json.state?.manualJournals.find((j) => j.kind === "whtRemittance" && j.period === lastMonth);
  check("last month's withholding remitted", owedLast === 0 ? !rem.json.result.ok : rem.json.result.ok && Math.abs(remJv.lines[0].debit - owedLast) < 0.01, `${owedLast} ${JSON.stringify(rem.json.result).slice(0, 80)}`);
  check("…only once", !(await tax.cmd("remitWithholding", lastMonth, "RD-API-2")).json.result.ok);
  check("this month's withholding can't be remitted before the month ends", !(await tax.cmd("remitWithholding", today.slice(0, 7), "RD-API-3")).json.result.ok);

  // Manual journals.
  const cap = await mgr.cmd("postJournal", { date: today, memo: "Owner capital injection", lines: [{ account: "1110", debit: 50000, credit: 0 }, { account: "3200", debit: 0, credit: 50000 }] });
  const capNo = cap.json.result.entryNo;
  check("manager posts a balanced manual journal", cap.json.result.ok && /^JV-/.test(capNo), JSON.stringify(cap.json.result).slice(0, 100));
  check("unbalanced journals are refused", !(await mgr.cmd("postJournal", { date: today, memo: "x", lines: [{ account: "6900", debit: 10, credit: 0 }, { account: "1110", debit: 0, credit: 9 }] })).json.result.ok);
  const sys = await mgr.cmd("postJournal", { date: today, memo: "x", lines: [{ account: "1200", debit: 10, credit: 0 }, { account: "1110", debit: 0, credit: 10 }] });
  check("accounts driven by records can't be posted by hand", !sys.json.result.ok && /records only/.test(sys.json.result.error.en));
  check("a line can't have both a debit and a credit", !(await mgr.cmd("postJournal", { date: today, memo: "x", lines: [{ account: "6900", debit: 10, credit: 10 }, { account: "1110", debit: 0, credit: 0 }] })).json.result.ok);
  check("roles without the permission can't post journals", !(await tax.cmd("postJournal", { date: today, memo: "x", lines: [{ account: "6900", debit: 10, credit: 0 }, { account: "1110", debit: 0, credit: 10 }] })).json.result.ok);
  const rev = await mgr.cmd("reverseJournal", capNo, "Posted twice");
  check("a manual journal can be reversed", rev.json.result.ok && rev.json.state.manualJournals.some((j) => j.reverses === capNo));
  check("…only once", !(await mgr.cmd("reverseJournal", capNo, "again")).json.result.ok);
  check("a tax remittance can't be reversed", !(await mgr.cmd("reverseJournal", s0.manualJournals.find((j) => j.kind === "whtRemittance").entryNo, "x")).json.result.ok);
  ({ tb, bal } = await tbOf());
  check("capital in and reversed leaves owner's capital at zero", Math.abs(bal("3200")) < 0.01 && tb.unbalancedEntries.length === 0);

  // Month-end close.
  check("supervisor can't close the books (finance role only)", !(await sup.cmd("closePeriod", "2026-08-31")).json.result.ok);
  check("a close must be on a month end", !(await mgr.cmd("closePeriod", "2026-08-15")).json.result.ok);
  check("the current month can't be closed", !(await mgr.cmd("closePeriod", addDays(addDays(`${today.slice(0, 7)}-01`, 40).slice(0, 7) + "-01", -1))).json.result.ok);
  check("manager closes the books through August", (await mgr.cmd("closePeriod", "2026-08-31")).json.result.ok);
  const intoClosed = await tax.cmd("recordExpense", { date: "2026-08-20", payee: "Late bill", payeeTaxId: "", payeeType: "company", account: "6900", description: "x", amount: 100, vat: 0, whtRate: 0, method: "cash", reference: "" });
  check("nothing can be dated into a closed month", !intoClosed.json.result.ok && /closed through/.test(intoClosed.json.result.error.en));
  check("…journals included", !(await mgr.cmd("postJournal", { date: "2026-08-31", memo: "x", lines: [{ account: "6900", debit: 10, credit: 0 }, { account: "1110", debit: 0, credit: 10 }] })).json.result.ok);
  check("…while the open month still takes entries", (await mgr.cmd("postJournal", { date: "2026-09-01", memo: "September accrual", lines: [{ account: "6300", debit: 1200, credit: 0 }, { account: "2900", debit: 0, credit: 1200 }] })).json.result.ok);
  check("opening balances are fixed once a month is closed", !(await mgr.cmd("setOpeningBalances", "2026-04-30", 1)).json.result.ok);
  check("reopening needs a reason", !(await mgr.cmd("reopenPeriod", "  ")).json.result.ok);
  const reo = await mgr.cmd("reopenPeriod", "Late supplier bill");
  check("reopening steps back one month", reo.json.result.ok && reo.json.state.company.closedThrough === "2026-07-31");
  check("closing and reopening are on the audit trail", (await fullState(mgr)).auditLog.filter((e) => e.entityType === "period").length === 2);

  // Bank reconciliation.
  let s1 = (await fullState(mgr));
  const before = s1.bankLines.length;
  const dup = s1.bankLines.find((l) => l.matchedEntryId);
  const imp = await mgr.cmd("importBankLines", [
    { date: dup.date, description: dup.description, amount: dup.amount, reference: dup.reference },
    { date: today, description: "TT IN OWNER", amount: 50000, reference: "" },
  ]);
  check("a statement re-imported skips lines already there", imp.json.result.ok && imp.json.result.added === 1 && imp.json.result.skipped === 1, JSON.stringify(imp.json.result));
  check("new lines are matched automatically to the same amount in the books", imp.json.result.matched === 1);
  s1 = (await fullState(mgr));
  const charge = s1.bankLines.find((l) => l.description === "BANK CHARGE" && !l.matchedEntryId);
  const fee = await mgr.cmd("postJournal", { date: charge.date, memo: "Bank charge", lines: [{ account: "6900", debit: 350, credit: 0 }, { account: "1110", debit: 0, credit: 350 }], bankLineId: charge.id });
  check("a statement line can be explained with a journal, matched at once", fee.json.result.ok && fee.json.state.bankLines.find((l) => l.id === charge.id).matchedEntryId === fee.json.result.entryNo);
  const stray = s1.bankLines.find((l) => l.description.startsWith("TRANSFER IN RIVERSIDE"));
  // The reversal (−50,000) is in the books and unmatched; the stray line is +20,000.
  const revNo = s1.manualJournals.find((j) => j.reverses === capNo).entryNo;
  const wrong = await mgr.cmd("matchBankLine", stray.id, revNo);
  check("a line can't be matched to a different amount", !wrong.json.result.ok && /differ/.test(wrong.json.result.error.en));
  const matched = s1.bankLines.find((l) => l.matchedEntryId && l.id !== charge.id);
  check("…or to an entry another line already has", !(await mgr.cmd("matchBankLine", stray.id, matched.matchedEntryId)).json.result.ok);
  check("a matched line can be unmatched", (await mgr.cmd("unmatchBankLine", matched.id)).json.result.ok);
  check("…and matched again by hand", (await mgr.cmd("matchBankLine", matched.id, matched.matchedEntryId)).json.result.ok);
  check("a matched line can't be deleted", !(await mgr.cmd("deleteBankLine", matched.id)).json.result.ok);
  check("an unmatched line can be deleted", (await mgr.cmd("deleteBankLine", stray.id)).json.result.ok);
  check("roles without the permission can't reconcile", !(await tax.cmd("autoMatchBank")).json.result.ok);
  check("statement lines can't be in the future", !(await mgr.cmd("importBankLines", [{ date: addDays(today, 2), description: "x", amount: 1, reference: "" }])).json.result.ok);
  check("statement amounts can't be zero", !(await mgr.cmd("importBankLines", [{ date: today, description: "x", amount: 0, reference: "" }])).json.result.ok);
  check("statement line count after the session", (await fullState(mgr)).bankLines.length === before);

  // Masking.
  const whS = (await wh.call("GET", "/api/state")).json;
  check("restricted roles get expense, journal and bank amounts masked", whS.expenses.every((x) => x.amount === 0 && x.paid === 0) && whS.manualJournals.every((j) => j.lines.every((l) => l.debit === 0 && l.credit === 0)) && whS.bankLines.every((l) => l.amount === 0) && whS.company.openingBank === 0);

  // Everything still ties out.
  ({ tb, bal } = await tbOf());
  const s2 = (await fullState(mgr));
  check("books balance after all of it", tb.unbalancedEntries.length === 0);
  check("inventory, receivables, payables still reconcile",
    Math.abs(bal("1300") - s2.inventory.reduce((s, i) => s + i.quantityRemaining * i.unitCost, 0)) < 0.05 &&
    Math.abs(bal("1200") - s2.customers.reduce((s, c) => s + c.outstandingBalance, 0)) < 0.05);
  const w = s2.expenses.reduce((s, x) => s + x.whtAmount, 0) - s2.manualJournals.filter((j) => j.kind === "whtRemittance").reduce((s, j) => s + j.lines[0].debit, 0);
  check("withholding payable still = withheld − remitted", Math.abs(bal("2410") - w) < 0.01);
}

// ── quotations and purchase requests ──
{
  await sup.call("POST", "/api/admin/reset");
  const so = await session("salesOfficer");
  const off = await session("orderOfficer");
  let s0 = (await sup.call("GET", "/api/state")).json;
  check("seeded quotations and purchase requests", s0.quotations.length === 3 && s0.purchaseRequests.length === 2);

  const q = await so.cmd("createQuotation", { customerId: "CUS-0003", validUntil: addDays(today, 14), notes: "API", lines: [{ sku: "SKU-1007", quantity: 30, unitPrice: 790, discountPercent: 0 }] });
  const qNo = q.json.result.quoteNo;
  check("sales officer issues a quotation", q.json.result.ok && /^QT-/.test(qNo) && q.json.state.quotations.find((x) => x.quoteNo === qNo).netValue === 23700);
  check("warehouse staff can't issue quotations", !(await wh.cmd("createQuotation", { customerId: "CUS-0003", validUntil: today, notes: "", lines: [{ sku: "SKU-1007", quantity: 1, unitPrice: 790, discountPercent: 0 }] })).json.result.ok);
  check("valid-until can't be in the past", !(await so.cmd("createQuotation", { customerId: "CUS-0003", validUntil: addDays(today, -1), notes: "", lines: [{ sku: "SKU-1007", quantity: 1, unitPrice: 790, discountPercent: 0 }] })).json.result.ok);
  check("a quotation doesn't take stock", (await sup.call("GET", "/api/state")).json.products.find((p) => p.sku === "SKU-1007").stockAvailable === s0.products.find((p) => p.sku === "SKU-1007").stockAvailable);
  const conv = await so.cmd("convertQuotation", qNo, addDays(today, 2));
  const order = conv.json.result.order;
  check("an accepted quotation becomes a sales order at the quoted price", conv.json.result.ok && order.lines.reduce((s, l) => s + l.quantity, 0) === 30 && order.lines.every((l) => l.unitPrice === 790), JSON.stringify(conv.json.result).slice(0, 140));
  const lots = s0.inventory.filter((i) => i.sku === "SKU-1007" && i.quantityRemaining > 0).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
  check("…taking the oldest lot first", order.lines[0].lotBatch === lots[0].lotBatch);
  const qAfter = conv.json.state.quotations.find((x) => x.quoteNo === qNo);
  check("…and the quotation records it", qAfter.status === "accepted" && qAfter.salesOrderNo === order.orderNo);
  check("a quotation converts only once", !(await so.cmd("convertQuotation", qNo)).json.result.ok);
  const expired = await so.cmd("convertQuotation", "QT-2026-0002");
  check("an expired quotation can't be converted", !expired.json.result.ok && /expired/.test(expired.json.result.error.en));
  const big = await so.cmd("createQuotation", { customerId: "CUS-0003", validUntil: addDays(today, 7), notes: "", lines: [{ sku: "SKU-1011", quantity: 500, unitPrice: 4390, discountPercent: 0 }] });
  const short = await so.cmd("convertQuotation", big.json.result.quoteNo);
  check("converting fails clearly when stock is short", !short.json.result.ok && /short/.test(short.json.result.error.en));
  check("a customer can decline", (await so.cmd("declineQuotation", "QT-2026-0003", "Went elsewhere")).json.result.ok);
  check("restricted roles get quotation prices masked", (await wh.call("GET", "/api/state")).json.quotations.every((x) => x.netValue === 0 && x.lines.every((l) => l.unitPrice === 0)));

  // Purchase requests.
  const pr = await wh.cmd("createPurchaseRequest", { sku: "SKU-1007", quantity: 100, reason: "Running low", preferredSupplierId: "SUP-004" });
  const prNo = pr.json.result.requestNo;
  check("warehouse staff ask for stock", pr.json.result.ok && /^PR-/.test(prNo));
  check("one open request per product", !(await off.cmd("createPurchaseRequest", { sku: "SKU-1007", quantity: 5, reason: "x", preferredSupplierId: null })).json.result.ok);
  check("requesters can't approve", !(await wh.cmd("decidePurchaseRequest", prNo, true, "")).json.result.ok);
  const mine = await sup.cmd("createPurchaseRequest", { sku: "SKU-1002", quantity: 12, reason: "Supervisor's own", preferredSupplierId: null });
  check("nobody approves their own request", !(await sup.cmd("decidePurchaseRequest", mine.json.result.requestNo, true, "")).json.result.ok);
  check("rejecting needs a reason", !(await sup.cmd("decidePurchaseRequest", prNo, false, "")).json.result.ok);
  check("supervisor approves the request", (await sup.cmd("decidePurchaseRequest", prNo, true, "OK")).json.result.ok);
  check("a decided request can't be decided again", !(await sup.cmd("decidePurchaseRequest", prNo, false, "changed mind")).json.result.ok);
  const fromPr = await off.cmd("createImportOrder", {
    supplierId: "SUP-004", country: "sweden", incoterms: "FOB", orderDate: today, etaDate: "2099-01-01",
    intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1007", abv: 40, qty: 100, unitPrice: eurPrice }],
    logistics: { manufacturerRegNo: "", blAwbNumber: "", origin: "", destination: "", currency: "EUR", paymentTerms: "" }, importLicenseNo: null, purchaseRequestNo: prNo,
  });
  const prAfter = fromPr.json.state?.purchaseRequests.find((r) => r.requestNo === prNo);
  check("purchasing orders it — the request is marked ordered with the order number", fromPr.json.result.ok && prAfter.status === "ordered" && prAfter.importOrderNo === fromPr.json.result.order.orderNo);
  const again = await off.cmd("createImportOrder", {
    supplierId: "SUP-004", country: "sweden", incoterms: "FOB", orderDate: today, etaDate: "2099-01-01",
    intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1007", abv: 40, qty: 100, unitPrice: eurPrice }],
    logistics: { manufacturerRegNo: "", blAwbNumber: "", origin: "", destination: "", currency: "EUR", paymentTerms: "" }, importLicenseNo: null, purchaseRequestNo: prNo,
  });
  check("an ordered request can't be ordered twice", !again.json.result.ok);
  const pending = await off.cmd("createImportOrder", {
    supplierId: "SUP-001", country: "scotland", incoterms: "CIF", orderDate: today, etaDate: "2099-01-01",
    intakeMethod: { th: "x", en: "API test" }, lineItems: [{ sku: "SKU-1002", abv: 43, qty: 12, unitPrice: 20 }],
    logistics: { manufacturerRegNo: "", blAwbNumber: "", origin: "", destination: "", currency: "GBP", paymentTerms: "" }, importLicenseNo: null, purchaseRequestNo: mine.json.result.requestNo,
  });
  check("a request not yet approved can't be ordered", !pending.json.result.ok && /approved/.test(pending.json.result.error.en));
}

// ── credit hold, payment reminders, stock counts, emailing documents ──
{
  await sup.call("POST", "/api/admin/reset");
  const so = await session("salesOfficer");
  const s0 = (await sup.call("GET", "/api/state")).json;
  const lotOf = (sku) => s0.inventory.filter((i) => i.sku === sku && i.quantityRemaining > 0).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))[0];

  // Credit hold: CUS-0006 has a bill more than 60 days overdue (its license is renewed first, so that isn't why).
  check("license renewed for the credit-hold test", (await doc.cmd("updateLicense", "LIC-SELL-2206", { expiryDate: addDays(today, 365) })).json.result.ok);
  const v = lotOf("SKU-1007");
  const held = await so.cmd("createSalesOrder", one("CUS-0006", "SKU-1007", v.lotBatch, 1, 790, 0));
  check("a customer far behind on paying goes to approval (credit hold)", held.json.result.ok && held.json.result.order.approvalStatus === "pendingApproval" && /overdue/.test(held.json.result.order.approvalReason.en), JSON.stringify(held.json.result.order?.approvalReason));
  const fine = await so.cmd("createSalesOrder", one("CUS-0003", "SKU-1007", v.lotBatch, 1, 790, 0));
  check("…while customers within 60 days book as usual", fine.json.result.ok && !fine.json.result.order.approvalStatus, JSON.stringify(fine.json.result.order?.approvalReason));

  // Reminders.
  check("seeded with a reminder already sent", s0.arReminders.length === 1);
  const rem = await so.cmd("recordReminder", "CUS-0006", 2, "Second letter");
  const r = rem.json.state?.arReminders.find((x) => x.customerId === "CUS-0006" && x.level === 2);
  check("sales staff record a payment reminder with what was overdue", rem.json.result.ok && r.overdueAmount > 0);
  check("reminder levels are 1–3", !(await so.cmd("recordReminder", "CUS-0006", 4, "")).json.result.ok);
  check("warehouse staff can't send reminders", !(await wh.cmd("recordReminder", "CUS-0006", 1, "")).json.result.ok);
  const cleanCustomer = (await sup.call("GET", "/api/state")).json.customers.find((c) => c.outstandingBalance === 0);
  if (cleanCustomer) check("nobody is reminded about nothing", !(await so.cmd("recordReminder", cleanCustomer.customerId, 1, "")).json.result.ok);
  check("the reminder is on the customer's history", (await sup.call("GET", "/api/audit?entityId=CUS-0006&limit=50")).json.rows.some((e) => /reminder 2/.test(e.summary.en)));
  check("restricted roles get reminder amounts masked", (await wh.call("GET", "/api/state")).json.arReminders.every((x) => x.overdueAmount === 0));

  // Customer email.
  const prof = s0.customers.find((c) => c.customerId === "CUS-0003");
  check("seeded customers have an accounts email", /@/.test(prof.email ?? ""));
  const bad = await so.cmd("updateCustomerProfile", "CUS-0003", { name: prof.name, taxId: prof.taxId, branch: prof.branch, address: prof.address, email: "not-an-email" });
  check("a malformed customer email is refused", !bad.json.result.ok);
  const okMail = await so.cmd("updateCustomerProfile", "CUS-0003", { name: prof.name, taxId: prof.taxId, branch: prof.branch, address: prof.address, email: "ap@riverside.example.com" });
  check("customer email can be changed", okMail.json.result.ok && okMail.json.state.customers.find((c) => c.customerId === "CUS-0003").email === "ap@riverside.example.com");

  // Stock counts.
  const lotsA = s0.inventory.filter((i) => i.warehouse === "whA" && i.quantityRemaining > 0);
  check("only warehouse roles start counts", !(await so.cmd("startStockCount", "whA", "")).json.result.ok);
  const start = await wh.cmd("startStockCount", "whA", "API count");
  const countNo = start.json.result.countNo;
  const sc = start.json.state.stockCounts.find((c) => c.countNo === countNo);
  check("a count lists every lot in the warehouse at what the system holds", start.json.result.ok && sc.lines.length === lotsA.length && sc.lines.every((l) => l.counted === null));
  check("one count at a time per warehouse", !(await wh.cmd("startStockCount", "whA", "")).json.result.ok);
  check("counts must be whole numbers", !(await wh.cmd("enterStockCount", countNo, [{ lotBatch: sc.lines[0].lotBatch, counted: -1 }])).json.result.ok);
  check("a partial count can't be posted", !(await wh.cmd("postStockCount", countNo)).json.result.ok);
  // Everything matches except the first lot (2 missing) and the second (1 extra).
  const entered = sc.lines.map((l, i) => ({ lotBatch: l.lotBatch, counted: l.expected + (i === 0 ? -2 : i === 1 ? 1 : 0) }));
  check("counts are saved", (await wh.cmd("enterStockCount", countNo, entered)).json.result.ok);
  // A sale while counting: the difference is still against what the system said when counting began.
  const busy = sc.lines[2] ?? sc.lines[0];
  const sold = await so.cmd("createSalesOrder", one("CUS-0003", busy.sku, busy.lotBatch, 1, 99999, 0));
  const tbBefore = (await sup.call("GET", "/api/accounting/trial-balance")).json.accounts.find((a) => a.code === "5200").balance;
  const post = await wh.cmd("postStockCount", countNo);
  const after = post.json.state;
  const qty = (lot) => after.inventory.find((i) => i.lotBatch === lot).quantityRemaining;
  check("posting adjusts only the lots that differ, by the difference found",
    post.json.result.ok && qty(sc.lines[0].lotBatch) === sc.lines[0].expected - 2 - (busy === sc.lines[0] && sold.json.result.ok ? 1 : 0) && qty(sc.lines[1].lotBatch) === sc.lines[1].expected + 1,
    JSON.stringify(post.json.result).slice(0, 100));
  check("…a sale during the count isn't mistaken for a loss", busy === sc.lines[0] || qty(busy.lotBatch) === busy.expected - (sold.json.result.ok && !sold.json.result.order.approvalStatus ? 1 : 0));
  check("the count is marked posted", after.stockCounts.find((c) => c.countNo === countNo).status === "posted");
  check("a posted count can't be posted again", !(await wh.cmd("postStockCount", countNo)).json.result.ok);
  const tbAfter = (await sup.call("GET", "/api/accounting/trial-balance")).json;
  check("the net shortage posts to inventory adjustments in the books", tbAfter.accounts.find((a) => a.code === "5200").balance !== tbBefore && tbAfter.unbalancedEntries.length === 0);
  check("stock ledger still reconciles after a count", ledgerOk(await fullState(sup)));
  const c2 = await wh.cmd("startStockCount", "whA", "");
  check("a count can be cancelled", (await wh.cmd("cancelStockCount", c2.json.result.countNo)).json.result.ok);

  // Emailing a document (to the stack's catch-all mailbox).
  const status = (await sup.call("GET", "/api/email/status")).json;
  check("email is available in the demo stack", status.enabled === true);
  const page = "<!doctype html><html><head><style>p{color:red}</style></head><body><p>INV-TEST document</p></body></html>";
  const mail = { to: ["buyer@example.com"], subject: "Tax invoice INV-TEST", message: "Please find attached.", documentHtml: page, filename: "INV-TEST", entityType: "salesOrder", entityId: "SO-2026-3301", document: "tax invoice INV-TEST" };
  check("roles without price access can't email documents", (await wh.call("POST", "/api/email", mail)).status === 403);
  check("bad recipients are refused", (await sup.call("POST", "/api/email", { ...mail, to: ["nope"] })).status === 422);
  const sentMail = await sup.call("POST", "/api/email", mail);
  check("a document is emailed, as a PDF", sentMail.status === 200 && sentMail.json.result.ok && sentMail.json.attached === "pdf", sentMail.text.slice(0, 120));
  check("…and recorded on the order's history", (await sup.call("GET", "/api/audit?entityId=SO-2026-3301&limit=50")).json.rows.some((e) => /Emailed tax invoice INV-TEST to buyer@example.com/.test(e.summary.en)));
  try {
    const box = await (await fetch("http://localhost:8025/api/v1/messages")).json();
    const m = box.messages.find((x) => x.Subject === "Tax invoice INV-TEST");
    const full = m && (await (await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)).json());
    check(
      "…and it arrives with the PDF attached",
      Boolean(m) && m.To[0].Address === "buyer@example.com" && full?.Attachments?.[0]?.ContentType === "application/pdf" && full.Attachments[0].FileName === "INV-TEST.pdf",
      JSON.stringify(full?.Attachments?.map((a) => a.ContentType)),
    );
  } catch {
    check("the demo mailbox is reachable", false);
  }
}

// ── payment details, logo / signature / stamp ──
{
  await sup.call("POST", "/api/admin/reset");
  const mgr = await session("manager");
  const co = (await mgr.call("GET", "/api/state")).json.company;
  check("seeded company has bank details and a PromptPay ID", Boolean(co.bankAccountNo) && /^\d{13}$/.test(co.promptPayId));
  const base = { name: co.name, taxId: co.taxId, branch: co.branch, address: co.address, phone: co.phone, email: co.email };
  check("a malformed PromptPay ID is refused", !(await mgr.cmd("updateCompanyProfile", { ...base, promptPayId: "12345" })).json.result.ok);
  const mobile = await mgr.cmd("updateCompanyProfile", { ...base, promptPayId: "081-234-5678", bankAccountNo: "987-6-54321-0" });
  check("PromptPay can be a mobile number", mobile.json.result.ok && mobile.json.state.company.promptPayId === "0812345678" && mobile.json.state.company.bankAccountNo === "987-6-54321-0");
  check("bank details are optional in a profile update (left as they were)", (await mgr.cmd("updateCompanyProfile", base)).json.result.ok && (await mgr.call("GET", "/api/state")).json.company.bankAccountNo === "987-6-54321-0");

  // A 1×1 transparent PNG.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  check("only images are accepted", !(await mgr.cmd("setCompanyImage", "logo", "data:text/html;base64,PHNjcmlwdD4=")).json.result.ok);
  check("printing the signature needs a signature and a stamp first", !(await mgr.cmd("setPrintSignature", true)).json.result.ok);
  check("warehouse staff can't change the company's images", !(await wh.cmd("setCompanyImage", "logo", png)).json.result.ok);
  for (const kind of ["logo", "signature", "stamp"]) await mgr.cmd("setCompanyImage", kind, png);
  check("logo, signature and stamp are saved", (await mgr.call("GET", "/api/state")).json.company.signature === png);
  check("…then the signature can be switched on", (await mgr.cmd("setPrintSignature", true)).json.result.ok);
  const whCo = (await wh.call("GET", "/api/state")).json.company;
  check("roles without price access get the logo but never the signature or stamp", whCo.logo === png && whCo.signature === "" && whCo.stamp === "");
  check("removing an image works", (await mgr.cmd("setCompanyImage", "logo", "")).json.result.ok && (await mgr.call("GET", "/api/state")).json.company.logo === "");
  check("image changes are on the audit trail", (await mgr.call("GET", "/api/audit?entityType=company&limit=50")).json.rows.some((e) => /signature/.test(e.summary.en)));
}

// ── opening balances: receivables, stock and supplier bills from before the system ──
{
  await sup.call("POST", "/api/admin/reset");
  const mgr = await session("manager");
  const s0 = await fullState(mgr);
  const today = addDays(new Date().toISOString().slice(0, 10), 0);
  const cust = s0.customers.find((c) => c.customerId === "CUS-0001");
  const product = s0.products[0];
  const warehouse = s0.warehouses.find((w) => w.active);
  const supplier = s0.suppliers[0];
  check("only the company's set-up role adds opening balances", !(await wh.cmd("addOpeningReceivable", { customerId: "CUS-0001", reference: "OLD-1", date: addDays(today, -40), amount: 1000 })).json.result.ok);
  const ar = await mgr.cmd("addOpeningReceivable", { customerId: "CUS-0001", reference: "OLD-1", date: addDays(today, -40), dueDate: addDays(today, -10), amount: 1000 });
  check(
    "a customer's old invoice is brought forward",
    ar.json.result.ok && Math.abs(ar.json.state.customers.find((c) => c.customerId === "CUS-0001").outstandingBalance - (cust.outstandingBalance + 1000)) < 0.01,
    ar.json.result.error?.en,
  );
  check("…once only", !(await mgr.cmd("addOpeningReceivable", { customerId: "CUS-0001", reference: "OLD-1", date: addDays(today, -40), amount: 1000 })).json.result.ok);
  check("…not dated in the future", !(await mgr.cmd("addOpeningReceivable", { customerId: "CUS-0001", reference: "OLD-2", date: addDays(today, 3), amount: 1000 })).json.result.ok);
  check("…and it ages from its own due date", (await fullState(mgr)).arDocuments.some((d) => d.type === "openingBalance" && d.reference === "OLD-1" && d.dueDate === addDays(today, -10)));

  const stock = await mgr.cmd("addOpeningStock", { sku: product.sku, lotBatch: "OPEN-T-1", warehouse: warehouse.code, receivedDate: addDays(today, -60), quantity: 10, unitCost: 500 });
  check("a lot already on the shelf is brought in", stock.json.result.ok && stock.json.state.products.find((p) => p.sku === product.sku).stockAvailable === product.stockAvailable + 10, stock.json.result.error?.en);
  check("…a lot number only once", !(await mgr.cmd("addOpeningStock", { sku: product.sku, lotBatch: "OPEN-T-1", warehouse: warehouse.code, receivedDate: addDays(today, -60), quantity: 1 })).json.result.ok);
  check("…whole bottles only", !(await mgr.cmd("addOpeningStock", { sku: product.sku, lotBatch: "OPEN-T-2", warehouse: warehouse.code, receivedDate: addDays(today, -60), quantity: 1.5 })).json.result.ok);
  check("…into a warehouse that exists", !(await mgr.cmd("addOpeningStock", { sku: product.sku, lotBatch: "OPEN-T-3", warehouse: "nowhere", receivedDate: addDays(today, -60), quantity: 1 })).json.result.ok);

  const ap = await mgr.cmd("addOpeningPayable", { supplierId: supplier.supplierId, reference: "OLD-BILL-9", date: addDays(today, -20), currency: "usd", amount: 1000, rate: 35 });
  const bill = ap.json.state?.apDocuments.find((d) => d.reference === "OLD-BILL-9");
  check("an unpaid supplier bill is brought forward", ap.json.result.ok && bill?.importOrderNo === "" && bill.currency === "USD" && bill.amountThb === 35000, ap.json.result.error?.en);
  const paid = bill && (await mgr.cmd("recordSupplierPayment", bill.docNo, 400, 35, "transfer", "TT-OB"));
  check("…and paid like any other", paid?.json.result.ok, paid?.json.result.error?.en);

  const st = await fullState(mgr);
  const tb = (await mgr.call("GET", "/api/accounting/trial-balance")).json;
  const bal = (c) => tb.accounts.find((a) => a.code === c)?.balance ?? 0;
  check("the books still balance", tb.unbalancedEntries.length === 0);
  check("receivables in the books include what was brought forward", Math.abs(bal("1200") - st.customers.reduce((s, c) => s + c.outstandingBalance, 0)) < 0.05 && arReconciles(st));
  check("stock in the books includes the opening lot", Math.abs(bal("1300") - st.inventory.reduce((s, i) => s + i.quantityRemaining * i.unitCost, 0)) < 0.05);
  const apOpen = st.apDocuments
    .filter((d) => d.type === "invoice")
    .reduce((s, d) => s + (d.amount - st.apDocuments.filter((p) => p.appliesTo === d.docNo).reduce((x, p) => x + p.amount, 0)) * d.rate, 0);
  check("payables in the books include the bill brought forward", Math.abs(bal("2110") - apOpen) < 0.05, `${bal("2110")} vs ${apOpen.toFixed(2)}`);
  check("the stock ledger explains the opening lot", ledgerOk(st) && st.stockMovements.some((m) => m.lotBatch === "OPEN-T-1" && m.reference === "OPENING" && m.quantity === 10));

  const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
  const closed = await mgr.cmd("closePeriod", lastMonthEnd);
  check("closing a month…", closed.json.result.ok, closed.json.result.error?.en);
  check("…fixes the opening balances", !(await mgr.cmd("addOpeningReceivable", { customerId: "CUS-0001", reference: "OLD-3", date: addDays(today, -40), amount: 5 })).json.result.ok);
  await mgr.cmd("reopenPeriod", "test");
}

// ── two-step sign-in ──
{
  const { createHmac } = await import("node:crypto");
  const b32 = (text) => {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of text) {
      value = (value << 5) | A.indexOf(ch);
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  };
  const totp = (secret, at = Date.now()) => {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
    const mac = createHmac("sha1", b32(secret)).update(counter).digest();
    const o = mac[19] & 15;
    return String((((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1_000_000).padStart(6, "0");
  };
  const notThis = (code) => (code === "000000" ? "111111" : "000000");
  const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const mgr = await session("manager");
  const key = `t_${Date.now().toString(36)}2f`;
  await mgr.call("POST", "/api/admin/users", { key, role: "salesOfficer", name: { th: "ทดสอบ", en: "Two Step" }, password: "TempPass123" });
  const tmp = await session(key, "TempPass123");
  check("a temporary password must be replaced before setting up two-step sign-in", (await tmp.call("POST", "/api/auth/2fa/setup")).status === 403);
  await tmp.call("POST", "/api/auth/password", { current: "TempPass123", next: "MyOwnPass99" });
  const me = await session(key, "MyOwnPass99");
  const setup = await me.call("POST", "/api/auth/2fa/setup");
  const secret = setup.json?.secret ?? "";
  check("setup gives a secret and an authenticator link", /^[A-Z2-7]{32}$/.test(secret) && setup.json.uri.startsWith("otpauth://totp/") && setup.json.uri.includes(`secret=${secret}`));
  check("it isn't on until a code confirms it", (await me.call("GET", "/api/auth/me")).json.user.twoFactorEnabled === false);
  check("a wrong code doesn't turn it on", (await me.call("POST", "/api/auth/2fa/enable", { code: notThis(totp(secret)) })).status === 422);
  check("the right code turns it on", (await me.call("POST", "/api/auth/2fa/enable", { code: totp(secret) })).status === 200 && (await me.call("GET", "/api/auth/me")).json.user.twoFactorEnabled === true);

  const step1 = await post("/api/auth/login", { key, password: "MyOwnPass99" });
  const ticket = await step1.json();
  check("the password alone no longer signs in", step1.status === 200 && ticket.twoFactor === true && !ticket.user && !(step1.headers.get("set-cookie") ?? "").includes("lisd_session="));
  check("a wrong code is refused", (await post("/api/auth/2fa/verify", { challenge: ticket.challenge, code: notThis(totp(secret, Date.now() + 30000)) })).status === 401);
  check("the ticket can't be used as a session", (await fetch(`${BASE}/api/state`, { headers: { cookie: `lisd_session=${ticket.challenge}` } })).status === 401);
  check("a session can't be used as a ticket", (await post("/api/auth/2fa/verify", { challenge: me.cookie.replace("lisd_session=", ""), code: totp(secret, Date.now() + 30000) })).status === 410);
  check("a forged ticket is refused", (await post("/api/auth/2fa/verify", { challenge: ticket.challenge.replace(/.$/, (c) => (c === "A" ? "B" : "A")), code: totp(secret) })).status === 410);
  // The code that turned it on can't be used again, so take the next one (allowed for clock drift).
  const code = totp(secret, Date.now() + 30000);
  const ok = await post("/api/auth/2fa/verify", { challenge: ticket.challenge, code });
  const cookie = (ok.headers.get("set-cookie") ?? "").split(";")[0];
  check("password + code signs in", ok.status === 200 && cookie.startsWith("lisd_session="), String(ok.status));
  check("…and the session works", (await fetch(`${BASE}/api/state`, { headers: { cookie } })).status === 200);
  check("a code can't be used twice", (await post("/api/auth/2fa/verify", { challenge: ticket.challenge, code })).status === 401);
  check("the users list shows who has it on", (await mgr.call("GET", "/api/admin/users")).json.users.find((u) => u.key === key)?.twoFactorEnabled === true);
  check("turning it off needs the password", (await me.call("POST", "/api/auth/2fa/disable", { password: "wrong-one" })).status === 422);
  check("only a user manager can reset someone's", (await me.call("POST", "/api/admin/users/manager/2fa/reset")).status === 403);
  check("a lost phone: the manager resets it", (await mgr.call("POST", `/api/admin/users/${key}/2fa/reset`)).status === 200);
  check("…which signs the user out", (await fetch(`${BASE}/api/state`, { headers: { cookie } })).status === 401);
  const after = await session(key, "MyOwnPass99");
  check("…and the password alone works again", after.status === 200 && after.cookie.startsWith("lisd_session="));
  check("the changes are on the audit trail", (await fullState(mgr)).auditLog.filter((e) => e.entityType === "user" && e.entityId === key && /two-step/i.test(e.summary.en)).length >= 2);
  await mgr.call("PATCH", `/api/admin/users/${key}`, { active: false });
}

// ── morning summary email ──
{
  const mgr = await session("manager");
  const settings = (await mgr.call("GET", "/api/me/summary")).json;
  check("the morning email can be set up", settings.emailEnabled === true && typeof settings.hour === "number");
  check("a bad address is refused", (await mgr.call("POST", "/api/me/summary", { email: "not-an-address", dailySummary: true })).status === 422);
  check("turning it on needs an address", (await mgr.call("POST", "/api/me/summary", { email: "", dailySummary: true })).status === 422);
  const to = `digest-${Date.now()}@example.com`;
  check("address and daily summary saved", (await mgr.call("POST", "/api/me/summary", { email: to, dailySummary: true })).status === 200);
  check("…and read back", (await mgr.call("GET", "/api/me/summary")).json.email === to);
  const sent = await mgr.call("POST", "/api/me/summary/send");
  check("send me one now", sent.status === 200, sent.text.slice(0, 100));
  check("…not twice in a minute", (await mgr.call("POST", "/api/me/summary/send")).status === 429);
  try {
    const box = await (await fetch("http://localhost:8025/api/v1/messages")).json();
    const m = box.messages.find((x) => x.To?.[0]?.Address === to);
    const full = m && (await (await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)).json());
    check(
      "the summary arrives, listing what's waiting with links into the app",
      Boolean(m) && /Your day: \d+ item/.test(m.Subject) && /Good morning/.test(full.HTML) && /href="http:\/\/localhost:8080\/[a-z-]+/.test(full.HTML),
      m?.Subject,
    );
  } catch {
    check("the demo mailbox is reachable", false);
  }
  const guest = (await fetch(`${BASE}/api/auth/guest`, { method: "POST" })).headers.get("set-cookie")?.split(";")[0];
  if (guest)
    check(
      "guests can't set it up",
      (await fetch(`${BASE}/api/me/summary`, { method: "POST", headers: { cookie: guest, "content-type": "application/json" }, body: JSON.stringify({ email: "g@example.com", dailySummary: true }) })).status === 403,
    );
  await mgr.call("POST", "/api/me/summary", { email: "", dailySummary: false });
}

// ── user management ──
{
  const mgr = await session("manager");
  const supv = await session("somchai");
  const salesU = await session("salesOfficer");
  const list = await mgr.call("GET", "/api/admin/users");
  check("senior manager sees the user list and may manage it", list.status === 200 && list.json.canManage === true && list.json.users.some((u) => u.key === "somchai"));
  check("user list never includes password hashes", !JSON.stringify(list.json).includes("scrypt$"));
  const supList = await supv.call("GET", "/api/admin/users");
  check("supervisor can view users but not manage them", supList.status === 200 && supList.json.canManage === false);
  check("supervisor can't create users", (await supv.call("POST", "/api/admin/users", { key: "x1", role: "salesOfficer", name: { th: "a", en: "b" }, password: "Password1" })).status === 403);
  check("other roles can't see the user list", (await salesU.call("GET", "/api/admin/users")).status === 403);

  const key = `t_${Date.now().toString(36)}`;
  const created = await mgr.call("POST", "/api/admin/users", { key, role: "taxOfficer", name: { th: "ทดสอบ (เจ้าหน้าที่ภาษี)", en: "Test (Tax Officer)" }, password: "TempPass123" });
  check("manager creates a user", created.status === 200 && created.json.user.mustChangePassword === true, created.text.slice(0, 120));
  check("duplicate username refused", (await mgr.call("POST", "/api/admin/users", { key, role: "taxOfficer", name: { th: "a", en: "b" }, password: "TempPass123" })).status === 409);
  check("short password refused", (await mgr.call("POST", "/api/admin/users", { key: `${key}b`, role: "taxOfficer", name: { th: "a", en: "b" }, password: "short" })).status === 422);

  const nu = await session(key, "TempPass123");
  check("new user signs in with the temporary password", nu.status === 200);
  check("…and is told to change it", (await nu.call("GET", "/api/auth/me")).json.user.mustChangePassword === true);
  const blocked = await nu.call("GET", "/api/state");
  check("nothing else works until it's changed", blocked.status === 403 && blocked.json.passwordChangeRequired === true);
  check("wrong current password refused", (await nu.call("POST", "/api/auth/password", { current: "nope-nope", next: "MyOwnPass99" })).status === 422);
  check("same password as before refused", (await nu.call("POST", "/api/auth/password", { current: "TempPass123", next: "TempPass123" })).status === 422);
  const changed = await nu.call("POST", "/api/auth/password", { current: "TempPass123", next: "MyOwnPass99" });
  check("user sets their own password", changed.status === 200);
  // The changing session gets a fresh cookie; use it from here on.
  const nu2 = await session(key, "MyOwnPass99");
  check("…and can now use the app", (await nu2.call("GET", "/api/state")).status === 200);
  check("…and their old session was signed out", (await nu.call("GET", "/api/state")).status === 401);
  check("new user appears in the sign-in list", (await (await fetch(`${BASE}/api/users`)).json()).some((u) => u.key === key));

  const role = await mgr.call("PATCH", `/api/admin/users/${key}`, { role: "warehouseOfficer" });
  check("manager changes a user's role", role.status === 200 && role.json.user.role === "warehouseOfficer");
  check("the new role applies at once", (await nu2.call("GET", "/api/auth/me")).json.user.role === "warehouseOfficer");

  const dis = await mgr.call("PATCH", `/api/admin/users/${key}`, { active: false });
  check("manager disables a user", dis.status === 200 && dis.json.user.active === false);
  check("a disabled user is signed out at once", (await nu2.call("GET", "/api/state")).status === 401);
  check("a disabled user can't sign in", (await session(key, "MyOwnPass99")).status === 401);
  check("a disabled user leaves the sign-in list", !(await (await fetch(`${BASE}/api/users`)).json()).some((u) => u.key === key));
  check("demo switch can't use a disabled account", (await mgr.call("POST", "/api/auth/switch", { key })).status === 404);

  await mgr.call("PATCH", `/api/admin/users/${key}`, { active: true });
  const reset = await mgr.call("POST", `/api/admin/users/${key}/password`, { password: "Reset12345" });
  check("manager resets a password to a temporary one", reset.status === 200 && reset.json.user.mustChangePassword === true);
  check("…the old password stops working", (await session(key, "MyOwnPass99")).status === 401);

  check("manager can't disable their own account", (await mgr.call("PATCH", "/api/admin/users/manager", { active: false })).status === 422);
  check("manager can't change their own role", (await mgr.call("PATCH", "/api/admin/users/manager", { role: "salesOfficer" })).status === 422);
  check("manager can't admin-reset their own password", (await mgr.call("POST", "/api/admin/users/manager/password", { password: "Whatever123" })).status === 422);
  check("guest account can't be edited", (await mgr.call("PATCH", "/api/admin/users/guest", { active: false })).status === 404);

  const audit = (await fullState(mgr)).auditLog.filter((e) => e.entityType === "user" && e.entityId === key);
  check("every user change is in the audit trail", audit.length >= 5 && audit.every((e) => !/TempPass|Reset1234|MyOwnPass/.test(JSON.stringify(e))), String(audit.length));
  await mgr.call("PATCH", `/api/admin/users/${key}`, { active: false });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
