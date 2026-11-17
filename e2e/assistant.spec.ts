import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

const password = `Assistant-${randomUUID()}!`;

test("小数管家从当前账页回答建议问题，桌面可拖动且手机可用", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("data/assistant-review", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "第一次来？创建账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`assistant-${randomUUID().slice(0, 8)}`);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();

  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "账本", exact: true })
    .click();
  await page.getByRole("button", { name: "手动添加" }).click();
  await page.getByLabel("记什么").fill("小数管家验证午饭");
  await page.getByLabel("实际金额").fill("28");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByText("小数管家验证午饭", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "打开小数管家" }).click();
  const dialog = page.getByRole("dialog", { name: "小数管家" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(350);
  const panelStyle = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const thread = getComputedStyle(
      element.querySelector(".assistant-thread") as HTMLElement,
    );
    return {
      background: style.backgroundColor,
      opacity: style.opacity,
      threadBackground: thread.backgroundColor,
      threadOpacity: thread.opacity,
    };
  });
  expect(panelStyle.opacity).toBe("1");
  expect(panelStyle.background).toBe("rgb(251, 250, 243)");
  expect(panelStyle.threadOpacity).toBe("1");
  await expect(dialog.getByText("账页我翻过了。")).toBeVisible();
  expect(
    await dialog
      .locator(".assistant-thread")
      .evaluate((thread) => thread.scrollTop),
  ).toBe(0);
  await expect(
    dialog.getByRole("button", { name: /这周花了多少钱/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /帮我生成本周生活摘要/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "data/assistant-review/desktop-welcome.png",
    fullPage: false,
  });

  await dialog
    .getByRole("button", { name: /帮我生成本周生活摘要/ })
    .click();
  await expect(
    dialog.getByRole("heading", { name: /本周生活摘要/ }),
  ).toBeVisible();
  await expect(dialog.getByText("¥28.00", { exact: true }).first()).toBeVisible();
  await dialog.getByLabel("问小数管家").fill("这周花了多少钱？");
  await dialog.getByRole("button", { name: "发送问题" }).click();
  await expect(
    dialog.getByRole("heading", { name: "本周净支出 ¥28.00" }),
  ).toBeVisible();
  await expect(dialog.getByText("支出", { exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "data/assistant-review/desktop-answer.png",
    fullPage: false,
  });

  const before = await dialog.boundingBox();
  const head = await dialog.locator(".assistant-head").boundingBox();
  expect(before).not.toBeNull();
  expect(head).not.toBeNull();
  await page.mouse.move(head!.x + head!.width / 2, head!.y + 14);
  await page.mouse.down();
  await page.mouse.move(head!.x + head!.width / 2 - 90, head!.y - 40, {
    steps: 5,
  });
  await page.mouse.up();
  const after = await dialog.boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 20);
  await expect(
    dialog.getByRole("button", { name: "收起小数管家" }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "收起小数管家" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开小数管家" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开小数管家" }).click();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(350);
  await expect(dialog.getByLabel("问小数管家")).toBeVisible();
  const mobileBox = await dialog.boundingBox();
  expect(mobileBox!.x).toBe(0);
  expect(Math.round(mobileBox!.width)).toBe(390);
  await page.screenshot({
    path: "data/assistant-review/mobile-sheet.png",
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
