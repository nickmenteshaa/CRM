/**
 * Import configurations for each module.
 * These are factory functions so they can capture the latest existingData
 * and save callbacks from the calling component.
 */

import type { ImportConfig, ColumnDef } from "@/components/ImportModal";
import { validateEmail, validateNumeric } from "@/components/ImportModal";
import type { Company, Lead, Part, Supplier } from "@/context/AppContext";

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
  onAdd: (l: Omit<Lead, "id">) => void;
  onUpdate: (id: string, l: Partial<Lead>) => void;
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
    saveNew: (record) => opts.onAdd(record),
    saveUpdate: (id, record) => opts.onUpdate(id, record as Partial<Lead>),
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
  };
}
