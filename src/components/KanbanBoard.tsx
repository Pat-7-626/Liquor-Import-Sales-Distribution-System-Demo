import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { TONE_DOT, type EventTone } from "./CalendarView";

export interface BoardColumn<T> {
  key: string;
  label: string;
  tone: EventTone;
  items: T[];
  /** Optional figure under the heading, e.g. the column's total value. */
  footer?: ReactNode;
  /** Finished-work columns: how many older records were left off the board. */
  olderHidden?: number;
}

/** Columns by stage, one card per record. Scrolls sideways when the columns don't fit. */
export function KanbanBoard<T>({ columns, renderCard, itemKey }: { columns: BoardColumn<T>[]; renderCard: (item: T) => ReactNode; itemKey: (item: T) => string }) {
  const { t } = useLanguage();
  return (
    <div className="-mx-1 overflow-x-auto pb-2">
      <div className="flex gap-3 px-1">
        {/* Columns share the width when it's there, and never shrink below a readable card. */}
        {columns.map((col) => (
          <section key={col.key} aria-label={col.label} className="flex min-w-[15.5rem] flex-1 basis-0 flex-col rounded-xl border border-gray-200 bg-gray-50/80">
            <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[col.tone]}`} />
                {col.label}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 ring-1 ring-gray-200">{col.items.length}</span>
            </header>
            {col.footer && <div className="border-b border-gray-200 px-3 py-1.5 text-xs text-gray-500">{col.footer}</div>}
            <div className="flex max-h-[38rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
              {col.olderHidden !== undefined && (
                <p className="px-1 text-[11px] text-gray-500">
                  {t("views.recentOnly").replace("{n}", String(col.olderHidden))}
                </p>
              )}
              {col.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-400">{t("views.emptyColumn")}</p>
              ) : (
                col.items.map((it) => <div key={itemKey(it)}>{renderCard(it)}</div>)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Card shell used on boards. */
export function BoardCard({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${highlight ? "border-indigo-300 ring-1 ring-indigo-200" : "border-gray-200"}`}>
      {children}
    </div>
  );
}
