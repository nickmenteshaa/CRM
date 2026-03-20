-- AlterTable: Add car industry fields to Lead
ALTER TABLE "Lead" ADD COLUMN "carModel" TEXT;
ALTER TABLE "Lead" ADD COLUMN "carYear" TEXT;
ALTER TABLE "Lead" ADD COLUMN "carPrice" TEXT;
ALTER TABLE "Lead" ADD COLUMN "carVin" TEXT;
ALTER TABLE "Lead" ADD COLUMN "carCondition" TEXT;

-- AlterTable: Add car industry fields to Deal
ALTER TABLE "Deal" ADD COLUMN "carModel" TEXT;
ALTER TABLE "Deal" ADD COLUMN "carYear" TEXT;
ALTER TABLE "Deal" ADD COLUMN "carPrice" TEXT;
ALTER TABLE "Deal" ADD COLUMN "carVin" TEXT;
ALTER TABLE "Deal" ADD COLUMN "carCondition" TEXT;
