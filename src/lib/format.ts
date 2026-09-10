import type { Lang } from "../i18n/translations";

export function formatCurrency(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, lang: Lang, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** NFR-03: same placeholder shown on-screen by <Masked> — exports must respect masking too, not just the table. */
export const MASKED_EXPORT_VALUE = "••••••";

export function maskIfRestricted(value: string | number, canViewSensitive: boolean): string | number {
  return canViewSensitive ? value : MASKED_EXPORT_VALUE;
}
