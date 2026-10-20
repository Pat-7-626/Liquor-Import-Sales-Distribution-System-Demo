/**
 * What needs a person's attention, by role: each notice is a count of things waiting on them and where
 * they're dealt with. Shared by the header bell and the morning email, so both always agree.
 */
import type { ApDocument, ArDocument, BankLine, Customer, Expense, ImportOrder, License, ManualJournal, Permission, Product, PurchaseRequest, Quotation, ReorderPolicy, SalesOrder } from "../data/types";
import { addDays, computeArOpenItems, computeInboundBySku, computeLicenseStatus, importStage, isBookedSale } from "../lib/business";
import { withholdingByMonth } from "./finance";
import { apOpenAmount } from "./actions";

export type NoticeKey =
  | "approvals"
  | "purchaseRequests"
  | "requestsToOrder"
  | "quotesExpiring"
  | "withholdingDue"
  | "bankUnmatched"
  | "lateDeliveries"
  | "lateArrivals"
  | "overdueReceivables"
  | "payablesDue"
  | "awaitingInvoice"
  | "licenses"
  | "reorder";

export interface Notice {
  key: NoticeKey;
  count: number;
  tone: "red" | "amber" | "blue";
  href: string;
  /** Translation key; "{n}" is replaced with the count. */
  label: string;
}

export interface NoticeData {
  salesOrders: SalesOrder[];
  importOrders: ImportOrder[];
  licenses: License[];
  customers: Customer[];
  arDocuments: ArDocument[];
  apDocuments: ApDocument[];
  products: Product[];
  reorderPolicies: ReorderPolicy[];
  purchaseRequests: PurchaseRequest[];
  expenses: Expense[];
  manualJournals: ManualJournal[];
  quotations: Quotation[];
  bankLines: BankLine[];
}

export function computeNotices(d: NoticeData, can: (p: Permission) => boolean, canViewSensitive: boolean, today: string): Notice[] {
  const out: Notice[] = [];
  const push = (n: Notice) => n.count > 0 && out.push(n);

  if (can("approve")) {
    const sales = d.salesOrders.filter((o) => o.approvalStatus === "pendingApproval").length;
    const imports = d.importOrders.filter((o) => o.status === "pendingApproval" || o.status === "staging").length;
    push({ key: "approvals", count: sales + imports, tone: "amber", href: "/approvals", label: "notify.approvals" });
    push({ key: "purchaseRequests", count: d.purchaseRequests.filter((r) => r.status === "pending").length, tone: "amber", href: "/approvals", label: "notify.purchaseRequests" });
  }
  if (can("createImportOrder"))
    push({ key: "requestsToOrder", count: d.purchaseRequests.filter((r) => r.status === "approved").length, tone: "blue", href: "/purchase-requests", label: "notify.requestsToOrder" });
  if (can("createSalesOrder"))
    push({
      key: "quotesExpiring",
      count: d.quotations.filter((q) => q.status === "open" && q.validUntil >= today && q.validUntil <= addDays(today, 3)).length,
      tone: "amber",
      href: "/quotations",
      label: "notify.quotesExpiring",
    });
  if (can("manageExpenses") && canViewSensitive) {
    // Withholding for a finished month is due by the 7th of the next one.
    const due = withholdingByMonth(d.expenses, d.manualJournals).filter((m) => m.outstanding > 0 && m.month < today.slice(0, 7)).length;
    push({ key: "withholdingDue", count: due, tone: "red", href: "/tax/withholding", label: "notify.withholdingDue" });
  }
  if (can("reconcileBank"))
    push({ key: "bankUnmatched", count: d.bankLines.filter((l) => !l.matchedEntryId).length, tone: "blue", href: "/accounting/bank", label: "notify.bankUnmatched" });
  if (can("updateDelivery"))
    push({
      key: "lateDeliveries",
      count: d.salesOrders.filter((o) => isBookedSale(o) && ["pendingShipment", "inDelivery"].includes(o.deliveryStatus) && o.plannedDeliveryDate && o.plannedDeliveryDate < today).length,
      tone: "red",
      href: "/sales-orders",
      label: "notify.lateDeliveries",
    });
  if (can("receiveGoods") || can("createImportOrder") || can("recordCustomsClearance"))
    push({
      key: "lateArrivals",
      count: d.importOrders.filter((o) => !["receivedWarehouse", "rejected"].includes(importStage(o)) && o.etaDate < today).length,
      tone: "red",
      href: "/import-orders",
      label: "notify.lateArrivals",
    });
  if (can("recordPayment") && canViewSensitive) {
    const overdue = d.customers.flatMap((c) => computeArOpenItems(c, d.salesOrders, d.arDocuments)).filter((i) => i.dueDate < today).length;
    push({ key: "overdueReceivables", count: overdue, tone: "red", href: "/ar-aging", label: "notify.overdueReceivables" });
  }
  if (can("managePayables")) {
    const soon = d.apDocuments.filter((x) => x.type === "invoice" && apOpenAmount(d.apDocuments, x.docNo) > 0.005 && (x.dueDate ?? x.date) <= addDays(today, 7)).length;
    push({ key: "payablesDue", count: soon, tone: "amber", href: "/payables", label: "notify.payablesDue" });
    const toInvoice = d.importOrders.filter((o) => o.status === "receivedWarehouse" && !d.apDocuments.some((x) => x.type === "invoice" && x.importOrderNo === o.orderNo)).length;
    push({ key: "awaitingInvoice", count: toInvoice, tone: "blue", href: "/payables", label: "notify.awaitingInvoice" });
  }
  if (can("editLicense"))
    push({
      key: "licenses",
      count: d.licenses.filter((l) => computeLicenseStatus(l.expiryDate).status !== "normal").length,
      tone: "amber",
      href: "/licenses",
      label: "notify.licenses",
    });
  if (can("manageReorder") || can("createImportOrder")) {
    const inbound = computeInboundBySku(d.importOrders);
    const low = d.products.filter((p) => {
      const policy = d.reorderPolicies.find((r) => r.sku === p.sku);
      return policy && p.stockAvailable + (inbound.get(p.sku) ?? 0) <= policy.reorderPoint;
    }).length;
    push({ key: "reorder", count: low, tone: "amber", href: "/stock-alerts", label: "notify.reorder" });
  }
  return out;
}
