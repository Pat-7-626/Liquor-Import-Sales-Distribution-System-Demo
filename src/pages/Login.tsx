import { useState, type FormEvent } from "react";
import { Wine } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { api, ApiError } from "../lib/api";
import type { Identity } from "../data/types";
import { FieldLabel, inputClass, selectClass } from "../components/FormKit";

export default function Login({
  identities,
  unreachable,
  onSignedIn,
  onGuest,
}: {
  identities: Identity[];
  unreachable: boolean;
  onSignedIn: () => void;
  /** Present only when the server allows guest access. */
  onGuest?: () => Promise<void>;
}) {
  const { t, lang, setLang } = useLanguage();
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enterAsGuest = async () => {
    if (!onGuest) return;
    setBusy(true);
    setError(null);
    try {
      await onGuest();
    } catch {
      setError(t("auth.guestUnavailable"));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { key, password } });
      onSignedIn();
    } catch (err) {
      // 429 = locked after repeated failures: the server says for how long.
      setError(
        err instanceof ApiError && err.status === 401
          ? t("auth.wrongCredentials")
          : err instanceof ApiError && err.status === 429 && err.bilingual
            ? err.bilingual[lang]
            : t("auth.serverUnreachable"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-ink-900 to-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 text-gold-400 ring-1 ring-inset ring-gold-400/30">
            <Wine size={22} strokeWidth={1.75} />
          </span>
          <h1 className="font-display text-2xl font-semibold text-gold-100">{t("common.appTitleShort")}</h1>
          <p className="mt-1 text-sm text-gray-300">{t("common.appTitle")}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-6 shadow-2xl">
          <h2 className="text-base font-semibold text-gray-900">{t("auth.signIn")}</h2>
          {unreachable && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("auth.serverUnreachable")}</p>}
          <label className="block">
            <FieldLabel>{t("auth.user")}</FieldLabel>
            <select value={key} onChange={(e) => setKey(e.target.value)} required className={selectClass}>
              <option value="">{t("auth.chooseUser")}</option>
              {identities.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.name[lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <FieldLabel>{t("auth.password")}</FieldLabel>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={inputClass} />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !key || !password}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {busy ? t("auth.signingIn") : t("auth.signIn")}
          </button>
          {onGuest && (
            <>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                {t("auth.or")}
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={enterAsGuest}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                {t("auth.continueAsGuest")}
              </button>
              <p className="text-center text-xs text-gray-500">{t("auth.guestHint")}</p>
            </>
          )}
          <div className="flex justify-center gap-1 pt-1">
            {(["th", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${lang === l ? "bg-ink-900 text-gold-100" : "text-gray-500 hover:text-gray-800"}`}
              >
                {l === "th" ? "ไทย" : "EN"}
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
