"use client";

import { useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { nowDateString } from "@/lib/date-utils";

function parseDollar(v: string): number {
  return parseFloat(v.replace(/[^0-9.\-]/g, "")) || 0;
}

const statusStyles: Record<string, string> = {
  New:        "bg-blue-100 text-blue-700",
  Contacted:  "bg-yellow-100 text-yellow-700",
  Qualified:  "bg-green-100 text-green-700",
  Converted:  "bg-purple-100 text-purple-700",
  Lost:       "bg-gray-100 text-gray-500",
  Cold:       "bg-slate-100 text-slate-500",
};

const PIPELINE_STAGES = [
  { name: "Prospecting", color: "bg-purple-500" },
  { name: "Qualified",   color: "bg-blue-500"   },
  { name: "Proposal",    color: "bg-yellow-500" },
  { name: "Negotiation", color: "bg-orange-500" },
  { name: "Closed Won",  color: "bg-green-500"  },
];

export default function Home() {
  const { leads, deals, tasks, loaded, timezone } = useApp();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const openDeals = deals.filter((d) => !d.won && !d.lost);
    const wonDeals  = deals.filter((d) => d.won);
    const pipelineValue = openDeals.reduce((s, d) => s + parseDollar(d.value), 0);
    const wonValue      = wonDeals.reduce((s, d) => s + parseDollar(d.value), 0);
    const tasksDueToday = tasks.filter((t) => !t.done && (t.due === "Today" || t.due === nowDateString(timezone))).length;

    const stageData = PIPELINE_STAGES.map((ps) => {
      const stageDeals = deals.filter((d) => d.stage === ps.name);
      return {
        ...ps,
        count: stageDeals.length,
        value: stageDeals.reduce((s, d) => s + parseDollar(d.value), 0),
      };
    });
    const maxStageCount = Math.max(...stageData.map((s) => s.count), 1);

    return { openDeals: openDeals.length, pipelineValue, wonValue, wonCount: wonDeals.length, tasksDueToday, stageData, maxStageCount };
  }, [deals, tasks]);

  const recentLeads = leads.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        {!loaded ? (
          <PageLoading />
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#F9FAFB]">Dashboard</h2>
              <p className="text-sm text-[#9CA3AF] mt-1">
                {user ? `Welcome back, ${user.name.split(" ")[0]}.` : "Welcome back."} Here&apos;s your sales overview.
              </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Contacts", value: String(leads.length),  sub: `${leads.filter((l) => l.status === "Qualified").length} qualified`, icon: "👤", color: "from-blue-500 to-blue-600" },
                { label: "Open Deals",     value: String(stats.openDeals), sub: `$${stats.pipelineValue.toLocaleString()} pipeline`, icon: "💼", color: "from-purple-500 to-purple-600" },
                { label: "Revenue Won",    value: `$${stats.wonValue.toLocaleString()}`, sub: `${stats.wonCount} deals closed`, icon: "💰", color: "from-green-500 to-green-600" },
                { label: "Tasks Due Today", value: String(stats.tasksDueToday), sub: `${tasks.filter((t) => t.done).length} completed total`, icon: "✓", color: "from-amber-500 to-orange-500" },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#111827] rounded-2xl border border-[#1F2937] p-5 shadow-sm shadow-black/10 hover:shadow-md hover:shadow-black/20 transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs sm:text-sm font-medium text-[#9CA3AF]">{stat.label}</p>
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white text-sm shadow-sm`}>
                      {stat.icon}
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#F9FAFB]">{stat.value}</p>
                  <p className="text-xs mt-1.5 font-medium text-green-600">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* Recent contacts + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-[#111827] rounded-2xl border border-[#1F2937] p-5 shadow-sm shadow-black/10">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-gray-100 text-base">Recent Contacts</h3>
                  <Link href="/contacts" className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline">View all</Link>
                </div>
                {recentLeads.length === 0 ? (
                  <EmptyState
                    icon="👤"
                    title="No contacts yet"
                    description="Add your first lead to get started with your sales pipeline."
                  />
                ) : (
                  <div className="overflow-x-auto -mx-5 sm:mx-0">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-[#1F2937]">
                          <th className="pb-3 font-medium px-5 sm:px-0">Name</th>
                          <th className="pb-3 font-medium">Car Interest</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Last Contact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F2937]">
                        {recentLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-gray-800/50 transition-colors">
                            <td className="py-3.5 font-medium text-gray-100 px-5 sm:px-0">{lead.name}</td>
                            <td className="py-3.5 text-[#9CA3AF]">{lead.carModel ? `${lead.carModel} ${lead.carYear ?? ""}` : "—"}</td>
                            <td className="py-3.5">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[lead.status] ?? "bg-gray-100 text-gray-600"}`}>
                                {lead.status}
                              </span>
                            </td>
                            <td className="py-3.5 text-gray-500">{lead.lastContact}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-[#111827] rounded-2xl border border-[#1F2937] p-5 shadow-sm shadow-black/10">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-gray-100 text-base">Pipeline</h3>
                  <Link href="/pipeline" className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline">View all</Link>
                </div>
                {deals.length === 0 ? (
                  <EmptyState
                    icon="📊"
                    title="No deals yet"
                    description="Create deals or convert leads to see your pipeline."
                  />
                ) : (
                  <div className="space-y-4">
                    {stats.stageData.map((stage) => (
                      <div key={stage.name}>
                        <div className="flex justify-between text-xs text-[#9CA3AF] mb-1.5">
                          <span className="font-medium">{stage.name}</span>
                          <span className="font-semibold text-gray-300">${stage.value.toLocaleString()} · {stage.count}</span>
                        </div>
                        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${stage.color} rounded-full transition-all`}
                            style={{ width: `${(stage.count / stats.maxStageCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
