import type { ReactNode } from "react";
import { Check, X, CornerUpLeft } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import type { FlowStep, StepState } from "../lib/flows";
import { daysOverdue, todayIso } from "../lib/business";
import { formatDate } from "../lib/format";

/** "Planned 10 Oct 2026" / "Planned 10 Oct · 3 days late" / "Due 7 Dec" / "Overdue 12 days". */
export function useDueText() {
  const { t, lang } = useLanguage();
  return (due: NonNullable<FlowStep["due"]>) => {
    const late = daysOverdue(due.date, todayIso());
    const when = formatDate(due.date, lang);
    if (due.kind === "eta")
      return due.late ? `ETA ${when} · ${t("views.daysLate").replace("{n}", String(late))}` : `ETA ${when}`;
    if (due.kind === "planned")
      return due.late ? `${t("flow.plannedOn").replace("{d}", when)} · ${t("views.daysLate").replace("{n}", String(late))}` : t("flow.plannedOn").replace("{d}", when);
    return due.late ? `${t("flow.overdueBy").replace("{n}", String(late))} (${when})` : t("flow.dueOn").replace("{d}", when);
  };
}

/** "8 Oct 2026, 14:30" in the screen's language; null = time wasn't recorded. */
export function useStepTime() {
  const { t, lang } = useLanguage();
  return (at: string | null | undefined) => {
    if (at === null) return t("flow.timeNotRecorded");
    if (!at) return "";
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  };
}

const DOT: Record<StepState, string> = {
  done: "bg-emerald-600 text-white ring-emerald-600",
  current: "bg-white text-indigo-700 ring-indigo-600 ring-2",
  next: "bg-white text-gold-600 ring-gold-500 ring-2",
  upcoming: "bg-white text-gray-400 ring-gray-300",
  failed: "",
  skipped: "bg-gray-50 text-gray-300 ring-gray-200",
};
const failedDot = (tone?: "amber" | "red") => (tone === "amber" ? "bg-amber-500 text-white ring-amber-500" : "bg-rose-600 text-white ring-rose-600");

/** The connector after a step is solid once the order has moved past it. */
const connectorDone = (next?: FlowStep) => Boolean(next && (next.state === "done" || next.state === "current" || next.state === "failed"));

function DotIcon({ step, index }: { step: FlowStep; index: number }) {
  if (step.state === "done") return <Check size={14} strokeWidth={3} />;
  if (step.state === "failed") return step.tone === "amber" ? <CornerUpLeft size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={3} />;
  if (step.state === "current") return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-600" />;
  return <span className="text-xs font-semibold">{index + 1}</span>;
}

/**
 * Full lifecycle: dots on a line, each with its name, time and who did it. Vertical on phones.
 * `title`/`actions` put the controls that move the order (status, dates) on the same card as its progress.
 */
export function Stepper({ steps, title, actions }: { steps: FlowStep[]; title?: string; actions?: ReactNode }) {
  const { t } = useLanguage();
  const bi = useBi();
  const time = useStepTime();
  const dueText = useDueText();

  const label = (s: FlowStep) => (
    <>
      <p className={`text-sm font-medium ${s.state === "upcoming" || s.state === "skipped" ? "text-gray-400" : s.state === "failed" ? (s.tone === "amber" ? "text-amber-700" : "text-rose-700") : "text-gray-900"}`}>
        {t(s.label)}
        {s.state === "next" && <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-600">{t("flow.next")}</span>}
      </p>
      {s.hint && <p className="text-xs text-gray-500">{t(s.hint)}</p>}
      {s.due && <p className={`text-xs ${s.due.late ? "font-medium text-rose-700" : "text-gray-500"}`}>{dueText(s.due)}</p>}
      {(s.at !== undefined || s.actor) && s.state !== "upcoming" && s.state !== "next" && (
        <p className="mt-0.5 text-xs leading-snug text-gray-500">
          {time(s.at)}
          {s.actor && <span className="block text-gray-400">{bi(s.actor)}</span>}
        </p>
      )}
    </>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
        </div>
      )}
      {/* Horizontal from sm up */}
      <ol aria-label={t("flow.progress")} className="hidden sm:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s.key} className="relative list-none pr-3">
            <div className="flex items-center">
              <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${s.state === "failed" ? failedDot(s.tone) : DOT[s.state]}`}>
                <DotIcon step={s} index={i} />
              </span>
              {i < steps.length - 1 && (
                <span
                  className={`ml-2 h-0.5 flex-1 rounded-full ${connectorDone(steps[i + 1]) ? "bg-emerald-600" : steps[i + 1].state === "skipped" ? "border-t-2 border-dashed border-gray-200 bg-transparent" : "bg-gray-200"}`}
                />
              )}
            </div>
            <div className="mt-2.5">{label(s)}</div>
          </li>
        ))}
      </ol>
      {/* Vertical on phones */}
      <ol aria-label={t("flow.progress")} className="sm:hidden">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex list-none gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className={`absolute left-[13px] top-8 bottom-0 w-0.5 ${connectorDone(steps[i + 1]) ? "bg-emerald-600" : "bg-gray-200"}`} />}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${s.state === "failed" ? failedDot(s.tone) : DOT[s.state]}`}>
              <DotIcon step={s} index={i} />
            </span>
            <div className="pt-0.5">{label(s)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const MINI_DOT: Record<StepState, string> = {
  done: "bg-emerald-600 border-emerald-600",
  current: "bg-white border-indigo-600 ring-2 ring-indigo-200",
  next: "bg-white border-gold-500",
  upcoming: "bg-white border-gray-300",
  failed: "",
  skipped: "bg-gray-100 border-gray-200",
};

/** Compact lifecycle for tables and cards: small dots on a line, then where the order is now. */
export function MiniStepper({ steps, showLabel = true }: { steps: FlowStep[]; showLabel?: boolean }) {
  const { t } = useLanguage();
  const time = useStepTime();
  const focus = steps.find((s) => s.state === "failed") ?? steps.find((s) => s.state === "current") ?? [...steps].reverse().find((s) => s.state === "done") ?? steps[0];
  const dueText = useDueText();
  const missed = steps.find((s) => s.due?.late && s.state !== "done");
  const summary = steps
    .map((s) => `${t(s.label)}${s.state === "done" && s.at ? ` — ${time(s.at)}` : ""}${s.due && s.state !== "done" ? ` — ${dueText(s.due)}` : ""}`)
    .join("\n");
  return (
    <div className="relative flex items-center gap-2.5" title={summary}>
      <div className="flex items-center" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s.key} className="flex items-center">
            <span
              className={`h-2.5 w-2.5 rounded-full border-2 ${s.state === "failed" ? (s.tone === "amber" ? "border-amber-500 bg-amber-500" : "border-rose-600 bg-rose-600") : MINI_DOT[s.state]}`}
            />
            {i < steps.length - 1 && <span className={`h-0.5 w-3.5 ${connectorDone(steps[i + 1]) ? "bg-emerald-600" : "bg-gray-200"}`} />}
          </span>
        ))}
      </div>
      {showLabel && (
        <span
          className={`whitespace-nowrap text-xs font-medium ${
            focus.state === "failed" ? (focus.tone === "amber" ? "text-amber-700" : "text-rose-700") : focus.state === "current" ? "text-indigo-700" : "text-gray-700"
          }`}
        >
          {t(focus.label)}
          {missed && <span className="font-medium text-rose-700"> · {t(missed.due!.kind === "payment" ? "flow.overdue" : "flow.lateDelivery")}</span>}
        </span>
      )}
      <span className="sr-only">{summary}</span>
    </div>
  );
}
