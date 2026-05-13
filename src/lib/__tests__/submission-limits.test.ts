import { describe, it, expect } from "vitest"
import { validateSubmission, shouldAutoApprove, isOverduePayment } from "../submission-limits"
import type { SubmissionConfig } from "../submission-limits"

const defaultConfig: SubmissionConfig = {
  maxAmountPerRequest: null,
  maxAmountPerCategory: {},
  approvalThreshold: null,
  submissionDeadline: null,
  allowedCategories: ["TRAVEL", "MEALS", "SUPPLIES", "ACCOMMODATION", "COMMUNICATION", "TRAINING", "ENTERTAINMENT", "MEETING", "EQUIPMENT", "PRINTING", "SOFTWARE", "OTHER"],
  requireReceiptAbove: null,
}

describe("validateSubmission", () => {
  it("blocks when amount > maxAmountPerRequest, returns error string containing 'exceeds'", () => {
    const config: SubmissionConfig = { ...defaultConfig, maxAmountPerRequest: 1000 }
    const errors = validateSubmission(1500, "TRAVEL", null, config)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.toLowerCase().includes("exceeds"))).toBe(true)
  })

  it("allows when amount == maxAmountPerRequest (boundary)", () => {
    const config: SubmissionConfig = { ...defaultConfig, maxAmountPerRequest: 1000 }
    const errors = validateSubmission(1000, "TRAVEL", null, config)
    // No error for exactly at the limit
    const exceedsErrors = errors.filter((e) => e.toLowerCase().includes("overall request limit"))
    expect(exceedsErrors.length).toBe(0)
  })

  it("blocks over category limit, returns error mentioning category name", () => {
    const config: SubmissionConfig = { ...defaultConfig, maxAmountPerCategory: { TRAVEL: 500 } }
    const errors = validateSubmission(600, "TRAVEL", null, config)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes("TRAVEL"))).toBe(true)
  })

  it("allows when category not in maxAmountPerCategory map", () => {
    const config: SubmissionConfig = { ...defaultConfig, maxAmountPerCategory: { TRAVEL: 500 } }
    const errors = validateSubmission(999, "MEALS", null, config)
    // Category limit errors should not appear
    const limitErrors = errors.filter((e) => e.includes("exceeds maximum"))
    expect(limitErrors.length).toBe(0)
  })

  it("returns details array (not a single string) — LMIT-05", () => {
    const config: SubmissionConfig = {
      ...defaultConfig,
      maxAmountPerRequest: 100,
      maxAmountPerCategory: { TRAVEL: 50 },
    }
    const errors = validateSubmission(200, "TRAVEL", null, config)
    expect(Array.isArray(errors)).toBe(true)
    // Multiple errors can be returned together
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  it("blocks disallowed category", () => {
    const config: SubmissionConfig = { ...defaultConfig, allowedCategories: ["MEALS"] }
    const errors = validateSubmission(100, "TRAVEL", null, config)
    expect(errors.length).toBeGreaterThan(0)
  })

  it("submissionDeadline read as bare number (not { day: number }) — shape bug regression", () => {
    // submissionDeadline is a bare number (e.g., 20), not { day: 20 }
    // Simulate today being day 25, deadline is 20
    const fixedDate = new Date(2026, 4, 25) // May 25
    const config: SubmissionConfig = { ...defaultConfig, submissionDeadline: 20 }
    const errors = validateSubmission(100, "MEALS", null, config, fixedDate)
    expect(errors.some((e) => e.includes("deadline"))).toBe(true)
  })

  it("allows when today is before submission deadline", () => {
    const fixedDate = new Date(2026, 4, 10) // May 10
    const config: SubmissionConfig = { ...defaultConfig, submissionDeadline: 20 }
    const errors = validateSubmission(100, "MEALS", null, config, fixedDate)
    const deadlineErrors = errors.filter((e) => e.includes("deadline"))
    expect(deadlineErrors.length).toBe(0)
  })
})

describe("shouldAutoApprove", () => {
  it("returns true when amount <= approvalThreshold (> 0)", () => {
    expect(shouldAutoApprove(50, 100)).toBe(true)
    expect(shouldAutoApprove(100, 100)).toBe(true)
  })

  it("returns false when approvalThreshold is 0 (disabled)", () => {
    expect(shouldAutoApprove(50, 0)).toBe(false)
  })

  it("returns false when amount > approvalThreshold", () => {
    expect(shouldAutoApprove(200, 100)).toBe(false)
  })

  it("returns false when approvalThreshold is null", () => {
    expect(shouldAutoApprove(50, null)).toBe(false)
  })
})

describe("isOverduePayment", () => {
  it("returns true when now is past (approvedAt + paymentDeadlineDays business days)", () => {
    // Approved on Monday May 4, 2026. 5 business days = May 11 (Mon).
    const approvedAt = new Date(2026, 4, 4) // Monday May 4
    const now = new Date(2026, 4, 12) // Tuesday May 12 — past deadline
    expect(isOverduePayment(approvedAt, 5, now)).toBe(true)
  })

  it("returns false when still within deadline", () => {
    const approvedAt = new Date(2026, 4, 4) // Monday May 4
    const now = new Date(2026, 4, 8) // Friday May 8 — within 5 business days
    expect(isOverduePayment(approvedAt, 5, now)).toBe(false)
  })

  it("returns false when paymentDeadlineDays is null (not configured)", () => {
    const approvedAt = new Date(2026, 0, 1)
    const now = new Date(2026, 11, 31)
    expect(isOverduePayment(approvedAt, null, now)).toBe(false)
  })

  it("business-days calculation skips weekends: Friday + 1 business day = Monday", () => {
    // Friday May 8, 2026 + 1 business day = Monday May 11, 2026
    const approvedAt = new Date(2026, 4, 8) // Friday
    const deadlineMonday = new Date(2026, 4, 11) // Monday May 11 (deadline)
    const nowSaturday = new Date(2026, 4, 9) // Saturday — should NOT be overdue
    const nowMonday = new Date(2026, 4, 11) // Monday — also NOT overdue (deadline day, not past)
    const nowTuesday = new Date(2026, 4, 12) // Tuesday — OVERDUE

    expect(isOverduePayment(approvedAt, 1, nowSaturday)).toBe(false)
    expect(isOverduePayment(approvedAt, 1, nowMonday)).toBe(false)
    expect(isOverduePayment(approvedAt, 1, nowTuesday)).toBe(true)
  })
})
