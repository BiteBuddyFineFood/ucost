import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
process.loadEnvFile?.(".env");
const directory = path.resolve("data/p2-p3-verification");
await mkdir(directory, { recursive: true });
const sourcePath = path.resolve(
  "prisma",
  (process.env.DATABASE_URL || "file:../data/ucost.db").slice(5),
);
if (process.argv.includes("--verify-current")) {
  const report = JSON.parse(
    await readFile(path.join(directory, "migration-report.json"), "utf8"),
  );
  const current = summary(sourcePath);
  if (JSON.stringify(report.before) !== JSON.stringify(current))
    throw new Error(
      "当前库记录或财务汇总与升级前备份不同，请核对升级期间的新写入",
    );
  const anomalies = audit(sourcePath);
  await writeFile(
    path.join(directory, "history-anomalies.json"),
    JSON.stringify(anomalies, null, 2),
  );
  const verified = {
    testedAt: new Date().toISOString(),
    preserved: true,
    anomalyCounts: Object.fromEntries(
      Object.entries(anomalies).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.length : value,
      ]),
    ),
    before: report.before,
    current,
  };
  await writeFile(
    path.join(directory, "financial-preservation.json"),
    JSON.stringify(verified, null, 2),
  );
  console.log(JSON.stringify(verified, null, 2));
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(directory, `before-${stamp}.db`);
const source = new DatabaseSync(sourcePath, { readOnly: true });
await backup(source, backupPath);
source.close();
function summary(file) {
  const connection = new DatabaseSync(file, { readOnly: true });
  const count = Object.fromEntries(
    [
      "User",
      "LedgerEntry",
      "ShoppingList",
      "ShoppingItem",
      "SavingEntry",
      "OwnedItem",
    ].map((table) => [
      table,
      connection.prepare(`SELECT COUNT(*) n FROM "${table}"`).get().n,
    ]),
  );
  const totals = connection
    .prepare(
      'SELECT "type", SUM("amount") amount FROM "LedgerEntry" GROUP BY "type" ORDER BY "type"',
    )
    .all();
  const hasSettlement = connection
    .prepare('PRAGMA table_info("SavingEntry")')
    .all()
    .some((column) => column.name === "supersededBySettlementId");
  const savings = connection
    .prepare(
      'SELECT SUM("amount") amount FROM "SavingEntry" WHERE "status" = \'valid\' AND "suppressed" = 0' +
        (hasSettlement ? ' AND "supersededBySettlementId" IS NULL' : ""),
    )
    .get().amount;
  connection.close();
  return { count, totals, savings };
}
const before = summary(backupPath);
const migratedPath = path.join(directory, `migrated-${stamp}.db`);
const connection = new DatabaseSync(backupPath, { readOnly: true });
await backup(connection, migratedPath);
connection.close();
function migrate(file) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: {
        ...process.env,
        DATABASE_URL: `file:${file.replaceAll("\\", "/")}`,
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) throw new Error("迁移演练失败");
}
migrate(migratedPath);
const after = summary(migratedPath);
if (JSON.stringify(before) !== JSON.stringify(after))
  throw new Error("迁移前后记录或财务汇总变化");
const anomalies = audit(migratedPath);
await writeFile(
  path.join(directory, "history-anomalies.json"),
  JSON.stringify(anomalies, null, 2),
);
const emptyPath = path.join(directory, `test-${stamp}.db`);
new DatabaseSync(emptyPath).close();
migrate(emptyPath);
const report = {
  testedAt: new Date().toISOString(),
  backupPath,
  migratedPath,
  testDatabase: emptyPath,
  before,
  after,
  preserved: true,
  anomalyCounts: Object.fromEntries(
    Object.entries(anomalies).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : value,
    ]),
  ),
};
await writeFile(
  path.join(directory, "migration-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

function audit(file) {
  const inspected = new DatabaseSync(file, { readOnly: true });
  const anomalies = {
    purchasedNeedsReview: inspected
      .prepare(
        `SELECT id, listId FROM ShoppingItem WHERE status='purchased' AND (purchaseNeedsReview=1 OR purchaseAmount IS NULL OR purchasedAt IS NULL)`,
      )
      .all(),
    duplicateLedgerLinks: inspected
      .prepare(
        `SELECT ledgerId, COUNT(*) count FROM ShoppingItem WHERE ledgerId IS NOT NULL GROUP BY ledgerId HAVING COUNT(*)>1`,
      )
      .all(),
    invalidLedgerLinks: inspected
      .prepare(
        `SELECT s.id, s.ledgerId FROM ShoppingItem s LEFT JOIN LedgerEntry e ON e.id=s.ledgerId AND e.ownerId=s.ownerId AND e.type='expense' WHERE s.ledgerId IS NOT NULL AND e.id IS NULL`,
      )
      .all(),
    integrity: inspected.prepare("PRAGMA integrity_check").get()
      .integrity_check,
  };
  inspected.close();
  return anomalies;
}
