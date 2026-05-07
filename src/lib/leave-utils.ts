/**
 * Pure helpers for leave date math + balance calculations.
 *
 * Working-day counting respects:
 *   - the user's `weekStartsOn` is irrelevant; we always treat Sat/Sun as non-working
 *   - any PublicHoliday rows for the org/country in the date range
 *   - half-day flag (counts as 0.5)
 */

import type { PublicHoliday } from "@/generated/prisma"

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/** Count working days between start and end (both inclusive). */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidays: PublicHoliday[],
  isHalfDay = false
): number {
  if (isHalfDay && sameUtcDay(start, end)) return 0.5
  if (start > end) return 0

  let n = 0
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))

  while (cur <= last) {
    if (!isWeekend(cur) && !holidays.some((h) => sameUtcDay(h.date, cur))) {
      n++
    }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return n
}

/** Strip time of day, return a UTC-midnight Date for calendar math. */
export function utcDateOnly(input: Date | string): Date {
  const d = typeof input === "string" ? new Date(input) : input
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
