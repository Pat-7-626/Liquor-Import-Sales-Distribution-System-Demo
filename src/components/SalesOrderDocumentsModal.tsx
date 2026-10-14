import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import type { SalesOrder } from "../data/types";
import { Masked } from "./Masked";
import { formatNumber } from "../lib/format";
import { splitVat } from "../lib/business";
import { thaiBahtText, englishBahtText } from "../lib/amountInWords";
import { useWarehouseName } from "../lib/useWarehouseName";
import { Both, BuyerBlock, CopyStamp, CopySwitch, DocDate, DocTh, DocumentHeader, PrintFrame, Signatures } from "./TaxDocument";

type Tab = "invoice" | "deliveryNote" | "pickingList";

const TITLES: Record<Tab, { th: string; en: string }> = {
  invoice: { th: "ใบกำกับภาษี / ใบแจ้งหนี้", en: "Tax Invoice / Invoice" },
  deliveryNote: { th: "ใบส่งของ", en: "Delivery Note" },
  pickingList: { th: "ใบจัดสินค้า", en: "Picking List" },
};

/** Money on tax documents: always two decimals, Western digits. */
const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const tdCell = "px-2.5 py-2 align-top";

export function SalesOrderDocumentsModal({ order, onClose }: { order: SalesOrder | null; onClose: () => void }) {
  const { t } = useLanguage();
  const { products, customers, inventory, taxSettings } = useData();
  const warehouseName = useWarehouseName();
  const [tab, setTab] = useState<Tab>("invoice");
  const [copy, setCopy] = useState<"original" | "copy">("original");

  if (!order) return null;

  const customer = customers.find((c) => c.customerId === order.customerId);
  const vatPercent = order.vatPercent ?? taxSettings.vatPercent;
  const { base, vat } = splitVat(order.netValue, vatPercent);
  // The document's date is the invoice date (when the sale was booked), not the order date.
  const docDate = order.invoiceDate ?? order.orderDate;
  const nameOf = (sku: string) => products.find((p) => p.sku === sku)?.name ?? sku;
  const lotOf = (lotBatch: string) => inventory.find((i) => i.lotBatch === lotBatch);
  const totalUnits = order.lines.reduce((s, l) => s + l.quantity, 0);

  // Picking goes warehouse by warehouse, then by product.
  const picking = order.lines
    .map((l, i) => ({ ...l, no: i + 1, warehouse: lotOf(l.lotBatch)?.warehouse ?? "" }))
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.sku.localeCompare(b.sku));

  const tabs = [
    { key: "invoice" as const, label: t("salesOrderDocs.taxInvoice") },
    { key: "deliveryNote" as const, label: t("salesOrderDocs.deliveryNote") },
    { key: "pickingList" as const, label: t("salesOrderDocs.pickingList") },
  ];

  return (
    <PrintFrame
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      extra={tab === "invoice" ? <CopySwitch value={copy} onChange={setCopy} /> : null}
      email={
        tab === "invoice" && order.taxInvoiceNo !== "—"
          ? {
              to: customer?.email,
              subject: `ใบกำกับภาษี / Tax invoice ${order.taxInvoiceNo}`,
              document: `tax invoice ${order.taxInvoiceNo}`,
              filename: order.taxInvoiceNo,
              entityType: "salesOrder",
              entityId: order.orderNo,
            }
          : undefined
      }
    >
      <DocumentHeader
        title={TITLES[tab]}
        stamp={tab === "invoice" ? <CopyStamp value={copy} /> : undefined}
        note={tab === "invoice" ? "เอกสารออกเป็นชุด / Issued as a set" : undefined}
        meta={[
          tab === "invoice"
            ? { label: { th: "เลขที่", en: "No." }, value: order.taxInvoiceNo }
            : tab === "deliveryNote"
              ? { label: { th: "เลขที่", en: "No." }, value: order.deliveryNoteNo }
              : { label: { th: "ออเดอร์", en: "Order" }, value: order.orderNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={docDate} /> },
          ...(tab !== "pickingList" ? [{ label: { th: "อ้างอิงออเดอร์", en: "Order ref." }, value: order.orderNo }] : []),
          // Where and when the goods go: what the driver and the pickers need.
          ...(tab !== "invoice" && order.plannedDeliveryDate ? [{ label: { th: "วันที่นัดส่ง", en: "Delivery date" }, value: <DocDate iso={order.plannedDeliveryDate} /> }] : []),
          ...(tab === "pickingList" ? [{ label: { th: "ลูกค้า", en: "Customer" }, value: <Both th={order.customerName.th} en={order.customerName.en} /> }] : []),
          ...(tab === "invoice" && order.dueDate
            ? [
                {
                  label: { th: "ครบกำหนดชำระ", en: "Due date" },
                  value: (
                    <>
                      <DocDate iso={order.dueDate} />
                      {customer && <span className="block text-[11px] font-normal text-gray-400">{customer.creditTermDays} วัน / days</span>}
                    </>
                  ),
                },
              ]
            : []),
        ]}
        internal={tab === "pickingList"}
        party={
          tab === "pickingList" ? undefined : (
            <BuyerBlock customer={customer} fallbackName={order.customerName} role={tab === "deliveryNote" ? { th: "ส่งถึง", en: "Deliver to" } : undefined} />
          )
        }
      />

      {/* Lines */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-gray-300 bg-gray-50">
            <DocTh th="ลำดับ" en="No." align="center" className="w-10" />
            {tab === "pickingList" && <DocTh th="คลัง" en="Warehouse" />}
            <DocTh th="รายการ" en="Description" />
            {tab === "invoice" ? <DocTh th="ล็อต / แสตมป์สรรพสามิต" en="Lot / Excise stamp" /> : <DocTh th="ล็อต" en="Lot/Batch" />}
            <DocTh th="จำนวน" en="Qty" align="right" />
            {tab === "invoice" && (
              <>
                <DocTh th="ราคาต่อหน่วย" en="Unit price" align="right" />
                <DocTh th="ส่วนลด" en="Disc." align="right" />
                <DocTh th="จำนวนเงิน" en="Amount" align="right" />
              </>
            )}
            {tab !== "invoice" && (tab === "pickingList" ? <DocTh th="หยิบแล้ว" en="Picked" align="center" className="w-20" /> : <DocTh th="ตรวจรับ" en="Checked" align="center" className="w-20" />)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {(tab === "pickingList" ? picking : order.lines.map((l, i) => ({ ...l, no: i + 1, warehouse: lotOf(l.lotBatch)?.warehouse ?? "" }))).map((l) => {
            const lot = lotOf(l.lotBatch);
            const product = products.find((p) => p.sku === l.sku);
            return (
              <tr key={`${l.no}-${l.lotBatch}`}>
                <td className={`${tdCell} text-center text-gray-500`}>{l.no}</td>
                {tab === "pickingList" && <td className={tdCell}>{l.warehouse ? warehouseName(l.warehouse) : "—"}</td>}
                <td className={tdCell}>
                  <span className="font-medium">{nameOf(l.sku)}</span>
                  <span className="block text-xs text-gray-500">
                    {l.sku}
                    {product && ` · ${product.packageSize} ml · ${product.abv}% ABV`}
                  </span>
                </td>
                <td className={`${tdCell} whitespace-nowrap`}>
                  {l.lotBatch}
                  {/* The excise column is always filled: a date, or a dash when the lot has no stamp date on file. */}
                  {tab === "invoice" && <span className="block text-xs text-gray-500">{lot?.exciseStampDate ? <DocDate iso={lot.exciseStampDate} /> : "—"}</span>}
                </td>
                <td className={`${tdCell} text-right tabular-nums`}>{formatNumber(l.quantity, "en")}</td>
                {tab === "invoice" ? (
                  <>
                    <td className={`${tdCell} text-right tabular-nums`}>
                      <Masked>{money(l.unitPrice)}</Masked>
                    </td>
                    <td className={`${tdCell} text-right tabular-nums`}>
                      <Masked>{l.discountPercent ? `${l.discountPercent}%` : "—"}</Masked>
                    </td>
                    <td className={`${tdCell} text-right font-medium tabular-nums`}>
                      <Masked>{money(l.netValue)}</Masked>
                    </td>
                  </>
                ) : (
                  <td className={`${tdCell} text-center`}>
                    <span className="inline-block h-4 w-4 rounded border border-gray-400" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300">
            <td colSpan={tab === "pickingList" ? 4 : 3} className="px-2.5 py-2 text-right text-xs font-medium text-gray-500">
              <Both th="รวมจำนวน" en="Total units" />
            </td>
            <td className="px-2.5 py-2 text-right font-medium tabular-nums">{formatNumber(totalUnits, "en")}</td>
            <td colSpan={tab === "invoice" ? 3 : 1} />
          </tr>
        </tfoot>
      </table>

      {tab === "invoice" && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_18rem]">
          <div className="self-end rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium text-gray-500">
              <Both th="จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)" en="Amount in words" />
            </p>
            <Masked>
              <p className="mt-0.5 font-medium">({thaiBahtText(order.netValue)})</p>
              <p className="text-gray-600">({englishBahtText(order.netValue)})</p>
            </Masked>
          </div>
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-gray-600">
                  <Both th="มูลค่าสินค้า (ไม่รวม VAT)" en="Value of goods excl. VAT" />
                </td>
                <td className="py-1 text-right tabular-nums">
                  <Masked>{money(base)}</Masked>
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">
                  <Both th={`ภาษีมูลค่าเพิ่ม ${vatPercent}%`} en={`VAT ${vatPercent}%`} />
                </td>
                <td className="py-1 text-right tabular-nums">
                  <Masked>{money(vat)}</Masked>
                </td>
              </tr>
              <tr className="border-t-2 border-gray-900 font-semibold">
                <td className="py-1.5">
                  <Both th="จำนวนเงินรวมทั้งสิ้น" en="Grand total (THB)" />
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  <Masked>{money(order.netValue)}</Masked>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "invoice" && (
        <>
          <p className="mt-5 text-xs leading-relaxed text-gray-500">
            ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว · อ้างอิง Lot/Batch และวันที่ประทับแสตมป์สรรพสามิตเพื่อการตรวจสอบย้อนกลับ
            <span className="block text-gray-400">
              Prices include VAT. Lot/Batch and excise-stamp dates are shown for traceability from import to sale.
            </span>
          </p>
          <Signatures left={{ th: "ผู้รับสินค้า", en: "Received by" }} right={{ th: "ผู้มีอำนาจลงนาม", en: "Authorised signature" }} />
        </>
      )}

      {tab === "deliveryNote" && (
        <Signatures left={{ th: "ผู้ส่งสินค้า", en: "Delivered by" }} right={{ th: "ผู้รับสินค้า (ได้รับสินค้าครบถ้วนในสภาพดี)", en: "Received in good order by" }} />
      )}

      {tab === "pickingList" && (
        <Signatures left={{ th: "ผู้จัดสินค้า", en: "Picked by" }} right={{ th: "ผู้ตรวจสอบ", en: "Checked by" }} />
      )}
    </PrintFrame>
  );
}
