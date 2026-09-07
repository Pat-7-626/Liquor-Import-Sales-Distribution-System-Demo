import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext";

export const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap";
export const td = "px-4 py-3 text-sm text-gray-700 whitespace-nowrap";

export function TableContainer({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-100">{children}</table>
    </div>
  );
}

export function EmptyRow({ colSpan }: { colSpan: number }) {
  const { t } = useLanguage();
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-gray-400">
        {t("common.noResults")}
      </td>
    </tr>
  );
}

export function EditedPill({ label }: { label?: string } = {}) {
  const { t } = useLanguage();
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
      {label ?? t("common.edited")}
    </span>
  );
}
