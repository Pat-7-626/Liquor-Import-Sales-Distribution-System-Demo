import type { ReactNode } from "react";
import type { ApDocument, Expense } from "../data/types";
import { useData } from "../state/DataContext";
import { ACCOUNTS } from "../domain/ledger";
import { englishBahtText, thaiBahtText } from "../lib/amountInWords";
import { Both, DocDate, DocField, DocTh, DocumentHeader, PartyBlock, PrintFrame, SellerBlock, Signatures } from "./TaxDocument";

const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const METHODS = {
  transfer: { th: "โอนเงิน", en: "Bank transfer" },
  cheque: { th: "เช็ค", en: "Cheque" },
  cash: { th: "เงินสด", en: "Cash" },
} as const;

/** Lines of a voucher with their amounts, and the total paid. */
function AmountRows({ rows, total }: { rows: { label: ReactNode; amount: number }[]; total: { label: ReactNode; amount: number } }) {
  return (
    <table className="mb-4 w-full border-collapse text-sm">
      <thead>
        <tr className="border-y border-gray-300 bg-gray-50">
          <DocTh th="รายการ" en="Description" />
          <DocTh th="จำนวนเงิน" en="Amount" align="right" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="px-2.5 py-2 text-gray-700">{r.label}</td>
            <td className="px-2.5 py-2 text-right tabular-nums">{money(r.amount)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-gray-900">
          <td className="px-2.5 py-2 font-semibold">{total.label}</td>
          <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{money(total.amount)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function InWords({ amount, label = { th: "จำนวนเงิน (ตัวอักษร)", en: "Amount in words" } }: { amount: number; label?: { th: string; en: string } }) {
  return (
    <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
      <p className="text-xs font-medium text-gray-500">
        <Both th={label.th} en={label.en} />
      </p>
      <p className="mt-0.5 font-medium">({thaiBahtText(amount)})</p>
      <p className="text-gray-600">({englishBahtText(amount)})</p>
    </div>
  );
}

/** How it was paid, as a labelled pair like every other detail on the document. */
function PaidBy({ method, reference }: { method?: keyof typeof METHODS; reference: string }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <DocField label={{ th: "ชำระโดย", en: "Paid by" }}>{method ? <Both th={METHODS[method].th} en={METHODS[method].en} /> : "—"}</DocField>
      <DocField label={{ th: "อ้างอิง", en: "Reference" }}>{reference || "—"}</DocField>
    </div>
  );
}

/** ใบสำคัญจ่าย — the voucher kept with the payee's bill as evidence of an expense payment. */
export function ExpenseVoucher({ expense: x, onClose }: { expense: Expense; onClose: () => void }) {
  const account = ACCOUNTS.find((a) => a.code === x.account);
  return (
    <PrintFrame onClose={onClose} email={{ subject: `ใบสำคัญจ่าย / Payment voucher ${x.docNo}`, document: `payment voucher ${x.docNo}`, filename: x.docNo, entityType: "expense", entityId: x.docNo }}>
      <DocumentHeader
        title={{ th: "ใบสำคัญจ่าย", en: "Payment Voucher" }}
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: x.docNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={x.date} /> },
        ]}
        seller={<SellerBlock role={{ th: "ผู้จ่าย", en: "Payer" }} />}
        party={
          <PartyBlock
            role={{ th: "จ่ายให้", en: "Paid to" }}
            name={{ th: x.payee, en: x.payee }}
            taxId={x.payeeTaxId}
            extra={
              <DocField label={{ th: "ประเภทผู้รับเงิน", en: "Payee is" }}>
                {x.payeeType === "individual" ? <Both th="บุคคลธรรมดา" en="An individual" /> : <Both th="นิติบุคคล" en="A company" />}
              </DocField>
            }
          />
        }
      />
      <AmountRows
        rows={[
          {
            label: (
              <>
                <span className="mr-2 align-top font-mono text-xs text-gray-400">{x.account}</span>
                <Both th={account?.name.th ?? x.account} en={account?.name.en ?? ""} />
                <span className="block text-xs text-gray-500">{x.description}</span>
              </>
            ),
            amount: x.amount,
          },
          ...(x.vat ? [{ label: <Both th="ภาษีมูลค่าเพิ่ม" en="VAT" />, amount: x.vat }] : []),
          ...(x.whtAmount ? [{ label: <Both th={`หัก ภาษี ณ ที่จ่าย ${x.whtRate}%`} en={`Less withholding tax ${x.whtRate}%`} />, amount: -x.whtAmount }] : []),
        ]}
        total={{ label: <Both th="จ่ายสุทธิ" en="Net paid" />, amount: x.paid }}
      />
      <InWords amount={x.paid} />
      <PaidBy method={x.method} reference={x.reference} />
      <Signatures left={{ th: "ผู้จ่ายเงิน / ผู้อนุมัติ", en: "Paid / approved by" }} right={{ th: "ผู้รับเงิน", en: "Received by" }} />
    </PrintFrame>
  );
}

