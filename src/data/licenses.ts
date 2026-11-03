import type { License } from "./types";

/** The day the license dates below were written as of. The seed moves every date by the days since, so the
 * demo always tells the same story: two customer licenses about to expire, two lapsed, import licenses in force. */
export const LICENSE_DATA_AS_OF = "2026-09-07";

const holderUs = { th: "บริษัท เรา จำกัด", en: "Our Company Co., Ltd." };
const wholesale = { th: "ใบอนุญาตขายส่งสุรา", en: "Liquor Wholesale License" };
const retail = { th: "ใบอนุญาตขายปลีกสุรา", en: "Liquor Retail License" };
const onPremise = { th: "ใบอนุญาตขายสุรา (ร้านอาหาร/บาร์)", en: "Liquor License (Restaurant/Bar)" };

type Seed = Omit<License, "daysRemaining" | "status">;
const sales = (licenseNo: string, type: License["type"], holder: License["holder"], issueDate: string, expiryDate: string): Seed => ({
  licenseNo,
  type,
  holder,
  category: "sales",
  issueDate,
  expiryDate,
});

/*
 * LIC-IMP-0011/0012 and LIC-SELL-2201…2206 are from the source spreadsheet (LIC-SELL-2204's dates adjusted —
 * see the customer). LIC-IMP-0013 is the Type 1 license the company has imported under since it lapsed, and
 * the rest belong to the illustrative customers.
 */
export const licenses: Seed[] = [
  { licenseNo: "LIC-IMP-0011", type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 1", en: "Import License Type 1" }, holder: holderUs, category: "import", issueDate: "2025-01-10", expiryDate: "2026-01-09" },
  { licenseNo: "LIC-IMP-0012", type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 5", en: "Import License Type 5" }, holder: holderUs, category: "import", issueDate: "2025-09-01", expiryDate: "2026-08-31" },
  { licenseNo: "LIC-IMP-0013", type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 1", en: "Import License Type 1" }, holder: holderUs, category: "import", issueDate: "2026-01-05", expiryDate: "2027-01-04" },
  sales("LIC-SELL-2201", wholesale, { th: "ตัวแทนจำหน่าย กรุงเทพ ทีเอ็ม", en: "Bangkok TM Distributor" }, "2025-03-01", "2026-09-20"),
  sales("LIC-SELL-2202", retail, { th: "ร้านสุขใจซุปเปอร์มาร์เก็ต", en: "Sukjai Supermarket" }, "2024-10-15", "2026-09-15"),
  sales("LIC-SELL-2203", onPremise, { th: "บาร์ริมเจ้าพระยา", en: "Riverside Chao Phraya Bar" }, "2025-05-01", "2026-11-30"),
  sales("LIC-SELL-2204", retail, { th: "มินิมาร์ท 24 ชม. สาขาลาดพร้าว", en: "24hr Minimart - Lat Phrao Branch" }, "2025-08-27", "2026-08-26"),
  sales("LIC-SELL-2205", wholesale, { th: "ตัวแทนจำหน่าย ภาคเหนือ เชียงใหม่", en: "Northern Distributor - Chiang Mai" }, "2025-06-01", "2027-05-31"),
  sales("LIC-SELL-2206", onPremise, { th: "ครัวคุณยาย เรสเทอรองต์", en: "Khrua Khun Yai Restaurant" }, "2025-01-20", "2026-09-05"),
  sales("LIC-SELL-2208", onPremise, { th: "โรงแรมสยามแกรนด์ เพลินจิต", en: "Siam Grand Hotel Ploenchit" }, "2026-03-01", "2027-02-28"),
  sales("LIC-SELL-2209", onPremise, { th: "พัทยา บีช รีสอร์ท", en: "Pattaya Beach Resort" }, "2026-01-16", "2027-01-15"),
  sales("LIC-SELL-2210", wholesale, { th: "อันดามัน ดิสทริบิวเตอร์ ภูเก็ต", en: "Andaman Distributor Phuket" }, "2025-09-26", "2026-09-25"),
  sales("LIC-SELL-2211", wholesale, { th: "อีสาน เบฟเวอเรจ เทรดดิ้ง", en: "Isan Beverage Trading" }, "2025-07-01", "2027-06-30"),
  sales("LIC-SELL-2212", retail, { th: "ฟู้ดพลัส ไฮเปอร์มาร์เก็ต พระราม 2", en: "FoodPlus Hypermarket Rama 2" }, "2026-03-01", "2027-02-28"),
  sales("LIC-SELL-2213", retail, { th: "ไวน์คอร์เนอร์ ทองหล่อ", en: "Wine Corner Thonglor" }, "2026-02-01", "2027-01-31"),
  sales("LIC-SELL-2214", onPremise, { th: "เดอะ สาทร สเต๊กเฮาส์", en: "The Sathorn Steakhouse" }, "2026-02-16", "2027-02-15"),
  sales("LIC-SELL-2215", onPremise, { th: "รูฟท็อป 52 สกายบาร์", en: "Rooftop 52 Sky Bar" }, "2025-09-28", "2026-09-27"),
  sales("LIC-SELL-2216", onPremise, { th: "หัวหิน ซีไซด์ โฮเทล", en: "Hua Hin Seaside Hotel" }, "2025-08-01", "2027-07-31"),
  sales("LIC-SELL-2217", onPremise, { th: "สมุย ไอส์แลนด์ รีสอร์ทส์", en: "Samui Island Resorts" }, "2026-03-16", "2027-03-15"),
  sales("LIC-SELL-2218", retail, { th: "ซิตี้มาร์ท คอนวีเนียนซ์ สาขาสีลม", en: "CityMart Convenience - Silom" }, "2026-01-01", "2026-12-31"),
  sales("LIC-SELL-2219", wholesale, { th: "เชียงราย ลิเคอร์ โฮลเซล", en: "Chiang Rai Liquor Wholesale" }, "2026-02-01", "2027-01-31"),
  sales("LIC-SELL-2220", retail, { th: "บอทเทิล ช็อป ออนไลน์", en: "Bottle Shop Online" }, "2026-02-15", "2027-02-14"),
  sales("LIC-SELL-2221", onPremise, { th: "อิซากายะ ฮานามิ", en: "Izakaya Hanami" }, "2026-01-16", "2027-01-15"),
  sales("LIC-SELL-2222", onPremise, { th: "กระบี่ เบย์ บาร์ แอนด์ กริลล์", en: "Krabi Bay Bar & Grill" }, "2026-03-01", "2027-02-28"),
  sales("LIC-SELL-2223", wholesale, { th: "อีสเทิร์นซีบอร์ด ดิสทริบิวเตอร์", en: "Eastern Seaboard Distributor" }, "2025-09-01", "2027-08-31"),
  sales("LIC-SELL-2224", onPremise, { th: "นิมมาน คราฟต์เบียร์ เฮาส์", en: "Nimman Craft Beer House" }, "2026-08-01", "2027-07-31"),
  sales("LIC-SELL-2225", onPremise, { th: "ล้านนา บูทีค โฮเทล", en: "Lanna Boutique Hotel" }, "2026-09-01", "2027-08-31"),
];
