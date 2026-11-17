import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { mutate, vote } from "../src/server/services";
import { localDate } from "../src/lib/domain";
import { addDays } from "../src/lib/period";
import { applyDraft, processDraft, normalizeCandidate } from "../src/server/ai";

let user: any, other: any;
const op = () => randomUUID();
const save = (entity: string, data: any, extra = {}) =>
  mutate(user, { action: "save", entity, data, operationId: op(), ...extra });
beforeAll(async () => {
  user = await db.user.insert({
    data: { username: `test-${op()}`, passwordHash: "test-only" },
  });
  other = await db.user.insert({
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
    "reminderOccurrence",
    "reminderRule",
    "usageLog",
    "ownedItem",
    "storageBox",
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
      await db.reviewVote.removeAll({
        where: { userId: { in: [user.id, other.id] } },
      });
    } else
      await (db as any)[model].removeAll({
        where: { ownerId: { in: [user.id, other.id] } },
      });
  }
  await db.user.removeAll({ where: { id: { in: [user.id, other.id] } } });
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
      (await db.savingEntry.require({ where: { ledgerId: first.id } })).status,
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
      (await db.savingEntry.require({ where: { ledgerId: first.id } })).status,
    ).toBe("revoked");
  });
  it("跨用户批量修改会整体回滚", async () => {
    const own: any = await save("lists", { name: "保持原名" });
    const foreign = await db.shoppingList.insert({
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
      (await db.shoppingList.require({ where: { id: own.id } })).name,
    ).toBe("保持原名");
  });
  it("手动添加和编辑账本可选择分组，且不能使用他人分组", async () => {
    const group: any = await mutate(user, {
      action: "groupSave",
      name: "旅行",
      operationId: op(),
    });
    const entry: any = await save("ledger", {
      type: "expense",
      title: "分组账单",
      amount: 1000,
      date: localDate(),
      groupId: group.id,
    });
    expect(entry.groupId).toBe(group.id);
    const inherited: any = await save("ledger", {
      type: "refund",
      title: "退款跟随分组",
      amount: 100,
      refundOfId: entry.id,
      date: localDate(),
    });
    expect(inherited.groupId).toBe(group.id);
    const explicit: any = await save("ledger", {
      type: "refund",
      title: "退款指定未分组",
      amount: 100,
      refundOfId: entry.id,
      date: localDate(),
      groupId: null,
    });
    expect(explicit.groupId).toBeNull();
    const edited: any = await save(
      "ledger",
      { groupId: null },
      { id: entry.id, version: entry.version },
    );
    expect(edited.groupId).toBeNull();
    const foreign = await db.recordGroup.insert({
      data: { ownerId: other.id, name: "他人分组" },
    });
    await expect(
      save("ledger", {
        type: "expense",
        title: "越权分组",
        amount: 1000,
        date: localDate(),
        groupId: foreign.id,
      }),
    ).rejects.toThrow("无权访问");
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
    const savings = await db.savingEntry.list({
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
      (await db.reviewRequest.require({ where: { id: review.id } })).status,
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
    const draft = await db.captureDraft.insert({
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
    const result = await db.captureDraft.require({
      where: { id: draft.id },
    });
    expect(result.capturedAt.toISOString()).toBe("2026-11-09T15:30:00.000Z");
    expect(result.state).toBe("applied");
    expect(
      (
        await db.shoppingItem.require({
          where: { sourceDraftId: draft.id },
        })
      ).listId,
    ).toBe(list.id);
    await expect(
      applyDraft(user, { ...body, operationId: op() }),
    ).rejects.toThrow("已更新");
  });
  it("未到期的处理中草稿不会重复调用模型", async () => {
    const draft = await db.captureDraft.insert({
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
  it("同一条原话可分别确认物品和依赖提醒，并保存真实物品映射", async () => {
    const itemCandidate = {
      target: "items",
      data: {
        name: "牛奶",
        quantity: 6,
        unit: "盒",
        storageEnabled: true,
        location: "冰箱",
        expiryEnabled: true,
        expiresOn: "2026-12-01",
        costEnabled: false,
      },
      warnings: [],
    };
    const reminderCandidate = {
      target: "reminder",
      dependsOn: 0,
      data: {
        dependsOnName: "牛奶",
        triggerType: "relative",
        offsetDays: 1,
        localTime: "09:00",
        timezone: "Asia/Shanghai",
      },
      warnings: [],
    };
    const draft = await db.captureDraft.insert({
      data: {
        ownerId: user.id,
        target: "auto",
        text: "买了六盒牛奶放冰箱，12月1日到期，提前一天提醒",
        capturedAt: new Date(),
        state: "ready",
        result: JSON.stringify([itemCandidate, reminderCandidate]),
      },
    });
    const result: any = await applyDraft(user, {
      operationId: op(),
      id: draft.id,
      version: draft.version,
      selections: [
        { index: 0, candidate: itemCandidate },
        { index: 1, candidate: reminderCandidate },
      ],
    });
    expect(result.saved).toHaveLength(2);
    const item = await db.ownedItem.require({
      where: { sourceDraftId: draft.id },
    });
    expect(item).toMatchObject({
      name: "牛奶",
      quantity: 6,
      location: "冰箱",
      expiresOn: "2026-12-01",
    });
    const rule = await db.reminderRule.require({
      where: { ownerId: user.id, targetId: item.id },
    });
    expect(rule).toMatchObject({
      targetType: "item",
      triggerType: "relative",
      offsetDays: 1,
    });
    const savedDraft = await db.captureDraft.require({
      where: { id: draft.id },
    });
    expect(JSON.parse(savedDraft.result)[0].savedId).toBe(item.id);
  });
  it("物品更新候选按版本修改数量与位置，不新增物品", async () => {
    const item: any = await save("items", {
      name: "洗衣液",
      quantity: 1,
      unit: "瓶",
      storageEnabled: true,
      location: "卫生间",
      costEnabled: false,
      status: "active",
    });
    const candidate = {
      target: "itemUpdate",
      data: {
        itemId: item.id,
        itemVersion: item.version,
        quantity: 2,
        location: "阳台",
      },
      warnings: [],
    };
    const draft = await db.captureDraft.insert({
      data: {
        ownerId: user.id,
        target: "auto",
        text: "洗衣液还剩两瓶，挪到阳台了",
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
    const updated = await db.ownedItem.require({ where: { id: item.id } });
    expect(updated).toMatchObject({
      quantity: 2,
      location: "阳台",
      storageEnabled: true,
    });
    expect(
      await db.ownedItem.count({ where: { ownerId: user.id, name: "洗衣液" } }),
    ).toBe(1);
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
    const saving = await db.savingEntry.require({
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
      (await db.savingEntry.require({ where: { id: saving.id } })).suppressed,
    ).toBe(true);
    expect(
      await db.savingEntry.count({
        where: { ledgerId: entry.id, status: "valid" },
      }),
    ).toBe(0);
  });
  it("最后一票并发不会超过目标人数", async () => {
    const third = await db.user.insert({
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
      await db.reviewVote.removeAll({ where: { userId: third.id } });
      await db.appliedOperation.removeAll({ where: { ownerId: third.id } });
      await db.user.remove({ where: { id: third.id } });
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
    expect((await db.ledgerEntry.require({ where: { id: a.id } })).note).toBe(
      "",
    );
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
    const draft = await db.captureDraft.insert({
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
    const purchased = await db.shoppingItem.require({
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
    const linked = await db.ledgerEntry.require({
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
    const preserved = await db.shoppingItem.require({
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
    const repaired = await db.shoppingItem.require({
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
    const ledger = await db.ledgerEntry.require({
      where: { id: converted.ledgerId },
    });
    expect(ledger.amount).toBe(22000);
    expect(ledger.categoryId).toBe(secondCategory.id);
    expect(ledger.discount).toBe(500);
    expect(
      (
        await db.ownedItem.require({
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
        await db.ledgerEntry.require({
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
        await db.ledgerEntry.require({
          where: { id: converted.ledgerId },
        })
      ).categoryId,
    ).toBe(second.id);
  });
  it("草稿可以修改目标模块与清单，也能生成手动整理候选", async () => {
    const list: any = await save("lists", { name: "草稿归属测试" });
    const draft = await db.captureDraft.insert({
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

describe("生活管家第 0～2 期回归", () => {
  it("物品可选日期和箱子留空时按未设置保存", async () => {
    const item: any = await save("items", {
      name: `空可选值-${op().slice(0, 8)}`,
      quantity: 2,
      unit: "件",
      storageEnabled: true,
      location: "卧室 / 衣柜上层",
      boxId: "",
      expiryEnabled: false,
      expiresOn: "",
      costEnabled: false,
      purchaseDate: "",
      price: null,
      retiredDate: "",
    });
    expect(item.boxId).toBeNull();
    expect(item.expiresOn).toBeNull();
    expect(item.retiredDate).toBeNull();
    expect(item.purchaseDate).toBeNull();
    expect(item.quantity).toBe(2);
    expect(item.quantityConfirmedAt).toBeInstanceOf(Date);
  });

  it("购物数量只作描述，账本保存本次实际付款，并可顺手登记多条物品", async () => {
    const suffix = op().slice(0, 8);
    const milk = `牛奶-${suffix}`;
    const soap = `洗衣液-${suffix}`;
    const operationId = op();
    const body = {
      action: "save",
      entity: "ledger",
      operationId,
      data: {
        type: "expense",
        title: `超市采购-${suffix}`,
        amount: 20000,
        date: localDate(),
        items: [
          {
            name: milk,
            quantity: 6,
            unit: "盒",
            storageEnabled: true,
            location: "冰箱",
            expiryEnabled: true,
            expiresOn: addDays(localDate(), 10),
            costEnabled: false,
          },
          {
            name: soap,
            quantity: 1,
            unit: "瓶",
            storageEnabled: true,
            location: "阳台",
            costEnabled: false,
          },
        ],
      },
    };
    const first: any = await mutate(user, body);
    const retried: any = await mutate(user, body);
    expect(retried.id).toBe(first.id);
    expect(first.amount).toBe(20000);
    const items = await db.ownedItem.list({
      where: { ownerId: user.id, name: { in: [milk, soap] } },
    });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.price == null)).toBe(true);
    expect(items.every((item) => item.ledgerId == null)).toBe(true);
    expect(items.find((item) => item.name === milk)?.quantity).toBe(6);
    expect(items.find((item) => item.name === milk)?.sourceNote).toContain(
      "超市采购",
    );
    const edited: any = await save(
      "ledger",
      { note: "只改备注" },
      { id: first.id, version: first.version },
    );
    expect(edited.note).toBe("只改备注");
    expect(
      await db.ownedItem.count({
        where: { ownerId: user.id, name: { in: [milk, soap] } },
      }),
    ).toBe(2);
  });

  it("顺手登记独立成本时逐行保存价格，不按账单金额分摊", async () => {
    const suffix = op().slice(0, 8);
    const names = [`独立甲-${suffix}`, `独立乙-${suffix}`];
    await save("ledger", {
      type: "expense",
      title: `独立成本账单-${suffix}`,
      amount: 30000,
      date: localDate(),
      items: [
        {
          name: names[0],
          quantity: 1,
          unit: "件",
          costEnabled: true,
          price: 12000,
          purchaseDate: localDate(),
        },
        {
          name: names[1],
          quantity: 1,
          unit: "件",
          costEnabled: true,
          price: 8000,
          purchaseDate: localDate(),
        },
      ],
    });
    const items = await db.ownedItem.list({
      where: { ownerId: user.id, name: { in: names } },
    });
    expect(
      items.map((item) => item.price ?? 0).sort((a, b) => a - b),
    ).toEqual([8000, 12000]);
    expect(items.every((item) => item.ledgerId == null)).toBe(true);
  });

  it("顺手登记中途失败会回滚账单和物品", async () => {
    const suffix = op().slice(0, 8);
    const before = await db.ledgerEntry.count({ where: { ownerId: user.id } });
    await expect(
      save("ledger", {
        type: "expense",
        title: `回滚登记-${suffix}`,
        amount: 1000,
        date: localDate(),
        items: [
          { name: `有效-${suffix}`, quantity: 1, unit: "件" },
          {
            name: `缺到期日-${suffix}`,
            quantity: 1,
            unit: "件",
            expiryEnabled: true,
          },
        ],
      }),
    ).rejects.toThrow("到期日");
    expect(await db.ledgerEntry.count({ where: { ownerId: user.id } })).toBe(
      before,
    );
    expect(
      await db.ownedItem.count({
        where: { ownerId: user.id, name: { contains: suffix } },
      }),
    ).toBe(0);
  });

  it("出行清单拒绝购买和结算，复制时重置完成状态且不复制提醒", async () => {
    const suffix = op().slice(0, 8);
    const travel: any = await save("lists", {
      name: `海边-${suffix}`,
      kind: "travel",
      departureDate: addDays(localDate(), 5),
    });
    const item: any = await save("shopping", {
      listId: travel.id,
      name: `证件-${suffix}`,
      quantity: "1 份",
      groupName: "证件",
      done: false,
    });
    expect(item.budget).toBeNull();
    await expect(
      mutate(user, {
        action: "convert",
        operationId: op(),
        id: item.id,
        version: item.version,
        mode: "buy",
        paid: 100,
        date: localDate(),
      }),
    ).rejects.toThrow("只有购物清单");
    await expect(
      mutate(user, {
        action: "listCheckoutPreview",
        operationId: op(),
        id: travel.id,
        version: travel.version,
        rows: [{ id: item.id, version: item.version, paid: 100, date: localDate() }],
      }),
    ).rejects.toThrow("只有购物清单");
    await expect(
      mutate(user, {
        action: "listSettlementPreview",
        operationId: op(),
        id: travel.id,
      }),
    ).rejects.toThrow("只有购物清单");
    const rule: any = await mutate(user, {
      action: "reminderSave",
      operationId: op(),
      targetType: "listItem",
      targetId: item.id,
      triggerType: "fixed",
      fixedAt: new Date(Date.now() - 60_000).toISOString(),
      timezone: "Asia/Shanghai",
    });
    const copy: any = await mutate(user, {
      action: "copyList",
      operationId: op(),
      id: travel.id,
      version: travel.version,
      resetDone: true,
      departureDate: addDays(localDate(), 8),
    });
    const copied = await db.shoppingItem.first({
      where: { ownerId: user.id, listId: copy.id },
    });
    expect(copy.kind).toBe("travel");
    expect(copied?.done).toBe(false);
    expect(
      await db.reminderRule.count({
        where: { ownerId: user.id, targetType: "listItem", targetId: copied!.id },
      }),
    ).toBe(0);
    expect(
      await db.reminderRule.count({ where: { ownerId: user.id, id: rule.id } }),
    ).toBe(1);
  });

  it("购物复制不继承账单、物品成本、结算或省钱关系", async () => {
    const suffix = op().slice(0, 8);
    const list: any = await save("lists", {
      name: `购物-${suffix}`,
      kind: "shopping",
      budget: 10000,
    });
    const item: any = await save("shopping", {
      listId: list.id,
      name: `咖啡-${suffix}`,
      budget: 10000,
    });
    const bought: any = await mutate(user, {
      action: "convert",
      operationId: op(),
      id: item.id,
      version: item.version,
      mode: "buy",
      paid: 8000,
      date: localDate(),
      createLedger: true,
      createItem: true,
      createSaving: true,
      planned: 10000,
    });
    expect(bought.ledgerId).toBeTruthy();
    const copy: any = await mutate(user, {
      action: "copyList",
      operationId: op(),
      id: list.id,
      version: list.version,
      resetDone: true,
    });
    const copied = await db.shoppingItem.first({
      where: { ownerId: user.id, listId: copy.id },
    });
    expect(copied?.status).toBe("planned");
    expect(copied?.ledgerId).toBeNull();
    expect(copied?.ownedItemId).toBeNull();
    expect(copied?.purchaseAmount).toBeNull();
    expect(
      await db.savingEntry.count({
        where: { ownerId: user.id, shoppingItemId: copied!.id },
      }),
    ).toBe(0);
  });

  it("提醒重载、重复检查、稍后提醒和已处理状态持久化", async () => {
    const item: any = await save("items", {
      name: `提醒物品-${op().slice(0, 8)}`,
      expiryEnabled: true,
      expiresOn: localDate(),
      costEnabled: false,
    });
    const rule: any = await mutate(user, {
      action: "reminderSave",
      operationId: op(),
      targetType: "item",
      targetId: item.id,
      triggerType: "fixed",
      fixedAt: new Date(Date.now() - 60_000).toISOString(),
      timezone: "Asia/Shanghai",
    });
    const first: any = await mutate(user, { action: "reminderCheck" });
    const visible = first.reminders.find(
      (row: any) => row.ruleId === rule.id,
    );
    expect(visible).toBeTruthy();
    const second: any = await mutate(user, { action: "reminderCheck" });
    expect(
      second.reminders.find((row: any) => row.ruleId === rule.id)?.id,
    ).toBe(visible.id);
    expect(
      await db.reminderOccurrence.count({
        where: { ownerId: user.id, ruleId: rule.id },
      }),
    ).toBe(1);
    const until = new Date(Date.now() + 3_600_000).toISOString();
    await mutate(user, {
      action: "reminderHandle",
      operationId: op(),
      id: visible.id,
      mode: "snooze",
      until,
    });
    expect(
      (
        await mutate(user, { action: "reminderCheck" })
      ).reminders.some((row: any) => row.ruleId === rule.id),
    ).toBe(false);
    expect(
      (
        await mutate(user, { action: "reminderCheck" })
      ).reminders.some((row: any) => row.ruleId === rule.id),
    ).toBe(false);
    const snoozed = await db.reminderOccurrence.require({
      where: { id: visible.id },
    });
    expect(snoozed.state).toBe("pending");
    expect(snoozed.snoozedUntil?.toISOString()).toBe(until);
    await mutate(user, {
      action: "reminderHandle",
      operationId: op(),
      id: visible.id,
      mode: "done",
    });
    const done: any = await mutate(user, { action: "reminderCheck" });
    expect(done.reminders.some((row: any) => row.ruleId === rule.id)).toBe(
      false,
    );
    expect(
      (await db.reminderOccurrence.require({ where: { id: visible.id } }))
        .state,
    ).toBe("done");
  });

  it("多个阈值只显示最近一个，完成目标和修改目标日期会停止旧提醒", async () => {
    const item: any = await save("items", {
      name: `阈值物品-${op().slice(0, 8)}`,
      expiryEnabled: true,
      expiresOn: localDate(),
      costEnabled: false,
    });
    const older: any = await mutate(user, {
      action: "reminderSave",
      operationId: op(),
      targetType: "item",
      targetId: item.id,
      triggerType: "fixed",
      fixedAt: new Date(Date.now() - 7_200_000).toISOString(),
      timezone: "Asia/Shanghai",
    });
    const newer: any = await mutate(user, {
      action: "reminderSave",
      operationId: op(),
      targetType: "item",
      targetId: item.id,
      triggerType: "fixed",
      fixedAt: new Date(Date.now() - 60_000).toISOString(),
      timezone: "Asia/Shanghai",
    });
    const checked: any = await mutate(user, { action: "reminderCheck" });
    const visible = checked.reminders.filter(
      (row: any) => row.targetId === item.id,
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].ruleId).toBe(newer.id);
    expect(
      (await db.reminderOccurrence.require({
        where: { ownerId: user.id, ruleId: older.id },
      })).state,
    ).toBe("superseded");
    await mutate(user, {
      action: "reminderHandle",
      operationId: op(),
      id: visible[0].id,
      mode: "done",
    });
    const relative: any = await mutate(user, {
      action: "reminderSave",
      operationId: op(),
      targetType: "item",
      targetId: item.id,
      triggerType: "relative",
      offsetDays: 0,
      localTime: "00:00",
      timezone: "Asia/Shanghai",
    });
    await mutate(user, { action: "reminderCheck" });
    const changed: any = await save(
      "items",
      { expiresOn: addDays(localDate(), 1) },
      { id: item.id, version: item.version },
    );
    const after: any = await mutate(user, { action: "reminderCheck" });
    expect(
      after.reminders.some((row: any) => row.ruleId === relative.id),
    ).toBe(false);
    expect(
      after.rules.find((row: any) => row.id === relative.id)?.targetDate,
    ).toBe(changed.expiresOn);
    expect(
      await db.reminderOccurrence.count({
        where: { ownerId: user.id, ruleId: relative.id, state: "cancelled" },
      }),
    ).toBe(1);
  });

  it("跨用户收纳箱和提醒目标均被拒绝", async () => {
    const foreignBox: any = await db.storageBox.insert({
      data: { ownerId: other.id, name: `他人箱-${op().slice(0, 8)}` },
    });
    const foreignItem: any = await db.ownedItem.insert({
      data: {
        ownerId: other.id,
        name: `他人物品-${op().slice(0, 8)}`,
        expiryEnabled: true,
        expiresOn: localDate(),
        costEnabled: false,
        purchaseDate: null,
        price: null,
      },
    });
    await expect(
      save("items", {
        name: `越权装箱-${op().slice(0, 8)}`,
        storageEnabled: true,
        boxId: foreignBox.id,
        costEnabled: false,
      }),
    ).rejects.toThrow("无权访问");
    await expect(
      mutate(user, {
        action: "reminderSave",
        operationId: op(),
        targetType: "item",
        targetId: foreignItem.id,
        triggerType: "fixed",
        fixedAt: new Date(Date.now() + 60_000).toISOString(),
        timezone: "Asia/Shanghai",
      }),
    ).rejects.toThrow("无权访问");
  });
});
