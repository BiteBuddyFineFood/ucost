import { money, totals } from "./domain";
import {
  addDays,
  addMonths,
  endOfMonth,
  periodBounds,
  startOfWeek,
} from "./period";
import { reminderDueLabel } from "./reminder-time";

export type AssistantIntent =
  | "spend"
  | "item"
  | "expiry"
  | "list"
  | "history"
  | "reminders"
  | "overview"
  | "weekly"
  | "help"
  | "howto"
  | "unknown";

export type AssistantReference =
  | { type: "item"; id: string; label: string }
  | { type: "list"; id: string; label: string }
  | {
      type: "ledger";
      id?: string;
      label: string;
      start?: string;
      end?: string;
    }
  | { type: "shopping"; id: string; label: string }
  | { type: "page"; page: string; label: string }
  | { type: "reminders"; label: string };

export type AssistantAction = {
  type: "capture";
  target:
    | "auto"
    | "ledger"
    | "shopping"
    | "items"
    | "itemUpdate"
    | "reminder"
    | "savings";
  label: string;
  text?: string;
};

export type AssistantWritePlan = {
  target: AssistantAction["target"];
  label: string;
  reason: string;
  listId?: string | null;
};

export type AssistantFact = {
  label: string;
  value: string;
  note?: string;
};

export type AssistantRow = {
  id: string;
  title: string;
  meta: string;
  detail?: string;
  reference?: AssistantReference;
};

export type AssistantAnswer = {
  intent: AssistantIntent;
  title: string;
  body: string;
  facts?: AssistantFact[];
  rows?: AssistantRow[];
  references?: AssistantReference[];
  actions?: AssistantAction[];
  followUps?: string[];
  caution?: string;
  empty?: boolean;
};

export type AssistantContext = {
  page: string;
  listId?: string | null;
  listName?: string | null;
  today: string;
  timezone: string;
  reminders?: any[];
};

export type AssistantSuggestionIcon =
  | "search"
  | "wallet"
  | "calendar"
  | "list"
  | "history"
  | "bell"
  | "help"
  | "box";

export type AssistantSuggestionGroup = {
  label: string;
  items: { text: string; hint: string; icon: AssistantSuggestionIcon }[];
};

type Range = { start: string; end: string; label: string; explicit: boolean };

const filler = /[？?！!。，,、；;：:\s]/g;
const pageNames: Record<string, string> = {
  dashboard: "统计",
  ledger: "账本",
  shopping: "清单",
  items: "物品成本",
  storage: "收纳管理",
  expiry: "保质期",
  savings: "省钱罐",
  reminders: "提醒",
  drafts: "待整理",
  settings: "设置",
};
const itemStatuses: Record<string, string> = {
  active: "在用",
  used: "已用完",
  discarded: "已丢弃",
  archived: "已归档",
};
const relatedGroups = [
  ["洗衣", "洗衣粉", "洗衣液", "洗衣凝珠", "洗衣皂", "洗衣片"],
  ["牛奶", "鲜奶", "纯牛奶", "酸奶"],
  ["纸巾", "抽纸", "卷纸", "厨房纸", "湿巾"],
  ["充电", "充电线", "数据线", "充电器", "充电头"],
  ["牙膏", "牙刷", "漱口水", "牙线"],
  ["猫粮", "狗粮", "猫砂", "宠物粮"],
  ["咖啡", "咖啡豆", "咖啡粉", "挂耳"],
  ["电池", "干电池", "充电电池"],
];

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const has = (value: string, words: RegExp) => words.test(value);
const yuan = (value: number) => `¥${money(value)}`;
const dateRangeText = (range: Range) =>
  range.start === range.end ? range.start : `${range.start} 至 ${range.end}`;
const boxOf = (state: any, item: any) =>
  state.boxes?.find((box: any) => box.id === item.boxId);

function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

function listForQuestion(state: any, question: string) {
  const lists = (state.lists || []).filter((list: any) => !list.archived);
  return lists.find((list: any) => clean(list.name) && question.includes(clean(list.name)));
}

/**
 * Only explicit change requests enter the draft/confirmation path. Queries stay
 * deterministic and never create a draft just because they mention a record.
 */
