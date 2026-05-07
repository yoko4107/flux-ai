import { describe, it, expect } from "vitest"
import { resolveCarriedDays, type CarryoverPolicy } from "./leave-policy"

const enabled: CarryoverPolicy = {
  enabled: true,
  maxDaysCarried: 5,
  expiresOnMonthDay: null,
  applyToCodes: [],
}

describe("leave-policy.resolveCarriedDays", () => {
  it("returns 0 when policy is disabled", () => {
    const p: CarryoverPolicy = { ...enabled, enabled: false }
    expect(resolveCarriedDays(p, "ANNUAL", 10)).toBe(0)
  })

  it("returns 0 when maxDaysCarried is 0", () => {
    const p: CarryoverPolicy = { ...enabled, maxDaysCarried: 0 }
    expect(resolveCarriedDays(p, "ANNUAL", 10)).toBe(0)
  })

  it("caps at maxDaysCarried when unused exceeds the cap", () => {
    expect(resolveCarriedDays(enabled, "ANNUAL", 12)).toBe(5)
  })

  it("returns unused when below the cap", () => {
    expect(resolveCarriedDays(enabled, "ANNUAL", 3)).toBe(3)
  })

  it("never returns negative values", () => {
    expect(resolveCarriedDays(enabled, "ANNUAL", -2)).toBe(0)
  })

  it("respects applyToCodes allowlist", () => {
    const p: CarryoverPolicy = { ...enabled, applyToCodes: ["ANNUAL"] }
    expect(resolveCarriedDays(p, "ANNUAL", 10)).toBe(5)
    expect(resolveCarriedDays(p, "SICK", 10)).toBe(0)
  })

  it("returns 0 after the expiry date in the same year", () => {
    const p: CarryoverPolicy = { ...enabled, expiresOnMonthDay: "03-31" }
    const beforeExpiry = new Date(Date.UTC(2026, 2, 15)) // Mar 15
    const afterExpiry = new Date(Date.UTC(2026, 5, 1))   // Jun 1
    expect(resolveCarriedDays(p, "ANNUAL", 10, beforeExpiry)).toBe(5)
    expect(resolveCarriedDays(p, "ANNUAL", 10, afterExpiry)).toBe(0)
  })

  it("ignores expiry date in a year where 'now' is before it", () => {
    const p: CarryoverPolicy = { ...enabled, expiresOnMonthDay: "12-31" }
    const earlyYear = new Date(Date.UTC(2026, 0, 15))
    expect(resolveCarriedDays(p, "ANNUAL", 10, earlyYear)).toBe(5)
  })
})
