"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// ── Types ───────────────────────────────────────────────────────────────────────

export type Role = "admin" | "sales_rep" | "senior_rep" | "manager";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  sales_rep: "Sales Rep",
  senior_rep: "Senior Rep",
  manager: "Manager",
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId?: string;   // user ID of this user's manager (null = top-level)
  teamId?: string;      // team this user belongs to
};

export type Team = {
  id: string;
  name: string;
};

type StoredUser = AuthUser & { password: string };

type AuthContextType = {
  user: AuthUser | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  isAdmin: boolean;
  // User management (admin only)
  allUsers: AuthUser[];
  createUser: (user: Omit<StoredUser, "id">) => { ok: boolean; error?: string };
  deleteUser: (id: string) => { ok: boolean; error?: string };
  changePassword: (oldPassword: string, newPassword: string) => { ok: boolean; error?: string };
  updateProfile: (updates: { name?: string; email?: string }) => void;
  updateUser: (id: string, updates: { name?: string; email?: string; role?: Role; managerId?: string | null; teamId?: string | null }) => { ok: boolean; error?: string };
  // Teams
  teams: Team[];
  createTeam: (name: string) => { ok: boolean; id?: string; error?: string };
  updateTeam: (id: string, name: string) => { ok: boolean; error?: string };
  deleteTeam: (id: string) => { ok: boolean; error?: string };
  // Hierarchy helpers
  getTeamUserIds: () => Set<string>;
  canAccessOwnerId: (ownerId?: string | null) => boolean;
};

// ── Hardcoded demo credentials ─────────────────────────────────────────────────

const DEFAULT_TEAMS: Team[] = [
  { id: "t1", name: "Sales Team Alpha" },
  { id: "t2", name: "Sales Team Beta" },
];

const DEFAULT_USERS: StoredUser[] = [
  { id: "u1", name: "Admin User",  email: "admin@crm.com",  password: "admin123",  role: "admin" },
  { id: "u2", name: "Sales Rep",   email: "sales@crm.com",  password: "sales123",  role: "sales_rep",  managerId: "u4", teamId: "t1" },
  { id: "u3", name: "Senior Rep",  email: "senior@crm.com", password: "senior123", role: "senior_rep", managerId: "u4", teamId: "t1" },
  { id: "u4", name: "Manager",     email: "manager@crm.com",password: "manager123",role: "manager",    teamId: "t1" },
];

const SESSION_KEY = "crm_session";
const USERS_KEY = "crm_users";
const TEAMS_KEY = "crm_teams";

function loadUsers(): StoredUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return DEFAULT_USERS;
    const stored: StoredUser[] = JSON.parse(raw);
    // Migrate: backfill managerId and teamId from defaults for existing users
    const defaultMap = new Map(DEFAULT_USERS.map((u) => [u.id, u]));
    const migrated = stored.map((u) => {
      const def = defaultMap.get(u.id);
      let patched = u;
      if (patched.managerId === undefined && def?.managerId) {
        patched = { ...patched, managerId: def.managerId };
      }
      if (patched.teamId === undefined && def?.teamId) {
        patched = { ...patched, teamId: def.teamId };
      }
      return patched;
    });
    return migrated;
  } catch {
    return DEFAULT_USERS;
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadTeams(): Team[] {
  if (typeof window === "undefined") return DEFAULT_TEAMS;
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TEAMS;
  } catch {
    return DEFAULT_TEAMS;
  }
}

