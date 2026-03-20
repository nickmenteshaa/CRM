"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// ── Types ───────────────────────────────────────────────────────────────────────

export type Role = "admin" | "sales";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type AuthContextType = {
  user: AuthUser | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  isAdmin: boolean;
};

// ── Hardcoded demo credentials ─────────────────────────────────────────────────
// Replace this lookup with a real API call when a backend is added.

const DEMO_USERS: (AuthUser & { password: string })[] = [
  { id: "u1", name: "Admin User",  email: "admin@crm.com",  password: "admin123",  role: "admin" },
  { id: "u2", name: "Sales Rep",   email: "sales@crm.com",  password: "sales123",  role: "sales" },
];

const SESSION_KEY = "crm_session";

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

  function login(email: string, password: string): { ok: boolean; error?: string } {
    const match = DEMO_USERS.find(
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

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
