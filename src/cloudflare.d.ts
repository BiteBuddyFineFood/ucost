import type { D1Database } from "@cloudflare/workers-types";
import type { Fetcher } from "@cloudflare/workers-types";
declare global {
  interface CloudflareEnv { DB: D1Database }
  interface CloudflareEnv { AI_TRANSPORT?: Fetcher }
}
export {};
