"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const nav = [
  { label: "Dashboard", icon: "▦", href: "/" },
  { label: "Contacts", icon: "👤", href: "/contacts" },
  { label: "Companies", icon: "🏢", href: "/companies" },
  { label: "Deals", icon: "💼", href: "/deals" },
  { label: "Pipeline", icon: "📊", href: "/pipeline" },
  { label: "Tasks", icon: "✓", href: "/tasks" },
  { label: "Reports", icon: "📈", href: "/reports" },
];

const roleStyles: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  sales: "bg-blue-100 text-blue-700",
};

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close sidebar on Escape
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
        className="fixed top-4 left-4 z-50 lg:hidden bg-white border border-gray-200 rounded-lg p-2 shadow-sm hover:bg-gray-50 transition-colors"
        aria-label="Open navigation"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col z-40
        transition-transform duration-200 ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}>
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">CRM</h1>
            <p className="text-xs text-gray-500 mt-0.5">Customer Relations</p>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-100 text-gray-900 text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            />
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {filtered.length > 0 ? filtered.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )) : (
            <p className="text-xs text-gray-400 px-3 py-2">No results</p>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-gray-200 space-y-1">
          <Link
            href="/settings"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/settings"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="text-base">⚙</span>
            Settings
          </Link>

          {/* User badge */}
          {user && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleStyles[user.role]}`}>
                  {user.role.toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-gray-400 hover:text-gray-600 text-sm p-1 rounded hover:bg-gray-100 transition-colors"
              >
                ⎋
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
