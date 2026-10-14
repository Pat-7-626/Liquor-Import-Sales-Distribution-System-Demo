import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { CountryCode, Supplier } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { NewButton } from "../components/NewButton";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { useRunAction } from "../lib/useRunAction";
import { nextOrderNumber } from "../lib/business";

const COUNTRIES: CountryCode[] = ["scotland", "mexico", "france", "sweden", "uk", "jamaica", "japan"];
const OPEN_STATUSES = new Set(["staging", "pendingApproval", "approved", "customsCleared", "issueDetected"]);

export default function Suppliers() {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { can } = useRole();
  const { suppliers, importOrders, exchangeRates, saveSupplier } = useData();
  const currencies = ["THB", ...[...new Set(exchangeRates.map((r) => r.currency))].sort()];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  /** null = closed, "" = creating, otherwise the supplier being edited. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      suppliers.map((sp) => {
        const orders = importOrders.filter((o) => o.supplierId === sp.supplierId);
        const open = orders.filter((o) => OPEN_STATUSES.has(o.status));
        return { ...sp, orderCount: orders.length, openValue: open.reduce((sum, o) => sum + o.totalValue, 0), openCount: open.length };
      }),
    [suppliers, importOrders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || r.supplierId.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.origin.toLowerCase().includes(q)) &&
        (!statusFilter || (statusFilter === "active") === r.active),
    );
  }, [rows, search, statusFilter]);

  const editing = editingId ? suppliers.find((sp) => sp.supplierId === editingId) ?? null : null;
  const nextId = suppliers.length ? nextOrderNumber(suppliers.map((sp) => sp.supplierId)) : "SUP-001";

  const fields: FieldConfig[] = [
    ...(editingId === "" ? [{ key: "supplierId", label: t("erp.supplierId"), type: "text" as const }] : []),
    { key: "name", label: t("erp.supplierName"), type: "text" },
    { key: "country", label: t("importOrders.col.country"), type: "select", options: COUNTRIES.map((c) => ({ value: c, label: t(`lookup.country.${c}`) })) },
    { key: "origin", label: t("importOrderDetail.origin"), type: "text" },
    { key: "manufacturerRegNo", label: t("importOrderDetail.manufacturerRegNo"), type: "text" },
    { key: "defaultIncoterms", label: t("importOrders.col.incoterms"), type: "select", options: ["CIF", "FOB"].map((v) => ({ value: v, label: v })) },
    // Only currencies with an exchange rate can be ordered in.
    { key: "currency", label: t("importOrderDetail.currency"), type: "select", options: currencies.map((c) => ({ value: c, label: c })) },
    { key: "paymentTerms", label: t("importOrderDetail.paymentTerms"), type: "text" },
    { key: "paymentTermDays", label: t("ap.termDays"), type: "number", suffix: t("ar.days"), min: 0, max: 365 },
    { key: "contactEmail", label: t("erp.contactEmail"), type: "text" },
    { key: "active", label: t("common.status"), type: "select", options: [{ value: "yes", label: t("erp.active") }, { value: "no", label: t("erp.inactive") }] },
  ];

  const values: Record<string, FieldValue> = editing
    ? { ...editing, active: editing.active ? "yes" : "no" }
    : { supplierId: nextId, name: "", country: "scotland", origin: "", manufacturerRegNo: "", defaultIncoterms: "CIF", currency: "USD", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "", active: "yes" };

  const handleSave = async (v: Record<string, FieldValue>) => {
    const supplier: Supplier = {
      supplierId: String(editing ? editing.supplierId : v.supplierId),
      name: String(v.name),
      country: v.country as CountryCode,
      origin: String(v.origin),
      manufacturerRegNo: String(v.manufacturerRegNo),
      defaultIncoterms: String(v.defaultIncoterms),
      currency: String(v.currency),
      paymentTerms: String(v.paymentTerms),
      paymentTermDays: Number(v.paymentTermDays ?? 0),
      contactEmail: String(v.contactEmail),
      active: v.active === "yes",
    };
    if (await runAction(saveSupplier(supplier, editing ? "update" : "create"), `${t("common.save")}: ${supplier.supplierId}`)) setEditingId(null);
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("erp.page.suppliers")} subtitle={t("erp.page.suppliersSub")} />
        <NewButton label={t("erp.newSupplier")} allowed={can("manageSuppliers")} onClick={() => setEditingId("")} />
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("erp.searchSuppliers")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={[
          { value: "active", label: t("erp.active") },
          { value: "inactive", label: t("erp.inactive") },
        ]}
        resultCount={filtered.length}
        totalCount={rows.length}
        onExport={() =>
          exportToExcel(
            "suppliers",
            [t("erp.supplierId"), t("erp.supplierName"), t("importOrders.col.country"), t("importOrderDetail.origin"), t("importOrders.col.incoterms"), t("importOrderDetail.currency"), t("importOrderDetail.paymentTerms"), t("erp.contactEmail"), t("common.status")],
            filtered.map((r) => [r.supplierId, r.name, t(`lookup.country.${r.country}`), r.origin, r.defaultIncoterms, r.currency, r.paymentTerms, r.contactEmail, r.active ? t("erp.active") : t("erp.inactive")]),
          )
        }
      />

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("erp.supplierId")}</th>
            <th className={th}>{t("erp.supplierName")}</th>
            <th className={th}>{t("importOrders.col.country")}</th>
            <th className={th}>{t("importOrders.col.incoterms")}</th>
            <th className={th}>{t("importOrderDetail.currency")}</th>
            <th className={th}>{t("importOrderDetail.paymentTerms")}</th>
            <th className={th}>{t("erp.importOrderCount")}</th>
            <th className={th}>{t("erp.openOrderValue")}</th>
            <th className={th}>{t("common.status")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={10} />}
          {filtered.map((r) => (
            <tr key={r.supplierId} className={`hover:bg-gray-50/60 ${r.active ? "" : "opacity-60"}`}>
              <td className={`${td} font-medium text-gray-900`}>{r.supplierId}</td>
              <td className={td}>
                <p className="font-medium text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-400">{r.contactEmail || r.origin}</p>
              </td>
              <td className={td}>{t(`lookup.country.${r.country}`)}</td>
              <td className={td}>{r.defaultIncoterms}</td>
              <td className={td}>{r.currency}</td>
              <td className={td}>{r.paymentTerms}</td>
              <td className={td}>
                {r.orderCount > 0 ? (
                  <Link to={`/import-orders?q=${encodeURIComponent(r.name)}`} className="text-indigo-600 hover:underline">
                    {r.orderCount}
                    {r.openCount > 0 && <span className="text-gray-400"> ({r.openCount} {t("erp.open")})</span>}
                  </Link>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(r.openValue, lang)}</Masked>
              </td>
              <td className={td}>
                <span className={`text-xs font-medium ${r.active ? "text-emerald-600" : "text-gray-400"}`}>{r.active ? t("erp.active") : t("erp.inactive")}</span>
              </td>
              <td className={td}>
                <button
                  onClick={() => setEditingId(r.supplierId)}
                  disabled={!can("manageSuppliers")}
                  title={!can("manageSuppliers") ? t("erp.noPermission") : undefined}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  {can("manageSuppliers") ? <Pencil size={13} /> : <Lock size={13} />}
                  {t("common.edit")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <EditDrawer
        open={editingId !== null}
        title={editing ? t("erp.editSupplier") : t("erp.newSupplier")}
        subtitle={editing ? `${editing.supplierId} · ${editing.name}` : undefined}
        note={t("erp.supplierNote")}
        fields={fields}
        values={values}
        onClose={() => setEditingId(null)}
        onSave={handleSave}
      />
    </div>
  );
}
