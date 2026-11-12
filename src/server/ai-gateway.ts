import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { z } from "zod";
import { db, writeTransaction } from "./db";
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
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY;
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
  const localAllowed =
    process.env.AI_ALLOW_LOCAL_ENDPOINTS === "true" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (url.protocol !== "https:" && !(localAllowed && url.protocol === "http:"))
    throw new Error("个人 AI 地址必须使用 HTTPS");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    (!localAllowed && addresses.some((a) => !publicAddress(a.address)))
  )
    throw new Error("AI 地址不能访问内网、回环或元数据服务");
  return { url, address: addresses[0] };
}

export async function aiConfig(ownerId: string) {
  const config = await db.userAiConfig.findUnique({ where: { ownerId } });
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
  await writeTransaction(async (tx) => {
    const previous = await tx.userAiConfig.findUnique({ where: { ownerId } });
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
    await tx.userAiConfig.upsert({
      where: { ownerId },
      create: { ...data, ownerId },
      update: { ...data, version: { increment: 1 } },
    });
  });
  return aiConfig(ownerId);
}
async function provider(ownerId: string): Promise<Provider> {
  const personal = await db.userAiConfig.findUnique({ where: { ownerId } });
  if (personal?.enabled)
    return {
      mode: "personal",
      base: personal.baseUrl,
      key: decrypt(personal.encryptedKey),
      textModel: personal.textModel,
      visionModel: personal.visionModel,
    };
  if (
    !process.env.AI_API_KEY ||
    !process.env.AI_BASE_URL ||
    !process.env.AI_TEXT_MODEL
  )
    throw new Error(
      "AI 服务暂不可用，请配置系统服务或启用个人配置；仍可暂存与手动整理",
    );
  return {
    mode: "system",
    base: process.env.AI_BASE_URL,
    key: process.env.AI_API_KEY,
    textModel: process.env.AI_TEXT_MODEL,
    visionModel: process.env.AI_VISION_MODEL || "",
  };
}

async function expireTasks(ownerId: string) {
  await writeTransaction(async (tx) => {
    const expired = await tx.aiTask.findMany({
      where: { ownerId, status: "running", leaseUntil: { lt: new Date() } },
    });
    for (const task of expired) {
      const progress = JSON.parse(task.result || "null");
      const hasUsableResult =
        Array.isArray(progress?.steps) &&
        progress.steps.some((step: any) => Number(step.count) > 0);
      const claimed = await tx.aiTask.updateMany({
        where: { id: task.id, status: "running", leaseId: task.leaseId },
        data: { status: "failed", error: "任务超时，请创建新任务" },
      });
      if (claimed.count && task.providerMode === "system")
        await tx.aiDailyUsage.update({
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
    config = await db.userAiConfig.findUnique({ where: { ownerId } });
  const usage = await db.aiDailyUsage.findUnique({
    where: { ownerId_quotaDate: { ownerId, quotaDate } },
  });
  return {
    configured:
      !!config?.enabled ||
      !!(
        process.env.AI_API_KEY &&
        process.env.AI_BASE_URL &&
        process.env.AI_TEXT_MODEL
      ),
    providerMode: config?.enabled ? "personal" : "system",
    limit: 10,
    used: usage?.used ?? 0,
    reserved: usage?.reserved ?? 0,
    remaining: Math.max(0, 10 - (usage?.used ?? 0) - (usage?.reserved ?? 0)),
    quotaDate,
    resetsAt: new Date(
      Date.parse(`${quotaDate}T00:00:00+08:00`) + 86400000,
    ).toISOString(),
  };
}

export async function runAiTask<T>(
  ownerId: string,
  kind: string,
  operationId: unknown,
  input: unknown,
  action: () => Promise<T>,
  usable: (result: T) => boolean = () => true,
): Promise<T> {
  const op = z
    .string()
    .min(1)
    .max(200)
    .parse(operationId ?? randomUUID());
  const serialized = JSON.stringify(input);
  if (serialized.length > 150000) throw new Error("AI 任务输入过长，请拆分");
  await expireTasks(ownerId);
  const existing = await db.aiTask.findUnique({
    where: { ownerId_operationId: { ownerId, operationId: op } },
  });
  if (existing) {
    if (existing.kind !== kind || existing.input !== serialized)
      throw new Error("任务输入已固定，不能追加或更改，请创建新任务");
    if (existing.expiresAt.getTime() < Date.now())
      throw new Error("AI 任务已过期，请创建新任务");
    if (existing.status === "succeeded") return JSON.parse(existing.result);
    throw new Error(
      existing.status === "running"
        ? "AI 任务正在执行，请稍后读取进度"
        : existing.error || "任务失败，请创建新任务重试",
    );
  }
  const selected = await provider(ownerId),
    quotaDate = localDate(),
    leaseId = randomUUID();
  const task = await writeTransaction(
    async (tx) => {
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
        await tx.aiDailyUsage.upsert({
          where: { ownerId_quotaDate: { ownerId, quotaDate } },
          create: { ownerId, quotaDate },
          update: {},
        });
        const reserved =
          await tx.$executeRaw`UPDATE "AiDailyUsage" SET "reserved" = "reserved" + 1 WHERE "ownerId" = ${ownerId} AND "quotaDate" = ${quotaDate} AND "used" + "reserved" < 10`;
        if (!reserved)
          throw new Error(
            "今日系统 AI 额度已用完，上海时间明日 00:00 重置；仍可暂存和手动整理",
          );
      }
      return tx.aiTask.create({
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
    calls: 0,
    taskId: task.id,
    leaseId,
  };
  async function finish(result: T | null, error?: string) {
    await writeTransaction(async (tx) => {
      const claim = await tx.aiTask.updateMany({
        where: {
          id: task.id,
          status: "running",
          leaseId,
          leaseUntil: { gt: new Date() },
        },
        data: {
          status: error ? "failed" : "succeeded",
          error,
          result: JSON.stringify(result),
        },
      });
      if (!claim.count) throw new Error("AI 任务执行租约已失效，结果未应用");
      if (selected.mode === "system")
        await tx.aiDailyUsage.update({
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
      usable(result)
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
  const saved = await db.aiTask.updateMany({
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
  if (p.mode === "system")
    return fetch(`${p.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: state.signal,
      redirect: "error",
    });
  // Resolve once per request, validate every address, and pin the socket to a validated IP.
  const { url, address } = await destination(p.base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${p.key}`,
          "Content-Type": "application/json",
        },
        signal: state.signal,
        lookup: (_hostname, options, callback: any) =>
          (options as any).all
            ? callback(null, [address])
            : callback(null, address.address, address.family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2_000_000) request.destroy(new Error("AI 响应超出限制"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode || 502,
            }),
          ),
        );
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

export async function aiTaskStatus(ownerId: string, taskId: string) {
  await expireTasks(ownerId);
  const task = await db.aiTask.findFirst({
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
