import type { SalesOrder } from "./types";
import { customers } from "./customers";

const nameOf = (id: string) => customers.find((c) => c.customerId === id)!.name;
const channelOf = (id: string) => customers.find((c) => c.customerId === id)!.channelType;
const somchai = { th: "หัวหน้างาน: สมชาย วิริยะ", en: "Supervisor: Somchai Wiriya" };
const piyada = { th: "หัวหน้างาน: ปิยะดา ศรีสุข", en: "Supervisor: Piyada Srisuk" };

export const salesOrders: SalesOrder[] = [
  { orderNo: "SO-2026-3301", customerName: nameOf("CUS-0001"), channelType: channelOf("CUS-0001"), sku: "SKU-1001", quantity: 60, unitPrice: 2490, discountPercent: 5, netValue: 141930, lotBatch: "LOT-A2607-01", deliveryStatus: "delivered", taxInvoiceNo: "INV-2026-8801", deliveryNoteNo: "DN-2026-6601", approver: null },
  { orderNo: "SO-2026-3302", customerName: nameOf("CUS-0002"), channelType: channelOf("CUS-0002"), sku: "SKU-1003", quantity: 120, unitPrice: 1090, discountPercent: 3, netValue: 126876, lotBatch: "LOT-A2605-02", deliveryStatus: "delivered", taxInvoiceNo: "INV-2026-8802", deliveryNoteNo: "DN-2026-6602", approver: null },
  { orderNo: "SO-2026-3303", customerName: nameOf("CUS-0003"), channelType: channelOf("CUS-0003"), sku: "SKU-1007", quantity: 30, unitPrice: 790, discountPercent: 12, netValue: 20856, lotBatch: "LOT-A2606-01", deliveryStatus: "inDelivery", taxInvoiceNo: "INV-2026-8803", deliveryNoteNo: "DN-2026-6603", approver: somchai },
  { orderNo: "SO-2026-3304", customerName: nameOf("CUS-0004"), channelType: channelOf("CUS-0004"), sku: "SKU-1009", quantity: 24, unitPrice: 590, discountPercent: 5, netValue: 13452, lotBatch: "LOT-A2607-03", deliveryStatus: "inDelivery", taxInvoiceNo: "INV-2026-8804", deliveryNoteNo: "DN-2026-6604", approver: null },
  { orderNo: "SO-2026-3305", customerName: nameOf("CUS-0005"), channelType: channelOf("CUS-0005"), sku: "SKU-1002", quantity: 12, unitPrice: 5990, discountPercent: 8, netValue: 66129.6, lotBatch: "LOT-A2604-01", deliveryStatus: "delivered", taxInvoiceNo: "INV-2026-8805", deliveryNoteNo: "DN-2026-6605", approver: null },
  { orderNo: "SO-2026-3306", customerName: nameOf("CUS-0006"), channelType: channelOf("CUS-0006"), sku: "SKU-1005", quantity: 48, unitPrice: 950, discountPercent: 15, netValue: 38760, lotBatch: "LOT-A2606-02", deliveryStatus: "pendingShipment", taxInvoiceNo: "INV-2026-8806", deliveryNoteNo: "DN-2026-6606", approver: piyada },
  { orderNo: "SO-2026-3307", customerName: nameOf("CUS-0007"), channelType: channelOf("CUS-0007"), sku: "SKU-1010", quantity: 20, unitPrice: 820, discountPercent: 6, netValue: 15416, lotBatch: "LOT-A2607-02", deliveryStatus: "returned", taxInvoiceNo: "INV-2026-8807", deliveryNoteNo: "DN-2026-6607", approver: null },
  { orderNo: "SO-2026-3308", customerName: nameOf("CUS-0002"), channelType: channelOf("CUS-0002"), sku: "SKU-1006", quantity: 18, unitPrice: 890, discountPercent: 5, netValue: 15219, lotBatch: "LOT-A2605-04", deliveryStatus: "damaged", taxInvoiceNo: "INV-2026-8808", deliveryNoteNo: "DN-2026-6608", approver: null },
];
