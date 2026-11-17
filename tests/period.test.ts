import { describe, expect, it } from "vitest";
import {
  addDays,
  bucketRecords,
  comparisonRange,
  equalLengthPrevious,
  periodBounds,
  periodRange,
  trendBuckets,
  trendGranularity,
} from "../src/lib/period";

const today = "2026-11-13";

describe("统计周期", () => {
  it("当前自然周期截止今天，历史周期覆盖完整边界", () => {
    expect(periodRange("day", today, today)).toEqual({
      start: "2026-11-13",
      end: "2026-11-13",
    });
    expect(periodRange("week", today, today)).toEqual({
      start: "2026-11-09",
      end: "2026-11-13",
    });
    expect(periodRange("month", today, today)).toEqual({
      start: "2026-11-01",
      end: "2026-11-13",
    });
    expect(periodRange("half", today, today)).toEqual({
      start: "2026-07-01",
      end: "2026-11-13",
    });
    expect(periodRange("year", today, today)).toEqual({
      start: "2026-01-01",
      end: "2026-11-13",
    });
    expect(periodRange("month", "2026-10-13", today)).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(periodBounds("half", "2026-06-30")).toEqual({
      start: "2026-01-01",
      end: "2026-06-30",
    });
    expect(periodBounds("half", "2026-07-01")).toEqual({
      start: "2026-07-01",
      end: "2026-12-31",
    });
  });

  it("跨年周和闰年日期按日历计算", () => {
    expect(periodBounds("week", "2027-01-01")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
    expect(periodBounds("month", "2028-02-10")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("未结束周期对比上一周期相同已过天数，历史周期对比完整周期", () => {
    expect(
      comparisonRange(
        "week",
        { start: "2026-11-09", end: "2026-11-13" },
        today,
      ),
    ).toEqual({
      start: "2026-11-02",
      end: "2026-11-06",
      partial: true,
    });
    expect(
      comparisonRange(
        "month",
        { start: "2026-10-01", end: "2026-10-31" },
        today,
      ),
    ).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
      partial: false,
    });
    expect(
      equalLengthPrevious({ start: "2026-10-01", end: "2026-10-10" }),
    ).toEqual({ start: "2026-09-21", end: "2026-09-30" });
  });

  it("趋势分桶覆盖长选区首尾，并保持总金额不变", () => {
    const range = { start: "2024-01-15", end: "2026-03-10" };
    expect(trendGranularity("custom", range)).toBe("month");
    const buckets = trendBuckets(range, "month");
    expect(buckets[0]).toMatchObject({
      start: "2024-01-15",
      end: "2024-01-31",
    });
    expect(buckets.at(-1)).toMatchObject({
      start: "2026-03-01",
      end: "2026-03-10",
    });
    const records = [
      { date: "2024-01-15", amount: 100 },
      { date: "2024-06-01", amount: 200 },
      { date: "2026-03-10", amount: 300 },
    ];
    const grouped = bucketRecords(records, buckets);
    const values = [...grouped.values()].flat();
    expect(values).toHaveLength(3);
    expect(values.reduce((sum, row) => sum + row.amount, 0)).toBe(600);
    expect(grouped.get("2026-03")?.map((row) => row.amount)).toEqual([300]);
  });
});
