/** The demo dataset as a Store — the server seeds the database from this on first start. */
import { products as initialProducts } from "../data/products";
import { importOrders as initialImportOrders } from "../data/importOrders";
import { licenses as initialLicenses } from "../data/licenses";
import { customers as initialCustomers } from "../data/customers";
import { salesOrders as initialSalesOrders } from "../data/salesOrders";
import { inventory as initialInventory } from "../data/inventory";
import { suppliers as initialSuppliers } from "../data/suppliers";
import { warehouses as initialWarehouses } from "../data/warehouses";
import { priceLists as initialPriceLists } from "../data/priceLists";
import { taxSettings as initialTaxSettings } from "../data/taxSettings";
import { reorderPolicies as initialReorderPolicies } from "../data/reorderPolicies";
import { company as initialCompany } from "../data/company";
import { exchangeRates as initialExchangeRates } from "../data/exchangeRates";
import {
  SALES_OFFICER_ACTOR,
  ORDER_OFFICER_ACTOR,
  WAREHOUSE_OFFICER_ACTOR,
  DISTRIBUTION_OFFICER_ACTOR,
  DOC_OFFICER_ACTOR,
} from "../data/approvers";
import type {
  ApDocument,
  ArDocument,
  AuditEntry,
  BankLine,
  Bilingual,
  Expense,
  ImportOrder,
  InventoryItem,
  ManualJournal,
  Product,
  PurchaseRequest,
  Quotation,
  SalesOrder,
  StatusEvent,
  StockMovement,
} from "../data/types";
import { buildJournal } from "./ledger";
import { suggestMatches } from "./finance";
import { addDays, computeProductStatus, isBookedSale, isReversedSale, rateOn, todayIso } from "../lib/business";
import { makeId, type Store } from "./store";

