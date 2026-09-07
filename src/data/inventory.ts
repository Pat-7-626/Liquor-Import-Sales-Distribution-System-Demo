import type { InventoryItem } from "./types";

export const inventory: InventoryItem[] = [
  { sku: "SKU-1001", productName: "Golden Barrel Single Malt 12Y", lotBatch: "LOT-A2607-01", receivedDate: "2026-07-20", quantityRemaining: 360, ageDays: 43, status: "normal", warehouse: "whA" },
  { sku: "SKU-1002", productName: "Golden Barrel Single Malt 18Y", lotBatch: "LOT-A2604-01", receivedDate: "2026-04-18", quantityRemaining: 84, ageDays: 136, status: "agingStart", warehouse: "whA" },
  { sku: "SKU-1003", productName: "Highland Mist Blended", lotBatch: "LOT-A2605-02", receivedDate: "2026-05-22", quantityRemaining: 1130, ageDays: 102, status: "agingStart", warehouse: "whB" },
  { sku: "SKU-1005", productName: "Chateau Belmont Rouge 2019", lotBatch: "LOT-A2606-02", receivedDate: "2026-06-10", quantityRemaining: 592, ageDays: 83, status: "normal", warehouse: "whB" },
  { sku: "SKU-1006", productName: "Chateau Belmont Blanc 2021", lotBatch: "LOT-A2605-04", receivedDate: "2026-05-05", quantityRemaining: 18, ageDays: 119, status: "agingStart", warehouse: "whB" },
  { sku: "SKU-1007", productName: "Nordic Frost Vodka", lotBatch: "LOT-A2606-01", receivedDate: "2026-06-01", quantityRemaining: 950, ageDays: 92, status: "agingStart", warehouse: "whA" },
  { sku: "SKU-1009", productName: "Sakura Plum Liqueur", lotBatch: "LOT-A2607-03", receivedDate: "2026-07-25", quantityRemaining: 186, ageDays: 38, status: "normal", warehouse: "whA" },
  { sku: "SKU-1010", productName: "Amber Harbor Rum Dark", lotBatch: "LOT-A2607-02", receivedDate: "2026-07-18", quantityRemaining: 55, ageDays: 45, status: "normal", warehouse: "whC" },
  { sku: "SKU-1011", productName: "Golden Barrel Cask Reserve", lotBatch: "LOT-A2601-01", receivedDate: "2026-01-15", quantityRemaining: 12, ageDays: 229, status: "agingLong", warehouse: "whA" },
];
