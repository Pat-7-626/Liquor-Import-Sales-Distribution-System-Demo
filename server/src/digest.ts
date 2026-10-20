/**
 * The morning summary: once a day, after DIGEST_HOUR, each person who asked for it gets one email listing
 * what's waiting on them — the same notices as the bell in the header, each linking to where it's dealt
 * with. Nothing is sent on a day with nothing to do. "Send me one now" sends it regardless, as a test.
 */
import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { ROLE_PERMISSIONS, SENSITIVE_DATA_ROLES } from "../../src/data/identities.ts";
import type { Bilingual, Role } from "../../src/data/types.ts";
import { computeNotices, type Notice } from "../../src/domain/notices.ts";
import { translate } from "../../src/i18n/translations.ts";
import { todayIso } from "../../src/lib/business.ts";
import { requireUser } from "./auth.ts";
import { config } from "./config.ts";
import { sql } from "./db.ts";
import { mailer } from "./mail.ts";
import { loadStore } from "./repo.ts";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Recipient = { key: string; role: Role; name: Bilingual; email: string };

async function noticesFor(role: Role): Promise<Notice[]> {
  const store = await loadStore(sql, { light: true });
  const perms = ROLE_PERMISSIONS[role];
  return computeNotices(store, (p) => perms?.has(p) ?? false, SENSITIVE_DATA_ROLES.has(role), todayIso());
}

/** Thai first, then English — the same way the documents read. */
function compose(r: Recipient, notices: Notice[]) {
  const today = todayIso();
  const line = (n: Notice, lang: "th" | "en") => translate(lang, n.label).replace("{n}", String(n.count));
  const subject = notices.length
    ? `สรุปงานประจำวัน ${today} — ${notices.length} เรื่อง / Your day: ${notices.length} item${notices.length === 1 ? "" : "s"}`
    : `สรุปงานประจำวัน ${today} / Your day: nothing waiting`;
  const items = notices
    .map(
      (n) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="${escape(config.appUrl + n.href)}" style="color:#7a2335;text-decoration:none;font-weight:600">${escape(line(n, "th"))}</a><div style="color:#666;font-size:12px">${escape(line(n, "en"))}</div></td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="font-family:'Sarabun','Segoe UI',sans-serif;font-size:14px;color:#222;margin:0;padding:24px;background:#f7f5f2">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<p style="margin:0 0 4px">สวัสดีคุณ ${escape(r.name.th)} / Good morning, ${escape(r.name.en)}</p>
<p style="margin:0 0 16px;color:#666;font-size:13px">${notices.length ? "เรื่องที่รอคุณวันนี้ / What's waiting on you today" : "วันนี้ไม่มีเรื่องที่รอคุณ / Nothing is waiting on you today"}</p>
${notices.length ? `<table style="width:100%;border-collapse:collapse">${items}</table>` : ""}
<p style="margin:20px 0 0"><a href="${escape(config.appUrl)}" style="display:inline-block;background:#7a2335;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">เปิดระบบ / Open the system</a></p>
<p style="margin:20px 0 0;color:#999;font-size:11px">ปิดการรับอีเมลนี้ได้ที่ "บัญชีของฉัน" / Turn this email off under "My account".</p>
</div></body></html>`;
  const text = [
    `${r.name.en} — ${today}`,
    ...notices.map((n) => `• ${line(n, "th")} / ${line(n, "en")}\n  ${config.appUrl}${n.href}`),
    notices.length ? "" : "Nothing is waiting on you today.",
    config.appUrl,
  ].join("\n");
  return { subject, html, text };
}

async function send(r: Recipient, notices: Notice[]) {
  const { subject, html, text } = compose(r, notices);
  await mailer().sendMail({ from: config.smtp.from, to: r.email, subject, html, text });
}

/** One pass: everyone due a summary today. Each person is claimed first, so two API instances can't both send. */
export async function runDigest(log: FastifyBaseLogger) {
  if (!config.smtp.host || new Date().getHours() < config.digestHour) return;
  const today = todayIso();
  const due = await sql<Recipient[]>`
    update users set last_summary_on = ${today}
    where active and daily_summary and email <> '' and role <> 'guest' and (last_summary_on is null or last_summary_on < ${today})
    returning key, role, name, email`;
  const byRole = new Map<Role, Notice[]>();
  for (const r of due) {
    try {
      if (!byRole.has(r.role)) byRole.set(r.role, await noticesFor(r.role));
      const notices = byRole.get(r.role)!;
      if (notices.length) await send(r, notices);
    } catch (e) {
      log.error({ err: e, user: r.key }, "morning summary failed");
    }
  }
}

export function startDigest(log: FastifyBaseLogger) {
  const tick = () => void runDigest(log).catch((e) => log.error(e, "morning summary run failed"));
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 5 * 60_000).unref();
}

const settings = z.object({ email: z.string().trim().max(200).email().or(z.literal("")), dailySummary: z.boolean() });
const lastSentNow = new Map<string, number>();

export function registerDigestRoutes(app: FastifyInstance) {
  app.get("/api/me/summary", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const [row] = await sql<{ email: string; daily_summary: boolean }[]>`select email, daily_summary from users where key = ${user.key}`;
    return { email: row?.email ?? "", dailySummary: row?.daily_summary ?? false, emailEnabled: Boolean(config.smtp.host), hour: config.digestHour };
  });

  app.post("/api/me/summary", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (user.role === "guest") return reply.code(403).send({ error: { th: "ผู้เยี่ยมชมตั้งค่าไม่ได้", en: "Guests can't change this" } });
    const body = settings.safeParse(req.body);
    if (!body.success) return reply.code(422).send({ error: { th: "อีเมลไม่ถูกต้อง", en: "That email address isn't valid" } });
    if (body.data.dailySummary && !body.data.email) return reply.code(422).send({ error: { th: "กรุณาระบุอีเมล", en: "Give an email address first" } });
    await sql`update users set email = ${body.data.email}, daily_summary = ${body.data.dailySummary} where key = ${user.key}`;
    return { ok: true };
  });

  app.post("/api/me/summary/send", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (user.role === "guest") return reply.code(403).send({ error: { th: "ผู้เยี่ยมชมส่งไม่ได้", en: "Guests can't send this" } });
    if (!config.smtp.host) return reply.code(503).send({ error: { th: "ยังไม่ได้ตั้งค่าอีเมล (SMTP)", en: "Email isn't set up (SMTP)" } });
    const [row] = await sql<Recipient[]>`select key, role, name, email from users where key = ${user.key}`;
    if (!row?.email) return reply.code(422).send({ error: { th: "กรุณาบันทึกอีเมลก่อน", en: "Save an email address first" } });
    if (Date.now() - (lastSentNow.get(user.key) ?? 0) < 60_000) return reply.code(429).send({ error: { th: "รอสักครู่แล้วลองใหม่", en: "Wait a minute and try again" } });
    lastSentNow.set(user.key, Date.now());
    try {
      await send(row, await noticesFor(row.role));
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: { th: "ส่งอีเมลไม่สำเร็จ", en: "The email couldn't be sent" } });
    }
    return { ok: true };
  });
}
