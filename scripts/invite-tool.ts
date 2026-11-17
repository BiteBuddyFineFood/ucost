// Local-only invite code management. The same persisted D1 used by preview.
import { installLocalDatabase } from "../src/server/db";
process.env.UCOST_LOCAL_TOOL = "true";
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.WRANGLER_REGISTRY_PATH = "data/wrangler-registry";
process.env.MINIFLARE_REGISTRY_PATH = process.env.WRANGLER_REGISTRY_PATH;
process.env.XDG_CONFIG_HOME = "data/wrangler-xdg-config";
process.env.XDG_CACHE_HOME = "data/wrangler-xdg-cache";
process.env.WRANGLER_LOG_PATH = "data/wrangler-logs";
process.env.WRANGLER_SEND_METRICS = "false";

function option(args: string[], name: string, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
}

function table(rows: { code: string; used: string; status: string; note: string }[]) {
  if (!rows.length) return "暂无邀请码。使用 npm run invite:new 创建。";
  const widths = [12, 9, 8];
  return [
    ["邀请码".padEnd(widths[0]), "已绑定".padEnd(widths[1]), "状态".padEnd(widths[2]), "备注"].join("  "),
    ["-".repeat(widths[0]), "-".repeat(widths[1]), "-".repeat(widths[2]), "-".repeat(12)].join("  "),
    ...rows.map((row) =>
      [row.code.padEnd(widths[0]), row.used.padEnd(widths[1]), row.status.padEnd(widths[2]), row.note].join("  "),
    ),
  ].join("\n");
}

async function main() {
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy({
    configPath: process.env.UCOST_LOCAL_CONFIG || "wrangler.jsonc",
    persist: process.env.UCOST_LOCAL_STATE ? { path: process.env.UCOST_LOCAL_STATE + "/v3" } : true,
    remoteBindings: false,
  });
  try {
    installLocalDatabase(proxy.env.DB as any);
    const { db } = await import("../src/server/db");
    const { DEFAULT_INVITE_LIMIT, generateInviteCode, normalizeInviteCode } = await import("../src/server/invites");
    const [command = "new", ...args] = process.argv.slice(2);

    if (command === "list") {
      const invites = await db.inviteCode.list({ orderBy: { createdAt: "desc" } });
      console.log(table(invites.map((invite) => ({
        code: invite.code,
        used: `${invite.usedCount}/${invite.maxUses}`,
        status: invite.disabled ? "已停用" : invite.usedCount >= invite.maxUses ? "已满" : "可用",
        note: invite.note,
      }))));
      return;
    }

    if (command === "disable" || command === "enable") {
      const code = normalizeInviteCode(args[0] || "");
      if (!code) throw new Error("请提供邀请码");
      const invite = await db.inviteCode.first({ where: { code } });
      if (!invite) throw new Error(`邀请码不存在：${code}`);
      await db.inviteCode.change({ where: { id: invite.id }, data: { disabled: command === "disable" } });
      console.log(`${code} 已${command === "disable" ? "停用" : "启用"}`);
      return;
    }

    if (command !== "new") throw new Error("支持的命令：new、list、disable、enable");
    const maxUses = Number(option(args, "--max", String(DEFAULT_INVITE_LIMIT)));
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)
      throw new Error("--max 需为 1–1000 的整数");
    const note = option(args, "--note", "");
    const requested = option(args, "--code", "");
    const code = requested ? normalizeInviteCode(requested) : generateInviteCode();
    if (await db.inviteCode.first({ where: { code } }))
      throw new Error(`邀请码已存在：${code}`);
    const invite = await db.inviteCode.insert({ data: { code, maxUses, note } });
    console.log(`已创建邀请码：${invite.code}`);
    console.log(`可绑定用户：${invite.maxUses} 人${invite.note ? ` · ${invite.note}` : ""}`);
  } finally {
    await proxy.dispose();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
