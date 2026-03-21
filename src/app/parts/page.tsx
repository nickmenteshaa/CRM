"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import type { Part, PartCategory } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import ImportModal from "@/components/ImportModal";
import { partImportConfig } from "@/lib/import-configs";
import {
  dbGetSparePartsData,
  dbCreatePart,
  dbUpdatePart,
  dbDeletePart,
  dbCheckPartDependencies,
  dbCreateCategory,
} from "@/lib/actions-spare-parts";

// ── Search fields ──────────────────────────────────────────────────────────

const SEARCH_FIELDS: { key: keyof Part; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "sku", label: "SKU" },
  { key: "oemNumber", label: "OEM Number" },
  { key: "brand", label: "Brand" },
];

// ── Reusable form inputs (match contacts page style) ───────────────────────

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

// ── Sort helpers ────────────────────────────────────────────────────────────

type SortKey = "name" | "sku" | "brand" | "unitPrice";
type SortDir = "asc" | "desc";

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: {
  label: string; sortKey: SortKey; currentSort: SortKey | null; currentDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      className="px-5 py-3 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-blue-400">{currentDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

// ── Empty form ──────────────────────────────────────────────────────────────

const emptyForm = {
  sku: "", name: "", description: "", oemNumber: "", brand: "",
  categoryId: "", compatMake: "", compatModel: "", compatYearFrom: "",
  compatYearTo: "", weight: "", dimensions: "", imageUrl: "",
  unitPrice: "", costPrice: "", isActive: true,
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function PartsPage() {
  const { isAdmin } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [categories, setCategories] = useState<PartCategory[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Selection & UI state
  const [selected, setSelected] = useState<Part | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filters
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  // Forms
  const [addForm, setAddForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState<typeof emptyForm & { id?: string }>(emptyForm);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [partDeps, setPartDeps] = useState<{ inventoryCount: number; orderLineCount: number; supplierPartCount: number } | null>(null);
  const [depsLoading, setDepsLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const data = await dbGetSparePartsData();
      setParts(data.parts ?? []);
      setCategories(data.categories ?? []);
    } catch (err) {
      console.error("[PartsPage] load failed:", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived data ───────────────────────────────────────────────────────

  const brands = useMemo(() => {
    const set = new Set(parts.map((p) => p.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [parts]);

  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  // ── Search + Filter + Sort ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...parts];

    // Text search across search fields
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((p) =>
        SEARCH_FIELDS.some((f) =>
          String(p[f.key] ?? "").toLowerCase().includes(q)
        )
      );
    }

    // Category filter
    if (filterCategory !== "all") {
      result = result.filter((p) => p.categoryId === filterCategory);
    }

    // Brand filter
    if (filterBrand !== "all") {
      result = result.filter((p) => p.brand === filterBrand);
    }

    // Active filter
    if (filterActive === "active") result = result.filter((p) => p.isActive !== false);
    if (filterActive === "inactive") result = result.filter((p) => p.isActive === false);

    // Sort
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
  }, [parts, query, filterCategory, filterBrand, filterActive, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── CRUD handlers ──────────────────────────────────────────────────────

  async function handleAddPart() {
    const errors: Record<string, string> = {};
    if (!addForm.sku.trim()) errors.sku = "SKU is required";
    if (!addForm.name.trim()) errors.name = "Name is required";
    if (parts.some((p) => p.sku === addForm.sku.trim())) errors.sku = "SKU already exists";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});

    const created = await dbCreatePart({
      ...addForm,
      sku: addForm.sku.trim(),
      name: addForm.name.trim(),
      categoryId: addForm.categoryId || undefined,
      description: addForm.description || undefined,
      oemNumber: addForm.oemNumber || undefined,
      brand: addForm.brand || undefined,
      compatMake: addForm.compatMake || undefined,
      compatModel: addForm.compatModel || undefined,
      compatYearFrom: addForm.compatYearFrom || undefined,
      compatYearTo: addForm.compatYearTo || undefined,
      weight: addForm.weight || undefined,
      dimensions: addForm.dimensions || undefined,
      imageUrl: addForm.imageUrl || undefined,
      unitPrice: addForm.unitPrice || undefined,
      costPrice: addForm.costPrice || undefined,
    });
    setParts((prev) => [created, ...prev]);
    setAddForm(emptyForm);
    setAddOpen(false);
  }

  function openEdit(part: Part) {
    setEditForm({
      id: part.id,
      sku: part.sku,
      name: part.name,
      description: part.description ?? "",
      oemNumber: part.oemNumber ?? "",
      brand: part.brand ?? "",
      categoryId: part.categoryId ?? "",
      compatMake: part.compatMake ?? "",
      compatModel: part.compatModel ?? "",
      compatYearFrom: part.compatYearFrom ?? "",
      compatYearTo: part.compatYearTo ?? "",
      weight: part.weight ?? "",
      dimensions: part.dimensions ?? "",
      imageUrl: part.imageUrl ?? "",
      unitPrice: part.unitPrice ?? "",
      costPrice: part.costPrice ?? "",
      isActive: part.isActive !== false,
    });
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editForm.id) return;
    const updated = await dbUpdatePart(editForm.id, {
      sku: editForm.sku.trim(),
      name: editForm.name.trim(),
      description: editForm.description || undefined,
      oemNumber: editForm.oemNumber || undefined,
      brand: editForm.brand || undefined,
      categoryId: editForm.categoryId || undefined,
      compatMake: editForm.compatMake || undefined,
      compatModel: editForm.compatModel || undefined,
      compatYearFrom: editForm.compatYearFrom || undefined,
      compatYearTo: editForm.compatYearTo || undefined,
      weight: editForm.weight || undefined,
      dimensions: editForm.dimensions || undefined,
      imageUrl: editForm.imageUrl || undefined,
      unitPrice: editForm.unitPrice || undefined,
      costPrice: editForm.costPrice || undefined,
      isActive: editForm.isActive,
    });
    setParts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (selected?.id === updated.id) setSelected(updated);
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!selected) return;
    await dbDeletePart(selected.id);
    setParts((prev) => prev.filter((p) => p.id !== selected.id));
    setSelected(null);
    setDeleteConfirm(false);
  }

  async function handleAddCategory() {
    if (!catForm.name.trim()) return;
    const created = await dbCreateCategory({
      name: catForm.name.trim(),
      description: catForm.description || undefined,
    });
    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setCatForm({ name: "", description: "" });
    setCatOpen(false);
  }

  // ── Detail panel ───────────────────────────────────────────────────────

  const currentPart = selected ? parts.find((p) => p.id === selected.id) ?? selected : null;

  function openDetailPanel(part: Part) {
    setSelected(part.id === selected?.id ? null : part);
  }

  // ── Part form fields (shared between add/edit) ─────────────────────────

  function PartFormFields({ form, setForm }: {
    form: typeof emptyForm;
    setForm: (f: typeof emptyForm) => void;
  }) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <LabeledInput label="SKU *" value={form.sku} onChange={(v) => { setForm({ ...form, sku: v }); setFormErrors((e) => { const { sku: _, ...rest } = e; return rest; }); }} placeholder="e.g. BRK-PAD-001" />
            {formErrors.sku && <p className="text-xs text-red-500 mt-1">{formErrors.sku}</p>}
          </div>
          <div>
            <LabeledInput label="Name *" value={form.name} onChange={(v) => { setForm({ ...form, name: v }); setFormErrors((e) => { const { name: _, ...rest } = e; return rest; }); }} placeholder="e.g. Front Brake Pad Set" />
            {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="OEM Number" value={form.oemNumber} onChange={(v) => setForm({ ...form, oemNumber: v })} placeholder="e.g. 34116850568" />
          <LabeledInput label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="e.g. Bosch" />
        </div>
        <LabeledSelect
          label="Category"
          value={form.categoryId}
          onChange={(v) => setForm({ ...form, categoryId: v })}
          options={[{ value: "", label: "— No category —" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <LabeledInput label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional description" />

        <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Vehicle Compatibility</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Make" value={form.compatMake} onChange={(v) => setForm({ ...form, compatMake: v })} placeholder="e.g. Toyota" />
          <LabeledInput label="Model" value={form.compatModel} onChange={(v) => setForm({ ...form, compatModel: v })} placeholder="e.g. Camry" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Year From" value={form.compatYearFrom} onChange={(v) => setForm({ ...form, compatYearFrom: v })} placeholder="e.g. 2018" />
          <LabeledInput label="Year To" value={form.compatYearTo} onChange={(v) => setForm({ ...form, compatYearTo: v })} placeholder="e.g. 2024" />
        </div>

        <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Pricing & Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Unit Price" value={form.unitPrice} onChange={(v) => setForm({ ...form, unitPrice: v })} placeholder="e.g. $45.00" />
          <LabeledInput label="Cost Price" value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} placeholder="e.g. $25.00" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <LabeledInput label="Weight" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} placeholder="e.g. 2.5 kg" />
          <LabeledInput label="Dimensions" value={form.dimensions} onChange={(v) => setForm({ ...form, dimensions: v })} placeholder="e.g. 30x20x10 cm" />
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

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${currentPart ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#F9FAFB]">Parts Catalog</h2>
                <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} of {parts.length} parts</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={() => setImportOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-all">
                    ↑ Import
                  </button>
                )}
                <button onClick={() => setCatOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
                  + Category
                </button>
                <button onClick={() => { setAddForm(emptyForm); setFormErrors({}); setAddOpen(true); }} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">
                  + Add Part
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="flex items-center gap-2 mb-5">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
                <input
                  className="w-full border border-[#1F2937] bg-[#0F172A] rounded-lg pl-8 pr-8 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                  placeholder="Search by name, SKU, OEM, or brand..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">×</button>
                )}
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {/* Category filter */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Brand filter */}
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* Active filter */}
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
                className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Clear filters */}
              {(filterCategory !== "all" || filterBrand !== "all" || filterActive !== "all") && (
                <button
                  onClick={() => { setFilterCategory("all"); setFilterBrand("all"); setFilterActive("all"); }}
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
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
                      <SortHeader label="SKU" sortKey="sku" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Brand" sortKey="brand" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Category</th>
                      <th className="px-5 py-3 font-medium">Compatibility</th>
                      <SortHeader label="Unit Price" sortKey="unitPrice" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            icon="⚙"
                            title="No parts found"
                            description="Try adjusting your search or filters, or add a new part."
                            action={{ label: "+ Add Part", onClick: () => { setAddForm(emptyForm); setFormErrors({}); setAddOpen(true); } }}
                          />
                        </td>
                      </tr>
                    ) : filtered.map((part) => (
                      <tr
                        key={part.id}
                        onClick={() => openDetailPanel(part)}
                        className={`cursor-pointer transition-colors ${selected?.id === part.id ? "bg-blue-900/30" : "hover:bg-gray-800/50"}`}
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded-lg">{part.sku}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-[#F9FAFB]">{part.name}</span>
                          {part.oemNumber && <p className="text-xs text-gray-500 mt-0.5">OEM: {part.oemNumber}</p>}
                        </td>
                        <td className="px-5 py-3.5 text-[#9CA3AF]">{part.brand ?? "—"}</td>
                        <td className="px-5 py-3.5 text-[#9CA3AF]">{part.categoryId ? categoryMap[part.categoryId] ?? "—" : "—"}</td>
                        <td className="px-5 py-3.5 text-[#9CA3AF] text-xs">
                          {part.compatMake ? `${part.compatMake} ${part.compatModel ?? ""} ${part.compatYearFrom ? `(${part.compatYearFrom}–${part.compatYearTo ?? "..."})` : ""}`.trim() : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-[#F9FAFB] font-medium">{part.unitPrice ?? "—"}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${part.isActive !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {part.isActive !== false ? "Active" : "Inactive"}
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
      {currentPart && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#111827] border-l border-[#1F2937] shadow-2xl shadow-black/40 z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
            <h3 className="font-semibold text-[#F9FAFB]">Part Details</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(currentPart)} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-900/20">Edit</button>
              {isAdmin && (
                <button onClick={async () => { setDepsLoading(true); setPartDeps(null); const deps = await dbCheckPartDependencies(currentPart.id); setPartDeps(deps); setDepsLoading(false); setDeleteConfirm(true); }} className="text-xs text-red-400 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
              )}
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          {/* Part header */}
          <div className="px-6 py-5 border-b border-[#1F2937]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                ⚙
              </div>
              <div>
                <p className="text-lg font-semibold text-[#F9FAFB]">{currentPart.name}</p>
                <span className="font-mono text-xs text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded-lg">{currentPart.sku}</span>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${currentPart.isActive !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {currentPart.isActive !== false ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Detail fields */}
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            {/* Identity */}
            {[
              { label: "SKU", value: currentPart.sku, icon: "#" },
              { label: "OEM Number", value: currentPart.oemNumber, icon: "🏭" },
              { label: "Brand", value: currentPart.brand, icon: "🏷" },
              { label: "Category", value: currentPart.categoryId ? categoryMap[currentPart.categoryId] : undefined, icon: "📁" },
            ].map(({ label, value, icon }) => value ? (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-300"><span>{icon}</span><span>{value}</span></div>
              </div>
            ) : null)}

            {currentPart.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Description</p>
                <p className="text-sm text-gray-300">{currentPart.description}</p>
              </div>
            )}

            {/* Compatibility */}
            {(currentPart.compatMake || currentPart.compatModel) && (
              <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-1.5">Compatible Vehicles</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {currentPart.compatMake && <div><span className="text-indigo-400">Make:</span> <span className="text-indigo-200 font-medium">{currentPart.compatMake}</span></div>}
                  {currentPart.compatModel && <div><span className="text-indigo-400">Model:</span> <span className="text-indigo-200 font-medium">{currentPart.compatModel}</span></div>}
                  {currentPart.compatYearFrom && <div><span className="text-indigo-400">From:</span> <span className="text-indigo-200 font-medium">{currentPart.compatYearFrom}</span></div>}
                  {currentPart.compatYearTo && <div><span className="text-indigo-400">To:</span> <span className="text-indigo-200 font-medium">{currentPart.compatYearTo}</span></div>}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-1.5">Pricing</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-emerald-400">Unit Price:</span> <span className="text-emerald-200 font-medium">{currentPart.unitPrice ?? "—"}</span></div>
                <div><span className="text-emerald-400">Cost Price:</span> <span className="text-emerald-200 font-medium">{currentPart.costPrice ?? "—"}</span></div>
              </div>
            </div>

            {/* Physical */}
            {(currentPart.weight || currentPart.dimensions) && (
              <div className="bg-amber-900/20 border border-amber-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1.5">Physical</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {currentPart.weight && <div><span className="text-amber-400">Weight:</span> <span className="text-amber-200 font-medium">{currentPart.weight}</span></div>}
                  {currentPart.dimensions && <div><span className="text-amber-400">Dimensions:</span> <span className="text-amber-200 font-medium">{currentPart.dimensions}</span></div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Part Modal ────────────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Part" onClose={() => { setAddOpen(false); setFormErrors({}); }}>
          <PartFormFields form={addForm} setForm={setAddForm} />
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => { setAddOpen(false); setFormErrors({}); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={handleAddPart} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Add Part</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Part Modal ───────────────────────────────────────────────── */}
      {editOpen && (
        <Modal title="Edit Part" onClose={() => setEditOpen(false)}>
          <PartFormFields form={editForm} setForm={setEditForm} />
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {deleteConfirm && currentPart && (
        <Modal title="Delete Part" onClose={() => { setDeleteConfirm(false); setPartDeps(null); }}>
          <div className="space-y-4">
            {depsLoading ? (
              <p className="text-sm text-gray-400">Checking linked records...</p>
            ) : partDeps && (partDeps.inventoryCount > 0 || partDeps.orderLineCount > 0 || partDeps.supplierPartCount > 0) ? (
              <>
                <p className="text-sm text-red-400 font-medium">This part cannot be deleted because it has linked records:</p>
                <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
                  {partDeps.inventoryCount > 0 && <li><strong>{partDeps.inventoryCount}</strong> inventory record{partDeps.inventoryCount > 1 ? "s" : ""}</li>}
                  {partDeps.orderLineCount > 0 && <li><strong>{partDeps.orderLineCount}</strong> order line{partDeps.orderLineCount > 1 ? "s" : ""}</li>}
                  {partDeps.supplierPartCount > 0 && <li><strong>{partDeps.supplierPartCount}</strong> supplier link{partDeps.supplierPartCount > 1 ? "s" : ""}</li>}
                </ul>
                <p className="text-xs text-gray-500">Remove all linked inventory, order lines, and supplier links before deleting this part.</p>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => { setDeleteConfirm(false); setPartDeps(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Close</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{currentPart.name}</strong> ({currentPart.sku})? This action cannot be undone.</p>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => { setDeleteConfirm(false); setPartDeps(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
                  <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete Part</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Add Category Modal ────────────────────────────────────────────── */}
      {catOpen && (
        <Modal title="Add Category" onClose={() => setCatOpen(false)}>
          <div className="space-y-4">
            <LabeledInput label="Category Name *" value={catForm.name} onChange={(v) => setCatForm({ ...catForm, name: v })} placeholder="e.g. Brake Systems" />
            <LabeledInput label="Description" value={catForm.description} onChange={(v) => setCatForm({ ...catForm, description: v })} placeholder="Optional description" />
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setCatOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAddCategory} disabled={!catForm.name.trim()} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">Add Category</button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <ImportModal
          config={partImportConfig({
            existing: parts,
            onAdd: async (record) => {
              const created = await dbCreatePart(record);
              setParts((prev) => [created, ...prev]);
              return created;
            },
            onUpdate: async (id, updates) => {
              const updated = await dbUpdatePart(id, updates);
              setParts((prev) => prev.map((p) => (p.id === id ? updated : p)));
              return updated;
            },
          })}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
