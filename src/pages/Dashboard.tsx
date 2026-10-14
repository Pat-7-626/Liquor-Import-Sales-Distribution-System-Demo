import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  AlertTriangle,
  Warehouse,
  FileBadge2,
  Receipt,
  TrendingUp,
  RefreshCw,
  PackageX,
  Truck,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { MiniStepper } from "../components/Stepper";
import { ActivityFeed } from "../components/ActivityFeed";
import { importFlow, salesFlow } from "../lib/flows";
import { useInvoiceStatus } from "../lib/useInvoiceStatus";
import { useRole } from "../state/RoleContext";
import { kpis } from "../data/dashboard";
import {
  computeLicenseStatus,
  computeInventoryAge,
  computeInTransitValue,
  computeAvailableForSaleValue,
  salesOrderDisplayStatus,
  isImportOverdue,
  isBookedSale,
  isReversedSale,
  orderCost,
  onTimeDeliveryRate,
  addDays,
  todayIso,
} from "../lib/business";
import { OrderItems } from "../components/OrderItems";
import { inPeriod } from "../lib/analytics";
import { formatDate } from "../lib/format";

const KPI_ICONS: Record<string, LucideIcon> = {
  leadTime: Clock,
  errorRate: AlertTriangle,
  inventoryValue: Warehouse,
  expiringLicenses: FileBadge2,
  taxCost: Receipt,
  totalSales: TrendingUp,
  turnover: RefreshCw,
  agingStock: PackageX,
  onTimeDelivery: Truck,
  outstandingCredit: CreditCard,
};

const IMPORT_ATTENTION_STATUSES = new Set(["issueDetected", "pendingApproval", "staging", "rejected"]);
const SALES_ATTENTION_STATUSES = new Set(["returned", "damaged", "pendingShipment"]);

