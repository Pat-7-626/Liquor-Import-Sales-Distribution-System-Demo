import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as A from "../../src/domain/actions.ts";
import type { Bilingual } from "../../src/data/types.ts";
import { clearSession, issueSession, requireUser, toSessionUser, verifyPassword, type SessionUser } from "./auth.ts";
import { isCommand, runCommand, withLockedStore } from "./commands.ts";
import { config } from "./config.ts";
import { migrate, sql } from "./db.ts";
import { maskAudit, maskStore } from "./mask.ts";
import { auditFromRow, loadStore } from "./repo.ts";
import { registerQueryRoutes } from "./queries.ts";
import { registerMailRoutes } from "./mail.ts";
import { closePdf } from "./pdf.ts";
import { resetDemoData, seedIfEmpty } from "./seed.ts";
import { registerUserRoutes } from "./users.ts";
import { buildJournal, trialBalance } from "../../src/domain/ledger.ts";

// trustProxy is a hop count, not "true": with "true" the left-most X-Forwarded-For entry — which any client
// can write — would be taken as the caller's address, and the per-address sign-in limit could be dodged.
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 1024 * 1024, trustProxy: (_address: string, hop: number) => hop < config.trustProxyHops });
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

const ctxOf = (u: SessionUser): A.Ctx => ({ actor: u.name, can: u.can });

/**
 * The state as this user may see it (NFR-03 masking applied on the server). The stock ledger and audit
 * log aren't included — they grow forever; screens page through them (queries.ts). The latest few audit
 * entries come along as recent activity.
 */
async function stateFor(user: SessionUser) {
  const { store, recent } = await sql.begin("isolation level repeatable read read only", async (tx) => ({
    store: await loadStore(tx, { light: true }),
    recent: (await tx`select * from audit_log order by ts desc, id limit ${RECENT_ACTIVITY}`).map(auditFromRow),
  }));
  const { stockMovements: _m, auditLog: _a, ...rest } = user.canViewSensitive ? store : maskStore(store, { keepSupplierInvoices: handlesImportPaperwork(user) });
  return { ...rest, recentActivity: user.canViewSensitive ? recent : recent.map(maskAudit) };
}
const RECENT_ACTIVITY = 20;

/** Supplier invoices carry prices, but the people who file import paperwork and clear customs need them. */
const handlesImportPaperwork = (u: SessionUser) => u.canViewSensitive || u.can("manageImportDocuments") || u.can("recordCustomsClearance");

const publicUser = (u: SessionUser) => ({ key: u.key, role: u.role, name: u.name, mustChangePassword: u.mustChangePassword });

// ───────────────────────────── auth ─────────────────────────────

app.get("/api/health", async () => {
  await sql`select 1`;
  return { ok: true };
});

/**
 * Sign-in list (names and roles only; disabled accounts left out) — demo mode only. For real use, nobody
 * gets a list of usernames before signing in: the sign-in page asks for the username instead.
 */
app.get("/api/users", async () =>
  config.demoMode ? sql<{ key: string; role: string; name: Bilingual }[]>`select key, role, name from users where role <> 'guest' and active order by key` : [],
);

/** What the sign-in page may offer before anyone is signed in. */
app.get("/api/auth/options", async () => ({ guestAccess: config.allowGuest, demoMode: config.demoMode }));

const NO_GUEST = { error: { th: "ไม่เปิดให้เข้าใช้งานแบบผู้เยี่ยมชม", en: "Guest access is turned off" } };
const GUEST_READ_ONLY = { error: { th: "ผู้เยี่ยมชมดูข้อมูลได้อย่างเดียว กรุณาเข้าสู่ระบบ", en: "Guests can only look — please sign in" } };

/** "Continue as guest": a read-only session (no permissions, prices masked). */
app.post("/api/auth/guest", async (_req, reply) => {
  if (!config.allowGuest) return reply.code(403).send(NO_GUEST);
  const [row] = await sql<{ key: string; role: string; name: Bilingual }[]>`select key, role, name from users where role = 'guest' limit 1`;
  if (!row) return reply.code(503).send(NO_GUEST);
  issueSession(reply, row.key);
  return { user: publicUser(toSessionUser(row)), demoMode: config.demoMode };
});

