import { useMemo, useState } from "react";
import { Upload, Pencil, Lock, LayoutGrid, Table2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { Customer } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { ViewSwitcher, useViewMode } from "../components/ViewSwitcher";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency, formatDate, maskIfRestricted } from "../lib/format";
import { SALES_CHANNEL_OPTIONS, nextOrderNumber, todayIso } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useRunAction } from "../lib/useRunAction";
import { NewButton } from "../components/NewButton";
import { CsvImportDialog } from "../components/CsvImport";
import type { NewCustomerInput } from "../state/DataContext";
import { both } from "../i18n/translations";
import { RecordLink, paths } from "../components/RecordLink";

const STATUS_OPTIONS = ["normal", "nearLimit", "overLimit", "noLicense"];

const VIEWS = ["table", "cards"] as const;
type View = (typeof VIEWS)[number];
const METER: Record<string, string> = { normal: "bg-emerald-500", nearLimit: "bg-amber-500", overLimit: "bg-rose-600", noLicense: "bg-gray-400" };

export default function Customers() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { canViewSensitive, can } = useRole();
  const { customers: rows, licenses, updateCustomerTerms, createCustomer } = useData();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const freeSalesLicenses = licenses.filter((l) => l.category === "sales" && !rows.some((c) => c.licenseNo === l.licenseNo));
  const nextCustomerId = rows.length ? nextOrderNumber(rows.map((c) => c.customerId)) : "CUS-0001";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useViewMode<View>("customers", VIEWS, "table");

  const computed = useMemo(
    () =>
      rows.map((c) => ({
        ...c,
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
        { key: "creditLimit", label: t("customers.col.creditLimit"), type: "number", suffix: "THB", min: 0 },
        { key: "standardDiscount", label: t("customers.col.standardDiscount"), type: "number", suffix: "%", min: 0, max: 100 },
        { key: "creditTermDays", label: t("ar.creditTermDays"), type: "number", suffix: t("ar.days"), min: 0, max: 365 },
        {
          key: "channelType",
          label: t("customers.col.channelType"),
          type: "select",
          options: SALES_CHANNEL_OPTIONS.map((c) => ({ value: c, label: t(`lookup.channel.${c}`) })),
        },
      ]
    : [];

  const handleSave = async (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const result = await updateCustomerTerms(editingRow.customerId, {
      creditLimit: Number(values.creditLimit),
      standardDiscount: Number(values.standardDiscount),
      channelType: values.channelType as Customer["channelType"],
      creditTermDays: Number(values.creditTermDays),
    });
    if (!await runAction(result, `${t("common.save")}: ${editingRow.customerId}`)) return;
    setEditedIds((prev) => new Set(prev).add(editingRow.customerId));
    setEditingId(null);
  };

  const handleExport = () => {
    exportToExcel(
      "customers",
      [both("customers.col.customerId"), both("customers.col.name"), both("customers.col.channelType"), both("customers.col.licenseNo"), both("customers.col.creditLimit"), both("customers.col.outstandingBalance"), both("customers.col.creditRemaining"), both("customers.col.standardDiscount"), both("customers.col.creditStatus")],
      filtered.map((c) => [
        c.customerId,
        bi(c.name),
        t(`lookup.channel.${c.channelType}`),
        c.licenseNo ?? "",
        maskIfRestricted(c.creditLimit, canViewSensitive),
        maskIfRestricted(c.outstandingBalance, canViewSensitive),
        maskIfRestricted(c.creditRemaining, canViewSensitive),
        maskIfRestricted(c.standardDiscount, canViewSensitive),
        t(`status.${c.creditStatus}`),
      ]),
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("customers.title")} subtitle={t("customers.subtitle")} />
        <div className="flex flex-wrap items-center gap-2">
          {can("createCustomer") && (
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="csv-open"
            >
              <Upload size={15} />
              {t("csv.button")}
            </button>
          )}
          <NewButton label={t("erp.newCustomer")} allowed={can("createCustomer")} onClick={() => setCreating(true)} />
        </div>
      </div>

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
        views={
          <ViewSwitcher
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: t("views.table"), icon: Table2 },
              { value: "cards", label: t("views.cards"), icon: LayoutGrid },
            ]}
          />
        }
      />

      {view === "cards" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.length === 0 && <p className="col-span-full py-12 text-center text-sm text-gray-400">{t("common.noResults")}</p>}
          {filtered.map((c) => {
            const used = c.creditLimit > 0 ? c.outstandingBalance / c.creditLimit : c.outstandingBalance > 0 ? 1 : 0;
            return (
              <article key={c.customerId} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <RecordLink to={paths.customer(c.customerId)} className="block truncate font-semibold">
                      {bi(c.name)}
                    </RecordLink>
                    <p className="text-xs text-gray-500">
                      {c.customerId} · {t(`lookup.channel.${c.channelType}`)}
                      {editedIds.has(c.customerId) && <EditedPill />}
                    </p>
                  </div>
                  <StatusBadge status={c.creditStatus} />
                </div>

                {/* Credit used: the bar is the share of the limit already owed. */}
                <div className="mt-4">
                  <div className="mb-1 flex items-baseline justify-between text-xs text-gray-500">
                    <span>{t("views.creditUsed")}</span>
                    <Masked>
                      <span className="tabular-nums">
                        <span className="font-semibold text-gray-900">฿{formatCurrency(c.outstandingBalance, lang)}</span> / ฿{formatCurrency(c.creditLimit, lang)}
                      </span>
                    </Masked>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={canViewSensitive ? Math.round(used * 100) : undefined} aria-label={t("views.creditUsed")}>
                    {canViewSensitive && <div className={`h-full rounded-full ${METER[c.creditStatus]}`} style={{ width: `${Math.min(100, used * 100)}%` }} />}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-500">{t("ar.creditTermDays")}</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{t("ar.netDays").replace("{n}", String(c.creditTermDays))}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t("customers.col.standardDiscount")}</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">
                      <Masked>{c.standardDiscount}%</Masked>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t("customers.col.licenseNo")}</dt>
                    <dd className={`mt-0.5 font-medium ${c.licenseExpiry && c.licenseExpiry < todayIso() ? "text-rose-700" : "text-gray-900"}`}>
                      {c.licenseExpiry ? formatDate(c.licenseExpiry, lang) : <span className="text-gray-400">{t("customers.noLicenseValue")}</span>}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-end gap-1 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setEditingId(c.customerId)}
                    disabled={!can("editCustomerTerms")}
                    title={!can("editCustomerTerms") ? t("erp.customerTermsPermission") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {can("editCustomerTerms") ? <Pencil size={13} /> : <Lock size={13} />}
                    {t("common.edit")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {view === "table" && (
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
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
              <td className={`${td} whitespace-nowrap`}>
                <RecordLink to={paths.customer(c.customerId)}>{c.customerId}</RecordLink>
                {editedIds.has(c.customerId) && <EditedPill />}
              </td>
              <td className={td}>
                <RecordLink to={paths.customer(c.customerId)} className="font-normal" testid="customer-link">
                  {bi(c.name)}
                </RecordLink>
              </td>
              <td className={td}>{t(`lookup.channel.${c.channelType}`)}</td>
              <td className={td}>
                {c.licenseNo ?? <span className="text-gray-400">{t("customers.noLicenseValue")}</span>}
                {c.licenseExpiry && (
                  <span className="ml-1.5 text-xs text-gray-400">({formatDate(c.licenseExpiry, lang)})</span>
                )}
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(c.creditLimit, lang)}</Masked>
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(c.outstandingBalance, lang)}</Masked>
                {/* Share of the credit limit in use — comparable down the column at a glance. */}
                {canViewSensitive && (
                  <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-gray-100" title={`${t("views.creditUsed")}: ${Math.round((c.creditLimit > 0 ? c.outstandingBalance / c.creditLimit : 1) * 100)}%`}>
                    <div
                      className={`h-full rounded-full ${METER[c.creditStatus]}`}
                      style={{ width: `${Math.min(100, (c.creditLimit > 0 ? c.outstandingBalance / c.creditLimit : c.outstandingBalance > 0 ? 1 : 0) * 100)}%` }}
                    />
                  </div>
                )}
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
                  <button
                    onClick={() => setEditingId(c.customerId)}
                    disabled={!can("editCustomerTerms")}
                    title={!can("editCustomerTerms") ? t("erp.customerTermsPermission") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {can("editCustomerTerms") ? <Pencil size={13} /> : <Lock size={13} />}
                    {t("common.edit")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      )}

      <EditDrawer
        open={creating}
        title={t("erp.newCustomer")}
        note={can("editCustomerTerms") ? t("erp.newCustomerNote") : t("erp.newCustomerNoTermsNote")}
        fields={[
          { key: "customerId", label: t("customers.col.customerId"), type: "text" },
          { key: "nameTh", label: `${t("customers.col.name")} (ไทย)`, type: "text" },
          { key: "nameEn", label: `${t("customers.col.name")} (English)`, type: "text" },
          { key: "taxId", label: t("tax.taxId"), type: "text", placeholder: "0105xxxxxxxxx" },
          { key: "branch", label: t("tax.branch"), type: "text", placeholder: "00000" },
          { key: "addressTh", label: `${t("tax.address")} (ไทย)`, type: "text" },
          { key: "addressEn", label: `${t("tax.address")} (English)`, type: "text" },
          { key: "channelType", label: t("customers.col.channelType"), type: "select", options: SALES_CHANNEL_OPTIONS.map((c) => ({ value: c, label: t(`lookup.channel.${c}`) })) },
          {
            key: "licenseNo",
            label: t("customers.col.licenseNo"),
            type: "select",
            options: [{ value: "", label: t("customers.noLicenseValue") }, ...freeSalesLicenses.map((l) => ({ value: l.licenseNo, label: `${l.licenseNo} · ${bi(l.holder)}` }))],
          },
          ...(can("editCustomerTerms")
            ? [
                { key: "creditLimit", label: t("customers.col.creditLimit"), type: "number" as const, suffix: "THB", min: 0 },
                { key: "standardDiscount", label: t("customers.col.standardDiscount"), type: "number" as const, suffix: "%", min: 0, max: 100 },
                { key: "creditTermDays", label: t("ar.creditTermDays"), type: "number" as const, suffix: t("ar.days"), min: 0, max: 365 },
              ]
            : []),
        ]}
        values={{
          customerId: nextCustomerId,
          nameTh: "",
          nameEn: "",
          taxId: "",
          branch: "00000",
          addressTh: "",
          addressEn: "",
          channelType: "retailWholesale",
          licenseNo: "",
          creditLimit: 0,
          standardDiscount: 0,
          creditTermDays: 30,
        }}
        onClose={() => setCreating(false)}
        onSave={async (v) => {
          const result = await createCustomer({
            customerId: String(v.customerId),
            name: { th: String(v.nameTh), en: String(v.nameEn) },
            taxId: String(v.taxId).replace(/[\s-]/g, ""),
            branch: String(v.branch),
            address: { th: String(v.addressTh), en: String(v.addressEn) },
            channelType: v.channelType as Customer["channelType"],
            licenseNo: String(v.licenseNo) || null,
            creditLimit: Number(v.creditLimit ?? 0),
            standardDiscount: Number(v.standardDiscount ?? 0),
            creditTermDays: Number(v.creditTermDays ?? 30),
          });
          if (await runAction(result, `${t("erp.created")}: ${String(v.customerId).toUpperCase()}`)) setCreating(false);
        }}
      />

      <EditDrawer
        open={editingId !== null}
        title={t("customers.editTitle")}
        subtitle={editingRow ? `${editingRow.customerId} · ${bi(editingRow.name)}` : ""}
        note={t("erp.customerTermsNote")}
        fields={fields}
        values={
          editingRow
            ? {
                creditLimit: editingRow.creditLimit,
                standardDiscount: editingRow.standardDiscount,
                channelType: editingRow.channelType,
                creditTermDays: editingRow.creditTermDays,
              }
            : {}
        }
        onClose={() => setEditingId(null)}
        onSave={handleSave}
      />
      {importing && (
        <CsvImportDialog<NewCustomerInput>
          title={t("csv.customersTitle")}
          templateName="customers"
          columns={[
            { key: "customerId", example: "CUS-0101", required: true },
            { key: "nameTh", example: "ร้านตัวอย่าง จำกัด", required: true },
            { key: "nameEn", example: "Example Shop Co., Ltd.", required: true },
            { key: "taxId", example: "0105558012349", required: true },
            { key: "branch", example: "00000", required: true },
            { key: "addressTh", example: "1 ถนนสุขุมวิท กรุงเทพฯ 10110", required: true },
            { key: "addressEn", example: "1 Sukhumvit Rd, Bangkok 10110", required: true },
            { key: "channelType", example: "retailWholesale", required: true },
            { key: "licenseNo", example: "" },
            { key: "creditLimit", example: "0" },
            { key: "standardDiscount", example: "0" },
            { key: "creditTermDays", example: "30" },
          ]}
          toInput={(c) => {
            if (!SALES_CHANNEL_OPTIONS.includes(c.channelType as Customer["channelType"]))
              return { problem: { th: `channelType ต้องเป็น ${SALES_CHANNEL_OPTIONS.join(", ")}`, en: `channelType must be one of ${SALES_CHANNEL_OPTIONS.join(", ")}` } };
            const num = (k: string, d: number) => (c[k] === "" || c[k] === undefined ? d : Number(c[k]));
            if ([num("creditLimit", 0), num("standardDiscount", 0), num("creditTermDays", 30)].some((n) => !Number.isFinite(n)))
              return { problem: { th: "ตัวเลขไม่ถูกต้อง", en: "A number column isn't a number" } };
            return {
              input: {
                customerId: c.customerId,
                name: { th: c.nameTh, en: c.nameEn },
                taxId: c.taxId.replace(/[\s-]/g, ""),
                branch: c.branch,
                address: { th: c.addressTh, en: c.addressEn },
                channelType: c.channelType as Customer["channelType"],
                licenseNo: c.licenseNo || null,
                creditLimit: num("creditLimit", 0),
                standardDiscount: num("standardDiscount", 0),
                creditTermDays: num("creditTermDays", 30),
              },
            };
          }}
          submit={(input) => createCustomer(input)}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}
