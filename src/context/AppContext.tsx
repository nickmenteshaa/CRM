"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetAll, dbCreateLead, dbUpdateLead, dbDeleteLead,
  dbCreateTask, dbToggleTask,
  dbCreateDeal, dbUpdateDeal, dbDeleteDeal,
  dbCreateActivity,
  dbCreateCompany, dbUpdateCompany, dbDeleteCompany,
  dbCreateMessage, dbDeleteMessage,
  dbReset,
  dbAISummarize, dbAIConversation, dbAIFollowUp,
} from "@/lib/actions";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  lastContact: string;      // display string e.g. "Today", "Mar 18"
  lastContactAt?: string;   // ISO date string — used for 7-day staleness check
  summary?: string;         // AI-generated activity summary
  nextAction?: string;      // AI-suggested next best action
  convSummary?: string;     // AI summary of pasted conversation text
  followUpDraft?: string;   // AI-suggested follow-up message
  ownerId?: string;         // auth user id; undefined = unassigned (visible to all)
  createdAt?: string;       // ISO date string
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
};

export type Activity = {
  id: string;
  leadId: string;
  type: "Call" | "Email" | "Meeting" | "Note";
  note: string;
  date: string;
  createdAt?: string;       // ISO date string
};

export type Message = {
  id: string;
  leadId: string;
  dealId?: string;
  channel: "Email" | "WhatsApp" | "SMS" | "LinkedIn" | "Other";
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

// ── Seed data (used for first-run and reset) ───────────────────────────────────

// u1 = Admin User, u2 = Sales Rep (mirrors DEMO_USERS in AuthContext)
const seedLeads: Omit<Lead, "id">[] = [
  { name: "Alice Johnson", email: "alice@acme.com",     phone: "+1 555-0101", status: "Qualified", source: "Website",   lastContact: "Today",      ownerId: "u2" },
  { name: "Bob Smith",     email: "bob@globex.com",     phone: "+1 555-0102", status: "New",       source: "Referral",  lastContact: "Yesterday",  ownerId: "u2" },
  { name: "Carol White",   email: "carol@initech.com",  phone: "+1 555-0103", status: "Contacted", source: "LinkedIn",  lastContact: "Mar 18",     ownerId: "u2" },
  { name: "David Lee",     email: "david@umbrella.com", phone: "+1 555-0104", status: "Lost",      source: "Cold Call", lastContact: "Mar 15",     ownerId: "u1" },
  { name: "Eva Martinez",  email: "eva@soylent.com",    phone: "+1 555-0105", status: "New",       source: "Website",   lastContact: "Mar 14",     ownerId: "u1" },
  { name: "Frank Chen",    email: "frank@initech.com",  phone: "+1 555-0106", status: "Qualified", source: "Event",     lastContact: "Mar 12" },
  { name: "Grace Kim",     email: "grace@acme.com",     phone: "+1 555-0107", status: "Contacted", source: "Referral",  lastContact: "Mar 10" },
  { name: "Henry Park",    email: "henry@globex.com",   phone: "+1 555-0108", status: "Qualified", source: "LinkedIn",  lastContact: "Mar 8" },
  { name: "Isla Torres",   email: "isla@umbrella.com",  phone: "+1 555-0109", status: "Lost",      source: "Cold Call", lastContact: "Mar 5" },
  { name: "James Brown",   email: "james@soylent.com",  phone: "+1 555-0110", status: "New",       source: "Website",   lastContact: "Mar 3" },
];

const seedTasks: Omit<Task, "id">[] = [
  { title: "Send proposal to Globex Inc",  leadName: "Bob Smith",    due: "Today",    priority: "High",   done: false, auto: false, ownerId: "u2" },
  { title: "Schedule demo with Initech",   leadName: "Carol White",  due: "Tomorrow", priority: "Medium", done: false, auto: false, ownerId: "u2" },
  { title: "Review Umbrella contract",     leadName: "David Lee",    due: "Mar 22",   priority: "High",   done: false, auto: false, ownerId: "u1" },
  { title: "Onboarding call — Soylent Co", leadName: "Eva Martinez", due: "Mar 23",   priority: "Low",    done: false, auto: false, ownerId: "u1" },
  { title: "Check in with Frank Chen",     leadName: "Frank Chen",   due: "Mar 24",   priority: "Low",    done: true,  auto: false },
  { title: "Send invoice — Acme Pro",      leadName: "Grace Kim",    due: "Mar 25",   priority: "Medium", done: true,  auto: false },
  { title: "Renewal discussion — Globex",  leadName: "Henry Park",   due: "Mar 28",   priority: "Medium", done: false, auto: false },
];

const seedDeals: Omit<Deal, "id">[] = [
  { name: "Acme Corp Expansion",  contact: "Alice Johnson", value: "$24,000", stage: "Negotiation", close: "Mar 30", owner: "Sales Rep",  ownerId: "u2" },
  { name: "Globex SaaS License",  contact: "Bob Smith",     value: "$12,500", stage: "Proposal",    close: "Apr 5",  owner: "Sales Rep",  ownerId: "u2" },
  { name: "Initech Renewal",      contact: "Carol White",   value: "$8,000",  stage: "Qualified",   close: "Apr 12", owner: "Sales Rep",  ownerId: "u2" },
  { name: "Umbrella Platform",    contact: "David Lee",     value: "$52,000", stage: "Prospecting", close: "Apr 20", owner: "Admin User", ownerId: "u1" },
  { name: "Soylent Annual Plan",  contact: "Eva Martinez",  value: "$18,000", stage: "Closed Won",  close: "Mar 15", owner: "Admin User", ownerId: "u1" },
  { name: "Initech Add-on",       contact: "Frank Chen",    value: "$3,500",  stage: "Proposal",    close: "Apr 8" },
  { name: "Acme Pro Upgrade",     contact: "Grace Kim",     value: "$9,000",  stage: "Qualified",   close: "Apr 18" },
  { name: "Globex Enterprise",    contact: "Henry Park",    value: "$67,000", stage: "Negotiation", close: "Apr 2" },
];

const seedCompanies: Omit<Company, "id">[] = [
  { name: "Acme Corp",      industry: "Technology",      contacts: 4, revenue: "$33,000", status: "Active",  website: "acme.com",          phone: "+1 555-1001" },
  { name: "Globex Inc",     industry: "Finance",         contacts: 3, revenue: "$79,500", status: "Active",  website: "globex.com",        phone: "+1 555-1002" },
  { name: "Initech",        industry: "Software",        contacts: 2, revenue: "$11,500", status: "Active",  website: "initech.com",       phone: "+1 555-1003" },
  { name: "Umbrella Ltd",   industry: "Healthcare",      contacts: 2, revenue: "$57,500", status: "At Risk", website: "umbrella.com",      phone: "+1 555-1004" },
  { name: "Soylent Co",     industry: "Food & Beverage", contacts: 2, revenue: "$25,200", status: "Active",  website: "soylent.com",       phone: "+1 555-1005" },
  { name: "Hooli",          industry: "Technology",      contacts: 1, revenue: "$14,000", status: "Lead",    website: "hooli.com",         phone: "+1 555-1006" },
  { name: "Pied Piper",     industry: "Software",        contacts: 1, revenue: "$6,800",  status: "Lead",    website: "piedpiper.com",     phone: "+1 555-1007" },
  { name: "Dunder Mifflin", industry: "Retail",          contacts: 3, revenue: "$9,300",  status: "Churned", website: "dundermifflin.com", phone: "+1 555-1008" },
];

// ── Context type ───────────────────────────────────────────────────────────────

type AppContextType = {
  leads: Lead[];
  tasks: Task[];
  deals: Deal[];
  companies: Company[];
  activities: Activity[];
  messages: Message[];
  loaded: boolean;
  // Unfiltered data for admin dashboards
  allLeads: Lead[];
  allTasks: Task[];
  allDeals: Deal[];
  addLead: (lead: Omit<Lead, "id">) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  addTask: (task: Omit<Task, "id" | "auto">) => void;
  toggleTask: (id: string) => void;
  addDeal: (deal: Omit<Deal, "id">) => void;
  updateDeal: (id: string, updates: Partial<Deal>) => void;
  deleteDeal: (id: string) => void;
  addCompany: (company: Omit<Company, "id">) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  addActivity: (activity: Omit<Activity, "id">) => void;
  addMessage: (message: Omit<Message, "id">) => void;
  deleteMessage: (id: string) => void;
  aiSummarizeLead: (leadId: string) => Promise<void>;
  aiConversation: (leadId: string, text: string) => Promise<void>;
  aiFollowUp: (leadId: string) => Promise<void>;
  resetToSeedData: () => void;
};

const AppContext = createContext<AppContextType | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [leads,      setLeads]      = useState<Lead[]>([]);
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [deals,      setDeals]      = useState<Deal[]>([]);
  const [companies,  setCompanies]  = useState<Company[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [loaded,     setLoaded]     = useState(false);

  // ── Mount: load from DB; if empty, seed first ──────────────────────────────
  useEffect(() => {
    async function load() {
      let data = await dbGetAll();

      // First-run: DB is empty → write seed data then reload
      if (data.leads.length === 0) {
        await dbReset({ leads: seedLeads, tasks: seedTasks, deals: seedDeals, companies: seedCompanies });
        data = await dbGetAll();
      }

      // Apply Cold rule + nextAction for leads loaded from DB
      const processedLeads = data.leads.map((lead) => {
        let status = lead.status;
        if (!PROTECTED_STATUSES.has(status) && lead.lastContactAt && daysSince(lead.lastContactAt) >= 7) {
          status = "Cold";
        }
        const count = data.activities.filter((a) => a.leadId === lead.id).length;
        return { ...lead, status, nextAction: generateNextAction(status, count) };
      });

      setLeads(processedLeads);
      setTasks(data.tasks);
      setDeals(data.deals);
      setCompanies(data.companies);
      setActivities(data.activities);
      setMessages(data.messages);
      setLoaded(true);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── addLead ────────────────────────────────────────────────────────────────
  function addLead(lead: Omit<Lead, "id">) {
    const now     = new Date().toISOString();
    const ownerId = user?.id;
    const taskData: Omit<Task, "id"> = {
      title: `Contact lead: ${lead.name}`,
      leadName: lead.name,
      due: todayDisplay(),
      priority: "High",
      done: false,
      auto: true,
      ownerId,
    };
    // Optimistic update with a temp ID — replaced by real ID after DB write
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

    // ── 1. Optimistic updates ───────────────────────────────────────────────
    setActivities((prev) => [newActivity, ...prev]);
    setLeads((prev) => prev.map((l) =>
      l.id !== activity.leadId ? l : { ...l, ...leadUpdates }
    ));

    // ── 2. Follow-up task (duplicate check against current state) ──────────
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

      // ── 3. Persist to DB, replace temp IDs with real ones ───────────────
      dbCreateActivity(activity, leadUpdates, followUpTaskData).then(({ activity: created, task }) => {
        setActivities((prev) => prev.map((a) => (a.id === tempId ? created : a)));
        if (task) setTasks((prev) => prev.map((t) => (t.id === tempTaskId ? task : t)));
        // Fire-and-forget: enhance with AI (replaces rule-based summary/nextAction)
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
    const ownerId = user?.id;
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

  // ── Messages ─────────────────────────────────────────────────────────────
  function addMessage(message: Omit<Message, "id">) {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [{ ...message, id: tempId }, ...prev]);

    // Also auto-create an activity for the timeline
    const channelLabel = message.direction === "inbound" ? `${message.channel} received` : `${message.channel} sent`;
    const snippet = message.body.length > 80 ? message.body.slice(0, 77) + "..." : message.body;
    const activityData: Omit<Activity, "id"> = {
      leadId: message.leadId,
      type: message.channel === "Email" ? "Email" : "Note",
      note: `[${channelLabel}] ${message.subject ? message.subject + " — " : ""}${snippet}`,
      date: message.date,
    };
    addActivity(activityData);

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

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetToSeedData() {
    setLoaded(false);
    dbReset({ leads: seedLeads, tasks: seedTasks, deals: seedDeals, companies: seedCompanies })
      .then(() => dbGetAll())
      .then((data) => {
        setLeads(data.leads);
        setTasks(data.tasks);
        setDeals(data.deals);
        setCompanies(data.companies);
        setActivities(data.activities);
        setMessages(data.messages);
        setLoaded(true);
      });
  }

  // Sales users see only their own records + unassigned ones
  const visibleLeads = isAdmin
    ? leads
    : leads.filter((l) => !l.ownerId || l.ownerId === user?.id);
  const visibleTasks = isAdmin
    ? tasks
    : tasks.filter((t) => !t.ownerId || t.ownerId === user?.id);
  const visibleDeals = isAdmin
    ? deals
    : deals.filter((d) => !d.ownerId || d.ownerId === user?.id);

  return (
    <AppContext.Provider value={{
      leads: visibleLeads, tasks: visibleTasks, deals: visibleDeals,
      allLeads: leads, allTasks: tasks, allDeals: deals,
      companies, activities, messages, loaded,
      addLead, updateLead, deleteLead,
      addTask, toggleTask,
      addDeal, updateDeal, deleteDeal,
      addCompany, updateCompany, deleteCompany,
      addActivity,
      addMessage, deleteMessage,
      aiSummarizeLead, aiConversation, aiFollowUp,
      resetToSeedData,
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
