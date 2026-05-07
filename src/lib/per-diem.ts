/**
 * Per Diem rate resolution + daily calculation.
 *
 * All amounts in USD. The math order matches the spec exactly:
 *
 *   1. Pull the daily rate for the destination (admin override → country
 *      default → 0 if neither). Saudi cities flagged as high-cost use the
 *      higher tier ($140 vs $115).
 *   2. Apply the travel-day multiplier (75% on the first and last day,
 *      100% otherwise). The multiplier scales the base, not the deductions.
 *   3. Subtract meal deductions calculated off the FULL daily rate, not
 *      the scaled rate (a lunch is worth the same dollar amount whether
 *      it's a travel day or not).
 *   4. Floor at 0 — a day where every meal is provided shouldn't go
 *      negative even if deductions exceed the scaled base.
 *
 * Reference (Vietnam, $70/day):
 *   Travel day, lunch provided  →  ($70 × 0.75) − ($70 × 0.25) = $35
 *   Full day, breakfast + lunch →  ($70 × 1.00) − ($70 × 0.40) = $42
 */

import { prisma } from "@/lib/prisma"
import { getConfig } from "@/lib/config"

export const PER_DIEM_RATES_KEY = "perDiem.rates"

export interface CountryRate {
  /** Standard daily rate in USD. */
  standard: number
  /** Optional higher tier (e.g. capital / business hubs). */
  highCost?: number
  /** Cities matched against `destinationCity` (case-insensitive substring). */
  highCostCities?: string[]
}

export type RateTable = Record<string, CountryRate>

/**
 * International / built-in defaults. Admins override these via the
 * /admin/per-diem page; whatever they save lands in AdminConfig under
 * PER_DIEM_RATES_KEY and wins over these.
 */
export const DEFAULT_RATES: RateTable = {
  VN: { standard: 70 },
  ID: { standard: 85 },
  // Saudi Arabia high-cost cities per the spec — Riyadh + the obvious
  // siblings most policies group with it. Admin can edit.
  SA: {
    standard: 115,
    highCost: 140,
    highCostCities: ["Riyadh", "Jeddah", "Mecca", "Medina"],
  },
}

/** Meal deduction multipliers (off the FULL daily rate). */
export const MEAL_DEDUCTIONS = {
  breakfast: 0.15,
  lunch: 0.25,
  dinner: 0.40,
} as const

export const TRAVEL_DAY_MULTIPLIER = 0.75
export const FULL_DAY_MULTIPLIER = 1.0

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

export interface DayInputs {
  baseRateUSD: number
  isTravelDay: boolean
  breakfastProvided: boolean
  lunchProvided: boolean
  dinnerProvided: boolean
}

/** Round to 2 decimal places (avoid floating-point drift for storage). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculateDayTotal(d: DayInputs): number {
  const scaled = d.baseRateUSD * (d.isTravelDay ? TRAVEL_DAY_MULTIPLIER : FULL_DAY_MULTIPLIER)
  const deductions =
    (d.breakfastProvided ? d.baseRateUSD * MEAL_DEDUCTIONS.breakfast : 0) +
    (d.lunchProvided ? d.baseRateUSD * MEAL_DEDUCTIONS.lunch : 0) +
    (d.dinnerProvided ? d.baseRateUSD * MEAL_DEDUCTIONS.dinner : 0)
  return round2(Math.max(0, scaled - deductions))
}

export function calculateTotalPerDiem(days: DayInputs[]): number {
  return round2(days.reduce((acc, d) => acc + calculateDayTotal(d), 0))
}

/**
 * Pick the right base rate for a destination.
 * Country code uses ISO-3166-1 alpha-2 (uppercased here).
 * Returns 0 if the country isn't configured at all — caller should
 * surface that as a "rate not configured for this destination" error.
 */
export function rateForDestination(
  rates: RateTable,
  countryCode: string,
  city?: string | null
): { rate: number; isHighCost: boolean } {
  const cc = countryCode.toUpperCase()
  const entry = rates[cc]
  if (!entry) return { rate: 0, isHighCost: false }
  if (city && entry.highCost && entry.highCostCities) {
    const cityLc = city.trim().toLowerCase()
    const isHigh = entry.highCostCities.some((c) => cityLc.includes(c.toLowerCase()))
    if (isHigh) return { rate: entry.highCost, isHighCost: true }
  }
  return { rate: entry.standard, isHighCost: false }
}

// ---------------------------------------------------------------------------
// Async config resolver
// ---------------------------------------------------------------------------

/**
 * Effective rate table for an organisation: admin override merged on top
 * of the built-in defaults so admins only need to specify the entries
 * they want to change.
 */
export async function getRateTable(organizationId: string): Promise<RateTable> {
  const stored = (await getConfig(prisma, PER_DIEM_RATES_KEY, organizationId)) as RateTable | null
  if (!stored || typeof stored !== "object") return { ...DEFAULT_RATES }
  // Per-country merge, not just spread, so an admin can change just the
  // standard rate for VN without losing the SA highCostCities list.
  const merged: RateTable = { ...DEFAULT_RATES }
  for (const [cc, entry] of Object.entries(stored)) {
    if (!entry || typeof entry !== "object") continue
    merged[cc.toUpperCase()] = { ...DEFAULT_RATES[cc.toUpperCase()], ...entry }
  }
  return merged
}

// ---------------------------------------------------------------------------
// Date math
// ---------------------------------------------------------------------------

export function utcDate(input: Date | string): Date {
  const d = typeof input === "string" ? new Date(input) : input
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Inclusive day list — used by the API to materialise PerDiemDay rows. */
export function daysBetween(start: Date, end: Date): Date[] {
  const out: Date[] = []
  const cur = utcDate(start)
  const last = utcDate(end)
  while (cur <= last) {
    out.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}
