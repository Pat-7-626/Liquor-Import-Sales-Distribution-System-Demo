import { useMemo, useState } from "react";
import { Upload, Pencil, Lock, Tags, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { Masked } from "../components/Masked";
import { formatCurrency, formatNumber, formatDate, maskIfRestricted } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { productLabels } from "../data/productLabels";
import { useRunAction } from "../lib/useRunAction";
import { NewButton } from "../components/NewButton";
import { CsvImportDialog } from "../components/CsvImport";
import type { NewProductInput } from "../state/DataContext";
import type { CategoryCode, UnitCode } from "../data/types";

const CATEGORIES: CategoryCode[] = ["whisky", "tequila", "redWine", "whiteWine", "vodka", "gin", "liqueur", "rum", "beer"];
const UNITS: UnitCode[] = ["bottle", "pack"];

const STATUS_OPTIONS = ["available", "lowStock", "outOfStock"];

export default function Products() {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { canViewSensitive, can } = useRole();
  const { products: rows, updateProduct, createProduct } = useData();
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
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
        { key: "costPrice", label: t("products.col.costPrice"), type: "number", suffix: "THB", min: 0 },
        { key: "suggestedPrice", label: t("products.col.suggestedPrice"), type: "number", suffix: "THB", min: 0 },
      ]
    : [];

  const handleSave = async (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const result = await updateProduct(editingRow.sku, {
      costPrice: Number(values.costPrice),
      suggestedPrice: Number(values.suggestedPrice),
    });
    if (!await runAction(result, `${t("common.save")}: ${editingRow.sku}`)) return;
    setEditedSkus((prev) => new Set(prev).add(editingRow.sku));
    setEditingSku(null);
  };

  const handleExport = () => {
    exportToExcel(
      "products",
      [t("products.col.sku"), t("products.col.name"), t("products.col.category"), t("products.col.hsCode"), t("products.col.abv"), t("products.col.packageSize"), t("products.col.unit"), t("products.col.costPrice"), t("products.col.suggestedPrice"), t("products.col.stockAvailable"), t("products.col.status")],
      filtered.map((p) => [p.sku, p.name, t(`lookup.category.${p.category}`), p.hsCode, p.abv, p.packageSize, t(`lookup.unit.${p.unit}`), maskIfRestricted(p.costPrice, canViewSensitive), p.suggestedPrice, p.stockAvailable, t(`status.${p.status}`)]),
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("products.title")} subtitle={t("products.subtitle")} />
        <div className="flex flex-wrap items-center gap-2">
          {can("editProduct") && (
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="csv-open"
            >
              <Upload size={15} />
              {t("csv.button")}
            </button>
          )}
          <NewButton label={t("erp.newProduct")} allowed={can("editProduct")} onClick={() => setCreating(true)} />
        </div>
      </div>

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
        <thead className="sticky top-0 z-10 bg-gray-50">
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
              <td className={td}>
                ฿{formatCurrency(p.suggestedPrice, lang)}
                {canViewSensitive && p.costPrice > 0 && (
                  <span className={`ml-1.5 text-xs ${p.suggestedPrice <= p.costPrice ? "text-rose-500" : "text-gray-400"}`}>
                    ({Math.round(((p.suggestedPrice - p.costPrice) / p.suggestedPrice) * 100)}%)
                  </span>
                )}
              </td>
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
                    disabled={!can("editProduct")}
                    title={!can("editProduct") ? t("erp.noPermission") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {can("editProduct") ? <Pencil size={13} /> : <Lock size={13} />}
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
        note={t("erp.productEditNote")}
        fields={fields}
        values={
          editingRow
            ? {
                costPrice: editingRow.costPrice,
                suggestedPrice: editingRow.suggestedPrice,
              }
            : {}
        }
        onClose={() => setEditingSku(null)}
        onSave={handleSave}
      />

      <EditDrawer
        open={creating}
        title={t("erp.newProduct")}
        note={t("erp.newProductNote")}
        fields={[
          { key: "sku", label: t("products.col.sku"), type: "text", placeholder: "SKU-1013" },
          { key: "name", label: t("products.col.name"), type: "text" },
          { key: "category", label: t("products.col.category"), type: "select", options: CATEGORIES.map((c) => ({ value: c, label: t(`lookup.category.${c}`) })) },
          { key: "hsCode", label: t("products.col.hsCode"), type: "text", placeholder: "2208.30" },
          { key: "abv", label: t("products.col.abv"), type: "number", suffix: "%", min: 0, max: 75, step: 0.1 },
          { key: "packageSize", label: t("products.col.packageSize"), type: "number", suffix: "ml", min: 1 },
          { key: "unit", label: t("products.col.unit"), type: "select", options: UNITS.map((u) => ({ value: u, label: t(`lookup.unit.${u}`) })) },
          { key: "costPrice", label: t("products.col.costPrice"), type: "number", suffix: "THB", min: 0 },
          { key: "suggestedPrice", label: t("products.col.suggestedPrice"), type: "number", suffix: "THB", min: 0 },
        ]}
        values={{ sku: "", name: "", category: "whisky", hsCode: "", abv: 40, packageSize: 700, unit: "bottle", costPrice: 0, suggestedPrice: 0 }}
        onClose={() => setCreating(false)}
        onSave={async (v) => {
          const result = await createProduct({
            sku: String(v.sku),
            name: String(v.name),
            category: v.category as CategoryCode,
            hsCode: String(v.hsCode),
            abv: Number(v.abv),
            packageSize: Number(v.packageSize),
            unit: v.unit as UnitCode,
            costPrice: Number(v.costPrice),
            suggestedPrice: Number(v.suggestedPrice),
          });
          if (await runAction(result, `${t("erp.created")}: ${String(v.sku).toUpperCase()}`)) setCreating(false);
        }}
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
      {importing && (
        <CsvImportDialog<NewProductInput>
          title={t("csv.productsTitle")}
          templateName="products"
          columns={[
            { key: "sku", example: "SKU-2001", required: true },
            { key: "name", example: "Golden Barrel Single Malt 15Y", required: true },
            { key: "category", example: "whisky", required: true },
            { key: "abv", example: "43", required: true },
            { key: "packageSize", example: "700", required: true },
            { key: "unit", example: "bottle", required: true },
            { key: "costPrice", example: "2650", required: true },
            { key: "suggestedPrice", example: "3490", required: true },
            { key: "hsCode", example: "2208.30", required: true },
          ]}
          toInput={(c) => {
            const nums = ["abv", "packageSize", "costPrice", "suggestedPrice"].map((k) => Number(c[k]));
            if (!c.sku || !c.name) return { problem: { th: "ต้องมี sku และ name", en: "sku and name are required" } };
            if (nums.some((n) => !Number.isFinite(n))) return { problem: { th: "ตัวเลขไม่ถูกต้อง", en: "A number column isn't a number" } };
            if (!CATEGORIES.includes(c.category as CategoryCode))
              return { problem: { th: `category ต้องเป็น ${CATEGORIES.join(", ")}`, en: `category must be one of ${CATEGORIES.join(", ")}` } };
            if (c.unit !== "bottle" && c.unit !== "pack") return { problem: { th: "unit ต้องเป็น bottle หรือ pack", en: "unit must be bottle or pack" } };
            return {
              input: {
                sku: c.sku.toUpperCase(),
                name: c.name,
                category: c.category as CategoryCode,
                abv: nums[0],
                packageSize: nums[1],
                unit: c.unit as UnitCode,
                costPrice: nums[2],
                suggestedPrice: nums[3],
                hsCode: c.hsCode,
              },
            };
          }}
          submit={(input) => createProduct(input)}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}
