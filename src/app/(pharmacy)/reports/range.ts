import { addDays, isCalendarDay } from "@/lib/dates";

const MAX_DAYS = 366;
const DEFAULT_DAYS = 30;

/**
 * Report period from the `from` / `to` query parameters, defaulting to the
 * last 30 days. Future dates are clamped to today and the span to one year.
 */
export function resolveRange(
  params: { from?: string; to?: string },
  today: string,
): { from: string; to: string } {
  const validDay = (value: string | undefined) =>
    value && isCalendarDay(value) ? value : null;
  const requestedTo = validDay(params.to);
  let to = requestedTo && requestedTo <= today ? requestedTo : today;
  let from = validDay(params.from) ?? addDays(to, -(DEFAULT_DAYS - 1));
  if (from > to) [from, to] = [to, from];
  const earliest = addDays(to, -(MAX_DAYS - 1));
  if (from < earliest) from = earliest;
  return { from, to };
}
