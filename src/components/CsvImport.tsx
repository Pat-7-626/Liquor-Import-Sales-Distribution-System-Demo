import { useState } from "react";
import { CheckCircle2, Download, Upload, X, XCircle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import type { ActionResult } from "../lib/api";
import type { Bilingual } from "../data/types";

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes; strips a UTF-8 BOM. */
/**
 * A CSV file's text. Excel's "CSV UTF-8" and most systems write UTF-8; Thai banks and Excel's plain "CSV"
 * on a Thai Windows write Windows-874 (TIS-620). Try UTF-8 strictly, and fall back to Thai.
 */
export async function readCsvText(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-874").decode(bytes);
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export interface CsvColumn {
  key: string;
  example: string;
  required?: boolean;
}

type Row<T> = { line: number; cells: Record<string, string>; input?: T; problem?: Bilingual; result?: ActionResult };

/**
 * Bulk create from a spreadsheet. Download the template, fill it in Excel (save as CSV UTF-8), upload, check
 * the preview, import. Each row goes through the same server rules as the form, so nothing skips validation.
 */
export function CsvImportDialog<T>({
  title,
  templateName,
  columns,
  toInput,
  submit,
  onClose,
}: {
  title: string;
  templateName: string;
  columns: CsvColumn[];
  /** A row's cells → the command input, or the reason it can't be used. */
  toInput: (cells: Record<string, string>) => { input: T } | { problem: Bilingual };
  submit: (input: T) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const [rows, setRows] = useState<Row<T>[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const downloadTemplate = () => {
    const csv = [columns.map((c) => c.key).join(","), columns.map((c) => csvCell(c.example)).join(",")].join("\r\n");
    // BOM so Excel opens the Thai text correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${templateName}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const load = async (file: File) => {
    setFileError(null);
    const parsed = parseCsv(await readCsvText(file));
    if (parsed.length < 2) return setFileError(t("csv.empty"));
    const header = parsed[0].map((h) => h.trim());
    const missing = columns.filter((c) => c.required && !header.includes(c.key)).map((c) => c.key);
    if (missing.length) return setFileError(t("csv.missingColumns").replace("{cols}", missing.join(", ")));
    if (parsed.length > 501) return setFileError(t("csv.tooMany"));
    setRows(
      parsed.slice(1).map((cells, i) => {
        const record = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()]));
        const r = toInput(record);
        return { line: i + 2, cells: record, ...("input" in r ? { input: r.input } : { problem: r.problem }) };
      }),
    );
  };

  const importAll = async () => {
    if (!rows) return;
    setRunning(true);
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      if (!r.input || r.result?.ok) continue;
      next[i] = { ...r, result: await submit(r.input) };
      setRows([...next]);
    }
    setRunning(false);
  };

  const ready = rows?.filter((r) => r.input && !r.result?.ok).length ?? 0;
  const done = rows?.filter((r) => r.result?.ok).length ?? 0;
  const failed = rows?.filter((r) => r.problem || (r.result && !r.result.ok)).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={running ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{t("csv.hint")}</p>
          </div>
          <button onClick={onClose} disabled={running} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-6 py-4">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download size={15} />
            {t("csv.template")}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Upload size={15} />
            {t("csv.choose")}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} data-testid="csv-file" />
          </label>
          {rows && (
            <span className="text-sm text-gray-600">
              {t("csv.summary").replace("{ready}", String(ready)).replace("{done}", String(done)).replace("{failed}", String(failed))}
            </span>
          )}
        </div>
        {fileError && <p className="mx-6 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{fileError}</p>}
        {rows && (
          <div className="mx-6 mb-4 flex-1 overflow-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  {columns.slice(0, 5).map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      {c.key}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const error = r.problem ?? (r.result && !r.result.ok ? r.result.error : undefined);
                  return (
                    <tr key={r.line} data-testid="csv-row">
                      <td className="px-3 py-1.5 text-gray-400">{r.line}</td>
                      {columns.slice(0, 5).map((c) => (
                        <td key={c.key} className="max-w-[10rem] truncate px-3 py-1.5 text-gray-700">
                          {r.cells[c.key]}
                        </td>
                      ))}
                      <td className="px-3 py-1.5">
                        {r.result?.ok ? (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={14} />
                            {t("csv.imported")}
                          </span>
                        ) : error ? (
                          <span className="flex items-center gap-1 text-rose-700">
                            <XCircle size={14} />
                            {error[lang]}
                          </span>
                        ) : (
                          <span className="text-gray-500">{t("csv.ready")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} disabled={running} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t("common.close")}
          </button>
          <button
            onClick={importAll}
            disabled={!ready || running}
            data-testid="csv-import"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {running ? t("csv.importing") : t("csv.importN").replace("{n}", String(ready))}
          </button>
        </div>
      </div>
    </div>
  );
}
