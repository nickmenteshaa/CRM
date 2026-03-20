"use client";

import { useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import PageLoading from "@/components/PageLoading";
import EmptyState from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

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
  { name: "Prospecting", color: "bg-purple-400" },
  { name: "Qualified",   color: "bg-blue-400"   },
  { name: "Proposal",    color: "bg-yellow-400" },
  { name: "Negotiation", color: "bg-orange-400" },
  { name: "Closed Won",  color: "bg-green-400"  },
];

export default function Home() {
  const { leads, deals, tasks, loaded } = useApp();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const openDeals = deals.filter((d) => !d.won && !d.lost);
    const wonDeals  = deals.filter((d) => d.won);
    const pipelineValue = openDeals.reduce((s, d) => s + parseDollar(d.value), 0);
    const wonValue      = wonDeals.reduce((s, d) => s + parseDollar(d.value), 0);
    const tasksDueToday = tasks.filter((t) => !t.done && (t.due === "Today" || t.due === new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }))).length;

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
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        {!loaded ? (
          <PageLoading />
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
              <p className="text-sm text-gray-500 mt-1">
                {user ? `Welcome back, ${user.name.split(" ")[0]}.` : "Welcome back."} Here&apos;s what&apos;s happening.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Contacts", value: String(leads.length),  sub: `${leads.filter((l) => l.status === "Qualified").length} qualified`, up: true },
                { label: "Open Deals",     value: String(stats.openDeals), sub: `$${stats.pipelineValue.toLocaleString()} pipeline`, up: true },
                { label: "Revenue Won",    value: `$${stats.wonValue.toLocaleString()}`, sub: `${stats.wonCount} deals closed`, up: true },
                { label: "Tasks Due Today", value: String(stats.tasksDueToday), sub: `${tasks.filter((t) => t.done).length} completed total`, up: stats.tasksDueToday === 0 },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
                  <p className="text-xs sm:text-sm text-gray-500">{stat.label}</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  <p className={`text-xs mt-1 font-medium ${stat.up ? "text-green-600" : "text-amber-600"}`}>
                    {stat.sub}
                  </p>
                </div>
              ))}
            </div>

            {/* Recent contacts + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">Recent Contacts</h3>
                  <Link href="/contacts" className="text-sm text-blue-600 hover:underline">View all</Link>
                </div>
                {recentLeads.length === 0 ? (
                  <EmptyState
                    icon="👤"
                    title="No contacts yet"
                    description="Add your first lead to get started with your sales pipeline."
                  />
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-100">
                          <th className="pb-2 font-medium px-4 sm:px-0">Name</th>
                          <th className="pb-2 font-medium">Email</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Last Contact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {recentLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer">
                            <td className="py-3 font-medium text-gray-800 px-4 sm:px-0">{lead.name}</td>
                            <td className="py-3 text-gray-500 truncate max-w-[150px]">{lead.email}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[lead.status] ?? "bg-gray-100 text-gray-600"}`}>
                                {lead.status}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400">{lead.lastContact}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">Pipeline</h3>
                  <Link href="/pipeline" className="text-sm text-blue-600 hover:underline">View all</Link>
                </div>
                {deals.length === 0 ? (
                  <EmptyState
                    icon="📊"
                    title="No deals yet"
                    description="Create deals or convert leads to see your pipeline."
                  />
                ) : (
                  <div className="space-y-3">
                    {stats.stageData.map((stage) => (
                      <div key={stage.name}>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{stage.name}</span>
                          <span className="font-medium text-gray-700">${stage.value.toLocaleString()} · {stage.count} deals</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
