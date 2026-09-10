import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useToast } from "../components/Toast";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { CheckItem, FieldLabel, selectClass, inputClass } from "../components/FormKit";
import { formatCurrency } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { computeLicenseStatus, getImportLicenseKind, TYPE5_VOLUME_CAP, validateImportLine, describeLineIssues, todayIso, addDays } from "../lib/business";
import type { CountryCode, ImportLogistics } from "../data/types";

interface DraftLine {
  id: string;
  sku: string;
  abv: number;
  qty: number;
  unitPrice: number;
}

const COUNTRIES: CountryCode[] = ["scotland", "mexico", "france", "sweden", "uk", "jamaica", "japan"];
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

const TEMPLATES: Record<Exclude<IntakeMethod, "manual">, {
  supplier: string;
  country: CountryCode;
  incoterms: string;
  lines: DraftLine[];
  logistics: ImportLogistics;
}> = {
  api: {
    supplier: "Highland Spirits Co., Ltd.",
    country: "scotland",
    incoterms: "CIF",
    lines: [newLine("SKU-1001", 43, 200, 1850), newLine("SKU-1003", 40, 400, 780)],
    logistics: { manufacturerRegNo: "UK-DIST-4471", blAwbNumber: "MAEU-9284710", origin: "Glasgow, Scotland", destination: "Bangkok Port, Thailand", currency: "GBP", paymentTerms: "L/C at sight" },
  },
  excel: {
    supplier: "Casa Roble Distillery",
    country: "mexico",
    incoterms: "FOB",
    lines: [newLine("SKU-1004", 38, 150, 990), newLine("SKU-1099", 38, 80, 1000)],
    logistics: { manufacturerRegNo: "MX-TEQ-1182", blAwbNumber: "OOLU-2205563", origin: "Jalisco, Mexico", destination: "Laem Chabang Port, Thailand", currency: "USD", paymentTerms: "T/T 30 days" },
  },
  email: {
    supplier: "Nordic Frost Distillers",
    country: "sweden",
    incoterms: "FOB",
    lines: [newLine("SKU-1007", 85, 300, 520)],
    logistics: { manufacturerRegNo: "SE-VOD-0093", blAwbNumber: "MSCU-7743201", origin: "Stockholm, Sweden", destination: "Bangkok Port, Thailand", currency: "EUR", paymentTerms: "T/T 30 days" },
  },
};

