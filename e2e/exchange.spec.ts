import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { openDesktopNavItem } from "./navigation-helpers";
for (const mobile of [false, true]) {
  test(`${mobile ? "手机" : "桌面"}文件导入预检、映射、事务确认与重复导入`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 },
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const post = async (endpoint: string, body: any) => {
      const r = await page.request.post(`/api/${endpoint}`, {
        data: { operationId: randomUUID(), ...body },
        headers: { Origin: baseURL! },
      });
      const result = await r.json();
      expect(r.ok(), JSON.stringify(result)).toBe(true);
      return result;
    };
    await post("auth/register", {
      username: `p4-source-${randomUUID().slice(0, 8)}`,
      password: `Test-${randomUUID()}`,
    });
    const category = await post("mutate", {
      action: "save",
      entity: "categories",
      data: {
        name: "往返食品",
        type: "expense",
        iconKey: "coffee",
        color: "#C4A24A",
      },
    });
    const list = await post("mutate", {
      action: "save",
      entity: "lists",
      data: { name: "往返采购", budget: 100000 },
    });
    const item = await post("mutate", {
      action: "save",
      entity: "shopping",
      data: { listId: list.id, name: "往返物品", categoryId: category.id },
    });
    await post("mutate", {
      action: "convert",
      id: item.id,
      version: item.version,
      mode: "buy",
      paid: 80000,
      discount: 5000,
      date: "2026-11-12",
      createLedger: true,
      createItem: true,
    });
    const settlement = await post("mutate", {
      action: "listSettlementPreview",
      id: list.id,
    });
    await post("mutate", {
      action: "listSettlementConfirm",
      id: list.id,
      fingerprint: settlement.fingerprint,
      confirmedClosed: true,
    });
    await page.goto("/");
    const openSettings = async () => {
      if (mobile) {
        await page
          .locator(".mobile-nav")
          .getByRole("button", { name: "更多", exact: true })
          .click();
        await page
          .locator(".mobile-more")
          .getByRole("button", { name: "设置", exact: true })
          .click();
      } else await openDesktopNavItem(page, "设置");
    };
    await openSettings();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "全部数据 JSON v2", exact: true })
      .click();
    const download = await downloadEvent;
    const file = await download.path();
    expect(download.suggestedFilename()).toBe("ucost-v2.json");
    const exported = await (await page.request.get("/api/export")).json();
    expect(JSON.stringify(exported)).not.toMatch(
      /passwordHash|encryptedKey|"token"/,
    );
    await post("auth/logout", {});
    await post("auth/register", {
      username: `p4-target-${randomUUID().slice(0, 8)}`,
      password: `Test-${randomUUID()}`,
    });
    await page.reload();
    await openSettings();
    await page
      .getByLabel("导入文件（JSON / CSV）", { exact: true })
      .setInputFiles(file!);
    await page.getByRole("button", { name: "预检导入", exact: true }).click();
    await expect(page.getByRole("heading", { name: "导入预览" })).toBeVisible();
    const state = await (await page.request.get("/api/state")).json();
    const selects = page.locator(".import-preview select");
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const select = selects.nth(i);
      const label = await select.locator("..").innerText();
      const sourceCategory = exported.categories.find((c: any) =>
        label.includes(c.id),
      );
      expect(sourceCategory).toBeTruthy();
      const target = state.categories.find(
        (c: any) =>
          c.type === sourceCategory.type && c.name === sourceCategory.name,
      );
      await select.selectOption(target.id);
    }
    if (count)
      await page.getByRole("button", { name: "预检导入", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "确认事务导入", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "确认事务导入", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "导入完成" })).toBeVisible();
    const restored = await (await page.request.get("/api/state")).json();
    expect(
      restored.ledger.filter((e: any) => e.title === "往返物品"),
    ).toHaveLength(1);
    expect(
      restored.savings
        .filter(
          (s: any) =>
            s.status === "valid" &&
            !s.suppressed &&
            !s.supersededBySettlementId,
        )
        .reduce((n: number, s: any) => n + s.amount, 0),
    ).toBe(20000);
    const importedItem = restored.shopping.find(
      (s: any) => s.name === "往返物品",
    );
    expect(
      restored.ledger.find((e: any) => e.id === importedItem.ledgerId)
        .sourceShoppingItemId,
    ).toBe(importedItem.id);
    await page.getByRole("button", { name: "预检导入", exact: true }).click();
    await expect(page.getByText(/新增 0 条 · 重复/)).toBeVisible();
    await page
      .getByRole("button", { name: "确认事务导入", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "导入完成" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    const evidence = process.env.E2E_EVIDENCE_DIR || `data/cloudflare-verification/${randomUUID()}`;
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      fullPage: true,
    });
    await writeFile(
      `${evidence}/${mobile ? "mobile" : "desktop"}-ui.json`,
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          width: mobile ? 390 : 1440,
          noHorizontalOverflow: true,
          pageErrors: errors,
          saving: 20000,
          repeatedImportAdded: 0,
        },
        null,
        2,
      ),
    );
  });
}
