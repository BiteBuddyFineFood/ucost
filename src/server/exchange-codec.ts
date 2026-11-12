import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { categoryColors, categoryIcons, validDate } from "@/lib/domain";

export const MAX_FILE_BYTES = 8_000_000;
export const MAX_RECORDS = 10_000;
export const models = {
  accounts: "account",
  categories: "category",
  rules: "categoryRule",
  lists: "shoppingList",
  groups: "recordGroup",
  shopping: "shoppingItem",
  ledger: "ledgerEntry",
  items: "ownedItem",
  usage: "usageLog",
  settlements: "listSettlement",
  savings: "savingEntry",
  drafts: "captureDraft",
  attachments: "attachment",
  reviews: "reviewRequest",
  votes: "reviewVote",
  analyses: "aiAnalysis",
} as const;
export type Entity = keyof typeof models;
export type Records = Record<Entity, any[]>;
export const entities = Object.keys(models) as Entity[];
export const emptyRecords = (): Records =>
  Object.fromEntries(entities.map((k) => [k, []])) as unknown as Records;
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function canonical(value: any): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const fingerprint = (row: any) =>
  hash(
    canonical(
      Object.fromEntries(
        Object.entries(row).filter(
          ([k]) =>
            ![
              "ownerId",
              "version",
              "createdAt",
              "updatedAt",
              "sourceDraftId",
              "token",
              "storageKey",
              "missing",
            ].includes(k),
        ),
      ),
    ),
  );
