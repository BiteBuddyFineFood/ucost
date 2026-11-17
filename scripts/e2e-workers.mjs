import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureLocalWranglerPaths } from "./workers-local-utils.mjs";

configureLocalWranglerPaths();
async function stopLocalWorker(child) {
  if (!child || child.exitCode != null) return;
  child.stdin.end();
  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
const state = `data/d1-e2e/${randomUUID()}`;
const registry = path.resolve(state, "registry");
process.env.WRANGLER_REGISTRY_PATH = registry;
process.env.MINIFLARE_REGISTRY_PATH = registry;
await mkdir(state, { recursive: true });
const env = { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", WRANGLER_LOG_PATH: "data/wrangler-logs",
  WRANGLER_SEND_METRICS: "false", UCOST_LOCAL_CONFIG: "wrangler.e2e.jsonc", UCOST_LOCAL_STATE: state,
  SEED_PASSWORD: `Fixture-${randomUUID()}`, E2E_BASE_URL: "http://localhost:8788", E2E_EVIDENCE_DIR: state + "/evidence" };
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${file} exited ${result.status}`);
}
const wrangler = "node_modules/wrangler/bin/wrangler.js";
run(wrangler, ["d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.e2e.jsonc", "--persist-to", state]);
run("node_modules/tsx/dist/cli.mjs", ["scripts/local-tool.ts", "seed"]);
const stub = spawn(process.execPath, [wrangler, "dev", "--local", "--config", "wrangler.ai-stub.jsonc", "--port", "8790"], { env, stdio: ["pipe", "pipe", "pipe"] });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch("http://localhost:8790/health")).ok) break; } catch {}
  if (stub.exitCode != null) throw new Error("Local AI fixture failed to start");
  await new Promise(resolve => setTimeout(resolve, 300));
}
const server = spawn(process.execPath, [wrangler, "dev", "--local", "--config", "wrangler.e2e.jsonc", "--port", "8788", "--persist-to", state], { env, stdio: ["pipe", "pipe", "pipe"] });
let output = "";
for (const stream of [server.stdout, server.stderr, stub.stdout, stub.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-15000); });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${env.E2E_BASE_URL}/api/platform`)).ok) { ready = true; break; } } catch {}
    if (server.exitCode != null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Local Workers startup failed: " + output);
  try { run("node_modules/@playwright/test/cli.js", ["test", ...process.argv.slice(2)]); }
  catch (error) { console.error(output); throw error; }
  await mkdir("data/cloudflare-verification", { recursive: true });
  await writeFile("data/cloudflare-verification/e2e.json", JSON.stringify({ date: new Date().toISOString(), state, baseURL: env.E2E_BASE_URL, result: "passed", ai: "deterministic local service binding" }, null, 2));
} finally {
  await Promise.all([stopLocalWorker(server), stopLocalWorker(stub)]);
}
