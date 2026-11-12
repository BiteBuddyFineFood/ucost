-- Additive migration: no financial records are rewritten.
ALTER TABLE "Attachment" ADD COLUMN "missing" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ExchangeDataset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ExchangeDataset_ownerId_key" ON "ExchangeDataset"("ownerId");
CREATE TABLE "ImportIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "localId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "localFingerprint" TEXT NOT NULL,
  "sourceContent" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ImportIdentity_ownerId_datasetId_entity_sourceId_key" ON "ImportIdentity"("ownerId", "datasetId", "entity", "sourceId");
CREATE INDEX "ImportIdentity_ownerId_localId_idx" ON "ImportIdentity"("ownerId", "localId");
CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "preview" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "result" TEXT NOT NULL DEFAULT 'null',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "ImportJob_ownerId_status_idx" ON "ImportJob"("ownerId", "status");
