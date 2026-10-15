import { useState } from "react";
import { Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { CompanyProfile as Company } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { FieldLabel, inputClass } from "../components/FormKit";
import { SellerBlock } from "../components/TaxDocument";
import { isValidThaiTaxId } from "../lib/business";
import { useRunAction } from "../lib/useRunAction";

export default function CompanyProfile() {
  const { t } = useLanguage();
  const runAction = useRunAction();
  const { can } = useRole();
  const { company, updateCompanyProfile, setOpeningBalances, setCompanyImage, setPrintSignature } = useData();
  const { canViewSensitive } = useRole();
  const editable = can("manageCompany");
  const [opening, setOpening] = useState({ date: company.openingDate, bank: company.openingBank });
  const [openingBase, setOpeningBase] = useState(company);
  if (openingBase !== company) {
    setOpeningBase(company);
    setOpening({ date: company.openingDate, bank: company.openingBank });
  }
  const openingLocked = Boolean(company.closedThrough);
  const openingDirty = opening.date !== company.openingDate || opening.bank !== company.openingBank;

  const [draft, setDraft] = useState<Company>(company);
  // Reset the form whenever the saved profile changes (save, reset demo data) — adjusted during render.
  const [base, setBase] = useState<Company>(company);
  if (base !== company) {
    setBase(company);
    setDraft(company);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(company);
  const taxIdOk = isValidThaiTaxId(draft.taxId);
  const branchOk = /^\d{5}$/.test(draft.branch);
  const blank = (v: string) => v.trim() === "";
  const emailOk = blank(draft.email) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim());
  const promptPay = (draft.promptPayId ?? "").replace(/[\s-]/g, "");
  const promptPayOk = !promptPay || /^0\d{9}$/.test(promptPay) || isValidThaiTaxId(promptPay);
  // Same rules the server applies — the form never offers a save it would refuse.
  const canSave =
    editable && dirty && taxIdOk && branchOk && emailOk && promptPayOk && ![draft.name.th, draft.name.en, draft.address.th, draft.address.en].some(blank);

  const text = (label: string, value: string, onChange: (v: string) => void, opts: { invalid?: boolean; hint?: string; placeholder?: string } = {}) => (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        disabled={!editable}
        placeholder={opts.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} disabled:bg-gray-50 ${opts.invalid ? "border-rose-400 bg-rose-50" : ""}`}
      />
      {opts.hint && <p className={`mt-1 text-xs ${opts.invalid ? "text-rose-600" : "text-gray-400"}`}>{opts.hint}</p>}
    </label>
  );

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.tax")} title={t("company.title")} subtitle={t("company.subtitle")} />

      {!editable && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600">
          <Lock size={14} />
          {t("company.readOnly")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("company.sectionLegal")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {text(`${t("company.name")} (ไทย)`, draft.name.th, (v) => setDraft((d) => ({ ...d, name: { ...d.name, th: v } })), {
                invalid: blank(draft.name.th),
              })}
              {text(`${t("company.name")} (English)`, draft.name.en, (v) => setDraft((d) => ({ ...d, name: { ...d.name, en: v } })), {
                invalid: blank(draft.name.en),
              })}
              {text(t("tax.taxId"), draft.taxId, (v) => setDraft((d) => ({ ...d, taxId: v.replace(/[\s-]/g, "") })), {
                invalid: !taxIdOk,
                hint: taxIdOk ? t("company.taxIdOk") : t("company.taxIdInvalid"),
                placeholder: "0105xxxxxxxxx",
              })}
              {text(t("tax.branch"), draft.branch, (v) => setDraft((d) => ({ ...d, branch: v.trim() })), {
                invalid: !branchOk,
                hint: t("company.branchHint"),
                placeholder: "00000",
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("company.sectionContact")}</h3>
            <div className="grid grid-cols-1 gap-4">
              {text(`${t("tax.address")} (ไทย)`, draft.address.th, (v) => setDraft((d) => ({ ...d, address: { ...d.address, th: v } })), {
                invalid: blank(draft.address.th),
              })}
              {text(`${t("tax.address")} (English)`, draft.address.en, (v) => setDraft((d) => ({ ...d, address: { ...d.address, en: v } })), {
                invalid: blank(draft.address.en),
              })}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {text(t("company.phone"), draft.phone, (v) => setDraft((d) => ({ ...d, phone: v })))}
                {text(t("company.email"), draft.email, (v) => setDraft((d) => ({ ...d, email: v.trim() })), { invalid: !emailOk })}
              </div>
            </div>
          </div>

          {/* How customers pay — printed on invoices, statements and reminders, with a PromptPay QR. */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="payment-details">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("company.sectionPayment")}</h3>
            <p className="mb-3 text-xs text-gray-500">{t("company.paymentHint")}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {text(t("company.bankName"), draft.bankName ?? "", (v) => setDraft((d) => ({ ...d, bankName: v })), { placeholder: "ธนาคารกสิกรไทย / Kasikornbank" })}
              {text(t("company.bankBranch"), draft.bankBranch ?? "", (v) => setDraft((d) => ({ ...d, bankBranch: v })))}
              {text(t("company.bankAccountName"), draft.bankAccountName ?? "", (v) => setDraft((d) => ({ ...d, bankAccountName: v })))}
              {text(t("company.bankAccountNo"), draft.bankAccountNo ?? "", (v) => setDraft((d) => ({ ...d, bankAccountNo: v })), { placeholder: "123-4-56789-0" })}
              {text(t("company.promptPayId"), draft.promptPayId ?? "", (v) => setDraft((d) => ({ ...d, promptPayId: v })), {
                invalid: !promptPayOk,
                hint: t("company.promptPayHint"),
                placeholder: "0105xxxxxxxxx / 08xxxxxxxx",
              })}
            </div>
          </div>

          {/* When the books start and the cash in the bank that day — the ledger's opening entry. */}
          {canViewSensitive && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="opening-balances">
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("company.sectionOpening")}</h3>
              <p className="mb-3 text-xs text-gray-500">{openingLocked ? t("company.openingLocked").replace("{d}", company.closedThrough ?? "") : t("company.openingHint")}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block">
                  <FieldLabel>{t("company.openingDate")}</FieldLabel>
                  <input
                    type="date"
                    value={opening.date}
                    disabled={!editable || openingLocked}
                    onChange={(e) => setOpening((o) => ({ ...o, date: e.target.value }))}
                    className={`${inputClass} disabled:bg-gray-50`}
                  />
                </label>
                <label className="block">
                  <FieldLabel>{t("company.openingBank")}</FieldLabel>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={opening.bank}
                    disabled={!editable || openingLocked}
                    onChange={(e) => setOpening((o) => ({ ...o, bank: Number(e.target.value) }))}
                    className={`${inputClass} disabled:bg-gray-50`}
                    data-testid="opening-bank"
                  />
                </label>
                {editable && !openingLocked && (
                  <div className="flex items-end">
                    <button
                      onClick={() => runAction(setOpeningBalances(opening.date, opening.bank), t("company.openingSaved"))}
                      disabled={!openingDirty || !(opening.bank >= 0) || !opening.date}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                      data-testid="opening-save"
                    >
                      {t("common.save")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {editable && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDraft(company)}
                disabled={!dirty}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() =>
                  // Only the text fields: images are saved on their own (they'd make this request too large).
                  runAction(
                    updateCompanyProfile({
                      name: draft.name,
                      taxId: draft.taxId,
                      branch: draft.branch,
                      address: draft.address,
                      phone: draft.phone,
                      email: draft.email,
                      bankName: draft.bankName ?? "",
                      bankBranch: draft.bankBranch ?? "",
                      bankAccountName: draft.bankAccountName ?? "",
                      bankAccountNo: draft.bankAccountNo ?? "",
                      promptPayId: draft.promptPayId ?? "",
                    }),
                    t("company.savedToast"),
                  )
                }
                disabled={!canSave}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {t("common.save")}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("company.preview")}</h3>
            <p className="mb-4 text-xs text-gray-500">{t("company.previewNote")}</p>
            <div className="rounded-lg border border-dashed border-gray-300 p-4">
              <SellerBlock />
            </div>
          </div>

          {/* Logo on every document; signature and stamp on documents the company issues, if switched on. */}
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="branding">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("company.sectionBranding")}</h3>
            <p className="mb-3 text-xs text-gray-500">{t("company.brandingHint")}</p>
            <div className="grid grid-cols-3 gap-3">
              {(["logo", "signature", "stamp"] as const).map((kind) => (
                <ImageSlot
                  key={kind}
                  kind={kind}
                  label={t(`company.image.${kind}`)}
                  value={company[kind] ?? ""}
                  editable={editable}
                  onChange={(v) => runAction(setCompanyImage(kind, v), v ? t("company.imageSaved") : t("company.imageRemoved"))}
                />
              ))}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(company.printSignature)}
                disabled={!editable || !company.signature || !company.stamp}
                onChange={(e) => runAction(setPrintSignature(e.target.checked), t("company.savedToast"))}
                className="mt-0.5"
                data-testid="print-signature"
              />
              <span>
                {t("company.printSignature")}
                <span className="block text-xs text-gray-500">{t("company.printSignatureHint")}</span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shrinks an uploaded image to at most 600 px on its longer side, keeping transparency (PNG). */
async function toSmallPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ImageSlot({ kind, label, value, editable, onChange }: { kind: string; label: string; value: string; editable: boolean; onChange: (dataUrl: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="text-center" data-testid={`image-${kind}`}>
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-2">
        {value ? <img src={value} alt={label} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-gray-400">{t("company.noImage")}</span>}
      </div>
      <p className="mt-1 text-xs font-medium text-gray-700">{label}</p>
      {editable && (
        <div className="mt-1 flex justify-center gap-2 text-xs">
          <label className="cursor-pointer font-medium text-indigo-600 hover:underline">
            {value ? t("company.replaceImage") : t("company.uploadImage")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              data-testid={`upload-${kind}`}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onChange(await toSmallPng(f));
              }}
            />
          </label>
          {value && (
            <button onClick={() => onChange("")} className="font-medium text-gray-500 hover:text-rose-600">
              {t("common.remove")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
