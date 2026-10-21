import type {
  Bilingual,
  ChannelCode,
  Customer,
  CreditStatus,
  DeliveryStatus,
  ImportOrder,
  ImportOrderLineItem,
  ImportOrderStatus,
  ExciseKind,
  ImportTaxBreakdown,
  InventoryItem,
  InventoryStatus,
  License,
  PriceList,
  TaxSettings,
  LicenseStatus,
  Product,
  ProductStatus,
  SalesOrder,
  ExchangeRate,
} from "../data/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shared option lists for Sales Order forms/filters — single source so they can't drift between pages. */
export const DELIVERY_STATUS_OPTIONS: DeliveryStatus[] = ["delivered", "inDelivery", "pendingShipment", "returned", "damaged"];
export const SALES_CHANNEL_OPTIONS: ChannelCode[] = ["distributor", "retailWholesale", "restaurantBar", "online"];

/**
 * FR-17/24: delivery lifecycle. Returned/Damaged are terminal — once stock and the customer's balance
 * have been reversed, the order can't be quietly reopened without re-booking those effects.
 */
const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pendingShipment: ["inDelivery"],
  inDelivery: ["delivered", "returned", "damaged"],
  delivered: ["returned"],
  returned: [],
  damaged: [],
};

/** The current status plus every status it may legally move to next — what a status picker should offer. */
export function deliveryStatusChoices(current: DeliveryStatus): DeliveryStatus[] {
  return [current, ...DELIVERY_TRANSITIONS[current]];
}

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return DELIVERY_TRANSITIONS[from].includes(to);
}

/** Orders whose goods never reached (or came back from) the customer — excluded from net sales. */
export function isReversedSale(order: Pick<SalesOrder, "deliveryStatus">): boolean {
  return order.deliveryStatus === "returned" || order.deliveryStatus === "damaged";
}

/** Booked = approved (or never needed approval) — the only orders that move stock, credit, and revenue. */
export function isBookedSale(order: Pick<SalesOrder, "approvalStatus">): boolean {
  return !order.approvalStatus;
}

/** Terms can change until the goods leave the warehouse; rejected orders are closed. */
export function canEditSalesOrder(order: Pick<SalesOrder, "approvalStatus" | "deliveryStatus">): boolean {
  if (order.approvalStatus === "rejected") return false;
  return order.approvalStatus === "pendingApproval" || order.deliveryStatus === "pendingShipment";
}

/** BR-04: "field: old → new" for each field that actually changed — empty when nothing did. */
export function describeChanges<T extends object>(before: T, patch: Partial<T>): string[] {
  const changes: string[] = [];
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const prev = before[key];
    const next = patch[key];
    if (prev === next) continue;
    const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
    changes.push(`${String(key)}: ${show(prev)} → ${show(next)}`);
  }
  return changes;
}

/** Appends -2, -3… to a proposed lot number until it doesn't collide with an existing lot. */
export function uniqueLotBatch(proposed: string, taken: ReadonlySet<string>): string {
  if (!taken.has(proposed)) return proposed;
  let n = 2;
  while (taken.has(`${proposed}-${n}`)) n += 1;
  return `${proposed}-${n}`;
}

/** FR-23: net value from quantity, unit price, and discount — used at order creation and at edit time. */
export function computeSalesNetValue(quantity: number, unitPrice: number, discountPercent: number): number {
  return Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
}

/** Mirrors the spreadsheet formula: days remaining / status recalculated live against today. */
export function computeLicenseStatus(expiryDateIso: string): { daysRemaining: number; status: LicenseStatus } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateIso + "T00:00:00");
  const daysRemaining = Math.round((expiry.getTime() - today.getTime()) / DAY_MS);
  const status: LicenseStatus = daysRemaining < 0 ? "expired" : daysRemaining <= 30 ? "expiringSoon" : "normal";
  return { daysRemaining, status };
}

/** FR-22: while a discount-exceeding order awaits/failed real approval, show that instead of the (not-yet-meaningful) delivery status. */
export function salesOrderDisplayStatus(order: SalesOrder): string {
  return order.approvalStatus ?? order.deliveryStatus;
}

const NEAR_LIMIT_RATIO = 0.1;

