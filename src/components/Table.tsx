import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";

export const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap";
export const td = "px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap";

export function TableContainer({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[65vh] overflow-auto rounded-xl border border-gray-200/80 bg-white shadow-sm [&_thead]:bg-gray-50/95 [&_thead]:backdrop-blur [&_thead_tr]:border-b [&_thead_tr]:border-gray-200 [&_tbody_tr]:transition-colors">
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
