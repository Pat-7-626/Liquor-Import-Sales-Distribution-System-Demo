// General ledger, derived. Every journal entry is generated from a business record — an invoice, a payment,
// a stock movement, a goods receipt, a supplier invoice, an expense — so the books can never disagree with
// the screens that produced them. Only what no record covers (accruals, capital, corrections, tax
// remittances) is posted by hand, as a manual journal. Every entry balances by construction.
import type { Bilingual, SalesOrder } from "../data/types";
import { splitVat } from "../lib/business";
import type { Store } from "./store";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  code: string;
  name: Bilingual;
  type: AccountType;
}

export const ACCOUNTS: Account[] = [
  { code: "1110", name: { th: "เงินฝากธนาคาร", en: "Bank" }, type: "asset" },
  { code: "1200", name: { th: "ลูกหนี้การค้า", en: "Accounts receivable" }, type: "asset" },
  { code: "1300", name: { th: "สินค้าคงเหลือ", en: "Inventory" }, type: "asset" },
  { code: "1410", name: { th: "ภาษีซื้อ", en: "Input VAT" }, type: "asset" },
  { code: "2110", name: { th: "เจ้าหนี้การค้า", en: "Accounts payable" }, type: "liability" },
  { code: "2120", name: { th: "สินค้ารับแล้วรอใบแจ้งหนี้", en: "Goods received not invoiced" }, type: "liability" },
  { code: "2210", name: { th: "ภาษีขาย", en: "Output VAT" }, type: "liability" },
  { code: "2410", name: { th: "ภาษีหัก ณ ที่จ่ายค้างนำส่ง", en: "Withholding tax payable" }, type: "liability" },
  { code: "2900", name: { th: "ค่าใช้จ่ายค้างจ่าย", en: "Accrued expenses" }, type: "liability" },
  { code: "3100", name: { th: "ยอดยกมา (ทุน)", en: "Opening balance equity" }, type: "equity" },
  { code: "3200", name: { th: "ทุนเพิ่มจากเจ้าของ", en: "Owner's capital" }, type: "equity" },
  { code: "4100", name: { th: "รายได้จากการขาย", en: "Sales" }, type: "income" },
  { code: "4110", name: { th: "รับคืนและส่วนลด", en: "Sales returns & allowances" }, type: "income" },
  { code: "4900", name: { th: "กำไรจากอัตราแลกเปลี่ยน", en: "Exchange gain" }, type: "income" },
  { code: "5100", name: { th: "ต้นทุนขาย", en: "Cost of goods sold" }, type: "expense" },
  { code: "5200", name: { th: "ปรับปรุงสินค้าคงเหลือ", en: "Inventory adjustments" }, type: "expense" },
  { code: "5900", name: { th: "ขาดทุนจากอัตราแลกเปลี่ยน", en: "Exchange loss" }, type: "expense" },
  { code: "6100", name: { th: "เงินเดือนและค่าแรง", en: "Salaries & wages" }, type: "expense" },
  { code: "6200", name: { th: "ค่าเช่า", en: "Rent" }, type: "expense" },
  { code: "6300", name: { th: "ค่าสาธารณูปโภค", en: "Utilities" }, type: "expense" },
  { code: "6400", name: { th: "ค่าขนส่งสินค้าถึงลูกค้า", en: "Delivery & freight out" }, type: "expense" },
  { code: "6500", name: { th: "ค่าการตลาดและส่งเสริมการขาย", en: "Marketing" }, type: "expense" },
  { code: "6600", name: { th: "ค่าบริการวิชาชีพ", en: "Professional fees" }, type: "expense" },
  { code: "6900", name: { th: "ค่าใช้จ่ายอื่น", en: "Other expenses" }, type: "expense" },
];

/** Accounts an operating expense can be booked to. */
export const EXPENSE_ACCOUNTS = ACCOUNTS.filter((a) => a.code.startsWith("6"));
/** Accounts generated from records only — a manual journal can't touch them, or the reconciliation checks would break. */
export const SYSTEM_ACCOUNTS = ["1200", "1300", "1410", "2110", "2120", "2210"];

export type JournalSource =
  | "opening"
  | "sale"
  | "creditNote"
  | "debitNote"
  | "receipt"
  | "cogs"
  | "stockAdjustment"
  | "goodsReceipt"
  | "supplierInvoice"
  | "supplierPayment"
  | "expense"
  | "manual";

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  source: JournalSource;
  /** The record it came from (invoice, document, order number). */
  ref: string;
  memo: Bilingual;
  lines: JournalLine[];
  /** Where to see the source record. */
  href?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const dr = (account: string, amount: number): JournalLine => ({ account, debit: r2(amount), credit: 0 });
