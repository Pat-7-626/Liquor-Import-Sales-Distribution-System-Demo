import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { products as initialProducts } from "../data/products";
import { importOrders as initialImportOrders } from "../data/importOrders";
import { licenses as initialLicenses } from "../data/licenses";
import { customers as initialCustomers } from "../data/customers";
import { salesOrders as initialSalesOrders } from "../data/salesOrders";
import { inventory as initialInventory } from "../data/inventory";
import { SALES_OFFICER_ACTOR, ORDER_OFFICER_ACTOR, SYSTEM_ACTOR } from "../data/approvers";
import type {
  AttachedDocument,
  AuditEntry,
  Bilingual,
  Customer,
  CountryCode,
  ImportLogistics,
  ImportOrder,
  ImportOrderLineItem,
  InventoryItem,
  License,
  Product,
  ReceivingLine,
  SalesOrder,
} from "../data/types";
import {
  computeProductStatus,
  nextOrderNumber,
  addDays,
  computeImportTax,
  HIGH_VALUE_APPROVAL_THRESHOLD,
  describeLineIssues,
} from "../lib/business";

export interface NewSalesOrderInput {
  customer: Customer;
  sku: string;
  lotBatch: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  /** FR-22/28: discount and/or projected credit exceeds the customer's limit — order is submitted pending real supervisor approval, not booked yet. */
  needsApproval: boolean;
  approvalReason?: Bilingual;
}

export interface NewImportOrderInput {
  supplier: string;
  country: CountryCode;
  incoterms: string;
  orderDate: string;
  etaDate: string;
  hasIssues: boolean;
  issueSummary?: Bilingual;
  intakeMethod: Bilingual;
  lineItems: ImportOrderLineItem[];
  logistics: ImportLogistics;
  importLicenseNo: string | null;
}

export interface ReceiveGoodsInput {
  orderNo: string;
  receivedDate: string;
  lines: ReceivingLine[];
  actor: Bilingual;
}

interface DataContextValue {
  products: Product[];
  importOrders: ImportOrder[];
  licenses: License[];
  customers: Customer[];
  salesOrders: SalesOrder[];
  inventory: InventoryItem[];
  auditLog: AuditEntry[];

  updateProduct: (sku: string, patch: Partial<Product>) => void;
  updateImportOrder: (orderNo: string, patch: Partial<ImportOrder>) => void;
  updateLicense: (licenseNo: string, patch: Partial<License>) => void;
  updateCustomer: (customerId: string, patch: Partial<Customer>) => void;
  updateSalesOrder: (orderNo: string, patch: Partial<SalesOrder>) => void;
  updateInventory: (lotBatch: string, patch: Partial<InventoryItem>) => void;

  /**
   * Books a new sale: appends the order, decrements the fulfilling lot + product stock, regenerates
   * document numbers. If `needsApproval`, none of that happens yet — the order is appended with
   * `approvalStatus: "pendingApproval"` and booked for real only once `approveSalesOrder` runs (FR-22).
   */
  createSalesOrder: (input: NewSalesOrderInput) => SalesOrder;
  /** FR-22: a real supervisor approves a pending-discount order — only now does it actually book (stock/credit/doc numbers). */
  approveSalesOrder: (orderNo: string, actor: Bilingual) => void;
  /** FR-22: a real supervisor rejects a pending-discount order — it never gets booked. */
  rejectSalesOrderApproval: (orderNo: string, actor: Bilingual, reason: string) => void;

