import { prisma } from "@/lib/prisma"

/**
 * Resolve the cost-center scope for a FINANCE/APPROVER viewer.
 *
 * Returns a Prisma `where` fragment that callers spread into their query:
 *   - { } if the viewer has no cost center (org-wide; e.g. CFO)
 *   - { employee: { costCenterId } } when the viewer is regional
 *
 * ADMIN / SUPER_ADMIN are always treated as org-wide here — admin
 * scoping happens separately at the organization layer.
 */
export async function getCostCenterScope(viewerId: string): Promise<{
  costCenterId: string | null
  reimbursementWhere: Record<string, unknown>
}> {
  const v = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { role: true, costCenterId: true },
  })
  if (!v) return { costCenterId: null, reimbursementWhere: {} }
  if (v.role === "ADMIN" || v.role === "SUPER_ADMIN") {
    return { costCenterId: null, reimbursementWhere: {} }
  }
  if (!v.costCenterId) {
    return { costCenterId: null, reimbursementWhere: {} }
  }
  return {
    costCenterId: v.costCenterId,
    reimbursementWhere: { employee: { costCenterId: v.costCenterId } },
  }
}
