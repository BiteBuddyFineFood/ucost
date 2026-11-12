import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { mutate, vote } from "../src/server/services";
import { localDate } from "../src/lib/domain";
import { applyDraft, processDraft, normalizeCandidate } from "../src/server/ai";

let user: any, other: any;
const op = () => randomUUID();
const save = (entity: string, data: any, extra = {}) =>
  mutate(user, { action: "save", entity, data, operationId: op(), ...extra });
beforeAll(async () => {
  user = await db.user.create({
    data: { username: `test-${op()}`, passwordHash: "test-only" },
  });
  other = await db.user.create({
    data: { username: `test-${op()}`, passwordHash: "test-only" },
  });
});
afterAll(async () => {
  for (const model of [
    "reviewVote",
    "reviewRequest",
    "usageLog",
    "ownedItem",
    "savingEntry",
    "shoppingItem",
    "shoppingList",
    "ledgerEntry",
    "category",
    "account",
    "captureDraft",
    "attachment",
    "categoryRule",
    "aiAnalysis",
    "appliedOperation",
  ]) {
    if (model === "reviewVote") {
      await db.reviewVote.deleteMany({
        where: { userId: { in: [user.id, other.id] } },
      });
    } else
      await (db as any)[model].deleteMany({
        where: { ownerId: { in: [user.id, other.id] } },
      });
  }
  await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  await db.$disconnect();
});
describe("数据库事务和权限", () => {
  it("重复操作 ID 不重复生成账单与优惠，退款使优惠待核对/失效", async () => {
    const operationId = op(),
      data = {
        type: "expense",
        title: "测试优惠",
        amount: 8000,
        discount: 2000,
        grossAmount: 10000,
        date: localDate(),
      };
    const first: any = await mutate(user, {
      action: "save",
      entity: "ledger",
      data,
      operationId,
    });
    const second: any = await mutate(user, {
      action: "save",
      entity: "ledger",
      data,
      operationId,
    });
    expect(first.id).toBe(second.id);
    expect(await db.savingEntry.count({ where: { ledgerId: first.id } })).toBe(
      1,
    );
    await save("ledger", {
      type: "refund",
      title: "部分退款",
      amount: 1000,
      refundOfId: first.id,
      date: localDate(),
    });
    expect(
      (await db.savingEntry.findFirstOrThrow({ where: { ledgerId: first.id } }))
        .status,
    ).toBe("pending");
    await expect(
      save("ledger", {
        type: "refund",
        title: "超额退款",
        amount: 8000,
        refundOfId: first.id,
        date: localDate(),
      }),
    ).rejects.toThrow("累计退款");
    await save("ledger", {
      type: "refund",
      title: "余款退回",
      amount: 7000,
      refundOfId: first.id,
      date: localDate(),
    });
    expect(
      (await db.savingEntry.findFirstOrThrow({ where: { ledgerId: first.id } }))
        .status,
    ).toBe("revoked");
  });
  it("跨用户批量修改会整体回滚", async () => {
    const own: any = await save("lists", { name: "保持原名" });
    const foreign = await db.shoppingList.create({
      data: { ownerId: other.id, name: "他人清单" },
    });
    await expect(
      mutate(user, {
        action: "batch",
        entity: "lists",
        mode: "edit",
        operationId: op(),
        records: [
          { id: own.id, version: own.version, data: { name: "不该保存" } },
          { id: foreign.id, version: foreign.version, data: { name: "越权" } },
        ],
      }),
    ).rejects.toThrow("无权访问");
    expect(
      (await db.shoppingList.findUniqueOrThrow({ where: { id: own.id } })).name,
    ).toBe("保持原名");
  });
  it("购物转换一次性生成支出、物品和无重叠的省钱", async () => {
    const list: any = await save("lists", { name: "购物测试" });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "椅子",
      budget: 50000,
    });
    const body = {
      action: "convert",
      operationId: op(),
      id: item.id,
      version: item.version,
      mode: "buy",
      date: localDate(),
      paid: 20000,
      discount: 2000,
      planned: 50000,
      createLedger: true,
      createItem: true,
      createSaving: true,
    };
    const result: any = await mutate(user, body);
    await mutate(user, body);
    expect(
      await db.ownedItem.count({ where: { id: result.ownedItemId } }),
    ).toBe(1);
    const savings = await db.savingEntry.findMany({
      where: {
        OR: [{ shoppingItemId: item.id }, { ledgerId: result.ledgerId }],
      },
    });
    expect(savings.reduce((s, x) => s + x.amount, 0)).toBe(30000);
  });
  it("每个参与者一份意见，结束后锁定", async () => {
    const list: any = await save("lists", { name: "评议测试" });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "是否买",
    });
    const review: any = await mutate(user, {
      action: "reviewCreate",
      operationId: op(),
      itemId: item.id,
      data: { title: "评议", targetCount: 1, rule: "all", visibility: "link" },
    });
    await expect(
      vote(user, review.token, {
        operationId: op(),
        approve: true,
        comment: "自己投",
      }),
    ).rejects.toThrow("发起者");
    await vote(other, review.token, {
      operationId: op(),
      approve: true,
      comment: "同意",
    });
    expect(
      (await db.reviewRequest.findUniqueOrThrow({ where: { id: review.id } }))
        .status,
    ).toBe("approved");
    await expect(
      vote(other, review.token, {
        operationId: op(),
        approve: false,
        comment: "改票",
      }),
    ).rejects.toThrow("已结束");
  });
  it("草稿逐条保留采集时间、部分确认并绑定清单，重复确认被拒绝", async () => {
    const list: any = await save("lists", { name: "草稿固定清单" });
    const candidate = {
      target: "shopping",
      data: { name: "牛奶", quantity: "两盒", listId: "外部指定无效清单" },
      warnings: [],
    };
    const draft = await db.captureDraft.create({
      data: {
        ownerId: user.id,
        target: "shopping",
        targetListId: list.id,
        text: "牛奶两盒",
        capturedAt: new Date("2026-11-09T15:30:00Z"),
        state: "ready",
        result: JSON.stringify([candidate]),
      },
    });
    const body = {
      operationId: op(),
      id: draft.id,
      version: draft.version,
      selections: [{ index: 0, candidate }],
    };
    await applyDraft(user, body);
    await applyDraft(user, body);
    const result = await db.captureDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(result.capturedAt.toISOString()).toBe("2026-11-09T15:30:00.000Z");
    expect(result.state).toBe("applied");
    expect(
      (
        await db.shoppingItem.findFirstOrThrow({
          where: { sourceDraftId: draft.id },
        })
      ).listId,
    ).toBe(list.id);
    await expect(
      applyDraft(user, { ...body, operationId: op() }),
    ).rejects.toThrow("已更新");
  });
  it("未到期的处理中草稿不会重复调用模型", async () => {
    const draft = await db.captureDraft.create({
      data: {
        ownerId: user.id,
        text: "测试领取",
        capturedAt: new Date(),
        state: "processing",
        leaseAt: new Date(),
        leaseId: op(),
      },
    });
    expect(await processDraft(user, draft.id)).toEqual({
      id: draft.id,
      skipped: true,
    });
  });
  it("AI 可选字段可安全归一化，必填金额不被擅自修正", () => {
    const result = normalizeCandidate({
      target: "shopping",
      data: { quantity: 2, note: null, budget: null },
      warnings: [],
    });
    expect(result.data.quantity).toBe("2");
    expect(result.data.note).toBeUndefined();
    expect(result.data.budget).toBeNull();
  });
  it("自动优惠被删除后不会随账单修改重建", async () => {
    const entry: any = await save("ledger", {
      type: "expense",
      title: "删除自动优惠",
      amount: 8000,
      discount: 2000,
      grossAmount: 10000,
      date: localDate(),
    });
    const saving = await db.savingEntry.findFirstOrThrow({
      where: { ledgerId: entry.id },
    });
    await mutate(user, {
      action: "batch",
      operationId: op(),
      entity: "savings",
      mode: "delete",
      records: [{ id: saving.id, version: saving.version }],
    });
    await save(
      "ledger",
      { note: "更新备注" },
      { id: entry.id, version: entry.version },
    );
    expect(
      (await db.savingEntry.findUniqueOrThrow({ where: { id: saving.id } }))
        .suppressed,
    ).toBe(true);
    expect(
      await db.savingEntry.count({
        where: { ledgerId: entry.id, status: "valid" },
      }),
    ).toBe(0);
  });
  it("最后一票并发不会超过目标人数", async () => {
    const third = await db.user.create({
      data: { username: `concurrent-${op()}`, passwordHash: "test-only" },
    });
    try {
      const list: any = await save("lists", { name: "并发评议" });
      const item: any = await save("shopping", {
        listId: list.id,
        name: "最后一票",
      });
      const review: any = await mutate(user, {
        action: "reviewCreate",
        operationId: op(),
        itemId: item.id,
        data: {
          title: "并发",
          targetCount: 1,
          rule: "majority",
          visibility: "link",
        },
      });
      const results = await Promise.allSettled([
        vote(other, review.token, {
          operationId: op(),
          approve: true,
          comment: "a",
        }),
        vote(third, review.token, {
          operationId: op(),
          approve: false,
          comment: "b",
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.reviewVote.count({ where: { reviewId: review.id } }),
      ).toBe(1);
    } finally {
      await db.reviewVote.deleteMany({ where: { userId: third.id } });
      await db.appliedOperation.deleteMany({ where: { ownerId: third.id } });
      await db.user.delete({ where: { id: third.id } });
    }
  });
  it("批量中途业务失败会回滚前面的写入", async () => {
    const a: any = await save("ledger", {
      type: "expense",
      title: "回滚前项",
      amount: 10000,
      date: localDate(),
    });
    const b: any = await save("ledger", {
      type: "expense",
      title: "回滚后项",
      amount: 20000,
      date: localDate(),
    });
    await save("ledger", {
      type: "refund",
      title: "退款约束",
      amount: 15000,
      date: localDate(),
      refundOfId: b.id,
    });
    await expect(
      mutate(user, {
        action: "batch",
        entity: "ledger",
        mode: "edit",
        operationId: op(),
        records: [
          { id: a.id, version: a.version, data: { note: "不应保留" } },
          { id: b.id, version: b.version, data: { amount: 1000 } },
        ],
      }),
    ).rejects.toThrow("不能小于");
    expect(
      (await db.ledgerEntry.findUniqueOrThrow({ where: { id: a.id } })).note,
    ).toBe("");
  });
  it("不买和降级省钱可只填计划与实际，自动推导金额不影响账本", async () => {
    const before = await db.ledgerEntry.count({ where: { ownerId: user.id } });
    const skipped: any = await save("savings", {
      title: "放弃购买",
      type: "skipped",
      planned: 50000,
      date: localDate(),
    });
    const downgraded: any = await save("savings", {
      title: "更便宜的替代",
      type: "downgrade",
      planned: 50000,
      actual: 20000,
      date: localDate(),
    });
    expect(skipped.amount).toBe(50000);
    expect(skipped.actual).toBe(0);
    expect(downgraded.amount).toBe(30000);
    expect(await db.ledgerEntry.count({ where: { ownerId: user.id } })).toBe(
      before,
    );
  });
  it("自动判断草稿的购物转换确认复用跨模块事务", async () => {
    const list: any = await save("lists", { name: "跨模块" });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "口述买到的椅子",
      budget: 50000,
    });
    const candidate = {
      target: "conversion",
      data: {
        itemId: item.id,
        itemVersion: item.version,
        mode: "buy",
        date: localDate(),
        paid: 20000,
        discount: 2000,
        planned: 50000,
        createLedger: true,
        createItem: true,
        createSaving: true,
      },
      warnings: [],
    };
    const draft = await db.captureDraft.create({
      data: {
        ownerId: user.id,
        target: "auto",
        text: "椅子买到了",
        capturedAt: new Date(),
        state: "ready",
        result: JSON.stringify([candidate]),
      },
    });
    await applyDraft(user, {
      operationId: op(),
      id: draft.id,
      version: draft.version,
      selections: [{ index: 0, candidate }],
    });
    const purchased = await db.shoppingItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(purchased.status).toBe("purchased");
    expect(purchased.ledgerId).toBeTruthy();
    expect(purchased.ownedItemId).toBeTruthy();
  });
});
