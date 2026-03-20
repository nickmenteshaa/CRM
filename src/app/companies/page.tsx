"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Company } from "@/context/AppContext";

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
  Technology: "💻", Finance: "💰", Software: "⚙", Healthcare: "🏥",
  "Food & Beverage": "🍃", Retail: "🛍", Default: "🏢",
};

const emptyForm = { name: "", industry: "", contacts: 0, revenue: "$0", status: "Lead", website: "", phone: "" };

function CompanyAvatar({ name }: { name: string }) {
  const colors = ["bg-blue-600", "bg-violet-600", "bg-teal-600", "bg-orange-500", "bg-pink-600"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || "—"}</p>
    </div>
  );
}

export default function CompaniesPage() {
  const { companies, addCompany, updateCompany, deleteCompany, loaded } = useApp();
  const [selected, setSelected]     = useState<Company | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editForm, setEditForm]     = useState<Company | null>(null);
  const [form, setForm]             = useState(emptyForm);
  const [query, setQuery]           = useState("");
  const [activeFields, setActiveFields] = useState(FIELDS.map((f) => f.key));

  const filtered = query.trim()
    ? companies.filter((c) =>
        activeFields.some((field) =>
          String(c[field as keyof Company] ?? "").toLowerCase().includes(query.toLowerCase())
        )
      )
    : companies;

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
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${selected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Companies</h2>
            <p className="text-sm text-gray-500 mt-1">{filtered.length} of {companies.length} companies</p>
          </div>
          <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            + Add Company
          </button>
        </div>

        <SearchFilter query={query} onQueryChange={setQuery} fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields} placeholder="Search companies..." />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Industry</th>
                <th className="px-5 py-3 font-medium">Contacts</th>
                <th className="px-5 py-3 font-medium">Total Revenue</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon="🏢" title="No companies found" description="Try adjusting your search or filters, or add a new company." /></td></tr>
              ) : filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c.id === selected?.id ? null : c)}
                  className={`cursor-pointer transition-colors ${selected?.id === c.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <CompanyAvatar name={c.name} />
                      <span className="font-medium text-gray-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span>{industryIcons[c.industry] ?? industryIcons.Default}</span>
                      {c.industry}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{c.contacts}</td>
                  <td className="px-5 py-3.5 font-semibold text-gray-800">{c.revenue}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[c.status]}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>)}
      </main>

      {/* ── Detail panel ──────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Company Details</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50">Edit</button>
              <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded hover:bg-red-50">Delete</button>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-4">
            <CompanyAvatar name={selected.name} />
            <div>
              <p className="text-lg font-semibold text-gray-900">{selected.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[selected.status]}`}>{selected.status}</span>
                <span className="text-xs text-gray-400">{selected.industry}</span>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Revenue"  value={selected.revenue} />
              <Field label="Contacts" value={selected.contacts} />
            </div>
            <Field label="Phone"   value={selected.phone ?? "—"} />
            <Field label="Website" value={selected.website ?? "—"} />
            <Field label="Industry" value={`${industryIcons[selected.industry] ?? "🏢"} ${selected.industry}`} />

            {/* Quick stats */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quick Stats</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Avg deal size</span>
                <span className="font-medium text-gray-800">
                  {selected.contacts > 0 ? `$${Math.round(parseInt(selected.revenue.replace(/\D/g, "")) / selected.contacts).toLocaleString()}` : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium ${selected.status === "Active" ? "text-green-600" : selected.status === "At Risk" ? "text-yellow-600" : "text-gray-500"}`}>{selected.status}</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex gap-2">
            <button onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors">
              Edit Company
            </button>
            <button onClick={() => setDeleteConfirm(true)} className="flex-1 border border-red-200 text-red-600 text-sm font-medium py-2 rounded-lg hover:bg-red-50 transition-colors">
              Delete
            </button>
          </div>
        </div>
      )}

      {/* ── Add modal ──────────────────────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Company" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Technology" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="+1 555-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="company.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleAdd} disabled={!form.name} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">Add Company</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────────── */}
      {editOpen && editForm && (
        <Modal title="Edit Company" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Revenue</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.revenue} onChange={(e) => setEditForm({ ...editForm, revenue: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contacts</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.contacts} onChange={(e) => setEditForm({ ...editForm, contacts: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.website ?? ""} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleEditSave} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────────── */}
      {deleteConfirm && selected && (
        <Modal title="Delete Company" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Are you sure you want to delete <strong>{selected.name}</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
