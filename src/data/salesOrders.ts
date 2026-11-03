import type { DeliveryStatus } from "./types";

/**
 * The 8 sales orders from the source spreadsheet, as the demo history places them: the first sales booked after
 * the system went live (so they keep their numbers SO-2026-3301…3308, tax invoices INV-2026-8801… and delivery
 * notes DN-2026-6601…), two days apart as on the sheet. Lots are picked oldest first from the stock on hand then.
 *
 * Adjusted from the sheet where the app's own rules would refuse it:
 * - SO-2026-3307 was for DrinkHub, which has no liquor license on file — no order can be booked for it. It is
 *   kept as Riverside Chao Phraya Bar's order (same goods, price and outcome).
 * - Orders the sheet left "in delivery" or "pending shipment" months ago were delivered.
 */
export interface SourceSalesOrder {
  orderNo: string;
  customerId: string;
  lines: { sku: string; quantity: number; unitPrice: number; discountPercent: number }[];
  outcome: Extract<DeliveryStatus, "delivered" | "returned" | "damaged">;
  /** Days late against the promised date (the sheet's one late delivery). */
  lateDays?: number;
  /** Who approved it, where the sheet says a supervisor did. */
  approver?: "somchai" | "piyada";
  /** Accepted from a quotation. */
  fromQuotation?: boolean;
}

export const sourceSalesOrders: SourceSalesOrder[] = [
  { orderNo: "SO-2026-3301", customerId: "CUS-0001", lines: [{ sku: "SKU-1001", quantity: 60, unitPrice: 2490, discountPercent: 5 }], outcome: "delivered" },
  { orderNo: "SO-2026-3302", customerId: "CUS-0002", lines: [{ sku: "SKU-1003", quantity: 120, unitPrice: 1090, discountPercent: 3 }], outcome: "delivered", lateDays: 2 },
  { orderNo: "SO-2026-3303", customerId: "CUS-0003", lines: [{ sku: "SKU-1007", quantity: 30, unitPrice: 790, discountPercent: 12 }], outcome: "delivered", approver: "somchai" },
  { orderNo: "SO-2026-3304", customerId: "CUS-0004", lines: [{ sku: "SKU-1009", quantity: 24, unitPrice: 590, discountPercent: 5 }], outcome: "delivered" },
  { orderNo: "SO-2026-3305", customerId: "CUS-0005", lines: [{ sku: "SKU-1002", quantity: 12, unitPrice: 5990, discountPercent: 8 }], outcome: "delivered", fromQuotation: true },
  { orderNo: "SO-2026-3306", customerId: "CUS-0006", lines: [{ sku: "SKU-1005", quantity: 48, unitPrice: 950, discountPercent: 15 }], outcome: "delivered", approver: "piyada" },
  { orderNo: "SO-2026-3307", customerId: "CUS-0003", lines: [{ sku: "SKU-1010", quantity: 20, unitPrice: 820, discountPercent: 6 }], outcome: "returned" },
  { orderNo: "SO-2026-3308", customerId: "CUS-0002", lines: [{ sku: "SKU-1006", quantity: 18, unitPrice: 890, discountPercent: 5 }], outcome: "damaged" },
];
