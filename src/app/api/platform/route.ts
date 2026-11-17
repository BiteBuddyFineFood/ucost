import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import type { D1Database } from "@cloudflare/workers-types";

// Read-only health endpoint; never returns configuration or personal records.
export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const database = env.DB as D1Database;
  await database.prepare("SELECT 1").first();
  const jar = await cookies();
  const cookie = jar.get("ucost_probe")?.value === "ok";
  jar.set("ucost_probe", "ok", { httpOnly: true, sameSite: "lax", path: "/" });
  return Response.json({ runtime: "workers", database: "d1", cookie }, {
    headers: { "Cache-Control": "no-store" },
  });
}
