import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { db, writeBatch } from "./db";
import { reserveQuota } from "./store";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { setting } from "./environment";
import { inviteAccess } from "./invites";
import { localDate } from "@/lib/domain";

type Provider = {
  mode: string;
  base: string;
  key: string;
  textModel: string;
  visionModel: string;
};
const context = new AsyncLocalStorage<{
  provider: Provider;
  signal: AbortSignal;
  calls: number;
  taskId: string;
  leaseId: string;
}>();
function encryptionKey() {
  const key = setting("AI_CONFIG_ENCRYPTION_KEY");
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new Error("服务端尚未配置个人 AI 的加密主密钥");
  return Buffer.from(key, "hex");
}
function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    encrypted.toString("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}
function decrypt(value: string) {
  const [version, iv, data, tag] = value.split(":");
  if (version !== "v1") throw new Error("个人 AI 配置加密版本不可用");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Only global unicast IPv6; excludes mapped IPv4, loopback, link local and ULA.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !address.toLowerCase().startsWith("2001:db8:")
  );
}
async function destination(base: string) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("接口地址不能包含凭据、查询参数或片段");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:")
    throw new Error("个人 AI 地址必须使用 HTTPS");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || (isIP(hostname) && !publicAddress(hostname)))
    throw new Error("AI 地址不能访问内网、回环或元数据服务");
  const allowed = (setting("AI_ALLOWED_ORIGINS") || "https://api.openai.com,https://api.deepseek.com")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(url.origin))
    throw new Error("AI 地址未在服务端可信服务列表中，请联系部署者添加 HTTPS origin");
  return { url };
}

export async function aiConfig(ownerId: string) {
  await requireInviteForAi(ownerId);
  const config = await db.userAiConfig.first({ where: { ownerId } });
  return config
    ? {
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        textModel: config.textModel,
        visionModel: config.visionModel,
        hasKey: !!config.encryptedKey,
        version: config.version,
      }
    : {
        enabled: false,
        baseUrl: "",
        textModel: "",
        visionModel: "",
        hasKey: false,
        version: 0,
      };
}
export async function saveAiConfig(ownerId: string, input: unknown) {
  await requireInviteForAi(ownerId);
  const body = z
    .object({
      enabled: z.boolean(),
      baseUrl: z.string().max(2000),
      key: z.string().max(1000).optional(),
      textModel: z.string().max(200),
      visionModel: z.string().max(200).default(""),
      version: z.number().int(),
    })
    .parse(input);
  if (body.enabled) {
    await destination(body.baseUrl);
    if (!body.textModel.trim()) throw new Error("请填写文本模型");
  }
  await writeBatch(async (tx) => {
    const previous = await tx.userAiConfig.first({ where: { ownerId } });
    if ((previous?.version ?? 0) !== body.version)
      throw new Error("AI 配置已更新，请刷新");
    const encryptedKey = body.key
      ? encrypt(body.key)
      : (previous?.encryptedKey ?? "");
    if (body.enabled && !encryptedKey) throw new Error("请填写个人服务密钥");
    const data = {
      enabled: body.enabled,
      baseUrl: body.baseUrl,
      textModel: body.textModel,
      visionModel: body.visionModel,
      encryptedKey,
    };
    await tx.userAiConfig.put({
      where: { ownerId },
      create: { ...data, ownerId },
      update: { ...data, version: { increment: 1 } },
    });
  });
  return aiConfig(ownerId);
}
async function provider(ownerId: string): Promise<Provider> {
  const personal = await db.userAiConfig.first({ where: { ownerId } });
  if (personal?.enabled)
    return {
      mode: "personal",
      base: personal.baseUrl,
      key: decrypt(personal.encryptedKey),
      textModel: personal.textModel,
      visionModel: personal.visionModel,
    };
  if (
    !setting("AI_API_KEY") ||
    !setting("AI_BASE_URL") ||
    !setting("AI_TEXT_MODEL")
  )
    throw new Error(
      "AI 服务暂不可用，请配置系统服务或启用个人配置；仍可暂存与手动整理",
    );
  return {
    mode: "system",
    base: setting("AI_BASE_URL"),
    key: setting("AI_API_KEY"),
    textModel: setting("AI_TEXT_MODEL"),
    visionModel: setting("AI_VISION_MODEL"),
  };
}

