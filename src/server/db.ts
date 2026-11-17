import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { connectStore, planBatch, StoreConflict, type Store } from "./store";

let testBinding: D1Database | undefined;
export function installLocalDatabase(binding: D1Database) {
  if (process.env.NODE_ENV !== "test" && process.env.UCOST_LOCAL_TOOL !== "true")
    throw new Error("Explicit local binding is only available in tests/local tools");
  testBinding = binding;
}
export async function database(): Promise<D1Database> {
  if (testBinding) return testBinding;
  return (await getCloudflareContext({ async: true })).env.DB;
}
export const db = connectStore(database);
export async function writeBatch<T>(action: (tx: Store) => Promise<T>, _options?: unknown): Promise<T> {
  void _options; // Legacy timeout options do not change Workers/D1 limits.
  for (let attempt = 0; ; attempt++) {
    try {
      return await planBatch(await database(), action);
    } catch (error) {
      if (!(error instanceof StoreConflict) || attempt >= 4) throw error;
    }
  }
}
