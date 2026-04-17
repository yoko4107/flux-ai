import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
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

  const configs = await prisma.adminConfig.findMany({
    where: { organizationId: scope.orgId },
    include: { updatedBy: { select: { id: true, name: true } } },
  })

  const result: Record<string, unknown> = {}
  const meta: Record<string, { updatedAt: string; updatedBy: { id: string; name: string | null } | null }> = {}
  for (const c of configs) {
    result[c.key] = c.value
    meta[c.key] = {
      updatedAt: c.updatedAt.toISOString(),
      updatedBy: c.updatedBy ?? null,
    }
  }

  return NextResponse.json({ configs: result, meta, scope: { organizationId: scope.orgId } })
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
  }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Missing key or value" }, { status: 400 })

  const { key, value, organizationId } = parsed.data

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

  const existing = await prisma.adminConfig.findUnique({
    where: { key_organizationId: { key, organizationId: scope.orgId ?? null as unknown as string } },
  }).catch(() => null)
  const oldValue = existing?.value ?? null

  const updated = await prisma.adminConfig.upsert({
    where: { key_organizationId: { key, organizationId: scope.orgId ?? null as unknown as string } },
    create: {
      key,
      organizationId: scope.orgId,
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
    details: { key, organizationId: scope.orgId, oldValue, newValue: valueResult.data },
  })

  return NextResponse.json({ config: updated, scope: { organizationId: scope.orgId } })
}
