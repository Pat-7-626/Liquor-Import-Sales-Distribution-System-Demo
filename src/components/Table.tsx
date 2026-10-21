import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";

export const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap";
export const td = "px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap";

/**
 * A table that scrolls inside its own box. When the last column is the row's actions (its header is
 * empty), that column stays pinned to the right edge, so the buttons are never scrolled out of reach
 * on a narrower screen.
 */
const pinnedActions =
  "[&_thead_th:last-child:empty]:sticky [&_thead_th:last-child:empty]:right-0 [&_thead_th:last-child:empty]:bg-gray-50 " +
  "[&_table:has(thead_th:last-child:empty)_tbody_td:last-child]:sticky [&_table:has(thead_th:last-child:empty)_tbody_td:last-child]:right-0 " +
  "[&_table:has(thead_th:last-child:empty)_tbody_td:last-child]:bg-white " +
  "[&_table:has(thead_th:last-child:empty)_tbody_td:last-child]:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.14)]";

export function TableContainer({ children }: { children: ReactNode }) {
  return (
    <div className={`max-h-[65vh] overflow-auto rounded-xl border border-gray-200/80 bg-white shadow-sm [&_thead]:bg-gray-50/95 [&_thead]:backdrop-blur [&_thead_tr]:border-b [&_thead_tr]:border-gray-200 [&_tbody_tr]:transition-colors ${pinnedActions}`}>
      <table className="min-w-full divide-y divide-gray-100">{children}</table>
    </div>
  );
}

export function EmptyRow({ colSpan }: { colSpan: number }) {
  const { t } = useLanguage();
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-gray-400">
        {t("common.noResults")}
      </td>
    </tr>
  );
}

export function EditedPill({ label }: { label?: string } = {}) {
  const { t } = useLanguage();
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-600 ring-1 ring-inset ring-gold-300/50">
      {label ?? t("common.edited")}
    </span>
  );
}
