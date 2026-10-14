import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Banknote, FileInput, Lock, Printer, X } from "lucide-react";
import { SupplierPaymentVoucher } from "../components/FinanceDocuments";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Masked } from "../components/Masked";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { FieldLabel, inputClass, selectClass } from "../components/FormKit";
import { ChartCard, KpiTile, StackedBar } from "../components/charts";
import { useRunAction } from "../lib/useRunAction";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { AGING_BUCKETS, agingBucket, daysOverdue, rateOn, todayIso, type AgingBucket } from "../lib/business";
import { apOpenAmount } from "../domain/actions";
import type { ApDocument, PaymentMethod } from "../data/types";

const BUCKET_COLORS: Record<AgingBucket, string> = { current: "#2e9a6c", "1-30": "#c48a1c", "31-60": "#c9692f", "61-90": "#b4483b", "90+": "#9b3346" };
const METHODS: PaymentMethod[] = ["transfer", "cheque", "cash"];

/** What the business owes its suppliers: invoices by age, payments made, shipments still waiting for a bill. */
export default function Payables() {
  const { t, lang } = useLanguage();
  const { can, canViewSensitive } = useRole();
  const { apDocuments, suppliers, importOrders } = useData();
  const [paying, setPaying] = useState<(ApDocument & { open: number }) | null>(null);
  const [invoicing, setInvoicing] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<ApDocument | null>(null);
  const today = todayIso();
  const manage = can("managePayables");
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;
  const supplierName = (id: string) => suppliers.find((s) => s.supplierId === id)?.name ?? id;

  const invoices = useMemo(
    () =>
      apDocuments
        .filter((d) => d.type === "invoice")
        .map((d) => {
          const open = apOpenAmount(apDocuments, d.docNo);
          return { ...d, open, openThb: Math.round(open * d.rate * 100) / 100 };
        })
        .sort((a, b) => (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [apDocuments],
  );
  const payments = apDocuments.filter((d) => d.type === "payment").sort((a, b) => b.date.localeCompare(a.date));
  const openInvoices = invoices.filter((i) => i.open > 0.005);
  const totals = AGING_BUCKETS.reduce(
    (acc, b) => ({ ...acc, [b]: openInvoices.filter((i) => agingBucket(i.dueDate ?? i.date, today) === b).reduce((s, i) => s + i.openThb, 0) }),
    {} as Record<AgingBucket, number>,
  );
  const totalOpen = openInvoices.reduce((s, i) => s + i.openThb, 0);
  const overdue = totalOpen - totals.current;
  const dueSoon = openInvoices.filter((i) => (i.dueDate ?? "") >= today && daysOverdue(i.dueDate ?? today, today) >= -30).reduce((s, i) => s + i.openThb, 0);
  const awaitingInvoice = importOrders.filter((o) => o.status === "receivedWarehouse" && !apDocuments.some((d) => d.type === "invoice" && d.importOrderNo === o.orderNo));

  if (!canViewSensitive)
    return (
      <div>
        <PageHeader eyebrow={t("nav.group.purchasing")} title={t("ap.title")} subtitle={t("ap.subtitle")} />
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          <Lock size={15} />
          {t("ap.restricted")}
        </p>
      </div>
    );

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.purchasing")} title={t("ap.title")} subtitle={t("ap.subtitle")} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label={t("ap.totalOwed")} value={baht(totalOpen)} sensitive hint={t("ap.openInvoices").replace("{n}", String(openInvoices.length))} />
        <KpiTile label={t("ap.overdue")} value={baht(overdue)} sensitive tone={overdue > 0 ? "critical" : "good"} />
        <KpiTile label={t("ap.dueIn30")} value={baht(dueSoon)} sensitive tone={dueSoon > 0 ? "warning" : "default"} />
        <KpiTile label={t("ap.awaitingInvoice")} value={String(awaitingInvoice.length)} hint={t("ap.awaitingInvoiceHint")} tone={awaitingInvoice.length ? "warning" : "good"} />
      </div>

      <div className="mb-6">
        <ChartCard
          wide
          sensitive
          title={t("ap.byAge")}
          subtitle={t("ar.byBucketSub")}
          table={{ columns: [t("ar.bucketCol"), t("ar.amount")], rows: AGING_BUCKETS.map((b) => [t(`ar.bucket.${b}`), baht(totals[b])]) }}
        >
          <StackedBar segments={AGING_BUCKETS.map((b) => ({ key: b, label: t(`ar.bucket.${b}`), value: totals[b], color: BUCKET_COLORS[b] }))} format={baht} />
        </ChartCard>
      </div>

      {awaitingInvoice.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">{t("ap.awaitingTitle")}</h3>
          <ul className="divide-y divide-amber-100">
            {awaitingInvoice.map((o) => (
              <li key={o.orderNo} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link to={`/import-orders/${o.orderNo}`} className="font-medium text-indigo-600 hover:underline">
                    {o.orderNo}
                  </Link>{" "}
                  · {o.supplier} · {t("ap.receivedOn").replace("{d}", o.receiving ? formatDate(o.receiving.receivedDate, lang) : "—")}
                </span>
                {manage && (
                  <button
                    onClick={() => setInvoicing(o.orderNo)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    data-testid={`invoice-${o.orderNo}`}
                  >
                    <FileInput size={13} />
                    {t("ap.recordInvoice")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3 className="mb-2 text-sm font-semibold text-gray-900">{t("ap.invoices")}</h3>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("ap.invoice")}</th>
            <th className={th}>{t("ap.supplier")}</th>
            <th className={th}>{t("ar.dueDate")}</th>
            <th className={`${th} text-right`}>{t("ap.amount")}</th>
            <th className={`${th} text-right`}>{t("ap.open")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {invoices.length === 0 && <EmptyRow colSpan={6} />}
          {invoices.map((i) => {
            const late = i.open > 0.005 ? daysOverdue(i.dueDate ?? i.date, today) : 0;
            return (
              <tr key={i.docNo} data-ap={i.docNo}>
                <td className={td}>
                  <span className="font-medium text-gray-900">{i.reference}</span>
                  <span className="block text-xs text-gray-500">
                    {i.docNo} ·{" "}
                    <Link to={`/import-orders/${i.importOrderNo}`} className="text-indigo-600 hover:underline">
                      {i.importOrderNo}
                    </Link>{" "}
                    · {formatDate(i.date, lang)}
                  </span>
                </td>
                <td className={td}>{supplierName(i.supplierId)}</td>
                <td className={td}>
                  {i.dueDate ? formatDate(i.dueDate, lang) : "—"}
                  {i.open <= 0.005 ? (
                    <span className="block text-xs font-medium text-emerald-700">{t("flow.sales.paid")}</span>
                  ) : late > 0 ? (
                    <span className="block text-xs font-medium text-rose-700">{t("flow.overdueBy").replace("{n}", String(late))}</span>
                  ) : null}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  <Masked>
                    {i.currency} {formatNumber(i.amount, lang, 2)}
                    {i.currency !== "THB" && <span className="block text-xs text-gray-500">{baht(i.amountThb)} @ {i.rate}</span>}
                  </Masked>
                </td>
                <td className={`${td} text-right font-medium tabular-nums ${i.open > 0.005 ? "text-gray-900" : "text-gray-400"}`}>
                  <Masked>
                    {i.currency} {formatNumber(i.open, lang, 2)}
                    {i.currency !== "THB" && i.open > 0.005 && <span className="block text-xs font-normal text-gray-500">{baht(i.openThb)}</span>}
                  </Masked>
                </td>
                <td className={td}>
                  {manage && i.open > 0.005 && (
                    <button
                      onClick={() => setPaying(i)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      data-testid={`pay-${i.docNo}`}
                    >
                      <Banknote size={13} />
                      {t("ap.pay")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableContainer>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-900">{t("ap.payments")}</h3>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("ap.payment")}</th>
            <th className={th}>{t("ap.supplier")}</th>
            <th className={th}>{t("erp.date")}</th>
            <th className={`${th} text-right`}>{t("ap.amount")}</th>
            <th className={`${th} text-right`}>{t("ap.fxDifference")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.length === 0 && <EmptyRow colSpan={6} />}
          {payments.map((p) => {
            const inv = apDocuments.find((d) => d.docNo === p.appliesTo);
            const fx = inv ? Math.round((p.amountThb - p.amount * inv.rate) * 100) / 100 : 0;
            return (
              <tr key={p.docNo}>
                <td className={td}>
                  <span className="font-medium text-gray-900">{p.docNo}</span>
                  <span className="block text-xs text-gray-500">
                    {t("ap.onInvoice").replace("{ref}", inv?.reference ?? "—")}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {p.method ? ` · ${t(`erp.method.${p.method}`)}` : ""}
                  </span>
                </td>
                <td className={td}>{supplierName(p.supplierId)}</td>
                <td className={td}>{formatDate(p.date, lang)}</td>
                <td className={`${td} text-right tabular-nums`}>
                  <Masked>
                    {p.currency} {formatNumber(p.amount, lang, 2)}
                    {p.currency !== "THB" && <span className="block text-xs text-gray-500">{baht(p.amountThb)} @ {p.rate}</span>}
                  </Masked>
                </td>
                <td className={`${td} text-right tabular-nums ${fx > 0 ? "text-rose-700" : fx < 0 ? "text-emerald-700" : "text-gray-400"}`}>
                  <Masked>{fx === 0 ? "—" : `${fx > 0 ? t("ap.loss") : t("ap.gain")} ${baht(Math.abs(fx))}`}</Masked>
                </td>
                <td className={td}>
                  <button
                    onClick={() => setVoucher(p)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    data-testid={`voucher-${p.docNo}`}
                  >
                    <Printer size={13} />
                    {t("fin.voucher")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableContainer>

      {paying && <PayDialog invoice={paying} onClose={() => setPaying(null)} />}
      {invoicing && <InvoiceDialog orderNo={invoicing} onClose={() => setInvoicing(null)} />}
      {voucher && <SupplierPaymentVoucher payment={voucher} onClose={() => setVoucher(null)} />}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-display text-xl font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PayDialog({ invoice, onClose }: { invoice: ApDocument & { open: number }; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { exchangeRates, recordSupplierPayment } = useData();
  const todayRate = rateOn(exchangeRates, invoice.currency, todayIso()) ?? invoice.rate;
  const [amount, setAmount] = useState(invoice.open);
  const [rate, setRate] = useState(invoice.currency === "THB" ? 1 : todayRate);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [reference, setReference] = useState("");
  const thb = Math.round(amount * rate * 100) / 100;
  const fx = Math.round((thb - amount * invoice.rate) * 100) / 100;
  const ok = amount > 0 && amount <= invoice.open + 0.005 && rate > 0;
  return (
    <Dialog title={`${t("ap.pay")} · ${invoice.reference}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ok && (await runAction(recordSupplierPayment(invoice.docNo, amount, rate, method, reference), `${t("ap.paidToast")}: ${invoice.reference}`))) onClose();
        }}
      >
        <p className="text-sm text-gray-600">{t("ap.stillOwed").replace("{amt}", `${invoice.currency} ${formatNumber(invoice.open, lang, 2)}`)}</p>
        <label className="block">
          <FieldLabel>{`${t("ap.amount")} (${invoice.currency})`}</FieldLabel>
          <input type="number" step="0.01" min={0} max={invoice.open} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputClass} data-testid="ap-amount" />
        </label>
        {invoice.currency !== "THB" && (
          <label className="block">
            <FieldLabel>{t("fx.rateLabel").replace("{c}", invoice.currency)}</FieldLabel>
            <input type="number" step="0.0001" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} className={inputClass} data-testid="ap-rate" />
            <span className="mt-1 block text-xs text-gray-500">{t("ap.bookedAt").replace("{r}", String(invoice.rate))}</span>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <FieldLabel>{t("erp.paymentMethod")}</FieldLabel>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`erp.method.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <FieldLabel>{t("erp.paymentReference")}</FieldLabel>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
          </label>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t("ap.bahtPaid")}</span>
            <span className="font-semibold tabular-nums">฿{formatCurrency(thb, lang)}</span>
          </div>
          {fx !== 0 && (
            <div className={`flex justify-between text-xs ${fx > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              <span>{fx > 0 ? t("ap.lossHint") : t("ap.gainHint")}</span>
              <span className="tabular-nums">฿{formatCurrency(Math.abs(fx), lang)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!ok}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            data-testid="ap-pay-save"
          >
            {t("ap.recordPayment")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function InvoiceDialog({ orderNo, onClose }: { orderNo: string; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { importOrders, suppliers, recordSupplierInvoice } = useData();
  const order = importOrders.find((o) => o.orderNo === orderNo)!;
  const supplier = suppliers.find((s) => s.supplierId === order.supplierId);
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(order.receiving?.receivedDate && order.receiving.receivedDate <= todayIso() ? order.receiving.receivedDate : todayIso());
  return (
    <Dialog title={`${t("ap.recordInvoice")} · ${orderNo}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await runAction(recordSupplierInvoice(orderNo, ref, date), `${t("ap.invoicedToast")}: ${ref}`)) onClose();
        }}
      >
        <p className="text-sm text-gray-600">
          {t("ap.invoiceExplain")
            .replace("{supplier}", supplier?.name ?? order.supplier)
            .replace("{days}", String(supplier?.paymentTermDays ?? 0))
            .replace("{c}", order.currency ?? "THB")}
        </p>
        <label className="block">
          <FieldLabel>{t("ap.supplierInvoiceNo")}</FieldLabel>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass} data-testid="ap-ref" />
        </label>
        <label className="block">
          <FieldLabel>{t("ap.invoiceDate")}</FieldLabel>
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          <span className="mt-1 block text-xs text-gray-500">{formatDate(date, lang)}</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!ref.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            data-testid="ap-invoice-save"
          >
            {t("ap.recordInvoice")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
