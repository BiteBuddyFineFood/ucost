import type { Page } from "@playwright/test";

export async function openDesktopNavItem(page: Page, name: string) {
  const item = page
    .locator(".sidebar-more-list")
    .getByRole("button", { name, exact: true });
  if (!(await item.isVisible())) {
    await page.locator(".sidebar-more > summary").click();
  }
  await item.click();
}

export async function openMobileActions(page: Page) {
  const toggle = page.getByRole("button", { name: "操作", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}
