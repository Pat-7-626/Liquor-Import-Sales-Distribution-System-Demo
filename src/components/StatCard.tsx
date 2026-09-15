import type { LucideIcon } from "lucide-react";
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
    : kpi.unit === "skus" ? t("dashboard.skus")
    : "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
          <Icon size={18} />
        </span>
        <span
          className={`text-xs font-medium ${kpi.trendPositive ? "text-emerald-600" : "text-rose-600"}`}
        >
          {kpi.unit === "currency" ? <Masked>{kpi.trend}</Masked> : kpi.trend}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-gray-900">
          {kpi.unit === "currency" ? <Masked>{valueText}</Masked> : valueText}
        </span>
        {unitLabel && <span className="text-sm text-gray-500">{unitLabel}</span>}
      </div>
      <p className="mt-1 text-sm leading-snug text-gray-500">{t(`dashboard.kpi.${kpi.key}`)}</p>
    </div>
  );
}
