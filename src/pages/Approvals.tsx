import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, X, ShieldAlert } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { formatCurrency } from "../lib/format";
import { HIGH_VALUE_APPROVAL_THRESHOLD } from "../lib/business";

const PENDING_STATUSES = new Set(["staging", "pendingApproval", "issueDetected"]);

export default function Approvals() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const location = useLocation();
  const highlightOrderNo = (location.state as { highlightOrderNo?: string } | null)?.highlightOrderNo;
  const { importOrders, salesOrders, customers, products, approveImportOrder, rejectImportOrder, approveSalesOrder, rejectSalesOrderApproval } = useData();
  const { identity, isSupervisor } = useRole();

  const [rejecting, setRejecting] = useState<{ kind: "import" | "sales"; orderNo: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const pendingImportOrders = useMemo(
    () => importOrders.filter((o) => PENDING_STATUSES.has(o.status)),
    [importOrders],
  );

  // FR-22: only orders actually waiting on a real supervisor decision — not a passive "awareness" list.
  const pendingSalesOrders = useMemo(() => {
    return salesOrders
      .filter((o) => o.approvalStatus === "pendingApproval")
      .map((o) => {
        const customerName = bi(o.customerName);
        const customer = customers.find((c) => bi(c.name) === customerName);
        return { order: o, standardDiscount: customer?.standardDiscount ?? 0 };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrders, customers, lang]);

  const handleApprove = (orderNo: string) => {
    approveImportOrder(orderNo, identity.name);
    showToast(`${t("approvals.approvedToast")}: ${orderNo}`);
  };

  const handleApproveSales = (orderNo: string) => {
    approveSalesOrder(orderNo, identity.name);
    showToast(`${t("approvals.approvedToast")}: ${orderNo}`);
  };

  const openReject = (kind: "import" | "sales", orderNo: string) => {
    setRejecting({ kind, orderNo });
    setRejectReason("");
  };

  const confirmReject = () => {
    if (!rejecting || !rejectReason.trim()) return;
    if (rejecting.kind === "import") rejectImportOrder(rejecting.orderNo, identity.name, rejectReason.trim());
    else rejectSalesOrderApproval(rejecting.orderNo, identity.name, rejectReason.trim());
    showToast(`${t("approvals.rejectedToast")}: ${rejecting.orderNo}`);
    setRejecting(null);
  };

  return (
    <div>
      <PageHeader title={t("approvals.title")} subtitle={t("approvals.subtitle")} />

      {!isSupervisor && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          <ShieldAlert size={16} />
          {t("approvals.restrictedBanner")}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("approvals.importSectionTitle")}</h2>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("importOrders.col.orderNo")}</th>
            <th className={th}>{t("importOrders.col.supplier")}</th>
            <th className={th}>{t("importOrders.col.totalValue")}</th>
            <th className={th}>{t("importOrders.col.status")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pendingImportOrders.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                {t("approvals.importEmpty")}
              </td>
            </tr>
          )}
          {pendingImportOrders.map((o) => {
            const isHighValue = o.totalValue > HIGH_VALUE_APPROVAL_THRESHOLD;
            const isSelfSecondApproval = Boolean(o.firstApprover && o.firstApprover.en === identity.name.en);
            const approveDisabled = !isSupervisor || o.status === "issueDetected" || isSelfSecondApproval;
            const approveTooltip = !isSupervisor
              ? t("approvals.supervisorOnlyNote")
              : o.status === "issueDetected"
                ? t("approvals.fixIssueFirst")
                : isSelfSecondApproval
                  ? t("approvals.needDifferentSupervisor")
                  : undefined;
            return (
              <tr key={o.orderNo} className={`hover:bg-gray-50/60 ${o.orderNo === highlightOrderNo ? "bg-indigo-50/40" : ""}`}>
                <td className={`${td} font-medium text-gray-900`}>
                  <Link to={`/import-orders/${o.orderNo}`} className="hover:underline">
                    {o.orderNo}
                  </Link>
                  {isHighValue && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                      {t("approvals.highValueBadge")}
                    </span>
                  )}
                </td>
                <td className={td}>{o.supplier}</td>
                <td className={td}>฿{formatCurrency(o.totalValue, lang)}</td>
                <td className={td}>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={o.status} />
                    {o.note && <span className="text-xs text-rose-500">{bi(o.note)}</span>}
                  </div>
                </td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(o.orderNo)}
                      disabled={approveDisabled}
                      title={approveTooltip}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                    >
                      <Check size={13} />
                      {t("approvals.approveButton")}
                    </button>
                    <button
                      onClick={() => openReject("import", o.orderNo)}
                      disabled={!isSupervisor}
                      title={!isSupervisor ? t("approvals.supervisorOnlyNote") : undefined}
                      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                    >
                      <X size={13} />
                      {t("approvals.rejectButton")}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableContainer>

      <h2 className="mb-1 mt-8 text-sm font-semibold text-gray-900">{t("approvals.salesSectionTitle")}</h2>
      <p className="mb-3 text-xs text-gray-400">{t("approvals.salesSectionNote")}</p>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("salesOrders.col.orderNo")}</th>
            <th className={th}>{t("salesOrders.col.customerName")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("approvals.reasonCol")}</th>
            <th className={th}>{t("salesOrders.col.discountPercent")}</th>
            <th className={th}>{t("customers.col.standardDiscount")}</th>
            <th className={th}>{t("salesOrders.col.netValue")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pendingSalesOrders.length === 0 && <EmptyRow colSpan={8} />}
          {pendingSalesOrders.map(({ order, standardDiscount }) => (
            <tr key={order.orderNo} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>
                <Link to={`/sales-orders/${order.orderNo}`} className="hover:underline">
                  {order.orderNo}
                </Link>
              </td>
              <td className={td}>{bi(order.customerName)}</td>
              <td className={td}>{products.find((p) => p.sku === order.sku)?.name ?? order.sku}</td>
              <td className={`${td} text-amber-600`}>{order.approvalReason ? bi(order.approvalReason) : "—"}</td>
              <td className={td}>
                <Masked>{order.discountPercent}%</Masked>
              </td>
              <td className={td}>
                <Masked>{standardDiscount}%</Masked>
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(order.netValue, lang)}</Masked>
              </td>
              <td className={td}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveSales(order.orderNo)}
                    disabled={!isSupervisor}
                    title={!isSupervisor ? t("approvals.supervisorOnlyNote") : undefined}
                    className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                  >
                    <Check size={13} />
                    {t("approvals.approveButton")}
                  </button>
                  <button
                    onClick={() => openReject("sales", order.orderNo)}
                    disabled={!isSupervisor}
                    title={!isSupervisor ? t("approvals.supervisorOnlyNote") : undefined}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                  >
                    <X size={13} />
                    {t("approvals.rejectButton")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      {rejecting && (
        <>
          <div className="fixed inset-0 z-30 bg-gray-900/30" onClick={() => setRejecting(null)} />
          <div className="fixed left-1/2 top-1/2 z-40 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">{t("approvals.rejectModalTitle")}</h3>
            <p className="mt-1 text-sm text-gray-500">{rejecting.orderNo}</p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">{t("approvals.rejectReasonLabel")}</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t("approvals.rejectReasonPlaceholder")}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmReject}
                disabled={!rejectReason.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {t("approvals.rejectConfirm")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
