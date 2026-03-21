/**
 * Import configurations for each module.
 * These are factory functions so they can capture the latest existingData
 * and save callbacks from the calling component.
 */

import type { ImportConfig, ColumnDef } from "@/components/ImportModal";
import { validateEmail, validateNumeric } from "@/components/ImportModal";
import type { Company, Lead, Part, Supplier, Deal, OrderLine } from "@/context/AppContext";
import type { AuthUser, Role, Team } from "@/context/AuthContext";

// ── Companies ────────────────────────────────────────────────────────────────

const COMPANY_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Company Name", required: true },
  { key: "industry", label: "Industry" },
  { key: "revenue", label: "Revenue" },
  { key: "status", label: "Status" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "country", label: "Country" },
  { key: "taxId", label: "Tax ID" },
  { key: "paymentTerms", label: "Payment Terms" },
];

export function companyImportConfig(opts: {
  existing: Company[];
  onAdd: (c: Omit<Company, "id">) => void;
  onUpdate: (id: string, c: Partial<Company>) => void;
}): ImportConfig<Company> {
  return {
    moduleName: "Companies",
    columns: COMPANY_COLUMNS,
    duplicateKey: "company name",
    existingData: opts.existing,
    buildRecord: (row) => ({
      name: row.name,
      industry: row.industry || "",
      contacts: 0,
      revenue: row.revenue || "$0",
      status: row.status || "Lead",
      phone: row.phone || undefined,
      website: row.website || undefined,
      country: row.country || undefined,
      taxId: row.taxId || undefined,
      paymentTerms: row.paymentTerms || undefined,
    }),
    findDuplicate: (row, existing) =>
      existing.find((c) => c.name.toLowerCase() === row.name?.toLowerCase()),
    saveNew: (record) => opts.onAdd(record),
    saveUpdate: (id, record) => opts.onUpdate(id, record as Partial<Company>),
  };
}

// ── Customers ────────────────────────────────────────────────────────────────

const CUSTOMER_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name" },
  { key: "companyName", label: "Company Name" },
  { key: "email", label: "Email", validate: validateEmail },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "customerType", label: "Customer Type" },
  { key: "country", label: "Country" },
  { key: "preferredBrands", label: "Preferred Brands" },
  { key: "taxId", label: "Tax ID" },
  { key: "shippingAddress", label: "Shipping Address" },
  { key: "billingAddress", label: "Billing Address" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "customerNotes", label: "Notes" },
];

const VALID_CUSTOMER_TYPES = ["individual", "workshop", "dealer", "distributor"];

