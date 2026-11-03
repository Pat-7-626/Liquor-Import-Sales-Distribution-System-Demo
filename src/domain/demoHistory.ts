/**
 * The demo dataset: six months of a liquor importer's business, replayed through the same domain actions the
 * screens use, each by the person whose job it is and on the day it happens. Nothing is written into the store
 * by hand after the starting master data, so every order, lot, invoice, receipt, journal and audit line follows
 * the system's own rules — approvals, licenses, credit, FIFO lots, landed cost, VAT, withholding, closed months.
 *
 * The history runs from the first day of the month five months back to yesterday, so the demo is current
 * whenever it is reset. It is deterministic for a given day (a seeded random sequence drives the choices).
 * The records from the source spreadsheet come first: its 8 import orders and 8 sales orders are the first ones
 * raised after go-live, and its customers' balances are what was brought forward.
 */
import { products as productMaster } from "../data/products";
import { customers as customerMaster, spreadsheetBalances } from "../data/customers";
import { licenses as licenseMaster, LICENSE_DATA_AS_OF } from "../data/licenses";
import { suppliers as supplierMaster } from "../data/suppliers";
import { warehouses as warehouseMaster } from "../data/warehouses";
import { priceLists as priceListMaster } from "../data/priceLists";
import { taxSettings as taxMaster } from "../data/taxSettings";
import { reorderPolicies as reorderMaster } from "../data/reorderPolicies";
import { company as companyMaster } from "../data/company";
import { exchangeRatesFrom, startingRates } from "../data/exchangeRates";
import { sourceImportOrders } from "../data/importOrders";
import { sourceSalesOrders } from "../data/salesOrders";
import { IDENTITIES, ROLE_PERMISSIONS } from "../data/identities";
import type { Bilingual, Customer, ImportOrder, ImportOrderLineItem, License, Product, SalesOrder } from "../data/types";
import * as A from "./actions";
import type { ActionResult, Ctx, SalesLineInput } from "./actions";
import type { Store } from "./store";
import { buildJournal, bankAmount } from "./ledger";
import { lastOfMonth } from "./finance";
import { atTime } from "../lib/clock";
import {
  addDays,
  computeImportTax,
  goodsValueThb,
  computeArOpenItems,
  computeChannelPrice,
  computeLicenseStatus,
  heldByLot,
  isBookedSale,
  isReversedSale,
  rateOn,
  referencePurchasePrice,
  todayIso,
} from "../lib/business";

// ───────────────────────────── people ─────────────────────────────

type Who = "manager" | "orderOfficer" | "docOfficer" | "whOfficer" | "taxOfficer" | "salesOfficer" | "distOfficer" | "somchai" | "piyada";

function ctxOf(key: Who): Ctx {
  const identity = IDENTITIES.find((i) => i.key === key)!;
  return { actor: identity.name, can: (p) => ROLE_PERMISSIONS[identity.role].has(p) };
}
const CTX = Object.fromEntries((["manager", "orderOfficer", "docOfficer", "whOfficer", "taxOfficer", "salesOfficer", "distOfficer", "somchai", "piyada"] as Who[]).map((k) => [k, ctxOf(k)])) as Record<Who, Ctx>;

// ───────────────────────────── randomness & calendar ─────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number in [0, 1) for a key — the same record always gets the same choice. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const weekday = (d: string) => new Date(`${d}T00:00:00`).getDay();
const isWorkday = (d: string) => weekday(d) !== 0 && weekday(d) !== 6;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);
function nextWorkday(d: string): string {
  let x = d;
  while (!isWorkday(x)) x = addDays(x, 1);
  return x;
}
/** `n` working days after `d` (before it when negative). */
function addWorkdays(d: string, n: number): string {
  let x = d;
  const step = n < 0 ? -1 : 1;
  for (let i = 0; i < Math.abs(n); i++) {
    x = addDays(x, step);
    while (!isWorkday(x)) x = addDays(x, step);
  }
  return x;
}
function lastWorkdayOfMonth(d: string): string {
  let x = lastOfMonth(d);
  while (!isWorkday(x)) x = addDays(x, -1);
  return x;
}
function nthWorkdayOfMonth(month: string, n: number): string {
  let x = nextWorkday(`${month}-01`);
  for (let i = 1; i < n; i++) x = addWorkdays(x, 1);
  return x;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** A fictional 13-digit taxpayer number with its check digit. */
function taxId(first12: string): string {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

// ───────────────────────────── who buys what ─────────────────────────────

type Region = "bkk" | "near" | "far";
interface Profile {
  /** Orders a month (before the overall pace below). */
  perMonth: number;
  lines: [number, number];
  skus: string[];
  qty: [number, number];
  /** Order in multiples of this (a case). */
  step: number;
  region: Region;
  /** Days after the due date this customer usually pays (negative = early). */
  pays: [number, number];
}
const sku = (n: number) => `SKU-${n}`;
const S = (...n: number[]) => n.map(sku);
const PROFILES: Record<string, Profile> = {
  "CUS-0001": { perMonth: 3, lines: [3, 5], skus: S(1001, 1003, 1007, 1010, 1004, 1012, 1019, 1021, 1024, 1008), qty: [36, 144], step: 12, region: "bkk", pays: [-4, 10] },
  "CUS-0002": { perMonth: 3, lines: [2, 4], skus: S(1003, 1007, 1012, 1017, 1018, 1005, 1010, 1021), qty: [24, 72], step: 12, region: "bkk", pays: [6, 24] },
  "CUS-0003": { perMonth: 2.5, lines: [2, 4], skus: S(1001, 1002, 1007, 1008, 1010, 1020, 1023, 1024, 1012), qty: [6, 30], step: 6, region: "bkk", pays: [0, 10] },
  "CUS-0004": { perMonth: 2, lines: [2, 3], skus: S(1003, 1007, 1009, 1012, 1021), qty: [12, 36], step: 12, region: "bkk", pays: [-3, 7] },
  "CUS-0005": { perMonth: 2.5, lines: [3, 5], skus: S(1001, 1002, 1003, 1005, 1007, 1010, 1012, 1019, 1013, 1017), qty: [24, 120], step: 12, region: "far", pays: [-5, 6] },
  "CUS-0006": { perMonth: 2, lines: [2, 3], skus: S(1005, 1006, 1013, 1015, 1016, 1001), qty: [12, 30], step: 6, region: "bkk", pays: [55, 95] },
  "CUS-0008": { perMonth: 3, lines: [3, 6], skus: S(1001, 1002, 1005, 1006, 1008, 1013, 1014, 1015, 1016, 1020, 1022), qty: [12, 36], step: 6, region: "bkk", pays: [0, 10] },
  "CUS-0009": { perMonth: 2.5, lines: [3, 5], skus: S(1003, 1005, 1006, 1007, 1010, 1012, 1015, 1017, 1018, 1024), qty: [12, 48], step: 6, region: "near", pays: [0, 12] },
  "CUS-0010": { perMonth: 2, lines: [3, 5], skus: S(1001, 1003, 1007, 1010, 1012, 1019, 1024, 1021, 1017), qty: [36, 144], step: 12, region: "far", pays: [-3, 8] },
  "CUS-0011": { perMonth: 2, lines: [3, 5], skus: S(1003, 1007, 1012, 1019, 1021, 1010, 1017), qty: [36, 144], step: 12, region: "far", pays: [0, 15] },
  "CUS-0012": { perMonth: 3, lines: [3, 6], skus: S(1003, 1005, 1007, 1012, 1015, 1017, 1018, 1021, 1024, 1019), qty: [24, 96], step: 12, region: "bkk", pays: [0, 5] },
  "CUS-0013": { perMonth: 2, lines: [2, 4], skus: S(1005, 1006, 1013, 1014, 1015, 1016, 1017, 1018), qty: [12, 36], step: 6, region: "bkk", pays: [0, 10] },
  "CUS-0014": { perMonth: 2, lines: [2, 4], skus: S(1001, 1005, 1013, 1016, 1022, 1011), qty: [6, 24], step: 6, region: "bkk", pays: [0, 8] },
  "CUS-0015": { perMonth: 2.5, lines: [2, 4], skus: S(1002, 1008, 1020, 1022, 1023, 1007, 1004), qty: [6, 30], step: 6, region: "bkk", pays: [5, 20] },
  "CUS-0016": { perMonth: 2, lines: [2, 4], skus: S(1003, 1005, 1006, 1013, 1014, 1010, 1008), qty: [12, 36], step: 6, region: "near", pays: [0, 10] },
  "CUS-0017": { perMonth: 2, lines: [3, 5], skus: S(1001, 1005, 1006, 1012, 1013, 1015, 1024, 1020, 1023), qty: [12, 48], step: 6, region: "far", pays: [5, 20] },
  "CUS-0018": { perMonth: 2, lines: [2, 3], skus: S(1007, 1012, 1021, 1017), qty: [12, 36], step: 12, region: "bkk", pays: [-2, 5] },
  "CUS-0019": { perMonth: 2, lines: [3, 5], skus: S(1003, 1007, 1010, 1012, 1019, 1021, 1024), qty: [24, 96], step: 12, region: "far", pays: [0, 12] },
  "CUS-0020": { perMonth: 2, lines: [2, 4], skus: S(1001, 1002, 1011, 1022, 1013, 1016, 1009), qty: [6, 18], step: 6, region: "bkk", pays: [-2, 3] },
  "CUS-0021": { perMonth: 2, lines: [2, 3], skus: S(1009, 1022, 1012, 1007), qty: [6, 24], step: 6, region: "bkk", pays: [0, 8] },
  "CUS-0022": { perMonth: 1.5, lines: [2, 3], skus: S(1007, 1010, 1012, 1024, 1003), qty: [12, 36], step: 6, region: "far", pays: [0, 15] },
  "CUS-0023": { perMonth: 2, lines: [3, 5], skus: S(1001, 1003, 1007, 1012, 1019, 1021, 1004, 1023), qty: [36, 120], step: 12, region: "near", pays: [0, 10] },
  "CUS-0024": { perMonth: 2.5, lines: [1, 2], skus: S(1012, 1009), qty: [12, 48], step: 12, region: "far", pays: [0, 5] },
};
/** Overall pace: about 28 orders a month across all customers. */
const ORDER_PACE = 0.6;
const WORKDAYS_PER_MONTH = 21.7;
const TRANSIT: Record<Region, number> = { bkk: 1, near: 2, far: 3 };

/** Units of each product the customers' buying habits come to in a month — what opening stock is sized on. */
function expectedMonthlyUnits(): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of Object.values(PROFILES)) {
    const linesAvg = (p.lines[0] + p.lines[1]) / 2;
    const qtyAvg = (p.qty[0] + p.qty[1]) / 2;
    for (const s of p.skus) m.set(s, (m.get(s) ?? 0) + (p.perMonth * ORDER_PACE * linesAvg * qtyAvg) / p.skus.length);
  }
  return m;
}

// ───────────────────────────── money going out each month ─────────────────────────────

interface MonthlyCost {
  day: number;
  payee: string;
  first12: string;
  payeeType: "company" | "individual";
  account: string;
  description: Bilingual;
  amount: (month: string) => number;
  vat: boolean;
  wht: number;
}

// ───────────────────────────── the replay ─────────────────────────────

interface Event {
  time: string;
  seq: number;
  label: string;
  run: () => void;
}

const SUPERVISORS: Who[] = ["somchai", "piyada"];
/** The supplier added part-way through the history, with its two wines. */
const LATER_SUPPLIER = "SUP-010";
const LATER_SKUS = new Set(["SKU-1017", "SKU-1018"]);

