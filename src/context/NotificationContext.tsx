"use client";

import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { useApp, type Task, type Deal, type Lead } from "@/context/AppContext";
import { useAuth, type AuthUser, ROLE_LABELS } from "@/context/AuthContext";
import { dbGetSparePartsData } from "@/lib/actions-spare-parts";

// ── Types ────────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "low_stock"
  | "assignment"
  | "overdue_task"
  | "order_status"
  | "general";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  date: string;
  read: boolean;
  /** Which roles can see this notification (empty = all) */
  roles?: string[];
  /** Link to relevant page */
  href?: string;
};

type NotificationContextType = {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────────

function nowStr(): string {
  const d = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function parseDateLoose(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isOverdue(dueDateStr: string): boolean {
  // Handle "Mar 20" style dates
  const d = parseDateLoose(dueDateStr);
  if (!d) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

// ── Context ──────────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { tasks, deals, leads, loaded } = useApp();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("crm_notif_read");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("crm_notif_dismissed");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist read/dismissed state
  useEffect(() => {
    localStorage.setItem("crm_notif_read", JSON.stringify([...readIds]));
  }, [readIds]);
  useEffect(() => {
    localStorage.setItem("crm_notif_dismissed", JSON.stringify([...dismissedIds]));
  }, [dismissedIds]);

  // ── Generate notifications from app data ────────────────────────────────────

  useEffect(() => {
    if (!loaded || !user) return;

    const generated: Notification[] = [];

    // 1. Overdue tasks
    for (const task of tasks) {
      if (task.done) continue;
      if (!isOverdue(task.due)) continue;
      // Only show to task owner or admin
      const canSee = user.role === "admin" || task.ownerId === user.id || (!task.ownerId);
      if (!canSee) continue;
      generated.push({
        id: `overdue-${task.id}`,
        type: "overdue_task",
        title: "Overdue Task",
        body: `"${task.title}" for ${task.leadName} was due ${task.due}`,
        date: nowStr(),
        read: readIds.has(`overdue-${task.id}`),
        href: "/tasks",
      });
    }

    // 2. New assignment alerts (tasks assigned to current user)
    for (const task of tasks) {
      if (task.done) continue;
      if (task.ownerId !== user.id) continue;
      if (task.auto) continue; // skip auto-generated
      generated.push({
        id: `assign-task-${task.id}`,
        type: "assignment",
        title: "Task Assigned",
        body: `"${task.title}" for ${task.leadName} — due ${task.due}`,
        date: nowStr(),
        read: readIds.has(`assign-task-${task.id}`),
        href: "/tasks",
      });
    }

    // 3. Deals assigned to current user
    for (const deal of deals) {
      if (deal.ownerId !== user.id) continue;
      if (deal.won || deal.lost) continue;
      const isNew = deal.createdDate && !isOverdue(deal.createdDate); // created recently
      if (!isNew) continue;
      generated.push({
        id: `assign-deal-${deal.id}`,
        type: "assignment",
        title: "Deal Assigned",
        body: `"${deal.name}" — ${deal.value} — Stage: ${deal.stage}`,
        date: deal.createdDate ?? nowStr(),
        read: readIds.has(`assign-deal-${deal.id}`),
        href: "/deals",
      });
    }

    // 4. Order/quote status alerts — deals closing soon or stage changes
    for (const deal of deals) {
      const canSee = user.role === "admin" || deal.ownerId === user.id || user.role === "manager";
      if (!canSee) continue;
      if (deal.won) {
        generated.push({
          id: `won-${deal.id}`,
          type: "order_status",
          title: "Deal Won",
          body: `"${deal.name}" — ${deal.value} closed successfully`,
          date: deal.updatedAt ?? nowStr(),
          read: readIds.has(`won-${deal.id}`),
          href: "/deals",
        });
      } else if (deal.lost) {
        generated.push({
          id: `lost-${deal.id}`,
          type: "order_status",
          title: "Deal Lost",
          body: `"${deal.name}" — ${deal.value} was lost`,
          date: deal.updatedAt ?? nowStr(),
          read: readIds.has(`lost-${deal.id}`),
          href: "/deals",
        });
      } else if (deal.stage === "Negotiation" || deal.stage === "Proposal") {
        generated.push({
          id: `stage-${deal.id}`,
          type: "order_status",
          title: `Deal in ${deal.stage}`,
          body: `"${deal.name}" — ${deal.value} needs attention`,
          date: deal.updatedAt ?? nowStr(),
          read: readIds.has(`stage-${deal.id}`),
          href: "/deals",
        });
      }
    }

    setNotifications(generated);
  }, [loaded, tasks, deals, leads, user, readIds]);

  // 5. Low stock alerts — loaded separately since inventory isn't in AppContext
  useEffect(() => {
    if (!loaded || !user) return;
    // Only admin and manager see low stock alerts
    if (user.role !== "admin" && user.role !== "manager") return;

    (async () => {
      try {
        const data = await dbGetSparePartsData();
        const lowStock: Notification[] = [];
        for (const inv of data.inventory) {
          const avail = inv.quantityOnHand - inv.quantityReserved;
          if (inv.reorderPoint > 0 && inv.quantityOnHand <= inv.reorderPoint) {
            const part = data.parts.find((p) => p.id === inv.partId);
            const wh = data.warehouses.find((w) => w.id === inv.warehouseId);
            const nid = `lowstock-${inv.id}`;
            lowStock.push({
              id: nid,
              type: "low_stock",
              title: "Low Stock Alert",
              body: `${part?.name ?? "Unknown part"} — ${avail} available (reorder at ${inv.reorderPoint})${wh ? ` in ${wh.name}` : ""}`,
              date: nowStr(),
              read: readIds.has(nid),
              roles: ["admin", "manager"],
              href: "/inventory",
            });
          }
          if (avail <= 0) {
            const part = data.parts.find((p) => p.id === inv.partId);
            const wh = data.warehouses.find((w) => w.id === inv.warehouseId);
            const nid = `outstock-${inv.id}`;
            lowStock.push({
              id: nid,
              type: "low_stock",
              title: "Out of Stock",
              body: `${part?.name ?? "Unknown part"} is out of stock${wh ? ` in ${wh.name}` : ""}`,
              date: nowStr(),
              read: readIds.has(nid),
              roles: ["admin", "manager"],
              href: "/inventory",
            });
          }
        }
        if (lowStock.length > 0) {
          setNotifications((prev) => {
            // Remove old stock notifications, add new
            const filtered = prev.filter((n) => n.type !== "low_stock");
            return [...filtered, ...lowStock];
          });
        }
      } catch {
        // Inventory might not be initialized yet — skip silently
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user]);

  // ── Filtered by role & dismissed ────────────────────────────────────────────

  const visible = useMemo(() => {
    return notifications
      .filter((n) => !dismissedIds.has(n.id))
      .filter((n) => {
        if (!n.roles || n.roles.length === 0) return true;
        return user ? n.roles.includes(user.role) : false;
      })
      .sort((a, b) => {
        // Unread first, then by type priority
        if (a.read !== b.read) return a.read ? 1 : -1;
        return 0;
      });
  }, [notifications, dismissedIds, user]);

  const unreadCount = useMemo(() => visible.filter((n) => !n.read).length, [visible]);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]));
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    const ids = notifications.map((n) => n.id);
    setReadIds((prev) => new Set([...prev, ...ids]));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  const dismissNotification = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const clearAll = useCallback(() => {
    setDismissedIds((prev) => new Set([...prev, ...notifications.map((n) => n.id)]));
  }, [notifications]);

  return (
    <NotificationContext.Provider value={{
      notifications: visible,
      unreadCount,
      markRead,
      markAllRead,
      dismissNotification,
      clearAll,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationProvider");
  return ctx;
}
