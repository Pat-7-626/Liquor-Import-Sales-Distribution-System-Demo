import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/** "1–100 of 2,345" with previous/next, for lists the server pages through. */
export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  const { t } = useLanguage();
  if (total <= limit && offset === 0) return null;
  const last = Math.min(offset + limit, total);
  const btn = "inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-500" data-testid="pager">
      <span className="tabular-nums">
        {total === 0 ? 0 : offset + 1}–{last} {t("common.of")} {total.toLocaleString()}
      </span>
      <button className={btn} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        <ChevronLeft size={15} />
        {t("common.previous")}
      </button>
      <button className={btn} disabled={last >= total} onClick={() => onChange(offset + limit)} data-testid="pager-next">
        {t("common.next")}
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
