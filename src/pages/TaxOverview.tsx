import { useMemo, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { BarList, ChartCard, ColumnChart, KpiTile, PeriodFilter, StackedBar } from "../components/charts";
import { formatCurrency, formatNumber } from "../lib/format";
import { isBookedSale, isReversedSale, splitVat } from "../lib/business";
import { SERIES, formatCompact, formatPercent, inPeriod, monthLabel, monthRange, sumBy, type Period } from "../lib/analytics";

export default function TaxOverview() {
  const { t, lang } = useLanguage();
  const { importOrders, salesOrders, suppliers, taxSettings } = useData();
  const [period, setPeriod] = useState<Period>("all");
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;
  const bahtTick = (n: number) => `฿${formatCompact(n, lang)}`;

  // Tax is owed on orders that actually go ahead — rejected orders are excluded.
  const orders = useMemo(
    () => importOrders.filter((o) => o.tax && o.status !== "rejected" && inPeriod(o.orderDate, period)),
    [importOrders, period],
  );
  const sum = (k: "importDuty" | "exciseTax" | "vat" | "totalTax") => orders.reduce((s, o) => s + (o.tax?.[k] ?? 0), 0);
  const duty = sum("importDuty");
  // Interior Ministry tax and fund levies are collected with the excise; counted with it so the parts add up.
  const excise = orders.reduce((s, o) => s + (o.tax?.exciseTax ?? 0) + (o.tax?.localTax ?? 0) + (o.tax?.funds ?? 0), 0);
  const vat = sum("vat");
  const total = sum("totalTax");
  const importValue = orders.reduce((s, o) => s + o.totalValue, 0);
  const stamps = orders.reduce((s, o) => s + (o.tax?.exciseStampCount ?? 0), 0);

  const COMPONENTS = [
    { key: "importDuty", label: t("importOrderDetail.importDuty"), color: SERIES[0] },
    { key: "exciseTax", label: t("erp.exciseAll"), color: SERIES[1] },
    { key: "vat", label: t("importOrderDetail.vat"), color: SERIES[2] },
  ] as const;

  const sales = salesOrders.filter((o) => isBookedSale(o) && !isReversedSale(o) && inPeriod(o.orderDate, period));
  const months = monthRange([...orders.map((o) => o.orderDate), ...sales.map((o) => o.orderDate)]);
  const taxByMonth = Object.fromEntries(
    months.map((m) => {
      const inMonth = orders.filter((o) => o.orderDate.startsWith(m));
      return [m, Object.fromEntries(COMPONENTS.map((c) => [c.key, inMonth.reduce((s, o) => s + (o.tax?.[c.key] ?? 0), 0)]))];
    }),
  );
  // Output VAT (charged on sales, prices are VAT-inclusive) vs input VAT (paid on imports) — same unit, one axis.
  const outputVat = sumBy(sales, (o) => o.orderDate.slice(0, 7), (o) => splitVat(o.netValue, o.vatPercent ?? taxSettings.vatPercent).vat);
  const inputVat = sumBy(orders, (o) => o.orderDate.slice(0, 7), (o) => o.tax?.vat ?? 0);

  const byCountry = [...sumBy(orders, (o) => o.country, (o) => o.tax?.totalTax ?? 0).entries()].sort((a, b) => b[1] - a[1]);
  const bySupplier = [...sumBy(orders, (o) => o.supplierId ?? o.supplier, (o) => o.tax?.totalTax ?? 0).entries()].sort((a, b) => b[1] - a[1]);
  const supplierName = (id: string) => suppliers.find((s) => s.supplierId === id)?.name ?? id;

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.tax")} title={t("viz.tax.title")} subtitle={t("viz.tax.subtitle")} />
      <PeriodFilter value={period} onChange={setPeriod} note={t("viz.tax.periodNote")} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={t("importOrderDetail.totalTax")} value={baht(total)} sensitive hint={`${orders.length} ${t("viz.importOrders")}`} />
        <KpiTile label={t("importOrderDetail.importDuty")} value={baht(duty)} sensitive />
        <KpiTile label={t("erp.exciseAll")} value={baht(excise)} sensitive />
        <KpiTile label={t("importOrderDetail.vat")} value={baht(vat)} sensitive />
        <KpiTile label={t("viz.tax.effectiveRate")} value={formatPercent(importValue ? total / importValue : 0, lang, 1)} sensitive hint={t("viz.tax.effectiveRateHint")} />
        <KpiTile label={t("importOrderDetail.exciseStampCount")} value={formatNumber(stamps, lang, 0)} hint={t("viz.tax.stampsHint")} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          wide
          sensitive
          title={t("viz.tax.byMonth")}
          subtitle={t("viz.tax.byMonthSub")}
          table={{
            columns: [t("viz.month"), ...COMPONENTS.map((c) => c.label), t("viz.total")],
            rows: months.map((m) => [
              monthLabel(m, lang),
              ...COMPONENTS.map((c) => baht(taxByMonth[m][c.key])),
              baht(COMPONENTS.reduce((s, c) => s + taxByMonth[m][c.key], 0)),
            ]),
          }}
        >
          <ColumnChart
            categories={months.map((m) => ({ key: m, label: monthLabel(m, lang) }))}
            series={COMPONENTS.map((c) => ({ key: c.key, label: c.label, color: c.color }))}
            values={taxByMonth}
            format={baht}
            formatTick={bahtTick}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.tax.mix")}
          subtitle={t("viz.tax.mixSub")}
          table={{ columns: [t("viz.tax.component"), t("erp.amount")], rows: COMPONENTS.map((c) => [c.label, baht(c.key === "importDuty" ? duty : c.key === "exciseTax" ? excise : vat)]) }}
        >
          <StackedBar
            segments={COMPONENTS.map((c) => ({ key: c.key, label: c.label, color: c.color, value: c.key === "importDuty" ? duty : c.key === "exciseTax" ? excise : vat }))}
            format={baht}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.tax.vatPosition")}
          subtitle={t("viz.tax.vatPositionSub")}
          table={{
            columns: [t("viz.month"), t("viz.tax.outputVat"), t("viz.tax.inputVat")],
            rows: months.map((m) => [monthLabel(m, lang), baht(outputVat.get(m) ?? 0), baht(inputVat.get(m) ?? 0)]),
          }}
        >
          <ColumnChart
            grouped
            height={180}
            categories={months.map((m) => ({ key: m, label: monthLabel(m, lang) }))}
            series={[
              { key: "out", label: t("viz.tax.outputVat"), color: SERIES[0] },
              { key: "in", label: t("viz.tax.inputVat"), color: SERIES[2] },
            ]}
            values={Object.fromEntries(months.map((m) => [m, { out: outputVat.get(m) ?? 0, in: inputVat.get(m) ?? 0 }]))}
            format={baht}
            formatTick={bahtTick}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.tax.byCountry")}
          table={{ columns: [t("importOrders.col.country"), t("importOrderDetail.totalTax")], rows: byCountry.map(([c, v]) => [t(`lookup.country.${c}`), baht(v)]) }}
        >
          <BarList items={byCountry.map(([c, v]) => ({ key: c, label: t(`lookup.country.${c}`), value: v, display: `฿${formatCompact(v, lang)}` }))} />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.tax.bySupplier")}
          table={{ columns: [t("importOrders.col.supplier"), t("importOrderDetail.totalTax")], rows: bySupplier.map(([id, v]) => [supplierName(id), baht(v)]) }}
        >
          <BarList
            items={bySupplier.slice(0, 6).map(([id, v]) => ({ key: id, label: supplierName(id), value: v, display: `฿${formatCompact(v, lang)}` }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
