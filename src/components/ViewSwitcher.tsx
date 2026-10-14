import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export interface ViewOption<V extends string> {
  value: V;
  label: string;
  icon: LucideIcon;
}

/** The chosen view per page, remembered in this browser (a convenience — falls back to the default). */
export function useViewMode<V extends string>(page: string, options: readonly V[], fallback: V): [V, (v: V) => void] {
  const key = `lisd-view-${page}`;
  const [view, setView] = useState<V>(() => {
    try {
      const saved = window.localStorage.getItem(key) as V | null;
      return saved && options.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (v: V) => {
    setView(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* private mode — keep it for this visit only */
    }
  };
  return [view, choose];
}

/** Segmented control: Table / Board / Calendar / … */
export function ViewSwitcher<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: ViewOption<V>[] }) {
  const { t } = useLanguage();
  return (
    <div role="radiogroup" aria-label={t("views.label")} className="inline-flex shrink-0 rounded-lg border border-gray-300 bg-white p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            data-testid={`view-${o.value}`}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
