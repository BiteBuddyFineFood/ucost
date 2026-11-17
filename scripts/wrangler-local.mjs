import { spawn } from "node:child_process";
import {
  assertPortAvailable,
  assertWorkerArtifacts,
  configureLocalWranglerPaths,
} from "./workers-local-utils.mjs";

configureLocalWranglerPaths();
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.WRANGLER_LOG_PATH = "data/wrangler-logs";
process.env.WRANGLER_SEND_METRICS = "false";
const [command = "preview", ...args] = process.argv.slice(2);
if (args.some(arg => ["--remote", "-r", "--tunnel"].includes(arg))) throw new Error("This script is local-only");
if (command === "preview") {
  assertWorkerArtifacts();
  await assertPortAvailable(8787, "a local preview is already running");
  process.argv = [process.argv[0], "wrangler", "dev", "--local", "--port", "8787", ...args];
}
else if (command === "migrate") process.argv = [process.argv[0], "wrangler", "d1", "migrations", "apply", "DB", "--local", ...args];
else throw new Error("Only preview and migrate are supported; remote actions are intentionally excluded");
const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