async function expireTasks(ownerId: string) {
  await writeBatch(async (tx) => {
    const unlimited = !!(await inviteAccess(tx, ownerId));
    const expired = await tx.aiTask.list({
      where: { ownerId, status: { in: ["running", "paused"] }, leaseUntil: { lt: new Date() } },
    });
    for (const task of expired) {
      const progress = JSON.parse(task.result || "null");
      const hasUsableResult =
        Array.isArray(progress?.steps || progress?.results) &&
        (progress.steps || progress.results).some((step: any) => Number(step.count) > 0);
      const claimed = await tx.aiTask.changeAll({
        where: { id: task.id, status: task.status, leaseId: task.leaseId },
        data: { status: "failed", error: "任务超时，请创建新任务" },
      });
      if (claimed.count && task.providerMode === "system" && !unlimited)
        await tx.aiDailyUsage.change({
          where: { ownerId_quotaDate: { ownerId, quotaDate: task.quotaDate } },
          data: {
            reserved: { decrement: 1 },
            used: { increment: hasUsableResult ? 1 : 0 },
          },
        });
    }
  });
}
export async function aiUsage(ownerId: string) {
  await expireTasks(ownerId);
  const quotaDate = localDate(),
    config = await db.userAiConfig.first({ where: { ownerId } }),
    redemption = await inviteAccess(db, ownerId);
  const gateOpen = setting("AI_REQUIRE_INVITE") === "false";
  const usage = await db.aiDailyUsage.first({
    where: { ownerId_quotaDate: { ownerId, quotaDate } },
  });
  const unlimited = !!redemption;
  const allowed = unlimited || gateOpen;
  return {
    allowed,
    configured:
      !!config?.enabled ||
      !!(
        setting("AI_API_KEY") &&
        setting("AI_BASE_URL") &&
        setting("AI_TEXT_MODEL")
      ),
    providerMode: config?.enabled ? "personal" : "system",
    unlimited,
    inviteCode: redemption?.code ?? null,
    limit: unlimited ? null : 10,
    used: usage?.used ?? 0,
    reserved: usage?.reserved ?? 0,
    remaining: unlimited
      ? null
      : Math.max(0, 10 - (usage?.used ?? 0) - (usage?.reserved ?? 0)),
    quotaDate,
    resetsAt: new Date(
      Date.parse(`${quotaDate}T00:00:00+08:00`) + 86400000,
    ).toISOString(),
  };
}

export async function requireInviteForAi(ownerId: string) {
  if (setting("AI_REQUIRE_INVITE") === "false") return;
  if (!(await inviteAccess(db, ownerId)))
    throw new Error("未绑定邀请码，暂不能使用 AI；请在设置中填写邀请码");
}

