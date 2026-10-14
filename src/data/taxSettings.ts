import type { TaxSettings } from "./types";

/** FR-10: illustrative rates (the values the app previously hard-coded) — not the real Thai tariff schedule. */
export const taxSettings: TaxSettings = {
  vatPercent: 7,
  exciseThbPerAbvLiter: 6,
  defaultDutyPercent: 30,
  dutyRates: [
    { hsPrefix: "2208.3", label: "Whisky", dutyPercent: 30 },
    { hsPrefix: "2208.9", label: "Tequila / other spirits", dutyPercent: 30 },
    { hsPrefix: "2204.2", label: "Wine", dutyPercent: 60 },
    { hsPrefix: "2208.6", label: "Vodka", dutyPercent: 30 },
    { hsPrefix: "2208.5", label: "Gin", dutyPercent: 30 },
    { hsPrefix: "2208.7", label: "Liqueur", dutyPercent: 30 },
    { hsPrefix: "2208.4", label: "Rum", dutyPercent: 30 },
    { hsPrefix: "2203.0", label: "Beer", dutyPercent: 20 },
  ],
};
