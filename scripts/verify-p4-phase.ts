import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import {
  exportData,
  financialSummary,
  previewImport,
  commitImport,
} from "../src/server/exchange";
import { canonical, entities, refs } from "../src/server/exchange-codec";
import assert from "node:assert/strict";
import path from "node:path";

const directory = path.resolve(
  process.env.P4_DIRECTORY || "data/p4-verification",
);
const mode = process.argv[2];
function graph(data: any, identity: any[] = []) {
  const source = (entity: string, id: string) =>
    id == null
      ? null
      : identity.find((i) => i.entity === entity && i.localId === id)
          ?.sourceId || id;
  const fields = [
    "type",
    "source",
    "name",
    "title",
    "date",
    "amount",
    "opening",
    "archived",
    "iconKey",
    "color",
    "budget",
    "savingMode",
    "status",
    "sourceDeleted",
    "purchaseAmount",
    "purchasedAt",
    "purchaseDiscount",
    "purchaseDiscountDetails",
    "purchaseNeedsReview",
    "discount",
    "grossAmount",
    "autoSaving",
    "planned",
    "actual",
    "suppressed",
    "price",
    "recovery",
    "purchaseDate",
    "retiredDate",
    "mode",
    "count",
    "text",
    "target",
    "appliedIndexes",
    "note",
  ];
  const result = Object.fromEntries(
    entities.map((entity) => [
      entity,
      data[entity]
        .map((row: any) => {
          const r: any = { id: source(entity, row.id) };
          for (const field of fields) if (field in row) r[field] = row[field];
          for (const [field, target] of Object.entries(refs[entity] || {}))
            r[field] = source(target, row[field]);
          if (entity === "settlements")
            r.members = JSON.parse(row.members)
              .map((m: any) => ({
                id: source("shopping", m.id),
                listId: source("lists", m.listId),
                ledgerId: source("ledger", m.ledgerId),
                amount: m.purchaseAmount,
                status: m.status,
              }))
              .sort((a: any, b: any) => a.id.localeCompare(b.id));
          return r;
        })
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
    ]),
  );
  const summary = financialSummary(data);
  return {
    records: result,
    finance: {
      ...summary,
      accounts: summary.accounts
        .map((a) => ({ ...a, id: source("accounts", a.id) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
  };
}
async function main() {
  try {
    if (mode === "export") {
      const u = await db.user.require({
        where: { id: "legacy-user" },
      });
      const { mutate } = await import("../src/server/services");
      const action = (body: any) =>
        mutate(u, {
          operationId: crypto.randomUUID(),
          ...body,
        }) as Promise<any>;
      const list = await action({
        action: "save",
        entity: "lists",
        data: { name: "升级后预算采购", budget: 100000 },
      });
      for (const [index, amount] of [50000, 30000].entries()) {
        const item = await action({
          action: "save",
          entity: "shopping",
          data: {
            listId: list.id,
            name: `预算物品-${index}`,
            categoryId: "category",
          },
        });
        await action({
          action: "convert",
          id: item.id,
          version: item.version,
          mode: "buy",
          paid: amount,
          discount: index === 0 ? 5000 : 0,
          date: index === 0 ? "2026-11-10" : "2026-11-12",
          createLedger: true,
          accountId: "account",
        });
      }
      const settlement = await action({
        action: "listSettlementPreview",
        id: list.id,
      });
      await action({
        action: "listSettlementConfirm",
        id: list.id,
        fingerprint: settlement.fingerprint,
        confirmedClosed: true,
      });
      const partial = await db.captureDraft.insert({
        data: {
          ownerId: u.id,
          text: "部分确认原话",
          capturedAt: new Date(),
          state: "ready",
          result: JSON.stringify([
            {
              target: "ledger",
              data: {
                title: "脱敏采购",
                type: "expense",
                amount: 80000,
                date: "2026-11-10",
                accountId: "account",
                categoryId: "category",
              },
            },
            {
              target: "ledger",
              data: {
                title: "待确认",
                type: "expense",
                amount: 100,
                date: "2026-11-12",
              },
            },
          ]),
          appliedIndexes: "[0]",
        },
      });
      await db.ledgerEntry.change({
        where: { id: "expense" },
        data: { sourceDraftId: partial.id },
      });
      const data = await exportData(u);
      await writeFile(
        path.join(directory, "export-v2.json"),
        JSON.stringify(data, null, 2),
      );
      await writeFile(
        path.join(directory, "expected.json"),
        JSON.stringify(graph(data), null, 2),
      );
      console.log("Migrated fixture exported with source relationships.");
    } else if (mode === "import") {
      const u = await db.user.insert({
        data: {
          id: "destination-user",
          username: "migration-destination",
          passwordHash: "disabled",
        },
      });
      const content = await readFile(
        path.join(directory, "export-v2.json"),
        "utf8",
      );
      const p = await previewImport(u, { content });
      assert.equal(p.canCommit, true, JSON.stringify(p));
      const report = await commitImport(u, { jobId: p.jobId });
      assert.deepEqual(await commitImport(u, { jobId: p.jobId }), report);
      const second = await previewImport(u, { content });
      assert.equal(second.added, 0);
      assert.equal(second.canCommit, true, JSON.stringify(second));
      await commitImport(u, { jobId: second.jobId });
      await writeFile(
        path.join(directory, "import-report.json"),
        JSON.stringify(report, null, 2),
      );
      console.log(
        "Imported into a separate new database; repeated import skipped.",
      );
    } else if (mode === "verify-restart") {
      const u = await db.user.require({
        where: { id: "destination-user" },
      });
      const data = await exportData(u);
      const identity = await db.importIdentity.list({
        where: { ownerId: u.id },
      });
      const expected = JSON.parse(
        await readFile(path.join(directory, "expected.json"), "utf8"),
      );
      const actual = graph(data, identity);
      assert.equal(canonical(actual), canonical(expected));
      assert.equal(actual.finance.saving, 20000);
      const item = data.shopping.find((i: any) => i.name === "脱敏采购");
      // A post-restart edit must still find and update the original imported derived saving.
      const { mutate } = await import("../src/server/services");
      const ledger = data.ledger.find((e: any) => e.id === item.ledgerId);
      const savingsBefore = data.savings.length;
      const edited = await mutate(u, {
        operationId: crypto.randomUUID(),
        action: "purchaseEdit",
        id: item.id,
        version: item.version,
        ledgerVersion: ledger.version,
        amount: 79000,
        date: item.purchasedAt,
        categoryId: item.categoryId,
        accountId: item.purchaseAccountId,
        discount: 6000,
      });
      assert.ok(edited);
      const after = await exportData(u);
      assert.equal(after.savings.length, savingsBefore);
      assert.equal(
        after.savings.find((s: any) => s.ledgerId === item.ledgerId).amount,
        6000,
      );
      await writeFile(
        path.join(directory, "roundtrip-report.json"),
        JSON.stringify(
          {
            testedAt: new Date().toISOString(),
            separateDatabases: true,
            restartedProcess: true,
            financialAndGraphEqual: true,
            before: expected.finance,
            after: actual.finance,
            checkedRelationships: Object.entries(refs).map(([e, fields]) => ({
              entity: e,
              fields: Object.keys(fields),
            })),
            postRestartPurchaseEdit: {
              savingCountUnchanged: true,
              discount: 6000,
            },
          },
          null,
          2,
        ),
      );
      console.log(
        "Restart verification passed: money, groups, source graph and derived-saving update.",
      );
    } else throw new Error("Unknown verification phase");
  } finally {

  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
