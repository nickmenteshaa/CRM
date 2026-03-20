-- Add file attachment columns to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentName" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentType" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentSize" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentData" TEXT;
