"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import SearchFilter from "@/components/SearchFilter";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp, type Deal, type Part, type OrderLine, type Lead, type Message } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import ChatPanel from "@/components/ChatPanel";
import ImportModal from "@/components/ImportModal";
import { orderImportConfig, orderItemImportConfig } from "@/lib/import-configs";
import {
  dbGetSparePartsData,
  dbCreateOrderLine, dbUpdateOrderLine, dbDeleteOrderLine,
  dbBulkCreateOrderLines,
} from "@/lib/actions-spare-parts";
import { dbReserveStockForOrder, dbBulkCreateDeals } from "@/lib/actions";

const FIELDS = [
  { key: "name",         label: "Order Name" },
  { key: "contact",      label: "Contact" },
  { key: "value",        label: "Value" },
  { key: "stage",        label: "Stage" },
  { key: "owner",        label: "Owner" },
  { key: "close",        label: "Close Date" },
  { key: "orderNumber",  label: "Order #" },
  { key: "orderStatus",  label: "Order Status" },
  { key: "carModel",     label: "Car Model" },
];

const STAGE_OPTIONS = ["New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const CAR_CONDITION_OPTIONS = ["New", "Used", "Certified Pre-Owned"];
const ORDER_STATUS_OPTIONS = ["New", "Checking Availability", "Quoted", "Confirmed", "Paid", "Shipped", "Delivered", "Cancelled"];

const stageStyles: Record<string, string> = {
  "New Opportunity": "bg-indigo-100 text-indigo-700",
  Prospecting:       "bg-purple-100 text-purple-700",
  Qualified:         "bg-blue-100 text-blue-700",
  Proposal:          "bg-yellow-100 text-yellow-700",
  Negotiation:       "bg-orange-100 text-orange-700",
  "Closed Won":      "bg-green-100 text-green-700",
  "Closed Lost":     "bg-red-100 text-red-600",
};

const orderStatusStyles: Record<string, string> = {
  "New":                    "bg-blue-100 text-blue-700",
  "Checking Availability":  "bg-yellow-100 text-yellow-700",
  "Quoted":                 "bg-purple-100 text-purple-700",
  "Confirmed":              "bg-emerald-100 text-emerald-700",
  "Paid":                   "bg-green-100 text-green-700",
  "Shipped":                "bg-cyan-100 text-cyan-700",
  "Delivered":              "bg-teal-100 text-teal-700",
  "Cancelled":              "bg-red-100 text-red-600",
};

const emptyForm = { name: "", contact: "", value: "", stage: "New Opportunity", close: "", owner: "", ownerId: undefined as string | undefined, carModel: "", carYear: "", carPrice: "", carVin: "", carCondition: "", orderStatus: "New", notes: "" };

type SortKey = "name" | "value" | "stage" | "close" | "orderNumber" | "orderStatus";
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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function LabeledInput({ label, value, onChange, placeholder, readOnly }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input className={`w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly} />
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

export default function DealsPage() {
  const { deals, addDeal, updateDeal, deleteDeal, messages, addMessage, loaded, allLeads } = useApp();
  const { isAdmin, user, allUsers, canAccessOwnerId } = useAuth();

  function canEditDeal(deal: Deal) {
    return canAccessOwnerId(deal.ownerId);
  }

  const [selected, setSelected]           = useState<Deal | null>(null);
  const [addOpen, setAddOpen]             = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editForm, setEditForm]           = useState<Deal | null>(null);
  const [form, setForm]                   = useState(emptyForm);
  const [query, setQuery]                 = useState("");
  const [activeFields, setActiveFields]   = useState(FIELDS.map((f) => f.key));

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Spare parts data for order items
  const [parts, setParts]           = useState<Part[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [partsLoaded, setPartsLoaded] = useState(false);

  // Part picker
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [partSearch, setPartSearch]         = useState("");

  // Reserve stock feedback
  const [reserveMsg, setReserveMsg] = useState<string | null>(null);

  // Import
  const [importOrdersOpen, setImportOrdersOpen] = useState(false);
  const [importItemsOpen, setImportItemsOpen] = useState(false);

  // Chat
  const [dealTab, setDealTab] = useState<"details" | "chat">("details");

  // Load spare parts data on mount
  useEffect(() => {
    dbGetSparePartsData().then((data) => {
      setParts(data.parts);
      setOrderLines(data.orderLines);
      setPartsLoaded(true);
    });
  }, []);

  // Build part lookup map
  const partMap = useMemo(() => {
    const m: Record<string, Part> = {};
    for (const p of parts) m[p.id] = p;
    return m;
  }, [parts]);

  // Order lines for selected deal
  const selectedOrderLines = useMemo(() => {
    if (!selected) return [];
    return orderLines.filter((ol) => ol.dealId === selected.id);
  }, [orderLines, selected]);

  // Recalculate totals for a deal
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
    // Update selected in place for immediate UI
    setSelected((prev) => prev && prev.id === dealId ? {
      ...prev,
      subtotal: fmtMoney(subtotal),
      taxAmount: fmtMoney(tax),
      shippingCost: fmtMoney(shipping),
      grandTotal: fmtMoney(grandTotal),
      value: fmtMoney(grandTotal),
    } : prev);
  }, [deals, updateDeal]);

  // Filter + Sort — exclude quotes (isQuote=true) from orders view
  const filtered = useMemo(() => {
    const ordersOnly = deals.filter((d) => !d.isQuote);
    let result = query.trim()
      ? ordersOnly.filter((d) =>
          activeFields.some((field) =>
            String(d[field as keyof Deal] ?? "").toLowerCase().includes(query.toLowerCase())
          )
        )
      : [...ordersOnly];

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
  }, [deals, query, activeFields, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const totalValue = deals.filter((d) => !d.isQuote).reduce((sum, d) => sum + parseMoney(d.value), 0);

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

  // --- Order line handlers ---

  function handleAddOrderLine(part: Part) {
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

    // Recalc totals
    const dealLines = updatedLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines);

    // Persist
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

  function handleRemoveOrderLine(lineId: string) {
    if (!selected) return;
    const updatedLines = orderLines.filter((ol) => ol.id !== lineId);
    setOrderLines(updatedLines);
    const dealLines = updatedLines.filter((ol) => ol.dealId === selected.id);
    recalcAndUpdate(selected.id, dealLines);
    dbDeleteOrderLine(lineId);
  }

  function handleUpdateOrderLine(lineId: string, updates: { quantity?: number; unitPrice?: string; discount?: string }) {
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

    // Persist
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

  function handleOrderStatusChange(status: string) {
    if (!selected) return;
    updateDeal(selected.id, { orderStatus: status });
    setSelected((prev) => prev ? { ...prev, orderStatus: status } : prev);
  }

  async function handleReserveStock() {
    if (!selected) return;
    setReserveMsg("Reserving...");
    const result = await dbReserveStockForOrder(selected.id);
    setReserveMsg(`${result.reserved} item(s) reserved, ${result.failed} failed`);
    setTimeout(() => setReserveMsg(null), 4000);
    // Reload parts data for updated inventory
    const data = await dbGetSparePartsData();
    setParts(data.parts);
  }

  // Keep selected in sync
  const currentSelected = selected ? deals.find((d) => d.id === selected.id) ?? selected : null;
  const dealChatMessages = currentSelected ? messages.filter((m) => m.dealId === currentSelected.id && m.channel === "Internal") : [];

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

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className={`transition-all duration-300 p-4 sm:p-6 lg:p-8 ${currentSelected ? "pt-16 lg:pt-0 lg:ml-64 lg:mr-96" : "pt-16 lg:pt-0 lg:ml-64"}`}>
        {!loaded ? <PageLoading /> : (<>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#F9FAFB]">Orders</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} of {deals.length} orders · Total value: {fmtMoney(totalValue)}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <button onClick={() => setImportOrdersOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
                  ↑ Import Orders
                </button>
                <button onClick={() => setImportItemsOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
                  ↑ Import Items
                </button>
              </>
            )}
            <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">+ New Order</button>
          </div>
        </div>

        <SearchFilter query={query} onQueryChange={setQuery} fields={FIELDS} activeFields={activeFields} onFieldsChange={setActiveFields} placeholder="Search orders..." />

        <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
              <tr className="text-left text-[#9CA3AF]">
                <SortHeader label="Order #" sortKey="orderNumber" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3 font-medium">Contact</th>
                <SortHeader label="Order Status" sortKey="orderStatus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Stage" sortKey="stage" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Value" sortKey="value" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3 font-medium">Owner</th>
                <SortHeader label="Close" sortKey="close" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2937]">
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon="💼" title="No orders found" description="Try adjusting your search or filters, or create a new order." /></td></tr>
              ) : filtered.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d.id === selected?.id ? null : d)} className={`cursor-pointer transition-colors ${selected?.id === d.id ? "bg-blue-900/30" : "hover:bg-gray-800/50"}`}>
                  <td className="px-5 py-3.5 font-mono text-xs text-blue-400">{d.orderNumber || "—"}</td>
                  <td className="px-5 py-3.5 font-medium text-[#F9FAFB]">
                    {d.name}
                    {d.leadName && <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-normal">converted</span>}
                  </td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{d.contact}</td>
                  <td className="px-5 py-3.5">
                    {d.orderStatus ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${orderStatusStyles[d.orderStatus] ?? "bg-gray-100 text-gray-600"}`}>{d.orderStatus}</span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageStyles[d.stage] ?? "bg-gray-100 text-gray-600"}`}>{d.stage}</span></td>
                  <td className="px-5 py-3.5 font-semibold text-gray-100">{displayMoney(d.value)}</td>
                  <td className="px-5 py-3.5 text-[#9CA3AF]">{d.owner || "—"}</td>
                  <td className="px-5 py-3.5 text-gray-500">{d.close || "—"}</td>
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
            <h3 className="font-semibold text-[#F9FAFB]">Order Details</h3>
            <div className="flex items-center gap-2">
              {canEditDeal(currentSelected) && <button onClick={() => { setEditForm({ ...currentSelected }); setEditOpen(true); }} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50">Edit</button>}
              {canEditDeal(currentSelected) && <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-500 hover:underline px-2 py-1 rounded-lg hover:bg-red-50">Delete</button>}
              {!canEditDeal(currentSelected) && <span className="text-xs text-gray-500 px-2 py-1">View only</span>}
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-400 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          <div className="px-6 py-5 border-b border-[#1F2937]">
            <div className="flex items-center gap-2 mb-1">
              {currentSelected.orderNumber && <span className="font-mono text-xs text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded">{currentSelected.orderNumber}</span>}
              {currentSelected.orderStatus && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${orderStatusStyles[currentSelected.orderStatus] ?? "bg-gray-100 text-gray-600"}`}>{currentSelected.orderStatus}</span>}
            </div>
            <p className="text-lg font-semibold text-[#F9FAFB]">{currentSelected.name}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageStyles[currentSelected.stage] ?? "bg-gray-100 text-gray-600"}`}>{currentSelected.stage}</span>
              <span className="text-sm font-bold text-gray-300">{displayMoney(currentSelected.value)}</span>
            </div>
          </div>

          <div className="flex border-b border-[#1F2937]">
            <button onClick={() => setDealTab("details")} className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${dealTab === "details" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-300"}`}>Details</button>
            <button onClick={() => setDealTab("chat")} className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${dealTab === "chat" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-300"}`}>Chat{dealChatMessages.length > 0 && ` (${dealChatMessages.length})`}</button>
          </div>

          {dealTab === "chat" ? (
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                messages={dealChatMessages}
                currentUserId={user?.id ?? ""}
                currentUserName={user?.name ?? ""}
                onSend={(body) => {
                  if (!currentSelected) return;
                  addMessage({
                    leadId: currentSelected.leadId,
                    dealId: currentSelected.id,
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
          <>
          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
            {/* Basic info */}
            {[
              { label: "Contact",        value: currentSelected.contact,                 icon: "👤" },
              { label: "Owner",          value: currentSelected.owner || "—",            icon: "🧑‍💼" },
              { label: "Expected Close", value: currentSelected.close || "—",            icon: "📅" },
              { label: "Created",        value: formatDate(currentSelected.createdDate), icon: "🗓" },
            ].map(({ label, value, icon }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                <div className="flex items-center gap-2 text-sm text-gray-100"><span>{icon}</span><span>{value}</span></div>
              </div>
            ))}

            {/* Order Status Changer */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2">Order Status</p>
              <div className="flex flex-wrap gap-1.5">
                {ORDER_STATUS_OPTIONS.map((s) => (
                  <button key={s} onClick={() => handleOrderStatusChange(s)} className={`px-2 py-1 rounded-xl text-[11px] font-medium border transition-colors ${currentSelected.orderStatus === s ? `${orderStatusStyles[s]} border-transparent` : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-[#0B0F14] border border-[#1F2937] rounded-xl px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wide">Order Items</p>
                {canEditDeal(currentSelected) && (
                  <button onClick={() => setPartPickerOpen(true)} className="text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline">
                    + Add Item
                  </button>
                )}
              </div>

              {!partsLoaded ? (
                <p className="text-xs text-gray-500 italic py-2">Loading parts...</p>
              ) : selectedOrderLines.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">No items yet. Click &quot;+ Add Item&quot; to add parts.</p>
              ) : (
                <div className="space-y-2">
                  {selectedOrderLines.map((line) => {
                    const part = partMap[line.partId];
                    return (
                      <div key={line.id} className="bg-[#111827] rounded-lg px-2.5 py-2 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[#F9FAFB] truncate">{part?.name ?? "Unknown Part"}</p>
                            <p className="text-gray-500 text-[10px]">{part?.sku ?? ""}{part?.brand ? ` · ${part.brand}` : ""}</p>
                          </div>
                          {canEditDeal(currentSelected) && (
                            <button onClick={() => handleRemoveOrderLine(line.id)} className="text-red-500 hover:text-red-400 text-sm ml-2 flex-shrink-0" title="Remove">×</button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Qty</label>
                            <input type="number" min={1} className="w-full bg-[#0F172A] border border-[#1F2937] rounded px-1.5 py-1 text-xs text-[#F9FAFB] focus:outline-none focus:ring-1 focus:ring-blue-500" value={line.quantity} onChange={(e) => handleUpdateOrderLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Price</label>
                            <input className="w-full bg-[#0F172A] border border-[#1F2937] rounded px-1.5 py-1 text-xs text-[#F9FAFB] focus:outline-none focus:ring-1 focus:ring-blue-500" value={line.unitPrice ?? ""} onChange={(e) => handleUpdateOrderLine(line.id, { unitPrice: e.target.value })} placeholder="$0.00" />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase">Disc.</label>
                            <input className="w-full bg-[#0F172A] border border-[#1F2937] rounded px-1.5 py-1 text-xs text-[#F9FAFB] focus:outline-none focus:ring-1 focus:ring-blue-500" value={line.discount ?? ""} onChange={(e) => handleUpdateOrderLine(line.id, { discount: e.target.value })} placeholder="$0.00" />
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

            {/* Order Totals */}
            {selectedOrderLines.length > 0 && (
              <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-2">Order Totals</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400">Subtotal:</span>
                    <span className="text-emerald-200 font-medium">{displayMoney(currentSelected.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emerald-400">Tax:</span>
                    <input className="w-28 bg-[#0F172A] border border-emerald-800 rounded px-2 py-1 text-xs text-emerald-200 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500" value={currentSelected.taxAmount ?? "$0.00"} onChange={(e) => handleTaxChange(e.target.value)} placeholder="$0.00" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emerald-400">Shipping:</span>
                    <input className="w-28 bg-[#0F172A] border border-emerald-800 rounded px-2 py-1 text-xs text-emerald-200 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500" value={currentSelected.shippingCost ?? "$0.00"} onChange={(e) => handleShippingChange(e.target.value)} placeholder="$0.00" />
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-emerald-800">
                    <span className="text-emerald-300 font-semibold">Grand Total:</span>
                    <span className="text-emerald-100 font-bold text-sm">{displayMoney(currentSelected.grandTotal)}</span>
                  </div>
                </div>

                {/* Reserve Stock */}
                <button onClick={handleReserveStock} className="mt-2.5 w-full text-xs font-medium py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-600 transition-colors">
                  Reserve Stock
                </button>
                {reserveMsg && <p className="text-[10px] text-emerald-400 mt-1 text-center">{reserveMsg}</p>}
              </div>
            )}

            {/* Notes */}
            {currentSelected.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Notes</p>
                <p className="text-sm text-gray-300 leading-relaxed">{currentSelected.notes}</p>
              </div>
            )}

            {/* Car Details (preserved) */}
            {(currentSelected.carModel || currentSelected.carVin) && (
              <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-1.5">Vehicle Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {currentSelected.carModel && <div><span className="text-indigo-400">Model:</span> <span className="text-indigo-200 font-medium">{currentSelected.carModel}</span></div>}
                  {currentSelected.carYear && <div><span className="text-indigo-400">Year:</span> <span className="text-indigo-200 font-medium">{currentSelected.carYear}</span></div>}
                  {currentSelected.carPrice && <div><span className="text-indigo-400">Price:</span> <span className="text-indigo-200 font-medium">{currentSelected.carPrice}</span></div>}
                  {currentSelected.carCondition && <div><span className="text-indigo-400">Condition:</span> <span className="text-indigo-200 font-medium">{currentSelected.carCondition}</span></div>}
                  {currentSelected.carVin && <div className="col-span-2"><span className="text-indigo-400">VIN:</span> <span className="text-indigo-200 font-medium font-mono text-[11px]">{currentSelected.carVin}</span></div>}
                </div>
              </div>
            )}

            {/* Converted from Lead (preserved) */}
            {currentSelected.leadName && (
              <div className="bg-purple-900/20 border border-purple-800 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-0.5">Converted from Customer</p>
                <p className="text-sm text-purple-200">{currentSelected.leadName}</p>
              </div>
            )}

            {/* Stage Progress (preserved) */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pipeline Stage</p>
              <div className="flex gap-1">
                {STAGE_OPTIONS.map((s, i) => (
                  <div key={s} title={s} className={`flex-1 h-2 rounded-full ${STAGE_OPTIONS.indexOf(currentSelected.stage) >= i ? "bg-blue-500" : "bg-gray-700"}`} />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1"><span>New</span><span>Closed</span></div>
            </div>

            {/* Change Stage (preserved) */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Change Stage</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_OPTIONS.map((s) => (
                  <button key={s} onClick={() => { updateDeal(currentSelected.id, { stage: s }); setSelected({ ...currentSelected, stage: s }); }} className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors ${currentSelected.stage === s ? `${stageStyles[s]} border-transparent` : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {canEditDeal(currentSelected) && (
            <div className="px-6 py-4 border-t border-[#1F2937] flex gap-2">
              <button onClick={() => { setEditForm({ ...currentSelected }); setEditOpen(true); }} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">Edit Order</button>
              <button onClick={() => setDeleteConfirm(true)} className="flex-1 border border-red-200 text-red-600 text-sm font-medium py-2.5 rounded-xl hover:bg-red-50 transition-colors">Delete</button>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* Add modal */}
      {addOpen && (
        <Modal title="New Order" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <LabeledInput label="Order Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Brake Parts Order" />
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
              <LabeledInput label="Value" value={form.value} onChange={(v) => setForm({ ...form, value: v })} placeholder="$0.00" />
              <LabeledSelect label="Stage" value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} options={STAGE_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledSelect label="Order Status" value={form.orderStatus} onChange={(v) => setForm({ ...form, orderStatus: v })} options={ORDER_STATUS_OPTIONS} />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Expected Close</label>
                <input type="date" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={form.close} onChange={(e) => setForm({ ...form, close: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Order notes..." />
            </div>
            {/* Car fields preserved */}
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide pt-2 border-t border-[#1F2937]">Vehicle Information (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Car Model" value={form.carModel} onChange={(v) => setForm({ ...form, carModel: v })} placeholder="e.g. BMW X5" />
              <LabeledInput label="Year" value={form.carYear} onChange={(v) => setForm({ ...form, carYear: v })} placeholder="e.g. 2024" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Price" value={form.carPrice} onChange={(v) => setForm({ ...form, carPrice: v })} placeholder="e.g. $45,000" />
              <LabeledSelect label="Condition" value={form.carCondition || "New"} onChange={(v) => setForm({ ...form, carCondition: v })} options={CAR_CONDITION_OPTIONS} />
            </div>
            <LabeledInput label="VIN" value={form.carVin} onChange={(v) => setForm({ ...form, carVin: v })} placeholder="Vehicle Identification Number" />
            <p className="text-xs text-gray-500 bg-[#0B0F14] rounded-xl px-3 py-2">Order number will be auto-generated (e.g. ORD-0001). Add items after creating the order.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAdd} disabled={!form.name} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">Create Order</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editOpen && editForm && (
        <Modal title="Edit Order" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Order Name" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
              <LabeledInput label="Order #" value={editForm.orderNumber ?? ""} onChange={() => {}} readOnly />
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
              <LabeledSelect label="Stage" value={editForm.stage} onChange={(v) => setEditForm({ ...editForm, stage: v })} options={STAGE_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledSelect label="Order Status" value={editForm.orderStatus ?? "New"} onChange={(v) => setEditForm({ ...editForm, orderStatus: v })} options={ORDER_STATUS_OPTIONS} />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Expected Close</label>
                <input type="date" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={editForm.close} onChange={(e) => setEditForm({ ...editForm, close: e.target.value })} />
              </div>
            </div>
            <LabeledInput label="Shipping Method" value={editForm.shippingMethod ?? ""} onChange={(v) => setEditForm({ ...editForm, shippingMethod: v })} placeholder="e.g. DHL Express" />
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
              <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={2} value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Order notes..." />
            </div>
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
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && currentSelected && (
        <Modal title="Delete Order" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Delete <strong>{currentSelected.name}</strong>? This will also remove all order items. This cannot be undone.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Part Picker modal */}
      {partPickerOpen && currentSelected && (
        <Modal title="Add Part to Order" onClose={() => { setPartPickerOpen(false); setPartSearch(""); }}>
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
                  onClick={() => handleAddOrderLine(p)}
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

      {importOrdersOpen && (
        <ImportModal
          config={orderImportConfig({
            existing: deals,
            customers: allLeads,
            employees: allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email })),
            onAdd: addDeal,
            onUpdate: updateDeal,
            onBulkBatch: dbBulkCreateDeals,
            bulkApiRoute: "/api/import/orders",
          })}
          onClose={() => setImportOrdersOpen(false)}
        />
      )}

      {importItemsOpen && (
        <ImportModal
          config={orderItemImportConfig({
            existing: orderLines.map((ol) => {
              const deal = deals.find((d) => d.id === ol.dealId);
              const part = parts.find((p) => p.id === ol.partId);
              return { ...ol, orderNumber: deal?.orderNumber, sku: part?.sku };
            }),
            orders: deals,
            parts,
            onAdd: async (data) => {
              const created = await dbCreateOrderLine(data);
              setOrderLines((prev) => [...prev, created]);
              return created;
            },
            onUpdate: async (id, data) => {
              const updated = await dbUpdateOrderLine(id, data as Partial<OrderLine>);
              setOrderLines((prev) => prev.map((ol) => (ol.id === id ? updated : ol)));
              return updated;
            },
            onBulkBatch: dbBulkCreateOrderLines,
            bulkApiRoute: "/api/import/order-items",
          })}
          onClose={() => setImportItemsOpen(false)}
        />
      )}
    </div>
  );
}
