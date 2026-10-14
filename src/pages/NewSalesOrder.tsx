import { useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency, formatDate } from "../lib/format";
import {
  computeLicenseStatus,
  computeChannelPrice,
  computeSalesNetValue,
  salesApprovalReasons,
  oldestOverdueDays,
  OVERDUE_HOLD_DAYS,
  joinReasons,
  quantityByLot,
  sumLines,
  splitVat,
  addDays,
  todayIso,
  heldByLot,
} from "../lib/business";
import { useRunAction } from "../lib/useRunAction";
import { CheckItem, FieldLabel, selectClass, inputClass } from "../components/FormKit";
import type { Customer } from "../data/types";

/** One line being entered. `key` keeps React rows stable while lines are added and removed. */
interface DraftLine {
  key: number;
  sku: string;
  lotBatch: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

const MAX_LINES = 50;
const cellInput = `${inputClass} px-2 py-1.5`;
const cellSelect = `${selectClass} px-2 py-1.5`;
/** Field label shown only on phones, where each line is a card instead of a table row. */
const MobileLabel = ({ children }: { children: string }) => <span className="mb-1 block text-xs text-gray-500 md:hidden">{children}</span>;

export default function NewSalesOrder() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const navigate = useNavigate();
  const { can } = useRole();
  const { products, customers, inventory, priceLists, taxSettings, salesOrders, arDocuments, createSalesOrder } = useData();
  // Units other orders awaiting approval have already claimed — not available to this order.
  const held = useMemo(() => heldByLot(salesOrders), [salesOrders]);
  const freeIn = (lot: { lotBatch: string; quantityRemaining: number }) => lot.quantityRemaining - (held.get(lot.lotBatch) ?? 0);

  const nextKey = useRef(1);
  const blankLine = (): DraftLine => ({ key: nextKey.current++, sku: "", lotBatch: "", quantity: 1, unitPrice: 0, discountPercent: 0 });

  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [plannedDelivery, setPlannedDelivery] = useState(() => addDays(todayIso(), 1));
  const plannedOk = plannedDelivery >= todayIso() && plannedDelivery <= addDays(todayIso(), 90);

  const customer = customers.find((c) => c.customerId === customerId) ?? null;

  const eligibleProducts = useMemo(
    () =>
      products.filter(
        (p) => p.status !== "outOfStock" && p.stockAvailable > 0 && inventory.some((i) => i.sku === p.sku && i.quantityRemaining > 0),
      ),
    [products, inventory],
  );

