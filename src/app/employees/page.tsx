"use client";

import { useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { useAuth, ROLE_LABELS, type Role, type AuthUser, type Team } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import ImportModal from "@/components/ImportModal";
import { employeeImportConfig } from "@/lib/import-configs";
import { dbBulkCreateEmployees } from "@/lib/actions-employees";

// ── Styles ────────────────────────────────────────────────────────────────────

const roleStyles: Record<string, string> = {
  admin: "bg-purple-900/30 text-purple-300 border border-purple-800",
  sales_rep: "bg-blue-900/30 text-blue-300 border border-blue-800",
  senior_rep: "bg-emerald-900/30 text-emerald-300 border border-emerald-800",
  manager: "bg-amber-900/30 text-amber-300 border border-amber-800",
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "senior_rep", label: "Senior Rep" },
  { value: "sales_rep", label: "Sales Rep" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const colors = ["bg-blue-600", "bg-violet-600", "bg-teal-600", "bg-orange-500", "bg-pink-600", "bg-indigo-600"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${sizeClass} rounded-xl ${color} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

function StatPill({ label, count }: { label: string; count: number }) {
  return (
    <span className="text-xs text-gray-400">
      <span className="font-semibold text-gray-200">{count}</span> {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const {
    user, isAdmin, allUsers,
    createUser, deleteUser, updateUser, getTeamUserIds,
    teams, createTeam, updateTeam, deleteTeam,
    refreshUsers,
  } = useAuth();
  const { allLeads, allTasks, allDeals } = useApp();

  const [view, setView] = useState<"team" | "list">("team");
  const [query, setQuery] = useState("");

  // Employee modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editTarget, setEditTarget] = useState<AuthUser | null>(null);
  const [addError, setAddError] = useState("");

  // Team modals
  const [teamAddOpen, setTeamAddOpen] = useState(false);
  const [teamEditOpen, setTeamEditOpen] = useState(false);
  const [teamDeleteConfirm, setTeamDeleteConfirm] = useState(false);
  const [teamEditTarget, setTeamEditTarget] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState("");

  // Import modal
  const [importOpen, setImportOpen] = useState(false);

  // Employee forms
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "sales_rep" as Role, managerId: "", teamId: "" });
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "sales_rep" as Role, managerId: "", teamId: "" });

  // ── Visible users based on role ────────────────────────────────────────

  const visibleUsers = useMemo(() => {
    if (!user) return [];
    if (isAdmin) return allUsers;
    const teamIds = getTeamUserIds();
    if (user.role === "manager") {
      return allUsers.filter((u) => teamIds.has(u.id));
    }
    return allUsers.filter((u) => u.id === user.id || u.id === user.managerId);
  }, [user, isAdmin, allUsers, getTeamUserIds]);

  // ── Stats per user ─────────────────────────────────────────────────────

  const userStats = useMemo(() => {
    const stats: Record<string, { customers: number; tasks: number; orders: number }> = {};
    for (const u of allUsers) stats[u.id] = { customers: 0, tasks: 0, orders: 0 };
    for (const l of allLeads) if (l.ownerId && stats[l.ownerId]) stats[l.ownerId].customers++;
    for (const t of allTasks) if (t.ownerId && stats[t.ownerId]) stats[t.ownerId].tasks++;
    for (const d of allDeals) if (d.ownerId && stats[d.ownerId]) stats[d.ownerId].orders++;
    return stats;
  }, [allUsers, allLeads, allTasks, allDeals]);

  // ── Search ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!query.trim()) return visibleUsers;
    const q = query.toLowerCase();
    return visibleUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || ROLE_LABELS[u.role].toLowerCase().includes(q)
    );
  }, [visibleUsers, query]);

  // ── Lookup maps ────────────────────────────────────────────────────────

  const teamMap = useMemo(() => {
    const m: Record<string, Team> = {};
    for (const t of teams) m[t.id] = t;
    return m;
  }, [teams]);

  const managers = useMemo(
    () => allUsers.filter((u) => u.role === "manager" || u.role === "admin"),
    [allUsers]
  );

  // ── Team groups for team view ──────────────────────────────────────────

  type TeamGroup = { team: Team | null; head: AuthUser | null; members: AuthUser[] };

  const teamGroups: TeamGroup[] = useMemo(() => {
    const groups: TeamGroup[] = [];

    for (const team of teams) {
      const teamUsers = filtered.filter((u) => u.teamId === team.id);
      if (teamUsers.length === 0 && query.trim()) continue; // hide empty teams during search
      const head = teamUsers.find((u) => u.role === "manager" || u.role === "admin") ?? null;
      const members = teamUsers.filter((u) => u.id !== head?.id);
      groups.push({ team, head, members });
    }

    // Unassigned group (users without a teamId)
    const unassigned = filtered.filter((u) => !u.teamId);
    if (unassigned.length > 0) {
      const head = unassigned.find((u) => u.role === "admin") ?? null;
      const members = unassigned.filter((u) => u.id !== head?.id);
      groups.push({ team: null, head, members });
    }

    return groups;
  }, [filtered, teams, query]);

  // ── Helper ─────────────────────────────────────────────────────────────

  function teamName_(teamId?: string): string {
    if (!teamId) return "—";
    return teamMap[teamId]?.name ?? "—";
  }

  function managerName(managerId?: string): string {
    if (!managerId) return "—";
    return allUsers.find((u) => u.id === managerId)?.name ?? "—";
  }

  // ── Employee CRUD ──────────────────────────────────────────────────────

  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password.trim()) {
      setAddError("Name, email, and password are required");
      return;
    }
    const result = await createUser({
      name: addForm.name.trim(),
      email: addForm.email.trim(),
      password: addForm.password.trim(),
      role: addForm.role,
      managerId: addForm.managerId || undefined,
      teamId: addForm.teamId || undefined,
    });
    if (!result.ok) { setAddError(result.error ?? "Failed"); return; }
    setAddForm({ name: "", email: "", password: "", role: "sales_rep", managerId: "", teamId: "" });
    setAddError("");
    setAddOpen(false);
  }

  function openEdit(u: AuthUser) {
    setEditTarget(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, managerId: u.managerId ?? "", teamId: u.teamId ?? "" });
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editTarget) return;
    await updateUser(editTarget.id, {
      name: editForm.name.trim() || undefined,
      email: editForm.email.trim() || undefined,
      role: editForm.role,
      managerId: editForm.managerId || null,
      teamId: editForm.teamId || null,
    });
    setEditOpen(false);
    setEditTarget(null);
  }

  async function handleDelete() {
    if (!editTarget) return;
    await deleteUser(editTarget.id);
    setDeleteConfirm(false);
    setEditTarget(null);
  }

  // ── Team CRUD handlers ─────────────────────────────────────────────────

  async function handleTeamAdd() {
    const result = await createTeam(teamName);
    if (!result.ok) { setTeamError(result.error ?? "Failed"); return; }
    setTeamName("");
    setTeamError("");
    setTeamAddOpen(false);
  }

  function openTeamEdit(team: Team) {
    setTeamEditTarget(team);
    setTeamName(team.name);
    setTeamError("");
    setTeamEditOpen(true);
  }

  async function handleTeamEditSave() {
    if (!teamEditTarget) return;
    const result = await updateTeam(teamEditTarget.id, teamName);
    if (!result.ok) { setTeamError(result.error ?? "Failed"); return; }
    setTeamEditOpen(false);
    setTeamEditTarget(null);
    setTeamName("");
  }

  async function handleTeamDelete() {
    if (!teamEditTarget) return;
    await deleteTeam(teamEditTarget.id);
    setTeamDeleteConfirm(false);
    setTeamEditTarget(null);
  }

  // ── Employee card (team view) ──────────────────────────────────────────

  function EmployeeCard({ u, isHead = false }: { u: AuthUser; isHead?: boolean }) {
    const s = userStats[u.id] ?? { customers: 0, tasks: 0, orders: 0 };
    const isSelf = u.id === user?.id;
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-[#1F2937]/50 ${!isHead ? "ml-8" : ""} ${isSelf ? "bg-blue-900/10 border border-blue-900/30" : ""}`}>
        <UserAvatar name={u.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[#F9FAFB] truncate">{u.name}</p>
            {isSelf && <span className="text-[10px] text-blue-400 bg-blue-900/30 border border-blue-800 rounded-full px-1.5 py-0.5">You</span>}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${roleStyles[u.role]}`}>{ROLE_LABELS[u.role]}</span>
            {isHead && <span className="text-[10px] text-amber-400 bg-amber-900/30 border border-amber-800 rounded-full px-1.5 py-0.5">Head</span>}
          </div>
          <p className="text-xs text-gray-500 truncate">{u.email}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatPill label="cust." count={s.customers} />
          <StatPill label="ord." count={s.orders} />
          <StatPill label="tasks" count={s.tasks} />
        </div>
        {isAdmin && u.id !== user?.id && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button onClick={() => openEdit(u)} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-900/20">Edit</button>
            <button onClick={() => { setEditTarget(u); setDeleteConfirm(true); }} className="text-xs text-red-400 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />

      <main className="transition-all duration-300 p-4 sm:p-6 lg:p-8 pt-16 lg:pt-0 lg:ml-64">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#F9FAFB]">Employees & Teams</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">{filtered.length} employee{filtered.length !== 1 ? "s" : ""} · {teams.length} team{teams.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden">
              <button onClick={() => setView("team")} className={`px-3 py-2 text-xs font-medium transition-colors ${view === "team" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                Team View
              </button>
              <button onClick={() => setView("list")} className={`px-3 py-2 text-xs font-medium transition-colors ${view === "list" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                List View
              </button>
            </div>
            {isAdmin && (
              <>
                <button onClick={() => setImportOpen(true)} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
                  ↑ Import <span className="text-[10px] text-green-400 ml-1">EMPLOYEES IMPORT LIVE</span>
                </button>
                <button onClick={() => { setTeamName(""); setTeamError(""); setTeamAddOpen(true); }} className="border border-[#1F2937] text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#1F2937] transition-colors">
                  + Team
                </button>
                <button onClick={() => { setAddForm({ name: "", email: "", password: "", role: "sales_rep", managerId: "", teamId: "" }); setAddError(""); setAddOpen(true); }} className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-sm">
                  + Employee
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 mb-5">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
            <input
              className="w-full border border-[#1F2937] bg-[#0F172A] rounded-lg pl-8 pr-8 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
              placeholder="Search by name, email, or role..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">×</button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
            <p className="text-xs text-[#9CA3AF] uppercase tracking-wide">Total Employees</p>
            <p className="text-xl font-bold text-[#F9FAFB] mt-1">{visibleUsers.length}</p>
          </div>
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
            <p className="text-xs text-[#9CA3AF] uppercase tracking-wide">Teams</p>
            <p className="text-xl font-bold text-[#F9FAFB] mt-1">{teams.length}</p>
          </div>
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
            <p className="text-xs text-[#9CA3AF] uppercase tracking-wide">Managers</p>
            <p className="text-xl font-bold text-[#F9FAFB] mt-1">{visibleUsers.filter((u) => u.role === "manager").length}</p>
          </div>
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
            <p className="text-xs text-[#9CA3AF] uppercase tracking-wide">Sales Reps</p>
            <p className="text-xl font-bold text-[#F9FAFB] mt-1">{visibleUsers.filter((u) => u.role === "sales_rep" || u.role === "senior_rep").length}</p>
          </div>
        </div>

        {/* ── TEAM VIEW ───────────────────────────────────────────────────── */}
        {view === "team" && (
          <div className="space-y-4">
            {teamGroups.length === 0 && (
              <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
                <p className="text-gray-500 text-sm">No employees found.</p>
              </div>
            )}
            {teamGroups.map((group, i) => (
              <div key={group.team?.id ?? `unassigned-${i}`} className="bg-[#111827] border border-[#1F2937] rounded-2xl overflow-hidden">
                {/* Team header */}
                <div className="px-5 py-3 bg-[#0B0F14]/80 border-b border-[#1F2937]">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm ${group.team ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" : "bg-gray-700 text-gray-400"}`}>
                      {group.team ? group.team.name.charAt(0).toUpperCase() : "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#F9FAFB]">
                          {group.team?.name ?? "Unassigned"}
                        </p>
                        <span className="text-xs text-gray-500">
                          {(group.head ? 1 : 0) + group.members.length} member{((group.head ? 1 : 0) + group.members.length) !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {group.head && (
                        <p className="text-xs text-gray-500">Head: {group.head.name}</p>
                      )}
                    </div>
                    {isAdmin && group.team && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openTeamEdit(group.team!)} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-900/20">Rename</button>
                        <button onClick={() => { setTeamEditTarget(group.team!); setTeamDeleteConfirm(true); }} className="text-xs text-red-400 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Team members */}
                {(group.head || group.members.length > 0) ? (
                  <div className="divide-y divide-[#1F2937]/50 py-1">
                    {group.head && <EmployeeCard u={group.head} isHead />}
                    {group.members.map((m) => (
                      <EmployeeCard key={m.id} u={m} />
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <p className="text-xs text-gray-500 ml-8">No members yet</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── LIST VIEW ───────────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="bg-[#111827] rounded-2xl border border-[#1F2937] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-[#0B0F14]/80 border-b border-[#1F2937]">
                  <tr className="text-left text-[#9CA3AF]">
                    <th className="px-5 py-3 font-medium">Employee</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Team</th>
                    <th className="px-5 py-3 font-medium">Manager</th>
                    <th className="px-5 py-3 font-medium">Workload</th>
                    <th className="px-5 py-3 font-medium w-28"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2937]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-gray-500 text-sm">No employees found.</td>
                    </tr>
                  ) : filtered.map((u) => {
                    const s = userStats[u.id] ?? { customers: 0, tasks: 0, orders: 0 };
                    const isSelf = u.id === user?.id;
                    return (
                      <tr key={u.id} className={`transition-colors ${isSelf ? "bg-blue-900/10" : "hover:bg-gray-800/50"}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <UserAvatar name={u.name} />
                            <div>
                              <p className="font-medium text-[#F9FAFB]">
                                {u.name}
                                {isSelf && <span className="ml-2 text-[10px] text-blue-400 bg-blue-900/30 border border-blue-800 rounded-full px-1.5 py-0.5">You</span>}
                              </p>
                              <p className="text-xs text-gray-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleStyles[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-300">{teamName_(u.teamId)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-300">{managerName(u.managerId)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <StatPill label="customers" count={s.customers} />
                            <StatPill label="orders" count={s.orders} />
                            <StatPill label="tasks" count={s.tasks} />
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {isAdmin && u.id !== user?.id && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEdit(u)} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-900/20">Edit</button>
                              <button onClick={() => { setEditTarget(u); setDeleteConfirm(true); }} className="text-xs text-red-400 hover:underline px-2 py-1 rounded-lg hover:bg-red-900/20">Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── Add Employee Modal ──────────────────────────────────────────── */}
      {addOpen && (
        <Modal title="Add Employee" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Full Name *</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
                <input type="email" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="john@crm.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password *</label>
                <input type="password" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value as Role })}>
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Team</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.teamId} onChange={(e) => setAddForm({ ...addForm, teamId: e.target.value })}>
                  <option value="">— No Team —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Manager</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={addForm.managerId} onChange={(e) => setAddForm({ ...addForm, managerId: e.target.value })}>
                  <option value="">— No Manager —</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role]})</option>)}
                </select>
              </div>
            </div>
            {addError && <p className="text-sm text-red-400">{addError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAdd} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Add Employee</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Employee Modal ─────────────────────────────────────────── */}
      {editOpen && editTarget && (
        <Modal title={`Edit ${editTarget.name}`} onClose={() => { setEditOpen(false); setEditTarget(null); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input type="email" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Team</label>
                <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.teamId} onChange={(e) => setEditForm({ ...editForm, teamId: e.target.value })}>
                  <option value="">— No Team —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Manager</label>
              <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors" value={editForm.managerId} onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}>
                <option value="">— No Manager —</option>
                {managers.filter((m) => m.id !== editTarget.id).map((m) => <option key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role]})</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setEditOpen(false); setEditTarget(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Employee Confirmation ────────────────────────────────── */}
      {deleteConfirm && editTarget && (
        <Modal title="Delete Employee" onClose={() => { setDeleteConfirm(false); setEditTarget(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete <strong>{editTarget.name}</strong>? This action cannot be undone.</p>
            {(() => {
              const s = userStats[editTarget.id];
              const hasData = s && (s.customers > 0 || s.orders > 0 || s.tasks > 0);
              const hasReports = allUsers.some((u) => u.managerId === editTarget.id);
              return (hasData || hasReports) ? (
                <div className="bg-amber-900/20 border border-amber-800 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1.5">Warning</p>
                  <ul className="text-xs text-amber-200 space-y-0.5">
                    {s && s.customers > 0 && <li>{s.customers} assigned customer{s.customers > 1 ? "s" : ""} will become unassigned</li>}
                    {s && s.orders > 0 && <li>{s.orders} assigned order{s.orders > 1 ? "s" : ""} will become unassigned</li>}
                    {s && s.tasks > 0 && <li>{s.tasks} assigned task{s.tasks > 1 ? "s" : ""} will become unassigned</li>}
                    {hasReports && <li>Direct reports under this user will become unassigned</li>}
                  </ul>
                </div>
              ) : null;
            })()}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setDeleteConfirm(false); setEditTarget(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete Employee</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Team Modal ──────────────────────────────────────────────── */}
      {teamAddOpen && (
        <Modal title="Create Team" onClose={() => setTeamAddOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Team Name *</label>
              <input
                className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Sales Team Europe"
                autoFocus
              />
            </div>
            {teamError && <p className="text-sm text-red-400">{teamError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setTeamAddOpen(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleTeamAdd} disabled={!teamName.trim()} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">Create Team</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Rename Team Modal ───────────────────────────────────────────── */}
      {teamEditOpen && teamEditTarget && (
        <Modal title={`Rename "${teamEditTarget.name}"`} onClose={() => { setTeamEditOpen(false); setTeamEditTarget(null); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Team Name</label>
              <input
                className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] transition-colors"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                autoFocus
              />
            </div>
            {teamError && <p className="text-sm text-red-400">{teamError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setTeamEditOpen(false); setTeamEditTarget(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleTeamEditSave} disabled={!teamName.trim()} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Team Confirmation ────────────────────────────────────── */}
      {teamDeleteConfirm && teamEditTarget && (
        <Modal title="Delete Team" onClose={() => { setTeamDeleteConfirm(false); setTeamEditTarget(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to delete team <strong>{teamEditTarget.name}</strong>?</p>
            {allUsers.some((u) => u.teamId === teamEditTarget.id) && (
              <div className="bg-amber-900/20 border border-amber-800 rounded-xl px-3 py-2.5">
                <p className="text-xs text-amber-200">All members will be moved to "Unassigned". Their manager assignments will not change.</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setTeamDeleteConfirm(false); setTeamEditTarget(null); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleTeamDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete Team</button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <ImportModal
          config={employeeImportConfig({
            existing: allUsers,
            teams,
            onAdd: createUser,
            onUpdate: updateUser,
            onBulkBatch: dbBulkCreateEmployees,
            bulkApiRoute: "/api/import/employees",
          })}
          onClose={() => { setImportOpen(false); refreshUsers(); }}
        />
      )}
    </div>
  );
}
