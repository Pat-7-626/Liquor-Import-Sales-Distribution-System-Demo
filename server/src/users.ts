// User accounts: who can sign in and with which role. Senior Managers manage them; supervisors can look.
// Accounts are never deleted (the audit trail names them) — they are disabled, which signs them out at once.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Bilingual } from "../../src/data/types.ts";
import { hashPassword, issueSession, requireUser, verifyPassword, type SessionUser } from "./auth.ts";
import { sql, type Tx } from "./db.ts";

export const ROLES = [
  "seniorManager",
  "orderOfficer",
  "documentationOfficer",
  "warehouseOfficer",
  "taxOfficer",
  "salesOfficer",
  "distributionOfficer",
  "supervisor",
] as const;

const role = z.enum(ROLES);
const name = z.object({ th: z.string().trim().min(1).max(80), en: z.string().trim().min(1).max(80) });
const password = z.string().min(8).max(200);
const key = z.string().trim().regex(/^[A-Za-z0-9._-]{2,32}$/);

const say = (th: string, en: string) => ({ error: { th, en } });
const DENIED = say("บทบาทของคุณไม่มีสิทธิ์ดำเนินการนี้", "Your role isn't permitted to do this");

const ROLE_LABEL: Record<string, Bilingual> = {
  seniorManager: { th: "ผู้บริหาร", en: "Senior Manager" },
  orderOfficer: { th: "เจ้าหน้าที่สั่งซื้อ", en: "Order Officer" },
  documentationOfficer: { th: "เจ้าหน้าที่เอกสาร", en: "Documentation Officer" },
  warehouseOfficer: { th: "เจ้าหน้าที่คลังสินค้า", en: "Warehouse Officer" },
  taxOfficer: { th: "เจ้าหน้าที่ภาษี", en: "Tax Officer" },
  salesOfficer: { th: "พนักงานขาย", en: "Sales Officer" },
  distributionOfficer: { th: "เจ้าหน้าที่กระจายสินค้า", en: "Distribution Officer" },
  supervisor: { th: "หัวหน้างาน", en: "Supervisor" },
};

interface UserRecord {
  key: string;
  role: string;
  name: Bilingual;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  password_changed_at: string | null;
  must_change_password: boolean;
  locked_until: string | null;
}

const toPublic = (u: UserRecord) => ({
  key: u.key,
  role: u.role,
  name: u.name,
  active: u.active,
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at,
  passwordChangedAt: u.password_changed_at,
  mustChangePassword: u.must_change_password,
  lockedUntil: u.locked_until && new Date(u.locked_until).getTime() > Date.now() ? u.locked_until : null,
});

async function audit(db: Tx | typeof sql, actor: SessionUser, userKey: string, action: "created" | "updated", summary: Bilingual) {
  await db`
    insert into audit_log (id, ts, entity_type, entity_id, action, actor, summary, sensitive)
    values (${randomUUID()}, now(), 'user', ${userKey}, ${action}, ${db.json({ ...actor.name })}, ${db.json({ ...summary })}, false)
  `;
}

async function requirePermission(req: Parameters<typeof requireUser>[0], reply: FastifyReply, perm: "viewUsers" | "manageUsers") {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!user.can(perm)) {
    reply.code(403).send(DENIED);
    return null;
  }
  return user;
}

/** Serialised with the same lock as business commands, so two admins can't race (e.g. both disabling the last manager). */
const locked = <T>(fn: (tx: Tx) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242)`;
    return fn(tx);
  }) as Promise<T>;

/** There must always be at least one active Senior Manager, or nobody could manage users again. */
async function wouldLeaveNoManager(tx: Tx, target: UserRecord, next: { role?: string; active?: boolean }) {
  const losesManager = target.role === "seniorManager" && target.active && ((next.role && next.role !== "seniorManager") || next.active === false);
  if (!losesManager) return false;
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from users where role = 'seniorManager' and active and key <> ${target.key}`;
  return n === 0;
}

