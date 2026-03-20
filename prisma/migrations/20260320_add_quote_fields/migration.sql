-- Add RFQ / Quote fields to Deal table
ALTER TABLE "Deal" ADD COLUMN "isQuote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Deal" ADD COLUMN "quoteNumber" TEXT;
ALTER TABLE "Deal" ADD COLUMN "quoteStatus" TEXT;
ALTER TABLE "Deal" ADD COLUMN "validUntil" TEXT;
ALTER TABLE "Deal" ADD COLUMN "convertedToOrderId" TEXT;

-- Create unique index on quoteNumber
CREATE UNIQUE INDEX "Deal_quoteNumber_key" ON "Deal"("quoteNumber");
