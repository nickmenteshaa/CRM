"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  dbGetAllEmployees,
  dbGetAllTeams,
  dbCreateEmployee,
  dbUpdateEmployee,
  dbDeleteEmployee,
  dbChangePassword,
  dbCreateTeam as dbCreateTeamAction,
  dbUpdateTeam as dbUpdateTeamAction,
  dbDeleteTeam as dbDeleteTeamAction,
  type EmployeeRecord,
  type TeamRecord,
} from "@/lib/actions-employees";

// ── Types (UNCHANGED — same interface as before) ────────────────────────────

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
  managerId?: string;
  teamId?: string;
};

export type Team = {
  id: string;
  name: string;
};

type StoredUser = AuthUser & { password: string };

type AuthContextType = {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  // User management (admin only)
  allUsers: AuthUser[];
  createUser: (user: Omit<StoredUser, "id">) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateProfile: (updates: { name?: string; email?: string }) => Promise<void>;
  updateUser: (id: string, updates: { name?: string; email?: string; role?: Role; managerId?: string | null; teamId?: string | null }) => Promise<{ ok: boolean; error?: string }>;
  // Teams
  teams: Team[];
  createTeam: (name: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
  updateTeam: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  deleteTeam: (id: string) => Promise<{ ok: boolean; error?: string }>;
  // Hierarchy helpers
  getTeamUserIds: () => Set<string>;
  canAccessOwnerId: (ownerId?: string | null) => boolean;
  // Refresh
  refreshUsers: () => Promise<void>;
};

// ── Session cookie ──────────────────────────────────────────────────────────

function setSessionCookie(active: boolean, userInfo?: AuthUser | { id: string; role: string }) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure; SameSite=Lax" : "; SameSite=Lax";
  if (active && userInfo) {
    // Store full user info so readSessionCookie can restore it on reload
    const val = encodeURIComponent(JSON.stringify(userInfo));
    document.cookie = `crm_session=${val}; path=/; max-age=86400${secure}`;
  } else {
    document.cookie = `crm_session=; path=/; max-age=0${secure}`;
  }
}

function readSessionCookie(): AuthUser | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie.match(/crm_session=([^;]+)/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded);
    // Validate it has required fields
    if (!parsed?.id || !parsed?.role) return null;
    return {
      id: parsed.id,
      name: parsed.name ?? "User",
      email: parsed.email ?? "",
      role: parsed.role as Role,
      managerId: parsed.managerId,
      teamId: parsed.teamId,
    };
  } catch {
    return null;
  }
}

// ── Helper to convert DB employee to AuthUser ───────────────────────────────

function toAuthUser(emp: EmployeeRecord): AuthUser {
  return {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role as Role,
    managerId: emp.managerId,
    teamId: emp.teamId,
  };
}

// ── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize user from session cookie (synchronous, no localStorage)
  const [user, setUser] = useState<AuthUser | null>(() => readSessionCookie());
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);

  // ── Load employees + teams from DB on mount ─────────────────────────

  const refreshUsers = useCallback(async () => {
    try {
      const [empRows, teamRows] = await Promise.all([
        dbGetAllEmployees(),
        dbGetAllTeams(),
      ]);
      setAllUsers(empRows.map(toAuthUser));
      setTeams(teamRows);
    } catch (err) {
      console.error("[AuthContext] Failed to load from DB:", err);
    } finally {
      setDbLoaded(true);
    }
  }, []);

  useEffect(() => { refreshUsers(); }, [refreshUsers]);

  // Keep cookie in sync with user state — store full user for page reload recovery
  useEffect(() => {
    if (user) {
      setSessionCookie(true, user);
    } else {
      setSessionCookie(false);
    }
  }, [user]);

  // ── Auto-logout on inactivity (45 min) ─────────────────────────────

  useEffect(() => {
    if (!user) return;
    const TIMEOUT = 45 * 60 * 1000; // 45 minutes
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.log("[Auth] Auto-logout due to inactivity");
        setSessionCookie(false);
        setUser(null);
        window.location.href = "/login?reason=timeout";
      }, TIMEOUT);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  // ── Login (via API route with rate limiting) ──────────────────────

  async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.error || "Login failed" };
      }

      const authUser: AuthUser = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role as Role,
        managerId: data.user.managerId,
        teamId: data.user.teamId,
      };

      setSessionCookie(true, authUser);
      setUser(authUser);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* best effort */ }
    setSessionCookie(false);
    setUser(null);
  }

  // ── User CRUD (all async, hit DB) ───────────────────────────────────

  async function createUser(newUser: Omit<StoredUser, "id">): Promise<{ ok: boolean; error?: string }> {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can create users" };
    const result = await dbCreateEmployee({
      name: newUser.name,
      email: newUser.email,
      password: newUser.password,
      role: newUser.role,
      teamId: newUser.teamId,
      managerId: newUser.managerId,
    });
    if (result.ok) await refreshUsers();
    return { ok: result.ok, error: result.error };
  }

  async function deleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can delete users" };
    if (id === user?.id) return { ok: false, error: "Cannot delete yourself" };
    const result = await dbDeleteEmployee(id);
    if (result.ok) await refreshUsers();
    return result;
  }

  async function changePasswordFn(oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!user) return { ok: false, error: "Not logged in" };
    return dbChangePassword(user.id, oldPassword, newPassword);
  }

  async function updateProfile(updates: { name?: string; email?: string }): Promise<void> {
    if (!user) return;
    console.log("[Auth] updateProfile called with:", updates);
    const result = await dbUpdateEmployee(user.id, updates);
    console.log("[Auth] dbUpdateEmployee result:", result.ok, result.employee?.name);
    if (result.ok && result.employee) {
      const updated = toAuthUser(result.employee);
      console.log("[Auth] Setting user to:", updated.name, updated.email);
      setUser(updated);
      await refreshUsers();
    }
  }

  async function updateUser(
    id: string,
    updates: { name?: string; email?: string; role?: Role; managerId?: string | null; teamId?: string | null },
  ): Promise<{ ok: boolean; error?: string }> {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can update users" };
    if (updates.managerId === id) return { ok: false, error: "A user cannot be their own manager" };
    const result = await dbUpdateEmployee(id, updates);
    if (result.ok) await refreshUsers();
    return { ok: result.ok, error: result.error };
  }

  // ── Team CRUD (async, hit DB) ───────────────────────────────────────

  async function createTeam(name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can create teams" };
    const result = await dbCreateTeamAction(name);
    if (result.ok) await refreshUsers();
    return { ok: result.ok, id: result.team?.id, error: result.error };
  }

  async function updateTeam(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can update teams" };
    const result = await dbUpdateTeamAction(id, name);
    if (result.ok) await refreshUsers();
    return result;
  }

  async function deleteTeam(id: string): Promise<{ ok: boolean; error?: string }> {
    if (user?.role !== "admin") return { ok: false, error: "Only admin can delete teams" };
    const result = await dbDeleteTeamAction(id);
    if (result.ok) await refreshUsers();
    return result;
  }

  // ── Hierarchy helpers (UNCHANGED logic) ─────────────────────────────

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

  function canAccessOwnerId(ownerId?: string | null): boolean {
    if (!ownerId) return true;
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
      changePassword: changePasswordFn, updateProfile,
      getTeamUserIds, canAccessOwnerId,
      refreshUsers,
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