function buildSeedAuditLog(): AuditEntry[] {
  const entries: AuditEntry[] = [];

  for (const o of initialImportOrders) {
    entries.push({
      id: makeId(),
      timestamp: `${o.orderDate}T09:15:00`,
      entityType: "importOrder",
      entityId: o.orderNo,
      action: "created",
      actor: ORDER_OFFICER_ACTOR,
      summary: { th: `นำเข้าออเดอร์จาก ${o.supplier}`, en: `Order intake from ${o.supplier}` },
    });
    if (o.approver) {
      entries.push({
        id: makeId(),
        timestamp: `${addDays(o.orderDate, 2)}T14:00:00`,
        entityType: "importOrder",
        entityId: o.orderNo,
        action: "approved",
        actor: o.approver,
        summary: { th: "อนุมัติออเดอร์นำเข้า", en: "Approved import order" },
      });
    }
  }

  for (const o of initialSalesOrders) {
    entries.push({
      id: makeId(),
      timestamp: `${o.orderDate}T11:00:00`,
      entityType: "salesOrder",
      entityId: o.orderNo,
      action: "created",
      actor: SALES_OFFICER_ACTOR,
      summary: {
        th: `สร้างออเดอร์ขาย ${o.lines.map((l) => `${l.sku} × ${l.quantity}`).join(", ")}`,
        en: `Created sales order: ${o.lines.map((l) => `${l.sku} × ${l.quantity}`).join(", ")}`,
      },
    });
    if (o.approver) {
      entries.push({
        id: makeId(),
        timestamp: `${o.orderDate}T15:30:00`,
        entityType: "salesOrder",
        entityId: o.orderNo,
        action: "approved",
        actor: o.approver,
        sensitive: true,
        summary: {
          th: `อนุมัติส่วนลด ${Math.max(...o.lines.map((l) => l.discountPercent))}%`,
          en: `Approved discount ${Math.max(...o.lines.map((l) => l.discountPercent))}%`,
        },
      });
    }
  }

  return entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/**
 * Opening stock ledger consistent with the seed data: each lot's receipt is its current quantity plus
 * what the seed sales took from it (net of returns), so every lot's movements sum to its quantity on hand.
 */
function buildSeedStockMovements(): StockMovement[] {
  const movements: StockMovement[] = [];
  const booked = initialSalesOrders.filter((o) => !o.approvalStatus);
  for (const lot of initialInventory) {
    // Every booked line that drew on this lot.
    const sales = booked.flatMap((o) => o.lines.filter((l) => l.lotBatch === lot.lotBatch).map((l) => ({ order: o, line: l })));
    const sold = sales.reduce((sum, x) => sum + x.line.quantity, 0);
    const returned = sales.filter((x) => x.order.deliveryStatus === "returned").reduce((sum, x) => sum + x.line.quantity, 0);
    movements.push({
      id: makeId(),
      timestamp: `${lot.receivedDate}T08:00:00`,
      type: "receipt",
      sku: lot.sku,
      lotBatch: lot.lotBatch,
      warehouse: lot.warehouse,
      quantity: lot.quantityRemaining + sold - returned,
      reference: initialImportOrders.find((o) => o.receiving?.lines.some((l) => l.lotBatch === lot.lotBatch))?.orderNo ?? "Opening balance",
      actor: WAREHOUSE_OFFICER_ACTOR,
    });
    for (const { order: o, line: l } of sales) {
      movements.push({
        id: makeId(),
        timestamp: `${o.orderDate}T11:00:00`,
        type: "sale",
        sku: l.sku,
        lotBatch: l.lotBatch,
        warehouse: lot.warehouse,
        quantity: -l.quantity,
        reference: o.orderNo,
        actor: SALES_OFFICER_ACTOR,
      });
      if (o.deliveryStatus === "returned")
        movements.push({
          id: makeId(),
          timestamp: `${addDays(o.orderDate, 3)}T10:00:00`,
          type: "return",
          sku: l.sku,
          lotBatch: l.lotBatch,
          warehouse: lot.warehouse,
          quantity: l.quantity,
          reference: o.orderNo,
          actor: WAREHOUSE_OFFICER_ACTOR,
        });
    }
  }
  return movements.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}



/**
 * A product's available stock is the sum of its lots — the lots are what can actually be picked and
 * traced. (The source Products sheet hadn't deducted the sales already taken from those lots.)
 * Every later stock change moves the lot and the product together, so this stays true.
 */
function seedProducts(): Product[] {
  return initialProducts.map((p) => {
    const stockAvailable = initialInventory.filter((i) => i.sku === p.sku).reduce((sum, i) => sum + i.quantityRemaining, 0);
    return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
  });
}

export function seedState(): Store {
  return {
    products: seedProducts(),
    importOrders: initialImportOrders.map(withImportHistory),
    licenses: initialLicenses,
    // Accounts contacts (example.com never delivers; the demo mailbox catches everything anyway).
    customers: initialCustomers.map((c) => ({ ...c, email: `accounts.${c.customerId.toLowerCase()}@example.com` })),
    salesOrders: initialSalesOrders.map(withSalesHistory).map(withCosts),
    inventory: seedInventory(),
    auditLog: buildSeedAuditLog(),
    suppliers: initialSuppliers,
    warehouses: initialWarehouses,
    priceLists: initialPriceLists,
    taxSettings: initialTaxSettings,
    reorderPolicies: initialReorderPolicies,
    stockMovements: buildSeedStockMovements(),
    arDocuments: [...buildOpeningBalances(), ...seedCreditNotes()],
    company: initialCompany,
    exchangeRates: initialExchangeRates,
    apDocuments: buildSeedPayables(),
    expenses: seedExpenses(),
    manualJournals: seedJournals(),
    bankLines: [],
    quotations: seedQuotations(),
    purchaseRequests: seedPurchaseRequests(),
    stockCounts: [],
    arReminders: [
      {
        id: "rem-seed-1",
        customerId: "CUS-0006",
        date: addDays(todayIso(), -10),
        level: 1,
        overdueAmount: 0,
        note: "โทรแจ้งฝ่ายบัญชีลูกค้าแล้ว / Called their accounts team",
        actor: SALES_OFFICER_ACTOR,
      },
    ],
  };
}

/** The demo store plus a September bank statement to reconcile (built from the books it should match). */
export function seedStateWithStatement(): Store {
  const s = seedState();
  const lines = seedBankStatement(s);
  // Imported and auto-matched already; what's left over is what the bookkeeper has to look into.
  const matches = suggestMatches(lines, buildJournal(s));
  return { ...s, bankLines: lines.map((l) => (matches.has(l.id) ? { ...l, matchedEntryId: matches.get(l.id) } : l)) };
}

/**
 * The demo lots were on hand before the system started (none trace to a receipt recorded here), so each
 * is carried at its product's cost price: the all-in landed cost a shipment of it typically comes to.
 */
function seedInventory(): InventoryItem[] {
  return initialInventory.map((lot) => ({ ...lot, unitCost: initialProducts.find((p) => p.sku === lot.sku)!.costPrice }));
}

/** Each line carries the landed cost of its lot; a booked order keeps a copy of its invoice as issued. */
function withCosts(o: SalesOrder): SalesOrder {
  const lots = seedInventory();
  const lines = o.lines.map((l) => ({ ...l, unitCost: lots.find((i) => i.lotBatch === l.lotBatch)?.unitCost }));
  return {
    ...o,
    lines,
    ...(isBookedSale(o) ? { invoice: { lines, netValue: o.netValue, vatPercent: o.vatPercent ?? initialTaxSettings.vatPercent } } : {}),
  };
}

/**
 * Supplier invoices for the three shipments already received, on their suppliers' terms: the L/C one paid on
 * receipt, a 30-day one paid on its due date (at that day's rate — hence a small exchange difference), and a
 * 45-day one half paid and now overdue, so payables aging has something real to show.
 */
function buildSeedPayables(): ApDocument[] {
  const docs: ApDocument[] = [];
  const plan: { orderNo: string; paid: "full" | "half" | "none"; payOn: "receipt" | "due" }[] = [
    { orderNo: "IMP-2026-0148", paid: "full", payOn: "receipt" },
    { orderNo: "IMP-2026-0147", paid: "full", payOn: "due" },
    { orderNo: "IMP-2026-0146", paid: "half", payOn: "due" },
  ];
  plan.forEach((p, i) => {
    const order = initialImportOrders.find((o) => o.orderNo === p.orderNo)!;
    const supplier = initialSuppliers.find((sp) => sp.supplierId === order.supplierId)!;
    const currency = order.currency ?? "THB";
    const rate = order.exchangeRate ?? 1;
    const amount = Math.round((order.lineItems ?? []).reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * 100) / 100;
    const date = addDays(order.etaDate, 2);
    const invoiceNo = `AP-2026-${String(i + 1).padStart(4, "0")}`;
    const dueDate = addDays(date, supplier.paymentTermDays);
    docs.push({
      docNo: invoiceNo,
      type: "invoice",
      supplierId: supplier.supplierId,
      importOrderNo: order.orderNo,
      reference: `${supplier.supplierId.replace("SUP-", "INV")}-${order.orderNo.slice(-4)}`,
      date,
      dueDate,
      currency,
      amount,
      rate,
      amountThb: Math.round(amount * rate * 100) / 100,
      actor: ORDER_OFFICER_ACTOR,
    });
    if (p.paid === "none") return;
    const payDate = p.payOn === "receipt" ? date : dueDate;
    const payRate = rateOn(initialExchangeRates, currency, payDate) ?? rate;
    const paid = p.paid === "full" ? amount : Math.round((amount / 2) * 100) / 100;
    docs.push({
      docNo: `PV-2026-${String(docs.filter((d) => d.type === "payment").length + 1).padStart(4, "0")}`,
      type: "payment",
      supplierId: supplier.supplierId,
      importOrderNo: order.orderNo,
      reference: `TT-${payDate.replaceAll("-", "")}`,
      date: payDate,
      currency,
      amount: paid,
      rate: payRate,
      amountThb: Math.round(paid * payRate * 100) / 100,
      appliesTo: invoiceNo,
      method: "transfer",
      actor: ORDER_OFFICER_ACTOR,
    });
  });
  return docs;
}


/**
 * Receivables brought forward. The source sheet gives each customer's outstanding balance but only a few
 * of the invoices behind it; the rest is carried as legacy invoices from the previous system, each with
 * its own date and a due date on the customer's terms — so every baht owed has a due date to age.
 * They're dated relative to when the demo data is (re)set, so the aging report always shows a realistic
 * mix (mostly current, some a little late) rather than everything drifting past due over time.
 */
function buildOpeningBalances(): ArDocument[] {
  const today = todayIso();
  // Share of each customer's brought-forward balance, and how many days before today it was invoiced.
  const spread = (terms: number) => [
    { share: 0.55, daysAgo: Math.round(terms * 0.4) },
    { share: 0.3, daysAgo: terms + 18 },
    { share: 0.15, daysAgo: terms + 42 },
  ];
  const docs: ArDocument[] = [];
  for (const c of initialCustomers) {
    const invoiced = initialSalesOrders
      .filter((o) => o.customerId === c.customerId && isBookedSale(o) && !isReversedSale(o))
      .reduce((sum, o) => sum + o.netValue, 0);
    const total = Math.round((c.outstandingBalance - invoiced) * 100) / 100;
    if (total <= 0) continue;
    // CUS-0006 (already over its limit) has one bill long unpaid, so it's on credit hold in the demo.
    const parts = spread(c.creditTermDays).map((p, i, all) => (c.customerId === "CUS-0006" && i === all.length - 1 ? { ...p, daysAgo: c.creditTermDays + 75 } : p));
    let left = total;
    parts.forEach((p, i) => {
      // The last part takes the remainder so the parts add up to the balance to the satang.
      const amount = i === parts.length - 1 ? Math.round(left * 100) / 100 : Math.round(total * p.share * 100) / 100;
      left -= amount;
      if (amount <= 0) return;
      const date = addDays(today, -p.daysAgo);
      docs.push({
        docNo: `OB-2026-${String(docs.length + 1).padStart(4, "0")}`,
        type: "openingBalance",
        customerId: c.customerId,
        date,
        dueDate: addDays(date, c.creditTermDays),
        amount,
        reference: "Legacy invoice brought forward",
        actor: SALES_OFFICER_ACTOR,
      });
    });
  }
  return docs;
}

const ev = (status: string, date: string, time: string, actor: Bilingual): StatusEvent => ({ status, at: `${date}T${time}:00`, actor });

/** The path each demo sales order took to reach its current stage, on dates consistent with its stock movements. */
function withSalesHistory(o: SalesOrder): SalesOrder {
  const d = o.orderDate;
  const h: StatusEvent[] = [];
  if (o.approver) {
    h.push(ev("pendingApproval", d, "10:00", SALES_OFFICER_ACTOR), ev("pendingShipment", d, "14:30", o.approver));
  } else if (o.approvalStatus) {
    h.push(ev(o.approvalStatus === "rejected" ? "pendingApproval" : o.approvalStatus, d, "10:00", SALES_OFFICER_ACTOR));
    if (o.approvalStatus === "rejected") h.push(ev("rejected", addDays(d, 1), "09:30", SALES_OFFICER_ACTOR));
  } else {
    h.push(ev("pendingShipment", d, "10:00", SALES_OFFICER_ACTOR));
  }
  if (!o.approvalStatus && o.deliveryStatus !== "pendingShipment") {
    h.push(ev("inDelivery", addDays(d, 1), "08:30", DISTRIBUTION_OFFICER_ACTOR));
    // One demo delivery ran two days past its promised date, so the on-time rate has something to show.
    if (o.deliveryStatus === "delivered") h.push(ev("delivered", addDays(d, o.orderNo === "SO-2026-3302" ? 4 : 2), "15:10", DISTRIBUTION_OFFICER_ACTOR));
    if (o.deliveryStatus === "returned") h.push(ev("returned", addDays(d, 3), "10:00", WAREHOUSE_OFFICER_ACTOR));
    if (o.deliveryStatus === "damaged") h.push(ev("damaged", addDays(d, 2), "16:40", DISTRIBUTION_OFFICER_ACTOR));
  }
  return { ...o, statusHistory: h, plannedDeliveryDate: addDays(d, 2) };
}

/** The path each demo import order took: raised, approved, cleared at its ETA, received on its receipt date. */
function withImportHistory(o: ImportOrder): ImportOrder {
  const d = o.orderDate;
  const h: StatusEvent[] = [ev("staging", d, "09:15", ORDER_OFFICER_ACTOR)];
  if (o.status === "pendingApproval") h.push(ev("pendingApproval", addDays(d, 1), "11:00", ORDER_OFFICER_ACTOR));
  if (o.status === "issueDetected") h.push(ev("issueDetected", d, "09:16", ORDER_OFFICER_ACTOR));
  if (o.status === "rejected") h.push(ev("rejected", addDays(d, 1), "15:00", o.approver ?? ORDER_OFFICER_ACTOR));
  if (o.approver && ["approved", "customsCleared", "receivedWarehouse"].includes(o.status)) {
    h.push(ev("approved", addDays(d, 1), "14:00", o.approver));
    if (o.status !== "approved") h.push(ev("customsCleared", o.etaDate, "13:20", DOC_OFFICER_ACTOR));
    if (o.status === "receivedWarehouse") h.push(ev("receivedWarehouse", o.receiving?.receivedDate ?? addDays(o.etaDate, 2), "10:30", WAREHOUSE_OFFICER_ACTOR));
  }
  return { ...o, statusHistory: h };
}

/**
 * The demo's returned and damaged orders were credited back to the customer — the credit notes that did it,
 * dated when the goods came back (or were written off), so the books show those sales reversed.
 */
function seedCreditNotes(): ArDocument[] {
  return initialSalesOrders
    .map(withSalesHistory)
    .filter((o) => isBookedSale(o) && isReversedSale(o))
    .map((o, i): ArDocument => {
      const at = o.statusHistory?.at(-1)?.at?.slice(0, 10) ?? o.orderDate;
      return {
        docNo: `CN-2026-${String(i + 1).padStart(4, "0")}`,
        type: "creditNote",
        customerId: o.customerId,
        date: at,
        amount: o.netValue,
        reference: o.orderNo,
        actor: SALES_OFFICER_ACTOR,
        originalValue: o.netValue,
        reason: o.deliveryStatus === "returned" ? { th: "ลูกค้าคืนสินค้า", en: "Goods returned by the customer" } : { th: "สินค้าเสียหายระหว่างจัดส่ง", en: "Goods damaged in delivery" },
      };
    });
}

const TAX_OFFICER_ACTOR: Bilingual = { th: "พิมพ์ชนก รัตนกุล (เจ้าหน้าที่ภาษี)", en: "Pimchanok Rattanakul (Tax Officer)" };
const MANAGER_ACTOR: Bilingual = { th: "อรุณี ทรัพย์เจริญ (ผู้บริหาร)", en: "Arunee Sapcharoen (Senior Manager)" };
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Three months of running costs with the withholding Thai law asks for: rent 5% (no VAT on building rent),
 * transport 1%, professional services 3%; electricity has VAT but no withholding.
 */
function seedExpenses(): Expense[] {
  const months = ["2026-07", "2026-08", "2026-09"];
  const plan: Omit<Expense, "docNo" | "date" | "vat" | "whtAmount" | "paid" | "reference" | "actor">[] = [
    { payee: "บริษัท สาทร พร็อพเพอร์ตี้ จำกัด", payeeTaxId: "0105545012345", payeeType: "company", account: "6200", description: "ค่าเช่าคลังสินค้าและสำนักงาน / Warehouse & office rent", amount: 85000, whtRate: 5, method: "transfer" },
    { payee: "บริษัท ด่วนไว โลจิสติกส์ จำกัด", payeeTaxId: "0105551023451", payeeType: "company", account: "6400", description: "ค่าขนส่งสินค้าถึงลูกค้า / Delivery to customers", amount: 18000, whtRate: 1, method: "transfer" },
    { payee: "สำนักงานบัญชี ตรงเวลา", payeeTaxId: "3101200345677", payeeType: "individual", account: "6600", description: "ค่าทำบัญชี / Bookkeeping fee", amount: 15000, whtRate: 3, method: "transfer" },
    { payee: "การไฟฟ้านครหลวง", payeeTaxId: "0994000165510", payeeType: "company", account: "6300", description: "ค่าไฟฟ้า / Electricity", amount: 9800, whtRate: 0, method: "transfer" },
  ];
  const out: Expense[] = [];
  months.forEach((m) => {
    plan.forEach((x, i) => {
      const vat = x.account === "6200" ? 0 : r2(x.amount * 0.07);
      const whtAmount = r2((x.amount * x.whtRate) / 100);
      out.push({
        ...x,
        docNo: `EX-2026-${String(out.length + 1).padStart(4, "0")}`,
        date: `${m}-${String(5 + i * 5).padStart(2, "0")}`,
        vat,
        whtAmount,
        paid: r2(x.amount + vat - whtAmount),
        reference: `TT-${m.replace("-", "")}${String(5 + i * 5).padStart(2, "0")}`,
        actor: TAX_OFFICER_ACTOR,
      });
    });
  });
  return out;
}

/** Withholding for July and August remitted by the 7th of the next month; monthly bank charges. */
function seedJournals(): ManualJournal[] {
  const exp = seedExpenses();
  const withheld = (m: string) => r2(exp.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + e.whtAmount, 0));
  const out: ManualJournal[] = [];
  for (const [m, paidOn] of [["2026-07", "2026-08-07"], ["2026-08", "2026-09-07"]] as const) {
    const amt = withheld(m);
    out.push({
      entryNo: `JV-2026-${String(out.length + 1).padStart(4, "0")}`,
      date: paidOn,
      memo: `นำส่งภาษีหัก ณ ที่จ่าย ${m} / Withholding tax remitted for ${m}`,
      lines: [
        { account: "2410", debit: amt, credit: 0 },
        { account: "1110", debit: 0, credit: amt },
      ],
      kind: "whtRemittance",
      period: m,
      actor: TAX_OFFICER_ACTOR,
    });
  }
  for (const m of ["2026-07", "2026-08"]) {
    out.push({
      entryNo: `JV-2026-${String(out.length + 1).padStart(4, "0")}`,
      date: `${m}-28`,
      memo: "ค่าธรรมเนียมธนาคาร / Bank charges",
      lines: [
        { account: "6900", debit: 350, credit: 0 },
        { account: "1110", debit: 0, credit: 350 },
      ],
      kind: "manual",
      actor: MANAGER_ACTOR,
    });
  }
  return out;
}

