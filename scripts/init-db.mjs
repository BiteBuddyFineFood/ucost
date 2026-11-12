import { mkdir, open } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
process.loadEnvFile?.(".env");
const databaseUrl = process.env.DATABASE_URL || "file:../data/ucost.db";
if (!databaseUrl.startsWith("file:"))
  throw new Error("本地初始化仅支持 SQLite file: URL");
const file = path.resolve("prisma", databaseUrl.slice(5));
await mkdir(path.dirname(file), { recursive: true });
try {
  const handle = await open(file, "wx");
  await handle.close();
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
