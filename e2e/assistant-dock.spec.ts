import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

async function createAccount(page: any) {
  await page.goto("/");
  await page.getByRole("button", { name: "第一次来？创建账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`dock-${randomUUID().slice(0, 8)}`);
  await page
    .getByLabel("密码", { exact: true })
    .fill(`Dock-${randomUUID()}!`);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();
}

async function dragPanel(page: any, toX: number, toY: number) {
  const panel = page.getByRole("dialog", { name: "小数管家" });
  const head = panel.locator(".assistant-head");
  const box = await head.boundingBox();
  if (!box) throw new Error("assistant header is not visible");
  await page.mouse.move(box.x + 70, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.mouse.up();
}

test("小数管家可拖动，到左右边缘收成半圆标签并可恢复", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir("data/phase4-review", { recursive: true });
  await createAccount(page);

  await page.getByRole("button", { name: "打开小数管家" }).click();
  const panel = page.getByRole("dialog", { name: "小数管家" });
  await expect(panel).toBeVisible();
  const before = await panel.boundingBox();
  expect(before).not.toBeNull();

  await dragPanel(page, 24, 460);
  await expect(panel).toBeHidden();
  const tab = page.getByRole("button", { name: "展开小数管家" });
  await expect(tab).toBeVisible();
  const tabBox = await tab.boundingBox();
  expect(tabBox).not.toBeNull();
  expect(tabBox!.x).toBeLessThanOrEqual(1);
  expect(tabBox!.width).toBeLessThan(40);
  await page.screenshot({
    path: "data/phase4-review/desktop-assistant-docked.png",
    fullPage: false,
  });

  await tab.click();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(350);
  const reopened = await panel.boundingBox();
  expect(reopened).not.toBeNull();
  expect(reopened!.x).toBeLessThanOrEqual(16);
  expect(reopened!.x).not.toBe(before!.x);
  await page.screenshot({
    path: "data/phase4-review/desktop-assistant-dock-open.png",
    fullPage: false,
  });

  await dragPanel(page, 720, 500);
  await expect(panel).toBeVisible();
  await expect(tab).toBeHidden();
  const moved = await panel.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved!.x).toBeGreaterThan(200);

  await panel.getByRole("button", { name: "收起小数管家" }).click();
  await expect(
    page.getByRole("button", { name: "打开小数管家" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "打开小数管家" }).click();
  await dragPanel(page, 1420, 420);
  await expect(tab).toBeVisible();
  await page.reload();
  await expect(tab).toBeVisible();

  await tab.click();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(350);
  const persisted = await panel.boundingBox();
  expect(persisted).not.toBeNull();
  expect(persisted!.x + persisted!.width).toBeGreaterThanOrEqual(1426);
});

test("右下角悬浮入口也可拖动贴边，不会拖到下面的页面", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createAccount(page);

  const launcher = page.getByRole("button", { name: "打开小数管家" });
  await expect(launcher).toBeVisible();
  const box = await launcher.boundingBox();
  if (!box) throw new Error("assistant launcher is not visible");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(24, 520, { steps: 12 });
  await page.mouse.up();

  await expect(launcher).toBeHidden();
  const tab = page.getByRole("button", { name: "展开小数管家" });
  await expect(tab).toBeVisible();
  const tabBox = await tab.boundingBox();
  expect(tabBox).not.toBeNull();
  expect(tabBox!.x).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => ({
      scrollY: window.scrollY,
      selection: window.getSelection()?.toString() || "",
    })),
  ).toEqual({ scrollY: 0, selection: "" });

  await tab.click();
  const panel = page.getByRole("dialog", { name: "小数管家" });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(350);
  const openBox = await panel.boundingBox();
  expect(openBox).not.toBeNull();
  expect(openBox!.x).toBeLessThanOrEqual(16);
});
