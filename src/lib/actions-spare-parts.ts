"use server";

import { prisma } from "@/lib/db";
import type {
  Part, PartCategory, Warehouse, InventoryItem,
  Supplier, SupplierPart, OrderLine,
} from "@/context/AppContext";

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapPart(r: {
  id: string; sku: string; name: string; description: string | null;
  oemNumber: string | null; brand: string | null; categoryId: string | null;
  compatMake: string | null; compatModel: string | null;
  compatYearFrom: string | null; compatYearTo: string | null;
  weight: string | null; dimensions: string | null; imageUrl: string | null;
  unitPrice: string | null; costPrice: string | null;
  isActive: boolean; createdAt: Date;
  [k: string]: unknown;
}): Part {
  return {
    id: r.id, sku: r.sku, name: r.name,
    description: r.description ?? undefined,
    oemNumber: r.oemNumber ?? undefined,
    brand: r.brand ?? undefined,
    categoryId: r.categoryId ?? undefined,
    compatMake: r.compatMake ?? undefined,
    compatModel: r.compatModel ?? undefined,
    compatYearFrom: r.compatYearFrom ?? undefined,
    compatYearTo: r.compatYearTo ?? undefined,
    weight: r.weight ?? undefined,
    dimensions: r.dimensions ?? undefined,
    imageUrl: r.imageUrl ?? undefined,
    unitPrice: r.unitPrice ?? undefined,
    costPrice: r.costPrice ?? undefined,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

function mapCategory(r: {
  id: string; name: string; description: string | null; parentId: string | null;
  [k: string]: unknown;
}): PartCategory {
  return {
    id: r.id, name: r.name,
    description: r.description ?? undefined,
    parentId: r.parentId ?? undefined,
  };
}

function mapWarehouse(r: {
  id: string; name: string; address: string | null; city: string | null;
  country: string | null; isActive: boolean;
  [k: string]: unknown;
}): Warehouse {
  return {
    id: r.id, name: r.name,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    country: r.country ?? undefined,
    isActive: r.isActive,
  };
}

function mapInventory(r: {
  id: string; partId: string; warehouseId: string;
  quantityOnHand: number; quantityReserved: number; reorderPoint: number;
  binLocation: string | null;
  [k: string]: unknown;
}): InventoryItem {
  return {
    id: r.id, partId: r.partId, warehouseId: r.warehouseId,
    quantityOnHand: r.quantityOnHand,
    quantityReserved: r.quantityReserved,
    reorderPoint: r.reorderPoint,
    binLocation: r.binLocation ?? undefined,
  };
}

function mapSupplier(r: {
  id: string; name: string; contactName: string | null; email: string | null;
  phone: string | null; country: string | null; website: string | null;
  leadTimeDays: number | null; moq: number | null; rating: number | null;
  notes: string | null; isActive: boolean;
  [k: string]: unknown;
}): Supplier {
  return {
    id: r.id, name: r.name,
    contactName: r.contactName ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    country: r.country ?? undefined,
    website: r.website ?? undefined,
    leadTimeDays: r.leadTimeDays ?? undefined,
    moq: r.moq ?? undefined,
    rating: r.rating ?? undefined,
    notes: r.notes ?? undefined,
    isActive: r.isActive,
  };
}

function mapSupplierPart(r: {
  id: string; supplierId: string; partId: string;
  costPrice: string | null; leadTimeDays: number | null;
  moq: number | null; supplierSku: string | null;
  [k: string]: unknown;
}): SupplierPart {
  return {
    id: r.id, supplierId: r.supplierId, partId: r.partId,
    costPrice: r.costPrice ?? undefined,
    leadTimeDays: r.leadTimeDays ?? undefined,
    moq: r.moq ?? undefined,
    supplierSku: r.supplierSku ?? undefined,
  };
}

function mapOrderLine(r: {
  id: string; dealId: string; partId: string; quantity: number;
  unitPrice: string | null; discount: string | null; lineTotal: string | null;
  [k: string]: unknown;
}): OrderLine {
  return {
    id: r.id, dealId: r.dealId, partId: r.partId,
    quantity: r.quantity,
    unitPrice: r.unitPrice ?? undefined,
    discount: r.discount ?? undefined,
    lineTotal: r.lineTotal ?? undefined,
  };
}

// ── READS (bulk) ─────────────────────────────────────────────────────────────

export async function dbGetSparePartsData(): Promise<{
  parts: Part[];
  categories: PartCategory[];
  warehouses: Warehouse[];
  inventory: InventoryItem[];
  suppliers: Supplier[];
  supplierParts: SupplierPart[];
  orderLines: OrderLine[];
}> {
  const [parts, categories, warehouses, inventory, suppliers, supplierParts, orderLines] =
    await Promise.all([
      prisma.part.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
      prisma.inventory.findMany(),
      prisma.supplier.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.supplierPart.findMany(),
      prisma.orderLine.findMany(),
    ]);
  return {
    parts: parts.map(mapPart),
    categories: categories.map(mapCategory),
    warehouses: warehouses.map(mapWarehouse),
    inventory: inventory.map(mapInventory),
    suppliers: suppliers.map(mapSupplier),
    supplierParts: supplierParts.map(mapSupplierPart),
    orderLines: orderLines.map(mapOrderLine),
  };
}

// ── PARTS CRUD ───────────────────────────────────────────────────────────────

export async function dbCreatePart(data: Omit<Part, "id">): Promise<Part> {
  const row = await prisma.part.create({
    data: {
      sku: data.sku, name: data.name,
      description: data.description, oemNumber: data.oemNumber,
      brand: data.brand, categoryId: data.categoryId,
      compatMake: data.compatMake, compatModel: data.compatModel,
      compatYearFrom: data.compatYearFrom, compatYearTo: data.compatYearTo,
      weight: data.weight, dimensions: data.dimensions,
      imageUrl: data.imageUrl, unitPrice: data.unitPrice,
      costPrice: data.costPrice, isActive: data.isActive ?? true,
    },
  });
  return mapPart(row);
}

/**
 * Insert a batch of parts via createMany. Internally splits into small sub-batches
 * of 50 rows to stay within Neon pooler limits, with retry logic.
 * The client sends up to 500 rows; this function handles safe writes.
 */
export async function dbBulkCreateParts(
  records: Omit<Part, "id">[],
): Promise<{ created: number; skipped: number; error?: string }> {
  const SUB_BATCH = 50; // small enough for Neon pooler transaction buffers
  const MAX_RETRIES = 2;
  let totalCreated = 0;
  let totalSkipped = 0;

  console.log(`[IMPORT] dbBulkCreateParts called with ${records.length} records`);

  for (let i = 0; i < records.length; i += SUB_BATCH) {
    const chunk = records.slice(i, i + SUB_BATCH);
    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.part.createMany({
          data: chunk.map((d) => ({
            sku: d.sku, name: d.name,
            description: d.description, oemNumber: d.oemNumber,
            brand: d.brand, categoryId: d.categoryId,
            compatMake: d.compatMake, compatModel: d.compatModel,
            compatYearFrom: d.compatYearFrom, compatYearTo: d.compatYearTo,
            weight: d.weight, dimensions: d.dimensions,
            imageUrl: d.imageUrl, unitPrice: d.unitPrice,
            costPrice: d.costPrice, isActive: d.isActive ?? true,
          })),
          skipDuplicates: true,
        });
        totalCreated += result.count;
        totalSkipped += chunk.length - result.count;
        success = true;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "DB write failed";
        console.error(`[IMPORT] Sub-batch ${i / SUB_BATCH + 1} attempt ${attempt + 1} failed: ${msg}`);
        if (attempt < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        } else {
          // Final attempt failed — return partial results with error
          const rowStart = i + 1;
          const rowEnd = Math.min(i + SUB_BATCH, records.length);
          console.error(`[IMPORT] Sub-batch rows ${rowStart}–${rowEnd} permanently failed`);
          return {
            created: totalCreated,
            skipped: totalSkipped,
            error: `Failed at rows ${rowStart}–${rowEnd} after ${MAX_RETRIES + 1} attempts: ${msg}`,
          };
        }
      }
    }
  }

  console.log(`[IMPORT] Batch complete: created=${totalCreated}, skipped=${totalSkipped}`);
  return { created: totalCreated, skipped: totalSkipped };
}

