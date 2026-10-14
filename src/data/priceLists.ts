import type { PriceList } from "./types";

/** FR-26: same channel adjustments the app previously hard-coded. */
export const priceLists: PriceList[] = [
  { channel: "distributor", adjustmentPercent: -10, overrides: {} },
  { channel: "retailWholesale", adjustmentPercent: 0, overrides: {} },
  { channel: "restaurantBar", adjustmentPercent: 5, overrides: {} },
  { channel: "online", adjustmentPercent: 8, overrides: {} },
];
