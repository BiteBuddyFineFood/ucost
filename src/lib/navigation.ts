export const navigationLabels = {
  dashboard: "统计",
  ledger: "账本",
  shopping: "清单",
  items: "物品成本",
  storage: "收纳管理",
  expiry: "保质期",
  savings: "省钱罐",
  reminders: "提醒",
  drafts: "待整理",
} as const;

export type NavigationKey = keyof typeof navigationLabels;
export type LayoutMode = "mobile" | "desktop";

export type NavigationGroup = {
  main: NavigationKey[];
  more: NavigationKey[];
};

export type NavigationPreferences = Record<LayoutMode, NavigationGroup>;

export const navigationKeys = Object.keys(navigationLabels) as NavigationKey[];

export const defaultNavigation: NavigationPreferences = {
  mobile: {
    main: ["dashboard", "ledger", "shopping"],
    more: ["items", "storage", "expiry", "savings", "reminders", "drafts"],
  },
  desktop: {
    main: ["dashboard", "ledger", "shopping", "items", "storage", "savings"],
    more: ["expiry", "reminders", "drafts"],
  },
};

function isNavigationKey(value: unknown): value is NavigationKey {
  return typeof value === "string" && value in navigationLabels;
}

function uniqueValidKeys(value: unknown): NavigationKey[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isNavigationKey))];
}

export function normalizeNavigation(value: unknown): NavigationPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result = {} as NavigationPreferences;
  (["mobile", "desktop"] as const).forEach((mode) => {
    const group =
      source[mode] && typeof source[mode] === "object"
        ? (source[mode] as Record<string, unknown>)
        : {};
    const main = uniqueValidKeys(group.main);
    const more = uniqueValidKeys(group.more).filter(
      (key) => !main.includes(key),
    );
    if (mode === "mobile" && main.length > 3) {
      more.push(...main.splice(3));
    }
    const assigned = new Set([...main, ...more]);
    navigationKeys.forEach((key) => {
      if (!assigned.has(key)) more.push(key);
    });
    result[mode] = { main, more: [...new Set(more)] };
  });
  return result;
}

export function navigationIssue(value: NavigationPreferences) {
  for (const mode of ["mobile", "desktop"] as const) {
    const { main, more } = value[mode];
    const keys = [...main, ...more];
    if (new Set(keys).size !== keys.length) return "导航入口不能重复";
    if (keys.length !== navigationKeys.length)
      return "导航入口必须完整分配";
    if (keys.some((key) => !isNavigationKey(key)))
      return "导航入口无效";
    if (!main.length) return "至少保留一个常用入口";
    if (mode === "mobile" && main.length > 3)
      return "手机常用入口最多 3 个";
  }
  return "";
}

export function validateNavigation(value: unknown) {
  if (!value || typeof value !== "object")
    return { error: "导航布局格式无效" } as const;
  const source = value as Record<string, any>;
  const result = {} as NavigationPreferences;
  for (const mode of ["mobile", "desktop"] as const) {
    const group = source[mode];
    if (
      !group ||
      !Array.isArray(group.main) ||
      !Array.isArray(group.more) ||
      group.main.some((key: unknown) => typeof key !== "string") ||
      group.more.some((key: unknown) => typeof key !== "string")
    )
      return { error: "导航布局格式无效" } as const;
    result[mode] = {
      main: [...group.main] as NavigationKey[],
      more: [...group.more] as NavigationKey[],
    };
  }
  const issue = navigationIssue(result);
  return issue ? ({ error: issue } as const) : ({ value: result } as const);
}

export function navigationFor(preferences: unknown): NavigationPreferences {
  const navigation =
    preferences && typeof preferences === "object"
      ? (preferences as Record<string, unknown>).navigation
      : undefined;
  return normalizeNavigation(navigation || defaultNavigation);
}
