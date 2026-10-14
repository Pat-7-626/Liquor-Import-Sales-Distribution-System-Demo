import type { JournalEntry } from "../domain/ledger";
import { useRole } from "../state/RoleContext";
import { useApi } from "./useApi";

/**
 * The journal, derived on the server from every record (the stock ledger isn't sent to the browser).
 * Empty until it arrives, and for roles without price access (they aren't sent it, so it isn't asked for).
 */
export function useLedger(): JournalEntry[] {
  const { canViewSensitive } = useRole();
  return useApi<JournalEntry[]>(canViewSensitive ? "/api/accounting/journal" : null).data ?? EMPTY;
}
const EMPTY: JournalEntry[] = [];