export const refs: Partial<Record<Entity, Record<string, Entity>>> = {
  rules: { categoryId: "categories" },
  groups: { sourceListId: "lists" },
  shopping: {
    listId: "lists",
    categoryId: "categories",
    ledgerId: "ledger",
    ownedItemId: "items",
    purchaseAccountId: "accounts",
    sourceDraftId: "drafts",
  },
  ledger: {
    accountId: "accounts",
    toAccountId: "accounts",
    categoryId: "categories",
    refundOfId: "ledger",
    groupId: "groups",
    sourceShoppingItemId: "shopping",
    sourceDraftId: "drafts",
  },
  items: { ledgerId: "ledger", sourceDraftId: "drafts" },
  usage: { itemId: "items" },
  savings: {
    ledgerId: "ledger",
    shoppingItemId: "shopping",
    sourceListId: "lists",
    groupId: "groups",
    settlementId: "settlements",
    supersededBySettlementId: "settlements",
    sourceDraftId: "drafts",
  },
  settlements: { listId: "lists" },
  drafts: { targetListId: "lists" },
  attachments: { draftId: "drafts" },
  reviews: { itemId: "shopping" },
  votes: { reviewId: "reviews" },
};
const ignored = new Set(["ownerId", "token", "storageKey"]);
export function normalizeRow(entity: Entity, input: any, warnings: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error(`${entity}: 记录必须是对象`);
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === models[entity].toLowerCase(),
  )!;
  const row: any = {};
  for (const field of model.fields) {
    const k = field.name;
    if (ignored.has(k)) continue;
    let v = input[k];
    if (v === undefined) {
      if (k === "id") throw new Error(`${entity}: 缺少稳定 ID`);
      if (field.hasDefaultValue && typeof field.default !== "object")
        v = field.default;
      else if (!field.isRequired) v = null;
      else if (field.hasDefaultValue || field.isUpdatedAt) continue;
      else throw new Error(`${entity}.${k}: 缺少必填字段`);
    }
    if (v === null) {
      if (field.isRequired) throw new Error(`${entity}.${k}: 不可为空`);
    } else if (field.type === "String") {
      if (
        typeof v !== "string" ||
        v.length >
          (k === "members" || k === "result" ? MAX_FILE_BYTES : 100_000)
      )
        throw new Error(`${entity}.${k}: 文本无效或过长`);
      if ((k === "id" || refs[entity]?.[k]) && (!v || v.length > 200))
        throw new Error(`${entity}.${k}: ID 无效`);
    } else if (field.type === "Int") {
      if (
        !Number.isInteger(v) ||
        Math.abs(v) > 2_000_000_000 ||
        (k !== "opening" && k !== "sort" && v < 0)
      )
        throw new Error(`${entity}.${k}: 必须是范围内的整数分/整数`);
    } else if (field.type === "Boolean" && typeof v !== "boolean")
      throw new Error(`${entity}.${k}: 必须为布尔值`);
    else if (field.type === "DateTime") {
      if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
        throw new Error(`${entity}.${k}: 时间无效`);
      v = new Date(v).toISOString();
    }
    row[k] = v;
  }
  for (const k of ["date", "purchaseDate", "retiredDate", "purchasedAt"])
    if (row[k] != null && !validDate(row[k]))
      throw new Error(`${entity}.${k}: 日期无效`);
  const choices: Record<string, string[]> = {
    "ledger.type": ["expense", "income", "transfer", "refund"],
    "categories.type": ["expense", "income"],
    "shopping.status": ["considering", "planned", "purchased", "skipped"],
    "lists.savingMode": ["item", "budget"],
    "savings.type": [
      "discount",
      "skipped",
      "downgrade",
      "reduced",
      "budget_surplus",
    ],
    "savings.source": ["manual", "ai", "automatic", "shopping", "settlement"],
    "savings.status": ["valid", "pending", "revoked"],
    "settlements.status": ["valid", "pending", "revoked"],
    "items.mode": ["day", "use"],
    "drafts.target": ["auto", "ledger", "shopping", "items", "savings", "text"],
    "drafts.state": [
      "pending",
      "processing",
      "ready",
      "applied",
      "ignored",
      "failed",
    ],
  };
  for (const [key, values] of Object.entries(choices)) {
    const [e, k] = key.split(".");
    if (e === entity && !values.includes(row[k]))
      throw new Error(`${key}: 未知值 ${row[k]}`);
  }
  if (entity === "categories") {
    if (!categoryIcons[row.iconKey]) {
      row.iconKey = "tag";
      warnings.push(`分类 ${row.name} 的未知图标已降级`);
    }
    if (!(row.color in categoryColors)) row.color = "";
  }
  if (entity === "ledger" && row.amount <= 0)
    throw new Error("账单金额必须大于零");
  if (["ledger", "savings"].includes(entity) && !row.title.trim())
    throw new Error("记录标题不能为空");
  if (
    ["accounts", "categories", "lists", "groups", "shopping", "items"].includes(
      entity,
    ) &&
    !row.name.trim()
  )
    throw new Error(`${entity}: 名称不能为空`);
  if (entity === "usage" && row.count <= 0)
    throw new Error("使用次数必须大于零");
  if (entity === "votes")
    row.userId = input.userId || `participant:${input.id}`;
  return row;
}

