import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Ship,
  FileBadge2,
  Users,
  ShoppingCart,
  Warehouse,
  Wine,
  Languages,
  ClipboardCheck,
  History,
  BarChart3,
  RotateCcw,
  UserCircle2,
  Menu,
  X,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { useBi } from "../lib/useBi";
import { computeLicenseStatus } from "../lib/business";

const NAV_ITEMS = [
  { to: "/", key: "dashboard", icon: LayoutDashboard, end: true },
  { to: "/products", key: "products", icon: Package },
  { to: "/import-orders", key: "importOrders", icon: Ship },
  { to: "/licenses", key: "licenses", icon: FileBadge2 },
  { to: "/customers", key: "customers", icon: Users },
  { to: "/sales-orders", key: "salesOrders", icon: ShoppingCart },
  { to: "/inventory", key: "inventory", icon: Warehouse },
  { to: "/reports", key: "reports", icon: BarChart3 },
  { to: "/approvals", key: "approvals", icon: ClipboardCheck },
  { to: "/audit-trail", key: "auditTrail", icon: History },
];

const PENDING_STATUSES = new Set(["staging", "pendingApproval", "issueDetected"]);

export function Layout() {
  const { t, lang, setLang } = useLanguage();
  const { importOrders, licenses, resetDemoData } = useData();
  const { identity, identities, setIdentityKey } = useRole();
  const bi = useBi();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pendingCount = importOrders.filter((o) => PENDING_STATUSES.has(o.status)).length;
  /** FR-07: surface expiring/expired licenses the moment the app loads, not only when browsing to the page. */
  const expiringLicenseCount = licenses.filter((l) => {
    const status = computeLicenseStatus(l.expiryDate).status;
    return status === "expiringSoon" || status === "expired";
  }).length;
  const navBadgeCount: Record<string, number> = { approvals: pendingCount, licenses: expiringLicenseCount };

  const handleReset = () => {
    if (window.confirm(t("common.resetConfirm"))) resetDemoData();
  };

  return (
    <div id="app-shell" className="flex min-h-screen bg-[#f4f5f7] print:bg-white">
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-gray-900/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out print:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Wine size={18} />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-gray-900">{t("common.appTitleShort")}</p>
              <p className="text-xs text-gray-400">v2.0 Demo</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <Icon size={17} />
              <span className="flex-1">{t(`nav.${key}`)}</span>
              {(navBadgeCount[key] ?? 0) > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
                  {navBadgeCount[key]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-gray-100 px-4 py-4">
          <p className="text-xs text-gray-400">{t("common.demoNotice")}</p>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            <RotateCcw size={12} />
            {t("common.resetDemo")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <p className="hidden text-sm text-gray-500 sm:block">{t("common.appTitle")}</p>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
              <UserCircle2 size={15} className="shrink-0 text-gray-400" />
              <select
                value={identity.key}
                onChange={(e) => setIdentityKey(e.target.value)}
                className="w-28 min-w-0 truncate bg-transparent text-sm font-medium text-gray-700 focus:outline-none sm:w-auto"
              >
                {identities.map((i) => (
                  <option key={i.key} value={i.key}>
                    {bi(i.name)}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setLang(lang === "th" ? "en" : "th")}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Languages size={15} />
              {lang === "th" ? "ไทย" : "EN"}
              <span className="text-gray-300">|</span>
              <span className="text-gray-400">{lang === "th" ? "EN" : "ไทย"}</span>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
