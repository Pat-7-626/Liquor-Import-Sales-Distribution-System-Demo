import type { ExchangeRate } from "./types";

/** Baht per unit, roughly in line with 2026 market rates; one entry per change. Illustrative, not quotes. */
export const exchangeRates: ExchangeRate[] = [
  { currency: "USD", effectiveDate: "2026-05-01", rate: 36.2 },
  { currency: "USD", effectiveDate: "2026-07-01", rate: 36.55 },
  { currency: "USD", effectiveDate: "2026-09-01", rate: 35.9 },
  { currency: "USD", effectiveDate: "2026-10-01", rate: 36.1 },
  { currency: "EUR", effectiveDate: "2026-05-01", rate: 39.4 },
  { currency: "EUR", effectiveDate: "2026-07-01", rate: 39.85 },
  { currency: "EUR", effectiveDate: "2026-09-01", rate: 39.1 },
  { currency: "EUR", effectiveDate: "2026-10-01", rate: 39.3 },
  { currency: "GBP", effectiveDate: "2026-05-01", rate: 45.9 },
  { currency: "GBP", effectiveDate: "2026-07-01", rate: 46.4 },
  { currency: "GBP", effectiveDate: "2026-09-01", rate: 45.6 },
  { currency: "GBP", effectiveDate: "2026-10-01", rate: 45.8 },
  { currency: "JPY", effectiveDate: "2026-05-01", rate: 0.238 },
  { currency: "JPY", effectiveDate: "2026-07-01", rate: 0.241 },
  { currency: "JPY", effectiveDate: "2026-09-01", rate: 0.2365 },
  { currency: "JPY", effectiveDate: "2026-10-01", rate: 0.239 },
];
