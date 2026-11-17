import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { tables, type TableName } from "./schema";
import fields from "./fields.json";
import type { InferSelectModel } from "drizzle-orm";

type Row = Record<string, any>;
type Query = { where?: Row; orderBy?: Row | Row[]; select?: Row; take?: number; skip?: number };
type Repository<T extends Row> = {
  list(q?: Query): Promise<T[]>;
  first(q: Query): Promise<T | null>;
  require(q: Query): Promise<T>;
  count(q?: Query): Promise<number>;
  sum(q: Query & { _sum: Row }): Promise<{ _sum: Row }>;
  insert(q: { data: Partial<T> }): Promise<T>;
  insertAll(q: { data: Partial<T>[] }): Promise<{ count: number }>;
  change(q: { where: Row; data: Row }): Promise<T>;
  changeAll(q: { where?: Row; data: Row }): Promise<{ count: number }>;
  remove(q: { where: Row }): Promise<T>;
  removeAll(q?: Query): Promise<{ count: number }>;
  put(q: { where: Row; create: Partial<T>; update: Row }): Promise<T>;
};
export type Store = { [K in TableName]: Repository<InferSelectModel<(typeof tables)[K]>> };
type Snapshot = Record<TableName, Row[]>;
const names = Object.keys(tables) as TableName[];
const metadata = fields as Record<TableName, { name: string; fields: any[] }>;
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const scalar = (v: any) => v instanceof Date ? v.getTime() : v;
const same = (a: any, b: any) => scalar(a) === scalar(b);
const copy = <T>(v: T): T => structuredClone(v);

