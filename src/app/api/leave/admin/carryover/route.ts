import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCarryoverPolicy, CARRYOVER_CONFIG_KEY } from "@/lib/leave-policy"

// GET  /api/leave/admin/carryover  — current org carryover policy
// PUT  /api/leave/admin/carryover  — admin upserts the org-specific policy
// DELETE /api/leave/admin/carryover — disable / remove (resets to default off)

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  const policy = await getCarryoverPolicy(session.user.organizationId)
  return NextResponse.json({ policy })
}

const Body = z.object({
  enabled: z.boolean(),
  maxDaysCarried: z.number().min(0).max(100),
  expiresOnMonthDay: z.string().regex(/^\d{2}-\d{2}$/).nullable(),
  applyToCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/)).max(40).default([]),
})

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  await prisma.adminConfig.upsert({
    where: { key_organizationId: { key: CARRYOVER_CONFIG_KEY, organizationId: session.user.organizationId } },
    update: { value: parsed.data, updatedById: session.user.id },
    create: { key: CARRYOVER_CONFIG_KEY, organizationId: session.user.organizationId, value: parsed.data, updatedById: session.user.id },
  })
  return NextResponse.json({ ok: true, policy: parsed.data })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  await prisma.adminConfig.deleteMany({
    where: { key: CARRYOVER_CONFIG_KEY, organizationId: session.user.organizationId },
  })
  return NextResponse.json({ ok: true })
}
