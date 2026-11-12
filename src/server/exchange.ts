import { Prisma, User } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, writeTransaction } from "./db";
import { effectiveSaving, totals } from "@/lib/domain";
import {
  canonical,
  csvFields,
  decodeFile,
  emptyRecords,
  entities,
  fingerprint,
  hash,
  models,
  refs,
  type Entity,
  type Records,
} from "./exchange-codec";

type Tx = Prisma.TransactionClient;
type FileData = ReturnType<typeof decodeFile>;
const key = (entity: string, id: string) => `${entity}:${id}`;
const targetSchema = z.object({
  entity: z.enum(entities as [Entity, ...Entity[]]),
  sourceId: z.string().min(1).max(200),
  localId: z.string().min(1).max(200),
});
const decisionSchema = z.object({
  entity: z.enum(entities as [Entity, ...Entity[]]),
  sourceId: z.string().min(1).max(200),
  choice: z.enum(["keep", "new"]),
});
function publicRow(entity: Entity, row: any) {
  const safe = { ...row };
  for (const field of ["ownerId", "token", "storageKey"]) delete safe[field];
  if (entity === "votes")
    safe.userId = `participant:${hash(row.userId).slice(0, 24)}`;
  if (entity === "settlements")
    safe.members = JSON.stringify(
      JSON.parse(row.members).map((m: any) => {
        const rest = { ...m };
        delete rest.ownerId;
        return rest;
      }),
    );
  return safe;
}

export async function exportData(user: User) {
  return db.$transaction(async (tx) => {
    const dataset = await tx.exchangeDataset.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id },
      update: {},
    });
    const records = emptyRecords();
    for (const entity of entities) {
      const where =
        entity === "votes"
          ? { reviewId: { in: records.reviews.map((r) => r.id) } }
          : { ownerId: user.id };
      records[entity] = await (tx as any)[models[entity]].findMany({
        where,
        orderBy: { id: "asc" },
      });
      records[entity] = records[entity].map((row) => publicRow(entity, row));
    }
    const deletedSources: { entity: Entity; sourceId: string }[] = [];
    const deleted = (entity: Entity, sourceId: string) => {
      if (
        sourceId &&
        !records[entity].some((r) => r.id === sourceId) &&
        !deletedSources.some(
          (r) => r.entity === entity && r.sourceId === sourceId,
        )
      )
        deletedSources.push({ entity, sourceId });
    };
    for (const entity of entities)
      for (const row of records[entity]) {
        for (const [field, target] of Object.entries(refs[entity] || {})) {
          if (
            [
              "sourceDraftId",
              "targetListId",
              "sourceListId",
              "sourceShoppingItemId",
            ].includes(field) ||
            (entity === "attachments" && field === "draftId") ||
            (entity === "reviews" && field === "itemId") ||
            (entity === "savings" && field === "ledgerId") ||
            (entity === "settlements" && field === "listId")
          )
            deleted(target, row[field]);
        }
        if (entity === "settlements" && row.status !== "valid")
          for (const member of JSON.parse(row.members))
            deleted("shopping", member.id);
      }
    return JSON.parse(
      JSON.stringify({
        schemaVersion: 2,
        datasetId: dataset.id,
        exportedAt: new Date().toISOString(),
        currency: "CNY",
        amountUnit: "cent",
        attachmentPolicy: "metadata-only",
        deletedSources,
        ...records,
      }),
    );
  });
}

export function financialSummary(records: Records) {
  const accounts = records.accounts.map((a) => ({
    id: a.id,
    opening: a.opening,
    balance:
      a.opening +
      records.ledger.reduce(
        (sum, e) =>
          sum +
          (e.accountId === a.id
            ? e.type === "expense" || e.type === "transfer"
              ? -e.amount
              : e.amount
            : 0) +
          (e.type === "transfer" && e.toAccountId === a.id ? e.amount : 0),
        0,
      ),
  }));
  return {
    counts: Object.fromEntries(entities.map((e) => [e, records[e].length])),
    ...totals(records.ledger),
    saving: records.savings
      .filter(effectiveSaving)
      .reduce((s, r) => s + r.amount, 0),
    accounts,
  };
}

