import type { ImportOrder, ImportOrderLineItem, ImportLogistics } from "./types";
import { products } from "./products";
import { computeImportTax } from "../lib/business";

const somchai = { th: "สมชาย วิริยะ (หัวหน้างาน)", en: "Somchai Wiriya (Supervisor)" };
const piyada = { th: "ปิยะดา ศรีสุข (หัวหน้างาน)", en: "Piyada Srisuk (Supervisor)" };

/**
 * Line-item detail for the 8 orders from the original spreadsheet, which only gave an aggregate
 * SKU count + total value (no per-line breakdown). Quantities/prices below are reconstructed to
 * match that original `totalValue` as closely as possible — the stored `totalValue` field itself
 * is left untouched as the source of truth from the spreadsheet.
 */
const lineSets: Record<string, ImportOrderLineItem[]> = {
  "IMP-2026-0142": [
    { sku: "SKU-1001", abv: 43, qty: 200, unitPrice: 1850 },
    { sku: "SKU-1002", abv: 43, qty: 60, unitPrice: 4200 },
    { sku: "SKU-1003", abv: 40, qty: 300, unitPrice: 780 },
    { sku: "SKU-1011", abv: 46, qty: 127, unitPrice: 3102.36 },
  ],
  "IMP-2026-0143": [
    { sku: "SKU-1004", abv: 38, qty: 300, unitPrice: 990 },
    { sku: "SKU-1004", abv: 38, qty: 185, unitPrice: 989.19 },
  ],
  "IMP-2026-0144": [
    { sku: "SKU-1005", abv: 13.5, qty: 300, unitPrice: 650 },
    { sku: "SKU-1005", abv: 13.5, qty: 200, unitPrice: 650 },
    { sku: "SKU-1006", abv: 12.5, qty: 476, unitPrice: 619.75 },
  ],
  "IMP-2026-0145": [{ sku: "SKU-1007", abv: 40, qty: 596, unitPrice: 520.13 }],
  "IMP-2026-0146": [
    { sku: "SKU-1008", abv: 42, qty: 250, unitPrice: 610 },
    { sku: "SKU-1008", abv: 42, qty: 201, unitPrice: 609.45 },
  ],
  "IMP-2026-0147": [{ sku: "SKU-1010", abv: 40, qty: 339, unitPrice: 560.47 }],
  "IMP-2026-0148": [
    { sku: "SKU-1002", abv: 43, qty: 150, unitPrice: 4200 },
    { sku: "SKU-1003", abv: 40, qty: 333, unitPrice: 780.78 },
  ],
  // Note: ABV recorded here (85%) is the actual bad data that triggered this order's "Issue Detected"
  // status — SKU-1009 is really 15% ABV, so this deliberately mismatches the Product Master (FR-04).
  "IMP-2026-0149": [{ sku: "SKU-1009", abv: 85, qty: 382, unitPrice: 379.58 }],
};

const logisticsSets: Record<string, ImportLogistics> = {
  "IMP-2026-0142": { manufacturerRegNo: "UK-DIST-2201", blAwbNumber: "MAEU-8810234", origin: "Glasgow, Scotland", destination: "Bangkok Port, Thailand", currency: "GBP", paymentTerms: "L/C at sight" },
  "IMP-2026-0143": { manufacturerRegNo: "MX-TEQ-0587", blAwbNumber: "OOLU-1194432", origin: "Jalisco, Mexico", destination: "Laem Chabang Port, Thailand", currency: "USD", paymentTerms: "T/T 30 days" },
  "IMP-2026-0144": { manufacturerRegNo: "FR-WIN-3390", blAwbNumber: "CMAU-5567810", origin: "Bordeaux, France", destination: "Bangkok Port, Thailand", currency: "EUR", paymentTerms: "L/C at sight" },
  "IMP-2026-0145": { manufacturerRegNo: "SE-VOD-0093", blAwbNumber: "MSCU-7743200", origin: "Stockholm, Sweden", destination: "Bangkok Port, Thailand", currency: "EUR", paymentTerms: "T/T 30 days" },
  "IMP-2026-0146": { manufacturerRegNo: "UK-GIN-4471", blAwbNumber: "HLCU-2205561", origin: "London, United Kingdom", destination: "Bangkok Port, Thailand", currency: "GBP", paymentTerms: "T/T 45 days" },
  "IMP-2026-0147": { manufacturerRegNo: "JM-RUM-1182", blAwbNumber: "OOLU-9284712", origin: "Kingston, Jamaica", destination: "Laem Chabang Port, Thailand", currency: "USD", paymentTerms: "T/T 30 days" },
  "IMP-2026-0148": { manufacturerRegNo: "UK-DIST-2201", blAwbNumber: "MAEU-8810199", origin: "Glasgow, Scotland", destination: "Bangkok Port, Thailand", currency: "GBP", paymentTerms: "L/C at sight" },
  "IMP-2026-0149": { manufacturerRegNo: "JP-LIQ-0021", blAwbNumber: "NYKS-3321087", origin: "Osaka, Japan", destination: "Bangkok Port, Thailand", currency: "JPY", paymentTerms: "T/T 30 days" },
};

