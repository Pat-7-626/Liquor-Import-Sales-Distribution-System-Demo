/*
 * Domain actions — every business rule of the system, runnable anywhere (the API server runs them).
 * Ported verbatim from the former browser data layer (src/state/DataContext), which is now an API client.
 *
 * Each action takes a Store snapshot and a Ctx (who is acting, what they may do), mutates the store,
 * and returns an ActionResult. The server loads the store inside a locked transaction, runs exactly one
 * action, and persists whatever changed — so actions never see a half-applied state.
 */
import { translate } from "../i18n/translations";
import type {
  ApDocument,
  BankLine,
  Expense,
  Quotation,
  QuotationLine,
  ExchangeRate,
  AttachedDocument,
  AuditEntry,
  Bilingual,
  ChannelCode,
  CompanyProfile,
  CountryCode,
  Customer,
  DeliveryStatus,
  ImportLogistics,
  ImportOrder,
  ImportOrderLineItem,
  InventoryItem,
  License,
  PaymentMethod,
  Permission,
  Product,
  ReceivingLine,
  ReorderPolicy,
  SalesOrder,
  SalesOrderLine,
  StockMovement,
  StockMovementType,
  Supplier,
  TaxSettings,
  Warehouse,
  WarehouseCode,
} from "../data/types";
import {
  isReversedSale,
  rateOn,
  goodsValueThb,
  landedUnitCosts,
  heldByLot,
  salesStage,
  importStage,
  computeProductStatus,
  computeLicenseStatus,
  computeImportTax,
  computeSalesNetValue,
  nextOrderNumber,
  todayIso,
  HIGH_VALUE_APPROVAL_THRESHOLD,
  describeImportOrderIssues,
  describeChanges,
  joinIssues,
  joinReasons,
  salesApprovalReasons,
  canTransitionDelivery,
  isBookedSale,
  uniqueLotBatch,
  addDays,
  sumLines,
  quantityByLot,
  isValidThaiTaxId,
  oldestOverdueDays,
  computeArOpenItems,
} from "../lib/business";
import type { Store } from "./store";
import { makeId } from "./store";
import { ACCOUNTS, EXPENSE_ACCOUNTS, SYSTEM_ACCOUNTS, bankAmount, buildJournal } from "./ledger";
import { WHT_RATES, firstOfMonth, lastOfMonth, suggestMatches, withholdingByMonth } from "./finance";

/** Who is acting and what they may do — resolved by the server from the signed-in session. */
export interface Ctx {
  actor: Bilingual;
  can: (permission: Permission) => boolean;
}

/** Every mutating action reports back instead of silently doing the wrong thing. */
export type ActionResult = { ok: true } | { ok: false; error: Bilingual };
const OK: ActionResult = { ok: true };
const fail = (th: string, en: string): ActionResult => ({ ok: false, error: { th, en } });
const DENIED = fail("บทบาทของคุณไม่มีสิทธิ์ดำเนินการนี้", "Your role isn't permitted to do this");

export interface SalesLineInput {
  sku: string;
  lotBatch: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

export interface NewSalesOrderInput {
  customerId: string;
  lines: SalesLineInput[];
  /** Defaults to the next day. */
  plannedDeliveryDate?: string;
}

/** A planned delivery date must be a real date, not before the order, and within 90 days. */
function checkPlannedDate(date: string, orderDate: string): ActionResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail("วันที่ส่งไม่ถูกต้อง", "Planned delivery date isn't valid");
  if (date < orderDate) return fail("วันที่ส่งต้องไม่ก่อนวันที่สั่งซื้อ", "Planned delivery can't be before the order date");
  if (date > addDays(todayIso(), 90)) return fail("วันที่ส่งต้องไม่เกิน 90 วันจากวันนี้", "Planned delivery must be within 90 days");
  return OK;
}

/** New terms for one existing line (products and lots don't change on edit). */
export interface SalesOrderTerms {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

export interface CustomerProfileInput {
  name: Bilingual;
  taxId: string;
  branch: string;
  address: Bilingual;
  email?: string;
}

export interface NewImportOrderInput {
  supplierId: string;
  country: CountryCode;
  incoterms: string;
  orderDate: string;
  etaDate: string;
  intakeMethod: Bilingual;
  lineItems: ImportOrderLineItem[];
  logistics: ImportLogistics;
  importLicenseNo: string | null;
  /** The approved purchase request this order fulfils. */
  purchaseRequestNo?: string | null;
}

export interface ReceiveGoodsInput {
  orderNo: string;
  receivedDate: string;
  warehouse: WarehouseCode;
  lines: ReceivingLine[];
  /** Freight, insurance and clearing for this shipment, in baht — spread over the lots' landed cost. */
  additionalCostThb?: number;
}

export interface InventoryAdjustment {
  quantityRemaining: number;
  receivedDate: string;
  warehouse: WarehouseCode;
}

export interface NewCustomerInput {
  customerId: string;
  name: Bilingual;
  taxId: string;
  branch: string;
  address: Bilingual;
  creditTermDays: number;
  channelType: ChannelCode;
  licenseNo: string | null;
  creditLimit: number;
  standardDiscount: number;
}

export interface NewLicenseInput {
  licenseNo: string;
  type: Bilingual;
  holder: Bilingual;
  category: License["category"];
  issueDate: string;
  expiryDate: string;
}

export type NewProductInput = Omit<Product, "stockAvailable" | "status">;

const isWholePositive = (n: number) => Number.isInteger(n) && n > 0;
/** Next "PREFIX-YYYY-####" document number in its own series. */
const nextDocNo = (prefix: string, existing: string[]) => {
  const series = `${prefix}-${todayIso().slice(0, 4)}-`;
  const inSeries = existing.filter((n) => n.startsWith(series));
  return inSeries.length ? nextOrderNumber(inSeries) : `${series}0001`;
};
const sameActor = (a: Bilingual | null | undefined, b: Bilingual) => Boolean(a && a.en === b.en);
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });


type Updater<T> = T | ((prev: T) => T);

/** The bindings an action body expects: state snapshot, setters, permission/actor, helpers. */
function bind(s: Store, ctx: Ctx) {
  const setter =
    <K extends keyof Store>(key: K) =>
    (u: Updater<Store[K]>) => {
      s[key] = typeof u === "function" ? (u as (prev: Store[K]) => Store[K])(s[key]) : u;
    };
  // Orders keep their own status history: whenever a setter moves an order to a new stage (or creates
  // one), the stage, time, and signed-in user are appended — no action has to remember to do it.
  const stamped =
    <K extends "salesOrders" | "importOrders">(key: K, stage: (o: Store[K][number]) => string) =>
    (u: Updater<Store[K]>) => {
      const prev = s[key];
      setter(key)(u);
      const at = new Date().toISOString();
      const next = s[key] as Store[K][number][];
      s[key] = next.map((o) => {
        const id = "orderNo" in o ? o.orderNo : "";
        const before = (prev as Store[K][number][]).find((x) => x.orderNo === id);
        const now = stage(o);
        if (before && stage(before) === now) return o;
        return { ...o, statusHistory: [...(o.statusHistory ?? []), { status: now, at, actor: ctx.actor }] };
      }) as Store[K];
    };
  return {
    ...s,
    setProducts: setter("products"),
    setImportOrders: stamped("importOrders", (o) => importStage(o as ImportOrder)),
    setLicenses: setter("licenses"),
    setCustomers: setter("customers"),
    setSalesOrders: stamped("salesOrders", (o) => salesStage(o as SalesOrder)),
    setInventory: setter("inventory"),
    setAuditLog: setter("auditLog"),
    setSuppliers: setter("suppliers"),
    setWarehouses: setter("warehouses"),
    setPriceLists: setter("priceLists"),
    setTaxSettings: setter("taxSettings"),
    setReorderPolicies: setter("reorderPolicies"),
    setStockMovements: setter("stockMovements"),
    setArDocuments: setter("arDocuments"),
    setCompany: setter("company"),
    setExchangeRates: setter("exchangeRates"),
    setApDocuments: setter("apDocuments"),
    setExpenses: setter("expenses"),
    setManualJournals: setter("manualJournals"),
    setBankLines: setter("bankLines"),
    setQuotations: setter("quotations"),
    setPurchaseRequests: setter("purchaseRequests"),
    setArReminders: setter("arReminders"),
    setStockCounts: setter("stockCounts"),
    allowed: ctx.can,
    actorRef: { current: ctx.actor },
    pushAudit: (entry: Omit<AuditEntry, "id" | "timestamp" | "actor"> & { actor?: Bilingual }) => pushAudit(s, ctx, entry),
    recordMovement: (m: Omit<StockMovement, "id" | "timestamp" | "actor">) => recordMovement(s, ctx, m),
    moveStock: (sku: string, lotBatch: string, delta: number, type: StockMovementType, reference: string) =>
      moveStock(s, ctx, sku, lotBatch, delta, type, reference),
    moveBalance: (customerId: string, delta: number) => moveBalance(s, ctx, customerId, delta),
    checkSaleFeasible: (customer: Customer, lines: { sku: string; lotBatch: string; quantity: number }[], orderNo?: string) =>
      checkSaleFeasible(s, ctx, customer, lines, orderNo),
    auditMasterChange: (entityType: AuditEntry["entityType"], entityId: string, created: boolean, changes: string[]) =>
      auditMasterChange(s, ctx, entityType, entityId, created, changes),
  };
}

function pushAudit(s: Store, ctx: Ctx, entry: Omit<AuditEntry, "id" | "timestamp" | "actor"> & { actor?: Bilingual }) {
  const { setAuditLog, actorRef } = bind(s, ctx);

const full: AuditEntry = { ...entry, actor: entry.actor ?? actorRef.current, id: makeId(), timestamp: new Date().toISOString() };
setAuditLog((prev) => [full, ...prev]);
}

function recordMovement(s: Store, ctx: Ctx, m: Omit<StockMovement, "id" | "timestamp" | "actor">) {
  const { setStockMovements, actorRef } = bind(s, ctx);

if (m.quantity === 0) return;
const full: StockMovement = { ...m, id: makeId(), timestamp: new Date().toISOString(), actor: actorRef.current };
setStockMovements((prev) => [full, ...prev]);
}

function moveStock(s: Store, ctx: Ctx, sku: string, lotBatch: string, delta: number, type: StockMovementType, reference: string) {
  const { inventory, setProducts, setInventory, recordMovement } = bind(s, ctx);

  if (delta === 0) return;
  const warehouse = inventory.find((i) => i.lotBatch === lotBatch)?.warehouse ?? "";
  setInventory((prev) => prev.map((i) => (i.lotBatch === lotBatch ? { ...i, quantityRemaining: i.quantityRemaining + delta } : i)));
  setProducts((prev) =>
    prev.map((p) => {
      if (p.sku !== sku) return p;
      const stockAvailable = Math.max(0, p.stockAvailable + delta);
      return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
    }),
  );
  recordMovement({ type, sku, lotBatch, warehouse, quantity: delta, reference });
}

function moveBalance(s: Store, ctx: Ctx, customerId: string, delta: number) {
  const { setCustomers } = bind(s, ctx);

if (delta === 0) return;
setCustomers((prev) =>
  prev.map((c) => (c.customerId === customerId ? { ...c, outstandingBalance: Math.round((c.outstandingBalance + delta) * 100) / 100 } : c)),
);
}

export function updateProduct(s: Store, ctx: Ctx, sku: string, patch: Pick<Product, "costPrice" | "suggestedPrice">): ActionResult {
  const { products, setProducts, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("editProduct")) return DENIED;
  const product = products.find((p) => p.sku === sku);
  if (!product) return fail("ไม่พบสินค้า", "Product not found");
  if (!(patch.costPrice > 0) || !(patch.suggestedPrice > 0)) return fail("ราคาต้องมากกว่า 0", "Prices must be above 0");
  const changes = describeChanges(product, patch);
  if (changes.length === 0) return OK;
  setProducts((prev) => prev.map((p) => (p.sku === sku ? { ...p, ...patch } : p)));
  const text = changes.join("; ");
  pushAudit({ entityType: "product", entityId: sku, action: "updated", sensitive: true, summary: { th: `แก้ไข ${text}`, en: `Changed ${text}` } });
  return OK;
}

export function updateLicense(s: Store, ctx: Ctx, licenseNo: string, patch: Pick<License, "expiryDate">): ActionResult {
  const { licenses, setLicenses, setCustomers, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("editLicense")) return DENIED;
  const license = licenses.find((l) => l.licenseNo === licenseNo);
  if (!license) return fail("ไม่พบใบอนุญาต", "License not found");
  if (!patch.expiryDate || patch.expiryDate <= license.issueDate)
    return fail("วันหมดอายุต้องอยู่หลังวันออกใบอนุญาต", "Expiry date must be after the issue date");
  const changes = describeChanges(license, patch);
  if (changes.length === 0) return OK;
  const live = computeLicenseStatus(patch.expiryDate);
  setLicenses((prev) => prev.map((l) => (l.licenseNo === licenseNo ? { ...l, ...patch, ...live } : l)));
  // Customers carry their own copy of the expiry used for sales checks — keep it in step, or a
  // renewal here would never unblock that customer's orders.
  setCustomers((prev) => prev.map((c) => (c.licenseNo === licenseNo ? { ...c, licenseExpiry: patch.expiryDate } : c)));
  const text = changes.join("; ");
  pushAudit({ entityType: "license", entityId: licenseNo, action: "updated", summary: { th: `แก้ไข ${text}`, en: `Changed ${text}` } });
  return OK;
}

export function updateCustomerTerms(
  s: Store,
  ctx: Ctx,
  customerId: string,
  patch: { creditLimit: number; standardDiscount: number; channelType: ChannelCode; creditTermDays: number },
): ActionResult {
  const { customers, setCustomers, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("editCustomerTerms")) return DENIED;
  const customer = customers.find((c) => c.customerId === customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  if (!(patch.creditLimit >= 0)) return fail("วงเงินเครดิตต้องไม่ติดลบ", "Credit limit can't be negative");
  if (!(patch.standardDiscount >= 0 && patch.standardDiscount <= 100))
    return fail("ส่วนลดมาตรฐานต้องอยู่ระหว่าง 0–100%", "Standard discount must be 0–100%");
  if (!Number.isInteger(patch.creditTermDays) || patch.creditTermDays < 0 || patch.creditTermDays > 365)
    return fail("ระยะเวลาเครดิตต้องเป็น 0–365 วัน", "Credit terms must be 0–365 days");
  const changes = describeChanges(customer, patch);
  if (changes.length === 0) return OK;
  setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, ...patch } : c)));
  const text = changes.join("; ");
  pushAudit({ entityType: "customer", entityId: customerId, action: "updated", sensitive: true, summary: { th: `แก้ไข ${text}`, en: `Changed ${text}` } });
  return OK;
}