function saveTeams(teams: Team[]) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
}

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  const [users, setUsers] = useState<StoredUser[]>(loadUsers);
  const [teams, setTeams] = useState<Team[]>(loadTeams);

  // Keep session cookie in sync so middleware can read it
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure; SameSite=Strict" : "";
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      document.cookie = `crm_session=1; path=/; max-age=86400${secure}`;
    } else {
      localStorage.removeItem(SESSION_KEY);
      document.cookie = `crm_session=; path=/; max-age=0${secure}`;
    }
  }, [user]);

  // Persist users list
  useEffect(() => { saveUsers(users); }, [users]);
  useEffect(() => { saveTeams(teams); }, [teams]);

  function login(email: string, password: string): { ok: boolean; error?: string } {
    const match = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!match) return { ok: false, error: "Invalid email or password" };
    const { password: _, ...safeUser } = match;
    setUser(safeUser);
    return { ok: true };
  }

  function logout() {
    setUser(null);
  }

  function createUser(newUser: Omit<StoredUser, "id">): { ok: boolean; error?: string } {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can create users" };
    if (users.some((u) => u.email.toLowerCase() === newUser.email.toLowerCase())) {
      return { ok: false, error: "Email already exists" };
    }
    const id = `u${Date.now()}`;
    setUsers((prev) => [...prev, { ...newUser, id }]);
    return { ok: true };
  }

  function deleteUser(id: string): { ok: boolean; error?: string } {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can delete users" };
    if (id === user?.id) return { ok: false, error: "Cannot delete yourself" };
    setUsers((prev) => prev.filter((u) => u.id !== id));
    return { ok: true };
  }

  function changePassword(oldPassword: string, newPassword: string): { ok: boolean; error?: string } {
    if (!user) return { ok: false, error: "Not logged in" };
    const stored = users.find((u) => u.id === user.id);
    if (!stored || stored.password !== oldPassword) return { ok: false, error: "Current password is incorrect" };
    if (newPassword.length < 6) return { ok: false, error: "New password must be at least 6 characters" };
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, password: newPassword } : u));
    return { ok: true };
  }

  function updateProfile(updates: { name?: string; email?: string }) {
    if (!user) return;
    const updated = { ...user, ...updates };
    setUser(updated);
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, ...updates } : u));
  }

  function updateUser(id: string, updates: { name?: string; email?: string; role?: Role; managerId?: string | null; teamId?: string | null }): { ok: boolean; error?: string } {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can update users" };
    if (!users.some((u) => u.id === id)) return { ok: false, error: "User not found" };
    if (updates.managerId === id) return { ok: false, error: "A user cannot be their own manager" };
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.email !== undefined) clean.email = updates.email;
    if (updates.role !== undefined) clean.role = updates.role;
    if (updates.managerId !== undefined) clean.managerId = updates.managerId ?? undefined;
    if (updates.teamId !== undefined) clean.teamId = updates.teamId ?? undefined;
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...clean } as StoredUser : u));
    return { ok: true };
  }

  // ── Team CRUD ─────────────────────────────────────────────────────────

  function createTeam(name: string): { ok: boolean; id?: string; error?: string } {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can create teams" };
    if (!name.trim()) return { ok: false, error: "Team name is required" };
    const id = `t${Date.now()}`;
    setTeams((prev) => [...prev, { id, name: name.trim() }]);
    return { ok: true, id };
  }

  function updateTeam(id: string, name: string): { ok: boolean; error?: string } {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can update teams" };
    if (!name.trim()) return { ok: false, error: "Team name is required" };
    setTeams((prev) => prev.map((t) => t.id === id ? { ...t, name: name.trim() } : t));
    return { ok: true };
  }

  function deleteTeam(id: string): { ok: boolean; error?: string } {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can delete teams" };
    // Unassign all users from this team
    setUsers((prev) => prev.map((u) => u.teamId === id ? { ...u, teamId: undefined } : u));
    setTeams((prev) => prev.filter((t) => t.id !== id));
    return { ok: true };
  }

  const allUsers: AuthUser[] = users.map(({ password: _, ...u }) => u);

  /**
   * Returns the set of user IDs whose records the current user may see.
   * - Admin → all user IDs
   * - Manager → own ID + IDs of users whose managerId === current user
   * - Sales rep / Senior rep → own ID only
   */
  function getTeamUserIds(): Set<string> {
    if (!user) return new Set();
    if (user.role === "admin") return new Set(allUsers.map((u) => u.id));
    if (user.role === "manager") {
      const ids = new Set<string>([user.id]);
      for (const u of allUsers) {
        if (u.managerId === user.id) ids.add(u.id);
      }
      return ids;
    }
    return new Set([user.id]);
  }

  /**
   * Can the current user access a record with the given ownerId?
   * - null/undefined ownerId → visible to all (unassigned)
   * - Otherwise checks team membership
   */
  function canAccessOwnerId(ownerId?: string | null): boolean {
    if (!ownerId) return true;           // unassigned → visible to all
    if (!user) return false;
    if (user.role === "admin") return true;
    return getTeamUserIds().has(ownerId);
  }

  return (
    <AuthContext.Provider value={{
      user, login, logout,
      isAdmin: user?.role === "admin",
      allUsers, createUser, deleteUser, updateUser,
      teams, createTeam, updateTeam, deleteTeam,
      changePassword, updateProfile,
      getTeamUserIds, canAccessOwnerId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
