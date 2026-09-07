import type { ProductLabel } from "./types";

/** FR-08: registered label version history per SKU. */
export const productLabels: Record<string, ProductLabel[]> = {
  "SKU-1001": [
    { id: "LBL-1001-1", version: "v1", registeredDate: "2023-02-10", note: { th: "ฉลากเริ่มต้น ผ่านการขึ้นทะเบียนกรมสรรพสามิต", en: "Initial label, registered with the Excise Department" } },
    { id: "LBL-1001-2", version: "v2", registeredDate: "2025-06-01", note: { th: "ปรับคำเตือนสุขภาพตามระเบียบใหม่", en: "Updated health warning per new regulation" } },
  ],
  "SKU-1002": [
    { id: "LBL-1002-1", version: "v1", registeredDate: "2023-02-10", note: { th: "ฉลากเริ่มต้น", en: "Initial label" } },
  ],
  "SKU-1005": [
    { id: "LBL-1005-1", version: "v1", registeredDate: "2022-11-05", note: { th: "ฉลากรุ่นปี 2019", en: "2019 vintage label" } },
    { id: "LBL-1005-2", version: "v2", registeredDate: "2024-03-18", note: { th: "แก้ไขข้อมูลผู้นำเข้าบนฉลาก", en: "Corrected importer information on label" } },
  ],
  "SKU-1007": [
    { id: "LBL-1007-1", version: "v1", registeredDate: "2023-08-22", note: { th: "ฉลากเริ่มต้น", en: "Initial label" } },
  ],
};