/** `appliesTo`: the order whose invoice is being paid; without it the payment settles the oldest invoices first. */
export function recordPayment(s: Store, ctx: Ctx, customerId: string, amount: number, method: PaymentMethod, reference: string, appliesTo?: string | null): ActionResult {
  const { customers, arDocuments, setArDocuments, pushAudit, moveBalance, allowed, actorRef } = bind(s, ctx);

  if (!allowed("recordPayment")) return DENIED;
  const customer = customers.find((c) => c.customerId === customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  if (!(amount > 0)) return fail("จำนวนเงินต้องมากกว่า 0", "Amount must be above 0");
  if (amount > customer.outstandingBalance)
    return fail("จำนวนเงินเกินยอดค้างชำระ", "Amount exceeds the outstanding balance");
  if (appliesTo) {
    const order = s.salesOrders.find((o) => o.orderNo === appliesTo && o.customerId === customerId && isBookedSale(o) && !isReversedSale(o));
    if (!order) return fail("ไม่พบใบกำกับภาษีที่เลือกของลูกค้ารายนี้", "That invoice isn't one of this customer's open invoices");
  }
  moveBalance(customerId, -amount);
  const receiptNo = nextDocNo("RC", arDocuments.map((d) => d.docNo));
  setArDocuments((prev) => [
    {
      docNo: receiptNo,
      type: "payment",
      customerId,
      date: todayIso(),
      amount,
      method,
      reference: reference.trim(),
      actor: actorRef.current,
      ...(appliesTo ? { appliesTo } : {}),
    },
    ...prev,
  ]);
  const ref = reference.trim() ? ` (${reference.trim()})` : "";
  pushAudit({
    entityType: "customer",
    entityId: customerId,
    action: "payment",
    sensitive: true,
    summary: { th: `ใบเสร็จ ${receiptNo} รับชำระ ฿${fmt(amount)}${ref}`, en: `Receipt ${receiptNo}: payment ฿${fmt(amount)}${ref}` },
  });
  return OK;
}

export function adjustInventory(s: Store, ctx: Ctx, lotBatch: string, patch: InventoryAdjustment, reason: string): ActionResult {
  const { inventory, warehouses, setProducts, setInventory, pushAudit, recordMovement, allowed } = bind(s, ctx);

  if (!allowed("adjustInventory")) return DENIED;
  const lot = inventory.find((i) => i.lotBatch === lotBatch);
  if (!lot) return fail("ไม่พบล็อต", "Lot not found");
  if (!Number.isInteger(patch.quantityRemaining) || patch.quantityRemaining < 0)
    return fail("จำนวนคงเหลือต้องเป็นจำนวนเต็มไม่ติดลบ", "Quantity must be a whole number, 0 or more");
  if (!patch.receivedDate || patch.receivedDate > todayIso())
    return fail("วันที่รับเข้าต้องไม่อยู่ในอนาคต", "Received date can't be in the future");
  const changes = describeChanges(lot, patch);
  if (changes.length === 0) return OK;
  if (!reason.trim()) return fail("กรุณาระบุเหตุผลการปรับปรุง", "Please give a reason for the adjustment");
  if (!warehouses.some((w) => w.code === patch.warehouse && (w.active || w.code === lot.warehouse)))
    return fail("ไม่พบคลังสินค้าที่เลือก หรือคลังปิดใช้งาน", "Selected warehouse doesn't exist or is inactive");
  const delta = patch.quantityRemaining - lot.quantityRemaining;
  setInventory((prev) => prev.map((i) => (i.lotBatch === lotBatch ? { ...i, ...patch } : i)));
  // A move between warehouses is two ledger lines (out of the old, into the new) so each warehouse's
  // movement history stays complete; the lot's net is unchanged.
  if (patch.warehouse !== lot.warehouse) {
    const moveRef = `${lot.warehouse} → ${patch.warehouse}: ${reason.trim()}`;
    recordMovement({ type: "adjustment", sku: lot.sku, lotBatch, warehouse: lot.warehouse, quantity: -lot.quantityRemaining, reference: moveRef });
    recordMovement({ type: "adjustment", sku: lot.sku, lotBatch, warehouse: patch.warehouse, quantity: lot.quantityRemaining, reference: moveRef });
  }
  recordMovement({ type: "adjustment", sku: lot.sku, lotBatch, warehouse: patch.warehouse, quantity: delta, reference: reason.trim() });
  if (delta !== 0) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.sku !== lot.sku) return p;
        const stockAvailable = Math.max(0, p.stockAvailable + delta);
        return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
      }),
    );
  }
  const text = changes.join("; ");
  pushAudit({
    entityType: "inventory",
    entityId: lotBatch,
    action: "updated",
    summary: { th: `ปรับปรุงสต๊อก: ${text} — เหตุผล: ${reason.trim()}`, en: `Stock adjustment: ${text} — reason: ${reason.trim()}` },
  });
  return OK;
}

/** License + stock checks that must hold both when an order is raised and again when it's approved. */
/** `orderNo`: the order being checked, so its own hold isn't counted against it (approval re-check). */
function checkSaleFeasible(s: Store, _ctx: Ctx, customer: Customer, lines: { sku: string; lotBatch: string; quantity: number }[], orderNo?: string): ActionResult {
  if (!customer.licenseNo || !customer.licenseExpiry) return fail("ลูกค้าไม่มีใบอนุญาตขายสุรา", "Customer has no liquor license on file");
  if (computeLicenseStatus(customer.licenseExpiry).status === "expired")
    return fail("ใบอนุญาตของลูกค้าหมดอายุแล้ว", "Customer's liquor license has expired");
  for (const l of lines) {
    const lot = s.inventory.find((i) => i.lotBatch === l.lotBatch && i.sku === l.sku);
    if (!lot) return fail(`ไม่พบล็อต ${l.lotBatch} ของ ${l.sku}`, `Lot ${l.lotBatch} not found for ${l.sku}`);
  }
  // Two lines may draw on the same lot — the lot must cover them together, after what other orders
  // waiting for approval already hold.
  const held = heldByLot(s.salesOrders, orderNo);
  for (const [lotBatch, qty] of quantityByLot(lines)) {
    const lot = s.inventory.find((i) => i.lotBatch === lotBatch)!;
    const onHold = held.get(lotBatch) ?? 0;
    const free = lot.quantityRemaining - onHold;
    if (qty > free)
      return onHold > 0
        ? fail(
            `สต๊อกในล็อต ${lotBatch} ไม่พอ (คงเหลือ ${lot.quantityRemaining} ถูกจองโดยออเดอร์ที่รออนุมัติ ${onHold})`,
            `Not enough stock in ${lotBatch}: ${lot.quantityRemaining} left, ${onHold} held by orders awaiting approval`,
          )
        : fail(`สต๊อกในล็อต ${lotBatch} ไม่พอ (คงเหลือ ${lot.quantityRemaining})`, `Not enough stock in ${lotBatch} (${lot.quantityRemaining} left)`);
  }
  return OK;
}

/** Validates line terms; returns the priced lines or a failure. */
function priceLines(s: Store, lines: SalesLineInput[]): { ok: true; lines: SalesOrderLine[] } | { ok: false; error: Bilingual } {
  if (lines.length === 0) return fail("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ", "Add at least one product line") as { ok: false; error: Bilingual };
  if (lines.length > 50) return fail("รายการสินค้าเกิน 50 รายการ", "An order can have at most 50 lines") as { ok: false; error: Bilingual };
  const priced: SalesOrderLine[] = [];
  for (const l of lines) {
    if (!s.products.some((p) => p.sku === l.sku)) return fail(`ไม่พบสินค้า ${l.sku}`, `Product ${l.sku} not found`) as { ok: false; error: Bilingual };
    if (!isWholePositive(l.quantity)) return fail("จำนวนต้องเป็นจำนวนเต็มมากกว่า 0", "Quantity must be a whole number above 0") as { ok: false; error: Bilingual };
    if (!(l.unitPrice > 0)) return fail("ราคาต่อหน่วยต้องมากกว่า 0", "Unit price must be above 0") as { ok: false; error: Bilingual };
    if (!(l.discountPercent >= 0 && l.discountPercent < 100)) return fail("ส่วนลดต้องอยู่ระหว่าง 0–99%", "Discount must be 0–99%") as { ok: false; error: Bilingual };
    // Each line carries what its lot cost, so margins and the ledger use the cost of the goods actually sold.
    const lotCost = s.inventory.find((i) => i.lotBatch === l.lotBatch)?.unitCost;
    priced.push({ ...l, netValue: computeSalesNetValue(l.quantity, l.unitPrice, l.discountPercent), ...(lotCost !== undefined ? { unitCost: lotCost } : {}) });
  }
  return { ok: true, lines: priced };
}

const costOf = (s: Store, sku: string) => s.products.find((p) => p.sku === sku)?.costPrice ?? 0;
const linesSummary = (lines: SalesOrderLine[]) => lines.map((l) => `${l.sku} × ${l.quantity}`).join(", ");

export function createSalesOrder(s: Store, ctx: Ctx, input: NewSalesOrderInput): ActionResult & { order?: SalesOrder } {
  const { customers, salesOrders, taxSettings, setSalesOrders, pushAudit, moveStock, moveBalance, checkSaleFeasible, allowed, actorRef } = bind(s, ctx);

  if (!allowed("createSalesOrder")) return DENIED;
  const customer = customers.find((c) => c.customerId === input.customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  const priced = priceLines(s, input.lines);
  if (!priced.ok) return priced;
  const lines = priced.lines;
  const feasible = checkSaleFeasible(customer, lines);
  if (!feasible.ok) return feasible;

  const netValue = sumLines(lines);
  // The approval decision is made here from live data — never trusted from the form.
  const reasons = salesApprovalReasons({
    customer,
    lines: lines.map((l) => ({ ...l, costPrice: l.unitCost ?? costOf(s, l.sku) })),
    // Credit hold: a customer far behind on paying can still order, but a supervisor decides.
    overdueDays: oldestOverdueDays(customer, s.salesOrders, s.arDocuments),
  });
  const needsApproval = reasons.length > 0;
  const approvalReason = joinReasons(reasons);
  const actor = actorRef.current;
  const today = todayIso();
  const plannedDeliveryDate = input.plannedDeliveryDate ?? addDays(today, 1);
  const planned = checkPlannedDate(plannedDeliveryDate, today);
  if (!planned.ok) return planned;

  const order: SalesOrder = {
    plannedDeliveryDate,
    orderNo: nextOrderNumber(salesOrders.map((o) => o.orderNo)),
    customerId: customer.customerId,
    customerName: customer.name,
    channelType: customer.channelType,
    orderDate: today,
    lines,
    netValue,
    deliveryStatus: "pendingShipment",
    taxInvoiceNo: needsApproval ? "—" : nextOrderNumber(salesOrders.map((o) => o.taxInvoiceNo)),
    vatPercent: taxSettings.vatPercent,
    deliveryNoteNo: needsApproval ? "—" : nextOrderNumber(salesOrders.map((o) => o.deliveryNoteNo)),
    approver: null,
    createdBy: actor,
    // A held order isn't invoiced yet; its invoice (and due date) is issued on approval.
    ...(needsApproval
      ? { approvalStatus: "pendingApproval" as const, approvalReason }
      : {
          invoiceDate: today,
          dueDate: addDays(today, customer.creditTermDays),
          invoice: { lines, netValue, vatPercent: taxSettings.vatPercent },
        }),
  };

  setSalesOrders((prev) => [order, ...prev]);
  if (!needsApproval) {
    for (const l of lines) moveStock(l.sku, l.lotBatch, -l.quantity, "sale", order.orderNo);
    moveBalance(customer.customerId, netValue);
  }

  pushAudit({
    entityType: "salesOrder",
    entityId: order.orderNo,
    action: "created",
    summary: needsApproval
      ? {
          th: `สร้างออเดอร์ขาย ${linesSummary(lines)} — รออนุมัติ: ${approvalReason!.th} (FR-22/28)`,
          en: `Created sales order: ${linesSummary(lines)} — awaiting approval: ${approvalReason!.en} (FR-22/28)`,
        }
      : { th: `สร้างออเดอร์ขาย ${linesSummary(lines)}`, en: `Created sales order: ${linesSummary(lines)}` },
  });
  return { ok: true, order };
}

export function approveSalesOrder(s: Store, ctx: Ctx, orderNo: string): ActionResult {
  const { customers, salesOrders, taxSettings, setSalesOrders, pushAudit, moveStock, moveBalance, checkSaleFeasible, allowed, actorRef } = bind(s, ctx);

  if (!allowed("approve")) return DENIED;
  const order = salesOrders.find((o) => o.orderNo === orderNo);
  if (!order || order.approvalStatus !== "pendingApproval") return fail("ออเดอร์นี้ไม่ได้รออนุมัติ", "This order isn't awaiting approval");
  const actor = actorRef.current;
  if (sameActor(order.createdBy, actor))
    return fail("ผู้สร้างออเดอร์ไม่สามารถอนุมัติออเดอร์ของตนเองได้", "You can't approve an order you raised yourself");
  const customer = customers.find((c) => c.customerId === order.customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  // Stock or the license may have changed while the order waited in the queue — re-check before booking.
  const feasible = checkSaleFeasible(customer, order.lines, orderNo);
  if (!feasible.ok) return feasible;

  const taxInvoiceNo = nextOrderNumber(salesOrders.map((o) => o.taxInvoiceNo));
  const deliveryNoteNo = nextOrderNumber(salesOrders.map((o) => o.deliveryNoteNo));
  const today = todayIso();
  setSalesOrders((prev) =>
    // The invoice is issued now, so it carries today's date, due date, and VAT rate.
    prev.map((o) =>
      o.orderNo === orderNo
        ? {
            ...o,
            approvalStatus: undefined,
            approver: actor,
            taxInvoiceNo,
            deliveryNoteNo,
            vatPercent: taxSettings.vatPercent,
            invoiceDate: today,
            dueDate: addDays(today, customer.creditTermDays),
            // The tax invoice as issued — later edits are credit/debit notes against it.
            invoice: { lines: o.lines, netValue: o.netValue, vatPercent: taxSettings.vatPercent },
          }
        : o,
    ),
  );
  for (const l of order.lines) moveStock(l.sku, l.lotBatch, -l.quantity, "sale", orderNo);
  moveBalance(order.customerId, order.netValue);

  pushAudit({
    entityType: "salesOrder",
    entityId: orderNo,
    action: "approved",
    sensitive: true,
    summary: {
      th: `อนุมัติ (${order.approvalReason?.th ?? "ส่วนลด"}) และออกเอกสาร ${taxInvoiceNo}`,
      en: `Approved (${order.approvalReason?.en ?? "discount"}) and issued ${taxInvoiceNo}`,
    },
  });
  return OK;
}

export function rejectSalesOrderApproval(s: Store, ctx: Ctx, orderNo: string, reason: string): ActionResult {
  const { salesOrders, setSalesOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("approve")) return DENIED;
  const order = salesOrders.find((o) => o.orderNo === orderNo);
  if (!order || order.approvalStatus !== "pendingApproval") return fail("ออเดอร์นี้ไม่ได้รออนุมัติ", "This order isn't awaiting approval");
  if (!reason.trim()) return fail("กรุณาระบุเหตุผล", "A reason is required");
  setSalesOrders((prev) =>
    prev.map((o) => (o.orderNo === orderNo ? { ...o, approvalStatus: "rejected", approvalNote: { th: reason, en: reason } } : o)),
  );
  pushAudit({ entityType: "salesOrder", entityId: orderNo, action: "rejected", summary: { th: reason, en: reason } });
  return OK;
}

/**
 * Re-prices or re-quantifies an order's lines (same products and lots). A booked order's stock and
 * balance move by the difference, documented with a credit or debit note against the issued invoice.
 */
export function editSalesOrder(s: Store, ctx: Ctx, orderNo: string, terms: SalesOrderTerms[]): ActionResult {
  const { salesOrders, customers, inventory, arDocuments, setSalesOrders, setArDocuments, pushAudit, moveStock, moveBalance, allowed, actorRef } = bind(s, ctx);

  if (!allowed("editSalesOrder")) return DENIED;
  const order = salesOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  const booked = isBookedSale(order);
  if (order.approvalStatus === "rejected" || (booked && order.deliveryStatus !== "pendingShipment"))
    return fail("แก้ไขได้เฉพาะออเดอร์ที่ยังไม่จัดส่ง", "Only orders that haven't shipped can be edited");
  if (terms.length !== order.lines.length) return fail("จำนวนรายการไม่ตรงกับออเดอร์", "Edit every line of the order (same number of lines)");

  const priced = priceLines(s, order.lines.map((l, i) => ({ sku: l.sku, lotBatch: l.lotBatch, ...terms[i] })));
  if (!priced.ok) return priced;
  const lines = priced.lines;
  const customer = customers.find((c) => c.customerId === order.customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");

  const netValue = sumLines(lines);
  const changes = lines.flatMap((l, i) =>
    describeChanges(order.lines[i], { quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent }).map((c) => `${l.sku} ${c}`),
  );
  if (changes.length === 0) return OK;

  // Stock: a booked order already holds its quantities, so only increases need free stock; a held
  // order holds nothing, so its whole quantity must fit.
  const before = quantityByLot(order.lines);
  for (const [lotBatch, qty] of quantityByLot(lines)) {
    const lot = inventory.find((i) => i.lotBatch === lotBatch);
    const need = booked ? qty - (before.get(lotBatch) ?? 0) : qty;
    if (need > 0 && (!lot || need > lot.quantityRemaining))
      return fail(`สต๊อกในล็อต ${lotBatch} ไม่พอ`, `Not enough stock left in ${lotBatch}`);
  }

  const reasons = salesApprovalReasons({
    customer,
    lines: lines.map((l) => ({ ...l, costPrice: l.unitCost ?? costOf(s, l.sku) })),
    alreadyBooked: booked ? order.netValue : 0,
  });
  // A booked order can't be edited past the approval controls by the same person who could not
  // have booked it that way — only a supervisor's edit can carry those terms (and it's logged as such).
  if (booked && reasons.length > 0 && !allowed("approve"))
    return fail(`เงื่อนไขใหม่ต้องได้รับอนุมัติจากหัวหน้างาน: ${joinReasons(reasons)!.th}`, `The new terms need supervisor approval: ${joinReasons(reasons)!.en}`);

  setSalesOrders((prev) =>
    prev.map((o) => {
      if (o.orderNo !== orderNo) return o;
      const next = { ...o, lines, netValue };
      // A held order's reason is refreshed so the approver sees what the terms are *now*.
      if (!booked) next.approvalReason = joinReasons(reasons) ?? { th: "แก้ไขเงื่อนไขแล้ว — รอตรวจสอบ", en: "Terms edited — awaiting review" };
      return next;
    }),
  );
  let adjustmentDoc = "";
  if (booked) {
    lines.forEach((l, i) => moveStock(l.sku, l.lotBatch, order.lines[i].quantity - l.quantity, "sale", `${orderNo} (edit)`));
    const valueDelta = Math.round((netValue - order.netValue) * 100) / 100;
    moveBalance(order.customerId, valueDelta);
    // The tax invoice is already issued — a change in value is documented with a credit note
    // (decrease) or debit note (increase) against it, never by silently rewriting the invoice.
    if (valueDelta !== 0) {
      const type = valueDelta < 0 ? "creditNote" : "debitNote";
      adjustmentDoc = nextDocNo(valueDelta < 0 ? "CN" : "DN", arDocuments.map((d) => d.docNo));
      setArDocuments((prev) => [
        {
          docNo: adjustmentDoc,
          type,
          customerId: order.customerId,
          date: todayIso(),
          amount: Math.abs(valueDelta),
          reference: orderNo,
          actor: actorRef.current,
          originalValue: order.netValue,
          reason:
            valueDelta < 0
              ? { th: "ปรับลดราคา/จำนวนสินค้าตามที่ตกลงกับลูกค้า", en: "Price or quantity reduced as agreed with the customer" }
              : { th: "ปรับเพิ่มราคา/จำนวนสินค้าตามที่ตกลงกับลูกค้า", en: "Price or quantity increased as agreed with the customer" },
        },
        ...prev,
      ]);
    }
  }
  const text = changes.join("; ");
  const override = booked && reasons.length > 0 ? ` [${joinReasons(reasons)!.en} — supervisor override]` : "";
  const doc = adjustmentDoc ? ` — ${adjustmentDoc}` : "";
  pushAudit({
    entityType: "salesOrder",
    entityId: orderNo,
    action: "updated",
    sensitive: true,
    summary: { th: `แก้ไข ${text}${override}${doc}`, en: `Changed ${text}${override}${doc}` },
  });
  return OK;
}

/** Dispatch (re)plans when an order will reach the customer. Only while it's still on its way. */
export function scheduleDelivery(s: Store, ctx: Ctx, orderNo: string, date: string): ActionResult {
  const { salesOrders, setSalesOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("updateDelivery")) return DENIED;
  const order = salesOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (order.approvalStatus === "rejected" || !["pendingShipment", "inDelivery"].includes(order.deliveryStatus))
    return fail("ออเดอร์นี้ส่งเสร็จหรือปิดแล้ว", "This order is already delivered or closed");
  const ok = checkPlannedDate(date, order.orderDate);
  if (!ok.ok) return ok;
  if (date === order.plannedDeliveryDate) return OK;
  setSalesOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, plannedDeliveryDate: date } : o)));
  pushAudit({
    entityType: "salesOrder",
    entityId: orderNo,
    action: "updated",
    summary: {
      th: `กำหนดวันส่ง: ${order.plannedDeliveryDate ?? "—"} → ${date}`,
      en: `Planned delivery: ${order.plannedDeliveryDate ?? "—"} → ${date}`,
    },
  });
  return OK;
}

