/** The demo dataset as a Store — the server seeds the database from this on first start and on a demo reset. */
import { buildDemoHistory } from "./demoHistory";
import type { Store } from "./store";

/**
 * Six months of business up to yesterday (see demoHistory). Every step goes through the business rules, so
 * a step they refuse would leave the story incomplete — that is a bug in the demo data, and fails loudly.
 */
export function seedState(today?: string): Store {
  const { store, problems } = buildDemoHistory(today);
  if (problems.length) throw new Error(`Demo data: ${problems.length} steps were refused:\n${problems.slice(0, 10).join("\n")}`);
  return store;
}
