import { beforeAll, afterAll } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { installLocalDatabase } from "../src/server/db";
for (const key of ["AI_API_KEY", "AI_BASE_URL", "AI_TEXT_MODEL", "AI_VISION_MODEL"]) process.env[key] = "";
process.env.AI_REQUIRE_INVITE = "false";
const testRoot = path.resolve("data/d1-tests", randomUUID());
process.env.WRANGLER_REGISTRY_PATH = path.join(testRoot, "registry");
process.env.MINIFLARE_REGISTRY_PATH = process.env.WRANGLER_REGISTRY_PATH;
process.env.XDG_CONFIG_HOME = path.resolve("data/wrangler-xdg-config");
process.env.XDG_CACHE_HOME = path.resolve("data/wrangler-xdg-cache");
let proxy: any;
beforeAll(async () => {
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  process.env.WRANGLER_SEND_METRICS = "false";
  process.env.WRANGLER_LOG_PATH = "data/wrangler-logs";
  const { getPlatformProxy } = await import("wrangler");
  proxy = await getPlatformProxy({ configPath: "wrangler.db-test.jsonc", remoteBindings: false, persist: { path: testRoot } });
  const files = (await readdir("d1/migrations")).filter(file => file.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await readFile(`d1/migrations/${file}`, "utf8");
    for (const statement of migration.split(";").filter(s => s.trim())) await proxy.env.DB.prepare(statement).run();
  }
  installLocalDatabase(proxy.env.DB);
}, 60000);
afterAll(async () => { await proxy?.dispose(); });
