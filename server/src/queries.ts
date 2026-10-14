/**
 * Read-only queries for the records that grow without bound — the audit log, the stock ledger, and the
 * journal derived from everything — so screens fetch a page (or a summary) instead of the whole history.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildJournal } from "../../src/domain/ledger.ts";
import { requireUser } from "./auth.ts";
import { sql } from "./db.ts";
import { maskAudit } from "./mask.ts";
import { auditFromRow, loadStore, movementFromRow } from "./repo.ts";

const RESTRICTED = { error: { th: "จำกัดสิทธิ์", en: "Restricted for your role" } };

const page = {
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(5000).default(100),
};
const text = z.string().trim().max(100).optional();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const auditQuery = z.object({
  ...page,
  entityId: text,
  entityType: text,
  action: text,
  actor: text,
  q: text,
});

const movementQuery = z.object({
  ...page,
  lot: text,
  sku: text,
  type: z.enum(["receipt", "sale", "return", "adjustment"]).optional(),
  warehouse: text,
  reference: text,
  q: text,
  from: day,
  to: day,
});

/** `%` and `_` typed by a person are literal characters, not wildcards. */
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function registerQueryRoutes(app: FastifyInstance) {
  /** The audit trail, newest first, filtered and paged. Sensitive text is masked for roles without price access. */
  app.get("/api/audit", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const parsed = auditQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: { th: "ตัวกรองไม่ถูกต้อง", en: "Invalid filter" } });
    const f = parsed.data;
    const where = sql`
      where true
      ${f.entityId ? sql`and entity_id = ${f.entityId}` : sql``}
      ${f.entityType ? sql`and entity_type = ${f.entityType}` : sql``}
      ${f.action ? sql`and action = ${f.action}` : sql``}
      ${f.actor ? sql`and (actor->>'en' = ${f.actor} or actor->>'th' = ${f.actor})` : sql``}
      ${
        f.q
          ? // Searching the text of a masked entry would reveal what it says, so those only match on ID.
            user.canViewSensitive
            ? sql`and (entity_id ilike ${like(f.q)} or summary->>'en' ilike ${like(f.q)} or summary->>'th' ilike ${like(f.q)} or actor->>'en' ilike ${like(f.q)} or actor->>'th' ilike ${like(f.q)})`
            : sql`and (entity_id ilike ${like(f.q)} or actor->>'en' ilike ${like(f.q)} or actor->>'th' ilike ${like(f.q)} or (not sensitive and (summary->>'en' ilike ${like(f.q)} or summary->>'th' ilike ${like(f.q)})))`
          : sql``
      }
    `;
    const [rows, [{ total }], actors] = await Promise.all([
      sql`select * from audit_log ${where} order by ts desc, id limit ${f.limit} offset ${f.offset}`,
      sql<{ total: number }[]>`select count(*)::int as total from audit_log ${where}`,
      sql<{ th: string; en: string }[]>`select distinct actor->>'th' as th, actor->>'en' as en from audit_log order by en`,
    ]);
    const entries = rows.map(auditFromRow);
    return { rows: user.canViewSensitive ? entries : entries.map(maskAudit), total, actors };
  });

  /** The stock ledger, newest first, filtered and paged. Quantities only — nothing here is price-sensitive. */
  app.get("/api/stock-movements", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const parsed = movementQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: { th: "ตัวกรองไม่ถูกต้อง", en: "Invalid filter" } });
    const f = parsed.data;
    const where = sql`
      where true
      ${f.lot ? sql`and lot_batch = ${f.lot}` : sql``}
      ${f.sku ? sql`and sku = ${f.sku}` : sql``}
      ${f.type ? sql`and type = ${f.type}` : sql``}
      ${f.warehouse ? sql`and warehouse = ${f.warehouse}` : sql``}
      ${f.reference ? sql`and reference = ${f.reference}` : sql``}
      ${f.from ? sql`and ts >= ${f.from}::date` : sql``}
      ${f.to ? sql`and ts < ${f.to}::date + 1` : sql``}
      ${f.q ? sql`and (sku ilike ${like(f.q)} or lot_batch ilike ${like(f.q)} or reference ilike ${like(f.q)})` : sql``}
    `;
    const [rows, [{ total, unitsIn, unitsOut }]] = await Promise.all([
      sql`select * from stock_movements ${where} order by ts desc, id limit ${f.limit} offset ${f.offset}`,
      sql<{ total: number; unitsIn: number; unitsOut: number }[]>`
        select count(*)::int as total,
               coalesce(sum(quantity) filter (where quantity > 0), 0)::int as "unitsIn",
               coalesce(-sum(quantity) filter (where quantity < 0), 0)::int as "unitsOut"
        from stock_movements ${where}`,
    ]);
    return { rows: rows.map(movementFromRow), total, unitsIn, unitsOut };
  });

  /** Units in and out per month (for the inventory overview), optionally from a date. */
  app.get("/api/stock-movements/monthly", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const parsed = z.object({ from: day }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: { th: "ตัวกรองไม่ถูกต้อง", en: "Invalid filter" } });
    const { from } = parsed.data;
    return sql<{ month: string; unitsIn: number; unitsOut: number }[]>`
      select to_char(ts, 'YYYY-MM') as month,
             coalesce(sum(quantity) filter (where quantity > 0), 0)::int as "unitsIn",
             coalesce(-sum(quantity) filter (where quantity < 0), 0)::int as "unitsOut"
      from stock_movements
      ${from ? sql`where ts >= ${from}::date` : sql``}
      group by 1 order by 1
    `;
  });

  /** Every journal entry, derived on the server from all the records (roles with price access only). */
  app.get("/api/accounting/journal", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!user.canViewSensitive) return reply.code(403).send(RESTRICTED);
    const store = await sql.begin("isolation level repeatable read read only", (tx) => loadStore(tx));
    return buildJournal(store);
  });
}
