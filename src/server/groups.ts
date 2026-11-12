import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { effectiveSaving, localDate, validDate } from "@/lib/domain";
import {
  owned,
  convertShopping,
  purchaseRelink,
  purchaseEdit,
} from "./services";

type Tx = Prisma.TransactionClient;
const id = z.string().min(1).max(200);
const money = z.number().int().min(0).max(2_000_000_000);
const date = z.string().refine(validDate, "日期无效");
function version(record: any, expected: unknown) {
  if (record.version !== expected) throw new Error("记录已更新，请重新预览");
}

export async function listGroup(tx: Tx, ownerId: string, listId: string) {
  const list = await owned(tx, "shoppingList", listId, ownerId);
  return tx.recordGroup.upsert({
    where: { sourceListId: listId },
    create: { ownerId, name: list.name, sourceListId: listId },
    update: {},
  });
}

export async function invalidateList(tx: Tx, ownerId: string, listId: string) {
  const settlement = await tx.listSettlement.findFirst({
    where: { ownerId, listId },
  });
  if (!settlement || settlement.status === "revoked") return;
  await tx.listSettlement.update({
    where: { id: settlement.id },
    data: { status: "pending", version: { increment: 1 } },
  });
  await tx.savingEntry.updateMany({
    where: { ownerId, settlementId: settlement.id },
    data: { status: "pending", version: { increment: 1 } },
  });
}

export async function attachShoppingSource(
  tx: Tx,
  ownerId: string,
  item: any,
  entryId?: string,
) {
  const group = await listGroup(tx, ownerId, item.listId);
  if (entryId) {
    await tx.ledgerEntry.update({
      where: { id: entryId },
      data: { sourceShoppingItemId: item.id, groupId: group.id },
    });
    await tx.savingEntry.updateMany({
      where: { ownerId, ledgerId: entryId, source: "automatic" },
      data: {
        sourceListId: item.listId,
        groupId: group.id,
        shoppingItemId: item.id,
      },
    });
  }
  await tx.savingEntry.updateMany({
    where: { ownerId, shoppingItemId: item.id, source: "shopping" },
    data: { sourceListId: item.listId, groupId: group.id },
  });
  const settlement = await tx.listSettlement.findFirst({
    where: { ownerId, listId: item.listId },
  });
  const list = await owned(tx, "shoppingList", item.listId, ownerId);
  if (list.savingMode === "budget" && settlement)
    await tx.savingEntry.updateMany({
      where: {
        ownerId,
        sourceListId: list.id,
        source: { in: ["automatic", "shopping"] },
      },
      data: { supersededBySettlementId: settlement.id },
    });
  await invalidateList(tx, ownerId, item.listId);
}

export async function settlementPreview(
  tx: Tx,
  ownerId: string,
  listId: string,
) {
  const list = await owned(tx, "shoppingList", listId, ownerId);
  const items = await tx.shoppingItem.findMany({
    where: { ownerId, listId },
    orderBy: { id: "asc" },
  });
  const entries = await tx.ledgerEntry.findMany({
    where: { ownerId, sourceShoppingItemId: { in: items.map((i) => i.id) } },
  });
  const refunds = await tx.ledgerEntry.findMany({
    where: { ownerId, refundOfId: { in: entries.map((e) => e.id) } },
  });
  const savings = await tx.savingEntry.findMany({
    where: { ownerId, sourceListId: listId },
  });
  const settlement = await tx.listSettlement.findUnique({ where: { listId } });
  const paid = items
    .filter((i) => i.status === "purchased")
    .reduce((s, i) => s + (i.purchaseAmount ?? 0), 0);
  const unknown = items.filter(
    (i) =>
      i.status === "purchased" &&
      (i.purchaseAmount == null || !i.purchasedAt || i.purchaseNeedsReview),
  );
  const pending = items.filter(
    (i) => !["purchased", "skipped"].includes(i.status),
  );
  const ambiguous = savings.filter(
    (s) =>
      !s.settlementId &&
      !["automatic", "shopping"].includes(s.source) &&
      !s.suppressed &&
      s.status !== "revoked",
  );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({ list, items, entries, refunds, savings, settlement }),
    )
    .digest("hex");
  return {
    list,
    items,
    settlement,
    fingerprint,
    paid,
    linked: entries.reduce((s, e) => s + e.amount, 0),
    refunded: refunds.reduce((s, e) => s + e.amount, 0),
    unbooked: items.filter(
      (i) => i.status === "purchased" && !i.ledgerId && i.purchaseAmount !== 0,
    ).length,
    pending: pending.length,
    unknown: unknown.length,
    surplus: list.budget == null ? null : Math.max(list.budget - paid, 0),
    replaced: savings.filter((s) =>
      ["automatic", "shopping"].includes(s.source),
    ),
    ambiguous,
    effective: savings
      .filter(effectiveSaving)
      .reduce((s, e) => s + e.amount, 0),
    canSettle:
      list.budget != null &&
      !pending.length &&
      !unknown.length &&
      !ambiguous.length,
  };
}