export async function dbUpdatePart(id: string, updates: Partial<Part>): Promise<Part> {
  const row = await prisma.part.update({
    where: { id },
    data: {
      ...(updates.sku !== undefined && { sku: updates.sku }),
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.oemNumber !== undefined && { oemNumber: updates.oemNumber }),
      ...(updates.brand !== undefined && { brand: updates.brand }),
      ...(updates.categoryId !== undefined && { categoryId: updates.categoryId }),
      ...(updates.compatMake !== undefined && { compatMake: updates.compatMake }),
      ...(updates.compatModel !== undefined && { compatModel: updates.compatModel }),
      ...(updates.compatYearFrom !== undefined && { compatYearFrom: updates.compatYearFrom }),
      ...(updates.compatYearTo !== undefined && { compatYearTo: updates.compatYearTo }),
      ...(updates.weight !== undefined && { weight: updates.weight }),
      ...(updates.dimensions !== undefined && { dimensions: updates.dimensions }),
      ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl }),
      ...(updates.unitPrice !== undefined && { unitPrice: updates.unitPrice }),
      ...(updates.costPrice !== undefined && { costPrice: updates.costPrice }),
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
    },
  });
  return mapPart(row);
}

export async function dbCheckPartDependencies(id: string): Promise<{
  inventoryCount: number;
  orderLineCount: number;
  supplierPartCount: number;
}> {
  const [inventoryCount, orderLineCount, supplierPartCount] = await Promise.all([
    prisma.inventory.count({ where: { partId: id } }),
    prisma.orderLine.count({ where: { partId: id } }),
    prisma.supplierPart.count({ where: { partId: id } }),
  ]);
  return { inventoryCount, orderLineCount, supplierPartCount };
}

