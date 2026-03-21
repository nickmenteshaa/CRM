"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import type { Supplier, SupplierPart, Part } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import ImportModal from "@/components/ImportModal";
import { supplierImportConfig } from "@/lib/import-configs";
import {
  dbGetSparePartsData,
  dbCreateSupplier,
  dbUpdateSupplier,
  dbDeleteSupplier,
  dbCreateSupplierPart,
  dbDeleteSupplierPart,
} from "@/lib/actions-spare-parts";

// ── Reusable form inputs ────────────────────────────────────────────────────

function LabeledInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <select
        className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Sort ────────────────────────────────────────────────────────────────────

type SortKey = "name" | "leadTimeDays" | "rating";
type SortDir = "asc" | "desc";

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: {
  label: string; sortKey: SortKey; currentSort: SortKey | null; currentDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th className="px-5 py-3 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors" onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-blue-400">{currentDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

// ── Rating stars ────────────────────────────────────────────────────────────

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "text-base" : "text-xs";
  return (
    <span className={cls}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "text-amber-400" : "text-gray-600"}>{n <= rating ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">Rating</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? 0 : n)}
            className={`text-xl transition-colors ${n <= value ? "text-amber-400" : "text-gray-600 hover:text-amber-300"}`}
          >
            {n <= value ? "★" : "☆"}
          </button>
        ))}
        {value > 0 && <button type="button" onClick={() => onChange(0)} className="text-xs text-gray-500 hover:text-gray-300 ml-2">Clear</button>}
      </div>
    </div>
  );
}

// ── Empty form ──────────────────────────────────────────────────────────────

const emptyForm = {
  name: "", contactName: "", email: "", phone: "",
  country: "", website: "", leadTimeDays: "",
  moq: "", rating: 0, notes: "", isActive: true,
};

type FormState = typeof emptyForm;

// ── Link Part form ──────────────────────────────────────────────────────────

