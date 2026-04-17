import type { PrismaClient } from "@/generated/prisma"
import { Prisma } from "@/generated/prisma"

interface AuditLogParams {
  requestId?: string | null
  actorId: string
  action: string
  details?: Record<string, unknown>
}

export async function writeAuditLog(
  prisma: PrismaClient,
  { requestId, actorId, action, details }: AuditLogParams
) {
  return prisma.auditLog.create({
    data: {
      requestId: requestId ?? null,
      actorId,
      action,
      details: details !== undefined ? (details as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  })
}
