import { useState } from "react";
import type { Customer } from "../data/types";
import { useData } from "../state/DataContext";
import { useLanguage } from "../i18n/LanguageContext";
import { customerStatement, firstOfMonth } from "../domain/finance";
import { AGING_BUCKETS, addDays, agingTotals, computeArOpenItems, daysOverdue, todayIso } from "../lib/business";
import { englishBahtText, thaiBahtText } from "../lib/amountInWords";
import { Both, BuyerBlock, DocDate, DocTh, DocumentHeader, PaymentBlock, PrintFrame, Signatures } from "./TaxDocument";

const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const KIND = {
  invoice: { th: "ใบกำกับภาษี", en: "Tax invoice" },
  creditNote: { th: "ใบลดหนี้", en: "Credit note" },
  debitNote: { th: "ใบเพิ่มหนี้", en: "Debit note" },
  payment: { th: "รับชำระ", en: "Payment" },
  openingBalance: { th: "ยอดยกมา", en: "Brought forward" },
} as const;

const BUCKET = {
  current: { th: "ยังไม่ครบกำหนด", en: "Not yet due" },
  "1-30": { th: "เกิน 1–30 วัน", en: "1–30 days" },
  "31-60": { th: "เกิน 31–60 วัน", en: "31–60 days" },
  "61-90": { th: "เกิน 61–90 วัน", en: "61–90 days" },
  "90+": { th: "เกิน 90 วัน", en: "Over 90 days" },
} as const;

/** What each reminder says: a friendly nudge, a firm request, a final notice before the account is held. */
const LETTER = {
  1: {
    title: { th: "หนังสือแจ้งเตือนการชำระเงิน", en: "Payment Reminder" },
    body: {
      th: "บริษัทฯ ขอเรียนให้ทราบว่า ตามบันทึกของเรา รายการด้านล่างนี้เลยกำหนดชำระแล้ว หากท่านได้ชำระแล้ว ขออภัยและขอบคุณมา ณ ที่นี้ หากยังไม่ได้ชำระ กรุณาดำเนินการโดยเร็ว",
      en: "Our records show the items below are past their due date. If you have already paid, please accept our thanks and disregard this letter; otherwise we would be grateful for payment at your earliest convenience.",
    },
  },
  2: {
    title: { th: "หนังสือทวงถามการชำระเงิน (ครั้งที่ 2)", en: "Second Payment Reminder" },
    body: {
      th: "บริษัทฯ ได้แจ้งเตือนรายการค้างชำระด้านล่างไปแล้ว แต่ยังไม่ได้รับชำระ กรุณาชำระภายใน 7 วันนับจากวันที่ในหนังสือฉบับนี้ หรือติดต่อบริษัทฯ หากมีข้อสงสัยเกี่ยวกับยอดดังกล่าว",
      en: "We wrote to you earlier about the overdue items below and have not yet received payment. Please pay within 7 days of the date of this letter, or contact us if you have any question about the amounts.",
    },
  },
  3: {
    title: { th: "หนังสือทวงถามครั้งสุดท้าย", en: "Final Notice" },
    body: {
      th: "แม้จะได้แจ้งเตือนแล้วหลายครั้ง รายการด้านล่างยังคงค้างชำระ หากไม่ได้รับชำระภายใน 7 วัน บริษัทฯ จำเป็นต้องระงับการส่งสินค้าและเครดิตของท่านจนกว่าจะชำระครบ",
      en: "Despite our earlier reminders the items below remain unpaid. Unless payment is received within 7 days, we will have to hold further deliveries and your credit until the account is settled.",
    },
  },
} as const;

export type CustomerDocTab = "statement" | "reminder";

