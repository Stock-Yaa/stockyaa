/*
 * Calendar days ("YYYY-MM-DD") and time zones. Sales are stored as instants,
 * but a pharmacy thinks in its own local days, so every "today", date filter
 * and end date goes through these helpers.
 */

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30). */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The calendar day that `instant` falls on in `timeZone`. */
export function dayInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Today's calendar day in `timeZone`. */
export function todayInTimezone(timeZone: string): string {
  return dayInTimezone(new Date(), timeZone);
}

/** The calendar day `days` days after `from` (negative for earlier). */
export function addDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}

/** The instant at which calendar day `day` begins in `timeZone`. */
export function zonedDayStart(day: string, timeZone: string): Date {
  const asUtc = Date.parse(`${day}T00:00:00Z`);
  // Two passes: the first guess can fall on the other side of a clock change.
  const guess = asUtc - zoneOffsetMs(asUtc, timeZone);
  return new Date(asUtc - zoneOffsetMs(guess, timeZone));
}

/** The last millisecond of calendar day `day` in `timeZone`. */
export function zonedDayEnd(day: string, timeZone: string): Date {
  return new Date(zonedDayStart(addDays(day, 1), timeZone).getTime() - 1);
}

/** [start, end) instants covering the calendar days `from`..`to` inclusive. */
export function zonedRange(from: string, to: string, timeZone: string) {
  return {
    start: zonedDayStart(from, timeZone),
    end: zonedDayStart(addDays(to, 1), timeZone),
  };
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Keeps half-typed values such as 0002-01-01 (from a date input while a year
// is being typed) away from the database.
export const MIN_DAY = "1900-01-01";
export const MAX_DAY = "2999-12-31";

/** A `?from=` / `?to=` value if it is a real calendar day in a sensible range, otherwise null. */
export function parseDay(value: string | undefined): string | null {
  if (!value || value < MIN_DAY || value > MAX_DAY) return null;
  return isCalendarDay(value) ? value : null;
}
