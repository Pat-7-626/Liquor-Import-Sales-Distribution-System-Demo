import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import type { AuditEntry } from "../data/types";

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action && <div className="print:hidden">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

/** Shared BR-04 audit history rendering for every detail page — filter the log to one entityId and pass it in. */
export function HistoryList({ entries, emptyLabel }: { entries: AuditEntry[]; emptyLabel: string }) {
  const { t, lang } = useLanguage();
  const bi = useBi();

  if (entries.length === 0) return <p className="text-sm text-gray-400">{emptyLabel}</p>;

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="border-l-2 border-gray-200 pl-3">
          <p className="text-xs text-gray-400">
            {new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.timestamp))}
            {" · "}
            {t(`auditTrail.action.${e.action}`)}
            {" · "}
            {bi(e.actor)}
          </p>
          <p className="text-sm text-gray-700">{bi(e.summary)}</p>
        </li>
      ))}
    </ul>
  );
}
