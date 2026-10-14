import type { Bilingual } from "./types";

// Seed-history actors only — live actions are attributed to whoever is signed in. Kept identical to the matching entries in identities.ts so the Audit Trail never shows a different
// name for "Sales Officer" / "Order Officer" than the identity switcher does.
export const SALES_OFFICER_ACTOR: Bilingual = { th: "ชญานันท์ สุขสวัสดิ์ (พนักงานขาย)", en: "Chayanan Suksawat (Sales Officer)" };
export const ORDER_OFFICER_ACTOR: Bilingual = { th: "ธนกร ศรีวิไล (เจ้าหน้าที่สั่งซื้อ)", en: "Thanakorn Sriwilai (Order Officer)" };
export const DISTRIBUTION_OFFICER_ACTOR: Bilingual = { th: "วิชัย ทองดี (เจ้าหน้าที่กระจายสินค้า)", en: "Wichai Thongdee (Distribution Officer)" };
export const DOC_OFFICER_ACTOR: Bilingual = { th: "นภัสสร บุญมี (เจ้าหน้าที่เอกสาร)", en: "Napassorn Boonmee (Documentation Officer)" };
export const WAREHOUSE_OFFICER_ACTOR: Bilingual = { th: "สมศักดิ์ ชัยศิริ (เจ้าหน้าที่คลังสินค้า)", en: "Somsak Chaisiri (Warehouse Officer)" };
