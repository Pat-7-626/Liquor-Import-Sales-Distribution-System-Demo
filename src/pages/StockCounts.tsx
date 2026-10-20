import { useState } from "react";
import { ClipboardCheck, Printer, X, ScanLine } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { NewButton } from "../components/NewButton";
import { Dialog, DialogActions } from "../components/Dialog";
import { FieldLabel, inputClass, selectClass } from "../components/FormKit";
import { Both, DocDate, DocTh, DocumentHeader, PrintFrame, Signatures } from "../components/TaxDocument";
import { useRunAction } from "../lib/useRunAction";
import { formatDate, formatNumber } from "../lib/format";
import type { StockCount } from "../data/types";
import { Scanner, scannerAvailable } from "../components/Scanner";

const TONE: Record<StockCount["status"], string> = {
  open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  posted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

/** Count a warehouse, enter what was found, post the differences as stock adjustments in one go. */
export default function StockCounts() {
  const { t } = useLanguage();
  const { can } = useRole();
  const { stockCounts, warehouses } = useData();
  const [starting, setStarting] = useState(false);
  const [sheet, setSheet] = useState<StockCount | null>(null);
  const counts = [...stockCounts].sort((a, b) => (a.status === "open" ? -1 : 0) - (b.status === "open" ? -1 : 0) || b.countNo.localeCompare(a.countNo));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow={t("nav.group.inventory")} title={t("sc.title")} subtitle={t("sc.subtitle")} />
        <NewButton label={t("sc.start")} allowed={can("adjustInventory") && warehouses.some((w) => w.active)} onClick={() => setStarting(true)} />
      </div>
      {counts.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">{t("sc.none")}</p>}
      <div className="space-y-4">
        {counts.map((c) => (
          <CountCard key={c.countNo} count={c} onPrint={() => setSheet(c)} />
        ))}
      </div>
      {starting && <StartDialog onClose={() => setStarting(false)} />}
      {sheet && <CountSheet count={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function CountCard({ count: c, onPrint }: { count: StockCount; onPrint: () => void }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can } = useRole();
  const runAction = useRunAction();
  const { products, warehouses, enterStockCount, postStockCount, cancelStockCount } = useData();
  const editable = c.status === "open" && can("adjustInventory");
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  // A scanned label holds a link to its lot: find that line and put the cursor in its count.
  const onScan = (code: string) => {
    setScanning(false);
    const lot = decodeURIComponent(code.match(/[?&]lot=([^&]+)/)?.[1] ?? code).trim();
    const input = document.querySelector<HTMLInputElement>(`[data-count="${c.countNo}"] [data-lot="${CSS.escape(lot)}"] input`);
    if (input) {
      input.scrollIntoView({ block: "center" });
      input.focus();
      input.select();
      setScanNote(null);
    } else setScanNote(t("scan.notOnCount").replace("{lot}", lot));
  };
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(c.lines.map((l) => [l.lotBatch, l.counted === null ? "" : String(l.counted)])));
  // Keep the inputs in step when the saved count changes (another person saving, posting).
  const [base, setBase] = useState(c);
  if (base !== c) {
    setBase(c);
    setDraft(Object.fromEntries(c.lines.map((l) => [l.lotBatch, l.counted === null ? "" : String(l.counted)])));
  }
  const value = (lot: string) => (draft[lot] === "" || draft[lot] === undefined ? null : Number(draft[lot]));
  const dirty = c.lines.some((l) => value(l.lotBatch) !== l.counted);
  const valid = c.lines.every((l) => value(l.lotBatch) === null || (Number.isInteger(value(l.lotBatch)) && value(l.lotBatch)! >= 0));
  const counted = c.lines.filter((l) => value(l.lotBatch) !== null).length;
  const diffs = c.lines.filter((l) => value(l.lotBatch) !== null && value(l.lotBatch) !== l.expected);
  const wh = warehouses.find((w) => w.code === c.warehouse);
  const name = (sku: string) => products.find((p) => p.sku === sku)?.name ?? sku;

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="stock-count" data-count={c.countNo} data-status={c.status}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-900">{c.countNo}</span>
          <span className="text-gray-600">{wh ? bi(wh.name) : c.warehouse}</span>
          <span className="text-gray-400">{formatDate(c.date, lang)}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[c.status]}`}>{t(`sc.status.${c.status}`)}</span>
          {c.note && <span className="text-xs text-gray-500">· {c.note}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {t("sc.progress").replace("{n}", String(counted)).replace("{total}", String(c.lines.length))}
          {editable && scannerAvailable() && (
            <button onClick={() => setScanning(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-indigo-600 hover:bg-indigo-50" data-testid={`count-scan-${c.countNo}`}>
              <ScanLine size={13} />
              {t("scan.scanLabel")}
            </button>
          )}
          {c.status !== "cancelled" && (
            <button onClick={onPrint} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-indigo-600 hover:bg-indigo-50">
              <Printer size={13} />
              {t("sc.sheet")}
            </button>
          )}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t("inventory.col.lotBatch")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("products.col.name")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("sc.expected")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("sc.counted")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("sc.difference")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {c.lines.map((l) => {
              const v = value(l.lotBatch);
              const d = v === null ? null : v - l.expected;
              return (
                <tr key={l.lotBatch} data-testid="count-line" data-lot={l.lotBatch}>
                  <td className="px-4 py-2 font-medium text-gray-900">{l.lotBatch}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {name(l.sku)}
                    <span className="block text-xs text-gray-400">{l.sku}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(l.expected, lang, 0)}</td>
                  <td className="px-4 py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft[l.lotBatch] ?? ""}
                        onChange={(e) => setDraft((x) => ({ ...x, [l.lotBatch]: e.target.value }))}
                        className={`${inputClass} ml-auto w-24! text-right`}
                        aria-label={`${t("sc.counted")} ${l.lotBatch}`}
                      />
                    ) : (
                      <span className="tabular-nums">{l.counted ?? "—"}</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium tabular-nums ${d === null || d === 0 ? "text-gray-400" : d > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {d === null ? "—" : d === 0 ? "0" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {scanning && <Scanner onCode={onScan} onClose={() => setScanning(false)} />}
      {scanNote && <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{scanNote}</p>}
      {editable && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
          <span className="text-xs text-gray-500">{diffs.length ? t("sc.differences").replace("{n}", String(diffs.length)) : t("sc.noDifferences")}</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runAction(cancelStockCount(c.countNo), t("sc.cancelledToast"))}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              <X size={13} />
              {t("sc.cancel")}
            </button>
            <button
              onClick={() =>
                runAction(
                  enterStockCount(
                    c.countNo,
                    c.lines.map((l) => ({ lotBatch: l.lotBatch, counted: value(l.lotBatch) })),
                  ),
                  t("sc.savedToast"),
                )
              }
              disabled={!dirty || !valid}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`count-save-${c.countNo}`}
            >
              {t("sc.save")}
            </button>
            <button
              onClick={async () => {
                if (dirty && !(await runAction(enterStockCount(c.countNo, c.lines.map((l) => ({ lotBatch: l.lotBatch, counted: value(l.lotBatch) }))), t("sc.savedToast")))) return;
                if (!window.confirm(t("sc.postConfirm").replace("{n}", String(diffs.length)))) return;
                await runAction(postStockCount(c.countNo), t("sc.postedToast"));
              }}
              disabled={!valid || counted < c.lines.length}
              title={counted < c.lines.length ? t("sc.countAllFirst") : undefined}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              data-testid={`count-post-${c.countNo}`}
            >
              <ClipboardCheck size={13} />
              {t("sc.post")}
            </button>
          </div>
        </footer>
      )}
      {c.status === "posted" && (
        <footer className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          {t("sc.postedBy").replace("{who}", c.postedBy ? bi(c.postedBy) : "—").replace("{d}", c.postedOn ? formatDate(c.postedOn, lang) : "—")}
        </footer>
      )}
    </section>
  );
}

function StartDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { warehouses, inventory, stockCounts, startStockCount } = useData();
  const usable = warehouses.filter((w) => w.active && inventory.some((i) => i.warehouse === w.code && i.quantityRemaining > 0) && !stockCounts.some((c) => c.warehouse === w.code && c.status === "open"));
  const [warehouse, setWarehouse] = useState(usable[0]?.code ?? "");
  const [note, setNote] = useState("");
  return (
    <Dialog title={t("sc.start")} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (warehouse && (await runAction(startStockCount(warehouse, note), t("sc.startedToast")))) onClose();
        }}
      >
        <label className="block">
          <FieldLabel>{t("inventory.col.warehouse")}</FieldLabel>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={selectClass} data-testid="count-warehouse">
            {usable.map((w) => (
              <option key={w.code} value={w.code}>
                {bi(w.name)}
              </option>
            ))}
          </select>
          {usable.length === 0 && <span className="mt-1 block text-xs text-gray-500">{t("sc.noWarehouse")}</span>}
        </label>
        <label className="block">
          <FieldLabel>{t("sc.note")}</FieldLabel>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder={t("sc.notePlaceholder")} />
        </label>
        <p className="text-xs text-gray-500">{t("sc.startExplain")}</p>
        <DialogActions onCancel={onClose} submitLabel={t("sc.start")} disabled={!warehouse} testid="count-start" />
      </form>
    </Dialog>
  );
}

/** The sheet counters take round the warehouse: no expected figures, so they count what's really there. */
function CountSheet({ count: c, onClose }: { count: StockCount; onClose: () => void }) {
  const { products, warehouses } = useData();
  const wh = warehouses.find((w) => w.code === c.warehouse);
  return (
    <PrintFrame onClose={onClose}>
      <DocumentHeader
        title={{ th: "ใบตรวจนับสินค้า", en: "Stock Count Sheet" }}
        note="ไม่แสดงจำนวนตามระบบ ให้นับตามจริง / System quantities are left off — count what's there"
        meta={[
          { label: { th: "เลขที่", en: "No." }, value: c.countNo },
          { label: { th: "วันที่", en: "Date" }, value: <DocDate iso={c.date} /> },
          { label: { th: "คลัง", en: "Warehouse" }, value: wh ? <Both th={wh.name.th} en={wh.name.en} /> : c.warehouse },
        ]}
        internal
      />
      <table className="w-full border border-gray-300 text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <DocTh th="ลำดับ" en="No." align="center" className="w-10 border border-gray-300" />
            <DocTh th="ล็อต" en="Lot/Batch" className="border border-gray-300" />
            <DocTh th="รายการ" en="Description" className="border border-gray-300" />
            <DocTh th="นับได้" en="Counted" align="right" className="w-32 border border-gray-300" />
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l, i) => (
            <tr key={l.lotBatch}>
              <td className="border border-gray-300 px-3 py-3 text-center text-gray-500">{i + 1}</td>
              <td className="border border-gray-300 px-3 py-3 font-medium">{l.lotBatch}</td>
              <td className="border border-gray-300 px-3 py-3">
                {products.find((p) => p.sku === l.sku)?.name ?? l.sku}
                <span className="block text-xs text-gray-400">{l.sku}</span>
              </td>
              <td className="border border-gray-300 px-3 py-3"></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Signatures left={{ th: "ผู้ตรวจนับ", en: "Counted by" }} right={{ th: "ผู้ตรวจสอบ", en: "Checked by" }} />
    </PrintFrame>
  );
}
