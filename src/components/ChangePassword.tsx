import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { api, ApiError } from "../lib/api";
import { FieldLabel, inputClass } from "./FormKit";

/** Current password + new password twice. The server checks the current one and signs out other sessions. */
export function ChangePasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { t, lang } = useLanguage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = again.length > 0 && again !== next;
  const ready = current.length > 0 && next.length >= 8 && again === next && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ ok?: boolean; error?: { th: string; en: string } }>("/api/auth/password", { method: "POST", body: { current, next } });
      if (res.error) setError(res.error[lang]);
      else onDone();
    } catch (err) {
      setError((err as ApiError).bilingual?.[lang] ?? (err as ApiError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <FieldLabel>{t("password.current")}</FieldLabel>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} data-testid="pw-current" />
      </label>
      <label className="block">
        <FieldLabel>{t("password.new")}</FieldLabel>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={`${inputClass} ${tooShort ? "border-rose-400 bg-rose-50" : ""}`}
          data-testid="pw-new"
        />
        <p className={`mt-1 text-xs ${tooShort ? "text-rose-600" : "text-gray-500"}`}>{t("password.rule")}</p>
      </label>
      <label className="block">
        <FieldLabel>{t("password.repeat")}</FieldLabel>
        <input
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          className={`${inputClass} ${mismatch ? "border-rose-400 bg-rose-50" : ""}`}
          data-testid="pw-again"
        />
        {mismatch && <p className="mt-1 text-xs text-rose-600">{t("password.mismatch")}</p>}
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <p className="text-xs text-gray-500">{t("password.signsOutOthers")}</p>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t("common.cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={!ready}
          data-testid="pw-save"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {t("password.save")}
        </button>
      </div>
    </form>
  );
}

/** From the header: change your own password at any time. */
export function ChangePasswordDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t("password.title")} className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-gray-900">
            <KeyRound size={18} className="text-gold-500" />
            {t("password.title")}
          </h2>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <ChangePasswordForm
          onCancel={onClose}
          onDone={() => {
            onChanged();
            onClose();
          }}
        />
      </div>
    </div>
  );
}

/** After an administrator set a temporary password: nothing else is available until it's replaced. */
export function ForcedPasswordChange({ name, onDone, onSignOut }: { name: string; onDone: () => void; onSignOut: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <KeyRound size={22} className="mb-3 text-gold-500" />
        <h1 className="font-display text-2xl font-semibold text-gray-900">{t("password.forcedTitle")}</h1>
        <p className="mt-1 mb-6 text-sm text-gray-600">{t("password.forcedBody").replace("{name}", name)}</p>
        <ChangePasswordForm onDone={onDone} />
        <button onClick={onSignOut} className="mt-4 text-sm text-gray-500 hover:text-gray-800 hover:underline">
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}
