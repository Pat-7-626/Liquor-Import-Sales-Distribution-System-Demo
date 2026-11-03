import type { Customer } from "./types";

/** A fictional 13-digit taxpayer number: the first 12 digits plus the Revenue Department's mod-11 check digit. */
function taxId(first12: string): string {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

type Seed = Omit<Customer, "outstandingBalance" | "creditRemaining" | "creditStatus">;

/*
 * CUS-0001…0007 — names, channels, licenses, credit limits and discounts from the source spreadsheet. Their
 * outstanding balances there were a snapshot; the demo history starts from them (as balances brought forward)
 * and moves them with six months of trading. Tax IDs (valid-checksum, fictional), addresses, branches and
 * credit terms are illustrative: the spreadsheet has none, but a Thai tax invoice can't be issued without them
 * (Revenue Code §86/4).
 * CUS-0008…0025 — illustrative customers added so every channel and region has trade in the demo.
 */
const seeds: Seed[] = [
  {
    customerId: "CUS-0001",
    name: { th: "ตัวแทนจำหน่าย กรุงเทพ ทีเอ็ม", en: "Bangkok TM Distributor" },
    taxId: "0105558012349", branch: "00000", creditTermDays: 60,
    address: { th: "88/12 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310", en: "88/12 Rama 9 Rd, Huai Khwang, Bangkok 10310" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2201", licenseExpiry: "2026-09-20",
    creditLimit: 2000000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0002",
    name: { th: "ร้านสุขใจซุปเปอร์มาร์เก็ต", en: "Sukjai Supermarket" },
    taxId: "0105559022119", branch: "00002", creditTermDays: 30,
    address: { th: "145 ถนนลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900", en: "145 Lat Phrao Rd, Chom Phon, Chatuchak, Bangkok 10900" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2202", licenseExpiry: "2026-09-15",
    creditLimit: 500000, standardDiscount: 5,
  },
  {
    customerId: "CUS-0003",
    name: { th: "บาร์ริมเจ้าพระยา", en: "Riverside Chao Phraya Bar" },
    taxId: "0105560033170", branch: "00000", creditTermDays: 30,
    address: { th: "9 ซอยเจริญกรุง 30 แขวงสี่พระยา เขตบางรัก กรุงเทพฯ 10500", en: "9 Soi Charoen Krung 30, Si Phraya, Bang Rak, Bangkok 10500" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2203", licenseExpiry: "2026-11-30",
    creditLimit: 300000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0004",
    name: { th: "มินิมาร์ท 24 ชม. สาขาลาดพร้าว", en: "24hr Minimart - Lat Phrao Branch" },
    taxId: "0105557044204", branch: "00014", creditTermDays: 30,
    address: { th: "512 ถนนลาดพร้าว แขวงวังทองหลาง เขตวังทองหลาง กรุงเทพฯ 10310", en: "512 Lat Phrao Rd, Wang Thonglang, Bangkok 10310" },
    channelType: "retailWholesale",
    // The sheet's expiry (31 Jul 2025) is a year before any of its sales to this shop, which the app would
    // refuse; it lapsed recently instead, so the earlier sales stand and new ones are blocked until renewal.
    licenseNo: "LIC-SELL-2204", licenseExpiry: "2026-08-26",
    creditLimit: 150000, standardDiscount: 5,
  },
  {
    customerId: "CUS-0005",
    name: { th: "ตัวแทนจำหน่าย ภาคเหนือ เชียงใหม่", en: "Northern Distributor - Chiang Mai" },
    taxId: "0555561055131", branch: "00000", creditTermDays: 60,
    address: { th: "77 ถนนช้างคลาน ตำบลช้างคลาน อำเภอเมือง เชียงใหม่ 50100", en: "77 Chang Khlan Rd, Mueang, Chiang Mai 50100" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2205", licenseExpiry: "2027-05-31",
    creditLimit: 1800000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0006",
    name: { th: "ครัวคุณยาย เรสเทอรองต์", en: "Khrua Khun Yai Restaurant" },
    taxId: "0105562066148", branch: "00000", creditTermDays: 30,
    address: { th: "23 ถนนสุขุมวิท 49 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110", en: "23 Sukhumvit 49, Khlong Tan Nuea, Watthana, Bangkok 10110" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2206", licenseExpiry: "2026-09-05",
    creditLimit: 250000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0007",
    name: { th: "ร้านค้าออนไลน์ DrinkHub", en: "DrinkHub Online Store" },
    taxId: "0105563077151", branch: "00000", creditTermDays: 15,
    address: { th: "1000/5 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900", en: "1000/5 Vibhavadi Rangsit Rd, Chom Phon, Chatuchak, Bangkok 10900" },
    channelType: "online",
    licenseNo: null, licenseExpiry: null,
    creditLimit: 400000, standardDiscount: 6,
  },
  {
    customerId: "CUS-0008",
    name: { th: "โรงแรมสยามแกรนด์ เพลินจิต", en: "Siam Grand Hotel Ploenchit" },
    taxId: taxId("010554501234"), branch: "00000", creditTermDays: 30,
    address: { th: "55 ถนนเพลินจิต แขวงลุมพินี เขตปทุมวัน กรุงเทพฯ 10330", en: "55 Ploenchit Rd, Lumphini, Pathum Wan, Bangkok 10330" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2208", licenseExpiry: "2027-02-28",
    creditLimit: 600000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0009",
    name: { th: "พัทยา บีช รีสอร์ท", en: "Pattaya Beach Resort" },
    taxId: taxId("020554802211"), branch: "00000", creditTermDays: 30,
    address: { th: "300 ถนนเลียบชายหาด ตำบลหนองปรือ อำเภอบางละมุง ชลบุรี 20150", en: "300 Beach Rd, Nong Prue, Bang Lamung, Chonburi 20150" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2209", licenseExpiry: "2027-01-15",
    creditLimit: 450000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0010",
    name: { th: "อันดามัน ดิสทริบิวเตอร์ ภูเก็ต", en: "Andaman Distributor Phuket" },
    taxId: taxId("083555901345"), branch: "00000", creditTermDays: 60,
    address: { th: "12/7 ถนนเทพกระษัตรี ตำบลรัษฎา อำเภอเมือง ภูเก็ต 83000", en: "12/7 Thepkrasattri Rd, Ratsada, Mueang, Phuket 83000" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2210", licenseExpiry: "2026-09-25",
    creditLimit: 1500000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0011",
    name: { th: "อีสาน เบฟเวอเรจ เทรดดิ้ง", en: "Isan Beverage Trading" },
    taxId: taxId("040555612207"), branch: "00000", creditTermDays: 45,
    address: { th: "88 ถนนมิตรภาพ ตำบลในเมือง อำเภอเมือง ขอนแก่น 40000", en: "88 Mittraphap Rd, Nai Mueang, Mueang, Khon Kaen 40000" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2211", licenseExpiry: "2027-06-30",
    creditLimit: 1200000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0012",
    name: { th: "ฟู้ดพลัส ไฮเปอร์มาร์เก็ต พระราม 2", en: "FoodPlus Hypermarket Rama 2" },
    taxId: taxId("010554007712"), branch: "00031", creditTermDays: 45,
    address: { th: "99 ถนนพระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150", en: "99 Rama 2 Rd, Samae Dam, Bang Khun Thian, Bangkok 10150" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2212", licenseExpiry: "2027-02-28",
    creditLimit: 900000, standardDiscount: 6,
  },
  {
    customerId: "CUS-0013",
    name: { th: "ไวน์คอร์เนอร์ ทองหล่อ", en: "Wine Corner Thonglor" },
    taxId: taxId("010556103318"), branch: "00000", creditTermDays: 30,
    address: { th: "21 ซอยทองหล่อ 13 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110", en: "21 Soi Thonglor 13, Khlong Tan Nuea, Watthana, Bangkok 10110" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2213", licenseExpiry: "2027-01-31",
    creditLimit: 300000, standardDiscount: 5,
  },
  {
    customerId: "CUS-0014",
    name: { th: "เดอะ สาทร สเต๊กเฮาส์", en: "The Sathorn Steakhouse" },
    taxId: taxId("010556208841"), branch: "00000", creditTermDays: 30,
    address: { th: "48 ถนนสาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", en: "48 North Sathorn Rd, Silom, Bang Rak, Bangkok 10500" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2214", licenseExpiry: "2027-02-15",
    creditLimit: 200000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0015",
    name: { th: "รูฟท็อป 52 สกายบาร์", en: "Rooftop 52 Sky Bar" },
    taxId: taxId("010556309925"), branch: "00000", creditTermDays: 30,
    address: { th: "1 ถนนสีลม ชั้น 52 แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", en: "1 Silom Rd, 52nd Floor, Silom, Bang Rak, Bangkok 10500" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2215", licenseExpiry: "2026-09-27",
    creditLimit: 350000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0016",
    name: { th: "หัวหิน ซีไซด์ โฮเทล", en: "Hua Hin Seaside Hotel" },
    taxId: taxId("077555405563"), branch: "00000", creditTermDays: 30,
    address: { th: "11 ถนนเพชรเกษม ตำบลหัวหิน อำเภอหัวหิน ประจวบคีรีขันธ์ 77110", en: "11 Phetkasem Rd, Hua Hin, Prachuap Khiri Khan 77110" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2216", licenseExpiry: "2027-07-31",
    creditLimit: 300000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0017",
    name: { th: "สมุย ไอส์แลนด์ รีสอร์ทส์", en: "Samui Island Resorts" },
    taxId: taxId("084555507789"), branch: "00000", creditTermDays: 45,
    address: { th: "5/3 หมู่ 2 ตำบลบ่อผุด อำเภอเกาะสมุย สุราษฎร์ธานี 84320", en: "5/3 Moo 2, Bo Phut, Ko Samui, Surat Thani 84320" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2217", licenseExpiry: "2027-03-15",
    creditLimit: 400000, standardDiscount: 10,
  },
  {
    customerId: "CUS-0018",
    name: { th: "ซิตี้มาร์ท คอนวีเนียนซ์ สาขาสีลม", en: "CityMart Convenience - Silom" },
    taxId: taxId("010555708890"), branch: "00007", creditTermDays: 30,
    address: { th: "190 ถนนสีลม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ 10500", en: "190 Silom Rd, Suriyawong, Bang Rak, Bangkok 10500" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2218", licenseExpiry: "2026-12-31",
    creditLimit: 150000, standardDiscount: 5,
  },
  {
    customerId: "CUS-0019",
    name: { th: "เชียงราย ลิเคอร์ โฮลเซล", en: "Chiang Rai Liquor Wholesale" },
    taxId: taxId("057555810054"), branch: "00000", creditTermDays: 45,
    address: { th: "300 ถนนพหลโยธิน ตำบลเวียง อำเภอเมือง เชียงราย 57000", en: "300 Phahonyothin Rd, Wiang, Mueang, Chiang Rai 57000" },
    channelType: "retailWholesale",
    licenseNo: "LIC-SELL-2219", licenseExpiry: "2027-01-31",
    creditLimit: 700000, standardDiscount: 7,
  },
  {
    customerId: "CUS-0020",
    name: { th: "บอทเทิล ช็อป ออนไลน์", en: "Bottle Shop Online" },
    taxId: taxId("010556411236"), branch: "00000", creditTermDays: 15,
    address: { th: "77/9 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพฯ 10400", en: "77/9 Ratchadaphisek Rd, Din Daeng, Bangkok 10400" },
    channelType: "online",
    licenseNo: "LIC-SELL-2220", licenseExpiry: "2027-02-14",
    creditLimit: 250000, standardDiscount: 6,
  },
  {
    customerId: "CUS-0021",
    name: { th: "อิซากายะ ฮานามิ", en: "Izakaya Hanami" },
    taxId: taxId("010556512218"), branch: "00000", creditTermDays: 30,
    address: { th: "38 ซอยสุขุมวิท 55 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110", en: "38 Soi Sukhumvit 55, Khlong Tan Nuea, Watthana, Bangkok 10110" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2221", licenseExpiry: "2027-01-15",
    creditLimit: 120000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0022",
    name: { th: "กระบี่ เบย์ บาร์ แอนด์ กริลล์", en: "Krabi Bay Bar & Grill" },
    taxId: taxId("081556613347"), branch: "00000", creditTermDays: 30,
    address: { th: "14 ถนนอ่าวนาง ตำบลอ่าวนาง อำเภอเมือง กระบี่ 81180", en: "14 Ao Nang Rd, Ao Nang, Mueang, Krabi 81180" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2222", licenseExpiry: "2027-02-28",
    creditLimit: 150000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0023",
    name: { th: "อีสเทิร์นซีบอร์ด ดิสทริบิวเตอร์", en: "Eastern Seaboard Distributor" },
    taxId: taxId("021555714409"), branch: "00000", creditTermDays: 60,
    address: { th: "45 ถนนสุขุมวิท ตำบลเชิงเนิน อำเภอเมือง ระยอง 21000", en: "45 Sukhumvit Rd, Choeng Noen, Mueang, Rayong 21000" },
    channelType: "distributor",
    licenseNo: "LIC-SELL-2223", licenseExpiry: "2027-08-31",
    creditLimit: 1000000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0024",
    name: { th: "นิมมาน คราฟต์เบียร์ เฮาส์", en: "Nimman Craft Beer House" },
    taxId: taxId("050556815512"), branch: "00000", creditTermDays: 30,
    address: { th: "9 ซอยนิมมานเหมินท์ 11 ตำบลสุเทพ อำเภอเมือง เชียงใหม่ 50200", en: "9 Soi Nimmanhaemin 11, Suthep, Mueang, Chiang Mai 50200" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2224", licenseExpiry: "2027-07-31",
    creditLimit: 100000, standardDiscount: 8,
  },
  {
    customerId: "CUS-0025",
    name: { th: "ล้านนา บูทีค โฮเทล", en: "Lanna Boutique Hotel" },
    taxId: taxId("050556916623"), branch: "00000", creditTermDays: 30,
    address: { th: "120 ถนนราชดำเนิน ตำบลศรีภูมิ อำเภอเมือง เชียงใหม่ 50200", en: "120 Ratchadamnoen Rd, Si Phum, Mueang, Chiang Mai 50200" },
    channelType: "restaurantBar",
    licenseNo: "LIC-SELL-2225", licenseExpiry: "2027-08-31",
    creditLimit: 200000, standardDiscount: 10,
  },
];

export const customers: Customer[] = seeds.map((c) => ({
  ...c,
  outstandingBalance: 0,
  creditRemaining: c.creditLimit,
  creditStatus: c.licenseNo ? "normal" : "noLicense",
}));

/** Balances owed per the source spreadsheet (CUS-0001…0007); the demo carries them forward as opening receivables. */
export const spreadsheetBalances: Record<string, number> = {
  "CUS-0001": 1450000,
  "CUS-0002": 480000,
  "CUS-0003": 90000,
  "CUS-0004": 40000,
  "CUS-0005": 320000,
  "CUS-0006": 260000,
  "CUS-0007": 55000,
};