export function updateDeliveryStatus(s: Store, ctx: Ctx, orderNo: string, status: DeliveryStatus): ActionResult {
  const { salesOrders, arDocuments, setSalesOrders, setArDocuments, pushAudit, moveStock, moveBalance, allowed, actorRef } = bind(s, ctx);

  if (!allowed("updateDelivery")) return DENIED;
  const order = salesOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (!isBookedSale(order)) return fail("ออเดอร์ยังไม่ได้รับอนุมัติ", "The order hasn't been approved yet");
  if (status === order.deliveryStatus) return OK;
  if (!canTransitionDelivery(order.deliveryStatus, status))
    return fail("ไม่สามารถเปลี่ยนสถานะการจัดส่งข้ามขั้นตอนได้", "That delivery status change isn't allowed from the current status");

  setSalesOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, deliveryStatus: status } : o)));

  // FR-17: Returned restocks every line's lot; Damaged is a write-off (no restock). In both cases
  // the customer didn't keep the goods, so the receivable is reversed with a credit note.
  if (status === "returned" || status === "damaged") {
    if (status === "returned") for (const l of order.lines) moveStock(l.sku, l.lotBatch, l.quantity, "return", orderNo);
    moveBalance(order.customerId, -order.netValue);
    const creditNoteNo = nextDocNo("CN", arDocuments.map((d) => d.docNo));
    setArDocuments((prev) => [
      {
        docNo: creditNoteNo,
        type: "creditNote",
        customerId: order.customerId,
        date: todayIso(),
        amount: order.netValue,
        reference: orderNo,
        actor: actorRef.current,
        originalValue: order.netValue,
        reason: { th: "ลูกค้าคืนสินค้า", en: "Goods returned by the customer" },
      },
      ...prev,
    ]);
    for (const l of order.lines)
      pushAudit({
        entityType: "inventory",
        entityId: l.lotBatch,
        action: "updated",
        summary:
          status === "returned"
            ? { th: `รับคืนสินค้าเข้าสต๊อกจากออเดอร์ ${orderNo} (+${l.quantity})`, en: `Restocked from return: ${orderNo} (+${l.quantity})` }
            : { th: `ตัดจำหน่ายสินค้าเสียหายจากออเดอร์ ${orderNo} (ไม่คืนสต๊อก)`, en: `Written off as damaged: ${orderNo} (not restocked)` },
      });
    pushAudit({
      entityType: "customer",
      entityId: order.customerId,
      action: "updated",
      sensitive: true,
      summary: {
        th: `ใบลดหนี้ ${creditNoteNo} ฿${fmt(order.netValue)} จากออเดอร์ ${orderNo}`,
        en: `Credit note ${creditNoteNo} ฿${fmt(order.netValue)} for ${orderNo}`,
      },
    });
  }

  pushAudit({
    entityType: "salesOrder",
    entityId: orderNo,
    action: "updated",
    summary: {
      th: `สถานะการจัดส่ง: ${translate("th", `status.${order.deliveryStatus}`)} → ${translate("th", `status.${status}`)}`,
      en: `Delivery status: ${translate("en", `status.${order.deliveryStatus}`)} → ${translate("en", `status.${status}`)}`,
    },
  });
  return OK;
}

export function createImportOrder(s: Store, ctx: Ctx, input: NewImportOrderInput): ActionResult & { order?: ImportOrder } {
  const { products, importOrders, licenses, suppliers, taxSettings, setImportOrders, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("createImportOrder")) return DENIED;
  const supplier = suppliers.find((sp) => sp.supplierId === input.supplierId);
  if (!supplier) return fail("กรุณาเลือกผู้ขายจากทะเบียนผู้ขาย", "Choose a supplier from the Supplier Master");
  if (!supplier.active) return fail("ผู้ขายรายนี้ถูกปิดใช้งาน", "This supplier is inactive");
  if (input.lineItems.length === 0) return fail("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ", "At least one line item is required");
  if (input.etaDate < input.orderDate) return fail("วันที่คาดว่าถึงต้องไม่ก่อนวันที่สั่ง", "ETA can't be before the order date");
  // The order is fixed at the day's rate; an order in a currency with no rate can't be valued.
  const currency = (input.logistics.currency || supplier.currency || "THB").trim().toUpperCase();
  const exchangeRate = rateOn(s.exchangeRates, currency, input.orderDate);
  if (exchangeRate === null)
    return fail(`ยังไม่มีอัตราแลกเปลี่ยน ${currency} — เพิ่มที่หน้าอัตราแลกเปลี่ยนก่อน`, `There's no exchange rate for ${currency} yet — add one under Exchange Rates first`);

  const request = input.purchaseRequestNo ? s.purchaseRequests.find((r) => r.requestNo === input.purchaseRequestNo) : undefined;
  if (input.purchaseRequestNo) {
    if (!request) return fail("ไม่พบคำขอซื้อ", "Purchase request not found");
    if (request.status !== "approved")
      return fail(`คำขอซื้อ ${request.requestNo} ยังไม่ได้รับอนุมัติหรือสั่งไปแล้ว`, `Purchase request ${request.requestNo} isn't approved, or is already ordered`);
    if (!input.lineItems.some((l) => l.sku === request.sku)) return fail(`ออเดอร์ต้องมี ${request.sku} ตามคำขอซื้อ`, `The order must include ${request.sku} from the request`);
  }

  const issues = describeImportOrderIssues({ ...input, exchangeRate }, products, licenses, taxSettings);
  const orderNo = nextOrderNumber(importOrders.map((o) => o.orderNo));
  const order: ImportOrder = {
    orderNo,
    supplierId: supplier.supplierId,
    supplier: supplier.name,
    country: input.country,
    incoterms: input.incoterms,
    orderDate: input.orderDate,
    etaDate: input.etaDate,
    skuCount: input.lineItems.length,
    currency,
    exchangeRate,
    totalValue: goodsValueThb(input.lineItems, exchangeRate),
    status: issues.length > 0 ? "issueDetected" : "staging",
    approver: null,
    customsDeclarationNo: null,
    importLicenseNo: input.importLicenseNo,
    note: joinIssues(issues),
    lineItems: input.lineItems,
    logistics: { ...input.logistics, currency },
    tax: computeImportTax(input.lineItems, products, taxSettings, exchangeRate),
    createdBy: actorRef.current,
  };

  setImportOrders((prev) => [order, ...prev]);
  if (request) {
    s.purchaseRequests = s.purchaseRequests.map((r) => (r.requestNo === request.requestNo ? { ...r, status: "ordered" as const, importOrderNo: orderNo } : r));
    pushAudit({ entityType: "purchaseRequest", entityId: request.requestNo, action: "updated", summary: { th: `สั่งซื้อแล้วใน ${orderNo}`, en: `Ordered on ${orderNo}` } });
  }
  pushAudit({
    entityType: "importOrder",
    entityId: orderNo,
    action: "created",
    summary: {
      th: `นำเข้าออเดอร์ผ่านช่องทาง: ${input.intakeMethod.th}${issues.length ? " — ตรวจพบปัญหา" : ""}`,
      en: `Order intake via ${input.intakeMethod.en}${issues.length ? " — validation issues detected" : ""}`,
    },
  });
  return { ok: true, order };
}

export function updateImportOrder(s: Store, ctx: Ctx, orderNo: string, patch: Pick<ImportOrder, "etaDate">): ActionResult {
  const { products, importOrders, licenses, setImportOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("editImportOrder")) return DENIED;
  const order = importOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (order.status === "receivedWarehouse") return fail("ออเดอร์รับเข้าคลังแล้ว แก้ไขไม่ได้", "Order is already received and closed");
  if (!patch.etaDate || patch.etaDate < order.orderDate) return fail("วันที่คาดว่าถึงต้องไม่ก่อนวันที่สั่ง", "ETA can't be before the order date");
  const changes = describeChanges(order, patch);
  if (changes.length === 0) return OK;

  // A new ETA can fall outside the license period, so orders not yet approved are re-validated.
  const revalidate = (order.status === "staging" || order.status === "issueDetected") && order.lineItems;
  const issues = revalidate ? describeImportOrderIssues({ ...order, ...patch, lineItems: order.lineItems! }, products, licenses, s.taxSettings) : [];
  setImportOrders((prev) =>
    prev.map((o) => {
      if (o.orderNo !== orderNo) return o;
      if (!revalidate) return { ...o, ...patch };
      return { ...o, ...patch, status: issues.length ? "issueDetected" : "staging", note: joinIssues(issues) };
    }),
  );
  const text = changes.join("; ");
  pushAudit({ entityType: "importOrder", entityId: orderNo, action: "updated", summary: { th: `แก้ไข ${text}`, en: `Changed ${text}` } });
  return OK;
}

export function correctImportOrderLines(s: Store, ctx: Ctx, orderNo: string, lineItems: ImportOrderLineItem[]): ActionResult {
  const { products, importOrders, licenses, taxSettings, setImportOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("editImportOrder")) return DENIED;
  const order = importOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (!["staging", "issueDetected", "rejected"].includes(order.status))
    return fail("แก้ไขรายการได้เฉพาะก่อนอนุมัติ", "Line items can only be corrected before approval");
  if (lineItems.length === 0) return fail("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ", "At least one line item is required");

  const issues = describeImportOrderIssues({ ...order, lineItems }, products, licenses, taxSettings);
  const hasIssues = issues.length > 0;
  const resubmitted = order.status === "rejected";

  setImportOrders((prev) =>
    prev.map((o) =>
      o.orderNo === orderNo
        ? {
            ...o,
            lineItems,
            skuCount: lineItems.length,
            totalValue: goodsValueThb(lineItems, order.exchangeRate ?? 1),
            tax: computeImportTax(lineItems, products, taxSettings, order.exchangeRate ?? 1),
            status: hasIssues ? "issueDetected" : "staging",
            note: joinIssues(issues),
            // Changed lines invalidate any earlier sign-off.
            firstApprover: undefined,
            approver: null,
          }
        : o,
    ),
  );

  pushAudit({
    entityType: "importOrder",
    entityId: orderNo,
    action: "updated",
    summary: hasIssues
      ? { th: "แก้ไขรายการสินค้า — ยังพบปัญหาการตรวจสอบ", en: "Corrected line items — validation issues remain" }
      : resubmitted
        ? { th: "แก้ไขรายการสินค้าและส่งอนุมัติใหม่", en: "Corrected line items and resubmitted for approval" }
        : { th: "แก้ไขรายการสินค้า — ผ่านการตรวจสอบแล้ว", en: "Corrected line items — now passes validation" },
  });
  return OK;
}

export function approveImportOrder(s: Store, ctx: Ctx, orderNo: string): ActionResult {
  const { products, importOrders, licenses, setImportOrders, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("approve")) return DENIED;
  const order = importOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (order.status !== "staging" && order.status !== "pendingApproval") return fail("ออเดอร์นี้ไม่ได้รออนุมัติ", "This order isn't awaiting approval");
  const actor = actorRef.current;
  if (sameActor(order.createdBy, actor))
    return fail("ผู้สร้างออเดอร์ไม่สามารถอนุมัติออเดอร์ของตนเองได้", "You can't approve an order you raised yourself");
  if (sameActor(order.firstApprover, actor))
    return fail("การอนุมัติระดับที่ 2 ต้องเป็นหัวหน้างานคนละคน", "The second sign-off must come from a different supervisor");
  // The license may have expired while the order sat in the queue.
  if (order.lineItems) {
    const issues = describeImportOrderIssues({ ...order, lineItems: order.lineItems }, products, licenses, s.taxSettings);
    if (issues.length > 0) {
      setImportOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, status: "issueDetected", note: joinIssues(issues) } : o)));
      return { ok: false, error: joinIssues(issues)! };
    }
  }

  const needsSecondLevel = order.totalValue > HIGH_VALUE_APPROVAL_THRESHOLD && !order.firstApprover;
  setImportOrders((prev) =>
    prev.map((o) => {
      if (o.orderNo !== orderNo) return o;
      if (needsSecondLevel)
        return {
          ...o,
          firstApprover: actor,
          status: "pendingApproval",
          note: {
            th: "ผ่านการอนุมัติระดับที่ 1 — รออนุมัติระดับที่ 2 จากหัวหน้างานอีกท่าน (มูลค่าสูง)",
            en: "Level 1 approved — awaiting a second, different supervisor for final sign-off (high-value order)",
          },
        };
      return { ...o, status: "approved", approver: actor, note: undefined };
    }),
  );

  pushAudit({
    entityType: "importOrder",
    entityId: orderNo,
    action: "approved",
    summary: needsSecondLevel
      ? { th: "อนุมัติระดับที่ 1 (มูลค่าสูง ต้องอนุมัติ 2 ระดับ)", en: "Level 1 approval (high-value order requires two levels)" }
      : order.firstApprover
        ? { th: "อนุมัติระดับที่ 2 — อนุมัติขั้นสุดท้าย", en: "Level 2 approval — final sign-off" }
        : { th: "อนุมัติออเดอร์นำเข้า", en: "Approved import order" },
  });
  return OK;
}

