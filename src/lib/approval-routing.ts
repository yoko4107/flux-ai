import { prisma } from "@/lib/prisma"

/**
 * Filter a configured approval committee down to the members appropriate
 * for a requester based on regional cost centers.
 *
 * Rules:
 *   1. If the requester has no cost center assigned, the committee is
 *      returned unchanged (preserves pre-cost-center behaviour).
 *   2. Otherwise, members are kept when their user is either
 *        - assigned to the *same* cost center as the requester, or
 *        - has no cost center (treated as an org-wide approver, e.g. a
 *          finance director who signs off on every region).
 *   3. If filtering leaves the committee empty, fall back to the full
 *      committee — better to route to *someone* than block submission
 *      entirely. Callers may also log a warning to surface mis-config.
 *
 * Order is preserved; the `order` field on each member stays untouched
 * even if intermediate members are dropped (sort-only key).
 */
export type CommitteeMember = { userId: string; order: number }

export async function filterCommitteeForRequester(
  requesterId: string,
  members: CommitteeMember[]
): Promise<{ members: CommitteeMember[]; scoped: boolean; reason?: string }> {
  if (members.length === 0) return { members, scoped: false }

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { costCenterId: true },
  })
  const requesterCC = requester?.costCenterId ?? null
  if (!requesterCC) {
    return { members, scoped: false, reason: "requester has no cost center" }
  }

  const memberUsers = await prisma.user.findMany({
    where: { id: { in: members.map((m) => m.userId) } },
    select: { id: true, costCenterId: true },
  })
  const ccById = new Map(memberUsers.map((u) => [u.id, u.costCenterId]))

  const scoped = members.filter((m) => {
    const cc = ccById.get(m.userId)
    return cc === requesterCC || cc == null
  })

  if (scoped.length === 0) {
    // Nothing matched — return full committee as a safety net.
    return { members, scoped: false, reason: "no committee members in requester's cost center" }
  }

  return { members: scoped, scoped: true }
}
