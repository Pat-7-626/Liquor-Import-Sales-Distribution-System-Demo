import type { ReactNode } from "react";
import type { ApDocument, Expense } from "../data/types";
import { useData } from "../state/DataContext";
import { ACCOUNTS } from "../domain/ledger";
import { englishBahtText, thaiBahtText } from "../lib/amountInWords";
import { Both, DocDate, DocMeta, PrintFrame, SellerBlock, Signatures } from "./TaxDocument";

const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const METHODS = {
  transfer: { th: "โอนเงิน", en: "Bank transfer" },
  cheque: { th: "เช็ค", en: "Cheque" },
  cash: { th: "เงินสด", en: "Cash" },
} as const;

function DocHeader({ title, meta }: { title: { th: string; en: string }; meta: { label: { th: string; en: string }; value: ReactNode }[] }) {
  return (
    <div className="mb-5 flex flex-col gap-4 border-b-2 border-gray-900 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 print:flex-row">
      <div className="min-w-0 flex-1">
        <SellerBlock />
      </div>
      <div className="shrink-0 sm:text-right print:text-right">
        <h2 className="font-display text-2xl font-semibold text-gray-900">{title.th}</h2>
        <p className="text-sm uppercase tracking-wide text-gray-500">{title.en}</p>
        <div className="mt-3 flex justify-end">
          <DocMeta rows={meta} />
        </div>
      </div>
    </div>
  );
}

function Payee({ name, taxId, extra }: { name: string; taxId?: string; extra?: ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-gray-200 p-3 text-sm leading-relaxed">
      <p className="text-xs font-medium text-gray-500">
        <Both th="จ่ายให้" en="Paid to" />
      </p>
      <p className="mt-1 font-semibold text-gray-900">{name}</p>
      {taxId && (
        <p className="text-gray-700">
          เลขประจำตัวผู้เสียภาษี <span className="text-gray-400">/ Tax ID</span> <span className="font-medium tabular-nums">{taxId}</span>
        </p>
      )}
      {extra}
    </div>
  );
}

