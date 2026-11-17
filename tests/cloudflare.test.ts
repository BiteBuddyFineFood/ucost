import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, database, writeBatch } from "../src/server/db";
import { planBatch } from "../src/server/store";
import { processImageCapture, processDrafts } from "../src/server/ai";
import { aiUsage } from "../src/server/ai-gateway";
import { register, login, limitLogin } from "../src/server/auth";
import { localDate } from "../src/lib/domain";

let user: any;
beforeAll(async () => { user = await db.user.insert({ data: { username: `cf-${randomUUID()}`, passwordHash: "fixture" } }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("D1 SQL constraint failure rolls back preceding domain tables and receipt", async () => {
  const operationId = randomUUID(), ownerId = user.id;
  await expect(writeBatch(async tx => {
    await tx.account.insert({ data: { id: operationId, ownerId, name: "must roll back" } });
    await tx.category.insert({ data: { ownerId, type: "expense", name: operationId } });
    await tx.category.insert({ data: { ownerId, type: "expense", name: operationId } });
    await tx.appliedOperation.insert({ data: { id: operationId, ownerId, kind: "test", result: "{}" } });
  })).rejects.toThrow();
  expect(await db.account.first({ where: { id: operationId } })).toBeNull();
  expect(await db.category.count({ where: { ownerId, name: operationId } })).toBe(0);
  expect(await db.appliedOperation.first({ where: { id: operationId } })).toBeNull();
});

it("a stale revision throws before any dependent write, rather than reporting conflict after partial commit", async () => {
  const account = await db.account.insert({ data: { ownerId: user.id, name: "revision" } });
  let entered = 0, release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const actions = [1, 2].map(value => planBatchRunner(planBatch, value));
  async function planBatchRunner(plan: typeof planBatch, value: number) {
    return plan(await database(), async tx => {
      entered++;
      if (entered === 2) release();
      await barrier;
      await tx.account.change({ where: { id: account.id }, data: { opening: value } });
      await tx.ledgerEntry.insert({ data: { ownerId: user.id, type: "income", title: `guard-${account.id}`, amount: value, date: localDate() } });
    });
  }
  const results = await Promise.allSettled(actions);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const rows = await db.ledgerEntry.list({ where: { title: `guard-${account.id}` } });
  expect(rows).toHaveLength(1);
  expect((await db.account.require({ where: { id: account.id } })).opening).toBe(rows[0].amount);
});

function fixtureAI(fail = false, echo = false) {
  vi.stubEnv("AI_ALLOWED_ORIGINS", "https://fixture.invalid");
  vi.stubEnv("AI_API_KEY", "fixture-only");
  vi.stubEnv("AI_BASE_URL", "https://fixture.invalid/v1");
  vi.stubEnv("AI_TEXT_MODEL", "fixture");
  vi.stubEnv("AI_VISION_MODEL", "fixture");
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body);
    expect(request.messages[1].content[1].image_url.url).toContain("data:image/png;base64,");
    if (fail) return new Response("failure", { status: 503 });
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      candidates: [{ target: "ledger", data: { type: "expense", title: "fixture screenshot", amount: 2800, date: localDate(), note: echo ? "data:image/png;base64,not-allowed" : "" }, warnings: [] }], warnings: [],
    }) } }] });
  }));
}
async function draft() {
  return db.captureDraft.insert({ data: { ownerId: user.id, text: "截图说明", inputMethod: "image", capturedAt: new Date(Date.now() - 60000), captureTimezone: "Asia/Shanghai" } });
}
const image = "data:image/png;base64," + "b".repeat(600);
it("image recognition saves only candidates and original capture time; failure releases quota and supports retry", async () => {
  fixtureAI(true);
  const d = await draft();
  const before = await aiUsage(user.id);
  expect((await processImageCapture(user, d.id, [image], ["synthetic-hash"])).error).toContain("503");
  expect((await db.captureDraft.require({ where: { id: d.id } })).state).toBe("failed");
  expect((await aiUsage(user.id)).reserved).toBe(0);
  expect((await aiUsage(user.id)).used).toBe(before.used);
  fixtureAI();
  expect((await processImageCapture(user, d.id, [image], ["synthetic-hash"])).count).toBe(1);
  const saved = await db.captureDraft.require({ where: { id: d.id } });
  expect(saved.state).toBe("ready");
  expect(saved.capturedAt).toEqual(d.capturedAt);
  expect(await db.attachment.count({ where: { draftId: d.id } })).toBe(0);
  const tasks = await db.aiTask.list({ where: { ownerId: user.id } });
  expect(JSON.stringify([saved, tasks])).not.toContain("data:image");
  expect(JSON.stringify([saved, tasks])).not.toContain("b".repeat(512));
  expect((await aiUsage(user.id)).used).toBe(before.used + 1);
});
it("image encoding echoed by a model or submitted as a row is rejected before persistence", async () => {
  fixtureAI(false, true);
  const d = await draft();
  expect((await processImageCapture(user, d.id, [image], ["synthetic-hash"])).error).toContain("图片编码");
  expect((await db.captureDraft.require({ where: { id: d.id } })).result).toBe("[]");
  await expect(db.captureDraft.insert({ data: { ownerId: user.id, text: image, capturedAt: new Date() } })).rejects.toThrow("图片编码");
});
it("bcrypt cost 12 and D1 login attempts survive repeated service calls", async () => {
  const username = `bcrypt-${randomUUID().slice(0, 16)}`;
  const account = await register(username, "Test-strong-password");
  expect(account.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  expect((await login(username, "Test-strong-password")).id).toBe(account.id);
  await expect(login(username, "wrong-password")).rejects.toThrow("不正确");
  const key = randomUUID();
  for (let i = 0; i < 15; i++) await limitLogin(key);
  await expect(limitLogin(key)).rejects.toThrow("频繁");
});

it("text batches continue one draft per request with one quota reservation; abandoned progress expires", async () => {
  fixtureAI();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ candidates: [{ target: "ledger", data: { type: "expense", title: "text chunk", amount: 100, date: localDate() }, warnings: [] }], warnings: [] }) } }] })));
  const drafts = [];
  for (let i = 0; i < 2; i++) drafts.push(await db.captureDraft.insert({ data: { ownerId: user.id, text: `分段${i}`, capturedAt: new Date() } }));
  const operationId = randomUUID();
  const before = await aiUsage(user.id);
  const first = await processDrafts(user, { ids: drafts.map(d => d.id), operationId });
  expect(first.results).toHaveLength(1);
  expect(first.remaining).toHaveLength(1);
  expect((await aiUsage(user.id)).reserved).toBe(1);
  expect((await aiUsage(user.id)).used).toBe(before.used);
  const last = await processDrafts(user, { ids: first.remaining, operationId });
  expect(last.results).toHaveLength(2);
  expect(last.remaining).toHaveLength(0);
  expect((await aiUsage(user.id)).reserved).toBe(0);
  expect((await aiUsage(user.id)).used).toBe(before.used + 1);
  const fresh = [];
  for (let i = 0; i < 2; i++) fresh.push(await db.captureDraft.insert({ data: { ownerId: user.id, text: `中断${i}`, capturedAt: new Date() } }));
  const abandonedId = randomUUID();
  await processDrafts(user, { ids: fresh.map(d => d.id), operationId: abandonedId });
  const task = await db.aiTask.require({ where: { ownerId: user.id, operationId: abandonedId } });
  expect(task.status).toBe("paused");
  await db.aiTask.change({ where: { id: task.id }, data: { leaseUntil: new Date(Date.now() - 1) } });
  expect((await aiUsage(user.id)).reserved).toBe(0);
  expect((await db.aiTask.require({ where: { id: task.id } })).status).toBe("failed");
});
