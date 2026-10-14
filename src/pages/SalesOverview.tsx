import { useMemo, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { Masked } from "../components/Masked";
import { StatusBadge } from "../components/StatusBadge";
import { BarList, ChartCard, ColumnChart, KpiTile, Meter, PeriodFilter, StackedBar } from "../components/charts";
import { formatCurrency, formatNumber } from "../lib/format";
import { isBookedSale, isReversedSale, SALES_CHANNEL_OPTIONS, DELIVERY_STATUS_OPTIONS, orderCost, revenueExVat } from "../lib/business";
import { SERIES, formatCompact, formatPercent, inPeriod, monthLabel, monthRange, sumBy, type Period } from "../lib/analytics";

export default function SalesOverview() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { salesOrders, customers, products } = useData();
  const [period, setPeriod] = useState<Period>("all");
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;
  const bahtTick = (n: number) => `฿${formatCompact(n, lang)}`;

  const inRange = useMemo(() => salesOrders.filter((o) => inPeriod(o.orderDate, period)), [salesOrders, period]);
  const booked = inRange.filter(isBookedSale);
  const kept = booked.filter((o) => !isReversedSale(o));
  const reversed = booked.filter(isReversedSale);
  const pending = salesOrders.filter((o) => o.approvalStatus === "pendingApproval");

  const netSales = kept.reduce((s, o) => s + o.netValue, 0);
  const cost = kept.reduce((s, o) => s + orderCost(o, products), 0);
  // Margin on sales excluding VAT (what the business keeps) against the landed cost of the lots sold.
  const exVat = kept.reduce((s, o) => s + revenueExVat(o), 0);
  const margin = exVat > 0 ? (exVat - cost) / exVat : 0;
  const bookedValue = booked.reduce((s, o) => s + o.netValue, 0);
  const returnRate = bookedValue > 0 ? reversed.reduce((s, o) => s + o.netValue, 0) / bookedValue : 0;
  const receivables = customers.reduce((s, c) => s + c.outstandingBalance, 0);

  const months = monthRange(kept.map((o) => o.orderDate));
  const byMonth = sumBy(kept, (o) => o.orderDate.slice(0, 7), (o) => o.netValue);

  const byChannel = sumBy(kept, (o) => o.channelType ?? customers.find((c) => c.customerId === o.customerId)?.channelType ?? "distributor", (o) => o.netValue);
  const channelSegments = SALES_CHANNEL_OPTIONS.map((ch, i) => ({ key: ch, label: t(`lookup.channel.${ch}`), value: byChannel.get(ch) ?? 0, color: SERIES[i] }));

  const bySku = [...sumBy(kept.flatMap((o) => o.lines), (l) => l.sku, (l) => l.netValue).entries()].sort((a, b) => b[1] - a[1]);
  const byCustomer = [...sumBy(kept, (o) => o.customerId, (o) => o.netValue).entries()].sort((a, b) => b[1] - a[1]);
  const customerName = (id: string) => {
    const c = customers.find((x) => x.customerId === id);
    return c ? bi(c.name) : id;
  };

  const delivery = DELIVERY_STATUS_OPTIONS.map((st) => ({ st, count: booked.filter((o) => o.deliveryStatus === st).length }));

  const credit = customers
    .map((c) => ({ c, ratio: c.creditLimit > 0 ? c.outstandingBalance / c.creditLimit : c.outstandingBalance > 0 ? 1 : 0, status: c.creditStatus }))
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.sales")} title={t("viz.sales.title")} subtitle={t("viz.sales.subtitle")} />
      <PeriodFilter value={period} onChange={setPeriod} note={t("viz.periodNote")} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={t("erp.netSales")} value={baht(netSales)} sensitive hint={`${kept.length} ${t("viz.orders")}`} />
        <KpiTile label={t("erp.grossMargin")} value={formatPercent(margin, lang, 1)} sensitive hint={<Masked>{baht(exVat - cost)}</Masked>} />
        <KpiTile label={t("viz.avgOrder")} value={baht(kept.length ? netSales / kept.length : 0)} sensitive />
        <KpiTile label={t("viz.receivables")} value={baht(receivables)} sensitive hint={t("viz.asOfToday")} to="/receipts" />
        <KpiTile
          label={t("viz.awaitingApproval")}
          value={formatNumber(pending.length, lang, 0)}
          tone={pending.length > 0 ? "warning" : "default"}
          hint={t("viz.ordersHeld")}
          to="/approvals"
        />
        <KpiTile label={t("viz.returnRate")} value={formatPercent(returnRate, lang, 1)} tone={returnRate > 0.05 ? "warning" : "default"} hint={`${reversed.length} ${t("viz.orders")}`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          wide
          sensitive
          title={t("viz.sales.byMonth")}
          subtitle={t("viz.sales.byMonthSub")}
          table={{ columns: [t("viz.month"), t("erp.netSales")], rows: months.map((m) => [monthLabel(m, lang), baht(byMonth.get(m) ?? 0)]) }}
        >
          <ColumnChart
            categories={months.map((m) => ({ key: m, label: monthLabel(m, lang) }))}
            series={[{ key: "net", label: t("erp.netSales"), color: SERIES[0] }]}
            values={Object.fromEntries(months.map((m) => [m, { net: byMonth.get(m) ?? 0 }]))}
            format={baht}
            formatTick={bahtTick}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.sales.byChannel")}
          subtitle={t("viz.sales.byChannelSub")}
          table={{ columns: [t("customers.col.channelType"), t("erp.netSales")], rows: channelSegments.map((s) => [s.label, baht(s.value)]) }}
        >
          <StackedBar segments={channelSegments} format={baht} />
        </ChartCard>

        <ChartCard
          title={t("viz.sales.delivery")}
          subtitle={t("viz.sales.deliverySub")}
          table={{ columns: [t("common.status"), t("viz.orders")], rows: delivery.map((d) => [t(`status.${d.st}`), d.count]) }}
        >
          <BarList
            items={delivery.map((d) => ({
              key: d.st,
              label: t(`status.${d.st}`),
              value: d.count,
              display: formatNumber(d.count, lang, 0),
              href: "/sales-orders",
            }))}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.sales.topProducts")}
          table={{ columns: [t("products.col.name"), t("erp.netSales")], rows: bySku.map(([sku, v]) => [products.find((p) => p.sku === sku)?.name ?? sku, baht(v)]) }}
        >
          <BarList
            items={bySku.slice(0, 6).map(([sku, v]) => ({
              key: sku,
              label: products.find((p) => p.sku === sku)?.name ?? sku,
              sublabel: sku,
              value: v,
              display: `฿${formatCompact(v, lang)}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          sensitive
          title={t("viz.sales.topCustomers")}
          table={{ columns: [t("salesOrders.col.customerName"), t("erp.netSales")], rows: byCustomer.map(([id, v]) => [customerName(id), baht(v)]) }}
        >
          <BarList
            items={byCustomer.slice(0, 6).map(([id, v]) => ({
              key: id,
              label: customerName(id),
              value: v,
              display: `฿${formatCompact(v, lang)}`,
              href: `/customers/${id}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          wide
          sensitive
          title={t("viz.sales.credit")}
          subtitle={t("viz.sales.creditSub")}
          table={{
            columns: [t("salesOrders.col.customerName"), t("customers.col.outstandingBalance"), t("customers.col.creditLimit"), t("viz.used")],
            rows: credit.map(({ c, ratio }) => [bi(c.name), baht(c.outstandingBalance), baht(c.creditLimit), formatPercent(ratio, lang)]),
          }}
        >
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {credit.map(({ c, ratio, status }) => (
              <Meter
                key={c.customerId}
                label={bi(c.name)}
                href={`/customers/${c.customerId}`}
                ratio={ratio}
                warnAt={0.9}
                display={`${formatPercent(ratio, lang)} · ฿${formatCompact(c.outstandingBalance, lang)} / ${formatCompact(c.creditLimit, lang)}`}
                badge={status !== "normal" ? <StatusBadge status={status} /> : undefined}
              />
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