/** ใบสำคัญจ่าย for a payment to a supplier against their invoice. */
export function SupplierPaymentVoucher({ payment: p, onClose }: { payment: ApDocument; onClose: () => void }) {
  const { apDocuments, suppliers } = useData();
  const inv = apDocuments.find((d) => d.docNo === p.appliesTo);
  const supplier = suppliers.find((s) => s.supplierId === p.supplierId);
  return (
    <PrintFrame
      onClose={onClose}
      email={{ to: supplier?.contactEmail, subject: `Payment advice ${p.docNo}`, document: `payment voucher ${p.docNo}`, filename: p.docNo, entityType: "payable", entityId: p.appliesTo ?? p.docNo }}
    >
      <DocumentHeader
        title={{ th: "ใบสำคัญจ่าย", en: "Payment Voucher" }}
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: p.docNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={p.date} /> },
          { label: { th: "ใบแจ้งหนี้", en: "Invoice" }, value: inv?.reference ?? "—" },
          { label: { th: "ออเดอร์นำเข้า", en: "Import order" }, value: p.importOrderNo },
        ]}
        seller={<SellerBlock role={{ th: "ผู้จ่าย", en: "Payer" }} />}
        party={
          // A foreign supplier has no Thai tax ID or branch to show.
          <PartyBlock
            role={{ th: "จ่ายให้", en: "Paid to" }}
            code={supplier?.supplierId}
            name={{ th: supplier?.name ?? p.supplierId, en: supplier?.name ?? p.supplierId }}
            address={supplier ? { th: supplier.origin, en: supplier.origin } : undefined}
            contact={supplier?.contactEmail || undefined}
          />
        }
      />
      <AmountRows
        rows={[
          {
            label: (
              <>
                <Both th="ชำระหนี้การค้า" en="Settlement of trade payable" />
                {p.currency !== "THB" && (
                  <span className="block text-xs text-gray-500">
                    {p.currency} {money(p.amount)} @ {p.rate}
                  </span>
                )}
              </>
            ),
            amount: p.amountThb,
          },
        ]}
        total={{ label: <Both th="จ่ายสุทธิ (บาท)" en="Net paid (THB)" />, amount: p.amountThb }}
      />
      <InWords amount={p.amountThb} />
      <PaidBy method={p.method} reference={p.reference} />
      <Signatures left={{ th: "ผู้จ่ายเงิน / ผู้อนุมัติ", en: "Paid / approved by" }} right={{ th: "ผู้รับเงิน", en: "Received by" }} />
    </PrintFrame>
  );
}

/** What kind of income the payee received, as the certificate asks (Revenue Code s.40). */
const INCOME_TYPE: Record<string, { th: string; en: string }> = {
  "6200": { th: "ค่าเช่า (40(5))", en: "Rent (s.40(5))" },
  "6400": { th: "ค่าขนส่ง (40(8))", en: "Transport (s.40(8))" },
  "6500": { th: "ค่าโฆษณา (40(8))", en: "Advertising (s.40(8))" },
  "6600": { th: "ค่าบริการวิชาชีพ (40(6))", en: "Professional fees (s.40(6))" },
};

