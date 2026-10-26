import { isCalendarDay } from "@/lib/dates";

/*
 * Subscription end dates. The super admin picks a calendar day; the pharmacy
 * keeps access until the end of that day in its own time zone (zonedDayEnd),
 * stored as an instant in pharmacies.subscriptionEndsAt.
 */

/**
 * True for a real calendar day in the years 2000-2999: nothing else is a
 * sensible end date.
 */
export function isValidDay(day: string): boolean {
  return day.startsWith("2") && isCalendarDay(day);
}

/** `day` moved by whole months, clamped to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(dayOfMonth, lastDay));
  return target.toISOString().slice(0, 10);
}
