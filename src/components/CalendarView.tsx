import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { todayIso } from "../lib/business";

export type EventTone = "indigo" | "gold" | "green" | "amber" | "red" | "blue" | "gray";

export interface CalendarEvent {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  subtitle?: string;
  /** What kind of event — shown as a small label in the day list. */
  kind?: string;
  /** Colour = kind of event only. Lateness and completion are shown separately, never by recolouring. */
  tone: EventTone;
  href?: string;
  /** Something already finished (received, paid…) — struck through and faded. */
  done?: boolean;
  /** Its date has passed and it isn't done — red outline and a "Late" label. */
  late?: boolean;
}

const CHIP: Record<EventTone, string> = {
  indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
  gold: "bg-gold-100/70 text-gold-600 border-gold-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-rose-50 text-rose-800 border-rose-200",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  gray: "bg-gray-100 text-gray-600 border-gray-200",
};
export const TONE_DOT: Record<EventTone, string> = {
  indigo: "bg-indigo-600",
  gold: "bg-gold-500",
  green: "bg-emerald-600",
  amber: "bg-amber-500",
  red: "bg-rose-600",
  blue: "bg-blue-600",
  gray: "bg-gray-400",
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Month to open on: this month when a few things happen in it; otherwise the busiest month (the one
 * nearest today if several tie), so the calendar never opens on an empty page when there is data.
 */
function initialMonth(events: CalendarEvent[]): { y: number; m: number } {
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.date.slice(0, 7), (counts.get(e.date.slice(0, 7)) ?? 0) + 1);
  const toYm = (ym: string) => ({ y: Number(ym.slice(0, 4)), m: Number(ym.slice(5, 7)) - 1 });
  if (counts.size === 0 || (counts.get(thisMonth) ?? 0) >= 3) return toYm(thisMonth);
  const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));
  const best = [...counts].sort((a, b) => b[1] - a[1] || Math.abs(monthIndex(a[0]) - monthIndex(thisMonth)) - Math.abs(monthIndex(b[0]) - monthIndex(thisMonth)))[0][0];
  return toYm(best);
}

function EventChip({ e, compact }: { e: CalendarEvent; compact?: boolean }) {
  const body = (
    <span
      className={`block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${CHIP[e.tone]} ${e.done ? "opacity-55 line-through decoration-1" : ""} ${
        e.late ? "ring-2 ring-inset ring-rose-500" : ""
      } ${compact ? "" : "hover:brightness-95"}`}
      title={[e.kind, e.title, e.subtitle].filter(Boolean).join(" · ")}
    >
      {e.late && <span className="mr-0.5 font-bold text-rose-600">!</span>}
      {e.title}
    </span>
  );
  return e.href ? (
    <Link to={e.href} onClick={(ev) => ev.stopPropagation()}>
      {body}
    </Link>
  ) : (
    body
  );
}

