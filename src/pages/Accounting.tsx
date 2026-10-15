import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Lock, XCircle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { ChartCard, ColumnChart, KpiTile } from "../components/charts";
import { inputClass } from "../components/FormKit";
import { formatCurrency, formatDate } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { addDays, todayIso } from "../lib/business";
import { SERIES, formatCompact, monthLabel } from "../lib/analytics";
import { useLedger } from "../lib/useLedger";
import { ACCOUNTS, balanceSheet, profitAndLoss, trialBalance, type JournalEntry } from "../domain/ledger";
import { both } from "../i18n/translations";

// ───────────────────────────── shared ─────────────────────────────

/** Accounting shows money everywhere — only roles that see prices get in (the API enforces the same). */
function Guard({ title, subtitle, eyebrow, children }: { title: string; subtitle: string; eyebrow?: string; children: ReactNode }) {
  const { t } = useLanguage();
  const { canViewSensitive } = useRole();
  return (
    <div>
      <PageHeader eyebrow={eyebrow ?? t("nav.group.accounting")} title={title} subtitle={subtitle} />
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

const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
const lastOfMonth = (d: string) => {
  const x = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

type Range = { from: string; to: string };

/** From/to dates with the usual shortcuts. */
function PeriodPicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const { t } = useLanguage();
  const today = todayIso();
  const lastMonthDay = addDays(firstOfMonth(today), -1);
  const presets: { key: string; range: Range }[] = [
    { key: "thisMonth", range: { from: firstOfMonth(today), to: today } },
    { key: "lastMonth", range: { from: firstOfMonth(lastMonthDay), to: lastOfMonth(lastMonthDay) } },
    { key: "thisYear", range: { from: `${today.slice(0, 4)}-01-01`, to: today } },
    { key: "sinceStart", range: { from: "2000-01-01", to: today } },
  ];
  return (
    <div className="mb-5 flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const on = p.range.from === value.from && p.range.to === value.to;
          return (
            <button
              key={p.key}
              onClick={() => onChange(p.range)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {t(`gl.period.${p.key}`)}
            </button>
          );
        })}
      </div>
      <label className="text-xs text-gray-500">
        {t("gl.from")}
        <input type="date" value={value.from === "2000-01-01" ? "" : value.from} onChange={(e) => onChange({ ...value, from: e.target.value || "2000-01-01" })} className={`${inputClass} mt-0.5 w-auto! py-1`} />
      </label>
      <label className="text-xs text-gray-500">
        {t("gl.to")}
        <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value || today })} className={`${inputClass} mt-0.5 w-auto! py-1`} />
      </label>
    </div>
  );
}

const useBaht = () => {
  const { lang } = useLanguage();
  return (n: number) => `${n < 0 ? "−" : ""}฿${formatCurrency(Math.abs(n), lang)}`;
};

