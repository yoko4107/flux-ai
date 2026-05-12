import type { PrismaClient } from "@/generated/prisma"

/**
 * Resolve a single config value with three-tier precedence:
 *   1. CC-specific row (key, orgId, costCenterId)   — when costCenterId given
 *   2. Org-wide row     (key, orgId, costCenterId=null)
 *   3. Global row       (key, orgId=null,  costCenterId=null)
 *
 * Callers can pass costCenterId to opt into per-CC resolution; omitting
 * it preserves the original two-tier behaviour.
 */
export async function getConfig(
  prisma: PrismaClient,
  key: string,
  orgId?: string | null,
  costCenterId?: string | null
) {
  if (orgId && costCenterId) {
    const cc = await prisma.adminConfig.findFirst({
      where: { key, organizationId: orgId, costCenterId },
    })
    if (cc) return cc.value
  }
  if (orgId) {
    const scoped = await prisma.adminConfig.findFirst({
      where: { key, organizationId: orgId, costCenterId: null },
    })
    if (scoped) return scoped.value
  }
  const global = await prisma.adminConfig.findFirst({
    where: { key, organizationId: null, costCenterId: null },
  })
  return global?.value ?? null
}

/**
 * Merged view: org-specific values override globals for the same key.
 * Pass `orgId = null/undefined` to get only globals (legacy callers).
 */
export async function getAllConfigs(prisma: PrismaClient, orgId?: string | null) {
  // Only includes org-wide + global rows. CC-specific rows are intentionally
  // excluded — call sites that care about CC resolution should use
  // getConfig(…, costCenterId) per-key.
  const rows = await prisma.adminConfig.findMany({
    where: orgId
      ? {
          OR: [
            { organizationId: orgId, costCenterId: null },
            { organizationId: null, costCenterId: null },
          ],
        }
      : { organizationId: null, costCenterId: null },
  })
  const globals: Record<string, unknown> = {}
  const scoped: Record<string, unknown> = {}
  for (const r of rows) {
    if (r.organizationId === null) globals[r.key] = r.value
    else scoped[r.key] = r.value
  }
  return { ...globals, ...scoped }
}
