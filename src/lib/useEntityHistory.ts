import type { AuditEntry } from "../data/types";
import { query, useApi } from "./useApi";

/** A record's audit history, newest first (read from the server — the full log never comes to the browser). */
export function useEntityHistory(entityId: string | undefined): AuditEntry[] {
  return useApi<{ rows: AuditEntry[] }>(entityId ? query("/api/audit", { entityId, limit: 500 }) : null).data?.rows ?? EMPTY;
}
const EMPTY: AuditEntry[] = [];
