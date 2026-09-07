import { useLanguage } from "../i18n/LanguageContext";
import type { Bilingual } from "../data/types";

export function useBi() {
  const { lang } = useLanguage();
  return (value: Bilingual) => value[lang];
}
