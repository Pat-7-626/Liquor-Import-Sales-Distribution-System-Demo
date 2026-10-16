import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * A record's own name or number, as the way into its page — the one link style used in every list, card
 * and reference, instead of a separate "view details" button.
 */
export function RecordLink({ to, children, className = "", title, testid }: { to: string; children: ReactNode; className?: string; title?: string; testid?: string }) {
  return (
    <Link
      to={to}
      title={title}
      data-testid={testid}
      className={`font-medium text-indigo-700 decoration-indigo-300 underline-offset-2 hover:text-indigo-900 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${className}`}
    >
      {children}
    </Link>
  );
}

/** Where each kind of record lives. */
export const paths = {
  salesOrder: (no: string) => `/sales-orders/${encodeURIComponent(no)}`,
  importOrder: (no: string) => `/import-orders/${encodeURIComponent(no)}`,
  customer: (id: string) => `/customers/${encodeURIComponent(id)}`,
  lot: (lot: string) => `/lot-trace?lot=${encodeURIComponent(lot)}`,
};

/** A free-text reference (an order number, usually) as a link when it names a record we can open. */
export function referencePath(ref: string): string | null {
  const r = ref.replace(/ \(edit\)$/, "").trim();
  if (/^SO-\d{4}-\d+$/.test(r)) return paths.salesOrder(r);
  if (/^IMP-\d{4}-\d+$/.test(r)) return paths.importOrder(r);
  if (/^CUS-\d+$/.test(r)) return paths.customer(r);
  return null;
}

/** The same look for a record that opens in place (a printable document) rather than on its own page. */
export function RecordButton({ onClick, children, className = "", title, testid }: { onClick: () => void; children: ReactNode; className?: string; title?: string; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testid}
      className={`text-left font-medium text-indigo-700 decoration-indigo-300 underline-offset-2 hover:text-indigo-900 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${className}`}
    >
      {children}
    </button>
  );
}
