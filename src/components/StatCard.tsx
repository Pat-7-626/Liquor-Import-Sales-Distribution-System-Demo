import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Masked } from "./Masked";
import { formatCurrency, formatNumber } from "../lib/format";
import type { KpiCard } from "../data/dashboard";

interface Props {
  kpi: KpiCard;
  icon: LucideIcon;
}

export function StatCard({ kpi, icon: Icon }: Props) {
  const { t, lang } = useLanguage();

  const valueText =
    kpi.unit === "currency"
      ? `฿${formatCurrency(kpi.value, lang)}`
      : kpi.unit === "percent"
        ? `${formatNumber(kpi.value, lang)}%`
        : formatNumber(kpi.value, lang);

  const unitLabel =
    kpi.unit === "days" ? t("dashboard.days")
    : kpi.unit === "items" ? t("dashboard.items")
    : kpi.unit === "times" ? t("dashboard.times")
    : kpi.unit === "timesYear" ? t("dashboard.timesYear")
    : kpi.unit === "skus" ? t("dashboard.skus")
    : "";

  // Direction of the arrow follows the sign of the change; colour follows whether that's good news.
  const rising = !kpi.trend.trim().startsWith("-");
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-gray-500">{t(`dashboard.kpi.${kpi.key}`)}</p>
        <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold-500" />
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-[-0.01em] text-gray-900">
          {/* Turnover is derived from cost prices, so it's as restricted as the money figures (NFR-03). */}
          {kpi.unit === "currency" || kpi.key === "turnover" ? <Masked>{valueText}</Masked> : valueText}
        </span>
        {unitLabel && <span className="text-sm text-gray-500">{unitLabel}</span>}
      </div>
      <div className="mt-auto pt-4">
        {kpi.live ? null : (
        <span title={t("dashboard.sampleFigureHint")} className="mr-1.5 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {t("dashboard.sampleFigure")}
        </span>
        )}
        {!kpi.live && (
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
            kpi.trendPositive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          <Arrow size={12} strokeWidth={2} />
          {kpi.unit === "currency" ? <Masked>{kpi.trend}</Masked> : kpi.trend}
        </span>
        )}
      </div>
    </div>
  );
}
