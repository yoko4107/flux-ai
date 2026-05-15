import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { mergeConfigs, validateCCOwnership } from "@/lib/config-scoping"
import { z } from "zod"

const VALID_KEYS = [
  "approvalCommittee",
  "submissionDeadline",
  "approvalDeadline",
  "allowedCategories",
  "maxAmountPerCategory",
  "requireReceiptAbove",
  "notificationChannels",
  "resubmitBehavior",
  "financeOfficer",
  "maxAmountPerRequest",
  "paymentDeadline",
  "approvalThreshold",
  "customCategories",
] as const

const valueSchemas: Record<string, z.ZodTypeAny> = {
  approvalCommittee: z.object({
    mode: z.enum(["sequential", "parallel"] as const),
    approvers: z.array(z.string()),
  }),
  submissionDeadline: z.number().int().min(1).max(31),
  approvalDeadline: z.number().int().min(1),
  allowedCategories: z.array(z.enum(["TRAVEL", "MEALS", "SUPPLIES", "ACCOMMODATION", "COMMUNICATION", "TRAINING", "ENTERTAINMENT", "MEETING", "EQUIPMENT", "PRINTING", "SOFTWARE", "OTHER"] as const)),
  maxAmountPerCategory: z.record(z.string(), z.number()),
  requireReceiptAbove: z.number().min(0),
  notificationChannels: z.object({
    email: z.boolean(),
    whatsapp: z.boolean(),
    inApp: z.boolean(),
  }),
  resubmitBehavior: z.enum(["reset", "continue"] as const),
  financeOfficer: z.object({ userId: z.string() }).nullable(),
  maxAmountPerRequest: z.number().min(0),
  paymentDeadline: z.number().int().min(1),
  approvalThreshold: z.number().min(0),
  customCategories: z.array(
    z.object({
      name: z.string().min(1).max(60),
      code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/),
      enabled: z.boolean(),
    })
  ),
}