// Every leading apostrophe is escaped too, so formula protection is reversible.
export const csvCell = (value: unknown) => {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@'\t\r\n ]/.test(s)) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
};
export const encodeCsv = (rows: unknown[][]) =>
  "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\ufeff/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("CSV 引号格式错误");
      cell += c;
    }
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length || rows.some((r) => r.length !== rows[0].length))
    throw new Error("CSV 列数不一致或文件为空");
  return rows;
}
export const csvFields = {
  ledger: [
    "id",
    "date",
    "type",
    "title",
    "amount",
    "accountId",
    "accountName",
    "toAccountId",
    "toAccountName",
    "categoryId",
    "categoryName",
    "groupId",
    "groupName",
    "sourceListId",
    "sourceShoppingItemId",
    "refundOfId",
    "discount",
    "grossAmount",
    "discountDetails",
    "autoSaving",
    "orderKey",
    "note",
  ],
  savings: [
    "id",
    "date",
    "title",
    "type",
    "source",
    "planned",
    "actual",
    "amount",
    "groupId",
    "groupName",
    "sourceListId",
    "settlementId",
    "ledgerId",
    "shoppingItemId",
    "status",
    "suppressed",
    "supersededBySettlementId",
    "sourceKey",
    "note",
  ],
};
export function exportCsv(
  data: any,
  entity: "ledger" | "savings",
  filters = new URLSearchParams(),
) {
  const names = (key: string, id: string) =>
    data[key].find((r: any) => r.id === id)?.name || "";
  const rows = data[entity].filter(
    (r: any) =>
      (!filters.get("start") || r.date >= filters.get("start")!) &&
      (!filters.get("end") || r.date <= filters.get("end")!) &&
      (!filters.get("type") || r.type === filters.get("type")) &&
      (!filters.get("source") || r.source === filters.get("source")) &&
      (filters.get("hideRevoked") !== "true" || r.status !== "revoked") &&
      (!filters.get("q") ||
        [r.title, r.name, r.note, r.reason].some((text) =>
          text?.includes(filters.get("q")),
        )) &&
      (!filters.get("categoryId") ||
        (filters.get("categoryId") === "none"
          ? !r.categoryId
          : r.categoryId === filters.get("categoryId"))) &&
      (!filters.get("accountId") ||
        (filters.get("accountId") === "none"
          ? !r.accountId
          : r.accountId === filters.get("accountId") ||
            r.toAccountId === filters.get("accountId"))) &&
      (!filters.get("groupId") ||
        (filters.get("groupId") === "none"
          ? !r.groupId
          : r.groupId === filters.get("groupId"))),
  );
  const metadata = [
    "schemaVersion",
    "datasetId",
    "entity",
    "currency",
    "amountUnit",
    "textEncoding",
  ];
  return encodeCsv([
    [...metadata, ...csvFields[entity]],
    ...rows.map((r: any) => {
      const v = {
        ...r,
        accountName: names("accounts", r.accountId),
        toAccountName: names("accounts", r.toAccountId),
        categoryName: names("categories", r.categoryId),
        groupName: names("groups", r.groupId),
        sourceListId:
          r.sourceListId ??
          data.shopping.find((i: any) => i.id === r.sourceShoppingItemId)
            ?.listId,
      };
      return [
        2,
        data.datasetId,
        entity,
        "CNY",
        "cent",
        "apostrophe-v2",
        ...csvFields[entity].map((k) => v[k]),
      ];
    }),
  ]);
}
export function decodeFile(text: string, sourceId?: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES)
    throw new Error("单文件最多 8MB，请拆分导入");
  text = text.replace(/^\ufeff/, "");
  const records = emptyRecords(),
    warnings: string[] = [];
  let datasetId: string,
    legacy = false,
    csv = false;
  let deletedSources: { entity: Entity; sourceId: string }[] = [];
  if (text.trimStart().startsWith("{")) {
    const data = JSON.parse(text);
    if (![1, 2].includes(data.schemaVersion))
      throw new Error("仅支持 JSON v1/v2");
    legacy = data.schemaVersion === 1;
    if (!legacy && (data.currency !== "CNY" || data.amountUnit !== "cent"))
      throw new Error("仅支持 CNY 整数分");
    datasetId = legacy ? `legacy:${sourceId || ""}` : data.datasetId;
    if (data.deletedSources !== undefined) {
      if (
        !Array.isArray(data.deletedSources) ||
        data.deletedSources.length > MAX_RECORDS
      )
        throw new Error("历史删除来源格式无效");
      deletedSources = data.deletedSources.map((r: any) => {
        if (
          !r ||
          !["lists", "shopping", "drafts", "ledger"].includes(r.entity) ||
          typeof r.sourceId !== "string" ||
          !r.sourceId ||
          r.sourceId.length > 200
        )
          throw new Error("历史删除来源无效");
        return { entity: r.entity, sourceId: r.sourceId };
      });
    }
    if (legacy && !sourceId?.trim())
      throw new Error("旧格式请填写固定来源标识；同一旧库后续导出沿用该标识");
    for (const entity of entities) {
      if (data[entity] !== undefined && !Array.isArray(data[entity]))
        throw new Error(`${entity}: 必须为数组`);
      records[entity] = data[entity] || [];
    }
    if (legacy)
      warnings.push(
        "JSON v1：按真实 ID 回填来源和购买快照；未知购买信息保留待核对。",
      );
  } else {
    csv = true;
    const [header, ...rows] = parseCsv(text);
    if (new Set(header).size !== header.length) throw new Error("CSV 列名重复");
    const v2 = header.includes("schemaVersion");
    legacy = !v2;
    const decoded = rows.map((row) =>
      Object.fromEntries(
        header.map((k, i) => [
          k,
          v2 && /^'[=+\-@'\t\r\n ]/.test(row[i]) ? row[i].slice(1) : row[i],
        ]),
      ),
    );
    if (!decoded.length) throw new Error("文件没有记录");
    datasetId = v2 ? decoded[0].datasetId : `legacy:${sourceId || ""}`;
    if (!v2 && !sourceId?.trim()) throw new Error("旧格式请填写固定来源标识");
    const entity = v2 ? decoded[0].entity : "ledger";
    if (!["ledger", "savings"].includes(entity))
      throw new Error("CSV 仅支持账本和省钱本");
    const ints = new Set([
      "amount",
      "discount",
      "grossAmount",
      "planned",
      "actual",
    ]);
    for (const [index, r] of decoded.entries()) {
      if (
        v2 &&
        (r.schemaVersion !== "2" ||
          r.datasetId !== datasetId ||
          r.entity !== entity ||
          r.currency !== "CNY" ||
          r.amountUnit !== "cent" ||
          r.textEncoding !== "apostrophe-v2")
      )
        throw new Error("CSV 版本、数据集、模块、币种或转义约定不一致");
      if (
        v2 &&
        csvFields[entity as "ledger" | "savings"].some(
          (k) => !header.includes(k),
        )
      )
        throw new Error("CSV v2 缺少必需列，请使用模板");
      const value: any = v2
        ? { ...r }
        : {
            id: r.ID || `row:${index + 1}`,
            date: r["日期"],
            type: r["类型"],
            title: r["标题"],
            amount: r["金额（分）"],
            discount: r["优惠（分）"] || "0",
            note: r["备注"] || "",
          };
      if (
        !v2 &&
        !["日期", "类型", "标题", "金额（分）"].every((k) => header.includes(k))
      )
        throw new Error(
          "旧 CSV 列无法识别，请使用旧版七列格式或转换为 v2 模板",
        );
      for (const k of ints)
        if (k in value) {
          if (value[k] === "" && k !== "amount" && k !== "discount")
            value[k] = null;
          else {
            if (!/^\d+$/.test(value[k]))
              throw new Error(`${k}: CSV 金额必须为整数分`);
            value[k] = Number(value[k]);
          }
        }
      for (const k of ["autoSaving", "suppressed"])
        if (k in value) {
          if (!["true", "false"].includes(value[k]))
            throw new Error(`${k}: 必须为 true/false`);
          value[k] = value[k] === "true";
        }
      for (const k of Object.keys(refs[entity as Entity] || {}))
        if (value[k] === "") value[k] = null;
      for (const k of ["orderKey", "sourceKey"])
        if (value[k] === "") value[k] = null;
      records[entity as Entity].push(value);
    }
    warnings.push(
      "CSV 只交换本模块；不会自动生成省钱或物品档案。外部账户/分类/分组/来源 ID 需映射或先导入 JSON。草稿关系由 JSON 恢复。",
    );
    if (legacy)
      warnings.push(
        "旧 CSV 缺失字段保持空；无 ID 时按固定来源标识和行号去重，请勿重排后冒充同一旧文件。旧防公式前缀按原文保留。",
      );
  }
  if (
    typeof datasetId !== "string" ||
    !datasetId.trim() ||
    datasetId.length > 200
  )
    throw new Error("来源数据集 ID 无效");
  if (
    Object.values(records).reduce((n, rows) => n + rows.length, 0) > MAX_RECORDS
  )
    throw new Error("单文件最多 10000 条记录，请拆分导入");
  for (const e of entities) {
    records[e] = records[e].map((r) => normalizeRow(e, r, warnings));
    if (new Set(records[e].map((r) => r.id)).size !== records[e].length)
      throw new Error(`${e}: 源 ID 重复`);
  }
  if (legacy && !csv) upgradeLegacy(records, warnings);
  if (
    Object.values(records).reduce((n, rows) => n + rows.length, 0) > MAX_RECORDS
  )
    throw new Error("兼容回填后的记录超过 10000 条，请拆分导入");
  return { datasetId, records, warnings, legacy, csv, deletedSources };
}
export function upgradeLegacy(records: Records, warnings: string[]) {
  const linkCounts = new Map<string, number>();
  for (const item of records.shopping)
    if (item.ledgerId)
      linkCounts.set(item.ledgerId, (linkCounts.get(item.ledgerId) || 0) + 1);
  for (const item of records.shopping) {
    const entry = records.ledger.find(
      (e) => e.id === item.ledgerId && e.type === "expense",
    );
    if (entry) {
      Object.assign(item, {
        purchaseAmount: entry.amount,
        purchasedAt: entry.date,
        purchaseAccountId: entry.accountId,
        purchaseDiscount: entry.discount,
        purchaseDiscountDetails: entry.discountDetails,
        categoryId: item.categoryId || entry.categoryId,
        purchaseRevision: 1,
        purchaseNeedsReview: false,
      });
      if (linkCounts.get(entry.id) === 1) entry.sourceShoppingItemId = item.id;
      else {
        item.ledgerId = null;
        entry.sourceShoppingItemId = null;
        item.purchaseNeedsReview = true;
        warnings.push(
          `购物项 ${item.name} 的多重账单链接已解除，保留快照待核对`,
        );
      }
    } else if (item.status === "purchased") {
      item.ledgerId = null;
      item.purchaseNeedsReview = true;
      const asset = records.items.find((i) => i.id === item.ownedItemId);
      if (asset) {
        item.purchaseAmount ??= asset.price;
        item.purchasedAt ??= asset.purchaseDate;
      }
      warnings.push(`已购项 ${item.name} 缺少有效账单，保留已购事实并标待核对`);
    }
    const hasSaving = records.savings.some((s) => s.shoppingItemId === item.id);
    if (entry || hasSaving) {
      let group = records.groups.find((g) => g.sourceListId === item.listId);
      if (!group) {
        const list = records.lists.find((l) => l.id === item.listId);
        if (list) {
          group = normalizeRow(
            "groups",
            {
              id: `list-group:${list.id}`,
              name: list.name,
              sourceListId: list.id,
            },
            warnings,
          );
          records.groups.push(group);
        }
      }
      if (group && entry?.sourceShoppingItemId === item.id)
        entry.groupId ??= group.id;
    }
  }
  for (const entry of records.ledger)
    if (entry.refundOfId)
      entry.groupId ??= records.ledger.find(
        (e) => e.id === entry.refundOfId,
      )?.groupId;
  for (const s of records.savings) {
    s.shoppingItemId ??=
      records.ledger.find((e) => e.id === s.ledgerId)?.sourceShoppingItemId ??
      null;
    s.sourceListId ??=
      records.shopping.find((i) => i.id === s.shoppingItemId)?.listId ?? null;
    s.groupId ??=
      records.groups.find((g) => g.sourceListId === s.sourceListId)?.id ?? null;
  }
}
