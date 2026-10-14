import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Printer, ShoppingCart, Trash2, XCircle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { NewButton } from "../components/NewButton";
import { Masked } from "../components/Masked";
import { Dialog, DialogActions } from "../components/Dialog";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { FieldLabel, inputClass, selectClass } from "../components/FormKit";
import { KpiTile } from "../components/charts";
import { Both, BuyerBlock, DocDate, DocMeta, PrintFrame, SellerBlock, Signatures } from "../components/TaxDocument";
import { useRunAction } from "../lib/useRunAction";
import { formatCurrency, formatDate } from "../lib/format";
import { addDays, computeChannelPrice, computeLicenseStatus, computeSalesNetValue, splitVat, todayIso } from "../lib/business";
import { quotationState, type QuotationState } from "../domain/finance";
import { thaiBahtText, englishBahtText } from "../lib/amountInWords";
import type { Quotation } from "../data/types";

const STATE_TONE: Record<QuotationState, string> = {
  open: "bg-blue-50 text-blue-700 ring-blue-600/20",
  expired: "bg-gray-100 text-gray-600 ring-gray-500/20",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  declined: "bg-rose-50 text-rose-700 ring-rose-600/20",
};
const STATES: QuotationState[] = ["open", "expired", "accepted", "declined"];

