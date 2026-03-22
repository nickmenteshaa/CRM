"use client";

import { useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Company, type Lead } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import ImportModal from "@/components/ImportModal";
import { companyImportConfig } from "@/lib/import-configs";

const FIELDS = [
  { key: "name",     label: "Company" },
  { key: "industry", label: "Industry" },
  { key: "revenue",  label: "Revenue" },
  { key: "status",   label: "Status" },
  { key: "phone",    label: "Phone" },
  { key: "website",  label: "Website" },
];

const STATUS_OPTIONS = ["Lead", "Active", "At Risk", "Churned"];

const statusStyles: Record<string, string> = {
  Active:   "bg-green-100 text-green-700",
  Lead:     "bg-blue-100 text-blue-700",
  "At Risk":"bg-yellow-100 text-yellow-700",
  Churned:  "bg-gray-100 text-gray-500",
};

const industryIcons: Record<string, string> = {
  "Auto Dealership": "🚗", "Auto Finance": "💳", "Fleet Management": "🚛",
  Logistics: "📦", "Auto Marketplace": "🏪", "Auto Tech": "⚙",
  "Parts & Service": "🔧",
  Technology: "💻", Finance: "💰", Software: "⚙", Healthcare: "🏥",
  "Food & Beverage": "🍃", Retail: "🛍", Default: "🏢",
};

const emptyForm = { name: "", industry: "", contacts: 0, revenue: "$0", status: "Lead", website: "", phone: "" };

type SortKey = "name" | "industry" | "revenue" | "status";
type SortDir = "asc" | "desc";