export function rejectImportOrder(s: Store, ctx: Ctx, orderNo: string, reason: string): ActionResult {
  const { importOrders, setImportOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("approve")) return DENIED;
  const order = importOrders.find((o) => o.orderNo === orderNo);
  if (!order || !["staging", "pendingApproval", "issueDetected"].includes(order.status))
    return fail("ออเดอร์นี้ไม่ได้รออนุมัติ", "This order isn't awaiting approval");
  if (!reason.trim()) return fail("กรุณาระบุเหตุผล", "A reason is required");
  setImportOrders((prev) =>
    prev.map((o) => (o.orderNo === orderNo ? { ...o, status: "rejected", note: { th: reason, en: reason }, firstApprover: undefined } : o)),
  );
  pushAudit({ entityType: "importOrder", entityId: orderNo, action: "rejected", summary: { th: reason, en: reason } });
  return OK;
}

export function recordCustomsClearance(s: Store, ctx: Ctx, orderNo: string, declarationNo: string): ActionResult {
  const { importOrders, setImportOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("recordCustomsClearance")) return DENIED;
  const order = importOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (order.status !== "approved") return fail("บันทึกพิธีการศุลกากรได้หลังอนุมัติเท่านั้น", "Customs clearance can only be recorded on an approved order");
  const no = declarationNo.trim();
  if (!no) return fail("กรุณาระบุเลขใบขนสินค้า", "Customs declaration number is required");
  if (importOrders.some((o) => o.orderNo !== orderNo && o.customsDeclarationNo === no))
    return fail("เลขใบขนสินค้านี้ถูกใช้กับออเดอร์อื่นแล้ว", "That declaration number is already used on another order");
  setImportOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, status: "customsCleared", customsDeclarationNo: no } : o)));
  pushAudit({
    entityType: "importOrder",
    entityId: orderNo,
    action: "updated",
    summary: { th: `ผ่านพิธีการศุลกากร — ใบขนสินค้า ${no}`, en: `Customs cleared — declaration ${no}` },
  });
  return OK;
}

export function receiveGoods(s: Store, ctx: Ctx, input: ReceiveGoodsInput): ActionResult {
  const { products, importOrders, inventory, warehouses, taxSettings, setProducts, setImportOrders, setInventory, setStockMovements, pushAudit, allowed, actorRef } =
    bind(s, ctx);

  if (!allowed("receiveGoods")) return DENIED;
  const additionalCostThb = input.additionalCostThb ?? 0;
  if (!(additionalCostThb >= 0)) return fail("ค่าขนส่งและค่าใช้จ่ายต้องไม่ติดลบ", "Freight and other costs can't be negative");
  const order = importOrders.find((o) => o.orderNo === input.orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (order.receiving || !["approved", "customsCleared"].includes(order.status))
    return fail("ออเดอร์นี้ยังไม่พร้อมรับเข้าคลัง หรือรับไปแล้ว", "This order isn't ready to receive, or was already received");
  if (input.lines.some((l) => !Number.isInteger(l.receivedQty) || l.receivedQty < 0))
    return fail("จำนวนที่รับต้องเป็นจำนวนเต็มไม่ติดลบ", "Received quantities must be whole numbers, 0 or more");
  if (input.lines.every((l) => l.receivedQty === 0)) return fail("ยังไม่มีจำนวนที่รับเข้า", "Nothing has been received");
  if (!warehouses.some((w) => w.code === input.warehouse && w.active))
    return fail("ไม่พบคลังสินค้าที่เลือก หรือคลังปิดใช้งาน", "Selected warehouse doesn't exist or is inactive");

  // Lot numbers must be unique across the warehouse, including between lines of this same receipt.
  const taken = new Set(inventory.map((i) => i.lotBatch));
  const lines = input.lines.map((l) => {
    const lotBatch = uniqueLotBatch(l.lotBatch.trim() || `${order.orderNo}-${l.sku}`, taken);
    taken.add(lotBatch);
    return { ...l, lotBatch };
  });
  const hasDiscrepancy = lines.some((l) => l.receivedQty !== l.orderedQty);
  // What each unit actually cost to land: supplier price at the order's rate + duty + excise + freight share.
  const unitCosts = landedUnitCosts(order, lines, products, taxSettings, additionalCostThb);

  setImportOrders((prev) =>
    prev.map((o) =>
      o.orderNo === input.orderNo
        ? { ...o, status: "receivedWarehouse", receiving: { receivedDate: input.receivedDate, lines, hasDiscrepancy, additionalCostThb } }
        : o,
    ),
  );

  setInventory((prev) => [
    ...lines
      .filter((l) => l.receivedQty > 0)
      .map(
        (l): InventoryItem => ({
          sku: l.sku,
          productName: products.find((p) => p.sku === l.sku)?.name ?? l.sku,
          lotBatch: l.lotBatch,
          receivedDate: input.receivedDate,
          quantityRemaining: l.receivedQty,
          ageDays: 0,
          status: "normal",
          warehouse: input.warehouse,
          exciseStampDate: l.exciseStampDate,
          unitCost: unitCosts.get(l.sku) ?? products.find((p) => p.sku === l.sku)?.costPrice ?? 0,
        }),
      ),
    ...prev,
  ]);

  setStockMovements((prev) => [
    ...lines
      .filter((l) => l.receivedQty > 0)
      .map(
        (l): StockMovement => ({
          id: makeId(),
          timestamp: new Date().toISOString(),
          type: "receipt",
          sku: l.sku,
          lotBatch: l.lotBatch,
          warehouse: input.warehouse,
          quantity: l.receivedQty,
          reference: input.orderNo,
          actor: actorRef.current,
        }),
      ),
    ...prev,
  ]);

  // Sum per SKU — an order can carry the same SKU on more than one line.
  const receivedBySku = new Map<string, number>();
  for (const l of lines) receivedBySku.set(l.sku, (receivedBySku.get(l.sku) ?? 0) + l.receivedQty);
  setProducts((prev) =>
    prev.map((p) => {
      const qty = receivedBySku.get(p.sku) ?? 0;
      if (qty <= 0) return p;
      const stockAvailable = p.stockAvailable + qty;
      return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
    }),
  );

  pushAudit({
    entityType: "importOrder",
    entityId: input.orderNo,
    action: "updated",
    summary: hasDiscrepancy
      ? { th: "รับสินค้าเข้าคลัง — พบส่วนต่างจำนวนที่ได้รับ", en: "Goods received — quantity discrepancy found" }
      : { th: "รับสินค้าเข้าคลังสำเร็จ ตรงตามจำนวนที่สั่ง", en: "Goods received — quantity matches the order" },
  });
  return OK;
}

export function attachDocument(s: Store, ctx: Ctx, orderNo: string, doc: Omit<AttachedDocument, "id" | "uploadedAt">): ActionResult {
  const { setImportOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("manageImportDocuments")) return DENIED;
  const fullDoc: AttachedDocument = { ...doc, id: makeId(), uploadedAt: new Date().toISOString() };
  setImportOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, documents: [...(o.documents ?? []), fullDoc] } : o)));
  pushAudit({
    entityType: "importOrder",
    entityId: orderNo,
    action: "updated",
    summary: { th: `แนบเอกสาร: ${doc.name}`, en: `Attached document: ${doc.name}` },
  });
  return OK;
}

export function removeDocument(s: Store, ctx: Ctx, orderNo: string, docId: string): ActionResult {
  const { importOrders, setImportOrders, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("manageImportDocuments")) return DENIED;
  const doc = importOrders.find((o) => o.orderNo === orderNo)?.documents?.find((d) => d.id === docId);
  if (!doc) return fail("ไม่พบเอกสาร", "Document not found");
  setImportOrders((prev) =>
    prev.map((o) => (o.orderNo === orderNo ? { ...o, documents: (o.documents ?? []).filter((d) => d.id !== docId) } : o)),
  );
  pushAudit({
    entityType: "importOrder",
    entityId: orderNo,
    action: "updated",
    summary: { th: `ลบเอกสาร: ${doc.name}`, en: `Removed document: ${doc.name}` },
  });
  return OK;
}

function auditMasterChange(s: Store, ctx: Ctx, entityType: AuditEntry["entityType"], entityId: string, created: boolean, changes: string[]) {
  const { pushAudit } = bind(s, ctx);

  const text = changes.join("; ");
  pushAudit({
    entityType,
    entityId,
    action: created ? "created" : "updated",
    // Price lists hold selling prices; product creation records cost — both are price data (NFR-03).
    sensitive: entityType === "priceList" || (entityType === "product" && created),
    summary: created ? { th: "สร้างข้อมูลหลักใหม่", en: "Created master record" } : { th: `แก้ไข ${text}`, en: `Changed ${text}` },
  });
}

export function createProduct(s: Store, ctx: Ctx, input: NewProductInput): ActionResult {
  const { products, setProducts, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("editProduct")) return DENIED;
  const sku = input.sku.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(sku)) return fail("รหัส SKU ใช้ได้เฉพาะ A–Z, 0–9 และ -", "SKU may only contain A–Z, 0–9 and -");
  if (products.some((p) => p.sku === sku)) return fail("รหัส SKU นี้มีอยู่แล้ว", "That SKU already exists");
  if (!input.name.trim()) return fail("กรุณาระบุชื่อสินค้า", "Product name is required");
  if (!(input.abv >= 0 && input.abv <= 75)) return fail("ABV ต้องอยู่ระหว่าง 0–75%", "ABV must be 0–75%");
  if (!(input.packageSize > 0)) return fail("ขนาดบรรจุต้องมากกว่า 0", "Package size must be above 0");
  if (!(input.costPrice > 0) || !(input.suggestedPrice > 0)) return fail("ราคาต้องมากกว่า 0", "Prices must be above 0");
  if (!/^\d{4}\.\d{2}$/.test(input.hsCode.trim())) return fail("รหัส HS ต้องอยู่ในรูปแบบ 0000.00", "HS Code must look like 0000.00");
  const product: Product = { ...input, sku, name: input.name.trim(), hsCode: input.hsCode.trim(), stockAvailable: 0, status: "outOfStock" };
  setProducts((prev) => [...prev, product]);
  auditMasterChange("product", sku, true, []);
  return OK;
}

export function createCustomer(s: Store, ctx: Ctx, input: NewCustomerInput): ActionResult {
  const { licenses, customers, setCustomers, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("createCustomer")) return DENIED;
  const customerId = input.customerId.trim().toUpperCase();
  if (!customerId) return fail("กรุณาระบุรหัสลูกค้า", "Customer ID is required");
  if (customers.some((c) => c.customerId === customerId)) return fail("รหัสลูกค้านี้มีอยู่แล้ว", "That customer ID already exists");
  if (!input.name.th.trim() || !input.name.en.trim()) return fail("กรุณาระบุชื่อทั้งภาษาไทยและอังกฤษ", "Name is required in both Thai and English");
  const legal = checkLegalDetails(input);
  if (!legal.ok) return legal;
  if (!Number.isInteger(input.creditTermDays) || input.creditTermDays < 0 || input.creditTermDays > 365)
    return fail("ระยะเวลาเครดิตต้องเป็น 0–365 วัน", "Credit terms must be 0–365 days");
  const license = input.licenseNo ? licenses.find((l) => l.licenseNo === input.licenseNo) : null;
  if (input.licenseNo && (!license || license.category !== "sales"))
    return fail("ใบอนุญาตต้องเป็นใบอนุญาตขายที่มีในทะเบียน", "License must be a sales license on file");
  if (input.licenseNo && customers.some((c) => c.licenseNo === input.licenseNo))
    return fail("ใบอนุญาตนี้ผูกกับลูกค้ารายอื่นแล้ว", "That license already belongs to another customer");
  // Segregation of duties: credit terms are set by whoever is allowed to set them, not by whoever opens the account.
  const canSetTerms = allowed("editCustomerTerms");
  const creditLimit = canSetTerms ? input.creditLimit : 0;
  const standardDiscount = canSetTerms ? input.standardDiscount : 0;
  if (!(creditLimit >= 0)) return fail("วงเงินเครดิตต้องไม่ติดลบ", "Credit limit can't be negative");
  if (!(standardDiscount >= 0 && standardDiscount <= 100)) return fail("ส่วนลดมาตรฐานต้องอยู่ระหว่าง 0–100%", "Standard discount must be 0–100%");
  const customer: Customer = {
    customerId,
    name: { th: input.name.th.trim(), en: input.name.en.trim() },
    taxId: input.taxId.trim(),
    branch: input.branch.trim(),
    address: { th: input.address.th.trim(), en: input.address.en.trim() },
    creditTermDays: input.creditTermDays,
    channelType: input.channelType,
    licenseNo: license?.licenseNo ?? null,
    licenseExpiry: license?.expiryDate ?? null,
    creditLimit,
    outstandingBalance: 0,
    creditRemaining: creditLimit,
    standardDiscount,
    creditStatus: license ? "normal" : "noLicense",
  };
  setCustomers((prev) => [...prev, customer]);
  pushAudit({
    entityType: "customer",
    entityId: customerId,
    action: "created",
    summary: canSetTerms
      ? { th: "เปิดบัญชีลูกค้าใหม่", en: "Opened customer account" }
      : {
          th: "เปิดบัญชีลูกค้าใหม่ — วงเงินและส่วนลดเป็น 0 รอหัวหน้างานกำหนด",
          en: "Opened customer account — credit limit and discount set to 0 pending a supervisor",
        },
  });
  return OK;
}

export function createLicense(s: Store, ctx: Ctx, input: NewLicenseInput): ActionResult {
  const { licenses, setLicenses, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("editLicense")) return DENIED;
  const licenseNo = input.licenseNo.trim().toUpperCase();
  if (!licenseNo) return fail("กรุณาระบุเลขที่ใบอนุญาต", "License number is required");
  if (licenses.some((l) => l.licenseNo === licenseNo)) return fail("เลขที่ใบอนุญาตนี้มีอยู่แล้ว", "That license number already exists");
  if (!input.type.en.trim() || !input.holder.en.trim()) return fail("กรุณาระบุประเภทและผู้ถือใบอนุญาต", "Type and holder are required");
  if (!input.issueDate || !input.expiryDate || input.expiryDate <= input.issueDate)
    return fail("วันหมดอายุต้องอยู่หลังวันออกใบอนุญาต", "Expiry date must be after the issue date");
  const license: License = { ...input, licenseNo, ...computeLicenseStatus(input.expiryDate) };
  setLicenses((prev) => [...prev, license]);
  auditMasterChange("license", licenseNo, true, []);
  return OK;
}

