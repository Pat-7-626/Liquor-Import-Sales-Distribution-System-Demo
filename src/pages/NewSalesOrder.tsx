import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency, formatDate } from "../lib/format";
import { computeLicenseStatus, computeChannelPrice, computeSalesNetValue, CHANNEL_PRICE_MODIFIER } from "../lib/business";
import { CheckItem, FieldLabel, selectClass, inputClass } from "../components/FormKit";

export default function NewSalesOrder() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const navigate = useNavigate();
  const { products, customers, inventory, createSalesOrder } = useData();

  const [customerId, setCustomerId] = useState("");
  const [sku, setSku] = useState("");
  const [lotBatch, setLotBatch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);

  const customer = customers.find((c) => c.customerId === customerId) ?? null;

  const eligibleProducts = useMemo(
    () =>
      products.filter(
        (p) => p.status !== "outOfStock" && p.stockAvailable > 0 && inventory.some((i) => i.sku === p.sku && i.quantityRemaining > 0),
      ),
    [products, inventory],
  );

  const product = products.find((p) => p.sku === sku) ?? null;
  const lots = useMemo(() => inventory.filter((i) => i.sku === sku && i.quantityRemaining > 0), [inventory, sku]);
  const lot = inventory.find((i) => i.lotBatch === lotBatch) ?? null;

  const licenseState = customer?.licenseNo && customer.licenseExpiry ? computeLicenseStatus(customer.licenseExpiry) : null;
  const licenseOk = licenseState ? licenseState.status !== "expired" : false;

  const netValue = computeSalesNetValue(quantity, unitPrice, discountPercent);
  const projectedOutstanding = customer ? customer.outstandingBalance + netValue : 0;
  const creditOk = customer ? projectedOutstanding <= customer.creditLimit : false;

  // FR-22/28: an over-standard discount or over-credit-limit order no longer blocks submission — it
  // routes to the real Approvals queue instead of booking immediately (or, for credit, being blocked outright).
  const discountExceeds = customer ? discountPercent > customer.standardDiscount : false;
  const creditExceeds = customer ? !creditOk : false;
  const needsApproval = discountExceeds || creditExceeds;

  const stockOk = lot ? quantity > 0 && quantity <= lot.quantityRemaining : false;

  const hasSelection = Boolean(customer && product && lot);
  const canConfirm = hasSelection && licenseOk && stockOk;

  const approvalReason: { th: string; en: string } | undefined = !needsApproval
    ? undefined
    : discountExceeds && creditExceeds
      ? { th: "ส่วนลดและวงเงินเครดิตเกินกำหนด", en: "Over-standard discount and over credit limit" }
      : discountExceeds
        ? { th: "ส่วนลดเกินมาตรฐาน", en: "Over-standard discount" }
        : { th: "เกินวงเงินเครดิตที่อนุมัติ", en: "Over approved credit limit" };

  const handleSelectSku = (nextSku: string) => {
    setSku(nextSku);
    setLotBatch("");
    const p = products.find((x) => x.sku === nextSku);
    const base = p?.suggestedPrice ?? 0;
    setUnitPrice(customer ? computeChannelPrice(base, customer.channelType) : base);
  };

  const handleConfirm = () => {
    if (!customer || !product || !lot || !canConfirm) return;
    const order = createSalesOrder({
      customer,
      sku: product.sku,
      lotBatch: lot.lotBatch,
      quantity,
      unitPrice,
      discountPercent,
      needsApproval,
      approvalReason,
    });
    showToast(`${t(needsApproval ? "newSalesOrder.submittedForApprovalToast" : "newSalesOrder.createdToast")}: ${order.orderNo}`);
    navigate("/sales-orders", { state: { highlightOrderNo: order.orderNo } });
  };

  return (
    <div>
      <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} />
        {t("newSalesOrder.backToList")}
      </Link>
      <PageHeader title={t("newSalesOrder.title")} subtitle={t("newSalesOrder.subtitle")} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Customer */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newSalesOrder.sectionCustomer")}</h3>
            <FieldLabel>{t("salesOrders.col.customerName")}</FieldLabel>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={selectClass}>
              <option value="">{t("newSalesOrder.selectCustomerPlaceholder")}</option>
              {customers.map((c) => (
                <option key={c.customerId} value={c.customerId}>
                  {c.customerId} · {bi(c.name)}
                </option>
              ))}
            </select>

            {customer && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-4">
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
              </div>
            )}
          </div>

          {/* Product & Lot */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newSalesOrder.sectionProduct")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>{t("salesOrders.col.sku")}</FieldLabel>
                <select value={sku} onChange={(e) => handleSelectSku(e.target.value)} className={selectClass}>
                  <option value="">{t("newSalesOrder.selectProductPlaceholder")}</option>
                  {eligibleProducts.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} · {p.name} ({p.stockAvailable} {t("newSalesOrder.availableStock")})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel>{t("salesOrders.col.lotBatch")}</FieldLabel>
                <select
                  value={lotBatch}
                  onChange={(e) => setLotBatch(e.target.value)}
                  disabled={!sku}
                  className={`${selectClass} disabled:bg-gray-50 disabled:text-gray-400`}
                >
                  <option value="">{t("newSalesOrder.selectLotPlaceholder")}</option>
                  {lots.map((i) => (
                    <option key={i.lotBatch} value={i.lotBatch}>
                      {i.lotBatch} · {i.quantityRemaining} {t("newSalesOrder.availableStock")}
                    </option>
                  ))}
                </select>
                {sku && lots.length === 0 && (
                  <p className="mt-1 text-xs text-rose-500">{t("newSalesOrder.noLotsAvailable")}</p>
                )}
              </label>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newSalesOrder.sectionPricing")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <FieldLabel>{t("salesOrders.col.quantity")}</FieldLabel>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>{t("salesOrders.col.unitPrice")}</FieldLabel>
                <input
                  type="number"
                  min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                  className={inputClass}
                />
                {customer && product && (
                  <p className="mt-1 text-xs text-gray-400">
                    {t("newSalesOrder.channelPriceNote")}: {t(`lookup.channel.${customer.channelType}`)}{" "}
                    ({CHANNEL_PRICE_MODIFIER[customer.channelType] >= 0 ? "+" : ""}
                    {Math.round(CHANNEL_PRICE_MODIFIER[customer.channelType] * 100)}%)
                  </p>
                )}
              </label>
              <label className="block">
                <FieldLabel>{t("salesOrders.col.discountPercent")}</FieldLabel>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className={inputClass}
                />
                {customer && (
                  <p className="mt-1 text-xs text-gray-400">
                    {t("newSalesOrder.standardDiscountNote")}: {customer.standardDiscount}%
                  </p>
                )}
              </label>
            </div>

            {discountExceeds && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t("newSalesOrder.checklistDiscountPending")}
              </p>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newSalesOrder.summaryTitle")}</h3>

            {!customer ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("newSalesOrder.emptySummary")}</p>
            ) : (
              <>
                {product && lot && (
                  <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t("salesOrders.col.sku")}</span>
                      <span className="font-medium text-gray-800">{product.sku}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t("salesOrders.col.quantity")}</span>
                      <span className="font-medium text-gray-800">
                        {quantity} × ฿{formatCurrency(unitPrice, lang)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t("salesOrders.col.discountPercent")}</span>
                      <span className="font-medium text-gray-800">{discountPercent}%</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
                      <span className="font-medium text-gray-700">{t("salesOrders.col.netValue")}</span>
                      <span className="font-semibold text-gray-900">฿{formatCurrency(netValue, lang)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-1">
                  <CheckItem
                    status={!customer ? "pending" : licenseOk ? "ok" : "bad"}
                    label={t("newSalesOrder.checklistLicense")}
                  />
                  <CheckItem
                    status={!customer ? "pending" : creditExceeds ? "pending" : "ok"}
                    label={creditExceeds ? t("newSalesOrder.checklistCreditPending") : t("newSalesOrder.checklistCredit")}
                  />
                  <CheckItem status={!lot ? "pending" : stockOk ? "ok" : "bad"} label={t("newSalesOrder.checklistStock")} />
                  <CheckItem
                    status={!customer ? "pending" : discountExceeds ? "pending" : "ok"}
                    label={discountExceeds ? t("newSalesOrder.checklistDiscountPending") : t("newSalesOrder.checklistDiscount")}
                  />
                </div>

                {customer && !licenseOk && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {customer.licenseNo ? t("newSalesOrder.errorLicenseExpired") : t("newSalesOrder.errorNoLicense")}
                  </p>
                )}
                {customer && licenseOk && creditExceeds && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {t("newSalesOrder.checklistCreditPending")}
                  </p>
                )}
                {lot && !stockOk && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {t("newSalesOrder.errorStockExceeded")}
                  </p>
                )}
              </>
            )}

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