class History {
  readonly s: Store;
  /** Yesterday is the last day replayed; today is left to whoever uses the demo. */
  readonly today: string;
  readonly start: string;
  readonly openingDate: string;
  /** Days the license dates in the master data move by. */
  readonly licenseShift: number;
  private rng: () => number;
  private queue = new Map<string, Event[]>();
  private seq = 0;
  private day = "";
  /** Time of the event running now: nothing later in the day is stamped earlier. */
  private time = "00:00";
  readonly problems: string[] = [];
  /** Customs declaration numbers for orders the spreadsheet had none for. */
  private declarationSeq = 1000;
  private mentorImport = new Set(sourceImportOrders.map((o) => o.orderNo));

  constructor(today: string) {
    this.today = today;
    const m = today.slice(0, 7);
    const y = Number(m.slice(0, 4));
    const mo = Number(m.slice(5, 7));
    const startMonth = new Date(y, mo - 1 - 5, 1);
    this.start = `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, "0")}-01`;
    this.openingDate = addDays(this.start, -1);
    this.licenseShift = daysBetween(LICENSE_DATA_AS_OF, today);
    this.rng = mulberry32(20260501);
    this.s = this.masterData();
  }

  // ── plumbing ──

  private r(min: number, max: number) {
    return min + this.rng() * (max - min);
  }
  private ri(min: number, max: number) {
    return Math.floor(this.r(min, max + 1));
  }
  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rng() * xs.length)];
  }
  private chance(p: number) {
    return this.rng() < p;
  }
  private shiftLicense(d: string) {
    return addDays(d, this.licenseShift);
  }

  /** Schedules work on a day (moved to the next working day) at a time. */
  private at(date: string, time: string, label: string, run: () => void) {
    const d = nextWorkday(this.day && date < this.day ? this.day : date);
    if (d >= this.today) return;
    if (d === this.day && time < this.time) time = this.time;
    const list = this.queue.get(d) ?? [];
    list.push({ time, seq: this.seq++, label, run });
    this.queue.set(d, list);
  }

  /** Runs one action as a person, with the clock at that moment; a refusal is recorded, not thrown. */
  private act<R extends ActionResult>(who: Who, time: string, label: string, fn: (s: Store, ctx: Ctx) => R): R {
    const at = time < this.time ? this.time : time;
    const res = atTime(`${this.day}T${at}:00`, () => fn(this.s, CTX[who]));
    if (!res.ok) this.problems.push(`${this.day} ${time} ${label}: ${res.error.en}`);
    return res;
  }

  run(): Store {
    for (let d = this.start; d < this.today; d = addDays(d, 1)) {
      this.day = d;
      this.time = "00:00";
      if (!isWorkday(d)) continue;
      this.planDay(d);
      for (;;) {
        const list = this.queue.get(d);
        if (!list || list.length === 0) break;
        list.sort((a, b) => a.time.localeCompare(b.time) || a.seq - b.seq);
        const ev = list.shift()!;
        this.time = ev.time;
        ev.run();
      }
      this.queue.delete(d);
    }
    return this.s;
  }

  // ── the starting point: master data as migrated from the old system ──

  private masterData(): Store {
    const licenses: License[] = licenseMaster.map((l) => {
      const expiryDate = this.shiftLicense(l.expiryDate);
      return { ...l, issueDate: this.shiftLicense(l.issueDate), expiryDate, ...computeLicenseStatus(expiryDate) };
    });
    const joinLater = new Set(["CUS-0024", "CUS-0025"]);
    const laterLicenses = new Set(["LIC-SELL-2224", "LIC-SELL-2225"]);
    const customers: Customer[] = customerMaster
      .filter((c) => !joinLater.has(c.customerId))
      .map((c) => ({
        ...c,
        licenseExpiry: c.licenseExpiry ? this.shiftLicense(c.licenseExpiry) : null,
        email: `accounts.${c.customerId.toLowerCase()}@example.com`,
      }));
    const products: Product[] = productMaster
      .filter((p) => !LATER_SKUS.has(p.sku))
      .map((p) => ({ ...p, stockAvailable: 0, status: "outOfStock" as const }));
    return {
      products,
      importOrders: [],
      licenses: licenses.filter((l) => !laterLicenses.has(l.licenseNo)),
      customers,
      salesOrders: [],
      inventory: [],
      auditLog: [],
      suppliers: supplierMaster.filter((sp) => sp.supplierId !== LATER_SUPPLIER),
      warehouses: warehouseMaster,
      priceLists: priceListMaster,
      taxSettings: taxMaster,
      reorderPolicies: reorderMaster.filter((r) => !LATER_SKUS.has(r.sku)),
      stockMovements: [],
      arDocuments: [],
      company: { ...companyMaster, openingDate: this.openingDate, openingBank: 0 },
      exchangeRates: exchangeRatesFrom(this.openingDate),
      apDocuments: [],
      expenses: [],
      manualJournals: [],
      bankLines: [],
      quotations: [],
      purchaseRequests: [],
      arReminders: [],
      stockCounts: [],
    };
  }

  // ── what happens on a working day ──

  private firstWorkday = "";
  private workdayIndex = 0;

  private planDay(d: string) {
    if (!this.firstWorkday) this.firstWorkday = d;
    this.workdayIndex++;
    const wd = weekday(d);
    if (this.workdayIndex === 1) this.goLive();
    if (this.workdayIndex <= sourceImportOrders.length) this.sourceImport(this.workdayIndex - 1);
    if (this.workdayIndex <= sourceSalesOrders.length) this.sourceSale(this.workdayIndex - 1);
    if (wd === 1 && this.workdayIndex > 1) this.at(d, "08:30", "exchange rates", () => this.weeklyRates());
    if (wd === 1 && this.workdayIndex > 1) this.at(d, "09:05", "weekly statement", () => this.weeklyStatement());
    if (wd === 1 && this.workdayIndex > 10) this.at(d, "09:10", "purchase request", () => this.raisePurchaseRequest());
    if (wd === 2 && this.workdayIndex > 10) {
      this.at(d, "09:00", "decide requests", () => this.decidePurchaseRequests());
      this.at(d, "09:30", "reorder review", () => this.reorderReview());
    }
    if (this.workdayIndex > sourceSalesOrders.length) this.customerOrders(d);
    if (this.workdayIndex > 3 && this.chance(0.22)) this.at(d, `${String(this.ri(9, 15)).padStart(2, "0")}:${this.pick(["05", "20", "40"])}`, "quotation", () => this.quotation());
    this.at(d, "14:00", "customer payments", () => this.collect());
    if (wd === 5) this.at(d, "15:30", "payment reminders", () => this.reminders());
    this.monthly(d);
    this.oneOffs(d);
  }

  /** Go-live: the bank balance, stock on the shelves, and what customers and suppliers owed that day. */
  private goLive() {
    const d = this.day;
    const o = this.openingDate;
    this.at(d, "08:05", "opening bank", () => this.act("manager", "08:05", "opening bank", (s, c) => A.setOpeningBalances(s, c, o, 4_000_000)));
    this.at(d, "08:10", "opening stock", () => this.openingStock());
    this.at(d, "08:40", "opening receivables", () => this.openingReceivables());
    this.at(d, "08:55", "opening payables", () => this.openingPayables());
    for (const src of sourceSalesOrders.filter((x) => x.fromQuotation))
      this.at(d, "15:00", "source quotation", () =>
        this.act("salesOfficer", "15:00", "source quotation", (s, c) =>
          A.createQuotation(s, c, { customerId: src.customerId, validUntil: addDays(d, 14), lines: src.lines, notes: { th: "ราคารวม VAT", en: "Prices include VAT" } }),
        ),
      );
  }

  private lotName(receivedDate: string): string {
    const prefix = `LOT-A${receivedDate.slice(2, 4)}${receivedDate.slice(5, 7)}-`;
    const n = this.s.inventory.filter((i) => i.lotBatch.startsWith(prefix)).length + 1;
    return `${prefix}${String(n).padStart(2, "0")}`;
  }

  private openingStock() {
    const demand = expectedMonthlyUnits();
    const lots: { sku: string; qty: number; daysBefore: number; warehouse: string }[] = [];
    for (const p of this.s.products) {
      const monthly = demand.get(p.sku) ?? 20;
      const step = p.unit === "pack" ? 4 : p.sku === "SKU-1011" || p.sku === "SKU-1022" ? 6 : 12;
      const total = roundTo(monthly * 1.7, step);
      const wines = p.category === "redWine" || p.category === "whiteWine" || p.category === "beer";
      const older = roundTo(total * 0.35, step);
      lots.push({ sku: p.sku, qty: older, daysBefore: this.ri(70, 115), warehouse: wines ? "whB" : "whA" });
      lots.push({ sku: p.sku, qty: Math.max(step, total - older), daysBefore: this.ri(8, 40), warehouse: wines ? "whB" : "whA" });
    }
    // The Cask Reserve sells slowly: a lot from the start of the year still on the shelf (long-aging stock).
    lots.push({ sku: "SKU-1011", qty: 132, daysBefore: this.ri(100, 110), warehouse: "whA" });
    // Chiang Mai keeps a little of the fast sellers for the north.
    for (const s of ["SKU-1003", "SKU-1007", "SKU-1012"]) lots.push({ sku: s, qty: 48, daysBefore: this.ri(20, 35), warehouse: "whC" });
    lots.sort((a, b) => b.daysBefore - a.daysBefore);
    for (const l of lots) {
      const receivedDate = addDays(this.openingDate, -l.daysBefore);
      const product = this.s.products.find((p) => p.sku === l.sku)!;
      this.act("manager", "08:10", `opening stock ${l.sku}`, (s, c) =>
        A.addOpeningStock(s, c, {
          sku: l.sku,
          lotBatch: this.lotName(receivedDate),
          warehouse: l.warehouse,
          receivedDate,
          quantity: l.qty,
          unitCost: r2(product.costPrice * this.r(0.97, 1.01)),
          exciseStampDate: receivedDate,
        }),
      );
    }
  }

  /** What each customer owed at go-live, invoice by invoice. The spreadsheet's balances, less its own sales
   * (they are booked in the system as its first orders); illustrative customers owe about a month's trade. */
  private openingReceivables() {
    const sourceInvoiced = new Map<string, number>();
    for (const o of sourceSalesOrders) {
      if (o.outcome !== "delivered") continue;
      const v = o.lines.reduce((s, l) => s + r2(l.quantity * l.unitPrice * (1 - l.discountPercent / 100)), 0);
      sourceInvoiced.set(o.customerId, (sourceInvoiced.get(o.customerId) ?? 0) + v);
    }
    let n = 7000;
    for (const c of this.s.customers) {
      const p = PROFILES[c.customerId];
      const owed = c.customerId in spreadsheetBalances
        ? r2(spreadsheetBalances[c.customerId] - (sourceInvoiced.get(c.customerId) ?? 0))
        : p
          ? roundTo(this.expectedMonthlyValue(c, p) * Math.min(1.5, c.creditTermDays / 30) * 0.8, 100)
          : 0;
      if (owed <= 0) continue;
      // Two or three invoices from the old system, the oldest a little past due.
      // Khrua Khun Yai's oldest — and largest — bill is the one in dispute.
      const parts = c.customerId === "CUS-0006" ? [0.25, 0.25, 0.5] : owed > 150_000 ? [0.5, 0.3, 0.2] : [0.6, 0.4];
      let left = owed;
      parts.forEach((share, i) => {
        const amount = i === parts.length - 1 ? r2(left) : r2(owed * share);
        left = r2(left - amount);
        const daysAgo = Math.round(c.creditTermDays * (0.25 + i * 0.45)) + (i === parts.length - 1 ? 12 : 3);
        // Khrua Khun Yai's oldest bill is in dispute and never paid — it puts them on credit hold.
        const date = addDays(this.openingDate, -(c.customerId === "CUS-0006" && i === parts.length - 1 ? 40 : daysAgo));
        this.act("manager", "08:40", `opening AR ${c.customerId}`, (s, ctx) =>
          A.addOpeningReceivable(s, ctx, { customerId: c.customerId, reference: `IV${date.slice(2, 4)}-${n++}`, date, amount }),
        );
      });
    }
  }

  private expectedMonthlyValue(c: Customer, p: Profile): number {
    const linesAvg = (p.lines[0] + p.lines[1]) / 2;
    const qtyAvg = (p.qty[0] + p.qty[1]) / 2;
    const priceAvg = p.skus.reduce((s, k) => s + (productMaster.find((x) => x.sku === k)?.suggestedPrice ?? 0), 0) / p.skus.length;
    const channel = computeChannelPrice({ sku: "", suggestedPrice: priceAvg }, c.channelType, this.s.priceLists);
    return p.perMonth * ORDER_PACE * linesAvg * qtyAvg * channel;
  }

  /** Two suppliers' bills for shipments received before go-live, still to be paid. */
  private openingPayables() {
    const bills = [
      { supplierId: "SUP-003", reference: "CBV-26-0187", daysAgo: 25, currency: "EUR", amount: 14_850 },
      { supplierId: "SUP-005", reference: "BCD-4471-219", daysAgo: 30, currency: "GBP", amount: 9_420 },
    ];
    for (const b of bills) {
      const date = addDays(this.openingDate, -b.daysAgo);
      const supplier = this.s.suppliers.find((x) => x.supplierId === b.supplierId)!;
      this.act("manager", "08:55", `opening AP ${b.supplierId}`, (s, c) =>
        A.addOpeningPayable(s, c, { supplierId: b.supplierId, reference: b.reference, date, currency: b.currency, amount: b.amount, rate: startingRates[b.currency] }),
      );
      const doc = this.s.apDocuments.find((x) => x.reference === b.reference)!;
      this.at(addDays(date, supplier.paymentTermDays), "11:30", "pay opening AP", () => this.paySupplier(doc.docNo));
    }
  }

  // ── exchange rates ──

  private weeklyRates() {
    for (const cur of Object.keys(startingRates)) {
      const last = rateOn(this.s.exchangeRates, cur, this.day) ?? startingRates[cur];
      const drift = (startingRates[cur] - last) * 0.15;
      const next = last * (1 + this.r(-0.007, 0.007)) + drift;
      const rate = cur === "JPY" ? Math.round(next * 10000) / 10000 : Math.round(next * 100) / 100;
      this.act("taxOfficer", "08:30", `rate ${cur}`, (s, c) => A.saveExchangeRate(s, c, { currency: cur, effectiveDate: this.day, rate }));
    }
  }

  // ── sales ──

  /** Free units per lot right now, oldest first, after what orders awaiting approval hold. */
  private freeLots(skuCode: string): { lotBatch: string; free: number }[] {
    const held = heldByLot(this.s.salesOrders);
    return this.s.inventory
      .filter((i) => i.sku === skuCode)
      .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.lotBatch.localeCompare(b.lotBatch))
      .map((i) => ({ lotBatch: i.lotBatch, free: i.quantityRemaining - (held.get(i.lotBatch) ?? 0) }))
      .filter((l) => l.free > 0);
  }

  /** Lines for `qty` of a product, oldest lots first; fewer if that's all there is. */
  private pickLots(skuCode: string, qty: number, unitPrice: number, discountPercent: number): SalesLineInput[] {
    const out: SalesLineInput[] = [];
    let need = qty;
    for (const lot of this.freeLots(skuCode)) {
      if (need <= 0) break;
      const take = Math.min(lot.free, need);
      out.push({ sku: skuCode, lotBatch: lot.lotBatch, quantity: take, unitPrice, discountPercent });
      need -= take;
    }
    return out;
  }

  private licensed(c: Customer) {
    return Boolean(c.licenseNo && c.licenseExpiry && atTime(`${this.day}T09:00:00`, () => computeLicenseStatus(c.licenseExpiry!).status !== "expired"));
  }

  private customerOrders(d: string) {
    for (const c of this.s.customers) {
      const p = PROFILES[c.customerId];
      if (!p || !this.licensed(c)) continue;
      if (!this.chance((p.perMonth * ORDER_PACE) / WORKDAYS_PER_MONTH)) continue;
      const time = `${String(this.ri(9, 16)).padStart(2, "0")}:${this.pick(["00", "10", "25", "35", "50"])}`;
      this.at(d, time, `order ${c.customerId}`, () => this.placeOrder(c.customerId, time));
    }
  }

  private discountFor(c: Customer): number {
    if (this.chance(0.07)) return c.standardDiscount + this.ri(2, 5);
    return Math.max(0, c.standardDiscount - this.pick([0, 1, 2, 2, 3, 4]));
  }

  private placeOrder(customerId: string, time: string, forced?: { lines: { sku: string; quantity: number; unitPrice: number; discountPercent: number }[] }) {
    const c = this.s.customers.find((x) => x.customerId === customerId)!;
    const p = PROFILES[customerId];
    const lines: SalesLineInput[] = [];
    if (forced) {
      for (const l of forced.lines) lines.push(...this.pickLots(l.sku, l.quantity, l.unitPrice, l.discountPercent));
    } else {
      const discount = this.discountFor(c);
      const wanted = new Set<string>();
      const n = this.ri(p.lines[0], p.lines[1]);
      for (let i = 0; i < n * 3 && wanted.size < n; i++) wanted.add(this.pick(p.skus));
      for (const k of wanted) {
        const product = this.s.products.find((x) => x.sku === k);
        if (!product) continue;
        const step = product.unit === "pack" ? 4 : p.step;
        const qty = roundTo(this.r(p.qty[0], p.qty[1]), step);
        const price = computeChannelPrice(product, c.channelType, this.s.priceLists);
        const free = this.freeLots(k).reduce((s, l) => s + l.free, 0);
        const take = Math.min(qty, Math.floor(free / step) * step);
        if (take < step) continue;
        lines.push(...this.pickLots(k, take, price, discount));
      }
    }
    if (lines.length === 0) return;
    const region = p?.region ?? "bkk";
    const planned = addWorkdays(this.day, TRANSIT[region]);
    const res = this.act("salesOfficer", time, `sales order ${customerId}`, (s, ctx) => A.createSalesOrder(s, ctx, { customerId, lines, plannedDeliveryDate: planned }));
    if (!res.ok || !res.order) return;
    this.afterBooking(res.order.orderNo, region);
  }

  /** What happens to an order once it's raised: approval if it needs it, then delivery. */
  private afterBooking(orderNo: string, region: Region, plan?: { approver?: Who; outcome?: "delivered" | "returned" | "damaged"; lateDays?: number }) {
    const order = this.s.salesOrders.find((o) => o.orderNo === orderNo)!;
    if (order.approvalStatus === "pendingApproval") {
      // Raised before mid-afternoon, a supervisor usually decides the same day; later ones wait for tomorrow.
      const sameDay = this.time < "15:30" && (this.chance(0.6) || Boolean(plan?.approver));
      const when = sameDay ? this.day : addWorkdays(this.day, 1);
      this.at(when, sameDay ? "15:40" : "10:30", `decide ${orderNo}`, () => this.decideSale(orderNo, region, plan));
      return;
    }
    this.planDelivery(orderNo, region, plan);
  }

  private decideSale(orderNo: string, region: Region, plan?: { approver?: Who; outcome?: "delivered" | "returned" | "damaged"; lateDays?: number }) {
    const order = this.s.salesOrders.find((o) => o.orderNo === orderNo)!;
    if (order.approvalStatus !== "pendingApproval") return;
    const who = plan?.approver ?? this.pick(SUPERVISORS);
    const reasons = order.approvalReason?.en ?? "";
    const hold = reasons.includes("overdue");
    const customer = this.s.customers.find((x) => x.customerId === order.customerId)!;
    // The license lapsed while the order waited: it can't be approved until it's renewed.
    const lapsed = !this.licensed(customer);
    // Khrua Khun Yai is an old customer: supervisors keep approving its orders while they chase the disputed bills.
    const rejectP = plan || order.customerId === "CUS-0006" ? 0 : hold ? 0.25 : reasons.includes("credit") ? 0.2 : 0.12;
    if (lapsed || this.chance(rejectP)) {
      const why = lapsed
        ? "Customer's liquor license has expired — renew it first"
        : hold
        ? "Customer has invoices long overdue — collect first"
        : reasons.includes("credit")
          ? "Over the credit limit — ask the customer to pay down first"
          : "Discount above standard not justified — re-quote at standard terms";
      this.act(who, this.day === order.orderDate ? "15:40" : "10:30", `reject ${orderNo}`, (s, c) => A.rejectSalesOrderApproval(s, c, orderNo, why));
      // A discount the supervisor turned down is re-entered at the customer's standard terms.
      if (!lapsed && !hold && !reasons.includes("credit")) {
        const c = this.s.customers.find((x) => x.customerId === order.customerId)!;
        const lines = order.lines.map((l) => ({ sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: Math.min(l.discountPercent, c.standardDiscount) }));
        this.at(addWorkdays(this.day, 1), "09:45", `re-enter ${orderNo}`, () => this.placeOrder(order.customerId, "09:45", { lines: this.mergeLines(lines) }));
      }
      return;
    }
    const res = this.act(who, this.day === order.orderDate ? "15:40" : "10:30", `approve ${orderNo}`, (s, c) => A.approveSalesOrder(s, c, orderNo));
    if (!res.ok) return;
    // Approved too late for the day first promised: dispatch agrees a new day with the customer.
    const earliest = addWorkdays(this.day, TRANSIT[region]);
    if ((order.plannedDeliveryDate ?? this.day) < earliest)
      this.act("distOfficer", this.time, `replan ${orderNo}`, (s, c) => A.scheduleDelivery(s, c, orderNo, earliest));
    this.planDelivery(orderNo, region, plan);
  }

  private mergeLines(lines: { sku: string; quantity: number; unitPrice: number; discountPercent: number }[]) {
    const m = new Map<string, { sku: string; quantity: number; unitPrice: number; discountPercent: number }>();
    for (const l of lines) {
      const x = m.get(l.sku);
      if (x) x.quantity += l.quantity;
      else m.set(l.sku, { ...l });
    }
    return [...m.values()];
  }

  /** Dispatch the next working day; delivered on the promised day, now and then late, damaged or sent back. */
  private planDelivery(orderNo: string, region: Region, plan?: { outcome?: "delivered" | "returned" | "damaged"; lateDays?: number }) {
    const booked = this.day;
    // Now and then the terms change before the goods leave (a credit or debit note).
    if (!plan && this.chance(0.035)) this.at(booked, "16:45", `edit ${orderNo}`, () => this.editOrder(orderNo));
    // Now and then the customer asks for a later day.
    const later = !plan && this.chance(0.04);
    if (later) this.at(booked, "16:50", `reschedule ${orderNo}`, () => this.reschedule(orderNo));
    const dispatch = addWorkdays(booked, 1);
    this.at(dispatch, "08:30", `dispatch ${orderNo}`, () => this.dispatch(orderNo, region, plan));
  }

  private editOrder(orderNo: string) {
    const o = this.s.salesOrders.find((x) => x.orderNo === orderNo)!;
    if (!isBookedSale(o) || o.deliveryStatus !== "pendingShipment") return;
    const c = this.s.customers.find((x) => x.customerId === o.customerId)!;
    if (c.outstandingBalance > c.creditLimit || o.lines.some((l) => l.discountPercent > c.standardDiscount)) return;
    // The customer takes a little less of the first line.
    const terms = o.lines.map((l, i) => ({ quantity: i === 0 ? Math.max(1, l.quantity - roundTo(l.quantity * 0.25, 6)) : l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent }));
    this.act("salesOfficer", "16:45", `edit ${orderNo}`, (s, c) => A.editSalesOrder(s, c, orderNo, terms));
  }

  private reschedule(orderNo: string) {
    const o = this.s.salesOrders.find((x) => x.orderNo === orderNo)!;
    const date = addWorkdays(o.plannedDeliveryDate ?? this.day, 2);
    this.act("distOfficer", "16:50", `reschedule ${orderNo}`, (s, c) => A.scheduleDelivery(s, c, orderNo, date));
  }

  private dispatch(orderNo: string, region: Region, plan?: { outcome?: "delivered" | "returned" | "damaged"; lateDays?: number }) {
    const o = this.s.salesOrders.find((x) => x.orderNo === orderNo)!;
    if (!isBookedSale(o) || o.deliveryStatus !== "pendingShipment") return;
    // Goods leave so they arrive on the planned day.
    const leaveBy = o.plannedDeliveryDate ? addWorkdays(o.plannedDeliveryDate, -(TRANSIT[region] - 1)) : this.day;
    if (leaveBy > this.day) {
      this.at(leaveBy, "08:30", `dispatch ${orderNo}`, () => this.dispatch(orderNo, region, plan));
      return;
    }
    const res = this.act("distOfficer", "08:30", `dispatch ${orderNo}`, (s, c) => A.updateDeliveryStatus(s, c, orderNo, "inDelivery"));
    if (!res.ok) return;
    const promised = o.plannedDeliveryDate && o.plannedDeliveryDate > this.day ? o.plannedDeliveryDate : this.day;
    const late = plan ? (plan.lateDays ?? 0) : this.chance(0.08) ? this.ri(1, 2) : 0;
    const arrive = addWorkdays(promised, late);
    const outcome = plan?.outcome ?? (this.chance(0.012) ? "damaged" : "delivered");
    this.at(arrive, `${this.ri(13, 16)}:${this.pick(["05", "20", "45"])}`, `deliver ${orderNo}`, () => {
      const res2 = this.act("distOfficer", "15:00", `deliver ${orderNo}`, (s, c) => A.updateDeliveryStatus(s, c, orderNo, outcome === "damaged" ? "damaged" : "delivered"));
      if (!res2.ok || outcome === "damaged") return;
      if (outcome === "returned" || (!plan && this.chance(0.012)))
        this.at(addWorkdays(this.day, 2), "10:15", `return ${orderNo}`, () =>
          this.act("whOfficer", "10:15", `return ${orderNo}`, (s, c) => A.updateDeliveryStatus(s, c, orderNo, "returned")),
        );
      else if (!plan && this.chance(0.03)) this.at(addWorkdays(this.day, this.ri(1, 3)), "11:20", `part return ${orderNo}`, () => this.partReturn(orderNo));
    });
  }

  private partReturn(orderNo: string) {
    const o = this.s.salesOrders.find((x) => x.orderNo === orderNo)!;
    if (o.deliveryStatus !== "delivered") return;
    const line = o.lines.findIndex((l) => l.quantity >= 6);
    if (line < 0) return;
    const qty = this.ri(1, 3);
    const why = this.pick(["Bottles broken in transit", "Wrong vintage delivered", "Labels damaged — customer won't sell them", "Over-delivered by mistake"]);
    this.act("whOfficer", "11:20", `part return ${orderNo}`, (s, c) => A.returnSalesLines(s, c, orderNo, [{ line, quantity: qty }], why));
  }

  // ── quotations ──

  private quotation() {
    const candidates = this.s.customers.filter((c) => PROFILES[c.customerId] && (c.channelType === "restaurantBar" || c.channelType === "distributor") && this.licensed(c));
    if (candidates.length === 0) return;
    const c = this.pick(candidates);
    const p = PROFILES[c.customerId];
    const n = this.ri(2, Math.min(4, p.skus.length));
    const skus = new Set<string>();
    for (let i = 0; i < n * 3 && skus.size < n; i++) skus.add(this.pick(p.skus));
    const discount = Math.max(0, c.standardDiscount - this.pick([0, 1, 2]));
    const lines = [...skus]
      .map((k) => this.s.products.find((x) => x.sku === k))
      .filter((x): x is Product => Boolean(x))
      .map((product) => ({ sku: product.sku, quantity: roundTo(this.r(p.qty[0], p.qty[1]) * 1.5, p.step), unitPrice: computeChannelPrice(product, c.channelType, this.s.priceLists), discountPercent: discount }));
    if (lines.length === 0) return;
    const validDays = this.pick([14, 14, 21, 30]);
    const notes = this.pick([
      { th: "ราคารวม VAT · ส่งฟรีในเขตกรุงเทพฯ", en: "Prices include VAT · free delivery in Bangkok" },
      { th: "สำหรับงานเลี้ยงสิ้นปี · ราคารวม VAT", en: "For the year-end function · prices include VAT" },
      { th: "ราคาพิเศษเมื่อสั่งตามจำนวนนี้", en: "Special price at these quantities" },
      { th: "", en: "" },
    ]);
    const res = this.act("salesOfficer", "11:00", `quote ${c.customerId}`, (s, ctx) =>
      A.createQuotation(s, ctx, { customerId: c.customerId, validUntil: addDays(this.day, validDays), lines, notes }),
    );
    if (!res.ok || !res.quoteNo) return;
    const quoteNo = res.quoteNo;
    const roll = this.rng();
    if (roll < 0.55) this.at(addWorkdays(this.day, this.ri(2, 8)), "10:40", `accept ${quoteNo}`, () => this.acceptQuote(quoteNo, c.customerId));
    else if (roll < 0.78)
      this.at(addWorkdays(this.day, this.ri(3, 9)), "16:10", `decline ${quoteNo}`, () =>
        this.act("salesOfficer", "16:10", `decline ${quoteNo}`, (s, ctx) => A.declineQuotation(s, ctx, quoteNo, this.pick(["Bought from another importer", "Event cancelled", "Price too high for their menu", ""]))),
      );
    // The rest are left to lapse, or still open.
  }

  private acceptQuote(quoteNo: string, customerId: string) {
    const q = this.s.quotations.find((x) => x.quoteNo === quoteNo)!;
    if (q.status !== "open" || q.validUntil < this.day) return;
    const customer = this.s.customers.find((c) => c.customerId === customerId);
    if (!customer || !this.licensed(customer)) return;
    // Without the stock to fill it, the customer waits and the quote lapses.
    if (q.lines.some((l) => this.freeLots(l.sku).reduce((sum, x) => sum + x.free, 0) < l.quantity)) return;
    const region = PROFILES[customerId]?.region ?? "bkk";
    const res = this.act("salesOfficer", "10:40", `convert ${quoteNo}`, (s, c) => A.convertQuotation(s, c, quoteNo, addWorkdays(this.day, TRANSIT[region])));
    if (res.ok && res.order) this.afterBooking(res.order.orderNo, region);
  }

  // ── the spreadsheet's own sales, the first after go-live ──

  private sourceSale(i: number) {
    const src = sourceSalesOrders[i];
    const region = PROFILES[src.customerId]?.region ?? "bkk";
    const plan = { approver: src.approver, outcome: src.outcome, lateDays: src.lateDays };
    if (src.fromQuotation) {
      // Quoted on go-live day (see goLive), accepted on its day.
      this.at(this.day, "10:30", src.orderNo, () => {
        const q = this.s.quotations.find((x) => x.customerId === src.customerId && x.status === "open")!;
        const res = this.act("salesOfficer", "10:30", src.orderNo, (s, c) => A.convertQuotation(s, c, q.quoteNo, addWorkdays(this.day, TRANSIT[region])));
        if (res.ok && res.order) this.afterBooking(res.order.orderNo, region, plan);
      });
      return;
    }
    this.at(this.day, "10:30", src.orderNo, () => {
      const lines = src.lines.flatMap((l) => this.pickLots(l.sku, l.quantity, l.unitPrice, l.discountPercent));
      const res = this.act("salesOfficer", "10:30", src.orderNo, (s, c) =>
        A.createSalesOrder(s, c, { customerId: src.customerId, lines, plannedDeliveryDate: addWorkdays(this.day, TRANSIT[region]) }),
      );
      if (!res.ok || !res.order) return;
      // The very first order continues the old system's numbering.
      if (i === 0) this.renumberFirstSale(res.order.orderNo, src.orderNo);
      this.afterBooking(src.orderNo, region, plan);
    });
  }

  private renumberFirstSale(from: string, to: string) {
    const year = to.slice(3, 7);
    const s = this.s;
    s.salesOrders = s.salesOrders.map((o) =>
      o.orderNo === from ? { ...o, orderNo: to, taxInvoiceNo: `INV-${year}-8801`, deliveryNoteNo: `DN-${year}-6601` } : o,
    );
    s.auditLog = s.auditLog.map((e) => (e.entityType === "salesOrder" && e.entityId === from ? { ...e, entityId: to } : e));
    s.stockMovements = s.stockMovements.map((m) => (m.reference === from ? { ...m, reference: to } : m));
  }

  // ── customers paying ──

  /** When a customer pays an item: its due date plus their usual delay; a few pay in two parts. */
  private collect() {
    for (const c of this.s.customers) {
      if (c.outstandingBalance <= 0) continue;
      const p = PROFILES[c.customerId];
      const items = computeArOpenItems(c, this.s.salesOrders, this.s.arDocuments);
      for (const item of items) {
        if (item.kind === "broughtForward") continue;
        const key = `${c.customerId}|${item.ref}`;
        // Khrua Khun Yai disputes the bills from before go-live (a payment not tied to an invoice would settle the
        // oldest first, so it pays only its new invoices, one by one).
        if (c.customerId === "CUS-0006" && item.kind === "openingBalance") continue;
        const [lo, hi] = p?.pays ?? [0, 10];
        const delay = Math.round(lo + hash01(key) * (hi - lo));
        const due = addDays(item.dueDate, delay);
        if (due > this.day) continue;
        const split = hash01(`${key}|split`) < 0.08 && item.open === item.amount;
        const secondPart = addDays(due, 20);
        if (!split && item.open < item.amount && secondPart > this.day) continue;
        const amount = split ? r2(item.amount / 2) : item.open;
        const method = hash01(`${key}|m`) < 0.2 ? "cheque" : "transfer";
        const ref = method === "cheque" ? `CHQ ${String(Math.floor(hash01(key) * 9_000_000) + 1_000_000)}` : `TRF${this.day.replaceAll("-", "")}${String(Math.floor(hash01(key) * 900) + 100)}`;
        const res = this.act("salesOfficer", "14:00", `payment ${c.customerId}`, (s, ctx) =>
          A.recordPayment(s, ctx, c.customerId, Math.min(amount, s.customers.find((x) => x.customerId === c.customerId)!.outstandingBalance), method, ref, item.kind === "invoice" ? item.orderNo : null),
        );
        if (!res.ok) break;
      }
    }
  }

  private reminders() {
    for (const c of this.s.customers) {
      const items = computeArOpenItems(c, this.s.salesOrders, this.s.arDocuments).filter((i) => i.dueDate < addDays(this.day, -7));
      if (items.length === 0) continue;
      const mine = this.s.arReminders.filter((r) => r.customerId === c.customerId);
      const last = mine.sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last && daysBetween(last.date, this.day) < 14) continue;
      const recent = mine.filter((r) => daysBetween(r.date, this.day) <= 60).length;
      const level = Math.min(3, recent + 1) as 1 | 2 | 3;
      const note = [
        { th: "ส่งอีเมลถึงฝ่ายบัญชีของลูกค้า", en: "Emailed their accounts team" },
        { th: "โทรติดตามแล้ว ลูกค้าแจ้งจะโอนภายในสัปดาห์นี้", en: "Phoned — they promised to transfer this week" },
        { th: "แจ้งระงับเครดิตหากไม่ชำระภายใน 7 วัน", en: "Told them credit is stopped unless paid within 7 days" },
      ][level - 1];
      this.act("salesOfficer", "15:30", `reminder ${c.customerId}`, (s, ctx) => A.recordReminder(s, ctx, c.customerId, level, note));
    }
  }

  // ── buying: purchase requests, reorders, the shipment's journey ──

  private openImport(skuCode: string) {
    return this.s.importOrders.some((o) => !["receivedWarehouse", "rejected"].includes(o.status) && o.lineItems?.some((l) => l.sku === skuCode));
  }

  private projected(skuCode: string): number {
    const product = this.s.products.find((p) => p.sku === skuCode);
    if (!product) return 0;
    const held = this.s.salesOrders.filter((o) => o.approvalStatus === "pendingApproval").flatMap((o) => o.lines).filter((l) => l.sku === skuCode).reduce((s, l) => s + l.quantity, 0);
    const inbound = this.s.importOrders
      .filter((o) => !["receivedWarehouse", "rejected"].includes(o.status))
      .flatMap((o) => o.lineItems ?? [])
      .filter((l) => l.sku === skuCode)
      .reduce((s, l) => s + l.qty, 0);
    return product.stockAvailable - held + inbound;
  }

  /** The warehouse asks for one product that is running low and isn't already on order (`any`: the lowest, however low). */
  private raisePurchaseRequest(any = false) {
    const low = this.s.reorderPolicies
      .filter((r) => !this.openImport(r.sku) && !this.s.purchaseRequests.some((x) => x.sku === r.sku && (x.status === "pending" || x.status === "approved")))
      .map((r) => ({ r, product: this.s.products.find((p) => p.sku === r.sku)! }))
      .filter(({ r, product }) => product && (any || product.stockAvailable <= r.reorderPoint * 0.9))
      .sort((a, b) => a.product.stockAvailable / a.r.reorderPoint - b.product.stockAvailable / b.r.reorderPoint)[0];
    if (!low) return;
    const left = low.product.stockAvailable;
    this.act("whOfficer", "09:10", `PR ${low.r.sku}`, (s, c) =>
      A.createPurchaseRequest(s, c, {
        sku: low.r.sku,
        quantity: low.r.reorderQty,
        reason:
          left <= low.r.reorderPoint
            ? { th: `เหลือ ${left} หน่วย ต่ำกว่าจุดสั่งซื้อ ${low.r.reorderPoint}`, en: `${left} left, below the reorder point of ${low.r.reorderPoint}` }
            : { th: `เหลือ ${left} หน่วย ขายเร็วกว่าปกติ ขอสั่งก่อนถึงจุดสั่งซื้อ`, en: `${left} left and selling fast — order before it reaches the reorder point` },
        preferredSupplierId: low.r.preferredSupplierId,
      }),
    );
  }

  private decidePurchaseRequests() {
    for (const r of this.s.purchaseRequests.filter((x) => x.status === "pending")) {
      const who = this.pick(SUPERVISORS);
      const approve = this.chance(0.85);
      this.act(who, "09:00", `decide ${r.requestNo}`, (s, c) =>
        A.decidePurchaseRequest(s, c, r.requestNo, approve, approve ? "" : "Sales have slowed — wait for the next regular order"),
      );
    }
  }

  /** Every Tuesday purchasing orders what has fallen to its reorder point, one order per supplier. */
  private reorderReview() {
    const approvedRequests = this.s.purchaseRequests.filter((r) => r.status === "approved");
    const due = (r: (typeof this.s.reorderPolicies)[number], factor: number) => {
      const product = this.s.products.find((p) => p.sku === r.sku);
      if (!product || !r.preferredSupplierId) return false;
      return approvedRequests.some((x) => x.sku === r.sku) || this.projected(r.sku) <= r.reorderPoint * factor;
    };
    // A supplier is ordered from when one of its products reaches the reorder point; the shipment then tops up
    // its other products that are getting close, so goods come in fewer, fuller containers.
    const triggered = new Set(this.s.reorderPolicies.filter((r) => due(r, 1)).map((r) => r.preferredSupplierId));
    const needs = this.s.reorderPolicies.filter((r) => triggered.has(r.preferredSupplierId) && due(r, 1.6));
    const bySupplier = new Map<string, typeof needs>();
    for (const n of needs) bySupplier.set(n.preferredSupplierId!, [...(bySupplier.get(n.preferredSupplierId!) ?? []), n]);
    for (const [supplierId, policies] of bySupplier) {
      const supplier = this.s.suppliers.find((x) => x.supplierId === supplierId);
      if (!supplier?.active) continue;
      const request = approvedRequests.find((x) => policies.some((p) => p.sku === x.sku));
      const lines = policies.map((p) => {
        const product = this.s.products.find((x) => x.sku === p.sku)!;
        const qty = request?.sku === p.sku ? Math.max(request.quantity, p.reorderQty) : p.reorderQty;
        return { product, qty };
      });
      this.raiseImport(supplierId, lines, request?.requestNo ?? null);
    }
  }

  private leadDays(supplierId: string): number {
    const base: Record<string, number> = {
      "SUP-001": 38, "SUP-002": 42, "SUP-003": 40, "SUP-004": 34, "SUP-005": 36, "SUP-006": 40, "SUP-007": 21,
      "SUP-008": 24, "SUP-009": 40, "SUP-010": 46, "SUP-011": 36,
    };
    return (base[supplierId] ?? 35) + this.ri(-3, 4);
  }

  /** A Type 5 license for a small shipment if one is in force until it arrives, else the Type 1. */
  private importLicenseFor(totalQty: number, eta: string): string {
    const valid = (no: string) => {
      const l = this.s.licenses.find((x) => x.licenseNo === no);
      return l && l.expiryDate >= eta && atTime(`${this.day}T09:00:00`, () => computeLicenseStatus(l.expiryDate).status !== "expired");
    };
    if (totalQty <= 450) for (const no of ["LIC-IMP-0014", "LIC-IMP-0012"]) if (valid(no)) return no;
    return "LIC-IMP-0013";
  }

  /** FOB prices leave out freight and insurance, so the order estimates them for the customs value. */
  private estimateFreight(incoterms: string, lines: ImportOrderLineItem[], rate: number) {
    return incoterms === "FOB" ? Math.round((goodsValueThb(lines, rate) * this.r(0.05, 0.08)) / 10) * 10 : 0;
  }

  private raiseImport(supplierId: string, wanted: { product: Product; qty: number }[], purchaseRequestNo: string | null, forceTypo = false) {
    const supplier = this.s.suppliers.find((x) => x.supplierId === supplierId)!;
    const rate = rateOn(this.s.exchangeRates, supplier.currency, this.day) ?? 1;
    const lineItems: ImportOrderLineItem[] = wanted.map(({ product, qty }) => ({
      sku: product.sku,
      abv: product.abv,
      qty,
      unitPrice: r2((referencePurchasePrice(product, this.s.taxSettings) * this.r(0.93, 1.03)) / rate),
    }));
    // About one order in eight arrives from the supplier with a price typed wrong — validation catches it.
    const typo = forceTypo || this.chance(0.12);
    const entered = typo ? lineItems.map((l, i) => (i === 0 ? { ...l, unitPrice: r2(l.unitPrice * 10) } : l)) : lineItems;
    const eta = addDays(this.day, this.leadDays(supplierId));
    const totalQty = lineItems.reduce((s, l) => s + l.qty, 0);
    const port = supplier.country === "japan" || supplier.defaultIncoterms === "CIF" ? "Bangkok Port, Thailand" : "Laem Chabang Port, Thailand";
    const carriers = ["MAEU", "MSCU", "CMAU", "OOLU", "HLCU", "ONEY", "EGLV"];
    const intake = this.pick([
      { th: "กรอกข้อมูลเอง", en: "Manual Entry" },
      { th: "กรอกข้อมูลเอง", en: "Manual Entry" },
      { th: "อัปโหลด Excel/CSV", en: "Excel/CSV Upload" },
      { th: "อีเมล + OCR", en: "Email + OCR" },
    ]);
    const res = this.act("orderOfficer", "09:30", `import ${supplierId}`, (s, c) =>
      A.createImportOrder(s, c, {
        supplierId,
        country: supplier.country,
        incoterms: supplier.defaultIncoterms,
        orderDate: this.day,
        etaDate: eta,
        intakeMethod: intake,
        lineItems: entered,
        logistics: {
          manufacturerRegNo: supplier.manufacturerRegNo,
          blAwbNumber: `${this.pick(carriers)}-${this.ri(1_000_000, 9_999_999)}`,
          origin: supplier.origin,
          destination: port,
          currency: supplier.currency,
          paymentTerms: supplier.paymentTerms,
        },
        importLicenseNo: this.importLicenseFor(totalQty, eta),
        purchaseRequestNo,
        freightInsuranceThb: this.estimateFreight(supplier.defaultIncoterms, lineItems, rate),
      }),
    );
    if (!res.ok || !res.order) return;
    this.followImport(res.order.orderNo, typo ? lineItems : undefined);
  }

  /** An import order from raising to paying the supplier. `fix`: the corrected lines, when they were entered wrong. */
  private followImport(orderNo: string, fix?: ImportOrderLineItem[], approver?: Who) {
    const order = this.s.importOrders.find((o) => o.orderNo === orderNo)!;
    if (order.status === "issueDetected" && fix) {
      this.at(addWorkdays(this.day, 1), "09:20", `correct ${orderNo}`, () => {
        this.act("orderOfficer", "09:20", `correct ${orderNo}`, (s, c) => A.correctImportOrderLines(s, c, orderNo, fix));
        this.at(addWorkdays(this.day, 1), "10:00", `approve ${orderNo}`, () => this.approveImport(orderNo, approver));
      });
      return;
    }
    if (order.status === "issueDetected") return;
    this.at(addWorkdays(this.day, this.chance(0.3) ? 2 : 1), "10:00", `approve ${orderNo}`, () => this.approveImport(orderNo, approver));
  }

  private rejectedOnce = false;

  private approveImport(orderNo: string, approver?: Who) {
    const order = this.s.importOrders.find((o) => o.orderNo === orderNo)!;
    if (order.status !== "staging" && order.status !== "pendingApproval") return;
    const who = approver ?? (order.firstApprover ? (SUPERVISORS.find((w) => CTX[w].actor.en !== order.firstApprover!.en) ?? "piyada") : this.pick(SUPERVISORS));
    // Once, a supervisor sends an order back for a better price; purchasing renegotiates and resubmits.
    if (!this.rejectedOnce && !this.mentorImport.has(orderNo) && !order.firstApprover && this.workdayIndex > 40) {
      this.rejectedOnce = true;
      this.act(who, "10:00", `reject ${orderNo}`, (s, c) => A.rejectImportOrder(s, c, orderNo, "Price is above our last order from this supplier — renegotiate"));
      const lines = (order.lineItems ?? []).map((l) => ({ ...l, unitPrice: r2(l.unitPrice * 0.95) }));
      this.at(addWorkdays(this.day, 2), "09:20", `resubmit ${orderNo}`, () => {
        this.act("orderOfficer", "09:20", `resubmit ${orderNo}`, (s, c) => A.correctImportOrderLines(s, c, orderNo, lines));
        this.at(addWorkdays(this.day, 1), "10:00", `approve ${orderNo}`, () => this.approveImport(orderNo));
      });
      return;
    }
    const res = this.act(who, order.firstApprover ? "10:15" : "10:00", `approve ${orderNo}`, (s, c) => A.approveImportOrder(s, c, orderNo));
    if (!res.ok) return;
    const after = this.s.importOrders.find((o) => o.orderNo === orderNo)!;
    if (after.status === "pendingApproval") {
      // High value: the other supervisor signs off the next day.
      this.at(addWorkdays(this.day, 1), "10:15", `second sign-off ${orderNo}`, () => this.approveImport(orderNo));
      return;
    }
    this.planArrival(orderNo);
  }

  private planArrival(orderNo: string) {
    const order = this.s.importOrders.find((o) => o.orderNo === orderNo)!;
    // About one shipment in five is late: purchasing moves the ETA when the forwarder says so.
    if (this.chance(0.2)) {
      const notice = addDays(order.etaDate, -this.ri(5, 9));
      const newEta = addDays(order.etaDate, this.ri(3, 8));
      this.at(notice > this.day ? notice : addWorkdays(this.day, 1), "11:00", `delay ${orderNo}`, () =>
        this.act("orderOfficer", "11:00", `delay ${orderNo}`, (s, c) => A.updateImportOrder(s, c, orderNo, { etaDate: newEta })),
      );
    }
    this.at(order.etaDate, "10:00", `customs ${orderNo}`, () => this.clearCustoms(orderNo));
  }

  private clearCustoms(orderNo: string) {
    const order = this.s.importOrders.find((o) => o.orderNo === orderNo)!;
    if (order.status !== "approved") return;
    if (order.etaDate > this.day) {
      this.at(order.etaDate, "10:00", `customs ${orderNo}`, () => this.clearCustoms(orderNo));
      return;
    }
    const src = sourceImportOrders.find((o) => o.orderNo === orderNo);
    const declarationNo = src?.declarationNo ?? `105-${this.day.slice(0, 4)}-${String(this.declarationSeq++).padStart(4, "0")}`;
    // Customs converts at the rate on the day of clearance, so what it charges differs a little from the estimate.
    const { importDuty, exciseTax, localTax, funds, vat } = computeImportTax(
      order.lineItems ?? [],
      this.s.products,
      this.s.taxSettings,
      rateOn(this.s.exchangeRates, order.currency ?? "THB", this.day) ?? order.exchangeRate ?? 1,
      order.tax?.freightInsuranceThb ?? 0,
    );
    const res = this.act("docOfficer", "10:00", `customs ${orderNo}`, (s, c) => A.recordCustomsClearance(s, c, orderNo, declarationNo, { importDuty, exciseTax, localTax, funds, vat }));
    if (res.ok) this.at(addWorkdays(this.day, this.ri(1, 2)), "10:30", `receive ${orderNo}`, () => this.receive(orderNo));
  }

  private receive(orderNo: string) {
    const order = this.s.importOrders.find((o) => o.orderNo === orderNo)!;
    const port = order.logistics?.destination ?? "";
    const warehouse = port.includes("Laem Chabang") ? "whB" : "whA";
    const short = this.chance(0.12);
    const bySku = new Map<string, number>();
    for (const l of order.lineItems ?? []) bySku.set(l.sku, (bySku.get(l.sku) ?? 0) + l.qty);
    const lines = [...bySku].map(([skuCode, ordered], i) => ({
      sku: skuCode,
      orderedQty: ordered,
      receivedQty: short && i === 0 ? ordered - this.ri(1, 6) : ordered,
      lotBatch: "",
      exciseStampDate: this.day,
    }));
    // Lot numbers in the house style: LOT-A + year and month received + a running number.
    for (const l of lines) {
      const prefix = `LOT-A${this.day.slice(2, 4)}${this.day.slice(5, 7)}-`;
      const used = this.s.inventory.filter((i) => i.lotBatch.startsWith(prefix)).length + lines.filter((x) => x.lotBatch).length;
      l.lotBatch = `${prefix}${String(used + 1).padStart(2, "0")}`;
    }
    const goods = order.totalValue;
    const additionalCostThb = Math.round(((order.tax?.freightInsuranceThb ?? 0) + goods * this.r(0.015, 0.03)) / 10) * 10;
    const res = this.act("whOfficer", "10:30", `receive ${orderNo}`, (s, c) => A.receiveGoods(s, c, { orderNo, receivedDate: this.day, warehouse, lines, additionalCostThb }));
    if (!res.ok) return;
    const receivedOn = this.day;
    this.at(addWorkdays(this.day, this.ri(0, 1)), "11:00", `supplier invoice ${orderNo}`, () => {
      const supplier = this.s.suppliers.find((x) => x.supplierId === order.supplierId)!;
      const ref = `${supplier.supplierId.replace("SUP-", "INV")}-${orderNo.slice(-4)}`;
      const r = this.act("manager", "11:00", `supplier invoice ${orderNo}`, (s, c) => A.recordSupplierInvoice(s, c, orderNo, ref, receivedOn));
      if (!r.ok) return;
      const doc = this.s.apDocuments.find((x) => x.type === "invoice" && x.importOrderNo === orderNo)!;
      const payOn = addDays(doc.dueDate ?? receivedOn, supplier.paymentTermDays === 0 ? 0 : this.ri(-2, 3));
      this.at(payOn < this.day ? this.day : payOn, "11:30", `pay ${doc.docNo}`, () => this.paySupplier(doc.docNo));
    });
  }

  private paySupplier(docNo: string) {
    const open = A.apOpenAmount(this.s.apDocuments, docNo);
    if (open <= 0) return;
    const inv = this.s.apDocuments.find((x) => x.docNo === docNo)!;
    const rate = inv.currency === "THB" ? 1 : (rateOn(this.s.exchangeRates, inv.currency, this.day) ?? inv.rate);
    this.act("manager", "11:30", `pay ${docNo}`, (s, c) => A.recordSupplierPayment(s, c, docNo, open, rate, "transfer", `TT-${this.day.replaceAll("-", "")}-${docNo.slice(-3)}`));
  }

  // ── the spreadsheet's import orders, the first after go-live ──

  private sourceImport(i: number) {
    const src = sourceImportOrders[i];
    this.at(this.day, "09:15", src.orderNo, () => {
      const supplier = this.s.suppliers.find((x) => x.supplierId === src.supplierId)!;
      const rate = rateOn(this.s.exchangeRates, supplier.currency, this.day) ?? 1;
      // Reconstructed at cost price; the supplier charges the same share of cost less duty and excise.
      const toSupplier = (l: ImportOrderLineItem): ImportOrderLineItem => {
        const product = this.s.products.find((p) => p.sku === l.sku)!;
        return { ...l, unitPrice: r2((l.unitPrice * (referencePurchasePrice(product, this.s.taxSettings) / product.costPrice)) / rate) };
      };
      const lines = src.lines.map(toSupplier);
      const totalQty = lines.reduce((s, l) => s + l.qty, 0);
      const res = this.act("orderOfficer", "09:15", src.orderNo, (s, c) =>
        A.createImportOrder(s, c, {
          supplierId: src.supplierId,
          country: src.country,
          incoterms: src.incoterms,
          orderDate: this.day,
          etaDate: addDays(this.day, src.leadDays),
          intakeMethod: this.pick([{ th: "อีเมล + OCR", en: "Email + OCR" }, { th: "อัปโหลด Excel/CSV", en: "Excel/CSV Upload" }]),
          lineItems: lines,
          logistics: { ...src.logistics, currency: supplier.currency },
          importLicenseNo: this.importLicenseFor(totalQty, addDays(this.day, src.leadDays)),
          freightInsuranceThb: this.estimateFreight(src.incoterms, lines, rateOn(this.s.exchangeRates, supplier.currency, this.day) ?? 1),
        }),
      );
      if (!res.ok || !res.order) return;
      if (i === 0) {
        const from = res.order.orderNo;
        this.s.importOrders = this.s.importOrders.map((o) => (o.orderNo === from ? { ...o, orderNo: src.orderNo } : o));
        this.s.auditLog = this.s.auditLog.map((e) => (e.entityType === "importOrder" && e.entityId === from ? { ...e, entityId: src.orderNo } : e));
      }
      // The sheet's ABV error is corrected the next day.
      const fix = src.lines.some((l) => l.abv > 75)
        ? lines.map((l) => ({ ...l, abv: this.s.products.find((p) => p.sku === l.sku)!.abv }))
        : undefined;
      this.followImport(src.orderNo, fix, src.approver);
    });
  }

  // ── the month's routine ──

  private monthly(d: string) {
    const month = d.slice(0, 7);
    const prev = addDays(`${month}-01`, -1).slice(0, 7);
    const firstMonth = this.start.slice(0, 7);
    for (const cost of this.monthlyCosts()) {
      const due = nextWorkday(`${month}-${String(cost.day).padStart(2, "0")}`);
      if (due === d) this.at(d, "10:45", `expense ${cost.payee}`, () => this.payExpense(cost, month));
    }
    if (prev >= firstMonth) {
      if (d === nextWorkday(`${month}-07`)) this.at(d, "10:00", `remit WHT ${prev}`, () => this.act("taxOfficer", "10:00", `remit WHT ${prev}`, (s, c) => A.remitWithholding(s, c, prev, `PND ${prev}`)));
      if (d === nthWorkdayOfMonth(month, 3)) this.at(d, "09:00", `statement ${prev}`, () => this.importStatement(`${prev}-01`, lastOfMonth(`${prev}-01`), true));
      if (d === nextWorkday(`${month}-10`))
        this.at(d, "16:30", `close ${prev}`, () => {
          // Reconciled before it's closed.
          this.explainFees(lastOfMonth(`${prev}-01`));
          this.act("manager", "16:30", `close ${prev}`, (s, c) => A.closePeriod(s, c, lastOfMonth(`${prev}-01`)));
        });
    }
    if (d === lastWorkdayOfMonth(d)) {
      this.at(d, "16:00", `salaries ${month}`, () => this.salaries(month));
      const m = Number(month.slice(5, 7));
      const counts = ["whA", ...(m % 2 === 0 ? ["whB"] : []), ...(m % 3 === 0 ? ["whC"] : [])];
      for (const w of counts) this.at(d, "13:00", `count ${w}`, () => this.stockCount(w, true));
    }
    // A transfer of fast sellers to Chiang Mai each month.
    if (d === nthWorkdayOfMonth(month, 8)) this.at(d, "14:30", "transfer north", () => this.transferNorth());
  }

  private monthlyCosts(): MonthlyCost[] {
    const deliveries = (month: string) => {
      const prev = addDays(`${month}-01`, -1).slice(0, 7);
      return this.s.salesOrders.filter((o) => o.statusHistory?.some((h) => h.status === "delivered" && (h.at ?? "").slice(0, 7) === prev)).length;
    };
    return [
      { day: 5, payee: "บริษัท สาทร พร็อพเพอร์ตี้ จำกัด", first12: "010554501234", payeeType: "company", account: "6200", description: { th: "ค่าเช่าสำนักงานและคลังสินค้า A", en: "Office and Warehouse A rent" }, amount: () => 85_000, vat: false, wht: 5 },
      { day: 5, payee: "บริษัท แหลมฉบัง โลจิสติกส์ พาร์ค จำกัด", first12: "020554900218", payeeType: "company", account: "6200", description: { th: "ค่าเช่าคลังสินค้า B ชลบุรี", en: "Warehouse B rent, Chonburi" }, amount: () => 45_000, vat: false, wht: 5 },
      { day: 6, payee: "นายประเสริฐ ใจดี", first12: "350010023456", payeeType: "individual", account: "6200", description: { th: "ค่าเช่าคลังสินค้า C เชียงใหม่", en: "Warehouse C rent, Chiang Mai" }, amount: () => 18_000, vat: false, wht: 5 },
      {
        day: 10, payee: "บริษัท ด่วนไว โลจิสติกส์ จำกัด", first12: "010555102345", payeeType: "company", account: "6400",
        description: { th: "ค่าขนส่งสินค้าถึงลูกค้า (เดือนก่อน)", en: "Deliveries to customers (last month)" },
        amount: (m) => Math.max(6_000, deliveries(m) * 450), vat: true, wht: 1,
      },
      { day: 15, payee: "สำนักงานบัญชี ตรงเวลา", first12: "310120034567", payeeType: "individual", account: "6600", description: { th: "ค่าทำบัญชีรายเดือน", en: "Monthly bookkeeping fee" }, amount: () => 15_000, vat: false, wht: 3 },
      { day: 20, payee: "การไฟฟ้านครหลวง", first12: "099400016551", payeeType: "company", account: "6300", description: { th: "ค่าไฟฟ้าสำนักงานและคลัง A", en: "Electricity, office and Warehouse A" }, amount: () => roundTo(9_000 + this.r(0, 3_500), 10), vat: true, wht: 0 },
      { day: 22, payee: "บริษัท สยาม การ์ด ซีเคียวริตี้ จำกัด", first12: "010555304412", payeeType: "company", account: "6900", description: { th: "ค่าบริการรักษาความปลอดภัยคลังสินค้า", en: "Warehouse security service" }, amount: () => 18_000, vat: true, wht: 3 },
      { day: 25, payee: "บริษัท สปาร์คเคิล คลีนนิ่ง จำกัด", first12: "010556007781", payeeType: "company", account: "6900", description: { th: "ค่าบริการทำความสะอาด", en: "Cleaning service" }, amount: () => 6_500, vat: true, wht: 3 },
    ];
  }

  private payExpense(cost: MonthlyCost, month: string) {
    const amount = r2(cost.amount(month));
    this.act("taxOfficer", "10:45", `expense ${cost.payee}`, (s, c) =>
      A.recordExpense(s, c, {
        date: this.day,
        payee: cost.payee,
        payeeTaxId: taxId(cost.first12),
        payeeType: cost.payeeType,
        account: cost.account,
        description: cost.description,
        amount,
        vat: cost.vat ? r2(amount * 0.07) : 0,
        whtRate: cost.wht,
        method: "transfer",
        reference: `TT-${this.day.replaceAll("-", "")}`,
      }),
    );
  }

  private salaries(month: string) {
    this.act("manager", "16:00", `salaries ${month}`, (s, c) =>
      A.postJournal(s, c, {
        date: this.day,
        memo: { th: `เงินเดือนพนักงาน ${month}`, en: `Staff salaries ${month}` },
        lines: [
          { account: "6100", debit: 215_000, credit: 0 },
          { account: "1110", debit: 0, credit: 215_000 },
        ],
      }),
    );
  }

  /** The statement so far this month, up to last Friday — the bookkeeper reconciles every Monday. */
  private weeklyStatement() {
    const to = addWorkdays(this.day, -1);
    this.importStatement(`${to.slice(0, 7)}-01`, to, false);
  }

  /** The next day a statement is imported: a Monday, or the third working day of a month. */
  private nextImport(after: string): string {
    let d = addDays(after, 1);
    while (!(isWorkday(d) && (weekday(d) === 1 || d === nthWorkdayOfMonth(d.slice(0, 7), 3)))) d = addDays(d, 1);
    return d;
  }

  /**
   * Imports the bank's statement for a period: every bank movement in the books on its day, the bank's SWIFT fee on
   * each payment abroad, and the account fee at month end. Fees are explained with a journal at the next import —
   * at once for a month's final statement, which is reconciled before the month is closed. The latest statement is
   * left as the bookkeeper would find it: its fees still to explain, and a transfer in nobody has matched yet.
   */
  private importStatement(from: string, to: string, monthEnd: boolean) {
    const last = this.nextImport(this.day) >= this.today;
    this.explainFees();
    const matched = new Set(this.s.bankLines.map((l) => l.matchedEntryId).filter(Boolean));
    const entries = buildJournal(this.s).filter((e) => e.date >= from && e.date <= to && !matched.has(e.id));
    const lines: { date: string; description: string; amount: number; reference: string }[] = [];
    for (const e of entries) {
      const amount = r2(bankAmount(e));
      if (amount === 0) continue;
      lines.push({ date: e.date, description: amount > 0 ? (e.source === "receipt" ? "TRANSFER IN" : "DEPOSIT") : e.source === "supplierPayment" ? "SWIFT TRANSFER OUT" : "TRANSFER OUT", amount, reference: e.ref });
      if (e.source === "supplierPayment") lines.push({ date: e.date, description: "SWIFT CHARGE", amount: -roundTo(350 + hash01(e.ref) * 300, 5), reference: `SWIFT ${e.ref}` });
    }
    const monthEndDay = lastWorkdayOfMonth(to);
    if (monthEnd || (monthEndDay >= from && monthEndDay <= to))
      lines.push({ date: monthEndDay, description: "BANK CHARGE", amount: -roundTo(150 + hash01(to) * 250, 5), reference: `FEE-${to.slice(0, 7).replace("-", "")}` });
    if (last) {
      lines.push({ date: to, description: "TRANSFER IN RIVERSIDE BAR", amount: 20_000, reference: "INW-77812" });
      // A quiet week still has the bank's fee for clearing cheques.
      if (!lines.some((l) => l.amount < 0 && l.description.includes("CHARGE")))
        lines.push({ date: to, description: "BANK CHARGE", amount: -roundTo(20 + hash01(`chq${to}`) * 60, 5), reference: `FEE-CHQ-${to.replaceAll("-", "")}` });
    }
    if (lines.length === 0) return;
    const res = this.act("manager", "09:00", `statement ${from}..${to}`, (s, c) => A.importBankLines(s, c, lines));
    if (res.ok && monthEnd && !last) this.explainFees();
  }

  /** Bank fees on the statement get a journal each, matched to the line as it is posted (up to a date, if given). */
  private explainFees(through?: string) {
    for (const line of this.s.bankLines.filter((l) => !l.matchedEntryId && (l.description === "SWIFT CHARGE" || l.description === "BANK CHARGE") && (!through || l.date <= through))) {
      const fee = -line.amount;
      this.act("manager", "09:10", `bank fee ${line.reference}`, (s, c) =>
        A.postJournal(s, c, {
          date: line.date,
          memo: line.description === "SWIFT CHARGE" ? { th: `ค่าธรรมเนียมโอนเงินต่างประเทศ ${line.reference.replace("SWIFT ", "")}`, en: `SWIFT charge on ${line.reference.replace("SWIFT ", "")}` } : { th: `ค่าธรรมเนียมบัญชีธนาคาร ${line.date.slice(0, 7)}`, en: `Bank account fee ${line.date.slice(0, 7)}` },
          lines: [
            { account: "6900", debit: fee, credit: 0 },
            { account: "1110", debit: 0, credit: fee },
          ],
          bankLineId: line.id,
        }),
      );
    }
  }

  private stockCount(warehouse: string, post: boolean) {
    if (!this.s.inventory.some((i) => i.warehouse === warehouse && i.quantityRemaining > 0)) return;
    const res = this.act("whOfficer", "13:00", `count ${warehouse}`, (s, c) => A.startStockCount(s, c, warehouse, post ? "Month-end count" : "Cycle count"));
    if (!res.ok || !res.countNo) return;
    const sc = this.s.stockCounts.find((c) => c.countNo === res.countNo)!;
    const counts = sc.lines.map((l, i) => {
      // Most lots agree; now and then a bottle or two is broken or found.
      const diff = this.chance(0.07) ? -this.ri(1, 2) : this.chance(0.02) ? 1 : 0;
      return { lotBatch: l.lotBatch, counted: post || i % 2 === 0 ? Math.max(0, l.expected + diff) : null };
    });
    this.act("whOfficer", "15:30", `enter ${res.countNo}`, (s, c) => A.enterStockCount(s, c, res.countNo!, counts.filter((x) => x.counted !== null)));
    if (post) this.act("whOfficer", "16:40", `post ${res.countNo}`, (s, c) => A.postStockCount(s, c, res.countNo!));
  }

  /** Moves one smallish lot of a fast seller from Bangkok to Chiang Mai. */
  private transferNorth() {
    const held = heldByLot(this.s.salesOrders);
    const lot = this.s.inventory
      .filter((i) => ["SKU-1003", "SKU-1007", "SKU-1012", "SKU-1010"].includes(i.sku) && i.warehouse !== "whC" && i.quantityRemaining > 0 && i.quantityRemaining <= 160 && !held.has(i.lotBatch))
      .sort((a, b) => a.quantityRemaining - b.quantityRemaining)[0];
    if (!lot) return;
    this.act("whOfficer", "14:30", `transfer ${lot.lotBatch}`, (s, c) =>
      A.adjustInventory(s, c, lot.lotBatch, { quantityRemaining: lot.quantityRemaining, receivedDate: lot.receivedDate, warehouse: "whC" }, "Transfer to Chiang Mai for northern customers"),
    );
  }

  // ── things that happen once ──

  private oneOffs(d: string) {
    const fromStart = daysBetween(this.start, d);
    const toToday = daysBetween(d, this.today);
    const once = (cond: boolean, time: string, label: string, run: () => void) => {
      if (cond) this.at(d, time, label, run);
    };
    // A new supplier of Chilean wine, and its two wines.
    once(fromStart >= 38 && !this.done.has("andes"), "14:00", "new supplier", () => this.onboardSupplier());
    // The Chiang Mai distributor has grown: more credit.
    once(fromStart >= 62 && !this.done.has("credit5"), "11:15", "credit review", () => {
      this.done.add("credit5");
      this.act("manager", "11:15", "credit CUS-0005", (s, c) => A.updateCustomerTerms(s, c, "CUS-0005", { creditLimit: 2_200_000, standardDiscount: 8, channelType: "distributor", creditTermDays: 60 }));
    });
    // The supplier's new price list for the 1-litre blend.
    once(fromStart >= 88 && !this.done.has("price"), "09:40", "price change", () => {
      this.done.add("price");
      this.act("orderOfficer", "09:40", "price SKU-1019", (s, c) => A.updateProduct(s, c, "SKU-1019", { costPrice: 1050, suggestedPrice: 1490 }));
    });
    // A distributor promotion on the lager.
    once(fromStart >= 100 && !this.done.has("promo"), "09:50", "promo price", () => {
      this.done.add("promo");
      this.act("manager", "09:50", "promo SKU-1012", (s, c) => A.setPriceOverride(s, c, "distributor", "SKU-1012", 268));
    });
    // A salary journal typed wrong, reversed and posted again.
    once(fromStart >= 115 && !this.done.has("reversal"), "16:20", "journal correction", () => this.journalCorrection());
    // The Phuket distributor's license renewed before it lapsed.
    once(toToday <= 20 && !this.done.has("renew"), "10:05", "license renewal", () => {
      this.done.add("renew");
      const l = this.s.licenses.find((x) => x.licenseNo === "LIC-SELL-2210")!;
      this.act("docOfficer", "10:05", "renew LIC-SELL-2210", (s, c) => A.updateLicense(s, c, "LIC-SELL-2210", { expiryDate: addDays(l.expiryDate, 365) }));
    });
    // The Type 5 import license renewed.
    once(toToday <= 10 && !this.done.has("imp5"), "10:20", "import license", () => {
      this.done.add("imp5");
      this.act("docOfficer", "10:20", "LIC-IMP-0014", (s, c) =>
        A.createLicense(s, c, {
          licenseNo: "LIC-IMP-0014",
          type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 5", en: "Import License Type 5" },
          holder: { th: "บริษัท เรา จำกัด", en: "Our Company Co., Ltd." },
          category: "import",
          issueDate: d,
          expiryDate: addDays(d, 364),
        }),
      );
    });
    // New customers: a craft-beer bar in Chiang Mai a month ago, a boutique hotel this week (terms not set yet).
    once(toToday <= 35 && !this.done.has("CUS-0024"), "13:30", "new customer", () => this.onboardCustomer("CUS-0024", true));
    once(toToday <= 3 && !this.done.has("CUS-0025"), "13:30", "new customer", () => this.onboardCustomer("CUS-0025", false));
    // Trade marketing: a booth at the trade fair, and a tasting dinner for hotel buyers.
    once(fromStart >= 55 && !this.done.has("fair"), "10:50", "trade fair", () => this.oneExpense("fair", "บริษัท บางกอก เทรดแฟร์ จำกัด", "010555811207", { th: "ค่าบูธงานแสดงสินค้าไวน์และสุรา", en: "Wine & spirits trade fair booth" }, 120_000));
    once(fromStart >= 130 && !this.done.has("tasting"), "10:50", "tasting dinner", () => this.oneExpense("tasting", "บริษัท สยามแกรนด์ โฮเทล จำกัด", "010554501234", { th: "งานชิมไวน์สำหรับผู้ซื้อโรงแรม", en: "Wine tasting dinner for hotel buyers" }, 38_000));
    // The last working days: work in progress for whoever opens the demo today.
    if (addWorkdays(d, 2) >= this.today && !this.done.has(`end2 ${d}`) && addWorkdays(d, 1) < this.today) {
      this.done.add(`end2 ${d}`);
      this.at(d, "11:40", "order in transit", () => this.placeOrder("CUS-0005", "11:40"));
      this.at(d, "09:35", "big import", () => this.bigImport());
    }
    if (addWorkdays(d, 1) >= this.today && !this.done.has("end1")) {
      this.done.add("end1");
      this.at(d, "09:40", "import with a typo", () => this.typoImport());
      this.at(d, "15:20", "purchase request", () => this.raisePurchaseRequest(true));
      this.at(d, "16:15", "held order", () => this.heldOrder("CUS-0015"));
      this.at(d, "16:35", "held order", () => this.heldOrder("CUS-0009"));
    }
    // A count in progress at Chiang Mai: half the lots counted so far.
    once(addWorkdays(d, 1) >= this.today && !this.done.has("open count"), "14:00", "open count", () => {
      this.done.add("open count");
      const w = this.s.inventory.some((i) => i.warehouse === "whC" && i.quantityRemaining > 0) ? "whC" : "whB";
      if (!this.s.stockCounts.some((c) => c.warehouse === w && c.status === "open")) this.stockCount(w, false);
    });
  }

  private done = new Set<string>();

  private oneExpense(key: string, payee: string, first12: string, description: Bilingual, amount: number) {
    this.done.add(key);
    this.act("taxOfficer", "10:50", `expense ${key}`, (s, c) =>
      A.recordExpense(s, c, { date: this.day, payee, payeeTaxId: taxId(first12), payeeType: "company", account: "6500", description, amount, vat: r2(amount * 0.07), whtRate: 3, method: "transfer", reference: `TT-${this.day.replaceAll("-", "")}` }),
    );
  }

  /** An order over the customer's standard discount, raised late in the day — waiting for a supervisor. */
  private heldOrder(customerId: string) {
    const c = this.s.customers.find((x) => x.customerId === customerId);
    const p = PROFILES[customerId];
    if (!c || !p || !this.licensed(c)) return;
    const lines = p.skus
      .map((k) => this.s.products.find((x) => x.sku === k))
      .filter((x): x is Product => Boolean(x))
      .filter((x) => this.freeLots(x.sku).reduce((sum, l) => sum + l.free, 0) >= p.qty[1])
      .slice(0, 2)
      .flatMap((x) => this.pickLots(x.sku, p.qty[1], computeChannelPrice(x, c.channelType, this.s.priceLists), c.standardDiscount + 4));
    if (lines.length === 0) return;
    const res = this.act("salesOfficer", this.time, `held order ${customerId}`, (s, ctx) =>
      A.createSalesOrder(s, ctx, { customerId, lines, plannedDeliveryDate: addWorkdays(this.day, TRANSIT[p.region] + 1) }),
    );
    if (res.ok && res.order) this.afterBooking(res.order.orderNo, p.region, { approver: "somchai" });
  }

  /** A large order for the whisky range: over the two-level threshold, so a second supervisor signs it off. */
  private bigImport() {
    const wanted = ["SKU-1001", "SKU-1003", "SKU-1019"].map((k) => ({ product: this.s.products.find((p) => p.sku === k)!, qty: (this.s.reorderPolicies.find((r) => r.sku === k)?.reorderQty ?? 240) * 2 }));
    this.raiseImport("SUP-001", wanted, null);
  }

  /** A supplier's order keyed in with a price ten times too high — validation holds it until it's corrected. */
  private typoImport() {
    const wanted = ["SKU-1013", "SKU-1014"].map((k) => ({ product: this.s.products.find((p) => p.sku === k)!, qty: this.s.reorderPolicies.find((r) => r.sku === k)?.reorderQty ?? 120 }));
    this.raiseImport("SUP-008", wanted, null, true);
  }

  private onboardSupplier() {
    this.done.add("andes");
    const supplier = supplierMaster.find((x) => x.supplierId === LATER_SUPPLIER)!;
    this.act("orderOfficer", "14:00", "supplier SUP-010", (s, c) => A.saveSupplier(s, c, supplier, "create"));
    for (const p of productMaster.filter((x) => LATER_SKUS.has(x.sku))) {
      const input = { sku: p.sku, name: p.name, category: p.category, abv: p.abv, packageSize: p.packageSize, unit: p.unit, unitsPerPack: p.unitsPerPack, costPrice: p.costPrice, suggestedPrice: p.suggestedPrice, hsCode: p.hsCode };
      this.act("orderOfficer", "14:10", `product ${p.sku}`, (s, c) => A.createProduct(s, c, input));
      const policy = reorderMaster.find((r) => r.sku === p.sku)!;
      this.act("orderOfficer", "14:20", `reorder ${p.sku}`, (s, c) => A.saveReorderPolicy(s, c, policy));
    }
  }

  private onboardCustomer(customerId: string, setTerms: boolean) {
    this.done.add(customerId);
    const c = customerMaster.find((x) => x.customerId === customerId)!;
    const l = licenseMaster.find((x) => x.licenseNo === c.licenseNo)!;
    this.act("docOfficer", "13:30", `license ${l.licenseNo}`, (s, ctx) =>
      A.createLicense(s, ctx, { licenseNo: l.licenseNo, type: l.type, holder: l.holder, category: "sales", issueDate: this.shiftLicense(l.issueDate), expiryDate: this.shiftLicense(l.expiryDate) }),
    );
    this.act("salesOfficer", "13:45", `customer ${customerId}`, (s, ctx) =>
      A.createCustomer(s, ctx, {
        customerId,
        name: c.name,
        taxId: c.taxId,
        branch: c.branch,
        address: c.address,
        creditTermDays: c.creditTermDays,
        channelType: c.channelType,
        licenseNo: c.licenseNo,
        creditLimit: c.creditLimit,
        standardDiscount: c.standardDiscount,
      }),
    );
    this.act("salesOfficer", "13:50", `email ${customerId}`, (s, ctx) =>
      A.updateCustomerProfile(s, ctx, customerId, { name: c.name, taxId: c.taxId, branch: c.branch, address: c.address, email: `accounts.${customerId.toLowerCase()}@example.com` }),
    );
    if (setTerms)
      this.at(addWorkdays(this.day, 1), "10:10", `terms ${customerId}`, () =>
        this.act("manager", "10:10", `terms ${customerId}`, (s, ctx) =>
          A.updateCustomerTerms(s, ctx, customerId, { creditLimit: c.creditLimit, standardDiscount: c.standardDiscount, channelType: c.channelType, creditTermDays: c.creditTermDays }),
        ),
      );
  }

  private journalCorrection() {
    this.done.add("reversal");
    const res = this.act("manager", "16:20", "accrual", (s, c) =>
      A.postJournal(s, c, {
        date: this.day,
        memo: { th: "ตั้งค้างจ่ายค่าสอบบัญชีประจำปี", en: "Accrued annual audit fee" },
        lines: [
          { account: "6600", debit: 45_000, credit: 0 },
          { account: "2900", debit: 0, credit: 45_000 },
        ],
      }),
    );
    if (!res.ok || !res.entryNo) return;
    const entryNo = res.entryNo;
    this.at(addWorkdays(this.day, 1), "09:30", "reverse accrual", () => {
      this.act("manager", "09:30", `reverse ${entryNo}`, (s, c) => A.reverseJournal(s, c, entryNo, "Amount should be 54,000 per the engagement letter"));
      this.act("manager", "09:35", "accrual again", (s, c) =>
        A.postJournal(s, c, {
          date: this.day,
          memo: { th: "ตั้งค้างจ่ายค่าสอบบัญชีประจำปี (แก้ไข)", en: "Accrued annual audit fee (corrected)" },
          lines: [
            { account: "6600", debit: 54_000, credit: 0 },
            { account: "2900", debit: 0, credit: 54_000 },
          ],
        }),
      );
    });
  }
}

export interface DemoHistory {
  store: Store;
  /** Steps the business rules refused while replaying — expected to be empty. */
  problems: string[];
}

export function buildDemoHistory(today = todayIso()): DemoHistory {
  const h = new History(today);
  const store = h.run();
  return { store, problems: h.problems };
}

/** For checks: what a store's sales orders look like by status. */
export function summarize(s: Store) {
  const booked = s.salesOrders.filter((o) => isBookedSale(o) && !isReversedSale(o));
  const by = (f: (o: SalesOrder) => string) => s.salesOrders.reduce<Record<string, number>>((m, o) => ((m[f(o)] = (m[f(o)] ?? 0) + 1), m), {});
  const imports = s.importOrders.reduce<Record<string, number>>((m, o: ImportOrder) => ((m[o.status] = (m[o.status] ?? 0) + 1), m), {});
  return {
    salesOrders: s.salesOrders.length,
    salesByStatus: by((o) => o.approvalStatus ?? o.deliveryStatus),
    salesValue: Math.round(booked.reduce((a, o) => a + o.netValue, 0)),
    importOrders: s.importOrders.length,
    importsByStatus: imports,
  };
}