export function saveSupplier(s: Store, ctx: Ctx, supplier: Supplier, mode: "create" | "update"): ActionResult {
  const { suppliers, setSuppliers, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("manageSuppliers")) return DENIED;
  const supplierId = supplier.supplierId.trim().toUpperCase();
  if (!supplierId) return fail("กรุณาระบุรหัสผู้ขาย", "Supplier ID is required");
  if (!supplier.name.trim()) return fail("กรุณาระบุชื่อผู้ขาย", "Supplier name is required");
  if (supplier.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(supplier.contactEmail.trim()))
    return fail("อีเมลไม่ถูกต้อง", "Contact email isn't valid");
  if (!Number.isInteger(supplier.paymentTermDays) || supplier.paymentTermDays < 0 || supplier.paymentTermDays > 365)
    return fail("วันครบกำหนดชำระต้องเป็น 0–365 วัน", "Payment days must be 0–365");
  const clean: Supplier = { ...supplier, supplierId, name: supplier.name.trim(), contactEmail: supplier.contactEmail.trim(), currency: supplier.currency.trim().toUpperCase() };
  const existing = suppliers.find((sp) => sp.supplierId === supplierId);
  if (mode === "create" && existing) return fail("รหัสผู้ขายนี้มีอยู่แล้ว", "That supplier ID already exists");
  if (mode === "update" && !existing) return fail("ไม่พบผู้ขาย", "Supplier not found");
  if (existing) {
    const changes = describeChanges(existing, clean);
    if (changes.length === 0) return OK;
    setSuppliers((prev) => prev.map((sp) => (sp.supplierId === supplierId ? clean : sp)));
    auditMasterChange("supplier", supplierId, false, changes);
  } else {
    if (suppliers.some((sp) => sp.name.toLowerCase() === clean.name.toLowerCase()))
      return fail("มีผู้ขายชื่อนี้อยู่แล้ว", "A supplier with that name already exists");
    setSuppliers((prev) => [...prev, clean]);
    auditMasterChange("supplier", supplierId, true, []);
  }
  return OK;
}

export function saveWarehouse(s: Store, ctx: Ctx, warehouse: Warehouse, mode: "create" | "update"): ActionResult {
  const { inventory, warehouses, setWarehouses, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("manageWarehouses")) return DENIED;
  const code = warehouse.code.trim();
  if (!/^[A-Za-z0-9-]+$/.test(code)) return fail("รหัสคลังใช้ได้เฉพาะตัวอักษร ตัวเลข และ -", "Warehouse code may only contain letters, digits and -");
  if (!warehouse.name.th.trim() || !warehouse.name.en.trim()) return fail("กรุณาระบุชื่อทั้งภาษาไทยและอังกฤษ", "Name is required in both Thai and English");
  if (!(warehouse.capacity > 0)) return fail("ความจุต้องมากกว่า 0", "Capacity must be above 0");
  const existing = warehouses.find((w) => w.code.toLowerCase() === code.toLowerCase());
  if (mode === "create" && existing) return fail("รหัสคลังนี้มีอยู่แล้ว", "That warehouse code already exists");
  if (mode === "update" && !existing) return fail("ไม่พบคลังสินค้า", "Warehouse not found");
  const onHand = inventory.filter((i) => i.warehouse === code).reduce((sum, i) => sum + i.quantityRemaining, 0);
  if (existing && existing.active && !warehouse.active && onHand > 0)
    return fail(`ปิดคลังไม่ได้ ยังมีสินค้าคงเหลือ ${onHand} หน่วย`, `Can't deactivate — ${onHand} units are still stored here`);
  const clean: Warehouse = { ...warehouse, code };
  if (existing) {
    const changes = describeChanges({ ...existing, name: existing.name.en }, { ...clean, name: clean.name.en });
    if (changes.length === 0 && existing.name.th === clean.name.th) return OK;
    setWarehouses((prev) => prev.map((w) => (w.code === code ? clean : w)));
    auditMasterChange("warehouse", code, false, changes.length ? changes : ["name (th)"]);
  } else {
    setWarehouses((prev) => [...prev, clean]);
    auditMasterChange("warehouse", code, true, []);
  }
  return OK;
}

export function updatePriceList(s: Store, ctx: Ctx, channel: ChannelCode, adjustmentPercent: number): ActionResult {
  const { priceLists, setPriceLists, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("managePricing")) return DENIED;
  if (!(adjustmentPercent > -100 && adjustmentPercent <= 200)) return fail("ส่วนปรับราคาต้องอยู่ระหว่าง -99% ถึง +200%", "Adjustment must be between -99% and +200%");
  const list = priceLists.find((l) => l.channel === channel);
  if (!list || list.adjustmentPercent === adjustmentPercent) return OK;
  setPriceLists((prev) => prev.map((l) => (l.channel === channel ? { ...l, adjustmentPercent } : l)));
  auditMasterChange("priceList", channel, false, [`adjustmentPercent: ${list.adjustmentPercent} → ${adjustmentPercent}`]);
  return OK;
}

export function setPriceOverride(s: Store, ctx: Ctx, channel: ChannelCode, sku: string, price: number | null): ActionResult {
  const { products, priceLists, setPriceLists, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("managePricing")) return DENIED;
  const product = products.find((p) => p.sku === sku);
  if (!product) return fail("ไม่พบสินค้า", "Product not found");
  if (price !== null && !(price > 0)) return fail("ราคาต้องมากกว่า 0", "Price must be above 0");
  const list = priceLists.find((l) => l.channel === channel);
  if (!list) return fail("ไม่พบรายการราคา", "Price list not found");
  const before = list.overrides[sku];
  if ((before ?? null) === price) return OK;
  setPriceLists((prev) =>
    prev.map((l) => {
      if (l.channel !== channel) return l;
      const overrides = { ...l.overrides };
      if (price === null) delete overrides[sku];
      else overrides[sku] = price;
      return { ...l, overrides };
    }),
  );
  auditMasterChange("priceList", channel, false, [`${sku}: ${before ?? "—"} → ${price ?? "—"}`]);
  return OK;
}

export function updateTaxSettings(s: Store, ctx: Ctx, settings: TaxSettings): ActionResult {
  const { taxSettings, setTaxSettings, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("manageTax")) return DENIED;
  const pct = (n: number) => n >= 0 && n <= 400;
  if (!pct(settings.vatPercent) || !pct(settings.defaultDutyPercent) || !(settings.exciseThbPerAbvLiter >= 0))
    return fail("อัตราต้องไม่ติดลบและไม่เกิน 400%", "Rates must be 0 or more (max 400%)");
  if (settings.dutyRates.some((r) => !/^\d{4}(\.\d{0,2})?$/.test(r.hsPrefix) || !pct(r.dutyPercent)))
    return fail("รหัส HS หรืออัตราอากรไม่ถูกต้อง", "An HS prefix or duty rate isn't valid");
  const prefixes = settings.dutyRates.map((r) => r.hsPrefix);
  if (new Set(prefixes).size !== prefixes.length) return fail("รหัส HS ซ้ำกัน", "Duplicate HS prefix");
  const changes = [
    ...describeChanges(
      { vatPercent: taxSettings.vatPercent, exciseThbPerAbvLiter: taxSettings.exciseThbPerAbvLiter, defaultDutyPercent: taxSettings.defaultDutyPercent },
      { vatPercent: settings.vatPercent, exciseThbPerAbvLiter: settings.exciseThbPerAbvLiter, defaultDutyPercent: settings.defaultDutyPercent },
    ),
    ...settings.dutyRates
      .filter((r) => taxSettings.dutyRates.find((o) => o.hsPrefix === r.hsPrefix)?.dutyPercent !== r.dutyPercent)
      .map((r) => `HS ${r.hsPrefix}: ${taxSettings.dutyRates.find((o) => o.hsPrefix === r.hsPrefix)?.dutyPercent ?? "—"} → ${r.dutyPercent}%`),
    ...taxSettings.dutyRates.filter((o) => !prefixes.includes(o.hsPrefix)).map((o) => `HS ${o.hsPrefix}: removed`),
  ];
  if (changes.length === 0) return OK;
  setTaxSettings(settings);
  auditMasterChange("taxSettings", "TAX", false, changes);
  return OK;
}

export function saveReorderPolicy(s: Store, ctx: Ctx, policy: ReorderPolicy): ActionResult {
  const { products, suppliers, reorderPolicies, setReorderPolicies, auditMasterChange, allowed } = bind(s, ctx);

  if (!allowed("manageReorder")) return DENIED;
  if (!products.some((p) => p.sku === policy.sku)) return fail("ไม่พบสินค้า", "Product not found");
  if (!Number.isInteger(policy.reorderPoint) || policy.reorderPoint < 0) return fail("จุดสั่งซื้อต้องเป็นจำนวนเต็มไม่ติดลบ", "Reorder point must be a whole number, 0 or more");
  if (!isWholePositive(policy.reorderQty)) return fail("จำนวนสั่งซื้อต้องเป็นจำนวนเต็มมากกว่า 0", "Reorder quantity must be a whole number above 0");
  if (policy.preferredSupplierId && !suppliers.some((sp) => sp.supplierId === policy.preferredSupplierId))
    return fail("ไม่พบผู้ขาย", "Supplier not found");
  const existing = reorderPolicies.find((r) => r.sku === policy.sku);
  if (existing) {
    const changes = describeChanges(existing, policy);
    if (changes.length === 0) return OK;
    setReorderPolicies((prev) => prev.map((r) => (r.sku === policy.sku ? policy : r)));
    auditMasterChange("reorderPolicy", policy.sku, false, changes);
  } else {
    setReorderPolicies((prev) => [...prev, policy]);
    auditMasterChange("reorderPolicy", policy.sku, true, []);
  }
  return OK;
}

// ───────────────────────────── Legal details (tax invoices) ─────────────────────────────

/** Tax ID and branch as a Thai tax invoice requires them (Revenue Code §86/4). */
function checkLegalDetails(d: { taxId: string; branch: string; address: Bilingual }): ActionResult {
  if (!isValidThaiTaxId(d.taxId.trim())) return fail("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลักที่ถูกต้อง", "Tax ID must be a valid 13-digit Thai taxpayer number");
  if (!/^\d{5}$/.test(d.branch.trim())) return fail("รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)", "Branch must be 5 digits (head office = 00000)");
  if (!d.address.th.trim() || !d.address.en.trim()) return fail("กรุณาระบุที่อยู่ทั้งภาษาไทยและอังกฤษ", "Address is required in both Thai and English");
  return OK;
}

/** Name, tax ID, branch, and address — what prints on the customer's tax invoices. */
export function updateCustomerProfile(s: Store, ctx: Ctx, customerId: string, patch: CustomerProfileInput): ActionResult {
  const { customers, setCustomers, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("createCustomer")) return DENIED;
  const customer = customers.find((c) => c.customerId === customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  if (!patch.name.th.trim() || !patch.name.en.trim()) return fail("กรุณาระบุชื่อทั้งภาษาไทยและอังกฤษ", "Name is required in both Thai and English");
  const legal = checkLegalDetails(patch);
  if (!legal.ok) return legal;
  const email = (patch.email ?? customer.email ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("อีเมลไม่ถูกต้อง", "Email isn't valid");
  const clean = {
    name: { th: patch.name.th.trim(), en: patch.name.en.trim() },
    taxId: patch.taxId.trim(),
    branch: patch.branch.trim(),
    address: { th: patch.address.th.trim(), en: patch.address.en.trim() },
    email,
  };
  const changes = describeChanges(
    { name: customer.name.en, nameTh: customer.name.th, taxId: customer.taxId, branch: customer.branch, address: customer.address.en, addressTh: customer.address.th, email: customer.email ?? "" },
    { name: clean.name.en, nameTh: clean.name.th, taxId: clean.taxId, branch: clean.branch, address: clean.address.en, addressTh: clean.address.th, email: clean.email },
  );
  if (changes.length === 0) return OK;
  // Only new documents carry the new details; issued invoices keep the name they were issued under.
  setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, ...clean } : c)));
  pushAudit({ entityType: "customer", entityId: customerId, action: "updated", summary: { th: `แก้ไข ${changes.join("; ")}`, en: `Changed ${changes.join("; ")}` } });
  return OK;
}

/** The seller details printed on every tax invoice, receipt, and credit/debit note. */
export function updateCompanyProfile(s: Store, ctx: Ctx, patch: Pick<CompanyProfile, "name" | "taxId" | "branch" | "address" | "phone" | "email">): ActionResult {
  const { company, setCompany, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("manageCompany")) return DENIED;
  if (!patch.name.th.trim() || !patch.name.en.trim()) return fail("กรุณาระบุชื่อทั้งภาษาไทยและอังกฤษ", "Name is required in both Thai and English");
  const legal = checkLegalDetails(patch);
  if (!legal.ok) return legal;
  if (patch.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email.trim())) return fail("อีเมลไม่ถูกต้อง", "Email isn't valid");
  // Opening balances and the closed-through date are set by their own actions, never by this form.
  const clean: CompanyProfile = {
    ...company,
    name: { th: patch.name.th.trim(), en: patch.name.en.trim() },
    taxId: patch.taxId.trim(),
    branch: patch.branch.trim(),
    address: { th: patch.address.th.trim(), en: patch.address.en.trim() },
    phone: patch.phone.trim(),
    email: patch.email.trim(),
  };
  const changes = describeChanges(
    { ...company, name: company.name.en, address: company.address.en },
    { ...clean, name: clean.name.en, address: clean.address.en },
  );
  if (changes.length === 0 && company.name.th === clean.name.th && company.address.th === clean.address.th) return OK;
  setCompany(clean);
  pushAudit({ entityType: "company", entityId: "COMPANY", action: "updated", summary: { th: `แก้ไขข้อมูลบริษัท ${changes.join("; ")}`, en: `Changed company profile ${changes.join("; ")}` } });
  return OK;
}


// ───────────────────────────── exchange rates ─────────────────────────────

/** Adds (or corrects) the rate for a currency from a date. Orders already placed keep the rate they were placed at. */
export function saveExchangeRate(s: Store, ctx: Ctx, input: ExchangeRate): ActionResult {
  const { exchangeRates, setExchangeRates, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("manageRates")) return DENIED;
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return fail("รหัสสกุลเงินต้องเป็นตัวอักษร 3 ตัว เช่น USD", "Currency must be a 3-letter code, e.g. USD");
  if (currency === "THB") return fail("บาทเท่ากับ 1 เสมอ", "Baht is always 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) return fail("วันที่ไม่ถูกต้อง", "Date isn't valid");
  if (!(input.rate > 0 && input.rate < 100000)) return fail("อัตราแลกเปลี่ยนต้องมากกว่า 0", "Rate must be above 0");
  const existing = exchangeRates.find((r) => r.currency === currency && r.effectiveDate === input.effectiveDate);
  const rate = Math.round(input.rate * 1e6) / 1e6;
  setExchangeRates((prev) => [...prev.filter((r) => r !== existing), { currency, effectiveDate: input.effectiveDate, rate }]);
  pushAudit({
    entityType: "exchangeRate",
    entityId: currency,
    action: existing ? "updated" : "created",
    summary: {
      th: `อัตราแลกเปลี่ยน ${currency} ตั้งแต่ ${input.effectiveDate}: ${existing ? `${existing.rate} → ` : ""}${rate} บาท`,
      en: `${currency} rate from ${input.effectiveDate}: ${existing ? `${existing.rate} → ` : ""}${rate} THB`,
    },
  });
  return OK;
}

// ───────────────────────────── accounts payable ─────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What's still owed on a supplier invoice, in its currency. */
export function apOpenAmount(apDocuments: ApDocument[], invoiceDocNo: string): number {
  const inv = apDocuments.find((d) => d.docNo === invoiceDocNo && d.type === "invoice");
  if (!inv) return 0;
  const paid = apDocuments.filter((d) => d.type === "payment" && d.appliesTo === invoiceDocNo).reduce((sum, d) => sum + d.amount, 0);
  return round2(inv.amount - paid);
}

/**
 * The supplier's invoice for a received shipment: billed in their currency for the goods received, valued
 * in baht at the order's rate (the same value the goods went into stock at), due on the supplier's terms.
 */
export function recordSupplierInvoice(s: Store, ctx: Ctx, importOrderNo: string, supplierInvoiceNo: string, date: string): ActionResult {
  const { importOrders, suppliers, apDocuments, setApDocuments, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("managePayables")) return DENIED;
  const order = importOrders.find((o) => o.orderNo === importOrderNo);
  if (!order) return fail("ไม่พบออเดอร์นำเข้า", "Import order not found");
  if (order.status !== "receivedWarehouse") return fail("บันทึกใบแจ้งหนี้ได้หลังรับสินค้าเข้าคลังแล้ว", "Record the supplier's invoice once the goods have been received");
  if (apDocuments.some((d) => d.type === "invoice" && d.importOrderNo === importOrderNo))
    return fail("ออเดอร์นี้มีใบแจ้งหนี้จากผู้ขายแล้ว", "This order already has a supplier invoice");
  const supplier = suppliers.find((sp) => sp.supplierId === order.supplierId);
  if (!supplier) return fail("ไม่พบผู้ขาย", "Supplier not found");
  const ref = supplierInvoiceNo.trim();
  if (!ref) return fail("กรุณาระบุเลขที่ใบแจ้งหนี้ของผู้ขาย", "Enter the supplier's invoice number");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) return fail("วันที่ใบแจ้งหนี้ต้องไม่เกินวันนี้", "The invoice date can't be in the future");
  const open = checkOpenPeriod(s.company, date);
  if (!open.ok) return open;

  // Billed for what arrived (a short shipment is billed short), at each SKU's ordered price.
  const received = order.receiving?.lines ?? (order.lineItems ?? []).map((l) => ({ sku: l.sku, receivedQty: l.qty }));
  const priceOf = (sku: string) => {
    const ls = (order.lineItems ?? []).filter((l) => l.sku === sku);
    const qty = ls.reduce((sum, l) => sum + l.qty, 0);
    return qty ? ls.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) / qty : 0;
  };
  const amount = round2(received.reduce((sum, l) => sum + l.receivedQty * priceOf(l.sku), 0));
  const rate = order.exchangeRate ?? 1;
  const docNo = nextDocNo("AP", apDocuments.map((d) => d.docNo));
  const doc: ApDocument = {
    docNo,
    type: "invoice",
    supplierId: supplier.supplierId,
    importOrderNo,
    reference: ref,
    date,
    dueDate: addDays(date, supplier.paymentTermDays),
    currency: order.currency ?? "THB",
    amount,
    rate,
    amountThb: round2(amount * rate),
    actor: actorRef.current,
  };
  setApDocuments((prev) => [doc, ...prev]);
  pushAudit({
    entityType: "payable",
    entityId: docNo,
    action: "created",
    sensitive: true,
    summary: {
      th: `ใบแจ้งหนี้ผู้ขาย ${ref} (${importOrderNo}) ${doc.currency} ${fmt(amount)} = ฿${fmt(doc.amountThb)} ครบกำหนด ${doc.dueDate}`,
      en: `Supplier invoice ${ref} (${importOrderNo}) ${doc.currency} ${fmt(amount)} = ฿${fmt(doc.amountThb)}, due ${doc.dueDate}`,
    },
  });
  return OK;
}

