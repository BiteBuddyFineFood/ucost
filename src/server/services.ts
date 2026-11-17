import type { User } from "./schema";
import type { Store } from "./store";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, writeBatch } from "./db";
import {
  attachShoppingSource,
  invalidateList,
  groupAction,
  settlementPreview,
  checkoutPreview,
} from "./groups";
import { aiUsage } from "./ai-gateway";
import { redeemInvite } from "./invites";
import {
  localDate,
  validDate,
  reviewResult,
  savingSplit,
  defaultWidgets,
  categoryIcons,
  categoryColors,
} from "@/lib/domain";
import { relativeReminderDue } from "@/lib/reminder-time";
import {
  validateNavigation,
} from "@/lib/navigation";

type Tx = Store;
const text = z.string().max(10000);
const date = z.string().refine(validDate, "日期格式无效");
const amount = z.number().int().min(0).max(2_000_000_000);
const id = z.string().min(1).max(200);
const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  date.nullish(),
);
const optionalId = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  id.nullish(),
);
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
  groupId: id.nullish(),
});
const listSchema = z.object({
  name: text.min(1).max(100),
  kind: z.enum(["shopping", "travel", "normal"]).default("shopping"),
  departureDate: optionalDate,
  description: text.default(""),
  archived: z.boolean().default(false),
  sort: z.number().int().default(0),
  budget: amount.nullish(),
});
const shoppingSchema = z.object({
  listId: id,
  name: text.min(1).max(200),
  quantity: text.max(100).default(""),
  budget: amount.nullish(),
  categoryId: id.nullish(),
  reason: text.default(""),
  requirements: text.default(""),
  concerns: text.default(""),
  alternatives: text.default(""),
  timing: text.default(""),
  note: text.default(""),
  originalText: text.default(""),
  done: z.boolean().default(false),
  groupName: text.max(100).default(""),
  status: z
    .enum(["considering", "planned", "purchased", "skipped"])
    .default("considering"),
});
const itemSchema = z.object({
  name: text.min(1).max(200),
  purchaseDate: optionalDate,
  retiredDate: optionalDate,
  price: amount.nullish(),
  recovery: amount.default(0),
  ledgerId: optionalId,
  note: text.default(""),
  mode: z.enum(["day", "use"]).default("day"),
  quantity: z.number().int().min(0).max(1_000_000).default(1),
  unit: text.max(30).default("件"),
  storageEnabled: z.boolean().default(false),
  expiryEnabled: z.boolean().default(false),
  costEnabled: z.boolean().default(true),
  location: text.max(200).default(""),
  boxId: optionalId,
  expiresOn: optionalDate,
  status: z
    .enum(["active", "used", "discarded", "archived"])
    .default("active"),
  sourceNote: text.max(300).default(""),
});
const listItemSchema = z.object({
  listId: id,
  name: text.min(1).max(200),
  quantity: text.max(100).default(""),
  note: text.default(""),
  groupName: text.max(100).default(""),
  done: z.boolean().default(false),
});
const boxSchema = z.object({
  name: text.min(1).max(100),
  location: text.max(200).default(""),
  note: text.default(""),
  color: z
    .enum(["", "#6F7F63", "#B7794B", "#C4A24A", "#8C6A8E", "#5B7C99"])
    .default(""),
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
  iconKey: z
    .enum(Object.keys(categoryIcons) as [string, ...string[]])
    .default("tag"),
  color: z
    .enum(Object.keys(categoryColors) as [string, ...string[]])
    .nullable()
    .default("")
    .transform((value) => value ?? ""),
  archived: z.boolean().default(false),
});
const purchaseEditSchema = z.object({
  amount: amount,
  date,
  categoryId: id.nullish(),
  accountId: id.nullish(),
  discount: amount.nullish(),
  discountDetails: text.optional(),
  syncLedgerCategory: z.boolean().default(true),
});
const purchaseRelinkSchema = z.object({
  amount: amount.positive(),
  date,
  categoryId: id.nullish(),
  accountId: id.nullish(),
  discount: amount.default(0),
  discountDetails: text.default(""),
  planned: amount.nullish(),
  createItem: z.boolean().default(false),
  createSaving: z.boolean().default(true),
});
const models: Record<string, string> = {
  ledger: "ledgerEntry",
  lists: "shoppingList",
  shopping: "shoppingItem",
  items: "ownedItem",
  boxes: "storageBox",
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
  const record = await tx[model].first({
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
  return writeBatch(
    async (tx) => {
      const exists = await tx.appliedOperation.first({
        where: { id: opId },
      });
      if (exists) {
        if (exists.ownerId !== ownerId || exists.kind !== kind)
          throw new Error("操作标识冲突");
        return JSON.parse(exists.result);
      }
      const result = await action(tx);
      await tx.appliedOperation.insert({
        data: { id: opId, ownerId, kind, result: JSON.stringify(result ?? {}) },
      });
      return result;
    },
    { maxWait: 10000, timeout: 15000 },
  );
}

async function defaultExpenseAccount(tx: Tx, ownerId: string) {
  const user = await tx.user.first({
    where: { id: ownerId },
    select: { defaultExpenseAccountId: true },
  });
  if (!user?.defaultExpenseAccountId) return null;
  const account = await tx.account.first({
    where: {
      id: user.defaultExpenseAccountId,
      ownerId,
      archived: false,
    },
  });
  return account?.id ?? null;
}

async function expenseAccount(
  tx: Tx,
  ownerId: string,
  value: unknown,
  omittedUsesDefault: boolean,
) {
  if (value === undefined && omittedUsesDefault)
    return defaultExpenseAccount(tx, ownerId);
  if (value == null || value === "") return null;
  const accountId = id.parse(value);
  const account = await owned(tx, "account", accountId, ownerId);
  if (account.archived) throw new Error("账户已归档，请选择可用账户");
  return account.id;
}

async function expenseCategory(
  tx: Tx,
  ownerId: string,
  value: unknown,
  existingCategoryId?: string | null,
) {
  if (value == null || value === "") return null;
  const categoryId = id.parse(value);
  const category = await owned(tx, "category", categoryId, ownerId);
  if (category.type !== "expense") throw new Error("购物只能使用支出分类");
  if (category.archived && category.id !== existingCategoryId)
    throw new Error("分类已归档，请选择可用分类");
  return category.id;
}

async function upsertShoppingSaving(
  tx: Tx,
  ownerId: string,
  item: any,
  values: {
    type: "skipped" | "downgrade";
    date: string;
    planned: number;
    actual: number;
    amount: number;
  },
) {
  if (values.amount <= 0) return;
  const sourceKey = `shopping:${item.id}:${values.type === "skipped" ? "skip" : "downgrade"}`;
  const previous = await tx.savingEntry.first({ where: { sourceKey } });
  if (previous && previous.ownerId !== ownerId) throw new Error("省钱来源冲突");
  const data = {
    title: item.name,
    type: values.type,
    source: "shopping",
    date: values.date,
    planned: values.planned,
    actual: values.actual,
    amount: values.amount,
    shoppingItemId: item.id,
    status: "valid",
    suppressed: previous?.suppressed ?? false,
  };
  if (previous)
    await tx.savingEntry.change({
      where: { id: previous.id },
      data: { ...data, version: { increment: 1 } },
    });
  else
    await tx.savingEntry.insert({
      data: { ...data, ownerId, sourceKey },
    });
}

async function syncShoppingSaving(
  tx: Tx,
  ownerId: string,
  item: any,
  paid: number,
  discount: number,
  onDate: string,
) {
  const savings = await tx.savingEntry.list({
    where: { ownerId, shoppingItemId: item.id, source: "shopping" },
  });
  const refunds = item.ledgerId
    ? await tx.ledgerEntry.sum({
        where: { ownerId, refundOfId: item.ledgerId },
        _sum: { amount: true },
      })
    : null;
  const refunded = refunds?._sum.amount ?? 0;
  for (const saving of savings) {
    if (saving.type !== "downgrade") continue;
    const planned = saving.planned ?? item.budget;
    if (!planned) continue;
    const amount = planned - paid - discount;
    if (amount <= 0) {
      await tx.savingEntry.remove({ where: { id: saving.id } });
      continue;
    }
    await tx.savingEntry.change({
      where: { id: saving.id },
      data: {
        planned,
        actual: paid + discount,
        amount,
        date: onDate,
        status:
          !item.ledgerId || refunded >= paid
            ? "revoked"
            : refunded > 0
              ? "pending"
              : "valid",
        version: { increment: 1 },
      },
    });
  }
}

async function linkOwnedItem(
  tx: Tx,
  ownerId: string,
  item: any,
  entry: any,
  createItem: boolean,
) {
  if (item.ownedItemId) {
    const asset = await owned(tx, "ownedItem", item.ownedItemId, ownerId);
    return tx.ownedItem.change({
      where: { id: asset.id },
      data: {
        ledgerId: entry.id,
        price: entry.amount,
        version: { increment: 1 },
      },
    });
  }
  if (!createItem) return null;
  return saveEntity(tx, ownerId, "items", {
    name: item.name,
    purchaseDate: entry.date,
    price: entry.amount,
    ledgerId: entry.id,
    note: item.note,
  });
}

async function syncDiscount(tx: Tx, ownerId: string, entry: any) {
  const sourceKey = `discount:${entry.orderKey || entry.id}`;
  const previous = await tx.savingEntry.first({ where: { sourceKey } });
  if (previous && previous.ownerId !== ownerId) throw new Error("优惠来源冲突");
  // One order-level discount must not be counted for every split line.
  if (previous && previous.ledgerId !== entry.id) {
    if (entry.discount > 0)
      throw new Error("这个订单已记录优惠，请勿在拆分账目重复填写");
    return;
  }
  const refunds = await tx.ledgerEntry.sum({
    where: { ownerId, refundOfId: entry.id },
    _sum: { amount: true },
  });
  const refunded = refunds._sum.amount || 0;
  const shopping = entry.sourceShoppingItemId
    ? await tx.shoppingItem.first({
        where: { ownerId, id: entry.sourceShoppingItemId },
      })
    : null;
  if (shopping)
    await tx.savingEntry.changeAll({
      where: {
        ownerId,
        shoppingItemId: shopping.id,
        source: "shopping",
        type: "downgrade",
        suppressed: false,
      },
      data: {
        status:
          refunded >= entry.amount
            ? "revoked"
            : refunded > 0
              ? "pending"
              : "valid",
        version: { increment: 1 },
      },
    });
  const list = shopping
    ? await tx.shoppingList.first({
        where: { ownerId, id: shopping.listId },
      })
    : null;
  const settlement =
    list?.savingMode === "budget"
      ? await tx.listSettlement.first({
          where: { ownerId, listId: list.id },
        })
      : null;
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
    ...(shopping
      ? {
          shoppingItemId: shopping.id,
          sourceListId: shopping.listId,
          supersededBySettlementId: settlement?.id ?? null,
        }
      : {}),
  };
  if (previous)
    await tx.savingEntry.change({
      where: { id: previous.id },
      data: { ...values, version: { increment: 1 } },
    });
  else if (entry.discount && entry.autoSaving)
    await tx.savingEntry.insert({
      data: { ...values, ownerId, sourceKey, groupId: entry.groupId },
    });
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
      !existing &&
      data.type === "expense" &&
      !Object.prototype.hasOwnProperty.call(raw, "accountId")
    ) {
      const fallback = await defaultExpenseAccount(tx, ownerId);
      if (fallback) data.accountId = fallback;
    }
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
      "groupId",
    ])
      data[key] ||= null;
    if (data.accountId) await owned(tx, "account", data.accountId, ownerId);
    if (data.toAccountId) await owned(tx, "account", data.toAccountId, ownerId);
    if (data.groupId) await owned(tx, "recordGroup", data.groupId, ownerId);
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
      const others = await tx.ledgerEntry.sum({
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
      if (!existing && !Object.prototype.hasOwnProperty.call(raw, "groupId"))
        data.groupId = original.groupId;
    } else data.refundOfId = null;
    if (data.categoryId) {
      const category = await owned(tx, "category", data.categoryId, ownerId);
      if (category.archived && category.id !== existing?.categoryId)
        throw new Error("分类已归档");
      if (category.type !== (data.type === "refund" ? "expense" : data.type))
        throw new Error("分类与收支类型不匹配");
    }
    if (existing?.type === "expense") {
      const refunds = await tx.ledgerEntry.list({
        where: { ownerId, refundOfId: existing.id },
      });
      if (refunds.reduce((s, x) => s + x.amount, 0) > data.amount)
        throw new Error("支出金额不能小于已退款合计");
      if (refunds.some((x) => x.date < data.date))
        throw new Error("支出日期不能晚于关联退款");
      if (data.categoryId !== existing.categoryId)
        await tx.ledgerEntry.changeAll({
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
  } else if (entity === "lists") {
    data = listSchema.parse(merged);
    if (data.kind !== "travel") data.departureDate = null;
    if (data.kind !== "shopping") data.budget = null;
    if (existing && existing.kind !== data.kind) {
      const count = await tx.shoppingItem.count({
        where: { ownerId, listId: existing.id },
      });
      if (count)
        throw new Error("清单已有内容，不能直接更改用途；请新建清单");
    }
  } else if (entity === "shopping") {
    const list = await owned(
      tx,
      "shoppingList",
      id.parse(merged.listId),
      ownerId,
    );
    if (list.archived) throw new Error("清单已归档，请选择可用清单");
    if (list.kind === "shopping") {
      data = shoppingSchema.parse(merged);
    } else {
      for (const key of [
        "budget",
        "categoryId",
        "reason",
        "requirements",
        "concerns",
        "alternatives",
        "timing",
      ]) {
        if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "")
          throw new Error("出行和普通清单不使用预算、分类或购买字段");
      }
      data = listItemSchema.parse(merged);
      data.status = existing?.status ?? "planned";
      data.budget = null;
      data.categoryId = null;
      data.reason = "";
      data.requirements = "";
      data.concerns = "";
      data.alternatives = "";
      data.timing = "";
    }
    data.listId = list.id;
    if (list.closedAt && !existing)
      throw new Error("请先重新打开清单，再添加本轮采购物品");
    if (list.kind === "shopping")
      data.categoryId = await expenseCategory(
        tx,
        ownerId,
        data.categoryId,
        existing?.categoryId,
      );
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
    if (
      existing &&
      existing.listId !== data.listId &&
      ["purchased", "skipped"].includes(existing.status)
    )
      throw new Error("已完成购买决定不能迁移来源清单，请使用记录组调整展示");
    if (existing?.ledgerId && data.categoryId !== existing.categoryId) {
      const entry = await owned(tx, "ledgerEntry", existing.ledgerId, ownerId);
      if (entry.type !== "expense")
        throw new Error("关联记录不是支出，无法同步分类");
      await tx.ledgerEntry.change({
        where: { id: entry.id },
        data: { categoryId: data.categoryId, version: { increment: 1 } },
      });
      await tx.ledgerEntry.changeAll({
        where: { ownerId, refundOfId: entry.id },
        data: { categoryId: data.categoryId, version: { increment: 1 } },
      });
    }
  } else if (entity === "items") {
    data = itemSchema.parse(merged);
    if (data.quantity === 0 && data.status === "active") data.status = "used";
    if (data.quantity > 0 && data.status === "used")
      throw new Error("恢复数量时请同时选择“在用”状态");
    if (["used", "discarded"].includes(data.status)) data.quantity = 0;
    if (data.status !== "active" && data.quantity > 0 && data.status !== "archived")
      throw new Error("只有归档状态可以保留数量");
    if (data.storageEnabled) {
      if (data.boxId) {
        const box = await owned(tx, "storageBox", data.boxId, ownerId);
        data.boxId = box.id;
        data.location = "";
      } else if (!data.location.trim()) {
        throw new Error("开启收纳时请填写位置或选择箱子");
      }
    } else {
      data.boxId = existing?.boxId ?? null;
      data.location = existing?.location ?? "";
    }
    if (data.expiryEnabled && !data.expiresOn)
      throw new Error("开启保质期时请填写到期日");
    if (!data.expiryEnabled)
      data.expiresOn = existing?.expiresOn ?? null;
    if (!data.costEnabled && !existing) {
      data.purchaseDate = null;
      data.price = null;
      data.retiredDate = null;
      data.recovery = 0;
      data.ledgerId = null;
    }
    if (data.costEnabled) {
      if (!data.purchaseDate || data.price == null)
        throw new Error("计算成本需要购入日期和购入金额");
      if (
        data.purchaseDate > localDate() ||
        (data.retiredDate &&
          (data.retiredDate < data.purchaseDate ||
            data.retiredDate > localDate()))
      )
        throw new Error("购入/退役日期不合理");
    }
    if (data.ledgerId) {
      const entry = await owned(tx, "ledgerEntry", data.ledgerId, ownerId);
      if (entry.type !== "expense") throw new Error("物品只能关联支出");
      data.price = entry.amount;
      data.purchaseDate = entry.date;
    }
    if (!existing || data.quantity !== existing.quantity || raw.confirmQuantity)
      data.quantityConfirmedAt = new Date();
  } else if (entity === "boxes") {
    data = boxSchema.parse(merged);
  } else if (entity === "savings") {
    if (existing && ["automatic", "settlement"].includes(existing.source)) {
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
    ? await (tx as any)[model].change({
        where: { id: existing.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await (tx as any)[model].insert({
        data: {
          ...data,
          ownerId,
          ...(raw.sourceDraftId ? { sourceDraftId: raw.sourceDraftId } : {}),
        },
      });
  if (entity === "items" && !existing && raw.initialUseCount)
    await tx.usageLog.insert({
      data: {
        ownerId,
        itemId: record.id,
        count: z.number().int().min(1).max(1000000).parse(raw.initialUseCount),
        date: record.retiredDate || localDate(),
      },
    });
  if (entity === "accounts" && record.archived)
    await tx.user.changeAll({
      where: { id: ownerId, defaultExpenseAccountId: record.id },
      data: { defaultExpenseAccountId: null },
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
      const source =
        parent.sourceShoppingItemId &&
        (await tx.shoppingItem.first({
          where: { id: parent.sourceShoppingItemId, ownerId },
        }));
      if (source) await invalidateList(tx, ownerId, source.listId);
    }
    if (existing?.sourceShoppingItemId) {
      const item = await tx.shoppingItem.first({
        where: { id: existing.sourceShoppingItemId, ownerId },
      });
      if (item) {
        await tx.shoppingItem.change({
          where: { id: item.id },
          data: {
            purchaseAmount: record.amount,
            purchasedAt: record.date,
            purchaseAccountId: record.accountId,
            categoryId: record.categoryId,
            purchaseDiscount: record.discount,
            purchaseDiscountDetails: record.discountDetails,
            purchaseRevision: { increment: 1 },
            version: { increment: 1 },
          },
        });
        await tx.ownedItem.changeAll({
          where: { ownerId, ledgerId: record.id },
          data: {
            price: record.amount,
            purchaseDate: record.date,
            version: { increment: 1 },
          },
        });
        await syncShoppingSaving(
          tx,
          ownerId,
          item,
          record.amount,
          record.discount,
          record.date,
        );
        await invalidateList(tx, ownerId, item.listId);
      }
    }
  }
  if (
    entity === "ledger" &&
    record.type === "expense" &&
    Array.isArray(raw.items) &&
    raw.items.length
  ) {
    for (const row of raw.items) {
      if (!row || typeof row !== "object" || !String(row.name || "").trim())
        throw new Error("顺手登记物品需要填写名称");
      await saveEntity(tx, ownerId, "items", {
        name: row.name,
        quantity: row.quantity ?? 1,
        unit: row.unit || "件",
        note: row.note || "",
        storageEnabled: !!row.storageEnabled,
        expiryEnabled: !!row.expiryEnabled,
        expiresOn: row.expiresOn || null,
        location: row.location || "",
        costEnabled: !!row.costEnabled,
        price: row.price ?? null,
        purchaseDate: row.purchaseDate || record.date,
        sourceNote: `${record.date} · ${record.title}`,
      });
    }
  }
  if (entity === "lists" && existing) {
    await tx.recordGroup.changeAll({
      where: { ownerId, sourceListId: record.id },
      data: { name: record.name, version: { increment: 1 } },
    });
    if (record.budget !== existing.budget)
      await invalidateList(tx, ownerId, record.id);
  }
  if (entity === "shopping") await invalidateList(tx, ownerId, record.listId);
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
    const items = await tx.ownedItem.list({
      where: { ownerId, ledgerId: record.id },
    });
    for (const item of items)
      await tx.ownedItem.change({
        where: { id: item.id },
        data: {
          price: record.amount,
          ledgerId: null,
          version: { increment: 1 },
        },
      });
    await tx.savingEntry.changeAll({
      where: { ownerId, ledgerId: record.id, source: "automatic" },
      data: { status: "revoked", suppressed: true, version: { increment: 1 } },
    });
    const linkedShopping = await tx.shoppingItem.list({
      where: { ownerId, ledgerId: record.id },
    });
    for (const item of linkedShopping)
      await invalidateList(tx, ownerId, item.listId);
    await tx.savingEntry.changeAll({
      where: {
        ownerId,
        shoppingItemId: { in: linkedShopping.map((i) => i.id) },
        source: "shopping",
        type: "downgrade",
      },
      data: { status: "revoked", version: { increment: 1 } },
    });
    for (const item of linkedShopping)
      await tx.shoppingItem.change({
        where: { id: item.id },
        data: {
          ledgerId: null,
          categoryId: item.categoryId ?? record.categoryId,
          purchaseAmount: record.amount,
          purchasedAt: record.date,
          purchaseAccountId: record.accountId,
          purchaseDiscount: record.discount,
          purchaseDiscountDetails: record.discountDetails,
          purchaseRevision: { increment: 1 },
          purchaseNeedsReview:
            item.purchaseAmount == null ||
            item.purchasedAt == null ||
            item.purchaseNeedsReview,
          version: { increment: 1 },
        },
      });
  }
  if (
    entity === "savings" &&
    ["automatic", "shopping", "settlement"].includes(record.source)
  ) {
    await tx.savingEntry.change({
      where: { id: record.id },
      data: { status: "revoked", suppressed: true, version: { increment: 1 } },
    });
    return;
  }
  if (entity === "lists") {
    await invalidateList(tx, ownerId, record.id);
    await tx.recordGroup.changeAll({
      where: { ownerId, sourceListId: record.id },
      data: { sourceDeleted: true, version: { increment: 1 } },
    });
    const items = await tx.shoppingItem.list({
      where: { ownerId, listId: record.id },
    });
    for (const item of items) await deleteEntity(tx, ownerId, "shopping", item);
  }
  if (entity === "shopping") {
    await invalidateList(tx, ownerId, record.listId);
    for (const targetType of ["shopping", "listItem"]) {
      await tx.reminderOccurrence.removeAll({
        where: { ownerId, targetType, targetId: record.id },
      });
      await tx.reminderRule.removeAll({
        where: { ownerId, targetType, targetId: record.id },
      });
    }
    await tx.reviewRequest.changeAll({
      where: { ownerId, itemId: record.id },
      data: {
        status: "revoked",
        token: randomBytes(24).toString("hex"),
        version: { increment: 1 },
      },
    });
    await tx.savingEntry.changeAll({
      where: { ownerId, shoppingItemId: record.id },
      data: { shoppingItemId: null },
    });
  }
  if (entity === "items") {
    await tx.usageLog.removeAll({ where: { ownerId, itemId: record.id } });
    await tx.reminderOccurrence.removeAll({
      where: { ownerId, targetType: "item", targetId: record.id },
    });
    await tx.reminderRule.removeAll({
      where: { ownerId, targetType: "item", targetId: record.id },
    });
    await tx.shoppingItem.changeAll({
      where: { ownerId, ownedItemId: record.id },
      data: { ownedItemId: null },
    });
  }
  if (entity === "boxes") {
    const count = await tx.ownedItem.count({
      where: { ownerId, boxId: record.id },
    });
    if (count) throw new Error("箱子还有物品，请先移出或转移后再删除");
  }
  if (entity === "drafts") {
    if (record.state === "processing")
      throw new Error("整理中的草稿请稍后删除");
    // Attachment metadata/files remain private until explicit maintenance cleanup; no business data is removed.
  }
  await (tx as any)[models[entity]].remove({ where: { id: record.id } });
  if (entity === "ledger" && record.refundOfId) {
    const parent = await owned(tx, "ledgerEntry", record.refundOfId, ownerId);
    await syncDiscount(tx, ownerId, parent);
    const source =
      parent.sourceShoppingItemId &&
      (await tx.shoppingItem.first({
        where: { id: parent.sourceShoppingItemId, ownerId },
      }));
    if (source) await invalidateList(tx, ownerId, source.listId);
  }
}

export async function convertShopping(tx: Tx, ownerId: string, body: any) {
  const item = await owned(tx, "shoppingItem", id.parse(body.id), ownerId);
  checkVersion(item, body.version);
  if (["purchased", "skipped"].includes(item.status)) {
    if (item.status === "purchased" && !item.ledgerId)
      throw new Error("这件物品已购未记账，请使用补记账");
    return item;
  }
  const list = await owned(tx, "shoppingList", item.listId, ownerId);
  if (list.kind !== "shopping")
    throw new Error("只有购物清单可以执行购买或放弃");
  if (list.archived) throw new Error("目标清单已归档，请先恢复清单");
  if (list.closedAt) throw new Error("请先重新打开清单");
  z.enum(["buy", "skip"]).parse(body.mode);
  const onDate = date.parse(body.date);
  const skip = body.mode === "skip";
  if (!skip && (body.paid === undefined || body.paid === null || body.paid === ""))
    throw new Error("请填写本次全部数量的实际付款；零元获得请填 0");
  const paid = skip ? 0 : amount.parse(body.paid);
  const discount = skip ? 0 : amount.parse(body.discount ?? 0);
  if (paid === 0 && discount > 0) throw new Error("零元购买不能产生优惠支出");
  const categoryId = await expenseCategory(
    tx,
    ownerId,
    body.categoryId === undefined ? item.categoryId : body.categoryId,
    item.categoryId,
  );
  const accountId = skip
    ? null
    : await expenseAccount(tx, ownerId, body.accountId, true);
  let entry: any;
  if (!skip && body.createLedger && paid > 0)
    entry = await saveEntity(tx, ownerId, "ledger", {
      type: "expense",
      title: item.name,
      amount: paid,
      date: onDate,
      categoryId,
      discount,
      discountDetails: body.discountDetails || "",
      grossAmount: paid + discount,
      autoSaving: true,
      note: item.note,
      accountId,
    });
  let asset: any;
  if (!skip && item.ownedItemId) {
    if (body.registerStorage && !String(body.location || "").trim())
      throw new Error("登记收纳需要填写位置");
    if (body.registerExpiry && !body.expiresOn)
      throw new Error("登记保质期需要填写到期日");
    await tx.ownedItem.changeAll({
      where: { ownerId, id: item.ownedItemId },
      data: {
        ...(body.createItem
          ? {
              price: paid,
              purchaseDate: onDate,
              ledgerId: entry?.id ?? null,
              costEnabled: true,
            }
          : {}),
        ...(body.registerStorage
          ? { storageEnabled: true, location: body.location || "" }
          : {}),
        ...(body.registerExpiry
          ? {
              expiryEnabled: true,
              expiresOn: body.expiresOn || null,
            }
          : {}),
        ...(body.registerStorage || body.registerExpiry
          ? {
              quantity: z
                .number()
                .int()
                .min(0)
                .max(1_000_000)
                .parse(body.registerQuantity ?? 1),
              unit: text.max(30).parse(body.registerUnit || "件"),
            }
          : {}),
        ...(body.registerStorage || body.registerExpiry
          ? { quantityConfirmedAt: new Date() }
          : {}),
        version: { increment: 1 },
      },
    });
  }
  if (
    !skip &&
    (body.createItem || body.registerStorage || body.registerExpiry) &&
    !item.ownedItemId
  )
    asset = await saveEntity(tx, ownerId, "items", {
      name: item.name,
      quantity: z
        .number()
        .int()
        .min(0)
        .max(1_000_000)
        .parse(body.registerQuantity ?? 1),
      unit: text.max(30).parse(body.registerUnit || "件"),
      purchaseDate: body.createItem ? onDate : null,
      price: body.createItem ? paid : null,
      ledgerId: body.createItem ? entry?.id : null,
      note: item.note,
      storageEnabled: !!body.registerStorage,
      location: body.location || "",
      expiryEnabled: !!body.registerExpiry,
      expiresOn: body.expiresOn || null,
      costEnabled: !!body.createItem,
      sourceNote: `${onDate} · ${list.name}`,
    });
  if (!skip && !body.createLedger && discount > 0)
    throw new Error("记录优惠需要同时生成关联账单，或将优惠设为零");
  if (body.createSaving) {
    const planned = amount.positive().parse(body.planned ?? item.budget);
    const split = skip
      ? { downgrade: planned }
      : savingSplit(planned, paid, discount);
    await upsertShoppingSaving(tx, ownerId, item, {
      type: skip ? "skipped" : "downgrade",
      date: onDate,
      planned,
      actual: skip ? 0 : paid + discount,
      amount: split.downgrade,
    });
  }
  await attachShoppingSource(tx, ownerId, item, entry?.id);
  return tx.shoppingItem.change({
    where: { id: item.id },
    data: {
      status: skip ? "skipped" : "purchased",
      ledgerId: entry?.id,
      ownedItemId: asset?.id ?? item.ownedItemId,
      categoryId,
      purchaseAmount: skip ? null : paid,
      purchasedAt: skip ? null : onDate,
      purchaseAccountId: skip ? null : accountId,
      purchaseDiscount: skip ? null : discount,
      purchaseDiscountDetails: skip ? "" : body.discountDetails || "",
      purchaseRevision: { increment: 1 },
      purchaseNeedsReview: false,
      version: { increment: 1 },
    },
  });
}

export async function purchaseEdit(tx: Tx, ownerId: string, body: any) {
  const item = await owned(tx, "shoppingItem", id.parse(body.id), ownerId);
  checkVersion(item, body.version);
  if (item.status !== "purchased")
    throw new Error("只有已购买的物品可以修改购买信息");
  const parsed = purchaseEditSchema.parse(body);
  const entry = item.ledgerId
    ? await owned(tx, "ledgerEntry", item.ledgerId, ownerId)
    : null;
  if (entry && entry.type !== "expense")
    throw new Error("关联记录不是支出，无法修改购买信息");
  if (entry && parsed.amount <= 0)
    throw new Error("有账单的购买金额必须大于 0");
  const categoryId = await expenseCategory(
    tx,
    ownerId,
    parsed.categoryId === undefined ? item.categoryId : parsed.categoryId,
    item.categoryId,
  );
  const accountId =
    parsed.accountId === undefined
      ? (item.purchaseAccountId ?? null)
      : await expenseAccount(tx, ownerId, parsed.accountId, false);
  const discountValue =
    parsed.discount ?? item.purchaseDiscount ?? entry?.discount ?? 0;
  const discountDetails =
    parsed.discountDetails ??
    item.purchaseDiscountDetails ??
    entry?.discountDetails ??
    "";
  if (entry) {
    const refunds = await tx.ledgerEntry.list({
      where: { ownerId, refundOfId: entry.id },
    });
    if (refunds.reduce((sum, row) => sum + row.amount, 0) > parsed.amount)
      throw new Error("购买金额不能小于已退款合计");
    if (refunds.some((row) => row.date < parsed.date))
      throw new Error("购买日期不能晚于关联退款");
    const nextCategoryId = parsed.syncLedgerCategory
      ? categoryId
      : entry.categoryId;
    const updatedEntry = await tx.ledgerEntry.change({
      where: { id: entry.id },
      data: {
        amount: parsed.amount,
        date: parsed.date,
        accountId,
        categoryId: nextCategoryId,
        discount: discountValue,
        grossAmount: parsed.amount + discountValue,
        discountDetails,
        version: { increment: 1 },
      },
    });
    if (nextCategoryId !== entry.categoryId)
      await tx.ledgerEntry.changeAll({
        where: { ownerId, refundOfId: entry.id },
        data: { categoryId: nextCategoryId, version: { increment: 1 } },
      });
    if (item.ownedItemId)
      await tx.ownedItem.changeAll({
        where: { ownerId, id: item.ownedItemId },
        data: {
          price: parsed.amount,
          purchaseDate: parsed.date,
          ledgerId: entry.id,
          version: { increment: 1 },
        },
      });
    await syncDiscount(tx, ownerId, updatedEntry);
  }
  const updated = await tx.shoppingItem.change({
    where: { id: item.id },
    data: {
      categoryId,
      purchaseAmount: parsed.amount,
      purchasedAt: parsed.date,
      purchaseAccountId: accountId,
      purchaseDiscount: discountValue,
      purchaseDiscountDetails: discountDetails,
      purchaseRevision: { increment: 1 },
      purchaseNeedsReview: false,
      version: { increment: 1 },
    },
  });
  if (item.status === "purchased")
    await syncShoppingSaving(
      tx,
      ownerId,
      item,
      parsed.amount,
      discountValue,
      parsed.date,
    );
  await invalidateList(tx, ownerId, item.listId);
  return updated;
}

export async function purchaseRelink(tx: Tx, ownerId: string, body: any) {
  const item = await owned(tx, "shoppingItem", id.parse(body.id), ownerId);
  checkVersion(item, body.version);
  if (item.status !== "purchased")
    throw new Error("只有已购未记账的物品可以补记账");
  if (item.ledgerId) throw new Error("这件物品已有有效账单");
  const parsed = purchaseRelinkSchema.parse(body);
  const categoryId = await expenseCategory(
    tx,
    ownerId,
    parsed.categoryId === undefined ? item.categoryId : parsed.categoryId,
    item.categoryId,
  );
  const accountId = await expenseAccount(tx, ownerId, parsed.accountId, true);
  const entry = await saveEntity(tx, ownerId, "ledger", {
    type: "expense",
    title: item.name,
    amount: parsed.amount,
    date: parsed.date,
    categoryId,
    accountId,
    discount: parsed.discount,
    discountDetails: parsed.discountDetails,
    grossAmount: parsed.amount + parsed.discount,
    autoSaving: true,
    note: item.note,
  });
  const asset = await linkOwnedItem(
    tx,
    ownerId,
    item,
    entry,
    parsed.createItem,
  );
  const planned = parsed.planned ?? item.budget;
  if (parsed.createSaving && planned != null) {
    const split = savingSplit(planned, parsed.amount, parsed.discount);
    await upsertShoppingSaving(tx, ownerId, item, {
      type: "downgrade",
      date: parsed.date,
      planned,
      actual: parsed.amount + parsed.discount,
      amount: split.downgrade,
    });
  }
  const updated = await tx.shoppingItem.change({
    where: { id: item.id },
    data: {
      ledgerId: entry.id,
      ownedItemId: asset?.id ?? item.ownedItemId,
      categoryId,
      purchaseAmount: parsed.amount,
      purchasedAt: parsed.date,
      purchaseAccountId: accountId,
      purchaseDiscount: parsed.discount,
      purchaseDiscountDetails: parsed.discountDetails,
      purchaseRevision: { increment: 1 },
      purchaseNeedsReview: false,
      version: { increment: 1 },
    },
  });
  await attachShoppingSource(tx, ownerId, item, entry.id);
  return { item: updated, entry, asset };
}

export async function purchaseUndo(tx: Tx, ownerId: string, body: any) {
  const item = await owned(tx, "shoppingItem", id.parse(body.id), ownerId);
  checkVersion(item, body.version);
  await invalidateList(tx, ownerId, item.listId);
  if (item.status !== "purchased")
    throw new Error("只有已购买的物品可以撤销购买");
  const keepItem = z.boolean().default(true).parse(body.keepItem);
  if (!keepItem && item.ownedItemId) {
    const usage = await tx.usageLog.sum({
      where: { ownerId, itemId: item.ownedItemId },
      _sum: { count: true },
    });
    if ((usage._sum.count || 0) > 0)
      throw new Error("这件物品已有使用记录，不能删除物品档案");
  }
  if (item.ledgerId) {
    const entry = await owned(tx, "ledgerEntry", item.ledgerId, ownerId);
    await deleteEntity(tx, ownerId, "ledger", entry);
  }
  await tx.savingEntry.removeAll({
    where: { ownerId, shoppingItemId: item.id, source: "shopping" },
  });
  if (!keepItem && item.ownedItemId)
    await deleteEntity(
      tx,
      ownerId,
      "items",
      await owned(tx, "ownedItem", item.ownedItemId, ownerId),
    );
  return tx.shoppingItem.change({
    where: { id: item.id },
    data: {
      status: "planned",
      ledgerId: null,
      ownedItemId: keepItem ? item.ownedItemId : null,
      purchaseAmount: null,
      purchasedAt: null,
      purchaseAccountId: null,
      purchaseDiscount: null,
      purchaseDiscountDetails: "",
      purchaseRevision: { increment: 1 },
      purchaseNeedsReview: false,
      version: { increment: 1 },
    },
  });
}

export async function purchaseRestore(tx: Tx, ownerId: string, body: any) {
  const item = await owned(tx, "shoppingItem", id.parse(body.id), ownerId);
  checkVersion(item, body.version);
  await invalidateList(tx, ownerId, item.listId);
  if (item.status !== "skipped")
    throw new Error("只有已放弃的物品可以恢复待购");
  await tx.savingEntry.removeAll({
    where: { ownerId, shoppingItemId: item.id, source: "shopping" },
  });
  return tx.shoppingItem.change({
    where: { id: item.id },
    data: {
      status: "planned",
      purchaseAmount: null,
      purchasedAt: null,
      purchaseAccountId: null,
      purchaseDiscount: null,
      purchaseDiscountDetails: "",
      purchaseRevision: { increment: 1 },
      purchaseNeedsReview: false,
      version: { increment: 1 },
    },
  });
}

const reminderTargetTypeSchema = z.enum(["shopping", "listItem", "item"]);

async function reminderTarget(
  tx: Tx,
  ownerId: string,
  targetType: string,
  targetId: string,
) {
  if (targetType === "item") {
    const item = await owned(tx, "ownedItem", targetId, ownerId);
    return {
      title: item.name,
      detail: item.location || "",
      anchorDate: item.expiresOn,
      active:
        item.expiryEnabled &&
        item.status === "active" &&
        item.quantity > 0 &&
        !!item.expiresOn,
      version: item.version,
    };
  }
  const item = await owned(tx, "shoppingItem", targetId, ownerId);
  const list = await owned(tx, "shoppingList", item.listId, ownerId);
  const isShopping = targetType === "shopping";
  return {
    title: `${list.name} · ${item.name}`,
    detail: item.quantity || "",
    anchorDate:
      !isShopping && list.kind === "travel" ? list.departureDate : null,
    active: isShopping
      ? list.kind === "shopping" &&
        !list.archived &&
        ["considering", "planned"].includes(item.status)
      : list.kind !== "shopping" && !list.archived && !item.done,
    version: item.version,
  };
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error("提醒时区无效");
  }
}

function reminderDue(
  rule: any,
  target: Awaited<ReturnType<typeof reminderTarget>>,
) {
  if (rule.triggerType === "relative") {
    if (!target.anchorDate || rule.offsetDays == null) return null;
    return relativeReminderDue(
      target.anchorDate,
      rule.offsetDays,
      rule.localTime,
      rule.timezone,
    );
  }
  return rule.fixedAt ? new Date(rule.fixedAt) : null;
}

async function cancelPendingReminders(
  tx: Tx,
  ownerId: string,
  where: Record<string, any>,
) {
  await tx.reminderOccurrence.changeAll({
    where: { ownerId, state: "pending", ...where },
    data: { state: "cancelled" },
  });
}

export async function reminderSave(
  tx: Tx,
  ownerId: string,
  body: any,
  defaultTimezone: string,
) {
  const parsed = z
    .object({
      targetType: reminderTargetTypeSchema,
      targetId: id,
      triggerType: z.enum(["fixed", "relative"]),
      fixedAt: z.string().nullish(),
      offsetDays: z.number().int().min(0).max(3650).nullish(),
      localTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "提醒时间格式无效")
        .default("09:00"),
      timezone: z.string().max(80).default(defaultTimezone),
      enabled: z.boolean().default(true),
    })
    .parse(body.rule ?? body);
  const target = await reminderTarget(
    tx,
    ownerId,
    parsed.targetType,
    parsed.targetId,
  );
  if (!target.active)
    throw new Error("目标已失效或已关闭用途，无法设置提醒");
  const timezone = validTimezone(parsed.timezone);
  let fixedAt: Date | null = null;
  let offsetDays: number | null = null;
  if (parsed.triggerType === "relative") {
    if (!target.anchorDate)
      throw new Error("这个目标没有可用于相对提醒的日期");
    if (parsed.offsetDays == null)
      throw new Error("请填写提前天数");
    offsetDays = parsed.offsetDays;
  } else {
    fixedAt = parsed.fixedAt ? new Date(parsed.fixedAt) : null;
    if (!fixedAt || Number.isNaN(fixedAt.getTime()))
      throw new Error("请选择提醒日期和时间");
  }
  const existing = body.id
    ? await owned(tx, "reminderRule", id.parse(body.id), ownerId)
    : null;
  if (existing) checkVersion(existing, body.version);
  const data = {
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    triggerType: parsed.triggerType,
    fixedAt,
    offsetDays,
    localTime: parsed.localTime,
    timezone,
    enabled: parsed.enabled,
  };
  const rule = existing
    ? await tx.reminderRule.change({
        where: { id: existing.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await tx.reminderRule.insert({ data: { ...data, ownerId } });
  await cancelPendingReminders(tx, ownerId, { ruleId: rule.id });
  return rule;
}

export async function reminderDelete(tx: Tx, ownerId: string, body: any) {
  const rule = await owned(tx, "reminderRule", id.parse(body.id), ownerId);
  checkVersion(rule, body.version);
  await cancelPendingReminders(tx, ownerId, { ruleId: rule.id });
  await tx.reminderRule.remove({ where: { id: rule.id } });
  return { ok: true };
}

export async function reminderHandle(tx: Tx, ownerId: string, body: any) {
  const occurrence = await owned(
    tx,
    "reminderOccurrence",
    id.parse(body.id),
    ownerId,
  );
  const rule = await owned(
    tx,
    "reminderRule",
    occurrence.ruleId,
    ownerId,
  );
  const mode = z.enum(["done", "snooze", "close"]).parse(body.mode);
  if (occurrence.state !== "pending")
    throw new Error("这次提醒已处理或已失效");
  if (mode === "done") {
    await tx.reminderOccurrence.change({
      where: { id: occurrence.id },
      data: { state: "done", handledAt: new Date() },
    });
  } else if (mode === "snooze") {
    const until = new Date(body.until);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now())
      throw new Error("稍后提醒时间需要晚于现在");
    await tx.reminderOccurrence.change({
      where: { id: occurrence.id },
      data: {
        state: "pending",
        dueAt: until,
        snoozedUntil: until,
      },
    });
  } else {
    await tx.reminderRule.change({
      where: { id: rule.id },
      data: { enabled: false, version: { increment: 1 } },
    });
    await cancelPendingReminders(tx, ownerId, { ruleId: rule.id });
  }
  return { ok: true };
}

export async function reminderCheck(tx: Tx, ownerId: string) {
  const now = new Date();
  const rules = await tx.reminderRule.list({ where: { ownerId } });
  let occurrences = await tx.reminderOccurrence.list({ where: { ownerId } });
  const decoratedRules: any[] = [];
  for (const rule of rules) {
    let target: Awaited<ReturnType<typeof reminderTarget>> | null = null;
    try {
      target = await reminderTarget(
        tx,
        ownerId,
        rule.targetType,
        rule.targetId,
      );
    } catch {
      target = null;
    }
    const anchorDate =
      rule.triggerType === "relative"
        ? target?.anchorDate ?? null
        : rule.fixedAt
          ? localDate(new Date(rule.fixedAt), rule.timezone)
          : null;
    const due = target ? reminderDue(rule, target) : null;
    const dedupeKey = `${rule.id}:${rule.version}:${anchorDate}`;
    for (const occurrence of occurrences.filter(
      (o) =>
        o.ruleId === rule.id &&
        o.state === "pending" &&
        (o.anchorDate !== anchorDate || o.dedupeKey !== dedupeKey),
    ))
      await tx.reminderOccurrence.change({
        where: { id: occurrence.id },
        data: { state: "cancelled" },
      });
    if (!rule.enabled || !target?.active || !due) {
      await cancelPendingReminders(tx, ownerId, { ruleId: rule.id });
      decoratedRules.push({
        ...rule,
        targetTitle: target?.title || "目标已失效",
        targetDetail: target?.detail || "",
        targetDate: anchorDate,
        targetActive: !!target?.active,
        nextDueAt: null,
      });
      continue;
    }
    if (!occurrences.some((o) => o.dedupeKey === dedupeKey)) {
      const created = await tx.reminderOccurrence.insert({
        data: {
          id: randomUUID(),
          ownerId,
          ruleId: rule.id,
          targetType: rule.targetType,
          targetId: rule.targetId,
          dedupeKey,
          dueAt: due,
          anchorDate,
        },
      });
      occurrences.push(created);
    }
    decoratedRules.push({
      ...rule,
      targetTitle: target.title,
      targetDetail: target.detail,
      targetDate: anchorDate,
      targetActive: true,
      nextDueAt: due.toISOString(),
    });
  }
  occurrences = await tx.reminderOccurrence.list({ where: { ownerId } });
  const ruleMap = new Map(decoratedRules.map((rule) => [rule.id, rule]));
  const dueByTarget = new Map<string, any[]>();
  for (const occurrence of occurrences) {
    const rule = ruleMap.get(occurrence.ruleId);
    if (
      occurrence.state !== "pending" ||
      new Date(occurrence.dueAt).getTime() > now.getTime() ||
      !rule?.targetActive
    )
      continue;
    const key = `${occurrence.targetType}:${occurrence.targetId}`;
    dueByTarget.set(key, [...(dueByTarget.get(key) || []), occurrence]);
  }
  const effective: any[] = [];
  for (const group of dueByTarget.values()) {
    group.sort(
      (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime(),
    );
    effective.push(group[0]);
    for (const older of group.slice(1))
      await tx.reminderOccurrence.change({
        where: { id: older.id },
        data: { state: "superseded" },
      });
  }
  return {
    reminders: effective
      .map((occurrence) => {
        const rule = ruleMap.get(occurrence.ruleId);
        return {
          ...occurrence,
          rule,
          title: rule?.targetTitle || "提醒",
          targetDate: rule?.targetDate || null,
        };
      })
      .sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
      ),
    rules: decoratedRules,
  };
}

export async function copyList(tx: Tx, ownerId: string, body: any) {
  const source = await owned(
    tx,
    "shoppingList",
    id.parse(body.id),
    ownerId,
  );
  checkVersion(source, body.version);
  const resetDone = z.boolean().default(true).parse(body.resetDone);
  const departureDate =
    source.kind === "travel"
      ? body.departureDate === undefined
        ? source.departureDate
        : body.departureDate
          ? date.parse(body.departureDate)
          : null
      : null;
  const copy = await tx.shoppingList.insert({
    data: {
      ownerId,
      name: `${source.name} 副本`,
      kind: source.kind,
      departureDate,
      description: source.description,
      archived: false,
      sort: source.sort,
      budget: source.kind === "shopping" ? source.budget : null,
      savingMode: source.savingMode,
    },
  });
  const items = await tx.shoppingItem.list({
    where: { ownerId, listId: source.id },
  });
  for (const item of items) {
    await tx.shoppingItem.insert({
      data: {
        ownerId,
        listId: copy.id,
        name: item.name,
        quantity: item.quantity,
        budget: source.kind === "shopping" ? item.budget : null,
        reason: source.kind === "shopping" ? item.reason : "",
        requirements: source.kind === "shopping" ? item.requirements : "",
        concerns: source.kind === "shopping" ? item.concerns : "",
        alternatives: source.kind === "shopping" ? item.alternatives : "",
        timing: source.kind === "shopping" ? item.timing : "",
        note: item.note,
        originalText: "",
        status: source.kind === "shopping" ? "planned" : "planned",
        done: resetDone ? false : item.done,
        groupName: item.groupName,
        categoryId: source.kind === "shopping" ? item.categoryId : null,
      },
    });
  }
  return copy;
}

export async function mutate(user: User, body: any) {
  const ownerId = user.id;
  if (body.action === "reminderCheck")
    return writeBatch((tx) => reminderCheck(tx, ownerId));
  if (body.action === "reminderSave")
    return operation(ownerId, body.operationId, "reminderSave", (tx) =>
      reminderSave(tx, ownerId, body, user.timezone),
    );
  if (body.action === "reminderDelete")
    return operation(ownerId, body.operationId, "reminderDelete", (tx) =>
      reminderDelete(tx, ownerId, body),
    );
  if (body.action === "reminderHandle")
    return operation(ownerId, body.operationId, "reminderHandle", (tx) =>
      reminderHandle(tx, ownerId, body),
    );
  if (body.action === "copyList")
    return operation(ownerId, body.operationId, "copyList", (tx) =>
      copyList(tx, ownerId, body),
    );
  if (body.action === "listSettlementPreview")
    return settlementPreview(db as unknown as Tx, ownerId, id.parse(body.id));
  if (body.action === "listCheckoutPreview")
    return checkoutPreview(db as unknown as Tx, ownerId, body);
  if (
    [
      "groupSave",
      "groupAssign",
      "groupDissolve",
      "listCheckout",
      "listReopen",
      "listSettlementConfirm",
      "listSavingMode",
    ].includes(body.action)
  )
    return operation(ownerId, body.operationId, body.action, (tx) =>
      groupAction(tx, ownerId, body),
    );
  if (body.action === "viewPreference") {
    const entity = z.enum(["ledger", "savings"]).parse(body.entity);
    const mode = z.enum(["flat", "grouped"]).parse(body.mode);
    return writeBatch(async (tx) => {
      const current = await tx.user.require({
        where: { id: ownerId },
      });
      const preferences = JSON.parse(current.preferences);
      preferences[`${entity}View`] = mode;
      await tx.user.change({
        where: { id: ownerId },
        data: { preferences: JSON.stringify(preferences) },
      });
      return {};
    });
  }
  if (body.action === "preferences") {
    const preferences = z
      .object({
        schemaVersion: z.literal(1),
        widgets: z
          .array(z.enum(defaultWidgets as [string, ...string[]]))
          .max(16),
        sizes: z.record(z.string(), z.enum(["normal", "wide"])).optional(),
        navigation: z
          .object({
            mobile: z.object({
              main: z.array(z.string()).max(20),
              more: z.array(z.string()).max(20),
            }),
            desktop: z.object({
              main: z.array(z.string()).max(20),
              more: z.array(z.string()).max(20),
            }),
          })
          .optional(),
      })
      .parse(body.preferences);
    if (new Set(preferences.widgets).size !== preferences.widgets.length)
      throw new Error("组件不能重复");
    let navigation: unknown;
    if (preferences.navigation) {
      const checked = validateNavigation(preferences.navigation);
      if ("error" in checked) throw new Error(checked.error);
      navigation = checked.value;
    }
    await db.user.change({
      where: { id: ownerId },
      data: {
        preferences: JSON.stringify({
          ...JSON.parse(
            (await db.user.require({ where: { id: ownerId } })).preferences,
          ),
          ...preferences,
          ...(navigation ? { navigation } : {}),
        }),
      },
    });
    return {};
  }
  if (body.action === "settings") {
    const settings = z
      .object({
        autoBatch: z.boolean(),
        batchSize: z.number().int().min(5).max(10),
        defaultExpenseAccountId: id.nullish().optional(),
      })
      .parse(body);
    const { defaultExpenseAccountId, ...preferences } = settings;
    if (defaultExpenseAccountId) {
      const account = await owned(
        db,
        "account",
        defaultExpenseAccountId,
        ownerId,
      );
      if (account.archived) throw new Error("归档账户不能设为默认支出账户");
    }
    await db.user.change({
      where: { id: ownerId },
      data: {
        ...preferences,
        ...(defaultExpenseAccountId !== undefined
          ? { defaultExpenseAccountId: defaultExpenseAccountId || null }
          : {}),
      },
    });
    return {};
  }
  if (body.action === "redeemInvite") {
    const code = z.string().trim().min(1).max(40).parse(body.code);
    return operation(ownerId, body.operationId, "redeemInvite", async (tx) => {
      const invite = await redeemInvite(tx, code, ownerId);
      return { code: invite?.code ?? null };
    });
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
        return tx.savingEntry.change({
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
          "boxes",
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
        await tx.savingEntry.change({
          where: { id: saving.id },
          data: { suppressed: false, version: { increment: 1 } },
        });
        await tx.ledgerEntry.change({
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
          "boxes",
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
      return tx.captureDraft.change({
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
      const content =
        body.text === undefined ? draft.text : text.min(1).parse(body.text);
      const target =
        body.target === undefined
          ? draft.target
          : z
              .enum([
                "auto",
                "ledger",
                "shopping",
                "items",
                "itemUpdate",
                "reminder",
                "savings",
                "text",
              ])
              .parse(body.target);
      let targetListId: string | null = null;
      if (target === "shopping") {
        const listId = body.targetListId ?? draft.targetListId;
        if (!listId) throw new Error("请选择目标购物清单");
        const list = await owned(tx, "shoppingList", listId, ownerId);
        if (list.archived) throw new Error("目标清单已归档，请选择可用清单");
        targetListId = list.id;
      }
      return tx.captureDraft.change({
        where: { id: draft.id },
        data: {
          text: content,
          target,
          targetListId,
          state: "pending",
          result: "[]",
          error: null,
          version: { increment: 1 },
        },
      });
    });
  if (body.action === "draftManual")
    return operation(ownerId, body.operationId, "draftManual", async (tx) => {
      const draft = await owned(tx, "captureDraft", id.parse(body.id), ownerId);
      checkVersion(draft, body.version);
      if (draft.state === "processing")
        throw new Error("整理中的草稿请稍后操作");
      if (JSON.parse(draft.appliedIndexes).length)
        throw new Error("已部分确认的草稿不能重写，请新建补充草稿");
      const target = z
        .enum(["ledger", "shopping", "items", "savings"])
        .parse(body.target);
      const data = z.record(z.string(), z.unknown()).parse(body.data ?? {});
      let targetListId: string | null = null;
      if (target === "shopping") {
        const listId = body.targetListId ?? draft.targetListId;
        if (!listId) throw new Error("请选择目标购物清单");
        const list = await owned(tx, "shoppingList", listId, ownerId);
        if (list.archived) throw new Error("目标清单已归档，请选择可用清单");
        targetListId = list.id;
        data.listId = list.id;
      }
      return tx.captureDraft.change({
        where: { id: draft.id },
        data: {
          target,
          targetListId,
          state: "ready",
          result: JSON.stringify([{ target, data, warnings: [] }]),
          warnings: "[]",
          error: null,
          processedAt: new Date(),
          version: { increment: 1 },
        },
      });
    });
  if (body.action === "purchaseEdit")
    return operation(ownerId, body.operationId, "purchaseEdit", (tx) =>
      purchaseEdit(tx, ownerId, body),
    );
  if (body.action === "purchaseRelink")
    return operation(ownerId, body.operationId, "purchaseRelink", (tx) =>
      purchaseRelink(tx, ownerId, body),
    );
  if (body.action === "purchaseUndo")
    return operation(ownerId, body.operationId, "purchaseUndo", (tx) =>
      purchaseUndo(tx, ownerId, body),
    );
  if (body.action === "purchaseRestore")
    return operation(ownerId, body.operationId, "purchaseRestore", (tx) =>
      purchaseRestore(tx, ownerId, body),
    );
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
        await tx.usageLog.remove({ where: { id: log.id } });
      } else {
        const day = date.parse(body.date ?? localDate());
        if (day < item.purchaseDate || day > (item.retiredDate || localDate()))
          throw new Error("使用日期需在持有期间");
        await tx.usageLog.insert({
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
      const list = await owned(tx, "shoppingList", item.listId, ownerId);
      if (list.kind !== "shopping")
        throw new Error("只有购物清单条目可以发起评议");
      const data = z
        .object({
          title: text.min(1).max(200),
          description: text.default(""),
          targetCount: z.number().int().min(1).max(20),
          rule: z.enum(["all", "majority"]),
          visibility: z.enum(["private", "link", "public"]),
        })
        .parse(body.data);
      return tx.reviewRequest.insert({
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
      return tx.reviewRequest.change({
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
    const lock = await tx.reviewRequest.changeAll({
      where: { token, status: "open", visibility: { not: "private" } },
      data: { version: { increment: 1 } },
    });
    if (!lock.count) throw new Error("评议已结束或不可访问");
    const review = await tx.reviewRequest.require({
      where: { token },
    });
    if (review.ownerId === user.id) throw new Error("发起者不能参与自己的评议");
    const votes = await tx.reviewVote.list({
      where: { reviewId: review.id },
    });
    const previous = votes.find((x) => x.userId === user.id);
    if (!previous && votes.length >= review.targetCount)
      throw new Error("评议人数已满");
    await tx.reviewVote.put({
      where: { reviewId_userId: { reviewId: review.id, userId: user.id } },
      create: {
        ...data,
        reviewId: review.id,
        userId: user.id,
        username: user.username,
      },
      update: data,
    });
    const allVotes = await tx.reviewVote.list({
      where: { reviewId: review.id },
    });
    const status = reviewResult(allVotes, review.targetCount, review.rule);
    await tx.reviewRequest.change({
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
    boxes,
    reminderRules,
    reminders,
  ] = await Promise.all([
    db.account.list({ where }),
    db.category.list({ where }),
    db.ledgerEntry.list({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.shoppingList.list({ where, orderBy: { sort: "asc" } }),
    db.shoppingItem.list({ where, orderBy: { createdAt: "desc" } }),
    db.ownedItem.list({ where }),
    db.usageLog.list({ where, orderBy: { createdAt: "desc" } }),
    db.savingEntry.list({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.captureDraft.list({ where, orderBy: { capturedAt: "desc" } }),
    db.attachment.list({
      where,
      select: {
        id: true,
        draftId: true,
        name: true,
        size: true,
        missing: true,
      },
    }),
    db.reviewRequest.list({ where, orderBy: { createdAt: "desc" } }),
    db.categoryRule.list({ where }),
    db.storageBox.list({ where, orderBy: { createdAt: "asc" } }),
    db.reminderRule.list({ where, orderBy: { createdAt: "asc" } }),
    db.reminderOccurrence.list({ where, orderBy: { dueAt: "asc" } }),
  ]);
  const votes = await db.reviewVote.list({
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
      defaultExpenseAccountId: user.defaultExpenseAccountId,
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
    groups: await db.recordGroup.list({ where }),
    settlements: await db.listSettlement.list({ where }),
    boxes,
    reminderRules,
    reminders,
    ai: await aiUsage(ownerId),
  };
}
