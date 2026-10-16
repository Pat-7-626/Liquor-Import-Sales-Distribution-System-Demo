import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CalendarClock, ClipboardCheck, ClipboardList, FileInput, FileText, Landmark, Package, Receipt, Ship, Truck, Wallet, type LucideIcon } from "lucide-react";
import { withholdingByMonth } from "../domain/finance";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { addDays, computeArOpenItems, computeInboundBySku, computeLicenseStatus, importStage, isBookedSale, todayIso } from "../lib/business";
import { apOpenAmount } from "../domain/actions";

interface Notice {
  key: string;
  count: number;
  icon: LucideIcon;
  tone: "red" | "amber" | "blue";
  href: string;
  /** Translation key; "{n}" is replaced with the count. */
  label: string;
}

/**
 * What needs this person's attention, by role: each item is a count of things waiting on them, linking to
 * where they're dealt with. The same rules the module pages use — computed from the data, nothing stored.
 */
function useNotices(): Notice[] {
  const { can, canViewSensitive } = useRole();
  const { salesOrders, importOrders, licenses, customers, arDocuments, apDocuments, products, reorderPolicies, purchaseRequests, expenses, manualJournals, quotations, bankLines } = useData();
  return useMemo(() => {
    const today = todayIso();
    const out: Notice[] = [];
    const push = (n: Notice) => n.count > 0 && out.push(n);

    if (can("approve")) {
      const sales = salesOrders.filter((o) => o.approvalStatus === "pendingApproval").length;
      const imports = importOrders.filter((o) => o.status === "pendingApproval" || o.status === "staging").length;
      push({ key: "approvals", count: sales + imports, icon: ClipboardCheck, tone: "amber", href: "/approvals", label: "notify.approvals" });
      push({ key: "purchaseRequests", count: purchaseRequests.filter((r) => r.status === "pending").length, icon: ClipboardList, tone: "amber", href: "/approvals", label: "notify.purchaseRequests" });
    }
    if (can("createImportOrder"))
      push({ key: "requestsToOrder", count: purchaseRequests.filter((r) => r.status === "approved").length, icon: ClipboardList, tone: "blue", href: "/purchase-requests", label: "notify.requestsToOrder" });
    if (can("createSalesOrder"))
      push({
        key: "quotesExpiring",
        count: quotations.filter((q) => q.status === "open" && q.validUntil >= today && q.validUntil <= addDays(today, 3)).length,
        icon: FileText,
        tone: "amber",
        href: "/quotations",
        label: "notify.quotesExpiring",
      });
    if (can("manageExpenses") && canViewSensitive) {
      // Withholding for a finished month is due by the 7th of the next one.
      const due = withholdingByMonth(expenses, manualJournals).filter((m) => m.outstanding > 0 && m.month < today.slice(0, 7)).length;
      push({ key: "withholdingDue", count: due, icon: Landmark, tone: "red", href: "/tax/withholding", label: "notify.withholdingDue" });
    }
    if (can("reconcileBank"))
      push({ key: "bankUnmatched", count: bankLines.filter((l) => !l.matchedEntryId).length, icon: Landmark, tone: "blue", href: "/accounting/bank", label: "notify.bankUnmatched" });
    if (can("updateDelivery"))
      push({
        key: "lateDeliveries",
        count: salesOrders.filter((o) => isBookedSale(o) && ["pendingShipment", "inDelivery"].includes(o.deliveryStatus) && o.plannedDeliveryDate && o.plannedDeliveryDate < today).length,
        icon: Truck,
        tone: "red",
        href: "/sales-orders",
        label: "notify.lateDeliveries",
      });
    if (can("receiveGoods") || can("createImportOrder") || can("recordCustomsClearance"))
      push({
        key: "lateArrivals",
        count: importOrders.filter((o) => !["receivedWarehouse", "rejected"].includes(importStage(o)) && o.etaDate < today).length,
        icon: Ship,
        tone: "red",
        href: "/import-orders",
        label: "notify.lateArrivals",
      });
    if (can("recordPayment") && canViewSensitive) {
      const overdue = customers.flatMap((c) => computeArOpenItems(c, salesOrders, arDocuments)).filter((i) => i.dueDate < today).length;
      push({ key: "overdueReceivables", count: overdue, icon: Wallet, tone: "red", href: "/ar-aging", label: "notify.overdueReceivables" });
    }
    if (can("managePayables")) {
      const soon = apDocuments.filter((d) => d.type === "invoice" && apOpenAmount(apDocuments, d.docNo) > 0.005 && (d.dueDate ?? d.date) <= addDays(today, 7)).length;
      push({ key: "payablesDue", count: soon, icon: Receipt, tone: "amber", href: "/payables", label: "notify.payablesDue" });
      const toInvoice = importOrders.filter((o) => o.status === "receivedWarehouse" && !apDocuments.some((d) => d.type === "invoice" && d.importOrderNo === o.orderNo)).length;
      push({ key: "awaitingInvoice", count: toInvoice, icon: FileInput, tone: "blue", href: "/payables", label: "notify.awaitingInvoice" });
    }
    if (can("editLicense"))
      push({
        key: "licenses",
        count: licenses.filter((l) => computeLicenseStatus(l.expiryDate).status !== "normal").length,
        icon: CalendarClock,
        tone: "amber",
        href: "/licenses",
        label: "notify.licenses",
      });
    if (can("manageReorder") || can("createImportOrder")) {
      const inbound = computeInboundBySku(importOrders);
      const low = products.filter((p) => {
        const policy = reorderPolicies.find((r) => r.sku === p.sku);
        return policy && p.stockAvailable + (inbound.get(p.sku) ?? 0) <= policy.reorderPoint;
      }).length;
      push({ key: "reorder", count: low, icon: Package, tone: "amber", href: "/stock-alerts", label: "notify.reorder" });
    }
    return out;
  }, [can, canViewSensitive, salesOrders, importOrders, licenses, customers, arDocuments, apDocuments, products, reorderPolicies, purchaseRequests, expenses, manualJournals, quotations, bankLines]);
}

