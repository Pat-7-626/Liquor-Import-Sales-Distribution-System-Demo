import { useState } from "react";
import { Lock, Upload } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData, type OpeningPayableInput, type OpeningReceivableInput, type OpeningStockInput } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { CsvImportDialog } from "../components/CsvImport";
import { RecordLink, paths } from "../components/RecordLink";
import { formatCurrency, formatDate } from "../lib/format";
import { todayIso } from "../lib/business";

type Kind = "receivables" | "stock" | "payables";

const num = (v: string | undefined) => (v === undefined || v.trim() === "" ? NaN : Number(v.replace(/[,\s฿]/g, "")));
const optDate = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Going live: what customers already owe, the stock already on the shelves, and suppliers' bills still
 * unpaid — imported from spreadsheets, each row through the same rules as everything else. They post to
 * Opening balance equity in the books; once the first month is closed they're fixed.
 */
export default function OpeningBalances() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can, canViewSensitive } = useRole();
  const { company, customers, suppliers, arDocuments, apDocuments, inventory, importOrders, addOpeningReceivable, addOpeningStock, addOpeningPayable } = useData();
  const [importing, setImporting] = useState<Kind | null>(null);
  const editable = can("manageCompany") && !company.closedThrough;
  const baht = (n: number) => `฿${formatCurrency(n, lang)}`;
  const today = todayIso();

  const receivables = arDocuments.filter((d) => d.type === "openingBalance");
  const payables = apDocuments.filter((d) => d.type === "invoice" && !d.importOrderNo);
  // Lots no import order brought in were on the shelf when the books started.
  const receivedLots = new Set(importOrders.flatMap((o) => o.receiving?.lines.map((l) => l.lotBatch) ?? []));
  const openingLots = inventory.filter((i) => !receivedLots.has(i.lotBatch));

  const section = (kind: Kind, title: string, hint: string, count: number, total: string, list: React.ReactNode) => (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid={`opening-${kind}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-0.5 max-w-xl text-xs text-gray-500">{hint}</p>
        </div>
        <button
          onClick={() => setImporting(kind)}
          disabled={!editable}
          title={!editable ? (company.closedThrough ? t("ob.locked") : t("erp.noPermission")) : undefined}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          data-testid={`opening-import-${kind}`}
        >
          {editable ? <Upload size={14} /> : <Lock size={14} />}
          {t("ob.import")}
        </button>
      </div>
      <p className="mb-2 text-xs text-gray-600">
        {t("ob.soFar").replace("{n}", String(count))} {canViewSensitive && total ? `· ${total}` : ""}
      </p>
      {list}
    </section>
  );

  return (
    <div>
      <PageHeader eyebrow={t("nav.group.accounting")} title={t("ob.title")} subtitle={t("ob.subtitle")} />
      {company.closedThrough && <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800"><Lock size={14} />{t("ob.locked")}</p>}
      <div className="space-y-5">
        {section(
          "receivables",
          t("ob.receivablesTitle"),
          t("ob.receivablesHint"),
          receivables.length,
          baht(receivables.reduce((s, d) => s + d.amount, 0)),
          <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto text-sm">
            {receivables.slice(0, 50).map((d) => (
              <li key={d.docNo} className="flex justify-between gap-3 py-1.5">
                <span>
                  <RecordLink to={paths.customer(d.customerId)}>{bi(customers.find((c) => c.customerId === d.customerId)?.name ?? { th: d.customerId, en: d.customerId })}</RecordLink>
                  <span className="ml-2 text-xs text-gray-500">
                    {d.reference} · {formatDate(d.date, lang)}
                    {d.dueDate && d.dueDate < today ? ` · ${t("ob.overdue")}` : ""}
                  </span>
                </span>
                {canViewSensitive && <span className="tabular-nums">{baht(d.amount)}</span>}
              </li>
            ))}
          </ul>,
        )}
        {section(
          "stock",
          t("ob.stockTitle"),
          t("ob.stockHint"),
          openingLots.length,
          baht(openingLots.reduce((s, i) => s + i.quantityRemaining * (i.unitCost ?? 0), 0)),
          <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto text-sm">
            {openingLots.slice(0, 50).map((i) => (
              <li key={i.lotBatch} className="flex justify-between gap-3 py-1.5">
                <span>
                  <RecordLink to={paths.lot(i.lotBatch)}>{i.lotBatch}</RecordLink>
                  <span className="ml-2 text-xs text-gray-500">
                    {i.productName} · {i.warehouse}
                  </span>
                </span>
                <span className="tabular-nums">{i.quantityRemaining}</span>
              </li>
            ))}
          </ul>,
        )}
        {section(
          "payables",
          t("ob.payablesTitle"),
          t("ob.payablesHint"),
          payables.length,
          baht(payables.reduce((s, d) => s + d.amountThb, 0)),
          <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto text-sm">
            {payables.map((d) => (
              <li key={d.docNo} className="flex justify-between gap-3 py-1.5">
                <span>
                  {suppliers.find((s) => s.supplierId === d.supplierId)?.name ?? d.supplierId}
                  <span className="ml-2 text-xs text-gray-500">
                    {d.reference} · {formatDate(d.date, lang)}
                  </span>
                </span>
                {canViewSensitive && (
                  <span className="tabular-nums">
                    {d.currency} {formatCurrency(d.amount, lang)}
                  </span>
                )}
              </li>
            ))}
          </ul>,
        )}
      </div>
      <p className="mt-4 text-xs text-gray-500">{t("ob.booksNote")}</p>

      {importing === "receivables" && (
        <CsvImportDialog<OpeningReceivableInput>
          title={t("ob.receivablesTitle")}
          templateName="opening-receivables"
          columns={[
            { key: "customerId", example: "CUS-0001", required: true },
            { key: "invoiceNo", example: "OLD-INV-1042", required: true },
            { key: "invoiceDate", example: "2026-04-15", required: true },
            { key: "dueDate", example: "2026-05-15" },
            { key: "amount", example: "128400.00", required: true },
          ]}
          toInput={(c) => {
            const amount = num(c.amount);
            if (!(amount > 0)) return { problem: { th: "amount ต้องเป็นตัวเลขมากกว่า 0", en: "amount must be a number above 0" } };
            return { input: { customerId: c.customerId, reference: c.invoiceNo, date: c.invoiceDate, dueDate: optDate(c.dueDate), amount } };
          }}
          submit={addOpeningReceivable}
          onClose={() => setImporting(null)}
        />
      )}
      {importing === "stock" && (
        <CsvImportDialog<OpeningStockInput>
          title={t("ob.stockTitle")}
          templateName="opening-stock"
          columns={[
            { key: "sku", example: "SKU-1001", required: true },
            { key: "lotBatch", example: "OPEN-1001-A", required: true },
            { key: "warehouse", example: "whA", required: true },
            { key: "receivedDate", example: "2026-03-01", required: true },
            { key: "quantity", example: "120", required: true },
            { key: "unitCost", example: "1850.00" },
            { key: "exciseStampDate", example: "2026-03-02" },
          ]}
          toInput={(c) => {
            const quantity = num(c.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0) return { problem: { th: "quantity ต้องเป็นจำนวนเต็มมากกว่า 0", en: "quantity must be a whole number above 0" } };
            const cost = num(c.unitCost);
            return {
              input: {
                sku: c.sku,
                lotBatch: c.lotBatch,
                warehouse: c.warehouse,
                receivedDate: c.receivedDate,
                quantity,
                unitCost: Number.isFinite(cost) ? cost : null,
                exciseStampDate: optDate(c.exciseStampDate),
              },
            };
          }}
          submit={addOpeningStock}
          onClose={() => setImporting(null)}
        />
      )}
      {importing === "payables" && (
        <CsvImportDialog<OpeningPayableInput>
          title={t("ob.payablesTitle")}
          templateName="opening-payables"
          columns={[
            { key: "supplierId", example: "SUP-002", required: true },
            { key: "invoiceNo", example: "CR-2026-0331", required: true },
            { key: "invoiceDate", example: "2026-04-01", required: true },
            { key: "dueDate", example: "2026-05-01" },
            { key: "currency", example: "USD", required: true },
            { key: "amount", example: "12500.00", required: true },
            { key: "rate", example: "34.85" },
          ]}
          toInput={(c) => {
            const amount = num(c.amount);
            const rate = (c.currency ?? "").trim().toUpperCase() === "THB" ? 1 : num(c.rate);
            if (!(amount > 0)) return { problem: { th: "amount ต้องเป็นตัวเลขมากกว่า 0", en: "amount must be a number above 0" } };
            if (!(rate > 0)) return { problem: { th: "rate ต้องระบุสำหรับสกุลเงินต่างประเทศ", en: "rate is needed for a foreign currency" } };
            return { input: { supplierId: c.supplierId, reference: c.invoiceNo, date: c.invoiceDate, dueDate: optDate(c.dueDate), currency: c.currency, amount, rate } };
          }}
          submit={addOpeningPayable}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}
