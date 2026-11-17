import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../src/server/db";
import { mutate } from "../src/server/services";
import {
  exportData,
  previewImport,
  commitImport,
  financialSummary,
} from "../src/server/exchange";
import {
  decodeFile,
  exportCsv,
  encodeCsv,
  parseCsv,
  emptyRecords,
  entities,
  models,
} from "../src/server/exchange-codec";
import { addDays } from "../src/lib/period";
const users: any[] = [];
const op = () => randomUUID();
async function user() {
  const u = await db.user.insert({
    data: { username: `p4-${op()}`, passwordHash: "test" },
  });
  users.push(u);
  return u;
}
const action = (u: any, body: any) =>
  mutate(u, { operationId: op(), ...body }) as Promise<any>;
const save = (u: any, entity: string, data: any) =>
  action(u, { action: "save", entity, data });
let source: any, target: any, data: any;
beforeAll(async () => {
  source = await user();
  target = await user();
  const account = await save(source, "accounts", {
    name: "核对账户",
    opening: 300000,
  });
  const category = await save(source, "categories", {
    name: "食品",
    type: "expense",
    iconKey: "coffee",
    color: "#C4A24A",
  });
  const list = await save(source, "lists", {
    name: '=采购,"核对"\n第二行',
    budget: 100000,
  });
  await save(source, "lists", { name: list.name });
  const item = await save(source, "shopping", {
    listId: list.id,
    name: "牛奶",
    categoryId: category.id,
    budget: 100000,
  });
  await action(source, {
    action: "convert",
    id: item.id,
    version: item.version,
    mode: "buy",
    paid: 80000,
    date: "2026-11-10",
    discount: 5000,
    createLedger: true,
    createItem: true,
    accountId: account.id,
  });
  const p = await action(source, {
    action: "listSettlementPreview",
    id: list.id,
  });
  await action(source, {
    action: "listSettlementConfirm",
    id: list.id,
    fingerprint: p.fingerprint,
    confirmedClosed: true,
    date: "2026-11-12",
  });
  await save(source, "ledger", {
    title: "+income",
    amount: 200000,
    type: "income",
    date: "2026-11-12",
    accountId: account.id,
  });
  const expense = await save(source, "ledger", {
    title: "普通支出",
    amount: 10000,
    type: "expense",
    date: "2026-11-12",
    accountId: null,
    autoSaving: false,
  });
  await save(source, "ledger", {
    title: "退款",
    amount: 2000,
    type: "refund",
    date: "2026-11-12",
    refundOfId: expense.id,
    accountId: null,
  });
  const draft = await db.captureDraft.insert({
    data: {
      ownerId: source.id,
      text: "图片未完成任务",
      target: "shopping",
      targetListId: list.id,
      capturedAt: new Date(),
      state: "processing",
      leaseId: "old-lease",
      leaseAt: new Date(),
    },
  });
  await db.attachment.insert({
    data: {
      ownerId: source.id,
      draftId: draft.id,
      name: "receipt.png",
      mime: "image/png",
      size: 10,
      hash: "fake",
      storageKey: "private-path",
    },
  });
  data = await exportData(source);
});
afterAll(async () => {
  for (const u of users) {
    await db.reviewVote.removeAll({
      where: {
        reviewId: {
          in: (
            await db.reviewRequest.list({ where: { ownerId: u.id } })
          ).map((r) => r.id),
        },
      },
    });
    for (const m of [
      ...Object.values(models).filter((m) => m !== "reviewVote"),
      "importIdentity",
      "importJob",
      "exchangeDataset",
      "appliedOperation",
    ])
      await (db as any)[m].removeAll({ where: { ownerId: u.id } });
    await db.user.remove({ where: { id: u.id } });
  }

});
describe("P4 data exchange", () => {
  it("JSON v2 往返保留金额、分组、预算结算、退款和来源；重复任务/文件不重复入账", async () => {
    expect(data.schemaVersion).toBe(2);
    expect(JSON.stringify(data)).not.toMatch(
      /passwordHash|private-path|"token"|encryptedKey/,
    );
    const p = await previewImport(target, { content: JSON.stringify(data) });
    expect(p.errors).toEqual([]);
    expect(p.unresolved).toEqual([]);
    expect(p.canCommit).toBe(true);
    const report = await commitImport(target, { jobId: p.jobId });
    expect(report.after.expense).toBe(90000);
    expect(report.after.refund).toBe(2000);
    expect(report.after.saving).toBe(20000);
    expect(await commitImport(target, { jobId: p.jobId })).toEqual(report);
    const restored = await exportData(target);
    expect(financialSummary(restored).saving).toBe(20000);
    expect(restored.groups).toHaveLength(data.groups.length);
    expect(restored.lists).toHaveLength(2);
    const e = restored.ledger.find((r: any) => r.sourceShoppingItemId);
    const i = restored.shopping.find(
      (r: any) => r.id === e.sourceShoppingItemId,
    );
    expect(i.ledgerId).toBe(e.id);
    expect(i.purchaseAmount).toBe(80000);
    expect(
      restored.groups.find((r: any) => r.id === e.groupId).sourceListId,
    ).toBe(i.listId);
    expect(
      restored.savings.find((r: any) => r.source === "automatic")
        .supersededBySettlementId,
    ).toBe(restored.settlements[0].id);
    expect(JSON.parse(restored.settlements[0].members)[0].id).toBe(i.id);
    expect(restored.drafts[0].state).toBe("failed");
    expect(restored.drafts[0].error).toContain("重新选择截图");
    expect(restored.drafts[0].leaseId).toBeNull();
    expect(restored.attachments[0].missing).toBe(true);
    const again = await previewImport(target, {
      content: JSON.stringify(data),
    });
    expect(again.conflicts).toEqual([]);
    expect(again.added).toBe(0);
    expect(again.canCommit).toBe(true);
    await commitImport(target, { jobId: again.jobId });
    expect((await exportData(target)).ledger).toHaveLength(data.ledger.length);
  });
  it("同用户回导同一数据集跳过现有记录", async () => {
    const p = await previewImport(source, { content: JSON.stringify(data) });
    expect(p.added).toBe(0);
    expect(p.canCommit).toBe(true);
  });
  it("CSV v2 公式防护、引号和换行可逆；两个 CSV 与 JSON 共享身份去重", async () => {
    const sample = [
      "=SUM(A1)",
      "+hello",
      "-text",
      "@name",
      "'quoted",
      " leading",
      'x,"y"\nnew',
      "\ttab",
      "\rCR",
    ];
    const rows = parseCsv(encodeCsv([sample]));
    expect(
      rows[0].map((s) => (/^'[=+\-@'\t\r\n ]/.test(s) ? s.slice(1) : s)),
    ).toEqual(sample);
    for (const entity of ["ledger", "savings"] as const) {
      const csv = exportCsv(data, entity);
      const parsed = decodeFile(csv);
      expect(parsed.records[entity].map((r) => r.title)).toEqual(
        data[entity].map((r: any) => r.title),
      );
      const p = await previewImport(target, { content: csv });
      // CSV is a projection. Fields absent from CSV are not a reason to duplicate full JSON records.
      expect(p.unresolved).toEqual([]);
      expect(p.conflicts).toEqual([]);
      expect(p.added).toBe(0);
      expect(p.canCommit).toBe(true);
    }
  });
  it("旧 JSON 回填购买快照与来源；孤立已购保留待核对，旧 CSV 不套默认账户", async () => {
    const u = await user();
    const legacy: any = {
      schemaVersion: 1,
      accounts: [{ id: "account", name: "旧账户" }],
      lists: [{ id: "list", name: "旧清单" }],
      shopping: [
        {
          id: "bought",
          listId: "list",
          name: "旧物品",
          status: "purchased",
          ledgerId: "entry",
        },
        { id: "orphan", listId: "list", name: "无账单", status: "purchased" },
      ],
      ledger: [
        {
          id: "entry",
          type: "expense",
          title: "旧支出",
          amount: 12345,
          date: "2026-11-10",
          accountId: "account",
        },
      ],
    };
    const p = await previewImport(u, {
      content: JSON.stringify(legacy),
      sourceId: "old-library",
    });
    expect(p.errors).toEqual([]);
    expect(p.canCommit).toBe(true);
    await commitImport(u, { jobId: p.jobId });
    const out = await exportData(u);
    expect(
      out.shopping.find((r: any) => r.name === "旧物品").purchaseAmount,
    ).toBe(12345);
    expect(
      out.shopping.find((r: any) => r.name === "无账单").purchaseNeedsReview,
    ).toBe(true);
    const a = await save(u, "accounts", { name: "默认账户" });
    await db.user.change({
      where: { id: u.id },
      data: { defaultExpenseAccountId: a.id },
    });
    const csv = encodeCsv([
      ["ID", "日期", "类型", "标题", "金额（分）", "优惠（分）", "备注"],
      ["old-row", "2026-11-10", "expense", "旧 CSV", "100", "20", ""],
    ]);
    const cp = await previewImport(u, { content: csv, sourceId: "old-csv" });
    expect(cp.canCommit).toBe(true);
    await commitImport(u, { jobId: cp.jobId });
    expect(
      (await exportData(u)).ledger.find((r: any) => r.title === "旧 CSV")
        .accountId,
    ).toBeNull();
    expect((await exportData(u)).savings).toHaveLength(0);
  });
  it("非法退款、缺失结算成员、跨用户映射均阻止整批确认", async () => {
    const u = await user(),
      bad = structuredClone(data);
    bad.ledger.find((r: any) => r.type === "refund").refundOfId = "missing";
    const p = await previewImport(u, { content: JSON.stringify(bad) });
    expect(p.canCommit).toBe(false);
    expect(p.unresolved.some((r: any) => r.sourceId === "missing")).toBe(true);
    await expect(commitImport(u, { jobId: p.jobId })).rejects.toThrow("预检");
    expect(await db.ledgerEntry.count({ where: { ownerId: u.id } })).toBe(0);
    const cross = await previewImport(u, {
      content: JSON.stringify(data),
      mappings: [
        {
          entity: "accounts",
          sourceId: data.accounts[0].id,
          localId: data.accounts[0].id,
        },
      ],
    });
    expect(cross.errors.join()).toContain("无权访问");
    const broken = structuredClone(data);
    broken.settlements[0].members = JSON.stringify([{ id: "missing-member" }]);
    expect(
      (await previewImport(u, { content: JSON.stringify(broken) })).canCommit,
    ).toBe(false);
    await expect(
      commitImport(u, {
        jobId: (await previewImport(target, { content: JSON.stringify(data) }))
          .jobId,
      }),
    ).rejects.toThrow("无权访问");
  });
  it("预检后的本地变化使提交失效；同来源内容变化需显式决策", async () => {
    const u = await user();
    const p = await previewImport(u, { content: JSON.stringify(data) });
    await save(u, "accounts", { name: "并发新增" });
    await expect(commitImport(u, { jobId: p.jobId })).rejects.toThrow(
      "重新预检",
    );
    const changed = structuredClone(data);
    changed.ledger.find((r: any) => r.type === "income").title = "changed";
    const conflict = await previewImport(target, {
      content: JSON.stringify(changed),
    });
    expect(conflict.conflicts).toHaveLength(1);
    expect(conflict.canCommit).toBe(false);
    const decision = await previewImport(target, {
      content: JSON.stringify(changed),
      decisions: [
        {
          entity: "ledger",
          sourceId: changed.ledger.find((r: any) => r.type === "income").id,
          choice: "keep",
        },
      ],
    });
    expect(decision.canCommit).toBe(true);
    expect(decision.added).toBe(0);
  });
  it("金额类型、文件上限和重复源 ID 在事务前拒绝", async () => {
    const bad = structuredClone(data);
    bad.ledger[0].amount = 1.5;
    await expect(
      previewImport(target, { content: JSON.stringify(bad) }),
    ).rejects.toThrow("整数");
    const dup = structuredClone(data);
    dup.ledger.push(dup.ledger[0]);
    expect(() => decodeFile(JSON.stringify(dup))).toThrow("源 ID 重复");
    expect(() => decodeFile("x".repeat(500_001))).toThrow("500KB");
    const tooMany = {
      schemaVersion: 2,
      datasetId: "oversize",
      currency: "CNY",
      amountUnit: "cent",
      accounts: Array.from({ length: 301 }, (_, i) => ({
        id: String(i),
        name: "A",
      })),
    };
    expect(() => decodeFile(JSON.stringify(tooMany))).toThrow("300");
    expect(() => decodeFile(JSON.stringify({ schemaVersion: 1 }))).toThrow(
      "来源标识",
    );
    expect(entities.every((e) => Array.isArray(emptyRecords()[e]))).toBe(true);
  });
  it("独立账本 CSV 后导入省钱 CSV 复用来源映射，不自动再派生；模板可预检", async () => {
    const u = await user();
    const standalone: any = { ...emptyRecords(), datasetId: `csv-${op()}` };
    standalone.ledger = [
      {
        id: "csv-entry",
        title: '=原文,"优惠"\n第二行',
        type: "expense",
        amount: 8000,
        date: "2026-11-12",
        discount: 2000,
        grossAmount: 10000,
        autoSaving: true,
        orderKey: "source-order",
        note: "'原始引号",
      },
    ];
    standalone.savings = [
      {
        id: "csv-saving",
        title: "+优惠",
        type: "discount",
        source: "automatic",
        date: "2026-11-12",
        amount: 2000,
        actual: 8000,
        planned: 10000,
        ledgerId: "csv-entry",
        sourceKey: "discount:source-order",
        status: "valid",
        suppressed: false,
      },
    ];
    const lp = await previewImport(u, {
      content: exportCsv(standalone, "ledger"),
    });
    expect(lp.canCommit).toBe(true);
    await commitImport(u, { jobId: lp.jobId });
    expect(await db.savingEntry.count({ where: { ownerId: u.id } })).toBe(0);
    const sp = await previewImport(u, {
      content: exportCsv(standalone, "savings"),
    });
    expect(sp.errors).toEqual([]);
    expect(sp.canCommit).toBe(true);
    await commitImport(u, { jobId: sp.jobId });
    const out = await exportData(u);
    expect(out.ledger[0].title).toBe(standalone.ledger[0].title);
    expect(out.ledger[0].note).toBe("'原始引号");
    expect(out.savings[0].sourceKey).toBe(`discount:${out.ledger[0].orderKey}`);
    expect(out.savings[0].ledgerId).toBe(out.ledger[0].id);
    expect(
      (await previewImport(u, { content: exportCsv(standalone, "savings") }))
        .added,
    ).toBe(0);
    for (const e of ["ledger", "savings"]) {
      const template = await previewImport(await user(), {
        content: await readFile(`public/templates/${e}-v2.csv`, "utf8"),
      });
      expect(template.canCommit).toBe(true);
    }
  });
  it("并发确认同一任务仅导入一次；本地内容修改变成冲突", async () => {
    const u = await user();
    const p = await previewImport(u, { content: JSON.stringify(data) });
    const [a, b] = await Promise.all([
      commitImport(u, { jobId: p.jobId }),
      commitImport(u, { jobId: p.jobId }),
    ]);
    expect(a).toEqual(b);
    const entry = await db.ledgerEntry.require({
      where: { ownerId: u.id, type: "income" },
    });
    await db.ledgerEntry.change({
      where: { id: entry.id },
      data: { note: "本地手动修改", version: { increment: 1 } },
    });
    const again = await previewImport(u, { content: JSON.stringify(data) });
    expect(again.conflicts.some((c: any) => c.localId === entry.id)).toBe(true);
    expect(await db.ledgerEntry.count({ where: { ownerId: u.id } })).toBe(
      data.ledger.length,
    );
  });
  it("删除清单后的历史分组、账单来源可迁移；保留主动停用意图", async () => {
    const u = await user(),
      destination = await user();
    const list = await save(u, "lists", { name: "将被删除的清单" });
    const item = await save(u, "shopping", {
      listId: list.id,
      name: "保留账单",
    });
    await action(u, {
      action: "convert",
      id: item.id,
      version: item.version,
      mode: "buy",
      paid: 5000,
      date: "2026-11-12",
      discount: 1000,
      createLedger: true,
    });
    await action(u, {
      action: "batch",
      entity: "lists",
      mode: "delete",
      records: [{ id: list.id, version: list.version }],
    });
    const deleted = await exportData(u);
    expect(deleted.groups[0].sourceDeleted).toBe(true);
    const p = await previewImport(destination, {
      content: JSON.stringify(deleted),
    });
    expect(p.unresolved).toEqual([]);
    expect(p.errors).toEqual([]);
    expect(p.canCommit).toBe(true);
    await commitImport(destination, { jobId: p.jobId });
    const restored = await exportData(destination);
    expect(restored.groups[0].sourceDeleted).toBe(true);
    expect(restored.ledger[0].sourceShoppingItemId).toMatch(/^deleted:/);
    expect(restored.ledger[0].amount).toBe(5000);
    expect(restored.lists).toHaveLength(0);
  });
  it("按当前筛选导出正式记录，不产生组汇总行；转入账户参与筛选", () => {
    const rows: any = { ...emptyRecords(), datasetId: "filtered" };
    rows.ledger = [
      {
        id: "transfer",
        date: "2026-11-12",
        type: "transfer",
        title: "转账核对",
        amount: 100,
        discount: 0,
        autoSaving: false,
        accountId: "from",
        toAccountId: "to",
      },
      {
        id: "other",
        date: "2026-10-01",
        type: "income",
        title: "其他",
        amount: 200,
        discount: 0,
        autoSaving: false,
      },
    ];
    const filtered = decodeFile(
      exportCsv(
        rows,
        "ledger",
        new URLSearchParams({
          start: "2026-11-01",
          accountId: "to",
          q: "核对",
        }),
      ),
    );
    expect(filtered.records.ledger.map((r) => r.id)).toEqual(["transfer"]);
    rows.savings = [
      {
        id: "valid",
        date: "2026-11-12",
        title: "省钱",
        type: "reduced",
        source: "manual",
        amount: 100,
        status: "valid",
        suppressed: false,
      },
      {
        id: "revoked",
        date: "2026-11-12",
        title: "撤销",
        type: "reduced",
        source: "manual",
        amount: 200,
        status: "revoked",
        suppressed: false,
      },
    ];
    expect(
      decodeFile(
        exportCsv(
          rows,
          "savings",
          new URLSearchParams({ source: "manual", hideRevoked: "true" }),
        ),
      ).records.savings.map((r) => r.id),
    ).toEqual(["valid"]);
  });
  it("旧 JSON 多购物项引用同一支出时全部保持待核对，不猜唯一来源", () => {
    const legacy = decodeFile(
      JSON.stringify({
        schemaVersion: 1,
        lists: [{ id: "l", name: "历史" }],
        ledger: [
          {
            id: "e",
            title: "旧支出",
            type: "expense",
            date: "2026-11-12",
            amount: 100,
          },
        ],
        shopping: ["a", "b", "c"].map((id) => ({
          id,
          name: id,
          listId: "l",
          status: "purchased",
          ledgerId: "e",
        })),
      }),
      "ambiguous",
    );
    expect(
      legacy.records.shopping.every(
        (r) =>
          r.ledgerId === null &&
          r.purchaseNeedsReview &&
          r.purchaseAmount === 100,
      ),
    ).toBe(true);
    expect(legacy.records.ledger[0].sourceShoppingItemId).toBeNull();
  });
  it("导出恢复保留收纳箱、物品用途、来源快照和提醒处理状态", async () => {
    const u = await user(),
      destination = await user();
    const box = await save(u, "boxes", {
      name: "冬衣箱",
      location: "卧室衣柜",
      note: "换季",
      color: "#6F7F63",
    });
    const item = await save(u, "items", {
      name: "羽绒服",
      quantity: 2,
      unit: "件",
      storageEnabled: true,
      boxId: box.id,
      expiryEnabled: true,
      expiresOn: addDays(new Date().toISOString().slice(0, 10), 20),
      costEnabled: false,
      sourceNote: "2026-11-13 · 手工登记",
      note: "干洗后收纳",
    });
    const rule = await action(u, {
      action: "reminderSave",
      targetType: "item",
      targetId: item.id,
      triggerType: "fixed",
      fixedAt: new Date(Date.now() - 60_000).toISOString(),
      timezone: "Asia/Shanghai",
    });
    const checked = await action(u, { action: "reminderCheck" });
    const occurrence = checked.reminders.find(
      (row: any) => row.ruleId === rule.id,
    );
    expect(occurrence).toBeTruthy();
    await action(u, {
      action: "reminderHandle",
      id: occurrence.id,
      mode: "done",
    });
    const exported = await exportData(u);
    const preview = await previewImport(destination, {
      content: JSON.stringify(exported),
    });
    expect(preview.errors).toEqual([]);
    expect(preview.unresolved).toEqual([]);
    expect(preview.canCommit).toBe(true);
    await commitImport(destination, { jobId: preview.jobId });
    const restored = await exportData(destination);
    const restoredBox = restored.boxes[0];
    const restoredItem = restored.items.find(
      (row: any) => row.name === "羽绒服",
    );
    expect(restoredBox).toMatchObject({
      name: "冬衣箱",
      location: "卧室衣柜",
      color: "#6F7F63",
    });
    expect(restoredItem).toMatchObject({
      quantity: 2,
      unit: "件",
      storageEnabled: true,
      expiryEnabled: true,
      costEnabled: false,
      sourceNote: "2026-11-13 · 手工登记",
      boxId: restoredBox.id,
    });
    const restoredRule = restored.reminders.find(
      (row: any) => row.targetId === restoredItem.id,
    );
    expect(restoredRule?.targetType).toBe("item");
    const restoredOccurrence = restored.reminderEvents.find(
      (row: any) => row.ruleId === restoredRule.id,
    );
    expect(restoredOccurrence?.state).toBe("done");
    expect(restoredOccurrence?.handledAt).toBeTruthy();
  });
});
