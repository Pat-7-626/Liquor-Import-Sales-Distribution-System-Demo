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
