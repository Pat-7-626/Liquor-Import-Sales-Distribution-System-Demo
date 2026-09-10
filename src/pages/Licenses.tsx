import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import type { License } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatDate } from "../lib/format";
import { computeLicenseStatus } from "../lib/business";
import { exportToExcel } from "../lib/export";

const STATUS_OPTIONS = ["expired", "expiringSoon", "normal"];
const CATEGORY_OPTIONS = ["import", "sales"];

export default function Licenses() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const { licenses: rows, updateLicense } = useData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const [editedNos, setEditedNos] = useState<Set<string>>(new Set());

  const computed = useMemo(
    () => rows.map((l) => ({ ...l, ...computeLicenseStatus(l.expiryDate) })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return computed
      .filter((l) => {
        const matchesSearch =
          !q || l.licenseNo.toLowerCase().includes(q) || l.holder.th.includes(search) || l.holder.en.toLowerCase().includes(q);
        const matchesStatus = !statusFilter || l.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      // Soonest-to-expire (or already-expired) first, so renewals can be planned at a glance.
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [computed, search, statusFilter]);

  const editingRow = computed.find((l) => l.licenseNo === editingNo) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "expiryDate", label: t("licenses.col.expiryDate"), type: "date" },
        {
          key: "category",
          label: t("licenses.col.category"),
          type: "select",
          options: CATEGORY_OPTIONS.map((c) => ({ value: c, label: t(`common.${c}`) })),
        },
      ]
    : [];

  const handleSave = (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    updateLicense(editingRow.licenseNo, {
      expiryDate: String(values.expiryDate),
      category: values.category as License["category"],
    });
    setEditedNos((prev) => new Set(prev).add(editingRow.licenseNo));
    setEditingNo(null);
    showToast(`${t("common.save")}: ${editingRow.licenseNo}`);
  };

  const handleExport = () => {
    exportToExcel(
      "licenses",
      [t("licenses.col.licenseNo"), t("licenses.col.type"), t("licenses.col.holder"), t("licenses.col.category"), t("licenses.col.expiryDate"), t("licenses.col.daysRemaining"), t("licenses.col.status")],
      filtered.map((l) => [l.licenseNo, bi(l.type), bi(l.holder), t(`common.${l.category}`), l.expiryDate, l.daysRemaining, t(`status.${l.status}`)]),
    );
  };

  return (
    <div>
      <PageHeader title={t("licenses.title")} subtitle={t("licenses.subtitle")} />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("licenses.searchPlaceholder")}
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
            <th className={th}>{t("licenses.col.licenseNo")}</th>
            <th className={th}>{t("licenses.col.type")}</th>
            <th className={th}>{t("licenses.col.holder")}</th>
            <th className={th}>{t("licenses.col.category")}</th>
            <th className={th}>{t("licenses.col.expiryDate")}</th>
            <th className={th}>{t("licenses.col.daysRemaining")}</th>
            <th className={th}>{t("licenses.col.status")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={8} />}
          {filtered.map((l) => (
            <tr key={l.licenseNo} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>
                {l.licenseNo}
                {editedNos.has(l.licenseNo) && <EditedPill />}
              </td>
              <td className={td}>{bi(l.type)}</td>
              <td className={td}>{bi(l.holder)}</td>
              <td className={td}>{t(`common.${l.category}`)}</td>
              <td className={td}>{formatDate(l.expiryDate, lang)}</td>
              <td className={`${td} ${l.daysRemaining < 0 ? "text-rose-600" : ""}`}>{l.daysRemaining}</td>
              <td className={td}>
                <StatusBadge status={l.status} />
              </td>
              <td className={td}>
                <button
                  onClick={() => setEditingNo(l.licenseNo)}
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
        open={editingNo !== null}
        title={t("licenses.editTitle")}
        subtitle={editingRow ? `${editingRow.licenseNo} · ${bi(editingRow.holder)}` : ""}
        fields={fields}
        values={editingRow ? { expiryDate: editingRow.expiryDate, category: editingRow.category } : {}}
        onClose={() => setEditingNo(null)}
        onSave={handleSave}
      />
    </div>
  );
}
