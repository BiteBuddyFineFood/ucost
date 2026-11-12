import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.resolve(`data/p4-verification/${stamp}`);
await mkdir(directory, { recursive: true });
const oldFile = path.join(directory, "upgraded-source.db"),
  newFile = path.join(directory, "new-destination.db");
const old = new DatabaseSync(oldFile);
old.exec(
  await readFile("prisma/migrations/20261111123912_init/migration.sql", "utf8"),
);
old.exec(`
INSERT INTO User (id,username,passwordHash) VALUES ('legacy-user','anonymized-legacy','disabled');
INSERT INTO Account (id,ownerId,name,opening) VALUES ('account','legacy-user','脱敏账户',300000);
INSERT INTO Category (id,ownerId,name,type) VALUES ('category','legacy-user','食品','expense');
INSERT INTO ShoppingList (id,ownerId,name) VALUES ('list','legacy-user','历史采购'), ('same-name','legacy-user','历史采购');
INSERT INTO LedgerEntry (id,ownerId,type,title,amount,date,accountId,categoryId,discount,grossAmount,updatedAt) VALUES ('expense','legacy-user','expense','脱敏采购',80000,'2026-11-10','account','category',5000,85000,CURRENT_TIMESTAMP);
INSERT INTO LedgerEntry (id,ownerId,type,title,amount,date,accountId,updatedAt) VALUES ('income','legacy-user','income','脱敏收入',200000,'2026-11-10','account',CURRENT_TIMESTAMP);
INSERT INTO LedgerEntry (id,ownerId,type,title,amount,date,accountId,categoryId,refundOfId,updatedAt) VALUES ('refund','legacy-user','refund','脱敏退款',2000,'2026-11-11','account','category','expense',CURRENT_TIMESTAMP);
INSERT INTO OwnedItem (id,ownerId,name,purchaseDate,price,ledgerId) VALUES ('asset','legacy-user','脱敏采购','2026-11-10',80000,'expense');
INSERT INTO ShoppingItem (id,ownerId,listId,name,status,ledgerId,ownedItemId) VALUES ('bought','legacy-user','list','脱敏采购','purchased','expense','asset');
INSERT INTO ShoppingItem (id,ownerId,listId,name,status) VALUES ('orphan','legacy-user','list','旧数据未知购买','purchased');
INSERT INTO SavingEntry (id,ownerId,title,type,source,date,amount,ledgerId,sourceKey,status) VALUES ('discount','legacy-user','历史优惠','discount','automatic','2026-11-10',5000,'expense','discount:expense','pending');
INSERT INTO SavingEntry (id,ownerId,title,type,source,date,amount,status,suppressed) VALUES ('suppressed','legacy-user','主动停用','reduced','manual','2026-11-10',3000,'revoked',1);
INSERT INTO CaptureDraft (id,ownerId,text,target,capturedAt,state) VALUES ('draft','legacy-user','暂存原话','ledger',CURRENT_TIMESTAMP,'pending');
INSERT INTO UsageLog (id,ownerId,itemId,count,date) VALUES ('usage','legacy-user','asset',2,'2026-11-12');
`);
function summary(c) {
  return {
    counts: Object.fromEntries(
      [
        "User",
        "Account",
        "Category",
        "ShoppingList",
        "ShoppingItem",
        "LedgerEntry",
        "SavingEntry",
        "OwnedItem",
        "UsageLog",
        "CaptureDraft",
      ].map((t) => [t, c.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n]),
    ),
    ledger: c
      .prepare(
        "SELECT type,SUM(amount) amount FROM LedgerEntry GROUP BY type ORDER BY type",
      )
      .all(),
    saving: c
      .prepare(
        "SELECT COALESCE(SUM(amount),0) amount FROM SavingEntry WHERE status='valid' AND suppressed=0",
      )
      .get().amount,
  };
}
const before = summary(old);
old.close();
function run(args, database) {
  const p = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: `file:${database.replaceAll("\\", "/")}`,
      P4_DIRECTORY: directory,
    },
  });
  if (p.status !== 0)
    throw new Error(`Verification command failed: ${args.join(" ")}`);
}
run(
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "resolve",
    "--applied",
    "20261111123912_init",
  ],
  oldFile,
);
run(["node_modules/prisma/build/index.js", "migrate", "deploy"], oldFile);
const migrated = new DatabaseSync(oldFile, { readOnly: true });
const after = summary(migrated);
assert.deepEqual(
  JSON.parse(JSON.stringify(after)),
  JSON.parse(JSON.stringify(before)),
);
const anomalies = migrated
  .prepare(
    "SELECT id,name,purchaseNeedsReview FROM ShoppingItem WHERE purchaseNeedsReview=1",
  )
  .all();
assert.equal(anomalies.length, 1);
assert.equal(
  migrated.prepare("PRAGMA integrity_check").get().integrity_check,
  "ok",
);
migrated.close();
run(
  ["node_modules/tsx/dist/cli.mjs", "scripts/verify-p4-phase.ts", "export"],
  oldFile,
);
new DatabaseSync(newFile).close();
run(["node_modules/prisma/build/index.js", "migrate", "deploy"], newFile);
run(
  ["node_modules/tsx/dist/cli.mjs", "scripts/verify-p4-phase.ts", "import"],
  newFile,
);
run(
  [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/verify-p4-phase.ts",
    "verify-restart",
  ],
  newFile,
);
await writeFile(
  path.join(directory, "upgrade-report.json"),
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      fixture: "脱敏旧结构合成数据，仅初始版字段",
      before,
      after,
      preserved: true,
      anomalies,
    },
    null,
    2,
  ),
);
await mkdir("data/p4-verification", { recursive: true });
await writeFile(
  "data/p4-verification/latest.json",
  JSON.stringify({ directory, oldFile, newFile }, null, 2),
);
console.log(`P4 verification evidence: ${directory}`);
