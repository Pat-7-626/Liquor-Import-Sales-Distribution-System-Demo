import type { ReorderPolicy } from "./types";

/** Illustrative reorder points — not in the source spreadsheet. Preferred suppliers follow past import orders. */
export const reorderPolicies: ReorderPolicy[] = [
  { sku: "SKU-1001", reorderPoint: 150, reorderQty: 300, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1002", reorderPoint: 100, reorderQty: 120, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1003", reorderPoint: 300, reorderQty: 600, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1004", reorderPoint: 120, reorderQty: 200, preferredSupplierId: "SUP-002" },
  { sku: "SKU-1005", reorderPoint: 200, reorderQty: 300, preferredSupplierId: "SUP-003" },
  { sku: "SKU-1006", reorderPoint: 60, reorderQty: 200, preferredSupplierId: "SUP-003" },
  { sku: "SKU-1007", reorderPoint: 300, reorderQty: 400, preferredSupplierId: "SUP-004" },
  { sku: "SKU-1008", reorderPoint: 100, reorderQty: 300, preferredSupplierId: "SUP-005" },
  { sku: "SKU-1009", reorderPoint: 80, reorderQty: 200, preferredSupplierId: "SUP-007" },
  { sku: "SKU-1010", reorderPoint: 100, reorderQty: 300, preferredSupplierId: "SUP-006" },
  { sku: "SKU-1011", reorderPoint: 24, reorderQty: 60, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1012", reorderPoint: 120, reorderQty: 240, preferredSupplierId: null },
];
