"use client";

import { useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import PageLoading from "@/components/PageLoading";
import { useApp, type Lead, type Deal, type Task, type Activity, type Company } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

// ── Role → color mapping for dynamic employee cards ─────────────────────────

const ROLE_COLORS: Record<string, string> = {
  admin:      "bg-purple-500",
  manager:    "bg-amber-500",
  senior_rep: "bg-emerald-500",
  sales_rep:  "bg-blue-500",
};

const ROLE_LABELS: Record<string, string> = {
  admin:      "Admin",
  manager:    "Manager",
  senior_rep: "Senior Rep",
  sales_rep:  "Sales Rep",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseDollar(v: string): number {
  return parseFloat(v.replace(/[^0-9.\-]/g, "")) || 0;
}

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function pct(num: number, den: number): string {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

/** Average first-response time in hours: time from lead.createdAt to earliest activity.createdAt */
function avgFirstResponse(leads: Lead[], activities: Activity[]): number | null {
  const times: number[] = [];
  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const leadActs = activities
      .filter((a) => a.leadId === lead.id && a.createdAt)
      .map((a) => new Date(a.createdAt!).getTime())
      .sort((a, b) => a - b);
    if (leadActs.length === 0) continue;
    const diff = leadActs[0] - new Date(lead.createdAt).getTime();
    if (diff >= 0) times.push(diff);
  }
  if (times.length === 0) return null;
  const avgMs = times.reduce((s, t) => s + t, 0) / times.length;
  return avgMs / (1000 * 60 * 60); // hours
}

function fmtHours(h: number | null): string {
  if (h === null) return "N/A";
  if (h < 1)  return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// ── Per-user metric computation ─────────────────────────────────────────────

type UserMetrics = {
  id: string;
  name: string;
  role: string;
  color: string;
  leadsAssigned: number;
  firstResponseTime: number | null;
  tasksCompleted: number;
  totalTasks: number;
  dealsCreated: number;
  dealsWon: number;
  totalDeals: number;
  conversionRate: string;     // leads → deals won
  pipelineValue: number;
  wonValue: number;
};

function computeUserMetrics(
  userId: string,
  allLeads: Lead[],
  allTasks: Task[],
  allDeals: Deal[],
  allActivities: Activity[],
): Omit<UserMetrics, "name" | "role" | "color"> {
  const leads = allLeads.filter((l) => l.ownerId === userId);
  const tasks = allTasks.filter((t) => t.ownerId === userId);
  const deals = allDeals.filter((d) => d.ownerId === userId);
  const activities = allActivities.filter((a) => {
    const lead = allLeads.find((l) => l.id === a.leadId);
    return lead?.ownerId === userId;
  });

  const dealsWon  = deals.filter((d) => d.won).length;
  const pipelineValue = deals
    .filter((d) => !d.won && !d.lost)
    .reduce((s, d) => s + parseDollar(d.value), 0);
  const wonValue = deals
    .filter((d) => d.won)
    .reduce((s, d) => s + parseDollar(d.value), 0);

  return {
    id: userId,
    leadsAssigned: leads.length,
    firstResponseTime: avgFirstResponse(leads, activities),
    tasksCompleted: tasks.filter((t) => t.done).length,
    totalTasks: tasks.length,
    dealsCreated: deals.length,
    dealsWon,
    totalDeals: deals.length,
    conversionRate: pct(dealsWon, leads.length),
    pipelineValue,
    wonValue,
  };
}

// ── Stage funnel data ───────────────────────────────────────────────────────

const STAGE_ORDER = ["New Opportunity", "Prospecting", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const STAGE_COLORS: Record<string, string> = {
  "New Opportunity": "bg-slate-400",
  "Prospecting":     "bg-blue-400",
  "Qualified":       "bg-cyan-400",
  "Proposal":        "bg-indigo-400",
  "Negotiation":     "bg-amber-400",
  "Closed Won":      "bg-green-500",
  "Closed Lost":     "bg-red-400",
};

// ── Components ──────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-[#9CA3AF]">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-[#F9FAFB]">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function MetricRow({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1F2937] last:border-0">
      <span className="text-sm text-[#9CA3AF]">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-[#F9FAFB]">{value}</span>
        {subValue && <span className="text-xs text-gray-500 ml-1.5">{subValue}</span>}
      </div>
    </div>
  );
}

function UserCard({ m }: { m: UserMetrics }) {
  const initials = m.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const taskPct = m.totalTasks > 0 ? Math.round((m.tasksCompleted / m.totalTasks) * 100) : 0;

  return (
    <div className="bg-[#111827] rounded-xl border border-[#1F2937] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1F2937] flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${m.color} flex items-center justify-center text-white font-semibold text-sm`}>
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#F9FAFB]">{m.name}</p>
          <p className="text-xs text-gray-500">{m.role}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 py-3">
        <MetricRow label="Leads Assigned" value={String(m.leadsAssigned)} />
        <MetricRow label="First Response Time" value={fmtHours(m.firstResponseTime)} />
        <MetricRow label="Tasks Completed" value={`${m.tasksCompleted}/${m.totalTasks}`} subValue={`${taskPct}%`} />
        <MetricRow label="Deals Created" value={String(m.dealsCreated)} />
        <MetricRow label="Deals Won" value={String(m.dealsWon)} subValue={fmtDollar(m.wonValue)} />
        <MetricRow label="Conversion Rate" value={m.conversionRate} />
      </div>

      {/* Pipeline bar */}
      <div className="px-5 py-3 bg-[#0B0F14] border-t border-[#1F2937]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-[#9CA3AF]">Pipeline Value</span>
          <span className="text-xs font-bold text-gray-300">{fmtDollar(m.pipelineValue)}</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${m.color} rounded-full transition-all`}
            style={{ width: `${Math.min(100, (m.pipelineValue / Math.max(m.pipelineValue, m.wonValue, 1)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { allLeads, allTasks, allDeals, activities, companies, loaded } = useApp();
  const { isAdmin, allUsers } = useAuth();

  // ── Compute all metrics ──────────────────────────────────────────────────
  const { teamMetrics, stageCounts, topDeals, kpis } = useMemo(() => {
    // Per-user metrics — built from actual employees
    const teamMetrics: UserMetrics[] = allUsers.map((u) => ({
      ...computeUserMetrics(u.id, allLeads, allTasks, allDeals, activities),
      name: u.name,
      role: ROLE_LABELS[u.role] ?? u.role,
      color: ROLE_COLORS[u.role] ?? "bg-gray-500",
    }));

    // Unassigned metrics
    const unassignedLeads = allLeads.filter((l) => !l.ownerId);
    const unassignedTasks = allTasks.filter((t) => !t.ownerId);
    const unassignedDeals = allDeals.filter((d) => !d.ownerId);
    if (unassignedLeads.length > 0 || unassignedDeals.length > 0) {
      const unassignedWon = unassignedDeals.filter((d) => d.won);
      teamMetrics.push({
        id: "unassigned",
        name: "Unassigned",
        role: "No owner",
        color: "bg-gray-400",
        leadsAssigned: unassignedLeads.length,
        firstResponseTime: avgFirstResponse(unassignedLeads, activities),
        tasksCompleted: unassignedTasks.filter((t) => t.done).length,
        totalTasks: unassignedTasks.length,
        dealsCreated: unassignedDeals.length,
        dealsWon: unassignedWon.length,
        totalDeals: unassignedDeals.length,
        pipelineValue: unassignedDeals.filter((d) => !d.won && !d.lost).reduce((s, d) => s + parseDollar(d.value), 0),
        wonValue: unassignedWon.reduce((s, d) => s + parseDollar(d.value), 0),
        conversionRate: pct(unassignedWon.length, unassignedLeads.length),
      });
    }

    // Stage funnel
    const stageCounts = STAGE_ORDER.map((stage) => ({
      stage,
      count: allDeals.filter((d) => d.stage === stage).length,
      value: allDeals.filter((d) => d.stage === stage).reduce((s, d) => s + parseDollar(d.value), 0),
    }));

    // Top deals by value
    const topDeals = [...allDeals]
      .sort((a, b) => parseDollar(b.value) - parseDollar(a.value))
      .slice(0, 5);

    // Global KPIs
    const totalPipeline = allDeals
      .filter((d) => !d.won && !d.lost)
      .reduce((s, d) => s + parseDollar(d.value), 0);
    const totalWon = allDeals.filter((d) => d.won).reduce((s, d) => s + parseDollar(d.value), 0);
    const winRate = pct(allDeals.filter((d) => d.won).length, allDeals.filter((d) => d.won || d.lost).length);
    const avgResponseAll = avgFirstResponse(allLeads, activities);

    const kpis = {
      totalLeads: allLeads.length,
      totalDeals: allDeals.length,
      totalPipeline,
      totalWon,
      winRate,
      avgResponse: avgResponseAll,
      tasksCompleted: allTasks.filter((t) => t.done).length,
      totalTasks: allTasks.length,
    };

    return { teamMetrics, stageCounts, topDeals, kpis };
  }, [allLeads, allTasks, allDeals, activities, allUsers]);

  const maxStageCount = Math.max(...stageCounts.map((s) => s.count), 1);

  // ── Admin-only guard ────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0B0F14]">
        <Sidebar />
        <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-xl font-bold text-[#F9FAFB] mb-2">Admin Access Required</h2>
            <p className="text-sm text-[#9CA3AF] max-w-md">
              The performance dashboard is restricted to administrators. Please contact your admin for access.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        {!loaded ? <PageLoading /> : (<>
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[#F9FAFB]">Performance Dashboard</h2>
          <p className="text-sm text-[#9CA3AF] mt-1">Team metrics from live CRM data</p>
        </div>

        {/* ── Global KPIs ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard icon="👥" label="Total Leads"       value={String(kpis.totalLeads)}       sub={`${allLeads.filter((l) => l.status === "Qualified").length} qualified`} />
          <KPICard icon="💰" label="Pipeline Value"    value={fmtDollar(kpis.totalPipeline)} sub={`${kpis.totalDeals} active deals`} />
          <KPICard icon="🏆" label="Revenue Won"       value={fmtDollar(kpis.totalWon)}       sub={`Win rate: ${kpis.winRate}`} />
          <KPICard icon="⚡" label="Avg Response Time" value={fmtHours(kpis.avgResponse)}    sub={`${kpis.tasksCompleted}/${kpis.totalTasks} tasks done`} />
        </div>

        {/* ── Per-user performance cards ──────────────────────────────────── */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-[#F9FAFB] mb-4">Team Performance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {teamMetrics.map((m) => (
              <UserCard key={m.id} m={m} />
            ))}
          </div>
        </div>

        {/* ── Bottom row: Funnel + Top Deals ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Deal stage funnel */}
          <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-5">
            <h3 className="font-semibold text-gray-100 mb-5">Deal Pipeline Stages</h3>
            <div className="space-y-3">
              {stageCounts.map((s) => (
                <div key={s.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-400">{s.stage}</span>
                    <span className="text-xs text-gray-500">{s.count} deals &middot; {fmtDollar(s.value)}</span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${STAGE_COLORS[s.stage] ?? "bg-gray-400"} rounded-full transition-all`}
                      style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top deals */}
          <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-5">
            <h3 className="font-semibold text-gray-100 mb-4">Top Deals by Value</h3>
            {topDeals.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No deals yet.</p>
            ) : (
              <ul className="space-y-3">
                {topDeals.map((deal, i) => {
                  const stageColor = deal.won
                    ? "bg-green-100 text-green-700"
                    : deal.lost
                      ? "bg-red-900/30 text-red-500"
                      : "bg-gray-800 text-gray-400";
                  return (
                    <li key={deal.id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-600 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-100 truncate">{deal.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stageColor}`}>{deal.stage}</span>
                          {deal.owner && <span className="text-[10px] text-gray-500">{deal.owner}</span>}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-300">{deal.value}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Company Insights ────────────────────────────────────────────── */}
        {(() => {
          // Build lead-to-company map
          const leadCompany = new Map<string, string>();
          for (const l of allLeads) {
            if (l.companyId) leadCompany.set(l.id, l.companyId);
          }

          // Calculate per-company stats
          const companyStats = companies.map((c) => {
            const custCount = allLeads.filter((l) => l.companyId === c.id).length;
            const companyLeadIds = new Set(allLeads.filter((l) => l.companyId === c.id).map((l) => l.id));
            const companyDeals = allDeals.filter((d) => d.leadId && companyLeadIds.has(d.leadId));
            const wonRevenue = companyDeals.filter((d) => d.won).reduce((s, d) => s + parseDollar(d.value || "0"), 0);
            const pipelineValue = companyDeals.reduce((s, d) => s + parseDollar(d.value || "0"), 0);
            return { id: c.id, name: c.name, custCount, wonRevenue, pipelineValue, dealCount: companyDeals.length };
          });

          const topByRevenue = [...companyStats].sort((a, b) => b.wonRevenue - a.wonRevenue).filter((c) => c.wonRevenue > 0).slice(0, 10);
          const topByCustomers = [...companyStats].sort((a, b) => b.custCount - a.custCount).filter((c) => c.custCount > 0).slice(0, 10);
          const maxRevenue = topByRevenue[0]?.wonRevenue || 1;
          const maxCustCount = topByCustomers[0]?.custCount || 1;

          return (
            <div className="mt-8 mb-4">
              <h3 className="text-lg font-semibold text-[#F9FAFB] mb-4">Company Insights</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Top companies by revenue */}
                <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-5">
                  <h4 className="font-semibold text-gray-100 mb-4">Top Companies by Revenue</h4>
                  {topByRevenue.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No won deals yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {topByRevenue.map((c, i) => (
                        <div key={c.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-300 truncate">{i + 1}. {c.name}</span>
                            <span className="text-xs text-gray-500">{fmtDollar(c.wonRevenue)} &middot; {c.dealCount} deals</span>
                          </div>
                          <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(c.wonRevenue / maxRevenue) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top companies by customer count */}
                <div className="bg-[#111827] rounded-xl border border-[#1F2937] p-5">
                  <h4 className="font-semibold text-gray-100 mb-4">Top Companies by Customers</h4>
                  {topByCustomers.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No linked customers yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {topByCustomers.map((c, i) => (
                        <div key={c.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-300 truncate">{i + 1}. {c.name}</span>
                            <span className="text-xs text-gray-500">{c.custCount} customers &middot; {fmtDollar(c.pipelineValue)}</span>
                          </div>
                          <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(c.custCount / maxCustCount) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
        </>)}
      </main>
    </div>
  );
}