  // FIFO: oldest lot first, so aging stock moves before fresh stock.
  const lotsFor = (sku: string) =>
    inventory.filter((i) => i.sku === sku && freeIn(i) > 0).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));

  const channelPriceFor = (sku: string, c: Customer | null) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return 0;
    return c ? computeChannelPrice(p, c.channelType, priceLists) : p.suggestedPrice;
  };

  const updateLine = (key: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const selectSku = (key: number, sku: string) => {
    // Default to the oldest lot that still has units left after the order's other lines.
    const taken = quantityByLot(lines.filter((l) => l.key !== key && l.lotBatch));
    const lot = lotsFor(sku).find((i) => freeIn(i) - (taken.get(i.lotBatch) ?? 0) > 0) ?? lotsFor(sku)[0];
    updateLine(key, { sku, lotBatch: lot?.lotBatch ?? "", unitPrice: channelPriceFor(sku, customer) });
  };

  const selectCustomer = (nextId: string) => {
    setCustomerId(nextId);
    // FR-26: the price list follows the customer's channel — re-price every line already entered.
    const next = customers.find((c) => c.customerId === nextId) ?? null;
    setLines((ls) => ls.map((l) => (l.sku ? { ...l, unitPrice: channelPriceFor(l.sku, next) } : l)));
  };

  const priced = lines.map((l) => ({
    ...l,
    product: products.find((p) => p.sku === l.sku) ?? null,
    lot: inventory.find((i) => i.lotBatch === l.lotBatch) ?? null,
    netValue: computeSalesNetValue(l.quantity, l.unitPrice, l.discountPercent),
  }));
  const filled = priced.filter((l) => l.product && l.lot);
  const total = sumLines(filled);
  const vatPercent = taxSettings.vatPercent;
  const { base, vat } = splitVat(total, vatPercent);

  // Units asked of each lot across all lines (two lines may draw on the same lot).
  const asked = quantityByLot(filled);
  const lineErrors = (l: (typeof priced)[number]) => ({
    quantity: !Number.isInteger(l.quantity) || l.quantity <= 0,
    price: Boolean(l.sku) && !(l.unitPrice > 0),
    discount: !(l.discountPercent >= 0 && l.discountPercent < 100),
    stock: Boolean(l.lot) && (asked.get(l.lotBatch) ?? 0) > (l.lot ? freeIn(l.lot) : 0),
  });
  const anyLineError = priced.some((l) => Object.values(lineErrors(l)).some(Boolean));
  const incomplete = priced.some((l) => !l.product || !l.lot);

  const licenseState = customer?.licenseNo && customer.licenseExpiry ? computeLicenseStatus(customer.licenseExpiry) : null;
  const licenseOk = licenseState ? licenseState.status !== "expired" : false;

  // FR-22/28: over-standard discount, over-credit-limit, or below-cost orders don't block submission —
  // they route to the Approvals queue instead of booking immediately. Same rule the server applies.
  // Roles without price access get zeroed figures, so for them this is 0 — the server applies the real rule.
  const overdueDays = customer ? oldestOverdueDays(customer, salesOrders, arDocuments) : 0;
  const onHold = overdueDays > OVERDUE_HOLD_DAYS;
  const approvalReasons =
    customer && filled.length > 0
      ? salesApprovalReasons({ customer, lines: filled.map((l) => ({ ...l, costPrice: l.product!.costPrice })), overdueDays })
      : [];
  const needsApproval = approvalReasons.length > 0;
  const approvalReason = joinReasons(approvalReasons);
  const discountExceeds = customer ? filled.some((l) => l.discountPercent > customer.standardDiscount) : false;
  const creditExceeds = customer ? customer.outstandingBalance + total > customer.creditLimit : false;
  const belowCost = filled.some((l) => l.quantity > 0 && l.netValue / l.quantity < l.product!.costPrice);
  const stockOk = filled.length > 0 && !priced.some((l) => lineErrors(l).stock);

  const canConfirm = Boolean(customer) && licenseOk && !incomplete && !anyLineError && filled.length > 0 && plannedOk && !submitting;

  const handleConfirm = async () => {
    if (!customer || !canConfirm) return;
    setSubmitting(true);
    const result = await createSalesOrder({
      customerId: customer.customerId,
      lines: filled.map((l) => ({ sku: l.sku, lotBatch: l.lotBatch, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent })),
      plannedDeliveryDate: plannedDelivery,
    });
    setSubmitting(false);
    const order = result.ok ? result.order! : null;
    const booked = order && !order.approvalStatus;
    if (!(await runAction(result, `${t(booked ? "newSalesOrder.createdToast" : "newSalesOrder.submittedForApprovalToast")}: ${order?.orderNo ?? ""}`)))
      return;
    navigate("/sales-orders", { state: { highlightOrderNo: order!.orderNo } });
  };

  if (!can("createSalesOrder")) {
    return (
      <div>
        <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} />
          {t("newSalesOrder.backToList")}
        </Link>
        <PageHeader title={t("newSalesOrder.title")} subtitle={t("newSalesOrder.subtitle")} />
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          <ShieldAlert size={16} />
          {t("newSalesOrder.restrictedPage")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} />
        {t("newSalesOrder.backToList")}
      </Link>
      <PageHeader title={t("newSalesOrder.title")} subtitle={t("newSalesOrder.subtitle")} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="order-1 xl:col-span-2">
          {/* Customer */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newSalesOrder.sectionCustomer")}</h3>
            <FieldLabel>{t("salesOrders.col.customerName")}</FieldLabel>
            <select value={customerId} onChange={(e) => selectCustomer(e.target.value)} className={selectClass} data-testid="so-customer">
              <option value="">{t("newSalesOrder.selectCustomerPlaceholder")}</option>
              {customers.map((c) => (
                <option key={c.customerId} value={c.customerId}>
                  {c.customerId} · {bi(c.name)}
                </option>
              ))}
            </select>

            {customer && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-xs text-gray-400">{t("customers.col.channelType")}</p>
                  <p className="font-medium text-gray-800">{t(`lookup.channel.${customer.channelType}`)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("customers.col.licenseNo")}</p>
                  <p className="font-medium text-gray-800">
                    {customer.licenseNo ?? <span className="text-gray-400">{t("newSalesOrder.noLicenseOnFile")}</span>}
                  </p>
                  {licenseState && (
                    <p className="text-xs text-gray-400">
                      {formatDate(customer.licenseExpiry!, lang)} · <StatusBadge status={licenseState.status} />
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("customers.col.creditLimit")}</p>
                  <p className="font-medium text-gray-800">฿{formatCurrency(customer.creditLimit, lang)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("customers.col.outstandingBalance")}</p>
                  <p className="font-medium text-gray-800">฿{formatCurrency(customer.outstandingBalance, lang)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("ar.creditTermDays")}</p>
                  <p className="font-medium text-gray-800">{t("ar.netDays").replace("{n}", String(customer.creditTermDays))}</p>
                  <p className="text-xs text-gray-400">
                    {t("ar.dueDate")} {formatDate(addDays(todayIso(), customer.creditTermDays), lang)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lines — full width so product names and amounts never truncate. On phones they come before the summary. */}
        <div className="order-2 xl:order-3 xl:col-span-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">{t("newSalesOrder.sectionLines")}</h3>
              {customer && (
                <p className="text-xs text-gray-500">
                  {t("newSalesOrder.channelPriceNote")}: {t(`lookup.channel.${customer.channelType}`)} · {t("newSalesOrder.standardDiscountNote")}:{" "}
                  {customer.standardDiscount}%
                </p>
              )}
            </div>

            {/* A table from md up; on phones each row lays out as a two-column card. */}
            <div className="-mx-1 md:overflow-x-auto">
              <table className="w-full text-sm max-md:block md:min-w-[820px]">
                <thead className="max-md:hidden">
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="w-6 px-1 py-2 font-medium">#</th>
                    <th className="px-1 py-2 font-medium">{t("products.col.name")}</th>
                    <th className="w-56 px-1 py-2 font-medium">{t("salesOrders.col.lotBatch")}</th>
                    <th className="w-24 px-1 py-2 font-medium">{t("salesOrders.col.quantity")}</th>
                    <th className="w-32 px-1 py-2 font-medium">{t("salesOrders.col.unitPrice")}</th>
                    <th className="w-24 px-1 py-2 font-medium">{t("salesOrders.col.discountPercent")}</th>
                    <th className="w-36 px-1 py-2 text-right font-medium">{t("salesOrders.col.lineValue")}</th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 max-md:block">
                  {priced.map((l, idx) => {
                    const err = lineErrors(l);
                    const lots = l.sku ? lotsFor(l.sku) : [];
                    const fixed = customer && l.sku ? priceLists.find((p) => p.channel === customer.channelType)?.overrides[l.sku] : undefined;
                    return (
                      <tr key={l.key} className="align-top max-md:grid max-md:grid-cols-2 max-md:gap-x-2 max-md:py-2" data-testid="so-line">
                        <td className="px-1 py-2 pt-3.5 text-gray-400 max-md:col-span-2 max-md:pb-0 max-md:text-xs max-md:font-semibold">
                          <span className="md:hidden">{t("salesOrders.col.line")} </span>
                          {idx + 1}
                        </td>
                        <td className="px-1 py-2 max-md:col-span-2">
                          <MobileLabel>{t("products.col.name")}</MobileLabel>
                          <select value={l.sku} onChange={(e) => selectSku(l.key, e.target.value)} className={cellSelect} data-testid="so-line-sku">
                            <option value="">{t("newSalesOrder.selectProductPlaceholder")}</option>
                            {eligibleProducts.map((p) => (
                              <option key={p.sku} value={p.sku}>
                                {p.sku} · {p.name} ({p.stockAvailable} {t("newSalesOrder.availableStock")})
                              </option>
                            ))}
                          </select>
                          {fixed !== undefined && (
                            <p className="mt-1 text-xs text-gray-400">
                              {t("erp.fixedPrice")} ฿{formatCurrency(fixed, lang)}
                            </p>
                          )}
                          {l.product && l.quantity > 0 && l.netValue / l.quantity < l.product.costPrice && (
                            <p className="mt-1 text-xs text-amber-700">
                              {t("erp.belowCostNote")} (฿{formatCurrency(l.product.costPrice, lang)})
                            </p>
                          )}
                        </td>
                        <td className="px-1 py-2 max-md:col-span-2">
                          <MobileLabel>{t("salesOrders.col.lotBatch")}</MobileLabel>
                          <select
                            value={l.lotBatch}
                            onChange={(e) => updateLine(l.key, { lotBatch: e.target.value })}
                            disabled={!l.sku}
                            className={`${cellSelect} disabled:bg-gray-50 disabled:text-gray-400 ${err.stock ? "border-rose-400 bg-rose-50" : ""}`}
                            data-testid="so-line-lot"
                          >
                            <option value="">{t("newSalesOrder.selectLotPlaceholder")}</option>
                            {lots.map((i, li) => (
                              <option key={i.lotBatch} value={i.lotBatch}>
                                {i.lotBatch} · {freeIn(i)}
                                {held.get(i.lotBatch) ? ` (${t("newSalesOrder.heldSuffix").replace("{n}", String(held.get(i.lotBatch)))})` : ""}
                                {li === 0 && lots.length > 1 ? ` · ${t("erp.fifoSuggested")}` : ""}
                              </option>
                            ))}
                          </select>
                          {err.stock && <p className="mt-1 text-xs text-rose-500">{t("newSalesOrder.errorStockExceeded")}</p>}
                          {l.sku && lots.length === 0 && <p className="mt-1 text-xs text-rose-500">{t("newSalesOrder.noLotsAvailable")}</p>}
                        </td>
                        <td className="px-1 py-2">
                          <MobileLabel>{t("salesOrders.col.quantity")}</MobileLabel>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={l.quantity}
                            onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                            className={`${cellInput} ${err.quantity ? "border-rose-400 bg-rose-50" : ""}`}
                            data-testid="so-line-qty"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <MobileLabel>{t("salesOrders.col.unitPrice")}</MobileLabel>
                          <input
                            type="number"
                            min={0}
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.key, { unitPrice: Number(e.target.value) })}
                            className={`${cellInput} ${err.price ? "border-rose-400 bg-rose-50" : ""}`}
                            data-testid="so-line-price"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <MobileLabel>{t("salesOrders.col.discountPercent")}</MobileLabel>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={l.discountPercent}
                            onChange={(e) => updateLine(l.key, { discountPercent: Number(e.target.value) })}
                            className={`${cellInput} ${
                              err.discount
                                ? "border-rose-400 bg-rose-50"
                                : customer && l.discountPercent > customer.standardDiscount
                                  ? "border-amber-400 bg-amber-50"
                                  : ""
                            }`}
                            data-testid="so-line-discount"
                          />
                        </td>
                        <td className="px-1 py-2 pt-3.5 text-right font-medium tabular-nums text-gray-900 max-md:pt-2">
                          <MobileLabel>{t("salesOrders.col.lineValue")}</MobileLabel>
                          ฿{formatCurrency(l.netValue, lang)}
                        </td>
                        <td className="px-1 py-2 pt-2.5 max-md:col-span-2 max-md:flex max-md:justify-end max-md:pt-0">
                          <button
                            type="button"
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                            disabled={lines.length === 1}
                            title={t("newSalesOrder.removeLine")}
                            aria-label={t("newSalesOrder.removeLine")}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filled.length > 0 && (
                  <tfoot className="border-t border-gray-200 max-md:block">
                    <tr className="max-md:flex max-md:items-baseline max-md:justify-between">
                      <td colSpan={6} className="px-1 pt-3 text-right text-gray-500">
                        {t("erp.grandTotal")} <span className="text-xs text-gray-400">({t("erp.pricesIncludeVat")})</span>
                      </td>
                      <td className="px-1 pt-3 text-right font-semibold tabular-nums text-gray-900">฿{formatCurrency(total, lang)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, blankLine()])}
              disabled={lines.length >= MAX_LINES}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="so-add-line"
            >
              <Plus size={14} />
              {t("newSalesOrder.addLine")}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="order-3 xl:order-2 xl:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newSalesOrder.summaryTitle")}</h3>

            {!customer ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("newSalesOrder.emptySummary")}</p>
            ) : (
              <>
                {filled.length > 0 && (
                  <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t("salesOrders.col.items")}</span>
                      <span className="font-medium text-gray-800">
                        {filled.length} · {filled.reduce((s, l) => s + l.quantity, 0)} {t("erp.units")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t("erp.netBeforeVat")}</span>
                      <span className="tabular-nums text-gray-800">฿{formatCurrency(base, lang)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">
                        {t("erp.vat")} {vatPercent}%
                      </span>
                      <span className="tabular-nums text-gray-800">฿{formatCurrency(vat, lang)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
                      <span className="font-medium text-gray-700">{t("erp.grandTotal")}</span>
                      <span className="font-semibold tabular-nums text-gray-900" data-testid="so-total">
                        ฿{formatCurrency(total, lang)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-1">
                  <CheckItem status={licenseOk ? "ok" : "bad"} label={t("newSalesOrder.checklistLicense")} />
                  <CheckItem
                    status={creditExceeds ? "pending" : "ok"}
                    label={creditExceeds ? t("newSalesOrder.checklistCreditPending") : t("newSalesOrder.checklistCredit")}
                  />
                  <CheckItem
                    status={onHold ? "pending" : "ok"}
                    label={onHold ? t("newSalesOrder.checklistOverdueHold").replace("{n}", String(overdueDays)) : t("newSalesOrder.checklistOverdue")}
                  />
                  <CheckItem status={filled.length === 0 ? "pending" : stockOk ? "ok" : "bad"} label={t("newSalesOrder.checklistStock")} />
                  <CheckItem
                    status={discountExceeds ? "pending" : "ok"}
                    label={discountExceeds ? t("newSalesOrder.checklistDiscountPending") : t("newSalesOrder.checklistDiscount")}
                  />
                  {filled.length > 0 && <CheckItem status={belowCost ? "pending" : "ok"} label={belowCost ? t("erp.belowCostNote") : t("erp.marginOk")} />}
                </div>

                {!licenseOk && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {customer.licenseNo ? t("newSalesOrder.errorLicenseExpired") : t("newSalesOrder.errorNoLicense")}
                  </p>
                )}
                {licenseOk && needsApproval && approvalReason && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {t("erp.willRouteToApproval")}: {bi(approvalReason)}
                  </p>
                )}
                {incomplete && filled.length > 0 && <p className="mt-3 text-xs text-gray-500">{t("newSalesOrder.completeEveryLine")}</p>}
              </>
            )}

            <label className="mt-4 block">
              <FieldLabel>{t("flow.plannedDelivery")}</FieldLabel>
              <input
                type="date"
                value={plannedDelivery}
                min={todayIso()}
                max={addDays(todayIso(), 90)}
                onChange={(e) => setPlannedDelivery(e.target.value)}
                className={`${inputClass} ${plannedOk ? "" : "border-rose-400 bg-rose-50"}`}
                data-testid="so-planned-delivery"
              />
              {!plannedOk && <p className="mt-1 text-xs text-rose-500">{t("flow.plannedRange")}</p>}
            </label>

            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              data-testid="confirm-so-btn"
              className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {t(needsApproval ? "newSalesOrder.submitForApprovalButton" : "newSalesOrder.confirmButton")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