// Only UCost's repository vocabulary is supported; unknown filters fail closed.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (["OR", "AND", "NOT"].includes(key)) {
      const tests = (Array.isArray(value) ? value : [value]).map(w => matches(row, w));
      return key === "OR" ? tests.some(Boolean) : key === "AND" ? tests.every(Boolean) : !tests.some(Boolean);
    }
    if (!(key in row)) {
      if (value && typeof value === "object" && Object.keys(value).every(k => k in row)) return matches(row, value);
      throw new Error(`Unknown repository filter: ${key}`);
    }
    const actual = row[key];
    if (value == null || typeof value !== "object" || value instanceof Date) return same(actual, value);
    return Object.entries(value).every(([op, wanted]) => {
      switch (op) {
        case "equals": return same(actual, wanted);
        case "not": return !matches({ value: actual }, { value: wanted });
        case "in": return (wanted as any[]).some(v => same(actual, v));
        case "notIn": return !(wanted as any[]).some(v => same(actual, v));
        case "lt": return actual != null && scalar(actual) < scalar(wanted);
        case "lte": return actual != null && scalar(actual) <= scalar(wanted);
        case "gt": return actual != null && scalar(actual) > scalar(wanted);
        case "gte": return actual != null && scalar(actual) >= scalar(wanted);
        case "contains": return String(actual ?? "").includes(String(wanted));
        case "startsWith": return String(actual ?? "").startsWith(String(wanted));
        default: throw new Error(`Unknown repository operator: ${op}`);
      }
    });
  });
}
function decode(name: TableName, row: Row): Row {
  const result = { ...row };
  for (const f of metadata[name].fields) {
    if (result[f.name] == null) continue;
    if (f.type === "Boolean") result[f.name] = !!result[f.name];
    if (f.type === "DateTime") result[f.name] = new Date(result[f.name]);
  }
  return result;
}
const encode = (v: any): any => v instanceof Date ? v.getTime() : typeof v === "boolean" ? Number(v) : v;
function fresh(name: TableName, data: Row): Row {
  const row: Row = {};
  for (const f of metadata[name].fields) {
    if (data[f.name] !== undefined) row[f.name] = copy(data[f.name]);
    else if (f.hasDefaultValue) row[f.name] = typeof f.default === "object"
      ? f.default.name === "cuid" ? randomUUID() : new Date() : f.default;
    else if (f.isUpdatedAt) row[f.name] = new Date();
    else if (!f.isRequired) row[f.name] = null;
    else throw new Error(`${name}.${f.name}: missing required field`);
  }
  for (const key of Object.keys(data)) if (!(key in row)) throw new Error(`Unknown repository field: ${name}.${key}`);
  return decode(name, row);
}
function patch(name: TableName, row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!(key in row)) throw new Error(`Unknown repository field: ${name}.${key}`);
    row[key] = value && typeof value === "object" && !(value instanceof Date)
      ? "increment" in value ? row[key] + value.increment : "decrement" in value ? row[key] - value.decrement
        : (() => { throw new Error("Unknown repository update"); })() : copy(value);
  }
  for (const f of metadata[name].fields) if (f.isUpdatedAt) row[f.name] = new Date();
}
function repositories(snapshot: Snapshot): Store {
  const store: any = {};
  for (const name of names) {
    const rows = snapshot[name];
    const find = (q: Query = {}) => {
      const result = rows.filter(row => matches(row, q.where));
      const order = q.orderBy ? Array.isArray(q.orderBy) ? q.orderBy : [q.orderBy] : [];
      result.sort((a, b) => {
        for (const entry of order) for (const [key, direction] of Object.entries(entry)) {
          const left = scalar(a[key]), right = scalar(b[key]);
          if (left !== right) return (left < right ? -1 : 1) * (direction === "desc" ? -1 : 1);
        }
        return 0;
      });
      return result.slice(q.skip ?? 0, q.take === undefined ? undefined : (q.skip ?? 0) + q.take);
    };
    const required = (q: Query) => { const row = find(q)[0]; if (!row) throw new Error("记录不存在或已更新"); return row; };
    const project = (row: Row, q: Query) => copy(q.select ? Object.fromEntries(Object.entries(q.select).filter(([, yes]) => yes).map(([k]) => [k, row[k]])) : row);
    store[name] = {
      list: async (q: Query = {}) => find(q).map(r => project(r, q)),
      first: async (q: Query) => find(q)[0] ? project(find(q)[0], q) : null,
      require: async (q: Query) => project(required(q), q),
      count: async (q: Query = {}) => find(q).length,
      sum: async (q: Query & { _sum: Row }) => ({ _sum: Object.fromEntries(Object.keys(q._sum).map(k => {
        const values = find(q).map(r => r[k]).filter(v => v != null);
        return [k, values.length ? values.reduce((a, b) => a + b, 0) : null];
      })) }),
      insert: async ({ data }: { data: Row }) => { const row = fresh(name, data); rows.push(row); return copy(row); },
      insertAll: async ({ data }: { data: Row[] }) => { for (const d of data) rows.push(fresh(name, d)); return { count: data.length }; },
      change: async ({ where, data }: { where: Row; data: Row }) => { const row = required({ where }); patch(name, row, data); return copy(row); },
      changeAll: async ({ where, data }: { where?: Row; data: Row }) => { const selected = find({ where }); for (const row of selected) patch(name, row, data); return { count: selected.length }; },
      remove: async ({ where }: { where: Row }) => { const row = required({ where }); rows.splice(rows.indexOf(row), 1); return copy(row); },
      removeAll: async (q: Query = {}) => { const selected = find(q); for (const row of selected) rows.splice(rows.indexOf(row), 1); return { count: selected.length }; },
      put: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const row = find({ where })[0];
        if (row) { patch(name, row, update); return copy(row); }
        const added = fresh(name, create); rows.push(added); return copy(added);
      },
    };
  }
  return store;
}
export class StoreConflict extends Error {}

