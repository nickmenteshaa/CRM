-- Phase 1: Spare Parts Foundation
-- All changes are ADDITIVE — no columns removed, no tables dropped.
-- All new columns are nullable or have defaults, safe for existing data.

-- ── Extend Lead with customer fields ────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "customerType" TEXT;
ALTER TABLE "Lead" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "shippingAddress" TEXT;
ALTER TABLE "Lead" ADD COLUMN "billingAddress" TEXT;
ALTER TABLE "Lead" ADD COLUMN "paymentTerms" TEXT;

-- ── Extend Task with order/supplier links ───────────────────────────────────
ALTER TABLE "Task" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Task" ADD COLUMN "supplierId" TEXT;

-- ── Extend Deal with order fields ───────────────────────────────────────────
ALTER TABLE "Deal" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "Deal" ADD COLUMN "orderStatus" TEXT;
ALTER TABLE "Deal" ADD COLUMN "shippingMethod" TEXT;
ALTER TABLE "Deal" ADD COLUMN "shippingCost" TEXT;
ALTER TABLE "Deal" ADD COLUMN "taxAmount" TEXT;
ALTER TABLE "Deal" ADD COLUMN "subtotal" TEXT;
ALTER TABLE "Deal" ADD COLUMN "grandTotal" TEXT;
ALTER TABLE "Deal" ADD COLUMN "notes" TEXT;

-- Unique constraint on orderNumber (allows NULLs — only enforced on non-null values)
CREATE UNIQUE INDEX "Deal_orderNumber_key" ON "Deal"("orderNumber");

-- ── Extend Company with spare-parts flags ───────────────────────────────────
ALTER TABLE "Company" ADD COLUMN "country" TEXT;
ALTER TABLE "Company" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Company" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "Company" ADD COLUMN "isSupplier" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "isCustomer" BOOLEAN NOT NULL DEFAULT false;

-- ── New table: Category ─────────────────────────────────────────────────────
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── New table: Part ─────────────────────────────────────────────────────────
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "oemNumber" TEXT,
    "brand" TEXT,
    "categoryId" TEXT,
    "compatMake" TEXT,
    "compatModel" TEXT,
    "compatYearFrom" TEXT,
    "compatYearTo" TEXT,
    "weight" TEXT,
    "dimensions" TEXT,
    "imageUrl" TEXT,
    "unitPrice" TEXT,
    "costPrice" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Part_sku_key" ON "Part"("sku");

ALTER TABLE "Part" ADD CONSTRAINT "Part_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── New table: Warehouse ────────────────────────────────────────────────────
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- ── New table: Inventory ────────────────────────────────────────────────────
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "binLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Inventory_partId_warehouseId_key" ON "Inventory"("partId", "warehouseId");

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── New table: Supplier ─────────────────────────────────────────────────────
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "website" TEXT,
    "leadTimeDays" INTEGER,
    "moq" INTEGER,
    "rating" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- ── New table: SupplierPart ─────────────────────────────────────────────────
CREATE TABLE "SupplierPart" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "costPrice" TEXT,
    "leadTimeDays" INTEGER,
    "moq" INTEGER,
    "supplierSku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierPart_supplierId_partId_key" ON "SupplierPart"("supplierId", "partId");

ALTER TABLE "SupplierPart" ADD CONSTRAINT "SupplierPart_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierPart" ADD CONSTRAINT "SupplierPart_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── New table: OrderLine ────────────────────────────────────────────────────
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" TEXT,
    "discount" TEXT,
    "lineTotal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
