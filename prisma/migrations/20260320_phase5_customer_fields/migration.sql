-- Phase 5: Additional customer fields on Lead
-- All additive, all nullable, safe for existing data.

ALTER TABLE "Lead" ADD COLUMN "companyName" TEXT;
ALTER TABLE "Lead" ADD COLUMN "country" TEXT;
ALTER TABLE "Lead" ADD COLUMN "preferredBrands" TEXT;
ALTER TABLE "Lead" ADD COLUMN "customerNotes" TEXT;
