/**
 * The time the business rules see as "now". Normally the real clock; the demo seed sets it while it replays
 * six months of history through the same actions a user would take, so each record carries the date it
 * happened on. Setting it is synchronous and scoped (see `atTime`), so a running server never sees it.
 */
let fixed: number | null = null;

export function now(): Date {
  return fixed === null ? new Date() : new Date(fixed);
}

/** Runs `fn` with the clock set to `iso` (a local date-time such as "2026-05-04T09:30:00"), then restores it. */
export function atTime<T>(iso: string, fn: () => T): T {
  const previous = fixed;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) throw new Error(`Invalid time: ${iso}`);
  fixed = t;
  try {
    return fn();
  } finally {
    fixed = previous;
  }
}