/**
 * หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — given to the payee so they can credit the tax withheld
 * against their own income tax. One per payment.
 */
export function WithholdingCertificate({ expense: x, onClose }: { expense: Expense; onClose: () => void }) {
  const income = INCOME_TYPE[x.account] ?? { th: `ค่าบริการ (40(8)) — ${x.description}`, en: `Services (s.40(8)) — ${x.description}` };
  const form = x.payeeType === "individual" ? { th: "ภ.ง.ด.3", en: "PND.3" } : { th: "ภ.ง.ด.53", en: "PND.53" };
  return (
    <PrintFrame
      onClose={onClose}
      email={{ subject: `หนังสือรับรองการหักภาษี ณ ที่จ่าย / Withholding tax certificate ${x.docNo}`, document: `withholding certificate ${x.docNo}`, filename: `WHT-${x.docNo}`, entityType: "expense", entityId: x.docNo }}
    >
      <DocumentHeader
        title={{ th: "หนังสือรับรองการหักภาษี ณ ที่จ่าย", en: "Withholding Tax Certificate" }}
        note="ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร / Under section 50 bis of the Revenue Code"
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: x.docNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={x.date} /> },
        ]}
        seller={<SellerBlock role={{ th: "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", en: "Withholding agent (payer)" }} />}
        party={
          <PartyBlock
            role={{ th: "ผู้ถูกหักภาษี ณ ที่จ่าย", en: "Payee" }}
            name={{ th: x.payee, en: x.payee }}
            taxId={x.payeeTaxId}
            extra={
              <DocField label={{ th: "ยื่นรวมกับแบบ", en: "Filed with" }}>
                <span className="font-medium">
                  <Both th={form.th} en={form.en} />
                </span>
              </DocField>
            }
          />
        }
      />
      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-gray-300 bg-gray-50">
            <DocTh th="ประเภทเงินได้ที่จ่าย" en="Type of income" />
            <DocTh th="วันที่จ่าย" en="Date paid" />
            <DocTh th="จำนวนเงินที่จ่าย" en="Amount paid" align="right" />
            <DocTh th="ภาษีที่หักและนำส่งไว้" en="Tax withheld" align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="px-2.5 py-2">
              <Both th={income.th} en={income.en} />
            </td>
            <td className="whitespace-nowrap px-2.5 py-2">
              <DocDate iso={x.date} />
            </td>
            <td className="px-2.5 py-2 text-right tabular-nums">{money(x.amount)}</td>
            <td className="px-2.5 py-2 text-right tabular-nums">
              {money(x.whtAmount)}
              <span className="block text-xs text-gray-500">{x.whtRate}%</span>
            </td>
          </tr>
          <tr className="border-t-2 border-gray-900 font-semibold">
            <td className="px-2.5 py-2" colSpan={2}>
              <Both th="รวม" en="Total" />
            </td>
            <td className="px-2.5 py-2 text-right tabular-nums">{money(x.amount)}</td>
            <td className="px-2.5 py-2 text-right tabular-nums">{money(x.whtAmount)}</td>
          </tr>
        </tbody>
      </table>
      <InWords amount={x.whtAmount} label={{ th: "รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)", en: "Total tax withheld (in words)" }} />
      <div className="grid grid-cols-2 gap-4">
        <DocField label={{ th: "ผู้จ่ายเงิน", en: "Payer" }}>
          ☑ <Both th="หัก ณ ที่จ่าย" en="Withheld at source" />
        </DocField>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        <Both th="ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ" en="We certify that the above is true and correct." />
      </p>
      <Signatures left={{ th: "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", en: "Withholding agent" }} right={{ th: "ประทับตรานิติบุคคล", en: "Company seal" }} />
    </PrintFrame>
  );
}
