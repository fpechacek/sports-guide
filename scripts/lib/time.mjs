export const TIMEZONE = "America/New_York";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
  timeZoneName: "short",
});

function part(parts, type) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function formatEt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid kickoff time: ${iso}`);
  }
  const parts = partFormatter.formatToParts(date);
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const dayPeriod = part(parts, "dayPeriod").toUpperCase();
  return {
    date: dateFormatter.format(date),
    weekday: part(parts, "weekday"),
    month: part(parts, "month"),
    day: part(parts, "day"),
    timeEt: `${hour}:${minute} ${dayPeriod}`,
    timeZoneAbbr: part(parts, "timeZoneName"),
    dateLabel: `${part(parts, "weekday")}, ${part(parts, "month")} ${part(parts, "day")}`,
  };
}

export function todayEt(now = new Date()) {
  return dateFormatter.format(now);
}

export function addDays(ymd, days) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function eachDate(start, end) {
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function compactDate(ymd) {
  return ymd.replaceAll("-", "");
}
