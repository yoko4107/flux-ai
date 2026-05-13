import type { PrismaClient } from "@/generated/prisma"

type AdminConfigRow = {
  key: string
  value: unknown
  [key: string]: unknown
}

/**
 * Merge CC-specific rows over org-wide rows.
 * CC row wins for the same key; org-wide row is the fallback.
 */
export function mergeConfigs<T extends AdminConfigRow>(
  ccRows: T[],
  orgRows: T[]
): T[] {
  const merged = new Map<string, T>()
  for (const row of orgRows) merged.set(row.key, row)
  for (const row of ccRows) merged.set(row.key, row) // overwrites org-wide
  return Array.from(merged.values())
}

/**
 * Verify costCenterId belongs to orgId.
 * Returns the CostCenter if valid, null if ownership fails.
 * Always returns a truthy-ish sentinel for null costCenterId (org-wide is always valid).
 */
export async function validateCCOwnership(
  prisma: PrismaClient,
  costCenterId: string | null,
  orgId: string | null
): Promise<{ id: string } | null> {
  if (!costCenterId) return { id: "" } // null = org-wide, always allowed
  return prisma.costCenter.findFirst({
    where: { id: costCenterId, organizationId: orgId ?? undefined },
    select: { id: true },
  })
}