export function computeCreditStatus(
  creditLimit: number,
  outstandingBalance: number,
  hasLicense: boolean,
): { creditRemaining: number; creditStatus: CreditStatus } {
  const creditRemaining = creditLimit - outstandingBalance;
  let creditStatus: CreditStatus;
  if (!hasLicense) creditStatus = "noLicense";
  else if (creditRemaining < 0) creditStatus = "overLimit";
  else if (creditLimit > 0 && creditRemaining / creditLimit <= NEAR_LIMIT_RATIO) creditStatus = "nearLimit";
  else creditStatus = "normal";
  return { creditRemaining, creditStatus };
}

/** Mirrors the spreadsheet formula: stock age recalculated live against today. */
export function computeInventoryAge(receivedDateIso: string): { ageDays: number; status: InventoryStatus } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const received = new Date(receivedDateIso + "T00:00:00");
  const ageDays = Math.round((today.getTime() - received.getTime()) / DAY_MS);
  const status: InventoryStatus = ageDays > 180 ? "agingLong" : ageDays > 90 ? "agingStart" : "normal";
  return { ageDays, status };
}

/** Mirrors the Products_SKU sheet: stock-driven status, recalculated after a sale is booked. */
export function computeProductStatus(stockAvailable: number): ProductStatus {
  if (stockAvailable <= 0) return "outOfStock";
  if (stockAvailable <= 20) return "lowStock";
  return "available";
}

/** yyyy-mm-dd in the user's local calendar — toISOString() would shift to UTC (a day early in Thailand, UTC+7). */
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
}

export function todayIso(): string {
  return toLocalIso(new Date());
}

/**
 * Next sequential order/document number, matching an existing "PREFIX-####" pattern
 * (e.g. "SO-2026-3301" -> "SO-2026-3302"), preserving the numeric width.
 */
export function nextOrderNumber(existing: string[]): string {
  let bestPrefix = "";
  let bestNumber = 0;
  let bestWidth = 4;
  for (const value of existing) {
    const match = value.match(/^(.*-)(\d+)$/);
    if (!match) continue;
    const [, prefix, digits] = match;
    const n = Number(digits);
    if (n > bestNumber) {
      bestNumber = n;
      bestPrefix = prefix;
      bestWidth = digits.length;
    }
  }
  return `${bestPrefix}${String(bestNumber + 1).padStart(bestWidth, "0")}`;
}

const PRICE_DEVIATION_TOLERANCE = 0.3;

export interface LineValidation {
  filled: boolean;
  skuOk: boolean;
  abvOk: boolean;
  priceOk: boolean;
}

/** The Excise Department's class for a category: wine, beer, or (everything distilled) spirits. */
export function exciseKindOf(category: Product["category"]): ExciseKind {
  return category === "redWine" || category === "whiteWine" ? "wine" : category === "beer" ? "beer" : "spirits";
}

/** Litres in one sale unit: a 6-pack of 330 ml cans is 1.98 L. */
export const litresPerUnit = (product: Pick<Product, "packageSize" | "unitsPerPack">) => ((product.packageSize ?? 700) * Math.max(1, product.unitsPerPack ?? 1)) / 1000;

export interface ExciseBreakdown {
  /** Excise itself: value part + quantity part. */
  excise: number;
  /** Interior Ministry tax on the excise. */
  localTax: number;
  /** Fund levies on the excise. */
  funds: number;
  /** All three — what the importer pays on top of duty and VAT. */
  total: number;
}

/**
 * Excise per sale unit (baht), the way the Excise Department works it out: the value part is a share of the
 * suggested retail price before VAT; the quantity part is baht per litre of pure alcohol (litres × ABV).
 * Interior Ministry tax and the fund levies are percentages of that excise.
 */
export function excisePerUnit(
  product: Pick<Product, "packageSize" | "unitsPerPack" | "category" | "suggestedPrice">,
  abv: number,
  tax: Pick<TaxSettings, "exciseRates" | "localTaxPercent" | "fundsPercent" | "vatPercent">,
): ExciseBreakdown {
  const rate = tax.exciseRates.find((r) => r.kind === exciseKindOf(product.category)) ?? { valuePercent: 0, perLitreAlcohol: 0 };
  const retailExVat = (product.suggestedPrice ?? 0) / (1 + tax.vatPercent / 100);
  const pureAlcohol = litresPerUnit(product) * (abv / 100);
  const excise = retailExVat * (rate.valuePercent / 100) + pureAlcohol * rate.perLitreAlcohol;
  const localTax = excise * (tax.localTaxPercent / 100);
  const funds = excise * (tax.fundsPercent / 100);
  return { excise, localTax, funds, total: excise + localTax + funds };
}

