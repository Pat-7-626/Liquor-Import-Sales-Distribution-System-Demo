import type { SalesOrder } from "./types";
import { customers } from "./customers";
import { addDays } from "../lib/business";

const nameOf = (id: string) => customers.find((c) => c.customerId === id)!.name;
const channelOf = (id: string) => customers.find((c) => c.customerId === id)!.channelType;
const somchai = { th: "หัวหน้างาน: สมชาย วิริยะ", en: "Supervisor: Somchai Wiriya" };
const piyada = { th: "หัวหน้างาน: ปิยะดา ศรีสุข", en: "Supervisor: Piyada Srisuk" };

const raw: SalesOrder[] = [
  { orderNo: "SO-2026-3301", customerId: "CUS-0001", customerName: nameOf("CUS-0001"), orderDate: "2026-07-25", invoiceDate: "2026-07-25", channelType: channelOf("CUS-0001"), lines: [{ sku: "SKU-1001", lotBatch: "LOT-A2607-01", quantity: 60, unitPrice: 2490, discountPercent: 5, netValue: 141930 }], netValue: 141930, deliveryStatus: "delivered", taxInvoiceNo: "INV-2026-8801", deliveryNoteNo: "DN-2026-6601", approver: null, vatPercent: 7 },
  { orderNo: "SO-2026-3302", customerId: "CUS-0002", customerName: nameOf("CUS-0002"), orderDate: "2026-07-27", invoiceDate: "2026-07-27", channelType: channelOf("CUS-0002"), lines: [{ sku: "SKU-1003", lotBatch: "LOT-A2605-02", quantity: 120, unitPrice: 1090, discountPercent: 3, netValue: 126876 }], netValue: 126876, deliveryStatus: "delivered", taxInvoiceNo: "INV-2026-8802", deliveryNoteNo: "DN-2026-6602", approver: null, vatPercent: 7 },
  { orderNo: "SO-2026-3303", customerId: "CUS-0003", customerName: nameOf("CUS-0003"), orderDate: "2026-07-29", invoiceDate: "2026-07-29", channelType: channelOf("CUS-0003"), lines: [{ sku: "SKU-1007", lotBatch: "LOT-A2606-01", quantity: 30, unitPrice: 790, discountPercent: 12, netValue: 20856 }], netValue: 20856, deliveryStatus: "inDelivery", taxInvoiceNo: "INV-2026-8803", deliveryNoteNo: "DN-2026-6603", approver: somchai, vatPercent: 7 },
  { orderNo: "SO-2026-3304", customerId: "CUS-0004", customerName: nameOf("CUS-0004"), orderDate: "2026-07-31", invoiceDate: "2026-07-31", channelType: channelOf("CUS-0004"), lines: [{ sku: "SKU-1009", lotBatch: "LOT-A2607-03", quantity: 24, unitPrice: 590, discountPercent: 5, netValue: 13452 }], netValue: 13452, deliveryStatus: "inDelivery", taxInvoiceNo: "INV-2026-8804", deliveryNoteNo: "DN-2026-6604", approver: null, vatPercent: 7 },
  { orderNo: "SO-2026-3305", customerId: "CUS-0005", customerName: nameOf("CUS-0005"), orderDate: "2026-08-02", invoiceDate: "2026-08-02", channelType: channelOf("CUS-0005"), lines: [{ sku: "SKU-1002", lotBatch: "LOT-A2604-01", quantity: 12, unitPrice: 5990, discountPercent: 8, netValue: 66129.6 }], netValue: 66129.6, deliveryStatus: "delivered", taxInvoiceNo: "INV-2026-8805", deliveryNoteNo: "DN-2026-6605", approver: null, vatPercent: 7 },
  { orderNo: "SO-2026-3306", customerId: "CUS-0006", customerName: nameOf("CUS-0006"), orderDate: "2026-08-04", invoiceDate: "2026-08-04", channelType: channelOf("CUS-0006"), lines: [{ sku: "SKU-1005", lotBatch: "LOT-A2606-02", quantity: 48, unitPrice: 950, discountPercent: 15, netValue: 38760 }], netValue: 38760, deliveryStatus: "pendingShipment", taxInvoiceNo: "INV-2026-8806", deliveryNoteNo: "DN-2026-6606", approver: piyada, vatPercent: 7 },
  { orderNo: "SO-2026-3307", customerId: "CUS-0007", customerName: nameOf("CUS-0007"), orderDate: "2026-08-06", invoiceDate: "2026-08-06", channelType: channelOf("CUS-0007"), lines: [{ sku: "SKU-1010", lotBatch: "LOT-A2607-02", quantity: 20, unitPrice: 820, discountPercent: 6, netValue: 15416 }], netValue: 15416, deliveryStatus: "returned", taxInvoiceNo: "INV-2026-8807", deliveryNoteNo: "DN-2026-6607", approver: null, vatPercent: 7 },
  { orderNo: "SO-2026-3308", customerId: "CUS-0002", customerName: nameOf("CUS-0002"), orderDate: "2026-08-08", invoiceDate: "2026-08-08", channelType: channelOf("CUS-0002"), lines: [{ sku: "SKU-1006", lotBatch: "LOT-A2605-04", quantity: 18, unitPrice: 890, discountPercent: 5, netValue: 15219 }], netValue: 15219, deliveryStatus: "damaged", taxInvoiceNo: "INV-2026-8808", deliveryNoteNo: "DN-2026-6608", approver: null, vatPercent: 7 },
];

/** Invoices fall due after the customer's credit terms. */
export const salesOrders: SalesOrder[] = raw.map((o) => ({
  ...o,
  dueDate: o.invoiceDate ? addDays(o.invoiceDate, customers.find((c) => c.customerId === o.customerId)!.creditTermDays) : undefined,
}));
