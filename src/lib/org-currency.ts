import { prisma } from "@/lib/prisma"

/**
 * Resolve the base currency for an organization. Falls back to IDR when
 * the user has no organization (e.g. SUPER_ADMIN) or the org is missing.
 */
export async function getOrgBaseCurrency(orgId: string | null | undefined): Promise<string> {
  if (!orgId) return "IDR"
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { baseCurrency: true },
  })
  return org?.baseCurrency ?? "IDR"
}

/**
 * Resolve the payout currency for a user's *reimbursement* requests.
 * Per-cost-center precedence:
 *   1. The user's assigned CostCenter.currency (e.g. Indonesia CC → IDR,
 *      Vietnam CC → VND)
 *   2. Organization.baseCurrency
 *   3. Hard fallback "IDR" (legacy default)
 *
 * Note: Per-diem requests can override the payout currency on a per-trip
 * basis via `PerDiemRequest.payoutCurrency` — that path bypasses this
 * helper intentionally.
 */
export async function getReimbursementCurrencyForUser(
  userId: string
): Promise<{ currency: string; source: "cost-center" | "organization" | "default"; costCenterId: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      costCenterId: true,
      costCenter: { select: { id: true, currency: true, active: true } },
      organization: { select: { baseCurrency: true } },
    },
  })
  if (user?.costCenter?.active && user.costCenter.currency) {
    return { currency: user.costCenter.currency, source: "cost-center", costCenterId: user.costCenter.id }
  }
  if (user?.organization?.baseCurrency) {
    return { currency: user.organization.baseCurrency, source: "organization", costCenterId: null }
  }
  return { currency: "IDR", source: "default", costCenterId: null }
}