/**
 * What the supplier is expected to charge per unit, in baht. A product's cost price is its all-in landed
 * cost (the figure margins are measured against), so the supplier price is what's left once duty and excise
 * are taken out: (cost - excise) / (1 + duty rate).
 */
export function referencePurchasePrice(product: Product, tax: TaxSettings): number {
  const duty = dutyRateFor(product.hsCode, tax) / 100;
  return Math.max(0, Math.round(((product.costPrice - excisePerUnit(product, product.abv, tax).total) / (1 + duty)) * 100) / 100);
}

/**
 * FR-04: SKU must match the Product Master, ABV in 0-75%, price within 30% of the expected supplier price.
 * `rate` converts the order's currency to baht; `tax` gives the expected supplier price.
 */
export function validateImportLine(
  line: { sku: string; abv: number; unitPrice: number },
  products: Product[],
  rate: number,
  tax: TaxSettings,
): LineValidation {
  const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
  const filled = line.sku.trim() !== "";
  const skuOk = !filled || Boolean(product);
  const abvOk = line.abv >= 0 && line.abv <= 75;
  const reference = product ? referencePurchasePrice(product, tax) : 0;
  const priceOk = !product || reference <= 0 || Math.abs(line.unitPrice * rate - reference) / reference <= PRICE_DEVIATION_TOLERANCE;
  return { filled, skuOk, abvOk, priceOk };
}

/** FR-04/05: messages for whichever lines fail validation, in both languages, for display or an audit note. */
export function describeLineIssues(lines: ImportOrderLineItem[], products: Product[], rate: number, tax: TaxSettings): Bilingual[] {
  const msgs: Bilingual[] = [];
  for (const line of lines) {
    const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
    const { filled, skuOk, abvOk, priceOk } = validateImportLine(line, products, rate, tax);
    if (!filled) continue;
    if (!skuOk) msgs.push({ th: `${line.sku}: ไม่ตรงกับ Product Master`, en: `${line.sku}: not in Product Master` });
    if (!abvOk) msgs.push({ th: `${line.sku}: ABV ${line.abv}% นอกช่วง 0–75%`, en: `${line.sku}: ABV ${line.abv}% outside 0–75%` });
    if (product && !priceOk) {
      const ref = referencePurchasePrice(product, tax);
      msgs.push({ th: `${line.sku}: ราคา (เป็นบาท) ต่างจากราคาที่คาดไว้ ฿${ref} เกิน 30%`, en: `${line.sku}: price in baht deviates from the expected ฿${ref} by over 30%` });
    }
  }
  return msgs;
}

/** FR-10: duty rate for a product from the Tax Rates master — longest matching HS Code prefix wins. */
export function dutyRateFor(hsCode: string | undefined, tax: TaxSettings): number {
  if (!hsCode) return tax.defaultDutyPercent;
  const match = tax.dutyRates
    .filter((r) => r.hsPrefix && hsCode.startsWith(r.hsPrefix))
    .sort((a, b) => b.hsPrefix.length - a.hsPrefix.length)[0];
  return match?.dutyPercent ?? tax.defaultDutyPercent;
}

/**
 * FR-10/11: what clearing an import order costs in tax, in baht, as Customs works it out:
 * import duty on the goods value; excise (value + quantity parts) with the Interior Ministry tax and fund
 * levies on it; and import VAT on goods + duty + excise + levies. One excise stamp per bottle or can.
 * Line prices are in the order's currency; `rate` converts them.
 */
