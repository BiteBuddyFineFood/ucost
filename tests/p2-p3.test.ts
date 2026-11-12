import "dotenv/config";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { db } from "../src/server/db";
import { mutate, snapshot } from "../src/server/services";
import { effectiveSaving, localDate } from "../src/lib/domain";
import {
  runAiTask,
  aiUsage,
  aiConfig,
  saveAiConfig,
  publicAddress,
} from "../src/server/ai-gateway";
import {
  callAI,
  processDrafts,
  suggest,
  analyze,
  polish,
} from "../src/server/ai";
import {
  classificationPreview,
  classificationApply,
} from "../src/server/classification";

const op = () => randomUUID();
let user: any, other: any;
const action = (body: any) =>
  mutate(user, { operationId: op(), ...body }) as Promise<any>;
const save = (entity: string, data: any, record?: any) =>
  action({
    action: "save",
    entity,
    data,
    ...(record ? { id: record.id, version: record.version } : {}),
  });
beforeAll(async () => {
  user = await db.user.create({
    data: { username: `p2-p3-${op()}`, passwordHash: "test" },
  });
  other = await db.user.create({
    data: { username: `p2-p3-${op()}`, passwordHash: "test" },
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  for (const model of [
    "aiTask",
    "aiDailyUsage",
    "userAiConfig",
    "listSettlement",
    "recordGroup",
    "savingEntry",
    "ledgerEntry",
    "shoppingItem",
    "shoppingList",
    "ownedItem",
    "usageLog",
    "categoryRule",
    "category",
    "account",
    "captureDraft",
    "aiAnalysis",
    "appliedOperation",
  ])
    await (db as any)[model].deleteMany({
      where: { ownerId: { in: [user.id, other.id] } },
    });
  await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  vi.unstubAllEnvs();
  await db.$disconnect();
});
async function preview(listId: string) {
  return action({ action: "listSettlementPreview", id: listId });
}
async function settle(listId: string) {
  const p = await preview(listId);
  return action({
    action: "listSettlementConfirm",
    id: listId,
    fingerprint: p.fingerprint,
    confirmedClosed: true,
  });
}
async function shoppingFixture(budget = 100000) {
  const list = await save("lists", { name: "跨日期采购", budget });
  const item = await save("shopping", {
    listId: list.id,
    name: "采购物品",
    budget: 100000,
  });
  const purchased = await action({
    action: "convert",
    id: item.id,
    version: item.version,
    mode: "buy",
    paid: 80000,
    date: "2026-11-10",
    discount: 5000,
    createLedger: true,
    createSaving: false,
  });
  return { list, item: purchased };
}
describe("P2 组、批量记账、整单结算", () => {
  it("预算1000实付800优惠50只累计200；重算复用结算；主动停用不恢复", async () => {
    const { list, item } = await shoppingFixture();
    const originalSaving = await db.savingEntry.findFirstOrThrow({
      where: { ledgerId: item.ledgerId },
    });
    await settle(list.id);
    let savings = await db.savingEntry.findMany({
      where: { ownerId: user.id, sourceListId: list.id },
    });
    expect(
      savings.filter(effectiveSaving).reduce((s, e) => s + e.amount, 0),
    ).toBe(20000);
    const originalSettlement = savings.find((s) => s.settlementId)!;
    expect(
      savings.find((s) => s.id === originalSaving.id)?.supersededBySettlementId,
    ).toBeTruthy();
    await action({
      action: "batch",
      entity: "savings",
      mode: "delete",
      records: [
        {
          id: originalSaving.id,
          version: savings.find((s) => s.id === originalSaving.id)!.version,
        },
      ],
    });
    const currentList = await db.shoppingList.findUniqueOrThrow({
      where: { id: list.id },
    });
    await action({
      action: "listReopen",
      id: list.id,
      version: currentList.version,
    });
    expect(
      (
        await db.savingEntry.findUniqueOrThrow({
          where: { id: originalSettlement.id },
        })
      ).status,
    ).toBe("pending");
    await settle(list.id);
    savings = await db.savingEntry.findMany({
      where: { sourceListId: list.id },
    });
    expect(savings.find((s) => s.settlementId)?.id).toBe(originalSettlement.id);
    const p = await preview(list.id);
    await action({
      action: "listSavingMode",
      id: list.id,
      fingerprint: p.fingerprint,
      mode: "item",
    });
    expect(
      (
        await db.savingEntry.findUniqueOrThrow({
          where: { id: originalSaving.id },
        })
      ).suppressed,
    ).toBe(true);
    expect(
      (
        await db.savingEntry.findMany({ where: { sourceListId: list.id } })
      ).filter(effectiveSaving),
    ).toHaveLength(0);
  });
  it("跨日期共组、移动不改来源预算、同名清单不同组、改名删除保留账单", async () => {
    const { list, item } = await shoppingFixture();
    const next = await save("shopping", {
      listId: list.id,
      name: "第二天采购",
    });
    const purchased = await action({
      action: "convert",
      id: next.id,
      version: next.version,
      mode: "buy",
      paid: 1000,
      date: "2026-11-12",
      createLedger: true,
    });
    const entries = await db.ledgerEntry.findMany({
      where: { id: { in: [item.ledgerId, purchased.ledgerId] } },
    });
    expect(new Set(entries.map((e) => e.groupId)).size).toBe(1);
    const manual = await action({ action: "groupSave", name: "旅行" });
    await action({
      action: "groupAssign",
      entity: "ledger",
      groupId: manual.id,
      records: entries.map((e) => ({ id: e.id, version: e.version })),
    });
    expect((await preview(list.id)).paid).toBe(81000);
    expect((await preview(list.id)).linked).toBe(81000);
    const sameName = await save("lists", { name: list.name });
    const another = await save("shopping", {
      listId: sameName.id,
      name: "同名来源",
    });
    await action({
      action: "convert",
      id: another.id,
      version: another.version,
      mode: "buy",
      paid: 1000,
      date: localDate(),
      createLedger: true,
    });
    const groups = await db.recordGroup.findMany({
      where: { sourceListId: { in: [list.id, sameName.id] } },
    });
    expect(groups).toHaveLength(2);
    const renamed = await save("lists", { name: "新名称" }, list);
    expect(
      (
        await db.recordGroup.findUniqueOrThrow({
          where: { sourceListId: list.id },
        })
      ).name,
    ).toBe("新名称");
    await action({
      action: "batch",
      entity: "lists",
      mode: "delete",
      records: [{ id: list.id, version: renamed.version }],
    });
    expect(
      await db.ledgerEntry.count({
        where: { id: { in: entries.map((e) => e.id) } },
      }),
    ).toBe(2);
    expect(
      (
        await db.recordGroup.findUniqueOrThrow({
          where: { sourceListId: list.id },
        })
      ).sourceDeleted,
    ).toBe(true);
  });
  it("全部记账事务、重复提交、零元物品、已入账跳过、越权批次无部分写入", async () => {
    const list = await save("lists", { name: "整单记账" });
    const first = await save("shopping", { listId: list.id, name: "付费物品" });
    const free = await save("shopping", { listId: list.id, name: "免费物品" });
    const body = {
      action: "listCheckout",
      operationId: op(),
      id: list.id,
      version: list.version,
      rows: [
        {
          id: first.id,
          version: first.version,
          paid: 5000,
          date: localDate(),
          createItem: true,
        },
        {
          id: free.id,
          version: free.version,
          paid: 0,
          date: localDate(),
          createItem: true,
        },
      ],
    };
    const p = await action({ ...body, action: "listCheckoutPreview" });
    expect(p.count).toBe(1);
    expect(p.total).toBe(5000);
    await action(body);
    await action(body);
    expect(
      await db.ledgerEntry.count({
        where: { sourceShoppingItemId: { in: [first.id, free.id] } },
      }),
    ).toBe(1);
    expect(
      await db.ownedItem.count({
        where: { ownerId: user.id, name: { in: ["付费物品", "免费物品"] } },
      }),
    ).toBe(2);
    const updated = await db.shoppingItem.findUniqueOrThrow({
      where: { id: first.id },
    });
    await action({
      ...body,
      operationId: op(),
      rows: [
        {
          id: first.id,
          version: updated.version,
          paid: 5000,
          date: localDate(),
        },
      ],
    });
    expect(
      await db.ledgerEntry.count({ where: { sourceShoppingItemId: first.id } }),
    ).toBe(1);
    const untouched = await save("shopping", {
      listId: list.id,
      name: "回滚物品",
    });
    const foreign = await db.shoppingItem.create({
      data: { ownerId: other.id, listId: list.id, name: "他人物品" },
    });
    await expect(
      action({
        ...body,
        operationId: op(),
        rows: [
          { id: untouched.id, version: 1, paid: 1000, date: localDate() },
          { id: foreign.id, version: 1, paid: 2000, date: localDate() },
        ],
      }),
    ).rejects.toThrow("无权访问");
    expect(
      (await db.shoppingItem.findUniqueOrThrow({ where: { id: untouched.id } }))
        .ledgerId,
    ).toBeNull();
  });
  it("删除支出、退款及购买金额修正使预算省钱待核对；重新确认无重复", async () => {
    const { list, item } = await shoppingFixture();
    await settle(list.id);
    const settlementSaving = await db.savingEntry.findFirstOrThrow({
      where: { sourceListId: list.id, type: "budget_surplus" },
    });
    await save("ledger", {
      type: "refund",
      title: "退款",
      amount: 1000,
      date: localDate(),
      refundOfId: item.ledgerId,
    });
    expect(
      (
        await db.savingEntry.findUniqueOrThrow({
          where: { id: settlementSaving.id },
        })
      ).status,
    ).toBe("pending");
    await settle(list.id);
    const current = await db.shoppingItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    await action({
      action: "purchaseEdit",
      id: item.id,
      version: current.version,
      amount: 75000,
      date: "2026-11-10",
    });
    expect(
      (
        await db.savingEntry.findUniqueOrThrow({
          where: { id: settlementSaving.id },
        })
      ).status,
    ).toBe("pending");
    await settle(list.id);
    expect(
      (
        await db.savingEntry.findUniqueOrThrow({
          where: { id: settlementSaving.id },
        })
      ).amount,
    ).toBe(25000);
    expect(
      await db.savingEntry.count({
        where: { sourceListId: list.id, type: "budget_surplus" },
      }),
    ).toBe(1);
  });
  it("未购、未知实付阻止结算；超预算不生成负省钱；预览过期拒绝", async () => {
    const { list } = await shoppingFixture(70000);
    await settle(list.id);
    const surplus = await db.savingEntry.findFirstOrThrow({
      where: { sourceListId: list.id, type: "budget_surplus" },
    });
    expect(surplus.amount).toBe(0);
    expect(effectiveSaving(surplus)).toBe(false);
    const otherList = await save("lists", { name: "未完成", budget: 0 });
    const item = await save("shopping", { listId: otherList.id, name: "待购" });
    const p = await preview(otherList.id);
    expect(p.canSettle).toBe(false);
    await save("shopping", { note: "已改" }, item);
    await expect(
      action({
        action: "listSettlementConfirm",
        id: otherList.id,
        fingerprint: p.fingerprint,
        confirmedClosed: true,
      }),
    ).rejects.toThrow("已更新");
    await db.shoppingItem.update({
      where: { id: item.id },
      data: {
        status: "purchased",
        purchaseAmount: null,
        purchaseNeedsReview: true,
      },
    });
    expect((await preview(otherList.id)).unknown).toBe(1);
  });
  it("删账后结算失效，补记复用物品档案且不重复生成省钱", async () => {
    const { list, item } = await shoppingFixture();
    const asset = await db.ownedItem.create({
      data: {
        ownerId: user.id,
        name: "复用档案",
        price: 80000,
        purchaseDate: item.purchasedAt,
        ledgerId: item.ledgerId,
      },
    });
    await db.shoppingItem.update({
      where: { id: item.id },
      data: { ownedItemId: asset.id },
    });
    await settle(list.id);
    const entry = await db.ledgerEntry.findUniqueOrThrow({
      where: { id: item.ledgerId },
    });
    await action({
      action: "batch",
      entity: "ledger",
      mode: "delete",
      records: [{ id: entry.id, version: entry.version }],
    });
    const missing = await db.shoppingItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(missing.purchaseAmount).toBe(80000);
    expect(missing.status).toBe("purchased");
    expect(missing.ledgerId).toBeNull();
    expect(
      (
        await db.savingEntry.findFirstOrThrow({
          where: { sourceListId: list.id, type: "budget_surplus" },
        })
      ).status,
    ).toBe("pending");
    await action({
      action: "listReopen",
      id: list.id,
      version: (
        await db.shoppingList.findUniqueOrThrow({ where: { id: list.id } })
      ).version,
    });
    const relinked = await action({
      action: "purchaseRelink",
      id: missing.id,
      version: missing.version,
      amount: 80000,
      date: missing.purchasedAt,
      discount: 5000,
      createItem: true,
      createSaving: false,
    });
    expect(relinked.asset.id).toBe(asset.id);
    expect(relinked.entry.sourceShoppingItemId).toBeNull();
    expect(
      (
        await db.ledgerEntry.findUniqueOrThrow({
          where: { id: relinked.entry.id },
        })
      ).sourceShoppingItemId,
    ).toBe(item.id);
    await settle(list.id);
    expect(
      (await db.savingEntry.findMany({ where: { sourceListId: list.id } }))
        .filter(effectiveSaving)
        .reduce((s, r) => s + r.amount, 0),
    ).toBe(20000);
  });
  it("零预算和未设预算不同；并发购买同项只生成一条账单", async () => {
    const list = await save("lists", { name: "零预算", budget: 0 });
    const item = await save("shopping", { listId: list.id, name: "并发购买" });
    const request = () =>
      action({
        action: "listCheckout",
        id: list.id,
        version: list.version,
        rows: [
          { id: item.id, version: item.version, paid: 100, date: localDate() },
        ],
      });
    await Promise.allSettled([request(), request()]);
    expect(
      await db.ledgerEntry.count({ where: { sourceShoppingItemId: item.id } }),
    ).toBe(1);
    expect((await preview(list.id)).surplus).toBe(0);
    const unset = await save("lists", { name: "未设预算" });
    expect((await preview(unset.id)).surplus).toBeNull();
  });
  it("一组跨月记录按月筛选汇总；解散组不改来源和金额", async () => {
    const { list, item } = await shoppingFixture();
    const second = await save("shopping", {
      listId: list.id,
      name: "上月物品",
    });
    await action({
      action: "convert",
      id: second.id,
      version: second.version,
      mode: "buy",
      paid: 1000,
      date: "2026-10-31",
      createLedger: true,
    });
    const group = await db.recordGroup.findUniqueOrThrow({
      where: { sourceListId: list.id },
    });
    const filtered = await db.ledgerEntry.findMany({
      where: {
        ownerId: user.id,
        groupId: group.id,
        date: { gte: "2026-11-01", lte: "2026-11-30" },
      },
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(item.ledgerId);
    const paid = (await preview(list.id)).paid;
    await action({
      action: "groupDissolve",
      id: group.id,
      version: group.version,
    });
    expect((await preview(list.id)).paid).toBe(paid);
    expect(
      (await db.ledgerEntry.findUniqueOrThrow({ where: { id: item.ledgerId } }))
        .sourceShoppingItemId,
    ).toBe(item.id);
  });
});

function setupAI(answer: any = { ok: true }) {
  vi.stubEnv("AI_API_KEY", "test-key");
  vi.stubEnv("AI_BASE_URL", "https://example.test/v1");
  vi.stubEnv("AI_TEXT_MODEL", "hidden-test-model");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(answer) } }],
          }),
          { status: 200 },
        ),
    ),
  );
}
async function clearUsage() {
  await db.aiTask.deleteMany({ where: { ownerId: user.id } });
  await db.aiDailyUsage.deleteMany({ where: { ownerId: user.id } });
  await db.userAiConfig.deleteMany({ where: { ownerId: user.id } });
}
describe("P3 统一 AI 任务和额度", () => {
  it("并发第10和11次只有一个成功；相同任务重试不扣次，失败释放", async () => {
    setupAI();
    await clearUsage();
    await db.aiDailyUsage.create({
      data: { ownerId: user.id, quotaDate: localDate(), used: 9 },
    });
    const request = (operationId: string) =>
      runAiTask(user.id, "test", operationId, { fixed: true }, () =>
        callAI("test", "test"),
      );
    const results = await Promise.allSettled([request(op()), request(op())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.message,
    ).toMatch(/额度/);
    expect((await aiUsage(user.id)).used).toBe(10);
    expect((await aiUsage(user.id)).reserved).toBe(0);
    await clearUsage();
    const taskId = op();
    await request(taskId);
    await request(taskId);
    expect((await aiUsage(user.id)).used).toBe(1);
    await expect(
      runAiTask(user.id, "test", taskId, { fixed: false }, () =>
        callAI("test", "test"),
      ),
    ).rejects.toThrow("输入已固定");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network failed");
      }),
    );
    await expect(request(op())).rejects.toThrow("网络不可达");
    expect((await aiUsage(user.id)).used).toBe(1);
    expect((await aiUsage(user.id)).reserved).toBe(0);
  });
  it("一批10草稿仅扣1次；部分失败有限重试，全部失败不扣", async () => {
    setupAI({
      candidates: [
        {
          target: "ledger",
          data: {
            type: "expense",
            title: "午饭",
            amount: 2000,
            date: localDate(),
          },
          warnings: [],
        },
      ],
      warnings: [],
    });
    await clearUsage();
    const drafts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.captureDraft.create({
          data: {
            ownerId: user.id,
            text: `午饭${i}`,
            target: "ledger",
            capturedAt: new Date(),
          },
        }),
      ),
    );
    const taskOperationId = op(),
      r = await processDrafts(user, {
        ids: drafts.map((d) => d.id),
        operationId: taskOperationId,
      });
    expect(r.results).toHaveLength(10);
    expect((await aiUsage(user.id)).used).toBe(1);
    await processDrafts(user, {
      ids: drafts.map((d) => d.id),
      operationId: taskOperationId,
    });
    expect((await aiUsage(user.id)).used).toBe(1);
    const failed = await db.captureDraft.create({
      data: { ownerId: user.id, text: "坏输入", capturedAt: new Date() },
    });
    const mock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", mock);
    const failure = await processDrafts(user, {
      ids: [failed.id],
      operationId: op(),
    });
    expect(failure.results[0]).toHaveProperty("error");
    expect(mock).toHaveBeenCalledTimes(2);
    expect((await aiUsage(user.id)).used).toBe(1);
    expect((await aiUsage(user.id)).reserved).toBe(0);
  });
  it("部分草稿成功只扣一次，失败项只重试一次并保存步骤进度", async () => {
    setupAI();
    await clearUsage();
    const good = await db.captureDraft.create({
      data: { ownerId: user.id, text: "成功", capturedAt: new Date() },
    });
    const bad = await db.captureDraft.create({
      data: { ownerId: user.id, text: "失败", capturedAt: new Date() },
    });
    let goodCalls = 0,
      badCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body),
          input = JSON.parse(body.messages[1].content);
        if (input.text === "失败") {
          badCalls++;
          throw new Error("failed");
        }
        goodCalls++;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidates: [
                      {
                        target: "ledger",
                        data: {
                          title: "成功候选",
                          type: "expense",
                          amount: 100,
                          date: localDate(),
                        },
                        warnings: [],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      }),
    );
    const operationId = op(),
      result = await processDrafts(user, {
        operationId,
        ids: [good.id, bad.id],
      });
    expect(goodCalls).toBe(1);
    expect(badCalls).toBe(2);
    expect(result.results.some((r) => "count" in r)).toBe(true);
    expect(result.results.some((r) => "error" in r)).toBe(true);
    expect((await aiUsage(user.id)).used).toBe(1);
    expect(
      (
        await db.aiTask.findUniqueOrThrow({
          where: { ownerId_operationId: { ownerId: user.id, operationId } },
        })
      ).result,
    ).toContain("count");
    await processDrafts(user, { operationId, ids: [good.id, bad.id] });
    expect(badCalls).toBe(2);
  });
  it("所有旧入口走网关；统计多阶段只扣1次；普通快照隐藏模型", async () => {
    setupAI({
      candidates: [
        {
          target: "ledger",
          data: {
            title: "建议",
            type: "expense",
            amount: 1000,
            date: localDate(),
          },
          warnings: [],
        },
      ],
    });
    await clearUsage();
    await expect(callAI("bypass", "test")).rejects.toThrow("统一任务入口");
    await suggest(user, {
      target: "ledger",
      text: "午饭10元",
      operationId: op(),
    });
    setupAI({ text: "润色内容" });
    await polish(user, { text: "购物说明", operationId: op() });
    expect((await aiUsage(user.id)).used).toBe(2);
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify(
                      ++calls === 1
                        ? {
                            start: "2026-11-01",
                            end: "2026-11-30",
                            type: "all",
                            categoryId: null,
                            comparePrevious: true,
                          }
                        : { content: "收支分析" },
                    ),
                  },
                },
              ],
            }),
          ),
      ),
    );
    await analyze(user, {
      filter: { start: "2026-11-01", end: "2026-11-30" },
      question: "这个月",
      force: true,
      operationId: op(),
    });
    expect(calls).toBe(2);
    expect((await aiUsage(user.id)).used).toBe(3);
    expect(JSON.stringify((await snapshot(user)).ai)).not.toContain(
      "hidden-test-model",
    );
  });
  it("过期执行租约释放原日期预占；迟到结果不写入不扣费", async () => {
    setupAI();
    await clearUsage();
    await db.aiDailyUsage.create({
      data: { ownerId: user.id, quotaDate: "2026-11-11", reserved: 1 },
    });
    const old = await db.aiTask.create({
      data: {
        ownerId: user.id,
        operationId: op(),
        kind: "test",
        providerMode: "system",
        quotaDate: "2026-11-11",
        input: "{}",
        leaseId: op(),
        leaseUntil: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    await aiUsage(user.id);
    expect(
      (
        await db.aiDailyUsage.findUniqueOrThrow({
          where: {
            ownerId_quotaDate: { ownerId: user.id, quotaDate: "2026-11-11" },
          },
        })
      ).reserved,
    ).toBe(0);
    expect(
      (await db.aiTask.findUniqueOrThrow({ where: { id: old.id } })).status,
    ).toBe("failed");
    expect((await aiUsage(user.id)).remaining).toBe(10);
    await db.aiDailyUsage.update({
      where: {
        ownerId_quotaDate: { ownerId: user.id, quotaDate: "2026-11-11" },
      },
      data: { reserved: 1 },
    });
    await db.aiTask.create({
      data: {
        ownerId: user.id,
        operationId: op(),
        kind: "process",
        providerMode: "system",
        quotaDate: "2026-11-11",
        input: "{}",
        result: JSON.stringify({ steps: [{ id: "saved-draft", count: 1 }] }),
        leaseId: op(),
        leaseUntil: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    await aiUsage(user.id);
    const oldUsage = await db.aiDailyUsage.findUniqueOrThrow({
      where: {
        ownerId_quotaDate: { ownerId: user.id, quotaDate: "2026-11-11" },
      },
    });
    expect(oldUsage.reserved).toBe(0);
    expect(oldUsage.used).toBe(1);
  });
  it("跨日读取已成功任务不重复扣次，额度耗尽仍能查看已保存分析", async () => {
    setupAI({ content: "缓存分析" });
    await clearUsage();
    const filter = { start: "2026-11-01", end: "2026-11-30" },
      operationId = op();
    await analyze(user, { filter, operationId, force: true });
    const task = await db.aiTask.findUniqueOrThrow({
      where: { ownerId_operationId: { ownerId: user.id, operationId } },
    });
    await db.aiTask.update({
      where: { id: task.id },
      data: { quotaDate: "2026-11-11" },
    });
    await db.aiDailyUsage.update({
      where: {
        ownerId_quotaDate: { ownerId: user.id, quotaDate: localDate() },
      },
      data: { used: 10 },
    });
    const cached = await analyze(user, { filter, operationId: op() });
    expect(cached.cached).toBe(true);
    expect(cached.content).toBe("缓存分析");
    const replay = await analyze(user, { filter, operationId, force: true });
    expect(replay.content).toBe("缓存分析");
    expect((await aiUsage(user.id)).used).toBe(10);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("个人密钥密文保存，API不返明文；不安全地址拒绝；个人失败不回退系统", async () => {
    setupAI();
    await clearUsage();
    vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "ab".repeat(32));
    const config = await saveAiConfig(user.id, {
      enabled: false,
      baseUrl: "https://8.8.8.8/v1",
      key: "private-key-never-export",
      textModel: "private-model",
      version: 0,
    });
    const stored = await db.userAiConfig.findUniqueOrThrow({
      where: { ownerId: user.id },
    });
    expect(stored.encryptedKey).not.toContain("private-key");
    expect(JSON.stringify(config)).not.toContain("private-key");
    expect((await aiConfig(user.id)).hasKey).toBe(true);
    await expect(
      saveAiConfig(user.id, {
        ...config,
        enabled: true,
        baseUrl: "https://127.0.0.1/v1",
      }),
    ).rejects.toThrow("内网");
    for (const address of [
      "127.0.0.1",
      "10.0.0.2",
      "169.254.169.254",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
    ])
      expect(publicAddress(address)).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    await saveAiConfig(user.id, { ...config, enabled: true });
    // Invalid configuration fails before any system fetch; no hidden fallback.
    await db.userAiConfig.update({
      where: { ownerId: user.id },
      data: { baseUrl: "https://127.0.0.1/v1" },
    });
    await expect(
      runAiTask(user.id, "test", op(), {}, () => callAI("test", "test")),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect((await aiUsage(user.id)).used).toBe(0);
    expect((await aiUsage(user.id)).providerMode).toBe("personal");
    await db.userAiConfig.deleteMany({ where: { ownerId: user.id } });
  });
  it("分类规则优先，建议持久化，确认只改分类；旧版本和归档分类拒绝", async () => {
    await clearUsage();
    const category = await save("categories", {
      name: `餐饮-${op()}`,
      type: "expense",
    });
    await db.categoryRule.create({
      data: { ownerId: user.id, keyword: "午饭", categoryId: category.id },
    });
    const entry = await save("ledger", {
      type: "expense",
      title: "午饭分类",
      amount: 2800,
      date: localDate(),
      note: "保留备注",
    });
    setupAI({
      suggestions: [{ id: entry.id, categoryId: null, reason: "模型未知" }],
    });
    const taskOperationId = op(),
      p = await classificationPreview(user, {
        entity: "ledger",
        records: [{ id: entry.id, version: entry.version }],
        operationId: taskOperationId,
      });
    expect(p.suggestions[0].categoryId).toBe(category.id);
    expect(
      (
        await db.aiTask.findFirstOrThrow({
          where: { ownerId: user.id, operationId: taskOperationId },
        })
      ).result,
    ).toContain("午饭分类");
    await classificationApply(user, {
      operationId: op(),
      taskOperationId,
      rows: [{ id: entry.id, categoryId: category.id }],
    });
    const changed = await db.ledgerEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(changed.amount).toBe(entry.amount);
    expect(changed.date).toBe(entry.date);
    expect(changed.note).toBe(entry.note);
    expect(changed.accountId).toBe(entry.accountId);
    await expect(
      classificationApply(user, {
        operationId: op(),
        taskOperationId,
        rows: [{ id: entry.id, categoryId: category.id }],
      }),
    ).rejects.toThrow("过期");
    const nextTask = op();
    await classificationPreview(user, {
      entity: "ledger",
      records: [{ id: changed.id, version: changed.version }],
      operationId: nextTask,
    });
    await save("categories", { archived: true }, category);
    await expect(
      classificationApply(user, {
        operationId: op(),
        taskOperationId: nextTask,
        rows: [{ id: entry.id, categoryId: category.id }],
      }),
    ).rejects.toThrow("归档");
    const foreign = await db.category.create({
      data: { ownerId: other.id, name: "其他用户", type: "expense" },
    });
    await expect(
      classificationApply(user, {
        operationId: op(),
        taskOperationId: nextTask,
        rows: [{ id: entry.id, categoryId: foreign.id }],
      }),
    ).rejects.toThrow("无权访问");
  });
  it("部署明确开放的个人本地服务可调用；失败不回退且系统额度不变", async () => {
    setupAI();
    await clearUsage();
    vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("AI_ALLOW_LOCAL_ENDPOINTS", "true");
    let fail = false,
      authorization = "";
    const server = createServer((req, res) => {
      authorization = req.headers.authorization || "";
      req.resume();
      req.on("end", () => {
        res.writeHead(fail ? 503 : 200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "localhost", resolve),
    );
    try {
      const port = (server.address() as any).port;
      await saveAiConfig(user.id, {
        enabled: true,
        baseUrl: `http://localhost:${port}/v1`,
        textModel: "local-test",
        key: "personal-local-key",
        version: 0,
      });
      expect(
        await runAiTask(user.id, "personal-test", op(), {}, () =>
          callAI("test", "test"),
        ),
      ).toEqual({ ok: true });
      expect(authorization).toBe("Bearer personal-local-key");
      expect(fetch).not.toHaveBeenCalled();
      fail = true;
      await expect(
        runAiTask(user.id, "personal-test", op(), {}, () =>
          callAI("test", "test"),
        ),
      ).rejects.toThrow("503");
      expect(fetch).not.toHaveBeenCalled();
      expect((await aiUsage(user.id)).used).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.userAiConfig.deleteMany({ where: { ownerId: user.id } });
    }
  });
});
