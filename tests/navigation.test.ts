import { describe, expect, it } from "vitest";
import {
  defaultNavigation,
  navigationFor,
  navigationIssue,
  normalizeNavigation,
  validateNavigation,
} from "@/lib/navigation";

describe("navigation preferences", () => {
  it("uses defaults when a user has no saved layout", () => {
    expect(navigationFor({})).toEqual(defaultNavigation);
    expect(navigationFor({ navigation: null })).toEqual(defaultNavigation);
  });

  it("moves extra mobile entries into more and fills missing modules", () => {
    const navigation = normalizeNavigation({
      mobile: {
        main: ["ledger", "dashboard", "shopping", "savings", "ledger"],
        more: ["items"],
      },
      desktop: defaultNavigation.desktop,
    });
    expect(navigation.mobile.main).toEqual([
      "ledger",
      "dashboard",
      "shopping",
    ]);
    expect(navigation.mobile.more.slice(0, 2)).toEqual(["items", "savings"]);
    expect(new Set([...navigation.mobile.main, ...navigation.mobile.more]).size).toBe(
      9,
    );
    expect(navigationIssue(navigation)).toBe("");
  });

  it("rejects duplicate, missing and oversized layouts", () => {
    expect(
      validateNavigation({
        ...defaultNavigation,
        mobile: {
          main: ["dashboard", "dashboard", "shopping"],
          more: ["items", "storage", "expiry", "savings", "reminders", "drafts"],
        },
      }),
    ).toEqual({ error: "导航入口不能重复" });
    expect(
      validateNavigation({
        ...defaultNavigation,
        desktop: { main: ["dashboard", "ledger"], more: [] },
      }),
    ).toEqual({ error: "导航入口必须完整分配" });
    expect(
      validateNavigation({
        ...defaultNavigation,
        mobile: {
          main: ["dashboard", "ledger", "shopping", "savings"],
          more: ["items", "storage", "expiry", "reminders", "drafts"],
        },
      }),
    ).toEqual({ error: "手机常用入口最多 3 个" });
  });

  it("accepts a complete custom layout", () => {
    const navigation = normalizeNavigation({
      mobile: {
        main: ["ledger", "shopping", "savings"],
        more: ["dashboard", "items", "storage", "expiry", "reminders", "drafts"],
      },
      desktop: {
        main: ["ledger", "shopping", "dashboard", "items", "storage", "savings"],
        more: ["expiry", "reminders", "drafts"],
      },
    });
    expect(validateNavigation(navigation)).toEqual({ value: navigation });
  });
});