export function computeImportTax(lines: ImportOrderLineItem[], products: Product[], tax: TaxSettings, rate = 1): ImportTaxBreakdown {
  let importDuty = 0;
  let exciseTax = 0;
  let localTax = 0;
  let funds = 0;
  let exciseStampCount = 0;

  for (const line of lines) {
    const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
    importDuty += line.qty * line.unitPrice * rate * (dutyRateFor(product?.hsCode, tax) / 100);
    if (product) {
      const e = excisePerUnit(product, line.abv, tax);
      exciseTax += e.excise * line.qty;
      localTax += e.localTax * line.qty;
      funds += e.funds * line.qty;
    }
    exciseStampCount += line.qty * Math.max(1, product?.unitsPerPack ?? 1);
  }

  const lineValueTotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice * rate, 0);
  const vat = (lineValueTotal + importDuty + exciseTax + localTax + funds) * (tax.vatPercent / 100);

  return {
    // Effective (value-weighted) rate — a mixed whisky + wine order isn't "60%" or "54%", it's in between.
    dutyRatePercent: lineValueTotal > 0 ? Math.round((importDuty / lineValueTotal) * 1000) / 10 : tax.defaultDutyPercent,
    importDuty: Math.round(importDuty),
    exciseTax: Math.round(exciseTax),
    localTax: Math.round(localTax),
    funds: Math.round(funds),
    vat: Math.round(vat),
    totalTax: Math.round(importDuty + exciseTax + localTax + funds + vat),
    exciseStampCount,
  };
}

/** Baht per one unit of `currency` on `date`: the latest rate effective on or before it. Baht is always 1. */
export function rateOn(rates: ExchangeRate[], currency: string, date: string): number | null {
  if (currency === "THB") return 1;
  const r = rates
    .filter((x) => x.currency === currency && x.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  return r?.rate ?? null;
}

/** An order's goods value in baht. */
export const goodsValueThb = (lines: ImportOrderLineItem[], rate: number) => Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice * rate, 0) * 100) / 100;

/**
 * Landed cost per unit, in baht, of each SKU received on an import order: purchase price converted at the
 * order's rate, plus import duty and excise, plus a share of freight/insurance/clearing (`additionalCostThb`,
 * spread by goods value). Import VAT is left out — it's reclaimed, not part of what the stock cost.
 */
export function landedUnitCosts(
  order: Pick<ImportOrder, "lineItems" | "exchangeRate">,
  received: { sku: string; receivedQty: number }[],
  products: Product[],
  tax: TaxSettings,
  additionalCostThb = 0,
): Map<string, number> {
  const rate = order.exchangeRate ?? 1;
  const perSku = new Map<string, { qty: number; value: number; abvQty: number }>();
  for (const l of order.lineItems ?? []) {
    const e = perSku.get(l.sku) ?? { qty: 0, value: 0, abvQty: 0 };
    e.qty += l.qty;
    e.value += l.qty * l.unitPrice;
    e.abvQty += l.qty * l.abv;
    perSku.set(l.sku, e);
  }
  const unitGoods = (sku: string) => {
    const e = perSku.get(sku);
    return e && e.qty > 0 ? (e.value / e.qty) * rate : 0;
  };
  const receivedGoods = received.reduce((sum, r) => sum + unitGoods(r.sku) * r.receivedQty, 0);
  const out = new Map<string, number>();
  for (const r of received) {
    if (r.receivedQty <= 0 || out.has(r.sku)) continue;
    const e = perSku.get(r.sku);
    const product = products.find((p) => p.sku === r.sku);
    const goods = unitGoods(r.sku);
    const duty = goods * (dutyRateFor(product?.hsCode, tax) / 100);
    const abv = e && e.qty > 0 ? e.abvQty / e.qty : 0;
    const excise = product ? excisePerUnit(product, abv, tax).total : 0;
    const extra = receivedGoods > 0 ? (additionalCostThb * goods) / receivedGoods : 0;
    out.set(r.sku, Math.round((goods + duty + excise + extra) * 100) / 100);
  }
  return out;
}

/** Thai tax invoice (Revenue Code §86/4): VAT shown separately. Sales prices here are VAT-inclusive. */
export function splitVat(grossInclVat: number, vatPercent: number): { base: number; vat: number } {
  const base = Math.round((grossInclVat / (1 + vatPercent / 100)) * 100) / 100;
  return { base, vat: Math.round((grossInclVat - base) * 100) / 100 };
}

/** FR-26: the channel's price list — a fixed SKU price if one is set, else the suggested price ± the channel %. */
export function computeChannelPrice(product: Pick<Product, "sku" | "suggestedPrice">, channel: ChannelCode, priceLists: PriceList[]): number {
  const list = priceLists.find((l) => l.channel === channel);
  if (!list) return product.suggestedPrice;
  const fixed = list.overrides[product.sku];
  if (fixed !== undefined) return fixed;
  return Math.round(product.suggestedPrice * (1 + list.adjustmentPercent / 100));
}

