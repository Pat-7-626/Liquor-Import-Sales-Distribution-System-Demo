import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import type { AuditEntry } from "../data/types";
import { useRole } from "../state/RoleContext";

/** `wide` spans both columns of a detail page's two-column grid — for tables that need the room. */
export function Card({ title, action, wide, children }: { title: string; action?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-gray-200/80 bg-white shadow-sm ${wide ? "lg:col-span-2" : ""}`}>
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold tracking-[0.01em] text-gray-900">{title}</h3>
        {action && <div className="print:hidden">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

/** Shared BR-04 audit history rendering for every detail page — filter the log to one entityId and pass it in. */
export function HistoryList({ entries, emptyLabel }: { entries: AuditEntry[]; emptyLabel: string }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive } = useRole();

  if (entries.length === 0) return <p className="text-sm text-gray-400">{emptyLabel}</p>;

  return (
    <ul className="relative space-y-4 before:absolute before:inset-y-1 before:left-[3px] before:w-px before:bg-gray-200">
      {entries.map((e) => (
        <li key={e.id} className="relative pl-5">
          <span className="absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full bg-gold-400 ring-2 ring-white" />
          <p className="text-xs text-gray-400">
            {new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.timestamp))}
            {" · "}
            {t(`auditTrail.action.${e.action}`)}
            {" · "}
            {bi(e.actor)}
          </p>
          <p className="text-sm text-gray-700">{e.sensitive && !canViewSensitive ? <span className="text-gray-400">{t("erp.restrictedSummary")}</span> : bi(e.summary)}</p>
        </li>
      ))}
    </ul>
  );
}
