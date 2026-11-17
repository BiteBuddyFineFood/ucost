import { describe, expect, it } from "vitest";
import {
  answerAssistant,
  assistantSuggestions,
  assistantWritePlan,
  questionRange,
  type AssistantContext,
} from "../src/lib/assistant";

const today = "2026-11-13";
const timezone = "Asia/Shanghai";
const context: AssistantContext = {
  page: "dashboard",
  listId: null,
  listName: null,
  today,
  timezone,
  reminders: [
    { id: "r1", title: "牛奶快到期", dueAt: "2026-11-13T01:00:00.000Z" },
  ],
};

const state = {
  ledger: [
    {
      id: "l1",
      type: "expense",
      title: "午饭",
      amount: 2800,
      date: "2026-11-10",
      note: "",
    },
    {
      id: "l2",
      type: "expense",
      title: "超市牛奶",
      amount: 3600,
      date: "2026-11-13",
      note: "",
    },
    {
      id: "l3",
      type: "refund",
      title: "牛奶退款",
      amount: 1000,
      date: "2026-11-13",
      note: "",
    },
    {
      id: "l4",
      type: "expense",
      title: "洗衣液",
      amount: 4990,
      date: "2026-10-01",
      note: "1 瓶",
    },
    {
      id: "l5",
      type: "expense",
      title: "洗衣粉",
      amount: 2200,
      date: "2026-09-20",
      note: "",
    },
    {
      id: "l6",
      type: "expense",
      title: "上周聚餐",
      amount: 10000,
      date: "2026-11-04",
      note: "",
    },
    {
      id: "l7",
      type: "income",
      title: "工资",
      amount: 800000,
      date: "2026-11-01",
      note: "",
    },
  ],
  lists: [
    {
      id: "list1",
      name: "海边三日游",
      kind: "travel",
      archived: false,
    },
    {
      id: "list2",
      name: "日常购物",
      kind: "shopping",
      archived: false,
    },
  ],
  shopping: [
    {
      id: "s1",
      listId: "list1",
      name: "防晒霜",
      done: true,
      status: "purchased",
      quantity: "1 支",
    },
    {
      id: "s2",
      listId: "list1",
      name: "帽子",
      done: false,
      status: "planned",
      quantity: "1 顶",
      groupName: "防晒",
    },
    {
      id: "s3",
      listId: "list2",
      name: "牛奶",
      done: false,
      status: "planned",
      quantity: "两盒",
    },
    {
      id: "s4",
      listId: "list2",
      name: "洗衣液",
      done: true,
      status: "purchased",
      purchaseAmount: 4990,
      purchasedAt: "2026-10-01",
      ledgerId: "l4",
    },
  ],
  items: [
    {
      id: "i1",
      name: "护照",
      quantity: 1,
      unit: "本",
      status: "active",
      storageEnabled: true,
      expiryEnabled: false,
      location: "书房",
      boxId: "b1",
    },
    {
      id: "i2",
      name: "牛奶",
      quantity: 6,
      unit: "盒",
      status: "active",
      storageEnabled: true,
      expiryEnabled: true,
      expiresOn: "2026-11-14",
      location: "冰箱",
      boxId: null,
    },
    {
      id: "i3",
      name: "洗衣液",
      quantity: 1,
      unit: "瓶",
      status: "active",
      storageEnabled: true,
      expiryEnabled: false,
      location: "卫生间",
      boxId: null,
      quantityConfirmedAt: "2026-09-01T04:00:00.000Z",
    },
  ],
  boxes: [{ id: "b1", name: "第二个抽屉", location: "书房" }],
};

