import { useMemo, useState } from "react";
import { Pencil, Lock, Tags, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { Product } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { Masked } from "../components/Masked";
import { formatCurrency, formatNumber, formatDate } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { productLabels } from "../data/productLabels";

const STATUS_OPTIONS = ["available", "lowStock", "outOfStock"];

export default function Products() {
  const { t, lang } = useLanguage();
  const showToast = useToast();
  const { canViewSensitive } = useRole();
  const { products: rows, updateProduct } = useData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editedSkus, setEditedSkus] = useState<Set<string>>(new Set());
  const [labelsSku, setLabelsSku] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      const matchesSearch = !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const editingRow = rows.find((p) => p.sku === editingSku) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "costPrice", label: t("products.col.costPrice"), type: "number", suffix: "THB" },
        { key: "suggestedPrice", label: t("products.col.suggestedPrice"), type: "number", suffix: "THB" },
        { key: "stockAvailable", label: t("products.col.stockAvailable"), type: "number", suffix: t("lookup.unit." + editingRow.unit) },
        {
          key: "status",
          label: t("products.col.status"),
          type: "select",
          options: STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) })),
        },
      ]
    : [];

  const handleSave = (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    updateProduct(editingRow.sku, {
      costPrice: Number(values.costPrice),
      suggestedPrice: Number(values.suggestedPrice),
      stockAvailable: Number(values.stockAvailable),
      status: values.status as Product["status"],
    });
    setEditedSkus((prev) => new Set(prev).add(editingRow.sku));
    setEditingSku(null);
    showToast(`${t("common.save")}: ${editingRow.sku}`);
  };

  const handleExport = () => {
    exportToExcel(
      "products",
      [t("products.col.sku"), t("products.col.name"), t("products.col.category"), t("products.col.hsCode"), t("products.col.abv"), t("products.col.costPrice"), t("products.col.suggestedPrice"), t("products.col.stockAvailable"), t("products.col.status")],
      filtered.map((p) => [p.sku, p.name, t(`lookup.category.${p.category}`), p.hsCode, p.abv, p.costPrice, p.suggestedPrice, p.stockAvailable, t(`status.${p.status}`)]),
    );
  };

  return (
    <div>
      <PageHeader title={t("products.title")} subtitle={t("products.subtitle")} />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("products.searchPlaceholder")}
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
            <th className={th}>{t("products.col.sku")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("products.col.category")}</th>
            <th className={th}>{t("products.col.hsCode")}</th>
            <th className={th}>{t("products.col.abv")}</th>
            <th className={th}>{t("products.col.packageSize")}</th>
            <th className={th}>{t("products.col.costPrice")}</th>
            <th className={th}>{t("products.col.suggestedPrice")}</th>
            <th className={th}>{t("products.col.stockAvailable")}</th>
            <th className={th}>{t("products.col.status")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={11} />}
          {filtered.map((p) => (
            <tr key={p.sku} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>{p.sku}</td>
              <td className={td}>
                {p.name}
                {editedSkus.has(p.sku) && <EditedPill />}
              </td>
              <td className={td}>{t(`lookup.category.${p.category}`)}</td>
              <td className={`${td} font-mono text-xs text-gray-500`}>{p.hsCode}</td>
              <td className={td}>{p.abv}%</td>
              <td className={td}>
                {p.packageSize} ml · {t(`lookup.unit.${p.unit}`)}
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(p.costPrice, lang)}</Masked>
              </td>
              <td className={td}>฿{formatCurrency(p.suggestedPrice, lang)}</td>
              <td className={td}>{formatNumber(p.stockAvailable, lang, 0)}</td>
              <td className={td}>
                <StatusBadge status={p.status} />
              </td>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLabelsSku(p.sku)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Tags size={13} />
                    {t("productLabels.action")}
                  </button>
                  <button
                    onClick={() => setEditingSku(p.sku)}
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
        open={editingSku !== null}
        title={t("products.editTitle")}
        subtitle={editingRow ? `${editingRow.sku} · ${editingRow.name}` : ""}
        fields={fields}
        values={
          editingRow
            ? {
                costPrice: editingRow.costPrice,
                suggestedPrice: editingRow.suggestedPrice,
                stockAvailable: editingRow.stockAvailable,
                status: editingRow.status,
              }
            : {}
        }
        onClose={() => setEditingSku(null)}
        onSave={handleSave}
      />

      {labelsSku && (
        <>
          <div onClick={() => setLabelsSku(null)} className="fixed inset-0 z-30 bg-gray-900/30" />
          <div className="fixed left-1/2 top-1/2 z-40 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t("productLabels.title")}</h3>
                <p className="text-sm text-gray-500">{labelsSku}</p>
              </div>
              <button onClick={() => setLabelsSku(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            {(productLabels[labelsSku]?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("productLabels.noLabels")}</p>
            ) : (
              <ul className="space-y-3">
                {productLabels[labelsSku].map((l) => (
                  <li key={l.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{l.version}</span>
                      <span className="text-gray-400">{formatDate(l.registeredDate, lang)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{lang === "th" ? l.note.th : l.note.en}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
