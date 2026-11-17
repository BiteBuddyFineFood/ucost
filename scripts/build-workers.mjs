import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  assertPortAvailable,
  assertWorkerArtifacts,
  configureLocalWranglerPaths,
} from "./workers-local-utils.mjs";

configureLocalWranglerPaths();
await assertPortAvailable(8787, "the local Workers preview");

const originalWrite = fs.writeFileSync;
const originalCopy = fs.copyFileSync;
fs.copyFileSync = (source, target, ...options) => {
  const output = String(target).replaceAll("\\", "/");
  if (output.includes("/.open-next/") && /^\.env(?:\.|$)/.test(path.basename(output)))
    return originalWrite(target, "# Runtime configuration is provided through Workers bindings.\n");
  return originalCopy(source, target, ...options);
};
fs.writeFileSync = (target, data, ...options) => {
  // Filter OpenNext's env compilation before any secret reaches its artifact.
  if (String(target).replaceAll("\\", "/").endsWith("/.open-next/cloudflare/next-env.mjs"))
    data = "export const production = {};\nexport const development = {};\nexport const test = {};\n";
  return originalWrite(target, data, ...options);
};
syncBuiltinESMExports();

// OpenNext copies traced dependencies using directory symlinks. Windows junctions
// provide the same links without requiring Developer Mode or administrator access.
if (process.platform === "win32") {
  const original = fs.symlinkSync;
  fs.symlinkSync = (target, destination, type) =>
    original(target, destination, fs.statSync(target).isDirectory() ? "junction" : type);
  syncBuiltinESMExports();
}
process.env.WRANGLER_LOG_PATH = "data/wrangler-logs";
process.env.WRANGLER_SEND_METRICS = "false";
process.argv = [process.argv[0], "opennextjs-cloudflare", "build", ...process.argv.slice(2)];
await import(pathToFileURL(path.resolve("node_modules/@opennextjs/cloudflare/dist/cli/index.js")));
assertWorkerArtifacts();
