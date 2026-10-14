import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import type { SalesOrder } from "../data/types";
import { Masked } from "./Masked";
import { formatNumber } from "../lib/format";
import { splitVat } from "../lib/business";
import { thaiBahtText, englishBahtText } from "../lib/amountInWords";
import { useWarehouseName } from "../lib/useWarehouseName";
import { Both, BuyerBlock, CopyStamp, CopySwitch, DocDate, DocMeta, PrintFrame, SellerBlock, Signatures } from "./TaxDocument";

type Tab = "invoice" | "deliveryNote" | "pickingList";

const TITLES: Record<Tab, { th: string; en: string }> = {
  invoice: { th: "ใบกำกับภาษี / ใบแจ้งหนี้", en: "Tax Invoice / Invoice" },
  deliveryNote: { th: "ใบส่งของ", en: "Delivery Note" },
  pickingList: { th: "ใบจัดสินค้า", en: "Picking List" },
};

/** Money on tax documents: always two decimals, Western digits. */
const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const thCell = "px-2.5 py-2 text-xs font-medium text-gray-600";
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
      {/* Header: seller left, document title and number right */}
      <div className="mb-5 flex flex-col gap-4 border-b-2 border-gray-900 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 print:flex-row">
        <div className="min-w-0 flex-1">
          <SellerBlock />
        </div>
        <div className="shrink-0 sm:text-right print:text-right">
          {tab === "invoice" && (
            <div className="mb-2">
              <CopyStamp value={copy} />
            </div>
          )}
          <h2 className="font-display text-2xl font-semibold text-gray-900">{TITLES[tab].th}</h2>
          <p className="text-sm uppercase tracking-wide text-gray-500">{TITLES[tab].en}</p>
          {tab === "invoice" && <p className="mt-1 text-xs text-gray-500">เอกสารออกเป็นชุด / Issued as a set</p>}
          <div className="mt-3 flex justify-end">
            <DocMeta
              rows={[
                tab === "invoice"
                  ? { label: { th: "เลขที่", en: "No." }, value: order.taxInvoiceNo }
                  : tab === "deliveryNote"
                    ? { label: { th: "เลขที่", en: "No." }, value: order.deliveryNoteNo }
                    : { label: { th: "ออเดอร์", en: "Order" }, value: order.orderNo },
                { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={docDate} /> },
                ...(tab !== "pickingList" ? [{ label: { th: "อ้างอิงออเดอร์", en: "Order ref." }, value: order.orderNo }] : []),
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
            />
          </div>
        </div>
      </div>

      {tab !== "pickingList" && (
        <div className="mb-5">
          <BuyerBlock customer={customer} fallbackName={order.customerName} />
        </div>
      )}

      {/* Lines */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-gray-300 bg-gray-50 text-left">
            <th className={`${thCell} w-8 text-center`}>
              ลำดับ<span className="block font-normal text-gray-400">No.</span>
            </th>
            {tab === "pickingList" && (
              <th className={thCell}>
                คลัง<span className="block font-normal text-gray-400">Warehouse</span>
              </th>
            )}
            <th className={thCell}>
              รายการ<span className="block font-normal text-gray-400">Description</span>
            </th>
            <th className={thCell}>
              Lot/Batch<span className="block font-normal text-gray-400">{tab === "invoice" ? "Excise stamp" : " "}</span>
            </th>
            <th className={`${thCell} text-right`}>
              จำนวน<span className="block font-normal text-gray-400">Qty</span>
            </th>
            {tab === "invoice" && (
              <>
                <th className={`${thCell} text-right`}>
                  ราคาต่อหน่วย<span className="block font-normal text-gray-400">Unit price</span>
                </th>
                <th className={`${thCell} text-right`}>
                  ส่วนลด<span className="block font-normal text-gray-400">Disc.</span>
                </th>
                <th className={`${thCell} text-right`}>
                  จำนวนเงิน<span className="block font-normal text-gray-400">Amount</span>
                </th>
              </>
            )}
            {tab !== "invoice" && (
              <th className={`${thCell} w-20 text-center`}>
                {tab === "pickingList" ? "หยิบแล้ว" : "ตรวจรับ"}
                <span className="block font-normal text-gray-400">{tab === "pickingList" ? "Picked" : "Checked"}</span>
              </th>
            )}
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
                <td className={tdCell}>
                  {l.lotBatch}
                  {tab === "invoice" && lot?.exciseStampDate && (
                    <span className="block text-xs text-gray-500">
                      <DocDate iso={lot.exciseStampDate} />
                    </span>
                  )}
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
            <td colSpan={tab === "pickingList" ? 4 : 3} className="px-2.5 py-2 text-right text-xs text-gray-500">
              รวมจำนวน / Total units
            </td>
            <td className="px-2.5 py-2 text-right font-medium tabular-nums">{formatNumber(totalUnits, "en")}</td>
            <td colSpan={tab === "invoice" ? 3 : 1} />
          </tr>
        </tfoot>
      </table>

      {tab === "invoice" && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_18rem]">
          <div className="self-end rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
            <p className="text-xs text-gray-500">
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
                  มูลค่าสินค้า (ไม่รวม VAT)<span className="block text-[11px] text-gray-400">Value of goods excl. VAT</span>
                </td>
                <td className="py-1 text-right tabular-nums">
                  <Masked>{money(base)}</Masked>
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">
                  ภาษีมูลค่าเพิ่ม {vatPercent}%<span className="block text-[11px] text-gray-400">VAT {vatPercent}%</span>
                </td>
                <td className="py-1 text-right tabular-nums">
                  <Masked>{money(vat)}</Masked>
                </td>
              </tr>
              <tr className="border-t-2 border-gray-900 font-semibold">
                <td className="py-1.5">
                  จำนวนเงินรวมทั้งสิ้น<span className="block text-[11px] font-normal text-gray-400">Grand total (THB)</span>
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
