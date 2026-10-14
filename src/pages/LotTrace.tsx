import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { Card, Field } from "../components/DetailKit";
import { StatusBadge } from "../components/StatusBadge";
import { MovementReference, MovementTypeBadge } from "../components/MovementKit";
import { FieldLabel, selectClass } from "../components/FormKit";
import { formatDate, formatNumber } from "../lib/format";
import { computeInventoryAge, salesOrderDisplayStatus } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useWarehouseName } from "../lib/useWarehouseName";
import { query, useApi } from "../lib/useApi";
import type { StockMovement } from "../data/types";

export default function LotTrace() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const warehouseName = useWarehouseName();
  const [params, setParams] = useSearchParams();
  const lotBatch = params.get("lot") ?? "";
  const { inventory, salesOrders, importOrders, suppliers, customers } = useData();
  const stockMovements = useApi<{ rows: StockMovement[] }>(lotBatch ? query("/api/stock-movements", { lot: lotBatch, limit: 5000 }) : null).data?.rows;

  const lot = inventory.find((i) => i.lotBatch === lotBatch) ?? null;
  const age = lot ? computeInventoryAge(lot.receivedDate) : null;

  // Chronological ledger with a running balance — the last balance must equal quantity on hand.
  const ledger = useMemo(() => {
    const moves = (stockMovements ?? []).slice().sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    return moves.reduce<(typeof moves[number] & { balance: number })[]>(
      (rows, m) => [...rows, { ...m, balance: (rows.length ? rows[rows.length - 1].balance : 0) + m.quantity }],
      [],
    );
  }, [stockMovements]);
  const ledgerBalance = ledger.length ? ledger[ledger.length - 1].balance : 0;
  // Until the ledger arrives there's nothing to compare.
  const reconciles = lot && stockMovements ? ledgerBalance === lot.quantityRemaining : true;

  const sourceOrder =
    importOrders.find((o) => o.receiving?.lines.some((l) => l.lotBatch === lotBatch)) ??
    importOrders.find((o) => ledger.some((m) => m.type === "receipt" && m.reference === o.orderNo)) ??
    null;
  const supplier = sourceOrder ? suppliers.find((s) => s.supplierId === sourceOrder.supplierId) : null;

  // Every booked order line that drew on this lot (an order can take one lot on several lines).
  const shipments = salesOrders
    .filter((o) => !o.approvalStatus && o.lines.some((l) => l.lotBatch === lotBatch))
    .map((o) => ({ ...o, quantity: o.lines.filter((l) => l.lotBatch === lotBatch).reduce((sum, l) => sum + l.quantity, 0) }));

  const exportRecallList = () =>
    exportToExcel(
      `recall-${lotBatch}`,
      [t("salesOrders.col.orderNo"), t("erp.orderDate"), t("customers.col.customerId"), t("salesOrders.col.customerName"), t("salesOrders.col.quantity"), t("salesOrders.col.deliveryStatus")],
      shipments.map((o) => [o.orderNo, o.orderDate, o.customerId, bi(o.customerName), o.quantity, t(`status.${o.deliveryStatus}`)]),
    );

  const lotsSorted = [...inventory].sort((a, b) => a.lotBatch.localeCompare(b.lotBatch));

  return (
    <div>
      <PageHeader title={t("erp.page.lotTrace")} subtitle={t("erp.page.lotTraceSub")} />

      <label className="mb-5 block max-w-md">
        <FieldLabel>{t("inventory.col.lotBatch")}</FieldLabel>
        <select value={lotBatch} onChange={(e) => setParams(e.target.value ? { lot: e.target.value } : {})} className={selectClass}>
          <option value="">{t("erp.selectLot")}</option>
          {lotsSorted.map((i) => (
            <option key={i.lotBatch} value={i.lotBatch}>
              {i.lotBatch} · {i.sku} · {i.productName}
            </option>
          ))}
        </select>
      </label>

      {!lot ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-400">
          {lotBatch ? t("common.noResults") : t("erp.lotTraceEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title={t("erp.lotDetails")}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("products.col.sku")} value={lot.sku} />
              <Field label={t("products.col.name")} value={lot.productName} />
              <Field label={t("inventory.col.warehouse")} value={warehouseName(lot.warehouse)} />
              <Field label={t("inventory.col.receivedDate")} value={formatDate(lot.receivedDate, lang)} />
              <Field label={t("inventory.col.quantityRemaining")} value={formatNumber(lot.quantityRemaining, lang, 0)} />
              <Field label={t("inventory.col.ageDays")} value={age && <span className="flex items-center gap-1.5">{age.ageDays} <StatusBadge status={age.status} /></span>} />
              <Field
                label={t("importOrderDetail.exciseStampDate")}
                value={lot.exciseStampDate ? formatDate(lot.exciseStampDate, lang) : <span className="text-gray-400">{t("common.notRecorded")}</span>}
              />
            </div>
            <p className={`mt-4 flex items-center gap-1.5 text-xs ${reconciles ? "text-emerald-600" : "text-rose-600"}`}>
              {reconciles ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {reconciles ? t("erp.ledgerReconciles") : `${t("erp.ledgerMismatch")} (${ledgerBalance} ≠ ${lot.quantityRemaining})`}
            </p>
          </Card>

          <Card title={t("erp.lotSource")}>
            {sourceOrder ? (
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label={t("importOrders.col.orderNo")}
                  value={
                    <Link to={`/import-orders/${sourceOrder.orderNo}`} className="text-indigo-600 hover:underline">
                      {sourceOrder.orderNo}
                    </Link>
                  }
                />
                <Field label={t("importOrders.col.supplier")} value={supplier?.name ?? sourceOrder.supplier} />
                <Field label={t("importOrders.col.country")} value={t(`lookup.country.${sourceOrder.country}`)} />
                <Field label={t("importOrderDetail.manufacturerRegNo")} value={sourceOrder.logistics?.manufacturerRegNo ?? "—"} />
                <Field label={t("importOrders.col.customsDeclarationNo")} value={sourceOrder.customsDeclarationNo ?? "—"} />
                <Field label={t("importOrderDetail.blAwbNumber")} value={sourceOrder.logistics?.blAwbNumber ?? "—"} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t("erp.lotSourceUnknown")}</p>
            )}
          </Card>

          <Card
            title={t("erp.lotShipments")}
            action={
              shipments.length > 0 ? (
                <button onClick={exportRecallList} className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
                  {t("erp.exportRecallList")}
                </button>
              ) : undefined
            }
          >
            {shipments.length === 0 ? (
              <p className="text-sm text-gray-400">{t("erp.lotNoShipments")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {shipments.map((o) => (
                  <li key={o.orderNo} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link to={`/customers/${o.customerId}`} className="font-medium text-gray-900 hover:text-indigo-600 hover:underline">
                        {bi(customers.find((c) => c.customerId === o.customerId)?.name ?? o.customerName)}
                      </Link>
                      <p className="text-xs text-gray-400">
                        <Link to={`/sales-orders/${o.orderNo}`} className="hover:underline">
                          {o.orderNo}
                        </Link>{" "}
                        · {formatDate(o.orderDate, lang)} · × {o.quantity}
                      </p>
                    </div>
                    <StatusBadge status={salesOrderDisplayStatus(o)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("erp.page.stockMovements")}>
            {ledger.length === 0 ? (
              <p className="text-sm text-gray-400">{t("erp.noMovements")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.date")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.movementType")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.reference")}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">{t("erp.quantity")}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">{t("erp.balance")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledger.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDate(m.timestamp.slice(0, 10), lang)}</td>
                        <td className="px-3 py-2">
                          <MovementTypeBadge type={m.type} />
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2">
                          <MovementReference reference={m.reference} />
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${m.quantity > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {m.quantity > 0 ? "+" : "−"}
                          {Math.abs(m.quantity)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{m.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
