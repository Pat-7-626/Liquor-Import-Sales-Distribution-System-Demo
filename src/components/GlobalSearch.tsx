import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Keyboard, ScanLine, Search, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { paths } from "./RecordLink";
import { Scanner, scannerAvailable } from "./Scanner";

interface Hit {
  group: string;
  title: string;
  sub: string;
  to: string;
}

const MAX_PER_GROUP = 6;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Search everything from the header (Ctrl+K or "/"): orders by number, invoice or delivery note, customers
 * by name, ID or tax ID, products, lots, suppliers, quotations, purchase requests, documents. Enter opens
 * the highlighted result. On a phone with a camera, a lot label can be scanned instead of typed.
 */
export function GlobalSearch() {
  const { t } = useLanguage();
  const bi = useBi();
  const navigate = useNavigate();
  const data = useData();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts, anywhere outside a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (
        typing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector("[role=dialog]:not([inert])")
      )
        return;
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "?") {
        setHelp(true);
      } else if (e.key === "n") {
        // The page's own "New …" button, if it has one and the role may use it.
        const btn = document.querySelector<HTMLElement>(
          "[data-shortcut=new]:not(:disabled)",
        );
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const term = norm(q);
    if (term.length < 2) return [];
    const has = (...fields: (string | undefined | null)[]) =>
      fields.some((f) => f && norm(f).includes(term));
    const out: Hit[] = [];
    const add = (_group: string, list: Hit[]) =>
      out.push(...list.slice(0, MAX_PER_GROUP));
    add(
      t("search.salesOrders"),
      data.salesOrders
        .filter((o) =>
          has(
            o.orderNo,
            o.taxInvoiceNo,
            o.deliveryNoteNo,
            o.customerName.th,
            o.customerName.en,
            o.customerId,
          ),
        )
        .map((o) => ({
          group: t("search.salesOrders"),
          title: o.orderNo,
          sub: `${bi(o.customerName)} · ${o.taxInvoiceNo !== "—" ? o.taxInvoiceNo : o.orderDate}`,
          to: paths.salesOrder(o.orderNo),
        })),
    );
    add(
      t("search.importOrders"),
      data.importOrders
        .filter((o) =>
          has(
            o.orderNo,
            o.supplier,
            o.customsDeclarationNo,
            o.logistics?.blAwbNumber,
          ),
        )
        .map((o) => ({
          group: t("search.importOrders"),
          title: o.orderNo,
          sub: `${o.supplier} · ${o.etaDate}`,
          to: paths.importOrder(o.orderNo),
        })),
    );
    add(
      t("search.customers"),
      data.customers
        .filter((c) => has(c.customerId, c.name.th, c.name.en, c.taxId))
        .map((c) => ({
          group: t("search.customers"),
          title: bi(c.name),
          sub: `${c.customerId} · ${c.taxId}`,
          to: paths.customer(c.customerId),
        })),
    );
    add(
      t("search.lots"),
      data.inventory
        .filter((i) => has(i.lotBatch))
        .map((i) => ({
          group: t("search.lots"),
          title: i.lotBatch,
          sub: `${i.productName} · ${i.quantityRemaining}`,
          to: paths.lot(i.lotBatch),
        })),
    );
    add(
      t("search.products"),
      data.products
        .filter((p) => has(p.sku, p.name, p.hsCode))
        .map((p) => ({
          group: t("search.products"),
          title: p.name,
          sub: `${p.sku} · ${p.stockAvailable}`,
          to: `/products?q=${encodeURIComponent(p.sku)}`,
        })),
    );
    add(
      t("search.suppliers"),
      data.suppliers
        .filter((s) => has(s.supplierId, s.name))
        .map((s) => ({
          group: t("search.suppliers"),
          title: s.name,
          sub: s.supplierId,
          to: `/suppliers?q=${encodeURIComponent(s.supplierId)}`,
        })),
    );
    add(t("search.documents"), [
      ...data.quotations
        .filter((x) => has(x.quoteNo, x.customerName.th, x.customerName.en))
        .map((x) => ({
          group: t("search.documents"),
          title: x.quoteNo,
          sub: bi(x.customerName),
          to: "/quotations",
        })),
      ...data.purchaseRequests
        .filter((x) => has(x.requestNo, x.sku))
        .map((x) => ({
          group: t("search.documents"),
          title: x.requestNo,
          sub: `${x.sku} × ${x.quantity}`,
          to: "/purchase-requests",
        })),
      ...data.arDocuments
        .filter((x) => has(x.docNo))
        .map((x) => ({
          group: t("search.documents"),
          title: x.docNo,
          sub: x.customerId,
          to: paths.customer(x.customerId),
        })),
      ...data.expenses
        .filter((x) => has(x.docNo, x.payee))
        .map((x) => ({
          group: t("search.documents"),
          title: x.docNo,
          sub: x.payee,
          to: "/expenses",
        })),
    ]);
    return out;
  }, [q, data, bi, t]);

  const go = (h: Hit) => {
    setOpen(false);
    navigate(h.to);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 shadow-sm hover:border-gray-300"
        aria-label={t("search.open")}
        data-testid="search-open"
      >
        <Search size={15} />
        <span className="hidden md:inline">{t("search.placeholderShort")}</span>
        <kbd className="hidden rounded border border-gray-200 px-1.5 text-[11px] text-gray-400 md:inline">
          Ctrl K
        </kbd>
      </button>

      {/* Overlays go at the top of the page: the header this sits in would otherwise clip them. */}
      {createPortal(
        <>
          {open && (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
              <div
                className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t("search.open")}
                className="relative w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
              >
                <div className="flex items-center gap-2 border-b border-gray-100 px-4">
                  <Search size={17} className="shrink-0 text-gray-400" />
                  <input
                    ref={input}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setOpen(false);
                      else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActive((a) => Math.min(hits.length - 1, a + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive((a) => Math.max(0, a - 1));
                      } else if (e.key === "Enter" && hits[active])
                        go(hits[active]);
                    }}
                    placeholder={t("search.placeholder")}
                    className="h-12 flex-1 bg-transparent text-sm outline-none"
                    data-testid="search-input"
                  />
                  {scannerAvailable() && (
                    <button
                      onClick={() => setScanning(true)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                      aria-label={t("scan.scanLabel")}
                      data-testid="search-scan"
                    >
                      <ScanLine size={17} />
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
                    aria-label={t("common.close")}
                  >
                    <X size={17} />
                  </button>
                </div>
                <ul
                  className="max-h-[60vh] overflow-y-auto py-2"
                  role="listbox"
                >
                  {q.trim().length < 2 && (
                    <li className="px-4 py-6 text-center text-sm text-gray-400">
                      {t("search.hint")}
                    </li>
                  )}
                  {q.trim().length >= 2 && hits.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-gray-400">
                      {t("common.noResults")}
                    </li>
                  )}
                  {hits.map((h, i) => (
                    <li key={`${h.group}-${h.title}-${i}`}>
                      {(i === 0 || hits[i - 1].group !== h.group) && (
                        <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {h.group}
                        </p>
                      )}
                      <button
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === active ? "bg-indigo-50" : ""}`}
                        data-testid="search-hit"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-900">
                            {h.title}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {h.sub}
                          </span>
                        </span>
                        {i === active && (
                          <kbd className="shrink-0 rounded border border-gray-200 px-1.5 text-[11px] text-gray-400">
                            Enter
                          </kbd>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
                  <span>{t("search.footer")}</span>
                  <button
                    onClick={() => {
                      setOpen(false);
                      setHelp(true);
                    }}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                  >
                    <Keyboard size={12} />
                    {t("shortcuts.title")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {scanning && (
            <Scanner
              onClose={() => setScanning(false)}
              onCode={(code) => {
                setScanning(false);
                setOpen(false);
                // A lot label holds a link to the lot's page; anything else is searched for.
                const lot = code.match(/[?&]lot=([^&]+)/)?.[1];
                if (lot) navigate(paths.lot(decodeURIComponent(lot)));
                else {
                  setQ(code);
                  setOpen(true);
                }
              }}
            />
          )}

          {help && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-ink-950/40"
                onClick={() => setHelp(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t("shortcuts.title")}
                className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
                onKeyDown={(e) => e.key === "Escape" && setHelp(false)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    {t("shortcuts.title")}
                  </h2>
                  <button
                    onClick={() => setHelp(false)}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                    aria-label={t("common.close")}
                    autoFocus
                  >
                    <X size={17} />
                  </button>
                </div>
                <ul className="space-y-2 text-sm">
                  {[
                    ["Ctrl K  /  /", t("shortcuts.search")],
                    ["n", t("shortcuts.new")],
                    ["?", t("shortcuts.help")],
                    ["Esc", t("shortcuts.close")],
                  ].map(([k, label]) => (
                    <li
                      key={k}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-gray-600">{label}</span>
                      <kbd className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                        {k}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