export function assistantWritePlan(
  rawQuestion: string,
  state: any,
  context: AssistantContext,
): AssistantWritePlan | null {
  const question = clean(rawQuestion);
  if (!question) return null;
  const list = listForQuestion(state, question);
  const listId = list?.id || (context.page === "shopping" ? context.listId : null);
  if (
    has(
      question,
      /(?:花了|支出|消费|收入|进账|省了|退款)\s*(?:多少|几)|多少钱|收入多少/,
    )
  )
    return null;
  const hasMoney = has(
    question,
    /(?:\d+(?:\.\d{1,2})?|[零一二两三四五六七八九十百千万半]+)\s*(?:元|块|角|分)|实付|付款|到账|工资|收入|退款|报销/,
  );
  const hasItemLifecycle = has(
    question,
    /到期|保质期|放冰箱|放柜|收纳|还剩|剩下|用完|丢掉|数量|位置/,
  );
  const explicitReminder = has(
    question,
    /提醒我|帮我提醒|设个?提醒|加个?提醒|提前.{0,5}天提醒|到期提醒/,
  );
  const queryOnly = has(
    question,
    /在哪|哪儿|哪里|多少钱|花了多少|收入多少|还有多少|还剩多少|剩几个|有什么|哪些|还差|缺什么|买什么|带什么|准备什么|怎么用|能不能|可不可以|吗[？?]?$/,
  );
  const explicitUpdate = has(
    question,
    /改到|改成|移到|挪到|换个位置|放到|放进|更新到|到期日改|数量改|位置改|用完了|丢掉了|还剩\s*(?:了)?\s*\d+|剩下\s*\d+/,
  );
  const newPurchase = has(question, /买了|购入|新买|登记|录入/);
  if (
    (explicitReminder && (hasMoney || newPurchase || explicitUpdate)) ||
    (explicitUpdate && explicitReminder) ||
    (hasMoney && hasItemLifecycle && newPurchase)
  )
    return {
      target: "auto",
      label: "一段话多件事",
      reason: "会拆成账本、物品和提醒等候选，每一类都要你勾选确认。",
      listId,
    };

  if (
    explicitReminder &&
    !has(
      question,
      /有什么提醒|提醒.*吗|查看提醒|现在.*提醒|提醒我.*(?:什么|哪些|有没有)/,
    )
  )
    return {
      target: "reminder",
      label: "到期提醒",
      reason: "会先生成提醒预览，确认后只在你确认的记录上生效。",
      listId,
    };

  if (
    explicitUpdate &&
    !has(question, /放到哪|放在哪|在哪|哪儿|哪里|还剩多少|还剩几|剩下多少/)
  )
    return {
      target: "itemUpdate",
      label: "物品更新",
      reason: "会先列出原值和新值，确认后才会修改已有物品。",
      listId,
    };

  if (has(question, /(?:登记|新增|录入|添加)(?:一下|一个|一件|个|件)?(?:物品|东西|档案)/))
    return {
      target: "items",
      label: "物品档案",
      reason: "物品可以独立保存，不需要先有账单。",
      listId,
    };

  if (
    has(question, /(?:省了|省下|优惠|没买|不买了|降级|少花)/) &&
    !has(question, /花了|收入|工资|到账|退款|报销|转账|实付/)
  )
    return {
      target: "savings",
      label: "省钱罐",
      reason: "会先把这次省钱的依据和金额列出来，确认后入账。",
      listId,
    };

  if (
    has(question, /(?:记一笔|记个账|记账|花了|付了|实付|收入|工资|到账|退款|报销|转账)/) ||
    hasMoney
  ) {
    if (hasItemLifecycle) {
      return {
        target: "auto",
        label: "一段话多件事",
        reason: "会拆成账本、物品和提醒等候选，每一类都要你勾选确认。",
        listId,
      };
    }
    return {
      target: "ledger",
      label: "账本",
      reason: "会先生成一笔账目预览，确认后才写入账本。",
      listId,
    };
  }

  if (
    !queryOnly &&
    listId &&
    has(question, /再补|补充|加上|添加|要买|要带|准备|别忘了|还差|清单/)
  )
    return {
      target: "shopping",
      label: "清单条目",
      reason: "会按当前清单生成条目建议，确认后才加入清单。",
      listId,
    };

  if (
    !queryOnly &&
    hasItemLifecycle &&
    has(question, /买了|买|新买|购入|放进|放在|收纳/)
  )
    return {
      target: "auto",
      label: "一段话多件事",
      reason: "会先拆出物品、日期和提醒候选，确认后才保存。",
      listId,
    };

  return null;
}

export function assistantPageName(page: string) {
  return pageNames[page] || "当前页面";
}

function itemPlace(state: any, item: any) {
  const box = boxOf(state, item);
  if (box)
    return [box.name, box.location].filter(Boolean).join(" · ") || box.name;
  return clean(item.location) || "未登记位置";
}

function itemQuantity(item: any) {
  const quantity = Number(item.quantity ?? 1);
  return `${quantity} ${clean(item.unit) || "件"}`;
}

function itemExpiryText(item: any, today: string) {
  if (!item.expiresOn) return "未设置到期日";
  const days = Math.round(
    (Date.parse(dateOnly(item.expiresOn)) - Date.parse(today)) / 86_400_000,
  );
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  return `${dateOnly(item.expiresOn)} · 还有 ${days} 天`;
}

