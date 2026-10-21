import { docText } from "../lib/text";
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
                <Both {...docText(x.description)} className="block text-xs text-gray-500" />
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
      <Signatures left={{ th: "ผู้จ่ายเงิน / ผู้อนุมัติ", en: "Paid / approved by" }} right={{ th: "ผู้รับเงิน", en: "Received by" }} signed="left" />
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
          { label: { th: "ออเดอร์นำเข้า", en: "Import order" }, value: p.importOrderNo || "ยอดยกมา / Brought forward" },
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
      <Signatures left={{ th: "ผู้จ่ายเงิน / ผู้อนุมัติ", en: "Paid / approved by" }} right={{ th: "ผู้รับเงิน", en: "Received by" }} signed="left" />
    </PrintFrame>
  );
}

/** What was paid for, written on income row 5 of the form (Revenue Department order Tor.Por.4/2528). */
const INCOME_TYPE: Record<string, { th: string; en: string }> = {
  "6200": { th: "ค่าเช่า", en: "Rent" },
  "6400": { th: "ค่าขนส่ง", en: "Transport" },
  "6500": { th: "ค่าโฆษณา", en: "Advertising" },
  "6600": { th: "ค่าบริการวิชาชีพ", en: "Professional fees" },
};

/** The income rows printed on every 50 ทวิ; our payments are all row 5. */
const INCOME_ROWS: { no: string; th: string; en: string }[] = [
  { no: "1.", th: "เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)", en: "Salaries, wages, allowances, bonuses — s.40(1)" },
  { no: "2.", th: "ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)", en: "Fees, commissions — s.40(2)" },
  { no: "3.", th: "ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)", en: "Royalties — s.40(3)" },
  { no: "4. (ก)", th: "ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)", en: "Interest — s.40(4)(a)" },
  { no: "(ข)", th: "เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)", en: "Dividends, profit shares — s.40(4)(b)" },
  {
    no: "5.",
    th: "การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ฯลฯ",
    en: "Payments subject to withholding under orders issued under s.3 ter, e.g. contract work, advertising, rent, transport, services",
  },
  { no: "6.", th: "อื่น ๆ (ระบุ)", en: "Other (specify)" },
];

/** The withholding forms the certificate can be filed with; the payee's one is ticked. */
const FORMS = ["ภ.ง.ด.1ก", "ภ.ง.ด.1ก พิเศษ", "ภ.ง.ด.2", "ภ.ง.ด.3", "ภ.ง.ด.2ก", "ภ.ง.ด.3ก", "ภ.ง.ด.53"];

