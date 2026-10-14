import { useRef, type ReactNode } from "react";
import { EmailButton, type EmailSpec } from "./EmailDocument";
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

/**
 * Every label on a document, one way: Thai on top, English beneath in smaller grey type — table headers,
 * party details, totals and notes alike. Sized relative to where it sits, so it works in a header cell
 * and in body text.
 */
export function Both({ th, en, className = "" }: Bilingual & { className?: string }) {
  return (
    <span className={`inline-flex flex-col align-top leading-snug ${className}`}>
      <span>{th}</span>
      <span className="text-[0.82em] font-normal text-gray-400">{en}</span>
    </span>
  );
}

/** A labelled value on a document: the bilingual label above, the value below it. */
export function DocField({ label, children, className = "" }: { label: Bilingual; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-500">
        <Both th={label.th} en={label.en} />
      </p>
      <div className="mt-0.5 text-sm text-gray-900">{children}</div>
    </div>
  );
}

export const branchLabel = (branch: string): Bilingual =>
  branch === "00000" || branch === ""
    ? { th: "สำนักงานใหญ่", en: "Head office" }
    : { th: `สาขาที่ ${branch}`, en: `Branch ${branch}` };

/**
 * A party to the document — the seller or the buyer — always laid out the same way: who they are, their
 * name and address in Thai and English, then tax ID and head office/branch (Revenue Code s.86/4).
 */
export function PartyBlock({
  role,
  code,
  name,
  address,
  taxId,
  branch,
  contact,
  extra,
}: {
  role: Bilingual;
  code?: string;
  name: Bilingual;
  address?: Bilingual;
  /** Leave out (undefined) for a party with no Thai tax ID to show, e.g. a foreign supplier. */
  taxId?: string;
  branch?: string;
  contact?: string;
  /** More labelled details (DocField) under the tax ID. */
  extra?: ReactNode;
}) {
  const b = branch === undefined ? null : branchLabel(branch);
  const showTax = taxId !== undefined;
  return (
    <div className="h-full rounded-lg border border-gray-200 p-3.5 text-sm leading-relaxed" data-testid="party-block">
      <div className="flex items-start justify-between gap-2 text-xs font-medium text-gray-500">
        <Both th={role.th} en={role.en} />
        {code && <span className="text-sm font-medium text-gray-700">{code}</span>}
      </div>
      <p className="mt-1.5 font-semibold text-gray-900">{name.th}</p>
      {name.en && name.en !== name.th && <p className="text-gray-600">{name.en}</p>}
      {address?.th && <p className="mt-1 text-gray-700">{address.th}</p>}
      {address?.en && <p className="text-gray-500">{address.en}</p>}
      {(showTax || b || contact || extra) && (
        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 pt-2.5">
          {showTax && (
            <DocField label={{ th: "เลขประจำตัวผู้เสียภาษี", en: "Tax ID" }}>
              {taxId ? <span className="font-medium tabular-nums">{taxId}</span> : <span className="text-rose-600">—</span>}
            </DocField>
          )}
          {b && (
            <DocField label={{ th: "สำนักงาน/สาขา", en: "Office / branch" }}>
              <Both th={b.th} en={b.en} />
            </DocField>
          )}
          {extra}
          {contact && (
            <DocField label={{ th: "ติดต่อ", en: "Contact" }} className="col-span-2">
              <span className="break-all text-gray-700">{contact}</span>
            </DocField>
          )}
        </div>
      )}
    </div>
  );
}

/** Our company, as the seller (or payer) on every document. */
export function SellerBlock({ role = { th: "ผู้ขาย", en: "Seller" } }: { role?: Bilingual }) {
  const { company } = useData();
  return (
    <PartyBlock
      role={role}
      name={company.name}
      address={company.address}
      taxId={company.taxId}
      branch={company.branch}
      contact={[company.phone, company.email].filter(Boolean).join(" · ") || undefined}
    />
  );
}

/** The customer, laid out exactly like the seller. */
export function BuyerBlock({ customer, fallbackName, role = { th: "ผู้ซื้อ", en: "Customer" } }: { customer?: Customer; fallbackName: Bilingual; role?: Bilingual }) {
  return (
    <PartyBlock
      role={role}
      code={customer?.customerId}
      name={customer?.name ?? fallbackName}
      address={customer?.address}
      taxId={customer?.taxId}
      branch={customer?.branch ?? ""}
      contact={customer?.email || undefined}
    />
  );
}

/** A document's column header: the bilingual label, aligned with its column. */
export function DocTh({ th, en, align = "left", className = "" }: Bilingual & { align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th className={`px-2.5 py-2 align-bottom text-xs font-medium text-gray-600 text-${align} ${className}`}>
      <Both th={th} en={en} />
    </th>
  );
}

/** Document number / date box at the top right. */
export function DocMeta({ rows }: { rows: { label: Bilingual; value: ReactNode }[] }) {
  return (
    <table className="text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="py-0.5 pr-3 text-right align-top text-xs font-medium text-gray-500">
              <Both th={r.label.th} en={r.label.en} />
            </td>
            <td className="py-0.5 align-top font-medium text-gray-900">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The top of every document: its title and number/date on one line, then the parties side by side in
 * identical boxes — seller (us) on the left, the other party on the right.
 */
export function DocumentHeader({
  title,
  meta,
  stamp,
  note,
  seller,
  party,
  internal,
}: {
  title: Bilingual;
  meta: { label: Bilingual; value: ReactNode }[];
  stamp?: ReactNode;
  note?: ReactNode;
  /** Replaces the standard seller block (e.g. a different role label). */
  seller?: ReactNode;
  /** The other party; leave out on internal documents. */
  party?: ReactNode;
  /** An internal sheet (picking list, count sheet): the company named in one line, no party boxes. */
  internal?: boolean;
}) {
  const { company } = useData();
  return (
    <div className="mb-5">
      <div className="mb-4 flex flex-col gap-3 border-b-2 border-gray-900 pb-4 sm:flex-row sm:items-end sm:justify-between print:flex-row print:items-end">
        <div>
          {stamp && <div className="mb-2">{stamp}</div>}
          <h2 className="font-display text-2xl font-semibold leading-tight text-gray-900">{title.th}</h2>
          <p className="text-sm uppercase tracking-wide text-gray-500">{title.en}</p>
          {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
          {internal && (
            <p className="mt-2 text-sm text-gray-700">
              <Both th={company.name.th} en={company.name.en} />
            </p>
          )}
        </div>
        <DocMeta rows={meta} />
      </div>
      {!internal && (
        <div className={`grid grid-cols-1 gap-4 ${party ? "sm:grid-cols-2 print:grid-cols-2" : ""}`}>
          {seller ?? <SellerBlock />}
          {party}
        </div>
      )}
    </div>
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
  email,
  children,
}: {
  tabs?: { key: T; label: string }[];
  tab?: T;
  onTab?: (t: T) => void;
  onClose: () => void;
  extra?: ReactNode;
  /** Offers "Email" when sending is set up and the viewer may see the document's figures. */
  email?: EmailSpec;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const content = useRef<HTMLDivElement>(null);
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
            {email && <EmailButton spec={email} contentRef={content} />}
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
        <div ref={content} className="flex-1 overflow-y-auto px-8 py-8 text-gray-900 print:overflow-visible print:px-0 print:py-0">
          {children}
        </div>
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
