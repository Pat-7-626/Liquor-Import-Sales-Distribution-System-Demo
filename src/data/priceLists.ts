import type { PriceList } from "./types";

/** FR-26: each channel's price against the suggested retail price. Illustrative. */
export const priceLists: PriceList[] = [
  { channel: "distributor", adjustmentPercent: -6, overrides: {} },
  { channel: "retailWholesale", adjustmentPercent: 0, overrides: {} },
  { channel: "restaurantBar", adjustmentPercent: 5, overrides: {} },
  { channel: "online", adjustmentPercent: 8, overrides: {} },
];
