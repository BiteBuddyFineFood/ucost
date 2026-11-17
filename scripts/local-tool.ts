// Explicit local D1 only. No account, token or remote execution is involved.
import { installLocalDatabase } from "../src/server/db";
process.env.UCOST_LOCAL_TOOL = "true";
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.WRANGLER_REGISTRY_PATH = "data/wrangler-registry";
process.env.MINIFLARE_REGISTRY_PATH = process.env.WRANGLER_REGISTRY_PATH;
process.env.XDG_CONFIG_HOME = "data/wrangler-xdg-config";
process.env.XDG_CACHE_HOME = "data/wrangler-xdg-cache";
process.env.WRANGLER_LOG_PATH = "data/wrangler-logs";
process.env.WRANGLER_SEND_METRICS = "false";
async function main() {
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy({ configPath: process.env.UCOST_LOCAL_CONFIG || "wrangler.jsonc",
    persist: process.env.UCOST_LOCAL_STATE ? { path: process.env.UCOST_LOCAL_STATE + "/v3" } : true,
    remoteBindings: false });
  try {
    installLocalDatabase(proxy.env.DB as any);
    if (process.argv[2] !== "seed") throw new Error("Supported local tool: seed");
    // Seed exports a promise so this tool keeps the binding alive until done.
    await (await import("../prisma/seed")).seed;
  } finally { await proxy.dispose(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
