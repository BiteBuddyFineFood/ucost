export const entryTypes = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  refund: "退款",
};
export const savingTypes = {
  budget_surplus: "预算结余",
  discount: "优惠省下",
  skipped: "不买了",
  downgrade: "降级购买",
  reduced: "减少开支",
};
export const sourceLabels: Record<string, string> = {
  settlement: "清单结算",
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
export const categoryIcons: Record<string, string> = {
  tag: "通用",
  utensils: "餐饮",
  coffee: "咖啡茶饮",
  "shopping-bag": "购物",
  home: "居家",
  car: "汽车",
  bus: "公共交通",
  fuel: "加油",
  phone: "数码",
  shirt: "衣物",
  "heart-pulse": "健康",
  stethoscope: "医疗",
  dumbbell: "运动",
  "gamepad-2": "娱乐",
  film: "影音",
  "book-open": "阅读学习",
  "graduation-cap": "教育",
  plane: "旅行",
  "paw-print": "宠物",
  gift: "礼物",
  baby: "母婴",
  briefcase: "工作",
  landmark: "金融",
  wifi: "通讯",
  receipt: "账单",
  wallet: "钱包",
  "piggy-bank": "储蓄",
  sparkles: "其他",
};
export const categoryColors: Record<string, string> = {
  "": "默认",
  "#6F7F63": "苔绿",
  "#B7794B": "陶土",
  "#C4A24A": "麦黄",
  "#8C6A8E": "梅紫",
  "#5B7C99": "雾蓝",
  "#B05B5B": "砖红",
  "#6E8B74": "青绿",
  "#A4775B": "木棕",
  "#7A7A8C": "灰紫",
};
export const draftTargetLabels: Record<string, string> = {
  auto: "待判断归属",
  ledger: "账本",
  shopping: "购物清单",
  items: "物品档案",
  savings: "省钱罐",
  text: "普通备忘",
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

export function effectiveSaving(saving: {
  status: string;
  suppressed?: boolean;
  supersededBySettlementId?: string | null;
}) {
  return (
    saving.status === "valid" &&
    !saving.suppressed &&
    !saving.supersededBySettlementId
  );
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
