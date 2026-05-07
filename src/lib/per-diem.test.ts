import { describe, it, expect } from "vitest"
import {
  calculateDayTotal,
  calculateTotalPerDiem,
  rateForDestination,
  daysBetween,
  defaultCurrencyForCountry,
  DEFAULT_RATES,
} from "./per-diem"

describe("per-diem.calculateDayTotal", () => {
  // Reference table from the spec — these are the contract:
  //
  //   Country     Std     75%      −Brk      −Lun      −Din
  //   Vietnam    $70.00  $52.50   $10.50    $17.50    $28.00
  //   Indonesia  $85.00  $63.75   $12.75    $21.25    $34.00
  //   Saudi      $115.00 $86.25   $17.25    $28.75    $46.00

  it("full day, no deductions, returns the base rate", () => {
    expect(calculateDayTotal({ baseRateUSD: 70, isTravelDay: false, breakfastProvided: false, lunchProvided: false, dinnerProvided: false })).toBe(70)
    expect(calculateDayTotal({ baseRateUSD: 85, isTravelDay: false, breakfastProvided: false, lunchProvided: false, dinnerProvided: false })).toBe(85)
    expect(calculateDayTotal({ baseRateUSD: 115, isTravelDay: false, breakfastProvided: false, lunchProvided: false, dinnerProvided: false })).toBe(115)
  })

  it("travel day with no deductions = 75% of base", () => {
    expect(calculateDayTotal({ baseRateUSD: 70, isTravelDay: true, breakfastProvided: false, lunchProvided: false, dinnerProvided: false })).toBe(52.5)
    expect(calculateDayTotal({ baseRateUSD: 85, isTravelDay: true, breakfastProvided: false, lunchProvided: false, dinnerProvided: false })).toBe(63.75)
    expect(calculateDayTotal({ baseRateUSD: 115, isTravelDay: true, breakfastProvided: false, lunchProvided: false, dinnerProvided: false })).toBe(86.25)
  })

  it("deduction is computed off FULL base, not the scaled travel-day base", () => {
    // Vietnam, travel day, lunch provided:
    //   scaled    = 70 × 0.75 = 52.50
    //   deduction = 70 × 0.25 = 17.50
    //   total     = 35.00
    expect(calculateDayTotal({ baseRateUSD: 70, isTravelDay: true, breakfastProvided: false, lunchProvided: true, dinnerProvided: false })).toBe(35)
  })

  it("multiple meals stack — Vietnam full day, all three meals", () => {
    // 70 - (70*0.15 + 70*0.25 + 70*0.40) = 70 - 56 = 14
    expect(calculateDayTotal({ baseRateUSD: 70, isTravelDay: false, breakfastProvided: true, lunchProvided: true, dinnerProvided: true })).toBe(14)
  })

  it("never goes negative", () => {
    // Travel day with all three meals provided:
    //   scaled    = 70 × 0.75 = 52.50
    //   deduction = 70 × 0.80 = 56.00
    //   raw       = -3.50  → clamped to 0
    expect(calculateDayTotal({ baseRateUSD: 70, isTravelDay: true, breakfastProvided: true, lunchProvided: true, dinnerProvided: true })).toBe(0)
  })

  it("matches the Indonesia + Saudi reference rows", () => {
    // Indonesia full day, dinner provided: 85 − 85*0.40 = 51
    expect(calculateDayTotal({ baseRateUSD: 85, isTravelDay: false, breakfastProvided: false, lunchProvided: false, dinnerProvided: true })).toBe(51)
    // Saudi travel day, breakfast provided: 86.25 − 17.25 = 69
    expect(calculateDayTotal({ baseRateUSD: 115, isTravelDay: true, breakfastProvided: true, lunchProvided: false, dinnerProvided: false })).toBe(69)
  })

  it("manual override bypasses the formula and is used as-is", () => {
    // If override is set, breakfast/lunch/dinner/travel-day flags are
    // ignored — the user is explicitly claiming a flat amount.
    expect(calculateDayTotal({
      baseRateUSD: 70, isTravelDay: true,
      breakfastProvided: true, lunchProvided: true, dinnerProvided: true,
      amountOverride: 25,
    })).toBe(25)
  })

  it("override of 0 returns 0 (e.g. fully covered day)", () => {
    expect(calculateDayTotal({
      baseRateUSD: 70, isTravelDay: false,
      breakfastProvided: false, lunchProvided: false, dinnerProvided: false,
      amountOverride: 0,
    })).toBe(0)
  })

  it("negative override falls back to formula (defensive)", () => {
    // Negative is treated as "no override" so a typo doesn't yield a
    // negative claim. Defaults back to scaled-base − deductions.
    expect(calculateDayTotal({
      baseRateUSD: 70, isTravelDay: false,
      breakfastProvided: false, lunchProvided: false, dinnerProvided: false,
      amountOverride: -5,
    })).toBe(70)
  })

  it("rounds to 2 decimals (no fractional cents from float math)", () => {
    // 33.333… inputs shouldn't leak floating-point noise into storage.
    // 33.33 * 0.75 = 24.9975; 33.33 * 0.25 = 8.3325; diff = 16.665 → 16.67.
    const v = calculateDayTotal({ baseRateUSD: 33.33, isTravelDay: true, breakfastProvided: false, lunchProvided: true, dinnerProvided: false })
    expect(v).toBe(16.67)
    // Round-trip via string formatting confirms two decimals max.
    expect(v.toFixed(2)).toBe("16.67")
  })
})

