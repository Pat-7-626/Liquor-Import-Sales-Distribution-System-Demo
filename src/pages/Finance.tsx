import { useMemo, useRef, useState, type ReactNode } from "react";
import { hasText, noText, toText } from "../lib/text";
import { CheckCircle2, FileText, Link2, Lock, Plus, Receipt, RotateCcw, Trash2, Unlink, Upload, Wand2, XCircle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { NewButton } from "../components/NewButton";
import { Dialog, DialogActions } from "../components/Dialog";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { FieldLabel, TextPair, inputClass, selectClass } from "../components/FormKit";
import { BarList, ChartCard, KpiTile } from "../components/charts";
import { ExpenseVoucher, WithholdingCertificate } from "../components/FinanceDocuments";
import { parseCsv, readCsvText } from "../components/CsvImport";
import { useRunAction } from "../lib/useRunAction";
import { useLedger } from "../lib/useLedger";
import { formatCurrency, formatDate } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { addDays, isValidThaiTaxId, todayIso } from "../lib/business";
import { monthLabel } from "../lib/analytics";
import { ACCOUNTS, EXPENSE_ACCOUNTS, SYSTEM_ACCOUNTS, bankAmount, profitAndLoss, type JournalEntry } from "../domain/ledger";
import { MATCH_WINDOW_DAYS, WHT_RATES, firstOfMonth, lastOfMonth, reconcile, withholdingByMonth } from "../domain/finance";
import type { BankLineInput, ExpenseInput } from "../state/DataContext";
import type { BankLine, Expense, PaymentMethod } from "../data/types";
import { both } from "../i18n/translations";
import { RecordLink, RecordButton } from "../components/RecordLink";

const METHODS: PaymentMethod[] = ["transfer", "cheque", "cash"];
const r2 = (n: number) => Math.round(n * 100) / 100;

const useBaht = () => {
  const { lang } = useLanguage();
  return (n: number) => `${n < 0 ? "−" : ""}฿${formatCurrency(Math.abs(n), lang)}`;
};

/** These screens are all money — only roles that see prices get in (the API masks the figures for the rest). */
function Guard({ eyebrow, title, subtitle, action, children }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useLanguage();
  const { canViewSensitive } = useRole();
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        {canViewSensitive && action}
      </div>
      {canViewSensitive ? (
        children
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          <Lock size={15} />
          {t("gl.restricted")}
        </p>
      )}
    </div>
  );
}

const iconBtn = "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50";

// ───────────────────────────── expenses ─────────────────────────────

/** Withholding rates the law sets for the usual kinds of payment — a suggestion when the account is picked. */
const SUGGESTED_WHT: Record<string, number> = { "6200": 5, "6400": 1, "6500": 2, "6600": 3, "6900": 3, "6100": 0, "6300": 0 };

