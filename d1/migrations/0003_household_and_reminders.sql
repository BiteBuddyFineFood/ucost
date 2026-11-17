ALTER TABLE "ShoppingList" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'shopping';
ALTER TABLE "ShoppingList" ADD COLUMN "departureDate" TEXT;

ALTER TABLE "ShoppingItem" ADD COLUMN "done" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShoppingItem" ADD COLUMN "groupName" TEXT NOT NULL DEFAULT '';

CREATE TABLE "OwnedItem_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "purchaseDate" TEXT,
  "retiredDate" TEXT,
  "price" INTEGER,
  "recovery" INTEGER NOT NULL DEFAULT 0,
  "ledgerId" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "mode" TEXT NOT NULL DEFAULT 'day',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL DEFAULT '件',
  "storageEnabled" INTEGER NOT NULL DEFAULT 0,
  "expiryEnabled" INTEGER NOT NULL DEFAULT 0,
  "costEnabled" INTEGER NOT NULL DEFAULT 1,
  "location" TEXT NOT NULL DEFAULT '',
  "boxId" TEXT,
  "expiresOn" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "sourceNote" TEXT NOT NULL DEFAULT '',
  "quantityConfirmedAt" INTEGER,
  "sourceDraftId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
INSERT INTO "OwnedItem_new" (
  "id", "ownerId", "name", "purchaseDate", "retiredDate", "price", "recovery",
  "ledgerId", "note", "mode", "quantity", "unit", "storageEnabled",
  "expiryEnabled", "costEnabled", "location", "boxId", "expiresOn", "status",
  "sourceNote", "quantityConfirmedAt", "sourceDraftId", "version", "createdAt",
  "updatedAt"
)
SELECT
  "id", "ownerId", "name", "purchaseDate", "retiredDate", "price", "recovery",
  "ledgerId", "note", "mode", 1, '件', 0, 0, 1, '', NULL, NULL, 'active',
  '', "createdAt", "sourceDraftId", "version", "createdAt", "createdAt"
FROM "OwnedItem";
DROP TABLE "OwnedItem";
ALTER TABLE "OwnedItem_new" RENAME TO "OwnedItem";
CREATE INDEX IF NOT EXISTS "OwnedItem_ownerId_idx" ON "OwnedItem" ("ownerId");
CREATE INDEX IF NOT EXISTS "OwnedItem_boxId_idx" ON "OwnedItem" ("boxId");
CREATE INDEX IF NOT EXISTS "OwnedItem_expiresOn_idx" ON "OwnedItem" ("expiresOn");

CREATE TABLE IF NOT EXISTS "StorageBox" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "StorageBox_ownerId_idx" ON "StorageBox" ("ownerId");

CREATE TABLE IF NOT EXISTS "ReminderRule" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "fixedAt" INTEGER,
  "offsetDays" INTEGER,
  "localTime" TEXT NOT NULL DEFAULT '09:00',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ReminderRule_ownerId_idx" ON "ReminderRule" ("ownerId");
CREATE INDEX IF NOT EXISTS "ReminderRule_targetId_idx" ON "ReminderRule" ("targetId");

CREATE TABLE IF NOT EXISTS "ReminderOccurrence" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "dueAt" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "handledAt" INTEGER,
  "snoozedUntil" INTEGER,
  "anchorDate" TEXT,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderOccurrence_dedupeKey_key" ON "ReminderOccurrence" ("dedupeKey");
CREATE INDEX IF NOT EXISTS "ReminderOccurrence_ownerId_idx" ON "ReminderOccurrence" ("ownerId");
CREATE INDEX IF NOT EXISTS "ReminderOccurrence_targetId_idx" ON "ReminderOccurrence" ("targetId");