export function registerUserRoutes(app: FastifyInstance) {
  /** Everyone with access to the page sees every staff account (never password hashes). */
  app.get("/api/admin/users", async (req, reply) => {
    const user = await requirePermission(req, reply, "viewUsers");
    if (!user) return;
    const rows = await sql<UserRecord[]>`
      select key, role, name, active, created_at, last_login_at, password_changed_at, must_change_password, locked_until
      from users where role <> 'guest' order by active desc, key`;
    return { users: rows.map(toPublic), me: user.key, canManage: user.can("manageUsers") };
  });

  app.post("/api/admin/users", async (req, reply) => {
    const user = await requirePermission(req, reply, "manageUsers");
    if (!user) return;
    const body = z.object({ key, role, name, password }).safeParse(req.body);
    if (!body.success) {
      const field = body.error.issues[0]?.path[0];
      return reply.code(422).send(
        field === "key"
          ? say("ชื่อผู้ใช้ต้องมี 2–32 ตัว: ตัวอักษร ตัวเลข . _ -", "Username must be 2–32 characters: letters, numbers, dot, underscore or dash")
          : field === "password"
            ? say("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร", "Password must be at least 8 characters")
            : field === "name"
              ? say("กรุณาระบุชื่อทั้งภาษาไทยและอังกฤษ", "Enter the name in both Thai and English")
              : say("ข้อมูลไม่ถูกต้อง", "Check the details and try again"),
      );
    }
    const b = body.data;
    if (b.key.toLowerCase() === "guest") return reply.code(422).send(say('"guest" ใช้ไม่ได้', '"guest" is reserved'));
    const hash = await hashPassword(b.password);
    return locked(async (tx) => {
      const [exists] = await tx`select 1 from users where lower(key) = lower(${b.key})`;
      if (exists) return reply.code(409).send(say(`มีผู้ใช้ "${b.key}" อยู่แล้ว`, `There's already a user "${b.key}"`));
      // The first password is set by an administrator, so the person changes it when they first sign in.
      const [row] = await tx<UserRecord[]>`
        insert into users (key, role, name, password_hash, must_change_password, password_changed_at)
        values (${b.key}, ${b.role}, ${tx.json({ ...b.name })}, ${hash}, true, now())
        returning key, role, name, active, created_at, last_login_at, password_changed_at, must_change_password, locked_until`;
      await audit(tx, user, b.key, "created", {
        th: `สร้างผู้ใช้ ${b.key} (${ROLE_LABEL[b.role].th})`,
        en: `Created user ${b.key} (${ROLE_LABEL[b.role].en})`,
      });
      return { user: toPublic(row) };
    });
  });

  /** Change role, name, or active status. */
  app.patch<{ Params: { key: string } }>("/api/admin/users/:key", async (req, reply) => {
    const user = await requirePermission(req, reply, "manageUsers");
    if (!user) return;
    const body = z.object({ role: role.optional(), name: name.optional(), active: z.boolean().optional(), unlock: z.literal(true).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(422).send(say("ข้อมูลไม่ถูกต้อง", "Check the details and try again"));
    const b = body.data;
    return locked(async (tx) => {
      const [target] = await tx<UserRecord[]>`
        select key, role, name, active, created_at, last_login_at, password_changed_at, must_change_password, locked_until
        from users where key = ${req.params.key} and role <> 'guest'`;
      if (!target) return reply.code(404).send(say("ไม่พบผู้ใช้", "User not found"));
      const self = target.key === user.key;
      if (self && b.active === false) return reply.code(422).send(say("ปิดบัญชีของตัวเองไม่ได้", "You can't disable your own account"));
      if (self && b.role && b.role !== target.role) return reply.code(422).send(say("เปลี่ยนบทบาทของตัวเองไม่ได้", "You can't change your own role"));
      if (await wouldLeaveNoManager(tx, target, b))
        return reply.code(422).send(say("ต้องมีผู้บริหารที่ใช้งานอยู่อย่างน้อย 1 คน", "There must always be at least one active Senior Manager"));

      const changes: { th: string; en: string }[] = [];
      if (b.role && b.role !== target.role)
        changes.push({ th: `บทบาท ${ROLE_LABEL[target.role].th} → ${ROLE_LABEL[b.role].th}`, en: `role ${ROLE_LABEL[target.role].en} → ${ROLE_LABEL[b.role].en}` });
      if (b.name && (b.name.th !== target.name.th || b.name.en !== target.name.en))
        changes.push({ th: `ชื่อ → ${b.name.th}`, en: `name → ${b.name.en}` });
      if (b.active !== undefined && b.active !== target.active)
        changes.push(b.active ? { th: "เปิดใช้งานบัญชี", en: "account enabled" } : { th: "ปิดใช้งานบัญชี", en: "account disabled" });
      const locked = target.locked_until && new Date(target.locked_until).getTime() > Date.now();
      if (b.unlock && locked) changes.push({ th: "ปลดล็อกการเข้าสู่ระบบ", en: "sign-in unlocked" });
      if (changes.length === 0) return { user: toPublic(target) };

      const [row] = await tx<UserRecord[]>`
        update users set
          role = ${b.role ?? target.role},
          name = ${tx.json({ ...(b.name ?? target.name) })},
          active = ${b.active ?? target.active},
          -- Disabling signs the person out everywhere.
          token_version = token_version + ${b.active === false ? 1 : 0},
          failed_logins = case when ${Boolean(b.unlock)} then 0 else failed_logins end,
          locked_until = case when ${Boolean(b.unlock)} then null else locked_until end
        where key = ${target.key}
        returning key, role, name, active, created_at, last_login_at, password_changed_at, must_change_password, locked_until`;
      await audit(tx, user, target.key, "updated", {
        th: `ผู้ใช้ ${target.key}: ${changes.map((c) => c.th).join("; ")}`,
        en: `User ${target.key}: ${changes.map((c) => c.en).join("; ")}`,
      });
      return { user: toPublic(row) };
    });
  });

  /** Administrator sets a temporary password; the person must change it at next sign-in. */
  app.post<{ Params: { key: string } }>("/api/admin/users/:key/password", async (req, reply) => {
    const user = await requirePermission(req, reply, "manageUsers");
    if (!user) return;
    if (req.params.key === user.key) return reply.code(422).send(say("เปลี่ยนรหัสผ่านของตัวเองที่เมนู “เปลี่ยนรหัสผ่าน”", "Use “Change password” for your own account"));
    const body = z.object({ password }).safeParse(req.body);
    if (!body.success) return reply.code(422).send(say("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร", "Password must be at least 8 characters"));
    const hash = await hashPassword(body.data.password);
    return locked(async (tx) => {
      const [row] = await tx<UserRecord[]>`
        update users set password_hash = ${hash}, must_change_password = true, password_changed_at = now(), token_version = token_version + 1
        where key = ${req.params.key} and role <> 'guest'
        returning key, role, name, active, created_at, last_login_at, password_changed_at, must_change_password, locked_until`;
      if (!row) return reply.code(404).send(say("ไม่พบผู้ใช้", "User not found"));
      await audit(tx, user, row.key, "updated", {
        th: `ตั้งรหัสผ่านชั่วคราวให้ ${row.key} (ต้องเปลี่ยนเมื่อเข้าสู่ระบบ)`,
        en: `Set a temporary password for ${row.key} (must change at sign-in)`,
      });
      return { user: toPublic(row) };
    });
  });

  /** Anyone signed in (not guests) changes their own password; works while a temporary password is pending. */
  app.post("/api/auth/password", async (req, reply) => {
    const user = await requireUser(req, reply, { allowPendingPassword: true });
    if (!user) return;
    if (user.role === "guest") return reply.code(403).send(DENIED);
    const body = z.object({ current: z.string().max(200), next: password }).safeParse(req.body);
    if (!body.success) return reply.code(422).send(say("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", "The new password must be at least 8 characters"));
    const [row] = await sql<{ password_hash: string }[]>`select password_hash from users where key = ${user.key}`;
    if (!(await verifyPassword(body.data.current, row.password_hash))) return reply.code(422).send(say("รหัสผ่านปัจจุบันไม่ถูกต้อง", "Your current password is wrong"));
    if (body.data.current === body.data.next) return reply.code(422).send(say("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม", "Choose a password different from the current one"));
    const hash = await hashPassword(body.data.next);
    const [updated] = await sql<{ token_version: number }[]>`
      update users set password_hash = ${hash}, must_change_password = false, password_changed_at = now(), token_version = token_version + 1
      where key = ${user.key} returning token_version`;
    await audit(sql, user, user.key, "updated", { th: `${user.key} เปลี่ยนรหัสผ่าน`, en: `${user.key} changed their password` });
    // Other sessions end; this one continues with a fresh cookie.
    issueSession(reply, user.key, updated.token_version);
    return { ok: true };
  });
}