/**
 * A payment to a supplier against one invoice, in the invoice's currency at the day's rate. The baht paid
 * can differ from the baht the invoice was booked at — that difference is an exchange gain or loss.
 */
export function recordSupplierPayment(
  s: Store,
  ctx: Ctx,
  invoiceDocNo: string,
  amount: number,
  rate: number,
  method: PaymentMethod,
  reference: string,
): ActionResult {
  const { apDocuments, setApDocuments, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("managePayables")) return DENIED;
  const inv = apDocuments.find((d) => d.docNo === invoiceDocNo && d.type === "invoice");
  if (!inv) return fail("ไม่พบใบแจ้งหนี้", "Invoice not found");
  if (!(amount > 0)) return fail("จำนวนเงินต้องมากกว่า 0", "Amount must be above 0");
  const open = apOpenAmount(apDocuments, invoiceDocNo);
  if (round2(amount) > open) return fail(`จ่ายได้ไม่เกินยอดค้าง ${inv.currency} ${fmt(open)}`, `You can pay at most the ${inv.currency} ${fmt(open)} still owed`);
  if (inv.currency === "THB" ? rate !== 1 : !(rate > 0)) return fail("อัตราแลกเปลี่ยนไม่ถูกต้อง", "The exchange rate isn't valid");
  const docNo = nextDocNo("PV", apDocuments.map((d) => d.docNo));
  const doc: ApDocument = {
    docNo,
    type: "payment",
    supplierId: inv.supplierId,
    importOrderNo: inv.importOrderNo,
    reference: reference.trim(),
    date: todayIso(),
    currency: inv.currency,
    amount: round2(amount),
    rate,
    amountThb: round2(amount * rate),
    appliesTo: invoiceDocNo,
    method,
    actor: actorRef.current,
  };
  setApDocuments((prev) => [doc, ...prev]);
  pushAudit({
    entityType: "payable",
    entityId: invoiceDocNo,
    action: "payment",
    sensitive: true,
    summary: {
      th: `จ่ายผู้ขาย ${docNo}: ${inv.currency} ${fmt(doc.amount)} @ ${rate} = ฿${fmt(doc.amountThb)} สำหรับ ${inv.reference}`,
      en: `Paid supplier ${docNo}: ${inv.currency} ${fmt(doc.amount)} @ ${rate} = ฿${fmt(doc.amountThb)} on ${inv.reference}`,
    },
  });
  return OK;
}

// ───────────────────────────── partial returns ─────────────────────────────

export interface ReturnLineInput {
  /** Position of the line on the order (0-based). */
  line: number;
  quantity: number;
}

/**
 * The customer sends back some units of a delivered order. Each returned unit goes back into its lot, a
 * credit note for exactly those units is issued against the invoice, and the order's value and the
 * customer's balance drop by the same amount. The tax invoice itself is never changed. If every unit comes
 * back, the order is marked Returned.
 */
export function returnSalesLines(s: Store, ctx: Ctx, orderNo: string, returns: ReturnLineInput[], reason: string): ActionResult {
  const { salesOrders, arDocuments, setSalesOrders, setArDocuments, pushAudit, moveStock, moveBalance, allowed, actorRef } = bind(s, ctx);

  if (!allowed("updateDelivery")) return DENIED;
  const order = salesOrders.find((o) => o.orderNo === orderNo);
  if (!order) return fail("ไม่พบออเดอร์", "Order not found");
  if (!isBookedSale(order) || order.deliveryStatus !== "delivered") return fail("รับคืนได้เฉพาะออเดอร์ที่ส่งถึงลูกค้าแล้ว", "Only delivered orders can have items returned");
  const wanted = returns.filter((r) => r.quantity !== 0);
  if (wanted.length === 0) return fail("ยังไม่ได้ระบุจำนวนที่รับคืน", "Enter how many units came back");
  if (new Set(wanted.map((r) => r.line)).size !== wanted.length) return fail("ระบุแต่ละรายการได้ครั้งเดียว", "Each line can appear only once");
  for (const r of wanted) {
    const l = order.lines[r.line];
    if (!l) return fail("ไม่พบรายการสินค้า", "That line isn't on the order");
    const left = l.quantity - (l.returnedQuantity ?? 0);
    if (!isWholePositive(r.quantity) || r.quantity > left)
      return fail(`${l.sku}: รับคืนได้ไม่เกิน ${left}`, `${l.sku}: at most ${left} can be returned`);
  }
  const why = reason.trim();
  if (!why) return fail("กรุณาระบุเหตุผลที่รับคืน", "Give a reason for the return");

  // Credit what the customer paid per unit on that line (its net value over its quantity).
  const value = round2(wanted.reduce((sum, r) => sum + (order.lines[r.line].netValue / order.lines[r.line].quantity) * r.quantity, 0));
  const lines = order.lines.map((l, i) => {
    const r = wanted.find((x) => x.line === i);
    return r ? { ...l, returnedQuantity: (l.returnedQuantity ?? 0) + r.quantity } : l;
  });
  const everything = lines.every((l) => (l.returnedQuantity ?? 0) >= l.quantity);
  const netValue = round2(order.netValue - value);

  for (const r of wanted) moveStock(order.lines[r.line].sku, order.lines[r.line].lotBatch, r.quantity, "return", orderNo);
  moveBalance(order.customerId, -value);
  setSalesOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, lines, netValue, ...(everything ? { deliveryStatus: "returned" as const } : {}) } : o)));
  const creditNoteNo = nextDocNo("CN", arDocuments.map((d) => d.docNo));
  setArDocuments((prev) => [
    {
      docNo: creditNoteNo,
      type: "creditNote",
      customerId: order.customerId,
      date: todayIso(),
      amount: value,
      reference: orderNo,
      actor: actorRef.current,
      originalValue: order.netValue,
      reason: { th: `ลูกค้าคืนสินค้าบางส่วน: ${why}`, en: `Part of the goods returned: ${why}` },
    },
    ...prev,
  ]);
  const what = wanted.map((r) => `${order.lines[r.line].sku} × ${r.quantity}`).join(", ");
  pushAudit({
    entityType: "salesOrder",
    entityId: orderNo,
    action: "updated",
    sensitive: true,
    summary: { th: `รับคืน ${what} — ${creditNoteNo} ฿${fmt(value)} (${why})`, en: `Returned ${what} — ${creditNoteNo} ฿${fmt(value)} (${why})` },
  });
  return OK;
}

// ───────────────────────────── accounting periods ─────────────────────────────

const isIsoDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

/**
 * A record dated by hand (an expense, a journal, a supplier invoice) must fall after the last closed month
 * and on or after the day the books start — closed months can't change under a filed return.
 */
function checkOpenPeriod(company: CompanyProfile, date: string): ActionResult {
  if (company.closedThrough && date <= company.closedThrough)
    return fail(`ปิดงวดบัญชีถึงวันที่ ${company.closedThrough} แล้ว — ลงวันที่หลังจากนั้น`, `The books are closed through ${company.closedThrough} — date it after that`);
  if (date < company.openingDate) return fail(`วันที่ต้องไม่ก่อนวันเริ่มระบบ (${company.openingDate})`, `The date can't be before the books start (${company.openingDate})`);
  return OK;
}

/** When the books start and the cash in the bank that day. Fixed once any month has been closed. */
export function setOpeningBalances(s: Store, ctx: Ctx, openingDate: string, openingBank: number): ActionResult {
  const { company, setCompany, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("manageCompany")) return DENIED;
  if (company.closedThrough) return fail("ปิดงวดแล้ว จึงเปลี่ยนยอดยกมาไม่ได้", "Opening balances can't change once a month has been closed");
  if (!isIsoDate(openingDate) || openingDate > todayIso()) return fail("วันเริ่มระบบต้องไม่เกินวันนี้", "The start date can't be in the future");
  if (!(Number.isFinite(openingBank) && openingBank >= 0 && openingBank < 1e12)) return fail("ยอดเงินฝากต้องไม่ติดลบ", "The bank balance can't be negative");
  const amount = round2(openingBank);
  if (company.openingDate === openingDate && company.openingBank === amount) return OK;
  setCompany({ ...company, openingDate, openingBank: amount });
  pushAudit({
    entityType: "company",
    entityId: "COMPANY",
    action: "updated",
    sensitive: true,
    summary: {
      th: `ยอดยกมา: เงินฝากธนาคาร ฿${fmt(company.openingBank)} ณ ${company.openingDate} → ฿${fmt(amount)} ณ ${openingDate}`,
      en: `Opening balances: bank ฿${fmt(company.openingBank)} at ${company.openingDate} → ฿${fmt(amount)} at ${openingDate}`,
    },
  });
  return OK;
}

/** Closes every month up to and including the one ending on `through`. */
export function closePeriod(s: Store, ctx: Ctx, through: string): ActionResult {
  const { company, setCompany, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("closePeriods")) return DENIED;
  if (!isIsoDate(through) || through !== lastOfMonth(through)) return fail("ปิดงวดได้ทีละสิ้นเดือน", "Close through the last day of a month");
  if (through >= todayIso()) return fail("ปิดได้เฉพาะเดือนที่จบไปแล้ว", "Only a month that has ended can be closed");
  if (company.closedThrough && through <= company.closedThrough) return fail(`ปิดงวดถึง ${company.closedThrough} แล้ว`, `Already closed through ${company.closedThrough}`);
  if (through < company.openingDate) return fail("เดือนนี้อยู่ก่อนวันเริ่มระบบ", "That month is before the books start");
  setCompany({ ...company, closedThrough: through });
  pushAudit({
    entityType: "period",
    entityId: through.slice(0, 7),
    action: "approved",
    summary: { th: `ปิดงวดบัญชีถึง ${through}`, en: `Closed the books through ${through}` },
  });
  return OK;
}

/** Reopens the most recently closed month (and only that one), with a reason on the record. */
export function reopenPeriod(s: Store, ctx: Ctx, reason: string): ActionResult {
  const { company, setCompany, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("closePeriods")) return DENIED;
  if (!company.closedThrough) return fail("ยังไม่มีงวดที่ปิด", "No month is closed");
  const why = reason.trim();
  if (!why) return fail("กรุณาระบุเหตุผลที่เปิดงวด", "Give a reason for reopening");
  const previous = lastOfMonth(addDays(firstOfMonth(company.closedThrough), -1));
  const closedThrough = previous < company.openingDate ? undefined : previous;
  const month = company.closedThrough.slice(0, 7);
  setCompany({ ...company, closedThrough });
  pushAudit({
    entityType: "period",
    entityId: month,
    action: "updated",
    summary: { th: `เปิดงวด ${month} อีกครั้ง — ${why}`, en: `Reopened ${month} — ${why}` },
  });
  return OK;
}

// ───────────────────────────── expenses & withholding tax ─────────────────────────────

export interface ExpenseInput {
  date: string;
  payee: string;
  payeeTaxId: string;
  payeeType: Expense["payeeType"];
  account: string;
  description: string;
  amount: number;
  vat: number;
  whtRate: number;
  method: PaymentMethod;
  reference: string;
}

/**
 * An operating expense paid from the bank. VAT on the payee's tax invoice is reclaimable; tax withheld is
 * kept back from the payee and owed to the Revenue Department until remitted.
 */
export function recordExpense(s: Store, ctx: Ctx, input: ExpenseInput): ActionResult & { docNo?: string } {
  const { company, expenses, setExpenses, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("manageExpenses")) return DENIED;
  if (!isIsoDate(input.date) || input.date > todayIso()) return fail("วันที่จ่ายต้องไม่เกินวันนี้", "The payment date can't be in the future");
  const open = checkOpenPeriod(company, input.date);
  if (!open.ok) return open;
  const payee = input.payee.trim();
  if (!payee) return fail("กรุณาระบุผู้รับเงิน", "Enter who was paid");
  if (!EXPENSE_ACCOUNTS.some((a) => a.code === input.account)) return fail("กรุณาเลือกประเภทค่าใช้จ่าย", "Choose an expense account");
  const description = input.description.trim();
  if (!description) return fail("กรุณาระบุรายละเอียด", "Describe the expense");
  if (!(input.amount > 0 && input.amount < 1e10)) return fail("จำนวนเงินต้องมากกว่า 0", "Amount must be above 0");
  const amount = round2(input.amount);
  const vat = round2(input.vat);
  if (!(vat >= 0 && vat <= round2(amount * 0.07) + 1)) return fail("ภาษีซื้อต้องไม่เกิน 7% ของยอดก่อน VAT", "VAT can't be more than 7% of the amount before VAT");
  if (!(WHT_RATES as readonly number[]).includes(input.whtRate)) return fail("อัตราหัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%", "Withholding must be 0, 1, 2, 3 or 5%");
  const taxId = input.payeeTaxId.trim();
  if (input.whtRate > 0 && !isValidThaiTaxId(taxId))
    return fail("หัก ณ ที่จ่ายต้องมีเลขประจำตัวผู้เสียภาษี 13 หลักของผู้รับเงิน", "Withholding needs the payee's valid 13-digit tax ID (it goes on the certificate)");
  if (taxId && !isValidThaiTaxId(taxId)) return fail("เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง", "The tax ID isn't valid");
  const whtAmount = round2((amount * input.whtRate) / 100);
  const docNo = nextDocNo("EX", expenses.map((x) => x.docNo));
  const expense: Expense = {
    docNo,
    date: input.date,
    payee,
    payeeTaxId: taxId,
    payeeType: input.payeeType,
    account: input.account,
    description,
    amount,
    vat,
    whtRate: input.whtRate,
    whtAmount,
    paid: round2(amount + vat - whtAmount),
    method: input.method,
    reference: input.reference.trim(),
    actor: actorRef.current,
  };
  setExpenses((prev) => [expense, ...prev]);
  pushAudit({
    entityType: "expense",
    entityId: docNo,
    action: "created",
    sensitive: true,
    summary: {
      th: `ค่าใช้จ่าย ${docNo} ${payee}: ฿${fmt(amount)}${vat ? ` + VAT ฿${fmt(vat)}` : ""}${whtAmount ? ` หัก ณ ที่จ่าย ${input.whtRate}% ฿${fmt(whtAmount)}` : ""}`,
      en: `Expense ${docNo} ${payee}: ฿${fmt(amount)}${vat ? ` + VAT ฿${fmt(vat)}` : ""}${whtAmount ? `, ${input.whtRate}% withheld ฿${fmt(whtAmount)}` : ""}`,
    },
  });
  return { ok: true, docNo };
}

