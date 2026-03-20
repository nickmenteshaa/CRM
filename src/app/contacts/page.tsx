"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Lead, type Message } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

// ── Constants ──────────────────────────────────────────────────────────────────

const FIELDS = [
  { key: "name",        label: "Name" },
  { key: "email",       label: "Email" },
  { key: "phone",       label: "Phone" },
  { key: "status",      label: "Status" },
  { key: "source",      label: "Source" },
  { key: "lastContact", label: "Last Contact" },
];

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Converted", "Lost", "Cold"];
const SOURCE_OPTIONS = ["Website", "Referral", "LinkedIn", "Cold Call", "Event"];
const STAGE_OPTIONS  = ["New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const ACTIVITY_TYPES = ["Call", "Email", "Meeting", "Note"] as const;
const MESSAGE_CHANNELS = ["Email", "WhatsApp", "SMS", "LinkedIn", "Other"] as const;
const DIRECTION_OPTIONS = ["outbound", "inbound"] as const;

const statusStyles: Record<string, string> = {
  New:        "bg-blue-100 text-blue-700",
  Contacted:  "bg-yellow-100 text-yellow-700",
  Qualified:  "bg-green-100 text-green-700",
  Converted:  "bg-purple-100 text-purple-700",
  Lost:       "bg-gray-100 text-gray-500",
  Cold:       "bg-slate-100 text-slate-500",
};

const sourceStyles: Record<string, string> = {
  Website:    "bg-purple-100 text-purple-700",
  Referral:   "bg-pink-100 text-pink-700",
  LinkedIn:   "bg-sky-100 text-sky-700",
  "Cold Call":"bg-orange-100 text-orange-700",
  Event:      "bg-teal-100 text-teal-700",
};

const activityIcons: Record<string, string> = {
  Call: "📞", Email: "✉", Meeting: "📅", Note: "📝",
};

const channelIcons: Record<string, string> = {
  Email: "✉", WhatsApp: "💬", SMS: "📱", LinkedIn: "🔗", Other: "📨",
};

const emptyForm = { name: "", email: "", phone: "", status: "New", source: "Website", lastContact: "Today" };

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-teal-500", "bg-orange-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const cls = size === "lg" ? "w-12 h-12 text-base" : "w-8 h-8 text-xs";
  return (
    <div className={`${cls} rounded-full ${color} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ── Field input helpers ────────────────────────────────────────────────────────

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { leads, activities, messages, addLead, updateLead, deleteLead, addDeal, addActivity, addMessage, aiSummarizeLead, aiConversation, aiFollowUp, loaded } = useApp();
  const { isAdmin, user } = useAuth();

  // sales users can only edit/delete leads they own or unassigned leads
  function canEditLead(lead: Lead) {
    if (isAdmin) return true;
    return !lead.ownerId || lead.ownerId === user?.id;
  }

  const [selected, setSelected]   = useState<Lead | null>(null);
  const [query, setQuery]         = useState("");
  const [activeFields, setActiveFields] = useState(FIELDS.map((f) => f.key));
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // modal states
  const [addOpen, setAddOpen]           = useState(false);
  const [editOpen, setEditOpen]         = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [dealOpen, setDealOpen]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [messageOpen, setMessageOpen]     = useState(false);

  // form states
  const [addForm, setAddForm]       = useState(emptyForm);
  const [editForm, setEditForm]     = useState<Lead | null>(null);
  const [activityForm, setActivityForm] = useState({ type: "Call" as typeof ACTIVITY_TYPES[number], note: "" });
  const [dealForm, setDealForm]     = useState({ name: "", value: "", stage: "New Opportunity", close: "", owner: "" });
  const [msgForm, setMsgForm]       = useState({
    channel: "Email" as Message["channel"],
    direction: "outbound" as Message["direction"],
    subject: "",
    body: "",
    recipient: "",
  });

  // form validation
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // AI states
  const [aiLoading, setAiLoading]   = useState<string | null>(null);
  const [convText, setConvText]     = useState("");

  // Detail panel tab
  const [detailTab, setDetailTab]   = useState<"details" | "comms">("details");

  const filtered = query.trim()
    ? leads.filter((l) =>
        activeFields.some((field) =>
          String(l[field as keyof Lead]).toLowerCase().includes(query.toLowerCase())
        )
      )
    : leads;

  // Keep selected lead in sync with latest state (for AI updates)
  const currentSelected = selected
    ? leads.find((l) => l.id === selected.id) ?? selected
    : null;

  const leadActivities = currentSelected
    ? activities.filter((a) => a.leadId === currentSelected.id)
    : [];

  const leadMessages = currentSelected
    ? messages.filter((m) => m.leadId === currentSelected.id)
    : [];

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAddLead() {
    const errors: Record<string, string> = {};
    if (!addForm.name.trim()) errors.name = "Name is required";
    if (!addForm.email.trim()) errors.email = "Email is required";
    else if (!validateEmail(addForm.email)) errors.email = "Enter a valid email";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    addLead(addForm);
    setJustAdded(addForm.name);
    setTimeout(() => setJustAdded(null), 3000);
    setAddForm(emptyForm);
    setAddOpen(false);
  }

  function handleEditOpen(lead: Lead) {
    setEditForm({ ...lead });
    setEditOpen(true);
  }

  function handleEditSave() {
    if (!editForm) return;
    updateLead(editForm.id, editForm);
    setSelected(editForm);
    setEditOpen(false);
  }

  function handleDelete() {
    if (!selected) return;
    deleteLead(selected.id);
    setSelected(null);
    setDeleteConfirm(false);
  }

  function handleLogActivity() {
    if (!selected || !activityForm.note.trim()) return;
    addActivity({
      leadId: selected.id,
      type: activityForm.type,
      note: activityForm.note,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
    setActivityForm({ type: "Call", note: "" });
    setActivityOpen(false);
  }

  function handleConvertToDeal() {
    if (!selected || !dealForm.name) return;
    addDeal({
      name: dealForm.name,
      contact: selected.name,
      value: dealForm.value || "$0",
      stage: dealForm.stage,
      close: dealForm.close,
      leadId: selected.id,
      leadName: selected.name,
      owner: dealForm.owner || undefined,
      createdDate: new Date().toISOString(),
    });
    updateLead(selected.id, { status: "Converted" });
    setSelected((prev) => prev ? { ...prev, status: "Converted" } : prev);
    setDealForm({ name: "", value: "", stage: "New Opportunity", close: "", owner: "" });
    setDealOpen(false);
  }

  async function handleAISummarize() {
    if (!selected) return;
    setAiLoading("summarize");
    await aiSummarizeLead(selected.id);
    setAiLoading(null);
  }

  async function handleAIConversation() {
    if (!selected || !convText.trim()) return;
    setAiLoading("conversation");
    await aiConversation(selected.id, convText);
    setConvText("");
    setAiLoading(null);
  }

  async function handleAIFollowUp() {
    if (!selected) return;
    setAiLoading("followup");
    await aiFollowUp(selected.id);
    setAiLoading(null);
  }

  function handleLogMessage() {
    if (!currentSelected || !msgForm.body.trim()) return;
    addMessage({
      leadId: currentSelected.id,
      channel: msgForm.channel,
      direction: msgForm.direction,
      subject: msgForm.subject || undefined,
      body: msgForm.body,
      sender: msgForm.direction === "outbound" ? (user?.name ?? "Me") : currentSelected.name,
      recipient: msgForm.direction === "outbound" ? currentSelected.name : (user?.name ?? "Me"),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
    setMsgForm({ channel: "Email", direction: "outbound", subject: "", body: "", recipient: "" });
    setMessageOpen(false);
  }

  function openDetailPanel(lead: Lead) {
    setSelected(lead === selected ? null : lead);
    setConvText("");
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${selected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
            <p className="text-sm text-gray-500 mt-1">{filtered.length} of {leads.length} leads</p>
          </div>
          <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            + Add Lead
          </button>
        </div>

        {justAdded && (
          <div className="mb-4 flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
            <span>✓</span>
            <span>Lead <strong>{justAdded}</strong> added — task <em>"Contact lead: {justAdded}"</em> auto-created on <a href="/tasks" className="underline font-medium">/tasks</a>.</span>
          </div>
        )}

        <SearchFilter query={query} onQueryChange={setQuery} fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields} placeholder="Search leads..." />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Last Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon="👤" title="No leads found" description="Try adjusting your search or filters, or add a new lead." /></td></tr>
              ) : filtered.map((lead) => (
                <tr key={lead.id} onClick={() => openDetailPanel(lead)} className={`cursor-pointer transition-colors ${selected?.id === lead.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={lead.name} />
                      <span className="font-medium text-gray-900">{lead.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{lead.email}</td>
                  <td className="px-5 py-3.5 text-gray-500">{lead.phone}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[lead.status]}`}>{lead.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sourceStyles[lead.source] ?? "bg-gray-100 text-gray-600"}`}>{lead.source}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">{lead.lastContact}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>)}
      </main>

      {/* ── Detail panel ──────────────────────────────────────────────────────── */}
      {currentSelected && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Lead Details</h3>
            <div className="flex items-center gap-2">
              {canEditLead(currentSelected) && (
                <button onClick={() => handleEditOpen(currentSelected)} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50">Edit</button>
              )}
              {canEditLead(currentSelected) && (
                <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded hover:bg-red-50">Delete</button>
              )}
              {!canEditLead(currentSelected) && (
                <span className="text-xs text-gray-400 px-2 py-1">View only</span>
              )}
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          {/* Profile */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-4">
            <Avatar name={currentSelected.name} size="lg" />
            <div>
              <p className="text-lg font-semibold text-gray-900">{currentSelected.name}</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[currentSelected.status]}`}>{currentSelected.status}</span>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setDetailTab("details")}
              className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${detailTab === "details" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Details
            </button>
            <button
              onClick={() => setDetailTab("comms")}
              className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${detailTab === "comms" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Communications{leadMessages.length > 0 && ` (${leadMessages.length})`}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            {detailTab === "comms" ? (
              /* ── Communications tab ────────────────────────────────────────── */
              <>
                <button
                  onClick={() => setMessageOpen(true)}
                  className="w-full text-sm font-medium py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  + Log Message
                </button>
                {leadMessages.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-4">No messages logged yet. Log an email, WhatsApp, or other communication above.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {[...leadMessages].reverse().map((m) => (
                      <li key={m.id} className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span>{channelIcons[m.channel] ?? "📨"}</span>
                            <span className="font-semibold text-gray-700">{m.channel}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.direction === "inbound" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                              {m.direction}
                            </span>
                          </div>
                          <span className="text-gray-400">{m.date}</span>
                        </div>
                        {m.subject && <p className="font-medium text-gray-800 mb-0.5">Subject: {m.subject}</p>}
                        <p className="text-gray-600 leading-relaxed">{m.body}</p>
                        <p className="text-gray-400 mt-1">{m.sender} → {m.recipient}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
            /* ── Details tab (existing content) ─────────────────────────────── */
            <>
            {[
              { label: "Email",        value: currentSelected.email,       icon: "✉" },
              { label: "Phone",        value: currentSelected.phone,       icon: "📞" },
              { label: "Source",       value: currentSelected.source,      icon: "🔗" },
              { label: "Last Contact", value: currentSelected.lastContact, icon: "🕐" },
            ].map(({ label, value, icon }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-700"><span>{icon}</span><span>{value}</span></div>
              </div>
            ))}

            {/* Next Best Action */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">⚡</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Next Best Action</p>
                  <button
                    onClick={handleAISummarize}
                    disabled={aiLoading === "summarize"}
                    className="text-[10px] text-amber-600 hover:text-amber-800 hover:underline disabled:opacity-50"
                  >
                    {aiLoading === "summarize" ? "Analyzing..." : "Refresh with AI"}
                  </button>
                </div>
                <p className="text-sm font-medium text-amber-900">{currentSelected.nextAction || "No suggestion yet"}</p>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">AI Summary</p>
                <button
                  onClick={handleAISummarize}
                  disabled={aiLoading === "summarize"}
                  className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline disabled:opacity-50"
                >
                  {aiLoading === "summarize" ? "Analyzing..." : "Refresh"}
                </button>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">{currentSelected.summary || "Log an activity to generate a summary."}</p>
            </div>

            {/* Conversation Summary — paste & analyze */}
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1.5">Conversation Summary</p>
              {currentSelected.convSummary && (
                <p className="text-xs text-violet-800 leading-relaxed mb-2">{currentSelected.convSummary}</p>
              )}
              <textarea
                className="w-full border border-violet-200 rounded-lg px-2.5 py-2 text-xs text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                rows={3}
                placeholder="Paste a conversation (email, chat, call notes) to summarize..."
                value={convText}
                onChange={(e) => setConvText(e.target.value)}
              />
              <button
                onClick={handleAIConversation}
                disabled={!convText.trim() || aiLoading === "conversation"}
                className="mt-1.5 w-full text-xs font-medium py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {aiLoading === "conversation" ? "Summarizing..." : "Summarize Conversation"}
              </button>
            </div>

            {/* Follow-up Draft */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Follow-up Draft</p>
                <button
                  onClick={handleAIFollowUp}
                  disabled={aiLoading === "followup"}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 hover:underline disabled:opacity-50"
                >
                  {aiLoading === "followup" ? "Drafting..." : "Generate"}
                </button>
              </div>
              {currentSelected.followUpDraft ? (
                <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap">{currentSelected.followUpDraft}</p>
              ) : (
                <p className="text-xs text-emerald-600 italic">Click &quot;Generate&quot; to draft a follow-up message.</p>
              )}
            </div>

            {/* Activity log */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Activity Log</p>
              {leadActivities.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No activities logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {leadActivities.map((a) => (
                    <li key={a.id} className="flex gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <span>{activityIcons[a.type]}</span>
                      <div>
                        <span className="font-medium text-gray-700">{a.type}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-400">{a.date}</span>
                        <p className="text-gray-600 mt-0.5">{a.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-gray-200 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setActivityOpen(true)}
                className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Log Activity
              </button>
              <button
                onClick={() => setMessageOpen(true)}
                className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Log Message
              </button>
            </div>
            <button
              onClick={() => {
                setDealForm({ name: `${currentSelected.name} Deal`, value: "", stage: "New Opportunity", close: "", owner: "" });
                setDealOpen(true);
              }}
              className="w-full border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Convert to Deal
            </button>
          </div>
        </div>
      )}

      {/* ── Add Lead modal ─────────────────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Lead" onClose={() => { setAddOpen(false); setFormErrors({}); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <LabeledInput label="Name *" value={addForm.name} onChange={(v) => { setAddForm({ ...addForm, name: v }); setFormErrors((e) => { const { name: _, ...rest } = e; return rest; }); }} placeholder="Full name" />
                {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
              </div>
              <LabeledInput label="Phone" value={addForm.phone} onChange={(v) => setAddForm({ ...addForm, phone: v })} placeholder="+1 555-0000" />
            </div>
            <div>
              <LabeledInput label="Email *" value={addForm.email} onChange={(v) => { setAddForm({ ...addForm, email: v }); setFormErrors((e) => { const { email: _, ...rest } = e; return rest; }); }} placeholder="email@company.com" />
              {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledSelect label="Status" value={addForm.status} onChange={(v) => setAddForm({ ...addForm, status: v })} options={STATUS_OPTIONS} />
              <LabeledSelect label="Source" value={addForm.source} onChange={(v) => setAddForm({ ...addForm, source: v })} options={SOURCE_OPTIONS} />
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">A task <em>&quot;Contact lead: [name]&quot;</em> will be automatically created.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setAddOpen(false); setFormErrors({}); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleAddLead} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Add Lead</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Lead modal ────────────────────────────────────────────────────── */}
      {editOpen && editForm && (
        <Modal title="Edit Lead" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Name" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
              <LabeledInput label="Phone" value={editForm.phone} onChange={(v) => setEditForm({ ...editForm, phone: v })} />
            </div>
            <LabeledInput label="Email" value={editForm.email} onChange={(v) => setEditForm({ ...editForm, email: v })} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledSelect label="Status" value={editForm.status} onChange={(v) => setEditForm({ ...editForm, status: v })} options={STATUS_OPTIONS} />
              <LabeledSelect label="Source" value={editForm.source} onChange={(v) => setEditForm({ ...editForm, source: v })} options={SOURCE_OPTIONS} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleEditSave} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Log Activity modal ─────────────────────────────────────────────────── */}
      {activityOpen && currentSelected && (
        <Modal title={`Log Activity — ${currentSelected.name}`} onClose={() => setActivityOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <div className="flex gap-2">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setActivityForm({ ...activityForm, type: t })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${activityForm.type === t ? "bg-blue-50 border-blue-500 text-blue-700 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    <span>{activityIcons[t]}</span>{t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes *</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder={`What happened during this ${activityForm.type.toLowerCase()}?`}
                value={activityForm.note}
                onChange={(e) => setActivityForm({ ...activityForm, note: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setActivityOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleLogActivity} disabled={!activityForm.note.trim()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Log Activity</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Convert to Deal modal ──────────────────────────────────────────────── */}
      {dealOpen && currentSelected && (
        <Modal title={`Convert to Deal — ${currentSelected.name}`} onClose={() => setDealOpen(false)}>
          <div className="space-y-4">
            <LabeledInput label="Deal Name *" value={dealForm.name} onChange={(v) => setDealForm({ ...dealForm, name: v })} placeholder="e.g. Acme Corp Expansion" />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Value" value={dealForm.value} onChange={(v) => setDealForm({ ...dealForm, value: v })} placeholder="$0" />
              <LabeledInput label="Owner" value={dealForm.owner} onChange={(v) => setDealForm({ ...dealForm, owner: v })} placeholder="e.g. Sarah" />
            </div>
            <LabeledSelect label="Stage" value={dealForm.stage} onChange={(v) => setDealForm({ ...dealForm, stage: v })} options={STAGE_OPTIONS} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={dealForm.close} onChange={(e) => setDealForm({ ...dealForm, close: e.target.value })} />
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              ✓ Lead status will be updated to <strong>Converted</strong>. The deal will appear on <strong>/deals</strong>.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDealOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleConvertToDeal} disabled={!dealForm.name} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Create Deal</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Log Message modal ──────────────────────────────────────────────────── */}
      {messageOpen && currentSelected && (
        <Modal title={`Log Message — ${currentSelected.name}`} onClose={() => setMessageOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setMsgForm({ ...msgForm, channel: ch })}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${msgForm.channel === ch ? "bg-indigo-50 border-indigo-500 text-indigo-700 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      <span>{channelIcons[ch]}</span>{ch}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Direction</label>
                <div className="flex gap-2">
                  {DIRECTION_OPTIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setMsgForm({ ...msgForm, direction: d })}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${msgForm.direction === d ? "bg-indigo-50 border-indigo-500 text-indigo-700 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {d === "outbound" ? "↗ Outbound" : "↙ Inbound"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {msgForm.channel === "Email" && (
              <LabeledInput label="Subject" value={msgForm.subject} onChange={(v) => setMsgForm({ ...msgForm, subject: v })} placeholder="Email subject line" />
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={4}
                placeholder="Paste or type the message content..."
                value={msgForm.body}
                onChange={(e) => setMsgForm({ ...msgForm, body: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              This message will be saved to the lead&apos;s communication history and used by AI for summaries and follow-up suggestions.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setMessageOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleLogMessage} disabled={!msgForm.body.trim()} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Log Message</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────────────── */}
      {deleteConfirm && currentSelected && (
        <Modal title="Delete Lead" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Are you sure you want to delete <strong>{currentSelected.name}</strong>? This action cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete Lead</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
