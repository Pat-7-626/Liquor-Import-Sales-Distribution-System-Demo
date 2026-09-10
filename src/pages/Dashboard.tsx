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
import { kpis } from "../data/dashboard";
import {
  computeLicenseStatus,
  computeInventoryAge,
  computeCreditStatus,
  computeInTransitValue,
  computeAvailableForSaleValue,
  salesOrderDisplayStatus,
} from "../lib/business";
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
  children,
  className = "",
}: {
  title: string;
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <Link to={to} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          {t("common.viewDetails")}
        </Link>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { products, licenses, inventory, importOrders, salesOrders, customers } = useData();

  // BR-09/BR-02: these three KPIs are computed live from current data rather than the frozen
  // spreadsheet snapshot, so they stay consistent with the Reports page and with demo edits.
  const liveKpis = useMemo(() => {
    const inTransitValue = computeInTransitValue(importOrders);
    const availableForSaleValue = computeAvailableForSaleValue(inventory, products);
    const taxCost = importOrders.reduce((sum, o) => sum + (o.tax?.totalTax ?? 0), 0);
    const outstandingCredit = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);
    return kpis.map((k) => {
      if (k.key === "inventoryValue") return { ...k, value: inTransitValue + availableForSaleValue };
      if (k.key === "taxCost") return { ...k, value: taxCost };
      if (k.key === "outstandingCredit") return { ...k, value: outstandingCredit };
      return k;
    });
  }, [importOrders, inventory, products, customers]);

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

  const attentionOrders = useMemo(() => {
    const fromImport = importOrders
      .filter((o) => IMPORT_ATTENTION_STATUSES.has(o.status))
      .map((o) => ({ kind: "import" as const, id: o.orderNo, status: o.status, sub: o.supplier }));
    const fromSales = salesOrders
      .filter((o) => o.approvalStatus === "pendingApproval" || SALES_ATTENTION_STATUSES.has(o.deliveryStatus))
      .map((o) => ({ kind: "sales" as const, id: o.orderNo, status: salesOrderDisplayStatus(o), sub: bi(o.customerName) }));
    return [...fromImport, ...fromSales].slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importOrders, salesOrders, lang]);

  const attentionCustomers = useMemo(
    () =>
      customers
        .map((c) => ({ ...c, ...computeCreditStatus(c.creditLimit, c.outstandingBalance, c.licenseNo !== null) }))
        .filter((c) => c.creditStatus !== "normal")
        .slice(0, 5),
    [customers],
  );

  return (
    <div>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("dashboard.importByStatus")}</h4>
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
                  <StatusBadge status={o.status} />
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("dashboard.salesByStatus")}</h4>
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
                  <StatusBadge status={salesOrderDisplayStatus(o)} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AttentionCard title={t("dashboard.expiringLicensesTitle")} to="/licenses">
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

        <AttentionCard title={t("dashboard.agingStockTitle")} to="/inventory">
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

        <AttentionCard title={t("dashboard.orderIssuesTitle")} to="/import-orders">
          {attentionOrders.map((o) => (
            <Link
              key={o.id}
              to={o.kind === "import" ? `/import-orders/${o.id}` : `/sales-orders/${o.id}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{o.id}</p>
                <p className="truncate text-xs text-gray-400">
                  {o.kind === "import" ? t("common.import") : t("common.sales")} · {o.sub}
                </p>
              </div>
              <StatusBadge status={o.status} />
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard title={t("customers.title")} to="/customers">
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

        {/* 5th card in a 2-column grid — span both columns instead of leaving a gap next to it. */}
        <AttentionCard title={t("dashboard.readyForPickingTitle")} to="/sales-orders" className="lg:col-span-2">
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
                  {o.sku} × {o.quantity} · {bi(o.customerName)}
                </p>
              </div>
              <StatusBadge status={o.deliveryStatus} />
            </Link>
          ))}
        </AttentionCard>
      </div>
    </div>
  );
}
