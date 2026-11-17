import { localDate } from "./domain";
import { addDays } from "./period";

function parts(value: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(
    values.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
}

/** Convert a wall-clock date/time in an IANA zone to the matching UTC instant. */
export function zonedDateTimeToUtc(
  day: string,
  time: string,
  timezone: string,
) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, date, hour, minute);
  let guess = wanted;
  for (let index = 0; index < 4; index++) {
    const actual = parts(new Date(guess), timezone);
    const represented = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second),
    );
    const delta = wanted - represented;
    if (!delta) break;
    guess += delta;
  }
  return new Date(guess);
}

export function utcToZonedInput(value: Date | number | string, timezone: string) {
  const actual = parts(new Date(value), timezone);
  return `${actual.year}-${actual.month}-${actual.day}T${actual.hour}:${actual.minute}`;
}

export function formatReminderTime(
  value: Date | number | string,
  timezone: string,
) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function relativeReminderDue(
  anchorDate: string,
  offsetDays: number,
  localTime: string,
  timezone: string,
) {
  return zonedDateTimeToUtc(
    addDays(anchorDate, -offsetDays),
    localTime,
    timezone,
  );
}

export function todayIn(timezone: string) {
  return localDate(new Date(), timezone);
}

export function reminderDueLabel(
  dueAt: Date | number | string,
  today: string,
  timezone: string,
) {
  const dueDate = localDate(new Date(dueAt), timezone);
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(dueAt));
  if (dueDate === today) return `今天 ${time}`;
  if (dueDate === addDays(today, 1)) return `明天 ${time}`;
  if (dueDate === addDays(today, -1)) return `昨天 ${time}`;
  return `${dueDate.slice(5).replace("-", "/")} ${time}`;
}
