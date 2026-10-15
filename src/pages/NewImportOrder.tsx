import { useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, ShieldAlert } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { CheckItem, FieldLabel, selectClass, inputClass } from "../components/FormKit";
import { formatNumber, formatCurrency, formatDate } from "../lib/format";
import { exportToExcel } from "../lib/export";
import {
  computeLicenseStatus,
  getImportLicenseKind,
  TYPE5_VOLUME_CAP,
  validateImportLine,
  describeImportOrderIssues,
  checkImportLicense,
  todayIso,
  addDays,
  rateOn,
  referencePurchasePrice,
} from "../lib/business";
import { useRunAction } from "../lib/useRunAction";
import type { ImportLogistics, Supplier } from "../data/types";
import { both } from "../i18n/translations";

interface DraftLine {
  id: string;
  sku: string;
  abv: number;
  qty: number;
  unitPrice: number;
}

const INCOTERMS = ["CIF", "FOB"];
const DEFAULT_LOGISTICS: ImportLogistics = {
  manufacturerRegNo: "",
  blAwbNumber: "",
  origin: "",
  destination: "Bangkok Port, Thailand",
  currency: "USD",
  paymentTerms: "T/T 30 days",
};

type IntakeMethod = "api" | "excel" | "email" | "manual";

let lineIdCounter = 0;
function newLine(sku = "", abv = 0, qty = 0, unitPrice = 0): DraftLine {
  lineIdCounter += 1;
  return { id: `line-${lineIdCounter}`, sku, abv, qty, unitPrice };
}

/** Simulated incoming documents — supplier details come from the Supplier Master, the rest from the "document". */
const TEMPLATES: Record<Exclude<IntakeMethod, "manual">, { supplierId: string; lines: DraftLine[]; blAwbNumber: string; destination: string }> = {
  api: {
    supplierId: "SUP-001",
    // Sized to come to over ฿500,000 at supplier prices, so it shows the two-supervisor approval.
    lines: [newLine("SKU-1001", 43, 300, 1850), newLine("SKU-1003", 40, 500, 780)],
    blAwbNumber: "MAEU-9284710",
    destination: "Bangkok Port, Thailand",
  },
  excel: {
    supplierId: "SUP-002",
    lines: [newLine("SKU-1004", 38, 150, 990), newLine("SKU-1099", 38, 80, 1000)],
    blAwbNumber: "OOLU-2205563",
    destination: "Laem Chabang Port, Thailand",
  },
  email: {
    supplierId: "SUP-004",
    lines: [newLine("SKU-1007", 85, 300, 520)],
    blAwbNumber: "MSCU-7743201",
    destination: "Bangkok Port, Thailand",
  },
};

function logisticsFrom(supplier: Supplier | undefined, keep: Pick<ImportLogistics, "blAwbNumber" | "destination">): ImportLogistics {
  return {
    ...keep,
    manufacturerRegNo: supplier?.manufacturerRegNo ?? "",
    origin: supplier?.origin ?? "",
    currency: supplier?.currency ?? DEFAULT_LOGISTICS.currency,
    paymentTerms: supplier?.paymentTerms ?? DEFAULT_LOGISTICS.paymentTerms,
  };
}

