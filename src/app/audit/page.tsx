"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import PageLoading from "@/components/PageLoading";
import { useAuth } from "@/context/AuthContext";
import { getAuditLog, getAuditSummary, type AuditEntry } from "@/lib/actions-audit";
import { useApp } from "@/context/AppContext";
import { formatDateTime } from "@/lib/date-utils";

const PAGE_SIZE = 30;

const ACTION_ICONS: Record<string, string> = {
  "lead.created": "👤",
  "lead.deleted": "🗑",
  "deal.created": "💼",
  "deal.updated": "✏",
  "company.created": "🏢",
  "import.completed": "📥",
  "settings.changed": "⚙",
  "automation.morning": "🤖",
  "automation.mid-morning": "🤖",
  "automation.midday": "🤖",
  "automation.early-afternoon": "🤖",
  "automation.late-afternoon": "🤖",
  "automation.eod": "🤖",
};

const ENTITY_COLORS: Record<string, string> = {
  Lead: "bg-blue-100 text-blue-700",
  Deal: "bg-green-100 text-green-700",
  Company: "bg-purple-100 text-purple-700",
  Inventory: "bg-orange-100 text-orange-700",
  System: "bg-gray-100 text-gray-600",
};

export default function AuditPage() {
  const { isAdmin } = useAuth();
  const { timezone } = useApp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState("");
  const [summary, setSummary] = useState<{ action: string; count: number }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [logData, summaryData] = await Promise.all([
        getAuditLog({ page, limit: PAGE_SIZE, entity: filterEntity || undefined }),
        page === 1 ? getAuditSummary() : Promise.resolve(null),
      ]);
      setEntries(logData.entries);
      setTotal(logData.total);
      setTotalPages(logData.totalPages);
      if (summaryData) setSummary(summaryData);
    } catch (err) {
      console.error("Failed to load audit log:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterEntity]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0B0F14]">
        <Sidebar />
        <main className="pt-16 lg:pt-0 lg:ml-64 p-8">
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <span className="text-4xl mb-4">🔒</span>
            <h2 className="text-xl font-bold text-[#F9FAFB]">Admin Access Required</h2>
            <p className="text-sm text-[#9CA3AF] mt-2">Audit logs are restricted to administrators.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        {loading && entries.length === 0 ? <PageLoading /> : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[#F9FAFB]">Audit Log</h2>
                <p className="text-sm text-[#9CA3AF] mt-1">{total.toLocaleString()} entries — immutable system record</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={filterEntity}
                  onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
                  className="border border-[#1F2937] rounded-xl px-3 py-2 text-sm text-[#F9FAFB] bg-[#0F172A]"
                >
                  <option value="">All Entities</option>
                  <option value="Lead">Customers</option>
                  <option value="Deal">Orders</option>
                  <option value="Company">Companies</option>
                  <option value="Inventory">Inventory</option>
                  <option value="System">System</option>
                </select>
              </div>
            </div>

            {/* Summary cards */}
            {summary.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                {summary.slice(0, 6).map((s) => (
                  <div key={s.action} className="bg-[#111827] rounded-xl border border-[#1F2937] p-3">
                    <span className="text-lg">{ACTION_ICONS[s.action] ?? "📋"}</span>
                    <p className="text-xs text-[#9CA3AF] mt-1 truncate">{s.action}</p>
                    <p className="text-lg font-bold text-[#F9FAFB]">{s.count}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Log entries */}
            <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
                    <tr className="text-left text-[#9CA3AF]">
                      <th className="px-4 py-3 font-medium w-12"></th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Entity</th>
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Details</th>
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]">
                    {entries.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No audit entries found</td></tr>
                    ) : entries.map((e) => {
                      let detailStr = "";
                      if (e.details) {
                        try {
                          const d = JSON.parse(e.details);
                          detailStr = Object.entries(d).filter(([k]) => k !== "log").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 50) : v}`).join(", ").slice(0, 120);
                        } catch { detailStr = e.details.slice(0, 80); }
                      }

                      return (
                        <tr key={e.id} className="hover:bg-gray-800/30">
                          <td className="px-4 py-3 text-center">{ACTION_ICONS[e.action] ?? "📋"}</td>
                          <td className="px-4 py-3 font-medium text-[#F9FAFB]">{e.action}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENTITY_COLORS[e.entity] ?? "bg-gray-100 text-gray-600"}`}>
                              {e.entity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#9CA3AF]">{e.userName || "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{detailStr || "—"}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF]">{formatDateTime(e.createdAt, timezone)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#1F2937]">
                  <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-xs rounded-lg border border-[#1F2937] text-gray-400 hover:bg-[#1F2937] disabled:opacity-30">Prev</button>
                    <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-xs rounded-lg border border-[#1F2937] text-gray-400 hover:bg-[#1F2937] disabled:opacity-30">Next</button>
                  </div>
                </div>
              )}
            </div>

            {/* System info footer */}
            <div className="mt-6 flex items-center justify-between text-xs text-gray-600">
              <span>CRM v1.0.0 — Production Environment</span>
              <span>Audit entries are immutable and cannot be edited or deleted</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
