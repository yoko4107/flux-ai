import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getAllConfigs } from "@/lib/config"
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

// Value validators per key
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

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const configs = await prisma.adminConfig.findMany({
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

  return NextResponse.json({ configs: result, meta })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only Super Admin can modify global configuration" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = z.object({ key: z.string(), value: z.unknown() }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 })
  }

  const { key, value } = parsed.data

  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: `Invalid key: ${key}` }, { status: 400 })
  }

  const schema = valueSchemas[key]
  const valueResult = schema.safeParse(value)
  if (!valueResult.success) {
    return NextResponse.json({ error: "Invalid value", details: valueResult.error.issues }, { status: 400 })
  }

  // Get old value for audit log
  const existing = await prisma.adminConfig.findUnique({ where: { key } })
  const oldValue = existing?.value ?? null

  const updated = await prisma.adminConfig.upsert({
    where: { key },
    create: {
      key,
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
    details: { key, oldValue, newValue: valueResult.data },
  })

  return NextResponse.json({ config: updated })
}
