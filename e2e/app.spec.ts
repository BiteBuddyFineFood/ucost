import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const testPassword = process.env.E2E_TEST_PASSWORD ?? `Test-${randomUUID()}!`;
const demoPassword = process.env.SEED_PASSWORD;
test("桌面真实记账、批量编辑与首页布局持久化", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "第一次来？创建账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`e2e-${randomUUID().slice(0, 8)}`);
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "账本", exact: true })
    .click();
  await page.getByRole("button", { name: "手动添加" }).click();
  await page.getByLabel("记什么").fill("测试午饭");
  await page.getByLabel("实际金额").fill("28");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("测试午饭", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "选择测试午饭" }).check();
  await page.getByRole("button", { name: "批量编辑 / 删除" }).click();
  await page.locator(".batch-common select").first().selectOption("note");
  await page.locator(".batch-common select").nth(1).selectOption("set");
  await page.locator(".batch-common textarea").fill("批量修改已保存");
  await page.getByRole("button", { name: "应用到下方预览" }).click();
  await page.getByRole("button", { name: "保存整批修改" }).click();
  await expect(page.getByText(/批量修改已保存/).first()).toBeVisible();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "统计", exact: true })
    .click();
  await page.getByRole("button", { name: "自定义首页" }).click();
  await page.getByRole("checkbox", { name: "物品成本", exact: true }).uncheck();
  await page.getByRole("button", { name: "保存布局" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "物品陪伴" })).toHaveCount(0);
});
test("演示账本 PC 与手机布局无横向溢出", async ({ page }) => {
  test.skip(!demoPassword, "需要设置 SEED_PASSWORD 并运行 npm run db:seed");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await page.getByLabel("用户名", { exact: true }).fill("demo");
  await page.getByLabel("密码", { exact: true }).fill(demoPassword!);
  await page.getByRole("button", { name: "登录账本" }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard-desktop.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "购物清单" })
    .click();
  await page.getByRole("button", { name: "日常购物" }).click();
  await expect(
    page.getByRole("button", { name: "口述 / AI 添加" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/shopping-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("HTTP 权限、草稿原始时间、私有附件、公开评议与导出", async ({
  request,
  browser,
}) => {
  const origin = "http://localhost:3000";
  const headers = { Origin: origin };
  const username = `http-${randomUUID().slice(0, 8)}`;
  const account = await request.post("/api/auth/register", {
    headers,
    data: { username, password: testPassword },
  });
  expect(account.ok()).toBe(true);
  let state = await (await request.get("/api/state")).json();
  const captured = new Date(Date.now() - 60000).toISOString();
  const captureId = randomUUID();
  const created = await request.post("/api/capture", {
    headers,
    multipart: {
      text: "今天午饭28",
      captureId,
      target: "ledger",
      capturedAt: captured,
      timezone: "Asia/Shanghai",
    },
  });
  expect(created.ok()).toBe(true);
  const retried = await request.post("/api/capture", {
    headers,
    multipart: {
      text: "今天午饭28",
      captureId,
      target: "ledger",
      capturedAt: captured,
    },
  });
  expect((await retried.json()).draft.id).toBe(captureId);
  state = await (await request.get("/api/state")).json();
  expect(state.drafts[0].capturedAt).toBe(captured);
  expect(state.drafts[0].state).toBe("pending");
  expect(state.drafts).toHaveLength(1);
  expect(state.ledger).toHaveLength(0);
  const imageCapture = await request.post("/api/capture", {
    headers,
    multipart: {
      text: "private attachment",
      target: "ledger",
      capturedAt: new Date().toISOString(),
      images: {
        name: "one-pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7u0AAAAASUVORK5CYII=",
          "base64",
        ),
      },
    },
  });
  expect(imageCapture.ok()).toBe(true);
  state = await (await request.get("/api/state")).json();
  const attachmentId = state.attachments[0].id;
  await request.post("/api/mutate", {
    headers,
    data: { action: "settings", autoBatch: true, batchSize: 5 },
  });
  for (let i = 0; i < 3; i++) {
    const added = await request.post("/api/capture", {
      headers,
      multipart: {
        text: `阈值草稿${i}`,
        target: "ledger",
        capturedAt: new Date().toISOString(),
      },
    });
    expect((await added.json()).shouldProcess).toBe(i === 2);
  }
  expect((await request.get(`/api/attachment/${attachmentId}`)).ok()).toBe(
    true,
  );
  const itemResponse = await request.post("/api/mutate", {
    headers,
    data: {
      action: "save",
      entity: "shopping",
      operationId: randomUUID(),
      data: {
        name: "公开信息测试",
        listId: state.lists[0].id,
        note: "PRIVATE-SECRET",
        originalText: "PRIVATE-RAW",
        reason: "公开理由",
        budget: 10000,
      },
    },
  });
  const item = await itemResponse.json();
  const reviewResponse = await request.post("/api/mutate", {
    headers,
    data: {
      action: "reviewCreate",
      operationId: randomUUID(),
      itemId: item.id,
      data: {
        title: "HTTP评议",
        description: "只公开选定字段",
        targetCount: 1,
        rule: "all",
        visibility: "link",
      },
    },
  });
  const review = await reviewResponse.json();
  const stranger = await browser.newContext();
  expect(
    (
      await stranger.request.get(`${origin}/api/attachment/${attachmentId}`)
    ).status(),
  ).toBe(401);
  const publicResponse = await stranger.request.get(
    `${origin}/api/review/${review.token}`,
  );
  expect(publicResponse.ok()).toBe(true);
  const sharedText = await publicResponse.text();
  expect(sharedText).not.toContain("PRIVATE-SECRET");
  expect(sharedText).not.toContain("PRIVATE-RAW");
  expect(sharedText).toContain("公开理由");
  expect((await stranger.request.get(`${origin}/api/state`)).status()).toBe(
    401,
  );
  await stranger.request.post(`${origin}/api/auth/register`, {
    headers,
    data: {
      username: `voter-${randomUUID().slice(0, 8)}`,
      password: testPassword,
    },
  });
  expect(
    (
      await stranger.request.get(`${origin}/api/attachment/${attachmentId}`)
    ).ok(),
  ).toBe(false);
  const unauthorized = await stranger.request.post(`${origin}/api/mutate`, {
    headers,
    data: {
      action: "save",
      entity: "shopping",
      operationId: randomUUID(),
      id: item.id,
      version: item.version,
      data: { name: "越权修改" },
    },
  });
  expect(unauthorized.ok()).toBe(false);
  const voted = await stranger.request.post(
    `${origin}/api/review/${review.token}`,
    {
      headers,
      data: { operationId: randomUUID(), approve: true, comment: "赞成" },
    },
  );
  expect(voted.ok()).toBe(true);
  const ownerView = await (
    await request.get(`/api/review/${review.token}`)
  ).json();
  expect(ownerView.review.status).toBe("approved");
  const exported = await (await request.get("/api/export")).text();
  expect(exported).not.toContain("passwordHash");
  expect(exported).not.toContain("AI_API_KEY");
  expect(exported).toContain("schemaVersion");
  const badOrigin = await request.post("/api/mutate", {
    headers: { Origin: "https://unrelated.example" },
    data: { action: "settings", autoBatch: true, batchSize: 5 },
  });
  expect(badOrigin.ok()).toBe(false);
  await stranger.close();
});