/** Statuses where goods are committed but not yet in the warehouse — counted as inbound for reordering. */
const INBOUND_STATUSES = new Set<ImportOrderStatus>(["approved", "customsCleared"]);

/** Units on approved, not-yet-received import orders, per SKU. */
export function computeInboundBySku(importOrders: ImportOrder[]): Map<string, number> {
  const inbound = new Map<string, number>();
  for (const o of importOrders) {
    if (!INBOUND_STATUSES.has(o.status)) continue;
    for (const l of o.lineItems ?? []) inbound.set(l.sku, (inbound.get(l.sku) ?? 0) + l.qty);
  }
  return inbound;
}

/** FR-28: import orders above this value require a second, different supervisor's sign-off. */
export const HIGH_VALUE_APPROVAL_THRESHOLD = 500_000;

/** FR-09: Import License Type 1 vs. Type 5 carry different conditions — read off the license's type text. */
export type ImportLicenseKind = "type1" | "type5" | "other";

export function getImportLicenseKind(type: Bilingual): ImportLicenseKind {
  if (type.en.includes("Type 1")) return "type1";
  if (type.en.includes("Type 5")) return "type5";
  return "other";
}

/** FR-09: Type 5 licenses are capped to a smaller volume than Type 1 (illustrative demo rule). */
export const TYPE5_VOLUME_CAP = 500;

export interface ImportLicenseCheck {
  expired: boolean;
  etaUncovered: boolean;
  volumeExceeded: boolean;
}

/** FR-09/§7.1: the referenced import license must be valid, cover the ETA, and (Type 5) stay under its cap. */
export function checkImportLicense(license: License | null | undefined, etaDate: string, totalQty: number): ImportLicenseCheck {
  if (!license) return { expired: false, etaUncovered: false, volumeExceeded: false };
  const expired = computeLicenseStatus(license.expiryDate).status === "expired";
  return {
    expired,
    etaUncovered: !expired && etaDate > license.expiryDate,
    volumeExceeded: getImportLicenseKind(license.type) === "type5" && totalQty > TYPE5_VOLUME_CAP,
  };
}

export function describeLicenseIssues(check: ImportLicenseCheck): Bilingual[] {
  const msgs: Bilingual[] = [];
  if (check.expired)
    msgs.push({
      th: "ใบอนุญาตนำเข้าที่เลือกหมดอายุแล้ว — ผิดเงื่อนไข Import Compliance Risk",
      en: "The selected import license has expired — violates the Import Compliance Risk control",
    });
  if (check.etaUncovered)
    msgs.push({
      th: "วันที่คาดว่าถึงอยู่หลังวันหมดอายุใบอนุญาต — ไม่มีหลักฐานว่านำเข้าภายในอายุใบอนุญาต (§7.1)",
      en: "ETA falls after the license expires — no evidence the import happens within the license period (§7.1)",
    });
  if (check.volumeExceeded)
    msgs.push({
      th: `จำนวนรวมเกินเพดานของใบอนุญาตประเภทที่ 5 (${TYPE5_VOLUME_CAP} หน่วย)`,
      en: `Total quantity exceeds the Type 5 license cap (${TYPE5_VOLUME_CAP} units)`,
    });
  return msgs;
}

/**
 * FR-04/05/09: every reason an import order can't proceed — line validation *and* license checks.
 * Used at intake and again on every correction, so fixing a line can't silently clear a license problem.
 */
export function describeImportOrderIssues(
  order: { lineItems: ImportOrderLineItem[]; etaDate: string; importLicenseNo?: string | null; exchangeRate?: number },
  products: Product[],
  licenses: License[],
  tax: TaxSettings,
): Bilingual[] {
  const license = order.importLicenseNo ? licenses.find((l) => l.licenseNo === order.importLicenseNo) : null;
  const totalQty = order.lineItems.reduce((sum, l) => sum + l.qty, 0);
  const qtyIssues: Bilingual[] = order.lineItems
    .filter((l) => l.sku.trim() !== "" && (!Number.isFinite(l.qty) || l.qty <= 0 || !Number.isInteger(l.qty)))
    .map((l) => ({ th: `${l.sku}: จำนวนต้องเป็นจำนวนเต็มมากกว่า 0`, en: `${l.sku}: quantity must be a whole number above 0` }));
  return [
    ...describeLineIssues(order.lineItems, products, order.exchangeRate ?? 1, tax),
    ...qtyIssues,
    ...describeLicenseIssues(checkImportLicense(license, order.etaDate, totalQty)),
  ];
}