function CompanyAvatar({ name }: { name: string }) {
  const colors = ["bg-blue-600", "bg-violet-600", "bg-teal-600", "bg-orange-500", "bg-pink-600"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-100">{value || "—"}</p>
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

export default function CompaniesPage() {
  const { isAdmin } = useAuth();
  const { companies, addCompany, updateCompany, deleteCompany, bulkDeleteCompanies, reloadCompanies, leads, deals, loaded } = useApp();
  const [selected, setSelected]     = useState<Company | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editForm, setEditForm]     = useState<Company | null>(null);
  const [form, setForm]             = useState(emptyForm);
  const [query, setQuery]           = useState("");
  const [activeFields, setActiveFields] = useState(FIELDS.map((f) => f.key));

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = query.trim()
      ? companies.filter((c) =>
          activeFields.some((field) =>
            String(c[field as keyof Company] ?? "").toLowerCase().includes(query.toLowerCase())
          )
        )
      : [...companies];

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
  }, [companies, query, activeFields, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((c) => c.id)));
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  function handleBulkDelete() {
    bulkDeleteCompanies(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  }

  function handleAdd() {
    if (!form.name) return;
    addCompany(form);
    setForm(emptyForm);
    setAddOpen(false);
  }

  function handleEditSave() {
    if (!editForm) return;
    updateCompany(editForm.id, editForm);
    setSelected(editForm);
    setEditOpen(false);
  }

  function handleDelete() {
    if (!selected) return;
    deleteCompany(selected.id);
    setSelected(null);
    setDeleteConfirm(false);
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${selected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#F9FAFB]">Companies</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} of {companies.length} companies</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setImportOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-all">
                ↑ Import
              </button>
            )}
            <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">
              + Add Company
            </button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-4 bg-blue-900/20 border border-blue-800 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-blue-300">{selectedIds.size} selected</span>
            {isAdmin && (
              <button onClick={() => setBulkDeleteConfirm(true)} className="text-sm font-medium text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors">Delete Selected</button>
            )}
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-[#9CA3AF] hover:text-gray-300 ml-auto">Clear Selection</button>
          </div>
        )}

        <SearchFilter query={query} onQueryChange={setQuery} fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields} placeholder="Search companies..." />

        <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
              <tr className="text-left text-[#9CA3AF]">
                <th className="px-5 py-3 font-medium w-10">
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded border-[#374151]" />
                </th>
                <SortHeader label="Company" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Industry" sortKey="industry" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3 font-medium">Contacts</th>
                <SortHeader label="Total Revenue" sortKey="revenue" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2937]">
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon="🏢" title="No companies found" description="Try adjusting your search or filters, or add a new company." /></td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c.id === selected?.id ? null : c)} className={`cursor-pointer transition-colors ${selected?.id === c.id ? "bg-blue-900/30" : "hover:bg-gray-800/50"}`}>
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-[#374151]" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <CompanyAvatar name={c.name} />
                      <span className="font-medium text-[#F9FAFB]">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">
                    <span className="flex items-center gap-1.5">
                      <span>{industryIcons[c.industry] ?? industryIcons.Default}</span>
                      {c.industry}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{c.contacts}</td>
                  <td className="px-5 py-3.5 font-semibold text-gray-100">{c.revenue}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[c.status]}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>)}
      </main>

      {/* Detail panel */}
      {selected && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#111827] border-l border-[#1F2937] shadow-2xl shadow-black/40 z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
            <h3 className="font-semibold text-[#F9FAFB]">Company Details</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50">Edit</button>
              {isAdmin && (
                <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
              )}
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          <div className="px-6 py-5 border-b border-[#1F2937] flex items-center gap-4">
            <CompanyAvatar name={selected.name} />
            <div>
              <p className="text-lg font-semibold text-[#F9FAFB]">{selected.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[selected.status]}`}>{selected.status}</span>
                <span className="text-xs text-gray-500">{selected.industry}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Revenue"  value={selected.revenue} />
              <Field label="Contacts" value={selected.contacts} />
            </div>
            <Field label="Phone"   value={selected.phone ?? "—"} />
            <Field label="Website" value={selected.website ?? "—"} />
            <Field label="Industry" value={`${industryIcons[selected.industry] ?? "🏢"} ${selected.industry}`} />

            {/* Quick Stats with deals data */}
            {(() => {
              const companyLeads = leads.filter((l) => l.companyId === selected.id);
              const companyLeadIds = new Set(companyLeads.map((l) => l.id));
              const companyDeals = deals.filter((d) => d.leadId && companyLeadIds.has(d.leadId));
              const totalDealsValue = companyDeals.reduce((s, d) => s + (parseInt(d.value?.replace(/\D/g, "") || "0") || 0), 0);
              const wonDeals = companyDeals.filter((d) => d.won);
              const wonValue = wonDeals.reduce((s, d) => s + (parseInt(d.value?.replace(/\D/g, "") || "0") || 0), 0);
              // Find most common rep
              const repCounts = new Map<string, { name: string; count: number }>();
              for (const l of companyLeads) {
                if (l.ownerId) {
                  const existing = repCounts.get(l.ownerId);
                  if (existing) existing.count++;
                  else repCounts.set(l.ownerId, { name: l.ownerId, count: 1 });
                }
              }
              const topRep = [...repCounts.values()].sort((a, b) => b.count - a.count)[0];

              return (
                <>
                  <div className="bg-[#0B0F14] rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Quick Stats</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#9CA3AF]">Pipeline value</span>
                      <span className="font-medium text-gray-100">${totalDealsValue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#9CA3AF]">Won revenue</span>
                      <span className="font-medium text-green-400">${wonValue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#9CA3AF]">Active deals</span>
                      <span className="font-medium text-gray-100">{companyDeals.length}</span>
                    </div>
                    {topRep && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#9CA3AF]">Assigned rep</span>
                        <span className="font-medium text-blue-400">{topRep.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-[#9CA3AF]">Status</span>
                      <span className={`font-medium ${selected.status === "Active" ? "text-green-600" : selected.status === "At Risk" ? "text-yellow-600" : "text-[#9CA3AF]"}`}>{selected.status}</span>
                    </div>
                  </div>

                  {/* Customers inside this company */}
                  <div className="bg-[#0B0F14] rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Customers ({companyLeads.length})</p>
                    {companyLeads.length === 0 ? (
                      <p className="text-xs text-gray-500">No customers linked yet</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {companyLeads.slice(0, 20).map((l) => (
                          <div key={l.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-200 truncate">{l.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${l.status === "Qualified" ? "bg-blue-100 text-blue-700" : l.status === "Converted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{l.status}</span>
                          </div>
                        ))}
                        {companyLeads.length > 20 && (
                          <p className="text-xs text-gray-500 pt-1">+{companyLeads.length - 20} more</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          <div className="px-6 py-4 border-t border-[#1F2937] flex gap-2">
            <button onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }} className={`${isAdmin ? "flex-1" : "w-full"} bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm`}>Edit Company</button>
            {isAdmin && (
              <button onClick={() => setDeleteConfirm(true)} className="flex-1 border border-red-800 text-red-400 text-sm font-medium py-2.5 rounded-xl hover:bg-red-900/20 transition-colors">Delete</button>
            )}
          </div>
        </div>
      )}

      {/* Add modal */}
      {addOpen && (
        <Modal title="Add Company" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Company Name *</label>
              <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Industry</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" placeholder="e.g. Auto Dealership" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" placeholder="+1 555-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Website</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" placeholder="company.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAdd} disabled={!form.name} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">Add Company</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editOpen && editForm && (
        <Modal title="Edit Company" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Company Name</label>
              <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Industry</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Revenue</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.revenue} onChange={(e) => setEditForm({ ...editForm, revenue: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Contacts</label>
                <input type="number" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.contacts} onChange={(e) => setEditForm({ ...editForm, contacts: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Website</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.website ?? ""} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && selected && (
        <Modal title="Delete Company" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{selected.name}</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk delete confirm */}
      {bulkDeleteConfirm && (
        <Modal title="Delete Selected Companies" onClose={() => setBulkDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{selectedIds.size} companies</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleBulkDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete {selectedIds.size} Companies</button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <ImportModal
          config={companyImportConfig({ existing: companies, onAdd: addCompany, onUpdate: updateCompany, bulkApiRoute: "/api/import/companies" })}
          onClose={() => { setImportOpen(false); reloadCompanies(); }}
        />
      )}
    </div>
  );
}