// ── sign-in throttling ──
// Per account: 5 wrong passwords lock it for 15 minutes (a Senior Manager can unlock it sooner).
// Per address: 100 failures in 15 minutes slows down guessing across many usernames (an office shares one address).
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const IP_LIMIT = 100;
const ipFailures = new Map<string, number[]>();
const recentIpFailures = (ip: string) => {
  const since = Date.now() - LOCK_MINUTES * 60_000;
  const list = (ipFailures.get(ip) ?? []).filter((t) => t > since);
  ipFailures.set(ip, list);
  return list;
};
const TOO_MANY = (minutes: number) => ({
  error: {
    th: `พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณาลองใหม่ในอีก ${minutes} นาที หรือติดต่อผู้บริหารเพื่อปลดล็อก`,
    en: `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask a Senior Manager to unlock the account.`,
  },
});

const unknownKeys = new Map<string, number[]>();
function unknownKeyFailures(key: string): number[] {
  const since = Date.now() - LOCK_MINUTES * 60_000;
  const list = (unknownKeys.get(key) ?? []).filter((t) => t > since);
  if (unknownKeys.size > 10_000) unknownKeys.clear();
  unknownKeys.set(key, list);
  return list;
}

app.post("/api/auth/login", async (req, reply) => {
  const body = z.object({ key: z.string().max(64), password: z.string().max(200) }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: { th: "ข้อมูลไม่ครบ", en: "Missing username or password" } });
  const ip = req.ip;
  if (recentIpFailures(ip).length >= IP_LIMIT) return reply.code(429).send(TOO_MANY(LOCK_MINUTES));
  const rows = await sql<
    {
      key: string;
      role: string;
      name: Bilingual;
      password_hash: string;
      active: boolean;
      must_change_password: boolean;
      token_version: number;
      locked_until: Date | null;
    }[]
  >`select * from users where key = ${body.data.key} and role <> 'guest'`;
  const row = rows[0];
  // A locked account gets the same answer whether or not the password is right — no free guesses while locked.
  if (row?.locked_until && row.locked_until.getTime() > Date.now())
    return reply.code(429).send(TOO_MANY(Math.max(1, Math.ceil((row.locked_until.getTime() - Date.now()) / 60_000))));
  // Same answer and similar timing for "no such user", "disabled", and "wrong password".
  const ok = row ? await verifyPassword(body.data.password, row.password_hash) : await verifyPassword(body.data.password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!row || !ok || !row.active) {
    recentIpFailures(ip).push(Date.now());
    // A made-up username "locks" after the same number of tries as a real one, so the 429 doesn't
    // reveal which usernames exist.
    if (!row) {
      const tries = unknownKeyFailures(body.data.key);
      tries.push(Date.now());
      if (tries.length >= MAX_FAILURES) return reply.code(429).send(TOO_MANY(LOCK_MINUTES));
    }
    if (row) {
      const [after] = await sql<{ failed_logins: number }[]>`
        update users set
          failed_logins = case when failed_logins + 1 >= ${MAX_FAILURES} then 0 else failed_logins + 1 end,
          locked_until = case when failed_logins + 1 >= ${MAX_FAILURES} then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end
        where key = ${row.key}
        returning failed_logins`;
      if (after.failed_logins === 0) {
        app.log.warn({ user: row.key, ip }, "account locked after repeated failed sign-ins");
        return reply.code(429).send(TOO_MANY(LOCK_MINUTES));
      }
    }
    return reply.code(401).send({ error: { th: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", en: "Wrong username or password" } });
  }
  await sql`update users set last_login_at = now(), failed_logins = 0, locked_until = null where key = ${row.key}`;
  issueSession(reply, row.key, row.token_version);
  return { user: publicUser(toSessionUser(row)), demoMode: config.demoMode };
});

app.post("/api/auth/logout", async (_req, reply) => {
  clearSession(reply);
  return { ok: true };
});

app.get("/api/auth/me", async (req, reply) => {
  const user = await requireUser(req, reply, { allowPendingPassword: true });
  if (!user) return;
  return { user: publicUser(user), demoMode: config.demoMode };
});

/** Demo only: act as another seeded user without a password (the header role switcher). */
app.post("/api/auth/switch", async (req, reply) => {
  if (!config.demoMode) return reply.code(403).send({ error: { th: "ปิดใช้งานในโหมดใช้งานจริง", en: "Disabled outside demo mode" } });
  const user = await requireUser(req, reply);
  if (!user) return;
  if (user.role === "guest") return reply.code(403).send(GUEST_READ_ONLY);
  const body = z.object({ key: z.string().max(64) }).safeParse(req.body);
  const rows = body.success
    ? await sql<{ key: string; role: string; name: Bilingual; token_version: number }[]>`
        select key, role, name, token_version from users where key = ${body.data.key} and role <> 'guest' and active`
    : [];
  if (!rows[0]) return reply.code(404).send({ error: { th: "ไม่พบผู้ใช้", en: "User not found" } });
  // Switching skips the password, not the rules: a user still on a temporary password must change it first.
  issueSession(reply, rows[0].key, rows[0].token_version);
  return { user: publicUser(toSessionUser(rows[0])), demoMode: config.demoMode };
});

registerUserRoutes(app);

registerQueryRoutes(app);
registerMailRoutes(app);

/** The books as derived from the records: trial balance plus the checks that tie it to the operational data. */
app.get("/api/accounting/trial-balance", async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  if (!user.canViewSensitive) return reply.code(403).send({ error: { th: "จำกัดสิทธิ์", en: "Restricted for your role" } });
  const store = await sql.begin("isolation level repeatable read read only", (tx) => loadStore(tx));
  const entries = buildJournal(store);
  const tb = trialBalance(entries);
  return {
    accounts: tb.map((b) => ({ code: b.account.code, debit: b.debit, credit: b.credit, balance: b.balance })),
    entries: entries.length,
    unbalancedEntries: entries.filter((e) => Math.abs(e.lines.reduce((s, l) => s + l.debit - l.credit, 0)) > 0.005).map((e) => e.id),
  };
});

// ───────────────────────────── data ─────────────────────────────

app.get("/api/state", async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  return stateFor(user);
});

