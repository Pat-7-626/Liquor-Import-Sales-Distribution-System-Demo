import { useRef, useState, type ReactNode, type FocusEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Lock, Table2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useRole } from "../state/RoleContext";
import { SERIES, MUTED_MARK, niceTicks, PERIODS, type Period } from "../lib/analytics";

/*
 * Chart kit — plain HTML/CSS marks (no chart library), built to the dataviz spec:
 * bars ≤ 24px thick with a 4px rounded data-end and a square baseline; solid hairline grid;
 * 2px surface gap between stacked segments; text in ink tokens, never the series colour;
 * a legend for ≥ 2 series; tooltip on hover *and* keyboard focus; every chart has a table view.
 */

// ───────────────────────────── Tooltip ─────────────────────────────

interface TipRow {
  label: string;
  value: string;
  color?: string;
}
interface Tip {
  x: number;
  y: number;
  /** Container width at placement time — used to keep the tooltip inside the card. */
  width: number;
  title: string;
  rows: TipRow[];
}

/** One tooltip per chart, positioned inside the chart's relative container. */
function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const place = (clientX: number, clientY: number, title: string, rows: TipRow[]) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: clientX - box.left, y: clientY - box.top, width: box.width, title, rows });
  };
  const handlers = (title: string, rows: TipRow[]) => ({
    onPointerMove: (e: PointerEvent) => place(e.clientX, e.clientY, title, rows),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, title, rows);
    },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-36 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg"
      style={{
        left: Math.min(Math.max(tip.x, 80), Math.max(80, tip.width - 80)),
        top: tip.y,
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <p className="mb-1 text-xs text-gray-500">{tip.title}</p>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-gray-600">
            {r.color && <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          {/* Values lead: the number is the strong element. */}
          <span className="font-semibold tabular-nums text-gray-900">{r.value}</span>
        </div>
      ))}
    </div>
  );
  return { ref, handlers, node };
}

// ───────────────────────────── Card & controls ─────────────────────────────

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Chart frame: title, optional subtitle, Chart/Table toggle. `sensitive` charts (money) show a lock
 * for roles that can't see prices — the same rule as <Masked>, applied to the whole chart.
 */