export function customerImportConfig(opts: {
  existing: Lead[];
  onAdd: (l: Omit<Lead, "id">) => Promise<void> | void;
  onUpdate: (id: string, l: Partial<Lead>) => Promise<void> | void;
  onBulkBatch?: (batch: Omit<Lead, "id">[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<Lead> {
  return {
    moduleName: "Customers",
    validateRow: validateCustomerRow,
    columns: CUSTOMER_COLUMNS.map((col) => {
      if (col.key === "customerType") {
        return {
          ...col,
          validate: (v: string) => {
            if (!v) return null;
            return VALID_CUSTOMER_TYPES.includes(v.toLowerCase())
              ? null
              : `Must be one of: ${VALID_CUSTOMER_TYPES.join(", ")}`;
          },
        };
      }
      return col;
    }),
    duplicateKey: "email or name + company",
    existingData: opts.existing,
    buildRecord: (row) => ({
      name: row.name || "",
      email: row.email || "",
      phone: row.phone || "",
      status: row.status || "New",
      source: row.source || "Website",
      lastContact: "Today",
      companyName: row.companyName || "",
      customerType: row.customerType?.toLowerCase() || "",
      country: row.country || "",
      preferredBrands: row.preferredBrands || "",
      taxId: row.taxId || "",
      shippingAddress: row.shippingAddress || "",
      billingAddress: row.billingAddress || "",
      paymentTerms: row.paymentTerms || "",
      customerNotes: row.customerNotes || "",
    }),
    findDuplicate: (row, existing) => {
      // Match by email first if present
      if (row.email) {
        const match = existing.find(
          (l) => l.email?.toLowerCase() === row.email.toLowerCase()
        );
        if (match) return match;
      }
      // Then by name + company
      if (row.name && row.companyName) {
        return existing.find(
          (l) =>
            l.name?.toLowerCase() === row.name.toLowerCase() &&
            l.companyName?.toLowerCase() === row.companyName.toLowerCase()
        );
      }
      return undefined;
    },
    saveNew: async (record) => { await opts.onAdd(record); },
    saveUpdate: async (id, record) => { await opts.onUpdate(id, record as Partial<Lead>); },
    bulkSaveBatch: opts.onBulkBatch,
    bulkApiRoute: opts.bulkApiRoute,
  };
}

// Custom validation: at least name or companyName required
export function validateCustomerRow(row: Record<string, string>): string | null {
  if (!row.name?.trim() && !row.companyName?.trim()) {
    return "Name or Company Name is required";
  }
  return null;
}

// ── Parts Catalog ────────────────────────────────────────────────────────────

const PART_COLUMNS: ColumnDef[] = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Name", required: true },
  { key: "description", label: "Description" },
  { key: "oemNumber", label: "OEM Number" },
  { key: "brand", label: "Brand" },
  { key: "compatMake", label: "Compatible Make" },
  { key: "compatModel", label: "Compatible Model" },
  { key: "compatYearFrom", label: "Year From" },
  { key: "compatYearTo", label: "Year To" },
  { key: "weight", label: "Weight" },
  { key: "dimensions", label: "Dimensions" },
  { key: "unitPrice", label: "Unit Price", validate: validateNumeric },
  { key: "costPrice", label: "Cost Price", validate: validateNumeric },
];

export function partImportConfig(opts: {
  existing: Part[];
  onAdd: (p: Omit<Part, "id">) => Promise<Part>;
  onUpdate: (id: string, p: Partial<Part>) => Promise<Part>;
  onBulkBatch?: (batch: Omit<Part, "id">[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<Part> {
  return {
    moduleName: "Parts Catalog",
    columns: PART_COLUMNS,
    duplicateKey: "SKU",
    existingData: opts.existing,
    buildRecord: (row) => ({
      sku: row.sku.trim(),
      name: row.name.trim(),
      description: row.description || undefined,
      oemNumber: row.oemNumber || undefined,
      brand: row.brand || undefined,
      compatMake: row.compatMake || undefined,
      compatModel: row.compatModel || undefined,
      compatYearFrom: row.compatYearFrom || undefined,
      compatYearTo: row.compatYearTo || undefined,
      weight: row.weight || undefined,
      dimensions: row.dimensions || undefined,
      unitPrice: row.unitPrice || undefined,
      costPrice: row.costPrice || undefined,
      isActive: true,
    }),
    findDuplicate: (row, existing) =>
      existing.find((p) => p.sku.toLowerCase() === row.sku?.toLowerCase()),
    saveNew: async (record) => { await opts.onAdd(record); },
    saveUpdate: async (id, record) => { await opts.onUpdate(id, record as Partial<Part>); },
    bulkSaveBatch: opts.onBulkBatch,
    bulkApiRoute: opts.bulkApiRoute,
  };
}

// ── Suppliers ────────────────────────────────────────────────────────────────

const SUPPLIER_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Supplier Name", required: true },
  { key: "contactName", label: "Contact Name" },
  { key: "email", label: "Email", validate: validateEmail },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "website", label: "Website" },
  { key: "leadTimeDays", label: "Lead Time (Days)", validate: validateNumeric },
  { key: "moq", label: "MOQ", validate: validateNumeric },
  { key: "rating", label: "Rating", validate: (v: string) => {
    if (!v) return null;
    const n = Number(v);
    if (isNaN(n)) return "Must be a number";
    if (n < 0 || n > 5) return "Rating must be between 0 and 5";
    return null;
  }},
  { key: "notes", label: "Notes" },
];

export function supplierImportConfig(opts: {
  existing: Supplier[];
  onAdd: (s: Omit<Supplier, "id">) => Promise<Supplier>;
  onUpdate: (id: string, s: Partial<Supplier>) => Promise<Supplier>;
  onBulkBatch?: (batch: Omit<Supplier, "id">[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<Supplier> {
  return {
    moduleName: "Suppliers",
    columns: SUPPLIER_COLUMNS,
    duplicateKey: "supplier name + email",
    existingData: opts.existing,
    buildRecord: (row) => ({
      name: row.name.trim(),
      contactName: row.contactName || undefined,
      email: row.email || undefined,
      phone: row.phone || undefined,
      country: row.country || undefined,
      website: row.website || undefined,
      leadTimeDays: row.leadTimeDays ? Number(row.leadTimeDays) : undefined,
      moq: row.moq ? Number(row.moq) : undefined,
      rating: row.rating ? Number(row.rating) : undefined,
      notes: row.notes || undefined,
      isActive: true,
    }),
    findDuplicate: (row, existing) =>
      existing.find((s) => {
        const nameMatch = s.name.toLowerCase() === row.name?.toLowerCase();
        if (row.email) {
          return nameMatch && s.email?.toLowerCase() === row.email.toLowerCase();
        }
        return nameMatch;
      }),
    saveNew: async (record) => { await opts.onAdd(record); },
    saveUpdate: async (id, record) => { await opts.onUpdate(id, record as Partial<Supplier>); },
    bulkSaveBatch: opts.onBulkBatch,
    bulkApiRoute: opts.bulkApiRoute,
  };
}

// ── Inventory ────────────────────────────────────────────────────────────────

const INVENTORY_COLUMNS: ColumnDef[] = [
  { key: "partSku", label: "Part SKU", required: true },
  { key: "warehouseName", label: "Warehouse Name", required: true },
  { key: "quantityOnHand", label: "Qty On Hand", required: true, validate: validateNumeric },
  { key: "quantityReserved", label: "Qty Reserved", validate: validateNumeric },
  { key: "reorderPoint", label: "Reorder Point", validate: validateNumeric },
  { key: "binLocation", label: "Bin Location" },
];

type InventoryImportItem = {
  id: string;
  partId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  reorderPoint: number;
  binLocation?: string;
  partName?: string;
  sku?: string;
  warehouseName?: string;
};

export function inventoryImportConfig(opts: {
  existing: InventoryImportItem[];
  warehouses: { id: string; name: string }[];
  onAdd: (data: Omit<InventoryImportItem, "id">) => Promise<any>;
  onUpdate: (id: string, data: Partial<InventoryImportItem>) => Promise<any>;
  onBulkBatch?: (batch: { partId: string; warehouseId: string; quantityOnHand: number; quantityReserved?: number; reorderPoint?: number; binLocation?: string }[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<InventoryImportItem> {
  // Build lookup maps for SKU → partId and warehouseName → warehouseId
  // These will be populated during the build phase
  return {
    moduleName: "Inventory",
    columns: INVENTORY_COLUMNS,
    duplicateKey: "Part SKU + Warehouse",
    existingData: opts.existing,
    buildRecord: (row) => ({
      // These will be resolved — partSku/warehouseName are placeholders
      partId: row.partSku?.trim() ?? "",
      warehouseId: row.warehouseName?.trim() ?? "",
      quantityOnHand: Number(row.quantityOnHand) || 0,
      quantityReserved: Number(row.quantityReserved) || 0,
      reorderPoint: Number(row.reorderPoint) || 0,
      binLocation: row.binLocation || undefined,
    }),
    findDuplicate: (row, existing) =>
      existing.find((e) =>
        (e.sku?.toLowerCase() === row.partSku?.toLowerCase() || e.partId === row.partSku) &&
        (e.warehouseName?.toLowerCase() === row.warehouseName?.toLowerCase() || e.warehouseId === row.warehouseName)
      ),
    saveNew: async (record) => { await opts.onAdd(record); },
    saveUpdate: async (id, record) => { await opts.onUpdate(id, record as Partial<InventoryImportItem>); },
    bulkSaveBatch: opts.onBulkBatch as any,
    bulkApiRoute: opts.bulkApiRoute,
  };
}

// ── Employees ────────────────────────────────────────────────────────────────

const EMPLOYEE_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true, validate: validateEmail },
  { key: "role", label: "Role", validate: (v: string) => {
    if (!v) return null;
    const valid = ["admin", "manager", "senior_rep", "sales_rep"];
    if (!valid.includes(v.toLowerCase().replace(/\s+/g, "_"))) {
      return `Must be one of: ${valid.join(", ")}`;
    }
    return null;
  }},
  { key: "team", label: "Team" },
  { key: "region", label: "Region" },
  { key: "managerEmail", label: "Manager Email", validate: (v: string) => {
    if (!v) return null;
    return validateEmail(v);
  }},
];

type EmployeeImportRecord = AuthUser & { password?: string; region?: string };

export function employeeImportConfig(opts: {
  existing: AuthUser[];
  teams: Team[];
  onAdd: (record: { name: string; email: string; password: string; role: Role; managerId?: string; teamId?: string }) => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (id: string, updates: { name?: string; email?: string; role?: Role; managerId?: string | null; teamId?: string | null }) => Promise<{ ok: boolean; error?: string }>;
  onBulkBatch?: (batch: { name: string; email: string; password?: string; role?: string; teamId?: string; region?: string; managerId?: string }[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<EmployeeImportRecord> {
  const teamByName = new Map(opts.teams.map((t) => [t.name.toLowerCase(), t]));
  const userByEmail = new Map(opts.existing.map((u) => [u.email.toLowerCase(), u]));

  return {
    moduleName: "Employees",
    columns: EMPLOYEE_COLUMNS,
    duplicateKey: "email",
    existingData: opts.existing as EmployeeImportRecord[],
    buildRecord: (row) => {
      const rawRole = (row.role || "sales_rep").toLowerCase().replace(/\s+/g, "_");
      const role = (["admin", "manager", "senior_rep", "sales_rep"].includes(rawRole) ? rawRole : "sales_rep") as Role;

      let managerId: string | undefined;
      if (row.managerEmail) {
        const mgr = userByEmail.get(row.managerEmail.trim().toLowerCase());
        if (mgr) managerId = mgr.id;
      }

      let teamId: string | undefined;
      if (row.team) {
        const team = teamByName.get(row.team.trim().toLowerCase());
        if (team) teamId = team.id;
      }

      return {
        name: row.name.trim(),
        email: row.email.trim().toLowerCase(),
        password: "changeme123",
        role,
        managerId,
        teamId,
        region: row.region || undefined,
      };
    },
    findDuplicate: (row, existing) =>
      existing.find((e) => e.email.toLowerCase() === row.email?.toLowerCase()),
    saveNew: async (record) => {
      const result = await opts.onAdd({
        name: record.name,
        email: record.email,
        password: (record as any).password || "changeme123",
        role: record.role,
        managerId: record.managerId,
        teamId: record.teamId,
      });
      if (!result.ok) throw new Error(result.error ?? "Failed to create employee");
    },
    saveUpdate: async (id, record) => {
      const result = await opts.onUpdate(id, {
        name: record.name,
        email: record.email,
        role: record.role,
        managerId: record.managerId ?? null,
        teamId: record.teamId ?? null,
      });
      if (!result.ok) throw new Error(result.error ?? "Failed to update employee");
    },
    bulkSaveBatch: opts.onBulkBatch as any,
    bulkApiRoute: opts.bulkApiRoute,
  };
}

// ── Orders (Deals) ──────────────────────────────────────────────────────────

const ORDER_COLUMNS: ColumnDef[] = [
  { key: "orderNumber", label: "Order Number", required: true },
  { key: "name", label: "Order Name", required: true },
  { key: "customerName", label: "Customer Name", required: true },
  { key: "repEmail", label: "Assigned Rep Email" },
  { key: "orderStatus", label: "Order Status" },
  { key: "stage", label: "Stage" },
  { key: "shippingMethod", label: "Shipping Method" },
  { key: "subtotal", label: "Subtotal", validate: validateNumeric },
  { key: "taxAmount", label: "Tax Amount", validate: validateNumeric },
  { key: "shippingCost", label: "Shipping Cost", validate: validateNumeric },
  { key: "grandTotal", label: "Grand Total", validate: validateNumeric },
  { key: "notes", label: "Notes" },
];

export function orderImportConfig(opts: {
  existing: Deal[];
  customers: Lead[];
  employees: { id: string; name: string; email: string }[];
  onAdd: (data: Omit<Deal, "id">) => void | Promise<Deal>;
  onUpdate: (id: string, data: Partial<Deal>) => void | Promise<Deal>;
  onBulkBatch?: (batch: Omit<Deal, "id">[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<Deal> {
  const customerByName = new Map(opts.customers.map((c) => [c.name.toLowerCase(), c]));
  const empByEmail = new Map(opts.employees.map((e) => [e.email.toLowerCase(), e]));

  return {
    moduleName: "Orders",
    columns: ORDER_COLUMNS,
    duplicateKey: "Order Number",
    existingData: opts.existing,
    validateRow: (row) => {
      if (row.customerName && !customerByName.has(row.customerName.trim().toLowerCase())) {
        return `Customer "${row.customerName}" not found`;
      }
      if (row.repEmail && !empByEmail.has(row.repEmail.trim().toLowerCase())) {
        return `Employee "${row.repEmail}" not found`;
      }
      return null;
    },
    buildRecord: (row) => {
      const customer = row.customerName ? customerByName.get(row.customerName.trim().toLowerCase()) : undefined;
      const rep = row.repEmail ? empByEmail.get(row.repEmail.trim().toLowerCase()) : undefined;

      return {
        name: row.name.trim(),
        contact: row.customerName?.trim() ?? "",
        value: row.grandTotal || row.subtotal || "0",
        stage: row.stage || "New Opportunity",
        close: "",
        orderNumber: row.orderNumber?.trim(),
        orderStatus: row.orderStatus || "New",
        leadId: customer?.id,
        leadName: customer?.name,
        owner: rep?.name,
        ownerId: rep?.id,
        shippingMethod: row.shippingMethod || undefined,
        subtotal: row.subtotal || undefined,
        taxAmount: row.taxAmount || undefined,
        shippingCost: row.shippingCost || undefined,
        grandTotal: row.grandTotal || undefined,
        notes: row.notes || undefined,
        isQuote: false,
      };
    },
    findDuplicate: (row, existing) =>
      existing.find((e) => e.orderNumber?.toLowerCase() === row.orderNumber?.toLowerCase()),
    saveNew: async (record) => { await opts.onAdd(record); },
    saveUpdate: async (id, record) => { await opts.onUpdate(id, record as Partial<Deal>); },
    bulkSaveBatch: opts.onBulkBatch,
    bulkApiRoute: opts.bulkApiRoute,
  };
}

// ── Order Items (OrderLines) ────────────────────────────────────────────────

const ORDER_ITEM_COLUMNS: ColumnDef[] = [
  { key: "orderNumber", label: "Order Number", required: true },
  { key: "sku", label: "SKU", required: true },
  { key: "quantity", label: "Quantity", required: true, validate: validateNumeric },
  { key: "unitPrice", label: "Unit Price", validate: validateNumeric },
  { key: "discount", label: "Discount %", validate: validateNumeric },
  { key: "lineTotal", label: "Line Total", validate: validateNumeric },
];

type OrderLineImportItem = OrderLine & { orderNumber?: string; sku?: string };

export function orderItemImportConfig(opts: {
  existing: OrderLineImportItem[];
  orders: Deal[];
  parts: Part[];
  onAdd: (data: Omit<OrderLine, "id">) => Promise<OrderLine>;
  onUpdate: (id: string, data: Partial<OrderLine>) => Promise<OrderLine>;
  onBulkBatch?: (batch: Omit<OrderLine, "id">[]) => Promise<{ created: number; skipped: number; error?: string }>;
  bulkApiRoute?: string;
}): ImportConfig<OrderLineImportItem> {
  const orderByNum = new Map(opts.orders.map((o) => [o.orderNumber?.toLowerCase() ?? "", o]));
  const partBySku = new Map(opts.parts.map((p) => [p.sku.toLowerCase(), p]));

  return {
    moduleName: "Order Items",
    columns: ORDER_ITEM_COLUMNS,
    duplicateKey: "Order Number + SKU",
    existingData: opts.existing,
    validateRow: (row) => {
      if (row.orderNumber && !orderByNum.has(row.orderNumber.trim().toLowerCase())) {
        return `Order "${row.orderNumber}" not found`;
      }
      if (row.sku && !partBySku.has(row.sku.trim().toLowerCase())) {
        return `Part SKU "${row.sku}" not found`;
      }
      return null;
    },
    buildRecord: (row) => {
      const order = orderByNum.get(row.orderNumber?.trim().toLowerCase() ?? "");
      const part = partBySku.get(row.sku?.trim().toLowerCase() ?? "");

      return {
        dealId: order?.id ?? "",
        partId: part?.id ?? "",
        quantity: Number(row.quantity) || 1,
        unitPrice: row.unitPrice || undefined,
        discount: row.discount || undefined,
        lineTotal: row.lineTotal || undefined,
      };
    },
    findDuplicate: (row, existing) =>
      existing.find((e) =>
        e.orderNumber?.toLowerCase() === row.orderNumber?.toLowerCase() &&
        e.sku?.toLowerCase() === row.sku?.toLowerCase()
      ),
    saveNew: async (record) => { await opts.onAdd(record); },
    saveUpdate: async (id, record) => { await opts.onUpdate(id, record as Partial<OrderLine>); },
    bulkSaveBatch: opts.onBulkBatch as any,
    bulkApiRoute: opts.bulkApiRoute,
  };
}