export function joinIssues(issues: Bilingual[]): Bilingual | undefined {
  if (issues.length === 0) return undefined;
  return { th: issues.map((m) => m.th).join("; "), en: issues.map((m) => m.en).join("; ") };
}

/** An order still on its way whose ETA has passed — needs chasing with the forwarder. */
export function isImportOverdue(order: Pick<ImportOrder, "status" | "etaDate">): boolean {
  return order.status !== "receivedWarehouse" && order.status !== "rejected" && order.etaDate < todayIso();
}

/** FR-12: derives an explicit Customs Clearance Status from the order's stage in the workflow. */
export function computeCustomsClearanceStatus(status: ImportOrderStatus): "pending" | "cleared" {
  return status === "customsCleared" || status === "receivedWarehouse" ? "cleared" : "pending";
}

/**
 * BR-09: inventory value by *pipeline* status (In Transit / Customs Clearance vs. Available for Sale) —
 * distinct from the aging-based "Inventory Value by Status" breakdown, which answers a different question.
 */
// Only committed orders count as stock on its way — a purchase order still in staging, awaiting
// approval, or blocked by an issue isn't inventory yet (and may never be).
export const IN_TRANSIT_STATUSES = new Set<ImportOrderStatus>(["approved", "customsCleared"]);
const PIPELINE_ACTIVE_STATUSES = IN_TRANSIT_STATUSES;

export function computeInTransitValue(importOrders: ImportOrder[]): number {
  return importOrders.filter((o) => PIPELINE_ACTIVE_STATUSES.has(o.status)).reduce((sum, o) => sum + o.totalValue, 0);
}

export function computeAvailableForSaleValue(inventory: InventoryItem[], products: Product[]): number {
  return inventory.reduce((sum, i) => {
    const product = products.find((p) => p.sku === i.sku);
    return sum + i.quantityRemaining * (product?.costPrice ?? 0);
  }, 0);
}

/**
 * FR-22/28: every reason a sales order needs a supervisor before it can book. Selling below landed
 * cost is included alongside over-standard discount and over-credit, since it's a margin control too.
 * Checked across all lines: one over-discounted or below-cost line is enough.
 */
export function salesApprovalReasons(input: {
  customer: Pick<Customer, "standardDiscount" | "creditLimit" | "outstandingBalance">;
  lines: { discountPercent: number; netValue: number; quantity: number; costPrice: number }[];
  /** Value already counted in outstandingBalance for this order (when re-checking an edit). */
  alreadyBooked?: number;
  /** How many days past due the customer's oldest unpaid invoice is (0 when nothing is overdue). */
  overdueDays?: number;
}): Bilingual[] {
  const reasons: Bilingual[] = [];
  if (input.lines.some((l) => l.discountPercent > input.customer.standardDiscount))
    reasons.push({ th: "ส่วนลดเกินมาตรฐาน", en: "Over-standard discount" });
  const total = input.lines.reduce((sum, l) => sum + l.netValue, 0);
  const projected = input.customer.outstandingBalance - (input.alreadyBooked ?? 0) + total;
  if (projected > input.customer.creditLimit) reasons.push({ th: "เกินวงเงินเครดิตที่อนุมัติ", en: "Over approved credit limit" });
  if (input.lines.some((l) => l.quantity > 0 && l.netValue / l.quantity < l.costPrice))
    reasons.push({ th: "ราคาสุทธิต่ำกว่าต้นทุน", en: "Net price below cost" });
  if ((input.overdueDays ?? 0) > OVERDUE_HOLD_DAYS)
    reasons.push({ th: `มีใบแจ้งหนี้ค้างชำระเกิน ${OVERDUE_HOLD_DAYS} วัน`, en: `Invoices more than ${OVERDUE_HOLD_DAYS} days overdue` });
  return reasons;
}

