import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { Masked } from "../components/Masked";
import { formatCurrency, maskIfRestricted } from "../lib/format";
import { exportToExcel, exportToPdf } from "../lib/export";
import { computeInventoryAge, computeInTransitValue, computeAvailableForSaleValue } from "../lib/business";
import type { ChannelCode } from "../data/types";

const PIPELINE_ACTIVE_STATUSES = new Set(["staging", "pendingApproval", "approved", "customsCleared", "issueDetected"]);

interface ExportSectionProps {
  title: string;
  onExport: () => void;
  children: React.ReactNode;
}

function ReportSection({ title, onExport, children }: ExportSectionProps) {
  const { t } = useLanguage();
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <button
          onClick={onExport}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          {t("common.export")}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function Reports() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive } = useRole();
  const { salesOrders: allSalesOrders, customers, products, inventory, importOrders, auditLog } = useData();
  // FR-22/FR-25: exclude sales orders still awaiting/failed supervisor approval — they aren't booked yet
  // (no stock or credit impact), so counting them in Sales reports would overstate real activity.
  const salesOrders = useMemo(() => allSalesOrders.filter((o) => !o.approvalStatus), [allSalesOrders]);

  const bySku = useMemo(() => {
    const map = new Map<string, { sku: string; productName: string; orders: number; qty: number; netValue: number }>();
    for (const o of salesOrders) {
      const product = products.find((p) => p.sku === o.sku);
      const entry = map.get(o.sku) ?? { sku: o.sku, productName: product?.name ?? o.sku, orders: 0, qty: 0, netValue: 0 };
      entry.orders += 1;
      entry.qty += o.quantity;
      entry.netValue += o.netValue;
      map.set(o.sku, entry);
    }
    return [...map.values()].sort((a, b) => b.netValue - a.netValue);
  }, [salesOrders, products]);

  const byChannel = useMemo(() => {
    const map = new Map<ChannelCode, { channel: ChannelCode; orders: number; netValue: number; discountSum: number }>();
    for (const o of salesOrders) {
      const customer = customers.find((c) => bi(c.name) === bi(o.customerName));
      const channel = o.channelType ?? customer?.channelType ?? "distributor";
      const entry = map.get(channel) ?? { channel, orders: 0, netValue: 0, discountSum: 0 };
      entry.orders += 1;
      entry.netValue += o.netValue;
      entry.discountSum += o.discountPercent;
      map.set(channel, entry);
    }
    return [...map.values()].sort((a, b) => b.netValue - a.netValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrders, customers, lang]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, { name: string; customerId: string | null; orders: number; netValue: number; outstanding: number }>();
    for (const o of salesOrders) {
      const name = bi(o.customerName);
      const customer = customers.find((c) => bi(c.name) === name);
      const entry = map.get(name) ?? { name, customerId: customer?.customerId ?? null, orders: 0, netValue: 0, outstanding: customer?.outstandingBalance ?? 0 };
      entry.orders += 1;
      entry.netValue += o.netValue;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.netValue - a.netValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrders, customers, lang]);

  const byPipelineStatus = useMemo(() => {
    const inTransitOrders = importOrders.filter((o) => PIPELINE_ACTIVE_STATUSES.has(o.status));
    const inTransitValue = computeInTransitValue(importOrders);
    const availableValue = computeAvailableForSaleValue(inventory, products);
    return [
      { key: "inTransit" as const, count: inTransitOrders.length, value: inTransitValue },
      { key: "available" as const, count: inventory.length, value: availableValue },
    ];
  }, [importOrders, inventory, products]);

  const byInventoryStatus = useMemo(() => {
    const map = new Map<string, { status: string; lots: number; qty: number; value: number }>();
    for (const i of inventory) {
      const { status } = computeInventoryAge(i.receivedDate);
      const product = products.find((p) => p.sku === i.sku);
      const entry = map.get(status) ?? { status, lots: 0, qty: 0, value: 0 };
      entry.lots += 1;
      entry.qty += i.quantityRemaining;
      entry.value += i.quantityRemaining * (product?.costPrice ?? 0);
      map.set(status, entry);
    }
    return [...map.values()];
  }, [inventory, products]);

  /** Tax Officer user story: monthly tax/sales reconciliation. Sales Orders have no date field of their
   *  own, so each order's month is taken from its real "created" audit entry rather than invented. */
  const byMonth = useMemo(() => {
    type Row = { month: string; salesNetValue: number; importDuty: number; exciseTax: number; vat: number; totalTax: number };
    const map = new Map<string, Row>();
    const get = (month: string) => {
      const existing = map.get(month);
      if (existing) return existing;
      const fresh: Row = { month, salesNetValue: 0, importDuty: 0, exciseTax: 0, vat: 0, totalTax: 0 };
      map.set(month, fresh);
      return fresh;
    };

    for (const o of importOrders) {
      if (!o.tax) continue;
      const row = get(o.orderDate.slice(0, 7));
      row.importDuty += o.tax.importDuty;
      row.exciseTax += o.tax.exciseTax;
      row.vat += o.tax.vat;
      row.totalTax += o.tax.totalTax;
    }
    for (const o of salesOrders) {
      const created = auditLog.find((e) => e.entityType === "salesOrder" && e.entityId === o.orderNo && e.action === "created");
      if (!created) continue;
      get(created.timestamp.slice(0, 7)).salesNetValue += o.netValue;
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [importOrders, salesOrders, auditLog]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />
        <button
          onClick={exportToPdf}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          <Printer size={15} />
          {t("common.print")}
        </button>
      </div>

      <ReportSection
        title={t("reports.salesBySku")}
        onExport={() =>
          exportToExcel(
            "sales-by-sku",
            [t("salesOrders.col.sku"), t("products.col.name"), t("reports.colOrders"), t("reports.colQty"), t("reports.colNetValue")],
            bySku.map((r) => [r.sku, r.productName, r.orders, r.qty, maskIfRestricted(r.netValue, canViewSensitive)]),
          )
        }
      >
        <TableContainer>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className={th}>{t("salesOrders.col.sku")}</th>
              <th className={th}>{t("products.col.name")}</th>
              <th className={th}>{t("reports.colOrders")}</th>
              <th className={th}>{t("reports.colQty")}</th>
              <th className={th}>{t("reports.colNetValue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bySku.length === 0 && <EmptyRow colSpan={5} />}
            {bySku.map((r) => (
              <tr key={r.sku} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>{r.sku}</td>
                <td className={td}>{r.productName}</td>
                <td className={td}>{r.orders}</td>
                <td className={td}>{r.qty}</td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.netValue, lang)}</Masked>
                </td>
              </tr>
            ))}
          </tbody>
        </TableContainer>
      </ReportSection>

      <ReportSection
        title={t("reports.salesByChannel")}
        onExport={() =>
          exportToExcel(
            "sales-by-channel",
            [t("customers.col.channelType"), t("reports.colOrders"), t("reports.colNetValue"), t("reports.colAvgDiscount")],
            byChannel.map((r) => [
              t(`lookup.channel.${r.channel}`),
              r.orders,
              maskIfRestricted(r.netValue, canViewSensitive),
              maskIfRestricted(`${(r.discountSum / r.orders).toFixed(1)}%`, canViewSensitive),
            ]),
          )
        }
      >
        <TableContainer>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className={th}>{t("customers.col.channelType")}</th>
              <th className={th}>{t("reports.colOrders")}</th>
              <th className={th}>{t("reports.colNetValue")}</th>
              <th className={th}>{t("reports.colAvgDiscount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byChannel.length === 0 && <EmptyRow colSpan={4} />}
            {byChannel.map((r) => (
              <tr key={r.channel} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>{t(`lookup.channel.${r.channel}`)}</td>
                <td className={td}>{r.orders}</td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.netValue, lang)}</Masked>
                </td>
                <td className={td}>
                  <Masked>{(r.discountSum / r.orders).toFixed(1)}%</Masked>
                </td>
              </tr>
            ))}
          </tbody>
        </TableContainer>
      </ReportSection>

      <ReportSection
        title={t("reports.salesByCustomer")}
        onExport={() =>
          exportToExcel(
            "sales-by-customer",
            [t("salesOrders.col.customerName"), t("reports.colOrders"), t("reports.colNetValue"), t("customers.col.outstandingBalance")],
            byCustomer.map((r) => [r.name, r.orders, maskIfRestricted(r.netValue, canViewSensitive), maskIfRestricted(r.outstanding, canViewSensitive)]),
          )
        }
      >
        <TableContainer>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className={th}>{t("salesOrders.col.customerName")}</th>
              <th className={th}>{t("reports.colOrders")}</th>
              <th className={th}>{t("reports.colNetValue")}</th>
              <th className={th}>{t("customers.col.outstandingBalance")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byCustomer.length === 0 && <EmptyRow colSpan={4} />}
            {byCustomer.map((r) => (
              <tr key={r.name} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>
                  {r.customerId ? (
                    <Link to={`/customers/${r.customerId}`} className="text-indigo-600 hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </td>
                <td className={td}>{r.orders}</td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.netValue, lang)}</Masked>
                </td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.outstanding, lang)}</Masked>
                </td>
              </tr>
            ))}
          </tbody>
        </TableContainer>
      </ReportSection>

      <ReportSection
        title={t("reports.inventoryByPipelineStatus")}
        onExport={() =>
          exportToExcel(
            "inventory-by-pipeline-status",
            [t("common.status"), t("reports.colOrderCount"), t("reports.colStockValue")],
            byPipelineStatus.map((r) => [
              r.key === "inTransit" ? t("reports.pipelineInTransit") : t("reports.pipelineAvailable"),
              r.count,
              maskIfRestricted(r.value, canViewSensitive),
            ]),
          )
        }
      >
        <p className="mb-2 text-xs text-gray-400">{t("reports.inventoryByPipelineNote")}</p>
        <TableContainer>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className={th}>{t("common.status")}</th>
              <th className={th}>{t("reports.colOrderCount")}</th>
              <th className={th}>{t("reports.colStockValue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byPipelineStatus.map((r) => (
              <tr key={r.key} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>
                  {r.key === "inTransit" ? t("reports.pipelineInTransit") : t("reports.pipelineAvailable")}
                </td>
                <td className={td}>{r.count}</td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.value, lang)}</Masked>
                </td>
              </tr>
            ))}
          </tbody>
        </TableContainer>
      </ReportSection>

      <ReportSection
        title={t("reports.inventoryByStatus")}
        onExport={() =>
          exportToExcel(
            "inventory-by-status",
            [t("common.status"), t("reports.colLots"), t("reports.colQtyOnHand"), t("reports.colStockValue")],
            byInventoryStatus.map((r) => [t(`status.${r.status}`), r.lots, r.qty, maskIfRestricted(r.value, canViewSensitive)]),
          )
        }
      >
        <TableContainer>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className={th}>{t("common.status")}</th>
              <th className={th}>{t("reports.colLots")}</th>
              <th className={th}>{t("reports.colQtyOnHand")}</th>
              <th className={th}>{t("reports.colStockValue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byInventoryStatus.length === 0 && <EmptyRow colSpan={4} />}
            {byInventoryStatus.map((r) => (
              <tr key={r.status} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>{t(`status.${r.status}`)}</td>
                <td className={td}>{r.lots}</td>
                <td className={td}>{r.qty}</td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.value, lang)}</Masked>
                </td>
              </tr>
            ))}
          </tbody>
        </TableContainer>
      </ReportSection>

      <ReportSection
        title={t("reports.taxReconciliation")}
        onExport={() =>
          exportToExcel(
            "tax-sales-reconciliation",
            [t("reports.colMonth"), t("reports.colSalesNetValue"), t("importOrderDetail.importDuty"), t("importOrderDetail.exciseTax"), t("importOrderDetail.vat"), t("importOrderDetail.totalTax")],
            byMonth.map((r) => [
              r.month,
              maskIfRestricted(r.salesNetValue, canViewSensitive),
              maskIfRestricted(r.importDuty, canViewSensitive),
              maskIfRestricted(r.exciseTax, canViewSensitive),
              maskIfRestricted(r.vat, canViewSensitive),
              maskIfRestricted(r.totalTax, canViewSensitive),
            ]),
          )
        }
      >
        <p className="mb-2 text-xs text-gray-400">{t("reports.taxReconciliationNote")}</p>
        <TableContainer>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className={th}>{t("reports.colMonth")}</th>
              <th className={th}>{t("reports.colSalesNetValue")}</th>
              <th className={th}>{t("importOrderDetail.importDuty")}</th>
              <th className={th}>{t("importOrderDetail.exciseTax")}</th>
              <th className={th}>{t("importOrderDetail.vat")}</th>
              <th className={th}>{t("importOrderDetail.totalTax")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byMonth.length === 0 && <EmptyRow colSpan={6} />}
            {byMonth.map((r) => (
              <tr key={r.month} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>{r.month}</td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.salesNetValue, lang)}</Masked>
                </td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.importDuty, lang)}</Masked>
                </td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.exciseTax, lang)}</Masked>
                </td>
                <td className={td}>
                  <Masked>฿{formatCurrency(r.vat, lang)}</Masked>
                </td>
                <td className={`${td} font-medium text-gray-900`}>
                  <Masked>฿{formatCurrency(r.totalTax, lang)}</Masked>
                </td>
              </tr>
            ))}
          </tbody>
        </TableContainer>
      </ReportSection>
    </div>
  );
}
