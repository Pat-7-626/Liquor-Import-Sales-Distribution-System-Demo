import type { ReorderPolicy } from "./types";

/**
 * Illustrative reorder points — not in the source spreadsheet. Each covers about a shipment's lead time of sales
 * plus a safety margin, and orders about two months' worth. Preferred suppliers follow who makes each product.
 */
export const reorderPolicies: ReorderPolicy[] = [
  { sku: "SKU-1001", reorderPoint: 330, reorderQty: 360, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1002", reorderPoint: 64, reorderQty: 72, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1003", reorderPoint: 840, reorderQty: 960, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1004", reorderPoint: 144, reorderQty: 168, preferredSupplierId: "SUP-002" },
  { sku: "SKU-1005", reorderPoint: 330, reorderQty: 360, preferredSupplierId: "SUP-003" },
  { sku: "SKU-1006", reorderPoint: 126, reorderQty: 144, preferredSupplierId: "SUP-003" },
  { sku: "SKU-1007", reorderPoint: 816, reorderQty: 900, preferredSupplierId: "SUP-004" },
  { sku: "SKU-1008", reorderPoint: 210, reorderQty: 240, preferredSupplierId: "SUP-005" },
  { sku: "SKU-1009", reorderPoint: 48, reorderQty: 72, preferredSupplierId: "SUP-007" },
  { sku: "SKU-1010", reorderPoint: 450, reorderQty: 480, preferredSupplierId: "SUP-006" },
  { sku: "SKU-1011", reorderPoint: 36, reorderQty: 48, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1012", reorderPoint: 600, reorderQty: 660, preferredSupplierId: "SUP-011" },
  { sku: "SKU-1013", reorderPoint: 190, reorderQty: 216, preferredSupplierId: "SUP-008" },
  { sku: "SKU-1014", reorderPoint: 48, reorderQty: 60, preferredSupplierId: "SUP-008" },
  { sku: "SKU-1015", reorderPoint: 160, reorderQty: 168, preferredSupplierId: "SUP-009" },
  { sku: "SKU-1016", reorderPoint: 90, reorderQty: 108, preferredSupplierId: "SUP-009" },
  { sku: "SKU-1017", reorderPoint: 250, reorderQty: 240, preferredSupplierId: "SUP-010" },
  { sku: "SKU-1018", reorderPoint: 160, reorderQty: 156, preferredSupplierId: "SUP-010" },
  { sku: "SKU-1019", reorderPoint: 380, reorderQty: 432, preferredSupplierId: "SUP-001" },
  { sku: "SKU-1020", reorderPoint: 54, reorderQty: 60, preferredSupplierId: "SUP-005" },
  { sku: "SKU-1021", reorderPoint: 400, reorderQty: 444, preferredSupplierId: "SUP-004" },
  { sku: "SKU-1022", reorderPoint: 48, reorderQty: 84, preferredSupplierId: "SUP-007" },
  { sku: "SKU-1023", reorderPoint: 150, reorderQty: 168, preferredSupplierId: "SUP-002" },
  { sku: "SKU-1024", reorderPoint: 230, reorderQty: 240, preferredSupplierId: "SUP-006" },
];
