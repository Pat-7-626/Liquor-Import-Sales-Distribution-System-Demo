import { useState } from "react";
import { useData } from "../state/DataContext";
import type { ArDocument } from "../data/types";
import { Masked } from "./Masked";
import { splitVat } from "../lib/business";
import { thaiBahtText, englishBahtText } from "../lib/amountInWords";
import { Both, BuyerBlock, CopyStamp, CopySwitch, DocDate, DocMeta, PrintFrame, SellerBlock, Signatures } from "./TaxDocument";

const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const TITLES = {
  payment: { th: "ใบเสร็จรับเงิน", en: "Receipt" },
  creditNote: { th: "ใบลดหนี้ / ใบกำกับภาษี", en: "Credit Note / Tax Invoice" },
  debitNote: { th: "ใบเพิ่มหนี้ / ใบกำกับภาษี", en: "Debit Note / Tax Invoice" },
} as const;

const METHODS = {
  transfer: { th: "โอนเงิน", en: "Bank transfer" },
  cheque: { th: "เช็ค", en: "Cheque" },
  cash: { th: "เงินสด", en: "Cash" },
} as const;

/** A receipt, credit note or debit note as printed for the customer. Opening balances aren't documents to print. */
export function ArDocumentPrintModal({ doc, onClose }: { doc: ArDocument | null; onClose: () => void }) {
  const { customers, salesOrders, taxSettings } = useData();
  const [copy, setCopy] = useState<"original" | "copy">("original");
  if (!doc || doc.type === "openingBalance") return null;

  const customer = customers.find((c) => c.customerId === doc.customerId);
  const isNote = doc.type !== "payment";
  const order = isNote ? salesOrders.find((o) => o.orderNo === doc.reference) : undefined;
  const vatPercent = order?.vatPercent ?? taxSettings.vatPercent;
  const diff = splitVat(doc.amount, vatPercent);
  const corrected =
    doc.originalValue === undefined ? undefined : Math.round((doc.originalValue + (doc.type === "creditNote" ? -doc.amount : doc.amount)) * 100) / 100;
  const title = TITLES[doc.type];

  return (
    <PrintFrame onClose={onClose} extra={<CopySwitch value={copy} onChange={setCopy} />}>
      <div className="mb-5 flex flex-col gap-4 border-b-2 border-gray-900 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 print:flex-row">
        <div className="min-w-0 flex-1">
          <SellerBlock />
        </div>
        <div className="shrink-0 sm:text-right print:text-right">
          <div className="mb-2">
            <CopyStamp value={copy} />
          </div>
          <h2 className="font-display text-2xl font-semibold text-gray-900">{title.th}</h2>
          <p className="text-sm uppercase tracking-wide text-gray-500">{title.en}</p>
          <div className="mt-3 flex justify-end">
            <DocMeta
              rows={[
                { label: { th: "เลขที่", en: "No." }, value: doc.docNo },
                { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={doc.date} /> },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mb-5">
        <BuyerBlock customer={customer} fallbackName={{ th: doc.customerId, en: doc.customerId }} />
      </div>

      {isNote ? (
        <>
          {/* The invoice this note corrects — required on every credit/debit note. */}
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">
                <Both th="อ้างอิงใบกำกับภาษีเลขที่" en="Original tax invoice" />
              </p>
              <p className="mt-0.5 font-medium">{order?.taxInvoiceNo ?? doc.reference}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">
                <Both th="ลงวันที่" en="Dated" />
              </p>
              <p className="mt-0.5 font-medium">{order ? <DocDate iso={order.invoiceDate ?? order.orderDate} /> : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">
                <Both th="ออเดอร์" en="Order" />
              </p>
              <p className="mt-0.5 font-medium">{doc.reference}</p>
            </div>
            <div className="sm:col-span-3">
              <p className="text-xs text-gray-500">
                <Both th="เหตุผล" en="Reason" />
              </p>
              <p className="mt-0.5">
                {doc.reason ? (
                  <>
                    {doc.reason.th} <span className="text-gray-500">/ {doc.reason.en}</span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>

          <table className="ml-auto w-full max-w-md text-sm">
            <tbody>
              {doc.originalValue !== undefined && corrected !== undefined && (
                <>
                  <Row th="มูลค่าตามใบกำกับภาษีเดิม" en="Original invoice value" value={doc.originalValue} />
                  <Row th="มูลค่าที่ถูกต้อง" en="Correct value" value={corrected} />
                </>
              )}
              <Row th="ผลต่าง (ไม่รวม VAT)" en="Difference excl. VAT" value={diff.base} />
              <Row th={`ภาษีมูลค่าเพิ่ม ${vatPercent}%`} en={`VAT ${vatPercent}%`} value={diff.vat} />
              <Row th={doc.type === "creditNote" ? "รวมลดหนี้" : "รวมเพิ่มหนี้"} en={doc.type === "creditNote" ? "Total credited" : "Total debited"} value={doc.amount} strong />
            </tbody>
          </table>
        </>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50 text-left text-xs text-gray-600">
              <th className="px-2.5 py-2 font-medium">
                รายการ<span className="block font-normal text-gray-400">Description</span>
              </th>
              <th className="px-2.5 py-2 font-medium">
                วิธีชำระ<span className="block font-normal text-gray-400">Method</span>
              </th>
              <th className="px-2.5 py-2 font-medium">
                อ้างอิง<span className="block font-normal text-gray-400">Reference</span>
              </th>
              <th className="px-2.5 py-2 text-right font-medium">
                จำนวนเงิน<span className="block font-normal text-gray-400">Amount</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="px-2.5 py-2.5">
                รับชำระหนี้ค่าสินค้า <span className="text-gray-500">/ Payment on account</span>
              </td>
              <td className="px-2.5 py-2.5">
                {doc.method ? (
                  <>
                    {METHODS[doc.method].th} <span className="text-gray-500">/ {METHODS[doc.method].en}</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2.5 py-2.5">{doc.reference || "—"}</td>
              <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums">
                <Masked>{money(doc.amount)}</Masked>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
        <p className="text-xs text-gray-500">
          <Both th="จำนวนเงิน (ตัวอักษร)" en="Amount in words" />
        </p>
        <Masked>
          <p className="mt-0.5 font-medium">({thaiBahtText(doc.amount)})</p>
          <p className="text-gray-600">({englishBahtText(doc.amount)})</p>
        </Masked>
      </div>

      <Signatures
        left={isNote ? { th: "ผู้รับเอกสาร", en: "Received by" } : { th: "ผู้จ่ายเงิน", en: "Paid by" }}
        right={isNote ? { th: "ผู้มีอำนาจลงนาม", en: "Authorised signature" } : { th: "ผู้รับเงิน", en: "Collected by" }}
      />
    </PrintFrame>
  );
}

function Row({ th, en, value, strong }: { th: string; en: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t-2 border-gray-900 font-semibold" : ""}>
      <td className="py-1.5 text-gray-700">
        {th}
        <span className="block text-[11px] font-normal text-gray-400">{en}</span>
      </td>
      <td className="py-1.5 text-right tabular-nums">
        <Masked>{money(value)}</Masked>
      </td>
    </tr>
  );
}
