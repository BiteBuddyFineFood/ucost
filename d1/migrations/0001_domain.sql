CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "preferences" TEXT NOT NULL DEFAULT '{}',
  "autoBatch" INTEGER NOT NULL DEFAULT 0,
  "batchSize" INTEGER NOT NULL DEFAULT 5,
  "defaultExpenseAccountId" TEXT,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User" ("username");
CREATE INDEX IF NOT EXISTS "User_defaultExpenseAccountId_idx" ON "User" ("defaultExpenseAccountId");
CREATE TABLE IF NOT EXISTS "InviteCode" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "code" TEXT NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 10,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  "disabled" INTEGER NOT NULL DEFAULT 0,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "InviteCode_code_key" ON "InviteCode" ("code");
CREATE TABLE IF NOT EXISTS "InviteRedemption" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "codeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "InviteRedemption_ownerId_key" ON "InviteRedemption" ("ownerId");
CREATE INDEX IF NOT EXISTS "InviteRedemption_codeId_idx" ON "InviteRedemption" ("codeId");
CREATE INDEX IF NOT EXISTS "InviteRedemption_ownerId_idx" ON "InviteRedemption" ("ownerId");
CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");
CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "opening" INTEGER NOT NULL DEFAULT 0,
  "archived" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS "Account_ownerId_idx" ON "Account" ("ownerId");
CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "iconKey" TEXT NOT NULL DEFAULT 'tag',
  "color" TEXT NOT NULL DEFAULT '',
  "archived" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "Category_ownerId_type_name_key" ON "Category" ("ownerId","type","name");