/** The stage a sales order is at — its approval state until booked, then its delivery state. */
export function salesStage(o: Pick<SalesOrder, "approvalStatus" | "deliveryStatus">): string {
  return o.approvalStatus ?? o.deliveryStatus;
}

/** The stage an import order is at; a high-value order's first sign-off counts as its own stage. */
export function importStage(o: Pick<ImportOrder, "status" | "firstApprover">): string {
  return o.status === "pendingApproval" && o.firstApprover ? "firstApproved" : o.status;
}

/**
 * On-time delivery: of the orders delivered in the window, the share that arrived on or before the date
 * promised to the customer. Null when nothing with a promised date was delivered in the window.
 */
export function onTimeDeliveryRate(
  orders: Pick<SalesOrder, "deliveryStatus" | "plannedDeliveryDate" | "statusHistory" | "approvalStatus">[],
  since: string,
): { rate: number | null; delivered: number; onTime: number } {
  let delivered = 0;
  let onTime = 0;
  for (const o of orders) {
    if (o.approvalStatus || o.deliveryStatus !== "delivered" || !o.plannedDeliveryDate) continue;
    const at = [...(o.statusHistory ?? [])].reverse().find((e) => e.status === "delivered")?.at;
    if (!at) continue;
    const day = at.slice(0, 10);
    if (day < since) continue;
    delivered++;
    if (day <= o.plannedDeliveryDate) onTime++;
  }
  return { rate: delivered ? Math.round((onTime / delivered) * 1000) / 10 : null, delivered, onTime };
}

/** Units across all of an order's lines. */
export function orderQuantity(order: Pick<SalesOrder, "lines">): number {
  return order.lines.reduce((sum, l) => sum + l.quantity, 0);
}

/**
 * Cost of goods for an order: each line's landed cost recorded when it was sold (what that stock actually
 * cost), falling back to the product's reference cost for lines that predate cost tracking. Units the
 * customer returned are left out — they went back on the shelf.
 */
export function orderCost(order: Pick<SalesOrder, "lines">, products: Pick<Product, "sku" | "costPrice">[]): number {
  return order.lines.reduce(
    (sum, l) => sum + (l.unitCost ?? products.find((p) => p.sku === l.sku)?.costPrice ?? 0) * (l.quantity - (l.returnedQuantity ?? 0)),
    0,
  );
}

/** Revenue excluding VAT — sales prices are VAT-inclusive, margins are measured on what the business keeps. */
export function revenueExVat(order: Pick<SalesOrder, "netValue" | "vatPercent">, defaultVat = 7): number {
  return splitVat(order.netValue, order.vatPercent ?? defaultVat).base;
}

/** Order total from its lines (2-decimal rounding, like each line). */
export function sumLines(lines: { netValue: number }[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.netValue, 0) * 100) / 100;
}

/**
 * Units of each lot held by orders waiting for a supervisor: not yet sold, but promised. New orders and
 * approvals count them as unavailable, so two salespeople can't both promise the last units of a lot.
 */
export function heldByLot(orders: Pick<SalesOrder, "orderNo" | "approvalStatus" | "lines">[], exceptOrderNo?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (o.approvalStatus !== "pendingApproval" || o.orderNo === exceptOrderNo) continue;
    for (const l of o.lines) m.set(l.lotBatch, (m.get(l.lotBatch) ?? 0) + l.quantity);
  }
  return m;
}

/** Units of each lot an order's lines take — two lines may share one lot. */
export function quantityByLot(lines: { lotBatch: string; quantity: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.lotBatch, (m.get(l.lotBatch) ?? 0) + l.quantity);
  return m;
}