/** Statement of account and payment reminder letter for one customer, printable and emailable. */
export function CustomerDocumentsModal({
  customer,
  initialTab = "statement",
  level = 1,
  onClose,
}: {
  customer: Customer;
  initialTab?: CustomerDocTab;
  level?: 1 | 2 | 3;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { salesOrders, arDocuments } = useData();
  const today = todayIso();
  const [tab, setTab] = useState<CustomerDocTab>(initialTab);
  const [from, setFrom] = useState(firstOfMonth(addDays(firstOfMonth(today), -1)));
  const [to, setTo] = useState(today);
  const st = customerStatement(customer.customerId, salesOrders, arDocuments, from, to);
  const open = computeArOpenItems(customer, salesOrders, arDocuments);
  const aging = agingTotals(open, today);
  const overdue = open.filter((i) => i.dueDate < today);
  const overdueTotal = Math.round(overdue.reduce((s, i) => s + i.open, 0) * 100) / 100;
  const letter = LETTER[level];

  const email =
    tab === "statement"
      ? {
          to: customer.email,
          subject: `ใบแจ้งยอดบัญชี / Statement of account ${customer.customerId} (${to})`,
          document: `statement of account to ${to}`,
          filename: `statement-${customer.customerId}-${to}`,
          entityType: "customer" as const,
          entityId: customer.customerId,
        }
      : {
          to: customer.email,
          subject: `${letter.title.th} / ${letter.title.en} — ${customer.name.en}`,
          document: `payment reminder ${level}`,
          filename: `reminder-${level}-${customer.customerId}-${today}`,
          entityType: "customer" as const,
          entityId: customer.customerId,
        };

  return (
    <PrintFrame
      tabs={[
        { key: "statement", label: t("collect.statement") },
        { key: "reminder", label: t("collect.reminderLetter") },
      ]}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      email={email}
      runningTitle={`${tab === "statement" ? "ใบแจ้งยอดบัญชี / Statement of Account" : `${letter.title.th} / ${letter.title.en}`} ${customer.customerId}`}
      extra={
        tab === "statement" ? (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1" aria-label={t("gl.from")} />
            –
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1" aria-label={t("gl.to")} />
          </span>
        ) : null
      }
    >
      <DocumentHeader
        title={tab === "statement" ? { th: "ใบแจ้งยอดบัญชี", en: "Statement of Account" } : letter.title}
        meta={[
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={today} /> },
          ...(tab === "statement"
            ? [
                {
                  label: { th: "ตั้งแต่วันที่", en: "From" },
                  value: (
                    <span data-testid="statement-period">
                      <DocDate iso={from} />
                    </span>
                  ),
                },
                { label: { th: "ถึงวันที่", en: "To" }, value: <DocDate iso={to} /> },
              ]
            : []),
          { label: { th: "รหัสลูกค้า", en: "Customer ID" }, value: customer.customerId },
        ]}
        party={<BuyerBlock customer={customer} fallbackName={customer.name} />}
      />

      {tab === "statement" ? (
        <>
          <table className="mb-4 w-full text-sm" data-testid="statement-table">
            <thead>
              <tr className="border-y border-gray-300 bg-gray-50">
                <DocTh th="วันที่" en="Date" />
                <DocTh th="เอกสาร" en="Document" />
                <DocTh th="ยอดหนี้" en="Charges" align="right" />
                <DocTh th="ชำระ/ลดหนี้" en="Credits" align="right" />
                <DocTh th="คงเหลือ" en="Balance" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="text-gray-600">
                <td className="px-2.5 py-2" colSpan={4}>
                  <Both th="ยอดยกมา" en="Balance brought forward" />
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">{money(st.opening)}</td>
              </tr>
              {st.lines.map((l, i) => (
                <tr key={i} data-testid="statement-line">
                  <td className="whitespace-nowrap px-2.5 py-2 text-gray-600">
                    <DocDate iso={l.date} />
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="whitespace-nowrap font-medium">{l.ref}</span>
                    <span className="block text-xs text-gray-500">
                      <Both th={KIND[l.kind].th} en={KIND[l.kind].en} />
                    </span>
                    {l.orderNo && <span className="block text-xs text-gray-400">{l.orderNo}</span>}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{money(l.balance)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-900 font-semibold">
                <td className="px-2.5 py-2" colSpan={4}>
                  <Both th="ยอดคงค้าง ณ วันสิ้นงวด" en="Balance at end of period" />
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums" data-testid="statement-closing">
                  {money(st.closing)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mb-2 text-xs font-medium text-gray-500">
            <Both th="อายุยอดค้าง ณ วันนี้" en="What's owed today, by age" />
          </p>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {AGING_BUCKETS.map((b) => (
              <div key={b} className="rounded border border-gray-200 p-2">
                <p className="text-gray-500">
                  <Both th={BUCKET[b].th} en={BUCKET[b].en} />
                </p>
                <p className="mt-1 font-semibold tabular-nums">{money(aging[b])}</p>
              </div>
            ))}
          </div>
          {st.closing > 0 && <PaymentBlock amount={st.closing} />}
          <p className="mt-4 text-xs text-gray-500">
            <Both
              th="กรุณาอ้างอิงเลขที่ใบกำกับภาษีเมื่อชำระเงิน หากยอดไม่ตรงกับบันทึกของท่าน โปรดแจ้งกลับภายใน 7 วัน"
              en="Please quote invoice numbers with your payment, and let us know within 7 days if this doesn't agree with your records."
            />
          </p>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm leading-relaxed">{letter.body.th}</p>
          <p className="mb-4 text-sm leading-relaxed text-gray-600">{letter.body.en}</p>
          <table className="mb-4 w-full text-sm" data-testid="reminder-table">
            <thead>
              <tr className="border-y border-gray-300 bg-gray-50">
                <DocTh th="เอกสาร" en="Document" />
                <DocTh th="ครบกำหนด" en="Due" />
                <DocTh th="เกินกำหนด (วัน)" en="Days overdue" align="right" />
                <DocTh th="ยอดค้าง" en="Unpaid" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overdue.map((i) => (
                <tr key={i.ref}>
                  <td className="px-2.5 py-2">
                    {i.ref}
                    {i.orderNo && <span className="block text-xs text-gray-400">{i.orderNo}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2">
                    <DocDate iso={i.dueDate} />
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{daysOverdue(i.dueDate, today)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{money(i.open)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-900 font-semibold">
                <td className="px-2.5 py-2" colSpan={3}>
                  <Both th="รวมยอดค้างชำระเกินกำหนด" en="Total overdue" />
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">{money(overdueTotal)}</td>
              </tr>
            </tbody>
          </table>
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium text-gray-500">
              <Both th="จำนวนเงิน (ตัวอักษร)" en="Amount in words" />
            </p>
            <p className="mt-0.5 font-medium">({thaiBahtText(overdueTotal)})</p>
            <p className="text-gray-600">({englishBahtText(overdueTotal)})</p>
          </div>
          {overdueTotal > 0 && <PaymentBlock amount={overdueTotal} />}
          <Signatures left={{ th: "ฝ่ายบัญชีลูกหนี้", en: "Accounts receivable" }} right={{ th: "ผู้มีอำนาจลงนาม", en: "Authorised signatory" }} signed="right" signedDate={today} />
        </>
      )}
    </PrintFrame>
  );
}
