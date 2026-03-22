/**
 * Email service — IMAP (receive) + SMTP (send) via Zoho Mail
 *
 * Env vars required:
 *   ZOHO_IMAP_HOST=imappro.zoho.com
 *   ZOHO_IMAP_PORT=993
 *   ZOHO_SMTP_HOST=smtppro.zoho.com
 *   ZOHO_SMTP_PORT=465
 *   ZOHO_MAIL_USER=vladyslav@sunpartstrading.store
 *   ZOHO_MAIL_PASSWORD=<app-specific-password>
 */

import nodemailer from "nodemailer";

// ── Config ──────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    imap: {
      host: process.env.ZOHO_IMAP_HOST || "imappro.zoho.com",
      port: parseInt(process.env.ZOHO_IMAP_PORT || "993", 10),
    },
    smtp: {
      host: process.env.ZOHO_SMTP_HOST || "smtppro.zoho.com",
      port: parseInt(process.env.ZOHO_SMTP_PORT || "465", 10),
    },
    user: process.env.ZOHO_MAIL_USER || "",
    password: process.env.ZOHO_MAIL_PASSWORD || "",
  };
}

export function isEmailConfigured(): boolean {
  const cfg = getConfig();
  return !!(cfg.user && cfg.password);
}

// ── Types ───────────────────────────────────────────────────────────────────

export type FetchedEmail = {
  messageId: string;
  from: string;
  fromName: string;
  to: string;
  cc: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  date: Date;
  hasAttachment: boolean;
};

// ── IMAP — Fetch emails ─────────────────────────────────────────────────────

export async function fetchEmails(
  folder: string = "INBOX",
  limit: number = 50,
): Promise<FetchedEmail[]> {
  const cfg = getConfig();
  if (!cfg.user || !cfg.password) {
    throw new Error("Email not configured — set ZOHO_MAIL_USER and ZOHO_MAIL_PASSWORD");
  }

  // Dynamic import to avoid bundling issues
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  const emails: FetchedEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);

    try {
      // Fetch latest N messages
      const mb = client.mailbox;
      const total = mb && typeof mb === "object" && "exists" in mb ? (mb as { exists: number }).exists : 0;
      if (total === 0) return emails;

      const startSeq = Math.max(1, total - limit + 1);
      const range = `${startSeq}:*`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        source: true,
      })) {
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source as Buffer);

          const fromAddr = msg.envelope?.from?.[0];
          const toAddrs = msg.envelope?.to ?? [];

          emails.push({
            messageId: msg.envelope?.messageId || `gen-${msg.seq}-${Date.now()}`,
            from: fromAddr?.address || "",
            fromName: fromAddr?.name || fromAddr?.address || "",
            to: toAddrs.map((a: { address?: string }) => a.address).filter(Boolean).join(", "),
            cc: (msg.envelope?.cc ?? []).map((a: { address?: string }) => a.address).filter(Boolean).join(", "),
            subject: msg.envelope?.subject || "(No Subject)",
            bodyText: parsed.text || "",
            bodyHtml: parsed.html || "",
            date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
            hasAttachment: (parsed.attachments?.length ?? 0) > 0,
          });
        } catch (parseErr) {
          console.error("[Email] Parse error for msg", msg.seq, parseErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("[Email] IMAP error:", err);
    try { await client.logout(); } catch { /* ignore */ }
    throw err;
  }

  // Sort newest first
  emails.sort((a, b) => b.date.getTime() - a.date.getTime());
  return emails;
}

// ── SMTP — Send email ───────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ messageId: string }> {
  const cfg = getConfig();
  if (!cfg.user || !cfg.password) {
    throw new Error("Email not configured — set ZOHO_MAIL_USER and ZOHO_MAIL_PASSWORD");
  }

  const transporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
  });

  const result = await transporter.sendMail({
    from: cfg.user,
    to: opts.to,
    cc: opts.cc || undefined,
    subject: opts.subject,
    html: opts.html,
    text: opts.text || opts.html.replace(/<[^>]*>/g, ""),
  });

  return { messageId: result.messageId || `sent-${Date.now()}` };
}

export function getMailUser(): string {
  return getConfig().user;
}
