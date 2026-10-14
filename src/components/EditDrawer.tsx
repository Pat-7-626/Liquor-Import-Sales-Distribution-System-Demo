import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export type FieldValue = string | number;

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date";
  options?: SelectOption[];
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** Heading shown above this field — groups the fields that follow it (e.g. one group per order line). */
  section?: string;
}

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Short explanation shown above the fields — e.g. what saving will and won't change. */
  note?: string;
  fields: FieldConfig[];
  values: Record<string, FieldValue>;
  onClose: () => void;
  onSave: (values: Record<string, FieldValue>) => void;
}

export function EditDrawer({
  open,
  title,
  subtitle,
  note,
  fields,
  values,
  onClose,
  onSave,
}: Props) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Record<string, FieldValue>>(values);

  useEffect(() => {
    if (open) setDraft(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(values)]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-ink-950/40 backdrop-blur-[2px] transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        inert={!open}
        aria-label={title}
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 print:hidden ${
          open ? "translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-gray-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {note && (
            <p className="rounded-lg border border-gold-200/70 bg-gold-100/50 px-3.5 py-2.5 text-xs leading-relaxed text-gray-600">
              {note}
            </p>
          )}
          {fields.map((field) => (
            <div key={field.key}>
              {field.section && (
                <p className="mb-3 mt-2 border-b border-gray-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {field.section}
                </p>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-600">
                  {field.label}
                </span>
                {field.type === "select" ? (
                  <select
                    value={(draft[field.key] as string) ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [field.key]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type={field.type}
                      value={(draft[field.key] as string | number) ?? ""}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      placeholder={field.placeholder}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [field.key]:
                            field.type === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {field.suffix && (
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">
                        {field.suffix}
                      </span>
                    )}
                  </div>
                )}
              </label>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </>
  );
}
