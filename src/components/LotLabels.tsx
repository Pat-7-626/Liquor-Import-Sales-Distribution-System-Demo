import { useState } from "react";
import type { InventoryItem } from "../data/types";
import { useData } from "../state/DataContext";
import { useLanguage } from "../i18n/LanguageContext";
import { formatDate } from "../lib/format";
import { useWarehouseName } from "../lib/useWarehouseName";
import { PrintFrame } from "./TaxDocument";
import { QrCode } from "./QrCode";

/** What a lot label's QR code holds: a link to the lot, so any phone camera opens it — no app needed. */
export const lotLabelUrl = (lotBatch: string) => `${window.location.origin}/lot-trace?lot=${encodeURIComponent(lotBatch)}`;

/**
 * Sticker labels for lots — cases and shelves — with a QR code to the lot's page: scan to see where it came
 * from, what's left, and who it was sold to, or to find it on a stock count.
 */
export function LotLabels({ lots, onClose }: { lots: InventoryItem[]; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { products } = useData();
  const warehouseName = useWarehouseName();
  const [copies, setCopies] = useState(1);
  const labels = lots.flatMap((l) => Array.from({ length: copies }, () => l));
  return (
    <PrintFrame
      onClose={onClose}
      extra={
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          {t("labels.copies")}
          <input
            type="number"
            min={1}
            max={50}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(50, Math.round(Number(e.target.value)) || 1)))}
            className="w-14 rounded border border-gray-300 px-1.5 py-1"
            data-testid="label-copies"
          />
        </label>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
        {labels.map((l, i) => {
          const p = products.find((x) => x.sku === l.sku);
          return (
            <div key={`${l.lotBatch}-${i}`} className="flex items-center gap-3 rounded-lg border border-dashed border-gray-400 p-3" style={{ breakInside: "avoid" }} data-testid="lot-label">
              <QrCode value={lotLabelUrl(l.lotBatch)} className="h-24 w-24 shrink-0" alt={l.lotBatch} />
              <div className="min-w-0 text-xs leading-snug">
                <p className="font-mono text-sm font-bold text-gray-900">{l.lotBatch}</p>
                <p className="mt-0.5 font-medium text-gray-800">{l.productName}</p>
                <p className="text-gray-600">
                  {l.sku}
                  {p ? ` · ${p.packageSize} ml · ${p.abv}%` : ""}
                </p>
                <p className="mt-1 text-gray-500">
                  {t("labels.received")} {formatDate(l.receivedDate, lang)}
                </p>
                <p className="text-gray-500">{warehouseName(l.warehouse)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </PrintFrame>
  );
}
