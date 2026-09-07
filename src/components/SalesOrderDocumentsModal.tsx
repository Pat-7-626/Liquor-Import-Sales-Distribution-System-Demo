import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import type { SalesOrder } from "../data/types";
import { StatusBadge } from "./StatusBadge";
import { formatCurrency, formatDate } from "../lib/format";
import { exportToPdf } from "../lib/export";

type Tab = "invoice" | "deliveryNote" | "pickingList";

export function SalesOrderDocumentsModal({ order, onClose }: { order: SalesOrder | null; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { products, customers, inventory } = useData();
  const [tab, setTab] = useState<Tab>("invoice");

  if (!order) return null;

  const product = products.find((p) => p.sku === order.sku);
  const customer = customers.find((c) => bi(c.name) === bi(order.customerName));
  const lot = inventory.find((i) => i.lotBatch === order.lotBatch);
  const today = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", { dateStyle: "medium" }).format(new Date());

  const TABS: { key: Tab; label: string }[] = [
    { key: "invoice", label: t("salesOrderDocs.taxInvoice") },
    { key: "deliveryNote", label: t("salesOrderDocs.deliveryNote") },
    { key: "pickingList", label: t("salesOrderDocs.pickingList") },
  ];

  // Portalled to <body> (not nested under the app shell) so the print-only rule in index.css can hide
  // everything else and print *only* this document — see the `body:has(#print-modal-root)` rule.
  return createPortal(
    <div id="print-modal-root">
      <div onClick={onClose} className="fixed inset-0 z-30 bg-gray-900/30 print:hidden" />
      <div className="fixed inset-4 z-40 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:inset-y-8 print:static print:inset-auto print:m-0 print:h-auto print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 print:hidden">
          <div className="flex gap-1">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === tb.key ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportToPdf}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Printer size={14} />
              {t("common.print")}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">{t("common.appTitle")}</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                {tab === "invoice" && t("salesOrderDocs.taxInvoiceTitle")}
                {tab === "deliveryNote" && t("salesOrderDocs.deliveryNoteTitle")}
                {tab === "pickingList" && t("salesOrderDocs.pickingListTitle")}
              </h2>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>
                {tab === "invoice" && `${t("salesOrders.col.taxInvoiceNo")}: ${order.taxInvoiceNo}`}
                {tab === "deliveryNote" && `${t("salesOrders.col.deliveryNoteNo")}: ${order.deliveryNoteNo}`}
                {tab === "pickingList" && `${t("salesOrders.col.orderNo")}: ${order.orderNo}`}
              </p>
              <p>
                {t("salesOrderDocs.printedOn")}: {today}
              </p>
            </div>
          </div>

          {tab !== "pickingList" && (
            <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">{t("salesOrderDocs.billTo")}</p>
                <p className="mt-1 font-medium text-gray-900">{bi(order.customerName)}</p>
                {customer && (
                  <>
                    <p className="text-gray-500">{t(`lookup.channel.${customer.channelType}`)}</p>
                    {customer.licenseNo && <p className="text-gray-500">{t("customers.col.licenseNo")}: {customer.licenseNo}</p>}
                  </>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-400">{t("salesOrders.col.deliveryStatus")}</p>
                <div className="mt-1 flex justify-end">
                  <StatusBadge status={order.deliveryStatus} />
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.sku")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("products.col.name")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.quantity")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("salesOrders.col.lotBatch")}</th>
                  {tab === "invoice" && (
                    <>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("importOrderDetail.exciseStampDate")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500">{t("salesOrders.col.unitPrice")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500">{t("salesOrders.col.discountPercent")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500">{t("salesOrders.col.netValue")}</th>
                    </>
                  )}
                  {tab === "pickingList" && (
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">{t("inventory.col.warehouse")}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-3 py-2 font-medium text-gray-900">{order.sku}</td>
                  <td className="px-3 py-2 text-gray-700">{product?.name ?? order.sku}</td>
                  <td className="px-3 py-2 text-gray-700">{order.quantity}</td>
                  <td className="px-3 py-2 text-gray-700">{order.lotBatch}</td>
                  {tab === "invoice" && (
                    <>
                      <td className="px-3 py-2 text-gray-700">{lot?.exciseStampDate ? formatDate(lot.exciseStampDate, lang) : "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-700">฿{formatCurrency(order.unitPrice, lang)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{order.discountPercent}%</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">฿{formatCurrency(order.netValue, lang)}</td>
                    </>
                  )}
                  {tab === "pickingList" && (
                    <td className="px-3 py-2 text-gray-700">{lot ? t(`lookup.warehouse.${lot.warehouse}`) : "—"}</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          {tab === "invoice" && (
            <div className="mt-4 flex justify-end">
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>{t("salesOrderDocs.grandTotal")}</span>
                  <span>฿{formatCurrency(order.netValue, lang)}</span>
                </div>
              </div>
            </div>
          )}

          {tab === "invoice" && (
            <p className="mt-6 text-xs text-gray-400">{t("salesOrderDocs.traceabilityNote")}</p>
          )}

          {tab === "pickingList" && (
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-block h-4 w-4 rounded border border-gray-300" />
              {t("salesOrderDocs.pickedCheckbox")}
            </div>
          )}

          {tab === "deliveryNote" && (
            <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-gray-500">
              <div className="border-t border-gray-300 pt-2">{t("salesOrderDocs.signatureSender")}</div>
              <div className="border-t border-gray-300 pt-2">{t("salesOrderDocs.signatureReceiver")}</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
