import { useMemo, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import type { AuditAction, AuditEntityType } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { selectClass, inputClass } from "../components/FormKit";

const ACTION_TONE: Record<AuditAction, string> = {
  created: "bg-blue-50 text-blue-700 ring-blue-600/20",
  updated: "bg-gray-100 text-gray-600 ring-gray-500/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const ACTIONS: AuditAction[] = ["created", "updated", "approved", "rejected"];
const ENTITY_TYPES: AuditEntityType[] = ["importOrder", "salesOrder", "product", "license", "customer", "inventory"];

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
  const { auditLog } = useData();

  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLog.filter((e) => {
      const matchesSearch = !q || e.entityId.toLowerCase().includes(q);
      const matchesEntity = !entityFilter || e.entityType === entityFilter;
      const matchesAction = !actionFilter || e.action === actionFilter;
      return matchesSearch && matchesEntity && matchesAction;
    });
  }, [auditLog, search, entityFilter, actionFilter]);

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
        <span className="text-sm text-gray-400">
          {filtered.length} {t("common.of")} {auditLog.length} {t("common.records")}
        </span>
      </div>

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
          {filtered.length === 0 && <EmptyRow colSpan={5} />}
          {filtered.map((e) => (
            <tr key={e.id} className="hover:bg-gray-50/60">
              <td className={`${td} text-gray-500`}>{formatTimestamp(e.timestamp)}</td>
              <td className={td}>
                <span className="font-medium text-gray-900">{e.entityId}</span>
                <span className="ml-1.5 text-xs text-gray-400">{t(`auditTrail.entityType.${e.entityType}`)}</span>
              </td>
              <td className={td}>
                <ActionBadge action={e.action} label={t(`auditTrail.action.${e.action}`)} />
              </td>
              <td className={td}>{bi(e.actor)}</td>
              <td className={`${td} max-w-md whitespace-normal text-gray-600`}>{bi(e.summary)}</td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
    </div>
  );
}
