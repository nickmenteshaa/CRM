"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { useApp, type Deal } from "@/context/AppContext";
import PageLoading from "@/components/PageLoading";

// ── Stage configuration ────────────────────────────────────────────────────────

const STAGE_CONFIG = [
  { name: "New Opportunity", color: "bg-indigo-950/30 border-indigo-900",  headerColor: "bg-indigo-500"  },
  { name: "Prospecting",     color: "bg-purple-950/30 border-purple-900",  headerColor: "bg-purple-500"  },
  { name: "Qualified",       color: "bg-blue-950/30 border-blue-900",      headerColor: "bg-blue-500"    },
  { name: "Proposal",        color: "bg-yellow-950/30 border-yellow-900",  headerColor: "bg-yellow-500"  },
  { name: "Negotiation",     color: "bg-orange-950/30 border-orange-900",  headerColor: "bg-orange-500"  },
  { name: "Closed Won",      color: "bg-green-950/30 border-green-900",    headerColor: "bg-green-500"   },
  { name: "Closed Lost",     color: "bg-red-950/30 border-red-900",        headerColor: "bg-red-400"     },
];

const STAGE_NAMES = STAGE_CONFIG.map((s) => s.name);

// Stages that are terminal — excluded from stale detection and progress bar
const TERMINAL_STAGES = new Set(["Closed Won", "Closed Lost"]);

const stageStyles: Record<string, string> = {
  "New Opportunity": "bg-indigo-100 text-indigo-700",
  Prospecting:       "bg-purple-100 text-purple-700",
  Qualified:         "bg-blue-100 text-blue-700",
  Proposal:          "bg-yellow-100 text-yellow-700",
  Negotiation:       "bg-orange-100 text-orange-700",
  "Closed Won":      "bg-green-100 text-green-700",
  "Closed Lost":     "bg-red-100 text-red-600",
};

// Active stages for progress bar (excludes terminal)
const ACTIVE_STAGES = STAGE_NAMES.filter((s) => !TERMINAL_STAGES.has(s));

const STALE_DAYS = 14;

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseValue(v: string) {
  return parseInt(v.replace(/\D/g, "")) || 0;
}

