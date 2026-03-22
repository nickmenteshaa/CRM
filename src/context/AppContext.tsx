"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetAll, dbCreateLead, dbUpdateLead, dbDeleteLead, dbBulkDeleteLeads,
  dbCreateTask, dbToggleTask,
  dbCreateDeal, dbUpdateDeal, dbDeleteDeal,
  dbCreateActivity,
  dbCreateCompany, dbUpdateCompany, dbDeleteCompany, dbBulkDeleteCompanies, dbGetCompanies,
  dbCreateMessage, dbDeleteMessage,
  dbAISummarize, dbAIConversation, dbAIFollowUp,
  dbGetAllAppSettings, dbSetAppSetting,
} from "@/lib/actions";
import { dbResetAllBusinessData } from "@/lib/actions-reset";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  lastContact: string;
  lastContactAt?: string;
  summary?: string;
  nextAction?: string;
  convSummary?: string;
  followUpDraft?: string;
  ownerId?: string;
  createdAt?: string;
  // Car industry fields
  carModel?: string;
  carYear?: string;
  carPrice?: string;
  carVin?: string;
  carCondition?: string;
  // Spare-parts customer fields
  customerType?: string;
  taxId?: string;
  shippingAddress?: string;
  billingAddress?: string;
  paymentTerms?: string;
  companyName?: string;
  companyId?: string;
  country?: string;
  preferredBrands?: string;
  customerNotes?: string;
};

export type Task = {
  id: string;
  title: string;
  leadName: string;
  due: string;
  priority: string;
  done: boolean;
  auto: boolean;
  ownerId?: string;
  // Spare-parts links
  orderId?: string;
  supplierId?: string;
};

export type Deal = {
  id: string;
  name: string;
  contact: string;
  value: string;
  stage: string;
  close: string;
  leadId?: string;
  leadName?: string;
  owner?: string;
  ownerId?: string;
  createdDate?: string;
  updatedAt?: string;
  won?: boolean;
  lost?: boolean;
  // Car industry fields
  carModel?: string;
  carYear?: string;
  carPrice?: string;
  carVin?: string;
  carCondition?: string;
  // Spare-parts order fields
  orderNumber?: string;
  orderStatus?: string;
  shippingMethod?: string;
  shippingCost?: string;
  taxAmount?: string;
  subtotal?: string;
  grandTotal?: string;
  notes?: string;
  // RFQ / Quote fields
  isQuote?: boolean;
  quoteNumber?: string;
  quoteStatus?: string;
  validUntil?: string;
  convertedToOrderId?: string;
};

export type Company = {
  id: string;
  name: string;
  industry: string;
  contacts: number;
  revenue: string;
  status: string;
  website?: string;
  phone?: string;
  // Spare-parts flags
  country?: string;
  taxId?: string;
  paymentTerms?: string;
  isSupplier?: boolean;
  isCustomer?: boolean;
};

// ── Spare Parts types (Phase 1) ──────────────────────────────────────────────

export type Part = {
  id: string;
  sku: string;
  name: string;
  description?: string;
  oemNumber?: string;
  brand?: string;
  categoryId?: string;
  compatMake?: string;
  compatModel?: string;
  compatYearFrom?: string;
  compatYearTo?: string;
  weight?: string;
  dimensions?: string;
  imageUrl?: string;
  unitPrice?: string;
  costPrice?: string;
  isActive?: boolean;
  createdAt?: string;
};

export type PartCategory = {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
};

export type Warehouse = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  isActive?: boolean;
};

export type InventoryItem = {
  id: string;
  partId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  reorderPoint: number;
  binLocation?: string;
};

export type Supplier = {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  website?: string;
  leadTimeDays?: number;
  moq?: number;
  rating?: number;
  notes?: string;
  isActive?: boolean;
};

export type SupplierPart = {
  id: string;
  supplierId: string;
  partId: string;
  costPrice?: string;
  leadTimeDays?: number;
  moq?: number;
  supplierSku?: string;
};

export type OrderLine = {
  id: string;
  dealId: string;
  partId: string;
  quantity: number;
  unitPrice?: string;
  discount?: string;
  lineTotal?: string;
};

