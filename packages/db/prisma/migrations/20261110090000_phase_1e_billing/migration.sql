-- AlterTable
ALTER TABLE "BillingRequest" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "renewalKey" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "BillingMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingMessage_requestId_createdAt_idx" ON "BillingMessage"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRequest_renewalKey_key" ON "BillingRequest"("renewalKey");

-- CreateIndex
CREATE INDEX "BillingRequest_status_createdAt_idx" ON "BillingRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingRequest_clientId_idx" ON "BillingRequest"("clientId");

-- CreateIndex
CREATE INDEX "BillingRequest_projectId_idx" ON "BillingRequest"("projectId");

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMessage" ADD CONSTRAINT "BillingMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BillingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

