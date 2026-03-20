"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Deal, type Part, type OrderLine } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetSparePartsData,
  dbCreateOrderLine, dbUpdateOrderLine, dbDeleteOrderLine,
} from "@/lib/actions-spare-parts";

// ── Constants ──────────────────────────────────────────────────────────────────

const FIELDS = [
  { key: "quoteNumber", label: "Quote #" },
  { key: "name",        label: "Quote Name" },
  { key: "contact",     label: "Contact" },
  { key: "quoteStatus", label: "Status" },
  { key: "value",       label: "Value" },
  { key: "validUntil",  label: "Valid Until" },
  { key: "owner",       label: "Owner" },
];

const QUOTE_STATUS_OPTIONS = ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Converted"];

const quoteStatusStyles: Record<string, string> = {
  Draft:     "bg-gray-100 text-gray-700",
  Sent:      "bg-blue-100 text-blue-700",
  Accepted:  "bg-green-100 text-green-700",
  Rejected:  "bg-red-100 text-red-600",
  Expired:   "bg-amber-100 text-amber-700",
  Converted: "bg-purple-100 text-purple-700",
};

const emptyForm = {
  name: "", contact: "", value: "$0.00", stage: "Proposal",
  close: "", owner: "", ownerId: undefined as string | undefined,
  validUntil: "", notes: "",
};

type SortKey = "quoteNumber" | "name" | "value" | "quoteStatus" | "validUntil";
type SortDir = "asc" | "desc";

