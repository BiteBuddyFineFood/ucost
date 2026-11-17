import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { register } from "../src/server/auth";
import { aiUsage, saveAiConfig } from "../src/server/ai-gateway";
import { processDrafts } from "../src/server/ai";
import { localDate } from "../src/lib/domain";
import { mutate } from "../src/server/services";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("an invite code binds at most ten users and grants unlimited system AI", async () => {
  const code = `UC-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`.toUpperCase();
  await db.inviteCode.insert({ data: { code, maxUses: 10, note: "test invite" } });
  const users = [];
  for (let index = 0; index < 10; index++)
    users.push(
      await register(
        `invite-${index}-${randomUUID().slice(0, 8)}`,
        "Test-strong-password",
        code,
      ),
    );

  const invite = await db.inviteCode.require({ where: { code } });
  expect(invite.usedCount).toBe(10);
  expect(await db.inviteRedemption.count({ where: { codeId: invite.id } })).toBe(10);

  const usage = await aiUsage(users[0].id);
  expect(usage).toMatchObject({
    unlimited: true,
    inviteCode: code,
    limit: null,
    remaining: null,
  });

  await expect(
    register(`overflow-${randomUUID().slice(0, 8)}`, "Test-strong-password", code),
  ).rejects.toThrow("已满");
});

it("invalid invite codes fail registration without creating a user", async () => {
  const username = `invalid-${randomUUID().slice(0, 8)}`;
  await expect(
    register(username, "Test-strong-password", "UC-NOPE-NOPE"),
  ).rejects.toThrow("无效");
  expect(await db.user.first({ where: { username } })).toBeNull();
});

it("a registered user can redeem an invite code from settings", async () => {
  const code = `UC-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`.toUpperCase();
  await db.inviteCode.insert({ data: { code } });
  const user = await register(
    `late-invite-${randomUUID().slice(0, 8)}`,
    "Test-strong-password",
  );
  const operationId = randomUUID();

  await expect(
    mutate(user, { action: "redeemInvite", operationId, code }),
  ).resolves.toEqual({ code });
  expect(await aiUsage(user.id)).toMatchObject({
    unlimited: true,
    inviteCode: code,
  });
  expect(await db.inviteCode.require({ where: { code } })).toMatchObject({
    usedCount: 1,
  });

  await expect(
    mutate(user, { action: "redeemInvite", operationId, code }),
  ).resolves.toEqual({ code });
  expect(await db.inviteCode.require({ where: { code } })).toMatchObject({
    usedCount: 1,
  });

  const other = `UC-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`.toUpperCase();
  await db.inviteCode.insert({ data: { code: other } });
  await expect(
    mutate(user, {
      action: "redeemInvite",
      operationId: randomUUID(),
      code: other,
    }),
  ).rejects.toThrow("不能更换");
});

it("invite users do not reserve or consume the daily system quota", async () => {
  const code = `UC-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`.toUpperCase();
  await db.inviteCode.insert({ data: { code } });
  const user = await register(
    `invite-ai-${randomUUID().slice(0, 8)}`,
    "Test-strong-password",
    code,
  );
  vi.stubEnv("AI_ALLOWED_ORIGINS", "https://fixture.invalid");
  vi.stubEnv("AI_API_KEY", "fixture-only");
  vi.stubEnv("AI_BASE_URL", "https://fixture.invalid/v1");
  vi.stubEnv("AI_TEXT_MODEL", "fixture");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    choices: [{ message: { content: JSON.stringify({
      candidates: [{
        target: "ledger",
        data: { type: "expense", title: "invite lunch", amount: 100, date: localDate() },
        warnings: [],
      }],
      warnings: [],
    }) } }],
  })));
  const draft = await db.captureDraft.insert({
    data: { ownerId: user.id, text: "午饭10", capturedAt: new Date() },
  });

  const result = await processDrafts(user, {
    ids: [draft.id],
    operationId: randomUUID(),
  });
  expect(result.results).toHaveLength(1);
  expect((await aiUsage(user.id)).used).toBe(0);
  expect(await db.aiDailyUsage.count({ where: { ownerId: user.id } })).toBe(0);
});

it("users without an invite code cannot use AI", async () => {
  vi.stubEnv("AI_REQUIRE_INVITE", "true");
  const user = await register(
    `no-invite-${randomUUID().slice(0, 8)}`,
    "Test-strong-password",
  );
  expect(await aiUsage(user.id)).toMatchObject({
    allowed: false,
    unlimited: false,
    inviteCode: null,
  });
  vi.stubEnv("AI_ALLOWED_ORIGINS", "https://fixture.invalid");
  vi.stubEnv("AI_API_KEY", "fixture-only");
  vi.stubEnv("AI_BASE_URL", "https://fixture.invalid/v1");
  vi.stubEnv("AI_TEXT_MODEL", "fixture");
  const draft = await db.captureDraft.insert({
    data: { ownerId: user.id, text: "午饭10", capturedAt: new Date() },
  });
  await expect(
    processDrafts(user, { ids: [draft.id], operationId: randomUUID() }),
  ).rejects.toThrow("邀请码");
  await expect(
    saveAiConfig(user.id, {
      enabled: false,
      baseUrl: "",
      textModel: "",
      version: 0,
    }),
  ).rejects.toThrow("邀请码");
});