export default function NewImportOrder() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const navigate = useNavigate();
  const { can } = useRole();
  const { products, licenses, suppliers, exchangeRates, taxSettings, purchaseRequests, createImportOrder } = useData();
  const currencies = useMemo(() => ["THB", ...[...new Set(exchangeRates.map((r) => r.currency))].sort()], [exchangeRates]);
  const activeSuppliers = suppliers.filter((sp) => sp.active);

  // Prefill from a Stock Alert "reorder" link (?supplierId=…&sku=…&qty=…) or an approved purchase request (?request=PR-…).
  const [params] = useSearchParams();
  const request = purchaseRequests.find((r) => r.requestNo === params.get("request") && r.status === "approved");
  const prefillSupplier = suppliers.find((sp) => sp.supplierId === (params.get("supplierId") ?? request?.preferredSupplierId) && sp.active);
  const prefillProduct = products.find((p) => p.sku === (params.get("sku") ?? request?.sku));

  const [intakeMethod, setIntakeMethod] = useState<IntakeMethod>("manual");
  const [supplierId, setSupplierId] = useState(prefillSupplier?.supplierId ?? "");
  const supplier = suppliers.find((sp) => sp.supplierId === supplierId);
  const [incoterms, setIncoterms] = useState(prefillSupplier?.defaultIncoterms ?? "CIF");
  const [orderDate] = useState(todayIso());
  /** Baht figure → the order's currency at today's rate (2 decimals). Unknown currency: left in baht. */
  function toCurrency(thb: number, currency: string) {
    const rate = rateOn(exchangeRates, currency, todayIso()) ?? 1;
    return Math.round((thb / rate) * 100) / 100;
  }
  const [etaDate, setEtaDate] = useState(addDays(todayIso(), 35));
  const [lines, setLines] = useState<DraftLine[]>(() =>
    prefillProduct
      ? [
          newLine(
            prefillProduct.sku,
            prefillProduct.abv,
            Math.max(1, Math.round(Number(params.get("qty")) || request?.quantity || 0)),
            toCurrency(referencePurchasePrice(prefillProduct, taxSettings), prefillSupplier?.currency ?? DEFAULT_LOGISTICS.currency),
          ),
        ]
      : [newLine()],
  );
  const [logistics, setLogistics] = useState<ImportLogistics>(() => logisticsFrom(prefillSupplier, DEFAULT_LOGISTICS));
  // The order is fixed at today's rate for its currency; with no rate it can't be valued (or saved).
  const rate = rateOn(exchangeRates, logistics.currency, orderDate);
  const rateFrom = exchangeRates
    .filter((r) => r.currency === logistics.currency && r.effectiveDate <= orderDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.effectiveDate;

  const handleSelectSupplier = (id: string) => {
    setSupplierId(id);
    const sp = suppliers.find((x) => x.supplierId === id);
    if (sp) setIncoterms(sp.defaultIncoterms);
    setLogistics((prev) => logisticsFrom(sp, prev));
  };
  const [importLicenseNo, setImportLicenseNo] = useState("");

  const importLicenses = useMemo(() => licenses.filter((l) => l.category === "import"), [licenses]);
  const selectedLicense = importLicenses.find((l) => l.licenseNo === importLicenseNo) ?? null;
  const licenseKind = selectedLicense ? getImportLicenseKind(selectedLicense.type) : null;
  const licenseCheck = selectedLicense ? computeLicenseStatus(selectedLicense.expiryDate) : null;

  const applyTemplate = (method: IntakeMethod) => {
    setIntakeMethod(method);
    if (method === "manual") {
      setSupplierId("");
      setIncoterms("CIF");
      setLines([newLine()]);
      setLogistics(DEFAULT_LOGISTICS);
      return;
    }
    const tpl = TEMPLATES[method];
    const sp = suppliers.find((x) => x.supplierId === tpl.supplierId);
    setSupplierId(sp?.active ? sp.supplierId : "");
    setIncoterms(sp?.defaultIncoterms ?? "CIF");
    setLines(
      tpl.lines.map((l) => {
        const product = products.find((p) => p.sku === l.sku);
        const supplierThb = product ? l.unitPrice * (referencePurchasePrice(product, taxSettings) / product.costPrice) : l.unitPrice;
        return { ...l, unitPrice: toCurrency(supplierThb, sp?.currency ?? DEFAULT_LOGISTICS.currency) };
      }),
    );
    setLogistics(logisticsFrom(sp, { blAwbNumber: tpl.blAwbNumber, destination: tpl.destination }));
  };

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const evaluatedLines = useMemo(
    () =>
      lines.map((line) => {
        const product = products.find((p) => p.sku.toLowerCase() === line.sku.trim().toLowerCase());
        return { line, product, ...validateImportLine(line, products, rate ?? 1, taxSettings) };
      }),
    [lines, products, rate, taxSettings],
  );

  const filledLines = useMemo(() => evaluatedLines.filter((e) => e.filled), [evaluatedLines]);
  const totalQty = filledLines.reduce((sum, e) => sum + e.line.qty, 0);
  const totalForeign = filledLines.reduce((sum, e) => sum + e.line.qty * e.line.unitPrice, 0);
  const totalValue = totalForeign * (rate ?? 1);
  const etaValid = etaDate >= orderDate;
  const canSubmit = filledLines.length > 0 && Boolean(supplier?.active) && etaValid && rate !== null;

  // FR-09/§7.1: the referenced import license must be valid, cover the ETA, and (for Type 5) stay under its volume cap.
  const { expired: licenseExpired, etaUncovered: licenseEtaUncovered, volumeExceeded: licenseVolumeExceeded } = checkImportLicense(
    selectedLicense,
    etaDate,
    totalQty,
  );

  // The exact check the data layer runs when the order is saved — the preview can't disagree with it.
  const issueMessages = useMemo(
    () => describeImportOrderIssues({ lineItems: filledLines.map((e) => e.line), etaDate, importLicenseNo, exchangeRate: rate ?? 1 }, products, licenses, taxSettings),
    [filledLines, etaDate, importLicenseNo, products, licenses, rate, taxSettings],
  );
  const hasIssues = issueMessages.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const intakeLabel = {
      api: { th: "API / EDI", en: "API / EDI" },
      excel: { th: "อัปโหลด Excel/CSV", en: "Excel/CSV Upload" },
      email: { th: "อีเมล + OCR", en: "Email + OCR" },
      manual: { th: "กรอกข้อมูลเอง", en: "Manual Entry" },
    }[intakeMethod];

    const result = await createImportOrder({
      supplierId,
      country: supplier!.country,
      incoterms,
      orderDate,
      etaDate,
      intakeMethod: intakeLabel,
      lineItems: filledLines.map((e) => ({ sku: e.line.sku.trim().toUpperCase(), abv: e.line.abv, qty: e.line.qty, unitPrice: e.line.unitPrice })),
      logistics,
      importLicenseNo: importLicenseNo || null,
      purchaseRequestNo: request?.requestNo ?? null,
    });
    const order = result.ok ? result.order! : null;
    if (!await runAction(result, `${t("newImportOrder.createdToast")}: ${order?.orderNo ?? ""}`)) return;
    navigate("/import-orders", { state: { highlightOrderNo: order!.orderNo } });
  };

  const handleDownloadTemplate = () => {
    // §6.1: all 7 required "Product" data fields — Product Name/HS Code/Package Size are reference
    // columns (the app resolves them from the Product Master by SKU) but included so the template is
    // self-documenting for whoever fills it out.
    exportToExcel(
      "import-order-template",
      [
        both("newImportOrder.lineSku"),
        both("products.col.name"),
        both("newImportOrder.lineAbv"),
        both("products.col.packageSize"),
        both("newImportOrder.lineQty"),
        both("products.col.hsCode"),
        both("newImportOrder.lineUnitPrice"),
      ],
      [["SKU-1001", "Golden Barrel Single Malt 12Y", 43, 700, 100, "2208.30", 1850]],
    );
  };

  const intakeOptions: { key: IntakeMethod; label: string }[] = [
    { key: "api", label: t("newImportOrder.intakeApi") },
    { key: "excel", label: t("newImportOrder.intakeExcel") },
    { key: "email", label: t("newImportOrder.intakeEmail") },
    { key: "manual", label: t("newImportOrder.intakeManual") },
  ];

  if (!can("createImportOrder")) {
    return (
      <div>
        <Link to="/import-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} />
          {t("newImportOrder.backToList")}
        </Link>
        <PageHeader title={t("newImportOrder.title")} subtitle={t("newImportOrder.subtitle")} />
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          <ShieldAlert size={16} />
          {t("newImportOrder.restrictedPage")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/import-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} />
        {t("newImportOrder.backToList")}
      </Link>
      <PageHeader title={t("newImportOrder.title")} subtitle={t("newImportOrder.subtitle")} />
      {request && (
        <p className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-800" data-testid="from-request">
          {t("pr.fulfilling").replace("{no}", request.requestNo).replace("{sku}", request.sku).replace("{qty}", String(request.quantity))}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Intake method */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newImportOrder.sectionIntake")}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {intakeOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => applyTemplate(opt.key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    intakeMethod === opt.key
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {intakeMethod !== "manual" && (
              <p className="mt-2 text-xs text-gray-400">{t("newImportOrder.intakeAutoFillNote")}</p>
            )}
            {intakeMethod === "manual" && (
              <button
                onClick={handleDownloadTemplate}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t("newImportOrder.downloadTemplate")}
              </button>
            )}
          </div>

          {/* Header */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newImportOrder.sectionHeader")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <FieldLabel>{t("newImportOrder.supplier")}</FieldLabel>
                <select value={supplierId} onChange={(e) => handleSelectSupplier(e.target.value)} className={selectClass}>
                  <option value="">{t("erp.selectSupplier")}</option>
                  {activeSuppliers.map((sp) => (
                    <option key={sp.supplierId} value={sp.supplierId}>
                      {sp.supplierId} · {sp.name}
                    </option>
                  ))}
                </select>
                <Link to="/suppliers" className="mt-1 inline-block text-xs text-indigo-600 hover:underline">
                  {t("erp.manageSuppliers")}
                </Link>
              </label>
              <div>
                <FieldLabel>{t("importOrders.col.country")}</FieldLabel>
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {supplier ? t(`lookup.country.${supplier.country}`) : "—"}
                </p>
              </div>
              <label className="block">
                <FieldLabel>{t("importOrders.col.incoterms")}</FieldLabel>
                <select value={incoterms} onChange={(e) => setIncoterms(e.target.value)} className={selectClass}>
                  {INCOTERMS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <FieldLabel>{t("importOrders.col.etaDate")}</FieldLabel>
                <input
                  type="date"
                  value={etaDate}
                  min={orderDate}
                  onChange={(e) => setEtaDate(e.target.value)}
                  className={`${inputClass} ${!etaValid ? "border-rose-400 bg-rose-50" : ""}`}
                />
                {!etaValid && <p className="mt-1 text-xs text-rose-500">{t("erp.etaBeforeOrder")}</p>}
              </label>
            </div>
          </div>

          {/* Import license reference */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newImportOrder.sectionImportLicense")}</h3>
            <select
              value={importLicenseNo}
              onChange={(e) => setImportLicenseNo(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("newImportOrder.selectLicensePlaceholder")}</option>
              {importLicenses.map((l) => (
                <option key={l.licenseNo} value={l.licenseNo}>
                  {l.licenseNo} · {bi(l.type)}
                </option>
              ))}
            </select>
            {importLicenses.length === 0 && (
              <p className="mt-1.5 text-xs text-rose-500">{t("newImportOrder.noImportLicenses")}</p>
            )}

            {selectedLicense && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">
                    {t("licenses.col.expiryDate")}: {formatDate(selectedLicense.expiryDate, lang)}
                  </span>
                  {licenseCheck && <StatusBadge status={licenseCheck.status} />}
                </div>
                {licenseKind === "type1" && <p className="mt-2 text-xs text-gray-500">{t("newImportOrder.licenseInfoType1")}</p>}
                {licenseKind === "type5" && <p className="mt-2 text-xs text-gray-500">{t("newImportOrder.licenseInfoType5")}</p>}
              </div>
            )}

            {licenseExpired && (
              <p className="mt-2 text-xs text-rose-500">{t("newImportOrder.errorLicenseExpiredForOrder")}</p>
            )}
            {!licenseExpired && licenseEtaUncovered && (
              <p className="mt-2 text-xs text-rose-500">{t("newImportOrder.errorEtaAfterLicenseExpiry")}</p>
            )}
            {licenseVolumeExceeded && (
              <p className="mt-2 text-xs text-amber-600">
                {t("newImportOrder.errorVolumeCapExceeded").replace("{cap}", String(TYPE5_VOLUME_CAP))}
              </p>
            )}
          </div>

          {/* Logistics & financial */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("importOrderDetail.sectionLogistics")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <FieldLabel>{t("importOrderDetail.manufacturerRegNo")}</FieldLabel>
                <input
                  type="text"
                  value={logistics.manufacturerRegNo}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, manufacturerRegNo: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>{t("importOrderDetail.blAwbNumber")}</FieldLabel>
                <input
                  type="text"
                  value={logistics.blAwbNumber}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, blAwbNumber: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>{t("importOrderDetail.origin")}</FieldLabel>
                <input
                  type="text"
                  value={logistics.origin}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, origin: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>{t("importOrderDetail.destination")}</FieldLabel>
                <input
                  type="text"
                  value={logistics.destination}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, destination: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>{t("importOrderDetail.currency")}</FieldLabel>
                <select
                  value={logistics.currency}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, currency: e.target.value }))}
                  className={selectClass}
                  data-testid="io-currency"
                >
                  {!currencies.includes(logistics.currency) && <option value={logistics.currency}>{logistics.currency}</option>}
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className={`mt-1 text-xs ${rate === null ? "text-rose-600" : "text-gray-500"}`} data-testid="io-rate">
                  {rate === null
                    ? t("fx.noRate").replace("{c}", logistics.currency)
                    : logistics.currency === "THB"
                      ? t("fx.baht")
                      : t("fx.rateLine").replace("{c}", logistics.currency).replace("{r}", String(rate)).replace("{d}", rateFrom ? formatDate(rateFrom, lang) : "")}
                </p>
              </label>
              <label className="block">
                <FieldLabel>{t("importOrderDetail.paymentTerms")}</FieldLabel>
                <input
                  type="text"
                  value={logistics.paymentTerms}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{t("newImportOrder.sectionLines")}</h3>
              <button
                onClick={addLine}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <Plus size={13} />
                {t("newImportOrder.addLine")}
              </button>
            </div>

            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("newImportOrder.noLines")}</p>
            ) : (
              <div className="space-y-3">
                {evaluatedLines.map(({ line, product, filled, skuOk, abvOk, priceOk }) => (
                  <div key={line.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineSku")}</FieldLabel>
                        <input
                          type="text"
                          value={line.sku}
                          onChange={(e) => updateLine(line.id, { sku: e.target.value })}
                          placeholder={t("newImportOrder.lineSkuPlaceholder")}
                          className={`${inputClass} ${filled && !skuOk ? "border-rose-400 bg-rose-50" : ""}`}
                        />
                        {product && (
                          <p className="mt-1 truncate text-xs text-gray-400" title={`${product.name} · HS ${product.hsCode} · ${product.packageSize} ml`}>
                            {product.name} · HS {product.hsCode} · {product.packageSize} ml
                          </p>
                        )}
                      </label>
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineAbv")}</FieldLabel>
                        <input
                          type="number"
                          value={line.abv}
                          onChange={(e) => updateLine(line.id, { abv: Number(e.target.value) })}
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
                          onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })}
                          className={`${inputClass} ${filled && !(Number.isInteger(line.qty) && line.qty > 0) ? "border-rose-400 bg-rose-50" : ""}`}
                        />
                      </label>
                      <label className="block">
                        <FieldLabel>{`${t("newImportOrder.lineUnitPrice").replace(/\s*\(.*\)$/, "")} (${logistics.currency})`}</FieldLabel>
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.id, { unitPrice: Number(e.target.value) })}
                          className={`${inputClass} ${filled && product && !priceOk ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                      </label>
                      <button
                        onClick={() => removeLine(line.id)}
                        className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 sm:h-[38px]"
                      >
                        <Trash2 size={13} />
                        {t("newImportOrder.removeLine")}
                      </button>
                    </div>
                    {filled && !skuOk && (
                      <p className="mt-1.5 text-xs text-rose-500">{t("newImportOrder.errorSkuNotFound")}</p>
                    )}
                    {filled && !abvOk && <p className="mt-1.5 text-xs text-rose-500">{t("newImportOrder.errorAbvRange")}</p>}
                    {filled && product && !priceOk && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        {t("newImportOrder.errorPriceDeviation")} ({t("newImportOrder.referencePrice")} {logistics.currency}{" "}
                        {formatNumber(referencePurchasePrice(product, taxSettings) / (rate ?? 1), lang, 2)})
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("newImportOrder.summaryTitle")}</h3>

            {filledLines.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("newImportOrder.emptySummary")}</p>
            ) : (
              <>
                <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t("newImportOrder.totalSkus")}</span>
                    <span className="font-medium text-gray-800">{filledLines.length}</span>
                  </div>
                  {logistics.currency !== "THB" && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t("fx.inCurrency").replace("{c}", logistics.currency)}</span>
                      <span className="font-medium tabular-nums text-gray-800">{formatNumber(totalForeign, lang, 2)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-medium text-gray-700">{t("newImportOrder.totalValue")}</span>
                    <span className="font-semibold tabular-nums text-gray-900">฿{formatCurrency(totalValue, lang)}</span>
                  </div>
                </div>

                <div className="mt-3 border-t border-gray-100 pt-1">
                  <CheckItem
                    status={hasIssues ? "bad" : "ok"}
                    label={hasIssues ? t("newImportOrder.validationIssues") : t("newImportOrder.validationOk")}
                  />
                </div>

                {hasIssues && issueMessages.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {issueMessages.map((m, i) => (
                      <li key={i}>{lang === "th" ? m.th : m.en}</li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-xs text-gray-400">
                  {hasIssues ? t("newImportOrder.willFlagIssue") : t("newImportOrder.willEnterStaging")}
                </p>
              </>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              data-testid="submit-io-btn"
              className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {t("newImportOrder.submitButton")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
