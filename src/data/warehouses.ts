import type { Warehouse } from "./types";

/** Names match the original lookup; capacity and address are illustrative. */
export const warehouses: Warehouse[] = [
  { code: "whA", name: { th: "คลัง A - กรุงเทพ", en: "Warehouse A - Bangkok" }, address: "Bang Na, Bangkok", capacity: 6000, bonded: true, active: true },
  { code: "whB", name: { th: "คลัง B - ชลบุรี", en: "Warehouse B - Chonburi" }, address: "Laem Chabang, Chonburi", capacity: 4000, bonded: true, active: true },
  { code: "whC", name: { th: "คลัง C - เชียงใหม่", en: "Warehouse C - Chiang Mai" }, address: "Mueang, Chiang Mai", capacity: 1500, bonded: false, active: true },
];
