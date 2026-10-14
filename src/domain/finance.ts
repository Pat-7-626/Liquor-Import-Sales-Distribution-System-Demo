// Pure helpers for the finance screens and actions: withholding by month, quotation state, and matching a
// bank statement to the books. No state is changed here.
import type { BankLine, Expense, ManualJournal, Quotation } from "../data/types";
import { addDays } from "../lib/business";
import { bankAmount, type JournalEntry } from "./ledger";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const WHT_RATES = [0, 1, 2, 3, 5] as const;

/** First day of the month a date is in. */
export const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;

/** Last day of the month a date (or "YYYY-MM") is in. */
export function lastOfMonth(d: string): string {
  const x = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export interface WithholdingMonth {
  month: string;
  /** Withheld from payments to companies (filed on ภ.ง.ด.53) and to individuals (ภ.ง.ด.3). */
  companies: { count: number; base: number; tax: number };
  individuals: { count: number; base: number; tax: number };
  withheld: number;
  remitted: number;
  outstanding: number;
  /** Paper filing is due by the 7th of the next month. */
  dueDate: string;
}

/** Tax withheld per month, what was remitted for it, and what's still owed. Newest month first. */
export function withholdingByMonth(expenses: Expense[], journals: ManualJournal[]): WithholdingMonth[] {
  const months = new Map<string, WithholdingMonth>();
  const get = (month: string) => {
    let m = months.get(month);
    if (!m) {
      m = {
        month,
        companies: { count: 0, base: 0, tax: 0 },
        individuals: { count: 0, base: 0, tax: 0 },
        withheld: 0,
        remitted: 0,
        outstanding: 0,
        dueDate: `${addDays(lastOfMonth(month), 1).slice(0, 7)}-07`,
      };
      months.set(month, m);
    }
    return m;
  };
  for (const x of expenses) {
    if (!x.whtAmount) continue;
    const m = get(x.date.slice(0, 7));
    const side = x.payeeType === "individual" ? m.individuals : m.companies;
    side.count += 1;
    side.base = r2(side.base + x.amount);
    side.tax = r2(side.tax + x.whtAmount);
    m.withheld = r2(m.withheld + x.whtAmount);
  }
  for (const j of journals) {
    if (j.kind !== "whtRemittance" || !j.period) continue;
    const m = get(j.period);
    m.remitted = r2(m.remitted + j.lines.reduce((s, l) => s + l.debit * (l.account === "2410" ? 1 : 0), 0));
  }
  for (const m of months.values()) m.outstanding = r2(m.withheld - m.remitted);
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export type QuotationState = "open" | "expired" | "accepted" | "declined";

/** An open quotation past its valid-until date has expired. */
export const quotationState = (q: Quotation, today: string): QuotationState => (q.status === "open" && q.validUntil < today ? "expired" : q.status);

/** Days between two ISO dates (b − a). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** How far apart a statement line and a book entry may be dated and still be matched automatically. */
export const MATCH_WINDOW_DAYS = 5;

/** Entries that moved money in or out of the bank account. */
export const bankEntries = (entries: JournalEntry[]) => entries.filter((e) => bankAmount(e) !== 0);

/**
 * Suggests a book entry for each unmatched statement line: same amount, dated within the window, not
 * already matched. A line whose reference names the entry wins; otherwise the closest date.
 */
export function suggestMatches(lines: BankLine[], entries: JournalEntry[]): Map<string, string> {
  const taken = new Set(lines.map((l) => l.matchedEntryId).filter(Boolean) as string[]);
  const candidates = bankEntries(entries).filter((e) => !taken.has(e.id));
  const out = new Map<string, string>();
  for (const line of [...lines].filter((l) => !l.matchedEntryId).sort((a, b) => a.date.localeCompare(b.date))) {
    const fits = candidates.filter(
      (e) => !taken.has(e.id) && Math.abs(bankAmount(e) - line.amount) < 0.005 && Math.abs(daysBetween(e.date, line.date)) <= MATCH_WINDOW_DAYS,
    );
    if (!fits.length) continue;
    const ref = line.reference.trim();
    const best =
      (ref && fits.find((e) => e.ref === ref)) ||
      fits.sort((a, b) => Math.abs(daysBetween(a.date, line.date)) - Math.abs(daysBetween(b.date, line.date)) || a.id.localeCompare(b.id))[0];
    out.set(line.id, best.id);
    taken.add(best.id);
  }
  return out;
}

export interface Reconciliation {
  /** The statement's date range. */
  from: string;
  to: string;
  /** Bank account balance in the books at the statement's last date. */
  bookBalance: number;
  /** Money in/out on the statement, and in the books for the same dates. */
  statementMovement: number;
  bookMovement: number;
  /** On the statement but not in the books (bank charges, transfers nobody recorded yet…). */
  unmatchedLines: BankLine[];
  /** In the books, inside the statement dates, but not on the statement (cheques not yet cleared…). */
  unmatchedEntries: JournalEntry[];
  matched: number;
}

export function reconcile(lines: BankLine[], entries: JournalEntry[]): Reconciliation | null {
  if (!lines.length) return null;
  const dates = lines.map((l) => l.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const matchedIds = new Set(lines.map((l) => l.matchedEntryId).filter(Boolean) as string[]);
  const inRange = bankEntries(entries).filter((e) => e.date >= from && e.date <= to);
  return {
    from,
    to,
    bookBalance: r2(bankEntries(entries).filter((e) => e.date <= to).reduce((s, e) => s + bankAmount(e), 0)),
    statementMovement: r2(lines.reduce((s, l) => s + l.amount, 0)),
    bookMovement: r2(inRange.reduce((s, e) => s + bankAmount(e), 0)),
    unmatchedLines: lines.filter((l) => !l.matchedEntryId).sort((a, b) => a.date.localeCompare(b.date)),
    unmatchedEntries: inRange.filter((e) => !matchedIds.has(e.id)),
    matched: lines.filter((l) => l.matchedEntryId).length,
  };
}
