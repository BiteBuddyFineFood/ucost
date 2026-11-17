import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { configureLocalWranglerPaths } from "./workers-local-utils.mjs";

configureLocalWranglerPaths();
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.WRANGLER_LOG_PATH = "data/wrangler-logs";
process.env.WRANGLER_SEND_METRICS = "false";
const { getPlatformProxy } = await import("wrangler");
const root = `data/d1-probe/${randomUUID()}`;
const options = { configPath: "wrangler.db-test.jsonc", remoteBindings: false, persist: { path: root + "/v3" } };
await mkdir(root, { recursive: true });
const metadata = JSON.parse(await readFile("src/server/fields.json", "utf8"));
async function summary(db) {
  const counts = {};
  for (const { name } of Object.values(metadata)) counts[name] = (await db.prepare(`SELECT count(*) AS n FROM "${name}"`).first()).n;
  const money = await db.prepare(`SELECT (SELECT coalesce(sum(amount),0) FROM LedgerEntry WHERE type='income') AS income,
    (SELECT coalesce(sum(amount),0) FROM LedgerEntry WHERE type='expense') AS expense,
    (SELECT coalesce(sum(amount),0) FROM LedgerEntry WHERE type='refund') AS refund,
    (SELECT coalesce(sum(amount),0) FROM SavingEntry WHERE status='valid' AND suppressed=0 AND supersededBySettlementId IS NULL) AS saving`).first();
  const links = await db.prepare('SELECT id,ledgerId,ownedItemId,listId FROM ShoppingItem ORDER BY id').all();
  return { counts, money, links: links.results };
}
let expected;
const mf = await getPlatformProxy(options);
try {
  const db = mf.env.DB;
  await db.exec('CREATE TABLE IF NOT EXISTS probe (id TEXT PRIMARY KEY, value INTEGER NOT NULL);');
  await db.prepare('DELETE FROM probe').run();
  await db.prepare('INSERT INTO probe VALUES (?,?)').bind("persistent", 7).run();
  try {
    await db.batch([db.prepare('INSERT INTO probe VALUES (?,?)').bind("rollback", 1),
      db.prepare('INSERT INTO probe VALUES (?,?)').bind("persistent", 2)]);
    throw new Error("batch unexpectedly succeeded");
  } catch (error) { if (!String(error).includes("UNIQUE")) throw error; }
  if (await db.prepare('SELECT * FROM probe WHERE id=?').bind("rollback").first()) throw new Error("Partial batch committed");
  console.log("D1 read/write and constraint failure rollback: passed");
  if (process.argv.includes("--schema")) {
    const migrations = (await readdir("d1/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      const migration = await readFile(`d1/migrations/${file}`, "utf8");
      for (const statement of migration.split(";").filter(s => s.trim()))
        await db.prepare(statement).run();
    }
    console.log("All domain tables and indexes: passed");
    const now = Date.now();
    const statements = [
      ['INSERT INTO User(id,username,passwordHash,createdAt) VALUES (?,?,?,?)', ["fixture-user", "synthetic-restore", "synthetic-not-a-real-hash", now]],
      ['INSERT INTO Account(id,ownerId,name,opening) VALUES (?,?,?,?)', ["fixture-account", "fixture-user", "synthetic-account", 10000]],
      ['INSERT INTO ShoppingList(id,ownerId,name,createdAt) VALUES (?,?,?,?)', ["fixture-list", "fixture-user", "synthetic-list", now]],
      ['INSERT INTO LedgerEntry(id,ownerId,type,title,amount,date,accountId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)', ["fixture-income", "fixture-user", "income", "synthetic-income", 200000, "2026-11-12", "fixture-account", now, now]],
      ['INSERT INTO LedgerEntry(id,ownerId,type,title,amount,date,accountId,sourceShoppingItemId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', ["fixture-ledger", "fixture-user", "expense", "synthetic-purchase", 80000, "2026-11-12", "fixture-account", "fixture-shopping", now, now]],
      ['INSERT INTO LedgerEntry(id,ownerId,type,title,amount,date,refundOfId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)', ["fixture-refund", "fixture-user", "refund", "synthetic-refund", 2000, "2026-11-12", "fixture-ledger", now, now]],
      ['INSERT INTO OwnedItem(id,ownerId,name,purchaseDate,price,ledgerId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)', ["fixture-item", "fixture-user", "synthetic-item", "2026-11-12", 80000, "fixture-ledger", now, now]],
      ['INSERT INTO ShoppingItem(id,ownerId,listId,name,status,ledgerId,ownedItemId,createdAt) VALUES (?,?,?,?,?,?,?,?)', ["fixture-shopping", "fixture-user", "fixture-list", "synthetic-shopping", "purchased", "fixture-ledger", "fixture-item", now]],
      ['INSERT INTO SavingEntry(id,ownerId,title,type,date,amount,ledgerId,createdAt) VALUES (?,?,?,?,?,?,?,?)', ["fixture-saving", "fixture-user", "synthetic-saving", "discount", "2026-11-12", 5000, "fixture-ledger", now]],
      ['INSERT INTO CaptureDraft(id,ownerId,text,capturedAt,updatedAt,receivedAt) VALUES (?,?,?,?,?,?)', ["fixture-draft", "fixture-user", "synthetic-text", now, now, now]],
      ['INSERT INTO ImportIdentity(id,ownerId,datasetId,entity,sourceId,localId,fingerprint,localFingerprint,sourceContent) VALUES (?,?,?,?,?,?,?,?,?)', ["fixture-identity", "fixture-user", "synthetic-dataset", "ledger", "source-ledger", "fixture-ledger", "synthetic", "synthetic", "{}"]],
    ];
    await db.batch(statements.map(([statement, args]) => db.prepare(statement).bind(...args)));
    expected = await summary(db);
  }
} finally { await mf.dispose(); }
const reopened = await getPlatformProxy(options);
try {
  const row = await reopened.env.DB.prepare('SELECT value FROM probe WHERE id=?').bind("persistent").first();
  if (row?.value !== 7) throw new Error("Persistence failed");
  if (expected && JSON.stringify(await summary(reopened.env.DB)) !== JSON.stringify(expected)) throw new Error("Domain graph changed after restart");
  console.log("D1 restart persistence: passed");
} finally { await reopened.dispose(); }

if (expected) {
  const backup = root + "/synthetic-backup.sql";
  const restore = root + "/restored";
  function run(args) {
    const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], { stdio: "pipe", env: process.env, encoding: "utf8" });
    if (result.status !== 0) throw new Error("Local backup/restore failed: " + result.stderr);
  }
  // Wrangler's local export uses this supported Miniflare pragma internally;
  // its CLI has no --persist-to option, so use the same API on our isolated root.
  const exporter = await getPlatformProxy(options);
  try {
    const dump = await exporter.env.DB.prepare("PRAGMA miniflare_d1_export(?,?,?);").bind(false, false).raw();
    await writeFile(backup, dump[0].join("\n"));
  } finally { await exporter.dispose(); }
  run(["d1", "execute", "DB", "--local", "--config", "wrangler.db-test.jsonc", "--persist-to", restore, "--file", backup]);
  const restored = await getPlatformProxy({ ...options, persist: { path: restore + "/v3" } });
  try {
    const actual = await summary(restored.env.DB);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Restored counts/money/links differ");
    await writeFile(root + "/report.json", JSON.stringify({ result: "passed", syntheticOnly: true, restart: true, exportRestore: true, expected, actual }, null, 2));
    console.log("Local D1 export -> independent restore -> all table counts / money / shopping links: passed");
  } finally { await restored.dispose(); }
}