function embeddedRefs(
  entity: Entity,
  row: any,
  resolve: (entity: Entity, id: string) => string,
) {
  const remap = (data: any) => {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("内嵌数据必须是对象");
    const output = { ...data };
    delete output.ownerId;
    const fields: Record<string, Entity> = {
      accountId: "accounts",
      toAccountId: "accounts",
      purchaseAccountId: "accounts",
      categoryId: "categories",
      groupId: "groups",
      listId: "lists",
      targetListId: "lists",
      itemId: "shopping",
      ledgerId: "ledger",
      ownedItemId: "items",
      refundOfId: "ledger",
      sourceDraftId: "drafts",
      sourceShoppingItemId: "shopping",
    };
    for (const [field, target] of Object.entries(fields))
      if (output[field]) output[field] = resolve(target, output[field]);
    return output;
  };
  if (entity === "settlements") {
    const members = JSON.parse(row.members);
    if (!Array.isArray(members)) throw new Error("结算成员必须是数组");
    row.members = JSON.stringify(
      members.map((m) => {
        if (!m.id) throw new Error("结算成员缺少购物项 ID");
        return { ...remap(m), id: resolve("shopping", m.id) };
      }),
    );
  }
  if (entity === "drafts") {
    const results = JSON.parse(row.result),
      applied = JSON.parse(row.appliedIndexes),
      warnings = JSON.parse(row.warnings);
    if (
      !Array.isArray(results) ||
      !Array.isArray(applied) ||
      !Array.isArray(warnings) ||
      warnings.some((w) => typeof w !== "string") ||
      new Set(applied).size !== applied.length ||
      applied.some((i) => !Number.isInteger(i) || i < 0 || i >= results.length)
    )
      throw new Error("草稿候选/已确认索引无效");
    row.result = JSON.stringify(
      results.map((candidate) => {
        if (
          !candidate ||
          ![
            "ledger",
            "shopping",
            "savings",
            "items",
            "conversion",
            "text",
          ].includes(candidate.target)
        )
          throw new Error("草稿候选模块无效");
        return { ...candidate, data: remap(candidate.data || {}) };
      }),
    );
    row.leaseId = null;
    row.leaseAt = null;
    if (row.state === "processing") {
      row.state = "pending";
      row.error = null;
    }
    if (row.state === "applied" && applied.length !== results.length)
      throw new Error("草稿已完成状态与确认索引不一致");
  }
}

