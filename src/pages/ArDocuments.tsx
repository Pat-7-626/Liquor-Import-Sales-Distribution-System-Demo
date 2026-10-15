import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { Masked } from "../components/Masked";
import { formatCurrency, formatDate, maskIfRestricted } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { useRole } from "../state/RoleContext";
import { ArDocumentPrintModal } from "../components/ArDocumentPrintModal";
import { both } from "../i18n/translations";

/** + raises what the customer owes, − lowers it. */
const raisesBalance = (type: string) => type === "debitNote" || type === "openingBalance";

export default function ArDocuments() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive } = useRole();
  const { arDocuments, customers } = useData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [printDocNo, setPrintDocNo] = useState<string | null>(null);
  const printDoc = arDocuments.find((d) => d.docNo === printDocNo) ?? null;

  const customerName = (id: string) => {
    const c = customers.find((x) => x.customerId === id);
    return c ? bi(c.name) : id;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return arDocuments.filter(
      (d) =>
        (!q || d.docNo.toLowerCase().includes(q) || d.customerId.toLowerCase().includes(q) || d.reference.toLowerCase().includes(q) || customerName(d.customerId).toLowerCase().includes(q)) &&
        (!typeFilter || d.type === typeFilter),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arDocuments, search, typeFilter, customers, lang]);

  const totalPayments = filtered.filter((d) => d.type === "payment").reduce((s, d) => s + d.amount, 0);
  const totalCredits = filtered.filter((d) => d.type === "creditNote").reduce((s, d) => s + d.amount, 0);
  const totalOutstanding = customers.reduce((s, c) => s + c.outstandingBalance, 0);

  return (
    <div>
      <PageHeader title={t("erp.page.arDocuments")} subtitle={t("erp.page.arDocumentsSub")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("erp.paymentsReceived"), value: totalPayments },
          { label: t("erp.creditNotesIssued"), value: totalCredits },
          { label: t("erp.totalOutstanding"), value: totalOutstanding },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              <Masked>฿{formatCurrency(c.value, lang)}</Masked>
            </p>
          </div>
        ))}
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("erp.searchArDocs")}
        statusValue={typeFilter}
        onStatusChange={setTypeFilter}
        statusOptions={[
          { value: "payment", label: t("erp.arType.payment") },
          { value: "creditNote", label: t("erp.arType.creditNote") },
          { value: "debitNote", label: t("erp.arType.debitNote") },
          { value: "openingBalance", label: t("erp.arType.openingBalance") },
        ]}
        resultCount={filtered.length}
        totalCount={arDocuments.length}
        onExport={() =>
          exportToExcel(
            "receipts-credit-notes",
            [both("erp.docNo"), both("erp.date"), both("erp.docType"), both("customers.col.customerId"), both("salesOrders.col.customerName"), both("erp.amount"), both("erp.paymentMethod"), both("erp.reference"), both("auditTrail.col.actor")],
            filtered.map((d) => [
              d.docNo,
              d.date,
              t(`erp.arType.${d.type}`),
              d.customerId,
              customerName(d.customerId),
              maskIfRestricted(d.amount, canViewSensitive),
              d.method ? t(`erp.method.${d.method}`) : "",
              d.reference,
              bi(d.actor),
            ]),
          )
        }
      />

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("erp.docNo")}</th>
            <th className={th}>{t("erp.date")}</th>
            <th className={th}>{t("erp.docType")}</th>
            <th className={th}>{t("salesOrders.col.customerName")}</th>
            <th className={`${th} text-right`}>{t("erp.amount")}</th>
            <th className={th}>{t("erp.paymentMethod")}</th>
            <th className={th}>{t("erp.reference")}</th>
            <th className={th}>{t("auditTrail.col.actor")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && (arDocuments.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                {t("erp.noArDocs")}
              </td>
            </tr>
          ) : (
            <EmptyRow colSpan={9} />
          ))}
          {filtered.map((d) => (
            <tr key={d.docNo} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>{d.docNo}</td>
              <td className={td}>{formatDate(d.date, lang)}</td>
              <td className={td}>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    d.type === "payment"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                      : d.type === "creditNote"
                        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                        : d.type === "openingBalance"
                          ? "bg-gray-50 text-gray-600 ring-gray-500/20"
                          : "bg-blue-50 text-blue-700 ring-blue-600/20"
                  }`}
                >
                  {t(`erp.arType.${d.type}`)}
                </span>
              </td>
              <td className={td}>
                <Link to={`/customers/${d.customerId}`} className="hover:text-indigo-600 hover:underline">
                  {customerName(d.customerId)}
                </Link>
              </td>
              <td className={`${td} text-right font-medium text-gray-900`}>
                {/* Sign shows the effect on what the customer owes. */}
                <Masked>{raisesBalance(d.type) ? "+" : "−"}฿{formatCurrency(d.amount, lang)}</Masked>
              </td>
              <td className={td}>{d.method ? t(`erp.method.${d.method}`) : <span className="text-gray-400">—</span>}</td>
              <td className={td}>
                {d.reference.startsWith("SO-") ? (
                  <Link to={`/sales-orders/${d.reference}`} className="text-indigo-600 hover:underline">
                    {d.reference}
                  </Link>
                ) : (
                  d.reference || <span className="text-gray-400">—</span>
                )}
              </td>
              <td className={td}>{bi(d.actor)}</td>
              <td className={td}>
                {d.type !== "openingBalance" && (
                  <button
                    onClick={() => setPrintDocNo(d.docNo)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Printer size={13} />
                    {t("common.print")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>

      <ArDocumentPrintModal doc={printDoc} onClose={() => setPrintDocNo(null)} />
    </div>
  );
}
