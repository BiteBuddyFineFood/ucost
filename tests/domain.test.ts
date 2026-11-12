import { describe, it, expect } from "vitest";
import {
  cents,
  heldDays,
  localDate,
  reviewResult,
  savingSplit,
  totals,
  validDate,
} from "../src/lib/domain";
describe("账务口径", () => {
  it("收入、支出、退款和转账的统计互不混淆", () => {
    expect(
      totals([
        { type: "income", amount: 800000 },
        { type: "expense", amount: 20000 },
        { type: "refund", amount: 5000 },
        { type: "transfer", amount: 100000 },
      ]),
    ).toEqual({
      income: 800000,
      expense: 20000,
      refund: 5000,
      net: 15000,
      balance: 785000,
    });
  });
  it("以分解析小数，拒绝精度溢出", () => {
    expect(cents("0.29")).toBe(29);
    expect(cents("-18.1")).toBe(-1810);
    expect(() => cents("1.001")).toThrow();
    expect(() => cents("NaN")).toThrow();
  });
  it("优惠与降级差额不重复", () => {
    expect(savingSplit(50000, 20000, 2000)).toEqual({
      downgrade: 28000,
      discount: 2000,
      total: 30000,
    });
    expect(() => savingSplit(100, 100, 20)).toThrow();
  });
});
describe("日期和物品成本", () => {
  it("购入当天为一天，退役后截止日固定", () => {
    expect(heldDays("2026-11-11", null, "2026-11-11")).toBe(1);
    expect(heldDays("2026-11-01", "2026-11-10", "2026-12-01")).toBe(10);
  });
  it("采集时间按采集时区得到日期", () => {
    expect(localDate("2026-11-10T18:35:00Z", "Asia/Shanghai")).toBe(
      "2026-11-11",
    );
    expect(validDate("2026-02-30")).toBe(false);
  });
});
describe("评议规则", () => {
  it("人数不足不提前通过，两人平票不过，三人过半通过", () => {
    expect(reviewResult([{ approve: true }], 2, "majority")).toBe("open");
    expect(
      reviewResult([{ approve: true }, { approve: false }], 2, "majority"),
    ).toBe("rejected");
    expect(
      reviewResult(
        [{ approve: true }, { approve: true }, { approve: false }],
        3,
        "majority",
      ),
    ).toBe("approved");
    expect(
      reviewResult([{ approve: true }, { approve: false }], 2, "all"),
    ).toBe("rejected");
  });
});
