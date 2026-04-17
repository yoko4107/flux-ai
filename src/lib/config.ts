import type { PrismaClient } from "@/generated/prisma"

/**
 * Resolve a single config value. If `orgId` is provided, the org-specific
 * row wins; otherwise fall back to the global row (organizationId = null).
 */
export async function getConfig(prisma: PrismaClient, key: string, orgId?: string | null) {
  if (orgId) {
    const scoped = await prisma.adminConfig.findFirst({
      where: { key, organizationId: orgId },
    })
    if (scoped) return scoped.value
  }
  const global = await prisma.adminConfig.findFirst({
    where: { key, organizationId: null },
  })
  return global?.value ?? null
}

/**
 * Merged view: org-specific values override globals for the same key.
 * Pass `orgId = null/undefined` to get only globals (legacy callers).
 */
export async function getAllConfigs(prisma: PrismaClient, orgId?: string | null) {
  const rows = await prisma.adminConfig.findMany({
    where: orgId
      ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
      : { organizationId: null },
  })
  const globals: Record<string, unknown> = {}
  const scoped: Record<string, unknown> = {}
  for (const r of rows) {
    if (r.organizationId === null) globals[r.key] = r.value
    else scoped[r.key] = r.value
  }
  return { ...globals, ...scoped }
}
