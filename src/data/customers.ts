import type { Customer } from "./types";

/*
 * Names, channels, licenses, credit figures: from the source spreadsheet.
 * Tax IDs (valid-checksum, fictional), addresses, branches, and credit terms: illustrative — the
 * spreadsheet has none, but a Thai tax invoice can't be issued without them (Revenue Code §86/4).
 */
export const customers: Customer[] = [
  {
    customerId: "CUS-0001",
    name: { th: "ตัวแทนจำหน่าย กรุงเทพ ทีเอ็ม", en: "Bangkok TM Distributor" },
    taxId: "0105558012349", branch: "00000", creditTermDays: 60,
    address: { th: "88/12 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310", en: "88/12 Rama 9 Rd, Huai Khwang, Bangkok 10310" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2201", licenseExpiry: "2026-09-20",
    creditLimit: 2000000, outstandingBalance: 1450000, creditRemaining: 550000,
    standardDiscount: 8, creditStatus: "normal",
  },
  {
    customerId: "CUS-0002",
    name: { th: "ร้านสุขใจซุปเปอร์มาร์เก็ต", en: "Sukjai Supermarket" },
    taxId: "0105559022119", branch: "00002", creditTermDays: 30,
    address: { th: "145 ถนนลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900", en: "145 Lat Phrao Rd, Chom Phon, Chatuchak, Bangkok 10900" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2202", licenseExpiry: "2026-09-15",
    creditLimit: 500000, outstandingBalance: 480000, creditRemaining: 20000,
    standardDiscount: 5, creditStatus: "nearLimit",
  },
  {
    customerId: "CUS-0003",
    name: { th: "บาร์ริมเจ้าพระยา", en: "Riverside Chao Phraya Bar" },
    taxId: "0105560033170", branch: "00000", creditTermDays: 30,
    address: { th: "9 ซอยเจริญกรุง 30 แขวงสี่พระยา เขตบางรัก กรุงเทพฯ 10500", en: "9 Soi Charoen Krung 30, Si Phraya, Bang Rak, Bangkok 10500" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2203", licenseExpiry: "2026-11-30",
    creditLimit: 300000, outstandingBalance: 90000, creditRemaining: 210000,
    standardDiscount: 10, creditStatus: "normal",
  },
  {
    customerId: "CUS-0004",
    name: { th: "มินิมาร์ท 24 ชม. สาขาลาดพร้าว", en: "24hr Minimart - Lat Phrao Branch" },
    taxId: "0105557044204", branch: "00014", creditTermDays: 30,
    address: { th: "512 ถนนลาดพร้าว แขวงวังทองหลาง เขตวังทองหลาง กรุงเทพฯ 10310", en: "512 Lat Phrao Rd, Wang Thonglang, Bangkok 10310" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2204", licenseExpiry: "2025-07-31",
    creditLimit: 150000, outstandingBalance: 40000, creditRemaining: 110000,
    standardDiscount: 5, creditStatus: "normal",
  },
  {
    customerId: "CUS-0005",
    name: { th: "ตัวแทนจำหน่าย ภาคเหนือ เชียงใหม่", en: "Northern Distributor - Chiang Mai" },
    taxId: "0555561055131", branch: "00000", creditTermDays: 60,
    address: { th: "77 ถนนช้างคลาน ตำบลช้างคลาน อำเภอเมือง เชียงใหม่ 50100", en: "77 Chang Khlan Rd, Mueang, Chiang Mai 50100" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2205", licenseExpiry: "2027-05-31",
    creditLimit: 1800000, outstandingBalance: 320000, creditRemaining: 1480000,
    standardDiscount: 8, creditStatus: "normal",
  },
  {
    customerId: "CUS-0006",
    name: { th: "ครัวคุณยาย เรสเทอรองต์", en: "Khrua Khun Yai Restaurant" },
    taxId: "0105562066148", branch: "00000", creditTermDays: 30,
    address: { th: "23 ถนนสุขุมวิท 49 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110", en: "23 Sukhumvit 49, Khlong Tan Nuea, Watthana, Bangkok 10110" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2206", licenseExpiry: "2026-09-05",
    creditLimit: 250000, outstandingBalance: 260000, creditRemaining: -10000,
    standardDiscount: 10, creditStatus: "overLimit",
  },
  {
    customerId: "CUS-0007",
    name: { th: "ร้านค้าออนไลน์ DrinkHub", en: "DrinkHub Online Store" },
    taxId: "0105563077151", branch: "00000", creditTermDays: 15,
    address: { th: "1000/5 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900", en: "1000/5 Vibhavadi Rangsit Rd, Chom Phon, Chatuchak, Bangkok 10900" },
    channelType: "online",
    licenseNo: null, licenseExpiry: null,
    creditLimit: 400000, outstandingBalance: 55000, creditRemaining: 345000,
    standardDiscount: 6, creditStatus: "noLicense",
  },
];