/** Every write goes through a named domain command: { args: [...] } → { result, state }. */
app.post<{ Params: { name: string } }>("/api/commands/:name", async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  if (!isCommand(req.params.name)) return reply.code(404).send({ error: { th: "ไม่พบคำสั่ง", en: "Unknown command" } });
  const args = (req.body as { args?: unknown } | null)?.args;

  // Removing a document also removes its stored file once the record change has committed.
  let fileToDelete: string | null = null;
  if (req.params.name === "removeDocument" && Array.isArray(args)) {
    const [orderNo, docId] = args as [string, string];
    const [doc] = await sql<{ url: string }[]>`select url from import_order_documents where id = ${docId} and order_no = ${orderNo}`;
    fileToDelete = doc?.url.match(/\/api\/files\/([0-9a-f-]{36})$/)?.[1] ?? null;
  }

  const result = await runCommand(req.params.name, args, ctxOf(user));
  if (result.ok && fileToDelete) {
    const [file] = await sql<{ path: string }[]>`delete from files where id = ${fileToDelete} returning path`;
    if (file) await unlink(file.path).catch(() => {});
  }
  if (!result.ok) reply.code(422);
  return { result, state: await stateFor(user) };
});

// ───────────────────────────── documents ─────────────────────────────

const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;

/** Magic numbers for the accepted types. */
function contentMatches(mime: string, b: Buffer): boolean {
  const starts = (sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
  if (mime === "application/pdf") return b.subarray(0, 5).toString("latin1") === "%PDF-";
  if (mime === "image/png") return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (mime === "image/gif") return b.subarray(0, 4).toString("latin1") === "GIF8";
  if (mime === "image/webp") return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}
const DOC_KINDS = ["invoice", "packingList", "billOfLading", "importLicense", "other"] as const;

/** FR-06: attach an original document to an import order (multipart: kind, file). */
app.post<{ Params: { orderNo: string } }>("/api/import-orders/:orderNo/documents", async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  if (!user.can("manageImportDocuments")) return reply.code(403).send({ result: { ok: false, error: { th: "บทบาทของคุณไม่มีสิทธิ์ดำเนินการนี้", en: "Your role isn't permitted to do this" } } });

  const part = await req.file();
  if (!part) return reply.code(400).send({ result: { ok: false, error: { th: "ไม่พบไฟล์", en: "No file received" } } });
  const kindField = part.fields.kind as { value?: unknown } | undefined;
  const kind = DOC_KINDS.find((k) => k === kindField?.value) ?? "other";
  if (!ALLOWED_MIME.test(part.mimetype))
    return reply.code(415).send({ result: { ok: false, error: { th: "รองรับเฉพาะ PDF และรูปภาพ", en: "Only PDF and image files are accepted" } } });

  const buffer = await part.toBuffer(); // throws past the size limit → 413
  // The declared type is the browser's word for it; the file's first bytes must agree.
  if (!contentMatches(part.mimetype, buffer))
    return reply.code(415).send({ result: { ok: false, error: { th: "เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์", en: "The file's content doesn't match its type" } } });
  const fileId = randomUUID();
  const path = join(config.uploadDir, fileId);
  await mkdir(config.uploadDir, { recursive: true });
  await writeFile(path, buffer);
  const name = part.filename.replace(/[\\/\r\n]/g, "_").slice(0, 200) || "document";

  const result = await withLockedStore(async (tx, store) => {
    await tx`insert into files (id, name, mime, size, path, uploaded_by) values (${fileId}, ${name}, ${part.mimetype}, ${buffer.length}, ${path}, ${user.key})`;
    return A.attachDocument(store, ctxOf(user), req.params.orderNo, { name, kind, url: `/api/files/${fileId}` });
  });
  if (!result.ok) {
    await unlink(path).catch(() => {});
    reply.code(422);
  }
  return { result, state: await stateFor(user) };
});

