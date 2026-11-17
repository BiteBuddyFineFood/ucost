import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

test("快速记录暴露物品变动和提醒，手机小数管家保留先存着入口", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("data/phase4-review", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "第一次来？创建账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`phase4-${randomUUID().slice(0, 8)}`);
  await page
    .getByLabel("密码", { exact: true })
    .fill(`Phase4-${randomUUID()}!`);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "快速记录" }).click();
  const capture = page.getByRole("dialog");
  await expect(capture).toBeVisible();
  const modes = capture.getByRole("group", { name: "快速记录类型" });
  await expect(modes.getByRole("button", { name: /自动判断/ })).toBeVisible();
  await expect(
    modes.getByRole("button", { name: /买到 \/ 不买了/ }),
  ).toBeVisible();
  await expect(modes.getByRole("button", { name: /物品变动/ })).toBeVisible();
  await expect(modes.getByRole("button", { name: /到期提醒/ })).toBeVisible();
  await modes.getByRole("button", { name: /物品变动/ }).click();
  await expect(
    modes.getByRole("button", { name: /物品变动/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(capture.getByRole("textbox")).toHaveAttribute(
    "placeholder",
    /还剩 2 盒/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "data/phase4-review/desktop-capture-modes.png",
    fullPage: false,
  });
  await capture.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "打开小数管家" }).click();
  const assistant = page.getByRole("dialog", { name: "小数管家" });
  await expect(assistant).toBeVisible();
  await assistant
    .getByLabel("问小数管家")
    .fill("牛奶还剩两盒，放冰箱");
  await assistant.getByRole("button", { name: "先存着" }).click();
  await expect(
    assistant.getByRole("heading", { name: "已经先存着" }),
  ).toBeVisible();
  await expect(
    assistant.getByRole("button", { name: "查看待整理" }),
  ).toBeVisible();
  await page.screenshot({
    path: "data/phase4-review/desktop-assistant-stash.png",
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(assistant).toBeVisible();
  await expect(
    assistant.getByRole("button", { name: "改物品" }),
  ).toBeVisible();
  await expect(
    assistant.getByRole("button", { name: "加提醒" }),
  ).toBeVisible();
  await assistant.getByRole("button", { name: "改物品" }).click();
  const mobileCapture = page.getByRole("dialog", {
    name: /物品变了什么/,
  });
  await expect(mobileCapture).toBeVisible();
  await expect(
    mobileCapture
      .getByRole("group", { name: "快速记录类型" })
      .getByRole("button", { name: /物品变动/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "data/phase4-review/mobile-capture-modes.png",
    fullPage: false,
  });
  expect(errors).toEqual([]);
});