const cr = (account: string, amount: number): JournalLine => ({ account, debit: 0, credit: r2(amount) });

/** Drops zero lines and folds the rounding cent (if any) into the last line so the entry balances exactly. */
function balanced(lines: JournalLine[]): JournalLine[] {
  const out = lines.filter((l) => l.debit !== 0 || l.credit !== 0);
  const diff = r2(out.reduce((s, l) => s + l.debit - l.credit, 0));
  if (diff !== 0 && out.length) {
    const last = out[out.length - 1];
    if (last.credit) last.credit = r2(last.credit + diff);
    else last.debit = r2(last.debit - diff);
  }
  return out;
}

export type LedgerStore = Pick<
  Store,
  "salesOrders" | "arDocuments" | "stockMovements" | "inventory" | "importOrders" | "apDocuments" | "products" | "expenses" | "manualJournals" | "company"
>;

export function buildJournal(store: LedgerStore): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const add = (e: Omit<JournalEntry, "lines"> & { lines: JournalLine[] }) => {
    const lines = balanced(e.lines);
    if (lines.length) entries.push({ ...e, lines });
  };
  const orders = new Map(store.salesOrders.map((o) => [o.orderNo, o]));
  const vatOf = (o?: SalesOrder) => o?.invoice?.vatPercent ?? o?.vatPercent ?? 7;
  const lotCost = (lotBatch: string, sku: string) =>
    store.inventory.find((i) => i.lotBatch === lotBatch)?.unitCost ?? store.products.find((p) => p.sku === sku)?.costPrice ?? 0;

  // Cash in the bank when the system started — the business's own figure (Company Profile), not from any record.
  const { openingDate, openingBank } = store.company;
  add({ id: "open-bank", date: openingDate, source: "opening", ref: "OPEN", memo: { th: "เงินฝากธนาคารยกมา", en: "Opening bank balance" }, lines: [dr("1110", openingBank), cr("3100", openingBank)] });

  // ── receivables ──
  for (const d of store.arDocuments) {
    const href = `/customers/${d.customerId}`;
    if (d.type === "openingBalance")
      add({ id: d.docNo, date: d.date, source: "opening", ref: d.docNo, memo: { th: `ลูกหนี้ยกมา ${d.customerId}`, en: `Receivable brought forward, ${d.customerId}` }, lines: [dr("1200", d.amount), cr("3100", d.amount)], href });
    else if (d.type === "payment")
      add({ id: d.docNo, date: d.date, source: "receipt", ref: d.docNo, memo: { th: `รับชำระจาก ${d.customerId}`, en: `Payment from ${d.customerId}` }, lines: [dr("1110", d.amount), cr("1200", d.amount)], href });
    else {
      const { base, vat } = splitVat(d.amount, vatOf(orders.get(d.reference)));
      const memo = d.type === "creditNote" ? { th: `ใบลดหนี้ ${d.reference}`, en: `Credit note on ${d.reference}` } : { th: `ใบเพิ่มหนี้ ${d.reference}`, en: `Debit note on ${d.reference}` };
      add({
        id: d.docNo,
        date: d.date,
        source: d.type === "creditNote" ? "creditNote" : "debitNote",
        ref: d.docNo,
        memo,
        lines: d.type === "creditNote" ? [dr("4110", base), dr("2210", vat), cr("1200", d.amount)] : [dr("1200", d.amount), cr("4100", base), cr("2210", vat)],
        href: `/sales-orders/${d.reference}`,
      });
    }
  }

  // ── sales invoices, as issued ──
  for (const o of store.salesOrders) {
    if (!o.invoice || !o.invoiceDate) continue;
    const { base, vat } = splitVat(o.invoice.netValue, o.invoice.vatPercent);
    add({
      id: `inv-${o.orderNo}`,
      date: o.invoiceDate,
      source: "sale",
      ref: o.taxInvoiceNo,
      memo: { th: `ขาย ${o.orderNo}`, en: `Sale ${o.orderNo}` },
      lines: [dr("1200", o.invoice.netValue), cr("4100", base), cr("2210", vat)],
      href: `/sales-orders/${o.orderNo}`,
    });
  }

  // ── stock: goods receipts, opening stock, cost of sales, returns, adjustments ──
  const received = new Map(store.importOrders.filter((o) => o.receiving).map((o) => [o.orderNo, o]));
  const groups = new Map<string, { date: string; type: string; ref: string; value: number }>();
  for (const m of store.stockMovements) {
    const value = m.quantity * lotCost(m.lotBatch, m.sku);
    const date = m.timestamp.slice(0, 10);
    // Goods receipts are booked per shipment below; adjustments that are transfers cancel out within a group.
    const kind = m.type === "receipt" ? (received.has(m.reference) ? "goodsReceipt" : "opening") : m.type;
    const key = `${kind}|${m.reference}|${date}`;
    const g = groups.get(key) ?? { date, type: kind, ref: m.reference, value: 0 };
    g.value += value;
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const v = r2(g.value);
    if (v === 0) continue;
    const orderNo = g.ref.replace(/ \(edit\)$/, "");
    if (g.type === "opening")
      add({ id: `stk-${key}`, date: g.date, source: "opening", ref: g.ref, memo: { th: "สินค้าคงเหลือยกมา", en: "Opening stock" }, lines: [dr("1300", v), cr("3100", v)] });
    else if (g.type === "sale" || g.type === "return")
      // Out of stock at cost (sale), or back in (return / edit that reduced a quantity).
      add({
        id: `stk-${key}`,
        date: g.date,
        source: "cogs",
        ref: g.ref,
        memo: v < 0 ? { th: `ต้นทุนขาย ${orderNo}`, en: `Cost of sale ${orderNo}` } : { th: `รับคืนสินค้า ${orderNo}`, en: `Goods back from ${orderNo}` },
        lines: v < 0 ? [dr("5100", -v), cr("1300", -v)] : [dr("1300", v), cr("5100", v)],
        href: orders.has(orderNo) ? `/sales-orders/${orderNo}` : undefined,
      });
    else if (g.type === "adjustment")
      add({
        id: `stk-${key}`,
        date: g.date,
        source: "stockAdjustment",
        ref: g.ref,
        memo: { th: `ปรับปรุงสต๊อก: ${g.ref}`, en: `Stock adjustment: ${g.ref}` },
        lines: v < 0 ? [dr("5200", -v), cr("1300", -v)] : [dr("1300", v), cr("5200", v)],
      });
  }

  // Each shipment received: stock at landed cost; the supplier's part awaits their invoice (GRNI); duty,
  // excise, freight and import VAT were paid out at clearance.
  for (const o of received.values()) {
    const rec = o.receiving!;
    const stock = r2(store.stockMovements.filter((m) => m.type === "receipt" && m.reference === o.orderNo).reduce((s, m) => s + m.quantity * lotCost(m.lotBatch, m.sku), 0));
    const goods = goodsReceivedThb(o);
    const orderedGoods = (o.lineItems ?? []).reduce((s, l) => s + l.qty * l.unitPrice, 0) * (o.exchangeRate ?? 1);
    const importVat = orderedGoods > 0 ? r2((o.tax?.vat ?? 0) * (goods / orderedGoods)) : 0;
    add({
      id: `grn-${o.orderNo}`,
      date: rec.receivedDate,
      source: "goodsReceipt",
      ref: o.orderNo,
      memo: { th: `รับสินค้า ${o.orderNo} (${o.supplier})`, en: `Goods received ${o.orderNo} (${o.supplier})` },
      lines: [dr("1300", stock), dr("1410", importVat), cr("2120", goods), cr("1110", stock - goods + importVat)],
      href: `/import-orders/${o.orderNo}`,
    });
  }

  // ── payables ──
  const apInvoices = new Map(store.apDocuments.filter((d) => d.type === "invoice").map((d) => [d.docNo, d]));
  for (const d of store.apDocuments) {
    if (d.type === "invoice") {
      // A shipment received before the system started is in opening stock, so its bill is an opening balance too.
      const preSystem = !received.has(d.importOrderNo);
      add({
        id: d.docNo,
        date: d.date,
        source: "supplierInvoice",
        ref: d.docNo,
        memo: d.importOrderNo
          ? { th: `ใบแจ้งหนี้ผู้ขาย ${d.reference} (${d.importOrderNo})`, en: `Supplier invoice ${d.reference} (${d.importOrderNo})` }
          : { th: `เจ้าหนี้ยกมา ${d.reference}`, en: `Payable brought forward, ${d.reference}` },
        lines: [dr(preSystem ? "3100" : "2120", d.amountThb), cr("2110", d.amountThb)],
        href: "/payables",
      });
    } else {
      const inv = apInvoices.get(d.appliesTo ?? "");
      const booked = r2(d.amount * (inv?.rate ?? d.rate));
      const diff = r2(d.amountThb - booked);
      add({
        id: d.docNo,
        date: d.date,
        source: "supplierPayment",
        ref: d.docNo,
        memo: { th: `จ่ายผู้ขาย ${inv?.reference ?? ""}`, en: `Payment to supplier on ${inv?.reference ?? ""}` },
        lines: [dr("2110", booked), ...(diff > 0 ? [dr("5900", diff)] : []), cr("1110", d.amountThb), ...(diff < 0 ? [cr("4900", -diff)] : [])],
        href: "/payables",
      });
    }
  }

  // ── operating expenses: the cost, reclaimable VAT, tax withheld (owed to the Revenue Department), paid out ──
  for (const x of store.expenses) {
    add({
      id: x.docNo,
      date: x.date,
      source: "expense",
      ref: x.docNo,
      memo: { th: `${x.payee}: ${x.description}`, en: `${x.payee}: ${x.description}` },
      lines: [dr(x.account, x.amount), dr("1410", x.vat), cr("2410", x.whtAmount), cr("1110", x.paid)],
      href: "/expenses",
    });
  }

  for (const j of store.manualJournals) {
    add({
      id: j.entryNo,
      date: j.date,
      source: "manual",
      ref: j.entryNo,
      memo: { th: j.memo, en: j.memo },
      lines: j.lines.map((l) => ({ account: l.account, debit: r2(l.debit), credit: r2(l.credit) })),
      href: j.kind === "whtRemittance" ? "/tax/withholding" : "/accounting/manual-journals",
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Bank-account movement of an entry: + money in, − money out (what a bank statement line should show). */
export function bankAmount(e: JournalEntry): number {
  return r2(e.lines.filter((l) => l.account === "1110").reduce((s, l) => s + l.debit - l.credit, 0));
}

/** Goods received on an import order, valued as the supplier will bill them (received qty × price × order rate). */
export function goodsReceivedThb(o: Store["importOrders"][number]): number {
  const lines = o.lineItems ?? [];
  const priceOf = (sku: string) => {
    const ls = lines.filter((l) => l.sku === sku);
    const qty = ls.reduce((s, l) => s + l.qty, 0);
    return qty ? ls.reduce((s, l) => s + l.qty * l.unitPrice, 0) / qty : 0;
  };
  const received = o.receiving?.lines ?? lines.map((l) => ({ sku: l.sku, receivedQty: l.qty }));
  const foreign = r2(received.reduce((s, l) => s + l.receivedQty * priceOf(l.sku), 0));
  return r2(foreign * (o.exchangeRate ?? 1));
}

export interface AccountBalance {
  account: Account;
  debit: number;
  credit: number;
  /** Debit-positive for assets and expenses, credit-positive for the rest. */
  balance: number;
}

const natural = (type: AccountType) => (type === "asset" || type === "expense" ? 1 : -1);

/** Totals per account for entries dated within [from, to] (either end optional). */
export function trialBalance(entries: JournalEntry[], to?: string, from?: string): AccountBalance[] {
  const sums = new Map(ACCOUNTS.map((a) => [a.code, { debit: 0, credit: 0 }]));
  for (const e of entries) {
    if ((to && e.date > to) || (from && e.date < from)) continue;
    for (const l of e.lines) {
      const s = sums.get(l.account)!;
      s.debit += l.debit;
      s.credit += l.credit;
    }
  }
  return ACCOUNTS.map((account) => {
    const s = sums.get(account.code)!;
    const debit = r2(s.debit);
    const credit = r2(s.credit);
    return { account, debit, credit, balance: r2((debit - credit) * natural(account.type)) };
  });
}

/** Profit for a period: income less expenses (returns and allowances reduce income). */
export function profitAndLoss(entries: JournalEntry[], from: string, to: string) {
  const tb = trialBalance(entries, to, from);
  const bal = (code: string) => tb.find((b) => b.account.code === code)!.balance;
  const sales = bal("4100");
  const returns = -bal("4110"); // a debit balance on an income account
  const netSales = r2(sales - returns);
  const cogs = bal("5100");
  const grossProfit = r2(netSales - cogs);
  const adjustments = bal("5200");
  const fx = r2(bal("4900") - bal("5900"));
  const tradingProfit = r2(grossProfit - adjustments + fx);
  const expenses = EXPENSE_ACCOUNTS.map((account) => ({ account, amount: bal(account.code) })).filter((x) => x.amount !== 0);
  const operatingExpenses = r2(expenses.reduce((s, x) => s + x.amount, 0));
  const netProfit = r2(tradingProfit - operatingExpenses);
  return { sales, returns, netSales, cogs, grossProfit, adjustments, fx, tradingProfit, expenses, operatingExpenses, netProfit };
}

/** Balance sheet at a date; profit to date is shown as current earnings so the two sides agree. */
export function balanceSheet(entries: JournalEntry[], asOf: string) {
  const tb = trialBalance(entries, asOf);
  const of = (type: AccountType) => tb.filter((b) => b.account.type === type);
  const sum = (bs: AccountBalance[]) => r2(bs.reduce((s, b) => s + b.balance, 0));
  const assets = of("asset");
  const liabilities = of("liability");
  const equity = of("equity");
  const earnings = r2(sum(of("income")) - sum(of("expense")));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = r2(sum(equity) + earnings);
  return { assets, liabilities, equity, earnings, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 };
}