export function Expenses() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const { expenses, manualJournals, company } = useData();
  const baht = useBaht();
  const [creating, setCreating] = useState(false);
  const [voucher, setVoucher] = useState<Expense | null>(null);
  const [certificate, setCertificate] = useState<Expense | null>(null);
  const [month, setMonth] = useState("");
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const accountName = (code: string) => bi(ACCOUNTS.find((a) => a.code === code)?.name ?? { th: code, en: code });

  const months = [...new Set(expenses.map((x) => x.date.slice(0, 7)))].sort().reverse();
  const shown = expenses.filter((x) => !month || x.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.docNo.localeCompare(a.docNo));
  const sum = (xs: Expense[], f: (x: Expense) => number) => r2(xs.reduce((s, x) => s + f(x), 0));
  const ytd = expenses.filter((x) => x.date.startsWith(today.slice(0, 4)));
  const mtd = expenses.filter((x) => x.date.startsWith(thisMonth));
  const wht = withholdingByMonth(expenses, manualJournals);
  const whtOutstanding = r2(wht.reduce((s, m) => s + m.outstanding, 0));
  const byAccount = EXPENSE_ACCOUNTS.map((a) => ({ a, v: sum(ytd.filter((x) => x.account === a.code), (x) => x.amount) })).filter((x) => x.v > 0);

  return (
    <Guard
      eyebrow={t("nav.group.accounting")}
      title={t("fin.expensesTitle")}
      subtitle={t("fin.expensesSubtitle")}
      action={<NewButton label={t("fin.newExpense")} allowed={can("manageExpenses")} onClick={() => setCreating(true)} />}
    >
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label={t("fin.expensesMonth")} value={baht(sum(mtd, (x) => x.amount))} sensitive hint={t("gl.exVat")} />
        <KpiTile label={t("fin.expensesYtd")} value={baht(sum(ytd, (x) => x.amount))} sensitive hint={t("gl.exVat")} />
        <KpiTile label={t("fin.vatReclaimable")} value={baht(sum(mtd, (x) => x.vat))} sensitive hint={t("fin.thisMonth")} />
        <KpiTile label={t("fin.whtOwed")} value={baht(whtOutstanding)} sensitive tone={whtOutstanding > 0 ? "warning" : "good"} to="/tax/withholding" />
      </div>

      <div className="mb-6">
        <ChartCard
          wide
          sensitive
          title={t("fin.byAccount")}
          subtitle={t("fin.byAccountSub")}
          table={{ columns: [t("gl.account"), t("ap.amount")], rows: byAccount.map((x) => [`${x.a.code} ${bi(x.a.name)}`, baht(x.v)]) }}
        >
          <BarList items={byAccount.sort((a, b) => b.v - a.v).map((x) => ({ key: x.a.code, label: bi(x.a.name), value: x.v, display: baht(x.v) }))} />
        </ChartCard>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${selectClass} w-auto!`} aria-label={t("gl.month")}>
          <option value="">{t("fin.allMonths")}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, lang)}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{t("gl.entriesCount").replace("{n}", String(shown.length))}</span>
        <button
          onClick={() =>
            exportToExcel(
              "expenses",
              [both("fin.docNo"), both("erp.date"), both("fin.payee"), both("tax.taxId"), both("gl.account"), both("fin.description"), both("fin.amount"), both("vat.vat"), both("fin.wht"), both("fin.paid")],
              shown.map((x) => [x.docNo, x.date, x.payee, x.payeeTaxId, `${x.account} ${accountName(x.account)}`, bi(x.description), x.amount, x.vat, x.whtAmount, x.paid]),
            )
          }
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.export")}
        </button>
      </div>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("fin.docNo")}</th>
            <th className={th}>{t("fin.payee")}</th>
            <th className={th}>{t("gl.account")}</th>
            <th className={`${th} text-right`}>{t("fin.amount")}</th>
            <th className={`${th} text-right`}>{t("vat.vat")}</th>
            <th className={`${th} text-right`}>{t("fin.wht")}</th>
            <th className={`${th} text-right`}>{t("fin.paid")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shown.length === 0 && <EmptyRow colSpan={8} />}
          {shown.map((x) => (
            <tr key={x.docNo} data-testid="expense-row" data-doc={x.docNo}>
              <td className={td}>
                <RecordButton onClick={() => setVoucher(x)} testid={`voucher-${x.docNo}`} title={t("fin.voucher")}>
                  {x.docNo}
                </RecordButton>
                <span className="block text-xs text-gray-500">{formatDate(x.date, lang)}</span>
              </td>
              <td className={`${td} max-w-xs whitespace-normal`}>
                {x.payee}
                <span className="block text-xs text-gray-500">{bi(x.description)}</span>
              </td>
              <td className={td}>
                <span className="mr-1 font-mono text-xs text-gray-400">{x.account}</span>
                {accountName(x.account)}
              </td>
              <td className={`${td} text-right tabular-nums`}>{baht(x.amount)}</td>
              <td className={`${td} text-right tabular-nums text-gray-600`}>{x.vat ? baht(x.vat) : "—"}</td>
              <td className={`${td} text-right tabular-nums text-gray-600`}>{x.whtAmount ? `${baht(x.whtAmount)} (${x.whtRate}%)` : "—"}</td>
              <td className={`${td} text-right font-medium tabular-nums`}>{baht(x.paid)}</td>
              <td className={td}>
                <div className="flex justify-end gap-1">
                  {x.whtAmount > 0 && (
                    <button className={iconBtn} onClick={() => setCertificate(x)} data-testid={`cert-${x.docNo}`}>
                      <FileText size={13} />
                      {t("fin.certificate")}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      {company.closedThrough && <p className="mt-2 text-xs text-gray-500">{t("fin.closedNote").replace("{d}", formatDate(company.closedThrough, lang))}</p>}

      {creating && <ExpenseDialog onClose={() => setCreating(false)} />}
      {voucher && <ExpenseVoucher expense={voucher} onClose={() => setVoucher(null)} />}
      {certificate && <WithholdingCertificate expense={certificate} onClose={() => setCertificate(null)} />}
    </Guard>
  );
}

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { recordExpense } = useData();
  const [f, setF] = useState<ExpenseInput>({
    date: todayIso(),
    payee: "",
    payeeTaxId: "",
    payeeType: "company",
    account: "6900",
    description: noText(),
    amount: 0,
    vat: 0,
    whtRate: 3,
    method: "transfer",
    reference: "",
  });
  const [hasVat, setHasVat] = useState(true);
  const set = (patch: Partial<ExpenseInput>) => setF((x) => ({ ...x, ...patch }));
  const vat = hasVat ? r2(f.amount * 0.07) : 0;
  const wht = r2((f.amount * f.whtRate) / 100);
  const paid = r2(f.amount + vat - wht);
  const taxIdOk = !f.payeeTaxId || isValidThaiTaxId(f.payeeTaxId);
  const ok = f.payee.trim() && hasText(toText(f.description)) && f.amount > 0 && taxIdOk && (f.whtRate === 0 || isValidThaiTaxId(f.payeeTaxId));
  return (
    <Dialog title={t("fin.newExpense")} onClose={onClose} wide>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ok && (await runAction(recordExpense({ ...f, vat }), `${t("fin.expenseSaved")}: ${f.payee}`))) onClose();
        }}
      >
        <label className="block">
          <FieldLabel>{t("fin.payee")}</FieldLabel>
          <input value={f.payee} onChange={(e) => set({ payee: e.target.value })} className={inputClass} data-testid="ex-payee" />
        </label>
        <label className="block">
          <FieldLabel>{t("tax.taxId")}</FieldLabel>
          <input value={f.payeeTaxId} onChange={(e) => set({ payeeTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} className={inputClass} data-testid="ex-taxid" inputMode="numeric" />
          {!taxIdOk && <span className="mt-1 block text-xs text-rose-600">{t("fin.taxIdInvalid")}</span>}
        </label>
        <label className="block">
          <FieldLabel>{t("fin.payeeType")}</FieldLabel>
          <select value={f.payeeType} onChange={(e) => set({ payeeType: e.target.value as ExpenseInput["payeeType"] })} className={selectClass}>
            <option value="company">{t("fin.payeeCompany")}</option>
            <option value="individual">{t("fin.payeeIndividual")}</option>
          </select>
        </label>
        <label className="block">
          <FieldLabel>{t("gl.account")}</FieldLabel>
          <select value={f.account} onChange={(e) => set({ account: e.target.value, whtRate: SUGGESTED_WHT[e.target.value] ?? f.whtRate })} className={selectClass} data-testid="ex-account">
            {EXPENSE_ACCOUNTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} {bi(a.name)}
              </option>
            ))}
          </select>
        </label>
        <div className="block sm:col-span-2">
          <FieldLabel>{t("fin.description")}</FieldLabel>
          <TextPair value={toText(f.description)} onChange={(v) => set({ description: v })} testid="ex-description" />
        </div>
        <label className="block">
          <FieldLabel>{t("fin.amountExVat")}</FieldLabel>
          <input type="number" step="0.01" min={0} value={f.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} className={inputClass} data-testid="ex-amount" />
        </label>
        <label className="block">
          <FieldLabel>{t("erp.date")}</FieldLabel>
          <input type="date" value={f.date} max={todayIso()} onChange={(e) => set({ date: e.target.value })} className={inputClass} />
          <span className="mt-1 block text-xs text-gray-500">{formatDate(f.date, lang)}</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={hasVat} onChange={(e) => setHasVat(e.target.checked)} />
          {t("fin.hasTaxInvoice")}
        </label>
        <label className="block">
          <FieldLabel>{t("fin.whtRate")}</FieldLabel>
          <select value={f.whtRate} onChange={(e) => set({ whtRate: Number(e.target.value) })} className={selectClass} data-testid="ex-wht">
            {WHT_RATES.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? t("fin.noWht") : `${r}%`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <FieldLabel>{t("erp.paymentMethod")}</FieldLabel>
          <select value={f.method} onChange={(e) => set({ method: e.target.value as PaymentMethod })} className={selectClass}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`erp.method.${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <FieldLabel>{t("erp.paymentReference")}</FieldLabel>
          <input value={f.reference} onChange={(e) => set({ reference: e.target.value })} className={inputClass} />
        </label>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm sm:col-span-2">
          {[
            [t("fin.amountExVat"), f.amount],
            [t("vat.vat"), vat],
            [`${t("fin.lessWht")} ${f.whtRate}%`, -wht],
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between text-gray-600">
              <span>{l}</span>
              <span className="tabular-nums">฿{formatCurrency(Number(v), lang)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>{t("fin.paid")}</span>
            <span className="tabular-nums" data-testid="ex-paid">
              ฿{formatCurrency(paid, lang)}
            </span>
          </div>
          {f.whtRate > 0 && <p className="mt-1 text-xs text-gray-500">{t("fin.whtExplain")}</p>}
        </div>
        <div className="sm:col-span-2">
          <DialogActions onCancel={onClose} submitLabel={t("fin.recordExpense")} disabled={!ok} testid="ex-save" />
        </div>
      </form>
    </Dialog>
  );
}

// ───────────────────────────── withholding tax ─────────────────────────────

export function Withholding() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const runAction = useRunAction();
  const { expenses, manualJournals, remitWithholding } = useData();
  const baht = useBaht();
  const [open, setOpen] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Expense | null>(null);
  const [remitting, setRemitting] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const today = todayIso();
  const months = withholdingByMonth(expenses, manualJournals);
  const owed = r2(months.reduce((s, m) => s + m.outstanding, 0));
  const overdue = months.filter((m) => m.outstanding > 0 && m.dueDate < today);

  const exportMonth = (month: string, payeeType: Expense["payeeType"]) =>
    exportToExcel(
      `${payeeType === "individual" ? "pnd3" : "pnd53"}-${month}`,
      [both("fin.seq"), both("fin.payee"), both("tax.taxId"), both("erp.date"), both("fin.description"), both("fin.whtRate"), both("fin.amount"), both("fin.wht")],
      expenses
        .filter((x) => x.date.startsWith(month) && x.whtAmount > 0 && x.payeeType === payeeType)
        // The same order the certificates number their "line no. on the return".
        .sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo))
        .map((x, i) => [i + 1, x.payee, x.payeeTaxId, x.date, bi(x.description), `${x.whtRate}%`, x.amount, x.whtAmount]),
    );

  return (
    <Guard eyebrow={t("nav.group.tax")} title={t("fin.whtTitle")} subtitle={t("fin.whtSubtitle")}>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiTile label={t("fin.whtOwed")} value={baht(owed)} sensitive tone={owed > 0 ? "warning" : "good"} />
        <KpiTile label={t("fin.whtOverdue")} value={String(overdue.length)} tone={overdue.length ? "critical" : "good"} hint={t("fin.whtDueHint")} />
        <KpiTile label={t("fin.whtYtd")} value={baht(r2(months.filter((m) => m.month.startsWith(today.slice(0, 4))).reduce((s, m) => s + m.withheld, 0)))} sensitive />
      </div>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("gl.month")}</th>
            <th className={`${th} text-right`}>{t("fin.pnd53")}</th>
            <th className={`${th} text-right`}>{t("fin.pnd3")}</th>
            <th className={`${th} text-right`}>{t("fin.withheld")}</th>
            <th className={`${th} text-right`}>{t("fin.remitted")}</th>
            <th className={th}>{t("ar.dueDate")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {months.length === 0 && <EmptyRow colSpan={7} />}
          {months.map((m) => {
            const late = m.outstanding > 0 && m.dueDate < today;
            const remittable = m.outstanding > 0 && m.month < today.slice(0, 7);
            const rows = expenses.filter((x) => x.date.startsWith(m.month) && x.whtAmount > 0).sort((a, b) => a.date.localeCompare(b.date));
            return [
              <tr key={m.month} data-testid="wht-month" data-month={m.month}>
                <td className={td}>
                  <button onClick={() => setOpen(open === m.month ? null : m.month)} className="font-medium text-indigo-600 hover:underline">
                    {monthLabel(m.month, lang)}
                  </button>
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {baht(m.companies.tax)}
                  <span className="block text-xs text-gray-500">{t("fin.payments").replace("{n}", String(m.companies.count))}</span>
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {baht(m.individuals.tax)}
                  <span className="block text-xs text-gray-500">{t("fin.payments").replace("{n}", String(m.individuals.count))}</span>
                </td>
                <td className={`${td} text-right font-medium tabular-nums`}>{baht(m.withheld)}</td>
                <td className={`${td} text-right tabular-nums`}>{baht(m.remitted)}</td>
                <td className={td}>
                  {formatDate(m.dueDate, lang)}
                  {m.outstanding <= 0 ? (
                    <span className="block text-xs font-medium text-emerald-700">{t("fin.remittedOk")}</span>
                  ) : late ? (
                    <span className="block text-xs font-medium text-rose-700">{t("fin.lateRemit")}</span>
                  ) : (
                    <span className="block text-xs font-medium text-amber-700">{t("fin.toRemit").replace("{amt}", baht(m.outstanding))}</span>
                  )}
                </td>
                <td className={td}>
                  {can("manageExpenses") && remittable && (
                    <button
                      onClick={() => {
                        setReference("");
                        setRemitting(m.month);
                      }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                      data-testid={`remit-${m.month}`}
                    >
                      {t("fin.remit")}
                    </button>
                  )}
                </td>
              </tr>,
              open === m.month && (
                <tr key={`${m.month}-detail`}>
                  <td colSpan={7} className="bg-gray-50/70 px-4 py-3">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <button onClick={() => exportMonth(m.month, "company")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        {t("fin.exportPnd53")}
                      </button>
                      <button onClick={() => exportMonth(m.month, "individual")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        {t("fin.exportPnd3")}
                      </button>
                    </div>
                    <ul className="divide-y divide-gray-200 text-sm">
                      {rows.map((x) => (
                        <li key={x.docNo} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span>
                            <span className="text-gray-500">{formatDate(x.date, lang)}</span> · {x.payee}{" "}
                            <span className="text-xs text-gray-400">
                              {x.payeeType === "individual" ? t("fin.pnd3") : t("fin.pnd53")} · {x.whtRate}% {t("fin.of")} {baht(x.amount)}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{baht(x.whtAmount)}</span>
                            <button className={iconBtn} onClick={() => setCertificate(x)}>
                              <FileText size={13} />
                              {t("fin.certificate")}
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </TableContainer>
      <p className="mt-3 text-xs text-gray-500">{t("fin.whtNote")}</p>

      {remitting && (
        <Dialog title={`${t("fin.remit")} · ${monthLabel(remitting, lang)}`} onClose={() => setRemitting(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await runAction(remitWithholding(remitting, reference), t("fin.remittedToast"))) setRemitting(null);
            }}
          >
            <p className="text-sm text-gray-600">
              {t("fin.remitExplain").replace("{amt}", baht(months.find((m) => m.month === remitting)?.outstanding ?? 0))}
            </p>
            <label className="block">
              <FieldLabel>{t("fin.receiptNo")}</FieldLabel>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} data-testid="remit-ref" />
            </label>
            <DialogActions onCancel={() => setRemitting(null)} submitLabel={t("fin.remit")} testid="remit-save" />
          </form>
        </Dialog>
      )}
      {certificate && <WithholdingCertificate expense={certificate} onClose={() => setCertificate(null)} />}
    </Guard>
  );
}

// ───────────────────────────── manual journals ─────────────────────────────

export function ManualJournals() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const runAction = useRunAction();
  const { manualJournals, reverseJournal } = useData();
  const baht = useBaht();
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const name = (code: string) => bi(ACCOUNTS.find((a) => a.code === code)?.name ?? { th: code, en: code });
  const reversed = new Set(manualJournals.map((j) => j.reverses).filter(Boolean));
  const list = [...manualJournals].sort((a, b) => b.date.localeCompare(a.date) || b.entryNo.localeCompare(a.entryNo));

  return (
    <Guard
      eyebrow={t("nav.group.accounting")}
      title={t("fin.mjTitle")}
      subtitle={t("fin.mjSubtitle")}
      action={<NewButton label={t("fin.newJournal")} allowed={can("postJournals")} onClick={() => setCreating(true)} />}
    >
      <div className="space-y-3">
        {list.length === 0 && <p className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">{t("common.noResults")}</p>}
        {list.map((j) => {
          const total = r2(j.lines.reduce((s, l) => s + l.debit, 0));
          return (
            <article key={j.entryNo} className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="manual-journal" data-entry={j.entryNo}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{j.entryNo}</span>
                  <span className="text-gray-500">{formatDate(j.date, lang)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${j.kind === "whtRemittance" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {j.kind === "whtRemittance" ? t("fin.kindWht") : j.reverses ? t("fin.kindReversal") : t("fin.kindManual")}
                  </span>
                  <span className="text-gray-700">{bi(j.memo)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  {bi(j.actor)} · {baht(total)}
                  {reversed.has(j.entryNo) && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">{t("fin.reversed")}</span>}
                  {can("postJournals") && j.kind === "manual" && !j.reverses && !reversed.has(j.entryNo) && (
                    <button
                      className={iconBtn}
                      onClick={() => {
                        setReason("");
                        setReversing(j.entryNo);
                      }}
                      data-testid={`reverse-${j.entryNo}`}
                    >
                      <RotateCcw size={13} />
                      {t("fin.reverse")}
                    </button>
                  )}
                </span>
              </header>
              <table className="w-full text-sm">
                <tbody>
                  {j.lines.map((l, i) => (
                    <tr key={i}>
                      <td className={`px-4 py-1.5 ${l.credit ? "pl-10 text-gray-600" : "text-gray-800"}`}>
                        <span className="mr-2 font-mono text-xs text-gray-400">{l.account}</span>
                        {name(l.account)}
                      </td>
                      <td className="w-36 px-4 py-1.5 text-right tabular-nums">{l.debit ? baht(l.debit) : ""}</td>
                      <td className="w-36 px-4 py-1.5 text-right tabular-nums text-gray-600">{l.credit ? baht(l.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>

      {creating && <JournalDialog onClose={() => setCreating(false)} />}
      {reversing && (
        <Dialog title={`${t("fin.reverse")} · ${reversing}`} onClose={() => setReversing(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await runAction(reverseJournal(reversing, reason), t("fin.reversedToast"))) setReversing(null);
            }}
          >
            <p className="text-sm text-gray-600">{t("fin.reverseExplain")}</p>
            <label className="block">
              <FieldLabel>{t("fin.reason")}</FieldLabel>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} data-testid="reverse-reason" />
            </label>
            <DialogActions onCancel={() => setReversing(null)} submitLabel={t("fin.reverse")} disabled={!reason.trim()} testid="reverse-save" />
          </form>
        </Dialog>
      )}
    </Guard>
  );
}

type DraftLine = { account: string; debit: string; credit: string };

/** A balanced entry by hand; optionally explaining one bank statement line (then matched to it). */
function JournalDialog({ onClose, bankLine }: { onClose: () => void; bankLine?: BankLine }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { postJournal } = useData();
  const usable = ACCOUNTS.filter((a) => !SYSTEM_ACCOUNTS.includes(a.code));
  const [date, setDate] = useState(bankLine?.date ?? todayIso());
  // A statement line's description is a starting point; it goes in the language it's written in.
  const [memo, setMemo] = useState(() => toText(bankLine?.description ?? ""));
  const [lines, setLines] = useState<DraftLine[]>(
    bankLine
      ? bankLine.amount < 0
        ? [
            { account: "6900", debit: String(-bankLine.amount), credit: "" },
            { account: "1110", debit: "", credit: String(-bankLine.amount) },
          ]
        : [
            { account: "1110", debit: String(bankLine.amount), credit: "" },
            { account: "3200", debit: "", credit: String(bankLine.amount) },
          ]
      : [
          { account: "6900", debit: "", credit: "" },
          { account: "1110", debit: "", credit: "" },
        ],
  );
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const debit = r2(lines.reduce((s, l) => s + n(l.debit), 0));
  const credit = r2(lines.reduce((s, l) => s + n(l.credit), 0));
  const linesOk = lines.every((l) => (n(l.debit) > 0) !== (n(l.credit) > 0) && n(l.debit) >= 0 && n(l.credit) >= 0);
  const ok = hasText(memo) && lines.length >= 2 && linesOk && debit === credit && debit > 0;
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Dialog title={bankLine ? t("fin.explainLine") : t("fin.newJournal")} onClose={onClose} wide>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          const input = { date, memo, lines: lines.map((l) => ({ account: l.account, debit: n(l.debit), credit: n(l.credit) })), bankLineId: bankLine?.id ?? null };
          if (await runAction(postJournal(input), t("fin.journalPosted"))) onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <FieldLabel>{t("erp.date")}</FieldLabel>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs text-gray-500">{formatDate(date, lang)}</span>
          </label>
          <div className="block sm:col-span-2">
            <FieldLabel>{t("gl.memo")}</FieldLabel>
            <TextPair value={memo} onChange={setMemo} testid="jv-memo" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-1 font-medium">{t("gl.account")}</th>
              <th className="w-32 pb-1 text-right font-medium">{t("gl.debit")}</th>
              <th className="w-32 pb-1 text-right font-medium">{t("gl.credit")}</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} data-testid="jv-line">
                <td className="py-1 pr-2">
                  <select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} className={selectClass}>
                    {usable.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} {bi(a.name)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input type="number" step="0.01" min={0} value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} className={`${inputClass} text-right`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="number" step="0.01" min={0} value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} className={`${inputClass} text-right`} />
                </td>
                <td className="py-1">
                  {lines.length > 2 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={t("common.remove")} className="rounded p-1 text-gray-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 text-sm font-semibold">
              <td className="py-2">
                {lines.length < 20 && (
                  <button type="button" onClick={() => setLines((ls) => [...ls, { account: "6900", debit: "", credit: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                    <Plus size={13} />
                    {t("fin.addLine")}
                  </button>
                )}
              </td>
              <td className="py-2 text-right tabular-nums">฿{formatCurrency(debit, lang)}</td>
              <td className="py-2 text-right tabular-nums">฿{formatCurrency(credit, lang)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p className={`text-xs ${debit === credit && debit > 0 ? "text-emerald-700" : "text-amber-700"}`}>
          {debit === credit && debit > 0 ? t("gl.inBalance") : t("fin.mustBalance").replace("{d}", formatCurrency(r2(debit - credit), lang))}
        </p>
        <p className="text-xs text-gray-500">{t("fin.systemAccountsNote")}</p>
        <DialogActions onCancel={onClose} submitLabel={t("fin.post")} disabled={!ok} testid="jv-save" />
      </form>
    </Dialog>
  );
}

// ───────────────────────────── month-end closing ─────────────────────────────

export function PeriodClosing() {
  const { t, lang } = useLanguage();
  const { can } = useRole();
  const runAction = useRunAction();
  const { company, expenses, manualJournals, bankLines, importOrders, apDocuments, closePeriod, reopenPeriod } = useData();
  const entries = useLedger();
  const baht = useBaht();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const today = todayIso();
  const lastEnded = lastOfMonth(addDays(firstOfMonth(today), -1));

  // Every month from the start of the books to the last one that has ended, newest first.
  const months = useMemo(() => {
    const out: string[] = [];
    for (let m = company.openingDate.slice(0, 7); `${m}-01` <= lastEnded; m = addDays(lastOfMonth(`${m}-01`), 1).slice(0, 7)) out.push(m);
    return out.reverse();
  }, [company.openingDate, lastEnded]);
  const wht = withholdingByMonth(expenses, manualJournals);
  const awaitingBills = importOrders.filter((o) => o.status === "receivedWarehouse" && !apDocuments.some((d) => d.type === "invoice" && d.importOrderNo === o.orderNo));

  const checksFor = (m: string) => {
    const from = `${m}-01`;
    const to = lastOfMonth(from);
    const unmatched = bankLines.filter((l) => l.date >= from && l.date <= to && !l.matchedEntryId).length;
    const whtDue = wht.find((w) => w.month === m)?.outstanding ?? 0;
    const bills = awaitingBills.filter((o) => (o.receiving?.receivedDate ?? "") <= to).length;
    return [
      { key: "bank", ok: unmatched === 0, text: unmatched ? t("fin.chkBankOpen").replace("{n}", String(unmatched)) : t("fin.chkBankOk") },
      { key: "wht", ok: whtDue <= 0, text: whtDue > 0 ? t("fin.chkWhtOpen").replace("{amt}", baht(whtDue)) : t("fin.chkWhtOk") },
      { key: "bills", ok: bills === 0, text: bills ? t("fin.chkBillsOpen").replace("{n}", String(bills)) : t("fin.chkBillsOk") },
    ];
  };

  return (
    <Guard eyebrow={t("nav.group.accounting")} title={t("fin.closeTitle")} subtitle={t("fin.closeSubtitle")}>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label={t("fin.booksStart")} value={formatDate(company.openingDate, lang)} hint={`${t("fin.openingBank")}: ${baht(company.openingBank)}`} to="/company" />
        <KpiTile label={t("fin.closedThrough")} value={company.closedThrough ? formatDate(company.closedThrough, lang) : t("fin.nothingClosed")} tone={company.closedThrough ? "good" : "default"} />
        <KpiTile label={t("fin.openMonths")} value={String(months.filter((m) => !company.closedThrough || `${m}-01` > company.closedThrough).length)} hint={t("fin.openMonthsHint")} />
      </div>
      <ul className="space-y-3">
        {months.map((m) => {
          const closed = Boolean(company.closedThrough && lastOfMonth(`${m}-01`) <= company.closedThrough);
          const latestClosed = company.closedThrough?.slice(0, 7) === m;
          const p = profitAndLoss(entries, `${m}-01`, lastOfMonth(`${m}-01`));
          const checks = closed ? [] : checksFor(m);
          return (
            <li key={m} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="period" data-month={m} data-closed={closed}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {closed ? <Lock size={16} className="text-emerald-600" /> : <span className="h-4 w-4 rounded-full border-2 border-gray-300" />}
                  <span className="font-medium text-gray-900">{monthLabel(m, lang)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${closed ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {closed ? t("fin.closed") : t("fin.open")}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    {t("gl.netProfit")}: <span className={`font-medium tabular-nums ${p.netProfit < 0 ? "text-rose-700" : "text-gray-900"}`}>{baht(p.netProfit)}</span>
                  </span>
                  {!closed && can("closePeriods") && (
                    <button
                      onClick={() => runAction(closePeriod(lastOfMonth(`${m}-01`)), t("fin.closedToast").replace("{m}", monthLabel(m, lang)))}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                      data-testid={`close-${m}`}
                    >
                      {t("fin.closeThrough")}
                    </button>
                  )}
                  {latestClosed && can("closePeriods") && (
                    <button
                      onClick={() => {
                        setReason("");
                        setReopening(true);
                      }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      data-testid={`reopen-${m}`}
                    >
                      {t("fin.reopen")}
                    </button>
                  )}
                </div>
              </div>
              {checks.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                  {checks.map((c) => (
                    <li key={c.key} className={`flex items-center gap-1.5 ${c.ok ? "text-emerald-700" : "text-amber-700"}`}>
                      {c.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {c.text}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-gray-500">{t("fin.closeNote")}</p>

      {reopening && (
        <Dialog title={t("fin.reopen")} onClose={() => setReopening(false)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await runAction(reopenPeriod(reason), t("fin.reopenedToast"))) setReopening(false);
            }}
          >
            <p className="text-sm text-gray-600">{t("fin.reopenExplain")}</p>
            <label className="block">
              <FieldLabel>{t("fin.reason")}</FieldLabel>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} data-testid="reopen-reason" />
            </label>
            <DialogActions onCancel={() => setReopening(false)} submitLabel={t("fin.reopen")} disabled={!reason.trim()} testid="reopen-save" />
          </form>
        </Dialog>
      )}
    </Guard>
  );
}

// ───────────────────────────── bank reconciliation ─────────────────────────────

/** "2026-09-15", "15/09/2026" or "15/09/2569" (Buddhist year, as Thai banks print it) → ISO. */
function parseStatementDate(s: string): string | null {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const year = Number(m[3]) > 2400 ? Number(m[3]) - 543 : Number(m[3]);
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const parseAmount = (s: string | undefined) => (s === undefined || s.trim() === "" ? 0 : Number(s.replace(/[,\s฿]/g, "")));

/** Reads a statement CSV: date, description, amount (or withdrawal/deposit columns), reference. */
function parseStatement(text: string): { lines: BankLineInput[]; problems: string[] } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return { lines: [], problems: ["empty"] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = col("date", "วันที่");
  const iDesc = col("description", "รายการ", "details");
  const iAmt = col("amount", "จำนวนเงิน");
  const iOut = col("withdrawal", "ถอน", "debit");
  const iIn = col("deposit", "ฝาก", "credit");
  const iRef = col("reference", "ref", "อ้างอิง");
  const problems: string[] = [];
  if (iDate < 0 || (iAmt < 0 && iOut < 0 && iIn < 0)) return { lines: [], problems: ["columns"] };
  const lines: BankLineInput[] = [];
  rows.slice(1).forEach((r, i) => {
    const date = parseStatementDate(r[iDate] ?? "");
    const amount = iAmt >= 0 ? parseAmount(r[iAmt]) : r2(parseAmount(r[iIn]) - parseAmount(r[iOut]));
    if (!date || !Number.isFinite(amount) || amount === 0) {
      problems.push(String(i + 2));
      return;
    }
    lines.push({ date, amount: r2(amount), description: iDesc >= 0 ? (r[iDesc] ?? "").trim() : "", reference: iRef >= 0 ? (r[iRef] ?? "").trim() : "" });
  });
  return { lines, problems };
}

export function BankReconciliation() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const runAction = useRunAction();
  const { bankLines, importBankLines, autoMatchBank, matchBankLine, unmatchBankLine, deleteBankLine } = useData();
  const entries = useLedger();
  const baht = useBaht();
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ lines: BankLineInput[]; problems: string[] } | null>(null);
  const [explaining, setExplaining] = useState<BankLine | null>(null);
  const [showMatched, setShowMatched] = useState(false);
  const manage = can("reconcileBank");
  const rec = reconcile(bankLines, entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const matchedIds = new Set(bankLines.map((l) => l.matchedEntryId).filter(Boolean));
  const candidatesFor = (l: BankLine) =>
    entries.filter((e) => !matchedIds.has(e.id) && Math.abs(bankAmount(e) - l.amount) < 0.005).sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(l.date)) - Math.abs(Date.parse(b.date) - Date.parse(l.date)));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setPreview(parseStatement(await readCsvText(f)));
    if (file.current) file.current.value = "";
  };
  const template = () => {
    const csv = "date,description,amount,reference\n2026-09-15,TRANSFER IN CUSTOMER,10700.00,INV-12345\n15/09/2569,BANK CHARGE,-350.00,FEE-0915\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "bank-statement-template.csv";
    a.click();
  };
  const entryLabel = (e: JournalEntry) => `${formatDate(e.date, lang)} · ${e.ref} · ${bi(e.memo)}`;

  return (
    <Guard
      eyebrow={t("nav.group.accounting")}
      title={t("fin.bankTitle")}
      subtitle={t("fin.bankSubtitle")}
      action={
        manage && (
          <div className="flex flex-wrap gap-2">
            <button onClick={template} className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {t("csv.template")}
            </button>
            <button
              onClick={async () => {
                const res = await autoMatchBank();
                await runAction(res, t("fin.autoMatched").replace("{n}", String(res.matched ?? 0)));
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="bank-automatch"
            >
              <Wand2 size={15} />
              {t("fin.autoMatch")}
            </button>
            <button onClick={() => file.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              <Upload size={15} />
              {t("fin.importStatement")}
            </button>
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="bank-file" />
          </div>
        )
      }
    >
      {!rec ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">{t("fin.noStatement")}</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile label={t("fin.statementPeriod")} value={`${formatDate(rec.from, lang)}`} hint={`→ ${formatDate(rec.to, lang)}`} />
            <KpiTile label={t("fin.matched")} value={`${rec.matched} / ${bankLines.length}`} tone={rec.unmatchedLines.length ? "warning" : "good"} />
            <KpiTile label={t("fin.statementMovement")} value={baht(rec.statementMovement)} sensitive hint={`${t("fin.bookMovement")}: ${baht(rec.bookMovement)}`} />
            <KpiTile label={t("fin.bookBalance")} value={baht(rec.bookBalance)} sensitive hint={t("fin.asAtEnd").replace("{d}", formatDate(rec.to, lang))} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("fin.unmatchedLines").replace("{n}", String(rec.unmatchedLines.length))}</h3>
              <p className="mb-2 text-xs text-gray-500">{t("fin.unmatchedLinesHint")}</p>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
                {rec.unmatchedLines.length === 0 && <li className="py-6 text-center text-sm text-emerald-700">{t("fin.allMatched")}</li>}
                {rec.unmatchedLines.map((l) => {
                  const options = candidatesFor(l);
                  return (
                    <li key={l.id} className="px-4 py-3 text-sm" data-testid="bank-unmatched" data-line={l.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="text-gray-500">{formatDate(l.date, lang)}</span> · {l.description || "—"}
                          {l.reference && <span className="ml-1 text-xs text-gray-400">{l.reference}</span>}
                        </span>
                        <span className={`font-medium tabular-nums ${l.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{baht(l.amount)}</span>
                      </div>
                      {manage && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {options.length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => e.target.value && runAction(matchBankLine(l.id, e.target.value), t("fin.matchedToast"))}
                              className={`${selectClass} w-auto! max-w-full py-1 text-xs`}
                              aria-label={t("fin.matchTo")}
                              data-testid={`match-${l.id}`}
                            >
                              <option value="">{t("fin.matchTo")}</option>
                              {options.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {entryLabel(e)}
                                </option>
                              ))}
                            </select>
                          )}
                          {can("postJournals") && (
                            <button className={iconBtn} onClick={() => setExplaining(l)} data-testid={`explain-${l.id}`}>
                              <Receipt size={13} />
                              {t("fin.recordEntry")}
                            </button>
                          )}
                          <button className={`${iconBtn} text-gray-500`} onClick={() => runAction(deleteBankLine(l.id), t("fin.lineRemoved"))}>
                            <Trash2 size={13} />
                            {t("common.remove")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
            <section>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("fin.unmatchedEntries").replace("{n}", String(rec.unmatchedEntries.length))}</h3>
              <p className="mb-2 text-xs text-gray-500">{t("fin.unmatchedEntriesHint")}</p>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
                {rec.unmatchedEntries.length === 0 && <li className="py-6 text-center text-sm text-emerald-700">{t("fin.allMatched")}</li>}
                {rec.unmatchedEntries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" data-testid="book-unmatched">
                    <span>
                      <span className="text-gray-500">{formatDate(e.date, lang)}</span> ·{" "}
                      {e.href ? (
                        <RecordLink to={e.href}>
                          {e.ref}
                        </RecordLink>
                      ) : (
                        e.ref
                      )}{" "}
                      <span className="text-gray-500">{bi(e.memo)}</span>
                    </span>
                    <span className={`font-medium tabular-nums ${bankAmount(e) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{baht(bankAmount(e))}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-6">
            <button onClick={() => setShowMatched((v) => !v)} className="mb-2 text-sm font-semibold text-gray-900 hover:text-indigo-700">
              {showMatched ? "▾" : "▸"} {t("fin.matchedLines").replace("{n}", String(rec.matched))}
            </button>
            {showMatched && (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
                {bankLines
                  .filter((l) => l.matchedEntryId)
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((l) => {
                    const e = byId.get(l.matchedEntryId!);
                    return (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm" data-testid="bank-matched">
                        <span>
                          <span className="text-gray-500">{formatDate(l.date, lang)}</span> · {l.description}{" "}
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Link2 size={12} />
                            {e ? entryLabel(e) : l.matchedEntryId}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{baht(l.amount)}</span>
                          {manage && (
                            <button className={`${iconBtn} text-gray-500`} onClick={() => runAction(unmatchBankLine(l.id), t("fin.unmatchedToast"))}>
                              <Unlink size={13} />
                              {t("fin.unmatch")}
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
          <p className="mt-3 text-xs text-gray-500">{t("fin.matchRule").replace("{n}", String(MATCH_WINDOW_DAYS))}</p>
        </>
      )}

      {preview && (
        <Dialog title={t("fin.importStatement")} onClose={() => setPreview(null)} wide>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await importBankLines(preview.lines);
              const msg = t("fin.importedToast")
                .replace("{added}", String(res.added ?? 0))
                .replace("{skipped}", String(res.skipped ?? 0))
                .replace("{matched}", String(res.matched ?? 0));
              if (await runAction(res, msg)) setPreview(null);
            }}
          >
            {preview.problems.includes("columns") ? (
              <p className="text-sm text-rose-700">{t("fin.statementColumns")}</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">{t("fin.previewCount").replace("{n}", String(preview.lines.length))}</p>
                {preview.problems.length > 0 && <p className="text-sm text-amber-700">{t("fin.skippedRows").replace("{rows}", preview.problems.join(", "))}</p>}
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {preview.lines.map((l, i) => (
                        <tr key={i} data-testid="bank-preview-row">
                          <td className="px-3 py-1.5 text-gray-500">{formatDate(l.date, lang)}</td>
                          <td className="px-3 py-1.5">{l.description}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-400">{l.reference}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${l.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{baht(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <DialogActions onCancel={() => setPreview(null)} submitLabel={t("fin.importLines")} disabled={!preview.lines.length} testid="bank-import" />
          </form>
        </Dialog>
      )}
      {explaining && <JournalDialog bankLine={explaining} onClose={() => setExplaining(null)} />}
    </Guard>
  );
}