export async function dbDeletePart(id: string): Promise<void> {
  await prisma.part.delete({ where: { id } });
}

// ── CATEGORIES CRUD ──────────────────────────────────────────────────────────

export async function dbCreateCategory(data: Omit<PartCategory, "id">): Promise<PartCategory> {
  const row = await prisma.category.create({
    data: { name: data.name, description: data.description, parentId: data.parentId },
  });
  return mapCategory(row);
}

export async function dbUpdateCategory(id: string, updates: Partial<PartCategory>): Promise<PartCategory> {
  const row = await prisma.category.update({
    where: { id },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.parentId !== undefined && { parentId: updates.parentId }),
    },
  });
  return mapCategory(row);
}

export async function dbDeleteCategory(id: string): Promise<void> {
  await prisma.category.delete({ where: { id } });
}

// ── WAREHOUSES CRUD ──────────────────────────────────────────────────────────

export async function dbCreateWarehouse(data: Omit<Warehouse, "id">): Promise<Warehouse> {
  const row = await prisma.warehouse.create({
    data: {
      name: data.name, address: data.address,
      city: data.city, country: data.country,
      isActive: data.isActive ?? true,
    },
  });
  return mapWarehouse(row);
}

export async function dbUpdateWarehouse(id: string, updates: Partial<Warehouse>): Promise<Warehouse> {
  const row = await prisma.warehouse.update({
    where: { id },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.city !== undefined && { city: updates.city }),
      ...(updates.country !== undefined && { country: updates.country }),
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
    },
  });
  return mapWarehouse(row);
}

export async function dbDeleteWarehouse(id: string): Promise<void> {
  await prisma.warehouse.delete({ where: { id } });
}

// ── INVENTORY CRUD ───────────────────────────────────────────────────────────

export async function dbCreateInventory(data: Omit<InventoryItem, "id">): Promise<InventoryItem> {
  const row = await prisma.inventory.create({
    data: {
      partId: data.partId, warehouseId: data.warehouseId,
      quantityOnHand: data.quantityOnHand, quantityReserved: data.quantityReserved,
      reorderPoint: data.reorderPoint, binLocation: data.binLocation,
    },
  });
  return mapInventory(row);
}