function AttentionCard({
  title,
  to,
  isEmpty,
  children,
}: {
  title: string;
  to: string;
  isEmpty?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <Link to={to} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          {t("common.viewDetails")}
        </Link>
      </div>
      {isEmpty ? (
        <p className="py-2.5 text-sm text-gray-400">{t("erp.nothingNeedsAttention")}</p>
      ) : (
        <div className="divide-y divide-gray-100">{children}</div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { products, licenses, inventory, importOrders, salesOrders, customers, recentActivity } = useData();
  const invoiceStatus = useInvoiceStatus();
  const { canViewSensitive } = useRole();

  // BR-09/BR-02: every KPI is computed live from the data, so the dashboard never contradicts the module pages.
  const liveKpis = useMemo(() => {
    const placed = importOrders.filter((o) => o.status !== "rejected");
    const day = 24 * 60 * 60 * 1000;
    const leadTime = placed.length
      ? placed.reduce((s, o) => s + (new Date(`${o.etaDate}T00:00:00`).getTime() - new Date(`${o.orderDate}T00:00:00`).getTime()) / day, 0) / placed.length
      : 0;
    // "Error rate" = share of import orders that failed validation at intake (now or at any point since —
    // the order's own status history remembers it after the lines were corrected).
    const flagged = importOrders.filter((o) => o.status === "issueDetected" || o.statusHistory?.some((h) => h.status === "issueDetected")).length;
    const stockValue = computeAvailableForSaleValue(inventory, products);
    const kept = salesOrders.filter((o) => isBookedSale(o) && !isReversedSale(o) && inPeriod(o.orderDate, "90d"));
    const cogs90 = kept.reduce((s, o) => s + orderCost(o, products), 0);
    const live: Record<string, number> = {
      leadTime: Math.round(leadTime),
      errorRate: importOrders.length ? Math.round((flagged / importOrders.length) * 1000) / 10 : 0,
      inventoryValue: computeInTransitValue(importOrders) + stockValue,
      expiringLicenses: licenses.filter((l) => computeLicenseStatus(l.expiryDate).status !== "normal").length,
      taxCost: placed.reduce((sum, o) => sum + (o.tax?.totalTax ?? 0), 0),
      totalSales: kept.reduce((s, o) => s + o.netValue, 0),
      // Annualised: cost of goods sold in the last 90 days, scaled to a year, over stock held at cost.
      turnover: stockValue > 0 ? Math.round(((cogs90 * 365) / 90 / stockValue) * 10) / 10 : 0,
      agingStock: new Set(inventory.filter((i) => i.quantityRemaining > 0 && computeInventoryAge(i.receivedDate).ageDays > 180).map((i) => i.sku)).size,
      outstandingCredit: customers.reduce((sum, c) => sum + c.outstandingBalance, 0),
    };
    // Delivered on or before the date promised to the customer, last 90 days.
    const onTime = onTimeDeliveryRate(salesOrders, addDays(todayIso(), -90));
    if (onTime.rate !== null) live.onTimeDelivery = onTime.rate;
    return kpis.map((k) =>
      k.key in live ? { ...k, value: live[k.key], live: true, unit: k.key === "turnover" ? ("timesYear" as const) : k.unit } : k,
    );
  }, [importOrders, inventory, products, customers, licenses, salesOrders]);

  const attentionLicenses = useMemo(
    () =>
      licenses
        .map((l) => ({ ...l, ...computeLicenseStatus(l.expiryDate) }))
        .filter((l) => l.status !== "normal")
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 5),
    [licenses],
  );

  const attentionStock = useMemo(
    () =>
      inventory
        .map((i) => ({ ...i, ...computeInventoryAge(i.receivedDate) }))
        .filter((i) => i.status !== "normal")
        .sort((a, b) => b.ageDays - a.ageDays)
        .slice(0, 5),
    [inventory],
  );

  // Warehouse Officer user story: a queue of confirmed orders ready to be picked, instead of having
  // to hunt through the full Sales Orders list to find what needs a Picking List pulled.
  const readyForPicking = useMemo(
    () =>
      salesOrders
        .filter((o) => !o.approvalStatus && o.deliveryStatus === "pendingShipment")
        .slice(0, 5),
    [salesOrders],
  );

  const attentionImportOrders = useMemo(
    () =>
      importOrders
        .filter((o) => IMPORT_ATTENTION_STATUSES.has(o.status) || isImportOverdue(o))
        .slice(0, 5)
        .map((o) => ({ id: o.orderNo, status: o.status, sub: o.supplier, overdue: isImportOverdue(o) })),
    [importOrders],
  );

  const attentionSalesOrders = useMemo(
    () =>
      salesOrders
        .filter((o) => o.approvalStatus === "pendingApproval" || SALES_ATTENTION_STATUSES.has(o.deliveryStatus))
        .slice(0, 5)
        .map((o) => ({ id: o.orderNo, status: salesOrderDisplayStatus(o), sub: bi(o.customerName) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salesOrders, lang],
  );

  const attentionCustomers = useMemo(
    () =>
      customers
                .filter((c) => c.creditStatus !== "normal")
        .slice(0, 5),
    [customers],
  );

  return (
    <div>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
      />

      {/* 10 cards: 2 and 5 both divide evenly, so skip a 3-column tier that would strand one card alone. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {liveKpis.map((kpi) => (
          <StatCard key={kpi.key} kpi={kpi} icon={KPI_ICONS[kpi.key]} />
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{t("dashboard.allOrdersTitle")}</h3>
          <p className="text-xs text-gray-400">{t("dashboard.allOrdersSubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500">{t("dashboard.importByStatus")}</h4>
              <Link to="/import-orders" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                {t("common.viewDetails")}
              </Link>
            </div>
            <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
              {importOrders.map((o) => (
                <Link
                  key={o.orderNo}
                  to={`/import-orders/${o.orderNo}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{o.orderNo}</p>
                    <p className="truncate text-xs text-gray-400">{o.supplier}</p>
                  </div>
                  <MiniStepper steps={importFlow(o)} />
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500">{t("dashboard.salesByStatus")}</h4>
              <Link to="/sales-orders" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                {t("common.viewDetails")}
              </Link>
            </div>
            <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
              {salesOrders.map((o) => (
                <Link
                  key={o.orderNo}
                  to={`/sales-orders/${o.orderNo}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{o.orderNo}</p>
                    <p className="truncate text-xs text-gray-400">{bi(o.customerName)}</p>
                  </div>
                  <MiniStepper steps={salesFlow(o, invoiceStatus?.get(o.orderNo))} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AttentionCard title={t("dashboard.expiringLicensesTitle")} to="/licenses" isEmpty={attentionLicenses.length === 0}>
          {attentionLicenses.map((l) => (
            <div key={l.licenseNo} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{bi(l.holder)}</p>
                <p className="truncate text-xs text-gray-400">
                  {l.licenseNo} · {formatDate(l.expiryDate, lang)}
                </p>
              </div>
              <StatusBadge status={l.status} />
            </div>
          ))}
        </AttentionCard>

        <AttentionCard title={t("dashboard.agingStockTitle")} to="/inventory" isEmpty={attentionStock.length === 0}>
          {attentionStock.map((i) => (
            <div key={i.lotBatch} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{i.productName}</p>
                <p className="truncate text-xs text-gray-400">
                  {i.lotBatch} · {i.ageDays} {t("dashboard.days")}
                </p>
              </div>
              <StatusBadge status={i.status} />
            </div>
          ))}
        </AttentionCard>

        <AttentionCard title={t("dashboard.importOrderIssuesTitle")} to="/import-orders" isEmpty={attentionImportOrders.length === 0}>
          {attentionImportOrders.map((o) => (
            <Link
              key={o.id}
              to={`/import-orders/${o.id}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{o.id}</p>
                <p className="truncate text-xs text-gray-400">
                  {o.sub}
                  {o.overdue && <span className="ml-1.5 font-medium text-rose-500">· {t("erp.overdue")}</span>}
                </p>
              </div>
              <StatusBadge status={o.status} />
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard title={t("dashboard.salesOrderIssuesTitle")} to="/sales-orders" isEmpty={attentionSalesOrders.length === 0}>
          {attentionSalesOrders.map((o) => (
            <Link
              key={o.id}
              to={`/sales-orders/${o.id}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{o.id}</p>
                <p className="truncate text-xs text-gray-400">{o.sub}</p>
              </div>
              <StatusBadge status={o.status} />
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard title={t("customers.title")} to="/customers" isEmpty={attentionCustomers.length === 0}>
          {attentionCustomers.map((c) => (
            <Link
              key={c.customerId}
              to={`/customers/${c.customerId}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{bi(c.name)}</p>
                <p className="truncate text-xs text-gray-400">{c.customerId}</p>
              </div>
              <StatusBadge status={c.creditStatus} />
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard title={t("dashboard.readyForPickingTitle")} to="/sales-orders">
          {readyForPicking.length === 0 && <p className="py-2.5 text-sm text-gray-400">{t("dashboard.readyForPickingEmpty")}</p>}
          {readyForPicking.map((o) => (
            <Link
              key={o.orderNo}
              to={`/sales-orders/${o.orderNo}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{o.orderNo}</p>
                <p className="truncate text-xs text-gray-400">
                  <OrderItems order={o} /> · {bi(o.customerName)}
                </p>
              </div>
              <StatusBadge status={o.deliveryStatus} />
            </Link>
          ))}
        </AttentionCard>
      </div>

      {/* What the team did most recently — the full, filterable record is the Audit Trail. */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t("dashboard.recentActivity")}</h3>
          <Link to="/audit-trail" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {t("common.viewDetails")}
          </Link>
        </div>
        <ActivityFeed
          emptyLabel={t("common.noResults")}
          items={[...recentActivity]
            .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
            .slice(0, 6)
            .map((e) => ({
              id: e.id,
              at: e.timestamp,
              tone: e.action === "approved" ? "green" : e.action === "rejected" ? "red" : e.action === "payment" ? "indigo" : e.action === "created" ? "blue" : "gray",
              actor: bi(e.actor),
              title: <span className="text-xs font-medium text-gray-500">{t(`auditTrail.action.${e.action}`)}</span>,
              body: e.sensitive && !canViewSensitive ? <span className="text-gray-400">{t("erp.restrictedSummary")}</span> : bi(e.summary),
              reference: e.entityId,
              href: e.entityType === "salesOrder" ? `/sales-orders/${e.entityId}` : e.entityType === "importOrder" ? `/import-orders/${e.entityId}` : e.entityType === "customer" ? `/customers/${e.entityId}` : null,
            }))}
        />
      </div>
    </div>
  );
}
