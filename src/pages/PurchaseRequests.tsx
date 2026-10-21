import { useState } from "react";
import { both } from "../i18n/translations";
import { hasText, noText } from "../lib/text";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ShoppingBag, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { NewButton } from "../components/NewButton";
import { Dialog, DialogActions } from "../components/Dialog";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { FieldLabel, TextPair, inputClass, selectClass } from "../components/FormKit";
import { useRunAction } from "../lib/useRunAction";
import { formatDate, formatNumber } from "../lib/format";
import type { PurchaseRequest } from "../data/types";
import { RecordLink } from "../components/RecordLink";

const TONE: Record<PurchaseRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  approved: "bg-blue-50 text-blue-700 ring-blue-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  ordered: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};
const STATUSES: PurchaseRequest["status"][] = ["pending", "approved", "ordered", "rejected"];

/** Someone asks for stock; a supervisor approves; purchasing turns it into an import order. */
export default function PurchaseRequests() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can, identity } = useRole();
  const runAction = useRunAction();
  const { purchaseRequests, products, suppliers, decidePurchaseRequest } = useData();
  const [params, setParams] = useSearchParams();
  // Arriving from a Stock Alert (?sku=…): the form opens for that product.
  const [creating, setCreating] = useState(() => Boolean(params.get("sku")) && can("requestPurchase"));
  const [deciding, setDeciding] = useState<{ r: PurchaseRequest; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<PurchaseRequest["status"] | "">("");

  const list = [...purchaseRequests].sort((a, b) => b.date.localeCompare(a.date) || b.requestNo.localeCompare(a.requestNo)).filter((r) => !filter || r.status === filter);
  const own = (r: PurchaseRequest) => r.requestedBy.en === identity.name.en;
  const productName = (sku: string) => products.find((p) => p.sku === sku)?.name ?? sku;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow={t("nav.group.purchasing")} title={t("pr.title")} subtitle={t("pr.subtitle")} />
        <NewButton label={t("pr.new")} allowed={can("requestPurchase")} onClick={() => setCreating(true)} />
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {(["", ...STATUSES] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            {s ? t(`pr.status.${s}`) : t("common.all")} {s && `(${purchaseRequests.filter((r) => r.status === s).length})`}
          </button>
        ))}
      </div>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("pr.number")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={`${th} text-right`}>{t("erp.quantity")}</th>
            <th className={th}>{t("pr.reason")}</th>
            <th className={th}>{t("common.status")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {list.length === 0 && <EmptyRow colSpan={6} />}
          {list.map((r) => {
            const supplier = suppliers.find((s) => s.supplierId === r.preferredSupplierId);
            return (
              <tr key={r.requestNo} data-testid="pr-row" data-request={r.requestNo} data-status={r.status}>
                <td className={td}>
                  <span className="font-medium text-gray-900">{r.requestNo}</span>
                  <span className="block text-xs text-gray-500">
                    {formatDate(r.date, lang)} · {bi(r.requestedBy)}
                  </span>
                </td>
                <td className={td}>
                  {productName(r.sku)}
                  <span className="block text-xs text-gray-500">
                    {r.sku}
                    {supplier ? ` · ${supplier.name}` : ""}
                  </span>
                </td>
                <td className={`${td} text-right tabular-nums`}>{formatNumber(r.quantity, lang, 0)}</td>
                <td className={`${td} max-w-xs whitespace-normal text-gray-600`}>
                  {bi(r.reason)}
                  {r.decisionNote && <span className="block text-xs text-gray-500">↳ {r.decisionNote}</span>}
                </td>
                <td className={td}>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE[r.status]}`}>{t(`pr.status.${r.status}`)}</span>
                  {r.decidedBy && <span className="block pt-1 text-xs text-gray-500">{bi(r.decidedBy)}</span>}
                  {r.importOrderNo && (
                    <RecordLink to={`/import-orders/${r.importOrderNo}`} className="block text-xs">
                      {r.importOrderNo}
                    </RecordLink>
                  )}
                </td>
                <td className={td}>
                  <div className="flex justify-end gap-1">
                    {r.status === "pending" && can("approve") && !own(r) && (
                      <>
                        <button
                          onClick={() => {
                            setNote("");
                            setDeciding({ r, approve: true });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                          data-testid={`pr-approve-${r.requestNo}`}
                        >
                          <Check size={13} />
                          {t("approvals.approveButton")}
                        </button>
                        <button
                          onClick={() => {
                            setNote("");
                            setDeciding({ r, approve: false });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          data-testid={`pr-reject-${r.requestNo}`}
                        >
                          <X size={13} />
                          {t("approvals.rejectButton")}
                        </button>
                      </>
                    )}
                    {r.status === "pending" && own(r) && <span className="text-xs text-gray-400">{t("pr.awaitingOther")}</span>}
                    {r.status === "approved" && can("createImportOrder") && (
                      <Link
                        to={`/import-orders/new?request=${r.requestNo}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                        data-testid={`pr-order-${r.requestNo}`}
                      >
                        <ShoppingBag size={13} />
                        {t("erp.createImportOrder")}
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableContainer>

      {creating && (
        <RequestDialog
          sku={params.get("sku") ?? ""}
          qty={Number(params.get("qty")) || 0}
          onClose={() => {
            setCreating(false);
            if (params.get("sku")) setParams({}, { replace: true });
          }}
        />
      )}
      {deciding && (
        <Dialog title={`${deciding.approve ? t("approvals.approveButton") : t("approvals.rejectButton")} · ${deciding.r.requestNo}`} onClose={() => setDeciding(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await runAction(decidePurchaseRequest(deciding.r.requestNo, deciding.approve, note), deciding.approve ? t("pr.approvedToast") : t("pr.rejectedToast"))) setDeciding(null);
            }}
          >
            <p className="text-sm text-gray-600">
              {productName(deciding.r.sku)} × {deciding.r.quantity}
            </p>
            <label className="block">
              <FieldLabel>{deciding.approve ? t("pr.noteOptional") : t("fin.reason")}</FieldLabel>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} data-testid="pr-note" />
            </label>
            <DialogActions
              onCancel={() => setDeciding(null)}
              submitLabel={deciding.approve ? t("approvals.approveButton") : t("approvals.rejectButton")}
              disabled={!deciding.approve && !note.trim()}
              testid="pr-decide-save"
            />
          </form>
        </Dialog>
      )}
    </div>
  );
}

