import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CalendarClock, ClipboardCheck, ClipboardList, FileInput, FileText, Landmark, Package, Receipt, Ship, Truck, Wallet, type LucideIcon } from "lucide-react";
import { computeNotices, type Notice, type NoticeKey } from "../domain/notices";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { todayIso } from "../lib/business";

const ICONS: Record<NoticeKey, LucideIcon> = {
  approvals: ClipboardCheck,
  purchaseRequests: ClipboardList,
  requestsToOrder: ClipboardList,
  quotesExpiring: FileText,
  withholdingDue: Landmark,
  bankUnmatched: Landmark,
  lateDeliveries: Truck,
  lateArrivals: Ship,
  overdueReceivables: Wallet,
  payablesDue: Receipt,
  awaitingInvoice: FileInput,
  licenses: CalendarClock,
  reorder: Package,
};

/** The same rules the morning email uses — computed from the data, nothing stored. */
function useNotices(): Notice[] {
  const { can, canViewSensitive } = useRole();
  const data = useData();
  const { salesOrders, importOrders, licenses, customers, arDocuments, apDocuments, products, reorderPolicies, purchaseRequests, expenses, manualJournals, quotations, bankLines } = data;
  return useMemo(
    () =>
      computeNotices(
        { salesOrders, importOrders, licenses, customers, arDocuments, apDocuments, products, reorderPolicies, purchaseRequests, expenses, manualJournals, quotations, bankLines },
        can,
        canViewSensitive,
        todayIso(),
      ),
    [can, canViewSensitive, salesOrders, importOrders, licenses, customers, arDocuments, apDocuments, products, reorderPolicies, purchaseRequests, expenses, manualJournals, quotations, bankLines],
  );
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
                const Icon = ICONS[n.key];
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
