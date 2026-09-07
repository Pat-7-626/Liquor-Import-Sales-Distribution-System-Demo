import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Lock, FileText, ArrowUpRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { Card, Field, HistoryList } from "../components/DetailKit";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { SalesOrderDocumentsModal } from "../components/SalesOrderDocumentsModal";
import { formatCurrency } from "../lib/format";
import { selectClass } from "../components/FormKit";
import { salesOrderDisplayStatus } from "../lib/business";
import type { SalesOrder } from "../data/types";

const STATUS_OPTIONS = ["delivered", "inDelivery", "pendingShipment", "returned", "damaged"];

function computeNet(quantity: number, unitPrice: number, discountPercent: number) {
  return Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
}

export default function SalesOrderDetail() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const { canViewSensitive } = useRole();
  const { salesOrders, customers, products, auditLog, updateSalesOrder } = useData();

  const order = salesOrders.find((o) => o.orderNo === orderNo);
  const customer = order ? customers.find((c) => bi(c.name) === bi(order.customerName)) : null;
  const product = order ? products.find((p) => p.sku === order.sku) : null;

  const [editing, setEditing] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const history = useMemo(
    () => auditLog.filter((e) => e.entityId === orderNo).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [auditLog, orderNo],
  );

  if (!order) {
    return (
      <div>
        <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} />
          {t("salesOrderDetail.backToList")}
        </Link>
        <p className="text-sm text-gray-500">{t("common.noResults")}</p>
      </div>
    );
  }

  const fields: FieldConfig[] = [
    { key: "quantity", label: t("salesOrders.col.quantity"), type: "number" },
    { key: "unitPrice", label: t("salesOrders.col.unitPrice"), type: "number", suffix: "THB" },
    { key: "discountPercent", label: t("salesOrders.col.discountPercent"), type: "number", suffix: "%" },
  ];

  const handleSave = (values: Record<string, FieldValue>) => {
    const quantity = Number(values.quantity);
    const unitPrice = Number(values.unitPrice);
    const discountPercent = Number(values.discountPercent);
    updateSalesOrder(order.orderNo, {
      quantity,
      unitPrice,
      discountPercent,
      netValue: computeNet(quantity, unitPrice, discountPercent),
    });
    setEditing(false);
    showToast(`${t("common.save")}: ${order.orderNo}`);
  };

  // FR-24: Distribution Officers must be able to update Delivery Status — kept independent of the
  // canViewSensitive-gated Edit drawer above, since delivery status isn't a masked/sensitive field.
  const handleDeliveryStatusChange = (status: SalesOrder["deliveryStatus"]) => {
    updateSalesOrder(order.orderNo, { deliveryStatus: status });
    showToast(`${t("common.save")}: ${order.orderNo}`);
  };

  return (
    <div>
      <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 print:hidden">
        <ArrowLeft size={14} />
        {t("salesOrderDetail.backToList")}
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{order.orderNo}</h1>
        <StatusBadge status={salesOrderDisplayStatus(order)} />
        {!order.approvalStatus && (
          <label className="flex items-center gap-1.5 print:hidden">
            <span className="sr-only">{t("salesOrders.col.deliveryStatus")}</span>
            <select
              value={order.deliveryStatus}
              onChange={(e) => handleDeliveryStatusChange(e.target.value as SalesOrder["deliveryStatus"])}
              className={`${selectClass} w-auto py-1 text-xs`}
              title={t("salesOrderDetail.updateDeliveryStatus")}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {order.approvalStatus === "pendingApproval" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 print:hidden">
          {order.approvalReason ? bi(order.approvalReason) + " — " : ""}
          {t("salesOrderDetail.pendingApprovalBanner")}
        </p>
      )}
      {order.approvalStatus === "rejected" && order.approvalNote && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600 print:hidden">{bi(order.approvalNote)}</p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={t("salesOrderDetail.sectionOverview")}
          action={
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDocsOpen(true)}
                disabled={Boolean(order.approvalStatus)}
                title={order.approvalStatus ? t("salesOrderDocs.pendingApprovalNote") : undefined}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
              >
                <FileText size={13} />
                {t("salesOrderDocs.action")}
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={!canViewSensitive}
                title={!canViewSensitive ? t("common.restrictedTooltip") : undefined}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
              >
                {canViewSensitive ? <Pencil size={13} /> : <Lock size={13} />}
                {t("common.edit")}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("salesOrders.col.customerName")}
              value={
                customer ? (
                  <Link to={`/customers/${customer.customerId}`} className="flex items-center gap-1 text-indigo-600 hover:underline">
                    {bi(order.customerName)}
                    <ArrowUpRight size={12} />
                  </Link>
                ) : (
                  bi(order.customerName)
                )
              }
            />
            <Field label={t("customers.col.channelType")} value={order.channelType ? t(`lookup.channel.${order.channelType}`) : <span className="text-gray-300">{t("common.notRecorded")}</span>} />
            <Field label={t("salesOrders.col.sku")} value={order.sku} />
            <Field label={t("products.col.name")} value={product?.name ?? <span className="text-gray-300">{t("common.notRecorded")}</span>} />
            <Field label={t("salesOrders.col.quantity")} value={order.quantity} />
            <Field label={t("salesOrders.col.unitPrice")} value={<Masked>฿{formatCurrency(order.unitPrice, lang)}</Masked>} />
            <Field label={t("salesOrders.col.discountPercent")} value={<Masked>{order.discountPercent}%</Masked>} />
            <Field label={t("salesOrders.col.netValue")} value={<Masked>฿{formatCurrency(order.netValue, lang)}</Masked>} />
            <Field label={t("salesOrders.col.lotBatch")} value={order.lotBatch} />
            <Field label={t("salesOrders.col.taxInvoiceNo")} value={order.taxInvoiceNo} />
            <Field label={t("salesOrders.col.deliveryNoteNo")} value={order.deliveryNoteNo} />
            <Field
              label={t("salesOrders.col.approver")}
              value={order.approver ? bi(order.approver) : <span className="text-gray-300">{t("salesOrders.none")}</span>}
            />
          </div>
        </Card>

        <Card title={t("salesOrderDetail.sectionHistory")}>
          <HistoryList entries={history} emptyLabel={t("salesOrderDetail.noHistory")} />
        </Card>
      </div>

      <EditDrawer
        open={editing}
        title={t("salesOrders.editTitle")}
        subtitle={`${order.orderNo} · ${bi(order.customerName)}`}
        fields={fields}
        values={{
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          discountPercent: order.discountPercent,
        }}
        onClose={() => setEditing(false)}
        onSave={handleSave}
      />

      <SalesOrderDocumentsModal order={docsOpen ? order : null} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
