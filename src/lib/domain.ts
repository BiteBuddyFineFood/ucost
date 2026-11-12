export const entryTypes = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  refund: "退款",
};
export const savingTypes = {
  discount: "优惠省下",
  skipped: "不买了",
  downgrade: "降级购买",
  reduced: "减少开支",
};
export const sourceLabels: Record<string, string> = {
  automatic: "账单自动",
  manual: "手动记录",
  ai: "AI 整理",
  shopping: "购物决定",
};
export const shoppingStatuses: Record<string, string> = {
  considering: "考虑中",
  planned: "待购买",
  purchased: "已购买",
  skipped: "已放弃",
};
export const draftStates: Record<string, string> = {
  pending: "未整理",
  processing: "整理中",
  ready: "待确认",
  failed: "失败",
  applied: "已应用",
  ignored: "已忽略",
};
export const reviewStates: Record<string, string> = {
  open: "评议中",
  approved: "已通过",
  rejected: "未通过",
  revoked: "已撤销",
};
export const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export function cents(input: unknown): number {
  const str = String(input ?? "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(str)) throw new Error("金额最多保留两位小数");
  const neg = str.startsWith("-");
  const [a, b = ""] = str.replace(/^-/, "").split(".");
  const value = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value > 2_000_000_000)
    throw new Error("金额超出范围");
  return neg ? -value : value;
}
export function localDate(
  value: Date | string = new Date(),
  timezone = "Asia/Shanghai",
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function heldDays(
  purchased: string,
  retired?: string | null,
  today = localDate(),
) {
  return Math.max(
    1,
    Math.round(
      (Date.parse(retired || today) - Date.parse(purchased)) / 86_400_000,
    ) + 1,
  );
}
export function reviewResult(
  votes: { approve: boolean }[],
  count: number,
  rule: string,
) {
  if (votes.length < count) return "open";
  const yes = votes.filter((v) => v.approve).length;
  return (rule === "all" ? yes === count : yes > count / 2)
    ? "approved"
    : "rejected";
}
export function savingSplit(budget: number, paid: number, discount: number) {
  if (paid < 0 || discount < 0 || budget < paid + discount)
    throw new Error("预算必须覆盖优惠前金额，请核对降级与优惠");
  return {
    downgrade: budget - paid - discount,
    discount,
    total: budget - paid,
  };
}
export function totals(entries: { type: string; amount: number }[]) {
  const sum = (type: string) =>
    entries.filter((x) => x.type === type).reduce((a, x) => a + x.amount, 0);
  const income = sum("income"),
    expense = sum("expense"),
    refund = sum("refund");
  return {
    income,
    expense,
    refund,
    net: expense - refund,
    balance: income - expense + refund,
  };
}
export const defaultWidgets = [
  "summary",
  "trend",
  "savings",
  "categories",
  "recent",
  "accounts",
  "shopping",
  "items",
];
export const widgetNames: Record<string, string> = {
  summary: "收支概览",
  trend: "收支趋势",
  savings: "省钱罐",
  categories: "支出分类",
  recent: "最近账单",
  accounts: "账户余额",
  shopping: "待购清单",
  items: "物品成本",
};
