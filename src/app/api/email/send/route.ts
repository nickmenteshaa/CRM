import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sendEmail, isEmailConfigured, getMailUser } from "@/lib/email-service";
import { dbSaveEmail } from "@/lib/actions-email";
import { auditLog } from "@/lib/actions-audit";

export const runtime = "nodejs";
export const maxDuration = 15;

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
    const body = await request.json();
    const { to, cc, subject, html } = body as {
      to: string;
      cc?: string;
      subject: string;
      html: string;
    };

    if (!to || !subject) {
      return NextResponse.json({ error: "To and subject are required" }, { status: 400 });
    }

    const result = await sendEmail({ to, cc, subject, html });

    // Save to DB as sent
    await dbSaveEmail({
      messageId: result.messageId,
      folder: "Sent",
      fromAddress: getMailUser(),
      fromName: sessionData.name,
      toAddress: to,
      cc: cc || undefined,
      subject,
      bodyText: html.replace(/<[^>]*>/g, ""),
      bodyHtml: html,
      date: new Date(),
      employeeId: sessionData.id!,
      isRead: true,
    });

    await auditLog({
      action: "email.sent",
      entity: "Email",
      userId: sessionData.id,
      userName: sessionData.name,
      details: { to, subject },
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    console.error("[Email Send] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
