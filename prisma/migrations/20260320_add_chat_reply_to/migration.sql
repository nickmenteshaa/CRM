-- Add reply-to reference to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" TEXT;

-- Add foreign key (SetNull on delete)
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