/** Price offers to customers; one the customer accepts becomes a sales order in a click. */
export default function Quotations() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const runAction = useRunAction();
  const navigate = useNavigate();
  const { quotations, declineQuotation, convertQuotation } = useData();
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState<Quotation | null>(null);
  const [converting, setConverting] = useState<Quotation | null>(null);
  const [declining, setDeclining] = useState<Quotation | null>(null);
  const [planned, setPlanned] = useState(addDays(todayIso(), 1));
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<QuotationState | "">("");
  const today = todayIso();
  const manage = can("createSalesOrder");
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;

  const rows = quotations.map((q) => ({ q, state: quotationState(q, today) })).sort((a, b) => b.q.date.localeCompare(a.q.date) || b.q.quoteNo.localeCompare(a.q.quoteNo));
  const shown = rows.filter((r) => !filter || r.state === filter);
  const count = (s: QuotationState) => rows.filter((r) => r.state === s).length;
  const decided = count("accepted") + count("declined") + count("expired");
  const openValue = rows.filter((r) => r.state === "open").reduce((s, r) => s + r.q.netValue, 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow={t("nav.group.sales")} title={t("qt.title")} subtitle={t("qt.subtitle")} />
        <NewButton label={t("qt.new")} allowed={manage} onClick={() => setCreating(true)} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label={t("qt.openCount")} value={String(count("open"))} hint={t("qt.openValue").replace("{v}", baht(openValue))} />
        <KpiTile label={t("qt.expiredCount")} value={String(count("expired"))} tone={count("expired") ? "warning" : "default"} />
        <KpiTile label={t("qt.acceptedCount")} value={String(count("accepted"))} tone="good" />
        <KpiTile label={t("qt.winRate")} value={decided ? `${Math.round((count("accepted") / decided) * 100)}%` : "—"} hint={t("qt.winRateHint")} />
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {(["", ...STATES] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            {s ? t(`qt.state.${s}`) : t("common.all")}
          </button>
        ))}
      </div>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("qt.number")}</th>
            <th className={th}>{t("salesOrders.col.customerName")}</th>
            <th className={th}>{t("qt.validUntil")}</th>
            <th className={`${th} text-right`}>{t("qt.value")}</th>
            <th className={th}>{t("common.status")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shown.length === 0 && <EmptyRow colSpan={6} />}
          {shown.map(({ q, state }) => (
            <tr key={q.quoteNo} data-testid="quote-row" data-quote={q.quoteNo} data-state={state}>
              <td className={td}>
                <span className="font-medium text-gray-900">{q.quoteNo}</span>
                <span className="block text-xs text-gray-500">
                  {formatDate(q.date, lang)} · {t("qt.lines").replace("{n}", String(q.lines.length))}
                </span>
              </td>
              <td className={td}>
                <Link to={`/customers/${q.customerId}`} className="text-indigo-600 hover:underline">
                  {bi(q.customerName)}
                </Link>
              </td>
              <td className={td}>{formatDate(q.validUntil, lang)}</td>
              <td className={`${td} text-right tabular-nums`}>
                <Masked>{baht(q.netValue)}</Masked>
              </td>
              <td className={td}>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATE_TONE[state]}`}>{t(`qt.state.${state}`)}</span>
                {q.salesOrderNo && (
                  <Link to={`/sales-orders/${q.salesOrderNo}`} className="ml-2 text-xs text-indigo-600 hover:underline">
                    {q.salesOrderNo}
                  </Link>
                )}
              </td>
              <td className={td}>
                <div className="flex justify-end gap-1">
                  <button onClick={() => setPrinting(q)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
                    <Printer size={13} />
                    {t("common.print")}
                  </button>
                  {manage && state === "open" && (
                    <>
                      <button
                        onClick={() => {
                          setPlanned(addDays(todayIso(), 1));
                          setConverting(q);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                        data-testid={`convert-${q.quoteNo}`}
                      >
                        <ShoppingCart size={13} />
                        {t("qt.convert")}
                      </button>
                      <button
                        onClick={() => {
                          setReason("");
                          setDeclining(q);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                        data-testid={`decline-${q.quoteNo}`}
                      >
                        <XCircle size={13} />
                        {t("qt.decline")}
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      {creating && <QuotationDialog onClose={() => setCreating(false)} />}
      {printing && <QuotationPrint quote={printing} onClose={() => setPrinting(null)} />}
      {converting && (
        <Dialog title={`${t("qt.convert")} · ${converting.quoteNo}`} onClose={() => setConverting(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await convertQuotation(converting.quoteNo, planned);
              if (await runAction(res, `${t("qt.convertedToast")}: ${res.ok ? res.order?.orderNo : ""}`)) {
                setConverting(null);
                if (res.ok && res.order) navigate(`/sales-orders/${res.order.orderNo}`);
              }
            }}
          >
            <p className="text-sm text-gray-600">{t("qt.convertExplain")}</p>
            <label className="block">
              <FieldLabel>{t("flow.plannedDelivery")}</FieldLabel>
              <input type="date" value={planned} min={todayIso()} max={addDays(todayIso(), 90)} onChange={(e) => setPlanned(e.target.value)} className={inputClass} />
              <span className="mt-1 block text-xs text-gray-500">{formatDate(planned, lang)}</span>
            </label>
            <DialogActions onCancel={() => setConverting(null)} submitLabel={t("qt.convert")} testid="convert-save" />
          </form>
        </Dialog>
      )}
      {declining && (
        <Dialog title={`${t("qt.decline")} · ${declining.quoteNo}`} onClose={() => setDeclining(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await runAction(declineQuotation(declining.quoteNo, reason), t("qt.declinedToast"))) setDeclining(null);
            }}
          >
            <label className="block">
              <FieldLabel>{t("qt.declineReason")}</FieldLabel>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </label>
            <DialogActions onCancel={() => setDeclining(null)} submitLabel={t("qt.decline")} testid="decline-save" />
          </form>
        </Dialog>
      )}
    </div>
  );
}

type Draft = { sku: string; quantity: number; unitPrice: number; discountPercent: number };

function QuotationDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { customers, products, priceLists, createQuotation } = useData();
  const active = customers;
  const [customerId, setCustomerId] = useState(active[0]?.customerId ?? "");
  const customer = customers.find((c) => c.customerId === customerId);
  const [validUntil, setValidUntil] = useState(addDays(todayIso(), 14));
  const [notes, setNotes] = useState("");
  const priceFor = (sku: string) => {
    const p = products.find((x) => x.sku === sku);
    return p && customer ? computeChannelPrice(p, customer.channelType, priceLists) : (p?.suggestedPrice ?? 0);
  };
  const blank = (): Draft => ({ sku: "", quantity: 1, unitPrice: 0, discountPercent: customer?.standardDiscount ?? 0 });
  const [lines, setLines] = useState<Draft[]>([blank()]);
  const setLine = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.sku);
  const total = useMemo(() => filled.reduce((s, l) => s + computeSalesNetValue(l.quantity, l.unitPrice, l.discountPercent), 0), [filled]);
  const ok = customer && filled.length > 0 && filled.every((l) => Number.isInteger(l.quantity) && l.quantity > 0 && l.unitPrice > 0 && l.discountPercent >= 0 && l.discountPercent < 100);

  return (
    <Dialog title={t("qt.new")} onClose={onClose} wide>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ok && (await runAction(createQuotation({ customerId, validUntil, lines: filled, notes }), t("qt.createdToast")))) onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>{t("salesOrders.col.customerName")}</FieldLabel>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const c = customers.find((x) => x.customerId === e.target.value);
                // The price list follows the customer's channel — re-price what's been entered.
                setLines((ls) => ls.map((l) => (l.sku && c ? { ...l, unitPrice: computeChannelPrice(products.find((p) => p.sku === l.sku)!, c.channelType, priceLists), discountPercent: c.standardDiscount } : l)));
              }}
              className={selectClass}
              data-testid="qt-customer"
            >
              {active.map((c) => (
                <option key={c.customerId} value={c.customerId}>
                  {c.customerId} · {bi(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <FieldLabel>{t("qt.validUntil")}</FieldLabel>
            <input type="date" value={validUntil} min={todayIso()} max={addDays(todayIso(), 90)} onChange={(e) => setValidUntil(e.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs text-gray-500">{formatDate(validUntil, lang)}</span>
          </label>
        </div>
        {/* A quotation can still go out, but it can't become an order until the customer can legally buy. */}
        {customer && (!customer.licenseExpiry || computeLicenseStatus(customer.licenseExpiry).status === "expired") && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="qt-license-warning">
            {t("qt.licenseWarning")}
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-1 font-medium">{t("products.col.name")}</th>
              <th className="w-20 pb-1 text-right font-medium">{t("erp.quantity")}</th>
              <th className="w-28 pb-1 text-right font-medium">{t("salesOrders.col.unitPrice")}</th>
              <th className="w-20 pb-1 text-right font-medium">{t("salesOrders.col.discountPercent")}</th>
              <th className="w-28 pb-1 text-right font-medium">{t("qt.value")}</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} data-testid="qt-line">
                <td className="py-1 pr-2">
                  <select value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value, unitPrice: priceFor(e.target.value) })} className={selectClass}>
                    <option value="">{t("qt.pickProduct")}</option>
                    {products.map((p) => (
                      <option key={p.sku} value={p.sku}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input type="number" min={1} step={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className={`${inputClass} text-right`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} className={`${inputClass} text-right`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="number" min={0} max={99} step="0.5" value={l.discountPercent} onChange={(e) => setLine(i, { discountPercent: Number(e.target.value) })} className={`${inputClass} text-right`} />
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{l.sku ? formatCurrency(computeSalesNetValue(l.quantity, l.unitPrice, l.discountPercent), lang) : "—"}</td>
                <td className="py-1">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={t("common.remove")} className="rounded p-1 text-gray-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="py-2" colSpan={4}>
                {lines.length < 50 && (
                  <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                    <Plus size={13} />
                    {t("fin.addLine")}
                  </button>
                )}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">฿{formatCurrency(total, lang)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <label className="block">
          <FieldLabel>{t("qt.notes")}</FieldLabel>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </label>
        <p className="text-xs text-gray-500">{t("qt.noStockHeld")}</p>
        <DialogActions onCancel={onClose} submitLabel={t("qt.create")} disabled={!ok} testid="qt-save" />
      </form>
    </Dialog>
  );
}

const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** ใบเสนอราคา as sent to the customer. Prices include VAT, as on the sales order. */
function QuotationPrint({ quote: q, onClose }: { quote: Quotation; onClose: () => void }) {
  const { customers, products, taxSettings } = useData();
  const customer = customers.find((c) => c.customerId === q.customerId);
  const { base, vat } = splitVat(q.netValue, taxSettings.vatPercent);
  return (
    <PrintFrame
      onClose={onClose}
      email={{ to: customer?.email, subject: `ใบเสนอราคา / Quotation ${q.quoteNo}`, document: `quotation ${q.quoteNo}`, filename: q.quoteNo, entityType: "quotation", entityId: q.quoteNo }}
    >
      <div className="mb-5 flex flex-col gap-4 border-b-2 border-gray-900 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 print:flex-row">
        <div className="min-w-0 flex-1">
          <SellerBlock />
        </div>
        <div className="shrink-0 sm:text-right print:text-right">
          <h2 className="font-display text-2xl font-semibold text-gray-900">ใบเสนอราคา</h2>
          <p className="text-sm uppercase tracking-wide text-gray-500">Quotation</p>
          <div className="mt-3 flex justify-end">
            <DocMeta
              rows={[
                { label: { th: "เลขที่", en: "No." }, value: q.quoteNo },
                { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={q.date} /> },
                { label: { th: "ยืนราคาถึง", en: "Valid until" }, value: <DocDate iso={q.validUntil} /> },
              ]}
            />
          </div>
        </div>
      </div>
      <div className="mb-5">
        <BuyerBlock customer={customer} fallbackName={q.customerName} />
      </div>
      <table className="mb-4 w-full text-sm">
        <thead className="border-b border-gray-900 text-xs text-gray-600">
          <tr>
            <th className="py-2 text-left">#</th>
            <th className="py-2 text-left">
              <Both th="รายการ" en="Description" />
            </th>
            <th className="py-2 text-right">
              <Both th="จำนวน" en="Qty" />
            </th>
            <th className="py-2 text-right">
              <Both th="ราคา/หน่วย" en="Unit price" />
            </th>
            <th className="py-2 text-right">
              <Both th="ส่วนลด" en="Disc." />
            </th>
            <th className="py-2 text-right">
              <Both th="จำนวนเงิน" en="Amount" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {q.lines.map((l, i) => (
            <tr key={i}>
              <td className="py-2 text-gray-500">{i + 1}</td>
              <td className="py-2">
                {products.find((p) => p.sku === l.sku)?.name ?? l.sku}
                <span className="block text-xs text-gray-400">{l.sku}</span>
              </td>
              <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2 text-right tabular-nums">
                <Masked>{money(l.unitPrice)}</Masked>
              </td>
              <td className="py-2 text-right tabular-nums">{l.discountPercent ? `${l.discountPercent}%` : "—"}</td>
              <td className="py-2 text-right tabular-nums">
                <Masked>{money(l.netValue)}</Masked>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto max-w-xs text-sm">
        {[
          [<Both key="b" th="มูลค่าก่อนภาษี" en="Before VAT" />, base],
          [<Both key="v" th={`ภาษีมูลค่าเพิ่ม ${taxSettings.vatPercent}%`} en={`VAT ${taxSettings.vatPercent}%`} />, vat],
        ].map(([l, v], i) => (
          <div key={i} className="flex justify-between py-1 text-gray-700">
            <span>{l}</span>
            <span className="tabular-nums">
              <Masked>{money(Number(v))}</Masked>
            </span>
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-gray-900 py-1.5 font-semibold">
          <Both th="รวมทั้งสิ้น" en="Total" />
          <span className="tabular-nums">
            <Masked>{money(q.netValue)}</Masked>
          </span>
        </div>
      </div>
      <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <Masked>
          ({thaiBahtText(q.netValue)})<span className="block text-xs text-gray-500">({englishBahtText(q.netValue)})</span>
        </Masked>
      </p>
      {q.notes && <p className="mt-3 text-sm text-gray-700">{q.notes}</p>}
      <p className="mt-2 text-xs text-gray-500">
        ราคานี้ยังไม่ได้สำรองสินค้า สินค้าจะจัดสรรเมื่อยืนยันการสั่งซื้อ / Stock is allocated when the order is confirmed.
      </p>
      <Signatures left={{ th: "ผู้เสนอราคา", en: "Quoted by" }} right={{ th: "ผู้อนุมัติสั่งซื้อ (ลูกค้า)", en: "Accepted by (customer)" }} />
    </PrintFrame>
  );
}