export async function dbUpdateInventory(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem> {
  const row = await prisma.inventory.update({
    where: { id },
    data: {
      ...(updates.quantityOnHand !== undefined && { quantityOnHand: updates.quantityOnHand }),
      ...(updates.quantityReserved !== undefined && { quantityReserved: updates.quantityReserved }),
      ...(updates.reorderPoint !== undefined && { reorderPoint: updates.reorderPoint }),
      ...(updates.binLocation !== undefined && { binLocation: updates.binLocation }),
    },
  });
  return mapInventory(row);
}

export async function dbDeleteInventory(id: string): Promise<void> {
  await prisma.inventory.delete({ where: { id } });
}

// ── SUPPLIERS CRUD ───────────────────────────────────────────────────────────

export async function dbCreateSupplier(data: Omit<Supplier, "id">): Promise<Supplier> {
  const row = await prisma.supplier.create({
    data: {
      name: data.name, contactName: data.contactName,
      email: data.email, phone: data.phone,
      country: data.country, website: data.website,
      leadTimeDays: data.leadTimeDays, moq: data.moq,
      rating: data.rating, notes: data.notes,
      isActive: data.isActive ?? true,
    },
  });
  return mapSupplier(row);
}

export async function dbUpdateSupplier(id: string, updates: Partial<Supplier>): Promise<Supplier> {
  const row = await prisma.supplier.update({
    where: { id },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.contactName !== undefined && { contactName: updates.contactName }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.country !== undefined && { country: updates.country }),
      ...(updates.website !== undefined && { website: updates.website }),
      ...(updates.leadTimeDays !== undefined && { leadTimeDays: updates.leadTimeDays }),
      ...(updates.moq !== undefined && { moq: updates.moq }),
      ...(updates.rating !== undefined && { rating: updates.rating }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
    },
  });
  return mapSupplier(row);
}

export async function dbDeleteSupplier(id: string): Promise<void> {
  await prisma.supplier.delete({ where: { id } });
}

// ── SUPPLIER PARTS CRUD ──────────────────────────────────────────────────────

export async function dbCreateSupplierPart(data: Omit<SupplierPart, "id">): Promise<SupplierPart> {
  const row = await prisma.supplierPart.create({
    data: {
      supplierId: data.supplierId, partId: data.partId,
      costPrice: data.costPrice, leadTimeDays: data.leadTimeDays,
      moq: data.moq, supplierSku: data.supplierSku,
    },
  });
  return mapSupplierPart(row);
}

export async function dbDeleteSupplierPart(id: string): Promise<void> {
  await prisma.supplierPart.delete({ where: { id } });
}

// ── ORDER LINES CRUD ─────────────────────────────────────────────────────────

export async function dbCreateOrderLine(data: Omit<OrderLine, "id">): Promise<OrderLine> {
  const row = await prisma.orderLine.create({
    data: {
      dealId: data.dealId, partId: data.partId,
      quantity: data.quantity, unitPrice: data.unitPrice,
      discount: data.discount, lineTotal: data.lineTotal,
    },
  });
  return mapOrderLine(row);
}

export async function dbUpdateOrderLine(id: string, updates: Partial<OrderLine>): Promise<OrderLine> {
  const row = await prisma.orderLine.update({
    where: { id },
    data: {
      ...(updates.quantity !== undefined && { quantity: updates.quantity }),
      ...(updates.unitPrice !== undefined && { unitPrice: updates.unitPrice }),
      ...(updates.discount !== undefined && { discount: updates.discount }),
      ...(updates.lineTotal !== undefined && { lineTotal: updates.lineTotal }),
    },
  });
  return mapOrderLine(row);
}

export async function dbDeleteOrderLine(id: string): Promise<void> {
  await prisma.orderLine.delete({ where: { id } });
}

// ── RESET: truncate spare-parts tables ───────────────────────────────────────

export async function dbResetSpareParts(): Promise<void> {
  await prisma.$transaction([
    prisma.orderLine.deleteMany(),
    prisma.supplierPart.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.warehouse.deleteMany(),
    prisma.part.deleteMany(),
    prisma.category.deleteMany(),
    prisma.supplier.deleteMany(),
  ]);
}