// Read snapshot -> pure domain plan -> ONE guarded D1 batch. D1 does not run a
// JS transaction callback. A stale revision triggers a UNIQUE failure before
// dependent writes, rolling back the complete batch rather than checking later.
export async function planBatch<T>(binding: D1Database, action: (store: Store) => Promise<T>): Promise<T> {
  // One SQL statement gives a consistent graph and uses one D1 query, avoiding
  // the free plan's per-invocation query limit on multi-step business requests.
  const columns = names.map(name => {
    const keys = metadata[name].fields.map(f => `'${f.name}',${quote(f.name)}`).join(",");
    return `(SELECT json_group_array(json_object(${keys})) FROM ${quote(metadata[name].name)}) AS ${quote(name)}`;
  });
  const snapshot = await binding.prepare(`SELECT revision,${columns.join(",")} FROM StoreRevision WHERE id=1`).first<Row>();
  if (!snapshot) throw new Error("请先执行本地 D1 初始化");
  const revision = Number(snapshot.revision);
  const before = Object.fromEntries(names.map(n => [n, JSON.parse(snapshot[n]).map((r: Row) => decode(n, r))])) as Snapshot;
  const after = copy(before);
  const result = await action(repositories(after));
  const writes: { text: string; args: any[] }[] = [];
  for (const name of names) {
    const table = quote(metadata[name].name), old = new Map(before[name].map(r => [r.id, r])), next = new Map(after[name].map(r => [r.id, r]));
    const deleted = before[name].filter(row => !next.has(row.id)).map(row => row.id);
    if (deleted.length) writes.push({ text: `DELETE FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`, args: [JSON.stringify(deleted)] });
    const inserted: Row[] = [], updated: Row[] = [];
    for (const row of after[name]) {
      const previous = old.get(row.id);
      if (previous && JSON.stringify(previous) === JSON.stringify(row)) continue;
      if (/data:image\/|(?:iVBORw0KGgo|\/9j\/|UklGR)[A-Za-z0-9+/]{64,}/i.test(JSON.stringify(row)))
        throw new Error("图片编码不能持久保存，请重新识别");
      const encoded = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encode(v)]));
      (previous ? updated : inserted).push(encoded);
    }
    // JSON input uses ONE bound parameter, below D1's 100-parameter limit, and
    // one statement per changed table rather than one statement per record.
    const keys = metadata[name].fields.map(f => f.name);
    const prefix = `INSERT INTO ${table} (${keys.map(quote).join(",")}) SELECT ${keys.map(k => `json_extract(value,'$.${k}')`).join(",")} FROM json_each(?) WHERE true`;
    if (inserted.length) writes.push({ text: prefix, args: [JSON.stringify(inserted)] });
    if (updated.length) writes.push({ text: prefix + ` ON CONFLICT(id) DO UPDATE SET ${keys.map(k => `${quote(k)}=excluded.${quote(k)}`).join(",")}`, args: [JSON.stringify(updated)] });
  }
  if (!writes.length) return result;
  if (writes.length > 45 || writes.some(w => w.args.some(a => typeof a === "string" && Buffer.byteLength(a) > 1_800_000)) || writes.reduce((n, w) => n + JSON.stringify(w).length, 0) > 8_000_000)
    throw new Error("本次原子操作超过 D1 支持上限，请拆分为更小的独立操作");
  try {
    await binding.batch([
      binding.prepare('INSERT INTO StoreRevision(id,revision) SELECT 1,0 WHERE (SELECT revision FROM StoreRevision WHERE id=1) != ?').bind(revision),
      ...writes.map(w => binding.prepare(w.text).bind(...w.args)),
      binding.prepare('UPDATE StoreRevision SET revision=revision+1 WHERE id=1'),
    ]);
  } catch (error) {
    if (/StoreRevision/.test(String(error))) throw new StoreConflict("记录已更新，请重试");
    if (/UNIQUE/.test(String(error))) throw Object.assign(new Error("名称或记录已存在，请检查后重试"), { code: "P2002" });
    throw error;
  }
  return result;
}
export function connectStore(binding: () => Promise<D1Database>): Store {
  const store: any = {};
  for (const name of names) {
    store[name] = {};
    for (const method of ["list", "first", "require", "count", "sum", "insert", "insertAll", "change", "changeAll", "remove", "removeAll", "put"]) {
      store[name][method] = async (query: any) => {
        const d1 = await binding();
        if (!["list", "first", "require", "count", "sum"].includes(method)) {
          for (let attempt = 0; ; attempt++) {
            try { return await planBatch(d1, tx => (tx[name] as any)[method](query)); }
            catch (error) {
              if (!(error instanceof StoreConflict) || attempt >= 12) throw error;
              await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 40));
            }
          }
        }
        const rows = await drizzle(d1 as any).select().from(tables[name]);
        const snapshot = Object.fromEntries(names.map(n => [n, n === name ? rows : []])) as unknown as Snapshot;
        return (repositories(snapshot)[name] as any)[method](query);
      };
    }
  }
  return store;
}
export async function reserveQuota(store: Store, ownerId: string, quotaDate: string) {
  const row = await store.aiDailyUsage.first({ where: { ownerId, quotaDate } });
  if (!row || row.used + row.reserved >= 10) return 0;
  await store.aiDailyUsage.change({ where: { id: row.id }, data: { reserved: { increment: 1 } } });
  return 1;
}
