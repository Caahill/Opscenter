-- AlterTable
ALTER TABLE "Communication" ADD COLUMN     "category" TEXT,
ADD COLUMN     "ccEnc" BYTEA,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fromHash" TEXT,
ADD COLUMN     "importId" TEXT,
ADD COLUMN     "linkMethod" TEXT,
ADD COLUMN     "messageIdHeader" TEXT,
ADD COLUMN     "sentById" TEXT,
ADD COLUMN     "subjectMasked" TEXT,
ADD COLUMN     "triageOutcome" JSONB,
ADD COLUMN     "triagedAt" TIMESTAMP(3),
ADD COLUMN     "triagedById" TEXT;

-- AlterTable
ALTER TABLE "Mailbox" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "backfillDoneAt" TIMESTAMP(3),
ADD COLUMN     "backfillFrom" TIMESTAMP(3),
ADD COLUMN     "backfillPageToken" TEXT,
ADD COLUMN     "connectedById" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "syncError" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "memberSendEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payloadEnc" BYTEA NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppImport" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "media" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "Communication_triageState_sentAt_idx" ON "Communication"("triageState", "sentAt");

-- CreateIndex
CREATE INDEX "Communication_fromHash_idx" ON "Communication"("fromHash");

-- CreateIndex
CREATE INDEX "Communication_projectId_idx" ON "Communication"("projectId");

-- CreateIndex
CREATE INDEX "Communication_taskId_idx" ON "Communication"("taskId");

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Full-text search (TechSpec 10): masked subject and body plus the client's name, so "client +
-- keyword" finds a message. Maintained by the API on write and by the search.reindex job.
CREATE INDEX "Communication_searchVector_idx" ON "Communication" USING GIN ("searchVector");