CREATE INDEX IF NOT EXISTS "Category_ownerId_idx" ON "Category" ("ownerId");
CREATE TABLE IF NOT EXISTS "CategoryRule" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryRule_ownerId_keyword_key" ON "CategoryRule" ("ownerId","keyword");
CREATE INDEX IF NOT EXISTS "CategoryRule_ownerId_idx" ON "CategoryRule" ("ownerId");
CREATE INDEX IF NOT EXISTS "CategoryRule_categoryId_idx" ON "CategoryRule" ("categoryId");
CREATE TABLE IF NOT EXISTS "LedgerEntry" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "date" TEXT NOT NULL,
  "accountId" TEXT,
  "toAccountId" TEXT,
  "categoryId" TEXT,
  "refundOfId" TEXT,
  "discount" INTEGER NOT NULL DEFAULT 0,
  "grossAmount" INTEGER,
  "discountDetails" TEXT NOT NULL DEFAULT '',
  "autoSaving" INTEGER NOT NULL DEFAULT 1,
  "orderKey" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "sourceDraftId" TEXT,
  "groupId" TEXT,
  "sourceShoppingItemId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_sourceShoppingItemId_key" ON "LedgerEntry" ("sourceShoppingItemId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_ownerId_idx" ON "LedgerEntry" ("ownerId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_date_idx" ON "LedgerEntry" ("date");
CREATE INDEX IF NOT EXISTS "LedgerEntry_accountId_idx" ON "LedgerEntry" ("accountId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_toAccountId_idx" ON "LedgerEntry" ("toAccountId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_categoryId_idx" ON "LedgerEntry" ("categoryId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_refundOfId_idx" ON "LedgerEntry" ("refundOfId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_sourceDraftId_idx" ON "LedgerEntry" ("sourceDraftId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_groupId_idx" ON "LedgerEntry" ("groupId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_sourceShoppingItemId_idx" ON "LedgerEntry" ("sourceShoppingItemId");
CREATE TABLE IF NOT EXISTS "ShoppingList" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "archived" INTEGER NOT NULL DEFAULT 0,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "budget" INTEGER,
  "savingMode" TEXT NOT NULL DEFAULT 'item',
  "closedAt" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ShoppingList_ownerId_idx" ON "ShoppingList" ("ownerId");
CREATE TABLE IF NOT EXISTS "ShoppingItem" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" TEXT NOT NULL DEFAULT '',
  "budget" INTEGER,
  "reason" TEXT NOT NULL DEFAULT '',
  "requirements" TEXT NOT NULL DEFAULT '',
  "concerns" TEXT NOT NULL DEFAULT '',
  "alternatives" TEXT NOT NULL DEFAULT '',
  "timing" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "originalText" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'considering',
  "categoryId" TEXT,
  "ledgerId" TEXT,
  "ownedItemId" TEXT,
  "purchaseAmount" INTEGER,
  "purchasedAt" TEXT,
  "purchaseAccountId" TEXT,
  "purchaseDiscount" INTEGER,
  "purchaseDiscountDetails" TEXT NOT NULL DEFAULT '',
  "purchaseRevision" INTEGER NOT NULL DEFAULT 0,
  "purchaseNeedsReview" INTEGER NOT NULL DEFAULT 0,
  "sourceDraftId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ShoppingItem_ownerId_idx" ON "ShoppingItem" ("ownerId");
CREATE INDEX IF NOT EXISTS "ShoppingItem_listId_idx" ON "ShoppingItem" ("listId");
CREATE INDEX IF NOT EXISTS "ShoppingItem_categoryId_idx" ON "ShoppingItem" ("categoryId");
CREATE INDEX IF NOT EXISTS "ShoppingItem_ledgerId_idx" ON "ShoppingItem" ("ledgerId");
CREATE INDEX IF NOT EXISTS "ShoppingItem_ownedItemId_idx" ON "ShoppingItem" ("ownedItemId");
CREATE INDEX IF NOT EXISTS "ShoppingItem_purchaseAccountId_idx" ON "ShoppingItem" ("purchaseAccountId");
CREATE INDEX IF NOT EXISTS "ShoppingItem_sourceDraftId_idx" ON "ShoppingItem" ("sourceDraftId");
CREATE TABLE IF NOT EXISTS "OwnedItem" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "purchaseDate" TEXT NOT NULL,
  "retiredDate" TEXT,
  "price" INTEGER NOT NULL,
  "recovery" INTEGER NOT NULL DEFAULT 0,
  "ledgerId" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "mode" TEXT NOT NULL DEFAULT 'day',
  "sourceDraftId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "OwnedItem_ownerId_idx" ON "OwnedItem" ("ownerId");
CREATE INDEX IF NOT EXISTS "OwnedItem_ledgerId_idx" ON "OwnedItem" ("ledgerId");
CREATE INDEX IF NOT EXISTS "OwnedItem_sourceDraftId_idx" ON "OwnedItem" ("sourceDraftId");
CREATE TABLE IF NOT EXISTS "UsageLog" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "date" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "UsageLog_ownerId_idx" ON "UsageLog" ("ownerId");
CREATE INDEX IF NOT EXISTS "UsageLog_itemId_idx" ON "UsageLog" ("itemId");
CREATE INDEX IF NOT EXISTS "UsageLog_date_idx" ON "UsageLog" ("date");
CREATE TABLE IF NOT EXISTS "SavingEntry" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "date" TEXT NOT NULL,
  "planned" INTEGER,
  "actual" INTEGER,
  "amount" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "ledgerId" TEXT,
  "shoppingItemId" TEXT,
  "sourceKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'valid',
  "suppressed" INTEGER NOT NULL DEFAULT 0,
  "sourceDraftId" TEXT,
  "groupId" TEXT,
  "sourceListId" TEXT,
  "settlementId" TEXT,
  "supersededBySettlementId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "SavingEntry_sourceKey_key" ON "SavingEntry" ("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "SavingEntry_settlementId_key" ON "SavingEntry" ("settlementId");
CREATE INDEX IF NOT EXISTS "SavingEntry_ownerId_idx" ON "SavingEntry" ("ownerId");
CREATE INDEX IF NOT EXISTS "SavingEntry_date_idx" ON "SavingEntry" ("date");
CREATE INDEX IF NOT EXISTS "SavingEntry_ledgerId_idx" ON "SavingEntry" ("ledgerId");
CREATE INDEX IF NOT EXISTS "SavingEntry_shoppingItemId_idx" ON "SavingEntry" ("shoppingItemId");
CREATE INDEX IF NOT EXISTS "SavingEntry_sourceDraftId_idx" ON "SavingEntry" ("sourceDraftId");
CREATE INDEX IF NOT EXISTS "SavingEntry_groupId_idx" ON "SavingEntry" ("groupId");
CREATE INDEX IF NOT EXISTS "SavingEntry_sourceListId_idx" ON "SavingEntry" ("sourceListId");
CREATE INDEX IF NOT EXISTS "SavingEntry_settlementId_idx" ON "SavingEntry" ("settlementId");
CREATE INDEX IF NOT EXISTS "SavingEntry_supersededBySettlementId_idx" ON "SavingEntry" ("supersededBySettlementId");
CREATE TABLE IF NOT EXISTS "RecordGroup" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceListId" TEXT,
  "sourceDeleted" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecordGroup_sourceListId_key" ON "RecordGroup" ("sourceListId");
CREATE INDEX IF NOT EXISTS "RecordGroup_ownerId_idx" ON "RecordGroup" ("ownerId");
CREATE INDEX IF NOT EXISTS "RecordGroup_sourceListId_idx" ON "RecordGroup" ("sourceListId");
CREATE TABLE IF NOT EXISTS "ListSettlement" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "budget" INTEGER NOT NULL,
  "paid" INTEGER NOT NULL,
  "members" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "confirmedAt" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListSettlement_listId_key" ON "ListSettlement" ("listId");
CREATE INDEX IF NOT EXISTS "ListSettlement_ownerId_idx" ON "ListSettlement" ("ownerId");
CREATE INDEX IF NOT EXISTS "ListSettlement_listId_idx" ON "ListSettlement" ("listId");
CREATE TABLE IF NOT EXISTS "UserAiConfig" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "baseUrl" TEXT NOT NULL,
  "encryptedKey" TEXT NOT NULL,
  "textModel" TEXT NOT NULL,
  "visionModel" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserAiConfig_ownerId_key" ON "UserAiConfig" ("ownerId");
CREATE INDEX IF NOT EXISTS "UserAiConfig_ownerId_idx" ON "UserAiConfig" ("ownerId");
CREATE TABLE IF NOT EXISTS "AiDailyUsage" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "quotaDate" TEXT NOT NULL,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "used" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiDailyUsage_ownerId_quotaDate_key" ON "AiDailyUsage" ("ownerId","quotaDate");
CREATE INDEX IF NOT EXISTS "AiDailyUsage_ownerId_idx" ON "AiDailyUsage" ("ownerId");
CREATE TABLE IF NOT EXISTS "AiTask" (
  "id" TEXT PRIMARY KEY NOT NULL,
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
  "leaseUntil" INTEGER NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiTask_ownerId_operationId_key" ON "AiTask" ("ownerId","operationId");
CREATE INDEX IF NOT EXISTS "AiTask_ownerId_idx" ON "AiTask" ("ownerId");
CREATE INDEX IF NOT EXISTS "AiTask_operationId_idx" ON "AiTask" ("operationId");
CREATE INDEX IF NOT EXISTS "AiTask_leaseId_idx" ON "AiTask" ("leaseId");
CREATE TABLE IF NOT EXISTS "CaptureDraft" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "target" TEXT NOT NULL DEFAULT 'ledger',
  "targetListId" TEXT,
  "inputMethod" TEXT NOT NULL DEFAULT 'text',
  "capturedAt" INTEGER NOT NULL,
  "captureTimezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "receivedAt" INTEGER NOT NULL,
  "processedAt" INTEGER,
  "appliedAt" INTEGER,
  "updatedAt" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "result" TEXT NOT NULL DEFAULT '[]',
  "appliedIndexes" TEXT NOT NULL DEFAULT '[]',
  "warnings" TEXT NOT NULL DEFAULT '[]',
  "error" TEXT,
  "leaseId" TEXT,
  "leaseAt" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS "CaptureDraft_ownerId_idx" ON "CaptureDraft" ("ownerId");
CREATE INDEX IF NOT EXISTS "CaptureDraft_targetListId_idx" ON "CaptureDraft" ("targetListId");
CREATE INDEX IF NOT EXISTS "CaptureDraft_leaseId_idx" ON "CaptureDraft" ("leaseId");
CREATE TABLE IF NOT EXISTS "Attachment" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "hash" TEXT NOT NULL,
  "missing" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "Attachment_ownerId_idx" ON "Attachment" ("ownerId");
CREATE INDEX IF NOT EXISTS "Attachment_draftId_idx" ON "Attachment" ("draftId");
CREATE TABLE IF NOT EXISTS "ExchangeDataset" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeDataset_ownerId_key" ON "ExchangeDataset" ("ownerId");
CREATE INDEX IF NOT EXISTS "ExchangeDataset_ownerId_idx" ON "ExchangeDataset" ("ownerId");
CREATE TABLE IF NOT EXISTS "ImportIdentity" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "localId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "localFingerprint" TEXT NOT NULL,
  "sourceContent" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ImportIdentity_ownerId_datasetId_entity_sourceId_key" ON "ImportIdentity" ("ownerId","datasetId","entity","sourceId");
CREATE INDEX IF NOT EXISTS "ImportIdentity_ownerId_idx" ON "ImportIdentity" ("ownerId");
CREATE INDEX IF NOT EXISTS "ImportIdentity_datasetId_idx" ON "ImportIdentity" ("datasetId");
CREATE INDEX IF NOT EXISTS "ImportIdentity_sourceId_idx" ON "ImportIdentity" ("sourceId");
CREATE INDEX IF NOT EXISTS "ImportIdentity_localId_idx" ON "ImportIdentity" ("localId");
CREATE TABLE IF NOT EXISTS "ImportJob" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "preview" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "result" TEXT NOT NULL DEFAULT 'null',
  "createdAt" INTEGER NOT NULL,
  "expiresAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ImportJob_ownerId_idx" ON "ImportJob" ("ownerId");
CREATE TABLE IF NOT EXISTS "ReviewRequest" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "publicInfo" TEXT NOT NULL DEFAULT '{}',
  "targetCount" INTEGER NOT NULL,
  "rule" TEXT NOT NULL DEFAULT 'majority',
  "visibility" TEXT NOT NULL DEFAULT 'link',
  "token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewRequest_token_key" ON "ReviewRequest" ("token");
CREATE INDEX IF NOT EXISTS "ReviewRequest_ownerId_idx" ON "ReviewRequest" ("ownerId");
CREATE INDEX IF NOT EXISTS "ReviewRequest_itemId_idx" ON "ReviewRequest" ("itemId");
CREATE TABLE IF NOT EXISTS "ReviewVote" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "reviewId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "approve" INTEGER NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewVote_reviewId_userId_key" ON "ReviewVote" ("reviewId","userId");
CREATE INDEX IF NOT EXISTS "ReviewVote_reviewId_idx" ON "ReviewVote" ("reviewId");
CREATE INDEX IF NOT EXISTS "ReviewVote_userId_idx" ON "ReviewVote" ("userId");
CREATE TABLE IF NOT EXISTS "AppliedOperation" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "AppliedOperation_ownerId_idx" ON "AppliedOperation" ("ownerId");
CREATE TABLE IF NOT EXISTS "AiAnalysis" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "AiAnalysis_ownerId_idx" ON "AiAnalysis" ("ownerId");
CREATE TABLE IF NOT EXISTS "StoreRevision" ("id" INTEGER PRIMARY KEY CHECK (id = 1), "revision" INTEGER NOT NULL);
INSERT OR IGNORE INTO "StoreRevision" VALUES (1, 0);
CREATE TABLE IF NOT EXISTS "LoginAttempt" ("id" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "until" INTEGER NOT NULL);
