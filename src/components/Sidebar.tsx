"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/context/AuthContext";
import NotificationCenter from "@/components/NotificationCenter";
import { useChat } from "@/context/ChatContext";

const nav = [
  { label: "Dashboard", icon: "▦", href: "/" },
  { label: "Customers", icon: "👤", href: "/contacts" },
  { label: "Companies", icon: "🏢", href: "/companies" },
  { label: "Orders", icon: "💼", href: "/deals" },
  { label: "Quotes", icon: "📋", href: "/quotes" },
  { label: "Pipeline", icon: "📊", href: "/pipeline" },
  { label: "Tasks", icon: "✓", href: "/tasks" },
  { label: "Reports", icon: "📈", href: "/reports" },
  { label: "Employees", icon: "👥", href: "/employees" },
  { label: "Parts Catalog", icon: "⚙", href: "/parts" },
  { label: "Suppliers", icon: "🏭", href: "/suppliers" },
  { label: "Inventory", icon: "📦", href: "/inventory" },
  { label: "Team Chat", icon: "💬", href: "/chat" },
];

const roleStyles: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  sales_rep: "bg-blue-100 text-blue-700",
  senior_rep: "bg-emerald-100 text-emerald-700",
  manager: "bg-amber-100 text-amber-700",
};

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, logout } = useAuth();
  const { totalUnread } = useChat();
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const filtered = search.trim()
    ? nav.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : nav;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user?.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-[#111827] border border-[#1F2937] rounded-xl p-2.5 shadow-md hover:bg-[#1F2937] transition-all"
        aria-label="Open navigation"
      >
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-[#070B10] border-r border-[#1F2937] flex flex-col z-40
        transition-transform duration-200 ease-in-out shadow-xl shadow-black/30 lg:shadow-none
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}>
        {/* Logo — always routes to dashboard */}
        <Link href="/" className="block px-6 py-5 border-b border-[#1F2937] hover:bg-[#1F2937] transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                CR
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#F9FAFB] tracking-tight">AutoCRM</h1>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Car Sales Platform</p>
              </div>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); setMobileOpen(false); }}
              className="lg:hidden text-gray-500 hover:text-gray-300 text-xl leading-none"
              aria-label="Close navigation"
            >
              ×
            </button>
          </div>
        </Link>

        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0F172A] text-[#F9FAFB] text-sm rounded-xl pl-8 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-[#1E293B] placeholder-gray-600 border border-[#1F2937] transition-all"
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {filtered.length > 0 ? filtered.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === item.href
                  ? "bg-blue-500/15 text-blue-400 shadow-sm"
                  : "text-gray-400 hover:bg-[#1F2937] hover:text-gray-200"
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === "/chat" && totalUnread > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold px-1">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </Link>
          )) : (
            <p className="text-xs text-gray-500 px-3 py-2">No results</p>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-[#1F2937] space-y-0.5">
          <div className="flex items-center gap-1 mb-0.5">
            <Link
              href="/settings"
              className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === "/settings"
                  ? "bg-blue-500/15 text-blue-400 shadow-sm"
                  : "text-gray-400 hover:bg-[#1F2937] hover:text-gray-200"
              }`}
            >
              <span className="text-base w-5 text-center">⚙</span>
              Settings
            </Link>
            <NotificationCenter />
          </div>

          {/* User badge — render stable placeholder until hydration completes */}
          {mounted && user ? (
            <div className="flex items-center gap-3 px-3 py-3 mt-1 bg-[#0B0F14] rounded-xl">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-100 truncate">{user.name}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleStyles[user.role] ?? "bg-gray-100 text-gray-600"}`}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-gray-400 hover:text-red-500 text-sm p-1.5 rounded-lg hover:bg-[#111827] transition-all"
              >
                ⎋
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-3 mt-1 bg-[#0B0F14] rounded-xl">
              <div className="w-9 h-9 rounded-xl bg-gray-700 animate-pulse flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3.5 w-24 bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-16 bg-gray-800 rounded animate-pulse" />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