// Resolve scope: SUPER_ADMIN may target any org or the global bucket (null);
// ADMIN is pinned to their own organization.
function resolveScope(session: { user: { role: string; organizationId?: string | null } }, raw: string | null): { orgId: string | null } | { error: string; status: number } {
  const role = session.user.role
  if (role === "SUPER_ADMIN") {
    if (raw === null || raw === "" || raw === undefined) return { orgId: null } // global defaults
    if (raw === "global") return { orgId: null }
    return { orgId: raw }
  }
  if (role === "ADMIN") {
    const own = session.user.organizationId ?? null
    if (!own) return { error: "Admin has no organization", status: 400 }
    return { orgId: own }
  }
  return { error: "Forbidden", status: 403 }
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const scope = resolveScope(session, searchParams.get("organizationId"))
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status })

  const costCenterId = searchParams.get("costCenterId") || null

  // Org-wide rows (always fetched as fallback)
  const orgConfigs = await prisma.adminConfig.findMany({
    where: { organizationId: scope.orgId, costCenterId: null },
    include: { updatedBy: { select: { id: true, name: true } } },
  })

  // CC-specific rows (empty array if no costCenterId)
  const ccConfigs: typeof orgConfigs = costCenterId
    ? await prisma.adminConfig.findMany({
        where: { organizationId: scope.orgId, costCenterId },
        include: { updatedBy: { select: { id: true, name: true } } },
      })
    : []

  // Merge: CC-specific takes precedence
  const configs = mergeConfigs(ccConfigs, orgConfigs) as typeof orgConfigs

  const result: Record<string, unknown> = {}
  const meta: Record<string, { updatedAt: string; updatedBy: { id: string; name: string | null } | null }> = {}
  for (const c of configs) {
    result[c.key] = c.value
    meta[c.key] = {
      updatedAt: c.updatedAt.toISOString(),
      updatedBy: c.updatedBy ?? null,
    }
  }

  // Fetch approvalCommittee from new relational model (overrides any AdminConfig row)
  const committee = await prisma.approvalCommittee.findFirst({
    where: {
      organizationId: scope.orgId ?? null,
      costCenterId: costCenterId ?? null,
    },
    include: { members: { orderBy: { order: "asc" } } },
  })
  if (committee) {
    result["approvalCommittee"] = {
      mode: committee.mode,
      approvers: committee.members.map((m: { userId: string }) => m.userId),
    }
    meta["approvalCommittee"] = {
      updatedAt: committee.updatedAt.toISOString(),
      updatedBy: null,
    }
  }

  return NextResponse.json({ configs: result, meta, scope: { organizationId: scope.orgId, costCenterId } })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = z.object({
    key: z.string(),
    value: z.unknown(),
    organizationId: z.string().nullable().optional(),
    costCenterId: z.string().nullable().optional(),
  }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Missing key or value" }, { status: 400 })

  const { key, value, organizationId, costCenterId } = parsed.data

  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: `Invalid key: ${key}` }, { status: 400 })
  }

  const schema = valueSchemas[key]
  const valueResult = schema.safeParse(value)
  if (!valueResult.success) {
    return NextResponse.json({ error: "Invalid value", details: valueResult.error.issues }, { status: 400 })
  }

  const scope = resolveScope(session, organizationId === undefined ? null : organizationId)
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status })

  const ccId = costCenterId ?? null
  if (ccId) {
    const owned = await validateCCOwnership(prisma, ccId, scope.orgId)
    if (!owned) {
      return NextResponse.json({ error: "Cost center not found or access denied" }, { status: 403 })
    }
  }

  // Intercept approvalCommittee — write to new relational model instead of AdminConfig
  if (key === "approvalCommittee") {
    const { mode, approvers } = valueResult.data as { mode: "sequential" | "parallel"; approvers: string[] }

    // Upsert the committee row (findFirst + create/update because nullable unique keys
    // aren't supported by Prisma's upsert where compound input)
    let committee = await prisma.approvalCommittee.findFirst({
      where: { organizationId: scope.orgId ?? null, costCenterId: ccId ?? null },
    })
    if (committee) {
      committee = await prisma.approvalCommittee.update({
        where: { id: committee.id },
        data: { mode },
      })
    } else {
      committee = await prisma.approvalCommittee.create({
        data: {
          organizationId: scope.orgId ?? null,
          costCenterId: ccId ?? null,
          mode,
        },
      })
    }

    // Replace members: delete all then recreate in order
    await prisma.approvalCommitteeMember.deleteMany({ where: { committeeId: committee.id } })
    await prisma.approvalCommitteeMember.createMany({
      data: approvers.map((userId, idx) => ({
        committeeId: committee.id,
        userId,
        order: idx,
      })),
    })

    await writeAuditLog(prisma, {
      actorId: session.user.id,
      action: "CONFIG_UPDATED",
      details: { key, organizationId: scope.orgId, costCenterId: ccId, newValue: { mode, approvers } },
    })

    return NextResponse.json({ config: { key, value: { mode, approvers }, updatedAt: committee.updatedAt }, scope: { organizationId: scope.orgId, costCenterId: ccId } })
  }

  const existing = await prisma.adminConfig.findUnique({
    where: { key_organizationId_costCenterId: { key, organizationId: scope.orgId ?? null as unknown as string, costCenterId: (ccId ?? null) as unknown as string } },
  }).catch(() => null)
  const oldValue = existing?.value ?? null

  const updated = await prisma.adminConfig.upsert({
    where: { key_organizationId_costCenterId: { key, organizationId: scope.orgId ?? null as unknown as string, costCenterId: (ccId ?? null) as unknown as string } },
    create: {
      key,
      organizationId: scope.orgId,
      costCenterId: ccId,
      value: valueResult.data as Parameters<typeof prisma.adminConfig.create>[0]["data"]["value"],
      updatedById: session.user.id,
    },
    update: {
      value: valueResult.data as Parameters<typeof prisma.adminConfig.update>[0]["data"]["value"],
      updatedById: session.user.id,
    },
    include: { updatedBy: { select: { id: true, name: true } } },
  })

  await writeAuditLog(prisma, {
    actorId: session.user.id,
    action: "CONFIG_UPDATED",
    details: { key, organizationId: scope.orgId, costCenterId: ccId, oldValue, newValue: valueResult.data },
  })

  return NextResponse.json({ config: updated, scope: { organizationId: scope.orgId, costCenterId: ccId } })
}