export default function NewImportOrder() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const showToast = useToast();
  const navigate = useNavigate();
  const { products, licenses, createImportOrder } = useData();

  const [intakeMethod, setIntakeMethod] = useState<IntakeMethod>("manual");
  const [supplier, setSupplier] = useState("");
  const [country, setCountry] = useState<CountryCode>("scotland");
  const [incoterms, setIncoterms] = useState("CIF");
  const [orderDate] = useState(todayIso());
  const [etaDate, setEtaDate] = useState(addDays(todayIso(), 35));
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [logistics, setLogistics] = useState<ImportLogistics>(DEFAULT_LOGISTICS);
  const [importLicenseNo, setImportLicenseNo] = useState("");

  const importLicenses = useMemo(() => licenses.filter((l) => l.category === "import"), [licenses]);
  const selectedLicense = importLicenses.find((l) => l.licenseNo === importLicenseNo) ?? null;
  const licenseKind = selectedLicense ? getImportLicenseKind(selectedLicense.type) : null;
  const licenseCheck = selectedLicense ? computeLicenseStatus(selectedLicense.expiryDate) : null;

  const applyTemplate = (method: IntakeMethod) => {
    setIntakeMethod(method);
    if (method === "manual") {
      setSupplier("");
      setCountry("scotland");
      setIncoterms("CIF");
      setLines([newLine()]);
      setLogistics(DEFAULT_LOGISTICS);
      return;
    }
    const tpl = TEMPLATES[method];
    setSupplier(tpl.supplier);
    setCountry(tpl.country);
    setIncoterms(tpl.incoterms);
    setLines(tpl.lines.map((l) => ({ ...l })));
    setLogistics(tpl.logistics);
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
        return { line, product, ...validateImportLine(line, products) };
      }),
    [lines, products],
  );

  const filledLines = evaluatedLines.filter((e) => e.filled);
  const totalQty = filledLines.reduce((sum, e) => sum + e.line.qty, 0);
  const totalValue = filledLines.reduce((sum, e) => sum + e.line.qty * e.line.unitPrice, 0);
  const canSubmit = filledLines.length > 0 && supplier.trim() !== "";

  // FR-09/§7.1: the referenced import license must be valid, cover the ETA, and (for Type 5) stay under its volume cap.
  const licenseExpired = Boolean(licenseCheck && licenseCheck.status === "expired");
  const licenseEtaUncovered = Boolean(selectedLicense && etaDate > selectedLicense.expiryDate);
  const licenseVolumeExceeded = licenseKind === "type5" && totalQty > TYPE5_VOLUME_CAP;
  const licenseHasIssue = Boolean(selectedLicense) && (licenseExpired || licenseEtaUncovered || licenseVolumeExceeded);

  const hasIssues = filledLines.some((e) => !e.skuOk || !e.abvOk || !e.priceOk) || licenseHasIssue;

  const issueMessages = useMemo(() => {
    const msgs: { th: string; en: string }[] = describeLineIssues(
      filledLines.map((e) => e.line),
      products,
    );
    if (licenseExpired) {
      msgs.push({
        th: "ใบอนุญาตนำเข้าที่เลือกหมดอายุแล้ว — ผิดเงื่อนไข Import Compliance Risk",
        en: "The selected import license has expired — violates the Import Compliance Risk control",
      });
    }
    if (!licenseExpired && licenseEtaUncovered) {
      msgs.push({
        th: "วันที่คาดว่าถึงอยู่หลังวันหมดอายุใบอนุญาต — ไม่มีหลักฐานว่านำเข้าภายในอายุใบอนุญาต (§7.1)",
        en: "ETA falls after the license expires — no evidence the import happens within the license period (§7.1)",
      });
    }
    if (licenseVolumeExceeded) {
      msgs.push({
        th: `จำนวนรวมเกินเพดานของใบอนุญาตประเภทที่ 5 (${TYPE5_VOLUME_CAP} หน่วย)`,
        en: `Total quantity exceeds the Type 5 license cap (${TYPE5_VOLUME_CAP} units)`,
      });
    }
    return msgs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filledLines, licenseExpired, licenseEtaUncovered, licenseVolumeExceeded]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const intakeLabel = {
      api: { th: "API / EDI", en: "API / EDI" },
      excel: { th: "อัปโหลด Excel/CSV", en: "Excel/CSV Upload" },
      email: { th: "อีเมล + OCR", en: "Email + OCR" },
      manual: { th: "กรอกข้อมูลเอง", en: "Manual Entry" },
    }[intakeMethod];

    const order = createImportOrder({
      supplier,
      country,
      incoterms,
      orderDate,
      etaDate,
      hasIssues,
      issueSummary: hasIssues
        ? { th: issueMessages.map((m) => m.th).join("; "), en: issueMessages.map((m) => m.en).join("; ") }
        : undefined,
      intakeMethod: intakeLabel,
      lineItems: filledLines.map((e) => ({ sku: e.line.sku, abv: e.line.abv, qty: e.line.qty, unitPrice: e.line.unitPrice })),
      logistics,
      importLicenseNo: importLicenseNo || null,
    });

    showToast(`${t("newImportOrder.createdToast")}: ${order.orderNo}`);
    navigate("/import-orders", { state: { highlightOrderNo: order.orderNo } });
  };

  const handleDownloadTemplate = () => {
    // §6.1: all 7 required "Product" data fields — Product Name/HS Code/Package Size are reference
    // columns (the app resolves them from the Product Master by SKU) but included so the template is
    // self-documenting for whoever fills it out.
    exportToExcel(
      "import-order-template",
      [
        t("newImportOrder.lineSku"),
        t("products.col.name"),
        t("newImportOrder.lineAbv"),
        t("products.col.packageSize"),
        t("newImportOrder.lineQty"),
        t("products.col.hsCode"),
        t("newImportOrder.lineUnitPrice"),
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

  return (
    <div>
      <Link to="/import-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} />
        {t("newImportOrder.backToList")}
      </Link>
      <PageHeader title={t("newImportOrder.title")} subtitle={t("newImportOrder.subtitle")} />

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
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder={t("newImportOrder.supplierPlaceholder")}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <FieldLabel>{t("importOrders.col.country")}</FieldLabel>
                <select value={country} onChange={(e) => setCountry(e.target.value as CountryCode)} className={selectClass}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`lookup.country.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
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
                  className={inputClass}
                />
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
                    {t("licenses.col.expiryDate")}: {selectedLicense.expiryDate}
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
                <input
                  type="text"
                  value={logistics.currency}
                  onChange={(e) => setLogistics((prev) => ({ ...prev, currency: e.target.value }))}
                  className={inputClass}
                />
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
                          value={line.qty}
                          onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })}
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <FieldLabel>{t("newImportOrder.lineUnitPrice")}</FieldLabel>
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
                        {t("newImportOrder.errorPriceDeviation")} ({t("newImportOrder.referencePrice")} ฿
                        {formatCurrency(product.costPrice, lang)})
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
                  <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-medium text-gray-700">{t("newImportOrder.totalValue")}</span>
                    <span className="font-semibold text-gray-900">฿{formatCurrency(totalValue, lang)}</span>
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