function RequestDialog({ sku: initialSku, qty, onClose }: { sku: string; qty: number; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { products, suppliers, reorderPolicies, createPurchaseRequest } = useData();
  const policyOf = (sku: string) => reorderPolicies.find((r) => r.sku === sku);
  const [sku, setSku] = useState(products.some((p) => p.sku === initialSku) ? initialSku : (products[0]?.sku ?? ""));
  const [quantity, setQuantity] = useState(qty || policyOf(sku)?.reorderQty || 1);
  const [supplierId, setSupplierId] = useState(policyOf(sku)?.preferredSupplierId ?? "");
  const [reason, setReason] = useState(() => (initialSku ? both("pr.lowStockReason") : noText()));
  const product = products.find((p) => p.sku === sku);
  const ok = sku && Number.isInteger(quantity) && quantity > 0 && hasText(reason);
  return (
    <Dialog title={t("pr.new")} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ok && (await runAction(createPurchaseRequest({ sku, quantity, reason, preferredSupplierId: supplierId || null }), t("pr.createdToast")))) onClose();
        }}
      >
        <label className="block">
          <FieldLabel>{t("products.col.name")}</FieldLabel>
          <select
            value={sku}
            onChange={(e) => {
              setSku(e.target.value);
              const p = policyOf(e.target.value);
              if (p) {
                setQuantity(p.reorderQty);
                setSupplierId(p.preferredSupplierId ?? "");
              }
            }}
            className={selectClass}
            data-testid="pr-sku"
          >
            {products.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
          {product && <span className="mt-1 block text-xs text-gray-500">{t("pr.inStock").replace("{n}", formatNumber(product.stockAvailable, lang, 0))}</span>}
        </label>
        <label className="block">
          <FieldLabel>{t("erp.quantity")}</FieldLabel>
          <input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={inputClass} data-testid="pr-qty" />
        </label>
        <label className="block">
          <FieldLabel>{t("erp.preferredSupplier")}</FieldLabel>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
            <option value="">{t("erp.noPreferredSupplier")}</option>
            {suppliers
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <div className="block">
          <FieldLabel>{t("pr.reason")}</FieldLabel>
          <TextPair value={reason} onChange={setReason} testid="pr-reason" />
        </div>
        <DialogActions onCancel={onClose} submitLabel={t("pr.submit")} disabled={!ok} testid="pr-save" />
      </form>
    </Dialog>
  );
}
