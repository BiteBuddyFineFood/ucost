import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("AI 帮我建清单先创建空清单，再交给用户确认建议", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "第一次来？创建账号" }).click();
  await page
    .getByLabel("用户名", { exact: true })
    .fill(`list-wizard-${suffix}`);
  await page.getByLabel("密码", { exact: true }).fill(`Test-${suffix}!`);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日常，慢慢有数。" }),
  ).toBeVisible();

  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "清单", exact: true })
    .click();
  await page.getByRole("button", { name: "AI 帮我建清单" }).click();
  const wizard = page.getByRole("dialog", { name: "AI 帮我建清单" });
  await wizard
    .getByRole("textbox", { name: /^清单名称/ })
    .fill(`海边-${suffix}`);
  await wizard.getByLabel(/^用途/).selectOption("travel");
  await wizard
    .getByRole("textbox", { name: "想准备什么" })
    .fill("两大一小，海边三天，想轻装，防晒和常用药别忘了。");
  await wizard.getByRole("button", { name: "创建并开始建议" }).click();

  const capture = page.getByRole("dialog", {
    name: "说说这趟出行，AI 帮你列准备",
  });
  await expect(capture).toBeVisible();
  await expect(capture.getByRole("textbox")).toHaveValue(
    "两大一小，海边三天，想轻装，防晒和常用药别忘了。",
  );
  await expect(capture.getByText("保存并整理")).toBeVisible();
  await capture.getByRole("button", { name: "关闭" }).click();
  await expect(
    page.locator(".list-context h2").filter({ hasText: `海边-${suffix}` }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
