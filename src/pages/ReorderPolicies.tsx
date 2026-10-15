import { useMemo, useState } from "react";
import { Pencil, Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatNumber } from "../lib/format";
import { computeInboundBySku } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useRunAction } from "../lib/useRunAction";
import { both } from "../i18n/translations";

export default function ReorderPolicies() {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { can } = useRole();
  const { products, reorderPolicies, suppliers, importOrders, saveReorderPolicy } = useData();
  const [search, setSearch] = useState("");
  const [editingSku, setEditingSku] = useState<string | null>(null);

  const inbound = useMemo(() => computeInboundBySku(importOrders), [importOrders]);
  const rows = useMemo(
    () =>
      products.map((p) => {
        const policy = reorderPolicies.find((r) => r.sku === p.sku);
        return { product: p, policy, inbound: inbound.get(p.sku) ?? 0 };
      }),
    [products, reorderPolicies, inbound],
  );
  const filtered = rows.filter(({ product: p }) => {
    const q = search.trim().toLowerCase();
    return !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const editingRow = rows.find((r) => r.product.sku === editingSku) ?? null;
  const fields: FieldConfig[] = [
    { key: "reorderPoint", label: t("erp.reorderPoint"), type: "number", min: 0, step: 1 },
    { key: "reorderQty", label: t("erp.reorderQty"), type: "number", min: 1, step: 1 },
    {
      key: "preferredSupplierId",
      label: t("erp.preferredSupplier"),
      type: "select",
      options: [{ value: "", label: "—" }, ...suppliers.filter((s) => s.active).map((s) => ({ value: s.supplierId, label: `${s.supplierId} · ${s.name}` }))],
    },
  ];

  const handleSave = async (v: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const result = await saveReorderPolicy({
      sku: editingRow.product.sku,
      reorderPoint: Number(v.reorderPoint),
      reorderQty: Number(v.reorderQty),
      preferredSupplierId: String(v.preferredSupplierId) || null,
    });
    if (await runAction(result, `${t("common.save")}: ${editingRow.product.sku}`)) setEditingSku(null);
  };

  return (
    <div>
      <PageHeader title={t("erp.page.reorderPolicies")} subtitle={t("erp.page.reorderPoliciesSub")} />
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("products.searchPlaceholder")}
        resultCount={filtered.length}
        totalCount={rows.length}
        onExport={() =>
          exportToExcel(
            "reorder-policies",
            [both("products.col.sku"), both("products.col.name"), both("erp.reorderPoint"), both("erp.reorderQty"), both("erp.preferredSupplier")],
            filtered.map((r) => [r.product.sku, r.product.name, r.policy?.reorderPoint ?? "", r.policy?.reorderQty ?? "", r.policy?.preferredSupplierId ?? ""]),
          )
        }
      />
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("products.col.sku")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("products.col.stockAvailable")}</th>
            <th className={th}>{t("erp.inbound")}</th>
            <th className={th}>{t("erp.reorderPoint")}</th>
            <th className={th}>{t("erp.reorderQty")}</th>
            <th className={th}>{t("erp.preferredSupplier")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={8} />}
          {filtered.map(({ product: p, policy, inbound: inb }) => {
            const below = policy ? p.stockAvailable + inb <= policy.reorderPoint : false;
            return (
              <tr key={p.sku} className="hover:bg-gray-50/60">
                <td className={`${td} font-medium text-gray-900`}>{p.sku}</td>
                <td className={td}>{p.name}</td>
                <td className={`${td} ${below ? "font-medium text-rose-600" : ""}`}>{formatNumber(p.stockAvailable, lang, 0)}</td>
                <td className={td}>{inb > 0 ? `+${formatNumber(inb, lang, 0)}` : <span className="text-gray-400">0</span>}</td>
                <td className={td}>{policy ? formatNumber(policy.reorderPoint, lang, 0) : <span className="text-gray-400">{t("erp.notSet")}</span>}</td>
                <td className={td}>{policy ? formatNumber(policy.reorderQty, lang, 0) : "—"}</td>
                <td className={td}>{suppliers.find((s) => s.supplierId === policy?.preferredSupplierId)?.name ?? <span className="text-gray-400">—</span>}</td>
                <td className={td}>
                  <button
                    onClick={() => setEditingSku(p.sku)}
                    disabled={!can("manageReorder")}
                    title={!can("manageReorder") ? t("erp.noPermission") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {can("manageReorder") ? <Pencil size={13} /> : <Lock size={13} />}
                    {t("common.edit")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableContainer>

      <EditDrawer
        open={editingSku !== null}
        title={t("erp.editReorderPolicy")}
        subtitle={editingRow ? `${editingRow.product.sku} · ${editingRow.product.name}` : undefined}
        note={t("erp.reorderNote")}
        fields={fields}
        values={
          editingRow
            ? {
                reorderPoint: editingRow.policy?.reorderPoint ?? 0,
                reorderQty: editingRow.policy?.reorderQty ?? 100,
                preferredSupplierId: editingRow.policy?.preferredSupplierId ?? "",
              }
            : {}
        }
        onClose={() => setEditingSku(null)}
        onSave={handleSave}
      />
    </div>
  );
}
