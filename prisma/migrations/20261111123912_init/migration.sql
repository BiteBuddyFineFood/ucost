-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "autoBatch" BOOLEAN NOT NULL DEFAULT false,
    "batchSize" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opening" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "autoSaving" BOOLEAN NOT NULL DEFAULT true,
    "orderKey" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "sourceDraftId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "ledgerId" TEXT,
    "ownedItemId" TEXT,
    "sourceDraftId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OwnedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SavingEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "sourceDraftId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CaptureDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'ledger',
    "targetListId" TEXT,
    "inputMethod" TEXT NOT NULL DEFAULT 'text',
    "capturedAt" DATETIME NOT NULL,
    "captureTimezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "appliedAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT NOT NULL DEFAULT '[]',
    "appliedIndexes" TEXT NOT NULL DEFAULT '[]',
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "leaseId" TEXT,
    "leaseAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReviewVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppliedOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_ownerId_type_name_key" ON "Category"("ownerId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_ownerId_keyword_key" ON "CategoryRule"("ownerId", "keyword");

-- CreateIndex
CREATE INDEX "LedgerEntry_ownerId_date_idx" ON "LedgerEntry"("ownerId", "date");

-- CreateIndex
CREATE INDEX "LedgerEntry_refundOfId_idx" ON "LedgerEntry"("refundOfId");

-- CreateIndex
CREATE INDEX "ShoppingList_ownerId_idx" ON "ShoppingList"("ownerId");

-- CreateIndex
CREATE INDEX "ShoppingItem_ownerId_listId_idx" ON "ShoppingItem"("ownerId", "listId");

-- CreateIndex
CREATE INDEX "OwnedItem_ownerId_idx" ON "OwnedItem"("ownerId");

-- CreateIndex
CREATE INDEX "UsageLog_ownerId_itemId_idx" ON "UsageLog"("ownerId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SavingEntry_sourceKey_key" ON "SavingEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "SavingEntry_ownerId_date_idx" ON "SavingEntry"("ownerId", "date");

-- CreateIndex
CREATE INDEX "CaptureDraft_ownerId_state_idx" ON "CaptureDraft"("ownerId", "state");

-- CreateIndex
CREATE INDEX "Attachment_ownerId_draftId_idx" ON "Attachment"("ownerId", "draftId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_token_key" ON "ReviewRequest"("token");

-- CreateIndex
CREATE INDEX "ReviewRequest_ownerId_idx" ON "ReviewRequest"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewVote_reviewId_userId_key" ON "ReviewVote"("reviewId", "userId");

-- CreateIndex
CREATE INDEX "AiAnalysis_ownerId_hash_idx" ON "AiAnalysis"("ownerId", "hash");
