/**
 * Per-organisation leave policy resolution.
 *
 * Persisted in the existing `AdminConfig` table under key
 * `leavePolicy.overtimePolicy`. Falls back to country-specific defaults
 * (Vietnam, Indonesia, Singapore today; everywhere else uses the
 * "international common" 1.5/2.0/3.0 trio).
 */

import { prisma } from "@/lib/prisma"
import { getConfig } from "@/lib/config"

export interface OvertimePolicy {
  weekday: number
  weekend: number
  publicHoliday: number
  lieuExpiryMonths: number
}

const FALLBACK_BY_COUNTRY: Record<string, OvertimePolicy> = {
  // Vietnam Labour Code Article 98
  VN: { weekday: 1.5, weekend: 2.0, publicHoliday: 3.0, lieuExpiryMonths: 6 },
  // Indonesia Manpower Act / Govt Reg 35-2021. Simplified — first hour ×1.5,
  // remainder ×2 on weekdays; we average to ×1.75 because we currently
  // model OT as a single multiplier per day.
  ID: { weekday: 1.75, weekend: 2.0, publicHoliday: 3.0, lieuExpiryMonths: 12 },
  // Singapore MoM. Statutory minimum ×1.5 weekdays, weekend/PH ×2.
  SG: { weekday: 1.5, weekend: 2.0, publicHoliday: 2.0, lieuExpiryMonths: 6 },
  // Malaysia EA 1955.
  MY: { weekday: 1.5, weekend: 2.0, publicHoliday: 3.0, lieuExpiryMonths: 6 },
}

const DEFAULT: OvertimePolicy = { weekday: 1.5, weekend: 2.0, publicHoliday: 3.0, lieuExpiryMonths: 6 }

export const POLICY_CONFIG_KEY = "leavePolicy.overtimePolicy"
export const CARRYOVER_CONFIG_KEY = "leavePolicy.carryover"

export interface CarryoverPolicy {
  enabled: boolean
  /**
   * Maximum number of unused days that can carry from the previous calendar
   * year into the current one. Per leave type. 0 means no carryover.
   */
  maxDaysCarried: number
  /**
   * Day of the year (MM-DD) after which carried-over days are forfeited.
   * Common pattern: "03-31" for March 31. If null, carryover lasts the
   * whole calendar year.
   */
  expiresOnMonthDay: string | null
  /**
   * Restrict carryover to specific leave-type codes. Empty array means
   * "applies to all paid leave types".
   */
  applyToCodes: string[]
}

const CARRYOVER_DEFAULT: CarryoverPolicy = {
  enabled: false,
  maxDaysCarried: 0,
  expiresOnMonthDay: null,
  applyToCodes: [],
}

export async function getCarryoverPolicy(organizationId: string): Promise<CarryoverPolicy> {
  const stored = (await getConfig(prisma, CARRYOVER_CONFIG_KEY, organizationId)) as Partial<CarryoverPolicy> | null
  if (!stored || typeof stored !== "object") return CARRYOVER_DEFAULT
  return {
    enabled: !!stored.enabled,
    maxDaysCarried: typeof stored.maxDaysCarried === "number" ? stored.maxDaysCarried : 0,
    expiresOnMonthDay:
      typeof stored.expiresOnMonthDay === "string" && /^\d{2}-\d{2}$/.test(stored.expiresOnMonthDay)
        ? stored.expiresOnMonthDay
        : null,
    applyToCodes: Array.isArray(stored.applyToCodes) ? stored.applyToCodes.filter((s): s is string => typeof s === "string") : [],
  }
}

/**
 * Resolve the additional days carried over for a given leave type, given
 * unused days from the previous year and the org's carryover policy.
 *
 * Returns 0 if:
 *  - policy is disabled
 *  - the leave type is excluded from `applyToCodes` (when non-empty)
 *  - we're past the carryover-expiry date
 */
export function resolveCarriedDays(
  policy: CarryoverPolicy,
  leaveTypeCode: string,
  unusedLastYear: number,
  now: Date = new Date()
): number {
  if (!policy.enabled || policy.maxDaysCarried <= 0) return 0
  if (policy.applyToCodes.length > 0 && !policy.applyToCodes.includes(leaveTypeCode)) return 0
  if (policy.expiresOnMonthDay) {
    const [m, d] = policy.expiresOnMonthDay.split("-").map(Number)
    const expiry = new Date(Date.UTC(now.getUTCFullYear(), m - 1, d, 23, 59, 59))
    if (now > expiry) return 0
  }
  return Math.max(0, Math.min(policy.maxDaysCarried, unusedLastYear))
}

/**
 * Resolve the OT policy for an org:
 *   1. Org-specific AdminConfig row (admin can override via Policy tab)
 *   2. Country-specific fallback table
 *   3. International default (×1.5 / ×2 / ×3, 6-month expiry)
 */
export async function getOvertimePolicy(organizationId: string): Promise<OvertimePolicy> {
  const stored = (await getConfig(prisma, POLICY_CONFIG_KEY, organizationId)) as Partial<OvertimePolicy> | null
  if (stored && typeof stored === "object") {
    return {
      weekday: typeof stored.weekday === "number" ? stored.weekday : DEFAULT.weekday,
      weekend: typeof stored.weekend === "number" ? stored.weekend : DEFAULT.weekend,
      publicHoliday: typeof stored.publicHoliday === "number" ? stored.publicHoliday : DEFAULT.publicHoliday,
      lieuExpiryMonths: typeof stored.lieuExpiryMonths === "number" ? stored.lieuExpiryMonths : DEFAULT.lieuExpiryMonths,
    }
  }
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { countryCode: true },
  })
  return FALLBACK_BY_COUNTRY[org?.countryCode ?? ""] ?? DEFAULT
}