export function ChartCard({
  title,
  subtitle,
  table,
  sensitive,
  wide,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  table?: TableView;
  sensitive?: boolean;
  wide?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const { canViewSensitive } = useRole();
  const [view, setView] = useState<"chart" | "table">("chart");
  const locked = sensitive && !canViewSensitive;

  return (
    <section className={`flex flex-col rounded-xl border border-gray-200/80 bg-white shadow-sm ${wide ? "lg:col-span-2" : ""}`}>
      <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && !locked && (
            <div role="group" aria-label={t("viz.view")} className="flex rounded-lg border border-gray-200 p-0.5">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  title={t(`viz.${v}`)}
                  className={`rounded-md p-1 transition-colors ${view === v ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
                >
                  {v === "chart" ? <BarChart3 size={14} /> : <Table2 size={14} />}
                  <span className="sr-only">{t(`viz.${v}`)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="flex-1 px-5 pb-5 pt-3">
        {locked ? (
          <p className="flex h-full min-h-32 items-center justify-center gap-1.5 rounded-lg bg-gray-50 text-sm text-gray-500">
            <Lock size={14} />
            {t("common.restrictedTooltip")}
          </p>
        ) : view === "table" && table ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={`px-3 py-2 text-xs font-semibold text-gray-600 ${i === 0 ? "text-left" : "text-right"}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td key={ci} className={`px-3 py-2 tabular-nums ${ci === 0 ? "text-left text-gray-800" : "text-right text-gray-700"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** One filter row above everything it scopes. */
export function PeriodFilter({ value, onChange, note }: { value: Period; onChange: (p: Period) => void; note?: string }) {
  const { t } = useLanguage();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div role="group" aria-label={t("viz.period")} className="flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={value === p}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value === p ? "bg-ink-900 text-gold-100" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {t(`viz.periods.${p}`)}
          </button>
        ))}
      </div>
      {note && <p className="text-xs text-gray-500">{note}</p>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────────── KPI tile ─────────────────────────────

/** Stat tile: label · value (sans, proportional figures) · optional hint/delta. The number is the chart. */
export function KpiTile({
  label,
  value,
  hint,
  tone = "default",
  sensitive,
  to,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "default" | "good" | "warning" | "critical";
  sensitive?: boolean;
  to?: string;
}) {
  const { canViewSensitive } = useRole();
  const toneClass = tone === "critical" ? "text-rose-700" : tone === "warning" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-gray-900";
  const body = (
    <>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-[26px] font-semibold leading-none tracking-[-0.01em] ${toneClass}`}>
        {sensitive && !canViewSensitive ? (
          <span className="inline-flex items-center gap-1 text-xl text-gray-400">
            <Lock size={14} />
            ••••••
          </span>
        ) : (
          value
        )}
      </p>
      {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm";
  return to ? (
    <Link to={to} className={`${cls} transition-shadow hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ───────────────────────────── Bar list (horizontal bars) ─────────────────────────────

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Formatted value shown at the bar tip and in the tooltip. */
  display: string;
  sublabel?: string;
  href?: string;
  /** Emphasis form: when any item is emphasized, the rest go to the de-emphasis grey. */
  emphasized?: boolean;
  /** Optional element after the label (e.g. a status badge) — meaning never rides on colour alone. */
  badge?: ReactNode;
}

/** Horizontal bars for comparing magnitude across named categories — one series, one colour. */
export function BarList({ items, color = SERIES[0], emptyLabel, max: maxOverride }: { items: BarItem[]; color?: string; emptyLabel?: string; max?: number }) {
  const { t } = useLanguage();
  const { ref, handlers, node } = useTooltip();
  const max = maxOverride ?? Math.max(0, ...items.map((i) => i.value));
  const anyEmphasis = items.some((i) => i.emphasized);
  if (items.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{emptyLabel ?? t("viz.noData")}</p>;

  return (
    <div ref={ref} className="relative">
      <ul className="space-y-3">
        {items.map((it) => {
          const pct = max > 0 ? (it.value / max) * 100 : 0;
          const fill = anyEmphasis && !it.emphasized ? MUTED_MARK : color;
          return (
            <li key={it.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {it.href ? (
                    <Link to={it.href} className="truncate text-sm text-gray-800 hover:text-indigo-700 hover:underline">
                      {it.label}
                    </Link>
                  ) : (
                    <span className="truncate text-sm text-gray-800">{it.label}</span>
                  )}
                  {it.badge}
                  {it.sublabel && <span className="shrink-0 truncate text-xs text-gray-500">{it.sublabel}</span>}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">{it.display}</span>
              </div>
              <div
                tabIndex={0}
                aria-label={`${it.label}: ${it.display}`}
                className="group -my-1 py-1 outline-none"
                {...handlers(it.label, [{ label: it.sublabel ?? "", value: it.display, color: fill }])}
              >
                <div
                  className="h-2.5 rounded-r-[4px] transition-[filter] group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-indigo-300"
                  style={{ width: `${Math.max(pct, it.value > 0 ? 1 : 0)}%`, background: fill }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {node}
    </div>
  );
}

// ───────────────────────────── Column chart (time series) ─────────────────────────────

export interface ColumnSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Vertical columns over an ordered axis (months). One series → single colour, no legend.
 * Several series → stacked with a 2px surface gap and a legend. One y-axis only.
 */
export function ColumnChart({
  categories,
  series,
  values,
  format,
  formatTick,
  height = 200,
  emptyLabel,
  grouped,
}: {
  categories: { key: string; label: string }[];
  series: ColumnSeries[];
  values: Record<string, Record<string, number>>;
  format: (n: number) => string;
  formatTick: (n: number) => string;
  height?: number;
  emptyLabel?: string;
  /** Side-by-side columns instead of a stack — for series that shouldn't be summed (in vs out). */
  grouped?: boolean;
}) {
  const { t } = useLanguage();
  const { ref, handlers, node } = useTooltip();
  const totals = categories.map((c) => series.reduce((s, se) => s + (values[c.key]?.[se.key] ?? 0), 0));
  const peaks = categories.map((c) => Math.max(0, ...series.map((se) => values[c.key]?.[se.key] ?? 0)));
  const ticks = niceTicks(Math.max(0, ...(grouped ? peaks : totals)));
  const top = ticks[ticks.length - 1] || 1;
  if (categories.length === 0 || totals.every((v) => v === 0))
    return <p className="py-8 text-center text-sm text-gray-500">{emptyLabel ?? t("viz.noData")}</p>;

  return (
    <div ref={ref} className="relative">
      {series.length > 1 && (
        <div className="mb-3">
          <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
        </div>
      )}
      {/* pt-3: headroom so the top tick label never collides with the card header */}
      <div className="flex pt-3">
        {/* y-axis ticks */}
        <div className="relative mr-2 w-12 shrink-0 text-right text-xs tabular-nums text-gray-500" style={{ height }}>
          {ticks.map((tk) => (
            <span key={tk} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(tk / top) * 100}%` }}>
              {formatTick(tk)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((tk) => (
              <div
                key={tk}
                className={`absolute inset-x-0 h-px ${tk === 0 ? "bg-gray-300" : "bg-gray-100"}`}
                style={{ bottom: `${(tk / top) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end justify-around gap-1">
              {categories.map((c, ci) => {
                const total = totals[ci];
                const rows: TipRow[] = series.map((se) => ({ label: se.label, value: format(values[c.key]?.[se.key] ?? 0), color: se.color }));
                if (series.length > 1 && !grouped) rows.push({ label: t("viz.total"), value: format(total) });
                return (
                  <div
                    key={c.key}
                    tabIndex={0}
                    aria-label={`${c.label}: ${format(total)}`}
                    className="group flex h-full flex-1 cursor-default items-end justify-center gap-[2px] outline-none"
                    {...handlers(c.label, rows)}
                  >
                    {grouped ? (
                      series.map((se) => {
                        const v = values[c.key]?.[se.key] ?? 0;
                        return (
                          <div
                            key={se.key}
                            className="w-full max-w-6 rounded-t-[4px] transition-[filter] group-hover:brightness-110"
                            style={{ height: `${(v / top) * 100}%`, minHeight: v > 0 ? 2 : 0, background: se.color }}
                          />
                        );
                      })
                    ) : (
                    <div
                      className="flex w-full max-w-6 flex-col-reverse gap-[2px] transition-[filter] group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-indigo-300"
                      style={{ height: `${(total / top) * 100}%` }}
                    >
                      {series.map((se, si) => {
                        const v = values[c.key]?.[se.key] ?? 0;
                        if (v <= 0) return null;
                        const isTop = series.slice(si + 1).every((s2) => (values[c.key]?.[s2.key] ?? 0) <= 0);
                        return (
                          <div
                            key={se.key}
                            className={isTop ? "rounded-t-[4px]" : ""}
                            style={{ flexGrow: v, flexBasis: 0, minHeight: 2, background: se.color }}
                          />
                        );
                      })}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex justify-around gap-1">
            {categories.map((c, i) => (
              // Many months on a phone: label every other column rather than truncating them all.
              <span key={c.key} className={`flex-1 truncate text-center text-xs text-gray-500 ${categories.length > 6 && i % 2 === 1 ? "invisible sm:visible" : ""}`}>
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}

// ───────────────────────────── Stacked bar (part-to-whole) ─────────────────────────────

/** One 100% bar split into ≤ 4 parts, with a legend that carries each part's value and share. */
export function StackedBar({ segments, format }: { segments: { key: string; label: string; value: number; color: string }[]; format: (n: number) => string }) {
  const { t } = useLanguage();
  const { ref, handlers, node } = useTooltip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="py-8 text-center text-sm text-gray-500">{t("viz.noData")}</p>;
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div ref={ref} className="relative">
      <div className="flex h-4 gap-[2px]">
        {visible.map((s, i) => (
          <div
            key={s.key}
            tabIndex={0}
            aria-label={`${s.label}: ${format(s.value)}`}
            className={`h-full outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-300 ${i === 0 ? "rounded-l-[4px]" : ""} ${
              i === visible.length - 1 ? "rounded-r-[4px]" : ""
            }`}
            style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
            {...handlers(s.label, [{ label: `${Math.round((s.value / total) * 100)}%`, value: format(s.value), color: s.color }])}
          />
        ))}
      </div>
      <ul className={`mt-4 grid grid-cols-1 gap-x-6 gap-y-2 ${segments.length > 3 ? "sm:grid-cols-2" : ""}`}>
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-gray-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-gray-900">{format(s.value)}</span>
              <span className="ml-1.5 text-gray-500">{Math.round((s.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}

// ───────────────────────────── Meter ─────────────────────────────

const METER_TONES = {
  normal: { fill: SERIES[2], track: "#e3ecf6" },
  warning: { fill: "#d08a00", track: "#fbefd6" },
  critical: { fill: "#c2334d", track: "#f8e1e5" },
};

/** A ratio against a limit. The fill carries severity; the track is a lighter step of the same hue. */
export function Meter({
  label,
  href,
  ratio,
  display,
  warnAt = 0.8,
  criticalAt = 1,
  badge,
}: {
  label: string;
  href?: string;
  ratio: number;
  display: string;
  warnAt?: number;
  criticalAt?: number;
  badge?: ReactNode;
}) {
  const tone = ratio >= criticalAt ? "critical" : ratio >= warnAt ? "warning" : "normal";
  const { fill, track } = METER_TONES[tone];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {href ? (
            <Link to={href} className="truncate text-sm text-gray-800 hover:text-indigo-700 hover:underline">
              {label}
            </Link>
          ) : (
            <span className="truncate text-sm text-gray-800">{label}</span>
          )}
          {badge}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-gray-700">{display}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full"
        style={{ background: track }}
      >
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(ratio > 0 ? 1.5 : 0, ratio * 100))}%`, background: fill }} />
      </div>
    </div>
  );
}

// ───────────────────────────── Position bars (stock vs reorder point) ─────────────────────────────

export interface PositionItem {
  key: string;
  label: string;
  href?: string;
  parts: { label: string; value: number; color: string }[];
  marker?: { label: string; value: number };
  badge?: ReactNode;
  display: string;
}

/** Stacked horizontal bars on one shared scale, each with an optional threshold marker (e.g. reorder point). */
export function PositionBars({ items, legend, markerLabel }: { items: PositionItem[]; legend: { label: string; color: string }[]; markerLabel?: string }) {
  const { t } = useLanguage();
  const { ref, handlers, node } = useTooltip();
  const max = Math.max(1, ...items.map((i) => Math.max(i.parts.reduce((s, p) => s + p.value, 0), i.marker?.value ?? 0)));
  if (items.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{t("viz.noData")}</p>;
  return (
    <div ref={ref} className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend items={legend} />
        {markerLabel && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-3 w-0.5 rounded-full bg-gray-900" />
            {markerLabel}
          </span>
        )}
      </div>
      <ul className="space-y-3">
        {items.map((it) => {
          const rows: TipRow[] = it.parts.map((p) => ({ label: p.label, value: String(p.value), color: p.color }));
          if (it.marker) rows.push({ label: it.marker.label, value: String(it.marker.value) });
          return (
            <li key={it.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {it.href ? (
                    <Link to={it.href} className="truncate text-sm text-gray-800 hover:text-indigo-700 hover:underline">
                      {it.label}
                    </Link>
                  ) : (
                    <span className="truncate text-sm text-gray-800">{it.label}</span>
                  )}
                  {it.badge}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-gray-700">{it.display}</span>
              </div>
              <div tabIndex={0} aria-label={`${it.label}: ${it.display}`} className="group relative -my-1 py-1 outline-none" {...handlers(it.label, rows)}>
                <div className="flex h-2.5 gap-[2px] group-focus-visible:ring-2 group-focus-visible:ring-indigo-300" style={{ width: `${(it.parts.reduce((s, p) => s + p.value, 0) / max) * 100}%` }}>
                  {it.parts
                    .filter((p) => p.value > 0)
                    .map((p, i, arr) => (
                      <div
                        key={p.label}
                        className={`h-full transition-[filter] group-hover:brightness-110 ${i === arr.length - 1 ? "rounded-r-[4px]" : ""}`}
                        style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
                      />
                    ))}
                </div>
                {it.marker && (
                  <span className="absolute top-0 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-gray-900" style={{ left: `${(it.marker.value / max) * 100}%` }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {node}
    </div>
  );
}
