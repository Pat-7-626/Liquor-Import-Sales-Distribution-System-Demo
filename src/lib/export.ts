/**
 * BR-07: exports. Spreadsheets are real .xlsx files: bilingual column headings (Thai over English), numbers
 * as numbers with thousands separators, dates as dates, IDs kept as text (so a tax ID keeps its leading
 * zero), a frozen heading row and sensible column widths. PDF is the browser's own print dialog.
 */
import type { Bilingual } from "../data/types";

/** A column heading: a plain string, or Thai and English (printed on two lines). */
export type ExportHeader = string | Bilingual;
type ExportValue = string | number | null | undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

type Kind = "number" | "date" | "timestamp" | "text";

/** A column is numeric/date only if every filled cell is; anything mixed stays text. */
function kindOf(rows: ExportValue[][], col: number): Kind {
  let kind: Kind | null = null;
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined || v === "") continue;
    const k: Kind = typeof v === "number" ? "number" : DATE.test(v) ? "date" : TIMESTAMP.test(v) ? "timestamp" : "text";
    if (kind && kind !== k) return "text";
    kind = k;
  }
  return kind ?? "text";
}

/** Excel stores a date without a time zone: give it the wall-clock date/time people saw on screen. */
const wallClock = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
const dateOnly = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));

export async function exportToExcel(filename: string, headers: ExportHeader[], rows: ExportValue[][]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const kinds = headers.map((_, i) => kindOf(rows, i));
  const decimals = headers.map((_, i) => kinds[i] === "number" && rows.some((r) => typeof r[i] === "number" && !Number.isInteger(r[i])));
  const headerText = (h: ExportHeader) => (typeof h === "string" ? h : h.th === h.en ? h.th : `${h.th}\n${h.en}`);

  const headerRow = headers.map((h, i) => ({
    value: headerText(h),
    fontWeight: "bold" as const,
    wrap: true,
    alignVertical: "center" as const,
    align: kinds[i] === "number" ? ("right" as const) : ("left" as const),
    backgroundColor: "#F3F1EC",
    bottomBorderStyle: "thin" as const,
    bottomBorderColor: "#9C9384",
  }));
  const body = rows.map((row) =>
    headers.map((_, i) => {
      const v = row[i];
      if (v === null || v === undefined || v === "") return null;
      if (kinds[i] === "number" && typeof v === "number") return { value: v, type: Number, format: decimals[i] ? "#,##0.00" : "#,##0" };
      if (kinds[i] === "date" && typeof v === "string") return { value: dateOnly(v), type: Date, format: "dd/mm/yyyy" };
      if (kinds[i] === "timestamp" && typeof v === "string") return { value: wallClock(new Date(v)), type: Date, format: "dd/mm/yyyy hh:mm" };
      return { value: String(v), type: String };
    }),
  );

  // Width: the longest heading line or value, within reason.
  const widths = headers.map((h, i) => {
    const longest = Math.max(
      ...headerText(h).split("\n").map((l) => l.length),
      ...rows.slice(0, 500).map((r) => (r[i] === null || r[i] === undefined ? 0 : kinds[i] === "number" ? String(Math.round(Number(r[i]))).length + 4 : String(r[i]).length)),
    );
    return { width: Math.min(60, Math.max(kinds[i] === "date" ? 12 : kinds[i] === "timestamp" ? 17 : 8, longest + 2)) };
  });

  await writeXlsxFile([headerRow, ...body], { columns: widths, stickyRowsCount: 1, sheet: filename.slice(0, 31) }).toFile(
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}

/** Prints the current page via the browser's native "Save as PDF" — no library needed. Pair with @media print CSS. */
export function exportToPdf() {
  window.print();
}
