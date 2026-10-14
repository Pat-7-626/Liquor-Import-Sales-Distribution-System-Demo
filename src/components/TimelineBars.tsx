import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { todayIso } from "../lib/business";

export interface TimelineRow {
  key: string;
  label: ReactNode;
  sublabel?: ReactNode;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  /** Bar colour: validity that's fine, close to running out, or over. */
  tone: "green" | "amber" | "red" | "gray";
  /** Text at the end of the bar, e.g. "expires in 12 days". */
  note?: string;
  href?: string;
  /** A button beside the label, e.g. Renew. */
  action?: ReactNode;
}

const BAR: Record<TimelineRow["tone"], string> = {
  green: "bg-emerald-500/85",
  amber: "bg-amber-500/90",
  red: "bg-rose-500/80",
  gray: "bg-gray-300",
};

const DAY = 86_400_000;
const ms = (d: string) => new Date(`${d}T00:00:00`).getTime();

/**
 * Periods on a shared time axis (validity of licenses, contracts…), with a line at today. The window
 * runs from `monthsBack` before today to `monthsAhead` after it; bars that run past an edge are cut
 * with a fade so it's clear they continue.
 */
export function TimelineBars({ rows, monthsBack = 12, monthsAhead = 18 }: { rows: TimelineRow[]; monthsBack?: number; monthsAhead?: number }) {
  const { t, lang } = useLanguage();
  const today = todayIso();
  const t0 = new Date(`${today}T00:00:00`);
  const from = new Date(t0.getFullYear(), t0.getMonth() - monthsBack, 1).getTime();
  const to = new Date(t0.getFullYear(), t0.getMonth() + monthsAhead + 1, 1).getTime();
  const span = to - from;
  const pct = (time: number) => Math.min(100, Math.max(0, ((time - from) / span) * 100));
  const todayPct = pct(t0.getTime());

  // A tick at the start of every quarter in the window.
  const ticks: { at: number; label: string }[] = [];
  for (let d = new Date(from); d.getTime() < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    if (d.getMonth() % 3 === 0)
      ticks.push({ at: pct(d.getTime()), label: new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { month: "short", year: "numeric" }).format(d) });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-y-1 md:grid-cols-[15rem_1fr] md:gap-x-4">
        {/* Axis */}
        <div className="hidden md:block" />
        <div className="relative mb-2 h-5 text-[11px] text-gray-500">
          {ticks.map((tk) => (
            <span key={tk.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${tk.at}%` }}>
              {tk.label}
            </span>
          ))}
        </div>

        {rows.map((r) => {
          const s = ms(r.start);
          const e = ms(r.end) + DAY;
          const left = pct(s);
          const right = pct(e);
          const width = Math.max(right - left, 0.6);
          const cutStart = s < from;
          const cutEnd = e > to;
          const label = (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{r.label}</p>
              {r.sublabel && <p className="truncate text-xs text-gray-500">{r.sublabel}</p>}
            </div>
          );
          return (
            <div key={r.key} className="contents">
              <div className="flex items-center justify-between gap-2 pt-2 md:py-2" data-row={r.key}>
                {r.href ? (
                  <Link to={r.href} className="min-w-0 hover:text-indigo-600">
                    {label}
                  </Link>
                ) : (
                  label
                )}
                {r.action}
              </div>
              <div className="relative h-10 border-b border-gray-100 md:h-auto md:min-h-[2.75rem]">
                {/* quarter gridlines */}
                {ticks.map((tk) => (
                  <span key={tk.at} className="absolute inset-y-0 w-px bg-gray-100" style={{ left: `${tk.at}%` }} />
                ))}
                <span className="absolute inset-y-0 z-10 w-0.5 bg-gray-900/70" style={{ left: `${todayPct}%` }} />
                {e > from && s < to && (
                  <div
                    className={`absolute top-1/2 h-4 -translate-y-1/2 ${BAR[r.tone]} ${cutStart ? "rounded-r" : cutEnd ? "rounded-l" : "rounded"}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      maskImage: cutEnd ? "linear-gradient(to right, black 85%, transparent)" : cutStart ? "linear-gradient(to left, black 85%, transparent)" : undefined,
                    }}
                    title={`${r.start} → ${r.end}`}
                  />
                )}
                {r.note && (
                  <span
                    className={`absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded bg-white px-1 text-[11px] font-medium ${
                      r.tone === "red" ? "text-rose-700" : r.tone === "amber" ? "text-amber-700" : "text-gray-600"
                    }`}
                    style={right > 78 ? { right: `${100 - Math.min(right, 100) + 0.5}%` } : { left: `${Math.min(right, 100) + 0.5}%` }}
                  >
                    {r.note}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <span className="inline-block h-3 w-0.5 bg-gray-900/70" />
        {t("calendar.today")}
      </p>
    </div>
  );
}
