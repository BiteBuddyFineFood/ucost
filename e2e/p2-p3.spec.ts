import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const mobile of [false, true]) {
  test(`${mobile ? "手机" : "桌面"}全部记账、预算去重与分组偏好`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByRole("button", { name: "第一次来？创建账号" }).click();
    await page
      .getByLabel("用户名", { exact: true })
      .fill(`p2-${randomUUID().slice(0, 8)}`);
    await page.getByLabel("密码", { exact: true }).fill(`Test-${randomUUID()}`);
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "日常，慢慢有数。" }),
    ).toBeVisible();
    const post = async (body: any) => {
      const response = await page.request.post("/api/mutate", {
        data: { operationId: randomUUID(), ...body },
        headers: { Origin: baseURL! },
      });
      const result = await response.json();
      expect(response.ok(), JSON.stringify(result)).toBe(true);
      return result;
    };
    const initial = await (await page.request.get("/api/state")).json();
    const category = initial.categories.find((c: any) => c.type === "expense");
    const list = await post({
      action: "save",
      entity: "lists",
      data: { name: "整单验收采购", budget: 100000 },
    });
    await post({
      action: "save",
      entity: "shopping",
      data: {
        listId: list.id,
        name: "采购测试物品",
        budget: 100000,
        categoryId: category.id,
      },
    });
    await page.reload();
    const nav = page.locator(mobile ? ".mobile-nav" : ".sidebar nav");
    await nav.getByRole("button", { name: "购物清单", exact: true }).click();
    await page.getByRole("button", { name: /整单验收采购.*件物品/ }).click();
    await page.getByRole("button", { name: "全部记账", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("实付（元）", { exact: true }).fill("800");
    await dialog.getByLabel("真实优惠（元）", { exact: true }).fill("50");
    await dialog.getByLabel(/完成清单后，将预算结余记入省钱本/).check();
    await dialog.getByRole("button", { name: "预览本次记账" }).click();
    await expect(
      dialog.getByText(/本次新增 1 笔支出.*800.00.*预算结余.*200.00/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "确认全部记账" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const state = await (await page.request.get("/api/state")).json();
    expect(
      state.ledger.filter((e: any) => e.title === "采购测试物品"),
    ).toHaveLength(1);
    expect(
      state.savings
        .filter(
          (s: any) =>
            s.status === "valid" &&
            !s.suppressed &&
            !s.supersededBySettlementId,
        )
        .reduce((sum: number, s: any) => sum + s.amount, 0),
    ).toBe(20000);
    await nav.getByRole("button", { name: "账本", exact: true }).click();
    await page.getByRole("button", { name: "切换为分组" }).click();
    await expect(
      page.locator(".group-heading").getByText("整单验收采购", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/当前筛选小计/)).toBeVisible();
    await page.reload();
    await nav.getByRole("button", { name: "账本", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "切换为平铺" }),
    ).toBeVisible();
    if (mobile) {
      await page.getByRole("button", { name: "更多", exact: true }).click();
      await page
        .locator(".mobile-more")
        .getByRole("button", { name: "省钱罐", exact: true })
        .click();
    } else
      await page
        .locator(".sidebar nav")
        .getByRole("button", { name: "省钱罐", exact: true })
        .click();
    await expect(
      page.getByRole("button", { name: "切换为分组" }),
    ).toBeVisible();
    await expect(page.locator(".saving-overview strong")).toContainText(
      "200.00",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `data/p2-p3-verification/${mobile ? "mobile" : "desktop"}-savings.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    expect(state.ai).not.toHaveProperty("textModel");
    expect(state.ai).not.toHaveProperty("visionModel");
  });
}
