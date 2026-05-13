import type { PrismaClient } from "@/generated/prisma"
import { getConfig } from "@/lib/config"

/**
 * Resolve the approval committee for a given org + cost center.
 * Three-tier precedence via getConfig:
 *   1. CC-specific committee (when costCenterId given)
 *   2. Org-wide committee fallback
 *   3. Global fallback
 */
export async function resolveCommittee(
  prisma: PrismaClient,
  orgId: string | null | undefined,
  costCenterId: string | null | undefined,
): Promise<{ mode?: string; approvers?: string[] } | null> {
  const value = (await getConfig(
    prisma,
    "approvalCommittee",
    orgId,
    costCenterId,
  )) as { mode?: string; approvers?: string[] } | null
  return value ?? null
}

/**
 * Build ApprovalStep create-data from a flat list of approver user IDs.
 * Maps index position to the `order` field.
 */
export function buildApprovalSteps(
  requestId: string,
  approvers: string[],
): { requestId: string; approverId: string; order: number }[] {
  return approvers.map((userId, idx) => ({
    requestId,
    approverId: userId,
    order: idx,
  }))
}

/**
 * Determine which approvers should be notified on submission.
 * - parallel: all approvers notified simultaneously
 * - sequential: only the first approver (order 0)
 */
export function selectNotifyTargets(
  mode: string,
  steps: { approverId: string }[],
): string[] {
  if (steps.length === 0) return []
  if (mode === "parallel") {
    return steps.map((s) => s.approverId)
  }
  return [steps[0].approverId]
}
