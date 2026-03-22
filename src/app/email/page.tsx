"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetEmails,
  dbMarkEmailRead,
  dbToggleEmailStar,
  dbDeleteEmail,
  type EmailRecord,
  type EmailsPageResult,
} from "@/lib/actions-email";

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function EmailPage() {
  const { user } = useAuth();
  const [folder, setFolder] = useState<"INBOX" | "Sent">("INBOX");
  const [result, setResult] = useState<EmailsPageResult | null>(null);
  const [selected, setSelected] = useState<EmailRecord | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // ── Fetch emails from DB ──────────────────────────────────────────────

  const fetchEmails = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await dbGetEmails({
        employeeId: user.id,
        folder,
        page,
        limit: 30,
        query: query || undefined,
      });
      setResult(data);
    } catch (err) {
      console.error("[Email] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user, folder, page, query]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  // ── Sync from IMAP ────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.error || "Sync failed");
      } else {
        setSyncMsg(`Synced: ${data.created} new, ${data.skipped} existing`);
        await fetchEmails();
      }
    } catch {
      setSyncMsg("Network error during sync");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 5000);
    }
  }

  // ── Select email ──────────────────────────────────────────────────────

  async function handleSelect(email: EmailRecord) {
    setSelected(email);
    if (!email.isRead) {
      await dbMarkEmailRead(email.id, true);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              emails: prev.emails.map((e) =>
                e.id === email.id ? { ...e, isRead: true } : e,
              ),
            }
          : prev,
      );
    }
  }

  // ── Star toggle ───────────────────────────────────────────────────────

  async function handleStar(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = await dbToggleEmailStar(id);
    setResult((prev) =>
      prev
        ? {
            ...prev,
            emails: prev.emails.map((em) =>
              em.id === id ? { ...em, isStarred: next } : em,
            ),
          }
        : prev,
    );
    if (selected?.id === id) setSelected((s) => s ? { ...s, isStarred: next } : s);
  }

  // ── Delete ────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    await dbDeleteEmail(id);
    if (selected?.id === id) setSelected(null);
    await fetchEmails();
  }

  // ── Send email ────────────────────────────────────────────────────────

  async function handleSend() {
    if (!composeTo || !composeSubject) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          html: composeBody.replace(/\n/g, "<br>"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Send failed");
      } else {
        setComposeOpen(false);
        setComposeTo("");
        setComposeCc("");
        setComposeSubject("");
        setComposeBody("");
        setSyncMsg("Email sent successfully!");
        setTimeout(() => setSyncMsg(""), 4000);
      }
    } catch {
      alert("Network error");
    } finally {
      setSending(false);
    }
  }

  // ── Reply ─────────────────────────────────────────────────────────────

  function handleReply(email: EmailRecord) {
    setComposeTo(email.fromAddress);
    setComposeSubject(`Re: ${email.subject.replace(/^Re:\s*/i, "")}`);
    setComposeBody(`\n\n--- Original Message ---\nFrom: ${email.fromAddress}\nDate: ${new Date(email.date).toLocaleString()}\n\n${email.bodyText || ""}`);
    setComposeOpen(true);
  }

  // ── Render ────────────────────────────────────────────────────────────

  const emails = result?.emails ?? [];

  return (
    <div className="flex min-h-screen bg-[#070B10]">
      <Sidebar />
      <main className="flex-1 lg:ml-64 flex flex-col lg:flex-row">
        {/* ── Left Panel: Email List ──────────────────────────────────── */}
        <div className="w-full lg:w-96 border-r border-[#1F2937] bg-[#0B0F14] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-[#1F2937]">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-lg font-bold text-[#F9FAFB]">Email</h1>
              <div className="flex gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {syncing ? "Syncing…" : "↻ Sync"}
                </button>
                <button
                  onClick={() => setComposeOpen(true)}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  + Compose
                </button>
              </div>
            </div>

            {syncMsg && (
              <p className={`text-xs mb-2 ${syncMsg.includes("error") || syncMsg.includes("fail") ? "text-red-400" : "text-green-400"}`}>
                {syncMsg}
              </p>
            )}

            {/* Folder tabs */}
            <div className="flex gap-1 mb-3">
              {(["INBOX", "Sent"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFolder(f); setPage(1); setSelected(null); }}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    folder === f
                      ? "bg-blue-600 text-white"
                      : "bg-[#1F2937] text-[#9CA3AF] hover:text-white"
                  }`}
                >
                  {f === "INBOX" ? "Inbox" : "Sent"}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search emails…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="w-full bg-[#111827] border border-[#374151] rounded-lg px-3 py-2 text-sm text-[#F9FAFB] placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
            ) : emails.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500 text-sm">No emails found</p>
                <p className="text-gray-600 text-xs mt-1">Click Sync to pull from mailbox</p>
              </div>
            ) : (
              emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => handleSelect(email)}
                  className={`px-4 py-3 border-b border-[#1F2937] cursor-pointer transition-colors ${
                    selected?.id === email.id
                      ? "bg-blue-900/30 border-l-2 border-l-blue-500"
                      : "hover:bg-[#111827]"
                  } ${!email.isRead ? "bg-[#0D1320]" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={(e) => handleStar(email.id, e)}
                      className={`mt-0.5 text-sm ${email.isStarred ? "text-yellow-400" : "text-gray-600 hover:text-gray-400"}`}
                    >
                      {email.isStarred ? "★" : "☆"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <p className={`text-sm truncate ${!email.isRead ? "font-semibold text-[#F9FAFB]" : "text-[#D1D5DB]"}`}>
                          {folder === "INBOX"
                            ? (email.fromName || email.fromAddress)
                            : email.toAddress}
                        </p>
                        <span className="text-[10px] text-gray-500 ml-2 whitespace-nowrap">
                          {timeAgo(email.date)}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${!email.isRead ? "text-[#E5E7EB]" : "text-[#9CA3AF]"}`}>
                        {email.subject || "(No Subject)"}
                      </p>
                      <p className="text-[11px] text-gray-600 truncate mt-0.5">
                        {truncate(email.bodyText || "", 80)}
                      </p>
                    </div>
                    {email.hasAttachment && <span className="text-gray-500 text-xs mt-1">📎</span>}
                    {!email.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {result && result.totalPages > 1 && (
            <div className="p-3 border-t border-[#1F2937] flex items-center justify-between text-xs text-gray-500">
              <span>{result.total} emails</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 bg-[#1F2937] rounded disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="px-2 py-1">{page}/{result.totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
                  disabled={page >= result.totalPages}
                  className="px-2 py-1 bg-[#1F2937] rounded disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel: Email Detail / Empty State ─────────────────── */}
        <div className="flex-1 flex flex-col bg-[#070B10]">
          {selected ? (
            <>
              {/* Email header */}
              <div className="p-6 border-b border-[#1F2937]">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-[#F9FAFB] mb-2">
                      {selected.subject || "(No Subject)"}
                    </h2>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                        {(selected.fromName || selected.fromAddress)?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-[#F9FAFB] font-medium">
                          {selected.fromName || selected.fromAddress}
                        </p>
                        <p className="text-[#9CA3AF] text-xs">{selected.fromAddress}</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      <span>To: {selected.toAddress}</span>
                      {selected.cc && <span className="ml-3">CC: {selected.cc}</span>}
                      <span className="ml-3">{new Date(selected.date).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReply(selected)}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      ↩ Reply
                    </button>
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>

              {/* Email body */}
              <div className="flex-1 overflow-y-auto p-6">
                {selected.bodyHtml ? (
                  <div
                    className="prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                  />
                ) : (
                  <pre className="text-sm text-[#D1D5DB] whitespace-pre-wrap font-sans">
                    {selected.bodyText || "(No content)"}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-20">✉</div>
                <p className="text-gray-500 text-sm">Select an email to read</p>
                <p className="text-gray-600 text-xs mt-1">
                  Or click Sync to pull new messages from your mailbox
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Compose Modal ─────────────────────────────────────────────── */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl w-full max-w-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1F2937]">
              <h3 className="text-sm font-bold text-[#F9FAFB]">New Email</h3>
              <button
                onClick={() => setComposeOpen(false)}
                className="text-gray-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full bg-[#0B0F14] border border-[#374151] rounded-lg px-3 py-2 text-sm text-[#F9FAFB] placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">CC (optional)</label>
                <input
                  type="text"
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="w-full bg-[#0B0F14] border border-[#374151] rounded-lg px-3 py-2 text-sm text-[#F9FAFB] placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Email subject"
                  className="w-full bg-[#0B0F14] border border-[#374151] rounded-lg px-3 py-2 text-sm text-[#F9FAFB] placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Message</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  rows={10}
                  placeholder="Write your message…"
                  className="w-full bg-[#0B0F14] border border-[#374151] rounded-lg px-3 py-2 text-sm text-[#F9FAFB] placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-[#1F2937]">
              <button
                onClick={() => setComposeOpen(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !composeTo || !composeSubject}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
