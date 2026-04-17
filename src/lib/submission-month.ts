/**
 * Determine which month folder a new reimbursement request belongs to.
 *
 * Rules:
 * - Always based on the CURRENT date/time, NOT the receipt date.
 * - If today is on or before the deadline day at 6pm → current month.
 * - If today is past the deadline day at 6pm → next month.
 *
 * Example with deadline = 20th:
 * - April 15 → "2026-04"
 * - April 20 at 5pm → "2026-04"
 * - April 20 at 7pm → "2026-05"
 * - April 21 → "2026-05"
 */
export async function getSubmissionMonth(): Promise<string> {
  // Dynamic import to avoid importing prisma in client bundles
  const { prisma } = await import("@/lib/prisma")
  const { getConfig } = await import("@/lib/config")
  const deadlineConfig = (await getConfig(prisma, "submissionDeadline")) as {
    day?: number
  } | null
  const deadlineDay = deadlineConfig?.day ?? 20

  return computeSubmissionMonth(new Date(), deadlineDay)
}

/**
 * Pure function for computing submission month (no DB dependency, testable).
 */
export function computeSubmissionMonth(
  now: Date,
  deadlineDay: number
): string {
  const currentDay = now.getDate()
  const currentHour = now.getHours()

  // Past deadline: after the deadline day, OR on the deadline day after 6pm (18:00)
  const pastDeadline =
    currentDay > deadlineDay ||
    (currentDay === deadlineDay && currentHour >= 18)

  let year = now.getFullYear()
  let month = now.getMonth() + 1 // 1-indexed

  if (pastDeadline) {
    // Roll to next month
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  return `${year}-${String(month).padStart(2, "0")}`
}
