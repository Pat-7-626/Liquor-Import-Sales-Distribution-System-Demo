import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Pencil, Plus, Lock, FileText, Eye } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { SalesOrder } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { SalesOrderDocumentsModal } from "../components/SalesOrderDocumentsModal";
import { formatCurrency, maskIfRestricted } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { selectClass } from "../components/FormKit";
import { salesOrderDisplayStatus, computeSalesNetValue, DELIVERY_STATUS_OPTIONS } from "../lib/business";

export default function SalesOrders() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const { canViewSensitive } = useRole();
  const { salesOrders: rows, products, updateSalesOrder } = useData();
  const location = useLocation();
  const highlightOrderNo = (location.state as { highlightOrderNo?: string } | null)?.highlightOrderNo;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const [editedNos, setEditedNos] = useState<Set<string>>(new Set());
  const [docsOrderNo, setDocsOrderNo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      const matchesSearch =
        !q ||
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.th.includes(search) ||
        o.customerName.en.toLowerCase().includes(q) ||
        o.sku.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || o.deliveryStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const editingRow = rows.find((o) => o.orderNo === editingNo) ?? null;
  const docsOrder = rows.find((o) => o.orderNo === docsOrderNo) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "quantity", label: t("salesOrders.col.quantity"), type: "number" },
        { key: "unitPrice", label: t("salesOrders.col.unitPrice"), type: "number", suffix: "THB" },
        { key: "discountPercent", label: t("salesOrders.col.discountPercent"), type: "number", suffix: "%" },
      ]
    : [];

  const handleSave = (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const quantity = Number(values.quantity);
    const unitPrice = Number(values.unitPrice);
    const discountPercent = Number(values.discountPercent);
    updateSalesOrder(editingRow.orderNo, {
      quantity,
      unitPrice,
      discountPercent,
      netValue: computeSalesNetValue(quantity, unitPrice, discountPercent),
    });
    setEditedNos((prev) => new Set(prev).add(editingRow.orderNo));
    setEditingNo(null);
    showToast(`${t("common.save")}: ${editingRow.orderNo}`);
  };

  // FR-24: Distribution Officers must be able to update Delivery Status — kept independent of the
  // canViewSensitive-gated Edit drawer, since delivery status isn't a masked/sensitive field.
  const handleDeliveryStatusChange = (orderNo: string, status: SalesOrder["deliveryStatus"]) => {
    updateSalesOrder(orderNo, { deliveryStatus: status });
    setEditedNos((prev) => new Set(prev).add(orderNo));
    showToast(`${t("common.save")}: ${orderNo}`);
  };

  const handleExport = () => {
    exportToExcel(
      "sales-orders",
      [t("salesOrders.col.orderNo"), t("salesOrders.col.customerName"), t("salesOrders.col.sku"), t("products.col.name"), t("salesOrders.col.quantity"), t("salesOrders.col.unitPrice"), t("salesOrders.col.discountPercent"), t("salesOrders.col.netValue"), t("salesOrders.col.lotBatch"), t("salesOrders.col.deliveryStatus"), t("salesOrders.col.taxInvoiceNo"), t("salesOrders.col.deliveryNoteNo"), t("salesOrders.col.approver")],
      filtered.map((o) => [
        o.orderNo,
        bi(o.customerName),
        o.sku,
        products.find((p) => p.sku === o.sku)?.name ?? "",
        o.quantity,
        maskIfRestricted(o.unitPrice, canViewSensitive),
        maskIfRestricted(o.discountPercent, canViewSensitive),
        maskIfRestricted(o.netValue, canViewSensitive),
        o.lotBatch,
        t(`status.${salesOrderDisplayStatus(o)}`),
        o.taxInvoiceNo,
        o.deliveryNoteNo,
        o.approver ? bi(o.approver) : "",
      ]),
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("salesOrders.title")} subtitle={t("salesOrders.subtitle")} />
        <Link
          to="/sales-orders/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus size={15} />
          {t("salesOrders.newOrder")}
        </Link>
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("salesOrders.searchPlaceholder")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={DELIVERY_STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        resultCount={filtered.length}
        totalCount={rows.length}
        onExport={handleExport}
      />

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("salesOrders.col.orderNo")}</th>
            <th className={th}>{t("salesOrders.col.customerName")}</th>
            <th className={th}>{t("salesOrders.col.sku")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("salesOrders.col.quantity")}</th>
            <th className={th}>{t("salesOrders.col.unitPrice")}</th>
            <th className={th}>{t("salesOrders.col.discountPercent")}</th>
            <th className={th}>{t("salesOrders.col.netValue")}</th>
            <th className={th}>{t("salesOrders.col.lotBatch")}</th>
            <th className={th}>{t("salesOrders.col.deliveryStatus")}</th>
            <th className={th}>{t("salesOrders.col.taxInvoiceNo")}</th>
            <th className={th}>{t("salesOrders.col.deliveryNoteNo")}</th>
            <th className={th}>{t("salesOrders.col.approver")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={14} />}
          {filtered.map((o) => (
            <tr key={o.orderNo} className={`hover:bg-gray-50/60 ${o.orderNo === highlightOrderNo ? "bg-indigo-50/40" : ""}`}>
              <td className={`${td} font-medium text-gray-900`}>
                {o.orderNo}
                {o.orderNo === highlightOrderNo && <EditedPill label={t("common.new")} />}
                {editedNos.has(o.orderNo) && <EditedPill />}
              </td>
              <td className={td}>{bi(o.customerName)}</td>
              <td className={td}>{o.sku}</td>
              <td className={td}>{products.find((p) => p.sku === o.sku)?.name ?? "—"}</td>
              <td className={td}>{o.quantity}</td>
              <td className={td}>
                <Masked>฿{formatCurrency(o.unitPrice, lang)}</Masked>
              </td>
              <td className={td}>
                <Masked>{o.discountPercent}%</Masked>
              </td>
              <td className={`${td} font-medium text-gray-900`}>
                <Masked>฿{formatCurrency(o.netValue, lang)}</Masked>
              </td>
              <td className={td}>{o.lotBatch}</td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={salesOrderDisplayStatus(o)} />
                  {!o.approvalStatus && (
                    <select
                      value={o.deliveryStatus}
                      onChange={(e) => handleDeliveryStatusChange(o.orderNo, e.target.value as SalesOrder["deliveryStatus"])}
                      title={t("salesOrderDetail.updateDeliveryStatus")}
                      className={`${selectClass} w-auto py-1 text-xs`}
                    >
                      {DELIVERY_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </td>
              <td className={td}>{o.taxInvoiceNo}</td>
              <td className={td}>{o.deliveryNoteNo}</td>
              <td className={td}>{o.approver ? bi(o.approver) : <span className="text-gray-300">{t("salesOrders.none")}</span>}</td>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/sales-orders/${o.orderNo}`}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Eye size={13} />
                    {t("common.viewDetails")}
                  </Link>
                  <button
                    onClick={() => setDocsOrderNo(o.orderNo)}
                    disabled={Boolean(o.approvalStatus)}
                    title={o.approvalStatus ? t("salesOrderDocs.pendingApprovalNote") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                  >
                    <FileText size={13} />
                    {t("salesOrderDocs.action")}
                  </button>
                  <button
                    onClick={() => setEditingNo(o.orderNo)}
                    disabled={!canViewSensitive}
                    title={!canViewSensitive ? t("common.restrictedTooltip") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                  >
                    {canViewSensitive ? <Pencil size={13} /> : <Lock size={13} />}
                    {t("common.edit")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <EditDrawer
        open={editingNo !== null}
        title={t("salesOrders.editTitle")}
        subtitle={editingRow ? `${editingRow.orderNo} · ${bi(editingRow.customerName)}` : ""}
        fields={fields}
        values={
          editingRow
            ? {
                quantity: editingRow.quantity,
                unitPrice: editingRow.unitPrice,
                discountPercent: editingRow.discountPercent,
              }
            : {}
        }
        onClose={() => setEditingNo(null)}
        onSave={handleSave}
      />

      <SalesOrderDocumentsModal order={docsOrder} onClose={() => setDocsOrderNo(null)} />
    </div>
  );
}
