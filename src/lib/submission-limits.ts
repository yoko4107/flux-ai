/**
 * Pure helper functions for submission limit enforcement.
 * These are intentionally free of Prisma/Next.js dependencies so they
 * can be unit-tested without a database connection.
 */

export interface SubmissionConfig {
  maxAmountPerRequest: number | null // 0 = no limit
  maxAmountPerCategory: Record<string, number>
  approvalThreshold: number | null // 0 = disabled
  submissionDeadline: number | null // day of month (bare number, NOT { day: number })
  allowedCategories: string[]
  requireReceiptAbove: number | null
}

/**
 * Validate a submission against the given config.
 * Returns an array of error strings. Empty array = valid.
 */
export function validateSubmission(
  amount: number,
  category: string,
  receiptUrl: string | null,
  config: SubmissionConfig,
  todayDate: Date = new Date()
): string[] {
  const errors: string[] = []

  // 1. Category must be allowed
  if (!config.allowedCategories.includes(category)) {
    errors.push(`Category "${category}" is not allowed.`)
  }

  // 2. Per-category max amount
  const catLimit = config.maxAmountPerCategory[category]
  if (catLimit != null && amount > catLimit) {
    errors.push(
      `Amount ${amount} exceeds maximum of ${catLimit} for category "${category}".`
    )
  }

  // 3. Per-request overall max amount
  if (
    config.maxAmountPerRequest != null &&
    config.maxAmountPerRequest > 0 &&
    amount > config.maxAmountPerRequest
  ) {
    errors.push(
      `Amount ${amount} exceeds overall request limit of ${config.maxAmountPerRequest}.`
    )
  }

  // 4. Receipt required above threshold
  if (config.requireReceiptAbove != null && amount > config.requireReceiptAbove && !receiptUrl) {
    errors.push(`A receipt is required for amounts above ${config.requireReceiptAbove}.`)
  }

  // 5. Submission deadline — stored as bare number (day of month)
  if (config.submissionDeadline != null && todayDate.getDate() > config.submissionDeadline) {
    errors.push(
      `Submission deadline (day ${config.submissionDeadline} of the month) has passed.`
    )
  }

  return errors
}

/**
 * Determine if a submission should be auto-approved based on amount and threshold.
 * Returns true only when threshold is configured (> 0) and amount is within it.
 */
export function shouldAutoApprove(
  amount: number,
  approvalThreshold: number | null
): boolean {
  return approvalThreshold != null && approvalThreshold > 0 && amount <= approvalThreshold
}

/**
 * Add N business days to a date, skipping Saturdays (day 6) and Sundays (day 0).
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) {
      remaining--
    }
  }
  return result
}

/**
 * Check if a payment is overdue given the approval timestamp and deadline in business days.
 * Returns false when paymentDeadlineDays is null (feature not configured).
 */
export function isOverduePayment(
  approvedAt: Date,
  paymentDeadlineDays: number | null,
  now: Date = new Date()
): boolean {
  if (paymentDeadlineDays === null) return false
  const deadline = addBusinessDays(approvedAt, paymentDeadlineDays)
  return deadline < now
}