describe("小数管家只读查询", () => {
  it("按用户时区的自然周计算支出、退款和净支出", () => {
    const answer = answerAssistant("这周花了多少钱？", state, context);
    expect(answer.intent).toBe("spend");
    expect(answer.title).toBe("本周净支出 ¥54.00");
    expect(answer.facts).toContainEqual({ label: "支出", value: "¥64.00" });
    expect(answer.facts).toContainEqual({ label: "退款", value: "¥10.00" });
    expect(answer.facts).toContainEqual({ label: "净支出", value: "¥54.00" });
    expect(answer.references?.[0]).toMatchObject({
      type: "ledger",
      start: "2026-11-09",
      end: "2026-11-13",
    });
  });

  it("上周使用完整自然周，没有明确时间时默认最近 30 天", () => {
    expect(questionRange("上周花了多少", today)).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
      label: "上周",
      explicit: true,
    });
    const previous = answerAssistant("上周花了多少钱？", state, context);
    expect(previous.title).toBe("上周净支出 ¥100.00");
    const fallback = answerAssistant("花了多少钱？", state, context);
    expect(fallback.title).toBe("最近 30 天净支出 ¥154.00");
    expect(fallback.caution).toContain("最近 30 天");
  });

  it("从收纳位置回答物品在哪，并返回真实物品引用", () => {
    const answer = answerAssistant("护照在哪？", state, context);
    expect(answer.intent).toBe("item");
    expect(answer.title).toBe("护照在第二个抽屉 · 书房");
    expect(answer.facts).toContainEqual({ label: "数量", value: "1 本" });
    expect(answer.references?.[0]).toMatchObject({
      type: "item",
      id: "i1",
    });
  });

  it("临期查询只列有效物品，并区分今天和已过期", () => {
    const answer = answerAssistant("有什么快到期？", state, context);
    expect(answer.intent).toBe("expiry");
    expect(answer.title).toBe("1 件物品在 7 天内到期");
    expect(answer.rows).toHaveLength(1);
    expect(answer.rows?.[0]?.title).toBe("牛奶");
    expect(answer.rows?.[0]?.meta).toContain("还有 1 天");
  });

  it("清单查询只显示未完成项，不让出行条目产生财务副作用", () => {
    const answer = answerAssistant("海边清单还差什么？", state, context);
    expect(answer.intent).toBe("list");
    expect(answer.title).toBe("海边三日游还差 1 项");
    expect(answer.rows?.map((row) => row.title)).toEqual(["帽子"]);
    const choice = answerAssistant("清单还差什么？", state, context);
    expect(choice.title).toBe("想看哪份清单？");
    expect(choice.rows).toHaveLength(2);
    const contextual = answerAssistant("还差什么？", state, {
      ...context,
      page: "shopping",
      listId: "list2",
      listName: "日常购物",
    });
    expect(contextual.title).toBe("日常购物还差 1 项");
    expect(contextual.rows?.[0]?.title).toBe("牛奶");
  });

  it("历史购买参考会区分精确与同用途记录，并去除同一次购买重复", () => {
    const answer = answerAssistant("上次洗衣液多少钱？", state, context);
    expect(answer.intent).toBe("history");
    expect(answer.title).toBe("上次「洗衣液」是 ¥49.90");
    expect(answer.rows).toHaveLength(2);
    expect(answer.rows?.[1]).toMatchObject({
      title: "洗衣粉",
    });
    expect(answer.rows?.[1]?.meta).toContain("同用途参考");
    expect(answer.body).toContain("收纳里还登记了");
    expect(answer.body).toContain("2026-09-01");
  });

  it("能力说明、操作入口和未识别问题都有清楚出口", () => {
    const help = answerAssistant("你都能做什么？", state, context);
    expect(help.intent).toBe("help");
    expect(help.rows?.map((row) => row.title)).toContain("找东西");
    const howto = answerAssistant("怎样登记物品？", state, context);
    expect(howto.intent).toBe("howto");
    expect(howto.actions?.[0]).toMatchObject({
      type: "capture",
      target: "items",
    });
    const unknown = answerAssistant("帮我随便想想", state, context);
    expect(unknown.intent).toBe("unknown");
    expect(unknown.followUps?.length).toBeGreaterThan(0);
  });

  it("建议问题来自当前账页数据，而不是固定演示文案", () => {
    const groups = assistantSuggestions(state, context);
    const texts = groups.flatMap((group) =>
      group.items.map((item) => item.text),
    );
    expect(texts).toContain("护照在哪？");
    expect(texts).toContain("这周花了多少钱？");
    expect(texts).toContain("海边三日游还差什么？");
    expect(texts).toContain("上次超市牛奶多少钱？");
    const empty = assistantSuggestions(
      { ledger: [], lists: [], shopping: [], items: [], boxes: [] },
      context,
    );
    const emptyTexts = empty.flatMap((group) =>
      group.items.map((item) => item.text),
    );
    expect(emptyTexts).toContain("怎样登记物品？");
  });

  it("提醒查询使用程序格式化时间并返回提醒页引用", () => {
    const answer = answerAssistant("现在有什么提醒？", state, context);
    expect(answer.intent).toBe("reminders");
    expect(answer.title).toBe("有 1 条提醒等你处理");
    expect(answer.rows?.[0]?.title).toBe("牛奶快到期");
    expect(answer.references?.[0]).toMatchObject({ type: "reminders" });
  });

  it("生成本周生活摘要，包含支出、临期、清单和提醒", () => {
    const answer = answerAssistant("帮我生成本周生活摘要。", state, context);
    expect(answer.intent).toBe("weekly");
    expect(answer.title).toContain("11-09～11-13");
    expect(answer.facts).toContainEqual({ label: "净支出", value: "¥54.00" });
    expect(answer.facts).toContainEqual({ label: "临期", value: "1 件" });
    expect(answer.rows?.some((row) => row.title.includes("海边三日游"))).toBe(
      true,
    );
  });

  it("推荐问题包含周摘要", () => {
    const texts = assistantSuggestions(state, context).flatMap((group) =>
      group.items.map((item) => item.text),
    );
    expect(texts).toContain("帮我生成本周生活摘要。");
  });

  it("查询问题不会误建写入草稿", () => {
    for (const question of [
      "这周花了多少钱？",
      "护照在哪？",
      "海边三日游还差什么？",
      "有什么快到期？",
      "上次洗衣液多少钱？",
    ])
      expect(assistantWritePlan(question, state, context)).toBeNull();
  });

  it("明确的记账、更新、提醒和清单请求进入确认流程", () => {
    expect(assistantWritePlan("记一笔午饭 28 元", state, context)).toMatchObject(
      { target: "ledger" },
    );
    expect(
      assistantWritePlan("把护照改到卧室床头柜", state, context),
    ).toMatchObject({ target: "itemUpdate" });
    expect(
      assistantWritePlan("提醒我牛奶提前一天", state, context),
    ).toMatchObject({ target: "reminder" });
    expect(
      assistantWritePlan("再补几个", state, {
        ...context,
        page: "shopping",
        listId: "list1",
        listName: "海边三日游",
      }),
    ).toMatchObject({ target: "shopping", listId: "list1" });
    expect(
      assistantWritePlan("本来想买新杯子，后来没买，省了 39 元", state, context),
    ).toMatchObject({ target: "savings" });
  });

  it("一段话涉及账本、物品和提醒时使用自动拆分", () => {
    expect(
      assistantWritePlan(
        "今天花 36 元买了 6 盒牛奶，放冰箱，12 月 1 日到期，提前一天提醒我",
        state,
        context,
      ),
    ).toMatchObject({ target: "auto" });
  });
});
