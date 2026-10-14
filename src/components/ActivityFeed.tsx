import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { TONE_DOT, type EventTone } from "./CalendarView";

export interface FeedItem {
  id: string;
  /** ISO timestamp */
  at: string;
  tone: EventTone;
  /** Who did it — shown as initials and name. */
  actor: string;
  title: ReactNode;
  body?: ReactNode;
  href?: string | null;
  reference?: string;
}

const initials = (name: string) =>
  name
    .replace(/\(.*\)/, "")
    .replace(/^[^:]*:\s*/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** What happened, newest first, grouped by day along a vertical line. */
export function ActivityFeed({ items, emptyLabel }: { items: FeedItem[]; emptyLabel: string }) {
  const { lang } = useLanguage();
  const locale = lang === "th" ? "th-TH" : "en-GB";
  if (items.length === 0) return <p className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">{emptyLabel}</p>;

  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const groups: { day: string; items: FeedItem[] }[] = [];
  for (const it of items) {
    const k = dayKey(it.at);
    const g = groups[groups.length - 1];
    if (g && g.day === k) g.items.push(it);
    else groups.push({ day: k, items: [it] });
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="sticky top-16 z-10 mb-2 inline-block rounded-full bg-canvas/95 px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 backdrop-blur">
            {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${g.day}T00:00:00`))}
          </h3>
          <ol className="relative ml-4 border-l-2 border-gray-200">
            {g.items.map((it) => (
              <li key={it.id} className="relative pb-4 pl-6 last:pb-0">
                <span className={`absolute -left-[7px] top-4 h-3 w-3 rounded-full ring-4 ring-canvas ${TONE_DOT[it.tone]}`} />
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[10px] font-semibold text-white" aria-hidden="true">
                      {initials(it.actor)}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{it.actor}</span>
                    <span className="text-xs text-gray-400">
                      {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(it.at))}
                    </span>
                    <span className="ml-auto">{it.title}</span>
                  </div>
                  {it.body && <p className="mt-1.5 text-sm leading-relaxed text-gray-700">{it.body}</p>}
                  {it.reference &&
                    (it.href ? (
                      <Link to={it.href} className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:underline">
                        {it.reference}
                      </Link>
                    ) : (
                      <span className="mt-1 inline-block text-xs text-gray-500">{it.reference}</span>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
