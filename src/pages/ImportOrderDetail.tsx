import { Stepper } from "../components/Stepper";
import { importFlow } from "../lib/flows";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Paperclip, Trash2, PackageCheck, Pencil, Plus, X, Lock, Stamp, QrCode as QrCodeIcon } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useEntityHistory } from "../lib/useEntityHistory";
import { useRole } from "../state/RoleContext";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { Card, Field, HistoryList } from "../components/DetailKit";
import { selectClass, inputClass, FieldLabel, CheckItem } from "../components/FormKit";
import { formatNumber, formatCurrency, formatDate } from "../lib/format";
import { referencePurchasePrice, computeCustomsClearanceStatus, validateImportLine, describeImportOrderIssues, todayIso } from "../lib/business";
import { useRunAction } from "../lib/useRunAction";
import { useWarehouseName } from "../lib/useWarehouseName";
import type { DocumentKind, ImportOrderLineItem, ReceivingLine, WarehouseCode } from "../data/types";
import { RecordLink, paths } from "../components/RecordLink";
import { LotLabels } from "../components/LotLabels";

const RECEIVING_ELIGIBLE_STATUSES = new Set(["approved", "customsCleared"]);
const DOC_KINDS: DocumentKind[] = ["invoice", "packingList", "billOfLading", "importLicense", "other"];
/** FR-05: line items may be corrected before approval — including after a rejection, which resubmits the order. */
const LINES_EDITABLE_STATUSES = new Set(["staging", "issueDetected", "rejected"]);

interface DraftLine extends ImportOrderLineItem {
  id: string;
}
let draftLineIdCounter = 0;
function newDraftLine(source?: ImportOrderLineItem): DraftLine {
  draftLineIdCounter += 1;
  return { id: `draft-${draftLineIdCounter}`, sku: source?.sku ?? "", abv: source?.abv ?? 0, qty: source?.qty ?? 0, unitPrice: source?.unitPrice ?? 0 };
}

function suggestLot(orderNo: string, orderDate: string, idx: number) {
  const yy = orderDate.slice(2, 4);
  const mm = orderDate.slice(5, 7);
  return `LOT-A${yy}${mm}-${String(idx + 1).padStart(2, "0")}-${orderNo.slice(-2)}`;
}

