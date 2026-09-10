import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Paperclip, Trash2, PackageCheck, Pencil, Plus, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { StatusBadge } from "../components/StatusBadge";
import { Card, Field, HistoryList } from "../components/DetailKit";
import { selectClass, inputClass, FieldLabel, CheckItem } from "../components/FormKit";
import { formatCurrency, formatDate } from "../lib/format";
import { computeCustomsClearanceStatus, validateImportLine, describeLineIssues, todayIso } from "../lib/business";
import type { DocumentKind, ImportOrderLineItem, ReceivingLine } from "../data/types";

const RECEIVING_ELIGIBLE_STATUSES = new Set(["approved", "customsCleared"]);
const DOC_KINDS: DocumentKind[] = ["invoice", "packingList", "billOfLading", "importLicense", "other"];
/** FR-05: line items may only be corrected while the order hasn't yet passed Staging validation/approval. */
const LINES_EDITABLE_STATUSES = new Set(["staging", "issueDetected"]);

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
  const showToast = useToast();
  const { identity } = useRole();
  const { importOrders, licenses, products, auditLog, attachDocument, removeDocument, receiveGoods, correctImportOrderLines } = useData();

  const order = importOrders.find((o) => o.orderNo === orderNo);
  const linkedLicense = order?.importLicenseNo ? licenses.find((l) => l.licenseNo === order.importLicenseNo) : null;
  const clearanceStatus = order ? computeCustomsClearanceStatus(order.status) : null;
  const linesEditable = Boolean(order && LINES_EDITABLE_STATUSES.has(order.status) && order.lineItems);

  const [docKind, setDocKind] = useState<DocumentKind>("invoice");
  const [docFile, setDocFile] = useState<File | null>(null);

  const [editingLines, setEditingLines] = useState(false);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);

  const evaluatedDraftLines = useMemo(
    () => draftLines.map((line) => ({ line, product: products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase()), ...validateImportLine(line, products) })),
    [draftLines, products],
  );
  const filledDraftLines = evaluatedDraftLines.filter((e) => e.filled);
  const draftHasIssues = filledDraftLines.some((e) => !e.skuOk || !e.abvOk || !e.priceOk);
  const draftIssueMessages = useMemo(() => describeLineIssues(filledDraftLines.map((e) => e.line), products), [filledDraftLines, products]);
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
  const handleSaveLines = () => {
    if (!order || !canSaveLines) return;
    correctImportOrderLines(
      order.orderNo,
      filledDraftLines.map((e) => ({ sku: e.line.sku, abv: e.line.abv, qty: e.line.qty, unitPrice: e.line.unitPrice })),
      identity.name,
    );
    setEditingLines(false);
    showToast(t("importOrderDetail.savedLinesToast"));
  };

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

  const history = useMemo(
    () => auditLog.filter((e) => e.entityId === orderNo).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [auditLog, orderNo],
  );

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

  const handleAttach = () => {
    if (!docFile) return;
    attachDocument(order.orderNo, { name: docFile.name, kind: docKind, url: URL.createObjectURL(docFile) }, identity.name);
    setDocFile(null);
    showToast(t("importOrderDetail.attachedToast"));
  };

  const handleReceive = () => {
    const hasDiscrepancy = rows.some((r) => r.receivedQty !== r.orderedQty);
    receiveGoods({ orderNo: order.orderNo, receivedDate: todayIso(), lines: rows, actor: identity.name });
    // FR-13: notify the user immediately, not only via the persisted banner shown after reload.
    showToast(`${t("importOrderDetail.receivedToast")}${hasDiscrepancy ? ` — ${t("importOrderDetail.receivingDiscrepancy")}` : ""}`);
  };

  return (
    <div>
      <Link to="/import-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 print:hidden">
        <ArrowLeft size={14} />
        {t("importOrderDetail.backToList")}
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{order.orderNo}</h1>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t("importOrderDetail.sectionOverview")}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("importOrders.col.supplier")} value={order.supplier} />
            <Field label={t("importOrders.col.country")} value={t(`lookup.country.${order.country}`)} />
            <Field label={t("importOrders.col.incoterms")} value={order.incoterms} />
            <Field label={t("importOrders.col.orderDate")} value={formatDate(order.orderDate, lang)} />
            <Field label={t("importOrders.col.etaDate")} value={formatDate(order.etaDate, lang)} />
            <Field label={t("importOrders.col.totalValue")} value={`฿${formatCurrency(order.totalValue, lang)}`} />
            <Field
              label={t("importOrders.col.approver")}
              value={order.approver ? bi(order.approver) : <span className="text-gray-300">{t("importOrders.none")}</span>}
            />
            <Field
              label={t("importOrders.col.customsDeclarationNo")}
              value={order.customsDeclarationNo ?? <span className="text-gray-300">{t("common.notRecorded")}</span>}
            />
            <Field
              label={t("importOrderDetail.importLicense")}
              value={
                linkedLicense ? (
                  `${linkedLicense.licenseNo} · ${bi(linkedLicense.type)}`
                ) : (
                  <span className="text-gray-300">{t("common.notRecorded")}</span>
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
              <Field label={t("importOrderDetail.currency")} value={order.logistics.currency} />
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
                <Field label={t("importOrderDetail.importDuty")} value={`฿${formatCurrency(order.tax.importDuty, lang)}`} />
                <Field label={t("importOrderDetail.exciseTax")} value={`฿${formatCurrency(order.tax.exciseTax, lang)}`} />
                <Field label={t("importOrderDetail.vat")} value={`฿${formatCurrency(order.tax.vat, lang)}`} />
                <Field label={t("importOrderDetail.totalTax")} value={`฿${formatCurrency(order.tax.totalTax, lang)}`} />
              </div>
              <p className="mt-3 text-xs text-gray-400">{t("importOrderDetail.taxDisclaimer")}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">{t("importOrderDetail.noTax")}</p>
          )}
        </Card>

        <Card
          title={t("importOrderDetail.sectionLineItems")}
          action={
            linesEditable && !editingLines ? (
              <button
                onClick={startEditingLines}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <Pencil size={13} />
                {t("importOrderDetail.editLines")}
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
                          value={line.qty}
                          onChange={(e) => updateDraftLine(line.id, { qty: Number(e.target.value) })}
                          className={inputClass}
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
                        {t("newImportOrder.errorPriceDeviation")} ({t("newImportOrder.referencePrice")} ฿{formatCurrency(product.costPrice, lang)})
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
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("salesOrders.col.sku")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("products.col.name")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("products.col.hsCode")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("products.col.packageSize")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("newImportOrder.lineAbv")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("newImportOrder.lineQty")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">{t("newImportOrder.lineUnitPrice")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">{t("importOrderDetail.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.lineItems.map((l, i) => {
                      const product = products.find((p) => p.sku === l.sku);
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{l.sku}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{product?.name ?? <span className="text-gray-300">{t("common.notRecorded")}</span>}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{product?.hsCode ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{product ? `${product.packageSize} ml` : "—"}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{l.abv}%</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{l.qty}</td>
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">฿{formatCurrency(l.unitPrice, lang)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">฿{formatCurrency(l.qty * l.unitPrice, lang)}</td>
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
                    <button onClick={() => removeDocument(order.orderNo, d.id)} className="text-gray-400 hover:text-rose-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

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
          <p className="mt-2 text-xs text-gray-400">{t("importOrderDetail.docsSessionNote")}</p>
        </Card>

        <Card title={t("importOrderDetail.sectionReceiving")}>
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
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("salesOrders.col.sku")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("importOrderDetail.orderedQty")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("importOrderDetail.receivedQty")}</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{t("importOrderDetail.lotBatchAssign")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.receiving.lines.map((l, i) => (
                      <tr key={i} className={l.receivedQty !== l.orderedQty ? "bg-rose-50" : ""}>
                        <td className="px-3 py-2 font-medium text-gray-900">{l.sku}</td>
                        <td className="px-3 py-2 text-gray-700">{l.orderedQty}</td>
                        <td className="px-3 py-2 text-gray-700">{l.receivedQty}</td>
                        <td className="px-3 py-2 text-gray-700">{l.lotBatch}</td>
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
          ) : (
            <>
              <div className="space-y-3">
                {rows.map((r, i) => (
                  <div key={r.sku} className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-4">
                    <Field label={t("salesOrders.col.sku")} value={r.sku} />
                    <Field label={t("importOrderDetail.orderedQty")} value={r.orderedQty} />
                    <label className="block">
                      <FieldLabel>{t("importOrderDetail.receivedQty")}</FieldLabel>
                      <input
                        type="number"
                        value={r.receivedQty}
                        onChange={(e) => updateRow(i, { receivedQty: Number(e.target.value) })}
                        className={`${inputClass} ${r.receivedQty !== r.orderedQty ? "border-amber-400 bg-amber-50" : ""}`}
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
                      <p className="col-span-2 text-xs text-amber-600 sm:col-span-4">{t("importOrderDetail.discrepancyFlag")}</p>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleReceive}
                className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
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
    </div>
  );
}
