import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Masked } from "../components/Masked";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { ChartCard, KpiTile, StackedBar } from "../components/charts";
import { formatCurrency } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { formatPercent } from "../lib/analytics";
import { AGING_BUCKETS, agingTotals, computeArOpenItems, todayIso, type AgingBucket } from "../lib/business";

/** Ordinal ramp: on time → most overdue. */
const BUCKET_COLORS: Record<AgingBucket, string> = {
  current: "#2e9a6c",
  "1-30": "#c48a1c",
  "31-60": "#c9692f",
  "61-90": "#b4483b",
  "90+": "#9b3346",
};

const emptyTotals = (): Record<AgingBucket, number> => ({ current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 });

export default function ArAging() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive } = useRole();
  const { customers, salesOrders, arDocuments } = useData();
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;
  const today = todayIso();

  const rows = useMemo(
    () =>
      customers
        .map((c) => {
          const items = computeArOpenItems(c, salesOrders, arDocuments);
          const buckets = agingTotals(items, today);
          const total = AGING_BUCKETS.reduce((s, b) => s + buckets[b], 0);
          const overdue = total - buckets.current;
          return { c, items, buckets, total, overdue };
        })
        .filter((r) => r.total > 0.005)
        .sort((a, b) => b.overdue - a.overdue || b.total - a.total),
    [customers, salesOrders, arDocuments, today],
  );

  const totals = rows.reduce((acc, r) => {
    for (const b of AGING_BUCKETS) acc[b] += r.buckets[b];
    return acc;
  }, emptyTotals());
  const grand = AGING_BUCKETS.reduce((s, b) => s + totals[b], 0);
  const overdue = grand - totals.current;
  const overdueCustomers = rows.filter((r) => r.overdue > 0.005).length;

  const bucketLabel = (b: AgingBucket) => t(`ar.bucket.${b}`);

  const handleExport = () =>
    exportToExcel(
      "ar-aging",
      [t("customers.col.customerId"), t("salesOrders.col.customerName"), t("ar.creditTermDays"), ...AGING_BUCKETS.map(bucketLabel), t("ar.totalOpen")],
      rows.map((r) => [r.c.customerId, bi(r.c.name), r.c.creditTermDays, ...AGING_BUCKETS.map((b) => r.buckets[b]), r.total]),
    );

  if (!canViewSensitive) {
    return (
      <div>
        <PageHeader eyebrow={t("nav.group.sales")} title={t("ar.agingTitle")} subtitle={t("ar.agingSubtitle")} />
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">{t("ar.agingRestricted")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader eyebrow={t("nav.group.sales")} title={t("ar.agingTitle")} subtitle={t("ar.agingSubtitle")} />
        <button
          onClick={handleExport}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.export")}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label={t("ar.totalOpen")} value={baht(grand)} sensitive hint={`${rows.length} ${t("ar.customersOwing")}`} />
        <KpiTile
          label={t("ar.overdue")}
          value={baht(overdue)}
          sensitive
          tone={overdue > 0 ? "warning" : "good"}
          hint={grand > 0 ? `${formatPercent(overdue / grand, lang, 0)} ${t("ar.ofOpen")}` : undefined}
        />
        <KpiTile label={t("ar.over90")} value={baht(totals["90+"])} sensitive tone={totals["90+"] > 0 ? "critical" : "good"} />
        <KpiTile label={t("ar.customersOverdue")} value={String(overdueCustomers)} tone={overdueCustomers > 0 ? "warning" : "good"} />
      </div>

      <div className="mb-6">
        <ChartCard
          wide
          sensitive
          title={t("ar.byBucket")}
          subtitle={t("ar.byBucketSub")}
          table={{ columns: [t("ar.bucketCol"), t("ar.amount")], rows: AGING_BUCKETS.map((b) => [bucketLabel(b), baht(totals[b])]) }}
        >
          <StackedBar segments={AGING_BUCKETS.map((b) => ({ key: b, label: bucketLabel(b), value: totals[b], color: BUCKET_COLORS[b] }))} format={baht} />
        </ChartCard>
      </div>

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("salesOrders.col.customerName")}</th>
            <th className={th}>{t("ar.creditTermDays")}</th>
            {AGING_BUCKETS.map((b) => (
              <th key={b} className={`${th} text-right`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: BUCKET_COLORS[b] }} />
                  {bucketLabel(b)}
                </span>
              </th>
            ))}
            <th className={`${th} text-right`}>{t("ar.totalOpen")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && <EmptyRow colSpan={8} />}
          {rows.map((r) => (
            <tr key={r.c.customerId} className="hover:bg-gray-50/60">
              <td className={td}>
                <Link to={`/customers/${r.c.customerId}`} className="font-medium text-gray-900 hover:text-indigo-600 hover:underline">
                  {bi(r.c.name)}
                </Link>
                <span className="block text-xs text-gray-400">
                  {r.c.customerId} · {r.items.length} {t("ar.openDocs")}
                </span>
              </td>
              <td className={td}>{t("ar.netDays").replace("{n}", String(r.c.creditTermDays))}</td>
              {AGING_BUCKETS.map((b) => (
                <td
                  key={b}
                  className={`${td} text-right tabular-nums ${
                    r.buckets[b] <= 0 ? "text-gray-300" : b === "current" ? "text-gray-900" : b === "1-30" ? "text-amber-700" : "font-medium text-rose-700"
                  }`}
                >
                  <Masked>{r.buckets[b] > 0 ? baht(r.buckets[b]) : "—"}</Masked>
                </td>
              ))}
              <td className={`${td} text-right font-semibold tabular-nums text-gray-900`}>
                <Masked>{baht(r.total)}</Masked>
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="border-t-2 border-gray-200 bg-gray-50/70">
            <tr>
              <td className={`${td} font-semibold text-gray-900`} colSpan={2}>
                {t("ar.total")}
              </td>
              {AGING_BUCKETS.map((b) => (
                <td key={b} className={`${td} text-right font-semibold tabular-nums text-gray-900`}>
                  <Masked>{baht(totals[b])}</Masked>
                </td>
              ))}
              <td className={`${td} text-right font-semibold tabular-nums text-gray-900`}>
                <Masked>{baht(grand)}</Masked>
              </td>
            </tr>
          </tfoot>
        )}
      </TableContainer>
      <p className="mt-3 text-xs text-gray-500">{t("ar.allocationNote")}</p>
    </div>
  );
}