export default function ImportOrderDetail() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { can } = useRole();
  const {
    importOrders,
    licenses,
    products,
    attachDocument,
    removeDocument,
    inventory,
    receiveGoods,
    correctImportOrderLines,
    recordCustomsClearance,
    warehouses,
    taxSettings,
  } = useData();
  const warehouseName = useWarehouseName();
  const activeWarehouses = warehouses.filter((w) => w.active);

  const order = importOrders.find((o) => o.orderNo === orderNo);
  const linkedLicense = order?.importLicenseNo ? licenses.find((l) => l.licenseNo === order.importLicenseNo) : null;
  const clearanceStatus = order ? computeCustomsClearanceStatus(order.status) : null;
  const linesEditable = Boolean(order && LINES_EDITABLE_STATUSES.has(order.status) && order.lineItems);

  const [docKind, setDocKind] = useState<DocumentKind>("invoice");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [declarationNo, setDeclarationNo] = useState("");
  const [receivingWarehouse, setReceivingWarehouse] = useState<WarehouseCode>(warehouses.find((w) => w.active)?.code ?? "");
  // Freight, insurance and clearing paid for this shipment — spread over the lots' landed cost.
  const [freight, setFreight] = useState(0);
  const rate = order?.exchangeRate ?? 1;
  const currency = order?.currency ?? "THB";
  /** An amount in the order's currency, e.g. "EUR 8.12". */
  const inCurrency = (n: number) => `${currency} ${formatNumber(n, lang, 2)}`;

  const [editingLines, setEditingLines] = useState(false);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);

  const evaluatedDraftLines = useMemo(
    () => draftLines.map((line) => ({ line, product: products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase()), ...validateImportLine(line, products, rate, taxSettings) })),
    [draftLines, products, rate, taxSettings],
  );
  const filledDraftLines = useMemo(() => evaluatedDraftLines.filter((e) => e.filled), [evaluatedDraftLines]);
  // Same check the data layer runs on save — lines *and* the order's license — so the preview can't disagree.
  const draftIssueMessages = useMemo(
    () =>
      order
        ? describeImportOrderIssues({ ...order, lineItems: filledDraftLines.map((e) => e.line) }, products, licenses, taxSettings)
        : [],
    [order, filledDraftLines, products, licenses, taxSettings],
  );
  const draftHasIssues = draftIssueMessages.length > 0;
  const canSaveLines = filledDraftLines.length > 0;

  const startEditingLines = () => {
    if (!order?.lineItems) return;
    setDraftLines(order.lineItems.map((l) => newDraftLine(l)));
    setEditingLines(true);
  };
  const updateDraftLine = (id: string, patch: Partial<ImportOrderLineItem>) => {
    setDraftLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const addDraftLine = () => setDraftLines((prev) => [...prev, newDraftLine()]);
  const removeDraftLine = (id: string) => setDraftLines((prev) => prev.filter((l) => l.id !== id));
  const handleSaveLines = async () => {
    if (!order || !canSaveLines) return;
    const result = await correctImportOrderLines(
      order.orderNo,
      filledDraftLines.map((e) => ({ sku: e.line.sku.trim().toUpperCase(), abv: e.line.abv, qty: e.line.qty, unitPrice: e.line.unitPrice })),
    );
    if (await runAction(result, t("importOrderDetail.savedLinesToast"))) setEditingLines(false);
  };

  const [labelsOpen, setLabelsOpen] = useState(false);
  const eligibleForReceiving = Boolean(order && RECEIVING_ELIGIBLE_STATUSES.has(order.status) && order.lineItems && !order.receiving);

  const [receivingRows, setReceivingRows] = useState<ReceivingLine[] | null>(null);

  const rows = useMemo(() => {
    if (!order?.lineItems) return [];
    if (receivingRows) return receivingRows;
    return order.lineItems.map((l, idx) => ({
      sku: l.sku,
      orderedQty: l.qty,
      receivedQty: l.qty,
      lotBatch: suggestLot(order.orderNo, order.orderDate, idx),
      exciseStampDate: todayIso(),
    }));
  }, [order, receivingRows]);

  const history = useEntityHistory(orderNo);

  if (!order) {
    return (
      <div>
        <Link to="/import-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} />
          {t("importOrderDetail.backToList")}
        </Link>
        <p className="text-sm text-gray-500">{t("common.noResults")}</p>
      </div>
    );
  }

  const updateRow = (idx: number, patch: Partial<ReceivingLine>) => {
    setReceivingRows((prev) => {
      const base = prev ?? rows;
      return base.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    });
  };

  const handleAttach = async () => {
    if (!docFile) return;
    const result = await attachDocument(order.orderNo, docFile, docKind);
    if (await runAction(result, t("importOrderDetail.attachedToast"))) {
      setDocFile(null);
      setFileInputKey((k) => k + 1);
    }
  };

  const handleRemoveDocument = async (docId: string, name: string) => {
    if (!window.confirm(`${t("erp.confirmRemoveDocument")}: ${name}?`)) return;
    await runAction(removeDocument(order.orderNo, docId), `${t("common.remove")}: ${name}`);
  };

  const handleCustomsClearance = async () => {
    if (await runAction(recordCustomsClearance(order.orderNo, declarationNo), t("erp.customsClearedToast"))) setDeclarationNo("");
  };

  const receivingValid = rows.every((r) => Number.isInteger(r.receivedQty) && r.receivedQty >= 0) && rows.some((r) => r.receivedQty > 0);
  const handleReceive = async () => {
    const hasDiscrepancy = rows.some((r) => r.receivedQty !== r.orderedQty);
    const result = await receiveGoods({ orderNo: order.orderNo, receivedDate: todayIso(), warehouse: receivingWarehouse, lines: rows, additionalCostThb: freight });
    // FR-13: notify the user immediately, not only via the persisted banner shown after reload.
    if (await runAction(result, `${t("importOrderDetail.receivedToast")}${hasDiscrepancy ? ` — ${t("importOrderDetail.receivingDiscrepancy")}` : ""}`))
      setReceivingRows(null);
  };

  return (
    <div>
      <Link to="/import-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 print:hidden">
        <ArrowLeft size={14} />
        {t("importOrderDetail.backToList")}
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">{order.orderNo}</h1>
        {/* On screen the progress card shows the status (and a late ETA); paper copies keep the badge. */}
        <span className="hidden print:inline">
          <StatusBadge status={order.status} />
        </span>
      </div>

      <div className="mb-5">
        <Stepper steps={importFlow(order)} title={t("flow.progress")} />
      </div>

      {order.status === "approved" && (
        <div className="mb-5 rounded-xl border border-gold-300/60 bg-gradient-to-br from-gold-100/70 to-white p-5 shadow-sm print:hidden">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Stamp size={15} className="text-gold-500" />
            {t("erp.customsStepTitle")}
          </h3>
          <p className="mb-3 text-xs text-gray-500">{t("erp.customsStepHint")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <FieldLabel>{t("importOrders.col.customsDeclarationNo")}</FieldLabel>
              <input
                type="text"
                value={declarationNo}
                onChange={(e) => setDeclarationNo(e.target.value)}
                placeholder="A0011-26-00000"
                disabled={!can("recordCustomsClearance")}
                className={`${inputClass} w-64 disabled:bg-gray-50`}
              />
            </label>
            <button
              onClick={handleCustomsClearance}
              disabled={!can("recordCustomsClearance") || !declarationNo.trim()}
              title={!can("recordCustomsClearance") ? t("erp.noPermission") : undefined}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {t("erp.markCustomsCleared")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t("importOrderDetail.sectionOverview")}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("importOrders.col.supplier")} value={order.supplier} />
            <Field label={t("importOrders.col.country")} value={t(`lookup.country.${order.country}`)} />
            <Field label={t("importOrders.col.incoterms")} value={order.incoterms} />
            <Field label={t("importOrders.col.orderDate")} value={formatDate(order.orderDate, lang)} />
            <Field label={t("importOrders.col.etaDate")} value={formatDate(order.etaDate, lang)} />
              <Field
                label={t("importOrders.col.totalValue")}
                value={
                  <Masked>
                    ฿{formatCurrency(order.totalValue, lang)}
                    {currency !== "THB" && <span className="ml-1 text-xs text-gray-500">({inCurrency(order.totalValue / rate)})</span>}
                  </Masked>
                }
              />
            <Field
              label={t("importOrders.col.approver")}
              value={
                order.approver ? (
                  bi(order.approver)
                ) : order.firstApprover ? (
                  <span className="text-amber-600">
                    {t("erp.level1By")}: {bi(order.firstApprover)}
                  </span>
                ) : (
                  <span className="text-gray-400">{t("importOrders.none")}</span>
                )
              }
            />
            <Field label={t("erp.createdBy")} value={order.createdBy ? bi(order.createdBy) : <span className="text-gray-400">{t("common.notRecorded")}</span>} />
            <Field
              label={t("importOrders.col.customsDeclarationNo")}
              value={order.customsDeclarationNo ?? <span className="text-gray-400">{t("common.notRecorded")}</span>}
            />
            <Field
              label={t("importOrderDetail.importLicense")}
              value={
                linkedLicense ? (
                  `${linkedLicense.licenseNo} · ${bi(linkedLicense.type)}`
                ) : (
                  <span className="text-gray-400">{t("common.notRecorded")}</span>
                )
              }
            />
            <Field
              label={t("importOrderDetail.customsClearanceStatus")}
              value={clearanceStatus && <StatusBadge status={clearanceStatus === "cleared" ? "customsCleared" : "customsClearancePending"} />}
            />
          </div>
          {order.note && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{bi(order.note)}</p>}
        </Card>

        <Card title={t("importOrderDetail.sectionLogistics")}>
          {order.logistics ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("importOrderDetail.manufacturerRegNo")} value={order.logistics.manufacturerRegNo} />
              <Field label={t("importOrderDetail.blAwbNumber")} value={order.logistics.blAwbNumber} />
              <Field label={t("importOrderDetail.origin")} value={order.logistics.origin} />
              <Field label={t("importOrderDetail.destination")} value={order.logistics.destination} />
              <Field
                label={t("importOrderDetail.currency")}
                value={
                  currency === "THB" ? (
                    "THB"
                  ) : (
                    <>
                      {currency} <span className="text-xs text-gray-500">{t("fx.atRate").replace("{r}", String(rate))}</span>
                    </>
                  )
                }
              />
              <Field label={t("importOrderDetail.paymentTerms")} value={order.logistics.paymentTerms} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t("importOrderDetail.noLogistics")}</p>
          )}
        </Card>

        <Card title={t("importOrderDetail.sectionTax")}>
          {order.tax ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("importOrderDetail.dutyRate")} value={`${order.tax.dutyRatePercent}%`} />
                <Field label={t("importOrderDetail.exciseStampCount")} value={order.tax.exciseStampCount} />
                <Field label={t("importOrderDetail.importDuty")} value={<Masked>฿{formatCurrency(order.tax.importDuty, lang)}</Masked>} />
                <Field label={t("importOrderDetail.exciseTax")} value={<Masked>฿{formatCurrency(order.tax.exciseTax, lang)}</Masked>} />
                {order.tax.localTax !== undefined && (
                  <Field label={t("erp.localTax")} value={<Masked>฿{formatCurrency(order.tax.localTax, lang)}</Masked>} />
                )}
                {order.tax.funds !== undefined && <Field label={t("erp.funds")} value={<Masked>฿{formatCurrency(order.tax.funds, lang)}</Masked>} />}
                <Field label={t("importOrderDetail.vat")} value={<Masked>฿{formatCurrency(order.tax.vat, lang)}</Masked>} />
                <Field label={t("importOrderDetail.totalTax")} value={<Masked>฿{formatCurrency(order.tax.totalTax, lang)}</Masked>} />
              </div>
              <p className="mt-3 text-xs text-gray-400">{t("importOrderDetail.taxDisclaimer")}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">{t("importOrderDetail.noTax")}</p>
          )}
        </Card>

        <Card
          wide
          title={t("importOrderDetail.sectionLineItems")}
          action={
            linesEditable && !editingLines ? (
              <button
                onClick={startEditingLines}
                disabled={!can("editImportOrder")}
                title={!can("editImportOrder") ? t("erp.noPermission") : undefined}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {can("editImportOrder") ? <Pencil size={13} /> : <Lock size={13} />}
                {order.status === "rejected" ? t("erp.correctAndResubmit") : t("importOrderDetail.editLines")}
              </button>
            ) : undefined
          }
        >
          {editingLines ? (
            <>
              <div className="space-y-3">
                {evaluatedDraftLines.map(({ line, product, filled, skuOk, abvOk, priceOk }) => (
                  <div key={line.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineSku")}</FieldLabel>
                        <input
                          type="text"
                          value={line.sku}
                          onChange={(e) => updateDraftLine(line.id, { sku: e.target.value })}
                          placeholder={t("newImportOrder.lineSkuPlaceholder")}
                          className={`${inputClass} ${filled && !skuOk ? "border-rose-400 bg-rose-50" : ""}`}
                        />
                      </label>
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineAbv")}</FieldLabel>
                        <input
                          type="number"
                          value={line.abv}
                          onChange={(e) => updateDraftLine(line.id, { abv: Number(e.target.value) })}
                          className={`${inputClass} ${filled && !abvOk ? "border-rose-400 bg-rose-50" : ""}`}
                        />
                      </label>
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineQty")}</FieldLabel>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={line.qty}
                          onChange={(e) => updateDraftLine(line.id, { qty: Number(e.target.value) })}
                          className={`${inputClass} ${filled && !(Number.isInteger(line.qty) && line.qty > 0) ? "border-rose-400 bg-rose-50" : ""}`}
                        />
                      </label>
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineUnitPrice")}</FieldLabel>
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => updateDraftLine(line.id, { unitPrice: Number(e.target.value) })}
                          className={`${inputClass} ${filled && product && !priceOk ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                      </label>
                      <button
                        onClick={() => removeDraftLine(line.id)}
                        className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 sm:h-[38px]"
                      >
                        <Trash2 size={13} />
                        {t("newImportOrder.removeLine")}
                      </button>
                    </div>
                    {filled && !skuOk && <p className="mt-1.5 text-xs text-rose-500">{t("newImportOrder.errorSkuNotFound")}</p>}
                    {filled && !abvOk && <p className="mt-1.5 text-xs text-rose-500">{t("newImportOrder.errorAbvRange")}</p>}
                    {filled && product && !priceOk && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        {t("newImportOrder.errorPriceDeviation")} ({t("newImportOrder.referencePrice")} {inCurrency(referencePurchasePrice(product, taxSettings) / rate)})
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addDraftLine}
                className="mt-3 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <Plus size={13} />
                {t("newImportOrder.addLine")}
              </button>

              <div className="mt-3 border-t border-gray-100 pt-3">
                <CheckItem
                  status={filledDraftLines.length === 0 ? "pending" : draftHasIssues ? "bad" : "ok"}
                  label={
                    filledDraftLines.length === 0
                      ? t("newImportOrder.emptySummary")
                      : draftHasIssues
                        ? t("importOrderDetail.linesStillInvalid")
                        : t("importOrderDetail.linesNowValid")
                  }
                />
                {draftHasIssues && draftIssueMessages.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {draftIssueMessages.map((m, i) => (
                      <li key={i}>{lang === "th" ? m.th : m.en}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleSaveLines}
                  disabled={!canSaveLines}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {t("importOrderDetail.saveLines")}
                </button>
                <button
                  onClick={() => setEditingLines(false)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  <X size={14} />
                  {t("importOrderDetail.cancelEditLines")}
                </button>
              </div>
            </>
          ) : order.lineItems && order.lineItems.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("salesOrders.col.sku")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("products.col.name")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("products.col.hsCode")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("products.col.packageSize")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("newImportOrder.lineAbv")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("newImportOrder.lineQty")}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap">{`${t("newImportOrder.lineUnitPrice").replace(/\s*\(.*\)$/, "")} (${currency})`}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap">{`${t("importOrderDetail.lineTotal").replace(/\s*\(.*\)$/, "")} (${currency})`}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.lineItems.map((l, i) => {
                      const product = products.find((p) => p.sku === l.sku);
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{l.sku}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{product?.name ?? <span className="text-gray-400">{t("common.notRecorded")}</span>}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{product?.hsCode ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{product ? `${product.packageSize} ml` : "—"}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{l.abv}%</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{l.qty}</td>
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                            <Masked>{inCurrency(l.unitPrice)}</Masked>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">
                            <Masked>{inCurrency(l.qty * l.unitPrice)}</Masked>
                            {currency !== "THB" && (
                              <span className="block text-xs font-normal text-gray-500">
                                <Masked>฿{formatCurrency(l.qty * l.unitPrice * rate, lang)}</Masked>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {linesEditable && <p className="mt-2 text-xs text-gray-400 print:hidden">{t("importOrderDetail.editLinesHint")}</p>}
            </>
          ) : (
            <p className="text-sm text-gray-400">{t("importOrderDetail.noLineItems")}</p>
          )}
        </Card>

        <Card title={t("importOrderDetail.sectionDocuments")}>
          {(order.documents?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">{t("importOrderDetail.noDocuments")}</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {order.documents!.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:underline">
                    <Paperclip size={13} />
                    {d.name}
                  </a>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{t(`importOrderDetail.kind.${d.kind}`)}</span>
                    {can("manageImportDocuments") && (
                      <button
                        onClick={() => handleRemoveDocument(d.id, d.name)}
                        aria-label={`${t("common.remove")} ${d.name}`}
                        className="text-gray-400 hover:text-rose-500 print:hidden"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {can("manageImportDocuments") && (
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <label className="block">
              <FieldLabel>{t("importOrderDetail.documentKind")}</FieldLabel>
              <select value={docKind} onChange={(e) => setDocKind(e.target.value as DocumentKind)} className={`${selectClass} w-auto`}>
                {DOC_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`importOrderDetail.kind.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <input
              key={fileInputKey}
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              className="text-xs text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700"
            />
            <button
              onClick={handleAttach}
              disabled={!docFile}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {t("common.upload")}
            </button>
          </div>
          )}
          <p className="mt-2 text-xs text-gray-400">{t("importOrderDetail.docsSessionNote")}</p>
        </Card>

        <Card
          wide
          title={t("importOrderDetail.sectionReceiving")}
          action={
            order.receiving && (
              <button
                onClick={() => setLabelsOpen(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                data-testid="shipment-labels"
              >
                <QrCodeIcon size={13} />
                {t("labels.printShipment")}
              </button>
            )
          }
        >
          {order.receiving ? (
            <>
              <p className="mb-2 text-sm text-gray-600">
                {t("importOrderDetail.alreadyReceived")} {formatDate(order.receiving.receivedDate, lang)}
              </p>
              <p className={`mb-3 text-xs ${order.receiving.hasDiscrepancy ? "text-rose-600" : "text-emerald-600"}`}>
                {order.receiving.hasDiscrepancy ? t("importOrderDetail.receivingDiscrepancy") : t("importOrderDetail.receivingMatch")}
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("salesOrders.col.sku")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("importOrderDetail.orderedQty")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("importOrderDetail.receivedQty")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("importOrderDetail.lotBatchAssign")}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{t("importOrderDetail.exciseStampDate")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.receiving.lines.map((l, i) => (
                      <tr key={i} className={l.receivedQty !== l.orderedQty ? "bg-rose-50" : ""}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap text-gray-900">{l.sku}</td>
                        <td className="px-3 py-2 text-gray-700">{l.orderedQty}</td>
                        <td className="px-3 py-2 text-gray-700">{l.receivedQty}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {l.lotBatch && l.receivedQty > 0 ? <RecordLink to={paths.lot(l.lotBatch)}>{l.lotBatch}</RecordLink> : l.lotBatch || "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{l.exciseStampDate ? formatDate(l.exciseStampDate, lang) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : !order.lineItems || order.lineItems.length === 0 ? (
            <p className="text-sm text-gray-400">{t("importOrderDetail.receivingNoLines")}</p>
          ) : order.status === "receivedWarehouse" ? (
            <p className="text-sm text-gray-400">{t("importOrderDetail.receivingHistorical")}</p>
          ) : !eligibleForReceiving ? (
            <p className="text-sm text-gray-400">{t("importOrderDetail.receivingIneligible")}</p>
          ) : !can("receiveGoods") ? (
            <p className="flex items-center gap-1.5 text-sm text-gray-400">
              <Lock size={13} />
              {t("erp.receivePermission")}
            </p>
          ) : (
            <>
              <label className="mb-3 block max-w-xs">
                <FieldLabel>{t("fx.freight")}</FieldLabel>
                <input type="number" min={0} value={freight} onChange={(e) => setFreight(Math.max(0, Number(e.target.value)))} className={inputClass} data-testid="receive-freight" />
                <span className="mt-1 block text-xs text-gray-500">{t("fx.freightHint")}</span>
              </label>
              <label className="mb-3 block max-w-xs">
                <FieldLabel>{t("erp.receiveIntoWarehouse")}</FieldLabel>
                <select value={receivingWarehouse} onChange={(e) => setReceivingWarehouse(e.target.value as WarehouseCode)} className={selectClass}>
                  {activeWarehouses.map((w) => (
                    <option key={w.code} value={w.code}>
                      {warehouseName(w.code)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-3">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-3">
                    <Field label={t("salesOrders.col.sku")} value={r.sku} />
                    <Field label={t("importOrderDetail.orderedQty")} value={r.orderedQty} />
                    <label className="block">
                      <FieldLabel>{t("importOrderDetail.receivedQty")}</FieldLabel>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={r.receivedQty}
                        onChange={(e) => updateRow(i, { receivedQty: Number(e.target.value) })}
                        className={`${inputClass} ${
                          !Number.isInteger(r.receivedQty) || r.receivedQty < 0
                            ? "border-rose-400 bg-rose-50"
                            : r.receivedQty !== r.orderedQty
                              ? "border-amber-400 bg-amber-50"
                              : ""
                        }`}
                      />
                    </label>
                    <label className="block">
                      <FieldLabel>{t("importOrderDetail.lotBatchAssign")}</FieldLabel>
                      <input
                        type="text"
                        value={r.lotBatch}
                        onChange={(e) => updateRow(i, { lotBatch: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <FieldLabel>{t("importOrderDetail.exciseStampDate")}</FieldLabel>
                      <input
                        type="date"
                        value={r.exciseStampDate}
                        onChange={(e) => updateRow(i, { exciseStampDate: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    {r.receivedQty !== r.orderedQty && (
                      <p className="col-span-full text-xs text-amber-600">{t("importOrderDetail.discrepancyFlag")}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-400">{t("erp.lotUniqueNote")}</p>
              <button
                onClick={handleReceive}
                disabled={!receivingValid}
                className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                <PackageCheck size={15} />
                {t("importOrderDetail.submitReceiving")}
              </button>
            </>
          )}
        </Card>

        <Card title={t("importOrderDetail.sectionHistory")}>
          <HistoryList entries={history} emptyLabel={t("importOrderDetail.noHistory")} />
        </Card>
      </div>
      {labelsOpen && order.receiving && (
        <LotLabels lots={inventory.filter((i) => order.receiving!.lines.some((l) => l.lotBatch === i.lotBatch))} onClose={() => setLabelsOpen(false)} />
      )}
    </div>
  );
}