function withDetail(order: Omit<ImportOrder, "lineItems" | "logistics" | "tax">): ImportOrder {
  const lineItems = lineSets[order.orderNo];
  const logistics = logisticsSets[order.orderNo];
  const tax = computeImportTax(lineItems, products);
  return { ...order, lineItems, logistics, tax };
}

export const importOrders: ImportOrder[] = [
  withDetail({ orderNo: "IMP-2026-0142", supplier: "Highland Spirits Co., Ltd.", country: "scotland", incoterms: "CIF", orderDate: "2026-07-02", etaDate: "2026-08-10", skuCount: 4, totalValue: 1250000, status: "staging", approver: null, customsDeclarationNo: null }),
  withDetail({ orderNo: "IMP-2026-0143", supplier: "Casa Roble Distillery", country: "mexico", incoterms: "FOB", orderDate: "2026-07-05", etaDate: "2026-08-15", skuCount: 2, totalValue: 480000, status: "pendingApproval", approver: null, customsDeclarationNo: null }),
  withDetail({ orderNo: "IMP-2026-0144", supplier: "Chateau Belmont Vineyards", country: "france", incoterms: "CIF", orderDate: "2026-07-08", etaDate: "2026-08-20", skuCount: 3, totalValue: 620000, status: "approved", approver: somchai, customsDeclarationNo: null }),
  withDetail({ orderNo: "IMP-2026-0145", supplier: "Nordic Frost Distillers", country: "sweden", incoterms: "FOB", orderDate: "2026-06-20", etaDate: "2026-07-25", skuCount: 1, totalValue: 310000, status: "customsCleared", approver: somchai, customsDeclarationNo: "105-2026-0891" }),
  withDetail({ orderNo: "IMP-2026-0146", supplier: "Blue Coral Distillers", country: "uk", incoterms: "CIF", orderDate: "2026-06-10", etaDate: "2026-07-15", skuCount: 2, totalValue: 275000, status: "receivedWarehouse", approver: somchai, customsDeclarationNo: "105-2026-0754" }),
  withDetail({ orderNo: "IMP-2026-0147", supplier: "Amber Harbor Rum Co.", country: "jamaica", incoterms: "FOB", orderDate: "2026-06-01", etaDate: "2026-07-05", skuCount: 1, totalValue: 190000, status: "receivedWarehouse", approver: piyada, customsDeclarationNo: "105-2026-0622" }),
  withDetail({ orderNo: "IMP-2026-0148", supplier: "Highland Spirits Co., Ltd.", country: "scotland", incoterms: "CIF", orderDate: "2026-05-15", etaDate: "2026-06-20", skuCount: 2, totalValue: 890000, status: "receivedWarehouse", approver: piyada, customsDeclarationNo: "105-2026-0499" }),
  withDetail({ orderNo: "IMP-2026-0149", supplier: "Sakura Distillery Japan", country: "japan", incoterms: "CIF", orderDate: "2026-07-15", etaDate: "2026-08-25", skuCount: 1, totalValue: 145000, status: "issueDetected", approver: null, customsDeclarationNo: null, note: { th: "ABV ไม่ตรงกับ Product Master", en: "ABV mismatch vs. Product Master" } }),
];
