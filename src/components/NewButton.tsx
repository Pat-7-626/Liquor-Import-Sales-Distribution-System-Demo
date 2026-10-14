import { Lock, Plus } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/** Page-header "New …" button; shows a lock and explains why when the role can't create. */
export function NewButton({ label, allowed, onClick }: { label: string; allowed: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onClick}
      disabled={!allowed}
      title={allowed ? undefined : t("erp.noPermission")}
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
    >
      {allowed ? <Plus size={15} /> : <Lock size={15} />}
      {label}
    </button>
  );
}
