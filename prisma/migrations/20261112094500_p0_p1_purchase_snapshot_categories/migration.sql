-- P0/P1 additive migration. Existing records are preserved; financial totals are not rewritten.

ALTER TABLE "User" ADD COLUMN "defaultExpenseAccountId" TEXT;
ALTER TABLE "Category" ADD COLUMN "iconKey" TEXT NOT NULL DEFAULT 'tag';
ALTER TABLE "Category" ADD COLUMN "color" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ShoppingItem" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseAmount" INTEGER;
ALTER TABLE "ShoppingItem" ADD COLUMN "purchasedAt" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseAccountId" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseDiscount" INTEGER;
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseDiscountDetails" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseNeedsReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CaptureDraft" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT 0;
UPDATE "CaptureDraft" SET "updatedAt" = "receivedAt";

CREATE INDEX "ShoppingItem_ownerId_categoryId_idx" ON "ShoppingItem"("ownerId", "categoryId");

-- Backfill purchase snapshots from the still-valid linked expense.
UPDATE "ShoppingItem"
SET
  "purchaseAmount" = (
    SELECT "LedgerEntry"."amount" FROM "LedgerEntry"
    WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
  ),
  "purchasedAt" = (
    SELECT "LedgerEntry"."date" FROM "LedgerEntry"
    WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
  ),
  "purchaseAccountId" = (
    SELECT "LedgerEntry"."accountId" FROM "LedgerEntry"
    WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
  ),
  "purchaseDiscount" = (
    SELECT "LedgerEntry"."discount" FROM "LedgerEntry"
    WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
  ),
  "purchaseDiscountDetails" = COALESCE((
    SELECT "LedgerEntry"."discountDetails" FROM "LedgerEntry"
    WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
  ), ''),
  "categoryId" = COALESCE("categoryId", (
    SELECT "LedgerEntry"."categoryId" FROM "LedgerEntry"
    WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
  )),
  "purchaseRevision" = 1,
  "purchaseNeedsReview" = false
WHERE "ledgerId" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "LedgerEntry"
  WHERE "LedgerEntry"."id" = "ShoppingItem"."ledgerId" AND "LedgerEntry"."type" = 'expense'
);

-- A purchased item with no bill can still recover amount/date from its owned-item snapshot.
UPDATE "ShoppingItem"
SET
  "purchaseAmount" = (
    SELECT "OwnedItem"."price" FROM "OwnedItem"
    WHERE "OwnedItem"."id" = "ShoppingItem"."ownedItemId"
  ),
  "purchasedAt" = (
    SELECT "OwnedItem"."purchaseDate" FROM "OwnedItem"
    WHERE "OwnedItem"."id" = "ShoppingItem"."ownedItemId"
  ),
  "purchaseRevision" = 1,
  "purchaseNeedsReview" = true
WHERE "status" = 'purchased'
  AND "ledgerId" IS NULL
  AND "ownedItemId" IS NOT NULL
  AND "purchaseAmount" IS NULL
  AND EXISTS (
    SELECT 1 FROM "OwnedItem" WHERE "OwnedItem"."id" = "ShoppingItem"."ownedItemId"
  );

-- Remaining purchased-without-bill rows keep the purchase fact but require human completion.
UPDATE "ShoppingItem"
SET "purchaseNeedsReview" = true
WHERE "status" = 'purchased' AND "ledgerId" IS NULL;