  /** FR-01–05: intakes a new Import Order into Staging (or flags it as issueDetected if validation failed). */
  createImportOrder: (input: NewImportOrderInput) => ImportOrder;
  /** FR-05: correct a staging/issueDetected order's line items, re-validate, and clear the flag once clean. */
  correctImportOrderLines: (orderNo: string, lineItems: ImportOrderLineItem[], actor: Bilingual) => void;
  /** FR-27/29, FR-28: approve an order (or its first of two sign-offs if high-value), recorded in the audit trail. */
  approveImportOrder: (orderNo: string, actor: Bilingual) => void;
  /** FR-27/29: reject an order back for correction, with a required reason. */
  rejectImportOrder: (orderNo: string, actor: Bilingual, reason: string) => void;
  /** FR-13/14/15: record actual received quantities, flag discrepancies, and stock the warehouse. */
  receiveGoods: (input: ReceiveGoodsInput) => void;
  /** FR-06: attach a document to an Import Order. */
  attachDocument: (orderNo: string, doc: Omit<AttachedDocument, "id" | "uploadedAt">, actor: Bilingual) => void;
  removeDocument: (orderNo: string, docId: string) => void;

  /** Clears local persistence and restores the original demo dataset. */
  resetDemoData: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function makeAuditId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSeedAuditLog(): AuditEntry[] {
  const entries: AuditEntry[] = [];

  for (const o of initialImportOrders) {
    entries.push({
      id: makeAuditId(),
      timestamp: `${o.orderDate}T09:15:00`,
      entityType: "importOrder",
      entityId: o.orderNo,
      action: "created",
      actor: ORDER_OFFICER_ACTOR,
      summary: { th: `นำเข้าออเดอร์จาก ${o.supplier}`, en: `Order intake from ${o.supplier}` },
    });
    if (o.approver) {
      entries.push({
        id: makeAuditId(),
        timestamp: `${addDays(o.orderDate, 2)}T14:00:00`,
        entityType: "importOrder",
        entityId: o.orderNo,
        action: "approved",
        actor: o.approver,
        summary: { th: "อนุมัติออเดอร์นำเข้า", en: "Approved import order" },
      });
    }
  }

  initialSalesOrders.forEach((o, idx) => {
    const created = addDays("2026-07-25", idx * 2);
    entries.push({
      id: makeAuditId(),
      timestamp: `${created}T11:00:00`,
      entityType: "salesOrder",
      entityId: o.orderNo,
      action: "created",
      actor: SALES_OFFICER_ACTOR,
      summary: { th: `สร้างออเดอร์ขาย ${o.sku} × ${o.quantity}`, en: `Created sales order: ${o.sku} × ${o.quantity}` },
    });
    if (o.approver) {
      entries.push({
        id: makeAuditId(),
        timestamp: `${created}T15:30:00`,
        entityType: "salesOrder",
        entityId: o.orderNo,
        action: "approved",
        actor: o.approver,
        summary: { th: `อนุมัติส่วนลด ${o.discountPercent}%`, en: `Approved discount ${o.discountPercent}%` },
      });
    }
  });

  return entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

interface PersistedState {
  products: Product[];
  importOrders: ImportOrder[];
  licenses: License[];
  customers: Customer[];
  salesOrders: SalesOrder[];
  inventory: InventoryItem[];
  auditLog: AuditEntry[];
}

const STORAGE_KEY = "lisd-demo-state-v2";

function seedState(): PersistedState {
  return {
    products: initialProducts,
    importOrders: initialImportOrders,
    licenses: initialLicenses,
    customers: initialCustomers,
    salesOrders: initialSalesOrders,
    inventory: initialInventory,
    auditLog: buildSeedAuditLog(),
  };
}

/** NFR-02/06 (approximated for a frontend-only demo): local persistence stands in for a real backup/retention store. */
function loadPersisted(): PersistedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [initial] = useState<PersistedState>(() => loadPersisted() ?? seedState());
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [importOrders, setImportOrders] = useState<ImportOrder[]>(initial.importOrders);
  const [licenses, setLicenses] = useState<License[]>(initial.licenses);
  const [customers, setCustomers] = useState<Customer[]>(initial.customers);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(initial.salesOrders);
  const [inventory, setInventory] = useState<InventoryItem[]>(initial.inventory);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(initial.auditLog);

  useEffect(() => {
    try {
      const snapshot: PersistedState = { products, importOrders, licenses, customers, salesOrders, inventory, auditLog };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage unavailable (private browsing, quota) — demo still works, just won't survive reload */
    }
  }, [products, importOrders, licenses, customers, salesOrders, inventory, auditLog]);

  const resetDemoData = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const seed = seedState();
    setProducts(seed.products);
    setImportOrders(seed.importOrders);
    setLicenses(seed.licenses);
    setCustomers(seed.customers);
    setSalesOrders(seed.salesOrders);
    setInventory(seed.inventory);
    setAuditLog(seed.auditLog);
  }, []);

  const pushAudit = useCallback((entry: Omit<AuditEntry, "id" | "timestamp">) => {
    setAuditLog((prev) => [{ ...entry, id: makeAuditId(), timestamp: new Date().toISOString() }, ...prev]);
  }, []);

  const updateProduct = useCallback(
    (sku: string, patch: Partial<Product>) => {
      setProducts((prev) => prev.map((p) => (p.sku === sku ? { ...p, ...patch } : p)));
      const fields = Object.keys(patch).join(", ");
      pushAudit({
        entityType: "product",
        entityId: sku,
        action: "updated",
        actor: SYSTEM_ACTOR,
        summary: { th: `แก้ไขฟิลด์: ${fields}`, en: `Updated fields: ${fields}` },
      });
    },
    [pushAudit],
  );

  const updateImportOrder = useCallback(
    (orderNo: string, patch: Partial<ImportOrder>) => {
      setImportOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, ...patch } : o)));
      const fields = Object.keys(patch).join(", ");
      pushAudit({
        entityType: "importOrder",
        entityId: orderNo,
        action: "updated",
        actor: SYSTEM_ACTOR,
        summary: { th: `แก้ไขฟิลด์: ${fields}`, en: `Updated fields: ${fields}` },
      });
    },
    [pushAudit],
  );

  const updateLicense = useCallback(
    (licenseNo: string, patch: Partial<License>) => {
      setLicenses((prev) => prev.map((l) => (l.licenseNo === licenseNo ? { ...l, ...patch } : l)));
      const fields = Object.keys(patch).join(", ");
      pushAudit({
        entityType: "license",
        entityId: licenseNo,
        action: "updated",
        actor: SYSTEM_ACTOR,
        summary: { th: `แก้ไขฟิลด์: ${fields}`, en: `Updated fields: ${fields}` },
      });
    },
    [pushAudit],
  );

  const updateCustomer = useCallback(
    (customerId: string, patch: Partial<Customer>) => {
      setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, ...patch } : c)));
      const fields = Object.keys(patch).join(", ");
      pushAudit({
        entityType: "customer",
        entityId: customerId,
        action: "updated",
        actor: SYSTEM_ACTOR,
        summary: { th: `แก้ไขฟิลด์: ${fields}`, en: `Updated fields: ${fields}` },
      });
    },
    [pushAudit],
  );

  const updateSalesOrder = useCallback(
    (orderNo: string, patch: Partial<SalesOrder>) => {
      const existing = salesOrders.find((o) => o.orderNo === orderNo);
      setSalesOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, ...patch } : o)));

      // FR-17: a Sales Order newly marked Returned restocks the fulfilling lot; Damaged is a write-off (no restock).
      if (existing && patch.deliveryStatus && patch.deliveryStatus !== existing.deliveryStatus) {
        const wasAlreadyClosed = existing.deliveryStatus === "returned" || existing.deliveryStatus === "damaged";
        if (!wasAlreadyClosed && patch.deliveryStatus === "returned") {
          setInventory((prev) =>
            prev.map((i) =>
              i.lotBatch === existing.lotBatch ? { ...i, quantityRemaining: i.quantityRemaining + existing.quantity } : i,
            ),
          );
          setProducts((prev) =>
            prev.map((p) => {
              if (p.sku !== existing.sku) return p;
              const stockAvailable = p.stockAvailable + existing.quantity;
              return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
            }),
          );
          pushAudit({
            entityType: "inventory",
            entityId: existing.lotBatch,
            action: "updated",
            actor: SYSTEM_ACTOR,
            summary: { th: `รับคืนสินค้าเข้าสต๊อกจากออเดอร์ ${orderNo}`, en: `Restocked from return: ${orderNo}` },
          });
        } else if (!wasAlreadyClosed && patch.deliveryStatus === "damaged") {
          pushAudit({
            entityType: "inventory",
            entityId: existing.lotBatch,
            action: "updated",
            actor: SYSTEM_ACTOR,
            summary: {
              th: `ตัดจำหน่ายสินค้าเสียหายจากออเดอร์ ${orderNo} (ไม่คืนสต๊อก)`,
              en: `Written off as damaged: ${orderNo} (not restocked)`,
            },
          });
        }
      }

      const fields = Object.keys(patch).join(", ");
      pushAudit({
        entityType: "salesOrder",
        entityId: orderNo,
        action: "updated",
        actor: SYSTEM_ACTOR,
        summary: { th: `แก้ไขฟิลด์: ${fields}`, en: `Updated fields: ${fields}` },
      });
    },
    [salesOrders, pushAudit],
  );

  const updateInventory = useCallback(
    (lotBatch: string, patch: Partial<InventoryItem>) => {
      setInventory((prev) => prev.map((i) => (i.lotBatch === lotBatch ? { ...i, ...patch } : i)));
      const fields = Object.keys(patch).join(", ");
      pushAudit({
        entityType: "inventory",
        entityId: lotBatch,
        action: "updated",
        actor: SYSTEM_ACTOR,
        summary: { th: `แก้ไขฟิลด์: ${fields}`, en: `Updated fields: ${fields}` },
      });
    },
    [pushAudit],
  );

  /** Applies the actual booking side effects (stock/customer balance) for one sales order — shared by
   *  immediate booking (no approval needed) and approveSalesOrder (deferred booking, FR-22). */
  const bookSalesOrderEffects = useCallback((order: Pick<SalesOrder, "sku" | "lotBatch" | "quantity" | "netValue" | "customerName">) => {
    setInventory((prev) =>
      prev.map((i) =>
        i.lotBatch === order.lotBatch ? { ...i, quantityRemaining: Math.max(0, i.quantityRemaining - order.quantity) } : i,
      ),
    );
    setProducts((prev) =>
      prev.map((p) => {
        if (p.sku !== order.sku) return p;
        const stockAvailable = Math.max(0, p.stockAvailable - order.quantity);
        return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
      }),
    );
    setCustomers((prev) =>
      prev.map((c) => (c.name.th === order.customerName.th ? { ...c, outstandingBalance: c.outstandingBalance + order.netValue } : c)),
    );
  }, []);

  const createSalesOrder = useCallback(
    (input: NewSalesOrderInput): SalesOrder => {
      const netValue =
        Math.round(input.quantity * input.unitPrice * (1 - input.discountPercent / 100) * 100) / 100;

      const orderNo = nextOrderNumber(salesOrders.map((o) => o.orderNo));

      const order: SalesOrder = input.needsApproval
        ? {
            orderNo,
            customerName: input.customer.name,
            channelType: input.customer.channelType,
            sku: input.sku,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            discountPercent: input.discountPercent,
            netValue,
            lotBatch: input.lotBatch,
            deliveryStatus: "pendingShipment",
            taxInvoiceNo: "—",
            deliveryNoteNo: "—",
            approver: null,
            approvalStatus: "pendingApproval",
            approvalReason: input.approvalReason,
          }
        : {
            orderNo,
            customerName: input.customer.name,
            channelType: input.customer.channelType,
            sku: input.sku,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            discountPercent: input.discountPercent,
            netValue,
            lotBatch: input.lotBatch,
            deliveryStatus: "pendingShipment",
            taxInvoiceNo: nextOrderNumber(salesOrders.map((o) => o.taxInvoiceNo)),
            deliveryNoteNo: nextOrderNumber(salesOrders.map((o) => o.deliveryNoteNo)),
            approver: null,
          };

      setSalesOrders((prev) => [order, ...prev]);

      if (!input.needsApproval) bookSalesOrderEffects(order);

      pushAudit({
        entityType: "salesOrder",
        entityId: orderNo,
        action: "created",
        actor: SALES_OFFICER_ACTOR,
        summary: input.needsApproval
          ? {
              th: `สร้างออเดอร์ขาย ${input.sku} × ${input.quantity} — ${input.approvalReason?.th ?? "รอหัวหน้างานอนุมัติ"} (FR-22/28)`,
              en: `Created sales order: ${input.sku} × ${input.quantity} — ${input.approvalReason?.en ?? "awaiting supervisor approval"} (FR-22/28)`,
            }
          : { th: `สร้างออเดอร์ขาย ${input.sku} × ${input.quantity}`, en: `Created sales order: ${input.sku} × ${input.quantity}` },
      });

      return order;
    },
    [salesOrders, pushAudit, bookSalesOrderEffects],
  );

  const approveSalesOrder = useCallback(
    (orderNo: string, actor: Bilingual) => {
      const order = salesOrders.find((o) => o.orderNo === orderNo);
      if (!order || order.approvalStatus !== "pendingApproval") return;

      const taxInvoiceNo = nextOrderNumber(salesOrders.map((o) => o.taxInvoiceNo).filter((n) => n !== "—"));
      const deliveryNoteNo = nextOrderNumber(salesOrders.map((o) => o.deliveryNoteNo).filter((n) => n !== "—"));

      setSalesOrders((prev) =>
        prev.map((o) =>
          o.orderNo === orderNo ? { ...o, approvalStatus: undefined, approver: actor, taxInvoiceNo, deliveryNoteNo } : o,
        ),
      );
      bookSalesOrderEffects(order);

      pushAudit({
        entityType: "salesOrder",
        entityId: orderNo,
        action: "approved",
        actor,
        summary: { th: `อนุมัติส่วนลด ${order.discountPercent}% และออกเอกสารแล้ว`, en: `Approved ${order.discountPercent}% discount and issued documents` },
      });
    },
    [salesOrders, pushAudit, bookSalesOrderEffects],
  );

  const rejectSalesOrderApproval = useCallback(
    (orderNo: string, actor: Bilingual, reason: string) => {
      setSalesOrders((prev) =>
        prev.map((o) =>
          o.orderNo === orderNo ? { ...o, approvalStatus: "rejected", approvalNote: { th: reason, en: reason } } : o,
        ),
      );
      pushAudit({
        entityType: "salesOrder",
        entityId: orderNo,
        action: "rejected",
        actor,
        summary: { th: reason, en: reason },
      });
    },
    [pushAudit],
  );

  const createImportOrder = useCallback(
    (input: NewImportOrderInput): ImportOrder => {
      const orderNo = nextOrderNumber(importOrders.map((o) => o.orderNo));
      const skuCount = input.lineItems.length;
      const totalValue = input.lineItems.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
      const tax = computeImportTax(input.lineItems, products);

      const order: ImportOrder = {
        orderNo,
        supplier: input.supplier,
        country: input.country,
        incoterms: input.incoterms,
        orderDate: input.orderDate,
        etaDate: input.etaDate,
        skuCount,
        totalValue,
        status: input.hasIssues ? "issueDetected" : "staging",
        approver: null,
        customsDeclarationNo: null,
        importLicenseNo: input.importLicenseNo,
        note: input.issueSummary,
        lineItems: input.lineItems,
        logistics: input.logistics,
        tax,
      };

      setImportOrders((prev) => [order, ...prev]);

      pushAudit({
        entityType: "importOrder",
        entityId: orderNo,
        action: "created",
        actor: ORDER_OFFICER_ACTOR,
        summary: {
          th: `นำเข้าออเดอร์ผ่านช่องทาง: ${input.intakeMethod.th}${input.hasIssues ? " — ตรวจพบปัญหา" : ""}`,
          en: `Order intake via ${input.intakeMethod.en}${input.hasIssues ? " — validation issues detected" : ""}`,
        },
      });

      return order;
    },
    [importOrders, products, pushAudit],
  );

  const correctImportOrderLines = useCallback(
    (orderNo: string, lineItems: ImportOrderLineItem[], actor: Bilingual) => {
      const issues = describeLineIssues(lineItems, products);
      const hasIssues = issues.length > 0;
      const tax = computeImportTax(lineItems, products);
      const totalValue = lineItems.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

      setImportOrders((prev) =>
        prev.map((o) =>
          o.orderNo === orderNo
            ? {
                ...o,
                lineItems,
                skuCount: lineItems.length,
                totalValue,
                tax,
                status: hasIssues ? "issueDetected" : "staging",
                note: hasIssues ? { th: issues.map((m) => m.th).join("; "), en: issues.map((m) => m.en).join("; ") } : undefined,
              }
            : o,
        ),
      );

      pushAudit({
        entityType: "importOrder",
        entityId: orderNo,
        action: "updated",
        actor,
        summary: hasIssues
          ? { th: "แก้ไขรายการสินค้า — ยังพบปัญหาการตรวจสอบ", en: "Corrected line items — validation issues remain" }
          : { th: "แก้ไขรายการสินค้า — ผ่านการตรวจสอบแล้ว", en: "Corrected line items — now passes validation" },
      });
    },
    [products, pushAudit],
  );

  const approveImportOrder = useCallback(
    (orderNo: string, actor: Bilingual) => {
      const order = importOrders.find((o) => o.orderNo === orderNo);
      const needsSecondLevel = Boolean(order && order.totalValue > HIGH_VALUE_APPROVAL_THRESHOLD && !order.firstApprover);

      setImportOrders((prev) =>
        prev.map((o) => {
          if (o.orderNo !== orderNo) return o;
          if (o.totalValue > HIGH_VALUE_APPROVAL_THRESHOLD && !o.firstApprover) {
            return {
              ...o,
              firstApprover: actor,
              status: "pendingApproval",
              note: {
                th: "ผ่านการอนุมัติระดับที่ 1 — รออนุมัติระดับที่ 2 จากหัวหน้างานอีกท่าน (มูลค่าสูง)",
                en: "Level 1 approved — awaiting a second, different supervisor for final sign-off (high-value order)",
              },
            };
          }
          return { ...o, status: "approved", approver: actor, note: undefined };
        }),
      );

      pushAudit({
        entityType: "importOrder",
        entityId: orderNo,
        action: "approved",
        actor,
        summary: needsSecondLevel
          ? { th: "อนุมัติระดับที่ 1 (มูลค่าสูง ต้องอนุมัติ 2 ระดับ)", en: "Level 1 approval (high-value order requires two levels)" }
          : { th: "อนุมัติออเดอร์นำเข้า", en: "Approved import order" },
      });
    },
    [importOrders, pushAudit],
  );

  const rejectImportOrder = useCallback(
    (orderNo: string, actor: Bilingual, reason: string) => {
      setImportOrders((prev) =>
        prev.map((o) =>
          o.orderNo === orderNo
            ? { ...o, status: "rejected", note: { th: reason, en: reason }, firstApprover: undefined }
            : o,
        ),
      );
      pushAudit({
        entityType: "importOrder",
        entityId: orderNo,
        action: "rejected",
        actor,
        summary: { th: reason, en: reason },
      });
    },
    [pushAudit],
  );

  const receiveGoods = useCallback(
    (input: ReceiveGoodsInput) => {
      const hasDiscrepancy = input.lines.some((l) => l.receivedQty !== l.orderedQty);

      setImportOrders((prev) =>
        prev.map((o) =>
          o.orderNo === input.orderNo
            ? { ...o, status: "receivedWarehouse", receiving: { receivedDate: input.receivedDate, lines: input.lines, hasDiscrepancy } }
            : o,
        ),
      );

      setInventory((prev) => [
        ...input.lines
          .filter((l) => l.receivedQty > 0)
          .map((l) => {
            const product = products.find((p) => p.sku === l.sku);
            return {
              sku: l.sku,
              productName: product?.name ?? l.sku,
              lotBatch: l.lotBatch,
              receivedDate: input.receivedDate,
              quantityRemaining: l.receivedQty,
              ageDays: 0,
              status: "normal" as const,
              warehouse: "whA" as const,
              exciseStampDate: l.exciseStampDate,
            };
          }),
        ...prev,
      ]);

      setProducts((prev) =>
        prev.map((p) => {
          const line = input.lines.find((l) => l.sku === p.sku);
          if (!line || line.receivedQty <= 0) return p;
          const stockAvailable = p.stockAvailable + line.receivedQty;
          return { ...p, stockAvailable, status: computeProductStatus(stockAvailable) };
        }),
      );

      pushAudit({
        entityType: "importOrder",
        entityId: input.orderNo,
        action: "updated",
        actor: input.actor,
        summary: hasDiscrepancy
          ? { th: "รับสินค้าเข้าคลัง — พบส่วนต่างจำนวนที่ได้รับ", en: "Goods received — quantity discrepancy found" }
          : { th: "รับสินค้าเข้าคลังสำเร็จ ตรงตามจำนวนที่สั่ง", en: "Goods received — quantity matches the order" },
      });
    },
    [products, pushAudit],
  );

  const attachDocument = useCallback(
    (orderNo: string, doc: Omit<AttachedDocument, "id" | "uploadedAt">, actor: Bilingual) => {
      const fullDoc: AttachedDocument = { ...doc, id: makeAuditId(), uploadedAt: new Date().toISOString() };
      setImportOrders((prev) =>
        prev.map((o) => (o.orderNo === orderNo ? { ...o, documents: [...(o.documents ?? []), fullDoc] } : o)),
      );
      pushAudit({
        entityType: "importOrder",
        entityId: orderNo,
        action: "updated",
        actor,
        summary: { th: `แนบเอกสาร: ${doc.name}`, en: `Attached document: ${doc.name}` },
      });
    },
    [pushAudit],
  );

  const removeDocument = useCallback((orderNo: string, docId: string) => {
    setImportOrders((prev) =>
      prev.map((o) => (o.orderNo === orderNo ? { ...o, documents: (o.documents ?? []).filter((d) => d.id !== docId) } : o)),
    );
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      products,
      importOrders,
      licenses,
      customers,
      salesOrders,
      inventory,
      auditLog,
      updateProduct,
      updateImportOrder,
      updateLicense,
      updateCustomer,
      updateSalesOrder,
      updateInventory,
      createSalesOrder,
      approveSalesOrder,
      rejectSalesOrderApproval,
      createImportOrder,
      correctImportOrderLines,
      approveImportOrder,
      rejectImportOrder,
      receiveGoods,
      attachDocument,
      removeDocument,
      resetDemoData,
    }),
    [
      products,
      importOrders,
      licenses,
      customers,
      salesOrders,
      inventory,
      auditLog,
      updateProduct,
      updateImportOrder,
      updateLicense,
      updateCustomer,
      updateSalesOrder,
      updateInventory,
      createSalesOrder,
      approveSalesOrder,
      rejectSalesOrderApproval,
      createImportOrder,
      correctImportOrderLines,
      approveImportOrder,
      rejectImportOrder,
      receiveGoods,
      attachDocument,
      removeDocument,
      resetDemoData,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
