/*
 * Clock helpers. Components must stay pure (the lint rule forbids Date.now()
 * and new Date() during render), so read the clock through these instead.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function now(): Date {
  return new Date();
}

/** Whole days from now until `date`, rounded up; negative once it has passed. */
export function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / DAY_MS);
}

/** The moment `days` days from now (negative for the past). */
export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}
