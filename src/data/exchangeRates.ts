import type { ExchangeRate } from "./types";

/**
 * Baht per unit when the books start, roughly in line with 2026 market rates (illustrative, not quotes). The demo
 * history adds a new rate for each currency every week from there.
 */
export const startingRates: Record<string, number> = {
  USD: 36.2,
  EUR: 39.4,
  GBP: 45.9,
  JPY: 0.238,
  AUD: 23.6,
};

/** The rates in force on `date`, one per currency — the history the demo starts from. */
export function exchangeRatesFrom(date: string): ExchangeRate[] {
  return Object.entries(startingRates).map(([currency, rate]) => ({ currency, effectiveDate: date, rate }));
}