/** Pays the Revenue Department what was withheld in a finished month (ภ.ง.ด.3 / ภ.ง.ด.53). */
export function remitWithholding(s: Store, ctx: Ctx, month: string, reference: string): ActionResult {
  const { company, expenses, manualJournals, setManualJournals, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("manageExpenses")) return DENIED;
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("เดือนไม่ถูกต้อง", "Month isn't valid");
  const today = todayIso();
  if (month >= today.slice(0, 7)) return fail("นำส่งได้หลังสิ้นเดือน", "Remit once the month has ended");
  const open = checkOpenPeriod(company, today);
  if (!open.ok) return open;
  const due = withholdingByMonth(expenses, manualJournals).find((m) => m.month === month);
  if (!due || due.outstanding <= 0) return fail(`ไม่มีภาษีหัก ณ ที่จ่ายค้างนำส่งของ ${month}`, `Nothing withheld in ${month} is waiting to be remitted`);
  const entryNo = nextDocNo("JV", manualJournals.map((j) => j.entryNo));
  const ref = reference.trim();
  setManualJournals((prev) => [
    {
      entryNo,
      date: today,
      memo: `นำส่งภาษีหัก ณ ที่จ่าย ${month} / Withholding tax remitted for ${month}${ref ? ` (${ref})` : ""}`,
      lines: [
        { account: "2410", debit: due.outstanding, credit: 0 },
        { account: "1110", debit: 0, credit: due.outstanding },
      ],
      kind: "whtRemittance",
      period: month,
      actor: actorRef.current,
    },
    ...prev,
  ]);
  pushAudit({
    entityType: "expense",
    entityId: month,
    action: "payment",
    sensitive: true,
    summary: { th: `นำส่งภาษีหัก ณ ที่จ่าย ${month} ฿${fmt(due.outstanding)} (${entryNo})`, en: `Remitted withholding tax for ${month}: ฿${fmt(due.outstanding)} (${entryNo})` },
  });
  return OK;
}

// ───────────────────────────── manual journals ─────────────────────────────

export interface JournalInput {
  date: string;
  memo: string;
  lines: { account: string; debit: number; credit: number }[];
  /** A statement line this entry explains — matched to it straight away. */
  bankLineId?: string | null;
}

/** A balanced entry posted by hand. Accounts the records drive (receivables, stock, VAT, payables) are off limits. */
export function postJournal(s: Store, ctx: Ctx, input: JournalInput): ActionResult & { entryNo?: string } {
  const { company, manualJournals, bankLines, setManualJournals, setBankLines, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("postJournals")) return DENIED;
  if (!isIsoDate(input.date) || input.date > todayIso()) return fail("วันที่ต้องไม่เกินวันนี้", "The date can't be in the future");
  const open = checkOpenPeriod(company, input.date);
  if (!open.ok) return open;
  const memo = input.memo.trim();
  if (!memo) return fail("กรุณาระบุคำอธิบายรายการ", "Describe the entry");
  if (input.lines.length < 2 || input.lines.length > 20) return fail("ต้องมี 2–20 บรรทัด", "An entry needs 2–20 lines");
  const lines = input.lines.map((l) => ({ account: l.account, debit: round2(l.debit || 0), credit: round2(l.credit || 0) }));
  for (const l of lines) {
    const account = ACCOUNTS.find((a) => a.code === l.account);
    if (!account) return fail(`ไม่พบบัญชี ${l.account}`, `Account ${l.account} doesn't exist`);
    if (SYSTEM_ACCOUNTS.includes(l.account))
      return fail(
        `บัญชี ${l.account} ${account.name.th} มาจากเอกสารเท่านั้น — บันทึกผ่านหน้าจอที่เกี่ยวข้อง`,
        `${l.account} ${account.name.en} comes from the records only — use the screen that creates them`,
      );
    if (l.debit < 0 || l.credit < 0 || l.debit > 0 === l.credit > 0) return fail("แต่ละบรรทัดต้องมีเดบิตหรือเครดิตอย่างใดอย่างหนึ่ง", "Each line needs either a debit or a credit");
  }
  const debit = round2(lines.reduce((sum, l) => sum + l.debit, 0));
  const credit = round2(lines.reduce((sum, l) => sum + l.credit, 0));
  if (debit !== credit) return fail(`เดบิต ฿${fmt(debit)} ไม่เท่ากับเครดิต ฿${fmt(credit)}`, `Debits ฿${fmt(debit)} don't equal credits ฿${fmt(credit)}`);

  const entryNo = nextDocNo("JV", manualJournals.map((j) => j.entryNo));
  if (input.bankLineId) {
    const line = bankLines.find((b) => b.id === input.bankLineId);
    if (!line) return fail("ไม่พบรายการในใบแจ้งยอด", "Statement line not found");
    if (line.matchedEntryId) return fail("รายการนี้จับคู่แล้ว", "That statement line is already matched");
    const bankNet = round2(lines.filter((l) => l.account === "1110").reduce((sum, l) => sum + l.debit - l.credit, 0));
    if (bankNet !== round2(line.amount)) return fail("ยอดบัญชีธนาคารในรายการไม่ตรงกับใบแจ้งยอด", "The entry's bank amount doesn't match the statement line");
    setBankLines((prev) => prev.map((b) => (b.id === line.id ? { ...b, matchedEntryId: entryNo } : b)));
  }
  setManualJournals((prev) => [{ entryNo, date: input.date, memo, lines, kind: "manual", actor: actorRef.current }, ...prev]);
  pushAudit({
    entityType: "journal",
    entityId: entryNo,
    action: "created",
    sensitive: true,
    summary: { th: `บันทึกรายการบัญชี ${entryNo}: ${memo} ฿${fmt(debit)}`, en: `Posted journal ${entryNo}: ${memo} ฿${fmt(debit)}` },
  });
  return { ok: true, entryNo };
}

/** Undoes a manual entry with an opposite one dated today; the original stays on the record. */
export function reverseJournal(s: Store, ctx: Ctx, entryNo: string, reason: string): ActionResult {
  const { company, manualJournals, setManualJournals, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("postJournals")) return DENIED;
  const j = manualJournals.find((x) => x.entryNo === entryNo);
  if (!j) return fail("ไม่พบรายการ", "Entry not found");
  if (j.kind !== "manual") return fail("รายการนำส่งภาษีกลับรายการไม่ได้", "A tax remittance can't be reversed");
  if (j.reverses) return fail("รายการนี้เป็นการกลับรายการอยู่แล้ว", "This entry is itself a reversal");
  if (manualJournals.some((x) => x.reverses === entryNo)) return fail("รายการนี้ถูกกลับรายการแล้ว", "This entry has already been reversed");
  const why = reason.trim();
  if (!why) return fail("กรุณาระบุเหตุผล", "Give a reason");
  const today = todayIso();
  const open = checkOpenPeriod(company, today);
  if (!open.ok) return open;
  const newNo = nextDocNo("JV", manualJournals.map((x) => x.entryNo));
  setManualJournals((prev) => [
    {
      entryNo: newNo,
      date: today,
      memo: `กลับรายการ ${entryNo} / Reversal of ${entryNo}: ${why}`,
      lines: j.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })),
      kind: "manual",
      reverses: entryNo,
      actor: actorRef.current,
    },
    ...prev,
  ]);
  pushAudit({ entityType: "journal", entityId: entryNo, action: "updated", summary: { th: `กลับรายการด้วย ${newNo} — ${why}`, en: `Reversed by ${newNo} — ${why}` } });
  return OK;
}

// ───────────────────────────── bank reconciliation ─────────────────────────────

export interface BankLineInput {
  date: string;
  description: string;
  amount: number;
  reference: string;
}

/** Statement lines in; ones already imported (same date, amount, reference, description) are skipped; then auto-match. */
export function importBankLines(s: Store, ctx: Ctx, input: BankLineInput[]): ActionResult & { added?: number; skipped?: number; matched?: number } {
  const { bankLines, setBankLines, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("reconcileBank")) return DENIED;
  if (input.length === 0) return fail("ไม่มีรายการในไฟล์", "The file has no lines");
  const key = (l: BankLineInput) => `${l.date}|${round2(l.amount)}|${l.reference.trim()}|${l.description.trim()}`;
  const seen = new Set(bankLines.map(key));
  const added: BankLine[] = [];
  for (const [i, l] of input.entries()) {
    if (!isIsoDate(l.date) || l.date > todayIso()) return fail(`บรรทัด ${i + 1}: วันที่ไม่ถูกต้อง`, `Line ${i + 1}: the date isn't valid`);
    if (!Number.isFinite(l.amount) || round2(l.amount) === 0) return fail(`บรรทัด ${i + 1}: จำนวนเงินไม่ถูกต้อง`, `Line ${i + 1}: the amount isn't valid`);
    if (seen.has(key(l))) continue;
    seen.add(key(l));
    added.push({ id: makeId(), date: l.date, description: l.description.trim(), amount: round2(l.amount), reference: l.reference.trim() });
  }
  setBankLines((prev) => [...prev, ...added]);
  const matched = added.length ? autoMatch(s) : 0;
  if (added.length)
    pushAudit({
      entityType: "bank",
      entityId: "STATEMENT",
      action: "created",
      summary: { th: `นำเข้าใบแจ้งยอดธนาคาร ${added.length} รายการ จับคู่อัตโนมัติ ${matched}`, en: `Imported ${added.length} bank statement lines, ${matched} matched automatically` },
    });
  return { ok: true, added: added.length, skipped: input.length - added.length, matched };
}

function autoMatch(s: Store): number {
  const suggestions = suggestMatches(s.bankLines, buildJournal(s));
  if (suggestions.size) s.bankLines = s.bankLines.map((l) => (suggestions.has(l.id) ? { ...l, matchedEntryId: suggestions.get(l.id) } : l));
  return suggestions.size;
}

export function autoMatchBank(s: Store, ctx: Ctx): ActionResult & { matched?: number } {
  if (!ctx.can("reconcileBank")) return DENIED;
  const matched = autoMatch(s);
  if (matched) pushAudit(s, ctx, { entityType: "bank", entityId: "STATEMENT", action: "updated", summary: { th: `จับคู่อัตโนมัติ ${matched} รายการ`, en: `Matched ${matched} statement lines automatically` } });
  return { ok: true, matched };
}

/** Matches a statement line to a book entry by hand — the amounts must agree, the dates needn't. */
export function matchBankLine(s: Store, ctx: Ctx, lineId: string, entryId: string): ActionResult {
  const { bankLines, setBankLines, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("reconcileBank")) return DENIED;
  const line = bankLines.find((l) => l.id === lineId);
  if (!line) return fail("ไม่พบรายการในใบแจ้งยอด", "Statement line not found");
  if (line.matchedEntryId) return fail("รายการนี้จับคู่แล้ว", "That statement line is already matched");
  const entry = buildJournal(s).find((e) => e.id === entryId);
  if (!entry || bankAmount(entry) === 0) return fail("ไม่พบรายการบัญชีที่เคลื่อนไหวเงินฝาก", "No bank entry with that ID");
  if (bankLines.some((l) => l.matchedEntryId === entryId)) return fail("รายการบัญชีนี้จับคู่กับบรรทัดอื่นแล้ว", "That entry is already matched to another line");
  if (Math.abs(bankAmount(entry) - line.amount) >= 0.005)
    return fail(`ยอดไม่ตรงกัน (฿${fmt(line.amount)} กับ ฿${fmt(bankAmount(entry))})`, `The amounts differ (฿${fmt(line.amount)} vs ฿${fmt(bankAmount(entry))})`);
  setBankLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, matchedEntryId: entryId } : l)));
  pushAudit({ entityType: "bank", entityId: entry.ref, action: "updated", summary: { th: `จับคู่ใบแจ้งยอด ${line.date} กับ ${entry.ref}`, en: `Matched statement line ${line.date} to ${entry.ref}` } });
  return OK;
}

export function unmatchBankLine(s: Store, ctx: Ctx, lineId: string): ActionResult {
  const { bankLines, setBankLines, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("reconcileBank")) return DENIED;
  const line = bankLines.find((l) => l.id === lineId);
  if (!line?.matchedEntryId) return fail("รายการนี้ยังไม่ได้จับคู่", "That line isn't matched");
  setBankLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, matchedEntryId: undefined } : l)));
  pushAudit({ entityType: "bank", entityId: line.matchedEntryId, action: "updated", summary: { th: `ยกเลิกการจับคู่ใบแจ้งยอด ${line.date}`, en: `Unmatched statement line ${line.date}` } });
  return OK;
}

/** Removes a statement line imported by mistake (unmatch it first). */
export function deleteBankLine(s: Store, ctx: Ctx, lineId: string): ActionResult {
  const { bankLines, setBankLines, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("reconcileBank")) return DENIED;
  const line = bankLines.find((l) => l.id === lineId);
  if (!line) return fail("ไม่พบรายการ", "Statement line not found");
  if (line.matchedEntryId) return fail("ยกเลิกการจับคู่ก่อนลบ", "Unmatch the line before removing it");
  setBankLines((prev) => prev.filter((l) => l.id !== lineId));
  pushAudit({
    entityType: "bank",
    entityId: "STATEMENT",
    action: "updated",
    sensitive: true,
    summary: { th: `ลบรายการใบแจ้งยอด ${line.date} ฿${fmt(line.amount)}`, en: `Removed statement line ${line.date} ฿${fmt(line.amount)}` },
  });
  return OK;
}

// ───────────────────────────── quotations ─────────────────────────────

export interface QuotationInput {
  customerId: string;
  validUntil: string;
  lines: { sku: string; quantity: number; unitPrice: number; discountPercent: number }[];
  notes: string;
}

