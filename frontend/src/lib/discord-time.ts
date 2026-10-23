import type { MdTimestampStyle } from "./discord-markdown";

const STYLE_OPTIONS: Record<Exclude<MdTimestampStyle, "R">, Intl.DateTimeFormatOptions> = {
  t: { timeStyle: "short" },
  T: { timeStyle: "medium" },
  d: { dateStyle: "short" },
  D: { dateStyle: "long" },
  f: { dateStyle: "long", timeStyle: "short" },
  F: { dateStyle: "full", timeStyle: "short" },
  s: { dateStyle: "short", timeStyle: "short" },
  S: { dateStyle: "short", timeStyle: "medium" },
};

const format = (date: Date, style: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, style).format(date);

export function formatDiscordTimestamp(
  unix: number,
  style: MdTimestampStyle,
  now: Date = new Date(),
): string {
  const date = new Date(unix * 1000);
  return style === "R" ? relativeTime(date, now) : format(date, STYLE_OPTIONS[style]);
}

export function formatTimestampTooltip(unix: number): string {
  return format(new Date(unix * 1000), STYLE_OPTIONS.F);
}

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  // Skip setMonth for 0: it would move a time in the repeated DST hour to its first occurrence.
  if (!months) return result;
  const target = date.getMonth() + months;
  const day = date.getDate();
  result.setMonth(target, day < 29 ? day : Math.min(day, daysInMonth(date.getFullYear(), target)));
  return result;
}

function positiveDifference(base: Date, other: Date): { months: number; ms: number } {
  let months = other.getMonth() - base.getMonth() + (other.getFullYear() - base.getFullYear()) * 12;
  if (addMonths(base, months).getTime() > other.getTime()) months--;
  return { months, ms: other.getTime() - addMonths(base, months).getTime() };
}

const RELATIVE: Record<string, string> = {
  ss: "%d seconds",
  m: "a minute",
  mm: "%d minutes",
  h: "an hour",
  hh: "%d hours",
  d: "a day",
  dd: "%d days",
  M: "a month",
  MM: "%d months",
  y: "a year",
  yy: "%d years",
};

// moment quirks are deliberate, e.g. "1 seconds ago" at zero.
function relativeTime(target: Date, now: Date): string {
  const future = now.getTime() < target.getTime();
  const diff = future ? positiveDifference(now, target) : positiveDifference(target, now);
  const sign = future ? 1 : -1;
  const signedValue =
    sign * diff.ms +
    ((sign * diff.months) % 12) * 2592e6 +
    Math.trunc((sign * diff.months) / 12) * 31536e6;

  const monthDays = Math.round((diff.months * 146097) / 4800);
  const seconds = Math.round(monthDays * 86400 + diff.ms / 1000);
  const minutes = Math.round(monthDays * 1440 + diff.ms / 6e4);
  const hours = Math.round(monthDays * 24 + diff.ms / 36e5);
  const days = Math.round(monthDays + diff.ms / 864e5);
  const exactMonths = diff.months + ((diff.ms / 864e5) * 4800) / 146097;
  const months = Math.round(exactMonths);
  const years = Math.round(exactMonths / 12);

  const [key, count = 0] =
    seconds < 60
      ? ["ss", seconds]
      : minutes <= 1
        ? ["m"]
        : minutes < 60
          ? ["mm", minutes]
          : hours <= 1
            ? ["h"]
            : hours < 22
              ? ["hh", hours]
              : days <= 1
                ? ["d"]
                : days < 26
                  ? ["dd", days]
                  : months <= 1
                    ? ["M"]
                    : months < 11
                      ? ["MM", months]
                      : years <= 1
                        ? ["y"]
                        : ["yy", years];

  const phrase = RELATIVE[key].replace("%d", String(count || 1));
  return signedValue > 0 ? `in ${phrase}` : `${phrase} ago`;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function relativeRefreshMs(target: Date, now: Date): number {
  const distance = Math.abs(target.getTime() - now.getTime());
  if (distance < 2 * MINUTE) return SECOND;
  if (distance < 5 * MINUTE) return MINUTE;
  if (distance < 45 * MINUTE) return 2 * MINUTE;
  if (distance < 21 * HOUR) return 5 * MINUTE;
  return 2 * HOUR;
}