/** A 13-digit tax ID in the form's boxes, grouped 1-4-5-2-1. */
function TaxIdBoxes({ id }: { id: string }) {
  const digits = id.padEnd(13, " ").slice(0, 13).split("");
  const groups = [1, 4, 5, 2, 1];
  let i = 0;
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="taxid-boxes">
      {groups.map((n, g) => (
        <span key={g} className="inline-flex">
          {digits.slice(i, (i += n)).map((d, k) => (
            <span key={k} className="-ml-px inline-flex h-6 w-5 items-center justify-center border border-gray-500 text-sm tabular-nums first:ml-0">
              {d.trim()}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

const Box = ({ checked }: { checked?: boolean }) => (
  <span className="mr-1 inline-flex h-3.5 w-3.5 items-center justify-center border border-gray-600 align-[-2px] text-[10px] leading-none">{checked ? "✓" : ""}</span>
);

/**
 * หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) in the Revenue Department's layout — copy 1 for the payee to
 * attach to their return, copy 2 for their records. One per payment.
 */
export function WithholdingCertificate({ expense: x, onClose }: { expense: Expense; onClose: () => void }) {
  const { company, expenses } = useData();
  const form = x.payeeType === "individual" ? "ภ.ง.ด.3" : "ภ.ง.ด.53";
  // The payee's line number on this month's return attachment — the same order the attachment is exported in.
  const sequence =
    expenses
      .filter((e) => e.date.startsWith(x.date.slice(0, 7)) && e.whtAmount > 0 && e.payeeType === x.payeeType)
      .sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo))
      .findIndex((e) => e.docNo === x.docNo) + 1;
  const what = INCOME_TYPE[x.account] ?? docText(x.description);
  const sign = Boolean(company.printSignature && company.signature);

  const copy = (no: 1 | 2) => (
    <div className="text-[13px] leading-snug text-gray-900">
      <div className="mb-2 flex justify-between text-xs text-gray-600">
        <span>
          <Both
            th={no === 1 ? "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)" : "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"}
            en={no === 1 ? "Copy 1 — payee, to attach to their tax return" : "Copy 2 — payee, for their records"}
          />
        </span>
        <span className="text-right">
          เล่มที่ / Book ______ <span className="ml-3">เลขที่ / No.</span> <span className="font-medium text-gray-900">{x.docNo}</span>
        </span>
      </div>
      <div className="border border-gray-700">
        <div className="border-b border-gray-700 px-3 py-2 text-center">
          <p className="font-display text-xl font-semibold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</p>
          <p className="text-xs text-gray-600">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร · Withholding Tax Certificate under section 50 bis of the Revenue Code</p>
        </div>

        {[
          { role: { th: "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", en: "Withholding agent" }, name: `${company.name.th} (${company.name.en})`, taxId: company.taxId, address: company.address.th },
          { role: { th: "ผู้ถูกหักภาษี ณ ที่จ่าย", en: "Person subject to withholding" }, name: x.payee, taxId: x.payeeTaxId, address: "" },
        ].map((p) => (
          <div key={p.role.en} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-gray-700 px-3 py-2">
            <p className="text-xs font-semibold text-gray-700">
              <Both th={`${p.role.th} :`} en={p.role.en} />
            </p>
            <div className="text-right text-xs text-gray-600">
              เลขประจำตัวผู้เสียภาษีอากร / Tax ID <TaxIdBoxes id={p.taxId} />
            </div>
            <p className="col-span-2">
              <span className="text-xs text-gray-500">ชื่อ / Name </span>
              <span className="font-medium">{p.name}</span>
            </p>
            <p className="col-span-2">
              <span className="text-xs text-gray-500">ที่อยู่ / Address </span>
              {p.address || <span className="inline-block w-3/4 border-b border-dotted border-gray-400 align-bottom">&nbsp;</span>}
            </p>
          </div>
        ))}

        <div className="border-b border-gray-700 px-3 py-2 text-xs">
          <p className="mb-1">
            <span className="font-semibold">ลำดับที่</span> <span className="inline-block min-w-8 border-b border-gray-500 text-center font-medium text-sm">{sequence || ""}</span>{" "}
            <span className="font-semibold">ในแบบ</span> <span className="text-gray-500">(Line no. on the return attachment)</span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {FORMS.map((f, i) => (
              <span key={f}>
                <Box checked={f === form} />({i + 1}) {f}
              </span>
            ))}
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-50">
              <th className="border-r border-gray-700 px-2 py-1.5 text-left font-medium">
                <Both th="ประเภทเงินได้พึงประเมินที่จ่าย" en="Type of income paid" />
              </th>
              <th className="w-28 border-r border-gray-700 px-2 py-1.5 font-medium">
                <Both th="วัน เดือน หรือปีภาษี ที่จ่าย" en="Date paid" />
              </th>
              <th className="w-28 border-r border-gray-700 px-2 py-1.5 text-right font-medium">
                <Both th="จำนวนเงินที่จ่าย" en="Amount paid" />
              </th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">
                <Both th="ภาษีที่หักและนำส่งไว้" en="Tax withheld" />
              </th>
            </tr>
          </thead>
          <tbody>
            {INCOME_ROWS.map((r) => {
              const ours = r.no === "5.";
              return (
                <tr key={r.no + r.th} className="align-top" data-testid={ours ? "income-row-5" : undefined}>
                  <td className="border-r border-gray-700 px-2 py-1">
                    <span className="mr-1 font-medium">{r.no}</span>
                    {r.th}
                    <span className="block text-[11px] text-gray-400">{r.en}</span>
                    {ours && (
                      <span className="mt-0.5 block font-medium">
                        (ระบุ / specify) {what.th} / {what.en} — {x.whtRate}%
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-r border-gray-700 px-2 py-1 text-center">{ours ? <DocDate iso={x.date} /> : ""}</td>
                  <td className="border-r border-gray-700 px-2 py-1 text-right tabular-nums">{ours ? money(x.amount) : ""}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{ours ? money(x.whtAmount) : ""}</td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-700 font-semibold">
              <td className="border-r border-gray-700 px-2 py-1.5 text-right" colSpan={2}>
                <Both th="รวมเงินที่จ่ายและภาษีที่หักนำส่ง" en="Total paid and tax withheld" />
              </td>
              <td className="border-r border-gray-700 px-2 py-1.5 text-right tabular-nums">{money(x.amount)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(x.whtAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="border-t border-gray-700 px-3 py-2 text-xs">
          <span className="font-semibold">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</span> <span className="text-gray-500">Total tax withheld (in words)</span>
          <span className="ml-2 font-medium">({thaiBahtText(x.whtAmount)})</span>
          <span className="block text-gray-500">({englishBahtText(x.whtAmount)})</span>
        </div>
        <div className="border-t border-gray-700 px-3 py-2 text-xs text-gray-700">
          เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ________ บาท · กองทุนประกันสังคม ________ บาท · กองทุนสำรองเลี้ยงชีพ ________ บาท
          <span className="block text-[11px] text-gray-400">Contributions to government pension / social security / provident funds</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-700 px-3 py-2 text-xs">
          <span className="font-semibold">ผู้จ่ายเงิน / Payer</span>
          {["(1) หัก ณ ที่จ่าย / Withheld at source", "(2) ออกให้ตลอดไป / Paid by payer, always", "(3) ออกให้ครั้งเดียว / Paid by payer, once", "(4) อื่น ๆ / Other"].map((o, i) => (
            <span key={o}>
              <Box checked={i === 0} />
              {o}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-gray-700 px-3 py-3 text-xs">
          <div>
            <p className="text-gray-700">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
            <p className="text-[11px] text-gray-400">We certify that the above statements and figures are true and correct.</p>
            <div className="mt-2 flex h-12 items-end">{sign && <img src={company.signature} alt="" className="max-h-12 object-contain" data-testid="doc-signature" />}</div>
            <p className="mt-1">ลงชื่อ / Signed ____________________________ ผู้จ่ายเงิน / Payer</p>
            <p className="mt-1">
              <DocDate iso={x.date} />
            </p>
          </div>
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-gray-400 text-center text-[10px] text-gray-400">
            {sign && company.stamp ? <img src={company.stamp} alt="" className="h-24 w-24 object-contain" data-testid="doc-stamp" /> : "ประทับตรานิติบุคคล (ถ้ามี) Company seal"}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) หมายถึง เลขประจำตัวประชาชนของผู้มีเงินได้ หรือเลขประจำตัวผู้เสียภาษีอากรของนิติบุคคล · Note: the 13-digit tax ID is the
        payee's citizen ID or the company's tax ID.
      </p>
    </div>
  );

  return (
    <PrintFrame
      onClose={onClose}
      email={{ subject: `หนังสือรับรองการหักภาษี ณ ที่จ่าย / Withholding tax certificate ${x.docNo}`, document: `withholding certificate ${x.docNo}`, filename: `WHT-${x.docNo}`, entityType: "expense", entityId: x.docNo }}
      runningTitle={`50 ทวิ / Withholding certificate ${x.docNo}`}
    >
      {copy(1)}
      <div className="my-10 border-t-2 border-dashed border-gray-300 print:my-0 print:border-0" style={{ breakAfter: "page" }} />
      {copy(2)}
    </PrintFrame>
  );
}
