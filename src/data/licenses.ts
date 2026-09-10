import type { License } from "./types";

export const licenses: License[] = [
  {
    licenseNo: "LIC-IMP-0011",
    type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 1", en: "Import License Type 1" },
    holder: { th: "บริษัท เรา จำกัด", en: "Our Company Co., Ltd." },
    category: "import", issueDate: "2025-01-10", expiryDate: "2026-01-09", daysRemaining: -241, status: "expired",
  },
  {
    licenseNo: "LIC-IMP-0012",
    type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 5", en: "Import License Type 5" },
    holder: { th: "บริษัท เรา จำกัด", en: "Our Company Co., Ltd." },
    category: "import", issueDate: "2025-09-01", expiryDate: "2026-08-31", daysRemaining: -7, status: "expired",
  },
  {
    licenseNo: "LIC-SELL-2201",
    type: { th: "ใบอนุญาตขายส่งสุรา", en: "Liquor Wholesale License" },
    holder: { th: "ตัวแทนจำหน่าย กรุงเทพ ทีเอ็ม", en: "Bangkok TM Distributor" },
    category: "sales", issueDate: "2025-03-01", expiryDate: "2026-09-20", daysRemaining: 13, status: "expiringSoon",
  },
  {
    licenseNo: "LIC-SELL-2202",
    type: { th: "ใบอนุญาตขายปลีกสุรา", en: "Liquor Retail License" },
    holder: { th: "ร้านสุขใจซุปเปอร์มาร์เก็ต", en: "Sukjai Supermarket" },
    category: "sales", issueDate: "2024-10-15", expiryDate: "2026-09-15", daysRemaining: 8, status: "expiringSoon",
  },
  {
    licenseNo: "LIC-SELL-2203",
    type: { th: "ใบอนุญาตขายสุรา (ร้านอาหาร/บาร์)", en: "Liquor License (Restaurant/Bar)" },
    holder: { th: "บาร์ริมเจ้าพระยา", en: "Riverside Chao Phraya Bar" },
    category: "sales", issueDate: "2025-05-01", expiryDate: "2026-11-30", daysRemaining: 84, status: "normal",
  },
  {
    licenseNo: "LIC-SELL-2204",
    type: { th: "ใบอนุญาตขายปลีกสุรา", en: "Liquor Retail License" },
    holder: { th: "มินิมาร์ท 24 ชม. สาขาลาดพร้าว", en: "24hr Minimart - Lat Phrao Branch" },
    category: "sales", issueDate: "2024-08-01", expiryDate: "2025-07-31", daysRemaining: -403, status: "expired",
  },
  {
    licenseNo: "LIC-SELL-2205",
    type: { th: "ใบอนุญาตขายส่งสุรา", en: "Liquor Wholesale License" },
    holder: { th: "ตัวแทนจำหน่าย ภาคเหนือ เชียงใหม่", en: "Northern Distributor - Chiang Mai" },
    category: "sales", issueDate: "2025-06-01", expiryDate: "2027-05-31", daysRemaining: 266, status: "normal",
  },
  {
    licenseNo: "LIC-SELL-2206",
    type: { th: "ใบอนุญาตขายสุรา (ร้านอาหาร/บาร์)", en: "Liquor License (Restaurant/Bar)" },
    holder: { th: "ครัวคุณยาย เรสเทอรองต์", en: "Khrua Khun Yai Restaurant" },
    category: "sales", issueDate: "2025-01-20", expiryDate: "2026-09-05", daysRemaining: -2, status: "expired",
  },
];