describe("per-diem.calculateTotalPerDiem", () => {
  it("sums daily totals across a 3-day Vietnam trip", () => {
    // Day 1 travel ($52.50), Day 2 full day ($70), Day 3 travel + lunch (35)
    const total = calculateTotalPerDiem([
      { baseRateUSD: 70, isTravelDay: true, breakfastProvided: false, lunchProvided: false, dinnerProvided: false },
      { baseRateUSD: 70, isTravelDay: false, breakfastProvided: false, lunchProvided: false, dinnerProvided: false },
      { baseRateUSD: 70, isTravelDay: true, breakfastProvided: false, lunchProvided: true, dinnerProvided: false },
    ])
    expect(total).toBe(52.5 + 70 + 35)
  })
})

describe("per-diem.rateForDestination", () => {
  it("returns 0 / false for unknown country", () => {
    expect(rateForDestination(DEFAULT_RATES, "ZZ")).toEqual({ rate: 0, isHighCost: false })
  })
  it("standard rate for Vietnam regardless of city", () => {
    expect(rateForDestination(DEFAULT_RATES, "VN", "Hanoi")).toEqual({ rate: 70, isHighCost: false })
  })
  it("Saudi: standard for non-listed cities", () => {
    expect(rateForDestination(DEFAULT_RATES, "SA", "Tabuk")).toEqual({ rate: 115, isHighCost: false })
  })
  it("Saudi: high-cost flag for Riyadh", () => {
    expect(rateForDestination(DEFAULT_RATES, "SA", "Riyadh")).toEqual({ rate: 140, isHighCost: true })
  })
  it("Saudi: city match is case-insensitive substring", () => {
    expect(rateForDestination(DEFAULT_RATES, "SA", "  jeddah international ")).toEqual({ rate: 140, isHighCost: true })
  })
  it("country code is case-insensitive", () => {
    expect(rateForDestination(DEFAULT_RATES, "vn")).toEqual({ rate: 70, isHighCost: false })
  })
})

describe("per-diem.defaultCurrencyForCountry", () => {
  it("maps the spec's three countries to their local currency", () => {
    expect(defaultCurrencyForCountry("VN")).toBe("VND")
    expect(defaultCurrencyForCountry("ID")).toBe("IDR")
    expect(defaultCurrencyForCountry("SA")).toBe("SAR")
  })
  it("eurozone countries return EUR", () => {
    expect(defaultCurrencyForCountry("DE")).toBe("EUR")
    expect(defaultCurrencyForCountry("FR")).toBe("EUR")
    expect(defaultCurrencyForCountry("IE")).toBe("EUR")
  })
  it("falls back to USD for anything unmapped", () => {
    expect(defaultCurrencyForCountry("ZZ")).toBe("USD")
  })
  it("is case-insensitive", () => {
    expect(defaultCurrencyForCountry("vn")).toBe("VND")
  })
})

describe("per-diem.daysBetween", () => {
  it("returns inclusive day list", () => {
    const start = new Date(Date.UTC(2026, 4, 4))
    const end = new Date(Date.UTC(2026, 4, 8))
    const out = daysBetween(start, end)
    expect(out).toHaveLength(5)
    expect(out[0].getUTCDate()).toBe(4)
    expect(out[4].getUTCDate()).toBe(8)
  })
  it("single-day trip = one entry", () => {
    const d = new Date(Date.UTC(2026, 4, 4))
    expect(daysBetween(d, d)).toHaveLength(1)
  })
})
