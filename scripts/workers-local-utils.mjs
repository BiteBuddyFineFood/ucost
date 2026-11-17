import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const requiredWorkerArtifacts = [
  ".open-next/worker.js",
  ".open-next/.build/durable-objects/queue.js",
  ".open-next/.build/durable-objects/sharded-tag-cache.js",
  ".open-next/.build/durable-objects/bucket-cache-purge.js",
];

export function configureLocalWranglerPaths() {
  const dataDir = path.resolve("data");
  process.env.WRANGLER_REGISTRY_PATH = path.join(dataDir, "wrangler-registry");
  process.env.MINIFLARE_REGISTRY_PATH = process.env.WRANGLER_REGISTRY_PATH;
  process.env.XDG_CONFIG_HOME = path.join(dataDir, "wrangler-xdg-config");
  process.env.XDG_CACHE_HOME = path.join(dataDir, "wrangler-xdg-cache");
}

export function findMissingWorkerArtifacts() {
  return requiredWorkerArtifacts.filter(artifact => !fs.existsSync(path.resolve(artifact)));
}

export function assertWorkerArtifacts() {
  const missing = findMissingWorkerArtifacts();
  if (missing.length > 0) {
    throw new Error(
      `Workers build is incomplete. Missing:\n${missing.map(file => `  - ${file}`).join("\n")}\n` +
        "Run `npm.cmd run build:workers` after stopping any existing local preview.",
    );
  }
}

export async function isPortListening(port, host = "127.0.0.1") {
  return await new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = listening => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(750);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function assertPortAvailable(port, purpose) {
  if (await isPortListening(port)) {
    throw new Error(
      `Port ${port} is already in use${purpose ? ` (${purpose})` : ""}.\n` +
        `Stop the existing local preview before continuing. If it is running in another terminal, ` +
        `press Ctrl+C there and retry.`,
    );
  }
}