export async function runAiTask<T>(
  ownerId: string,
  kind: string,
  operationId: unknown,
  input: unknown,
  action: () => Promise<T>,
  usable: (result: T) => boolean = () => true,
): Promise<T> {
  await requireInviteForAi(ownerId);
  const op = z
    .string()
    .min(1)
    .max(200)
    .parse(operationId ?? randomUUID());
  const serialized = JSON.stringify(input);
  if (serialized.length > 150000) throw new Error("AI 任务输入过长，请拆分");
  await expireTasks(ownerId);
  const existing = await db.aiTask.first({
    where: { ownerId_operationId: { ownerId, operationId: op } },
  });
  if (existing) {
    if (existing.kind !== kind || existing.input !== serialized)
      throw new Error("任务输入已固定，不能追加或更改，请创建新任务");
    if (existing.expiresAt.getTime() < Date.now())
      throw new Error("AI 任务已过期，请创建新任务");
    if (existing.status === "succeeded") return JSON.parse(existing.result);
    if (!(kind === "process" && existing.status === "paused")) throw new Error(
      existing.status === "running"
        ? "AI 任务正在执行，请稍后读取进度"
        : existing.error || "任务失败，请创建新任务重试",
    );
  }
  const selected = await provider(ownerId),
    quotaDate = existing?.quotaDate || localDate(),
    leaseId = randomUUID();
  const task = await writeBatch(
    async (tx) => {
      if (existing?.status === "paused") {
        if (selected.mode !== existing.providerMode) throw new Error("AI 服务模式已更改，请创建新任务");
        const claim = await tx.aiTask.changeAll({
          where: { id: existing.id, status: "paused", leaseId: existing.leaseId },
          data: { status: "running", leaseId, leaseUntil: new Date(Date.now() + 110000) },
        });
        if (!claim.count) throw new Error("AI 任务正在执行，请稍后读取进度");
        return tx.aiTask.require({ where: { id: existing.id } });
      }
      const recent = await tx.aiTask.count({
        where: { ownerId, createdAt: { gt: new Date(Date.now() - 60000) } },
      });
      if (recent >= 30) throw new Error("AI 请求过于频繁，请稍后重试");
      if (
        kind === "connectionTest" &&
        (await tx.aiTask.count({
          where: {
            ownerId,
            kind,
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
        })) >= 5
      )
        throw new Error("连接测试过于频繁，请一分钟后再试");
      if (
        (await tx.aiTask.count({ where: { ownerId, status: "running" } })) >= 2
      )
        throw new Error("已有两个 AI 任务执行中，请稍后再试");
      if (selected.mode === "system") {
        if (!(await inviteAccess(tx, ownerId))) {
          await tx.aiDailyUsage.put({
            where: { ownerId_quotaDate: { ownerId, quotaDate } },
            create: { ownerId, quotaDate },
            update: {},
          });
          const reserved =
            await reserveQuota(tx, ownerId, quotaDate);
          if (!reserved)
            throw new Error(
              "今日系统 AI 额度已用完，上海时间明日 00:00 重置；仍可暂存和手动整理",
            );
        }
      }
      return tx.aiTask.insert({
        data: {
          ownerId,
          operationId: op,
          kind,
          providerMode: selected.mode,
          quotaDate,
          input: serialized,
          leaseId,
          leaseUntil: new Date(Date.now() + 110000),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    },
    { maxWait: 10000, timeout: 15000 },
  );
  const state = {
    provider: selected,
    signal: AbortSignal.timeout(100000),
    calls: existing?.status === "paused" && JSON.parse(existing.result)?.results?.some((r: any) => r.count > 0) ? 1 : 0,
    taskId: task.id,
    leaseId,
  };
  async function finish(result: T | null, error?: string) {
    const paused = !error && kind === "process" && (result as any)?.remaining?.length > 0;
    await writeBatch(async (tx) => {
      const claim = await tx.aiTask.changeAll({
        where: {
          id: task.id,
          status: "running",
          leaseId,
          leaseUntil: { gt: new Date() },
        },
        data: {
          status: error ? "failed" : paused ? "paused" : "succeeded",
          error,
          result: JSON.stringify(result),
          ...(paused ? { leaseUntil: new Date(Date.now() + 180000) } : {}),
        },
      });
      if (!claim.count) throw new Error("AI 任务执行租约已失效，结果未应用");
      if (
        selected.mode === "system" &&
        !paused &&
        !(await inviteAccess(tx, ownerId))
      )
        await tx.aiDailyUsage.change({
          where: { ownerId_quotaDate: { ownerId, quotaDate } },
          data: {
            reserved: { decrement: 1 },
            used: {
              increment:
                !error && state.calls > 0 && result != null && usable(result)
                  ? 1
                  : 0,
            },
          },
        });
    });
  }
  try {
    const result = await context.run(state, action);
    await finish(
      result,
      usable(result) || (kind === "process" && (result as any)?.remaining?.length > 0)
        ? undefined
        : "未产生可用结果，已释放额度；可创建新任务重试",
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 任务失败";
    await finish(null, message);
    throw error;
  }
}

export function aiCredentials() {
  const state = context.getStore();
  if (!state) throw new Error("AI 调用必须通过统一任务入口");
  return state.provider;
}
export function assertAiLease() {
  const state = context.getStore();
  if (!state) throw new Error("缺少 AI 任务上下文");
  state.signal.throwIfAborted();
}
export async function saveAiProgress(result: unknown) {
  const state = context.getStore();
  assertAiLease();
  const saved = await db.aiTask.changeAll({
    where: {
      id: state!.taskId,
      leaseId: state!.leaseId,
      status: "running",
      leaseUntil: { gt: new Date() },
    },
    data: { result: JSON.stringify(result) },
  });
  if (!saved.count) throw new Error("AI 任务执行租约已失效");
}
export async function aiFetch(body: unknown): Promise<Response> {
  const state = context.getStore();
  if (!state) throw new Error("AI 调用必须通过统一任务入口");
  state.signal.throwIfAborted();
  state.calls++;
  const { provider: p } = state;
  const { url } = await destination(p.base);
  // An optional deployer-controlled service transport allows deterministic local
  // integration tests without replacing validation, task accounting or parsing.
  let transport: typeof fetch = fetch;
  try {
    const service = (await getCloudflareContext({ async: true })).env.AI_TRANSPORT;
    if (service) transport = ((url: any, options: any) => service.fetch(new Request(url, options) as any)) as unknown as typeof fetch;
  } catch { /* Node unit tests have no Workers request context. */ }
  const response = await transport(`${url.href.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: state.signal,
      redirect: "manual",
    });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("AI 地址不允许重定向，请使用最终可信接口地址");
  }
  return response;
}

export async function aiTaskStatus(ownerId: string, taskId: string) {
  await expireTasks(ownerId);
  const task = await db.aiTask.first({
    where: { ownerId, OR: [{ id: taskId }, { operationId: taskId }] },
  });
  if (!task) throw new Error("任务不存在或无权访问");
  return {
    id: task.id,
    kind: task.kind,
    status: task.status,
    result: JSON.parse(task.result),
    error: task.error,
    expiresAt: task.expiresAt,
  };
}

export async function testPersonalConfig(ownerId: string) {
  await requireInviteForAi(ownerId);
  const selected = await provider(ownerId);
  if (selected.mode !== "personal")
    return { ok: !!(await aiUsage(ownerId)).configured, inference: false };
  // A separate task kind enforces the same persistent rate and concurrency limits; personal tasks never consume system quota.
  return runAiTask(ownerId, "connectionTest", randomUUID(), {}, async () => {
    const { callAI } = await import("./ai");
    const result = await callAI('仅输出 JSON {"ok":true}', "连接测试");
    if (result?.ok !== true) throw new Error("个人服务没有返回有效测试结果");
    return { ok: true, inference: true };
  });
}
