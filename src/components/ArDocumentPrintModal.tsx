import { useState } from "react";
import { useData } from "../state/DataContext";
import type { ArDocument } from "../data/types";
import { Masked } from "./Masked";
import { splitVat } from "../lib/business";
import { thaiBahtText, englishBahtText } from "../lib/amountInWords";
import { Both, BuyerBlock, Copies, CopyStamp, CopySwitch, DocDate, DocField, DocTh, DocumentHeader, PrintFrame, Signatures, type CopyMode } from "./TaxDocument";

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
  const [copy, setCopy] = useState<CopyMode>("original");
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
    <PrintFrame
      onClose={onClose}
      extra={<CopySwitch value={copy} onChange={setCopy} />}
      email={{
        to: customer?.email,
        subject: `${title.th} / ${title.en} ${doc.docNo}`,
        document: `${title.en.toLowerCase()} ${doc.docNo}`,
        filename: doc.docNo,
        entityType: "customer",
        entityId: doc.customerId,
      }}
      runningTitle={`${title.th} / ${title.en} ${doc.docNo}`}
    >
      <Copies
        mode={copy}
        render={(c) => (
          <>
      <DocumentHeader
        title={title}
        stamp={<CopyStamp value={c} />}
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: doc.docNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={doc.date} /> },
        ]}
        party={<BuyerBlock customer={customer} fallbackName={{ th: doc.customerId, en: doc.customerId }} />}
      />

      {isNote ? (
        <>
          {/* The invoice this note corrects — required on every credit/debit note. */}
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3.5 sm:grid-cols-3 print:grid-cols-3">
            <DocField label={{ th: "อ้างอิงใบกำกับภาษีเลขที่", en: "Original tax invoice" }}>
              <span className="font-medium">{order?.taxInvoiceNo ?? doc.reference}</span>
            </DocField>
            <DocField label={{ th: "ลงวันที่", en: "Dated" }}>{order ? <DocDate iso={order.invoiceDate ?? order.orderDate} /> : "—"}</DocField>
            <DocField label={{ th: "ออเดอร์", en: "Order" }}>{doc.reference}</DocField>
            <DocField label={{ th: "เหตุผล", en: "Reason" }} className="sm:col-span-3 print:col-span-3">
              {doc.reason ? <Both th={doc.reason.th} en={doc.reason.en} /> : "—"}
            </DocField>
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
            <tr className="border-y border-gray-300 bg-gray-50">
              <DocTh th="รายการ" en="Description" />
              <DocTh th="วิธีชำระ" en="Method" />
              <DocTh th="อ้างอิง" en="Reference" />
              <DocTh th="จำนวนเงิน" en="Amount" align="right" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="px-2.5 py-2.5">
                <Both th="รับชำระหนี้ค่าสินค้า" en="Payment on account" />
              </td>
              <td className="px-2.5 py-2.5">{doc.method ? <Both th={METHODS[doc.method].th} en={METHODS[doc.method].en} /> : "—"}</td>
              <td className="px-2.5 py-2.5">{doc.reference || "—"}</td>
              <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums">
                <Masked>{money(doc.amount)}</Masked>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
        <p className="text-xs font-medium text-gray-500">
          <Both th="จำนวนเงิน (ตัวอักษร)" en="Amount in words" />
        </p>
        <Masked>
          <p className="mt-0.5 font-medium">({thaiBahtText(doc.amount)})</p>
          <p className="text-gray-600">({englishBahtText(doc.amount)})</p>
        </Masked>
      </div>

      {!isNote && (
        <p className="mt-4 text-sm text-gray-700">
          <Both th="ได้รับเงินตามรายการข้างต้นไว้ถูกต้องครบถ้วนแล้ว" en="Received the above payment in full, with thanks." />
        </p>
      )}
      <Signatures
        left={isNote ? { th: "ผู้รับเอกสาร", en: "Received by" } : { th: "ผู้จ่ายเงิน", en: "Paid by" }}
        right={isNote ? { th: "ผู้มีอำนาจลงนาม", en: "Authorised signature" } : { th: "ผู้รับเงิน", en: "Collected by" }}
        signed="right"
        signedDate={doc.date}
      />
          </>
        )}
      />
    </PrintFrame>
  );
}

function Row({ th, en, value, strong }: { th: string; en: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t-2 border-gray-900 font-semibold" : ""}>
      <td className="py-1.5 text-gray-700">
        <Both th={th} en={en} />
      </td>
      <td className="py-1.5 text-right tabular-nums">
        <Masked>{money(value)}</Masked>
      </td>
    </tr>
  );
}
