import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Pencil, Plus, Eye, Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { ImportOrder } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency, formatDate, maskIfRestricted } from "../lib/format";
import { exportToExcel } from "../lib/export";

const STATUS_OPTIONS = [
  "staging",
  "pendingApproval",
  "approved",
  "customsCleared",
  "receivedWarehouse",
  "issueDetected",
  "rejected",
];

export default function ImportOrders() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const { canViewSensitive } = useRole();
  const { importOrders: rows, updateImportOrder } = useData();
  const location = useLocation();
  const highlightOrderNo = (location.state as { highlightOrderNo?: string } | null)?.highlightOrderNo;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const [editedNos, setEditedNos] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      const matchesSearch =
        !q || o.orderNo.toLowerCase().includes(q) || o.supplier.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const editingRow = rows.find((o) => o.orderNo === editingNo) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        {
          key: "status",
          label: t("importOrders.col.status"),
          type: "select",
          options: STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) })),
        },
        { key: "totalValue", label: t("importOrders.col.totalValue"), type: "number", suffix: "THB" },
        { key: "customsDeclarationNo", label: t("importOrders.col.customsDeclarationNo"), type: "text" },
      ]
    : [];

  const handleSave = (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    updateImportOrder(editingRow.orderNo, {
      status: values.status as ImportOrder["status"],
      totalValue: Number(values.totalValue),
      customsDeclarationNo: String(values.customsDeclarationNo) || null,
    });
    setEditedNos((prev) => new Set(prev).add(editingRow.orderNo));
    setEditingNo(null);
    showToast(`${t("common.save")}: ${editingRow.orderNo}`);
  };

  const handleExport = () => {
    exportToExcel(
      "import-orders",
      [t("importOrders.col.orderNo"), t("importOrders.col.supplier"), t("importOrders.col.country"), t("importOrders.col.incoterms"), t("importOrders.col.orderDate"), t("importOrders.col.etaDate"), t("importOrders.col.totalValue"), t("importOrders.col.status"), t("importOrders.col.approver")],
      filtered.map((o) => [o.orderNo, o.supplier, t(`lookup.country.${o.country}`), o.incoterms, o.orderDate, o.etaDate, maskIfRestricted(o.totalValue, canViewSensitive), t(`status.${o.status}`), o.approver ? bi(o.approver) : ""]),
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("importOrders.title")} subtitle={t("importOrders.subtitle")} />
        {canViewSensitive ? (
          <Link
            to="/import-orders/new"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus size={15} />
            {t("importOrders.newOrder")}
          </Link>
        ) : (
          <button
            disabled
            title={t("common.restrictedTooltip")}
            className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-gray-200 px-3.5 py-2 text-sm font-medium text-gray-400"
          >
            <Lock size={15} />
            {t("importOrders.newOrder")}
          </button>
        )}
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("importOrders.searchPlaceholder")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        resultCount={filtered.length}
        totalCount={rows.length}
        onExport={handleExport}
      />

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("importOrders.col.orderNo")}</th>
            <th className={th}>{t("importOrders.col.supplier")}</th>
            <th className={th}>{t("importOrders.col.country")}</th>
            <th className={th}>{t("importOrders.col.incoterms")}</th>
            <th className={th}>{t("importOrders.col.orderDate")}</th>
            <th className={th}>{t("importOrders.col.etaDate")}</th>
            <th className={th}>{t("importOrders.col.totalValue")}</th>
            <th className={th}>{t("importOrders.col.status")}</th>
            <th className={th}>{t("importOrders.col.approver")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={10} />}
          {filtered.map((o) => (
            <tr key={o.orderNo} className={`hover:bg-gray-50/60 ${o.orderNo === highlightOrderNo ? "bg-indigo-50/40" : ""}`}>
              <td className={`${td} font-medium text-gray-900`}>
                {o.orderNo}
                {o.orderNo === highlightOrderNo && <EditedPill label={t("common.new")} />}
                {editedNos.has(o.orderNo) && <EditedPill />}
              </td>
              <td className={td}>{o.supplier}</td>
              <td className={td}>{t(`lookup.country.${o.country}`)}</td>
              <td className={td}>{o.incoterms}</td>
              <td className={td}>{formatDate(o.orderDate, lang)}</td>
              <td className={td}>{formatDate(o.etaDate, lang)}</td>
              <td className={td}>
                <Masked>฿{formatCurrency(o.totalValue, lang)}</Masked>
              </td>
              <td className={td}>
                <div className="flex flex-col gap-1">
                  <StatusBadge status={o.status} />
                  {o.note && <span className="text-xs text-rose-500">{bi(o.note)}</span>}
                </div>
              </td>
              <td className={td}>{o.approver ? bi(o.approver) : <span className="text-gray-300">{t("importOrders.none")}</span>}</td>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/import-orders/${o.orderNo}`}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Eye size={13} />
                    {t("common.viewDetails")}
                  </Link>
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
        title={t("importOrders.editTitle")}
        subtitle={editingRow ? `${editingRow.orderNo} · ${editingRow.supplier}` : ""}
        fields={fields}
        values={
          editingRow
            ? {
                status: editingRow.status,
                totalValue: editingRow.totalValue,
                customsDeclarationNo: editingRow.customsDeclarationNo ?? "",
              }
            : {}
        }
        onClose={() => setEditingNo(null)}
        onSave={handleSave}
      />
    </div>
  );
}
