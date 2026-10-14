import { useMemo } from "react";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { computeArOpenItems, isBookedSale, isReversedSale } from "./business";
import type { PaymentInfo } from "./flows";

/**
 * Per invoiced order: how much is still open and when it's due. Built from each customer's open items
 * (payments settle the oldest-due invoices first), so "paid" here means what receivables says it means.
 * Null without price access — amounts arrive masked, and guessing would show unpaid invoices as paid.
 */
export function useInvoiceStatus(): Map<string, PaymentInfo> | null {
  const { customers, salesOrders, arDocuments } = useData();
  const { canViewSensitive } = useRole();
  return useMemo(() => {
    if (!canViewSensitive) return null;
    const open = new Map<string, number>();
    for (const c of customers) for (const i of computeArOpenItems(c, salesOrders, arDocuments)) if (i.orderNo) open.set(i.orderNo, i.open);
    const map = new Map<string, PaymentInfo>();
    for (const o of salesOrders) {
      if (!isBookedSale(o) || isReversedSale(o) || !o.dueDate) continue;
      map.set(o.orderNo, { open: open.get(o.orderNo) ?? 0, dueDate: o.dueDate });
    }
    return map;
  }, [customers, salesOrders, arDocuments, canViewSensitive]);
}