const checkoutRow = z.object({
  id,
  version: z.number().int(),
  paid: money,
  date,
  categoryId: id.nullish(),
  accountId: id.nullish(),
  discount: money.default(0),
  discountDetails: z.string().max(10000).default(""),
  createItem: z.boolean().default(false),
  existingLedgerId: id.optional(),
  ledgerVersion: z.number().int().optional(),
});
export async function checkoutPreview(tx: Tx, ownerId: string, body: any) {
  const list = await owned(tx, "shoppingList", id.parse(body.id), ownerId);
  version(list, body.version);
  if (list.archived || list.closedAt) throw new Error("请先恢复或重新打开清单");
  const rows = z.array(checkoutRow).min(1).max(100).parse(body.rows);
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new Error("购物项重复");
  let count = 0,
    total = 0;
  for (const row of rows) {
    const item = await owned(tx, "shoppingItem", row.id, ownerId);
    version(item, row.version);
    if (item.listId !== list.id) throw new Error("物品不属于当前清单");
    if (item.ledgerId) continue;
    if (item.status === "skipped") throw new Error("已放弃的物品请先恢复待购");
    if (row.date > localDate()) throw new Error("购买日期不能在未来");
    if (row.paid === 0 && row.discount > 0)
      throw new Error("零元购买不能产生优惠支出");
    if (row.categoryId) {
      const c = await owned(tx, "category", row.categoryId, ownerId);
      if (c.archived || c.type !== "expense") throw new Error("支出分类不可用");
    }
    if (row.accountId) {
      const a = await owned(tx, "account", row.accountId, ownerId);
      if (a.archived) throw new Error("账户已归档");
    }
    if (row.existingLedgerId) {
      const entry = await owned(
        tx,
        "ledgerEntry",
        row.existingLedgerId,
        ownerId,
      );
      version(entry, row.ledgerVersion);
      if (
        entry.type !== "expense" ||
        entry.sourceShoppingItemId ||
        entry.amount !== row.paid ||
        entry.date !== row.date
      )
        throw new Error("已有账单金额/日期不匹配或已关联购物项");
      if (
        await tx.shoppingItem.count({ where: { ownerId, ledgerId: entry.id } })
      )
        throw new Error("账单已被关联");
    } else if (row.paid > 0) {
      count++;
      total += row.paid;
    }
  }
  const current = await settlementPreview(tx, ownerId, list.id);
  let projectedPaid = current.paid;
  for (const row of rows) {
    const item = current.items.find((i) => i.id === row.id)!;
    if (!item.ledgerId)
      projectedPaid +=
        row.paid -
        (item.status === "purchased" ? (item.purchaseAmount ?? 0) : 0);
  }
  const remaining = current.items.filter(
    (i) =>
      !["purchased", "skipped"].includes(i.status) &&
      !rows.some((r) => r.id === i.id),
  );
  const unresolved = current.items.filter(
    (i) =>
      i.status === "purchased" &&
      !rows.some((r) => r.id === i.id) &&
      (i.purchaseAmount == null || !i.purchasedAt || i.purchaseNeedsReview),
  );
  if (
    body.settle &&
    (list.budget == null ||
      remaining.length ||
      unresolved.length ||
      current.ambiguous.length)
  )
    throw new Error("未完成所有购买/放弃或实付待核对，无法同时结算");
  return {
    list,
    rows,
    count,
    total,
    groupName: list.name,
    fingerprint: current.fingerprint,
    projectedPaid,
    projectedSurplus:
      list.budget == null ? null : Math.max(list.budget - projectedPaid, 0),
  };
}

