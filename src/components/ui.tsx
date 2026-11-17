"use client";
import { useEffect, useRef, useState } from "react";
import {
  X,
  LoaderCircle,
  PencilLine,
  Tag,
  Utensils,
  Coffee,
  ShoppingBag,
  Home,
  Car,
  Bus,
  Fuel,
  Smartphone,
  Shirt,
  HeartPulse,
  Stethoscope,
  Dumbbell,
  Gamepad2,
  Film,
  BookOpen,
  GraduationCap,
  Plane,
  PawPrint,
  Gift,
  Baby,
  Briefcase,
  Landmark,
  Wifi,
  Receipt,
  Wallet,
  PiggyBank,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { categoryColors, categoryIcons, cents, localDate } from "@/lib/domain";

const categoryIconComponents: Record<string, LucideIcon> = {
  tag: Tag,
  utensils: Utensils,
  coffee: Coffee,
  "shopping-bag": ShoppingBag,
  home: Home,
  car: Car,
  bus: Bus,
  fuel: Fuel,
  phone: Smartphone,
  shirt: Shirt,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  "gamepad-2": Gamepad2,
  film: Film,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  plane: Plane,
  "paw-print": PawPrint,
  gift: Gift,
  baby: Baby,
  briefcase: Briefcase,
  landmark: Landmark,
  wifi: Wifi,
  receipt: Receipt,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  sparkles: Sparkles,
};

export function CategoryMark({
  category,
  size = 16,
}: {
  category?: { iconKey?: string | null; color?: string | null } | null;
  size?: number;
}) {
  const Icon = categoryIconComponents[category?.iconKey || ""] || Tag;
  return (
    <span
      className="category-mark"
      style={category?.color ? { color: category.color } : undefined}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

export async function api(path: string, body?: unknown) {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            ...(body as object),
          }),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
export function Modal({
  title,
  children,
  close,
  wide = false,
  sheet = false,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
  sheet?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""} ${sheet ? "sheet" : ""} ${className}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title = "这里还空着",
  text = "添加第一条记录，让日常慢慢有数。",
  action,
}: {
  title?: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <PencilLine size={32} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Busy({ text = "处理中…" }: { text?: string }) {
  return (
    <span className="busy">
      <LoaderCircle className="spin" size={16} />
      {text}
    </span>
  );
}
export function Jar({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={`jar ${small ? "small" : ""}`}
      viewBox="0 0 220 190"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M77 38C72 27 79 23 91 25L150 27C164 27 164 39 151 42"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M80 43C80 58 56 63 51 81C44 108 48 148 61 161C78 176 159 174 174 158C183 144 186 99 177 79C169 64 151 60 151 43Z"
        fill="#E6EEE4"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M72 96C98 87 139 89 164 97M71 101C68 125 71 148 83 152"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M98 37L135 38"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle
        cx="120"
        cy="118"
        r="21"
        fill="#F0D98F"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M114 109L120 117L126 109M113 118H128M113 124H128M120 117V130"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M41 46L34 38M184 43L192 35M38 68L27 67"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="121"
        cy="9"
        rx="15"
        ry="6"
        transform="rotate(18 121 9)"
        fill="#F0D98F"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  disabled?: boolean;
};
export function fieldsFor(entity: string, data: any, state: any): Field[] {
  if (entity === "conversion")
    return [
      {
        key: "itemId",
        label: "已有购物物品（请核对关联）",
        type: "select",
        options: [
          { value: "", label: "请选择" },
          ...state.shopping
            .filter((s: any) => ["considering", "planned"].includes(s.status))
            .map((s: any) => ({
              value: s.id,
              label: `${s.name} · ${state.lists.find((l: any) => l.id === s.listId)?.name || ""}`,
            })),
        ],
      },
      {
        key: "mode",
        label: "这次决定",
        type: "select",
        options: [
          { value: "buy", label: "买到了" },
          { value: "skip", label: "不买了" },
        ],
      },
      { key: "date", label: "发生日期", type: "date" },
      { key: "paid", label: "实际付款（元）", type: "money" },
      { key: "discount", label: "真实优惠（元）", type: "money" },
      { key: "planned", label: "原计划金额（元）", type: "money" },
      {
        key: "categoryId",
        label: "支出分类",
        type: "select",
        options: [
          { value: "", label: "未分类" },
          ...(state.categories || [])
            .filter(
              (c: any) =>
                c.type === "expense" &&
                (!c.archived || c.id === data.categoryId),
            )
            .map((c: any) => ({ value: c.id, label: c.name })),
        ],
      },
      {
        key: "accountId",
        label: "付款账户",
        type: "select",
        options: [
          { value: "", label: "不指定账户" },
          ...(state.accounts || [])
            .filter((a: any) => !a.archived || a.id === data.accountId)
            .map((a: any) => ({ value: a.id, label: a.name })),
        ],
      },
      {
        key: "createLedger",
        label: "生成实际支出及其优惠省钱",
        type: "checkbox",
      },
      { key: "createItem", label: "建立物品档案", type: "checkbox" },
      {
        key: "createSaving",
        label: "记录不买/降级省钱（自动扣除已计优惠）",
        type: "checkbox",
      },
    ];
  const accounts = [
    { value: "", label: "暂不指定" },
    ...(state.accounts || [])
      .filter((x: any) => !x.archived || data.accountId === x.id)
      .map((x: any) => ({ value: x.id, label: x.name })),
  ];
  if (entity === "ledger")
    return [
      {
        key: "type",
        label: "类型",
        type: "select",
        disabled: !!data.id,
        options: [
          { value: "expense", label: "支出" },
          { value: "income", label: "收入" },
          { value: "transfer", label: "转账" },
          { value: "refund", label: "退款" },
        ],
      },
      { key: "title", label: "记什么", required: true },
      { key: "amount", label: "实际金额（元）", type: "money", required: true },
      { key: "date", label: "发生日期", type: "date", required: true },
      {
        key: "accountId",
        label: data.type === "transfer" ? "转出账户" : "账户",
        type: "select",
        options: accounts,
      },
      ...(data.type === "transfer"
        ? [
            {
              key: "toAccountId",
              label: "转入账户",
              type: "select",
              options: accounts,
            },
          ]
        : []),
      ...(["income", "expense"].includes(data.type)
        ? [
            {
              key: "categoryId",
              label: "分类",
              type: "select",
              options: [
                { value: "", label: "未分类" },
                ...(state.categories || [])
                  .filter(
                    (c: any) =>
                      c.type === data.type &&
                      (!c.archived || c.id === data.categoryId),
                  )
                  .map((c: any) => ({ value: c.id, label: c.name })),
              ],
            },
          ]
        : []),
      ...(data.type === "refund"
        ? [
            {
              key: "refundOfId",
              label: "原支出",
              type: "select",
              options: [
                { value: "", label: "请选择" },
                ...(state.ledger || [])
                  .filter((e: any) => e.type === "expense")
                  .map((e: any) => ({
                    value: e.id,
                    label: `${e.title} · ${e.date} · ¥${(e.amount / 100).toFixed(2)}`,
                  })),
              ],
            },
          ]
        : []),
      {
        key: "groupId",
        label: "记录分组",
        type: "select",
        options: [
          { value: "", label: "未分组" },
          ...(state.groups || []).map((g: any) => ({
            value: g.id,
            label: `${g.name}${
              g.sourceDeleted
                ? " · 来源清单已删除"
                : g.sourceListId
                  ? " · 清单来源"
                  : ""
            }`,
          })),
        ],
      },
      ...(data.type === "expense"
        ? [
            { key: "discount", label: "真实优惠（元）", type: "money" },
            {
              key: "grossAmount",
              label: "优惠前应付（元，含费用）",
              type: "money",
              hint: "应等于实付 + 优惠；划线价不算优惠。",
            },
            { key: "discountDetails", label: "优惠说明" },
            {
              key: "autoSaving",
              label: "确认时自动把优惠记入省钱罐",
              type: "checkbox",
            },
          ]
        : []),
      { key: "note", label: "备注", type: "textarea" },
    ];
  if (entity === "lists")
    return [
      { key: "name", label: "清单名称", required: true },
      {
        key: "kind",
        label: "用途",
        type: "select",
        options: [
          { value: "shopping", label: "购物清单" },
          { value: "travel", label: "出行清单" },
          { value: "normal", label: "普通清单" },
        ],
        hint: data.id
          ? "有内容的清单不能直接更改用途；空清单可直接调整。"
          : "购物保留预算和记账；出行与普通清单不产生财务记录。",
      },
      ...(data.kind === "travel"
        ? [{ key: "departureDate", label: "出发日期", type: "date" }]
        : []),
      ...(data.kind === "shopping"
        ? [
            {
              key: "budget",
              label: "清单总预算（元，可不设置）",
              type: "money",
            },
          ]
        : []),
      { key: "description", label: "说明", type: "textarea" },
      { key: "archived", label: "归档清单", type: "checkbox" },
    ];
  if (entity === "shopping") {
    const list = state.lists.find((row: any) => row.id === data.listId);
    if (list && list.kind !== "shopping")
      return [
        {
          key: "listId",
          label: "放进哪个清单",
          type: "select",
          options: state.lists
            .filter((x: any) => !x.archived)
            .map((x: any) => ({ value: x.id, label: x.name })),
        },
        { key: "name", label: "条目名称", required: true },
        { key: "quantity", label: "数量 / 单位（可选）" },
        {
          key: "groupName",
          label: "分组",
          hint: "例如：证件、衣物、洗漱；不占用账本分类。",
        },
        { key: "note", label: "备注", type: "textarea" },
        { key: "done", label: "已准备完成", type: "checkbox" },
      ];
    return [
      {
        key: "listId",
        label: "放进哪个清单",
        type: "select",
        options: state.lists
          .filter((x: any) => !x.archived)
          .map((x: any) => ({ value: x.id, label: x.name })),
      },
      { key: "name", label: "物品名称", required: true },
      { key: "quantity", label: "数量 / 单位" },
      { key: "budget", label: "预计总预算（元）", type: "money" },
      {
        key: "categoryId",
        label: "支出分类（入账时继承）",
        type: "select",
        options: [
          { value: "", label: "未分类" },
          ...(state.categories || [])
            .filter(
              (c: any) =>
                c.type === "expense" &&
                (!c.archived || c.id === data.categoryId),
            )
            .map((c: any) => ({ value: c.id, label: c.name })),
        ],
      },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: [
          { value: "considering", label: "考虑中" },
          { value: "planned", label: "待购买" },
          ...(["purchased", "skipped"].includes(data.status)
            ? [
                {
                  value: data.status,
                  label: data.status === "purchased" ? "已购买" : "已放弃",
                },
              ]
            : []),
        ],
      },
      ...[
        ["reason", "为什么想买"],
        ["requirements", "在意的条件 / 主要用途"],
        ["concerns", "顾虑"],
        ["alternatives", "备选项"],
        ["timing", "什么时候买"],
        ["note", "自己的备注"],
      ].map(([key, label]) => ({ key, label, type: "textarea" })),
    ];
  }
  if (entity === "itemUpdate")
    return [
      {
        key: "itemId",
        label: "要修改哪件物品",
        type: "select",
        options: [
          { value: "", label: "请选择" },
          ...(state.items || [])
            .filter((item: any) => item.status === "active")
            .map((item: any) => ({
              value: item.id,
              label: `${item.name} · 现有 ${item.quantity || 0}${item.unit || ""}${
                item.location ? ` · ${item.location}` : ""
              }${item.expiresOn ? ` · 到期 ${item.expiresOn}` : ""}`,
            })),
        ],
      },
      { key: "quantity", label: "修改后的数量", type: "number" },
      { key: "unit", label: "单位" },
      { key: "location", label: "修改后的位置" },
      {
        key: "boxId",
        label: "收纳箱",
        type: "select",
        options: [
          { value: "", label: "不放进箱子" },
          ...(state.boxes || []).map((box: any) => ({
            value: box.id,
            label: `${box.name}${box.location ? ` · ${box.location}` : ""}`,
          })),
        ],
      },
      { key: "expiresOn", label: "修改后的到期日", type: "date" },
      {
        key: "status",
        label: "状态",
        type: "select",
        options: [
          { value: "", label: "保持原状态" },
          { value: "active", label: "在用" },
          { value: "used", label: "已用完" },
          { value: "discarded", label: "已丢弃" },
          { value: "archived", label: "已归档" },
        ],
      },
      { key: "note", label: "备注", type: "textarea" },
    ];
  if (entity === "reminder")
    return [
      {
        key: "targetId",
        label: "提醒哪件物品",
        type: "select",
        options: [
          { value: "", label: "跟随同批新物品 / 请选择" },
          ...(state.items || [])
            .filter((item: any) => item.status === "active")
            .map((item: any) => ({
              value: item.id,
              label: `${item.name}${item.expiresOn ? ` · 到期 ${item.expiresOn}` : ""}`,
            })),
        ],
      },
      {
        key: "triggerType",
        label: "提醒方式",
        type: "select",
        options: [
          { value: "relative", label: "按到期日提前" },
          { value: "fixed", label: "固定时间" },
        ],
      },
      {
        key: "offsetDays",
        label: "提前天数",
        type: "number",
        hint: "0 表示到期当天。",
      },
      { key: "fixedAt", label: "固定提醒时间", type: "datetime-local" },
      { key: "localTime", label: "每天提醒时间", hint: "例如 09:00" },
      { key: "timezone", label: "时区", hint: "默认跟随账户时区。" },
      { key: "enabled", label: "启用提醒", type: "checkbox" },
    ];
  if (entity === "items")
    return [
      { key: "name", label: "物品名称", required: true },
      { key: "quantity", label: "数量", type: "number" },
      { key: "unit", label: "单位", hint: "例如件、盒、瓶。" },
      { key: "purchaseDate", label: "购入日期（算成本时填写）", type: "date" },
      {
        key: "price",
        label: "购入金额（元）",
        type: "money",
        disabled: !!data.ledgerId,
        hint: data.ledgerId
          ? "跟随关联购入账单，修改价格请去账本。"
          : undefined,
      },
      ...(!data.id
        ? [
            {
              key: "initialUseCount",
              label: "已经用过几次（可选）",
              type: "number",
            },
          ]
        : []),
      {
        key: "recovery",
        label: "回收金额（元）",
        type: "money",
        hint: "仅影响成本，实际收到的钱请另记收入。",
      },
      { key: "retiredDate", label: "退役日期（仍在用可留空）", type: "date" },
      { key: "costEnabled", label: "计算物品成本", type: "checkbox" },
      {
        key: "mode",
        label: "默认成本口径",
        type: "select",
        options: [
          { value: "day", label: "按天" },
          { value: "use", label: "按次数" },
        ],
      },
      {
        key: "storageEnabled",
        label: "登记收纳位置",
        type: "checkbox",
      },
      { key: "location", label: "收纳位置" },
      {
        key: "boxId",
        label: "收纳箱",
        type: "select",
        options: [
          { value: "", label: "不放进箱子" },
          ...(state.boxes || []).map((box: any) => ({
            value: box.id,
            label: `${box.name}${box.location ? ` · ${box.location}` : ""}`,
          })),
        ],
      },
      {
        key: "expiryEnabled",
        label: "登记保质期",
        type: "checkbox",
      },
      { key: "expiresOn", label: "到期日", type: "date" },
      { key: "note", label: "备注", type: "textarea" },
    ];
  if (entity === "savings")
    return [
      { key: "title", label: "这次省了什么", required: true },
      {
        key: "type",
        label: "省钱方式",
        type: "select",
        disabled: data.source === "automatic",
        options: [
          { value: "skipped", label: "不买了" },
          { value: "downgrade", label: "降级购买" },
          { value: "reduced", label: "减少开支" },
          { value: "discount", label: "优惠省下" },
        ],
      },
      {
        key: "date",
        label: "发生日期",
        type: "date",
        disabled: data.source === "automatic",
      },
      {
        key: "planned",
        label: "原计划金额（元）",
        type: "money",
        disabled: data.source === "automatic",
      },
      {
        key: "actual",
        label: "实际金额（元）",
        type: "money",
        disabled: data.source === "automatic",
      },
      {
        key: "amount",
        label: "省下金额（元）",
        type: "money",
        disabled: data.source === "automatic",
        hint: "不买 / 降级会按原计划与实际金额自动校正。",
      },
      { key: "note", label: "原因 / 备注", type: "textarea" },
    ];
  if (entity === "accounts")
    return [
      { key: "name", label: "账户名称", required: true },
      {
        key: "opening",
        label: "期初余额（元）",
        type: "money",
        required: true,
      },
      { key: "archived", label: "归档账户", type: "checkbox" },
    ];
  return [
    { key: "name", label: "分类名称", required: true },
    {
      key: "type",
      label: "类型",
      type: "select",
      options: [
        { value: "expense", label: "支出" },
        { value: "income", label: "收入" },
      ],
    },
    {
      key: "iconKey",
      label: "图标",
      type: "select",
      options: Object.entries(categoryIcons).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      key: "color",
      label: "颜色",
      type: "select",
      options: Object.entries(categoryColors).map(([value, label]) => ({
        value,
        label,
      })),
    },
    { key: "archived", label: "归档分类", type: "checkbox" },
  ];
}
export function initialData(entity: string, state: any, extra: any = {}) {
  const defaultAccount = state.accounts?.some(
    (account: any) =>
      account.id === state.user?.defaultExpenseAccountId && !account.archived,
  )
    ? state.user.defaultExpenseAccountId
    : null;
  const defaults: Record<string, any> = {
    conversion: {
      mode: "buy",
      date: localDate(),
      paid: null,
      discount: 0,
      createLedger: true,
      createItem: false,
      createSaving: false,
      accountId: defaultAccount,
      categoryId: null,
    },
    ledger: {
      type: "expense",
      title: "",
      date: localDate(),
      amount: null,
      discount: 0,
      autoSaving: true,
      note: "",
      accountId: defaultAccount,
    },
    shopping: {
      name: "",
      listId: state.lists?.find((x: any) => !x.archived)?.id || "",
      status: "considering",
      categoryId: null,
    },
    lists: { name: "", kind: "shopping", archived: false },
    items: {
      name: "",
      quantity: 1,
      unit: "件",
      purchaseDate: localDate(),
      price: null,
      recovery: 0,
      mode: "day",
      costEnabled: false,
      storageEnabled: false,
      expiryEnabled: false,
    },
    itemUpdate: {
      itemId: null,
      itemVersion: null,
      quantity: null,
      unit: "",
      location: "",
      boxId: null,
      expiresOn: null,
      status: "",
      note: "",
    },
    reminder: {
      targetId: null,
      triggerType: "relative",
      offsetDays: 0,
      localTime: "09:00",
      timezone: state.user?.timezone || "Asia/Shanghai",
      enabled: true,
    },
    savings: { title: "", type: "skipped", date: localDate(), amount: null },
    accounts: { name: "", opening: 0 },
    categories: { name: "", type: "expense", iconKey: "tag", color: "" },
  };
  return { ...defaults[entity], ...extra };
}
export function FieldInput({
  field,
  value,
  set,
}: {
  field: Field;
  value: any;
  set: (v: any) => void;
}) {
  const [raw, setRaw] = useState(value == null ? "" : String(value / 100));
  useEffect(() => {
    if (field.type === "money")
      setRaw(value == null ? "" : String(value / 100));
  }, [value, field.type]);
  if (field.type === "checkbox")
    return (
      <label className="check-field">
        <input
          type="checkbox"
          checked={!!value}
          disabled={field.disabled}
          onChange={(e) => set(e.target.checked)}
        />
        {field.label}
      </label>
    );
  return (
    <label className={`field ${field.type === "textarea" ? "full" : ""}`}>
      <span>
        {field.label}
        {field.required && " *"}
      </span>
      {field.type === "select" ? (
        <select
          value={value ?? ""}
          disabled={field.disabled}
          onChange={(e) => set(e.target.value || null)}
        >
          {field.options?.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value ?? ""}
          disabled={field.disabled}
          rows={2}
          onChange={(e) => set(e.target.value)}
        />
      ) : field.type === "money" ? (
        <input
          value={raw}
          disabled={field.disabled}
          inputMode="decimal"
          onChange={(e) => {
            const s = e.target.value;
            setRaw(s);
            if (!s) set(null);
            else {
              try {
                set(cents(s));
              } catch {
                /* keep incomplete input until blur */
              }
            }
          }}
          onBlur={() => {
            if (raw) {
              try {
                set(cents(raw));
              } catch {
                setRaw(value == null ? "" : String(value / 100));
              }
            }
          }}
          required={field.required}
        />
      ) : (
        <input
          type={field.type || "text"}
          value={value ?? ""}
          disabled={field.disabled}
          required={field.required}
          onChange={(e) =>
            set(
              field.type === "number"
                ? e.target.value
                  ? Number(e.target.value)
                  : null
                : e.target.value || (field.type === "date" ? null : ""),
            )
          }
        />
      )}
      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}
export function Editor({
  entity,
  record,
  state,
  save,
  close,
}: {
  entity: string;
  record: any;
  state: any;
  save: (data: any) => Promise<void>;
  close: () => void;
}) {
  const [data, setData] = useState(initialData(entity, state, record));
  const [extraItems, setExtraItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const titles: Record<string, string> = {
    ledger: "账单",
    shopping: "清单条目",
    lists: "清单",
    items: "物品档案",
    savings: "省钱记录",
    accounts: "账户",
    categories: "分类",
  };
  return (
    <Modal
      title={`${record?.id ? "编辑" : "添加"}${titles[entity]}`}
      close={close}
    >
      {record?.sourceDraftId && (
        <details>
          <summary>原始记录</summary>
          <p>
            {state.drafts.find((d: any) => d.id === record.sourceDraftId)
              ?.text || "原始草稿已删除"}
          </p>
        </details>
      )}
      {["ledger", "shopping", "items", "savings"].includes(entity) && (
        <InlineAI
          entity={entity}
          data={data}
          state={state}
          adopt={setData}
          report={setError}
        />
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({
              ...data,
              ...(extraItems.some((item) => String(item.name || "").trim())
                ? {
                    items: extraItems.filter((item) =>
                      String(item.name || "").trim(),
                    ),
                  }
                : {}),
            });
            close();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          {fieldsFor(entity, data, state).map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={data[field.key]}
              set={(v) => {
                if (field.key === "type") {
                  const defaultAccount = state.accounts?.some(
                    (account: any) =>
                      account.id === state.user?.defaultExpenseAccountId &&
                      !account.archived,
                  )
                    ? state.user.defaultExpenseAccountId
                    : null;
                  setData({
                    ...data,
                    type: v,
                    accountId:
                      v === "expense" &&
                      (data.accountId == null ||
                        data.accountId === state.user?.defaultExpenseAccountId)
                        ? defaultAccount
                        : v === "expense"
                          ? data.accountId
                          : null,
                  });
                  return;
                }
                setData({ ...data, [field.key]: v });
              }}
            />
          ))}
        </div>
        {entity === "ledger" && data.type === "expense" && (
          <section className="registration-box ledger-registration">
            <div className="ledger-registration-head">
              <div>
                <b>顺手登记物品（可选）</b>
                <p className="hint">
                  只保存来源说明快照，不继承本笔账单金额，也不会自动建立成本关联。
                </p>
              </div>
              <button
                type="button"
                className="button secondary compact"
                onClick={() =>
                  setExtraItems([
                    ...extraItems,
                    {
                      name: data.title || "",
                      quantity: 1,
                      unit: "件",
                      storageEnabled: false,
                      expiryEnabled: false,
                      expiresOn: "",
                      location: "",
                      costEnabled: false,
                      price: null,
                      purchaseDate: data.date || localDate(),
                    },
                  ])
                }
              >
                添加一行
              </button>
            </div>
            {extraItems.map((row, index) => {
              const patch = (values: any) =>
                setExtraItems(
                  extraItems.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, ...values } : item,
                  ),
                );
              return (
                <div className="ledger-item-row" key={index}>
                  <FieldInput
                    field={{ key: "name", label: "物品名称", required: true }}
                    value={row.name}
                    set={(value) => patch({ name: value })}
                  />
                  <div className="quantity-field">
                    <FieldInput
                      field={{ key: "quantity", label: "数量", type: "number" }}
                      value={row.quantity}
                      set={(value) => patch({ quantity: value ?? 0 })}
                    />
                    <FieldInput
                      field={{ key: "unit", label: "单位" }}
                      value={row.unit}
                      set={(value) => patch({ unit: value })}
                    />
                  </div>
                  <div className="ledger-item-toggles">
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={row.storageEnabled}
                        onChange={(e) =>
                          patch({ storageEnabled: e.target.checked })
                        }
                      />
                      收纳
                    </label>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={row.expiryEnabled}
                        onChange={(e) =>
                          patch({ expiryEnabled: e.target.checked })
                        }
                      />
                      保质期
                    </label>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={row.costEnabled}
                        onChange={(e) =>
                          patch({ costEnabled: e.target.checked })
                        }
                      />
                      独立成本
                    </label>
                  </div>
                  {row.storageEnabled && (
                    <FieldInput
                      field={{
                        key: "location",
                        label: "收纳位置",
                        hint: "例如：厨房 / 上层柜",
                      }}
                      value={row.location}
                      set={(value) => patch({ location: value })}
                    />
                  )}
                  {row.expiryEnabled && (
                    <FieldInput
                      field={{ key: "expiresOn", label: "到期日", type: "date" }}
                      value={row.expiresOn}
                      set={(value) => patch({ expiresOn: value })}
                    />
                  )}
                  {row.costEnabled && (
                    <>
                      <FieldInput
                        field={{
                          key: "price",
                          label: "这件物品的购入总价（元）",
                          type: "money",
                          hint: "独立确认，不按账单金额分摊。",
                        }}
                        value={row.price}
                        set={(value) => patch({ price: value })}
                      />
                      <FieldInput
                        field={{
                          key: "purchaseDate",
                          label: "购入日期",
                          type: "date",
                        }}
                        value={row.purchaseDate}
                        set={(value) => patch({ purchaseDate: value })}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() =>
                      setExtraItems(
                        extraItems.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    移除这一行
                  </button>
                </div>
              );
            })}
          </section>
        )}
        {data.source === "automatic" && (
          <p className="hint">
            自动优惠的金额与日期跟随原账单，请到关联账单修改。
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="button secondary" onClick={close}>
            取消
          </button>
          <button className="button" disabled={busy}>
            {busy ? <Busy /> : "保存"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function InlineAI({ entity, data, state, adopt, report }: any) {
  const allowed = !!state.ai?.allowed;
  const [description, setDescription] = useState(""),
    [suggestion, setSuggestion] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const fields = suggestion
    ? fieldsFor(entity, { ...data, ...suggestion.data }, state).filter(
        (f) => suggestion.data[f.key] !== undefined,
      )
    : [];
  return (
    <details className="inline-ai">
      <summary>懒得填？说说想记什么、想改什么</summary>
      <textarea
        aria-label="AI 表单整理要求"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="可以直接用键盘语音输入一段话"
      />
      <button
        className="button secondary"
        disabled={busy || !description.trim() || !allowed}
        onClick={async () => {
          setBusy(true);
          report("");
          try {
            setSuggestion(
              await api("suggest", {
                target: entity,
                text: description,
                currentForm: data,
              }),
            );
          } catch (e) {
            report((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Busy /> : "帮我整理"}
      </button>
      {suggestion && (
        <div className="suggestion-preview">
          <p>以下是建议，采用后仍可继续修改：</p>
          <dl>
            {fields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {f.type === "money"
                    ? suggestion.data[f.key] == null
                      ? "未确定"
                      : `¥${(Number(suggestion.data[f.key]) / 100).toFixed(2)}`
                    : f.type === "select"
                      ? f.options?.find(
                          (o) => o.value === suggestion.data[f.key],
                        )?.label || "待确认"
                      : f.type === "checkbox"
                        ? suggestion.data[f.key]
                          ? "是"
                          : "否"
                        : String(suggestion.data[f.key] ?? "未确定")}
                </dd>
              </div>
            ))}
          </dl>
          {suggestion.warnings?.map((w: string) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
          <div className="row-actions">
            <button
              className="button secondary compact"
              onClick={() => setSuggestion(null)}
            >
              取消建议
            </button>
            <button
              className="button compact"
              onClick={() => {
                const allowed = new Set(
                  fields.filter((f) => !f.disabled).map((f) => f.key),
                );
                const patch = Object.fromEntries(
                  Object.entries(suggestion.data).filter(([k]) =>
                    allowed.has(k),
                  ),
                );
                adopt({ ...data, ...patch });
                setSuggestion(null);
              }}
            >
              采用到表单
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
