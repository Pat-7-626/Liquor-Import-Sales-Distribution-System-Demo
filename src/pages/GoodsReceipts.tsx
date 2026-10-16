import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { StatusBadge } from "../components/StatusBadge";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { formatDate, formatNumber } from "../lib/format";
import { isImportOverdue } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useWarehouseName } from "../lib/useWarehouseName";
import { query, useApi } from "../lib/useApi";
import type { StockMovement } from "../data/types";
import { both } from "../i18n/translations";
import { RecordLink } from "../components/RecordLink";

const NO_MOVES: StockMovement[] = [];

export default function GoodsReceipts() {
  const { t, lang } = useLanguage();
  const warehouseName = useWarehouseName();
  const { importOrders } = useData();
  // Which warehouse each shipment went into is on its receipt movements.
  const receiptMoves = useApi<{ rows: StockMovement[] }>(query("/api/stock-movements", { type: "receipt", limit: 5000 })).data?.rows;
  const stockMovements = receiptMoves ?? NO_MOVES;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const receipts = useMemo(
    () =>
      importOrders
        .filter((o) => o.receiving)
        .map((o) => {
          const lines = o.receiving!.lines;
          const warehouse = stockMovements.find((m) => m.type === "receipt" && m.reference === o.orderNo)?.warehouse;
          return {
            order: o,
            receivedDate: o.receiving!.receivedDate,
            ordered: lines.reduce((s, l) => s + l.orderedQty, 0),
            received: lines.reduce((s, l) => s + l.receivedQty, 0),
            lots: lines.filter((l) => l.receivedQty > 0).map((l) => l.lotBatch),
            warehouse,
            discrepancy: o.receiving!.hasDiscrepancy,
          };
        })
        .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)),
    [importOrders, stockMovements],
  );

  const filtered = receipts.filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      (!q || r.order.orderNo.toLowerCase().includes(q) || r.order.supplier.toLowerCase().includes(q) || r.lots.some((l) => l.toLowerCase().includes(q))) &&
      (!statusFilter || (statusFilter === "discrepancy") === r.discrepancy)
    );
  });

  const awaiting = importOrders
    .filter((o) => (o.status === "approved" || o.status === "customsCleared") && !o.receiving)
    .sort((a, b) => a.etaDate.localeCompare(b.etaDate));

  return (
    <div>
      <PageHeader title={t("erp.page.goodsReceipts")} subtitle={t("erp.page.goodsReceiptsSub")} />

      <h2 className="mb-3 text-sm font-semibold text-gray-900">
        {t("erp.awaitingReceipt")} <span className="font-normal text-gray-400">({awaiting.length})</span>
      </h2>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("importOrders.col.orderNo")}</th>
            <th className={th}>{t("importOrders.col.supplier")}</th>
            <th className={th}>{t("importOrders.col.etaDate")}</th>
            <th className={th}>{t("erp.units")}</th>
            <th className={th}>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {awaiting.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                {t("erp.nothingAwaiting")}
              </td>
            </tr>
          )}
          {awaiting.map((o) => (
            <tr key={o.orderNo} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium`}>
                <RecordLink to={`/import-orders/${o.orderNo}`}>
                  {o.orderNo}
                </RecordLink>
              </td>
              <td className={td}>{o.supplier}</td>
              <td className={td}>
                {formatDate(o.etaDate, lang)}
                {isImportOverdue(o) && <span className="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">{t("erp.overdue")}</span>}
              </td>
              <td className={td}>{formatNumber((o.lineItems ?? []).reduce((s, l) => s + l.qty, 0), lang, 0)}</td>
              <td className={td}>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-900">{t("erp.completedReceipts")}</h2>
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("erp.searchReceipts")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={[
          { value: "match", label: t("importOrderDetail.receivingMatch") },
          { value: "discrepancy", label: t("importOrderDetail.receivingDiscrepancy") },
        ]}
        resultCount={filtered.length}
        totalCount={receipts.length}
        onExport={() =>
          exportToExcel(
            "goods-receipts",
            [both("erp.date"), both("importOrders.col.orderNo"), both("importOrders.col.supplier"), both("inventory.col.warehouse"), both("importOrderDetail.orderedQty"), both("importOrderDetail.receivedQty"), both("reports.colLots")],
            filtered.map((r) => [r.receivedDate, r.order.orderNo, r.order.supplier, r.warehouse ? warehouseName(r.warehouse) : "", r.ordered, r.received, r.lots.join(" ")]),
          )
        }
      />
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("erp.date")}</th>
            <th className={th}>{t("importOrders.col.orderNo")}</th>
            <th className={th}>{t("importOrders.col.supplier")}</th>
            <th className={th}>{t("inventory.col.warehouse")}</th>
            <th className={th}>{t("importOrderDetail.orderedQty")}</th>
            <th className={th}>{t("importOrderDetail.receivedQty")}</th>
            <th className={th}>{t("reports.colLots")}</th>
            <th className={th}>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={8} />}
          {filtered.map((r) => (
            <tr key={r.order.orderNo} className="hover:bg-gray-50/60">
              <td className={td}>{formatDate(r.receivedDate, lang)}</td>
              <td className={`${td} font-medium`}>
                <RecordLink to={`/import-orders/${r.order.orderNo}`}>
                  {r.order.orderNo}
                </RecordLink>
              </td>
              <td className={td}>{r.order.supplier}</td>
              <td className={td}>{r.warehouse ? warehouseName(r.warehouse) : <span className="text-gray-400">—</span>}</td>
              <td className={td}>{formatNumber(r.ordered, lang, 0)}</td>
              <td className={`${td} ${r.discrepancy ? "font-medium text-rose-600" : ""}`}>{formatNumber(r.received, lang, 0)}</td>
              <td className={`${td} whitespace-normal`}>
                {r.lots.map((l) => (
                  <Link key={l} to={`/lot-trace?lot=${encodeURIComponent(l)}`} className="mr-2 text-indigo-600 hover:underline">
                    {l}
                  </Link>
                ))}
              </td>
              <td className={td}>
                <span className={`text-xs font-medium ${r.discrepancy ? "text-rose-600" : "text-emerald-600"}`}>
                  {r.discrepancy ? t("importOrderDetail.receivingDiscrepancy") : t("importOrderDetail.receivingMatch")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      {receipts.length === 0 && <p className="mt-2 text-xs text-gray-400">{t("erp.seedReceiptsNote")}</p>}
    </div>
  );
}
