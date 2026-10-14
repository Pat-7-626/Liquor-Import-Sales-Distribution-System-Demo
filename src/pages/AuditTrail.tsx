import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Table2, ListTree } from "lucide-react";
import { ViewSwitcher, useViewMode } from "../components/ViewSwitcher";
import { ActivityFeed } from "../components/ActivityFeed";
import type { EventTone } from "../components/CalendarView";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import type { AuditAction, AuditEntityType, AuditEntry, Bilingual } from "../data/types";
import { api } from "../lib/api";
import { query, useApi } from "../lib/useApi";
import { useDebounced } from "../lib/useDebounced";
import { Pager } from "../components/Pager";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { selectClass, inputClass } from "../components/FormKit";
import { exportToExcel } from "../lib/export";
import { useRole } from "../state/RoleContext";

const ACTION_TONE: Record<AuditAction, string> = {
  created: "bg-blue-50 text-blue-700 ring-blue-600/20",
  updated: "bg-gray-100 text-gray-600 ring-gray-500/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  payment: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

const ACTION_DOT: Record<AuditAction, EventTone> = {
  created: "blue",
  updated: "gray",
  approved: "green",
  rejected: "red",
  payment: "indigo",
};
const VIEWS = ["table", "feed"] as const;
type View = (typeof VIEWS)[number];
const PAGE = 100;

const ACTIONS: AuditAction[] = ["created", "updated", "approved", "rejected", "payment"];
const ENTITY_TYPES: AuditEntityType[] = [
  "importOrder",
  "salesOrder",
  "product",
  "license",
  "customer",
  "inventory",
  "supplier",
  "warehouse",
  "priceList",
  "taxSettings",
  "reorderPolicy",
  "company",
  "user",
  "exchangeRate",
  "payable",
  "expense",
  "journal",
  "period",
  "bank",
  "quotation",
  "purchaseRequest",
];

interface AuditPage {
  rows: AuditEntry[];
  total: number;
  actors: Bilingual[];
}

function ActionBadge({ action, label }: { action: AuditAction; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ACTION_TONE[action]}`}>
      {label}
    </span>
  );
}

export default function AuditTrail() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive } = useRole();
  // NFR-03: entries that mention prices, credit, discounts or payments read as "restricted" without price access
  // (the server has already withheld their text).
  const summaryOf = (e: AuditEntry) => (e.sensitive && !canViewSensitive ? t("erp.restrictedSummary") : bi(e.summary));

  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [view, setView] = useViewMode<View>("audit", VIEWS, "table");
  const q = useDebounced(search.trim());

  // The log grows forever, so the server filters and pages it. A change of filter starts at page one.
  const filters = { q, entityType: entityFilter, action: actionFilter, actor: actorFilter };
  const filterKey = JSON.stringify(filters);
  const [page, setPage] = useState({ key: filterKey, offset: 0 });
  const offset = page.key === filterKey ? page.offset : 0;
  const setOffset = (o: number) => setPage({ key: filterKey, offset: o });
  const { data } = useApi<AuditPage>(query("/api/audit", { ...filters, offset, limit: PAGE }));
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const actors = data?.actors ?? [];

  const entityLink = (type: string, id: string): string | null => {
    if (type === "importOrder") return `/import-orders/${id}`;
    if (type === "salesOrder") return `/sales-orders/${id}`;
    if (type === "customer") return `/customers/${id}`;
    if (type === "inventory") return `/lot-trace?lot=${encodeURIComponent(id)}`;
    if (type === "supplier") return "/suppliers";
    if (type === "warehouse") return "/warehouses";
    if (type === "priceList") return "/price-lists";
    if (type === "taxSettings") return "/tax-rates";
    if (type === "reorderPolicy") return "/reorder-policies";
    if (type === "user") return "/users";
    if (type === "company") return "/company";
    if (type === "exchangeRate") return "/exchange-rates";
    if (type === "payable") return "/payables";
    if (type === "expense") return /^\d{4}-\d{2}$/.test(id) ? "/tax/withholding" : "/expenses";
    if (type === "journal") return "/accounting/manual-journals";
    if (type === "period") return "/accounting/closing";
    if (type === "bank") return "/accounting/bank";
    if (type === "quotation") return "/quotations";
    if (type === "purchaseRequest") return "/purchase-requests";
    return null;
  };

  // Export everything that matches the filters (up to 5,000 rows), not just the page on screen.
  const handleExport = async () => {
    const all = await api<AuditPage>(query("/api/audit", { ...filters, offset: 0, limit: 5000 }));
    exportToExcel(
      "audit-trail",
      [t("auditTrail.col.timestamp"), t("auditTrail.col.entity"), t("common.status"), t("auditTrail.col.action"), t("auditTrail.col.actor"), t("auditTrail.col.summary")],
      all.rows.map((e) => [e.timestamp, e.entityId, t(`auditTrail.entityType.${e.entityType}`), t(`auditTrail.action.${e.action}`), bi(e.actor), summaryOf(e)]),
    );
  };

  const formatTimestamp = (iso: string) =>
    new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <div>
      <PageHeader title={t("auditTrail.title")} subtitle={t("auditTrail.subtitle")} />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("auditTrail.searchPlaceholder")}
          className={`${inputClass} sm:max-w-xs`}
        />
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className={`${selectClass} sm:w-auto`}>
          <option value="">{t("common.all")}</option>
          {ENTITY_TYPES.map((et) => (
            <option key={et} value={et}>
              {t(`auditTrail.entityType.${et}`)}
            </option>
          ))}
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={`${selectClass} sm:w-auto`}>
          <option value="">{t("common.all")}</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`auditTrail.action.${a}`)}
            </option>
          ))}
        </select>
        <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label={t("auditTrail.col.actor")} className={`${selectClass} sm:w-auto sm:max-w-xs`}>
          <option value="">{t("erp.allUsers")}</option>
          {actors.map((a) => (
            <option key={a.en} value={a.en}>
              {bi(a)}
            </option>
          ))}
        </select>
        <span className="whitespace-nowrap text-sm text-gray-400" data-testid="audit-total">
          {total.toLocaleString()} {t("common.records")}
        </span>
        <div className="sm:ml-auto">
          <ViewSwitcher
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: t("views.table"), icon: Table2 },
              { value: "feed", label: t("views.feed"), icon: ListTree },
            ]}
          />
        </div>
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={15} />
          {t("common.export")}
        </button>
      </div>

      {view === "feed" && (
        <>
          <ActivityFeed
            emptyLabel={t("common.noResults")}
            items={rows.map((e) => ({
              id: e.id,
              at: e.timestamp,
              tone: ACTION_DOT[e.action],
              actor: bi(e.actor),
              title: <ActionBadge action={e.action} label={t(`auditTrail.action.${e.action}`)} />,
              body: <span className={e.sensitive && !canViewSensitive ? "text-gray-400" : ""}>{summaryOf(e)}</span>,
              reference: `${e.entityId} · ${t(`auditTrail.entityType.${e.entityType}`)}`,
              href: entityLink(e.entityType, e.entityId),
            }))}
          />
        </>
      )}

      {view === "table" && (
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("auditTrail.col.timestamp")}</th>
            <th className={th}>{t("auditTrail.col.entity")}</th>
            <th className={th}>{t("auditTrail.col.action")}</th>
            <th className={th}>{t("auditTrail.col.actor")}</th>
            <th className={th}>{t("auditTrail.col.summary")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && <EmptyRow colSpan={5} />}
          {rows.map((e) => (
            <tr key={e.id} className="hover:bg-gray-50/60">
              <td className={`${td} text-gray-500`}>{formatTimestamp(e.timestamp)}</td>
              <td className={td}>
                {(() => {
                  const to = entityLink(e.entityType, e.entityId);
                  return to ? (
                    <Link to={to} className="font-medium text-indigo-600 hover:underline">
                      {e.entityId}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900">{e.entityId}</span>
                  );
                })()}
                <span className="ml-1.5 text-xs text-gray-400">{t(`auditTrail.entityType.${e.entityType}`)}</span>
              </td>
              <td className={td}>
                <ActionBadge action={e.action} label={t(`auditTrail.action.${e.action}`)} />
              </td>
              <td className={td}>{bi(e.actor)}</td>
              <td className={`${td} max-w-md whitespace-normal ${e.sensitive && !canViewSensitive ? "text-gray-400" : "text-gray-600"}`}>{summaryOf(e)}</td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      )}
      <Pager offset={offset} limit={PAGE} total={total} onChange={setOffset} />
    </div>
  );
}
