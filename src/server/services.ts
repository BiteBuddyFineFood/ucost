import { Prisma, User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import {
  localDate,
  validDate,
  reviewResult,
  savingSplit,
  defaultWidgets,
} from "@/lib/domain";

type Tx = Prisma.TransactionClient;
const text = z.string().max(10000);
const date = z.string().refine(validDate, "日期格式无效");
const amount = z.number().int().min(0).max(2_000_000_000);
const id = z.string().min(1).max(200);
const entrySchema = z.object({
  type: z.enum(["expense", "income", "transfer", "refund"]),
  title: text.min(1).max(200),
  amount: amount.positive(),
  date,
  accountId: id.nullish(),
  toAccountId: id.nullish(),
  categoryId: id.nullish(),
  refundOfId: id.nullish(),
  discount: amount.default(0),
  grossAmount: amount.nullish(),
  discountDetails: text.default(""),
  autoSaving: z.boolean().default(true),
  note: text.default(""),
  orderKey: text.max(200).nullish(),
});
const listSchema = z.object({
  name: text.min(1).max(100),
  description: text.default(""),
  archived: z.boolean().default(false),
  sort: z.number().int().default(0),
});
const shoppingSchema = z.object({
  listId: id,
  name: text.min(1).max(200),
  quantity: text.max(100).default(""),
  budget: amount.nullish(),
  reason: text.default(""),
  requirements: text.default(""),
  concerns: text.default(""),
  alternatives: text.default(""),
  timing: text.default(""),
  note: text.default(""),
  originalText: text.default(""),
  status: z
    .enum(["considering", "planned", "purchased", "skipped"])
    .default("considering"),
});
const itemSchema = z.object({
  name: text.min(1).max(200),
  purchaseDate: date,
  retiredDate: date.nullish(),
  price: amount,
  recovery: amount.default(0),
  ledgerId: id.nullish(),
  note: text.default(""),
  mode: z.enum(["day", "use"]).default("day"),
});
const savingSchema = z.object({
  title: text.min(1).max(200),
  type: z.enum(["discount", "skipped", "downgrade", "reduced"]),
  date,
  planned: amount.nullish(),
  actual: amount.nullish(),
  amount: amount.positive(),
  note: text.default(""),
  status: z.enum(["valid", "pending", "revoked"]).default("valid"),
});
const accountSchema = z.object({
  name: text.min(1).max(80),
  opening: z.number().int().min(-2_000_000_000).max(2_000_000_000).default(0),
  archived: z.boolean().default(false),
});
const categorySchema = z.object({
  name: text.min(1).max(40),
  type: z.enum(["income", "expense"]),
  archived: z.boolean().default(false),
});
const models: Record<string, string> = {
  ledger: "ledgerEntry",
  lists: "shoppingList",
  shopping: "shoppingItem",
  items: "ownedItem",
  savings: "savingEntry",
  accounts: "account",
  categories: "category",
  drafts: "captureDraft",
};
export async function owned(
  tx: any,
  model: string,
  recordId: string,
  ownerId: string,
) {
  const record = await tx[model].findFirst({
    where: { id: recordId, ownerId },
  });
  if (!record) throw new Error("记录不存在或无权访问");
  return record;
}
function checkVersion(record: any, version: unknown) {
  if (typeof version !== "number" || record.version !== version)
    throw new Error("记录已更新，请刷新后再试");
}
export async function operation(
  ownerId: string,
  operationId: unknown,
  kind: string,
  action: (tx: Tx) => Promise<unknown>,
) {
  const opId = id.parse(operationId);
  return db.$transaction(
    async (tx) => {
      const exists = await tx.appliedOperation.findUnique({
        where: { id: opId },
      });
      if (exists) {
        if (exists.ownerId !== ownerId || exists.kind !== kind)
          throw new Error("操作标识冲突");
        return JSON.parse(exists.result);
      }
      const result = await action(tx);
      await tx.appliedOperation.create({
        data: { id: opId, ownerId, kind, result: JSON.stringify(result ?? {}) },
      });
      return result;
    },
    { maxWait: 10000, timeout: 15000 },
  );
}

async function syncDiscount(tx: Tx, ownerId: string, entry: any) {
  const sourceKey = `discount:${entry.orderKey || entry.id}`;
  const previous = await tx.savingEntry.findUnique({ where: { sourceKey } });
  if (previous && previous.ownerId !== ownerId) throw new Error("优惠来源冲突");
  // One order-level discount must not be counted for every split line.
  if (previous && previous.ledgerId !== entry.id) {
    if (entry.discount > 0)
      throw new Error("这个订单已记录优惠，请勿在拆分账目重复填写");
    return;
  }
  const refunds = await tx.ledgerEntry.aggregate({
    where: { ownerId, refundOfId: entry.id },
    _sum: { amount: true },
  });
  const refunded = refunds._sum.amount || 0;
  const status =
    !entry.autoSaving || !entry.discount || refunded >= entry.amount
      ? "revoked"
      : refunded > 0
        ? "pending"
        : "valid";
  if (previous?.suppressed) return;
  const values = {
    title: `${entry.title} · 优惠`,
    type: "discount",
    source: "automatic",
    date: entry.date,
    planned: entry.grossAmount,
    actual: entry.amount,
    amount: entry.discount,
    ledgerId: entry.id,
    status,
  };
  if (previous)
    await tx.savingEntry.update({
      where: { id: previous.id },
      data: { ...values, version: { increment: 1 } },
    });
  else if (entry.discount && entry.autoSaving)
    await tx.savingEntry.create({ data: { ...values, ownerId, sourceKey } });
}

export async function saveEntity(
  tx: Tx,
  ownerId: string,
  entity: string,
  raw: any,
  existing?: any,
) {
  const model = models[entity];
  if (!model || entity === "drafts") throw new Error("不支持的类型");
  if (raw.sourceDraftId)
    await owned(tx, "captureDraft", id.parse(raw.sourceDraftId), ownerId);
  const merged = existing ? { ...existing, ...raw } : raw;
  let data: any;
  if (entity === "ledger") {
    data = entrySchema.parse(merged);
    if (
      existing &&
      (existing.type !== data.type ||
        existing.orderKey !== (data.orderKey ?? null))
    )
      throw new Error("账目类型和订单来源不可直接更改，请新增正确记录");
    for (const key of [
      "accountId",
      "toAccountId",
      "categoryId",
      "refundOfId",
      "orderKey",
    ])
      data[key] ||= null;
    if (data.accountId) await owned(tx, "account", data.accountId, ownerId);
    if (data.toAccountId) await owned(tx, "account", data.toAccountId, ownerId);
    if (data.type === "transfer") {
      if (
        !data.accountId ||
        !data.toAccountId ||
        data.accountId === data.toAccountId
      )
        throw new Error("转账需要两个不同账户");
      data.categoryId = null;
      data.refundOfId = null;
    } else data.toAccountId = null;
    if (data.type === "refund") {
      if (!data.refundOfId) throw new Error("请选择原支出");
      const original = await owned(tx, "ledgerEntry", data.refundOfId, ownerId);
      if (original.type !== "expense") throw new Error("退款只能关联支出");
      if (data.date < original.date) throw new Error("退款日期不能早于原支出");
      const others = await tx.ledgerEntry.aggregate({
        where: {
          ownerId,
          refundOfId: original.id,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        _sum: { amount: true },
      });
      if ((others._sum.amount || 0) + data.amount > original.amount)
        throw new Error("累计退款不能超过原支出");
      data.categoryId = original.categoryId;
    } else data.refundOfId = null;
    if (data.categoryId) {
      const category = await owned(tx, "category", data.categoryId, ownerId);
      if (category.type !== (data.type === "refund" ? "expense" : data.type))
        throw new Error("分类与收支类型不匹配");
    }
    if (existing?.type === "expense") {
      const refunds = await tx.ledgerEntry.findMany({
        where: { ownerId, refundOfId: existing.id },
      });
      if (refunds.reduce((s, x) => s + x.amount, 0) > data.amount)
        throw new Error("支出金额不能小于已退款合计");
      if (refunds.some((x) => x.date < data.date))
        throw new Error("支出日期不能晚于关联退款");
      if (data.categoryId !== existing.categoryId)
        await tx.ledgerEntry.updateMany({
          where: { ownerId, refundOfId: existing.id },
          data: { categoryId: data.categoryId, version: { increment: 1 } },
        });
    }
    if (data.type !== "expense") {
      data.discount = 0;
      data.grossAmount = null;
      data.discountDetails = "";
    }
    if (
      data.discount > 0 &&
      (data.grossAmount == null ||
        data.grossAmount !== data.amount + data.discount)
    )
      throw new Error("请核对优惠前金额：应等于实付加优惠（费用请计入应付）");
  } else if (entity === "lists") data = listSchema.parse(merged);
  else if (entity === "shopping") {
    data = shoppingSchema.parse(merged);
    const list = await owned(tx, "shoppingList", data.listId, ownerId);
    if (list.archived) throw new Error("清单已归档，请选择可用清单");
    if (
      (!existing && ["purchased", "skipped"].includes(data.status)) ||
      (existing &&
        data.status !== existing.status &&
        ["purchased", "skipped"].includes(data.status))
    )
      throw new Error("请使用购买/放弃操作，确认关联影响");
    if (
      existing &&
      ["purchased", "skipped"].includes(existing.status) &&
      data.status !== existing.status
    )
      throw new Error("已完成的购买决定不能直接改回待购");
  } else if (entity === "items") {
    data = itemSchema.parse(merged);
    if (
      data.purchaseDate > localDate() ||
      (data.retiredDate &&
        (data.retiredDate < data.purchaseDate ||
          data.retiredDate > localDate()))
    )
      throw new Error("购入/退役日期不合理");
    if (data.ledgerId) {
      const entry = await owned(tx, "ledgerEntry", data.ledgerId, ownerId);
      if (entry.type !== "expense") throw new Error("物品只能关联支出");
      data.price = entry.amount;
    }
  } else if (entity === "savings") {
    if (existing?.source === "automatic") {
      if (
        ["amount", "type", "planned", "actual", "date"].some(
          (key) => raw[key] !== undefined && raw[key] !== existing[key],
        )
      )
        throw new Error("自动优惠的金额和日期请通过关联账单修改");
      data = {
        title: text.min(1).parse(merged.title),
        note: text.parse(merged.note),
      };
    } else {
      const savingInput = { ...merged };
      if (
        savingInput.type === "skipped" &&
        typeof savingInput.planned === "number"
      ) {
        savingInput.actual = 0;
        savingInput.amount = savingInput.planned;
      }
      if (
        savingInput.type === "downgrade" &&
        typeof savingInput.planned === "number" &&
        typeof savingInput.actual === "number"
      )
        savingInput.amount = savingInput.planned - savingInput.actual;
      data = savingSchema.parse(savingInput);
      if (!existing) data.source = raw.source === "ai" ? "ai" : "manual";
      if (data.type === "skipped") {
        if (!data.planned) throw new Error("请输入原计划金额");
        data.actual = 0;
        data.amount = data.planned;
      }
      if (data.type === "downgrade") {
        if (
          data.planned == null ||
          data.actual == null ||
          data.planned <= data.actual
        )
          throw new Error("降级购买需要原计划金额大于实际金额");
        data.amount = data.planned - data.actual;
      }
    }
  } else if (entity === "accounts") data = accountSchema.parse(merged);
  else {
    data = categorySchema.parse(merged);
    if (
      existing &&
      existing.type !== data.type &&
      (await tx.ledgerEntry.count({
        where: { ownerId, categoryId: existing.id },
      }))
    )
      throw new Error("已有账目使用此分类，不能更改收支类型，请新建分类");
  }
  const record = existing
    ? await (tx as any)[model].update({
        where: { id: existing.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await (tx as any)[model].create({
        data: {
          ...data,
          ownerId,
          ...(raw.sourceDraftId ? { sourceDraftId: raw.sourceDraftId } : {}),
        },
      });
  if (entity === "items" && !existing && raw.initialUseCount)
    await tx.usageLog.create({
      data: {
        ownerId,
        itemId: record.id,
        count: z.number().int().min(1).max(1000000).parse(raw.initialUseCount),
        date: record.retiredDate || localDate(),
      },
    });
  if (entity === "ledger") {
    if (record.type === "expense") await syncDiscount(tx, ownerId, record);
    const parents = new Set(
      [existing?.refundOfId, record.refundOfId].filter(Boolean),
    );
    for (const parentId of parents) {
      const parent = await owned(
        tx,
        "ledgerEntry",
        parentId as string,
        ownerId,
      );
      await syncDiscount(tx, ownerId, parent);
    }
  }
  return record;
}

async function deleteEntity(
  tx: Tx,
  ownerId: string,
  entity: string,
  record: any,
) {
  if (entity === "accounts" || entity === "categories")
    throw new Error("账户和分类请归档，保留历史引用");
  if (entity === "ledger") {
    if (
      await tx.ledgerEntry.count({ where: { ownerId, refundOfId: record.id } })
    )
      throw new Error(`“${record.title}”存在退款，请先处理退款`);
    const items = await tx.ownedItem.findMany({
      where: { ownerId, ledgerId: record.id },
    });
    for (const item of items)
      await tx.ownedItem.update({
        where: { id: item.id },
        data: {
          price: record.amount,
          ledgerId: null,
          version: { increment: 1 },
        },
      });
    await tx.savingEntry.updateMany({
      where: { ownerId, ledgerId: record.id, source: "automatic" },
      data: { status: "revoked", suppressed: true, version: { increment: 1 } },
    });
    await tx.shoppingItem.updateMany({
      where: { ownerId, ledgerId: record.id },
      data: { ledgerId: null, version: { increment: 1 } },
    });
  }
  if (entity === "savings" && record.source === "automatic") {
    await tx.savingEntry.update({
      where: { id: record.id },
      data: { status: "revoked", suppressed: true, version: { increment: 1 } },
    });
    return;
  }
  if (entity === "lists") {
    const items = await tx.shoppingItem.findMany({
      where: { ownerId, listId: record.id },
    });
    for (const item of items) await deleteEntity(tx, ownerId, "shopping", item);
  }
  if (entity === "shopping") {
    await tx.reviewRequest.updateMany({
      where: { ownerId, itemId: record.id },
      data: {
        status: "revoked",
        token: randomBytes(24).toString("hex"),
        version: { increment: 1 },
      },
    });
    await tx.savingEntry.updateMany({
      where: { ownerId, shoppingItemId: record.id },
      data: { shoppingItemId: null },
    });
  }
  if (entity === "items") {
    await tx.usageLog.deleteMany({ where: { ownerId, itemId: record.id } });
    await tx.shoppingItem.updateMany({
      where: { ownerId, ownedItemId: record.id },
      data: { ownedItemId: null },
    });
  }
  if (entity === "drafts") {
    if (record.state === "processing")
      throw new Error("整理中的草稿请稍后删除");
    // Attachment metadata/files remain private until explicit maintenance cleanup; no business data is removed.
  }
  await (tx as any)[models[entity]].delete({ where: { id: record.id } });
  if (entity === "ledger" && record.refundOfId) {
    const parent = await owned(tx, "ledgerEntry", record.refundOfId, ownerId);
    await syncDiscount(tx, ownerId, parent);
  }
}

export async function convertShopping(tx: Tx, ownerId: string, body: any) {
  const item = await owned(tx, "shoppingItem", id.parse(body.id), ownerId);
  checkVersion(item, body.version);
  if (["purchased", "skipped"].includes(item.status)) return item;
  const list = await owned(tx, "shoppingList", item.listId, ownerId);
  if (list.archived) throw new Error("目标清单已归档，请先恢复清单");
  z.enum(["buy", "skip"]).parse(body.mode);
  const onDate = date.parse(body.date);
  const skip = body.mode === "skip";
  const paid = skip ? 0 : amount.positive().parse(body.paid);
  const discount = skip ? 0 : amount.parse(body.discount ?? 0);
  let entry: any;
  if (!skip && body.createLedger)
    entry = await saveEntity(tx, ownerId, "ledger", {
      type: "expense",
      title: item.name,
      amount: paid,
      date: onDate,
      discount,
      grossAmount: paid + discount,
      autoSaving: true,
      note: item.note,
      accountId: body.accountId || null,
    });
  let asset: any;
  if (!skip && body.createItem)
    asset = await saveEntity(tx, ownerId, "items", {
      name: item.name,
      purchaseDate: onDate,
      price: paid,
      ledgerId: entry?.id,
      note: item.note,
    });
  if (!skip && !body.createLedger && discount > 0)
    throw new Error("记录优惠需要同时生成关联账单，或将优惠设为零");
  if (body.createSaving) {
    const planned = amount.positive().parse(body.planned ?? item.budget);
    const split = skip
      ? { downgrade: planned }
      : savingSplit(planned, paid, discount);
    if (split.downgrade > 0)
      await tx.savingEntry.create({
        data: {
          ownerId,
          title: item.name,
          type: skip ? "skipped" : "downgrade",
          source: "shopping",
          date: onDate,
          planned,
          actual: skip ? 0 : paid + discount,
          amount: split.downgrade,
          shoppingItemId: item.id,
          sourceKey: `shopping:${item.id}:${skip ? "skip" : "downgrade"}`,
        },
      });
  }
  return tx.shoppingItem.update({
    where: { id: item.id },
    data: {
      status: skip ? "skipped" : "purchased",
      ledgerId: entry?.id,
      ownedItemId: asset?.id,
      version: { increment: 1 },
    },
  });
}

export async function mutate(user: User, body: any) {
  const ownerId = user.id;
  if (body.action === "preferences") {
    const preferences = z
      .object({
        schemaVersion: z.literal(1),
        widgets: z
          .array(z.enum(defaultWidgets as [string, ...string[]]))
          .max(16),
        sizes: z.record(z.string(), z.enum(["normal", "wide"])).optional(),
      })
      .parse(body.preferences);
    if (new Set(preferences.widgets).size !== preferences.widgets.length)
      throw new Error("组件不能重复");
    await db.user.update({
      where: { id: ownerId },
      data: { preferences: JSON.stringify(preferences) },
    });
    return {};
  }
  if (body.action === "settings") {
    const settings = z
      .object({
        autoBatch: z.boolean(),
        batchSize: z.number().int().min(5).max(10),
      })
      .parse(body);
    await db.user.update({ where: { id: ownerId }, data: settings });
    return {};
  }
  if (body.action === "resolveDiscount")
    return operation(
      ownerId,
      body.operationId,
      "resolveDiscount",
      async (tx) => {
        const saving = await owned(
          tx,
          "savingEntry",
          id.parse(body.id),
          ownerId,
        );
        checkVersion(saving, body.version);
        if (
          saving.source !== "automatic" ||
          saving.status !== "pending" ||
          !saving.ledgerId
        )
          throw new Error("此记录不需要核对");
        const entry = await owned(tx, "ledgerEntry", saving.ledgerId, ownerId);
        const kept = amount.parse(body.amount);
        if (kept > entry.discount) throw new Error("保留优惠不能超过原优惠");
        return tx.savingEntry.update({
          where: { id: saving.id },
          data: {
            amount: kept,
            status: kept ? "valid" : "revoked",
            note: `${saving.note}\n部分退款后人工核对保留优惠`,
            version: { increment: 1 },
          },
        });
      },
    );
  if (body.action === "save")
    return operation(ownerId, body.operationId, "save", async (tx) => {
      const entity = z
        .enum([
          "ledger",
          "lists",
          "shopping",
          "items",
          "savings",
          "accounts",
          "categories",
        ])
        .parse(body.entity);
      const existing = body.id
        ? await owned(tx, models[entity], id.parse(body.id), ownerId)
        : undefined;
      if (existing) checkVersion(existing, body.version);
      return saveEntity(tx, ownerId, entity, body.data, existing);
    });
  if (body.action === "restoreDiscount")
    return operation(
      ownerId,
      body.operationId,
      "restoreDiscount",
      async (tx) => {
        const saving = await owned(
          tx,
          "savingEntry",
          id.parse(body.id),
          ownerId,
        );
        checkVersion(saving, body.version);
        if (saving.source !== "automatic" || !saving.ledgerId)
          throw new Error("此记录不是可恢复的自动优惠");
        const entry = await owned(tx, "ledgerEntry", saving.ledgerId, ownerId);
        await tx.savingEntry.update({
          where: { id: saving.id },
          data: { suppressed: false, version: { increment: 1 } },
        });
        await tx.ledgerEntry.update({
          where: { id: entry.id },
          data: { autoSaving: true, version: { increment: 1 } },
        });
        await syncDiscount(tx, ownerId, { ...entry, autoSaving: true });
        return {};
      },
    );
  if (body.action === "batch")
    return operation(ownerId, body.operationId, "batch", async (tx) => {
      const entity = z
        .enum([
          "ledger",
          "lists",
          "shopping",
          "items",
          "savings",
          "accounts",
          "categories",
          "drafts",
        ])
        .parse(body.entity);
      const selected = z
        .array(
          z.object({
            id,
            version: z.number().int(),
            data: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .min(1)
        .max(100)
        .parse(body.records);
      if (new Set(selected.map((x) => x.id)).size !== selected.length)
        throw new Error("记录选择重复");
      const records = [];
      for (const selection of selected) {
        const record = await owned(tx, models[entity], selection.id, ownerId);
        checkVersion(record, selection.version);
        records.push({ selection, record });
      }
      if (body.mode === "delete" && entity === "ledger")
        records.sort(
          (a, b) =>
            Number(b.record.type === "refund") -
            Number(a.record.type === "refund"),
        );
      for (const { selection, record } of records) {
        if (body.mode === "delete")
          await deleteEntity(tx, ownerId, entity, record);
        else if (entity === "drafts") throw new Error("草稿请在确认面板修改");
        else
          await saveEntity(
            tx,
            ownerId,
            entity,
            selection.data ?? body.patch ?? {},
            record,
          );
      }
      return { count: records.length };
    });
  if (body.action === "draftIgnore")
    return operation(ownerId, body.operationId, "draftIgnore", async (tx) => {
      const draft = await owned(tx, "captureDraft", id.parse(body.id), ownerId);
      checkVersion(draft, body.version);
      if (draft.state === "processing")
        throw new Error("整理中的草稿请稍后操作");
      return tx.captureDraft.update({
        where: { id: draft.id },
        data: { state: "ignored", version: { increment: 1 } },
      });
    });
  if (body.action === "draftEdit")
    return operation(ownerId, body.operationId, "draftEdit", async (tx) => {
      const draft = await owned(tx, "captureDraft", id.parse(body.id), ownerId);
      checkVersion(draft, body.version);
      if (
        draft.state === "processing" ||
        JSON.parse(draft.appliedIndexes).length
      )
        throw new Error("处理中或已部分确认的原始记录不能修改，请另建补充草稿");
      const content = text.min(1).parse(body.text);
      return tx.captureDraft.update({
        where: { id: draft.id },
        data: {
          text: content,
          state: "pending",
          result: "[]",
          error: null,
          version: { increment: 1 },
        },
      });
    });
  if (body.action === "convert")
    return operation(ownerId, body.operationId, "convert", (tx) =>
      convertShopping(tx, ownerId, body),
    );
  if (body.action === "usage")
    return operation(ownerId, body.operationId, "usage", async (tx) => {
      const item = await owned(tx, "ownedItem", id.parse(body.id), ownerId);
      if (body.undoId) {
        const log = await owned(tx, "usageLog", id.parse(body.undoId), ownerId);
        if (log.itemId !== item.id) throw new Error("使用日志不匹配");
        await tx.usageLog.delete({ where: { id: log.id } });
      } else {
        const day = date.parse(body.date ?? localDate());
        if (day < item.purchaseDate || day > (item.retiredDate || localDate()))
          throw new Error("使用日期需在持有期间");
        await tx.usageLog.create({
          data: {
            ownerId,
            itemId: item.id,
            count: z
              .number()
              .int()
              .min(1)
              .max(100000)
              .parse(body.count ?? 1),
            date: day,
          },
        });
      }
      return {};
    });
  if (body.action === "reviewCreate")
    return operation(ownerId, body.operationId, "reviewCreate", async (tx) => {
      const item = await owned(
        tx,
        "shoppingItem",
        id.parse(body.itemId),
        ownerId,
      );
      const data = z
        .object({
          title: text.min(1).max(200),
          description: text.default(""),
          targetCount: z.number().int().min(1).max(20),
          rule: z.enum(["all", "majority"]),
          visibility: z.enum(["private", "link", "public"]),
        })
        .parse(body.data);
      return tx.reviewRequest.create({
        data: {
          ...data,
          ownerId,
          itemId: item.id,
          publicInfo: JSON.stringify({
            name: item.name,
            budget: item.budget,
            reason: item.reason,
          }),
          token: randomBytes(24).toString("hex"),
        },
      });
    });
  if (body.action === "reviewUpdate")
    return operation(ownerId, body.operationId, "reviewUpdate", async (tx) => {
      const review = await owned(
        tx,
        "reviewRequest",
        id.parse(body.id),
        ownerId,
      );
      checkVersion(review, body.version);
      const data =
        body.mode === "reset"
          ? { token: randomBytes(24).toString("hex") }
          : { status: "revoked", token: randomBytes(24).toString("hex") };
      return tx.reviewRequest.update({
        where: { id: review.id },
        data: { ...data, version: { increment: 1 } },
      });
    });
  throw new Error("未知操作");
}

export async function vote(user: User, token: string, body: any) {
  const data = z.object({ approve: z.boolean(), comment: text }).parse(body);
  return operation(user.id, body.operationId, "vote", async (tx) => {
    // SQLite serializes writes. Acquire a write before reading capacity so concurrent last votes cannot overfill.
    const lock = await tx.reviewRequest.updateMany({
      where: { token, status: "open", visibility: { not: "private" } },
      data: { version: { increment: 1 } },
    });
    if (!lock.count) throw new Error("评议已结束或不可访问");
    const review = await tx.reviewRequest.findUniqueOrThrow({
      where: { token },
    });
    if (review.ownerId === user.id) throw new Error("发起者不能参与自己的评议");
    const votes = await tx.reviewVote.findMany({
      where: { reviewId: review.id },
    });
    const previous = votes.find((x) => x.userId === user.id);
    if (!previous && votes.length >= review.targetCount)
      throw new Error("评议人数已满");
    await tx.reviewVote.upsert({
      where: { reviewId_userId: { reviewId: review.id, userId: user.id } },
      create: {
        ...data,
        reviewId: review.id,
        userId: user.id,
        username: user.username,
      },
      update: data,
    });
    const allVotes = await tx.reviewVote.findMany({
      where: { reviewId: review.id },
    });
    const status = reviewResult(allVotes, review.targetCount, review.rule);
    await tx.reviewRequest.update({
      where: { id: review.id },
      data: { status },
    });
    return { status };
  });
}

export async function snapshot(user: User) {
  const ownerId = user.id,
    where = { ownerId };
  const [
    accounts,
    categories,
    ledger,
    lists,
    shopping,
    items,
    usage,
    savings,
    drafts,
    attachments,
    reviews,
    rules,
  ] = await Promise.all([
    db.account.findMany({ where }),
    db.category.findMany({ where }),
    db.ledgerEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.shoppingList.findMany({ where, orderBy: { sort: "asc" } }),
    db.shoppingItem.findMany({ where, orderBy: { createdAt: "desc" } }),
    db.ownedItem.findMany({ where }),
    db.usageLog.findMany({ where, orderBy: { createdAt: "desc" } }),
    db.savingEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.captureDraft.findMany({ where, orderBy: { capturedAt: "desc" } }),
    db.attachment.findMany({
      where,
      select: { id: true, draftId: true, name: true, size: true },
    }),
    db.reviewRequest.findMany({ where, orderBy: { createdAt: "desc" } }),
    db.categoryRule.findMany({ where }),
  ]);
  const votes = await db.reviewVote.findMany({
    where: { reviewId: { in: reviews.map((x) => x.id) } },
  });
  return {
    user: {
      id: user.id,
      username: user.username,
      timezone: user.timezone,
      preferences: JSON.parse(user.preferences),
      autoBatch: user.autoBatch,
      batchSize: user.batchSize,
    },
    accounts,
    categories,
    ledger,
    lists,
    shopping,
    items,
    usage,
    savings,
    drafts,
    attachments,
    reviews,
    votes,
    rules,
    ai: {
      configured: !!process.env.AI_API_KEY,
      textModel: process.env.AI_TEXT_MODEL || "agnes-3.0-flash",
      visionModel: process.env.AI_VISION_MODEL || "agnes-3.0-flash",
    },
  };
}
