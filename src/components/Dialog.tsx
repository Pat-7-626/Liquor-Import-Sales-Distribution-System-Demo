import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/** A centred modal form. */
export function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const { t } = useLanguage();
  // Escape closes it, like every other dialog in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Cancel + primary submit, right-aligned. */
export function DialogActions({ onCancel, submitLabel, disabled, testid }: { onCancel: () => void; submitLabel: string; disabled?: boolean; testid?: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {t("common.cancel")}
      </button>
      <button
        type="submit"
        disabled={disabled}
        data-testid={testid}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
      >
        {submitLabel}
      </button>
    </div>
  );
}