/**
 * September's bank statement: every bank movement the books show for the month (a day or so later, as banks
 * post them), plus two the books don't know about yet — a bank charge and a customer transfer.
 */
function seedBankStatement(s: Store): BankLine[] {
  const entries = buildJournal(s).filter((e) => e.date >= "2026-09-01" && e.date <= "2026-09-30");
  const lines: BankLine[] = [];
  for (const e of entries) {
    const net = r2(e.lines.filter((l) => l.account === "1110").reduce((sum, l) => sum + l.debit - l.credit, 0));
    if (net === 0) continue;
    lines.push({ id: `bst-${lines.length + 1}`, date: addDays(e.date, e.date.endsWith("30") ? 0 : 1), description: net > 0 ? "TRANSFER IN" : "TRANSFER OUT", amount: net, reference: e.ref });
  }
  lines.push({ id: `bst-${lines.length + 1}`, date: "2026-09-28", description: "BANK CHARGE", amount: -350, reference: "FEE-0926" });
  lines.push({ id: `bst-${lines.length + 1}`, date: "2026-09-29", description: "TRANSFER IN RIVERSIDE BAR", amount: 20000, reference: "INW-77812" });
  return lines;
}

/** One open, one taken up as a sales order, one that lapsed without an answer. */
function seedQuotations(): Quotation[] {
  const today = todayIso();
  const cust = (id: string) => initialCustomers.find((c) => c.customerId === id)!;
  const line = (sku: string, quantity: number, unitPrice: number, discountPercent: number) => ({
    sku,
    quantity,
    unitPrice,
    discountPercent,
    netValue: r2(quantity * unitPrice * (1 - discountPercent / 100)),
  });
  const q = (quoteNo: string, customerId: string, date: string, validUntil: string, lines: Quotation["lines"], status: Quotation["status"], extra: Partial<Quotation> = {}): Quotation => ({
    quoteNo,
    customerId,
    customerName: cust(customerId).name,
    date,
    validUntil,
    lines,
    netValue: r2(lines.reduce((s, l) => s + l.netValue, 0)),
    status,
    notes: "",
    createdBy: SALES_OFFICER_ACTOR,
    ...extra,
  });
  return [
    q("QT-2026-0001", "CUS-0005", "2026-07-28", "2026-08-11", [line("SKU-1002", 12, 5990, 8)], "accepted", { salesOrderNo: "SO-2026-3305" }),
    q("QT-2026-0002", "CUS-0004", addDays(today, -40), addDays(today, -26), [line("SKU-1009", 48, 590, 5)], "open"),
    q("QT-2026-0003", "CUS-0003", addDays(today, -3), addDays(today, 11), [line("SKU-1001", 24, 2241, 5), line("SKU-1007", 36, 711, 5)], "open", {
      notes: "ราคารวม VAT · ส่งฟรีในกรุงเทพฯ / Prices include VAT · free delivery in Bangkok",
    }),
  ];
}

function seedPurchaseRequests(): PurchaseRequest[] {
  const today = todayIso();
  return [
    {
      requestNo: "PR-2026-0001",
      date: addDays(today, -2),
      sku: "SKU-1011",
      quantity: 60,
      reason: "เหลือ 12 ขวด ใกล้หมด / Only 12 bottles left",
      preferredSupplierId: "SUP-001",
      status: "pending",
      requestedBy: WAREHOUSE_OFFICER_ACTOR,
    },
    {
      requestNo: "PR-2026-0002",
      date: addDays(today, -6),
      sku: "SKU-1006",
      quantity: 240,
      reason: "ลูกค้าร้านอาหารสั่งประจำ / Regular restaurant demand",
      preferredSupplierId: "SUP-003",
      status: "approved",
      requestedBy: ORDER_OFFICER_ACTOR,
      decidedBy: { th: "สมชาย วิริยะ (หัวหน้างาน)", en: "Somchai Wiriya (Supervisor)" },
      decisionNote: "",
    },
  ];
}
