import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Mail, ShieldCheck, UserCog, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { api, ApiError } from "../lib/api";
import { ChangePasswordForm } from "./ChangePassword";
import { FieldLabel, inputClass } from "./FormKit";
import { QrCode } from "./QrCode";

const errorText = (err: unknown, lang: "th" | "en") => (err as ApiError).bilingual?.[lang] ?? (err as ApiError).message;
const primary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400";
const secondary = "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400";

/** The six digits from the authenticator app — numeric keypad on phones, filled in by password managers. */
export function CodeInput({ value, onChange, testid = "totp-code", autoFocus }: { value: string; onChange: (v: string) => void; testid?: string; autoFocus?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      autoFocus={autoFocus}
      placeholder="123456"
      className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
      data-testid={testid}
    />
  );
}

/** Scan the QR code, type the code it shows; only then is two-step sign-in on. */
export function TwoFactorSetup({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { t, lang } = useLanguage();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ secret: string; uri: string }>("/api/auth/2fa/setup", { method: "POST" }).then(setSetup, (e) => setError(errorText(e, lang)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok?: boolean; error?: { th: string; en: string } }>("/api/auth/2fa/enable", { method: "POST", body: { code } });
      if (res.error) setError(res.error[lang]);
      else onDone();
    } catch (err) {
      setError(errorText(err, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={confirm} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
        <li>{t("twoFactor.step1")}</li>
        <li>{t("twoFactor.step2")}</li>
        <li>{t("twoFactor.step3")}</li>
      </ol>
      {setup && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <QrCode value={setup.uri} className="h-40 w-40" testid="totp-qr" alt={t("twoFactor.qrAlt")} />
          <p className="text-xs text-gray-500">{t("twoFactor.cantScan")}</p>
          <code className="select-all break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-800" data-testid="totp-secret">
            {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
          </code>
        </div>
      )}
      <label className="block">
        <FieldLabel>{t("twoFactor.code")}</FieldLabel>
        <CodeInput value={code} onChange={setCode} />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondary}>
            {t("common.cancel")}
          </button>
        )}
        <button type="submit" disabled={!setup || code.length !== 6 || busy} className={primary} data-testid="totp-enable">
          {t("twoFactor.turnOn")}
        </button>
      </div>
    </form>
  );
}

function TwoFactorSection({ enabled, required, onChanged }: { enabled: boolean; required: boolean; onChanged: () => void }) {
  const { t, lang } = useLanguage();
  const [mode, setMode] = useState<"idle" | "setup" | "disable">("idle");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ ok?: boolean; error?: { th: string; en: string } }>("/api/auth/2fa/disable", { method: "POST", body: { password } });
      if (res.error) return setError(res.error[lang]);
      setMode("idle");
      setPassword("");
      onChanged();
    } catch (err) {
      setError(errorText(err, lang));
    }
  };

  if (mode === "setup")
    return (
      <TwoFactorSetup
        onCancel={() => setMode("idle")}
        onDone={() => {
          setMode("idle");
          onChanged();
        }}
      />
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t("twoFactor.explain")}</p>
      <p
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${enabled ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-700"}`}
        data-testid="totp-status"
      >
        <ShieldCheck size={15} />
        {enabled ? t("twoFactor.isOn") : t("twoFactor.isOff")}
      </p>
      {mode === "disable" ? (
        <form onSubmit={disable} className="space-y-3">
          <label className="block">
            <FieldLabel>{t("password.current")}</FieldLabel>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} data-testid="totp-disable-password" />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className={secondary}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={!password} className={primary} data-testid="totp-disable-confirm">
              {t("twoFactor.turnOff")}
            </button>
          </div>
        </form>
      ) : enabled ? (
        required ? (
          <p className="text-xs text-gray-500">{t("twoFactor.requiredForRole")}</p>
        ) : (
          <button onClick={() => setMode("disable")} className={secondary} data-testid="totp-disable">
            {t("twoFactor.turnOff")}
          </button>
        )
      ) : (
        <button onClick={() => setMode("setup")} className={primary} data-testid="totp-start">
          {t("twoFactor.setUp")}
        </button>
      )}
    </div>
  );
}

