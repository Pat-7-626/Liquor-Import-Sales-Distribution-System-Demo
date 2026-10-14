import type { Lang } from "../i18n/translations";
import { addDays, todayIso } from "./business";

/**
 * Chart palette — validated with the dataviz validator against the white card surface
 * (lightness band, chroma floor, CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, contrast ≥ 3:1: all pass).
 * Slot order is part of the colour-blind safety — assign in order, never cycle, never generate a 5th.
 */
export const SERIES = ["#9b3346", "#c48a1c", "#2f73b5", "#2e9a6c"] as const;
/** De-emphasis grey for "context" marks when one bar is the story. */
export const MUTED_MARK = "#d4ccbf";

export type Period = "all" | "30d" | "90d" | "ytd";
export const PERIODS: Period[] = ["all", "90d", "30d", "ytd"];

/** First day (ISO) included in a period, or null for all time. */
export function periodStart(period: Period): string | null {
  const today = todayIso();
  if (period === "30d") return addDays(today, -29);
  if (period === "90d") return addDays(today, -89);
  if (period === "ytd") return `${today.slice(0, 4)}-01-01`;
  return null;
}

export function inPeriod(dateIso: string, period: Period): boolean {
  const start = periodStart(period);
  return !start || dateIso.slice(0, 10) >= start;
}

/** Every month (yyyy-mm) from the earliest date to the latest, so gaps show as zero rather than vanishing. */
export function monthRange(datesIso: string[]): string[] {
  if (datesIso.length === 0) return [];
  const sorted = [...datesIso].map((d) => d.slice(0, 7)).sort();
  const months: string[] = [];
  let [y, m] = sorted[0].split("-").map(Number);
  const [ey, em] = sorted[sorted.length - 1].split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function monthLabel(month: string, lang: Lang): string {
  const d = new Date(`${month}-01T00:00:00`);
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { month: "short", year: "numeric" }).format(d);
}

/** Sum `value` per key, preserving first-seen order. */
export function sumBy<T>(items: T[], key: (t: T) => string, value: (t: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) out.set(key(it), (out.get(key(it)) ?? 0) + value(it));
  return out;
}

/** Clean axis ticks: 0 plus ~4 round steps that cover `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** 1,284 / 12.9K / 4.2M — for axis ticks and tight labels; tables keep full figures. */
export function formatCompact(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(ratio: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", { style: "percent", maximumFractionDigits: digits }).format(ratio);
}
