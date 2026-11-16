-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PM', 'TEAM_LEADER', 'TEAM_MEMBER', 'ACCOUNTS', 'HR');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('PRE_SALES', 'ONBOARDING', 'WEB_DEV', 'AMC', 'SPEED_AUDIT', 'SEO', 'GOOGLE_ADS', 'SOCIAL_MEDIA', 'GRAPHIC_DESIGN');

-- CreateEnum
CREATE TYPE "StatusType" AS ENUM ('NOT_STARTED', 'ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD', 'DONE', 'STOPPED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('ONE_TIME', 'RETAINER', 'AMC');

-- CreateEnum
CREATE TYPE "Health" AS ENUM ('ON_TRACK', 'AT_RISK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('DELIVERABLE', 'CHANGE_REQUEST', 'REPORT', 'FIX', 'INTERNAL', 'PRESALES_REQUEST');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'EMAIL', 'WHATSAPP', 'TEMPLATE', 'IMPORT');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "TriageState" AS ENUM ('NEW', 'SUGGESTED', 'CONFIRMED', 'DISMISSED', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "BillingReason" AS ENUM ('ADDITIONAL_TASK', 'RENEWAL', 'NEW_PACKAGE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('REQUESTED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CHURNED');

-- CreateEnum
CREATE TYPE "StopReason" AS ENUM ('CLIENT_PAUSED', 'CLIENT_CHURNED', 'NON_PAYMENT', 'SCOPE_CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "Role"[],
    "teamId" TEXT,
    "weeklyCapacityH" DECIMAL(65,30) NOT NULL DEFAULT 40,
    "skills" TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "leaderId" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT,
    "market" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "pmId" TEXT NOT NULL,
    "salesOwnerId" TEXT,
    "tags" TEXT[],
    "emailDomains" TEXT[],
    "taxIdEnc" BYTEA,
    "contractValue" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "nameEnc" BYTEA NOT NULL,
    "emailEnc" BYTEA,
    "phoneEnc" BYTEA,
    "emailHash" TEXT,
    "phoneHash" TEXT,
    "keyId" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "secretEnc" BYTEA NOT NULL,
    "keyId" TEXT NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialGrant" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CredentialGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "statusType" "StatusType" NOT NULL,
    "phase" TEXT NOT NULL,
    "slaDays" INTEGER,
    "checklist" JSONB NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "name" TEXT NOT NULL,
    "setupTasks" JSONB NOT NULL,
    "cycleTasks" JSONB NOT NULL,
    "monthlyHours" DECIMAL(65,30),

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "packageId" TEXT,
    "type" "ProjectType" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "cycleDay" INTEGER,
    "health" "Health" NOT NULL DEFAULT 'ON_TRACK',
    "holdReason" TEXT,
    "stopReason" "StopReason",
    "pmId" TEXT NOT NULL,
    "teamId" TEXT,
    "value" DECIMAL(65,30),
    "billingCycle" TEXT,
    "parentProjectId" TEXT,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "title" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "teamId" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "plannedDate" TIMESTAMP(3),
    "estimateH" DECIMAL(65,30),
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "statusType" "StatusType" NOT NULL DEFAULT 'NOT_STARTED',
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "billableConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "sourceCommId" TEXT,
    "cycleMonth" TEXT,
    "dependsOnId" TEXT,
    "unlockAfterDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "direction" "Direction" NOT NULL,
    "mailboxId" TEXT,
    "externalId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "contactId" TEXT,
    "fromEnc" BYTEA NOT NULL,
    "toEnc" BYTEA,
    "subject" TEXT,
    "bodyMasked" TEXT NOT NULL,
    "bodyEnc" BYTEA NOT NULL,
    "attachments" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "triageState" "TriageState" NOT NULL DEFAULT 'NEW',
    "triage" JSONB,
    "searchVector" tsvector,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reason" "BillingReason" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "BillingStatus" NOT NULL DEFAULT 'REQUESTED',
    "invoiceNo" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "raisedById" TEXT NOT NULL,
    "taskIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "reasonEnc" BYTEA,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT,
    "teamId" TEXT,
    "members" TEXT[],

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "oauthEnc" BYTEA NOT NULL,
    "historyId" TEXT,
    "watchExpiry" TIMESTAMP(3),

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "from" JSONB,
    "to" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_emailHash_key" ON "Contact"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phoneHash_key" ON "Contact"("phoneHash");

-- CreateIndex
CREATE INDEX "CredentialGrant_userId_idx" ON "CredentialGrant"("userId");

-- CreateIndex
CREATE INDEX "CredentialGrant_expiresAt_idx" ON "CredentialGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_department_version_key" ON "Pipeline"("department", "version");

-- CreateIndex
CREATE INDEX "Task_assigneeId_statusType_idx" ON "Task"("assigneeId", "statusType");

-- CreateIndex
CREATE UNIQUE INDEX "Communication_externalId_key" ON "Communication"("externalId");

-- CreateIndex
CREATE INDEX "Communication_clientId_sentAt_idx" ON "Communication"("clientId", "sentAt");

-- CreateIndex
CREATE INDEX "Communication_threadKey_idx" ON "Communication"("threadKey");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_address_key" ON "Mailbox"("address");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialGrant" ADD CONSTRAINT "CredentialGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
