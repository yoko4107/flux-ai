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
