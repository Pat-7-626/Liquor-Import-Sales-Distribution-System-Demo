/**
 * Emailing documents. The browser renders the document exactly as it prints (styles included) and posts
 * it here; the API sends it through the configured SMTP server as the email body, attaches it as an A4
 * PDF (or as the .html page if no PDF renderer is available), and records the sending on the audit trail. By default the Docker stack
 * points at Mailpit — a local catch-all mailbox — so nothing reaches real people until SMTP is set up.
 */
import type { FastifyInstance } from "fastify";
import nodemailer from "nodemailer";
import { z } from "zod";
import * as A from "../../src/domain/actions.ts";
import { requireUser } from "./auth.ts";
import { withLockedStore } from "./commands.ts";
import { config } from "./config.ts";
import { renderPdf } from "./pdf.ts";

const ENTITY_TYPES = ["salesOrder", "customer", "quotation", "expense", "payable"] as const;

const body = z.object({
  to: z.array(z.string().trim().email().max(200)).min(1).max(5),
  subject: z.string().trim().min(1).max(200),
  message: z.string().max(2000).default(""),
  /** The whole document as a standalone HTML page (styles inlined). */
  documentHtml: z.string().min(1).max(3_000_000),
  filename: z.string().trim().regex(/^[\w.\- ]{1,100}$/),
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().trim().min(1).max(64),
  document: z.string().trim().min(1).max(100),
});

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** At most this many emails per person per hour — the app is not a mailing list. */
const HOURLY_LIMIT = 30;
const sent = new Map<string, number[]>();

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
const mailer = () =>
  (transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  }));

export function registerMailRoutes(app: FastifyInstance) {
  app.get("/api/email/status", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return { enabled: Boolean(config.smtp.host), catchAll: config.smtp.catchAllUrl || null };
  });

  app.post("/api/email", { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    // Documents carry prices: only roles that see them may send them.
    if (user.role === "guest" || !user.canViewSensitive)
      return reply.code(403).send({ result: { ok: false, error: { th: "บทบาทของคุณไม่มีสิทธิ์ส่งเอกสาร", en: "Your role can't email documents" } } });
    if (!config.smtp.host)
      return reply.code(503).send({ result: { ok: false, error: { th: "ยังไม่ได้ตั้งค่าอีเมล (SMTP)", en: "Email isn't set up (SMTP)" } } });
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      const where = parsed.error.issues[0]?.path.join(".") ?? "";
      return reply.code(422).send({ result: { ok: false, error: { th: `ข้อมูลไม่ถูกต้อง (${where})`, en: `Invalid input (${where})` } } });
    }
    const m = parsed.data;

    const now = Date.now();
    const recent = (sent.get(user.key) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= HOURLY_LIMIT)
      return reply.code(429).send({ result: { ok: false, error: { th: "ส่งอีเมลเกินจำนวนที่กำหนดต่อชั่วโมง", en: "Too many emails this hour — try again later" } } });

    // The covering note goes above the document, as plain text.
    const note = m.message.trim() ? `<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;margin:0 0 16px">${escape(m.message.trim())}</div><hr>` : "";
    const html = m.documentHtml.replace(/<body([^>]*)>/i, (tag) => `${tag}${note}`);
    let pdf: Buffer | null = null;
    try {
      pdf = await renderPdf(m.documentHtml);
    } catch (e) {
      req.log.warn({ err: e }, "PDF rendering failed, attaching the HTML instead");
    }
    const attachment = pdf
      ? { filename: `${m.filename}.pdf`, content: pdf, contentType: "application/pdf" }
      : { filename: `${m.filename}.html`, content: m.documentHtml, contentType: "text/html; charset=utf-8" };
    try {
      await mailer().sendMail({
        from: config.smtp.from,
        to: m.to,
        subject: m.subject,
        text: `${m.message.trim()}\n\n${m.document} — see the attached ${attachment.filename}`.trim(),
        html,
        attachments: [attachment],
      });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ result: { ok: false, error: { th: "ส่งอีเมลไม่สำเร็จ — ตรวจสอบการตั้งค่า SMTP", en: "The email couldn't be sent — check the SMTP settings" } } });
    }
    sent.set(user.key, [...recent, now]);
    await withLockedStore((_tx, store) => A.logEmail(store, { actor: user.name, can: user.can }, m.entityType, m.entityId, m.document, m.to));
    return { result: { ok: true }, attached: pdf ? "pdf" : "html" };
  });
}