function daysSince(iso?: string): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function isStale(deal: Deal): boolean {
  if (TERMINAL_STAGES.has(deal.stage)) return false;
  const ref = deal.updatedAt ?? deal.createdDate;
  return daysSince(ref) >= STALE_DAYS;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { deals, updateDeal, deleteDeal, loaded } = useApp();
  const [selected, setSelected]             = useState<Deal | null>(null);
  const [deleteConfirm, setDeleteConfirm]   = useState(false);
  const [editOpen, setEditOpen]             = useState(false);
  const [editForm, setEditForm]             = useState<Deal | null>(null);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeDeals = deals.filter((d) => !TERMINAL_STAGES.has(d.stage));
  const wonDeals    = deals.filter((d) => d.won);
  const lostDeals   = deals.filter((d) => d.lost);
  const activeValue = activeDeals.reduce((s, d) => s + parseValue(d.value), 0);
  const wonValue    = wonDeals.reduce((s, d) => s + parseValue(d.value), 0);
  const staleCount  = activeDeals.filter(isStale).length;

  // ── Stage move ──────────────────────────────────────────────────────────────
  function moveToStage(deal: Deal, stage: string) {
    updateDeal(deal.id, { stage });
    const updated = { ...deal, stage, won: stage === "Closed Won", lost: stage === "Closed Lost" };
    setSelected((prev) => (prev?.id === deal.id ? updated : prev));
  }

  function handleDelete() {
    if (!selected) return;
    deleteDeal(selected.id);
    setSelected(null);
    setDeleteConfirm(false);
  }

  function handleEditSave() {
    if (!editForm) return;
    updateDeal(editForm.id, editForm);
    setSelected(editForm);
    setEditOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${selected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>

        {!loaded ? <PageLoading /> : (<>
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#F9FAFB]">Pipeline</h2>
          <p className="text-sm text-[#9CA3AF] mt-1">{deals.length} total deals</p>
        </div>

        {/* ── Summary bar ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Active Deals",   value: activeDeals.length,             sub: `$${activeValue.toLocaleString()}`,    color: "text-blue-600"  },
            { label: "Closed Won",     value: wonDeals.length,                sub: `$${wonValue.toLocaleString()} won`,   color: "text-green-600" },
            { label: "Closed Lost",    value: lostDeals.length,               sub: "removed from pipeline",               color: "text-red-500"   },
            { label: "Stale (14+ d)",  value: staleCount,                     sub: "need attention",                      color: staleCount > 0 ? "text-amber-600" : "text-gray-400" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-[#111827] rounded-xl border border-[#1F2937] px-4 py-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Kanban board ──────────────────────────────────────────────────── */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_CONFIG.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.name);
            const stageValue = stageDeals.reduce((s, d) => s + parseValue(d.value), 0);
            return (
              <div key={stage.name} className="flex-shrink-0 w-56">
                <div className={`rounded-xl border ${stage.color} overflow-hidden`}>
                  {/* Column header */}
                  <div className={`${stage.headerColor} px-3 py-2.5`}>
                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs font-semibold truncate">{stage.name}</span>
                      <span className="text-white text-xs bg-white/20 rounded-full px-1.5 py-0.5 ml-1 flex-shrink-0">{stageDeals.length}</span>
                    </div>
                    <p className="text-white/70 text-xs mt-0.5">${stageValue.toLocaleString()}</p>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 min-h-32">
                    {stageDeals.map((deal) => {
                      const stale = isStale(deal);
                      return (
                        <div
                          key={deal.id}
                          onClick={() => setSelected(deal.id === selected?.id ? null : deal)}
                          className={`bg-[#111827] rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                            selected?.id === deal.id ? "border-blue-400 ring-2 ring-blue-900" : "border-[#1F2937]"
                          }`}
                        >
                          {/* Title + stale badge */}
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-semibold text-gray-100 leading-tight">{deal.name}</p>
                            {stale && (
                              <span className="flex-shrink-0 text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0.5">Stale</span>
                            )}
                          </div>
                          {/* Contact */}
                          <p className="text-[11px] text-gray-500 mt-1">{deal.contact}</p>
                          {/* Value + owner */}
                          <div className="flex items-center justify-between mt-2 gap-1">
                            <span className="text-xs font-bold text-gray-300">{deal.value}</span>
                            {deal.owner && (
                              <span className="text-[10px] bg-gray-800 text-gray-400 rounded px-1.5 py-0.5 truncate max-w-[60px]">{deal.owner}</span>
                            )}
                          </div>
                          {/* Won/Lost status */}
                          {deal.won && <p className="text-[10px] text-green-600 font-semibold mt-1">✓ Won</p>}
                          {deal.lost && <p className="text-[10px] text-red-500 font-semibold mt-1">✗ Lost</p>}
                        </div>
                      );
                    })}
                    {stageDeals.length === 0 && (
                      <p className="text-xs text-gray-600 text-center py-6 italic">Empty</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>)}
      </main>

      {/* ── Detail panel ──────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#111827] border-l border-[#1F2937] shadow-xl shadow-black/30 z-40 flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
            <h3 className="font-semibold text-[#F9FAFB]">Deal Details</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditForm({ ...selected }); setEditOpen(true); }}
                className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50"
              >Edit</button>
              <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded hover:bg-red-50">Delete</button>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          {/* Deal identity */}
          <div className="px-6 py-4 border-b border-[#1F2937]">
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-semibold text-[#F9FAFB] leading-tight">{selected.name}</p>
              {isStale(selected) && (
                <span className="flex-shrink-0 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">Stale</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageStyles[selected.stage] ?? "bg-gray-100 text-gray-600"}`}>{selected.stage}</span>
              <span className="text-sm font-bold text-gray-300">{selected.value}</span>
              {selected.won  && <span className="text-xs font-semibold text-green-600">✓ Won</span>}
              {selected.lost && <span className="text-xs font-semibold text-red-500">✗ Lost</span>}
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
            {[
              { label: "Contact",        value: selected.contact,                 icon: "👤" },
              { label: "Owner",          value: selected.owner || "—",            icon: "🧑‍💼" },
              { label: "Expected Close", value: selected.close || "—",            icon: "📅" },
              { label: "Created",        value: formatDate(selected.createdDate), icon: "🗓" },
              { label: "Last Updated",   value: formatDate(selected.updatedAt),   icon: "🔄" },
            ].map(({ label, value, icon }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-100"><span>{icon}</span><span>{value}</span></div>
              </div>
            ))}

            {/* Converted from lead */}
            {selected.leadName && (
              <div className="bg-purple-900/20 border border-purple-800 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-0.5">Converted from Lead</p>
                <p className="text-sm text-purple-200">{selected.leadName}</p>
              </div>
            )}

            {/* Stage progress (active stages only) */}
            {!TERMINAL_STAGES.has(selected.stage) && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Progress</p>
                <div className="flex gap-1">
                  {ACTIVE_STAGES.map((s, i) => (
                    <div
                      key={s} title={s}
                      className={`flex-1 h-1.5 rounded-full ${ACTIVE_STAGES.indexOf(selected.stage) >= i ? "bg-blue-500" : "bg-gray-700"}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>New</span><span>Negotiation</span>
                </div>
              </div>
            )}

            {/* Move to stage */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Move to Stage</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_NAMES.filter((s) => s !== selected.stage).map((s) => (
                  <button
                    key={s}
                    onClick={() => moveToStage(selected, s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      s === "Closed Won"
                        ? "border-green-700 text-green-400 hover:bg-green-900/20"
                        : s === "Closed Lost"
                        ? "border-red-700 text-red-400 hover:bg-red-900/20"
                        : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"
                    }`}
                  >
                    {s === "Closed Won" ? "✓ " : s === "Closed Lost" ? "✗ " : ""}{s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-[#1F2937] flex gap-2">
            <button
              onClick={() => moveToStage(selected, "Closed Won")}
              disabled={selected.won}
              className="flex-1 bg-green-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
            >✓ Mark Won</button>
            <button
              onClick={() => moveToStage(selected, "Closed Lost")}
              disabled={selected.lost}
              className="flex-1 bg-red-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
            >✗ Mark Lost</button>
          </div>
        </div>
      )}

      {/* ── Edit modal ─────────────────────────────────────────────────────────── */}
      {editOpen && editForm && (
        <Modal title="Edit Deal" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Deal Name</label>
              <input className="w-full border border-[#374151] bg-[#0F172A] text-[#F9FAFB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Contact</label>
                <input className="w-full border border-[#374151] bg-[#0F172A] text-[#F9FAFB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Owner</label>
                <input className="w-full border border-[#374151] bg-[#0F172A] text-[#F9FAFB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.owner ?? ""} onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Value</label>
                <input className="w-full border border-[#374151] bg-[#0F172A] text-[#F9FAFB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Stage</label>
                <select className="w-full border border-[#374151] bg-[#0F172A] text-[#F9FAFB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.stage} onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}>
                  {STAGE_NAMES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Expected Close</label>
              <input type="date" className="w-full border border-[#374151] bg-[#0F172A] text-[#F9FAFB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.close} onChange={(e) => setEditForm({ ...editForm, close: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────────────────── */}
      {deleteConfirm && selected && (
        <Modal title="Delete Deal" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Delete <strong>{selected.name}</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