function SummarySection() {
  const { t, lang } = useLanguage();
  const [loaded, setLoaded] = useState<{ email: string; dailySummary: boolean; emailEnabled: boolean; hour: number } | null>(null);
  const [email, setEmail] = useState("");
  const [daily, setDaily] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ email: string; dailySummary: boolean; emailEnabled: boolean; hour: number }>("/api/me/summary").then((s) => {
      setLoaded(s);
      setEmail(s.email);
      setDaily(s.dailySummary);
    }, () => setLoaded(null));
  }, []);

  const run = async (fn: () => Promise<{ ok?: boolean; error?: { th: string; en: string } }>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      setMessage(res.error ? { ok: false, text: res.error[lang] } : { ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, lang) });
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(() => api("/api/me/summary", { method: "POST", body: { email: email.trim(), dailySummary: daily } }), t("summary.saved"));
  const sendNow = () =>
    run(async () => {
      await api("/api/me/summary", { method: "POST", body: { email: email.trim(), dailySummary: daily } });
      return api("/api/me/summary/send", { method: "POST" });
    }, t("summary.sent"));

  if (!loaded) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t("summary.explain").replace("{hour}", `${String(loaded.hour).padStart(2, "0")}:00`)}</p>
      {!loaded.emailEnabled && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("summary.noSmtp")}</p>}
      <label className="block">
        <FieldLabel>{t("summary.email")}</FieldLabel>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} data-testid="summary-email" />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} className="h-4 w-4 rounded border-gray-300" data-testid="summary-daily" />
        {t("summary.daily")}
      </label>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`} data-testid="summary-message">
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={sendNow} disabled={busy || !email.trim() || !loaded.emailEnabled} className={secondary} data-testid="summary-send">
          {t("summary.sendNow")}
        </button>
        <button onClick={save} disabled={busy} className={primary} data-testid="summary-save">
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

type Tab = "password" | "twoFactor" | "summary";

/** From the header: your password, two-step sign-in and the morning email. */
export function AccountDialog({
  open,
  onClose,
  onPasswordChanged,
  twoFactorEnabled,
  twoFactorRequired,
  onTwoFactorChanged,
}: {
  open: boolean;
  onClose: () => void;
  onPasswordChanged: () => void;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
  onTwoFactorChanged: () => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("password");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const tabs: { id: Tab; icon: typeof KeyRound; label: string }[] = [
    { id: "password", icon: KeyRound, label: t("password.title") },
    { id: "twoFactor", icon: ShieldCheck, label: t("twoFactor.title") },
    { id: "summary", icon: Mail, label: t("summary.title") },
  ];
  // Rendered at the top of the page: the header it's opened from would otherwise clip it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t("account.title")} className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-gray-900">
            <UserCog size={18} className="text-gold-500" />
            {t("account.title")}
          </h2>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div role="tablist" className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              data-testid={`account-tab-${id}`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        {tab === "password" && (
          <ChangePasswordForm
            onCancel={onClose}
            onDone={() => {
              onPasswordChanged();
              onClose();
            }}
          />
        )}
        {tab === "twoFactor" && <TwoFactorSection enabled={twoFactorEnabled} required={twoFactorRequired} onChanged={onTwoFactorChanged} />}
        {tab === "summary" && <SummarySection />}
      </div>
    </div>,
    document.body,
  );
}

/** The role must use two-step sign-in: nothing else is available until it's set up. */
export function ForcedTwoFactorSetup({ name, onDone, onSignOut }: { name: string; onDone: () => void; onSignOut: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <ShieldCheck size={22} className="mb-3 text-gold-500" />
        <h1 className="font-display text-2xl font-semibold text-gray-900">{t("twoFactor.forcedTitle")}</h1>
        <p className="mt-1 mb-6 text-sm text-gray-600">{t("twoFactor.forcedBody").replace("{name}", name)}</p>
        <TwoFactorSetup onDone={onDone} />
        <button onClick={onSignOut} className="mt-4 text-sm text-gray-500 hover:text-gray-800 hover:underline">
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}