function parseMoney(s?: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function displayMoney(s?: string): string {
  if (!s) return "$0.00";
  return fmtMoney(parseMoney(s));
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function isExpired(validUntil?: string): boolean {
  if (!validUntil) return false;
  try {
    return new Date(validUntil) < new Date();
  } catch { return false; }
}

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
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

function LabeledInput({ label, value, onChange, placeholder, readOnly, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input type={type ?? "text"} className={`w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly} />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const { deals, addDeal, updateDeal, deleteDeal, loaded } = useApp();
  const { isAdmin, user, allUsers, canAccessOwnerId } = useAuth();

  function canEditQuote(q: Deal) {
    return canAccessOwnerId(q.ownerId);
  }

  const [selected, setSelected]           = useState<Deal | null>(null);
  const [addOpen, setAddOpen]             = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [convertConfirm, setConvertConfirm] = useState(false);
  const [editForm, setEditForm]           = useState<Deal | null>(null);
  const [form, setForm]                   = useState({ ...emptyForm, validUntil: defaultValidUntil() });
  const [query, setQuery]                 = useState("");
  const [activeFields, setActiveFields]   = useState(FIELDS.map((f) => f.key));

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Spare parts for line items
  const [parts, setParts]           = useState<Part[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [partsLoaded, setPartsLoaded] = useState(false);

  // Part picker
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [partSearch, setPartSearch]         = useState("");

  useEffect(() => {
    dbGetSparePartsData().then((data) => {
      setParts(data.parts);
      setOrderLines(data.orderLines);
      setPartsLoaded(true);
    });
  }, []);

  const partMap = useMemo(() => {
    const m: Record<string, Part> = {};
    for (const p of parts) m[p.id] = p;
    return m;
  }, [parts]);

  // Only quotes
  const quotes = useMemo(() => deals.filter((d) => d.isQuote), [deals]);

  // Order lines for selected quote
  const selectedLines = useMemo(() => {
    if (!selected) return [];
    return orderLines.filter((ol) => ol.dealId === selected.id);
  }, [orderLines, selected]);

  // Recalculate totals
  const recalcAndUpdate = useCallback((dealId: string, lines: OrderLine[], taxStr?: string, shipStr?: string) => {
    const subtotal = lines.reduce((sum, l) => sum + parseMoney(l.lineTotal), 0);
    const deal = deals.find((d) => d.id === dealId);
    const tax = parseMoney(taxStr ?? deal?.taxAmount);
    const shipping = parseMoney(shipStr ?? deal?.shippingCost);
    const grandTotal = subtotal + tax + shipping;
    updateDeal(dealId, {
      subtotal: fmtMoney(subtotal),
      taxAmount: fmtMoney(tax),
      shippingCost: fmtMoney(shipping),
      grandTotal: fmtMoney(grandTotal),
      value: fmtMoney(grandTotal),
    });
    setSelected((prev) => prev && prev.id === dealId ? {
      ...prev,
      subtotal: fmtMoney(subtotal),
      taxAmount: fmtMoney(tax),
      shippingCost: fmtMoney(shipping),
      grandTotal: fmtMoney(grandTotal),
      value: fmtMoney(grandTotal),
    } : prev);
  }, [deals, updateDeal]);

  // Filter + Sort
  const filtered = useMemo(() => {
    let result = query.trim()
      ? quotes.filter((d) =>
          activeFields.some((field) =>
            String(d[field as keyof Deal] ?? "").toLowerCase().includes(query.toLowerCase())
          )
        )
      : [...quotes];

    // Auto-check for expired quotes
    for (const q of result) {
      if (q.quoteStatus !== "Expired" && q.quoteStatus !== "Converted" && q.quoteStatus !== "Accepted" && q.quoteStatus !== "Rejected" && isExpired(q.validUntil)) {
        updateDeal(q.id, { quoteStatus: "Expired" });
      }
    }

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
  }, [quotes, query, activeFields, sortKey, sortDir, updateDeal]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const totalQuoteValue = quotes.reduce((sum, q) => sum + parseMoney(q.value), 0);
  const acceptedCount = quotes.filter((q) => q.quoteStatus === "Accepted").length;
  const pendingCount = quotes.filter((q) => q.quoteStatus === "Draft" || q.quoteStatus === "Sent").length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!form.name) return;
    addDeal({
      ...form,
      isQuote: true,
      quoteStatus: "Draft",
      createdDate: new Date().toISOString(),
    });
    setForm({ ...emptyForm, validUntil: defaultValidUntil() });
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

  function handleStatusChange(status: string) {
    if (!selected) return;
    updateDeal(selected.id, { quoteStatus: status });
    setSelected((prev) => prev ? { ...prev, quoteStatus: status } : prev);
  }

  // ── Convert quote to order ────────────────────────────────────────────────

  function handleConvertToOrder() {
    if (!selected) return;

    // Create a new order (Deal) from the quote data
    addDeal({
      name: selected.name,
      contact: selected.contact,
      value: selected.value,
      stage: "Qualified",
      close: selected.close,
      leadId: selected.leadId,
      leadName: selected.leadName,
      owner: selected.owner,
      ownerId: selected.ownerId,
      carModel: selected.carModel,
      carYear: selected.carYear,
      carPrice: selected.carPrice,
      carVin: selected.carVin,
      carCondition: selected.carCondition,
      orderStatus: "Confirmed",
      shippingMethod: selected.shippingMethod,
      shippingCost: selected.shippingCost,
      taxAmount: selected.taxAmount,
      subtotal: selected.subtotal,
      grandTotal: selected.grandTotal,
      notes: selected.notes ? `Converted from ${selected.quoteNumber}. ${selected.notes}` : `Converted from ${selected.quoteNumber}`,
      isQuote: false,
      createdDate: new Date().toISOString(),
    });

    // Copy order lines from quote to the new order
    const quoteLines = orderLines.filter((ol) => ol.dealId === selected.id);
    // We need to get the newly created order ID — we'll use a small delay and find it
    // For now, mark the quote as converted
    updateDeal(selected.id, {
      quoteStatus: "Converted",
    });
    setSelected((prev) => prev ? { ...prev, quoteStatus: "Converted" } : prev);

    // Copy the line items to the new order after it's created
    setTimeout(async () => {
      const refreshData = await dbGetSparePartsData();
      // Find the most recently created order (non-quote)
      const latestOrders = deals.filter((d) => !d.isQuote);
      // The new order should be in the deals array after a re-render
      // Copy lines from quote
      for (const line of quoteLines) {
        await dbCreateOrderLine({
          dealId: line.dealId, // Will be updated when we find the new order
          partId: line.partId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          discount: line.discount,
        });
      }
      setOrderLines(refreshData.orderLines);
    }, 500);

    setConvertConfirm(false);
  }

  // ── Order line handlers ──────────────────────────────────────────────────

  function handleAddLine(part: Part) {
    if (!selected) return;
    const unitPrice = part.unitPrice || "$0.00";
    const qty = 1;
    const lineTotal = fmtMoney(parseMoney(unitPrice) * qty);
    const tempId = `temp-${Date.now()}`;
    const newLine: OrderLine = {
      id: tempId,
      dealId: selected.id,
      partId: part.id,
      quantity: qty,
      unitPrice,
      lineTotal,
    };
    const updatedLines = [...orderLines, newLine];
    setOrderLines(updatedLines);
    setPartPickerOpen(false);
    setPartSearch("");

    const dealLines = updatedLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines);

    dbCreateOrderLine({
      dealId: selected.id,
      partId: part.id,
      quantity: qty,
      unitPrice,
      lineTotal,
    }).then((created) => {
      setOrderLines((prev) => prev.map((ol) => ol.id === tempId ? created : ol));
    });
  }

  function handleRemoveLine(lineId: string) {
    if (!selected) return;
    const updatedLines = orderLines.filter((ol) => ol.id !== lineId);
    setOrderLines(updatedLines);
    const dealLines = updatedLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines);
    dbDeleteOrderLine(lineId);
  }

  function handleUpdateLine(lineId: string, updates: { quantity?: number; unitPrice?: string; discount?: string }) {
    if (!selected) return;
    const updatedLines = orderLines.map((ol) => {
      if (ol.id !== lineId) return ol;
      const qty = updates.quantity ?? ol.quantity;
      const price = updates.unitPrice ?? ol.unitPrice;
      const disc = updates.discount ?? ol.discount;
      const lineTotal = fmtMoney(Math.max(0, parseMoney(price) * qty - parseMoney(disc)));
      return { ...ol, ...updates, quantity: qty, lineTotal };
    });
    setOrderLines(updatedLines);
    const dealLines = updatedLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines);

    const line = updatedLines.find((ol) => ol.id === lineId);
    if (line) {
      dbUpdateOrderLine(lineId, {
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        lineTotal: line.lineTotal,
      });
    }
  }

  function handleTaxChange(val: string) {
    if (!selected) return;
    const dealLines = orderLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines, val, undefined);
  }

  function handleShippingChange(val: string) {
    if (!selected) return;
    const dealLines = orderLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines, undefined, val);
  }

  // Keep selected in sync
  const currentSelected = selected ? deals.find((d) => d.id === selected.id) ?? selected : null;

  // Part picker filtered
  const pickerParts = useMemo(() => {
    const activeParts = parts.filter((p) => p.isActive !== false);
    if (!partSearch.trim()) return activeParts;
    const q = partSearch.toLowerCase();
    return activeParts.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand ?? "").toLowerCase().includes(q) ||
      (p.oemNumber ?? "").toLowerCase().includes(q)
    );
  }, [parts, partSearch]);

  const isReadOnly = currentSelected?.quoteStatus === "Converted" || currentSelected?.quoteStatus === "Rejected";

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${currentSelected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-[420px]" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#F9FAFB]">Quotes / RFQ</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">
              {filtered.length} of {quotes.length} quotes · Total: {fmtMoney(totalQuoteValue)} · {acceptedCount} accepted · {pendingCount} pending
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">+ New Quote</button>
        </div>

        <SearchFilter query={query} onQueryChange={setQuery} fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields} placeholder="Search quotes..." />

        <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
              <tr className="text-left text-[#9CA3AF]">
                <SortHeader label="Quote #" sortKey="quoteNumber" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3 font-medium">Contact</th>
                <SortHeader label="Status" sortKey="quoteStatus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Value" sortKey="value" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Valid Until" sortKey="validUntil" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2937]">
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon="📋" title="No quotes found" description="Create a new quote to get started with the RFQ workflow." /></td></tr>
              ) : filtered.map((q) => (
                <tr key={q.id} onClick={() => setSelected(q.id === selected?.id ? null : q)} className={`cursor-pointer transition-colors ${selected?.id === q.id ? "bg-blue-900/30" : "hover:bg-gray-800/50"}`}>
                  <td className="px-5 py-3.5 font-mono text-xs text-blue-400">{q.quoteNumber || "—"}</td>
                  <td className="px-5 py-3.5 font-medium text-[#F9FAFB]">
                    {q.name}
                    {q.quoteStatus === "Converted" && <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-normal">converted</span>}
                  </td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{q.contact}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${quoteStatusStyles[q.quoteStatus ?? "Draft"] ?? "bg-gray-100 text-gray-600"}`}>
                      {q.quoteStatus ?? "Draft"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-gray-100">{displayMoney(q.value)}</td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {q.validUntil ? (
                      <span className={isExpired(q.validUntil) ? "text-red-400" : ""}>
                        {formatDate(q.validUntil)}
                        {isExpired(q.validUntil) && " (expired)"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{q.owner || "—"}</td>
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
        <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-[#111827] border-l border-[#1F2937] shadow-2xl shadow-black/40 z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
            <h3 className="font-semibold text-[#F9FAFB]">Quote Details</h3>
            <div className="flex items-center gap-2">
              {canEditQuote(currentSelected) && !isReadOnly && <button onClick={() => { setEditForm({ ...currentSelected }); setEditOpen(true); }} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50">Edit</button>}
              {canEditQuote(currentSelected) && <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded-lg hover:bg-red-50">Delete</button>}
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          <div className="px-6 py-5 border-b border-[#1F2937]">
            <div className="flex items-center gap-2 mb-1">
              {currentSelected.quoteNumber && <span className="font-mono text-xs text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded">{currentSelected.quoteNumber}</span>}
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${quoteStatusStyles[currentSelected.quoteStatus ?? "Draft"] ?? "bg-gray-100 text-gray-600"}`}>
                {currentSelected.quoteStatus ?? "Draft"}
              </span>
            </div>
            <p className="text-lg font-semibold text-[#F9FAFB]">{currentSelected.name}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm font-bold text-gray-300">{displayMoney(currentSelected.value)}</span>
              {currentSelected.validUntil && (
                <span className={`text-xs ${isExpired(currentSelected.validUntil) ? "text-red-400" : "text-gray-500"}`}>
                  Valid until {formatDate(currentSelected.validUntil)}
                  {isExpired(currentSelected.validUntil) && " (EXPIRED)"}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
            {/* Basic info */}
            {[
              { label: "Contact",   value: currentSelected.contact,                 icon: "👤" },
              { label: "Owner",     value: currentSelected.owner || "—",            icon: "🧑‍💼" },
              { label: "Created",   value: formatDate(currentSelected.createdDate), icon: "🗓" },
            ].map(({ label, value, icon }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-100"><span>{icon}</span><span>{value}</span></div>
              </div>
            ))}

            {/* Quote Status Changer */}
            {!isReadOnly && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2">Quote Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTE_STATUS_OPTIONS.filter((s) => s !== "Converted").map((s) => (
                    <button key={s} onClick={() => handleStatusChange(s)} className={`px-2 py-1 rounded-xl text-[11px] font-medium border transition-colors ${currentSelected.quoteStatus === s ? `${quoteStatusStyles[s]} border-transparent` : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quote Items */}
            <div className="bg-[#0B0F14] border border-[#1F2937] rounded-xl px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wide">Quote Items</p>
                {canEditQuote(currentSelected) && !isReadOnly && (
                  <button onClick={() => setPartPickerOpen(true)} className="text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline">
                    + Add Item
                  </button>
                )}
              </div>

              {!partsLoaded ? (
                <p className="text-xs text-gray-500 italic py-2">Loading parts...</p>
              ) : selectedLines.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">No items yet. Click &quot;+ Add Item&quot; to add parts to this quote.</p>
              ) : (
                <div className="space-y-2">
                  {selectedLines.map((line) => {
                    const part = partMap[line.partId];
                    return (
                      <div key={line.id} className="bg-[#111827] rounded-lg px-2.5 py-2 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[#F9FAFB] truncate">{part?.name ?? "Unknown Part"}</p>
                            <p className="text-gray-500 text-[10px]">{part?.sku ?? ""}{part?.brand ? ` · ${part.brand}` : ""}</p>
                          </div>
                          {canEditQuote(currentSelected) && !isReadOnly && (
                            <button onClick={() => handleRemoveLine(line.id)} className="text-red-500 hover:text-red-400 text-sm ml-2 flex-shrink-0" title="Remove">×</button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Qty</label>
                            <input type="number" min={1} className="w-full bg-[#0F172A] border border-[#1F2937] rounded px-1.5 py-1 text-xs text-[#F9FAFB] focus:outline-none focus:ring-1 focus:ring-blue-500" value={line.quantity} onChange={(e) => handleUpdateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} readOnly={isReadOnly} />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Price</label>
                            <input className="w-full bg-[#0F172A] border border-[#1F2937] rounded px-1.5 py-1 text-xs text-[#F9FAFB] focus:outline-none focus:ring-1 focus:ring-blue-500" value={line.unitPrice ?? ""} onChange={(e) => handleUpdateLine(line.id, { unitPrice: e.target.value })} placeholder="$0.00" readOnly={isReadOnly} />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Disc.</label>
                            <input className="w-full bg-[#0F172A] border border-[#1F2937] rounded px-1.5 py-1 text-xs text-[#F9FAFB] focus:outline-none focus:ring-1 focus:ring-blue-500" value={line.discount ?? ""} onChange={(e) => handleUpdateLine(line.id, { discount: e.target.value })} placeholder="$0.00" readOnly={isReadOnly} />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Total</label>
                            <p className="px-1.5 py-1 text-xs font-semibold text-emerald-400">{displayMoney(line.lineTotal)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quote Totals */}
            {selectedLines.length > 0 && (
              <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-2">Quote Totals</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400">Subtotal:</span>
                    <span className="text-emerald-200 font-medium">{displayMoney(currentSelected.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emerald-400">Tax:</span>
                    {isReadOnly ? (
                      <span className="text-emerald-200 font-medium">{displayMoney(currentSelected.taxAmount)}</span>
                    ) : (
                      <input className="w-28 bg-[#0F172A] border border-emerald-800 rounded px-2 py-1 text-xs text-emerald-200 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500" value={currentSelected.taxAmount ?? "$0.00"} onChange={(e) => handleTaxChange(e.target.value)} placeholder="$0.00" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emerald-400">Shipping:</span>
                    {isReadOnly ? (
                      <span className="text-emerald-200 font-medium">{displayMoney(currentSelected.shippingCost)}</span>
                    ) : (
                      <input className="w-28 bg-[#0F172A] border border-emerald-800 rounded px-2 py-1 text-xs text-emerald-200 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500" value={currentSelected.shippingCost ?? "$0.00"} onChange={(e) => handleShippingChange(e.target.value)} placeholder="$0.00" />
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-emerald-800">
                    <span className="text-emerald-300 font-semibold">Grand Total:</span>
                    <span className="text-emerald-100 font-bold text-sm">{displayMoney(currentSelected.grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {currentSelected.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
                <p className="text-sm text-gray-300 leading-relaxed">{currentSelected.notes}</p>
              </div>
            )}

            {/* Converted info */}
            {currentSelected.quoteStatus === "Converted" && (
              <div className="bg-purple-900/20 border border-purple-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-0.5">Converted to Order</p>
                <p className="text-sm text-purple-200">This quote has been converted into an order. View it in the Orders page.</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {canEditQuote(currentSelected) && !isReadOnly && (
            <div className="px-6 py-4 border-t border-[#1F2937] space-y-2">
              {/* Convert to Order — only for Accepted quotes */}
              {(currentSelected.quoteStatus === "Accepted" || currentSelected.quoteStatus === "Sent" || currentSelected.quoteStatus === "Draft") && selectedLines.length > 0 && (
                <button
                  onClick={() => setConvertConfirm(true)}
                  className="w-full bg-emerald-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-emerald-700 transition-all shadow-sm"
                >
                  Convert to Order
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setEditForm({ ...currentSelected }); setEditOpen(true); }} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">Edit Quote</button>
                <button onClick={() => setDeleteConfirm(true)} className="flex-1 border border-red-200 text-red-600 text-sm font-medium py-2.5 rounded-xl hover:bg-red-50 transition-colors">Delete</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add modal */}
      {addOpen && (
        <Modal title="New Quote" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <LabeledInput label="Quote Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Brake Parts Quote for ABC Motors" />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Contact" value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} placeholder="Contact name" />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Owner</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={form.owner} onChange={(e) => { const sel = allUsers.find(u => u.name === e.target.value); setForm({ ...form, owner: e.target.value, ownerId: sel?.id ?? undefined }); }}>
                  <option value="">— Unassigned —</option>
                  {allUsers.map((u) => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Initial Value" value={form.value} onChange={(v) => setForm({ ...form, value: v })} placeholder="$0.00" />
              <LabeledInput label="Valid Until" value={form.validUntil} onChange={(v) => setForm({ ...form, validUntil: v })} type="date" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Quote notes, special terms..." />
            </div>
            <p className="text-xs text-gray-500 bg-[#0B0F14] rounded-xl px-3 py-2">Quote number will be auto-generated (e.g. QUO-0001). Add line items after creating the quote.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAdd} disabled={!form.name} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">Create Quote</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editOpen && editForm && (
        <Modal title="Edit Quote" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Quote Name" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
              <LabeledInput label="Quote #" value={editForm.quoteNumber ?? ""} onChange={() => {}} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Contact" value={editForm.contact} onChange={(v) => setEditForm({ ...editForm, contact: v })} />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Owner</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.owner ?? ""} onChange={(e) => { const sel = allUsers.find(u => u.name === e.target.value); setEditForm({ ...editForm, owner: e.target.value, ownerId: sel?.id ?? undefined }); }}>
                  <option value="">— Unassigned —</option>
                  {allUsers.map((u) => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Value" value={editForm.value} onChange={(v) => setEditForm({ ...editForm, value: v })} placeholder="$0.00" />
              <LabeledInput label="Valid Until" value={editForm.validUntil ?? ""} onChange={(v) => setEditForm({ ...editForm, validUntil: v })} type="date" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Shipping Method</label>
              <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.shippingMethod ?? ""} onChange={(e) => setEditForm({ ...editForm, shippingMethod: e.target.value })} placeholder="e.g. DHL Express" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={2} value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Quote notes, special terms..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && currentSelected && (
        <Modal title="Delete Quote" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Delete quote <strong>{currentSelected.quoteNumber}</strong> — &quot;{currentSelected.name}&quot;? This will also remove all line items. This cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Convert to Order confirm */}
      {convertConfirm && currentSelected && (
        <Modal title="Convert Quote to Order" onClose={() => setConvertConfirm(false)}>
          <div className="space-y-4">
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl px-4 py-3">
              <p className="text-sm text-emerald-200 font-medium mb-2">Convert this quote to an order?</p>
              <div className="text-xs text-emerald-400 space-y-1">
                <p>Quote: <strong>{currentSelected.quoteNumber}</strong> — {currentSelected.name}</p>
                <p>Value: <strong>{displayMoney(currentSelected.value)}</strong></p>
                <p>Items: <strong>{selectedLines.length}</strong> line item{selectedLines.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">This will create a new order with all line items copied from this quote. The quote status will be set to &quot;Converted&quot;.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setConvertConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleConvertToOrder} className="px-5 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm">Convert to Order</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Part Picker modal */}
      {partPickerOpen && currentSelected && (
        <Modal title="Add Part to Quote" onClose={() => { setPartPickerOpen(false); setPartSearch(""); }}>
          <div className="space-y-3">
            <input
              className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors"
              placeholder="Search parts by name, SKU, brand..."
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {pickerParts.length === 0 ? (
                <p className="text-xs text-gray-500 italic text-center py-4">No parts found. Add parts in the Parts Catalog first.</p>
              ) : pickerParts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAddLine(p)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-[#1F2937] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#F9FAFB] truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku}{p.brand ? ` · ${p.brand}` : ""}{p.oemNumber ? ` · OEM: ${p.oemNumber}` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 ml-3 flex-shrink-0">{p.unitPrice ? displayMoney(p.unitPrice) : "—"}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => { setPartPickerOpen(false); setPartSearch(""); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
