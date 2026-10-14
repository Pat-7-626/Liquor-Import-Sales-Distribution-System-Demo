import { useEffect, useState } from "react";
import { useData } from "../state/DataContext";
import { api } from "./api";

/**
 * GETs an API query and refetches whenever the data changes (any command) or the path does. The last
 * result stays on screen while the next one loads. `null` skips the request.
 */
export function useApi<T>(path: string | null): { data: T | undefined; loading: boolean; error: boolean } {
  const { version } = useData();
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: boolean }>({ key: null, data: undefined, error: false });
  const key = path && `${version}|${path}`;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path).then(
      (data) => !cancelled && setState({ key: `${version}|${path}`, data, error: false }),
      () => !cancelled && setState((s) => ({ ...s, key: `${version}|${path}`, error: true })),
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  return { data: path ? state.data : undefined, loading: Boolean(key) && state.key !== key, error: state.error };
}

/** Builds "/api/x?a=1&b=2", leaving out empty values. */
export function query(path: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
