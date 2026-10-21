import type { TaxSettings } from "./types";

/**
 * FR-10: Thai import taxes on liquor, in the structure the Customs and Excise Departments use.
 *
 * - Import duty by HS heading. Wine (22.04) has been duty-free since 23 Feb 2024; spirits and beer are at
 *   the MFN rate. Goods from FTA partners (ASEAN, Australia, Chile, Japan…) may pay less with a certificate
 *   of origin — set that rate here if every import qualifies.
 * - Excise (Excise Act B.E. 2560): a share of the suggested retail price before VAT, plus baht per litre of
 *   pure alcohol. Spirits and beer at the 2017 tariff; wine at the rate cut of 23 Feb 2024 (5% + ฿1,000).
 * - Collected with the excise: Interior Ministry tax (10% of the excise) and the fund levies — ThaiHealth 2%,
 *   Thai PBS 1.5%, sports 2%, elderly 2% (7.5% together).
 * - Import VAT on CIF + duty + excise + those levies.
 *
 * Rates change by ministerial regulation; check the current ones with the departments before relying on
 * these figures.
 */
export const taxSettings: TaxSettings = {
  vatPercent: 7,
  defaultDutyPercent: 60,
  dutyRates: [
    { hsPrefix: "2208.3", label: "Whisky", dutyPercent: 60 },
    { hsPrefix: "2208.9", label: "Tequila / other spirits", dutyPercent: 60 },
    { hsPrefix: "2204.2", label: "Wine", dutyPercent: 0 },
    { hsPrefix: "2208.6", label: "Vodka", dutyPercent: 60 },
    { hsPrefix: "2208.5", label: "Gin", dutyPercent: 60 },
    { hsPrefix: "2208.7", label: "Liqueur", dutyPercent: 60 },
    { hsPrefix: "2208.4", label: "Rum", dutyPercent: 60 },
    { hsPrefix: "2203.0", label: "Beer", dutyPercent: 60 },
  ],
  exciseRates: [
    { kind: "spirits", valuePercent: 20, perLitreAlcohol: 255 },
    { kind: "wine", valuePercent: 5, perLitreAlcohol: 1000 },
    { kind: "beer", valuePercent: 22, perLitreAlcohol: 430 },
  ],
  localTaxPercent: 10,
  fundsPercent: 7.5,
};
