import type { Bilingual } from "./types";

export const SYSTEM_ACTOR: Bilingual = { th: "ผู้ใช้งานสาธิต", en: "Demo User" };
// Kept identical to the matching entries in identities.ts so the Audit Trail never shows a different
// name for "Sales Officer" / "Order Officer" than the identity switcher does.
export const SALES_OFFICER_ACTOR: Bilingual = { th: "ชญานันท์ สุขสวัสดิ์ (พนักงานขาย)", en: "Chayanan Suksawat (Sales Officer)" };
export const ORDER_OFFICER_ACTOR: Bilingual = { th: "ธนกร ศรีวิไล (เจ้าหน้าที่สั่งซื้อ)", en: "Thanakorn Sriwilai (Order Officer)" };