export async function groupAction(
  tx: Tx,
  ownerId: string,
  body: any,
): Promise<any> {
  if (body.action === "groupSave") {
    const name = z.string().trim().min(1).max(100).parse(body.name);
    if (!body.id) return tx.recordGroup.create({ data: { ownerId, name } });
    const group = await owned(tx, "recordGroup", id.parse(body.id), ownerId);
    version(group, body.version);
    if (group.sourceListId) throw new Error("请在来源清单修改组名");
    return tx.recordGroup.update({
      where: { id: group.id },
      data: { name, version: { increment: 1 } },
    });
  }
  if (body.action === "groupAssign") {
    const entity = z.enum(["ledger", "savings"]).parse(body.entity);
    const group = body.groupId
      ? await owned(tx, "recordGroup", id.parse(body.groupId), ownerId)
      : null;
    const records = z
      .array(z.object({ id, version: z.number().int() }))
      .min(1)
      .max(100)
      .parse(body.records);
    for (const r of records) {
      const record = await owned(
        tx,
        entity === "ledger" ? "ledgerEntry" : "savingEntry",
        r.id,
        ownerId,
      );
      version(record, r.version);
      if (entity === "ledger")
        await tx.ledgerEntry.update({
          where: { id: r.id },
          data: { groupId: group?.id ?? null, version: { increment: 1 } },
        });
      else
        await tx.savingEntry.update({
          where: { id: r.id },
          data: { groupId: group?.id ?? null, version: { increment: 1 } },
        });
    }
    return { count: records.length };
  }
  if (body.action === "groupDissolve") {
    const group = await owned(tx, "recordGroup", id.parse(body.id), ownerId);
    version(group, body.version);
    await tx.ledgerEntry.updateMany({
      where: { ownerId, groupId: group.id },
      data: { groupId: null, version: { increment: 1 } },
    });
    await tx.savingEntry.updateMany({
      where: { ownerId, groupId: group.id },
      data: { groupId: null, version: { increment: 1 } },
    });
    await tx.recordGroup.delete({ where: { id: group.id } });
    return {};
  }
  if (body.action === "listCheckout") {
    const preview = await checkoutPreview(tx, ownerId, body);
    if (body.fingerprint && body.fingerprint !== preview.fingerprint)
      throw new Error("清单或省钱记录已更新，请重新预览全部记账");
    for (const row of preview.rows) {
      const item = await owned(tx, "shoppingItem", row.id, ownerId);
      if (item.ledgerId) continue;
      if (row.existingLedgerId) {
        const entry = await owned(
          tx,
          "ledgerEntry",
          row.existingLedgerId,
          ownerId,
        );
        await tx.shoppingItem.update({
          where: { id: item.id },
          data: {
            status: "purchased",
            ledgerId: entry.id,
            purchaseAmount: entry.amount,
            purchasedAt: entry.date,
            purchaseAccountId: entry.accountId,
            purchaseDiscount: entry.discount,
            purchaseDiscountDetails: entry.discountDetails,
            categoryId: entry.categoryId,
            purchaseNeedsReview: false,
            purchaseRevision: { increment: 1 },
            version: { increment: 1 },
          },
        });
        await attachShoppingSource(tx, ownerId, item, entry.id);
        if (item.ownedItemId)
          await tx.ownedItem.updateMany({
            where: { ownerId, id: item.ownedItemId },
            data: {
              price: entry.amount,
              purchaseDate: entry.date,
              ledgerId: entry.id,
              version: { increment: 1 },
            },
          });
        else if (row.createItem) {
          const asset = await tx.ownedItem.create({
            data: {
              ownerId,
              name: item.name,
              price: entry.amount,
              purchaseDate: entry.date,
              ledgerId: entry.id,
            },
          });
          await tx.shoppingItem.update({
            where: { id: item.id },
            data: { ownedItemId: asset.id },
          });
        }
      } else if (row.paid === 0) {
        if (item.status === "purchased")
          await purchaseEdit(tx, ownerId, { ...row, amount: 0 });
        else
          await convertShopping(tx, ownerId, {
            ...row,
            mode: "buy",
            createLedger: false,
            createSaving: false,
          });
        if (
          item.status === "purchased" &&
          row.createItem &&
          !item.ownedItemId
        ) {
          const asset = await tx.ownedItem.create({
            data: {
              ownerId,
              name: item.name,
              price: 0,
              purchaseDate: row.date,
            },
          });
          await tx.shoppingItem.update({
            where: { id: item.id },
            data: { ownedItemId: asset.id },
          });
        }
      } else if (item.status === "purchased") {
        await purchaseRelink(tx, ownerId, {
          ...row,
          amount: row.paid,
          createSaving: false,
        });
      } else
        await convertShopping(tx, ownerId, {
          ...row,
          mode: "buy",
          createLedger: true,
          createSaving: false,
        });
    }
    if (body.settle) {
      const p = await settlementPreview(tx, ownerId, preview.list.id);
      await groupAction(tx, ownerId, {
        action: "listSettlementConfirm",
        id: preview.list.id,
        fingerprint: p.fingerprint,
        date: body.date,
        confirmedClosed: true,
      });
    }
    return { count: preview.count, total: preview.total };
  }
  if (body.action === "listReopen") {
    const list = await owned(tx, "shoppingList", id.parse(body.id), ownerId);
    version(list, body.version);
    await invalidateList(tx, ownerId, list.id);
    return tx.shoppingList.update({
      where: { id: list.id },
      data: { closedAt: null, version: { increment: 1 } },
    });
  }
  if (["listSettlementConfirm", "listSavingMode"].includes(body.action)) {
    const p = await settlementPreview(tx, ownerId, id.parse(body.id));
    if (p.fingerprint !== body.fingerprint)
      throw new Error("预算或关联记录已更新，请重新预览");
    if (body.action === "listSavingMode" && body.mode === "item") {
      if (p.settlement) {
        await tx.listSettlement.update({
          where: { id: p.settlement.id },
          data: { status: "revoked", version: { increment: 1 } },
        });
        await tx.savingEntry.updateMany({
          where: { ownerId, settlementId: p.settlement.id },
          data: { status: "revoked", version: { increment: 1 } },
        });
        await tx.savingEntry.updateMany({
          where: { ownerId, supersededBySettlementId: p.settlement.id },
          data: { supersededBySettlementId: null, version: { increment: 1 } },
        });
      }
      return tx.shoppingList.update({
        where: { id: p.list.id },
        data: { savingMode: "item", closedAt: null, version: { increment: 1 } },
      });
    }
    if (!p.canSettle || !body.confirmedClosed)
      throw new Error(
        "需设置预算、完成所有购买/放弃并核对实付和手工省钱后，确认采购结束",
      );
    const group = await listGroup(tx, ownerId, p.list.id);
    const settlement = await tx.listSettlement.upsert({
      where: { listId: p.list.id },
      create: {
        ownerId,
        listId: p.list.id,
        budget: p.list.budget!,
        paid: p.paid,
        members: JSON.stringify(p.items),
        status: "valid",
        confirmedAt: new Date(),
      },
      update: {
        budget: p.list.budget!,
        paid: p.paid,
        members: JSON.stringify(p.items),
        status: "valid",
        confirmedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.savingEntry.updateMany({
      where: {
        ownerId,
        sourceListId: p.list.id,
        source: { in: ["automatic", "shopping"] },
      },
      data: {
        supersededBySettlementId: settlement.id,
        version: { increment: 1 },
      },
    });
    const values = {
      title: `${p.list.name} 清单预算结余`,
      type: "budget_surplus",
      source: "settlement",
      date: date.parse(body.date ?? localDate()),
      planned: p.list.budget,
      actual: p.paid,
      amount: p.surplus!,
      sourceListId: p.list.id,
      status: p.surplus! > 0 ? "valid" : "revoked",
    };
    await tx.savingEntry.upsert({
      where: { settlementId: settlement.id },
      create: {
        ...values,
        ownerId,
        settlementId: settlement.id,
        groupId: group.id,
        sourceKey: `settlement:${p.list.id}`,
      },
      update: { ...values, version: { increment: 1 } },
    });
    await tx.shoppingList.update({
      where: { id: p.list.id },
      data: {
        savingMode: "budget",
        closedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return settlement;
  }
  throw new Error("未知分组或结算操作");
}
