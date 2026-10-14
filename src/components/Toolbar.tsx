import { Download, Search } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

interface StatusOption {
  value: string;
  label: string;
}

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: StatusOption[];
  resultCount: number;
  totalCount: number;
  extraFilter?: React.ReactNode;
  /** Shown before the export button — e.g. the Table / Board / Calendar switcher. */
  views?: React.ReactNode;
  onExport: () => void;
}

export function Toolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  statusValue,
  onStatusChange,
  statusOptions,
  resultCount,
  totalCount,
  extraFilter,
  views,
  onExport,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        {statusOptions && onStatusChange && (
          <select
            value={statusValue}
            onChange={(e) => onStatusChange(e.target.value)}
            aria-label={t("common.status")}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">{t("common.allStatuses")}</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        {extraFilter}
        <span className="text-sm text-gray-400">
          {resultCount} {t("common.of")} {totalCount} {t("common.records")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {views}
        <button
          onClick={onExport}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
        >
          <Download size={15} />
          {t("common.export")}
        </button>
      </div>
    </div>
  );
}
