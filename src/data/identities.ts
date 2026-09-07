import type { Identity } from "./types";

/**
 * NFR-03: who is "signed in" right now — drives RBAC gating and audit attribution.
 * Every entry is "Fictional Name (Role Title)" — consistent format across all nine, so the switcher
 * doesn't mix real-looking names for some roles with a bare role label + "(Demo)" for others.
 */
export const IDENTITIES: Identity[] = [
  { key: "manager", role: "seniorManager", name: { th: "อรุณี ทรัพย์เจริญ (ผู้บริหาร)", en: "Arunee Sapcharoen (Senior Manager)" } },
  { key: "orderOfficer", role: "orderOfficer", name: { th: "ธนกร ศรีวิไล (เจ้าหน้าที่สั่งซื้อ)", en: "Thanakorn Sriwilai (Order Officer)" } },
  { key: "docOfficer", role: "documentationOfficer", name: { th: "นภัสสร บุญมี (เจ้าหน้าที่เอกสาร)", en: "Napassorn Boonmee (Documentation Officer)" } },
  { key: "whOfficer", role: "warehouseOfficer", name: { th: "สมศักดิ์ ชัยศิริ (เจ้าหน้าที่คลังสินค้า)", en: "Somsak Chaisiri (Warehouse Officer)" } },
  { key: "taxOfficer", role: "taxOfficer", name: { th: "พิมพ์ชนก รัตนกุล (เจ้าหน้าที่ภาษี)", en: "Pimchanok Rattanakul (Tax Officer)" } },
  { key: "salesOfficer", role: "salesOfficer", name: { th: "ชญานันท์ สุขสวัสดิ์ (พนักงานขาย)", en: "Chayanan Suksawat (Sales Officer)" } },
  { key: "distOfficer", role: "distributionOfficer", name: { th: "วิชัย ทองดี (เจ้าหน้าที่กระจายสินค้า)", en: "Wichai Thongdee (Distribution Officer)" } },
  { key: "somchai", role: "supervisor", name: { th: "สมชาย วิริยะ (หัวหน้างาน)", en: "Somchai Wiriya (Supervisor)" } },
  { key: "piyada", role: "supervisor", name: { th: "ปิยะดา ศรีสุข (หัวหน้างาน)", en: "Piyada Srisuk (Supervisor)" } },
];

/** NFR-03: roles allowed to see Price / Credit / Discount figures unmasked. */
export const SENSITIVE_DATA_ROLES = new Set(["seniorManager", "salesOfficer", "taxOfficer", "orderOfficer", "supervisor"]);
