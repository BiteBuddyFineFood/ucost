export type NaturalPeriodMode = "day" | "week" | "month" | "half" | "year";
export type PeriodMode = NaturalPeriodMode | "custom";
export type DateRange = { start: string; end: string };

const DAY = 86_400_000;
const utc = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const date = (value: number) => new Date(value).toISOString().slice(0, 10);

export function addDays(value: string, days: number) {
  return date(utc(value) + days * DAY);
}

export function addMonths(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  return Math.round((utc(end) - utc(start)) / DAY);
}

export function startOfWeek(value: string) {
  const day = new Date(utc(value)).getUTCDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

export function endOfMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return date(Date.UTC(year, month, 0));
}

export function periodBounds(
  mode: NaturalPeriodMode,
  anchor: string,
): DateRange {
  if (mode === "day") return { start: anchor, end: anchor };
  if (mode === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  if (mode === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    return { start, end: endOfMonth(start) };
  }
  if (mode === "half") {
    const [year, month] = anchor.split("-").map(Number);
    return month <= 6
      ? { start: `${year}-01-01`, end: `${year}-06-30` }
      : { start: `${year}-07-01`, end: `${year}-12-31` };
  }
  const year = anchor.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Historical periods are complete; the period containing today stops today. */
export function periodRange(
  mode: NaturalPeriodMode,
  anchor: string,
  today: string,
): DateRange {
  const bounds = periodBounds(mode, anchor);
  if (today >= bounds.start && today <= bounds.end)
    return { start: bounds.start, end: today };
  return bounds;
}

export function shiftPeriod(
  mode: NaturalPeriodMode,
  anchor: string,
  step: number,
) {
  if (mode === "day") return addDays(anchor, step);
  if (mode === "week") return addDays(anchor, step * 7);
  if (mode === "month") return addMonths(anchor, step);
  if (mode === "half") return addMonths(anchor, step * 6);
  return addMonths(anchor, step * 12);
}

export function isPeriodCurrent(
  mode: NaturalPeriodMode,
  range: DateRange,
  today: string,
) {
  return today >= range.start && today <= range.end;
}

export function comparisonRange(
  mode: NaturalPeriodMode,
  range: DateRange,
  today: string,
): DateRange & { partial: boolean } {
  const current = periodBounds(mode, range.start);
  const partial =
    today >= current.start &&
    today <= current.end &&
    range.end < current.end;
  const previous = periodBounds(
    mode,
    shiftPeriod(mode, range.start, -1),
  );
  if (!partial) return { ...previous, partial: false };
  const elapsed = daysBetween(range.start, range.end) + 1;
  const end = addDays(previous.start, elapsed - 1);
  return {
    start: previous.start,
    end: end > previous.end ? previous.end : end,
    partial: true,
  };
}

export function equalLengthPrevious(range: DateRange): DateRange {
  const length = daysBetween(range.start, range.end) + 1;
  return {
    start: addDays(range.start, -length),
    end: addDays(range.start, -1),
  };
}

export type TrendGranularity = "day" | "week" | "month";

export function trendGranularity(
  mode: PeriodMode,
  range: DateRange,
): TrendGranularity {
  if (mode === "day" || mode === "week" || mode === "month") return "day";
  if (mode === "half" || mode === "year") return "month";
  const length = daysBetween(range.start, range.end) + 1;
  return length <= 62 ? "day" : length <= 366 ? "week" : "month";
}

export type TrendBucket = DateRange & { label: string; key: string };

export function bucketRecords<T extends { date: string }>(
  records: T[],
  buckets: TrendBucket[],
) {
  const grouped = new Map<string, T[]>(
    buckets.map((bucket) => [bucket.key, []]),
  );
  if (!buckets.length) return grouped;
  const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
  let index = 0;
  for (const record of ordered) {
    while (index < buckets.length && record.date > buckets[index].end) index++;
    if (index >= buckets.length) break;
    const bucket = buckets[index];
    if (record.date >= bucket.start && record.date <= bucket.end)
      grouped.get(bucket.key)?.push(record);
  }
  return grouped;
}

export function trendBuckets(
  range: DateRange,
  granularity: TrendGranularity,
): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  let cursor = range.start;
  if (granularity === "day") {
    while (cursor <= range.end) {
      buckets.push({
        start: cursor,
        end: cursor,
        key: cursor,
        label: cursor.slice(5),
      });
      cursor = addDays(cursor, 1);
    }
    return buckets;
  }
  if (granularity === "week") {
    cursor = startOfWeek(range.start);
    while (cursor <= range.end) {
      const naturalEnd = addDays(cursor, 6);
      const start = cursor < range.start ? range.start : cursor;
      const end = naturalEnd > range.end ? range.end : naturalEnd;
      buckets.push({
        start,
        end,
        key: cursor,
        label: `${start.slice(5)}–${end.slice(5)}`,
      });
      cursor = addDays(cursor, 7);
    }
    return buckets;
  }
  cursor = `${range.start.slice(0, 7)}-01`;
  while (cursor <= range.end) {
    const naturalEnd = endOfMonth(cursor);
    const start = cursor < range.start ? range.start : cursor;
    const end = naturalEnd > range.end ? range.end : naturalEnd;
    buckets.push({
      start,
      end,
      key: cursor.slice(0, 7),
      label: `${Number(cursor.slice(5, 7))}月`,
    });
    cursor = addMonths(cursor, 1);
  }
  return buckets;
}

export function periodLabel(
  mode: PeriodMode,
  range: DateRange,
  today: string,
) {
  if (mode === "custom") return "自定义区间";
  if (isPeriodCurrent(mode, range, today)) {
    return {
      day: "今天",
      week: "本周",
      month: "本月",
      half: "本半年度",
      year: "今年",
    }[mode];
  }
  if (mode === "day") return range.start;
  if (mode === "week")
    return `${range.start.slice(5).replace("-", "/")}–${range.end
      .slice(5)
      .replace("-", "/")}`;
  if (mode === "month")
    return `${range.start.slice(0, 4)}年${Number(range.start.slice(5, 7))}月`;
  if (mode === "half")
    return `${range.start.slice(0, 4)}年${
      range.start.slice(5, 7) === "01" ? "上半年" : "下半年"
    }`;
  return `${range.start.slice(0, 4)}年`;
}

export function comparisonLabel(
  mode: PeriodMode,
  partial = false,
) {
  if (mode === "custom") return "较前一等长区间";
  const suffix = partial ? "同期" : "";
  return {
    day: "较前一天",
    week: `较上周${suffix}`,
    month: `较上月${suffix}`,
    half: `较上半年度${suffix}`,
    year: `较上年${suffix}`,
  }[mode];
}

export function customRange(start: string, end: string): DateRange {
  return start <= end ? { start, end } : { start: end, end: start };
}
