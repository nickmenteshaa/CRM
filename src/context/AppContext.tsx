"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetAll, dbCreateLead, dbUpdateLead, dbDeleteLead, dbBulkDeleteLeads,
  dbCreateTask, dbToggleTask,
  dbCreateDeal, dbUpdateDeal, dbDeleteDeal,
  dbCreateActivity,
  dbCreateCompany, dbUpdateCompany, dbDeleteCompany, dbBulkDeleteCompanies,
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

// ── Seed data (used for first-run and reset) ───────────────────────────────────

const seedLeads: Omit<Lead, "id">[] = [
  { name: "Alice Johnson", email: "alice@acme.com",     phone: "+1 555-0101", status: "Qualified", source: "Website",   lastContact: "Today",      ownerId: "u2", carModel: "BMW X5", carYear: "2024", carPrice: "$62,000", carVin: "WBA5R1C50LAF12345", carCondition: "New" },
  { name: "Bob Smith",     email: "bob@globex.com",     phone: "+1 555-0102", status: "New",       source: "Referral",  lastContact: "Yesterday",  ownerId: "u2", carModel: "Toyota Camry", carYear: "2023", carPrice: "$28,500", carVin: "4T1BZ1HK5PU123456", carCondition: "Used" },
  { name: "Carol White",   email: "carol@initech.com",  phone: "+1 555-0103", status: "Contacted", source: "LinkedIn",  lastContact: "Mar 18",     ownerId: "u2", carModel: "Mercedes C300", carYear: "2024", carPrice: "$45,000", carVin: "W1KZF8DB1PA000001", carCondition: "Certified Pre-Owned" },
  { name: "David Lee",     email: "david@umbrella.com", phone: "+1 555-0104", status: "Lost",      source: "Cold Call", lastContact: "Mar 15",     ownerId: "u1", carModel: "Honda Civic", carYear: "2022", carPrice: "$24,000", carVin: "2HGFC2F69NH500001", carCondition: "Used" },
  { name: "Eva Martinez",  email: "eva@soylent.com",    phone: "+1 555-0105", status: "New",       source: "Website",   lastContact: "Mar 14",     ownerId: "u1", carModel: "Tesla Model 3", carYear: "2024", carPrice: "$42,990", carVin: "5YJ3E1EA0PF100001", carCondition: "New" },
  { name: "Frank Chen",    email: "frank@initech.com",  phone: "+1 555-0106", status: "Qualified", source: "Event",     lastContact: "Mar 12", carModel: "Audi A4", carYear: "2023", carPrice: "$39,900", carCondition: "New" },
  { name: "Grace Kim",     email: "grace@acme.com",     phone: "+1 555-0107", status: "Contacted", source: "Referral",  lastContact: "Mar 10", carModel: "Ford F-150", carYear: "2024", carPrice: "$55,000", carCondition: "New" },
  { name: "Henry Park",    email: "henry@globex.com",   phone: "+1 555-0108", status: "Qualified", source: "LinkedIn",  lastContact: "Mar 8", carModel: "Chevrolet Tahoe", carYear: "2023", carPrice: "$58,000", carCondition: "Certified Pre-Owned" },
  { name: "Isla Torres",   email: "isla@umbrella.com",  phone: "+1 555-0109", status: "Lost",      source: "Cold Call", lastContact: "Mar 5" },
  { name: "James Brown",   email: "james@soylent.com",  phone: "+1 555-0110", status: "New",       source: "Website",   lastContact: "Mar 3", carModel: "Porsche Cayenne", carYear: "2024", carPrice: "$82,000", carCondition: "New" },
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
  { name: "BMW X5 Sale",           contact: "Alice Johnson", value: "$62,000", stage: "Negotiation", close: "Mar 30", owner: "Sales Rep",  ownerId: "u2", carModel: "BMW X5", carYear: "2024", carPrice: "$62,000", carCondition: "New" },
  { name: "Toyota Camry Trade-in", contact: "Bob Smith",     value: "$28,500", stage: "Proposal",    close: "Apr 5",  owner: "Sales Rep",  ownerId: "u2", carModel: "Toyota Camry", carYear: "2023", carPrice: "$28,500", carCondition: "Used" },
  { name: "Mercedes CPO Deal",     contact: "Carol White",   value: "$45,000", stage: "Qualified",   close: "Apr 12", owner: "Sales Rep",  ownerId: "u2", carModel: "Mercedes C300", carYear: "2024", carPrice: "$45,000", carCondition: "Certified Pre-Owned" },
  { name: "Tesla Model 3 Order",   contact: "Eva Martinez",  value: "$42,990", stage: "Prospecting", close: "Apr 20", owner: "Admin User", ownerId: "u1", carModel: "Tesla Model 3", carYear: "2024", carPrice: "$42,990", carCondition: "New" },
  { name: "Porsche Cayenne Sale",  contact: "James Brown",   value: "$82,000", stage: "Closed Won",  close: "Mar 15", owner: "Admin User", ownerId: "u1", carModel: "Porsche Cayenne", carYear: "2024", carPrice: "$82,000", carCondition: "New" },
  { name: "Audi A4 Lease",         contact: "Frank Chen",    value: "$39,900", stage: "Proposal",    close: "Apr 8", carModel: "Audi A4", carYear: "2023", carPrice: "$39,900", carCondition: "New" },
  { name: "Ford F-150 Sale",       contact: "Grace Kim",     value: "$55,000", stage: "Qualified",   close: "Apr 18", carModel: "Ford F-150", carYear: "2024", carPrice: "$55,000", carCondition: "New" },
  { name: "Chevrolet Tahoe CPO",   contact: "Henry Park",    value: "$58,000", stage: "Negotiation", close: "Apr 2", carModel: "Chevrolet Tahoe", carYear: "2023", carPrice: "$58,000", carCondition: "Certified Pre-Owned" },
];