// Validate the resolved graph for both previews and commits. No AI or automatic derivation is called.
function validateGraph(
  records: Records,
  errors: string[],
  deleted = new Set<string>(),
) {
  const find = (e: Entity, id: string) => records[e].find((r) => r.id === id);
  const error = (e: Entity, row: any, message: string) =>
    errors.push(`${e}:${row.id} ${message}`);
  const unique = (entity: Entity, field: string) => {
    const seen = new Set<string>();
    for (const r of records[entity])
      if (r[field]) {
        if (seen.has(r[field])) error(entity, r, `${field} 重复`);
        seen.add(r[field]);
      }
  };
  for (const [e, f] of [
    ["ledger", "sourceShoppingItemId"],
    ["groups", "sourceListId"],
    ["settlements", "listId"],
    ["savings", "sourceKey"],
    ["savings", "settlementId"],
  ] as [Entity, string][])
    unique(e, f);
  const categoryKeys = records.categories.map((c) => `${c.type}:${c.name}`);
  if (new Set(categoryKeys).size !== categoryKeys.length)
    errors.push("分类类型和名称重复：请显式映射到已有分类");
  unique("rules", "keyword");
  for (const r of records.ledger) {
    if (
      r.type === "transfer" &&
      (!r.accountId || !r.toAccountId || r.accountId === r.toAccountId)
    )
      error("ledger", r, "转账需两个不同账户");
    if (r.type !== "transfer" && r.toAccountId)
      error("ledger", r, "非转账不能指定转入账户");
    if (r.type !== "refund" && r.refundOfId)
      error("ledger", r, "非退款不能引用退款原单");
    if (r.type === "refund") {
      const original = find("ledger", r.refundOfId);
      if (!original || original.type !== "expense")
        error("ledger", r, "退款原单缺失或不是支出");
      else if (original.categoryId !== r.categoryId || r.date < original.date)
        error("ledger", r, "退款分类或日期与原支出不一致");
    }
    if (
      r.type === "expense" &&
      records.ledger
        .filter((e) => e.refundOfId === r.id)
        .reduce((s, e) => s + e.amount, 0) > r.amount
    )
      error("ledger", r, "累计退款超过原支出");
    if (r.categoryId) {
      const c = find("categories", r.categoryId);
      if (!c || c.type !== (r.type === "refund" ? "expense" : r.type))
        error("ledger", r, "分类类型不匹配");
    }
    if (r.grossAmount != null && r.grossAmount !== r.amount + r.discount)
      error("ledger", r, "优惠前金额应等于实付加优惠");
    if (r.sourceShoppingItemId) {
      const i = find("shopping", r.sourceShoppingItemId);
      if (
        (!i && !deleted.has(key("shopping", r.sourceShoppingItemId))) ||
        (i && (i.ledgerId !== r.id || i.status !== "purchased")) ||
        r.type !== "expense"
      )
        error("ledger", r, "购物来源双向关系不一致");
    }
  }
  for (const r of records.shopping) {
    if (r.categoryId && find("categories", r.categoryId)?.type !== "expense")
      error("shopping", r, "购物分类必须为支出分类");
    if (r.ledgerId) {
      const e = find("ledger", r.ledgerId);
      if (
        !e ||
        e.sourceShoppingItemId !== r.id ||
        e.type !== "expense" ||
        r.status !== "purchased"
      )
        error("shopping", r, "关联账单与购物来源不一致");
      if (
        e &&
        (r.purchaseAmount !== e.amount ||
          r.purchasedAt !== e.date ||
          r.purchaseAccountId !== e.accountId)
      )
        error("shopping", r, "购买快照与有效账单不一致");
    }
  }
  for (const s of records.savings) {
    if (s.amount <= 0 && s.type !== "budget_surplus" && effectiveSaving(s))
      error("savings", s, "有效省钱金额必须大于零");
    if (s.type === "skipped" && (s.actual !== 0 || s.planned !== s.amount))
      error("savings", s, "放弃省钱需等于原计划金额且实际为零");
    if (
      s.type === "downgrade" &&
      (s.planned == null ||
        s.actual == null ||
        s.planned - s.actual !== s.amount)
    )
      error("savings", s, "降级省钱需等于原计划减实际金额");
    if (s.source === "automatic" && s.ledgerId) {
      const entry = find("ledger", s.ledgerId);
      if (!entry || s.sourceKey !== `discount:${entry.orderKey || entry.id}`)
        error("savings", s, "自动优惠来源键与账单不一致");
    }
    if (
      s.source === "automatic" &&
      !s.ledgerId &&
      s.status === "valid" &&
      !s.suppressed
    )
      error("savings", s, "有效自动省钱缺少来源账单");
    if (s.type === "budget_surplus") {
      const settlement = find("settlements", s.settlementId);
      if (
        !settlement ||
        settlement.listId !== s.sourceListId ||
        s.amount !== Math.max(settlement.budget - settlement.paid, 0) ||
        (!s.suppressed &&
          s.status !==
            (s.amount === 0 && settlement.status === "valid"
              ? "revoked"
              : settlement.status))
      )
        error("savings", s, "预算结余与结算不一致");
    }
    if (s.supersededBySettlementId) {
      const t = find("settlements", s.supersededBySettlementId);
      if (!t || t.listId !== s.sourceListId)
        error("savings", s, "替代结算与来源清单不一致");
    }
  }
  for (const t of records.settlements) {
    const members = JSON.parse(t.members);
    const list = find("lists", t.listId);
    if (
      (!list &&
        !(t.status !== "valid" && deleted.has(key("lists", t.listId)))) ||
      members.some(
        (m: any) =>
          find("shopping", m.id)?.listId !== t.listId &&
          !(t.status !== "valid" && deleted.has(key("shopping", m.id))),
      )
    )
      error("settlements", t, "结算成员缺失或归属不一致");
    if (t.status === "valid") {
      const items = records.shopping.filter((i) => i.listId === t.listId);
      if (
        list?.savingMode !== "budget" ||
        list.budget !== t.budget ||
        members.length !== items.length ||
        new Set(members.map((m: any) => m.id)).size !== members.length ||
        items.some(
          (i) =>
            !members.some((m: any) => m.id === i.id) ||
            !["purchased", "skipped"].includes(i.status) ||
            (i.status === "purchased" &&
              (i.purchaseAmount == null ||
                !i.purchasedAt ||
                i.purchaseNeedsReview)),
        ) ||
        items
          .filter((i) => i.status === "purchased")
          .reduce((sum, i) => sum + i.purchaseAmount, 0) !== t.paid
      )
        error("settlements", t, "有效结算的当前成员/预算/实付不一致");
      if (records.savings.filter((s) => s.settlementId === t.id).length !== 1)
        error("settlements", t, "结算缺少唯一预算省钱记录");
      if (
        records.savings.some(
          (s) =>
            s.sourceListId === t.listId &&
            ["automatic", "shopping"].includes(s.source) &&
            s.supersededBySettlementId !== t.id,
        )
      )
        error("settlements", t, "商品省钱未被结算替代，可能重复累计");
    }
  }
  for (const draft of records.drafts) {
    const applied = JSON.parse(draft.appliedIndexes),
      results = JSON.parse(draft.result);
    const appliedByTarget: Record<string, number> = {};
    for (const i of applied) {
      const c = results[i];
      if (c.target === "conversion") {
        if (!find("shopping", c.data.itemId))
          error("drafts", draft, "已确认转换缺少购物项");
      } else appliedByTarget[c.target] = (appliedByTarget[c.target] || 0) + 1;
    }
    for (const [target, count] of Object.entries(appliedByTarget)) {
      if (
        !entities.includes(target as Entity) ||
        records[target as Entity].filter((r) => r.sourceDraftId === draft.id)
          .length < count
      )
        error("drafts", draft, "已确认索引找不到相应正式记录");
    }
  }
}

