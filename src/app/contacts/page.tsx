"use client";

import { useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Lead, type Deal, type Message } from "@/context/AppContext";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";
import ImportModal from "@/components/ImportModal";
import ChatPanel from "@/components/ChatPanel";
import { customerImportConfig } from "@/lib/import-configs";

const FIELDS = [
  { key: "name",           label: "Name" },
  { key: "email",          label: "Email" },
  { key: "phone",          label: "Phone" },
  { key: "status",         label: "Status" },
  { key: "source",         label: "Source" },
  { key: "lastContact",    label: "Last Contact" },
  { key: "carModel",       label: "Car Model" },
  { key: "companyName",    label: "Company" },
  { key: "country",        label: "Country" },
  { key: "preferredBrands",label: "Preferred Brands" },
];

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Converted", "Lost", "Cold"];
const SOURCE_OPTIONS = ["Website", "Referral", "LinkedIn", "Cold Call", "Event"];
const STAGE_OPTIONS  = ["New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const ACTIVITY_TYPES = ["Call", "Email", "Meeting", "Note"] as const;
const MESSAGE_CHANNELS = ["Email", "WhatsApp", "SMS", "LinkedIn", "Other"] as const;
const DIRECTION_OPTIONS = ["outbound", "inbound"] as const;
const CAR_CONDITION_OPTIONS = ["New", "Used", "Certified Pre-Owned"];
const CUSTOMER_TYPE_OPTIONS = ["individual", "workshop", "dealer", "distributor"];
const PAYMENT_TERMS_OPTIONS = ["net30", "net60", "cod", "prepaid"];

const customerTypeStyles: Record<string, string> = {
  individual:  "bg-cyan-100 text-cyan-700",
  workshop:    "bg-orange-100 text-orange-700",
  dealer:      "bg-emerald-100 text-emerald-700",
  distributor: "bg-purple-100 text-purple-700",
};

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

const activityIcons: Record<string, string> = { Call: "📞", Email: "✉", Meeting: "📅", Note: "📝" };
const channelIcons: Record<string, string> = { Email: "✉", WhatsApp: "💬", SMS: "📱", LinkedIn: "🔗", Other: "📨" };

const emptyForm = { name: "", email: "", phone: "", status: "New", source: "Website", lastContact: "Today", carModel: "", carYear: "", carPrice: "", carVin: "", carCondition: "New", customerType: "", companyName: "", country: "", preferredBrands: "", taxId: "", shippingAddress: "", billingAddress: "", paymentTerms: "", customerNotes: "", ownerId: undefined as string | undefined };

type SortKey = "name" | "status" | "source" | "lastContact" | "companyName" | "country";
type SortDir = "asc" | "desc";

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-teal-500", "bg-orange-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const cls = size === "lg" ? "w-12 h-12 text-base" : "w-8 h-8 text-xs";
  return (
    <div className={`${cls} rounded-xl ${color} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: { label: string; sortKey: SortKey; currentSort: SortKey | null; currentDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = currentSort === sortKey;
  return (
    <th className="px-5 py-3 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors" onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-blue-600">{currentDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

export default function LeadsPage() {
  const { leads, deals, activities, messages, addLead, updateLead, deleteLead, bulkDeleteLeads, addDeal, addActivity, addMessage, aiSummarizeLead, aiConversation, aiFollowUp, loaded } = useApp();
  const { isAdmin, user, allUsers, canAccessOwnerId } = useAuth();

  // Resolve ownerId to display name
  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of allUsers) m[u.id] = u.name;
    return m;
  }, [allUsers]);

  function ownerName(ownerId?: string): string | undefined {
    if (!ownerId) return undefined;
    return userMap[ownerId] || ownerId;
  }

  function canEditLead(lead: Lead) {
    return canAccessOwnerId(lead.ownerId);
  }

  const [selected, setSelected]   = useState<Lead | null>(null);
  const [query, setQuery]         = useState("");
  const [activeFields, setActiveFields] = useState(FIELDS.map((f) => f.key));
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // modal states
  const [addOpen, setAddOpen]           = useState(false);
  const [editOpen, setEditOpen]         = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [dealOpen, setDealOpen]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [messageOpen, setMessageOpen]     = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // form states
  const [addForm, setAddForm]       = useState(emptyForm);
  const [editForm, setEditForm]     = useState<Lead | null>(null);
  const [activityForm, setActivityForm] = useState({ type: "Call" as typeof ACTIVITY_TYPES[number], note: "" });
  const [dealForm, setDealForm]     = useState({ name: "", value: "", stage: "New Opportunity", close: "", owner: "", carModel: "", carYear: "", carPrice: "", carVin: "", carCondition: "" });
  const [msgForm, setMsgForm]       = useState({
    channel: "Email" as Message["channel"],
    direction: "outbound" as Message["direction"],
    subject: "",
    body: "",
    recipient: "",
  });

  // Customer filters
  const [filterCustomerType, setFilterCustomerType] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterBrand, setFilterBrand] = useState("");

  const countryOptions = useMemo(() => [...new Set(leads.map((l) => l.country).filter(Boolean))].sort() as string[], [leads]);
  const brandOptions = useMemo(() => {
    const all = leads.flatMap((l) => (l.preferredBrands ?? "").split(",").map((b) => b.trim()).filter(Boolean));
    return [...new Set(all)].sort();
  }, [leads]);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  const [aiLoading, setAiLoading]   = useState<string | null>(null);
  const [convText, setConvText]     = useState("");
  const [detailTab, setDetailTab]   = useState<"details" | "comms" | "chat">("details");

  // Filter + Sort
  const filtered = useMemo(() => {
    let result = query.trim()
      ? leads.filter((l) =>
          activeFields.some((field) =>
            String(l[field as keyof Lead] ?? "").toLowerCase().includes(query.toLowerCase())
          )
        )
      : [...leads];

    if (filterCustomerType) result = result.filter((l) => l.customerType === filterCustomerType);
    if (filterCountry) result = result.filter((l) => l.country === filterCountry);
    if (filterBrand) result = result.filter((l) => (l.preferredBrands ?? "").toLowerCase().includes(filterBrand.toLowerCase()));

    if (sortKey) {
      result.sort((a, b) => {
        const av = String(a[sortKey] ?? "").toLowerCase();
        const bv = String(b[sortKey] ?? "").toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [leads, query, activeFields, sortKey, sortDir, filterCustomerType, filterCountry, filterBrand]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Bulk selection helpers
  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  function handleBulkDelete() {
    bulkDeleteLeads(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  }

  const currentSelected = selected ? leads.find((l) => l.id === selected.id) ?? selected : null;
  const leadActivities = currentSelected ? activities.filter((a) => a.leadId === currentSelected.id) : [];
  const leadMessages = currentSelected ? messages.filter((m) => m.leadId === currentSelected.id && m.channel !== "Internal") : [];
  const leadChatMessages = currentSelected ? messages.filter((m) => m.leadId === currentSelected.id && m.channel === "Internal") : [];

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

  function handleEditOpen(lead: Lead) { setEditForm({ ...lead }); setEditOpen(true); }

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
      carModel: dealForm.carModel || selected.carModel,
      carYear: dealForm.carYear || selected.carYear,
      carPrice: dealForm.carPrice || selected.carPrice,
      carVin: dealForm.carVin || selected.carVin,
      carCondition: dealForm.carCondition || selected.carCondition,
    });
    updateLead(selected.id, { status: "Converted" });
    setSelected((prev) => prev ? { ...prev, status: "Converted" } : prev);
    setDealForm({ name: "", value: "", stage: "New Opportunity", close: "", owner: "", carModel: "", carYear: "", carPrice: "", carVin: "", carCondition: "" });
    setDealOpen(false);
  }

  async function handleAISummarize() { if (!selected) return; setAiLoading("summarize"); await aiSummarizeLead(selected.id); setAiLoading(null); }
  async function handleAIConversation() { if (!selected || !convText.trim()) return; setAiLoading("conversation"); await aiConversation(selected.id, convText); setConvText(""); setAiLoading(null); }
  async function handleAIFollowUp() { if (!selected) return; setAiLoading("followup"); await aiFollowUp(selected.id); setAiLoading(null); }

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

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${selected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#F9FAFB]">Customers</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} of {leads.length} customers</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setImportOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-all">
                ↑ Import
              </button>
            )}
            <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">
              + Add Customer
            </button>
          </div>
        </div>

        {justAdded && (
          <div className="mb-4 flex items-center gap-3 bg-green-900/20 border border-green-800 text-green-300 text-sm rounded-xl px-4 py-3">
            <span>✓</span>
            <span>Customer <strong>{justAdded}</strong> added — task <em>&quot;Contact lead: {justAdded}&quot;</em> auto-created on <a href="/tasks" className="underline font-medium">/tasks</a>.</span>
          </div>
        )}

        {/* Bulk action toolbar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-4 bg-blue-900/20 border border-blue-800 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-blue-300">{selectedIds.size} selected</span>
            {isAdmin && (
              <button onClick={() => setBulkDeleteConfirm(true)} className="text-sm font-medium text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors">
                Delete Selected
              </button>
            )}
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-[#9CA3AF] hover:text-gray-300 ml-auto">
              Clear Selection
            </button>
          </div>
        )}

        <SearchFilter query={query} onQueryChange={setQuery} fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields} placeholder="Search customers..." />

        {/* Customer filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select value={filterCustomerType} onChange={(e) => setFilterCustomerType(e.target.value)} className="border border-[#1F2937] rounded-xl px-3 py-2 text-sm text-[#F9FAFB] bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Types</option>
            {CUSTOMER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="border border-[#1F2937] rounded-xl px-3 py-2 text-sm text-[#F9FAFB] bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Countries</option>
            {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="border border-[#1F2937] rounded-xl px-3 py-2 text-sm text-[#F9FAFB] bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Brands</option>
            {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {(filterCustomerType || filterCountry || filterBrand) && (
            <button onClick={() => { setFilterCustomerType(""); setFilterCountry(""); setFilterBrand(""); }} className="text-sm text-gray-400 hover:text-gray-200 px-2">Clear filters</button>
          )}
        </div>

        <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[740px]">
            <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
              <tr className="text-left text-[#9CA3AF]">
                <th className="px-5 py-3 font-medium w-10">
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded border-[#374151]" />
                </th>
                <SortHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3 font-medium">Type</th>
                <SortHeader label="Company" sortKey="companyName" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Country" sortKey="country" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Source" sortKey="source" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Last Contact" sortKey="lastContact" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2937]">
              {filtered.length === 0 ? (
                <tr><td colSpan={9}><EmptyState icon="👤" title="No customers found" description="Try adjusting your search or filters, or add a new customer." /></td></tr>
              ) : filtered.map((lead) => (
                <tr key={lead.id} onClick={() => openDetailPanel(lead)} className={`cursor-pointer transition-colors ${selected?.id === lead.id ? "bg-blue-900/30" : "hover:bg-gray-800/50"}`}>
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded border-[#374151]" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={lead.name} />
                      <div>
                        <span className="font-medium text-[#F9FAFB]">{lead.name}</span>
                        <p className="text-xs text-gray-500">{lead.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {lead.customerType ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${customerTypeStyles[lead.customerType] ?? "bg-gray-100 text-gray-600"}`}>{lead.customerType.charAt(0).toUpperCase() + lead.customerType.slice(1)}</span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{lead.companyName || "—"}</td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{lead.country || "—"}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[lead.status]}`}>{lead.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${sourceStyles[lead.source] ?? "bg-gray-100 text-gray-600"}`}>{lead.source}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{lead.lastContact}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>)}
      </main>

      {/* Detail panel */}
      {currentSelected && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#111827] border-l border-[#1F2937] shadow-2xl shadow-black/40 z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
            <h3 className="font-semibold text-[#F9FAFB]">Customer Details</h3>
            <div className="flex items-center gap-2">
              {canEditLead(currentSelected) && (
                <button onClick={() => handleEditOpen(currentSelected)} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50">Edit</button>
              )}
              {isAdmin && (
                <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
              )}
              {!canEditLead(currentSelected) && (
                <span className="text-xs text-gray-500 px-2 py-1">View only</span>
              )}
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          <div className="px-6 py-5 border-b border-[#1F2937] flex items-center gap-4">
            <Avatar name={currentSelected.name} size="lg" />
            <div>
              <p className="text-lg font-semibold text-[#F9FAFB]">{currentSelected.name}</p>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[currentSelected.status]}`}>{currentSelected.status}</span>
            </div>
          </div>

          <div className="flex border-b border-[#1F2937]">
            <button onClick={() => setDetailTab("details")} className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${detailTab === "details" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-300"}`}>Details</button>
            <button onClick={() => setDetailTab("chat")} className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${detailTab === "chat" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-300"}`}>Chat{leadChatMessages.length > 0 && ` (${leadChatMessages.length})`}</button>
            <button onClick={() => setDetailTab("comms")} className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${detailTab === "comms" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-300"}`}>Comms{leadMessages.length > 0 && ` (${leadMessages.length})`}</button>
          </div>

          {detailTab === "chat" ? (
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                messages={leadChatMessages}
                currentUserId={user?.id ?? ""}
                currentUserName={user?.name ?? ""}
                onSend={(body) => {
                  if (!currentSelected) return;
                  addMessage({
                    leadId: currentSelected.id,
                    channel: "Internal" as Message["channel"],
                    direction: "outbound",
                    body,
                    sender: user?.name ?? "Unknown",
                    recipient: currentSelected.name,
                    date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
                  });
                }}
                placeholder={`Message about ${currentSelected.name}...`}
              />
            </div>
          ) : (
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            {detailTab === "comms" ? (
              <>
                <button onClick={() => setMessageOpen(true)} className="w-full text-sm font-medium py-2.5 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">+ Log Message</button>
                {leadMessages.length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-4">No messages logged yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {[...leadMessages].reverse().map((m) => (
                      <li key={m.id} className="bg-[#0B0F14] rounded-xl px-3 py-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span>{channelIcons[m.channel] ?? "📨"}</span>
                            <span className="font-semibold text-gray-300">{m.channel}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.direction === "inbound" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{m.direction}</span>
                          </div>
                          <span className="text-gray-500">{m.date}</span>
                        </div>
                        {m.subject && <p className="font-medium text-gray-100 mb-0.5">Subject: {m.subject}</p>}
                        <p className="text-gray-400 leading-relaxed">{m.body}</p>
                        <p className="text-gray-500 mt-1">{m.sender} → {m.recipient}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
            <>
            {/* Contact info */}
            {[
              { label: "Email",        value: currentSelected.email,       icon: "✉" },
              { label: "Phone",        value: currentSelected.phone,       icon: "📞" },
              { label: "Source",       value: currentSelected.source,      icon: "🔗" },
              { label: "Last Contact", value: currentSelected.lastContact, icon: "🕐" },
            ].map(({ label, value, icon }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-300"><span>{icon}</span><span>{value}</span></div>
              </div>
            ))}

            {/* Assigned Sales Rep */}
            {(() => {
              const repName = ownerName(currentSelected.ownerId);
              const customerDeals = deals.filter((d) => d.leadId === currentSelected.id || d.contact === currentSelected.name);
              const orderOwnerIds = [...new Set(customerDeals.map((d) => d.ownerId).filter(Boolean))] as string[];
              const syncCandidate = !currentSelected.ownerId && orderOwnerIds.length === 1 ? orderOwnerIds[0] : undefined;

              return (
                <div className="bg-sky-900/20 border border-sky-800 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide mb-1">Assigned Sales Rep</p>
                  {repName ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-sky-400">🧑‍💼</span>
                      <span className="text-sky-200 font-medium">{repName}</span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-sky-400 italic">No sales rep assigned</p>
                      {syncCandidate && (
                        <button
                          onClick={() => {
                            updateLead(currentSelected.id, { ownerId: syncCandidate });
                          }}
                          className="mt-1.5 text-[11px] font-medium text-sky-300 hover:text-sky-100 bg-sky-800/40 hover:bg-sky-800/60 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Assign {ownerName(syncCandidate)} (from order)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Customer Business Info */}
            {(currentSelected.customerType || currentSelected.companyName || currentSelected.country || currentSelected.preferredBrands || currentSelected.paymentTerms || currentSelected.taxId) && (
              <div className="bg-cyan-900/20 border border-cyan-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wide mb-1.5">Customer Business</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {currentSelected.customerType && <div><span className="text-cyan-400">Type:</span> <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${customerTypeStyles[currentSelected.customerType] ?? "bg-gray-100 text-gray-600"}`}>{currentSelected.customerType.charAt(0).toUpperCase() + currentSelected.customerType.slice(1)}</span></div>}
                  {currentSelected.companyName && <div><span className="text-cyan-400">Company:</span> <span className="text-cyan-200 font-medium">{currentSelected.companyName}</span></div>}
                  {currentSelected.country && <div><span className="text-cyan-400">Country:</span> <span className="text-cyan-200 font-medium">{currentSelected.country}</span></div>}
                  {currentSelected.paymentTerms && <div><span className="text-cyan-400">Payment:</span> <span className="text-cyan-200 font-medium">{currentSelected.paymentTerms}</span></div>}
                  {currentSelected.taxId && <div><span className="text-cyan-400">Tax ID:</span> <span className="text-cyan-200 font-medium">{currentSelected.taxId}</span></div>}
                  {currentSelected.preferredBrands && <div className="col-span-2"><span className="text-cyan-400">Brands:</span> <span className="text-cyan-200 font-medium">{currentSelected.preferredBrands}</span></div>}
                  {currentSelected.shippingAddress && <div className="col-span-2"><span className="text-cyan-400">Shipping:</span> <span className="text-cyan-200 font-medium">{currentSelected.shippingAddress}</span></div>}
                  {currentSelected.billingAddress && <div className="col-span-2"><span className="text-cyan-400">Billing:</span> <span className="text-cyan-200 font-medium">{currentSelected.billingAddress}</span></div>}
                  {currentSelected.customerNotes && <div className="col-span-2"><span className="text-cyan-400">Notes:</span> <span className="text-cyan-200">{currentSelected.customerNotes}</span></div>}
                </div>
              </div>
            )}

            {/* Related Orders */}
            {(() => {
              const customerDeals = deals.filter((d: Deal) => d.leadId === currentSelected.id || d.contact === currentSelected.name);
              if (customerDeals.length === 0) return null;

              const orderStatusStyles: Record<string, string> = {
                "New": "bg-blue-100 text-blue-700",
                "Checking Availability": "bg-yellow-100 text-yellow-700",
                "Quoted": "bg-purple-100 text-purple-700",
                "Confirmed": "bg-emerald-100 text-emerald-700",
                "Paid": "bg-green-100 text-green-700",
                "Shipped": "bg-cyan-100 text-cyan-700",
                "Delivered": "bg-teal-100 text-teal-700",
                "Cancelled": "bg-red-100 text-red-600",
              };

              return (
                <div className="bg-orange-900/20 border border-orange-800 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-orange-300 uppercase tracking-wide mb-2">Related Orders ({customerDeals.length})</p>
                  <div className="space-y-2">
                    {customerDeals.map((d: Deal) => (
                      <div key={d.id} className="bg-[#0B0F14] rounded-lg px-2.5 py-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-blue-400 text-[11px]">{d.orderNumber || "—"}</span>
                          {d.orderStatus && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${orderStatusStyles[d.orderStatus] ?? "bg-gray-100 text-gray-600"}`}>{d.orderStatus}</span>
                          )}
                        </div>
                        <p className="font-medium text-orange-200 truncate">{d.name}</p>
                        <div className="flex items-center justify-between mt-1 text-[11px]">
                          <span className="text-orange-400">
                            {d.grandTotal || d.value || "—"}
                          </span>
                          <span className="text-gray-500">
                            {d.ownerId ? ownerName(d.ownerId) : d.owner || "Unassigned"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Car Details */}
            {(currentSelected.carModel || currentSelected.carVin) && (
              <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-1.5">Vehicle Interest</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {currentSelected.carModel && <div><span className="text-indigo-400">Model:</span> <span className="text-indigo-200 font-medium">{currentSelected.carModel}</span></div>}
                  {currentSelected.carYear && <div><span className="text-indigo-400">Year:</span> <span className="text-indigo-200 font-medium">{currentSelected.carYear}</span></div>}
                  {currentSelected.carPrice && <div><span className="text-indigo-400">Price:</span> <span className="text-indigo-200 font-medium">{currentSelected.carPrice}</span></div>}
                  {currentSelected.carCondition && <div><span className="text-indigo-400">Condition:</span> <span className="text-indigo-200 font-medium">{currentSelected.carCondition}</span></div>}
                  {currentSelected.carVin && <div className="col-span-2"><span className="text-indigo-400">VIN:</span> <span className="text-indigo-200 font-medium font-mono text-[11px]">{currentSelected.carVin}</span></div>}
                </div>
              </div>
            )}

            {/* Next Best Action */}
            <div className="bg-amber-900/20 border border-amber-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">⚡</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Next Best Action</p>
                  <button onClick={handleAISummarize} disabled={aiLoading === "summarize"} className="text-[10px] text-amber-400 hover:text-amber-200 hover:underline disabled:opacity-50">
                    {aiLoading === "summarize" ? "Analyzing..." : "Refresh with AI"}
                  </button>
                </div>
                <p className="text-sm font-medium text-amber-200">{currentSelected.nextAction || "No suggestion yet"}</p>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">AI Summary</p>
                <button onClick={handleAISummarize} disabled={aiLoading === "summarize"} className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline disabled:opacity-50">
                  {aiLoading === "summarize" ? "Analyzing..." : "Refresh"}
                </button>
              </div>
              <p className="text-xs text-blue-300 leading-relaxed">{currentSelected.summary || "Log an activity to generate a summary."}</p>
            </div>

            {/* Conversation Summary */}
            <div className="bg-violet-900/20 border border-violet-800 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-violet-300 uppercase tracking-wide mb-1.5">Conversation Summary</p>
              {currentSelected.convSummary && <p className="text-xs text-violet-200 leading-relaxed mb-2">{currentSelected.convSummary}</p>}
              <textarea className="w-full border border-violet-800 rounded-xl px-2.5 py-2 text-xs text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 bg-[#0F172A]" rows={3} placeholder="Paste a conversation to summarize..." value={convText} onChange={(e) => setConvText(e.target.value)} />
              <button onClick={handleAIConversation} disabled={!convText.trim() || aiLoading === "conversation"} className="mt-1.5 w-full text-xs font-medium py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {aiLoading === "conversation" ? "Summarizing..." : "Summarize Conversation"}
              </button>
            </div>

            {/* Follow-up Draft */}
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">Follow-up Draft</p>
                <button onClick={handleAIFollowUp} disabled={aiLoading === "followup"} className="text-[10px] text-emerald-400 hover:text-emerald-200 hover:underline disabled:opacity-50">
                  {aiLoading === "followup" ? "Drafting..." : "Generate"}
                </button>
              </div>
              {currentSelected.followUpDraft ? (
                <p className="text-xs text-emerald-200 leading-relaxed whitespace-pre-wrap">{currentSelected.followUpDraft}</p>
              ) : (
                <p className="text-xs text-emerald-400 italic">Click &quot;Generate&quot; to draft a follow-up message.</p>
              )}
            </div>

            {/* Activity log */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Activity Log</p>
              {leadActivities.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No activities logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {leadActivities.map((a) => (
                    <li key={a.id} className="flex gap-2 text-xs bg-[#0B0F14] rounded-xl px-3 py-2">
                      <span>{activityIcons[a.type]}</span>
                      <div>
                        <span className="font-medium text-gray-300">{a.type}</span>
                        <span className="text-gray-500 mx-1">·</span>
                        <span className="text-gray-500">{a.date}</span>
                        <p className="text-gray-400 mt-0.5">{a.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </>
            )}
          </div>
          )}

          <div className="px-6 py-4 border-t border-[#1F2937] flex flex-col gap-2">
            <div className="flex gap-2">
              <button onClick={() => setActivityOpen(true)} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">Log Activity</button>
              <button onClick={() => setMessageOpen(true)} className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-sm">Log Message</button>
            </div>
            <button onClick={() => { setDealForm({ name: `${currentSelected.name} Deal`, value: currentSelected.carPrice || "", stage: "New Opportunity", close: "", owner: "", carModel: currentSelected.carModel || "", carYear: currentSelected.carYear || "", carPrice: currentSelected.carPrice || "", carVin: currentSelected.carVin || "", carCondition: currentSelected.carCondition || "" }); setDealOpen(true); }} className="w-full border border-[#1F2937] text-gray-300 text-sm font-medium py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
              Convert to Deal
            </button>
          </div>
        </div>
      )}

      {/* Add Lead modal */}
      {addOpen && (
        <Modal title="Add Customer" onClose={() => { setAddOpen(false); setFormErrors({}); }}>
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
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Assigned Sales Rep</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.ownerId ?? ""} onChange={(e) => setAddForm({ ...addForm, ownerId: e.target.value || undefined })}>
                  <option value="">— Auto-assign to me —</option>
                  {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>)}
                </select>
              </div>
            )}
            {/* Car fields */}
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Vehicle Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Car Model" value={addForm.carModel} onChange={(v) => setAddForm({ ...addForm, carModel: v })} placeholder="e.g. BMW X5" />
              <LabeledInput label="Year" value={addForm.carYear} onChange={(v) => setAddForm({ ...addForm, carYear: v })} placeholder="e.g. 2024" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Price" value={addForm.carPrice} onChange={(v) => setAddForm({ ...addForm, carPrice: v })} placeholder="e.g. $45,000" />
              <LabeledSelect label="Condition" value={addForm.carCondition} onChange={(v) => setAddForm({ ...addForm, carCondition: v })} options={CAR_CONDITION_OPTIONS} />
            </div>
            <LabeledInput label="VIN" value={addForm.carVin} onChange={(v) => setAddForm({ ...addForm, carVin: v })} placeholder="Vehicle Identification Number" />
            {/* Customer Information */}
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Customer Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Customer Type</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.customerType} onChange={(e) => setAddForm({ ...addForm, customerType: e.target.value })}>
                  <option value="">— Select —</option>
                  {CUSTOMER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <LabeledInput label="Company Name" value={addForm.companyName} onChange={(v) => setAddForm({ ...addForm, companyName: v })} placeholder="e.g. ACME Parts Ltd." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Country" value={addForm.country} onChange={(v) => setAddForm({ ...addForm, country: v })} placeholder="e.g. Germany" />
              <LabeledInput label="Preferred Brands" value={addForm.preferredBrands} onChange={(v) => setAddForm({ ...addForm, preferredBrands: v })} placeholder="e.g. Toyota, Bosch" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Tax ID" value={addForm.taxId} onChange={(v) => setAddForm({ ...addForm, taxId: v })} placeholder="Tax / VAT number" />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Payment Terms</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.paymentTerms} onChange={(e) => setAddForm({ ...addForm, paymentTerms: e.target.value })}>
                  <option value="">— Select —</option>
                  {PAYMENT_TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <LabeledInput label="Shipping Address" value={addForm.shippingAddress} onChange={(v) => setAddForm({ ...addForm, shippingAddress: v })} placeholder="Shipping address" />
            <LabeledInput label="Billing Address" value={addForm.billingAddress} onChange={(v) => setAddForm({ ...addForm, billingAddress: v })} placeholder="Billing address" />
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Customer Notes</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={2} placeholder="Internal notes about this customer..." value={addForm.customerNotes} onChange={(e) => setAddForm({ ...addForm, customerNotes: e.target.value })} />
            </div>
            <p className="text-xs text-gray-500 bg-[#0B0F14] rounded-xl px-3 py-2">A task <em>&quot;Contact lead: [name]&quot;</em> will be automatically created.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setAddOpen(false); setFormErrors({}); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAddLead} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Add Customer</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Lead modal */}
      {editOpen && editForm && (
        <Modal title="Edit Customer" onClose={() => setEditOpen(false)}>
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
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Assigned Sales Rep</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.ownerId ?? ""} onChange={(e) => setEditForm({ ...editForm, ownerId: e.target.value || undefined })}>
                  <option value="">— Unassigned —</option>
                  {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>)}
                </select>
              </div>
            )}
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Vehicle Information</p>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Car Model" value={editForm.carModel ?? ""} onChange={(v) => setEditForm({ ...editForm, carModel: v })} placeholder="e.g. BMW X5" />
              <LabeledInput label="Year" value={editForm.carYear ?? ""} onChange={(v) => setEditForm({ ...editForm, carYear: v })} placeholder="e.g. 2024" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Price" value={editForm.carPrice ?? ""} onChange={(v) => setEditForm({ ...editForm, carPrice: v })} placeholder="e.g. $45,000" />
              <LabeledSelect label="Condition" value={editForm.carCondition ?? "New"} onChange={(v) => setEditForm({ ...editForm, carCondition: v })} options={CAR_CONDITION_OPTIONS} />
            </div>
            <LabeledInput label="VIN" value={editForm.carVin ?? ""} onChange={(v) => setEditForm({ ...editForm, carVin: v })} placeholder="Vehicle Identification Number" />
            {/* Customer Information */}
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Customer Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Customer Type</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.customerType ?? ""} onChange={(e) => setEditForm({ ...editForm, customerType: e.target.value })}>
                  <option value="">— Select —</option>
                  {CUSTOMER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <LabeledInput label="Company Name" value={editForm.companyName ?? ""} onChange={(v) => setEditForm({ ...editForm, companyName: v })} placeholder="e.g. ACME Parts Ltd." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Country" value={editForm.country ?? ""} onChange={(v) => setEditForm({ ...editForm, country: v })} placeholder="e.g. Germany" />
              <LabeledInput label="Preferred Brands" value={editForm.preferredBrands ?? ""} onChange={(v) => setEditForm({ ...editForm, preferredBrands: v })} placeholder="e.g. Toyota, Bosch" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Tax ID" value={editForm.taxId ?? ""} onChange={(v) => setEditForm({ ...editForm, taxId: v })} placeholder="Tax / VAT number" />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Payment Terms</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.paymentTerms ?? ""} onChange={(e) => setEditForm({ ...editForm, paymentTerms: e.target.value })}>
                  <option value="">— Select —</option>
                  {PAYMENT_TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <LabeledInput label="Shipping Address" value={editForm.shippingAddress ?? ""} onChange={(v) => setEditForm({ ...editForm, shippingAddress: v })} placeholder="Shipping address" />
            <LabeledInput label="Billing Address" value={editForm.billingAddress ?? ""} onChange={(v) => setEditForm({ ...editForm, billingAddress: v })} placeholder="Billing address" />
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Customer Notes</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={2} placeholder="Internal notes about this customer..." value={editForm.customerNotes ?? ""} onChange={(e) => setEditForm({ ...editForm, customerNotes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Log Activity modal */}
      {activityOpen && currentSelected && (
        <Modal title={`Log Activity — ${currentSelected.name}`} onClose={() => setActivityOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
              <div className="flex gap-2">
                {ACTIVITY_TYPES.map((t) => (
                  <button key={t} onClick={() => setActivityForm({ ...activityForm, type: t })} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-colors ${activityForm.type === t ? "bg-blue-900/20 border-blue-500 text-blue-400 font-medium" : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"}`}>
                    <span>{activityIcons[t]}</span>{t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notes *</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={4} placeholder={`What happened during this ${activityForm.type.toLowerCase()}?`} value={activityForm.note} onChange={(e) => setActivityForm({ ...activityForm, note: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setActivityOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleLogActivity} disabled={!activityForm.note.trim()} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">Log Activity</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Convert to Deal modal */}
      {dealOpen && currentSelected && (
        <Modal title={`Convert to Deal — ${currentSelected.name}`} onClose={() => setDealOpen(false)}>
          <div className="space-y-4">
            <LabeledInput label="Deal Name *" value={dealForm.name} onChange={(v) => setDealForm({ ...dealForm, name: v })} placeholder="e.g. BMW X5 Sale" />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Value" value={dealForm.value} onChange={(v) => setDealForm({ ...dealForm, value: v })} placeholder="$0" />
              <LabeledInput label="Owner" value={dealForm.owner} onChange={(v) => setDealForm({ ...dealForm, owner: v })} placeholder="e.g. Sarah" />
            </div>
            <LabeledSelect label="Stage" value={dealForm.stage} onChange={(v) => setDealForm({ ...dealForm, stage: v })} options={STAGE_OPTIONS} />
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Expected Close</label>
              <input type="date" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={dealForm.close} onChange={(e) => setDealForm({ ...dealForm, close: e.target.value })} />
            </div>
            <p className="text-xs text-gray-500 bg-[#0B0F14] rounded-xl px-3 py-2">✓ Lead status will be updated to <strong>Converted</strong>.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDealOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleConvertToDeal} disabled={!dealForm.name} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">Create Deal</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Log Message modal */}
      {messageOpen && currentSelected && (
        <Modal title={`Log Message — ${currentSelected.name}`} onClose={() => setMessageOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Channel</label>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_CHANNELS.map((ch) => (
                    <button key={ch} onClick={() => setMsgForm({ ...msgForm, channel: ch })} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs border transition-colors ${msgForm.channel === ch ? "bg-indigo-900/20 border-indigo-500 text-indigo-400 font-medium" : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"}`}>
                      <span>{channelIcons[ch]}</span>{ch}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Direction</label>
                <div className="flex gap-2">
                  {DIRECTION_OPTIONS.map((d) => (
                    <button key={d} onClick={() => setMsgForm({ ...msgForm, direction: d })} className={`flex-1 px-3 py-1.5 rounded-xl text-xs border transition-colors ${msgForm.direction === d ? "bg-indigo-900/20 border-indigo-500 text-indigo-400 font-medium" : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"}`}>
                      {d === "outbound" ? "↗ Outbound" : "↙ Inbound"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {msgForm.channel === "Email" && <LabeledInput label="Subject" value={msgForm.subject} onChange={(v) => setMsgForm({ ...msgForm, subject: v })} placeholder="Email subject line" />}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Message *</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={4} placeholder="Paste or type the message content..." value={msgForm.body} onChange={(e) => setMsgForm({ ...msgForm, body: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setMessageOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleLogMessage} disabled={!msgForm.body.trim()} className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">Log Message</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && currentSelected && (() => {
        const linkedDeals = deals.filter((d) => d.leadId === currentSelected.id || d.contact === currentSelected.name);
        const linkedActivities = activities.filter((a) => a.leadId === currentSelected.id);
        const linkedMessages = messages.filter((m) => m.leadId === currentSelected.id);
        const hasLinked = linkedDeals.length > 0 || linkedActivities.length > 0 || linkedMessages.length > 0;
        return (
          <Modal title="Delete Customer" onClose={() => setDeleteConfirm(false)}>
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{currentSelected.name}</strong>? This action cannot be undone.</p>
              {hasLinked && (
                <div className="bg-amber-900/20 border border-amber-800 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1.5">Linked Records (will be affected)</p>
                  <ul className="text-xs text-amber-200 space-y-0.5">
                    {linkedDeals.length > 0 && <li>{linkedDeals.length} order{linkedDeals.length > 1 ? "s" : ""} will be unlinked (not deleted)</li>}
                    {linkedActivities.length > 0 && <li>{linkedActivities.length} activit{linkedActivities.length > 1 ? "ies" : "y"} will be deleted</li>}
                    {linkedMessages.length > 0 && <li>{linkedMessages.length} message{linkedMessages.length > 1 ? "s" : ""} will be deleted</li>}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
                <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete Customer</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Bulk delete confirmation */}
      {bulkDeleteConfirm && (
        <Modal title="Delete Selected Customers" onClose={() => setBulkDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{selectedIds.size} customers</strong>? This action cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleBulkDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete {selectedIds.size} Customers</button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <ImportModal
          config={customerImportConfig({ existing: leads, onAdd: addLead, onUpdate: updateLead })}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