function Statement({ rows }: { rows: { label: ReactNode; value?: number; strong?: boolean; indent?: boolean; muted?: boolean; testid?: string }[] }) {
  const baht = useBaht();
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className={r.strong ? "bg-gray-50/80" : ""} data-testid={r.testid}>
              <td className={`px-4 py-2.5 ${r.indent ? "pl-8" : ""} ${r.strong ? "font-semibold text-gray-900" : r.muted ? "text-gray-500" : "text-gray-700"}`}>{r.label}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${r.strong ? "font-semibold text-gray-900" : "text-gray-700"}`}>{r.value === undefined ? "" : baht(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── overview ─────────────────────────────

export function AccountingOverview() {
  const { t, lang } = useLanguage();
  const entries = useLedger();
  const baht = useBaht();
  const today = todayIso();
  const bs = balanceSheet(entries, today);
  const bal = (code: string) => trialBalance(entries, today).find((b) => b.account.code === code)!.balance;
  const ytd = profitAndLoss(entries, `${today.slice(0, 4)}-01-01`, today);
  const months = useMemo(() => {
    const keys = [...new Set(entries.filter((e) => e.source !== "opening").map((e) => e.date.slice(0, 7)))].sort().slice(-6);
    return keys.map((m) => ({ m, ...profitAndLoss(entries, `${m}-01`, lastOfMonth(`${m}-01`)) }));
  }, [entries]);

  return (
    <Guard title={t("gl.overviewTitle")} subtitle={t("gl.overviewSubtitle")}>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label={t("gl.netSalesYtd")} value={baht(ytd.netSales)} sensitive hint={t("gl.exVat")} />
        <KpiTile label={t("gl.grossProfitYtd")} value={baht(ytd.grossProfit)} sensitive hint={ytd.netSales ? `${((ytd.grossProfit / ytd.netSales) * 100).toFixed(1)}%` : undefined} />
        <KpiTile label={t("gl.netProfitYtd")} value={baht(ytd.netProfit)} sensitive tone={ytd.netProfit < 0 ? "critical" : "good"} />
        <KpiTile label={t("gl.cash")} value={baht(bal("1110"))} sensitive tone={bal("1110") < 0 ? "critical" : "default"} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          sensitive
          title={t("gl.monthlyTitle")}
          subtitle={t("gl.monthlySub")}
          table={{ columns: [t("gl.month"), t("gl.netSales"), t("gl.cogs"), t("gl.grossProfit")], rows: months.map((m) => [monthLabel(m.m, lang), baht(m.netSales), baht(m.cogs), baht(m.grossProfit)]) }}
        >
          {/* Side by side, not stacked: sales and cost of sales are compared, not added. */}
          <ColumnChart
            grouped
            categories={months.map((m) => ({ key: m.m, label: monthLabel(m.m, lang) }))}
            series={[
              { key: "sales", label: t("gl.netSales"), color: SERIES[0] },
              { key: "cogs", label: t("gl.cogs"), color: SERIES[2] },
            ]}
            values={Object.fromEntries(months.map((m) => [m.m, { sales: m.netSales, cogs: m.cogs }]))}
            format={baht}
            formatTick={(n) => `฿${formatCompact(n, lang)}`}
          />
        </ChartCard>
        <ChartCard sensitive title={t("gl.positionTitle")} subtitle={t("gl.positionSub").replace("{d}", formatDate(today, lang))}>
          <Statement
            rows={[
              { label: t("gl.acc.1110"), value: bal("1110") },
              { label: t("gl.acc.1200"), value: bal("1200") },
              { label: t("gl.acc.1300"), value: bal("1300") },
              { label: t("gl.totalAssets"), value: bs.totalAssets, strong: true },
              { label: t("gl.acc.2110"), value: bal("2110") },
              { label: t("gl.vatOwed"), value: bal("2210") - bal("1410") },
              { label: t("gl.equityAndEarnings"), value: bs.totalEquity, strong: true },
            ]}
          />
        </ChartCard>
      </div>

      <ChecksCard />
    </Guard>
  );
}

/** The cross-checks that tie the books to the operational records — shown, not just asserted. */
function ChecksCard() {
  const { t } = useLanguage();
  const entries = useLedger();
  const { inventory, customers, apDocuments } = useData();
  const tb = trialBalance(entries);
  const bal = (c: string) => tb.find((b) => b.account.code === c)!.balance;
  const baht = useBaht();
  const stock = inventory.reduce((s, i) => s + i.quantityRemaining * (i.unitCost ?? 0), 0);
  const ar = customers.reduce((s, c) => s + c.outstandingBalance, 0);
  const ap = apDocuments
    .filter((d) => d.type === "invoice")
    .reduce((s, d) => s + (d.amount - apDocuments.filter((p) => p.appliesTo === d.docNo).reduce((x, p) => x + p.amount, 0)) * d.rate, 0);
  const debits = tb.reduce((s, b) => s + b.debit, 0);
  const credits = tb.reduce((s, b) => s + b.credit, 0);
  const checks = [
    { label: t("gl.check.balanced"), ok: Math.abs(debits - credits) < 0.01, detail: `${baht(debits)} = ${baht(credits)}` },
    { label: t("gl.check.inventory"), ok: Math.abs(bal("1300") - stock) < 0.05, detail: `${baht(bal("1300"))} · ${baht(stock)}` },
    { label: t("gl.check.ar"), ok: Math.abs(bal("1200") - ar) < 0.05, detail: `${baht(bal("1200"))} · ${baht(ar)}` },
    { label: t("gl.check.ap"), ok: Math.abs(bal("2110") - ap) < 0.05, detail: `${baht(bal("2110"))} · ${baht(ap)}` },
  ];
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{t("gl.checksTitle")}</h3>
      <p className="mb-3 text-xs text-gray-500">{t("gl.checksSub")}</p>
      <ul className="divide-y divide-gray-100">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-3 py-2 text-sm" data-testid="gl-check" data-ok={c.ok}>
            <span className="flex items-center gap-2">
              {c.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-rose-600" />}
              {c.label}
            </span>
            <span className="text-xs tabular-nums text-gray-500">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────────── journal ─────────────────────────────

const SOURCES = ["opening", "sale", "creditNote", "debitNote", "receipt", "cogs", "stockAdjustment", "goodsReceipt", "supplierInvoice", "supplierPayment", "expense", "manual"] as const;

export function Journal() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const entries = useLedger();
  const baht = useBaht();
  const today = todayIso();
  const [range, setRange] = useState<Range>({ from: firstOfMonth(addDays(firstOfMonth(today), -1)), to: today });
  const [source, setSource] = useState("");
  const [account, setAccount] = useState("");
  const shown = entries.filter(
    (e) => e.date >= range.from && e.date <= range.to && (!source || e.source === source) && (!account || e.lines.some((l) => l.account === account)),
  );
  const name = (code: string) => bi(ACCOUNTS.find((a) => a.code === code)!.name);

  return (
    <Guard title={t("gl.journalTitle")} subtitle={t("gl.journalSubtitle")}>
      <PeriodPicker value={range} onChange={setRange} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label={t("gl.source")}>
          <option value="">{t("gl.allSources")}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`gl.src.${s}`)}
            </option>
          ))}
        </select>
        <select value={account} onChange={(e) => setAccount(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label={t("gl.account")}>
          <option value="">{t("gl.allAccounts")}</option>
          {ACCOUNTS.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} {bi(a.name)}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{t("gl.entriesCount").replace("{n}", String(shown.length))}</span>
        <button
          onClick={() =>
            exportToExcel(
              "journal",
              [both("erp.date"), both("gl.source"), both("gl.reference"), both("gl.memo"), both("gl.account"), both("gl.debit"), both("gl.credit")],
              shown.flatMap((e) => e.lines.map((l) => [e.date, t(`gl.src.${e.source}`), e.ref, bi(e.memo), `${l.account} ${name(l.account)}`, l.debit || "", l.credit || ""])),
            )
          }
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.export")}
        </button>
      </div>
      <div className="space-y-3">
        {shown.length === 0 && <p className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">{t("common.noResults")}</p>}
        {shown
          .slice()
          .reverse()
          .slice(0, 200)
          .map((e) => (
            <EntryCard key={e.id} e={e} name={name} baht={baht} date={formatDate(e.date, lang)} sourceLabel={t(`gl.src.${e.source}`)} memo={bi(e.memo)} />
          ))}
      </div>
    </Guard>
  );
}

function EntryCard({ e, name, baht, date, sourceLabel, memo }: { e: JournalEntry; name: (c: string) => string; baht: (n: number) => string; date: string; sourceLabel: string; memo: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="journal-entry">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-gray-500">{date}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{sourceLabel}</span>
          <span className="font-medium text-gray-900">{memo}</span>
        </span>
        {e.href ? (
          <Link to={e.href} className="text-xs font-medium text-indigo-600 hover:underline">
            {e.ref}
          </Link>
        ) : (
          <span className="text-xs text-gray-500">{e.ref}</span>
        )}
      </header>
      <table className="w-full text-sm">
        <tbody>
          {e.lines.map((l, i) => (
            <tr key={i}>
              <td className={`px-4 py-1.5 ${l.credit ? "pl-10 text-gray-600" : "text-gray-800"}`}>
                <span className="mr-2 font-mono text-xs text-gray-400">{l.account}</span>
                {name(l.account)}
              </td>
              <td className="w-36 px-4 py-1.5 text-right tabular-nums text-gray-800">{l.debit ? baht(l.debit) : ""}</td>
              <td className="w-36 px-4 py-1.5 text-right tabular-nums text-gray-600">{l.credit ? baht(l.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

// ───────────────────────────── trial balance ─────────────────────────────

export function TrialBalance() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const entries = useLedger();
  const baht = useBaht();
  const [asOf, setAsOf] = useState(todayIso());
  const tb = trialBalance(entries, asOf);
  const debit = tb.reduce((s, b) => s + b.debit, 0);
  const credit = tb.reduce((s, b) => s + b.credit, 0);
  return (
    <Guard title={t("gl.tbTitle")} subtitle={t("gl.tbSubtitle")}>
      <label className="mb-4 block text-xs text-gray-500">
        {t("gl.asOf")}
        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} className={`${inputClass} mt-0.5 w-auto! py-1`} />
        <span className="ml-2 text-sm text-gray-700">{formatDate(asOf, lang)}</span>
      </label>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("gl.account")}</th>
            <th className={`${th} text-right`}>{t("gl.debit")}</th>
            <th className={`${th} text-right`}>{t("gl.credit")}</th>
            <th className={`${th} text-right`}>{t("gl.balance")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tb.every((b) => !b.debit && !b.credit) && <EmptyRow colSpan={4} />}
          {tb.map((b) => (
            <tr key={b.account.code} data-account={b.account.code}>
              <td className={td}>
                <span className="mr-2 font-mono text-xs text-gray-400">{b.account.code}</span>
                {bi(b.account.name)}
                <span className="ml-2 text-xs text-gray-400">{t(`gl.type.${b.account.type}`)}</span>
              </td>
              <td className={`${td} text-right tabular-nums`}>{b.debit ? baht(b.debit) : "—"}</td>
              <td className={`${td} text-right tabular-nums`}>{b.credit ? baht(b.credit) : "—"}</td>
              <td className={`${td} text-right font-medium tabular-nums`}>{baht(b.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50/70">
          <tr>
            <td className={`${td} font-semibold`}>{t("ar.total")}</td>
            <td className={`${td} text-right font-semibold tabular-nums`} data-testid="tb-debit">
              {baht(debit)}
            </td>
            <td className={`${td} text-right font-semibold tabular-nums`} data-testid="tb-credit">
              {baht(credit)}
            </td>
            <td className={`${td} text-right text-xs ${Math.abs(debit - credit) < 0.01 ? "text-emerald-700" : "text-rose-700"}`}>
              {Math.abs(debit - credit) < 0.01 ? t("gl.inBalance") : t("gl.outOfBalance")}
            </td>
          </tr>
        </tfoot>
      </TableContainer>
    </Guard>
  );
}

// ───────────────────────────── profit & loss ─────────────────────────────

export function ProfitLoss() {
  const { t } = useLanguage();
  const bi = useBi();
  const entries = useLedger();
  const today = todayIso();
  const [range, setRange] = useState<Range>({ from: `${today.slice(0, 4)}-01-01`, to: today });
  const p = profitAndLoss(entries, range.from, range.to);
  const pct = (n: number) => (p.netSales ? ` (${((n / p.netSales) * 100).toFixed(1)}%)` : "");
  return (
    <Guard title={t("gl.plTitle")} subtitle={t("gl.plSubtitle")}>
      <PeriodPicker value={range} onChange={setRange} />
      <Statement
        rows={[
          { label: t("gl.sales"), value: p.sales },
          { label: t("gl.returns"), value: -p.returns, indent: true, muted: true },
          { label: t("gl.netSales"), value: p.netSales, strong: true, testid: "pl-net-sales" },
          { label: t("gl.cogs"), value: -p.cogs, indent: true },
          { label: <>{t("gl.grossProfit")}{pct(p.grossProfit)}</>, value: p.grossProfit, strong: true },
          { label: t("gl.acc.5200"), value: -p.adjustments, indent: true },
          { label: t("gl.fx"), value: p.fx, indent: true },
          { label: t("gl.tradingProfit"), value: p.tradingProfit, strong: true },
          ...p.expenses.map((x) => ({ label: bi(x.account.name), value: -x.amount, indent: true })),
          { label: t("gl.operatingExpenses"), value: -p.operatingExpenses, muted: true, testid: "pl-opex" },
          { label: <>{t("gl.netProfit")}{pct(p.netProfit)}</>, value: p.netProfit, strong: true, testid: "pl-net-profit" },
        ]}
      />
      <p className="mt-3 text-xs text-gray-500">{t("gl.plNote")}</p>
    </Guard>
  );
}

// ───────────────────────────── balance sheet ─────────────────────────────

export function BalanceSheet() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const entries = useLedger();
  const [asOf, setAsOf] = useState(todayIso());
  const b = balanceSheet(entries, asOf);
  const line = (x: (typeof b.assets)[number]) => ({ label: bi(x.account.name), value: x.balance, indent: true });
  return (
    <Guard title={t("gl.bsTitle")} subtitle={t("gl.bsSubtitle")}>
      <label className="mb-4 block text-xs text-gray-500">
        {t("gl.asOf")}
        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} className={`${inputClass} mt-0.5 w-auto! py-1`} />
        <span className="ml-2 text-sm text-gray-700">{formatDate(asOf, lang)}</span>
      </label>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Statement rows={[{ label: t("gl.assets"), strong: true }, ...b.assets.map(line), { label: t("gl.totalAssets"), value: b.totalAssets, strong: true, testid: "bs-assets" }]} />
        <Statement
          rows={[
            { label: t("gl.liabilities"), strong: true },
            ...b.liabilities.map(line),
            { label: t("gl.totalLiabilities"), value: b.totalLiabilities, strong: true },
            { label: t("gl.equity"), strong: true },
            ...b.equity.map(line),
            { label: t("gl.currentEarnings"), value: b.earnings, indent: true },
            { label: t("gl.totalLiabilitiesEquity"), value: b.totalLiabilities + b.totalEquity, strong: true, testid: "bs-liab-equity" },
          ]}
        />
      </div>
      <p className={`mt-3 flex items-center gap-1.5 text-sm ${b.balanced ? "text-emerald-700" : "text-rose-700"}`} data-testid="bs-balanced">
        {b.balanced ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
        {b.balanced ? t("gl.bsBalanced") : t("gl.bsUnbalanced")}
      </p>
    </Guard>
  );
}

// ───────────────────────────── VAT return (ภ.พ.30) ─────────────────────────────

export function VatReturn() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const entries = useLedger();
  const { salesOrders, customers, arDocuments, importOrders, taxSettings, expenses } = useData();
  const baht = useBaht();
  // Opens on the latest month that has tax documents in it (once the journal has arrived from the server).
  const [picked, setMonth] = useState<string | null>(null);
  const month =
    picked ??
    entries
      .filter((e) => e.source === "sale" || e.source === "creditNote" || e.source === "debitNote" || e.source === "goodsReceipt" || e.source === "expense")
      .map((e) => e.date.slice(0, 7))
      .sort()
      .at(-1) ??
    todayIso().slice(0, 7);
  const from = `${month}-01`;
  const to = lastOfMonth(from);
  const inMonth = entries.filter((e) => e.date >= from && e.date <= to);
  const sum = (src: JournalEntry[], code: string, side: "debit" | "credit") => src.reduce((s, e) => s + e.lines.filter((l) => l.account === code).reduce((x, l) => x + l[side], 0), 0);
  const outputVat = sum(inMonth, "2210", "credit") - sum(inMonth, "2210", "debit");
  const salesBase = sum(inMonth, "4100", "credit") - sum(inMonth, "4110", "debit");
  const inputVat = sum(inMonth, "1410", "debit");
  // Expenses carry their own base; import VAT is on the customs value, so its base is derived from the tax.
  const purchaseBase = expenses.filter((x) => x.vat > 0 && x.date >= from && x.date <= to).reduce((s, x) => s + x.amount, 0) +
    (taxSettings.vatPercent ? (inputVat - expenses.filter((x) => x.date >= from && x.date <= to).reduce((s, x) => s + x.vat, 0)) / (taxSettings.vatPercent / 100) : 0);
  const net = outputVat - inputVat;
  const customer = (id: string) => customers.find((c) => c.customerId === id);

  // Output tax report (รายงานภาษีขาย): every tax document issued in the month.
  const outputRows = inMonth
    .filter((e) => e.source === "sale" || e.source === "creditNote" || e.source === "debitNote")
    .map((e) => {
      const vat = e.lines.filter((l) => l.account === "2210").reduce((s, l) => s + l.credit - l.debit, 0);
      const base = e.lines.filter((l) => l.account === "4100" || l.account === "4110").reduce((s, l) => s + l.credit - l.debit, 0);
      const orderNo = e.source === "sale" ? e.id.replace(/^inv-/, "") : arDocuments.find((d) => d.docNo === e.ref)?.reference;
      const c = customer(salesOrders.find((o) => o.orderNo === orderNo)?.customerId ?? "");
      return { e, vat, base, c };
    });
  // Input tax report (รายงานภาษีซื้อ): import VAT paid at customs, and VAT on expense tax invoices.
  const inputRows = inMonth
    .filter((e) => (e.source === "goodsReceipt" || e.source === "expense") && e.lines.some((l) => l.account === "1410" && l.debit > 0))
    .map((e) => {
      const vat = e.lines.filter((l) => l.account === "1410").reduce((s, l) => s + l.debit, 0);
      const o = importOrders.find((x) => x.orderNo === e.ref);
      const x = expenses.find((y) => y.docNo === e.ref);
      return { e, vat, o, x };
    });

  const months = [...new Set(entries.filter((e) => e.source !== "opening").map((e) => e.date.slice(0, 7)))].sort().reverse();
  if (!months.includes(month)) months.unshift(month);

  return (
    <Guard title={t("vat.title")} subtitle={t("vat.subtitle")} eyebrow={t("nav.group.tax")}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label={t("gl.month")} data-testid="vat-month">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, lang)}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            exportToExcel(
              `vat-${month}`,
              [both("vat.report"), both("erp.date"), both("gl.reference"), both("vat.party"), both("tax.taxId"), both("tax.branch"), both("vat.base"), both("vat.vat")],
              [
                ...outputRows.map((r) => [t("vat.outputReport"), r.e.date, r.e.ref, r.c ? bi(r.c.name) : "", r.c?.taxId ?? "", r.c?.branch ?? "", Math.round(r.base * 100) / 100, Math.round(r.vat * 100) / 100]),
                ...inputRows.map((r) => [
                  t("vat.inputReport"),
                  r.e.date,
                  r.o?.customsDeclarationNo ?? r.e.ref,
                  r.o?.supplier ?? r.x?.payee ?? "",
                  r.x?.payeeTaxId ?? "",
                  "",
                  r.x ? r.x.amount : Math.round((r.vat / (taxSettings.vatPercent / 100)) * 100) / 100,
                  Math.round(r.vat * 100) / 100,
                ]),
              ],
            )
          }
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.export")}
        </button>
      </div>

      {/* The figures a ภ.พ.30 return asks for. */}
      <Statement
        rows={[
          { label: t("vat.salesBase"), value: salesBase },
          { label: t("vat.outputVat"), value: outputVat, strong: true, testid: "vat-output" },
          { label: t("vat.purchaseBase"), value: purchaseBase },
          { label: t("vat.inputVat"), value: inputVat, strong: true, testid: "vat-input" },
          { label: net >= 0 ? t("vat.payable") : t("vat.credit"), value: Math.abs(net), strong: true, testid: "vat-net" },
        ]}
      />
      <p className="mt-2 text-xs text-gray-500">{t("vat.note")}</p>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-900">{t("vat.outputReport")}</h3>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("erp.date")}</th>
            <th className={th}>{t("gl.reference")}</th>
            <th className={th}>{t("vat.party")}</th>
            <th className={th}>{t("tax.taxId")}</th>
            <th className={`${th} text-right`}>{t("vat.base")}</th>
            <th className={`${th} text-right`}>{t("vat.vat")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {outputRows.length === 0 && <EmptyRow colSpan={6} />}
          {outputRows.map((r) => (
            <tr key={r.e.id}>
              <td className={td}>{formatDate(r.e.date, lang)}</td>
              <td className={td}>
                {r.e.ref}
                <span className="ml-1.5 text-xs text-gray-400">{t(`gl.src.${r.e.source}`)}</span>
              </td>
              <td className={td}>{r.c ? bi(r.c.name) : "—"}</td>
              <td className={`${td} tabular-nums`}>
                {r.c?.taxId ?? "—"}
                {r.c && <span className="block text-xs text-gray-400">{r.c.branch === "00000" ? t("tax.headOffice") : `${t("tax.branch")} ${r.c.branch}`}</span>}
              </td>
              <td className={`${td} text-right tabular-nums`}>{baht(r.base)}</td>
              <td className={`${td} text-right tabular-nums`}>{baht(r.vat)}</td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-900">{t("vat.inputReport")}</h3>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("erp.date")}</th>
            <th className={th}>{t("vat.customsEntry")}</th>
            <th className={th}>{t("vat.party")}</th>
            <th className={`${th} text-right`}>{t("vat.base")}</th>
            <th className={`${th} text-right`}>{t("vat.vat")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {inputRows.length === 0 && <EmptyRow colSpan={5} />}
          {inputRows.map((r) => (
            <tr key={r.e.id}>
              <td className={td}>{formatDate(r.e.date, lang)}</td>
              <td className={td}>
                {r.o?.customsDeclarationNo ?? (r.x ? t("vat.expenseInvoice") : "—")}
                <span className="block text-xs text-gray-400">{r.e.ref}</span>
              </td>
              <td className={td}>
                {r.o?.supplier ?? r.x?.payee ?? "—"}
                {r.x?.payeeTaxId && <span className="block text-xs text-gray-400">{r.x.payeeTaxId}</span>}
              </td>
              <td className={`${td} text-right tabular-nums`}>{baht(r.x ? r.x.amount : r.vat / (taxSettings.vatPercent / 100))}</td>
              <td className={`${td} text-right tabular-nums`}>{baht(r.vat)}</td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
    </Guard>
  );
}
