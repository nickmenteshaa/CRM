import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchEmails, isEmailConfigured, getMailUser } from "@/lib/email-service";
import { dbBulkSaveEmails } from "@/lib/actions-email";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const session = cookieStore.get("crm_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionData: { id?: string; name?: string; role?: string };
  try {
    sessionData = JSON.parse(decodeURIComponent(session.value));
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({
      error: "Email not configured. Set ZOHO_MAIL_USER and ZOHO_MAIL_PASSWORD in environment.",
      configured: false,
    }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const folder = (body as { folder?: string }).folder || "INBOX";
    const limit = Math.min(100, Math.max(10, (body as { limit?: number }).limit || 50));

    console.log(`[Email Sync] Fetching ${limit} emails from ${folder} for ${sessionData.name}`);

    const fetched = await fetchEmails(folder, limit);

    // Save to DB
    const saveData = fetched.map((e) => ({
      messageId: e.messageId,
      folder,
      fromAddress: e.from,
      fromName: e.fromName,
      toAddress: e.to,
      cc: e.cc,
      subject: e.subject,
      bodyText: e.bodyText,
      bodyHtml: e.bodyHtml,
      date: e.date,
      hasAttachment: e.hasAttachment,
      employeeId: sessionData.id!,
      isRead: false,
    }));

    const result = await dbBulkSaveEmails(saveData);

    await auditLog({
      action: "email.sync",
      entity: "Email",
      userId: sessionData.id,
      userName: sessionData.name,
      details: { folder, fetched: fetched.length, created: result.created, skipped: result.skipped },
    });

    return NextResponse.json({
      ok: true,
      fetched: fetched.length,
      created: result.created,
      skipped: result.skipped,
      mailUser: getMailUser(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    console.error("[Email Sync] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