const emptyLinkForm = {
  partId: "", costPrice: "", leadTimeDays: "", moq: "", supplierSku: "",
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { isAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierParts, setSupplierParts] = useState<SupplierPart[]>([]);
  const [allParts, setAllParts] = useState<Part[]>([]);
  const [loaded, setLoaded] = useState(false);

  // UI state
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filters
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterRating, setFilterRating] = useState("all");

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [linkPartOpen, setLinkPartOpen] = useState(false);

  // Forms
  const [addForm, setAddForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<FormState & { id?: string }>(emptyForm);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const data = await dbGetSparePartsData();
      setSuppliers(data.suppliers ?? []);
      setSupplierParts(data.supplierParts ?? []);
      setAllParts(data.parts ?? []);
    } catch (err) {
      console.error("[SuppliersPage] load failed:", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived ────────────────────────────────────────────────────────────

  const countries = useMemo(() => {
    const set = new Set(suppliers.map((s) => s.country).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [suppliers]);

  const partMap = useMemo(() => {
    const m: Record<string, Part> = {};
    for (const p of allParts) m[p.id] = p;
    return m;
  }, [allParts]);

  // Parts linked to the selected supplier
  const linkedParts = useMemo(() => {
    if (!selected) return [];
    return supplierParts.filter((sp) => sp.supplierId === selected.id);
  }, [selected, supplierParts]);

  // Parts available to link (not already linked)
  const availableParts = useMemo(() => {
    if (!selected) return [];
    const linkedIds = new Set(linkedParts.map((lp) => lp.partId));
    return allParts.filter((p) => !linkedIds.has(p.id));
  }, [selected, linkedParts, allParts]);

  // ── Search + Filter + Sort ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...suppliers];

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.country ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q)
      );
    }

    if (filterCountry !== "all") {
      result = result.filter((s) => s.country === filterCountry);
    }
    if (filterActive === "active") result = result.filter((s) => s.isActive !== false);
    if (filterActive === "inactive") result = result.filter((s) => s.isActive === false);
    if (filterRating !== "all") {
      const min = Number(filterRating);
      result = result.filter((s) => (s.rating ?? 0) >= min);
    }

    if (sortKey) {
      result.sort((a, b) => {
        let av: string | number;
        let bv: string | number;
        if (sortKey === "leadTimeDays" || sortKey === "rating") {
          av = a[sortKey] ?? 0;
          bv = b[sortKey] ?? 0;
        } else {
          av = String(a[sortKey] ?? "").toLowerCase();
          bv = String(b[sortKey] ?? "").toLowerCase();
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [suppliers, query, filterCountry, filterActive, filterRating, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── CRUD handlers ──────────────────────────────────────────────────────

  async function handleAdd() {
    const errors: Record<string, string> = {};
    if (!addForm.name.trim()) errors.name = "Name is required";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});

    const created = await dbCreateSupplier({
      name: addForm.name.trim(),
      contactName: addForm.contactName || undefined,
      email: addForm.email || undefined,
      phone: addForm.phone || undefined,
      country: addForm.country || undefined,
      website: addForm.website || undefined,
      leadTimeDays: addForm.leadTimeDays ? Number(addForm.leadTimeDays) : undefined,
      moq: addForm.moq ? Number(addForm.moq) : undefined,
      rating: addForm.rating || undefined,
      notes: addForm.notes || undefined,
      isActive: addForm.isActive,
    });
    setSuppliers((prev) => [created, ...prev]);
    setAddForm(emptyForm);
    setAddOpen(false);
  }

  function openEdit(supplier: Supplier) {
    setEditForm({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      country: supplier.country ?? "",
      website: supplier.website ?? "",
      leadTimeDays: supplier.leadTimeDays?.toString() ?? "",
      moq: supplier.moq?.toString() ?? "",
      rating: supplier.rating ?? 0,
      notes: supplier.notes ?? "",
      isActive: supplier.isActive !== false,
    });
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editForm.id) return;
    const updated = await dbUpdateSupplier(editForm.id, {
      name: editForm.name.trim(),
      contactName: editForm.contactName || undefined,
      email: editForm.email || undefined,
      phone: editForm.phone || undefined,
      country: editForm.country || undefined,
      website: editForm.website || undefined,
      leadTimeDays: editForm.leadTimeDays ? Number(editForm.leadTimeDays) : undefined,
      moq: editForm.moq ? Number(editForm.moq) : undefined,
      rating: editForm.rating || undefined,
      notes: editForm.notes || undefined,
      isActive: editForm.isActive,
    });
    setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (selected?.id === updated.id) setSelected(updated);
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!selected) return;
    await dbDeleteSupplier(selected.id);
    setSuppliers((prev) => prev.filter((s) => s.id !== selected.id));
    setSupplierParts((prev) => prev.filter((sp) => sp.supplierId !== selected.id));
    setSelected(null);
    setDeleteConfirm(false);
  }

  // ── Link Part handlers ─────────────────────────────────────────────────

  async function handleLinkPart() {
    if (!selected || !linkForm.partId) return;
    const created = await dbCreateSupplierPart({
      supplierId: selected.id,
      partId: linkForm.partId,
      costPrice: linkForm.costPrice || undefined,
      leadTimeDays: linkForm.leadTimeDays ? Number(linkForm.leadTimeDays) : undefined,
      moq: linkForm.moq ? Number(linkForm.moq) : undefined,
      supplierSku: linkForm.supplierSku || undefined,
    });
    setSupplierParts((prev) => [...prev, created]);
    setLinkForm(emptyLinkForm);
    setLinkPartOpen(false);
  }

  async function handleUnlinkPart(spId: string) {
    await dbDeleteSupplierPart(spId);
    setSupplierParts((prev) => prev.filter((sp) => sp.id !== spId));
  }

  // ── Detail ─────────────────────────────────────────────────────────────

  const currentSupplier = selected ? suppliers.find((s) => s.id === selected.id) ?? selected : null;

  function openDetailPanel(supplier: Supplier) {
    setSelected(supplier.id === selected?.id ? null : supplier);
  }

  // ── Supplier form fields ───────────────────────────────────────────────

  function SupplierFormFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <LabeledInput label="Company Name *" value={form.name} onChange={(v) => { setForm({ ...form, name: v }); setFormErrors((e) => { const { name: _, ...rest } = e; return rest; }); }} placeholder="e.g. Bosch Auto Parts" />
            {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
          </div>
          <LabeledInput label="Contact Person" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} placeholder="e.g. John Smith" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="supplier@example.com" />
          <LabeledInput label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+49 123 456 789" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} placeholder="e.g. Germany" />
          <LabeledInput label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="e.g. bosch.com" />
        </div>

        <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Terms & Rating</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Lead Time (days)" value={form.leadTimeDays} onChange={(v) => setForm({ ...form, leadTimeDays: v })} placeholder="e.g. 14" type="number" />
          <LabeledInput label="Min Order Qty (MOQ)" value={form.moq} onChange={(v) => setForm({ ...form, moq: v })} placeholder="e.g. 50" type="number" />
        </div>
        <RatingPicker value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />

        <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Additional</p>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
          <textarea
            className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors"
            rows={3}
            placeholder="Internal notes about this supplier..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-300">Active</span>
          </label>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${currentSupplier ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#F9FAFB]">Suppliers</h2>
                <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} of {suppliers.length} suppliers</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={() => setImportOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-all">
                    ↑ Import
                  </button>
                )}
                <button onClick={() => { setAddForm(emptyForm); setFormErrors({}); setAddOpen(true); }} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">
                  + Add Supplier
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 mb-5">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
                <input
                  className="w-full border border-[#1F2937] bg-[#0F172A] rounded-lg pl-8 pr-8 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                  placeholder="Search by name, country, or email..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">×</button>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Countries</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={filterActive} onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")} className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)} className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">Any Rating</option>
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★☆ (4+)</option>
                <option value="3">★★★☆☆ (3+)</option>
                <option value="2">★★☆☆☆ (2+)</option>
                <option value="1">★☆☆☆☆ (1+)</option>
              </select>

              {(filterCountry !== "all" || filterActive !== "all" || filterRating !== "all") && (
                <button onClick={() => { setFilterCountry("all"); setFilterActive("all"); setFilterRating("all"); }} className="text-xs text-blue-400 hover:text-blue-300 hover:underline">
                  Clear filters
                </button>
              )}
            </div>

            {/* Table */}
            <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
                    <tr className="text-left text-[#9CA3AF]">
                      <SortHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Country</th>
                      <th className="px-5 py-3 font-medium">Contact</th>
                      <th className="px-5 py-3 font-medium">Email</th>
                      <SortHeader label="Lead Time" sortKey="leadTimeDays" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Rating" sortKey="rating" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            icon="🏭"
                            title="No suppliers found"
                            description="Try adjusting your search or filters, or add a new supplier."
                            action={{ label: "+ Add Supplier", onClick: () => { setAddForm(emptyForm); setFormErrors({}); setAddOpen(true); } }}
                          />
                        </td>
                      </tr>
                    ) : filtered.map((supplier) => (
                      <tr
                        key={supplier.id}
                        onClick={() => openDetailPanel(supplier)}
                        className={`cursor-pointer transition-colors ${selected?.id === supplier.id ? "bg-blue-900/30" : "hover:bg-gray-800/50"}`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {supplier.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-[#F9FAFB]">{supplier.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[#9CA3AF]">{supplier.country ?? "—"}</td>
                        <td className="px-5 py-3.5 text-[#9CA3AF]">{supplier.contactName ?? "—"}</td>
                        <td className="px-5 py-3.5 text-[#9CA3AF]">{supplier.email ?? "—"}</td>
                        <td className="px-5 py-3.5 text-[#9CA3AF]">{supplier.leadTimeDays != null ? `${supplier.leadTimeDays}d` : "—"}</td>
                        <td className="px-5 py-3.5">{supplier.rating ? <Stars rating={supplier.rating} /> : <span className="text-gray-600">—</span>}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${supplier.isActive !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {supplier.isActive !== false ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Detail Panel ──────────────────────────────────────────────────── */}
      {currentSupplier && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#111827] border-l border-[#1F2937] shadow-2xl shadow-black/40 z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
            <h3 className="font-semibold text-[#F9FAFB]">Supplier Details</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(currentSupplier)} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-900/20">Edit</button>
              <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-400 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          {/* Header */}
          <div className="px-6 py-5 border-b border-[#1F2937]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {currentSupplier.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold text-[#F9FAFB]">{currentSupplier.name}</p>
                {currentSupplier.country && <p className="text-xs text-gray-400">{currentSupplier.country}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${currentSupplier.isActive !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {currentSupplier.isActive !== false ? "Active" : "Inactive"}
              </span>
              {currentSupplier.rating ? <Stars rating={currentSupplier.rating} size="md" /> : null}
            </div>
          </div>

          {/* Scrollable details */}
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            {/* Contact info */}
            {[
              { label: "Contact Person", value: currentSupplier.contactName, icon: "👤" },
              { label: "Email", value: currentSupplier.email, icon: "✉" },
              { label: "Phone", value: currentSupplier.phone, icon: "📞" },
              { label: "Website", value: currentSupplier.website, icon: "🌐" },
            ].map(({ label, value, icon }) => value ? (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-300"><span>{icon}</span><span>{value}</span></div>
              </div>
            ) : null)}

            {/* Terms */}
            <div className="bg-teal-900/20 border border-teal-800 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-teal-300 uppercase tracking-wide mb-1.5">Supply Terms</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-teal-400">Lead Time:</span> <span className="text-teal-200 font-medium">{currentSupplier.leadTimeDays != null ? `${currentSupplier.leadTimeDays} days` : "—"}</span></div>
                <div><span className="text-teal-400">MOQ:</span> <span className="text-teal-200 font-medium">{currentSupplier.moq != null ? `${currentSupplier.moq} units` : "—"}</span></div>
              </div>
            </div>

            {/* Notes */}
            {currentSupplier.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{currentSupplier.notes}</p>
              </div>
            )}

            {/* Linked Parts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linked Parts ({linkedParts.length})</p>
                {availableParts.length > 0 && (
                  <button onClick={() => { setLinkForm(emptyLinkForm); setLinkPartOpen(true); }} className="text-xs text-blue-400 hover:text-blue-300 hover:underline">
                    + Link Part
                  </button>
                )}
              </div>

              {linkedParts.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No parts linked to this supplier yet.</p>
              ) : (
                <ul className="space-y-2">
                  {linkedParts.map((sp) => {
                    const part = partMap[sp.partId];
                    return (
                      <li key={sp.id} className="bg-[#0B0F14] rounded-xl px-3 py-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-[#F9FAFB]">{part?.name ?? "Unknown Part"}</span>
                          <button onClick={() => handleUnlinkPart(sp.id)} className="text-red-400 hover:text-red-300 text-[10px] hover:underline">Unlink</button>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-gray-400">
                          <div>SKU: <span className="font-mono text-blue-400">{part?.sku ?? "—"}</span></div>
                          <div>Cost: <span className="text-gray-200">{sp.costPrice ?? "—"}</span></div>
                          <div>Lead: <span className="text-gray-200">{sp.leadTimeDays != null ? `${sp.leadTimeDays}d` : "—"}</span></div>
                          <div>MOQ: <span className="text-gray-200">{sp.moq != null ? `${sp.moq}` : "—"}</span></div>
                          {sp.supplierSku && <div className="col-span-2">Supplier SKU: <span className="text-gray-200">{sp.supplierSku}</span></div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ────────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Supplier" onClose={() => { setAddOpen(false); setFormErrors({}); }}>
          <SupplierFormFields form={addForm} setForm={setAddForm} />
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => { setAddOpen(false); setFormErrors({}); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={handleAdd} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Add Supplier</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Supplier Modal ───────────────────────────────────────────── */}
      {editOpen && (
        <Modal title="Edit Supplier" onClose={() => setEditOpen(false)}>
          <SupplierFormFields form={editForm} setForm={setEditForm} />
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {deleteConfirm && currentSupplier && (
        <Modal title="Delete Supplier" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{currentSupplier.name}</strong>? This will also remove all linked part associations. This action cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete Supplier</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Link Part Modal ───────────────────────────────────────────────── */}
      {linkPartOpen && currentSupplier && (
        <Modal title={`Link Part to ${currentSupplier.name}`} onClose={() => setLinkPartOpen(false)}>
          <div className="space-y-4">
            <LabeledSelect
              label="Part *"
              value={linkForm.partId}
              onChange={(v) => setLinkForm({ ...linkForm, partId: v })}
              options={[{ value: "", label: "— Select a part —" }, ...availableParts.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }))]}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Cost Price" value={linkForm.costPrice} onChange={(v) => setLinkForm({ ...linkForm, costPrice: v })} placeholder="e.g. $25.00" />
              <LabeledInput label="Lead Time (days)" value={linkForm.leadTimeDays} onChange={(v) => setLinkForm({ ...linkForm, leadTimeDays: v })} placeholder="e.g. 14" type="number" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="MOQ" value={linkForm.moq} onChange={(v) => setLinkForm({ ...linkForm, moq: v })} placeholder="e.g. 100" type="number" />
              <LabeledInput label="Supplier SKU" value={linkForm.supplierSku} onChange={(v) => setLinkForm({ ...linkForm, supplierSku: v })} placeholder="Supplier's own SKU" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setLinkPartOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleLinkPart} disabled={!linkForm.partId} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">Link Part</button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <ImportModal
          config={supplierImportConfig({
            existing: suppliers,
            onAdd: async (record) => {
              const created = await dbCreateSupplier(record);
              setSuppliers((prev) => [created, ...prev]);
              return created;
            },
            onUpdate: async (id, updates) => {
              const updated = await dbUpdateSupplier(id, updates);
              setSuppliers((prev) => prev.map((s) => (s.id === id ? updated : s)));
              return updated;
            },
          })}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