export function createQuotation(s: Store, ctx: Ctx, input: QuotationInput): ActionResult & { quoteNo?: string } {
  const { customers, products, quotations, setQuotations, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("createSalesOrder")) return DENIED;
  const customer = customers.find((c) => c.customerId === input.customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  const today = todayIso();
  if (!isIsoDate(input.validUntil) || input.validUntil < today || input.validUntil > addDays(today, 90))
    return fail("ยืนราคาได้ตั้งแต่วันนี้ถึง 90 วัน", "Valid-until must be from today to 90 days ahead");
  if (input.lines.length === 0 || input.lines.length > 50) return fail("ต้องมี 1–50 รายการ", "A quotation needs 1–50 lines");
  const lines: QuotationLine[] = [];
  for (const l of input.lines) {
    if (!products.some((p) => p.sku === l.sku)) return fail(`ไม่พบสินค้า ${l.sku}`, `Product ${l.sku} not found`);
    if (!isWholePositive(l.quantity)) return fail("จำนวนต้องเป็นจำนวนเต็มมากกว่า 0", "Quantity must be a whole number above 0");
    if (!(l.unitPrice > 0)) return fail("ราคาต่อหน่วยต้องมากกว่า 0", "Unit price must be above 0");
    if (!(l.discountPercent >= 0 && l.discountPercent < 100)) return fail("ส่วนลดต้องอยู่ระหว่าง 0–99%", "Discount must be 0–99%");
    lines.push({ sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, netValue: computeSalesNetValue(l.quantity, l.unitPrice, l.discountPercent) });
  }
  const quoteNo = nextDocNo("QT", quotations.map((q) => q.quoteNo));
  const quote: Quotation = {
    quoteNo,
    customerId: customer.customerId,
    customerName: customer.name,
    date: today,
    validUntil: input.validUntil,
    lines,
    netValue: sumLines(lines),
    status: "open",
    notes: input.notes.trim(),
    createdBy: actorRef.current,
  };
  setQuotations((prev) => [quote, ...prev]);
  pushAudit({
    entityType: "quotation",
    entityId: quoteNo,
    action: "created",
    sensitive: true,
    summary: { th: `ใบเสนอราคา ${quoteNo} ถึง ${customer.name.th} ฿${fmt(quote.netValue)}`, en: `Quotation ${quoteNo} to ${customer.name.en} ฿${fmt(quote.netValue)}` },
  });
  return { ok: true, quoteNo };
}

export function declineQuotation(s: Store, ctx: Ctx, quoteNo: string, reason: string): ActionResult {
  const { quotations, setQuotations, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("createSalesOrder")) return DENIED;
  const q = quotations.find((x) => x.quoteNo === quoteNo);
  if (!q) return fail("ไม่พบใบเสนอราคา", "Quotation not found");
  if (q.status !== "open") return fail("ใบเสนอราคานี้ปิดแล้ว", "This quotation is already closed");
  const why = reason.trim();
  setQuotations((prev) => prev.map((x) => (x.quoteNo === quoteNo ? { ...x, status: "declined" as const } : x)));
  pushAudit({
    entityType: "quotation",
    entityId: quoteNo,
    action: "rejected",
    summary: { th: `ลูกค้าปฏิเสธใบเสนอราคา${why ? ` — ${why}` : ""}`, en: `Customer declined the quotation${why ? ` — ${why}` : ""}` },
  });
  return OK;
}

/**
 * The customer accepts: a sales order at the quoted prices, its lots picked oldest first (FIFO) from stock
 * not held by orders awaiting approval. The usual checks (license, credit, discount, margin) still apply.
 */
export function convertQuotation(s: Store, ctx: Ctx, quoteNo: string, plannedDeliveryDate?: string): ActionResult & { order?: SalesOrder } {
  const { quotations, inventory, salesOrders, allowed } = bind(s, ctx);

  if (!allowed("createSalesOrder")) return DENIED;
  const q = quotations.find((x) => x.quoteNo === quoteNo);
  if (!q) return fail("ไม่พบใบเสนอราคา", "Quotation not found");
  if (q.status !== "open") return fail("ใบเสนอราคานี้ปิดแล้ว", "This quotation is already closed");
  if (q.validUntil < todayIso()) return fail("ใบเสนอราคาหมดอายุแล้ว — ออกใบใหม่", "This quotation has expired — issue a new one");

  const held = heldByLot(salesOrders);
  const taken = new Map<string, number>();
  const lines: SalesLineInput[] = [];
  for (const l of q.lines) {
    let need = l.quantity;
    const lots = inventory.filter((i) => i.sku === l.sku).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.lotBatch.localeCompare(b.lotBatch));
    for (const lot of lots) {
      const free = lot.quantityRemaining - (held.get(lot.lotBatch) ?? 0) - (taken.get(lot.lotBatch) ?? 0);
      if (free <= 0 || need === 0) continue;
      const qty = Math.min(free, need);
      lines.push({ sku: l.sku, lotBatch: lot.lotBatch, quantity: qty, unitPrice: l.unitPrice, discountPercent: l.discountPercent });
      taken.set(lot.lotBatch, (taken.get(lot.lotBatch) ?? 0) + qty);
      need -= qty;
    }
    if (need > 0) return fail(`${l.sku}: สต๊อกพร้อมขายไม่พอ (ขาด ${need})`, `${l.sku}: not enough free stock (${need} short)`);
  }
  const res = createSalesOrder(s, ctx, { customerId: q.customerId, lines, ...(plannedDeliveryDate ? { plannedDeliveryDate } : {}) });
  if (!res.ok || !res.order) return res;
  const orderNo = res.order.orderNo;
  s.quotations = s.quotations.map((x) => (x.quoteNo === quoteNo ? { ...x, status: "accepted" as const, salesOrderNo: orderNo } : x));
  pushAudit(s, ctx, { entityType: "quotation", entityId: quoteNo, action: "approved", summary: { th: `ลูกค้าตอบรับ — เปิดออเดอร์ ${orderNo}`, en: `Accepted — became sales order ${orderNo}` } });
  return res;
}

// ───────────────────────────── emailed documents ─────────────────────────────

/** Puts a sent email on the record it was about (the sending itself is done by the API). */
export function logEmail(s: Store, ctx: Ctx, entityType: AuditEntry["entityType"], entityId: string, document: string, to: string[]): ActionResult {
  pushAudit(s, ctx, {
    entityType,
    entityId,
    action: "updated",
    summary: { th: `ส่ง${document}ทางอีเมลถึง ${to.join(", ")}`, en: `Emailed ${document} to ${to.join(", ")}` },
  });
  return OK;
}

// ───────────────────────────── stock counts ─────────────────────────────

/** Starts counting a warehouse: every lot with stock in it, at what the system says it holds now. */
export function startStockCount(s: Store, ctx: Ctx, warehouse: string, note: string): ActionResult & { countNo?: string } {
  const { warehouses, inventory, stockCounts, setStockCounts, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("adjustInventory")) return DENIED;
  const wh = warehouses.find((w) => w.code === warehouse);
  if (!wh) return fail("ไม่พบคลังสินค้า", "Warehouse not found");
  if (stockCounts.some((c) => c.warehouse === warehouse && c.status === "open"))
    return fail("คลังนี้มีการตรวจนับที่ยังไม่ปิดอยู่แล้ว", "This warehouse already has a count in progress");
  const lots = inventory.filter((i) => i.warehouse === warehouse && i.quantityRemaining > 0).sort((a, b) => a.sku.localeCompare(b.sku) || a.lotBatch.localeCompare(b.lotBatch));
  if (lots.length === 0) return fail("คลังนี้ไม่มีสินค้า", "There's no stock in this warehouse to count");
  const countNo = nextDocNo("SC", stockCounts.map((c) => c.countNo));
  setStockCounts((prev) => [
    {
      countNo,
      warehouse: wh.code,
      date: todayIso(),
      status: "open",
      lines: lots.map((l) => ({ lotBatch: l.lotBatch, sku: l.sku, expected: l.quantityRemaining, counted: null })),
      note: note.trim(),
      createdBy: actorRef.current,
    },
    ...prev,
  ]);
  pushAudit({ entityType: "stockCount", entityId: countNo, action: "created", summary: { th: `เริ่มตรวจนับคลัง ${wh.code} (${lots.length} ล็อต)`, en: `Started counting ${wh.code} (${lots.length} lots)` } });
  return { ok: true, countNo };
}

/** Saves what was counted (any lines; others stay as they are). */
export function enterStockCount(s: Store, ctx: Ctx, countNo: string, counts: { lotBatch: string; counted: number | null }[]): ActionResult {
  const { stockCounts, setStockCounts, allowed } = bind(s, ctx);

  if (!allowed("adjustInventory")) return DENIED;
  const sc = stockCounts.find((c) => c.countNo === countNo);
  if (!sc) return fail("ไม่พบใบตรวจนับ", "Stock count not found");
  if (sc.status !== "open") return fail("ใบตรวจนับนี้ปิดแล้ว", "This count is already closed");
  for (const c of counts) {
    if (!sc.lines.some((l) => l.lotBatch === c.lotBatch)) return fail(`ล็อต ${c.lotBatch} ไม่อยู่ในใบตรวจนับ`, `${c.lotBatch} isn't on this count`);
    if (c.counted !== null && !(Number.isInteger(c.counted) && c.counted >= 0 && c.counted <= 1_000_000))
      return fail(`${c.lotBatch}: จำนวนนับต้องเป็นจำนวนเต็มไม่ติดลบ`, `${c.lotBatch}: the count must be a whole number, 0 or more`);
  }
  const byLot = new Map(counts.map((c) => [c.lotBatch, c.counted]));
  setStockCounts((prev) =>
    prev.map((c) => (c.countNo === countNo ? { ...c, lines: c.lines.map((l) => (byLot.has(l.lotBatch) ? { ...l, counted: byLot.get(l.lotBatch)! } : l)) } : c)),
  );
  return OK;
}

/**
 * Posts a finished count: each lot is adjusted by (counted − expected), the difference found against what
 * the system said when counting began — so sales made while counting aren't mistaken for losses.
 */
export function postStockCount(s: Store, ctx: Ctx, countNo: string): ActionResult {
  const { stockCounts, inventory, setStockCounts, moveStock, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("adjustInventory")) return DENIED;
  const sc = stockCounts.find((c) => c.countNo === countNo);
  if (!sc) return fail("ไม่พบใบตรวจนับ", "Stock count not found");
  if (sc.status !== "open") return fail("ใบตรวจนับนี้ปิดแล้ว", "This count is already closed");
  const missing = sc.lines.filter((l) => l.counted === null).length;
  if (missing) return fail(`ยังไม่ได้นับอีก ${missing} ล็อต`, `${missing} lots haven't been counted yet`);
  const diffs = sc.lines.map((l) => ({ ...l, diff: (l.counted ?? 0) - l.expected })).filter((l) => l.diff !== 0);
  for (const d of diffs) {
    const lot = inventory.find((i) => i.lotBatch === d.lotBatch);
    if (!lot) return fail(`ไม่พบล็อต ${d.lotBatch}`, `Lot ${d.lotBatch} not found`);
    if (lot.quantityRemaining + d.diff < 0)
      return fail(`${d.lotBatch}: คงเหลือในระบบตอนนี้ ${lot.quantityRemaining} ปรับลด ${-d.diff} ไม่ได้`, `${d.lotBatch}: only ${lot.quantityRemaining} left now, can't take off ${-d.diff}`);
  }
  for (const d of diffs) moveStock(d.sku, d.lotBatch, d.diff, "adjustment", `${countNo} count`);
  setStockCounts((prev) => prev.map((c) => (c.countNo === countNo ? { ...c, status: "posted" as const, postedBy: actorRef.current, postedOn: todayIso() } : c)));
  const what = diffs.map((d) => `${d.lotBatch} ${d.diff > 0 ? "+" : ""}${d.diff}`).join(", ");
  pushAudit({
    entityType: "stockCount",
    entityId: countNo,
    action: "approved",
    summary: diffs.length
      ? { th: `ลงผลตรวจนับ ${sc.warehouse}: ${what}`, en: `Posted count of ${sc.warehouse}: ${what}` }
      : { th: `ลงผลตรวจนับ ${sc.warehouse}: ตรงกับระบบทุกล็อต`, en: `Posted count of ${sc.warehouse}: every lot matched` },
  });
  return OK;
}

export function cancelStockCount(s: Store, ctx: Ctx, countNo: string): ActionResult {
  const { stockCounts, setStockCounts, pushAudit, allowed } = bind(s, ctx);

  if (!allowed("adjustInventory")) return DENIED;
  const sc = stockCounts.find((c) => c.countNo === countNo);
  if (!sc) return fail("ไม่พบใบตรวจนับ", "Stock count not found");
  if (sc.status !== "open") return fail("ใบตรวจนับนี้ปิดแล้ว", "This count is already closed");
  setStockCounts((prev) => prev.map((c) => (c.countNo === countNo ? { ...c, status: "cancelled" as const } : c)));
  pushAudit({ entityType: "stockCount", entityId: countNo, action: "rejected", summary: { th: "ยกเลิกการตรวจนับ", en: "Count cancelled" } });
  return OK;
}

// ───────────────────────────── payment reminders ─────────────────────────────

/** Records that a customer was reminded to pay what's overdue (the letter itself is printed or emailed). */
export function recordReminder(s: Store, ctx: Ctx, customerId: string, level: number, note: string): ActionResult {
  const { customers, salesOrders, arDocuments, setArReminders, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("recordPayment")) return DENIED;
  const customer = customers.find((c) => c.customerId === customerId);
  if (!customer) return fail("ไม่พบลูกค้า", "Customer not found");
  if (level !== 1 && level !== 2 && level !== 3) return fail("ระดับการทวงถามไม่ถูกต้อง", "Reminder level must be 1, 2 or 3");
  const today = todayIso();
  const overdue = round2(
    computeArOpenItems(customer, salesOrders, arDocuments)
      .filter((i) => i.dueDate < today)
      .reduce((sum, i) => sum + i.open, 0),
  );
  if (overdue <= 0) return fail("ลูกค้ารายนี้ไม่มียอดค้างชำระเกินกำหนด", "This customer has nothing overdue");
  setArReminders((prev) => [{ id: makeId(), customerId, date: today, level, overdueAmount: overdue, note: note.trim(), actor: actorRef.current }, ...prev]);
  pushAudit({
    entityType: "customer",
    entityId: customerId,
    action: "updated",
    sensitive: true,
    summary: {
      th: `ส่งหนังสือทวงถามครั้งที่ ${level} — ค้างชำระ ฿${fmt(overdue)}${note.trim() ? ` (${note.trim()})` : ""}`,
      en: `Payment reminder ${level} sent — ฿${fmt(overdue)} overdue${note.trim() ? ` (${note.trim()})` : ""}`,
    },
  });
  return OK;
}

// ───────────────────────────── purchase requests ─────────────────────────────

export interface PurchaseRequestInput {
  sku: string;
  quantity: number;
  reason: string;
  preferredSupplierId: string | null;
}

export function createPurchaseRequest(s: Store, ctx: Ctx, input: PurchaseRequestInput): ActionResult & { requestNo?: string } {
  const { products, suppliers, purchaseRequests, setPurchaseRequests, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("requestPurchase")) return DENIED;
  const product = products.find((p) => p.sku === input.sku);
  if (!product) return fail("ไม่พบสินค้า", "Product not found");
  if (!isWholePositive(input.quantity) || input.quantity > 100000) return fail("จำนวนต้องเป็นจำนวนเต็ม 1–100,000", "Quantity must be a whole number, 1–100,000");
  const reason = input.reason.trim();
  if (!reason) return fail("กรุณาระบุเหตุผล", "Say why it's needed");
  if (input.preferredSupplierId && !suppliers.some((sp) => sp.supplierId === input.preferredSupplierId && sp.active)) return fail("ไม่พบผู้ขาย", "Supplier not found");
  const open = purchaseRequests.find((r) => r.sku === input.sku && (r.status === "pending" || r.status === "approved"));
  if (open) return fail(`มีคำขอซื้อ ${open.requestNo} ของสินค้านี้ค้างอยู่แล้ว`, `There's already an open request for this product (${open.requestNo})`);
  const requestNo = nextDocNo("PR", purchaseRequests.map((r) => r.requestNo));
  setPurchaseRequests((prev) => [
    {
      requestNo,
      date: todayIso(),
      sku: input.sku,
      quantity: input.quantity,
      reason,
      preferredSupplierId: input.preferredSupplierId,
      status: "pending",
      requestedBy: actorRef.current,
    },
    ...prev,
  ]);
  pushAudit({
    entityType: "purchaseRequest",
    entityId: requestNo,
    action: "created",
    summary: { th: `ขอซื้อ ${product.sku} × ${input.quantity} — ${reason}`, en: `Requested ${product.sku} × ${input.quantity} — ${reason}` },
  });
  return { ok: true, requestNo };
}

export function decidePurchaseRequest(s: Store, ctx: Ctx, requestNo: string, approve: boolean, note: string): ActionResult {
  const { purchaseRequests, setPurchaseRequests, pushAudit, allowed, actorRef } = bind(s, ctx);

  if (!allowed("approve")) return DENIED;
  const r = purchaseRequests.find((x) => x.requestNo === requestNo);
  if (!r) return fail("ไม่พบคำขอซื้อ", "Purchase request not found");
  if (r.status !== "pending") return fail("คำขอนี้พิจารณาแล้ว", "This request has already been decided");
  if (sameActor(r.requestedBy, actorRef.current)) return fail("อนุมัติคำขอของตัวเองไม่ได้", "You can't decide your own request");
  const why = note.trim();
  if (!approve && !why) return fail("กรุณาระบุเหตุผลที่ไม่อนุมัติ", "Give a reason for rejecting");
  setPurchaseRequests((prev) =>
    prev.map((x) => (x.requestNo === requestNo ? { ...x, status: approve ? ("approved" as const) : ("rejected" as const), decidedBy: actorRef.current, decisionNote: why } : x)),
  );
  pushAudit({
    entityType: "purchaseRequest",
    entityId: requestNo,
    action: approve ? "approved" : "rejected",
    summary: approve
      ? { th: `อนุมัติคำขอซื้อ${why ? ` — ${why}` : ""}`, en: `Approved the purchase request${why ? ` — ${why}` : ""}` }
      : { th: `ไม่อนุมัติ — ${why}`, en: `Rejected — ${why}` },
  });
  return OK;
}
