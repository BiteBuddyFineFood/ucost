import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

let proxy: any;
let root: string;

async function apply(file: string) {
  const migration = await readFile(file, "utf8");
  for (const statement of migration.split(";").filter((value) => value.trim()))
    await proxy.env.DB.prepare(statement).run();
}

beforeAll(async () => {
  root = path.resolve("data/d1-tests", randomUUID());
  const { getPlatformProxy } = await import("wrangler");
  proxy = await getPlatformProxy({
    configPath: "wrangler.db-test.jsonc",
    remoteBindings: false,
    persist: { path: root },
  });
  await apply("d1/migrations/0001_domain.sql");
  const now = Date.now();
  await proxy.env.DB.prepare(
    `INSERT INTO OwnedItem
      (id, ownerId, name, purchaseDate, retiredDate, price, recovery, ledgerId,
       note, mode, sourceDraftId, version, createdAt)
      VALUES (?, ?, ?, ?, NULL, ?, 0, NULL, ?, 'day', NULL, 1, ?)`,
  )
    .bind("old-item", "old-user", "旧物品", "2026-11-10", 80000, "旧备注", now)
    .run();
  await proxy.env.DB.prepare(
    `INSERT INTO ShoppingList
      (id, ownerId, name, description, archived, sort, budget, savingMode,
       closedAt, version, createdAt)
      VALUES (?, ?, ?, '', 0, 0, NULL, 'item', NULL, 1, ?)`,
  )
    .bind("old-list", "old-user", "旧购物清单", now)
    .run();
  await proxy.env.DB.prepare(
    `INSERT INTO ShoppingItem
      (id, ownerId, listId, name, quantity, budget, reason, requirements,
       concerns, alternatives, timing, note, originalText, status, categoryId,
       ledgerId, ownedItemId, purchaseAmount, purchasedAt, purchaseAccountId,
       purchaseDiscount, purchaseDiscountDetails, purchaseRevision,
       purchaseNeedsReview, sourceDraftId, version, createdAt)
      VALUES (?, ?, ?, ?, '2 盒', NULL, '', '', '', '', '', '', '', 'planned',
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', 0, 0, NULL, 1, ?)`,
  )
    .bind("old-shopping", "old-user", "old-list", "旧牛奶", now)
    .run();
  await apply("d1/migrations/0003_household_and_reminders.sql");
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

describe("0003 生活管家迁移", () => {
  it("旧物品升级为成本已开启，收纳/保质期关闭，购物清单默认购物用途", async () => {
    const item = await proxy.env.DB.prepare(
      `SELECT name, quantity, unit, storageEnabled, expiryEnabled, costEnabled,
              location, boxId, expiresOn, status, sourceNote, price, ledgerId,
              updatedAt
       FROM OwnedItem WHERE id = ?`,
    )
      .bind("old-item")
      .first();
    expect(item).toMatchObject({
      name: "旧物品",
      quantity: 1,
      unit: "件",
      storageEnabled: 0,
      expiryEnabled: 0,
      costEnabled: 1,
      location: "",
      boxId: null,
      expiresOn: null,
      status: "active",
      sourceNote: "",
      price: 80000,
      ledgerId: null,
    });
    expect(item.updatedAt).toBeTruthy();

    const list = await proxy.env.DB.prepare(
      `SELECT kind, departureDate FROM ShoppingList WHERE id = ?`,
    )
      .bind("old-list")
      .first();
    expect(list).toMatchObject({ kind: "shopping", departureDate: null });
    const shopping = await proxy.env.DB.prepare(
      `SELECT done, groupName FROM ShoppingItem WHERE id = ?`,
    )
      .bind("old-shopping")
      .first();
    expect(shopping).toMatchObject({ done: 0, groupName: "" });
    expect(
      await proxy.env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name IN ('StorageBox', 'ReminderRule', 'ReminderOccurrence')
         ORDER BY name`,
      ).all(),
    ).toMatchObject({
      results: [
        { name: "ReminderOccurrence" },
        { name: "ReminderRule" },
        { name: "StorageBox" },
      ],
    });
  });
});