app.get<{ Params: { id: string } }>("/api/files/:id", async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return reply.code(404).send();
  const [file] = await sql<{ name: string; mime: string; path: string }[]>`select name, mime, path from files where id = ${req.params.id}`;
  if (!file) return reply.code(404).send();
  // A supplier's invoice shows what we pay — the same rule as every other price (NFR-03).
  if (!handlesImportPaperwork(user)) {
    const [doc] = await sql<{ kind: string }[]>`select kind from import_order_documents where url = ${`/api/files/${req.params.id}`}`;
    if (!doc || doc.kind === "invoice") return reply.code(403).send();
  }
  reply.header("Content-Type", file.mime);
  reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  reply.header("X-Content-Type-Options", "nosniff");
  return reply.send(createReadStream(file.path));
});

// ───────────────────────────── admin ─────────────────────────────

app.post("/api/admin/reset", async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  if (user.role === "guest") return reply.code(403).send(GUEST_READ_ONLY);
  if (!config.demoMode) return reply.code(403).send({ error: { th: "ปิดใช้งานในโหมดใช้งานจริง", en: "Disabled outside demo mode" } });
  await resetDemoData();
  return { result: { ok: true }, state: await stateFor(user) };
});

app.setErrorHandler((error, _req, reply) => {
  const err = error as { statusCode?: number; message: string };
  const status = err.statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  const message =
    status === 413
      ? { th: "ไฟล์มีขนาดใหญ่เกินกำหนด", en: "File is too large" }
      : status >= 500
        ? { th: "เกิดข้อผิดพลาดในระบบ", en: "Something went wrong on the server" }
        : { th: err.message, en: err.message };
  reply.code(status).send({ result: { ok: false, error: message }, error: message });
});

// ───────────────────────────── start ─────────────────────────────

await migrate(config.migrationsDir);
await seedIfEmpty();
await app.listen({ port: config.port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await closePdf();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