function AmountRows({ rows, total }: { rows: { label: ReactNode; amount: number }[]; total: { label: ReactNode; amount: number } }) {
  return (
    <table className="mb-4 w-full text-sm">
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="py-2 text-gray-700">{r.label}</td>
            <td className="py-2 text-right tabular-nums">{money(r.amount)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-gray-900">
          <td className="py-2 font-semibold">{total.label}</td>
          <td className="py-2 text-right font-semibold tabular-nums">{money(total.amount)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function InWords({ amount }: { amount: number }) {
  return (
    <p className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
      ({thaiBahtText(amount)})<span className="block text-xs text-gray-500">({englishBahtText(amount)})</span>
    </p>
  );
}

/** ใบสำคัญจ่าย — the voucher kept with the payee's bill as evidence of an expense payment. */
export function ExpenseVoucher({ expense: x, onClose }: { expense: Expense; onClose: () => void }) {
  const account = ACCOUNTS.find((a) => a.code === x.account);
  return (
    <PrintFrame onClose={onClose}>
      <DocHeader
        title={{ th: "ใบสำคัญจ่าย", en: "Payment Voucher" }}
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: x.docNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={x.date} /> },
        ]}
      />
      <Payee name={x.payee} taxId={x.payeeTaxId} />
      <AmountRows
        rows={[
          {
            label: (
              <>
                <span className="mr-2 font-mono text-xs text-gray-400">{x.account}</span>
                {account?.name.th} <span className="text-gray-400">/ {account?.name.en}</span>
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
      <p className="text-sm text-gray-700">
        <Both th="ชำระโดย" en="Paid by" />: {METHODS[x.method].th} / {METHODS[x.method].en}
        {x.reference ? ` · ${x.reference}` : ""}
      </p>
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
    <PrintFrame onClose={onClose}>
      <DocHeader
        title={{ th: "ใบสำคัญจ่าย", en: "Payment Voucher" }}
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: p.docNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={p.date} /> },
        ]}
      />
      <Payee
        name={supplier?.name ?? p.supplierId}
        extra={
          <p className="text-gray-600">
            <Both th="ใบแจ้งหนี้" en="Invoice" />: {inv?.reference ?? "—"} · {p.importOrderNo}
          </p>
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
      <p className="text-sm text-gray-700">
        <Both th="ชำระโดย" en="Paid by" />: {p.method ? `${METHODS[p.method].th} / ${METHODS[p.method].en}` : "—"}
        {p.reference ? ` · ${p.reference}` : ""}
      </p>
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
  const { company } = useData();
  const income = INCOME_TYPE[x.account] ?? { th: `ค่าบริการ (40(8)) — ${x.description}`, en: `Services (s.40(8)) — ${x.description}` };
  const form = x.payeeType === "individual" ? "ภ.ง.ด.3" : "ภ.ง.ด.53";
  return (
    <PrintFrame onClose={onClose}>
      <div className="mb-4 text-center">
        <h2 className="font-display text-2xl font-semibold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
        <p className="text-sm uppercase tracking-wide text-gray-500">Withholding Tax Certificate · ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
        <p className="mt-1 text-sm text-gray-600">
          <Both th="เลขที่" en="No." /> {x.docNo}
        </p>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 print:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500">
            <Both th="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย" en="Payer (withholding agent)" />
          </p>
          <p className="mt-1 font-semibold">{company.name.th}</p>
          <p className="text-gray-600">{company.address.th}</p>
          <p className="mt-1 tabular-nums">
            <Both th="เลขประจำตัวผู้เสียภาษี" en="Tax ID" />: {company.taxId}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500">
            <Both th="ผู้ถูกหักภาษี ณ ที่จ่าย" en="Payee" />
          </p>
          <p className="mt-1 font-semibold">{x.payee}</p>
          <p className="mt-1 tabular-nums">
            <Both th="เลขประจำตัวผู้เสียภาษี" en="Tax ID" />: {x.payeeTaxId}
          </p>
          <p className="mt-1">
            <Both th="ยื่นรวมกับแบบ" en="Filed with" />: <span className="font-medium">{form}</span>
          </p>
        </div>
      </div>
      <table className="mb-4 w-full border border-gray-300 text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="border border-gray-300 px-3 py-2 text-left">
              <Both th="ประเภทเงินได้ที่จ่าย" en="Type of income" />
            </th>
            <th className="border border-gray-300 px-3 py-2">
              <Both th="วันที่จ่าย" en="Date paid" />
            </th>
            <th className="border border-gray-300 px-3 py-2 text-right">
              <Both th="จำนวนเงินที่จ่าย" en="Amount paid" />
            </th>
            <th className="border border-gray-300 px-3 py-2 text-right">
              <Both th="ภาษีที่หักและนำส่งไว้" en="Tax withheld" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-300 px-3 py-2">
              {income.th}
              <span className="block text-xs text-gray-500">{income.en}</span>
            </td>
            <td className="border border-gray-300 px-3 py-2 text-center">
              <DocDate iso={x.date} />
            </td>
            <td className="border border-gray-300 px-3 py-2 text-right tabular-nums">{money(x.amount)}</td>
            <td className="border border-gray-300 px-3 py-2 text-right tabular-nums">
              {money(x.whtAmount)}
              <span className="block text-xs text-gray-500">{x.whtRate}%</span>
            </td>
          </tr>
          <tr className="font-semibold">
            <td className="border border-gray-300 px-3 py-2" colSpan={2}>
              <Both th="รวม" en="Total" />
            </td>
            <td className="border border-gray-300 px-3 py-2 text-right tabular-nums">{money(x.amount)}</td>
            <td className="border border-gray-300 px-3 py-2 text-right tabular-nums">{money(x.whtAmount)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mb-1 text-sm">
        <Both th="รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)" en="Total tax withheld (in words)" />
      </p>
      <InWords amount={x.whtAmount} />
      <p className="mt-3 text-sm">
        <Both th="ผู้จ่ายเงิน" en="Payer" />: ☑ <Both th="หัก ณ ที่จ่าย" en="Withheld at source" />
      </p>
      <p className="mt-2 text-xs text-gray-500">
        ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ / We certify that the above is true and correct.
      </p>
      <Signatures left={{ th: "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", en: "Withholding agent" }} right={{ th: "ประทับตรานิติบุคคล", en: "Company seal" }} />
    </PrintFrame>
  );
}
