import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Lock, FileText, ArrowUpRight, Undo2, Copy } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useEntityHistory } from "../lib/useEntityHistory";
import { useRole } from "../state/RoleContext";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { Card, Field, HistoryList } from "../components/DetailKit";
import { OrderLinesEditDrawer } from "../components/OrderLinesEditDrawer";
import { EditDrawer } from "../components/EditDrawer";
import { useRunAction } from "../lib/useRunAction";
import { Stepper } from "../components/Stepper";
import { salesFlow } from "../lib/flows";
import { SalesOrderDocumentsModal } from "../components/SalesOrderDocumentsModal";
import { DeliveryStatusSelect } from "../components/DeliveryStatusSelect";
import { PlannedDeliveryControl } from "../components/PlannedDeliveryControl";
import { useInvoiceStatus } from "../lib/useInvoiceStatus";
import { formatCurrency, formatDate } from "../lib/format";
import { salesOrderDisplayStatus, canEditSalesOrder, orderQuantity, splitVat } from "../lib/business";
import { RecordLink } from "../components/RecordLink";

export default function SalesOrderDetail() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const { salesOrders, customers, products, taxSettings, returnSalesLines } = useData();
  const runAction = useRunAction();

  const order = salesOrders.find((o) => o.orderNo === orderNo);
  const invoiceStatus = useInvoiceStatus();
  const customer = order ? customers.find((c) => c.customerId === order.customerId) : null;

  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const history = useEntityHistory(orderNo);

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

  const vatPercent = order.vatPercent ?? taxSettings.vatPercent;
  const { base, vat } = splitVat(order.netValue, vatPercent);
  const editable = can("editSalesOrder") && canEditSalesOrder(order);

  return (
    <div>
      <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 print:hidden">
        <ArrowLeft size={14} />
        {t("salesOrderDetail.backToList")}
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">{order.orderNo}</h1>
        {/* Status prints on paper copies; on screen the progress card below shows it. */}
        <span className="hidden print:inline">
          <StatusBadge status={salesOrderDisplayStatus(order)} />
        </span>
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

      <div className="mb-5">
        <Stepper
          steps={salesFlow(order, invoiceStatus?.get(order.orderNo))}
          title={t("flow.progress")}
          actions={
            <>
              <PlannedDeliveryControl order={order} />
              {order.deliveryStatus === "delivered" && !order.approvalStatus && can("updateDelivery") && order.lines.some((l) => l.quantity > (l.returnedQuantity ?? 0)) && (
                <button
                  onClick={() => setReturning(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  data-testid="return-items"
                >
                  <Undo2 size={13} />
                  {t("returns.action")}
                </button>
              )}
              <DeliveryStatusSelect order={order} />
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={t("salesOrderDetail.sectionOverview")}
          action={
            <div className="flex items-center gap-1">
              {can("createSalesOrder") && (
                <Link
                  to={`/sales-orders/new?copy=${encodeURIComponent(order.orderNo)}`}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  data-testid="copy-order"
                >
                  <Copy size={13} />
                  {t("salesOrderDetail.copyOrder")}
                </Link>
              )}
              <button
                onClick={() => setDocsOpen(true)}
                disabled={Boolean(order.approvalStatus)}
                title={order.approvalStatus ? t("salesOrderDocs.pendingApprovalNote") : undefined}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                <FileText size={13} />
                {t("salesOrderDocs.action")}
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={!editable}
                title={!can("editSalesOrder") ? t("erp.noPermission") : !canEditSalesOrder(order) ? t("erp.editShippedNote") : undefined}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {can("editSalesOrder") ? <Pencil size={13} /> : <Lock size={13} />}
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
                  <RecordLink to={`/customers/${customer.customerId}`}>
                    {bi(order.customerName)}
                    <ArrowUpRight size={12} />
                  </RecordLink>
                ) : (
                  bi(order.customerName)
                )
              }
            />
            <Field label={t("erp.orderDate")} value={formatDate(order.orderDate, lang)} />
            <Field
              label={t("customers.col.channelType")}
              value={order.channelType ? t(`lookup.channel.${order.channelType}`) : <span className="text-gray-400">{t("common.notRecorded")}</span>}
            />
            <Field label={t("salesOrders.col.netValue")} value={<Masked>฿{formatCurrency(order.netValue, lang)}</Masked>} />
            <Field label={t("salesOrders.col.taxInvoiceNo")} value={order.taxInvoiceNo} />
            <Field label={t("ar.invoiceDate")} value={order.invoiceDate ? formatDate(order.invoiceDate, lang) : <span className="text-gray-400">—</span>} />
            <Field
              label={t("ar.dueDate")}
              value={
                order.dueDate ? (
                  <>
                    {formatDate(order.dueDate, lang)}
                    {customer && <span className="ml-1.5 text-xs text-gray-400">({t("ar.netDays").replace("{n}", String(customer.creditTermDays))})</span>}
                  </>
                ) : (
                  <span className="text-gray-400">—</span>
                )
              }
            />
            <Field label={t("salesOrders.col.deliveryNoteNo")} value={order.deliveryNoteNo} />
            <Field
              label={t("salesOrders.col.approver")}
              value={order.approver ? bi(order.approver) : <span className="text-gray-400">{t("salesOrders.none")}</span>}
            />
            <Field label={t("erp.createdBy")} value={order.createdBy ? bi(order.createdBy) : <span className="text-gray-400">{t("common.notRecorded")}</span>} />
          </div>
        </Card>

        <Card title={t("salesOrderDetail.sectionHistory")}>
          <HistoryList entries={history} emptyLabel={t("salesOrderDetail.noHistory")} />
        </Card>

        <div className="lg:col-span-2">
          <Card title={`${t("salesOrderDetail.sectionLines")} (${order.lines.length})`}>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="px-2 py-2 text-left font-medium">#</th>
                    <th className="px-2 py-2 text-left font-medium">{t("products.col.name")}</th>
                    <th className="px-2 py-2 text-left font-medium">{t("salesOrders.col.lotBatch")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("salesOrders.col.quantity")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("salesOrders.col.unitPrice")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("salesOrders.col.discountPercent")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("salesOrders.col.lineValue")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {order.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <span className="font-medium text-gray-900">{products.find((p) => p.sku === l.sku)?.name ?? l.sku}</span>
                        <span className="block text-xs text-gray-400">{l.sku}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <RecordLink to={`/lot-trace?lot=${encodeURIComponent(l.lotBatch)}`}>
                          {l.lotBatch}
                        </RecordLink>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {l.quantity}
                        {l.returnedQuantity ? (
                          <span className="block text-xs font-medium text-amber-700">{t("returns.returnedQty").replace("{n}", String(l.returnedQuantity))}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        <Masked>฿{formatCurrency(l.unitPrice, lang)}</Masked>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        <Masked>{l.discountPercent}%</Masked>
                      </td>
                      <td className="px-2 py-2.5 text-right font-medium tabular-nums text-gray-900">
                        <Masked>฿{formatCurrency(l.netValue, lang)}</Masked>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 text-sm">
                  <tr>
                    <td colSpan={3} className="px-2 pt-3 text-gray-500">
                      {t("erp.totalUnits")}: <span className="tabular-nums text-gray-900">{orderQuantity(order)}</span>
                    </td>
                    <td colSpan={3} className="px-2 pt-3 text-right text-gray-500">
                      {t("erp.netBeforeVat")}
                    </td>
                    <td className="px-2 pt-3 text-right tabular-nums">
                      <Masked>฿{formatCurrency(base, lang)}</Masked>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-2 pt-1 text-right text-gray-500">
                      {t("erp.vat")} {vatPercent}%
                    </td>
                    <td className="px-2 pt-1 text-right tabular-nums">
                      <Masked>฿{formatCurrency(vat, lang)}</Masked>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-2 pt-1 text-right font-semibold text-gray-900">
                      {t("erp.grandTotal")}
                    </td>
                    <td className="px-2 pt-1 text-right font-semibold tabular-nums text-gray-900">
                      <Masked>฿{formatCurrency(order.netValue, lang)}</Masked>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <OrderLinesEditDrawer order={editing ? order : null} onClose={() => setEditing(false)} />
      <EditDrawer
        open={returning}
        title={t("returns.title")}
        subtitle={`${order.orderNo} · ${bi(order.customerName)}`}
        note={t("returns.note")}
        fields={[
          ...order.lines.map((l, i) => ({
            key: `ret_${i}`,
            label: `${products.find((p) => p.sku === l.sku)?.name ?? l.sku} — ${t("returns.upTo").replace("{n}", String(l.quantity - (l.returnedQuantity ?? 0)))}`,
            type: "number" as const,
            min: 0,
            max: l.quantity - (l.returnedQuantity ?? 0),
            step: 1,
          })),
          { key: "reason", label: t("returns.reason"), type: "text" as const, placeholder: t("returns.reasonPlaceholder") },
        ]}
        values={{ ...Object.fromEntries(order.lines.map((_, i) => [`ret_${i}`, 0])), reason: "" }}
        onClose={() => setReturning(false)}
        onSave={async (v) => {
          const returns = order.lines.map((_, i) => ({ line: i, quantity: Number(v[`ret_${i}`] ?? 0) })).filter((r) => r.quantity > 0);
          if (await runAction(returnSalesLines(order.orderNo, returns, String(v.reason ?? "")), `${t("returns.done")}: ${order.orderNo}`)) setReturning(false);
        }}
      />

      <SalesOrderDocumentsModal order={docsOpen ? order : null} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
