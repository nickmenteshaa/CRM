"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Deal } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

const FIELDS = [
  { key: "name",        label: "Deal Name" },
  { key: "contact",     label: "Contact" },
  { key: "value",       label: "Value" },
  { key: "stage",       label: "Stage" },
  { key: "owner",       label: "Owner" },
  { key: "close",       label: "Close Date" },
];

const STAGE_OPTIONS = [
  "New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost",
];

const stageStyles: Record<string, string> = {
  "New Opportunity": "bg-indigo-100 text-indigo-700",
  Prospecting:       "bg-purple-100 text-purple-700",
  Qualified:         "bg-blue-100 text-blue-700",
  Proposal:          "bg-yellow-100 text-yellow-700",
  Negotiation:       "bg-orange-100 text-orange-700",
  "Closed Won":      "bg-green-100 text-green-700",
  "Closed Lost":     "bg-red-100 text-red-600",
};

const emptyForm = {
  name: "", contact: "", value: "", stage: "New Opportunity",
  close: "", owner: "",
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DealsPage() {
  const { deals, addDeal, updateDeal, deleteDeal, loaded } = useApp();
  const { isAdmin, user } = useAuth();

  // sales users can only edit/delete deals they own or unassigned deals
  function canEditDeal(deal: Deal) {
    if (isAdmin) return true;
    return !deal.ownerId || deal.ownerId === user?.id;
  }
  const [selected, setSelected]           = useState<Deal | null>(null);
  const [addOpen, setAddOpen]             = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editForm, setEditForm]           = useState<Deal | null>(null);
  const [form, setForm]                   = useState(emptyForm);
  const [query, setQuery]                 = useState("");
  const [activeFields, setActiveFields]   = useState(FIELDS.map((f) => f.key));

  const filtered = query.trim()
    ? deals.filter((d) =>
        activeFields.some((field) =>
          String(d[field as keyof Deal] ?? "").toLowerCase().includes(query.toLowerCase())
        )
      )
    : deals;

  const totalValue = deals.reduce((sum, d) => sum + (parseInt(d.value.replace(/\D/g, "")) || 0), 0);

  function handleAdd() {
    if (!form.name) return;
    addDeal({ ...form, createdDate: new Date().toISOString() });
    setForm(emptyForm);
    setAddOpen(false);
  }

  function handleEditSave() {
    if (!editForm) return;
    updateDeal(editForm.id, editForm);
    setSelected(editForm);
    setEditOpen(false);
  }

  function handleDelete() {
    if (!selected) return;
    deleteDeal(selected.id);
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
            <h2 className="text-2xl font-bold text-gray-900">Deals</h2>
            <p className="text-sm text-gray-500 mt-1">
              {filtered.length} of {deals.length} deals · Total value: ${totalValue.toLocaleString()}
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            + Add Deal
          </button>
        </div>

        <SearchFilter
          query={query} onQueryChange={setQuery}
          fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields}
          placeholder="Search deals..."
        />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Deal Name</th>
                <th className="px-5 py-3 font-medium">Contact / Lead</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 font-medium">Value</th>
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Expected Close</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon="💼" title="No deals found" description="Try adjusting your search or filters, or create a new deal." /></td></tr>
              ) : filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d.id === selected?.id ? null : d)}
                  className={`cursor-pointer transition-colors ${selected?.id === d.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {d.name}
                    {d.leadName && (
                      <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-normal">converted</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{d.contact}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageStyles[d.stage] ?? "bg-gray-100 text-gray-600"}`}>{d.stage}</span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-gray-800">{d.value}</td>
                  <td className="px-5 py-3.5 text-gray-500">{d.owner || "—"}</td>
                  <td className="px-5 py-3.5 text-gray-400">{formatDate(d.createdDate)}</td>
                  <td className="px-5 py-3.5 text-gray-400">{d.close || "—"}</td>
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
            <h3 className="font-semibold text-gray-900">Deal Details</h3>
            <div className="flex items-center gap-2">
              {canEditDeal(selected) && (
                <button onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50">Edit</button>
              )}
              {canEditDeal(selected) && (
                <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded hover:bg-red-50">Delete</button>
              )}
              {!canEditDeal(selected) && (
                <span className="text-xs text-gray-400 px-2 py-1">View only</span>
              )}
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-lg font-semibold text-gray-900">{selected.name}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageStyles[selected.stage] ?? "bg-gray-100 text-gray-600"}`}>{selected.stage}</span>
              <span className="text-sm font-bold text-gray-700">{selected.value}</span>
            </div>
          </div>

          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
            {[
              { label: "Contact",        value: selected.contact,                 icon: "👤" },
              { label: "Deal Value",     value: selected.value,                   icon: "💰" },
              { label: "Owner",          value: selected.owner || "—",            icon: "🧑‍💼" },
              { label: "Expected Close", value: selected.close || "—",            icon: "📅" },
              { label: "Created",        value: formatDate(selected.createdDate), icon: "🗓" },
            ].map(({ label, value, icon }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-800"><span>{icon}</span><span>{value}</span></div>
              </div>
            ))}

            {/* Converted from lead */}
            {selected.leadName && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-0.5">Converted from Lead</p>
                <p className="text-sm text-purple-800">{selected.leadName}</p>
              </div>
            )}

            {/* Stage progress */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Stage Progress</p>
              <div className="flex gap-1">
                {STAGE_OPTIONS.map((s, i) => (
                  <div key={s} title={s} className={`flex-1 h-1.5 rounded-full ${STAGE_OPTIONS.indexOf(selected.stage) >= i ? "bg-blue-500" : "bg-gray-200"}`} />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>New</span><span>Closed Won</span>
              </div>
            </div>

            {/* Change stage */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Change Stage</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { updateDeal(selected.id, { stage: s }); setSelected({ ...selected, stage: s }); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      selected.stage === s
                        ? `${stageStyles[s]} border-transparent`
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {canEditDeal(selected) && (
            <div className="px-6 py-4 border-t border-gray-200 flex gap-2">
              <button onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors">Edit Deal</button>
              <button onClick={() => setDeleteConfirm(true)} className="flex-1 border border-red-200 text-red-600 text-sm font-medium py-2 rounded-lg hover:bg-red-50 transition-colors">Delete</button>
            </div>
          )}
        </div>
      )}

      {/* ── Add modal ──────────────────────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Deal" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deal Name *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Acme Corp Expansion" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Contact name" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Deal owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="$0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  {STAGE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.close} onChange={(e) => setForm({ ...form, close: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleAdd} disabled={!form.name} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">Add Deal</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit modal ─────────────────────────────────────────────────────────── */}
      {editOpen && editForm && (
        <Modal title="Edit Deal" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deal Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.owner ?? ""} onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.stage} onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}>
                  {STAGE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.close} onChange={(e) => setEditForm({ ...editForm, close: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleEditSave} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────────────────── */}
      {deleteConfirm && selected && (
        <Modal title="Delete Deal" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Delete <strong>{selected.name}</strong>? This cannot be undone.</p>
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
