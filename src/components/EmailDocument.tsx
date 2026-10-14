import { useState, type RefObject } from "react";
import { Mail } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useRole } from "../state/RoleContext";
import { api, asResult } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useRunAction } from "../lib/useRunAction";
import { Dialog, DialogActions } from "./Dialog";
import { FieldLabel, inputClass } from "./FormKit";

/** What a printable document needs to be emailed: who to, what it's called, which record it belongs to. */
export interface EmailSpec {
  to?: string;
  subject: string;
  /** e.g. "tax invoice INV-2026-8801" — used in the audit entry. */
  document: string;
  filename: string;
  entityType: "salesOrder" | "customer" | "quotation" | "expense" | "payable";
  entityId: string;
}

/** The document as a standalone page: the app's own stylesheet inlined, so it looks the same in the mailbox. */
function standalonePage(content: HTMLElement, title: string): string {
  const css = [...document.styleSheets]
    .map((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
  const esc = title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc}</title><style>${css}</style></head><body style="background:#fff;margin:0"><div style="max-width:880px;margin:0 auto;padding:32px" class="text-gray-900">${content.innerHTML}</div></body></html>`;
}

export function EmailButton({ spec, contentRef }: { spec: EmailSpec; contentRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useLanguage();
  const { canViewSensitive, identity } = useRole();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(spec.to ?? "");
  const [subject, setSubject] = useState(spec.subject);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const status = useApi<{ enabled: boolean; catchAll: string | null }>(canViewSensitive && identity.role !== "guest" ? "/api/email/status" : null).data;
  if (!status?.enabled) return null;

  const recipients = to
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const valid = recipients.length > 0 && recipients.length <= 5 && recipients.every((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        data-testid="email-document"
      >
        <Mail size={14} />
        {t("email.send")}
      </button>
      {open && (
        <Dialog title={t("email.title")} onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid || !contentRef.current) return;
              setSending(true);
              const res = await asResult(
                api<{ result: { ok: true } | { ok: false; error: { th: string; en: string } } }>("/api/email", {
                  method: "POST",
                  body: { to: recipients, subject, message, documentHtml: standalonePage(contentRef.current, subject), filename: spec.filename, entityType: spec.entityType, entityId: spec.entityId, document: spec.document },
                }),
              );
              setSending(false);
              if (await runAction(res.result, t("email.sent").replace("{to}", recipients.join(", ")))) setOpen(false);
            }}
          >
            <label className="block">
              <FieldLabel>{t("email.to")}</FieldLabel>
              <input value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} placeholder="accounts@customer.co.th" data-testid="email-to" />
              <span className="mt-1 block text-xs text-gray-500">{t("email.toHint")}</span>
            </label>
            <label className="block">
              <FieldLabel>{t("email.subject")}</FieldLabel>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <FieldLabel>{t("email.message")}</FieldLabel>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className={inputClass} />
            </label>
            {status.catchAll && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("email.catchAll")}{" "}
                <a href={status.catchAll} target="_blank" rel="noreferrer" className="font-medium underline">
                  {status.catchAll}
                </a>
              </p>
            )}
            <DialogActions onCancel={() => setOpen(false)} submitLabel={sending ? t("email.sending") : t("email.send")} disabled={!valid || sending || !subject.trim()} testid="email-send" />
          </form>
        </Dialog>
      )}
    </>
  );
}
