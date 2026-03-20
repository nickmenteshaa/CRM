"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import type { InventoryItem, Part, Warehouse, SupplierPart, Supplier } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetSparePartsData,
  dbCreateInventory,
  dbUpdateInventory,
  dbDeleteInventory,
  dbCreateWarehouse,
} from "@/lib/actions-spare-parts";

// ── Helpers ─────────────────────────────────────────────────────────────────

function availableQty(item: InventoryItem): number {
  return item.quantityOnHand - item.quantityReserved;
}

type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";

function stockStatus(item: InventoryItem): StockStatus {
  const avail = availableQty(item);
  if (avail <= 0) return "Out of Stock";
  if (item.reorderPoint > 0 && item.quantityOnHand <= item.reorderPoint) return "Low Stock";
  return "In Stock";
}

const stockBadge: Record<StockStatus, string> = {
  "In Stock": "bg-green-100 text-green-700",
  "Low Stock": "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-red-100 text-red-700",
};

// ── Reusable form inputs ────────────────────────────────────────────────────

function LabeledInput({ label, value, onChange, placeholder, type = "text", disabled = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        disabled={disabled}
        className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

type SortKey = "partName" | "sku" | "quantityOnHand" | "available" | "reorderPoint";
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

// ── Enriched inventory row ──────────────────────────────────────────────────

type EnrichedRow = InventoryItem & {
  partName: string;
  sku: string;
  warehouseName: string;
  available: number;
  status: StockStatus;
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { isAdmin } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [supplierParts, setSupplierParts] = useState<SupplierPart[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loaded, setLoaded] = useState(false);

  // UI
  const [selected, setSelected] = useState<EnrichedRow | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filters
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "In Stock" | "Low Stock" | "Out of Stock">("all");
  const [filterLowOnly, setFilterLowOnly] = useState(false);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);

  // Forms
  const [addForm, setAddForm] = useState({ partId: "", warehouseId: "", quantityOnHand: "", quantityReserved: "0", reorderPoint: "", binLocation: "" });
  const [editForm, setEditForm] = useState({ id: "", quantityOnHand: "", quantityReserved: "", reorderPoint: "", binLocation: "" });
  const [whForm, setWhForm] = useState({ name: "", address: "", city: "", country: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Load ───────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const data = await dbGetSparePartsData();
    setInventory(data.inventory);
    setParts(data.parts);
    setWarehouses(data.warehouses);
    setSupplierParts(data.supplierParts);
    setSuppliers(data.suppliers);
    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Lookup maps ────────────────────────────────────────────────────────

  const partMap = useMemo(() => {
    const m: Record<string, Part> = {};
    for (const p of parts) m[p.id] = p;
    return m;
  }, [parts]);

  const warehouseMap = useMemo(() => {
    const m: Record<string, Warehouse> = {};
    for (const w of warehouses) m[w.id] = w;
    return m;
  }, [warehouses]);

  const supplierMap = useMemo(() => {
    const m: Record<string, Supplier> = {};
    for (const s of suppliers) m[s.id] = s;
    return m;
  }, [suppliers]);

  // Suppliers for a given part
  function suppliersForPart(partId: string) {
    return supplierParts
      .filter((sp) => sp.partId === partId)
      .map((sp) => ({ ...sp, supplier: supplierMap[sp.supplierId] }))
      .filter((sp) => sp.supplier);
  }

  // ── Enriched rows ─────────────────────────────────────────────────────

  const enriched: EnrichedRow[] = useMemo(() => {
    return inventory.map((item) => {
      const part = partMap[item.partId];
      const wh = warehouseMap[item.warehouseId];
      return {
        ...item,
        partName: part?.name ?? "Unknown Part",
        sku: part?.sku ?? "—",
        warehouseName: wh?.name ?? "Unknown",
        available: availableQty(item),
        status: stockStatus(item),
      };
    });
  }, [inventory, partMap, warehouseMap]);

  // ── Search + Filter + Sort ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...enriched];

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((r) =>
        r.partName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.warehouseName.toLowerCase().includes(q)
      );
    }

    if (filterWarehouse !== "all") {
      result = result.filter((r) => r.warehouseId === filterWarehouse);
    }
    if (filterStatus !== "all") {
      result = result.filter((r) => r.status === filterStatus);
    }
    if (filterLowOnly) {
      result = result.filter((r) => r.status === "Low Stock" || r.status === "Out of Stock");
    }

    if (sortKey) {
      result.sort((a, b) => {
        let av: string | number;
        let bv: string | number;
        if (sortKey === "partName" || sortKey === "sku") {
          av = a[sortKey].toLowerCase();
          bv = b[sortKey].toLowerCase();
        } else {
          av = a[sortKey];
          bv = b[sortKey];
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [enriched, query, filterWarehouse, filterStatus, filterLowOnly, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── KPI counts ─────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total = enriched.length;
    const low = enriched.filter((r) => r.status === "Low Stock").length;
    const out = enriched.filter((r) => r.status === "Out of Stock").length;
    const totalOnHand = enriched.reduce((sum, r) => sum + r.quantityOnHand, 0);
    return { total, low, out, totalOnHand };
  }, [enriched]);

  // ── CRUD ───────────────────────────────────────────────────────────────

  async function handleAdd() {
    const errors: Record<string, string> = {};
    if (!addForm.partId) errors.partId = "Select a part";
    if (!addForm.warehouseId) errors.warehouseId = "Select a warehouse";
    if (!addForm.quantityOnHand) errors.quantityOnHand = "Required";
    // Check duplicate part+warehouse
    if (addForm.partId && addForm.warehouseId) {
      const exists = inventory.some((i) => i.partId === addForm.partId && i.warehouseId === addForm.warehouseId);
      if (exists) errors.partId = "This part already has an inventory record in this warehouse";
    }
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});

    const created = await dbCreateInventory({
      partId: addForm.partId,
      warehouseId: addForm.warehouseId,
      quantityOnHand: Number(addForm.quantityOnHand) || 0,
      quantityReserved: Number(addForm.quantityReserved) || 0,
      reorderPoint: Number(addForm.reorderPoint) || 0,
      binLocation: addForm.binLocation || undefined,
    });
    setInventory((prev) => [...prev, created]);
    setAddForm({ partId: "", warehouseId: "", quantityOnHand: "", quantityReserved: "0", reorderPoint: "", binLocation: "" });
    setAddOpen(false);
  }

  function openEdit(row: EnrichedRow) {
    setEditForm({
      id: row.id,
      quantityOnHand: row.quantityOnHand.toString(),
      quantityReserved: row.quantityReserved.toString(),
      reorderPoint: row.reorderPoint.toString(),
      binLocation: row.binLocation ?? "",
    });
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editForm.id) return;
    const updated = await dbUpdateInventory(editForm.id, {
      quantityOnHand: Number(editForm.quantityOnHand) || 0,
      quantityReserved: Number(editForm.quantityReserved) || 0,
      reorderPoint: Number(editForm.reorderPoint) || 0,
      binLocation: editForm.binLocation || undefined,
    });
    setInventory((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    if (selected?.id === updated.id) {
      // Re-enrich after state update happens via enriched memo
    }
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!selected) return;
    await dbDeleteInventory(selected.id);
    setInventory((prev) => prev.filter((i) => i.id !== selected.id));
    setSelected(null);
    setDeleteConfirm(false);
  }

  // ── Warehouse creation ─────────────────────────────────────────────────

  async function handleAddWarehouse() {
    if (!whForm.name.trim()) return;
    const created = await dbCreateWarehouse({
      name: whForm.name.trim(),
      address: whForm.address || undefined,
      city: whForm.city || undefined,
      country: whForm.country || undefined,
      isActive: true,
    });
    setWarehouses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setWhForm({ name: "", address: "", city: "", country: "" });
    setWarehouseOpen(false);
  }

  // ── Detail ─────────────────────────────────────────────────────────────

  // Keep detail in sync with enriched data
  const currentRow = useMemo(() => {
    if (!selected) return null;
    return enriched.find((r) => r.id === selected.id) ?? null;
  }, [selected, enriched]);

  function openDetailPanel(row: EnrichedRow) {
    setSelected(row.id === selected?.id ? null : row);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${currentRow ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#F9FAFB]">Inventory</h2>
                <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} of {enriched.length} records</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setWarehouseOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
                  + Warehouse
                </button>
                <button onClick={() => { setAddForm({ partId: "", warehouseId: "", quantityOnHand: "", quantityReserved: "0", reorderPoint: "", binLocation: "" }); setFormErrors({}); setAddOpen(true); }} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">
                  + Add Inventory
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
                <p className="text-xs text-[#9CA3AF] uppercase tracking-wide">Total Records</p>
                <p className="text-xl font-bold text-[#F9FAFB] mt-1">{kpis.total}</p>
              </div>
              <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
                <p className="text-xs text-[#9CA3AF] uppercase tracking-wide">Total On Hand</p>
                <p className="text-xl font-bold text-[#F9FAFB] mt-1">{kpis.totalOnHand.toLocaleString()}</p>
              </div>
              <div className={`border rounded-xl px-4 py-3 ${kpis.low > 0 ? "bg-amber-900/20 border-amber-800" : "bg-[#111827] border-[#1F2937]"}`}>
                <p className={`text-xs uppercase tracking-wide ${kpis.low > 0 ? "text-amber-400" : "text-[#9CA3AF]"}`}>Low Stock</p>
                <p className={`text-xl font-bold mt-1 ${kpis.low > 0 ? "text-amber-300" : "text-[#F9FAFB]"}`}>{kpis.low}</p>
              </div>
              <div className={`border rounded-xl px-4 py-3 ${kpis.out > 0 ? "bg-red-900/20 border-red-800" : "bg-[#111827] border-[#1F2937]"}`}>
                <p className={`text-xs uppercase tracking-wide ${kpis.out > 0 ? "text-red-400" : "text-[#9CA3AF]"}`}>Out of Stock</p>
                <p className={`text-xl font-bold mt-1 ${kpis.out > 0 ? "text-red-300" : "text-[#F9FAFB]"}`}>{kpis.out}</p>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 mb-5">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
                <input
                  className="w-full border border-[#1F2937] bg-[#0F172A] rounded-lg pl-8 pr-8 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                  placeholder="Search by part name, SKU, or warehouse..."
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
              <select value={filterWarehouse} onChange={(e) => setFilterWarehouse(e.target.value)} className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Warehouses</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>

              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="text-sm border border-[#1F2937] bg-[#111827] text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Status</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer border border-[#1F2937] bg-[#111827] rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={filterLowOnly}
                  onChange={(e) => setFilterLowOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500"
                />
                Low/Out only
              </label>

              {(filterWarehouse !== "all" || filterStatus !== "all" || filterLowOnly) && (
                <button onClick={() => { setFilterWarehouse("all"); setFilterStatus("all"); setFilterLowOnly(false); }} className="text-xs text-blue-400 hover:text-blue-300 hover:underline">
                  Clear filters
                </button>
              )}
            </div>

            {/* Table */}
            <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
                    <tr className="text-left text-[#9CA3AF]">
                      <SortHeader label="Part Name" sortKey="partName" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <SortHeader label="SKU" sortKey="sku" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Warehouse</th>
                      <SortHeader label="On Hand" sortKey="quantityOnHand" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Reserved</th>
                      <SortHeader label="Available" sortKey="available" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Reorder Pt" sortKey="reorderPoint" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState
                            icon="📦"
                            title="No inventory records found"
                            description="Try adjusting your search or filters, or add a new inventory record."
                            action={{ label: "+ Add Inventory", onClick: () => { setFormErrors({}); setAddOpen(true); } }}
                          />
                        </td>
                      </tr>
                    ) : filtered.map((row) => {
                      const isLow = row.status === "Low Stock";
                      const isOut = row.status === "Out of Stock";
                      return (
                        <tr
                          key={row.id}
                          onClick={() => openDetailPanel(row)}
                          className={`cursor-pointer transition-colors ${
                            selected?.id === row.id ? "bg-blue-900/30" :
                            isOut ? "bg-red-900/10 hover:bg-red-900/20" :
                            isLow ? "bg-amber-900/10 hover:bg-amber-900/20" :
                            "hover:bg-gray-800/50"
                          }`}
                        >
                          <td className="px-5 py-3.5 font-medium text-[#F9FAFB]">{row.partName}</td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded-lg">{row.sku}</span>
                          </td>
                          <td className="px-5 py-3.5 text-[#9CA3AF]">{row.warehouseName}</td>
                          <td className={`px-5 py-3.5 font-medium ${isOut ? "text-red-400" : isLow ? "text-amber-400" : "text-[#F9FAFB]"}`}>{row.quantityOnHand}</td>
                          <td className="px-5 py-3.5 text-[#9CA3AF]">{row.quantityReserved}</td>
                          <td className={`px-5 py-3.5 font-medium ${row.available <= 0 ? "text-red-400" : isLow ? "text-amber-400" : "text-[#F9FAFB]"}`}>{row.available}</td>
                          <td className="px-5 py-3.5 text-[#9CA3AF]">{row.reorderPoint}</td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stockBadge[row.status]}`}>{row.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Detail Panel ──────────────────────────────────────────────────── */}
      {currentRow && (() => {
        const part = partMap[currentRow.partId];
        const wh = warehouseMap[currentRow.warehouseId];
        const partSuppliers = suppliersForPart(currentRow.partId);
        return (
          <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#111827] border-l border-[#1F2937] shadow-2xl shadow-black/40 z-40 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
              <h3 className="font-semibold text-[#F9FAFB]">Inventory Details</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(currentRow)} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-900/20">Edit</button>
                {isAdmin && (
                  <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-400 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
                )}
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
              </div>
            </div>

            {/* Header */}
            <div className="px-6 py-5 border-b border-[#1F2937]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  📦
                </div>
                <div>
                  <p className="text-lg font-semibold text-[#F9FAFB]">{currentRow.partName}</p>
                  <span className="font-mono text-xs text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded-lg">{currentRow.sku}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stockBadge[currentRow.status]}`}>{currentRow.status}</span>
            </div>

            <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
              {/* Stock Quantities */}
              <div className={`border rounded-xl px-3 py-2.5 ${
                currentRow.status === "Out of Stock" ? "bg-red-900/20 border-red-800" :
                currentRow.status === "Low Stock" ? "bg-amber-900/20 border-amber-800" :
                "bg-emerald-900/20 border-emerald-800"
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${
                  currentRow.status === "Out of Stock" ? "text-red-300" :
                  currentRow.status === "Low Stock" ? "text-amber-300" :
                  "text-emerald-300"
                }`}>Stock Quantities</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className={`text-lg font-bold ${
                      currentRow.status === "Out of Stock" ? "text-red-200" :
                      currentRow.status === "Low Stock" ? "text-amber-200" :
                      "text-emerald-200"
                    }`}>{currentRow.quantityOnHand}</p>
                    <p className="text-[10px] text-gray-400 uppercase">On Hand</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-300">{currentRow.quantityReserved}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Reserved</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${currentRow.available <= 0 ? "text-red-300" : "text-[#F9FAFB]"}`}>{currentRow.available}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Available</p>
                  </div>
                </div>
              </div>

              {/* Reorder info */}
              <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-1.5">Reorder Info</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-indigo-400">Reorder Point:</span> <span className="text-indigo-200 font-medium">{currentRow.reorderPoint}</span></div>
                  <div><span className="text-indigo-400">Bin Location:</span> <span className="text-indigo-200 font-medium">{currentRow.binLocation ?? "—"}</span></div>
                  {currentRow.reorderPoint > 0 && currentRow.quantityOnHand <= currentRow.reorderPoint && (
                    <div className="col-span-2 mt-1 text-amber-400 font-medium">⚠ Below reorder point — restock recommended</div>
                  )}
                </div>
              </div>

              {/* Warehouse */}
              {wh && (
                <div className="bg-teal-900/20 border border-teal-800 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-teal-300 uppercase tracking-wide mb-1.5">Warehouse</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-teal-400">Name:</span> <span className="text-teal-200 font-medium">{wh.name}</span></div>
                    {wh.city && <div><span className="text-teal-400">City:</span> <span className="text-teal-200 font-medium">{wh.city}</span></div>}
                    {wh.country && <div><span className="text-teal-400">Country:</span> <span className="text-teal-200 font-medium">{wh.country}</span></div>}
                    {wh.address && <div className="col-span-2"><span className="text-teal-400">Address:</span> <span className="text-teal-200 font-medium">{wh.address}</span></div>}
                  </div>
                </div>
              )}

              {/* Part info */}
              {part && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Part Details</p>
                  <div className="bg-[#0B0F14] rounded-xl px-3 py-2.5 text-xs space-y-1">
                    {part.brand && <div className="text-gray-400">Brand: <span className="text-gray-200">{part.brand}</span></div>}
                    {part.oemNumber && <div className="text-gray-400">OEM: <span className="text-gray-200">{part.oemNumber}</span></div>}
                    {part.unitPrice && <div className="text-gray-400">Unit Price: <span className="text-gray-200">{part.unitPrice}</span></div>}
                    {part.costPrice && <div className="text-gray-400">Cost Price: <span className="text-gray-200">{part.costPrice}</span></div>}
                    {part.compatMake && <div className="text-gray-400">Compatibility: <span className="text-gray-200">{part.compatMake} {part.compatModel ?? ""} {part.compatYearFrom ? `(${part.compatYearFrom}–${part.compatYearTo ?? "..."})` : ""}</span></div>}
                  </div>
                </div>
              )}

              {/* Supplier info */}
              {partSuppliers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Suppliers ({partSuppliers.length})</p>
                  <ul className="space-y-2">
                    {partSuppliers.map((sp) => (
                      <li key={sp.id} className="bg-[#0B0F14] rounded-xl px-3 py-2.5 text-xs">
                        <div className="font-medium text-[#F9FAFB] mb-1">{sp.supplier?.name ?? "Unknown"}</div>
                        <div className="grid grid-cols-2 gap-1 text-gray-400">
                          <div>Cost: <span className="text-gray-200">{sp.costPrice ?? "—"}</span></div>
                          <div>Lead: <span className="text-gray-200">{sp.leadTimeDays != null ? `${sp.leadTimeDays}d` : "—"}</span></div>
                          <div>MOQ: <span className="text-gray-200">{sp.moq ?? "—"}</span></div>
                          {sp.supplier?.country && <div>Country: <span className="text-gray-200">{sp.supplier.country}</span></div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Add Inventory Modal ───────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Inventory Record" onClose={() => { setAddOpen(false); setFormErrors({}); }}>
          <div className="space-y-4">
            <div>
              <LabeledSelect
                label="Part *"
                value={addForm.partId}
                onChange={(v) => { setAddForm({ ...addForm, partId: v }); setFormErrors((e) => { const { partId: _, ...rest } = e; return rest; }); }}
                options={[{ value: "", label: "— Select a part —" }, ...parts.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }))]}
              />
              {formErrors.partId && <p className="text-xs text-red-500 mt-1">{formErrors.partId}</p>}
            </div>
            <div>
              <LabeledSelect
                label="Warehouse *"
                value={addForm.warehouseId}
                onChange={(v) => { setAddForm({ ...addForm, warehouseId: v }); setFormErrors((e) => { const { warehouseId: _, ...rest } = e; return rest; }); }}
                options={[{ value: "", label: "— Select a warehouse —" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
              />
              {formErrors.warehouseId && <p className="text-xs text-red-500 mt-1">{formErrors.warehouseId}</p>}
              {warehouses.length === 0 && (
                <button onClick={() => setWarehouseOpen(true)} className="text-xs text-blue-400 hover:underline mt-1">Create a warehouse first</button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <LabeledInput label="Qty On Hand *" value={addForm.quantityOnHand} onChange={(v) => { setAddForm({ ...addForm, quantityOnHand: v }); setFormErrors((e) => { const { quantityOnHand: _, ...rest } = e; return rest; }); }} placeholder="e.g. 100" type="number" />
                {formErrors.quantityOnHand && <p className="text-xs text-red-500 mt-1">{formErrors.quantityOnHand}</p>}
              </div>
              <LabeledInput label="Qty Reserved" value={addForm.quantityReserved} onChange={(v) => setAddForm({ ...addForm, quantityReserved: v })} placeholder="0" type="number" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Reorder Point" value={addForm.reorderPoint} onChange={(v) => setAddForm({ ...addForm, reorderPoint: v })} placeholder="e.g. 20" type="number" />
              <LabeledInput label="Bin Location" value={addForm.binLocation} onChange={(v) => setAddForm({ ...addForm, binLocation: v })} placeholder="e.g. A-12-3" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setAddOpen(false); setFormErrors({}); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAdd} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Add Record</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Inventory Modal ──────────────────────────────────────────── */}
      {editOpen && (
        <Modal title="Edit Inventory Record" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Editing stock for <strong>{selected?.partName}</strong> in <strong>{selected?.warehouseName}</strong></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Qty On Hand" value={editForm.quantityOnHand} onChange={(v) => setEditForm({ ...editForm, quantityOnHand: v })} type="number" />
              <LabeledInput label="Qty Reserved" value={editForm.quantityReserved} onChange={(v) => setEditForm({ ...editForm, quantityReserved: v })} type="number" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="Reorder Point" value={editForm.reorderPoint} onChange={(v) => setEditForm({ ...editForm, reorderPoint: v })} type="number" />
              <LabeledInput label="Bin Location" value={editForm.binLocation} onChange={(v) => setEditForm({ ...editForm, binLocation: v })} placeholder="e.g. A-12-3" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {deleteConfirm && currentRow && (
        <Modal title="Delete Inventory Record" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete the inventory record for <strong>{currentRow.partName}</strong> in <strong>{currentRow.warehouseName}</strong>? This action cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete Record</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Warehouse Modal ───────────────────────────────────────────── */}
      {warehouseOpen && (
        <Modal title="Add Warehouse" onClose={() => setWarehouseOpen(false)}>
          <div className="space-y-4">
            <LabeledInput label="Warehouse Name *" value={whForm.name} onChange={(v) => setWhForm({ ...whForm, name: v })} placeholder="e.g. Main Warehouse" />
            <LabeledInput label="Address" value={whForm.address} onChange={(v) => setWhForm({ ...whForm, address: v })} placeholder="123 Industrial Ave" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <LabeledInput label="City" value={whForm.city} onChange={(v) => setWhForm({ ...whForm, city: v })} placeholder="e.g. Berlin" />
              <LabeledInput label="Country" value={whForm.country} onChange={(v) => setWhForm({ ...whForm, country: v })} placeholder="e.g. Germany" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setWarehouseOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAddWarehouse} disabled={!whForm.name.trim()} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">Add Warehouse</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
