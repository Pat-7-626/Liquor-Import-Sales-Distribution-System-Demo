import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { Card, Field, HistoryList } from "../components/DetailKit";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency, formatDate } from "../lib/format";
import { computeCreditStatus, computeLicenseStatus, salesOrderDisplayStatus, SALES_CHANNEL_OPTIONS } from "../lib/business";
import type { Customer } from "../data/types";

export default function CustomerDetail() {
  const { customerId } = useParams<{ customerId: string }>();
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const { canViewSensitive } = useRole();
  const { customers, salesOrders, products, auditLog, updateCustomer } = useData();

  const customer = customers.find((c) => c.customerId === customerId);
  const [editing, setEditing] = useState(false);

  const computed = useMemo(
    () => (customer ? computeCreditStatus(customer.creditLimit, customer.outstandingBalance, customer.licenseNo !== null) : null),
    [customer],
  );
  const licenseState = customer?.licenseNo && customer.licenseExpiry ? computeLicenseStatus(customer.licenseExpiry) : null;

  const orders = useMemo(() => {
    if (!customer) return [];
    const name = bi(customer.name);
    return salesOrders.filter((o) => bi(o.customerName) === name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrders, customer, lang]);

  const history = useMemo(
    () => auditLog.filter((e) => e.entityId === customerId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [auditLog, customerId],
  );

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
    { key: "creditLimit", label: t("customers.col.creditLimit"), type: "number", suffix: "THB" },
    { key: "outstandingBalance", label: t("customers.col.outstandingBalance"), type: "number", suffix: "THB" },
    { key: "standardDiscount", label: t("customers.col.standardDiscount"), type: "number", suffix: "%" },
    {
      key: "channelType",
      label: t("customers.col.channelType"),
      type: "select",
      options: SALES_CHANNEL_OPTIONS.map((c) => ({ value: c, label: t(`lookup.channel.${c}`) })),
    },
  ];

  const handleSave = (values: Record<string, FieldValue>) => {
    updateCustomer(customer.customerId, {
      creditLimit: Number(values.creditLimit),
      outstandingBalance: Number(values.outstandingBalance),
      standardDiscount: Number(values.standardDiscount),
      channelType: values.channelType as Customer["channelType"],
    });
    setEditing(false);
    showToast(`${t("common.save")}: ${customer.customerId}`);
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
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{bi(customer.name)}</h1>
        <StatusBadge status={computed.creditStatus} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={t("customerDetail.sectionOverview")}
          action={
            <button
              onClick={() => setEditing(true)}
              disabled={!canViewSensitive}
              title={!canViewSensitive ? t("common.restrictedTooltip") : undefined}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
            >
              {canViewSensitive ? <Pencil size={13} /> : <Lock size={13} />}
              {t("common.edit")}
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("customers.col.customerId")} value={customer.customerId} />
            <Field label={t("customers.col.channelType")} value={t(`lookup.channel.${customer.channelType}`)} />
            <Field
              label={t("customers.col.licenseNo")}
              value={customer.licenseNo ?? <span className="text-gray-300">{t("customers.noLicenseValue")}</span>}
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
                  <span className="text-gray-300">{t("common.notRecorded")}</span>
                )
              }
            />
            <Field label={t("customers.col.creditLimit")} value={<Masked>฿{formatCurrency(customer.creditLimit, lang)}</Masked>} />
            <Field label={t("customers.col.outstandingBalance")} value={<Masked>฿{formatCurrency(customer.outstandingBalance, lang)}</Masked>} />
            <Field label={t("customers.col.creditRemaining")} value={<Masked>฿{formatCurrency(computed.creditRemaining, lang)}</Masked>} />
            <Field label={t("customers.col.standardDiscount")} value={<Masked>{customer.standardDiscount}%</Masked>} />
          </div>
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
        </Card>

        <Card title={t("customerDetail.sectionOrderHistory")}>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400">{t("customerDetail.noOrders")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.orderNo")}</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.sku")}</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("products.col.name")}</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.quantity")}</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500">{t("salesOrders.col.netValue")}</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.deliveryStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o.orderNo} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-medium text-indigo-600">
                        <Link to={`/sales-orders/${o.orderNo}`}>{o.orderNo}</Link>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{o.sku}</td>
                      <td className="px-3 py-2 text-gray-700">{products.find((p) => p.sku === o.sku)?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{o.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
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

        <Card title={t("customerDetail.sectionHistory")}>
          <HistoryList entries={history} emptyLabel={t("customerDetail.noHistory")} />
        </Card>
      </div>

      <EditDrawer
        open={editing}
        title={t("customers.editTitle")}
        subtitle={`${customer.customerId} · ${bi(customer.name)}`}
        fields={fields}
        values={{
          creditLimit: customer.creditLimit,
          outstandingBalance: customer.outstandingBalance,
          standardDiscount: customer.standardDiscount,
          channelType: customer.channelType,
        }}
        onClose={() => setEditing(false)}
        onSave={handleSave}
      />
    </div>
  );
}