const seedCompanies: Omit<Company, "id">[] = [
  { name: "Acme Motors",       industry: "Auto Dealership",  contacts: 4, revenue: "$117,000", status: "Active",  website: "acmemotors.com",      phone: "+1 555-1001" },
  { name: "Globex Auto Group", industry: "Auto Dealership",  contacts: 3, revenue: "$86,500",  status: "Active",  website: "globexauto.com",      phone: "+1 555-1002" },
  { name: "Initech Leasing",   industry: "Auto Finance",     contacts: 2, revenue: "$84,900",  status: "Active",  website: "initechleasing.com",  phone: "+1 555-1003" },
  { name: "Umbrella Fleet",    industry: "Fleet Management", contacts: 2, revenue: "$66,990",  status: "At Risk", website: "umbrellafleet.com",   phone: "+1 555-1004" },
  { name: "Soylent Transport", industry: "Logistics",        contacts: 2, revenue: "$42,990",  status: "Active",  website: "soylenttrans.com",    phone: "+1 555-1005" },
  { name: "Hooli Cars",        industry: "Auto Marketplace", contacts: 1, revenue: "$14,000",  status: "Lead",    website: "hoolicars.com",       phone: "+1 555-1006" },
  { name: "Pied Piper Auto",   industry: "Auto Tech",        contacts: 1, revenue: "$6,800",   status: "Lead",    website: "piedpiperauto.com",   phone: "+1 555-1007" },
  { name: "Dunder Auto Parts", industry: "Parts & Service",  contacts: 3, revenue: "$9,300",   status: "Churned", website: "dunderautoparts.com", phone: "+1 555-1008" },
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
  resetToSeedData: () => void;
  reloadFromDb: () => Promise<void>;
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

  // ── Mount: load from DB; if empty AND not in production mode, seed first ───
  useEffect(() => {
    async function load() {
      let data = await dbGetAll();

      // Only auto-seed if the system has never been deliberately reset to empty.
      // Once admin runs "Reset System Data", we set a flag so demo data is never re-seeded.
      const isProductionMode = typeof window !== "undefined" && localStorage.getItem("crm_production_mode") === "1";

      if (data.leads.length === 0 && !isProductionMode) {
        await dbReset({ leads: seedLeads, tasks: seedTasks, deals: seedDeals, companies: seedCompanies });
        data = await dbGetAll();
      }

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

  // ── Reset (legacy: re-seed with demo data) ─────────────────────────────────
  function resetToSeedData() {
    setLoaded(false);
    // Clear production mode flag so demo data can be seeded again
    if (typeof window !== "undefined") localStorage.removeItem("crm_production_mode");
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

  // ── Reload client state from DB (used after server-side purge) ────────────
  async function reloadFromDb() {
    const data = await dbGetAll();
    setLeads(data.leads);
    setTasks(data.tasks);
    setDeals(data.deals);
    setCompanies(data.companies);
    setActivities(data.activities);
    setMessages(data.messages);
    setLoaded(true);
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
      resetToSeedData, reloadFromDb,
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