const DOT = { red: "bg-rose-600", amber: "bg-amber-500", blue: "bg-blue-600" };
const ICON = { red: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700" };

/** Header bell: count of items not yet looked at; opening the list marks them seen (until their count changes). */
export function NotificationBell() {
  const { t } = useLanguage();
  const { identity } = useRole();
  const notices = useNotices();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const storageKey = `lisd-seen-${identity.key}`;
  const readSeen = (): Record<string, number> => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  };
  const [seen, setSeen] = useState<Record<string, number>>(readSeen);
  // Something is "new" when its count isn't the one last seen — a new late delivery shows up again.
  const unseen = notices.filter((n) => seen[n.key] !== n.count).length;

  useEffect(() => {
    setSeen(readSeen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const marked = Object.fromEntries(notices.map((n) => [n.key, n.count]));
      setSeen(marked);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(marked));
      } catch {
        /* private mode: the badge just won't remember */
      }
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t("notify.title")}${unseen ? ` (${unseen})` : ""}`}
        title={t("notify.title")}
        data-testid="notifications"
        className="relative rounded-full border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
      >
        <Bell size={15} />
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white" data-testid="notifications-badge">
            {unseen}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <p className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">{t("notify.title")}</p>
          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">{t("notify.empty")}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {notices.map((n) => {
                const Icon = n.icon;
                return (
                  <li key={n.key}>
                    <Link to={n.href} onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50" data-testid={`notice-${n.key}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON[n.tone]}`}>
                        <Icon size={15} />
                      </span>
                      <span className="flex-1 text-sm text-gray-800">{t(n.label).replace("{n}", String(n.count))}</span>
                      <span className={`h-2 w-2 rounded-full ${DOT[n.tone]}`} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
