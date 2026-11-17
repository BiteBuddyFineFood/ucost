import { getCloudflareContext } from "@opennextjs/cloudflare";

export function setting(name: string): string {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    return typeof env[name] === "string" ? env[name] as string : "";
  } catch {
    // Dynamic lookup avoids Next inlining legacy .env values into server code.
    return process.env[name] || "";
  }
}
