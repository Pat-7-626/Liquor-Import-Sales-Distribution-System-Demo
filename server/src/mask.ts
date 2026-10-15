import type { AuditEntry } from "../../src/data/types.ts";
import type { Store } from "../../src/domain/store.ts";

const scrubMoney = (text: string) => text.replace(/฿\s?[\d,]+(\.\d+)?/g, "฿••••");

const RESTRICTED = { th: "รายละเอียดเกี่ยวกับราคา/เครดิต — จำกัดสิทธิ์", en: "Price or credit details — restricted for your role" };

/** Audit text that quotes money is withheld from roles without price access. */
export const maskAudit = (e: AuditEntry): AuditEntry => (e.sensitive ? { ...e, summary: RESTRICTED } : e);

/**
 * NFR-03, enforced at the source: roles without price access never receive cost prices, selling prices,
 * discounts, credit figures, order values, tax amounts, or money in audit text. Numbers become 0 (the UI
 * already masks these fields for such roles, so a stray unmasked spot shows 0 — never the real value).
 * Quantities, statuses, dates, names, and channel selling prices (shown to everyone, like the
 * suggested price) are not restricted.
 */
/** `keepSupplierInvoices`: the role handles import paperwork (documents, customs) and needs the supplier's invoice. */
export function maskStore(s: Store, opts: { keepSupplierInvoices?: boolean } = {}): Store {
  return {
    ...s,
    products: s.products.map((p) => ({ ...p, costPrice: 0 })),
    customers: s.customers.map((c) => ({ ...c, creditLimit: 0, outstandingBalance: 0, creditRemaining: 0, standardDiscount: 0 })),
    salesOrders: s.salesOrders.map((o) => {
      const hide = (l: (typeof o.lines)[number]) => ({ ...l, unitPrice: 0, discountPercent: 0, netValue: 0, ...(l.unitCost !== undefined ? { unitCost: 0 } : {}) });
      return {
        ...o,
        netValue: 0,
        lines: o.lines.map(hide),
        ...(o.invoice ? { invoice: { ...o.invoice, netValue: 0, lines: o.invoice.lines.map(hide) } } : {}),
      };
    }),
    inventory: s.inventory.map((i) => (i.unitCost !== undefined ? { ...i, unitCost: 0 } : i)),
    importOrders: s.importOrders.map((o) => ({
      ...o,
      totalValue: 0,
      lineItems: o.lineItems?.map((l) => ({ ...l, unitPrice: 0 })),
      tax: o.tax ? { ...o.tax, importDuty: 0, exciseTax: 0, vat: 0, totalTax: 0 } : o.tax,
      // The supplier's invoice is a price document; packing lists, bills of lading and licenses are not.
      documents: opts.keepSupplierInvoices ? o.documents : o.documents?.filter((d) => d.kind !== "invoice"),
      // Validation notes quote the reference cost price ("deviates from ฿1,850") — scrub amounts.
      note: o.note ? { th: scrubMoney(o.note.th), en: scrubMoney(o.note.en) } : o.note,
    })),
    arDocuments: s.arDocuments.map((d) => ({ ...d, amount: 0, originalValue: d.originalValue === undefined ? undefined : 0 })),
    apDocuments: s.apDocuments.map((d) => ({ ...d, amount: 0, amountThb: 0 })),
    // A signature image could be misused: only roles that issue priced documents receive it (and the stamp).
    company: { ...s.company, openingBank: 0, signature: "", stamp: "" },
    expenses: s.expenses.map((x) => ({ ...x, amount: 0, vat: 0, whtAmount: 0, paid: 0 })),
    manualJournals: s.manualJournals.map((j) => ({ ...j, lines: j.lines.map((l) => ({ ...l, debit: 0, credit: 0 })) })),
    bankLines: s.bankLines.map((l) => ({ ...l, amount: 0 })),
    arReminders: s.arReminders.map((r) => ({ ...r, overdueAmount: 0 })),
    quotations: s.quotations.map((q) => ({ ...q, netValue: 0, lines: q.lines.map((l) => ({ ...l, unitPrice: 0, discountPercent: 0, netValue: 0 })) })),
    auditLog: s.auditLog.map(maskAudit),
  };
}
