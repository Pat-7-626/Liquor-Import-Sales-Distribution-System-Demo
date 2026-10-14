import type { Bilingual } from "../data/types";

/** Every write reports back the same way the domain does. */
export type ActionResult = { ok: true } | { ok: false; error: Bilingual };

export class ApiError extends Error {
  status: number;
  /** The server's message in both languages, when it sent one. */
  bilingual?: Bilingual;
  constructor(status: number, message: string, bilingual?: Bilingual) {
    super(message);
    this.status = status;
    this.bilingual = bilingual;
  }
}

const NETWORK_ERROR: Bilingual = { th: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่", en: "Can't reach the server — please try again" };

/** JSON request to the API (same origin; the session rides in an httpOnly cookie). */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const isForm = init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      headers: init?.body !== undefined && !isForm ? { "content-type": "application/json" } : undefined,
      body: init?.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR.en);
  }
  const data = (await res.json().catch(() => null)) as T & { error?: Bilingual };
  if (!res.ok && res.status !== 422) throw new ApiError(res.status, data?.error?.en ?? `HTTP ${res.status}`, data?.error);
  return data;
}

/** A command's result, turning transport failures into an ordinary failed ActionResult for the UI. */
export async function asResult<T extends { result: ActionResult }>(p: Promise<T>): Promise<T | { result: ActionResult; state?: undefined }> {
  try {
    return await p;
  } catch (e) {
    const err = e as ApiError;
    return { result: { ok: false, error: err.status === 0 ? NETWORK_ERROR : { th: err.message, en: err.message } } };
  }
}
