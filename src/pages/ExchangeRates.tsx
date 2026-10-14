import { useMemo, useState } from "react";
import { Lock, Plus } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { FieldLabel, inputClass } from "../components/FormKit";
import { useRunAction } from "../lib/useRunAction";
import { formatDate, formatNumber } from "../lib/format";
import { todayIso } from "../lib/business";

/** Baht per unit of each foreign currency. Orders are fixed at the rate on the day they're placed. */
export default function ExchangeRates() {
  const { t, lang } = useLanguage();
  const { can } = useRole();
  const runAction = useRunAction();
  const { exchangeRates, importOrders, saveExchangeRate } = useData();
  const today = todayIso();
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState<number>(0);
  const editable = can("manageRates");

  const currencies = useMemo(() => [...new Set(exchangeRates.map((r) => r.currency))].sort(), [exchangeRates]);
  const history = useMemo(() => [...exchangeRates].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.currency.localeCompare(b.currency)), [exchangeRates]);
  const fmtRate = (n: number) => formatNumber(n, lang, 4);
  // The rate in force today for each currency: its latest entry dated today or earlier.
  const inForce = useMemo(
    () => new Set(currencies.map((c) => history.find((x) => x.currency === c && x.effectiveDate <= today)).filter(Boolean).map((r) => `${r!.currency}|${r!.effectiveDate}`)),
    [currencies, history, today],
  );

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.purchasing")} title={t("fx.title")} subtitle={t("fx.subtitle")} />

      {/* Current rate per currency, with how it moved since the previous one. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {currencies.map((c) => {
          const rates = exchangeRates.filter((r) => r.currency === c && r.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
          const now = rates[0];
          const prev = rates[1];
          const change = now && prev ? ((now.rate - prev.rate) / prev.rate) * 100 : null;
          const open = importOrders.filter((o) => o.currency === c && o.status !== "receivedWarehouse" && o.status !== "rejected").length;
          return (
            <div key={c} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" data-testid={`rate-${c}`}>
              <p className="text-xs font-medium text-gray-500">1 {c} =</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900">฿{now ? fmtRate(now.rate) : "—"}</p>
              <p className="text-xs text-gray-500">
                {now ? t("fx.since").replace("{d}", formatDate(now.effectiveDate, lang)) : t("fx.noCurrent")}
                {change !== null && (
                  <span className={`ml-1.5 font-medium ${change > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-gray-400">{t("fx.openOrders").replace("{n}", String(open))}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TableContainer>
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th className={th}>{t("fx.currency")}</th>
                <th className={th}>{t("fx.effectiveFrom")}</th>
                <th className={`${th} text-right`}>{t("fx.rate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.length === 0 && <EmptyRow colSpan={3} />}
              {history.map((r) => {
                const current = inForce.has(`${r.currency}|${r.effectiveDate}`);
                return (
                  <tr key={`${r.currency}-${r.effectiveDate}`} className={current ? "bg-gold-100/30" : ""}>
                    <td className={`${td} font-medium text-gray-900`}>
                      {r.currency}
                      {current && <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-600">{t("fx.current")}</span>}
                      {r.effectiveDate > today && <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700">{t("fx.scheduled")}</span>}
                    </td>
                    <td className={td}>{formatDate(r.effectiveDate, lang)}</td>
                    <td className={`${td} text-right tabular-nums`}>฿{fmtRate(r.rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableContainer>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("fx.addTitle")}</h3>
          <p className="mb-3 text-xs text-gray-500">{t("fx.addHint")}</p>
          {!editable ? (
            <p className="flex items-center gap-1.5 text-sm text-gray-500">
              <Lock size={13} />
              {t("fx.noPermission")}
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await runAction(saveExchangeRate({ currency, effectiveDate: date, rate }), `${t("fx.saved")}: ${currency.toUpperCase()}`)) setRate(0);
              }}
            >
              <label className="block">
                <FieldLabel>{t("fx.currency")}</FieldLabel>
                <input
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  list="fx-currencies"
                  className={inputClass}
                  data-testid="fx-currency"
                />
                <datalist id="fx-currencies">
                  {currencies.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <FieldLabel>{t("fx.effectiveFrom")}</FieldLabel>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <FieldLabel>{t("fx.rateLabel").replace("{c}", currency || "…")}</FieldLabel>
                <input type="number" step="0.0001" min={0} value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} className={inputClass} data-testid="fx-rate" />
              </label>
              <button
                type="submit"
                disabled={!/^[A-Z]{3}$/.test(currency) || !(rate > 0)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                data-testid="fx-save"
              >
                <Plus size={15} />
                {t("fx.add")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
