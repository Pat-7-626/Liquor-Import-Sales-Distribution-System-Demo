import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useData } from "../state/DataContext";
import type { InventoryItem } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatDate, formatNumber } from "../lib/format";
import { computeInventoryAge } from "../lib/business";
import { exportToExcel } from "../lib/export";

const STATUS_OPTIONS = ["normal", "agingStart", "agingLong"];
const WAREHOUSE_OPTIONS = ["whA", "whB", "whC"];

export default function Inventory() {
  const { t, lang } = useLanguage();
  const showToast = useToast();
  const { inventory: rows, updateInventory } = useData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editedKeys, setEditedKeys] = useState<Set<string>>(new Set());

  const computed = useMemo(
    () => rows.map((i) => ({ ...i, ...computeInventoryAge(i.receivedDate) })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return computed.filter((i) => {
      const matchesSearch =
        !q ||
        i.sku.toLowerCase().includes(q) ||
        i.productName.toLowerCase().includes(q) ||
        i.lotBatch.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || i.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [computed, search, statusFilter]);

  const editingRow = computed.find((i) => i.lotBatch === editingKey) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "quantityRemaining", label: t("inventory.col.quantityRemaining"), type: "number" },
        { key: "receivedDate", label: t("inventory.col.receivedDate"), type: "date" },
        {
          key: "warehouse",
          label: t("inventory.col.warehouse"),
          type: "select",
          options: WAREHOUSE_OPTIONS.map((w) => ({ value: w, label: t(`lookup.warehouse.${w}`) })),
        },
      ]
    : [];

  const handleSave = (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    updateInventory(editingRow.lotBatch, {
      quantityRemaining: Number(values.quantityRemaining),
      receivedDate: String(values.receivedDate),
      warehouse: values.warehouse as InventoryItem["warehouse"],
    });
    setEditedKeys((prev) => new Set(prev).add(editingRow.lotBatch));
    setEditingKey(null);
    showToast(`${t("common.save")}: ${editingRow.lotBatch}`);
  };

  const handleExport = () => {
    exportToExcel(
      "inventory",
      [t("inventory.col.sku"), t("inventory.col.productName"), t("inventory.col.lotBatch"), t("inventory.col.receivedDate"), t("inventory.col.quantityRemaining"), t("inventory.col.ageDays"), t("inventory.col.status"), t("inventory.col.warehouse"), t("importOrderDetail.exciseStampDate")],
      filtered.map((i) => [i.sku, i.productName, i.lotBatch, i.receivedDate, i.quantityRemaining, i.ageDays, t(`status.${i.status}`), t(`lookup.warehouse.${i.warehouse}`), i.exciseStampDate ?? ""]),
    );
  };

  return (
    <div>
      <PageHeader title={t("inventory.title")} subtitle={t("inventory.subtitle")} />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("inventory.searchPlaceholder")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        resultCount={filtered.length}
        totalCount={rows.length}
        onExport={handleExport}
      />

      <TableContainer>
        <thead className="bg-gray-50">
          <tr>
            <th className={th}>{t("inventory.col.sku")}</th>
            <th className={th}>{t("inventory.col.productName")}</th>
            <th className={th}>{t("inventory.col.lotBatch")}</th>
            <th className={th}>{t("inventory.col.receivedDate")}</th>
            <th className={th}>{t("inventory.col.quantityRemaining")}</th>
            <th className={th}>{t("inventory.col.ageDays")}</th>
            <th className={th}>{t("inventory.col.status")}</th>
            <th className={th}>{t("inventory.col.warehouse")}</th>
            <th className={th}>{t("importOrderDetail.exciseStampDate")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={10} />}
          {filtered.map((i) => (
            <tr key={i.lotBatch} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>{i.sku}</td>
              <td className={td}>
                {i.productName}
                {editedKeys.has(i.lotBatch) && <EditedPill />}
              </td>
              <td className={td}>{i.lotBatch}</td>
              <td className={td}>{formatDate(i.receivedDate, lang)}</td>
              <td className={td}>{formatNumber(i.quantityRemaining, lang, 0)}</td>
              <td className={td}>{i.ageDays}</td>
              <td className={td}>
                <StatusBadge status={i.status} />
              </td>
              <td className={td}>{t(`lookup.warehouse.${i.warehouse}`)}</td>
              <td className={td}>{i.exciseStampDate ? formatDate(i.exciseStampDate, lang) : <span className="text-gray-300">{t("common.notRecorded")}</span>}</td>
              <td className={td}>
                <button
                  onClick={() => setEditingKey(i.lotBatch)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  <Pencil size={13} />
                  {t("common.edit")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <EditDrawer
        open={editingKey !== null}
        title={t("inventory.editTitle")}
        subtitle={editingRow ? `${editingRow.sku} · ${editingRow.lotBatch}` : ""}
        fields={fields}
        values={
          editingRow
            ? {
                quantityRemaining: editingRow.quantityRemaining,
                receivedDate: editingRow.receivedDate,
                warehouse: editingRow.warehouse,
              }
            : {}
        }
        onClose={() => setEditingKey(null)}
        onSave={handleSave}
      />
    </div>
  );
}
