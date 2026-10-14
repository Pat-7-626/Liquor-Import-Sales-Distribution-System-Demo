import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Lock, Banknote, FileBadge } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useEntityHistory } from "../lib/useEntityHistory";
import { useRole } from "../state/RoleContext";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { OrderItems } from "../components/OrderItems";
import { Card, Field, HistoryList } from "../components/DetailKit";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { FieldLabel, inputClass, selectClass } from "../components/FormKit";
import { formatCurrency, formatDate } from "../lib/format";
import {
  computeLicenseStatus,
  orderQuantity,
  salesOrderDisplayStatus,
  SALES_CHANNEL_OPTIONS,
  computeArOpenItems,
  agingTotals,
  agingBucket,
  daysOverdue,
  todayIso,
  AGING_BUCKETS,
  type AgingBucket,
} from "../lib/business";
import { useRunAction } from "../lib/useRunAction";
import type { Customer, PaymentMethod } from "../data/types";

const PAYMENT_METHODS: PaymentMethod[] = ["transfer", "cheque", "cash"];

export default function CustomerDetail() {
  const { customerId } = useParams<{ customerId: string }>();
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { canViewSensitive, can } = useRole();
  const { customers, salesOrders, arDocuments, updateCustomerTerms, updateCustomerProfile, recordPayment } = useData();

  const customer = customers.find((c) => c.customerId === customerId);
  const [editing, setEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  /** Order whose invoice this payment is for; empty = settle the oldest invoices first. */
  const [appliesTo, setAppliesTo] = useState("");

  const computed = useMemo(
    // Credit status is computed by the server — figures are masked for some roles, the status is not.
    () => (customer ? { creditRemaining: customer.creditRemaining, creditStatus: customer.creditStatus } : null),
    [customer],
  );
  const licenseState = customer?.licenseNo && customer.licenseExpiry ? computeLicenseStatus(customer.licenseExpiry) : null;

  const orders = useMemo(
    () => (customer ? salesOrders.filter((o) => o.customerId === customer.customerId) : []),
    [salesOrders, customer],
  );

  // Open items only mean something with real figures — roles without price access get zeros from the server.
  const openItems = useMemo(
    () => (customer && canViewSensitive ? computeArOpenItems(customer, salesOrders, arDocuments) : []),
    [customer, canViewSensitive, salesOrders, arDocuments],
  );
  const today = todayIso();
  const aging = agingTotals(openItems, today);

  const history = useEntityHistory(customerId);

  if (!customer || !computed) {
    return (
      <div>
        <Link to="/customers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} />
          {t("customerDetail.backToList")}
        </Link>
        <p className="text-sm text-gray-500">{t("common.noResults")}</p>
      </div>
    );
  }

  const fields: FieldConfig[] = [
    { key: "creditLimit", label: t("customers.col.creditLimit"), type: "number", suffix: "THB", min: 0 },
    { key: "standardDiscount", label: t("customers.col.standardDiscount"), type: "number", suffix: "%", min: 0, max: 100 },
    { key: "creditTermDays", label: t("ar.creditTermDays"), type: "number", suffix: t("ar.days"), min: 0, max: 365 },
    {
      key: "channelType",
      label: t("customers.col.channelType"),
      type: "select",
      options: SALES_CHANNEL_OPTIONS.map((c) => ({ value: c, label: t(`lookup.channel.${c}`) })),
    },
  ];

  const handleSave = async (values: Record<string, FieldValue>) => {
    const result = await updateCustomerTerms(customer.customerId, {
      creditLimit: Number(values.creditLimit),
      standardDiscount: Number(values.standardDiscount),
      channelType: values.channelType as Customer["channelType"],
      creditTermDays: Number(values.creditTermDays),
    });
    if (await runAction(result, `${t("common.save")}: ${customer.customerId}`)) setEditing(false);
  };

  const profileFields: FieldConfig[] = [
    { key: "nameTh", label: `${t("customers.col.name")} (ไทย)`, type: "text" },
    { key: "nameEn", label: `${t("customers.col.name")} (English)`, type: "text" },
    { key: "taxId", label: t("tax.taxId"), type: "text", placeholder: "0105xxxxxxxxx" },
    { key: "branch", label: t("tax.branch"), type: "text", placeholder: "00000" },
    { key: "addressTh", label: `${t("tax.address")} (ไทย)`, type: "text" },
    { key: "addressEn", label: `${t("tax.address")} (English)`, type: "text" },
  ];

  const handleSaveProfile = async (v: Record<string, FieldValue>) => {
    const result = await updateCustomerProfile(customer.customerId, {
      name: { th: String(v.nameTh), en: String(v.nameEn) },
      taxId: String(v.taxId).replace(/[\s-]/g, ""),
      branch: String(v.branch),
      address: { th: String(v.addressTh), en: String(v.addressEn) },
    });
    if (await runAction(result, `${t("common.save")}: ${customer.customerId}`)) setEditingProfile(false);
  };

  const amount = Number(paymentAmount);
  const paymentValid = paymentAmount !== "" && amount > 0 && amount <= customer.outstandingBalance;
  const handleRecordPayment = async () => {
    if (!paymentValid) return;
    const result = await recordPayment(customer.customerId, amount, paymentMethod, paymentRef, appliesTo || null);
    if (await runAction(result, `${t("erp.paymentRecordedToast")}: ฿${formatCurrency(amount, lang)}`)) {
      setPaymentAmount("");
      setPaymentRef("");
      setAppliesTo("");
    }
  };

  const usageRatio = computed.creditRemaining < 0 ? 1 : customer.creditLimit > 0 ? Math.min(1, customer.outstandingBalance / customer.creditLimit) : 0;
  const barTone = computed.creditStatus === "overLimit" ? "bg-rose-500" : computed.creditStatus === "nearLimit" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 print:hidden">
        <ArrowLeft size={14} />
        {t("customerDetail.backToList")}
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">{bi(customer.name)}</h1>
        <StatusBadge status={computed.creditStatus} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={t("customerDetail.sectionOverview")}
          action={
            <button
              onClick={() => setEditing(true)}
              disabled={!can("editCustomerTerms")}
              title={!can("editCustomerTerms") ? t("erp.customerTermsPermission") : undefined}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
            >
              {can("editCustomerTerms") ? <Pencil size={13} /> : <Lock size={13} />}
              {t("common.edit")}
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("customers.col.customerId")} value={customer.customerId} />
            <Field label={t("customers.col.channelType")} value={t(`lookup.channel.${customer.channelType}`)} />
            <Field
              label={t("customers.col.licenseNo")}
              value={customer.licenseNo ?? <span className="text-gray-400">{t("customers.noLicenseValue")}</span>}
            />
            <Field
              label={t("customers.col.licenseExpiry")}
              value={
                customer.licenseExpiry ? (
                  <span className="flex items-center gap-1.5">
                    {formatDate(customer.licenseExpiry, lang)}
                    {licenseState && <StatusBadge status={licenseState.status} />}
                  </span>
                ) : (
                  <span className="text-gray-400">{t("common.notRecorded")}</span>
                )
              }
            />
            <Field label={t("customers.col.creditLimit")} value={<Masked>฿{formatCurrency(customer.creditLimit, lang)}</Masked>} />
            <Field label={t("customers.col.outstandingBalance")} value={<Masked>฿{formatCurrency(customer.outstandingBalance, lang)}</Masked>} />
            <Field label={t("customers.col.creditRemaining")} value={<Masked>฿{formatCurrency(computed.creditRemaining, lang)}</Masked>} />
            <Field label={t("customers.col.standardDiscount")} value={<Masked>{customer.standardDiscount}%</Masked>} />
            <Field label={t("ar.creditTermDays")} value={t("ar.netDays").replace("{n}", String(customer.creditTermDays))} />
          </div>
        </Card>

        <Card
          title={t("tax.legalDetails")}
          action={
            <button
              onClick={() => setEditingProfile(true)}
              disabled={!can("createCustomer")}
              title={!can("createCustomer") ? t("erp.noPermission") : undefined}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
            >
              {can("createCustomer") ? <Pencil size={13} /> : <Lock size={13} />}
              {t("common.edit")}
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("tax.taxId")}
              value={customer.taxId ? <span className="tabular-nums">{customer.taxId}</span> : <span className="text-rose-600">{t("tax.missingTaxId")}</span>}
            />
            <Field label={t("tax.branch")} value={customer.branch === "00000" ? `${t("tax.headOffice")} (00000)` : customer.branch} />
            <div className="col-span-2">
              <Field label={t("tax.address")} value={bi(customer.address) || <span className="text-gray-400">{t("common.notRecorded")}</span>} />
            </div>
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-gray-500">
            <FileBadge size={13} className="mt-0.5 shrink-0 text-gray-400" />
            {t("tax.legalDetailsNote")}
          </p>
        </Card>

        <Card title={t("customerDetail.sectionCredit")}>
          {canViewSensitive ? (
            <>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.round(usageRatio * 100)}%` }} />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                ฿{formatCurrency(customer.outstandingBalance, lang)} {t("customerDetail.creditUsedOf")} ฿{formatCurrency(customer.creditLimit, lang)}
              </p>
            </>
          ) : (
            <Masked>{t("common.restrictedTooltip")}</Masked>
          )}

          {can("recordPayment") && (
            <div className="mt-4 border-t border-gray-100 pt-4 print:hidden">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Banknote size={15} className="text-gray-400" />
                {t("erp.recordPayment")}
              </h4>
              <label className="mb-3 block">
                <FieldLabel>{t("ar.applyTo")}</FieldLabel>
                <select
                  value={appliesTo}
                  onChange={(e) => {
                    setAppliesTo(e.target.value);
                    const item = openItems.find((i) => i.orderNo === e.target.value);
                    if (item) setPaymentAmount(String(item.open));
                  }}
                  className={selectClass}
                  data-testid="pay-applies-to"
                >
                  <option value="">{t("ar.oldestFirst")}</option>
                  {openItems
                    .filter((i) => i.orderNo)
                    .map((i) => (
                      <option key={i.ref} value={i.orderNo}>
                        {i.ref} · {t("ar.dueDate")} {formatDate(i.dueDate, lang)} · ฿{formatCurrency(i.open, lang)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
                <label className="block">
                  <FieldLabel>{t("erp.paymentAmount")}</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    max={customer.outstandingBalance}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className={`${inputClass} ${paymentAmount !== "" && !paymentValid ? "border-rose-400 bg-rose-50" : ""}`}
                  />
                </label>
                <label className="block">
                  <FieldLabel>{t("erp.paymentMethod")}</FieldLabel>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={selectClass}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`erp.method.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>{t("erp.paymentReference")}</FieldLabel>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder={t("erp.paymentReferencePlaceholder")}
                    className={inputClass}
                  />
                </label>
                <button
                  onClick={handleRecordPayment}
                  disabled={!paymentValid}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {t("erp.recordPaymentButton")}
                </button>
              </div>
              {paymentAmount !== "" && !paymentValid && <p className="mt-1.5 text-xs text-rose-500">{t("erp.paymentInvalid")}</p>}
            </div>
          )}
        </Card>

        <Card wide title={t("ar.openItems")}>
          {!canViewSensitive ? (
            <Masked>{t("common.restrictedTooltip")}</Masked>
          ) : openItems.length === 0 ? (
            <p className="text-sm text-gray-400">{t("ar.nothingOpen")}</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {AGING_BUCKETS.map((b) => (
                  <div key={b} className={`rounded-lg border px-3 py-2 ${agingTone(b, aging[b])}`}>
                    <p className="text-xs text-gray-500">{t(`ar.bucket.${b}`)}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">฿{formatCurrency(aging[b], lang)}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("ar.document")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("ar.invoiceDate")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("ar.dueDate")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("ar.daysOverdue")}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">{t("ar.amount")}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">{t("ar.openAmount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {openItems.map((i) => {
                      const late = daysOverdue(i.dueDate, today);
                      return (
                        <tr key={i.ref}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {i.orderNo ? (
                              <Link to={`/sales-orders/${i.orderNo}`} className="font-medium text-indigo-600 hover:underline">
                                {i.ref}
                              </Link>
                            ) : (
                              <span className="font-medium text-gray-900">{i.ref}</span>
                            )}
                            <span className="ml-1.5 text-xs text-gray-400">{t(`ar.kind.${i.kind}`)}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(i.date, lang)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(i.dueDate, lang)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {late > 0 ? (
                              <span className={agingBucket(i.dueDate, today) === "1-30" ? "text-amber-700" : "font-medium text-rose-700"}>
                                {t("ar.daysLate").replace("{n}", String(late))}
                              </span>
                            ) : (
                              <span className="text-gray-500">{t("ar.bucket.current")}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-gray-700">฿{formatCurrency(i.amount, lang)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-medium tabular-nums text-gray-900">฿{formatCurrency(i.open, lang)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        <Card wide title={t("customerDetail.sectionOrderHistory")}>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400">{t("customerDetail.noOrders")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("salesOrders.col.orderNo")}</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.orderDate")}</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("products.col.name")}</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("salesOrders.col.quantity")}</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">{t("salesOrders.col.netValue")}</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("salesOrders.col.deliveryStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o.orderNo} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-medium whitespace-nowrap text-indigo-600">
                        <Link to={`/sales-orders/${o.orderNo}`}>{o.orderNo}</Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(o.orderDate, lang)}</td>
                      <td className="max-w-xs px-3 py-2 text-gray-700">
                        <OrderItems order={o} withQty={false} />
                      </td>
                      <td className="px-3 py-2 text-gray-700">{orderQuantity(o)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700">
                        <Masked>฿{formatCurrency(o.netValue, lang)}</Masked>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={salesOrderDisplayStatus(o)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("erp.page.arDocuments")}>
          {(() => {
            const docs = arDocuments.filter((d) => d.customerId === customer.customerId);
            if (docs.length === 0) return <p className="text-sm text-gray-400">{t("erp.noArDocsCustomer")}</p>;
            return (
              <ul className="divide-y divide-gray-100">
                {docs.map((d) => (
                  <li key={d.docNo} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">
                        {d.docNo} <span className="font-normal text-gray-400">· {t(`erp.arType.${d.type}`)}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(d.date, lang)}
                        {d.method ? ` · ${t(`erp.method.${d.method}`)}` : ""}
                        {d.reference ? ` · ${d.reference}` : ""}
                      </p>
                    </div>
                    <span className={`font-medium ${d.type === "debitNote" || d.type === "openingBalance" ? "text-gray-900" : "text-emerald-600"}`}>
                      <Masked>
                        {d.type === "debitNote" || d.type === "openingBalance" ? "+" : "−"}฿{formatCurrency(d.amount, lang)}
                      </Masked>
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </Card>

        <Card title={t("customerDetail.sectionHistory")}>
          <HistoryList entries={history} emptyLabel={t("customerDetail.noHistory")} />
        </Card>
      </div>

      <EditDrawer
        open={editing}
        title={t("customers.editTitle")}
        subtitle={`${customer.customerId} · ${bi(customer.name)}`}
        note={t("erp.customerTermsNote")}
        fields={fields}
        values={{
          creditLimit: customer.creditLimit,
          standardDiscount: customer.standardDiscount,
          channelType: customer.channelType,
          creditTermDays: customer.creditTermDays,
        }}
        onClose={() => setEditing(false)}
        onSave={handleSave}
      />

      <EditDrawer
        open={editingProfile}
        title={t("tax.editLegalDetails")}
        subtitle={`${customer.customerId} · ${bi(customer.name)}`}
        note={t("tax.legalDetailsNote")}
        fields={profileFields}
        values={{
          nameTh: customer.name.th,
          nameEn: customer.name.en,
          taxId: customer.taxId,
          branch: customer.branch,
          addressTh: customer.address.th,
          addressEn: customer.address.en,
        }}
        onClose={() => setEditingProfile(false)}
        onSave={handleSaveProfile}
      />
    </div>
  );
}

function agingTone(bucket: AgingBucket, amount: number): string {
  if (amount <= 0) return "border-gray-200 text-gray-400";
  if (bucket === "current") return "border-gray-200 text-gray-900";
  if (bucket === "1-30") return "border-amber-200 bg-amber-50/60 text-amber-800";
  return "border-rose-200 bg-rose-50/60 text-rose-800";
}
