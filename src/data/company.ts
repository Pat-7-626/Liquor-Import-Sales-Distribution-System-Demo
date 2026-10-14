import type { CompanyProfile } from "./types";

/** The seller on every tax invoice. Name from the source licenses; tax ID (valid checksum) and address illustrative. */
export const company: CompanyProfile = {
  name: { th: "บริษัท เรา จำกัด", en: "Our Company Co., Ltd." },
  taxId: "0105556001188",
  branch: "00000",
  address: {
    th: "199 อาคารเดอะเซลลาร์ ชั้น 12 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120",
    en: "199 The Cellar Building, 12th Floor, South Sathorn Rd, Yan Nawa, Sathorn, Bangkok 10120",
  },
  phone: "02-123-4567",
  email: "accounts@ourcompany.example",
  openingDate: "2026-04-30",
  openingBank: 4_000_000,
};
