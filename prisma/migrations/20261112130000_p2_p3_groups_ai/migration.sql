-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN "groupId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "sourceShoppingItemId" TEXT;

-- AlterTable
ALTER TABLE "SavingEntry" ADD COLUMN "groupId" TEXT;
ALTER TABLE "SavingEntry" ADD COLUMN "settlementId" TEXT;
ALTER TABLE "SavingEntry" ADD COLUMN "sourceListId" TEXT;
ALTER TABLE "SavingEntry" ADD COLUMN "supersededBySettlementId" TEXT;

-- CreateTable
CREATE TABLE "RecordGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceListId" TEXT,
    "sourceDeleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ListSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL,
    "members" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "UserAiConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "textModel" TEXT NOT NULL,
    "visionModel" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "AiDailyUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "quotaDate" TEXT NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "quotaDate" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'null',
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT,
    "leaseId" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Additive only: preserve the existing table and all financial rows.
ALTER TABLE "ShoppingList" ADD COLUMN "budget" INTEGER;
ALTER TABLE "ShoppingList" ADD COLUMN "savingMode" TEXT NOT NULL DEFAULT 'item';
ALTER TABLE "ShoppingList" ADD COLUMN "closedAt" DATETIME;

-- Bind by real list and shopping IDs, never by names. Ambiguous legacy links remain unbound.
INSERT INTO "RecordGroup" ("id", "ownerId", "name", "sourceListId")
SELECT 'list-group:' || l."id", l."ownerId", l."name", l."id" FROM "ShoppingList" l
WHERE EXISTS (SELECT 1 FROM "ShoppingItem" s WHERE s."listId" = l."id" AND s."ownerId" = l."ownerId" AND (s."ledgerId" IS NOT NULL OR EXISTS (SELECT 1 FROM "SavingEntry" v WHERE v."shoppingItemId" = s."id" AND v."ownerId" = s."ownerId")));

UPDATE "LedgerEntry" SET "sourceShoppingItemId" = (
 SELECT s."id" FROM "ShoppingItem" s WHERE s."ledgerId" = "LedgerEntry"."id" AND s."ownerId" = "LedgerEntry"."ownerId"
) WHERE "type" = 'expense' AND 1 = (SELECT COUNT(*) FROM "ShoppingItem" s WHERE s."ledgerId" = "LedgerEntry"."id" AND s."ownerId" = "LedgerEntry"."ownerId");
UPDATE "LedgerEntry" SET "groupId" = (SELECT g."id" FROM "RecordGroup" g JOIN "ShoppingItem" s ON s."listId" = g."sourceListId" AND s."ownerId" = g."ownerId" WHERE s."id" = "LedgerEntry"."sourceShoppingItemId" AND g."ownerId" = "LedgerEntry"."ownerId") WHERE "sourceShoppingItemId" IS NOT NULL;
UPDATE "LedgerEntry" SET "groupId" = (SELECT e."groupId" FROM "LedgerEntry" e WHERE e."id" = "LedgerEntry"."refundOfId" AND e."ownerId" = "LedgerEntry"."ownerId") WHERE "refundOfId" IS NOT NULL;
UPDATE "SavingEntry" SET "shoppingItemId" = (SELECT e."sourceShoppingItemId" FROM "LedgerEntry" e WHERE e."id" = "SavingEntry"."ledgerId" AND e."ownerId" = "SavingEntry"."ownerId") WHERE "shoppingItemId" IS NULL AND "ledgerId" IS NOT NULL;
UPDATE "SavingEntry" SET "sourceListId" = (SELECT s."listId" FROM "ShoppingItem" s WHERE s."id" = "SavingEntry"."shoppingItemId" AND s."ownerId" = "SavingEntry"."ownerId") WHERE "shoppingItemId" IS NOT NULL;
UPDATE "SavingEntry" SET "groupId" = (SELECT g."id" FROM "RecordGroup" g WHERE g."sourceListId" = "SavingEntry"."sourceListId" AND g."ownerId" = "SavingEntry"."ownerId") WHERE "sourceListId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RecordGroup_sourceListId_key" ON "RecordGroup"("sourceListId");

-- CreateIndex
CREATE INDEX "RecordGroup_ownerId_idx" ON "RecordGroup"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ListSettlement_listId_key" ON "ListSettlement"("listId");

-- CreateIndex
CREATE INDEX "ListSettlement_ownerId_idx" ON "ListSettlement"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAiConfig_ownerId_key" ON "UserAiConfig"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AiDailyUsage_ownerId_quotaDate_key" ON "AiDailyUsage"("ownerId", "quotaDate");

-- CreateIndex
CREATE INDEX "AiTask_ownerId_status_idx" ON "AiTask"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiTask_ownerId_operationId_key" ON "AiTask"("ownerId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_sourceShoppingItemId_key" ON "LedgerEntry"("sourceShoppingItemId");

-- CreateIndex
CREATE INDEX "LedgerEntry_ownerId_groupId_date_idx" ON "LedgerEntry"("ownerId", "groupId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SavingEntry_settlementId_key" ON "SavingEntry"("settlementId");

-- CreateIndex
CREATE INDEX "SavingEntry_ownerId_groupId_date_idx" ON "SavingEntry"("ownerId", "groupId", "date");

-- CreateIndex
CREATE INDEX "SavingEntry_ownerId_sourceListId_idx" ON "SavingEntry"("ownerId", "sourceListId");