async function plan(
  tx: Tx,
  ownerId: string,
  file: FileData,
  mappings: z.infer<typeof targetSchema>[],
  decisions: z.infer<typeof decisionSchema>[],
  allocations: Record<string, string>,
) {
  const errors: string[] = [],
    conflicts: any[] = [],
    unresolved: any[] = [],
    warnings = [...file.warnings];
  const local = emptyRecords();
  for (const e of entities)
    local[e] = await (tx as any)[models[e]].findMany({
      where:
        e === "votes"
          ? { reviewId: { in: local.reviews.map((r) => r.id) } }
          : { ownerId },
    });
  const identities = await tx.importIdentity.findMany({
    where: { ownerId, datasetId: file.datasetId },
  });
  const map: Record<string, string> = {},
    incoming = emptyRecords(),
    actions: any[] = [];
  const mappingKeys = mappings.map((m) => key(m.entity, m.sourceId));
  if (new Set(mappingKeys).size !== mappingKeys.length)
    errors.push("同一来源存在重复映射");
  for (const m of mappings) {
    const target = local[m.entity].find((r) => r.id === m.localId);
    if (!target)
      errors.push(`${key(m.entity, m.sourceId)} 映射目标不存在或无权访问`);
    else if (target.archived)
      errors.push(`${key(m.entity, m.sourceId)} 映射目标已归档`);
    else map[key(m.entity, m.sourceId)] = m.localId;
  }
  const ownDataset = await tx.exchangeDataset.findFirst({
    where: { id: file.datasetId, ownerId },
  });
  let duplicates = 0;
  for (const e of entities)
    for (const row of file.records[e]) {
      const k = key(e, row.id),
        fp = fingerprint(row);
      const ownRow = ownDataset && local[e].find((r) => r.id === row.id);
      const identity =
        identities.find((i) => i.entity === e && i.sourceId === row.id) ||
        (ownRow
          ? {
              localId: ownRow.id,
              fingerprint: fingerprint(publicRow(e, ownRow)),
              localFingerprint: fingerprint(ownRow),
              sourceContent: JSON.stringify(publicRow(e, ownRow)),
            }
          : undefined);
      const target =
        identity && local[e].find((r) => r.id === identity.localId);
      const mapped = map[k] && local[e].find((r) => r.id === map[k]);
      if (mapped) {
        duplicates++;
        continue;
      }
      if (identity && !target)
        errors.push(
          `${k} 之前导入的本地记录已删除，请用新的来源标识或显式映射处理`,
        );
      const fields =
        file.csv && (e === "ledger" || e === "savings")
          ? csvFields[e].filter((k) => k in row)
          : null;
      const priorSource = identity ? JSON.parse(identity.sourceContent) : null;
      const sameSource =
        fields && priorSource
          ? fields.every(
              (k) => canonical(row[k]) === canonical(priorSource[k] ?? null),
            )
          : identity?.fingerprint === fp;
      const changed =
        target &&
        (!sameSource || identity.localFingerprint !== fingerprint(target));
      const decision = decisions.find(
        (d) => d.entity === e && d.sourceId === row.id,
      )?.choice;
      if (changed && !decision)
        conflicts.push({
          entity: e,
          sourceId: row.id,
          localId: target.id,
          title: row.title || row.name || row.id,
          reason: "同一来源内容已变化，或本地记录已修改",
        });
      if (target && (!changed || decision !== "new")) {
        map[k] = target.id;
        duplicates++;
        continue;
      }
      map[k] = allocations[k] ||= randomUUID();
      actions.push({
        entity: e,
        sourceId: row.id,
        localId: map[k],
        fingerprint: fp,
        sourceContent: JSON.stringify(row),
      });
    }
  const resolve = (entity: Entity, id: string): string => {
    if (typeof id !== "string") {
      errors.push(`${entity} 引用 ID 必须是字符串`);
      return "unresolved";
    }
    const k = key(entity, id);
    if (map[k]) return map[k];
    const identity = identities.find(
      (i) => i.entity === entity && i.sourceId === id,
    );
    if (identity && local[entity].some((r) => r.id === identity.localId))
      return identity.localId;
    if (
      file.deletedSources.some((r) => r.entity === entity && r.sourceId === id)
    )
      return `deleted:${hash(`${ownerId}:${file.datasetId}:${entity}:${id}`).slice(0, 40)}`;
    if (!unresolved.some((r) => r.entity === entity && r.sourceId === id))
      unresolved.push({ entity, sourceId: id });
    return `unresolved:${id}`;
  };
  for (const action of actions) {
    const entity: Entity = action.entity;
    const source = file.records[entity].find((r) => r.id === action.sourceId);
    if (
      (entity === "categories" &&
        local.categories.some(
          (r) => r.name === source.name && r.type === source.type,
        )) ||
      (entity === "rules" &&
        local.rules.some((r) => r.keyword === source.keyword))
    ) {
      unresolved.push({
        entity,
        sourceId: source.id,
        reason:
          "名称/关键字已有唯一约束，请显式选择现有记录；需要保留两个分类时先更名",
      });
    }
  }
  const orderKey = (id: string) =>
    `import:${hash(`${ownerId}:${file.datasetId}:${id}`).slice(0, 40)}`;
  for (const action of actions) {
    const entity: Entity = action.entity;
    const original = file.records[entity].find((r) => r.id === action.sourceId);
    const row = { ...original, id: action.localId };
    for (const [field, target] of Object.entries(refs[entity] || {}))
      if (row[field]) row[field] = resolve(target, row[field]);
    for (const field of [
      "accountId",
      "toAccountId",
      "purchaseAccountId",
      "categoryId",
    ]) {
      const target = refs[entity]?.[field];
      if (
        target &&
        row[field] &&
        local[target].some((r) => r.id === row[field] && r.archived)
      )
        errors.push(`${entity}:${original.id} ${field} 引用了已归档记录`);
    }
    try {
      embeddedRefs(entity, row, resolve);
    } catch (e) {
      errors.push(`${entity}:${original.id} ${(e as Error).message}`);
    }
    if (entity === "ledger" && row.orderKey)
      row.orderKey = orderKey(row.orderKey);
    if (entity === "savings" && row.sourceKey) {
      const entry = file.records.ledger.find((e) => e.id === original.ledgerId);
      const existing = local.ledger.find((e) => e.id === row.ledgerId);
      if (row.source === "automatic" && (entry || existing))
        row.sourceKey = `discount:${entry ? (entry.orderKey ? orderKey(entry.orderKey) : resolve("ledger", entry.id)) : existing.orderKey || existing.id}`;
      else if (row.sourceKey.startsWith("shopping:") && row.shoppingItemId)
        row.sourceKey = `shopping:${row.shoppingItemId}:${row.type === "skipped" ? "skip" : "downgrade"}`;
      else if (row.settlementId)
        row.sourceKey = `settlement:${row.sourceListId}`;
      else row.sourceKey = orderKey(row.sourceKey);
    }
    if (entity === "attachments") {
      row.storageKey = `unmigrated:${randomUUID()}`;
      row.missing = true;
    }
    if (entity === "reviews") {
      row.token = `revoked-${action.localId}`;
      row.status = "revoked";
    }
    if (entity === "votes")
      row.userId = `import:${hash(`${ownerId}:${file.datasetId}:${row.userId}`).slice(0, 40)}`;
    incoming[entity].push(row);
  }
  const combined = Object.fromEntries(
    entities.map((e) => [e, [...local[e], ...incoming[e]]]),
  ) as Records;
  const deleted = new Set(
    file.deletedSources.map((r) =>
      key(r.entity, resolve(r.entity, r.sourceId)),
    ),
  );
  // Historical tombstones never satisfy required accounts, categories, active purchases or refunds.
  for (const entity of entities)
    for (const row of incoming[entity])
      for (const [field, target] of Object.entries(refs[entity] || {})) {
        if (!row[field] || !deleted.has(key(target, row[field]))) continue;
        const allowed =
          ([
            "sourceDraftId",
            "targetListId",
            "sourceListId",
            "sourceShoppingItemId",
          ].includes(field) &&
            (entity !== "groups" || row.sourceDeleted)) ||
          (entity === "attachments" && field === "draftId") ||
          (entity === "reviews" && field === "itemId") ||
          (entity === "savings" &&
            field === "ledgerId" &&
            (row.status !== "valid" || row.suppressed)) ||
          (entity === "settlements" &&
            field === "listId" &&
            row.status !== "valid");
        if (!allowed)
          errors.push(
            `${entity}:${row.id} ${field} 需要有效来源，不能使用已删除来源`,
          );
      }
  if (!unresolved.length) {
    const existingErrors: string[] = [];
    validateGraph(local, existingErrors, deleted);
    const graphErrors: string[] = [];
    validateGraph(combined, graphErrors, deleted);
    errors.push(
      ...graphErrors.filter((message) => !existingErrors.includes(message)),
    );
    if (existingErrors.length)
      warnings.push(
        "本地已有历史异常；本次仅新增经过校验的记录，不自动修复旧记录。",
      );
  }
  if (deleted.size)
    warnings.push(
      "历史已删除来源以隔离的来源标识保留，不恢复已删除记录，也不重新计入金额。",
    );
  if (file.records.attachments.length)
    warnings.push(
      "附件仅恢复元数据，标记“附件未迁移”；图片需通过文件备份恢复。",
    );
  if (file.records.reviews.length)
    warnings.push(
      "评议和历史投票保留；所有导入分享均已撤销，不恢复可用公开链接。",
    );
  const similar = incoming.ledger.filter((r) =>
    local.ledger.some(
      (e) => e.title === r.title && e.amount === r.amount && e.date === r.date,
    ),
  );
  if (similar.length)
    warnings.push(
      `${similar.length} 条账单与现有记录相似，仍按来源 ID 判断，不按标题/金额自动合并。`,
    );
  const stateHash = hash(
    canonical({ local: JSON.parse(JSON.stringify(local)), identities }),
  );
  return {
    incoming,
    actions,
    map,
    stateHash,
    summary: {
      datasetId: file.datasetId,
      format: file.csv
        ? file.legacy
          ? "CSV v1"
          : "CSV v2"
        : file.legacy
          ? "JSON v1"
          : "JSON v2",
      added: actions.length,
      duplicates,
      conflicts,
      unresolved,
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)],
      before: financialSummary(local),
      after: financialSummary(combined),
      canCommit: !errors.length && !conflicts.length && !unresolved.length,
    },
  };
}

