import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Lock, Table2, GanttChart } from "lucide-react";
import { ViewSwitcher, useViewMode } from "../components/ViewSwitcher";
import { TimelineBars } from "../components/TimelineBars";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatDate } from "../lib/format";
import { computeLicenseStatus } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useRunAction } from "../lib/useRunAction";
import { NewButton } from "../components/NewButton";
import type { Bilingual, LicenseCategory } from "../data/types";
import { addDays, todayIso } from "../lib/business";
import { both } from "../i18n/translations";

const OUR_COMPANY: Bilingual = { th: "บริษัท เรา จำกัด", en: "Our Company Co., Ltd." };
const LICENSE_TYPES: { key: string; category: LicenseCategory; type: Bilingual }[] = [
  { key: "imp1", category: "import", type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 1", en: "Import License Type 1" } },
  { key: "imp5", category: "import", type: { th: "ใบอนุญาตนำเข้า ประเภทที่ 5", en: "Import License Type 5" } },
  { key: "wholesale", category: "sales", type: { th: "ใบอนุญาตขายส่งสุรา", en: "Liquor Wholesale License" } },
  { key: "retail", category: "sales", type: { th: "ใบอนุญาตขายปลีกสุรา", en: "Liquor Retail License" } },
  { key: "bar", category: "sales", type: { th: "ใบอนุญาตขายสุรา (ร้านอาหาร/บาร์)", en: "Liquor License (Restaurant/Bar)" } },
];

const STATUS_OPTIONS = ["expired", "expiringSoon", "normal"];
const VIEWS = ["timeline", "table"] as const;
type View = (typeof VIEWS)[number];

export default function Licenses() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { can } = useRole();
  const { licenses: rows, customers, updateLicense, createLicense } = useData();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const [editedNos, setEditedNos] = useState<Set<string>>(new Set());
  const [view, setView] = useViewMode<View>("licenses", VIEWS, "timeline");

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
      ]
    : [];

  const handleSave = async (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const result = await updateLicense(editingRow.licenseNo, { expiryDate: String(values.expiryDate) });
    if (!await runAction(result, `${t("common.save")}: ${editingRow.licenseNo}`)) return;
    setEditedNos((prev) => new Set(prev).add(editingRow.licenseNo));
    setEditingNo(null);
  };

  const handleExport = () => {
    exportToExcel(
      "licenses",
      [both("licenses.col.licenseNo"), both("licenses.col.type"), both("licenses.col.holder"), both("licenses.col.category"), both("licenses.col.expiryDate"), both("licenses.col.daysRemaining"), both("licenses.col.status")],
      filtered.map((l) => [l.licenseNo, bi(l.type), bi(l.holder), t(`common.${l.category}`), l.expiryDate, l.daysRemaining, t(`status.${l.status}`)]),
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("licenses.title")} subtitle={t("licenses.subtitle")} />
        <NewButton label={t("erp.newLicense")} allowed={can("editLicense")} onClick={() => setCreating(true)} />
      </div>

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
        views={
          <ViewSwitcher
            value={view}
            onChange={setView}
            options={[
              { value: "timeline", label: t("views.timeline"), icon: GanttChart },
              { value: "table", label: t("views.table"), icon: Table2 },
            ]}
          />
        }
      />

      {view === "timeline" && (
        <TimelineBars
          rows={filtered.map((l) => {
            const holder = customers.find((c) => c.licenseNo === l.licenseNo);
            return {
              key: l.licenseNo,
              label: (
                <>
                  {l.licenseNo} <span className="font-normal text-gray-500">· {t(`common.${l.category}`)}</span>
                </>
              ),
              sublabel: bi(l.holder),
              start: l.issueDate,
              end: l.expiryDate,
              tone: l.status === "expired" ? "red" : l.status === "expiringSoon" ? "amber" : "green",
              note:
                l.daysRemaining < 0
                  ? t("views.expiredAgo").replace("{n}", String(-l.daysRemaining))
                  : l.daysRemaining <= 60
                    ? t("views.expiresIn").replace("{n}", String(l.daysRemaining))
                    : undefined,
              href: holder ? `/customers/${holder.customerId}` : undefined,
              action: (
                <button
                  onClick={() => setEditingNo(l.licenseNo)}
                  disabled={!can("editLicense")}
                  title={!can("editLicense") ? t("erp.noPermission") : undefined}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  {can("editLicense") ? <Pencil size={13} /> : <Lock size={13} />}
                  {t("erp.renew")}
                </button>
              ),
            };
          })}
        />
      )}

      {view === "table" && (
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
              <td className={td}>
                {(() => {
                  const holderCustomer = customers.find((c) => c.licenseNo === l.licenseNo);
                  return holderCustomer ? (
                    <Link to={`/customers/${holderCustomer.customerId}`} className="hover:text-indigo-600 hover:underline">
                      {bi(l.holder)}
                    </Link>
                  ) : (
                    bi(l.holder)
                  );
                })()}
              </td>
              <td className={td}>{t(`common.${l.category}`)}</td>
              <td className={td}>{formatDate(l.expiryDate, lang)}</td>
              <td className={`${td} ${l.daysRemaining < 0 ? "text-rose-600" : ""}`}>{l.daysRemaining}</td>
              <td className={td}>
                <StatusBadge status={l.status} />
              </td>
              <td className={td}>
                <button
                  onClick={() => setEditingNo(l.licenseNo)}
                  disabled={!can("editLicense")}
                  title={!can("editLicense") ? t("erp.noPermission") : undefined}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  {can("editLicense") ? <Pencil size={13} /> : <Lock size={13} />}
                  {t("erp.renew")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      )}

      <EditDrawer
        open={creating}
        title={t("erp.newLicense")}
        note={t("erp.newLicenseNote")}
        fields={[
          { key: "licenseNo", label: t("licenses.col.licenseNo"), type: "text", placeholder: "LIC-IMP-0013" },
          { key: "typeKey", label: t("licenses.col.type"), type: "select", options: LICENSE_TYPES.map((lt) => ({ value: lt.key, label: bi(lt.type) })) },
          { key: "holderTh", label: `${t("licenses.col.holder")} (ไทย)`, type: "text" },
          { key: "holderEn", label: `${t("licenses.col.holder")} (English)`, type: "text" },
          { key: "issueDate", label: t("erp.issueDate"), type: "date" },
          { key: "expiryDate", label: t("licenses.col.expiryDate"), type: "date" },
        ]}
        values={{ licenseNo: "", typeKey: "imp1", holderTh: OUR_COMPANY.th, holderEn: OUR_COMPANY.en, issueDate: todayIso(), expiryDate: addDays(todayIso(), 365) }}
        onClose={() => setCreating(false)}
        onSave={async (v) => {
          const lt = LICENSE_TYPES.find((x) => x.key === v.typeKey) ?? LICENSE_TYPES[0];
          const result = await createLicense({
            licenseNo: String(v.licenseNo),
            type: lt.type,
            category: lt.category,
            holder: { th: String(v.holderTh), en: String(v.holderEn) },
            issueDate: String(v.issueDate),
            expiryDate: String(v.expiryDate),
          });
          if (await runAction(result, `${t("erp.created")}: ${String(v.licenseNo).toUpperCase()}`)) setCreating(false);
        }}
      />

      <EditDrawer
        open={editingNo !== null}
        title={t("licenses.editTitle")}
        subtitle={editingRow ? `${editingRow.licenseNo} · ${bi(editingRow.holder)}` : ""}
        note={t("erp.licenseRenewNote")}
        fields={fields}
        values={editingRow ? { expiryDate: editingRow.expiryDate } : {}}
        onClose={() => setEditingNo(null)}
        onSave={handleSave}
      />
    </div>
  );
}
