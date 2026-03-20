"use client";

import { useState, useRef, useEffect } from "react";
import { useNotifications, type Notification, type NotificationType } from "@/context/NotificationContext";
import { useRouter } from "next/navigation";

const TYPE_ICONS: Record<NotificationType, string> = {
  low_stock: "📦",
  assignment: "📋",
  overdue_task: "⏰",
  order_status: "💼",
  general: "🔔",
};

const TYPE_COLORS: Record<NotificationType, string> = {
  low_stock: "text-amber-400",
  assignment: "text-blue-400",
  overdue_task: "text-red-400",
  order_status: "text-emerald-400",
  general: "text-gray-400",
};

export default function NotificationCenter() {
  const { notifications, unreadCount, markRead, markAllRead, dismissNotification, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const filtered = filter === "all"
    ? notifications
    : notifications.filter((n) => n.type === filter);

  function handleClick(n: Notification) {
    markRead(n.id);
    if (n.href) {
      router.push(n.href);
      setOpen(false);
    }
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-[#1F2937] transition-all text-gray-400 hover:text-gray-200"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-96 max-h-[70vh] bg-[#0F172A] border border-[#1F2937] rounded-2xl shadow-2xl shadow-black/40 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#1F2937] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#F9FAFB]">Notifications</h3>
              <p className="text-[10px] text-gray-500">{unreadCount} unread</p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-gray-500 hover:text-gray-400 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-3 py-2 border-b border-[#1F2937] flex gap-1 overflow-x-auto">
            {[
              { key: "all" as const, label: "All" },
              { key: "overdue_task" as const, label: "Overdue" },
              { key: "assignment" as const, label: "Assigned" },
              { key: "order_status" as const, label: "Orders" },
              { key: "low_stock" as const, label: "Stock" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-gray-500 hover:text-gray-300 hover:bg-[#1F2937]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-[#1F2937] flex items-center justify-center mb-3">
                  <span className="text-lg">🔔</span>
                </div>
                <p className="text-sm text-gray-400">No notifications</p>
                <p className="text-[10px] text-gray-600 mt-1">You&apos;re all caught up</p>
              </div>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-[#1F2937]/50 cursor-pointer transition-colors hover:bg-[#1F2937]/40 ${
                    !n.read ? "bg-blue-500/5" : ""
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <span className={`text-base mt-0.5 ${TYPE_COLORS[n.type]}`}>
                    {TYPE_ICONS[n.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold truncate ${!n.read ? "text-[#F9FAFB]" : "text-gray-400"}`}>
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{n.date}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotification(n.id);
                    }}
                    className="text-gray-600 hover:text-gray-400 text-sm p-1 flex-shrink-0"
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
