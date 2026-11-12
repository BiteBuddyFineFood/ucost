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
    "recordGroup",
    "listSettlement",
    "aiTask",
    "aiDailyUsage",
    "userAiConfig",
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
  it("删除账单保留已购事实和购买快照，补记不会重复入账", async () => {
    const list: any = await save("lists", { name: "快照测试" });
    const category: any = await save("categories", {
      name: `餐饮-${op()}`,
      type: "expense",
      iconKey: "coffee",
      color: "#B7794B",
    });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "带优惠的咖啡机",
      budget: 50000,
      categoryId: category.id,
    });
    const converted: any = await mutate(user, {
      action: "convert",
      operationId: op(),
      id: item.id,
      version: item.version,
      mode: "buy",
      date: localDate(),
      paid: 30000,
      discount: 2000,
      planned: 50000,
      categoryId: category.id,
      createLedger: true,
      createItem: true,
      createSaving: true,
    });
    expect(converted.purchaseAmount).toBe(30000);
    expect(converted.purchaseDiscount).toBe(2000);
    expect(converted.purchasedAt).toBe(localDate());
    expect(converted.categoryId).toBe(category.id);
    const linked = await db.ledgerEntry.findUniqueOrThrow({
      where: { id: converted.ledgerId },
    });
    expect(linked.categoryId).toBe(category.id);
    await mutate(user, {
      action: "batch",
      operationId: op(),
      entity: "ledger",
      mode: "delete",
      records: [{ id: linked.id, version: linked.version }],
    });
    const preserved = await db.shoppingItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(preserved.status).toBe("purchased");
    expect(preserved.ledgerId).toBeNull();
    expect(preserved.purchaseAmount).toBe(30000);
    expect(preserved.purchasedAt).toBe(localDate());
    expect(preserved.purchaseDiscount).toBe(2000);
    expect(preserved.purchaseNeedsReview).toBe(false);

    const relinkBody = {
      action: "purchaseRelink",
      operationId: op(),
      id: item.id,
      version: preserved.version,
      amount: 31000,
      date: localDate(),
      categoryId: category.id,
      discount: 0,
      planned: 50000,
      createItem: false,
      createSaving: true,
    };
    const relinked: any = await mutate(user, relinkBody);
    await mutate(user, relinkBody);
    expect(
      await db.ledgerEntry.count({
        where: { ownerId: user.id, id: relinked.entry.id },
      }),
    ).toBe(1);
    const repaired = await db.shoppingItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(repaired.ledgerId).toBe(relinked.entry.id);
    expect(repaired.purchaseAmount).toBe(31000);
    expect(repaired.purchaseNeedsReview).toBe(false);
  });
  it("修改购买信息同步账单、分类与物品成本，撤销后恢复待购", async () => {
    const list: any = await save("lists", { name: "购买修正测试" });
    const firstCategory: any = await save("categories", {
      name: `餐饮-${op()}`,
      type: "expense",
    });
    const secondCategory: any = await save("categories", {
      name: `数码-${op()}`,
      type: "expense",
    });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "修正测试物品",
      budget: 40000,
      categoryId: firstCategory.id,
    });
    const converted: any = await mutate(user, {
      action: "convert",
      operationId: op(),
      id: item.id,
      version: item.version,
      mode: "buy",
      date: localDate(),
      paid: 20000,
      discount: 0,
      categoryId: firstCategory.id,
      createLedger: true,
      createItem: true,
      createSaving: false,
    });
    const edited: any = await mutate(user, {
      action: "purchaseEdit",
      operationId: op(),
      id: item.id,
      version: converted.version,
      amount: 22000,
      date: localDate(),
      categoryId: secondCategory.id,
      discount: 500,
      syncLedgerCategory: true,
    });
    expect(edited.purchaseAmount).toBe(22000);
    expect(edited.categoryId).toBe(secondCategory.id);
    const ledger = await db.ledgerEntry.findUniqueOrThrow({
      where: { id: converted.ledgerId },
    });
    expect(ledger.amount).toBe(22000);
    expect(ledger.categoryId).toBe(secondCategory.id);
    expect(ledger.discount).toBe(500);
    expect(
      (
        await db.ownedItem.findUniqueOrThrow({
          where: { id: converted.ownedItemId },
        })
      ).price,
    ).toBe(22000);
    const undone: any = await mutate(user, {
      action: "purchaseUndo",
      operationId: op(),
      id: item.id,
      version: edited.version,
      keepItem: true,
    });
    expect(undone.status).toBe("planned");
    expect(undone.ledgerId).toBeNull();
    expect(
      await db.ledgerEntry.count({
        where: { ownerId: user.id, id: converted.ledgerId },
      }),
    ).toBe(0);
    expect(
      await db.ownedItem.count({
        where: { ownerId: user.id, id: converted.ownedItemId },
      }),
    ).toBe(1);
  });
  it("放弃购买恢复待购时撤销对应省钱记录", async () => {
    const list: any = await save("lists", { name: "恢复待购测试" });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "放弃后恢复",
      budget: 9000,
    });
    const skipped: any = await mutate(user, {
      action: "convert",
      operationId: op(),
      id: item.id,
      version: item.version,
      mode: "skip",
      date: localDate(),
      planned: 9000,
      createSaving: true,
    });
    expect(skipped.status).toBe("skipped");
    expect(
      await db.savingEntry.count({
        where: { ownerId: user.id, shoppingItemId: item.id },
      }),
    ).toBe(1);
    const restored: any = await mutate(user, {
      action: "purchaseRestore",
      operationId: op(),
      id: item.id,
      version: skipped.version,
    });
    expect(restored.status).toBe("planned");
    expect(
      await db.savingEntry.count({
        where: { ownerId: user.id, shoppingItemId: item.id },
      }),
    ).toBe(0);
  });
  it("默认支出账户只用于新支出，显式清空和编辑旧记录不被覆盖", async () => {
    const account: any = await save("accounts", { name: "默认账户测试" });
    await mutate(user, {
      action: "settings",
      autoBatch: false,
      batchSize: 5,
      defaultExpenseAccountId: account.id,
    });
    const implicit: any = await save("ledger", {
      type: "expense",
      title: "省略账户",
      amount: 1000,
      date: localDate(),
    });
    expect(implicit.accountId).toBe(account.id);
    const explicitNone: any = await save("ledger", {
      type: "expense",
      title: "显式不指定",
      amount: 1200,
      date: localDate(),
      accountId: null,
    });
    expect(explicitNone.accountId).toBeNull();
    const edited: any = await save(
      "ledger",
      { note: "只改备注" },
      { id: explicitNone.id, version: explicitNone.version },
    );
    expect(edited.accountId).toBeNull();
    await mutate(user, {
      action: "settings",
      autoBatch: false,
      batchSize: 5,
      defaultExpenseAccountId: null,
    });
  });
  it("分类图标可保存，购物分类会继承到账单并支持同步修改", async () => {
    const first: any = await save("categories", {
      name: `图标分类-${op().slice(0, 8)}`,
      type: "expense",
      iconKey: "coffee",
      color: "#B7794B",
    });
    const second: any = await save("categories", {
      name: `图标分类二-${op().slice(0, 8)}`,
      type: "expense",
      iconKey: "bus",
      color: "#5B7C99",
    });
    expect(first.iconKey).toBe("coffee");
    expect(first.color).toBe("#B7794B");
    const list: any = await save("lists", { name: "分类继承测试" });
    const item: any = await save("shopping", {
      listId: list.id,
      name: "分类继承物品",
      budget: 3000,
      categoryId: first.id,
    });
    const converted: any = await mutate(user, {
      action: "convert",
      operationId: op(),
      id: item.id,
      version: item.version,
      mode: "buy",
      date: localDate(),
      paid: 3000,
      categoryId: first.id,
      createLedger: true,
      createSaving: false,
    });
    expect(
      (
        await db.ledgerEntry.findUniqueOrThrow({
          where: { id: converted.ledgerId },
        })
      ).categoryId,
    ).toBe(first.id);
    const changed: any = await save(
      "shopping",
      { categoryId: second.id },
      { id: item.id, version: converted.version },
    );
    expect(changed.categoryId).toBe(second.id);
    expect(
      (
        await db.ledgerEntry.findUniqueOrThrow({
          where: { id: converted.ledgerId },
        })
      ).categoryId,
    ).toBe(second.id);
  });
  it("草稿可以修改目标模块与清单，也能生成手动整理候选", async () => {
    const list: any = await save("lists", { name: "草稿归属测试" });
    const draft = await db.captureDraft.create({
      data: {
        ownerId: user.id,
        text: "原本记在账本",
        target: "ledger",
        capturedAt: new Date(),
      },
    });
    const edited: any = await mutate(user, {
      action: "draftEdit",
      operationId: op(),
      id: draft.id,
      version: draft.version,
      target: "shopping",
      targetListId: list.id,
    });
    expect(edited.target).toBe("shopping");
    expect(edited.targetListId).toBe(list.id);
    expect(edited.state).toBe("pending");
    const manual: any = await mutate(user, {
      action: "draftManual",
      operationId: op(),
      id: draft.id,
      version: edited.version,
      target: "shopping",
      targetListId: list.id,
      data: { name: "手动候选物品", listId: list.id, budget: 1000 },
    });
    expect(manual.state).toBe("ready");
    const candidates = JSON.parse(manual.result);
    expect(candidates[0].target).toBe("shopping");
    expect(candidates[0].data.name).toBe("手动候选物品");
    expect(candidates[0].data.listId).toBe(list.id);
  });
});
