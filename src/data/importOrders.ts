import type { CountryCode, ImportLogistics, ImportOrderLineItem } from "./types";

/**
 * The 8 import orders from the source spreadsheet, as the demo history places them: the first orders raised
 * after the system went live, in their own number order, each taking the spreadsheet's days from order to
 * arrival. The sheet gave only a total per order; the lines were reconstructed to match it at cost price, and
 * the history converts them to what the supplier charges (cost less duty and excise) in the supplier's currency.
 * The sheet left some orders in early stages with arrival dates already past; in the history they run their
 * course, and the current stages are shown by the orders placed after them.
 */
export interface SourceImportOrder {
  orderNo: string;
  supplierId: string;
  country: CountryCode;
  incoterms: string;
  /** Days from order to estimated arrival, as on the sheet. */
  leadDays: number;
  /** Line prices at cost price (baht), as reconstructed. */
  lines: ImportOrderLineItem[];
  logistics: Omit<ImportLogistics, "currency">;
  /** Customs declaration number, where the sheet had one. */
  declarationNo?: string;
  /** Which supervisor approved it, where the sheet says. */
  approver?: "somchai" | "piyada";
}

export const sourceImportOrders: SourceImportOrder[] = [
  {
    orderNo: "IMP-2026-0142", supplierId: "SUP-001", country: "scotland", incoterms: "CIF", leadDays: 39,
    lines: [
      { sku: "SKU-1001", abv: 43, qty: 200, unitPrice: 1850 },
      { sku: "SKU-1002", abv: 43, qty: 60, unitPrice: 4200 },
      { sku: "SKU-1003", abv: 40, qty: 300, unitPrice: 780 },
      { sku: "SKU-1011", abv: 46, qty: 127, unitPrice: 3102.36 },
    ],
    logistics: { manufacturerRegNo: "UK-DIST-2201", blAwbNumber: "MAEU-8810234", origin: "Glasgow, Scotland", destination: "Bangkok Port, Thailand", paymentTerms: "L/C at sight" },
  },
  {
    orderNo: "IMP-2026-0143", supplierId: "SUP-002", country: "mexico", incoterms: "FOB", leadDays: 41,
    lines: [
      { sku: "SKU-1004", abv: 38, qty: 300, unitPrice: 990 },
      { sku: "SKU-1004", abv: 38, qty: 185, unitPrice: 989.19 },
    ],
    logistics: { manufacturerRegNo: "MX-TEQ-0587", blAwbNumber: "OOLU-1194432", origin: "Jalisco, Mexico", destination: "Laem Chabang Port, Thailand", paymentTerms: "T/T 30 days" },
  },
  {
    orderNo: "IMP-2026-0144", supplierId: "SUP-003", country: "france", incoterms: "CIF", leadDays: 43, approver: "somchai",
    lines: [
      { sku: "SKU-1005", abv: 13.5, qty: 300, unitPrice: 650 },
      { sku: "SKU-1005", abv: 13.5, qty: 200, unitPrice: 650 },
      { sku: "SKU-1006", abv: 12.5, qty: 476, unitPrice: 619.75 },
    ],
    logistics: { manufacturerRegNo: "FR-WIN-3390", blAwbNumber: "CMAU-5567810", origin: "Bordeaux, France", destination: "Bangkok Port, Thailand", paymentTerms: "L/C at sight" },
  },
  {
    orderNo: "IMP-2026-0145", supplierId: "SUP-004", country: "sweden", incoterms: "FOB", leadDays: 35, approver: "somchai", declarationNo: "105-2026-0891",
    lines: [{ sku: "SKU-1007", abv: 40, qty: 596, unitPrice: 520.13 }],
    logistics: { manufacturerRegNo: "SE-VOD-0093", blAwbNumber: "MSCU-7743200", origin: "Stockholm, Sweden", destination: "Bangkok Port, Thailand", paymentTerms: "T/T 30 days" },
  },
  {
    orderNo: "IMP-2026-0146", supplierId: "SUP-005", country: "uk", incoterms: "CIF", leadDays: 35, approver: "somchai", declarationNo: "105-2026-0754",
    lines: [
      { sku: "SKU-1008", abv: 42, qty: 250, unitPrice: 610 },
      { sku: "SKU-1008", abv: 42, qty: 201, unitPrice: 609.45 },
    ],
    logistics: { manufacturerRegNo: "UK-GIN-4471", blAwbNumber: "HLCU-2205561", origin: "London, United Kingdom", destination: "Bangkok Port, Thailand", paymentTerms: "T/T 45 days" },
  },
  {
    orderNo: "IMP-2026-0147", supplierId: "SUP-006", country: "jamaica", incoterms: "FOB", leadDays: 34, approver: "piyada", declarationNo: "105-2026-0622",
    lines: [{ sku: "SKU-1010", abv: 40, qty: 339, unitPrice: 560.47 }],
    logistics: { manufacturerRegNo: "JM-RUM-1182", blAwbNumber: "OOLU-9284712", origin: "Kingston, Jamaica", destination: "Laem Chabang Port, Thailand", paymentTerms: "T/T 30 days" },
  },
  {
    orderNo: "IMP-2026-0148", supplierId: "SUP-001", country: "scotland", incoterms: "CIF", leadDays: 36, approver: "piyada", declarationNo: "105-2026-0499",
    lines: [
      { sku: "SKU-1002", abv: 43, qty: 150, unitPrice: 4200 },
      { sku: "SKU-1003", abv: 40, qty: 333, unitPrice: 780.78 },
    ],
    logistics: { manufacturerRegNo: "UK-DIST-2201", blAwbNumber: "MAEU-8810199", origin: "Glasgow, Scotland", destination: "Bangkok Port, Thailand", paymentTerms: "L/C at sight" },
  },
  // The ABV recorded on the sheet (85%) is the bad data behind its "Issue Detected" status: SKU-1009 is really
  // 15%. In the history the order officer corrects it the next day and the order goes on.
  {
    orderNo: "IMP-2026-0149", supplierId: "SUP-007", country: "japan", incoterms: "CIF", leadDays: 41,
    lines: [{ sku: "SKU-1009", abv: 85, qty: 382, unitPrice: 379.58 }],
    logistics: { manufacturerRegNo: "JP-LIQ-0021", blAwbNumber: "NYKS-3321087", origin: "Osaka, Japan", destination: "Bangkok Port, Thailand", paymentTerms: "T/T 30 days" },
  },
];