export async function previewImport(user: User, input: unknown) {
  const body = z
    .object({
      content: z.string(),
      sourceId: z.string().max(160).optional(),
      mappings: z.array(targetSchema).max(10000).default([]),
      decisions: z.array(decisionSchema).max(10000).default([]),
    })
    .parse(input);
  const file = decodeFile(body.content, body.sourceId);
  return writeTransaction(
    async (tx) => {
      const allocations = {};
      const p = await plan(
        tx,
        user.id,
        file,
        body.mappings,
        body.decisions,
        allocations,
      );
      const job = await tx.importJob.create({
        data: {
          ownerId: user.id,
          fileHash: hash(body.content),
          payload: JSON.stringify({
            file,
            mappings: body.mappings,
            decisions: body.decisions,
            allocations,
            stateHash: p.stateHash,
          }),
          preview: JSON.stringify(p.summary),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      return { jobId: job.id, expiresAt: job.expiresAt, ...p.summary };
    },
    { maxWait: 10000, timeout: 60000 },
  );
}

export async function commitImport(user: User, input: unknown) {
  const { jobId } = z
    .object({ jobId: z.string().min(1).max(200) })
    .parse(input);
  return writeTransaction(
    async (tx) => {
      const job = await tx.importJob.findFirst({
        where: { id: jobId, ownerId: user.id },
      });
      if (!job) throw new Error("导入任务不存在或无权访问");
      if (job.status === "committed") return JSON.parse(job.result);
      if (job.expiresAt.getTime() < Date.now())
        throw new Error("预检已过期，请重新预检");
      const saved = JSON.parse(job.payload);
      const p = await plan(
        tx,
        user.id,
        saved.file,
        saved.mappings,
        saved.decisions,
        saved.allocations,
      );
      if (saved.stateHash !== p.stateHash)
        throw new Error("本地记录或导入映射已更新，请重新预检");
      if (!p.summary.canCommit)
        throw new Error("预检存在未解决的错误、冲突或关联映射");
      for (const entity of entities)
        for (const row of p.incoming[entity]) {
          const data = { ...row };
          if (entity !== "votes") data.ownerId = user.id;
          // Prisma takes Date objects for database DateTime values.
          const model = Prisma.dmmf.datamodel.models.find(
            (m) => m.name.toLowerCase() === models[entity].toLowerCase(),
          )!;
          for (const f of model.fields)
            if (f.type === "DateTime" && data[f.name] != null)
              data[f.name] = new Date(data[f.name]);
          await (tx as any)[models[entity]].create({ data });
        }
      for (const action of p.actions) {
        const row = await (tx as any)[
          models[action.entity as Entity]
        ].findUnique({ where: { id: action.localId } });
        const identity = {
          ownerId: user.id,
          datasetId: saved.file.datasetId,
          entity: action.entity,
          sourceId: action.sourceId,
        };
        await tx.importIdentity.upsert({
          where: { ownerId_datasetId_entity_sourceId: identity },
          create: {
            ...identity,
            localId: action.localId,
            fingerprint: action.fingerprint,
            sourceContent: action.sourceContent,
            localFingerprint: fingerprint(JSON.parse(JSON.stringify(row))),
          },
          update: {
            localId: action.localId,
            fingerprint: action.fingerprint,
            sourceContent: action.sourceContent,
            localFingerprint: fingerprint(JSON.parse(JSON.stringify(row))),
          },
        });
      }
      // Explicit mappings are remembered, including external references absent from CSV.
      for (const mapping of saved.mappings) {
        const row = await (tx as any)[
          models[mapping.entity as Entity]
        ].findUnique({ where: { id: mapping.localId } });
        const source = saved.file.records[mapping.entity].find(
          (r: any) => r.id === mapping.sourceId,
        );
        const identity = {
          ownerId: user.id,
          datasetId: saved.file.datasetId,
          entity: mapping.entity,
          sourceId: mapping.sourceId,
        };
        await tx.importIdentity.upsert({
          where: { ownerId_datasetId_entity_sourceId: identity },
          create: {
            ...identity,
            localId: mapping.localId,
            fingerprint: source ? fingerprint(source) : "mapped",
            sourceContent: JSON.stringify(source || {}),
            localFingerprint: fingerprint(JSON.parse(JSON.stringify(row))),
          },
          update: {
            localId: mapping.localId,
            ...(source
              ? {
                  fingerprint: fingerprint(source),
                  sourceContent: JSON.stringify(source),
                }
              : {}),
            localFingerprint: fingerprint(JSON.parse(JSON.stringify(row))),
          },
        });
      }
      const result = {
        jobId,
        imported: p.actions.length,
        skipped: p.summary.duplicates,
        before: p.summary.before,
        after: p.summary.after,
        warnings: p.summary.warnings,
      };
      await tx.importJob.update({
        where: { id: job.id },
        data: { status: "committed", result: JSON.stringify(result) },
      });
      return result;
    },
    { maxWait: 10000, timeout: 60000 },
  );
}
