import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, ShoppingBag } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { TableContainer, th, td } from "../components/Table";
import { formatDate, formatNumber } from "../lib/format";
import { computeInboundBySku, computeInventoryAge } from "../lib/business";
import { useWarehouseName } from "../lib/useWarehouseName";
import { RecordLink } from "../components/RecordLink";

const NEAR_FULL_RATIO = 0.9;

export default function StockAlerts() {
  const { t, lang } = useLanguage();
  const { can } = useRole();
  const warehouseName = useWarehouseName();
  const { products, reorderPolicies, importOrders, inventory, suppliers, warehouses, purchaseRequests } = useData();

  const reorder = useMemo(() => {
    const inbound = computeInboundBySku(importOrders);
    return products
      .map((p) => {
        const policy = reorderPolicies.find((r) => r.sku === p.sku);
        const inb = inbound.get(p.sku) ?? 0;
        const projected = p.stockAvailable + inb;
        if (!policy || projected > policy.reorderPoint) return null;
        // Order at least the standard quantity, more if that still wouldn't lift stock above the reorder point.
        const suggestedQty = Math.max(policy.reorderQty, policy.reorderPoint - projected + 1);
        return { product: p, policy, inbound: inb, projected, suggestedQty, supplier: suppliers.find((s) => s.supplierId === policy.preferredSupplierId) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.projected / Math.max(1, a.policy.reorderPoint) - b.projected / Math.max(1, b.policy.reorderPoint));
  }, [products, reorderPolicies, importOrders, suppliers]);

  const aging = useMemo(
    () =>
      inventory
        .filter((i) => i.quantityRemaining > 0)
        .map((i) => ({ ...i, ...computeInventoryAge(i.receivedDate) }))
        .filter((i) => i.status !== "normal")
        .sort((a, b) => b.ageDays - a.ageDays),
    [inventory],
  );

  const fullWarehouses = useMemo(
    () =>
      warehouses
        .filter((w) => w.active)
        .map((w) => ({ ...w, units: inventory.filter((i) => i.warehouse === w.code).reduce((s, i) => s + i.quantityRemaining, 0) }))
        .filter((w) => w.units >= w.capacity * NEAR_FULL_RATIO),
    [warehouses, inventory],
  );

  return (
    <div>
      <PageHeader title={t("erp.page.stockAlerts")} subtitle={t("erp.page.stockAlertsSub")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("erp.belowReorderPoint"), value: reorder.length, tone: reorder.length ? "text-rose-600" : "text-gray-900" },
          { label: t("erp.agingLots"), value: aging.length, tone: aging.length ? "text-amber-600" : "text-gray-900" },
          { label: t("erp.warehousesNearFull"), value: fullWarehouses.length, tone: fullWarehouses.length ? "text-amber-600" : "text-gray-900" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-1 text-sm font-semibold text-gray-900">{t("erp.reorderSuggestions")}</h2>
      <p className="mb-3 text-xs text-gray-400">{t("erp.reorderSuggestionsNote")}</p>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("products.col.sku")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("products.col.stockAvailable")}</th>
            <th className={th}>{t("erp.inbound")}</th>
            <th className={th}>{t("erp.reorderPoint")}</th>
            <th className={th}>{t("erp.suggestedQty")}</th>
            <th className={th}>{t("erp.preferredSupplier")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {reorder.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                {t("erp.nothingToReorder")}
              </td>
            </tr>
          )}
          {reorder.map((r) => (
            <tr key={r.product.sku} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>{r.product.sku}</td>
              <td className={td}>{r.product.name}</td>
              <td className={`${td} font-medium ${r.product.stockAvailable === 0 ? "text-rose-600" : "text-amber-600"}`}>
                {formatNumber(r.product.stockAvailable, lang, 0)}
              </td>
              <td className={td}>{r.inbound > 0 ? `+${formatNumber(r.inbound, lang, 0)}` : <span className="text-gray-400">0</span>}</td>
              <td className={td}>{formatNumber(r.policy.reorderPoint, lang, 0)}</td>
              <td className={`${td} font-medium text-gray-900`}>{formatNumber(r.suggestedQty, lang, 0)}</td>
              <td className={td}>{r.supplier?.name ?? <span className="text-gray-400">{t("erp.noPreferredSupplier")}</span>}</td>
              <td className={`${td} space-y-1`}>
                {(() => {
                  // Anyone who can ask for stock: a request a supervisor approves before purchasing orders it.
                  const open = purchaseRequests.find((x) => x.sku === r.product.sku && (x.status === "pending" || x.status === "approved"));
                  if (open)
                    return (
                      <Link to="/purchase-requests" className="block text-xs font-medium text-gray-500 hover:text-indigo-600">
                        {t("pr.openRequest").replace("{no}", open.requestNo)}
                      </Link>
                    );
                  return can("requestPurchase") ? (
                    <Link
                      to={`/purchase-requests?sku=${r.product.sku}&qty=${r.suggestedQty}`}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      data-testid={`request-${r.product.sku}`}
                    >
                      <ClipboardList size={13} />
                      {t("pr.request")}
                    </Link>
                  ) : null;
                })()}
                {can("createImportOrder") && r.supplier?.active ? (
                  <Link
                    to={`/import-orders/new?supplierId=${r.supplier.supplierId}&sku=${r.product.sku}&qty=${r.suggestedQty}`}
                    title={t("erp.createImportOrderHint")}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    <ShoppingBag size={13} />
                    {t("erp.createImportOrder")}
                  </Link>
                ) : (
                  <span className="text-xs text-gray-400">{can("createImportOrder") ? t("erp.setSupplierFirst") : t("erp.noPermission")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-900">{t("erp.agingLots")}</h2>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("inventory.col.lotBatch")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("inventory.col.receivedDate")}</th>
            <th className={th}>{t("inventory.col.ageDays")}</th>
            <th className={th}>{t("inventory.col.quantityRemaining")}</th>
            <th className={th}>{t("inventory.col.warehouse")}</th>
            <th className={th}>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {aging.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                {t("erp.nothingNeedsAttention")}
              </td>
            </tr>
          )}
          {aging.map((i) => (
            <tr key={i.lotBatch} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium`}>
                <RecordLink to={`/lot-trace?lot=${encodeURIComponent(i.lotBatch)}`}>
                  {i.lotBatch}
                </RecordLink>
              </td>
              <td className={td}>{i.productName}</td>
              <td className={td}>{formatDate(i.receivedDate, lang)}</td>
              <td className={td}>{i.ageDays}</td>
              <td className={td}>{formatNumber(i.quantityRemaining, lang, 0)}</td>
              <td className={td}>{warehouseName(i.warehouse)}</td>
              <td className={td}>
                <StatusBadge status={i.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      {fullWarehouses.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-900">{t("erp.warehousesNearFull")}</h2>
          <ul className="space-y-2">
            {fullWarehouses.map((w) => (
              <li key={w.code} className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                {warehouseName(w.code)} — {formatNumber(w.units, lang, 0)} / {formatNumber(w.capacity, lang, 0)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
