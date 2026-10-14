import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { exportToPdf } from "../lib/export";
import { formatDate } from "../lib/format";
import type { Bilingual, Customer } from "../data/types";

/**
 * Building blocks for printed tax documents. Under the Revenue Code (s.86/4) a full tax invoice must show
 * the words "ใบกำกับภาษี", the seller's and buyer's name, address and taxpayer ID with head office/branch,
 * its number, the goods with quantity and value, the VAT separately, and the issue date. Labels are printed
 * in Thai with English beneath, whatever language the screen is in — the document is the same for everyone.
 */

/** "ใบกำกับภาษี / Tax Invoice" — a fixed bilingual label. */
export function Both({ th, en, className = "" }: Bilingual & { className?: string }) {
  return (
    <span className={className}>
      {th} <span className="text-gray-400">/ {en}</span>
    </span>
  );
}

export const branchLabel = (branch: string): Bilingual =>
  branch === "00000" || branch === ""
    ? { th: "สำนักงานใหญ่", en: "Head office" }
    : { th: `สาขาที่ ${branch}`, en: `Branch ${branch}` };

export function SellerBlock() {
  const { company } = useData();
  const b = branchLabel(company.branch);
  return (
    <div className="text-sm leading-relaxed">
      <p className="text-base font-semibold text-gray-900">{company.name.th}</p>
      <p className="text-gray-600">{company.name.en}</p>
      <p className="mt-1 text-gray-600">{company.address.th}</p>
      <p className="text-gray-500">{company.address.en}</p>
      <p className="mt-1 text-gray-700">
        เลขประจำตัวผู้เสียภาษี <span className="text-gray-400">/ Tax ID</span> <span className="font-medium tabular-nums">{company.taxId}</span>
        {" · "}
        {b.th} <span className="text-gray-400">/ {b.en}</span>
      </p>
      {(company.phone || company.email) && (
        <p className="text-gray-500">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  );
}

export function BuyerBlock({ customer, fallbackName }: { customer?: Customer; fallbackName: Bilingual }) {
  const name = customer?.name ?? fallbackName;
  const b = branchLabel(customer?.branch ?? "");
  return (
    <div className="rounded-lg border border-gray-200 p-3 text-sm leading-relaxed">
      <p className="text-xs font-medium text-gray-500">
        <Both th="ผู้ซื้อ" en="Customer" />
        {customer && <span className="ml-1.5 text-gray-400">({customer.customerId})</span>}
      </p>
      <p className="mt-1 font-semibold text-gray-900">{name.th}</p>
      {name.en && name.en !== name.th && <p className="text-gray-600">{name.en}</p>}
      {customer?.address.th && <p className="mt-1 text-gray-600">{customer.address.th}</p>}
      {customer?.address.en && <p className="text-gray-500">{customer.address.en}</p>}
      <p className="mt-1 text-gray-700">
        เลขประจำตัวผู้เสียภาษี <span className="text-gray-400">/ Tax ID</span>{" "}
        {customer?.taxId ? <span className="font-medium tabular-nums">{customer.taxId}</span> : <span className="text-rose-600">—</span>}
        {" · "}
        {b.th} <span className="text-gray-400">/ {b.en}</span>
      </p>
    </div>
  );
}

/** Document number / date box at the top right. */
export function DocMeta({ rows }: { rows: { label: Bilingual; value: ReactNode }[] }) {
  return (
    <table className="text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="pr-3 text-right align-top text-gray-500">
              {r.label.th}
              <span className="block text-[11px] leading-tight text-gray-400">{r.label.en}</span>
            </td>
            <td className="align-top font-medium text-gray-900">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Signatures({ left, right }: { left: Bilingual; right: Bilingual }) {
  return (
    <div className="mt-12 grid grid-cols-2 gap-10 text-center text-sm text-gray-600">
      {[left, right].map((s, i) => (
        <div key={i}>
          <div className="border-t border-gray-400 pt-2">
            {s.th}
            <span className="block text-xs text-gray-400">{s.en}</span>
          </div>
          <p className="mt-3 text-xs text-gray-400">วันที่ / Date ____ / ____ / ______</p>
        </div>
      ))}
    </div>
  );
}

/** Thai dates on the document are in the Buddhist calendar; English in the Gregorian one. */
export function DocDate({ iso }: { iso: string }) {
  return (
    <>
      {formatDate(iso, "th")}
      <span className="block text-[11px] font-normal leading-tight text-gray-400">{formatDate(iso, "en")}</span>
    </>
  );
}

/**
 * Full-screen document viewer with tabs and a print button. Portalled to <body> so the print rule in
 * index.css (`body:has(#print-modal-root)`) can hide everything else and print only the document.
 */
export function PrintFrame<T extends string>({
  tabs,
  tab,
  onTab,
  onClose,
  extra,
  children,
}: {
  tabs?: { key: T; label: string }[];
  tab?: T;
  onTab?: (t: T) => void;
  onClose: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return createPortal(
    <div id="print-modal-root">
      <div onClick={onClose} className="fixed inset-0 z-30 bg-gray-900/30 print:hidden" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-4 z-40 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:inset-y-8 print:static print:inset-auto print:m-0 print:h-auto print:max-w-none print:rounded-none print:shadow-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 print:hidden">
          <div className="flex flex-wrap gap-1">
            {tabs?.map((tb) => (
              <button
                key={tb.key}
                onClick={() => onTab?.(tb.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === tb.key ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {extra}
            <button
              onClick={exportToPdf}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Printer size={14} />
              {t("common.print")}
            </button>
            <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-8 text-gray-900 print:overflow-visible print:px-0 print:py-0">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Original / copy switch — a tax invoice is issued as an original for the buyer and a copy kept by the seller. */
export function CopySwitch({ value, onChange }: { value: "original" | "copy"; onChange: (v: "original" | "copy") => void }) {
  return (
    <div className="flex rounded-lg border border-gray-300 p-0.5 text-xs font-medium">
      {(["original", "copy"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 ${value === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          {v === "original" ? "ต้นฉบับ / Original" : "สำเนา / Copy"}
        </button>
      ))}
    </div>
  );
}

export function CopyStamp({ value }: { value: "original" | "copy" }) {
  return (
    <span className="rounded border border-gray-900 px-2 py-0.5 text-xs font-semibold tracking-wide text-gray-900">
      {value === "original" ? "ต้นฉบับ / ORIGINAL" : "สำเนา / COPY"}
    </span>
  );
}
