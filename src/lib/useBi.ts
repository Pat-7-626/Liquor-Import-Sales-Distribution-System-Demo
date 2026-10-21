import { useLanguage } from "../i18n/LanguageContext";
import type { Bilingual } from "../data/types";

export function useBi() {
  const { lang } = useLanguage();
  // A half left empty (text typed in one language only) shows the other.
  return (value: Bilingual) => value[lang] || value[lang === "th" ? "en" : "th"];
}