export type Activity = {
  id: string;
  leadId: string;
  type: "Call" | "Email" | "Meeting" | "Note";
  note: string;
  date: string;
  createdAt?: string;
};

export type Message = {
  id: string;
  leadId?: string;
  dealId?: string;
  channel: "Email" | "WhatsApp" | "SMS" | "LinkedIn" | "Other" | "Internal";
  direction: "inbound" | "outbound";
  subject?: string;
  body: string;
  sender: string;
  recipient: string;
  date: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayDisplay() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tomorrowDisplay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

// ── Simulated AI summary ────────────────────────────────────────────────────

function generateSummary(recent: Activity[], status: string): string {
  if (recent.length === 0) return "";
  const counts: Partial<Record<Activity["type"], number>> = {};
  for (const a of recent) counts[a.type] = (counts[a.type] ?? 0) + 1;
  const typeParts = (["Call", "Email", "Meeting", "Note"] as const)
    .filter((t) => counts[t])
    .map((t) => `${counts[t]} ${t.toLowerCase()}${counts[t]! > 1 ? "s" : ""}`);
  const latestNote = recent[0].note;
  const snippet = latestNote.length > 55 ? latestNote.slice(0, 52) + "…" : latestNote;
  const statusNote: Record<string, string> = {
    New:       "Not yet contacted.",
    Contacted: "Initial contact made, awaiting response.",
    Qualified: "Qualified — follow-up recommended.",
    Lost:      "Opportunity marked as lost.",
    Cold:      "Gone cold — consider re-engagement.",
  };
  const total = recent.length;
  const plural = total === 1 ? "interaction" : "interactions";
  return `${total} ${plural} (${typeParts.join(", ")}). Latest: "${snippet}" ${statusNote[status] ?? "Follow-up recommended."}`;
}

// ── Next Best Action ────────────────────────────────────────────────────────

function generateNextAction(status: string, activityCount: number): string {
  switch (status) {
    case "New":       return "Contact this lead immediately";
    case "Contacted": return activityCount >= 2
      ? "Follow up within 24 hours — multiple touchpoints made"
      : "Follow up within 24 hours";
    case "Qualified": return activityCount >= 3
      ? "Send proposal — sufficient engagement recorded"
      : "Send proposal or schedule a meeting";
    case "Cold":  return "Re-engage with a personalized reminder";
    case "Lost":  return "No action needed";
    default:      return "Review lead and take action";
  }
}

const PROTECTED_STATUSES = new Set(["Qualified", "Lost", "Cold"]);

// Seed data removed — production CRM reads only from the database.

// ── Context type ───────────────────────────────────────────────────────────────

type AppContextType = {
  leads: Lead[];
  tasks: Task[];
  deals: Deal[];
  companies: Company[];
  activities: Activity[];
  messages: Message[];
  loaded: boolean;
  allLeads: Lead[];
  allTasks: Task[];
  allDeals: Deal[];
  addLead: (lead: Omit<Lead, "id">) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  bulkDeleteLeads: (ids: string[]) => void;
  addTask: (task: Omit<Task, "id" | "auto">) => void;
  toggleTask: (id: string) => void;
  addDeal: (deal: Omit<Deal, "id">) => void;
  updateDeal: (id: string, updates: Partial<Deal>) => void;
  deleteDeal: (id: string) => void;
  addCompany: (company: Omit<Company, "id">) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  bulkDeleteCompanies: (ids: string[]) => void;
  addActivity: (activity: Omit<Activity, "id">) => void;
  addMessage: (message: Omit<Message, "id">) => void;
  deleteMessage: (id: string) => void;
  aiSummarizeLead: (leadId: string) => Promise<void>;
  aiConversation: (leadId: string, text: string) => Promise<void>;
  aiFollowUp: (leadId: string) => Promise<void>;
  reloadFromDb: () => Promise<void>;
  reloadCompanies: () => Promise<void>;
  purgeAllData: () => Promise<{ ok: boolean; counts: Record<string, number> }>;
  companyName: string;
  setCompanyName: (name: string) => Promise<void>;
  timezone: string;
  setTimezone: (tz: string) => Promise<void>;
};

const AppContext = createContext<AppContextType | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, canAccessOwnerId } = useAuth();
  const [leads,      setLeads]      = useState<Lead[]>([]);
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [deals,      setDeals]      = useState<Deal[]>([]);
  const [companies,  setCompanies]  = useState<Company[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [loaded,     setLoaded]     = useState(false);
  const [companyName, setCompanyNameState] = useState("AutoCRM");
  const [timezone, setTimezoneState] = useState("Asia/Dubai");

  // ── Mount: load from DB ────────────────────────────────────────────────────
  useEffect(() => {
    // Load app settings independently — must not fail if dbGetAll times out
    dbGetAllAppSettings()
      .then((settings) => {
        if (settings.company_name) setCompanyNameState(settings.company_name);
        if (settings.timezone) setTimezoneState(settings.timezone);
      })
      .catch((err) => console.error("[AppContext] Failed to load app settings:", err));

    async function load() {
      try {
        const data = await dbGetAll();

        const processedLeads = (data.leads ?? []).map((lead) => {
          let status = lead.status;
          if (!PROTECTED_STATUSES.has(status) && lead.lastContactAt && daysSince(lead.lastContactAt) >= 7) {
            status = "Cold";
          }
          const count = (data.activities ?? []).filter((a) => a.leadId === lead.id).length;
          return { ...lead, status, nextAction: generateNextAction(status, count) };
        });

        setLeads(processedLeads);
        setTasks(data.tasks ?? []);
        setDeals(data.deals ?? []);
        setCompanies(data.companies ?? []);
        setActivities(data.activities ?? []);
        setMessages(data.messages ?? []);
      } catch (err) {
        console.error("[AppContext] dbGetAll failed:", err);
      } finally {
        setLoaded(true);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── addLead ────────────────────────────────────────────────────────────────
  function addLead(lead: Omit<Lead, "id">) {
    const now     = new Date().toISOString();
    const ownerId = lead.ownerId ?? user?.id;
    const taskData: Omit<Task, "id"> = {
      title: `Contact lead: ${lead.name}`,
      leadName: lead.name,
      due: todayDisplay(),
      priority: "High",
      done: false,
      auto: true,
      ownerId,
    };
    const tempId   = `temp-${Date.now()}`;
    const tempTask = `auto-${tempId}`;
    setLeads((prev) => [{ ...lead, id: tempId, lastContactAt: now, ownerId }, ...prev]);
    setTasks((prev) => [{ ...taskData, id: tempTask }, ...prev]);

    dbCreateLead({ ...lead, lastContactAt: now, ownerId }, taskData).then(({ lead: created, task }) => {
      setLeads((prev) => prev.map((l) => (l.id === tempId ? created : l)));
      setTasks((prev) => prev.map((t) => (t.id === tempTask ? task : t)));
    });
  }

  function updateLead(id: string, updates: Partial<Lead>) {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...updates };
        if ("status" in updates) {
          const count = activities.filter((a) => a.leadId === id).length;
          merged.nextAction = generateNextAction(merged.status, count);
        }
        return merged;
      })
    );
    dbUpdateLead(id, updates);
  }

  function deleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    dbDeleteLead(id);
  }

  function bulkDeleteLeads(ids: string[]) {
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
    dbBulkDeleteLeads(ids);
  }

  // ── addActivity ────────────────────────────────────────────────────────────
  function addActivity(activity: Omit<Activity, "id">) {
    const tempId     = `temp-${Date.now()}`;
    const newActivity: Activity = { ...activity, id: tempId };

    const lead          = leads.find((l) => l.id === activity.leadId);
    const leadName      = lead?.name ?? "Unknown";
    const followUpTitle = `Follow up with ${leadName}`;

    const leadActivities = [newActivity, ...activities.filter((a) => a.leadId === activity.leadId)];
    const activityCount  = leadActivities.length;
    const recentThree    = leadActivities.slice(0, 3);

    let newStatus = lead?.status ?? "New";
    if (activityCount >= 2) {
      if (newStatus !== "Lost") newStatus = "Qualified";
    } else if (newStatus === "New") {
      newStatus = "Contacted";
    }

    const summary    = generateSummary(recentThree, newStatus);
    const nextAction = generateNextAction(newStatus, activityCount);
    const leadUpdates = {
      status: newStatus, lastContact: todayDisplay(),
      lastContactAt: new Date().toISOString(), summary, nextAction,
    };

    setActivities((prev) => [newActivity, ...prev]);
    setLeads((prev) => prev.map((l) =>
      l.id !== activity.leadId ? l : { ...l, ...leadUpdates }
    ));

    let followUpTaskData: Omit<Task, "id"> | undefined;
    const alreadyPending = tasks.some((t) => t.title === followUpTitle && !t.done);
    if (!alreadyPending) {
      followUpTaskData = {
        title: followUpTitle, leadName,
        due: tomorrowDisplay(), priority: "Medium", done: false, auto: true,
        ownerId: user?.id,
      };
      const tempTaskId = `followup-temp-${Date.now()}`;
      setTasks((prev) => [{ ...followUpTaskData!, id: tempTaskId }, ...prev]);

      dbCreateActivity(activity, leadUpdates, followUpTaskData).then(({ activity: created, task }) => {
        setActivities((prev) => prev.map((a) => (a.id === tempId ? created : a)));
        if (task) setTasks((prev) => prev.map((t) => (t.id === tempTaskId ? task : t)));
        aiSummarizeLead(activity.leadId);
      });
    } else {
      dbCreateActivity(activity, leadUpdates).then(({ activity: created }) => {
        setActivities((prev) => prev.map((a) => (a.id === tempId ? created : a)));
        aiSummarizeLead(activity.leadId);
      });
    }
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  function addTask(task: Omit<Task, "id" | "auto">) {
    const tempId  = `temp-${Date.now()}`;
    const ownerId = user?.id;
    setTasks((prev) => [{ ...task, id: tempId, auto: false, ownerId }, ...prev]);
    dbCreateTask({ ...task, auto: false, ownerId }).then((created) => {
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
    });
  }

  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const done = !t.done;
      dbToggleTask(id, done);
      return { ...t, done };
    }));
  }

  // ── Deals ──────────────────────────────────────────────────────────────────
  function addDeal(deal: Omit<Deal, "id">) {
    const tempId  = `temp-${Date.now()}`;
    const ownerId = deal.ownerId ?? user?.id;
    const dealWithOwner = { ...deal, ownerId, owner: deal.owner ?? user?.name };
    setDeals((prev) => [{ ...dealWithOwner, id: tempId, updatedAt: new Date().toISOString() }, ...prev]);
    dbCreateDeal(dealWithOwner).then((created) => {
      setDeals((prev) => prev.map((d) => (d.id === tempId ? created : d)));
    });
  }

  function updateDeal(id: string, updates: Partial<Deal>) {
    const now = new Date().toISOString();
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const merged = { ...d, ...updates, updatedAt: now };
        if (updates.stage) {
          merged.won  = updates.stage === "Closed Won";
          merged.lost = updates.stage === "Closed Lost";
        }
        return merged;
      })
    );
    const dbUpdates = updates.stage
      ? { ...updates, won: updates.stage === "Closed Won", lost: updates.stage === "Closed Lost" }
      : updates;
    dbUpdateDeal(id, dbUpdates);
  }

  function deleteDeal(id: string) {
    setDeals((prev) => prev.filter((d) => d.id !== id));
    dbDeleteDeal(id);
  }

  // ── Companies ──────────────────────────────────────────────────────────────
  function addCompany(company: Omit<Company, "id">) {
    const tempId = `temp-${Date.now()}`;
    setCompanies((prev) => [{ ...company, id: tempId }, ...prev]);
    dbCreateCompany(company).then((created) => {
      setCompanies((prev) => prev.map((c) => (c.id === tempId ? created : c)));
    });
  }

  function updateCompany(id: string, updates: Partial<Company>) {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    dbUpdateCompany(id, updates);
  }

  function deleteCompany(id: string) {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    dbDeleteCompany(id);
  }

  function bulkDeleteCompanies(ids: string[]) {
    setCompanies((prev) => prev.filter((c) => !ids.includes(c.id)));
    dbBulkDeleteCompanies(ids);
  }

  // ── Messages ─────────────────────────────────────────────────────────────
  function addMessage(message: Omit<Message, "id">) {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [{ ...message, id: tempId }, ...prev]);

    // Skip auto-activity for internal chat messages or messages without a leadId
    if (message.channel !== "Internal" && message.leadId) {
      const channelLabel = message.direction === "inbound" ? `${message.channel} received` : `${message.channel} sent`;
      const snippet = message.body.length > 80 ? message.body.slice(0, 77) + "..." : message.body;
      const activityData: Omit<Activity, "id"> = {
        leadId: message.leadId,
        type: message.channel === "Email" ? "Email" : "Note",
        note: `[${channelLabel}] ${message.subject ? message.subject + " — " : ""}${snippet}`,
        date: message.date,
      };
      addActivity(activityData);
    }

    dbCreateMessage(message).then((created) => {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? created : m)));
    });
  }

  function deleteMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    dbDeleteMessage(id);
  }

  // ── AI functions ─────────────────────────────────────────────────────────
  async function aiSummarizeLead(leadId: string) {
    const result = await dbAISummarize(leadId);
    if (result && (result.summary || result.nextAction)) {
      setLeads((prev) => prev.map((l) =>
        l.id !== leadId ? l : {
          ...l,
          ...(result.summary && { summary: result.summary }),
          ...(result.nextAction && { nextAction: result.nextAction }),
        }
      ));
    }
  }

  async function aiConversation(leadId: string, text: string) {
    const convSummary = await dbAIConversation(leadId, text);
    if (convSummary) {
      setLeads((prev) => prev.map((l) =>
        l.id !== leadId ? l : { ...l, convSummary }
      ));
    }
  }

  async function aiFollowUp(leadId: string) {
    const followUpDraft = await dbAIFollowUp(leadId);
    if (followUpDraft) {
      setLeads((prev) => prev.map((l) =>
        l.id !== leadId ? l : { ...l, followUpDraft }
      ));
    }
  }

  // ── Reload client state from DB ───────────────────────────────────────────
  async function reloadFromDb() {
    try {
      const data = await dbGetAll();
      setLeads(data.leads ?? []);
      setTasks(data.tasks ?? []);
      setDeals(data.deals ?? []);
      setCompanies(data.companies ?? []);
      setActivities(data.activities ?? []);
      setMessages(data.messages ?? []);
    } catch (err) {
      console.error("[AppContext] reloadFromDb failed:", err);
    } finally {
      setLoaded(true);
    }
  }

  async function reloadCompanies() {
    try {
      const data = await dbGetCompanies();
      setCompanies(data);
    } catch (err) {
      console.error("[AppContext] reloadCompanies failed:", err);
    }
  }

  async function setCompanyName(name: string) {
    await dbSetAppSetting("company_name", name);
    setCompanyNameState(name);
  }

  async function setTimezone(tz: string) {
    await dbSetAppSetting("timezone", tz);
    setTimezoneState(tz);
  }

  // ── Purge all business data via server action ─────────────────────────────
  async function purgeAllData(): Promise<{ ok: boolean; counts: Record<string, number> }> {
    const result = await dbResetAllBusinessData();
    if (result.ok) {
      // Reload client state from the now-empty database
      await reloadFromDb();
    }
    return result;
  }

  const visibleLeads = leads.filter((l) => canAccessOwnerId(l.ownerId));
  const visibleTasks = tasks.filter((t) => canAccessOwnerId(t.ownerId));
  const visibleDeals = deals.filter((d) => canAccessOwnerId(d.ownerId));

  return (
    <AppContext.Provider value={{
      leads: visibleLeads, tasks: visibleTasks, deals: visibleDeals,
      allLeads: leads, allTasks: tasks, allDeals: deals,
      companies, activities, messages, loaded,
      addLead, updateLead, deleteLead, bulkDeleteLeads,
      addTask, toggleTask,
      addDeal, updateDeal, deleteDeal,
      addCompany, updateCompany, deleteCompany, bulkDeleteCompanies,
      addActivity,
      addMessage, deleteMessage,
      aiSummarizeLead, aiConversation, aiFollowUp,
      reloadFromDb, reloadCompanies, purgeAllData,
      companyName, setCompanyName,
      timezone, setTimezone,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