function DayList({ events, emptyLabel }: { events: CalendarEvent[]; emptyLabel: string }) {
  const { t } = useLanguage();
  if (events.length === 0) return <p className="py-6 text-center text-sm text-gray-400">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {events.map((e) => {
        const inner = (
          <div
            className={`flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2 ${e.late ? "border-rose-300" : "border-gray-200"} ${
              e.href ? "hover:border-indigo-300 hover:bg-indigo-50/30" : ""
            }`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[e.tone]}`} />
            <div className="min-w-0">
              <p className={`text-sm font-medium text-gray-900 ${e.done ? "text-gray-500 line-through" : ""}`}>
                {e.late && <span className="mr-1.5 rounded bg-rose-100 px-1 py-px text-[10px] font-semibold uppercase text-rose-700">{t("calendar.late")}</span>}
                {e.title}
              </p>
              <p className="truncate text-xs text-gray-500">{[e.kind, e.subtitle].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        );
        return <li key={e.id}>{e.href ? <Link to={e.href}>{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

/**
 * Month grid with events on their dates. Click a day to list everything on it. On phones it becomes an
 * agenda: the month's days that have events, in order.
 */
export function CalendarView({ events, legend, emptyLabel }: { events: CalendarEvent[]; legend?: ReactNode; emptyLabel?: string }) {
  const { t, lang } = useLanguage();
  const today = todayIso();
  const [{ y, m }, setMonth] = useState(() => initialMonth(events));
  const [selected, setSelected] = useState<string | null>(null);
  const locale = lang === "th" ? "th-TH" : "en-GB";

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);

  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = first.getDay(); // Sunday-first, as on Thai calendars
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 1, 1 + i))); // 1 Feb 2026 is a Sunday
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(first);
  const shift = (delta: number) => {
    const d = new Date(y, m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  };
  const monthPrefix = `${y}-${pad(m + 1)}`;
  const monthEvents = events.filter((e) => e.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date));
  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];
  const dayLabel = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T00:00:00`));

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} aria-label={t("calendar.prev")} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronLeft size={18} />
          </button>
          <h3 className="min-w-[10rem] text-center font-display text-lg font-semibold text-gray-900" aria-live="polite">
            {title}
          </h3>
          <button onClick={() => shift(1)} aria-label={t("calendar.next")} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => {
              setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
              setSelected(today);
            }}
            className="ml-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("calendar.today")}
          </button>
        </div>
        {legend}
      </div>

      {/* Month grid (md and up) */}
      <div className="hidden md:grid md:grid-cols-[1fr_17rem]">
        <div className="p-3">
          <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500">
            {weekdays.map((w) => (
              <div key={w} className="pb-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-gray-200 bg-gray-200 [gap:1px]">
            {cells.map((d, i) => {
              if (d === null) return <div key={`x${i}`} className="min-h-[6.5rem] bg-gray-50/70" />;
              const date = iso(y, m, d);
              const list = byDay.get(date) ?? [];
              const isToday = date === today;
              const isSel = date === selected;
              return (
                <div
                  key={date}
                  role="button"
                  tabIndex={0}
                  aria-label={`${dayLabel(date)}: ${list.length}`}
                  onClick={() => setSelected(date)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(date)}
                  className={`min-h-[6.5rem] cursor-pointer p-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                    isSel ? "bg-indigo-50/60" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                      isToday ? "bg-gray-900 font-semibold text-white" : "text-gray-600"
                    }`}
                  >
                    {d}
                  </span>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((e) => (
                      <EventChip key={e.id} e={e} />
                    ))}
                    {list.length > 3 && <p className="px-1 text-[11px] font-medium text-gray-500">+{list.length - 3} {t("calendar.more")}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <aside className="border-l border-gray-100 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-900">{selected ? dayLabel(selected) : t("calendar.thisMonth")}</p>
          <div className="max-h-[34rem] overflow-y-auto pr-1">
            <DayList events={selected ? selectedEvents : monthEvents} emptyLabel={emptyLabel ?? t("calendar.nothing")} />
          </div>
        </aside>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-white ring-2 ring-inset ring-rose-500" />
          {t("calendar.lateKey")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-400 line-through">abc</span>
          {t("calendar.doneKey")}
        </span>
      </p>

      {/* Agenda (phones) */}
      <div className="p-4 md:hidden">
        {monthEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{emptyLabel ?? t("calendar.nothing")}</p>
        ) : (
          [...new Set(monthEvents.map((e) => e.date))].map((d) => (
            <div key={d} className="mb-4 last:mb-0">
              <p className={`mb-1.5 text-xs font-semibold ${d === today ? "text-indigo-700" : "text-gray-500"}`}>{dayLabel(d)}</p>
              <DayList events={byDay.get(d) ?? []} emptyLabel="" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Small legend: coloured dot + label per event kind; optional toggles. */
export function CalendarLegend({ items }: { items: { key: string; label: string; tone: EventTone; active?: boolean; onToggle?: () => void; count?: number }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((i) => {
        const content = (
          <>
            <span className={`h-2 w-2 rounded-full ${TONE_DOT[i.tone]}`} />
            {i.label}
            {i.count !== undefined && <span className="tabular-nums text-gray-400">{i.count}</span>}
          </>
        );
        return i.onToggle ? (
          <button
            key={i.key}
            onClick={i.onToggle}
            aria-pressed={i.active}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              i.active ? "border-gray-300 bg-white text-gray-800" : "border-dashed border-gray-300 bg-gray-50 text-gray-400 [&>span:first-child]:opacity-30"
            }`}
          >
            {content}
          </button>
        ) : (
          <span key={i.key} className="flex items-center gap-1.5 px-1 text-xs text-gray-600">
            {content}
          </span>
        );
      })}
    </div>
  );
}
