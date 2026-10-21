/**
 * Free text people type in two languages — a reason, a note, a description. Either half may be left empty
 * (some things are only ever written in English, or only in Thai); it then shows in both languages.
 */
import type { Bilingual } from "../data/types";

export type Lang = "th" | "en";

const THAI = /[฀-๿]/;

export const noText = (): Bilingual => ({ th: "", en: "" });

/**
 * Two-language text from what was typed or stored: an object is trimmed; a single string such as older
 * data's "ไทย / English" is split at the slash; otherwise it goes to the language it's written in.
 */
export function toText(v: string | Partial<Bilingual> | null | undefined): Bilingual {
  if (v && typeof v === "object") return { th: (v.th ?? "").trim(), en: (v.en ?? "").trim() };
  const s = (v ?? "").trim();
  const split = s.match(/^(.*[฀-๿].*?)\s+\/\s+([^฀-๿]+)$/);
  if (split) return { th: split[1].trim(), en: split[2].trim() };
  return THAI.test(s) ? { th: s, en: "" } : { th: "", en: s };
}

/** In one language, falling back to the other when that half is empty. */
export const textIn = (v: Bilingual | null | undefined, lang: Lang): string => (v ? v[lang] || v[lang === "th" ? "en" : "th"] || "" : "");

export const hasText = (v: Bilingual | null | undefined) => Boolean(v && (v.th.trim() || v.en.trim()));

/** For printed documents (Thai with English beneath): the English line only when there's a different one. */
export const docText = (v: Bilingual | null | undefined): Bilingual => {
  const th = textIn(v, "th");
  const en = textIn(v, "en");
  return { th, en: en === th ? "" : en };
};

/** One line with both, for exports and search: "ไทย / English", or just the one there is. */
export const bothText = (v: Bilingual | null | undefined): string => {
  const d = docText(v);
  return d.en ? `${d.th} / ${d.en}` : d.th;
};
