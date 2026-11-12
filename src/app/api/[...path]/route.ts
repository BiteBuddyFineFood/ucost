import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  currentUser,
  requireUser,
  register,
  login,
  createSession,
  logout,
  limitLogin,
} from "@/server/auth";
import { db } from "@/server/db";
import { mutate, owned, snapshot, vote } from "@/server/services";
import {
  analyze,
  applyDraft,
  processDrafts,
  polish,
  suggest,
} from "@/server/ai";
import {
  aiConfig,
  saveAiConfig,
  aiUsage,
  aiTaskStatus,
  testPersonalConfig,
} from "@/server/ai-gateway";
import {
  classificationPreview,
  classificationApply,
} from "@/server/classification";

import { exportData, previewImport, commitImport } from "@/server/exchange";
import { exportCsv } from "@/server/exchange-codec";

export const runtime = "nodejs";
export const maxDuration = 120;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || new URL(origin).host !== host)
    throw new Error("请求来源无效，请从当前网站发起操作");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("不允许跨站请求");
}
async function readImportBody(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("导入请求为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 18_000_000) {
      await reader.cancel();
      throw new Error("导入请求过大");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function fail(error: unknown) {
  if (error instanceof z.ZodError)
    return json(
      {
        error: error.issues
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("；"),
      },
      400,
    );
  if ((error as any)?.code === "P2002")
    return json({ error: "名称或记录已存在，请检查后重试" }, 409);
  const message = error instanceof Error ? error.message : "操作失败";
  if (/prisma|Invalid .*invocation|SQLITE|database|constraint/i.test(message))
    return json({ error: "数据操作冲突，请刷新页面后重试" }, 409);
  return json({ error: message }, message === "请先登录" ? 401 : 400);
}
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const segments = (await ctx.params).path;
    if (segments[0] === "review" && segments[1]) {
      const review = await db.reviewRequest.findUnique({
        where: { token: segments[1] },
      });
      const user = await currentUser();
      if (
        !review ||
        review.status === "revoked" ||
        (review.visibility === "private" && review.ownerId !== user?.id)
      )
        return json({ error: "分享链接已失效或无权访问" }, 404);
      const votes = await db.reviewVote.findMany({
        where: { reviewId: review.id },
        select: {
          id: true,
          username: true,
          userId: true,
          approve: true,
          comment: true,
          createdAt: true,
        },
      });
      return json({
        review: {
          title: review.title,
          description: review.description,
          info: JSON.parse(review.publicInfo),
          targetCount: review.targetCount,
          rule: review.rule,
          status: review.status,
          visibility: review.visibility,
          isOwner: user?.id === review.ownerId,
        },
        votes: votes.map((v) => ({
          ...v,
          userId: undefined,
          isMine: v.userId === user?.id,
        })),
        user: user ? { username: user.username } : null,
      });
    }
    const user = await requireUser();
    if (segments[0] === "ai" && segments[1] === "config")
      return json(await aiConfig(user.id));
    if (segments[0] === "ai" && segments[1] === "usage")
      return json(await aiUsage(user.id));
    if (segments[0] === "ai" && segments[1] === "tasks" && segments[2])
      return json(await aiTaskStatus(user.id, segments[2]));
    if (segments[0] === "state") return json(await snapshot(user));
    if (segments[0] === "attachment" && segments[1]) {
      const attachment = await owned(db, "attachment", segments[1], user.id);
      if (attachment.missing)
        throw new Error("附件未迁移，请通过完整文件备份恢复");
      const file = await readFile(
        path.join(process.cwd(), "uploads", attachment.storageKey),
      );
      return new NextResponse(file, {
        headers: {
          "Content-Type": attachment.mime,
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (segments[0] === "export") {
      const data = await exportData(user);
      const csv = req.nextUrl.searchParams.get("format") === "csv";
      const entity = req.nextUrl.searchParams.get("entity") || "ledger";
      if (csv && !["ledger", "savings"].includes(entity))
        throw new Error("CSV 模块无效");
      const filters =
        req.nextUrl.searchParams.get("scope") === "filtered"
          ? req.nextUrl.searchParams
          : new URLSearchParams();
      return new NextResponse(
        csv
          ? exportCsv(data, entity as "ledger" | "savings", filters)
          : JSON.stringify(data, null, 2),
        {
          headers: {
            "Content-Type": csv
              ? "text/csv;charset=utf-8"
              : "application/json;charset=utf-8",
            "Content-Disposition":
              'attachment; filename="ucost-' +
              (csv ? entity + "-v2.csv" : "v2.json") +
              '"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    checkOrigin(req);
    const segments = (await ctx.params).path;
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 18_000_000)
      throw new Error("请求过大，最多上传 3 张、每张 5MB 的图片");
    if (segments[0] === "auth") {
      if (segments[1] === "logout") {
        await logout();
        return json({ ok: true });
      }
      const body = z
        .object({ username: z.string().max(40), password: z.string().max(100) })
        .parse(await req.json());
      limitLogin(
        `${req.headers.get("x-forwarded-for") || "local"}:${body.username}`,
      );
      const user =
        segments[1] === "register"
          ? await register(body.username.trim(), body.password)
          : await login(body.username.trim(), body.password);
      await createSession(user.id);
      return json({ ok: true });
    }
    const user = await requireUser();
    if (segments[0] === "capture") {
      const form = await req.formData();
      const captureId = form.get("captureId")
        ? z.string().uuid().parse(form.get("captureId"))
        : randomUUID();
      const previousCapture = await db.captureDraft.findUnique({
        where: { id: captureId },
      });
      if (previousCapture) {
        if (previousCapture.ownerId !== user.id)
          throw new Error("采集标识不可用");
        return json({ draft: previousCapture, shouldProcess: false });
      }
      const input = z
        .string()
        .max(20000)
        .parse(form.get("text") || "");
      const target = z
        .enum(["auto", "ledger", "shopping", "items", "savings", "text"])
        .parse(form.get("target") || "ledger");
      const targetListId = String(form.get("targetListId") || "") || null;
      if (targetListId) {
        const list = await owned(db, "shoppingList", targetListId, user.id);
        if (list.archived) throw new Error("目标清单已归档");
      }
      const capturedAt = new Date(
        String(form.get("capturedAt") || new Date().toISOString()),
      );
      const warnings: string[] = [];
      if (
        Number.isNaN(capturedAt.getTime()) ||
        capturedAt.getTime() > Date.now() + 300000 ||
        capturedAt.getTime() < Date.now() - 86400000
      )
        throw new Error("客户端采集时间异常，请检查设备时间或重新保存");
      const timezone = String(form.get("timezone") || user.timezone);
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      } catch {
        throw new Error("采集时区无效");
      }
      const files = form
        .getAll("images")
        .filter((f): f is File => f instanceof File && f.size > 0);
      if (!input.trim() && !files.length)
        throw new Error("请写点内容或添加截图");
      if (files.length > 3) throw new Error("每条最多 3 张截图");
      const prepared: {
        file: File;
        buffer: Buffer;
        hash: string;
        storageKey: string;
      }[] = [];
      for (const file of files) {
        if (
          file.size > 5_000_000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        )
          throw new Error("图片仅支持 PNG、JPG、WebP，单张不超过 5MB");
        const buffer = Buffer.from(await file.arrayBuffer());
        const png = buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        const webp =
          buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP";
        if (
          (file.type === "image/png" && !png) ||
          (file.type === "image/jpeg" && !jpg) ||
          (file.type === "image/webp" && !webp)
        )
          throw new Error("图片内容与文件类型不一致");
        const hash = createHash("sha256").update(buffer).digest("hex");
        if (await db.attachment.count({ where: { ownerId: user.id, hash } }))
          warnings.push("这张图片曾上传过，请留意重复入账");
        prepared.push({ file, buffer, hash, storageKey: randomUUID() });
      }
      await mkdir(path.join(process.cwd(), "uploads"), { recursive: true });
      for (const p of prepared)
        await writeFile(
          path.join(process.cwd(), "uploads", p.storageKey),
          p.buffer,
        );
      const draft = await db.$transaction(async (tx) => {
        const draft = await tx.captureDraft.create({
          data: {
            id: captureId,
            ownerId: user.id,
            text: input,
            target,
            targetListId,
            capturedAt,
            captureTimezone: timezone,
            inputMethod: String(form.get("inputMethod") || "text"),
            warnings: JSON.stringify(warnings),
          },
        });
        for (const p of prepared)
          await tx.attachment.create({
            data: {
              ownerId: user.id,
              draftId: draft.id,
              storageKey: p.storageKey,
              name: p.file.name.slice(0, 200),
              mime: p.file.type,
              size: p.file.size,
              hash: p.hash,
            },
          });
        return draft;
      });
      const pending = await db.captureDraft.count({
        where: { ownerId: user.id, state: "pending" },
      });
      const ai = await aiUsage(user.id);
      return json({
        draft,
        shouldProcess:
          user.autoBatch &&
          pending >= user.batchSize &&
          ai.configured &&
          (ai.providerMode === "personal" || ai.remaining > 0),
      });
    }
    if (segments[0] === "import") {
      if (length > 18_000_000) throw new Error("导入请求过大");
      const input = await readImportBody(req);
      if (segments[1] === "preview")
        return json(await previewImport(user, input));
      if (segments[1] === "commit")
        return json(await commitImport(user, input));
      return json({ error: "导入接口不存在" }, 404);
    }
    const body = await req.json();
    if (segments[0] === "ai" && segments[1] === "config")
      return json(await saveAiConfig(user.id, body));
    if (segments[0] === "ai" && segments[1] === "test")
      return json(await testPersonalConfig(user.id));
    if (segments[0] === "classification" && segments[1] === "preview")
      return json(await classificationPreview(user, body));
    if (segments[0] === "classification" && segments[1] === "apply")
      return json(await classificationApply(user, body));
    if (segments[0] === "mutate") return json(await mutate(user, body));
    if (segments[0] === "review" && segments[1])
      return json(await vote(user, segments[1], body));
    if (segments[0] === "apply") return json(await applyDraft(user, body));
    if (segments[0] === "process") return json(await processDrafts(user, body));
    if (segments[0] === "analysis") return json(await analyze(user, body));
    if (segments[0] === "suggest") return json(await suggest(user, body));
    if (segments[0] === "ai-test") {
      return json(await testPersonalConfig(user.id));
    }
    if (segments[0] === "polish") return json(await polish(user, body));
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    return fail(error);
  }
}
