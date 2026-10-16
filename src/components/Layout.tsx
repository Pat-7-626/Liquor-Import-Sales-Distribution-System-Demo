import { Suspense, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Landmark,
  UserCog,
  KeyRound,
  CalendarDays,
  LayoutDashboard,
  Ship,
  ShoppingCart,
  Warehouse,
  Receipt,
  ChevronDown,
  Wine,
  ClipboardCheck,
  History,
  BarChart3,
  RotateCcw,
  Menu,
  X,
  LogOut,
  LogIn,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { ChangePasswordDialog } from "./ChangePassword";
import { NotificationBell } from "./NotificationBell";
import { useToast } from "./Toast";
import type { Permission } from "../data/types";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { useBi } from "../lib/useBi";
import { computeLicenseStatus, computeInboundBySku } from "../lib/business";

interface NavItem {
  to: string;
  key: string;
  end?: boolean;
  /** Shown only to roles with this permission. */
  perm?: Permission;
}
interface NavGroup {
  key: string;
  icon: LucideIcon;
  /** The module's dashboard — first link in the group. */
  overview: NavItem;
  transactions: NavItem[];
  master: NavItem[];
  /** Read-only outputs (statements, returns) — listed under their own heading. */
  reports?: NavItem[];
  /** Only for roles that may see prices and money. */
  sensitive?: boolean;
}

const TOP_ITEMS: (NavItem & { icon: LucideIcon })[] = [
  { to: "/", key: "dashboard", icon: LayoutDashboard, end: true },
  { to: "/approvals", key: "approvals", icon: ClipboardCheck },
  { to: "/calendar", key: "calendar", icon: CalendarDays },
];

/** ERP modules — each split into day-to-day transactions and the master data they run on. */
const NAV_GROUPS: NavGroup[] = [
  {
    key: "sales",
    icon: ShoppingCart,
    overview: { to: "/overview/sales", key: "overview" },
    transactions: [
      { to: "/quotations", key: "quotations" },
      { to: "/sales-orders", key: "salesOrders" },
      { to: "/receipts", key: "receipts" },
      { to: "/ar-aging", key: "arAging" },
    ],
    master: [
      { to: "/customers", key: "customers" },
      { to: "/price-lists", key: "priceLists" },
    ],
  },
  {
    key: "purchasing",
    icon: Ship,
    overview: { to: "/overview/purchasing", key: "overview" },
    transactions: [
      { to: "/purchase-requests", key: "purchaseRequests" },
      { to: "/import-orders", key: "importOrders" },
      { to: "/goods-receipts", key: "goodsReceipts" },
      { to: "/payables", key: "payables" },
    ],
    master: [
      { to: "/suppliers", key: "suppliers" },
      { to: "/licenses", key: "licenses" },
      { to: "/exchange-rates", key: "exchangeRates" },
    ],
  },
  {
    key: "inventory",
    icon: Warehouse,
    overview: { to: "/overview/inventory", key: "overview" },
    transactions: [
      { to: "/inventory", key: "inventory" },
      { to: "/stock-movements", key: "stockMovements" },
      { to: "/stock-counts", key: "stockCounts" },
      { to: "/stock-alerts", key: "stockAlerts" },
      { to: "/lot-trace", key: "lotTrace" },
    ],
    master: [
      { to: "/products", key: "products" },
      { to: "/warehouses", key: "warehouses" },
      { to: "/reorder-policies", key: "reorderPolicies" },
    ],
  },
  {
    key: "tax",
    icon: Receipt,
    overview: { to: "/overview/tax", key: "overview" },
    transactions: [],
    master: [
      { to: "/tax-rates", key: "taxRates" },
      { to: "/company", key: "company" },
    ],
    reports: [
      { to: "/tax/vat-return", key: "vatReturn" },
      { to: "/tax/withholding", key: "withholding" },
    ],
  },
  {
    key: "accounting",
    icon: Landmark,
    sensitive: true,
    overview: { to: "/accounting", key: "overview", end: true },
    transactions: [
      { to: "/expenses", key: "expenses" },
      { to: "/accounting/manual-journals", key: "manualJournals" },
      { to: "/accounting/bank", key: "bankReconciliation" },
      { to: "/accounting/closing", key: "periodClosing" },
      { to: "/accounting/journal", key: "journal" },
    ],
    master: [],
    reports: [
      { to: "/accounting/trial-balance", key: "trialBalance" },
      { to: "/accounting/profit-loss", key: "profitLoss" },
      { to: "/accounting/balance-sheet", key: "balanceSheet" },
    ],
  },
];

const BOTTOM_ITEMS: (NavItem & { icon: LucideIcon })[] = [
  { to: "/reports", key: "reports", icon: BarChart3 },
  { to: "/audit-trail", key: "auditTrail", icon: History },
  { to: "/users", key: "users", icon: UserCog, perm: "viewUsers" },
];

const NAV_STORAGE_KEY = "lisd-nav-open";

function loadOpenGroups(): string[] {
  try {
    const raw = window.localStorage.getItem(NAV_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : ["sales", "purchasing", "inventory"];
  } catch {
    return ["sales", "purchasing", "inventory"];
  }
}

const PENDING_STATUSES = new Set(["staging", "pendingApproval", "issueDetected"]);

export function Layout() {
  const { t, lang, setLang } = useLanguage();
  const { importOrders, salesOrders, licenses, products, reorderPolicies, purchaseRequests, resetDemoData } = useData();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<string[]>(loadOpenGroups);
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  const isActivePath = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const { identity, identities, setIdentityKey, demoMode, signOut, isGuest, can, canViewSensitive } = useRole();
  const [changingPassword, setChangingPassword] = useState(false);
  const toast = useToast();
  const bottomItems = BOTTOM_ITEMS.filter((i) => !i.perm || can(i.perm));
  const bi = useBi();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pendingCount =
    importOrders.filter((o) => PENDING_STATUSES.has(o.status)).length +
    salesOrders.filter((o) => o.approvalStatus === "pendingApproval").length +
    purchaseRequests.filter((r) => r.status === "pending").length;
  /** FR-07: surface expiring/expired licenses the moment the app loads, not only when browsing to the page. */
  const expiringLicenseCount = licenses.filter((l) => {
    const status = computeLicenseStatus(l.expiryDate).status;
    return status === "expiringSoon" || status === "expired";
  }).length;
  const reorderCount = useMemo(() => {
    const inbound = computeInboundBySku(importOrders);
    return products.filter((p) => {
      const policy = reorderPolicies.find((r) => r.sku === p.sku);
      return policy && p.stockAvailable + (inbound.get(p.sku) ?? 0) <= policy.reorderPoint;
    }).length;
  }, [products, reorderPolicies, importOrders]);
  const navBadgeCount: Record<string, number> = { approvals: pendingCount, licenses: expiringLicenseCount, stockAlerts: reorderCount };

  const badge = (key: string) =>
    (navBadgeCount[key] ?? 0) > 0 && (
      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-indigo-500 px-1.5 text-xs font-semibold tabular-nums text-white">
        {navBadgeCount[key]}
      </span>
    );

  const topLink = ({ to, key, icon: Icon, end }: NavItem & { icon: LucideIcon }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-white/[0.08] text-white" : "text-gray-200 hover:bg-white/[0.05] hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" />}
          <Icon size={16} strokeWidth={1.75} className={isActive ? "text-gold-300" : "text-gray-300 group-hover:text-gray-100"} />
          <span className="flex-1">{t(`nav.${key}`)}</span>
          {badge(key)}
        </>
      )}
    </NavLink>
  );

  const subLink = ({ to, key, end }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `relative flex items-center gap-2 rounded-md py-1.5 pl-10 pr-3 text-sm transition-colors ${
          isActive ? "bg-white/[0.08] font-medium text-white" : "text-gray-300 hover:bg-white/[0.05] hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" />}
          <span className="flex-1">{t(`nav.${key}`)}</span>
          {badge(key)}
        </>
      )}
    </NavLink>
  );

  const handleReset = async () => {
    if (window.confirm(t("common.resetConfirm"))) await resetDemoData();
  };

  // Breadcrumb for the header: module › page (or just the page for top-level items).
  const crumbs = useMemo(() => {
    const all = [...TOP_ITEMS, ...bottomItems];
    const top = all.find((i) => (i.end ? location.pathname === i.to : isActivePath(i.to)));
    if (top) return [t(`nav.${top.key}`)];
    for (const g of NAV_GROUPS) {
      const item = [...g.transactions, ...g.master, ...(g.reports ?? []), g.overview].find((i) => (i.end ? location.pathname === i.to : isActivePath(i.to)));
      if (item) return [t(`nav.group.${g.key}`), t(`nav.${item.key}`)];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, lang]);

  const initials = identity.name.en
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <div id="app-shell" className="flex min-h-screen bg-canvas print:bg-white">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-ink-950/50 backdrop-blur-[2px] lg:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink-900 lg:z-20 bg-gradient-to-b from-ink-900 to-ink-950 transition-transform duration-200 ease-in-out print:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-gold-400 ring-1 ring-gold-400/30 ring-inset">
              <Wine size={18} strokeWidth={1.75} />
            </span>
            <div className="leading-tight">
              <p className="font-display text-[17px] font-semibold tracking-wide text-gold-100">{t("common.appTitleShort")}</p>
              <p className="mt-0.5 whitespace-nowrap text-xs font-medium text-gold-400">Import · Trade · Cellar</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 text-gray-300 hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-gold-400/0 via-gold-400/30 to-gold-400/0" />

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 [scrollbar-color:var(--color-ink-700)_transparent]" aria-label={t("common.appTitleShort")}>
          {TOP_ITEMS.map(topLink)}

          {NAV_GROUPS.filter((g) => !g.sensitive || canViewSensitive).map((g) => {
            const items = [g.overview, ...g.transactions, ...g.master, ...(g.reports ?? [])];
            const containsActive = items.some((i) => isActivePath(i.to));
            const open = containsActive || openGroups.includes(g.key);
            const groupBadge = items.reduce((sum, i) => sum + (navBadgeCount[i.key] ?? 0), 0);
            const Icon = g.icon;
            return (
              <div key={g.key} className="pt-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={open}
                  className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/[0.04] ${
                    containsActive ? "text-white" : "text-gray-200"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} className={containsActive ? "text-gold-300" : "text-gray-300 group-hover:text-gray-100"} />
                  <span className="flex-1 text-left">{t(`nav.group.${g.key}`)}</span>
                  {!open && groupBadge > 0 && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />}
                  <ChevronDown size={14} className={`text-gray-300 transition-transform ${open ? "" : "-rotate-90"}`} />
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5">
                    {subLink(g.overview)}
                    {g.transactions.length > 0 && (
                      <p className="pb-1 pl-10 pt-2.5 text-xs font-semibold text-gold-400">{t("nav.transactions")}</p>
                    )}
                    {g.transactions.map(subLink)}
                    {g.master.length > 0 && <p className="pb-1 pl-10 pt-2.5 text-xs font-semibold text-gold-400">{t("nav.masterData")}</p>}
                    {g.master.map(subLink)}
                    {g.reports && g.reports.length > 0 && (
                      <p className="pb-1 pl-10 pt-2.5 text-xs font-semibold text-gold-400">{t("nav.statements")}</p>
                    )}
                    {g.reports?.map(subLink)}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-4 border-t border-white/[0.06] pt-4">{bottomItems.map(topLink)}</div>
        </nav>

        <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-5 py-4">
          <p className="text-xs leading-relaxed text-gray-300">{isGuest ? t("auth.guestHint") : demoMode ? t("common.demoNotice") : t("auth.liveNotice")}</p>
          {demoMode && !isGuest && (
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-medium text-gray-300 transition-colors hover:text-gold-300">
            <RotateCcw size={11} />
            {t("common.resetDemo")}
          </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-gray-200/70 bg-canvas/80 px-4 backdrop-blur-md sm:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Menu"
              className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
              {crumbs.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-2">
                  {i > 0 && <span className="text-gray-400">/</span>}
                  <span className={`truncate ${i === crumbs.length - 1 ? "font-medium text-gray-800" : "text-gray-500"}`}>{c}</span>
                </span>
              ))}
            </nav>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2.5">
            <label className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 shadow-sm transition-colors hover:border-gray-300">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold tracking-wide text-gold-300">
                {initials}
              </span>
              {demoMode && !isGuest ? (
                // Demo deployments: act as any seeded user without signing out (server-side "switch").
                <select
                  value={identity.key}
                  onChange={(e) => void setIdentityKey(e.target.value)}
                  aria-label={t("auth.switchUser")}
                  className="w-24 min-w-0 cursor-pointer truncate bg-transparent text-sm font-medium text-gray-800 focus:outline-none sm:w-auto"
                >
                  {identities.map((i) => (
                    <option key={i.key} value={i.key}>
                      {bi(i.name)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="max-w-48 truncate text-sm font-medium text-gray-800">{bi(identity.name)}</span>
              )}
            </label>
            {!isGuest && <NotificationBell />}
            {isGuest ? (
              // A guest "signs out" straight to the sign-in page — that's the way to start making changes.
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
              >
                <LogIn size={14} />
                {t("auth.signIn")}
              </button>
            ) : (
              <>
              <button
                type="button"
                onClick={() => setChangingPassword(true)}
                title={t("password.title")}
                aria-label={t("password.title")}
                data-testid="change-password"
                className="rounded-full border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
              >
                <KeyRound size={15} />
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                title={t("auth.signOut")}
                aria-label={t("auth.signOut")}
                className="rounded-full border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
              >
                <LogOut size={15} />
              </button>
              </>
            )}
            <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} onChanged={() => toast(t("password.changedToast"))} />

            <div role="group" aria-label={t("common.language")} className="flex shrink-0 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
              {(["th", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`rounded-full px-2.5 py-1 text-sm font-medium transition-colors ${
                    lang === l ? "bg-ink-900 text-gold-100" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {l === "th" ? "ไทย" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {isGuest && (
          <div role="status" className="flex items-center justify-center gap-2 border-b border-gold-300/50 bg-gold-100/70 px-4 py-2 text-center text-sm text-gray-700 print:hidden">
            <Eye size={15} className="shrink-0 text-gold-600" />
            {t("auth.guestBanner")}
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <div key={location.pathname} className="page-in mx-auto w-full max-w-[1480px]">
            {/* Pages are lazy-loaded — keep the shell on screen while one loads. */}
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