/** Thai 13-digit taxpayer ID with its mod-11 check digit. */
export function isValidThaiTaxId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  const sum = [...id.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

// ───────────────────────────── Receivables: open items & aging ─────────────────────────────

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export interface ArOpenItem {
  /** Invoice number, opening-balance document, or "B/F" for an unexplained balance brought forward. */
  ref: string;
  kind: "invoice" | "openingBalance" | "broughtForward";
  /** Sales order behind an invoice. */
  orderNo?: string;
  date: string;
  dueDate: string;
  amount: number;
  /** What is still unpaid after payments are applied (oldest due first). */
  open: number;
}

const DAY = 24 * 60 * 60 * 1000;
export function daysOverdue(dueDate: string, today = todayIso()): number {
  return Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${dueDate}T00:00:00`).getTime()) / DAY);
}

export function agingBucket(dueDate: string, today = todayIso()): AgingBucket {
  const d = daysOverdue(dueDate, today);
  if (d <= 0) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

/**
 * What a customer owes, item by item: opening balances and issued invoices of orders they kept, with
 * payments applied oldest-due-first. The items always add up to the customer's outstanding balance — any
 * difference that the documents don't explain is shown as a balance brought forward, never hidden.
 */
export function computeArOpenItems(
  customer: Pick<Customer, "customerId" | "outstandingBalance">,
  salesOrders: SalesOrder[],
  arDocuments: { type: string; customerId: string; docNo: string; date: string; amount: number; dueDate?: string; appliesTo?: string }[],
): ArOpenItem[] {
  const docs = arDocuments.filter((d) => d.customerId === customer.customerId);
  const items: ArOpenItem[] = [
    ...docs
      .filter((d) => d.type === "openingBalance")
      .map((d): ArOpenItem => ({ ref: d.docNo, kind: "openingBalance", date: d.date, dueDate: d.dueDate ?? d.date, amount: d.amount, open: d.amount })),
    ...salesOrders
      .filter((o) => o.customerId === customer.customerId && isBookedSale(o) && !isReversedSale(o) && o.taxInvoiceNo !== "—")
      .map((o): ArOpenItem => {
        const date = o.invoiceDate ?? o.orderDate;
        return { ref: o.taxInvoiceNo, kind: "invoice", orderNo: o.orderNo, date, dueDate: o.dueDate ?? date, amount: o.netValue, open: o.netValue };
      }),
  ];
  const paid = docs.filter((d) => d.type === "payment").reduce((sum, d) => sum + d.amount, 0);
  const explained = items.reduce((sum, i) => sum + i.amount, 0) - paid;
  const gap = Math.round((customer.outstandingBalance - explained) * 100) / 100;
  if (gap > 0.005) {
    const oldest = items.map((i) => i.date).sort()[0] ?? todayIso();
    items.push({ ref: "B/F", kind: "broughtForward", date: oldest, dueDate: oldest, amount: gap, open: gap });
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.ref.localeCompare(b.ref));
  // A payment made against a particular invoice settles that invoice first; whatever it doesn't need, and
  // every other payment (and any unexplained credit), settles the oldest-due items.
  let credit = gap < -0.005 ? -gap : 0;
  for (const d of docs.filter((x) => x.type === "payment")) {
    const target = d.appliesTo ? items.find((i) => i.orderNo === d.appliesTo) : undefined;
    const applied = target ? Math.min(target.open, d.amount) : 0;
    if (target) target.open = Math.round((target.open - applied) * 100) / 100;
    credit += d.amount - applied;
  }
  for (const item of items) {
    const applied = Math.min(item.open, credit);
    item.open = Math.round((item.open - applied) * 100) / 100;
    credit -= applied;
  }
  return items.filter((i) => i.open > 0.005);
}

/** A customer whose oldest unpaid invoice is further past due than this is on credit hold: new orders need approval. */
export const OVERDUE_HOLD_DAYS = 60;

/** Days past due of the customer's oldest unpaid item (0 when nothing is overdue). */
export function oldestOverdueDays(
  customer: Pick<Customer, "customerId" | "outstandingBalance">,
  salesOrders: SalesOrder[],
  arDocuments: Parameters<typeof computeArOpenItems>[2],
  today = todayIso(),
): number {
  return Math.max(0, ...computeArOpenItems(customer, salesOrders, arDocuments).map((i) => daysOverdue(i.dueDate, today)));
}

/** Open amounts per aging bucket (by days past due). */
export function agingTotals(items: ArOpenItem[], today = todayIso()): Record<AgingBucket, number> {
  const totals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<AgingBucket, number>;
  for (const i of items) totals[agingBucket(i.dueDate, today)] += i.open;
  return totals;
}

export function joinReasons(reasons: Bilingual[]): Bilingual | undefined {
  if (reasons.length === 0) return undefined;
  return { th: reasons.map((r) => r.th).join(" · "), en: reasons.map((r) => r.en).join(" · ") };
}
