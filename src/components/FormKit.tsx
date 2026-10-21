import type { ReactNode } from "react";
import type { Bilingual } from "../data/types";
import { useLanguage } from "../i18n/LanguageContext";
import { CheckCircle2, Circle, XCircle } from "lucide-react";

export const selectClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-[inset_0_1px_2px_rgb(28_24_20/0.04)] transition-colors hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15";
export const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-[inset_0_1px_2px_rgb(28_24_20/0.04)] transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-gray-600">{children}</span>;
}

export type CheckState = "ok" | "bad" | "pending";

export function CheckItem({ status, label }: { status: CheckState; label: string }) {
  const icon =
    status === "ok" ? (
      <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
    ) : status === "bad" ? (
      <XCircle size={16} className="shrink-0 text-rose-500" />
    ) : (
      <Circle size={16} className="shrink-0 text-gray-400" />
    );
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      {icon}
      <span className={status === "bad" ? "text-rose-600" : status === "pending" ? "text-gray-400" : "text-gray-700"}>
        {label}
      </span>
    </div>
  );
}

/**
 * Free text in Thai and English, side by side. One half is enough — it then shows in both languages —
 * for things only ever written in one (a product name, an English-only note).
 */
export function TextPair({
  value,
  onChange,
  testid,
  placeholder,
  maxLength = 300,
}: {
  value: Bilingual;
  onChange: (v: Bilingual) => void;
  testid?: string;
  placeholder?: Partial<Bilingual>;
  maxLength?: number;
}) {
  const { t } = useLanguage();
  const box = (lang: "th" | "en", tag: string) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 rounded bg-gray-100 px-1 text-[10px] font-semibold text-gray-500">{tag}</span>
      <input
        value={value[lang]}
        onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
        lang={lang}
        maxLength={maxLength}
        placeholder={placeholder?.[lang]}
        aria-label={`${tag} — ${t(lang === "th" ? "text.thai" : "text.english")}`}
        className={`${inputClass} pl-10`}
        data-testid={testid ? `${testid}-${lang}` : undefined}
      />
    </div>
  );
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {box("th", "TH")}
        {box("en", "EN")}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t("text.oneIsEnough")}</p>
    </div>
  );
}
