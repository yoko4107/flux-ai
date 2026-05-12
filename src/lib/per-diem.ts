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

/**
 * ISO-3166-1 alpha-2 country → primary ISO-4217 currency.
 * Used by the submission form to default the claim currency to the
 * destination's local currency (Vietnam → VND, Indonesia → IDR, …).
 * Employees can still override the default in the form.
 *
 * Falls back to "USD" when the country isn't in the table — matches the
 * spec's reference assumption that USD is canonical.
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  VN: "VND",
  ID: "IDR",
  SA: "SAR",
  AE: "AED",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  PH: "PHP",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  IN: "INR",
  AU: "AUD",
  NZ: "NZD",
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  // Eurozone — extend as needed.
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
  GR: "EUR",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
}

export function defaultCurrencyForCountry(countryCode: string): string {
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? "USD"
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
  /**
   * Daily base rate in whatever currency the calculation runs in.
   * Field name kept as `baseRateUSD` for backwards compatibility with
   * the original USD-only spec — the math is currency-agnostic.
   */
  baseRateUSD: number
  isTravelDay: boolean
  breakfastProvided: boolean
  lunchProvided: boolean
  dinnerProvided: boolean
  /**
   * Optional manual override. When set (>= 0), the calculator skips the
   * scaled-base − deductions math and uses this number directly. Used by
   * the per-day "edit amount" feature so an employee can claim a different
   * amount than the policy default for a specific day.
   */
  amountOverride?: number | null
}

/** Round to 2 decimal places (avoid floating-point drift for storage). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculateDayTotal(d: DayInputs): number {
  if (typeof d.amountOverride === "number" && d.amountOverride >= 0) {
    return round2(d.amountOverride)
  }
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
 * Effective rate table for an organisation, optionally scoped to a cost
 * center. Resolution order (each step layered on top of the previous):
 *   1. DEFAULT_RATES (built-in)
 *   2. Org-wide AdminConfig override
 *   3. Cost-center-specific AdminConfig override
 *
 * So Vietnam-office admins can set $80/day for Japan without affecting
 * the Indonesia office's $85/day. Per-country merge — admins only need
 * to specify the entries they want to change.
 */
export async function getRateTable(
  organizationId: string,
  costCenterId?: string | null
): Promise<RateTable> {
  // Pull both rows in parallel so we can layer them deterministically.
  // Reading the rows directly (not through getConfig's fallback chain)
  // avoids applying the org-wide layer twice when no CC row exists.
  const [orgWideRow, ccRow] = await Promise.all([
    prisma.adminConfig.findFirst({
      where: { key: PER_DIEM_RATES_KEY, organizationId, costCenterId: null },
      select: { value: true },
    }),
    costCenterId
      ? prisma.adminConfig.findFirst({
          where: { key: PER_DIEM_RATES_KEY, organizationId, costCenterId },
          select: { value: true },
        })
      : Promise.resolve(null),
  ])

  const merged: RateTable = { ...DEFAULT_RATES }
  for (const layer of [orgWideRow?.value, ccRow?.value] as Array<RateTable | null | undefined>) {
    if (!layer || typeof layer !== "object") continue
    for (const [cc, entry] of Object.entries(layer)) {
      if (!entry || typeof entry !== "object") continue
      merged[cc.toUpperCase()] = { ...merged[cc.toUpperCase()], ...entry }
    }
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
