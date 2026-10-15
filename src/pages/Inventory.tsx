import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Pencil, Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { InventoryItem } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatDate, formatNumber } from "../lib/format";
import { computeInventoryAge } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useRunAction } from "../lib/useRunAction";
import { useWarehouseName } from "../lib/useWarehouseName";
import { both } from "../i18n/translations";

const STATUS_OPTIONS = ["normal", "agingStart", "agingLong"];
/** Lots at or below this quantity are flagged so they get re-ordered or cleared. */
const LOW_LOT_QTY = 20;

export default function Inventory() {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { can } = useRole();
  const { inventory: rows, warehouses, adjustInventory } = useData();
  const warehouseName = useWarehouseName();
  const WAREHOUSE_OPTIONS = warehouses.map((w) => w.code);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [params] = useSearchParams();
  const [warehouseFilter, setWarehouseFilter] = useState(params.get("warehouse") ?? "");
  const [hideEmpty, setHideEmpty] = useState(true);
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
      const matchesWarehouse = !warehouseFilter || i.warehouse === warehouseFilter;
      return matchesSearch && matchesStatus && matchesWarehouse && (!hideEmpty || i.quantityRemaining > 0);
    });
  }, [computed, search, statusFilter, warehouseFilter, hideEmpty]);

  const editingRow = computed.find((i) => i.lotBatch === editingKey) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "quantityRemaining", label: t("inventory.col.quantityRemaining"), type: "number", min: 0, step: 1 },
        { key: "receivedDate", label: t("inventory.col.receivedDate"), type: "date" },
        {
          key: "warehouse",
          label: t("inventory.col.warehouse"),
          type: "select",
          options: warehouses
            .filter((w) => w.active || w.code === editingRow.warehouse)
            .map((w) => ({ value: w.code, label: warehouseName(w.code) })),
        },
        { key: "reason", label: t("erp.adjustReason"), type: "text", placeholder: t("erp.adjustReasonPlaceholder") },
      ]
    : [];

  const handleSave = async (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const result = await adjustInventory(
      editingRow.lotBatch,
      {
        quantityRemaining: Number(values.quantityRemaining),
        receivedDate: String(values.receivedDate),
        warehouse: values.warehouse as InventoryItem["warehouse"],
      },
      String(values.reason ?? ""),
    );
    if (!await runAction(result, `${t("common.save")}: ${editingRow.lotBatch}`)) return;
    setEditedKeys((prev) => new Set(prev).add(editingRow.lotBatch));
    setEditingKey(null);
  };

  const handleExport = () => {
    exportToExcel(
      "inventory",
      [both("inventory.col.sku"), both("inventory.col.productName"), both("inventory.col.lotBatch"), both("inventory.col.receivedDate"), both("inventory.col.quantityRemaining"), both("inventory.col.ageDays"), both("inventory.col.status"), both("inventory.col.warehouse"), both("importOrderDetail.exciseStampDate")],
      filtered.map((i) => [i.sku, i.productName, i.lotBatch, i.receivedDate, i.quantityRemaining, i.ageDays, t(`status.${i.status}`), warehouseName(i.warehouse), i.exciseStampDate ?? ""]),
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
        extraFilter={
          <>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              aria-label={t("inventory.col.warehouse")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">{t("erp.allWarehouses")}</option>
              {WAREHOUSE_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {warehouseName(w)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600">
              <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="rounded border-gray-300" />
              {t("erp.hideEmptyLots")}
            </label>
          </>
        }
      />

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
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
              <td className={td}>
                <Link to={`/lot-trace?lot=${encodeURIComponent(i.lotBatch)}`} className="text-indigo-600 hover:underline">
                  {i.lotBatch}
                </Link>
              </td>
              <td className={td}>{formatDate(i.receivedDate, lang)}</td>
              <td className={`${td} ${i.quantityRemaining === 0 ? "text-gray-400" : i.quantityRemaining <= LOW_LOT_QTY ? "font-medium text-amber-600" : ""}`}>
                {formatNumber(i.quantityRemaining, lang, 0)}
              </td>
              <td className={td}>{i.ageDays}</td>
              <td className={td}>
                <StatusBadge status={i.status} />
              </td>
              <td className={td}>{warehouseName(i.warehouse)}</td>
              <td className={td}>{i.exciseStampDate ? formatDate(i.exciseStampDate, lang) : <span className="text-gray-400">{t("common.notRecorded")}</span>}</td>
              <td className={td}>
                <button
                  onClick={() => setEditingKey(i.lotBatch)}
                  disabled={!can("adjustInventory")}
                  title={!can("adjustInventory") ? t("erp.noPermission") : undefined}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  {can("adjustInventory") ? <Pencil size={13} /> : <Lock size={13} />}
                  {t("erp.adjust")}
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
        note={t("erp.adjustNote")}
        fields={fields}
        values={
          editingRow
            ? {
                quantityRemaining: editingRow.quantityRemaining,
                receivedDate: editingRow.receivedDate,
                warehouse: editingRow.warehouse,
                reason: "",
              }
            : {}
        }
        onClose={() => setEditingKey(null)}
        onSave={handleSave}
      />
    </div>
  );
}
