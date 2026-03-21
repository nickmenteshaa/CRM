"use server";

import { prisma } from "@/lib/db";

/**
 * Purge ALL business data from the database.
 * Keeps: schema, users/roles (localStorage-based), settings, UI.
 *
 * Deletion order respects foreign key constraints (children → parents):
 *
 *  1. ChatReaction     → FK to ChatMessage
 *  2. ChatMessage      → FK to ChatConversation, self-ref replyToId
 *  3. ChatConversation → (no parent FK besides messages already deleted)
 *  4. OrderLine        → FK to Deal + Part
 *  5. Activity         → FK to Lead
 *  6. Message          → FK to Lead
 *  7. Deal             → FK to Lead
 *  8. Task             → soft FK (leadId nullable), no hard FK
 *  9. Lead             → parent of Activity, Message, Deal
 * 10. SupplierPart     → FK to Supplier + Part
 * 11. Inventory        → FK to Part + Warehouse
 * 12. Part             → FK to Category
 * 13. Category         → self-ref parentId (children deleted recursively)
 * 14. Warehouse        → parent of Inventory (already deleted)
 * 15. Supplier         → parent of SupplierPart (already deleted)
 * 16. Company          → standalone
 *
 * Wrapped in a single transaction so partial deletes cannot happen.
 */
export async function dbResetAllBusinessData(): Promise<{ ok: boolean; counts: Record<string, number> }> {
  console.log("[RESET] dbResetAllBusinessData — server action invoked");
  const counts: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    console.log("[RESET] Transaction started — deleting all business data from Neon DB");
    // 1. Chat reactions (FK → ChatMessage)
    const r1 = await tx.chatReaction.deleteMany({});
    counts.chatReactions = r1.count;

    // 2. Chat messages — first clear self-referential replyToId, then delete all
    await tx.chatMessage.updateMany({ data: { replyToId: null } });
    const r2 = await tx.chatMessage.deleteMany({});
    counts.chatMessages = r2.count;

    // 3. Chat conversations
    const r3 = await tx.chatConversation.deleteMany({});
    counts.chatConversations = r3.count;

    // 4. Order lines (FK → Deal + Part)
    const r4 = await tx.orderLine.deleteMany({});
    counts.orderLines = r4.count;

    // 5. Activities (FK → Lead)
    const r5 = await tx.activity.deleteMany({});
    counts.activities = r5.count;

    // 6. Messages / communication records (FK → Lead)
    const r6 = await tx.message.deleteMany({});
    counts.messages = r6.count;

    // 7. Deals / orders (FK → Lead)
    const r7 = await tx.deal.deleteMany({});
    counts.deals = r7.count;

    // 8. Tasks (soft FK, no hard constraint)
    const r8 = await tx.task.deleteMany({});
    counts.tasks = r8.count;

    // 9. Leads / customers
    const r9 = await tx.lead.deleteMany({});
    counts.leads = r9.count;

    // 10. Supplier-Part links (FK → Supplier + Part)
    const r10 = await tx.supplierPart.deleteMany({});
    counts.supplierParts = r10.count;

    // 11. Inventory (FK → Part + Warehouse)
    const r11 = await tx.inventory.deleteMany({});
    counts.inventory = r11.count;

    // 12. Parts (FK → Category)
    const r12 = await tx.part.deleteMany({});
    counts.parts = r12.count;

    // 13. Categories — clear self-referential parentId, then delete
    await tx.category.updateMany({ data: { parentId: null } });
    const r13 = await tx.category.deleteMany({});
    counts.categories = r13.count;

    // 14. Warehouses
    const r14 = await tx.warehouse.deleteMany({});
    counts.warehouses = r14.count;

    // 15. Suppliers
    const r15 = await tx.supplier.deleteMany({});
    counts.suppliers = r15.count;

    // 16. Companies
    const r16 = await tx.company.deleteMany({});
    counts.companies = r16.count;
  });

  console.log("[RESET] Transaction complete — deleted records:", JSON.stringify(counts));
  return { ok: true, counts };
}
