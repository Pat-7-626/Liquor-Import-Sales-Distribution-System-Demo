export interface KpiCard {
  key: string;
  value: number;
  unit: "days" | "percent" | "currency" | "items" | "times" | "timesYear" | "skus";
  trend: string;
  trendPositive: boolean;
  /** Computed from live data (no stored history, so no trend). Otherwise a sample figure from the source sheet. */
  live?: boolean;
}

export const kpis: KpiCard[] = [
  { key: "leadTime", value: 27, unit: "days", trend: "-3", trendPositive: true },
  { key: "errorRate", value: 6.2, unit: "percent", trend: "-1.1%", trendPositive: true },
  { key: "inventoryValue", value: 8450000, unit: "currency", trend: "+3.4%", trendPositive: true },
  { key: "expiringLicenses", value: 3, unit: "items", trend: "+1", trendPositive: false },
  { key: "taxCost", value: 612000, unit: "currency", trend: "+5.8%", trendPositive: false },
  { key: "totalSales", value: 3120000, unit: "currency", trend: "+9.2%", trendPositive: true },
  { key: "turnover", value: 1.8, unit: "times", trend: "+0.2", trendPositive: true },
  { key: "agingStock", value: 2, unit: "skus", trend: "+0", trendPositive: true },
  { key: "onTimeDelivery", value: 94.5, unit: "percent", trend: "-1.0%", trendPositive: false },
  { key: "outstandingCredit", value: 2695000, unit: "currency", trend: "+2.1%", trendPositive: false },
];