function lastConfirmed(value: unknown) {
  if (!value) return "";
  const date = new Date(value as any);
  return Number.isNaN(date.getTime())
    ? ""
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`;
}

export function questionRange(
  question: string,
  today: string,
  fallbackDays = 30,
): Range {
  if (has(question, /今天|今日/))
    return { start: today, end: today, label: "今天", explicit: true };
  if (has(question, /昨天|昨日/)) {
    const start = addDays(today, -1);
    return { start, end: start, label: "昨天", explicit: true };
  }
  if (has(question, /前天/)) {
    const start = addDays(today, -2);
    return { start, end: start, label: "前天", explicit: true };
  }
  if (has(question, /上周|上个星期|上星期|上礼拜|上个礼拜/)) {
    const start = addDays(startOfWeek(today), -7);
    return { start, end: addDays(start, 6), label: "上周", explicit: true };
  }
  if (has(question, /这周|本周|这一周|这个星期|这星期|这礼拜|本星期/)) {
    const start = startOfWeek(today);
    return { start, end: today, label: "本周", explicit: true };
  }
  if (has(question, /上个?月|上月/)) {
    const start = addMonths(`${today.slice(0, 7)}-01`, -1);
    return { start, end: endOfMonth(start), label: "上个月", explicit: true };
  }
  if (has(question, /这个月|本月|这月/)) {
    const start = `${today.slice(0, 7)}-01`;
    return { start, end: today, label: "本月", explicit: true };
  }
  if (has(question, /去年|上一年/)) {
    const start = `${Number(today.slice(0, 4)) - 1}-01-01`;
    return {
      start,
      end: `${start.slice(0, 4)}-12-31`,
      label: "去年",
      explicit: true,
    };
  }
  if (has(question, /今年|本年/)) {
    const start = `${today.slice(0, 4)}-01-01`;
    return { start, end: today, label: "今年", explicit: true };
  }
  if (has(question, /这半年|本半年|这个半年/)) {
    const range = periodBounds("half", today);
    return {
      start: range.start,
      end: today,
      label: "本半年度",
      explicit: true,
    };
  }
  if (has(question, /近?7天|近?一周|最近一个星期|最近一星期/)) {
    return {
      start: addDays(today, -6),
      end: today,
      label: "最近 7 天",
      explicit: true,
    };
  }
  if (has(question, /近?14天|近?两周|最近两个星期/)) {
    return {
      start: addDays(today, -13),
      end: today,
      label: "最近 14 天",
      explicit: true,
    };
  }
  if (has(question, /近?30天|最近一个月|近一个月|最近30天|近30天/)) {
    return {
      start: addDays(today, -29),
      end: today,
      label: "最近 30 天",
      explicit: true,
    };
  }
  if (has(question, /最近|近来/)) {
    return {
      start: addDays(today, -29),
      end: today,
      label: "最近 30 天",
      explicit: true,
    };
  }
  return {
    start: addDays(today, -(fallbackDays - 1)),
    end: today,
    label: `最近 ${fallbackDays} 天`,
    explicit: false,
  };
}

function matchScore(source: string, keyword: string) {
  const value = clean(source).toLowerCase();
  const term = keyword.toLowerCase();
  if (!value || !term) return 0;
  if (value === term) return 120;
  if (value.includes(term))
    return 90 - Math.min(20, value.length - term.length);
  if (term.includes(value) && value.length >= 2) return 66;
  return 0;
}

export function findItems(state: any, keyword: string) {
  const term = clean(keyword).toLowerCase();
  if (!term) return [];
  return (state.items || [])
    .map((item: any) => {
      const name = matchScore(item.name, term);
      const searchable = [
        item.note,
        item.sourceNote,
        item.location,
        boxOf(state, item)?.name,
        boxOf(state, item)?.location,
      ]
        .map((value) => matchScore(value, term))
        .sort((a, b) => b - a)[0];
      return { item, score: Math.max(name, searchable ? searchable - 20 : 0) };
    })
    .filter((row: any) => row.score > 0)
    .sort(
      (a: any, b: any) =>
        b.score - a.score ||
        Number(b.item.status === "active") - Number(a.item.status === "active"),
    )
    .map((row: any) => row.item);
}

function stripItemQuestion(question: string) {
  return clean(
    question
      .replace(
        /请问|帮我|麻烦|查一下|查查|看看|找找|找一下|我的|我|那个|这个|东西|物品|放在哪|放哪儿|放在哪里|放哪|在哪儿|在哪里|在哪|收纳|位置|有没有|一下|呢|吗|呀|啊/g,
        " ",
      )
      .replace(filler, " "),
  );
}

function itemAnswer(
  state: any,
  question: string,
  context: AssistantContext,
): AssistantAnswer {
  const keyword = stripItemQuestion(question);
  if (!keyword)
    return {
      intent: "item",
      title: "想找哪一件东西？",
      body: "告诉我物品名称就好，比如「护照在哪？」。我会从收纳位置、箱子和备注里找。",
      empty: true,
      followUps: (state.items || [])
        .filter((item: any) => item.status === "active")
        .slice(0, 3)
        .map((item: any) => `${item.name}在哪？`),
      references: [{ type: "page", page: "storage", label: "打开收纳管理" }],
    };
  const matches = findItems(state, keyword);
  if (!matches.length)
    return {
      intent: "item",
      title: `没有找到「${keyword}」`,
      body: "现有物品里没有这个名称。可以换个叫法，或先登记一件；不需要先有账单。",
      empty: true,
      actions: [{ type: "capture", target: "items", label: "去登记物品" }],
      references: [{ type: "page", page: "storage", label: "打开收纳管理" }],
    };
  if (matches.length > 1) {
    const sameName = matches.filter(
      (item: any) => clean(item.name).toLowerCase() === keyword.toLowerCase(),
    );
    const selected = sameName.length ? sameName : matches;
    return {
      intent: "item",
      title:
        selected.length > 1
          ? `找到 ${selected.length} 件相关物品，请选择`
          : `找到「${clean(matches[0].name)}」`,
      body:
        selected.length > 1
          ? "有多个同名或相近记录，我不替你猜是哪一件。点开对应记录查看位置和数量。"
          : "这是最接近的一条记录，可以点开核对。",
      rows: selected.slice(0, 6).map((item: any) => ({
        id: item.id,
        title: clean(item.name),
        meta: itemPlace(state, item),
        detail: `${itemQuantity(item)} · ${itemStatuses[item.status] || item.status}${
          item.expiryEnabled ? ` · ${itemExpiryText(item, context.today)}` : ""
        }`,
        reference: { type: "item", id: item.id, label: "查看物品" },
      })),
    };
  }
  const item = matches[0];
  const place = itemPlace(state, item);
  const confirmed = lastConfirmed(item.quantityConfirmedAt);
  return {
    intent: "item",
    title:
      place === "未登记位置"
        ? `${clean(item.name)}还没有登记位置`
        : `${clean(item.name)}在${place}`,
    body:
      place === "未登记位置"
        ? "这件物品已经登记，但没有填写收纳位置。可以打开记录补上。"
        : "位置来自收纳登记；多个同名批次会分别显示，不会自动合并数量。",
    facts: [
      { label: "数量", value: itemQuantity(item) },
      { label: "状态", value: itemStatuses[item.status] || clean(item.status) },
      ...(item.expiryEnabled
        ? [{ label: "保质期", value: itemExpiryText(item, context.today) }]
        : []),
      ...(confirmed
        ? [{ label: "数量确认", value: confirmed, note: "可按需核对" }]
        : []),
    ],
    references: [{ type: "item", id: item.id, label: "查看物品" }],
  };
}

function spendAnswer(
  state: any,
  question: string,
  context: AssistantContext,
): AssistantAnswer {
  const range = questionRange(question, context.today, 30);
  const entries = (state.ledger || []).filter(
    (entry: any) => entry.date >= range.start && entry.date <= range.end,
  );
  const sum = totals(entries);
  const incomeMode =
    has(question, /收入|进账|赚了|挣了/) &&
    !has(question, /花了|支出|消费|开销/);
  const references: AssistantReference[] = [
    {
      type: "ledger",
      label: "查看这段时间的账本",
      start: range.start,
      end: range.end,
    },
  ];
  if (incomeMode)
    return {
      intent: "spend",
      title: `${range.label}收入 ${yuan(sum.income)}`,
      body: `${dateRangeText(range)}，共记录 ${entries.filter((x: any) => x.type === "income").length} 笔收入。转账不计入收支。`,
      facts: [
        { label: "收入", value: yuan(sum.income) },
        { label: "范围", value: range.label },
      ],
      references,
      empty: sum.income === 0,
      caution: range.explicit
        ? undefined
        : "没有识别到明确时间，先按最近 30 天回答。",
    };
  return {
    intent: "spend",
    title:
      sum.expense === 0 && sum.refund === 0
        ? `${range.label}还没有支出记录`
        : `${range.label}净支出 ${yuan(sum.net)}`,
    body:
      sum.expense === 0 && sum.refund === 0
        ? `${dateRangeText(range)}没有支出或退款记录。`
        : `${dateRangeText(range)}，支出 ${yuan(sum.expense)}，退款 ${yuan(sum.refund)}。净支出为支出减退款。`,
    facts: [
      { label: "支出", value: yuan(sum.expense) },
      { label: "退款", value: yuan(sum.refund) },
      { label: "净支出", value: yuan(sum.net) },
      { label: "记录", value: `${entries.length} 笔` },
    ],
    references,
    empty: sum.expense === 0 && sum.refund === 0,
    caution: range.explicit
      ? "转账不计入支出。"
      : "没有识别到明确时间，先按最近 30 天回答；转账不计入支出。",
  };
}

function expiryAnswer(
  state: any,
  question: string,
  context: AssistantContext,
): AssistantAnswer {
  const windowDays = has(question, /这个月|本月|30天|一个月/)
    ? 30
    : has(question, /两周|14天|两个星期/)
      ? 14
      : 7;
  const active = (state.items || []).filter(
    (item: any) =>
      item.status === "active" &&
      item.expiryEnabled &&
      item.expiresOn &&
      Number(item.quantity ?? 1) > 0,
  );
  const rows = active
    .map((item: any) => {
      const days = Math.round(
        (Date.parse(dateOnly(item.expiresOn)) - Date.parse(context.today)) /
          86_400_000,
      );
      return { item, days };
    })
    .filter((row: any) => row.days <= windowDays)
    .sort((a: any, b: any) => a.days - b.days);
  const expired = rows.filter((row: any) => row.days < 0).length;
  const today = rows.filter((row: any) => row.days === 0).length;
  if (!rows.length)
    return {
      intent: "expiry",
      title: "接下来没有临期物品",
      body: `没有找到 ${windowDays} 天内到期或已经过期的有效物品。到期当天仍算今天到期，不提前报到过期。`,
      empty: true,
      facts: [
        { label: "查看窗口", value: `${windowDays} 天` },
        { label: "有效物品", value: `${active.length} 件` },
      ],
      references: [{ type: "page", page: "expiry", label: "打开保质期" }],
    };
  return {
    intent: "expiry",
    title:
      expired > 0
        ? `${expired} 件已过期，另有 ${rows.length - expired} 件要留意`
        : `${rows.length} 件物品在 ${windowDays} 天内到期`,
    body:
      expired > 0
        ? "先处理已过期和今天到期的物品，再核对临近日期。这里只按登记日期排序，不判断食物是否仍然安全。"
        : "可以按到期日优先使用；日期来自包装或你的登记，不会按食品种类猜测。",
    facts: [
      ...(expired ? [{ label: "已过期", value: `${expired} 件` }] : []),
      ...(today ? [{ label: "今天到期", value: `${today} 件` }] : []),
      { label: "窗口", value: `未来 ${windowDays} 天` },
    ],
    rows: rows.slice(0, 8).map(({ item, days }: any) => ({
      id: item.id,
      title: clean(item.name),
      meta: itemExpiryText(item, context.today),
      detail: `${itemQuantity(item)} · ${itemPlace(state, item)}${
        days < 0 ? " · 已过期" : ""
      }`,
      reference: { type: "item", id: item.id, label: "查看物品" },
    })),
    references: [{ type: "page", page: "expiry", label: "打开保质期" }],
    caution: "超过包装日期的物品不自动判定是否安全；药物请按包装和医嘱处理。",
  };
}

function pendingItems(state: any, listId: string) {
  return (state.shopping || []).filter(
    (item: any) =>
      item.listId === listId && !item.done && item.status !== "skipped",
  );
}

function listToken(question: string) {
  return clean(
    question
      .replace(
        /请问|帮我|麻烦|查一下|看看|清单|还差什么|还有什么|没准备|准备什么|要带什么|缺什么|还要买什么|要买什么|怎么样|哪些|什么|里|的|吗|呢|呀|啊/g,
        " ",
      )
      .replace(filler, " "),
  );
}

function listAnswer(
  state: any,
  question: string,
  context: AssistantContext,
): AssistantAnswer {
  const token = listToken(question);
  const activeLists = (state.lists || []).filter((list: any) => !list.archived);
  let matched: any = null;
  if (token)
    matched =
      activeLists.find(
        (list: any) =>
          clean(list.name).includes(token) || token.includes(clean(list.name)),
      ) || null;
  if (!matched && context.listId)
    matched =
      activeLists.find((list: any) => list.id === context.listId) || null;
  if (!matched && !token && activeLists.length === 1) matched = activeLists[0];
  if (!matched) {
    if (!activeLists.length)
      return {
        intent: "list",
        title: "还没有清单",
        body: "清单可以用于购物、出行或普通准备事项。购物清单保留预算和记账，出行与普通清单不会产生账单。",
        empty: true,
        actions: [
          { type: "capture", target: "shopping", label: "先说几项要准备的" },
        ],
        references: [{ type: "page", page: "shopping", label: "打开清单" }],
      };
    const choices = activeLists
      .map((list: any) => ({
        list,
        pending: pendingItems(state, list.id).length,
      }))
      .sort((a: any, b: any) => b.pending - a.pending);
    return {
      intent: "list",
      title: "想看哪份清单？",
      body: `有 ${activeLists.length} 份清单。点一份查看未准备事项，我不会替你猜是清单里的哪一份。`,
      rows: choices.slice(0, 8).map(({ list, pending }: any) => ({
        id: list.id,
        title: clean(list.name),
        meta: pending ? `${pending} 项待准备` : "已准备齐",
        detail:
          list.kind === "shopping"
            ? "购物清单"
            : list.kind === "travel"
              ? "出行清单"
              : "普通清单",
        reference: { type: "list", id: list.id, label: "查看清单" },
      })),
      references: [{ type: "page", page: "shopping", label: "打开全部清单" }],
    };
  }
  const pending = pendingItems(state, matched.id);
  const all = (state.shopping || []).filter(
    (item: any) => item.listId === matched.id,
  );
  if (!pending.length)
    return {
      intent: "list",
      title: `${clean(matched.name)}已经准备齐了`,
      body: `清单里 ${all.length} 项都已处理，没有待准备条目。这里只读清单状态，不改预算或购物记录。`,
      facts: [
        { label: "已处理", value: `${all.length} 项` },
        { label: "待准备", value: "0 项" },
      ],
      references: [{ type: "list", id: matched.id, label: "查看清单" }],
    };
  const budget = pending.reduce(
    (sum: number, item: any) => sum + (item.budget || 0),
    0,
  );
  return {
    intent: "list",
    title: `${clean(matched.name)}还差 ${pending.length} 项`,
    body: `下面只是还没勾选的条目，不代表库存或最终购买数量。${
      budget ? `已填预算合计 ${yuan(budget)}。` : ""
    }`,
    facts: [
      { label: "待准备", value: `${pending.length} 项` },
      { label: "已处理", value: `${all.length - pending.length} 项` },
      ...(budget ? [{ label: "待购预算", value: yuan(budget) }] : []),
    ],
    rows: pending.slice(0, 10).map((item: any) => ({
      id: item.id,
      title: clean(item.name),
      meta:
        [clean(item.quantity), clean(item.groupName)]
          .filter(Boolean)
          .join(" · ") || "未填数量",
      detail: clean(item.requirements || item.note || item.reason) || undefined,
    })),
    references: [{ type: "list", id: matched.id, label: "查看清单" }],
  };
}

function relatedTerms(keyword: string) {
  const group = relatedGroups.find((terms) =>
    terms.some((term) => term.includes(keyword) || keyword.includes(term)),
  );
  return group || [keyword];
}

function purchaseMatch(name: string, keyword: string) {
  const value = clean(name);
  if (!value) return "";
  if (value.includes(keyword)) return "exact";
  const terms = relatedTerms(keyword);
  if (terms.some((term) => term !== keyword && value.includes(term)))
    return "related";
  return "";
}

function stripHistoryQuestion(question: string) {
  return clean(
    question
      .replace(
        /请问|帮我|麻烦|查一下|查查|看看|购买参考|历史|上次|上回|之前|以前|买过|买|购买|价格|多少钱|多少|贵不贵|贵|规格|容量|记录|一下|的|了|呢|吗|呀|啊/g,
        " ",
      )
      .replace(filler, " "),
  );
}

function historyAnswer(state: any, question: string): AssistantAnswer {
  const keyword = stripHistoryQuestion(question);
  if (!keyword)
    return {
      intent: "history",
      title: "想查哪件东西的购买记录？",
      body: "说一个商品或用途就好，比如「上次洗衣液多少钱？」。我会在账本、购物记录和已登记物品里找。",
      empty: true,
      references: [{ type: "page", page: "ledger", label: "打开账本" }],
    };
  const shoppingById = new Map(
    (state.shopping || []).map((item: any) => [item.id, item]),
  );
  const ledgerById = new Map(
    (state.ledger || []).map((entry: any) => [entry.id, entry]),
  );
  const records: {
    id: string;
    date: string;
    title: string;
    amount: number;
    note: string;
    match: "exact" | "related";
  }[] = [];
  for (const entry of state.ledger || []) {
    if (entry.type !== "expense") continue;
    const sourceItem: any = entry.sourceShoppingItemId
      ? shoppingById.get(entry.sourceShoppingItemId)
      : null;
    const matches = [
      purchaseMatch(entry.title, keyword),
      purchaseMatch(entry.note, keyword),
      purchaseMatch(sourceItem?.name || "", keyword),
    ].filter(Boolean);
    if (!matches.length) continue;
    records.push({
      id: entry.id,
      date: entry.date,
      title:
        matches.includes("exact") && sourceItem
          ? clean(sourceItem.name)
          : clean(entry.title),
      amount: entry.amount,
      note: clean(entry.note),
      match: matches.includes("exact") ? "exact" : "related",
    });
  }
  for (const item of state.shopping || []) {
    if (item.purchaseAmount == null && !item.purchasedAt) continue;
    if (item.ledgerId && ledgerById.has(item.ledgerId)) continue;
    const match = purchaseMatch(item.name, keyword);
    if (!match) continue;
    const date = dateOnly(item.purchasedAt || "");
    if (!date) continue;
    records.push({
      id: `shopping:${item.id}`,
      date,
      title: clean(item.name),
      amount: Number(item.purchaseAmount || 0),
      note: clean(item.note),
      match,
    });
  }
  records.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      Number(b.match === "exact") - Number(a.match === "exact"),
  );
  const owned = findItems(state, keyword).filter(
    (item: any) => item.status === "active",
  );
  if (!records.length && !owned.length)
    return {
      intent: "history",
      title: `没有找到「${keyword}」的购买记录`,
      body: "账本、已购清单和已登记物品里都没有相关记录。可以换个名称，或先在快速记录里补一条。",
      empty: true,
      actions: [{ type: "capture", target: "ledger", label: "补记一笔" }],
      references: [{ type: "page", page: "ledger", label: "打开账本" }],
    };
  const exact = records.filter((record) => record.match === "exact");
  const related = records.filter((record) => record.match === "related");
  const latest = records[0];
  const latestOwned = owned[0];
  const facts: AssistantFact[] = [
    { label: "相关记录", value: `${records.length} 条` },
    { label: "已登记", value: `${owned.length} 件` },
  ];
  if (records.length > 1) {
    facts.push({
      label: "时间范围",
      value: `${records[records.length - 1].date} 至 ${latest.date}`,
    });
  }
  const ownedText = latestOwned
    ? `收纳里还登记了 ${clean(latestOwned.name)} ${itemQuantity(
        latestOwned,
      )}，位置：${itemPlace(state, latestOwned)}${
        lastConfirmed(latestOwned.quantityConfirmedAt)
          ? `，数量最后确认于 ${lastConfirmed(latestOwned.quantityConfirmedAt)}`
          : ""
      }。`
    : "";
  return {
    intent: "history",
    title: latest
      ? `上次「${latest.title}」是 ${yuan(latest.amount)}`
      : `找到「${keyword}」的已登记物品`,
    body: latest
      ? `最近一次有金额的记录在 ${latest.date}，${yuan(
          latest.amount,
        )}。${ownedText}`
      : `没有可用于比较的购买金额记录。${ownedText}`,
    facts,
    rows: records.slice(0, 6).map((record) => ({
      id: record.id,
      title: record.title,
      meta: `${record.date} · ${yuan(record.amount)}${
        record.match === "related" ? " · 同用途参考" : ""
      }`,
      detail: record.note || undefined,
      reference: record.id.startsWith("shopping:")
        ? {
            type: "shopping" as const,
            id: record.id.slice("shopping:".length),
            label: "打开清单条目",
          }
        : {
            type: "ledger" as const,
            id: record.id,
            label: "打开账目",
          },
    })),
    references: [
      { type: "page", page: "ledger", label: "打开账本" },
      { type: "page", page: "storage", label: "查看已登记物品" },
    ],
    caution:
      related.length && !exact.length
        ? "只找到同用途商品，不能当作同一件商品直接比较价格。"
        : "记录缺少容量或规格时，无法判断单价哪个更低。",
  };
}

function reminderAnswer(
  context: AssistantContext,
  countOnly = false,
): AssistantAnswer {
  const items = context.reminders || [];
  if (!items.length)
    return {
      intent: "reminders",
      title: "现在没有待处理提醒",
      body: "提醒只在网页打开时检查。关闭网页不会推送；回到页面会补查一次。",
      empty: true,
      references: [{ type: "reminders", label: "打开提醒" }],
    };
  return {
    intent: "reminders",
    title: `有 ${items.length} 条提醒等你处理`,
    body: countOnly
      ? "这些提醒来自临期物品、清单或固定日期规则，只在网页内展示。"
      : "按到期时间列出，可以到提醒页处理或稍后提醒。",
    rows: items.slice(0, 8).map((item: any) => ({
      id: item.id,
      title: clean(item.title) || "待处理提醒",
      meta: reminderDueLabel(
        item.dueAt,
        context.today,
        item.rule?.timezone || context.timezone,
      ),
      detail: item.targetDate ? `目标日期 ${item.targetDate}` : undefined,
    })),
    references: [{ type: "reminders", label: "打开提醒" }],
  };
}

function overviewAnswer(
  state: any,
  context: AssistantContext,
): AssistantAnswer {
  const week = questionRange("本周", context.today);
  const sum = totals(
    (state.ledger || []).filter(
      (entry: any) => entry.date >= week.start && entry.date <= week.end,
    ),
  );
  const expiring = (state.items || []).filter((item: any) => {
    if (
      item.status !== "active" ||
      !item.expiryEnabled ||
      !item.expiresOn ||
      Number(item.quantity ?? 1) <= 0
    )
      return false;
    const days = Math.round(
      (Date.parse(dateOnly(item.expiresOn)) - Date.parse(context.today)) /
        86_400_000,
    );
    return days <= 7;
  }).length;
  const reminderCount = (context.reminders || []).length;
  const pending = (state.shopping || []).filter(
    (item: any) => !item.done && item.status !== "skipped",
  ).length;
  return {
    intent: "overview",
    title: "这一周，账页上是这样",
    body: `本周净支出 ${yuan(sum.net)}，${expiring} 件物品临期，${reminderCount} 条提醒，${pending} 项清单待准备。`,
    facts: [
      { label: "净支出", value: yuan(sum.net) },
      { label: "临期", value: `${expiring} 件` },
      { label: "提醒", value: `${reminderCount} 条` },
      { label: "清单待准备", value: `${pending} 项` },
    ],
    references: [
      { type: "page", page: "dashboard", label: "回到统计" },
      { type: "page", page: "expiry", label: "查看临期" },
      { type: "reminders", label: "查看提醒" },
    ],
    caution: "这里只汇总已有记录，不评价消费习惯。",
  };
}

function weeklyAnswer(state: any, context: AssistantContext): AssistantAnswer {
  const week = questionRange("本周", context.today);
  const previous = questionRange("上周", context.today);
  const entries = (state.ledger || []).filter(
    (entry: any) => entry.date >= week.start && entry.date <= week.end,
  );
  const previousEntries = (state.ledger || []).filter(
    (entry: any) => entry.date >= previous.start && entry.date <= previous.end,
  );
  const sum = totals(entries);
  const previousSum = totals(previousEntries);
  const categoryById = new Map<string, any>(
    (state.categories || []).map((category: any) => [category.id, category]),
  );
  const byCategory = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== "expense" || !entry.categoryId) continue;
    byCategory.set(
      entry.categoryId,
      (byCategory.get(entry.categoryId) || 0) + Number(entry.amount || 0),
    );
  }
  const topCategories = [...byCategory.entries()]
    .map(([id, amount]) => ({
      id,
      amount,
      name: String(categoryById.get(id)?.name || "未分类"),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const expiring = (state.items || [])
    .filter((item: any) => {
      if (
        item.status !== "active" ||
        !item.expiryEnabled ||
        !item.expiresOn ||
        Number(item.quantity ?? 1) <= 0
      )
        return false;
      const days = Math.round(
        (Date.parse(dateOnly(item.expiresOn)) - Date.parse(context.today)) /
          86_400_000,
      );
      return days <= 7;
    })
    .sort((a: any, b: any) =>
      String(a.expiresOn).localeCompare(String(b.expiresOn)),
    );
  const pendingLists = (state.lists || [])
    .filter((list: any) => !list.archived)
    .map((list: any) => ({
      ...list,
      pending: pendingItems(state, list.id).length,
    }))
    .filter((list: any) => list.pending > 0)
    .sort((a: any, b: any) => b.pending - a.pending);
  const savings = (state.savings || [])
    .filter(
      (saving: any) =>
        saving.status === "valid" &&
        !saving.suppressed &&
        !saving.supersededBySettlementId &&
        saving.date >= week.start &&
        saving.date <= week.end,
    )
    .reduce(
      (sumValue: number, saving: any) =>
        sumValue + Number(saving.amount || 0),
      0,
    );
  const reminders = context.reminders || [];
  const difference = sum.net - previousSum.net;
  const differenceText =
    previousSum.net === 0 && sum.net === 0
      ? "和上周一样没有支出"
      : difference === 0
        ? "净支出和上周持平"
        : `净支出比上周${difference > 0 ? "多" : "少"} ${yuan(Math.abs(difference))}`;
  const rows: AssistantRow[] = [];
  for (const category of topCategories) {
    rows.push({
      id: `weekly-category:${category.id}`,
      title: category.name,
      meta: `本周支出 ${yuan(category.amount)}`,
      detail: "按已保存账目的支出分类汇总",
      reference: {
        type: "ledger",
        label: "查看这段时间的账本",
        start: week.start,
        end: week.end,
      },
    });
  }
  if (expiring[0]) {
    rows.push({
      id: `weekly-expiry:${expiring[0].id}`,
      title: `${clean(expiring[0].name)}快到期`,
      meta: `到期 ${clean(expiring[0].expiresOn)}`,
      detail: "本周需要先处理的临期物品",
      reference: { type: "item", id: expiring[0].id, label: "打开物品" },
    });
  }
  if (pendingLists[0]) {
    rows.push({
      id: `weekly-list:${pendingLists[0].id}`,
      title: `${clean(pendingLists[0].name)}还有 ${pendingLists[0].pending} 项`,
      meta: "未完成的准备事项",
      reference: {
        type: "list",
        id: pendingLists[0].id,
        label: "查看清单",
      },
    });
  }
  if (reminders[0]) {
    rows.push({
      id: `weekly-reminder:${reminders[0].id}`,
      title: clean(reminders[0].title) || "待处理提醒",
      meta: reminderDueLabel(
        reminders[0].dueAt,
        context.today,
        reminders[0].rule?.timezone || context.timezone,
      ),
      reference: { type: "reminders", label: "打开提醒" },
    });
  }
  return {
    intent: "weekly",
    title: `本周生活摘要 · ${week.start.slice(5)}～${week.end.slice(5)}`,
    body: `本周净支出 ${yuan(sum.net)}，${differenceText}。${
      topCategories.length
        ? `支出最多的是${topCategories.map((item) => item.name).join("、")}。`
        : "本周还没有分类支出。"
    }${expiring.length ? `有 ${expiring.length} 件物品临期。` : ""}${
      pendingLists.length ? `还有 ${pendingLists.length} 份清单待准备。` : ""
    }`,
    facts: [
      { label: "净支出", value: yuan(sum.net) },
      { label: "收入", value: yuan(sum.income) },
      { label: "退款", value: yuan(sum.refund) },
      { label: "本周省钱", value: yuan(savings) },
      { label: "临期", value: `${expiring.length} 件` },
      { label: "提醒", value: `${reminders.length} 条` },
    ],
    rows,
    references: [
      {
        type: "ledger",
        label: "查看本周账本",
        start: week.start,
        end: week.end,
      },
      { type: "page", page: "dashboard", label: "回到统计" },
      { type: "reminders", label: "查看提醒" },
    ],
    caution: "这是按已保存账目和当前清单计算的摘要，不评价消费习惯。",
  };
}

function helpAnswer(): AssistantAnswer {
  return {
    intent: "help",
    title: "小数管家能查账页，也能整理一句话",
    body: "可以查花销、物品位置、临期、清单进度、购买参考和每周摘要。明确说“记一笔”“把护照改到床头柜”或“提醒我牛奶提前一天”时，会先出候选卡；点确认后才写入。",
    rows: [
      {
        id: "spend",
        title: "看花销",
        meta: "这周花了多少钱？",
        detail: "按你的时区和周一规则计算，分别列出支出、退款和净支出。",
      },
      {
        id: "item",
        title: "找东西",
        meta: "护照在哪？",
        detail: "查名称、收纳位置、箱子和数量，点开真实物品记录。",
      },
      {
        id: "expiry",
        title: "看临期",
        meta: "有什么快到期？",
        detail: "只列有效且填写了到期日的物品，不猜测是否还能使用。",
      },
      {
        id: "list",
        title: "做准备",
        meta: "海边清单还差什么？",
        detail: "列出未勾选条目，不扣库存、不生成账单。",
      },
      {
        id: "history",
        title: "翻旧账",
        meta: "上次洗衣液多少钱？",
        detail: "搜索账本、已购清单和已登记物品，区分同用途商品。",
      },
      {
        id: "reminders",
        title: "看提醒",
        meta: "现在有什么提醒？",
        detail: "只在网页内展示，不发送站外通知。",
      },
      {
        id: "weekly",
        title: "看一周",
        meta: "帮我生成本周生活摘要。",
        detail: "汇总本周支出、分类、省钱、临期、清单和提醒。",
      },
      {
        id: "write",
        title: "记一句",
        meta: "把护照改到床头柜 / 提醒我牛奶提前一天",
        detail: "先生成写入预览，可逐项修改，确认后才保存。",
      },
    ],
    followUps: [
      "帮我生成本周生活摘要。",
      "有什么快到期？",
    ],
  };
}

function howToAnswer(question: string): AssistantAnswer | null {
  if (has(question, /登记物品|录入物品|添加物品|新建物品|物品怎么|东西怎么记/))
    return {
      intent: "howto",
      title: "登记物品不用先有账单",
      body: "去收纳管理或保质期页点「登记物品」，填写名称、数量和位置即可；需要时再开启成本或提醒。也可以从快速记录选择物品档案。",
      actions: [{ type: "capture", target: "items", label: "登记一件物品" }],
      references: [{ type: "page", page: "storage", label: "打开收纳管理" }],
    };
  if (has(question, /新建清单|创建清单|建清单|清单怎么建/))
    return {
      intent: "howto",
      title: "购物、出行和普通清单分开记",
      body: "到清单页新建清单，选择购物、出行或普通用途。出行和普通清单只记录准备事项，不会产生预算结算或账单。",
      references: [{ type: "page", page: "shopping", label: "打开清单" }],
    };
  if (has(question, /先存着|暂存|稍后整理/))
    return {
      intent: "howto",
      title: "先存着，保留原始时间",
      body: "把原话存进待整理，稍后仍按记录当时理解「今天」「明天」。AI 不可用时也能手动整理。",
      actions: [{ type: "capture", target: "auto", label: "先存一句" }],
      references: [{ type: "page", page: "drafts", label: "查看待整理" }],
    };
  if (has(question, /怎么记|记一笔|记账怎么|添加账|手动记/))
    return {
      intent: "howto",
      title: "记一笔，也可以交给待整理",
      body: "直接记下金额和日期最快；一段话里有几件事时，可以先存着，稍后逐项确认。",
      actions: [{ type: "capture", target: "ledger", label: "记一笔" }],
      references: [{ type: "page", page: "ledger", label: "打开账本" }],
    };
  return null;
}

function suggestionTexts(state: any, context: AssistantContext) {
  const texts: string[] = [];
  const activeItems = (state.items || []).filter(
    (item: any) => item.status === "active",
  );
  const placed = activeItems.find(
    (item: any) =>
      clean(item.location) || boxOf(state, item) || item.storageEnabled,
  );
  if (placed) texts.push(`${clean(placed.name)}在哪？`);
  texts.push("这周花了多少钱？");
  const lists = (state.lists || []).filter((list: any) => !list.archived);
  const contextList = lists.find((list: any) => list.id === context.listId);
  const list =
    contextList ||
    lists
      .map((item: any) => ({
        item,
        pending: pendingItems(state, item.id).length,
      }))
      .sort((a: any, b: any) => b.pending - a.pending)[0]?.item;
  if (list) texts.push(`${clean(list.name)}还差什么？`);
  texts.push("有什么快到期？");
  const latestExpense = (state.ledger || [])
    .filter((entry: any) => entry.type === "expense")
    .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
  if (latestExpense) {
    const word = clean(latestExpense.title).slice(0, 10);
    if (word) texts.push(`上次${word}多少钱？`);
  }
  texts.push("现在有什么提醒？");
  return [...new Set(texts)];
}

export function assistantSuggestions(
  state: any,
  context: AssistantContext,
): AssistantSuggestionGroup[] {
  const texts = suggestionTexts(state, context);
  const activeItems = (state.items || []).filter(
    (item: any) => item.status === "active",
  );
  const placed = activeItems.find(
    (item: any) =>
      clean(item.location) || boxOf(state, item) || item.storageEnabled,
  );
  const lists = (state.lists || []).filter((list: any) => !list.archived);
  const list =
    lists.find((item: any) => item.id === context.listId) ||
    lists
      .map((item: any) => ({
        item,
        pending: pendingItems(state, item.id).length,
      }))
      .sort((a: any, b: any) => b.pending - a.pending)[0]?.item;
  const first: AssistantSuggestionGroup["items"] = [];
  first.push({
    text: "帮我生成本周生活摘要。",
    hint: "支出、清单、临期和提醒",
    icon: "calendar",
  });
  if (placed)
    first.push({
      text: `${clean(placed.name)}在哪？`,
      hint: "去收纳里找",
      icon: "search",
    });
  if (list)
    first.push({
      text: `${clean(list.name)}还差什么？`,
      hint: "看未准备条目",
      icon: "list",
    });
  const historyText = texts.find((text) => text.startsWith("上次"));
  const second: AssistantSuggestionGroup["items"] = [
    {
      text: "这周花了多少钱？",
      hint: "支出、退款和净支出",
      icon: "wallet",
    },
    ...(historyText
      ? [
          {
            text: historyText,
            hint: "翻账本和已购记录",
            icon: "history" as const,
          },
        ]
      : []),
    { text: "有什么快到期？", hint: "先看临期物品", icon: "calendar" },
    {
      text: "现在有什么提醒？",
      hint: "只在网页内提醒",
      icon: "bell",
    },
    {
      text: "你都能做什么？",
      hint: "看全部能问的事",
      icon: "help",
    },
  ];
  if (!activeItems.length)
    second.push({
      text: "怎样登记物品？",
      hint: "不需要先有账单",
      icon: "box",
    });
  const expiring = activeItems.find(
    (item: any) => item.expiryEnabled && item.expiresOn,
  );
  const writeItems: AssistantSuggestionGroup["items"] = [
    {
      text: "记一笔午饭 28 元",
      hint: "先预览账目再确认",
      icon: "wallet",
    },
    ...(expiring
      ? [
          {
            text: `提醒我${clean(expiring.name)}提前一天`,
            hint: "先生成提醒预览",
            icon: "bell" as const,
          },
        ]
      : []),
    ...(list
      ? [
          {
            text: `${clean(list.name)}再补几个`,
            hint: "按当前清单列候选",
            icon: "list" as const,
          },
        ]
      : []),
    ...(!activeItems.length
      ? [
          {
            text: "登记护照，放书房抽屉",
            hint: "物品不用先有账单",
            icon: "box" as const,
          },
        ]
      : []),
  ];
  return [
    { label: "先看看这一周和账页", items: first.slice(0, 4) },
    { label: "再问一点", items: second },
    { label: "也可以直接记一句", items: writeItems.slice(0, 4) },
  ];
}

export function answerAssistant(
  rawQuestion: string,
  state: any,
  context: AssistantContext,
): AssistantAnswer {
  const question = clean(rawQuestion);
  if (!question)
    return {
      intent: "unknown",
      title: "想从哪一页开始？",
      body: "可以点一个现成问题，也可以直接输入物品名、清单名或时间范围。",
      empty: true,
      followUps: suggestionTexts(state, context).slice(0, 4),
    };
  const howTo = howToAnswer(question);
  if (howTo) return howTo;
  if (
    has(
      question,
      /你.*能做什么|你会什么|有什么功能|能干嘛|可以.*帮助|怎么用你|你是谁|帮助/,
    )
  )
    return helpAnswer();
  if (
    has(
      question,
      /生活摘要|本周.*摘要|摘要.*本周|总结.*本周|本周.*总结|这一周.*怎么样|一周.*总结/,
    )
  )
    return weeklyAnswer(state, context);
  if (
    has(question, /花了|支出|消费|开销|花费|用了多少|账单/) ||
    (has(question, /收入|进账|赚了|挣了/) && has(question, /多少|几|统计/))
  )
    return spendAnswer(state, question, context);
  if (has(question, /过期|到期|临期|保质期|快坏|用完/))
    return expiryAnswer(state, question, context);
  if (has(question, /提醒|待办|要处理/)) return reminderAnswer(context);
  if (has(question, /清单|还差|没准备|准备什么|带什么|要买什么|缺什么/))
    return listAnswer(state, question, context);
  if (
    has(question, /上次|上回|之前|以前|买过|购买参考|历史/) ||
    (has(question, /多少钱|价格|贵不贵|规格/) && !has(question, /花了|支出/))
  )
    return historyAnswer(state, question);
  if (has(question, /在哪|放哪|位置|收纳|找/))
    return itemAnswer(state, question, context);
  if (has(question, /怎么样|概况|摘要|总结|整体/))
    return overviewAnswer(state, context);
  const fallbackItems = findItems(state, question);
  if (fallbackItems.length === 1) return itemAnswer(state, question, context);
  return {
    intent: "unknown",
    title: "这句话我还没对上账页",
    body: "我目前能查花销、物品位置、临期、清单进度、购买参考和本周摘要，也能把明确的记账、物品更新或提醒请求整理成待确认卡片。可以换个说法，或点下面的例子。",
    empty: true,
    followUps: suggestionTexts(state, context).slice(0, 5),
  };
}

export function assistantContextLabel(context: AssistantContext) {
  if (context.page === "shopping" && context.listName) return context.listName;
  return assistantPageName(context.page);
}
