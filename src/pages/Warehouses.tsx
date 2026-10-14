import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Lock, ShieldCheck } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { Warehouse } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { NewButton } from "../components/NewButton";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency, formatNumber } from "../lib/format";
import { useRunAction } from "../lib/useRunAction";

export default function Warehouses() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { can } = useRole();
  const { warehouses, inventory, products, saveWarehouse } = useData();
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      warehouses.map((w) => {
        const lots = inventory.filter((i) => i.warehouse === w.code && i.quantityRemaining > 0);
        const units = lots.reduce((sum, i) => sum + i.quantityRemaining, 0);
        const value = lots.reduce((sum, i) => sum + i.quantityRemaining * (products.find((p) => p.sku === i.sku)?.costPrice ?? 0), 0);
        return { ...w, lots: lots.length, skus: new Set(lots.map((l) => l.sku)).size, units, value, utilisation: w.capacity > 0 ? units / w.capacity : 0 };
      }),
    [warehouses, inventory, products],
  );

  const editing = editingCode ? warehouses.find((w) => w.code === editingCode) ?? null : null;

  const fields: FieldConfig[] = [
    ...(editingCode === "" ? [{ key: "code", label: t("erp.warehouseCode"), type: "text" as const, placeholder: "whD" }] : []),
    { key: "nameTh", label: `${t("erp.warehouseName")} (ไทย)`, type: "text" },
    { key: "nameEn", label: `${t("erp.warehouseName")} (English)`, type: "text" },
    { key: "address", label: t("erp.address"), type: "text" },
    { key: "capacity", label: t("erp.capacity"), type: "number", min: 1, step: 1 },
    { key: "bonded", label: t("erp.bonded"), type: "select", options: [{ value: "yes", label: t("erp.yes") }, { value: "no", label: t("erp.no") }] },
    { key: "active", label: t("common.status"), type: "select", options: [{ value: "yes", label: t("erp.active") }, { value: "no", label: t("erp.inactive") }] },
  ];

  const values: Record<string, FieldValue> = editing
    ? { code: editing.code, nameTh: editing.name.th, nameEn: editing.name.en, address: editing.address, capacity: editing.capacity, bonded: editing.bonded ? "yes" : "no", active: editing.active ? "yes" : "no" }
    : { code: "", nameTh: "", nameEn: "", address: "", capacity: 1000, bonded: "no", active: "yes" };

  const handleSave = async (v: Record<string, FieldValue>) => {
    const warehouse: Warehouse = {
      code: String(editing ? editing.code : v.code),
      name: { th: String(v.nameTh), en: String(v.nameEn) },
      address: String(v.address),
      capacity: Number(v.capacity),
      bonded: v.bonded === "yes",
      active: v.active === "yes",
    };
    if (await runAction(saveWarehouse(warehouse, editing ? "update" : "create"), `${t("common.save")}: ${warehouse.code}`)) setEditingCode(null);
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("erp.page.warehouses")} subtitle={t("erp.page.warehousesSub")} />
        <NewButton label={t("erp.newWarehouse")} allowed={can("manageWarehouses")} onClick={() => setEditingCode("")} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((w) => {
          const pct = Math.round(w.utilisation * 100);
          const tone = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <div key={w.code} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${w.active ? "" : "opacity-60"}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-400">{w.code}</p>
                  <h3 className="truncate text-sm font-semibold text-gray-900">{bi(w.name)}</h3>
                  <p className="truncate text-xs text-gray-400">{w.address}</p>
                </div>
                <div className="flex items-center gap-1">
                  {w.bonded && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                      <ShieldCheck size={11} />
                      {t("erp.bonded")}
                    </span>
                  )}
                  {!w.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{t("erp.inactive")}</span>}
                </div>
              </div>

              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>{t("erp.utilisation")}</span>
                <span>
                  {formatNumber(w.units, lang, 0)} / {formatNumber(w.capacity, lang, 0)} ({pct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400">{t("reports.colLots")}</p>
                  <p className="font-medium text-gray-800">{w.lots}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">SKU</p>
                  <p className="font-medium text-gray-800">{w.skus}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("reports.colStockValue")}</p>
                  <p className="font-medium text-gray-800">
                    <Masked>฿{formatCurrency(w.value, lang)}</Masked>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <Link to={`/inventory?warehouse=${encodeURIComponent(w.code)}`} className="text-xs font-medium text-indigo-600 hover:underline">
                  {t("erp.viewStock")}
                </Link>
                <button
                  onClick={() => setEditingCode(w.code)}
                  disabled={!can("manageWarehouses")}
                  title={!can("manageWarehouses") ? t("erp.noPermission") : undefined}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  {can("manageWarehouses") ? <Pencil size={13} /> : <Lock size={13} />}
                  {t("common.edit")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <EditDrawer
        open={editingCode !== null}
        title={editing ? t("erp.editWarehouse") : t("erp.newWarehouse")}
        subtitle={editing ? `${editing.code} · ${bi(editing.name)}` : undefined}
        note={t("erp.warehouseNote")}
        fields={fields}
        values={values}
        onClose={() => setEditingCode(null)}
        onSave={handleSave}
      />
    </div>
  );
}
