import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Lock, Eye } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { Customer } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency, formatDate } from "../lib/format";
import { computeCreditStatus } from "../lib/business";
import { exportToExcel } from "../lib/export";

const STATUS_OPTIONS = ["normal", "nearLimit", "overLimit", "noLicense"];
const CHANNEL_OPTIONS = ["distributor", "retailWholesale", "restaurantBar", "online"];

export default function Customers() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const { canViewSensitive } = useRole();
  const { customers: rows, updateCustomer } = useData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());

  const computed = useMemo(
    () =>
      rows.map((c) => ({
        ...c,
        ...computeCreditStatus(c.creditLimit, c.outstandingBalance, c.licenseNo !== null),
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return computed.filter((c) => {
      const matchesSearch =
        !q || c.customerId.toLowerCase().includes(q) || c.name.th.includes(search) || c.name.en.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || c.creditStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [computed, search, statusFilter]);

  const editingRow = computed.find((c) => c.customerId === editingId) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "creditLimit", label: t("customers.col.creditLimit"), type: "number", suffix: "THB" },
        { key: "outstandingBalance", label: t("customers.col.outstandingBalance"), type: "number", suffix: "THB" },
        { key: "standardDiscount", label: t("customers.col.standardDiscount"), type: "number", suffix: "%" },
        {
          key: "channelType",
          label: t("customers.col.channelType"),
          type: "select",
          options: CHANNEL_OPTIONS.map((c) => ({ value: c, label: t(`lookup.channel.${c}`) })),
        },
      ]
    : [];

  const handleSave = (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    updateCustomer(editingRow.customerId, {
      creditLimit: Number(values.creditLimit),
      outstandingBalance: Number(values.outstandingBalance),
      standardDiscount: Number(values.standardDiscount),
      channelType: values.channelType as Customer["channelType"],
    });
    setEditedIds((prev) => new Set(prev).add(editingRow.customerId));
    setEditingId(null);
    showToast(`${t("common.save")}: ${editingRow.customerId}`);
  };

  const handleExport = () => {
    exportToExcel(
      "customers",
      [t("customers.col.customerId"), t("customers.col.name"), t("customers.col.channelType"), t("customers.col.licenseNo"), t("customers.col.creditLimit"), t("customers.col.outstandingBalance"), t("customers.col.creditRemaining"), t("customers.col.standardDiscount"), t("customers.col.creditStatus")],
      filtered.map((c) => [c.customerId, bi(c.name), t(`lookup.channel.${c.channelType}`), c.licenseNo ?? "", c.creditLimit, c.outstandingBalance, c.creditRemaining, c.standardDiscount, t(`status.${c.creditStatus}`)]),
    );
  };

  return (
    <div>
      <PageHeader title={t("customers.title")} subtitle={t("customers.subtitle")} />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("customers.searchPlaceholder")}
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
            <th className={th}>{t("customers.col.customerId")}</th>
            <th className={th}>{t("customers.col.name")}</th>
            <th className={th}>{t("customers.col.channelType")}</th>
            <th className={th}>{t("customers.col.licenseNo")}</th>
            <th className={th}>{t("customers.col.creditLimit")}</th>
            <th className={th}>{t("customers.col.outstandingBalance")}</th>
            <th className={th}>{t("customers.col.creditRemaining")}</th>
            <th className={th}>{t("customers.col.standardDiscount")}</th>
            <th className={th}>{t("customers.col.creditStatus")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={10} />}
          {filtered.map((c) => (
            <tr key={c.customerId} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>
                {c.customerId}
                {editedIds.has(c.customerId) && <EditedPill />}
              </td>
              <td className={td}>{bi(c.name)}</td>
              <td className={td}>{t(`lookup.channel.${c.channelType}`)}</td>
              <td className={td}>
                {c.licenseNo ?? <span className="text-gray-300">{t("customers.noLicenseValue")}</span>}
                {c.licenseExpiry && (
                  <span className="ml-1.5 text-xs text-gray-400">({formatDate(c.licenseExpiry, lang)})</span>
                )}
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(c.creditLimit, lang)}</Masked>
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(c.outstandingBalance, lang)}</Masked>
              </td>
              <td className={`${td} ${c.creditRemaining < 0 ? "text-rose-600" : ""}`}>
                <Masked>฿{formatCurrency(c.creditRemaining, lang)}</Masked>
              </td>
              <td className={td}>
                <Masked>{c.standardDiscount}%</Masked>
              </td>
              <td className={td}>
                <StatusBadge status={c.creditStatus} />
              </td>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/customers/${c.customerId}`}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Eye size={13} />
                    {t("common.viewDetails")}
                  </Link>
                  <button
                    onClick={() => setEditingId(c.customerId)}
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
        open={editingId !== null}
        title={t("customers.editTitle")}
        subtitle={editingRow ? `${editingRow.customerId} · ${bi(editingRow.name)}` : ""}
        fields={fields}
        values={
          editingRow
            ? {
                creditLimit: editingRow.creditLimit,
                outstandingBalance: editingRow.outstandingBalance,
                standardDiscount: editingRow.standardDiscount,
                channelType: editingRow.channelType,
              }
            : {}
        }
        onClose={() => setEditingId(null)}
        onSave={handleSave}
      />
    </div>
  );
}
