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
