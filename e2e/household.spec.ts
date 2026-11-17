import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openDesktopNavItem } from "./navigation-helpers";

const password = process.env.E2E_TEST_PASSWORD ?? `Test-${randomUUID()}!`;

test("生活管家桌面与手机页面可用且无横向溢出", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const itemName = `羽绒服-${suffix}`;
  const foodName = `牛奶-${suffix}`;
  const listName = `海边-${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: "第一次来？创建账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`household-${suffix}`);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();

  for (const label of ["日", "周", "月", "半年", "年", "自定义"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.locator(".period-tabs button.selected"),
    ).toContainText(label);
  }
  await page.getByRole("button", { name: "月", exact: true }).click();
  await expect(page.locator(".period-current")).toContainText("至");
  await page.screenshot({
    path: "test-results/household-dashboard.png",
    fullPage: true,
  });

  await openDesktopNavItem(page, "收纳管理");
  await expect(page.getByText("东西有归处，找起来不慌。")).toBeVisible();
  await page.getByRole("button", { name: "登记物品", exact: true }).click();
  const itemDialog = page.getByRole("dialog");
  await itemDialog.getByRole("textbox", { name: /^名称/ }).fill(itemName);
  await itemDialog.getByRole("spinbutton", { name: /^当前数量/ }).fill("2");
  await itemDialog.getByRole("textbox", { name: /^单位/ }).fill("件");
  await itemDialog.getByRole("checkbox", { name: "开启收纳" }).check();
  await itemDialog.getByRole("textbox", { name: /^位置/ }).fill("卧室 / 衣柜上层");
  await itemDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".household-row").filter({ hasText: itemName }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
  await page.screenshot({
    path: "test-results/household-storage-items.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "新建箱子" }).click();
  const boxDialog = page.getByRole("dialog");
  await boxDialog.getByRole("textbox", { name: /^箱子名称/ }).fill(`冬衣箱-${suffix}`);
  await boxDialog.getByRole("textbox", { name: /^所在位置/ }).fill("卧室衣柜");
  await boxDialog.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .locator(".household-row")
    .filter({ hasText: itemName })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  const editItemDialog = page.getByRole("dialog");
  await editItemDialog
    .getByLabel(/^放进箱子/)
    .selectOption({ label: `冬衣箱-${suffix} · 卧室衣柜` });
  await editItemDialog
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeHidden();
  await page.getByRole("button", { name: "按收纳箱" }).click();
  await expect(
    page.locator(".box-card").filter({ hasText: `冬衣箱-${suffix}` }),
  ).toBeVisible();
  await expect(
    page
      .locator(".box-card")
      .filter({ hasText: `冬衣箱-${suffix}` })
      .getByText(itemName, { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator(".box-card")
      .filter({ hasText: `冬衣箱-${suffix}` })
      .getByText("1 类物品"),
  ).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
  await page.screenshot({
    path: "test-results/household-storage-boxes.png",
    fullPage: true,
  });

  await openDesktopNavItem(page, "保质期");
  await page.getByRole("button", { name: "登记临期物品" }).click();
  const expiryDialog = page.getByRole("dialog");
  await expiryDialog.getByRole("textbox", { name: /^名称/ }).fill(foodName);
  await expiryDialog.getByRole("checkbox", { name: "开启保质期" }).check();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 3);
  await expiryDialog
    .getByLabel(/^到期日/)
    .fill(expiry.toISOString().slice(0, 10));
  await expiryDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".expiry-row").filter({ hasText: foodName }),
  ).toBeVisible();
  await expect(page.getByText("今天～7 天")).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
  await page.screenshot({
    path: "test-results/household-expiry.png",
    fullPage: true,
  });

  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "清单", exact: true })
    .click();
  await page.getByRole("button", { name: "新建清单" }).click();
  const listDialog = page.getByRole("dialog");
  await listDialog.getByRole("textbox", { name: /^清单名称/ }).fill(listName);
  await listDialog.getByLabel(/^用途/).selectOption("travel");
  const departure = new Date();
  departure.setDate(departure.getDate() + 5);
  await listDialog
    .getByLabel(/^出发日期/)
    .fill(departure.toISOString().slice(0, 10));
  await listDialog.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator(".list-title").filter({ hasText: listName }).click();
  await page.getByRole("button", { name: "手动添加" }).click();
  const listItemDialog = page.getByRole("dialog");
  await listItemDialog
    .getByRole("textbox", { name: /^条目名称/ })
    .fill(`证件-${suffix}`);
  await listItemDialog.getByRole("textbox", { name: /^分组/ }).fill("证件");
  await listItemDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".record-row").filter({ hasText: `证件-${suffix}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "设提醒" }).click();
  await page.getByRole("button", { name: "保存提醒" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("status")).toBeHidden();
  await page.screenshot({
    path: "test-results/household-travel.png",
    fullPage: true,
  });

  await openDesktopNavItem(page, "提醒");
  await expect(page.getByText("全部提醒规则")).toBeVisible();
  await expect(page.getByText("只在网页打开时检查")).toBeVisible();
  await expect(page.getByText("提前 1 天 09:00")).toBeVisible();
  await page.screenshot({
    path: "test-results/household-reminders.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "统计", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/household-mobile-dashboard.png",
    fullPage: true,
  });
  for (const pageName of ["收纳管理", "保质期", "提醒"]) {
    if (!(await page.locator(".mobile-more").isVisible()))
      await page
        .locator(".mobile-nav")
        .getByRole("button", { name: "更多" })
        .click();
    await page.locator(".mobile-more").getByRole("button", { name: pageName }).click();
    if (pageName === "收纳管理")
      await page.getByRole("button", { name: "按收纳箱", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/household-mobile-${
        pageName === "收纳管理"
          ? "storage"
          : pageName === "保质期"
            ? "expiry"
            : "reminders"
      }.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
