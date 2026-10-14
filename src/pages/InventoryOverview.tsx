import { useMemo, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { Masked } from "../components/Masked";
import { StatusBadge } from "../components/StatusBadge";
import { BarList, ChartCard, ColumnChart, KpiTile, Meter, PeriodFilter, PositionBars } from "../components/charts";
import { formatCurrency, formatNumber } from "../lib/format";
import { computeInboundBySku, computeInventoryAge } from "../lib/business";
import { SERIES, formatCompact, formatPercent, monthLabel, monthRange, periodStart, sumBy, type Period } from "../lib/analytics";
import { query, useApi } from "../lib/useApi";

const AGE_BANDS = [
  { key: "0-30", max: 30 },
  { key: "31-90", max: 90 },
  { key: "91-180", max: 180 },
  { key: "180+", max: Infinity },
];

export default function InventoryOverview() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { products, inventory, warehouses, reorderPolicies, importOrders } = useData();
  const [period, setPeriod] = useState<Period>("all");
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;
  const units = (n: number) => formatNumber(n, lang, 0);

  const costOf = (sku: string) => products.find((p) => p.sku === sku)?.costPrice ?? 0;
  const lots = inventory.filter((i) => i.quantityRemaining > 0).map((i) => ({ ...i, ...computeInventoryAge(i.receivedDate), value: i.quantityRemaining * costOf(i.sku) }));
  const stockValue = lots.reduce((s, l) => s + l.value, 0);
  const unitsOnHand = lots.reduce((s, l) => s + l.quantityRemaining, 0);
  const agingValue = lots.filter((l) => l.ageDays > 180).reduce((s, l) => s + l.value, 0);
  const outOfStock = products.filter((p) => p.stockAvailable <= 0);

  const inbound = useMemo(() => computeInboundBySku(importOrders), [importOrders]);
  const positions = products
    .map((p) => {
      const policy = reorderPolicies.find((r) => r.sku === p.sku);
      const inb = inbound.get(p.sku) ?? 0;
      return { p, policy, inb, cover: policy && policy.reorderPoint > 0 ? (p.stockAvailable + inb) / policy.reorderPoint : Infinity };
    })
    .sort((a, b) => a.cover - b.cover);
  const atReorder = positions.filter((x) => x.policy && x.p.stockAvailable + x.inb <= x.policy.reorderPoint);

  const byCategory = [...sumBy(lots, (l) => products.find((p) => p.sku === l.sku)?.category ?? "whisky", (l) => l.value).entries()].sort((a, b) => b[1] - a[1]);

  const ageBands = AGE_BANDS.map((band, i) => {
    const min = i === 0 ? 0 : AGE_BANDS[i - 1].max + 1;
    const inBand = lots.filter((l) => l.ageDays >= min && l.ageDays <= band.max);
    return { ...band, units: inBand.reduce((s, l) => s + l.quantityRemaining, 0), value: inBand.reduce((s, l) => s + l.value, 0) };
  });

  const whRows = warehouses
    .filter((w) => w.active)
    .map((w) => ({ w, units: lots.filter((l) => l.warehouse === w.code).reduce((s, l) => s + l.quantityRemaining, 0) }));

  // Units in and out per month, totalled on the server (the stock ledger isn't sent to the browser).
  const flows = useApi<{ month: string; unitsIn: number; unitsOut: number }[]>(query("/api/stock-movements/monthly", { from: periodStart(period) })).data ?? [];
  const months = monthRange(flows.map((f) => `${f.month}-01`));
  const inByMonth = new Map(flows.map((f) => [f.month, f.unitsIn]));
  const outByMonth = new Map(flows.map((f) => [f.month, f.unitsOut]));

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.inventory")} title={t("viz.inventory.title")} subtitle={t("viz.inventory.subtitle")} />
      <PeriodFilter value={period} onChange={setPeriod} note={t("viz.inventory.periodNote")} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={t("viz.inventory.stockValue")} value={baht(stockValue)} sensitive hint={t("viz.atCost")} />
        <KpiTile label={t("viz.inventory.units")} value={units(unitsOnHand)} hint={`${lots.length} ${t("reports.colLots").toLowerCase()}`} to="/inventory" />
        <KpiTile label={t("erp.belowReorderPoint")} value={units(atReorder.length)} tone={atReorder.length ? "warning" : "good"} to="/stock-alerts" />
        <KpiTile label={t("viz.inventory.outOfStock")} value={units(outOfStock.length)} tone={outOfStock.length ? "critical" : "good"} hint={outOfStock.map((p) => p.sku).join(", ") || undefined} />
        <KpiTile label={t("viz.inventory.agingValue")} value={baht(agingValue)} sensitive tone={agingValue > 0 ? "warning" : "default"} hint={<Masked>{formatPercent(stockValue ? agingValue / stockValue : 0, lang, 1)}</Masked>} />
        <KpiTile label={t("nav.warehouses")} value={units(whRows.length)} hint={formatPercent(whRows.reduce((s, r) => s + r.units, 0) / Math.max(1, whRows.reduce((s, r) => s + r.w.capacity, 0)), lang) + " " + t("viz.full")} to="/warehouses" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          wide
          title={t("viz.inventory.position")}
          subtitle={t("viz.inventory.positionSub")}
          table={{
            columns: [t("products.col.sku"), t("products.col.stockAvailable"), t("erp.inbound"), t("erp.reorderPoint")],
            rows: positions.map((x) => [`${x.p.sku} · ${x.p.name}`, x.p.stockAvailable, x.inb, x.policy?.reorderPoint ?? "—"]),
          }}
        >
          <PositionBars
            legend={[
              { label: t("products.col.stockAvailable"), color: SERIES[0] },
              { label: t("erp.inbound"), color: SERIES[1] },
            ]}
            markerLabel={t("erp.reorderPoint")}
            items={positions.map((x) => ({
              key: x.p.sku,
              label: x.p.name,
              href: "/stock-alerts",
              parts: [
                { label: t("products.col.stockAvailable"), value: x.p.stockAvailable, color: SERIES[0] },
                { label: t("erp.inbound"), value: x.inb, color: SERIES[1] },
              ],
              marker: x.policy ? { label: t("erp.reorderPoint"), value: x.policy.reorderPoint } : undefined,
              badge: x.p.status !== "available" ? <StatusBadge status={x.p.status} /> : undefined,
              display: x.inb > 0 ? `${units(x.p.stockAvailable)} + ${units(x.inb)}` : units(x.p.stockAvailable),
            }))}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.inventory.byCategory")}
          table={{ columns: [t("products.col.category"), t("reports.colStockValue")], rows: byCategory.map(([c, v]) => [t(`lookup.category.${c}`), baht(v)]) }}
        >
          <BarList items={byCategory.map(([c, v]) => ({ key: c, label: t(`lookup.category.${c}`), value: v, display: `฿${formatCompact(v, lang)}` }))} />
        </ChartCard>

        <ChartCard
          title={t("viz.inventory.age")}
          subtitle={t("viz.inventory.ageSub")}
          table={{ columns: [t("viz.inventory.ageBand"), t("viz.inventory.units")], rows: ageBands.map((b) => [t(`viz.inventory.band.${b.key}`), b.units]) }}
        >
          <BarList
            items={ageBands.map((b) => ({
              key: b.key,
              label: t(`viz.inventory.band.${b.key}`),
              value: b.units,
              display: units(b.units),
              // Long-aged stock is the story; younger bands are context.
              emphasized: b.key === "180+",
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t("viz.inventory.warehouses")}
          table={{
            columns: [t("inventory.col.warehouse"), t("viz.inventory.units"), t("erp.capacity")],
            rows: whRows.map((r) => [bi(r.w.name), r.units, r.w.capacity]),
          }}
        >
          <div className="space-y-4">
            {whRows.map((r) => (
              <Meter
                key={r.w.code}
                label={bi(r.w.name)}
                href={`/inventory?warehouse=${encodeURIComponent(r.w.code)}`}
                ratio={r.units / r.w.capacity}
                warnAt={0.8}
                criticalAt={0.95}
                display={`${formatPercent(r.units / r.w.capacity, lang)} · ${units(r.units)} / ${units(r.w.capacity)}`}
              />
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title={t("viz.inventory.flow")}
          subtitle={t("viz.inventory.flowSub")}
          table={{
            columns: [t("viz.month"), t("erp.totalIn"), t("erp.totalOut")],
            rows: months.map((m) => [monthLabel(m, lang), inByMonth.get(m) ?? 0, outByMonth.get(m) ?? 0]),
          }}
        >
          <ColumnChart
            grouped
            categories={months.map((m) => ({ key: m, label: monthLabel(m, lang) }))}
            series={[
              { key: "in", label: t("erp.totalIn"), color: SERIES[2] },
              { key: "out", label: t("erp.totalOut"), color: SERIES[0] },
            ]}
            values={Object.fromEntries(months.map((m) => [m, { in: inByMonth.get(m) ?? 0, out: outByMonth.get(m) ?? 0 }]))}
            format={units}
            formatTick={(n) => formatCompact(n, lang)}
          />
        </ChartCard>
      </div>
    </div>
  );
}
