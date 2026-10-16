import { useMemo, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { BarList, ChartCard, ColumnChart, KpiTile, Meter, PeriodFilter } from "../components/charts";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { computeLicenseStatus, isImportOverdue, todayIso } from "../lib/business";
import { SERIES, formatCompact, inPeriod, monthLabel, monthRange, sumBy, type Period } from "../lib/analytics";
import type { ImportOrderStatus } from "../data/types";
import { RecordLink } from "../components/RecordLink";

const STAGES: ImportOrderStatus[] = ["staging", "issueDetected", "pendingApproval", "approved", "customsCleared", "receivedWarehouse", "rejected"];
const OPEN = new Set<ImportOrderStatus>(["staging", "issueDetected", "pendingApproval", "approved", "customsCleared"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export default function PurchasingOverview() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { importOrders, suppliers, licenses } = useData();
  const [period, setPeriod] = useState<Period>("all");
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;

  const inRange = useMemo(() => importOrders.filter((o) => inPeriod(o.orderDate, period)), [importOrders, period]);
  const live = inRange.filter((o) => o.status !== "rejected");
  // Open-pipeline KPIs are a snapshot of today, regardless of period.
  const open = importOrders.filter((o) => OPEN.has(o.status));
  const awaiting = importOrders.filter((o) => o.status === "staging" || o.status === "pendingApproval");
  const issues = importOrders.filter((o) => o.status === "issueDetected");
  const overdue = importOrders.filter(isImportOverdue);
  const inboundUnits = importOrders
    .filter((o) => o.status === "approved" || o.status === "customsCleared")
    .reduce((s, o) => s + (o.lineItems ?? []).reduce((a, l) => a + l.qty, 0), 0);

  const months = monthRange(live.map((o) => o.orderDate));
  const byMonth = sumBy(live, (o) => o.orderDate.slice(0, 7), (o) => o.totalValue);

  const stageCounts = STAGES.map((st) => {
    const orders = inRange.filter((o) => o.status === st);
    return { st, count: orders.length, value: orders.reduce((s, o) => s + o.totalValue, 0) };
  });

  const bySupplier = [...sumBy(live, (o) => o.supplierId ?? o.supplier, (o) => o.totalValue).entries()].sort((a, b) => b[1] - a[1]);
  const supplierName = (id: string) => suppliers.find((s) => s.supplierId === id)?.name ?? id;
  const byCountry = [...sumBy(live, (o) => o.country, (o) => o.totalValue).entries()].sort((a, b) => b[1] - a[1]);

  const today = todayIso();
  const arrivals = importOrders
    .filter((o) => o.status === "approved" || o.status === "customsCleared" || o.status === "pendingApproval" || o.status === "staging")
    .sort((a, b) => a.etaDate.localeCompare(b.etaDate))
    .slice(0, 6);
  const daysFromToday = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / DAY_MS);

  const importLicenses = licenses
    .filter((l) => l.category === "import")
    .map((l) => {
      const term = new Date(`${l.expiryDate}T00:00:00`).getTime() - new Date(`${l.issueDate}T00:00:00`).getTime();
      const used = new Date(`${today}T00:00:00`).getTime() - new Date(`${l.issueDate}T00:00:00`).getTime();
      return { l, ratio: term > 0 ? used / term : 1, ...computeLicenseStatus(l.expiryDate) };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.purchasing")} title={t("viz.purchasing.title")} subtitle={t("viz.purchasing.subtitle")} />
      <PeriodFilter value={period} onChange={setPeriod} note={t("viz.periodNote")} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={t("viz.purchasing.openOrders")} value={formatNumber(open.length, lang, 0)} hint={t("viz.asOfToday")} to="/import-orders" />
        <KpiTile label={t("viz.purchasing.openValue")} value={baht(open.reduce((s, o) => s + o.totalValue, 0))} sensitive hint={t("viz.asOfToday")} />
        <KpiTile label={t("viz.awaitingApproval")} value={formatNumber(awaiting.length, lang, 0)} tone={awaiting.length ? "warning" : "default"} to="/approvals" />
        <KpiTile label={t("viz.purchasing.issues")} value={formatNumber(issues.length, lang, 0)} tone={issues.length ? "critical" : "good"} hint={t("viz.purchasing.issuesHint")} to="/approvals" />
        <KpiTile label={t("viz.purchasing.overdue")} value={formatNumber(overdue.length, lang, 0)} tone={overdue.length ? "critical" : "good"} hint={t("viz.purchasing.overdueHint")} to="/goods-receipts" />
        <KpiTile label={t("erp.inbound")} value={formatNumber(inboundUnits, lang, 0)} hint={t("viz.purchasing.inboundHint")} to="/goods-receipts" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          wide
          sensitive
          title={t("viz.purchasing.byMonth")}
          subtitle={t("viz.purchasing.byMonthSub")}
          table={{ columns: [t("viz.month"), t("importOrders.col.totalValue")], rows: months.map((m) => [monthLabel(m, lang), baht(byMonth.get(m) ?? 0)]) }}
        >
          <ColumnChart
            categories={months.map((m) => ({ key: m, label: monthLabel(m, lang) }))}
            series={[{ key: "v", label: t("importOrders.col.totalValue"), color: SERIES[0] }]}
            values={Object.fromEntries(months.map((m) => [m, { v: byMonth.get(m) ?? 0 }]))}
            format={baht}
            formatTick={(n) => `฿${formatCompact(n, lang)}`}
          />
        </ChartCard>

        <ChartCard
          title={t("viz.purchasing.pipeline")}
          subtitle={t("viz.purchasing.pipelineSub")}
          table={{ columns: [t("common.status"), t("viz.orders")], rows: stageCounts.map((s) => [t(`status.${s.st}`), s.count]) }}
        >
          <BarList
            items={stageCounts.map((s) => ({
              key: s.st,
              label: t(`status.${s.st}`),
              value: s.count,
              display: formatNumber(s.count, lang, 0),
              href: "/import-orders",
              // The orders that need someone to act are the story.
              emphasized: s.st === "issueDetected" || s.st === "pendingApproval" || s.st === "staging",
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t("viz.purchasing.arrivals")}
          subtitle={t("viz.purchasing.arrivalsSub")}
          table={{
            columns: [t("importOrders.col.orderNo"), t("importOrders.col.supplier"), t("importOrders.col.etaDate"), t("common.status")],
            rows: arrivals.map((o) => [o.orderNo, o.supplier, o.etaDate, t(`status.${o.status}`)]),
          }}
        >
          {arrivals.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("viz.noData")}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {arrivals.map((o) => {
                const d = daysFromToday(o.etaDate);
                return (
                  <li key={o.orderNo} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <RecordLink to={`/import-orders/${o.orderNo}`} className="text-sm">
                        {o.orderNo}
                      </RecordLink>
                      <p className="truncate text-xs text-gray-500">
                        {o.supplier} · {formatDate(o.etaDate, lang)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={o.status} />
                      <span className={`text-xs font-medium ${d < 0 ? "text-rose-700" : d <= 7 ? "text-amber-700" : "text-gray-500"}`}>
                        {d < 0 ? t("viz.daysLate").replace("{n}", String(-d)) : d === 0 ? t("viz.today") : t("viz.inDays").replace("{n}", String(d))}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.purchasing.bySupplier")}
          table={{ columns: [t("importOrders.col.supplier"), t("importOrders.col.totalValue")], rows: bySupplier.map(([id, v]) => [supplierName(id), baht(v)]) }}
        >
          <BarList
            items={bySupplier.slice(0, 6).map(([id, v]) => ({
              key: id,
              label: supplierName(id),
              value: v,
              display: `฿${formatCompact(v, lang)}`,
              href: `/import-orders?q=${encodeURIComponent(supplierName(id))}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.purchasing.byCountry")}
          table={{ columns: [t("importOrders.col.country"), t("importOrders.col.totalValue")], rows: byCountry.map(([c, v]) => [t(`lookup.country.${c}`), baht(v)]) }}
        >
          <BarList
            items={byCountry.map(([c, v]) => ({ key: c, label: t(`lookup.country.${c}`), value: v, display: `฿${formatCompact(v, lang)}` }))}
          />
        </ChartCard>

        <ChartCard
          wide
          title={t("viz.purchasing.licenses")}
          subtitle={t("viz.purchasing.licensesSub")}
          table={{
            columns: [t("licenses.col.licenseNo"), t("licenses.col.type"), t("licenses.col.expiryDate"), t("licenses.col.daysRemaining")],
            rows: importLicenses.map(({ l, daysRemaining }) => [l.licenseNo, bi(l.type), l.expiryDate, daysRemaining]),
          }}
        >
          {importLicenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("viz.noData")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {importLicenses.map(({ l, ratio, daysRemaining, status }) => (
                <Meter
                  key={l.licenseNo}
                  label={`${l.licenseNo} · ${bi(l.type)}`}
                  href="/licenses"
                  ratio={ratio}
                  warnAt={0.9}
                  display={daysRemaining < 0 ? t("viz.expiredAgo").replace("{n}", String(-daysRemaining)) : t("viz.daysLeft").replace("{n}", String(daysRemaining))}
                  badge={<StatusBadge status={status} />}
                />
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
