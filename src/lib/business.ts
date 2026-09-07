import type {
  Bilingual,
  ChannelCode,
  CreditStatus,
  ImportOrder,
  ImportOrderLineItem,
  ImportOrderStatus,
  ImportTaxBreakdown,
  InventoryItem,
  InventoryStatus,
  LicenseStatus,
  Product,
  ProductStatus,
  SalesOrder,
} from "../data/types";

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

/** FR-04: SKU must match the Product Master, ABV in 0-75%, price within 30% of the reference cost price. */
export function validateImportLine(line: { sku: string; abv: number; unitPrice: number }, products: Product[]): LineValidation {
  const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
  const filled = line.sku.trim() !== "";
  const skuOk = !filled || Boolean(product);
  const abvOk = line.abv >= 0 && line.abv <= 75;
  const priceOk = !product || Math.abs(line.unitPrice - product.costPrice) / product.costPrice <= PRICE_DEVIATION_TOLERANCE;
  return { filled, skuOk, abvOk, priceOk };
}

/** FR-04/05: messages for whichever lines fail validation, in both languages, for display or an audit note. */
export function describeLineIssues(lines: ImportOrderLineItem[], products: Product[]): Bilingual[] {
  const msgs: Bilingual[] = [];
  for (const line of lines) {
    const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
    const { filled, skuOk, abvOk, priceOk } = validateImportLine(line, products);
    if (!filled) continue;
    if (!skuOk) msgs.push({ th: `${line.sku}: ไม่ตรงกับ Product Master`, en: `${line.sku}: not in Product Master` });
    if (!abvOk) msgs.push({ th: `${line.sku}: ABV ${line.abv}% นอกช่วง 0–75%`, en: `${line.sku}: ABV ${line.abv}% outside 0–75%` });
    if (product && !priceOk)
      msgs.push({ th: `${line.sku}: ราคาต่างจาก฿${product.costPrice} เกิน 30%`, en: `${line.sku}: price deviates from ฿${product.costPrice} by over 30%` });
  }
  return msgs;
}

/** FR-10: illustrative duty rate by HS Code prefix — not real Thai tariff schedule, for demo purposes. */
const DUTY_RATE_BY_HS_PREFIX: Record<string, number> = {
  "2208.3": 30, // whisky
  "2208.9": 30, // tequila
  "2204.2": 60, // wine
  "2208.6": 30, // vodka
  "2208.5": 30, // gin
  "2208.7": 30, // liqueur
  "2208.4": 30, // rum
  "2203.0": 20, // beer
};
const DEFAULT_DUTY_RATE = 30;
const EXCISE_THB_PER_ABV_PERCENT_PER_LITER = 6;
const VAT_RATE = 0.07;

/** FR-10/11: Excise Tax, Import Duty, VAT, and stamp count from ABV + quantity + HS Code (illustrative demo formula). */
export function computeImportTax(lines: ImportOrderLineItem[], products: Product[]): ImportTaxBreakdown {
  let importDuty = 0;
  let exciseTax = 0;
  let exciseStampCount = 0;
  let dutyRateSample = DEFAULT_DUTY_RATE;

  for (const line of lines) {
    const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
    const hsPrefix = product?.hsCode.slice(0, 6) ?? "";
    const dutyRate = DUTY_RATE_BY_HS_PREFIX[hsPrefix] ?? DEFAULT_DUTY_RATE;
    dutyRateSample = dutyRate;

    const lineValue = line.qty * line.unitPrice;
    importDuty += lineValue * (dutyRate / 100);

    const litersPerUnit = (product?.packageSize ?? 700) / 1000;
    exciseTax += line.abv * EXCISE_THB_PER_ABV_PERCENT_PER_LITER * litersPerUnit * line.qty;

    exciseStampCount += line.qty;
  }

  const lineValueTotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const vat = (lineValueTotal + importDuty + exciseTax) * VAT_RATE;

  return {
    dutyRatePercent: dutyRateSample,
    importDuty: Math.round(importDuty),
    exciseTax: Math.round(exciseTax),
    vat: Math.round(vat),
    totalTax: Math.round(importDuty + exciseTax + vat),
    exciseStampCount,
  };
}

/** FR-26: illustrative per-channel price adjustment applied to a product's suggested price. */
export const CHANNEL_PRICE_MODIFIER: Record<ChannelCode, number> = {
  distributor: -0.1,
  retailWholesale: 0,
  restaurantBar: 0.05,
  online: 0.08,
};

export function computeChannelPrice(suggestedPrice: number, channel: ChannelCode): number {
  return Math.round(suggestedPrice * (1 + CHANNEL_PRICE_MODIFIER[channel]));
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

/** FR-12: derives an explicit Customs Clearance Status from the order's stage in the workflow. */
export function computeCustomsClearanceStatus(status: ImportOrderStatus): "pending" | "cleared" {
  return status === "customsCleared" || status === "receivedWarehouse" ? "cleared" : "pending";
}

/**
 * BR-09: inventory value by *pipeline* status (In Transit / Customs Clearance vs. Available for Sale) —
 * distinct from the aging-based "Inventory Value by Status" breakdown, which answers a different question.
 */
const PIPELINE_ACTIVE_STATUSES = new Set<ImportOrderStatus>(["staging", "pendingApproval", "approved", "customsCleared", "issueDetected"]);

export function computeInTransitValue(importOrders: ImportOrder[]): number {
  return importOrders.filter((o) => PIPELINE_ACTIVE_STATUSES.has(o.status)).reduce((sum, o) => sum + o.totalValue, 0);
}

export function computeAvailableForSaleValue(inventory: InventoryItem[], products: Product[]): number {
  return inventory.reduce((sum, i) => {
    const product = products.find((p) => p.sku === i.sku);
    return sum + i.quantityRemaining * (product?.costPrice ?? 0);
  }, 0);
}
